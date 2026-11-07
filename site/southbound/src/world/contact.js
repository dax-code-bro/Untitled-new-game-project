// Contact shadows round the foot of every building (G12): a soft dark band on the ground (or the
// pavement) along each wall, darkest against it and gone a metre and a bit out, so buildings sit IN
// the ground instead of floating on it. The facade shader darkens the bottom of the wall to match
// (world/buildings.js). One instanced mesh for the whole map, on every preset; cars carry their own
// (entities/vehicle.js).
import * as THREE from 'three';

let tex = null;
function bandTexture() {
  if (tex) return tex;
  const W = 64, H = 32, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = (j + 0.5) / H, u = (i + 0.5) / W; // v: 0 at the wall .. 1 out; u along the wall
    const ends = Math.min(1, Math.min(u, 1 - u) / 0.12);
    const a = Math.pow(1 - v, 2.2) * ends;
    const k = (j * W + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 0; img.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  return (tex = new THREE.CanvasTexture(c));
}

export function buildContactShadows(B, { scene, hm, collision }) {
  const mats = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  const DEPTH = 1.35;
  for (const b of B) {
    const g0 = hm.height(b.x, b.z);
    if (b.y - g0 > 1.2) continue; // up on something: no ground to darken
    for (const [nx, nz, len, half] of [[0, 1, b.w, b.d / 2], [0, -1, b.w, b.d / 2], [1, 0, b.d, b.w / 2], [-1, 0, b.d, b.w / 2]]) {
      const x = b.x + nx * (half + DEPTH / 2), z = b.z + nz * (half + DEPTH / 2);
      const y = Math.max(hm.height(x, z), collision.surface(x, z, b.y + 1.0)) + 0.03;
      if (y > b.y + 0.9) continue; // the ground there is well above the floor: a wall buried in a bank
      // the band's local +z points away from the wall
      q.setFromAxisAngle(UP, Math.atan2(nx, nz));
      mats.push(m4.compose(p.set(x, y, z), q, s.set(len + 0.5, 1, DEPTH)).clone());
    }
  }
  if (!mats.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  // the texture's v runs along local z: flip so v = 0 sits against the wall (local -z side)
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const mat = new THREE.MeshBasicMaterial({ map: bandTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mm, i) => im.setMatrixAt(i, mm));
  im.renderOrder = 1; im.userData.noHit = true; im.userData.noReflect = true;
  im.computeBoundingSphere();
  scene.add(im);
  return { count: mats.length, mesh: im };
}
