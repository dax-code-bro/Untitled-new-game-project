// Pose library. Every function is a PURE function of its arguments (time t
// included): no state is kept between frames, randomness comes from fixed
// hashes. Each returns a pose object for creature.setPose().
//
//   stand(c, { t, look:[yaw,pitch], jaw, breathe, wingFold })
//   sit(c, { t, look, jaw })                    dog-like upright sit (Nightwings)
//   lie(c, { t, look })                         resting on the belly, head low
//   flight(c, { t, hz, amp, phase, look, jaw, corr })   flapping, tempo from size
//   glide(c, { t, bank, look, jaw })            wings held, small corrections
//   dive(c, { t, fold })                        partly folded descent
// Common options: look = [yaw, pitch] (radians, head relative to body),
// eyes = [yaw, pitch] (eyes relative to head), jaw (0 = closed ... 0.9),
// blink = true (automatic blinks from t), breathe (breaths per second).
//
// Bones have identity rest orientations, so rotations are about the
// creature's own axes: x = its left (pitch), y = up (yaw), z = forward (roll).
// "Nose up" is a NEGATIVE x rotation. Right-side bones are mirrored
// automatically by sym() (y and z rotations flip sign).
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const fract = (x) => x - Math.floor(x);
const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
/** smooth deterministic wobble in [-1,1] (sum of incommensurate sines) */
const wob = (t, seed = 0) => (Math.sin(t * 1.0 + seed) * 0.5 + Math.sin(t * 2.31 + seed * 1.7) * 0.3 + Math.sin(t * 4.77 + seed * 2.9) * 0.2);

class PB {
  constructor(c) { this.c = c; this.e = {}; this.o = {}; this.q = {}; this.s = {}; this.rig = { position: [0, 0, 0], rotation: [0, 0, 0] }; this.u = {}; }
  has(n) { return this.c.boneIndex[n] !== undefined; }
  add(n, x = 0, y = 0, z = 0, order) {
    if (!this.has(n)) return this;
    const v = this.e[n] || (this.e[n] = [0, 0, 0]);
    v[0] += x; v[1] += y; v[2] += z;
    if (order) this.o[n] = order;
    return this;
  }
  /** base contains '#', replaced by L and R; the right side is mirrored */
  sym(base, x = 0, y = 0, z = 0, order) { this.add(base.replace('#', 'L'), x, y, z, order); this.add(base.replace('#', 'R'), x, -y, -z, order); return this; }
  scale(n, sx, sy, sz) { if (this.has(n)) this.s[n] = [sx, sy, sz]; return this; }
  quat(n, q) { if (this.has(n)) this.q[n] = q; return this; }
  out(extra = {}) {
    const bones = {};
    for (const [n, v] of Object.entries(this.e)) bones[n] = [v[0], v[1], v[2], this.o[n] || 'XYZ'];
    for (const [n, q] of Object.entries(this.q)) bones[n] = { q };
    return { bones, scale: this.s, rig: this.rig, uniforms: this.u, ground: true, ...extra };
  }
}

const neckNames = (c) => c.bones.filter((b) => /^neck_\d+$/.test(b.name)).map((b) => b.name);
const tailNames = (c) => c.bones.filter((b) => /^tail_\d+$/.test(b.name)).map((b) => b.name);

// ------------------------------------------------------------ shared layers
/** Breathing: slow ribcage expansion (inhale ~40% of the cycle, exhale 60%). */
function breathe(pb, t, rate = 0.12, amp = 0.025) {
  const c = fract(t * rate);
  const b = c < 0.4 ? smooth(0, 0.4, c) : 1 - smooth(0.4, 1.0, c);
  pb.scale('rib_thorax', 1 + amp * b, 1 + amp * 1.25 * b, 1);
  pb.scale('rib_body', 1 + amp * 0.85 * b, 1 + amp * 1.1 * b, 1);
  pb.scale('rib_lumbar', 1 + amp * 0.4 * b, 1 + amp * 0.5 * b, 1);
  return b;
}

/** Head/neck look: yaw and pitch spread along the neck, most of it near the head. */
function look(pb, yaw = 0, pitch = 0, roll = 0) {
  const ns = neckNames(pb.c);
  const n = ns.length;
  let wsum = 0;
  const w = ns.map((_, i) => { const x = Math.pow((i + 1) / n, 1.6); wsum += x; return x; });
  const headShare = 0.3;
  ns.forEach((name, i) => pb.add(name, pitch * (1 - headShare) * w[i] / wsum, yaw * (1 - headShare) * w[i] / wsum, roll * w[i] / wsum));
  pb.add('head', pitch * headShare, yaw * headShare, 0);
}

/** Neck carriage: raise the base, bring the head back to level (S-curve). */
function carriage(pb, raise = 0.3, headDown = 0.25) {
  const ns = neckNames(pb.c);
  const n = ns.length;
  ns.forEach((name, i) => {
    const f = i / (n - 1);
    pb.add(name, -raise * (1 - f) * 2 / n + headDown * f * f * 2.2 / n, 0, 0);
  });
  pb.add('head', headDown * 0.45, 0, 0);
}

function jaw(pb, open = 0) {
  const g = pb.c.anatomy.head.gape0;
  pb.add('jaw', -g + open, 0, 0);
}

/** Lids: blink automatically from t (a quick close/open every few seconds), or a fixed closure 0..1. */
function lids(pb, t, o = {}) {
  let close = o.lidClose ?? 0;
  if (o.blink !== false) {
    const period = o.blinkPeriod ?? 4.5;
    const k = Math.floor(t / period);
    const tb = k * period + hash(k * 7.3 + (pb.c.L * 13) % 7) * (period - 0.4);
    const d = t - tb;
    const bl = d >= 0 && d < 0.32 ? (d < 0.11 ? smooth(0, 0.11, d) : 1 - smooth(0.11, 0.32, d)) : 0;
    close = Math.max(close, bl);
  }
  const relax = o.lidRelax ?? 0.42;     // resting lids lowered over the top of the eye (a calm look)
  for (const e of pb.c.eyes) {
    const ax = new THREE.Vector3(...e.gx);
    const up = mix(relax, 1.15, close), lo = mix(relax * 0.55, 0.4, close);
    pb.quat(e.lidU, new THREE.Quaternion().setFromAxisAngle(ax, up).toArray());
    pb.quat(e.lidL, new THREE.Quaternion().setFromAxisAngle(ax, -lo).toArray());
  }
  return close;
}

/** Eyes: yaw/pitch relative to their rest gaze (positive yaw = toward the creature's left). */
function eyes(pb, yaw = 0, pitch = 0) {
  for (const e of pb.c.eyes) {
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...e.up), yaw);
    const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...e.gx), -pitch);
    pb.quat(e.bone, qy.multiply(qp).toArray());
  }
}

function tailCurve(pb, t, o = {}) {
  const ts = tailNames(pb.c);
  const n = ts.length;
  const sway = o.sway ?? 0.05, lift = o.lift ?? 0, curl = o.curl ?? 0;
  ts.forEach((name, i) => {
    const f = i / (n - 1);
    const s = Math.sin(t * TAU * (o.swayHz ?? 0.07) - i * 0.22);
    pb.add(name, (lift * (1 - f) - (o.droop ?? 0) * (1 - f)) * 2 / n, (sway * s + curl * f) * 2.5 / n, 0);
  });
}

// ----------------------------------------------------------------- wings
// Folding by aiming bone frames: each wing bone gets a target direction and a
// "dorsal up" hint (in the body frame), converted to local rotations down the
// chain. The folded wing lies flat against the flank, dorsal side out.
const _V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function frameQ(dir, up) {
  const z = dir.clone().normalize();
  const y = up.clone().addScaledVector(z, -up.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
function aimQ(d0, u0, d1, u1) { return frameQ(d1, u1).multiply(frameQ(d0, u0).invert()); }
const foldCache = new WeakMap();
// alternative fold targets (body frame) for poses that pitch the body: in the dog-sit
// the forearm stands up along the neck base (wrist above the shoulder, like a
// gargoyle's) and the fingers hang down behind it
const FOLD_VARIANTS = {
  sit: { humerus: [0.28, -0.24, -0.93], forearm: [0.3, 0.5, 0.81], hand: [0.05, -0.55, -0.83] },
  // the previous default (wrist raised above the back)
  high: { humerus: [0.28, -0.24, -0.93], forearm: [0.17, 0.3, 0.94], hand: [0.07, -0.3, -0.95] },
  // dog-sit, wing folded flat along the flank: wrist below and behind the shoulder (never
  // standing up like a raised arm), hand and fingers back along the body toward the haunch
  // (directions in the body frame, which the sit pitches ~45 deg nose-up: these are, in the
  // world, humerus back-down along the flank, forearm forward and down beside the chest, hand
  // and fingers back and slightly down along the side toward the haunch)
  sitFlank: { humerus: [0.3, 0.21, -0.92], forearm: [0.2, -0.87, 0.45], hand: [0.08, 0.5, -0.86] },
};
function foldedWing(c, sd, variant = '') {
  let cache = foldCache.get(c);
  if (!cache) { cache = {}; foldCache.set(c, cache); }
  const key = sd + variant;
  if (cache[key]) return cache[key];
  const s = sd === 'L' ? 1 : -1;
  const rp = c.restPos;
  const P = (n) => _V(rp[`w_${sd}_${n}`]);
  const R = P(0), E = P(1), W = P(2);
  const tip = (d) => {
    const names = [0, 1, 2].map((j) => `w_${sd}_f${d}_${j}`);
    // last phalanx end = extrapolate from the anatomy's finger record
    const w = c.anatomy.wings.find((x) => x.side === sd);
    return _V(w.fingers[d].points[3]);
  };
  const up0 = new THREE.Vector3(0, 1, 0);
  const tgt = { ...(c.config.fold || {}), ...(FOLD_VARIANTS[variant] || {}) };
  // default (standing/lying): humerus back and down along the flank, forearm forward
  // nearly level (wrist beside the shoulder, not above the back), hand and fingers
  // back along the flank, so the folded membrane lies against the body
  const hum = _V(tgt.humerus || [0.24, -0.4, -0.88]).multiply(new THREE.Vector3(s, 1, 1));
  const fore = _V(tgt.forearm || [0.1, 0.12, 0.99]).multiply(new THREE.Vector3(s, 1, 1));
  const hand = _V(tgt.hand || [0.03, -0.22, -0.97]).multiply(new THREE.Vector3(s, 1, 1));
  const out = _V([s * 0.94, 0.3, 0.05]);
  const Qh = aimQ(E.clone().sub(R), up0, hum, out);
  const Qf = aimQ(W.clone().sub(E), up0, fore, _V([s * 0.97, -0.05, -0.12]));
  const Qw = aimQ(tip(1).sub(W), up0, hand, out);
  const res = { [`w_${sd}_0`]: Qh.clone(), [`w_${sd}_1`]: Qh.clone().invert().multiply(Qf), [`w_${sd}_2`]: Qf.clone().invert().multiply(Qw) };
  // fingers bunched along the hand, fanned slightly downward in the folded plane
  const handT = hand.clone().normalize();
  const down = new THREE.Vector3().crossVectors(out, handT).normalize();
  if (down.y > 0) down.negate();
  const fan = [0.0, 0.035, 0.07, 0.11];
  for (let d = 0; d < 4; d++) {
    const n0 = `w_${sd}_f${d}_0`;
    const dir0 = tip(d).sub(W);
    const dir1 = handT.clone().multiplyScalar(Math.cos(fan[d])).addScaledVector(down, Math.sin(fan[d]));
    const Qd = aimQ(dir0, up0, dir1, out);
    res[n0] = Qw.clone().invert().multiply(Qd);
  }
  cache[key] = res;
  return res;
}
/** Folded wing (fold 0 = spread rest, 1 = fully folded against the body). Overrides other rotations of the wing bones. */
function wingFold(pb, fold, side = 'both', pitchComp = 0, adduct = 0, variant = '') {
  const f = clamp(fold, 0, 1);
  for (const sd of side === 'both' ? ['L', 'R'] : [side]) {
    const F = foldedWing(pb.c, sd, variant);
    // pitchComp: tilt the folded wing up when the body is pitched nose-up;
    // adduct: swing it in against the flank (yaw about the shoulder)
    const qc = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchComp, (sd === 'L' ? 1 : -1) * adduct, 0, 'YXZ'));
    for (const [n, q] of Object.entries(F)) {
      const qq = new THREE.Quaternion().slerp(q, f);
      if ((pitchComp || adduct) && n === `w_${sd}_0`) qq.premultiply(qc);
      pb.quat(n, qq.toArray());
    }
  }
}

/**
 * Flapping wings at cycle position cyc (0..1, 0 = top of the upstroke).
 * Downstroke takes `down` of the cycle; the elbow and hand flex during the
 * upstroke (less drag), fingers spread on the downstroke, the wing pronates
 * (leading edge down) on the downstroke. Returns {phi, upFold} for body motion.
 */
function wingFlap(pb, cyc, o = {}) {
  const D = o.down ?? 0.56;
  const amp = o.amp ?? 0.85, center = o.center ?? 0.12;
  const phi = cyc < D ? Math.PI * cyc / D : Math.PI + Math.PI * (cyc - D) / (1 - D);
  const lag = (dc) => { const c2 = fract(cyc - dc); return c2 < D ? Math.PI * c2 / D : Math.PI + Math.PI * (c2 - D) / (1 - D); };
  const elev = center + amp * Math.cos(phi);
  const sweep = -0.16 * Math.sin(phi);
  const pron = 0.22 * Math.sin(phi);
  const pu = lag(0.06);
  const up = pu > Math.PI ? Math.sin(pu - Math.PI) : 0;          // upstroke flexion 0..1
  const pd = lag(0.03);
  const downSpread = pd < Math.PI ? Math.sin(pd) : 0;
  const asym = o.asym ?? 0;                                       // corrective beats: left/right differ
  for (const sd of ['L', 'R']) {
    const k = sd === 'L' ? 1 + asym : 1 - asym;
    const s = sd === 'L' ? 1 : -1;
    pb.add(`w_${sd}_0`, pron, s * (sweep + 0.18 * up), s * elev * k, 'YZX');
    pb.add(`w_${sd}_1`, 0, s * (-0.55 * up - 0.05), s * (0.25 * up), 'YZX');
    pb.add(`w_${sd}_2`, 0, s * (0.75 * up + 0.04), s * (-0.35 * up), 'YZX');
    const fan = [0.0, 0.1, 0.22, 0.32];
    for (let d = 0; d < 4; d++) pb.add(`w_${sd}_f${d}_0`, 0.04 * d * downSpread, s * (fan[d] * up - 0.04 * d * downSpread), s * (-0.05 * up * d), 'YZX');
  }
  pb.u.billowL = 0.6 * downSpread - 0.4 * up;
  pb.u.billowR = 0.6 * downSpread - 0.4 * up;
  return { phi, up, downSpread };
}

/** Legs tucked for flight: forelegs folded back under the chest, hind legs trailing. */
function tuckLegs(pb, k = 1) {
  pb.sym('fl_#_0', 0.7 * k, 0, 0.05 * k); pb.sym('fl_#_1', -2.3 * k, 0, 0); pb.sym('fl_#_2', 1.75 * k, 0, 0);
  pb.sym('hl_#_0', 1.05 * k, 0, 0); pb.sym('hl_#_1', -0.15 * k, 0, 0); pb.sym('hl_#_2', 0.95 * k, 0, 0);
  for (let i = 0; i < 4; i++) { pb.sym(`fl_#_t${i}`, 0.5 * k, 0, 0); pb.sym(`hl_#_t${i}`, 0.6 * k, 0, 0); }
}

// --------------------------------------------------------------- poses
export function rest(c, o = {}) {
  const pb = new PB(c);
  jaw(pb, o.jaw ?? c.anatomy.head.gape0);
  return pb.out({ ground: false });
}

export function stand(c, o = {}) {
  const t = o.t ?? 0;
  const pb = new PB(c);
  const b = breathe(pb, t, o.breathe ?? (c.L > 20 ? 0.09 : 0.18));
  carriage(pb, o.raise ?? 0.35, o.headDown ?? 0.4);
  const lk = o.look || [0, 0];
  look(pb, lk[0] + 0.03 * wob(t * 0.3, 1), lk[1] + 0.02 * b + 0.02 * wob(t * 0.25, 2));
  jaw(pb, (o.jaw ?? 0) + 0.015 * b);
  eyes(pb, ...(o.eyes || [0, 0]));
  lids(pb, t, o);
  wingFold(pb, o.wingFold ?? 1, 'both', 0, 0, o.foldVariant ?? '');
  tailCurve(pb, t, { sway: 0.06, droop: 0.9, curl: o.tailCurl ?? 0.25 });
  return pb.out({ groundTail: true });
}

/** Dog-like upright sit: haunches down, forelegs straight, chest up, tail curled on the ground. */
export function sit(c, o = {}) {
  const t = o.t ?? 0;
  const pb = new PB(c);
  const a = o.pitch ?? 0.78;             // body pitch (nose up)
  pb.rig.rotation = [-a, 0, 0];
  const b = breathe(pb, t, o.breathe ?? 0.2);
  // forelegs: counter the body pitch so they stand vertical and straight
  pb.sym('fl_#_0', a - 0.12, 0, 0.04); pb.sym('fl_#_1', 0.08, 0, 0); pb.sym('fl_#_2', -0.05, 0, 0);
  for (let i = 0; i < 4; i++) pb.sym(`fl_#_t${i}`, -0.15, 0, 0);
  // hind legs folded: thigh forward, shin back, metatarsus flat on the ground
  pb.sym('hl_#_0', -0.95 + a, 0.12, 0.1); pb.sym('hl_#_1', 2.0, 0, 0); pb.sym('hl_#_2', -2.0 + 0.35, 0, 0);
  for (let i = 0; i < 4; i++) pb.sym(`hl_#_t${i}`, 0.25, 0, 0);
  // neck forward-up in an S, head level (the body pitch already raises the neck)
  carriage(pb, -0.55, 0.35 + a * 0.55);
  const lk = o.look || [0, 0];
  look(pb, lk[0] + 0.04 * wob(t * 0.35, 3), lk[1] + 0.02 * b);
  jaw(pb, (o.jaw ?? 0) + 0.01 * b);
  eyes(pb, ...(o.eyes || [0, 0]));
  lids(pb, t, o);
  wingFold(pb, 1, 'both', o.wingComp ?? a * 0.4, o.wingAdduct ?? 0.22, o.foldVariant ?? 'sit');
  // tail: down to the ground and curled around the side
  const ts = tailNames(c);
  ts.forEach((n, i) => {
    const f = i / (ts.length - 1);
    pb.add(n, i < 3 ? -0.08 : 0.0, (0.07 + 0.02 * Math.sin(t * 0.6 - i * 0.3)) * f * 1.6, 0);
  });
  return pb.out({ groundTail: true });
}

/** Resting on the belly: legs folded under, neck low, chin near the ground. */
export function lie(c, o = {}) {
  const t = o.t ?? 0;
  const pb = new PB(c);
  breathe(pb, t, o.breathe ?? (c.L > 20 ? 0.07 : 0.15), 0.032);
  pb.sym('fl_#_0', -0.9, 0, 0.05); pb.sym('fl_#_1', 2.2, 0, 0); pb.sym('fl_#_2', -1.25, 0, 0);
  pb.sym('hl_#_0', -1.1, 0.08, 0.06); pb.sym('hl_#_1', 2.25, 0, 0); pb.sym('hl_#_2', -1.6, 0, 0);
  carriage(pb, o.raise ?? -0.45, o.headDown ?? 0.15);
  const lk = o.look || [0, 0];
  look(pb, lk[0] + 0.03 * wob(t * 0.2, 4), lk[1]);
  jaw(pb, o.jaw ?? 0);
  eyes(pb, ...(o.eyes || [0, 0]));
  lids(pb, t, { ...o, lidRelax: o.lidRelax ?? 0.6 });
  wingFold(pb, 1);
  tailCurve(pb, t, { sway: 0.03, droop: 0.45, curl: 0.5, swayHz: 0.04 });
  return pb.out({ groundTail: true, groundBody: true });
}

/** Flapping flight. Tempo from the creature's size (config.flapHz) unless o.hz is given. */
export function flight(c, o = {}) {
  const t = o.t ?? 0;
  const pb = new PB(c);
  const hz = o.hz ?? c.config.flapHz ?? 1;
  const cyc = fract(t * hz + (o.phase ?? 0));
  const corr = o.corr ?? 0;            // corrective unevenness (Leaf), 0..1
  const asym = corr * 0.18 * wob(t * hz * 0.7, 5);
  const ampJ = 1 + corr * 0.15 * wob(t * hz * 0.9, 6);
  const w = wingFlap(pb, cyc, { amp: (o.amp ?? c.config.flapAmp ?? 0.8) * ampJ, center: o.center ?? 0.12, asym });
  tuckLegs(pb, 1);
  // body: lifted during the downstroke, slight pitch oscillation; the neck
  // counters it so the head stays steady (as flying animals do)
  const bob = Math.sin(w.phi - 0.7);
  const pitch = 0.05 * Math.cos(w.phi);
  pb.rig.position = [0, -(o.bobAmp ?? 0.012) * c.L * bob, 0];
  pb.rig.rotation = [(o.bodyPitch ?? 0) + pitch, 0, o.bank ?? 0];
  carriage(pb, -0.2, 0.05);
  const lk = o.look || [0, 0];
  look(pb, lk[0], lk[1] - pitch * 0.9 - (o.bodyPitch ?? 0) * 0.6, -(o.bank ?? 0) * 0.5);
  jaw(pb, o.jaw ?? 0);
  eyes(pb, ...(o.eyes || [0, 0]));
  lids(pb, t, { ...o, lidRelax: 0.3 });
  breathe(pb, t, hz * 0.5, 0.02);
  const ts = tailNames(c);
  ts.forEach((n, i) => {
    const f = i / (ts.length - 1);
    pb.add(n, (0.05 * Math.sin(w.phi - 1.2 - i * 0.25)) * f * 2 / ts.length * 4 - 0.04 / ts.length, (o.bank ?? 0) * 0.6 * f * 2 / ts.length, 0);
  });
  return pb.out({ ground: false });
}

/** Glide: wings held out with slight dihedral, small corrections; bank rolls the body. */
export function glide(c, o = {}) {
  const t = o.t ?? 0;
  const pb = new PB(c);
  const bank = o.bank ?? 0;
  const cr = (o.corr ?? 1) * 0.04;
  for (const sd of ['L', 'R']) {
    const s = sd === 'L' ? 1 : -1;
    const inner = (bank > 0) === (sd === 'L') ? Math.abs(bank) : 0;    // inner wing of the turn flexes a little
    pb.add(`w_${sd}_0`, 0.04 + cr * wob(t * 0.8, sd === 'L' ? 1 : 2), s * (0.04 + 0.15 * inner), s * ((o.dihedral ?? 0.12) + cr * wob(t * 0.6, sd === 'L' ? 3 : 4) - 0.2 * inner), 'YZX');
    pb.add(`w_${sd}_1`, 0, s * (-0.06 - 0.2 * inner), 0, 'YZX');
    pb.add(`w_${sd}_2`, 0, s * (0.05 + 0.25 * inner), 0, 'YZX');
  }
  pb.u.billowL = 0.35; pb.u.billowR = 0.35;
  tuckLegs(pb, 1);
  pb.rig.rotation = [o.bodyPitch ?? 0, 0, bank];
  carriage(pb, -0.2, 0.05);
  const lk = o.look || [0, 0];
  look(pb, lk[0] + 0.02 * wob(t * 0.4, 7), lk[1] - (o.bodyPitch ?? 0) * 0.6, -bank * 0.55);
  jaw(pb, o.jaw ?? 0);
  eyes(pb, ...(o.eyes || [0, 0]));
  lids(pb, t, { ...o, lidRelax: 0.3 });
  breathe(pb, t, 0.25, 0.015);
  const ts = tailNames(c);
  ts.forEach((n, i) => { const f = i / (ts.length - 1); pb.add(n, 0.01 * Math.sin(t * 0.9 - i * 0.2) * f, bank * 0.7 * f * 2 / ts.length, 0); });
  return pb.out({ ground: false });
}

/** Dive with the wings partly folded (Starlight's attack). fold 0..1. */
export function dive(c, o = {}) {
  const p = glide(c, { ...o, dihedral: 0.0 });
  const pb = new PB(c);
  Object.assign(pb.e, JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(p.bones).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.slice(0, 3)])))));
  for (const [k, v] of Object.entries(p.bones)) if (Array.isArray(v) && v[3]) pb.o[k] = v[3];
  for (const [k, v] of Object.entries(p.bones)) if (!Array.isArray(v)) pb.q[k] = v.q;
  Object.assign(pb.s, p.scale);
  wingFold(pb, (o.fold ?? 0.55) * 0.6);
  pb.rig = p.rig;
  pb.u = { billowL: 0.15, billowR: 0.15 };
  return pb.out({ ground: false });
}
