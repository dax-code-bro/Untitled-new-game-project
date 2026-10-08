// Architecture kit - materials. Procedural surfaces driven by the kit's vertex data (core.js:
// aInfo = piece seed / baked occlusion / arris / height above the footing, aAxis = grain), with
// CC0 photo scans (assets-lib) for micro detail where a scan helps:
//
//   stone     individually coloured stones (per-stone hue, bedding, iron stains, tooling,
//             worn arrises), crustose lichen, moss in sheltered joints, splash dirt / damp /
//             green algae at the footing, rain streaks
//   mortar    lime mortar: sandy, pale, darker deep in the joints
//   oak       weathered hewn oak: grain along the beam, checks (shrinkage splits), silvering on
//             the weather side, darker underneath, end grain
//   plaster   lime-washed render: washes, older coats, repairs, hairline cracks, flaking to the
//             daub, stains below timbers, damp at the foot, soot
//   tile      clay plain tiles / stone slates: per-tile colour, lichen rosettes, moss cushions
//   iron      forged iron with rust
//   glass     leaded casements (diamond / square quarries, uneven crown glass) with a dim room
//             behind (interior mapping: no modelled room, true parallax)
//   portal    an open doorway / shop opening: the same interior mapping without glass
//
//   const M = await archMaterials(ctx);          // { stone, stoneGrey, mortar, oak, plaster, ... }
//   kit.build(M)                                  // core.js Kit -> Group (one mesh per material)
import * as THREE from 'three';
import { pbrMaps } from '../sets/materials.js';

// ------------------------------------------------------------------ GLSL --
export const ARCH_GLSL = /* glsl */ `
float akH1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float akH2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float akH3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float akN2(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(akH2(i), akH2(i + vec2(1, 0)), f.x), mix(akH2(i + vec2(0, 1)), akH2(i + vec2(1, 1)), f.x), f.y); }
float akN3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(akH3(i), akH3(i + vec3(1,0,0)), f.x), mix(akH3(i + vec3(0,1,0)), akH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(akH3(i + vec3(0,0,1)), akH3(i + vec3(1,0,1)), f.x), mix(akH3(i + vec3(0,1,1)), akH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float akF3(vec3 p) { return akN3(p) * 0.5 + akN3(p * 2.03 + 7.1) * 0.3 + akN3(p * 4.11 + 3.3) * 0.2; }
// value noise is lattice-aligned: a rotated domain hides the axes at high frequency
const mat3 akRM = mat3(0.788, -0.494, 0.367, 0.535, 0.845, 0.0, -0.31, 0.194, 0.931);
float akR3(vec3 p) { return akN3(akRM * p); }
float akF2(vec2 p) { return akN2(p) * 0.5 + akN2(p * 2.03 + 7.1) * 0.3 + akN2(p * 4.11 + 3.3) * 0.2; }
// cellular: x = distance to the nearest feature, y = to the second, z = cell id
vec3 akCell2(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 o = vec2(akH2(i + g), akH2(i + g + 17.3));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = akH2(i + g + 3.1); } else if (d < d2) d2 = d;
  }
  return vec3(d1, d2, id);
}
// height -> perturbed normal (view space), Mikkelsen's derivative bump
vec3 akBump(vec3 pos, vec3 n, float h) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
// 2-axis planar coordinates on a surface with world normal n: u horizontal-ish, v vertical-ish
vec2 akPlanar(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.y > 0.7) return p.xz;
  vec3 t = normalize(vec3(-n.z, 0.0, n.x) + 1e-5);
  return vec2(dot(p, t), p.y);
}
float akLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const VERT_DECL = /* glsl */ `
attribute vec4 aInfo; attribute vec3 aAxis;
varying vec4 vInfo; varying vec3 vAxisW; varying vec3 vAxisL; varying vec3 vWPos; varying vec3 vWNrm; varying vec2 vMUv;`;
const VERT_BODY = /* glsl */ `
vInfo = aInfo; vMUv = uv; vAxisL = aAxis;
vAxisW = mat3(modelMatrix) * aAxis;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * objectNormal);`;
const FRAG_DECL = /* glsl */ `
varying vec4 vInfo; varying vec3 vAxisW; varying vec3 vAxisL; varying vec3 vWPos; varying vec3 vWNrm; varying vec2 vMUv;
${ARCH_GLSL}
vec3 akAlb; float akRgh; float akHt; float akAO; vec3 akNW; float akMet;`;

/**
 * Wrap a MeshStandard/Physical material with a kit surface. `body` is GLSL that runs where the
 * map would be read and must set akAlb (linear albedo), akRgh, akHt (bump height, m), akAO,
 * akNW (world-space normal before the bump; starts as the geometric normal), akMet.
 * uniforms: extra uniforms; decl: extra GLSL declarations.
 */
function kitMaterial(name, { uniforms = {}, decl = '', body, physical = false, params = {}, key = '' }) {
  const M = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new M({ color: 0xffffff, roughness: 1, metalness: 0, ...params });
  mat.name = `arch:${name}`;
  mat.userData.dkUniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}\n${decl}`)
      .replace('#include <map_fragment>', `
{
  vec3 akN0 = normalize(vWNrm) * (gl_FrontFacing ? 1.0 : -1.0);
  akNW = akN0; akAlb = vec3(0.5); akRgh = 0.9; akHt = 0.0; akAO = 1.0; akMet = 0.0;
  ${body}
  diffuseColor.rgb *= akAlb;
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(akRgh, 0.03, 1.0);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = akMet;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 nv = normalize((viewMatrix * vec4(akNW, 0.0)).xyz);
  normal = akBump(-vViewPosition, nv, akHt);
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= akAO; reflectedLight.indirectSpecular *= mix(1.0, akAO, 0.8);`);
  };
  mat.customProgramCacheKey = () => `arch-${name}-${key}`;
  return mat;
}

// a texture tap in planar coordinates (scan micro detail): albedo luminance + tangent normal -> world
const SCAN_DECL = /* glsl */ `
uniform sampler2D akScanA; uniform sampler2D akScanN; uniform vec3 akScan; // x: 1/tile m, y: normal y sign, z: mean luminance
vec3 akScanTap(vec3 p, vec3 n, float seed, float scale, out vec3 nw) {
  vec3 a = abs(n);
  vec2 uv; vec3 T, B;
  if (a.y > 0.7) { uv = p.xz; T = vec3(1, 0, 0); B = vec3(0, 0, sign(n.y) * -1.0); }
  else if (a.x > a.z) { uv = vec2(-sign(n.x) * p.z, p.y); T = vec3(0, 0, -sign(n.x)); B = vec3(0, 1, 0); }
  else { uv = vec2(sign(n.z) * p.x, p.y); T = vec3(sign(n.z), 0, 0); B = vec3(0, 1, 0); }
  uv = uv * akScan.x * scale + vec2(akH1(seed * 13.1), akH1(seed * 7.7));
  vec3 c = texture2D(akScanA, uv, 0.5).rgb;
  // (the scans' normal maps carry a fine woven pattern from their generator: read them blurred)
  vec3 tn = texture2D(akScanN, uv, 1.8).xyz * 2.0 - 1.0; tn.y *= akScan.y;
  T = normalize(T - n * dot(n, T)); B = normalize(cross(n, T)) * (dot(cross(n, T), B) < 0.0 ? -1.0 : 1.0);
  nw = normalize(T * tn.x + B * tn.y + n * max(tn.z, 0.2));
  return c / akScan.z;
}`;

async function scan(ctx, id) {
  const M = await pbrMaps(ctx, id);
  // mean luminance of the albedo (computed once on a small canvas copy)
  let mean = 0.45;
  try {
    const img = M.alb.image;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) { const lin = (v) => Math.pow(v / 255, 2.2); s += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); }
    mean = s / (d.length / 4);
  } catch (e) { /* keep the default */ }
  for (const t of [M.alb, M.nrm]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
  return { M, uniforms: { akScanA: { value: M.alb }, akScanN: { value: M.nrm }, akScan: { value: new THREE.Vector3(1 / M.tile, M.nrmY, mean) } } };
}

// ---------------------------------------------------------- stone --
/**
 * Stone (each stone a piece: its seed picks the colour). palette: 3 linear colours;
 * opts: lichen, moss, algae, tooled (0 rubble .. 1 dressed ashlar), texture (scan id), scale.
 */
export async function stoneMaterial(ctx, opts = {}) {
  const S = await scan(ctx, opts.texture || 'pbr/acg_rock26');
  const pal = opts.palette || [[0.42, 0.40, 0.35], [0.36, 0.34, 0.30], [0.47, 0.44, 0.38]];
  const U = {
    ...S.uniforms,
    akC0: { value: new THREE.Color(...pal[0]) }, akC1: { value: new THREE.Color(...pal[1]) }, akC2: { value: new THREE.Color(...pal[2]) },
    akVar: { value: opts.variation ?? 0.18 },
    akW: { value: new THREE.Vector4(opts.lichen ?? 0.5, opts.moss ?? 0.4, opts.algae ?? 0.4, opts.tooled ?? 0.5) },
    akDirt: { value: new THREE.Vector4(opts.splash ?? 0.6, opts.streaks ?? 0.5, opts.soot ?? 0.0, opts.stain ?? 0.4) },
    akScale: { value: opts.scale ?? 0.6 },
  };
  return kitMaterial('stone', {
    uniforms: U, key: opts.texture || 'rock26',
    decl: `${SCAN_DECL}
uniform vec3 akC0, akC1, akC2; uniform float akVar; uniform vec4 akW; uniform vec4 akDirt; uniform float akScale;`,
    body: /* glsl */ `
  float sd = vInfo.x;
  vec3 P = vWPos;
  float hb = vInfo.w;
  // per-stone colour (each stone was quarried / weathered differently)
  float h1 = akH1(sd * 91.7), h2 = akH1(sd * 37.3 + 1.0), h3 = akH1(sd * 11.9 + 2.0);
  vec3 base = h1 < 0.5 ? mix(akC0, akC1, h1 * 2.0) : mix(akC0, akC2, h1 * 2.0 - 1.0);
  base *= 1.0 + akVar * (h2 - 0.5) * 2.0;
  base *= mix(vec3(1.0), vec3(1.1, 1.0, 0.84), smoothstep(0.6, 1.0, h3));     // warmer, iron-rich stones
  base *= mix(vec3(1.0), vec3(0.92, 0.97, 1.04), smoothstep(0.4, 0.0, h3));   // a few blue-grey ones
  // the weathered crust is darker than the stone inside: blotchy
  base *= 0.82 + 0.3 * akF3(P * 1.7 + sd * 13.0);
  vec3 nScan;
  vec3 sc = akScanTap(P, akN0, sd, akScale, nScan);
  float lum = mix(1.0, akLum(sc), 0.35);
  // bedding: faint bands across the stone (horizontal in the wall), and darker veins
  float bed = akN2(vec2(dot(akPlanar(P, akN0), vec2(0.15, 0.0)) + sd * 40.0, P.y * 34.0 + sd * 17.0 + akN2(akPlanar(P, akN0) * 3.0) * 2.0));
  float vein = smoothstep(0.84, 0.95, akN2(mat2(0.8, -0.6, 0.6, 0.8) * vec2(P.x * 2.0 + P.z * 1.3, P.y * 9.0) + sd * 50.0));
  vec3 c = base * lum * (0.93 + 0.14 * bed) * (1.0 - 0.18 * vein);
  // iron staining in patches
  float iron = smoothstep(0.62, 0.85, akF3(P * 3.1 + sd * 20.0)) * akDirt.w;
  c = mix(c, c * vec3(1.18, 0.88, 0.6), iron * 0.6);
  // worn, paler arrises (and a little rounder: lighter where the weathered skin has gone)
  float ar = vInfo.z;
  c *= 1.0 + 0.12 * ar * (0.5 + akN3(P * 30.0));
  // pores / pitting (small round dark pits, solution holes)
  vec3 pc = akCell2(akPlanar(P, akN0) * 55.0 + sd * 31.0);
  float pit = (1.0 - smoothstep(0.06, 0.2, pc.x)) * step(0.72, pc.z);
  c *= 1.0 - 0.35 * pit;
  // tooling: diagonal chisel striations on dressed faces (bump only)
  vec2 pl = akPlanar(P, akN0);
  float tool = akW.w * (sin((pl.x + pl.y) * 95.0 + akN2(pl * 30.0) * 6.0) * 0.5 + 0.5) * (1.0 - ar);
  // rain streaks down the face (from projections and the wall top)
  float side = 1.0 - abs(akN0.y);
  float streak = smoothstep(0.55, 0.85, akN2(vec2((P.x + P.z) * 3.7, P.y * 0.35))) * side * akDirt.y;
  c *= 1.0 - 0.28 * streak;
  // splash zone and damp at the footing; green algae on the low, damp parts
  float splash = (1.0 - smoothstep(0.0, 0.55, hb + 0.25 * (akN2(P.xz * 3.0 + P.y) - 0.5))) * akDirt.x;
  float damp = (1.0 - smoothstep(0.0, 0.9, hb + 0.5 * (akF2(vec2(P.x + P.z, P.y) * 1.3) - 0.5))) * akDirt.x;
  c = mix(c, c * vec3(0.62, 0.55, 0.45), splash * 0.8);
  c *= 1.0 - 0.25 * damp;
  float alg = damp * smoothstep(0.4, 0.7, akF3(P * 2.3 + 5.0)) * akW.z;
  c = mix(c, vec3(0.05, 0.075, 0.03), alg * 0.55);
  // occlusion baked per vertex (stone sides deep in the joints) also darkens the colour a little (dust)
  float aov = vInfo.y;
  c *= mix(0.72, 1.0, aov);
  // crustose lichen: pale grey-green and yellow rosettes, more on top faces and up the wall
  vec3 cl = akCell2(pl * 7.0 + sd * 3.0);
  float up = smoothstep(0.2, 0.9, akN0.y) + 0.35;
  float lich = smoothstep(0.5, 0.15, cl.x) * step(0.55, cl.z) * smoothstep(0.35, 0.7, akF3(P * 0.9 + 7.0)) * akW.x * up * aov;
  vec3 lc = cl.z > 0.85 ? vec3(0.42, 0.33, 0.08) : cl.z > 0.7 ? vec3(0.36, 0.38, 0.30) : vec3(0.50, 0.50, 0.44);
  c = mix(c, lc * (0.8 + 0.4 * akN2(pl * 90.0)), clamp(lich, 0.0, 1.0) * 0.75);
  // moss: in sheltered joints and on ledges, more near the ground
  float mossM = akW.y * smoothstep(0.45, 0.75, akF3(P * 2.7 + 3.0)) * (smoothstep(0.6, 0.95, akN0.y) + (1.0 - aov) * 0.8 + damp * 0.6);
  vec3 mc = mix(vec3(0.03, 0.05, 0.012), vec3(0.09, 0.11, 0.03), akN3(P * 40.0));
  c = mix(c, mc, clamp(mossM, 0.0, 1.0));
  // soot (chimney stacks)
  c *= 1.0 - akDirt.z * smoothstep(0.3, 0.9, akF3(P * 1.5));
  akAlb = c;
  akRgh = clamp(0.82 + 0.12 * (1.0 - lum) - 0.12 * damp + 0.1 * mossM, 0.5, 1.0);
  akAO = mix(0.35, 1.0, aov);
  akNW = normalize(mix(akN0, nScan, 0.6 - 0.25 * akW.w));
  float fw = length(fwidth(P));
  float hf = 1.0 - smoothstep(0.0015, 0.004, fw);
  akHt = (tool * 0.0008 * hf - pit * 0.0006 * (1.0 - smoothstep(0.001, 0.0025, fw))) + mossM * 0.004 * (1.0 - smoothstep(0.004, 0.01, fw));
`,
  });
}

// ---------------------------------------------------------- mortar --
export function mortarMaterial(ctx, opts = {}) {
  const U = { akC: { value: new THREE.Color(...(opts.color || [0.36, 0.34, 0.30])) }, akMoss: { value: opts.moss ?? 0.4 } };
  return kitMaterial('mortar', {
    uniforms: U,
    decl: 'uniform vec3 akC; uniform float akMoss;',
    body: /* glsl */ `
  vec3 P = vWPos;
  float hb = vInfo.w;
  float g = akR3(P * 260.0), g2 = akR3(P * 60.0), g3 = akF3(P * 9.0);
  vec3 c = akC * (0.8 + 0.2 * g + 0.25 * (akF3(P * 4.0) - 0.5)) * mix(vec3(1.0), vec3(1.05, 0.98, 0.9), akN3(P * 2.0));
  float splash = 1.0 - smoothstep(0.0, 0.6, hb);
  c = mix(c, c * vec3(0.6, 0.55, 0.47), splash * 0.75);
  float moss = akMoss * smoothstep(0.55, 0.8, akF3(P * 3.0 + 1.0)) * (0.4 + splash);
  c = mix(c, vec3(0.04, 0.055, 0.015), moss);
  // the joint is recessed: a little darker (dust, the shadow of the stones the shadow map cannot resolve)
  c *= 0.75 + 0.25 * g2;
  akAlb = c; akRgh = 0.95; akAO = 0.6;
  float fwm = length(fwidth(P));
  akHt = g * 0.0008 * (1.0 - smoothstep(0.001, 0.003, fwm)) + g3 * 0.006 + g2 * 0.0015;
`,
  });
}

// ---------------------------------------------------------- oak --
/** Weathered hewn oak. palette [silver-grey, brown, dark]; tone 0..1 (0 silver .. 1 dark brown). */
export async function oakMaterial(ctx, opts = {}) {
  const S = await scan(ctx, 'pbr/acg_wood35');
  const U = {
    ...S.uniforms,
    akC0: { value: new THREE.Color(...(opts.silver || [0.20, 0.185, 0.165])) },
    akC1: { value: new THREE.Color(...(opts.brown || [0.105, 0.075, 0.05])) },
    akC2: { value: new THREE.Color(...(opts.dark || [0.045, 0.035, 0.026])) },
    akTone: { value: opts.tone ?? 0.5 },
    akChecks: { value: opts.checks ?? 1 },
    akLich: { value: opts.lichen ?? 0.3 },
  };
  return kitMaterial('oak', {
    uniforms: U, key: opts.key || '',
    decl: `${SCAN_DECL}
uniform vec3 akC0, akC1, akC2; uniform float akTone, akChecks, akLich;`,
    body: /* glsl */ `
  float sd = vInfo.x;
  vec3 P = vWPos;
  vec3 A = normalize(vAxisW + 1e-6);
  float endg = smoothstep(0.65, 0.85, abs(dot(akN0, A)));
  vec3 Bv = normalize(cross(A, akN0) + 1e-6);
  float u = dot(P, A) + sd * 37.0;          // along the grain
  float v = dot(P, Bv) + sd * 11.0;         // across
  // grain: long fibres + growth rings cut obliquely (cathedral figure), scan for fine fibre detail
  vec2 suv = vec2(u * 0.55, v * 2.2) + sd * 3.0;
  vec3 ga = texture2D(akScanA, suv).rgb / akScan.z;
  vec3 gn = texture2D(akScanN, suv).xyz * 2.0 - 1.0;
  float fib = akN2(vec2(u * 2.5, v * 140.0)) * 0.6 + akN2(vec2(u * 0.7, v * 47.0)) * 0.4;
  float rings = sin((v * 38.0 + akF2(vec2(u * 0.6, v * 3.0)) * 9.0) ) * 0.5 + 0.5;
  float tone = clamp(akTone + (akH1(sd * 51.3) - 0.5) * 0.5, 0.0, 1.0);
  vec3 base = tone < 0.5 ? mix(akC0, akC1, tone * 2.0) : mix(akC1, akC2, tone * 2.0 - 1.0);
  // the weather side bleaches to silver, the underside and sheltered parts stay brown / dark
  float upf = akN0.y;
  base = mix(base, akC0 * 1.1, smoothstep(0.2, 1.0, upf) * 0.45);
  base = mix(base, base * vec3(0.7, 0.62, 0.55), smoothstep(-0.2, -1.0, upf) * 0.5);
  vec3 c = base * mix(1.0, akLum(ga), 0.5) * (0.82 + 0.3 * fib) * (0.92 + 0.12 * rings);
  // checks: long dark shrinkage splits along the grain, a few per face
  float chk = 0.0;
  {
    float cv = v * 9.0 + akN2(vec2(u * 0.8, sd * 9.0)) * 1.5;
    float line = abs(fract(cv) - 0.5);
    float pres = smoothstep(0.55, 0.8, akN2(vec2(floor(cv) * 7.3 + sd * 20.0, u * 0.35)));
    float wdt = 0.035 * pres;
    chk = (1.0 - smoothstep(wdt * 0.4, wdt, line)) * pres * akChecks * (1.0 - endg);
  }
  c *= 1.0 - 0.75 * chk;
  // end grain: rings and radial splits, darker and more porous
  if (endg > 0.0) {
    vec2 q = vec2(dot(P, Bv), dot(P, normalize(cross(A, Bv)))) + vec2(akH1(sd * 3.0), akH1(sd * 5.0)) * 0.1;
    float rr = length(q) * 70.0 + akN2(q * 20.0) * 3.0;
    float ec = 0.7 + 0.3 * sin(rr);
    c = mix(c, base * 0.6 * ec, endg);
  }
  // green-grey lichen and algae on the weather faces, splash dirt low down
  float hb = vInfo.w;
  float lich = akLich * smoothstep(0.6, 0.8, akF3(P * 3.0 + sd)) * smoothstep(-0.2, 0.8, upf) * smoothstep(0.4, 0.2, akCell2(vec2(u, v) * 6.0).x);
  c = mix(c, vec3(0.2, 0.22, 0.16), lich * 0.6);
  c *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.5, hb));
  c *= mix(0.6, 1.0, vInfo.y);
  akAlb = c;
  akRgh = 0.78 + 0.14 * fib;
  akAO = mix(0.4, 1.0, vInfo.y);
  vec3 Tg = A, Bg = normalize(cross(akN0, A) + 1e-6);
  akNW = normalize(akN0 + (Tg * gn.x * 0.25 + Bg * gn.y * akScan.y * 0.6) * (1.0 - endg));
  float hf = 1.0 - smoothstep(0.003, 0.012, length(fwidth(P)));
  akHt = (fib * 0.0015 - chk * 0.004) * hf;
`,
  });
}

// ---------------------------------------------------------- plaster --
/** Lime-washed plaster; tints: up to 6 linear wash colours, picked per piece (aInfo.x). */
export function plasterMaterial(ctx, opts = {}) {
  const tints = (opts.tints || [[0.5, 0.47, 0.41], [0.54, 0.47, 0.36], [0.5, 0.46, 0.43], [0.47, 0.45, 0.41], [0.52, 0.45, 0.38], [0.44, 0.42, 0.37]]).map((c) => new THREE.Vector3(...c));
  while (tints.length < 6) tints.push(tints[0]);
  const U = { akT: { value: tints }, akAge: { value: opts.age ?? 0.6 }, akSoot: { value: opts.soot ?? 0 } };
  return kitMaterial('plaster', {
    uniforms: U,
    decl: 'uniform vec3 akT[6]; uniform float akAge; uniform float akSoot;',
    body: /* glsl */ `
  float sd = vInfo.x;
  vec3 P = vWPos;
  vec2 pl = akPlanar(P, akN0);
  float hb = vInfo.w;
  int ti = int(floor(fract(sd * 7.13) * 5.999));
  vec3 tint = akT[0];
  for (int i = 0; i < 6; i++) if (i == ti) tint = akT[i];
  // brushed lime wash: uneven coats, the brush strokes, older coats and the daub where it flakes
  float wash = akF3(P * 0.8 + sd * 9.0) * 0.6 + akF3(P * 3.5) * 0.4;
  float brush = akN2(vec2(pl.x * 3.0 + pl.y * 1.2, pl.y * 22.0 - pl.x * 4.0) + sd * 5.0);
  vec3 c = tint * (0.86 + 0.22 * wash) * (0.97 + 0.06 * brush);
  // repairs: patches of newer, slightly different render with crisp-ish edges
  vec3 pc = akCell2(pl * 0.9 + sd * 4.0);
  float patchM = step(0.82, pc.z) * smoothstep(0.08, 0.02, pc.y - pc.x - 0.15 + 0.1 * akN2(pl * 12.0));
  patchM = clamp(step(0.85, pc.z) * (1.0 - smoothstep(0.45, 0.5, pc.x + 0.08 * akN2(pl * 9.0))), 0.0, 1.0);
  c = mix(c, c * vec3(1.05, 1.02, 0.97) * (0.95 + 0.1 * akN2(pl * 5.0)), patchM);
  // flaking: the wash gone, the coarse render (and here and there the daub) showing
  float fl = akF3(P * 2.6 + 11.0) + 0.25 * akR3(P * 22.0);
  float fl2 = akF3(P * 7.0 + 31.0) + 0.3 * akR3(P * 40.0);
  float flake = smoothstep(0.74, 0.76, fl2) * smoothstep(0.55, 0.7, fl) * akAge;
  float daub = smoothstep(0.8, 0.82, fl2) * smoothstep(0.62, 0.75, fl) * akAge;
  c = mix(c, c * vec3(0.8, 0.75, 0.66), flake * 0.6);
  // grime: grey-brown weathering in broad soft patches, heavier up under the eaves and low down
  float grime = smoothstep(0.35, 0.8, akF3(P * vec3(0.9, 0.35, 0.9) + sd * 2.0));
  c = mix(c, c * vec3(0.72, 0.68, 0.6), grime * 0.55 * akAge);
  // general grime: dust settles in the texture, darker toward the timbers and under the sills
  c *= 0.86 + 0.14 * akF3(P * 6.0 + sd * 3.0);
  c = mix(c, vec3(0.16, 0.12, 0.08) * (0.8 + 0.4 * akN3(P * 50.0)), daub * 0.85);
  // hairline cracks (cellular edges, broken up)
  vec3 ck = akCell2(pl * 3.5 + sd * 2.0);
  float crack = (1.0 - smoothstep(0.0, 0.02, ck.y - ck.x)) * smoothstep(0.6, 0.8, akN2(pl * 1.7 + 4.0)) * akAge;
  c *= 1.0 - 0.55 * crack;
  // stains: rain streaks from the timbers and sills above, damp and splash at the foot
  float streak = smoothstep(0.5, 0.85, akN2(vec2(pl.x * 4.5, pl.y * 0.4 + sd))) * (0.4 + 0.6 * akN2(vec2(pl.x * 20.0, pl.y * 2.0)));
  c *= 1.0 - 0.22 * streak * akAge * (1.0 - abs(akN0.y));
  float splash = 1.0 - smoothstep(0.0, 0.7, hb + 0.3 * (akN2(pl * 3.0) - 0.5));
  c = mix(c, c * vec3(0.55, 0.5, 0.42), splash * 0.85);
  float green = (1.0 - smoothstep(0.0, 1.2, hb)) * smoothstep(0.5, 0.75, akF3(P * 2.0)) * 0.6;
  c = mix(c, c * vec3(0.55, 0.62, 0.42), green);
  // edges of a panel against the timbers: dirt, shrinkage gap shadow (baked aInfo.y)
  float aov = vInfo.y;
  c *= mix(0.55, 1.0, aov);
  c *= 1.0 - akSoot * smoothstep(0.3, 0.8, akF3(P * 0.7 + 2.0));
  akAlb = c;
  akRgh = 0.9 - 0.08 * patchM;
  akAO = mix(0.4, 1.0, aov);
  float hf = 1.0 - smoothstep(0.003, 0.015, length(fwidth(P)));
  akHt = (akN3(P * 90.0) * 0.0005 + brush * 0.0008 - crack * 0.0015 - flake * 0.0015 - daub * 0.003 + patchM * 0.001) * hf;
`,
  });
}

// ---------------------------------------------------------- roof tiles --
/** kind 'clay' (plain tiles) | 'slate' (stone slates). Per tile colour from aInfo.x. */
export async function tileMaterial(ctx, opts = {}) {
  const kind = opts.kind || 'clay';
  const S = await scan(ctx, 'pbr/acg_rock26');
  const pal = opts.palette || (kind === 'clay'
    ? [[0.23, 0.09, 0.045], [0.17, 0.075, 0.045], [0.28, 0.13, 0.07], [0.12, 0.06, 0.04]]
    : [[0.085, 0.085, 0.08], [0.11, 0.105, 0.095], [0.07, 0.075, 0.075], [0.13, 0.12, 0.10]]);
  const U = {
    ...S.uniforms,
    akP: { value: pal.map((c) => new THREE.Vector3(...c)) },
    akW: { value: new THREE.Vector4(opts.lichen ?? 0.6, opts.moss ?? 0.5, opts.soot ?? 0, kind === 'clay' ? 1 : 0) },
  };
  return kitMaterial(`tile-${kind}`, {
    uniforms: U, key: kind,
    decl: `${SCAN_DECL}
uniform vec3 akP[4]; uniform vec4 akW;`,
    body: /* glsl */ `
  float sd = vInfo.x;
  vec3 P = vWPos;
  float h1 = akH1(sd * 71.3), h2 = akH1(sd * 19.1 + 3.0);
  int pi = int(floor(h1 * 3.999));
  vec3 base = akP[0];
  for (int i = 0; i < 4; i++) if (i == pi) base = akP[i];
  base = mix(base, akP[(pi + 1) - 4 * ((pi + 1) / 4)], h2 * 0.5);
  vec3 nScan;
  vec3 sc = akScanTap(P, akN0, sd, 1.4, nScan);
  // uv: x across the tile (m), y down the tile from its head (m); aInfo.y: exposed (1) .. under the next course (0)
  vec2 tu = vMUv;
  float aov = vInfo.y;
  float lum = mix(1.0, akLum(sc), 0.45);
  vec3 c = base * lum * (0.9 + 0.2 * akN2(tu * 30.0 + sd * 10.0));
  // fired-clay mottling / slate cleavage
  c *= akW.w > 0.5 ? (0.88 + 0.24 * akF2(tu * 8.0 + sd * 3.0)) : (0.9 + 0.2 * akN2(vec2(tu.x * 4.0, tu.y * 40.0) + sd * 9.0));
  // weathering toward the tail (exposed, wetter)
  c *= 0.92 + 0.12 * smoothstep(0.0, 0.3, tu.y);
  // lichen rosettes (grey-white crustose, orange Xanthoria on clay), moss cushions in the laps
  vec3 cl = akCell2(P.xz * 5.0 + vec2(P.y * 3.0) + sd);
  float lich = smoothstep(0.45, 0.12, cl.x) * step(0.45, cl.z) * smoothstep(0.35, 0.65, akF3(P * 0.6 + 4.0)) * akW.x * aov;
  vec3 lc = cl.z > 0.86 && akW.w > 0.5 ? vec3(0.45, 0.22, 0.03) : vec3(0.42, 0.42, 0.37);
  c = mix(c, lc * (0.8 + 0.4 * akN2(P.xz * 80.0)), lich * 0.8);
  float mossM = akW.y * smoothstep(0.5, 0.75, akF3(P * 1.6 + 9.0) + 0.25 * (1.0 - aov)) ;
  vec3 mc = mix(vec3(0.03, 0.045, 0.01), vec3(0.1, 0.11, 0.03), akN3(P * 35.0));
  c = mix(c, mc, clamp(mossM, 0.0, 1.0) * 0.9);
  c *= 1.0 - akW.z * smoothstep(0.4, 0.9, akF3(P * 0.5 + 3.0));
  c *= mix(0.4, 1.0, aov);
  akAlb = c;
  akRgh = akW.w > 0.5 ? 0.8 : 0.7 + 0.15 * akN2(tu * 20.0);
  akAO = mix(0.3, 1.0, aov);
  akNW = normalize(mix(akN0, nScan, 0.45));
  akHt = mossM * 0.006;
`,
  });
}

// ---------------------------------------------------------- iron --
export function ironMaterial(ctx, opts = {}) {
  return kitMaterial('iron', {
    uniforms: { akRust: { value: opts.rust ?? 0.5 } },
    decl: 'uniform float akRust;',
    body: /* glsl */ `
  vec3 P = vWPos;
  float r = smoothstep(0.45, 0.75, akF3(P * 9.0) + 0.3 * akN3(P * 60.0) - 0.3 + akRust * 0.4);
  vec3 c = mix(vec3(0.035, 0.034, 0.033), vec3(0.11, 0.045, 0.018) * (0.7 + 0.6 * akN3(P * 120.0)), r);
  akAlb = c; akRgh = mix(0.55, 0.92, r); akMet = mix(0.65, 0.0, r);
  akHt = r * akN3(P * 300.0) * 0.0006 + akN3(P * 40.0) * 0.0005;
`,
  });
}

// ---------------------------------------------------------- simple surfaces --
/** A plain kit surface (straw, linen, leather, lead...): colour, roughness, noise. */
export function plainMaterial(name, color, opts = {}) {
  return kitMaterial(name, {
    uniforms: { akC: { value: new THREE.Color(...color) }, akV: { value: new THREE.Vector3(opts.vary ?? 0.2, opts.freq ?? 20, opts.bump ?? 0.0005) }, akR: { value: opts.roughness ?? 0.85 } },
    decl: 'uniform vec3 akC; uniform vec3 akV; uniform float akR;',
    params: opts.params || {},
    physical: !!opts.physical,
    key: name,
    body: /* glsl */ `
  vec3 P = vWPos;
  float n = akF3(P * akV.y + vInfo.x * 30.0);
  akAlb = akC * (1.0 - akV.x * 0.5 + akV.x * n) * (0.9 + 0.2 * akH1(vInfo.x * 17.0)) * mix(0.6, 1.0, vInfo.y);
  akRgh = akR; akAO = mix(0.4, 1.0, vInfo.y);
  akMet = ${opts.metal ? opts.metal.toFixed(2) : '0.0'};
  akHt = n * akV.z;
`,
  });
}

// ---------------------------------------------------------- glass + interiors --
// Interior mapping (van Dongen 2008): the window plane carries window-local coordinates (uv, m;
// aAxis = window width, height, floor below the window bottom); a ray from the eye through the
// glass is intersected with a virtual room box behind it. The room is lit by the window itself
// (falloff with depth) - in daylight a room seen from the street is dim, but never a void.
const INTERIOR_GLSL = /* glsl */ `
uniform vec4 akRoom;     // x: interior light level, y: room depth default, z: furniture, w: warmth
vec3 akInterior(vec3 wpos, vec3 nW, vec2 wuv, vec3 dims, float seed) {
  vec3 V = normalize(wpos - cameraPosition);
  vec3 Rt = normalize(cross(vec3(0.0, 1.0, 0.0), nW));    // window right (seen from outside, +u)
  // ray in window space: x right, y up, z into the room
  vec3 d = vec3(dot(V, Rt), V.y, -dot(V, nW));
  d.z = max(d.z, 0.02);
  float W = dims.x, H = dims.y, floorY = -dims.z;
  float depth = akRoom.y * (0.75 + 0.6 * akH1(seed * 3.7));
  float mx = 0.9 + 1.5 * akH1(seed * 5.1);
  vec3 o = vec3(wuv, 0.0);
  float x0 = -mx, x1 = W + mx, y0 = floorY, y1 = max(H + 0.5, floorY + 2.6 + 0.4 * akH1(seed * 9.0));
  float tx = d.x > 0.0 ? (x1 - o.x) / d.x : (x0 - o.x) / min(d.x, -1e-4);
  float ty = d.y > 0.0 ? (y1 - o.y) / d.y : (y0 - o.y) / min(d.y, -1e-4);
  float tz = depth / d.z;
  float t = min(tx, min(ty, tz));
  vec3 h = o + d * t;
  vec3 col;
  float warm = akRoom.w;
  vec3 plasterC = mix(vec3(0.55, 0.5, 0.42), vec3(0.6, 0.48, 0.34), warm) * (0.85 + 0.3 * akH1(seed * 2.3));
  if (t == ty && d.y < 0.0) {
    // floor: boards / flags, lit near the window
    float b = akN2(vec2(h.x * 0.6, floor(h.z * 4.0) * 7.1)) * 0.5 + 0.5 * akN2(vec2(h.x * 30.0, h.z * 4.0));
    col = vec3(0.16, 0.11, 0.07) * (0.75 + 0.5 * b) * (1.0 - 0.5 * step(0.94, fract(h.z * 4.0)));
  } else if (t == ty) {
    // ceiling: joists and boards
    float j = step(0.8, fract(h.z * 1.6 + akH1(seed) ));
    col = mix(vec3(0.13, 0.095, 0.065), vec3(0.05, 0.035, 0.025), j);
  } else if (t == tz) {
    col = plasterC * (0.85 + 0.25 * akF2(h.xy * 1.3 + seed * 9.0));
    // a dark doorway or a shelf on the back wall
    float door = step(abs(h.x - (W * 0.5 + (akH1(seed * 4.4) - 0.5) * 2.0)), 0.45) * step(h.y, floorY + 2.0);
    col = mix(col, vec3(0.03, 0.022, 0.015), door * step(0.5, akH1(seed * 8.8)));
  } else {
    col = plasterC * 0.85 * (0.85 + 0.25 * akF2(h.zy * 1.3 + seed * 5.0));
  }
  // furniture: a table / bench / chest silhouette standing on the floor part way in
  float fz = depth * (0.35 + 0.3 * akH1(seed * 6.6));
  if (akRoom.z > 0.0 && fz / d.z < t) {
    float tf = fz / d.z; vec3 q = o + d * tf;
    float fx = W * 0.5 + (akH1(seed * 7.7) - 0.5) * 1.6;
    float fh = floorY + 0.75 + 0.3 * akH1(seed * 2.9);
    if (abs(q.x - fx) < 0.6 + 0.4 * akH1(seed * 1.9) && q.y < fh && q.y > floorY) { col = vec3(0.07, 0.048, 0.03) * (0.8 + 0.3 * akN2(q.xy * 20.0)); h = q; t = tf; }
  }
  // light: from the window (falls off with depth and toward the sides), a little bounce
  float lz = h.z;
  float L = 1.0 / (1.0 + 2.6 * lz * lz / (depth * depth) * 3.0);
  float side = exp(-max(0.0, max(x0 + mx - h.x, h.x - W)) * 0.5);
  float pool = (t == ty && d.y < 0.0) ? exp(-pow((h.z - 0.9) * 1.2, 2.0)) * smoothstep(-0.5, 0.3, h.x) * smoothstep(W + 0.5, W - 0.3, h.x) : 0.0;
  vec3 light = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.85, 0.65), warm) * (0.25 + 0.75 * L * side + 1.2 * pool);
  return col * light * akRoom.x;
}`;

/**
 * Leaded glazing with a room behind. Vertex data: uv = window-local metres (0..w, 0..h),
 * aAxis = (w, h, floor below the window bottom), aInfo.x = seed, aInfo.y = glazing
 * (0 open portal, 1 diamond quarries, 2 square quarries, 3 plain).
 */
export function glassMaterial(ctx, opts = {}) {
  const U = { akRoom: { value: new THREE.Vector4(opts.light ?? 0.16, opts.depth ?? 4.0, opts.furniture ?? 1, opts.warm ?? 0.5) }, akGl: { value: new THREE.Vector3(opts.pane ?? 0.11, opts.came ?? 0.008, opts.tilt ?? 0.05) } };
  const mat = kitMaterial('glass', {
    uniforms: U, physical: true, params: { specularIntensity: 1, ior: 1.52 },
    decl: `${INTERIOR_GLSL}
uniform vec3 akGl;
float akLead; vec3 akEm;`,
    body: /* glsl */ `
  float sd = vInfo.x; float typ = vInfo.y;
  vec2 wuv = vMUv;
  vec3 dims = vAxisL;    // aAxis carries the window size here, not a direction
  vec3 nW = akN0;
  // quarries: a lattice of lead cames
  vec2 q;
  float lead = 0.0; vec2 cellId = vec2(0.0);
  float pw = akGl.x, cw = akGl.y;
  if (typ < 1.5) {   // diamond
    vec2 r = vec2(wuv.x / pw + wuv.y / (pw * 1.45), wuv.y / (pw * 1.45) - wuv.x / pw);
    vec2 f = fract(r); cellId = floor(r);
    vec2 e = min(f, 1.0 - f) * vec2(pw, pw * 1.45) * 0.7;
    lead = 1.0 - smoothstep(cw * 0.45, cw * 0.6, min(e.x, e.y));
  } else {
    vec2 r = wuv / vec2(pw * 1.1, pw * 1.4);
    vec2 f = fract(r); cellId = floor(r);
    vec2 e = min(f, 1.0 - f) * vec2(pw * 1.1, pw * 1.4);
    lead = 1.0 - smoothstep(cw * 0.45, cw * 0.6, min(e.x, e.y));
  }
  // uneven crown glass: every quarry sits at its own small angle, with a ripple
  vec3 Rt = normalize(cross(vec3(0.0, 1.0, 0.0), nW));
  float a1 = akH2(cellId + sd * 13.0) - 0.5, a2 = akH2(cellId * 1.7 + sd * 7.0) - 0.5;
  vec3 nT = normalize(nW + (Rt * a1 + vec3(0.0, 1.0, 0.0) * a2) * akGl.z * 2.0);
  vec3 interior = akInterior(vWPos, nW, wuv + (vec2(a1, a2) * 0.03), dims, sd);
  // a faint green-grey body tint and dirt on old glass
  float dirt = akF2(wuv * 3.0 + sd * 9.0);
  vec3 tint = vec3(0.78, 0.84, 0.76) * (0.8 + 0.2 * dirt);
  akLead = lead;
  akAlb = mix(vec3(0.0), vec3(0.06, 0.06, 0.062), lead);
  akRgh = mix(0.07 + 0.1 * dirt, 0.55, lead);
  akMet = lead * 0.3;
  akNW = mix(nT, nW, lead);
  float ndv = abs(dot(normalize(cameraPosition - vWPos), nW));
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  akEm = interior * tint * (1.0 - F) * (1.0 - lead);
  akAO = 1.0;
`,
  });
  // add the interior as emitted light
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += akEm;');
  };
  return mat;
}

/** An open doorway / unglazed opening onto a room (interior mapping, unlit by the scene). */
export function portalMaterial(ctx, opts = {}) {
  const U = { akRoom: { value: new THREE.Vector4(opts.light ?? 0.2, opts.depth ?? 4.0, opts.furniture ?? 1, opts.warm ?? 0.5) } };
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  mat.name = 'arch:portal';
  mat.userData.dkUniforms = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY.replace(/objectNormal/g, 'normal')}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}\n${INTERIOR_GLSL}`)
      .replace('#include <map_fragment>', `
{
  vec3 nW = normalize(vWNrm);
  vec3 dims = vAxisL;
  diffuseColor.rgb = akInterior(vWPos, nW, vMUv, dims, vInfo.x);
}`);
  };
  mat.customProgramCacheKey = () => 'arch-portal';
  return mat;
}

// ---------------------------------------------------------- the set --
const cache = new Map();
/** All kit materials (cached per ctx + options key). */
export async function archMaterials(ctx, opts = {}) {
  const key = JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const [stonePale, stoneGrey, stoneDressed, oak, oakDark, clay, slate, stoneSoot] = await Promise.all([
      // Verdor: weathered pale limestone / sandstone
      stoneMaterial(ctx, { palette: [[0.50, 0.47, 0.40], [0.44, 0.41, 0.35], [0.55, 0.51, 0.43]], lichen: 0.55, moss: 0.3, tooled: 0.6, ...(opts.stonePale || {}) }),
      // Cling: grey rubble stone
      stoneMaterial(ctx, { palette: [[0.19, 0.18, 0.165], [0.14, 0.135, 0.125], [0.23, 0.2, 0.165]], variation: 0.3, lichen: 0.6, moss: 0.45, tooled: 0.15, ...(opts.stoneGrey || {}) }),
      // dressed grey (quoins, arches, fountain, steps)
      stoneMaterial(ctx, { palette: [[0.24, 0.23, 0.21], [0.2, 0.195, 0.18], [0.27, 0.25, 0.22]], variation: 0.15, lichen: 0.45, moss: 0.3, tooled: 0.7, ...(opts.stoneDressed || {}) }),
      oakMaterial(ctx, { tone: 0.45, ...(opts.oak || {}) }),
      oakMaterial(ctx, { tone: 0.75, key: 'dark', ...(opts.oakDark || {}) }),
      tileMaterial(ctx, { kind: 'clay', ...(opts.clay || {}) }),
      tileMaterial(ctx, { kind: 'slate', ...(opts.slate || {}) }),
      stoneMaterial(ctx, { palette: [[0.12, 0.11, 0.1], [0.09, 0.085, 0.08], [0.15, 0.13, 0.11]], variation: 0.3, lichen: 0.1, moss: 0.0, tooled: 0.3, soot: 0.6, splash: 0, ...(opts.stoneSoot || {}) }),
    ]);
    const M = {
      stonePale, stoneGrey, stoneDressed, oak, oakDark, clay, slate, stoneSoot,
      mortar: mortarMaterial(ctx, opts.mortar),
      mortarPale: mortarMaterial(ctx, { color: [0.42, 0.4, 0.35], ...(opts.mortarPale || {}) }),
      plaster: plasterMaterial(ctx, opts.plaster),
      iron: ironMaterial(ctx, opts.iron),
      glass: glassMaterial(ctx, opts.glass),
      portal: portalMaterial(ctx, opts.portal),
      lead: plainMaterial('lead', [0.12, 0.12, 0.125], { roughness: 0.6, vary: 0.3 }),
      straw: plainMaterial('straw', [0.36, 0.27, 0.12], { roughness: 0.85, vary: 0.5, freq: 40, bump: 0.002 }),
      linen: plainMaterial('linen', [0.62, 0.6, 0.55], { roughness: 0.9, vary: 0.12, freq: 30, bump: 0.0004 }),
      clayware: plainMaterial('clayware', [0.3, 0.16, 0.08], { roughness: 0.7, vary: 0.2 }),
      rope: plainMaterial('rope', [0.22, 0.18, 0.12], { roughness: 0.95, vary: 0.3, freq: 80, bump: 0.001 }),
      soot: plainMaterial('soot', [0.02, 0.018, 0.016], { roughness: 0.95 }),
      water: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.012, 0.016, 0.016), roughness: 0.03, metalness: 0, transmission: 0, ior: 1.33 }),
    };
    M.water.name = 'arch:water';
    M.water.userData.noShadow = true;
    M.glass.userData.noShadow = true;
    M.portal.userData.noShadow = true;
    return M;
  })();
  cache.set(key, p);
  return p;
}
