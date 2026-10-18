import * as THREE from 'three';
import { FORK_IN, FORK_EXT, FORK_SPAN, FORK_W, FORK_T, FORK_LOW } from '../config/dimensions.js';
import { M, box, wheel } from '../three/helpers.js';
import { buildMekBody } from './mekRider.js';
import { buildEptBody } from './standardEpt.js';

// Maakt een pallettruck. mek = true geeft de Mek-Rider met uitschuifbare lepels.
// Oorsprong: lepelrug (x = 0); lepels wijzen naar -x, de carrosserie ligt richting +x.
export function makeTruck(mek) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  if (mek) buildMekBody(body); else buildEptBody(body);

  const forks = new THREE.Group(); root.add(forks);
  const zc = FORK_SPAN / 2 - FORK_W / 2;
  const inner = [];
  for (const s of [1, -1]) {
    forks.add(box(FORK_IN, FORK_T, FORK_W, M.steel, -FORK_IN / 2, FORK_LOW - FORK_T / 2, s * zc));
    forks.add(box(0.06, 0.02, FORK_W - 0.02, M.steel, -FORK_IN + 0.02, FORK_LOW - FORK_T - 0.01, s * zc));
    forks.add(wheel(0.04, 0.06, M.pu, -FORK_IN + 0.12, 0.04, s * zc));
    if (!mek) continue;
    forks.add(wheel(0.04, 0.06, M.pu, -FORK_IN + 0.215, 0.04, s * zc)); // dubbele lastrol
    // Uitschuifbaar deel (rood), ingeschoven verborgen in de vaste lepel
    const g = new THREE.Group();
    g.add(box(FORK_EXT, FORK_T - 0.012, FORK_W - 0.03, M.red, -FORK_EXT / 2, FORK_LOW - FORK_T / 2 - 0.003, 0));
    g.add(wheel(0.04, 0.05, M.pu, -FORK_EXT + 0.09, 0.04, 0));
    g.add(wheel(0.04, 0.05, M.pu, -FORK_EXT + 0.18, 0.04, 0));
    g.position.set(-FORK_IN + FORK_EXT, 0, s * zc);
    forks.add(g); inner.push(g);
  }

  const truck = {
    root, forks, mek, ext: 0, lift: 0,
    setExt(e) {
      truck.ext = Math.max(0, Math.min(FORK_EXT, e));
      inner.forEach(g => { g.position.x = -FORK_IN + FORK_EXT - truck.ext; });
    },
    setLift(h) { truck.lift = h; forks.position.y = h; },
  };
  return truck;
}
