'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ForbiddenError, requireAdmin, requireWriter } from '@/lib/auth';
import { createClient } from '@/lib/db/server';
import { createAdminClient } from '@/lib/db/admin';
import { createUser, setPassword } from '@/lib/session';
import { geocodePostcode } from '@/lib/geo';
import { getMessages } from '@/i18n/server';
import { common } from '@/i18n/messages/common';
import { settingsMsg } from '@/i18n/messages/settings';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function fail(error: unknown): Promise<{ ok: false; error: string }> {
  const t = await getMessages(common);
  if (error instanceof ForbiddenError) return { ok: false, error: t.adminOnly };
  console.error('[settings] action failed', error);
  return { ok: false, error: error instanceof z.ZodError ? `${t.genericError} (${error.issues[0]?.path.join('.')})` : t.genericError };
}

const pos = (max: number) => z.coerce.number().min(0).max(max);

const schemas = {
  product: z.object({
    name: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(40),
    price: pos(1_000_000),
    competitorPrice: pos(1_000_000),
    vat: pos(50),
    shiftHours: z.coerce.number().min(1).max(24),
    workDaysPerYear: z.coerce.number().int().min(50).max(366),
    forkRetractedMm: pos(5000),
    forkExtendedMm: pos(5000),
    extendSeconds: pos(60),
    retractSeconds: pos(60),
    widthMm: pos(3000),
    capacityKg: pos(10000),
    palletsPerTrip: z.coerce.number().int().min(1).max(4),
    speedEmptyKmh: z.coerce.number().min(1).max(40),
    speedLoadedKmh: z.coerce.number().min(1).max(40),
    quoteValidDays: z.coerce.number().int().min(1).max(365),
    contactEmail: z.string().trim().email(),
  }),
  kans: z.object({ A: z.coerce.number().int().min(1).max(100), B: z.coerce.number().int().min(0).max(99) }).refine((k) => k.A > k.B),
  weights: z.object({
    palletFlows: pos(100),
    volume: pos(100),
    multiDrop: pos(100),
    growth: pos(100),
    distance: pos(100),
    family: pos(100),
    dataQuality: pos(100),
  }),
  home: z.object({ postcode: z.string().trim().regex(/^\d{4}\s?[A-Za-z]{0,2}$/), label: z.string().trim().max(60), serviceRadiusKm: z.coerce.number().min(5).max(400) }),
  caps: z.object({ apifyMonthUsd: pos(10000), claudeMonthUsd: pos(10000) }),
  requalify: z.object({ seenDays: z.coerce.number().int().min(0).max(365), reviewGrowthPct: z.coerce.number().min(1).max(1000), maxAgeDays: z.coerce.number().int().min(1).max(3650) }),
};

export type SettingsKey = keyof typeof schemas;

export async function saveSetting(key: SettingsKey, value: unknown): Promise<Result> {
  try {
    const user = await requireAdmin();
    let parsed = schemas[key].parse(value) as Record<string, unknown>;
    if (key === 'home') {
      // Store coordinates with the postcode so distances can be computed offline
      const geo = await geocodePostcode(String(parsed.postcode));
      if (geo) parsed = { ...parsed, lat: geo.lat, lng: geo.lng, label: parsed.label || geo.city };
    }
    const db = await createClient();
    const { error } = await db.from('settings').upsert({ key, value: parsed, updated_at: new Date().toISOString(), updated_by: user.id });
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------
const userSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['admin', 'sales', 'viewer']),
  password: z.string().min(8).max(72),
});

export async function addUser(input: z.input<typeof userSchema>): Promise<Result> {
  try {
    await requireAdmin();
    const data = userSchema.parse(input);
    const { error } = await createUser({
      email: data.email,
      password: data.password,
      meta: { name: data.name, role: data.role },
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/instellingen');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setUserRole(userId: string, role: 'admin' | 'sales' | 'viewer'): Promise<Result> {
  try {
    const me = await requireAdmin();
    const t = await getMessages(settingsMsg);
    const admin = createAdminClient();
    if (role !== 'admin') {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').neq('id', userId);
      if (!count) return { ok: false, error: t.users.lastAdmin };
    }
    const db = await createClient();
    const { error } = await db.from('profiles').update({ role }).eq('id', userId);
    if (error) throw new Error(error.message);
    void me;
    revalidatePath('/instellingen');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setUserPassword(userId: string, password: string): Promise<Result> {
  try {
    await requireAdmin();
    z.string().min(8).max(72).parse(password);
    const { error } = await setPassword(userId, password);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export async function addDoNotContact(value: string): Promise<Result> {
  try {
    await requireWriter();
    const v = value.trim().toLowerCase().replace(/^mailto:/, '');
    if (!/^([^\s@]+@)?[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return { ok: false, error: (await getMessages(common)).genericError };
    const db = await createClient();
    await db.from('do_not_contact').upsert({ value: v }, { onConflict: 'value', ignoreDuplicates: true });
    revalidatePath('/instellingen');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function removeDoNotContact(id: number): Promise<Result> {
  try {
    await requireWriter();
    const db = await createClient();
    await db.from('do_not_contact').delete().eq('id', id);
    revalidatePath('/instellingen');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function purgeNow(): Promise<Result<{ raw: number; contacts: number }>> {
  try {
    await requireAdmin();
    const { data } = await createAdminClient().rpc('purge_old_data');
    return { ok: true, raw: Number(data?.raw_places ?? 0), contacts: Number(data?.contacts ?? 0) };
  } catch (error) {
    return fail(error);
  }
}
