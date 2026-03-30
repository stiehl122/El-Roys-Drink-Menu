-- v0.7.2: Add optional price field to items
-- Nullable text — allows "$5.99", "Market Price", "12". Never required.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS price text;
