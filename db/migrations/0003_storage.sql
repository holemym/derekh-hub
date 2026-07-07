-- =============================================================================
-- Derech — Migration 0003: Storage buckets + object policies
--
-- Two PRIVATE buckets (PLANNING.md §11 — no public buckets, signed URLs only):
--   * case-docs       — per-case documents (uploads + generated PDFs).
--                       Layout: <case_id>/... for staff files,
--                               intake/<submission-uuid>/... for family uploads.
--   * form-templates  — blank template PDFs + page images for the doc engine.
--
-- Access:
--   * active staff: full read/write/delete on both buckets.
--   * anon: INSERT into case-docs ONLY under the 'intake/' prefix
--     (public family-intake uploads). No read-back — an uploaded file is
--     write-only for the uploader.
--
-- storage.objects already has RLS enabled by Supabase; we only add policies.
-- Requires 0002_rls.sql (public.is_active_staff()).
-- NOTE: reviewed but not executed — no live database exists yet.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Buckets (private: public = false)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('case-docs',      'case-docs',      false),
  ('form-templates', 'form-templates', false)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Staff: full access to both buckets
-- (split per operation so intent stays explicit and auditable)
-- -----------------------------------------------------------------------------

create policy "staff_select_derech_objects" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('case-docs', 'form-templates')
    and public.is_active_staff()
  );

create policy "staff_insert_derech_objects" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('case-docs', 'form-templates')
    and public.is_active_staff()
  );

create policy "staff_update_derech_objects" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('case-docs', 'form-templates')
    and public.is_active_staff()
  )
  with check (
    bucket_id in ('case-docs', 'form-templates')
    and public.is_active_staff()
  );

create policy "staff_delete_derech_objects" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('case-docs', 'form-templates')
    and public.is_active_staff()
  );

-- -----------------------------------------------------------------------------
-- Anon: family-intake uploads only, and only under case-docs/intake/
-- storage.foldername(name) returns the path segments minus the filename;
-- [1] is the top-level folder.
-- No select/update/delete policy for anon -> uploads are write-only.
-- -----------------------------------------------------------------------------

create policy "anon_insert_intake_uploads" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'case-docs'
    and (storage.foldername(name))[1] = 'intake'
  );
