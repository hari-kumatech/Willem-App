import type * as THREE from 'three';
import type { DemoMessages } from '@/i18n/messages/demo';
import type { Dims } from './dims';
import type { Truck } from './models';

// ---- Hall layout (metres). x runs from inbound (left) to outbound (right). ----
export const LANE_EPT = -3.2; // lane of the standard EPT
export const LANE_MEK = 3.2; // lane of the Mek-Rider
export const LANE_HALF = 2.0; // half lane width (yellow lines)
export const OFFSET = 1.05; // sideways swerve around a placed pallet
export const X_HOME = -1.5; // start position of the fork face
export const PICK = -10.6; // fork face when picking up (front of the first pallet)
export const SPOT_A = 5.6; // start of spot A
export const SPOT_B = 11.0; // start of spot B
export const WALL_OUT = 15.2; // outbound dock wall
export const WALL_IN = -16.4; // inbound dock wall

// ---- Script per truck ----
//  say   status line (+ optional big caption)   move  drive to x (and optionally z)
//  ext   extend/retract forks                   lift  raise/lower
//  pick  pallets onto the forks                 drop  put a pallet down
//  ride  trip counter +1                        end   done
export type Action =
  | { k: 'say'; s: string; cap?: string }
  | { k: 'move'; x: number; z: number | null; x0?: number; z0?: number; z1?: number }
  | { k: 'ext'; to: number; dur: number; t0?: number; from?: number }
  | { k: 'lift'; h: number; t0?: number; from?: number }
  | { k: 'pick'; p: THREE.Object3D[] }
  | { k: 'drop'; p: THREE.Object3D }
  | { k: 'ride' }
  | { k: 'end' };

export interface Lane {
  mek: boolean;
  z: number;
  truck: Truck;
  pallets: THREE.Object3D[];
  queue: Action[];
  cur: Action | null;
  v: number;
  time: number;
  dist: number;
  rides: number;
  done: boolean;
  status: string;
}

export interface PlanText {
  t: DemoMessages;
  extendCaption: string; // "Lepels uit: 1.198 → 1.998 mm in 4 sec", formatted by the caller
}

export function buildPlan(lane: Lane, D: Dims, { t, extendCaption }: PlanText): Action[] {
  const a: Action[] = [];
  const P = lane.pallets;
  const say = (s: string, cap?: string) => a.push({ k: 'say', s, cap });
  const move = (x: number, z: number | null = null) => a.push({ k: 'move', x, z });
  const lift = (h: number) => a.push({ k: 'lift', h });
  const zc = lane.z;
  const zo = lane.z + (lane.z > 0 ? OFFSET : -OFFSET);

  if (lane.mek) {
    say(t.sExtend, extendCaption);
    a.push({ k: 'ext', to: D.FORK_EXT, dur: D.EXT_TIME });
    say(t.sToInbound);
    move(PICK);
    say(t.sPickTwo, t.cPickTwo);
    a.push({ k: 'pick', p: [P[0], P[1]] });
    lift(D.LIFT_H);
    a.push({ k: 'ride' });
    say(t.sToA);
    move(SPOT_A + 2 * D.PAL_L);
    say(t.sDropA, t.cDropA);
    lift(0);
    a.push({ k: 'drop', p: P[1] });
    say(t.sRetract);
    a.push({ k: 'ext', to: 0, dur: D.RET_TIME });
    lift(D.LIFT_H);
    say(t.sOnToB);
    move(SPOT_B + D.PAL_L);
    say(t.sDropB, t.cDropBMek);
    lift(0);
    a.push({ k: 'drop', p: P[0] });
    move(SPOT_B + D.PAL_L + 1.2);
  } else {
    say(t.sToInbound);
    move(PICK);
    say(t.sPickFirst);
    a.push({ k: 'pick', p: [P[0]] });
    lift(D.LIFT_H);
    a.push({ k: 'ride' });
    say(t.sToA);
    move(SPOT_A + D.PAL_L);
    say(t.sDropA);
    lift(0);
    a.push({ k: 'drop', p: P[0] });
    move(SPOT_A + D.PAL_L + 1.35);
    say(t.sBackEmpty);
    move(SPOT_A + D.PAL_L + 3.6, zo);
    move(-6, zo);
    move(-9.2, zc);
    move(PICK - D.PAL_L);
    say(t.sPickSecond);
    a.push({ k: 'pick', p: [P[1]] });
    lift(D.LIFT_H);
    a.push({ k: 'ride' });
    say(t.sToBAround);
    move(1.2);
    move(4.5, zo);
    move(8.3);
    move(11.2, zc);
    move(SPOT_B + D.PAL_L);
    say(t.sDropB);
    lift(0);
    a.push({ k: 'drop', p: P[1] });
    move(SPOT_B + D.PAL_L + 1.2);
  }
  a.push({ k: 'end' });
  return a;
}

export interface StepContext {
  scene: THREE.Scene;
  isPallet: (o: THREE.Object3D) => boolean;
  onCaption: (text: string) => void;
  D: Dims;
  t: DemoMessages;
}

// Executes one truck's script: trapezoid speed profile, S-curve lane changes, timers.
export function stepLane(lane: Lane, dt: number, { scene, isPallet, onCaption, D, t: msg }: StepContext) {
  if (lane.done) return;
  lane.time += dt;
  const t = lane.truck;

  // Handle instant steps until there is a step with a duration
  let guard = 0;
  while (!lane.cur && lane.queue.length && guard++ < 20) {
    const a = lane.queue.shift()!;
    if (a.k === 'say') {
      lane.status = a.s;
      if (a.cap) onCaption(a.cap);
      continue;
    }
    if (a.k === 'pick') {
      a.p.forEach((p) => t.forks.attach(p));
      continue;
    }
    if (a.k === 'drop') {
      scene.attach(a.p);
      a.p.position.y = 0;
      continue;
    }
    if (a.k === 'ride') {
      lane.rides++;
      continue;
    }
    if (a.k === 'end') {
      lane.done = true;
      lane.status = msg.sDone(msg.rides(lane.rides));
      return;
    }
    if (a.k === 'ext') {
      a.t0 = 0;
      a.from = t.ext;
    } else if (a.k === 'lift') {
      a.t0 = 0;
      a.from = t.lift;
    }
    lane.cur = a;
  }
  const a = lane.cur;
  if (!a) return;

  if (a.k === 'move') {
    if (a.x0 == null) {
      a.x0 = t.root.position.x;
      a.z0 = t.root.position.z;
      a.z1 = a.z == null ? a.z0 : a.z;
    }
    const z0 = a.z0!;
    const z1 = a.z1!;
    const x = t.root.position.x;
    const d = a.x - x;
    const dir = Math.sign(d);
    const dist = Math.abs(d);
    const loaded = t.forks.children.some(isPallet);
    // Trapezoid profile: accelerate, top speed, brake in time
    lane.v = Math.min(loaded ? D.V_LOAD : D.V_EMPTY, lane.v + D.ACC * dt, Math.sqrt(2 * D.ACC * dist));
    let step = lane.v * dt;
    if (step >= dist || dist < 0.005) {
      step = dist;
      lane.v = 0;
      lane.cur = null;
    }
    const nx = x + dir * step;
    const span = a.x - a.x0;
    // Sideways along an S-curve; the truck turns with the direction of travel
    const pr = span ? Math.min(1, Math.max(0, (nx - a.x0) / span)) : 1;
    const nz = z0 + (z1 - z0) * pr * pr * (3 - 2 * pr);
    const slope = span ? ((z1 - z0) * 6 * pr * (1 - pr)) / span : 0;
    lane.dist += Math.hypot(step, nz - t.root.position.z);
    t.root.position.x = nx;
    t.root.position.z = nz;
    t.root.rotation.y = -Math.atan(slope);
  } else if (a.k === 'ext') {
    a.t0 = (a.t0 ?? 0) + dt;
    const k = Math.min(1, a.t0 / a.dur);
    t.setExt(a.from! + (a.to - a.from!) * k);
    if (k >= 1) lane.cur = null;
  } else if (a.k === 'lift') {
    a.t0 = (a.t0 ?? 0) + dt;
    const k = Math.min(1, a.t0 / D.LIFT_TIME);
    const e = k * k * (3 - 2 * k);
    t.setLift(a.from! + (a.h - a.from!) * e);
    if (k >= 1) lane.cur = null;
  }
}
