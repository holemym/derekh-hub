/**
 * DB row → app domain mappers.
 *
 * The app `Case` shape (src/lib/types.ts) is a UI-facing, camelCase projection.
 * The DB `CaseRow` (../db/types.ts) is the canonical Postgres row. This module
 * is the single place that bridges the two — the repo maps every row it reads
 * through here so pages/components never touch raw DB shapes.
 */

import type {
  CaseRow,
  TransportLegRow,
  DocumentRow,
  CaseContactRow,
  TaskRow,
} from "../../../../db/types";
import type {
  Case,
  CaseDocument,
  CaseContact,
  TransportLeg,
  TransportLegType,
  Task,
  ContactRole,
  PipelineStage,
} from "@/lib/types";

/** urgency (smallint, higher = hotter) → the single boolean red accent. */
const URGENT_THRESHOLD = 3;

function combineName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function mapLegType(t: TransportLegRow["type"]): TransportLegType {
  // DB 'domestic_il' collapses to the app's 'domestic'.
  if (t === "air_cargo") return "air_cargo";
  if (t === "ground") return "ground";
  return "domestic";
}

/** DB contact role → app contact role ('hospital' → 'hospital_morgue'). */
function mapContactRole(role: CaseContactRow["role"]): ContactRole | null {
  switch (role) {
    case "family":
      return "family";
    case "chevra_kadisha":
      return "chevra_kadisha";
    case "consulate":
      return "consulate";
    case "airline_cargo":
      return "airline_cargo";
    case "hospital":
      return "hospital_morgue";
    case "cemetery":
      return "cemetery";
    case "hearse_operator":
      return "hearse_operator";
    default:
      return null; // 'other' has no app-side card yet
  }
}

export function mapTransportLeg(row: TransportLegRow): TransportLeg {
  // Chain-of-custody is an append-only array in the DB; project the first
  // hand-over and the completion (if present) into the app's flat shape.
  const custody = Array.isArray(row.custody) ? row.custody : [];
  const handedOverAt = custody[0]?.at;
  const receivedAt =
    row.status === "completed" ? custody[custody.length - 1]?.at : undefined;

  return {
    id: row.id,
    caseId: row.case_id,
    type: mapLegType(row.type),
    from: row.from_location ?? "",
    to: row.to_location ?? "",
    carrier: row.carrier ?? undefined,
    flightOrAwb: row.flight_no ?? row.awb_no ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined,
    status: row.status,
    custody: { handedOverAt, receivedAt },
  };
}

export function mapDocument(row: DocumentRow): CaseDocument {
  // App's DocumentStatus is a subset of DB's ('requested' → 'needed').
  const status =
    row.status === "generated"
      ? "generated"
      : row.status === "received"
        ? "received"
        : "needed";
  return {
    id: row.id,
    caseId: row.case_id,
    type: row.template_key ?? row.type,
    title: row.type,
    status,
    file: row.storage_path ?? undefined,
    generatedFrom: row.generated_from
      ? {
          templateKey: row.generated_from.template_key,
          snapshotAt: row.generated_from.generated_at,
        }
      : undefined,
  };
}

export function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    caseId: row.case_id ?? undefined,
    title: row.title,
    due: row.due ?? undefined,
    status: row.status === "done" ? "done" : "open",
    assignee: row.assignee ?? undefined,
  };
}

export function mapCaseContact(row: CaseContactRow): CaseContact | null {
  const role = mapContactRole(row.role);
  if (!role) return null;
  return { contactId: row.contact_id, role };
}

/**
 * The fully-linked row set for one case. All child arrays are optional so a
 * bare `cases` SELECT (list views) still maps cleanly.
 */
export interface CaseRowBundle {
  case: CaseRow;
  transportLegs?: TransportLegRow[];
  documents?: DocumentRow[];
  contacts?: CaseContactRow[];
  tasks?: TaskRow[];
}

export function mapCase(bundle: CaseRowBundle): Case {
  const r = bundle.case;
  return {
    id: r.id,
    hebrewName: r.hebrew_name ?? "",
    secularName: combineName(r.secular_first, r.secular_last),
    dob: r.dob ?? undefined,
    dod: r.dod ?? "",
    placeOfDeath: r.place_of_death ?? "",
    placeOfBirth: r.place_of_birth ?? undefined,
    // ROADMAP reconciliation: standardize on ONE address for the permit —
    // prefer last_address (0004), fall back to the original address (0001).
    lastAddress: r.last_address ?? r.address ?? undefined,
    idOrPassport: r.id_number ?? undefined,
    nationality: r.nationality ?? "",
    causeOfDeath: r.cause_of_death ?? undefined,
    icdCode: r.icd_code ?? undefined,
    status: r.status as PipelineStage,
    urgent: (r.urgency ?? 0) >= URGENT_THRESHOLD,
    urgencyNote: undefined,
    cemetery: r.cemetery ?? undefined,
    burialPlace: r.burial_place ?? undefined,
    assignedTo: r.assigned_to ?? undefined,
    stageTimestamps: (r.stage_timestamps ?? {}) as Partial<
      Record<PipelineStage, string>
    >,
    contacts: (bundle.contacts ?? [])
      .map(mapCaseContact)
      .filter((c): c is CaseContact => c !== null),
    documents: (bundle.documents ?? []).map(mapDocument),
    transportLegs: (bundle.transportLegs ?? []).map(mapTransportLeg),
    tasks: (bundle.tasks ?? []).map(mapTask),
  };
}
