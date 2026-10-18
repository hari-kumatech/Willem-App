import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FORK_IN, FORK_EXT, FORK_SPAN, PAL_L, EXT_TIME, RET_TIME, NAVY, RED } from '../config/dimensions.js';
import { makeTruck } from '../models/truck.js';
import { makePallet } from '../models/pallet.js';
import { $, prefersReducedMotion } from '../ui/dom.js';

// Productweergave: draaiende Mek-Rider, lepels uitschuiven, 0/1/2 pallets.
export function createProductScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NAVY);
  scene.fog = new THREE.Fog(NAVY, 9, 22);

  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x1a2a40, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(RED, 0.35); rim.position.set(-4, 3, -3); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.45); fill.position.set(-2, 4, 5); scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x24406a, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.63, 96), new THREE.MeshBasicMaterial({ color: 0x3b557a }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);

  const offset = 0.6; // truck centreren in beeld
  const truck = makeTruck(true);
  truck.root.position.x = offset;
  scene.add(truck.root);

  const pallets = [makePallet(0), makePallet(1)];
  pallets.forEach(p => { p.visible = false; truck.forks.add(p); });
  pallets[1].position.set(-PAL_L, 0, 0);

  // Maatlijn van lepelrug tot lepelpunt
  const ruler = new THREE.Group(); scene.add(ruler);
  const rulerMat = new THREE.MeshBasicMaterial({ color: RED });
  const rulerLine = new THREE.Mesh(new THREE.BoxGeometry(1, 0.004, 0.02), rulerMat); rulerLine.position.y = 0.003;
  const tickA = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.16), rulerMat), tickB = tickA.clone();
  ruler.add(rulerLine, tickA, tickB);
  ruler.position.z = FORK_SPAN / 2 + 0.28;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  camera.position.set(4.3, 2.6, 4.7);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 2.2, maxDistance: 9, maxPolarAngle: Math.PI * 0.48, autoRotate: !prefersReducedMotion(), autoRotateSpeed: 0.9 });
  controls.target.set(0, 0.55, 0);

  let extTarget = 0, nPal = 1;

  const markPallets = n => document.querySelectorAll('#palSeg button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.n === n));
  function setExtTarget(v) {
    extTarget = v;
    $('extBtn').textContent = v > 0 ? 'Lepels inschuiven' : 'Lepels uitschuiven';
    if (v === 0 && nPal === 2) { nPal = 1; markPallets(1); }
  }
  function setPallets(n) {
    nPal = n; markPallets(n);
    if (n === 2 && extTarget === 0) setExtTarget(FORK_EXT);
  }
  function updatePallets() {
    pallets[0].visible = nPal >= 1;
    pallets[1].visible = nPal >= 2 && truck.ext > FORK_EXT - 0.001; // tweede pallet pas als de lepels uit zijn
  }

  $('extBtn').onclick = () => setExtTarget(extTarget > 0 ? 0 : FORK_EXT);
  document.querySelectorAll('#palSeg button').forEach(b => { b.onclick = () => setPallets(+b.dataset.n); });
  const rotLabel = () => {
    $('rotBtn').textContent = 'Draaien: ' + (controls.autoRotate ? 'aan' : 'uit');
    $('rotBtn').setAttribute('aria-pressed', controls.autoRotate);
  };
  $('rotBtn').onclick = () => { controls.autoRotate = !controls.autoRotate; rotLabel(); };
  rotLabel();

  function step(dt) {
    if (Math.abs(truck.ext - extTarget) > 1e-4) {
      const rate = extTarget > truck.ext ? FORK_EXT / EXT_TIME : FORK_EXT / RET_TIME;
      truck.setExt(extTarget > truck.ext ? Math.min(extTarget, truck.ext + rate * dt) : Math.max(extTarget, truck.ext - rate * dt));
    }
    updatePallets();
    const L = FORK_IN + truck.ext;
    $('lenOut').firstChild.nodeValue = Math.round(L * 1000).toLocaleString('nl-NL');
    $('lenBar').style.width = (truck.ext / FORK_EXT * 100) + '%';
    rulerLine.scale.x = L; rulerLine.position.x = offset - L / 2;
    tickA.position.x = offset - 0.01; tickB.position.x = offset - L + 0.01;
    controls.update();
  }

  return { scene, camera, controls, step, baseFov: 38, narrowFov: 52 };
}
