-- Accounts without Supabase Auth. Passwords are bcrypt hashes (pgcrypto) in auth.users; the trigger
-- on_auth_user_created (initial schema) still creates the profile and makes the first user admin.
-- Only the server may call these functions (service_role); they are not exposed to logged-in users.

create or replace function public.auth_create_user(p_email text, p_password text, p_meta jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_id uuid;
begin
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password should be at least 8 characters' using errcode = '22023';
  end if;
  insert into auth.users (email, encrypted_password, raw_user_meta_data)
  values (lower(trim(p_email)), crypt(p_password, gen_salt('bf', 10)), coalesce(p_meta, '{}'::jsonb))
  returning id into new_id;
  return new_id;
exception
  when unique_violation then
    raise exception 'A user with this email address has already been registered' using errcode = '23505';
end;
$$;

-- User id when e-mail and password match, otherwise null
create or replace function public.auth_verify_password(p_email text, p_password text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users
  where email = lower(trim(p_email))
    and encrypted_password = crypt(p_password, encrypted_password);
$$;

create or replace function public.auth_set_password(p_user uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n integer;
begin
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password should be at least 8 characters' using errcode = '22023';
  end if;
  update auth.users
  set encrypted_password = crypt(p_password, gen_salt('bf', 10)), updated_at = now()
  where id = p_user;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Deletes the account; the profile goes with it (on delete cascade)
create or replace function public.auth_delete_user(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n integer;
begin
  delete from auth.users where id = p_user;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function public.auth_create_user(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.auth_verify_password(text, text) from public, anon, authenticated;
revoke execute on function public.auth_set_password(uuid, text) from public, anon, authenticated;
revoke execute on function public.auth_delete_user(uuid) from public, anon, authenticated;
grant execute on function public.auth_create_user(text, text, jsonb) to service_role;
grant execute on function public.auth_verify_password(text, text) to service_role;
grant execute on function public.auth_set_password(uuid, text) to service_role;
grant execute on function public.auth_delete_user(uuid) to service_role;
