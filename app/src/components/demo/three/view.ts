import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// One 3D view (product or crossdock race) as driven by the engine's render loop.
export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  step(dt: number): void;
  afterRender?(): void;
  baseFov: number;
  narrowFov: number; // portrait screens: zoom out
  dispose?(): void;
}
