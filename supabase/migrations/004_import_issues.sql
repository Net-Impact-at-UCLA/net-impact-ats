-- =========================================================
-- Update 004: admin-only note for problems during the Google Form import
-- (e.g. a resume that was too large to copy). Run once in the SQL Editor.
-- =========================================================
alter table public.applicant_private add column if not exists import_issues text;
