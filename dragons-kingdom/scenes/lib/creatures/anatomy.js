// Procedural dragon anatomy: skeleton + SDF sculpt + part layout.
//
// PROVISIONAL DESIGN (see README.md in this folder): every species uses the
// same limb layout - FOUR LEGS + TWO WINGS (a hexapod "classic" dragon). The
// wings are a separate, third girdle on the back, just behind and above the
// front shoulders, driven by a large dorsal/pectoral flight-muscle mass. This
// is the layout the canon needs ("Nightwings can sit upright like dogs" with
// forelegs straight, legs that dig in for takeoff, "limbs or wings" in the
// screenplay). Whether Daxtyn's species are four-legged + wings or wyverns is
// an open question for him; the generator keeps limb layout in one place.
//
// Conventions (assets.json): metres, +y up, the creature faces +z, its LEFT is
// +x. Everything here is in the REST pose: standing, neck raised a little,
// tail straight back, wings spread, mouth slightly open (so the mouth interior
// exists as geometry).
//
// The sculpt follows real vertebrate anatomy rather than tubes: a deep
// ribcage, shoulder blades on the sides of the chest, the upper arm and thigh
// inside the body's skin envelope (the visible leg starts at the elbow/knee),
// triceps, biceps, pectorals, forearm extensors/flexors, glutes, quadriceps,
// hamstrings, the reptilian caudofemoralis from the tail base to the thigh,
// calf and Achilles tendon, a hanging belly, loose skin folds at the throat,
// armpits and flanks (projected onto the sculpted surface), a continuous
// dorsal crest, and a reptilian head (wide temporal jaw muscles, a gape that
// runs back past the eye, a bony brow over a lateral eye, horns swept back
// along the line of the neck).
//
// All proportions are fractions of the total length L (snout tip to tail tip
// measured along the rest spine).

import { SDFModel, add, sub, scale, dot, cross, norm, len, lerp3, clamp, mix } from './sdf.js';

// ------------------------------------------------------------- utilities
/** Monotone-ish cubic interpolation through keys [[s, ...values]] at s. */
export function profileAt(keys, s) {
  const n = keys.length;
  if (s <= keys[0][0]) return keys[0].slice(1);
  if (s >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0;
  while (i < n - 2 && s > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const u = (s - k1[0]) / (k2[0] - k1[0]);
  const u2 = u * u, u3 = u2 * u;
  const out = [];
  for (let c = 1; c < k1.length; c++) {
    const m1 = (k2[c] - k0[c]) / Math.max(1e-6, (k2[0] - k0[0])) * (k2[0] - k1[0]);
    const m2 = (k3[c] - k1[c]) / Math.max(1e-6, (k3[0] - k1[0])) * (k2[0] - k1[0]);
    let v = (2 * u3 - 3 * u2 + 1) * k1[c] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[c] + (u3 - u2) * m2;
    v = clamp(v, Math.min(k1[c], k2[c]), Math.max(k1[c], k2[c]));
    out.push(v);
  }
  return out;
}

/** Rotate vector v about unit axis a by angle (Rodrigues). */
export function rotAxis(v, a, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(a, v);
  const cr = cross(a, v);
  return [v[0] * c + cr[0] * s + a[0] * d * (1 - c), v[1] * c + cr[1] * s + a[1] * d * (1 - c), v[2] * c + cr[2] * s + a[2] * d * (1 - c)];
}

/** Polyline arc-length sampler. */
export function polyline(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + len(sub(points[i], points[i - 1])));
  const total = cum[cum.length - 1];
  const at = (d) => {
    d = clamp(d, 0, total);
    let i = 0;
    while (i < points.length - 2 && cum[i + 1] < d) i++;
    const t = (d - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i]);
    return { p: lerp3(points[i], points[i + 1], t), seg: i, t, tan: norm(sub(points[i + 1], points[i])) };
  };
  return { points, cum, total, at };
}

/** Quadratic Bezier sampled into n+1 points. */
function bez(a, b, c, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]]);
  }
  return out;
}

const deg = Math.PI / 180;
const hsh = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7 + 0.5) * 43758.5453; return x - Math.floor(x); };

// ------------------------------------------------------------ species presets
// Lengths: fractions of L. Profiles: [s, halfWidth, halfHeight, drop] where drop
// moves the cross-section centre below the dorsal spine line (deep chest).
//   neckProfile s: 0 = behind the head .. 1 = withers; torsoProfile s: 0 = withers .. 1 = pelvis;
//   tailProfile s: 0 = tail base .. 1 = tip.
// Legs: front.shoulder = [x, dy from withersY, z as fraction of torso];
//       elbow/wrist/ball = [x, y above ground, dz from the shoulder].
//       hind.hip = [x, dy from hipY, z]; knee/ankle/ball = [x, y, z] absolute.
// Wings: root = [x, dy from withersY, z as fraction of torso]; elbow, wrist,
//       digit tips and membrane attachment = offsets from the root
//       ([lateral, up, forward], mirrored per side); thumb = offset from the wrist.
// Head: loft keys [z, halfWidth, top, bottom] in head lengths (z: 0 = skull
//       joint, 1 = snout tip); `jaw` the same for the closed lower jaw.
// muscle: multipliers for the muscle groups (1 = an athletic adult).
export const SPECIES = {
  bashion: {
    species: 'Bashion',
    head: 0.112, neck: 0.165, torso: 0.262, neckSegs: 10, tailSegs: 24,
    hipY: 0.214, withersY: 0.232, backArch: 0.01, neckPitch: 26 * deg, headPitch: -27 * deg, tailDroop: 14 * deg, tailCurve: 0.6,
    neckProfile: [[0, 0.025, 0.031, 0.002], [0.3, 0.031, 0.039, 0.004], [0.65, 0.04, 0.05, 0.01], [1, 0.057, 0.068, 0.025]],
    torsoProfile: [[0, 0.058, 0.066, 0.032], [0.2, 0.068, 0.078, 0.046], [0.45, 0.064, 0.068, 0.042], [0.7, 0.057, 0.057, 0.032], [0.88, 0.052, 0.05, 0.02], [1, 0.054, 0.05, 0.014]],
    tailProfile: [[0, 0.055, 0.054, 0.012], [0.12, 0.046, 0.047, 0.007], [0.35, 0.029, 0.031, 0.003], [0.65, 0.0145, 0.0155, 0], [1, 0.0025, 0.0025, 0]],
    front: { shoulder: [0.044, -0.07, 0.86], elbow: [0.053, 0.108, -0.04], wrist: [0.052, 0.042, -0.01], ball: [0.053, 0.012, 0.016],
      r: [0.032, 0.025, 0.0195, 0.017], toeLen: 0.038, toeR: [0.0095, 0.006], toeSpread: 15, toes: 4, muscle: 1.0 },
    hind: { hip: [0.045, -0.026, 0.01], knee: [0.058, 0.128, 0.05], ankle: [0.055, 0.066, -0.022], ball: [0.055, 0.012, 0.002],
      r: [0.037, 0.026, 0.019, 0.017], toeLen: 0.04, toeR: [0.0098, 0.0062], toeSpread: 14, toes: 4, muscle: 1.0 },
    wing: { root: [0.032, 0.006, 0.8], elbow: [0.152, 0.016, -0.05], wrist: [0.315, 0.025, -0.01],
      digits: [[0.66, 0.02, 0.035], [0.615, 0.012, -0.135], [0.515, 0.004, -0.255], [0.385, -0.004, -0.325]],
      thumb: [0.011, 0.007, 0.016], r: [0.019, 0.012, 0.0094], fingerR: [0.0056, 0.0016], muscle: 1.1,
      attach: [[0.006, -0.014, -0.03], [0.014, -0.034, -0.11], [0.017, -0.047, -0.19]], billow: 0.035 },
    headShape: {
      // a deep, heavy head: a high crown and brow, a broad deep snout (not a crocodile's flat
      // one) with a nasal bump, a massive lower jaw
      upper: [[-0.1, 0.24, 0.15, -0.12], [0.0, 0.285, 0.2, -0.1], [0.12, 0.31, 0.232, -0.09], [0.28, 0.3, 0.222, -0.088], [0.42, 0.258, 0.172, -0.085],
        [0.58, 0.218, 0.142, -0.082], [0.74, 0.188, 0.126, -0.08], [0.88, 0.162, 0.118, -0.076], [1.0, 0.112, 0.084, -0.066]],
      jaw: [[0.0, 0.29, -0.08, -0.33], [0.12, 0.3, -0.08, -0.33], [0.3, 0.27, -0.08, -0.275], [0.5, 0.232, -0.08, -0.225],
        [0.7, 0.196, -0.078, -0.192], [0.86, 0.166, -0.075, -0.174], [0.98, 0.118, -0.072, -0.15]],
      eye: [0.262, 0.13, 0.31], eyeR: 0.052, eyeInset: 0.5, brow: 1.55, cheek: 1.15, jawMuscle: 1.25, ridgeR: 0.024, hinge: [0, -0.09, 0.035], gape0: 14 * deg, nostril: 1.15,
      teethUp: 15, teethSize: 0.06, lipCover: 0.55, tympanum: 1,
    },
    horns: 'bashion', crest: { count: 92, h: [0.0042, 0.0105, 0.0032], base: 1.15 },
    scale: { body: 0.0042, belly: 0.012, head: 0.0032 },   // scale width in L units at the chain's median radius
    muscle: { shoulder: 1.1, arm: 1.1, pec: 1.05, thigh: 1.05, tailbase: 1.1, belly: 0.85, neck: 1.1, wing: 1.05 },
    folds: { throat: 4, axilla: 0, stifle: 0, neck: 2, tail: 3 },
  },
  nightwing: {
    species: 'Nightwing',
    head: 0.1, neck: 0.18, torso: 0.225, neckSegs: 12, tailSegs: 26,
    hipY: 0.195, withersY: 0.21, backArch: 0.008, neckPitch: 25 * deg, headPitch: -28 * deg, tailDroop: 12 * deg, tailCurve: 0.5,
    neckProfile: [[0, 0.0158, 0.02, 0.001], [0.3, 0.021, 0.027, 0.003], [0.7, 0.03, 0.038, 0.008], [1, 0.042, 0.053, 0.017]],
    torsoProfile: [[0, 0.043, 0.053, 0.025], [0.2, 0.048, 0.062, 0.038], [0.45, 0.047, 0.054, 0.034], [0.7, 0.041, 0.044, 0.025], [0.88, 0.036, 0.038, 0.016], [1, 0.036, 0.036, 0.01]],
    tailProfile: [[0, 0.037, 0.038, 0.008], [0.14, 0.03, 0.032, 0.005], [0.4, 0.018, 0.019, 0.001], [0.7, 0.0088, 0.0095, 0], [1, 0.0015, 0.0015, 0]],
    front: { shoulder: [0.032, -0.058, 0.85], elbow: [0.038, 0.1, -0.03], wrist: [0.037, 0.035, -0.004], ball: [0.037, 0.007, 0.016],
      r: [0.025, 0.018, 0.0132, 0.012], toeLen: 0.028, toeR: [0.006, 0.0036], toeSpread: 15, toes: 4, muscle: 1.0 },
    hind: { hip: [0.033, -0.02, 0.008], knee: [0.043, 0.11, 0.052], ankle: [0.041, 0.045, -0.03], ball: [0.041, 0.007, -0.004],
      r: [0.031, 0.02, 0.0135, 0.012], toeLen: 0.031, toeR: [0.0062, 0.0037], toeSpread: 14, toes: 4, muscle: 1.0 },
    wing: { root: [0.027, 0.006, 0.8], elbow: [0.152, 0.016, -0.05], wrist: [0.322, 0.025, -0.01],
      digits: [[0.765, 0.02, 0.03], [0.71, 0.012, -0.155], [0.59, 0.004, -0.29], [0.44, -0.004, -0.36]],
      thumb: [0.01, 0.006, 0.015], r: [0.0158, 0.0098, 0.0076], fingerR: [0.0046, 0.0013], muscle: 1.0,
      attach: [[0.005, -0.012, -0.03], [0.011, -0.028, -0.1], [0.013, -0.04, -0.175]], billow: 0.04 },
    headShape: {
      upper: [[-0.1, 0.19, 0.11, -0.11], [0.02, 0.228, 0.144, -0.095], [0.14, 0.25, 0.162, -0.086], [0.28, 0.236, 0.152, -0.081], [0.42, 0.198, 0.115, -0.077],
        [0.58, 0.16, 0.088, -0.074], [0.74, 0.136, 0.073, -0.07], [0.88, 0.118, 0.064, -0.065], [1.0, 0.086, 0.048, -0.05]],
      jaw: [[0.0, 0.216, -0.08, -0.22], [0.12, 0.22, -0.08, -0.228], [0.3, 0.196, -0.08, -0.185], [0.5, 0.162, -0.078, -0.148],
        [0.7, 0.134, -0.075, -0.122], [0.88, 0.114, -0.072, -0.108], [0.98, 0.084, -0.07, -0.096]],
      eye: [0.208, 0.096, 0.29], eyeR: 0.064, eyeInset: 0.5, brow: 1.25, cheek: 0.85, jawMuscle: 0.9, ridgeR: 0.021, hinge: [0, -0.09, 0.04], gape0: 14 * deg, nostril: 0.85,
      teethUp: 14, teethSize: 0.05, lipCover: 0.5, tympanum: 1,
    },
    horns: 'nightwing', crest: { count: 104, h: [0.0028, 0.0072, 0.0022], base: 1.1 },
    scale: { body: 0.0045, belly: 0.0095, head: 0.003 },
    muscle: { shoulder: 1, arm: 1, pec: 1, thigh: 1, tailbase: 1, belly: 0.9, neck: 1, wing: 1.05 },
    folds: { throat: 3, axilla: 1, stifle: 1, neck: 2, tail: 2 },
  },
  slitherwing: {
    species: 'Slitherwing',
    head: 0.062, neck: 0.16, torso: 0.215, neckSegs: 10, tailSegs: 30,
    hipY: 0.1, withersY: 0.106, backArch: 0.004, neckPitch: 12 * deg, headPitch: -14 * deg, tailDroop: 4 * deg, tailCurve: 0.3,
    neckProfile: [[0, 0.0145, 0.0135, 0.0], [0.5, 0.017, 0.0165, 0.002], [1, 0.024, 0.023, 0.006]],
    torsoProfile: [[0, 0.026, 0.026, 0.008], [0.3, 0.03, 0.032, 0.013], [0.6, 0.029, 0.03, 0.012], [0.85, 0.025, 0.025, 0.008], [1, 0.024, 0.023, 0.006]],
    tailProfile: [[0, 0.022, 0.021, 0.005], [0.2, 0.0155, 0.0145, 0.002], [0.5, 0.0085, 0.008, 0], [0.8, 0.0042, 0.0042, 0], [1, 0.0011, 0.0011, 0]],
    front: { shoulder: [0.022, -0.026, 0.8], elbow: [0.028, 0.054, -0.016], wrist: [0.028, 0.02, 0.003], ball: [0.028, 0.005, 0.014],
      r: [0.0105, 0.0068, 0.0048, 0.0044], toeLen: 0.014, toeR: [0.0026, 0.0015], toeSpread: 16, toes: 4, muscle: 0.7 },
    hind: { hip: [0.023, -0.02, 0.0], knee: [0.031, 0.054, 0.028], ankle: [0.029, 0.023, -0.012], ball: [0.029, 0.005, 0.003],
      r: [0.013, 0.008, 0.0052, 0.0046], toeLen: 0.015, toeR: [0.0028, 0.0015], toeSpread: 14, toes: 4, muscle: 0.7 },
    // narrow, swept, high-aspect wings set far forward (a swift's wing, not a bat's)
    wing: { root: [0.02, 0.007, 1.0], elbow: [0.1, 0.01, -0.05], wrist: [0.235, 0.016, -0.06],
      digits: [[0.6, 0.012, -0.13], [0.54, 0.008, -0.19], [0.42, 0.004, -0.215], [0.3, 0.0, -0.22]],
      thumb: [0.014, 0.006, 0.02], r: [0.011, 0.0068, 0.0055], fingerR: [0.0032, 0.0009], muscle: 0.85,
      attach: [[0.004, -0.007, -0.03], [0.006, -0.012, -0.075], [0.007, -0.015, -0.12]], billow: 0.03 },
    headShape: {
      upper: [[-0.1, 0.16, 0.085, -0.08], [0.05, 0.172, 0.105, -0.066], [0.2, 0.168, 0.112, -0.06], [0.35, 0.146, 0.104, -0.058], [0.5, 0.12, 0.088, -0.056],
        [0.7, 0.096, 0.07, -0.054], [0.88, 0.076, 0.054, -0.05], [1.0, 0.05, 0.036, -0.04]],
      jaw: [[0.0, 0.15, -0.065, -0.15], [0.15, 0.15, -0.065, -0.158], [0.35, 0.125, -0.064, -0.138], [0.6, 0.094, -0.062, -0.112], [0.85, 0.068, -0.06, -0.097], [0.98, 0.048, -0.058, -0.088]],
      eye: [0.15, 0.065, 0.36], eyeR: 0.066, eyeInset: 0.58, brow: 0.6, cheek: 0.5, jawMuscle: 0.6, ridgeR: 0.018, hinge: [0, -0.07, 0.06], gape0: 13 * deg, nostril: 0.7,
      teethUp: 16, teethSize: 0.045, lipCover: 0.45, tympanum: 0.6,
    },
    horns: 'slitherwing', crest: { count: 120, h: [0.0012, 0.0028, 0.001], base: 1.0 },
    scale: { body: 0.0035, belly: 0.008, head: 0.0026 },
    muscle: { shoulder: 0.8, arm: 0.8, pec: 0.85, thigh: 0.8, tailbase: 0.9, belly: 0.6, neck: 0.85, wing: 1.1 },
    folds: { throat: 2, axilla: 1, stifle: 1, neck: 1, tail: 0 },
  },
};

// Newborn Bashion: a big rounded head with a short snout and huge eyes, a short
// neck, a plump body with a soft belly (yolk scar), short weak legs with soft
// claws, a short curled tail, tiny damp wings held folded, horn buds and an egg
// tooth on the snout. Proportions after newborn crocodilians and monitor
// hatchlings (head about a fifth of the snout-vent length, eyes ~40% of the
// head height).
SPECIES.bashion_hatchling = {
  ...SPECIES.bashion,
  species: 'Bashion (hatchling)',
  head: 0.145, neck: 0.066, torso: 0.25, neckSegs: 8, tailSegs: 18,
  hipY: 0.128, withersY: 0.136, backArch: 0.018, neckPitch: 18 * deg, headPitch: -22 * deg, tailDroop: 20 * deg, tailCurve: 0.65,
  neckProfile: [[0, 0.05, 0.055, 0.004], [0.5, 0.054, 0.06, 0.009], [1, 0.064, 0.07, 0.02]],
  torsoProfile: [[0, 0.068, 0.072, 0.028], [0.3, 0.082, 0.086, 0.046], [0.6, 0.086, 0.088, 0.052], [0.85, 0.074, 0.076, 0.04], [1, 0.064, 0.064, 0.022]],
  tailProfile: [[0, 0.056, 0.054, 0.014], [0.2, 0.038, 0.037, 0.006], [0.5, 0.02, 0.02, 0.001], [0.8, 0.0095, 0.0095, 0], [1, 0.003, 0.003, 0]],
  front: { shoulder: [0.054, -0.042, 0.8], elbow: [0.068, 0.054, -0.012], wrist: [0.066, 0.022, 0.006], ball: [0.066, 0.009, 0.024],
    r: [0.028, 0.021, 0.0165, 0.0155], toeLen: 0.024, toeR: [0.0082, 0.0055], toeSpread: 18, toes: 4, muscle: 1.0 },
  hind: { hip: [0.054, -0.03, 0.0], knee: [0.07, 0.056, 0.04], ankle: [0.068, 0.024, -0.008], ball: [0.068, 0.009, 0.012],
    r: [0.034, 0.022, 0.0165, 0.0155], toeLen: 0.026, toeR: [0.0085, 0.0055], toeSpread: 16, toes: 4, muscle: 1.0 },
  wing: { root: [0.042, 0.012, 0.74], elbow: [0.07, 0.01, -0.025], wrist: [0.14, 0.016, -0.005],
    digits: [[0.27, 0.012, 0.015], [0.255, 0.008, -0.045], [0.225, 0.005, -0.095], [0.18, 0.0, -0.125]],
    thumb: [0.012, 0.006, 0.018], r: [0.015, 0.0098, 0.0082], fingerR: [0.0042, 0.0018], muscle: 0.35,
    attach: [[0.007, -0.012, -0.03], [0.014, -0.022, -0.09], [0.016, -0.03, -0.15]], billow: 0.02 },
  headShape: {
    // a domed cranium that takes up most of the head, and a short, soft, rounded snout
    upper: [[-0.1, 0.34, 0.3, -0.17], [0.06, 0.41, 0.46, -0.155], [0.24, 0.44, 0.52, -0.145], [0.42, 0.42, 0.47, -0.14], [0.58, 0.36, 0.36, -0.135],
      [0.72, 0.3, 0.27, -0.13], [0.84, 0.25, 0.2, -0.12], [0.94, 0.205, 0.155, -0.108], [1.0, 0.15, 0.11, -0.092]],
    jaw: [[0.0, 0.31, -0.148, -0.35], [0.15, 0.32, -0.148, -0.36], [0.35, 0.295, -0.148, -0.322], [0.55, 0.258, -0.145, -0.272],
      [0.75, 0.215, -0.142, -0.228], [0.9, 0.175, -0.139, -0.196], [0.98, 0.135, -0.136, -0.176]],
    eye: [0.37, 0.2, 0.44], eyeR: 0.14, eyeInset: 0.5, orbit: 1.5, eyeExpose: 48, brow: 0.35, cheek: 0.45, jawMuscle: 0.35, ridgeR: 0.026, hinge: [0, -0.15, 0.07], gape0: 11 * deg, nostril: 0.6,
    teethUp: 0, teethSize: 0.0, lipCover: 1, tympanum: 0.4, eggTooth: true, soft: true,
  },
  horns: 'buds', crest: { count: 30, h: [0.0015, 0.0026, 0.001], base: 1.0 },
  scale: { body: 0.0034, belly: 0.006, head: 0.0028 },
  muscle: { shoulder: 0.45, arm: 0.4, pec: 0.5, thigh: 0.45, tailbase: 0.7, belly: 1.4, neck: 0.6, wing: 0.35 },
  folds: { throat: 3, axilla: 1, stifle: 1, neck: 3, tail: 0, soft: true },
  surfaceNoise: 0.0016,
};

// ------------------------------------------------------------- the builder
/**
 * Build the anatomy for a species preset at total length L (metres).
 * Returns { L, spec, bones:[{name,parent,pos}], sdf: SDFModel, chains, eyes, keratin, wings, sockets }.
 */
export function buildAnatomy(spec, L, opts = {}) {
  const S = (v) => v * L;
  const sv = (a) => a.map((x) => x * L);
  const m = new SDFModel();
  // sculpted irregularity (no animal is a perfect blend of ellipsoids)
  m.noise = { amp: L * (spec.surfaceNoise ?? 0.0011), freq: 1 / (L * 0.016) };
  const bones = [];
  const bonePos = {};
  const bone = (name, parent, pos) => { bones.push({ name, parent, pos: [...pos] }); bonePos[name] = [...pos]; return name; };
  const chains = {};
  const keratin = [];     // {kind, bone, points:[...], radii:[...], flat?, tag}
  const eyes = [];
  const sockets = {};
  const MU = { shoulder: 1, arm: 1, pec: 1, thigh: 1, tailbase: 1, belly: 1, neck: 1, wing: 1, ...(spec.muscle || {}) };

  // ---------------------------------------------------------------- spine
  const T = spec.torso, N = spec.neck, Hn = spec.head;
  const tailLen = Math.max(0.1, 1 - T - N - Hn);
  // torso joints from pelvis (z=0) forward
  const torsoF = [0, 0.3, 0.55, 0.8, 1];
  const torsoPts = torsoF.map((f) => [0, mix(spec.hipY, spec.withersY, f) + spec.backArch * Math.sin(Math.PI * f), f * T]);
  // neck: straight at neckPitch from the withers (poses curve it)
  const nd = [0, Math.sin(spec.neckPitch), Math.cos(spec.neckPitch)];
  const neckPts = [];
  for (let i = 0; i <= spec.neckSegs; i++) neckPts.push(add(torsoPts[4], scale(nd, N * i / spec.neckSegs)));
  const headJoint = neckPts[spec.neckSegs];
  // tail: droops then levels off (quadratic), from the pelvis backward
  const tailPts = [];
  const tdir0 = [0, -Math.sin(spec.tailDroop), -Math.cos(spec.tailDroop)];
  const tailEnd = add(torsoPts[0], [0, -Math.sin(spec.tailDroop) * tailLen * (1 - spec.tailCurve), -tailLen * 0.985]);
  const tailCtl = add(torsoPts[0], scale(tdir0, tailLen * 0.5));
  const tailCurve = polyline(bez(torsoPts[0], tailCtl, tailEnd, 64));
  const segLens = [];
  { let w = 0; for (let i = 0; i < spec.tailSegs; i++) { const l = Math.pow(0.975, i); segLens.push(l); w += l; } for (let i = 0; i < spec.tailSegs; i++) segLens[i] *= tailCurve.total / w; }
  { let d = 0; tailPts.push(tailCurve.at(0).p); for (let i = 0; i < spec.tailSegs; i++) { d += segLens[i]; tailPts.push(tailCurve.at(d).p); } }

  // bones (normalized -> metres via sv); hierarchy rooted at 'body'
  const tp = (p) => sv(p);
  bone('body', null, tp(torsoPts[2]));
  bone('lumbar', 'body', tp(torsoPts[1]));
  bone('pelvis', 'lumbar', tp(torsoPts[0]));
  bone('thorax', 'body', tp(torsoPts[3]));
  bone('rib_lumbar', 'lumbar', tp(torsoPts[1]));
  bone('rib_body', 'body', tp(torsoPts[2]));
  bone('rib_thorax', 'thorax', tp(torsoPts[3]));
  for (let i = 0; i < spec.neckSegs; i++) bone(`neck_${i}`, i === 0 ? 'thorax' : `neck_${i - 1}`, tp(neckPts[i]));
  bone('head', `neck_${spec.neckSegs - 1}`, tp(headJoint));
  for (let i = 0; i < spec.tailSegs; i++) bone(`tail_${i}`, i === 0 ? 'lumbar' : `tail_${i - 1}`, tp(tailPts[i]));

  // the spine as ONE polyline from tail tip to head joint (normalized units)
  const spinePts = [...tailPts.slice().reverse(), ...torsoPts.slice(1), ...neckPts.slice(1)];
  const segBone = [];
  for (let i = spec.tailSegs - 1; i >= 0; i--) segBone.push(`tail_${i}`);
  segBone.push('rib_lumbar', 'rib_body', 'rib_body', 'rib_thorax');
  for (let i = 0; i < spec.neckSegs; i++) segBone.push(`neck_${i}`);
  const spine = polyline(spinePts);
  const dTail = spine.cum[spec.tailSegs], dWithers = spine.cum[spec.tailSegs + 4];
  const profile = (d) => {
    if (d <= dTail) { const s = 1 - d / dTail; return profileAt(spec.tailProfile, s); }
    if (d <= dWithers) { const s = 1 - (d - dTail) / (dWithers - dTail); return profileAt(spec.torsoProfile, s); }
    const s = 1 - (d - dWithers) / (spine.total - dWithers); return profileAt(spec.neckProfile, s);
  };
  const upAt = (tan) => norm([0, tan[2], -tan[1]]);   // dorsal direction in the sagittal plane (tan points headward)
  const boneAtD = (d) => segBone[Math.min(spine.at(d).seg, segBone.length - 1)];
  const tagAtD = (d) => d < dTail ? 'tail' : d < dWithers ? 'torso' : 'neck';
  /** cross-section frame at spine arc length d: centre, up, side, tangent, [hw, hh] */
  const section = (d) => {
    const a = spine.at(d), pr = profile(d), up = upAt(a.tan);
    return { c: sub(a.p, scale(up, pr[2])), up, side: norm(cross(up, a.tan)), tan: a.tan, hw: pr[0], hh: pr[1], drop: pr[2], spineP: a.p };
  };
  // dense round cones along the spine
  {
    let d = 0;
    const samples = [];
    while (d < spine.total) {
      const pr = profile(d);
      samples.push(d);
      d += Math.max(0.0035, Math.min(0.02, 0.55 * Math.min(pr[0], pr[1])));
    }
    samples.push(spine.total);
    const gSpine = m.group();
    for (let i = 0; i < samples.length - 1; i++) {
      const d0 = samples[i], d1 = samples[i + 1];
      const a = spine.at(d0), b = spine.at(d1);
      const pa = profile(d0), pb = profile(d1);
      const ua = upAt(a.tan), ub = upAt(b.tan);
      const ca = sub(a.p, scale(ua, pa[2])), cb = sub(b.p, scale(ub, pb[2]));
      const ra = Math.sqrt(pa[0] * pa[1]), rb = Math.sqrt(pb[0] * pb[1]);
      const sx = 0.5 * (pa[0] / ra + pb[0] / rb), sy = 0.5 * (pa[1] / ra + pb[1] / rb);
      const mid = spine.at(0.5 * (d0 + d1));
      m.cone(sv(ca), sv(cb), S(ra), S(rb), { sx, sy, up: norm(add(ua, ub)), k: S(0.004), grp: gSpine, bone: segBone[Math.min(mid.seg, segBone.length - 1)],
        chain: 'spine', s0: S(d0), s1: S(d1), tag: tagAtD(d0) });
    }
  }
  chains.spine = { points: spinePts.map(sv), refUp: [0, 1, 0], kind: 'spine' };
  sockets.withers = { bone: 'neck_0', pos: sv(add(torsoPts[4], [0, 0.0, 0])) };
  const dAtTorso = (s) => dWithers - s * (dWithers - dTail);    // torso s (0 withers .. 1 pelvis) -> arc length
  const dAtNeck = (s) => spine.total - s * (spine.total - dWithers); // neck s (0 head .. 1 withers)
  const dAtTail = (s) => (1 - s) * dTail;                            // tail s (0 base .. 1 tip)

  // ------------------------------------------------------- torso sculpt
  const thoraxP = torsoPts[3], bodyP = torsoPts[2], pelvisP = torsoPts[0];
  const ts = { chain: 'spine', tag: 'torso' };
  // hanging belly between the chest and the hips
  {
    const sc = section(dAtTorso(0.5));
    const mb = MU.belly;
    m.ell(sv(add(sc.c, scale(sc.up, -sc.hh * 0.52))), sv([sc.hw * 0.78 * Math.sqrt(mb), sc.hh * 0.5 * mb, T * 0.22]), { ax: sc.side, ay: sc.up, k: S(sc.hh * 0.5), bone: 'rib_body', ...ts });
  }
  // sternum / chest keel and the pectorals in front of and between the forelegs
  const prT = profileAt(spec.torsoProfile, 0.12);
  const chestC = section(dAtTorso(0.1));
  const sternum = add(chestC.c, add(scale(chestC.up, -chestC.hh * 0.62), scale(chestC.tan, chestC.hw * 0.55)));
  m.ell(sv(sternum), sv([chestC.hw * 0.42, chestC.hh * 0.38, T * 0.09]), { ax: [1, 0, 0], ay: chestC.up, k: S(chestC.hh * 0.4), bone: 'rib_thorax', ...ts });
  // hip bones (ilium crests) and the sacrum
  for (const sd of [1, -1]) {
    const pp = spec.torsoProfile[spec.torsoProfile.length - 1][1] / 0.05;
    m.ell(sv(add(pelvisP, [sd * 0.024 * pp, 0.003, 0.016])), sv([0.016 * pp, 0.013 * pp, 0.034 * pp]), { k: S(0.016 * pp), bone: 'pelvis', ...ts });
  }

  // ------------------------------------------------------------- legs
  const legs = [];
  const buildLeg = (kind, P, sd) => {
    const side = sd > 0 ? 'L' : 'R';
    const pre = `${kind}_${side}`;
    let J;
    if (kind === 'fl') {
      const sh = [P.shoulder[0], spec.withersY + P.shoulder[1], T * P.shoulder[2]];
      J = [sh, ...[P.elbow, P.wrist, P.ball].map((q) => [q[0], q[1], sh[2] + q[2]])];
    } else {
      J = [[P.hip[0], spec.hipY + P.hip[1], P.hip[2]], P.knee, P.ankle, P.ball];
    }
    J = J.map((q) => [sd * q[0], q[1], q[2]]);
    const parent = kind === 'fl' ? 'thorax' : 'pelvis';
    const names = [0, 1, 2, 3].map((i) => `${pre}_${i}`);
    names.forEach((n, i) => bone(n, i === 0 ? parent : names[i - 1], sv(J[i])));
    const r = P.r;
    const mus = P.muscle ?? 1;
    const lt = (i) => ({ bone: names[i], chain: pre, tag: `${kind}${i}` });
    // bones as round cones
    const gLeg = m.group();
    for (let i = 0; i < 3; i++) m.cone(sv(J[i]), sv(J[i + 1]), S(r[i]), S(r[i + 1]), { k: S(r[0] * 0.9), grp: gLeg, ...lt(i), s0: 0, s1: 0 });
    const seg = (i) => sub(J[i + 1], J[i]);
    const segL = (i) => len(seg(i)), segD = (i) => norm(seg(i));
    const out = [sd, 0, 0], back = [0, 0, -1], fwd = [0, 0, 1], up = [0, 1, 0];
    const ortho = (v, a) => norm(sub(v, scale(a, dot(v, a))));
    if (kind === 'fl') {
      const ms = MU.shoulder * mus, ma = MU.arm * mus;
      const sc = section(dAtTorso(0.12));
      // shoulder blade: a long flat plate on the side of the chest, from below the withers
      // down and forward to the point of the shoulder; infraspinatus/deltoid bulge on it
      const top = [sd * sc.hw * 0.62, spec.withersY - 0.004, J[0][2] - T * 0.11];
      const scapAx = norm(sub(J[0], top));
      const scapN = ortho(out, scapAx);
      const scl = len(sub(J[0], top));
      m.ell(sv(lerp3(top, J[0], 0.45)), sv([r[0] * 0.32 * ms, scl * 0.55, r[0] * 1.15 * ms]), { ax: scapN, ay: scapAx, k: S(r[0] * 0.6), bone: 'thorax', chain: 'spine', tag: 'torso' });
      m.ell(sv(add(lerp3(top, J[0], 0.68), scale(scapN, r[0] * 0.25))), sv([r[0] * 0.55 * ms, scl * 0.33, r[0] * 0.9 * ms]), { ax: scapN, ay: scapAx, k: S(r[0] * 0.55), bone: names[0], chain: 'spine', tag: 'torso' });
      // triceps: the big mass behind the upper arm, from the back edge of the blade to the elbow point
      const olec = add(J[1], scale(back, r[1] * 0.85));
      const triTop = add(lerp3(top, J[0], 0.55), scale(back, r[0] * 0.75));
      const triAx = norm(sub(olec, triTop));
      m.ell(sv(add(lerp3(triTop, olec, 0.5), scale(out, r[0] * 0.18))), sv([r[0] * 0.8 * ma, len(sub(olec, triTop)) * 0.5, r[0] * 0.95 * ma]), { ax: ortho(out, triAx), ay: triAx, k: S(r[0] * 0.7), ...lt(0) });
      // biceps / brachialis in front of the humerus
      m.ell(sv(add(lerp3(J[0], J[1], 0.42), add(scale(fwd, r[0] * 0.45), scale(out, r[0] * 0.15)))), sv([r[0] * 0.62 * ma, segL(0) * 0.4, r[0] * 0.6 * ma]), { ax: ortho(out, segD(0)), ay: segD(0), k: S(r[0] * 0.5), ...lt(0) });
      // pectoral: from the sternum to the front of the upper arm
      const pecA = add(sternum, [sd * chestC.hw * 0.18, 0, 0]);
      const pecB = add(lerp3(J[0], J[1], 0.3), scale(fwd, r[0] * 0.2));
      const pecAx = norm(sub(pecB, pecA));
      m.ell(sv(lerp3(pecA, pecB, 0.48)), sv([r[0] * 0.95 * MU.pec, len(sub(pecB, pecA)) * 0.56, r[0] * 0.8 * MU.pec]), { ax: ortho(fwd, pecAx), ay: pecAx, k: S(r[0] * 0.8), bone: 'thorax', chain: 'spine', tag: 'torso' });
      // forearm: extensors (front-outside) and flexors (back-inside), thick at the elbow, tendons at the wrist
      const fa = segD(1), fl = segL(1);
      m.ell(sv(add(lerp3(J[1], J[2], 0.3), add(scale(fwd, r[1] * 0.3), scale(out, r[1] * 0.25)))), sv([r[1] * 0.85 * ma, fl * 0.34, r[1] * 0.9 * ma]), { ax: ortho(out, fa), ay: fa, k: S(r[1] * 0.5), ...lt(1) });
      m.ell(sv(add(lerp3(J[1], J[2], 0.28), add(scale(back, r[1] * 0.45), scale(out, -r[1] * 0.12)))), sv([r[1] * 0.78 * ma, fl * 0.3, r[1] * 0.75 * ma]), { ax: ortho(out, fa), ay: fa, k: S(r[1] * 0.45), ...lt(1) });
      // elbow point (olecranon) and the wrist knob (pisiform behind it)
      m.ell(sv(olec), sv([r[1] * 0.55, r[1] * 0.75, r[1] * 0.5]), { k: S(r[1] * 0.4), ...lt(1) });
      m.ell(sv(add(J[2], scale(back, r[2] * 0.55))), sv([r[2] * 0.7, r[2] * 0.75, r[2] * 0.6]), { k: S(r[2] * 0.4), ...lt(2) });
      m.ell(sv(add(J[2], scale(fwd, r[2] * 0.15))), sv([r[2] * 1.12, r[2] * 0.85, r[2] * 0.95]), { k: S(r[2] * 0.4), ...lt(2) });
    } else {
      const mt = MU.thigh * mus;
      // glutes over the hip joint
      m.ell(sv(add(J[0], [sd * r[0] * 0.12, r[0] * 0.55, -r[0] * 0.4])), sv([r[0] * 0.55 * mt, r[0] * 0.6 * mt, r[0] * 1.1 * mt]), { k: S(r[0] * 0.7), bone: 'pelvis', chain: 'spine', tag: 'torso' });
      // quadriceps (front of the femur), hamstrings (from the ischium behind the hip to below the knee)
      const qa = segD(0);
      m.ell(sv(add(lerp3(J[0], J[1], 0.48), add(scale(fwd, r[0] * 0.42), scale(out, r[0] * 0.2)))), sv([r[0] * 0.78 * mt, segL(0) * 0.5, r[0] * 0.78 * mt]), { ax: ortho(out, qa), ay: qa, k: S(r[0] * 0.65), ...lt(0) });
      const isch = add(J[0], [sd * r[0] * 0.1, -r[0] * 0.1, -r[0] * 1.5]);
      const hamB = add(J[1], add(scale(back, r[1] * 0.9), [0, -r[1] * 0.5, 0]));
      const ha = norm(sub(hamB, isch));
      m.ell(sv(add(lerp3(isch, hamB, 0.45), scale(out, r[0] * 0.25))), sv([r[0] * 0.78 * mt, len(sub(hamB, isch)) * 0.52, r[0] * 0.85 * mt]), { ax: ortho(out, ha), ay: ha, k: S(r[0] * 0.7), ...lt(0) });
      // caudofemoralis: the reptile's big tail-to-thigh muscle under the tail base
      const tb = section(dAtTail(0.07));
      const cfA = add(tb.c, add(scale(tb.up, -tb.hh * 0.45), scale(tb.side, sd * tb.hw * 0.35)));
      const cfB = add(lerp3(J[0], J[1], 0.3), scale(back, r[0] * 0.4));
      m.cone(sv(cfA), sv(cfB), S(tb.hh * 0.42 * MU.tailbase), S(r[0] * 0.6 * MU.tailbase), { k: S(r[0] * 0.8), bone: 'pelvis', chain: 'spine', tag: 'tail' });
      // knee cap
      m.ell(sv(add(J[1], scale(fwd, r[1] * 0.62))), sv([r[1] * 0.68, r[1] * 0.7, r[1] * 0.5]), { k: S(r[1] * 0.4), ...lt(1) });
      // calf (gastrocnemius) high behind the shin, tapering into the Achilles tendon to the heel
      const heel = add(J[2], scale(back, r[2] * 0.8));
      const sa = segD(1);
      m.ell(sv(add(lerp3(J[1], J[2], 0.28), scale(back, r[1] * 0.75))), sv([r[1] * 0.78 * mt, segL(1) * 0.3, r[1] * 0.85 * mt]), { ax: ortho(out, sa), ay: sa, k: S(r[1] * 0.5), ...lt(1) });
      m.cone(sv(add(lerp3(J[1], J[2], 0.45), scale(back, r[1] * 0.8))), sv(add(heel, [0, r[2] * 0.6, 0])), S(r[1] * 0.42), S(r[2] * 0.4), { k: S(r[2] * 0.5), ...lt(1) });
      m.ell(sv(add(heel, [0, r[2] * 0.2, 0])), sv([r[2] * 0.62, r[2] * 1.0, r[2] * 0.6]), { k: S(r[2] * 0.4), ...lt(2) });
      // shin front (tibialis)
      m.ell(sv(add(lerp3(J[1], J[2], 0.32), scale(fwd, r[1] * 0.25))), sv([r[1] * 0.6, segL(1) * 0.28, r[1] * 0.5]), { ax: ortho(out, sa), ay: sa, k: S(r[1] * 0.4), ...lt(1) });
    }
    // foot: a broad pad under the ball, toes with knuckles
    const ball = J[3];
    m.ell(sv(add(ball, [0, -r[3] * 0.2, r[3] * 0.35])), sv([r[3] * 1.45, r[3] * 0.78, r[3] * 1.5]), { k: S(r[3] * 0.6), ...lt(3) });
    m.ell(sv(add(ball, [0, -r[3] * 0.35, -r[3] * 0.65])), sv([r[3] * 0.9, r[3] * 0.55, r[3] * 0.8]), { k: S(r[3] * 0.5), ...lt(3) });     // heel pad
    const toes = [];
    const nT = P.toes;
    for (let t = 0; t < nT; t++) {
      const f = nT === 1 ? 0 : t / (nT - 1) - 0.5;      // -0.5 (inner) .. 0.5 (outer)
      const ang = sd * f * 2 * P.toeSpread * deg;
      const tl = P.toeLen * (1 - 0.24 * Math.abs(f * 2) ** 1.5) * (f * sd > 0.2 ? 0.92 : 1) * (0.94 + 0.12 * hsh(t + (kind === 'fl' ? 0 : 7), 3));
      const dir = norm([Math.sin(ang), -0.1, Math.cos(ang)]);
      const base = add(ball, [Math.sin(ang) * r[3] * 0.7, -r[3] * 0.15, Math.cos(ang) * r[3] * 0.5]);
      const knuckle = add(base, scale(dir, tl * 0.5));
      const tip = add(base, scale([dir[0], -0.35, dir[2]], tl));
      const tipP = [tip[0], Math.max(P.toeR[1] * 0.9, tip[1]), tip[2]];
      const kn = add(knuckle, [0, P.toeR[0] * 0.35, 0]);
      const tname = `${pre}_t${t}`;
      bone(tname, names[3], sv(base));
      m.cone(sv(base), sv(kn), S(P.toeR[0]), S(P.toeR[0] * 0.82), { k: S(P.toeR[0] * 0.8), bone: tname, chain: `${pre}_t${t}`, tag: 'toe' });
      m.cone(sv(kn), sv(tipP), S(P.toeR[0] * 0.82), S(P.toeR[1]), { k: S(P.toeR[1] * 0.6), bone: tname, chain: `${pre}_t${t}`, tag: 'toe' });
      // knuckle and toe pads
      m.ell(sv(add(kn, [0, P.toeR[0] * 0.15, 0])), sv([P.toeR[0] * 0.95, P.toeR[0] * 0.8, P.toeR[0] * 0.75]), { k: S(P.toeR[0] * 0.4), bone: tname, chain: `${pre}_t${t}`, tag: 'toe' });
      m.ell(sv(add(lerp3(base, tipP, 0.72), [0, -P.toeR[0] * 0.55, 0])), sv([P.toeR[0] * 0.8, P.toeR[0] * 0.5, P.toeR[0] * 0.9]), { k: S(P.toeR[0] * 0.4), bone: tname, chain: `${pre}_t${t}`, tag: 'toe' });
      chains[`${pre}_t${t}`] = { points: [sv(base), sv(kn), sv(tipP)], refUp: [0, 1, 0], kind: 'toe' };
      // claw: curved keratin from the toe tip, pointing forward-down; thick and blunt-tipped on adults
      const cdir = norm([dir[0], -0.62, dir[2]]);
      const cl = P.toeR[0] * (spec.headShape.soft ? 1.6 : 2.5) * (0.9 + 0.2 * hsh(t, kind === 'fl' ? 11 : 13));
      keratin.push({ kind: 'claw', bone: tname, tag: 'claw',
        points: [sv(add(tipP, scale(dir, -P.toeR[1] * 0.8))), sv(add(tipP, scale(norm([dir[0], 0.05, dir[2]]), cl * 0.55))), sv(add(add(tipP, scale(cdir, cl)), [0, -P.toeR[1] * 0.4, 0]))],
        radii: [S(P.toeR[1] * 1.2), S(P.toeR[1] * 0.8), S(P.toeR[1] * (spec.headShape.soft ? 0.25 : 0.1))], flat: 0.78, up: [0, 1, 0] });
      toes.push(tname);
    }
    chains[pre] = { points: J.map(sv), refUp: [0, 0, 1], kind: 'limb' };
    legs.push({ kind, side, names, toes, joints: J.map(sv) });
  };
  for (const sd of [1, -1]) { buildLeg('fl', spec.front, sd); buildLeg('hl', spec.hind, sd); }

  // ------------------------------------------------------------- wings
  const wings = [];
  const Wp = spec.wing;
  const omitWing = opts.omitWing || {};
  for (const sd of [1, -1]) {
    const side = sd > 0 ? 'L' : 'R';
    const pre = `w_${side}`;
    const R = [sd * Wp.root[0], spec.withersY + Wp.root[1], T * Wp.root[2]];
    const rel = (q) => [R[0] + sd * q[0], R[1] + q[1], R[2] + q[2]];
    const E = rel(Wp.elbow);
    const Wr = rel(Wp.wrist);
    bone(`${pre}_0`, 'thorax', sv(R));
    bone(`${pre}_1`, `${pre}_0`, sv(E));
    bone(`${pre}_2`, `${pre}_1`, sv(Wr));
    const detachable = !!omitWing[side];
    const target = detachable ? new SDFModel() : m;
    const mus = (Wp.muscle ?? 1) * MU.wing;
    const k21 = Wp.r[0] / 0.021;
    // flight muscle mass on the back (the wing's "shoulder"), + arm bones with biceps/triceps
    target.ell(sv(add(R, [-sd * 0.007, -0.005, -0.006])), sv([0.03 * mus * k21, 0.021 * mus * k21, 0.045 * mus * k21]), { k: S(0.02 * k21), bone: `${pre}_0`, chain: pre, tag: 'wingroot' });
    target.cone(sv(R), sv(E), S(Wp.r[0]), S(Wp.r[1]), { k: S(Wp.r[0] * 0.6), bone: `${pre}_0`, chain: pre, tag: 'warm' });
    target.ell(sv(lerp3(R, E, 0.38)), sv([Wp.r[0] * 0.98 * mus, len(sub(E, R)) * 0.38, Wp.r[0] * 1.2 * mus]), { ax: [0, 1, 0], ay: norm(sub(E, R)), k: S(Wp.r[0] * 0.5), bone: `${pre}_0`, chain: pre, tag: 'warm' });
    target.cone(sv(E), sv(Wr), S(Wp.r[1]), S(Wp.r[2]), { k: S(Wp.r[1] * 0.5), bone: `${pre}_1`, chain: pre, tag: 'warm' });
    target.ell(sv(lerp3(E, Wr, 0.2)), sv([Wp.r[1] * 1.0, len(sub(Wr, E)) * 0.25, Wp.r[1] * 1.25]), { ax: [0, 1, 0], ay: norm(sub(Wr, E)), k: S(Wp.r[1] * 0.4), bone: `${pre}_1`, chain: pre, tag: 'warm' });
    target.ell(sv(Wr), sv([Wp.r[2] * 1.45, Wp.r[2] * 1.12, Wp.r[2] * 1.35]), { k: S(Wp.r[2] * 0.5), bone: `${pre}_2`, chain: pre, tag: 'warm' });
    chains[pre] = { points: [R, E, Wr].map(sv), refUp: [0, 1, 0], kind: 'limb' };
    // fingers: 3 phalanges each, gently bowed toward the trailing edge
    const fingers = [];
    const back = norm([0, 0, -1]);
    Wp.digits.forEach((tipN, di) => {
      const tip = rel(tipN);
      const span = sub(tip, Wr), sl = len(span);
      const bow = (di === 0 ? 0.015 : 0.045) * sl;
      // phalanges shorten toward the tip (bat-like proportions)
      const pts = [0, 0.44, 0.76, 1].map((f) => add(lerp3(Wr, tip, f), scale(back, bow * Math.sin(Math.PI * f))));
      const names = [0, 1, 2].map((j) => `${pre}_f${di}_${j}`);
      names.forEach((n, j) => bone(n, j === 0 ? `${pre}_2` : names[j - 1], sv(pts[j])));
      const rr = Wp.fingerR;
      const radii = [0, 0.44, 0.76, 1].map((f) => S(mix(rr[0] * (di === 0 ? 1.18 : 1 - di * 0.07), rr[1], Math.pow(f, 0.75))));
      fingers.push({ names, points: pts.map(sv), radii, tipBone: names[2] });
    });
    // thumb with a claw
    const th = [Wr[0] + sd * Wp.thumb[0], Wr[1] + Wp.thumb[1], Wr[2] + Wp.thumb[2]];
    bone(`${pre}_th`, `${pre}_2`, sv(Wr));
    target.cone(sv(Wr), sv(th), S(Wp.r[2] * 0.7), S(Wp.fingerR[0] * 0.95), { k: S(Wp.r[2] * 0.4), bone: `${pre}_th`, chain: pre, tag: 'warm' });
    const thd = norm(sub(th, Wr));
    keratin.push({ kind: 'claw', bone: `${pre}_th`, tag: 'claw', side,
      points: [sv(th), sv(add(th, scale(add(thd, [0, 0.4, 0]), Wp.fingerR[0] * 1.6))), sv(add(th, add(scale(thd, Wp.fingerR[0] * 2.6), [0, -Wp.fingerR[0] * 1.3, 0])))],
      radii: [S(Wp.fingerR[0] * 0.95), S(Wp.fingerR[0] * 0.6), S(Wp.fingerR[0] * 0.08)], flat: 0.7, up: [0, 1, 0] });
    const attach = Wp.attach.map((q) => sv(rel(q)));
    wings.push({ side, sd, prefix: pre, root: sv(R), elbow: sv(E), wrist: sv(Wr), fingers, attach, attachBones: ['thorax', 'rib_body', 'pelvis'],
      thumb: sv(th), billow: S(Wp.billow), detachedSDF: detachable ? target : null });
  }

  // ------------------------------------------------- skin folds (projected)
  // Loose skin gathers where the body bends: transverse folds under the throat and
  // across the neck base, the armpit fold behind the elbow, the flank (stifle) fold
  // from the knee to the belly, and wrinkles over the tail base. Each fold is a
  // groove (smooth subtraction) with a rolled lip of skin beside it, laid along a
  // path projected onto the sculpted surface.
  {
    const F = spec.folds || {};
    const soft = !!F.soft;
    m.compile();
    const proj = (p) => {
      let q = sv(p);
      for (let it = 0; it < 8; it++) {
        const e = L * 2e-4;
        const f0 = m.evalList(q[0], q[1], q[2], m.all);
        const g = [m.evalList(q[0] + e, q[1], q[2], m.all) - f0, m.evalList(q[0], q[1] + e, q[2], m.all) - f0, m.evalList(q[0], q[1], q[2] + e, m.all) - f0];
        const gl = Math.hypot(...g) || 1;
        q = sub(q, scale(g, f0 / gl / Math.max(gl / e, 0.3)));
        if (Math.abs(f0) < L * 1e-5) break;
      }
      const e = L * 2e-4;
      const f0 = m.evalList(q[0], q[1], q[2], m.all);
      const g = norm([m.evalList(q[0] + e, q[1], q[2], m.all) - f0, m.evalList(q[0], q[1] + e, q[2], m.all) - f0, m.evalList(q[0], q[1], q[2] + e, m.all) - f0]);
      return { p: q, n: g };
    };
    const folds = [];
    // fold: path of normalized points (projected), groove radius g (L units), lip shift direction (normalized vector)
    const fold = (path, g, lipDir, o = {}) => {
      const P = path.map(proj);
      folds.push({ P, g: S(g), lipDir, bone: o.bone, chain: o.chain ?? 'spine', tag: o.tag ?? 'torso', depth: o.depth ?? 0.45, lip: o.lip ?? 0.7 });
    };
    // throat / gular folds: arcs across the underside of the neck, behind the jaw and at the neck base
    const nThroat = F.throat ?? 0;
    for (let i = 0; i < nThroat; i++) {
      const s = (soft ? 0.12 : 0.06) + i * (soft ? 0.2 : 0.13);
      const sc = section(dAtNeck(s));
      const path = [];
      for (let k = 0; k <= 8; k++) {
        const a = mix(-0.92, -0.08, k / 8) * Math.PI + (hsh(i, k) - 0.5) * 0.08;
        path.push(add(sc.c, add(scale(sc.side, Math.cos(a) * sc.hw * 1.05), scale(sc.up, Math.sin(a) * sc.hh * 1.05))));
      }
      fold(path, Math.min(sc.hw, sc.hh) * 0.09 * (soft ? 1.4 : 1), scale(sc.tan, 1), { bone: boneAtD(dAtNeck(s)), tag: 'neck' });
    }
    // neck-base folds (where the neck meets the shoulders), lower sides only
    const nNeck = F.neck ?? 0;
    for (let i = 0; i < nNeck; i++) {
      const s = 0.82 + i * 0.07;
      const sc = section(dAtNeck(s));
      for (const sd of [1, -1]) {
        const path = [];
        for (let k = 0; k <= 6; k++) {
          const a = mix(-0.55, 0.25, k / 6) * Math.PI * 0.5;
          path.push(add(sc.c, add(scale(sc.side, sd * Math.cos(a) * sc.hw * 1.05), scale(sc.up, Math.sin(a) * sc.hh * 1.05))));
        }
        fold(path, Math.min(sc.hw, sc.hh) * 0.08, scale(sc.tan, 1), { bone: boneAtD(dAtNeck(s)), tag: 'neck' });
      }
    }
    for (const sd of [1, -1]) {
      const fl = legs.find((l) => l.kind === 'fl' && l.sd === undefined && l.side === (sd > 0 ? 'L' : 'R'));
      const hl = legs.find((l) => l.kind === 'hl' && l.side === (sd > 0 ? 'L' : 'R'));
      const fJ = fl.joints.map((p) => scale(p, 1 / L)), hJ = hl.joints.map((p) => scale(p, 1 / L));
      // armpit: from behind the elbow up and back onto the chest wall
      if (F.axilla) {
        const sc = section(dAtTorso(0.3));
        const a0 = add(fJ[1], [0, spec.front.r[1] * 0.6, -spec.front.r[1] * 1.3]);
        const a2 = add(sc.c, add(scale(sc.side, sd * sc.hw * 0.85), scale(sc.up, -sc.hh * 0.4)));
        fold([a0, lerp3(a0, a2, 0.5), a2], spec.front.r[1] * 0.16, [0, 0, -1], { bone: 'thorax' });
      }
      // flank (stifle) fold: from the front of the knee up and forward onto the belly
      if (F.stifle) {
        const sc = section(dAtTorso(0.68));
        const b0 = add(hJ[1], [0, spec.hind.r[1] * 0.8, spec.hind.r[1] * 0.9]);
        const b2 = add(sc.c, add(scale(sc.side, sd * sc.hw * 0.8), scale(sc.up, -sc.hh * 0.55)));
        fold([b0, lerp3(b0, b2, 0.5), b2], spec.hind.r[1] * 0.18, [0, 0, 1], { bone: 'rib_lumbar' });
      }
    }
    // wrinkles across the top of the tail base
    for (let i = 0; i < (F.tail ?? 0); i++) {
      const s = 0.04 + i * 0.035;
      const sc = section(dAtTail(s));
      const path = [];
      for (let k = 0; k <= 6; k++) {
        const a = mix(0.12, 0.88, k / 6) * Math.PI;
        path.push(add(sc.c, add(scale(sc.side, Math.cos(a) * sc.hw * 1.05), scale(sc.up, Math.sin(a) * sc.hh * 1.05))));
      }
      fold(path, Math.min(sc.hw, sc.hh) * 0.06, scale(sc.tan, -1), { bone: boneAtD(dAtTail(s)), tag: 'tail' });
    }
    // grooves first (subtract), then the rolled lips (add), so the lip is not cut away
    for (const f of folds) {
      for (let i = 0; i < f.P.length - 1; i++) {
        const a = f.P[i], b = f.P[i + 1];
        const taper = (j) => Math.sin(Math.PI * (j / (f.P.length - 1)) * 0.92 + 0.12);
        const ga = f.g * taper(i), gb = f.g * taper(i + 1);
        const ca = sub(a.p, scale(a.n, -ga * (1 - f.depth))), cb = sub(b.p, scale(b.n, -gb * (1 - f.depth)));
        m.cone(ca, cb, ga, gb, { k: f.g * 0.8, op: 'sub', bone: f.bone, chain: f.chain, tag: f.tag });
      }
    }
    for (const f of folds) {
      const ld = norm(f.lipDir);
      for (let i = 0; i < f.P.length - 1; i++) {
        const a = f.P[i], b = f.P[i + 1];
        const taper = (j) => Math.sin(Math.PI * (j / (f.P.length - 1)) * 0.92 + 0.12);
        const ga = f.g * taper(i) * f.lip, gb = f.g * taper(i + 1) * f.lip;
        const off = (q, gg) => add(sub(q.p, scale(q.n, gg * 0.55)), scale(ld, L * 0 + gg * 1.9));
        m.cone(off(a, ga / f.lip), off(b, gb / f.lip), ga, gb, { k: f.g * 0.9, bone: f.bone, chain: f.chain, tag: f.tag });
      }
    }
  }

  // ------------------------------------------------------------- head
  const head = buildHead(m, spec, L, sv(headJoint), bone, keratin, eyes, chains, sockets, opts);

  // ------------------------------------------- dorsal crest (keratin plates)
  // A continuous ridge of broad, overlapping, raked plates from the back of the
  // skull to the tail tip (not a row of thin spikes): tallest over the shoulders
  // and the hips, low on the neck, shrinking down the tail. Plates vary in height,
  // spacing, rake and lean, and about one in nine is chipped or worn blunt.
  const crest = spec.crest || spec.spikes;
  if (crest && crest.count > 0) {
    const n = crest.count;
    const d0 = spine.total * 0.035, d1 = spine.total - 0.008 * (spec.head / 0.1);
    for (let i = 0; i < n; i++) {
      const f = Math.min(1, Math.max(0, (i + (i > 0 && i < n - 1 ? (hsh(i, 1) - 0.5) * 0.35 : 0)) / (n - 1)));
      const d = mix(d0, d1, f);
      const at = spine.at(d);
      const pr = profile(d);
      const up = upAt(at.tan);
      // height: low near the tail tip, tallest over the back (two humps: shoulders and hips), low on the neck
      const region = d < dTail ? d / dTail : d < dWithers ? 1 : 1 - (d - dWithers) / (spine.total - dWithers);
      const torsoBump = d >= dTail && d < dWithers ? 0.85 + 0.15 * Math.cos(2 * Math.PI * (d - dTail) / (dWithers - dTail)) : 1;
      const hh = (d < dTail ? mix(crest.h[2], crest.h[1], Math.pow(region, 0.6)) : d < dWithers ? crest.h[1] * torsoBump : mix(crest.h[0], crest.h[1] * 0.8, Math.pow(region, 1.4)));
      const base = add(at.p, scale(up, -pr[2] + pr[1] * 0.9));
      const side = norm(cross(up, at.tan));
      const rake = 1.0 + (hsh(i, 2) - 0.5) * 0.4;
      const tipDir = norm(add(add(up, scale(at.tan, -rake)), scale(side, (hsh(i, 3) - 0.5) * 0.18)));
      const broken = hsh(i, 4) < 0.11;
      const h0 = hh * (0.8 + 0.4 * hsh(i, 5));
      const h1 = broken ? h0 * (0.5 + 0.2 * hsh(i, 6)) : h0;
      const spacing = (d1 - d0) / n;
      const bl = Math.max(h0 * 1.25, spacing * 1.1) * (crest.base ?? 1);
      // the plate's base is long along the spine (sits in the skin), its blade thin across
      keratin.push({ kind: 'spike', bone: segBone[Math.min(at.seg, segBone.length - 1)], tag: 'spike',
        points: [sv(add(base, scale(up, -h0 * 0.45))), sv(add(base, scale(tipDir, h1 * 0.42))), sv(add(base, scale(tipDir, h1)))],
        radii: [S(bl * 0.5), S(bl * (broken ? 0.3 : 0.24)), S(bl * (broken ? 0.12 : 0.025))], flat: 0.3, up: at.tan, flatAxis: 'side' });
    }
  }

  return { L, spec, bones, bonePos, sdf: m, chains, keratin, eyes, wings, legs, sockets, head,
    spineInfo: { total: S(spine.total), dTail: S(dTail), dWithers: S(dWithers) } };
}

// ---------------------------------------------------------------- head
// The head is lofted from cross-sections (side + top silhouettes are set by
// the preset's `upper`/`jaw` keys), then sculpted: maxilla/dentary ridges
// carry the tooth rows, a vaulted palate and mouth floor are carved between
// them, brow ridges overhang the lateral eyes, cheek bones and big jaw muscles
// widen the back, the gape runs back past the eye, a tympanum sits behind the
// jaw joint. The lower jaw is built closed and rotated open by gape0, so the
// rest mesh has a real mouth interior.
function buildHead(m, spec, L, hj, bone, keratin, eyes, chains, sockets, opts) {
  const H = spec.head * L;
  const hs = spec.headShape;
  const pitch = spec.neckPitch + spec.headPitch;
  const ez = [0, Math.sin(pitch), Math.cos(pitch)], ey = [0, Math.cos(pitch), -Math.sin(pitch)], ex = [1, 0, 0];
  const W = (x, y, z) => [hj[0] + (x * ex[0] + y * ey[0] + z * ez[0]) * H, hj[1] + (x * ex[1] + y * ey[1] + z * ez[1]) * H, hj[2] + (x * ex[2] + y * ey[2] + z * ez[2]) * H];
  const Wd = (x, y, z) => norm([x * ex[0] + y * ey[0] + z * ez[0], x * ex[1] + y * ey[1] + z * ez[1], x * ex[2] + y * ey[2] + z * ez[2]]);
  const U = (z) => profileAt(hs.upper, z);    // [halfWidth, top, bottom]
  const J = (z) => profileAt(hs.jaw, z);
  const rr = hs.ridgeR;
  const t = { chain: 'skull', bone: 'head', tag: 'head' };
  const hinge = hs.hinge;
  const g = hs.gape0;
  const soft = !!hs.soft;
  const rotJ = (y, z, ang) => { const dy = y - hinge[1], dz = z - hinge[2]; const c = Math.cos(ang), s = Math.sin(ang); return [hinge[1] + dy * c - dz * s, hinge[2] + dy * s + dz * c]; };
  const jawPt = (x, y, z) => { const r = rotJ(y, z, g); return W(x, r[0], r[1]); };
  const jawDir = (x, y, z) => { const c = Math.cos(g), s = Math.sin(g); return Wd(x, y * c - z * s, y * s + z * c); };
  const sectionCone = (P0, P1, a, b, k, o, mapPt, upDir, grp = -1) => {
    const ra = Math.sqrt(a.hw * a.hh), rb = Math.sqrt(b.hw * b.hh);
    const sx = 0.5 * (a.hw / ra + b.hw / rb), sy = 0.5 * (a.hh / ra + b.hh / rb);
    m.cone(mapPt(0, a.cy, P0), mapPt(0, b.cy, P1), ra * H, rb * H, { sx, sy, up: upDir, k: k * H, grp, ...o });
  };

  // ---- upper loft (cranium + snout); the ellipse bottom is raised so the ridges form the lip line
  const zs = [];
  for (let z = -0.1; z < 0.999; z += 0.05) zs.push(z);
  const lastZ = 1 - 0.55 * Math.sqrt(U(1)[0] * (U(1)[1] - U(1)[2]) / 2);
  zs.push(lastZ);
  const secU = (z) => { const [hw, top, bot] = U(z); const b2 = bot - 0.035; return { hw, hh: (top - b2) / 2, cy: (top + b2) / 2 }; };
  const gU = m.group();
  for (let i = 0; i < zs.length - 1; i++) sectionCone(zs[i], zs[i + 1], secU(zs[i]), secU(zs[i + 1]), 0.05, t, W, ey, gU);
  // eye placement: the eyeball sits so the head surface meets it at `eyeExpose` degrees from
  // the gaze (a real eye shows its front cap; lids and skin wrap the rest - never a bead stuck
  // on, never a hole). The gaze is lateral, turned a little forward (hs.gaze); the surface is
  // found on the plain head loft, before the brows are added.
  const nrmL = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  let gL = nrmL(hs.gaze || [0.9, 0.04, 0.42]);
  const eye0 = [hs.eye[0] - hs.eyeR * (hs.eyeInset ?? 0.55), hs.eye[1] - hs.eyeR * 0.1, hs.eye[2]];
  const eyeP = [...eye0];
  {
    m.compile();
    const sdfL = (p) => { const q = W(p[0], p[1], p[2]); return m.evalList(q[0], q[1], q[2], m.all); };
    const surfAlong = (dir) => {
      const at = (s1) => sdfL([eye0[0] + dir[0] * s1, eye0[1] + dir[1] * s1, eye0[2] + dir[2] * s1]);
      let sPrev = -hs.eyeR, fPrev = at(sPrev);
      for (let s1 = -hs.eyeR * 0.95; s1 <= hs.eyeR * 4; s1 += hs.eyeR * 0.05) {
        const f1 = at(s1);
        if (fPrev < 0 && f1 >= 0) return sPrev + (s1 - sPrev) * (-fPrev) / (f1 - fPrev);
        sPrev = s1; fPrev = f1;
      }
      return null;
    };
    let surf = surfAlong(gL);
    if (surf !== null) {
      // the gaze follows the loft's surface normal there (so the exposed cap IS the cornea),
      // turned a little forward and kept mostly lateral
      const p = [0, 1, 2].map((k) => eye0[k] + gL[k] * surf), e = hs.eyeR * 0.05, f0 = sdfL(p);
      const n = nrmL([sdfL([p[0] + e, p[1], p[2]]) - f0, sdfL([p[0], p[1] + e, p[2]]) - f0, sdfL([p[0], p[1], p[2] + e]) - f0]);
      const fw = hs.gazeForward ?? 0.2;
      gL = nrmL([Math.max(n[0], 0.6), n[1] * 0.6, n[2] + fw]);
      surf = surfAlong(gL);
    }
    if (surf !== null) {
      const shift = surf - hs.eyeR * Math.cos((hs.eyeExpose ?? 50) * deg);
      for (let k = 0; k < 3; k++) eyeP[k] = eye0[k] + gL[k] * shift;
    }
  }
  const gW = (sd) => Wd(sd * gL[0], gL[1], gL[2]);
  for (const sd of [1, -1]) m.quiet.push(...W(sd * eyeP[0], eyeP[1], eyeP[2]), hs.eyeR * H * 1.5);
  const lipW = (z) => { const s2 = secU(z); const q = (U(z)[2] - s2.cy) / s2.hh; return s2.hw * Math.sqrt(Math.max(0, 1 - q * q)); };
  const ridgeU = (sd, z) => [sd * 0.86 * lipW(z), U(z)[2], z];
  // eye position (eyeInset: how deep the eyeball sits in its orbit)
  const eye = eyeP;
  const ER = hs.eyeR;
  for (const sd of [1, -1]) {
    // flat skull table between the eyes and the horn bases (a reptile's cranial platform)
    m.ell(W(sd * 0.06, U(0.15)[1] - 0.03, 0.12), [0.075 * H, 0.035 * H, 0.16 * H], { ax: ex, ay: ey, k: 0.04 * H, ...t });
    // brow ridge: a bony shelf overhanging the eye
    m.ell(W(sd * (eye[0] - 0.02 + ER * 0.3), eye[1] + ER * 1.05, eye[2] - 0.01), [0.05 * H * hs.brow, 0.028 * H * hs.brow, 0.13 * H], { ax: Wd(1, 0.3 * sd, 0.1 * sd), ay: Wd(-0.3 * sd, 1, 0.05), k: 0.022 * H, ...t });
    // canthus: bony ridge from the brow toward the nostril
    m.cone(W(sd * (eye[0] - 0.03), eye[1] + ER * 0.9, eye[2] + 0.07), W(sd * 0.065, U(0.86)[1] - 0.012, 0.86), 0.022 * H * hs.brow, 0.011 * H, { k: 0.025 * H, ...t });
    // horn boss on the back corner of the skull
    m.ell(W(sd * 0.125, U(0.04)[1] - 0.03, 0.05), [0.05 * H * hs.brow, 0.04 * H, 0.065 * H], { ax: ex, ay: ey, k: 0.03 * H, ...t });
    // temporal jaw muscles: the widest part of the head, behind and below the eye
    m.ell(W(sd * 0.14 * hs.jawMuscle ** 0.4, -0.03, 0.1), [0.08 * H * hs.jawMuscle, 0.11 * H, 0.14 * H], { ax: ex, ay: ey, k: 0.05 * H, ...t });
    // cheek bone (jugal) under the eye toward the jaw joint
    m.cone(W(sd * (eye[0] + 0.004), eye[1] - ER * 1.3, eye[2] + 0.1), W(sd * (0.175 + 0.012 * hs.cheek), -0.05, 0.04), 0.022 * H * hs.cheek, 0.034 * H * hs.cheek, { k: 0.022 * H, ...t });
    // nostril mound on top of the snout tip
    const zN = 0.9;
    m.ell(W(sd * 0.055, U(zN)[1] - 0.02, zN), [0.032 * H * hs.nostril, 0.02 * H * hs.nostril, 0.05 * H * hs.nostril], { ax: ex, ay: ey, k: 0.03 * H, ...t });
    // upper lip: a fleshy labial ridge along the tooth row that half covers the teeth
    const lc = hs.lipCover ?? 0.5;
    if (lc > 0) {
      const zl = [0.12, 0.3, 0.5, 0.7, 0.88];
      for (let i = 0; i < zl.length - 1; i++) {
        const a = ridgeU(sd, zl[i]), b = ridgeU(sd, zl[i + 1]);
        m.cone(W(a[0] * 1.06, a[1] + 0.012, a[2]), W(b[0] * 1.06, b[1] + 0.012, b[2]), 0.02 * H * lc, 0.017 * H * lc, { k: 0.02 * H, ...t });
      }
    }
  }
  // soft newborn head: puffy cheeks below and behind the eyes
  if (soft) for (const sd of [1, -1]) m.ell(W(sd * 0.25, -0.07, 0.24), [0.08 * H, 0.07 * H, 0.1 * H], { ax: ex, ay: ey, k: 0.06 * H, ...t });

  // ---- lower jaw (closed config, rotated open by gape0)
  const jt = { chain: 'jaw', bone: 'jaw', tag: 'jaw' };
  const secJ = (z) => { const [hw, top, bot] = J(z); const t2 = top + 0.03; return { hw: hw * 0.97, hh: (t2 - bot) / 2, cy: (t2 + bot) / 2 }; };
  const zj = [];
  for (let z = 0.0; z < 0.95; z += 0.065) zj.push(z);
  zj.push(1 - 0.5 * Math.sqrt(J(0.98)[0] * (J(0.98)[1] - J(0.98)[2]) / 2));
  const gJ = m.group();
  for (let i = 0; i < zj.length - 1; i++) sectionCone(zj[i], zj[i + 1], secJ(zj[i]), secJ(zj[i + 1]), 0.03, jt, jawPt, jawDir(0, 1, 0), gJ);
  // jaw angle (retroarticular process) behind and below the hinge, and the masseter bulge over it
  for (const sd of [1, -1]) {
    const [hw0, , b0] = J(0.06);
    m.cone(jawPt(sd * hw0 * 0.8, b0 + 0.06, 0.12), jawPt(sd * hw0 * 0.82, hinge[1] - 0.075, hinge[2] - 0.1), 0.05 * H, 0.032 * H, { k: 0.03 * H, ...jt });
    m.ell(jawPt(sd * hw0 * 0.86, b0 + 0.11, 0.17), [0.05 * H * hs.jawMuscle, 0.07 * H, 0.1 * H], { ax: ex, ay: jawDir(0, 1, 0), k: 0.035 * H, ...jt });
    // lower lip (labial ridge)
    const lc = hs.lipCover ?? 0.5;
    if (lc > 0) for (const [za, zb] of [[0.14, 0.35], [0.35, 0.6], [0.6, 0.86]]) {
      const pa = [sd * 0.84 * J(za)[0] * 1.03, J(za)[1] - 0.012, za], pb = [sd * 0.84 * J(zb)[0] * 1.03, J(zb)[1] - 0.012, zb];
      m.cone(jawPt(...pa), jawPt(...pb), 0.016 * H * lc, 0.014 * H * lc, { k: 0.018 * H, ...jt });
    }
  }
  const lipWJ = (z) => { const s2 = secJ(z); const q = (J(z)[1] - s2.cy) / s2.hh; return s2.hw * Math.sqrt(Math.max(0, 1 - q * q)); };
  const ridgeJ = (sd, z) => [sd * 0.84 * lipWJ(z), J(z)[1], z];
  // throat skin: jaw part follows the jaw, neck part follows the head; a loose dewlap under the throat
  const j0 = J(0.05);
  m.cone(jawPt(0, j0[2] + 0.05, 0.16), jawPt(0, j0[2] + 0.06, 0.0), 0.065 * H, 0.075 * H, { sx: 1.4, sy: 0.7, up: jawDir(0, 1, 0), k: 0.04 * H, chain: 'jaw', bone: 'jaw', tag: 'throat' });
  m.cone(W(0, j0[2] + 0.1, -0.04), W(0, U(-0.1)[2] - 0.03, -0.2), 0.08 * H, 0.115 * H, { sx: 1.3, sy: 0.78, up: ey, k: 0.05 * H, chain: 'spine', bone: 'head', tag: 'throat' });

  // ---- mouth: a wedge with its apex at the hinge and the rest gape as opening
  // angle cuts both jaws; its two faces become the lip lines, which meet
  // exactly when the jaw closes (rotation about the same apex).
  const midG = g * 0.5;
  {
    const axis = Wd(0, -Math.sin(midG), Math.cos(midG));
    const apex = W(0, hinge[1], hinge[2]);
    const s0 = 0.16, s1 = 1.35, sa = Math.sin(midG);
    m.cone(add(apex, scale(axis, s0 * H)), add(apex, scale(axis, s1 * H)), s0 * sa * H, s1 * sa * H, { sx: 12, sy: 1, up: Wd(0, Math.cos(midG), Math.sin(midG)), k: 0.02 * H, op: 'sub', chain: 'jaw', bone: 'jaw', tag: 'mouth' });
  }
  const cav = (x, y, z) => { const r = rotJ(y, z, midG); return W(x, r[0], r[1]); };
  const cavDir = (x, y, z) => { const c = Math.cos(midG), s = Math.sin(midG); return Wd(x, y * c - z * s, y * s + z * c); };
  const mouthY = hinge[1];
  m.ell(cav(0, mouthY, 0.5), [0.5 * lipW(0.5) * H, 0.02 * H, 0.36 * H], { ax: ex, ay: cavDir(0, 1, 0), k: 0.03 * H, op: 'sub', chain: 'jaw', bone: 'jaw', tag: 'mouth' });
  m.ell(cav(0, mouthY - 0.005, 0.16), [0.08 * H, 0.035 * H, 0.12 * H], { ax: ex, ay: cavDir(0, 1, 0), k: 0.03 * H, op: 'sub', chain: 'jaw', bone: 'jaw', tag: 'mouth' });
  m.cone(jawPt(0, J(0.2)[1] - 0.035, 0.12), jawPt(0, J(0.7)[1] - 0.03, 0.72), 0.042 * H, 0.024 * H, { sx: 1.45, sy: 0.5, up: jawDir(0, 1, 0), k: 0.012 * H, chain: 'jaw', bone: 'jaw', tag: 'tongue' });
  // eye sockets, nostrils, ear openings. A puffy skin mound around each eye first (the socket
  // then hollows it into a soft rim that the lids sit in), so the eye is set in the head
  for (const sd of [1, -1]) {
    const orb = hs.orbit ?? 1.36;
    m.ell(W(sd * (eyeP[0] - gL[0] * ER * 0.45), eyeP[1] - gL[1] * ER * 0.45, eyeP[2] - gL[2] * ER * 0.45), [ER * H * orb * 0.85, ER * H * orb, ER * H * orb * 1.15], { ax: gW(sd), ay: ey, k: 0.035 * H, ...t, tag: 'head' });
  }
  for (const sd of [1, -1]) {
    // the socket hugs the eyeball and opens along its gaze (outward and a little forward)
    m.ell(W(sd * eyeP[0], eyeP[1], eyeP[2]), [ER * H * 1.045, ER * H * 1.045, ER * H * 1.06], { ax: gW(sd), ay: ey, k: 0.008 * H, op: 'sub', ...t, tag: 'eyesocket' });
    m.ell(W(sd * 0.062, U(0.92)[1] - 0.012, 0.92), [0.02 * H * hs.nostril, 0.013 * H * hs.nostril, 0.032 * H * hs.nostril], { ax: Wd(1, 0.7, 0.15 * sd), ay: Wd(-0.7, 1, 0), k: 0.008 * H, op: 'sub', ...t, tag: 'nostril' });
    if (hs.tympanum) m.ell(W(sd * 0.2, 0.03, -0.02), [0.02 * H, 0.05 * H * hs.tympanum, 0.035 * H * hs.tympanum], { ax: Wd(1, 0, -0.25 * sd), ay: ey, k: 0.015 * H, op: 'sub', ...t, tag: 'head' });
  }

  // the cornea faces the middle of the opening the skin actually leaves around the eyeball
  // (found on the finished sculpt), so the iris is what shows - never the side of the eyeball
  let gOpen = gL;
  {
    m.compile();
    const c0 = W(eyeP[0], eyeP[1], eyeP[2]);
    const acc = [0, 0, 0];
    let cnt = 0;
    for (let i = 0; i < 24; i++) for (let j = 0; j < 48; j++) {
      const th = (i + 0.5) / 24 * Math.PI * 0.6, ph = (j / 48) * Math.PI * 2;
      // directions around the placement gaze (local head frame)
      const t1 = nrmL([gL[1], -gL[0], 0]), t2 = [gL[1] * t1[2] - gL[2] * t1[1], gL[2] * t1[0] - gL[0] * t1[2], gL[0] * t1[1] - gL[1] * t1[0]];
      const dl = [0, 1, 2].map((k) => gL[k] * Math.cos(th) + (t1[k] * Math.cos(ph) + t2[k] * Math.sin(ph)) * Math.sin(th));
      const dw = Wd(dl[0], dl[1], dl[2]);
      const q = [0, 1, 2].map((k) => c0[k] + dw[k] * ER * H * 1.08);
      if (m.evalList(q[0], q[1], q[2], m.all) > 0) { for (let k = 0; k < 3; k++) acc[k] += dl[k] * Math.sin(th); cnt += Math.sin(th); }
    }
    if (cnt > 0 && Math.hypot(...acc) > 1e-6) gOpen = nrmL(acc);
  }
  const gO = (sd) => Wd(sd * gOpen[0], gOpen[1], gOpen[2]);

  // ---- bones
  bone('jaw', 'head', W(0, hinge[1], hinge[2]));
  for (const sd of [1, -1]) {
    const side = sd > 0 ? 'L' : 'R';
    const c = W(sd * eyeP[0], eyeP[1], eyeP[2]);
    bone(`eye_${side}`, 'head', c);
    bone(`lidU_${side}`, 'head', c);
    bone(`lidL_${side}`, 'head', c);
    const look = gO(sd);
    eyes.push({ side, sd, center: c, radius: ER * H, look, bone: `eye_${side}`, lidU: `lidU_${side}`, lidL: `lidL_${side}`, up: ey });
  }
  chains.jaw = { points: [W(0, hinge[1], hinge[2]), jawPt(0, J(0.9)[1] - 0.05, 0.98)], refUp: jawDir(0, 1, 0), kind: 'jaw' };
  chains.skull = { points: [W(0, 0.02, -0.15), W(0, 0.04, 0.35), W(0, U(1)[1] * 0.3, 1.0)], refUp: ey, kind: 'skull' };
  sockets.mouth = { bone: 'jaw', pos: cav(0, mouthY, 0.55) };
  sockets.headFrame = { ex, ey, ez, origin: hj, H };

  // ---- teeth: varied - big caniniform teeth in the front third, small worn ones at the
  // back, recurved, leaning, a few broken or missing, replacement teeth half grown
  const nT = hs.teethUp | 0;
  const gums = [];
  for (const sd of [1, -1]) {
    const upper = [], lower = [];
    for (let i = 0; i < nT; i++) {
      const f = (i + 0.5) / nT;
      const z = 0.17 + (0.955 - 0.17) * f;
      const hv = (k) => hsh(i * 7 + (sd > 0 ? 1 : 2), k);
      if (hv(1) < 0.07 && i > 1 && i < nT - 2) continue;                       // a missing tooth
      const big = Math.exp(-Math.pow((f - 0.74) / 0.06, 2)) * 1.0 + Math.exp(-Math.pow((f - 0.93) / 0.045, 2)) * 0.55;
      const repl = hv(2) < 0.12 ? 0.55 : 1;                                     // replacement tooth growing in
      const size = hs.teethSize * (0.45 + 0.5 * f + 0.75 * big) * (0.8 + 0.4 * hv(3)) * repl;
      const r = ridgeU(sd, z);
      const x = r[0], y = r[1] + size * 0.12;
      const curve = 0.2 + 0.35 * hv(4) + 0.25 * big;                            // recurved toward the throat
      const lean = (hv(5) - 0.5) * 0.25;                                       // outward/inward
      const broken = hv(6) < 0.1 ? 0.55 + 0.2 * hv(7) : 1;
      const tipY = y - size * 1.05 * broken;
      keratin.push({ kind: 'tooth', bone: 'head', tag: 'tooth',
        points: [W(x, y + size * 0.5, z), W(x * (0.995 + lean * 0.05), y - size * 0.35, z + size * 0.06), W(x * (0.985 + lean * 0.1), tipY, z - size * curve * broken)],
        radii: [size * (0.3 + 0.06 * big) * H, size * 0.21 * H, size * (broken < 1 ? 0.11 : 0.012) * H], flat: 0.7 + 0.1 * hv(8), up: ez, seedJ: hv(9) });
      upper.push(W(x * 1.0, y + size * 0.05, z));
    }
    for (let i = 0; i < nT - 1; i++) {
      const f = (i + 1) / nT;
      const z = 0.17 + (0.925 - 0.17) * f;
      const hv = (k) => hsh(i * 5 + (sd > 0 ? 3 : 4), k + 20);
      if (hv(1) < 0.07 && i > 1 && i < nT - 3) continue;
      const big = Math.exp(-Math.pow((f - 0.84) / 0.055, 2)) * 0.9;
      const repl = hv(2) < 0.12 ? 0.55 : 1;
      const size = hs.teethSize * 0.9 * (0.45 + 0.5 * f + 0.75 * big) * (0.8 + 0.4 * hv(3)) * repl;
      const r = ridgeJ(sd, z);
      const x = r[0], y = r[1] - size * 0.12;
      const curve = 0.2 + 0.3 * hv(4) + 0.2 * big;
      const broken = hv(6) < 0.1 ? 0.55 + 0.2 * hv(7) : 1;
      keratin.push({ kind: 'tooth', bone: 'jaw', tag: 'tooth',
        points: [jawPt(x, y - size * 0.5, z), jawPt(x * 0.995, y + size * 0.35, z + size * 0.05), jawPt(x * 0.985, y + size * 1.0 * broken, z - size * curve * broken)],
        radii: [size * 0.28 * H, size * 0.2 * H, size * (broken < 1 ? 0.1 : 0.012) * H], flat: 0.7, up: ez });
      lower.push(jawPt(x, y - size * 0.05, z));
    }
    // gums: a fleshy ridge along each tooth row that buries the tooth bases
    if (nT > 0) {
      const gz = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.96];
      const gr = hs.teethSize * 0.2 * H;
      gums.push({ bone: 'head', pts: gz.map((z) => { const r = ridgeU(sd, z); return W(r[0] * 0.95, r[1] + hs.teethSize * 0.28, z); }), r: gr * 0.9 });
      gums.push({ bone: 'jaw', pts: gz.slice(0, -1).map((z) => { const r = ridgeJ(sd, z); return jawPt(r[0] * 0.93, r[1] - hs.teethSize * 0.32, z); }), r: gr * 0.85 });
    }
  }
  for (const gm of gums) for (let i = 0; i < gm.pts.length - 1; i++) {
    keratin.push({ kind: 'gum', bone: gm.bone, tag: 'gum', points: [gm.pts[i], lerp3(gm.pts[i], gm.pts[i + 1], 0.5), gm.pts[i + 1]], radii: [gm.r, gm.r * 1.05, gm.r], flat: 0.75, up: ez, open: true });
  }
  // egg tooth (newborns): a small pale keratin point on the tip of the snout
  if (hs.eggTooth) keratin.push({ kind: 'horn', bone: 'head', tag: 'eggtooth', points: [W(0, U(0.99)[1] - 0.03, 0.985), W(0, U(0.99)[1] + 0.0, 1.0), W(0, U(0.99)[1] + 0.012, 1.02)], radii: [0.022 * H, 0.014 * H, 0.002 * H], flat: 0.8, up: ey });

  // ---- horns (fixed arrangement per species; never changes between shots). They sweep
  // back along the line of the neck and curve down at the tip - never up like ears.
  const horn = (p0, p1, p2, r0, r1, tag = 'horn') => keratin.push({ kind: 'horn', bone: 'head', tag, points: [W(...p0), W(...p1), W(...p2)], radii: [r0 * H, r1 * H, r0 * 0.05 * H], flat: 0.82, up: ey, rings: tag === 'horn' });
  for (const sd of [1, -1]) {
    if (spec.horns === 'bashion') {
      // one heavy pair from the crown, swept back over the neck and curving down at the tips
      // (reads in silhouette), a shorter pair behind the eyes, two spurs on the jaw angle
      horn([sd * 0.135, 0.19, 0.09], [sd * 0.215, 0.29, -0.24], [sd * 0.255, 0.19, -0.64], 0.08, 0.05);
      horn([sd * 0.22, 0.1, 0.05], [sd * 0.29, 0.1, -0.13], [sd * 0.325, 0.0, -0.3], 0.042, 0.026);
      for (let i = 0; i < 2; i++) horn([sd * (0.215 + i * 0.012), -0.2 - i * 0.04, 0.03 - i * 0.07], [sd * (0.26 + i * 0.012), -0.23 - i * 0.04, -0.05 - i * 0.07], [sd * (0.28 + i * 0.012), -0.27 - i * 0.045, -0.13 - i * 0.07], 0.026 - i * 0.004, 0.015, 'spur');
    } else if (spec.horns === 'nightwing') {
      horn([sd * 0.105, 0.145, 0.06], [sd * 0.17, 0.12, -0.21], [sd * 0.205, -0.17, -0.5], 0.05, 0.03);
      horn([sd * 0.17, 0.05, 0.02], [sd * 0.215, 0.0, -0.12], [sd * 0.23, -0.1, -0.24], 0.024, 0.014);
      for (let i = 0; i < 2; i++) horn([sd * (0.19 + i * 0.01), -0.17 - i * 0.03, 0.03 - i * 0.06], [sd * (0.225 + i * 0.01), -0.19 - i * 0.03, -0.03 - i * 0.06], [sd * (0.24 + i * 0.01), -0.22 - i * 0.035, -0.08 - i * 0.06], 0.016 - i * 0.003, 0.01, 'spur');
    } else if (spec.horns === 'slitherwing') {
      horn([sd * 0.09, 0.085, 0.08], [sd * 0.12, 0.09, -0.12], [sd * 0.13, 0.04, -0.34], 0.03, 0.018);
    } else if (spec.horns === 'buds') {
      horn([sd * 0.12, 0.2, 0.09], [sd * 0.14, 0.23, 0.05], [sd * 0.15, 0.235, 0.01], 0.028, 0.02, 'bud');
    }
  }
  return { H, frame: { ex, ey, ez, origin: hj }, hinge: W(0, hinge[1], hinge[2]), gape0: g, W, jawPt, U, J, rr, eye: eyeP };
}
