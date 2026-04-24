-- v0.8.14: persist the per-item featured strip toggle on menu items.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS featured_enabled boolean NOT NULL DEFAULT false;
