import { normaliseProvince, RADIUS_TILES_FROM_KM } from '@/lib/constants';
import type { SearchFilters } from './filters';
import tilesJson from './tiles.json';

// Coverage tiles: a ~13 km grid over the Netherlands, each tagged with province and PC4 (generated from PDOK).
export interface Tile {
  lat: number;
  lng: number;
  pc4: string;
  place: string;
  province: string;
}

export const TILES = tilesJson as Tile[];
// A 10 km search radius around each tile centre covers the gaps between tiles
export const TILE_RADIUS_KM = 10;

// Kept here (not imported from lib/geo) because this file is also used in the browser
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Is this radius searched in tiles (true) or as one circle (false)?
export const radiusUsesTiles = (filters: Pick<SearchFilters, 'areaMode' | 'radiusKm'>) => filters.areaMode === 'radius' && filters.radiusKm > RADIUS_TILES_FROM_KM;

// The tiles a profile walks through. Radius profiles need the circle's centre (geocoded postcode);
// without it (in the browser) a large radius returns [] and the UI shows no tile count.
export function tilesFor(filters: Pick<SearchFilters, 'areaMode' | 'provinces' | 'radiusKm'>, center?: { lat: number; lng: number } | null): Tile[] {
  if (filters.areaMode === 'nl') return TILES;
  if (filters.areaMode === 'provinces') {
    const wanted = new Set(filters.provinces.map(normaliseProvince));
    return TILES.filter((t) => wanted.has(t.province));
  }
  if (radiusUsesTiles(filters) && center) {
    // Tile centres inside the circle; nearest first, so the first runs cover the area around the postcode
    return TILES.map((t) => ({ t, d: distanceKm(center, t) }))
      .filter((x) => x.d <= filters.radiusKm)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.t);
  }
  return [];
}

// One key per searched area, so every area keeps its own coverage cursor (search_profiles.coverage_cursors)
export function scopeKey(filters: Pick<SearchFilters, 'areaMode' | 'provinces' | 'postcode' | 'radiusKm'>): string {
  if (filters.areaMode === 'nl') return 'nl';
  if (filters.areaMode === 'provinces') return `prov:${[...filters.provinces].map(normaliseProvince).sort().join(',')}`;
  return `radius:${filters.postcode.replace(/\s/g, '').slice(0, 4)}:${filters.radiusKm}`;
}
