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
import type { FormTemplate, GenerateInput, GenerateResult, ValidationResult } from './types.js';
/** Default font size for text fields and grids (pt). */
export declare const DEFAULT_TEXT_SIZE = 10;
/** Checkbox mark: 'X' at size 7, drawn centered on the template's x/y. */
export declare const CHECK_MARK: {
    readonly glyph: "X";
    readonly size: 7;
    readonly capHeight: 0.718;
};
/**
 * Walk a dot-path ("case.secular_last") into a nested data object.
 * Returns undefined if any segment is missing.
 */
export declare function resolvePath(data: unknown, path: string): unknown;
/**
 * Resolve every field/grid/check key of the template against `data` using
 * `template.bindings`. A key without a binding falls back to `data[key]`.
 * Returns a flat map: key → raw resolved value.
 */
export declare function resolveBindings(template: FormTemplate, data: Record<string, unknown>): Record<string, unknown>;
/** True if a single character is encodable in WinAnsi (standard Helvetica). */
export declare function isWinAnsiChar(ch: string): boolean;
/**
 * Flags characters the standard Helvetica/WinAnsi fonts cannot draw
 * (e.g. Hebrew, Cyrillic, emoji). Returns the offending characters,
 * deduplicated, in first-appearance order — empty array means the text
 * is safe. Use this per field instead of letting pdf-lib throw mid-save.
 */
export declare function validateEncoding(text: string): string[];
/**
 * Validate `data` against a template WITHOUT touching a PDF:
 *  - required fields/grids whose resolved value is empty → 'missing'
 *  - any text value with WinAnsi-unencodable characters → 'encoding'
 *  - grid values longer than the number of printed boxes → 'overflow'
 * Checks (booleans) are never required and never carry encoding issues.
 */
export declare function validate(template: FormTemplate, data: Record<string, unknown>): ValidationResult;
/**
 * Overlay `data` onto the blank form `pdfBytes` per `template`.
 * Detailed variant — reports what was drawn vs. skipped.
 *
 * Throws an Error (with `.issues: ValidationIssue[]`) BEFORE any drawing if
 * any resolved text contains non-WinAnsi characters, so generation never
 * fails half-way through. Call validate() first for graceful UI handling.
 */
export declare function generateDetailed(input: GenerateInput): Promise<GenerateResult>;
/**
 * Overlay `data` onto the blank form `pdfBytes` per `template` and return
 * the filled PDF. The blank input is never modified.
 */
export declare function generate(template: FormTemplate, pdfBytes: Uint8Array, data: Record<string, unknown>): Promise<Uint8Array>;
