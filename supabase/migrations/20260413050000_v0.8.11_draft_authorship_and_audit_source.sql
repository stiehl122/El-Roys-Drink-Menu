-- v0.8.11: Add shared-draft authorship metadata and audit source stamping.
--
-- These columns are intentionally additive. The app layer downgrades cleanly
-- when they are absent so partially migrated environments can keep operating.

ALTER TABLE public.menu_meta
  ADD COLUMN IF NOT EXISTS draft_saved_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_saved_by_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS draft_saved_source text NOT NULL DEFAULT '';

ALTER TABLE public.update_log
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '';
