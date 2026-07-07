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
export {};
