import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NAVY, RED } from './dims';
import { LIGHT } from './lighting';
import { makePallet, makeTruck } from './models';
import type { Kit } from './helpers';
import type { View } from './view';

export interface ProductState {
  lengthMm: number; // current fork length
  extFraction: number; // 0..1
  extending: boolean; // target is "extended"
  pallets: 0 | 1 | 2;
  autoRotate: boolean;
}

export interface ProductView extends View {
  toggleExtend(): void;
  setPallets(n: 0 | 1 | 2): void;
  setAutoRotate(on: boolean): void;
}

// Product view: rotating Mek-Rider, forks extend, 0/1/2 pallets.
export function createProductScene(
  kit: Kit,
  canvas: HTMLCanvasElement,
  opts: { reducedMotion: boolean; onState: (s: ProductState) => void },
): ProductView {
  const { D } = kit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NAVY);
  scene.fog = new THREE.Fog(NAVY, 9, 22);

  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x1a2a40, LIGHT.hemi(0.55)));
  const sun = new THREE.DirectionalLight(0xffffff, LIGHT.dir(0.85));
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(RED, LIGHT.dir(0.35));
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbfd4ff, LIGHT.dir(0.45));
  fill.position.set(-2, 4, 5);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x24406a, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.63, 96), new THREE.MeshBasicMaterial({ color: 0x3b557a }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);

  const offset = 0.6; // centre the truck in view
  const truck = makeTruck(kit, true);
  truck.root.position.x = offset;
  scene.add(truck.root);

  const pallets = [makePallet(kit, 0), makePallet(kit, 1)];
  pallets.forEach((p) => {
    p.visible = false;
    truck.forks.add(p);
  });
  pallets[1].position.set(-D.PAL_L, 0, 0);

  // Floor ruler from fork face to fork tip
  const ruler = new THREE.Group();
  scene.add(ruler);
  const rulerMat = new THREE.MeshBasicMaterial({ color: RED });
  const rulerLine = new THREE.Mesh(new THREE.BoxGeometry(1, 0.004, 0.02), rulerMat);
  rulerLine.position.y = 0.003;
  const tickA = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.16), rulerMat);
  const tickB = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.16), rulerMat);
  ruler.add(rulerLine, tickA, tickB);
  ruler.position.z = D.FORK_SPAN / 2 + 0.28;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  camera.position.set(4.3, 2.6, 4.7);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true,
    dampingFactor: 0.08,
    minDistance: 2.2,
    maxDistance: 9,
    maxPolarAngle: Math.PI * 0.48,
    autoRotate: !opts.reducedMotion,
    autoRotateSpeed: 0.9,
  });
  controls.target.set(0, 0.55, 0);

  let extTarget = 0;
  let nPal: 0 | 1 | 2 = 1;
  let lastKey = '';

  function emit() {
    const s: ProductState = {
      lengthMm: Math.round((D.FORK_IN + truck.ext) * 1000),
      extFraction: truck.ext / D.FORK_EXT,
      extending: extTarget > 0,
      pallets: nPal,
      autoRotate: controls.autoRotate,
    };
    const key = `${s.lengthMm}|${s.extending}|${s.pallets}|${s.autoRotate}`;
    if (key !== lastKey) {
      lastKey = key;
      opts.onState(s);
    }
  }

  function setExtTarget(v: number) {
    extTarget = v;
    if (v === 0 && nPal === 2) nPal = 1; // retracting drops to 1 pallet
  }

  function step(dt: number) {
    if (Math.abs(truck.ext - extTarget) > 1e-4) {
      const out = extTarget > truck.ext;
      const rate = out ? D.FORK_EXT / D.EXT_TIME : D.FORK_EXT / D.RET_TIME;
      truck.setExt(out ? Math.min(extTarget, truck.ext + rate * dt) : Math.max(extTarget, truck.ext - rate * dt));
    }
    pallets[0].visible = nPal >= 1;
    pallets[1].visible = nPal >= 2 && truck.ext > D.FORK_EXT - 0.001; // 2nd pallet only when fully extended
    const L = D.FORK_IN + truck.ext;
    rulerLine.scale.x = L;
    rulerLine.position.x = offset - L / 2;
    tickA.position.x = offset - 0.01;
    tickB.position.x = offset - L + 0.01;
    controls.update(dt);
    emit();
  }

  return {
    scene,
    camera,
    controls,
    step,
    baseFov: 38,
    narrowFov: 52,
    toggleExtend: () => setExtTarget(extTarget > 0 ? 0 : D.FORK_EXT),
    setPallets(n) {
      nPal = n;
      if (n === 2 && extTarget === 0) setExtTarget(D.FORK_EXT); // 2 pallets auto-extends
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
  };
}
