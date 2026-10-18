import * as THREE from 'three';
import { RED } from '../config/dimensions.js';

export const mat = (c, o = {}) => new THREE.MeshStandardMaterial({
  color: c, roughness: o.r ?? 0.6, metalness: o.m ?? 0.1, transparent: !!o.op, opacity: o.op ?? 1,
});

// Gedeelde materialen
export const M = {
  navy: mat(0x173459, { r: 0.4, m: 0.15 }), red: mat(RED, { r: 0.45 }),
  steel: mat(0x2b3038, { r: 0.5, m: 0.5 }), steelL: mat(0x7b848f, { r: 0.4, m: 0.6 }),
  rubber: mat(0x1b1d21, { r: 0.9 }), pu: mat(0xd9c46a, { r: 0.7 }),
  grey: mat(0x9aa5b1, { r: 0.55 }), greyD: mat(0x5d6875, { r: 0.55 }),
  wood: mat(0xc8a27a, { r: 0.85 }), woodD: mat(0xa8835c, { r: 0.85 }),
  card: mat(0xc9a676, { r: 0.9 }), card2: mat(0xb8925f, { r: 0.9 }),
  wrap: mat(0xeef3f8, { r: 0.2, op: 0.22 }), vest: mat(0xff8a1f, { r: 0.7 }),
  skin: mat(0xe0b896, { r: 0.8 }), dark: mat(0x23303f, { r: 0.8 }),
  black: mat(0x111418, { r: 0.6 }), white: mat(0xffffff, { r: 0.5 }),
};

export function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.position.set(x, y, z); g.castShadow = true; g.receiveShadow = true;
  return g;
}

export function wheel(r, w, m, x, y, z) {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), m);
  g.rotation.x = Math.PI / 2; g.position.set(x, y, z); g.castShadow = true;
  return g;
}

// Tekst als textuur (logo, docklabels)
export function textTex(txt, bg, fg, w = 512, h = 128, font = 'italic 700 92px Oswald, Arial, sans-serif') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(txt, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
}

// Tekstvlak aan beide zijkanten van een voertuig
export function sideLabels(group, tex, w, h, x, y, halfWidth) {
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    p.position.set(x, y, s * halfWidth); p.rotation.y = s > 0 ? 0 : Math.PI;
    group.add(p);
  }
}
