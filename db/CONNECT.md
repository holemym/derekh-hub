# Derech — CONNECT: standing up the live backend

The authoritative "go live" runbook for the human (Motty / operator). This is
the one-time procedure to turn `db/` (reviewed-only SQL) into a running Supabase
backend and wire the app to it. Follow it top to bottom.

> **Status of the SQL:** every file under `db/migrations/` and `db/seed/` has
> been carefully reviewed but has **never been executed** — there is no live
> database yet. Run each step attentively and watch the SQL editor for errors on
> first run.

Companion docs: `db/README.md` (schema rationale + GDPR), `../ROADMAP.md` (M0/M1).

---

## 0. Prerequisites

- A Supabase account (you — this needs your login; an agent cannot create it).
- The app repo checked out, with its `.env.example` (see step 3).
- Optional: the Supabase CLI (`supabase`) if you prefer `db push` over the SQL editor.
- The blank permit PDF file (for the final storage upload in step 6).

---

## 1. Create the Supabase project — EU (Frankfurt) [manual, only you can do this]

In the Supabase dashboard → **New project**:

- **Region: `eu-central-1` (EU · Frankfurt).** This is a **GDPR requirement, not
  a preference.** The database holds special-category health data (cause of
  death, ICD codes, death certificates) and the PII of living EU-resident family
  members, collected at the worst moment of their lives. That data must stay in
  the EU. Do **not** enable read replicas outside the EU.
- Choose a strong database password and store it in your password manager.
- This step is **manual and yours alone** — it is tied to your Supabase account
  and billing. No agent and no script in this repo creates cloud resources.

While you are in the dashboard, set auth up now:

- **Authentication → Providers → Email**: enable, with **magic links**.
- **Authentication → Settings → "Allow new users to sign up" → OFF.** Staff are
  invite-only; the public never gets an authenticated account (they use the
  anon-only intake path).

---

## 2. Copy the project keys

Dashboard → **Project Settings → API**. Copy three values:

| Dashboard field                | Copy to app env var                 | Secrecy                          |
|--------------------------------|-------------------------------------|----------------------------------|
| **Project URL**                | `NEXT_PUBLIC_SUPABASE_URL`          | public (shipped to the browser)  |
| **Project API keys → `anon` `public`** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public (RLS is the real guard)   |
| **Project API keys → `service_role` `secret`** | `SUPABASE_SERVICE_ROLE_KEY` | **SECRET — server only, never `NEXT_PUBLIC_`** |

The `service_role` key **bypasses RLS**. It must live only in server-side env
(never in a `NEXT_PUBLIC_*` var, never committed, never sent to the browser).

---

## 3. Wire the app env

The app has an **`.env.example`** (in the app workstream's directory). Copy it to
`.env.local` and fill in the three values from step 2:

```sh
# in the app directory (owned by the app workstream — do not edit db/ for this)
cp .env.example .env.local
```

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role secret key>
```

Restart the dev server so it picks up the new env. (When you deploy to Vercel,
set the same three as project env vars there — `SUPABASE_SERVICE_ROLE_KEY` as a
plain, **not** exposed, server var.)

---

## 4. Apply the migrations — strict order

Run each file **in order**. Either paste it into the **SQL editor** and run, or
use the CLI (`supabase link --project-ref <ref>` then `supabase db push` with the
files staged under `supabase/migrations/`).

| # | File                                   | What it does                                              |
|---|----------------------------------------|-----------------------------------------------------------|
| 1 | `migrations/0001_init.sql`             | enums, tables, `updated_at` triggers, indexes             |
| 2 | `migrations/0002_rls.sql`              | RLS on every table + `is_active_staff()` / `is_owner()`   |
| 3 | `migrations/0003_storage.sql`          | private buckets `case-docs` + `form-templates` + policies |
| 4 | `migrations/0004_case_permit_fields.sql` | adds `cases.place_of_birth` + `cases.last_address` (permit) |

Order matters:
- 0002 depends on the tables from 0001.
- 0003 depends on `public.is_active_staff()` created in 0002.
- 0004 only alters `public.cases` from 0001; it is idempotent
  (`add column if not exists`), so re-running it is harmless.

**Do not skip 0002** — until it runs, the tables exist with **no** row security.

---

## 5. Seed the data

Run these **after** the migrations, in the SQL editor (they run as `postgres` /
service role, which bypasses RLS — a client connection would be blocked until a
staff row exists).

### 5a. Demo data

Run `seed/seed.sql`. Idempotent (`on conflict do nothing`, fixed UUIDs); all
rows are fictional. (The staff `insert` at the top is intentionally left
commented — you fill it in step 7.)

### 5b. Form template

You need the doc-engine template loaded into `form_templates`. Two ways:

- **If `seed/seed_form_template.sql` exists** (it does): run it directly in the
  SQL editor. It is an idempotent upsert on `form_templates.key`.
- **To regenerate it** from the current doc-engine JSON (the single source of
  truth for coordinates):

  ```sh
  cd db
  node seed/seed_form_template.mjs   # reads ../packages/doc-engine/templates/il-mfa-transfer-permit.json
  ```

  This rewrites `seed/seed_form_template.sql`; then run that SQL in the editor.
  Never hand-edit coordinates here — recalibrate in the doc engine and
  regenerate.

---

## 6. Upload the blank permit PDF

The template's `pdf_path` points into the **`form-templates`** bucket. Upload the
blank permit PDF to that path (Dashboard → Storage → `form-templates`). Then, if
`pdf_path` was `null` in the seeded row, update it to the uploaded path so the
engine can fetch the blank at generation time.

---

## 7. RLS bootstrap — insert the first owner staff row [manual]

RLS is a **chicken-and-egg** here: the `staff` insert policy requires the caller
to *already be* active staff (`is_active_staff()`), so **you cannot self-insert
your first row from a normal client**. You seed it as `postgres` from the SQL
editor instead.

First you need your **auth user UUID**, which only exists once an auth user is
created:

1. Create your auth user — either:
   - **Magic-link sign-in once** through the app's login (creates the
     `auth.users` row), or
   - Dashboard → **Authentication → Users → Add user** with your email.
2. Copy your user's **UUID** (Dashboard → Authentication → Users → your row).
3. In the SQL editor, run (replacing the placeholder UUID and name):

```sql
insert into public.staff (id, name, role, active)
values (
  '00000000-0000-0000-0000-000000000000',  -- <-- REPLACE with your auth.users UUID
  'Motty Hammer',                          -- <-- your display name
  'owner',                                 -- first user must be owner
  true
)
on conflict (id) do nothing;
```

From now on you are active staff: the app, signed in as you, can read/write
everything, and you (as `owner`) can invite/insert further staff rows and hold
the only SQL DELETE rights (GDPR purge).

---

## 8. Post-apply verification queries

Run these in the SQL editor and confirm the expected results.

```sql
-- (a) All 13 public tables exist AND have row security enabled (rowsecurity = t).
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by 1;
-- Expect 13 rows, every rowsecurity = true.

-- (b) Policies present: ~4 per table (select/insert/update/owner-delete),
--     2 for activity_log (append-only: insert + select, no update/delete),
--     +1 anon insert on intake_submissions.
select tablename, cmd, count(*)
from pg_policies
where schemaname = 'public'
group by 1, 2
order by 1, 2;

-- (c) Both storage buckets are PRIVATE.
select id, public from storage.buckets;   -- both rows must be public = false

-- (d) 0004 columns landed on cases.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'cases'
  and column_name in ('place_of_birth', 'last_address')
order by 1;                                 -- expect exactly these two rows

-- (e) The permit template row exists and is active.
select key, title, version, active,
       jsonb_array_length(fields) as n_fields,
       jsonb_array_length(checks) as n_checks
from public.form_templates
where key = 'il-mfa-transfer-permit';       -- expect 1 row, active = true

-- (f) Your owner staff row exists.
select id, name, role, active from public.staff;   -- expect your owner row
```

---

## 9. Smoke test (mirrors the property-ops in-migration testing philosophy)

Quick end-to-end checklist proving RLS actually behaves. Use an **anon** client
(anon key) for the anon rows and a **signed-in staff** client for the rest.

- [ ] **anon INSERT into `intake_submissions` succeeds** — but only with
      `status = 'new'` and `case_id = null` (the policy rejects anything else).
- [ ] **anon SELECT from `intake_submissions` (and every other table) returns
      zero rows / is denied.** The public surface is insert-only.
- [ ] **anon upload to `case-docs/intake/<uuid>/...` succeeds**; upload to any
      other path (e.g. `case-docs/foo/...`) **fails**.
- [ ] **anon cannot read any storage object back** — intake uploads are
      write-only for the uploader (no anon select policy).
- [ ] **Signed-in staff can SELECT the demo case** and its linked contacts,
      task, and transport leg from `seed.sql`.
- [ ] **A file in `case-docs` is reachable only via a short-lived signed URL**
      issued for authenticated staff — never a public URL.
- [ ] **DELETE is denied for non-owner staff** and allowed for `owner`
      (prefer soft delete via `deleted_at` in the app regardless).
- [ ] **Deactivating a staff row** (`active = false`) immediately revokes that
      user's access on the next request.
- [ ] **Generate the permit** for the demo case (once the app's doc-context
      mapper is wired): `place_of_birth` and `last_address` resolve from the new
      0004 columns; `transport.*` / `funeral_service.* `/ `declaration.*` /
      `documents.*` resolve from the composed context (not from cases columns).

If every box is checked, the backend is live and RLS is doing its job. Record
the go-live date and the confirmed GDPR retention periods (ROADMAP open
decision) before real cases are entered.
