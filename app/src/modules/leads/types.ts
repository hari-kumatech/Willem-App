import type { LeadStatus } from '@/lib/constants';

export interface Lead {
  id: string;
  legacy_id: string | null;
  company_id: string | null;
  bedrijf: string;
  kans: 'A' | 'B' | 'C' | null;
  status: LeadStatus;
  segment: string;
  familie: '' | 'ja' | 'groot' | 'nee';
  adres: string;
  postcode: string;
  plaats: string;
  provincie: string;
  contact: string;
  functie: string;
  tel: string;
  email: string;
  web: string;
  maps: string;
  datum: string | null;
  volgende: string;
  due_date: string | null;
  aantal: number;
  waarde: number;
  reden: string;
  waarom: string;
  aanpak: string;
  notitie: string;
  fit_score: number | null;
  hall: Record<string, number> | null;
  owner: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const LEAD_COLUMNS =
  'id, legacy_id, company_id, bedrijf, kans, status, segment, familie, adres, postcode, plaats, provincie, contact, functie, tel, email, web, maps, datum, volgende, due_date, aantal, waarde, reden, waarom, aanpak, notitie, fit_score, hall, owner, version, created_at, updated_at';

export interface LeadFilters {
  status: string;
  kans: string[];
  familie: boolean;
  plaats: string;
  provincie: string; // slug, 'geen' or ''
  q: string;
  sort: 'kans' | 'bedrijf' | 'status' | 'volgende' | 'waarde' | 'datum';
  dir: 'asc' | 'desc';
  page: number;
}

export const PAGE_SIZE = 50;

export function parseLeadFilters(sp: Record<string, string | string[] | undefined>): LeadFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? '';
  const sort = one('sort') as LeadFilters['sort'];
  const validSort = ['kans', 'bedrijf', 'status', 'volgende', 'waarde', 'datum'].includes(sort) ? sort : 'kans';
  const dir = one('dir') === 'desc' ? 'desc' : one('dir') === 'asc' ? 'asc' : validSort === 'datum' || validSort === 'waarde' ? 'desc' : 'asc';
  return {
    status: one('status'),
    kans: one('kans').split(',').filter((k) => ['A', 'B', 'C'].includes(k)),
    familie: one('familie') === '1',
    plaats: one('plaats'),
    provincie: one('provincie'),
    q: one('q').slice(0, 100),
    sort: validSort,
    dir,
    page: Math.max(1, Number(one('page')) || 1),
  };
}
