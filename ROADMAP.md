# Derech — Development Roadmap

Companion to [PLANNING.md](PLANNING.md). This is the *how we get there*: milestones, definition-of-done,
dependencies, and the cutover from the current live tool. Honest status, updated as we go.

**Legend:** ✅ done & verified · 🟡 in progress / partial · ⬜ not started · 🔗 blocked-by

**Working model:** built in **tracks** (App · Data · Doc-engine · Integration · Design), one track per chat-fork,
against canonical docs in this folder. Gradual build, verify each milestone before the next.

---

## Where we are today (verified — July 2026 review)

| Track | Status | Evidence |
|---|---|---|
| **Doc-engine** | ✅ | Generic template engine (vendored into `app/src/lib/doc-engine` for Vercel); Israeli permit render-verified; invoice + transport-manifest PDFs direct-drawn. |
| **App** (`app`) | ✅ | **LIVE at https://derekh-hub.vercel.app** on live Supabase (RLS-scoped SSR). M1–M4 + stage transitions + design v2 done: auth, cases/pipeline, permits, vault, intake, Today/tasks, transport/custody, money/comms. EN/DE, mobile + desktop. |
| **Data layer** (`db`) | ✅ | Schema applied to live Supabase `ucsoecwcvyxpdydhclnp` (eu-west-1); migrations 0001–0005; 51 RLS policies verified (anon=0, owner sees data). |

Known soft spots (this drives M4.5 below): contacts have schema + read path but **no write UI**; comms/invoices are hand-off only (no provider); public intake unprotected; magic-link email on Supabase's rate-limited default sender; small debt (address/last_address dupe, dead `TransitLine.tsx`, two forms off the type scale).

---

## Milestones

### M0 · Foundation 🟡 (~70%)
Stand the project up as its own deployable app.
- ✅ Next.js + TS + Tailwind scaffold, monoline design system, PWA shell
- ✅ Hebcal zmanim lib (Vienna), EN/DE i18n
- ✅ Supabase project created (**EU — Ireland/`eu-west-1`**, GDPR-fine) + env wiring + schema applied & verified (13 tables, 51 RLS policies, 2 private buckets, permit template seeded)
- ✅ Auth: email magic-link (SSR, proxy gate, /login, /auth/callback, /no-access, sign-out); owners bootstrapped (David + Motty) + Supabase redirect URLs configured
- ⬜ Hub as its own Vercel project (separate repo — **never over the live tool**)
- **Done when:** the empty app deploys, an authorized user can log in, DB reachable.

### M1 · Cases + Documents — the wedge ✅ COMPLETE 🔗 M0
The core loop. This is where the current tool's capabilities move in.
- ✅ Doc-engine (generic, verified)
- ✅ Case list / detail screens (on mock data)
- ✅ Document-context mapper (`{case, transport, funeral_service, declaration, documents}`) + repo seam
- ✅ **"Generate permit" for real** — engine wired into case detail, client-side/offline; downloads the filled PDF. Render-verified (both pages) from the app pipeline; build passes.
- ✅ `place_of_birth` migration (0004) written (+ `last_address`, pending reconciliation below)
- ✅ Migrations applied to the real Supabase (via `app/scripts/apply-migrations.mjs`)
- ✅ Wire repo to live data (RLS-scoped server client; DB row → Case mapper; seed case renders after login)
- ✅ Document vault: upload / list / download per case (private `case-docs` bucket + 60s signed URLs) + "Save permit to case"
- ✅ **New permit form** (`/cases/new`) — standalone-parity: fill client details → generate permit + save as case (render-verified)
- ✅ **Public intake → DB** (`/intake`, replaces the JSON handoff): anon family form writes intake_submissions + uploads to `intake/`; staff `/intake-inbox` imports a submission → case + family documents (anon-RLS tested)
- **Reconcile before migrations run:** (a) DB now has both `address` (0001) and `last_address` (0004) — standardize the permit binding on one (`case.address`) and drop the redundant column; (b) the app `Case` type lags the DB schema (missing `cause_of_death`/`icd_code`/`place_of_birth` — currently passed via mapper `opts`) — sync the type when the repo goes live.
- **Done when:** Motty creates a case → generates the real permit → attaches docs; a family submits intake that lands as a case. *(≈ feature-parity with the live tool, plus persistence.)*

### M2 · Planning brain ✅ COMPLETE 🔗 M1
- ✅ Today dashboard on live data (urgency-sorted; red only pre-candle-lighting; Shabbos/chag countdown chip)
- ✅ Tasks (create/complete/cancel, per-case + /tasks; "falls on Shabbos" flag); Due-soon on Today
- ✅ `planning.ts` urgency model (stage + kevod-hames time pressure + Shabbos proximity); unit-tested (23 assertions)
- ✅ Stage transitions (forward-only, timestamped, audit-logged) — done in a follow-up pass.

### M3 · Transport & repatriation ✅ COMPLETE 🔗 M1
- Transport legs (ground / air-cargo / domestic), chain-of-custody timeline
- Airline cargo + known-shipper forms as **new FormTemplates** (proves the "new form = config, zero code" thesis)
- **Done when:** a case's physical journey is trackable and its transport paperwork generates like the permit.

### M4 · Money + comms ✅ COMPLETE 🔗 M1
- Invoices / expenses per case; Stripe
- Templated family status updates via WhatsApp / email (calendar-aware timing)
- **Done when:** a case can be invoiced and the family gets status updates.

### M4.5 · Operational completeness ⬜ 🔗 M4 *(added by the July 2026 review)*
Close the gap between "feature exists" and "Motty can actually run a case with it."
- **Contacts editor** — global address book (`/contacts`: list, create, edit, soft-delete) + per-case
  link/create/unlink in a role. The linked `family` contact is what makes comms recipients and
  invoice bill-to real (both consumers are already wired to it).
- **Real sending seams, env-gated** (hand-off links stay as the fallback when keys are absent):
  - Email via **SMTP** (`SMTP_HOST/PORT/USER/PASS/FROM`) — "Send email" in comms sends server-side + logs.
  - **WhatsApp Cloud API** (`WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`) — same for WhatsApp.
  - **Stripe** (`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`) — "Payment link" on a sent invoice
    (stored in `invoices.stripe_ref`) + webhook reconcile → auto-mark paid.
  - Supabase **custom SMTP** for magic-link mail = dashboard config, documented in DEPLOY.md.
- **Intake hardening** — honeypot + minimum-fill-time + per-IP rate limit on the public form.
- **Done when:** with keys present a family update actually sends and an invoice can be paid online;
  without keys everything still works as hand-off.

### M5 · AI copilot ⬜ 🔗 M1
- Behind `ANTHROPIC_API_KEY` (feature hidden without it). Claude API server-side.
- Draft the consulate email; **OCR a death certificate → auto-fill a case**; case summaries; daily "urgent before Shabbos" brief
- **Done when:** the copilot removes real typing from the intake + correspondence loop.

### M6 · Offline hardening ⬜ 🔗 M1
- Real local-first sync (Dexie outbox + background replay); installable PWA; field-test at hospital/airport/cemetery
- **Done when:** the app is fully usable with no signal and reconciles cleanly on reconnect.

### M7 · Cutover ⬜ 🔗 M1 (+ parity)
- Parity checklist vs the live tool (permit, intake, import, EN/DE, offline, saved cases) all green
- Motty runs the hub in parallel with the live tool for a real period
- Redirect the `permit-hub` domain / retire the standalone once trusted
- **Done when:** the hub is the source of truth and the standalone is decommissioned.

### M8 · (optional) Multi-tenant SaaS ⬜
Other European kehillos — the actual business. Only after M7 and Motty's endorsement.

---

## Critical path

```
M0 backend/auth ──▶ M1 integration ──▶ M1 intake + doc vault ──▶ parity ──▶ M7 cutover
                                   └─▶ M2 / M3 / M4 / M5 / M6 (parallel once M1 lands)
```

Everything of value hangs off **M1**. M2–M6 can run as parallel tracks (one per fork) once the case+data
loop is real. Cutover (M7) is gated on parity, not on M2–M6 being finished.

---

## The current live tool during all this

`burial-permit-v2` (repo `permit-hub`) stays **live and authoritative** until M7. It gets bug-fixes only
(like today's checkbox fix) — no new features. Motty loses nothing while the hub is built alongside it.

---

## Open decisions / risks

- **Name** (Derech / other) — cosmetic, low-risk, decide before M0 repo creation.
- **Retention periods** — confirm Austrian statutory periods with IKG/legal before M1 go-live (GDPR).
- **Intake abuse** — public intake needs rate-limit / captcha at the app edge (M1).
- **Auth scope** — Motty-only vs named staff from day one (affects M0).
- **Scope discipline** — resist building M3/M4 before M1 is real; the wedge earns the rest.
