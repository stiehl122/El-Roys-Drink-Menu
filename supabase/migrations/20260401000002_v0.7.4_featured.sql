-- v0.7.4: Featured items — groups, slots, and cross-menu sharing

-- A named collection of featured slots (e.g. "Happy Hour Picks")
CREATE TABLE IF NOT EXISTS public.featured_groups (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Many-to-many: which menus use which featured groups
CREATE TABLE IF NOT EXISTS public.menu_featured_groups (
  menu_id           uuid    NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  featured_group_id uuid    NOT NULL REFERENCES public.featured_groups(id) ON DELETE CASCADE,
  display_order     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (menu_id, featured_group_id)
);

-- Individual featured item slots within a group
CREATE TABLE IF NOT EXISTS public.featured_slots (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  featured_group_id uuid        NOT NULL REFERENCES public.featured_groups(id) ON DELETE CASCADE,
  item_id           uuid        NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  sell_note         text        NOT NULL DEFAULT '',
  display_order     integer     NOT NULL DEFAULT 0,
  confirmed_at      timestamptz,
  confirmed_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (featured_group_id, item_id)
);

-- Helper: does the caller have access to any menu linked to this featured group?
CREATE OR REPLACE FUNCTION public.has_featured_group_access(p_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.is_admin()
      OR EXISTS (
           SELECT 1 FROM public.menu_featured_groups mfg
           JOIN public.menu_access ma ON ma.menu_id = mfg.menu_id
           WHERE mfg.featured_group_id = p_group_id
             AND ma.user_id = auth.uid()
         );
$$;

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE public.featured_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_featured_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_slots        ENABLE ROW LEVEL SECURITY;

-- featured_groups: public read (names are not sensitive), admin write
CREATE POLICY "featured_groups_select_all" ON public.featured_groups
  FOR SELECT USING (true);
CREATE POLICY "featured_groups_write_admin" ON public.featured_groups
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- menu_featured_groups: public read (needed to resolve featured items), admin write
CREATE POLICY "menu_featured_groups_select_all" ON public.menu_featured_groups
  FOR SELECT USING (true);
CREATE POLICY "menu_featured_groups_write_admin" ON public.menu_featured_groups
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- featured_slots: public read (items appear on public menu), write for users with group access
CREATE POLICY "featured_slots_select_all" ON public.featured_slots
  FOR SELECT USING (true);
CREATE POLICY "featured_slots_write_access" ON public.featured_slots
  FOR ALL
  USING (public.has_featured_group_access(featured_group_id))
  WITH CHECK (public.has_featured_group_access(featured_group_id));
