-- v0.8.5 — track featured lineup at last send so featured diffs stay accurate

ALTER TABLE public.menu_meta
  ADD COLUMN IF NOT EXISTS last_sent_featured jsonb NOT NULL DEFAULT '[]';
