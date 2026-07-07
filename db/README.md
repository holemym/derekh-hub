# Derech — data layer (`db/`)

Postgres schema, RLS policies, storage buckets, and seeds for the burial &
body-transport operations hub (see `../PLANNING.md`, esp. §5–§7 and §11).

> **Status: reviewed, not executed.** There is no live Supabase project yet.
> Every SQL file here was written for standard Postgres 15 + Supabase idioms
> and carefully self-reviewed, but has never run against a real database.
> Expect to run the migrations attentively the first time.

## Contents

```
db/
├── migrations/
│   ├── 0001_init.sql        # enums, tables, updated_at triggers, indexes
│   ├── 0002_rls.sql         # RLS on every table + helper fns (is_active_staff / is_owner)
│   └── 0003_storage.sql     # private buckets 'case-docs' + 'form-templates' + object policies
├── seed/
│   ├── seed.sql             # demo contacts, case, task, transport leg (+ staff stub)
│   └── seed_form_template.mjs  # generates the form_templates upsert from the doc-engine JSON
├── types.ts                 # hand-written TS types (replaced by supabase codegen later)
└── README.md
```

## How to apply

### 1. Create the Supabase project — EU (Frankfurt)

Create the project in **region `eu-central-1` (Frankfurt)**. This is a GDPR
requirement, not a preference: the database holds sensitive personal data of
EU residents (see below) and must stay in the EU. Do not enable any read
replicas outside the EU.

While in the dashboard:

- **Authentication → Providers**: enable **Email** with magic links (the
  planned auth for Motty + staff). Disable public sign-ups
  (Authentication → Settings → *Allow new users to sign up* → off) — staff
  accounts are created by invitation only.

### 2. Run the migrations — in order

Via the **SQL editor** (paste each file, run, check for errors) or the CLI:

```sh
supabase link --project-ref <ref>
# place the files in supabase/migrations/ or run them directly:
supabase db push
```

Order matters:

1. `migrations/0001_init.sql` — enums, tables, triggers, indexes.
2. `migrations/0002_rls.sql` — RLS + helper functions. **Do not skip** —
   until this runs, tables exist without row security policies.
3. `migrations/0003_storage.sql` — buckets + `storage.objects` policies
   (depends on `public.is_active_staff()` from 0002).

### 3. Seed

1. **Staff first**: create the first auth user (Dashboard → Authentication →
   *Add user* with Motty's email), copy the UUID, and fill in the
   comment-stubbed `insert into public.staff ...` at the top of
   `seed/seed.sql`. Role must be `owner`.
2. Run `seed/seed.sql` in the SQL editor (it runs as `postgres`, bypassing
   RLS — a client connection would be blocked until a staff row exists).
   The seed is idempotent (`on conflict do nothing`, fixed UUIDs) and all
   demo data is fictional.
3. **Form template** (requires the doc-engine workstream's output):

   ```sh
   cd db
   node seed/seed_form_template.mjs
   ```

   Reads `../packages/doc-engine/templates/il-mfa-transfer-permit.json`,
   prints + writes `seed/seed_form_template.sql` (an idempotent upsert on
   `form_templates.key`). Run that SQL in the editor. If the JSON doesn't
   exist yet, the script exits with a clear message — re-run after the
   doc-engine agent has built it. Coordinates are never hardcoded here;
   the doc-engine template is the single source of truth.
4. Upload the blank permit PDF to the **`form-templates`** bucket at the
   path recorded in the template's `pdf_path`.

### 4. Verify

Quick sanity checks after applying:

```sql
-- 13 tables, all with rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;

-- policies present (should list 4 per table, 2 for activity_log, +1 anon intake)
select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 3;

-- buckets private
select id, public from storage.buckets;  -- both rows must be public = false
```

Then, with an **anon** key, confirm: `insert` into `intake_submissions`
succeeds; `select` from it (and everything else) returns zero rows / is
denied; upload to `case-docs/intake/...` succeeds; upload to any other path
fails; no file can be read back without a signed URL issued by staff.

## GDPR & data protection

This database is not a normal CRM. It stores, per case:

- **Deceased persons' data** — GDPR itself does not protect the deceased
  (Recital 27), but **Austrian law and the surviving family's rights do**,
  and much of a case record *is* living-person data by proxy.
- **Medical data** — `cases.cause_of_death`, `cases.icd_code`, death
  certificates in storage. Health data is **Art. 9 special-category data**.
- **Family PII** — names, phones, e-mails, addresses of living relatives
  (contacts, intake submissions, messages), collected at the worst moment
  of their lives. Handle accordingly.

Measures built into this schema, and the obligations they support:

**Access control (Art. 32).** RLS on every table; only active staff
(row in `staff` with `active = true`, checked via `auth.uid()`) can read
anything. The single public surface is INSERT-only intake
(`intake_submissions` + uploads under `case-docs/intake/`), and intake
uploads are write-only for the uploader. Staff deactivation (`active =
false`) revokes access immediately without deleting the account.

**Retention & deletion (Art. 5(1)(e), Art. 17).** Soft-delete first:
operational tables carry `deleted_at`; the app filters on it and only the
`owner` role holds SQL DELETE rights. Recommended documented policy
(confirm with the IKG / a lawyer before going live):

- Active + recently closed cases: retained while legally required
  (Austrian records obligations for burial/transport paperwork).
- After the retention period: **hard purge** — owner deletes the case row
  (children cascade), deletes the case's folder in `case-docs`, and purges
  matching `intake_submissions`. `activity_log` rows survive with
  `case_id = null` (FK is `on delete set null`) so the audit trail records
  *that* a purge happened without retaining the personal data.
- `intake_submissions` with status `rejected`: purge on a short clock
  (e.g. 30 days) — they are unsolicited PII.
- Write the chosen periods into the privacy notice.

**Audit (Art. 5(2) accountability).** `activity_log` is append-only —
RLS defines insert + select for staff and *no* update/delete policy for any
role, so the trail cannot be edited from any client. The app must log all
material actions (case created, status changed, document generated/
downloaded, data exported, purge executed).

**Storage.** Both buckets are **private** (`public = false`). Files are
served exclusively through **short-lived signed URLs** created for
authenticated staff. Never create a public bucket in this project; never
proxy files through an unauthenticated endpoint.

**Transport & at-rest.** Supabase provides TLS in transit and AES-256 at
rest; Frankfurt hosting keeps data in the EU (processor: Supabase — put a
DPA in place, listed in their dashboard).

**Public intake.** The intake form must show a privacy notice + consent
text before submission (controller identity, purposes, retention, rights).
`source_ip` is collected for abuse prevention only — state that, and purge
it with the submission.

**Offline copies.** The PWA caches case data on staff devices (IndexedDB).
Device security (screen lock, disk encryption) and remote sign-out are part
of the GDPR story — see PLANNING.md §3/§11; app workstream owns the
device-side wipe on logout.

## Design decisions taken here (beyond PLANNING.md)

- `staff.id` **is** the Supabase auth user id (`references auth.users`) —
  one row per login, `active` flag instead of row deletion.
- RLS helper functions `is_active_staff()` / `is_owner()` are
  `security definer` to avoid recursive RLS on `staff`.
- FKs from case children (`documents`, `transport_legs`, `case_contacts`,
  `invoices`, `expenses`, `messages`) are `on delete cascade` so the owner's
  GDPR purge is a single DELETE; `tasks.case_id`, `intake_submissions.case_id`
  and `activity_log.case_id` are `on delete set null` (they outlive a case).
- `documents.template_key → form_templates.key` is `on update cascade`
  so renaming a template key can't orphan documents.
- Anon intake inserts are constrained by policy to `status = 'new'` and
  `case_id is null` — the public form can never touch an existing case.
- `intake_submissions` has `submitted_at` (spec) + `updated_at` (status
  changes by staff), no separate `created_at`.

## Replacing `types.ts`

`types.ts` is hand-written to unblock the app workstream. Once the project
exists, generate the real thing and swap it in:

```sh
supabase gen types typescript --project-id <ref> --schema public > db/types.gen.ts
```

Keep the JSONB payload interfaces (`TemplateField`, `CustodyEntry`, …) —
codegen types jsonb as `Json`, so those app-level contracts stay useful.
