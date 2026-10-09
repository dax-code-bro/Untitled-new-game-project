// Low vegetation for the nature library: a land-cover map, wind-shaped shrub clumps (gorse,
// heather, bracken, blackthorn scrub), thrift cushions on the cliff edge, and the set library's
// geometry grass near the camera.
//
//   const cover = landCover(W, { x: [x0, x1], z: [z0, z1], cell: 2, height: (x, z) => y });
//   coast.material.userData.setCover(cover);        // the ground under each plant community
//   const veg = scatterPlants(ctx, { cover, views, height, slope, exclude });
//
// A real cliff-top in the west of Britain or Brittany is zoned by salt and wind, and that zoning is
// what makes it read as real from the air: short salt-pruned turf with thrift right at the edge,
// a belt of gorse cushions behind it, heath (heather, bell heather) on the thin soils, bracken on
// the deeper soils and slopes, blackthorn scrub crouched in the hollows, every shrub combed
// leeward by the westerlies.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise, mulberry, smoothstep, clamp, hash2 } from './noise.js';
import { GLSL_NOISE } from '../sets/materials.js';
import { grassField } from '../sets/grass.js';

export const WIND = new THREE.Vector3(1, 0, 0.25).normalize();   // prevailing wind blows from the sea (+x) inland

// ------------------------------------------------------------------ land cover ---
/**
 * opts: x [x0, x1], z [z0, z1], cell (m), height(x, z), coastF(x, z) (m seaward of the cliff line),
 * flow(x, z) (0..1 drainage), seed. Returns { data (RGBA bytes: heath, gorse, bracken, scrub),
 * texture, sample(x, z) -> [h, g, b, s], xf: Vector4 (x0, z0, 1/sx, 1/sz) }.
 */
export function landCover(opts) {
  const [x0, x1] = opts.x, [z0, z1] = opts.z, cell = opts.cell ?? 2;
  const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const N = makeNoise(opts.seed ?? 31), N2 = makeNoise((opts.seed ?? 31) + 7);
  const data = new Uint8Array(nx * nz * 4);
  const H = opts.height, CF = opts.coastF || (() => -1000), FL = opts.flow || (() => 0);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, k = (j * nx + i) * 4;
    const F = CF(x, z);
    if (F > -1.5) continue;                       // the face, the platform, the sea
    const din = -F;
    const hx = (H(x + cell, z) - H(x - cell, z)) / (2 * cell), hz = (H(x, z + cell) - H(x, z - cell)) / (2 * cell);
    const slope = Math.hypot(hx, hz);
    const flow = FL(x, z);
    // salt and wind: nothing but short turf in the first ~8-25 m from the edge
    const salt = 1 - smoothstep(6, 30 + 12 * N.n2(x / 90, z / 90), din);
    const p1 = N.fbm2(x / 70, z / 70, 4), p2 = N2.fbm2(x / 25, z / 25, 3), p3 = N.fbm2(x / 180 + 9, z / 180, 3);
    // gorse: a broken belt 15-200 m in, in clumped patches
    let gorse = smoothstep(0.0, 0.35, p1 + 0.25 * p2) * smoothstep(10, 30, din) * (1 - smoothstep(180, 420, din)) * 0.95;
    // heath on the thin soils of the higher, flatter ground
    let heath = smoothstep(-0.05, 0.3, p3 + 0.2 * p2) * (1 - smoothstep(0.25, 0.5, slope)) * smoothstep(20, 60, din);
    // bracken: deeper soils, slopes, valley sides
    let bracken = smoothstep(0.05, 0.35, -p1 + 0.35 * slope + 0.2 * p2) * smoothstep(40, 90, din) * (0.4 + 0.6 * smoothstep(0.08, 0.3, slope));
    // blackthorn scrub crouched in sheltered hollows and along the valley floors
    let scrub = smoothstep(0.25, 0.7, flow + 0.25 * p2) * smoothstep(30, 80, din) * 0.9;
    const s = 1 - salt;
    gorse *= s; heath *= s * (1 - gorse * 0.6); bracken *= s * (1 - gorse) * (1 - heath * 0.5); scrub *= s;
    data[k] = clamp(heath, 0, 1) * 255; data[k + 1] = clamp(gorse, 0, 1) * 255; data[k + 2] = clamp(bracken, 0, 1) * 255; data[k + 3] = clamp(scrub, 0, 1) * 255;
  }
  const texture = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const sample = (x, z) => {
    const fi = (x - x0) / cell, fk = (z - z0) / cell;
    const i = Math.round(fi), k = Math.round(fk);
    if (i < 0 || k < 0 || i >= nx || k >= nz) return [0, 0, 0, 0];
    const q = (k * nx + i) * 4;
    return [data[q] / 255, data[q + 1] / 255, data[q + 2] / 255, data[q + 3] / 255];
  };
  return { data, texture, sample, nx, nz, cell, x0, z0, xf: new THREE.Vector4(x0, z0, 1 / ((nx - 1) * cell), 1 / ((nz - 1) * cell)) };
}

// ------------------------------------------------------------------ shrub geometry ---
const SHRUBS = {
  // lobes, flattening, leeward shear, base spread, leaf scale (1/m), colours, flowers
  gorse: { lobes: [4, 8], flat: 0.7, shear: 0.45, leaf: 14, col: [0.032, 0.048, 0.016], var: 0.25, flower: [0.85, 0.62, 0.05, 0.08] },
  heather: { lobes: [3, 6], flat: 0.38, shear: 0.25, leaf: 22, col: [0.07, 0.065, 0.04], var: 0.3, flower: [0.32, 0.12, 0.22, 0.0] },
  bracken: { lobes: [5, 9], flat: 0.55, shear: 0.3, leaf: 7, col: [0.16, 0.2, 0.05], var: 0.35, flower: [0.3, 0.18, 0.06, 0.0] },
  scrub: { lobes: [6, 11], flat: 0.62, shear: 0.6, leaf: 10, col: [0.045, 0.06, 0.03], var: 0.2, flower: [0.9, 0.9, 0.85, 0.06] },
  thrift: { lobes: [1, 2], flat: 0.55, shear: 0.0, leaf: 60, col: [0.12, 0.16, 0.08], var: 0.2, flower: [0.9, 0.5, 0.62, 0.0] },
};

/** A wind-shaped shrub clump, unit footprint (~1 m across), base at y = 0; attribute aH (0 base .. 1 top). */
export function shrubGeometry(kind, seed = 1, detail = 3) {
  const S = SHRUBS[kind], r = mulberry(seed * 977 + kind.length), N = makeNoise(seed + 300);
  const nl = Math.round(S.lobes[0] + r() * (S.lobes[1] - S.lobes[0]));
  const lobes = [];
  for (let i = 0; i < nl; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.32;
    const rad = 0.2 + 0.18 * r();
    // leeward lobes ride higher (the windward side is clipped)
    const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
    const lee = -(lx * WIND.x + lz * WIND.z);
    lobes.push([lx, rad * S.flat + 0.12 + 0.25 * Math.max(0, lee) * S.shear * 3, lz, rad]);
  }
  let g = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const aH = new Float32Array(p.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    // the clump surface: the largest lobe reach along this direction (union of spheres, by ray)
    let best = 0.15;
    for (const [lx, ly, lz, rad] of lobes) {
      // ray from (0, 0.25, 0) along v: distance to sphere exit
      const ox = -lx, oy = 0.25 - ly, oz = -lz;
      const b = ox * v.x + oy * v.y + oz * v.z, c = ox * ox + oy * oy + oz * oz - rad * rad;
      const disc = b * b - c;
      if (disc > 0) best = Math.max(best, -b + Math.sqrt(disc));
    }
    const n = 0.55 * N.n3(v.x * 3, v.y * 3, v.z * 3) + 0.3 * N.n3(v.x * 8, v.y * 8, v.z * 8);
    best *= 1 + 0.18 * n;
    let x = v.x * best, y = 0.25 + v.y * best, z = v.z * best;
    // flattened by the wind on top, combed leeward
    y = Math.max(0, y * S.flat * 1.5);
    const lee = -(x * WIND.x + z * WIND.z);
    x -= WIND.x * y * S.shear * 0.6; z -= WIND.z * y * S.shear * 0.6;
    if (lee < 0) y *= 1 + lee * 0.6 * S.shear;
    p.setXYZ(i, x, y, z);
  }
  let ymax = 0; for (let i = 0; i < p.count; i++) ymax = Math.max(ymax, p.getY(i));
  for (let i = 0; i < p.count; i++) aH[i] = p.getY(i) / Math.max(ymax, 1e-3);
  g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  g.computeVertexNormals();
  // soften the normals toward a dome (foliage masses shade softly, not facet by facet)
  const nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i) - 0.15, p.getZ(i)).normalize();
    const nn = new THREE.Vector3(nr.getX(i), nr.getY(i), nr.getZ(i)).lerp(v, 0.4).lerp(new THREE.Vector3(0, 1, 0), 0.3).normalize();
    nr.setXYZ(i, nn.x, nn.y, nn.z);
  }
  g.computeBoundingSphere();
  return g;
}

/**
 * Foliage shader for clumps: leaf-scale light and dark (gaps between sprays), bumped normals,
 * light through the leaves toward the camera, darker inside / at the base, flowers on the lit top.
 */
export function foliageMaterial(kind, opts = {}) {
  const S = SHRUBS[kind];
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...S.col), roughness: 0.85, metalness: 0, envMapIntensity: 0.6 });
  const U = {
    fLeaf: { value: opts.leafScale ?? S.leaf },
    fFlower: { value: new THREE.Vector4(...(opts.flower || S.flower)) },
    fTrans: { value: new THREE.Color(...(opts.translucency || [0.14, 0.2, 0.035])) },
    fVar: { value: S.var },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aH; varying float vH; varying vec3 vFW; varying vec3 vFL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = aH; vFL = position;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 w = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  w = instanceMatrix * w;
#endif
  vFW = (modelMatrix * w).xyz; }`);
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vH; varying vec3 vFW; varying vec3 vFL; uniform float fLeaf; uniform vec4 fFlower; uniform vec3 fTrans; uniform float fVar;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float n1 = dkVN3(vFW * fLeaf), n2 = dkVN3(vFW * fLeaf * 2.7 + 7.0), n3 = dkVN3(vFW * fLeaf * 0.25 + 3.0);
  float leaf = n1 * 0.55 + n2 * 0.45;
  // gaps between sprays are dark (self-shadowed interior), sprays catch light
  diffuseColor.rgb *= mix(0.35, 1.35, smoothstep(0.25, 0.75, leaf)) * (1.0 + fVar * (n3 - 0.5) * 2.0);
  diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.0, 0.6, vH));
  // clumps within the mass at the 0.3-1 m scale (sprays, hollows) - still there when the leaf
  // scale has averaged away at range
  float n4 = dkVN3(vFW * fLeaf * 0.16 + 13.0) * 0.6 + dkVN3(vFW * fLeaf * 0.42 + 17.0) * 0.4;
  diffuseColor.rgb *= 0.55 + 0.9 * smoothstep(0.2, 0.8, n4);
  float lump = dkVN3(vFW * fLeaf * 0.3 + 21.0);
  diffuseColor.rgb *= 0.6 + 0.6 * smoothstep(0.2, 0.7, lump);
  // flowers in sprays, not a uniform sprinkle (they show at range as warm flecks)
  float fl = max(smoothstep(0.62, 0.8, dkVN3(vFW * fLeaf * 1.6 + 11.0)), 0.45 * smoothstep(0.62, 0.8, dkVN3(vFW * fLeaf * 0.35 + 19.0)))
    * smoothstep(0.3, 0.9, vH) * fFlower.w * smoothstep(0.3, 0.7, n3 + 0.3) * 1.6;
  diffuseColor.rgb = mix(diffuseColor.rgb, fFlower.rgb, fl);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // a ragged, see-through silhouette: toward the outline the mass breaks into sprays with sky and
  // ground between them (a closed smooth hull is what makes a clump read as a pom-pom)
  float facing = abs(dot(normal, normalize(vViewPosition)));
  float rag = dkVN3(vFW * fLeaf * 0.8 + 2.0) * 0.55 + dkVN3(vFW * fLeaf * 0.25 + 6.0) * 0.45;
  if (rag > 0.22 + 1.5 * facing + 0.6 * smoothstep(0.35, 0.0, vH)) discard;   // (never at the base: no pale rings of ground)
}
{
  vec3 b = vec3(dkVN3(vFW * fLeaf * 1.3) - 0.5, dkVN3(vFW * fLeaf * 1.3 + 5.0) - 0.5, dkVN3(vFW * fLeaf * 1.3 + 9.0) - 0.5);
  // lumps of foliage at the 10-30 cm scale (the cauliflower surface of a dense bush), resolved at
  // range where the leaf-scale bump has averaged out
  vec3 bl = vec3(dkVN3(vFW * fLeaf * 0.3 + 1.0) - 0.5, dkVN3(vFW * fLeaf * 0.3 + 6.0) - 0.5, dkVN3(vFW * fLeaf * 0.3 + 11.0) - 0.5);
  normal = normalize(normal + (viewMatrix * vec4(b * 0.9 + bl * 1.6, 0.0)).xyz);
}`);
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    const a0 = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
    const b0 = a0 >= 0 ? chunk.indexOf('#endif', chunk.indexOf('#pragma unroll_loop_end', a0)) : -1;
    if (a0 >= 0 && b0 > a0) {
      let block = chunk.slice(a0, b0 + '#endif'.length);
      block = block.replace(/RE_Direct\(\s*directLight[^;]*;/, 'reflectedLight.directDiffuse += directLight.color * fTrans * diffuseColor.rgb * 3.0 * pow(saturate(dot(-geometryViewDir, directLight.direction)), 2.0) * (0.3 + 0.7 * vH) * RECIPROCAL_PI;');
      fs = fs.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n{\n' + block + '\n}\n');
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `nature-foliage-v3-${kind}`;
  return mat;
}

// ------------------------------------------------------------------ thrift ---
/** A thrift cushion: a low green dome with pink flower heads on wiry stalks (unit ~0.2 m). */
export function thriftGeometry(seed = 1) {
  const r = mulberry(seed + 5);
  const parts = [];
  const cushion = shrubGeometry('thrift', seed, 2);
  cushion.scale(1, 0.6, 1);
  const n = 5 + Math.floor(r() * 8);
  const heads = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.35, h = 0.55 + r() * 0.6;
    const stalk = new THREE.CylinderGeometry(0.008, 0.01, h, 3, 1, true);
    stalk.translate(Math.cos(a) * d, h / 2 + 0.1, Math.sin(a) * d);
    const head = new THREE.IcosahedronGeometry(0.055 + 0.03 * r(), 1);
    head.translate(Math.cos(a) * d, h + 0.1, Math.sin(a) * d);
    heads.push(stalk, head);
  }
  return { cushion, heads };
}

// ------------------------------------------------------------------ scattering ---
const geoCache = new Map();
function shrubGeos(kind, lod) {
  const key = `${kind}|${lod}`;
  if (!geoCache.has(key)) geoCache.set(key, [0, 1, 2, 3].map((s) => shrubGeometry(kind, s + 1, [3, 2, 1][lod])));
  return geoCache.get(key);
}

/**
 * opts: cover (landCover), views [[x,y,z]], height(x, z), slope(x, z) -> normal y, region { x, z },
 * exclude(x, z) -> true (paths, buildings), density (1), grass { radius, count } | false,
 * edge(x, z) -> metres inland of the cliff edge (thrift), maxDistance (m).
 */
export function scatterPlants(ctx, opts) {
  const group = new THREE.Group();
  group.name = 'plants';
  const views = opts.views.map((v) => new THREE.Vector3(...v));
  const rng = mulberry(opts.seed ?? 99);
  const H = opts.height, cover = opts.cover;
  const nearest = (x, y, z) => { let d = Infinity; for (const v of views) d = Math.min(d, Math.hypot(v.x - x, v.y - y, v.z - z)); return d; };
  const lists = new Map();
  const push = (kind, lod, v, m) => { const k = `${kind}|${lod}|${v}`; if (!lists.has(k)) lists.set(k, []); lists.get(k).push(m); };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const counts = {};
  const [x0, x1] = opts.region.x, [z0, z1] = opts.region.z;
  const maxD = opts.maxDistance ?? 2500;
  const dens = opts.density ?? 1;
  // candidate points on a jittered grid whose spacing grows with distance from the cameras
  const kinds = [
    // colonies, not specimens: low wind-cut cushions that merge into continuous patches
    { kind: 'gorse', ch: 1, spacing: 1.7, size: [1.2, 3.4], hgt: [0.6, 1.4], lo: 0.18, hi: 0.5 },
    { kind: 'heather', ch: 0, spacing: 1.25, size: [1.0, 2.6], hgt: [0.15, 0.35], lo: 0.25, hi: 0.6 },
    { kind: 'bracken', ch: 2, spacing: 1.4, size: [1.2, 2.8], hgt: [0.55, 1.0], lo: 0.22, hi: 0.55 },
    { kind: 'scrub', ch: 3, spacing: 2.6, size: [2.2, 5.5], hgt: [0.9, 2.4], lo: 0.25, hi: 0.6 },
  ];
  for (const K of kinds) {
    let n = 0;
    const base = K.spacing / Math.sqrt(dens);
    for (let z = z0; z < z1; z += base) for (let x = x0; x < x1; x += base) {
      const jx = x + (rng() - 0.5) * base * 1.2, jz = z + (rng() - 0.5) * base * 1.2;
      const c = cover.sample(jx, jz)[K.ch];
      // inside a colony nearly every cell is filled; outside it, almost nothing (no lone dots)
      const fill = smoothstep(K.lo, K.hi, c);
      if (fill < 0.02 || rng() > fill) continue;
      const y = H(jx, jz);
      if (y == null || !(y > 0)) continue;
      const d = nearest(jx, y, jz);
      if (d > maxD) continue;
      // heather is a fine carpet: as instances it only helps near the lens; further out the ground
      // shader's heath tint (land-cover map) carries it (flat clumps at range read as dark dashes)
      if (K.kind === 'heather' && d > 70) continue;
      // far away keep fewer, bigger clumps (the colony still reads as one mass)
      // (thinned gently: a few huge clumps read as topiary pom-poms, many small ones as a thicket)
      const keep = Math.min(1, (380 / Math.max(d, 1)) ** 2);
      if (rng() > Math.max(keep, 0.12)) continue;
      if (opts.exclude && opts.exclude(jx, jz)) continue;
      const grow = Math.min(1 / Math.sqrt(Math.max(keep, 0.12)), 2.0);
      const w = (K.size[0] + (K.size[1] - K.size[0]) * Math.pow(rng(), 1.3)) * (0.75 + 0.45 * fill) * grow;
      const hh = (K.hgt[0] + (K.hgt[1] - K.hgt[0]) * rng()) * (0.7 + 0.5 * fill) * Math.min(grow, 1.2);
      const ny = opts.slope ? opts.slope(jx, jz) : 1;
      if (ny < 0.6) continue;
      const lod = d < 70 ? 0 : d < 400 ? 1 : 2;
      q.setFromAxisAngle(up, (rng() - 0.5) * 0.6);      // keep the wind combing coherent
      m4.compose(p.set(jx, y - 0.08 * hh, jz), q, s.set(w, hh, w * (0.7 + 0.5 * rng())));
      push(K.kind, lod, Math.floor(rng() * 4), m4.clone());
      n++;
    }
    counts[K.kind] = n;
  }
  for (const [key, list] of lists) {
    const [kind, lod, v] = key.split('|');
    const geo = shrubGeos(kind, +lod)[+v];
    const mesh = new THREE.InstancedMesh(geo, foliage(kind), list.length);
    list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    const col = new Float32Array(list.length * 3);
    for (let i = 0; i < list.length; i++) { const t = 0.8 + 0.4 * hash2(i, +v, 3); col[i * 3] = t; col[i * 3 + 1] = t * (0.95 + 0.1 * hash2(i, 2, 5)); col[i * 3 + 2] = t; }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = +lod < 2; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  // thrift cushions along the edge, near the cameras
  if (opts.edge) {
    const T = thriftGeometry(3);
    const cm = [], hm = [];
    for (let z = z0; z < z1; z += 0.6) for (let x = x0; x < x1; x += 0.6) {
      const jx = x + (rng() - 0.5) * 0.6, jz = z + (rng() - 0.5) * 0.6;
      const e = opts.edge(jx, jz);
      if (e < 0 || e > 14) continue;
      const y = H(jx, jz);
      if (y == null || !(y > 4)) continue;
      const d = nearest(jx, y, jz);
      if (d > 140) continue;
      if (rng() > 0.35 * (1 - e / 14)) continue;
      const w = 0.12 + 0.18 * rng();
      q.setFromAxisAngle(up, rng() * 6.28);
      m4.compose(p.set(jx, y - 0.01, jz), q, s.set(w, w, w));
      cm.push(m4.clone());
      if (rng() < 0.75) hm.push(m4.clone());
    }
    if (cm.length) {
      const c = new THREE.InstancedMesh(T.cushion, foliage('thrift'), cm.length); cm.forEach((mm, i) => c.setMatrixAt(i, mm));
      c.receiveShadow = true; c.computeBoundingSphere(); group.add(c);
      const merged = mergeGeos(T.heads);
      const hmat = new THREE.MeshStandardMaterial({ color: 0xd98aa6, roughness: 0.8 });
      const h = new THREE.InstancedMesh(merged, hmat, hm.length); hm.forEach((mm, i) => h.setMatrixAt(i, mm));
      h.receiveShadow = true; h.computeBoundingSphere(); group.add(h);
      counts.thrift = cm.length;
    }
  }
  // geometry grass near the cameras (the set library's tufts: already convincing at ground level)
  if (opts.grass !== false) {
    const G = opts.grass || {};
    const R = G.radius ?? 70, count = G.count ?? 60000;
    const v0 = views[G.view ?? 0];
    const grass = grassField({
      count, seed: 5, height: G.height || [0.08, 0.28],
      place: (rr) => {
        const a = rr() * Math.PI * 2, d = R * Math.sqrt(rr());
        const x = v0.x + Math.cos(a) * d, z = v0.z + Math.sin(a) * d;
        const y = H(x, z);
        if (y == null || !(y > 3)) return null;
        if (opts.slope && opts.slope(x, z) < 0.75) return null;
        const c = cover.sample(x, z);
        if (c[1] > 0.5 || c[3] > 0.5) return null;
        if (opts.edge && opts.edge(x, z) < 0.5) return null;
        return [x, y - 0.02, z];
      },
    });
    group.add(grass);
  }
  console.warn(`[nature] plants: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  return { group, counts };
}

const matCache = new Map();
function foliage(kind) { if (!matCache.has(kind)) matCache.set(kind, foliageMaterial(kind)); return matCache.get(kind); }
function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    const gp = g.attributes.position, gn = g.attributes.normal;
    pos.set(gp.array, ov * 3); if (gn) nrm.set(gn.array, ov * 3);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.getX(i) + ov; oi += g.index.count; }
    else { for (let i = 0; i < gp.count; i++) idx[oi + i] = ov + i; oi += gp.count; }
    ov += gp.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
