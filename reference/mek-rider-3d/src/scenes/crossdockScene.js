import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PAL_L, NAVY } from '../config/dimensions.js';
import { M, box, textTex } from '../three/helpers.js';
import { makeTruck } from '../models/truck.js';
import { makePallet } from '../models/pallet.js';
import { LANE_EPT, LANE_MEK, LANE_HALF, X_HOME, PICK, SPOT_A, SPOT_B, WALL_OUT, WALL_IN } from '../sim/layout.js';
import { buildPlan } from '../sim/plan.js';
import { stepLane } from '../sim/lane.js';
import { $, caption, tickCaption, fmtSeconds } from '../ui/dom.js';

function buildHall(scene) {
  scene.add(new THREE.HemisphereLight(0xe8eef6, 0x2a3a52, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(-6, 14, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 12, bottom: -12, near: 1, far: 40 });
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), new THREE.MeshStandardMaterial({ color: 0x5f6b79, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const yellow = new THREE.MeshBasicMaterial({ color: 0xe8b04a }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strip = (x0, x1, z, m, w = 0.08) => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, w), m);
    g.rotation.x = -Math.PI / 2; g.position.set((x0 + x1) / 2, 0.003, z); scene.add(g);
  };
  const rect = (x0, x1, z0, z1, m) => {
    strip(x0, x1, z0, m); strip(x0, x1, z1, m);
    for (const x of [x0, x1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.08, z1 - z0), m);
      s.rotation.x = -Math.PI / 2; s.position.set(x, 0.003, (z0 + z1) / 2); scene.add(s);
    }
  };
  for (const z of [LANE_EPT, LANE_MEK]) {
    strip(-15.8, 14.8, z - LANE_HALF, yellow); strip(-15.8, 14.8, z + LANE_HALF, yellow);
    rect(PICK - 2 * PAL_L - 0.15, PICK + 0.15, z - 0.55, z + 0.55, white);
    rect(SPOT_A - 0.12, SPOT_A + PAL_L + 0.12, z - 0.55, z + 0.55, white);
    rect(SPOT_B - 0.12, SPOT_B + PAL_L + 0.12, z - 0.55, z + 0.55, white);
    for (const [x, txt] of [[SPOT_A + PAL_L / 2, 'A'], [SPOT_B + PAL_L / 2, 'B']]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: textTex(txt, null, '#0e2038', 256, 256, '700 200px Oswald, Arial, sans-serif'), transparent: true }));
      p.rotation.x = -Math.PI / 2; p.position.set(x, 0.004, z + (z > 0 ? 1.55 : -1.55)); scene.add(p);
    }
  }

  // Wanden en dockdeuren
  const wallM = new THREE.MeshStandardMaterial({ color: 0x1a3558, roughness: 0.8 });
  scene.add(box(0.3, 3.2, 18, wallM, WALL_OUT + 0.15, 1.6, 0));
  scene.add(box(0.3, 3.2, 18, wallM, WALL_IN, 1.6, 0));
  const doorM = new THREE.MeshStandardMaterial({ color: 0x9fb0c4, roughness: 0.6, metalness: 0.2 });
  for (const z of [LANE_EPT, LANE_MEK]) {
    for (const [x, lbl] of [[WALL_OUT, 'UITGAAND'], [WALL_IN + 0.15, 'INKOMEND']]) {
      const inward = x > 0 ? -1 : 1;
      scene.add(box(0.08, 2.6, 2.6, doorM, x + inward * 0.02, 1.3, z));
      for (let i = 0; i < 8; i++) scene.add(box(0.09, 0.02, 2.6, M.greyD, x + inward * 0.03, 0.3 + i * 0.3, z));
      scene.add(box(0.1, 0.32, 2.9, M.red, x + inward * 0.04, 2.78, z));
      const lp = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.26), new THREE.MeshBasicMaterial({ map: textTex(lbl + ' DOCK', null, '#ffffff', 768, 84, 'italic 700 60px Oswald, Arial, sans-serif'), transparent: true }));
      lp.position.set(x + inward * 0.1, 2.78, z); lp.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(lp);
    }
  }
}

// Crossdock: standaard EPT (2 ritten) tegen Mek-Rider (1 rit), naast elkaar.
export function createCrossdockScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NAVY);
  buildHall(scene);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  camera.position.set(-0.4, 22, 21.5);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 8, maxDistance: 60, maxPolarAngle: Math.PI * 0.46 });
  controls.target.set(-0.4, 0, 1.6);

  let lanes = [], allPallets = [], running = false, finished = false, speed = 1;
  const isPallet = o => allPallets.includes(o);

  function makeLane(mek, z, seed) {
    const truck = makeTruck(mek); truck.root.position.set(X_HOME, 0, z); scene.add(truck.root);
    const pallets = [makePallet(seed), makePallet(seed + 1)];
    pallets[0].position.set(PICK, 0, z); pallets[1].position.set(PICK - PAL_L, 0, z);
    pallets.forEach(p => { scene.add(p); allPallets.push(p); });
    const lane = { mek, z, truck, pallets, queue: [], cur: null, v: 0, time: 0, dist: 0, rides: 0, done: false, status: 'Klaar om te starten' };
    lane.queue = buildPlan(lane);
    return lane;
  }

  function reset() {
    lanes.forEach(l => scene.remove(l.truck.root));
    allPallets.forEach(p => p.parent && p.parent.remove(p));
    allPallets = [];
    lanes = [makeLane(false, LANE_EPT, 0), makeLane(true, LANE_MEK, 1)];
    running = false; finished = false;
    $('playBtn').textContent = 'Start'; $('playBtn').disabled = false;
    $('result').classList.remove('on'); caption('');
    updateHud();
  }

  function updateHud() {
    const [E, K] = lanes;
    $('e-r').textContent = E.rides; $('e-t').textContent = fmtSeconds(E.time); $('e-d').textContent = Math.round(E.dist) + ' m'; $('e-s').textContent = E.status;
    $('m-r').textContent = K.rides; $('m-t').textContent = fmtSeconds(K.time); $('m-d').textContent = Math.round(K.dist) + ' m'; $('m-s').textContent = K.status;
  }

  function showResult() {
    const [E, K] = lanes;
    $('r-e').textContent = E.rides + ' ritten'; $('r-e2').textContent = fmtSeconds(E.time) + ', ' + Math.round(E.dist) + ' m';
    $('r-m').textContent = K.rides + ' rit'; $('r-m2').textContent = fmtSeconds(K.time) + ', ' + Math.round(K.dist) + ' m';
    const dPct = Math.round((1 - K.dist / E.dist) * 100), tPct = Math.round((1 - K.time / E.time) * 100);
    $('r-txt').textContent = `Voor deze klus rijdt de Mek-Rider ${dPct}% minder meters en is hij ${tPct}% sneller klaar. Hoe groter de afstand tussen de docks, hoe groter het verschil.`;
    $('result').classList.add('on');
  }

  $('playBtn').onclick = () => { if (finished) return; running = !running; $('playBtn').textContent = running ? 'Pauze' : 'Verder'; };
  $('resetBtn').onclick = reset;
  $('againBtn').onclick = () => { reset(); running = true; $('playBtn').textContent = 'Pauze'; };
  document.querySelectorAll('#spdSeg button').forEach(b => {
    b.onclick = () => { speed = +b.dataset.s; document.querySelectorAll('#spdSeg button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
  });

  function step(dt) {
    if (running) {
      lanes.forEach(l => stepLane(l, dt * speed, { scene, isPallet, onCaption: caption }));
      if (lanes.every(l => l.done) && !finished) {
        finished = true; running = false;
        $('playBtn').textContent = 'Start'; $('playBtn').disabled = true;
        caption('1 rit in plaats van 2');
        setTimeout(showResult, 1400);
      }
      updateHud();
    }
    tickCaption(dt);
    controls.update();
  }

  // Labels boven de trucks (HTML, geprojecteerd vanuit 3D)
  const tagEpt = Object.assign(document.createElement('div'), { className: 'tag', textContent: 'Standaard EPT' });
  const tagMek = Object.assign(document.createElement('div'), { className: 'tag mek', textContent: 'Mek-Rider' });
  $('tags').append(tagEpt, tagMek);
  const v = new THREE.Vector3();
  function place(el, obj) {
    obj.getWorldPosition(v); v.x += 0.4; v.y += 2.0; v.project(camera);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = ((v.x + 1) / 2 * canvas.clientWidth) + 'px';
    el.style.top = ((1 - v.y) / 2 * canvas.clientHeight) + 'px';
  }
  function afterRender() { place(tagEpt, lanes[0].truck.root); place(tagMek, lanes[1].truck.root); }

  reset();
  return { scene, camera, controls, step, afterRender, isFinished: () => finished, baseFov: 36, narrowFov: 62 };
}
