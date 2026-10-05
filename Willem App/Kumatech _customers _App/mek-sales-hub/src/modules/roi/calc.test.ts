import { describe, expect, it } from 'vitest';
import {
  computeRoi,
  computeSavings,
  defaultInputs,
  monthlyAnnuity,
  quoteLine,
  quoteTotalExcl,
  roiInputsSchema,
  summarize,
  type RoiInputs,
  type RoiSettings,
} from './calc';
import { crossdock, routeEfficiency } from './efficiency';

const SETTINGS: RoiSettings = {
  productName: 'Mek-Rider',
  price: 22500,
  competitorPrice: 14000,
  vat: 21,
  shiftHours: 8,
  workDaysPerYear: 230,
  quoteValidDays: 30,
  contactEmail: 'info@mek-mover.nl',
  palletsPerTrip: 2,
  speedKmh: 12,
};

const base = (): RoiInputs => defaultInputs(SETTINGS);

describe('computeRoi with defaults', () => {
  const r = computeRoi(base());

  it('efficiency is 18.8%', () => {
    expect(r.efficiency).toBe(0.188);
    expect(r.route.distanceM).toBe(60);
    expect(r.route.rideSeconds).toBeCloseTo(18, 6);
    expect(r.route.cycleStandardSeconds).toBeCloseTo(48, 6);
    expect(r.route.cycleMekPerPalletSeconds).toBeCloseTo(39, 6);
  });

  it('savings are € 8.460 per year (same as the old app)', () => {
    expect(r.savings.perYear).toBeCloseTo(8460, 6);
    expect(r.savings.perMonth).toBeCloseTo(705, 6);
    expect(r.koop.savings5y).toBeCloseTo(42300, 6);
  });

  it('payback of the extra cost is ~12 months, full purchase ~32 months', () => {
    expect(r.koop.priceDiff).toBe(8500);
    expect(r.koop.paybackExtraMonths).toBeCloseTo(8500 / 705, 6);
    expect(Math.round(r.koop.paybackExtraMonths)).toBe(12);
    expect(Math.round(r.koop.paybackFullMonths)).toBe(32);
  });
});

describe('savings model', () => {
  it('scales with operating hours across shifts, capped at 24 h', () => {
    const s = (hoursPerDay: number, shifts: number) =>
      computeSavings({ wage: 45000, usagePct: 100, hoursPerDay, shifts, workDays: 230, shiftHours: 8 }, 0.188).perYear;
    expect(s(8, 2)).toBeCloseTo(16920, 6);
    expect(s(8, 3)).toBeCloseTo(25380, 6);
    expect(s(12, 3)).toBeCloseTo(s(8, 3), 6); // 36 h → capped at 24 h
  });

  it('working days do not change savings when wage is a full FTE-year (rate cancels out)', () => {
    const a = computeSavings({ wage: 45000, usagePct: 50, hoursPerDay: 8, shifts: 1, workDays: 200, shiftHours: 8 }, 0.2);
    expect(a.perYear).toBeCloseTo(4500, 6);
    expect(a.hoursSavedPerYear).toBeCloseTo(8 * 0.5 * 0.2 * 200, 6);
    expect(a.fteSaved).toBeCloseTo(0.1, 6);
  });
});

describe('lease', () => {
  it('annuity matches the known value (22.500, 6%, 60 mnd ≈ € 434,99)', () => {
    expect(monthlyAnnuity(22500, 6, 60)).toBeCloseTo(434.988, 3);
    expect(monthlyAnnuity(12000, 0, 12)).toBe(1000);
  });

  it('defaults: net and totals on the full lease amount', () => {
    const r = computeRoi(base());
    expect(r.lease.effectiveMonthly).toBeCloseTo(r.lease.monthly, 9);
    expect(r.lease.net).toBeCloseTo(705 - r.lease.monthly, 6);
    expect(r.lease.net).toBeGreaterThan(0); // "Direct positief"
    expect(r.lease.totalCost).toBeCloseTo(r.lease.monthly * 60, 6);
  });

  it('difference option changes net and total cost consistently', () => {
    const input = base();
    input.lease.useDifference = true;
    input.lease.competitorMonthly = 300;
    const r = computeRoi(input);
    const diff = r.lease.monthly - 300;
    expect(diff).toBeGreaterThan(0);
    expect(r.lease.totalCost).toBeLessThan(computeRoi(base()).lease.totalCost);
    expect(r.lease.diff).toBeCloseTo(diff, 6);
    expect(r.lease.effectiveMonthly).toBeCloseTo(diff, 6);
    expect(r.lease.net).toBeCloseTo(705 - diff, 6);
    expect(r.lease.totalCost).toBeCloseTo(diff * 60, 6);
    expect(r.lease.totalCostFull).toBeCloseTo(r.lease.monthly * 60, 6);
    // the quote PDF uses the same basis for the net benefit
    expect(quoteLine(r, 'lease', 2, 21).netMonth).toBeCloseTo(r.lease.net * 2, 6);
    // and the stored summary too
    expect(summarize(r).lease.totalCost).toBeCloseTo(diff * 60, 1);
  });

  it('difference option is never negative (competitor lease higher than ours)', () => {
    const input = base();
    input.lease.useDifference = true; // default competitor € 500 > € 434,99
    const r = computeRoi(input);
    expect(r.lease.diff).toBe(0);
    expect(r.lease.totalCost).toBe(0);
    expect(r.lease.net).toBeCloseTo(705, 6);
  });
});

describe('As a Service', () => {
  it('internal margin: depreciation, opex and margin', () => {
    const r = computeRoi(base());
    // residual 20% of 22.500 = 4.500; depreciation (22.500 − 4.500) / 60 = 300; opex 1.000 / 12 = 83,33
    expect(r.margin.residualValue).toBe(4500);
    expect(r.margin.depreciationMonthly).toBe(300);
    expect(r.margin.opexMonthly).toBeCloseTo(83.333, 3);
    expect(r.margin.marginMonthly).toBeCloseTo(800 - 383.333, 3);
    expect(r.margin.marginPct).toBeCloseTo((416.667 / 800) * 100, 2);
    expect(r.margin.marginTotal).toBeCloseTo(416.667 * 60, 1);
    expect(r.aas.net).toBeCloseTo(705 - 800, 6);
    expect(r.aas.totalCost).toBe(48000);
  });

  it('summary never contains margin figures', () => {
    const json = JSON.stringify(summarize(computeRoi(base())));
    expect(json).not.toMatch(/margin|depreciation|residual|opex/i);
  });
});

describe('quotes', () => {
  it('quote lines and totals excl. VAT', () => {
    const r = computeRoi(base());
    const koop = quoteLine(r, 'koop', 3, 21);
    expect(koop.subtotal).toBe(67500);
    expect(koop.vat).toBeCloseTo(14175, 6);
    expect(koop.total).toBeCloseTo(81675, 6);
    expect(quoteTotalExcl(r, 'koop', 3, 21)).toBe(67500);
    expect(quoteTotalExcl(r, 'alle', 1, 21)).toBe(22500);
    expect(quoteTotalExcl(r, 'aas', 2, 21)).toBe(800 * 2 * 60);
  });

  it('default inputs pass the schema', () => {
    expect(roiInputsSchema.safeParse(base()).success).toBe(true);
  });
});

describe('parity with the crossdock calculator', () => {
  it('crossdock() at gap 0 equals routeEfficiency (rectangular, with return, n = 2)', () => {
    for (const [len, wid, speed, load] of [
      [40, 20, 12, 30],
      [80, 10, 8, 15],
      [25, 25, 6.5, 0],
      [150, 60, 18, 90],
    ]) {
      const cd = crossdock({ inboundToOutboundM: len, sidewaysM: wid, gapM: 0, speedKmh: speed, loadSecondsPerPallet: load, palletsPerDay: 100, shiftHours: 8 });
      const re = routeEfficiency({
        lengthM: len,
        widthM: wid,
        speedKmh: speed,
        diagonal: false,
        includeReturn: true,
        loadSecondsPerPallet: load,
        palletsPerTrip: 2,
      });
      // routeEfficiency rounds to 0.1 pp; compare at that precision
      expect(re.efficiency).toBeCloseTo(Math.round(cd.efficiency * 1000) / 1000, 9);
      expect(re.cycleStandardSeconds).toBeCloseTo(cd.stdSecondsPerPallet, 9);
      expect(re.cycleMekPerPalletSeconds).toBeCloseTo(cd.mekSecondsPerPallet, 9);
    }
  });
});
