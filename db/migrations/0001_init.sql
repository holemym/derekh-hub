-- =============================================================================
-- Derech — burial & body-transport operations hub
-- Migration 0001: core schema (enums, tables, triggers, indexes)
--
-- Target: Supabase Postgres 15+.  gen_random_uuid() is built into PG 13+,
-- no extension required.  auth.users is provided by Supabase Auth.
--
-- NOTE: this SQL has been carefully reviewed but NOT executed against a live
-- database (no Supabase project exists yet). Apply via the Supabase SQL
-- editor or `supabase db push` and watch for errors on first run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- The case pipeline (PLANNING.md §6):
-- Notified → Collected → Prepared (tahara) → Documents & Permits →
-- Transport → Arrived → Buried
create type public.case_status as enum (
  'notified',
  'collected',
  'prepared',
  'documents',
  'transport',
  'arrived',
  'buried'
);

create type public.document_status as enum (
  'needed',
  'requested',
  'received',
  'generated'
);

create type public.transport_leg_type as enum (
  'ground',
  'air_cargo',
  'domestic_il'
);

create type public.transport_leg_status as enum (
  'planned',
  'booked',
  'in_transit',
  'completed'
);

create type public.contact_role as enum (
  'family',
  'chevra_kadisha',
  'consulate',
  'airline_cargo',
  'hospital',
  'cemetery',
  'hearse_operator',
  'other'
);

create type public.message_channel as enum (
  'whatsapp',
  'email',
  'sms'
);

create type public.task_status as enum (
  'open',
  'done',
  'cancelled'
);

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- staff — app users; row id mirrors auth.users.id (Supabase Auth)
-- -----------------------------------------------------------------------------

create table public.staff (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  role       text not null default 'staff' check (role in ('owner', 'staff')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_staff_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- cases — one row per niftar; the heart of the system
-- -----------------------------------------------------------------------------

create table public.cases (
  id               uuid primary key default gen_random_uuid(),
  hebrew_name      text,
  secular_first    text,
  secular_last     text,
  dob              date,
  dod              timestamptz,
  place_of_death   text,
  id_number        text,
  id_type          text check (id_type in ('israeli_id', 'passport')),
  nationality      text,
  country          text,
  address          text,
  cause_of_death   text,          -- medical data: GDPR-sensitive, see README
  icd_code         text,
  burial_place     text,
  cemetery         text,
  status           public.case_status not null default 'notified',
  urgency          smallint not null default 0,  -- computed by app (Shabbos/halacha aware); higher = more urgent
  assigned_to      uuid references public.staff (id) on delete set null,
  stage_timestamps jsonb not null default '{}'::jsonb,  -- { "notified": "...ts...", "collected": ... }
  notes            text,
  deleted_at       timestamptz,   -- soft delete; hard delete reserved for owner (GDPR purge)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_cases_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

create index idx_cases_status      on public.cases (status);
create index idx_cases_assigned_to on public.cases (assigned_to);

-- -----------------------------------------------------------------------------
-- contacts — shared address book (chevra kadisha, consulate, airlines, ...)
-- -----------------------------------------------------------------------------

create table public.contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  org        text,
  phone      text,
  email      text,
  whatsapp   text,
  roles      public.contact_role[] not null default '{}',
  notes      text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- case_contacts — links a contact to a case in a specific role
-- -----------------------------------------------------------------------------

create table public.case_contacts (
  case_id    uuid not null references public.cases (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  role       public.contact_role not null,
  created_at timestamptz not null default now(),
  primary key (case_id, contact_id, role)
);

-- PK covers (case_id, ...); contact_id needs its own index for reverse lookups.
create index idx_case_contacts_contact_id on public.case_contacts (contact_id);

-- -----------------------------------------------------------------------------
-- form_templates — the generic document engine (PLANNING.md §7)
-- A form is DATA: coordinates + bindings, calibrated in the admin UI.
-- -----------------------------------------------------------------------------

create table public.form_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- e.g. 'il-mfa-transfer-permit'
  title       text not null,
  lang        text,                          -- 'he', 'de', 'en', ...
  pdf_path    text,                          -- storage path in 'form-templates' bucket
  page_width  numeric,                       -- PDF points
  page_height numeric,
  pages       jsonb not null default '[]'::jsonb,  -- [{ img, w, h }]
  fields      jsonb not null default '[]'::jsonb,  -- [{ key, page, x, y, maxWidth, size, type }]
  grids       jsonb not null default '[]'::jsonb,  -- [{ key, page, y, centers[] }] per-digit boxes
  checks      jsonb not null default '[]'::jsonb,  -- [{ key, page, x, y }]
  bindings    jsonb not null default '{}'::jsonb,  -- { field_key: "case.attribute.path" }
  version     integer not null default 1,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_form_templates_updated_at
  before update on public.form_templates
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- documents — the per-case document vault
-- -----------------------------------------------------------------------------

create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references public.cases (id) on delete cascade,
  template_key   text references public.form_templates (key) on update cascade on delete set null,
  type           text not null,             -- template key or free label ('death_certificate', ...)
  status         public.document_status not null default 'needed',
  storage_path   text,                      -- path in 'case-docs' bucket (private, signed URLs only)
  generated_from jsonb,                     -- snapshot: { template_key, version, data } at generation time
  uploaded_by    text check (uploaded_by in ('staff', 'family')),
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create index idx_documents_case_id_status on public.documents (case_id, status);
create index idx_documents_template_key   on public.documents (template_key);

-- -----------------------------------------------------------------------------
-- transport_legs — ground / air-cargo / domestic-IL movement of the niftar
-- -----------------------------------------------------------------------------

create table public.transport_legs (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.cases (id) on delete cascade,
  type          public.transport_leg_type not null,
  status        public.transport_leg_status not null default 'planned',
  from_location text,
  to_location   text,
  carrier       text,
  flight_no     text,
  awb_no        text,                       -- air waybill
  scheduled_at  timestamptz,
  custody       jsonb not null default '[]'::jsonb,  -- chain-of-custody: [{ at, actor, note }]
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_transport_legs_updated_at
  before update on public.transport_legs
  for each row execute function public.set_updated_at();

create index idx_transport_legs_case_id on public.transport_legs (case_id);

-- -----------------------------------------------------------------------------
-- tasks — calendar-aware to-dos, optionally linked to a case
-- -----------------------------------------------------------------------------

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid references public.cases (id) on delete set null,
  title         text not null,
  due           timestamptz,
  status        public.task_status not null default 'open',
  assignee      uuid references public.staff (id) on delete set null,
  calendar_note text,                       -- e.g. 'before candle-lighting Fri 18:02'
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create index idx_tasks_case_id  on public.tasks (case_id);
create index idx_tasks_assignee on public.tasks (assignee);
create index idx_tasks_due      on public.tasks (due);

-- -----------------------------------------------------------------------------
-- invoices / expenses — money per case
-- -----------------------------------------------------------------------------

create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases (id) on delete cascade,
  number       text,
  amount_cents integer not null default 0,
  currency     text not null default 'EUR',
  status       text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  stripe_ref   text,
  issued_at    timestamptz,
  paid_at      timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create index idx_invoices_case_id on public.invoices (case_id);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases (id) on delete cascade,
  label        text not null,
  amount_cents integer not null default 0,
  currency     text not null default 'EUR',
  incurred_at  timestamptz,
  receipt_path text,                        -- path in 'case-docs' bucket
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create index idx_expenses_case_id on public.expenses (case_id);

-- -----------------------------------------------------------------------------
-- messages — outbound family/partner communication log
-- -----------------------------------------------------------------------------

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases (id) on delete cascade,
  channel      public.message_channel not null,
  template_key text,                        -- message template identifier (app-level)
  recipient    text,                        -- phone / e-mail as sent
  body         text,
  sent_at      timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_messages_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

create index idx_messages_case_id on public.messages (case_id);

-- -----------------------------------------------------------------------------
-- intake_submissions — the PUBLIC family-intake path (anon INSERT only, see RLS)
-- Raw payload lands here; staff review and import it into a case.
-- -----------------------------------------------------------------------------

create table public.intake_submissions (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid references public.cases (id) on delete set null,  -- set once imported
  payload      jsonb not null,              -- raw intake form data
  files        jsonb not null default '[]'::jsonb,  -- [{ path, name, size }] under case-docs/intake/
  status       text not null default 'new' check (status in ('new', 'imported', 'rejected')),
  submitted_at timestamptz not null default now(),
  source_ip    inet,
  updated_at   timestamptz not null default now()
);

create trigger trg_intake_submissions_updated_at
  before update on public.intake_submissions
  for each row execute function public.set_updated_at();

create index idx_intake_submissions_case_id on public.intake_submissions (case_id);
create index idx_intake_submissions_status  on public.intake_submissions (status);

-- -----------------------------------------------------------------------------
-- activity_log — append-only audit trail (GDPR requirement, PLANNING.md §11)
-- Never updated, never deleted (enforced in RLS: no update/delete policies).
-- -----------------------------------------------------------------------------

create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid references public.cases (id) on delete set null,  -- keep audit rows even if case is purged
  actor       uuid,                         -- auth.uid() of the acting staff member; null for system/anon
  actor_label text,                         -- denormalized display name (survives staff changes)
  action      text not null,               -- 'case.created', 'document.generated', 'status.changed', ...
  detail      jsonb,
  at          timestamptz not null default now()
);

create index idx_activity_log_case_id on public.activity_log (case_id);
create index idx_activity_log_at      on public.activity_log (at);
