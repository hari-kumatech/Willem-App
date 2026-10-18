import * as THREE from 'three';
import { PAL_L, PAL_W } from '../config/dimensions.js';
import { M, box } from '../three/helpers.js';

// Euro-pallet met dozen en stretchfolie.
// Oorsprong: voorkant van de pallet (x = 0), de pallet loopt naar -x.
export function makePallet(seed = 0) {
  const g = new THREE.Group();
  const cx = -PAL_L / 2;
  g.add(box(PAL_L, 0.022, PAL_W, M.wood, cx, 0.144 - 0.011, 0));
  for (const zx of [-1, 0, 1]) for (const xx of [-1, 0, 1]) g.add(box(0.145, 0.078, 0.1, M.woodD, cx + xx * 0.5, 0.022 + 0.039, zx * 0.35));
  for (const zx of [-1, 0, 1]) g.add(box(PAL_L, 0.022, 0.1, M.wood, cx, 0.011, zx * 0.35));
  for (const xx of [-1, 0, 1]) g.add(box(0.145, 0.022, PAL_W, M.wood, cx + xx * 0.5, 0.111, 0));

  const rows = 3, cols = 2, layers = 3, bw = 1.14 / rows, bd = 0.76 / cols, bh = 0.26;
  for (let l = 0; l < layers; l++) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const m = ((r + c + l + seed) % 3 === 0) ? M.card2 : M.card;
    g.add(box(bw - 0.012, bh - 0.008, bd - 0.012, m, cx - 0.57 + bw * (r + 0.5), 0.144 + bh * (l + 0.5), -0.38 + bd * (c + 0.5)));
  }
  const wrap = new THREE.Mesh(new THREE.BoxGeometry(1.17, bh * layers + 0.01, 0.785), M.wrap);
  wrap.position.set(cx, 0.144 + bh * layers / 2, 0);
  g.add(wrap);
  return g;
}
