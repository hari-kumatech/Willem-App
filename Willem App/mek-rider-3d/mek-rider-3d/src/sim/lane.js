import { LIFT_TIME, V_EMPTY, V_LOAD, ACC } from '../config/dimensions.js';

// Voert het draaiboek van één truck uit. onCaption(text) toont een grote titel.
export function stepLane(lane, dt, { scene, isPallet, onCaption }) {
  if (lane.done) return;
  lane.time += dt;
  const t = lane.truck;

  // Directe stappen afhandelen tot er een stap met duur is
  let guard = 0;
  while (!lane.cur && lane.queue.length && guard++ < 20) {
    const a = lane.queue.shift();
    if (a.k === 'say') { lane.status = a.s; if (a.cap) onCaption(a.cap); continue; }
    if (a.k === 'pick') { a.p.forEach(p => t.forks.attach(p)); continue; }
    if (a.k === 'drop') { scene.attach(a.p); a.p.position.y = 0; continue; }
    if (a.k === 'ride') { lane.rides++; continue; }
    if (a.k === 'end') { lane.done = true; lane.status = 'Klaar: ' + lane.rides + (lane.rides === 1 ? ' rit' : ' ritten'); return; }
    a.t0 = 0; a.from = a.k === 'ext' ? t.ext : a.k === 'lift' ? t.lift : null;
    lane.cur = a;
  }
  const a = lane.cur; if (!a) return;

  if (a.k === 'move') {
    if (a.x0 == null) { a.x0 = t.root.position.x; a.z0 = t.root.position.z; a.z1 = a.z == null ? a.z0 : a.z; }
    const x = t.root.position.x, d = a.x - x, dir = Math.sign(d), dist = Math.abs(d);
    const loaded = t.forks.children.some(isPallet);
    // trapeziumprofiel: optrekken, topsnelheid, op tijd afremmen
    lane.v = Math.min(loaded ? V_LOAD : V_EMPTY, lane.v + ACC * dt, Math.sqrt(2 * ACC * dist));
    let step = lane.v * dt;
    if (step >= dist || dist < 0.005) { step = dist; lane.v = 0; lane.cur = null; }
    const nx = x + dir * step, span = a.x - a.x0;
    // zijwaarts verplaatsen volgens een S-curve, truck draait mee met de rijrichting
    const pr = span ? Math.min(1, Math.max(0, (nx - a.x0) / span)) : 1;
    const nz = a.z0 + (a.z1 - a.z0) * pr * pr * (3 - 2 * pr);
    const slope = span ? (a.z1 - a.z0) * 6 * pr * (1 - pr) / span : 0;
    lane.dist += Math.hypot(step, nz - t.root.position.z);
    t.root.position.x = nx; t.root.position.z = nz; t.root.rotation.y = -Math.atan(slope);
  } else if (a.k === 'ext') {
    a.t0 += dt; const k = Math.min(1, a.t0 / a.dur);
    t.setExt(a.from + (a.to - a.from) * k);
    if (k >= 1) lane.cur = null;
  } else if (a.k === 'lift') {
    a.t0 += dt; const k = Math.min(1, a.t0 / LIFT_TIME), e = k * k * (3 - 2 * k);
    t.setLift(a.from + (a.h - a.from) * e);
    if (k >= 1) lane.cur = null;
  }
}
