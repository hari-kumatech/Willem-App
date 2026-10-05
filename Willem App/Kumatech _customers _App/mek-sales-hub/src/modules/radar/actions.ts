'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { ForbiddenError, requireWriter } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { todayIso } from '@/lib/format';
import { features } from '@/lib/env';
import { nameKey } from '@/lib/text';
import { getMessages } from '@/i18n/server';
import { common } from '@/i18n/messages/common';
import { radarMsg } from '@/i18n/messages/radar';
import { filtersSchema, nextRunAt, scheduleSchema } from './filters';
import { requalify } from './ingest';
import { startRun } from './startRun';
import { runPlanner } from './agents';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getMessages(common);
  if (error instanceof ForbiddenError) return { ok: false, error: t.forbidden };
  console.error('[radar] action failed', error);
  return { ok: false, error: t.genericError };
}

// ---------------------------------------------------------------------------
// Review queue (B.7 step 7)
// ---------------------------------------------------------------------------
export async function approveCompany(companyId: string): Promise<Result<{ leadId: string; name: string }>> {
  try {
    const user = await requireWriter();
    const supabase = await createClient();
    const { data: c } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle();
    if (!c) return fail(new Error('company not found'));
    const { data: primary } = await supabase
      .from('contacts')
      .select('name, role, email, phone')
      .eq('company_id', companyId)
      .order('rank')
      .limit(1)
      .maybeSingle();

    const { data: existing } = await supabase.from('leads').select('id').eq('company_id', companyId).maybeSingle();
    let leadId = existing?.id as string | undefined;
    if (!leadId) {
      const { data: lead, error } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          bedrijf: c.name,
          kans: c.kans,
          status: 'prospect',
          segment: c.segment,
          familie: c.familie === 'onbekend' ? '' : c.familie,
          adres: c.address,
          postcode: c.postcode,
          plaats: c.city,
          provincie: c.province,
          lat: c.lat,
          lng: c.lng,
          contact: primary?.name ?? '',
          functie: primary?.role ?? '',
          tel: primary?.phone || c.phone,
          email: primary?.email ?? '',
          web: c.website,
          maps: c.maps_url,
          datum: todayIso(),
          waarom: c.waarom,
          aanpak: c.aanpak,
          fit_score: c.fit_score,
          owner: user.id,
          name_key: nameKey(c.name, c.postcode),
        })
        .select('id')
        .single();
      if (error) {
        // Same name + postcode already in the pipeline: link instead of duplicating
        if (error.code === '23505') {
          const { data: byName } = await supabase.from('leads').select('id').eq('name_key', nameKey(c.name, c.postcode)).maybeSingle();
          if (byName) {
            await supabase.from('leads').update({ company_id: companyId }).eq('id', byName.id);
            leadId = byName.id;
          }
        }
        if (!leadId) throw new Error(error.message);
      } else {
        leadId = lead.id;
        await supabase.from('activities').insert({ lead_id: leadId, type: 'agent', text: `${c.kans ?? ''}|${c.fit_score ?? ''}`, user_id: user.id });
      }
    }
    await supabase.from('companies').update({ state: 'lead' }).eq('id', companyId);
    await supabase.from('review_queue').update({ state: 'approved', decided_by: user.id, decided_at: new Date().toISOString() }).eq('company_id', companyId);
    revalidatePath('/radar');
    revalidatePath('/leads');
    return { ok: true, leadId: leadId!, name: c.name };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectCompany(companyId: string, reason: string): Promise<Result> {
  try {
    const user = await requireWriter();
    const supabase = await createClient();
    await supabase.from('review_queue').update({ state: 'rejected', reason: reason.slice(0, 200), decided_by: user.id, decided_at: new Date().toISOString() }).eq('company_id', companyId);
    await supabase.from('companies').update({ state: 'rejected' }).eq('id', companyId);
    revalidatePath('/radar');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function snoozeCompany(companyId: string, days: number): Promise<Result> {
  try {
    const user = await requireWriter();
    const supabase = await createClient();
    const until = new Date(Date.now() + Math.max(1, Math.min(365, days)) * 86_400_000).toISOString().slice(0, 10);
    await supabase.from('review_queue').update({ state: 'snoozed', snooze_until: until, decided_by: user.id, decided_at: new Date().toISOString() }).eq('company_id', companyId);
    revalidatePath('/radar');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function approveAllA(): Promise<Result<{ count: number }>> {
  try {
    await requireWriter();
    const supabase = await createClient();
    const { data } = await supabase.from('review_queue').select('company_id, companies!inner(kans)').eq('state', 'new').eq('companies.kans', 'A').limit(100);
    let count = 0;
    for (const row of data ?? []) {
      const result = await approveCompany(row.company_id);
      if (result.ok) count++;
    }
    return { ok: true, count };
  } catch (error) {
    return fail(error);
  }
}

export async function requalifyCompany(companyId: string): Promise<Result> {
  try {
    await requireWriter();
    const { data } = await createAdminClient().from('review_queue').select('profile_id').eq('company_id', companyId).maybeSingle();
    const { data: profile } = data?.profile_id
      ? await createAdminClient().from('search_profiles').select('filters').eq('id', data.profile_id).maybeSingle()
      : { data: null };
    await requalify(companyId, profile?.filters);
    revalidatePath('/radar');
    revalidatePath('/leads');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Search profiles
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  filters: filtersSchema,
  schedule: scheduleSchema,
  budget_run: z.coerce.number().min(0.1).max(100),
  budget_month: z.coerce.number().min(0.5).max(2000),
  max_companies: z.coerce.number().int().min(1).max(2000),
  active: z.boolean(),
});

export type ProfileInput = z.input<typeof profileSchema>;

export async function saveProfile(input: ProfileInput): Promise<Result<{ id: string }>> {
  try {
    const user = await requireWriter();
    const t = (await getMessages(radarMsg)).form;
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: `${t.invalid} (${parsed.error.issues[0]?.path.join('.')})` };
    const p = parsed.data;
    if (!p.filters.terms.length) return { ok: false, error: t.noTerms };
    if (p.filters.areaMode === 'provinces' && !p.filters.provinces.length) return { ok: false, error: t.noProvinces };
    const supabase = await createClient();
    const row = {
      name: p.name,
      filters: p.filters,
      schedule: p.schedule,
      budget_run: p.budget_run,
      budget_month: p.budget_month,
      max_companies: p.max_companies,
      active: p.active,
      next_run_at: p.active ? (nextRunAt(p.schedule)?.toISOString() ?? null) : null,
      updated_at: new Date().toISOString(),
    };
    if (p.id) {
      const { data: before } = await supabase.from('search_profiles').select('filters').eq('id', p.id).single();
      // Changing the area restarts the coverage cursor
      const areaChanged =
        JSON.stringify([before?.filters?.areaMode, before?.filters?.provinces]) !== JSON.stringify([p.filters.areaMode, p.filters.provinces]);
      const { error } = await supabase.from('search_profiles').update({ ...row, ...(areaChanged ? { coverage_cursor: 0, coverage_round: 0 } : {}) }).eq('id', p.id);
      if (error) throw new Error(error.message);
      revalidatePath('/radar');
      return { ok: true, id: p.id };
    }
    const { data, error } = await supabase.from('search_profiles').insert({ ...row, created_by: user.id }).select('id').single();
    if (error) throw new Error(error.message);
    revalidatePath('/radar');
    return { ok: true, id: data.id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteProfile(id: string): Promise<Result> {
  try {
    await requireWriter();
    const supabase = await createClient();
    await supabase.from('search_profiles').delete().eq('id', id);
    revalidatePath('/radar');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function runProfileNow(id: string): Promise<Result<{ runId: string }>> {
  try {
    const user = await requireWriter();
    const h = await headers();
    const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`;
    const result = await startRun({ profileId: id, trigger: 'manual', userId: user.id, origin });
    revalidatePath('/radar');
    return result.ok ? { ok: true, runId: result.runId } : { ok: false, error: result.error };
  } catch (error) {
    return fail(error);
  }
}

// Planner agent: suggest new search terms from the yield of past runs (B.8)
export async function suggestTerms(currentTerms: string[]): Promise<Result<{ terms: { term: string; why: string }[] }>> {
  try {
    await requireWriter();
    if (!features.ai) return { ok: false, error: (await getMessages(radarMsg)).rulesMode };
    const admin = createAdminClient();
    const { data: rows } = await admin.from('companies').select('segment, kans, categories').in('state', ['queued', 'lead']).limit(300);
    const categories = new Map<string, number>();
    for (const r of rows ?? []) for (const c of r.categories ?? []) categories.set(c, (categories.get(c) ?? 0) + 1);
    const top = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const result = await runPlanner(
      `Huidige zoektermen: ${currentTerms.join(', ')}\nGoogle-categorieën van goede bedrijven (aantal): ${top.map(([c, n]) => `${c} (${n})`).join(', ') || 'nog geen data'}`,
    );
    if (!result) return { ok: false, error: (await getMessages(common)).genericError };
    await admin.from('usage_log').insert({ provider: 'claude', agent: 'planner', units: result.inputTokens + result.outputTokens, cost_usd: result.costUsd, meta: { model: result.model } });
    const known = new Set(currentTerms.map((t) => t.toLowerCase()));
    return { ok: true, terms: result.output.terms.filter((t) => t.term && !known.has(t.term.toLowerCase())).slice(0, 8) };
  } catch (error) {
    return fail(error);
  }
}
