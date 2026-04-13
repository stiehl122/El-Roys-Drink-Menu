-- v0.8.10 — Shared landing-page draft/live persistence for the root homepage

CREATE TABLE IF NOT EXISTS public.landing_page_state (
  id                text        NOT NULL PRIMARY KEY,
  draft_content     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  live_content      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  draft_saved_ts    bigint,
  live_published_ts bigint,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS landing_page_state_set_updated_at ON public.landing_page_state;
CREATE TRIGGER landing_page_state_set_updated_at
  BEFORE UPDATE ON public.landing_page_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.landing_page_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_page_state_select_all" ON public.landing_page_state
  FOR SELECT USING (true);

CREATE POLICY "landing_page_state_write_admin" ON public.landing_page_state
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.landing_page_state (id)
VALUES ('root')
ON CONFLICT (id) DO NOTHING;
