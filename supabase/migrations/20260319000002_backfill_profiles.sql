insert into public.profiles (id, email, role)
select id, email, 'none'
from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;
