create or replace function public.update_user_profile_and_menu_access(
  target_user_id uuid,
  target_full_name text,
  target_role text,
  target_menu_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_role text;
  normalized_menu_ids uuid[];
begin
  normalized_role := nullif(trim(coalesce(target_role, '')), '');

  if normalized_role is not null and normalized_role not in ('none', 'manager', 'admin') then
    raise exception 'Invalid role: %', normalized_role using errcode = '22023';
  end if;

  update public.profiles
  set
    name = case
      when target_full_name is null then name
      else trim(coalesce(target_full_name, ''))
    end,
    role = coalesce(normalized_role, role)
  where id = target_user_id;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  if target_menu_ids is not null then
    normalized_menu_ids := coalesce(target_menu_ids, array[]::uuid[]);

    delete from public.menu_access
    where user_id = target_user_id
      and not (menu_id = any(normalized_menu_ids));

    insert into public.menu_access (user_id, menu_id)
    select target_user_id, menu_id
    from unnest(normalized_menu_ids) as menu_id
    on conflict (user_id, menu_id) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'userId', target_user_id,
    'role', coalesce(normalized_role, (select role from public.profiles where id = target_user_id)),
    'menuIds', coalesce(target_menu_ids, array[]::uuid[])
  );
end;
$$;

revoke all on function public.update_user_profile_and_menu_access(uuid, text, text, uuid[]) from public;
grant execute on function public.update_user_profile_and_menu_access(uuid, text, text, uuid[]) to service_role;
