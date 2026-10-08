// Posing helpers for the humans library's cast (scenes/lib/humans) inside style frames and sets.
//
// The humans library builds every character offline in its own drape pose (cloth simulated on
// that pose) and adds only idle motion at render time. A style frame sometimes needs a little
// more: a hand on a strap, both hands under a cloth, a head turned toward a dragon. These helpers
// change a few bones from the CURRENT pose (call them after ch.update(t) / applyIdle, every frame,
// so everything stays a pure function of t). Garments are skinned to the same bones, so sleeves
// follow the arm; keep the changes moderate (a sleeve cannot re-drape at render time).
//
//   import { limbIK, lookAtPoint, rotateBone } from '../lib/sets/cast.js';
//   remi.update(t);                                   // idle (resets to the drape pose first)
//   limbIK(remi, 'arm', 'R', strapPoint, elbowPole);  // hand on the strap
//   lookAtPoint(remi, strapPoint, 0.8);               // and look at it
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _c = new THREE.Vector3(), _d = new THREE.Vector3();

const CHAINS = {
  arm: ['upperarm01', 'lowerarm01', 'wrist'],
  leg: ['upperleg01', 'lowerleg01', 'foot'],
};

const wpos = (b, v = new THREE.Vector3()) => v.setFromMatrixPosition(b.matrixWorld);

/** Rotate bone b by the WORLD rotation q (keeps its children attached). */
export function rotateWorld(b, q) {
  b.parent.getWorldQuaternion(_pq);
  // local' = parentW^-1 * q * parentW * local
  const l = _pq.clone().invert().multiply(q).multiply(_pq);
  b.quaternion.premultiply(l);
}

/** Rotate a bone about a world axis by angle (radians). */
export function rotateBone(ch, name, axis, angle) {
  const b = ch.bone(name);
  if (!b || !angle) return;
  rotateWorld(b, _q.setFromAxisAngle(_a.copy(axis).normalize(), angle));
  ch.root.updateMatrixWorld(true);
}

/**
 * Two-bone IK from the current pose: puts the end of limb `limb` ('arm' | 'leg') on side
 * 'L' | 'R' at the world point `target`, the middle joint bending toward the world point `pole`.
 * opts.reach (0..1) blends from the current pose toward the solution (1 = all the way).
 * Returns { mid, end } world positions.
 */
export function limbIK(ch, limb, side, target, pole, opts = {}) {
  const [n0, n1, n2] = CHAINS[limb].map((n) => ch.bone(`${n}.${side}`));
  ch.root.updateMatrixWorld(true);
  const S = wpos(n0), E0 = wpos(n1), W0 = wpos(n2);
  const l1 = E0.distanceTo(S), l2 = W0.distanceTo(E0);
  const T = target.clone();
  if (opts.reach !== undefined && opts.reach < 1) T.lerpVectors(W0, target, opts.reach);
  let dist = T.distanceTo(S);
  const maxR = (l1 + l2) * 0.998, minR = Math.abs(l1 - l2) * 1.05 + 1e-4;
  if (dist > maxR) { T.sub(S).setLength(maxR).add(S); dist = maxR; }
  if (dist < minR) { T.sub(S).setLength(minR).add(S); dist = minR; }
  const dir = _a.copy(T).sub(S).normalize();
  const pl = _b.copy(pole).sub(S); pl.addScaledVector(dir, -pl.dot(dir));
  if (pl.lengthSq() < 1e-8) pl.copy(E0).sub(S).addScaledVector(dir, -E0.clone().sub(S).dot(dir));
  pl.normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const E = new THREE.Vector3().copy(S).addScaledVector(dir, x).addScaledVector(pl, h);
  // upper segment: current direction -> S->E (a world-space shortest-arc rotation)
  rotateWorld(n0, _q.setFromUnitVectors(_c.copy(E0).sub(S).normalize(), _d.copy(E).sub(S).normalize()));
  ch.root.updateMatrixWorld(true);
  // lower segment
  const E1 = wpos(n1), W1 = wpos(n2);
  rotateWorld(n1, _q.setFromUnitVectors(_c.copy(W1).sub(E1).normalize(), _d.copy(T).sub(E1).normalize()));
  ch.root.updateMatrixWorld(true);
  // optional hand / foot turn: rotate the end bone so its local axis points along opts.endDir
  if (opts.endTwist) rotateWorld(n2, _q.setFromAxisAngle(_c.copy(T).sub(E).normalize(), opts.endTwist));
  if (opts.endBend) {
    const ax = _c.copy(T).sub(E).normalize().cross(_d.copy(pl)).normalize();
    rotateWorld(n2, _q.setFromAxisAngle(ax, opts.endBend));
  }
  ch.root.updateMatrixWorld(true);
  return { mid: E, end: wpos(n2) };
}

/**
 * Turn the neck and head toward a world point (the character's root faces +z at yaw 0, and the
 * drape pose looks along it). amount 0..1; the neck takes 35%, the head the rest; limits in rad.
 */
export function lookAtPoint(ch, point, amount = 1, o = {}) {
  const head = ch.bone('head');
  if (!head) return;
  ch.root.updateMatrixWorld(true);
  const hp = wpos(head);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ch.root.getWorldQuaternion(new THREE.Quaternion()));
  // the head's current forward: the root forward carried by the head's rotation since the drape
  const to = point.clone().sub(hp).normalize();
  const yaw = Math.atan2(to.x, to.z) - Math.atan2(fwd.x, fwd.z);
  const ya = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const pitch = Math.asin(THREE.MathUtils.clamp(to.y, -1, 1)) - Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
  const lim = o.limit ?? 1.2, plim = o.pitchLimit ?? 0.7;
  const Y = THREE.MathUtils.clamp(ya, -lim, lim) * amount, P = THREE.MathUtils.clamp(pitch, -plim, plim) * amount;
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();   // +P tilts the face up
  for (const [n, w] of [['neck01', 0.2], ['neck02', 0.15], ['head', 0.65]]) {
    const b = ch.bone(n);
    if (!b) continue;
    rotateWorld(b, _q.setFromAxisAngle(_a.set(0, 1, 0), Y * w));
    ch.root.updateMatrixWorld(true);
    rotateWorld(b, _q.setFromAxisAngle(side, -P * w));
    ch.root.updateMatrixWorld(true);
  }
}

/** World position of a named bone. */
export function bonePos(ch, name) { ch.root.updateMatrixWorld(true); return wpos(ch.bone(name)); }

/**
 * Open a hand from whatever the build's pose made of it (a clasp, a fist, a grip) into a relaxed,
 * slightly curled hand, and optionally turn the palm toward a world direction:
 *   relaxHand(ch, 'L', { palm: new THREE.Vector3(0, 1, 0), curl: 0.2, spread: 0.05 })
 * o.fingers (world direction): point the hand that way (the wrist bends) instead of continuing the forearm.
 * o.keepFingers: leave the fingers as the build made them (only the wrist is pointed / turned).
 * Uses the bones' rest-pose head positions in the cast cache (header.bones[i].rest): the rest pose
 * is MakeHuman's, with nearly straight fingers. Each finger's first two segments are aligned with
 * their rest directions carried into the hand's current frame, then curled toward the palm by
 * `curl` (radians per joint). Call after limbIK.
 */
export function relaxHand(ch, side, o = {}) {
  const H = ch.header, idx = ch.index;
  const rest = (n) => { const b = H.bones[idx[`${n}.${side}`]]; return b ? new THREE.Vector3(...b.rest) : null; };
  const now = (n) => { const b = ch.bone(`${n}.${side}`); return b ? wpos(b) : null; };
  const knuck = ['finger2-1', 'finger3-1', 'finger4-1', 'finger5-1'];
  const frameOf = (get) => {
    const w = get('wrist');
    const k = knuck.map(get);
    const avg = k.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / 4);
    const fwd = avg.sub(w).normalize();
    const sd = k[3].clone().sub(k[0]);
    sd.addScaledVector(fwd, -sd.dot(fwd)).normalize();
    const up = fwd.clone().cross(sd).normalize();
    return new THREE.Matrix4().makeBasis(fwd, sd, up);
  };
  ch.root.updateMatrixWorld(true);
  // the palm side: fingers curl toward it in the rest pose
  const r1 = rest('finger3-2').sub(rest('finger3-1')).normalize(), r2 = rest('finger3-3').sub(rest('finger3-2')).normalize();
  const Fr = frameOf(rest);
  const upR = new THREE.Vector3().setFromMatrixColumn(Fr, 2);
  const palmSign = r2.clone().sub(r1).dot(upR) >= 0 ? 1 : -1;
  // straighten the wrist: the hand continues the forearm (a clasp or a grip bends it), with an
  // optional bend (radians) toward the palm
  if (o.align !== false) {
    const Fa = frameOf(now);
    const f0 = new THREE.Vector3().setFromMatrixColumn(Fa, 0);
    const fa = o.fingers ? o.fingers.clone().normalize() : now('wrist').sub(now('lowerarm01')).normalize();
    const wb = ch.bone(`wrist.${side}`);
    if (wb) { rotateWorld(wb, _q.setFromUnitVectors(f0, fa)); ch.root.updateMatrixWorld(true); }
  }
  // turn the wrist about the forearm so the palm faces o.palm
  if (o.palm) {
    const Fc = frameOf(now);
    const up = new THREE.Vector3().setFromMatrixColumn(Fc, 2).multiplyScalar(palmSign);
    const axis = o.fingers ? new THREE.Vector3().setFromMatrixColumn(frameOf(now), 0) : now('wrist').sub(now('lowerarm01')).normalize();
    const a = up.clone().addScaledVector(axis, -up.dot(axis)).normalize();
    const b = o.palm.clone().addScaledVector(axis, -o.palm.dot(axis));
    if (b.lengthSq() > 1e-6) {
      b.normalize();
      const ang = Math.atan2(a.clone().cross(b).dot(axis), a.dot(b));
      // the forearm's twist bone takes half, the wrist the rest (no candy-wrapper twist)
      for (const [n, w] of (o.fingers ? [['wrist', 1]] : [['lowerarm02', 0.5], ['wrist', 0.5]])) { const bn = ch.bone(`${n}.${side}`); if (bn) { rotateWorld(bn, _q.setFromAxisAngle(axis, ang * w)); ch.root.updateMatrixWorld(true); } }
    }
  }
  if (o.keepFingers) { ch.root.updateMatrixWorld(true); return; }    // only point / turn the hand
  const Fc = frameOf(now);
  const R = Fc.clone().multiply(Fr.clone().transpose());       // rest frame -> current frame (rotation)
  const sideC = new THREE.Vector3().setFromMatrixColumn(Fc, 1), upC = new THREE.Vector3().setFromMatrixColumn(Fc, 2).multiplyScalar(palmSign);
  const curl = o.curl ?? 0.2, spread = o.spread ?? 0;
  for (let f = 1; f <= 5; f++) {
    for (let j = 1; j <= 2; j++) {
      const n0 = `finger${f}-${j}`, n1 = `finger${f}-${j + 1}`;
      const b = ch.bone(`${n0}.${side}`);
      if (!b || !ch.bone(`${n1}.${side}`)) continue;
      const cur = now(n1).sub(now(n0)).normalize();
      const want = rest(n1).sub(rest(n0)).applyMatrix4(R).normalize();
      // curl toward the palm about the hand's side axis (the thumb curls less), spread the fingers
      const c = (f === 1 ? 0.4 : 1) * curl * (j === 1 ? 0.7 : 1.2);
      const ax = want.clone().cross(upC).normalize();
      want.applyAxisAngle(ax, c);
      if (spread && f > 1) want.applyAxisAngle(upC, spread * (f - 3.5));
      rotateWorld(b, _q.setFromUnitVectors(cur, want));
      ch.root.updateMatrixWorld(true);
    }
    // the last segment follows with a little more curl
    const b3 = ch.bone(`finger${f}-3.${side}`);
    if (b3) {
      const d = now(`finger${f}-3`).sub(now(`finger${f}-2`)).normalize();
      const ax = d.clone().cross(upC).normalize();
      rotateWorld(b3, _q.setFromAxisAngle(ax, (f === 1 ? 0.5 : 1.25) * curl));
      ch.root.updateMatrixWorld(true);
    }
  }
  void sideC;
}
