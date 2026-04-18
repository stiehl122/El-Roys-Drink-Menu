ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS untappd_enabled boolean NOT NULL DEFAULT false;
