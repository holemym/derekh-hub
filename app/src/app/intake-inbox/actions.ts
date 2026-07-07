"use server";

/**
 * STAFF intake review actions (ROADMAP M1) — the second half of the family-intake
 * loop: turn a `new` intake_submissions row into a real case (or reject it). This
 * replaces the standalone tool's "director imports a JSON file" step.
 *
 * Every action runs under the RLS-scoped server client (the logged-in staff
 * session), so reads/writes are governed by the staff policies (0002_rls.sql):
 * staff SELECT/INSERT/UPDATE on cases, documents and intake_submissions. A
 * non-staff/anon caller is invisible to RLS and each call fails safe.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CaseInsert,
  DocumentInsert,
  IntakeFile,
  IntakeSubmissionRow,
} from "../../../../db/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Empty/whitespace → null (DB columns are nullable and prefer NULL over ""). */
function nn(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

/**
 * Import a submission into a NEW case:
 *   1. read the submission (staff SELECT),
 *   2. insert a `cases` row from payload — same normalized mapping as
 *      cases/new/actions.ts, with the raw payload stashed in permit_data,
 *   3. insert a `documents` row per attached file (uploaded_by 'family',
 *      status 'received', storage_path = the intake/ path),
 *   4. mark the submission status='imported' + case_id,
 *   5. redirect to /cases/[new].
 * Returns { ok:false, error } on failure (before the redirect) so the caller can
 * surface it; the redirect throw is expected on success.
 */
export async function importSubmission(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing submission id." };

  const supabase = await createSupabaseServerClient();

  const { data: subRaw, error: readErr } = await supabase
    .from("intake_submissions")
    .select("id, payload, files, status, case_id")
    .eq("id", id)
    .maybeSingle();

  if (readErr || !subRaw) {
    return { ok: false, error: readErr?.message ?? "Submission not found." };
  }
  const sub = subRaw as unknown as Pick<
    IntakeSubmissionRow,
    "id" | "payload" | "files" | "status" | "case_id"
  >;
  if (sub.status !== "new" || sub.case_id) {
    return { ok: false, error: "This submission has already been handled." };
  }

  const p = (sub.payload ?? {}) as Record<string, unknown>;
  const natType = p.natType === "foreigner" ? "foreigner" : "israeli";

  const insert: CaseInsert = {
    secular_first: nn(p.firstname),
    secular_last: nn(p.surname),
    dob: nn(p.dob),
    dod: nn(p.dod),
    place_of_death: nn(p.pod),
    place_of_birth: nn(p.pob),
    last_address: nn(p.address),
    nationality: nn(p.nationality),
    country: nn(p.country),
    id_number: nn(p.id_number),
    id_type: natType === "foreigner" ? "passport" : "israeli_id",
    cause_of_death: nn(p.cause),
    burial_place: nn(p.burial_place),
    status: "notified",
    // Verbatim snapshot of the family's submission for reference/regeneration.
    permit_data: p as Record<string, unknown>,
  };

  // db/types.ts predates postgrest-js 2.x GenericSchema, so the typed client
  // degrades .insert() params to never[]. The payloads ARE typed above; we cast
  // only the final argument (same rationale as cases/new/actions.ts).
  const { data: caseData, error: caseErr } = await supabase
    .from("cases")
    .insert(insert as never)
    .select("id")
    .single();

  if (caseErr || !caseData) {
    return { ok: false, error: caseErr?.message ?? "Could not create the case." };
  }
  const caseId = (caseData as { id: string }).id;

  // One documents row per attached family file. A file failure must not lose the
  // case — log-and-continue (the file object already exists in storage).
  const files = Array.isArray(sub.files) ? (sub.files as IntakeFile[]) : [];
  for (const f of files) {
    if (!f?.path) continue;
    const docInsert: DocumentInsert = {
      case_id: caseId,
      type: "family_intake",
      status: "received",
      storage_path: f.path,
      uploaded_by: "family",
    };
    await supabase.from("documents").insert(docInsert as never);
  }

  // Link + close the submission.
  const { error: updErr } = await supabase
    .from("intake_submissions")
    .update({ status: "imported", case_id: caseId } as never)
    .eq("id", id);
  if (updErr) {
    // The case + docs are already saved; surface a soft warning but don't undo.
    return {
      ok: false,
      error: `Case created, but the submission could not be marked imported: ${updErr.message}`,
    };
  }

  revalidatePath("/intake-inbox");
  redirect(`/cases/${caseId}`);
}

/** Reject a submission: mark it 'rejected' so it leaves the inbox. */
export async function rejectSubmission(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing submission id." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("intake_submissions")
    .update({ status: "rejected" } as never)
    .eq("id", id)
    .eq("status", "new");

  if (error) return { ok: false, error: error.message };
  revalidatePath("/intake-inbox");
  return { ok: true };
}

/**
 * Mint a short-lived signed URL for an intake file so staff can view a family's
 * attachment before importing. RLS-scoped: only an active staff session can sign
 * an object in the private `case-docs` bucket.
 */
export async function getIntakeFileUrl(path: string): Promise<ActionResult & { url?: string }> {
  if (!path) return { ok: false, error: "Missing file path." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("case-docs")
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not create link." };
  }
  return { ok: true, url: data.signedUrl };
}
