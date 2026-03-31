-- v0.7.2: Soft-delete support for menus
-- All existing menus default to false (visible).
ALTER TABLE public.menus ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
