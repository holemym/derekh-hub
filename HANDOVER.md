# Derech — Handover (start here)

Single entry point for a fresh session. Read this + the `burial-hub` memory + `ROADMAP.md`, then continue.

**Codename:** Derech · Motty (Mordechai Hammer)'s **burial + body-transportation** ops hub for IKG Vienna.
**Passenger taxi is a SEPARATE, unbuilt system — never mix it in.** Supersedes the standalone [[burial-permit-tool]] (still live until cutover).

---

## Status: LIVE, feature-complete through M5 (code)
**Production:** https://derekh-hub.vercel.app — auth (magic-link) · cases + pipeline · permits +
New-permit form · document vault · public family intake (honeypot + time-trap + IP throttle) →
staff inbox · Today dashboard (Jewish-calendar urgency) + on-demand **AI daily brief** · tasks ·
**contacts editor** (/contacts + per-case links) · transport + chain-of-custody · money
(+ **Stripe payment links**) + comms (+ **real SMTP/WhatsApp send**) · **AI copilot** (consulate
email, case summary, death-cert OCR autofill) — all EN/DE, mobile **and** desktop, live Supabase.

Done: **M1–M5 + M4.5 + stage transitions + UI v2**. ~23 commits, auto-deploy on push.

**⚠️ Everything bold above is ENV-GATED and dormant until keys are added** (see "Next tasks" #1).
Without keys the app behaves exactly as before (hand-off links, no AI UI) — nothing breaks.

---

## Facts / access
- **Local:** `C:\Users\User\Downloads\clauderoom\burial-hub\` = monorepo `app/` (Next 16) + `db/` (SQL) + `packages/doc-engine/` (source of truth; **vendored into `app/src/lib/doc-engine`** for Vercel) + docs.
- **Git:** `github.com/holemym/derekh-hub` (branch `main`). Remote set + credentials cached — **just `git push origin main`; Vercel auto-deploys.**
- **`app/.env.local`** (gitignored) holds live creds: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`sb_publishable_…`), `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`), `SUPABASE_DB_URL` (session pooler, dev-only for migrations). Optional provider keys go here too (DEPLOY.md §6).
- **Supabase:** project `ucsoecwcvyxpdydhclnp` ("derekh-hub", org `shinpin`, **eu-west-1** Ireland). Owners (auth users + `staff` owner rows): `holemymora@gmail.com` (David, uid `7cf11041-33a9-4f8e-b78d-e7a4e013da3d`) · `mottyhammer@gmail.com` (Motty). Migrations **0001–0006 applied** (0006 dropped `cases.last_address`; `address` is canonical). Seed baseline = 1 case (`ca5e0001-0000-4000-8000-000000000001`), 2 contacts, 2 case_contacts links, 1 transport leg, 1 task; everything else 0.
- **Vercel:** project `derekh-hub` (team `dvisionh`), root dir `app`, framework **pinned via `app/vercel.json`**, auth-protection off, 3 Supabase env vars (NOT `SUPABASE_DB_URL`).
- **Stack:** Next 16 (App Router; middleware is **`src/proxy.ts`**; public paths incl. `/api/stripe`) · Tailwind v4 · @supabase/ssr + RLS · next-intl EN/DE · pdf-lib · @hebcal/core · nodemailer · @anthropic-ai/sdk · vendored doc-engine.

## Run it locally
`cd app && npm run dev` → http://localhost:3210 → log in with an owner email (magic link). Port 3210 (3000 taken by other projects). There is a `derech` entry in `clauderoom/.claude/launch.json` for preview tooling.

---

## Canonical docs (read as needed)
- `PLANNING.md` — full spec (§-numbered). `ROADMAP.md` — milestones + honest status (M1–M5 ✅ code; M6–M8 pending).
- `app/DESIGN.md` — design language v2 "Quiet & dignified" (type-scale classes `.t-display/.t-title/.t-heading/.t-body/.t-meta/.t-label`, warm tokens, `.surface`, one `--urgent` accent). **Match this for all new UI.**
- `DEPLOY.md` — Vercel runbook + **§6 provider keys** (SMTP, WhatsApp, Stripe, Supabase custom SMTP). `db/CONNECT.md` — Supabase setup.

## The verify pattern that works (do this for every change)
1. `npm run build` (from `app/`) — must pass clean.
2. **Live DB test** = a `pg` script over `SUPABASE_DB_URL` inside a **ROLLBACK transaction**, impersonating the owner: `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"7cf1…","role":"authenticated"}', true);` — proves RLS + shapes, leaves nothing. The `app/test/*.mjs` suite (11 files, `node test/<file>` from `app/`) covers every workstream — run the relevant ones + `live-read` after schema/mapper changes.
3. **Render-verify any PDF** with python `pypdfium2` → PNG → view it. Never trust coordinates unseen.
4. Confirm **live DB back to seed baseline** afterwards (counts above).
5. `curl` route gating (protected → 307 `/login`, public `/intake` + `/api/stripe/webhook` reachable; the webhook must 400 on unsigned POSTs, never redirect).
- **Browser extension is flaky** (screenshot timeouts) — the app is fine; verify via curl.

## Gotchas
- New migration: add `db/migrations/000N_*.sql` and run it **one-off** via a small `pg` call — do NOT re-run `app/scripts/apply-migrations.mjs` (0001 isn't idempotent). Update `db/types.ts` too. Current live schema = 0001–0006.
- `db/types.ts` predates postgrest-js 2.x → typed `.insert()/.update()` degrades to `never`; cast **only the final arg** (payload typed as `*Insert`).
- Money is **integer cents**, display EUR. Comms: hand-off links always; real send only when SMTP/WhatsApp keys exist (`src/lib/send/`). Stripe: link stored in `invoices.stripe_ref`; webhook flips to paid (idempotent).
- The doc-engine binding key **`case.last_address` is a CONTEXT key, not a DB column** — the mapper feeds it from `cases.address` (0006). Don't "fix" the template.
- `TransitLine.tsx` is **used** by CaseCard — not dead code (an older note said otherwise).
- All writes go through the **RLS-scoped SSR server client**; add `activity_log` rows for audited actions. AI + webhook are the exceptions: AI actions explicitly check active-staff before spending; the Stripe webhook self-authenticates via signature and then uses the admin client.
- next-intl: keep `messages/en.json` + `de.json` at **full parity** (a node one-liner key-diff works).
- AI: model `claude-opus-4-8`, adaptive thinking; never call on page load — only on explicit user action; gate every AI action on active staff.

---

## Next tasks (prioritized — pick with the user)
1. **Add provider keys** (no code): `ANTHROPIC_API_KEY` → copilot lights up (smoke-test all 4 features on first use); `SMTP_*` → real email; `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (+ dashboard endpoint → `/api/stripe/webhook`) → payment links; `WHATSAPP_TOKEN`+`WHATSAPP_PHONE_ID` → real WhatsApp; Supabase dashboard custom SMTP → un-rate-limit magic links. All documented in DEPLOY.md §6.
2. **M6 — offline hardening:** Dexie outbox + background sync; installable PWA; field-test at hospital/airport/cemetery.
3. **M7 — cutover:** parity check vs the standalone tool, run in parallel, then retire permit-hub.
4. **Durable intake rate-limit** (current per-IP throttle is per-serverless-instance) — e.g. a Postgres-based counter.
5. **Airline cargo / known-shipper FormTemplates** — need real blank PDFs, then the doc-engine overlay path (zero code).
6. **M8 — multi-tenant SaaS** (only after M7 + Motty's endorsement).

Routine work (styling, copy, small features, new templates) fits a lighter model: follow DESIGN.md + the verify pattern; the seams (`lib/send`, `lib/stripe`, `lib/ai/copilot`, doc-engine templates) are where new capability plugs in without architectural work.
