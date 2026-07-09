/**
 * Derech — database types (hand-written).
 *
 * These mirror db/migrations/0001_init.sql one-to-one and exist so the app
 * workstream can type its data layer before a live Supabase project exists.
 *
 * >>> TEMPORARY: once a Supabase project is up, replace this file with
 * >>> generated types (`supabase gen types typescript --project-id <ref>`)
 * >>> and keep only the enum/helper aliases that the codegen doesn't emit.
 *
 * Conventions:
 * - `Uuid` / `IsoTimestamp` / `IsoDate` are branded-ish string aliases for
 *   readability; at runtime everything is a string over PostgREST.
 * - `Row` types describe what SELECT returns (all columns present).
 * - `Insert` types mark columns with DB defaults / nullables as optional.
 */

// ---------------------------------------------------------------------------
// Scalar aliases
// ---------------------------------------------------------------------------

export type Uuid = string;
/** timestamptz serialized by PostgREST, e.g. "2026-07-06T11:05:00+02:00" */
export type IsoTimestamp = string;
/** date column, e.g. "1941-03-12" */
export type IsoDate = string;
/** Postgres `inet` serialized as text */
export type InetString = string;
/** Arbitrary JSON (jsonb columns) */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ---------------------------------------------------------------------------
// Enums (mirror the Postgres enum types in 0001_init.sql)
// ---------------------------------------------------------------------------

/** Pipeline: Notified → Collected → Prepared (tahara) → Documents → Transport → Arrived → Buried */
export type CaseStatus =
  | 'notified'
  | 'collected'
  | 'prepared'
  | 'documents'
  | 'transport'
  | 'arrived'
  | 'buried';

export type DocumentStatus = 'needed' | 'requested' | 'received' | 'generated';

export type TransportLegType = 'ground' | 'air_cargo' | 'domestic_il';

export type TransportLegStatus = 'planned' | 'booked' | 'in_transit' | 'completed';

export type ContactRole =
  | 'family'
  | 'chevra_kadisha'
  | 'consulate'
  | 'airline_cargo'
  | 'hospital'
  | 'cemetery'
  | 'hearse_operator'
  | 'other';

export type MessageChannel = 'whatsapp' | 'email' | 'sms';

export type TaskStatus = 'open' | 'done' | 'cancelled';

// Text-check pseudo-enums (CHECK constraints, not Postgres enums)
export type StaffRole = 'owner' | 'staff';
export type IdType = 'israeli_id' | 'passport';
export type DocumentUploader = 'staff' | 'family';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export type IntakeStatus = 'new' | 'imported' | 'rejected';

// ---------------------------------------------------------------------------
// JSONB payload shapes (app-level contracts for jsonb columns)
// ---------------------------------------------------------------------------

/** cases.stage_timestamps — when each pipeline stage was entered */
export type StageTimestamps = Partial<Record<CaseStatus, IsoTimestamp>>;

/** transport_legs.custody — chain-of-custody entries, append-only by the app */
export interface CustodyEntry {
  at: IsoTimestamp;
  actor: string;
  note?: string;
  location?: string;
}

/** form_templates.pages */
export interface TemplatePage {
  img: string; // storage path or asset key of the page image
  w: number;
  h: number;
}

/** form_templates.fields — text overlay positions (PDF points) */
export interface TemplateField {
  key: string;
  page: number;
  x: number;
  y: number;
  maxWidth?: number;
  size?: number;
  type?: string; // 'text' | 'date' | 'digits' | ... (doc-engine defined)
}

/** form_templates.grids — per-digit box rows (e.g. ID-number boxes) */
export interface TemplateGrid {
  key: string;
  page: number;
  y: number;
  centers: number[]; // x-centers of each digit box
}

/** form_templates.checks — checkbox positions */
export interface TemplateCheck {
  key: string;
  page: number;
  x: number;
  y: number;
}

/** form_templates.bindings — field key → case attribute path ("case.secular_last") */
export type TemplateBindings = Record<string, string>;

/** documents.generated_from — immutable snapshot taken at generation time */
export interface GeneratedFrom {
  template_key: string;
  template_version: number;
  data: Record<string, Json>; // the resolved binding values used
  generated_at: IsoTimestamp;
}

/** intake_submissions.files — family uploads placed under case-docs/intake/ */
export interface IntakeFile {
  path: string; // storage path inside the 'case-docs' bucket
  name: string;
  size?: number;
  mime?: string;
}

// ---------------------------------------------------------------------------
// Table row / insert types
// ---------------------------------------------------------------------------

export interface StaffRow {
  id: Uuid; // = auth.users.id
  name: string;
  role: StaffRole;
  active: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export interface StaffInsert {
  id: Uuid; // must reference an existing auth user
  name: string;
  role?: StaffRole; // default 'staff'
  active?: boolean; // default true
}

export interface CaseRow {
  id: Uuid;
  hebrew_name: string | null;
  secular_first: string | null;
  secular_last: string | null;
  dob: IsoDate | null;
  dod: IsoTimestamp | null;
  place_of_death: string | null;
  place_of_birth: string | null; // 0004: binds permit field `pob` (case.place_of_birth)
  id_number: string | null;
  id_type: IdType | null;
  nationality: string | null;
  country: string | null;
  address: string | null;
  cause_of_death: string | null; // GDPR: medical data — handle with care
  icd_code: string | null;
  burial_place: string | null;
  cemetery: string | null;
  status: CaseStatus;
  urgency: number; // smallint; higher = more urgent (app-computed)
  assigned_to: Uuid | null;
  stage_timestamps: StageTimestamps;
  notes: string | null;
  permit_data: Record<string, unknown> | null; // 0005: raw New-permit form snapshot for verbatim regeneration
  deleted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export type CaseInsert = Partial<Omit<CaseRow, 'id' | 'created_at' | 'updated_at'>>;

export interface ContactRow {
  id: Uuid;
  name: string;
  org: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  roles: ContactRole[];
  notes: string | null;
  deleted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export type ContactInsert = Partial<Omit<ContactRow, 'id' | 'created_at' | 'updated_at'>> & {
  name: string;
};

export interface CaseContactRow {
  case_id: Uuid;
  contact_id: Uuid;
  role: ContactRole;
  created_at: IsoTimestamp;
}
export type CaseContactInsert = Omit<CaseContactRow, 'created_at'>;

export interface FormTemplateRow {
  id: Uuid;
  key: string; // unique, e.g. 'il-mfa-transfer-permit'
  title: string;
  lang: string | null;
  pdf_path: string | null; // path in 'form-templates' bucket
  page_width: number | null; // PDF points
  page_height: number | null;
  pages: TemplatePage[];
  fields: TemplateField[];
  grids: TemplateGrid[];
  checks: TemplateCheck[];
  bindings: TemplateBindings;
  version: number;
  active: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export type FormTemplateInsert = Partial<Omit<FormTemplateRow, 'id' | 'created_at' | 'updated_at'>> & {
  key: string;
  title: string;
};

export interface DocumentRow {
  id: Uuid;
  case_id: Uuid;
  template_key: string | null;
  type: string; // template key or free label ('death_certificate', ...)
  status: DocumentStatus;
  storage_path: string | null; // path in 'case-docs' bucket
  generated_from: GeneratedFrom | null;
  uploaded_by: DocumentUploader | null;
  deleted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export type DocumentInsert = Partial<Omit<DocumentRow, 'id' | 'created_at' | 'updated_at'>> & {
  case_id: Uuid;
  type: string;
};

export interface TransportLegRow {
  id: Uuid;
  case_id: Uuid;
  type: TransportLegType;
  status: TransportLegStatus;
  from_location: string | null;
  to_location: string | null;
  carrier: string | null;
  flight_no: string | null;
  awb_no: string | null; // air waybill
  scheduled_at: IsoTimestamp | null;
  custody: CustodyEntry[];
  deleted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export type TransportLegInsert = Partial<Omit<TransportLegRow, 'id' | 'created_at' | 'updated_at'>> & {
  case_id: Uuid;
  type: TransportLegType;
};

export interface TaskRow {
  id: Uuid;
  case_id: Uuid | null;
  title: string;
  due: IsoTimestamp | null;
  status: TaskStatus;
  assignee: Uuid | null;
  calendar_note: string | null; // e.g. 'before candle-lighting Fri 18:02'
  deleted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export type TaskInsert = Partial<Omit<TaskRow, 'id' | 'created_at' | 'updated_at'>> & {
  title: string;
};

export interface InvoiceRow {
  id: Uuid;
  case_id: Uuid;
  number: string | null;
  amount_cents: number;
  currency: string; // default 'EUR'
  status: InvoiceStatus;
  stripe_ref: string | null;
  issued_at: IsoTimestamp | null;
  paid_at: IsoTimestamp | null;
  deleted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export type InvoiceInsert = Partial<Omit<InvoiceRow, 'id' | 'created_at' | 'updated_at'>> & {
  case_id: Uuid;
};

export interface ExpenseRow {
  id: Uuid;
  case_id: Uuid;
  label: string;
  amount_cents: number;
  currency: string; // default 'EUR'
  incurred_at: IsoTimestamp | null;
  receipt_path: string | null; // path in 'case-docs' bucket
  deleted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export type ExpenseInsert = Partial<Omit<ExpenseRow, 'id' | 'created_at' | 'updated_at'>> & {
  case_id: Uuid;
  label: string;
};

export interface MessageRow {
  id: Uuid;
  case_id: Uuid;
  channel: MessageChannel;
  template_key: string | null; // app-level message template id
  recipient: string | null; // phone / e-mail as sent
  body: string | null;
  sent_at: IsoTimestamp | null;
  deleted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
export type MessageInsert = Partial<Omit<MessageRow, 'id' | 'created_at' | 'updated_at'>> & {
  case_id: Uuid;
  channel: MessageChannel;
};

export interface IntakeSubmissionRow {
  id: Uuid;
  case_id: Uuid | null; // set by staff once imported
  payload: Record<string, Json>;
  files: IntakeFile[];
  status: IntakeStatus;
  submitted_at: IsoTimestamp;
  source_ip: InetString | null;
  updated_at: IsoTimestamp;
}
/** Anon inserts are RLS-constrained to { status: 'new', case_id: null }. */
export interface IntakeSubmissionInsert {
  payload: Record<string, Json>;
  files?: IntakeFile[];
  status?: 'new';
  case_id?: null;
  source_ip?: InetString | null;
}

export interface ActivityLogRow {
  id: Uuid;
  case_id: Uuid | null;
  actor: Uuid | null; // auth.uid(); null for system/anon
  actor_label: string | null; // denormalized display name
  action: string; // 'case.created', 'document.generated', ...
  detail: Json | null;
  at: IsoTimestamp;
}
export type ActivityLogInsert = Partial<Omit<ActivityLogRow, 'id' | 'at'>> & {
  action: string;
};

// ---------------------------------------------------------------------------
// Supabase-style Database map (compatible with supabase-js generics until
// real codegen replaces this file)
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      staff: { Row: StaffRow; Insert: StaffInsert; Update: Partial<StaffInsert> };
      cases: { Row: CaseRow; Insert: CaseInsert; Update: CaseInsert };
      contacts: { Row: ContactRow; Insert: ContactInsert; Update: Partial<ContactInsert> };
      case_contacts: { Row: CaseContactRow; Insert: CaseContactInsert; Update: Partial<CaseContactInsert> };
      form_templates: { Row: FormTemplateRow; Insert: FormTemplateInsert; Update: Partial<FormTemplateInsert> };
      documents: { Row: DocumentRow; Insert: DocumentInsert; Update: Partial<DocumentInsert> };
      transport_legs: { Row: TransportLegRow; Insert: TransportLegInsert; Update: Partial<TransportLegInsert> };
      tasks: { Row: TaskRow; Insert: TaskInsert; Update: Partial<TaskInsert> };
      invoices: { Row: InvoiceRow; Insert: InvoiceInsert; Update: Partial<InvoiceInsert> };
      expenses: { Row: ExpenseRow; Insert: ExpenseInsert; Update: Partial<ExpenseInsert> };
      messages: { Row: MessageRow; Insert: MessageInsert; Update: Partial<MessageInsert> };
      intake_submissions: {
        Row: IntakeSubmissionRow;
        Insert: IntakeSubmissionInsert;
        Update: Partial<IntakeSubmissionRow>;
      };
      activity_log: { Row: ActivityLogRow; Insert: ActivityLogInsert; Update: never };
    };
    Enums: {
      case_status: CaseStatus;
      document_status: DocumentStatus;
      transport_leg_type: TransportLegType;
      transport_leg_status: TransportLegStatus;
      contact_role: ContactRole;
      message_channel: MessageChannel;
      task_status: TaskStatus;
    };
  };
}
