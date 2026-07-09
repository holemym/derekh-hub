"use server";

/**
 * Money server actions (ROADMAP M4) — per-case invoices + expenses, and the
 * generated invoice PDF.
 *
 * Every action runs under the RLS-scoped server client (@supabase/ssr), i.e.
 * the logged-in staff session, so the invoices / expenses / documents policies
 * (0002/0003) govern them:
 *   • staff → INSERT / UPDATE invoices (add, advance draft→sent→paid, void).
 *   • staff → INSERT expenses.
 *   • staff → Storage write + documents INSERT (generated invoice PDF).
 *   • staff → INSERT activity_log (append-only audit).
 * A non-staff/anon caller is invisible to RLS and every call fails safe.
 *
 * Money is stored in integer CENTS; the client sends a decimal amount which we
 * parse to cents here. Currency is EUR by default.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildInvoicePdf } from "@/lib/documents/invoice";
import { createPaymentLink, stripeConfigured } from "@/lib/stripe";
import type { InvoiceStatus } from "@/lib/types";
import type {
  InvoiceInsert,
  InvoiceRow,
  ExpenseInsert,
  DocumentInsert,
  GeneratedFrom,
  ActivityLogInsert,
  CaseRow,
  CaseContactRow,
  ContactRow,
} from "../../../../../../db/types";

const BUCKET = "case-docs";
const INVOICE_TEMPLATE_KEY = "invoice";

export interface MoneyResult {
  ok: boolean;
  error?: string;
}

/** draft → sent → paid (the one-step advance). void is a terminal side-state. */
const INVOICE_NEXT: Record<"draft" | "sent", InvoiceStatus> = {
  draft: "sent",
  sent: "paid",
};

/** Parse a decimal amount string ("1.234,56" / "1234.56") to integer cents. */
function toCents(raw: FormDataEntryValue | null | undefined): number | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  // Accept both comma and dot decimals; strip spaces/currency symbols.
  s = s.replace(/[^\d.,-]/g, "");
  // If both separators present, assume the LAST one is the decimal sep.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("");
    s = s.replace(dec, ".");
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }
  const value = Number(s);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function nn(v: FormDataEntryValue | null | undefined): string | null {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

function isInvoiceStatus(v: unknown): v is InvoiceStatus {
  return v === "draft" || v === "sent" || v === "paid" || v === "void";
}

/** Denormalized acting-staff name for audit rows (+ actor uid). */
async function actor(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{ id: string | null; label: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { id: null, label: null };
  const { data: staff } = await supabase
    .from("staff")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();
  return { id: user.id, label: (staff as { name: string } | null)?.name ?? null };
}

/**
 * Suggest the next invoice number for a case: "INV-YYYY-NNNN". The count is a
 * simple global running number across all invoices this staff can see (RLS) —
 * good enough for a small operation; the operator can override the value.
 */
export async function suggestInvoiceNumber(): Promise<{ number: string }> {
  const supabase = await createSupabaseServerClient();
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const seq = (count ?? 0) + 1;
  return { number: `INV-${year}-${String(seq).padStart(4, "0")}` };
}

/**
 * Create an invoice for a case. Amount comes as a decimal string → cents.
 * A 'sent'/'paid' invoice records issued_at; 'paid' also records paid_at.
 */
export async function addInvoice(formData: FormData): Promise<MoneyResult> {
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return { ok: false, error: "Missing case id." };

  const cents = toCents(formData.get("amount"));
  if (cents === null) return { ok: false, error: "Enter a valid amount." };

  const statusRaw = String(formData.get("status") ?? "draft");
  const status: InvoiceStatus = isInvoiceStatus(statusRaw) ? statusRaw : "draft";
  const now = new Date().toISOString();

  const payload: InvoiceInsert = {
    case_id: caseId,
    number: nn(formData.get("number")),
    amount_cents: cents,
    currency: "EUR",
    status,
    issued_at: status === "sent" || status === "paid" ? now : null,
    paid_at: status === "paid" ? now : null,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("invoices").insert(payload as never);
  if (error) return { ok: false, error: `Could not add invoice: ${error.message}` };

  const a = await actor(supabase);
  const log: ActivityLogInsert = {
    case_id: caseId,
    actor: a.id,
    actor_label: a.label,
    action: "invoice_added",
    detail: { amount_cents: cents, status },
  };
  await supabase.from("activity_log").insert(log as never);

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/money");
  return { ok: true };
}

/** Advance an invoice one step: draft → sent → paid (sets issued_at/paid_at). */
export async function advanceInvoice(input: {
  caseId: string;
  invoiceId: string;
}): Promise<MoneyResult> {
  const { caseId, invoiceId } = input;
  if (!caseId || !invoiceId) return { ok: false, error: "Missing invoice." };

  const supabase = await createSupabaseServerClient();
  const { data, error: readErr } = await supabase
    .from("invoices")
    .select("status, issued_at")
    .eq("id", invoiceId)
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { ok: false, error: `Could not read invoice: ${readErr.message}` };
  if (!data) return { ok: false, error: "Invoice not found." };

  const from = (data as { status: InvoiceStatus; issued_at: string | null }).status;
  if (from === "paid") return { ok: false, error: "Invoice is already paid." };
  if (from === "void") return { ok: false, error: "Invoice is void." };
  const to = INVOICE_NEXT[from];
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { status: to };
  if (to === "sent") patch.issued_at = (data as { issued_at: string | null }).issued_at ?? now;
  if (to === "paid") patch.paid_at = now;

  const { error: updErr } = await supabase
    .from("invoices")
    .update(patch as never)
    .eq("id", invoiceId)
    .eq("case_id", caseId)
    .is("deleted_at", null);
  if (updErr) return { ok: false, error: `Could not advance invoice: ${updErr.message}` };

  const a = await actor(supabase);
  const log: ActivityLogInsert = {
    case_id: caseId,
    actor: a.id,
    actor_label: a.label,
    action: "invoice_status_changed",
    detail: { invoiceId, from, to },
  };
  await supabase.from("activity_log").insert(log as never);

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/money");
  return { ok: true };
}

/**
 * Create (or return the existing) Stripe payment link for an invoice (M4.5).
 * Env-gated on STRIPE_SECRET_KEY. The permanent URL is stored in stripe_ref;
 * the /api/stripe/webhook reconcile marks the invoice paid on checkout.
 */
export async function createInvoicePaymentLink(input: {
  caseId: string;
  invoiceId: string;
}): Promise<MoneyResult & { url?: string }> {
  const { caseId, invoiceId } = input;
  if (!caseId || !invoiceId) return { ok: false, error: "Missing invoice." };
  if (!stripeConfigured()) return { ok: false, error: "Stripe is not configured." };

  const supabase = await createSupabaseServerClient();
  const [{ data: inv, error: invErr }, { data: kase }] = await Promise.all([
    supabase
      .from("invoices")
      .select("number, amount_cents, currency, status, stripe_ref")
      .eq("id", invoiceId)
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("cases")
      .select("secular_first, secular_last")
      .eq("id", caseId)
      .maybeSingle(),
  ]);
  if (invErr) return { ok: false, error: `Could not read invoice: ${invErr.message}` };
  if (!inv) return { ok: false, error: "Invoice not found." };

  const row = inv as Pick<
    InvoiceRow,
    "number" | "amount_cents" | "currency" | "status" | "stripe_ref"
  >;
  if (row.status === "paid") return { ok: false, error: "Invoice is already paid." };
  if (row.status === "void") return { ok: false, error: "Invoice is void." };
  if (row.stripe_ref) return { ok: true, url: row.stripe_ref };

  const c = (kase ?? {}) as Partial<Pick<CaseRow, "secular_first" | "secular_last">>;
  const who = [c.secular_first, c.secular_last].filter(Boolean).join(" ").trim();
  const description = `Invoice ${row.number ?? invoiceId.slice(0, 8)} — burial & repatriation service${who ? ` (${who})` : ""}`;

  const link = await createPaymentLink({
    invoiceId,
    caseId,
    amountCents: row.amount_cents ?? 0,
    currency: row.currency ?? "EUR",
    description,
  });
  if (!link.ok || !link.url) return { ok: false, error: link.error };

  const { error: updErr } = await supabase
    .from("invoices")
    .update({ stripe_ref: link.url } as never)
    .eq("id", invoiceId)
    .eq("case_id", caseId);
  if (updErr) return { ok: false, error: `Could not save the link: ${updErr.message}` };

  const a = await actor(supabase);
  const log: ActivityLogInsert = {
    case_id: caseId,
    actor: a.id,
    actor_label: a.label,
    action: "payment_link_created",
    detail: { invoiceId },
  };
  await supabase.from("activity_log").insert(log as never);

  revalidatePath(`/cases/${caseId}`);
  return { ok: true, url: link.url };
}

/** Mark an invoice void (terminal). */
export async function voidInvoice(input: {
  caseId: string;
  invoiceId: string;
}): Promise<MoneyResult> {
  const { caseId, invoiceId } = input;
  if (!caseId || !invoiceId) return { ok: false, error: "Missing invoice." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "void" } as never)
    .eq("id", invoiceId)
    .eq("case_id", caseId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: `Could not void invoice: ${error.message}` };

  const a = await actor(supabase);
  const log: ActivityLogInsert = {
    case_id: caseId,
    actor: a.id,
    actor_label: a.label,
    action: "invoice_voided",
    detail: { invoiceId },
  };
  await supabase.from("activity_log").insert(log as never);

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/money");
  return { ok: true };
}

/** Create an expense for a case (label + amount + optional date). */
export async function addExpense(formData: FormData): Promise<MoneyResult> {
  const caseId = String(formData.get("caseId") ?? "");
  if (!caseId) return { ok: false, error: "Missing case id." };

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { ok: false, error: "Enter a label." };

  const cents = toCents(formData.get("amount"));
  if (cents === null) return { ok: false, error: "Enter a valid amount." };

  const dateRaw = nn(formData.get("incurredAt"));
  let incurredAt: string | null = null;
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (!Number.isNaN(d.getTime())) incurredAt = d.toISOString();
  }

  const payload: ExpenseInsert = {
    case_id: caseId,
    label,
    amount_cents: cents,
    currency: "EUR",
    incurred_at: incurredAt,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("expenses").insert(payload as never);
  if (error) return { ok: false, error: `Could not add expense: ${error.message}` };

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/money");
  return { ok: true };
}

export interface InvoicePdfResult extends MoneyResult {
  /** base64 of the generated PDF, for a plain client download. */
  base64?: string;
  fileName?: string;
}

/**
 * Generate the invoice PDF for a specific invoice, SAVE it to `case-docs` +
 * insert a 'generated' documents row (type 'invoice'), and return the bytes
 * (base64) so the client can also offer a plain download. Mirrors
 * transport/actions.ts → generateTransportManifest exactly.
 *
 * Issuer = the pre-printed IKG Vienna funeral-service identity. Bill-to = the
 * case's linked family contact if present, else a neutral fallback.
 */
export async function generateInvoicePdf(input: {
  caseId: string;
  invoiceId: string;
}): Promise<InvoicePdfResult> {
  const { caseId, invoiceId } = input;
  if (!caseId || !invoiceId) return { ok: false, error: "Missing invoice." };

  const supabase = await createSupabaseServerClient();

  const [caseRes, invRes, linkRes] = await Promise.all([
    supabase.from("cases").select("*").eq("id", caseId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("case_contacts").select("*").eq("case_id", caseId).eq("role", "family"),
  ]);
  if (caseRes.error) return { ok: false, error: `Could not read case: ${caseRes.error.message}` };
  const caseRow = caseRes.data as CaseRow | null;
  if (!caseRow) return { ok: false, error: "Case not found." };
  if (invRes.error) return { ok: false, error: `Could not read invoice: ${invRes.error.message}` };
  const inv = invRes.data as InvoiceRow | null;
  if (!inv) return { ok: false, error: "Invoice not found." };

  // Resolve the family contact (bill-to) if one is linked.
  let billContact: ContactRow | null = null;
  const links = (linkRes.data ?? []) as CaseContactRow[];
  if (links.length > 0) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", links[0].contact_id)
      .is("deleted_at", null)
      .maybeSingle();
    billContact = (contact as ContactRow | null) ?? null;
  }

  const secularName = [caseRow.secular_first, caseRow.secular_last]
    .filter(Boolean)
    .join(" ")
    .trim();
  const generatedAt = new Date().toISOString();
  const number = inv.number ?? `INV-${generatedAt.slice(0, 10)}`;

  const bytes = await buildInvoicePdf({
    number,
    status: inv.status,
    issuedAt: inv.issued_at ?? generatedAt,
    paidAt: inv.paid_at ?? undefined,
    currency: inv.currency ?? "EUR",
    billTo: {
      name: billContact?.name ?? undefined,
      org: billContact?.org ?? undefined,
      email: billContact?.email ?? undefined,
      phone: billContact?.phone ?? undefined,
    },
    niftar: {
      hebrewName: caseRow.hebrew_name ?? undefined,
      secularName,
    },
    lines: [
      {
        description: `Burial & repatriation service - ${secularName || "the deceased"}`,
        amountCents: inv.amount_cents ?? 0,
      },
    ],
    reference: caseId.slice(0, 8),
  });

  const last =
    (caseRow.secular_last ?? caseRow.secular_first ?? "case")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 40) || "case";
  const fileName = `invoice_${number.replace(/[^A-Za-z0-9-]/g, "")}_${last}.pdf`;
  const path = `cases/${caseId}/invoices/${crypto.randomUUID()}-${fileName}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Save failed: ${upErr.message}` };

  const generatedFrom: GeneratedFrom = {
    template_key: INVOICE_TEMPLATE_KEY,
    template_version: 1,
    data: { invoiceId, number, amount_cents: inv.amount_cents ?? 0 },
    generated_at: generatedAt,
  };
  const docInsert: DocumentInsert = {
    case_id: caseId,
    type: INVOICE_TEMPLATE_KEY,
    status: "generated",
    storage_path: path,
    uploaded_by: "staff",
    generated_from: generatedFrom,
  };
  const { error: rowErr } = await supabase.from("documents").insert(docInsert as never);
  if (rowErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: `Could not record invoice: ${rowErr.message}` };
  }

  revalidatePath(`/cases/${caseId}`);

  const base64 = Buffer.from(bytes).toString("base64");
  return { ok: true, base64, fileName };
}
