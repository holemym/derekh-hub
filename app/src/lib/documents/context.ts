/**
 * Document-context mapper — PLANNING §7 / ROADMAP M1.
 *
 * The doc-engine resolves template bindings (dot-paths like `case.secular_last`,
 * `transport.airline`, `funeral_service.company`, `declaration.date`) against a
 * NESTED context object — NOT against a raw DB row. This module is the schema →
 * context adapter: it turns a `Case` (src/lib/types.ts + mock/repo shape) into
 * the `{ case, transport, funeral_service, declaration, documents }` object the
 * il-mfa-transfer-permit template expects.
 *
 * Rules (from the task brief + the real blank form):
 *  - Dates render DD.MM.YYYY (dob, dod, transfer_date, license_expiry, decl_date).
 *  - The Funeral Service DECLARATION block (company "IKG Vienna", director
 *    "Mordechai Hammer", title "Funeral Director") is PRE-PRINTED on page 2 — we
 *    do NOT bind it. The template only fills `declaration.date` (the Date line).
 *  - Page-1 funeral-service NAME/ADDRESS, No., and licence expiry ARE fillable —
 *    IKG-fixed defaults, overridable via `opts.funeralService`.
 *  - Where the Case carries no data for a binding, we leave it empty; the engine
 *    skips empty fields.
 */

import type { Case } from "@/lib/types";

/* ── Date formatting ─────────────────────────────────────────────────────── */

/** Format an ISO date/datetime to DD.MM.YYYY (Europe/Vienna). Empty on invalid. */
export function formatPermitDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Use Vienna wall-clock so a late-evening petira doesn't roll to the next day.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  if (!day || !month || !year) return "";
  return `${day}.${month}.${year}`;
}

/* ── Name splitting ──────────────────────────────────────────────────────── */

/**
 * Split a Western "First [Middle] Last" secular name into { first, last }.
 * The form has separate Surname / First-Name cells; last token = surname,
 * the remainder = given name(s). Single-token names go entirely to surname.
 */
export function splitSecularName(full: string): { first: string; last: string } {
  const tokens = full.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: "", last: "" };
  if (tokens.length === 1) return { first: "", last: tokens[0]! };
  const last = tokens[tokens.length - 1]!;
  const first = tokens.slice(0, -1).join(" ");
  return { first, last };
}

/* ── ID/passport → digit grid ────────────────────────────────────────────── */

/**
 * The id_number grid is one glyph per printed box. Strip spaces and dashes so
 * "P-AT 4471822" → "PAT4471822" and lands one char per cell. Overflow beyond
 * the box count is truncated by the engine (and flagged by validate()).
 */
export function idForGrid(idOrPassport?: string): string {
  if (!idOrPassport) return "";
  return idOrPassport.replace(/[\s\-]/g, "").toUpperCase();
}

/* ── Fixed IKG funeral-service details (page-1 fillable block) ────────────── */

export interface FuneralServiceContext {
  /** Name & address of the burial company in Israel (page-1 field). */
  name_address: string;
  /** Funeral-service licence number → digit grid. */
  license_no: string;
  /** Licence expiry date (DD.MM.YYYY). */
  license_expiry: string;
}

/**
 * IKG Vienna operates through a licensed Israeli burial company. These are
 * placeholder-but-plausible defaults; the real licence number/expiry live on
 * the FuneralService/contact record later and are passed via opts. Kept here so
 * the permit is complete out of the box and the mapping is exercised end-to-end.
 */
export const DEFAULT_FUNERAL_SERVICE: FuneralServiceContext = {
  name_address: "See attachment",
  license_no: "",
  license_expiry: "",
};

/* ── Document-checklist (page-2 checkboxes) ──────────────────────────────── */

export interface PermitDocumentChecks {
  death_certificate?: boolean;
  id_copy?: boolean;
  doctor_certificate?: boolean;
  local_transfer_permit?: boolean;
  sealing_permit?: boolean;
  c19_sealing?: boolean;
  funeral_acceptance?: boolean;
  preservation_certificate?: boolean;
  moh_permit?: boolean;
}

/**
 * The standard IKG document packet that accompanies a transfer permit. C19
 * sealing, preservation certificate, and the MoH special-case permit default
 * OFF (they only apply in specific situations). Override via opts.documents.
 */
export const DEFAULT_DOCUMENT_CHECKS: PermitDocumentChecks = {
  death_certificate: true,
  id_copy: true,
  doctor_certificate: true,
  local_transfer_permit: true,
  sealing_permit: true,
  c19_sealing: false,
  funeral_acceptance: true,
  preservation_certificate: false,
  moh_permit: false,
};

/* ── Options ─────────────────────────────────────────────────────────────── */

export interface BuildPermitContextOpts {
  /** Override IKG funeral-service defaults (real licence no./expiry). */
  funeralService?: Partial<FuneralServiceContext>;
  /** Override which document-checkboxes are ticked. */
  documents?: PermitDocumentChecks;
  /** Declaration date (defaults to today, Vienna). Accepts ISO. */
  declarationDate?: string;
  /** Cause of death / ICD code — override the Case's own values if passed. */
  causeOfDeath?: string;
  icdCode?: string;
  /** Place of birth / last permanent address — override the Case's values. */
  placeOfBirth?: string;
  lastAddress?: string;
}

/* ── The context object shape (what bindings resolve against) ────────────── */

export interface PermitContext {
  case: {
    secular_last: string;
    secular_first: string;
    dob: string;
    place_of_birth: string;
    last_address: string;
    nationality: string;
    id_number: string;
    dod: string;
    place_of_death: string;
    cause_of_death: string;
    icd_code: string;
    burial_place: string;
  };
  transport: {
    flight_no: string;
    airline: string;
    disembarkation_point: string;
    transfer_date: string;
  };
  funeral_service: FuneralServiceContext;
  declaration: { date: string };
  documents: PermitDocumentChecks;
}

/* ── The mapper ──────────────────────────────────────────────────────────── */

/**
 * Map a Case into the permit context the il-mfa-transfer-permit template
 * resolves against. Pure; no I/O.
 */
export function buildPermitContext(
  caseRow: Case,
  opts: BuildPermitContextOpts = {},
): PermitContext {
  const { first, last } = splitSecularName(caseRow.secularName);

  // Prefer an air-cargo leg (VIE→TLV) for flight/airline/disembarkation.
  const air =
    caseRow.transportLegs.find((l) => l.type === "air_cargo") ??
    caseRow.transportLegs[0];

  return {
    case: {
      secular_last: last,
      secular_first: first,
      dob: formatPermitDate(caseRow.dob),
      // Real case fields now carry these (reconciled with the DB schema);
      // opts remain as an override for callers that pass explicit values.
      place_of_birth: opts.placeOfBirth ?? caseRow.placeOfBirth ?? "",
      last_address: opts.lastAddress ?? caseRow.lastAddress ?? "",
      nationality: caseRow.nationality ?? "",
      id_number: idForGrid(caseRow.idOrPassport),
      dod: formatPermitDate(caseRow.dod),
      place_of_death: caseRow.placeOfDeath ?? "",
      cause_of_death: opts.causeOfDeath ?? caseRow.causeOfDeath ?? "",
      icd_code: opts.icdCode ?? caseRow.icdCode ?? "",
      // Burial place: the specific plot if known, else the cemetery.
      burial_place: caseRow.burialPlace ?? caseRow.cemetery ?? "",
    },
    transport: {
      flight_no: air?.flightOrAwb ?? "",
      airline: air?.carrier ?? "",
      // "Point of Disembarkation into Israel" — the leg destination (e.g. TLV).
      disembarkation_point: air?.to ?? "",
      transfer_date: formatPermitDate(air?.scheduledAt),
    },
    funeral_service: {
      ...DEFAULT_FUNERAL_SERVICE,
      ...opts.funeralService,
      // licence expiry is a date field → DD.MM.YYYY (accepts ISO in).
      license_expiry: opts.funeralService?.license_expiry
        ? formatPermitDate(opts.funeralService.license_expiry)
        : DEFAULT_FUNERAL_SERVICE.license_expiry,
    },
    declaration: {
      date: formatPermitDate(opts.declarationDate ?? new Date().toISOString()),
    },
    documents: opts.documents ?? DEFAULT_DOCUMENT_CHECKS,
  };
}
