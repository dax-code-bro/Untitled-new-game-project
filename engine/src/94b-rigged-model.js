/* ============================================================
   RIGGED MODEL LOADING

   An imported body arrives as one blob: positions, normals,
   UVs, four bone indices and four weights a vertex, the index
   buffer, and the rig it was bound in. Everything expensive —
   measuring the model's joints, bending a skeleton to match it,
   solving skin weights — happened once, offline; this is only
   the read.

   The geometry is shared by every copy of the model, but each
   copy needs its own skeleton, because animating one means
   writing to its bones. So the rig comes back as a description
   rather than an object, and skeletonFromRig stamps out a fresh
   one per character.
   ============================================================ */

const RIGGED_MAGIC = 0x314B4C57;      // "WLK1"

function parseRiggedMesh(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== RIGGED_MAGIC) throw new Error('not a rigged mesh');
  const nv = dv.getUint32(4, true);
  const ni = dv.getUint32(8, true);
  let o = 16;
  const take = (Type, count) => {
    // The blob is packed tight, so a typed-array view of it is only safe
    // when the offset happens to be aligned; copy instead of assuming.
    const bytes = count * Type.BYTES_PER_ELEMENT;
    const out = new Type(buffer.slice(o, o + bytes));
    o += bytes;
    return out;
  };
  const positions = take(Float32Array, nv * 3);
  const normals = take(Float32Array, nv * 3);
  const uvs = take(Float32Array, nv * 2);
  const jointsB = take(Uint8Array, nv * 4);
  const weightsB = take(Uint8Array, nv * 4);
  const indices = take(Uint16Array, ni);
  const rigLen = dv.getUint32(o, true); o += 4;
  const rig = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, o, rigLen)));

  const g = new Geometry();
  g.positions = positions;
  g.normals = normals;
  g.uvs = uvs;
  g.indices = Array.from(indices);
  g.joints = new Float32Array(nv * 4);
  g.weights = new Float32Array(nv * 4);
  for (let i = 0; i < nv * 4; i++) {
    g.joints[i] = jointsB[i];
    g.weights[i] = weightsB[i] / 255;
  }
  // Weights were quantised to a byte each, so they no longer sum to one.
  for (let i = 0; i < nv; i++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += g.weights[i * 4 + k];
    if (s > 1e-6) for (let k = 0; k < 4; k++) g.weights[i * 4 + k] /= s;
    else g.weights[i * 4] = 1;
  }
  g.computeTangents();
  g.computeBounds();
  g.computeWeldGroups();
  return { geometry: g, rig };
}

/* A fresh skeleton in the model's bind pose. */
function skeletonFromRig(rig) {
  const bones = rig.map((b) => new Bone(b.n, b.p, b.t, b.q));
  const sk = new Skeleton(bones);
  sk.update();
  sk.computeBindPose();
  sk.update();
  return sk;
}
