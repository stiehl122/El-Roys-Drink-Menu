-- v0.8.0: Hardcode the app around Leroy's Lounge and El Roy's Cantina
-- while preserving the relational restaurant/menu schema.

-- 1. Seed / rename the two known restaurants.
INSERT INTO public.restaurants (id, name, slug, use_custom_design)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'El Roy''s Cantina', 'el-roys-cantina', true),
  ('00000000-0000-0000-0000-000000000010', 'Leroy''s Lounge', 'leroys-lounge', true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  use_custom_design = true;

-- 2. Seed the four known menus. Reuse the historical El Roy's drinks UUID.
INSERT INTO public.menus (id, restaurant_id, name, slug, type)
VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Drinks', 'el-roys-cantina-drinks', 'drinks'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Food',   'el-roys-cantina-food',   'food'),
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'Drinks', 'leroys-lounge-drinks',   'drinks'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000010', 'Food',   'leroys-lounge-food',     'food')
ON CONFLICT (id) DO UPDATE
SET
  restaurant_id = EXCLUDED.restaurant_id,
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  type = EXCLUDED.type;

-- 3. Ensure each known menu has a menu_meta row.
INSERT INTO public.menu_meta (menu_id)
VALUES
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000020'),
  ('00000000-0000-0000-0000-000000000021')
ON CONFLICT (menu_id) DO NOTHING;

-- 4. Seed default categories only for menus that do not have any categories yet.
WITH drink_defs AS (
  SELECT *
  FROM (VALUES
    (0, 'beer',      'Beers on Tap',     '🍺', 'rgba(245,210,66,0.22)',  'Current draft offerings',         'e.g. Modelo Especial...'),
    (1, 'canned',    'Canned & Bottled', '🍻', 'rgba(140,200,120,0.18)', 'Canned & bottled offerings',     'e.g. Modelo Especial (can), Topo Chico...'),
    (2, 'cocktails', 'Cocktails',        '🍹', 'rgba(180,100,220,0.15)', 'Craft cocktail offerings',       'e.g. Paloma, Spicy Margarita...'),
    (3, 'tequila',   'Infused Tequila',  '🌶️', 'rgba(18,133,120,0.15)',  'Rotating infused marg tequila',  'e.g. Jalapeño-Pineapple Blanco...'),
    (4, 'frozen',    'Frozen Marg',      '🧊', 'rgba(100,180,255,0.18)', 'Current frozen margarita flavor', 'e.g. Strawberry Basil...'),
    (5, 'special',   'Monthly Specials', '⭐', 'rgba(190,67,48,0.12)',   'Featured cocktails & promos',    'e.g. The Valentina — raspberry, grapefruit...')
  ) AS t(display_order, key, label, icon, color, sub, placeholder)
),
food_defs AS (
  SELECT *
  FROM (VALUES
    (0, 'starters', '🥗 Starters', '🥗', 'rgba(140,200,120,0.18)', '', 'e.g. Chips & Salsa...'),
    (1, 'tacos',    '🌮 Tacos',    '🌮', 'rgba(245,210,66,0.22)',  '', 'e.g. Al Pastor...'),
    (2, 'entrees',  '🍽 Entrees',  '🍽', 'rgba(18,133,120,0.15)',  '', 'e.g. Enchiladas...'),
    (3, 'sides',    '🫘 Sides',    '🫘', 'rgba(100,180,255,0.18)', '', 'e.g. Mexican Rice...'),
    (4, 'desserts', '🍮 Desserts', '🍮', 'rgba(190,67,48,0.12)',   '', 'e.g. Flan...')
  ) AS t(display_order, key, label, icon, color, sub, placeholder)
)
INSERT INTO public.categories (menu_id, key, label, icon, color, sub, placeholder, display_order)
SELECT
  '00000000-0000-0000-0000-000000000002'::uuid,
  defs.key,
  defs.label,
  defs.icon,
  defs.color,
  defs.sub,
  defs.placeholder,
  defs.display_order
FROM drink_defs defs
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE menu_id = '00000000-0000-0000-0000-000000000002'
)
UNION ALL
SELECT
  '00000000-0000-0000-0000-000000000003'::uuid,
  defs.key,
  defs.label,
  defs.icon,
  defs.color,
  defs.sub,
  defs.placeholder,
  defs.display_order
FROM food_defs defs
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE menu_id = '00000000-0000-0000-0000-000000000003'
)
UNION ALL
SELECT
  '00000000-0000-0000-0000-000000000020'::uuid,
  defs.key,
  defs.label,
  defs.icon,
  defs.color,
  defs.sub,
  defs.placeholder,
  defs.display_order
FROM drink_defs defs
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE menu_id = '00000000-0000-0000-0000-000000000020'
)
UNION ALL
SELECT
  '00000000-0000-0000-0000-000000000021'::uuid,
  defs.key,
  defs.label,
  defs.icon,
  defs.color,
  defs.sub,
  defs.placeholder,
  defs.display_order
FROM food_defs defs
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE menu_id = '00000000-0000-0000-0000-000000000021'
);

-- 5. Keep restaurant-level custom design enabled by default.
UPDATE public.restaurants
SET use_custom_design = true
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010'
);

-- 6. Remove the obsolete menu-level custom-design flag.
ALTER TABLE public.menus
  DROP COLUMN IF EXISTS use_custom_design;
