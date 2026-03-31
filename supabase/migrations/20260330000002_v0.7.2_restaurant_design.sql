-- v0.7.2: Move design settings to restaurant scope
-- A restaurant's brand (colors, fonts, logo) is shared across all its menus.
-- menu_meta.design is kept in schema but the app stops writing to it after this migration.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS design jsonb NOT NULL DEFAULT '{}';

-- Migrate existing designs from menu_meta up to their restaurant.
-- Only migrates if the restaurant design is still empty (safe to re-run).
UPDATE public.restaurants r
SET design = mm.design
FROM public.menus m
JOIN public.menu_meta mm ON mm.menu_id = m.id
WHERE m.restaurant_id = r.id
  AND mm.design != '{}'::jsonb
  AND r.design   = '{}'::jsonb;
