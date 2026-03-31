-- v0.7.4: Add visibility tier to items (public / off_menu)
-- Off-menu items are staff-only; hidden from anonymous public view.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

-- Enforce allowed values
ALTER TABLE public.items
  ADD CONSTRAINT items_visibility_check
  CHECK (visibility IN ('public', 'off_menu'));

-- Replace the permissive "select all" policy with two:
-- 1. Anon users see only public-visibility items
-- 2. Authenticated users with menu access see all items
DROP POLICY IF EXISTS "items_select_all" ON public.items;

CREATE POLICY "items_select_public" ON public.items
  FOR SELECT
  USING (
    visibility = 'public'
    OR auth.role() = 'authenticated'
  );
