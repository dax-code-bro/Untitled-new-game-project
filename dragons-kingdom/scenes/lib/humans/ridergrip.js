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
import { twoBoneIK, twistForearm, handFrame, handShape, orientHand, wpos } from './rig.js';
import { bodyRig } from './motion.js';

/** The overhand grip round a ~3.4 cm bar: every finger joint closed (tips under the bar), thumb across. */
export const BAR_GRIP = { curl: [0.62, 1.0, 1.08, 1.12, 1.16], spread: -0.08, thumbIn: 0.65 };
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
    // two passes: the wrist target depends on the forearm's line (a straight wrist), which the IK sets
    for (let pass = 0; pass < 2; pass++) {
      const E = wpos(el, new THREE.Vector3()), W = wpos(wr, new THREE.Vector3());
      // the hand continues the forearm (seen square to the bar), tipped 15 deg down over the bar
      fingers = W.sub(E);
      fingers.addScaledVector(axis, -fingers.dot(axis));
      if (fingers.lengthSq() < 1e-8 || fingers.dot(fwd) < 0.2 * fingers.length()) fingers.copy(fwd);
      fingers.normalize();
      fingers.addScaledVector(up, -0.25).normalize();
      fingers.addScaledVector(axis, -fingers.dot(axis)).normalize();
      // palm square to the fingers, facing down onto the bar
      palm = new THREE.Vector3().crossVectors(fingers, axis).normalize();
      if (palm.dot(up) > 0) palm.negate();
      // palm surface on the bar (bar radius + 4 mm leather give + half the palm's thickness), the bar
      // under the knuckle crease (0.8 of the palm length from the wrist)
      const wrist = C.clone().addScaledVector(palm, -(bar.radius + 0.004 + 0.14 * pl)).addScaledVector(fingers, -0.8 * pl);
      twoBoneIK(ch, 'arm', sd, wrist, pole, { reach: amount, soft: 0.02 });
    }
    // pronate: forearm twist first (no candy-wrapper wrist), then the wrist's own correction
    const hf = handFrame(ch, sd);
    if (hf) twistForearm(ch, sd, hf.palm, palm, amount);
    handShape(ch, sd, opts.shape || BAR_GRIP, amount);
    orientHand(ch, sd, fingers, palm, amount);
    wr.updateMatrixWorld(true);
    done.push(sd);
  }
  return done;
}
