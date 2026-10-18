import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DemoMessages } from '@/i18n/messages/demo';
import { NAVY } from './dims';
import { box, disposeTree, font, textTex, type Kit } from './helpers';
import { LIGHT } from './lighting';
import { makePallet, makeTruck } from './models';
import { LANE_EPT, LANE_HALF, LANE_MEK, PICK, SPOT_A, SPOT_B, WALL_IN, WALL_OUT, X_HOME, buildPlan, stepLane, type Lane } from './sim';
import type { View } from './view';

export interface LaneHud {
  rides: number;
  time: number;
  dist: number;
  status: string;
}

export interface RaceState {
  lanes: [LaneHud, LaneHud]; // [standard EPT, Mek-Rider]
  running: boolean;
  finished: boolean;
  showResult: boolean;
}

export interface RaceView extends View {
  togglePlay(): void;
  reset(): void;
  again(): void;
  setSpeed(s: number): void;
}

function buildHall(kit: Kit, scene: THREE.Scene, t: DemoMessages) {
  const { D, M } = kit;
  scene.add(new THREE.HemisphereLight(0xe8eef6, 0x2a3a52, LIGHT.hemi(0.55)));
  const sun = new THREE.DirectionalLight(0xffffff, LIGHT.dir(0.8));
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 12, bottom: -12, near: 1, far: 40 });
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), new THREE.MeshStandardMaterial({ color: 0x5f6b79, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const yellow = new THREE.MeshBasicMaterial({ color: 0xe8b04a });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strip = (x0: number, x1: number, z: number, m: THREE.Material, w = 0.08) => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, w), m);
    g.rotation.x = -Math.PI / 2;
    g.position.set((x0 + x1) / 2, 0.003, z);
    scene.add(g);
  };
  const rect = (x0: number, x1: number, z0: number, z1: number, m: THREE.Material) => {
    strip(x0, x1, z0, m);
    strip(x0, x1, z1, m);
    for (const x of [x0, x1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.08, z1 - z0), m);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.003, (z0 + z1) / 2);
      scene.add(s);
    }
  };
  for (const z of [LANE_EPT, LANE_MEK]) {
    strip(-15.8, 14.8, z - LANE_HALF, yellow);
    strip(-15.8, 14.8, z + LANE_HALF, yellow);
    rect(PICK - 2 * D.PAL_L - 0.15, PICK + 0.15, z - 0.55, z + 0.55, white);
    rect(SPOT_A - 0.12, SPOT_A + D.PAL_L + 0.12, z - 0.55, z + 0.55, white);
    rect(SPOT_B - 0.12, SPOT_B + D.PAL_L + 0.12, z - 0.55, z + 0.55, white);
    for (const [x, txt] of [
      [SPOT_A + D.PAL_L / 2, 'A'],
      [SPOT_B + D.PAL_L / 2, 'B'],
    ] as const) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshBasicMaterial({ map: textTex(txt, null, '#0e2038', 256, 256, font(kit, '700 200px')), transparent: true }),
      );
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, 0.004, z + (z > 0 ? 1.55 : -1.55));
      scene.add(p);
    }
  }

  // Walls and dock doors
  const wallM = new THREE.MeshStandardMaterial({ color: 0x1a3558, roughness: 0.8 });
  scene.add(box(0.3, 3.2, 18, wallM, WALL_OUT + 0.15, 1.6, 0));
  scene.add(box(0.3, 3.2, 18, wallM, WALL_IN, 1.6, 0));
  const doorM = new THREE.MeshStandardMaterial({ color: 0x9fb0c4, roughness: 0.6, metalness: 0.2 });
  const labels = new Map<string, THREE.Texture>();
  for (const z of [LANE_EPT, LANE_MEK]) {
    for (const [x, lbl] of [
      [WALL_OUT, t.dockOut],
      [WALL_IN + 0.15, t.dockIn],
    ] as const) {
      const inward = x > 0 ? -1 : 1;
      scene.add(box(0.08, 2.6, 2.6, doorM, x + inward * 0.02, 1.3, z));
      for (let i = 0; i < 8; i++) scene.add(box(0.09, 0.02, 2.6, M.greyD, x + inward * 0.03, 0.3 + i * 0.3, z));
      scene.add(box(0.1, 0.32, 2.9, M.red, x + inward * 0.04, 2.78, z));
      let tex = labels.get(lbl);
      if (!tex) {
        tex = textTex(lbl, null, '#ffffff', 768, 84, font(kit, 'italic 700 60px'));
        labels.set(lbl, tex);
      }
      const lp = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.26), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      lp.position.set(x + inward * 0.1, 2.78, z);
      lp.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(lp);
    }
  }
}

// Crossdock: standard EPT (2 trips) against Mek-Rider (1 trip), side by side.
export function createCrossdockScene(
  kit: Kit,
  canvas: HTMLCanvasElement,
  opts: {
    t: DemoMessages;
    extendCaption: string;
    onState: (s: RaceState) => void;
    onCaption: (text: string) => void;
    tags: { ept: HTMLElement | null; mek: HTMLElement | null };
  },
): RaceView {
  const { D, M } = kit;
  const { t } = opts;
  const shared = new Set<THREE.Material>(Object.values(M));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NAVY);
  buildHall(kit, scene, t);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  camera.position.set(-0.4, 22, 21.5);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 8, maxDistance: 60, maxPolarAngle: Math.PI * 0.46 });
  controls.target.set(-0.4, 0, 1.6);

  let lanes: Lane[] = [];
  let allPallets: THREE.Object3D[] = [];
  let running = false;
  let finished = false;
  let showResult = false;
  let speed = 1;
  let resultTimer: ReturnType<typeof setTimeout> | undefined;
  let lastKey = '';
  const isPallet = (o: THREE.Object3D) => allPallets.includes(o);

  function makeLane(mek: boolean, z: number, seed: number): Lane {
    const truck = makeTruck(kit, mek);
    truck.root.position.set(X_HOME, 0, z);
    scene.add(truck.root);
    const pallets = [makePallet(kit, seed), makePallet(kit, seed + 1)];
    pallets[0].position.set(PICK, 0, z);
    pallets[1].position.set(PICK - D.PAL_L, 0, z);
    pallets.forEach((p) => {
      scene.add(p);
      allPallets.push(p);
    });
    const lane: Lane = { mek, z, truck, pallets, queue: [], cur: null, v: 0, time: 0, dist: 0, rides: 0, done: false, status: t.ready };
    lane.queue = buildPlan(lane, D, { t, extendCaption: opts.extendCaption });
    return lane;
  }

  function emit(force = false) {
    const hud = (l: Lane): LaneHud => ({ rides: l.rides, time: l.time, dist: l.dist, status: l.status });
    const s: RaceState = { lanes: [hud(lanes[0]), hud(lanes[1])], running, finished, showResult };
    const key = JSON.stringify([s.lanes.map((l) => [l.rides, l.time.toFixed(1), Math.round(l.dist), l.status]), running, finished, showResult]);
    if (force || key !== lastKey) {
      lastKey = key;
      opts.onState(s);
    }
  }

  function reset() {
    // Cancel a pending result panel (A.8: it used to pop up after "Opnieuw")
    if (resultTimer) clearTimeout(resultTimer);
    resultTimer = undefined;
    lanes.forEach((l) => {
      scene.remove(l.truck.root);
      disposeTree(l.truck.root, shared);
    });
    allPallets.forEach((p) => {
      p.parent?.remove(p);
      disposeTree(p, shared);
    });
    allPallets = [];
    lanes = [makeLane(false, LANE_EPT, 0), makeLane(true, LANE_MEK, 1)];
    running = false;
    finished = false;
    showResult = false;
    opts.onCaption('');
    emit(true);
  }

  function step(dt: number) {
    if (running) {
      lanes.forEach((l) => stepLane(l, dt * speed, { scene, isPallet, onCaption: opts.onCaption, D, t }));
      if (lanes.every((l) => l.done) && !finished) {
        finished = true;
        running = false;
        opts.onCaption(t.cFinal);
        resultTimer = setTimeout(() => {
          resultTimer = undefined;
          showResult = true;
          emit(true);
        }, 1400);
      }
      emit();
    }
    controls.update(dt);
  }

  // Name tags above the trucks (HTML, projected from 3D)
  const v = new THREE.Vector3();
  function place(el: HTMLElement | null, obj: THREE.Object3D) {
    if (!el) return;
    obj.getWorldPosition(v);
    v.x += 0.4;
    v.y += 2.0;
    v.project(camera);
    if (v.z > 1) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.style.left = `${((v.x + 1) / 2) * canvas.clientWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * canvas.clientHeight}px`;
  }

  reset();
  return {
    scene,
    camera,
    controls,
    step,
    afterRender() {
      place(opts.tags.ept, lanes[0].truck.root);
      place(opts.tags.mek, lanes[1].truck.root);
    },
    baseFov: 36,
    narrowFov: 62,
    togglePlay() {
      if (finished) return;
      running = !running;
      emit(true);
    },
    reset,
    again() {
      reset();
      running = true;
      emit(true);
    },
    setSpeed(s) {
      speed = s;
    },
    dispose() {
      if (resultTimer) clearTimeout(resultTimer);
      resultTimer = undefined;
    },
  };
}
