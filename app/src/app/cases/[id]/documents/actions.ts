"use server";

/**
 * Document-vault server actions — the per-case file store (ROADMAP M1).
 *
 * Every action runs under the RLS-scoped server client (@supabase/ssr), i.e.
 * the logged-in staff session. So Storage object access and `documents` row
 * writes are governed by the 0003 storage policies + 0002 table policies:
 *   • staff  → full read/write on the `case-docs` bucket + INSERT/UPDATE rows.
 *   • owner  → DELETE rows (we soft-delete via UPDATE so plain staff can remove).
 * A non-staff/anon caller is invisible to RLS and every call no-ops/fails safe.
 *
 * Storage layout (private bucket `case-docs`, signed URLs only):
 *   uploads : cases/{caseId}/{uuid}-{safeName}
 *   permits : cases/{caseId}/permits/{uuid}-{name}.pdf
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DocumentInsert, GeneratedFrom } from "../../../../../../db/types";

const BUCKET = "case-docs";
const SIGNED_URL_TTL = 60; // seconds — short-lived per PLANNING §11

export interface ActionResult {
  ok: boolean;
  error?: string;
  url?: string;
}

/** Make a filename safe for a storage key: keep an extension, strip the rest. */
function safeFilename(name: string): string {
  const trimmed = name.trim() || "file";
  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot + 1) : "";
  const safeBase =
    base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) ||
    "file";
  const safeExt = ext.replace(/[^A-Za-z0-9]+/g, "").slice(0, 8).toLowerCase();
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

/** Storage path for an uploaded (or generated) file under a case. */
function objectPath(caseId: string, fileName: string, kind: "upload" | "permit"): string {
  const uuid = crypto.randomUUID();
  const safe = safeFilename(fileName);
  return kind === "permit"
    ? `cases/${caseId}/permits/${uuid}-${safe}`
    : `cases/${caseId}/${uuid}-${safe}`;
}

/**
 * Upload a staff document to a case: put the bytes in `case-docs` at the path
 * convention, then insert a `documents` row (status 'received', uploaded_by
 * 'staff'). `type` is a small free label from the form ('death_certificate', …).
 */
export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  const caseId = String(formData.get("caseId") ?? "");
  const type = String(formData.get("type") ?? "other").trim() || "other";
  const file = formData.get("file");

  if (!caseId) return { ok: false, error: "Missing case id." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }

  const supabase = await createSupabaseServerClient();
  const path = objectPath(caseId, file.name, "upload");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const insert: DocumentInsert = {
    case_id: caseId,
    type,
    status: "received",
    storage_path: path,
    uploaded_by: "staff",
  };
  // db/types.ts predates postgrest-js 2.x GenericSchema, so the typed client
  // degrades .insert() params to never[]. The payload IS typed above; cast the
  // final arg only. (Same rationale as cases/new/actions.ts.)
  const { error: rowErr } = await supabase.from("documents").insert(insert as never);
  if (rowErr) {
    // Row insert failed — don't orphan the object.
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: `Could not record document: ${rowErr.message}` };
  }

  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

/**
 * Save an already-generated permit PDF (bytes as base64 from the client) to the
 * case under cases/{id}/permits/… and insert a 'generated' documents row with a
 * small generated_from snapshot. The plain client download is unaffected.
 */
export async function savePermitToCase(input: {
  caseId: string;
  fileName: string;
  base64: string;
  templateKey?: string;
}): Promise<ActionResult> {
  const { caseId, fileName, base64 } = input;
  const templateKey = input.templateKey || "il-mfa-transfer-permit";
  if (!caseId) return { ok: false, error: "Missing case id." };
  if (!base64) return { ok: false, error: "No permit data." };

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(base64, "base64"));
  } catch {
    return { ok: false, error: "Invalid permit data." };
  }
  if (bytes.byteLength === 0) return { ok: false, error: "Empty permit." };

  const supabase = await createSupabaseServerClient();
  const path = objectPath(caseId, fileName || "permit.pdf", "permit");

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Save failed: ${upErr.message}` };

  const generatedFrom: GeneratedFrom = {
    template_key: templateKey,
    template_version: 1,
    data: {},
    generated_at: new Date().toISOString(),
  };
  const insert: DocumentInsert = {
    case_id: caseId,
    template_key: templateKey,
    type: templateKey,
    status: "generated",
    storage_path: path,
    uploaded_by: "staff",
    generated_from: generatedFrom,
  };
  const { error: rowErr } = await supabase.from("documents").insert(insert as never);
  if (rowErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: `Could not record permit: ${rowErr.message}` };
  }

  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

/**
 * Mint a short-lived signed URL for a stored object. Access is RLS-scoped: the
 * staff session must satisfy the storage SELECT policy for the object to be
 * signable, so a leaked path alone grants nothing.
 */
export async function getDocumentUrl(storagePath: string): Promise<ActionResult> {
  if (!storagePath) return { ok: false, error: "Missing file path." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not create link." };
  }
  return { ok: true, url: data.signedUrl };
}

/**
 * Remove a document: delete the storage object and SOFT-delete the row
 * (set deleted_at via UPDATE, which the staff RLS policy allows — the hard
 * DELETE policy is owner-only). Reads already filter `deleted_at is null`.
 */
export async function deleteDocument(input: {
  caseId: string;
  documentId: string;
  storagePath?: string;
}): Promise<ActionResult> {
  const { caseId, documentId, storagePath } = input;
  if (!caseId || !documentId) return { ok: false, error: "Missing document." };

  const supabase = await createSupabaseServerClient();

  if (storagePath) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([storagePath]);
    // A missing object shouldn't block the row soft-delete; surface only hard errors.
    if (rmErr && !/not.*found/i.test(rmErr.message)) {
      return { ok: false, error: `Could not remove file: ${rmErr.message}` };
    }
  }

  const { error: rowErr } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq("id", documentId)
    .eq("case_id", caseId);
  if (rowErr) return { ok: false, error: `Could not remove record: ${rowErr.message}` };

  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}
