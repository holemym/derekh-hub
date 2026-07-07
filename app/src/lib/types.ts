/**
 * Derech domain types — mirrors PLANNING.md §5 (core entities) and §6 (pipeline).
 * Local-only for now; these shapes are what the db/ workstream will persist.
 */

/* ── Pipeline (PLANNING §6) ─────────────────────────────────────────────── */

export const PIPELINE_STAGES = [
  "notified",
  "collected",
  "prepared",
  "documents",
  "transport",
  "arrived",
  "buried",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

/* ── Contacts ───────────────────────────────────────────────────────────── */

export type ContactRole =
  | "family"
  | "chevra_kadisha"
  | "consulate"
  | "airline_cargo"
  | "hospital_morgue"
  | "cemetery"
  | "hearse_operator";

export interface Contact {
  id: string;
  name: string;
  role: ContactRole;
  phone?: string;
  email?: string;
  organization?: string;
  notes?: string;
}

export interface CaseContact {
  contactId: string;
  role: ContactRole;
}

/* ── Documents ──────────────────────────────────────────────────────────── */

export type DocumentStatus = "needed" | "received" | "generated";

export interface CaseDocument {
  id: string;
  caseId: string;
  /** FormTemplate key, e.g. "il-mfa-transfer-permit" */
  type: string;
  title: string;
  status: DocumentStatus;
  /** Storage path once uploaded/generated (later phase). */
  file?: string;
  /** Template + data snapshot it was generated from (later phase). */
  generatedFrom?: { templateKey: string; snapshotAt: string };
}

/* ── Transport ──────────────────────────────────────────────────────────── */

export type TransportLegType = "ground" | "air_cargo" | "domestic";

export type TransportLegStatus =
  | "planned"
  | "booked"
  | "in_transit"
  | "completed";

export interface TransportLeg {
  id: string;
  caseId: string;
  type: TransportLegType;
  /** IATA code or place name, e.g. "VIE" */
  from: string;
  /** IATA code or place name, e.g. "TLV" */
  to: string;
  carrier?: string;
  /** Flight number or air waybill number. */
  flightOrAwb?: string;
  scheduledAt?: string; // ISO datetime
  status: TransportLegStatus;
  /** Chain-of-custody timestamps. */
  custody: { handedOverAt?: string; receivedAt?: string };
}

/* ── Tasks ──────────────────────────────────────────────────────────────── */

export type TaskStatus = "open" | "done";

export interface Task {
  id: string;
  caseId?: string;
  title: string;
  /** ISO datetime; calendar-aware (never lands on Shabbos/Yom Tov). */
  due?: string;
  status: TaskStatus;
  assignee?: string;
}

/* ── Case (the niftar) ──────────────────────────────────────────────────── */

export interface Case {
  id: string;
  hebrewName: string;
  /** Combined "First Last" for display; derived from secular_first/last. */
  secularName: string;
  dob?: string; // ISO date
  dod: string; // ISO datetime — petira
  placeOfDeath: string;
  /** Where the niftar was born — permit field `pob` (DB place_of_birth). */
  placeOfBirth?: string;
  /** Last permanent address — permit field `address` (DB last_address ?? address). */
  lastAddress?: string;
  idOrPassport?: string;
  nationality: string;
  /** GDPR: medical data. Permit field `cause_of_death` (DB cause_of_death). */
  causeOfDeath?: string;
  /** ICD-10 code for cause of death (DB icd_code). */
  icdCode?: string;
  status: PipelineStage;
  /** Truly time-critical right now (drives the single red accent). */
  urgent: boolean;
  /** Message key under "urgency" or free text shown on the urgent chip. */
  urgencyNote?: string;
  cemetery?: string;
  burialPlace?: string;
  assignedTo?: string;
  /** When each stage was entered. */
  stageTimestamps: Partial<Record<PipelineStage, string>>;
  contacts: CaseContact[];
  documents: CaseDocument[];
  transportLegs: TransportLeg[];
  tasks: Task[];
}

/** The computed "do the next thing" for a case (PLANNING §2.3). */
export interface NextAction {
  /** i18n key under "actions" — one per pipeline stage. */
  key: PipelineStage;
  due?: string; // ISO datetime
}
