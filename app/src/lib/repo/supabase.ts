/**
 * Supabase-backed repo (LIVE data), RLS-scoped to the logged-in staff session.
 *
 * Every read goes through the @supabase/ssr SERVER client, so row-level
 * security applies under the user's identity: a non-staff/anon caller sees
 * nothing. Rows are mapped to the app `Case` shape via ./mapper so callers
 * (pages/components) never touch DB shapes.
 *
 * Pure helpers (urgencyScore / stageIndex) come from @/lib/planning and
 * @/lib/types — they operate on already-mapped `Case` objects.
 */

import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Case, PipelineStage } from "@/lib/types";
import type { Task } from "@/lib/types";
import { PIPELINE_STAGES } from "@/lib/types";
import { urgencyScore } from "@/lib/planning";
import {
  mapCase,
  mapTask,
  mapTransportLeg,
  mapInvoice,
  mapExpense,
  mapMessage,
  mapCaseContactCard,
  mapContactBookEntry,
} from "./mapper";
import type {
  TransportLeg,
  Invoice,
  Expense,
  Message,
  MoneySummary,
  CaseContactCard,
  ContactBookEntry,
} from "@/lib/types";
import { computeMoneySummary } from "@/lib/money";
import type {
  CaseRow,
  TransportLegRow,
  DocumentRow,
  CaseContactRow,
  ContactRow,
  TaskRow,
  ActivityLogRow,
  InvoiceRow,
  ExpenseRow,
  MessageRow,
} from "../../../../db/types";

/** Columns we read for list views — the full case row is fine (RLS-guarded). */
async function selectCaseRows(): Promise<CaseRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .is("deleted_at", null);
  if (error) throw new Error(`cases read failed: ${error.message}`);
  return (data ?? []) as CaseRow[];
}

/** All (non-deleted) cases, mapped, unsorted. */
export async function listCases(): Promise<Case[]> {
  const rows = await selectCaseRows();
  return rows.map((row) => mapCase({ case: row }));
}

/** One case by id with its linked children, or undefined. */
export async function getCase(id: string): Promise<Case | undefined> {
  const supabase = await createSupabaseServerClient();

  const [caseRes, legsRes, docsRes, contactsRes, tasksRes] = await Promise.all([
    supabase.from("cases").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("transport_legs").select("*").eq("case_id", id).is("deleted_at", null),
    supabase.from("documents").select("*").eq("case_id", id).is("deleted_at", null),
    supabase.from("case_contacts").select("*").eq("case_id", id),
    supabase.from("tasks").select("*").eq("case_id", id).is("deleted_at", null),
  ]);

  if (caseRes.error) throw new Error(`case read failed: ${caseRes.error.message}`);
  const row = caseRes.data as CaseRow | null;
  if (!row) return undefined;

  return mapCase({
    case: row,
    transportLegs: (legsRes.data ?? []) as TransportLegRow[],
    documents: (docsRes.data ?? []) as DocumentRow[],
    contacts: (contactsRes.data ?? []) as CaseContactRow[],
    tasks: (tasksRes.data ?? []) as TaskRow[],
  });
}

/** Cases grouped by pipeline stage (for the Cases list). */
export async function casesByStage(): Promise<Map<PipelineStage, Case[]>> {
  const cases = await listCases();
  const map = new Map<PipelineStage, Case[]>();
  for (const stage of PIPELINE_STAGES) map.set(stage, []);
  for (const c of cases) map.get(c.status)?.push(c);
  return map;
}

/** Cases sorted by real urgency (for the Today screen). */
export async function casesByUrgency(
  nowDate: Date = new Date(),
): Promise<Case[]> {
  const cases = await listCases();
  return cases.sort(
    (a, b) => urgencyScore(b, nowDate) - urgencyScore(a, nowDate),
  );
}

/**
 * Open cases only (status != 'buried', not deleted), urgency-sorted. This is
 * the Today feed — the daily command surface (ROADMAP M2).
 */
export async function openCasesByUrgency(
  nowDate: Date = new Date(),
): Promise<Case[]> {
  const cases = await casesByUrgency(nowDate);
  return cases.filter((c) => c.status !== "buried");
}

/* ── Tasks (ROADMAP M2 planning layer) ─────────────────────────────────── */

/**
 * All OPEN tasks across every case + standalone, due-sorted (earliest first,
 * undated last). RLS-scoped. Used by the Today "Due soon" section and /tasks.
 */
export async function listOpenTasks(): Promise<Task[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .is("deleted_at", null)
    .order("due", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`tasks read failed: ${error.message}`);
  return ((data ?? []) as TaskRow[]).map(mapTask);
}

/* ── Activity log (append-only audit; ROADMAP M3) ──────────────────────── */

/** A single audit entry, projected for the case-detail "Recent activity" list. */
export interface ActivityEntry {
  id: string;
  action: string;
  actorLabel?: string;
  detail?: Record<string, unknown>;
  at: string;
}

/**
 * Most-recent activity_log rows for one case (staff SELECT, RLS-scoped),
 * newest first. Small by design — the case detail shows only the latest few.
 */
export async function activityForCase(
  caseId: string,
  limit = 5,
): Promise<ActivityEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, action, actor_label, detail, at")
    .eq("case_id", caseId)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`activity read failed: ${error.message}`);
  return ((data ?? []) as ActivityLogRow[]).map((r) => ({
    id: r.id,
    action: r.action,
    actorLabel: r.actor_label ?? undefined,
    detail: (r.detail ?? undefined) as Record<string, unknown> | undefined,
    at: r.at,
  }));
}

/* ── Transport (ROADMAP M3 — dispatch board) ───────────────────────────── */

/** A transport leg plus the niftar identity, for the cross-case board. */
export interface TransportLegWithCase {
  leg: TransportLeg;
  caseId: string;
  hebrewName: string;
  secularName: string;
  urgent: boolean;
}

/**
 * Every non-deleted transport leg across all (non-deleted) cases, joined to the
 * niftar's name — the dispatch board (ROADMAP M3). RLS-scoped: a non-staff
 * caller sees nothing. Sorted by scheduled_at (soonest first, undated last).
 */
export async function listTransportLegs(): Promise<TransportLegWithCase[]> {
  const supabase = await createSupabaseServerClient();

  const [legsRes, casesRes] = await Promise.all([
    supabase
      .from("transport_legs")
      .select("*")
      .is("deleted_at", null),
    supabase
      .from("cases")
      .select("id, hebrew_name, secular_first, secular_last, urgency")
      .is("deleted_at", null),
  ]);

  if (legsRes.error) throw new Error(`legs read failed: ${legsRes.error.message}`);
  if (casesRes.error) throw new Error(`cases read failed: ${casesRes.error.message}`);

  const cases = (casesRes.data ?? []) as unknown as Array<{
    id: string;
    hebrew_name: string | null;
    secular_first: string | null;
    secular_last: string | null;
    urgency: number | null;
  }>;
  const byId = new Map(cases.map((c) => [c.id, c]));

  const rows = (legsRes.data ?? []) as TransportLegRow[];
  const out: TransportLegWithCase[] = [];
  for (const row of rows) {
    const c = byId.get(row.case_id);
    if (!c) continue; // orphaned by a soft-deleted case — skip
    out.push({
      leg: mapTransportLeg(row),
      caseId: row.case_id,
      hebrewName: c.hebrew_name ?? "",
      secularName: [c.secular_first, c.secular_last]
        .filter(Boolean)
        .join(" ")
        .trim(),
      urgent: (c.urgency ?? 0) >= 3,
    });
  }

  out.sort((a, b) => {
    const sa = a.leg.scheduledAt;
    const sb = b.leg.scheduledAt;
    if (sa && sb) return sa.localeCompare(sb);
    if (sa) return -1;
    if (sb) return 1;
    return 0;
  });
  return out;
}

/* ── Money (ROADMAP M4) ─────────────────────────────────────────────────── */

/** A case's invoices + expenses + roll-up, for the per-case Money section. */
export interface CaseMoney {
  invoices: Invoice[];
  expenses: Expense[];
  summary: MoneySummary;
}

/**
 * Invoices + expenses for one case (staff SELECT, RLS-scoped), newest first,
 * with the computed roll-up. Non-deleted only.
 */
export async function moneyForCase(caseId: string): Promise<CaseMoney> {
  const supabase = await createSupabaseServerClient();
  const [invRes, expRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("expenses")
      .select("*")
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .order("incurred_at", { ascending: false, nullsFirst: false }),
  ]);
  if (invRes.error) throw new Error(`invoices read failed: ${invRes.error.message}`);
  if (expRes.error) throw new Error(`expenses read failed: ${expRes.error.message}`);

  const invoices = ((invRes.data ?? []) as InvoiceRow[]).map(mapInvoice);
  const expenses = ((expRes.data ?? []) as ExpenseRow[]).map(mapExpense);
  return { invoices, expenses, summary: computeMoneySummary(invoices, expenses) };
}

/** An invoice joined to its case's niftar identity — the /money overview row. */
export interface InvoiceWithCase {
  invoice: Invoice;
  caseId: string;
  hebrewName: string;
  secularName: string;
}

/** The cross-case money overview payload (ROADMAP M4 /money route). */
export interface MoneyOverview {
  invoices: InvoiceWithCase[];
  summary: MoneySummary;
}

/**
 * Every non-deleted invoice across all (non-deleted) cases, joined to the
 * niftar's name — the /money overview. RLS-scoped. Also totals expenses so the
 * overview can show a net. Non-void invoices only in the overview list (void is
 * excluded from totals by computeMoneySummary anyway).
 */
export async function moneyOverview(): Promise<MoneyOverview> {
  const supabase = await createSupabaseServerClient();

  const [invRes, expRes, casesRes] = await Promise.all([
    supabase.from("invoices").select("*").is("deleted_at", null),
    supabase.from("expenses").select("*").is("deleted_at", null),
    supabase
      .from("cases")
      .select("id, hebrew_name, secular_first, secular_last")
      .is("deleted_at", null),
  ]);
  if (invRes.error) throw new Error(`invoices read failed: ${invRes.error.message}`);
  if (expRes.error) throw new Error(`expenses read failed: ${expRes.error.message}`);
  if (casesRes.error) throw new Error(`cases read failed: ${casesRes.error.message}`);

  const cases = (casesRes.data ?? []) as unknown as Array<{
    id: string;
    hebrew_name: string | null;
    secular_first: string | null;
    secular_last: string | null;
  }>;
  const byId = new Map(cases.map((c) => [c.id, c]));

  const invoices = ((invRes.data ?? []) as InvoiceRow[])
    .map(mapInvoice)
    .filter((inv) => byId.has(inv.caseId)); // drop orphans (soft-deleted case)
  const expenses = ((expRes.data ?? []) as ExpenseRow[]).map(mapExpense);

  const rows: InvoiceWithCase[] = invoices.map((invoice) => {
    const c = byId.get(invoice.caseId)!;
    return {
      invoice,
      caseId: invoice.caseId,
      hebrewName: c.hebrew_name ?? "",
      secularName: [c.secular_first, c.secular_last].filter(Boolean).join(" ").trim(),
    };
  });

  return { invoices: rows, summary: computeMoneySummary(invoices, expenses) };
}

/* ── Comms (ROADMAP M4) ─────────────────────────────────────────────────── */

/**
 * Contact cards for one case (case_contacts joined to contacts), for the comms
 * recipient picker. RLS-scoped. Ordered so 'family' comes first.
 */
export async function contactCardsForCase(
  caseId: string,
): Promise<CaseContactCard[]> {
  const supabase = await createSupabaseServerClient();
  const { data: links, error: linkErr } = await supabase
    .from("case_contacts")
    .select("*")
    .eq("case_id", caseId);
  if (linkErr) throw new Error(`case_contacts read failed: ${linkErr.message}`);

  const rows = (links ?? []) as CaseContactRow[];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.contact_id))];
  const { data: contacts, error: cErr } = await supabase
    .from("contacts")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null);
  if (cErr) throw new Error(`contacts read failed: ${cErr.message}`);

  const byId = new Map(
    ((contacts ?? []) as ContactRow[]).map((c) => [c.id, c]),
  );
  const cards = rows
    .map((link) => mapCaseContactCard(link, byId.get(link.contact_id)))
    .filter((c): c is CaseContactCard => c !== null);

  // Family first, then the rest in place.
  return cards.sort((a, b) =>
    a.role === "family" ? -1 : b.role === "family" ? 1 : 0,
  );
}

/** The whole shared address book (non-deleted), name-sorted — /contacts. */
export async function listContactBook(): Promise<ContactBookEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(`contacts read failed: ${error.message}`);
  return ((data ?? []) as ContactRow[]).map(mapContactBookEntry);
}

/** Logged messages for one case (newest first) — the comms history. */
export async function messagesForCase(caseId: string): Promise<Message[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`messages read failed: ${error.message}`);
  return ((data ?? []) as MessageRow[]).map(mapMessage);
}

/** Open + done tasks for one case, due-sorted (for the case-detail Tasks list). */
export async function tasksForCase(caseId: string): Promise<Task[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .order("due", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`case tasks read failed: ${error.message}`);
  return ((data ?? []) as TaskRow[]).map(mapTask);
}
