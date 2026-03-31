-- v0.7.3: Store per-restaurant notification credential key mappings
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS notifications_config jsonb NOT NULL DEFAULT '{}';
