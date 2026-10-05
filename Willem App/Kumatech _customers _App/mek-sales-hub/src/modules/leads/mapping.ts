// Mapping between the legacy lead format (leads.json / mek-leads export / MEK_Leads_crossdock.xlsx)
// and the database row. No server-only imports: the seed script uses this file too.
import { normaliseStatus, type LeadStatus } from '../../lib/constants';
import { domainOf, extractPostcode, nameKey, safeUrl } from '../../lib/text';
import { provinceFromPostcode } from '../../lib/geo';

export interface LegacyLead {
  id?: string;
  bedrijf?: string;
  kans?: string;
  status?: string;
  segment?: string;
  familie?: string;
  adres?: string;
  plaats?: string;
  provincie?: string;
  contact?: string;
  functie?: string;
  tel?: string;
  email?: string;
  web?: string;
  maps?: string;
  datum?: string;
  volgende?: string;
  due_date?: string;
  aantal?: number | string;
  waarde?: number | string;
  reden?: string;
  waarom?: string;
  aanpak?: string;
  notitie?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Dutch status text → code (A.1 import). "Geen interesse" becomes verloren with that reason.
const STATUS_MAP: Record<string, LeadStatus> = {
  nieuw: 'prospect',
  'nieuw prospect': 'prospect',
  prospect: 'prospect',
  benaderd: 'benaderd',
  'geïnteresseerd': 'interesse',
  geinteresseerd: 'interesse',
  interesse: 'interesse',
  'offerte uitgebracht': 'offerte',
  offerte: 'offerte',
  'offerte gewonnen': 'gewonnen',
  gewonnen: 'gewonnen',
  'offerte verloren': 'verloren',
  verloren: 'verloren',
  'geen interesse': 'verloren',
};

export function mapStatus(text: string | null | undefined): { status: LeadStatus; reden: string } {
  const key = (text ?? '').trim().toLowerCase();
  const status = STATUS_MAP[key] ?? normaliseStatus(key);
  return { status, reden: key === 'geen interesse' ? 'Geen interesse' : '' };
}

export function mapFamilie(text: string | null | undefined): '' | 'ja' | 'groot' | 'nee' {
  const key = (text ?? '').trim().toLowerCase();
  if (key === 'ja') return 'ja';
  if (key === 'groot' || key === 'ja, groot' || key === 'ja groot') return 'groot';
  if (key === 'nee') return 'nee';
  return '';
}

const isoDate = (value: string | null | undefined) => {
  const v = (value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const nl = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  return nl ? `${nl[3]}-${nl[2].padStart(2, '0')}-${nl[1].padStart(2, '0')}` : null;
};

const money = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

export interface LeadRow {
  legacy_id: string | null;
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
  name_key: string | null;
  created_at?: string;
  updated_at?: string;
}

// "5405 BW Uden" → postcode "5405 BW", plaats "Uden"
export function splitPlaats(plaats: string): { postcode: string; city: string } {
  const postcode = extractPostcode(plaats);
  const city = postcode ? plaats.replace(/\b\d{4}\s?[A-Za-z]{2}\b|\b\d{4}\b/, '').trim() : plaats.trim();
  return { postcode, city };
}

export function legacyToRow(lead: LegacyLead): LeadRow | null {
  const bedrijf = (lead.bedrijf ?? '').trim();
  if (!bedrijf) return null;
  const { postcode, city } = splitPlaats(lead.plaats ?? '');
  const kans = (lead.kans ?? '').trim().toUpperCase();
  const mapped = mapStatus(lead.status);
  const email = (lead.email ?? '').trim();
  return {
    legacy_id: lead.id?.trim() || null,
    bedrijf,
    kans: kans === 'A' || kans === 'B' || kans === 'C' ? kans : null,
    status: mapped.status,
    segment: (lead.segment ?? '').trim(),
    familie: mapFamilie(lead.familie),
    adres: (lead.adres ?? '').trim(),
    postcode,
    plaats: city,
    provincie: lead.provincie?.trim() || provinceFromPostcode(postcode),
    contact: (lead.contact ?? '').trim(),
    functie: (lead.functie ?? '').trim(),
    tel: (lead.tel ?? '').trim(),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    web: safeUrl(lead.web),
    maps: safeUrl(lead.maps),
    datum: isoDate(lead.datum),
    volgende: (lead.volgende ?? '').trim(),
    due_date: isoDate(lead.due_date),
    aantal: Math.max(0, Math.round(Number(lead.aantal) || 0)),
    waarde: money(lead.waarde),
    reden: (lead.reden ?? '').trim() || mapped.reden,
    waarom: (lead.waarom ?? '').trim(),
    aanpak: (lead.aanpak ?? '').trim(),
    notitie: (lead.notitie ?? '').trim(),
    name_key: nameKey(bedrijf, postcode),
    ...(lead.createdAt && !Number.isNaN(Date.parse(lead.createdAt)) ? { created_at: new Date(lead.createdAt).toISOString() } : {}),
    ...(lead.updatedAt && !Number.isNaN(Date.parse(lead.updatedAt)) ? { updated_at: new Date(lead.updatedAt).toISOString() } : {}),
  };
}

// Database row → legacy export format (mek-leads JSON stays compatible, B.6)
export function rowToLegacy(row: Record<string, unknown>): LegacyLead & Record<string, unknown> {
  const s = (k: string) => (row[k] === null || row[k] === undefined ? '' : String(row[k]));
  return {
    id: s('legacy_id') || s('id'),
    bedrijf: s('bedrijf'),
    kans: s('kans'),
    status: s('status'),
    segment: s('segment'),
    familie: s('familie'),
    adres: s('adres'),
    plaats: [s('postcode'), s('plaats')].filter(Boolean).join(' '),
    provincie: s('provincie'),
    contact: s('contact'),
    functie: s('functie'),
    tel: s('tel'),
    email: s('email'),
    web: s('web'),
    maps: s('maps'),
    datum: s('datum'),
    volgende: s('volgende'),
    due_date: s('due_date'),
    aantal: Number(row.aantal ?? 0),
    waarde: Number(row.waarde ?? 0),
    reden: s('reden'),
    waarom: s('waarom'),
    aanpak: s('aanpak'),
    notitie: s('notitie'),
    createdAt: s('created_at'),
    updatedAt: s('updated_at'),
  };
}

// Company row for a lead (seed and import create companies + leads, B.9)
export function companyFromLead(row: LeadRow) {
  return {
    name: row.bedrijf,
    address: row.adres,
    postcode: row.postcode,
    city: row.plaats,
    province: row.provincie,
    phone: row.tel,
    website: row.web,
    maps_url: row.maps,
    domain: domainOf(row.web),
    name_key: row.name_key,
    segment: 'Overig',
    familie: row.familie || 'onbekend',
    kans: row.kans,
    waarom: row.waarom,
    aanpak: row.aanpak,
    state: 'lead',
    source: 'import',
  };
}
