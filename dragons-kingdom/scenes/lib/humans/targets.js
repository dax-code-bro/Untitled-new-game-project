// Targets on OTHER characters, resolved at the same t - so a pose stays a pure function of t when a
// performer looks at, reaches for or supports someone else.
//
// A { ch, bone, offset } target used to read the target's live bone matrices: whatever pose that
// character was last given. In a chunked or multi-worker render the first frame of a chunk then aimed
// at a stale pose (the setup pose, or the end of another chunk) and eye-lines / support hands jumped
// at chunk boundaries. Now, when the target character has a performer (perform.js createPerformer
// sets ch._performer), its bones are read from that performer's PASS-1 SNAPSHOT at t: the body posed
// for t without anything that itself aims at another character (looks at / gestures toward a { ch }
// target), so there is no recursion and the snapshot is the same whichever performer is updated
// first, and whatever was rendered before. A snapshot is computed on demand, cached per t, and the
// target's visible pose is restored after it (asking never disturbs a pose already made for t).
// A character without a performer (a director actor, a static extra) is read live, as before.
import * as THREE from 'three';

/** Is tg a target on a character ({ ch, bone?, offset? } or { performer })? */
export function isCharTarget(tg) {
  return !!(tg && typeof tg === 'object' && !tg.isVector3 && !Array.isArray(tg) && (tg.ch || tg.performer));
}

/** The character of a char target. */
export function targetChar(tg) { return tg.ch || tg.performer?.ch || null; }

/**
 * World matrix of bone `name` of character ch at time t (into out, a Matrix4): from its performer's
 * pass-1 snapshot when it has one, else the live bone. null when the bone does not exist.
 */
export function boneMatrixAt(ch, name, t, out) {
  const i = ch.index?.[name];
  if (i === undefined) return null;
  const P = ch._performer;
  if (P && Number.isFinite(t)) return out.fromArray(P.snapshot(t).mw, i * 16);
  const b = ch.bones ? ch.bones[i] : ch.bone(name);
  b.updateWorldMatrix(true, false);
  return out.copy(b.matrixWorld);
}

/** World quaternion of ch.root at t (snapshot or live). */
export function rootQuatAt(ch, t, out) {
  const P = ch._performer;
  if (P && Number.isFinite(t)) return out.copy(P.snapshot(t).rq);
  ch.root.updateWorldMatrix(true, false);
  return ch.root.getWorldQuaternion(out);
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion();

/**
 * The world point of a char target at t: the bone's position (default 'head'); for the head of a
 * face (opts.face, no bone named) the point between the eyes; offset [x, y, z] in the target's body
 * frame (x left, y up, z forward). Returns out or null.
 */
export function charTargetPoint(tg, t, out, opts = {}) {
  const ch = targetChar(tg);
  if (!ch) return null;
  const bone = tg.bone || 'head';
  if (!boneMatrixAt(ch, bone, t, _m)) return null;
  out.setFromMatrixPosition(_m);
  if (opts.face && (!tg.bone || tg.bone === 'head')) {
    // a face: between the eyes (the head bone sits at the skull base)
    if (boneMatrixAt(ch, 'eye.L', t, _m) && boneMatrixAt(ch, 'eye.R', t, _m2)) {
      out.setFromMatrixPosition(_m);
      const x = out.x, y = out.y, z = out.z;
      out.setFromMatrixPosition(_m2);
      out.set((out.x + x) / 2, (out.y + y) / 2, (out.z + z) / 2);
    }
  }
  if (tg.offset) {
    rootQuatAt(ch, t, _q);
    out.add(new THREE.Vector3(tg.offset[0], tg.offset[1], tg.offset[2]).applyQuaternion(_q));
  }
  return out;
}

/** Save every bone's local transform and the root's (to put a pose back after a snapshot). */
export function savePose(ch) {
  const n = ch.bones.length, a = new Float64Array(n * 10 + 7);
  ch.bones.forEach((b, i) => {
    const k = i * 10;
    a[k] = b.position.x; a[k + 1] = b.position.y; a[k + 2] = b.position.z;
    a[k + 3] = b.quaternion.x; a[k + 4] = b.quaternion.y; a[k + 5] = b.quaternion.z; a[k + 6] = b.quaternion.w;
    a[k + 7] = b.scale.x; a[k + 8] = b.scale.y; a[k + 9] = b.scale.z;
  });
  const r = ch.root, k = n * 10;
  a[k] = r.position.x; a[k + 1] = r.position.y; a[k + 2] = r.position.z;
  a[k + 3] = r.quaternion.x; a[k + 4] = r.quaternion.y; a[k + 5] = r.quaternion.z; a[k + 6] = r.quaternion.w;
  return a;
}

export function restorePose(ch, a) {
  const n = ch.bones.length;
  ch.bones.forEach((b, i) => {
    const k = i * 10;
    b.position.set(a[k], a[k + 1], a[k + 2]);
    b.quaternion.set(a[k + 3], a[k + 4], a[k + 5], a[k + 6]);
    b.scale.set(a[k + 7], a[k + 8], a[k + 9]);
  });
  const r = ch.root, k = n * 10;
  r.position.set(a[k], a[k + 1], a[k + 2]);
  r.quaternion.set(a[k + 3], a[k + 4], a[k + 5], a[k + 6]);
  r.updateMatrixWorld(true);
}

/** Capture the world matrices of every bone and the root's world quaternion. */
export function capturePose(ch) {
  ch.root.updateMatrixWorld(true);
  const mw = new Float64Array(ch.bones.length * 16);
  ch.bones.forEach((b, i) => b.matrixWorld.toArray(mw, i * 16));
  return { mw, rq: ch.root.getWorldQuaternion(new THREE.Quaternion()) };
}
