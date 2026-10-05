import * as THREE from 'three';
import { CHASSIS, WIDTH } from '../config/dimensions.js';
import { M, box, wheel, textTex, sideLabels } from '../three/helpers.js';
import { makeDriver } from './driver.js';

// Generieke meerij-EPT als vergelijking (vaste lepels). Bewust neutraal grijs.
export function buildEptBody(body) {
  const DU = 0.47; // aandrijfdeel
  body.add(box(DU, 0.86, WIDTH, M.grey, DU / 2, 0.08 + 0.43, 0));
  body.add(box(DU - 0.04, 0.09, WIDTH - 0.04, M.greyD, DU / 2, 0.94 + 0.045, 0));
  body.add(box(0.04, 0.55, WIDTH * 0.92, M.steel, 0.02, 0.4, 0)); // lepelrug
  sideLabels(body, textTex('EPT', null, '#2b333d', 512, 160, '700 110px Arial, sans-serif'), 0.3, 0.1, DU / 2, 0.66, WIDTH / 2 + 0.002);

  // Platform met beschermbeugels
  const PL0 = DU, PL1 = CHASSIS;
  body.add(box(PL1 - PL0, 0.06, WIDTH - 0.06, M.steel, (PL0 + PL1) / 2, 0.11, 0));
  body.add(box(0.03, 0.28, WIDTH - 0.06, M.grey, PL1 - 0.015, 0.22, 0));
  for (const s of [1, -1]) {
    body.add(box(PL1 - PL0, 0.03, 0.03, M.steelL, (PL0 + PL1) / 2, 0.95, s * (WIDTH / 2 - 0.03)));
    body.add(box(0.03, 0.85, 0.03, M.steelL, PL1 - 0.03, 0.55, s * (WIDTH / 2 - 0.03)));
  }

  // Dissel
  const tiller = box(0.05, 0.42, 0.05, M.steel, DU - 0.02, 1.12, 0.05);
  tiller.rotation.z = -0.5; body.add(tiller);
  body.add(box(0.06, 0.06, 0.34, M.black, DU + 0.08, 1.31, 0.05));

  // Wielen
  body.add(wheel(0.127, 0.09, M.pu, 0.24, 0.127, 0));
  body.add(wheel(0.127 * 0.72, 0.092, M.rubber, 0.24, 0.127, 0));
  for (const s of [1, -1]) body.add(wheel(0.05, 0.05, M.rubber, 0.62, 0.05, s * 0.3));

  const d = makeDriver(M.greyD, [-0.12, -0.08]);
  d.position.set((PL0 + PL1) / 2 + 0.03, 0.14, 0);
  body.add(d);
}
