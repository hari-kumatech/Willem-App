import * as THREE from 'three';
import { M, box } from '../three/helpers.js';

// Gestileerde bestuurder die richting de lepels (-x) kijkt.
// hand = [dx, dy]: positie van de handen ten opzichte van de schouders.
export function makeDriver(capMaterial, hand = [-0.24, -0.21]) {
  const drv = new THREE.Group();
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.8, 12), M.dark);
    leg.position.set(0, 0.4, s * 0.1); leg.castShadow = true; drv.add(leg);
  }
  drv.add(box(0.24, 0.56, 0.4, M.vest, 0, 1.08, 0));
  drv.add(box(0.245, 0.05, 0.405, M.white, 0, 1.0, 0)); // reflecterende band
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), M.skin);
  head.position.set(0, 1.48, 0); head.castShadow = true; drv.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMaterial);
  cap.position.set(0, 1.5, 0); drv.add(cap);

  const [dx, dy] = hand, len = Math.hypot(dx, dy), phi = Math.atan2(-dx, dy);
  for (const s of [1, -1]) {
    const arm = box(0.07, len, 0.07, M.vest, dx / 2, 1.3 + dy / 2, s * 0.2);
    arm.rotation.z = phi; drv.add(arm);
    const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), M.skin);
    hnd.position.set(dx, 1.3 + dy, s * 0.16); drv.add(hnd);
  }
  return drv;
}
