import { normaliseProvince } from '@/lib/constants';
import { pc4Of } from '@/lib/text';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface PdokResult extends GeoPoint {
  postcode: string;
  city: string;
  gemeente: string;
  province: string;
  label: string;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// "POINT(5.6570 51.4793)" → { lat, lng }
function parsePoint(wkt: string | undefined): GeoPoint | null {
  const match = wkt?.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
  return match ? { lng: Number(match[1]), lat: Number(match[2]) } : null;
}

const PDOK = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const cache = new Map<string, PdokResult | null>();

interface PdokDoc {
  centroide_ll?: string;
  postcode?: string;
  woonplaatsnaam?: string;
  gemeentenaam?: string;
  provincienaam?: string;
  weergavenaam?: string;
}

async function pdokQuery(q: string, fq?: string): Promise<PdokResult | null> {
  const key = `${q}|${fq ?? ''}`;
  if (cache.has(key)) return cache.get(key)!;
  const params = new URLSearchParams({ q, rows: '1', fl: 'centroide_ll,postcode,woonplaatsnaam,gemeentenaam,provincienaam,weergavenaam' });
  if (fq) params.set('fq', fq);
  try {
    const response = await fetch(`${PDOK}?${params}`, { signal: AbortSignal.timeout(8000), cache: 'force-cache' });
    if (!response.ok) return null;
    const json = (await response.json()) as { response?: { docs?: PdokDoc[] } };
    const doc = json.response?.docs?.[0];
    const point = parsePoint(doc?.centroide_ll);
    const result: PdokResult | null =
      doc && point
        ? {
            ...point,
            postcode: doc.postcode ?? '',
            city: doc.woonplaatsnaam ?? '',
            gemeente: doc.gemeentenaam ?? '',
            province: normaliseProvince(doc.provincienaam),
            label: doc.weergavenaam ?? q,
          }
        : null;
    if (cache.size > 5000) cache.clear();
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

// Postcode (PC4 or PC6) → centroid, municipality and province via the free PDOK Locatieserver
export async function geocodePostcode(postcode: string): Promise<PdokResult | null> {
  const compact = postcode.replace(/\s/g, '').toUpperCase();
  if (/^\d{4}[A-Z]{2}$/.test(compact)) {
    return (await pdokQuery(compact, 'type:postcode')) ?? (await pdokQuery(compact.slice(0, 4), 'type:woonplaats OR type:postcode'));
  }
  if (/^\d{4}$/.test(compact)) {
    return (await pdokQuery(`postcode:${compact}*`, 'type:postcode')) ?? (await pdokQuery(compact));
  }
  return null;
}

// Coordinates → province + municipality (reverse lookup), used when a scraped place has lat/lng but no postcode
export async function reverseGeocode(point: GeoPoint): Promise<PdokResult | null> {
  const key = `rev|${point.lat.toFixed(4)}|${point.lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key)!;
  const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lng), rows: '1', type: 'adres', fl: 'centroide_ll,postcode,woonplaatsnaam,gemeentenaam,provincienaam,weergavenaam' });
  try {
    const response = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const json = (await response.json()) as { response?: { docs?: PdokDoc[] } };
    const doc = json.response?.docs?.[0];
    const result: PdokResult | null = doc
      ? {
          ...point,
          postcode: doc.postcode ?? '',
          city: doc.woonplaatsnaam ?? '',
          gemeente: doc.gemeentenaam ?? '',
          province: normaliseProvince(doc.provincienaam),
          label: doc.weergavenaam ?? '',
        }
      : null;
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

// Offline fallback when PDOK is unreachable: approximate PC4 ranges (as in Leads Nederland, A.6)
const RANGES: [number, number, string][] = [
  [1000, 1299, 'Noord-Holland'], [1300, 1379, 'Flevoland'], [1380, 1384, 'Noord-Holland'], [1390, 1393, 'Utrecht'],
  [1394, 1394, 'Noord-Holland'], [1396, 1396, 'Utrecht'], [1398, 1425, 'Noord-Holland'], [1426, 1427, 'Utrecht'],
  [1428, 1429, 'Zuid-Holland'], [1430, 2158, 'Noord-Holland'], [2159, 2164, 'Zuid-Holland'], [2165, 2165, 'Noord-Holland'],
  [2166, 3381, 'Zuid-Holland'], [3382, 3464, 'Utrecht'], [3465, 3466, 'Zuid-Holland'], [3467, 3769, 'Utrecht'],
  [3770, 3794, 'Gelderland'], [3795, 3836, 'Utrecht'], [3837, 3888, 'Gelderland'], [3890, 3899, 'Flevoland'],
  [3900, 3924, 'Utrecht'], [3925, 3925, 'Gelderland'], [3926, 3999, 'Utrecht'], [4000, 4119, 'Gelderland'],
  [4120, 4125, 'Utrecht'], [4126, 4129, 'Zuid-Holland'], [4130, 4139, 'Utrecht'], [4140, 4146, 'Zuid-Holland'],
  [4147, 4162, 'Gelderland'], [4163, 4169, 'Zuid-Holland'], [4170, 4199, 'Gelderland'], [4200, 4209, 'Zuid-Holland'],
  [4211, 4212, 'Gelderland'], [4213, 4213, 'Zuid-Holland'], [4214, 4219, 'Gelderland'], [4220, 4249, 'Zuid-Holland'],
  [4250, 4299, 'Noord-Brabant'], [4300, 4599, 'Zeeland'], [4600, 4671, 'Noord-Brabant'], [4672, 4679, 'Zeeland'],
  [4680, 4681, 'Noord-Brabant'], [4682, 4699, 'Zeeland'], [4700, 5299, 'Noord-Brabant'], [5300, 5335, 'Gelderland'],
  [5340, 5765, 'Noord-Brabant'], [5766, 5817, 'Limburg'], [5820, 5846, 'Noord-Brabant'], [5850, 6599, 'Limburg'],
  [6600, 7399, 'Gelderland'], [7400, 7739, 'Overijssel'], [7740, 7766, 'Drenthe'], [7767, 7799, 'Overijssel'],
  [7800, 7949, 'Drenthe'], [7950, 7955, 'Overijssel'], [7956, 7999, 'Drenthe'], [8000, 8049, 'Overijssel'],
  [8050, 8054, 'Gelderland'], [8055, 8069, 'Overijssel'], [8070, 8099, 'Gelderland'], [8100, 8159, 'Overijssel'],
  [8160, 8199, 'Gelderland'], [8200, 8259, 'Flevoland'], [8260, 8299, 'Overijssel'], [8300, 8322, 'Flevoland'],
  [8323, 8349, 'Overijssel'], [8350, 8354, 'Drenthe'], [8355, 8379, 'Overijssel'], [8380, 8387, 'Drenthe'],
  [8388, 9299, 'Fryslân'], [9300, 9349, 'Drenthe'], [9350, 9399, 'Groningen'], [9400, 9499, 'Drenthe'],
  [9500, 9999, 'Groningen'],
];

export function provinceFromPostcode(postcode: string): string {
  const pc = Number(pc4Of(postcode));
  if (!pc) return '';
  return RANGES.find(([from, to]) => pc >= from && pc <= to)?.[2] ?? '';
}
