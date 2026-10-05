// Hall data for the crossdock calculator ("Uw hal, uw volume"). Stored on leads.hall (jsonb).
// No path aliases here: vitest runs without a config and imports this file relatively.
// Labels live in src/i18n/messages/demo.ts (fields.<key>).
import { z } from 'zod';

export interface Hall {
  inboundToOutboundM: number; // Afstand inbound → outbound dock
  sidewaysM: number; // Zijwaartse verplaatsing tussen docks
  gapM: number; // Afstand tussen losplek A en B
  speedKmh: number; // Rijsnelheid
  loadSecondsPerPallet: number; // Laad-/lostijd per pallet
  palletsPerDay: number; // Pallets door het crossdock per dag
}

export type HallKey = keyof Hall;

export interface HallField {
  key: HallKey;
  min: number;
  max: number;
  step: number;
}

// Same ranges as the sliders in the original crossdock visualisation.
export const HALL_FIELDS: readonly HallField[] = [
  { key: 'inboundToOutboundM', min: 5, max: 200, step: 5 },
  { key: 'sidewaysM', min: 5, max: 200, step: 5 },
  { key: 'gapM', min: 0, max: 50, step: 1 },
  { key: 'speedKmh', min: 3, max: 20, step: 0.5 },
  { key: 'loadSecondsPerPallet', min: 0, max: 120, step: 5 },
  { key: 'palletsPerDay', min: 50, max: 3000, step: 50 },
];

export const HALL_FIELD = Object.fromEntries(HALL_FIELDS.map((f) => [f.key, f])) as Record<HallKey, HallField>;

export const DEFAULT_HALL: Hall = {
  inboundToOutboundM: 40,
  sidewaysM: 20,
  gapM: 10,
  speedKmh: 12,
  loadSecondsPerPallet: 30,
  palletsPerDay: 600,
};

const ranged = (f: HallField) => z.number().finite().min(f.min).max(f.max);

// Strict schema for saving (server action). Error texts are localised by the action from the issue path.
export const hallSchema = z.object({
  inboundToOutboundM: ranged(HALL_FIELD.inboundToOutboundM),
  sidewaysM: ranged(HALL_FIELD.sidewaysM),
  gapM: ranged(HALL_FIELD.gapM),
  speedKmh: ranged(HALL_FIELD.speedKmh),
  loadSecondsPerPallet: ranged(HALL_FIELD.loadSecondsPerPallet),
  palletsPerDay: ranged(HALL_FIELD.palletsPerDay).int(),
});

const looseNumber = z.coerce.number().finite();
const looseHall = z.object({
  inboundToOutboundM: looseNumber,
  sidewaysM: looseNumber,
  gapM: looseNumber,
  speedKmh: looseNumber,
  loadSecondsPerPallet: looseNumber,
  palletsPerDay: looseNumber,
});

const clamp = (v: number, f: HallField) => Math.min(f.max, Math.max(f.min, v));

// Lenient read of leads.hall: all six numbers present → clamped into the slider ranges; otherwise null.
export function parseHall(value: unknown): Hall | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = looseHall.safeParse(value);
  if (!parsed.success) return null;
  const out = { ...parsed.data };
  for (const f of HALL_FIELDS) out[f.key] = clamp(out[f.key], f);
  out.palletsPerDay = Math.round(out.palletsPerDay);
  return out;
}
