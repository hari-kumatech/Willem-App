import 'server-only';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/db/admin';
import { env, features } from '@/lib/env';
import { callbackBase, callN8nWebhook } from '@/lib/n8n';
import { truncate } from '@/lib/text';
import { loadSettings } from '@/modules/settings/load';
import { canStartProfile } from './budget';
import { demoPlaces } from './demo';
import { nextRunAt, parseFilters, parseSchedule } from './filters';
import { failRun, ingestBatch, setStatus } from './ingest';
import { buildPlan, PlanError } from './plan';
import { buildWebQueries } from './web';
import { scopeKey } from './tiles';
import { normaliseProvince } from '@/lib/constants';
import { getMessages } from '@/i18n/server';
import { radarMsg } from '@/i18n/messages/radar';

export type StartRunResult = { ok: true; runId: string } | { ok: false; error: string };

// "Search now" can run a profile for another area than its own: one province, several, or the whole country
export interface AreaScope {
  areaMode: 'provinces' | 'nl';
  provinces?: string[];
}

interface StartRunInput {
  profileId: string;
  trigger: 'manual' | 'scheduled';
  userId: string | null;
  origin?: string;
  scope?: AreaScope | null;
}

// Start one prospecting run for a search profile (B.7). Used by "Nu zoeken" and by the scheduler.
export async function startRun({ profileId, trigger, userId, origin, scope }: StartRunInput): Promise<StartRunResult> {
  const admin = createAdminClient();
  const settings = await loadSettings();
  const t = (await getMessages(radarMsg)).errors;
  const { data: profile } = await admin.from('search_profiles').select('*').eq('id', profileId).maybeSingle();
  if (!profile) return { ok: false, error: t.profileNotFound };

  const { count: running } = await admin
    .from('search_runs')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .in('status', ['queued', 'discovering', 'enriching', 'qualifying']);
  if ((running ?? 0) > 0) return { ok: false, error: t.alreadyRunning };

  const budget = await canStartProfile(admin, profileId, Number(profile.budget_month), settings);
  if (!budget.ok) return { ok: false, error: t[budget.reason] };

  const profileFilters = parseFilters(profile.filters);
  // Area for this run: the profile's own, or the one chosen next to "Search now"
  const filters = scope
    ? { ...profileFilters, areaMode: scope.areaMode, provinces: scope.areaMode === 'provinces' ? (scope.provinces ?? []).map(normaliseProvince).filter(Boolean) : profileFilters.provinces }
    : profileFilters;
  const ownScope = scopeKey(profileFilters);
  const runScope = scopeKey(filters);
  const cursors = (profile.coverage_cursors ?? {}) as Record<string, number>;
  // Every area keeps its own cursor; the profile's own area also keeps the old single cursor in sync
  const cursor = cursors[runScope] ?? (runScope === ownScope ? profile.coverage_cursor ?? 0 : 0);
  let plan;
  try {
    plan = await buildPlan(filters, cursor);
  } catch (error) {
    if (error instanceof PlanError) return { ok: false, error: error.code === 'postcodeNotFound' ? t.postcodeNotFound(error.param) : t[error.code] };
    return { ok: false, error: t.planFailed };
  }

  const demo = features.demoMode;
  const callbackUrl = `${callbackBase(origin)}/api/n8n/results`;
  // LinkedIn company pages + news / PR via Google Search (web.ts); not in demo mode
  const webQueries = demo
    ? []
    : buildWebQueries(
        [...new Set(plan.entries.map((e) => e.term))],
        plan.areas,
        { linkedin: filters.webLinkedin, news: filters.webNews, newsSites: filters.newsSites },
      );
  const budgetUsd = Math.min(Number(profile.budget_run), budget.remainingUsd);
  const { data: run, error } = await admin
    .from('search_runs')
    .insert({
      profile_id: profileId,
      profile_name: runScope === ownScope ? profile.name : `${profile.name} · ${filters.areaMode === 'nl' ? 'Heel Nederland' : filters.provinces.join(', ')}`,
      trigger: demo ? 'demo' : trigger,
      status: 'queued',
      plan: plan.entries,
      budget_usd: Math.round(budgetUsd * 100) / 100,
      created_by: userId,
      options: {
        filters,
        origin: plan.origin,
        maxDistanceKm: plan.maxDistanceKm,
        provinces: plan.provinces,
        maxCompanies: profile.max_companies,
        callbackUrl,
        tiles: { scope: runScope, from: cursor, next: plan.nextCursor, total: plan.tilesTotal },
        webQueries,
      },
    })
    .select('id')
    .single();
  if (error || !run) return { ok: false, error: t.runCreateFailed };

  // Advance the coverage cursor and the schedule
  const schedule = parseSchedule(profile.schedule);
  await admin
    .from('search_profiles')
    .update({
      coverage_cursors: { ...cursors, [runScope]: plan.nextCursor },
      ...(runScope === ownScope
        ? { coverage_cursor: plan.nextCursor, coverage_round: (profile.coverage_round ?? 0) + (plan.wrapped ? 1 : 0) }
        : {}),
      next_run_at: nextRunAt(schedule)?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);

  if (demo) {
    after(async () => {
      try {
        await setStatus(admin, run.id, 'discovering');
        const places = demoPlaces(plan.entries, Math.min(profile.max_companies, 40));
        await ingestBatch({ runId: run.id, batchId: 'demo-maps-1', kind: 'places', items: places, done: true, cost: { apifyUsd: 0 } });
      } catch (err) {
        console.error('[demo] run failed', err);
        await failRun(run.id, err instanceof Error ? err.message : 'Demo-run mislukt');
      }
    });
    return { ok: true, runId: run.id };
  }

  try {
    const response = (await callN8nWebhook(env.n8nDiscoveryWebhookUrl!, {
      runId: run.id,
      callbackUrl,
      budgetUrl: `${callbackBase(origin)}/api/n8n/budget?runId=${run.id}`,
      budgetUsd: Math.round(budgetUsd * 100) / 100,
      maxPlaces: profile.max_companies,
      perSearch: filters.perSearch,
      plan: plan.entries,
      language: 'nl',
      country: 'NL',
      skipClosed: filters.openOnly,
      deep: filters.depth === 'deep',
      maxRunMinutes: filters.runMinutes,
      web: webQueries.length ? { queries: webQueries.map((q) => ({ source: q.source, query: q.query })), pages: filters.webPages } : null,
    })) as { executionId?: string } | null;
    await admin.from('search_runs').update({ n8n_execution_id: response?.executionId ?? null }).eq('id', run.id);
    await setStatus(admin, run.id, 'discovering');
  } catch (err) {
    await failRun(run.id, `n8n niet bereikbaar: ${truncate(err instanceof Error ? err.message : String(err), 300)}`);
    return { ok: false, error: t.n8nDown };
  }
  return { ok: true, runId: run.id };
}
