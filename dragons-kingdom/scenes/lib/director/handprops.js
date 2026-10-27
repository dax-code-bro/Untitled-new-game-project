// Shot director - HAND PROPS (pure: three.js maths only, so the self-test runs it in Node): a cast
// entry's `holds` puts set objects in an actor's hands every frame, placed from the POSED palms (after
// the arm overlays: a bowl carried in both hands, a cup in one). The set builder provides the objects
// (`objects: { waterBowl, ... }`, origin at the object's base, built at the world origin); the stage
// owns them - hidden in every frame nobody holds them.
//
//   youngAttendant: { ..., holds: { object: 'waterBowl', offset: [0, -0.035, 0] }, acts: [[0, 'carry', {}], ...] }
//   holds: 'cup' | { object, hands: 'both' | 'L' | 'R', from, to (shot seconds), offset: [x, y, z] m, rot: deg } | [ ... ]
import * as THREE from 'three';

/** A cast entry's hand props: `holds: 'bowl'` or `{ object, hands: 'both'|'L'|'R', from, to, offset, rot }` or a list. */
export function heldList(b) {
  if (!b || b.holds == null) return [];
  return (Array.isArray(b.holds) ? b.holds : [b.holds]).map((h) => (typeof h === 'string' ? { object: h } : h));
}

const _hv = new THREE.Vector3(), _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _hq2 = new THREE.Quaternion();
/** The middle of a palm: half way from the wrist to the knuckles (MakeHuman bones). */
function palmPoint(ch, sd) {
  const w = ch.bone(`wrist.${sd}`);
  if (!w) return null;
  const p = w.getWorldPosition(new THREE.Vector3());
  const ks = ['finger2-1', 'finger3-1', 'finger4-1', 'finger5-1'].map((n) => ch.bone(`${n}.${sd}`)).filter(Boolean);
  if (!ks.length) return p;
  const k = ks.reduce((acc, b) => acc.add(b.getWorldPosition(_hv)), new THREE.Vector3()).multiplyScalar(1 / ks.length);
  return p.lerp(k, 0.5);
}
/**
 * Put a set object in a character's hands: between the two palms (`hands: 'both'`, default; its x axis
 * from the left hand to the right one, levelled) or in one palm (its x axis the actor's right), then
 * `offset` [x, y, z] metres in that frame (y up) and `rot` degrees about y. The object's origin is its
 * base (props library convention): a bowl carried in both hands takes `offset: [0, -0.03, 0]`.
 */
export function placeInHands(ch, o, h = {}) {
  const hands = h.hands || 'both';
  const right = new THREE.Vector3();
  let p;
  if (hands === 'both') {
    const L = palmPoint(ch, 'L'), R = palmPoint(ch, 'R');
    if (!L || !R) return;
    p = L.clone().add(R).multiplyScalar(0.5);
    right.copy(R).sub(L);
  } else {
    p = palmPoint(ch, hands);
    if (!p) return;
    ch.root.updateMatrixWorld(true);
    right.setFromMatrixColumn(ch.root.matrixWorld, 0).multiplyScalar(-1);
  }
  right.y = 0;
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3(0, 1, 0), back = new THREE.Vector3().crossVectors(right, up);
  const off = h.offset || [0, 0, 0];
  p.addScaledVector(right, off[0]).addScaledVector(up, off[1]).addScaledVector(back, off[2]);
  _hm.makeBasis(right, up, back);
  _hq.setFromRotationMatrix(_hm);
  if (h.rot) _hq.multiply(_hq2.setFromAxisAngle(up, (h.rot * Math.PI) / 180));
  if (o.parent) {
    o.parent.updateMatrixWorld(true);
    o.parent.worldToLocal(p);
    _hq.premultiply(o.parent.getWorldQuaternion(_hq2).invert());
  }
  o.position.copy(p);
  o.quaternion.copy(_hq);
  o.visible = true;
  o.updateMatrixWorld(true);
}
