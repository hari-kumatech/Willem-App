// MRTF01 dimensions, speeds and timings. Lengths in metres, times in seconds, speeds in m/s.
// Values that exist in settings.product come from there (passed from the server page);
// the rest fall back to the original dimensions.js of mek-rider-3d.

export interface ProductDims {
  name: string;
  forkRetractedMm: number;
  forkExtendedMm: number;
  extendSeconds: number;
  retractSeconds: number;
  widthMm: number;
  capacityKg: number;
  palletsPerTrip: number;
  speedEmptyKmh: number;
  speedLoadedKmh: number;
}

export interface Dims {
  FORK_IN: number; // lepellengte ingeschoven (la)
  FORK_EXT: number; // uitschuiflengte (REACH)
  FORK_SPAN: number; // buitenmaat lepels (b5)
  FORK_W: number; // lepelbreedte (e)
  FORK_T: number; // lepeldikte (S)
  FORK_LOW: number; // laagste lepelhoogte (h13)
  CHASSIS: number; // lengte tot voorzijde lepels (l2)
  WIDTH: number; // totale breedte (b1)
  PAL_L: number; // Euro-pallet, lengterichting
  PAL_W: number;
  EXT_TIME: number;
  RET_TIME: number;
  LIFT_H: number; // getoonde hefhoogte bij rijden
  LIFT_TIME: number;
  V_EMPTY: number;
  V_LOAD: number;
  ACC: number; // m/s², afgeleid van 5,5 s over 10 m
}

// House style
export const NAVY = 0x0e2038;
export const RED = 0xd6483d;

const pos = (v: number | undefined, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);

export function makeDims(p?: Partial<ProductDims>): Dims {
  const forkIn = pos(p?.forkRetractedMm, 1198) / 1000;
  const forkOut = pos(p?.forkExtendedMm, 1998) / 1000;
  return {
    FORK_IN: forkIn,
    FORK_EXT: Math.max(0.05, forkOut - forkIn),
    FORK_SPAN: 0.547,
    FORK_W: 0.177,
    FORK_T: 0.057,
    FORK_LOW: 0.087,
    CHASSIS: 0.83,
    WIDTH: pos(p?.widthMm, 785) / 1000,
    PAL_L: 1.2,
    PAL_W: 0.8,
    EXT_TIME: pos(p?.extendSeconds, 4),
    RET_TIME: pos(p?.retractSeconds, 2),
    LIFT_H: 0.06,
    LIFT_TIME: 1.2,
    V_EMPTY: pos(p?.speedEmptyKmh, 12) / 3.6,
    V_LOAD: pos(p?.speedLoadedKmh, 10) / 3.6,
    ACC: 1.1,
  };
}
