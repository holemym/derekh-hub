"use server";

/**
 * Case pipeline server actions (ROADMAP M3 — stage transitions).
 *
 * Every action runs under the RLS-scoped server client (@supabase/ssr), i.e.
 * the logged-in staff session, so the cases + activity_log policies (0002)
 * govern them:
 *   • staff → UPDATE cases (advance the stage).
 *   • staff → INSERT activity_log (append-only audit; no update/delete exists).
 * A non-staff/anon caller is invisible to RLS and every call fails safe.
 *
 * Transition rules (kept deliberately simple, PLANNING §6):
 *   • `toStatus` must be a real CaseStatus.
 *   • It must be a FORWARD move from the current status (strictly greater index
 *     in PIPELINE_STAGES). Backward moves and no-ops are rejected — the audit
 *     trail is append-only and we never "un-bury". Jumping ahead more than one
 *     stage is allowed (the explicit picker), but never past 'buried'.
 *
 * The move is a single UPDATE that (a) sets cases.status and (b) merges
 * stage_timestamps[toStatus] = now() into the existing jsonb (prior stamps are
 * preserved), followed by an immutable activity_log row.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PIPELINE_STAGES, stageIndex, type PipelineStage } from "@/lib/types";
import type { CaseInsert, ActivityLogInsert } from "../../../../../db/types";

export interface AdvanceResult {
  ok: boolean;
  error?: string;
  /** The status the case is now in (present on success). */
  status?: PipelineStage;
}

function isPipelineStage(v: unknown): v is PipelineStage {
  return (
    typeof v === "string" &&
    (PIPELINE_STAGES as readonly string[]).includes(v)
  );
}

/**
 * Advance a case to `toStatus`. Fetches the current status first, validates the
 * move is forward-only, stamps stage_timestamps, and logs the transition.
 */
export async function advanceCaseStage(
  caseId: string,
  toStatus: PipelineStage,
): Promise<AdvanceResult> {
  if (!caseId) return { ok: false, error: "Missing case id." };
  if (!isPipelineStage(toStatus)) {
    return { ok: false, error: "Unknown pipeline stage." };
  }

  const supabase = await createSupabaseServerClient();

  // 1. Read the current status + existing stamps (RLS-scoped).
  const { data: current, error: readErr } = await supabase
    .from("cases")
    .select("status, stage_timestamps")
    .eq("id", caseId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readErr) return { ok: false, error: `Could not read case: ${readErr.message}` };
  if (!current) return { ok: false, error: "Case not found." };

  // db/types.ts predates postgrest-js 2.x GenericSchema, so the typed client
  // degrades .select() results to `never`. Re-assert the row shape we asked for.
  const currentRow = current as unknown as {
    status: PipelineStage;
    stage_timestamps: Record<string, string> | null;
  };
  const from = currentRow.status;

  // 2. Enforce forward-only. Same-stage and backward moves are rejected; there
  //    is nothing beyond 'buried'.
  if (stageIndex(toStatus) <= stageIndex(from)) {
    return {
      ok: false,
      error:
        from === toStatus
          ? "Case is already at that stage."
          : "Cannot move a case backwards.",
    };
  }

  // 3. Who is acting — actor uid + denormalized staff name for the audit row.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let actorLabel: string | null = null;
  if (user) {
    const { data: staff } = await supabase
      .from("staff")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    actorLabel = (staff as { name: string } | null)?.name ?? null;
  }

  // 4. Merge the new stamp into the existing jsonb (don't clobber prior stages).
  const existing = currentRow.stage_timestamps ?? {};
  const stageTimestamps = { ...existing, [toStatus]: new Date().toISOString() };

  // db/types.ts predates postgrest-js 2.x GenericSchema, so the typed client
  // degrades .update()/.insert() params to never[]. The payload IS typed here;
  // cast only the final arg. (Same rationale as cases/new/actions.ts.)
  const update: CaseInsert = {
    status: toStatus,
    stage_timestamps: stageTimestamps,
  };
  const { error: updErr } = await supabase
    .from("cases")
    .update(update as never)
    .eq("id", caseId)
    .is("deleted_at", null);
  if (updErr) {
    return { ok: false, error: `Could not advance stage: ${updErr.message}` };
  }

  // 5. Append the immutable audit entry. A failure here shouldn't roll back the
  //    move (the status change already committed), but we surface it.
  const logRow: ActivityLogInsert = {
    case_id: caseId,
    actor: user?.id ?? null,
    actor_label: actorLabel,
    action: "stage_changed",
    detail: { from, to: toStatus },
  };
  const { error: logErr } = await supabase
    .from("activity_log")
    .insert(logRow as never);
  if (logErr) {
    // The stage moved but the audit write failed — report it so it's visible.
    return {
      ok: false,
      status: toStatus,
      error: `Stage moved, but the change could not be logged: ${logErr.message}`,
    };
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/today");
  return { ok: true, status: toStatus };
}
