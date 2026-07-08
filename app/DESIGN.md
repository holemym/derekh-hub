# Derech — design language (v2: "Quiet & dignified")

The hub sits inside death-care work. It should feel calm, unhurried, and human —
never busy or "product-y." Monochrome and minimal, but warm. Everything on screen
earns its place; when in doubt, remove it and add air.

## Typography
- **Typeface:** Hanken Grotesk (next/font/google), variable `--font-sans`. Fallback: system-ui.
- **Weights:** 400 regular, 500 medium, 600 semibold. Never heavier. Two weights per view ideally.
- **Type scale (use these, no ad-hoc `text-[13px]`):**
  - `display` 30px / 1.15 / 600 — page titles (Today, Cases)
  - `title` 20px / 1.25 / 600 — sheet + section headers
  - `heading` 16px / 1.35 / 500 — card titles, list rows
  - `body` 15px / 1.6 / 400 — default
  - `meta` 13px / 1.5 / 400 — secondary/supporting
  - `label` 11px / 1.4 / 500, uppercase, tracking 0.06em, `--muted` — eyebrows/section labels
- Tabular numerals everywhere (already global). Generous line-height. Sentence case, never ALL-CAPS except `label`.

## Color & surface (warm monochrome)
- Light: bg `#f7f6f4` (warm off-white), card `#ffffff`, ink `#17160f`, muted `#8b887f`, line `#e9e7e2`.
- Dark: bg `#0e0d0b`, card `#171614`, ink `#f3f1ec`, muted `#9a978d`, line `#2a2823`.
- **One accent only:** `--urgent` (warm red) reserved for time-critical / before-candle-lighting. Nothing else colored.
- Surfaces are soft: cards use a whisper of shadow (`0 1px 2px rgba(0,0,0,.04)`, dark `.4`) + hairline, radius 16px. Rounded, gentle. No hard edges.

## Spacing & rhythm
- Base unit 4px. Prefer generous padding (cards `p-5`), section gaps `gap-6`/`space-y-6`.
- Content max-widths: mobile fluid; desktop reading column ~720px, app shell wider (below).

## Motion (restrained, all `prefers-reduced-motion`-safe)
- Keep existing: `rise-in` (staggered card entrance), `pressable`, `pulse-dot` (urgent only), `stroke-draw`.
- Add: **page transition** (subtle 200ms fade + 6px rise on route change via `app/template.tsx`), **nav active indicator** (soft sliding pill/underline), **skeleton shimmer**, sheet/panel ease-out. Nothing bouncy or fast — everything settles gently (ease `cubic-bezier(.16,1,.3,1)`).

## Loading
- Every list/detail route gets a `loading.tsx` with skeletons matching the real layout (shimmer, not spinners).
- A calm **first-load splash**: centered monoline mark that draws in, fades to the app. Shown only until hydration/auth resolves.

## Responsive — one app, two shells (SAME components, adaptive)
- **Mobile (`< lg`, current):** top `Header`, centered ~680px column, bottom `TabNav`.
- **Desktop (`≥ lg`):** left **sidebar** (brand top; vertical nav Today / Cases / Transport / Money / Tasks; sign-out + language bottom) replaces bottom tabs; a slim top bar (page title + Hebrew/greg date + New-permit action). Content widens and goes **multi-pane** where it helps:
  - Today: main column + right rail (before-Shabbos, due-soon, counts).
  - Cases: master list + detail two-pane (list left, selected case right); mobile stays list → full-page detail.
  - Case detail: two columns (summary/pipeline left; documents/transport/money/tasks/activity right).
- Public routes (`/login`, `/intake`, `/intake/thanks`) stay single-column, no app chrome.

## Principles
Purposeful over decorative. Air over density. One accent, used rarely. Calm motion.
If a screen feels busy, cut — don't rearrange.
