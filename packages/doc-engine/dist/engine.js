/**
 * Generic PDF form-overlay engine — PLANNING.md §7.
 *
 * Ported verbatim from the field-tested burial-permit tool's buildPdf()
 * (burial-permit-v2/dev/template.html). The drawing semantics below are
 * verified against the real Israeli-MFA consulate form — treat them as
 * load-bearing constants, not style choices:
 *
 *  - text fields: baseline draw at (x, y), default size 10; values wider
 *    than maxWidth are truncated char-by-char until they fit.
 *  - grids: one char per printed box, each centered per box:
 *    x = centers[i] - charWidth/2, at grid y.
 *  - checks: template x/y is the X's VISUAL CENTER (matches the calibration
 *    tool, which places markers on the box center). Draw origin is derived:
 *    x - glyphWidth/2, y - capHeight/2 (Helvetica cap height = 0.718em).
 *    Verified against the real form render — X lands inside the printed box.
 *  - pdf-lib perf: load with { parseSpeed: Fastest, updateMetadata: false }
 *    and save with { objectsPerTick: Infinity } so generation never yields
 *    through setTimeout (immune to background-tab timer throttling).
 *  - Helvetica / WinAnsi only. Non-encodable text (e.g. Hebrew) is caught
 *    up-front by validate()/validateEncoding() per field, never mid-draw.
 *
 * Zero framework deps; runs in browser and Node.
 */
import { PDFDocument, StandardFonts, ParseSpeeds, rgb } from 'pdf-lib';
/** Default font size for text fields and grids (pt). */
export const DEFAULT_TEXT_SIZE = 10;
/** Checkbox mark: 'X' at size 7, drawn centered on the template's x/y. */
export const CHECK_MARK = { glyph: 'X', size: 7, capHeight: 0.718 };
/* ==============================================================
   Binding resolution
   ============================================================== */
/**
 * Walk a dot-path ("case.secular_last") into a nested data object.
 * Returns undefined if any segment is missing.
 */
export function resolvePath(data, path) {
    let cur = data;
    for (const seg of path.split('.')) {
        if (cur == null || typeof cur !== 'object')
            return undefined;
        cur = cur[seg];
    }
    return cur;
}
/**
 * Resolve every field/grid/check key of the template against `data` using
 * `template.bindings`. A key without a binding falls back to `data[key]`.
 * Returns a flat map: key → raw resolved value.
 */
export function resolveBindings(template, data) {
    const out = {};
    const keys = [
        ...template.fields.map((f) => f.key),
        ...template.grids.map((g) => g.key),
        ...template.checks.map((c) => c.key),
    ];
    for (const key of keys) {
        const path = template.bindings[key];
        out[key] = path !== undefined ? resolvePath(data, path) : data[key];
    }
    return out;
}
/* ==============================================================
   Encoding validation (Helvetica / WinAnsi)
   ============================================================== */
/**
 * Characters WinAnsi (CP-1252) can encode beyond printable ASCII and
 * Latin-1 (U+00A0–U+00FF): the 0x80–0x9F extras.
 */
const WINANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ' +
    '‘’“”•–—˜™š›œžŸ');
/** True if a single character is encodable in WinAnsi (standard Helvetica). */
export function isWinAnsiChar(ch) {
    const cp = ch.codePointAt(0);
    if (cp === undefined)
        return false;
    if (cp >= 0x20 && cp <= 0x7e)
        return true; // printable ASCII
    if (cp >= 0xa0 && cp <= 0xff)
        return true; // Latin-1 supplement
    return WINANSI_EXTRAS.has(ch);
}
/**
 * Flags characters the standard Helvetica/WinAnsi fonts cannot draw
 * (e.g. Hebrew, Cyrillic, emoji). Returns the offending characters,
 * deduplicated, in first-appearance order — empty array means the text
 * is safe. Use this per field instead of letting pdf-lib throw mid-save.
 */
export function validateEncoding(text) {
    const bad = [];
    const seen = new Set();
    for (const ch of text) {
        if (!isWinAnsiChar(ch) && !seen.has(ch)) {
            seen.add(ch);
            bad.push(ch);
        }
    }
    return bad;
}
/* ==============================================================
   Template + data validation
   ============================================================== */
function asText(value) {
    if (value === null || value === undefined)
        return '';
    return String(value);
}
function isEmpty(value) {
    return value === null || value === undefined || asText(value).trim() === '';
}
/**
 * Validate `data` against a template WITHOUT touching a PDF:
 *  - required fields/grids whose resolved value is empty → 'missing'
 *  - any text value with WinAnsi-unencodable characters → 'encoding'
 *  - grid values longer than the number of printed boxes → 'overflow'
 * Checks (booleans) are never required and never carry encoding issues.
 */
export function validate(template, data) {
    const resolved = resolveBindings(template, data);
    const issues = [];
    for (const f of template.fields) {
        const value = resolved[f.key];
        if (f.required && isEmpty(value)) {
            issues.push({ key: f.key, kind: 'missing', message: `Required field "${f.key}" is empty` });
            continue;
        }
        if (isEmpty(value))
            continue;
        const bad = validateEncoding(asText(value));
        if (bad.length) {
            issues.push({
                key: f.key,
                kind: 'encoding',
                message: `Field "${f.key}" contains characters Helvetica/WinAnsi cannot print: ${bad.join(' ')}`,
                chars: bad,
            });
        }
    }
    for (const g of template.grids) {
        const value = resolved[g.key];
        if (g.required && isEmpty(value)) {
            issues.push({ key: g.key, kind: 'missing', message: `Required grid "${g.key}" is empty` });
            continue;
        }
        if (isEmpty(value))
            continue;
        const text = asText(value);
        const bad = validateEncoding(text);
        if (bad.length) {
            issues.push({
                key: g.key,
                kind: 'encoding',
                message: `Grid "${g.key}" contains characters Helvetica/WinAnsi cannot print: ${bad.join(' ')}`,
                chars: bad,
            });
        }
        if ([...text].length > g.centers.length) {
            issues.push({
                key: g.key,
                kind: 'overflow',
                message: `Grid "${g.key}" has ${[...text].length} characters but only ${g.centers.length} boxes — extra characters will be dropped`,
            });
        }
    }
    return { ok: issues.length === 0, issues };
}
/* ==============================================================
   Generation
   ============================================================== */
/**
 * Overlay `data` onto the blank form `pdfBytes` per `template`.
 * Detailed variant — reports what was drawn vs. skipped.
 *
 * Throws an Error (with `.issues: ValidationIssue[]`) BEFORE any drawing if
 * any resolved text contains non-WinAnsi characters, so generation never
 * fails half-way through. Call validate() first for graceful UI handling.
 */
export async function generateDetailed(input) {
    const { template, pdfBytes, data } = input;
    const resolved = resolveBindings(template, data);
    // Pre-flight: refuse to start drawing if anything is unencodable.
    const encodingIssues = validate(template, data).issues.filter((i) => i.kind === 'encoding');
    if (encodingIssues.length) {
        const err = new Error('Cannot generate: non-encodable characters in ' +
            encodingIssues.map((i) => i.key).join(', '));
        err.issues = encodingIssues;
        throw err;
    }
    // parseSpeed Fastest + objectsPerTick Infinity tell pdf-lib never to yield
    // via setTimeout — keeps generation synchronous (~60 ms) and immune to
    // background-tab timer throttling on slow phones/tablets.
    const doc = await PDFDocument.load(pdfBytes, {
        parseSpeed: ParseSpeeds.Fastest,
        updateMetadata: false,
    });
    const pages = doc.getPages();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const black = rgb(0, 0, 0);
    const drawn = [];
    const skipped = [];
    const pageOf = (n, key) => {
        const p = pages[n - 1];
        if (!p)
            throw new Error(`Template "${template.key}": "${key}" targets page ${n}, but the PDF has ${pages.length} page(s)`);
        return p;
    };
    // Free-text fields: baseline draw; truncate char-by-char while too wide.
    for (const f of template.fields) {
        let text = asText(resolved[f.key]);
        if (!text) {
            skipped.push(f.key);
            continue;
        }
        const size = f.size ?? DEFAULT_TEXT_SIZE;
        while (text.length > 1 && font.widthOfTextAtSize(text, size) > f.maxWidth) {
            text = text.slice(0, -1);
        }
        pageOf(f.page, f.key).drawText(text, { x: f.x, y: f.y, size, font, color: black });
        drawn.push(f.key);
    }
    // Digit grids: one char per box, each centered on its box center.
    for (const g of template.grids) {
        const chars = asText(resolved[g.key]).slice(0, g.centers.length);
        if (!chars) {
            skipped.push(g.key);
            continue;
        }
        const size = g.size ?? DEFAULT_TEXT_SIZE;
        const page = pageOf(g.page, g.key);
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            const w = font.widthOfTextAtSize(ch, size);
            page.drawText(ch, { x: g.centers[i] - w / 2, y: g.y, size, font, color: black });
        }
        drawn.push(g.key);
    }
    // Checkboxes: template x/y is the X's visual center — derive the baseline
    // origin (x - glyphWidth/2, y - capHeight/2) so the mark sits in the box.
    const checkW = font.widthOfTextAtSize(CHECK_MARK.glyph, CHECK_MARK.size);
    const checkDy = (CHECK_MARK.size * CHECK_MARK.capHeight) / 2;
    for (const c of template.checks) {
        if (!resolved[c.key]) {
            skipped.push(c.key);
            continue;
        }
        pageOf(c.page, c.key).drawText(CHECK_MARK.glyph, {
            x: c.x - checkW / 2,
            y: c.y - checkDy,
            size: CHECK_MARK.size,
            font,
            color: black,
        });
        drawn.push(c.key);
    }
    const bytes = await doc.save({ objectsPerTick: Infinity });
    return { bytes, drawn, skipped };
}
/**
 * Overlay `data` onto the blank form `pdfBytes` per `template` and return
 * the filled PDF. The blank input is never modified.
 */
export async function generate(template, pdfBytes, data) {
    const result = await generateDetailed({ template, pdfBytes, data });
    return result.bytes;
}
