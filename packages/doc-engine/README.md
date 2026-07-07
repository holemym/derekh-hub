# @derech/doc-engine

Generic "overlay data onto any official PDF form" engine (PLANNING.md §7). Zero framework
dependencies — runs in the browser (offline generation) and in Node (tests, server-side).
Harvested from the field-tested IKG Vienna burial-permit tool.

## The FormTemplate contract

A form is **data, not code**:

```jsonc
{
  "key": "il-mfa-transfer-permit",
  "title": "Permit to transfer a body for burial in Israel",
  "pageSize": { "width": 594.96, "height": 842.04 },   // pt, y=0 at BOTTOM (pdf-lib)
  "fields": [ { "key": "surname", "page": 1, "x": 59.6, "y": 638.2, "maxWidth": 225 } ],
  "grids":  [ { "key": "id_number", "page": 1, "y": 493.4, "centers": [ /* one x per printed box */ ] } ],
  "checks": [ { "key": "chk_doc1", "page": 2, "x": 62.6, "y": 700.5 } ],
  "bindings": { "surname": "case.secular_last" }        // dot-paths into the data object
}
```

Adding a new official form (airline cargo, Austrian death-cert request, another consulate):
**upload blank PDF → click positions in the calibration admin → define bindings. Zero code.**

## Drawing semantics (load-bearing — do not "improve")

- **Text fields**: baseline draw at `(x, y)`, size 10 default; values wider than `maxWidth`
  truncate char-by-char.
- **Grids**: one character per printed box, centered per box: `x = centers[i] − charWidth/2`.
- **Checks**: template `x/y` is the **visual center of the X** (the calibration tool places
  markers on the box center). Draw origin is derived: `x − glyphWidth/2`,
  `y − capHeight/2` with Helvetica cap height `0.718em`, size 7.
  ⚠️ History: an older scheme stored box *anchors* and drew at `(x+1, y−4)`. The coordinates
  were later migrated to center-semantics; reintroducing the legacy offsets on top of
  center coordinates double-shifts the mark out of the box. Center coords + centered draw
  is the verified pairing (render-inspected against the real form, 2026-07-07).
- **pdf-lib performance**: `load(bytes, { parseSpeed: ParseSpeeds.Fastest, updateMetadata: false })`
  and `save({ objectsPerTick: Infinity })` — generation never yields through `setTimeout`,
  so it stays ~60ms and immune to background-tab throttling.
- **Helvetica/WinAnsi only** — no Hebrew/RTL in output. `validate()` / `validateEncoding()`
  flag non-encodable characters per field up-front instead of throwing mid-draw.

## API

```ts
import { generate, validate, resolveBindings } from '@derech/doc-engine';

const issues = validate(template, data);          // missing/encoding problems, per field
const bytes  = await generate({ template, pdfBytes, data }); // Uint8Array (filled PDF)
```

`data` is a nested context object the app composes — e.g.
`{ case: {...}, transport: {...}, funeral_service: {...}, declaration: {...} }`.
Bindings resolve against this context, **not** raw DB rows; the app layer maps schema → context.

## Seed template

`templates/il-mfa-transfer-permit.json` — the Israeli MFA transfer permit, all 29 positions
(18 fields, 2 digit-grids, 9 checkboxes) ported from the production tool and render-verified
against the real blank PDF (`test/generate.test.mjs`, output inspected page-by-page).

## Test

```
npm install && npx tsc && node test/generate.test.mjs
# writes test-output/filled.pdf from the real blank form with full sample data
```

Visual acceptance: render both pages (pypdfium2) and confirm every value sits in its cell,
one digit per grid box, X marks inside the printed checkboxes.
