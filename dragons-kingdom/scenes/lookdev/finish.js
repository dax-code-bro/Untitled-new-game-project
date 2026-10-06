// Shared photographic finish for the Episode 1 style frames (F1-F5).
//
// One place for what makes the five frames read as the same camera and the
// same film stock:
//   * 8 real sub-frames per frame across the 180-degree shutter, each with a
//     Halton sub-pixel jitter (8x supersampling: no stair-stepped rigging, no
//     roof moire, no sparkling scale highlights; true motion blur and true
//     sun penumbrae) - the runtime's 'accumulate' motion-blur mode;
//   * a print-film S-curve after AgX (real blacks, highlights that reach
//     white about four stops over grey);
//   * luminance-dependent grain at 4K (shot + read noise model, ~2-3 code
//     values in the mid-tones), mild red halation around strong highlights,
//     natural vignetting, lateral chromatic aberration only toward the corners.
//
//   import { filmFinish } from './finish.js';
//   export const meta = { cinematic: filmFinish({ atmosphere: {...}, grade: { exposure: 0.4 } }) };
//
// Cost: the sub-frames multiply the scene pass by 8 (see README, "Live-action
// style frames"). For fast checks render with --cinematic preview.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
  return out;
}

export const FILM_FINISH = {
  motionBlur: { mode: 'accumulate', accumulateSamples: 8, jitterAA: true, softShadows: true },
  bloom: { intensity: 0.018, halation: 0.1, halationThreshold: 0.9, halationTint: [1.0, 0.3, 0.1] },
  grade: { toneMapping: 'agx', look: 'print' },
  grain: { amount: 3.2, size: 1.3, chroma: 0.22 },
  lensFx: { vignette: 0.75, chromaticAberration: 0.3 },
};

/** The shared finish with per-frame overrides merged on top. */
export function filmFinish(over = {}) { return merge(FILM_FINISH, over); }
