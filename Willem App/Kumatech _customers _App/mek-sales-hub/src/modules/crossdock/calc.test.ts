import { describe, expect, it } from 'vitest';
import { calcHall } from './calc';
import { DEFAULT_HALL, parseHall, hallSchema } from './hall';
import { routeEfficiency } from '../roi/efficiency';

describe('crossdock calculator', () => {
  it('defaults give 26,1% / 3,0 h / 0,38 FTE on an 8-hour shift', () => {
    const r = calcHall(DEFAULT_HALL, 8);
    expect(Math.round(r.efficiency * 1000) / 10).toBe(26.1);
    expect(r.hoursSavedPerDay).toBeCloseTo(3.0, 6);
    expect(r.fteSaved).toBeCloseTo(0.375, 6);
    expect(r.fteSaved.toFixed(2)).toBe('0.38');
    expect(r.stdCycleSeconds).toBeCloseTo(69, 6);
    expect(r.mekCycleSeconds).toBeCloseTo(102, 6);
    expect(r.stdTripsPerDay).toBe(600);
    expect(r.mekTripsPerDay).toBe(300);
  });

  it('gap 0 matches routeEfficiency (rectangular, with return, 2 pallets per trip)', () => {
    const cases = [
      DEFAULT_HALL,
      { ...DEFAULT_HALL, inboundToOutboundM: 5, sidewaysM: 5, speedKmh: 3, loadSecondsPerPallet: 0 },
      { ...DEFAULT_HALL, inboundToOutboundM: 200, sidewaysM: 200, speedKmh: 20, loadSecondsPerPallet: 120 },
      { ...DEFAULT_HALL, inboundToOutboundM: 75, sidewaysM: 35, speedKmh: 9.5, loadSecondsPerPallet: 45 },
    ];
    for (const hall of cases) {
      const cd = calcHall({ ...hall, gapM: 0 }, 8);
      const route = routeEfficiency({
        lengthM: hall.inboundToOutboundM,
        widthM: hall.sidewaysM,
        speedKmh: hall.speedKmh,
        diagonal: false,
        includeReturn: true,
        loadSecondsPerPallet: hall.loadSecondsPerPallet,
        palletsPerTrip: 2,
      });
      expect(Math.round(cd.efficiency * 1000) / 1000).toBe(route.efficiency);
      expect(cd.stdCycleSeconds).toBeCloseTo(route.cycleStandardSeconds, 9);
      expect(cd.mekSecondsPerPallet).toBeCloseTo(route.cycleMekPerPalletSeconds, 9);
    }
  });
});

describe('hall parsing', () => {
  it('accepts the defaults and rejects out-of-range values', () => {
    expect(hallSchema.safeParse(DEFAULT_HALL).success).toBe(true);
    expect(hallSchema.safeParse({ ...DEFAULT_HALL, gapM: 51 }).success).toBe(false);
    expect(hallSchema.safeParse({ ...DEFAULT_HALL, palletsPerDay: 10 }).success).toBe(false);
  });

  it('reads leads.hall leniently and clamps into the slider ranges', () => {
    expect(parseHall(null)).toBeNull();
    expect(parseHall({ inboundToOutboundM: 40 })).toBeNull();
    expect(parseHall({ ...DEFAULT_HALL, gapM: 80, speedKmh: '10' })).toEqual({ ...DEFAULT_HALL, gapM: 50, speedKmh: 10 });
  });
});
