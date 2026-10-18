// Crossdock calculator: a thin wrapper around THE crossdock formula in roi/efficiency.ts.
// Relative import on purpose so vitest works without the @/ alias.
import { crossdock, type CrossdockResult } from '../roi/efficiency';
import type { Hall } from './hall';

export type { CrossdockResult };

export function calcHall(hall: Hall, shiftHours: number): CrossdockResult {
  return crossdock({ ...hall, shiftHours });
}

// Single trip inbound → losplek A (metres): D1 = afstand + zijwaarts. Used by the 2D animation.
export const oneWayM = (hall: Hall) => hall.inboundToOutboundM + hall.sidewaysM;
