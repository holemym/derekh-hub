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

## 6. Optional provider keys (M4.5 sending seams)
Every feature below is **env-gated**: without its keys the app silently falls back to
the manual hand-off flow (wa.me / mailto links, no payment links). Add keys in Vercel
(Production + Preview) *and* `app/.env.local` for local testing; redeploy after adding.

**Email (family updates, sent from the app via SMTP — any provider):**
- `SMTP_HOST` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` (e.g. `Derech <ops@ikg.example>`)
- `SMTP_PORT` optional (default 587; 465 = implicit TLS)
- Shows a **Send now** button in the case's Family updates section.

**WhatsApp (Meta WhatsApp Business Cloud API):**
- `WHATSAPP_TOKEN` (permanent system-user token) + `WHATSAPP_PHONE_ID` (phone-number **id**)
- Free-form text only delivers inside the 24h service window; outside it Meta requires a
  pre-approved template — the wa.me hand-off remains the fallback.

**Stripe (payment links on invoices + auto-reconcile):**
- `STRIPE_SECRET_KEY` → "Payment link" button on unpaid invoices (link saved to
  `invoices.stripe_ref`, copied to clipboard).
- `STRIPE_WEBHOOK_SECRET` → create a webhook endpoint in the Stripe dashboard pointing at
  `https://derekh-hub.vercel.app/api/stripe/webhook`, event `checkout.session.completed`;
  paying the link then flips the invoice to **paid** automatically (audit row "Stripe").

**Magic-link login email** is separate from all of the above: it is sent by Supabase
Auth. Configure custom SMTP in **Supabase → Project Settings → Authentication → SMTP**
(same credentials work) to lift the default sender's rate limit.

## Known follow-ups (not blockers)
- **Public intake** has a honeypot but no rate-limit/captcha yet.
- Neither blocks a first deploy.
