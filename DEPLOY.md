# Deploying Derech (the hub)

The app is a Next.js 16 app in `app/`, in a small monorepo (it depends on
`packages/doc-engine` via a `file:` link; `db/` holds migrations). Backend is the
existing Supabase project (`ucsoecwcvyxpdydhclnp`, EU/`eu-west-1`). Deploy target: Vercel.

> Reminder: Supabase (data) is already connected via env keys — it has nothing to do
> with GitHub/Vercel. The repo + Vercel are only about hosting the app *code*.

## 1. Put the code on GitHub  *(your one manual step)*
Create an **empty private** repo (github.com → New → e.g. `derekh-hub` → Private →
do **not** add README/gitignore/license). Then Claude pushes the local commits to it.

## 2. Create the Vercel project
Import the repo in Vercel, then:
- **Root Directory:** `app`  ← the Next app lives in the subfolder.
- **Include files outside the root directory in the Build Step:** **ON** — the app
  imports `packages/doc-engine` (its built `dist/` is committed), which is above `app/`.
- **Framework Preset:** Next.js (auto-detected).
- Build/Install commands: defaults.

## 3. Environment variables (Vercel → Settings → Environment Variables)
Copy the three from `app/.env.local` (Production + Preview):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`  (server-only secret — Vercel encrypts it; never `NEXT_PUBLIC_`)

**Do NOT set** `SUPABASE_DB_URL` — that's dev-only (running migrations from a laptop),
never used at runtime.

## 4. Deploy, then point Supabase auth at the live URL
After the first deploy you'll get a URL like `https://derekh-hub.vercel.app`.
In Supabase → Authentication → URL Configuration:
- **Site URL:** the production URL.
- **Redirect URLs:** add `https://<your-domain>/**` (keep the localhost ones for dev).

Now magic-link login works on the live site.

## 5. Migrations on future schema changes
Migrations are applied from a laptop, not from Vercel:
`cd app && node scripts/apply-migrations.mjs` (uses `SUPABASE_DB_URL`). For a *single*
new migration file, run it directly (the runner replays the full list; only re-run it
if every migration is idempotent). Current live schema = migrations 0001–0005.

## Known follow-ups (not blockers)
- **Magic-link email** uses Supabase's default sender (rate-limited). Configure custom
  **SMTP** in Supabase → Authentication → Emails before real-world use.
- **Public intake** has a honeypot but no rate-limit/captcha yet.
- Both are on the roadmap; neither blocks a first deploy.
