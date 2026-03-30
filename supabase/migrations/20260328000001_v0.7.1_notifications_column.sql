-- ============================================================
-- v0.7.1 — Add notifications JSONB column to menu_meta
-- Migrates existing bot_id into notifications.groupme.bot_id.
-- Safe to re-run: uses IF NOT EXISTS / DO NOTHING patterns.
-- ============================================================

-- Add the column (no-op if it already exists)
ALTER TABLE public.menu_meta
  ADD COLUMN IF NOT EXISTS notifications jsonb NOT NULL DEFAULT '{}';

-- Migrate any existing bot_id values into the notifications structure.
-- Only updates rows where notifications hasn't been set yet (empty object).
UPDATE public.menu_meta
SET notifications = jsonb_build_object(
  'groupme', jsonb_build_object('enabled', (bot_id <> ''), 'bot_id', bot_id),
  'sms',     jsonb_build_object('enabled', false, 'numbers', '[]'::jsonb),
  'discord', jsonb_build_object('enabled', false, 'webhook_url', ''),
  'webhook', jsonb_build_object('enabled', false, 'url', '', 'secret', '')
)
WHERE notifications = '{}'::jsonb;
