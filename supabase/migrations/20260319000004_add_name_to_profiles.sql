alter table public.profiles add column if not exists name text not null default '';

-- Update trigger to read name from auth metadata
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), 'none')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;
