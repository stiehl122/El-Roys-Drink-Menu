-- Add canonical_id column to featured_groups for stable machine-identity lookup.
-- Display names (name column) are kept for backwards compatibility but are no
-- longer the primary lookup key for restaurant specials.

ALTER TABLE public.featured_groups
  ADD COLUMN IF NOT EXISTS canonical_id text;

-- Stamp canonical IDs on existing rows that match known display names.
UPDATE public.featured_groups
  SET canonical_id = 'leroyslounge-specials'
  WHERE name = 'Leroy''s Specials' AND canonical_id IS NULL;

UPDATE public.featured_groups
  SET canonical_id = 'elroyscantina-specials'
  WHERE name = 'El Roy''s Specials' AND canonical_id IS NULL;

-- Create a unique index on canonical_id (partial — only non-null values).
CREATE UNIQUE INDEX IF NOT EXISTS featured_groups_canonical_id_key
  ON public.featured_groups (canonical_id)
  WHERE canonical_id IS NOT NULL;
