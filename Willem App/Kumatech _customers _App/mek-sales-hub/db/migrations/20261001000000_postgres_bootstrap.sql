-- Plain PostgreSQL bootstrap: provides what the Supabase platform used to provide, so the migrations
-- after this one run unchanged on any PostgreSQL 15+ server.
--
--   anon / authenticated / service_role   the database roles PostgREST switches to per request
--   authenticator                         the login role PostgREST connects with (password set by scripts/db.mjs)
--   auth.users                            accounts (bcrypt password hashes via pgcrypto)
--   auth.uid()                            id of the logged-in user, read from the JWT PostgREST verified
--
-- Row Level Security works exactly as before: the app signs a JWT with role "authenticated" and sub = user id
-- for user requests, and role "service_role" (bypasses RLS) for system work.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end;
$$;

grant anon, authenticated, service_role to authenticator;

-- Same model as Supabase: logged-in users get table privileges and RLS policies decide which rows.
-- anon gets nothing. Functions are not executable by PUBLIC by default.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on auth.users from public, anon, authenticated;

-- PostgREST puts the verified JWT claims in request.jwt.claims (empty outside a request)
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
