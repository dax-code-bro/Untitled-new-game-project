// The landscape around Cling at runtime: eroded rolling farmland (cache/cling/cling.dkhm), a
// 1400s field system painted from cling-world.js (hedged closes near the town, strip furlongs with
// ridge and furrow, hay meadows, fallow, plough, stubble), hedgerows of blackthorn / hawthorn with
// hedgerow oaks and ashes along the field boundaries, woods on the northern hills, the broad road
// from the east gate and a lane, all in one farmland shader.
//
//   const land = await loadClingLand(ctx, { views: [[x, y, z]], town: true });
//   scene.add(land.group);    land.heightAt(x, z), land.world
import * as THREE from 'three';
import { createClingWorld, CLING_LAND } from './cling-world.js';
import { decodeHeightmap, heightSampler } from './heightmap.js';
import { textureLayers } from './texarray.js';
import { LAYERS } from './materials.js';
import { worldVaryings, GLSL_NOISE } from '../sets/materials.js';
import { heightfield, gradedAxis } from '../sets/terrain.js';
import { shrubGeometry, foliageMaterial } from './plants.js';
import { treeKit, scatterTrees } from './trees.js';
import { mulberry, hash2, smoothstep } from './noise.js';
import { grassField } from '../sets/grass.js';

const CACHE = new URL('./cache/cling/', import.meta.url);
const CROPS = ['pasture', 'meadow', 'wheat', 'barley', 'fallow', 'plough', 'road', 'wood', 'town'];

/** the field map: r crop, g strip direction, b per-field random, a road / verge */
function fieldMap(W, region, cell) {
  const [x0, x1] = region.x, [z0, z1] = region.z;
  const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const data = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, k = (j * nx + i) * 4;
    const f = W.fieldAt(x, z);
    let crop = f ? CROPS.indexOf(f.site.crop) : 0;
    if (W.wood(x, z) > 0.5) crop = 7;
    if (Math.hypot(x, z) < 120) crop = 8;
    const rd = Math.min(W.roadD(x, z) / 5.5, W.laneD(x, z) / 3.2);
    data[k] = crop * 20 + 10;
    data[k + 1] = f ? Math.round(((f.site.dir % Math.PI) + Math.PI) % Math.PI / Math.PI * 255) : 0;
    data[k + 2] = f ? Math.round(f.site.h * 255) : 0;
    data[k + 3] = Math.round(Math.max(0, 1 - rd) * 255);
  }
  const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  const lin = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
  lin.magFilter = THREE.LinearFilter; lin.minFilter = THREE.LinearFilter;
  lin.needsUpdate = true;
  return { texture: t, linear: lin, data, nx, nz, xf: new THREE.Vector4(x0, z0, 1 / ((nx - 1) * cell), 1 / ((nz - 1) * cell)), cell, x0, z0 };
}

const FARM_GLSL = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray nkAlb; uniform sampler2DArray nkNrm; uniform sampler2DArray nkDat;
uniform float nkTile[9];
uniform sampler2D fMap; uniform sampler2D fMapL; uniform vec4 fMapXf; uniform vec2 fMapN;
void dkProj2(int ax, vec3 p, vec3 n, out vec2 uv, out vec3 T, out vec3 B) {
  if (ax == 0) { float s = n.x >= 0.0 ? 1.0 : -1.0; uv = vec2(-s * p.z, p.y); T = vec3(0.0, 0.0, -s); }
  else if (ax == 1) { float s = n.y >= 0.0 ? 1.0 : -1.0; uv = vec2(p.x, -s * p.z); T = vec3(1.0, 0.0, 0.0); }
  else { float s = n.z >= 0.0 ? 1.0 : -1.0; uv = vec2(s * p.x, p.y); T = vec3(s, 0.0, 0.0); }
  T = normalize(T - n * dot(n, T)); B = cross(n, T);
}
void fTap(int L, vec3 P, vec3 n, float scale, out vec3 alb, out vec3 nw, out float h) {
  vec2 uv; vec3 T, B;
  dkProj2(1, P * nkTile[L] * scale, n, uv, T, B);
  uv += (vec2(dkVN2(uv * 0.23 + float(L) * 3.1), dkVN2(uv * 0.23 + 17.3)) - 0.5) * 1.2;
  alb = texture(nkAlb, vec3(uv, float(L))).rgb;
  vec3 tn = texture(nkNrm, vec3(uv, float(L))).xyz * 2.0 - 1.0;
  nw = normalize(T * tn.x + B * tn.y + n * max(tn.z, 0.15));
  h = texture(nkDat, vec3(uv, float(L))).g;
}
vec3 fNrm; float fRough;
`;

const FARM_FRAGMENT = /* glsl */ `
vec3 P = vDkW;
vec3 N0 = normalize(vDkN);
vec2 fuv = (P.xz - fMapXf.xy) * fMapXf.zw;
vec4 fm = texture2D(fMap, fuv);
float crop = floor(fm.r * 255.0 / 20.0 + 0.01);
float dir = fm.g * 3.14159265;
float rnd = fm.b;
float road = texture2D(fMapL, fuv).a;
float camD = length(P - cameraPosition);
float m1 = dkFbm3(P * 0.02), m2 = dkFbm3(P * 0.11 + 4.0), m3 = dkVN2(P.xz * 0.9);
// strips across the furlong: a strip index (each holder's strip a little different), ridge and furrow
vec2 sd = vec2(cos(dir), sin(dir));
float across = dot(P.xz, sd);
float sw = 11.0 + 6.0 * rnd;
float strip = floor(across / sw);
float sh = fract(sin(strip * 12.9898 + rnd * 78.233) * 43758.5453);
float ridge = sin(fract(across / sw) * 6.2831853);
vec3 grassA; vec3 nA; float hA;
fTap(1, P, N0, 1.0, grassA, nA, hA);
vec3 col; vec3 nrm = nA; float rough = 0.9;
bool strips = crop >= 2.0 && crop <= 5.0;
if (crop < 0.5) {            // pasture: grazed turf, darker tussocks, sheep-cropped paler patches
  col = grassA * vec3(0.5, 0.6, 0.36) * (0.75 + 0.5 * m3) * (0.85 + 0.3 * m2);
} else if (crop < 1.5) {     // hay meadow: long grass, seed heads, flowers
  vec3 a2; vec3 n2; float h2; fTap(7, P + 3.0, N0, 0.8, a2, n2, h2);
  col = mix(grassA * vec3(0.55, 0.66, 0.36), a2 * vec3(0.75, 0.72, 0.5), 0.35 + 0.2 * m3) * (0.85 + 0.3 * m2);
  col = mix(col, vec3(0.75, 0.68, 0.3), smoothstep(0.78, 0.9, dkVN2(P.xz * 3.0)) * 0.3);
} else if (crop < 2.5 || (crop < 3.5)) {   // wheat / barley: standing grain, golden-green, strips in step
  vec3 a2; vec3 n2; float h2; fTap(7, P, N0, 1.6, a2, n2, h2);
  vec3 grain = crop < 2.5 ? vec3(0.34, 0.28, 0.13) : vec3(0.4, 0.35, 0.2);
  col = grain * (0.75 + 0.5 * clamp(dot(a2, vec3(0.33)) / 0.35, 0.0, 1.5)) * (0.8 + 0.25 * sh + 0.15 * m2);
  col = mix(col, col * vec3(0.8, 1.05, 0.7), 0.25 * sh);     // a greener, later strip here and there
  nrm = normalize(mix(n2, N0, 0.4));
  rough = 0.85;
} else if (crop < 4.5) {     // fallow: weedy grass and bare patches
  vec3 a2; vec3 n2; float h2; fTap(2, P, N0, 1.0, a2, n2, h2);
  col = mix(grassA * vec3(0.55, 0.6, 0.38), a2 * vec3(0.7, 0.65, 0.5), 0.5 + 0.3 * sh) * (0.85 + 0.3 * m3);
} else if (crop < 5.5) {     // ploughed: furrows along the strip
  vec3 a2; vec3 n2; float h2; fTap(3, P, N0, 1.0, a2, n2, h2);
  float furrow = sin(across * 6.2831853 / 0.55);
  col = a2 * vec3(0.55, 0.45, 0.36) * (0.75 + 0.2 * furrow + 0.2 * sh);
  nrm = normalize(n2 + vec3(sd.x, 0.0, sd.y) * furrow * 0.35 * (1.0 - smoothstep(30.0, 150.0, camD)));
} else if (crop < 6.5) {
  col = grassA * vec3(0.5, 0.55, 0.38);
} else if (crop < 7.5) {     // wood floor (mostly hidden under trees): leaf litter, moss
  vec3 a2; vec3 n2; float h2; fTap(8, P, N0, 1.0, a2, n2, h2);
  col = mix(a2 * vec3(0.5, 0.42, 0.3), grassA * vec3(0.35, 0.42, 0.25), 0.4 * m3);
} else {                     // the town shelf: trodden grass and earth (the architecture covers most of it)
  vec3 a2; vec3 n2; float h2; fTap(2, P, N0, 1.0, a2, n2, h2);
  col = mix(grassA * vec3(0.5, 0.55, 0.38), a2 * vec3(0.7, 0.62, 0.5), 0.4 + 0.3 * m3);
}
// ridge and furrow: the old ploughed strips stay as long waves under every furlong (shading)
if (strips || crop < 0.5) {
  float amp = strips ? 0.22 : 0.12;
  nrm = normalize(nrm + vec3(sd.x, 0.0, sd.y) * cos(fract(across / sw) * 6.2831853) * amp * (1.0 - smoothstep(400.0, 1500.0, camD)));
  col *= 1.0 + 0.06 * ridge;
}
// the road and the lane: rutted earth and stone, a grass crown, worn verges
if (road > 0.01) {
  vec3 a2; vec3 n2; float h2; fTap(3, P, N0, 1.0, a2, n2, h2);
  vec3 a3; vec3 n3; float h3; fTap(6, P + 7.0, N0, 1.0, a3, n3, h3);
  vec3 dirt = mix(a2 * vec3(0.62, 0.55, 0.45), a3 * 0.8, 0.45 + 0.3 * m3);
  float ruts = road > 0.55 ? smoothstep(0.65, 0.95, abs(sin(road * 9.0))) : 0.0;
  dirt *= 1.0 - 0.18 * ruts;
  float crown = smoothstep(0.88, 0.97, road) * 0.6;
  vec3 rc = mix(dirt, grassA * vec3(0.45, 0.5, 0.32), crown);
  float w = smoothstep(0.02, 0.35, road + 0.15 * (m3 - 0.5));
  col = mix(col, rc, w);
  nrm = normalize(mix(nrm, n2, w));
  rough = mix(rough, 0.95, w);
}
// steep banks show the soil and the stone
float steep = smoothstep(0.75, 0.55, N0.y);
if (steep > 0.01) { vec3 a2; vec3 n2; float h2; fTap(0, P, N0, 0.6, a2, n2, h2); col = mix(col, a2 * vec3(0.55, 0.52, 0.48), steep); nrm = normalize(mix(nrm, n2, steep)); }
col *= 0.9 + 0.2 * m1;
fNrm = nrm; fRough = rough;
diffuseColor.rgb *= col;
`;

export async function farmlandMaterial(ctx, map) {
  const T = await textureLayers(ctx, LAYERS, { size: 1024 });
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  mat.name = 'nature:farmland';
  const U = {
    nkAlb: { value: T.albedo }, nkNrm: { value: T.normal }, nkDat: { value: T.data },
    nkTile: { value: LAYERS.map((id) => 1 / (T.tile[T.index[id]] || 2)) },
    fMap: { value: map.texture }, fMapL: { value: map.linear }, fMapXf: { value: map.xf }, fMapN: { value: new THREE.Vector2(map.nx, map.nz) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    worldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDkW; varying vec3 vDkN;\n${GLSL_NOISE}\n${FARM_GLSL}`)
      .replace('#include <map_fragment>', FARM_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(fNrm, 0.0)).xyz);`);
  };
  mat.customProgramCacheKey = () => 'nature-farmland-v1';
  return mat;
}

/**
 * opts: views [[x,y,z]] (the first one focuses the terrain grid), region { x, z } (default all),
 * hedges (true), woods (true), grass { radius } | false, maxDistance (m).
 */
export async function loadClingLand(ctx, opts = {}) {
  const W = createClingWorld();
  const r = await fetch(new URL('cling.dkhm', CACHE));
  if (!r.ok) throw new Error('nature cache missing: cling.dkhm - run node scenes/lib/nature/offline/bake-cling.mjs');
  const hm = heightSampler(decodeHeightmap(await r.arrayBuffer()));
  W.installLand({ sample: (x, z) => (hm.inside(x, z) ? hm.sample(x, z) : W.base(x, z)) });
  const views = (opts.views || [[0, 20, 20]]).map((v) => new THREE.Vector3(...v));
  const region = opts.region || { x: CLING_LAND.x, z: CLING_LAND.z };
  const map = fieldMap(W, region, opts.mapCell ?? 4);
  const material = await farmlandMaterial(ctx, map);
  const group = new THREE.Group();
  group.name = 'cling-land';
  const v0 = views[0];
  const hf = heightfield({
    xs: gradedAxis(region.x[0], region.x[1], opts.grid?.[0] ?? 700, v0.x, 2.6), zs: gradedAxis(region.z[0], region.z[1], opts.grid?.[1] ?? 700, v0.z, 2.6),
    height: (x, z) => W.height(x, z),
  });
  const ground = new THREE.Mesh(hf.geometry, material);
  ground.receiveShadow = true; ground.castShadow = true;
  group.add(ground);
  const nearest = (x, y, z) => { let d = Infinity; for (const v of views) d = Math.min(d, Math.hypot(v.x - x, v.y - y, v.z - z)); return d; };
  const maxD = opts.maxDistance ?? 3500;
  const rng = mulberry(3131);
  const counts = {};
  // ------------------------------------------------------------------ hedgerows ---
  if (opts.hedges !== false) {
    const lists = [[], [], []];
    const treeSpots = [], hedgeCards = [];
    const step = 2.2;
    const [x0, x1] = region.x, [z0, z1] = region.z;
    // walk a grid; where the nearest field changes between two cells, there is a field boundary
    const G = 2.2;
    for (let z = z0; z < z1; z += G) for (let x = x0; x < x1; x += G) {
      const d = nearest(x, 0, z);
      if (d > maxD) continue;
      const far = d > 900;
      if (far && rng() > 0.35) continue;
      const f = W.fieldAt(x, z);
      if (!f || !f.other) continue;
      if (Math.abs(f.edge) > G * 0.55) continue;
      if (Math.hypot(x, z) < 125) continue;
      if (W.wood(x, z) > 0.45) continue;
      if (W.roadD(x, z) < 7 || W.laneD(x, z) < 4.5) continue;               // gaps where the road crosses
      // furlongs were open: only some of their boundaries carry hedges; closes are all hedged
      const both = f.site.kind === 'furlong' && f.other.kind === 'furlong';
      const hk = hash2(Math.min(f.site.id, f.other.id), Math.max(f.site.id, f.other.id), 7);
      if (both && hk > 0.45) continue;
      // gateways
      if (hash2(Math.round(x / 9), Math.round(z / 9), 3) < 0.04) continue;
      const y = W.height(x, z);
      const lod = d < 80 ? 0 : d < 450 ? 1 : 2;
      // a hedge is a continuous laid-and-trimmed wall of shrubs: clumps elongated along the line
      const ex = f.other.x - f.site.x, ez = f.other.z - f.site.z;
      // the clump's long (local z) axis runs ALONG the boundary, i.e. across the line between the sites
      const yaw = Math.atan2(ex, ez) + Math.PI / 2 + (rng() - 0.5) * 0.25;
      // far away only every third cell is kept: those clumps are stretched to keep the hedge unbroken
      const w = (1.7 + 0.8 * rng()) * (far ? 1.3 : 1), h = (2.0 + 1.0 * rng()) * (far ? 1.15 : 1), len = (3.0 + 1.4 * rng()) * (far ? 2.6 : 1);
      // near the lens the clump is only the dense core: card-built blackthorn and hawthorn shrubs
      // grow through it and make the twiggy, gappy silhouette of a real hedge
      const near = d < 75;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.25, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(w * (near ? 0.5 : 1), h * (near ? 0.55 : 1), len * (near ? 0.85 : 1)));
      if (!near) lists[lod].push(m);
      if (near) hedgeCards.push({ x: x + (rng() - 0.5) * 0.8, y, z: z + (rng() - 0.5) * 0.8, variant: Math.floor(rng() * 3), yaw: rng() * 6.28, scale: (h / 2.1) * (0.85 + 0.3 * rng()), thorn: rng() < 0.3 });
      if (hash2(Math.round(x / 3), Math.round(z / 3), 11) < (far ? 0.05 : 0.03)) treeSpots.push([x, y, z]);
    }
    const geos = [shrubGeometry('scrub', 7, 3), shrubGeometry('scrub', 8, 2), shrubGeometry('scrub', 9, 1)];
    const hmat = foliageMaterial('scrub', { flower: [0.92, 0.92, 0.86, 0.04] });
    lists.forEach((L, lod) => {
      if (!L.length) return;
      const mesh = new THREE.InstancedMesh(geos[lod], hmat, L.length);
      L.forEach((m, i) => mesh.setMatrixAt(i, m));
      const col = new Float32Array(L.length * 3);
      for (let i = 0; i < L.length; i++) { const t = 0.8 + 0.45 * hash2(i, lod, 2); col[i * 3] = t * (0.95 + 0.1 * hash2(i, 1, 3)); col[i * 3 + 1] = t; col[i * 3 + 2] = t * 0.9; }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
      mesh.castShadow = lod < 2; mesh.receiveShadow = true; mesh.computeBoundingSphere();
      group.add(mesh);
    });
    counts.hedge = lists.reduce((a, L) => a + L.length, 0);
    if (hedgeCards.length) {
      const bt = await treeKit(ctx, 'blackthorn', { variants: 3, exposure: 0.15, seed: 5 });
      const hw = await treeKit(ctx, 'hawthorn', { variants: 2, exposure: 0, seed: 6, scale: 0.6 });
      const pl = hedgeCards.map((c) => ({ ...c, kit: c.thorn ? hw : bt, variant: c.thorn ? c.variant % 2 : c.variant, scale: c.thorn ? c.scale * 0.9 : c.scale }));
      group.add(scatterTrees(pl, { views: opts.views, lod0: 35, lod1: 120, lod2: 400 }).group);
      counts.hedgeShrubs = pl.length;
    }
    // hedgerow trees: oaks and ashes standing out of the hedges
    const oak = await treeKit(ctx, 'oak', { variants: 3, seed: 2 }), ash = await treeKit(ctx, 'ash', { variants: 2, seed: 3 });
    const places = treeSpots.map(([x, y, z], i) => ({ kit: hash2(i, 1, 9) < 0.6 ? oak : ash, x, y, z, variant: i % 3, yaw: hash2(i, 2, 9) * 6.28, scale: 0.85 + 0.4 * hash2(i, 3, 9) }));
    // ------------------------------------------------------------------ woods ---
    if (opts.woods !== false) {
      const syc = await treeKit(ctx, 'sycamore', { variants: 2, seed: 4 });
      for (let z = z0; z < z1; z += 9) for (let x = x0; x < x1; x += 9) {
        const jx = x + (rng() - 0.5) * 8, jz = z + (rng() - 0.5) * 8;
        const w = W.wood(jx, jz);
        if (w < 0.5 || rng() > w) continue;
        const y = W.height(jx, jz);
        const d = nearest(jx, y, jz);
        if (d > maxD) continue;
        const u = rng();
        places.push({ kit: u < 0.55 ? oak : u < 0.8 ? ash : syc, x: jx, y, z: jz, variant: Math.floor(rng() * 3), yaw: rng() * 6.28, scale: 0.8 + 0.45 * rng() });
      }
    }
    counts.trees = places.length;
    group.add(scatterTrees(places, { views: opts.views, lod0: 40, lod1: 160, lod2: 420 }).group);
  }
  if (opts.grass) {
    // around every view near the ground (eye-level views may be passed with y = 0 before grading)
    const R = opts.grass.radius ?? 60;
    const centers = views.filter((v) => v.y - W.height(v.x, v.z) < 8);
    for (const [ci, c] of (centers.length ? centers : [v0]).entries()) {
      group.add(grassField({ count: opts.grass.count ?? 50000, seed: 2 + ci, height: opts.grass.height ?? [0.1, 0.4], place: (rr) => {
        const a = rr() * 6.283, d = R * Math.sqrt(rr());
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (W.roadD(x, z) < 4.5 || Math.hypot(x, z) < 110) return null;
        return [x, W.height(x, z) - 0.02, z];
      } }));
    }
  }
  console.warn(`[nature] cling land: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  return { group, world: W, heightAt: (x, z) => W.height(x, z), material, map };
}
