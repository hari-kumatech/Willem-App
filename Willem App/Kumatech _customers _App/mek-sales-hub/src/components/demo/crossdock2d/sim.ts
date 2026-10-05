// 2D crossdock animation: floor-plan geometry (SVG units, viewBox 800×250) and the time-based
// programme per truck. Pure functions: the state at any sim time is computed, not integrated.
import { oneWayM } from '@/modules/crossdock/calc';
import type { Hall } from '@/modules/crossdock/hall';
import type { DemoMessages } from '@/i18n/messages/demo';

export type Pt = readonly [number, number];
export type PathKey = 'toA' | 'toB' | 'AtoB' | 'backA' | 'backB';
export type ZoneKey = 'inbound' | 'outA' | 'outB' | 'staging' | 'route';

export const SLOTS = 12; // pallets per trailer in the visualisation
export const IN: Pt = [150, 62];
export const A: Pt = [650, 92];
export const B: Pt = [650, 192];

interface Path {
  pts: Pt[];
  dirs: ('rev' | 'fwd')[];
  seg: number[];
  len: number;
}

function makePath(pts: Pt[], dirs: Path['dirs']): Path {
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) seg.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, dirs, seg, len: seg.reduce((s, d) => s + d, 0) };
}

export const PATHS: Record<PathKey, Path> = {
  toA: makePath([IN, [400, 62], [400, 92], A], ['rev', 'fwd', 'fwd']),
  toB: makePath([IN, [400, 62], [400, 192], B], ['rev', 'fwd', 'fwd']),
  AtoB: makePath([A, [615, 92], [615, 192], B], ['rev', 'fwd', 'fwd']),
  backA: makePath([A, [400, 92], [400, 62], IN], ['rev', 'fwd', 'fwd']),
  backB: makePath([B, [400, 192], [400, 62], IN], ['rev', 'fwd', 'fwd']),
};

export const routeKeys = (perRide: 1 | 2): PathKey[] => (perRide === 2 ? ['toA', 'AtoB', 'backB'] : ['toA', 'toB']);

export const pathD = (k: PathKey) => 'M' + PATHS[k].pts.map((q) => q.join(',')).join(' L');

function pointAt(p: Path, f: number) {
  let d = f * p.len;
  for (let i = 0; i < p.seg.length; i++) {
    if (d <= p.seg[i] || i === p.seg.length - 1) {
      const r = p.seg[i] ? Math.min(1, d / p.seg[i]) : 0;
      const a = p.pts[i];
      const b = p.pts[i + 1];
      let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      if (p.dirs[i] === 'rev') ang += 180;
      return { x: a[0] + (b[0] - a[0]) * r, y: a[1] + (b[1] - a[1]) * r, ang };
    }
    d -= p.seg[i];
  }
  const last = p.pts[p.pts.length - 1];
  return { x: last[0], y: last[1], ang: 0 };
}

type Phase =
  | { kind: 'pick'; dur: number; at: Pt; face: number; k: number; ride: number; label: string }
  | { kind: 'drop'; dur: number; at: Pt; face: number; dest: 'A' | 'B'; ride: number; label: string }
  | { kind: 'drive'; dur: number; path: Path; ride: number; label: string };

// One period = 2 pallets: one to A, one to B.
function program(perRide: 1 | 2, hall: Hall, t: DemoMessages): Phase[] {
  const v = Math.max(0.1, hall.speedKmh) / 3.6;
  const d1 = oneWayM(hall);
  const half = hall.loadSecondsPerPallet / 2;
  const pick = (k: number, ride: number): Phase => ({ kind: 'pick', dur: half * k, at: IN, face: 180, k, ride, label: t.phPick });
  const drop = (dest: 'A' | 'B', ride: number): Phase => ({
    kind: 'drop',
    dur: half,
    at: dest === 'A' ? A : B,
    face: 0,
    dest,
    ride,
    label: t.phDrop(dest),
  });
  const drive = (key: PathKey, meters: number, ride: number, label: string): Phase => ({ kind: 'drive', dur: meters / v, path: PATHS[key], ride, label });
  if (perRide === 1)
    return [
      pick(1, 1),
      drive('toA', d1, 1, t.phDriveTo('A')),
      drop('A', 1),
      drive('backA', d1, 1, t.phBack),
      pick(1, 2),
      drive('toB', d1 + hall.gapM, 2, t.phDriveTo('B')),
      drop('B', 2),
      drive('backB', d1 + hall.gapM, 2, t.phBack),
    ];
  return [
    pick(2, 1),
    drive('toA', d1, 1, t.phMekToA),
    drop('A', 1),
    drive('AtoB', hall.gapM, 1, t.phMekToB),
    drop('B', 1),
    drive('backB', d1 + hall.gapM, 1, t.phBack),
  ];
}

export interface LaneState {
  picked: number;
  A: number;
  B: number;
  carried: number;
  delivered: number;
  pos: Pt;
  ang: number;
  label: string;
  ride: number;
}

export function laneState(perRide: 1 | 2, hall: Hall, simT: number, t: DemoMessages): LaneState {
  const prog = program(perRide, hall, t);
  const period = prog.reduce((s, p) => s + p.dur, 0);
  const n = period > 0 ? Math.floor(simT / period) : 0;
  let rem = period > 0 ? simT - n * period : 0;
  const ridesPerPeriod = perRide === 1 ? 2 : 1;
  const st = { picked: 2 * n, A: n, B: n, carried: 0, pos: IN as Pt, ang: 180, label: '', ride: n * ridesPerPeriod + 1 };
  for (const ph of prog) {
    if (ph.kind === 'pick') {
      st.picked += ph.k;
      st.carried += ph.k;
    }
    if (rem < ph.dur || ph === prog[prog.length - 1]) {
      st.label = ph.label;
      st.ride = n * ridesPerPeriod + ph.ride;
      if (ph.kind === 'drive') {
        const p = pointAt(ph.path, ph.dur ? Math.min(1, rem / ph.dur) : 1);
        st.pos = [p.x, p.y];
        st.ang = p.ang;
      } else {
        st.pos = ph.at;
        st.ang = ph.face;
      }
      break;
    }
    rem -= ph.dur;
    if (ph.kind === 'drop') {
      st.carried -= 1;
      st[ph.dest] += 1;
    }
  }
  return { ...st, delivered: st.A + st.B };
}

// Smoothly turn the truck towards the target heading (degrees).
export function turnTowards(current: number, target: number, dt: number): number {
  const diff = ((((target - current + 540) % 360) + 360) % 360) - 180;
  return current + diff * Math.min(1, dt * 8);
}
