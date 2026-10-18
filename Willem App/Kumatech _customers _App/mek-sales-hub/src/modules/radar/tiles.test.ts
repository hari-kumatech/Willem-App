import { describe, expect, it } from 'vitest';
import { radiusUsesTiles, scopeKey, tilesFor, TILES } from './tiles';

const helmond = { lat: 51.48, lng: 5.66 };

describe('area tiles', () => {
  it('searches small circles as one area and large circles in tiles, nearest first', () => {
    expect(radiusUsesTiles({ areaMode: 'radius', radiusKm: 20 })).toBe(false);
    expect(radiusUsesTiles({ areaMode: 'radius', radiusKm: 100 })).toBe(true);
    const tiles = tilesFor({ areaMode: 'radius', provinces: [], radiusKm: 100 }, helmond);
    expect(tiles.length).toBeGreaterThan(20);
    expect(tiles.length).toBeLessThan(TILES.length);
    const first = tiles[0];
    const last = tiles[tiles.length - 1];
    const d = (t: { lat: number; lng: number }) => Math.hypot(t.lat - helmond.lat, (t.lng - helmond.lng) * 0.62);
    expect(d(first)).toBeLessThan(d(last));
  });
  it('covers more with a larger radius, and needs the centre for radius tiles', () => {
    const r100 = tilesFor({ areaMode: 'radius', provinces: [], radiusKm: 100 }, helmond).length;
    const r200 = tilesFor({ areaMode: 'radius', provinces: [], radiusKm: 200 }, helmond).length;
    expect(r200).toBeGreaterThan(r100);
    expect(tilesFor({ areaMode: 'radius', provinces: [], radiusKm: 100 })).toEqual([]);
  });
  it('has provinces and the whole country', () => {
    const brabant = tilesFor({ areaMode: 'provinces', provinces: ['Noord-Brabant'], radiusKm: 0 });
    expect(brabant.length).toBeGreaterThan(10);
    expect(brabant.every((t) => t.province === 'Noord-Brabant')).toBe(true);
    expect(tilesFor({ areaMode: 'nl', provinces: [], radiusKm: 0 })).toHaveLength(TILES.length);
  });
  it('gives every area its own coverage key', () => {
    expect(scopeKey({ areaMode: 'nl', provinces: [], postcode: '5705', radiusKm: 10 })).toBe('nl');
    expect(scopeKey({ areaMode: 'provinces', provinces: ['Zeeland', 'Noord-Brabant'], postcode: '', radiusKm: 0 })).toBe('prov:Noord-Brabant,Zeeland');
    expect(scopeKey({ areaMode: 'radius', provinces: [], postcode: '5705 CL', radiusKm: 100 })).toBe('radius:5705:100');
  });
});
