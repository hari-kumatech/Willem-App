import * as THREE from 'three';
import { RED, type Dims } from './dims';

// Brand colours are given as sRGB hex; three ≥ r152 converts them to linear (ColorManagement on),
// and the renderer converts back with outputColorSpace = SRGBColorSpace.

const mat = (c: number, o: { r?: number; m?: number; op?: number } = {}) =>
  new THREE.MeshStandardMaterial({
    color: c,
    roughness: o.r ?? 0.6,
    metalness: o.m ?? 0.1,
    transparent: !!o.op,
    opacity: o.op ?? 1,
  });

export function createMaterials() {
  return {
    navy: mat(0x173459, { r: 0.4, m: 0.15 }),
    red: mat(RED, { r: 0.45 }),
    steel: mat(0x2b3038, { r: 0.5, m: 0.5 }),
    steelL: mat(0x7b848f, { r: 0.4, m: 0.6 }),
    rubber: mat(0x1b1d21, { r: 0.9 }),
    pu: mat(0xd9c46a, { r: 0.7 }),
    grey: mat(0x9aa5b1, { r: 0.55 }),
    greyD: mat(0x5d6875, { r: 0.55 }),
    wood: mat(0xc8a27a, { r: 0.85 }),
    woodD: mat(0xa8835c, { r: 0.85 }),
    card: mat(0xc9a676, { r: 0.9 }),
    card2: mat(0xb8925f, { r: 0.9 }),
    wrap: mat(0xeef3f8, { r: 0.2, op: 0.22 }),
    vest: mat(0xff8a1f, { r: 0.7 }),
    skin: mat(0xe0b896, { r: 0.8 }),
    dark: mat(0x23303f, { r: 0.8 }),
    black: mat(0x111418, { r: 0.6 }),
    white: mat(0xffffff, { r: 0.5 }),
  };
}
export type Materials = ReturnType<typeof createMaterials>;

// Everything a model builder needs: dimensions, shared materials, the loaded display font.
export interface Kit {
  D: Dims;
  M: Materials;
  fontFamily: string; // CSS family list of the loaded Oswald font (from --font-oswald)
}

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.position.set(x, y, z);
  g.castShadow = true;
  g.receiveShadow = true;
  return g;
}

export function wheel(r: number, w: number, m: THREE.Material, x: number, y: number, z: number) {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), m);
  g.rotation.x = Math.PI / 2;
  g.position.set(x, y, z);
  g.castShadow = true;
  return g;
}

// Font shorthand with the display font first, e.g. font(kit, 'italic 700 60px').
export const font = (kit: Kit, spec: string) => `${spec} ${kit.fontFamily}, Arial, sans-serif`;

// Text as texture (logo, dock labels). Only called after document.fonts.load() resolved.
export function textTex(txt: string, bg: string | null, fg: string, w = 512, h = 128, fontSpec = 'italic 700 92px Arial, sans-serif') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (x) {
    if (bg) {
      x.fillStyle = bg;
      x.fillRect(0, 0, w, h);
    }
    x.fillStyle = fg;
    x.font = fontSpec;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(txt, w / 2, h / 2 + 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Text plane on both sides of a vehicle
export function sideLabels(group: THREE.Object3D, tex: THREE.Texture, w: number, h: number, x: number, y: number, halfWidth: number) {
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    p.position.set(x, y, s * halfWidth);
    p.rotation.y = s > 0 ? 0 : Math.PI;
    group.add(p);
  }
}

// Frees GPU memory of a subtree. Materials in `keep` (shared kit materials) are left alone.
export function disposeTree(root: THREE.Object3D, keep?: Set<THREE.Material>) {
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    if ((o as THREE.Light).isLight) (o as THREE.Light).dispose(); // frees shadow map render targets
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      if (keep?.has(m)) continue;
      const map = (m as THREE.MeshBasicMaterial).map;
      if (map) textures.add(map);
      m.dispose();
    }
  });
  textures.forEach((t) => t.dispose());
}
