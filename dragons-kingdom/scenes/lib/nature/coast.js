// Verdor coast at runtime: the baked 3D cliff band (tiles, LOD by distance to the shot's cameras),
// the land and the sea bed around it as a graded heightfield, and the landscape material.
//
//   import { loadVerdorCoast } from '../lib/nature/coast.js';
//   const coast = await loadVerdorCoast(ctx, { views: [[x, y, z], ...], radius: 4000 });
//   scene.add(coast.group);
//   coast.world          the world definition (verdor-world.js): coastF, xc, stacks, beds ...
//   coast.surfaceAt(x, z)   height of the visible ground (band tiles' top grids, else land / sea bed)
//   coast.material
//
// views: every camera position the scene will use (LODs and the loaded set are chosen once in setup,
// so frames stay a pure function of t). The caches come from offline/bake-verdor-land.mjs and
// offline/bake-verdor-cliffs.mjs (see README.md).
import * as THREE from 'three';
import { createVerdorWorld, VERDOR } from './verdor-world.js';
import { decodeHeightmap, heightSampler } from './heightmap.js';
import { decodeTile } from './tiles.js';
import { landscapeMaterial } from './materials.js';
import { heightfield, gradedAxis } from '../sets/terrain.js';
import { smoothstep } from './noise.js';

const CACHE = new URL('./cache/verdor/', import.meta.url);
const fetchBin = async (rel) => {
  const r = await fetch(new URL(rel, CACHE));
  if (!r.ok) throw new Error(`nature cache missing: ${rel} - run the bakes: node scenes/lib/nature/offline/bake-verdor-land.mjs && node scenes/lib/nature/offline/bake-verdor-cliffs.mjs`);
  return r.arrayBuffer();
};

let worldP = null;
/** The Verdor world with the baked land installed (shared by everything in a page). */
export function verdorWorld() {
  if (!worldP) worldP = (async () => {
    const W = createVerdorWorld();
    const hm = heightSampler(decodeHeightmap(await fetchBin('land.dkhm')));
    W.installLand({ sample: (x, z) => (hm.inside(x, z) ? hm.sample(x, z) : W.baseLand(x, z)), layer: hm.layer, hm });
    W.landMap = hm;
    return W;
  })();
  return worldP;
}

function tileGeometry(t) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(t.positions, 3));
  // normals are stored with a pad byte: re-pack to xyz
  const n3 = new Int8Array(t.nv * 3);
  for (let i = 0; i < t.nv; i++) { n3[i * 3] = t.normals[i * 4]; n3[i * 3 + 1] = t.normals[i * 4 + 1]; n3[i * 3 + 2] = t.normals[i * 4 + 2]; }
  g.setAttribute('normal', new THREE.BufferAttribute(n3, 3, true));
  g.setAttribute('aAO', new THREE.BufferAttribute(t.ao, 1, true));
  g.setAttribute('aCav', new THREE.BufferAttribute(t.cavity, 1, true));
  g.setIndex(new THREE.BufferAttribute(t.indices, 1));
  const b = t.bbox;
  g.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  return g;
}

/**
 * opts: views [[x,y,z]...] (required), radius (m, tiles beyond are not loaded; default 4500),
 * lodDist [L0, L1, L2] (m; default [170, 480, 1300]), terrain: false | { x: [x0,x1], z: [z0,z1], n: [nx,nz] },
 * shadows (cast from cliffs, default true), material (reuse one).
 */
export async function loadVerdorCoast(ctx, opts = {}) {
  const W = await verdorWorld();
  const index = await (await fetch(new URL('cliffs.json', CACHE))).json().catch(() => { throw new Error('nature cache missing: cliffs.json - run offline/bake-verdor-cliffs.mjs'); });
  const views = (opts.views || [[0, 80, 0]]).map((v) => new THREE.Vector3(...v));
  const radius = opts.radius ?? 4500;
  const lodDist = opts.lodDist ?? [170, 480, 1300];
  const material = opts.material || await landscapeMaterial(ctx, { world: W, ...opts.look });
  const group = new THREE.Group();
  group.name = 'verdor-coast';
  const box = new THREE.Box3();
  const picks = [];
  for (const t of index.tiles) {
    box.min.set(t.x0, t.ylo, t.z0); box.max.set(t.x0 + t.size, t.yhi, t.z0 + t.size);
    let d = Infinity;
    for (const v of views) d = Math.min(d, box.distanceToPoint(v));
    if (d > radius) continue;
    let lod = d < lodDist[0] ? 0 : d < lodDist[1] ? 1 : d < lodDist[2] ? 2 : 3;
    while (lod < 3 && !t.lods[lod]) lod++;
    while (lod > 0 && !t.lods[lod]) lod--;
    if (!t.lods[lod]) continue;
    picks.push({ t, lod });
  }
  const stats = { tiles: picks.length, perLod: [0, 0, 0, 0], tris: 0 };
  await Promise.all(picks.map(async ({ t, lod }) => {
    const tile = decodeTile(await fetchBin(t.lods[lod].file));
    if (!tile.nv) return;
    const mesh = new THREE.Mesh(tileGeometry(tile), material);
    mesh.name = `cliff_${t.tx}_${t.tz}_L${lod}`;
    mesh.castShadow = opts.shadows ?? true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    t.loaded = { lod, tile };
    stats.perLod[lod]++; stats.tris += tile.ni / 3;
  }));
  // the top surface of the band, from the tiles' top grids (for scattering)
  const tileTop = new Map();
  for (const t of index.tiles) if (t.loaded) tileTop.set(`${t.tx}:${t.tz}`, t.loaded.tile);
  const T = index.tile;
  function bandTop(x, z) {
    const tx = Math.floor(x / T), tz = Math.floor(z / T);
    const tile = tileTop.get(`${tx}:${tz}`);
    if (!tile) return null;
    const n = tile.topN, h = tile.topH;
    const fi = (x - tx * T) / h, fk = (z - tz * T) / h;
    const i = Math.min(n - 2, Math.max(0, Math.floor(fi))), k = Math.min(n - 2, Math.max(0, Math.floor(fk))), u = fi - i, v = fk - k;
    const a = tile.top[k * n + i], b = tile.top[k * n + i + 1], c = tile.top[(k + 1) * n + i], d = tile.top[(k + 1) * n + i + 1];
    if (!(a === a && b === b && c === c && d === d)) return null;
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  const bandTiles = new Set(index.tiles.map((t) => `${t.tx}:${t.tz}`));
  const inBand = (x, z) => bandTiles.has(`${Math.floor(x / T)}:${Math.floor(z / T)}`);
  // outside the band: land behind the coast, sea bed in front, a heightfield cliff between
  // (only seen far away, beyond the baked stretch of coast)
  function outsideHeight(x, z) {
    const F = W.coastF(x, z);
    const land = W.landHeight(x, z), sea = W.seabed(x, z);
    if (F < -12) return land;
    if (F > 6) return sea;
    const t = smoothstep(-12, 6, F);
    return land * (1 - t) + sea * t;
  }
  const surfaceAt = (x, z) => { const b = inBand(x, z) ? bandTop(x, z) : null; return b ?? outsideHeight(x, z); };

  if (opts.terrain !== false) {
    const tr = opts.terrain || {};
    const c = views[0];
    const xr = tr.x || [c.x - 3500, c.x + 3500], zr = tr.z || [c.z - 3500, c.z + 3500];
    const nn = tr.n || [420, 420];
    const sink = (x, z) => (inBand(x, z) ? 0.35 : 0);
    const hf = heightfield({
      xs: gradedAxis(xr[0], xr[1], nn[0], c.x, 2.4), zs: gradedAxis(zr[0], zr[1], nn[1], c.z, 2.4),
      height: (x, z) => outsideHeight(x, z) - sink(x, z),
      // drop cells that lie entirely inside band tiles (the tiles cover them)
      skip: null,
    });
    const g = hf.geometry;
    const pos = g.attributes.position, n = pos.count;
    g.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(n).fill(255), 1, true));
    g.setAttribute('aCav', new THREE.BufferAttribute(new Uint8Array(n), 1, true));
    // remove triangles whose three corners are all well inside band tiles
    const idx = g.index.array, keep = [];
    const deep = (i) => { const x = pos.getX(i), z = pos.getZ(i); return inBand(x - 2, z - 2) && inBand(x + 2, z + 2) && inBand(x - 2, z + 2) && inBand(x + 2, z - 2); };
    const deepV = new Uint8Array(n); for (let i = 0; i < n; i++) deepV[i] = deep(i) ? 1 : 0;
    for (let i = 0; i < idx.length; i += 3) if (!(deepV[idx[i]] && deepV[idx[i + 1]] && deepV[idx[i + 2]])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'verdor-terrain';
    mesh.receiveShadow = true; mesh.castShadow = opts.shadows ?? true;
    group.add(mesh);
    stats.terrainTris = keep.length / 3;
  }
  console.warn(`[nature] verdor coast: ${stats.tiles} tiles (L0 ${stats.perLod[0]}, L1 ${stats.perLod[1]}, L2 ${stats.perLod[2]}, L3 ${stats.perLod[3]}), ${Math.round(stats.tris / 1000)}k tris + terrain ${Math.round((stats.terrainTris || 0) / 1000)}k`);
  return { group, world: W, material, surfaceAt, bandTop, inBand, outsideHeight, stats, index };
}
