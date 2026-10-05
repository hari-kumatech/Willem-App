// Light intensities re-tuned for three r155+ (physically correct lighting is the only mode and
// output is sRGB). The original page used three 0.128 with legacy lights and linear output.
//  - Directional/hemisphere lights: legacy intensity × π gives the same irradiance.
//  - With sRGB output, weakly lit areas come out lighter than before (gamma lifts the shadows),
//    so the ambient (hemisphere) term is scaled down to keep the dark navy look of the original.
// Tune here if colours drift: brand navy #0e2038 / red #d6483d are unlit (background, MeshBasic)
// and therefore exact; only the shaded bodies depend on these factors.
const AMBIENT_FACTOR = 0.6;
const DIRECT_FACTOR = 0.95;

export const LIGHT = {
  hemi: (legacy: number) => legacy * Math.PI * AMBIENT_FACTOR,
  dir: (legacy: number) => legacy * Math.PI * DIRECT_FACTOR,
};
