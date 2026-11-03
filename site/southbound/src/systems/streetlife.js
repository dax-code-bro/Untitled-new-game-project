// Things lying around: alleys full of dumpsters, trash bags, pallets, cinder
// blocks, barrels and the odd abandoned couch; junk piles and tyres around the
// run-down lots on the city's edge. Open models (Quaternius Zombie Apocalypse
// Kit, CC0) drawn as instanced meshes so hundreds cost a few draw calls.
import * as THREE from 'three';
import { loadOpen } from '../assets/open.js';
import { CITY } from '../world/layout.js';

const KINDS = {
  bag1: ['TrashBag_1', 0.75], bag2: ['TrashBag_2', 0.85], pallet: ['Pallet', 1.2], palletB: ['Pallet_Broken', 1.2], block: ['CinderBlock', 0.4],
  barrel: ['Barrel', 0.9], couch: ['Couch', 2.0], tyre: ['Wheel', 0.75], tyres: ['Wheels_Stack', 1.0], cone: ['TrafficCone_1', 0.55], barrier: ['PlasticBarrier', 1.3],
};
const MIX = {
  alley: ['bag1', 'bag2', 'bag2', 'pallet', 'block', 'barrel', 'palletB', 'bag1'],
  trash: ['bag1', 'bag2', 'barrel'], pile: ['pallet', 'palletB', 'block', 'block', 'couch', 'tyres'], tyre: ['tyre', 'tyres'],
};

// one loaded model -> its meshes with the node transforms baked in (unit-normalised)
function partsOf(scene, size) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene), sz = box.getSize(new THREE.Vector3());
  const k = size / Math.max(sz.x, sz.y, sz.z), ctr = box.getCenter(new THREE.Vector3());
  const norm = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -box.min.y, -ctr.z));
  const out = [];
  scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld)); out.push({ g, m: o.material }); } });
  return out;
}

export function installStreetLife(game) {
  const { scene, collision, hm, city } = game;
  const rnd = (() => { let s = 77; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const spots = []; // {kind, x, z, rot}
  const inBuilding = (x, z, m) => {
    let hit = false;
    collision.query(x, z, 2, (it) => { if (it.t === 0 && x > it.minX - m && x < it.maxX + m && z > it.minZ - m && z < it.maxZ + m) hit = true; });
    return hit;
  };
  // alleys: the gaps between buildings inside city blocks
  const blockW = CITY.pitch - CITY.street;
  for (const bl of city.cityBlocks) {
    if (bl.type !== 'build') continue;
    let n = 0;
    for (let k = 0; k < 60 && n < 9; k++) {
      const x = bl.cx + (rnd() - 0.5) * (blockW - 8), z = bl.cz + (rnd() - 0.5) * (blockW - 8);
      if (inBuilding(x, z, 0.5)) continue;
      // tucked against a wall: there must be a building within 3 m
      let wall = false;
      collision.query(x, z, 4, (it) => { if (it.t === 0 && x > it.minX - 3 && x < it.maxX + 3 && z > it.minZ - 3 && z < it.maxZ + 3) wall = true; });
      if (!wall) continue;
      if (rnd() < 0.22) spots.push({ kind: 'dumpster', x, z, rot: rnd() < 0.5 ? 0 : Math.PI / 2 });
      else { const list = MIX.alley; const cx = x, cz = z; for (let j = 0; j < 1 + ((rnd() * 3) | 0); j++) spots.push({ kind: list[(rnd() * list.length) | 0], x: cx + (rnd() - 0.5) * 1.6, z: cz + (rnd() - 0.5) * 1.6, rot: rnd() * 6.28 }); }
      n++;
    }
  }
  // the edge of the city and the settlements
  for (const j of city.junk || []) {
    if (j.kind === 'sign') continue;
    const list = MIX[j.kind] || MIX.trash;
    if (inBuilding(j.x, j.z, 0.6)) continue;
    spots.push({ kind: list[(rnd() * list.length) | 0], x: j.x, z: j.z, rot: rnd() * 6.28 });
  }

  // dumpsters: simple boxes with a lid (green/blue/brown painted steel)
  const dumpsters = spots.filter((s) => s.kind === 'dumpster');
  if (dumpsters.length) {
    const body = new THREE.BoxGeometry(1.9, 1.15, 1.1).translate(0, 0.62, 0);
    const lid = new THREE.BoxGeometry(1.95, 0.08, 1.15).rotateX(-0.12).translate(0, 1.24, 0.02);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.35 });
    for (const [gi, g] of [body, lid].entries()) {
      const im = new THREE.InstancedMesh(g, mat, dumpsters.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), cs = new THREE.Color();
      dumpsters.forEach((d, i) => {
        const y = collision.surface(d.x, d.z, 200);
        m4.compose(new THREE.Vector3(d.x, y, d.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot), new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, cs.set([0x2f5a3a, 0x2a4566, 0x5a3e2a][i % 3]).multiplyScalar(gi ? 0.8 : 1));
        if (gi === 0) collision.addCircle(d.x, d.z, 0.7);
      });
      im.castShadow = true; im.receiveShadow = true; im.userData.hitStatic = true;
      scene.add(im);
    }
  }
  // open-model junk, instanced per part
  (async () => {
    const byKind = {};
    for (const s of spots) if (KINDS[s.kind]) (byKind[s.kind] = byKind[s.kind] || []).push(s);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const [kind, list] of Object.entries(byKind)) {
      const [file, size] = KINDS[kind];
      const g = await loadOpen('real/zk_props/' + file + '.glb');
      if (!g) continue;
      for (const part of partsOf(g.scene, size)) {
        const im = new THREE.InstancedMesh(part.g, part.m, list.length);
        list.forEach((s, i) => {
          const y = collision.surface(s.x, s.z, 200);
          m4.compose(new THREE.Vector3(s.x, y, s.z), q.setFromAxisAngle(up, s.rot), one);
          im.setMatrixAt(i, m4);
        });
        im.castShadow = size > 0.8; im.receiveShadow = true;
        im.userData.hitStatic = size > 0.8; im.userData.noReflect = true;
        im.computeBoundingSphere();
        scene.add(im);
      }
      if (size >= 1.2) for (const s of list) collision.addCircle(s.x, s.z, size * 0.35);
    }
    game.refreshHitStatics?.();
  })();
  return { count: spots.length };
}
