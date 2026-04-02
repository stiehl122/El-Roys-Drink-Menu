-- v0.7.6: Restaurant-scoped custom design flag
-- Adds restaurants.use_custom_design while preserving the legacy menus column.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS use_custom_design boolean NOT NULL DEFAULT false;
