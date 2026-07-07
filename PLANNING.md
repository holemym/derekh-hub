# Burial & Body-Transport Hub — Planning & Brief

> Working codename: **Derech** ("the way" — the niftar's final journey). Placeholder; rename freely.
> Operator: **Motty (Mordechai Hammer)** — IKG Vienna burial + body-transportation / repatriation.
> Scope note: the **passenger taxi** business is a *separate* system. Not in this hub. No shared DB or UI.

---

## 1. What this is

One operational + planning hub for Motty's **death-care logistics**: every niftar is a **case** that moves
through a defined pipeline from first notification to burial. The hub coordinates the documents, the physical
transport/repatriation of the body, the contacts, the money, and the family communication — with
**Jewish-calendar / halachic time intelligence** woven through everything.

Simple on the surface. A beast underneath.

---

## 2. Principles (tachlis)

1. **One case, one truth.** Everything about a niftar lives in one place — no re-typing, no lost documents.
2. **Time-critical by nature.** Halacha wants speed (*kevod hames*); Shabbos/Yom-Tov blocks handling and flights.
   The hub computes and surfaces urgency automatically — it never lets a deadline hide.
3. **Do the next thing.** Every case always shows the single most important next action. The app removes decisions,
   not adds them.
4. **Mobile-first, works independently.** Motty works from his phone — hospitals, airports, cemeteries, poor signal.
   The app must function offline and generate documents on-device.
5. **Documents are data.** A generic form-fill engine; every official form is config, not code.
6. **Quiet software.** No clutter, no noise. It disappears and lets him work.

---

## 3. "Works independently" — offline-first architecture

The requirement to work independently is a first-class design driver, not a feature bolt-on.

- **Local-first PWA.** Installable. A local store (IndexedDB via Dexie) caches active cases; the app reads/writes
  locally and stays fully usable with no signal.
- **Background sync.** Mutations made offline go into an **outbox** and replay to the server on reconnect.
  Optimistic UI — every action lands instantly on-device, syncs quietly behind the scenes.
- **On-device document generation.** PDF generation stays **client-side** (pdf-lib) so a permit can be produced at
  the consulate or airport with zero connectivity. *(This is the one place the current tool's architecture is an
  asset — we keep it.)*
- **Server = shared source of truth + storage.** Supabase Postgres holds the canonical state; Storage holds files.
  Full CRDT sync is overkill for one operator + a few staff — a cached-reads + queued-writes model is the efficient
  fit.

---

## 4. Tech stack (efficient — reuse what David already runs)

| Concern | Choice | Why |
|---|---|---|
| App | **Next.js (App Router, TS)** | Reuse the `property-ops` scaffolding & patterns already built |
| Data/auth/storage | **Supabase** (Postgres + Auth + RLS + Storage + Realtime) | One backend; row-level security; signed file URLs |
| UI | **Tailwind + Base-UI** | Matches property-ops (note: Base-UI uses `render`, not `asChild`) |
| Docs | **pdf-lib** (client-side) | Harvested engine; offline generation |
| i18n | **next-intl** | Real message catalogs (EN/DE + Hebrew where needed) — replaces the DIY transform |
| Jewish calendar | **@hebcal/core** | Zmanim, Hebrew dates, chagim — runs locally, no API |
| Offline | Service worker + **Dexie** (IndexedDB) outbox | Local-first cache + queued writes |
| Motion | **Framer Motion** (restrained) | Shared-element + micro-interactions, reduced-motion aware |
| Deploy | **Vercel** | Same pipeline; set Root Directory correctly this time |

---

## 5. Data model (core entities)

- **Case** (the niftar) — hebrew_name, secular_name, dob, dod, place_of_death, id/passport, nationality,
  `status` (pipeline enum), urgency flags, cemetery, burial_place, assigned_to, per-stage timestamps.
- **Contact** — family, chevra kadisha (Vienna + Israel), consulate, airline/cargo, hospital/morgue, cemetery,
  hearse operator. Linked via `case_contacts(role)`.
- **Document** — case_id, type (template key), status (needed / received / generated), Storage file,
  `generated_from` (template + data snapshot).
- **FormTemplate** — the generic engine: `{ key, title, pdf_asset, pages[], fields[], grids[], checks[], bindings }`.
  *This is the efficiency lever (see §7).*
- **TransportLeg** — case_id, type (ground / air-cargo / domestic), from, to, carrier, flight/AWB no.,
  scheduled_at, status, chain-of-custody timestamps.
- **Task** — case_id?, title, due (calendar-aware), status, assignee, reminder.
- **Invoice / Payment / Expense** — case_id, amounts, status, Stripe refs.
- **Message** — case_id, channel (whatsapp/email/sms), template, sent_at — family status updates.
- **ActivityLog** — who/what/when. Required for a sensitive official process + GDPR.

---

## 6. The case pipeline

`Notified → Collected → Prepared (tahara) → Documents & Permits → Transport (ground/air) → Arrived → Buried`

Each stage: computed next-action, owner, deadline (Shabbos/chag-aware), and the documents/legs it requires.
The dashboard sorts every open case by **real urgency**, not creation date.

---

## 7. Generic document engine (the big efficiency win)

Instead of one hard-coded form, a **FormTemplate is data**:

```
FormTemplate {
  key: "il-mfa-transfer-permit",
  pdf_asset, pages: [{img,w,h}],
  fields: [{ key, page, x, y, maxWidth, size, type }],
  grids:  [{ key, page, y, centers[] }],       // per-digit boxes
  checks: [{ key, page, x, y }],
  bindings: { field_key: "case.attribute.path" }
}
```

- **Generation** = load template PDF (pdf-lib, no-tick options) → read case data via `bindings` → overlay → save.
  Same engine we built, now reading config from the DB instead of hard-coded constants.
- **Calibration tool** (harvested) = admin UI: load a template's page images, click to place fields, write the
  coordinate map back to the `FormTemplate` row.
- **Payoff:** adding *Austrian death-cert request*, *airline known-shipper form*, *sealing certificate*, or another
  country's consular permit = upload blank PDF → calibrate → define bindings. **Zero new code per form.**
  The whole "full document packet" becomes config.

Seed template #1 = the Israeli MFA permit, coordinates ported verbatim from the current tool's `CONFIG`.

---

## 8. What we harvest vs. discard from the current tool

**Harvest (the real assets):**
- The **coordinate map** (exact field/checkbox/grid positions) — never re-measure.
- The **calibration tool** — becomes the template-authoring admin.
- The **pdf-lib generation engine** (incl. the `parseSpeed:Fastest` / `objectsPerTick:Infinity` no-tick fix).
- The **design system** (monochrome, mobile-first) and the **intake field model**.

**Discard (scaffolding that only existed for "no backend"):**
- The single-file **base64-inlining build** (`build.py`, 2 MB monolith).
- The **JSON-bundle handoff + localStorage** — replaced by public intake → DB + Storage.
- The **DIY i18n transform script** — replaced by next-intl.

---

## 9. Design language — elevated

**Feel:** quiet, confident, fast. Simplified surface, powerful underneath.

- **Monoline visual system.** Consistent ~1.5px stroke icons, hairline dividers, outlined forms, generous
  whitespace. Monochrome base (carry the black/white) + **one semantic accent reserved for urgency** (warm red),
  used sparingly so it *means* something.
- **Typography.** One neo-grotesque (Inter / General Sans) + **tabular numbers** for times, dates, money.
  Strong hierarchy, large touch targets.
- **Layout.** Mobile-first command surface. One card per case with the **single next action** prominent.
  Bottom tab nav (Today · Cases · Transport · More). Chrome-light, content-forward.
- **Motion — slight, purposeful (never decoration):**
  - Shared-element transition: a case card **expands into** its detail view.
  - Monoline **stroke-draw** on completion (a check draws itself) — ties motion to the visual language.
  - Status change animates the pipeline step; sheets ease in; lists spring gently on reorder.
  - Skeleton shimmer while syncing; optimistic UI makes it feel instant even offline.
  - Full `prefers-reduced-motion` support; haptics on key mobile actions.
- **Progressive disclosure.** Case = clean summary + one CTA; documents, transport legs, contacts, money, and
  history are a tap deeper. **⌘K command palette** for power use. Smart defaults everywhere (calendar prefilled,
  next action computed).

**Signature screen — "Today":** one scroll — a *before-Shabbos* countdown when relevant, then cases needing action
sorted by urgency; each a monoline card (Hebrew + secular name, status dot, the one next action as a button, a
subtle route line if a body is in transit).

---

## 10. Domain intelligence (the differentiator)

- **Hebcal everywhere** — Hebrew dates, Vienna zmanim, candle-lighting / Shabbos-end boundaries, chagim, fast days.
- **Scheduling refuses Shabbos/Yom-Tov** and flags "last window before candle-lighting."
- **Burial urgency** surfaced per halacha; the pipeline pressures the time-critical case to the top.
- **AI copilot (Claude, later phase):** draft the consulate email, **OCR a death certificate to auto-fill a case**,
  summarize a case, produce the daily "what's urgent before Shabbos" brief.

---

## 11. Security & compliance (first-class, not a nicety)

Deceased + family personal data + cause-of-death (medical) → **sensitive under EU/Austria GDPR**.

- Supabase **RLS**, auth (magic link), least-privilege; access limited to Motty + authorized staff.
- Encryption at rest + TLS; **private Storage buckets** with signed URLs.
- **ActivityLog / audit trail**; data **retention & deletion** policy; consent + privacy notice on the public intake.

The offline tool's promise ("data never leaves your device") flips to "hosted, with your data" — so the security
story must be visible and real.

---

## 12. Phased roadmap

- **Phase 0 — Foundation.** Next.js + Supabase + auth + design system + PWA shell + offline cache + Hebcal + nav.
- **Phase 1 — Cases + Documents (the wedge).** Case CRUD + pipeline; generic FormTemplate engine + calibration;
  migrate the Israeli permit as template #1; document vault (Storage); **public intake → creates/updates a case**
  (kills the JSON handoff); client-side offline generation. *Harvests everything; stands on its own.*
- **Phase 2 — Planning brain.** Today dashboard, tasks, Jewish-calendar/zmanim, urgency + Shabbos surfacing, reminders.
- **Phase 3 — Transport & repatriation.** Transport legs, airline-cargo bookings + forms (new templates),
  chain-of-custody, cemetery coordination.
- **Phase 4 — Money + comms.** Invoicing/expenses, Stripe, WhatsApp/email family updates (templated, calendar-aware).
- **Phase 5 — AI copilot.** Consulate-email drafting, death-cert OCR auto-fill, case summaries, daily brief.
- **Phase 6 — (optional) multi-tenant SaaS** for other European kehillos.

---

## 13. Phase 1 — concrete first build

- [ ] Repo scaffold (fork property-ops patterns); Supabase project.
- [ ] Schema: Case, Contact, Document, FormTemplate (+ ActivityLog).
- [ ] Auth (email magic link) — Motty + staff.
- [ ] Cases: today/pipeline list, create, detail with status.
- [ ] FormTemplate engine + **seed the Israeli permit** (coords from current `CONFIG`) + calibration admin.
- [ ] Client-side document generation (offline-capable) → save to Storage.
- [ ] Public intake route → creates a case + uploads docs to Storage (replaces JSON handoff).
- [ ] Design system: monoline tokens, motion primitives, PWA shell.

---

## 14. Open decisions

- Name (Derech / Shaliach / Chesed OS / other).
- Auth: just Motty, or Motty + named staff from day one?
- Hosting region (EU — Frankfurt — for GDPR).
- How much of the taxi business stays permanently separate vs. a shared contacts/identity layer later (default: fully separate).
