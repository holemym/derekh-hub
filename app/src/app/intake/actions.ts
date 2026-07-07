"use server";

/**
 * PUBLIC family-intake submit (ROADMAP M1) — replaces the standalone tool's
 * "export a JSON file, e-mail it to the director, they import it" handoff with a
 * direct write to the database.
 *
 * Runs under the ANON (publishable-key) client (no session), so every call is
 * governed by the anon RLS policies and NOTHING else:
 *   - storage: anon may INSERT into `case-docs` ONLY under the `intake/` prefix
 *     (0003_storage.sql). No read-back — uploads are write-only for the family.
 *   - table:  anon may INSERT ONE intake_submissions row ONLY with status 'new'
 *     AND case_id null (0002_rls.sql). No select/update.
 *
 * Flow: upload each file to intake/{submissionUuid}/{uuid}-{safeName}, then
 * insert one submission row with payload (all fields) + files ([{name,
 * storage_path, mime}]). If the row insert fails we remove the uploaded objects
 * so nothing is orphaned, then surface an error. On success the CLIENT redirects
 * to /intake/thanks (anon cannot read the row back, which is fine).
 *
 * Honeypot: a hidden `company` field. Real families never fill it; a bot that
 * does gets a silent success (we drop the payload). Full rate-limiting is a
 * documented follow-up (see report) — this is only basic deterrence.
 */

import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import type { IntakeFile, IntakeSubmissionInsert } from "../../../../db/types";

const BUCKET = "case-docs";
const MAX_FILE_BYTES = 12 * 1024 * 1024; // 12 MB per file (matches the form hint)
const MAX_FILES = 12;

/** The document slots families can attach, mirroring the standalone form. */
const DOC_SLOTS = ["death", "id", "doctor", "other"] as const;

export interface IntakeResult {
  ok: boolean;
  error?: string;
}

/** Keep a filename safe for a storage key: keep an extension, strip the rest. */
function safeFilename(name: string): string {
  const trimmed = (name || "file").trim() || "file";
  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot + 1) : "";
  const safeBase =
    base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) ||
    "file";
  const safeExt = ext.replace(/[^A-Za-z0-9]+/g, "").slice(0, 8).toLowerCase();
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Take the public intake FormData, upload attachments and insert one submission.
 * Returns { ok:false, error } on failure so the client can show a gentle notice;
 * on success returns { ok:true } and the client navigates to /intake/thanks.
 */
export async function submitIntake(formData: FormData): Promise<IntakeResult> {
  // Honeypot — a hidden field no human fills. If set, pretend success + drop it.
  if (str(formData, "company")) {
    return { ok: true };
  }

  const natType = str(formData, "natType") === "foreigner" ? "foreigner" : "israeli";

  // All text fields → payload. We store exactly what the family typed.
  const payload: Record<string, string> = {
    surname: str(formData, "surname"),
    firstname: str(formData, "firstname"),
    dob: str(formData, "dob"),
    pob: str(formData, "pob"),
    address: str(formData, "address"),
    country: str(formData, "country"),
    nationality: str(formData, "nationality"),
    natType,
    id_number: str(formData, "id_number"),
    dod: str(formData, "dod"),
    pod: str(formData, "pod"),
    cause: str(formData, "cause"),
    burial_place: str(formData, "burial_place"),
    lang: str(formData, "lang") === "de" ? "de" : "en",
    consent: formData.get("consent") ? "yes" : "no",
  };

  const supabase = createSupabaseAnonClient();
  const submissionId = crypto.randomUUID();

  // Collect files across all document slots (each slot input name is doc_<slot>).
  const rawFiles: File[] = [];
  for (const slot of DOC_SLOTS) {
    for (const entry of formData.getAll(`doc_${slot}`)) {
      if (entry instanceof File && entry.size > 0) rawFiles.push(entry);
    }
  }
  if (rawFiles.length > MAX_FILES) {
    return { ok: false, error: "Too many files. Please attach fewer documents." };
  }

  const uploadedPaths: string[] = [];
  const files: IntakeFile[] = [];

  for (const file of rawFiles) {
    if (file.size > MAX_FILE_BYTES) {
      // Roll back anything already uploaded, then fail.
      if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths);
      return { ok: false, error: `${file.name} is larger than 12 MB.` };
    }
    const path = `intake/${submissionId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) {
      if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths);
      return { ok: false, error: `Upload failed: ${upErr.message}` };
    }
    uploadedPaths.push(path);
    files.push({
      path,
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
    });
  }

  const insert: IntakeSubmissionInsert = {
    payload,
    files,
    status: "new",
    case_id: null,
  };

  // db/types.ts predates postgrest-js 2.x GenericSchema, so the typed client
  // degrades .insert() params to never[]. The payload IS typed above; cast the
  // final arg only (same rationale as cases/new/actions.ts).
  const { error: rowErr } = await supabase
    .from("intake_submissions")
    .insert(insert as never);

  if (rowErr) {
    // Don't orphan the uploaded objects if the row didn't land.
    if (uploadedPaths.length) {
      await supabase.storage.from(BUCKET).remove(uploadedPaths).catch(() => {});
    }
    return { ok: false, error: `Could not send your details: ${rowErr.message}` };
  }

  return { ok: true };
}
