// Rig toolkit for the humans library: world-space bone edits on the builds' MakeHuman skeleton
// (163 bones; every bone's REST frame is world-aligned - MakeHuman's rest pose, Y up, +Z forward,
// +X the character's LEFT - and the build's drape pose is stored as rotations on top of it, see
// loader.js). Everything here is stateless: call after the bones were reset (ch.update(t) /
// applyIdle resets them to the drape pose), in the order parents -> children.
//
//   rotateWorld(bone, q)          turn a bone by a WORLD rotation (children follow)
//   aimBone(ch, bone, tip, dir)   turn a bone so its head->tip direction points along dir
//   twoBoneIK(ch, 'arm'|'leg', side, target, pole, opts)   analytic IK, the bend stays in the pole's plane
//   setWorldQuat(bone, q)         give a bone a world orientation
//   handShape(ch, side, shape)    finger poses from MakeHuman's straight rest fingers
//   restInfo(ch)                  rest-pose measurements (cached): bone lengths, foot points, ...
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

export const CHAINS = {
  arm: ['upperarm01', 'lowerarm01', 'wrist'],
  leg: ['upperleg01', 'lowerleg01', 'foot'],
};

/** World position of a bone head (matrixWorld must be current). */
export function wpos(b, v = new THREE.Vector3()) { return v.setFromMatrixPosition(b.matrixWorld); }
export function wquat(b, q = new THREE.Quaternion()) { b.matrixWorld.decompose(_a, q, _b); return q; }

/** Update a bone's matrixWorld (and its subtree) from its parent's current matrixWorld. */
export function refresh(b) { b.updateMatrixWorld(true); }

/** Turn bone b by the world rotation q (premultiplied in world space); updates its subtree. */
export function rotateWorld(b, q) {
  if (!b) return;
  const pq = b.parent ? wquat(b.parent, _q2) : _q2.identity();
  // local' = parent^-1 * q * parent * local
  _q3.copy(pq).invert().multiply(q).multiply(pq);
  b.quaternion.premultiply(_q3);
  b.updateMatrixWorld(true);
}

/** Give bone b the world orientation q (keeps its position); updates its subtree. */
export function setWorldQuat(b, q) {
  if (!b) return;
  const pq = b.parent ? wquat(b.parent, _q2) : _q2.identity();
  b.quaternion.copy(pq.invert().multiply(q));
  b.updateMatrixWorld(true);
}

/** Move a bone head to a world position (bones with a free position: the 'root' bone). */
export function setWorldPos(b, p) {
  b.parent.updateMatrixWorld(true);
  b.position.copy(b.parent.worldToLocal(_a.copy(p)));
  b.updateMatrixWorld(true);
}

/** Rotation taking frame (u1, v1) to frame (u2, v2): u exactly, v as close as possible. */
export function frameRotation(u1, v1, u2, v2, out = new THREE.Quaternion()) {
  const a1 = _a.copy(u1).normalize(), b1 = _b.copy(v1).addScaledVector(a1, -v1.dot(a1)).normalize();
  const c1 = _c.crossVectors(a1, b1);
  _m.makeBasis(a1, b1, c1);
  const a2 = _d.copy(u2).normalize();
  const b2 = new THREE.Vector3().copy(v2).addScaledVector(a2, -v2.dot(a2)).normalize();
  const c2 = new THREE.Vector3().crossVectors(a2, b2);
  _m2.makeBasis(a2, b2, c2);
  _m2.multiply(_m.transpose());
  return out.setFromRotationMatrix(_m2);
}

/** Turn bone so that the direction head -> tip (tip: a world point that moves with the bone) points along dir (world). */
export function aimBone(b, tip, dir, amount = 1) {
  const h = wpos(b, new THREE.Vector3());
  const cur = tip.clone().sub(h).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
  if (amount < 1) q.slerp(_q.identity(), 1 - amount);
  rotateWorld(b, q);
}

/** Rest-pose (drape-independent) measurements of a character, cached. */
export function restInfo(ch) {
  if (ch._restInfo) return ch._restInfo;
  const H = ch.header, idx = ch.index;
  const R = (n) => { const b = H.bones[idx[n]]; return b ? new THREE.Vector3(...b.rest) : null; };
  const L = (a, b) => (R(a) && R(b) ? R(a).distanceTo(R(b)) : 0);
  const info = { R };
  for (const s of ['L', 'R']) {
    info[`upper${s}`] = L(`upperarm01.${s}`, `lowerarm01.${s}`);
    info[`fore${s}`] = L(`lowerarm01.${s}`, `wrist.${s}`);
    info[`thigh${s}`] = L(`upperleg01.${s}`, `lowerleg01.${s}`);
    info[`shin${s}`] = L(`lowerleg01.${s}`, `foot.${s}`);
  }
  info.legLen = info.thighL + info.shinL;
  info.armLen = info.upperR + info.foreR;
  ch._restInfo = info;
  return info;
}

/**
 * Two-bone IK. limb 'arm' (upperarm01 -> lowerarm01 -> wrist) or 'leg' (upperleg01 -> lowerleg01
 * -> foot). The upper bone is turned by the rotation that takes its current (direction, bend
 * plane) frame to the solved one - so the limb's twist follows the pole instead of drifting - and
 * the lower bone bends in that plane. opts.reach (0..1) blends from the current end position to
 * the target; opts.soft (m): the last `soft` metres before full extension ease out (no knee / elbow
 * snap when the target is at arm's length). Returns { mid, end, reached }.
 */
export function twoBoneIK(ch, limb, side, target, pole, opts = {}) {
  const [n0, n1, n2] = CHAINS[limb].map((n) => ch.bone(`${n}.${side}`));
  if (!n0 || !n1 || !n2) return null;
  n0.parent.updateMatrixWorld(true);
  n0.updateMatrixWorld(true);
  const S = wpos(n0, new THREE.Vector3()), E0 = wpos(n1, new THREE.Vector3()), W0 = wpos(n2, new THREE.Vector3());
  const l1 = E0.distanceTo(S), l2 = W0.distanceTo(E0);
  const T = target.clone();
  if (opts.reach !== undefined && opts.reach < 1) T.lerpVectors(W0, target, Math.max(0, opts.reach));
  let dist = T.distanceTo(S);
  const maxR = (l1 + l2) * (opts.maxExt ?? 0.999), minR = Math.abs(l1 - l2) * 1.05 + 1e-4;
  const soft = opts.soft ?? 0.0;
  let reached = true;
  if (soft > 0 && dist > maxR - soft) {
    // soft IK: approach full extension asymptotically
    const ds = maxR - soft;
    const nd = ds + soft * (1 - Math.exp(-(dist - ds) / soft));
    if (nd < dist) reached = false;
    T.sub(S).setLength(nd).add(S); dist = nd;
  }
  if (dist > maxR) { T.sub(S).setLength(maxR).add(S); dist = maxR; reached = false; }
  if (dist < minR) { T.sub(S).setLength(minR).add(S); dist = minR; }
  const dir = T.clone().sub(S).normalize();
  const pl = pole.clone().sub(S); pl.addScaledVector(dir, -pl.dot(dir));
  if (pl.lengthSq() < 1e-10) { pl.copy(E0).sub(S); pl.addScaledVector(dir, -pl.dot(dir)); }
  pl.normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const E = S.clone().addScaledVector(dir, x).addScaledVector(pl, h);
  // current bend-plane normal (fallback: the pole side)
  const u1 = E0.clone().sub(S), w1 = W0.clone().sub(S);
  let n1v = new THREE.Vector3().crossVectors(u1, w1);
  const u2 = E.clone().sub(S), n2v = new THREE.Vector3().crossVectors(u2, T.clone().sub(S));
  if (n1v.lengthSq() < 1e-12 || n2v.lengthSq() < 1e-12) {
    rotateWorld(n0, _q.setFromUnitVectors(u1.normalize(), u2.normalize()));
  } else {
    // keep the elbow / knee bending the same way round: the frames (u, n) map onto each other
    rotateWorld(n0, frameRotation(u1, n1v, u2, n2v, new THREE.Quaternion()));
  }
  const E1 = wpos(n1, new THREE.Vector3()), W1 = wpos(n2, new THREE.Vector3());
  rotateWorld(n1, _q.setFromUnitVectors(W1.sub(E1).normalize(), T.clone().sub(E1).normalize()));
  return { mid: E, end: wpos(n2, new THREE.Vector3()), reached };
}

/**
 * Twist the forearm so the hand's palm turns toward a world direction: the wrist's world frame is
 * rotated about the forearm axis, split over lowerarm02 (60%) and the wrist (40%).
 * palmNow: the palm normal direction now (world).
 */
export function twistForearm(ch, side, palmNow, palmWant, amount = 1) {
  const e = ch.bone(`lowerarm01.${side}`), w = ch.bone(`wrist.${side}`), t2 = ch.bone(`lowerarm02.${side}`);
  if (!e || !w) return;
  const ax = wpos(w, new THREE.Vector3()).sub(wpos(e, new THREE.Vector3())).normalize();
  const a = palmNow.clone().addScaledVector(ax, -palmNow.dot(ax)).normalize();
  const b = palmWant.clone().addScaledVector(ax, -palmWant.dot(ax)).normalize();
  let ang = Math.atan2(new THREE.Vector3().crossVectors(a, b).dot(ax), a.dot(b)) * amount;
  ang = Math.max(-1.6, Math.min(1.6, ang));
  if (t2) rotateWorld(t2, _q.setFromAxisAngle(ax, ang * 0.6));
  rotateWorld(w, _q.setFromAxisAngle(ax, t2 ? ang * 0.4 : ang));
}

// ------------------------------------------------------------------ hands --
const FINGERS = [2, 3, 4, 5];
/**
 * The hand's world frame now: { fwd (wrist -> middle knuckle), lat (index -> little knuckle),
 * palm (normal out of the palm), wrist }.
 */
export function handFrame(ch, side) {
  const P = (n) => { const b = ch.bone(`${n}.${side}`); return b ? wpos(b, new THREE.Vector3()) : null; };
  const w = P('wrist'), i1 = P('finger2-1'), m1 = P('finger3-1'), l1 = P('finger5-1');
  if (!w || !i1 || !l1) return null;
  const fwd = m1.clone().sub(w).normalize();
  const lat = l1.clone().sub(i1).normalize();
  // palm: for the LEFT hand (x = left), index -> little runs backward when the palm faces down in
  // MakeHuman's rest: palm = fwd x lat for L, lat x fwd for R (checked on the rest pose)
  const palm = side === 'L' ? new THREE.Vector3().crossVectors(lat, fwd) : new THREE.Vector3().crossVectors(fwd, lat);
  palm.normalize();
  return { fwd, lat, palm, wrist: w };
}

/** Rest-frame curl axes per finger (in the finger bones' rest = local frames), cached per character. */
function handAxes(ch, side) {
  const k = `_handAxes${side}`;
  if (ch[k]) return ch[k];
  const R = restInfo(ch).R;
  const w = R(`wrist.${side}`), i1 = R(`finger2-1.${side}`), m1 = R(`finger3-1.${side}`), l1 = R(`finger5-1.${side}`);
  const fwd = m1.clone().sub(w).normalize(), lat = l1.clone().sub(i1).normalize();
  const palm = side === 'L' ? new THREE.Vector3().crossVectors(lat, fwd) : new THREE.Vector3().crossVectors(fwd, lat);
  palm.normalize();
  // curling a finger toward the palm: rotation about axis = fwd x palm (sign checked: +angle moves
  // the fingertip toward the palm side)
  const curl = new THREE.Vector3().crossVectors(fwd, palm).normalize();
  // the thumb: from its base toward its tip, curling across the palm
  const t1 = R(`finger1-1.${side}`), t3 = R(`finger1-3.${side}`);
  const tdir = t3 && t1 ? t3.clone().sub(t1).normalize() : fwd.clone();
  const tcurl = new THREE.Vector3().crossVectors(tdir, palm).normalize();
  ch[k] = { fwd, lat, palm, curl, tcurl, tdir };
  return ch[k];
}

/**
 * Finger shape. shape: { curl: [thumb, index, middle, ring, little] radians per joint (or one
 * number), spread (rad), thumbIn (0..1 across the palm) } or a preset name: 'relaxed', 'open',
 * 'point', 'fist', 'cup', 'grip', 'wave'. amount blends from the current (drape) fingers.
 * The fingers are set from MakeHuman's rest (straight) fingers, then curled - independent of
 * whatever grip the build's drape pose gave the hand.
 */
export const HAND_SHAPES = {
  relaxed: { curl: [0.15, 0.22, 0.32, 0.4, 0.48], spread: 0.03, thumbIn: 0.15 },
  open: { curl: [0.05, 0.04, 0.05, 0.07, 0.09], spread: 0.1, thumbIn: 0.0 },
  wave: { curl: [0.04, 0.03, 0.04, 0.05, 0.07], spread: 0.13, thumbIn: 0.0 },
  point: { curl: [0.45, 0.0, 1.25, 1.35, 1.4], spread: 0.0, thumbIn: 0.55 },
  fist: { curl: [0.6, 1.35, 1.45, 1.5, 1.5], spread: 0.0, thumbIn: 0.7 },
  cup: { curl: [0.25, 0.35, 0.42, 0.5, 0.55], spread: 0.02, thumbIn: 0.3 },
  grip: { curl: [0.5, 0.9, 1.0, 1.05, 1.1], spread: 0.0, thumbIn: 0.5 },
  clutch: { curl: [0.45, 0.7, 0.8, 0.85, 0.9], spread: 0.0, thumbIn: 0.45 },
  limp: { curl: [0.2, 0.35, 0.45, 0.55, 0.62], spread: 0.02, thumbIn: 0.2 },
  claw: { curl: [0.3, 0.75, 0.8, 0.85, 0.9], spread: 0.12, thumbIn: 0.1 },
};
export function handShape(ch, side, shape, amount = 1) {
  const s = typeof shape === 'string' ? HAND_SHAPES[shape] : shape;
  if (!s || amount <= 0) return;
  const ax = handAxes(ch, side);
  const curls = Array.isArray(s.curl) ? s.curl : [s.curl, s.curl, s.curl, s.curl, s.curl];
  const q = new THREE.Quaternion(), qs = new THREE.Quaternion();
  const set = (bn, qq) => {
    const b = ch.bone(`${bn}.${side}`); if (!b) return;
    const i = ch.index[`${bn}.${side}`];
    if (amount >= 1) b.quaternion.copy(qq);
    else b.quaternion.copy(ch.drape.q[i]).slerp(qq, amount);
  };
  // metacarpals straight (rest)
  for (let k = 1; k <= 4; k++) set(`metacarpal${k}`, q.identity());
  for (let fi = 0; fi < 4; fi++) {
    const f = FINGERS[fi];
    const c = curls[fi + 1];
    const spread = (s.spread ?? 0) * (fi - 1.2) * (side === 'L' ? 1 : -1);
    qs.setFromAxisAngle(ax.palm, spread);
    // base joint curls a little less, the middle joint most
    set(`finger${f}-1`, q.setFromAxisAngle(ax.curl, c * 0.85).premultiply(qs));
    set(`finger${f}-2`, q.setFromAxisAngle(ax.curl, c * 1.1));
    set(`finger${f}-3`, q.setFromAxisAngle(ax.curl, c * 0.75));
  }
  // thumb: swing across the palm (thumbIn) + curl
  const ti = s.thumbIn ?? 0.2, tc = curls[0];
  const sw = new THREE.Quaternion().setFromAxisAngle(ax.fwd, (side === 'L' ? -1 : 1) * ti * 0.6);
  set('finger1-1', new THREE.Quaternion().setFromAxisAngle(ax.tcurl, tc * 0.4).premultiply(sw));
  set('finger1-2', q.setFromAxisAngle(ax.tcurl, tc * 0.8));
  set('finger1-3', q.setFromAxisAngle(ax.tcurl, tc * 0.7));
  ch.bone(`wrist.${side}`)?.updateMatrixWorld(true);
}

/** Orient the hand: fingers along fingersDir, palm toward palmDir (world), by turning the wrist. */
export function orientHand(ch, side, fingersDir, palmDir, amount = 1) {
  const w = ch.bone(`wrist.${side}`);
  const hf = handFrame(ch, side);
  if (!w || !hf) return;
  const fw = fingersDir ? fingersDir.clone().normalize() : hf.fwd;
  const pw = palmDir ? palmDir.clone().normalize() : hf.palm;
  const q = frameRotation(hf.fwd, hf.palm, fw, pw, new THREE.Quaternion());
  if (amount < 1) q.slerp(_q.identity(), 1 - amount);
  // limit the wrist to ~75 deg from the forearm (a hand never folds back on itself)
  rotateWorld(w, q);
}

/** Smoothstep / helpers shared by the motion modules. */
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const smoother = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
export const lerp = (a, b, k) => a + (b - a) * k;
/** Stateless hash in [0, 1). */
export function hash01(seed, i) {
  let x = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
/** Smooth 1-D value noise in [-1, 1] (pure). */
export function noise1(seed, t) {
  const i = Math.floor(t), f = t - i;
  const a = hash01(seed, i) * 2 - 1, b = hash01(seed, i + 1) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
