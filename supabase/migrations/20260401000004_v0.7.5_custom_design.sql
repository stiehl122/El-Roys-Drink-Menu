-- v0.7.5: Custom Design Support
-- Adds per-menu use_custom_design flag and menu-designs storage bucket.

-- 1. Add use_custom_design column to menus table
ALTER TABLE public.menus
  ADD COLUMN IF NOT EXISTS use_custom_design boolean NOT NULL DEFAULT false;

-- 2. Create menu-designs storage bucket (public read)
-- NOTE: If this errors due to storage schema permissions, create the bucket
-- manually in the Supabase Dashboard (Storage → New bucket, name: "menu-designs", public: true).
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-designs', 'menu-designs', true)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies for menu-designs bucket

-- Public read (anyone can fetch design files)
CREATE POLICY "menu_designs_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-designs');

-- Admin-only insert
CREATE POLICY "menu_designs_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'menu-designs' AND public.is_admin());

-- Admin-only update
CREATE POLICY "menu_designs_admin_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'menu-designs' AND public.is_admin());

-- Admin-only delete
CREATE POLICY "menu_designs_admin_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'menu-designs' AND public.is_admin());
