create table profiles (
  id   uuid references auth.users on delete cascade primary key,
  email text not null,
  role  text not null default 'none'
);

alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Admins can read all profiles"
  on profiles for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can update all roles"
  on profiles for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
