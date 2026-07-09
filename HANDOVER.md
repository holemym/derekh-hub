# Derech — Handover (start here)

Single entry point for a fresh session. Read this + the `burial-hub` memory + `ROADMAP.md`, then continue.

**Codename:** Derech · Motty (Mordechai Hammer)'s **burial + body-transportation** ops hub for IKG Vienna.
**Passenger taxi is a SEPARATE, unbuilt system — never mix it in.** Supersedes the standalone [[burial-permit-tool]] (still live until cutover).

---

## Status: LIVE & feature-complete for the planned scope
**Production:** https://derekh-hub.vercel.app — auth (magic-link) · cases + pipeline · permits + New-permit form · document vault · public family intake → staff inbox · Today dashboard (Jewish-calendar urgency) · tasks · **transport + chain-of-custody** · **money + comms** — all EN/DE, mobile **and** desktop, on live Supabase.

Done: **M1, M2, M3, M4, stage transitions, UI refresh v2**. ~18 commits, all auto-deploy on push.

---

## Facts / access
- **Local:** `C:\Users\User\Downloads\clauderoom\burial-hub\` = monorepo `app/` (Next 16) + `db/` (SQL) + `packages/doc-engine/` (source of truth; **vendored into `app/src/lib/doc-engine`** for Vercel) + docs.
- **Git:** `github.com/holemym/derekh-hub` (branch `main`). Remote is set + credentials cached — **just `git push origin main`; Vercel auto-deploys.**
- **`app/.env.local`** (gitignored) holds live creds: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`sb_publishable_…`), `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`), `SUPABASE_DB_URL` (session pooler, dev-only for migrations).
- **Supabase:** project `ucsoecwcvyxpdydhclnp` ("derekh-hub", org `shinpin`, **eu-west-1** Ireland). Owners (auth users + `staff` owner rows): `holemymora@gmail.com` (David, uid `7cf11041-33a9-4f8e-b78d-e7a4e013da3d`) · `mottyhammer@gmail.com` (Motty). Migrations **0001–0005 applied**. 1 fictional seed case (`ca5e0001-…-000000000001`).
- **Vercel:** project `derekh-hub` (team `dvisionh`), root dir `app`, framework **pinned via `app/vercel.json`** (dashboard preset kept reverting), auth-protection off, 3 env vars (NOT `SUPABASE_DB_URL`).
- **Stack:** Next 16 (App Router; middleware is **`src/proxy.ts`**) · Tailwind v4 (`@theme inline` in globals.css) · @supabase/ssr auth + RLS · next-intl EN/DE · pdf-lib · @hebcal/core (Vienna zmanim) · vendored doc-engine.

## Run it locally
`cd app && npm run dev` → http://localhost:3210 → log in with an owner email (magic link to that inbox). Port 3210 (3000 taken by other projects).

---

## Canonical docs (read as needed)
- `PLANNING.md` — full spec (§-numbered).
- `ROADMAP.md` — milestones + honest status (M1–M4 ✅; M5–M8 pending).
- `app/DESIGN.md` — **design language v2 "Quiet & dignified"** (Hanken Grotesk, type-scale classes `.t-display/.t-title/.t-heading/.t-body/.t-meta/.t-label`, warm tokens, `.surface`, one `--urgent` accent, responsive AppShell). **Match this for all new UI.**
- `DEPLOY.md` — Vercel runbook. `db/CONNECT.md` — Supabase setup.

## The verify pattern that works (do this for every change)
1. `npm run build` (from `app/`) — must pass clean.
2. **Live DB test** = a `pg` script over `SUPABASE_DB_URL` inside a **ROLLBACK transaction**, impersonating the owner: `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"7cf1…","role":"authenticated"}', true);` — proves RLS + shapes, leaves nothing.
3. **Render-verify any PDF** with python `pypdfium2` → PNG → view it. Never trust coordinates unseen.
4. Confirm **live DB back to seed baseline** afterwards (1 case; invoices/expenses/messages/documents/transport_legs = 0/seed).
5. `curl` route gating (protected → 307 `/login`, public → 200).
- **Browser extension is flaky** (screenshots intermittently fail with `document_idle` timeout) — the app is fine; verify via curl timing. When logged in, the browser can screenshot authed screens (session persists).

## Gotchas
- New migration: add `db/migrations/000N_*.sql` and run it **one-off** via a small `pg` call — do NOT re-run `app/scripts/apply-migrations.mjs` (0001 isn't idempotent). Update `db/types.ts` too.
- `db/types.ts` predates postgrest-js 2.x → typed `.insert()/.update()` degrades to `never`; cast **only the final arg** (payload typed as `*Insert`).
- Money is **integer cents**, display EUR. Comms use **wa.me/mailto hand-off links** (no provider keys) + log a `messages` row on "Mark sent".
- All writes go through the **RLS-scoped SSR server client**; add `activity_log` rows for audited actions.
- next-intl: keep `messages/en.json` + `de.json` at **full parity** (there's a check script pattern used before).

---

## Next tasks (prioritized — pick with the user)
1. **Contacts editor** — comms recipient + invoice bill-to need a linked `family` `case_contact`; there's no UI to add one yet (contacts table unused app-side). Unblocks M4's real usefulness.
2. **Real sending:** custom **SMTP** (magic-link email is rate-limited on Supabase's default sender) + automated **WhatsApp/email** (swap `logMessageSent` for a provider: WhatsApp Business/Twilio + SMTP).
3. **Stripe checkout** — `invoices.stripe_ref` is ready; add "Send payment link" + webhook reconcile. *(Stripe MCP needs the user to authorize it in an interactive session first.)*
4. **M5 — AI copilot** (Claude): draft the consulate email · **OCR a death certificate → auto-fill a case** · case summaries · daily "urgent before Shabbos" brief.
5. **M6 — offline hardening** (Dexie outbox + background sync; installable PWA; field-test).
6. **Cleanup:** dedupe `address`/`last_address`; delete unused `TransitLine.tsx`; migrate `NewPermitForm`/`IntakeForm` field labels to the type scale.
7. **M7 — cutover:** parity check, run in parallel, then retire the standalone permit tool.

Also pending, non-blocking: intake rate-limit/captcha; airline cargo/known-shipper **FormTemplates** need real blank PDFs (then use the doc-engine overlay path, not the direct-draw manifest).
