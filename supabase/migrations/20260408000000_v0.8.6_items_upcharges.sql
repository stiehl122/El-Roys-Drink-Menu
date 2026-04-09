-- v0.8.6: persist item upcharges and retire legacy off-menu visibility.
-- Hidden items now use on_menu = false; old featured references to off-menu
-- items are cleared so they do not keep surfacing through specials.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS upcharges jsonb NOT NULL DEFAULT '[]'::jsonb;

DELETE FROM public.featured_slots
WHERE item_id IN (
  SELECT id
  FROM public.items
  WHERE visibility = 'off_menu'
);

UPDATE public.items
SET on_menu = false,
    visibility = 'public'
WHERE visibility = 'off_menu';

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_visibility_check;

ALTER TABLE public.items
  ADD CONSTRAINT items_visibility_check
  CHECK (visibility = 'public');
