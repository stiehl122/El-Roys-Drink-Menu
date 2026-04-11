-- v0.8.7 — Persist shared manager drafts separately from the live menu state

ALTER TABLE public.menu_meta
  ADD COLUMN IF NOT EXISTS draft_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS draft_saved_ts bigint;
