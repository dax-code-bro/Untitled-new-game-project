// Cars parked along the kerbs of Port Calvera's streets. Every stall between the white
// parking-lane lines either always has a car or never does (and always the same kind of
// car), so a street looks the same when you come back. Only the stalls round the player are
// filled: cars are put out where you aren't looking (or still far off) and taken back in once
// you've gone. They're ordinary parked cars, so you can break into one and drive it away.
import * as THREE from 'three';
import { nearInstances, NEAR_RANGE } from '../core/nearinst.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Vehicle, randomCarType } from '../entities/vehicle.js';
import { mulberry32 } from '../util.js';
import { CITY } from '../world/layout.js';

const tint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
// a single-head parking meter and a fire hydrant (origin on the pavement)
const meterGeo = () => mergeGeometries([
  tint(new THREE.CylinderGeometry(0.035, 0.04, 1.05, 8).translate(0, 0.525, 0), 0x3d4247),
  tint(new THREE.BoxGeometry(0.17, 0.3, 0.13).translate(0, 1.18, 0), 0x5b6066),
  tint(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 0.8).translate(0, 1.33, 0), 0x5b6066),
  tint(new THREE.BoxGeometry(0.11, 0.09, 0.02).translate(0, 1.22, 0.066), 0xc9d2c8),
]);
const hydrantGeo = () => mergeGeometries([
  tint(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 12).translate(0, 0.04, 0), 0x9a2018),
  tint(new THREE.CylinderGeometry(0.12, 0.13, 0.58, 12).translate(0, 0.37, 0), 0xb3261c),
  tint(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12).translate(0, 0.66, 0), 0x9a2018),
  tint(new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.68, 0), 0xb3261c),
  tint(new THREE.CylinderGeometry(0.025, 0.035, 0.06, 5).translate(0, 0.82, 0), 0xb3261c),
  tint(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10).rotateZ(Math.PI / 2).translate(0.15, 0.46, 0), 0xb3261c),
  tint(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10).rotateZ(Math.PI / 2).translate(-0.15, 0.46, 0), 0xb3261c),
  tint(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0.42, 0.14), 0xb3261c),
]);

const CAP = { Phone: 0, Low: 6, Medium: 10, High: 16, Ultra: 24 };
const R_IN = 85, R_OUT = 125, CELL = 64;

export function installKerbside(game) {
  const { graph, scene, lib, collision, q, camera } = game;
  const cap = CAP[q.label] ?? 10;
  const meters = [], hydrants = [];
  const onBlock = (x, z) => x > CITY.x0 && x < CITY.x0 + CITY.nx * CITY.pitch && z > CITY.z0 && z < CITY.z0 + CITY.nz * CITY.pitch;

  // stalls: every 8 m along both kerbs of each 16 m city street (the ticks in the road paint),
  // not across an intersection, a driveway or a hydrant
  const slots = [];
  const grid = new Map();
  for (const e of graph.edges) {
    if (e.kind === 'highway' || e.width < 14) continue;
    const P = e.pts;
    let acc = 0, total = 0;
    for (let k = 1; k < P.length; k++) total += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
    for (let i = 1; i < P.length; i++) {
      const ax = P[i - 1][0], az = P[i - 1][1], dx = P[i][0] - ax, dz = P[i][1] - az, L = Math.hypot(dx, dz);
      if (L < 1e-3) continue;
      const tx = dx / L, tz = dz / L;
      for (let s = Math.ceil((acc - 4) / 8) * 8 + 4; s < acc + L; s += 8) {
        const t = s - acc, x0 = ax + tx * t, z0 = az + tz * t;
        // keep clear of both ends of the edge (the intersections and their crossings)
        if (s < 16 || s > total - 16) continue;
        for (const side of [-1, 1]) {
          const off = e.width / 2 - 1.4;
          const x = x0 - tz * off * side, z = z0 + tx * off * side;
          let clear = true;
          collision.query(x, z, 4, (it) => { if (clear && it.t === 0 && !it.data?.walkable && x > it.minX - 1.4 && x < it.maxX + 1.4 && z > it.minZ - 1.4 && z < it.maxZ + 1.4) clear = false; });
          if (!clear) continue;
          const hr = mulberry32(Math.floor(x * 7.13) * 92821 + Math.floor(z * 3.71) * 68917);
          const h = hr(), h2 = hr();
          // on the pavement beside the stall: a hydrant now and then (no parking in front of it),
          // otherwise a meter at the head of the stall
          const po = e.width / 2 + 0.45, pk = Math.min(e.ys ? e.ys.length - 1 : 0, i);
          let post = false; // a tree pit or a lamp post already there
          collision.query(x0 - tz * po * side, z0 + tx * po * side, 3, (it) => { if (it.t === 1 && it.r > 0 && Math.hypot(it.x - (x0 - tz * po * side), it.z - (z0 + tx * po * side)) < it.r + 1.1) post = true; });
          if (!post && onBlock(x0 - tz * po * side, z0 + tx * po * side)) {
            const fy = (e.ys ? e.ys[pk] : 0) + 0.22 + 0.1 - 0.1;
            if (h2 < 0.09) { hydrants.push([x0 - tz * po * side, fy, z0 + tx * po * side, Math.atan2(-tz * side, tx * side)]); continue; }
            const ms = -3.1;
            meters.push([x0 - tz * po * side + tx * ms * side, fy, z0 + tx * po * side + tz * ms * side, Math.atan2(tz * side, -tx * side) + Math.PI]);
          }
          if (h > 0.42 || !cap) continue; // an empty stall
          const y = e.ys ? e.ys[Math.min(e.ys.length - 1, i)] : game.hm.height(x, z);
          const slot = { x, z, y, heading: Math.atan2(tx * side, tz * side), seed: Math.floor(h * 1e6), v: null };
          const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(slots.length);
          slots.push(slot);
        }
      }
      acc += L;
    }
  }

  // the stalls in the city's parking lots (painted by roads.parkify)
  if (cap) for (const st of game.city.lotStalls || []) {
    const h = mulberry32(Math.floor(st.x * 7.13) * 92821 + Math.floor(st.z * 3.71) * 68917)();
    if (h > 0.5) continue;
    const key = Math.floor(st.x / CELL) + ',' + Math.floor(st.z / CELL);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(slots.length);
    slots.push({ x: st.x, z: st.z, y: st.y, heading: st.heading + (h < 0.08 ? Math.PI : 0), seed: Math.floor(h * 1e6), v: null });
  }

  // the meters and hydrants: two instanced meshes for the whole city, with a post to bump into
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  for (const [list, geo, rough, metal, r] of [[meters, meterGeo(), 0.45, 0.6, 0.12], [hydrants, hydrantGeo(), 0.55, 0.2, 0.2]]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal }), list.length);
    const mats = list.map(([x, y, z, ry]) => { collision.addCircle(x, z, r); return new THREE.Matrix4().compose(at.set(x, y, z), qq.setFromAxisAngle(UP, ry), one); });
    im.castShadow = q.shadows > 0; im.receiveShadow = true; im.userData.noReflect = true;
    // only the ones near the camera are drawn (core/nearinst.js): there are well over a thousand meters
    nearInstances(im, mats, NEAR_RANGE[q.label] || 140).update(game.camera ? game.camera.position : at.set(0, 0, 0), true);
    scene.add(im);
  }
  if (!cap) return { update() {}, slots: () => 0, live: () => 0, furniture: () => [meters.length, hydrants.length] };

  const live = new Set();
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 3);
  let timer = 0;

  const release = (slot) => {
    const v = slot.v; slot.v = null; live.delete(slot);
    const i = game.parked.indexOf(v);
    if (i >= 0) game.parked.splice(i, 1);
    scene.remove(v.group);
    v.dispose?.();
  };

  return {
    slots: () => slots.length,
    furniture: () => [meters.length, hydrants.length],
    live: () => live.size,
    update(dt) {
      timer -= dt;
      if (timer > 0) return;
      timer = 0.5;
      if (game.S.indoors) return;
      const p = game.player.pos;
      // let go of cars that have left their stall (stolen, pushed, blown up) or that are far behind
      for (const slot of [...live]) {
        const v = slot.v;
        if (!game.parked.includes(v) || v === game.S.vehicle || v === game.S.lastVehicle) { slot.v = null; live.delete(slot); continue; }
        const moved = Math.hypot(v.pos.x - slot.x, v.pos.z - slot.z) > 0.6;
        // a car shunted out of its stall stays where it ended up until you've left it behind
        if (Math.hypot(slot.x - p.x, slot.z - p.z) > R_OUT && (!moved || Math.hypot(v.pos.x - p.x, v.pos.z - p.z) > R_OUT)) release(slot);
      }
      if (live.size >= cap) return;
      // fill the nearest empty stalls; close ones only when they're out of view
      pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pm);
      const cand = [];
      const c0 = Math.floor((p.x - R_IN) / CELL), c1 = Math.floor((p.x + R_IN) / CELL);
      const r0 = Math.floor((p.z - R_IN) / CELL), r1 = Math.floor((p.z + R_IN) / CELL);
      for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) for (const k of grid.get(cx + ',' + cz) || []) {
        const s = slots[k]; if (s.v) continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d > R_IN) continue;
        cand.push([d, s]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      let spawned = 0;
      const first = live.size === 0; // just arrived (game start, a teleport): fill the street at once
      for (const [d, s] of cand) {
        if (live.size >= cap || spawned >= (first ? cap : 2)) break;
        sph.center.set(s.x, s.y + 1, s.z);
        if (!first && d < R_IN * 0.7 && frustum.intersectsSphere(sph)) continue;
        // nothing else standing in the stall (a car you left there, a police cruiser)
        if (game.parked.some((v) => Math.hypot(v.pos.x - s.x, v.pos.z - s.z) < 2.3)) continue;
        const v = new Vehicle(lib, randomCarType(mulberry32(s.seed)));
        v.pos.set(s.x, s.y + 0.05, s.z);
        v.heading = s.heading;
        v.night = 0;
        v.sync(0);
        scene.add(v.group);
        game.parked.push(v);
        s.v = v; live.add(s);
        spawned++;
      }
    },
  };
}
