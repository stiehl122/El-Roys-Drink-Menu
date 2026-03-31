-- v0.7.4: Explicit grants for featured tables used by the PostgREST client.
-- Some environments rely on default privileges for new tables; make the
-- featured schema readable/writable by the expected client roles explicitly.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON TABLE
  public.featured_groups,
  public.menu_featured_groups,
  public.featured_slots
TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.featured_groups,
  public.menu_featured_groups,
  public.featured_slots
TO authenticated;
