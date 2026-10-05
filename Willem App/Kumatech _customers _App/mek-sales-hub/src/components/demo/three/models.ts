import * as THREE from 'three';
import { RED } from './dims';
import { box, font, sideLabels, textTex, wheel, type Kit } from './helpers';

// Coordinate system: metres, y is up. Each truck's origin is the fork face (x = 0);
// the forks point towards -x and the body towards +x.

// Stylised operator facing the forks (-x). hand = [dx, dy]: hands relative to the shoulders.
function makeDriver(kit: Kit, capMaterial: THREE.Material, hand: [number, number] = [-0.24, -0.21]) {
  const { M } = kit;
  const drv = new THREE.Group();
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.8, 12), M.dark);
    leg.position.set(0, 0.4, s * 0.1);
    leg.castShadow = true;
    drv.add(leg);
  }
  drv.add(box(0.24, 0.56, 0.4, M.vest, 0, 1.08, 0));
  drv.add(box(0.245, 0.05, 0.405, M.white, 0, 1.0, 0)); // reflective band
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), M.skin);
  head.position.set(0, 1.48, 0);
  head.castShadow = true;
  drv.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMaterial);
  cap.position.set(0, 1.5, 0);
  drv.add(cap);

  const [dx, dy] = hand;
  const len = Math.hypot(dx, dy);
  const phi = Math.atan2(-dx, dy);
  for (const s of [1, -1]) {
    const arm = box(0.07, len, 0.07, M.vest, dx / 2, 1.3 + dy / 2, s * 0.2);
    arm.rotation.z = phi;
    drv.add(arm);
    const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), M.skin);
    hnd.position.set(dx, 1.3 + dy, s * 0.16);
    drv.add(hnd);
  }
  return drv;
}

// Mek-Rider body after dimension drawing MRTF01-000-00: stand-on cab at the rear,
// console with steering head, load backrest at the forks. Rear at x = CHASSIS.
function buildMekBody(kit: Kit, body: THREE.Group) {
  const { M, D } = kit;
  const W = D.WIDTH;
  const R = D.CHASSIS;

  // Chassis with 45 mm ground clearance
  body.add(box(R, 0.255, W, M.black, R / 2, 0.045 + 0.1275, 0));
  body.add(box(R - 0.02, 0.03, W + 0.006, M.red, R / 2, 0.29, 0));

  // Side panels with rounded top corners
  const sh = new THREE.Shape();
  sh.moveTo(0.13, 0.3);
  sh.lineTo(R, 0.3);
  sh.lineTo(R, 1.19);
  sh.quadraticCurveTo(R, 1.3, R - 0.11, 1.3);
  sh.lineTo(0.21, 1.3);
  sh.quadraticCurveTo(0.13, 1.3, 0.13, 1.22);
  sh.lineTo(0.13, 0.3);
  const PT = 0.035;
  const panel = new THREE.ExtrudeGeometry(sh, { depth: PT, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 2, curveSegments: 12 });
  panel.translate(0, 0, -PT / 2);
  for (const s of [1, -1]) {
    // Clone per side so disposing one mesh never leaves a dangling shared geometry
    const m = new THREE.Mesh(s > 0 ? panel : panel.clone(), M.navy);
    m.position.z = s * (W / 2 - PT / 2 - 0.008);
    m.castShadow = true;
    m.receiveShadow = true;
    body.add(m);
  }

  // Diagonal stripes on the side panels
  const stripe = (x0: number, x1: number, w: number) => {
    const g = new THREE.Shape();
    g.moveTo(x0, 1.2);
    g.lineTo(x0 - w, 1.2);
    g.lineTo(x1 - w, 0.42);
    g.lineTo(x1, 0.42);
    g.closePath();
    return new THREE.ShapeGeometry(g);
  };
  const stripeMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.45, side: THREE.DoubleSide });
  for (const s of [1, -1])
    for (const g of [stripe(0.69, 0.51, 0.05), stripe(0.61, 0.43, 0.022)]) {
      const m = new THREE.Mesh(g, stripeMat);
      m.position.z = s * (W / 2 + 0.002);
      body.add(m);
    }

  // Logo
  const logo = textTex('MEK', null, '#ffffff', 512, 160, font(kit, 'italic 800 120px'));
  sideLabels(body, logo, 0.26, 0.085, 0.27, 1.12, W / 2 + 0.003);

  // Rear wall, console and cab floor (floor at ca. 320 mm, h7)
  body.add(box(0.03, 0.88, W - 0.07, M.navy, R - 0.02, 0.3 + 0.44, 0));
  body.add(box(0.26, 0.95, W - 0.07, M.navy, 0.27, 0.3 + 0.475, 0));
  body.add(box(0.28, 0.03, W - 0.05, M.red, 0.27, 1.265, 0));
  body.add(box(R - 0.43, 0.03, W - 0.08, M.steel, (0.4 + R - 0.03) / 2, 0.32, 0));

  // Steering head on the console, tilted towards the driver
  const sk = new THREE.Group();
  sk.position.set(0.33, 1.3, 0.06);
  sk.add(box(0.06, 0.07, 0.06, M.black, 0, 0.03, 0));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.06, 28), M.black);
  disc.position.set(0.03, 0.09, 0);
  disc.rotation.z = -0.45;
  disc.castShadow = true;
  sk.add(disc);
  for (const s of [1, -1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.11, 12), M.black);
    grip.position.set(0.05, 0.12, s * 0.15);
    grip.rotation.z = -0.45;
    sk.add(grip);
  }
  sk.add(box(0.05, 0.02, 0.09, M.red, 0.06, 0.13, 0)); // display
  body.add(sk);

  // Load backrest at the forks
  for (const s of [1, -1]) body.add(box(0.07, 0.95, 0.09, M.steel, 0.07, 0.1 + 0.475, s * 0.29));
  body.add(box(0.025, 0.55, 0.5, M.steel, 0.02, 0.15 + 0.275, 0));
  for (const y of [0.55, 0.85]) body.add(box(0.05, 0.05, 0.62, M.steel, 0.05, y, 0));
  for (const s of [1, -1])
    for (const y of [0.62, 0.78, 0.92]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.005, 10), M.black);
      b.rotation.z = Math.PI / 2;
      b.position.set(0.034, y, s * 0.29);
      body.add(b);
    }

  // Wheels: drive wheel Ø254 at the rear, castors
  body.add(wheel(0.127, 0.09, M.pu, R - 0.135, 0.127, 0.12));
  body.add(wheel(0.09, 0.092, M.rubber, R - 0.135, 0.127, 0.12));
  for (const s of [1, -1]) body.add(wheel(0.05, 0.05, M.rubber, 0.24, 0.05, s * 0.3));

  // Driver in the stand-on cab
  const d = makeDriver(kit, M.red, [-0.24, -0.21]);
  d.position.set(0.6, 0.335, 0);
  body.add(d);
}

// Generic stand-on EPT for the comparison (fixed forks). Deliberately neutral grey.
function buildEptBody(kit: Kit, body: THREE.Group) {
  const { M, D } = kit;
  const WIDTH = D.WIDTH;
  const DU = 0.47; // drive unit
  body.add(box(DU, 0.86, WIDTH, M.grey, DU / 2, 0.08 + 0.43, 0));
  body.add(box(DU - 0.04, 0.09, WIDTH - 0.04, M.greyD, DU / 2, 0.94 + 0.045, 0));
  body.add(box(0.04, 0.55, WIDTH * 0.92, M.steel, 0.02, 0.4, 0)); // backrest
  sideLabels(body, textTex('EPT', null, '#2b333d', 512, 160, '700 110px Arial, sans-serif'), 0.3, 0.1, DU / 2, 0.66, WIDTH / 2 + 0.002);

  // Platform with guard rails
  const PL0 = DU;
  const PL1 = D.CHASSIS;
  body.add(box(PL1 - PL0, 0.06, WIDTH - 0.06, M.steel, (PL0 + PL1) / 2, 0.11, 0));
  body.add(box(0.03, 0.28, WIDTH - 0.06, M.grey, PL1 - 0.015, 0.22, 0));
  for (const s of [1, -1]) {
    body.add(box(PL1 - PL0, 0.03, 0.03, M.steelL, (PL0 + PL1) / 2, 0.95, s * (WIDTH / 2 - 0.03)));
    body.add(box(0.03, 0.85, 0.03, M.steelL, PL1 - 0.03, 0.55, s * (WIDTH / 2 - 0.03)));
  }

  // Tiller
  const tiller = box(0.05, 0.42, 0.05, M.steel, DU - 0.02, 1.12, 0.05);
  tiller.rotation.z = -0.5;
  body.add(tiller);
  body.add(box(0.06, 0.06, 0.34, M.black, DU + 0.08, 1.31, 0.05));

  // Wheels
  body.add(wheel(0.127, 0.09, M.pu, 0.24, 0.127, 0));
  body.add(wheel(0.127 * 0.72, 0.092, M.rubber, 0.24, 0.127, 0));
  for (const s of [1, -1]) body.add(wheel(0.05, 0.05, M.rubber, 0.62, 0.05, s * 0.3));

  const d = makeDriver(kit, M.greyD, [-0.12, -0.08]);
  d.position.set((PL0 + PL1) / 2 + 0.03, 0.14, 0);
  body.add(d);
}

export interface Truck {
  root: THREE.Group;
  forks: THREE.Group;
  mek: boolean;
  ext: number;
  lift: number;
  setExt(e: number): void;
  setLift(h: number): void;
}

// Pallet truck. mek = true gives the Mek-Rider with extendable forks.
export function makeTruck(kit: Kit, mek: boolean): Truck {
  const { M, D } = kit;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  if (mek) buildMekBody(kit, body);
  else buildEptBody(kit, body);

  const forks = new THREE.Group();
  root.add(forks);
  const zc = D.FORK_SPAN / 2 - D.FORK_W / 2;
  const inner: THREE.Group[] = [];
  for (const s of [1, -1]) {
    forks.add(box(D.FORK_IN, D.FORK_T, D.FORK_W, M.steel, -D.FORK_IN / 2, D.FORK_LOW - D.FORK_T / 2, s * zc));
    forks.add(box(0.06, 0.02, D.FORK_W - 0.02, M.steel, -D.FORK_IN + 0.02, D.FORK_LOW - D.FORK_T - 0.01, s * zc));
    forks.add(wheel(0.04, 0.06, M.pu, -D.FORK_IN + 0.12, 0.04, s * zc));
    if (!mek) continue;
    forks.add(wheel(0.04, 0.06, M.pu, -D.FORK_IN + 0.215, 0.04, s * zc)); // double load roller
    // Extendable part (red), hidden inside the fixed fork when retracted
    const g = new THREE.Group();
    g.add(box(D.FORK_EXT, D.FORK_T - 0.012, D.FORK_W - 0.03, M.red, -D.FORK_EXT / 2, D.FORK_LOW - D.FORK_T / 2 - 0.003, 0));
    g.add(wheel(0.04, 0.05, M.pu, -D.FORK_EXT + 0.09, 0.04, 0));
    g.add(wheel(0.04, 0.05, M.pu, -D.FORK_EXT + 0.18, 0.04, 0));
    g.position.set(-D.FORK_IN + D.FORK_EXT, 0, s * zc);
    forks.add(g);
    inner.push(g);
  }

  const truck: Truck = {
    root,
    forks,
    mek,
    ext: 0,
    lift: 0,
    setExt(e) {
      truck.ext = Math.max(0, Math.min(D.FORK_EXT, e));
      inner.forEach((g) => {
        g.position.x = -D.FORK_IN + D.FORK_EXT - truck.ext;
      });
    },
    setLift(h) {
      truck.lift = h;
      forks.position.y = h;
    },
  };
  return truck;
}

// Euro pallet with boxes and stretch wrap. Origin: front of the pallet (x = 0), it extends to -x.
export function makePallet(kit: Kit, seed = 0) {
  const { M, D } = kit;
  const g = new THREE.Group();
  const cx = -D.PAL_L / 2;
  g.add(box(D.PAL_L, 0.022, D.PAL_W, M.wood, cx, 0.144 - 0.011, 0));
  for (const zx of [-1, 0, 1]) for (const xx of [-1, 0, 1]) g.add(box(0.145, 0.078, 0.1, M.woodD, cx + xx * 0.5, 0.022 + 0.039, zx * 0.35));
  for (const zx of [-1, 0, 1]) g.add(box(D.PAL_L, 0.022, 0.1, M.wood, cx, 0.011, zx * 0.35));
  for (const xx of [-1, 0, 1]) g.add(box(0.145, 0.022, D.PAL_W, M.wood, cx + xx * 0.5, 0.111, 0));

  const rows = 3;
  const cols = 2;
  const layers = 3;
  const bw = 1.14 / rows;
  const bd = 0.76 / cols;
  const bh = 0.26;
  for (let l = 0; l < layers; l++)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const m = (r + c + l + seed) % 3 === 0 ? M.card2 : M.card;
        g.add(box(bw - 0.012, bh - 0.008, bd - 0.012, m, cx - 0.57 + bw * (r + 0.5), 0.144 + bh * (l + 0.5), -0.38 + bd * (c + 0.5)));
      }
  const wrap = new THREE.Mesh(new THREE.BoxGeometry(1.17, bh * layers + 0.01, 0.785), M.wrap);
  wrap.position.set(cx, 0.144 + (bh * layers) / 2, 0);
  g.add(wrap);
  return g;
}
