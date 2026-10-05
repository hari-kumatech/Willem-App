import * as THREE from 'three';
import type { DemoMessages } from '@/i18n/messages/demo';
import { createCrossdockScene, type RaceState, type RaceView } from './crossdockScene';
import { makeDims, type ProductDims } from './dims';
import { createMaterials, disposeTree, type Kit } from './helpers';
import { createProductScene, type ProductState, type ProductView } from './productScene';
import type { View } from './view';

export type { ProductState, RaceState };

interface Common {
  host: HTMLElement; // the engine creates its own <canvas> in here and removes it on dispose
  product: Partial<ProductDims>;
  fontFamily: string;
  canvasLabel: string;
}

export type EngineOptions =
  | (Common & { mode: 'product'; reducedMotion: boolean; onProduct: (s: ProductState) => void })
  | (Common & {
      mode: 'race';
      t: DemoMessages;
      extendCaption: string;
      onRace: (s: RaceState) => void;
      onCaption: (text: string) => void;
      tags: { ept: HTMLElement | null; mek: HTMLElement | null };
    });

export interface Engine {
  product?: ProductView;
  race?: RaceView;
  resize(): void;
  dispose(): void;
}

// Creates renderer + one view and runs the render loop. Throws when WebGL is unavailable.
export function createEngine(opts: EngineOptions): Engine {
  // A fresh canvas per engine: after forceContextLoss() a canvas cannot get a new context,
  // and React StrictMode mounts → unmounts → mounts again.
  const canvas = document.createElement('canvas');
  canvas.className = 'block h-full w-full touch-none';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', opts.canvasLabel);
  opts.host.appendChild(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    canvas.remove();
    throw e;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap was removed in r18x (it logs a warning and falls back); PCFShadowMap is soft-filtered now.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const kit: Kit = { D: makeDims(opts.product), M: createMaterials(), fontFamily: opts.fontFamily };

  let view: View;
  const engine: Engine = { resize, dispose };
  if (opts.mode === 'product') {
    const p = createProductScene(kit, canvas, { reducedMotion: opts.reducedMotion, onState: opts.onProduct });
    engine.product = p;
    view = p;
  } else {
    const r = createCrossdockScene(kit, canvas, {
      t: opts.t,
      extendCaption: opts.extendCaption,
      onState: opts.onRace,
      onCaption: opts.onCaption,
      tags: opts.tags,
    });
    engine.race = r;
    view = r;
  }

  function resize() {
    const w = opts.host.clientWidth;
    const h = opts.host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    view.camera.aspect = w / h;
    view.camera.fov = w / h < 1 ? view.narrowFov : view.baseFov; // portrait: wider FOV
    view.camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(opts.host);
  resize();

  let raf = 0;
  let last = performance.now();
  let disposed = false;
  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    view.step(dt);
    renderer.render(view.scene, view.camera);
    view.afterRender?.();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    view.dispose?.();
    view.controls.dispose(); // removes pointer/wheel/key listeners from the canvas
    disposeTree(view.scene);
    Object.values(kit.M).forEach((m) => m.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  return engine;
}
