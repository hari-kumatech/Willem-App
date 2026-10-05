// Shared efficiency formulas (spec A.3 step 2 and A.4). Pure functions, no imports: used by
// the ROI wizard, the crossdock calculator, the quote PDF and the unit tests (parity at gap = 0).

export interface RouteInput {
  lengthM: number; // Lengte traject
  widthM: number; // Breedte traject
  speedKmh: number; // Rijsnelheid
  diagonal: boolean; // Routetype: false = rechthoekig (L+W), true = diagonaal √(L²+W²)
  includeReturn: boolean; // Inclusief retour: doubles the distance
  loadSecondsPerPallet: number; // Laad-/lostijd per pallet
  palletsPerTrip: number; // Mek-Rider pallets per rit (1–2)
}

export interface RouteResult {
  distanceM: number; // Afstand per rit
  rideSeconds: number; // Rijtijd
  cycleStandardSeconds: number; // Cyclustijd standaard EPT (1 pallet)
  cycleMekPerPalletSeconds: number; // Cyclustijd Mek-Rider per pallet
  efficiency: number; // 0–0.95, rounded to 0.1 percentage point
}

export const MAX_EFFICIENCY = 0.95;

export function routeDistance(input: Pick<RouteInput, 'lengthM' | 'widthM' | 'diagonal' | 'includeReturn'>): number {
  const base = input.diagonal ? Math.hypot(input.lengthM, input.widthM) : input.lengthM + input.widthM;
  return input.includeReturn ? base * 2 : base;
}

// efficiency = min(95%, 1 − ((t_ride + n × t_load) / n) / (t_ride + t_load)), t_ride = distance / speed
export function routeEfficiency(input: RouteInput): RouteResult {
  const distanceM = routeDistance(input);
  const speedMs = Math.max(0.1, input.speedKmh) / 3.6;
  const rideSeconds = distanceM / speedMs;
  const n = Math.max(1, Math.min(2, Math.round(input.palletsPerTrip)));
  const load = Math.max(0, input.loadSecondsPerPallet);
  const cycleStandardSeconds = rideSeconds + load;
  const cycleMekPerPalletSeconds = (rideSeconds + n * load) / n;
  const raw = cycleStandardSeconds > 0 ? 1 - cycleMekPerPalletSeconds / cycleStandardSeconds : 0;
  const efficiency = Math.round(Math.min(MAX_EFFICIENCY, Math.max(0, raw)) * 1000) / 1000;
  return { distanceM, rideSeconds, cycleStandardSeconds, cycleMekPerPalletSeconds, efficiency };
}

export interface CrossdockInput {
  inboundToOutboundM: number; // Afstand inbound → outbound dock (len)
  sidewaysM: number; // Zijwaartse verplaatsing tussen docks (wid)
  gapM: number; // Afstand tussen losplek A en B
  speedKmh: number;
  loadSecondsPerPallet: number;
  palletsPerDay: number;
  shiftHours: number;
}

export interface CrossdockResult {
  stdTripM: number;
  mekTripM: number;
  stdCycleSeconds: number; // per rit (1 pallet)
  mekCycleSeconds: number; // per rit (2 pallets)
  stdSecondsPerPallet: number;
  mekSecondsPerPallet: number;
  stdTripsPerDay: number;
  mekTripsPerDay: number;
  stdKmPerDay: number;
  mekKmPerDay: number;
  stdHoursPerDay: number;
  mekHoursPerDay: number;
  efficiency: number; // 0–1
  hoursSavedPerDay: number;
  fteSaved: number;
}

// D1 = len + wid; std_trip = 2·D1 + gap; mek_trip = 2·D1 + 2·gap;
// eff = 1 − ((mek_trip / v + 2·load) / 2) / (std_trip / v + load)
export function crossdock(input: CrossdockInput): CrossdockResult {
  const v = Math.max(0.1, input.speedKmh) / 3.6;
  const load = Math.max(0, input.loadSecondsPerPallet);
  const d1 = input.inboundToOutboundM + input.sidewaysM;
  const stdTripM = 2 * d1 + input.gapM;
  const mekTripM = 2 * d1 + 2 * input.gapM;
  const stdCycleSeconds = stdTripM / v + load;
  const mekCycleSeconds = mekTripM / v + 2 * load;
  const stdSecondsPerPallet = stdCycleSeconds;
  const mekSecondsPerPallet = mekCycleSeconds / 2;
  const efficiency = stdSecondsPerPallet > 0 ? 1 - mekSecondsPerPallet / stdSecondsPerPallet : 0;
  const pallets = Math.max(0, input.palletsPerDay);
  const stdTripsPerDay = pallets;
  const mekTripsPerDay = Math.ceil(pallets / 2);
  const stdHoursPerDay = (pallets * stdSecondsPerPallet) / 3600;
  const mekHoursPerDay = (pallets * mekSecondsPerPallet) / 3600;
  const hoursSavedPerDay = stdHoursPerDay - mekHoursPerDay;
  return {
    stdTripM,
    mekTripM,
    stdCycleSeconds,
    mekCycleSeconds,
    stdSecondsPerPallet,
    mekSecondsPerPallet,
    stdTripsPerDay,
    mekTripsPerDay,
    stdKmPerDay: (stdTripsPerDay * stdTripM) / 1000,
    mekKmPerDay: (mekTripsPerDay * mekTripM) / 1000,
    stdHoursPerDay,
    mekHoursPerDay,
    efficiency,
    hoursSavedPerDay,
    fteSaved: input.shiftHours > 0 ? hoursSavedPerDay / input.shiftHours : 0,
  };
}
