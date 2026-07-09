-- 0006 · Address dedupe (ROADMAP M1 reconciliation, executed in M4.5 cleanup)
--
-- 0001 created `address`; 0004 added `last_address` as the permit-facing
-- column. Two columns for one fact is a trap — the app standardizes on
-- `address` (the doc-engine binding key `case.last_address` is unchanged;
-- the app mapper resolves it from `address` now).
--
-- Applied one-off via a pg call (do NOT re-run apply-migrations.mjs — 0001
-- is not idempotent).

update public.cases
   set address = coalesce(last_address, address)
 where last_address is not null;

alter table public.cases drop column if exists last_address;
