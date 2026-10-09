// Rocks: fallen limestone blocks, slabs, sea-worn cobbles and half-buried outcrops, meshed at
// setup from small signed-distance shapes (same surface-nets mesher as the cliffs, so the
// sculpting language matches: joint-bounded faces, bedding grooves, fractured facets, rounded
// sea-worn edges), with baked sky visibility, and placed on the coast by zone.
//
//   const R = rockKit(ctx, { variants: 6 });                // geometry variants per kind, 3 LODs each
//   const g = await scatterCoastRocks(ctx, coast, { views });   // talus, platform, beach, clifftop, sea bed
//   scene.add(g.group);
//
// Rocks use the landscape shader in rock-only mode: a block lying in the intertidal gets barnacles,
// wrack and the wet band; one on the clifftop gets grey lichen - from the same height zonation as the cliff.
import * as THREE from 'three';
import { meshTile } from './mesher.js';
import { makeNoise, mulberry, smoothstep, hash2 } from './noise.js';
import { landscapeMaterial } from './materials.js';

const KINDS = {
  // half extents (x is the long axis), corner rounding, fracture cuts, roughness, bedding
  block: { ext: [[0.5, 0.5], [0.28, 0.45], [0.3, 0.45]], round: [0.03, 0.09], cuts: [1, 3], facet: 0.045, bed: 0.018 },
  slab: { ext: [[0.5, 0.5], [0.1, 0.18], [0.3, 0.48]], round: [0.03, 0.06], cuts: [1, 3], facet: 0.03, bed: 0.008 },
  cobble: { ext: [[0.5, 0.5], [0.22, 0.38], [0.3, 0.45]], round: [0.2, 0.3], cuts: [0, 0], facet: 0.008, bed: 0.0, worn: true },
  outcrop: { ext: [[0.5, 0.5], [0.12, 0.2], [0.35, 0.5]], round: [0.05, 0.1], cuts: [2, 4], facet: 0.035, bed: 0.012 },
};

function rockSdf(kind, seed) {
  const K = KINDS[kind], r = mulberry(seed * 7919 + 13), N = makeNoise(seed + 101);
  const rnd = ([a, b]) => a + (b - a) * r();
  const hx = rnd(K.ext[0]), hy = rnd(K.ext[1]), hz = rnd(K.ext[2]);
  const rr = rnd(K.round);
  const nc = Math.round(rnd(K.cuts));
  const cuts = [];
  for (let i = 0; i < nc; i++) {
    const a = r() * Math.PI * 2, b = (r() - 0.3) * 1.2;
    const n = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)];
    const reach = Math.abs(n[0]) * hx + Math.abs(n[1]) * hy + Math.abs(n[2]) * hz;
    cuts.push([...n, reach * (0.55 + 0.35 * r())]);
  }
  const tilt = (r() - 0.5) * 0.5, bedK = 18 + 30 * r();
  return (x, y, z) => {
    let d;
    if (K.worn) {
      // sea-worn: a soft ellipsoid
      const q = Math.hypot(x / hx, y / hy, z / hz);
      d = (q - 1) * Math.min(hx, hy, hz);
    } else {
      const qx = Math.abs(x) - hx + rr, qy = Math.abs(y) - hy + rr, qz = Math.abs(z) - hz + rr;
      d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rr;
      for (const c of cuts) d = Math.max(d, x * c[0] + y * c[1] + z * c[2] - c[3]);
    }
    d += K.facet * N.facet3(x * 4, y * 4, z * 4) + 0.6 * K.facet * N.fbm3(x * 9, y * 9, z * 9, 2);
    if (K.bed) d += K.bed * smoothstep(0.55, 0.9, Math.sin((y + tilt * x) * bedK) * 0.5 + 0.5);
    return d;
  };
}

function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  const nv = m.positions.length / 3;
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  const n3 = new Int8Array(nv * 3);
  for (let i = 0; i < nv; i++) { n3[i * 3] = m.normals[i * 4]; n3[i * 3 + 1] = m.normals[i * 4 + 1]; n3[i * 3 + 2] = m.normals[i * 4 + 2]; }
  g.setAttribute('normal', new THREE.BufferAttribute(n3, 3, true));
  g.setAttribute('aAO', new THREE.BufferAttribute(m.ao, 1, true));
  g.setAttribute('aCav', new THREE.BufferAttribute(m.cavity, 1, true));
  g.setIndex(new THREE.BufferAttribute(nv > 65535 ? m.indices : Uint16Array.from(m.indices), 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

const kitCache = new Map();
/** Geometry variants: kit.get(kind, variant, lod) -> BufferGeometry (unit size: longest axis ~1 m, centred). */
export function rockKit(opts = {}) {
  const nV = opts.variants ?? 6;
  const key = `${nV}`;
  if (kitCache.has(key)) return kitCache.get(key);
  const res = [30, 16, 8];
  const kit = { variants: nV, geo: {} };
  for (const kind of Object.keys(KINDS)) {
    kit.geo[kind] = [];
    for (let v = 0; v < nV; v++) {
      const f = rockSdf(kind, v * 31 + kind.length * 1000);
      const world = { column: () => null, sdf: (x, y, z) => f(x, y, z) };
      kit.geo[kind].push(res.map((n) => toGeometry(meshTile(world, { x0: -0.62, z0: -0.62, size: 1.24, h: 1.24 / n, apron: 1, coarse: 1, ylo: -0.62, yhi: 0.62, aoDistances: [0.04, 0.12, 0.3] }))));
    }
  }
  kit.get = (kind, v, lod) => kit.geo[kind][v % nV][lod];
  kitCache.set(key, kit);
  return kit;
}

/**
 * Scatter rocks over the loaded coast tiles. opts: views [[x,y,z]], density (1), maxPerKind,
 * material (a rock-only landscape material). Returns { group, counts }.
 */
export async function scatterCoastRocks(ctx, coast, opts = {}) {
  const W = coast.world;
  const kit = rockKit(opts);
  const mat = opts.material || await landscapeMaterial(ctx, { world: W, rockOnly: true });
  const views = (opts.views || []).map((v) => new THREE.Vector3(...v));
  const dens = opts.density ?? 1;
  const rng = mulberry(opts.seed ?? 4242);
  const buckets = new Map();   // kind|variant|lod -> matrices
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
  const counts = {};
  const nearest = (x, y, z) => { let d = Infinity; for (const v of views) d = Math.min(d, Math.hypot(v.x - x, v.y - y, v.z - z)); return d; };
  const add = (kind, x, y, z, size, slopeN, sink) => {
    const d = nearest(x, y, z);
    if (size / Math.max(d, 1) < 0.0006) return;       // smaller than ~2 px at 4K: skip
    const lod = d < 45 ? 0 : d < 220 ? 1 : 2;
    const v = Math.floor(rng() * kit.variants);
    // lie on the ground: yaw random, tilted toward the slope, a little sunk
    nrm.copy(slopeN);
    q.setFromUnitVectors(up, nrm.lerp(up, 0.35).normalize());
    const yaw = new THREE.Quaternion().setFromAxisAngle(up, rng() * Math.PI * 2);
    const tilt = new THREE.Quaternion().setFromEuler(e.set((rng() - 0.5) * 0.35, 0, (rng() - 0.5) * 0.35));
    q.multiply(yaw).multiply(tilt);
    const s = size * (0.85 + 0.3 * rng());
    p.set(x, y - s * sink, z);
    m4.compose(p, q, sc.set(s, s, s));
    const key = `${kind}|${v}|${lod}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m4.clone());
    counts[kind] = (counts[kind] || 0) + 1;
  };
  const T = coast.index.tile;
  const slopeAt = (x, z) => {
    const a = coast.bandTop(x - 0.5, z), b = coast.bandTop(x + 0.5, z), c = coast.bandTop(x, z - 0.5), d = coast.bandTop(x, z + 0.5);
    if (a == null || b == null || c == null || d == null) return null;
    return new THREE.Vector3(-(b - a), 1, -(d - c)).normalize();
  };
  // sizes from a power law between lo and hi
  const pl = (lo, hi, k = 2.2) => lo * Math.pow(hi / lo, Math.pow(rng(), k));
  for (const t of coast.index.tiles) {
    if (!t.loaded) continue;
    const dT = Math.min(...views.map((v) => Math.hypot(v.x - (t.x0 + T / 2), v.z - (t.z0 + T / 2)))) || 0;
    // fewer candidates far away (only big rocks survive there anyway)
    const n = Math.round(T * T * 0.35 * dens / (1 + (dT / 250) ** 2));
    for (let i = 0; i < n; i++) {
      const x = t.x0 + rng() * T, z = t.z0 + rng() * T;
      const y = coast.bandTop(x, z);
      if (y == null) continue;
      const sn = slopeAt(x, z);
      if (!sn) continue;
      const F = W.coastF(x, z), fF = W.footF(x, z) + 2;
      const toFace = F - fF;
      const u = rng();
      if (y > 0.3 && y < 16 && toFace > -8 && toFace < 30 && sn.y > 0.45) {
        // talus: blocks banked under the face, the biggest closest to it
        const tal = W.talus(x, z, F, W.landHeight(x, z));
        if (u < 0.25 + 0.6 * Math.min(1, tal / 3)) add(rng() < 0.75 ? 'block' : 'slab', x, y, z, pl(0.25, toFace < 8 ? 4.5 : 2.2), sn, 0.22);
      } else if (y > -1.8 && y < 1.4 && sn.y > 0.8 && toFace > -6 && toFace < 70) {
        // the platform: fallen blocks and slabs, more near the foot
        if (u < 0.05 + 0.25 * Math.exp(-Math.max(0, toFace) / 12)) add(rng() < 0.6 ? 'block' : 'slab', x, y, z, pl(0.3, 3.0), sn, 0.18);
      } else if (W.beachW(z) > 0.25 && y > 1.0 && y < 5.5 && sn.y > 0.75) {
        // the shingle berm: cobbles (dense near the cameras), a few boulders at the back
        const d = nearest(x, y, z);
        if (d < 160) for (let k = 0; k < 8; k++) add('cobble', x + (rng() - 0.5) * 2, coast.bandTop(x, z) ?? y, z + (rng() - 0.5) * 2, pl(0.06, 0.35, 1.6), sn, 0.3);
        if (u < 0.05) add('block', x, y, z, pl(0.4, 1.8), sn, 0.25);
      } else if (y > 18 && sn.y > 0.85 && F > -48 && F < -1) {
        // clifftop: weathered limestone slabs breaking through the turf near the edge
        if (u < 0.03 * smoothstep(0.1, 0.5, N_out(x, z))) add('outcrop', x, y, z, pl(0.6, 3.5, 1.5), sn, 0.55);
      } else if (y < -1.8 && y > -6 && sn.y > 0.6) {
        if (u < 0.04) add('block', x, y, z, pl(0.5, 3.0), sn, 0.3);
      }
    }
  }
  const group = new THREE.Group();
  group.name = 'coast-rocks';
  for (const [key, list] of buckets) {
    const [kind, v, lod] = key.split('|');
    const mesh = new THREE.InstancedMesh(kit.get(kind, +v, +lod), mat, list.length);
    list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  console.warn(`[nature] rocks: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  return { group, counts, kit, material: mat };
}
const NO = makeNoise(77);
const N_out = (x, z) => NO.fbm2(x / 60, z / 60, 3) + 0.3;
