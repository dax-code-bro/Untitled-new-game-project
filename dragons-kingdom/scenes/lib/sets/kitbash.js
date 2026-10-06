// Kitbash pieces from scanned models (VFX "kitbashing": real photo-scanned
// rock faces and boulders, scaled, rotated and overlapped into new cliffs and
// shores - nobody can recognise a scan once it is scaled 3x and half buried).
//
//   const kit = await loadKit(ctx, 'model/babylon_coastal_cliff');
//   kit.pieces['coastal_cliff_01']   -> { geometry, material, bbox }  (geometry in metres, y up, base at y = 0)
//   scene.add(kit.instance('rock_moss_set_01', placements));          // InstancedMesh
//
// The Babylon.js "coastal cliff" composition (CC BY 4.0, credit in
// assets-lib/CREDITS.md) bundles Poly Haven scans (CC0): coastal_cliff_01,
// namaqualand_cliff_01/02, coast_land_rocks_04, rock_moss_set_01/02, moss.
import * as THREE from 'three';
import { loadModel } from '../assets.js';

export async function loadKit(ctx, id, opts = {}) {
  const { scene: root } = await loadModel(id, ctx, { shadows: true });
  root.updateMatrixWorld(true);
  const pieces = {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = (Array.isArray(o.material) ? o.material[0] : o.material).name || o.name;
    // bake the node transform (the export carries mirroring scales) into a fresh geometry,
    // without the composition's placement: keep only rotation/scale relative to its parent chain
    const g = o.geometry.clone();
    const m = o.matrixWorld.clone();
    const pos = new THREE.Vector3(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
    m.decompose(pos, q, s);
    const noT = new THREE.Matrix4().compose(new THREE.Vector3(), q, s);
    g.applyMatrix4(noT);
    if (noT.determinant() < 0) {               // mirrored: flip winding so faces stay outward
      const idx = g.index;
      if (idx) for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
    }
    // turn the piece so its main face (area-weighted mean normal, horizontal part) looks along +z
    {
      g.computeVertexNormals();
      const pa = g.attributes.position, idx = g.index;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), sum = new THREE.Vector3();
      const tri = idx ? idx.count / 3 : pa.count / 3;
      for (let i = 0; i < tri; i++) {
        const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
        a.fromBufferAttribute(pa, i0); b.fromBufferAttribute(pa, i1); c.fromBufferAttribute(pa, i2);
        n.subVectors(c, b).cross(a.sub(b));
        sum.add(n);
      }
      const horiz = Math.hypot(sum.x, sum.z);
      if (horiz > 0.25 * sum.length()) g.rotateY(Math.atan2(sum.x, sum.z) * -1 + 0);
    }
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    g.computeBoundingBox(); g.computeBoundingSphere();
    if (!pieces[name] || g.attributes.position.count > pieces[name].geometry.attributes.position.count) {
      const mat = (Array.isArray(o.material) ? o.material[0] : o.material);
      mat.side = opts.doubleSided === false ? THREE.FrontSide : THREE.DoubleSide;
      pieces[name] = { geometry: g, material: mat, bbox: g.boundingBox.clone(), name };
    }
  });
  return {
    pieces,
    names: Object.keys(pieces),
    /** placements: [{ p:[x,y,z], s: number|[x,y,z], r: yaw, tilt?: [x,z] }] */
    instance(name, placements, opts = {}) {
      const P = pieces[name];
      if (!P) throw new Error(`kit piece ${name} not found (${Object.keys(pieces).join(', ')})`);
      const mat = opts.material || P.material;
      const mesh = new THREE.InstancedMesh(P.geometry, mat, placements.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      placements.forEach((pl, i) => {
        e.set(pl.tilt ? pl.tilt[0] : 0, pl.r ?? 0, pl.tilt ? pl.tilt[1] : 0, 'YXZ');
        q.setFromEuler(e);
        const s = Array.isArray(pl.s) ? pl.s : [pl.s ?? 1, pl.s ?? 1, pl.s ?? 1];
        m.compose(v.set(...pl.p), q, sc.set(...s));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.name = `kit:${name}`;
      return mesh;
    },
  };
}
