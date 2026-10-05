-- Atomic counters for runs. n8n posts batches in parallel and the app processes them in the background,
-- so read-modify-write in TypeScript would lose updates. These functions do it in one statement.

create or replace function public.bump_run(p_run uuid, p_deltas jsonb)
returns public.search_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.search_runs;
begin
  -- Alias r: "found" is also a PL/pgSQL variable, so every column on the right-hand side is qualified
  update public.search_runs r set
    found          = r.found          + coalesce((p_deltas ->> 'found')::int, 0),
    new_count      = r.new_count      + coalesce((p_deltas ->> 'new')::int, 0),
    prefiltered    = r.prefiltered    + coalesce((p_deltas ->> 'prefiltered')::int, 0),
    enriched       = r.enriched       + coalesce((p_deltas ->> 'enriched')::int, 0),
    qualified      = r.qualified      + coalesce((p_deltas ->> 'qualified')::int, 0),
    queued_count   = r.queued_count   + coalesce((p_deltas ->> 'queued')::int, 0),
    pending_enrich = greatest(0, r.pending_enrich + coalesce((p_deltas ->> 'pendingEnrich')::int, 0)),
    apify_cost     = r.apify_cost     + coalesce((p_deltas ->> 'apifyCost')::numeric, 0),
    ai_cost        = r.ai_cost        + coalesce((p_deltas ->> 'aiCost')::numeric, 0),
    last_callback_at = case when p_deltas ? 'callback' then now() else r.last_callback_at end
  where r.id = p_run
  returning r.* into result;
  return result;
end;
$$;

-- Moves a run to a new status unless it already finished (done/failed/budget_reached are final).
create or replace function public.set_run_status(p_run uuid, p_status text, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.search_runs
  set status = p_status,
      error = coalesce(p_error, error),
      finished_at = case when p_status in ('done', 'failed', 'budget_reached') then now() else finished_at end
  where id = p_run
    and status not in ('done', 'failed', 'budget_reached');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Spend this calendar month (Europe/Amsterdam) for one profile, or for everything when p_profile is null.
create or replace function public.month_spend(p_profile uuid, p_provider text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)
  from public.usage_log
  where provider = p_provider
    and (p_profile is null or profile_id = p_profile)
    and created_at >= date_trunc('month', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam';
$$;

revoke execute on function public.bump_run(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.set_run_status(uuid, text, text) from public, anon, authenticated;
