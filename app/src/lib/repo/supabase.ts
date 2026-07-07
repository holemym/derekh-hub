/**
 * Supabase-backed repo (LIVE data), RLS-scoped to the logged-in staff session.
 *
 * Every read goes through the @supabase/ssr SERVER client, so row-level
 * security applies under the user's identity: a non-staff/anon caller sees
 * nothing. Rows are mapped to the app `Case` shape via ./mapper so callers
 * (pages/components) never touch DB shapes.
 *
 * Pure helpers (urgencyScore / stageIndex) come from @/lib/mock and @/lib/types
 * — they operate on already-mapped `Case` objects, no mock rows involved.
 */

import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Case, PipelineStage } from "@/lib/types";
import type { Task } from "@/lib/types";
import { PIPELINE_STAGES } from "@/lib/types";
import { urgencyScore } from "@/lib/planning";
import { mapCase, mapTask } from "./mapper";
import type {
  CaseRow,
  TransportLegRow,
  DocumentRow,
  CaseContactRow,
  TaskRow,
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
