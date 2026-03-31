-- ============================================================
-- v0.7.1 — Seed El Roy's restaurant + menu + menu_meta
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING.
-- ============================================================

-- ─── El Roy's restaurant ──────────────────────────────────────
INSERT INTO public.restaurants (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'El Roy''s',
  'el-roys'
)
ON CONFLICT (slug) DO NOTHING;

-- ─── El Roy's drinks menu ─────────────────────────────────────
INSERT INTO public.menus (id, restaurant_id, name, slug, type)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'El Roy''s Drinks',
  'el-roys',
  'drinks'
)
ON CONFLICT (restaurant_id, slug) DO NOTHING;

-- ─── menu_meta row ────────────────────────────────────────────
-- bot_id intentionally left blank; set via Admin tab after deploy.
INSERT INTO public.menu_meta (menu_id, bot_id)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  ''
)
ON CONFLICT (menu_id) DO NOTHING;

-- ─── menu_access ──────────────────────────────────────────────
-- Admins have implicit access to all menus via has_menu_access() and
-- do not need rows here. Manager accounts must be granted per-menu
-- access via the Admin → Users tab after deploy.
--
-- To grant a manager access manually:
--   INSERT INTO public.menu_access (user_id, menu_id)
--   VALUES ('<manager-uuid>', '00000000-0000-0000-0000-000000000002');
