// Vegetation + rocks, scattered deterministically per 128 m cell around the player.
// Detailed models near you (bark, leaf/needle cards, wind, shadows), cheap cross-card models far away.
// Trunks/rocks register as cylinder colliders so trees are real cover.
import * as THREE from 'three';
import { heightAt, normalAt, regionAt, POIS } from './terrain.js';
import { waterLevelAt } from './physics.js';
import { mulberry32, makeNoise } from './noise.js';
import { windHook, coverageHook } from './materials.js';

const CELL = 128;
let LOAD_R = 760;
const NEAR_R = 210;

// ---------------------------------------------------------------- geometry helpers
// geometry with position/normal/uv/color (color defaults to white)
function prep(g, color = [1, 1, 1]) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) { c[i] = color[0]; c[i + 1] = color[1]; c[i + 2] = color[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const out = { position: new Float32Array(n * 3), normal: new Float32Array(n * 3), uv: new Float32Array(n * 2), color: new Float32Array(n * 3) };
  let o = 0;
  for (const p of parts) {
    out.position.set(p.attributes.position.array, o * 3);
    out.normal.set(p.attributes.normal.array, o * 3);
    out.uv.set(p.attributes.uv.array, o * 2);
    out.color.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(out.uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(out.color, 3));
  g.computeBoundingSphere();
  return g;
}
const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

function bark(r0, r1, h, seg = 10, hseg = 6, vrep = 3) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, hseg);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h / vrep);
  g.translate(0, h / 2, 0);
  return g;
}
// a card hinged at its base edge, pointing along +X before rotation
function card(w, l, tint) {
  const g = new THREE.PlaneGeometry(l, w);
  g.translate(l / 2, 0, 0);
  g.rotateX(-Math.PI / 2);
  return prep(g, tint);
}
// leaf cards get "spherical" normals so the crown is lit as a volume
function sphereNormals(g, center, upBias = 0.4) {
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - center.x, p.getY(i) - center.y, p.getZ(i) - center.z).normalize();
    v.y += upBias; v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
const tintJ = (rng, base, j = 0.12) => base.map((c) => c * (1 - j / 2 + rng() * j));

function conifer(rng, h, snowy) {
  const trunk = [prep(bark(0.75 * h / 28, 0.22 * h / 28, h * 0.95, 10, 8))];
  const leaves = [];
  const whorls = 12;
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = h * (0.26 + t * 0.7);
    const len = (1 - t) * h * 0.24 + h * 0.035;
    const k = 7 - Math.floor(t * 3);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + w * 0.7 + rng() * 0.4;
      const droop = 0.25 + rng() * 0.25 + (1 - t) * 0.15;
      const tint = snowy ? (rng() < 0.45 ? [1.6, 1.65, 1.7] : tintJ(rng, [0.95, 1, 0.95])) : tintJ(rng, [1, 1, 1], 0.25);
      const c = card(len * 0.75, len, tint);
      c.applyMatrix4(M4(0, y, 0, 0, a, -droop));
      leaves.push(c);
      const c2 = card(len * 0.5, len * 0.9, tint); // vertical fill card
      c2.rotateX(Math.PI / 2);
      c2.applyMatrix4(M4(0, y - len * 0.1, 0, 0, a + 0.3, -droop * 0.8));
      leaves.push(c2);
    }
  }
  for (const a of [0, Math.PI / 2]) { const c = card(h * 0.06, h * 0.12, [1, 1, 1]); c.rotateZ(Math.PI / 2); c.applyMatrix4(M4(0, h * 0.9, 0, 0, a)); leaves.push(c); }
  const lg = merge(leaves);
  sphereNormals(lg, new THREE.Vector3(0, h * 0.55, 0), 0.6);
  return { trunk: merge(trunk), leaves: lg, height: h };
}

function broadleaf(rng, h, crownR, clusters, cardsPer, flat = 0) {
  const trunk = [prep(bark(0.55, 0.3, h * 0.55, 9, 5))];
  const leaves = [];
  const centers = [];
  for (let b = 0; b < clusters; b++) {
    const a = (b / clusters) * Math.PI * 2 + rng() * 0.6, up = 0.5 + rng() * 0.6;
    const L = crownR * (0.55 + rng() * 0.5);
    const len = Math.hypot(L, L * up * 0.6);
    const br = prep(bark(0.22, 0.08, len, 6, 3, 2));
    br.applyMatrix4(M4(0, h * 0.48, 0, 0, a, -Math.atan2(L, L * up * 0.6) + Math.PI / 2));
    trunk.push(br);
    centers.push(new THREE.Vector3(Math.cos(a) * L * 0.9, h * 0.48 + L * up * 0.65, -Math.sin(a) * L * 0.9));
  }
  centers.push(new THREE.Vector3(0, h * 0.92, 0));
  for (const c of centers) {
    const r = crownR * 0.55;
    for (let i = 0; i < cardsPer; i++) {
      const s = r * (0.7 + rng() * 0.5);
      const g = prep(new THREE.PlaneGeometry(s * 1.4, s * 1.4), tintJ(rng, [1, 1, 1], 0.3));
      g.applyMatrix4(M4(c.x + (rng() - 0.5) * r, c.y + (rng() - 0.5) * r * (1 - flat), c.z + (rng() - 0.5) * r, (rng() - 0.5) * Math.PI * (1 - flat * 0.7) - flat * Math.PI / 2, rng() * Math.PI * 2, 0));
      leaves.push(g);
    }
  }
  const lg = merge(leaves);
  sphereNormals(lg, new THREE.Vector3(0, h * 0.75, 0), 0.5);
  return { trunk: merge(trunk), leaves: lg, height: h };
}

function palm(rng) {
  const trunk = [];
  let x = 0, y = 0, lean = 0;
  for (let i = 0; i < 7; i++) {
    const seg = prep(bark(0.26 - i * 0.015, 0.24 - i * 0.015, 1.7, 8, 1, 1));
    lean += 0.05;
    seg.applyMatrix4(M4(x, y, 0, 0, 0, -lean));
    trunk.push(seg);
    x += Math.sin(lean) * 1.7; y += Math.cos(lean) * 1.65;
  }
  const leaves = [];
  for (let f = 0; f < 10; f++) {
    const a = (f / 10) * Math.PI * 2 + rng() * 0.3;
    const segs = 5, L = 5.2 + rng() * 1.2;
    const g = new THREE.PlaneGeometry(1.6, L, 1, segs);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + L / 2) / L; // 0 at base, 1 at tip
      p.setXYZ(i, p.getX(i), t * L * 0.9, -(t * t) * L * 0.55 + t * 0.6);
    }
    g.computeVertexNormals();
    const pg = prep(g, tintJ(rng, [1, 1, 1], 0.2));
    pg.applyMatrix4(M4(x, y + 0.1, 0, -1.1, a, 0));
    leaves.push(pg);
  }
  const lg = merge(leaves);
  sphereNormals(lg, new THREE.Vector3(x, y, 0), 0.8);
  return { trunk: merge(trunk), leaves: lg, height: y + 2 };
}

function bushModel(rng, r, n, y = 0.7) {
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const s = r * (0.8 + rng() * 0.6);
    const g = prep(new THREE.PlaneGeometry(s, s), tintJ(rng, [1, 1, 1], 0.3));
    g.applyMatrix4(M4((rng() - 0.5) * r, y + (rng() - 0.3) * r * 0.6, (rng() - 0.5) * r, (rng() - 0.5) * Math.PI, rng() * Math.PI * 2, 0));
    leaves.push(g);
  }
  const lg = merge(leaves);
  sphereNormals(lg, new THREE.Vector3(0, y * 0.6, 0), 0.6);
  return { leaves: lg, height: y + r };
}

function fernModel(rng) {
  const leaves = [];
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2, L = 1.4 + rng() * 0.6;
    const g = new THREE.PlaneGeometry(0.6, L, 1, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + L / 2) / L; p.setXYZ(i, p.getX(i), t * L * 0.6 - t * t * 0.4, t * L * 0.75); }
    g.computeVertexNormals();
    const pg = prep(g, tintJ(rng, [1, 1, 1], 0.25));
    pg.rotateY(a);
    leaves.push(pg);
  }
  return { leaves: merge(leaves), height: 1 };
}

const N3 = makeNoise(4242);
function rockModel(rng, { snow = false, tint = [1, 1, 1], flat = 0.7 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position, v = new THREE.Vector3();
  const seed = rng() * 100;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = N3(v.x * 1.3 + seed, v.z * 1.3 + v.y) * 0.22 + N3(v.x * 3.1 + seed, v.y * 3.1 - v.z) * 0.08;
    const facet = Math.round((1 + n) * 6) / 6;
    v.multiplyScalar(facet);
    v.y *= flat;
    p.setXYZ(i, v.x * 1.3, v.y + 0.25, v.z);
  }
  g.computeVertexNormals();
  const ng = prep(g, tint);
  const nrm = ng.attributes.normal, col = ng.attributes.color, uv = ng.attributes.uv, pp = ng.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    uv.setXY(i, pp.getX(i) * 0.45 + pp.getZ(i) * 0.2, pp.getY(i) * 0.45 + pp.getZ(i) * 0.3);
    if (snow && nrm.getY(i) > 0.45) col.setXYZ(i, 2.6, 2.7, 2.8);
  }
  return { trunk: ng, height: 1.2 };
}

function cactusModel() {
  const ribbed = (r, h) => {
    const g = new THREE.CylinderGeometry(r, r * 1.05, h, 16, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), rib = 1 + Math.cos(a * 8) * 0.08;
      p.setXYZ(i, p.getX(i) * rib, p.getY(i), p.getZ(i) * rib);
    }
    g.computeVertexNormals();
    return g;
  };
  const parts = [];
  const add = (g, m) => { g.applyMatrix4(m); parts.push(prep(g, [0.31, 0.48, 0.23])); };
  add(ribbed(0.34, 6), M4(0, 3, 0));
  const top = new THREE.SphereGeometry(0.35, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); add(top, M4(0, 6, 0));
  add(ribbed(0.2, 1.3), M4(0.72, 2.8, 0, 0, 0, Math.PI / 2));
  add(ribbed(0.21, 2.2), M4(1.38, 3.8, 0));
  add(ribbed(0.18, 1.1), M4(-0.62, 3.5, 0, 0, 0, Math.PI / 2));
  add(ribbed(0.19, 1.5), M4(-1.15, 4.2, 0));
  return { trunk: merge(parts), height: 6 };
}

function deadbushModel(rng) {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const g = prep(bark(0.04, 0.012, 0.8 + rng() * 0.7, 4, 1, 1), [0.9, 0.8, 0.7]);
    g.applyMatrix4(M4(0, 0, 0, (rng() - 0.5) * 1.4, rng() * Math.PI * 2, (rng() - 0.5) * 1.4));
    parts.push(g);
  }
  return { trunk: merge(parts), height: 1 };
}

function logModel() {
  const g = prep(bark(0.45, 0.4, 7, 9, 2, 3));
  g.applyMatrix4(M4(-3.5, 0.42, 0, 0, 0, -Math.PI / 2));
  return { trunk: g, height: 1 };
}

// far-away stand-ins: a trunk and three crossed cards
function impostor(m, crownY, crownR, trunkR) {
  const parts = [];
  const trunk = m.trunk ? prep(bark(trunkR, trunkR * 0.4, crownY * 1.05, 5, 1)) : null;
  for (let i = 0; i < 3; i++) {
    const g = prep(new THREE.PlaneGeometry(crownR * 2, crownR * 2.2), [0.9, 0.95, 0.9]);
    g.applyMatrix4(M4(0, crownY, 0, 0, (i / 3) * Math.PI, 0));
    parts.push(g);
  }
  const top = prep(new THREE.PlaneGeometry(crownR * 1.8, crownR * 1.8), [0.95, 1, 0.95]);
  top.applyMatrix4(M4(0, crownY + crownR * 0.4, 0, -Math.PI / 2));
  parts.push(top);
  const lg = merge(parts);
  sphereNormals(lg, new THREE.Vector3(0, crownY, 0), 0.6);
  return { trunk, leaves: lg };
}

// what grows where: [type, count per cell, minScale, maxScale, collider radius at scale 1, collider height]
const FLORA = {
  s: [['pine', 46, 0.8, 1.6, 0.6, 30], ['oak', 16, 0.8, 1.3, 0.55, 7], ['bush', 55, 0.6, 1.4, 0, 0], ['rock', 9, 0.8, 3.2, 0.9, 1.1], ['log', 6, 0.8, 1.2, 0, 0], ['fern', 20, 0.7, 1.2, 0, 0]],
  e: [['jungle', 38, 0.8, 1.4, 0.6, 18], ['palm', 14, 0.8, 1.2, 0.3, 10], ['fern', 120, 0.7, 1.5, 0, 0], ['bush', 50, 0.7, 1.5, 0, 0], ['rock', 4, 0.8, 2.5, 0.9, 1.1]],
  w: [['cactus', 5, 0.7, 1.3, 0.35, 6], ['deadbush', 14, 0.7, 1.4, 0, 0], ['sandrock', 6, 0.8, 3.5, 0.95, 1.0]],
  n: [['snowpine', 22, 0.7, 1.4, 0.45, 15], ['snowrock', 20, 0.8, 4, 0.95, 1.1]],
  hub: [['oak', 4, 0.8, 1.2, 0.55, 7], ['bush', 18, 0.6, 1.3, 0, 0], ['rock', 3, 0.8, 2, 0.9, 1.1]],
  beach: [['palm', 5, 0.8, 1.3, 0.3, 10], ['rock', 2, 0.8, 2.2, 0.9, 1.1], ['log', 2, 0.8, 1.2, 0, 0]],
};

export class Scatter {
  constructor(scene, physics, T, quality = { flora: 1 }) {
    this.scene = scene;
    this.physics = physics;
    this.density = quality.flora || 1;
    LOAD_R = 520 + 240 * Math.min(1.2, this.density);
    const rng = mulberry32(777);
    const barkM = windHook(new THREE.MeshStandardMaterial({ map: T.bark.map, normalMap: T.bark.nr, roughnessMap: T.bark.rough, vertexColors: true }), { height: 30, sway: 0.25, flutter: 0, key: 'bark' });
    const leafM = (tex, h, key) => coverageHook(windHook(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, vertexColors: true }), { height: h, sway: 0.45, flutter: 0.05, key }));
    const rockM = new THREE.MeshStandardMaterial({ map: T.rock.map, normalMap: T.rock.nr, roughnessMap: T.rock.rough, vertexColors: true });
    const cactusM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, normalMap: T.bark.nr, normalScale: new THREE.Vector2(0.3, 0.3) });
    const M = {
      needles: leafM(T.needles, 30, 'needles'), leaves: leafM(T.leaves, 12, 'leaves'), jungle: leafM(T.jungleLeaves, 20, 'jleaves'),
      fronds: leafM(T.fronds, 11, 'fronds'), bush: leafM(T.leaves, 2, 'bushleaves'), fern: leafM(T.fronds, 1.5, 'fern'),
    };
    // detailed + far models per type: list of {geo, mat}
    const models = {
      pine: conifer(rng, 28, false), snowpine: conifer(rng, 14, true),
      oak: broadleaf(rng, 11, 4.2, 5, 12), jungle: broadleaf(rng, 21, 6.5, 6, 14, 0.6),
      palm: palm(rng), bush: bushModel(rng, 1.3, 16), fern: fernModel(rng),
      rock: rockModel(rng, { tint: [0.95, 0.92, 0.88] }), snowrock: rockModel(rng, { snow: true, tint: [0.85, 0.87, 0.9] }),
      sandrock: rockModel(rng, { tint: [1.3, 1.05, 0.78], flat: 0.55 }), cactus: cactusModel(), deadbush: deadbushModel(rng), log: logModel(),
    };
    const leafMat = { pine: M.needles, snowpine: M.needles, oak: M.leaves, jungle: M.jungle, palm: M.fronds, bush: M.bush, fern: M.fern };
    const trunkMat = { rock: rockM, snowrock: rockM, sandrock: rockM, cactus: cactusM };
    const far = {
      pine: impostor(models.pine, 17, 5.5, 0.7), snowpine: impostor(models.snowpine, 8.5, 3.2, 0.4),
      oak: impostor(models.oak, 8, 4.5, 0.5), jungle: impostor(models.jungle, 16, 7, 0.7), palm: impostor(models.palm, 10, 3.5, 0.25),
    };
    this.meshes = {};
    this.cap = {};
    const mk = (key, geo, mat, cap, shadow) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
      (this.meshes[key] = this.meshes[key] || []).push(m);
      this.cap[key] = cap;
    };
    for (const [type, mdl] of Object.entries(models)) {
      const nearCap = Math.round(5000 * this.density), farCap = Math.round(30000 * this.density);
      const tm = trunkMat[type] || barkM;
      if (mdl.trunk) mk(`${type}_near`, mdl.trunk, tm, nearCap, true);
      if (mdl.leaves) mk(`${type}_near`, mdl.leaves, leafMat[type], nearCap, true);
      const f = far[type];
      if (f) {
        if (f.trunk) mk(`${type}_far`, f.trunk, barkM, farCap, false);
        mk(`${type}_far`, f.leaves, leafMat[type], farCap, false);
      } else {
        if (mdl.trunk) mk(`${type}_far`, mdl.trunk, tm, farCap, false);
        if (mdl.leaves) mk(`${type}_far`, mdl.leaves, leafMat[type], farCap, false);
      }
    }
    this.cells = new Map();
    this.dirty = true;
    this.center = null;
    this.queue = [];
  }

  genCell(cx, cz) {
    const rng = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x5eed);
    const items = [], trunks = [];
    const x0 = cx * CELL, z0 = cz * CELL;
    const centerRegion = regionAt(x0 + CELL / 2, z0 + CELL / 2);
    const table = FLORA[centerRegion];
    if (!table) return { items, trunks };
    const nearPoi = POIS.filter((p) => Math.abs(p.x - x0 - CELL / 2) < CELL + p.r && Math.abs(p.z - z0 - CELL / 2) < CELL + p.r);
    for (const [type, count, s0, s1, cr, ch] of table) {
      let n = Math.round(count * (type === 'fern' || type === 'bush' ? this.density : 1));
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
        items.push({ type, x, y: h - (type.includes('rock') ? 0.25 * s : 0.15), z, s, rot });
        if (cr > 0) trunks.push({ x, z, r: cr * s, h: ch * s, base: h, kind: type.includes('rock') ? 'rock' : 'wood' });
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
      for (const [k, c] of this.cells) if (!want.has(k)) { this.physics.removeTrunks(k, c.trunks); this.cells.delete(k); }
      add.sort((a, b) => a.d - b.d);
      this.queue = add;
      this.dirty = true;
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
    // near/far split moves with you, so rebuild periodically as well
    this.lastRebuildPos = this.lastRebuildPos || pos.clone();
    if (this.lastRebuildPos.distanceTo(pos) > 25) this.dirty = true;
    if (this.dirty && (this.rebuildT <= 0 || !this.queue.length)) { this.rebuild(pos); this.rebuildT = 0.5; }
  }

  rebuild(pos) {
    this.dirty = false;
    this.lastRebuildPos = pos.clone();
    const counts = {};
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const k in this.meshes) counts[k] = 0;
    for (const c of this.cells.values()) {
      for (const it of c.items) {
        const near = Math.hypot(it.x - pos.x, it.z - pos.z) < NEAR_R;
        const k = `${it.type}_${near ? 'near' : 'far'}`;
        const list = this.meshes[k];
        if (!list || counts[k] >= this.cap[k]) continue;
        q.setFromAxisAngle(up, it.rot);
        sc.setScalar(it.s);
        p.set(it.x, it.y, it.z);
        m4.compose(p, q, sc);
        for (const m of list) m.setMatrixAt(counts[k], m4);
        counts[k]++;
      }
    }
    for (const k in this.meshes) for (const m of this.meshes[k]) { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; }
  }

  warmup(pos) {
    this.update(0, pos, 1e9);
    this.rebuild(pos);
  }

  get instanceCount() { let n = 0; for (const k in this.meshes) n += this.meshes[k][0].count; return n; }
}
