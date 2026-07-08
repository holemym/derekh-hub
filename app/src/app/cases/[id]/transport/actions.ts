"use server";

/**
 * Transport & repatriation server actions (ROADMAP M3).
 *
 * Every action runs under the RLS-scoped server client (@supabase/ssr), i.e.
 * the logged-in staff session, so the transport_legs + documents + activity_log
 * policies (0002/0003) govern them:
 *   • staff → INSERT / UPDATE transport_legs (add/edit a leg, advance status,
 *     append a custody event).
 *   • staff → Storage write + documents INSERT (generated transport manifest).
 *   • staff → INSERT activity_log (append-only audit).
 * A non-staff/anon caller is invisible to RLS and every call fails safe.
 *
 * Chain of custody is APPEND-ONLY: we read the current jsonb array, push the
 * new event, and write the whole array back — prior events are never clobbered.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildManifestPdf } from "@/lib/documents/manifest";
import { mapTransportLeg } from "@/lib/repo/mapper";
import {
  TRANSPORT_LEG_STATUSES,
  legStatusIndex,
  CUSTODY_EVENT_KINDS,
  type TransportLegStatus,
  type CustodyEventKind,
} from "@/lib/types";
import type {
  TransportLegInsert,
  TransportLegRow,
  TransportLegType,
  DocumentInsert,
  GeneratedFrom,
  ActivityLogInsert,
  CaseRow,
} from "../../../../../../db/types";

const BUCKET = "case-docs";
const MANIFEST_TEMPLATE_KEY = "transport_manifest";

export interface TransportResult {
  ok: boolean;
  error?: string;
}

const LEG_TYPES: readonly TransportLegType[] = ["ground", "air_cargo", "domestic_il"];

/** Empty string → null. */
function nn(v: FormDataEntryValue | null | undefined): string | null {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

function isLegType(v: unknown): v is TransportLegType {
  return typeof v === "string" && (LEG_TYPES as readonly string[]).includes(v);
}
function isLegStatus(v: unknown): v is TransportLegStatus {
  return (
    typeof v === "string" &&
    (TRANSPORT_LEG_STATUSES as readonly string[]).includes(v)
  );
}
function isCustodyKind(v: unknown): v is CustodyEventKind {
  return (
    typeof v === "string" && (CUSTODY_EVENT_KINDS as readonly string[]).includes(v)
  );
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
 * Create OR update a transport leg. `legId` present → update; absent → insert.
 * Datetime comes from an <input type="datetime-local"> (local Vienna wall time)
 * already converted to ISO by the client.
 */
export async function saveTransportLeg(formData: FormData): Promise<TransportResult> {
  const caseId = String(formData.get("caseId") ?? "");
  const legId = nn(formData.get("legId"));
  const type = String(formData.get("type") ?? "");

  if (!caseId) return { ok: false, error: "Missing case id." };
  if (!isLegType(type)) return { ok: false, error: "Unknown transport type." };

  const scheduledRaw = nn(formData.get("scheduledAt"));
  let scheduled: string | null = null;
  if (scheduledRaw) {
    const d = new Date(scheduledRaw);
    if (!Number.isNaN(d.getTime())) scheduled = d.toISOString();
  }

  const payload: TransportLegInsert = {
    case_id: caseId,
    type,
    from_location: nn(formData.get("from")),
    to_location: nn(formData.get("to")),
    carrier: nn(formData.get("carrier")),
    flight_no: nn(formData.get("flightNo")),
    awb_no: nn(formData.get("awbNo")),
    scheduled_at: scheduled,
  };

  const supabase = await createSupabaseServerClient();

  if (legId) {
    const { error } = await supabase
      .from("transport_legs")
      .update(payload as never)
      .eq("id", legId)
      .eq("case_id", caseId)
      .is("deleted_at", null);
    if (error) return { ok: false, error: `Could not update leg: ${error.message}` };
  } else {
    const insert: TransportLegInsert = { ...payload, status: "planned" };
    const { error } = await supabase.from("transport_legs").insert(insert as never);
    if (error) return { ok: false, error: `Could not add leg: ${error.message}` };
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/transport");
  return { ok: true };
}

/** Advance a leg one step: planned → booked → in_transit → completed. */
export async function advanceLegStatus(input: {
  caseId: string;
  legId: string;
}): Promise<TransportResult> {
  const { caseId, legId } = input;
  if (!caseId || !legId) return { ok: false, error: "Missing leg." };

  const supabase = await createSupabaseServerClient();

  const { data, error: readErr } = await supabase
    .from("transport_legs")
    .select("status")
    .eq("id", legId)
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { ok: false, error: `Could not read leg: ${readErr.message}` };
  if (!data) return { ok: false, error: "Leg not found." };

  const from = (data as { status: TransportLegStatus }).status;
  const idx = legStatusIndex(from);
  if (idx >= TRANSPORT_LEG_STATUSES.length - 1) {
    return { ok: false, error: "Leg is already completed." };
  }
  const to = TRANSPORT_LEG_STATUSES[idx + 1];

  const { error: updErr } = await supabase
    .from("transport_legs")
    .update({ status: to } as never)
    .eq("id", legId)
    .eq("case_id", caseId)
    .is("deleted_at", null);
  if (updErr) return { ok: false, error: `Could not advance leg: ${updErr.message}` };

  const a = await actor(supabase);
  const log: ActivityLogInsert = {
    case_id: caseId,
    actor: a.id,
    actor_label: a.label,
    action: "leg_status_changed",
    detail: { legId, from, to },
  };
  await supabase.from("activity_log").insert(log as never);

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/transport");
  return { ok: true };
}

/**
 * Append a chain-of-custody event to a leg. APPEND-ONLY: reads the current
 * jsonb array, pushes { event, at, by, note }, writes the whole array back.
 */
export async function addCustodyEvent(input: {
  caseId: string;
  legId: string;
  event: string;
  at?: string;
  by?: string;
  note?: string;
}): Promise<TransportResult> {
  const { caseId, legId } = input;
  if (!caseId || !legId) return { ok: false, error: "Missing leg." };
  if (!isCustodyKind(input.event)) return { ok: false, error: "Unknown custody event." };

  const at = (() => {
    if (!input.at) return new Date().toISOString();
    const d = new Date(input.at);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  })();

  const supabase = await createSupabaseServerClient();

  const { data, error: readErr } = await supabase
    .from("transport_legs")
    .select("custody")
    .eq("id", legId)
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { ok: false, error: `Could not read leg: ${readErr.message}` };
  if (!data) return { ok: false, error: "Leg not found." };

  const prior = (data as { custody: unknown }).custody;
  const chain = Array.isArray(prior) ? [...prior] : [];
  const by = (input.by ?? "").trim();
  const note = (input.note ?? "").trim();
  chain.push({
    event: input.event,
    at,
    ...(by ? { by } : {}),
    ...(note ? { note } : {}),
  });

  const { error: updErr } = await supabase
    .from("transport_legs")
    .update({ custody: chain } as never)
    .eq("id", legId)
    .eq("case_id", caseId)
    .is("deleted_at", null);
  if (updErr) {
    return { ok: false, error: `Could not record custody event: ${updErr.message}` };
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/transport");
  return { ok: true };
}

export interface ManifestResult extends TransportResult {
  /** base64 of the generated PDF, for a plain client download. */
  base64?: string;
  fileName?: string;
}

/**
 * Generate the transport manifest PDF for a case, SAVE it to `case-docs` +
 * insert a 'generated' documents row (type 'transport_manifest'), and return
 * the bytes (base64) so the client can also offer a plain download.
 */
export async function generateTransportManifest(input: {
  caseId: string;
}): Promise<ManifestResult> {
  const { caseId } = input;
  if (!caseId) return { ok: false, error: "Missing case id." };

  const supabase = await createSupabaseServerClient();

  const [caseRes, legsRes] = await Promise.all([
    supabase.from("cases").select("*").eq("id", caseId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("transport_legs")
      .select("*")
      .eq("case_id", caseId)
      .is("deleted_at", null),
  ]);
  if (caseRes.error) return { ok: false, error: `Could not read case: ${caseRes.error.message}` };
  const caseRow = caseRes.data as CaseRow | null;
  if (!caseRow) return { ok: false, error: "Case not found." };
  if (legsRes.error) return { ok: false, error: `Could not read legs: ${legsRes.error.message}` };

  const legs = ((legsRes.data ?? []) as TransportLegRow[]).map(mapTransportLeg);

  const generatedAt = new Date().toISOString();
  const bytes = await buildManifestPdf({
    niftar: {
      hebrewName: caseRow.hebrew_name ?? undefined,
      secularName: [caseRow.secular_first, caseRow.secular_last]
        .filter(Boolean)
        .join(" ")
        .trim(),
      idOrPassport: caseRow.id_number ?? undefined,
      nationality: caseRow.nationality ?? undefined,
      dod: caseRow.dod ?? undefined,
      placeOfDeath: caseRow.place_of_death ?? undefined,
      cemetery: caseRow.cemetery ?? undefined,
      burialPlace: caseRow.burial_place ?? undefined,
    },
    legs,
    reference: caseId.slice(0, 8),
    generatedAt,
  });

  const last =
    (caseRow.secular_last ?? caseRow.secular_first ?? "case")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 40) || "case";
  const fileName = `transport-manifest_${last}_${generatedAt.slice(0, 10)}.pdf`;
  const path = `cases/${caseId}/manifests/${crypto.randomUUID()}-${fileName}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Save failed: ${upErr.message}` };

  const generatedFrom: GeneratedFrom = {
    template_key: MANIFEST_TEMPLATE_KEY,
    template_version: 1,
    data: { legCount: legs.length },
    generated_at: generatedAt,
  };
  const docInsert: DocumentInsert = {
    case_id: caseId,
    type: MANIFEST_TEMPLATE_KEY,
    status: "generated",
    storage_path: path,
    uploaded_by: "staff",
    generated_from: generatedFrom,
  };
  const { error: rowErr } = await supabase.from("documents").insert(docInsert as never);
  if (rowErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: `Could not record manifest: ${rowErr.message}` };
  }

  revalidatePath(`/cases/${caseId}`);

  const base64 = Buffer.from(bytes).toString("base64");
  return { ok: true, base64, fileName };
}
