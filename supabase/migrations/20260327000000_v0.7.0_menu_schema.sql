-- ============================================================
-- v0.7.0 — Multi-menu schema: restaurants, menus, categories,
--           items, menu_meta, menu_access
-- Order: tables first, then functions, then RLS policies
-- ============================================================

-- ─── TABLES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.restaurants (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menus (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  slug          text        NOT NULL,
  type          text        NOT NULL DEFAULT 'drinks',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, slug)
);

-- Presence of a row grants the manager write access to that menu.
-- Admins implicitly have access to all menus via has_menu_access().
CREATE TABLE IF NOT EXISTS public.menu_access (
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  menu_id    uuid        NOT NULL REFERENCES public.menus(id)    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, menu_id)
);

CREATE TABLE IF NOT EXISTS public.categories (
  id            uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_id       uuid    NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  key           text    NOT NULL,            -- e.g. 'beer', 'cocktails'
  label         text    NOT NULL,
  icon          text    NOT NULL DEFAULT '',
  color         text    NOT NULL DEFAULT '',
  placeholder   text    NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  UNIQUE (menu_id, key)
);

CREATE TABLE IF NOT EXISTS public.items (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id     uuid        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  "desc"          text        NOT NULL DEFAULT '',
  recipe          jsonb       NOT NULL DEFAULT '[]',
  is_eighty_sixed boolean     NOT NULL DEFAULT false,
  is_draft        boolean     NOT NULL DEFAULT false,
  on_menu         boolean     NOT NULL DEFAULT true,
  display_order   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per menu. Stores bot config, timestamps, and design.
-- last_sent_state: { catKey: [item snapshots] } — same shape as
--   menuState[catId].lastSent; used by computeDiff() unchanged.
-- last_sent_categories: [catKey, ...] — used by public view
--   to determine which sections were in the last GroupMe send.
CREATE TABLE IF NOT EXISTS public.menu_meta (
  menu_id              uuid    NOT NULL PRIMARY KEY REFERENCES public.menus(id) ON DELETE CASCADE,
  bot_id               text    NOT NULL DEFAULT '',
  last_updated_ts      bigint,                          -- ms since epoch
  last_sent_ts         bigint,                          -- ms since epoch
  last_sent_state      jsonb   NOT NULL DEFAULT '{}',  -- { catKey: [items] }
  last_sent_categories jsonb   NOT NULL DEFAULT '[]',  -- [catKey, ...]
  design               jsonb   NOT NULL DEFAULT '{}'
);

-- ─── HELPER FUNCTIONS ────────────────────────────────────────
-- SECURITY DEFINER so policies can read profiles/menu_access
-- without triggering their own RLS.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_menu_access(p_menu_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.is_admin()
      OR EXISTS (
           SELECT 1 FROM public.menu_access
           WHERE user_id = auth.uid() AND menu_id = p_menu_id
         );
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_set_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE public.restaurants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_access  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_meta    ENABLE ROW LEVEL SECURITY;

-- restaurants
CREATE POLICY "restaurants_select_all" ON public.restaurants
  FOR SELECT USING (true);
CREATE POLICY "restaurants_write_admin" ON public.restaurants
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- menus
CREATE POLICY "menus_select_all" ON public.menus
  FOR SELECT USING (true);
CREATE POLICY "menus_write_admin" ON public.menus
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- menu_access: admins see all rows; managers see their own
CREATE POLICY "menu_access_select" ON public.menu_access
  FOR SELECT USING (public.is_admin() OR user_id = auth.uid());
CREATE POLICY "menu_access_write_admin" ON public.menu_access
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- categories
CREATE POLICY "categories_select_all" ON public.categories
  FOR SELECT USING (true);
CREATE POLICY "categories_write_access" ON public.categories
  FOR ALL USING (public.has_menu_access(menu_id))
  WITH CHECK (public.has_menu_access(menu_id));

-- items: resolve category → menu for the access check
CREATE POLICY "items_select_all" ON public.items
  FOR SELECT USING (true);
CREATE POLICY "items_write_access" ON public.items
  FOR ALL
  USING (public.has_menu_access(
    (SELECT menu_id FROM public.categories WHERE id = category_id)
  ))
  WITH CHECK (public.has_menu_access(
    (SELECT menu_id FROM public.categories WHERE id = category_id)
  ));

-- menu_meta
CREATE POLICY "menu_meta_select_all" ON public.menu_meta
  FOR SELECT USING (true);
CREATE POLICY "menu_meta_write_access" ON public.menu_meta
  FOR ALL USING (public.has_menu_access(menu_id))
  WITH CHECK (public.has_menu_access(menu_id));
