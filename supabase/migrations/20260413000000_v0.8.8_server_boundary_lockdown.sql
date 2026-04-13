-- v0.8.8: App-owned server boundary lockdown
--
-- IMPORTANT:
-- Apply this only after the server-owned API boundary is deployed on main.
-- It assumes manager/admin mutations now flow through Vercel API routes using
-- the service role, not direct browser-to-PostgREST writes.
--
-- Scope of this migration:
-- 1. Revoke direct authenticated/anon DML on menu-domain tables that should now
--    be mutated only by the app-owned API layer.
-- 2. Remove client-write RLS policies that previously allowed direct browser
--    writes for managers/admins with menu access.
-- 3. Tighten two leaky read surfaces:
--    - menu_meta: no longer publicly readable because it now contains drafts
--    - items: authenticated users no longer get blanket read access to all rows
--
-- Intentionally deferred:
-- - restaurants / menus / categories broad read lockdown
--   Those tables still have client-read consumers today. Once all reads are
--   server-owned, follow up with a stricter projection-based read model.

-- ─── DIRECT DML LOCKDOWN ─────────────────────────────────────────────────────

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.categories,
  public.items,
  public.menu_meta,
  public.restaurants,
  public.update_log,
  public.featured_groups,
  public.menu_featured_groups,
  public.featured_slots
FROM anon, authenticated;

-- ─── REMOVE CLIENT WRITE POLICIES ────────────────────────────────────────────

DROP POLICY IF EXISTS "categories_write_access"         ON public.categories;
DROP POLICY IF EXISTS "items_write_access"              ON public.items;
DROP POLICY IF EXISTS "menu_meta_write_access"          ON public.menu_meta;
DROP POLICY IF EXISTS "restaurants_write_admin"         ON public.restaurants;
DROP POLICY IF EXISTS "update_log_insert"               ON public.update_log;
DROP POLICY IF EXISTS "featured_groups_write_admin"     ON public.featured_groups;
DROP POLICY IF EXISTS "menu_featured_groups_write_admin" ON public.menu_featured_groups;
DROP POLICY IF EXISTS "featured_slots_write_access"     ON public.featured_slots;

-- ─── MENU META READ LOCKDOWN ────────────────────────────────────────────────
-- menu_meta now contains shared draft state and should no longer be public.

DROP POLICY IF EXISTS "menu_meta_select_all" ON public.menu_meta;

CREATE POLICY "menu_meta_select_staff" ON public.menu_meta
  FOR SELECT
  USING (public.has_menu_access(menu_id));

-- ─── ITEM READ LOCKDOWN ─────────────────────────────────────────────────────
-- Anonymous users still see public items.
-- Authenticated users only see all items when they have menu access.

DROP POLICY IF EXISTS "items_select_all" ON public.items;
DROP POLICY IF EXISTS "items_select_public" ON public.items;

CREATE POLICY "items_select_public_or_staff" ON public.items
  FOR SELECT
  USING (
    visibility = 'public'
    OR public.has_menu_access(
      (SELECT menu_id FROM public.categories WHERE id = category_id)
    )
  );

-- ─── AUDIT LOG READ-ONLY FROM CLIENTS ───────────────────────────────────────
-- Staff can still read history directly if needed, but insert is now API-only.
-- Preserve the existing read policy if already present.

DROP POLICY IF EXISTS "update_log_select" ON public.update_log;

CREATE POLICY "update_log_select" ON public.update_log
  FOR SELECT
  USING (public.has_menu_access(menu_id));

