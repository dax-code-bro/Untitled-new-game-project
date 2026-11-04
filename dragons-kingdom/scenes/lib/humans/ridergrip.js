// Seated rider hands closed round the saddle's grab bar (scenes/lib/creatures/rider.js addGrip).
//
// mountRider() builds a leather-wrapped bar (a CylinderGeometry mesh in a group named 'grip', a child
// of rider.root) where the build's drape hands were. The drape hands of the seated builds rest open,
// palms up, so the bar used to pass through open fingers (director 1C-16 insert). riderGrip() runs
// after the idle pose every frame (createRider's update calls it): per hand an overhand grip - palm on
// the top / rear of the bar, wrist straight in line with the forearm, knuckles over the bar, fingers
// wrapped forward and under it, the thumb closed round from the rider's side. Pure in t (it works on
// the posed bones; applyIdle resets them to the drape pose first), no-op when no bar is mounted.
//
// opts: false / { hands: ['L', 'R'], amount 0..1 }. A rider built with an injured LEFT arm
// (abby_ride_injured) never grips with it - the arm stays held in (CHARACTERS.md: Abby's LEFT arm).
import * as THREE from 'three';
import { twoBoneIK, twistForearm, handFrame, handShape, orientHand, wpos, aimBone } from './rig.js';
import { bodyRig } from './motion.js';

/**
 * The overhand grip round a ~3.4 cm bar: every finger joint closed (tips under the bar), thumb across.
 * wrap: the fingers' PIP / DIP line from the bar's axis = bar radius + wrap x palm length; tipPad: each
 * fingertip's end from the axis = bar radius + tipPad x palm length (the last joint closes until the
 * tip lies on the bar's near underside instead of hanging below it); thumbWrap 0..1: thumb round the
 * near (rider's) side. dip (optional, number or per finger) overrides the fitted last-joint curl.
 */
export const BAR_GRIP = { curl: [0.62, 1.0, 1.08, 1.12, 1.16], together: 0.9, thumbIn: 0.65, tilt: 0.25, thumbWrap: 1, wrap: 0.08, tipPad: 0.05 };
/** Rider build ids whose LEFT arm is the injured one (held in, never on the bar). */
export const INJURED_LEFT = new Set(['abby_ride_injured']);

const _v = new THREE.Vector3(), _m = new THREE.Matrix4();

/** The mounted grab bar: { mesh, radius, half (m from the bar's centre to each hand), axis, mid (world) } or null. */
export function findGripBar(rider) {
  const g = rider?.root?.getObjectByName('grip');
  if (!g) return null;
  const mesh = g.children.find((m) => m.isMesh && m.geometry?.type === 'CylinderGeometry');
  if (!mesh) return null;
  const p = mesh.geometry.parameters;
  // addGrip: length = hand spacing + 0.14, the cylinder's axis turned onto the mesh's local +x (toward the RIGHT hand)
  return { mesh, radius: p.radiusTop ?? 0.017, half: Math.max(0.03, (p.height - 0.14) / 2) };
}

/**
 * Close the rider's hands round its grab bar (call after the idle pose; createRider's update does).
 * Returns the sides it gripped with ([] when there is no bar).
 */
export function riderGrip(rider, opts = {}) {
  if (opts === false) return [];
  const bar = findGripBar(rider);
  if (!bar) return [];
  const ch = rider.character;
  const amount = opts.amount ?? 1;
  if (amount <= 0) return [];
  rider.root.updateWorldMatrix(true, true);
  const mw = bar.mesh.matrixWorld;
  const axis = new THREE.Vector3(1, 0, 0).transformDirection(mw).normalize();       // toward the RIGHT hand
  const mid = new THREE.Vector3().setFromMatrixPosition(mw);
  // the rider's up (seated: the root's +y) and forward (from the chest toward the bar), square to the bar
  const up = new THREE.Vector3(0, 1, 0).transformDirection(_m.extractRotation(rider.root.matrixWorld));
  up.addScaledVector(axis, -up.dot(axis)).normalize();
  const chest = wpos(ch.bone('spine03') || ch.bone('root'), new THREE.Vector3());
  const fwd = new THREE.Vector3().crossVectors(axis, up);
  if (fwd.dot(_v.copy(mid).sub(chest)) < 0) fwd.negate();
  const R = bodyRig(ch);
  const sides = opts.hands || ['L', 'R'];
  const done = [];
  for (const sd of sides) {
    if (sd === 'L' && INJURED_LEFT.has(rider.id)) continue;
    const sh = ch.bone(`upperarm01.${sd}`), el = ch.bone(`lowerarm01.${sd}`), wr = ch.bone(`wrist.${sd}`);
    if (!sh || !el || !wr) continue;
    const sg = sd === 'L' ? -1 : 1;
    const C = mid.clone().addScaledVector(axis, sg * bar.half);
    const pl = R[`palmLen${sd}`] || 0.08;
    const S = wpos(sh, new THREE.Vector3());
    const left = axis.clone().multiplyScalar(-1);
    const pole = S.clone().addScaledVector(up, -0.5).addScaledVector(left, -sg * 0.4).addScaledVector(fwd, -0.3);
    let fingers = null, palm = null;
    const shape = { ...(opts.shape || BAR_GRIP) };
    const curl0 = Array.isArray(shape.curl) ? shape.curl.slice() : [shape.curl, shape.curl, shape.curl, shape.curl, shape.curl];
    const cs = [1, 1, 1, 1];                                      // per-finger curl scale (fitted below)
    const poseHand = (wristT) => {
      twoBoneIK(ch, 'arm', sd, wristT, pole, { reach: amount, soft: 0.02 });
      const hf = handFrame(ch, sd);
      // pronate: forearm twist first (no candy-wrapper wrist), then the wrist's own correction
      if (hf) twistForearm(ch, sd, hf.palm, palm, amount);
      handShape(ch, sd, { ...shape, curl: [curl0[0], ...curl0.slice(1).map((c, i) => Math.min(1.6, c * cs[i]))] }, amount);
      orientHand(ch, sd, fingers, palm, amount);
    };
    let wrist = null;
    // two passes: the wrist target depends on the forearm's line (a straight wrist), which the IK sets
    for (let pass = 0; pass < 2; pass++) {
      const E = wpos(el, new THREE.Vector3()), W = wpos(wr, new THREE.Vector3());
      // the hand continues the forearm (seen square to the bar), tipped down over the bar
      fingers = W.sub(E);
      fingers.addScaledVector(axis, -fingers.dot(axis));
      if (fingers.lengthSq() < 1e-8 || fingers.dot(fwd) < 0.2 * fingers.length()) fingers.copy(fwd);
      fingers.normalize();
      fingers.addScaledVector(up, -(shape.tilt ?? 0.45)).normalize();
      fingers.addScaledVector(axis, -fingers.dot(axis)).normalize();
      // palm square to the fingers, facing down onto the bar
      palm = new THREE.Vector3().crossVectors(fingers, axis).normalize();
      if (palm.dot(up) > 0) palm.negate();
      // palm surface on the bar (bar radius + 4 mm leather give + half the palm's thickness), the bar
      // under the knuckle crease (0.8 of the palm length from the wrist)
      wrist = C.clone().addScaledVector(palm, -(bar.radius + 0.004 + 0.14 * pl)).addScaledVector(fingers, -0.8 * pl);
      twoBoneIK(ch, 'arm', sd, wrist, pole, { reach: amount, soft: 0.02 });
    }
    poseHand(wrist);
    // fit the wrap: the middle finger's three joints (knuckle, PIP, DIP) lie on a circle round the bar's
    // axis - the hand slides (in the bar's cross-section) until that circle is centred on the bar, and the
    // fingers curl until its radius is the bar's plus half a finger (tips tucked under, not hanging below)
    const Rt = bar.radius + (shape.wrap ?? 0.1) * pl, Rtip = bar.radius + (shape.tipPad ?? 0.05) * pl;
    const sec = (p) => { _v.copy(p).sub(C); return [_v.dot(fwd), _v.dot(up)]; };
    for (let it = 0; it < 4 && amount > 0.5; it++) {
      const a = sec(wpos(ch.bone(`finger3-1.${sd}`) || wr, new THREE.Vector3()));
      const b = sec(wpos(ch.bone(`finger3-2.${sd}`) || wr, new THREE.Vector3()));
      const c = sec(wpos(ch.bone(`finger3-3.${sd}`) || wr, new THREE.Vector3()));
      const o = circumcentre(a, b, c);
      if (!o) break;
      // the circle's centre onto the bar's axis (at most 3 cm a step)
      const sx = THREE.MathUtils.clamp(-o[0], -0.03, 0.03), sy = THREE.MathUtils.clamp(-o[1], -0.03, 0.03);
      wrist.addScaledVector(fwd, sx).addScaledVector(up, sy);
      // each finger's own curl from how far its PIP and DIP sit from the bar's axis (the little finger's
      // knuckle sits lower in the palm's arch: curled like the middle one it would pass through the bar)
      ['finger2', 'finger3', 'finger4', 'finger5'].forEach((f, i) => {
        const p = sec(wpos(ch.bone(`${f}-2.${sd}`) || wr, new THREE.Vector3())), q = sec(wpos(ch.bone(`${f}-3.${sd}`) || wr, new THREE.Vector3()));
        const r = 0.5 * (Math.hypot(p[0], p[1]) + Math.hypot(q[0], q[1]));
        cs[i] = THREE.MathUtils.clamp(cs[i] * Math.pow(r / Rt, 0.8), 0.35, 1.45);
      });
      poseHand(wrist);
    }
    // the last joints close until each fingertip's end lies on the bar's near underside (radius Rtip),
    // further round the curl than its DIP - not hanging below the bar as a point (skipped with a fixed dip)
    if (shape.dip == null && amount > 0.5) for (const f of [2, 3, 4, 5]) tuckTip(ch, f, sd, C, axis, fwd, up, Rtip, amount);
    if (shape.thumbWrap !== 0) wrapThumb(ch, sd, C, axis, fwd, up, bar.radius + 0.1 * pl, sg, amount * (shape.thumbWrap ?? 1));
    wr.updateMatrixWorld(true);
    done.push(sd);
  }
  return done;
}

/**
 * World position of a finger's END (fingertip pad / nail end, past its last joint). The rig's bone axes
 * do not run along the bones (MakeHuman glTF: +y is ~140 deg off), so the last phalanx's direction is
 * taken as the child offset of the joint before it, read in the last bone's own frame (skinned check:
 * within 2 mm on the four fingers, 7 mm on the thumb); its length ~0.95 of the middle phalanx.
 */
export function fingerTip(ch, f, sd, fallback, out = new THREE.Vector3()) {
  const b2 = ch.bone(`finger${f}-2.${sd}`), b3 = ch.bone(`finger${f}-3.${sd}`);
  if (!b2 || !b3) return wpos(fallback, out);
  const h3 = wpos(b3, out), L = h3.distanceTo(wpos(b2, _t));
  return h3.addScaledVector(_t.copy(b3.position).normalize().applyQuaternion(b3.getWorldQuaternion(_tq)), 0.95 * L);
}
const _t = new THREE.Vector3(), _tq = new THREE.Quaternion();

/**
 * Aim a finger's last phalanx (a leaf: nothing else moves) so its end lies Rtip from the bar's axis, the
 * solution further round the grip's curl (front -> under -> rider's side) than the DIP joint itself.
 */
function tuckTip(ch, f, sd, C, axis, fwd, up, Rtip, amount) {
  const b3 = ch.bone(`finger${f}-3.${sd}`);
  if (!b3) return;
  const h = wpos(b3, new THREE.Vector3()), tip = fingerTip(ch, f, sd, b3, new THREE.Vector3());
  const rel = (p) => { _t.copy(p).sub(C); return [_t.dot(fwd), _t.dot(up), _t.dot(axis)]; };
  const d = rel(h), e = rel(tip);
  const l = Math.hypot(e[0] - d[0], e[1] - d[1]), D = Math.hypot(d[0], d[1]);
  if (l < 1e-4 || D < 1e-4) return;
  // circle (axis, Rtip) meets circle (DIP, l): a = distance from the axis-side along d to the chord
  const a = (D * D + Rtip * Rtip - l * l) / (2 * D);
  const hh = Math.sqrt(Math.max(0, Rtip * Rtip - a * a));
  const ux = d[0] / D, uy = d[1] / D;
  // clockwise in (fwd, up) = on round the curl: of the two points take the one with d x s < 0
  const s1 = [a * ux + hh * uy, a * uy - hh * ux];
  const target = C.clone().addScaledVector(fwd, s1[0]).addScaledVector(up, s1[1]).addScaledVector(axis, e[2]);
  aimBone(b3, tip, target.sub(h), amount);
}

/** Centre of the circle through three 2-D points (null when they are in a line). */
function circumcentre(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-10) return null;
  const A = a[0] * a[0] + a[1] * a[1], B = b[0] * b[0] + b[1] * b[1], Cc = c[0] * c[0] + c[1] * c[1];
  return [(A * (b[1] - c[1]) + B * (c[1] - a[1]) + Cc * (a[1] - b[1])) / d, (A * (c[0] - b[0]) + B * (a[0] - c[0]) + Cc * (b[0] - a[0])) / d];
}

/**
 * The thumb closed round the bar's NEAR side (the rider's side, opposite the fingers): its first joint
 * high on the near side, the next down the near face, the tip curling under - so from above (a rider's
 * eye or an over-shoulder camera) the thumb shows along the bar beside the index finger, angled in toward
 * the other hand. R: the thumb's centre line from the bar's axis; sg: -1 left hand, +1 right.
 */
function wrapThumb(ch, sd, C, axis, fwd, up, R, sg, amount) {
  const b1 = ch.bone(`finger1-1.${sd}`), b2 = ch.bone(`finger1-2.${sd}`), b3 = ch.bone(`finger1-3.${sd}`);
  if (!b1 || !b2 || !b3 || amount <= 0) return;
  // a point on the bar's surface ring: phi from the top toward the front (near side = negative), a = axial
  const ring = (phi, a) => C.clone().addScaledVector(axis, a).addScaledVector(up, R * Math.cos(phi)).addScaledVector(fwd, R * Math.sin(phi));
  const ax = (p) => _v.copy(p).sub(C).dot(axis);
  const deg = Math.PI / 180;
  const h1 = wpos(b1, new THREE.Vector3()), h2 = wpos(b2, new THREE.Vector3()), h3 = wpos(b3, new THREE.Vector3());
  const L2 = h3.distanceTo(h2);
  // the thumb's metacarpal (finger1-1) stays as handShape set it: the built coats weight their cuff
  // vertices to it, so swinging it drags the sleeve down over the hand (1C-16 test render) - only the
  // phalanges wrap
  void h1;
  // the proximal phalanx down the near face
  aimBone(b2, h3, ring(-100 * deg, ax(h2) - sg * 0.35 * L2).sub(h2), amount);
  wpos(b3, h3);
  // the distal phalanx curls under the bar (its tip from fingerTip: the bones' +y is not along them)
  const tip = fingerTip(ch, 1, sd, b3, new THREE.Vector3());
  aimBone(b3, tip, ring(-150 * deg, ax(h3) - sg * 0.25 * L2).sub(h3), amount);
}
