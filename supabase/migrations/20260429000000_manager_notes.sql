create table if not exists public.menu_manager_notes (
  menu_id uuid primary key references public.menus(id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

alter table public.menu_manager_notes enable row level security;

drop policy if exists "service role manages menu manager notes" on public.menu_manager_notes;
create policy "service role manages menu manager notes"
  on public.menu_manager_notes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists menu_manager_notes_updated_at_idx
  on public.menu_manager_notes(updated_at desc);
