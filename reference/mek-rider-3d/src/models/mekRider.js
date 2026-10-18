import * as THREE from 'three';
import { CHASSIS, WIDTH, RED } from '../config/dimensions.js';
import { M, box, wheel, textTex, sideLabels } from '../three/helpers.js';
import { makeDriver } from './driver.js';

// Carrosserie van de Mek-Rider volgens maattekening MRTF01-000-00:
// stacabine achterin, console met stuurkop, lastrug bij de lepels.
// Lokale assen: lepelrug op x = 0, achterkant op x = CHASSIS (0,83 m).
export function buildMekBody(body) {
  const W = WIDTH, R = CHASSIS;

  // Onderstel met 45 mm bodemvrijheid
  body.add(box(R, 0.255, W, M.black, R / 2, 0.045 + 0.1275, 0));
  body.add(box(R - 0.02, 0.03, W + 0.006, M.red, R / 2, 0.29, 0));

  // Zijpanelen met afgeronde bovenhoeken
  const sh = new THREE.Shape();
  sh.moveTo(0.13, 0.30); sh.lineTo(R, 0.30); sh.lineTo(R, 1.19);
  sh.quadraticCurveTo(R, 1.30, R - 0.11, 1.30); sh.lineTo(0.21, 1.30);
  sh.quadraticCurveTo(0.13, 1.30, 0.13, 1.22); sh.lineTo(0.13, 0.30);
  const PT = 0.035;
  const panel = new THREE.ExtrudeGeometry(sh, { depth: PT, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 2, curveSegments: 12 });
  panel.translate(0, 0, -PT / 2);
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(panel, M.navy);
    m.position.z = s * (W / 2 - PT / 2 - 0.008); m.castShadow = true; m.receiveShadow = true;
    body.add(m);
  }

  // Diagonale strepen op de zijpanelen
  const stripe = (x0, x1, w) => {
    const g = new THREE.Shape();
    g.moveTo(x0, 1.2); g.lineTo(x0 - w, 1.2); g.lineTo(x1 - w, 0.42); g.lineTo(x1, 0.42); g.closePath();
    return new THREE.ShapeGeometry(g);
  };
  const stripeMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.45, side: THREE.DoubleSide });
  for (const s of [1, -1]) for (const g of [stripe(0.69, 0.51, 0.05), stripe(0.61, 0.43, 0.022)]) {
    const m = new THREE.Mesh(g, stripeMat); m.position.z = s * (W / 2 + 0.002); body.add(m);
  }

  // Logo
  const logo = textTex('MEK', null, '#ffffff', 512, 160, 'italic 800 120px Oswald, Arial, sans-serif');
  sideLabels(body, logo, 0.26, 0.085, 0.27, 1.12, W / 2 + 0.003);

  // Achterwand, console en cabinevloer (vloer op ca. 320 mm, h7)
  body.add(box(0.03, 0.88, W - 0.07, M.navy, R - 0.02, 0.30 + 0.44, 0));
  body.add(box(0.26, 0.95, W - 0.07, M.navy, 0.27, 0.30 + 0.475, 0));
  body.add(box(0.28, 0.03, W - 0.05, M.red, 0.27, 1.265, 0));
  body.add(box(R - 0.43, 0.03, W - 0.08, M.steel, (0.40 + R - 0.03) / 2, 0.32, 0));

  // Stuurkop op de console, schuin naar de bestuurder
  const sk = new THREE.Group(); sk.position.set(0.33, 1.3, 0.06);
  sk.add(box(0.06, 0.07, 0.06, M.black, 0, 0.03, 0));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.06, 28), M.black);
  disc.position.set(0.03, 0.09, 0); disc.rotation.z = -0.45; disc.castShadow = true; sk.add(disc);
  for (const s of [1, -1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.11, 12), M.black);
    grip.position.set(0.05, 0.12, s * 0.15); grip.rotation.z = -0.45; sk.add(grip);
  }
  sk.add(box(0.05, 0.02, 0.09, M.red, 0.06, 0.13, 0)); // display
  body.add(sk);

  // Lastrug bij de lepels
  for (const s of [1, -1]) body.add(box(0.07, 0.95, 0.09, M.steel, 0.07, 0.1 + 0.475, s * 0.29));
  body.add(box(0.025, 0.55, 0.5, M.steel, 0.02, 0.15 + 0.275, 0));
  for (const y of [0.55, 0.85]) body.add(box(0.05, 0.05, 0.62, M.steel, 0.05, y, 0));
  for (const s of [1, -1]) for (const y of [0.62, 0.78, 0.92]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.005, 10), M.black);
    b.rotation.z = Math.PI / 2; b.position.set(0.034, y, s * 0.29); body.add(b);
  }

  // Wielen: aandrijfwiel Ø254 achter, zwenkwielen
  body.add(wheel(0.127, 0.09, M.pu, R - 0.135, 0.127, 0.12));
  body.add(wheel(0.09, 0.092, M.rubber, R - 0.135, 0.127, 0.12));
  for (const s of [1, -1]) body.add(wheel(0.05, 0.05, M.rubber, 0.24, 0.05, s * 0.3));

  // Bestuurder in de stacabine
  const d = makeDriver(M.red, [-0.24, -0.21]);
  d.position.set(0.6, 0.335, 0);
  body.add(d);
}
