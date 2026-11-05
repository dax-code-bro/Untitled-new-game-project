// Wooden utility poles with crossarms and sagging wires along the roads that
// run out of Port Calvera and Mill Creek: the thing that tells you a town is
// near before you see it. Poles are instanced; all the wires are one line set.
import * as THREE from 'three';
import { CITY, TOWN } from './layout.js';

export function createPowerLines(scene, graph, hm, collision, q) {
  const cityBox = [CITY.x0 - 20, CITY.x0 + CITY.nx * CITY.pitch + 20, CITY.z0 - 20, CITY.z0 + CITY.nz * CITY.pitch + 20];
  const townBox = [TOWN.x0 - 15, TOWN.x0 + TOWN.nx * TOWN.pitch + 15, TOWN.z0 - 15, TOWN.z0 + TOWN.nz * TOWN.pitch + 15];
  const inside = (b, x, z) => x > b[0] && x < b[1] && z > b[2] && z < b[3];
  const dist = (b, x, z) => Math.hypot(Math.max(b[0] - x, 0, x - b[1]), Math.max(b[2] - z, 0, z - b[3]));
  const max = q.label === 'Phone' ? 160 : 420;
  const poles = [];
  const wires = [];
  const SPAN = 38, H = 9.2;
  for (const e of graph.edges) {
    if (poles.length >= max) break;
    let acc = SPAN * 0.5, prev = null;
    for (let i = 1; i < e.pts.length && poles.length < max; i++) {
      const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      for (let s = 0; s < L; s += 2) {
        acc += 2; if (acc < SPAN) continue; acc = 0;
        const x0 = ax + tx * s, z0 = az + tz * s;
        const near = Math.min(dist(cityBox, x0, z0), dist(townBox, x0, z0));
        if (inside(cityBox, x0, z0) || inside(townBox, x0, z0) || near > 900) { prev = null; continue; }
        const off = (e.width || 8) / 2 + 3.2, x = x0 + tz * off, z = z0 - tx * off;
        const y = hm.height(x, z);
        if (y < hm.waterLevel(x, z) + 0.3) { prev = null; continue; }
        let blocked = false; collision.query(x, z, 1.5, (it) => { if (it.t === 0) blocked = true; });
        if (blocked) { prev = null; continue; }
        const p = { x, y, z, yaw: Math.atan2(tx, tz) };
        poles.push(p);
        collision.addCircle?.(x, z, 0.18);
        if (prev && Math.hypot(prev.x - x, prev.z - z) < SPAN * 1.6) wires.push([prev, p]);
        prev = p;
      }
    }
  }
  if (!poles.length) return { count: 0 };
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.15, H + 0.4, 7).translate(0, (H + 0.4) / 2, 0), wood, poles.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.12, 0.12).translate(0, H - 0.3, 0), wood, poles.length);
  const ins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0x6a8a6a, roughness: 0.3 }), poles.length * 3);
  const xf = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.75, 10).translate(0, H - 1.6, 0.32), new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.6 }), poles.length);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  let nx = 0;
  poles.forEach((p, i) => {
    qq.setFromAxisAngle(Y, p.yaw + Math.PI / 2);
    m4.compose(v.set(p.x, p.y - 0.4, p.z), qq, one); pole.setMatrixAt(i, m4); arm.setMatrixAt(i, m4);
    m4.compose(v.set(p.x, p.y - 0.4, p.z), qq, i % 4 === 0 ? one : new THREE.Vector3(0, 0, 0)); xf.setMatrixAt(i, m4); // a transformer on some poles
    for (const k of [-1, 0, 1]) { const o = new THREE.Vector3(k * 1.0, H - 0.15, 0).applyQuaternion(qq); m4.compose(v.set(p.x + o.x, p.y - 0.4 + o.y, p.z + o.z), new THREE.Quaternion(), one); ins.setMatrixAt(nx++, m4); }
  });
  for (const im of [pole, arm, ins, xf]) { im.castShadow = true; im.receiveShadow = true; im.userData.noHit = true; im.frustumCulled = false; scene.add(im); }
  // wires: three per span, sagging
  const pos = [];
  for (const [a, b] of wires) {
    const qa = new THREE.Quaternion().setFromAxisAngle(Y, a.yaw + Math.PI / 2), qb = new THREE.Quaternion().setFromAxisAngle(Y, b.yaw + Math.PI / 2);
    for (const k of [-1, 0, 1]) {
      const pa = new THREE.Vector3(k * 1.0, H - 0.07, 0).applyQuaternion(qa).add(new THREE.Vector3(a.x, a.y - 0.4, a.z));
      const pb = new THREE.Vector3(k * 1.0, H - 0.07, 0).applyQuaternion(qb).add(new THREE.Vector3(b.x, b.y - 0.4, b.z));
      const N = 8, sag = 0.7;
      for (let s = 0; s < N; s++) {
        const t0 = s / N, t1 = (s + 1) / N;
        const p0 = pa.clone().lerp(pb, t0), p1 = pa.clone().lerp(pb, t1);
        p0.y -= sag * 4 * t0 * (1 - t0); p1.y -= sag * 4 * t1 * (1 - t1);
        pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
    }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8 }));
  lines.frustumCulled = false; lines.userData.noHit = true; scene.add(lines);
  scene.userData.powerlines = { poles, wires, H }; // for the placement audit
  return { count: poles.length };
}
