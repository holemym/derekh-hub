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
import { PIPELINE_STAGES } from "@/lib/types";
import { urgencyScore } from "@/lib/mock";
import { mapCase } from "./mapper";
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
