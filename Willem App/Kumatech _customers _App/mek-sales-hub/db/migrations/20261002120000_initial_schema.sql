-- MEK Sales Hub: initial schema (spec B.9).
-- All tables have Row Level Security. Roles: admin, sales, viewer (table profiles).
-- System work (n8n callbacks, agents, scheduler) uses the service role, which bypasses RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Users and roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'sales' check (role in ('admin', 'sales', 'viewer')),
  created_at timestamptz not null default now()
);

-- The first user becomes admin, everyone after that starts as sales (an admin can change it).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    case
      when is_first then 'admin'
      when new.raw_user_meta_data ->> 'role' in ('admin', 'sales', 'viewer') then new.raw_user_meta_data ->> 'role'
      else 'sales'
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role of the calling user (null when not logged in). security definer: avoids RLS recursion on profiles.
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.can_read()
returns boolean language sql stable as $$ select public.app_role() in ('admin', 'sales', 'viewer') $$;

create or replace function public.can_write()
returns boolean language sql stable as $$ select public.app_role() in ('admin', 'sales') $$;

create or replace function public.is_admin()
returns boolean language sql stable as $$ select public.app_role() = 'admin' $$;

-- ---------------------------------------------------------------------------
-- Settings: product constants, kans thresholds, scoring weights, global caps
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Prospecting: search profiles, runs, raw output
-- ---------------------------------------------------------------------------
create table public.search_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{"mode":"off"}'::jsonb,
  budget_run numeric(10, 2) not null default 2,
  budget_month numeric(10, 2) not null default 50,
  max_companies integer not null default 200 check (max_companies between 1 and 2000),
  coverage_cursor integer not null default 0,
  coverage_round integer not null default 0,
  active boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.search_profiles (id) on delete set null,
  profile_name text not null default '',
  trigger text not null default 'manual' check (trigger in ('manual', 'scheduled', 'demo')),
  status text not null default 'queued'
    check (status in ('queued', 'discovering', 'enriching', 'qualifying', 'done', 'failed', 'budget_reached')),
  plan jsonb not null default '[]'::jsonb,
  options jsonb not null default '{}'::jsonb,
  budget_usd numeric(10, 2) not null default 2,
  found integer not null default 0,
  new_count integer not null default 0,
  prefiltered integer not null default 0,
  enriched integer not null default 0,
  qualified integer not null default 0,
  queued_count integer not null default 0,
  apify_cost numeric(12, 4) not null default 0,
  ai_cost numeric(12, 4) not null default 0,
  pending_enrich integer not null default 0,
  discovery_done boolean not null default false,
  budget_hit boolean not null default false,
  dropped jsonb not null default '{}'::jsonb,
  error text,
  n8n_execution_id text,
  created_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  last_callback_at timestamptz,
  finished_at timestamptz
);
create index search_runs_profile_idx on public.search_runs (profile_id, started_at desc);
create index search_runs_status_idx on public.search_runs (status);

-- Every batch n8n posts back; (run_id, batch_id) makes retried batches idempotent.
create table public.run_batches (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.search_runs (id) on delete cascade,
  batch_id text not null,
  kind text not null,
  item_count integer not null default 0,
  cost_usd numeric(12, 4) not null default 0,
  error text,
  received_at timestamptz not null default now(),
  unique (run_id, batch_id)
);

-- Raw scraper output, kept 30 days for debugging (see purge_old_data()).
create table public.raw_places (
  id bigint generated always as identity primary key,
  run_id uuid references public.search_runs (id) on delete cascade,
  place_id text,
  kind text not null default 'places',
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index raw_places_created_idx on public.raw_places (created_at);

-- ---------------------------------------------------------------------------
-- Companies (one row per real company) and everything found about them
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  place_id text,
  domain text,
  kvk_nummer text,
  name_key text,
  name text not null,
  address text not null default '',
  postcode text not null default '',
  city text not null default '',
  gemeente text not null default '',
  province text not null default '',
  lat double precision,
  lng double precision,
  phone text not null default '',
  website text not null default '',
  maps_url text not null default '',
  categories text[] not null default '{}',
  segment text not null default 'Overig',
  reviews integer not null default 0,
  rating numeric(3, 2),
  familie text not null default 'onbekend' check (familie in ('ja', 'groot', 'nee', 'onbekend')),
  distance_km numeric(8, 2),
  rule_score integer not null default 0,
  fit_score integer,
  kans text check (kans in ('A', 'B', 'C')),
  score_reasons jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  criteria jsonb not null default '{}'::jsonb,
  waarom text not null default '',
  aanpak text not null default '',
  website_text text not null default '',
  enrichment jsonb not null default '{}'::jsonb,
  kvk jsonb,
  description text not null default '',
  state text not null default 'seen' check (state in ('seen', 'queued', 'lead', 'rejected', 'excluded')),
  closed boolean not null default false,
  source text not null default 'google-maps',
  last_run_id uuid references public.search_runs (id) on delete set null,
  enriched_at timestamptz,
  qualified_at timestamptz,
  qualified_mode text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Unique keys used for deduplication (place id → domain → KvK → normalised name + postcode).
create unique index companies_place_id_key on public.companies (place_id) where place_id is not null;
create unique index companies_domain_key on public.companies (domain) where domain is not null;
create unique index companies_kvk_key on public.companies (kvk_nummer) where kvk_nummer is not null;
create unique index companies_name_key on public.companies (name_key) where name_key is not null;
create index companies_state_idx on public.companies (state);
create index companies_province_idx on public.companies (province);

create table public.company_signals (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null,
  text text not null,
  url text not null default '',
  found_at timestamptz not null default now(),
  unique (company_id, type, text)
);

create table public.evaluations (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  run_id uuid references public.search_runs (id) on delete set null,
  agent text not null,
  model text not null,
  prompt_version text not null,
  input_hash text not null,
  fit_score integer,
  kans text,
  output jsonb not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index evaluations_company_idx on public.evaluations (company_id, created_at desc);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null default '',
  role text not null default '',
  email text not null default '',
  phone text not null default '',
  source_url text not null default '',
  linkedin_search_url text not null default '',
  is_primary boolean not null default false,
  rank integer not null default 99,
  created_at timestamptz not null default now(),
  unique (company_id, email, name)
);

-- ---------------------------------------------------------------------------
-- Review queue
-- ---------------------------------------------------------------------------
create table public.review_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  profile_id uuid references public.search_profiles (id) on delete set null,
  run_id uuid references public.search_runs (id) on delete set null,
  state text not null default 'new' check (state in ('new', 'approved', 'rejected', 'snoozed')),
  reason text not null default '',
  snooze_until date,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index review_queue_state_idx on public.review_queue (state, created_at desc);

-- ---------------------------------------------------------------------------
-- Pipeline: leads, activities, quotes
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  company_id uuid references public.companies (id) on delete set null,
  bedrijf text not null check (length(trim(bedrijf)) > 0),
  kans text check (kans in ('A', 'B', 'C')),
  status text not null default 'prospect'
    check (status in ('prospect', 'benaderd', 'interesse', 'offerte', 'gewonnen', 'verloren')),
  -- Pipeline order for sorting (A.1)
  status_rank smallint generated always as (
    case status when 'prospect' then 0 when 'benaderd' then 1 when 'interesse' then 2
                when 'offerte' then 3 when 'gewonnen' then 4 else 5 end) stored,
  segment text not null default '',
  familie text not null default '' check (familie in ('', 'ja', 'groot', 'nee')),
  adres text not null default '',
  postcode text not null default '',
  plaats text not null default '',
  provincie text not null default '',
  lat double precision,
  lng double precision,
  contact text not null default '',
  functie text not null default '',
  tel text not null default '',
  email text not null default '',
  web text not null default '',
  maps text not null default '',
  datum date,
  volgende text not null default '',
  due_date date,
  aantal integer not null default 0 check (aantal >= 0),
  waarde numeric(12, 2) not null default 0 check (waarde >= 0),
  reden text not null default '',
  waarom text not null default '',
  aanpak text not null default '',
  notitie text not null default '',
  fit_score integer,
  hall jsonb,
  owner uuid references public.profiles (id) on delete set null,
  version integer not null default 1,
  name_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leads_name_key on public.leads (name_key) where name_key is not null;
create unique index leads_company_key on public.leads (company_id) where company_id is not null;
create index leads_status_idx on public.leads (status);
create index leads_provincie_idx on public.leads (provincie);

-- Optimistic locking: every update bumps version; the app only updates "where version = <seen>".
create or replace function public.bump_lead_version()
returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger leads_bump_version before update on public.leads
  for each row execute function public.bump_lead_version();

create table public.activities (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  type text not null check (type in ('note', 'call', 'mail', 'meeting', 'status', 'quote', 'created', 'import', 'edit', 'agent')),
  text text not null,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index activities_lead_idx on public.activities (lead_id, created_at desc);

create sequence public.quote_number_seq start 1;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete set null,
  number text not null unique,
  model text not null check (model in ('koop', 'lease', 'aas', 'alle')),
  trucks integer not null default 1,
  inputs jsonb not null,
  results jsonb not null,
  customer jsonb not null default '{}'::jsonb,
  total_excl numeric(12, 2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Quote numbers from a database sequence: MEK-2026-0001
create or replace function public.next_quote_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'MEK-' || to_char(now() at time zone 'Europe/Amsterdam', 'YYYY') || '-' ||
         lpad(nextval('public.quote_number_seq')::text, 4, '0');
$$;

-- ---------------------------------------------------------------------------
-- Spend and outreach
-- ---------------------------------------------------------------------------
create table public.usage_log (
  id bigint generated always as identity primary key,
  run_id uuid references public.search_runs (id) on delete set null,
  profile_id uuid references public.search_profiles (id) on delete set null,
  provider text not null check (provider in ('apify', 'claude')),
  agent text,
  units numeric(14, 2) not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index usage_log_created_idx on public.usage_log (created_at);
create index usage_log_profile_idx on public.usage_log (profile_id, created_at);

create table public.do_not_contact (
  id bigint generated always as identity primary key,
  value text not null unique,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  to_email text not null default '',
  subject text not null,
  body text not null,
  mode text not null default 'regels',
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'failed')),
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Maintenance: retention rules from B.12
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_deleted integer;
  contacts_deleted integer;
begin
  delete from public.raw_places where created_at < now() - interval '30 days';
  get diagnostics raw_deleted = row_count;

  delete from public.contacts c
  using public.companies co
  where c.company_id = co.id
    and co.state <> 'lead'
    and c.created_at < now() - interval '12 months';
  get diagnostics contacts_deleted = row_count;

  return jsonb_build_object('raw_places', raw_deleted, 'contacts', contacts_deleted);
end;
$$;

-- Runs with no callback for 30 minutes are closed as failed.
create or replace function public.expire_stale_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.search_runs
  set status = 'failed',
      error = coalesce(error, 'Geen callback van n8n binnen 30 minuten'),
      finished_at = now()
  where status in ('queued', 'discovering', 'enriching', 'qualifying')
    and coalesce(last_callback_at, started_at) < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.search_profiles enable row level security;
alter table public.search_runs enable row level security;
alter table public.run_batches enable row level security;
alter table public.raw_places enable row level security;
alter table public.companies enable row level security;
alter table public.company_signals enable row level security;
alter table public.evaluations enable row level security;
alter table public.contacts enable row level security;
alter table public.review_queue enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;
alter table public.quotes enable row level security;
alter table public.usage_log enable row level security;
alter table public.do_not_contact enable row level security;
alter table public.outreach_drafts enable row level security;

-- profiles: everyone logged in sees the team; users edit their own name; admins manage roles
create policy profiles_read on public.profiles for select to authenticated using (public.can_read());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.app_role());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- settings: read for all roles, write for admins
create policy settings_read on public.settings for select to authenticated using (public.can_read());
create policy settings_admin_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Read for every role, write for admin + sales
do $$
declare
  t text;
begin
  foreach t in array array[
    'search_profiles', 'search_runs', 'companies', 'company_signals', 'contacts',
    'review_queue', 'leads', 'activities', 'quotes', 'outreach_drafts', 'evaluations', 'run_batches'
  ]
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write()) with check (public.can_write())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_write())', t || '_delete', t);
  end loop;
end;
$$;

-- Spend, raw output and the do-not-contact list: read for admin + sales, write only by the system or admins
create policy usage_log_read on public.usage_log for select to authenticated using (public.can_write());
create policy raw_places_read on public.raw_places for select to authenticated using (public.can_write());
create policy dnc_read on public.do_not_contact for select to authenticated using (public.can_write());
create policy dnc_write on public.do_not_contact for all to authenticated using (public.can_write()) with check (public.can_write());

grant usage on sequence public.quote_number_seq to authenticated;
revoke execute on function public.purge_old_data() from public, anon, authenticated;
revoke execute on function public.expire_stale_runs() from public, anon, authenticated;
