-- Extra discovery sources (LinkedIn company pages and logistics news / PR sites via Google Search) and
-- longer Apify runs.

-- Company names found on LinkedIn / in the news, waiting to be resolved through Google Maps.
-- term_key = normalised Maps search string, used to link the resolved place back to its source.
create table public.web_leads (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.search_runs (id) on delete cascade,
  source text not null check (source in ('linkedin', 'news')),
  name text not null,
  name_norm text not null,
  city text not null default '',
  term text not null,
  term_key text not null,
  url text not null default '',
  title text not null default '',
  snippet text not null default '',
  query text not null default '',
  company_id uuid references public.companies (id) on delete set null,
  state text not null default 'pending' check (state in ('pending', 'resolved', 'not-found')),
  created_at timestamptz not null default now(),
  unique (run_id, name_norm)
);
create index web_leads_term_idx on public.web_leads (run_id, term_key);

alter table public.web_leads enable row level security;
create policy web_leads_read on public.web_leads for select to authenticated using (public.can_read());

-- Discovery counters per source on the run page
alter table public.search_runs add column if not exists web_found integer not null default 0;
alter table public.search_runs add column if not exists web_resolved integer not null default 0;

-- Longer Apify runs: a run is closed as failed only after 90 minutes without any sign of life
-- (n8n calls /api/n8n/budget before every actor, which also counts as a sign of life).
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
      error = coalesce(error, 'Geen callback van n8n binnen 90 minuten'),
      finished_at = now()
  where status in ('queued', 'discovering', 'enriching', 'qualifying')
    and coalesce(last_callback_at, started_at) < now() - interval '90 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.expire_stale_runs() from public, anon, authenticated;

-- month_spend was missing from the revoke list of 20261002120200 (audit finding)
revoke execute on function public.month_spend(uuid, text) from public, anon, authenticated;
