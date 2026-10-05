import * as THREE from 'three';
import './styles.css';
import { createProductScene } from './scenes/productScene.js';
import { createCrossdockScene } from './scenes/crossdockScene.js';
import { $, caption } from './ui/dom.js';

const canvas = $('cv');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  $('err').style.display = 'flex';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const views = { prod: createProductScene(canvas), dock: createCrossdockScene(canvas) };
let mode = 'prod';

function setMode(m) {
  mode = m;
  $('tabProd').setAttribute('aria-selected', m === 'prod');
  $('tabDock').setAttribute('aria-selected', m === 'dock');
  $('prodHud').hidden = m !== 'prod'; $('prodCtl').hidden = m !== 'prod';
  $('dockHud').hidden = m !== 'dock'; $('dockCtl').hidden = m !== 'dock';
  $('tags').hidden = m !== 'dock';
  $('result').classList.toggle('on', m === 'dock' && views.dock.isFinished());
  views.prod.controls.enabled = m === 'prod';
  views.dock.controls.enabled = m === 'dock';
  if (m !== 'dock') caption('');
  resize();
}

function resize() {
  const stage = $('stage'), w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  for (const v of Object.values(views)) {
    v.camera.aspect = w / h;
    v.camera.fov = w / h < 1 ? v.narrowFov : v.baseFov; // smalle schermen: verder uitzoomen
    v.camera.updateProjectionMatrix();
  }
}

$('tabProd').onclick = () => setMode('prod');
$('tabDock').onclick = () => setMode('dock');

// Opnamemodus: verbergt knoppen en panelen voor een schermopname
const setRec = on => { $('app').classList.toggle('rec', on); resize(); };
$('recBtn').onclick = () => setRec(true);
$('exitRec').onclick = () => setRec(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape') setRec(false); });

new ResizeObserver(resize).observe($('stage'));
setMode('prod');

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const v = views[mode];
  v.step(dt);
  renderer.render(v.scene, v.camera);
  v.afterRender?.();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
