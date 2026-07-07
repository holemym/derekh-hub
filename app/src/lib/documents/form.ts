/**
 * New-permit FORM contract + form→permit-context builder.
 *
 * The "New permit" screen (src/app/cases/new) collects exactly the standalone
 * tool's field set (burial-permit-v2/dev/template.html). This module is the
 * single source of truth for:
 *   - the raw form shape (`PermitForm`) that is stored verbatim in
 *     cases.permit_data (jsonb) so nothing the operator typed is ever lost, and
 *   - `buildPermitContextFromForm`, which turns that raw form into the SAME
 *     nested `{ case, transport, funeral_service, declaration, documents }`
 *     object the il-mfa-transfer-permit template bindings resolve against
 *     (see context.ts + the template JSON).
 *
 * Dates come in as native-date ISO ("YYYY-MM-DD") and print DD.MM.YYYY, exactly
 * like the standalone. Producing the same context guarantees a permit identical
 * in layout to the standalone's output.
 */

import { formatPermitDate, idForGrid, type PermitContext } from "./context";

/* ── The raw form the New-permit screen collects ─────────────────────────── */

/** The nine attached-document checkboxes (page 2), in form order. */
export interface PermitFormDocuments {
  death_certificate: boolean;
  id_copy: boolean;
  doctor_certificate: boolean;
  local_transfer_permit: boolean;
  sealing_permit: boolean;
  c19_sealing: boolean;
  funeral_acceptance: boolean;
  preservation_certificate: boolean;
  moh_permit: boolean;
}

/** Israeli citizen (ID No.) vs. Foreigner (Passport No.). */
export type PermitNationalityType = "israeli" | "foreigner";

/**
 * Everything the New-permit screen collects — a flat, verbatim snapshot. Text
 * values are trimmed; date values are ISO ("YYYY-MM-DD") or "". This is what we
 * persist to cases.permit_data so the exact permit can be regenerated later.
 */
export interface PermitForm {
  // 1 · The deceased
  surname: string;
  firstname: string;
  hebrew_name: string;
  dob: string; // ISO date
  pob: string;
  address: string;
  nationality: string;
  /** Israeli citizen → ID No.; foreigner → passport No. */
  natType: PermitNationalityType;
  /** Israeli ID number or passport number (raw, as typed). */
  id_number: string;

  // 2 · Death
  dod: string; // ISO date
  pod: string;
  cause: string;
  icd: string;

  // 3 · Transfer to Israel
  burial_place: string;
  flight: string;
  airline: string;
  disembarkation: string;
  transfer_date: string; // ISO date

  // 4 · Funeral service in Israel
  funeral_service: string;
  funeral_no: string;
  license_expiry: string; // ISO date

  // 5 · Attached documents
  documents: PermitFormDocuments;

  // 6 · Declaration
  decl_date: string; // ISO date
}

/** Sensible empty form. Defaults mirror the standard IKG document packet. */
export function emptyPermitForm(today: string): PermitForm {
  return {
    surname: "",
    firstname: "",
    hebrew_name: "",
    dob: "",
    pob: "",
    address: "",
    nationality: "",
    natType: "israeli",
    id_number: "",
    dod: "",
    pod: "",
    cause: "",
    icd: "",
    burial_place: "",
    flight: "",
    airline: "",
    disembarkation: "",
    transfer_date: "",
    funeral_service: "",
    funeral_no: "",
    license_expiry: "",
    documents: {
      death_certificate: true,
      id_copy: true,
      doctor_certificate: true,
      local_transfer_permit: true,
      sealing_permit: true,
      c19_sealing: false,
      funeral_acceptance: true,
      preservation_certificate: false,
      moh_permit: false,
    },
    decl_date: today,
  };
}

/**
 * Coerce an untyped object (e.g. cases.permit_data read back from the DB) into a
 * PermitForm, filling any missing keys with empty defaults. Tolerant by design
 * so an older/partial snapshot still regenerates.
 */
export function coercePermitForm(raw: unknown): PermitForm {
  const base = emptyPermitForm("");
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const str = (k: string, fallback = ""): string =>
    typeof o[k] === "string" ? (o[k] as string) : fallback;
  const docsIn = (o.documents ?? {}) as Record<string, unknown>;
  const bool = (k: keyof PermitFormDocuments): boolean =>
    typeof docsIn[k] === "boolean"
      ? (docsIn[k] as boolean)
      : base.documents[k];

  return {
    surname: str("surname"),
    firstname: str("firstname"),
    hebrew_name: str("hebrew_name"),
    dob: str("dob"),
    pob: str("pob"),
    address: str("address"),
    nationality: str("nationality"),
    natType: o.natType === "foreigner" ? "foreigner" : "israeli",
    id_number: str("id_number"),
    dod: str("dod"),
    pod: str("pod"),
    cause: str("cause"),
    icd: str("icd"),
    burial_place: str("burial_place"),
    flight: str("flight"),
    airline: str("airline"),
    disembarkation: str("disembarkation"),
    transfer_date: str("transfer_date"),
    funeral_service: str("funeral_service"),
    funeral_no: str("funeral_no"),
    license_expiry: str("license_expiry"),
    documents: {
      death_certificate: bool("death_certificate"),
      id_copy: bool("id_copy"),
      doctor_certificate: bool("doctor_certificate"),
      local_transfer_permit: bool("local_transfer_permit"),
      sealing_permit: bool("sealing_permit"),
      c19_sealing: bool("c19_sealing"),
      funeral_acceptance: bool("funeral_acceptance"),
      preservation_certificate: bool("preservation_certificate"),
      moh_permit: bool("moh_permit"),
    },
    decl_date: str("decl_date"),
  };
}

/* ── form → permit context ───────────────────────────────────────────────── */

/**
 * Turn a raw New-permit form into the nested context the il-mfa-transfer-permit
 * template resolves against. Identical shape to buildPermitContext(Case) so the
 * engine and the render tests treat both paths the same.
 *
 * Dates → DD.MM.YYYY. The ID/passport is stripped of spaces/dashes and
 * upper-cased for the per-box digit grid. Funeral-service No. becomes the
 * `funeral_no` digit grid via funeral_service.license_no.
 */
export function buildPermitContextFromForm(form: PermitForm): PermitContext {
  return {
    case: {
      secular_last: form.surname.trim(),
      secular_first: form.firstname.trim(),
      dob: formatPermitDate(form.dob),
      place_of_birth: form.pob.trim(),
      last_address: form.address.trim(),
      nationality: form.nationality.trim(),
      id_number: idForGrid(form.id_number),
      dod: formatPermitDate(form.dod),
      place_of_death: form.pod.trim(),
      cause_of_death: form.cause.trim(),
      icd_code: form.icd.trim(),
      burial_place: form.burial_place.trim(),
    },
    transport: {
      flight_no: form.flight.trim(),
      airline: form.airline.trim(),
      disembarkation_point: form.disembarkation.trim(),
      transfer_date: formatPermitDate(form.transfer_date),
    },
    funeral_service: {
      name_address: form.funeral_service.trim(),
      // The 9-box Funeral-service No. grid.
      license_no: idForGrid(form.funeral_no),
      license_expiry: formatPermitDate(form.license_expiry),
    },
    declaration: {
      date: formatPermitDate(form.decl_date),
    },
    documents: { ...form.documents },
  };
}
