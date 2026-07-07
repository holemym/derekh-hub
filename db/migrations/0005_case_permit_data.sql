-- 0005 — store the full permit form snapshot on the case.
--
-- The "New permit" form collects every field the official permit needs — some
-- map to normalized columns (name, dates, burial_place...), but others are
-- permit-only (funeral-service name/no/expiry, the 9 document checkboxes,
-- transfer logistics before a formal transport_leg exists). Rather than force
-- normalization up front, keep the raw form snapshot here so the permit can be
-- regenerated verbatim and nothing the operator typed is lost.
--
-- Normalized columns remain the source of truth for the dashboard/pipeline;
-- permit_data is the belt-and-braces snapshot for document regeneration.

alter table public.cases
  add column if not exists permit_data jsonb;

comment on column public.cases.permit_data is
  'Raw snapshot of the New-permit form (all permit fields incl. funeral service + document checkboxes) for verbatim permit regeneration.';
