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
  const data = new Uint8Array(nx * nz * 4), edge = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, k = (j * nx + i) * 4;
    const f = W.fieldAt(x, z);
    edge[k] = f ? Math.min(255, Math.round(Math.abs(f.edge) * 25)) : 255;
    edge[k + 1] = f && f.site.kind === 'furlong' ? 255 : 0;
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
  // distance to the field edge (r, 0.04 m units) and furlong flag (g), linearly filtered
  const ed = new THREE.DataTexture(edge, nx, nz, THREE.RGBAFormat);
  ed.magFilter = THREE.LinearFilter; ed.minFilter = THREE.LinearFilter;
  ed.needsUpdate = true;
  return { texture: t, linear: lin, edge: ed, data, nx, nz, xf: new THREE.Vector4(x0, z0, 1 / ((nx - 1) * cell), 1 / ((nz - 1) * cell)), cell, x0, z0 };
}

const FARM_GLSL = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray nkAlb; uniform sampler2DArray nkNrm; uniform sampler2DArray nkDat;
uniform float nkTile[9];
uniform sampler2D fMap; uniform sampler2D fMapL; uniform sampler2D fEdge; uniform vec4 fMapXf; uniform vec2 fMapN; uniform vec4 fFocus;
void dkProj2(int ax, vec3 p, vec3 n, out vec2 uv, out vec3 T, out vec3 B) {
  if (ax == 0) { float s = n.x >= 0.0 ? 1.0 : -1.0; uv = vec2(-s * p.z, p.y); T = vec3(0.0, 0.0, -s); }
  else if (ax == 1) { float s = n.y >= 0.0 ? 1.0 : -1.0; uv = vec2(p.x, -s * p.z); T = vec3(1.0, 0.0, 0.0); }
  else { float s = n.z >= 0.0 ? 1.0 : -1.0; uv = vec2(s * p.x, p.y); T = vec3(s, 0.0, 0.0); }
  T = normalize(T - n * dot(n, T)); B = cross(n, T);
}
void fTap(int L, vec3 P, vec3 n, float scale, out vec3 alb, out vec3 nw, out float h) {
  vec2 uv; vec3 T, B;
  dkProj2(1, P * nkTile[L] * scale, n, uv, T, B);
  // a slow, gentle warp (a strong one smeared the photo into swirls over whole pastures)
  uv += (vec2(dkVN2(uv * 0.07 + float(L) * 3.1), dkVN2(uv * 0.07 + 17.3)) - 0.5) * 0.35;
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
vec4 fe = texture2D(fEdge, fuv);
float edgeD = fe.r * 10.2;
float furlong = step(0.5, fe.g);
float camD = length(P - cameraPosition);
float m1 = dkFbm3(P * 0.02), m2 = dkFbm3(P * 0.11 + 4.0), m3 = dkVN2(P.xz * 0.9);
// the strips of a furlong (same construction as cling-world.js ridgeAt): width 6-10 m, straight or
// reverse-S, ridge and furrow 0.4-0.8 m with broad round ridges and sharp furrows
vec2 sd = vec2(cos(dir), sin(dir));
float alongS = dot(P.xz, vec2(-sd.y, sd.x));
float sw = 6.0 + 4.0 * rnd;
float across = dot(P.xz, sd) + (rnd > 0.45 ? 5.5 * sin(alongS / 38.0 + rnd * 20.0) : 0.0);
float strip = floor(across / sw);
float sh = fract(sin(strip * 12.9898 + rnd * 78.233) * 43758.5453);
float su = fract(across / sw);
float prof = 1.0 - (2.0 * su - 1.0) * (2.0 * su - 1.0);
vec3 grassA; vec3 nA; float hA;
fTap(1, P, N0, 1.0, grassA, nA, hA);
vec3 col; vec3 nrm = nA; float rough = 0.9;
bool strips = crop >= 2.0 && crop <= 5.0;
if (crop < 0.5) {            // pasture: grazed turf, darker tussocks, sheep-cropped paler patches
  col = grassA * vec3(0.4, 0.47, 0.28) * (0.75 + 0.5 * m3) * (0.85 + 0.3 * m2);
  col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.12);
} else if (crop < 1.5) {     // hay meadow: long grass, seed heads, flowers
  vec3 a2; vec3 n2; float h2; fTap(7, P + 3.0, N0, 0.8, a2, n2, h2);
  col = mix(grassA * vec3(0.45, 0.55, 0.3), a2 * vec3(0.6, 0.58, 0.4), 0.35 + 0.2 * m3) * (0.85 + 0.3 * m2);
  col = mix(col, vec3(0.6, 0.55, 0.3), smoothstep(0.78, 0.9, dkVN2(P.xz * 3.0)) * 0.25);
} else if (crop < 3.5) {     // wheat / barley: standing grain turning from green to gold, strips in step
  vec3 a2; vec3 n2; float h2; fTap(7, P, N0, 1.6, a2, n2, h2);
  vec3 grain = crop < 2.5 ? vec3(0.25, 0.21, 0.085) : vec3(0.28, 0.25, 0.12);
  float tx = clamp(dot(a2, vec3(0.33)) / 0.3, 0.4, 1.6);
  col = grain * (0.6 + 0.45 * tx) * (0.82 + 0.22 * sh + 0.14 * m2);
  col = mix(col, col * vec3(0.72, 1.0, 0.6), 0.45 * sh * sh);     // a greener, later-sown strip here and there
  // standing crop: wind-flattened (lodged) patches are paler, the tramlines of weeds darker
  col *= 1.0 - 0.12 * smoothstep(0.62, 0.8, dkVN2(P.xz * 0.12 + rnd * 9.0));
  nrm = normalize(mix(n2, N0, 0.4));
  rough = 0.85;
} else if (crop < 4.5) {     // fallow: weedy grass and bare patches
  vec3 a2; vec3 n2; float h2; fTap(2, P, N0, 1.0, a2, n2, h2);
  col = mix(grassA * vec3(0.45, 0.5, 0.3), a2 * vec3(0.55, 0.5, 0.38), 0.5 + 0.3 * sh) * (0.85 + 0.3 * m3);
} else if (crop < 5.5) {     // ploughed: turned slices (asymmetric), clods, stubble left in the soil
  vec3 a2; vec3 n2; float h2; fTap(3, P, N0, 1.0, a2, n2, h2);
  float fs = fract(across / 0.3);
  float slope = fs < 0.72 ? 0.9 : -2.4;                       // the slice's long back, its steep face
  float clod = dkVN2(P.xz * 6.0 + 3.0) - 0.5, clod2 = dkVN2(P.xz * 15.0) - 0.5;
  float fine = 1.0 - smoothstep(25.0, 120.0, camD);
  col = a2 * vec3(0.42, 0.34, 0.26) * (0.8 + 0.25 * sh) * (1.0 + 0.25 * clod * fine) * (1.0 - 0.12 * step(0.72, fs) * fine);
  col = mix(col, vec3(0.45, 0.4, 0.27), smoothstep(0.86, 0.95, dkVN2(P.xz * 9.0 + 1.0)) * 0.6 * fine);   // straw
  nrm = normalize(n2 + (vec3(sd.x, 0.0, sd.y) * slope * 0.25 + vec3(clod, 0.0, clod2) * 0.6) * fine);
} else if (crop < 6.5) {
  col = grassA * vec3(0.42, 0.47, 0.3);
} else if (crop < 7.5) {     // wood floor (mostly hidden under trees): leaf litter, moss
  vec3 a2; vec3 n2; float h2; fTap(8, P, N0, 1.0, a2, n2, h2);
  col = mix(a2 * vec3(0.45, 0.37, 0.26), grassA * vec3(0.3, 0.36, 0.2), 0.4 * m3);
} else {                     // the town shelf: trodden grass and earth (the architecture covers most of it)
  vec3 a2; vec3 n2; float h2; fTap(2, P, N0, 1.0, a2, n2, h2);
  col = mix(grassA * vec3(0.42, 0.47, 0.3), a2 * vec3(0.6, 0.53, 0.42), 0.4 + 0.3 * m3);
}
// ridge and furrow (furlongs): the furrows hold the wet - greener and darker; far away, where the
// terrain grid cannot carry the 6-10 m ridges, they are shaded through the normal
if ((strips || crop < 0.5) && furlong > 0.5) {
  float amp = (0.4 + 0.4 * fract(rnd * 7.31)) * smoothstep(3.0, 12.0, edgeD);
  float dh = -4.0 * amp * (2.0 * su - 1.0) / sw;
  // (where the geometry carries no ridges; gentler under standing crops than under grass)
  float rfN = smoothstep(fFocus.z, fFocus.w, length(P.xz - fFocus.xy)) * (1.0 - smoothstep(1500.0, 3000.0, camD)) * (crop < 0.5 ? 0.5 : 0.28);
  nrm = normalize(nrm - vec3(sd.x, 0.0, sd.y) * dh * rfN);
  col *= mix(0.94, 1.03, prof * smoothstep(3.0, 12.0, edgeD));
  col = mix(col, col * vec3(0.88, 1.0, 0.85), (1.0 - prof) * 0.2);
}
// field margins and headlands: a 1-3 m band of rough grass, docks and nettles along every boundary
{
  float mg = 1.0 - smoothstep(0.8, 1.6 + 1.6 * rnd, edgeD + 0.6 * (m3 - 0.5));
  vec3 rg = grassA * vec3(0.38, 0.46, 0.26) * (0.7 + 0.6 * dkVN2(P.xz * 1.7));
  rg = mix(rg, vec3(0.32, 0.28, 0.16), smoothstep(0.72, 0.85, dkVN2(P.xz * 2.3 + 4.0)) * 0.5);
  col = mix(col, rg, mg * step(0.5, 7.5 - crop) * step(1.5, crop + 0.0) * 0.9 + mg * 0.4 * step(crop, 1.5));
}
// the road and the lane: a sunken earth hollow way - rutted brown-grey earth and puddles, a grass
// strip down the middle between the wheel ruts, hoof-churned mud, grass verges up the banks
if (road > 0.01) {
  vec3 a2; vec3 n2; float h2; fTap(3, P, N0, 1.0, a2, n2, h2);
  vec3 a3; vec3 n3; float h3; fTap(8, P + 7.0, N0, 1.0, a3, n3, h3);
  vec3 dirt = mix(a2 * vec3(0.36, 0.31, 0.25), a3 * vec3(0.5, 0.45, 0.38), 0.4 + 0.3 * m3);
  dirt *= 0.85 + 0.3 * dkVN2(P.xz * 0.6);
  float hoof = smoothstep(0.55, 0.8, dkVN2(P.xz * 4.0 + 2.0));
  dirt = mix(dirt, dirt * 0.62, hoof * 0.5);
  // the wheel ruts (0.95 m either side of the crown) and the water standing in them
  float rd = (1.0 - road) * 5.5;
  float rut = exp(-pow((rd - 0.95) / 0.28, 2.0)) * step(0.5, road);
  float puddle = rut * smoothstep(0.5, 0.75, dkVN2(P.xz * 0.35 + 9.0));
  dirt *= 1.0 - 0.25 * rut;
  float crownG = (1.0 - smoothstep(0.32, 0.5, rd + 0.12 * (m3 - 0.5))) * step(0.5, road);
  vec3 rc = mix(dirt, grassA * vec3(0.36, 0.42, 0.24), crownG * 0.85);
  // verges: lusher grass between the trodden way and the hedge banks
  float way = smoothstep(0.42, 0.55, road + 0.08 * (m3 - 0.5));
  rc = mix(grassA * vec3(0.4, 0.5, 0.28) * (0.75 + 0.5 * m3), rc, way);
  float w = smoothstep(0.02, 0.2, road);
  col = mix(col, rc, w);
  nrm = normalize(mix(nrm, mix(n2, N0, 0.3), w * way));
  rough = mix(rough, 0.92, w);
  col = mix(col, col * 0.35, puddle * way);
  rough = mix(rough, 0.05, puddle * way);
  nrm = normalize(mix(nrm, N0, puddle * way));
}
// steep banks show the soil and the stone
float steep = smoothstep(0.75, 0.55, N0.y);
if (steep > 0.01) { vec3 a2; vec3 n2; float h2; fTap(3, P, N0, 0.6, a2, n2, h2); col = mix(col, mix(a2 * vec3(0.4, 0.34, 0.27), grassA * vec3(0.4, 0.46, 0.28), 0.4), steep); nrm = normalize(mix(nrm, n2, steep)); }
col *= 0.9 + 0.2 * m1;
fNrm = nrm; fRough = rough;
diffuseColor.rgb *= col;
`;

export async function farmlandMaterial(ctx, map, opts = {}) {
  const T = await textureLayers(ctx, LAYERS, { size: 1024 });
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  mat.name = 'nature:farmland';
  const U = {
    nkAlb: { value: T.albedo }, nkNrm: { value: T.normal }, nkDat: { value: T.data },
    nkTile: { value: LAYERS.map((id) => 1 / (T.tile[T.index[id]] || 2)) },
    fMap: { value: map.texture }, fMapL: { value: map.linear }, fEdge: { value: map.edge }, fFocus: { value: new THREE.Vector4(...(opts.ridgeFocus || [0, 0, 160, 290])) }, fMapXf: { value: map.xf }, fMapN: { value: new THREE.Vector2(map.nx, map.nz) },
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
  mat.customProgramCacheKey = () => 'nature-farmland-v3';
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
  // the terrain grid is ~2.3-2.8 m within ~300 m of the first view: geometric ridge and furrow there
  W.setRidgeFocus([views[0].x, views[0].z, 160, 290]);
  const map = fieldMap(W, region, opts.mapCell ?? 4);
  const material = await farmlandMaterial(ctx, map, { ridgeFocus: [views[0].x, views[0].z, 160, 290] });
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
      if (Math.hypot(x, z) < 125) continue;
      if (W.wood(x, z) > 0.45) continue;
      // hedges on the banks either side of the hollow ways
      const rdR = W.roadD(x, z), rdL = W.laneD(x, z);
      const onBank = (rdR > 6.2 && rdR < 6.2 + G) || (rdL > 4.4 && rdL < 4.4 + G);
      if (!onBank) {
        if (!f || !f.other) continue;
        if (Math.abs(f.edge) > G * 0.55) continue;
        if (rdR < 7 || rdL < 4.5) continue;                                   // gaps where the road crosses
      }
      // furlongs were open: only some of their boundaries carry hedges; closes are all hedged
      if (!onBank) {
        const both = f.site.kind === 'furlong' && f.other.kind === 'furlong';
        const hk = hash2(Math.min(f.site.id, f.other.id), Math.max(f.site.id, f.other.id), 7);
        if (both && hk > 0.45) continue;
      }
      // gateways, and gaps where the hedge has died back or been grubbed out
      if (hash2(Math.round(x / 9), Math.round(z / 9), 3) < 0.04) continue;
      const hn = W.N3.fbm2(x / 23 + 7, z / 23, 2), hn2 = W.N2.n2(x / 7, z / 7);
      if (hn < -0.38 + 0.1 * hn2) continue;
      const y = W.height(x, z);
      const lod = d < 80 ? 0 : d < 450 ? 1 : 2;
      // a hedge is a continuous laid-and-trimmed wall of shrubs: clumps elongated along the line
      let ex, ez;
      if (onBank) { const rd = rdR < rdL ? W.roadD : W.laneD; ex = rd(x + 1, z) - rd(x - 1, z); ez = rd(x, z + 1) - rd(x, z - 1); }
      else { ex = f.other.x - f.site.x; ez = f.other.z - f.site.z; }
      // the clump's long (local z) axis runs ALONG the boundary, i.e. across the line between the sites
      const yaw = Math.atan2(ex, ez) + Math.PI / 2 + (rng() - 0.5) * 0.25;
      // far away only every third cell is kept: those clumps are stretched to keep the hedge unbroken
      // a real hedge: 2-4 m tall, 2-3 m wide, an irregular top (laid in some years, grown out in others)
      const tall = 2.4 + 1.3 * smoothstep(-0.4, 0.5, hn) + 0.5 * hn2;
      const w = (2.4 + 0.8 * rng()) * (far ? 1.3 : 1), h = tall * (0.85 + 0.3 * rng()) * (far ? 1.1 : 1), len = (5.2 + 2.0 * rng()) * (far ? 2.2 : 1);   // long: the humps merge into one hedge
      // near the lens the clump is the dense lower core (it fills the hedge base to the ground, no
      // stems on stilts): card-built blackthorn and hawthorn shrubs grow through and over it and make
      // the twiggy, gappy silhouette of a real hedge. The switch lies beyond 140 m, so the far proxy
      // never shows behind the card hedge in a ground-level shot.
      const near = d < 140;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.25, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(w * (near ? 0.62 : 1), h * (near ? 0.36 : 1), len * (near ? 0.9 : 1)));
      lists[lod].push(m);
      if (near) hedgeCards.push({ x: x + (rng() - 0.5) * 0.8, y, z: z + (rng() - 0.5) * 0.8, variant: Math.floor(rng() * 3), yaw: rng() * 6.28, scale: (h / 2.4) * (0.85 + 0.3 * rng()), thorn: rng() < 0.3 });
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
      group.add(scatterTrees(pl, { views: opts.views, lod0: 35, lod1: 150, lod2: 400 }).group);
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
        if (W.roadD(x, z) < 2.4 || W.laneD(x, z) < 1.4 || Math.hypot(x, z) < 110) return null;      // (grass up the banks, not on the trodden way)
        return [x, W.height(x, z) - 0.02, z];
      } }));
    }
  }
  console.warn(`[nature] cling land: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  return { group, world: W, heightAt: (x, z) => W.height(x, z), material, map };
}
