import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { todayIso } from '@/lib/format';

export const COMPANY_CARD_COLUMNS =
  'id, name, kans, fit_score, criteria, score_reasons, risks, waarom, aanpak, qualified_at, qualified_mode, segment, address, postcode, city, province, phone, website, maps_url, reviews, rating, distance_km, familie, categories, source, place_id';

export async function queueItems(kans: string[]) {
  const supabase = await createClient();
  const today = todayIso();
  let query = supabase
    .from('review_queue')
    .select(`id, state, snooze_until, created_at, profile_id, companies!inner(${COMPANY_CARD_COLUMNS})`)
    .or(`state.eq.new,and(state.eq.snoozed,snooze_until.lte.${today})`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (kans.length) query = query.in('companies.kans', kans);
  const { data } = await query;
  const items = (data ?? []).map((row) => ({ ...row, company: row.companies as unknown as Record<string, unknown> & { id: string; kans: string | null; fit_score: number | null } }));
  // Best first: kans, then score
  items.sort((a, b) => (a.company.kans ?? 'Z').localeCompare(b.company.kans ?? 'Z') || (b.company.fit_score ?? 0) - (a.company.fit_score ?? 0));
  const ids = items.map((i) => i.company.id);
  const [signals, contacts] = await Promise.all([
    ids.length ? supabase.from('company_signals').select('company_id, type, text, url').in('company_id', ids).then((r) => r.data ?? []) : Promise.resolve([]),
    ids.length
      ? supabase.from('contacts').select('id, company_id, name, role, email, phone, source_url, linkedin_search_url, is_primary').in('company_id', ids).order('rank').then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);
  return items.map((item) => ({
    ...item,
    signals: signals.filter((s) => s.company_id === item.company.id),
    contacts: contacts.filter((c) => c.company_id === item.company.id),
  }));
}

export async function listProfiles() {
  const supabase = await createClient();
  const { data } = await supabase.from('search_profiles').select('*').order('created_at');
  const { data: spend } = await supabase.from('usage_log').select('profile_id, cost_usd, provider').gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
  return (data ?? []).map((p) => ({
    ...p,
    monthSpend: (spend ?? []).filter((s) => s.profile_id === p.id && s.provider === 'apify').reduce((sum, s) => sum + Number(s.cost_usd), 0),
  }));
}

export async function listRuns(limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('search_runs')
    .select('id, profile_id, profile_name, trigger, status, found, new_count, prefiltered, enriched, qualified, queued_count, apify_cost, ai_cost, error, started_at, finished_at, budget_usd')
    .order('started_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function listCompanies(q: string, state: string, page: number) {
  const supabase = await createClient();
  let query = supabase
    .from('companies')
    .select('id, name, kans, fit_score, rule_score, segment, city, province, reviews, state, last_seen, website, phone, address, distance_km, maps_url', { count: 'exact' });
  if (state) query = query.eq('state', state);
  if (q) {
    const v = `%${q.replace(/[%_\\,()"]/g, ' ')}%`;
    query = query.or(`name.ilike.${v},city.ilike.${v},domain.ilike.${v}`);
  }
  const from = (page - 1) * 50;
  const { data, count } = await query
    .order('kans', { ascending: true, nullsFirst: false })
    .order('fit_score', { ascending: false, nullsFirst: false })
    .order('reviews', { ascending: false })
    .range(from, from + 49);
  return { companies: data ?? [], count: count ?? 0 };
}

export async function usageThisMonth() {
  const supabase = await createClient();
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase.from('usage_log').select('provider, agent, cost_usd, profile_id').gte('created_at', start).limit(20000),
    supabase.from('search_profiles').select('id, name, budget_month'),
  ]);
  const byProvider = { apify: 0, claude: 0 };
  const byAgent: Record<string, number> = {};
  const byProfile: Record<string, { name: string; apify: number; claude: number; budget: number }> = {};
  for (const r of rows ?? []) {
    const cost = Number(r.cost_usd);
    byProvider[r.provider as 'apify' | 'claude'] += cost;
    const agentKey = `${r.provider}:${r.agent ?? '–'}`;
    byAgent[agentKey] = (byAgent[agentKey] ?? 0) + cost;
    const p = profiles?.find((x) => x.id === r.profile_id);
    const key = p?.name ?? '–';
    byProfile[key] ??= { name: key, apify: 0, claude: 0, budget: Number(p?.budget_month ?? 0) };
    byProfile[key][r.provider as 'apify' | 'claude'] += cost;
  }
  return { byProvider, byAgent, byProfile: Object.values(byProfile) };
}
