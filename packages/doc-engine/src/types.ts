/**
 * FormTemplate contract — PLANNING.md §7.
 *
 * A FormTemplate is *data*: everything the engine needs to overlay case data
 * onto an official blank PDF form. Adding a new form = author one of these
 * (via the calibration admin) + a bindings map. Zero new code.
 *
 * Units: PDF points. Origin bottom-left (pdf-lib convention) — y grows UP.
 * Pages are 1-based (`page: 1` = first page), matching the calibration UI.
 */

/** Physical page size in PDF points (verified against the PDF MediaBox). */
export interface PageSize {
  width: number;
  height: number;
}

/**
 * Free-text field. `x`/`y` is the text BASELINE start.
 * Text wider than `maxWidth` is truncated char-by-char until it fits
 * (field-tested behaviour — never wraps, never shrinks).
 */
export interface TextFieldSpec {
  key: string;
  page: number;
  x: number;
  y: number;
  maxWidth: number;
  /** Font size override. Defaults to the engine default (10 pt). */
  size?: number;
  /** validate() reports this field when its resolved value is empty. */
  required?: boolean;
}

/**
 * Digit/character grid — one character per pre-printed box.
 * Each character is centered on `centers[i]`: drawn at
 * `x = centers[i] - charWidth / 2` at baseline `y`.
 * Input longer than `centers.length` is truncated.
 */
export interface GridSpec {
  key: string;
  page: number;
  y: number;
  centers: number[];
  /** Font size override. Defaults to the engine default (10 pt). */
  size?: number;
  required?: boolean;
}

/**
 * Checkbox mark. `x`/`y` is the calibration anchor (visual center of the
 * printed box). The engine draws an 'X' glyph at size 7 at (x + 1, y - 4).
 * Those offsets are field-verified against the real consulate form —
 * do NOT replace them with centered math.
 */
export interface CheckSpec {
  key: string;
  page: number;
  x: number;
  y: number;
}

/**
 * The generic document template. Serializes cleanly to JSON — this is what
 * the FormTemplate DB row stores and the calibration admin edits.
 */
export interface FormTemplate {
  /** Stable identifier, e.g. "il-mfa-transfer-permit". */
  key: string;
  /** Human-readable title. */
  title: string;
  /** Page size in PDF points; every page of the form is assumed equal. */
  pageSize: PageSize;
  fields: TextFieldSpec[];
  grids: GridSpec[];
  checks: CheckSpec[];
  /**
   * Maps a field/grid/check key to a dot-path into the data object handed to
   * generate(), e.g. `surname: "case.secular_last"`. Keys without a binding
   * fall back to `data[key]` directly.
   */
  bindings: Record<string, string>;
}

/** Everything generate() needs, as a single object (convenience form). */
export interface GenerateInput {
  template: FormTemplate;
  /** The blank official form. Never modified in place. */
  pdfBytes: Uint8Array;
  /** Case data; values are resolved via template.bindings dot-paths. */
  data: Record<string, unknown>;
}

/** Result of the detailed generation API. */
export interface GenerateResult {
  /** The filled PDF. */
  bytes: Uint8Array;
  /** Keys that produced visible output. */
  drawn: string[];
  /** Keys skipped because their resolved value was empty / false / missing. */
  skipped: string[];
}

/** One problem found by validate(). */
export interface ValidationIssue {
  /** Template key (field / grid / check) the issue belongs to. */
  key: string;
  kind: 'missing' | 'encoding' | 'overflow';
  message: string;
  /** For 'encoding': the offending characters, deduplicated, in order. */
  chars?: string[];
}

/** Aggregate validation outcome. */
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}
