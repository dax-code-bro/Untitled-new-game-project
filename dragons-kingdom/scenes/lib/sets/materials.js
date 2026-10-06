// World-space PBR materials for sets (style frames and episode sets).
//
// Photo-scanned CC0 texture sets (assets-lib, loaded through ../assets.js) are
// projected in WORLD space instead of through mesh UVs, so procedural set
// geometry (walls, terrain, steps, beams) needs no UV work and textures keep
// their real-world size on every object:
//
//   const stone = await worldMaterial(ctx, 'pbr/ph_white_sandstone_bricks_03', { mode: 'box', tint: [0.9, 0.9, 0.86] });
//   const land  = await terrainMaterial(ctx, [{ id: 'pbr/acg_rock26' }, { id: 'pbr/acg_ground037' }]);   // weights: geometry attribute aSplat
//
// mode 'box': the dominant axis of the surface normal picks one projection
//   (one texture tap per map - the same as box UV mapping, the cheapest);
// mode 'tri': triplanar (3 taps, for organic shapes such as rocks);
// mode 'top': XZ projection only (ground).
// Extras that make a tiled photo texture read as a real surface:
//   antiTile    second albedo tap, rotated and rescaled, blended by noise
//   macro       low-frequency brightness/colour variation (stains, sun bleaching)
//   grime       darker, damper band toward the ground and vertical rain streaks (walls)
//   moss        dark green growth on up-facing parts
// Lighting is plain three.js MeshStandardMaterial (sun shadows, IBL, and the
// cinematic stack's AO / contact shadows / cascades still apply).
import * as THREE from 'three';
import { loadPBR, assetInfo } from '../assets.js';

export const GLSL_NOISE = /* glsl */ `
float dkH31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float dkH21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float dkVN2(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dkH21(i), dkH21(i + vec2(1, 0)), f.x), mix(dkH21(i + vec2(0, 1)), dkH21(i + vec2(1, 1)), f.x), f.y); }
float dkVN3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dkH31(i), dkH31(i + vec3(1,0,0)), f.x), mix(dkH31(i + vec3(0,1,0)), dkH31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dkH31(i + vec3(0,0,1)), dkH31(i + vec3(1,0,1)), f.x), mix(dkH31(i + vec3(0,1,1)), dkH31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float dkFbm3(vec3 p) { return dkVN3(p) * 0.5 + dkVN3(p * 2.03 + 7.1) * 0.3 + dkVN3(p * 4.11 + 3.3) * 0.2; }
`;

// projection 'ax' (0: x-facing, 1: y-facing, 2: z-facing) of the scaled world point p for surface
// normal n: texture uv + a right-handed tangent frame (T along +u, B along +v, T x B = n)
export const GLSL_PROJ = /* glsl */ `
void dkProj(int ax, vec3 p, vec3 n, out vec2 uv, out vec3 T, out vec3 B) {
  if (ax == 0) { float s = n.x >= 0.0 ? 1.0 : -1.0; uv = vec2(-s * p.z, p.y); T = vec3(0.0, 0.0, -s); }
  else if (ax == 1) { float s = n.y >= 0.0 ? 1.0 : -1.0; uv = vec2(p.x, -s * p.z); T = vec3(1.0, 0.0, 0.0); }
  else { float s = n.z >= 0.0 ? 1.0 : -1.0; uv = vec2(s * p.x, p.y); T = vec3(s, 0.0, 0.0); }
  T = normalize(T - n * dot(n, T)); B = cross(n, T);
}
`;

const chanExpr = (t, c) => (c === '1-A' ? `(1.0 - ${t}.a)` : c === 'A' ? `${t}.a` : c === 'G' ? `${t}.g` : c === 'B' ? `${t}.b` : `${t}.r`);

const mapCache = new Map();
/** The textures of a PBR set + how to read them (shared, decoded once). */
export function pbrMaps(ctx, id) {
  if (!mapCache.has(id)) mapCache.set(id, (async () => {
    const info = await assetInfo(id);
    const base = await loadPBR(id, ctx, { repeat: 1, anisotropy: 16 });
    const P = info.params;
    const pc = P.packed_channels || {};
    const packed = P.maps.packed ? (base.roughnessMap || base.aoMap || base.metalnessMap) : null;
    return {
      id, tile: P.tile_m || 1,
      alb: base.map || null,
      nrm: base.normalMap || null,
      nrmY: P.normal_convention === 'dx' ? -1 : 1,
      rgh: P.maps.roughness ? base.roughnessMap : packed && pc.roughness ? packed : null,
      rghExpr: P.maps.roughness ? 'G' : packed && pc.roughness ? pc.roughness : null,
      ao: P.maps.ao ? base.aoMap : packed && pc.ao ? packed : null,
      aoExpr: P.maps.ao ? 'R' : packed && pc.ao ? pc.ao : null,
    };
  })());
  return mapCache.get(id);
}

export function worldVaryings(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDkW;\nvarying vec3 vDkN;')
    .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
{
  mat3 dkNM = mat3(modelMatrix);
#ifdef USE_INSTANCING
  dkNM = dkNM * mat3(instanceMatrix);
#endif
  vDkN = normalize(dkNM * objectNormal);
}`)
    .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 dkWp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  dkWp = instanceMatrix * dkWp;
#endif
  vDkW = (modelMatrix * dkWp).xyz;
}`);
}

/**
 * A MeshStandardMaterial with a PBR set projected in world space.
 * opts: mode 'box'|'tri'|'top' (default 'box'), scale (texture size multiplier, 1 = the set's
 * real tile size), tint [r,g,b] (multiplies albedo), saturation, roughness (multiplier),
 * normalScale, antiTile (0..1), macro (0..1), grime { height, strength, streaks, base },
 * moss (0..1), offset [x,y,z] (shifts the projection), aoStrength (0..1), seed, side.
 */
export async function worldMaterial(ctx, id, opts = {}) {
  const M = await pbrMaps(ctx, id);
  const mode = opts.mode || 'box';
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: opts.side ?? THREE.FrontSide });
  mat.name = `world:${id}`;
  const U = {
    dkAlb: { value: M.alb }, dkNrm: { value: M.nrm }, dkRgh: { value: M.rgh }, dkAOm: { value: M.ao },
    dkTile: { value: 1 / (M.tile * (opts.scale ?? 1)) },
    dkTint: { value: new THREE.Vector3(...(opts.tint || [1, 1, 1])) },
    dkSat: { value: opts.saturation ?? 1 },
    dkRghMul: { value: opts.roughness ?? 1 },
    dkNrmScale: { value: new THREE.Vector2(opts.normalScale ?? 1, (opts.normalScale ?? 1) * M.nrmY) },
    dkAnti: { value: opts.antiTile ?? 0.0 },
    dkMacro: { value: opts.macro ?? 0.35 },
    dkGrime: { value: new THREE.Vector4(opts.grime?.height ?? 0, opts.grime?.strength ?? 0, opts.grime?.streaks ?? 0, opts.grime?.base ?? 0) },
    dkMoss: { value: opts.moss ?? 0 },
    dkOff: { value: new THREE.Vector3(...(opts.offset || [0, 0, 0])) },
    dkAOStr: { value: opts.aoStrength ?? 1 },
    dkSeed: { value: opts.seed ?? 0 },
  };
  mat.userData.dkUniforms = U;
  const hasN = !!M.nrm, hasR = !!M.rgh, hasAO = !!M.ao;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    worldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
#define DK_${mode.toUpperCase()}
varying vec3 vDkW; varying vec3 vDkN;
uniform sampler2D dkAlb; uniform sampler2D dkNrm; uniform sampler2D dkRgh; uniform sampler2D dkAOm;
uniform float dkTile; uniform vec3 dkTint; uniform float dkSat; uniform float dkRghMul; uniform vec2 dkNrmScale; uniform float dkAnti; uniform float dkMacro;
uniform vec4 dkGrime; uniform float dkMoss; uniform vec3 dkOff; uniform float dkAOStr; uniform float dkSeed;
${GLSL_NOISE}
${GLSL_PROJ}
vec3 dkWNrm; float dkTexAO = 1.0;
vec3 dkWeights(vec3 n) {
#if defined(DK_TRI)
  vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z);
#elif defined(DK_TOP)
  return vec3(0.0, 1.0, 0.0);
#else
  vec3 a = abs(n);
  return a.x > a.y && a.x > a.z ? vec3(1, 0, 0) : a.y > a.z ? vec3(0, 1, 0) : vec3(0, 0, 1);
#endif
}
`)
      .replace('#include <map_fragment>', `
vec3 dkP = (vDkW + dkOff) * dkTile;
vec3 dkN0 = normalize(vDkN) * (gl_FrontFacing ? 1.0 : -1.0);
vec3 dkWt = dkWeights(dkN0);
vec3 dkAlbC = vec3(0.0); float dkR = 0.0; vec3 dkNsum = vec3(0.0); float dkAOv = 0.0;
for (int ax = 0; ax < 3; ax++) {
  float w = ax == 0 ? dkWt.x : ax == 1 ? dkWt.y : dkWt.z;
  if (w < 0.001) continue;
  vec2 uv; vec3 T, B;
  dkProj(ax, dkP, dkN0, uv, T, B);
  vec3 a = texture2D(dkAlb, uv).rgb;
  if (dkAnti > 0.0) {
    vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.61 + vec2(0.31, 0.67);
    float b = smoothstep(0.3, 0.7, dkVN2(uv * 0.27 + dkSeed));
    a = mix(a, texture2D(dkAlb, uv2).rgb, b * dkAnti);
  }
  dkAlbC += a * w;
${hasR ? `  { vec4 rt = texture2D(dkRgh, uv); dkR += ${chanExpr('rt', M.rghExpr)} * w; }` : '  dkR += 0.8 * w;'}
${hasAO ? `  { vec4 at = texture2D(dkAOm, uv); dkAOv += ${chanExpr('at', M.aoExpr)} * w; }` : '  dkAOv += w;'}
${hasN ? `  { vec3 tn = texture2D(dkNrm, uv).xyz * 2.0 - 1.0; tn.xy *= dkNrmScale; dkNsum += normalize(T * tn.x + B * tn.y + dkN0 * max(tn.z, 0.1)) * w; }` : '  dkNsum += dkN0 * w;'}
}
dkWNrm = normalize(dkNsum);
float dkM = dkFbm3(vDkW * 0.11 + dkSeed) * 2.0 - 1.0;
float dkM2 = dkFbm3(vDkW * 0.6 + 3.0 + dkSeed) * 2.0 - 1.0;
vec3 dkCol = dkAlbC * dkTint * (1.0 + dkMacro * (0.28 * dkM + 0.12 * dkM2));
dkCol *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), dkMacro * max(dkM, 0.0));
dkCol = mix(vec3(dot(dkCol, vec3(0.2126, 0.7152, 0.0722))), dkCol, dkSat);
if (dkGrime.y > 0.0) {
  float hb = clamp((vDkW.y - dkGrime.w) / max(dkGrime.x, 0.01), 0.0, 1.0);
  float base = (1.0 - smoothstep(0.0, 1.0, hb)) * (0.6 + 0.4 * dkVN2(vDkW.xz * 3.0 + vDkW.y));
  float streak = dkGrime.z * smoothstep(0.55, 0.9, dkVN2(vec2((vDkW.x + vDkW.z) * 2.3, vDkW.y * 0.15))) * (1.0 - abs(dkN0.y));
  dkCol *= 1.0 - dkGrime.y * clamp(base * 0.7 + streak * 0.5, 0.0, 1.0);
  dkR = mix(dkR, dkR * 0.75, base * dkGrime.y);
}
if (dkMoss > 0.0) {
  float up = smoothstep(0.35, 0.9, dkN0.y);
  float mn = smoothstep(0.45, 0.75, dkFbm3(vDkW * 1.7 + 11.0));
  float mk = clamp(dkMoss * mn * (up + 0.35), 0.0, 1.0);
  dkCol = mix(dkCol, vec3(0.05, 0.07, 0.02) * (0.7 + 0.6 * dkVN2(vDkW.xz * 9.0)), mk);
}
diffuseColor.rgb *= dkCol;
dkTexAO = mix(1.0, dkAOv, dkAOStr);
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(roughness * dkR * dkRghMul, 0.03, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(dkWNrm, 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= dkTexAO; reflectedLight.indirectSpecular *= dkTexAO;`);
  };
  mat.customProgramCacheKey = () => `dk-world:${mode}:${hasN}:${hasR}:${hasAO}:${M.rghExpr}:${M.aoExpr}`;
  return mat;
}

/**
 * Terrain splat material: up to 4 PBR layers, weights per vertex in the
 * geometry attribute `aSplat` (vec4). Every layer is projected top-down,
 * blended into a side projection where the ground is steep (cliffs).
 * layers: [{ id, scale?, tint?, roughness? }]; opts.macro, opts.detailNear/Far (m).
 */
export async function terrainMaterial(ctx, layers, opts = {}) {
  const Ms = await Promise.all(layers.map((l) => pbrMaps(ctx, l.id)));
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: !!opts.vertexColors });
  mat.name = 'terrain';
  const U = {
    dkMacro: { value: opts.macro ?? 0.4 },
    dkDetailFade: { value: new THREE.Vector2(opts.detailNear ?? 80, opts.detailFar ?? 1200) },
    dkMacroScale: { value: opts.macroScale ?? 0.02 },
    dkRoughRange: { value: new THREE.Vector2(opts.minRoughness ?? 0.05, opts.roughnessScale ?? 1.0) },
    // cliff weathering on layer 0 where steep: bedding strata, rain/seep streaks, wet dark base
    dkCliff: { value: new THREE.Vector4(opts.cliff?.strata ?? 0, opts.cliff?.streaks ?? 0, opts.cliff?.wet ?? 0, opts.cliff?.ochre ?? 0) },
  };
  Ms.forEach((M, i) => {
    U[`dkLA${i}`] = { value: M.alb }; U[`dkLN${i}`] = { value: M.nrm }; U[`dkLR${i}`] = { value: M.rgh };
    U[`dkT${i}`] = { value: 1 / (M.tile * (layers[i].scale ?? 1)) };
    U[`dkC${i}`] = { value: new THREE.Vector3(...(layers[i].tint || [1, 1, 1])) };
    U[`dkY${i}`] = { value: M.nrmY * (layers[i].normalScale ?? 1) };
    U[`dkX${i}`] = { value: layers[i].normalScale ?? 1 };
    U[`dkRm${i}`] = { value: layers[i].roughness ?? 1 };
  });
  const n = Ms.length;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    worldVaryings(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat;');
    let decl = '';
    for (let i = 0; i < n; i++) decl += `uniform sampler2D dkLA${i}; uniform sampler2D dkLN${i}; uniform sampler2D dkLR${i}; uniform float dkT${i}; uniform vec3 dkC${i}; uniform float dkY${i}; uniform float dkX${i}; uniform float dkRm${i};\n`;
    let body = '';
    for (let i = 0; i < n; i++) {
      const w = ['x', 'y', 'z', 'w'][i];
      const M = Ms[i];
      const tap = (uvv) => ({
        a: `texture2D(dkLA${i}, ${uvv}).rgb`,
        n: M.nrm ? `(texture2D(dkLN${i}, ${uvv}).xyz * 2.0 - 1.0)` : 'vec3(0.0, 0.0, 1.0)',
        r: M.rgh ? `${chanExpr(`texture2D(dkLR${i}, ${uvv})`, M.rghExpr)}` : '0.85',
      });
      const t1 = tap('uvT'), t2 = tap('uvS');
      body += `
if (vSplat.${w} > 0.003) {
  float w = vSplat.${w};
  vec3 p = vDkW * dkT${i};
  vec2 uvT; vec3 Tt, Bt; dkProj(1, p, dkN0, uvT, Tt, Bt);
  vec3 a = ${t1.a}; vec3 tn = ${t1.n}; float r = ${t1.r};
  tn.x *= dkX${i}; tn.y *= dkY${i};
  vec3 nw = normalize(Tt * tn.x + Bt * tn.y + dkN0 * max(tn.z, 0.1));
  if (dkSide > 0.0) {
    vec2 uvS; vec3 Ts, Bs; dkProj(dkSideAx, p, dkN0, uvS, Ts, Bs);
    vec3 tn2 = ${t2.n}; tn2.x *= dkX${i}; tn2.y *= dkY${i};
    a = mix(a, ${t2.a}, dkSide);
    nw = normalize(mix(nw, normalize(Ts * tn2.x + Bs * tn2.y + dkN0 * max(tn2.z, 0.1)), dkSide));
    r = mix(r, ${t2.r}, dkSide);
  }
  dkAlbC += a * dkC${i} * w; dkR += r * dkRm${i} * w; dkNs += nw * w; dkWs += w;
}`;
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vDkW; varying vec3 vDkN; varying vec4 vSplat;
uniform float dkMacro; uniform vec2 dkDetailFade; uniform float dkMacroScale; uniform vec4 dkCliff; uniform vec2 dkRoughRange;
${decl}
${GLSL_NOISE}
${GLSL_PROJ}
vec3 dkWNrm;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 dkN0 = normalize(vDkN);
float dkSide = smoothstep(0.5, 0.75, 1.0 - abs(dkN0.y));
int dkSideAx = abs(dkN0.x) > abs(dkN0.z) ? 0 : 2;
vec3 dkAlbC = vec3(0.0); float dkR = 0.0; vec3 dkNs = vec3(0.0); float dkWs = 0.0;
${body}
dkAlbC /= max(dkWs, 1e-4); dkR /= max(dkWs, 1e-4);
if (dkCliff.x + dkCliff.y + dkCliff.z + dkCliff.w > 0.0) {
  float cl = vSplat.x * smoothstep(0.35, 0.7, 1.0 - abs(dkN0.y));
  float wob = dkFbm3(vDkW * 0.05) * 6.0;
  float strata = sin(vDkW.y * 1.7 + wob) * 0.5 + 0.5;
  strata = strata * 0.6 + 0.4 * (sin(vDkW.y * 5.3 + wob * 1.7) * 0.5 + 0.5);
  float hor = (vDkW.x * 0.7 + vDkW.z * 0.7);
  float streak = smoothstep(0.5, 0.85, dkVN2(vec2(hor * 0.35, vDkW.y * 0.02))) * smoothstep(0.4, 0.9, dkVN2(vec2(hor * 1.3, vDkW.y * 0.05 + 3.0)));
  float ochre = smoothstep(0.55, 0.8, dkFbm3(vDkW * vec3(0.04, 0.012, 0.04) + 2.0));
  vec3 c = dkAlbC;
  c *= 1.0 + dkCliff.x * (strata - 0.5) * 0.5;
  c *= 1.0 - dkCliff.y * streak * 0.55;
  c = mix(c, c * vec3(1.15, 0.92, 0.7), dkCliff.w * ochre);
  c *= 1.0 - dkCliff.z * (1.0 - smoothstep(0.5, 4.0, vDkW.y)) * 0.6;
  dkAlbC = mix(dkAlbC, c, cl);
}
float dkDist = length(vDkW - cameraPosition);
float dkFade = smoothstep(dkDetailFade.x, dkDetailFade.y, dkDist);
dkWNrm = normalize(mix(normalize(dkNs + 1e-5), dkN0, 0.6 * dkFade));
float dkM = dkFbm3(vDkW * dkMacroScale) * 2.0 - 1.0, dkM2 = dkFbm3(vDkW * dkMacroScale * 6.5 + 5.0) * 2.0 - 1.0;
diffuseColor.rgb *= dkAlbC * (1.0 + dkMacro * (0.3 * dkM + 0.15 * dkM2));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(dkR * dkRoughRange.y, dkRoughRange.x, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(dkWNrm, 0.0)).xyz);`);
  };
  mat.customProgramCacheKey = () => `dk-terrain:${n}:${Ms.map((m) => m.id).join(',')}`;
  return mat;
}
