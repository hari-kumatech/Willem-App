// ROI calculation for the Mek-Rider (spec A.3). ONE pure module (only ./efficiency and zod):
// the wizard screens, the comparison table, the quote PDF, the comparison PDF, the server action
// (which recomputes before saving) and the unit tests all call computeRoi(), so figures never disagree.

import { z } from 'zod';
import { routeEfficiency, type RouteInput, type RouteResult } from './efficiency';

export type CostModel = 'koop' | 'lease' | 'aas';
export type QuoteModel = CostModel | 'alle';

export const QUOTE_MODELS = ['koop', 'lease', 'aas', 'alle'] as const satisfies readonly QuoteModel[];

export interface LeaseInput {
  termMonths: number; // Leasetermijn (12–84)
  ratePct: number; // Lease rente per jaar (1–15)
  competitorMonthly: number; // Leasebedrag concurrent per maand (0–3.000)
  // Payback/net/total cost on the DIFFERENCE with the competitor's lease instead of the full lease.
  // Applied everywhere: step 3, comparison table, both PDFs.
  useDifference: boolean;
}

export interface AasInput {
  termMonths: number; // Contractduur (12–84)
  monthlyFee: number; // Maandtarief all-in (300–1.500)
  truckCostsYear: number; // Truckkosten (onderhoud e.d.) per jaar (200–3.000), MEK's own cost
  residualPct: number; // Restwaarde na contract in % van de aanschafwaarde (0–50)
}

export interface RoiInputs {
  route: RouteInput;
  price: number; // Aanschafwaarde EPT (Mek-Rider)
  competitorPrice: number; // Prijs concurrerende standaard-EPT
  wage: number; // Jaarkosten medewerker (beladen), per FTE-jaar
  usagePct: number; // Inzet op pallettransport (10–100)
  hoursPerDay: number; // Bedrijfsuren per dag per ploeg (1–24)
  shifts: number; // Ploegen per dag (1–3)
  workDays: number; // Werkdagen per jaar
  shiftHours: number; // Length of one FTE working day (settings.product.shiftHours, normally 8)
  lease: LeaseInput;
  aas: AasInput;
}

export interface SavingsResult {
  operatingHoursPerDay: number; // min(24, hoursPerDay × shifts)
  hoursSavedPerYear: number; // FTE-equivalent hours saved per year
  hourlyCost: number; // wage / (shiftHours × workDays)
  fteSaved: number; // hoursSavedPerYear / (shiftHours × workDays)
  perYear: number;
  perMonth: number;
}

export interface KoopResult {
  price: number;
  competitorPrice: number;
  priceDiff: number; // max(price − competitor, 0)
  paybackExtraMonths: number; // Infinity when there are no savings
  paybackFullMonths: number;
  savings5y: number;
  totalCost: number; // one-off purchase
}

export interface LeaseResult {
  termMonths: number;
  ratePct: number;
  monthly: number; // annuity P·r / (1 − (1+r)^−n)
  competitorMonthly: number;
  diff: number; // max(monthly − competitor, 0)
  useDifference: boolean;
  effectiveMonthly: number; // diff when useDifference, otherwise monthly
  net: number; // savings/month − effectiveMonthly
  totalCostFull: number; // monthly × term (what the customer pays MEK)
  totalCost: number; // effectiveMonthly × term (basis chosen by useDifference)
}

export interface AasResult {
  termMonths: number;
  fee: number;
  net: number; // savings/month − fee
  totalCost: number; // fee × term
}

// INTERNAL ONLY (MEK margin). Never shown in presentation mode, never in a customer PDF, never stored.
export interface MarginResult {
  residualValue: number;
  depreciationMonthly: number; // (price − residual) / term
  opexMonthly: number; // truck costs / 12
  costMonthly: number;
  marginMonthly: number; // fee − (depreciation + opex)
  marginPct: number; // margin / fee × 100
  marginTotal: number; // margin × term
}

export interface RoiResult {
  route: RouteResult;
  efficiency: number; // 0–0.95 (rounded to 0.1 pp, from routeEfficiency)
  savings: SavingsResult;
  koop: KoopResult;
  lease: LeaseResult;
  aas: AasResult;
  margin: MarginResult;
}

const finite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, finite(n, min)));

// Monthly annuity payment: P·r / (1 − (1+r)^−n), r = annual rate / 12
export function monthlyAnnuity(principal: number, annualRatePct: number, termMonths: number): number {
  const n = Math.max(1, termMonths);
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/*
 * Labour savings (replaces the old "wage × eff × usage × (hours / 8)" model):
 *
 *   operatingHours/day   = min(24, hoursPerDay × shifts)
 *   FTE-hours saved/yr   = operatingHours/day × usage × efficiency × workDays
 *   hourly labour cost   = wage / (shiftHours × workDays)      ← wage is per FTE-year of shiftHours-hour days
 *   savings/yr           = FTE-hours saved/yr × hourly labour cost
 *
 * With defaults (8 h, 1 shift, 100 %, 230 days, shiftHours 8) this collapses to wage × efficiency:
 * 45.000 × 0,188 = € 8.460 per year, identical to the old app.
 */
export function computeSavings(input: Pick<RoiInputs, 'wage' | 'usagePct' | 'hoursPerDay' | 'shifts' | 'workDays' | 'shiftHours'>, efficiency: number): SavingsResult {
  const shifts = clamp(Math.round(input.shifts), 1, 3);
  const operatingHoursPerDay = clamp(input.hoursPerDay * shifts, 0, 24);
  const usage = clamp(input.usagePct, 0, 100) / 100;
  const workDays = clamp(input.workDays, 1, 366);
  const shiftHours = clamp(input.shiftHours, 1, 24);
  const hoursSavedPerYear = operatingHoursPerDay * usage * efficiency * workDays;
  const fteHoursPerYear = shiftHours * workDays;
  const hourlyCost = Math.max(0, finite(input.wage)) / fteHoursPerYear;
  const perYear = hoursSavedPerYear * hourlyCost;
  return {
    operatingHoursPerDay,
    hoursSavedPerYear,
    hourlyCost,
    fteSaved: hoursSavedPerYear / fteHoursPerYear,
    perYear,
    perMonth: perYear / 12,
  };
}

export function computeRoi(input: RoiInputs): RoiResult {
  const route = routeEfficiency(input.route);
  const efficiency = route.efficiency;
  const savings = computeSavings(input, efficiency);
  const monthlySavings = savings.perMonth;

  const price = Math.max(0, finite(input.price));
  const competitorPrice = Math.max(0, finite(input.competitorPrice));
  const priceDiff = Math.max(price - competitorPrice, 0);
  const koop: KoopResult = {
    price,
    competitorPrice,
    priceDiff,
    paybackExtraMonths: monthlySavings > 0 ? priceDiff / monthlySavings : Infinity,
    paybackFullMonths: monthlySavings > 0 ? price / monthlySavings : Infinity,
    savings5y: savings.perYear * 5,
    totalCost: price,
  };

  const leaseTerm = Math.max(1, Math.round(finite(input.lease.termMonths, 60)));
  const leaseMonthly = monthlyAnnuity(price, finite(input.lease.ratePct), leaseTerm);
  const competitorMonthly = Math.max(0, finite(input.lease.competitorMonthly));
  const leaseDiff = Math.max(leaseMonthly - competitorMonthly, 0);
  const effectiveMonthly = input.lease.useDifference ? leaseDiff : leaseMonthly;
  const lease: LeaseResult = {
    termMonths: leaseTerm,
    ratePct: finite(input.lease.ratePct),
    monthly: leaseMonthly,
    competitorMonthly,
    diff: leaseDiff,
    useDifference: Boolean(input.lease.useDifference),
    effectiveMonthly,
    net: monthlySavings - effectiveMonthly,
    totalCostFull: leaseMonthly * leaseTerm,
    totalCost: effectiveMonthly * leaseTerm,
  };

  const aasTerm = Math.max(1, Math.round(finite(input.aas.termMonths, 60)));
  const fee = Math.max(0, finite(input.aas.monthlyFee));
  const aas: AasResult = { termMonths: aasTerm, fee, net: monthlySavings - fee, totalCost: fee * aasTerm };

  const residualValue = price * (clamp(input.aas.residualPct, 0, 100) / 100);
  const depreciationMonthly = (price - residualValue) / aasTerm;
  const opexMonthly = Math.max(0, finite(input.aas.truckCostsYear)) / 12;
  const costMonthly = depreciationMonthly + opexMonthly;
  const marginMonthly = fee - costMonthly;
  const margin: MarginResult = {
    residualValue,
    depreciationMonthly,
    opexMonthly,
    costMonthly,
    marginMonthly,
    marginPct: fee > 0 ? (marginMonthly / fee) * 100 : 0,
    marginTotal: marginMonthly * aasTerm,
  };

  return { route, efficiency, savings, koop, lease, aas, margin };
}

// ---------------------------------------------------------------------------
// Charts (data only; the SVG components draw it)
// ---------------------------------------------------------------------------

export interface ChartPoint {
  month: number;
  value: number;
}

export const KOOP_CHART_MONTHS = 36;

export function cumulativeSeries(perMonth: number, months: number): ChartPoint[] {
  return Array.from({ length: months + 1 }, (_, m) => ({ month: m, value: perMonth * m }));
}

// Recurring models: cumulative net result over max(term, 12) months
export function recurringChartMonths(term: number): number {
  return Math.max(Math.round(term), 12);
}

// ---------------------------------------------------------------------------
// Quotes: the same lines for the PDF, the saved row (total_excl) and the lead value
// ---------------------------------------------------------------------------

export interface QuoteLine {
  model: CostModel;
  recurring: boolean; // per month
  unit: number; // per truck, excl. VAT
  subtotal: number; // × trucks, excl. VAT (per month for lease/aas)
  vat: number;
  total: number; // incl. VAT
  termMonths: number | null;
  contractTotal: number; // subtotal over the full term (= subtotal for koop)
  savingsMonth: number; // indicative customer savings per month for all trucks
  netMonth: number | null; // indicative net result per month (lease uses the same basis as step 3)
}

export function quoteLine(result: RoiResult, model: CostModel, trucks: number, vatPct: number): QuoteLine {
  const qty = Math.max(1, Math.round(trucks));
  const vatRate = vatPct / 100;
  const savingsMonth = result.savings.perMonth * qty;
  let unit: number;
  let termMonths: number | null = null;
  let netMonth: number | null = null;
  if (model === 'koop') {
    unit = result.koop.price;
  } else if (model === 'lease') {
    unit = result.lease.monthly;
    termMonths = result.lease.termMonths;
    netMonth = result.lease.net * qty;
  } else {
    unit = result.aas.fee;
    termMonths = result.aas.termMonths;
    netMonth = result.aas.net * qty;
  }
  const subtotal = unit * qty;
  const vat = subtotal * vatRate;
  return {
    model,
    recurring: model !== 'koop',
    unit,
    subtotal,
    vat,
    total: subtotal + vat,
    termMonths,
    contractTotal: termMonths ? subtotal * termMonths : subtotal,
    savingsMonth,
    netMonth,
  };
}

export function quoteModels(model: QuoteModel): CostModel[] {
  return model === 'alle' ? ['koop', 'lease', 'aas'] : [model];
}

// Quote value excl. VAT (stored as quotes.total_excl and used for leads.waarde):
// koop = price × trucks; lease/aas = monthly amount × trucks × term (contract value);
// 'alle' = the purchase (koop) value, the reference price of the offer.
export function quoteTotalExcl(result: RoiResult, model: QuoteModel, trucks: number, vatPct: number): number {
  const line = quoteLine(result, model === 'alle' ? 'koop' : model, trucks, vatPct);
  return Math.round(line.contractTotal * 100) / 100;
}

// Summary stored in quotes.results. Deliberately WITHOUT the internal margin figures.
export function summarize(result: RoiResult) {
  const fin = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
  return {
    efficiency: result.efficiency,
    savingsPerYear: fin(result.savings.perYear),
    savingsPerMonth: fin(result.savings.perMonth),
    hoursSavedPerYear: fin(result.savings.hoursSavedPerYear),
    koop: {
      price: fin(result.koop.price),
      priceDiff: fin(result.koop.priceDiff),
      paybackExtraMonths: fin(result.koop.paybackExtraMonths),
      paybackFullMonths: fin(result.koop.paybackFullMonths),
    },
    lease: {
      monthly: fin(result.lease.monthly),
      effectiveMonthly: fin(result.lease.effectiveMonthly),
      net: fin(result.lease.net),
      totalCost: fin(result.lease.totalCost),
      useDifference: result.lease.useDifference,
    },
    aas: { fee: fin(result.aas.fee), net: fin(result.aas.net), totalCost: fin(result.aas.totalCost) },
  };
}

export type RoiSummary = ReturnType<typeof summarize>;

// Settings the wizard needs (from loadSettings(), passed by the server page)
export interface RoiSettings {
  productName: string;
  price: number;
  competitorPrice: number;
  vat: number;
  shiftHours: number;
  workDaysPerYear: number;
  quoteValidDays: number;
  contactEmail: string;
  palletsPerTrip: number;
  speedKmh: number;
}

export function defaultInputs(s: RoiSettings): RoiInputs {
  return {
    route: {
      lengthM: 40,
      widthM: 20,
      speedKmh: s.speedKmh,
      diagonal: false,
      includeReturn: false,
      loadSecondsPerPallet: 30,
      palletsPerTrip: Math.max(1, Math.min(2, s.palletsPerTrip)),
    },
    price: s.price,
    competitorPrice: s.competitorPrice,
    wage: 45000,
    usagePct: 100,
    hoursPerDay: s.shiftHours,
    shifts: 1,
    workDays: s.workDaysPerYear,
    shiftHours: s.shiftHours,
    lease: { termMonths: 60, ratePct: 6, competitorMonthly: 500, useDifference: false },
    aas: { termMonths: 60, monthlyFee: 800, truckCostsYear: 1000, residualPct: 20 },
  };
}

// ---------------------------------------------------------------------------
// Validation of a full input object (server action + re-generating a stored quote)
// ---------------------------------------------------------------------------

const n = (min: number, max: number) => z.number().finite().min(min).max(max);

export const roiInputsSchema = z.object({
  route: z.object({
    lengthM: n(1, 1000),
    widthM: n(0, 1000),
    speedKmh: n(0.5, 40),
    diagonal: z.boolean(),
    includeReturn: z.boolean(),
    loadSecondsPerPallet: n(0, 600),
    palletsPerTrip: n(1, 2),
  }),
  price: n(0, 1_000_000),
  competitorPrice: n(0, 1_000_000),
  wage: n(0, 500_000),
  usagePct: n(0, 100),
  hoursPerDay: n(0, 24),
  shifts: n(1, 3),
  workDays: n(1, 366),
  shiftHours: n(1, 24),
  lease: z.object({
    termMonths: n(1, 240),
    ratePct: n(0, 50),
    competitorMonthly: n(0, 100_000),
    useDifference: z.boolean(),
  }),
  aas: z.object({
    termMonths: n(1, 240),
    monthlyFee: n(0, 100_000),
    truckCostsYear: n(0, 100_000),
    residualPct: n(0, 100),
  }),
}) satisfies z.ZodType<RoiInputs>;

export const customerSchema = z.object({
  naam: z.string().trim().max(200).default(''),
  bedrijf: z.string().trim().max(200).default(''),
  email: z.string().trim().max(200).refine((v) => v.includes('@'), 'email'),
  telefoon: z.string().trim().max(50).default(''),
  // UI language when the quote was made, so "PDF opnieuw" reproduces the PDF in the same language
  lang: z.enum(['nl', 'en']).default('nl'),
});

export type Customer = z.infer<typeof customerSchema>;
