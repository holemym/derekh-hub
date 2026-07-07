-- =============================================================================
-- Derech — demo seed data
--
-- Run AFTER migrations 0001–0003. All demo rows use fixed UUIDs so the seed
-- is idempotent (on conflict do nothing) and easy to reference from the app
-- during development. All data below is FICTIONAL.
--
-- NOTE: run this in the Supabase SQL editor (as postgres/service role) —
-- RLS would block an unauthenticated client from inserting these rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Staff — STUB: needs a real auth user id.
--
-- staff.id must reference an existing auth.users row. Create the user first
-- (Supabase Dashboard -> Authentication -> Add user, or invite via magic
-- link), copy the user's UUID, then uncomment and run:
--
-- insert into public.staff (id, name, role, active)
-- values ('00000000-0000-0000-0000-REPLACE-ME', 'Motty Hammer', 'owner', true)
-- on conflict (id) do nothing;
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 2. Contacts
-- -----------------------------------------------------------------------------

insert into public.contacts (id, name, org, phone, email, whatsapp, roles, notes)
values
  (
    'c0a80001-0000-4000-8000-000000000001',
    'Chevra Kadisha Wien',
    'IKG Wien',
    '+43 1 000 0000',
    'chevra@example.org',
    '+43 660 000 0000',
    array['chevra_kadisha']::public.contact_role[],
    'Demo contact — tahara coordination, Vienna.'
  ),
  (
    'c0a80001-0000-4000-8000-000000000002',
    'EL AL Cargo Vienna',
    'EL AL Israel Airlines',
    '+43 1 000 0001',
    'cargo.vie@example.org',
    null,
    array['airline_cargo']::public.contact_role[],
    'Demo contact — air-cargo bookings VIE -> TLV.'
  )
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Demo case — currently in the 'documents' stage
-- -----------------------------------------------------------------------------

insert into public.cases (
  id, hebrew_name, secular_first, secular_last, dob, dod,
  place_of_death, id_number, id_type, nationality, country, address,
  burial_place, cemetery, status, urgency, stage_timestamps, notes
)
values (
  'ca5e0001-0000-4000-8000-000000000001',
  'אברהם בן יעקב',
  'Abraham',
  'Beispiel',
  '1941-03-12',
  '2026-07-05T04:30:00+02:00',
  'AKH Wien, 1090 Wien',
  '012345678',
  'israeli_id',
  'Israeli',
  'Israel',
  'Beispielgasse 1, 1020 Wien',
  'Har HaMenuchot, Jerusalem',
  'Har HaMenuchot',
  'documents',
  2,
  jsonb_build_object(
    'notified',  '2026-07-05T05:10:00+02:00',
    'collected', '2026-07-05T09:40:00+02:00',
    'prepared',  '2026-07-06T11:00:00+02:00',
    'documents', '2026-07-06T11:05:00+02:00'
  ),
  'DEMO CASE — fictional data. Repatriation Vienna -> Jerusalem; awaiting MFA transfer permit.'
)
on conflict (id) do nothing;

-- Link both demo contacts to the case
insert into public.case_contacts (case_id, contact_id, role)
values
  ('ca5e0001-0000-4000-8000-000000000001', 'c0a80001-0000-4000-8000-000000000001', 'chevra_kadisha'),
  ('ca5e0001-0000-4000-8000-000000000001', 'c0a80001-0000-4000-8000-000000000002', 'airline_cargo')
on conflict (case_id, contact_id, role) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Linked task (assignee left null until the staff stub above is filled in)
-- -----------------------------------------------------------------------------

insert into public.tasks (id, case_id, title, due, status, assignee, calendar_note)
values (
  '7a5c0001-0000-4000-8000-000000000001',
  'ca5e0001-0000-4000-8000-000000000001',
  'Generate MFA transfer permit + bring to consulate',
  '2026-07-08T12:00:00+02:00',
  'open',
  null,
  'Consulate closes 13:00; must clear before Shabbos prep Thursday.'
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Linked transport leg — air cargo VIE -> TLV, booked
-- -----------------------------------------------------------------------------

insert into public.transport_legs (
  id, case_id, type, status, from_location, to_location,
  carrier, flight_no, awb_no, scheduled_at, custody
)
values (
  '1e600001-0000-4000-8000-000000000001',
  'ca5e0001-0000-4000-8000-000000000001',
  'air_cargo',
  'booked',
  'Vienna International Airport (VIE)',
  'Ben Gurion Airport (TLV)',
  'EL AL Cargo',
  'LY364',
  '114-00000000',
  '2026-07-09T09:25:00+02:00',
  '[]'::jsonb
)
on conflict (id) do nothing;
