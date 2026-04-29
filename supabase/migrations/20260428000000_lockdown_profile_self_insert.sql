drop policy if exists "Users can insert own profile" on profiles;

create policy "Users can insert own profile"
  on profiles for insert
  with check (
    auth.uid() = id
    and role = 'none'
  );
