import { normaliseProvince } from '@/lib/constants';
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

export function tilesFor(filters: Pick<SearchFilters, 'areaMode' | 'provinces'>): Tile[] {
  if (filters.areaMode === 'nl') return TILES;
  if (filters.areaMode === 'provinces') {
    const wanted = new Set(filters.provinces.map(normaliseProvince));
    return TILES.filter((t) => wanted.has(t.province));
  }
  return [];
}
