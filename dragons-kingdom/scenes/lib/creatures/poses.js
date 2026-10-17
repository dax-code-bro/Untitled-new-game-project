// Pose library for the two-legged, wing-armed dragons (DESIGN.md 1.5-1.7, per-dragon motion).
// Every function is a PURE function of its arguments (time t included): no state between
// frames, randomness from fixed hashes. Each returns a pose object for creature.setPose().
//
//   ground (IK: feet and wrist pads planted on y = 0 of the root frame)
//     stand(c, o)      wing-walk stance: feet + the folded wings' wrist pads, elbows high
//     walk(c, o)       lateral-sequence walk (o.speed m/s; the scene moves the root by speed * t)
//     rear(c, o)       up on the hind legs, tail on the ground, wings half open
//     sit(c, o)        dog-like sit on the haunches, wrists planted in front (Leaf)
//     crouch(c, o)     sphinx crouch, chest low between the wrists (mounting, before a launch)
//     lie(c, o)        sphinx rest; o.sprawl = 1 for the newborn (legs splayed, too weak)
//     pushUp(c, o)     the newborn pushes up on its wrists (o.k 0..1, trembling)
//     struggle(c, o)   the newborn's weak struggle as a function of t (lie, push, slip, rest)
//     fire(c, o)       the fire posture and tells (inhale, jaw 25-30 deg), o.t from the command
//   air
//     flight(c, o)     flapping at the size-based tempo (config.flapHz), o.corr = uneven beats
//     glide(c, o)      wings spread, dihedral, corrections; o.bank rolls the body
//     dive(c, o)       the half-folded "M" stoop (o.fold)
//     strike(c, o)     talons forward (Starlight's strike), o.k 0..1
//     sprint(c, o)     the scout's fast pass: short quick beats, neck pulled back in an S
//     mouthHold(c, o)  Charcoal holding Leaf's head: neck curled round, gape schedule
//   transitions (time from the start of the move)
//     launch(c, o)     crouch, kick and vault, wings unfold, first downstroke, heavy beats
//     land(c, o)       flare, feet reach forward, wrist pads come down, run-out
//   blend(c, a, b, w)  slerp two poses
// Common options: look = [yaw, pitch] (head relative to the body), eyes, jaw (0 = closed,
// radians of gape), blink (default true), lidClose, breathe (breaths/s).
//
// Bones have identity rest orientations (the REST pose = the glide planform: wings spread,
// legs trailing), so rotations are about the creature's own axes: x = its left (pitch: a
// positive x rotation tips the nose DOWN), y = up (yaw toward its left), z = forward (roll:
// positive raises the left side). Right-side bones are mirrored by sym().
import * as THREE from 'three';
import { qMul, qInv, qRot, qEuler, qSlerp, aimQ, arcQ, fk, ik2, chainLocals, QI, v3, qAxis } from './kin.js';

const { add, sub, scale, dot, cross, len, norm, lerp } = v3;
const TAU = Math.PI * 2;
const deg = Math.PI / 180;
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
  quat(n, q) { if (this.has(n)) { this.q[n] = q; delete this.e[n]; } return this; }
  out(extra = {}) {
    const bones = {};
    for (const [n, v] of Object.entries(this.e)) bones[n] = [v[0], v[1], v[2], this.o[n] || 'XYZ'];
    for (const [n, q] of Object.entries(this.q)) bones[n] = { q };
    return { bones, scale: this.s, rig: this.rig, uniforms: this.u, ground: true, ...extra };
  }
}

const neckNames = (c) => c.bones.filter((b) => /^neck_\d+$/.test(b.name)).map((b) => b.name);
const tailNames = (c) => c.bones.filter((b) => /^tail_\d+$/.test(b.name)).map((b) => b.name);
const sides = [['L', 1], ['R', -1]];

// ------------------------------------------------------------ kinematics helpers
function pbLocals(pb) {
  const out = {};
  for (const [n, v] of Object.entries(pb.e)) out[n] = qEuler(v[0], v[1], v[2], pb.o[n] || 'XYZ');
  for (const [n, q] of Object.entries(pb.q)) out[n] = q;
  return out;
}
function rigQ(pb) { if (pb.rig.quaternion) return pb.rig.quaternion; const r = pb.rig.rotation; return qEuler(r[0], r[1], r[2], 'YXZ'); }
/** world (root-frame) joint positions and rotations of the pose built so far */
function solveFK(pb) { return fk(pb.c.anatomy.bones, pbLocals(pb), { pos: pb.rig.position, q: rigQ(pb) }); }

/**
 * Hind leg IK: the ball of the foot at `ball` (root frame), the metatarsus at mtAng (deg from
 * the ground, rising back to the ankle), the knee toward `pole`, the foot pointing along
 * `fwd` (root frame, horizontal). Toes: o.curl (rad, + = grip down).
 */
function legIK(pb, F, side, ball, o = {}) {
  const c = pb.c, A = c.anatomy, d = A.dims;
  const sd = side === 'L' ? 1 : -1;
  const lg = A.legs.find((l) => l.side === side);
  const names = lg.names;
  const Hj = F.P[names[0]];
  const ma = (o.mtAng ?? A.design.leg.mtAng) * deg;
  const fwd = norm(o.fwd ?? [sd * 0.08, 0, 1]);
  const mtDir = norm(add(scale(fwd, -Math.cos(ma)), [0, Math.sin(ma), 0]));
  const Ank0 = add(ball, scale(mtDir, d.mtl));
  const pole = o.pole ?? add(fwd, [sd * 0.25, 0.15, 0]);
  const ik = ik2(Hj, Ank0, d.fem, d.tib, pole);
  const Ank = ik.C;
  const B = sub(Ank, scale(mtDir, d.mtl));
  const footDir = norm(add(fwd, [0, -(o.toeDown ?? 0), 0]));
  const r = lg.rest;
  const restJ = [r.hip, r.knee, r.ankle, r.ball, r.foot];
  const newJ = [Hj, ik.B, Ank, B, add(B, scale(footDir, d.toeL))];
  const ups = [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]];
  const cl = chainLocals(names, restJ, newJ, ups, ups, F.Q.pelvis);
  names.forEach((n) => pb.quat(n, cl.local[n]));
  const curl = o.curl ?? 0.05;
  for (const tn of lg.toes) {
    const i = +tn.slice(-1);
    // the hallux grips back-down; the forward toes press flat with a slight grip at the claws
    pb.add(tn, i === 0 ? -curl * 0.5 : curl, i === 1 ? sd * 0.04 : i === 3 ? -sd * 0.04 : 0, 0);
  }
  return { hip: Hj, knee: ik.B, ankle: Ank, ball: B };
}

/**
 * Wing-arm IK (the folded wing as a front leg): the wrist joint at `wrist` (root frame), the
 * elbow toward `pole`. Returns the joints and the arm's dorsal direction (the wing's upper
 * surface: outward when folded).
 */
function armIK(pb, F, side, wrist, pole, minTwist = false) {
  const c = pb.c, A = c.anatomy, d = A.dims;
  const sd = side === 'L' ? 1 : -1;
  const w = A.wings.find((x) => x.side === side);
  const pre = `w_${side}`;
  const S = F.P[`${pre}_0`];
  const ik = ik2(S, wrist, d.hum, d.fore, pole);
  const E = ik.B, W = ik.C;
  if (minTwist) {
    // (rev. 2) the arm swung from its sculpt orientation by the shortest arc (no twist about the
    // bone): a twisted humerus pinched the shoulder skin into a slit that read as a wound
    const qT = F.Q.thorax;
    const hW0 = qMul(qT, A.sculptLocal[`${pre}_0`]);
    const hW = qMul(arcQ(qRot(hW0, norm(sub(w.elbow, w.root))), norm(sub(E, S))), hW0);
    const fW0 = qMul(hW, A.sculptLocal[`${pre}_1`]);
    const fW = qMul(arcQ(qRot(fW0, norm(sub(w.wrist, w.elbow))), norm(sub(W, E))), fW0);
    pb.quat(`${pre}_0`, qMul(qInv(qT), hW));
    pb.quat(`${pre}_1`, qMul(qInv(hW), fW));
    return { S, E, W, dors: norm(qRot(fW, [0, 1, 0])), qF: fW };
  }
  let dors = scale(norm(cross(sub(E, S), sub(W, E))), -sd);
  if (!(len(dors) > 0.5)) dors = qRot(F.Q.thorax, [sd, 0, 0]);
  const cl = chainLocals([`${pre}_0`, `${pre}_1`], [w.root, w.elbow, w.wrist], [S, E, W], [[0, 1, 0], [0, 1, 0]], [dors, dors], F.Q.thorax);
  pb.quat(`${pre}_0`, cl.local[`${pre}_0`]);
  pb.quat(`${pre}_1`, cl.local[`${pre}_1`]);
  return { S, E, W, dors, qF: cl.world[1] };
}

/**
 * The hand folded along the trailing side of the forearm (the metacarpals run up toward the
 * elbow, the knuckles end just below it) and the fingers laid back along the upper flank like
 * a closed fan (III on top), the outer phalanges bending down (DESIGN 1.5). `qT` is the
 * thorax's world rotation (the flank's frame).
 */
function foldHand(pb, side, arm, qT, o = {}) {
  const c = pb.c, A = c.anatomy;
  const sd = side === 'L' ? 1 : -1;
  const w = A.wings.find((x) => x.side === side);
  const pre = `w_${side}`;
  const f = norm(sub(arm.W, arm.E));
  const dors = arm.dors;
  const lead = scale(norm(cross(f, dors)), sd);
  const beta = (o.handBack ?? 9) * deg;
  const handDir = norm(add(scale(f, -Math.cos(beta)), scale(lead, -Math.sin(beta))));
  const fg0 = w.fingers[0].points;
  const Wh = aimQ(norm(sub(fg0[1], fg0[0])), [0, 1, 0], handDir, dors);
  pb.quat(`${pre}_2`, qMul(qInv(arm.qF), Wh));
  const outW = norm(qRot(qT, [sd, o.outUp ?? A.design.fold?.outUp ?? 0.15, 0]));
  // (fix round 1) o.levelK: the metacarpals aimed so every knuckle sits at the height of the
  // leading finger's, the fingers stacked OUTWARD (o.gapK x their radius apart) instead of one
  // above the other - a closed fan seen edge-on (one bundle, the skin pleated between), not a
  // deck chair of parallel slats
  const K0 = add(arm.W, scale(handDir, len(sub(fg0[1], fg0[0]))));
  const hK = K0[1] - arm.W[1];
  const hh = norm([handDir[0], 0, handDir[2]]);
  const dorsH = norm([dors[0], 0, dors[2]]);
  w.fingers.forEach((fg, di) => {
    const pts = fg.points;
    const rd = (j) => norm(sub(pts[j + 1], pts[j]));
    const fan = (o.mcFan ?? 2.2) * deg * di;
    let mcDir = norm(add(scale(handDir, Math.cos(fan)), scale(lead, -Math.sin(fan))));
    if (o.levelK) {
      const mcl = len(sub(pts[1], pts[0]));
      const off = (o.gapK ?? 2.2) * (fg.radii[1] ?? 0) * di;
      const sh = mcl * mcl - hK * hK - off * off;
      if (sh > 0) mcDir = norm(add(add([0, hK, 0], scale(dorsH, off)), scale(hh, Math.sqrt(sh))));
    }
    const Wmc = aimQ(rd(0), [0, 1, 0], mcDir, dors);
    pb.quat(fg.names[0], qMul(qInv(Wh), Wmc));
    let Wp = Wmc;
    // the first phalanx runs back along the upper flank, the outer ones curl down beside the
    // thigh (IP flexion) so the tips end over the hip and thigh, never as rods past the tail
    const curl = o.curl ?? A.design.fold?.curl ?? [8, 58, 105];
    for (let j = 1; j < fg.names.length; j++) {
      const a = (curl[Math.min(j - 1, curl.length - 1)] + (o.fanDown ?? 3) * di) * deg + (o.p1Down ?? 0) * (j === 1 ? 1 : 0);
      const F = A.design.fold || {};
      // (o.inwardJ: per-phalanx lateral lean, e.g. a Z-fold whose layers lie side by side)
      const inw = o.inwardJ ? o.inwardJ[Math.min(j - 1, o.inwardJ.length - 1)] : (o.inward ?? F.inward ?? 0.04) + (j > 1 ? (o.wrap ?? F.wrap ?? 0.14) : 0);
      const dB = norm([-sd * inw, -Math.sin(a), -Math.cos(a)]);
      const dW = qRot(qT, dB);
      const Wj = aimQ(rd(j), [0, 1, 0], dW, outW);
      pb.quat(fg.names[j], qMul(qInv(Wp), Wj));
      Wp = Wj;
    }
  });
  // the thumb: forward and down, its claw planted ahead of the wrist pad (weight-bearing)
  pb.add(`${pre}_th`, 0, sd * (o.thumbOut ?? 0.15), 0);
}

/** One folded wing planted as a front leg (IK + fold). */
function plantWing(pb, F, side, wristP, o = {}) {
  const sd = side === 'L' ? 1 : -1;
  const qT = F.Q.thorax;
  const pole = o.pole ?? add(qRot(qT, [sd * 0.35, 0.75, -0.6]), [0, 0.3, 0]);
  const arm = armIK(pb, F, side, wristP, pole, o.minTwist ?? true);
  foldHand(pb, side, arm, qT, o);
  if (o.thumbAim !== false) aimThumb(pb, side, arm, qT, o.thumbDir);
  return arm;
}

/**
 * (rev. 3) The thumb of a planted wing laid forward along the ground ahead of the wrist pad,
 * a little outward, its claw curving down into the turf (a bat's thumb on the ground): with the
 * forearm sloping down to the wrist the sculpted thumb pointed straight down and the claw became
 * the lowest contact (the animal stood on its thumb tips). `dir` = [out, down, fwd] in the
 * trunk's frame.
 */
function aimThumb(pb, side, arm, qT, dir) {
  const c = pb.c, A = c.anatomy;
  const sd = side === 'L' ? 1 : -1;
  const w = A.wings.find((x) => x.side === side);
  if (!w || !w.thumbSculpt) return;
  const T = w.thumbSculpt;
  const d = dir || [0.35, null, 1];
  const f = qRot(qT, [sd * d[0], 0, d[2]]);
  const fl = Math.hypot(f[0], f[2]) || 1;
  // the thumb's base where the forearm carries it (sculpt -> now)
  const baseW = add(arm.E, qRot(arm.qF, sub(w.thumbRest.base, w.elbow)));
  const pick = (down) => {
    const want = norm([f[0] / fl, -down, f[2] / fl]);
    const R = aimQ(T.dir, T.up, want, [0, 1, 0]);
    return { R, tipY: add(baseW, qRot(R, T.tipOff))[1] };
  };
  let best;
  if (d[1] !== null && d[1] !== undefined) best = pick(d[1]);
  else {
    // the pitch that sets the thumb tip on the ground (y = its contact radius), within -0.5..0.5
    for (let k = -10; k <= 10; k++) {
      const p = pick(k * 0.05);
      const e = Math.abs(p.tipY - T.tipR);
      if (!best || e < best.e) best = { ...p, e };
    }
  }
  pb.quat(`w_${side}_th`, qMul(qInv(arm.qF), qMul(best.R, T.q)));
}

// ------------------------------------------------------------ shared layers
/** Breathing: slow ribcage expansion (inhale ~40% of the cycle, exhale 60%). */
function breathe(pb, t, rate = 0.12, amp = 0.025) {
  const cy = fract(t * rate);
  const b = cy < 0.4 ? smooth(0, 0.4, cy) : 1 - smooth(0.4, 1.0, cy);
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

/**
 * Neck carriage: the neck's direction changes smoothly from `base` at the withers to `top` at
 * the head (radians above the horizontal, in the world, given the body pitch `bodyUp`), the bend
 * mostly in the upper half; the head is carried at `head` (absolute pitch, + = nose up).
 * The rest neck rises at the anatomy's neckPitch with a level head.
 */
function neckCurve(pb, base, top, head, bodyUp = 0) {
  const ns = neckNames(pb.c);
  const n = ns.length;
  const rest = pb.c.anatomy.dims.neckPitch;
  let prev = rest + bodyUp;
  ns.forEach((name, i) => {
    const f = n > 1 ? i / (n - 1) : 0;
    const a = base + (top - base) * Math.pow(f, 1.5);
    pb.add(name, -(a - prev), 0, 0);
    prev = a;
  });
  // rest: the head is level while the neck rises at `rest`
  pb.add('head', -(head - (prev - rest)), 0, 0);
}

function jaw(pb, open = 0) {
  const g = pb.c.anatomy.head.gape0;
  pb.add('jaw', -g + open, 0, 0);
}

/** Lids: blink automatically from t, or a fixed closure 0..1. */
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
  const relax = o.lidRelax ?? 0.3;
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

/** Tail: droop at the base (rad), sway, curl to one side, lift. */
function tailCurve(pb, t, o = {}) {
  const ts = tailNames(pb.c);
  const n = ts.length;
  const sway = o.sway ?? 0.05, curl = o.curl ?? 0, droop = o.droop ?? 0, lift = o.lift ?? 0, sag = o.sag ?? 0;
  // sag: a further bend down spread over the first ~60% of the tail (a heavy tail hangs in an
  // arc and its end lies on the ground; groundTail lays it along the ground)
  const sw = ts.map((_, i) => { const f = i / (n - 1); return f < 0.03 || f > 0.5 ? 0 : Math.sin(Math.PI * (f - 0.03) / 0.47); });
  const swS = sw.reduce((a, b) => a + b, 0) || 1;
  ts.forEach((name, i) => {
    const f = i / (n - 1);
    const s = Math.sin(t * TAU * (o.swayHz ?? 0.07) - i * 0.22);
    // (a positive x rotation RAISES a backward-pointing bone: droop is negative)
    const base = i < 6 ? -(droop - 5 * deg) / 6 : 0;
    pb.add(name, base - sag * sw[i] / swS + lift * (1 - f) * 2 / n, (sway * s + curl * f) * 2.5 / n, 0);
  });
}

/** the drape (pre-relaxed folded membrane) for a ground fold */
function drape(pb, kind, amount = 1) { pb.u.drape = { L: [kind, amount], R: [kind, amount] }; pb.u.billowL = 0; pb.u.billowR = 0; }

function common(pb, o, t) {
  jaw(pb, o.jaw ?? 0);
  eyes(pb, ...(o.eyes || [0, 0]));
  lids(pb, t, o);
}

// --------------------------------------------------------------- poses
/** The rest pose (glide planform), mouth at its sculpted gape. */
export function rest(c, o = {}) {
  const pb = new PB(c);
  jaw(pb, o.jaw ?? c.anatomy.head.gape0);
  return pb.out({ ground: false });
}

/** The SCULPT bind configuration (debugging the body sculpt without skinning). */
export function sculpt(c, o = {}) {
  const pb = new PB(c);
  for (const [n, q] of Object.entries(c.anatomy.sculptLocal)) pb.quat(n, q);
  jaw(pb, o.jaw ?? 0);
  return pb.out({ ground: true });
}

/** Stand parameters per dragon (DESIGN stand: neck rise, head pitch, tail droop) */
function standParams(c) {
  const s = c.anatomy.design.stand;
  return { neckRise: s.neckRise * deg, neckTop: (s.neckTop ?? s.neckRise - 25) * deg, headPitch: s.headPitch * deg, tailDroop: s.tailDroop * deg, tailSag: (s.tailSag ?? 62) * deg, lean: s.forearmLean * deg, rise: s.humerusRise * deg };
}

/**
 * The ground stance with the body placed by `body` = { y (rig height offset), pitch (nose up,
 * rad), roll, yaw, z }, feet and wrist pads at the given offsets. Used by stand, walk, crouch,
 * lie, sit, rear, launch and land.
 */
function groundBase(c, o, t) {
  const pb = new PB(c);
  const A = c.anatomy, d = A.dims;
  const b = o.body || {};
  pb.rig.position = [b.x ?? 0, b.y ?? 0, b.z ?? 0];
  pb.rig.rotation = [-(b.pitch ?? 0), b.yaw ?? 0, b.roll ?? 0];
  if (b.lumbar) pb.add('lumbar', -b.lumbar, 0, 0);
  if (b.chest) pb.add('thorax', -b.chest, 0, 0);
  return pb;
}

/** Feet + wrist pads for a stance; offsets in metres relative to the defaults (root frame). */
function plantAll(pb, o = {}) {
  const c = pb.c, A = c.anatomy, d = A.dims, D = A.design;
  const F = solveFK(pb);
  const sp = standParams(c);
  const res = {};
  for (const [side, sd] of sides) {
    // feet under the hips (the heel below the hip joint)
    const lf = (o.feet && o.feet[side]) || {};
    const hip = F.P[`hl_${side}_0`];
    const ma = (lf.mtAng ?? D.leg.mtAng) * deg;
    const ball = [sd * Math.max(d.hipX * 1.08, d.footX ?? 0) + (lf.dx ?? 0), (lf.lift ?? 0) + d.toeL * 0.13, hip[2] - d.fem * 0.04 + d.mtl * Math.cos(ma) + (lf.dz ?? 0)];
    if (lf.at) { ball[0] = lf.at[0]; ball[1] = lf.at[1] + d.toeL * 0.13; ball[2] = lf.at[2]; }
    res[`foot${side}`] = legIK(pb, F, side, ball, { mtAng: lf.mtAng, fwd: lf.fwd ?? [sd * 0.1, 0, 1], pole: lf.pole, curl: lf.curl, toeDown: lf.toeDown });
    // wrist pads: a little outside the shoulder and behind it (the forearm leaning ~forearmLean)
    const wf = (o.wrists && o.wrists[side]) || {};
    const S = F.P[`w_${side}_0`];
    const w = A.wings.find((x) => x.side === side);
    const dzDef = -d.hum * Math.cos(sp.rise) + d.fore * Math.sin(sp.lean);
    const wy = (wf.lift ?? 0) + w.padDist * 0.92;
    const wp = wf.at ? [wf.at[0], wf.at[1] + w.padDist * 0.92, wf.at[2]] : [S[0] + sd * (d.wristR * 1.6 + (wf.dx ?? 0)), wy, S[2] + dzDef + (wf.dz ?? 0)];
    res[`wrist${side}`] = plantWing(pb, F, side, wp, { pole: wf.pole, ...(o.fold || {}) });
  }
  return res;
}

/**
 * (rev. 3) Parameters of the LOW stance per dragon (DESIGN 1.5c; design.stand.low overrides):
 * hipK = hip-joint height as a fraction of the leg's standing height (femur + tibia + the
 * metatarsus' rise), pitch = trunk pitch (deg, nose up), footFwd = ball of the foot ahead of the
 * hip joint (x trunk length), wristFwd / wristOut = the wrist pad ahead of / outside the shoulder
 * joint (x forearm length), neck base / top / head pitch (deg, world), tail sag (deg).
 */
function lowParams(c) {
  const D = c.anatomy.design;
  return { belly: 0.34, pitch: 4, footFwd: 0.16, footOut: 1.12, mtAng: D.leg.mtAng, neckBase: 14, neckTop: 2, headPitch: -8, tailLift: 2, tailSag: 26, tailCurl: 0.3,
    hum: [0.42, -0.02, 0.9], reach: 0.97, wristIn: 0.02, curl: D.fold?.lowCurl ?? [-6, 6, 18], inwardJ: D.fold?.lowInJ, ...(D.stand.low || {}) };
}

/**
 * The LOW stance (rev. 3, Daxtyn 2026-10-16: "make them low to the ground with their legs more
 * towards the center of their body"): the trunk carried low and nearly level, the two legs
 * planted under the middle of the body in a powerful crouch (knees forward under the belly,
 * hocks behind, the feet under the centre of mass), the folded wings' wrist pads and thumb claws
 * down in front beside the chest as supports (a bat's / pterosaur's / Game of Thrones wyvern's
 * carriage: the elbows stand up beside the withers like a cloak), the neck carried forward and
 * low, the heavy tail held low behind as the counterweight, its outer half on the ground.
 * Also the base of walk / crouch / launch / land. Options: bodyY (m, + = higher), bodyPitch
 * (rad, replaces the default), body {x, y, z, pitch, roll, yaw} (added), hipK, feet / wrists
 * ({ L|R: { dx, dz, lift, mtAng, at, fwd, pole } }), neckRise/neckTop/headPitch (rad), raise,
 * headDown, look, tailCurl, tailSag (rad).
 */
export function stand(c, o = {}) {
  const t = o.t ?? 0;
  const A = c.anatomy, d = A.dims, D = A.design;
  const LP = lowParams(c);
  const b = o.body || {};
  const pitch = (o.bodyPitch ?? LP.pitch * deg) + (b.pitch ?? 0);
  // (a slow weight shift from side to side while standing: a living animal is never still)
  const idle = o.drapeBuild || o.asym === 0 ? 0 : 1;
  const pb = groundBase(c, { body: { pitch, roll: (b.roll ?? 0) + 0.012 * wob(t * 0.19, 5) * idle, yaw: (b.yaw ?? 0) + 0.01 * wob(t * 0.13, 8) * idle, lumbar: b.lumbar, chest: b.chest } }, t);
  const ma0 = LP.mtAng * deg;
  const legH = d.fem + d.tib + d.mtl * Math.sin(ma0) + d.toeL * 0.13;
  {
    // place the rig: the chest carried low - its underside `belly` x the chest depth above the
    // ground (o.hipK instead puts the hip joint at that fraction of the leg's height) - the hip
    // joint at its rest station along z
    const F0 = solveFK(pb);
    const hip = F0.P.hl_L_0;
    let dy;
    if (o.hipK !== undefined) dy = o.hipK * legH - hip[1];
    else {
      const sc = d.trunkAt(0.25), rp = A.bonePos.rib_thorax, q = F0.Q.rib_thorax, P0 = F0.P.rib_thorax;
      const under = add(P0, qRot(q, [sc.c[0] - rp[0], sc.c[1] - sc.hh - rp[1], sc.c[2] - rp[2]]));
      dy = (o.belly ?? LP.belly) * 2 * sc.hh - under[1];
    }
    pb.rig.position = [b.x ?? 0, dy + (o.bodyY ?? 0) + (b.y ?? 0), d.hipZ - hip[2] + (b.z ?? 0)];
  }
  const calm = o.drapeBuild ? 0 : 1;
  const br = o.drapeBuild ? 0 : breathe(pb, t, o.breathe ?? (c.L > 20 ? 0.085 : c.L > 3 ? 0.16 : 0.4), c.L > 20 ? 0.02 : 0.025);
  const rise = (o.neckRise ?? LP.neckBase * deg) + (o.raise ?? 0);
  const top = (o.neckTop ?? LP.neckTop * deg) + (o.raise ?? 0) * 0.5 - (o.headDown ?? 0) * 1.4;
  neckCurve(pb, rise, top, (o.headPitch ?? LP.headPitch * deg) - (o.headDown ?? 0) * 0.6, pitch);
  const lk = o.look || [0, 0];
  look(pb, lk[0] + 0.03 * wob(t * 0.3, 1) * calm, lk[1] + 0.015 * br + 0.015 * wob(t * 0.25, 2) * calm);
  // the tail: the base carried low along the trunk line, sagging over its first half until the
  // outer part lies on the ground (groundTail), sweeping to one side
  {
    const ts = tailNames(c), n = ts.length;
    const lift = (o.tailLift ?? LP.tailLift * deg) + pitch;
    const sag = o.tailSag ?? LP.tailSag * deg;
    const curl = o.tailCurl ?? LP.tailCurl;
    const sw = ts.map((_, i) => { const f = i / (n - 1); return f < 0.04 || f > 0.6 ? 0 : Math.sin(Math.PI * (f - 0.04) / 0.56); });
    const swS = sw.reduce((a, q) => a + q, 0) || 1;
    ts.forEach((name, i) => {
      const f = i / (n - 1);
      const s = Math.sin(t * TAU * 0.05 - i * 0.22) * 0.03 * calm;
      pb.add(name, (i < 4 ? lift / 4 : 0) - sag * sw[i] / swS, (s + curl * Math.max(0, f - 0.25)) * 2.5 / n, 0);
    });
  }
  plantLow(pb, o, LP);
  common(pb, { ...o, jaw: (o.jaw ?? 0) + 0.012 * br }, t);
  drape(pb, 'stand');
  return pb.out({ groundTail: true });
}

/**
 * (fix round 1, the critics: the elbows stood up beside the withers like two posts / rabbit ears)
 * One folded wing planted the way a quadrupedal pterosaur or a vampire bat carries it: the upper
 * arm runs BACK (a little out, and up or down by hum[1]) along the side of the chest, so the
 * elbow sits on the upper flank below the back line; the forearm angles forward and down from it
 * to the wrist pad on the ground ahead of the shoulder (thumb forward along the ground); the hand
 * folds back up along the forearm and the fingers lie back along the flank in one bundle.
 * o.hum = [out, up, back] (trunk frame) gives the elbow target E0 = shoulder + humerus x dir; the
 * wrist goes where the forearm (x o.reach, < 1 leaves the elbow some slack) meets the ground from
 * E0, o.wristIn x forearm outside the elbow; o.dz/dx/lift offset it (walk), o.at places it.
 */
function plantBack(pb, F, side, o = {}) {
  const c = pb.c, A = c.anatomy, d = A.dims;
  const sd = side === 'L' ? 1 : -1;
  const S = F.P[`w_${side}_0`];
  const w = A.wings.find((x) => x.side === side);
  const qT = F.Q.thorax;
  const hb = o.hum || [0.42, 0.1, 0.9];
  // a step (o.dz, the walk) swings the whole arm fore and aft about the shoulder - the elbow moves
  // with the wrist (o.swing of the offset) - instead of folding the elbow up above the back when
  // the wrist is behind its rest place (or flattening the arm when it is ahead)
  const sw = (o.dz ?? 0) * (o.swing ?? 0.8);
  const hDir = norm(qRot(qT, [sd * hb[0], hb[1], -hb[2]]));
  const hDirS = norm(qRot(qT, [sd * hb[0], hb[1], -hb[2] - sw / d.hum]));
  const E0 = add(S, scale(hDir, d.hum));
  const padY = w.padDist * (o.padK ?? 0.92) + (o.padLift ?? 0) * d.wristR;
  const dyF = E0[1] - padY;
  const dxF = sd * d.fore * (o.wristIn ?? 0.02);
  const fr = d.fore * (o.reach ?? 0.97);
  const horiz = Math.sqrt(Math.max((fr * 0.2) ** 2, fr * fr - dyF * dyF - dxF * dxF));
  const f3 = qRot(qT, [0, 0, 1]);
  const fz = norm([f3[0], 0, f3[2]]);
  const wp = o.at ? [o.at[0], o.at[1] + w.padDist * 0.92, o.at[2]]
    : [E0[0] + dxF + fz[0] * horiz + sd * (o.dx ?? 0), padY + (o.lift ?? 0), E0[2] + fz[2] * horiz + (o.dz ?? 0)];
  // (the wrist lands exactly where the gait puts it; the swung humerus only steers the elbow)
  const pole = o.pole ? add(qRot(qT, [sd * o.pole[0], o.pole[1], o.pole[2]]), [0, 0.3, 0]) : scale(hDirS, d.hum);
  return plantWing(pb, F, side, wp, { pole, ...(o.fold || {}) });
}

/** Feet under the middle of the body and the wrist pads down in front (the low stance's contacts). */
function plantLow(pb, o, LP) {
  const c = pb.c, A = c.anatomy, d = A.dims, D = A.design;
  const F = solveFK(pb);
  const res = {};
  for (const [side, sd] of sides) {
    const lf = (o.feet && o.feet[side]) || {};
    const hip = F.P[`hl_${side}_0`];
    const ma = (lf.mtAng ?? LP.mtAng) * deg;
    // the ball of the foot a little ahead of the hip joint (the knee forward under the belly,
    // the hock behind), the feet a little wider than the hips
    // (a little asymmetry - one foot and the opposite wrist slightly ahead - a mirror-symmetric
    // stance read as a statue)
    const asym = (o.asym ?? LP.asym ?? 1) * sd;
    const ball = [sd * Math.max(d.hipX * LP.footOut, d.footX ?? 0) + (lf.dx ?? 0), d.toeL * 0.13 + (lf.lift ?? 0), hip[2] + d.T * (LP.footFwd + 0.035 * asym) + (lf.dz ?? 0)];
    if (lf.at) { ball[0] = lf.at[0]; ball[1] = lf.at[1] + d.toeL * 0.13; ball[2] = lf.at[2]; }
    res[`foot${side}`] = legIK(pb, F, side, ball, { mtAng: lf.mtAng ?? LP.mtAng, fwd: lf.fwd ?? [sd * 0.1, 0, 1], pole: lf.pole ?? [sd * 0.3, 0.1, 1], curl: lf.curl ?? 0.06, toeDown: lf.toeDown });
    // the wrist pad on the ground ahead of the shoulder; the elbow back on the upper flank below
    // the back line, the hand folded back up along the forearm (plantBack)
    const wf = (o.wrists && o.wrists[side]) || {};
    res[`wrist${side}`] = plantBack(pb, F, side, { hum: LP.hum, reach: LP.reach, wristIn: LP.wristIn, padLift: (LP.wristLift ?? 0), dz: (wf.dz ?? 0) - 0.04 * asym * d.fore, dx: wf.dx, lift: wf.lift, at: wf.at, pole: wf.pole,
      fold: { curl: LP.curl, inwardJ: LP.inwardJ, mcFan: 0, fanDown: 0, handBack: 3, levelK: true, ...(D.fold?.low || {}), ...(o.fold || {}) } });
  }
  return res;
}

/**
 * The wing folded tight against the body for standing on the two legs (DESIGN rev. 2, a
 * vulture's or a resting bat's fold): the upper arm back and down along the side of the chest,
 * the elbow low behind the shoulder, the forearm up and forward so the wrist (with the thumb
 * claw) sits high beside the neck base; the hand folded back down along the forearm, the
 * knuckles by the elbow, the fingers pressed together in one bundle back along the flank to the
 * thigh, the membrane gathered between them. Nothing touches the ground.
 */
function foldUp(pb, F, side, o = {}) {
  const c = pb.c, A = c.anatomy, d = A.dims, D = A.design;
  const sd = side === 'L' ? 1 : -1;
  const qT = F.Q.thorax;
  const S = F.P[`w_${side}_0`];
  const U = D.fold?.up || {};
  const el = (o.elbow ?? U.elbow ?? 30) * deg;
  const dist = Math.sqrt(d.hum * d.hum + d.fore * d.fore - 2 * d.hum * d.fore * Math.cos(el));
  // (directions in the root frame - level ground, whatever the trunk's pitch: the forearm rises
  // ~25 degrees from the elbow low on the flank to the wrist beside the base of the neck)
  const wd = norm(o.wristDir ?? U.wrist ?? [0.48, 0.28, 0.8]);
  const W = add(S, scale([sd * wd[0], wd[1], wd[2]], dist));
  const pole = norm([sd * (o.poleOut ?? U.poleOut ?? 0.45), -0.6, -0.65]);
  const arm = armIK(pb, F, side, W, pole, o.minTwist ?? true);
  foldHand(pb, side, arm, qT, { handBack: U.handBack ?? 4, mcFan: U.mcFan ?? 0.3, fanDown: U.fanDown ?? 0.0, curl: U.curl ?? [-12, 6, 28], inward: U.inward ?? 0.06, wrap: U.wrap ?? 0.04, outUp: U.outUp ?? 0.45, ...o });
  // the thumb folded back against the wrist (toward the elbow): raised forward it read as a fist
  pb.add(`w_${side}_th`, 0.1, sd * -(o.thumbFold ?? U.thumbFold ?? 1.9), 0);
  return arm;
}

/**
 * (rev. 3) RETIRED as a resting stance: Daxtyn asked for low dragons with the legs under the
 * middle of the body (2026-10-16), so the rev. 2 upright, trunk-raised stance is gone. Kept as an
 * alias of the low stance for older callers.
 */
export function upright(c, o = {}) {
  return stand(c, o);
}

/**
 * Lateral-sequence walk (left foot, left wrist, right foot, right wrist; duty factor ~0.7; the
 * wrist pads land outside the feet). The root stays: the scene moves it forward by speed * t
 * (the planted feet then stay still on the ground). o.speed (m/s; default from the size).
 */
export function walk(c, o = {}) {
  const t = o.t ?? 0;
  const L = c.L;
  const speed = o.speed ?? (L > 20 ? 2.0 : L > 5 ? 1.6 : 0.5);
  const freq = o.freq ?? (L > 50 ? 0.23 : L > 20 ? 0.32 : L > 5 ? 0.85 : 0.8);   // (fix round 1: Leaf 0.6 -> 0.85 Hz, shorter steps for the folded-back arm)
  const stride = speed / freq;
  const duty = o.duty ?? 0.7;
  const ph = (off) => fract(t * freq + off);
  // contact offset along z for a limb at phase p: in stance the contact moves back at exactly the
  // walking speed (so it stays put on the ground while the root moves), the swing brings it forward
  // (rev. 3: the stance used to slide back at speed / duty - the planted feet skated)
  const exc = stride * duty;
  const zOff = (p) => p < duty ? exc * (0.5 - p / duty) : exc * (-0.5 + (p - duty) / (1 - duty));
  const lift = (p, h) => p < duty ? 0 : h * Math.sin(Math.PI * (p - duty) / (1 - duty));
  const d = c.anatomy.dims;
  const feet = {}, wrists = {};
  for (const [side, off] of [['L', 0], ['R', 0.5]]) {
    const pf = ph(off), pw = ph(off + 0.25);
    feet[side] = { dz: zOff(pf), lift: lift(pf, d.toeL * 0.35) };
    // (fix round 1) the wrists step in a range shifted forward: with the elbow folded back, a wrist
    // set down behind its resting place forces the elbow up above the back (the forearm is far
    // longer than the shoulder height)
    // a shorter wrist stance (duty ~0.55: the wing-hand is lifted longer) keeps the reach in range
    const dW = o.wristDuty ?? 0.55, excW = stride * dW;
    const zW = (p) => p < dW ? excW * (0.5 - p / dW) : excW * (-0.5 + (p - dW) / (1 - dW));
    const liftW = (p, h) => p < dW ? 0 : h * Math.sin(Math.PI * (p - dW) / (1 - dW));
    wrists[side] = { dz: zW(pw) + excW * (o.wristShift ?? 0.22), lift: liftW(pw, d.wristR * 1.4) };
  }
  // the body rolls and pitches a little with the steps; the neck counter-swings, the tail swings
  const sway = Math.sin(TAU * t * freq) * 0.025;
  const bob = Math.cos(TAU * t * freq * 2) * L * 0.0015;
  const p = stand(c, { ...o, asym: 0, body: { roll: sway, y: bob, pitch: 0.01 * Math.sin(TAU * t * freq * 2) }, feet, wrists, look: [(o.look?.[0] ?? 0) - sway * 1.5, o.look?.[1] ?? 0], tailCurl: (o.tailCurl ?? 0.1) - sway * 6 });
  return p;
}

/** Up on the hind legs (look over something, threaten, the start of a landing flare). o.k 0..1 */
export function rear(c, o = {}) {
  const t = o.t ?? 0;
  const k = clamp(o.k ?? 1, 0, 1);
  const d = c.anatomy.dims;
  const pitch = (o.pitch ?? 0.95) * k;
  const pb = groundBase(c, { body: { pitch, y: Math.sin(pitch) * d.T * 0.12 } }, t);
  breathe(pb, t, 0.25, 0.03);
  neckCurve(pb, mix(0.6, 0.2, k), mix(0.95, 0.5, k), (o.headPitch ?? -0.15), pitch);
  look(pb, ...(o.look || [0, 0]));
  tailCurve(pb, t, { sway: 0.02, droop: mix(0.4, 0.95, k), curl: 0.1 });
  const F = solveFK(pb);
  for (const [side, sd] of sides) {
    const hip = F.P[`hl_${side}_0`];
    legIK(pb, F, side, [sd * Math.max(d.hipX * 1.2, (d.footX ?? 0) * 1.1), d.toeL * 0.13, hip[2] + d.mtl * 0.4], { mtAng: 50 });
  }
  // wings half open for balance (blended toward the spread wing)
  const half = o.wingOpen ?? 0.5;
  for (const [side, sd] of sides) {
    pb.add(`w_${side}_0`, 0.1, sd * 0.6 * (1 - half), sd * (0.35 - 0.4 * half), 'YZX');
    pb.add(`w_${side}_1`, 0, sd * -0.9 * (1 - half), 0, 'YZX');
    pb.add(`w_${side}_2`, 0, sd * 1.4 * (1 - half), 0, 'YZX');
  }
  pb.u.billowL = pb.u.billowR = 0.1;
  common(pb, o, t);
  return pb.out({ groundTail: true });
}

/**
 * Dog-like sit on the haunches (Leaf, 1B). (rev. 3) With the hips under the middle of the body
 * the rump behind them (pelvis, tail base) rests on the ground, the trunk raised ~45 degrees
 * about it, the thighs folded forward along the flanks, the feet flat beside the haunches, the
 * folded wings' wrists planted in front like a dog's forelegs (the same wing-walk fold as the
 * low stance; o.plantWrists = false folds them off the ground instead), the tail curled round.
 */
export function sit(c, o = {}) {
  const t = o.t ?? 0;
  const A = c.anatomy, d = A.dims;
  // (a lazy, low dog's sit: the chest only ~30 degrees up, so he never reads as an upright biped)
  const pitch = o.pitch ?? 30 * deg;
  const pb = groundBase(c, { body: { pitch } }, t);
  const br = o.drapeBuild ? 0 : breathe(pb, t, o.breathe ?? 0.2, 0.025);
  neckCurve(pb, (o.neckBase ?? 0.42) + (o.raise ?? 0), (o.neckTop ?? 0.45) - (o.headDown ?? 0) * 1.2, (o.headPitch ?? -0.2) - (o.headDown ?? 0) * 0.5, pitch);
  const lk = o.look || [0, 0];
  look(pb, lk[0] + 0.04 * wob(t * 0.35, 3) * (o.drapeBuild ? 0 : 1), lk[1] + 0.02 * br);
  // tail: the base laid back down along the ground behind the rump, then curled round the side
  const ts = tailNames(c);
  ts.forEach((n, i) => {
    const f = i / (ts.length - 1);
    pb.add(n, i < 3 ? (pitch * 0.95) / 3 : 0.0, (o.tailCurl ?? 0.16 + 0.02 * Math.sin(t * 0.6 - i * 0.3)) * f * 1.7, 0);
  });
  // the rump on the ground: the lowest point of the trunk behind the hips and of the tail base
  {
    const F0 = solveFK(pb);
    let minY = Infinity;
    for (const s of [0.75, 0.88, 1.0]) {
      const sc = d.trunkAt(s), rp = A.bonePos.rib_lumbar;
      const p = add(F0.P.rib_lumbar, qRot(F0.Q.rib_lumbar, [sc.c[0] - rp[0], sc.c[1] - sc.hh - rp[1], sc.c[2] - rp[2]]));
      minY = Math.min(minY, p[1]);
    }
    for (let i = 0; i < 4; i++) minY = Math.min(minY, F0.P[ts[i]][1] - c.anatomy.tailR(i / ts.length) * 0.95);
    const hip = F0.P.hl_L_0;
    pb.rig.position = [0, -minY + d.T * 0.01, d.hipZ - hip[2] - d.T * 0.08];
  }
  const F = solveFK(pb);
  for (const [side, sd] of sides) {
    // feet flat beside the haunch, toes forward: the thigh folds forward along the flank
    const hip = F.P[`hl_${side}_0`];
    legIK(pb, F, side, [sd * Math.max(d.hipX * 1.35, (d.footX ?? 0) * 1.2), d.toeL * 0.13, hip[2] + d.fem * 0.8], { mtAng: 10, fwd: [sd * 0.15, 0, 1], pole: [sd * 0.45, 0.8, 0.4], curl: 0.08 });
    if (o.plantWrists !== false) {
      // wrists planted in front, the elbows back along the flanks (fix round 1: not up beside
      // the withers), the fingers back along the flank
      plantBack(pb, F, side, { hum: o.hum ?? [0.5, 0.05, 0.85], reach: 0.96, wristIn: 0.0, fold: { curl: [-26, -10, 10], mcFan: 0, fanDown: 0, handBack: 3, levelK: true, ...(o.fold || {}) } });
    } else {
      foldUp(pb, F, side, { curl: [-26, -8, 18], wristDir: [0.5, 0.15, 0.85], ...(o.fold || {}) });
    }
  }
  common(pb, { ...o, jaw: (o.jaw ?? 0) + 0.01 * br }, t);
  drape(pb, 'sit');
  return pb.out({ groundTail: true });
}

/** Crouch: the low stance sinking further, chest down between the wrists, legs gathered (mounting; the first move of a launch). o.k 0..1 */
export function crouch(c, o = {}) {
  const k = clamp(o.k ?? 1, 0, 1);
  const d = c.anatomy.dims;
  const LP = lowParams(c);
  const ma = mix(LP.mtAng, LP.crouchMt ?? 28, k);
  const p = stand(c, {
    ...o, belly: mix(LP.belly, LP.crouchBelly ?? 0.08, k), bodyPitch: mix(LP.pitch * deg, -0.05, k),
    neckRise: mix(LP.neckBase * deg, 0.1, k), neckTop: mix(LP.neckTop * deg, 0.04, k), headPitch: mix(LP.headPitch * deg, -0.22, k),
    feet: { L: { dz: -d.mtl * 0.2 * k, mtAng: ma }, R: { dz: -d.mtl * 0.2 * k, mtAng: ma } },
    wrists: { L: { dz: d.fore * 0.1 * k, dx: d.wristR * 1.2 * k }, R: { dz: d.fore * 0.1 * k, dx: d.wristR * 1.2 * k } },
  });
  if (k > 0.5) p.uniforms.drape = { L: ['crouch', 1], R: ['crouch', 1] };
  return p;
}

/**
 * Resting on the belly (sphinx): hind legs folded under, wrists forward under the chest, the
 * folded wings like a tent along the flanks, the neck curved round, chin low. o.sprawl = 1:
 * too weak to tuck the legs under (the newborn): legs splayed out to the sides.
 */
export function lie(c, o = {}) {
  const t = o.t ?? 0;
  const A = c.anatomy, d = A.dims;
  // lower the body until the chest and belly rest on the ground
  const sc = d.trunkAt(0.45);
  const bellyY = sc.c[1] - sc.hh;
  const pb = groundBase(c, { body: { y: -bellyY + d.T * 0.012, pitch: o.bodyPitch ?? 0.02 } }, t);
  const br = o.drapeBuild ? 0 : breathe(pb, t, o.breathe ?? (c.L > 20 ? 0.07 : c.L > 3 ? 0.15 : 0.6), 0.032);
  neckCurve(pb, (o.neckBase ?? 0.25) + (o.raise ?? 0), (o.neckTop ?? 0.2) - (o.headDown ?? 0.1), (o.headPitch ?? -0.12) - (o.headDown ?? 0.1) * 0.5, o.bodyPitch ?? 0.02);
  const lk = o.look || [0, 0];
  look(pb, lk[0] + 0.03 * wob(t * 0.2, 4) * (o.drapeBuild ? 0 : 1), lk[1]);
  tailCurve(pb, t, { sway: 0.025, droop: 0.15, curl: o.tailCurl ?? 0.55, swayHz: 0.04 });
  const F = solveFK(pb);
  const sprawl = o.sprawl ?? 0;
  for (const [side, sd] of sides) {
    const hip = F.P[`hl_${side}_0`];
    const S = F.P[`w_${side}_0`];
    const w = A.wings.find((x) => x.side === side);
    if (sprawl) {
      // splayed out to the sides, soles down, toes slack
      legIK(pb, F, side, [sd * (d.hipX + d.fem * 1.1), d.toeL * 0.13, hip[2] + d.fem * 0.25], { mtAng: 10, fwd: [sd * 0.7, 0, 0.7], pole: [sd, 0.6, 0.2], curl: -0.05 });
      // (fix round 1: the splayed arm showed the fingers as a rake beside a flat flap) the wing
      // folded back along the flank like the adults', the wrist and thumb down a little out to
      // the side (too weak to gather the elbows in)
      plantBack(pb, F, side, { hum: [0.75, -0.1, 0.65], reach: 0.95, wristIn: 0.12, padK: 0.85, fold: { curl: [-8, 10, 30], mcFan: 0, fanDown: 0, handBack: 3, levelK: true, outUp: 0.3, ...(o.fold || {}) } });
    } else {
      // folded under: the foot flat beside the belly, the knee forward and up along the flank
      legIK(pb, F, side, [sd * Math.max(d.hipX * 1.25, (d.footX ?? 0) * 1.15), d.toeL * 0.13, hip[2] + d.fem * 0.75], { mtAng: 4, fwd: [sd * 0.12, 0, 1], pole: [sd * 0.5, 0.75, 0.45], curl: 0.05 });
      // (fix round 1: the forearms lay forward like a lion's forelegs - a sphinx) the upper arm
      // back along the flank, the forearm low along the side of the chest to the wrist pad beside
      // the base of the neck, the hand folded back along it, the fingers back along the flank
      plantBack(pb, F, side, { hum: o.hum ?? [0.5, 0.1, 0.86], reach: 0.98, wristIn: -0.02, padK: 0.75, fold: { curl: [-2, 14, 30], mcFan: 0, fanDown: 0, handBack: 3, levelK: true, outUp: 0.35, ...(o.fold || {}) } });
      void S; void w;
    }
  }
  common(pb, { ...o, lidRelax: o.lidRelax ?? 0.5 }, t);
  drape(pb, 'lie');
  return pb.out({ groundTail: true, groundBody: true });
}

/** The newborn pushes up on its wrists and thumbs, trembling (o.k 0..1 = how far up). */
export function pushUp(c, o = {}) {
  const t = o.t ?? 0;
  const k = clamp(o.k ?? 1, 0, 1);
  const d = c.anatomy.dims;
  const tremble = (o.tremble ?? 1) * (Math.sin(t * 37) * 0.6 + Math.sin(t * 53 + 1) * 0.4) * 0.012 * k;
  const p = lie(c, { ...o, sprawl: 1, body: undefined, bodyPitch: 0.15 * k + tremble, raise: 0.25 * k, headDown: mix(0.15, -0.05, k) });
  p.rig.position = [p.rig.position[0], p.rig.position[1] + k * d.shH * 0.45, p.rig.position[2]];
  return p;
}

/**
 * The newborn's weak struggle (1A), pure in t: lies sprawled and breathes fast, tries to push up
 * (the arms tremble, the head too heavy), lifts the chest a few cm, a wrist slips and it rolls a
 * little onto its side, rests; repeats more weakly.
 */
export function struggle(c, o = {}) {
  const t = o.t ?? 0;
  const cyc = o.period ?? 6.5;
  const u = fract(t / cyc), n = Math.floor(t / cyc);
  const strength = Math.pow(0.7, n);
  const up = u < 0.15 ? 0 : u < 0.45 ? smooth(0.15, 0.45, u) : u < 0.55 ? 1 : u < 0.62 ? 1 - smooth(0.55, 0.62, u) : 0;
  const k = up * strength * (o.k ?? 1);
  const slip = u > 0.55 && u < 0.85 ? Math.sin(Math.PI * (u - 0.55) / 0.3) : 0;
  const p = pushUp(c, { ...o, k, breathe: mix(0.65, 0.45, k), look: [(o.look?.[0] ?? 0.2) + 0.15 * slip, (o.look?.[1] ?? -0.05) - 0.1 * slip], lidRelax: 0.45 });
  // the slip: rolls a little onto its side
  p.rig.rotation = [p.rig.rotation[0], p.rig.rotation[1], (p.rig.rotation[2] || 0) + 0.18 * slip * strength];
  return p;
}

/**
 * The fire posture (1.10 / 1F): head low and forward along the line of fire, a deep inhale
 * first (the chest rises), the jaw opening to 25-30 deg, then the jet (fire.js). o.t = time
 * from the command; o.aim = [yaw, pitch].
 */
export function fire(c, o = {}) {
  const t = o.t ?? 0;
  const inhale = smooth(0, 0.8, t) * (1 - smooth(0.9, 1.2, t));
  const open = smooth(0.75, 1.0, t) * (o.gape ?? 0.48);
  const aim = o.aim || [0, 0];
  // (rev. 3) from the low stance: the chest lifted a little on the planted wrists, the neck
  // stretched forward and low along the line of fire, the head level with it
  const p = stand(c, { ...o, t, breathe: 0, bodyPitch: (o.pitch ?? 0.1) + 0.04 * inhale, bodyY: o.bodyY ?? 0, neckRise: (o.neckBase ?? 16) * deg, neckTop: (o.neckTop ?? -2) * deg,
    headPitch: ((o.headPitch ?? -4) * deg) + aim[1], look: [aim[0], 0], jaw: open, blink: false, lidRelax: 0.45 });
  const k = 1 + 0.05 * inhale;
  p.scale.rib_thorax = [k, 1 + 0.07 * inhale, 1];
  p.scale.rib_body = [1 + 0.035 * inhale, 1 + 0.045 * inhale, 1];
  return p;
}

// ----------------------------------------------------------------- air
/**
 * Flapping at cycle position cyc (0..1, 0 = top of the upstroke). The downstroke takes `down`
 * of the cycle with the wing pronated (leading edge down); on the upstroke the elbow and wrist
 * flex and the hand sweeps up and back; fingers spread on the downstroke.
 */
function wingFlap(pb, cyc, o = {}) {
  const D = o.down ?? 0.57;
  const amp = o.amp ?? 0.8, center = o.center ?? 0.08;
  const nF = pb.c.anatomy.wings[0].fingers.length;
  const phiOf = (cy) => { const c2 = fract(cy); return c2 < D ? Math.PI * c2 / D : Math.PI + Math.PI * (c2 - D) / (1 - D); };
  const phi = phiOf(cyc);
  const elev = center + amp * Math.cos(phi);
  const sweep = -0.12 * Math.sin(phi);
  const pron = 0.2 * Math.sin(phi);
  const pu = phiOf(cyc - 0.06);
  const up = pu > Math.PI ? Math.sin(pu - Math.PI) : 0;
  const pd = phiOf(cyc - 0.03);
  const downSpread = pd < Math.PI ? Math.sin(pd) : 0;
  const asym = o.asym ?? 0;
  const flex = o.flex ?? 1;
  for (const [sd, s] of sides) {
    const k = sd === 'L' ? 1 + asym : 1 - asym;
    pb.add(`w_${sd}_0`, pron, s * (sweep + 0.16 * up * flex), s * elev * k, 'YZX');
    pb.add(`w_${sd}_1`, 0, s * (-0.5 * up * flex - 0.04), s * (0.22 * up * flex), 'YZX');
    pb.add(`w_${sd}_2`, 0, s * (0.7 * up * flex + 0.03), s * (-0.32 * up * flex), 'YZX');
    for (let d = 0; d < nF; d++) {
      const f = nF > 1 ? d / (nF - 1) : 0;
      pb.add(`w_${sd}_f${d}_0`, 0.04 * f * downSpread, s * (0.3 * f * up * flex - 0.05 * f * downSpread), s * (-0.05 * up * f), 'YZX');
      // the outer phalanges bend a little up at the bottom of the downstroke (load), back on the upstroke
      pb.add(`w_${sd}_f${d}_1`, 0, s * 0.06 * up * flex, s * 0.04 * downSpread, 'YZX');
    }
  }
  pb.u.billowL = 0.6 * downSpread - 0.35 * up;
  pb.u.billowR = 0.6 * downSpread - 0.35 * up;
  return { phi, up, downSpread };
}

/** Legs carried in flight: trailing back under the tail (the rest pose), toes curled, a little stroke-coupled motion. */
function flightLegs(pb, o = {}) {
  const k = o.tuck ?? -1;          // toes clenched (negative x flexes them toward the sole)
  const s = o.stroke ?? 0;
  // the legs drawn together under the tail (the rest pose spreads them for the membrane)
  pb.sym('hl_#_0', -0.06 * s, 0.18 * (o.together ?? 1), 0);
  pb.sym('hl_#_1', 0.05 * s, 0, 0);
  for (let i = 0; i < 4; i++) pb.sym(`hl_#_t${i}`, i === 0 ? -0.3 * k : 0.55 * k, 0, 0);
}

/** Flapping flight. Tempo from the creature's size (config.flapHz) unless o.hz is given. */
export function flight(c, o = {}) {
  const t = o.t ?? 0;
  const pb = new PB(c);
  const hz = o.hz ?? c.config.flapHz ?? 1;
  const cyc = fract(t * hz + (o.phase ?? 0));
  const corr = o.corr ?? 0;
  const asym = corr * 0.16 * wob(t * hz * 0.7, 5);
  const ampJ = 1 + corr * 0.15 * wob(t * hz * 0.9, 6);
  const w = wingFlap(pb, cyc, { amp: (o.amp ?? c.config.flapAmp ?? 0.8) * ampJ, center: o.center ?? 0.06, asym, flex: o.flex });
  flightLegs(pb, { stroke: Math.cos(w.phi), tuck: o.legTuck, together: o.legsTogether });
  // the body: lifted during the downstroke, a slight pitch oscillation; the neck keeps the head steady
  const bob = Math.sin(w.phi - 0.7);
  const pitch = 0.04 * Math.cos(w.phi);
  pb.rig.position = [0, -(o.bobAmp ?? 0.01) * c.L * bob, 0];
  pb.rig.rotation = [(o.bodyPitch ?? 0) + pitch, o.yaw ?? 0, o.bank ?? 0];
  neckCurve(pb, (o.neckBase ?? 0.12), (o.neckTop ?? 0.06), (o.headPitch ?? -0.05), -((o.bodyPitch ?? 0) + pitch));
  const lk = o.look || [0, 0];
  look(pb, lk[0], lk[1], -(o.bank ?? 0) * 0.5);
  common(pb, { ...o, lidRelax: o.lidRelax ?? 0.3 }, t);
  breathe(pb, t, hz * 0.5, 0.018);
  const ts = tailNames(c);
  ts.forEach((n, i) => {
    const f = i / (ts.length - 1);
    pb.add(n, 0.05 * Math.sin(w.phi - 1.2 - i * 0.25) * f * 8 / ts.length - 0.03 / ts.length, (o.bank ?? 0) * 0.6 * f * 2 / ts.length, 0);
  });
  return pb.out({ ground: false });
}

/** Glide: wings held out with dihedral at the arm and a droop at the hand, small corrections; bank rolls the body. */
export function glide(c, o = {}) {
  const t = o.t ?? 0;
  const pb = new PB(c);
  const bank = o.bank ?? 0;
  const cr = (o.corr ?? 1) * 0.03;
  const nF = c.anatomy.wings[0].fingers.length;
  for (const [sd, s] of sides) {
    const inner = (bank > 0) === (sd === 'L') ? Math.abs(bank) : 0;    // inner wing of the turn flexes a little
    pb.add(`w_${sd}_0`, 0.03 + cr * wob(t * 0.8, sd === 'L' ? 1 : 2), s * (0.03 + 0.14 * inner), s * ((o.dihedral ?? 0.1) + cr * wob(t * 0.6, sd === 'L' ? 3 : 4) - 0.18 * inner), 'YZX');
    pb.add(`w_${sd}_1`, 0, s * (-0.05 - 0.2 * inner), 0, 'YZX');
    pb.add(`w_${sd}_2`, 0, s * (0.04 + 0.24 * inner), s * -(o.droop ?? 0.05), 'YZX');
    for (let d = 0; d < nF; d++) pb.add(`w_${sd}_f${d}_1`, 0, 0, s * -0.03, 'YZX');
  }
  pb.u.billowL = 0.35; pb.u.billowR = 0.35;
  flightLegs(pb, { tuck: o.legTuck, together: o.legsTogether });
  pb.rig.rotation = [o.bodyPitch ?? 0, o.yaw ?? 0, bank];
  neckCurve(pb, (o.neckBase ?? 0.1), (o.neckTop ?? 0.05), (o.headPitch ?? -0.05), -(o.bodyPitch ?? 0));
  const lk = o.look || [0, 0];
  look(pb, lk[0] + 0.02 * wob(t * 0.4, 7), lk[1], -bank * 0.55);
  common(pb, { ...o, lidRelax: o.lidRelax ?? 0.3 }, t);
  breathe(pb, t, 0.25, 0.015);
  const ts = tailNames(c);
  ts.forEach((n, i) => { const f = i / (ts.length - 1); pb.add(n, 0.01 * Math.sin(t * 0.9 - i * 0.2) * f, bank * 0.7 * f * 2 / ts.length, 0); });
  return pb.out({ ground: false });
}

/**
 * The stoop (Starlight's dive-bomb, 3C): wings half folded into an "M" - elbows in, the hands
 * swept back (a peregrine's / gannet's stoop). o.fold 0 (glide) .. 1 (tight).
 */
export function dive(c, o = {}) {
  const f = clamp(o.fold ?? 0.6, 0, 1);
  const p = glide(c, { ...o, dihedral: 0.04 });
  const pb = new PB(c);
  copyInto(pb, p);
  for (const [sd, s] of sides) {
    pb.add(`w_${sd}_0`, 0.08 * f, s * 1.1 * f, s * 0.1 * f, 'YZX');
    pb.add(`w_${sd}_1`, 0, s * -1.75 * f, s * 0.12 * f, 'YZX');
    pb.add(`w_${sd}_2`, 0, s * 1.95 * f, s * -0.08 * f, 'YZX');
    const nF = c.anatomy.wings[0].fingers.length;
    for (let d = 0; d < nF; d++) pb.add(`w_${sd}_f${d}_0`, 0, s * -0.12 * f * d, 0, 'YZX');
    // the legs drawn in tight under the tail base, the feet clenched (a stooping raptor)
    pb.add(`hl_${sd}_0`, 0.2 * f, s * 0.32 * f, 0);
    pb.add(`hl_${sd}_1`, -0.25 * f, 0, 0);
    pb.add(`hl_${sd}_2`, 0.35 * f, 0, 0);
    for (let i = 0; i < 4; i++) pb.add(`hl_${sd}_t${i}`, i === 0 ? -0.35 * f : 0.6 * f, 0, 0);
  }
  pb.u.billowL = pb.u.billowR = 0.1 + 0.2 * (1 - f);
  pb.rig = { ...p.rig };
  return pb.out({ ground: false });
}

/**
 * The strike (Starlight over Cling, 3C): legs swung forward under the body, raptor toes spread
 * (k 0..0.6) then closing (k -> 1); wings opened hard (the "crushing" spread); tail low.
 */
export function strike(c, o = {}) {
  const t = o.t ?? 0;
  const k = clamp(o.k ?? 0.5, 0, 1);
  const p = flight(c, { ...o, phase: o.phase ?? 0.35, amp: (c.config.flapAmp ?? 0.7) * 0.9, bodyPitch: -(o.pitchUp ?? 0.35) });
  const pb = new PB(c);
  copyInto(pb, p);
  const d = c.anatomy.dims;
  pb.rig = { ...p.rig };
  const F = solveFK(pb);
  for (const [side, sd] of sides) {
    const hip = F.P[`hl_${side}_0`];
    // talons reach forward and down below the chest (in the body's frame)
    const qb = F.Q.pelvis;
    const tgt = add(hip, qRot(qb, [sd * d.hipX * 0.6, -(d.fem + d.tib) * 0.7, (d.fem + d.tib) * 0.55]));
    legIK(pb, F, side, tgt, { mtAng: 70, fwd: qRot(qb, [sd * 0.1, -0.5, 1]), pole: qRot(qb, [sd * 0.3, 0.6, 1]), curl: mix(-0.35, 0.9, smooth(0.6, 1, k)) });
  }
  const ts = tailNames(c);
  ts.forEach((n, i) => { if (i < 8) pb.add(n, 0.05, 0, 0); });
  return pb.out({ ground: false });
}

/** The scout's sprint: short fast beats (1.4-1.6 Hz), the neck pulled back in an S, legs streamlined. */
export function sprint(c, o = {}) {
  return flight(c, { ...o, hz: o.hz ?? 1.5, amp: o.amp ?? 0.55, flex: 0.7, neckBase: -0.05, neckTop: 0.18, headPitch: -0.04, bobAmp: 0.005 });
}

/**
 * Charcoal holding Leaf's head (1D): in a glide, the neck curls round so the head faces Leaf
 * beside it (o.side 1 = to his left), the jaws open to 45 deg and close to a 25 deg holding gape
 * (o.t from the move: 0-0.6 s turn, 0.6-1.0 open, 1.0-1.4 close and hold; o.release from
 * which the jaws open again).
 */
export function mouthHold(c, o = {}) {
  const t = o.t ?? 0;
  const sd = o.side ?? 1;
  const turn = smooth(0, 0.8, t) * (o.turn ?? 1.6);
  const rel = o.release !== undefined ? smooth(o.release, o.release + 0.4, t) : 0;
  const hold = o.hold ?? 0.44;
  const gape = mix(smooth(0.6, 1.0, t) * 0.8 - smooth(1.0, 1.4, t) * (0.8 - hold), 0.7, rel);
  const p = glide(c, { ...o, yaw: 0, look: [sd * turn, (o.pitch ?? 0.05)], jaw: gape, blink: false, lidRelax: 0.35 });
  return p;
}

// ---------------------------------------------------------- transitions
/**
 * Take-off (DESIGN 2.8 / 1.7), o.t from the start: (1) crouch, the chest drops between the
 * wrists, the hind legs gather; (2) the kick and the forearms' vault; (3) the wings unfold at
 * the top of the vault; (4) the first downstroke; (5) heavy beats in ground effect, climbing.
 * Timing scales with size (Charcoal: crouch 1.5 s, vault 0.6 s, unfold 1.2 s). Returns the pose
 * with rig.position = the body's travel (root frame), and pose.launch = { phase, vaultY, z }.
 */
export function launch(c, o = {}) {
  const t = o.t ?? 0;
  const s = Math.sqrt(c.L / 36);                          // time scale (dynamic similarity)
  const T1 = 1.5 * s, T2 = T1 + 0.6 * s, T3 = T2 + 1.2 * s;
  const hz = (c.config.flapHz ?? 0.4) * 1.12;
  const d = c.anatomy.dims;
  const vaultH = o.vaultH ?? d.shH * 0.8;
  let pose, phase;
  if (t < T1) {
    phase = 'crouch';
    pose = crouch(c, { ...o, t, k: smooth(0, T1, t), blink: false });
  } else if (t < T2) {
    phase = 'vault';
    const u = (t - T1) / (T2 - T1);
    const a = crouch(c, { ...o, t, k: 1 - u, blink: false });
    const b = flight(c, { ...o, t, phase: 0.5, amp: 0.2, center: 0.6 });
    pose = blend(c, a, b, smooth(0.35, 1, u) * 0.5);
    pose.ground = u < 0.5;
    pose.rig.position = [0, (u < 0.5 ? 0 : 1) * vaultH * smooth(0.3, 1, u), d.T * 0.3 * u];
    pose.uniforms.drape = { L: ['stand', 1 - u * 0.6], R: ['stand', 1 - u * 0.6] };
  } else {
    // in the air: unfold to the top of the upstroke, then heavy beats, climbing slowly
    const ta = t - T2;
    const unfold = smooth(0, T3 - T2, ta);
    const cyc0 = 0.0;                                  // the first beat starts at the top of the upstroke
    const tb = Math.max(0, ta - (T3 - T2));
    const fl = flight(c, { ...o, t: tb, hz, phase: cyc0, amp: (c.config.flapAmp ?? 0.8) * 1.15, bodyPitch: -0.28 + 0.1 * smooth(0, 6, tb) });
    const folded = crouch(c, { ...o, t, k: 0, blink: false });
    pose = blend(c, folded, fl, unfold);
    pose.ground = false;
    phase = ta < T3 - T2 ? 'unfold' : 'beats';
    const climb = 0.5 * d.shH * tb;
    pose.rig.position = [0, vaultH * (1 - 0.15 * smooth(0, 1.5, ta)) + climb + (pose.rig.position[1] || 0), d.T * 0.3 + d.T * 0.6 * ta + 6 * s * tb * tb * 0.3];
    pose.uniforms.drape = { L: ['stand', (1 - unfold) * 0.4], R: ['stand', (1 - unfold) * 0.4] };
  }
  pose.launch = { phase, T1, T2, T3 };
  return pose;
}

/**
 * Landing (1.7 / 2A), o.t from the flare (rev. 3: a low approach, no rearing up): (1) the glide
 * flares to ~25 degrees nose-up with the wings cupped, the feet swing forward under the middle of
 * the body; (2) touchdown on the feet, knees soaking up the weight, wings still half open;
 * (3) the wrist pads come down in front and the wings fold into the low stance. Timing scales
 * with size (Charcoal: 1.0 s + 0.5 s + 1.0 s). The rig travels forward and down to the root.
 */
export function land(c, o = {}) {
  const t = o.t ?? 0;
  const s = Math.sqrt(c.L / 36);
  const T1 = 1.0 * s, T2 = T1 + 0.5 * s, T3 = T2 + 1.0 * s;
  const d = c.anatomy.dims;
  const LP = lowParams(c);
  // the touchdown carriage: on the feet, chest raised ~25 deg, a little higher than the stance
  const touch = (tt, k) => stand(c, { ...o, t: tt, bodyPitch: mix(0.42, LP.pitch * deg, k), belly: mix(0.62, LP.belly, k), asym: 0, raise: 0.15 * (1 - k) });
  const wingsFrom = (p, src, w) => {
    const qa = toQuatMap(c, p), qb = toQuatMap(c, src);
    for (const n of Object.keys({ ...qa, ...qb })) if (/^w_/.test(n)) p.bones[n] = { q: qSlerp(qa[n] || QI(), qb[n] || QI(), w) };
    p.uniforms.billowL = mix(p.uniforms.billowL ?? 0, src.uniforms?.billowL ?? 0, w); p.uniforms.billowR = p.uniforms.billowL;
    return p;
  };
  let pose;
  if (t < T1) {
    const u = t / T1;
    const fl = glide(c, { ...o, t, bodyPitch: -0.44 * smooth(0, 1, u), dihedral: 0.22, droop: 0.12 });
    const tp = touch(t, 0);
    pose = blend(c, fl, tp, smooth(0.35, 1, u) * 0.75);
    wingsFrom(pose, fl, 1);
    pose.ground = false;
    // gliding in low over the ground, the last metres of the descent
    const fall = (1 - u) * (1 - u);
    pose.rig.position = [pose.rig.position[0], pose.rig.position[1] + d.shH * 0.9 * fall, pose.rig.position[2] - d.T * 1.6 * (1 - u)];
  } else if (t < T2) {
    const u = smooth(T1, T2, t);
    const tp = touch(t, 0.25 * u);
    const fl = glide(c, { ...o, t, bodyPitch: -0.44, dihedral: 0.3, droop: 0.2 });
    pose = wingsFrom(tp, fl, 1 - 0.45 * u);
    pose.uniforms.drape = { L: ['stand', 0], R: ['stand', 0] };
    pose.ground = true;
  } else {
    const u = smooth(T2, T3, t);
    const tp = touch(t, 0.25 + 0.75 * u);
    const fl = glide(c, { ...o, t, bodyPitch: -0.44, dihedral: 0.3, droop: 0.2 });
    pose = wingsFrom(tp, fl, 0.55 * (1 - u) * (1 - u));
    pose.uniforms.drape = { L: ['stand', u], R: ['stand', u] };
    pose.ground = true;
  }
  return pose;
}

// --------------------------------------------------------------- blending
function toQuatMap(c, p) {
  const out = {};
  for (const [n, v] of Object.entries(p.bones || {})) {
    if (v.q) out[n] = v.q;
    else out[n] = qEuler(v[0] || 0, v[1] || 0, v[2] || 0, v[3] || 'XYZ');
  }
  return out;
}
/** Blend two poses (bone rotations slerped, rig and scales lerped, uniforms lerped). w = 0 -> a, 1 -> b. */
export function blend(c, a, b, w) {
  const qa = toQuatMap(c, a), qb = toQuatMap(c, b);
  const bones = {};
  for (const n of new Set([...Object.keys(qa), ...Object.keys(qb)])) bones[n] = { q: qSlerp(qa[n] || QI(), qb[n] || QI(), w) };
  const scl = {};
  for (const n of new Set([...Object.keys(a.scale || {}), ...Object.keys(b.scale || {})])) {
    const x = (a.scale || {})[n] || [1, 1, 1], y = (b.scale || {})[n] || [1, 1, 1];
    scl[n] = [mix(x[0], y[0], w), mix(x[1], y[1], w), mix(x[2], y[2], w)];
  }
  const ra = a.rig || {}, rb = b.rig || {};
  const qra = ra.quaternion || qEuler(...(ra.rotation || [0, 0, 0]), 'YXZ'), qrb = rb.quaternion || qEuler(...(rb.rotation || [0, 0, 0]), 'YXZ');
  const pa = ra.position || [0, 0, 0], pbp = rb.position || [0, 0, 0];
  const ua = a.uniforms || {}, ub = b.uniforms || {};
  const uniforms = {};
  for (const k of ['billowL', 'billowR']) uniforms[k] = mix(ua[k] ?? 0, ub[k] ?? 0, w);
  const da = ua.drape || {}, db = ub.drape || {};
  uniforms.drape = {};
  for (const s of ['L', 'R']) {
    const ea = da[s], eb = db[s];
    const kind = (w < 0.5 ? (ea || eb) : (eb || ea))?.[0] ?? 'stand';
    uniforms.drape[s] = [kind, mix(ea ? ea[1] : 0, eb ? eb[1] : 0, w)];
  }
  return { bones, scale: scl, rig: { quaternion: qSlerp(qra, qrb, w), position: [mix(pa[0], pbp[0], w), mix(pa[1], pbp[1], w), mix(pa[2], pbp[2], w)] }, uniforms,
    ground: w < 0.5 ? a.ground : b.ground, groundTail: w < 0.5 ? a.groundTail : b.groundTail, groundBody: w < 0.5 ? a.groundBody : b.groundBody };
}

function copyInto(pb, p) {
  for (const [k, v] of Object.entries(p.bones)) {
    if (Array.isArray(v)) { pb.e[k] = v.slice(0, 3); if (v[3]) pb.o[k] = v[3]; } else pb.q[k] = v.q;
  }
  Object.assign(pb.s, p.scale);
  pb.u = { ...p.uniforms };
}

/** World (root-frame) contact points of a posed creature: feet and wrist pads (for footprints, dust). */
export function contactsOf(c) {
  const out = [];
  const inv = new THREE.Matrix4().copy(c.root.matrixWorld).invert();
  for (const ct of c.anatomy.contacts) {
    const b = c.bones[c.boneIndex[ct.bone]];
    if (!b) continue;
    const v = new THREE.Vector3(...ct.off).applyMatrix4(b.matrixWorld);
    out.push({ bone: ct.bone, world: v.clone(), local: v.clone().applyMatrix4(inv), wrist: ct.wrist });
  }
  return out;
}
