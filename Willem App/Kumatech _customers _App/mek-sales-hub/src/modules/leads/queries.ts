import 'server-only';
import { createClient } from '@/lib/db/server';
import { provinceBySlug, STATUS_CODES } from '@/lib/constants';
import { LEAD_COLUMNS, PAGE_SIZE, type Lead, type LeadFilters } from './types';

export interface LeadKpis {
  total: number;
  byStatus: Record<string, { count: number; sum: number; A: number; B: number; C: number }>;
  openPipeline: number;
  winRatio: number | null;
  plaatsen: string[];
}

// Escape a user search term for a PostgREST or() filter
const ilikeValue = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()"]/g, ' ')}%`;

// KPI tiles are computed over the province scope (not the other filters), like the original dashboard
export async function leadKpis(provincie: string): Promise<LeadKpis> {
  const db = await createClient();
  let query = db.from('leads').select('status, kans, waarde, plaats');
  const province = provinceBySlug(provincie)?.name;
  if (province) query = query.eq('provincie', province);
  else if (provincie === 'geen') query = query.eq('provincie', '');
  const { data } = await query.limit(20000);
  const byStatus: LeadKpis['byStatus'] = Object.fromEntries(STATUS_CODES.map((s) => [s, { count: 0, sum: 0, A: 0, B: 0, C: 0 }]));
  const plaatsen = new Set<string>();
  for (const row of data ?? []) {
    const bucket = byStatus[row.status] ?? byStatus.prospect;
    bucket.count++;
    bucket.sum += Number(row.waarde) || 0;
    if (row.kans === 'A' || row.kans === 'B' || row.kans === 'C') bucket[row.kans as 'A' | 'B' | 'C']++;
    if (row.plaats) plaatsen.add(row.plaats);
  }
  const won = byStatus.gewonnen.count;
  const lost = byStatus.verloren.count;
  return {
    total: data?.length ?? 0,
    byStatus,
    openPipeline: byStatus.interesse.sum + byStatus.offerte.sum,
    winRatio: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
    plaatsen: [...plaatsen].sort((a, b) => a.localeCompare(b, 'nl')),
  };
}

// Filtered, sorted, paginated on the server (B.12: fast with 2,000 leads)
export async function listLeads(filters: LeadFilters): Promise<{ leads: Lead[]; count: number; pages: number }> {
  const db = await createClient();
  let query = db.from('leads').select(LEAD_COLUMNS, { count: 'exact' });
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.kans.length) query = query.in('kans', filters.kans);
  if (filters.familie) query = query.in('familie', ['ja', 'groot']);
  if (filters.plaats) query = query.eq('plaats', filters.plaats);
  const province = provinceBySlug(filters.provincie)?.name;
  if (province) query = query.eq('provincie', province);
  else if (filters.provincie === 'geen') query = query.eq('provincie', '');
  if (filters.q) {
    const v = ilikeValue(filters.q);
    query = query.or(
      ['bedrijf', 'contact', 'email', 'segment', 'plaats', 'waarom', 'notitie', 'aanpak', 'volgende'].map((c) => `${c}.ilike.${v}`).join(','),
    );
  }

  const asc = filters.dir === 'asc';
  switch (filters.sort) {
    case 'bedrijf':
      query = query.order('bedrijf', { ascending: asc });
      break;
    case 'status':
      query = query.order('status_rank', { ascending: asc }).order('bedrijf');
      break;
    case 'volgende':
      query = query.order('due_date', { ascending: asc, nullsFirst: false }).order('volgende', { ascending: asc });
      break;
    case 'waarde':
      query = query.order('waarde', { ascending: asc }).order('bedrijf');
      break;
    case 'datum':
      query = query.order('datum', { ascending: asc, nullsFirst: false }).order('bedrijf');
      break;
    default:
      query = query.order('kans', { ascending: asc, nullsFirst: false }).order('fit_score', { ascending: false, nullsFirst: false }).order('bedrijf');
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
  const leads = (data ?? []) as unknown as Lead[];
  const total = count ?? 0;
  return { leads, count: total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getLead(id: string): Promise<Lead | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await createClient();
  const { data } = await db.from('leads').select(LEAD_COLUMNS).eq('id', id).maybeSingle();
  return (data as unknown as Lead) ?? null;
}
