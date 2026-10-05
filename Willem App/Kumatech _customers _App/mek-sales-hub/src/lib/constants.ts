// Pipeline, segments, provinces and search terms shared across modules (spec A.1, A.2, A.6, B.5).

export const STATUSES = [
  { code: 'prospect', label: 'Nieuw prospect', money: false },
  { code: 'benaderd', label: 'Benaderd', money: false },
  { code: 'interesse', label: 'Geïnteresseerd', money: true },
  { code: 'offerte', label: 'Offerte uitgebracht', money: true },
  { code: 'gewonnen', label: 'Offerte gewonnen', money: true },
  { code: 'verloren', label: 'Offerte verloren', money: true },
] as const;

export type LeadStatus = (typeof STATUSES)[number]['code'];
export const STATUS_CODES = STATUSES.map((s) => s.code) as LeadStatus[];
export const statusLabel = (code: string) => STATUSES.find((s) => s.code === code)?.label ?? 'Nieuw prospect';
export const statusIndex = (code: string) => Math.max(0, STATUS_CODES.indexOf(code as LeadStatus));
export const isMoneyStatus = (code: string) => STATUSES.find((s) => s.code === code)?.money ?? false;
export const normaliseStatus = (code: string | null | undefined): LeadStatus =>
  STATUS_CODES.includes(code as LeadStatus) ? (code as LeadStatus) : 'prospect';

export const KANS = ['A', 'B', 'C'] as const;
export type Kans = (typeof KANS)[number];

export const SEGMENTS = [
  'Crossdock / hub',
  'Distributiecentrum',
  'Warehouse / opslag',
  'Logistiek dienstverlener',
  'Transport',
  'Overig',
] as const;
export type Segment = (typeof SEGMENTS)[number];

export const PROVINCES = [
  { slug: 'groningen', name: 'Groningen' },
  { slug: 'friesland', name: 'Fryslân' },
  { slug: 'drenthe', name: 'Drenthe' },
  { slug: 'overijssel', name: 'Overijssel' },
  { slug: 'flevoland', name: 'Flevoland' },
  { slug: 'gelderland', name: 'Gelderland' },
  { slug: 'utrecht', name: 'Utrecht' },
  { slug: 'noord-holland', name: 'Noord-Holland' },
  { slug: 'zuid-holland', name: 'Zuid-Holland' },
  { slug: 'zeeland', name: 'Zeeland' },
  { slug: 'noord-brabant', name: 'Noord-Brabant' },
  { slug: 'limburg', name: 'Limburg' },
] as const;
export type ProvinceName = (typeof PROVINCES)[number]['name'];

export const provinceBySlug = (slug: string) => PROVINCES.find((p) => p.slug === slug);

// PDOK returns "Fryslân"; older data may say "Friesland"
export function normaliseProvince(name: string | null | undefined): string {
  if (!name) return '';
  const lower = name.trim().toLowerCase();
  if (lower === 'friesland' || lower === 'fryslan') return 'Fryslân';
  return PROVINCES.find((p) => p.name.toLowerCase() === lower)?.name ?? '';
}

export const provinceSlug = (name: string) => PROVINCES.find((p) => p.name === normaliseProvince(name))?.slug ?? '';

// One deduplicated list (Prospect zoeker 8 terms + Leads Nederland 9 presets), spec B.5
export const SEARCH_TERMS = [
  'logistiek',
  'distributiecentrum',
  'warehouse',
  'crossdock',
  'transportbedrijf',
  'opslag en distributie',
  'expeditie',
  'fulfilment',
  'logistiek dienstverlener',
  'koelhuis',
  'pakket hub crossdock',
  'groothandel magazijn',
] as const;

export const DEFAULT_EXCLUSIONS = [
  'self-storage',
  'selfstorage',
  'opslagruimte huren',
  'opslagbox',
  'uitzend',
  'verhuis',
  'koeriersdienst particulier',
  'parkeer',
];

export const LEAD_ROLES = ['Warehouse manager', 'Supply chain manager', 'Crossdock manager', 'Eigenaar / directeur'] as const;

export const RADIUS_OPTIONS = [5, 10, 20, 30, 50] as const;
