-- =============================================================================
-- Derech — Migration 0004: case-level fields required by the permit bindings
--
-- The Israeli-MFA transfer-permit template
-- (packages/doc-engine/templates/il-mfa-transfer-permit.json) binds each PDF
-- field to a dotted context path. The paths under the `case.` prefix must
-- resolve to columns on public.cases. Cross-checking every `case.*` binding in
-- that template against the columns created in 0001_init.sql found TWO that the
-- cases table lacks:
--
--   * "pob"     -> case.place_of_birth   (no such column)
--   * "address" -> case.last_address     (cases has `address`, not `last_address`)
--
-- This migration adds only those two genuinely-missing CASE-LEVEL columns.
-- Both statements are idempotent (add column if not exists), so re-applying
-- this migration — or applying it after a hand-patch — is safe.
--
-- SCOPE NOTE — why nothing else is added here:
-- The remaining template bindings resolve to OTHER context namespaces that are
-- composed by the app's document-context layer (ROADMAP M1), NOT stored on the
-- cases row, and therefore must NOT become cases columns:
--   * transport.*        (flight_no, airline, disembarkation_point, transfer_date)
--                        -> derived from public.transport_legs (the chosen air leg)
--   * funeral_service.*  (name_address, license_no, license_expiry)
--                        -> the funeral service / operator, an app-level constant
--                           or contact, not a per-niftar attribute
--   * declaration.*      (date)
--                        -> the signing/declaration date, supplied at generation time
--   * documents.*        (nine checklist booleans)
--                        -> derived from the case's public.documents rows
-- Adding those as cases columns would duplicate data that already lives in (or
-- is computed from) other tables. The app mapper owns them; see the report.
--
-- Requires: 0001_init.sql (public.cases).
-- NOTE: reviewed but NOT executed — no live database exists yet.
-- =============================================================================

-- pob  -> case.place_of_birth
-- Place of birth of the niftar. Printed in the "Place of birth" box on page 1
-- of the permit. A plain case-level attribute of the deceased.
alter table public.cases
  add column if not exists place_of_birth text;

-- address -> case.last_address
-- Last (permanent) address of the niftar. The template binds `case.last_address`;
-- 0001 named the existing free-text address column `address`. Rather than rename
-- `address` (which risks orphaning app code and the demo seed that already writes
-- it), we add `last_address` as the permit-facing column. The app mapper resolves
-- `case.last_address` to this column; `address` remains as the general-purpose
-- address field. Backfill from `address` where sensible at go-live if desired.
alter table public.cases
  add column if not exists last_address text;
