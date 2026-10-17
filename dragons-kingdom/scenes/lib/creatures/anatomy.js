// Procedural dragon anatomy: skeleton + SDF sculpt + part layout - the WYVERN layout of
// DESIGN.md (Daxtyn, 2026-10-14: every dragon has TWO legs and HORNS; the wings ARE the front
// limbs, as in bats and pterosaurs). Every dragon is its own design (no species): DESIGNS holds
// the numbers of DESIGN.md appendix A in metres plus the few build choices the appendix leaves
// open (muscle masses, skin folds, scale sizes).
//
// Conventions (assets.json): metres, +y up, the creature faces +z, its LEFT is +x.
//
// Two configurations of one skeleton:
//   REST (bind of the wing membranes, every bone at identity rotation): the glide planform -
//     wings spread flat at the shoulders (DESIGN 10), legs trailing back and spread under the
//     tail (the plagiopatagium runs to the ankle), neck forward and a little up, tail straight.
//   SCULPT (bind of the body mesh and every solid part): legs STANDING (feet flat, knees
//     forward, from two-bone IK at the design's hip height) and the wing-arms half folded (half
//     way between the glide and the wing-walk stance), so that both the stance and the spread
//     wing are a moderate bend away from the bind pose. `sculptLocal` holds the local rotations
//     that carry REST onto SCULPT; creature.js binds the body with the sculpt inverses.
// Helper bones (w_#_sh at the shoulder, hl_#_h at the hip) follow half of the humerus / femur
// rotation (pose.js), so the shoulder and the hip bend over a wider band of skin (no collapse).
//
// The sculpt follows real anatomy: a deep keeled chest (sternum + pectoralis, the downstroke
// muscle), the upstroke muscles as a hump over the shoulder blades (the giants), the forearm as
// a weight-bearing limb (thick at the elbow, tendons at the wrist) ending in a callused wrist
// pad with a robust clawed thumb, bird/theropod hind legs (knee forward, mesotarsal ankle,
// scutellate metatarsus, three toes forward and a gripping hallux, a fibro-fatty heel pad on
// the giants), the reptile's caudofemoralis from the tail base to the thigh, a crocodilian
// head (gape back below the eye, brow shelf, labial scales over the teeth), skin folds at the
// throat, neck base, armpit and flank, and a double crest of keeled osteoderm scutes at the
// tail base that merges into a single crest along the tail.

import { SDFModel, add, sub, scale, dot, cross, norm, len, lerp3, clamp, mix } from './sdf.js';
import { qMul, qInv, qRot, chainLocals, fk, ik2, QI } from './kin.js';

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
const ortho = (v, a) => { const d = dot(v, a); return norm([v[0] - a[0] * d, v[1] - a[1] * d, v[2] - a[2] * d]); };

// ------------------------------------------------------------ design presets
// Numbers from DESIGN.md appendix A (metres, degrees). Profiles: [s, full width, full depth];
// neck s 0 = head end .. 1 = base; trunk s 0 = shoulder .. 1 = hip; tail s 0 = base .. 1 = tip;
// head s 0 = back of the skull .. 1 = snout tip. Fingers: [name, metacarpal, [phalanges],
// spread from lateral in the glide (negative = swept back)].
// Build choices (not in the appendix): body = muscle/fat masses (1 = an athletic adult),
// headX = head sculpt features, folds = skin folds, crest = tail scute height (m), scale =
// scale width in L units at the chain's median radius.
export const DESIGNS = {
  charcoal: {
    name: 'Charcoal', L: 36, skull: 3.6, neck: 6.9, trunk: 9.3, tail: 16.2, neckBones: 11, tailBones: 28,
    // a deep, heavy skull that stands clear of the neck (the neck narrows behind the jaws)
    head: [[0, 1.8, 1.85], [0.25, 1.8, 1.8], [0.5, 1.45, 1.36], [0.75, 1.16, 1.02], [1, 0.86, 0.68]],
    neckP: [[0, 0.95, 1.22], [0.5, 1.3, 1.9], [1, 1.85, 2.9]],
    trunkP: [[0, 2.7, 4.2], [0.25, 2.9, 4.5], [0.6, 2.4, 3.4], [0.85, 2.2, 2.8], [1, 2.35, 2.6]],
    tailP: [[0, 1.95, 2.15], [0.15, 1.5, 1.7], [0.35, 0.95, 1.1], [0.6, 0.48, 0.56], [0.85, 0.19, 0.23], [1, 0.04, 0.04]],
    stand: { hip: 7.0, shoulder: 7.5, forearmLean: 12, humerusRise: 12, neckRise: 25, neckTop: 0, headPitch: -14, tailDroop: 22 },
    fold: { curl: [8, 60, 108] }, bulk: { leg: 1.38, arm: 1.12, neck: 1.12 },
    // semi-digitigrade with a fibro-fatty heel pad (elephant); claws thick, blunt, chipped
    leg: { femur: 3.1, tibia: 3.4, mt: 1.5, toe: 1.3, claw: 0.42, d: [1.7, 1.05, 1.0, 0.62, 0.52], mtAng: 40, heelPad: 1.0, hallux: 0.48, toeR: 0.19, blunt: 1 },
    wing: { humerus: 4.5, forearm: 8.1, d: [1.55, 1.0, 0.62, 0.42],
      fingers: [['III', 7.4, [5.2, 3.9, 2.3], -6], ['IV', 6.8, [5, 3.4, 1.6], -32], ['V', 6.2, [4.6, 2.9, 1.2], -64]],
      thumb: { mc: 0.7, ph: 0.55, claw: 0.6 }, to: 'ankle', glide: { humerus: -16, forearm: 12 }, legSplay: 24, thick: 0.007 },
    eye: 0.29, snout: 0.58, teeth: [15, 14], toothMax: 0.4, jawMax: 50,
    body: { hump: 0.75, keel: 1.0, belly: 1.0, pec: 1.1, arm: 1.15, thigh: 1.05, tailbase: 1.1, neck: 1.1 },
    headX: { brow: 1.6, cheek: 1.15, jawMuscle: 1.45, nostril: 1.0, lipCover: 0.22, lipIrregular: 1, tympanum: 1, ridgeR: 0.024, chin: 1 },
    horns: 'charcoal', crest: { tail: 0.32, back: 0.12 },
    scale: { body: 0.0042, belly: 0.012, head: 0.0032 },
    folds: { throat: 3, neck: 2, tail: 3, axilla: 1, stifle: 1 },
    flapHz: 0.42, flapAmp: 85,
  },
  leaf: {
    name: 'Leaf', L: 9, skull: 1.0, neck: 1.6, trunk: 2.3, tail: 4.1, neckBones: 10, tailBones: 26,
    head: [[0, 0.54, 0.54], [0.3, 0.52, 0.52], [0.55, 0.38, 0.34], [0.8, 0.28, 0.24], [1, 0.19, 0.16]],
    neckP: [[0, 0.3, 0.37], [0.5, 0.35, 0.43], [1, 0.48, 0.62]],
    trunkP: [[0, 0.66, 0.92], [0.25, 0.7, 0.96], [0.6, 0.56, 0.74], [0.85, 0.5, 0.6], [1, 0.52, 0.56]],
    tailP: [[0, 0.44, 0.48], [0.15, 0.33, 0.37], [0.35, 0.21, 0.24], [0.6, 0.11, 0.13], [0.85, 0.045, 0.05], [1, 0.01, 0.01]],
    stand: { hip: 2.05, shoulder: 1.9, forearmLean: 10, humerusRise: 14, neckRise: 46, neckTop: 22, headPitch: -12, tailDroop: 24,
      low: { belly: 0.4, mtAng: 48, neckBase: 20, neckTop: 6 } },
    fold: { curl: [8, 58, 105] }, bulk: { leg: 1.12, arm: 1.12, neck: 1.0 },
    // digitigrade, a longer springier metatarsus than Charcoal's; claws sharp
    leg: { femur: 0.78, tibia: 0.9, mt: 0.48, toe: 0.36, claw: 0.1, d: [0.34, 0.19, 0.17, 0.1, 0.085], mtAng: 58, heelPad: 0.3, hallux: 0.42, toeR: 0.042 },
    wing: { humerus: 1.12, forearm: 2.08, d: [0.36, 0.25, 0.17, 0.1],
      fingers: [['III', 1.9, [1.35, 1, 0.6], -6], ['IV', 1.75, [1.25, 0.85, 0.4], -33], ['V', 1.6, [1.1, 0.72, 0.3], -65]],
      thumb: { mc: 0.18, ph: 0.13, claw: 0.14 }, to: 'shank', glide: { humerus: -16, forearm: 12 }, legSplay: 24, thick: 0.0018 },
    eye: 0.11, snout: 0.48, teeth: [16, 15], toothMax: 0.05, jawMax: 55,
    body: { hump: 0.0, keel: 0.8, belly: 0.55, pec: 0.9, arm: 0.95, thigh: 0.95, tailbase: 0.95, neck: 0.9 },
    headX: { brow: 1.0, cheek: 0.75, jawMuscle: 0.8, nostril: 0.9, lipCover: 0.6, tympanum: 0.9, ridgeR: 0.021, young: 1 },
    horns: 'leaf', crest: { tail: 0.035, back: 0.0 },
    scale: { body: 0.0045, belly: 0.0095, head: 0.003 },
    folds: { throat: 2, neck: 1, tail: 1, axilla: 1, stifle: 1 },
    flapHz: 0.8, flapAmp: 105,
  },
  starlight: {
    name: 'Starlight', L: 72, skull: 5.6, neck: 16, trunk: 16, tail: 34.4, neckBones: 14, tailBones: 30,
    head: [[0, 2.4, 2.1], [0.25, 2.4, 2.05], [0.5, 1.8, 1.4], [0.75, 1.4, 1], [1, 0.95, 0.66]],
    neckP: [[0, 1.7, 2.0], [0.5, 2.35, 2.8], [1, 3.5, 4.3]],
    trunkP: [[0, 4.2, 5.8], [0.25, 4.5, 6.1], [0.6, 3.7, 4.7], [0.85, 3.3, 3.8], [1, 3.5, 3.6]],
    tailP: [[0, 3.4, 3.7], [0.15, 2.6, 2.9], [0.35, 1.6, 1.8], [0.6, 0.72, 0.82], [0.85, 0.27, 0.3], [1, 0.05, 0.05]],
    // (rev. 3: the sculpt (bind) hip height follows the shorter legs)
    stand: { hip: 10.6, shoulder: 11.0, forearmLean: 10, humerusRise: 16, neckRise: 40, neckTop: 10, headPitch: -12, tailDroop: 18,
      low: { belly: 0.5, mtAng: 54 } },
    // (albatross: the long folded wings lie along the back, the tips crossing over the tail base)
    fold: { curl: [-4, 2, 6], inward: 0.16, wrap: 0.1, outUp: 0.5, lowCurl: [-6, 4, 16], low: { outUp: 0.15, inward: 0.12, wrap: 0.06 } }, bulk: { leg: 1.2, arm: 1.15, neck: 1.0 },
    // raptor feet: long toes, big curved talons, a large opposable hallux with the biggest talon
    leg: { femur: 4.0, tibia: 4.8, mt: 2.8, toe: 3.1, claw: 1.3, d: [3.6, 2.3, 2.15, 1.4, 1.2], mtAng: 55, heelPad: 0.4, hallux: 0.62, toeR: 0.3, raptor: 1 },
    wing: { humerus: 8.6, forearm: 16.4, d: [3.0, 2.0, 1.25, 0.85],
      fingers: [['II', 14.5, [5, 2.5], 2], ['III', 15.5, [11.5, 8.5, 5], -5], ['IV', 14, [10.5, 7.2, 3.4], -28], ['V', 12.8, [9, 6, 2.6], -52]],
      thumb: { mc: 1.3, ph: 0.9, claw: 1 }, to: 'ankle', glide: { humerus: -15, forearm: 12 }, legSplay: 30, thick: 0.014 },
    eye: 0.39, snout: 0.6, teeth: [18, 17], toothMax: 0.36, jawMax: 45,
    body: { hump: 0.25, keel: 1.1, belly: 0.5, pec: 1.0, arm: 1.0, thigh: 0.95, tailbase: 1.0, neck: 1.0 },
    headX: { brow: 1.5, cheek: 1.0, jawMuscle: 1.0, nostril: 1.0, lipCover: 0.75, tympanum: 0.9, ridgeR: 0.022, long: 1 },
    horns: 'starlight', crest: { tail: 0.3, back: 0.0 },
    scale: { body: 0.0045, belly: 0.0095, head: 0.003 },
    folds: { throat: 2, neck: 0, tail: 1, axilla: 1, stifle: 1 },
    flapHz: 0.24, flapAmp: 75,
  },
  scout: {
    // (fix round 1: a shorter, thicker tail - the whip twice the body's length read as a rat's tail)
    name: 'Scout', L: 5.9, skull: 0.5, neck: 1.1, trunk: 1.6, tail: 2.7, neckBones: 9, tailBones: 22,
    head: [[0, 0.25, 0.25], [0.3, 0.24, 0.23], [0.55, 0.17, 0.15], [0.8, 0.11, 0.1], [1, 0.06, 0.05]],
    neckP: [[0, 0.15, 0.17], [0.5, 0.19, 0.22], [1, 0.29, 0.37]],
    trunkP: [[0, 0.42, 0.62], [0.25, 0.47, 0.67], [0.6, 0.36, 0.48], [0.85, 0.3, 0.34], [1, 0.3, 0.3]],
    tailP: [[0, 0.26, 0.28], [0.15, 0.18, 0.2], [0.35, 0.12, 0.13], [0.6, 0.075, 0.08], [0.85, 0.04, 0.042], [1, 0.012, 0.012]],
    stand: { hip: 1.1, shoulder: 1.25, forearmLean: 14, humerusRise: 10, neckRise: 32, neckTop: 10, headPitch: -10, tailDroop: 16,
      low: { belly: 0.36, mtAng: 56, neckBase: 18, neckTop: 4, hum: [0.45, -0.12, 0.88] } },
    fold: { curl: [6, 40, 80] }, bulk: { leg: 1.05, arm: 1.05, neck: 1.0 },
    leg: { femur: 0.45, tibia: 0.54, mt: 0.26, toe: 0.17, claw: 0.05, d: [0.2, 0.12, 0.105, 0.068, 0.06], mtAng: 60, heelPad: 0.2, hallux: 0.4, toeR: 0.02 },
    wing: { humerus: 0.62, forearm: 1.28, d: [0.27, 0.18, 0.11, 0.065],
      fingers: [['III', 1.3, [1.05, 0.8, 0.45], -12], ['IV', 1.15, [0.9, 0.5], -46]],
      thumb: { mc: 0.08, ph: 0.06, claw: 0.06 }, to: 'hip', glide: { humerus: -20, forearm: 6 }, legSplay: 10, thick: 0.0011 },
    eye: 0.055, snout: 0.55, teeth: [20, 19], toothMax: 0.015, jawMax: 60, gazeForward: 0.45,
    body: { hump: 0.0, keel: 1.15, belly: 0.4, pec: 1.15, arm: 0.9, thigh: 0.7, tailbase: 0.8, neck: 0.85 },
    headX: { brow: 0.7, cheek: 0.55, jawMuscle: 0.6, nostril: 0.7, lipCover: 0.45, tympanum: 0.6, ridgeR: 0.018 },
    horns: 'scout', crest: { tail: 0.0, back: 0.0 }, tailVane: { length: 0.24, width: 0.13, thick: 0.0045 },
    scale: { body: 0.0035, belly: 0.008, head: 0.0026 },
    folds: { throat: 1, neck: 1, tail: 0, axilla: 1, stifle: 1 },
    flapHz: 1.09, flapAmp: 95,
  },
  hatchling: {
    name: 'Gold hatchling', L: 1.0, skull: 0.19, neck: 0.13, trunk: 0.27, tail: 0.41, neckBones: 8, tailBones: 20,
    // (rev. 3: a flatter, longer-browed skull - the tall dome read as a toy's)
    head: [[0, 0.15, 0.14], [0.3, 0.165, 0.145], [0.55, 0.14, 0.112], [0.8, 0.108, 0.08], [1, 0.078, 0.055]],
    neckP: [[0, 0.078, 0.088], [0.5, 0.086, 0.095], [1, 0.112, 0.128]],
    // (rev. 3: a slimmer hatchling-lizard trunk - as wide and deep as it was long it read as a gold ball / squeeze toy)
    trunkP: [[0, 0.13, 0.15], [0.3, 0.155, 0.165], [0.6, 0.16, 0.155], [0.85, 0.13, 0.125], [1, 0.11, 0.105]],
    tailP: [[0, 0.1, 0.1], [0.15, 0.075, 0.078], [0.35, 0.05, 0.052], [0.6, 0.028, 0.03], [0.85, 0.012, 0.013], [1, 0.004, 0.004]],
    stand: { hip: 0.17, shoulder: 0.14, forearmLean: 22, humerusRise: -12, neckRise: 20, neckTop: 5, headPitch: -25, tailDroop: 30 },
    // (rev. 3: slimmer limbs and a smaller yolk belly - the bloated body and stubby thick limbs read as a squeeze toy)
    fold: { curl: [15, 70, 110] }, bulk: { leg: 1.05, arm: 1.0, neck: 1.0 },
    leg: { femur: 0.075, tibia: 0.08, mt: 0.045, toe: 0.065, claw: 0.018, d: [0.05, 0.035, 0.03, 0.022, 0.02], mtAng: 30, heelPad: 0.5, hallux: 0.45, toeR: 0.0085, soft: 1 },
    wing: { humerus: 0.072, forearm: 0.118, d: [0.038, 0.026, 0.02, 0.016],
      fingers: [['III', 0.08, [0.05, 0.035, 0.02], -10], ['IV', 0.07, [0.035, 0.02, 0.01], -48], ['V', 0.06, [0.025, 0.015, 0.008], -80]],
      thumb: { mc: 0.016, ph: 0.014, claw: 0.02 }, to: 'knee', glide: { humerus: -16, forearm: 12 }, legSplay: 22, thick: 0.0006 },
    eye: 0.042, snout: 0.2, teeth: [0, 0], toothMax: 0, jawMax: 30, newborn: 1,
    body: { hump: 0, keel: 0.4, belly: 1.2, pec: 0.5, arm: 0.45, thigh: 0.55, tailbase: 0.7, neck: 0.7 },
    headX: { brow: 0.35, cheek: 0.45, jawMuscle: 0.35, nostril: 0.6, lipCover: 0.0, tympanum: 0.4, ridgeR: 0.026, soft: true, eggTooth: true },
    horns: 'buds', crest: { tail: 0.0, back: 0.0 },
    scale: { body: 0.0034, belly: 0.006, head: 0.0028 },
    folds: { throat: 0, neck: 1, tail: 0, axilla: 0, stifle: 0, soft: true },
    lid: { rIn: 1.03, rOut: 1.13, reachL: 0.8, span: 1.25, gran: 0.09, none: true },
    surfaceNoise: 0.0009,
    flapHz: 0, flapAmp: 0,
  },
};

// ------------------------------------------------------------- the builder
/**
 * Build the anatomy of a design at total length L (metres; default the design's).
 * Returns { L, spec, bones:[{name,parent,pos}], bonePos, sculptLocal, sdf, chains, keratin,
 * eyes, wings, legs, sockets, head, helpers, contacts, dims, spineInfo }.
 */
export function buildAnatomy(spec, Lreq, opts = {}) {
  const D = spec;
  const k = (Lreq ?? D.L) / D.L;
  const L = D.L * k;
  const K = (v) => v * k;
  const m = new SDFModel();
  m.noise = { amp: L * (D.surfaceNoise ?? 0.0011), freq: 1 / (L * 0.016) };
  const bones = [];
  const bonePos = {};
  const bone = (name, parent, pos) => { bones.push({ name, parent, pos: [...pos] }); bonePos[name] = [...pos]; return name; };
  const chains = {};
  const keratin = [];
  const eyes = [];
  const sockets = {};
  const contacts = [];
  const helpers = [];
  const MU = { hump: 0, keel: 1, belly: 1, pec: 1, arm: 1, thigh: 1, tailbase: 1, neck: 1, ...(D.body || {}) };
  const omitWing = opts.omitWing || {};

  // ------------------------------------------------------------- spine
  const H = K(D.skull), N = K(D.neck), T = K(D.trunk), TL = K(D.tail);
  const st = D.stand;
  const hipH = K(st.hip), shH = K(st.shoulder);
  const prT = (s) => profileAt(D.trunkP, s).map(K);           // [W, depth] metres
  const BK = { leg: 1, arm: 1, neck: 1, ...(D.bulk || {}) };
  const prN = (s) => profileAt(D.neckP, s).map((v) => K(v) * mix(BK.neck, 1, s * s));
  const prL = (s) => profileAt(D.tailP, s).map(K);
  const COL_T = 0.16, COL_N = 0.4, COL_L = 0.4;                // vertebral column depth below the dorsal surface (fraction)
  const sSh = 0.06;                                            // trunk station of the shoulder joint
  // (rev. 3, Daxtyn 2026-10-16: "low to the ground, with the legs more towards the center of the
  // body") the hip joint sits well forward of the tail base, under the middle of the body, as in
  // a bird (the acetabulum at ~2/3 of the synsacrum): the trunk behind it (pelvis, ischium, the
  // caudofemoralis) flows into the heavy tail base, so the legs come out of the middle of the
  // animal and the feet stand under its centre of mass
  const sHip = st.hipS ?? 0.68;                               // trunk station of the hip joint
  const topHip = hipH + 0.45 * prT(1)[1];
  const topSh = shH + 0.3 * prT(sSh)[1];
  const topAt = (s) => mix(topSh, topHip, (s - sSh) / (1 - sSh));
  const zAt = (s) => (1 - s) * T;                              // hip joint at z = 0, shoulder forward
  const spineY = (s) => topAt(s) - COL_T * prT(s)[1];
  const torsoS = [1, 0.72, 0.45, 0.18, 0];
  const torsoPts = torsoS.map((s) => [0, spineY(s), zAt(s)]);
  const neckPitch = 20 * deg;                                 // rest: forward and a little up
  const nd = [0, Math.sin(neckPitch), Math.cos(neckPitch)];
  const nB = D.neckBones;
  const neckPts = [];
  for (let i = 0; i <= nB; i++) neckPts.push(add(torsoPts[4], scale(nd, N * i / nB)));
  const headJoint = neckPts[nB];
  // tail: straight back with a slight droop (the glide), from the pelvis
  const tB = D.tailBones;
  const droop0 = 5 * deg;
  const tailEnd = add(torsoPts[0], [0, -Math.sin(droop0) * TL * 0.7, -TL * 0.995]);
  const tailCtl = add(torsoPts[0], [0, -Math.sin(droop0) * TL * 0.4, -TL * 0.5]);
  const tailCurve = polyline(bez(torsoPts[0], tailCtl, tailEnd, 64));
  const segLens = [];
  { let w = 0; for (let i = 0; i < tB; i++) { const l = Math.pow(0.972, i); segLens.push(l); w += l; } for (let i = 0; i < tB; i++) segLens[i] *= tailCurve.total / w; }
  const tailPts = [tailCurve.at(0).p];
  { let d = 0; for (let i = 0; i < tB; i++) { d += segLens[i]; tailPts.push(tailCurve.at(d).p); } }

  bone('body', null, torsoPts[2]);
  bone('lumbar', 'body', torsoPts[1]);
  // (rev. 3) the pelvis bone pivots at the hip station (the legs hang from it), not at the tail base
  bone('pelvis', 'lumbar', [0, spineY(sHip), zAt(sHip)]);
  bone('thorax', 'body', torsoPts[3]);
  bone('rib_lumbar', 'lumbar', torsoPts[1]);
  bone('rib_body', 'body', torsoPts[2]);
  bone('rib_thorax', 'thorax', torsoPts[3]);
  for (let i = 0; i < nB; i++) bone(`neck_${i}`, i === 0 ? 'thorax' : `neck_${i - 1}`, neckPts[i]);
  bone('head', `neck_${nB - 1}`, headJoint);
  for (let i = 0; i < tB; i++) bone(`tail_${i}`, i === 0 ? 'lumbar' : `tail_${i - 1}`, tailPts[i]);

  // the spine as ONE polyline from the tail tip to the head joint
  const spinePts = [...tailPts.slice().reverse(), ...torsoPts.slice(1), ...neckPts.slice(1)];
  const segBone = [];
  for (let i = tB - 1; i >= 0; i--) segBone.push(`tail_${i}`);
  segBone.push('rib_lumbar', 'rib_body', 'rib_body', 'rib_thorax');
  for (let i = 0; i < nB; i++) segBone.push(`neck_${i}`);
  const spine = polyline(spinePts);
  const dTail = spine.cum[tB], dWithers = spine.cum[tB + 4];
  // profiles: blended across the joins (hip -> tail base, chest -> neck base), no step
  const sec3 = (W, Dp, col) => [W / 2, Dp / 2, Dp / 2 - col * Dp];
  const profile = (d) => {
    if (d <= dTail) {
      const s = 1 - d / dTail;
      const a = sec3(...prL(s), COL_L);
      if (s < 0.07) { const b = sec3(...prT(1), COL_T); const f = smooth01(s / 0.07); return [mix(b[0], a[0], f), mix(b[1], a[1], f), mix(b[2], a[2], f)]; }
      return a;
    }
    if (d <= dWithers) { const s = 1 - (d - dTail) / (dWithers - dTail); return sec3(...prT(s), COL_T); }
    const s = 1 - (d - dWithers) / (spine.total - dWithers);
    const a = sec3(...prN(s), COL_N);
    if (s > 0.86) { const b = sec3(...prT(0), COL_T); const f = smooth01((s - 0.86) / 0.14); return [mix(a[0], b[0] * 0.92, f), mix(a[1], b[1] * 0.9, f), mix(a[2], b[2] * 0.9, f)]; }
    return a;
  };
  const upAt = (tan) => norm([0, tan[2], -tan[1]]);
  const boneAtD = (d) => segBone[Math.min(spine.at(d).seg, segBone.length - 1)];
  const tagAtD = (d) => d < dTail ? 'tail' : d < dWithers ? 'torso' : 'neck';
  const section = (d) => {
    const a = spine.at(d), pr = profile(d), up = upAt(a.tan);
    return { c: sub(a.p, scale(up, pr[2])), up, side: norm(cross(up, a.tan)), tan: a.tan, hw: pr[0], hh: pr[1], drop: pr[2], spineP: a.p, top: add(sub(a.p, scale(up, pr[2])), scale(up, pr[1])) };
  };
  {
    let d = 0;
    const samples = [];
    while (d < spine.total) { const pr = profile(d); samples.push(d); d += Math.max(L * 0.0035, Math.min(L * 0.02, 0.55 * Math.min(pr[0], pr[1]))); }
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
      m.cone(ca, cb, ra, rb, { sx, sy, up: norm(add(ua, ub)), k: L * 0.004, grp: gSpine, bone: segBone[Math.min(mid.seg, segBone.length - 1)], chain: 'spine', s0: d0, s1: d1, tag: tagAtD(d0) });
    }
  }
  chains.spine = { points: spinePts, refUp: [0, 1, 0], kind: 'spine' };
  sockets.withers = { bone: 'neck_0', pos: torsoPts[4] };
  const dAtTorso = (s) => dWithers - s * (dWithers - dTail);
  const dAtNeck = (s) => spine.total - s * (spine.total - dWithers);
  const dAtTail = (s) => (1 - s) * dTail;
  const ts = { chain: 'spine', tag: 'torso' };

  // ------------------------------------------------------- torso sculpt
  // hanging belly between the chest and the hips (fat on the giants, little on the young)
  {
    // (rev. 3) between the shoulders and the forward hips
    const sc = section(dAtTorso(mix(sSh, sHip, 0.55)));
    const mb = MU.belly;
    if (mb > 0) m.ell(sub(sc.c, scale(sc.up, sc.hh * 0.42)), [sc.hw * 0.8 * Math.sqrt(mb), sc.hh * 0.5 * Math.sqrt(mb), T * 0.22], { ax: sc.side, ay: sc.up, k: sc.hh * 0.5, bone: 'rib_body', ...ts });
  }
  // the keeled sternum: a deep blade along the ventral midline of the chest (the downstroke
  // muscle is anchored on it), its front (manubrium) under the neck base
  const chest = section(dAtTorso(0.2));
  {
    const kk = MU.keel;
    m.ell(sub(chest.c, scale(chest.up, chest.hh * 0.56)), [chest.hw * 0.3, chest.hh * 0.5 * kk, T * 0.3], { ax: [1, 0, 0], ay: chest.up, k: chest.hh * 0.35, bone: 'rib_thorax', ...ts });
    const f0 = section(dAtTorso(0.0));
    m.ell(add(sub(f0.c, scale(f0.up, f0.hh * 0.42)), scale(f0.tan, f0.hw * 0.22)), [f0.hw * 0.42, f0.hh * 0.45, T * 0.13], { ax: [1, 0, 0], ay: f0.up, k: f0.hh * 0.4, bone: 'rib_thorax', ...ts });
  }
  // hip bones (ilium crests) either side of the sacrum
  {
    const sp = section(dAtTorso(Math.min(0.97, sHip + 0.05)));
    for (const sd of [1, -1]) m.ell(add(add(sp.c, scale(sp.up, sp.hh * 0.55)), scale(sp.side, sd * sp.hw * 0.55)), [sp.hw * 0.26, sp.hh * 0.22, T * 0.1], { k: sp.hw * 0.3, bone: 'pelvis', ...ts });
  }
  // the hump: the upstroke muscles over the shoulder blades (the giants' "bison hump")
  if (MU.hump > 0) {
    const sh = section(dAtTorso(0.14));
    const hp = K(MU.hump);
    const ry = sh.hh * 0.3 + hp;
    m.ell(sub(sh.top, scale(sh.up, sh.hh * 0.3)), [sh.hw * 0.62, ry, T * 0.17], { ax: [1, 0, 0], ay: sh.up, k: sh.hh * 0.45, bone: 'thorax', ...ts });
  }

  // ------------------------------------------------------- hind legs
  const LG = D.leg;
  const fem = K(LG.femur), tib = K(LG.tibia), mtl = K(LG.mt), toeL = K(LG.toe);
  const dl = LG.d.map(K);                     // diameters: thigh, knee, shank, ankle, foot
  const rLeg = [dl[0] * 0.3, dl[1] * 0.5, dl[3] * 0.5, dl[4] * 0.5];   // bone-core radii at hip, knee, ankle, ball
  const toeR = K(LG.toeR);
  const hipSec = section(dAtTorso(sHip));
  const hipX = hipSec.hw * 0.62;
  // (rev. 3) the acetabulum ~0.42 of the trunk depth below the back at the hip station
  const hipJY = hipSec.top[1] - hipSec.hh * 0.84, hipJZ = zAt(sHip);
  const footX = Math.max(hipX * 1.06, toeL * 0.62);
  const legs = [];
  const sculptLocal = {};
  const sculptWorld = {};                     // bone -> world rotation in the sculpt pose (limb bones)
  const legRest = {};
  for (const sd of [1, -1]) {
    const side = sd > 0 ? 'L' : 'R';
    const pre = `hl_${side}`;
    const Hj = [sd * hipX, hipJY, hipJZ];
    // SCULPT (standing): metatarsus at mtAng from horizontal, heel under the hip, knee forward
    const ma = LG.mtAng * deg;
    const mtDir = [0, Math.sin(ma), -Math.cos(ma)];                     // from the ball up-back to the ankle
    const ballY = toeR * 1.05;
    const ankZ = Hj[2] - fem * 0.04;
    // the feet a little wider than the hips: the inner toes must never meet under the body
    const Bs = [sd * footX, ballY, ankZ + mtl * Math.cos(ma)];
    const As = add(Bs, scale(mtDir, mtl));
    const ik = ik2(Hj, As, fem, tib, [sd * 0.18, 0.05, 1]);
    const Ks = ik.B, As2 = ik.C;
    const Bs2 = sub(As2, scale(mtDir, mtl));
    const footDirS = [0, 0, 1];
    // REST (glide): femur back, down a little and out, knee slightly bent, foot trailing, toes curled
    const spl = (LG.splay ?? D.wing.legSplay ?? 24) * deg;
    const fd = norm([sd * Math.sin(spl), -0.28, -Math.cos(spl)]);
    const td = norm([sd * Math.sin(spl) * 1.05, -0.12, -Math.cos(spl)]);
    const md = norm([sd * Math.sin(spl) * 0.9, -0.05, -1]);
    const footDirR = norm([sd * 0.15, -0.55, -0.8]);
    const Kr = add(Hj, scale(fd, fem)), Ar = add(Kr, scale(td, tib)), Br = add(Ar, scale(md, mtl));
    const names = [0, 1, 2, 3].map((i) => `${pre}_${i}`);
    bone(names[0], 'pelvis', Hj); bone(names[1], names[0], Kr); bone(names[2], names[1], Ar); bone(names[3], names[2], Br);
    bone(`${pre}_h`, 'pelvis', Hj);
    const restJ = [Hj, Kr, Ar, Br, add(Br, scale(footDirR, toeL))];
    const sculJ = [Hj, Ks, As2, Bs2, add(Bs2, scale(footDirS, toeL))];
    const ups = [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]];
    const cl = chainLocals(names, restJ, sculJ, ups, ups, QI());
    Object.assign(sculptLocal, cl.local);
    names.forEach((n, i) => { sculptWorld[n] = cl.world[i]; });
    sculptLocal[`${pre}_h`] = cl.local[names[0]];
    sculptWorld[`${pre}_h`] = cl.world[0];
    helpers.push({ bone: `${pre}_h`, driver: names[0], k: 0.5 });
    legRest[side] = { hip: Hj, knee: Kr, ankle: Ar, ball: Br, foot: add(Br, scale(footDirR, toeL)) };
    legs.push({ side, sd, names, sculpt: { hip: Hj, knee: Ks, ankle: As2, ball: Bs2 }, rest: legRest[side], toes: [] });
  }

  // ------------------------------------------------------- wing arms (rest + sculpt)
  const WG = D.wing;
  const hum = K(WG.humerus), fore = K(WG.forearm);
  const dw = WG.d.map(K);
  const rA = [dw[0] * 0.5, dw[1] * 0.5 * BK.arm, dw[2] * 0.5 * BK.arm, dw[3] * 0.5];
  const shSec = section(dAtTorso(sSh));
  const shX = shSec.hw * 0.5;
  const wingData = [];
  for (const sd of [1, -1]) {
    const side = sd > 0 ? 'L' : 'R';
    const pre = `w_${side}`;
    const S = [sd * shX, shH, zAt(sSh)];
    // REST: the glide planform (DESIGN 10): humerus swept back, forearm forward, fingers fanned
    const ah = WG.glide.humerus * deg, af = WG.glide.forearm * deg;
    const dirAt = (a) => [sd * Math.cos(a), 0, Math.sin(a)];
    const Er = add(S, scale(dirAt(ah), hum));
    const Wr = add(Er, scale(dirAt(af), fore));
    // SCULPT: half way between the glide and the wing-walk stance (out, back and down; the
    // forearm down and out), the dorsal side of the wing turned half way out
    const hS = norm([sd * 0.5, -0.32, -0.8]), fS = norm([sd * 0.62, -0.72, 0.25]);
    const Es = add(S, scale(hS, hum)), Wsc = add(Es, scale(fS, fore));
    const dorsS = norm([sd * 0.7, 0.7, 0]);
    const cl = chainLocals([`${pre}_0`, `${pre}_1`], [S, Er, Wr], [S, Es, Wsc], [[0, 1, 0], [0, 1, 0]], [dorsS, dorsS], QI());
    bone(`${pre}_sh`, 'thorax', S);
    bone(`${pre}_0`, 'thorax', S);
    bone(`${pre}_1`, `${pre}_0`, Er);
    bone(`${pre}_2`, `${pre}_1`, Wr);
    sculptLocal[`${pre}_0`] = cl.local[`${pre}_0`]; sculptLocal[`${pre}_1`] = cl.local[`${pre}_1`];
    sculptWorld[`${pre}_0`] = cl.world[0]; sculptWorld[`${pre}_1`] = cl.world[1];
    sculptLocal[`${pre}_sh`] = cl.local[`${pre}_0`]; sculptWorld[`${pre}_sh`] = cl.world[0];
    sculptWorld[`${pre}_2`] = cl.world[1];
    helpers.push({ bone: `${pre}_sh`, driver: `${pre}_0`, k: 0.3 });
    wingData.push({ side, sd, pre, S, Er, Wr, Es, Ws: Wsc, qH: cl.world[0], qF: cl.world[1] });
  }

  // ---------- sculpt-space helper: a rest point rigidly attached to a limb bone, in the sculpt
  const restOf = (b) => bonePos[b];
  const sculptPosOfBone = {};
  const toSculpt = (b, pRest) => {
    // bone positions in the sculpt (the chain joints computed above)
    const P = sculptPosOfBone[b] || restOf(b), q = sculptWorld[b] || QI();
    return add(P, qRot(q, sub(pRest, restOf(b))));
  };
  for (const lg of legs) { lg.names.forEach((n, i) => { sculptPosOfBone[n] = [lg.sculpt.hip, lg.sculpt.knee, lg.sculpt.ankle, lg.sculpt.ball][i]; }); sculptPosOfBone[`hl_${lg.side}_h`] = lg.sculpt.hip; }
  for (const w of wingData) { sculptPosOfBone[`${w.pre}_0`] = w.S; sculptPosOfBone[`${w.pre}_sh`] = w.S; sculptPosOfBone[`${w.pre}_1`] = w.Es; sculptPosOfBone[`${w.pre}_2`] = w.Ws; }

  // ------------------------------------------------- leg sculpt (standing)
  for (const lg of legs) {
    const { sd, side, names } = lg;
    const pre = `hl_${side}`;
    const J = [lg.sculpt.hip, lg.sculpt.knee, lg.sculpt.ankle, lg.sculpt.ball];
    const r = rLeg;
    const lt = (i) => ({ bone: names[i], chain: pre, tag: `hl${i}` });
    const seg = (i) => sub(J[i + 1], J[i]);
    const segL = (i) => len(seg(i)), segD = (i) => norm(seg(i));
    const out = [sd, 0, 0], back = [0, 0, -1], fwd = [0, 0, 1];
    const gLeg = m.group();
    for (let i = 0; i < 3; i++) m.cone(J[i], J[i + 1], r[i], r[i + 1], { k: r[0] * 0.9, grp: gLeg, ...lt(i) });
    const mt = MU.thigh;
    const R0 = dl[0] * 0.5 * BK.leg;          // the thigh's visible radius (bulk: the giants' mass)
    // glutes over the hip joint (helper bone: follows half the femur)
    m.ell(add(J[0], [sd * R0 * 0.1, R0 * 0.42, -R0 * 0.35]), [R0 * 0.5 * mt, R0 * 0.55 * mt, R0 * 0.95 * mt], { k: R0 * 0.6, bone: `${pre}_h`, chain: 'spine', tag: 'torso' });
    // quadriceps (front of the femur), hamstrings (ischium behind the hip -> below the knee)
    const qa = segD(0);
    m.ell(add(lerp3(J[0], J[1], 0.45), add(scale(fwd, R0 * 0.32), scale(out, R0 * 0.12))), [R0 * 0.62 * mt, segL(0) * 0.5, R0 * 0.62 * mt], { ax: ortho(out, qa), ay: qa, k: R0 * 0.55, ...lt(0) });
    const isch = add(J[0], [sd * R0 * 0.08, -R0 * 0.08, -R0 * 1.25]);
    const hamB = add(J[1], add(scale(back, r[1] * 0.9), [0, -r[1] * 0.45, 0]));
    const ha = norm(sub(hamB, isch));
    m.ell(add(lerp3(isch, hamB, 0.45), scale(out, R0 * 0.2)), [R0 * 0.62 * mt, len(sub(hamB, isch)) * 0.52, R0 * 0.7 * mt], { ax: ortho(out, ha), ay: ha, k: R0 * 0.6, ...lt(0) });
    // the thigh's outer mass (iliotibialis), the upper part on the hip helper
    m.ell(add(lerp3(J[0], J[1], 0.3), scale(out, R0 * 0.35)), [R0 * 0.5 * mt, segL(0) * 0.36, R0 * 0.75 * mt], { ax: ortho(out, qa), ay: qa, k: R0 * 0.5, bone: `${pre}_h`, chain: pre, tag: 'hl0' });
    // caudofemoralis: the reptile's big tail-to-thigh muscle under the tail base
    const tb = section(dAtTail(0.08));
    const cfA = add(tb.c, add(scale(tb.up, -tb.hh * 0.42), scale(tb.side, sd * tb.hw * 0.35)));
    const cfB = add(lerp3(J[0], J[1], 0.25), scale(back, R0 * 0.35));
    m.cone(cfA, cfB, tb.hh * 0.42 * MU.tailbase, R0 * 0.5 * MU.tailbase, { k: R0 * 0.7, bone: 'pelvis', chain: 'spine', tag: 'tail' });
    // knee cap
    m.ell(add(J[1], scale(fwd, r[1] * 0.6)), [r[1] * 0.66, r[1] * 0.7, r[1] * 0.48], { k: r[1] * 0.4, ...lt(1) });
    // calf (gastrocnemius) high behind the shank, tapering into the Achilles tendon to the heel
    const heel = add(J[2], scale(back, r[2] * 0.85));
    const sa = segD(1);
    const Rk = dl[2] * 0.5 * Math.sqrt(BK.leg);
    m.ell(add(lerp3(J[1], J[2], 0.26), scale(back, Rk * 0.55)), [Rk * 0.78 * mt, segL(1) * 0.3, Rk * 0.85 * mt], { ax: ortho(out, sa), ay: sa, k: Rk * 0.5, ...lt(1) });
    m.cone(add(lerp3(J[1], J[2], 0.45), scale(back, Rk * 0.6)), add(heel, [0, r[2] * 0.5, 0]), Rk * 0.4, r[2] * 0.42, { k: r[2] * 0.5, ...lt(1) });
    m.ell(add(J[1], [0, 0, 0]), [Rk * 0.95, Rk * 0.9, Rk * 0.9], { k: Rk * 0.5, ...lt(1) });
    m.ell(add(lerp3(J[1], J[2], 0.32), scale(fwd, Rk * 0.25)), [Rk * 0.6, segL(1) * 0.28, Rk * 0.5], { ax: ortho(out, sa), ay: sa, k: Rk * 0.4, ...lt(1) });
    // the hock (intertarsal joint) and the heel
    m.ell(add(heel, [0, r[2] * 0.15, 0]), [r[2] * 0.62, r[2] * 1.0, r[2] * 0.62], { k: r[2] * 0.4, ...lt(2) });
    m.ell(J[2], [r[2] * 1.12, r[2] * 1.05, r[2] * 1.0], { k: r[2] * 0.4, ...lt(2) });
    // the big fibro-fatty heel pad under the ankle (elephant; the giants), a smaller pad on the others
    const hp = LG.heelPad ?? 0.3;
    {
      const ma = LG.mtAng * deg;
      const under = [0, Math.max(r[3] * 0.9, (J[2][1] - r[2]) * 0.5), J[2][2] + r[2] * 0.2];
      const pc = [J[2][0], under[1], mix(J[2][2], J[3][2], 0.35)];
      m.ell(pc, [r[3] * 1.25 * (0.6 + 0.6 * hp), Math.max(r[3] * 0.6, (J[2][1] - r[2] * 0.4) * 0.55 * hp + r[3] * 0.4), mtl * Math.cos(ma) * 0.5 * (0.5 + 0.6 * hp)], { k: r[3] * 0.7, ...lt(3) });
      contacts.push({ bone: names[2], p: [pc[0], r[3] * 0.35, pc[2]], r: 0 });
    }
    // the foot: a broad pad under the ball
    const ball = J[3];
    m.ell(add(ball, [0, -r[3] * 0.2, r[3] * 0.3]), [r[3] * 1.55, r[3] * 0.8, r[3] * 1.5], { k: r[3] * 0.6, ...lt(3) });
    // toes: hallux (back, inward, raised; gripping) + II, III, IV forward
    const toeDef = [
      { n: 0, ang: sd * 160, l: toeL * (LG.hallux ?? 0.45), r: 0.85, up: 0.6 },
      { n: 1, ang: sd * 28, l: toeL * 0.82, r: 0.92, up: 0 },
      { n: 2, ang: sd * 5, l: toeL, r: 1.0, up: 0 },
      { n: 3, ang: -sd * 16, l: toeL * 0.86, r: 0.9, up: 0 },
    ];
    for (const td of toeDef) {
      const a = td.ang * deg;
      const dir = norm([Math.sin(a), td.up ? 0.25 : -0.06, Math.cos(a)]);
      const tr = toeR * td.r;
      const base = add(ball, [Math.sin(a) * r[3] * 0.7, td.up ? r[3] * 0.25 : -r[3] * 0.12, Math.cos(a) * r[3] * 0.55]);
      const knuckle = add(base, scale(dir, td.l * 0.48));
      const tip = add(base, scale([dir[0], td.up ? -0.05 : -0.3, dir[2]], td.l));
      const tipP = [tip[0], Math.max(tr * 0.72, tip[1]), tip[2]];
      const kn = add(knuckle, [0, tr * 0.32, 0]);
      const tname = `${pre}_t${td.n}`;
      const tchain = `${pre}_t${td.n}`;
      // toe bones are children of the ball bone with the ball's sculpt rotation: rest position
      const restBase = add(legRest[side].ball, qRot(qInv(sculptWorld[names[3]]), sub(base, J[3])));
      bone(tname, names[3], restBase);
      sculptPosOfBone[tname] = base; sculptWorld[tname] = sculptWorld[names[3]];
      m.cone(base, kn, tr, tr * 0.82, { k: tr * 0.8, bone: tname, chain: tchain, tag: 'toe' });
      m.cone(kn, tipP, tr * 0.82, tr * 0.62, { k: tr * 0.6, bone: tname, chain: tchain, tag: 'toe' });
      m.ell(add(kn, [0, tr * 0.12, 0]), [tr * 0.98, tr * 0.8, tr * 0.75], { k: tr * 0.4, bone: tname, chain: tchain, tag: 'toe' });
      // digital pads under the toe (tuberculate)
      for (const f of [0.35, 0.72]) m.ell(add(lerp3(base, tipP, f), [0, -tr * 0.5, 0]), [tr * 0.85, tr * 0.5, tr * 0.85], { k: tr * 0.4, bone: tname, chain: tchain, tag: 'toe' });
      chains[tchain] = { points: [base, kn, tipP], refUp: [0, 1, 0], kind: 'toe' };
      // claw: curved keratin from the toe tip; the giants' thick, blunt and chipped; raptor talons
      const cdir = norm([dir[0], td.up ? -0.35 : -0.6, dir[2]]);
      const raptor = LG.raptor ? (td.n === 0 ? 1.45 : 1.2) : 1;
      const cl = K(LG.claw) * (td.n === 0 ? 0.9 : td.n === 2 ? 1 : 0.85) * raptor * (0.92 + 0.16 * hsh(td.n, sd > 0 ? 13 : 17));
      const blunt = LG.blunt ? 0.22 : 0.08;
      const curl = LG.raptor ? 0.9 : 0.4;
      keratin.push({ kind: 'claw', bone: tname, tag: 'claw',
        points: [add(tipP, scale(dir, -tr * 0.55)), add(tipP, scale(norm([dir[0], 0.12, dir[2]]), cl * 0.5)), add(add(tipP, scale(cdir, cl)), [0, -tr * 0.3 - cl * curl * 0.25, 0])],
        radii: [tr * 0.88, tr * 0.6, tr * (LG.soft ? 0.25 : blunt)], flat: 0.8, up: [0, 1, 0] });
      contacts.push({ bone: tname, p: lerp3(base, tipP, 0.72), r: tr * 0.5 });
      lg.toes.push(tname);
    }
    chains[pre] = { points: J, refUp: [0, 0, 1], kind: 'limb' };
  }

  // ------------------------------------------------- wing-arm sculpt (half folded)
  const wings = [];
  for (const w of wingData) {
    const { sd, side, pre, S } = w;
    const E = w.Es, Wr = w.Ws;
    const detachable = !!omitWing[side];
    const target = detachable ? new SDFModel() : m;
    const along0 = norm(sub(E, S)), along1 = norm(sub(Wr, E));
    const dors0 = qRot(w.qH, [0, 1, 0]), lead0 = qRot(w.qH, [0, 0, 1]);
    const dors1 = qRot(w.qF, [0, 1, 0]), lead1 = qRot(w.qF, [0, 0, 1]);
    const ma = MU.arm;
    const hl = len(sub(E, S)), fl = len(sub(Wr, E));
    const wt = (b) => ({ bone: b, chain: pre, tag: 'warm' });
    // ---- on the body (the shoulder helper; stays on the scout when its wing tears off)
    // shoulder cap (deltoid) round the joint
    m.ell(add(S, add(scale(dors0, rA[0] * 0.25), scale(along0, rA[0] * 0.15))), [rA[0] * 1.0, rA[0] * 0.95, rA[0] * 1.08], { ax: ortho(lead0, along0), ay: along0, k: rA[0] * 0.55, bone: `${pre}_sh`, chain: 'spine', tag: 'torso' });
    // pectoralis: from the keel to the deltopectoral crest of the humerus (the downstroke muscle)
    const pk = add(sub(chest.c, scale(chest.up, chest.hh * 0.5)), [sd * chest.hw * 0.22, 0, 0]);
    const crest = add(add(S, scale(along0, hl * 0.28)), add(scale(lead0, rA[0] * 0.35), scale(dors0, -rA[0] * 0.45)));
    const pa = norm(sub(crest, pk)), pl = len(sub(crest, pk));
    m.ell(lerp3(pk, crest, 0.38), [chest.hw * 0.3 * MU.pec, pl * 0.48, chest.hh * 0.36 * MU.pec], { ax: ortho([sd, 0, 0], pa), ay: pa, k: rA[0] * 0.7, bone: 'rib_thorax', chain: 'spine', tag: 'torso' });
    m.ell(lerp3(pk, crest, 0.78), [rA[0] * 0.75 * MU.pec, pl * 0.3, rA[0] * 0.8 * MU.pec], { ax: ortho([sd, 0, 0], pa), ay: pa, k: rA[0] * 0.6, bone: `${pre}_sh`, chain: 'spine', tag: 'torso' });
    // shoulder blade: a long plate from the joint up and back toward the spine, the upstroke
    // muscles over it (supracoracoideus / spinodeltoid as in bats)
    const scTop = add(section(dAtTorso(0.26)).top, [sd * chest.hw * 0.38, -chest.hh * 0.18, 0]);
    const sa = norm(sub(scTop, S)), sl = len(sub(scTop, S));
    m.ell(lerp3(S, scTop, 0.55), [rA[0] * 0.38, sl * 0.55, rA[0] * 0.85], { ax: ortho([sd, 0.3, 0], sa), ay: sa, k: rA[0] * 0.6, bone: 'thorax', chain: 'spine', tag: 'torso' });
    m.ell(add(lerp3(S, scTop, 0.3), scale(dors0, rA[0] * 0.2)), [rA[0] * 0.55 * ma, sl * 0.36, rA[0] * 0.75 * ma], { ax: ortho([sd, 0.3, 0], sa), ay: sa, k: rA[0] * 0.55, bone: `${pre}_sh`, chain: 'spine', tag: 'torso' });
    // the axillary web (rev. 2): skin and muscle filling the armpit between the back of the upper
    // arm and the chest wall (latissimus / the root of the plagiopatagium in bats). Without it the
    // armpit closed into a deep, dark pocket whenever the arm swung back against the body, and
    // read as a wound on Starlight's white hide.
    {
      const H1 = add(S, scale(along0, hl * 0.42));
      const cw = section(dAtTorso(sSh + 0.13));
      const Cw = add(cw.c, add(scale(cw.side, sd * cw.hw * 0.8), scale(cw.up, cw.hh * 0.05)));
      const wa = norm(sub(Cw, H1)), wl = len(sub(Cw, H1));
      const mid = add(lerp3(H1, Cw, 0.45), scale(trailOf(w.qH), rA[0] * 0.15));
      m.ell(mid, [rA[0] * 0.62, wl * 0.62, hl * 0.32], { ax: ortho(norm(cross(wa, along0)), wa), ay: wa, k: rA[0] * 0.8, bone: `${pre}_sh`, chain: 'spine', tag: 'torso' });
    }
    // ---- the arm itself (comes away with the scout's torn wing)
    target.cone(S, E, rA[0] * 0.78, rA[1] * 0.82, { k: rA[0] * 0.5, ...wt(`${pre}_0`) });
    // triceps on the trailing-dorsal side, biceps on the leading-ventral side, the
    // deltopectoral crest under the front of the upper humerus
    const trail0 = scale(lead0, -1);
    target.ell(add(lerp3(S, E, 0.5), add(scale(trail0, rA[0] * 0.42), scale(dors0, rA[0] * 0.18))), [rA[0] * 0.66 * ma, hl * 0.44, rA[0] * 0.72 * ma], { ax: ortho(dors0, along0), ay: along0, k: rA[0] * 0.5, ...wt(`${pre}_0`) });
    target.ell(add(lerp3(S, E, 0.45), add(scale(lead0, rA[0] * 0.38), scale(dors0, -rA[0] * 0.22))), [rA[0] * 0.55 * ma, hl * 0.38, rA[0] * 0.55 * ma], { ax: ortho(dors0, along0), ay: along0, k: rA[0] * 0.45, ...wt(`${pre}_0`) });
    target.ell(add(lerp3(S, E, 0.26), add(scale(lead0, rA[0] * 0.35), scale(dors0, -rA[0] * 0.3))), [rA[0] * 0.5, hl * 0.22, rA[0] * 0.48], { ax: ortho(dors0, along0), ay: along0, k: rA[0] * 0.4, ...wt(`${pre}_0`) });
    // the elbow: the bony olecranon behind the joint, the joint knob
    const trail1 = scale(lead1, -1);
    target.ell(add(E, add(scale(trail1, rA[1] * 0.55), scale(along0, rA[1] * 0.35))), [rA[1] * 0.55, rA[1] * 0.75, rA[1] * 0.55], { ax: ortho(dors1, along0), ay: along0, k: rA[1] * 0.35, ...wt(`${pre}_1`) });
    target.ell(E, [rA[1] * 1.0, rA[1] * 0.95, rA[1] * 1.0], { ax: ortho(dors1, along1), ay: along1, k: rA[1] * 0.4, ...wt(`${pre}_1`) });
    // forearm: a weight-bearing limb - thick at the elbow (extensors leading-dorsal, flexors
    // trailing-ventral), tendons at the wrist
    target.cone(E, Wr, rA[1] * 0.8, rA[2] * 0.84, { k: rA[1] * 0.45, ...wt(`${pre}_1`) });
    target.ell(add(lerp3(E, Wr, 0.27), add(scale(lead1, rA[1] * 0.3), scale(dors1, rA[1] * 0.25))), [rA[1] * 0.78 * ma, fl * 0.29, rA[1] * 0.82 * ma], { ax: ortho(dors1, along1), ay: along1, k: rA[1] * 0.45, ...wt(`${pre}_1`) });
    target.ell(add(lerp3(E, Wr, 0.25), add(scale(trail1, rA[1] * 0.38), scale(dors1, -rA[1] * 0.2))), [rA[1] * 0.72 * ma, fl * 0.27, rA[1] * 0.7 * ma], { ax: ortho(dors1, along1), ay: along1, k: rA[1] * 0.45, ...wt(`${pre}_1`) });
    target.cone(add(lerp3(E, Wr, 0.45), scale(lead1, rA[1] * 0.22)), add(Wr, scale(lead1, rA[2] * 0.3)), rA[1] * 0.3, rA[2] * 0.28, { k: rA[2] * 0.4, ...wt(`${pre}_1`) });
    // the wrist: the carpal knob, the pisiform behind it, and the WRIST PAD - a thick cracked
    // callus at the end of the folded wrist (the "foot" of the wing-walk, camel knee / vampire
    // bat thumb pad)
    target.ell(sub(Wr, scale(along1, rA[2] * 0.1)), [rA[2] * 1.06, rA[2] * 1.22, rA[2] * 1.1], { ax: ortho(dors1, along1), ay: along1, k: rA[2] * 0.5, ...wt(`${pre}_1`) });
    target.ell(add(Wr, scale(trail1, rA[2] * 0.6)), [rA[2] * 0.6, rA[2] * 0.75, rA[2] * 0.55], { ax: ortho(dors1, along1), ay: along1, k: rA[2] * 0.35, ...wt(`${pre}_1`) });
    // (a broad flattened sole: the column of the forearm spreads into it, like an elephant's foot)
    const padC = add(Wr, scale(along1, rA[2] * 0.55));
    target.ell(padC, [rA[2] * 1.3, rA[2] * 0.5, rA[2] * 1.22], { ax: ortho(dors1, along1), ay: along1, k: rA[2] * 0.5, bone: `${pre}_1`, chain: pre, tag: 'wpad' });
    // the thumb: a robust digit on the leading edge of the wrist, a big blunt weight-bearing claw
    const th = WG.thumb;
    const thR = rA[2] * 0.42;
    const tbase = add(Wr, add(scale(lead1, rA[2] * 0.7), scale(along1, rA[2] * 0.25)));
    const tdir = norm(add(add(scale(lead1, 0.72), scale(along1, 0.55)), scale(dors1, -0.25)));
    const t1 = add(tbase, scale(tdir, K(th.mc)));
    const tdir2 = norm(add(tdir, scale(dors1, -0.35)));
    const t2 = add(t1, scale(tdir2, K(th.ph)));
    target.cone(tbase, t1, thR, thR * 0.82, { k: thR * 0.6, bone: `${pre}_th`, chain: pre, tag: 'warm' });
    target.cone(t1, t2, thR * 0.82, thR * 0.66, { k: thR * 0.5, bone: `${pre}_th`, chain: pre, tag: 'warm' });
    target.ell(t1, [thR * 0.95, thR * 0.9, thR * 0.95], { k: thR * 0.4, bone: `${pre}_th`, chain: pre, tag: 'warm' });
    chains[pre] = { points: [S, E, Wr], refUp: lead0, kind: 'limb' };
    // thumb claw (keratin, sculpt space)
    const cdir = norm(add(tdir2, scale(dors1, -0.8)));
    const cl = K(th.claw);
    keratin.push({ kind: 'claw', bone: `${pre}_th`, tag: 'claw', side,
      points: [add(t2, scale(tdir2, -thR * 0.4)), add(t2, scale(norm(add(tdir2, scale(dors1, 0.25))), cl * 0.5)), add(t2, scale(cdir, cl))],
      radii: [thR * 0.85, thR * 0.55, thR * (D.newborn ? 0.25 : 0.16)], flat: 0.75, up: dors1 });
    // bones of the wrist pad and the thumb (children of the forearm; rest positions from sculpt)
    const qFi = qInv(w.qF);
    const toRestF = (p) => add(w.Wr, qRot(qFi, sub(p, Wr)));
    const padContact = add(Wr, scale(along1, rA[2] * 1.03));
    bone(`${pre}_pad`, `${pre}_1`, toRestF(padContact));
    bone(`${pre}_th`, `${pre}_1`, toRestF(tbase));
    sculptPosOfBone[`${pre}_pad`] = padContact; sculptWorld[`${pre}_pad`] = w.qF;
    sculptPosOfBone[`${pre}_th`] = tbase; sculptWorld[`${pre}_th`] = w.qF;
    contacts.push({ bone: `${pre}_pad`, p: padContact, r: rA[2] * 0.08, wrist: true });
    w.thumbRest = { base: toRestF(tbase), tip: toRestF(t2) };
    contacts.push({ bone: `${pre}_th`, p: t2, r: thR * 0.6, thumb: true });

    // ---- fingers (REST space: bound with the rest skeleton, like the membrane)
    const lat = [sd, 0, 0];
    const fingers = [];
    const nF = WG.fingers.length;
    WG.fingers.forEach((fd, di) => {
      const [fname, mc, ph, spread] = fd;
      const a = spread * deg;
      let dir = [sd * Math.cos(a), 0, Math.sin(a)];
      const pts = [w.Wr];
      let p = add(w.Wr, scale(dir, K(mc)));
      pts.push(p);
      ph.forEach((pl, j) => {
        // the phalanges curve back toward the trailing edge (bats), the outer ones more
        const b = a + sumBend(j, di);
        dir = [sd * Math.cos(b), 0, Math.sin(b)];
        p = add(p, scale(dir, K(pl)));
        pts.push(p);
      });
      const names = pts.slice(0, -1).map((_, j) => `${pre}_f${di}_${j}`);
      names.forEach((n, j) => bone(n, j === 0 ? `${pre}_2` : names[j - 1], pts[j]));
      // radii: robust metacarpals, tapering phalanges (the leading finger thickest)
      const rr0 = rA[3] * (1 - di * 0.1);
      const radii = pts.map((_, j) => rr0 * (j === 0 ? 1.0 : j === 1 ? 0.62 : Math.max(0.12, 0.62 * Math.pow(0.62, j - 1))));
      radii[radii.length - 1] = rr0 * 0.1;
      fingers.push({ name: fname, names, points: pts, radii, tipBone: names[names.length - 1] });
    });
    // membrane attachment line (REST space): from behind the armpit along the lower flank to the
    // hip, then down the outside of the trailing leg to `to` (DESIGN 1.4); one bone per segment
    const gap = rA[0] * 1.15 + T * 0.035;
    const flankPt = (s, frac) => {
      const sc = section(dAtTorso(s));
      const dy = -sc.hh * frac;
      const x = sc.hw * Math.sqrt(Math.max(0, 1 - frac * frac)) * 0.98;
      return [sd * x, sc.c[1] + dy, sc.c[2]];
    };
    const sGap = sSh + gap / T;
    const A0 = flankPt(sGap, 0.18), A1 = flankPt(Math.min(0.55, sHip - 0.12), 0.32), A2r = legRest[side];
    const thR2 = dl[0] * 0.4;
    const outL = (p, r) => add(p, [sd * r, r * 0.3, 0]);
    const hipA = outL(lerp3(A2r.hip, A2r.knee, 0.18), thR2);
    const kneeA = outL(A2r.knee, dl[1] * 0.45);
    const ankA = outL(A2r.ankle, dl[3] * 0.5);
    const shankA = lerp3(kneeA, ankA, 0.45);
    let attach, attachBones;
    if (WG.to === 'hip') { attach = [A0, A1, hipA]; attachBones = ['rib_thorax', 'rib_lumbar']; }
    else if (WG.to === 'knee') { attach = [A0, A1, hipA, kneeA]; attachBones = ['rib_thorax', 'rib_lumbar', `hl_${side}_0`]; }
    else if (WG.to === 'shank') { attach = [A0, A1, hipA, kneeA, shankA]; attachBones = ['rib_thorax', 'rib_lumbar', `hl_${side}_0`, `hl_${side}_1`]; }
    else { attach = [A0, A1, hipA, kneeA, ankA]; attachBones = ['rib_thorax', 'rib_lumbar', `hl_${side}_0`, `hl_${side}_1`]; }
    // a detachable wing (the scout's LEFT): the membrane's body edge rides on its own small bones,
    // children of the body bones while attached; creature.detachWing() moves them onto the torn wing
    let memRoots = null;
    if (detachable) {
      memRoots = attachBones.map((b, i) => {
        const n = `${pre}_m${i}`;
        bone(n, b, attach[i]);
        return { name: n, parent: b };
      });
      attachBones = memRoots.map((r) => r.name);
    }
    // the propatagium's root: the side of the neck base, in front of and above the shoulder
    const nb = section(dAtNeck(0.88));
    const proRoot = add(nb.c, add(scale(nb.side, sd * nb.hw * 0.75), scale(nb.up, nb.hh * 0.15)));
    let proBone = null;
    if (detachable) {
      // (the propatagium's root too: left on the thorax it stretched a band from the neck to the torn wing)
      proBone = `${pre}_mp`;
      bone(proBone, 'thorax', proRoot);
      memRoots.push({ name: proBone, parent: 'thorax' });
    }
    wings.push({ side, sd, prefix: pre, root: S, proRoot, elbow: w.Er, wrist: w.Wr, fingers, attach, attachBones, nF, thumbRest: w.thumbRest, padDist: rA[2] * 1.03,
      thumbSculpt: { dir: tdir, up: dors1, q: w.qF, base: tbase, tipOff: sub(t2, tbase), tipR: thR * 0.6 },
      thumb: w.Wr, billow: L * 0.03, detachedSDF: detachable ? target : null, thickness: K(WG.thick ?? 0.005), memRoots, proBone });
  }

  // ------------------------------------------- tail crest and the scout's vane
  // keeled osteoderm scutes: a double row at the tail base that merges into a single row (crocodile)
  {
    const ch = K(D.crest?.tail ?? 0);
    if (ch > 0) {
      const n = Math.round(46 + 30 * Math.min(1, TL / 20));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;                              // 0 tail base .. 1 tip
        const d = dAtTail(f * 0.92);
        const sc = section(d);
        const hgt = ch * Math.pow(1 - f, 0.8) * (0.85 + 0.3 * hsh(i, 7)) * (f < 0.06 ? f / 0.06 : 1);
        if (hgt < L * 0.0008) continue;
        const spacing = dTail * 0.92 / n;
        const dbl = f < 0.38;
        const off = dbl ? sc.hw * 0.42 * (1 - f / 0.45) : 0;
        for (const sd of dbl ? [1, -1] : [0]) {
          const base = add(sc.top, add(scale(sc.side, sd * off), scale(sc.up, -hgt * 0.35)));
          const tip = add(base, add(scale(sc.up, hgt * 1.25), scale(sc.tan, -spacing * 0.2)));
          m.ell(lerp3(base, tip, 0.45), [hgt * 0.22 + L * 0.0004, hgt * 0.62, spacing * 0.62], { ax: sc.side, ay: norm(sub(tip, base)), k: hgt * 0.3, bone: boneAtD(d), chain: 'spine', tag: 'crest' });
        }
      }
    }
    if (D.tailVane) {
      // Rhamphorhynchus: a keratin-stiffened diamond of skin at the tail tip, vertical (a rudder)
      const vl = K(D.tailVane.length), vw = K(D.tailVane.width);
      const dTip = dAtTail(0.94);
      const sc = section(dTip);
      // a vertical diamond: two flat cones front -> widest -> rear point
      // (fix round 1: smaller and thicker - the broad thin vane read as a cardboard paddle)
      const th = L * (D.tailVane.thick ?? 0.0017);
      const A = add(sc.c, scale(sc.tan, vl * 0.42)), M = add(sc.c, scale(sc.tan, -vl * 0.05)), B = add(sc.c, scale(sc.tan, -vl * 0.58));
      const rM = vw * 0.5;
      m.quiet.push(...M, vl * 0.75);
      m.cone(A, M, th * 1.2, rM, { sx: th / rM, sy: 1, up: sc.up, k: th * 1.5, bone: boneAtD(dTip), chain: 'spine', tag: 'vane' });
      m.cone(M, B, rM, th, { sx: th / rM, sy: 1, up: sc.up, k: th * 1.5, bone: boneAtD(dAtTail(0.985)), chain: 'spine', tag: 'vane' });
    }
  }

  // ------------------------------------------------- skin folds (projected)
  {
    const F = D.folds || {};
    const soft = !!F.soft;
    m.compile();
    const proj = (p) => {
      let q = [...p];
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
    const fold = (path, g, lipDir, o = {}) => {
      const P = path.map(proj);
      folds.push({ P, g, lipDir, bone: o.bone, chain: o.chain ?? 'spine', tag: o.tag ?? 'torso', depth: o.depth ?? 0.45, lip: o.lip ?? 0.7 });
    };
    // throat (gular) folds: transverse arcs under the neck behind the jaw
    for (let i = 0; i < (F.throat ?? 0); i++) {
      const s = (soft ? 0.12 : 0.05) + i * (soft ? 0.2 : 0.1);
      const sc = section(dAtNeck(s));
      const path = [];
      for (let q = 0; q <= 8; q++) {
        const a = mix(-0.92, -0.08, q / 8) * Math.PI + (hsh(i, q) - 0.5) * 0.08;
        path.push(add(sc.c, add(scale(sc.side, Math.cos(a) * sc.hw * 1.05), scale(sc.up, Math.sin(a) * sc.hh * 1.05))));
      }
      fold(path, Math.min(sc.hw, sc.hh) * 0.15, scale(sc.tan, 1), { bone: boneAtD(dAtNeck(s)), tag: 'neck', depth: 0.2, lip: 0.45 });
    }
    // neck-base folds, lower sides only
    for (let i = 0; i < (F.neck ?? 0); i++) {
      const s = 0.8 + i * 0.07;
      const sc = section(dAtNeck(s));
      for (const sd of [1, -1]) {
        const path = [];
        for (let q = 0; q <= 6; q++) {
          const a = mix(-0.55, 0.25, q / 6) * Math.PI * 0.5;
          path.push(add(sc.c, add(scale(sc.side, sd * Math.cos(a) * sc.hw * 1.05), scale(sc.up, Math.sin(a) * sc.hh * 1.05))));
        }
        fold(path, Math.min(sc.hw, sc.hh) * 0.13, scale(sc.tan, 1), { bone: boneAtD(dAtNeck(s)), tag: 'neck', depth: 0.18, lip: 0.4 });
      }
    }
    for (const lg of legs) {
      const sd = lg.sd;
      // armpit fold behind the shoulder (the skin between the humerus and the chest wall)
      if (F.axilla && F.axillaOK) {
        const w = wingData.find((x) => x.sd === sd);
        const sc = section(dAtTorso(sSh + 0.12));
        const a0 = add(w.S, [sd * rA[0] * 0.5, -rA[0] * 0.75, -rA[0] * 0.9]);
        const a2 = add(sc.c, add(scale(sc.side, sd * sc.hw * 0.9), scale(sc.up, -sc.hh * 0.35)));
        fold([a0, lerp3(a0, a2, 0.5), a2], rA[0] * 0.14, [0, 0, -1], { bone: 'rib_thorax' });
      }
      // flank (stifle) fold: from the front of the knee up and forward onto the belly
      if (F.stifle) {
        const sc = section(dAtTorso(sHip - 0.1));
        const b0 = add(lg.sculpt.knee, [0, rLeg[1] * 0.8, rLeg[1] * 0.9]);
        const b2 = add(sc.c, add(scale(sc.side, sd * sc.hw * 0.82), scale(sc.up, -sc.hh * 0.55)));
        fold([b0, lerp3(b0, b2, 0.5), b2], rLeg[1] * 0.2, [0, 0, 1], { bone: 'rib_lumbar' });
      }
    }
    for (let i = 0; i < (F.tail ?? 0); i++) {
      const s = 0.05 + i * 0.035;
      const sc = section(dAtTail(s));
      const path = [];
      for (let q = 0; q <= 6; q++) {
        const a = mix(0.12, 0.88, q / 6) * Math.PI;
        path.push(add(sc.c, add(scale(sc.side, Math.cos(a) * sc.hw * 1.05), scale(sc.up, Math.sin(a) * sc.hh * 1.05))));
      }
      fold(path, Math.min(sc.hw, sc.hh) * 0.06, scale(sc.tan, -1), { bone: boneAtD(dAtTail(s)), tag: 'tail' });
    }
    for (const f of folds) for (let i = 0; i < f.P.length - 1; i++) {
      const a = f.P[i], b = f.P[i + 1];
      const taper = (j) => Math.sin(Math.PI * (j / (f.P.length - 1)) * 0.92 + 0.12);
      const ga = f.g * taper(i), gb = f.g * taper(i + 1);
      const ca = sub(a.p, scale(a.n, -ga * (1 - f.depth))), cb = sub(b.p, scale(b.n, -gb * (1 - f.depth)));
      m.cone(ca, cb, ga, gb, { k: f.g * 0.8, op: 'sub', bone: f.bone, chain: f.chain, tag: f.tag });
    }
    for (const f of folds) {
      const ld = norm(f.lipDir);
      for (let i = 0; i < f.P.length - 1; i++) {
        const a = f.P[i], b = f.P[i + 1];
        const taper = (j) => Math.sin(Math.PI * (j / (f.P.length - 1)) * 0.92 + 0.12);
        const ga = f.g * taper(i) * f.lip, gb = f.g * taper(i + 1) * f.lip;
        const off = (q, gg) => add(sub(q.p, scale(q.n, gg * 0.55)), scale(ld, gg * 1.9));
        m.cone(off(a, ga / f.lip), off(b, gb / f.lip), ga, gb, { k: f.g * 0.9, bone: f.bone, chain: f.chain, tag: f.tag });
      }
    }
  }

  // ------------------------------------------------------------- head
  const headShape = makeHeadShape(D, H);
  const head = buildHead(m, { headShape, horns: D.horns, lid: D.lid, newborn: !!D.newborn }, H, neckPitch, -neckPitch, headJoint, bone, keratin, eyes, chains, sockets, D);

  // body contacts in REST-relative offsets (pose.js groundRig): offset in the bone's own frame
  const restContacts = contacts.map((c) => {
    const P = sculptPosOfBone[c.bone] || bonePos[c.bone], q = sculptWorld[c.bone] || QI();
    return { bone: c.bone, off: qRot(qInv(q), sub(c.p, P)), r: c.r, wrist: !!c.wrist, thumb: !!c.thumb };
  });

  // compatibility fields for the rest of the library (materials, tack, older scenes)
  const specOut = {
    ...D, design: D.name, scale: D.scale, lid: D.lid, headShape,
    hipY: hipH / L, withersY: topSh / L, tailDroop: st.tailDroop * deg,
  };
  const tailR = (s) => { const [W, Dp] = prL(s); return Math.sqrt(W * Dp) * 0.5; };
  return {
    L, spec: specOut, design: D, bones, bonePos, sculptLocal, sculptWorld, sculptPos: sculptPosOfBone, sdf: m, chains, keratin, eyes, wings, legs, sockets, head, helpers,
    contacts: restContacts, tailR,
    dims: { hipH: hipJY, hipZ: hipJZ, sHip, hipH0: hipH, shH, topSh, topHip, T, N, H, TL, hum, fore, fem, tib, mtl, toeL, rA, rLeg, wristR: rA[2], shoulderX: shX, hipX, footX, neckPitch,
      trunkAt: (s) => { const sc = section(dAtTorso(s)); return { c: sc.c, hw: sc.hw, hh: sc.hh, top: sc.top }; } },
    spineInfo: { total: spine.total, dTail, dWithers },
  };
}

function trailOf(q) { return qRot(q, [0, 0, -1]); }
function smooth01(x) { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); }
// cumulative extra sweep of phalanx j of finger di (radians, toward the trailing edge)
function sumBend(j, di) {
  let s = 0;
  for (let q = 0; q <= j; q++) s -= (3 + 3 * q) * deg * (di === 0 ? 0.6 : 1);
  return s;
}

// ------------------------------------------------------------ head shape
/**
 * Loft keys for buildHead from the design's head table ([s, width, depth] metres; s 0 = back of
 * the skull .. 1 = snout tip): `upper` [z, halfWidth, top, bottom] and `jaw` [z, hw, top, bottom]
 * in head lengths (z 0 = the skull joint, 1 = the snout tip), the lip line between them.
 */
function makeHeadShape(D, H) {
  const X = D.headX || {};
  const zS = (s) => -0.08 + 1.08 * s;
  const sZ = (z) => clamp((z + 0.08) / 1.08, 0, 1);
  const lipY = (z) => -0.09 + 0.022 * z;
  const tab = (z) => profileAt(D.head, sZ(z)).map((v) => v / H);
  const zs = [-0.1, -0.02, 0.06, 0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88, 0.95, 1.0];
  const upper = [], jaw = [];
  for (const z of zs) {
    const [W, Dp] = tab(z);
    const s = sZ(z);
    const fu = mix(X.young || X.soft ? 0.6 : 0.56, 0.6, s);
    const occ = z < -0.05 ? 0.86 : 1;
    upper.push([z, W * 0.5 * occ, lipY(z) + fu * Dp * occ, lipY(z)]);
  }
  for (const z of [0.0, 0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 0.98]) {
    const [W, Dp] = tab(z);
    const s = sZ(z);
    const fu = mix(X.young || X.soft ? 0.6 : 0.56, 0.6, s);
    // the mandible: deep at the back (jaw muscles), a knobby chin on Charcoal
    const chin = (X.chin ?? 0) * 0.02 * Math.exp(-Math.pow((z - 0.9) / 0.07, 2));
    // (a newborn's lower jaw sits inside the upper one - an overbite, no protruding rim)
    jaw.push([z, W * (X.soft ? 0.4 : 0.485), lipY(z) + 0.01, lipY(z) - (1 - fu) * Dp * (X.soft ? 0.72 : 1) - chin]);
  }
  const eyeD = D.eye / D.skull;                    // eyeball diameter / skull length
  const eyeS = 1 - D.snout - eyeD * 0.5;
  const ez = zS(eyeS);
  const [We, De] = tab(ez);
  const fuE = 0.58;
  const eye = [We * 0.5 * 0.86, lipY(ez) + fuE * De * 0.74, ez];
  // the jaw hinge (quadrate) below the back corner of the eye: the gape runs back to it
  const hinge = [0, lipY(ez - 0.2) - 0.005, Math.max(0.02, ez - eyeD * 0.5 - 0.12)];
  const nT = D.teeth[0] | 0;
  return {
    upper, jaw, eye, eyeR: eyeD * 0.5, eyeInset: X.soft ? 0.5 : 0.52, eyeExpose: X.soft ? 46 : X.young ? 60 : 62,
    brow: X.brow ?? 1, cheek: X.cheek ?? 1, jawMuscle: X.jawMuscle ?? 1, ridgeR: X.ridgeR ?? 0.022, hinge, gape0: (X.soft ? 6 : 13) * deg,
    nostril: X.nostril ?? 1, teethUp: nT, teethSize: nT ? (D.toothMax / D.skull) * 0.5 : 0, lipCover: X.lipCover ?? 0.5, lipIrregular: X.lipIrregular ?? 0,
    tympanum: X.tympanum ?? 1, eggTooth: !!X.eggTooth, soft: !!X.soft, gazeForward: D.gazeForward ?? (X.young ? 0.28 : 0.2),
    jawEnd: X.soft ? 0.82 : 0.95, orbit: X.soft ? 1.45 : 1.36, young: !!X.young, long: !!X.long,
  };
}

// ---------------------------------------------------------------- head
// The head is lofted from cross-sections (side + top silhouettes from the design's head
// table), then sculpted: brow shelf over the lateral eye, canthus ridges, cheek bones, big jaw
// muscles behind the eye, the gape running back below the eye to the quadrate hinge, labial
// scales over the teeth, nostrils on a raised boss near the tip, a tympanum behind the hinge.
// The lower jaw is built closed and rotated open by gape0, so the rest mesh has a real mouth.
function buildHead(m, spec, Hm, neckPitch, headPitch, hj, bone, keratin, eyes, chains, sockets, D) {
  const H = Hm;
  const hs = spec.headShape;
  const pitch = neckPitch + headPitch;
  const ez = [0, Math.sin(pitch), Math.cos(pitch)], ey = [0, Math.cos(pitch), -Math.sin(pitch)], ex = [1, 0, 0];
  const W = (x, y, z) => [hj[0] + (x * ex[0] + y * ey[0] + z * ez[0]) * H, hj[1] + (x * ex[1] + y * ey[1] + z * ez[1]) * H, hj[2] + (x * ex[2] + y * ey[2] + z * ez[2]) * H];
  const Wd = (x, y, z) => norm([x * ex[0] + y * ey[0] + z * ez[0], x * ex[1] + y * ey[1] + z * ez[1], x * ex[2] + y * ey[2] + z * ez[2]]);
  const U = (z) => profileAt(hs.upper, z);
  const J = (z) => profileAt(hs.jaw, z);
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

  // ---- upper loft (cranium + snout)
  const zs = [];
  for (let z = -0.1; z < 0.999; z += 0.05) zs.push(z);
  const lastZ = 1 - 0.55 * Math.sqrt(U(1)[0] * (U(1)[1] - U(1)[2]) / 2);
  zs.push(lastZ);
  const secU = (z) => { const [hw, top, bot] = U(z); const b2 = bot - 0.035; return { hw, hh: (top - b2) / 2, cy: (top + b2) / 2 }; };
  const gU = m.group();
  for (let i = 0; i < zs.length - 1; i++) sectionCone(zs[i], zs[i + 1], secU(zs[i]), secU(zs[i + 1]), 0.05, t, W, ey, gU);
  // eye placement (the eyeball sits so the head surface meets it at `eyeExpose` degrees from the gaze)
  const nrmL = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  let gL = nrmL([0.9, 0.04, 0.42]);
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
      const p = [0, 1, 2].map((q) => eye0[q] + gL[q] * surf), e = hs.eyeR * 0.05, f0 = sdfL(p);
      const n = nrmL([sdfL([p[0] + e, p[1], p[2]]) - f0, sdfL([p[0], p[1] + e, p[2]]) - f0, sdfL([p[0], p[1], p[2] + e]) - f0]);
      const fw = hs.gazeForward ?? 0.2;
      gL = nrmL([Math.max(n[0], 0.6), n[1] * 0.6, n[2] + fw]);
      surf = surfAlong(gL);
    }
    if (surf !== null) {
      const shift = surf - hs.eyeR * Math.cos((hs.eyeExpose ?? 50) * deg);
      for (let q = 0; q < 3; q++) eyeP[q] = eye0[q] + gL[q] * shift;
    }
  }
  const gW = (sd) => Wd(sd * gL[0], gL[1], gL[2]);
  for (const sd of [1, -1]) m.quiet.push(...W(sd * eyeP[0], eyeP[1], eyeP[2]), hs.eyeR * H * 1.5);
  const lipW = (z) => { const s2 = secU(z); const q = (U(z)[2] - s2.cy) / s2.hh; return s2.hw * Math.sqrt(Math.max(0, 1 - q * q)); };
  const ridgeU = (sd, z) => [sd * 0.86 * lipW(z), U(z)[2], z];
  const eye = eyeP;
  const ER = hs.eyeR;
  const ezE = eye[2];
  for (const sd of [1, -1]) {
    // flat skull table between the eyes and the horn bases (a reptile's cranial platform)
    m.ell(W(sd * U(0.12)[0] * 0.3, U(0.12)[1] - 0.03, Math.min(0.12, ezE - 0.1)), [U(0.12)[0] * 0.32 * H, 0.035 * H, 0.16 * H], { ax: ex, ay: ey, k: 0.04 * H, ...t });
    // brow ridge: a bony shelf overhanging the eye
    m.ell(W(sd * (eye[0] - 0.02 + ER * 0.3), eye[1] + ER * 0.95, eye[2] - 0.01), [0.042 * H * Math.sqrt(hs.brow), 0.022 * H * hs.brow, 0.14 * H], { ax: Wd(1, 0.3 * sd, 0.1 * sd), ay: Wd(-0.3 * sd, 1, 0.05), k: 0.013 * H, ...t });
    // canthus: bony ridge from the brow toward the nostril
    m.cone(W(sd * (eye[0] - 0.03), eye[1] + ER * 0.85, eye[2] + 0.06), W(sd * U(0.86)[0] * 0.5, U(0.86)[1] - 0.012, 0.86), 0.02 * H * Math.min(1.6, hs.brow), 0.01 * H, { k: 0.025 * H, ...t });
    // horn boss on the back corner of the skull
    m.ell(W(sd * U(0.0)[0] * 0.55, U(0.0)[1] - 0.04, 0.02), [0.04 * H * Math.sqrt(hs.brow), 0.03 * H, 0.08 * H], { ax: ex, ay: ey, k: 0.03 * H, ...t });
    // temporal jaw muscles: the widest part of the head, behind and below the eye
    m.ell(W(sd * U(0.1)[0] * 0.62 * hs.jawMuscle ** 0.3, -0.035, Math.max(0.06, ezE - 0.22)), [0.075 * H * hs.jawMuscle, 0.1 * H, 0.13 * H], { ax: ex, ay: ey, k: 0.05 * H, ...t });
    // cheek bone (jugal) under the eye toward the jaw joint
    m.cone(W(sd * (eye[0] + 0.004), eye[1] - ER * 1.3, eye[2] + 0.08), W(sd * (U(hinge[2])[0] * 0.78 + 0.01 * hs.cheek), hinge[1] + 0.03, hinge[2] + 0.02), 0.02 * H * hs.cheek, 0.03 * H * hs.cheek, { k: 0.014 * H, ...t });
    // nostril boss on top of the snout tip
    const zN = 0.91;
    m.ell(W(sd * U(zN)[0] * 0.42, U(zN)[1] - 0.018, zN), [0.03 * H * hs.nostril, 0.019 * H * hs.nostril, 0.046 * H * hs.nostril], { ax: ex, ay: ey, k: 0.03 * H, ...t });
    // upper lip: a fleshy labial ridge along the tooth row
    const lc = hs.lipCover ?? 0.5;
    if (lc > 0) {
      const irr = hs.lipIrregular ?? 0;
      const z0 = hinge[2] + 0.06;
      const zl = (irr ? [0, 0.12, 0.25, 0.37, 0.5, 0.62, 0.75, 0.88, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => mix(z0, 0.92, f));
      for (let i = 0; i < zl.length - 1; i++) {
        const a = ridgeU(sd, zl[i]), b = ridgeU(sd, zl[i + 1]);
        const ya = irr * (hsh(i, sd > 0 ? 31 : 37) - 0.5) * 0.02, yb = irr * (hsh(i + 1, sd > 0 ? 31 : 37) - 0.5) * 0.02;
        const ra = 1 + irr * (hsh(i, sd > 0 ? 41 : 43) - 0.5) * 0.7, rb = 1 + irr * (hsh(i + 1, sd > 0 ? 41 : 43) - 0.5) * 0.7;
        m.cone(W(a[0] * 1.06, a[1] + 0.012 + ya, a[2]), W(b[0] * 1.06, b[1] + 0.012 + yb, b[2]), 0.02 * H * lc * ra, 0.017 * H * lc * rb, { k: 0.02 * H, ...t });
      }
    }
  }
  // a newborn's puffy cheeks: above the lip line (they belong to the skull, not the jaw)
  // (rev. 2: no puffy cheeks above the lip line - with the jaw below they made a clamshell "duck bill")

  // ---- lower jaw (closed config, rotated open by gape0)
  const jt = { chain: 'jaw', bone: 'jaw', tag: 'jaw' };
  const secJ = (z) => { const [hw, top, bot] = J(z); const t2 = top + 0.03; return { hw: hw * 0.97, hh: (t2 - bot) / 2, cy: (t2 + bot) / 2 }; };
  const zj = [];
  const jEnd = hs.jawEnd ?? 0.95;
  for (let z = 0.0; z < jEnd; z += 0.065) zj.push(z);
  zj.push(Math.min(1 - 0.5 * Math.sqrt(J(0.98)[0] * (J(0.98)[1] - J(0.98)[2]) / 2), jEnd + 0.03));
  const gJ = m.group();
  for (let i = 0; i < zj.length - 1; i++) sectionCone(zj[i], zj[i + 1], secJ(zj[i]), secJ(zj[i + 1]), 0.03, jt, jawPt, jawDir(0, 1, 0), gJ);
  for (const sd of [1, -1]) {
    const [hw0, , b0] = J(0.06);
    // jaw angle (retroarticular process) and the masseter bulge over it
    // (a newborn's is a soft nub: no hanging lobe behind the jaw)
    // (and not on the young Leaf: on his slim jaw it hung below the jaw angle as a lobe and a bolt)
    if (!soft && !hs.young) m.cone(jawPt(sd * hw0 * 0.8, b0 + 0.06, hinge[2] + 0.08), jawPt(sd * hw0 * 0.82, hinge[1] - 0.075, hinge[2] - 0.1), 0.048 * H, 0.03 * H, { k: 0.03 * H, ...jt });
    // the masseter bulge over the jaw angle (a newborn has no muscle definition: on its soft, slim
    // jaw the bulge stood below the jaw as a hanging lobe) and the labial scale ridge
    if (!soft && !hs.young) m.ell(jawPt(sd * hw0 * 0.86, b0 + 0.1, hinge[2] + 0.14), [0.048 * H * hs.jawMuscle, 0.068 * H * Math.sqrt(hs.jawMuscle), 0.1 * H * Math.sqrt(hs.jawMuscle)], { ax: ex, ay: jawDir(0, 1, 0), k: 0.035 * H, ...jt });
    const lc = soft ? 0 : (hs.lipCover ?? 0.5);
    if (lc > 0) {
      const z0 = hinge[2] + 0.08;
      for (const [fa, fb] of [[0, 0.33], [0.33, 0.66], [0.66, 1]]) {
        const za = mix(z0, 0.88, fa), zb = mix(z0, 0.88, fb);
        const pa = [sd * 0.84 * J(za)[0] * 1.03, J(za)[1] - 0.012, za], pb = [sd * 0.84 * J(zb)[0] * 1.03, J(zb)[1] - 0.012, zb];
        m.cone(jawPt(...pa), jawPt(...pb), 0.016 * H * lc, 0.014 * H * lc, { k: 0.018 * H, ...jt });
      }
    }
  }
  const lipWJ = (z) => { const s2 = secJ(z); const q = (J(z)[1] - s2.cy) / s2.hh; return s2.hw * Math.sqrt(Math.max(0, 1 - q * q)); };
  const ridgeJ = (sd, z) => [sd * 0.84 * lipWJ(z), J(z)[1], z];
  // throat skin: jaw part follows the jaw, neck part follows the head
  const j0 = J(0.05);
  m.cone(jawPt(0, j0[2] + 0.05, 0.16), jawPt(0, j0[2] + 0.06, 0.0), 0.06 * H, 0.07 * H, { sx: 1.4, sy: 0.7, up: jawDir(0, 1, 0), k: 0.04 * H, chain: 'jaw', bone: 'jaw', tag: 'throat' });
  m.cone(W(0, j0[2] + 0.1, -0.04), W(0, U(-0.1)[2] - 0.03, -0.2), 0.075 * H, 0.105 * H, { sx: 1.3, sy: 0.78, up: ey, k: 0.05 * H, chain: 'spine', bone: 'head', tag: 'throat' });

  // ---- mouth: a wedge with its apex at the hinge cuts both jaws
  const midG = g * 0.5;
  {
    const axis = Wd(0, -Math.sin(midG), Math.cos(midG));
    const apex = W(0, hinge[1], hinge[2]);
    const s0 = 0.12, s1 = 1.35, sa = Math.sin(midG);
    m.cone(add(apex, scale(axis, s0 * H)), add(apex, scale(axis, s1 * H)), s0 * sa * H, s1 * sa * H, { sx: 12, sy: 1, up: Wd(0, Math.cos(midG), Math.sin(midG)), k: 0.02 * H, op: 'sub', chain: 'jaw', bone: 'jaw', tag: 'mouth' });
  }
  const cav = (x, y, z) => { const r = rotJ(y, z, midG); return W(x, r[0], r[1]); };
  const cavDir = (x, y, z) => { const c = Math.cos(midG), s = Math.sin(midG); return Wd(x, y * c - z * s, y * s + z * c); };
  const mouthY = hinge[1];
  const zMid = (hinge[2] + 1) * 0.5;
  m.ell(cav(0, mouthY, zMid), [0.5 * lipW(zMid) * H * (soft ? 0.7 : 1), 0.02 * H * (soft ? 0.5 : 1), (1 - hinge[2]) * 0.38 * H], { ax: ex, ay: cavDir(0, 1, 0), k: 0.03 * H, op: 'sub', chain: 'jaw', bone: 'jaw', tag: 'mouth' });
  m.ell(cav(0, mouthY - 0.005, hinge[2] + 0.12), [0.08 * H, 0.035 * H, 0.12 * H], { ax: ex, ay: cavDir(0, 1, 0), k: 0.03 * H, op: 'sub', chain: 'jaw', bone: 'jaw', tag: 'mouth' });
  // (fix round 1: a real tongue - broad, thick, lying in the floor of the mouth with a rounded
  // free tip; the thin rod left the mouth a flat slab)
  const tgK = soft ? 0.6 : 1;
  m.cone(jawPt(0, J(hinge[2] + 0.15)[1] - 0.05, hinge[2] + 0.08), jawPt(0, J(0.66)[1] - 0.04, 0.66), 0.075 * H * tgK, 0.05 * H * tgK, { sx: 1.55, sy: 0.42, up: jawDir(0, 1, 0), k: 0.02 * H, chain: 'jaw', bone: 'jaw', tag: 'tongue' });
  m.ell(jawPt(0, J(0.7)[1] - 0.042, 0.7), [0.07 * H * tgK, 0.02 * H * tgK, 0.06 * H * tgK], { ax: ex, ay: jawDir(0, 1, 0), k: 0.02 * H, chain: 'jaw', bone: 'jaw', tag: 'tongue' });
  for (const sd of [1, -1]) {
    const orb = hs.orbit ?? 1.36;
    m.ell(W(sd * (eyeP[0] - gL[0] * ER * 0.45), eyeP[1] - gL[1] * ER * 0.45, eyeP[2] - gL[2] * ER * 0.45), [ER * H * orb * 0.85, ER * H * orb, ER * H * orb * 1.15], { ax: gW(sd), ay: ey, k: 0.035 * H, ...t, tag: 'head' });
  }
  for (const sd of [1, -1]) {
    m.ell(W(sd * eyeP[0], eyeP[1], eyeP[2]), [ER * H * 1.045, ER * H * 1.045, ER * H * 1.06], { ax: gW(sd), ay: ey, k: 0.008 * H, op: 'sub', ...t, tag: 'eyesocket' });
    m.ell(W(sd * U(0.93)[0] * 0.45, U(0.93)[1] - 0.004, 0.93), [0.011 * H * hs.nostril, 0.0065 * H * hs.nostril, 0.034 * H * hs.nostril], { ax: Wd(1, 0.7, 0.15 * sd), ay: Wd(-0.7, 1, 0), k: 0.01 * H, op: 'sub', ...t, tag: 'nostril' });
    if (hs.tympanum) m.ell(W(sd * U(hinge[2] - 0.05)[0] * 0.92, 0.02, hinge[2] - 0.05), [0.02 * H, 0.045 * H * hs.tympanum, 0.032 * H * hs.tympanum], { ax: Wd(1, 0, -0.25 * sd), ay: ey, k: 0.015 * H, op: 'sub', ...t, tag: 'head' });
  }
  let gOpen = gL;
  {
    m.compile();
    const c0 = W(eyeP[0], eyeP[1], eyeP[2]);
    const acc = [0, 0, 0];
    let cnt = 0;
    for (let i = 0; i < 24; i++) for (let j = 0; j < 48; j++) {
      const th = (i + 0.5) / 24 * Math.PI * 0.6, ph = (j / 48) * Math.PI * 2;
      const t1 = nrmL([gL[1], -gL[0], 0]), t2 = [gL[1] * t1[2] - gL[2] * t1[1], gL[2] * t1[0] - gL[0] * t1[2], gL[0] * t1[1] - gL[1] * t1[0]];
      const dl = [0, 1, 2].map((q) => gL[q] * Math.cos(th) + (t1[q] * Math.cos(ph) + t2[q] * Math.sin(ph)) * Math.sin(th));
      const dw = Wd(dl[0], dl[1], dl[2]);
      const q = [0, 1, 2].map((qq) => c0[qq] + dw[qq] * ER * H * 1.08);
      if (m.evalList(q[0], q[1], q[2], m.all) > 0) { for (let qq = 0; qq < 3; qq++) acc[qq] += dl[qq] * Math.sin(th); cnt += Math.sin(th); }
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
    eyes.push({ side, sd, center: c, radius: ER * H, look: gO(sd), bone: `eye_${side}`, lidU: `lidU_${side}`, lidL: `lidL_${side}`, up: ey });
  }
  chains.jaw = { points: [W(0, hinge[1], hinge[2]), jawPt(0, J(0.9)[1] - 0.05, 0.98)], refUp: jawDir(0, 1, 0), kind: 'jaw' };
  chains.skull = { points: [W(0, 0.02, -0.15), W(0, 0.04, 0.35), W(0, U(1)[1] * 0.3, 1.0)], refUp: ey, kind: 'skull' };
  sockets.mouth = { bone: 'jaw', pos: cav(0, mouthY, 0.55) };
  sockets.mouthFront = { bone: 'head', pos: W(0, mouthY + 0.01, 0.97) };
  sockets.headFrame = { ex, ey, ez, origin: hj, H };

  // ---- teeth: varied, recurved, a few broken or missing, replacement teeth half grown
  const nT = hs.teethUp | 0;
  const gums = [];
  const zT0 = hinge[2] + 0.1;
  for (const sd of [1, -1]) {
    for (let i = 0; i < nT; i++) {
      const hv = (q) => hsh(i * 7 + (sd > 0 ? 1 : 2), q);
      const f = (i + 0.5 + (hv(10) - 0.5) * 0.5) / nT;
      const z = zT0 + (0.955 - zT0) * f;
      if (hv(1) < 0.07 && i > 1 && i < nT - 2) continue;
      // the 4th upper (from the front) is the biggest, crocodile-like; another big pair near the tip
      const fFront = 1 - f;
      const big = Math.exp(-Math.pow((fFront - 3.5 / nT) / 0.05, 2)) * 1.0 + Math.exp(-Math.pow((fFront - 9.5 / nT) / 0.06, 2)) * 0.45;
      const repl = hv(2) < 0.12 ? 0.55 : 1;
      const size = hs.teethSize * (0.4 + 0.45 * f + 0.95 * big) * (0.82 + 0.36 * hv(3)) * repl;
      const r = ridgeU(sd, z);
      const x = r[0], y = r[1] + size * 0.12;
      const curve = 0.2 + 0.35 * hv(4) + 0.25 * big;
      const lean = (hv(5) - 0.5) * 0.25;
      const broken = hv(6) < 0.1 ? 0.55 + 0.2 * hv(7) : 1;
      const tipY = y - size * 1.05 * broken;
      keratin.push({ kind: 'tooth', bone: 'head', tag: 'tooth',
        points: [W(x, y + size * 0.5, z), W(x * (0.995 + lean * 0.05), y - size * 0.35, z + size * 0.06), W(x * (0.985 + lean * 0.1), tipY, z - size * curve * broken)],
        radii: [size * (0.4 + 0.08 * big) * H, size * 0.27 * H, size * (broken < 1 ? 0.14 : 0.015) * H], flat: 0.72 + 0.1 * hv(8), up: ez, seedJ: hv(9) });
    }
    const nL = D.teeth[1] | 0;
    for (let i = 0; i < nL; i++) {
      const hv = (q) => hsh(i * 5 + (sd > 0 ? 3 : 4), q + 20);
      const f = (i + 1 + (hv(10) - 0.5) * 0.5) / (nL + 1);
      const z = zT0 + (0.925 - zT0) * f;
      if (hv(1) < 0.07 && i > 1 && i < nL - 2) continue;
      const fFront = 1 - f;
      const big = Math.exp(-Math.pow((fFront - 3.8 / nL) / 0.05, 2)) * 0.9;
      const repl = hv(2) < 0.12 ? 0.55 : 1;
      const size = hs.teethSize * 0.9 * (0.4 + 0.45 * f + 0.95 * big) * (0.82 + 0.36 * hv(3)) * repl;
      const r = ridgeJ(sd, z);
      const x = r[0], y = r[1] - size * 0.12;
      const curve = 0.2 + 0.3 * hv(4) + 0.2 * big;
      const broken = hv(6) < 0.1 ? 0.55 + 0.2 * hv(7) : 1;
      keratin.push({ kind: 'tooth', bone: 'jaw', tag: 'tooth',
        points: [jawPt(x, y - size * 0.5, z), jawPt(x * 0.995, y + size * 0.35, z + size * 0.05), jawPt(x * 0.985, y + size * 1.0 * broken, z - size * curve * broken)],
        radii: [size * 0.38 * H, size * 0.26 * H, size * (broken < 1 ? 0.13 : 0.015) * H], flat: 0.72, up: ez, seedJ: hv(9) });
    }
    if (nT > 0) {
      const gz = [0, 0.18, 0.36, 0.54, 0.72, 0.88, 1].map((f) => mix(zT0 - 0.02, 0.96, f));
      const gr = hs.teethSize * 0.13 * H;   // (a thin gum margin: a thick one drew a red line along the jaw)
      gums.push({ bone: 'head', pts: gz.map((z) => { const r = ridgeU(sd, z); return W(r[0] * 0.95, r[1] + hs.teethSize * 0.28, z); }), r: gr * 0.9 });
      gums.push({ bone: 'jaw', pts: gz.slice(0, -1).map((z) => { const r = ridgeJ(sd, z); return jawPt(r[0] * 0.93, r[1] - hs.teethSize * 0.32, z); }), r: gr * 0.85 });
    }
  }
  for (const gm of gums) for (let i = 0; i < gm.pts.length - 1; i++) {
    keratin.push({ kind: 'gum', bone: gm.bone, tag: 'gum', points: [gm.pts[i], lerp3(gm.pts[i], gm.pts[i + 1], 0.5), gm.pts[i + 1]], radii: [gm.r, gm.r * 1.05, gm.r], flat: 0.75, up: ez, open: true });
  }
  if (hs.eggTooth) keratin.push({ kind: 'horn', bone: 'head', tag: 'eggtooth', points: [W(0, U(0.99)[1] - 0.03, 0.985), W(0, U(0.99)[1] + 0.0, 1.0), W(0, U(0.99)[1] + 0.012, 1.02)], radii: [0.022 * H, 0.014 * H, 0.002 * H], flat: 0.8, up: ey });

  // ---- horns (DESIGN 2.3 / 3.3 / 4.3 / 5.3 / 6.3; fixed in every shot). A horn is a path of
  // control points (head units: x out, y up, z forward) with radii; keratin builds it as a smooth
  // spline with growth ridges. The sheath flares into a rough burr where it leaves the skin.
  const horn = (pts, radii, o = {}) => {
    // (rev. 2b: the path starts about a base radius INSIDE the skull - starting at the skin left
    // the open end of the sheath standing proud as a thin flange)
    let path = pts, rad = radii;
    if (o.bury ?? true) {
      const d0 = norm(sub(pts[1], pts[0]));
      path = [add(sub(pts[0], scale(d0, radii[0] * 1.1)), [0, -radii[0] * 0.6, 0]), ...pts];
      rad = [radii[0] * 0.92, ...radii];
    }
    keratin.push({ kind: 'horn', bone: 'head', tag: o.tag ?? 'horn', path: path.map((p) => W(...p)), rad: rad.map((r) => r * H), flat: o.flat ?? 0.82, up: ey, rings: o.rings ?? true, ringAmp: o.ringAmp, tipR: o.tipR, broken: !!o.broken });
    // (rev. 2: no burr collar - its separate ring read as a texture seam at the horn base)
    if (!soft && (o.burr ?? false)) {
      const p0 = pts[0], d = norm(sub(pts[1], pts[0])), r0 = radii[0];
      // (a low, rough flare where the sheath leaves the skin - not a proud collar)
      const q0 = sub(p0, scale(d, r0 * 0.45)), q2 = add(p0, scale(d, r0 * 0.45));
      keratin.push({ kind: 'claw', bone: 'head', tag: 'burr', points: [W(...q0), W(...p0), W(...q2)], radii: [r0 * 1.12 * H, r0 * 1.07 * H, r0 * 1.0 * H], flat: 0.8, up: ey, burr: true });
    }
  };
  const Hn = (m0) => m0 / H;                   // metres -> head units
  const top0 = U(0.02)[1], hwB = U(0.02)[0];
  for (const sd of [1, -1]) {
    const X = (p) => [sd * p[0], p[1], p[2]];
    if (spec.horns === 'charcoal') {
      // 1. main pair from the rear corners of the skull roof: back along the neck line, then out
      // and down, the tips turning a little forward (water buffalo / mouflon), annual ridges;
      // the LEFT tip broken off ~0.12 m (an old break, rounded by wear)
      const r0 = Hn(0.23);
      // (rev. 2: the curl swings OUT sideways before it turns down and forward - the first hoop
      // came down onto the neck and seemed to grow into it)
      // (fix round 1: the hoop down behind the skull with an even girth read as a hose or a handle
      // - a broad crescent sweeping OUT and back, a heavy base tapering hard to a worn point, the
      // tip lifting a little forward (water buffalo); deeper, uneven growth rings)
      const path = [[hwB * 0.6, top0 - 0.03, 0.03], [hwB * 1.08, top0 + 0.05, -0.13], [hwB * 1.72, top0 + 0.03, -0.25], [hwB * 2.3, top0 - 0.07, -0.27], [hwB * 2.7, top0 - 0.15, -0.17], [hwB * 2.9, top0 - 0.12, -0.03]].map(X);
      const broken = sd > 0;
      horn(broken ? path.slice(0, -1).concat([lerp3(path[4], path[5], 0.35)]) : path, broken ? [r0 * 1.3, r0 * 1.0, r0 * 0.72, r0 * 0.5, r0 * 0.33, r0 * 0.24] : [r0 * 1.3, r0 * 1.0, r0 * 0.72, r0 * 0.48, r0 * 0.26, r0 * 0.035], { flat: 0.78, broken, ringAmp: 0.14 });
      // 2. brow pair: behind and above the eyes, conical, up and back at 35 deg to the skull line
      const b0 = [eye[0] * 0.85, eye[1] + ER * 1.1, eye[2] - ER * 1.6];
      const bl = Hn(0.7), bd = norm([0.25, Math.sin(35 * deg), -Math.cos(35 * deg)]);
      horn([b0, add(b0, scale(bd, bl * 0.5)), add(add(b0, scale(bd, bl)), [0, -bl * 0.08, 0])].map(X), [Hn(0.11), Hn(0.075), Hn(0.008)], { flat: 0.9 });
      // 3. jaw knobs: three blunt osteoderm horns along each jaw angle, pointing back
      [0.18, 0.26, 0.34].forEach((l, i) => {
        const p0 = [U(hinge[2])[0] * (0.86 + i * 0.04), hinge[1] - 0.06 - i * 0.045, hinge[2] - 0.02 - i * 0.07];
        const d = norm([0.35, -0.12, -1]);
        horn([p0, add(p0, scale(d, Hn(l) * 0.55)), add(p0, scale(d, Hn(l)))].map(X), [Hn(0.09 + i * 0.015), Hn(0.06 + i * 0.01), Hn(0.025)], { tag: 'spur', rings: false, flat: 0.85 });
      });
    } else if (spec.horns === 'leaf') {
      // a short smooth pointed pair from the back corners of the skull, back along the neck line and a
      // little up, the tips dipping (no growth ridges yet); small brow nubs over the eyes
      const r0 = Hn(0.035);
      horn([[hwB * 0.58, top0 - 0.02, 0.0], [hwB * 0.7, top0 + 0.02, -0.15], [hwB * 0.8, top0 + 0.015, -0.3], [hwB * 0.86, top0 - 0.03, -0.42]].map(X), [r0, r0 * 0.78, r0 * 0.45, r0 * 0.06], { rings: false, flat: 0.86 });
      const b0 = [eye[0] * 0.82, eye[1] + ER * 1.05, eye[2] - ER * 0.8];
      horn([b0, add(b0, [0.012, 0.03, -0.02]), add(b0, [0.018, 0.05, -0.05])].map(X), [Hn(0.022), Hn(0.014), Hn(0.003)], { rings: false, burr: false });
    } else if (spec.horns === 'starlight') {
      // 1. main pair: long, slender, gently S-curved - back and UP above the neck line, then back
      // and down at the tips (sable antelope's scimitar, longer)
      const r0 = Hn(0.26);
      horn([[hwB * 0.5, top0 - 0.02, 0.04], [hwB * 0.6, top0 + 0.16, -0.2], [hwB * 0.72, top0 + 0.3, -0.5], [hwB * 0.84, top0 + 0.3, -0.8], [hwB * 0.94, top0 + 0.16, -1.05], [hwB * 1.0, top0 - 0.02, -1.18]].map(X),
        [r0, r0 * 0.86, r0 * 0.66, r0 * 0.46, r0 * 0.26, r0 * 0.03], { flat: 0.86 });
      // 2. the crown: three pairs along the back edge of the skull fanning out and back like a frill
      // (rev. 2: bases 0.28-0.4 m across - thin whips read as an insect's antennae)
      [[2.4, 0.4, 0.0], [1.7, 0.34, 1], [1.1, 0.28, 2]].forEach(([l, b, i]) => {
        const p0 = [hwB * (0.78 + i * 0.1), top0 - 0.05 - i * 0.06, 0.02 - i * 0.03];
        const d = norm([0.55 + i * 0.25, 0.18 - i * 0.1, -1]);
        const ln = Hn(l);
        horn([p0, add(p0, add(scale(d, ln * 0.5), [0, 0.02, 0])), add(p0, add(scale(d, ln), [0, -ln * 0.08, 0]))].map(X), [Hn(b * 0.5), Hn(b * 0.3), Hn(0.014)], { flat: 0.8 });
      });
    } else if (spec.horns === 'scout') {
      // one pair of long thin straight horns laid back flat along the top of the neck (~10 deg above it)
      const r0 = Hn(0.0175), ln = Hn(0.48);
      const p0 = [hwB * 0.5, top0 - 0.02, 0.02];
      // (rev. 2: below the skull line - the head is carried pitched down, so 10 deg above it stood the horns up)
      const d = norm([0.12, Math.sin(-6 * deg), -1]);
      horn([p0, add(p0, scale(d, ln * 0.5)), add(p0, scale(d, ln))].map(X), [r0, r0 * 0.6, r0 * 0.05], { rings: true, flat: 0.88 });
    } else if (spec.horns === 'buds') {
      // soft horn buds at the back corners of the skull: 2.5 cm pale cones, back and up
      const p0 = [hwB * 0.62, top0 - 0.03, 0.04];
      // (fix round 1: a little longer, so they read in the macro hero)
      const ln = Hn(0.034);
      horn([p0, add(p0, [0.01, ln * 0.6, -ln * 0.45]), add(p0, [0.02, ln * 0.95, -ln * 0.75])].map(X), [Hn(0.0075), Hn(0.005), Hn(0.0012)], { tag: 'bud', rings: false, burr: false });
    }
  }
  return { H, frame: { ex, ey, ez, origin: hj }, hinge: W(0, hinge[1], hinge[2]), gape0: g, W, jawPt, U, J, eye: eyeP, zInv: (z) => z };
}
