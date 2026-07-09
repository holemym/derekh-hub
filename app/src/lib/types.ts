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
  | "hearse_operator"
  | "other";

/** All roles, in picker order (family first — the most common link). */
export const CONTACT_ROLES: readonly ContactRole[] = [
  "family",
  "chevra_kadisha",
  "consulate",
  "airline_cargo",
  "hospital_morgue",
  "cemetery",
  "hearse_operator",
  "other",
] as const;

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

/** A shared address-book entry (the /contacts book; DB `contacts` row). */
export interface ContactBookEntry {
  id: string;
  name: string;
  organization?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  notes?: string;
  /** Which roles this contact usually plays (tags on the book entry). */
  roles: ContactRole[];
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

/** The four ordered leg states, for advance UI + labels. */
export const TRANSPORT_LEG_STATUSES: readonly TransportLegStatus[] = [
  "planned",
  "booked",
  "in_transit",
  "completed",
] as const;

export function legStatusIndex(s: TransportLegStatus): number {
  return TRANSPORT_LEG_STATUSES.indexOf(s);
}

/** Chain-of-custody event kinds (who did what to the niftar, when). */
export type CustodyEventKind =
  | "collected"
  | "handed_over"
  | "received"
  | "released";

export const CUSTODY_EVENT_KINDS: readonly CustodyEventKind[] = [
  "collected",
  "handed_over",
  "received",
  "released",
] as const;

/** One append-only chain-of-custody entry (app projection of the jsonb row). */
export interface CustodyEvent {
  event: CustodyEventKind;
  /** ISO datetime the event occurred. */
  at: string;
  /** Who performed / witnessed it (staff name, carrier agent, …). */
  by?: string;
  note?: string;
}

export interface TransportLeg {
  id: string;
  caseId: string;
  type: TransportLegType;
  /** IATA code or place name, e.g. "VIE" */
  from: string;
  /** IATA code or place name, e.g. "TLV" */
  to: string;
  carrier?: string;
  /** Flight number or air waybill number (the merged display value). */
  flightOrAwb?: string;
  /** Raw flight number (air legs). */
  flightNo?: string;
  /** Raw air-waybill number (air-cargo legs). */
  awbNo?: string;
  scheduledAt?: string; // ISO datetime
  status: TransportLegStatus;
  /** Full append-only chain-of-custody, oldest first. */
  custodyChain: CustodyEvent[];
  /** Convenience projection of the chain (first hand-over / completion). */
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

/* ── Money (ROADMAP M4) ─────────────────────────────────────────────────── */

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

/** The four ordered non-void invoice states, for advance UI + labels. */
export const INVOICE_FLOW: readonly InvoiceStatus[] = [
  "draft",
  "sent",
  "paid",
] as const;

export interface Invoice {
  id: string;
  caseId: string;
  number?: string;
  /** Amount in cents; display in EUR. */
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt?: string;
  paidAt?: string;
  /** Stripe payment-link URL once created (M4.5). */
  stripeRef?: string;
}

export interface Expense {
  id: string;
  caseId: string;
  label: string;
  amountCents: number;
  currency: string;
  incurredAt?: string;
}

/** Per-case money roll-up (all in cents). */
export interface MoneySummary {
  /** Sum of invoices that are sent or paid (i.e. actually billed). */
  invoicedCents: number;
  paidCents: number;
  /** invoiced − paid (money still owed to us). */
  outstandingCents: number;
  expensesCents: number;
  /** paid − expenses (cash net for the case). */
  netCents: number;
}

/* ── Comms (ROADMAP M4) ─────────────────────────────────────────────────── */

export type MessageChannel = "whatsapp" | "email" | "sms";

/** Family status-update template keys (rendered per §5, EN/DE). */
export type MessageTemplateKey =
  | "received"
  | "documents_ready"
  | "permit_issued"
  | "in_transit"
  | "arrived"
  | "buried";

export const MESSAGE_TEMPLATE_KEYS: readonly MessageTemplateKey[] = [
  "received",
  "documents_ready",
  "permit_issued",
  "in_transit",
  "arrived",
  "buried",
] as const;

/** A logged outbound message (family status update). */
export interface Message {
  id: string;
  caseId: string;
  channel: MessageChannel;
  templateKey?: string;
  recipient?: string;
  body?: string;
  sentAt?: string;
}

/** A contact resolved for a case, in a role (comms recipient projection). */
export interface CaseContactCard {
  contactId: string;
  role: ContactRole;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  organization?: string;
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
  /** Last permanent address — permit field `address` (DB cases.address). */
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
  /**
   * Raw New-permit form snapshot (DB cases.permit_data). When present, the
   * permit regenerates VERBATIM from this — including funeral-service No.,
   * licence expiry and the 9 document checkboxes that have no normalized
   * columns. Shape = PermitForm (src/lib/documents/form.ts).
   */
  permitData?: Record<string, unknown>;
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
