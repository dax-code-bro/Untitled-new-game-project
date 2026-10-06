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
    // no overshoot beyond the neighbouring keys
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

// ------------------------------------------------------------ species presets
// Lengths: fractions of L. Profiles: [s, halfWidth, halfHeight, drop] where drop
// moves the cross-section centre below the dorsal spine line (deep chest).
// Legs: front.shoulder = [x, dy from withersY, z as fraction of torso];
//       elbow/wrist/ball = [x, y above ground, dz from the shoulder].
//       hind.hip = [x, dy from hipY, 0]; knee/ankle/ball = [x, y, z] absolute.
// Wings: root = [x, dy from withersY, z as fraction of torso]; elbow, wrist,
//       digit tips and membrane attachment = offsets from the root
//       ([lateral, up, forward], mirrored per side); thumb = offset from the wrist.
// Head: loft keys [z, halfWidth, top, bottom] in head lengths (z: 0 = skull
//       joint, 1 = snout tip); `jaw` the same for the closed lower jaw.
export const SPECIES = {
  bashion: {
    species: 'Bashion',
    head: 0.126, neck: 0.205, torso: 0.235, neckSegs: 10, tailSegs: 22,
    hipY: 0.205, withersY: 0.226, backArch: 0.006, neckPitch: 34 * deg, headPitch: -40 * deg, tailDroop: 14 * deg, tailCurve: 0.55,
    neckProfile: [[0, 0.02, 0.023, 0.0], [0.35, 0.028, 0.033, 0.003], [1, 0.049, 0.055, 0.016]],
    torsoProfile: [[0, 0.051, 0.06, 0.03], [0.22, 0.061, 0.07, 0.042], [0.5, 0.063, 0.063, 0.037], [0.8, 0.056, 0.054, 0.027], [1, 0.051, 0.05, 0.016]],
    tailProfile: [[0, 0.048, 0.048, 0.011], [0.15, 0.036, 0.037, 0.005], [0.4, 0.02, 0.021, 0.001], [0.7, 0.0105, 0.011, 0], [1, 0.0018, 0.0018, 0]],
    front: { shoulder: [0.036, -0.046, 0.83], elbow: [0.055, 0.112, -0.03], wrist: [0.056, 0.042, -0.004], ball: [0.057, 0.012, 0.02],
      r: [0.03, 0.023, 0.0165, 0.0155], toeLen: 0.04, toeR: [0.0095, 0.0058], toeSpread: 19, toes: 4, muscle: 1.2 },
    hind: { hip: [0.034, -0.018, 0.0], knee: [0.06, 0.115, 0.05], ankle: [0.061, 0.048, -0.024], ball: [0.061, 0.012, 0.0],
      r: [0.034, 0.026, 0.0175, 0.016], toeLen: 0.042, toeR: [0.01, 0.006], toeSpread: 18, toes: 4, muscle: 1.2 },
    wing: { root: [0.033, 0.008, 0.8], elbow: [0.13, 0.016, -0.045], wrist: [0.32, 0.026, -0.005],
      digits: [[0.66, 0.02, 0.035], [0.615, 0.012, -0.135], [0.515, 0.004, -0.255], [0.385, -0.004, -0.325]],
      thumb: [0.02, 0.01, 0.036], r: [0.019, 0.0118, 0.0092], fingerR: [0.0052, 0.0015], muscle: 1.0,
      attach: [[0.006, -0.014, -0.03], [0.014, -0.032, -0.11], [0.017, -0.047, -0.19]], billow: 0.035 },
    headShape: {
      upper: [[-0.1, 0.17, 0.15, -0.1], [0.02, 0.2, 0.19, -0.09], [0.15, 0.215, 0.215, -0.08], [0.3, 0.19, 0.215, -0.075], [0.45, 0.152, 0.18, -0.075],
        [0.62, 0.126, 0.148, -0.075], [0.8, 0.1, 0.12, -0.072], [0.93, 0.082, 0.098, -0.067], [1.0, 0.064, 0.074, -0.055]],
      jaw: [[0.0, 0.185, -0.08, -0.29], [0.12, 0.19, -0.08, -0.31], [0.28, 0.17, -0.08, -0.285], [0.48, 0.14, -0.08, -0.24],
        [0.68, 0.118, -0.08, -0.2], [0.86, 0.1, -0.078, -0.175], [0.98, 0.08, -0.075, -0.155]],
      eye: [0.165, 0.115, 0.32], eyeR: 0.058, brow: 1.0, cheek: 1.0, jawMuscle: 1.0, ridgeR: 0.024, hinge: [0, -0.09, 0.05], gape0: 15 * deg, nostril: 1.0,
      teethUp: 11, teethSize: 0.075,
    },
    horns: 'bashion', spikes: { count: 46, h: [0.004, 0.012, 0.0035], tail: true },
    scale: { body: 0.0042, belly: 0.012, head: 0.0032 },   // scale width in L units at the chain's median radius
  },
  nightwing: {
    species: 'Nightwing',
    head: 0.11, neck: 0.225, torso: 0.21, neckSegs: 12, tailSegs: 24,
    hipY: 0.2, withersY: 0.214, backArch: 0.005, neckPitch: 38 * deg, headPitch: -45 * deg, tailDroop: 12 * deg, tailCurve: 0.5,
    neckProfile: [[0, 0.019, 0.023, 0.0], [0.4, 0.026, 0.031, 0.003], [1, 0.038, 0.045, 0.012]],
    torsoProfile: [[0, 0.036, 0.046, 0.022], [0.22, 0.042, 0.055, 0.034], [0.5, 0.042, 0.048, 0.03], [0.8, 0.036, 0.039, 0.02], [1, 0.034, 0.036, 0.012]],
    tailProfile: [[0, 0.033, 0.034, 0.008], [0.15, 0.025, 0.026, 0.004], [0.4, 0.015, 0.0155, 0.001], [0.7, 0.0075, 0.008, 0], [1, 0.0014, 0.0014, 0]],
    front: { shoulder: [0.032, -0.04, 0.83], elbow: [0.04, 0.112, -0.024], wrist: [0.039, 0.038, 0.0], ball: [0.039, 0.009, 0.019],
      r: [0.022, 0.0138, 0.0094, 0.0087], toeLen: 0.028, toeR: [0.0053, 0.0032], toeSpread: 17, toes: 4, muscle: 0.85 },
    hind: { hip: [0.034, -0.014, 0.0], knee: [0.046, 0.118, 0.055], ankle: [0.044, 0.05, -0.03], ball: [0.043, 0.009, -0.006],
      r: [0.028, 0.0158, 0.0098, 0.009], toeLen: 0.031, toeR: [0.0055, 0.0033], toeSpread: 16, toes: 4, muscle: 0.85 },
    wing: { root: [0.028, 0.007, 0.8], elbow: [0.135, 0.016, -0.045], wrist: [0.34, 0.026, -0.005],
      digits: [[0.765, 0.02, 0.03], [0.71, 0.012, -0.155], [0.59, 0.004, -0.29], [0.44, -0.004, -0.36]],
      thumb: [0.02, 0.01, 0.034], r: [0.0155, 0.0095, 0.0074], fingerR: [0.0043, 0.0012], muscle: 0.9,
      attach: [[0.005, -0.012, -0.03], [0.011, -0.027, -0.1], [0.013, -0.04, -0.175]], billow: 0.04 },
    headShape: {
      upper: [[-0.1, 0.165, 0.12, -0.11], [0.04, 0.18, 0.165, -0.09], [0.18, 0.178, 0.18, -0.078], [0.32, 0.158, 0.172, -0.074], [0.46, 0.125, 0.138, -0.074],
        [0.62, 0.103, 0.112, -0.072], [0.8, 0.085, 0.09, -0.068], [0.93, 0.072, 0.07, -0.06], [1.0, 0.052, 0.05, -0.047]],
      jaw: [[0.0, 0.15, -0.085, -0.2], [0.12, 0.155, -0.085, -0.215], [0.3, 0.13, -0.085, -0.185], [0.5, 0.104, -0.083, -0.158],
        [0.7, 0.085, -0.081, -0.137], [0.88, 0.07, -0.079, -0.122], [0.98, 0.052, -0.077, -0.11]],
      eye: [0.148, 0.1, 0.34], eyeR: 0.062, brow: 0.8, cheek: 0.75, jawMuscle: 0.75, ridgeR: 0.021, hinge: [0, -0.09, 0.06], gape0: 15 * deg, nostril: 0.9,
      teethUp: 11, teethSize: 0.05,
    },
    horns: 'nightwing', spikes: { count: 54, h: [0.0028, 0.0078, 0.0024], tail: true },
    scale: { body: 0.0045, belly: 0.011, head: 0.003 },
  },
  slitherwing: {
    species: 'Slitherwing',
    head: 0.066, neck: 0.165, torso: 0.215, neckSegs: 10, tailSegs: 28,
    hipY: 0.112, withersY: 0.118, backArch: 0.003, neckPitch: 14 * deg, headPitch: -16 * deg, tailDroop: 4 * deg, tailCurve: 0.3,
    neckProfile: [[0, 0.016, 0.0155, 0.0], [0.5, 0.0185, 0.018, 0.002], [1, 0.026, 0.025, 0.006]],
    torsoProfile: [[0, 0.03, 0.03, 0.01], [0.3, 0.034, 0.036, 0.016], [0.6, 0.032, 0.033, 0.014], [1, 0.027, 0.026, 0.008]],
    tailProfile: [[0, 0.025, 0.024, 0.005], [0.2, 0.017, 0.016, 0.002], [0.5, 0.009, 0.009, 0], [0.8, 0.0045, 0.0045, 0], [1, 0.0012, 0.0012, 0]],
    front: { shoulder: [0.025, -0.026, 0.78], elbow: [0.032, 0.062, -0.016], wrist: [0.031, 0.022, 0.003], ball: [0.031, 0.006, 0.016],
      r: [0.012, 0.0078, 0.0055, 0.005], toeLen: 0.016, toeR: [0.003, 0.0017], toeSpread: 16, toes: 4, muscle: 0.6 },
    hind: { hip: [0.026, -0.022, 0.0], knee: [0.035, 0.06, 0.03], ankle: [0.033, 0.026, -0.012], ball: [0.032, 0.006, 0.004],
      r: [0.015, 0.009, 0.006, 0.0052], toeLen: 0.017, toeR: [0.0031, 0.0017], toeSpread: 14, toes: 4, muscle: 0.6 },
    // narrow, swept, high-aspect wings set far forward
    wing: { root: [0.022, 0.008, 1.0], elbow: [0.105, 0.01, -0.045], wrist: [0.245, 0.018, -0.05],
      digits: [[0.58, 0.012, -0.09], [0.53, 0.008, -0.16], [0.41, 0.004, -0.2], [0.3, 0.0, -0.215]],
      thumb: [0.015, 0.006, 0.022], r: [0.012, 0.0072, 0.0058], fingerR: [0.0034, 0.001], muscle: 0.75,
      attach: [[0.004, -0.008, -0.03], [0.007, -0.014, -0.075], [0.008, -0.018, -0.12]], billow: 0.03 },
    headShape: {
      upper: [[-0.1, 0.16, 0.09, -0.08], [0.05, 0.17, 0.11, -0.065], [0.2, 0.165, 0.12, -0.06], [0.35, 0.145, 0.115, -0.058], [0.5, 0.122, 0.1, -0.056],
        [0.7, 0.1, 0.08, -0.054], [0.88, 0.08, 0.06, -0.05], [1.0, 0.055, 0.04, -0.04]],
      jaw: [[0.0, 0.15, -0.065, -0.15], [0.15, 0.15, -0.065, -0.16], [0.35, 0.125, -0.064, -0.14], [0.6, 0.095, -0.062, -0.115], [0.85, 0.07, -0.06, -0.1], [0.98, 0.05, -0.058, -0.09]],
      eye: [0.15, 0.065, 0.37], eyeR: 0.07, brow: 0.5, cheek: 0.5, jawMuscle: 0.55, ridgeR: 0.018, hinge: [0, -0.07, 0.06], gape0: 13 * deg, nostril: 0.7,
      teethUp: 14, teethSize: 0.05,
    },
    horns: 'slitherwing', spikes: { count: 70, h: [0.0016, 0.0042, 0.0014], tail: true },
    scale: { body: 0.0035, belly: 0.009, head: 0.0026 },
  },
};

// newborn Bashion: big head and eyes, short neck and tail, chubby, short legs,
// small soft wings (held folded), horn buds only.
SPECIES.bashion_hatchling = {
  ...SPECIES.bashion,
  species: 'Bashion (hatchling)',
  head: 0.112, neck: 0.11, torso: 0.285, neckSegs: 8, tailSegs: 18,
  hipY: 0.15, withersY: 0.158, backArch: 0.012, neckPitch: 22 * deg, headPitch: -32 * deg, tailDroop: 14 * deg, tailCurve: 0.6,
  neckProfile: [[0, 0.04, 0.046, 0.0], [0.5, 0.044, 0.05, 0.006], [1, 0.058, 0.066, 0.02]],
  torsoProfile: [[0, 0.06, 0.07, 0.03], [0.3, 0.074, 0.084, 0.05], [0.6, 0.076, 0.082, 0.052], [1, 0.06, 0.064, 0.026]],
  tailProfile: [[0, 0.052, 0.052, 0.014], [0.2, 0.036, 0.036, 0.006], [0.5, 0.019, 0.019, 0.001], [0.8, 0.009, 0.009, 0], [1, 0.0028, 0.0028, 0]],
  front: { ...SPECIES.bashion.front, shoulder: [0.05, -0.04, 0.8], elbow: [0.064, 0.072, -0.01], wrist: [0.06, 0.026, 0.006], ball: [0.06, 0.01, 0.026],
    r: [0.027, 0.018, 0.0145, 0.0135], toeLen: 0.028, toeR: [0.0078, 0.005], muscle: 0.5 },
  hind: { ...SPECIES.bashion.hind, hip: [0.05, -0.03, 0.0], knee: [0.066, 0.072, 0.042], ankle: [0.064, 0.03, -0.008], ball: [0.063, 0.01, 0.012],
    r: [0.033, 0.02, 0.015, 0.014], toeLen: 0.03, toeR: [0.008, 0.005], muscle: 0.5 },
  wing: { ...SPECIES.bashion.wing, root: [0.038, 0.012, 0.76], elbow: [0.1, 0.01, -0.03], wrist: [0.23, 0.02, 0.0],
    digits: [[0.43, 0.015, 0.03], [0.4, 0.01, -0.07], [0.34, 0.005, -0.15], [0.26, 0.0, -0.2]],
    thumb: [0.018, 0.008, 0.03], r: [0.017, 0.011, 0.0095], fingerR: [0.0052, 0.002], muscle: 0.45,
    attach: [[0.007, -0.012, -0.03], [0.014, -0.022, -0.1], [0.016, -0.03, -0.17]], billow: 0.02 },
  headShape: {
    ...SPECIES.bashion.headShape,
    upper: [[-0.1, 0.3, 0.27, -0.17], [0.05, 0.345, 0.41, -0.15], [0.2, 0.35, 0.45, -0.14], [0.36, 0.31, 0.37, -0.135], [0.52, 0.255, 0.27, -0.13],
      [0.7, 0.205, 0.205, -0.127], [0.87, 0.165, 0.16, -0.118], [1.0, 0.12, 0.112, -0.098]],
    jaw: [[0.0, 0.265, -0.148, -0.335], [0.12, 0.27, -0.148, -0.35], [0.3, 0.235, -0.148, -0.305], [0.5, 0.195, -0.145, -0.258],
      [0.7, 0.162, -0.142, -0.218], [0.88, 0.132, -0.139, -0.193], [0.98, 0.1, -0.136, -0.172]],
    eye: [0.235, 0.18, 0.37], eyeR: 0.135, eyeInset: 0.35, brow: 0.4, cheek: 0.55, jawMuscle: 0.55, ridgeR: 0.026, hinge: [0, -0.15, 0.07], gape0: 12 * deg, nostril: 0.7,
    teethUp: 0, teethSize: 0.0,
  },
  horns: 'buds', spikes: { count: 30, h: [0.0015, 0.003, 0.001], tail: true },
  scale: { body: 0.0036, belly: 0.0065, head: 0.003 },
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

  // ---------------------------------------------------------------- spine
  const T = spec.torso, N = spec.neck, Hn = spec.head;
  const tailLen = Math.max(0.1, 1 - T - N - Hn);
  // torso joints from pelvis (z=0) forward
  const torsoNames = ['pelvisPt', 'lumbar', 'body', 'thorax', 'withers'];
  const torsoF = [0, 0.3, 0.55, 0.8, 1];
  const torsoPts = torsoF.map((f) => [0, mix(spec.hipY, spec.withersY, f) + spec.backArch * Math.sin(Math.PI * f), f * T]);
  // neck: straight at neckPitch from the withers
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
  // rescale so its arc length is exactly tailLen
  const segLens = [];
  { let w = 0; for (let i = 0; i < spec.tailSegs; i++) { const l = Math.pow(0.975, i); segLens.push(l); w += l; } for (let i = 0; i < spec.tailSegs; i++) segLens[i] *= tailCurve.total / w; }
  { let d = 0; tailPts.push(tailCurve.at(0).p); for (let i = 0; i < spec.tailSegs; i++) { d += segLens[i]; tailPts.push(tailCurve.at(d).p); } }

  // bones (normalized -> metres at the end via S); hierarchy rooted at 'body'
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
  // which bone owns each spine segment (segment i: spinePts[i] -> spinePts[i+1])
  const segBone = [];
  for (let i = spec.tailSegs - 1; i >= 0; i--) segBone.push(`tail_${i}`);              // tail segments (tip-ward bone owns)
  segBone.push('rib_lumbar', 'rib_body', 'rib_body', 'rib_thorax');                     // pelvis->lumbar, lumbar->body, body->thorax, thorax->withers
  for (let i = 0; i < spec.neckSegs; i++) segBone.push(`neck_${i}`);
  // NOTE: torso segments: pelvis->lumbar weighted to rib_lumbar (moves with lumbar), etc.
  const spine = polyline(spinePts);
  const dTail = spine.cum[spec.tailSegs], dWithers = spine.cum[spec.tailSegs + 4];
  const profile = (d) => {
    // d: arc length from tail tip
    if (d <= dTail) { const s = 1 - d / dTail; return profileAt(spec.tailProfile, s); }
    if (d <= dWithers) { const s = 1 - (d - dTail) / (dWithers - dTail); return profileAt(spec.torsoProfile, s); }
    const s = 1 - (d - dWithers) / (spine.total - dWithers); return profileAt(spec.neckProfile, s);
  };
  const upAt = (tan) => norm([0, tan[2], -tan[1]]);   // dorsal direction in the sagittal plane (tan points headward)
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
        chain: 'spine', s0: S(d0), s1: S(d1), tag: d0 < dTail ? 'tail' : d0 < dWithers ? 'torso' : 'neck' });
    }
  }
  chains.spine = { points: spinePts.map(sv), refUp: [0, 1, 0], kind: 'spine' };
  sockets.withers = { bone: 'neck_0', pos: sv(add(torsoPts[4], [0, 0.0, 0])) };

  // ------------------------------------------------------- torso sculpt
  const thoraxP = torsoPts[3], bodyP = torsoPts[2], pelvisP = torsoPts[0];
  const prT = profileAt(spec.torsoProfile, 0.22);
  // shoulder blades / withers hump
  for (const sd of [1, -1]) {
    m.ell(sv(add(thoraxP, [sd * prT[0] * 0.45, 0.002, 0.02 * T / 0.245])), sv([prT[0] * 0.4, prT[1] * 0.32, 0.07 * T / 0.245]), { k: S(0.02), bone: 'thorax', chain: 'spine', tag: 'torso' });
    // hip bones
    const pp = spec.torsoProfile[spec.torsoProfile.length - 1][1] / 0.05;
    m.ell(sv(add(pelvisP, [sd * 0.026 * pp, 0.004, 0.012])), sv([0.022 * pp, 0.016 * pp, 0.04 * pp]), { k: S(0.02 * pp), bone: 'pelvis', chain: 'spine', tag: 'torso' });
  }
  // chest keel / pectorals in front of the forelegs
  m.ell(sv(add(thoraxP, [0, -prT[2] - prT[1] * 0.45, 0.035 * T / 0.245])), sv([prT[0] * 0.75, prT[1] * 0.5, 0.06 * T / 0.245]), { k: S(0.03), bone: 'rib_thorax', chain: 'spine', tag: 'torso' });

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
    // bones as round cones (+ muscle bellies)
    const gLeg = m.group();
    for (let i = 0; i < 3; i++) {
      m.cone(sv(J[i]), sv(J[i + 1]), S(r[i]), S(r[i + 1]), { k: S(r[0] * 0.9), grp: gLeg, bone: names[i], chain: pre, s0: 0, s1: 0, tag: `${kind}${i}` });
    }
    const upper = sub(J[1], J[0]);
    const ul = len(upper), ud = norm(upper);
    const fwd = [0, 0, 1];
    if (kind === 'fl') {
      // upper arm: triceps behind, biceps in front, deltoid at the shoulder
      m.ell(sv(add(lerp3(J[0], J[1], 0.42), [sd * r[0] * 0.2, 0, -0.006])), sv([r[0] * 0.66 * mus ** 0.5, ul * 0.46, r[0] * 1.05 * mus ** 0.5]), { ax: [1, 0, 0], ay: ud, k: S(r[0] * 0.8), bone: names[0], chain: pre, tag: 'fl0' });
      m.ell(sv(lerp3(J[1], J[2], 0.22)), sv([r[1] * 1.05, len(sub(J[2], J[1])) * 0.33, r[1] * 1.15 * mus]), { ax: [1, 0, 0], ay: norm(sub(J[2], J[1])), k: S(0.008), bone: names[1], chain: pre, tag: 'fl1' });
    } else {
      // massive thigh (caudofemoralis + quadriceps), calf
      m.ell(sv(add(lerp3(J[0], J[1], 0.38), [sd * r[0] * 0.25, 0.004, -0.008])), sv([r[0] * 0.62 * mus ** 0.5, ul * 0.56, r[0] * 1.3 * mus ** 0.5]), { ax: [1, 0, 0], ay: ud, k: S(r[0] * 0.9), bone: names[0], chain: pre, tag: 'hl0' });
      m.ell(sv(add(lerp3(J[1], J[2], 0.28), [0, 0, -r[1] * 0.45])), sv([r[1] * 0.95, len(sub(J[2], J[1])) * 0.32, r[1] * 1.05 * mus]), { ax: [1, 0, 0], ay: norm(sub(J[2], J[1])), k: S(0.007), bone: names[1], chain: pre, tag: 'hl1' });
    }
    // bony landmarks: olecranon (elbow point), knee cap, hock (heel) + Achilles tendon
    const back = [0, 0, -1], fwdV = [0, 0, 1];
    if (kind === 'fl') {
      m.ell(sv(add(J[1], scale(back, r[1] * 0.75))), sv([r[1] * 0.6, r[1] * 0.85, r[1] * 0.6]), { k: S(r[1] * 0.45), bone: names[1], chain: pre, tag: 'fl1' });
      m.ell(sv(add(J[2], scale(back, r[2] * 0.35))), sv([r[2] * 0.95, r[2] * 0.8, r[2] * 0.9]), { k: S(r[2] * 0.4), bone: names[2], chain: pre, tag: 'fl2' });
    } else {
      m.ell(sv(add(J[1], scale(fwdV, r[1] * 0.6))), sv([r[1] * 0.75, r[1] * 0.7, r[1] * 0.55]), { k: S(r[1] * 0.4), bone: names[1], chain: pre, tag: 'hl1' });
      const heel = add(J[2], scale(back, r[2] * 0.85));
      m.ell(sv(add(heel, [0, r[2] * 0.3, 0])), sv([r[2] * 0.62, r[2] * 1.1, r[2] * 0.62]), { k: S(r[2] * 0.4), bone: names[2], chain: pre, tag: 'hl2' });
      const calf = add(lerp3(J[1], J[2], 0.3), scale(back, r[1] * 0.9));
      m.cone(sv(calf), sv(add(heel, [0, r[2] * 0.6, 0])), S(r[1] * 0.45), S(r[2] * 0.42), { k: S(r[2] * 0.5), bone: names[1], chain: pre, tag: 'hl1' });
    }
    // foot: pad under the ball, toes
    const ball = J[3];
    m.ell(sv(add(ball, [0, -r[3] * 0.25, r[3] * 0.4])), sv([r[3] * 1.35, r[3] * 0.75, r[3] * 1.5]), { k: S(r[3] * 0.6), bone: names[3], chain: pre, tag: `${kind}3` });
    const toes = [];
    const nT = P.toes;
    for (let t = 0; t < nT; t++) {
      const f = nT === 1 ? 0 : t / (nT - 1) - 0.5;      // -0.5 (inner) .. 0.5 (outer)
      const ang = sd * f * 2 * P.toeSpread * deg;
      const tl = P.toeLen * (1 - 0.22 * Math.abs(f * 2) ** 1.5) * (f * sd > 0.2 ? 0.92 : 1);
      const dir = norm([Math.sin(ang), -0.12, Math.cos(ang)]);
      const base = add(ball, [Math.sin(ang) * r[3] * 0.7, -r[3] * 0.15, Math.cos(ang) * r[3] * 0.5]);
      const knuckle = add(base, scale(dir, tl * 0.55));
      const tip = add(base, scale([dir[0], -0.35, dir[2]], tl));
      const tipP = [tip[0], Math.max(P.toeR[1] * 0.9, tip[1]), tip[2]];
      const tname = `${pre}_t${t}`;
      bone(tname, names[3], sv(base));
      m.cone(sv(base), sv(add(knuckle, [0, P.toeR[0] * 0.3, 0])), S(P.toeR[0]), S(P.toeR[0] * 0.85), { k: S(P.toeR[0] * 0.8), bone: tname, chain: `${pre}_t${t}`, tag: 'toe' });
      m.cone(sv(add(knuckle, [0, P.toeR[0] * 0.3, 0])), sv(tipP), S(P.toeR[0] * 0.85), S(P.toeR[1]), { k: S(P.toeR[1] * 0.6), bone: tname, chain: `${pre}_t${t}`, tag: 'toe' });
      chains[`${pre}_t${t}`] = { points: [sv(base), sv(add(knuckle, [0, P.toeR[0] * 0.3, 0])), sv(tipP)], refUp: [0, 1, 0], kind: 'toe' };
      // claw: curved keratin cone from the toe tip, pointing forward-down
      const cdir = norm([dir[0], -0.55, dir[2]]);
      const cl = P.toeR[0] * 2.4;
      keratin.push({ kind: 'claw', bone: tname, tag: 'claw',
        points: [sv(add(tipP, scale(dir, -P.toeR[1] * 0.6))), sv(add(tipP, scale(norm([dir[0], -0.1, dir[2]]), cl * 0.55))), sv(add(add(tipP, scale(cdir, cl)), [0, -P.toeR[1] * 0.4, 0]))],
        radii: [S(P.toeR[1] * 1.15), S(P.toeR[1] * 0.75), S(P.toeR[1] * 0.06)], flat: 0.75, up: [0, 1, 0] });
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
    const mus = Wp.muscle ?? 1;
    // flight muscle mass on the back + arm bones
    target.ell(sv(add(R, [-sd * 0.006, -0.004, -0.004])), sv([0.03 * mus * (Wp.r[0] / 0.021), 0.022 * mus * (Wp.r[0] / 0.021), 0.042 * mus * (Wp.r[0] / 0.021)]), { k: S(0.02), bone: `${pre}_0`, chain: pre, tag: 'wingroot' });
    target.cone(sv(R), sv(E), S(Wp.r[0]), S(Wp.r[1]), { k: S(Wp.r[0] * 0.6), bone: `${pre}_0`, chain: pre, tag: 'warm' });
    target.ell(sv(lerp3(R, E, 0.35)), sv([Wp.r[0] * 0.95 * mus, len(sub(E, R)) * 0.36, Wp.r[0] * 1.15 * mus]), { ax: [0, 1, 0], ay: norm(sub(E, R)), k: S(Wp.r[0] * 0.5), bone: `${pre}_0`, chain: pre, tag: 'warm' });
    target.cone(sv(E), sv(Wr), S(Wp.r[1]), S(Wp.r[2]), { k: S(Wp.r[1] * 0.5), bone: `${pre}_1`, chain: pre, tag: 'warm' });
    target.ell(sv(lerp3(E, Wr, 0.18)), sv([Wp.r[1] * 1.0, len(sub(Wr, E)) * 0.26, Wp.r[1] * 1.2]), { ax: [0, 1, 0], ay: norm(sub(Wr, E)), k: S(Wp.r[1] * 0.4), bone: `${pre}_1`, chain: pre, tag: 'warm' });
    target.ell(sv(Wr), sv([Wp.r[2] * 1.5, Wp.r[2] * 1.15, Wp.r[2] * 1.35]), { k: S(Wp.r[2] * 0.5), bone: `${pre}_2`, chain: pre, tag: 'warm' });
    chains[pre] = { points: [R, E, Wr].map(sv), refUp: [0, 1, 0], kind: 'limb' };
    // fingers: 3 phalanges each, gently bowed toward the trailing edge
    const fingers = [];
    const back = norm([0, 0, -1]);
    Wp.digits.forEach((tipN, di) => {
      const tip = rel(tipN);
      const span = sub(tip, Wr), sl = len(span);
      const bow = (di === 0 ? 0.015 : 0.045) * sl;
      const pts = [0, 0.4, 0.73, 1].map((f) => add(lerp3(Wr, tip, f), scale(back, bow * Math.sin(Math.PI * f))));
      const names = [0, 1, 2].map((j) => `${pre}_f${di}_${j}`);
      names.forEach((n, j) => bone(n, j === 0 ? `${pre}_2` : names[j - 1], sv(pts[j])));
      const rr = Wp.fingerR;
      const radii = [0, 0.4, 0.73, 1].map((f) => S(mix(rr[0] * (di === 0 ? 1.15 : 1 - di * 0.07), rr[1], Math.pow(f, 0.8))));
      fingers.push({ names, points: pts.map(sv), radii, tipBone: names[2] });
    });
    // thumb with a claw
    const th = [Wr[0] + sd * Wp.thumb[0], Wr[1] + Wp.thumb[1], Wr[2] + Wp.thumb[2]];
    bone(`${pre}_th`, `${pre}_2`, sv(Wr));
    target.cone(sv(Wr), sv(th), S(Wp.r[2] * 0.7), S(Wp.fingerR[0] * 0.9), { k: S(Wp.r[2] * 0.4), bone: `${pre}_th`, chain: pre, tag: 'warm' });
    const thd = norm(sub(th, Wr));
    keratin.push({ kind: 'claw', bone: `${pre}_th`, tag: 'claw', side,
      points: [sv(th), sv(add(th, scale(add(thd, [0, 0.4, 0]), Wp.fingerR[0] * 1.6))), sv(add(th, add(scale(thd, Wp.fingerR[0] * 2.6), [0, -Wp.fingerR[0] * 1.3, 0])))],
      radii: [S(Wp.fingerR[0] * 0.95), S(Wp.fingerR[0] * 0.6), S(Wp.fingerR[0] * 0.05)], flat: 0.7, up: [0, 1, 0] });
    const attach = Wp.attach.map((q) => sv(rel(q)));
    wings.push({ side, sd, prefix: pre, root: sv(R), elbow: sv(E), wrist: sv(Wr), fingers, attach, attachBones: ['thorax', 'rib_body', 'pelvis'],
      thumb: sv(th), billow: S(Wp.billow), detachedSDF: detachable ? target : null });
  }

  // ------------------------------------------------------------- head
  const head = buildHead(m, spec, L, sv(headJoint), bone, keratin, eyes, chains, sockets, opts);

  // ---------------------------------------------- dorsal spikes (keratin)
  if (spec.spikes && spec.spikes.count > 0) {
    const n = spec.spikes.count;
    const d0 = spine.total * 0.04, d1 = spine.total - 0.012;
    // a living animal's spikes are never a row of identical cones: per-spike height, spacing,
    // rake and lean vary, and a few are broken or worn blunt (deterministic hash of the index)
    const hsh = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7 + 0.5) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < n; i++) {
      const f = Math.min(1, Math.max(0, (i + (i > 0 && i < n - 1 ? (hsh(i, 1) - 0.5) * 0.55 : 0)) / (n - 1)));
      const d = mix(d0, d1, f);
      const at = spine.at(d);
      const pr = profile(d);
      const up = upAt(at.tan);
      // height: low on the tail tip, tallest over the back, small on the neck
      const region = d < dTail ? d / dTail : d < dWithers ? 1 : 1 - (d - dWithers) / (spine.total - dWithers);
      const hh = d < dTail ? mix(spec.spikes.h[2], spec.spikes.h[1], Math.pow(region, 0.7)) : d < dWithers ? spec.spikes.h[1] : mix(spec.spikes.h[0], spec.spikes.h[1], region);
      const base = add(at.p, scale(up, -pr[2] + pr[1] * 0.93));
      const side = norm(cross(up, at.tan));
      const rake = 0.75 + (hsh(i, 2) - 0.5) * 0.5;
      const tipDir = norm(add(add(up, scale(at.tan, -rake)), scale(side, (hsh(i, 3) - 0.5) * 0.25)));     // raked back toward the tail, a little lean
      const broken = hsh(i, 4) < 0.12;
      const h0 = hh * (0.72 + 0.56 * hsh(i, 5));
      const h1 = broken ? h0 * (0.45 + 0.2 * hsh(i, 6)) : h0;
      const bl = h0 * 1.25;
      keratin.push({ kind: 'spike', bone: segBone[Math.min(at.seg, segBone.length - 1)], tag: 'spike',
        points: [sv(add(base, scale(up, -h0 * 0.35))), sv(add(base, scale(tipDir, h1 * 0.45))), sv(add(base, scale(tipDir, h1)))],
        radii: [S(bl * 0.42), S(bl * (broken ? 0.3 : 0.24)), S(bl * (broken ? 0.12 : 0.02))], flat: 0.32, up: at.tan, flatAxis: 'side' });
    }
  }

  return { L, spec, bones, bonePos, sdf: m, chains, keratin, eyes, wings, legs, sockets, head,
    spineInfo: { total: S(spine.total), dTail: S(dTail), dWithers: S(dWithers) } };
}

// ---------------------------------------------------------------- head
// The head is lofted from cross-sections (side + top silhouettes are set by
// the preset's `upper`/`jaw` keys), then sculpted: maxilla/dentary ridges
// carry the tooth rows (so the lip line, not the middle of an ellipse, is the
// lowest edge), a vaulted palate and mouth floor are carved between them,
// brow ridges overhang the eyes, cheek bones and jaw muscles widen the back.
// The lower jaw is built closed and rotated open by gape0, so the rest mesh
// has a real mouth interior.
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
  for (let z = -0.1; z < 0.999; z += 0.055) zs.push(z);
  const lastZ = 1 - 0.55 * Math.sqrt(U(1)[0] * (U(1)[1] - U(1)[2]) / 2);
  zs.push(lastZ);
  const secU = (z) => { const [hw, top, bot] = U(z); const b2 = bot - 0.035; return { hw, hh: (top - b2) / 2, cy: (top + b2) / 2 }; };
  const gU = m.group();
  for (let i = 0; i < zs.length - 1; i++) sectionCone(zs[i], zs[i + 1], secU(zs[i]), secU(zs[i + 1]), 0.05, t, W, ey, gU);
  // lip line: where the mouth wedge (below) cuts the loft; teeth sit just inside it
  const lipW = (z) => { const s2 = secU(z); const q = (U(z)[2] - s2.cy) / s2.hh; return s2.hw * Math.sqrt(Math.max(0, 1 - q * q)); };
  const ridgeU = (sd, z) => [sd * 0.86 * lipW(z), U(z)[2], z];
  // brow ridges, jaw muscles, cheek bones, nostril mounds
  const eye = [hs.eye[0] - hs.eyeR * (hs.eyeInset ?? 0.55), hs.eye[1] - hs.eyeR * 0.1, hs.eye[2]];   // eyeInset: how deep the eyeball sits
  for (const sd of [1, -1]) {
    m.ell(W(sd * (eye[0] - 0.012 + hs.eyeR * 0.47), eye[1] + hs.eyeR * 1.12, eye[2] - 0.015), [0.06 * H * hs.brow, 0.03 * H * hs.brow, 0.13 * H], { ax: Wd(1, 0.35 * sd, 0.1 * sd), ay: Wd(-0.35 * sd, 1, 0.05), k: 0.022 * H, ...t });
    // canthus: bony ridge from the brow toward the nostril
    m.cone(W(sd * (eye[0] - 0.035), eye[1] + hs.eyeR * 0.95, eye[2] + 0.08), W(sd * 0.06, U(0.86)[1] - 0.012, 0.86), 0.022 * H * hs.brow, 0.012 * H, { k: 0.025 * H, ...t });
    // horn boss on the back of the skull
    m.ell(W(sd * 0.12, U(0.04)[1] - 0.025, 0.05), [0.06 * H * hs.brow, 0.045 * H, 0.07 * H], { ax: ex, ay: ey, k: 0.03 * H, ...t });
    m.ell(W(sd * 0.148 * hs.jawMuscle ** 0.4, -0.025, 0.1), [0.075 * H * hs.jawMuscle, 0.115 * H, 0.13 * H], { ax: ex, ay: ey, k: 0.05 * H, ...t });
    m.cone(W(sd * (eye[0] + 0.006), eye[1] - hs.eyeR * 1.35, eye[2] + 0.09), W(sd * (0.168 + 0.012 * hs.cheek), -0.045, 0.04), 0.022 * H * hs.cheek, 0.034 * H * hs.cheek, { k: 0.022 * H, ...t });
    const zN = 0.9;
    m.ell(W(sd * 0.045, U(zN)[1] - 0.018, zN), [0.036 * H * hs.nostril, 0.026 * H * hs.nostril, 0.06 * H * hs.nostril], { ax: ex, ay: ey, k: 0.03 * H, ...t });
  }

  // ---- lower jaw (closed config, rotated open by gape0)
  const jt = { chain: 'jaw', bone: 'jaw', tag: 'jaw' };
  const secJ = (z) => { const [hw, top, bot] = J(z); const t2 = top + 0.03; return { hw: hw * 0.97, hh: (t2 - bot) / 2, cy: (t2 + bot) / 2 }; };
  const zj = [];
  for (let z = 0.0; z < 0.95; z += 0.07) zj.push(z);
  zj.push(1 - 0.5 * Math.sqrt(J(0.98)[0] * (J(0.98)[1] - J(0.98)[2]) / 2));
  const gJ = m.group();
  for (let i = 0; i < zj.length - 1; i++) sectionCone(zj[i], zj[i + 1], secJ(zj[i]), secJ(zj[i + 1]), 0.03, jt, jawPt, jawDir(0, 1, 0), gJ);
  // jaw angle (retroarticular process) projecting behind and below the hinge, both sides
  for (const sd of [1, -1]) {
    const [hw0, , b0] = J(0.06);
    m.cone(jawPt(sd * hw0 * 0.8, b0 + 0.06, 0.12), jawPt(sd * hw0 * 0.82, hinge[1] - 0.075, hinge[2] - 0.1), 0.05 * H, 0.032 * H, { k: 0.03 * H, ...jt });
  }
  const lipWJ = (z) => { const s2 = secJ(z); const q = (J(z)[1] - s2.cy) / s2.hh; return s2.hw * Math.sqrt(Math.max(0, 1 - q * q)); };
  const ridgeJ = (sd, z) => [sd * 0.84 * lipWJ(z), J(z)[1], z];
  // throat skin: jaw part follows the jaw, neck part follows the head
  const j0 = J(0.05);
  m.cone(jawPt(0, j0[2] + 0.05, 0.14), jawPt(0, j0[2] + 0.06, 0.0), 0.06 * H, 0.07 * H, { sx: 1.4, sy: 0.7, up: jawDir(0, 1, 0), k: 0.04 * H, chain: 'jaw', bone: 'jaw', tag: 'throat' });
  m.cone(W(0, j0[2] + 0.1, -0.04), W(0, U(-0.1)[2] - 0.02, -0.18), 0.075 * H, 0.11 * H, { sx: 1.3, sy: 0.75, up: ey, k: 0.05 * H, chain: 'spine', bone: 'head', tag: 'throat' });

  // ---- mouth: a wedge with its apex at the hinge and the rest gape as opening
  // angle cuts both jaws; its two faces become the lip lines, which meet
  // exactly when the jaw closes (rotation about the same apex).
  const midG = g * 0.5;
  {
    const axis = Wd(0, -Math.sin(midG), Math.cos(midG));
    const apex = W(0, hinge[1], hinge[2]);
    const s0 = 0.2, s1 = 1.35, sa = Math.sin(midG);
    m.cone(add(apex, scale(axis, s0 * H)), add(apex, scale(axis, s1 * H)), s0 * sa * H, s1 * sa * H, { sx: 12, sy: 1, up: Wd(0, Math.cos(midG), Math.sin(midG)), k: 0.022 * H, op: 'sub', chain: 'jaw', bone: 'jaw', tag: 'mouth' });
  }
  const cav = (x, y, z) => { const r = rotJ(y, z, midG); return W(x, r[0], r[1]); };
  const cavDir = (x, y, z) => { const c = Math.cos(midG), s = Math.sin(midG); return Wd(x, y * c - z * s, y * s + z * c); };
  const mouthY = hinge[1];
  m.ell(cav(0, mouthY, 0.5), [0.5 * lipW(0.5) * H, 0.02 * H, 0.36 * H], { ax: ex, ay: cavDir(0, 1, 0), k: 0.03 * H, op: 'sub', chain: 'jaw', bone: 'jaw', tag: 'mouth' });
  m.ell(cav(0, mouthY - 0.005, 0.16), [0.08 * H, 0.035 * H, 0.12 * H], { ax: ex, ay: cavDir(0, 1, 0), k: 0.03 * H, op: 'sub', chain: 'jaw', bone: 'jaw', tag: 'mouth' });
  m.cone(jawPt(0, J(0.2)[1] - 0.035, 0.12), jawPt(0, J(0.7)[1] - 0.03, 0.72), 0.042 * H, 0.024 * H, { sx: 1.45, sy: 0.5, up: jawDir(0, 1, 0), k: 0.012 * H, chain: 'jaw', bone: 'jaw', tag: 'tongue' });
  // eye sockets and nostrils
  for (const sd of [1, -1]) {
    m.ell(W(sd * eye[0], eye[1], eye[2]), [hs.eyeR * H * 1.08, hs.eyeR * H * 1.0, hs.eyeR * H * 1.2], { ax: Wd(0.94, 0, -0.34 * sd), ay: ey, k: 0.012 * H, op: 'sub', ...t, tag: 'eyesocket' });
    m.ell(W(sd * 0.05, U(0.93)[1] - 0.008, 0.93), [0.016 * H * hs.nostril, 0.011 * H * hs.nostril, 0.028 * H * hs.nostril], { ax: Wd(1, 0.6, 0.1 * sd), ay: Wd(-0.6, 1, 0), k: 0.01 * H, op: 'sub', ...t, tag: 'nostril' });
  }

  // ---- bones
  bone('jaw', 'head', W(0, hinge[1], hinge[2]));
  for (const sd of [1, -1]) {
    const side = sd > 0 ? 'L' : 'R';
    const c = W(sd * eye[0], eye[1], eye[2]);
    bone(`eye_${side}`, 'head', c);
    bone(`lidU_${side}`, 'head', c);
    bone(`lidL_${side}`, 'head', c);
    const look = Wd(sd * 0.84, 0.1, 0.53);
    eyes.push({ side, sd, center: c, radius: hs.eyeR * H, look, bone: `eye_${side}`, lidU: `lidU_${side}`, lidL: `lidL_${side}`, up: ey });
  }
  chains.jaw = { points: [W(0, hinge[1], hinge[2]), jawPt(0, J(0.9)[1] - 0.05, 0.98)], refUp: jawDir(0, 1, 0), kind: 'jaw' };
  chains.skull = { points: [W(0, 0.02, -0.15), W(0, 0.04, 0.35), W(0, U(1)[1] * 0.3, 1.0)], refUp: ey, kind: 'skull' };
  sockets.mouth = { bone: 'jaw', pos: cav(0, mouthY, 0.55) };
  sockets.headFrame = { ex, ey, ez, origin: hj, H };

  // ---- teeth: upper row below the maxilla ridge, lower row above the dentary ridge
  const nT = hs.teethUp | 0;
  const hashf = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  for (const sd of [1, -1]) {
    for (let i = 0; i < nT; i++) {
      const f = (i + 0.5) / nT;
      const z = 0.17 + (0.95 - 0.17) * f;
      const big = Math.exp(-Math.pow((f - 0.78) / 0.07, 2)) * 0.9 + Math.exp(-Math.pow((f - 0.95) / 0.05, 2)) * 0.4;
      const size = hs.teethSize * (0.55 + 0.45 * f + 0.6 * big) * (0.85 + 0.3 * hashf(i * 7 + (sd > 0 ? 1 : 2)));
      const r = ridgeU(sd, z);
      const x = r[0], y = r[1] + size * 0.15;
      const lean = 0.25 + 0.3 * hashf(i * 13 + sd);
      keratin.push({ kind: 'tooth', bone: 'head', tag: 'tooth',
        points: [W(x, y + size * 0.5, z), W(x * 0.995, y - size * 0.35, z + size * 0.05), W(x * 0.985, y - size * 1.05, z - size * lean)],
        radii: [size * 0.3 * H, size * 0.21 * H, size * 0.015 * H], flat: 0.72, up: ez });
    }
    for (let i = 0; i < nT - 1; i++) {
      const f = (i + 1) / nT;
      const z = 0.17 + (0.92 - 0.17) * f;
      const big = Math.exp(-Math.pow((f - 0.86) / 0.06, 2)) * 0.8;
      const size = hs.teethSize * 0.9 * (0.55 + 0.45 * f + 0.6 * big) * (0.85 + 0.3 * hashf(i * 5 + (sd > 0 ? 3 : 4)));
      const r = ridgeJ(sd, z);
      const x = r[0], y = r[1] - size * 0.15;
      keratin.push({ kind: 'tooth', bone: 'jaw', tag: 'tooth',
        points: [jawPt(x, y - size * 0.5, z), jawPt(x * 0.995, y + size * 0.35, z + size * 0.05), jawPt(x * 0.985, y + size * 1.0, z - size * 0.3)],
        radii: [size * 0.28 * H, size * 0.2 * H, size * 0.015 * H], flat: 0.72, up: ez });
    }
  }

  // ---- horns (fixed arrangement per species; never changes between shots)
  const horn = (p0, p1, p2, r0, r1, tag = 'horn') => keratin.push({ kind: 'horn', bone: 'head', tag, points: [W(...p0), W(...p1), W(...p2)], radii: [r0 * H, r1 * H, r0 * 0.04 * H], flat: 0.85, up: ey, rings: tag === 'horn' });
  for (const sd of [1, -1]) {
    if (spec.horns === 'bashion') {
      horn([sd * 0.12, 0.16, 0.05], [sd * 0.21, 0.27, -0.2], [sd * 0.24, 0.2, -0.52], 0.072, 0.044);
      horn([sd * 0.185, 0.05, 0.0], [sd * 0.245, 0.02, -0.15], [sd * 0.26, -0.05, -0.3], 0.036, 0.022);
      for (let i = 0; i < 2; i++) horn([sd * (0.18 + i * 0.012), -0.2 - i * 0.03, 0.0 - i * 0.07], [sd * (0.22 + i * 0.012), -0.23 - i * 0.03, -0.06 - i * 0.07], [sd * (0.235 + i * 0.012), -0.26 - i * 0.035, -0.11 - i * 0.07], 0.022 - i * 0.004, 0.013, 'spur');
    } else if (spec.horns === 'nightwing') {
      horn([sd * 0.1, 0.15, 0.06], [sd * 0.16, 0.22, -0.18], [sd * 0.18, 0.2, -0.46], 0.048, 0.029);
      horn([sd * 0.165, 0.04, 0.02], [sd * 0.21, 0.01, -0.12], [sd * 0.22, -0.03, -0.25], 0.024, 0.014);
    } else if (spec.horns === 'slitherwing') {
      horn([sd * 0.09, 0.09, 0.08], [sd * 0.12, 0.1, -0.1], [sd * 0.13, 0.09, -0.3], 0.03, 0.018);
    } else if (spec.horns === 'buds') {
      horn([sd * 0.11, 0.2, 0.08], [sd * 0.125, 0.23, 0.04], [sd * 0.135, 0.24, 0.0], 0.03, 0.022, 'bud');
    }
  }
  return { H, frame: { ex, ey, ez, origin: hj }, hinge: W(0, hinge[1], hinge[2]), gape0: g, W, jawPt, U, J, rr };
}
