-- =============================================================================
-- Derech — Migration 0002: Row Level Security
--
-- Model (PLANNING.md §11):
--   * authenticated users who have an ACTIVE row in public.staff get full
--     select / insert / update on everything.
--   * DELETE is owner-only, everywhere — and the app should prefer soft
--     delete (deleted_at) anyway; hard delete is the documented GDPR purge.
--   * anon may ONLY insert into intake_submissions (public family intake).
--   * activity_log is append-only: staff insert + select; NO update/delete
--     policies exist for anyone, so RLS default-deny blocks them.
--
-- NOTE: reviewed but not executed — no live database exists yet.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions
-- security definer so they can read public.staff without tripping the staff
-- table's own RLS (avoids recursive policy evaluation).
-- -----------------------------------------------------------------------------

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff s
    where s.id = auth.uid()
      and s.active
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff s
    where s.id = auth.uid()
      and s.active
      and s.role = 'owner'
  );
$$;

revoke execute on function public.is_active_staff() from public;
revoke execute on function public.is_owner() from public;
grant execute on function public.is_active_staff() to authenticated, anon;
grant execute on function public.is_owner() to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Enable RLS on every table
-- -----------------------------------------------------------------------------

alter table public.staff               enable row level security;
alter table public.cases               enable row level security;
alter table public.contacts            enable row level security;
alter table public.case_contacts       enable row level security;
alter table public.form_templates      enable row level security;
alter table public.documents           enable row level security;
alter table public.transport_legs      enable row level security;
alter table public.tasks               enable row level security;
alter table public.invoices            enable row level security;
alter table public.expenses            enable row level security;
alter table public.messages            enable row level security;
alter table public.intake_submissions  enable row level security;
alter table public.activity_log        enable row level security;

-- -----------------------------------------------------------------------------
-- staff
-- -----------------------------------------------------------------------------

create policy "staff_select_staff" on public.staff
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_staff" on public.staff
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_staff" on public.staff
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_staff" on public.staff
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- cases
-- -----------------------------------------------------------------------------

create policy "staff_select_cases" on public.cases
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_cases" on public.cases
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_cases" on public.cases
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_cases" on public.cases
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- contacts
-- -----------------------------------------------------------------------------

create policy "staff_select_contacts" on public.contacts
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_contacts" on public.contacts
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_contacts" on public.contacts
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_contacts" on public.contacts
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- case_contacts
-- -----------------------------------------------------------------------------

create policy "staff_select_case_contacts" on public.case_contacts
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_case_contacts" on public.case_contacts
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_case_contacts" on public.case_contacts
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_case_contacts" on public.case_contacts
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- form_templates
-- -----------------------------------------------------------------------------

create policy "staff_select_form_templates" on public.form_templates
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_form_templates" on public.form_templates
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_form_templates" on public.form_templates
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_form_templates" on public.form_templates
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------

create policy "staff_select_documents" on public.documents
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_documents" on public.documents
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_documents" on public.documents
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_documents" on public.documents
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- transport_legs
-- -----------------------------------------------------------------------------

create policy "staff_select_transport_legs" on public.transport_legs
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_transport_legs" on public.transport_legs
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_transport_legs" on public.transport_legs
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_transport_legs" on public.transport_legs
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- tasks
-- -----------------------------------------------------------------------------

create policy "staff_select_tasks" on public.tasks
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_tasks" on public.tasks
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_tasks" on public.tasks
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_tasks" on public.tasks
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- invoices
-- -----------------------------------------------------------------------------

create policy "staff_select_invoices" on public.invoices
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_invoices" on public.invoices
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_invoices" on public.invoices
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_invoices" on public.invoices
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- expenses
-- -----------------------------------------------------------------------------

create policy "staff_select_expenses" on public.expenses
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_expenses" on public.expenses
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_expenses" on public.expenses
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_expenses" on public.expenses
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------

create policy "staff_select_messages" on public.messages
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_messages" on public.messages
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_messages" on public.messages
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_messages" on public.messages
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- intake_submissions
-- The ONLY anon-writable table: the public family-intake form posts here.
-- anon may insert a fresh submission only — never read, update or link a case.
-- -----------------------------------------------------------------------------

create policy "anon_insert_intake" on public.intake_submissions
  for insert to anon
  with check (
    status = 'new'
    and case_id is null
  );

create policy "staff_select_intake" on public.intake_submissions
  for select to authenticated
  using (public.is_active_staff());

create policy "staff_insert_intake" on public.intake_submissions
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_update_intake" on public.intake_submissions
  for update to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy "owner_delete_intake" on public.intake_submissions
  for delete to authenticated
  using (public.is_owner());

-- -----------------------------------------------------------------------------
-- activity_log — append-only
-- insert + select for staff; deliberately NO update or delete policy for any
-- role, so both are denied by RLS default-deny. The audit trail is immutable.
-- -----------------------------------------------------------------------------

create policy "staff_insert_activity_log" on public.activity_log
  for insert to authenticated
  with check (public.is_active_staff());

create policy "staff_select_activity_log" on public.activity_log
  for select to authenticated
  using (public.is_active_staff());
