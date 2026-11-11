// Terrain meshes (chunked for culling) + horizon ring + procedural shader.
import * as THREE from 'three';
import { WORLD, CITY } from './layout.js';
import { baseHeight } from './heightmap.js';
import { GLSL_NOISE } from '../util.js';

export function makeWorldTextures(hm) {
  const n = hm.n;
  // red: the ground's height; green: the water's surface over it (0 where only the sea could be)
  const half = new Uint16Array(n * n * 2);
  for (let k = 0; k < n * n; k++) { half[k * 2] = THREE.DataUtils.toHalfFloat(hm.h[k]); half[k * 2 + 1] = THREE.DataUtils.toHalfFloat(Math.max(0, hm.wl[k])); }
  const heightTex = new THREE.DataTexture(half, n, n, THREE.RGFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  const splatTex = new THREE.DataTexture(hm.splat, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  splatTex.magFilter = splatTex.minFilter = THREE.LinearFilter;
  splatTex.needsUpdate = true;
  return { heightTex, splatTex };
}

export const worldUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uHeightTex: { value: null },
  uSplatTex: { value: null },
  uWorldHalf: { value: WORLD.half },
  uWet: { value: 0 }, // 0 dry .. 1 soaked (weather)
  uRain: { value: 0 }, // current rain intensity (ripples)
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, // towards the sun (sky.js)
  // where the 3D grass grows (shared with grasscards.js so the ground under it matches)
  uLawn: { value: (() => { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; })() },
  uCityB: { value: new THREE.Vector4(CITY.x0 - 20, CITY.z0 - 20, CITY.x0 + CITY.nx * CITY.pitch + 20, CITY.z0 + CITY.nz * CITY.pitch + 20) },
  uGrassR: { value: 0 },          // radius of the 3D grass round the camera (0 = none)
  uGrassCam: { value: new THREE.Vector3() },
};

// The 3D grass's own mask, used by the grass and by the terrain under it: wild ground only (not
// pavement, sand, forest floor, steep rock, mown lawns or the city), and in fields: big soft
// patches of meadow, and all over the dry plains.
export const GRASS_MASK_GLSL = /* glsl */ `
float gmHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float gmNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(gmHash(i), gmHash(i+vec2(1,0)), u.x), mix(gmHash(i+vec2(0,1)), gmHash(i+vec2(1,1)), u.x), u.y); }
float sbGrassMask(vec2 xz, vec4 sp, float slope) {
  float inCity = step(uCityB.x, xz.x) * step(xz.x, uCityB.z) * step(uCityB.y, xz.y) * step(xz.y, uCityB.w);
  float lawn = max(inCity, smoothstep(0.2, 0.8, texture(uLawn, (xz + uWorldHalf) / (2.0 * uWorldHalf)).r));
  float wild = (1.0 - smoothstep(0.04, 0.3, sp.a)) * (1.0 - smoothstep(0.25, 0.6, sp.r)) * (1.0 - smoothstep(0.3, 0.75, sp.g))
             * (1.0 - smoothstep(0.32, 0.6, slope)) * (1.0 - lawn);
  float field = smoothstep(0.42, 0.58, gmNoise(xz * 0.0042) * 0.72 + gmNoise(xz * 0.019) * 0.28);
  field = max(field, smoothstep(0.35, 0.7, sp.b));
  return wild * field;
}
`;

export function createTerrain(hm, quality, scene, surf) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const chunks = 8;
  // terrain levels of detail: grid steps per level and where they switch (metres to the tile)
  const LOD_STEPS = [1, 2, 4], LOD_NEAR = 260, LOD_MID = 900;
  const segs = Math.max(16, Math.round(quality.terrainSegs / chunks));
  const size = WORLD.size / chunks;
  const mat = makeTerrainMaterial(quality, surf);
  const nrm = new THREE.Vector3();
  const meshes = [];

  for (let cj = 0; cj < chunks; cj++) {
    for (let ci = 0; ci < chunks; ci++) {
      const x0 = -WORLD.half + ci * size, z0 = -WORLD.half + cj * size;
      const vn = segs + 1;
      // vertices + one ring of skirt vertices around the edge
      const pos = [], norm = [], idx = [];
      for (let j = 0; j < vn; j++) for (let i = 0; i < vn; i++) {
        const x = x0 + (i / segs) * size, z = z0 + (j / segs) * size;
        pos.push(x, hm.height(x, z), z);
        hm.normal(x, z, nrm);
        norm.push(nrm.x, nrm.y, nrm.z);
      }
      // Skirts hide cracks between chunks, between levels of detail and against the horizon mesh
      const top = [], bot = [], left = [], right = [];
      for (let i = 0; i < vn; i++) { top.push(i); bot.push(segs * vn + i); left.push(i * vn); right.push(i * vn + segs); }
      const skirtBase = [];
      for (const list of [top, bot, left, right]) {
        skirtBase.push(pos.length / 3);
        for (const v of list) {
          pos.push(pos[v * 3], pos[v * 3 + 1] - 12, pos[v * 3 + 2]);
          norm.push(norm[v * 3], norm[v * 3 + 1], norm[v * 3 + 2]);
        }
      }
      // one index buffer per level of detail over the same vertices: every vertex, every 2nd, every 4th
      const indexFor = (st) => {
        const idx = [];
        for (let j = 0; j < segs; j += st) for (let i = 0; i < segs; i += st) {
          const a = j * vn + i, b = a + st, c = a + st * vn, d = c + st;
          idx.push(a, c, b, b, c, d);
        }
        [top, bot, left, right].forEach((list, e) => {
          const base = skirtBase[e];
          for (let k = 0; k + st < list.length; k += st) {
            const a = list[k], b = list[k + st], c = base + k, d = base + k + st;
            idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
          }
        });
        return idx;
      };
      const posA = new THREE.Float32BufferAttribute(pos, 3), normA = new THREE.Float32BufferAttribute(norm, 3);
      const lods = LOD_STEPS.filter((st) => segs % st === 0).map((st) => {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', posA); lg.setAttribute('normal', normA);
        lg.setIndex(indexFor(st));
        lg.computeBoundingSphere();
        return lg;
      });
      const g = lods[0];
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.userData.center = new THREE.Vector3(x0 + size / 2, 0, z0 + size / 2);
      m.userData.lods = lods; m.userData.x0 = x0; m.userData.z0 = z0;
      group.add(m);
      meshes.push(m);
    }
  }

  // Horizon: the rest of the continent, low-res, sunk where it overlaps the map.
  {
    const S = 16384, seg = 128, step = S / seg;
    const g = new THREE.PlaneGeometry(S, S, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), z = p.getZ(k);
      const inside = Math.abs(x) < WORLD.half - 1 && Math.abs(z) < WORLD.half - 1;
      const onEdge = Math.abs(x) <= WORLD.half + 1 && Math.abs(z) <= WORLD.half + 1;
      let y = onEdge ? hm.height(x, z) : baseHeight(x, z);
      if (inside) y -= 40;
      // Fade far terrain toward a gentle continent-scale shape
      const far = Math.max(Math.abs(x), Math.abs(z));
      if (far > 5000 && z < 0) y += (far - 5000) * 0.06;
      p.setY(k, y);
    }
    void step;
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = false;
    m.name = 'horizon';
    group.add(m);
  }

  scene.add(group);
  return {
    group, meshes, cell: size / segs,
    update(camPos, drawDistance) {
      for (const m of meshes) {
        const u = m.userData, c = u.center;
        m.visible = Math.hypot(c.x - camPos.x, c.z - camPos.z) < drawDistance + 400;
        if (!m.visible) continue;
        // level of detail by the distance to the nearest point of the tile (the one you're on is always full)
        const dx = Math.max(u.x0 - camPos.x, 0, camPos.x - (u.x0 + size)), dz = Math.max(u.z0 - camPos.z, 0, camPos.z - (u.z0 + size));
        const d = Math.hypot(dx, dz, Math.max(0, camPos.y - 400) * 0.5); // flying high counts as further away
        const L = Math.min(u.lods.length - 1, d < LOD_NEAR ? 0 : d < LOD_MID ? 1 : 2);
        if (m.geometry !== u.lods[L]) m.geometry = u.lods[L];
      }
    },
  };
}

function makeTerrainMaterial(quality, surf) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const useN = surf && surf.hasNormals ? 1 : 0;
  const L = ['grass', 'dry', 'forest', 'sand', 'rock'];
  // the second library swaps in better sources where it has them: a photographed
  // cliff face for rock, real leaf litter for the forest floor
  const SRC = { rock: surf && surf.cliff && surf.cliff.real ? 'cliff' : 'rock', forest: surf && surf.leaves && surf.leaves.real ? 'leaves' : 'forest' };
  const src = (k) => SRC[k] || k;
  const size = (k) => (surf ? surf[src(k)].size : 3).toFixed(2);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.fragmentShader = 'uniform float uWet;\n' + shader.fragmentShader;
    for (const k of L) {
      shader.uniforms[`t_${k}C`] = { value: surf ? surf[src(k)].color : null };
      shader.uniforms[`t_${k}N`] = { value: surf ? surf[src(k)].normal : null };
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm;
uniform sampler2D uSplatTex; uniform float uWorldHalf; uniform float uNight; uniform sampler2D uHeightTex; uniform float uTime;
uniform sampler2D uLawn; uniform vec4 uCityB; uniform float uGrassR; uniform vec3 uGrassCam;
${GRASS_MASK_GLSL}
${L.map((k) => `uniform sampler2D t_${k}C; uniform sampler2D t_${k}N;`).join('\n')}
${GLSL_NOISE}
float sbRough; vec3 sbNrm; float sbFar;
// sunlight focused by the waves above: a bright web drifting over the bed
float sbCaustic(vec2 p, float t){
  float a = sbNoise(p * 0.85 + vec2(t * 0.31, t * 0.17));
  float b = sbNoise(p * 1.37 - vec2(t * 0.23, -t * 0.29) + a * 1.4);
  float c = sbNoise(p * 2.1 + vec2(-t * 0.2, t * 0.26) + b * 0.8);
  return pow(1.0 - abs(a - b), 10.0) * 0.7 + pow(1.0 - abs(b - c), 14.0) * 0.5;
}
// Faithful sample at true scale. Far away, blend in a rotated 4x-larger
// sample to hide repetition (never near the camera, where it would blur).
// Two equally sharp samples (one rotated + offset) mixed by a soft noise mask:
// breaks the tiling grid without blurring near the camera.
float sbBomb(vec2 p){ return smoothstep(0.3, 0.7, sbNoise(p * 0.05) * 0.7 + sbNoise(p * 0.13) * 0.3); }
vec2 sbRot(vec2 uv){ return mat2(0.62, -0.78, 0.78, 0.62) * uv + vec2(0.37, 0.71); }
vec3 layerC(sampler2D t, vec2 p, float scale){
  vec2 uv = p / scale;
  vec3 a = mix(texture2D(t, uv).rgb, texture2D(t, sbRot(uv)).rgb, sbBomb(p));
  if (sbFar > 0.001) {
    vec3 b = texture2D(t, mat2(0.8, -0.6, 0.6, 0.8) * p / (scale * 4.3)).rgb;
    a = mix(a, b, sbFar * 0.5);
  }
  return a;
}
vec3 layerN(sampler2D t, vec2 p, float scale){
  vec2 uv = p / scale;
  vec3 a = texture2D(t, uv).xyz * 2.0 - 1.0;
  vec3 b = texture2D(t, sbRot(uv)).xyz * 2.0 - 1.0;
  b.xy = mat2(0.62, 0.78, -0.78, 0.62) * b.xy; // undo the sample rotation
  return mix(a, b, sbBomb(p));
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 wuv = (vWPos.xz + uWorldHalf) / (2.0*uWorldHalf);
  vec4 sp = texture2D(uSplatTex, clamp(wuv, 0.0, 1.0));
  if (abs(vWPos.x) > uWorldHalf || abs(vWPos.z) > uWorldHalf) sp = vec4(vWPos.y < 2.0 ? 1.0 : 0.0, 0.35, 0.3, 0.0);
  float dist = length(vWPos - cameraPosition);
  sbFar = smoothstep(30.0, 160.0, dist);
  vec3 n = normalize(vWNrm);
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  vec2 p = vWPos.xz;

  vec3 cG = layerC(t_grassC, p, ${size('grass')}) * vec3(0.9, 1.0, 1.03); // less yellow
  vec3 cD = layerC(t_dryC, p, ${size('dry')});
  vec3 cF = layerC(t_forestC, p, ${size('forest')});
  vec3 cS = layerC(t_sandC, p, ${size('sand')});
  // rock: triplanar so cliffs don't stretch
  vec3 tw = pow(abs(n), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
  float rs = ${size('rock')};
  vec3 cR = texture2D(t_rockC, vWPos.zy / rs).rgb * tw.x + texture2D(t_rockC, vWPos.xz / rs).rgb * tw.y + texture2D(t_rockC, vWPos.xy / rs).rgb * tw.z;

  // splat weights, sharpened by each texture's own brightness (height blend)
  float wR = smoothstep(0.30, 0.52, slope);
  float wS = sp.r, wF = sp.g, wD = sp.b;
  float wG = max(0.0, 1.0 - wS - wF - wD);
  vec4 h = vec4(dot(cG, vec3(0.333)), dot(cD, vec3(0.333)), dot(cF, vec3(0.333)), dot(cS, vec3(0.333)));
  vec4 w = vec4(wG, wD, wF, wS) * pow(h + 0.25, vec4(4.0)) + 1e-5;
  w /= (w.x + w.y + w.z + w.w);
  vec3 c = cG * w.x + cD * w.y + cF * w.z + cS * w.w;
  c = mix(c, cR, wR);
  // under the 3D grass the ground is the grass's own shaded depths: a gap between blades reads
  // as more grass in shadow, never as the bare photo of the ground
  if (uGrassR > 0.0) {
    float gk = sbGrassMask(vWPos.xz, sp, slope) * (1.0 - smoothstep(uGrassR * 0.72, uGrassR * 0.98, length(vWPos.xz - uGrassCam.xz)));
    float lum = dot(c, vec3(0.333));
    c = mix(c, mix(vec3(0.05, 0.075, 0.03), vec3(0.19, 0.16, 0.085), sp.b) * (0.75 + lum * 0.9), gk * 0.85);
  }
  // near and mid distance (G14): a lawn or a field is never one even green. Patches a few metres
  // across, lusher or drier, with darker clover/weed clumps; slow drifts over tens of metres
  {
    float pn = sbNoise(p * 0.11) * 0.6 + sbNoise(p * 0.37 + 17.0) * 0.4;
    float pm = sbNoise(p * 0.023 + 5.0);
    float grassy = (w.x + w.z * 0.6 + w.y * 0.4) * (1.0 - wR) * (1.0 - sp.a);
    vec3 tint = mix(vec3(0.80, 1.04, 0.78), vec3(1.2, 1.06, 0.7), smoothstep(0.3, 0.8, pm * 0.65 + pn * 0.35));
    tint *= 0.78 + 0.42 * pn;
    tint *= 1.0 - 0.22 * smoothstep(0.62, 0.8, sbNoise(p * 0.9 + 3.0)); // dark clover and weed clumps
    c *= mix(vec3(1.0), tint, grassy * (1.0 - sbFar * 0.6));
  }
  // only far away: gentle large-scale variation so hills don't look uniform
  c *= mix(1.0, 0.9 + 0.2 * sbFbm(vWPos.xz * 0.008), sbFar);
  float snow = smoothstep(190.0, 230.0, vWPos.y) * (1.0 - smoothstep(0.35, 0.6, slope));
  c = mix(c, vec3(0.9, 0.92, 0.95), snow);
  c = mix(c, vec3(0.09, 0.09, 0.095), sp.a);
  // under the water: caustics on the shallow bed; just above it: the dark, shiny wet line
  // (on the sea it creeps up and back with the swash)
  float wlv = texture2D(uHeightTex, clamp(wuv, 0.0, 1.0)).g, under = wlv - vWPos.y;
  // Gulf beaches are pale quartz sand, not the brown of a riverbank (G11): low sand by the sea
  {
    float sbBeach = w.w * (1.0 - step(0.01, wlv)) * (1.0 - smoothstep(2.5, 6.0, vWPos.y)) * (1.0 - wR);
    float sl = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(sl) * vec3(1.12, 1.05, 0.9) * 1.55, sbBeach * 0.75);
  }
  float shoreWet = 0.0;
  if (under > 0.0) {
    float k = smoothstep(0.0, 0.25, under) * (1.0 - smoothstep(0.8, 3.5, under)) * (1.0 - uNight) * (1.0 - uWet * 0.6) * (1.0 - sbFar);
    // the sea is clearer than the lake, the rivers and the bayou
    c *= 1.0 + sbCaustic(vWPos.xz, uTime) * k * (wlv < 0.01 ? 1.3 : 0.85);
    shoreWet = 1.0 - smoothstep(0.0, 0.2, under);
  } else if (under > -1.5) {
    float swash = wlv < 0.01 ? 0.25 + 0.2 * sin(uTime * 0.45 + sbNoise(vWPos.xz * 0.05) * 6.0) : 0.12;
    shoreWet = 1.0 - smoothstep(swash * 0.5, swash + 0.25, -under);
  }
  c *= 1.0 - shoreWet * 0.32;
  diffuseColor.rgb = c;
  sbRough = mix(0.97, 0.85, sp.a) - snow * 0.4 - wR * 0.12;
  sbRough = mix(sbRough, 0.22, shoreWet * (1.0 - wR));

  vec3 nt = vec3(0.0, 0.0, 1.0);
  if (${useN}.0 > 0.5) {
    nt = layerN(t_grassN, p, ${size('grass')}) * w.x + layerN(t_dryN, p, ${size('dry')}) * w.y
       + layerN(t_forestN, p, ${size('forest')}) * w.z + layerN(t_sandN, p, ${size('sand')}) * w.w;
    vec3 nr = texture2D(t_rockN, (abs(n.x) > abs(n.z) ? vWPos.zy : vWPos.xy) / rs).xyz * 2.0 - 1.0;
    nt = mix(nt, nr, wR);
    nt.xy *= (1.0 - sbFar * 0.7) * (1.0 - sp.a);
  }
  sbNrm = nt;
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(sbRough, sbRough * 0.55, uWet); diffuseColor.rgb *= 1.0 - uWet * 0.3;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 N = normalize(vWNrm);
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
  vec3 B = normalize(cross(N, T));
  vec3 nw = normalize(T * sbNrm.x - B * sbNrm.y + N * max(sbNrm.z, 0.15));
  normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
}`);
  };
  return mat;
}
