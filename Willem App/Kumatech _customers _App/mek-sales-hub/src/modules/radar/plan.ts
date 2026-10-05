import 'server-only';
import { geocodePostcode, type GeoPoint } from '@/lib/geo';
import { normaliseProvince } from '@/lib/constants';
import type { SearchFilters } from './filters';
import { tilesFor, TILE_RADIUS_KM, type Tile } from './tiles';

export interface Area {
  postcode: string;
  label: string;
  lat: number;
  lng: number;
  radiusKm: number;
  province?: string;
}

export interface PlanEntry {
  term: string;
  area: Area;
}

export interface SearchPlan {
  entries: PlanEntry[];
  areas: Area[];
  origin: GeoPoint | null;
  maxDistanceKm: number | null;
  provinces: string[];
  nextCursor: number;
  wrapped: boolean;
  tilesTotal: number;
}

// code + optional parameter; the caller translates it
export class PlanError extends Error {
  constructor(public code: 'noTerms' | 'noArea' | 'postcodeNotFound', public param = '') {
    super(code);
  }
}

// Turns a profile into (search term × area) pairs (B.7 step 1).
// Radius profiles search one area; province and whole-country profiles walk the coverage tiles with a cursor.
export async function buildPlan(filters: SearchFilters, coverageCursor: number): Promise<SearchPlan> {
  const terms = [...new Set(filters.terms.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (!terms.length) throw new PlanError('noTerms');

  if (filters.areaMode === 'radius') {
    const geo = await geocodePostcode(filters.postcode);
    if (!geo) throw new PlanError('postcodeNotFound', filters.postcode);
    const area: Area = {
      postcode: filters.postcode.replace(/\s/g, '').toUpperCase(),
      label: geo.city || geo.label,
      lat: geo.lat,
      lng: geo.lng,
      radiusKm: filters.radiusKm,
      province: geo.province,
    };
    return {
      entries: terms.map((term) => ({ term, area })),
      areas: [area],
      origin: { lat: geo.lat, lng: geo.lng },
      maxDistanceKm: filters.radiusKm,
      provinces: [],
      nextCursor: 0,
      wrapped: false,
      tilesTotal: 1,
    };
  }

  const tiles = tilesFor(filters);
  if (!tiles.length) throw new PlanError('noArea');
  const start = coverageCursor % tiles.length;
  const count = Math.min(filters.tilesPerRun, tiles.length);
  const picked: Tile[] = [];
  for (let i = 0; i < count; i++) picked.push(tiles[(start + i) % tiles.length]);
  const nextCursor = start + count;
  const areas: Area[] = picked.map((t) => ({
    postcode: t.pc4,
    label: t.place,
    lat: t.lat,
    lng: t.lng,
    radiusKm: TILE_RADIUS_KM,
    province: t.province,
  }));

  return {
    entries: areas.flatMap((area) => terms.map((term) => ({ term, area }))),
    areas,
    origin: null,
    maxDistanceKm: null,
    provinces: filters.areaMode === 'provinces' ? filters.provinces.map(normaliseProvince) : [],
    nextCursor: nextCursor >= tiles.length ? 0 : nextCursor,
    wrapped: nextCursor >= tiles.length,
    tilesTotal: tiles.length,
  };
}
