// Posing. A pose is a plain object:
//   { bones: { boneName: [rx, ry, rz] (radians, XYZ Euler in the bone's rest frame) },
//     scale: { boneName: [sx, sy, sz] },
//     ground: true|false (lift/drop the rig so the lowest foot touches y = 0),
//     uniforms: { billowL, billowR, ... } (material parameters driven by the pose) }
// All bones have an identity rest orientation, so the axes are the creature's
// own: x = its left, y = up, z = forward. A pose is a pure value; applyPose
// fully resets the skeleton first, so the result never depends on the
// previous frame.
import * as THREE from 'three';

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export function restPose() { return { bones: {}, scale: {}, ground: false }; }

export function applyPose(c, p) {
  for (const b of c.bones) { b.quaternion.identity(); b.scale.set(1, 1, 1); }
  // rest offsets (positions) never change, except the root rig height
  c.rig.position.set(0, 0, 0);
  c.rig.quaternion.identity();
  for (const [name, r] of Object.entries(p.bones || {})) {
    const i = c.boneIndex[name];
    if (i === undefined) continue;
    if (r.q) { c.bones[i].quaternion.set(r.q[0], r.q[1], r.q[2], r.q[3]); continue; }
    _e.set(r[0] || 0, r[1] || 0, r[2] || 0, r[3] || 'XYZ');
    c.bones[i].quaternion.setFromEuler(_e);
  }
  for (const [name, s] of Object.entries(p.scale || {})) {
    const i = c.boneIndex[name];
    if (i === undefined) continue;
    c.bones[i].scale.set(s[0], s[1], s[2]);
  }
  if (p.rig) {
    if (p.rig.rotation) { _e.set(p.rig.rotation[0] || 0, p.rig.rotation[1] || 0, p.rig.rotation[2] || 0, 'YXZ'); c.rig.quaternion.setFromEuler(_e); }
    if (p.rig.position) c.rig.position.set(...p.rig.position);
  }
  c.root.updateMatrixWorld(true);
  if (p.ground) groundRig(c, p.groundBones, p.groundBody);
  if (p.groundTail) groundTail(c);
  if (p.uniforms && c.materials.setPoseUniforms) c.materials.setPoseUniforms(p.uniforms);
  return c;
}

/**
 * Move the rig vertically so the lowest contact point sits on y = 0 of the
 * root's frame. Contacts: toe pads (always), and with `body` the underside of
 * the chest and belly (for lying down).
 */
export function groundRig(c, names, body = false) {
  const inv = _m.copy(c.root.matrixWorld).invert();
  let minY = Infinity;
  const list = names || c.bones.filter((b) => /_(t\d)$/.test(b.name)).map((b) => b.name);
  const pad = c.spec.front.toeR[0] * c.L * 0.9;
  for (const n of list) {
    const b = c.bones[c.boneIndex[n]];
    if (!b) continue;
    _v.setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv);
    minY = Math.min(minY, _v.y - pad);
  }
  if (body) {
    const tp = c.spec.torsoProfile;
    for (const [n, s] of [['rib_thorax', 0.22], ['rib_body', 0.5], ['rib_lumbar', 0.78]]) {
      const b = c.bones[c.boneIndex[n]];
      if (!b) continue;
      const pr = profileKey(tp, s);
      _v.set(0, -(pr[2] + pr[1]) * c.L * 0.97, 0).applyMatrix4(b.matrixWorld).applyMatrix4(inv);
      minY = Math.min(minY, _v.y);
    }
  }
  if (!isFinite(minY)) return;
  c.rig.position.y += -minY;
  c.root.updateMatrixWorld(true);
}

function profileKey(keys, s) {
  let i = 0;
  while (i < keys.length - 2 && s > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], f = Math.min(1, Math.max(0, (s - a[0]) / (b[0] - a[0])));
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _ax = new THREE.Vector3(), _qq = new THREE.Quaternion(), _qp = new THREE.Quaternion();
/**
 * Lay the tail on the ground: walking from the base, any segment whose end
 * dips below the ground (+ the tail's radius there) is rotated up about the
 * horizontal axis through its start, so the tail rests along the ground.
 */
export function groundTail(c) {
  const tails = c.bones.filter((b) => /^tail_\d+$/.test(b.name));
  const inv = new THREE.Matrix4().copy(c.root.matrixWorld).invert();
  const rootQ = new THREE.Quaternion(); c.root.getWorldQuaternion(rootQ);
  const tp = c.spec.tailProfile;
  let touched = false;
  for (let i = 0; i < tails.length; i++) {
    const b = tails[i];
    const next = tails[i + 1];
    b.updateMatrixWorld(true);
    _p0.setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv);
    if (next) _p1.setFromMatrixPosition(next.matrixWorld).applyMatrix4(inv);
    else { _p1.copy(b.position).normalize().multiplyScalar(b.position.length()).applyMatrix4(b.matrixWorld).applyMatrix4(inv); }
    const r = profileKey(tp, (i + 1) / tails.length)[1] * c.L * 0.9;
    const seg = _p1.clone().sub(_p0);
    const L = seg.length();
    if (L < 1e-6) continue;
    // before the tail touches the ground only dipping segments are lifted; once it lies on
    // the ground the rest follows the ground (a lifted base must not throw the tip up)
    if (_p1.y >= r && !(touched && _p1.y > r * 1.05)) continue;
    touched = true;
    const want = Math.min(1, Math.max(-1, (r - _p0.y) / L));
    const have = Math.min(1, Math.max(-1, seg.y / L));
    const delta = Math.asin(want) - Math.asin(have);
    _ax.set(seg.x, 0, seg.z);
    if (_ax.lengthSq() < 1e-9) continue;
    _ax.normalize();
    _ax.set(-_ax.z, 0, _ax.x);                    // horizontal axis perpendicular to the segment (root frame)
    // rotation that lifts the segment end, expressed in the bone's parent frame
    _qq.setFromAxisAngle(_ax, delta);
    // root-frame -> world
    _qq.premultiply(rootQ).multiply(rootQ.clone().invert());
    b.parent.getWorldQuaternion(_qp);
    const local = _qp.clone().invert().multiply(_qq).multiply(_qp);
    b.quaternion.premultiply(local);
    b.updateMatrixWorld(true);
  }
}
