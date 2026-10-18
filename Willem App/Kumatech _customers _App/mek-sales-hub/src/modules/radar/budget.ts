import 'server-only';
import type { DbClient } from '@/lib/db';
import type { AppSettings } from '@/modules/settings/types';

export interface BudgetStatus {
  allowed: boolean;
  reason: string | null;
  runSpentUsd: number;
  runBudgetUsd: number;
  remainingRunUsd: number;
  profileMonthUsd: number;
  profileMonthBudgetUsd: number;
  globalApifyMonthUsd: number;
  globalApifyCapUsd: number;
  globalClaudeMonthUsd: number;
  globalClaudeCapUsd: number;
}

async function monthSpend(admin: DbClient, profileId: string | null, provider: 'apify' | 'claude') {
  const { data } = await admin.rpc('month_spend', { p_profile: profileId, p_provider: provider });
  return Number(data ?? 0);
}

// Remaining budget for a run (B.7 "Budgets"): run budget, profile month budget and global month caps
export async function budgetForRun(admin: DbClient, runId: string, settings: AppSettings): Promise<BudgetStatus | null> {
  const { data: run } = await admin.from('search_runs').select('id, profile_id, status, budget_usd, apify_cost, budget_hit').eq('id', runId).maybeSingle();
  if (!run) return null;
  const { data: profile } = run.profile_id
    ? await admin.from('search_profiles').select('budget_month').eq('id', run.profile_id).maybeSingle()
    : { data: null };

  const [profileMonth, apifyMonth, claudeMonth] = await Promise.all([
    run.profile_id ? monthSpend(admin, run.profile_id, 'apify') : Promise.resolve(0),
    monthSpend(admin, null, 'apify'),
    monthSpend(admin, null, 'claude'),
  ]);

  const runSpent = Number(run.apify_cost);
  const runBudget = Number(run.budget_usd);
  const profileBudget = Number(profile?.budget_month ?? Infinity);
  let reason: string | null = null;
  if (['done', 'failed', 'budget_reached'].includes(run.status)) reason = 'Run is al afgesloten';
  else if (run.budget_hit || runSpent >= runBudget) reason = 'Budget per run bereikt';
  else if (profileMonth >= profileBudget) reason = 'Maandbudget van dit profiel bereikt';
  else if (apifyMonth >= settings.caps.apifyMonthUsd) reason = 'Globale Apify-maandlimiet bereikt';

  return {
    allowed: reason === null,
    reason,
    runSpentUsd: runSpent,
    runBudgetUsd: runBudget,
    remainingRunUsd: Math.max(0, Math.min(runBudget - runSpent, profileBudget - profileMonth, settings.caps.apifyMonthUsd - apifyMonth)),
    profileMonthUsd: profileMonth,
    profileMonthBudgetUsd: Number.isFinite(profileBudget) ? profileBudget : 0,
    globalApifyMonthUsd: apifyMonth,
    globalApifyCapUsd: settings.caps.apifyMonthUsd,
    globalClaudeMonthUsd: claudeMonth,
    globalClaudeCapUsd: settings.caps.claudeMonthUsd,
  };
}

// Before starting a run: is there month budget left for this profile and globally?
export async function canStartProfile(admin: DbClient, profileId: string, budgetMonth: number, settings: AppSettings) {
  const [profileMonth, apifyMonth, claudeMonth] = await Promise.all([
    monthSpend(admin, profileId, 'apify'),
    monthSpend(admin, null, 'apify'),
    monthSpend(admin, null, 'claude'),
  ]);
  if (profileMonth >= budgetMonth) return { ok: false as const, reason: 'profileBudget' as const };
  if (apifyMonth >= settings.caps.apifyMonthUsd) return { ok: false as const, reason: 'apifyCap' as const };
  if (claudeMonth >= settings.caps.claudeMonthUsd) return { ok: false as const, reason: 'claudeCap' as const };
  return { ok: true as const, remainingUsd: Math.min(budgetMonth - profileMonth, settings.caps.apifyMonthUsd - apifyMonth) };
}
