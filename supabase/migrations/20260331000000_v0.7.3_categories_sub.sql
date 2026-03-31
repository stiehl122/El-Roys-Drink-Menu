-- v0.7.3: Add optional subtitle field for menu categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sub text NOT NULL DEFAULT '';
