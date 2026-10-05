export const $ = id => document.getElementById(id);

export const prefersReducedMotion = () =>
  !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// Grote titel bovenin beeld (voor de video)
let capTimer = 0;
export function caption(text) {
  const c = $('caption');
  if (text) { c.textContent = text; c.classList.add('on'); capTimer = 3.2; }
  else { c.classList.remove('on'); capTimer = 0; }
}
export function tickCaption(dt) {
  if (capTimer > 0) { capTimer -= dt; if (capTimer <= 0) $('caption').classList.remove('on'); }
}

export const fmtSeconds = s => s.toFixed(1).replace('.', ',') + ' s';
