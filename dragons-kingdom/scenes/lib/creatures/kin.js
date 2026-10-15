// Small kinematics toolkit (no three.js; plain arrays) shared by the anatomy builder (the sculpt
// pose) and the pose library (IK for planted feet and wrist pads).
//   quaternions [x, y, z, w], vectors [x, y, z]
//   fk(bones, local, root)        world positions and rotations of a skeleton in a pose
//   ik2(A, C, l1, l2, pole)       two-bone IK: the middle joint for a root A and an end target C
//   chainLocals(...)              local rotations that carry a chain's rest joints onto new joints
// Bones have identity rest orientations (the anatomy convention), so a bone's local rotation is
// its rotation relative to its parent's frame, about its own joint.

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  /** a with its component along unit n removed */
  ortho: (a, n) => { const d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2]; return [a[0] - n[0] * d, a[1] - n[1] * d, a[2] - n[2] * d]; },
};
const { add, sub, scale, dot, cross, len, norm } = v3;

export const QI = () => [0, 0, 0, 1];
export function qMul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
export const qInv = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qRot(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
export function qAxis(axis, ang) { const a = norm(axis), s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; }
export function qNorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
export function qSlerp(a, b, t) {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (cos < 0) { cos = -cos; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (cos > 0.9995) return qNorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(cos), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}
/** quaternion from an orthonormal basis (columns x, y, z) */
export function qBasis(x, y, z) {
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  return qNorm(q);
}
/** frame with z along dir and y as close as possible to up */
export function frameQ(dir, up) {
  const z = norm(dir);
  let y = v3.ortho(up, z);
  if (len(y) < 1e-6) y = v3.ortho(Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], z);
  y = norm(y);
  return qBasis(cross(y, z), y, z);
}
/** rotation carrying (d0, u0) onto (d1, u1): d0 -> d1 exactly, u0 as close to u1 as possible */
export function aimQ(d0, u0, d1, u1) { return qMul(frameQ(d1, u1), qInv(frameQ(d0, u0))); }
/** shortest-arc rotation from a to b */
export function arcQ(a, b) {
  const na = norm(a), nb = norm(b);
  const d = dot(na, nb);
  if (d > 0.999999) return QI();
  if (d < -0.999999) { let ax = cross([1, 0, 0], na); if (len(ax) < 1e-6) ax = cross([0, 1, 0], na); return qAxis(ax, Math.PI); }
  const c = cross(na, nb);
  return qNorm([c[0], c[1], c[2], 1 + d]);
}
/** Euler XYZ (three.js order: R = Rx * Ry * Rz applied as intrinsic X then Y then Z) -> quaternion */
export function qEuler(x, y, z, order = 'XYZ') {
  const qx = qAxis([1, 0, 0], x), qy = qAxis([0, 1, 0], y), qz = qAxis([0, 0, 1], z);
  const m = { X: qx, Y: qy, Z: qz };
  return qMul(qMul(m[order[0]], m[order[1]]), m[order[2]]);
}

/**
 * Forward kinematics. bones: [{name, parent, pos (rest world)}] in parent-before-child order;
 * local: {name: quat}; root: {pos:[...], q:[...]} (the rig transform, default identity).
 * Returns {P: {name: world pos}, Q: {name: world quat}}.
 */
export function fk(bones, local, root = {}) {
  const P = {}, Q = {}, R = {};
  const rq = root.q || QI(), rp = root.pos || [0, 0, 0];
  for (const b of bones) {
    R[b.name] = b.pos;
    const lq = local[b.name] || QI();
    if (!b.parent) { Q[b.name] = qMul(rq, lq); P[b.name] = add(rp, qRot(rq, b.pos)); continue; }
    const pq = Q[b.parent], pp = P[b.parent];
    Q[b.name] = qMul(pq, lq);
    P[b.name] = add(pp, qRot(pq, sub(b.pos, R[b.parent])));
  }
  return { P, Q };
}

/**
 * Two-bone IK: root A, end target C, bone lengths l1, l2, pole direction (the middle joint bends
 * toward it). Returns {B, C} (C clamped to reach).
 */
export function ik2(A, C, l1, l2, pole) {
  let d = sub(C, A);
  let D = len(d);
  const maxD = (l1 + l2) * 0.9995, minD = Math.abs(l1 - l2) * 1.001 + 1e-6;
  const dn = norm(d);
  if (D > maxD) { D = maxD; C = add(A, scale(dn, D)); }
  if (D < minD) { D = minD; C = add(A, scale(dn, D)); }
  const a = (l1 * l1 - l2 * l2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let p = v3.ortho(pole, dn);
  if (len(p) < 1e-6) p = v3.ortho([0, 1, 0], dn);
  p = norm(p);
  return { B: add(add(A, scale(dn, a)), scale(p, h)), C };
}

/**
 * Local rotations for a chain whose joints move from their rest positions to new world positions.
 * chain: bone names [b0, b1, ...] (bone i spans joint i -> joint i+1); restJ / newJ: joint
 * positions (length = chain.length + 1); restUp / newUp: per-bone twist references (the bone's
 * rest "up" maps as close as possible onto newUp); parentQ: world rotation of b0's parent.
 * Returns {name: local quat} and the world rotations.
 */
export function chainLocals(chain, restJ, newJ, restUp, newUp, parentQ = QI()) {
  const out = {}, W = [];
  let pq = parentQ;
  for (let i = 0; i < chain.length; i++) {
    const w = aimQ(sub(restJ[i + 1], restJ[i]), restUp[i], sub(newJ[i + 1], newJ[i]), newUp[i]);
    out[chain[i]] = qMul(qInv(pq), w);
    W.push(w);
    pq = w;
  }
  return { local: out, world: W };
}
