-- v0.8.6: control whether item descriptions and recipes are shown publicly.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS show_description boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_recipe boolean NOT NULL DEFAULT false;
