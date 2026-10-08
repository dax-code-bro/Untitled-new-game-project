// Vegetation + rocks, scattered deterministically per 128 m cell around the player.
// Every type is one InstancedMesh (near cells cast shadows, far cells don't).
// Trunks/rocks register as cylinder colliders so trees are real cover.
import * as THREE from 'three';
import { heightAt, normalAt, regionAt, biomeWeights, POIS, WORLD } from './terrain.js';
import { waterLevelAt } from './physics.js';
import { mulberry32 } from './noise.js';

const CELL = 128;
const LOAD_R = 760;
const SHADOW_R = 190;

// ---------------------------------------------------------------- procedural low-poly models (vertex colored)
function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const T = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  return geo;
};

function makeModels() {
  const M = {};
  // giant conifer (south forest): ~30 m at scale 1
  M.pine = merge([
    colored(T(new THREE.CylinderGeometry(0.35, 0.75, 12, 7), 0, 6, 0), 0x4a3424),
    colored(T(new THREE.ConeGeometry(5.2, 11, 8), 0, 12, 0), 0x2f4a26),
    colored(T(new THREE.ConeGeometry(4.1, 9, 8), 0, 18, 0), 0x355428),
    colored(T(new THREE.ConeGeometry(2.8, 8, 8), 0, 24, 0), 0x3b5c2c),
  ]);
  M.snowpine = merge([
    colored(T(new THREE.CylinderGeometry(0.25, 0.5, 6, 6), 0, 3, 0), 0x4a3424),
    colored(T(new THREE.ConeGeometry(3.4, 7, 7), 0, 6.5, 0), 0x2c4232),
    colored(T(new THREE.ConeGeometry(3.0, 2.2, 7), 0, 9.1, 0), 0xe8eef4),
    colored(T(new THREE.ConeGeometry(2.4, 6, 7), 0, 11, 0), 0x2f4636),
    colored(T(new THREE.ConeGeometry(1.6, 2.6, 7), 0, 14.2, 0), 0xf2f6fa),
  ]);
  M.oak = merge([
    colored(T(new THREE.CylinderGeometry(0.45, 0.8, 7, 7), 0, 3.5, 0), 0x4f3a28),
    colored(T(new THREE.IcosahedronGeometry(4.6, 0), 0, 9, 0, 0, 0, 0, 1, 0.75, 1), 0x4a6a2e),
    colored(T(new THREE.IcosahedronGeometry(3.4, 0), 2.6, 8, 1.2, 0, 0, 0, 1, 0.75, 1), 0x557434),
    colored(T(new THREE.IcosahedronGeometry(3.2, 0), -2.4, 8.5, -1.5, 0, 0, 0, 1, 0.75, 1), 0x45622a),
  ]);
  M.jungle = merge([
    colored(T(new THREE.CylinderGeometry(0.45, 0.9, 18, 7), 0, 9, 0), 0x5a4a38),
    colored(T(new THREE.ConeGeometry(1.8, 3, 6), 0, 1.5, 0), 0x4a3c2c), // buttress roots
    colored(T(new THREE.IcosahedronGeometry(6.5, 0), 0, 19, 0, 0, 0, 0, 1, 0.4, 1), 0x2f5a22),
    colored(T(new THREE.IcosahedronGeometry(4.5, 0), 3.5, 17.5, 2, 0, 0, 0, 1, 0.45, 1), 0x3a6a28),
    colored(T(new THREE.IcosahedronGeometry(4.2, 0), -3.6, 18, -2.2, 0, 0, 0, 1, 0.45, 1), 0x285020),
  ]);
  const palmParts = [];
  for (let i = 0; i < 5; i++) palmParts.push(colored(T(new THREE.CylinderGeometry(0.22 - i * 0.02, 0.26 - i * 0.02, 2.2, 6), Math.sin(i * 0.35) * 0.9, 1.1 + i * 2.1, 0, 0, 0, -0.12 * i), 0x7a6648));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    palmParts.push(colored(T(new THREE.ConeGeometry(0.7, 5.5, 4), 2.0 + Math.cos(a) * 2.2, 10.6, Math.sin(a) * 2.2, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2, 1, 1, 0.25), 0x4a7a2a));
  }
  M.palm = merge(palmParts);
  M.bush = merge([
    colored(T(new THREE.IcosahedronGeometry(1.1, 0), 0, 0.8, 0, 0, 0, 0, 1.3, 0.8, 1.2), 0x46622c),
    colored(T(new THREE.IcosahedronGeometry(0.8, 0), 0.8, 0.6, 0.3), 0x506c32),
  ]);
  const fern = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; fern.push(colored(T(new THREE.ConeGeometry(0.35, 2.2, 3), Math.cos(a) * 0.7, 0.6, Math.sin(a) * 0.7, Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1, 1, 1, 0.3), 0x3f7a2a)); }
  M.fern = merge(fern);
  M.cactus = merge([
    colored(T(new THREE.CylinderGeometry(0.32, 0.38, 6, 8), 0, 3, 0), 0x4f7a3a),
    colored(T(new THREE.CylinderGeometry(0.2, 0.22, 1.4, 6), 0.75, 2.8, 0, 0, 0, Math.PI / 2), 0x4f7a3a),
    colored(T(new THREE.CylinderGeometry(0.2, 0.22, 2.2, 6), 1.4, 3.8, 0), 0x4f7a3a),
    colored(T(new THREE.CylinderGeometry(0.18, 0.2, 1.2, 6), -0.65, 3.6, 0, 0, 0, Math.PI / 2), 0x4f7a3a),
    colored(T(new THREE.CylinderGeometry(0.18, 0.2, 1.6, 6), -1.2, 4.3, 0), 0x4f7a3a),
  ]);
  const dead = [];
  for (let i = 0; i < 5; i++) dead.push(colored(T(new THREE.CylinderGeometry(0.03, 0.05, 1.3, 4), 0, 0.5, 0, Math.cos(i) * 0.7, i, Math.sin(i * 2) * 0.7), 0x8a7050));
  M.deadbush = merge(dead);
  M.rock = merge([colored(T(new THREE.DodecahedronGeometry(1, 0), 0, 0.35, 0, 0, 0, 0, 1.3, 0.75, 1.05), 0x77706a)]);
  M.snowrock = merge([
    colored(T(new THREE.DodecahedronGeometry(1, 0), 0, 0.35, 0, 0, 0, 0, 1.3, 0.75, 1.05), 0x7d7f85),
    colored(T(new THREE.DodecahedronGeometry(0.85, 0), 0, 0.72, 0, 0, 0, 0, 1.15, 0.35, 0.95), 0xf0f4f8),
  ]);
  M.sandrock = merge([colored(T(new THREE.DodecahedronGeometry(1, 0), 0, 0.3, 0, 0, 0, 0, 1.4, 0.6, 1.1), 0xb48f62)]);
  M.log = merge([colored(T(new THREE.CylinderGeometry(0.45, 0.5, 7, 7), 0, 0.45, 0, 0, 0, Math.PI / 2), 0x5a4330)]);
  return M;
}

// what grows where: [type, count per cell, minScale, maxScale, collider radius at scale 1, collider height]
const FLORA = {
  s: [['pine', 46, 0.8, 1.6, 0.6, 30], ['oak', 16, 0.8, 1.3, 0.65, 7], ['bush', 55, 0.6, 1.4, 0, 0], ['rock', 9, 0.8, 3.2, 0.9, 1.1], ['log', 6, 0.8, 1.2, 0, 0], ['fern', 20, 0.7, 1.2, 0, 0]],
  e: [['jungle', 38, 0.8, 1.4, 0.75, 18], ['palm', 14, 0.8, 1.2, 0.3, 10], ['fern', 120, 0.7, 1.5, 0, 0], ['bush', 50, 0.7, 1.5, 0, 0], ['rock', 4, 0.8, 2.5, 0.9, 1.1]],
  w: [['cactus', 5, 0.7, 1.3, 0.35, 6], ['deadbush', 14, 0.7, 1.4, 0, 0], ['sandrock', 6, 0.8, 3.5, 0.95, 1.0]],
  n: [['snowpine', 22, 0.7, 1.4, 0.45, 15], ['snowrock', 20, 0.8, 4, 0.95, 1.1]],
  hub: [['oak', 4, 0.8, 1.2, 0.65, 7], ['bush', 18, 0.6, 1.3, 0, 0], ['rock', 3, 0.8, 2, 0.9, 1.1]],
  beach: [['palm', 5, 0.8, 1.3, 0.3, 10], ['rock', 2, 0.8, 2.2, 0.9, 1.1], ['log', 2, 0.8, 1.2, 0, 0]],
};

export class Scatter {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.models = makeModels();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.cells = new Map();
    this.dirty = true;
    this.center = null;
    this.meshes = {};
    this.cap = {};
    for (const k of Object.keys(this.models)) {
      for (const tier of ['near', 'far']) {
        const cap = tier === 'near' ? 6000 : 30000;
        const m = new THREE.InstancedMesh(this.models[k], this.mat, cap);
        m.count = 0;
        m.frustumCulled = false;
        m.castShadow = tier === 'near';
        m.receiveShadow = true;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(m);
        this.meshes[`${k}_${tier}`] = m;
        this.cap[`${k}_${tier}`] = cap;
      }
    }
    this.queue = [];
  }

  genCell(cx, cz) {
    const rng = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x5eed);
    const items = [], trunks = [];
    const x0 = cx * CELL, z0 = cz * CELL;
    // region at the cell center decides the flora table; each candidate re-checks its own spot
    const centerRegion = regionAt(x0 + CELL / 2, z0 + CELL / 2);
    const table = FLORA[centerRegion];
    if (!table) return { items, trunks };
    const nearPoi = POIS.filter((p) => Math.abs(p.x - x0 - CELL / 2) < CELL + p.r && Math.abs(p.z - z0 - CELL / 2) < CELL + p.r);
    for (const [type, count, s0, s1, cr, ch] of table) {
      let n = count;
      if (type === 'snowpine') n = Math.round(count * Math.max(0, 1 - (heightAt(x0 + 64, z0 + 64) - 150) / 900));
      for (let i = 0; i < n; i++) {
        const x = x0 + rng() * CELL, z = z0 + rng() * CELL;
        const s = s0 + rng() * (s1 - s0), rot = rng() * Math.PI * 2;
        if (nearPoi.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 6)) continue;
        const h = heightAt(x, z);
        if (h < 1.2 && type !== 'rock') continue;
        if (waterLevelAt(x, z, h) !== null) continue;
        const reg = regionAt(x, z, h);
        if (reg !== centerRegion && !(reg === 'beach' && type === 'palm')) continue;
        const ny = normalAt(x, z, 2)[1];
        if (ny < 0.8 && !type.includes('rock')) continue;
        items.push({ type, x, y: h - (type.includes('rock') ? 0.2 * s : 0.1), z, s, rot });
        if (cr > 0) trunks.push({ x, z, r: cr * s, h: ch * s, base: h });
      }
    }
    return { items, trunks };
  }

  update(dt, pos, budgetMs = 4) {
    const pcx = Math.floor(pos.x / CELL), pcz = Math.floor(pos.z / CELL);
    const key = `${pcx},${pcz}`;
    if (key !== this.center) {
      this.center = key;
      const R = Math.ceil(LOAD_R / CELL);
      const want = new Set();
      const add = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        const d = Math.hypot(dx * CELL, dz * CELL);
        if (d > LOAD_R) continue;
        const k = `${cx},${cz}`;
        want.add(k);
        if (!this.cells.has(k)) add.push({ k, cx, cz, d });
      }
      for (const [k, c] of this.cells) if (!want.has(k)) { this.physics.removeTrunks(k, c.trunks); this.cells.delete(k); this.dirty = true; }
      add.sort((a, b) => a.d - b.d);
      this.queue = add;
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const c = this.queue.shift();
      if (this.cells.has(c.k)) continue;
      const cell = this.genCell(c.cx, c.cz);
      cell.cx = c.cx; cell.cz = c.cz;
      this.cells.set(c.k, cell);
      this.physics.addTrunks(c.k, cell.trunks);
      this.dirty = true;
    }
    this.rebuildT = (this.rebuildT || 0) - dt;
    if (this.dirty && (this.rebuildT <= 0 || !this.queue.length)) { this.rebuild(pos); this.rebuildT = 0.5; }
  }

  rebuild(pos) {
    this.dirty = false;
    const counts = {};
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const k in this.meshes) counts[k] = 0;
    for (const c of this.cells.values()) {
      const near = Math.hypot((c.cx + 0.5) * CELL - pos.x, (c.cz + 0.5) * CELL - pos.z) < SHADOW_R;
      for (const it of c.items) {
        const k = `${it.type}_${near ? 'near' : 'far'}`;
        if (counts[k] >= this.cap[k]) continue;
        q.setFromAxisAngle(up, it.rot);
        sc.setScalar(it.s);
        p.set(it.x, it.y, it.z);
        m4.compose(p, q, sc);
        this.meshes[k].setMatrixAt(counts[k]++, m4);
      }
    }
    for (const k in this.meshes) {
      const m = this.meshes[k];
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    }
  }

  warmup(pos) {
    this.update(0, pos, 1e9);
    this.rebuild(pos);
  }

  get instanceCount() { let n = 0; for (const k in this.meshes) n += this.meshes[k].count; return n; }
}
