import 'server-only';
import type { DbClient } from '@/lib/db';
import { createAdminClient } from '@/lib/db/admin';
import { env, features } from '@/lib/env';
import { callN8nWebhook } from '@/lib/n8n';
import { geocodePostcode, provinceFromPostcode, reverseGeocode } from '@/lib/geo';
import { mapsSearchUrl, normaliseName, truncate } from '@/lib/text';
import type { Segment } from '@/lib/constants';
import { loadSettings } from '@/modules/settings/load';
import type { AppSettings } from '@/modules/settings/types';
import { classifyPlaces, PROMPT_VERSIONS } from './agents';
import { hashInput } from '@/lib/ai/claude';
import { parseFilters, type SearchFilters } from './filters';
import { normalisePlace, prefilter, type DropReason, type NormalisedPlace, type PlaceItem } from './prefilter';
import { qualifyCompany, type EnrichmentData } from './qualify';
import { parseItems, type Envelope, type EnrichmentPayload, type WebPayload } from './schema';
import { resolveKey, resolveTerm, webCandidates, type WebQuery, type WebResult } from './web';

const FINAL = new Set(['done', 'failed', 'budget_reached']);
const ENRICH_CHUNK = 8;
const ENRICH_CHUNK_DEEP = 4;
// A local Ollama model handles one request at a time; Claude can do several in parallel
const QUALIFY_CONCURRENCY = env.aiProvider === 'ollama' ? 1 : 3;

export interface RunRow {
  id: string;
  profile_id: string | null;
  status: string;
  trigger: string;
  budget_usd: number;
  options: { maxCompanies?: number; origin?: { lat: number; lng: number } | null; maxDistanceKm?: number | null; provinces?: string[]; filters?: unknown; callbackUrl?: string; webQueries?: WebQuery[] };
  apify_cost: number;
  new_count: number;
  pending_enrich: number;
  discovery_done: boolean;
  budget_hit: boolean;
  dropped: Record<string, number>;
}

interface Ctx {
  admin: DbClient;
  run: RunRow;
  filters: SearchFilters;
  settings: AppSettings;
}

async function bump(admin: DbClient, runId: string, deltas: Record<string, number | boolean>): Promise<RunRow | null> {
  const { data, error } = await admin.rpc('bump_run', { p_run: runId, p_deltas: deltas });
  if (error) console.error('[ingest] bump_run failed', error.message);
  return (data as RunRow | null) ?? null;
}

export async function setStatus(admin: DbClient, runId: string, status: string, error?: string | null) {
  await admin.rpc('set_run_status', { p_run: runId, p_status: status, p_error: error ?? null });
}

// Called synchronously by the results route before it answers n8n (see prePending)
export async function markPending(runId: string) {
  await bump(createAdminClient(), runId, { pendingEnrich: 1 });
}

export async function failRun(runId: string, message: string) {
  await setStatus(createAdminClient(), runId, 'failed', truncate(message, 500));
}

// When discovery is finished and no enrichment/qualification is pending, the run is done (or "budget reached")
async function maybeFinish(admin: DbClient, run: RunRow | null) {
  if (!run || FINAL.has(run.status)) return;
  if (!run.discovery_done || run.pending_enrich > 0) return;
  await setStatus(admin, run.id, run.budget_hit ? 'budget_reached' : 'done');
  if (run.profile_id) await admin.from('search_profiles').update({ last_run_at: new Date().toISOString() }).eq('id', run.profile_id);
}

async function recordApifyCost(ctx: Ctx, batchId: string, usd: number) {
  if (usd <= 0) return;
  await ctx.admin.from('usage_log').insert({
    run_id: ctx.run.id,
    profile_id: ctx.run.profile_id,
    provider: 'apify',
    agent: batchId.split('-')[0],
    units: 1,
    cost_usd: usd,
  });
  const updated = await bump(ctx.admin, ctx.run.id, { apifyCost: usd });
  if (updated && Number(updated.apify_cost) >= Number(updated.budget_usd) && !updated.budget_hit) {
    await ctx.admin.from('search_runs').update({ budget_hit: true }).eq('id', ctx.run.id);
    ctx.run.budget_hit = true;
  }
}

// Province, municipality and coordinates from PDOK (replaces the approximate postcode table)
async function geoEnrich(place: NormalisedPlace): Promise<{ province: string; gemeente: string; lat: number | null; lng: number | null; postcode: string; city: string }> {
  let province = '';
  let gemeente = '';
  let { lat, lng } = place;
  let { postcode, city } = place;
  const byPc = postcode.replace(/\s/g, '').length === 6 ? await geocodePostcode(postcode) : null;
  if (byPc) {
    province = byPc.province;
    gemeente = byPc.gemeente;
    lat ??= byPc.lat;
    lng ??= byPc.lng;
    city ||= byPc.city;
  } else if (lat !== null && lng !== null) {
    const rev = await reverseGeocode({ lat, lng });
    if (rev) {
      province = rev.province;
      gemeente = rev.gemeente;
      postcode ||= rev.postcode ? `${rev.postcode.slice(0, 4)} ${rev.postcode.slice(4)}`.trim() : '';
      city ||= rev.city;
    }
  }
  if (!province && postcode) province = provinceFromPostcode(postcode);
  return { province, gemeente, lat, lng, postcode, city };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

interface ExistingCompany {
  id: string;
  place_id: string | null;
  domain: string | null;
  name_key: string | null;
  state: string;
  reviews: number;
  website: string;
  last_seen: string;
  qualified_at: string | null;
}

async function findExisting(admin: DbClient, places: NormalisedPlace[]): Promise<ExistingCompany[]> {
  const cols = 'id, place_id, domain, name_key, state, reviews, website, last_seen, qualified_at';
  const placeIds = [...new Set(places.map((p) => p.placeId).filter(Boolean))] as string[];
  const domains = [...new Set(places.map((p) => p.domain).filter(Boolean))] as string[];
  const keys = [...new Set(places.map((p) => p.nameKey).filter(Boolean))] as string[];
  const found: ExistingCompany[] = [];
  const chunks = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / 100) }, (_, i) => list.slice(i * 100, i * 100 + 100));
  for (const chunk of chunks(placeIds)) found.push(...((await admin.from('companies').select(cols).in('place_id', chunk)).data ?? []));
  for (const chunk of chunks(domains)) found.push(...((await admin.from('companies').select(cols).in('domain', chunk)).data ?? []));
  for (const chunk of chunks(keys)) found.push(...((await admin.from('companies').select(cols).in('name_key', chunk)).data ?? []));
  return found;
}

// Dedup order (B.7 step 3): place id → domain → normalised name + postcode. (KvK is matched at qualification.)
function matchExisting(place: NormalisedPlace, existing: ExistingCompany[]): ExistingCompany | undefined {
  return (
    (place.placeId ? existing.find((e) => e.place_id === place.placeId) : undefined) ??
    (place.domain ? existing.find((e) => e.domain === place.domain) : undefined) ??
    (place.nameKey ? existing.find((e) => e.name_key === place.nameKey) : undefined)
  );
}

function daysSince(iso: string | null): number {
  return iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : Infinity;
}

// Does a known company need a new verdict? (B.7 "Incremental runs")
function needsRequalify(existing: ExistingCompany, place: NormalisedPlace, settings: AppSettings): boolean {
  if (!existing.qualified_at) return true;
  const growth = existing.reviews > 0 ? ((place.reviews - existing.reviews) / existing.reviews) * 100 : place.reviews > 0 ? 100 : 0;
  if (growth > settings.requalify.reviewGrowthPct) return true;
  if (place.website && place.website !== existing.website) return true;
  return daysSince(existing.qualified_at) > settings.requalify.maxAgeDays;
}

function companyRow(place: NormalisedPlace, geo: Awaited<ReturnType<typeof geoEnrich>>, runId: string) {
  return {
    place_id: place.placeId,
    domain: place.domain,
    name_key: place.nameKey,
    name: place.name,
    address: place.address,
    postcode: geo.postcode,
    city: geo.city,
    gemeente: geo.gemeente,
    province: geo.province,
    lat: geo.lat,
    lng: geo.lng,
    phone: place.phone,
    website: place.website,
    maps_url: place.mapsUrl || mapsSearchUrl(place.name, `${geo.postcode} ${geo.city}`),
    categories: place.categories,
    segment: place.segment,
    reviews: place.reviews,
    rating: place.rating,
    distance_km: place.distanceKm,
    rule_score: place.ruleScore,
    description: place.description,
    closed: place.closed,
    last_run_id: runId,
    last_seen: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(place.emails.length ? { enrichment: { emails: place.emails } } : {}),
  };
}

// ---------------------------------------------------------------------------
// LinkedIn / news finds (web.ts) and their link to the Google Maps place they resolved to
// ---------------------------------------------------------------------------
interface WebLeadRow {
  id: number;
  source: 'linkedin' | 'news';
  name: string;
  name_norm: string;
  url: string;
  title: string;
  term_key: string;
}

async function webLeadsFor(admin: DbClient, runId: string, items: PlaceItem[]): Promise<Map<string, WebLeadRow>> {
  const keys = [...new Set(items.map((i) => resolveKey(i.searchTerm)).filter(Boolean))];
  if (!keys.length) return new Map();
  const { data } = await admin.from('web_leads').select('id, source, name, name_norm, url, title, term_key').eq('run_id', runId).in('term_key', keys.slice(0, 300));
  return new Map((data ?? []).map((r) => [r.term_key, r as WebLeadRow]));
}

// A Maps lookup "Bakker Logistiek Tilburg" can return another business: only link when the names share a word
function sameCompany(lead: WebLeadRow, placeName: string): boolean {
  const placeWords = new Set(normaliseName(placeName).split(' '));
  return lead.name_norm.split(' ').some((w) => w.length >= 3 && placeWords.has(w));
}

async function recountWeb(admin: DbClient, runId: string) {
  const [found, resolved] = await Promise.all([
    admin.from('web_leads').select('id', { count: 'exact', head: true }).eq('run_id', runId),
    admin.from('web_leads').select('id', { count: 'exact', head: true }).eq('run_id', runId).eq('state', 'resolved'),
  ]);
  await admin.from('search_runs').update({ web_found: found.count ?? 0, web_resolved: resolved.count ?? 0 }).eq('id', runId);
}

// The LinkedIn page or news article becomes a signal on the company (the Qualifier sees it as evidence)
async function linkWebLeads(admin: DbClient, runId: string, links: { companyId: string; lead: WebLeadRow }[]) {
  if (!links.length) return;
  for (const { companyId, lead } of links) {
    const text = lead.source === 'linkedin' ? `LinkedIn-bedrijfspagina: ${lead.title || lead.name}` : `In het nieuws: ${lead.title || lead.name}`;
    await admin
      .from('company_signals')
      .upsert({ company_id: companyId, type: lead.source, text: truncate(text, 300), url: lead.url }, { onConflict: 'company_id,type,text', ignoreDuplicates: true });
    if (lead.source === 'linkedin' && lead.url) {
      const { data } = await admin.from('companies').select('enrichment').eq('id', companyId).maybeSingle();
      const enrichment = (data?.enrichment ?? {}) as { linkedIns?: string[] };
      await admin
        .from('companies')
        .update({ enrichment: { ...enrichment, linkedIns: [...new Set([...(enrichment.linkedIns ?? []), lead.url])] } })
        .eq('id', companyId);
    }
    await admin.from('web_leads').update({ company_id: companyId, state: 'resolved' }).eq('id', lead.id);
  }
  await recountWeb(admin, runId);
}

// ---------------------------------------------------------------------------
// kind = places (discovery)
// ---------------------------------------------------------------------------
async function ingestPlaces(ctx: Ctx, items: PlaceItem[]): Promise<{ candidates: string[] }> {
  const { admin, run, filters, settings } = ctx;
  const origin = run.options.origin ?? null;
  const maxDistance = run.options.maxDistanceKm ?? null;
  const provinces = new Set(run.options.provinces ?? []);
  const dropped: Partial<Record<DropReason | 'province' | 'duplicate' | 'seen' | 'in-pipeline' | 'rejected' | 'not-logistics' | 'cap', number>> = {};
  const drop = (reason: keyof typeof dropped) => (dropped[reason] = (dropped[reason] ?? 0) + 1);

  // Normalise + cheap prefilter + dedup within the batch
  const seenInBatch = new Set<string>();
  const passed: NormalisedPlace[] = [];
  for (const item of items) {
    const place = normalisePlace(item, origin);
    const reason = prefilter(place, filters, maxDistance);
    if (reason) {
      drop(reason);
      continue;
    }
    const key = place.placeId ?? place.domain ?? place.nameKey ?? place.name;
    if (seenInBatch.has(key)) {
      drop('duplicate');
      continue;
    }
    seenInBatch.add(key);
    passed.push(place);
  }

  const existing = await findExisting(admin, passed);
  const webLeads = await webLeadsFor(admin, run.id, items);
  const leadFor = (place: NormalisedPlace) => {
    const lead = webLeads.get(resolveKey(place.searchTerm));
    return lead && sameCompany(lead, place.name) ? lead : null;
  };
  const links: { companyId: string; lead: WebLeadRow }[] = [];
  const candidates: string[] = [];
  let newCount = 0;
  const maxCompanies = run.options.maxCompanies ?? 200;
  let budgetLeft = Math.max(0, maxCompanies - run.new_count);
  const overig: { id: string; place: NormalisedPlace }[] = [];

  await mapLimit(passed, 6, async (place) => {
    const match = matchExisting(place, existing);
    const geo = await geoEnrich(place);
    if (provinces.size && geo.province && !provinces.has(geo.province)) {
      drop('province');
      return;
    }

    if (match) {
      // Refresh what the listing says now; keep the verdict unless something changed
      const row = companyRow(place, geo, run.id);
      const { place_id, domain, name_key, ...rest } = row;
      const update: Record<string, unknown> = { ...rest };
      if (!match.place_id && place_id) update.place_id = place_id;
      if (!match.domain && domain) update.domain = domain;
      if (!match.name_key && name_key) update.name_key = name_key;
      delete update.segment; // keep the agent's segment
      const lead = leadFor(place);
      if (lead) links.push({ companyId: match.id, lead });
      const { error } = await admin.from('companies').update(update).eq('id', match.id);
      if (error?.code === '23505') {
        delete update.place_id;
        delete update.domain;
        delete update.name_key;
        await admin.from('companies').update(update).eq('id', match.id);
      }
      if (match.state === 'lead' && filters.skipInPipeline) return void drop('in-pipeline');
      if (match.state === 'rejected' && filters.skipRejected) return void drop('rejected');
      if (match.state === 'excluded') return void drop('not-logistics');
      // Seen recently or nothing changed since the last verdict: do not pay for a new one
      const recentlySeen = daysSince(match.last_seen) < filters.skipSeenDays;
      const changed = needsRequalify(match, place, settings);
      if (!changed || (recentlySeen && match.qualified_at && daysSince(match.qualified_at) < filters.skipSeenDays && match.reviews === place.reviews)) {
        return void drop('seen');
      }
      candidates.push(match.id);
      return;
    }

    if (budgetLeft <= 0) return void drop('cap');
    budgetLeft--;
    const lead = leadFor(place);
    const { data, error } = await admin.from('companies').insert({ ...companyRow(place, geo, run.id), source: lead?.source ?? 'google-maps' }).select('id').single();
    if (error) {
      if (error.code === '23505') return void drop('duplicate'); // raced with a parallel batch
      console.error('[ingest] insert company failed', error.message);
      return;
    }
    newCount++;
    if (lead) links.push({ companyId: data.id, lead });
    if (place.segment === 'Overig') overig.push({ id: data.id, place });
    else candidates.push(data.id);
  });

  // Second chance for "Overig": the Haiku prefilter classifier decides. Without a verdict (rules mode, or the
  // AI call failed) a place with a website is kept: enrichment + the Qualifier judge it on its own website,
  // and the minimum kans keeps weak ones out of the queue. Before, these were all excluded.
  if (overig.length) {
    const verdict = features.ai
      ? await classifyPlaces(overig.map((o) => ({ id: o.id, name: o.place.name, categories: o.place.categories, description: o.place.description })))
      : null;
    if (verdict) {
      await admin.from('usage_log').insert({ run_id: run.id, profile_id: run.profile_id, provider: 'claude', agent: 'prefilter', units: verdict.inputTokens + verdict.outputTokens, cost_usd: verdict.costUsd, meta: { model: verdict.model } });
      await bump(admin, run.id, { aiCost: verdict.costUsd });
      await admin.from('evaluations').insert(
        overig.map((o) => ({
          company_id: o.id,
          run_id: run.id,
          agent: 'prefilter',
          model: verdict.model,
          prompt_version: PROMPT_VERSIONS.prefilter,
          input_hash: hashInput(o.place.name),
          output: verdict.output.results.find((r) => r.id === o.id) ?? {},
          cost_usd: verdict.costUsd / overig.length,
        })),
      );
    }
    for (const o of overig) {
      const r = verdict?.output.results.find((x) => x.id === o.id);
      const keep = r ? r.is_logistics && filters.segments.includes(r.segment as Segment) : Boolean(o.place.website);
      if (keep) {
        await admin.from('companies').update({ segment: r!.segment }).eq('id', o.id);
        candidates.push(o.id);
      } else {
        await admin.from('companies').update({ state: 'excluded' }).eq('id', o.id);
        drop('not-logistics');
      }
    }
  }

  await linkWebLeads(admin, run.id, links);

  const droppedTotal = Object.values(dropped).reduce((s, n) => s + (n ?? 0), 0);
  await bump(admin, run.id, { found: items.length, new: newCount, prefiltered: candidates.length, callback: true });
  if (droppedTotal) {
    const { data } = await admin.from('search_runs').select('dropped').eq('id', run.id).single();
    const merged = { ...(data?.dropped ?? {}) } as Record<string, number>;
    for (const [k, v] of Object.entries(dropped)) merged[k] = (merged[k] ?? 0) + (v ?? 0);
    await admin.from('search_runs').update({ dropped: merged }).eq('id', run.id);
  }
  return { candidates };
}

// ---------------------------------------------------------------------------
// kind = web: LinkedIn company pages / news via Google Search → look each company up in Google Maps
// ("resolve" mode of the discovery workflow). The places come back as normal "places" batches.
// ---------------------------------------------------------------------------
async function ingestWeb(ctx: Ctx, items: WebPayload[]): Promise<number> {
  const { admin, run, filters } = ctx;
  const queries = run.options.webQueries ?? [];
  const fallbackArea = queries[0]?.area ?? null;
  const { count: already } = await admin.from('web_leads').select('id', { count: 'exact', head: true }).eq('run_id', run.id);
  const room = Math.max(0, filters.maxWebLeads - (already ?? 0));
  const picked = webCandidates(items as WebResult[], queries, filters.exclusions)
    .map((c) => ({ ...c, area: c.area ?? fallbackArea }))
    .filter((c) => c.area)
    .slice(0, room);
  if (!picked.length) return 0;

  const rows = picked.map((c) => {
    const term = resolveTerm(c);
    return { run_id: run.id, source: c.source, name: c.name, name_norm: c.nameNorm, city: c.city, term, term_key: resolveKey(term), url: c.url, title: c.title, snippet: c.snippet, query: c.query };
  });
  const { data: inserted, error } = await admin.from('web_leads').upsert(rows, { onConflict: 'run_id,name_norm', ignoreDuplicates: true }).select('term, term_key');
  if (error) throw new Error(`web_leads: ${error.message}`);
  await recountWeb(admin, run.id);
  const fresh = inserted ?? [];
  if (!fresh.length || run.budget_hit || !env.n8nDiscoveryWebhookUrl) return 0;

  const areaByKey = new Map(picked.map((c) => [resolveKey(resolveTerm(c)), c.area!]));
  const plan = fresh.map((r) => ({ term: r.term, area: areaByKey.get(r.term_key) })).filter((e) => e.area);
  // Held until n8n sends "resolve-done", so the run cannot finish while the lookups are running
  await bump(admin, run.id, { pendingEnrich: 1 });
  try {
    await callN8nWebhook(env.n8nDiscoveryWebhookUrl, {
      mode: 'resolve',
      runId: run.id,
      callbackUrl: run.options.callbackUrl,
      budgetUrl: `${run.options.callbackUrl?.replace(/\/results$/, '/budget')}?runId=${run.id}`,
      maxPlaces: plan.length,
      perSearch: 1,
      plan,
      language: 'nl',
      country: 'NL',
      skipClosed: filters.openOnly,
      deep: false,
      maxRunMinutes: filters.runMinutes,
      web: null,
    });
  } catch (err) {
    console.error('[ingest] resolve webhook failed', err);
    await admin.from('web_leads').update({ state: 'not-found' }).eq('run_id', run.id).eq('state', 'pending');
    await bump(admin, run.id, { pendingEnrich: -1 });
    return 0;
  }
  return plan.length;
}

// ---------------------------------------------------------------------------
// Enrichment hand-off and qualification
// ---------------------------------------------------------------------------
async function sendToEnrich(ctx: Ctx, companyIds: string[]): Promise<string[]> {
  const { admin, run } = ctx;
  if (!features.enrich || !ctx.filters.enrich || run.trigger === 'demo' || run.budget_hit) return companyIds;
  const { data: companies } = await admin.from('companies').select('id, name, website, city, domain').in('id', companyIds);
  const withSite = (companies ?? []).filter((c) => c.website);
  const withoutSite = companyIds.filter((id) => !withSite.some((c) => c.id === id));

  const deep = ctx.filters.depth === 'deep';
  const size = deep ? ENRICH_CHUNK_DEEP : ENRICH_CHUNK;
  const chunks: (typeof withSite)[] = [];
  for (let i = 0; i < withSite.length; i += size) chunks.push(withSite.slice(i, i + size));
  const failed: string[] = [];
  for (const chunk of chunks) {
    const batchId = `enrich-${chunk[0].id.slice(0, 8)}-${Date.now().toString(36)}`;
    await bump(admin, run.id, { pendingEnrich: 1 });
    try {
      await callN8nWebhook(env.n8nEnrichWebhookUrl!, {
        runId: run.id,
        batchId,
        callbackUrl: run.options.callbackUrl,
        budgetUrl: `${run.options.callbackUrl?.replace(/\/results$/, '/budget')}?runId=${run.id}`,
        companies: chunk.map((c) => ({ companyId: c.id, name: c.name, website: c.website, city: c.city, domain: c.domain })),
        options: { depth: deep ? 'deep' : 'standard', maxPagesPerSite: deep ? 15 : 6, signalQueriesPerCompany: deep ? 6 : 2, maxRunMinutes: ctx.filters.runMinutes, language: 'nl', country: 'NL' },
      });
      await setStatus(admin, run.id, 'enriching');
    } catch (error) {
      console.error('[ingest] enrich webhook failed, qualifying with listing data only', error);
      await bump(admin, run.id, { pendingEnrich: -1 });
      failed.push(...chunk.map((c) => c.id));
    }
  }
  return [...withoutSite, ...failed];
}

async function qualifyMany(ctx: Ctx, companyIds: string[]) {
  if (!companyIds.length) return;
  const { admin, run } = ctx;
  await bump(admin, run.id, { pendingEnrich: 1 });
  try {
    await setStatus(admin, run.id, 'qualifying');
    await mapLimit(companyIds, QUALIFY_CONCURRENCY, async (id) => {
      try {
        const result = await qualifyCompany(id, { admin, settings: ctx.settings, filters: ctx.filters, runId: run.id, profileId: run.profile_id });
        // "callback" keeps the run alive: slow local models must not trip the 30-minute stale check
        if (result) await bump(admin, run.id, { qualified: 1, queued: result.queued ? 1 : 0, aiCost: result.aiCost, callback: true });
      } catch (error) {
        console.error(`[ingest] qualifying ${id} failed`, error);
      }
    });
  } finally {
    const row = await bump(admin, run.id, { pendingEnrich: -1, callback: true });
    await maybeFinish(admin, row);
  }
}

async function ingestEnrichment(ctx: Ctx, items: EnrichmentPayload[]) {
  const { admin } = ctx;
  const ids: string[] = [];
  for (const item of items) {
    const enrichment: EnrichmentData = {
      pages: (item.pages ?? []).slice(0, 15).map((p) => ({ url: p.url, title: truncate(p.title ?? '', 200), text: truncate(p.text ?? '', 6000) })),
      search: (item.search ?? []).slice(0, 36).map((s) => ({ query: s.query ?? '', title: truncate(s.title ?? '', 300), url: s.url ?? '', description: truncate(s.description ?? '', 500) })),
      emails: [...new Set((item.emails ?? []).map((e) => e.toLowerCase().trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)))].slice(0, 30),
      phones: [...new Set(item.phones ?? [])].slice(0, 10),
      linkedIns: [...new Set(item.linkedIns ?? [])].slice(0, 10),
      people: (item.people ?? []).slice(0, 15).map((p) => ({ name: p.name ?? '', role: p.role ?? '', email: p.email ?? '', source: p.source ?? '' })),
    };
    const { data: current } = await admin.from('companies').select('enrichment').eq('id', item.companyId).maybeSingle();
    if (!current) continue;
    const merged = {
      ...(current.enrichment ?? {}),
      ...enrichment,
      emails: [...new Set([...(current.enrichment?.emails ?? []), ...(enrichment.emails ?? [])])],
      // LinkedIn company pages found through web discovery stay next to those found on the website
      linkedIns: [...new Set([...(current.enrichment?.linkedIns ?? []), ...(enrichment.linkedIns ?? [])])],
    };
    await admin
      .from('companies')
      .update({
        enrichment: merged,
        website_text: truncate(enrichment.pages?.map((p) => p.text).join('\n\n') ?? '', 20000),
        enriched_at: new Date().toISOString(),
      })
      .eq('id', item.companyId);
    ids.push(item.companyId);
  }
  await bump(admin, ctx.run.id, { enriched: ids.length });
  return ids;
}

// ---------------------------------------------------------------------------
// Entry point for every callback batch
// ---------------------------------------------------------------------------
export async function ingestBatch(
  envelope: Envelope,
  { prePending = false }: { prePending?: boolean } = {},
): Promise<{ duplicate: boolean; accepted: number; rejected: number }> {
  const admin = createAdminClient();
  const { data: run } = await admin.from('search_runs').select('*').eq('id', envelope.runId).maybeSingle<RunRow>();
  if (!run) throw new Error('Onbekende run');
  // Undo the pending mark of the results route when this batch is not processed
  const releasePending = async () => {
    if (prePending) await maybeFinish(admin, await bump(admin, run.id, { pendingEnrich: -1 }));
  };

  // Idempotency: (runId, batchId) is unique, a retried batch is ignored
  const { error: batchError } = await admin.from('run_batches').insert({
    run_id: run.id,
    batch_id: envelope.batchId,
    kind: envelope.kind,
    item_count: envelope.items.length,
    cost_usd: envelope.cost?.apifyUsd ?? 0,
    error: envelope.error ?? null,
  });
  if (batchError?.code === '23505') {
    await releasePending();
    return { duplicate: true, accepted: 0, rejected: 0 };
  }
  if (batchError) {
    await releasePending();
    throw new Error(batchError.message);
  }

  if (FINAL.has(run.status) && run.status !== 'budget_reached') {
    // Late batches after a timeout still cost money: record the cost, ignore the data
    if (envelope.cost?.apifyUsd) await admin.from('usage_log').insert({ run_id: run.id, profile_id: run.profile_id, provider: 'apify', units: 1, cost_usd: envelope.cost.apifyUsd });
    await releasePending();
    return { duplicate: false, accepted: 0, rejected: envelope.items.length };
  }

  const settings = await loadSettings();
  const filters = parseFilters(run.options.filters);
  const ctx: Ctx = { admin, run, filters, settings };
  await recordApifyCost(ctx, envelope.batchId, envelope.cost?.apifyUsd ?? 0);

  if (envelope.executionId) await admin.from('search_runs').update({ n8n_execution_id: envelope.executionId }).eq('id', run.id).is('n8n_execution_id', null);

  let accepted = 0;
  let rejected = 0;

  if (envelope.kind === 'places') {
    const parsed = parseItems<PlaceItem>('places', envelope.items);
    accepted = parsed.items.length;
    rejected = parsed.rejected;
    if (parsed.items.length) {
      // Count this batch as pending work, so a "done" signal cannot close the run while it is processed
      // (the results route already did this before answering n8n)
      if (!prePending) await bump(admin, run.id, { pendingEnrich: 1 });
      try {
        await admin.from('raw_places').insert(parsed.items.slice(0, 500).map((p) => ({ run_id: run.id, place_id: p.placeId ?? null, kind: 'places', payload: p })));
        const { candidates } = await ingestPlaces(ctx, parsed.items);
        const direct = await sendToEnrich(ctx, candidates);
        await qualifyMany(ctx, direct);
      } finally {
        const row = await bump(admin, run.id, { pendingEnrich: -1, callback: true });
        if (!envelope.done) await maybeFinish(admin, row);
      }
    } else {
      await bump(admin, run.id, { callback: true });
      await releasePending();
    }
  } else if (envelope.kind === 'web') {
    const parsed = parseItems<WebPayload>('web', envelope.items);
    accepted = parsed.items.length;
    rejected = parsed.rejected;
    if (parsed.items.length) {
      if (!prePending) await bump(admin, run.id, { pendingEnrich: 1 });
      try {
        await admin.from('raw_places').insert(parsed.items.slice(0, 500).map((p) => ({ run_id: run.id, place_id: null, kind: 'web', payload: p })));
        const lookups = await ingestWeb(ctx, parsed.items);
        console.info(`[ingest] run ${run.id}: ${parsed.items.length} LinkedIn/news results, ${lookups} companies sent to Google Maps`);
      } catch (error) {
        // LinkedIn / news is extra: a failure here never fails the run
        console.error('[ingest] web batch failed', error);
      } finally {
        const row = await bump(admin, run.id, { pendingEnrich: -1, callback: true });
        await maybeFinish(admin, row);
      }
    } else {
      await bump(admin, run.id, { callback: true });
      await releasePending();
    }
  } else if (envelope.kind === 'enrichment') {
    const parsed = parseItems<EnrichmentPayload>('enrichment', envelope.items);
    accepted = parsed.items.length;
    rejected = parsed.rejected;
    await admin.from('raw_places').insert(parsed.items.slice(0, 100).map((p) => ({ run_id: run.id, place_id: null, kind: 'enrichment', payload: p })));
    const ids = await ingestEnrichment(ctx, parsed.items);
    // Companies in the batch that came back without data are still qualified on their listing
    const extra = (envelope.companyIds ?? []).filter((id) => !ids.includes(id));
    await qualifyMany(ctx, [...ids, ...extra]);
    const row = await bump(admin, run.id, { pendingEnrich: -1, callback: true });
    await maybeFinish(admin, row);
  } else if (envelope.kind === 'error') {
    if (envelope.batchId.startsWith('enrich')) {
      // Enrichment failed: qualify on listing data, the run goes on
      await qualifyMany(ctx, envelope.companyIds ?? []);
      const row = await bump(admin, run.id, { pendingEnrich: -1, callback: true });
      await maybeFinish(admin, row);
    } else if (/budget/i.test(envelope.error ?? '')) {
      await admin.from('search_runs').update({ budget_hit: true, discovery_done: true }).eq('id', run.id);
      const { data: fresh } = await admin.from('search_runs').select('*').eq('id', run.id).single<RunRow>();
      await maybeFinish(admin, fresh);
    } else {
      // One area failing does not fail the run; it is recorded, and the run fails at "done" only if nothing was found
      await admin.from('search_runs').update({ error: truncate(envelope.error ?? 'Onbekende fout in n8n', 500), last_callback_at: new Date().toISOString() }).eq('id', run.id);
      if (envelope.done) {
        const { data: fresh } = await admin.from('search_runs').select('found').eq('id', run.id).single();
        if (!fresh?.found) await setStatus(admin, run.id, 'failed', truncate(envelope.error ?? 'Onbekende fout in n8n', 500));
      }
    }
  }

  if (envelope.kind === 'done' && envelope.batchId.startsWith('resolve')) {
    // The Google Maps lookups of LinkedIn / news names are finished
    await admin.from('web_leads').update({ state: 'not-found' }).eq('run_id', run.id).eq('state', 'pending');
    await recountWeb(admin, run.id);
    const row = await bump(admin, run.id, { pendingEnrich: -1, callback: true });
    await maybeFinish(admin, row);
  } else if (envelope.kind === 'done' || envelope.done) {
    await admin.from('search_runs').update({ discovery_done: true, last_callback_at: new Date().toISOString() }).eq('id', run.id);
    const { data: fresh } = await admin.from('search_runs').select('*').eq('id', run.id).single<RunRow & { found: number; error: string | null }>();
    // Every area failed: nothing to show, so the run fails with the last error
    if (fresh && !fresh.found && fresh.error && fresh.pending_enrich === 0) await setStatus(admin, run.id, 'failed', fresh.error);
    else await maybeFinish(admin, fresh);
  }

  return { duplicate: false, accepted, rejected };
}

// Re-run the qualifier for one company (button on the company page)
export async function requalify(companyId: string, profileFilters?: unknown) {
  const admin = createAdminClient();
  const settings = await loadSettings();
  return qualifyCompany(companyId, { admin, settings, filters: parseFilters(profileFilters), runId: null, profileId: null });
}
