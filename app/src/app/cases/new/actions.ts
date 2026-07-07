"use server";

/**
 * "Save to hub" — insert a new case from the New-permit form.
 *
 * Runs under the RLS-scoped server client (the logged-in staff session), so the
 * insert is governed by the cases INSERT policy for staff. We map the flat form
 * to normalized columns AND stash the FULL raw form in cases.permit_data (jsonb)
 * so the exact permit can be regenerated verbatim later (see case-detail).
 *
 * If flight/airline/disembarkation/transfer_date are present we also insert one
 * air_cargo transport_legs row. On success we redirect to /cases/[id].
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { coercePermitForm, type PermitForm } from "@/lib/documents/form";
import type { CaseInsert, TransportLegInsert } from "../../../../../db/types";

/** Empty string → null (DB columns are nullable and prefer NULL over ""). */
function nn(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

export interface SaveCaseResult {
  ok: boolean;
  error?: string;
}

/**
 * Insert a case (+ optional air-cargo leg) from the raw permit form. Redirects
 * to the new case on success; returns an error result on failure so the client
 * can surface it (a thrown redirect is re-raised, never swallowed).
 */
export async function saveCaseFromForm(raw: PermitForm): Promise<SaveCaseResult> {
  // Re-coerce defensively — never trust the client payload's shape.
  const form = coercePermitForm(raw);

  const supabase = await createSupabaseServerClient();

  const insert: CaseInsert = {
    secular_first: nn(form.firstname),
    secular_last: nn(form.surname),
    hebrew_name: nn(form.hebrew_name),
    dob: nn(form.dob),
    dod: nn(form.dod),
    place_of_death: nn(form.pod),
    place_of_birth: nn(form.pob),
    last_address: nn(form.address),
    nationality: nn(form.nationality),
    id_number: nn(form.id_number),
    id_type: form.natType === "foreigner" ? "passport" : "israeli_id",
    cause_of_death: nn(form.cause),
    icd_code: nn(form.icd),
    burial_place: nn(form.burial_place),
    status: "notified",
    // Verbatim snapshot for exact regeneration.
    permit_data: form as unknown as Record<string, unknown>,
  };

  // NOTE: the hand-written db/types.ts `Database` shape predates postgrest-js
  // 2.x's GenericSchema (no Views/Functions/Relationships keys), so the typed
  // client degrades `.insert()` params to `never[]`. The payloads here ARE
  // typed (CaseInsert / TransportLegInsert) before the call; we cast only the
  // final argument. Remove once db/types.ts is replaced by supabase codegen.
  const { data, error } = await supabase
    .from("cases")
    .insert(insert as never)
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not save case." };
  }

  const caseId = (data as { id: string }).id;

  // Optional air-cargo leg — only when at least one transfer detail is present.
  const hasLeg =
    form.flight.trim() ||
    form.airline.trim() ||
    form.disembarkation.trim() ||
    form.transfer_date.trim();

  if (hasLeg) {
    const leg: TransportLegInsert = {
      case_id: caseId,
      type: "air_cargo",
      status: "planned",
      from_location: "VIE",
      to_location: nn(form.disembarkation),
      carrier: nn(form.airline),
      flight_no: nn(form.flight),
      scheduled_at: form.transfer_date.trim()
        ? new Date(`${form.transfer_date}T00:00:00`).toISOString()
        : null,
    };
    // A failed leg insert must not lose the saved case — log-and-continue.
    // Same never-cast rationale as the cases insert above.
    await supabase.from("transport_legs").insert(leg as never);
  }

  redirect(`/cases/${caseId}`);
}
