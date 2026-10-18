// Settings shapes and defaults. The database row wins; these defaults fill any missing field.

export interface ProductSettings {
  name: string;
  model: string;
  price: number;
  competitorPrice: number;
  vat: number;
  shiftHours: number;
  workDaysPerYear: number;
  forkRetractedMm: number;
  forkExtendedMm: number;
  extendSeconds: number;
  retractSeconds: number;
  widthMm: number;
  capacityKg: number;
  palletsPerTrip: number;
  speedEmptyKmh: number;
  speedLoadedKmh: number;
  quoteValidDays: number;
  contactEmail: string;
}

export interface KansSettings {
  A: number;
  B: number;
}

export interface WeightSettings {
  palletFlows: number;
  volume: number;
  multiDrop: number;
  growth: number;
  distance: number;
  family: number;
  dataQuality: number;
}

export interface HomeSettings {
  postcode: string;
  label: string;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
}

export interface CapSettings {
  apifyMonthUsd: number;
  claudeMonthUsd: number;
}

export interface RequalifySettings {
  seenDays: number;
  reviewGrowthPct: number;
  maxAgeDays: number;
}

export interface AppSettings {
  product: ProductSettings;
  kans: KansSettings;
  weights: WeightSettings;
  home: HomeSettings;
  caps: CapSettings;
  requalify: RequalifySettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  product: {
    name: 'Mek-Rider',
    model: 'MRTF01',
    price: 22500,
    competitorPrice: 14000,
    vat: 21,
    shiftHours: 8,
    workDaysPerYear: 230,
    forkRetractedMm: 1198,
    forkExtendedMm: 1998,
    extendSeconds: 4,
    retractSeconds: 2,
    widthMm: 785,
    capacityKg: 2000,
    palletsPerTrip: 2,
    speedEmptyKmh: 12,
    speedLoadedKmh: 10,
    quoteValidDays: 30,
    contactEmail: 'info@mek-mover.nl',
  },
  kans: { A: 75, B: 50 },
  weights: { palletFlows: 30, volume: 20, multiDrop: 15, growth: 15, distance: 10, family: 5, dataQuality: 5 },
  home: { postcode: '5705', label: 'Helmond', lat: 51.4793, lng: 5.657, serviceRadiusKm: 150 },
  caps: { apifyMonthUsd: 50, claudeMonthUsd: 50 },
  requalify: { seenDays: 30, reviewGrowthPct: 20, maxAgeDays: 90 },
};

export const WEIGHT_LABELS: Record<keyof WeightSettings, string> = {
  palletFlows: 'Verplaatst pallets tussen docks (crossdock, DC, warehouse)',
  volume: 'Palletvolume en schaal',
  multiDrop: 'Meerdere losplekken per rit (A + B)',
  growth: 'Groeisignalen',
  distance: 'Afstand tot MEK / servicegebied',
  family: 'Familiebedrijf (korte beslislijn)',
  dataQuality: 'Datakwaliteit (website, telefoon, contact)',
};

export function kansFromScore(score: number, thresholds: KansSettings): 'A' | 'B' | 'C' {
  if (score >= thresholds.A) return 'A';
  if (score >= thresholds.B) return 'B';
  return 'C';
}

export function mergeSettings(rows: { key: string; value: unknown }[]): AppSettings {
  const result = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
  for (const row of rows) {
    if (row.key in result && row.value && typeof row.value === 'object') {
      result[row.key] = { ...result[row.key], ...(row.value as Record<string, unknown>) };
    }
  }
  return result as unknown as AppSettings;
}
