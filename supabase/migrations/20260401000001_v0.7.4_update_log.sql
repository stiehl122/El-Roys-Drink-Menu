-- v0.7.4: Audit log for Send Update events
-- Records who sent what changes and when.

CREATE TABLE IF NOT EXISTS public.update_log (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_id    uuid        NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name  text        NOT NULL DEFAULT '',
  diff       jsonb       NOT NULL DEFAULT '[]',
  message    text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.update_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users with menu access can read and insert
CREATE POLICY "update_log_select" ON public.update_log
  FOR SELECT USING (public.has_menu_access(menu_id));

CREATE POLICY "update_log_insert" ON public.update_log
  FOR INSERT WITH CHECK (public.has_menu_access(menu_id));
