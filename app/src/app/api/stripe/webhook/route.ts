import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ActivityLogInsert, InvoiceRow } from "../../../../../../db/types";

/**
 * Stripe webhook (ROADMAP M4.5) — reconciles payment links: on
 * checkout.session.completed with metadata.invoice_id (stamped on the payment
 * link, copied onto its checkout sessions), mark that invoice paid.
 *
 * PUBLIC route (proxy allows /api/stripe) but self-authenticating: the request
 * is only trusted after its `stripe-signature` verifies against
 * STRIPE_WEBHOOK_SECRET over the RAW body. Writes use the service-role admin
 * client (there is no user session on a webhook) — scoped to exactly one
 * status flip + one audit row.
 */

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // Everything else is acknowledged and ignored (Stripe retries on non-2xx).
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data?.object ?? {};
  const metadata = (session.metadata ?? {}) as Record<string, string>;
  const invoiceId = metadata.invoice_id;
  const caseId = metadata.case_id;
  if (!invoiceId) return NextResponse.json({ received: true });

  const admin = supabaseAdmin;

  // Only flip an invoice that is still awaiting payment (idempotent on retry).
  const { data: inv } = await admin
    .from("invoices")
    .select("status, case_id, issued_at")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = inv as Pick<InvoiceRow, "status" | "case_id" | "issued_at"> | null;
  if (!row || row.status === "paid" || row.status === "void") {
    return NextResponse.json({ received: true });
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: now,
      issued_at: row.issued_at ?? now,
    } as never)
    .eq("id", invoiceId)
    .neq("status", "paid")
    .neq("status", "void");
  if (error) {
    // Non-2xx → Stripe retries later; the flip is idempotent.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const log: ActivityLogInsert = {
    case_id: caseId ?? row.case_id,
    actor: null,
    actor_label: "Stripe",
    action: "invoice_paid_online",
    detail: { invoiceId },
  };
  await admin.from("activity_log").insert(log as never);

  return NextResponse.json({ received: true });
}
