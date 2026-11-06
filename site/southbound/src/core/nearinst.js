// Draw only the nearby instances of things scattered over the whole city.
//
// Parking meters, hydrants and street junk are one instanced mesh each for the whole map, so every
// one of them (1,359 meters alone) went to the GPU every frame, and again into the shadow map,
// even though past a hundred-odd metres they're a pixel or two. This keeps the full list in a
// coarse grid and, whenever the camera has moved a few metres, packs just the ones within range
// into the front of the instance buffer and draws that many.
import * as THREE from 'three';

const CELL = 64;
const all = [];
export const NEAR_RANGE = { Phone: 80, Low: 95, Medium: 115, High: 140, Ultra: 180, Cinematic: 240 };

// im: an InstancedMesh with room for every instance; matrices: one Matrix4 (world) per instance
export function nearInstances(im, matrices, range = 140) {
  const grid = new Map(), pos = matrices.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  pos.forEach((p, i) => {
    const k = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
    let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(i);
  });
  const at = new THREE.Vector3(1e9, 0, 1e9);
  const entry = {
    im, total: matrices.length, shown: 0,
    update(cam, force = false) {
      if (!force && (cam.x - at.x) ** 2 + (cam.z - at.z) ** 2 < 8 * 8) return;
      at.set(cam.x, 0, cam.z);
      const R2 = range * range, c0 = Math.floor((cam.x - range) / CELL), c1 = Math.floor((cam.x + range) / CELL);
      const r0 = Math.floor((cam.z - range) / CELL), r1 = Math.floor((cam.z + range) / CELL);
      let n = 0;
      for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) {
        const c = grid.get(cx + ',' + cz);
        if (!c) continue;
        for (const i of c) {
          const p = pos[i];
          if ((p.x - cam.x) ** 2 + (p.z - cam.z) ** 2 > R2) continue;
          im.setMatrixAt(n++, matrices[i]);
        }
      }
      im.count = n; entry.shown = n;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere(); // so it's frustum-culled as the small cluster it now is
    },
  };
  im.frustumCulled = true;
  all.push(entry);
  return entry;
}

export function updateNearInstances(cam) { for (const e of all) e.update(cam); }
export const nearInstanceStats = () => all.reduce((s, e) => { s.total += e.total; s.shown += e.shown; return s; }, { total: 0, shown: 0 });
