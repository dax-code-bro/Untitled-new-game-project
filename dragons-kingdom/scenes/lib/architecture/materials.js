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
// (a fract hash with a small gain: the classic fract(sin(x) * 43758) amplifies the last bits of x
// ~1e5 times - fed with an interpolated per-piece seed it turned the interpolation round-off into
// a per-triangle cross-hatch and triangle-shaped tone patches)
float akH1(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
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
// the same, with the horizontal axis fixed per piece (its grain / bedding axis): the per-fragment
// normal only picks the face, it never turns the axes (a turned axis times a position metres from
// the origin moves the pattern from one triangle to the next)
vec2 akPlanarE(vec3 p, vec3 n, vec3 A) {
  if (abs(n.y) > 0.7) return p.xz;
  vec3 h = vec3(A.x, 0.0, A.z);
  float hl = length(h);
  vec3 t = hl > 0.3 ? h / hl : normalize(vec3(-n.z, 0.0, n.x) + 1e-5);
  if (abs(dot(t, n)) > 0.7) t = vec3(-t.z, 0.0, t.x);
  return vec2(dot(p, t), p.y);
}
// crustose lichen: irregular rosettes (domain-warped cells, each its own size, lobed margin, only
// some cells colonised). q in metres. x: cover 0..1, y: margin (paler rim), z: colony id
vec3 akLichen(vec2 q, float seed, float scale) {
  vec2 qs = q * scale;
  vec2 qw = qs + (vec2(akN2(qs * 1.3 + seed), akN2(qs * 1.3 + seed + 7.3)) - 0.5) * 1.1;
  vec3 c = akCell2(qw + seed * 3.0);
  float rad = mix(0.1, 0.48, akH1(c.z * 91.3 + 0.17));
  float edge = rad * (0.7 + 0.6 * akN2(qs * 9.0 + c.z * 17.0));
  float m = (1.0 - smoothstep(edge * 0.82, edge, c.x)) * step(0.52, c.z);
  float rim = smoothstep(edge * 0.45, edge * 0.85, c.x) * m;
  return vec3(m, rim, c.z);
}
float akLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const VERT_DECL = /* glsl */ `
attribute vec4 aInfo; attribute vec3 aAxis;
varying vec4 vInfo; varying vec3 vAxisW; varying vec3 vAxisL; varying vec3 vWPos; varying vec3 vWNrm; varying vec2 vMUv; varying vec3 vObjP;
varying float vAkFoot; uniform float akPxH;`;
const VERT_BODY = /* glsl */ `
vInfo = aInfo; vMUv = uv; vAxisL = aAxis; vObjP = transformed;
// the size of a pixel on the surface (m): smooth over the mesh (fwidth() of a varying is constant
// per triangle and differs between the triangles of a displaced surface: patchy anti-aliasing)
vAkFoot = 2.0 * max(-mvPosition.z, 1e-3) / (projectionMatrix[1][1] * akPxH);
vAxisW = mat3(modelMatrix) * aAxis;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * objectNormal);`;
const FRAG_DECL = /* glsl */ `
varying vec4 vInfo; varying vec3 vAxisW; varying vec3 vAxisL; varying vec3 vWPos; varying vec3 vWNrm; varying vec2 vMUv; varying vec3 vObjP; varying float vAkFoot;
${ARCH_GLSL}
vec3 akAlb; float akRgh; float akHt; float akAO; vec3 akNW; float akMet;
// the per-piece data with the seed snapped to its bucket (core.js writes seeds at bucket centres):
// an interpolated 'constant' is only constant to the last bits, and every hash of it must agree
vec4 akI;`;

/**
 * Wrap a MeshStandard/Physical material with a kit surface. `body` is GLSL that runs where the
 * map would be read and must set akAlb (linear albedo), akRgh, akHt (bump height, m), akAO,
 * akNW (world-space normal before the bump; starts as the geometric normal), akMet.
 * uniforms: extra uniforms; decl: extra GLSL declarations.
 */
// render height in pixels (set by archMaterials from ctx): pixel footprint for the anti-aliasing
const AK_PXH = { value: 2160 };
// development: archMaterials(ctx, { debug: n }) swaps parts of every surface for a check
// (1 constant albedo, 2 no bump, 3 both, 4 albedo shown unlit, 5 projection coordinates)
const AK_DEBUG = { mode: 0 };

function kitMaterial(name, { uniforms = {}, decl = '', body, physical = false, params = {}, key = '' }) {
  const M = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new M({ color: 0xffffff, roughness: 1, metalness: 0, ...params });
  mat.name = `arch:${name}`;
  mat.userData.dkUniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, { akPxH: AK_PXH });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}\n${decl}`)
      .replace('#include <map_fragment>', `
{
  akI = vec4((floor(vInfo.x * 8192.0) + 0.5) / 8192.0, vInfo.yzw);
  vec3 akN0 = normalize(vWNrm) * (gl_FrontFacing ? 1.0 : -1.0);
  // pixel footprint on the surface (m), stretched where the surface is seen at a grazing angle
  float akFoot = vAkFoot / max(abs(dot(akN0, normalize(cameraPosition - vWPos))), 0.25);
  akNW = akN0; akAlb = vec3(0.5); akRgh = 0.9; akHt = 0.0; akAO = 1.0; akMet = 0.0;
  ${body}
#if AK_DBG == 1 || AK_DBG == 3
  akAlb = vec3(0.4);
#endif
#if AK_DBG == 2 || AK_DBG == 3
  akHt = 0.0; akNW = akN0;
#endif
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
  const dbg = AK_DEBUG.mode;
  {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.fragmentShader = `#define AK_DBG ${dbg}\n` + sh.fragmentShader;
      if (dbg === 4) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>');
    };
  }
  mat.customProgramCacheKey = () => `arch-${name}-${key}-${dbg}`;
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
  vec3 tn = texture2D(akScanN, uv, 2.6).xyz * 2.0 - 1.0; tn.y *= akScan.y;
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
    akWash: { value: opts.wash ?? 0 },
    akTide: { value: new THREE.Vector2(opts.tide ?? 0, opts.tide ? 1 : 0) },
  };
  return kitMaterial('stone', {
    uniforms: U, key: (opts.texture || 'rock26') + (opts.wash ? '-wash' : ''),
    decl: `${SCAN_DECL}
uniform vec3 akC0, akC1, akC2; uniform float akVar; uniform vec4 akW; uniform vec4 akDirt; uniform float akScale; uniform float akWash; uniform vec2 akTide;`,
    body: /* glsl */ `
  float sd = akI.x;
  vec3 P = vObjP;            // object space (Kit.build centres each set): noise keeps its precision far from the world origin
  float hb = akI.w;
  // per-stone colour (each stone was quarried / weathered differently)
  float h1 = akH1(sd * 91.7), h2 = akH1(sd * 37.3 + 1.0), h3 = akH1(sd * 11.9 + 2.0);
  vec3 base = h1 < 0.5 ? mix(akC0, akC1, h1 * 2.0) : mix(akC0, akC2, h1 * 2.0 - 1.0);
  base *= 1.0 + akVar * (h2 - 0.5) * 2.0;
  base *= mix(vec3(1.0), vec3(1.1, 1.0, 0.84), smoothstep(0.6, 1.0, h3));     // warmer, iron-rich stones
  base *= mix(vec3(1.0), vec3(0.92, 0.97, 1.04), smoothstep(0.4, 0.0, h3));   // a few blue-grey ones
  // the weathered crust is darker than the stone inside: blotchy; some stones browner, some greener
  base *= 0.78 + 0.36 * akF3(P * 1.7 + sd * 13.0);
  base = mix(base, base * vec3(1.12, 1.0, 0.82), smoothstep(0.55, 0.85, akF3(P * 0.9 + sd * 5.0)) * 0.6);
  base = mix(base, base * vec3(0.92, 1.0, 0.9), smoothstep(0.6, 0.9, akF3(P * 0.7 + 21.0)) * 0.5);
  vec3 nScan;
  vec3 sc = akScanTap(P, akN0, sd, akScale, nScan);
  // (the scan is a veined rock: on dressed faces only a hint, or the stone reads as marble)
  float lum = mix(1.0, akLum(sc), mix(0.42, 0.32, akW.w));
  // the stone's own mottling at a few scales (a scan tiled over every stone reads as camouflage)
  lum *= (0.86 + 0.28 * akF3(P * 7.0 + sd * 23.0)) * (0.93 + 0.14 * akF3(P * 23.0 + sd * 11.0));
  // bedding: faint bands across the stone (horizontal in the wall), and darker veins
  vec2 pl = akPlanarE(P, akN0, vAxisW);
  float bed = akN2(vec2(pl.x * 0.15 + sd * 40.0, P.y * 34.0 + sd * 17.0 + akN2(pl * 3.0) * 2.0));
  float vein = smoothstep(0.84, 0.95, akN2(mat2(0.8, -0.6, 0.6, 0.8) * vec2(P.x * 2.0 + P.z * 1.3, P.y * 9.0) + sd * 50.0));
  vec3 c = base * lum * (0.93 + 0.14 * bed) * (1.0 - 0.18 * vein);
  // iron staining in patches
  float iron = smoothstep(0.62, 0.85, akF3(P * 3.1 + sd * 20.0)) * akDirt.w;
  c = mix(c, c * vec3(1.12, 0.92, 0.72), iron * 0.4);
  // arrises: no bright rim - on rubble the rounded edge runs down into the joint where dust and
  // damp collect (a little darker); on dressed stone a worn arris is only patchily paler
  float ar = akI.z;
  c *= 1.0 - 0.1 * ar * (1.0 - akW.w) + 0.05 * ar * akW.w * (akN3(P * 30.0) - 0.4);
  // pores / pitting (small round dark pits, solution holes)
  vec3 pc = akCell2(pl * 55.0 + sd * 31.0);
  float pit = (1.0 - smoothstep(0.06, 0.2, pc.x)) * step(0.72, pc.z);
  c *= 1.0 - 0.35 * pit;
  // tooling: diagonal chisel striations on dressed faces (bump only)
  float tool = akW.w * (sin((pl.x + pl.y) * 95.0 + akN2(pl * 30.0) * 6.0) * 0.5 + 0.5) * (1.0 - ar);
  // rain streaks down the face (from projections and the wall top)
  float side = 1.0 - abs(akN0.y);
  float streak = smoothstep(0.55, 0.85, akN2(vec2((P.x + P.z) * 3.7, P.y * 0.35))) * side * akDirt.y;
  c *= 1.0 - 0.28 * streak;
  // splash zone and damp at the footing (rain bouncing off the ground throws mud 0-60 cm up the
  // wall, the wall wicks damp higher); green algae on the low, damp parts - most on the shaded,
  // north-facing walls (world -z)
  float north = smoothstep(0.1, -0.7, akN0.z);
  float splash = (1.0 - smoothstep(0.0, 0.6, hb + 0.22 * (akN2(P.xz * 3.0 + P.y) - 0.5) + 0.12 * (akN2(vec2(P.x + P.z, P.y) * 9.0) - 0.5))) * akDirt.x;
  float damp = (1.0 - smoothstep(0.0, 1.0 + 0.4 * north, hb + 0.5 * (akF2(vec2(P.x + P.z, P.y) * 1.3) - 0.5))) * akDirt.x;
  c = mix(c, c * vec3(0.55, 0.48, 0.38) + vec3(0.012, 0.009, 0.005), splash * 0.85);
  c *= 1.0 - 0.3 * damp;
  float alg = damp * smoothstep(0.42 - 0.2 * north, 0.7 - 0.2 * north, akF3(P * 2.3 + 5.0)) * akW.z;
  c = mix(c, vec3(0.04, 0.065, 0.025), alg * (0.5 + 0.25 * north));
  // occlusion baked per vertex (stone sides deep in the joints) also darkens the colour a little (dust)
  float aov = akI.y;
  c *= mix(0.72, 1.0, aov);
  // patina: weathering spreads over the wall regardless of the joints (darker grey-brown clouds,
  // paler sun-bleached patches) - without it every stone reads as a separate new tile
  float pat = akF3(P * vec3(0.32, 0.22, 0.32) + 17.0);
  c *= mix(1.0, 0.72, smoothstep(0.45, 0.8, pat) * akDirt.w);
  c = mix(c, c * vec3(1.06, 1.05, 1.0), smoothstep(0.42, 0.2, pat) * 0.5);
  // dust and grit settle on the little ledges stones make
  c *= mix(1.0, 0.86, smoothstep(0.55, 0.95, akN0.y) * (1.0 - akW.y * 0.5));
  // runoff: darker streaks running down from ledges, sills and wall tops
  float run = smoothstep(0.6, 0.9, akN2(vec2((P.x + P.z) * 6.0 + sd, P.y * 0.6))) * smoothstep(0.3, 0.8, akN2(vec2((P.x - P.z) * 1.7, P.y * 0.25 + 4.0))) * side;
  c *= 1.0 - 0.3 * run * akDirt.y;
  // crustose lichen: irregular rosettes of all sizes in colonies, mostly on the tops of ledges and
  // copings, sparse on the faces; low contrast (an old grey crust, a few yellow ones)
  vec3 cl = akLichen(pl, sd * 7.0, 6.5);
  float up = smoothstep(0.3, 0.9, akN0.y) * 0.75 + 0.25 + 0.35 * north * smoothstep(0.2, 0.8, akN0.y + 0.5);
  float colony = smoothstep(0.42, 0.72, akF3(P * 0.8 + 7.0));
  float lich = cl.x * colony * akW.x * up * smoothstep(0.3, 0.8, aov);
  vec3 lc = cl.z > 0.9 ? vec3(0.36, 0.3, 0.12) : cl.z > 0.72 ? c * vec3(1.25, 1.3, 1.15) : c * vec3(1.45, 1.45, 1.35) + 0.03;
  lc *= 0.92 + 0.16 * akN2(pl * 120.0) + 0.1 * cl.y;
  c = mix(c, lc, clamp(lich, 0.0, 1.0) * 0.4);
  // moss: in sheltered joints and on ledges, more near the ground
  float mossM = akW.y * smoothstep(0.45, 0.75, akF3(P * 2.7 + 3.0)) * (smoothstep(0.6, 0.95, akN0.y) + (1.0 - aov) * 0.8 + damp * 0.6);
  vec3 mc = mix(vec3(0.03, 0.05, 0.012), vec3(0.09, 0.11, 0.03), akN3(P * 40.0));
  c = mix(c, mc, clamp(mossM, 0.0, 1.0));
  // soot (chimney stacks)
  c *= 1.0 - akDirt.z * smoothstep(0.3, 0.9, akF3(P * 1.5));
  // tide zones (quays): wet and dark below the line, a fringe of weed and slime at it, barnacles
  // lower down, a white salt bloom above it
  float tideWet = 0.0;
  if (akTide.y > 0.5) {
    float tl = akTide.x;
    // (round 2: the zones read from across the harbour - black-green slime low down, a brown-green
    // weed band, a barnacle crust, a dark wet band up to a sharp high-water line, salt above it)
    float tw0 = hb + 0.14 * (akN2(vec2(pl.x * 2.0, P.y)) - 0.5) + 0.05 * (akN2(vec2(pl.x * 9.0, P.y * 3.0)) - 0.5);
    tideWet = 1.0 - smoothstep(tl - 0.04, tl + 0.04, tw0);
    float slime = 1.0 - smoothstep(tl - 1.6, tl - 1.1, tw0);
    float weed = tideWet * smoothstep(tl - 1.25, tl - 0.55, tw0) * (1.0 - smoothstep(tl - 0.3, tl - 0.05, tw0)) * smoothstep(0.25, 0.55, akF3(P * 4.0) + 0.3);
    c *= mix(1.0, 0.38, tideWet);
    c = mix(c, vec3(0.012, 0.018, 0.008) * (0.7 + 0.6 * akN3(P * 30.0)), slime * 0.9);
    c = mix(c, vec3(0.045, 0.04, 0.012) * (0.7 + 0.6 * akN3(P * 30.0)), weed * 0.9);
    vec3 bc = akCell2(pl * 70.0 + sd * 13.0);
    float barn = tideWet * (1.0 - smoothstep(tl - 1.4, tl - 0.6, tw0)) * smoothstep(tl - 2.2, tl - 1.5, tw0) * (1.0 - smoothstep(0.1, 0.25, bc.x)) * step(0.4, bc.z);
    c = mix(c, vec3(0.28, 0.27, 0.24), barn * 0.75);
    float salt = (1.0 - tideWet) * (1.0 - smoothstep(tl + 0.05, tl + 0.8, hb)) * smoothstep(0.35, 0.65, akF3(P * 3.0 + 2.0));
    c = mix(c, c * 1.3 + 0.035, salt * 0.55);
  }
  // lime wash: a thin white coat over the stones, worn through on the arrises and in patches,
  // greyer and thinner low down, settling darker in the joints
  if (akWash > 0.0) {
    float cov = smoothstep(0.2, 0.55, akF3(P * 1.4) + 0.38) * (1.0 - 0.35 * ar) * smoothstep(0.0, 0.8, hb + 0.3);
    vec3 wc = vec3(0.6, 0.58, 0.53) * (0.9 + 0.12 * akF3(P * 9.0));
    c = mix(c, wc, clamp(cov * akWash, 0.0, 1.0));
  }
  akAlb = c;
  akRgh = clamp(0.82 + 0.12 * (1.0 - lum) - 0.12 * damp + 0.1 * mossM - 0.45 * tideWet, 0.3, 1.0);
  akAO = mix(0.35, 1.0, aov);
  akNW = normalize(mix(akN0, nScan, 0.16 - 0.08 * akW.w));    // (the scans' normals carry a woven pattern: a hint only)
  float fw = (akFoot * 1.4);
  // erosion: the weathered face is pitted and scaled at the centimetre scale
  float ero = akF3(P * 45.0 + sd * 7.0) - 0.5;
  float hf = 1.0 - smoothstep(0.0015, 0.004, fw);
  akHt = (tool * 0.0008 * hf - pit * 0.0006 * (1.0 - smoothstep(0.001, 0.0025, fw))) + mossM * 0.004 * (1.0 - smoothstep(0.004, 0.01, fw))
       + ero * 0.0022 * (1.0 - akW.w * 0.6) * (1.0 - smoothstep(0.002, 0.007, fw));
`,
  });
}

// ---------------------------------------------------------- mortar --
/**
 * Lime mortar: lime and sharp sand (a photo-scanned dry sandy ground for the grain), sparse coarse
 * grit, lime bloom, dust and damp; no pinholes. opts: color, moss, ao (recess darkening), scale.
 */
export async function mortarMaterial(ctx, opts = {}) {
  const S = await scan(ctx, opts.texture || 'pbr/acg_ground05');
  const U = { ...S.uniforms, akC: { value: new THREE.Color(...(opts.color || [0.19, 0.18, 0.16])) }, akMoss: { value: opts.moss ?? 0.4 }, akMAO: { value: opts.ao ?? 0.6 }, akMS: { value: opts.scale ?? 1.7 } };
  return kitMaterial('mortar', {
    uniforms: U, key: opts.key || '',
    decl: `${SCAN_DECL}
uniform vec3 akC; uniform float akMoss; uniform float akMAO; uniform float akMS;`,
    body: /* glsl */ `
  vec3 P = vObjP;            // object space (Kit.build centres each set): noise keeps its precision far from the world origin
  float hb = akI.w;
  vec2 pl = akPlanar(P, akN0);
  vec3 nScan;
  vec3 sc = akScanTap(P, akN0, 0.37, akMS, nScan);
  float lum = akLum(sc);
  // lime and sand: the scan's grain, broad blotches of damp and dirt, a warmer and a greyer lime
  float b1 = akF3(P * 2.2 + 3.0), b2 = akF3(P * 7.0 + 11.0);
  vec3 c = akC * mix(1.0, clamp(lum, 0.4, 1.8), 0.75) * (0.82 + 0.36 * b1) * (0.94 + 0.12 * b2);
  c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.9), smoothstep(0.4, 0.8, akF3(P * 0.9 + 21.0)));
  // coarse grit: sparse 2-6 mm grains, each its own tone (faded before a grain spans < 2 px)
  vec3 g = akCell2(pl * 150.0 + 3.1);
  float gaa = 1.0 - smoothstep(0.25, 0.6, 150.0 * akFoot);
  float grit = (1.0 - smoothstep(0.14, 0.3, g.x)) * step(0.7, g.z) * gaa;
  c *= mix(1.0, 0.75 + 0.45 * akH1(g.z * 31.7), grit * 0.6);
  // lime bloom: pale leached patches where the rain runs
  float bloom = smoothstep(0.62, 0.86, akF3(vec3(P.x + P.z, P.y * 0.5, P.z) * 4.0 + 4.0));
  c = mix(c, c * 1.22 + 0.015, bloom * 0.35);
  float splash = 1.0 - smoothstep(0.0, 0.6, hb + 0.2 * (b2 - 0.5));
  c = mix(c, c * vec3(0.56, 0.5, 0.42), splash * 0.8);
  float moss = akMoss * smoothstep(0.55, 0.8, akF3(P * 3.0 + 1.0)) * (0.4 + splash);
  c = mix(c, vec3(0.04, 0.055, 0.015) * (0.7 + 0.6 * akN3(P * 40.0)), moss);
  // the joint lies back between the stones: dust settles in it, the stones shade it
  c *= mix(1.0, 0.78 + 0.22 * akF3(P * 30.0), (1.0 - akMAO) / 0.4);
  akAlb = c; akRgh = 0.95; akAO = akMAO;
  akNW = normalize(mix(akN0, nScan, 0.35));
  float fwm = akFoot * 1.4;
  akHt = grit * 0.0012 + b2 * 0.0025 * (1.0 - smoothstep(0.003, 0.01, fwm)) + b1 * 0.003 - moss * 0.001;
`,
  });
}

// ---------------------------------------------------------- oak --
/** Weathered hewn oak. palette [silver-grey, brown, dark]; tone 0..1 (0 silver .. 1 dark brown). */
export async function oakMaterial(ctx, opts = {}) {
  const U = {
    akC0: { value: new THREE.Color(...(opts.silver || [0.2, 0.185, 0.165])) },
    akC1: { value: new THREE.Color(...(opts.brown || [0.105, 0.075, 0.05])) },
    akC2: { value: new THREE.Color(...(opts.dark || [0.045, 0.035, 0.026])) },
    akTone: { value: opts.tone ?? 0.5 },
    akChecks: { value: opts.checks ?? 1 },
    akLich: { value: opts.lichen ?? 0.3 },
  };
  return kitMaterial('oak', {
    uniforms: U, key: opts.key || '',
    decl: `uniform vec3 akC0, akC1, akC2; uniform float akTone, akChecks, akLich;`,
    body: /* glsl */ `
  float sd = akI.x;
  vec3 P = vObjP;            // object space (Kit.build centres each set): noise keeps its precision far from the world origin
  vec3 A = normalize(vAxisW + 1e-6);
  float endg = smoothstep(0.65, 0.85, abs(dot(akN0, A)));
  // u: along the grain (m, from the piece's uv); r: distance from the pith (only for the end
  // grain: interpolated linearly it has a kink at every triangle edge); w1, w2: two fixed directions
  // across the grain (from the piece's axis only, continuous over the piece: no per-triangle normal
  // in them) - on every side face at least one of them runs across the face
  float u = vMUv.x + sd * 37.0;
  float r = vMUv.y;
  vec3 Rf1 = normalize(cross(A, vec3(0.267, 0.802, 0.535)));
  vec3 Rf2 = cross(A, Rf1);
  float w1 = dot(P, Rf1) + sd * 3.0, w2 = dot(P, Rf2) + sd * 5.0;
  float v = w1 + w2;
  float fw = (akFoot * 1.4);
  // growth rings ~3.5 mm apart: on the side faces long stripes along the grain, wandering a little;
  // on the end grain concentric round the pith. A smooth band (no sawtooth edge to alias), faded
  // out well before a ring spans < 6 px
  float rwS = v + 0.0015 * sin(u * 2.1 + sd * 30.0) + 0.0012 * akN2(vec2(u * 0.8, v * 30.0 + sd * 9.0));
  float ringF = mix(rwS, r, endg) / 0.0036;
  float ringAA = 1.0 - smoothstep(0.05, 0.12, 330.0 * akFoot);
  float ringS = 0.5 + 0.5 * sin(6.2832 * ringF);
  float ring = mix(0.5, ringS * ringS, ringAA);                                  // latewood: the dark, hard band
  // fibres: fine lines along the grain, faded before they alias
  float ph1 = w1 * 700.0 + akN2(vec2(u * 1.5, w1 * 30.0)) * 6.0, ph2 = w2 * 700.0 + akN2(vec2(u * 1.5 + 9.0, w2 * 30.0)) * 6.0;
  float ph3 = (w1 - w2) * 1800.0 + u * 0.7 + akN2(vec2(u * 4.0, (w1 - w2) * 80.0)) * 3.0;
  float fibAA = (1.0 - smoothstep(0.18, 0.35, 700.0 * akFoot));
  float fibAA2 = (1.0 - smoothstep(0.18, 0.35, 2600.0 * akFoot));
  float fib = 0.5 + 0.13 * (sin(ph1) + sin(ph2)) * fibAA + 0.12 * sin(ph3) * fibAA2;
  // every member its own tone (timbers from different trees, replaced members, a coat of tar here and there)
  float tone = clamp(akTone + (akH1(sd * 51.3) - 0.5) * 0.7, 0.0, 1.0);
  vec3 base = tone < 0.5 ? mix(akC0, akC1, tone * 2.0) : mix(akC1, akC2, tone * 2.0 - 1.0);
  base *= 0.85 + 0.3 * akH1(sd * 17.9 + 0.3);
  // the weather side bleaches to silver-grey in long patches; the underside, the sheltered parts and
  // the tannin-stained wood round the joints stay brown / dark
  float upf = akN0.y;
  float silver = smoothstep(0.35, 0.75, akF2(vec2(u * 0.35, v * 3.0) + sd * 11.0)) * smoothstep(-0.3, 0.3, upf) * akI.y;
  base = mix(base, akC0 * (1.05 + 0.2 * akH1(sd * 3.3)), silver * 0.55);
  base = mix(base, akC0 * 1.12, smoothstep(0.2, 1.0, upf) * 0.45);
  base = mix(base, base * vec3(0.7, 0.62, 0.55), smoothstep(-0.2, -1.0, upf) * 0.5);
  // broad weathering streaks along the member
  float streakW = akF2(vec2(u * 0.6, v * 9.0) + sd * 4.0);
  // long fibrous streaks of the weathered surface (open grain, grey and brown bands along the member)
  float gsA = akF2(vec2(u * 0.3, w1 * 45.0) + sd * 7.0), gsB = akF2(vec2(u * 0.3 + 5.0, w2 * 45.0) + sd * 3.0);
  float gs = mix(0.5, gsA, 1.0 - smoothstep(0.15, 0.35, (45.0 * akFoot))) * 0.5 + mix(0.5, gsB, 1.0 - smoothstep(0.15, 0.35, (45.0 * akFoot))) * 0.5;
  gs = 0.5 + (gs - 0.5) * 1.8;
  vec3 c = base * (0.74 + 0.46 * streakW) * (0.72 + 0.56 * gs) * (0.92 + 0.12 * fib) * (1.04 - 0.09 * ring);
  // checks: long dark shrinkage splits along the grain, a few per face
  float chk = 0.0;
  {
    float cv = v * 12.0 + akN2(vec2(u * 0.8, sd * 9.0)) * 1.2;
    float line = abs(fract(cv) - 0.5) / max(17.0 * akFoot, 1e-4);
    float pres = smoothstep(0.55, 0.8, akN2(vec2(floor(cv) * 7.3 + sd * 20.0, u * 0.35)));
    float wdt = (0.6 + 2.5 * pres) * 0.6;
    chk = (1.0 - smoothstep(wdt * 0.5, wdt, line)) * pres * akChecks * (1.0 - endg);
  }
  c *= 1.0 - 0.7 * chk;
  // end grain: concentric rings round the pith, radial splits, darker and more porous
  float er = 0.0;
  if (endg > 0.0) {
    er = ringS * ringAA;
    float por = akN3(P * 400.0) * (1.0 - smoothstep(0.0005, 0.0012, fw));
    vec3 ec = base * 0.72 * (0.85 + 0.25 * er) * (0.9 + 0.2 * por);
    // end checks: one or two dark splits running across the end (the timber dried from the outside)
    // (straight splits at the piece's own angle, a family 22 cm apart: one or two cross an end; each
    // wanders a little and dies out along its length)
    float ea = akH1(sd * 29.3) * 3.1416;
    vec2 eq = vec2(w1, w2);
    float ef = dot(eq, vec2(cos(ea), sin(ea))) / 0.22 + akH1(sd * 7.7) + 0.05 * (akN2(eq * 30.0) - 0.5);
    float ecl = abs(fract(ef) - 0.5), fwe = max(fwidth(ef), 1e-5);
    float ew = 0.0025 * fwe / max(akFoot, 1e-5);
    float echk = (1.0 - smoothstep(ew * 0.5, ew * 0.5 + fwe, ecl)) * min(1.0, ew / fwe + 0.3) * step(0.35, akH1(sd * 13.1))
      * smoothstep(0.3, 0.55, akN2(vec2(dot(eq, vec2(-sin(ea), cos(ea))) * 9.0, floor(ef) * 3.1 + sd * 5.0)));
    ec = mix(ec, ec * 0.22, echk);
    // the end grain greys and is soiled darker toward its edges
    c = mix(c, ec, endg);
  }
  // lichen and algae on the weather faces, splash dirt low down
  float hb = akI.w;
  float lich = akLich * smoothstep(0.55, 0.8, akF3(P * 2.0 + sd)) * smoothstep(-0.2, 0.8, upf) * akLichen(vec2(u, v), sd * 5.0, 7.0).x;
  c = mix(c, c * vec3(1.4, 1.45, 1.3) + 0.02, lich * 0.4);
  c *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.5, hb));
  c *= mix(0.6, 1.0, akI.y);
  akAlb = c;
#if AK_DBG == 10
  akAlb = vec3(fib);
#elif AK_DBG == 11
  akAlb = vec3(streakW);
#elif AK_DBG == 12
  akAlb = vec3(gs * 0.5);
#elif AK_DBG == 13
  akAlb = vec3(ring);
#elif AK_DBG == 14
  akAlb = vec3(chk);
#elif AK_DBG == 15
  akAlb = base * 3.0;
#elif AK_DBG == 16
  akAlb = vec3(fract(u), fract(v * 10.0), 0.0);
#endif
  akRgh = 0.8 + 0.1 * ring;
  akAO = mix(0.4, 1.0, akI.y);
  // weathered oak: the soft earlywood erodes, the latewood rings stand up; fibres; the checks open
  // adze scallops along hewn faces (~22 cm, shallow), faded when they get small on screen
  float adz = 0.5 + 0.5 * cos((u * 4.5 + akN2(vec2(u * 1.5, sd * 7.0)) * 1.4) * 6.2832);
  float adzAA = 1.0 - smoothstep(0.02, 0.06, 4.5 * akFoot);
  akHt = (ring * 0.00012 * ringAA + fib * 0.0001 * fibAA - chk * 0.002 - adz * 0.0016 * adzAA) * (1.0 - endg) + er * 0.00012 * endg + streakW * 0.0006 + gs * 0.0004 * (1.0 - endg);
`,
  });
}

// ---------------------------------------------------------- plaster --
/** Lime-washed plaster; tints: up to 6 linear wash colours, picked per piece (aInfo.x). */
export function plasterMaterial(ctx, opts = {}) {
  // old lime washes: off-white, ochre, buff, grey - never paper white
  const tints = (opts.tints || [[0.46, 0.43, 0.37], [0.5, 0.41, 0.29], [0.45, 0.415, 0.38], [0.41, 0.395, 0.36], [0.49, 0.4, 0.32], [0.44, 0.39, 0.31]]).map((c) => new THREE.Vector3(...c));
  while (tints.length < 6) tints.push(tints[0]);
  const U = { akT: { value: tints }, akAge: { value: opts.age ?? 0.8 }, akSoot: { value: opts.soot ?? 0 } };
  return kitMaterial('plaster', {
    uniforms: U,
    decl: 'uniform vec3 akT[6]; uniform float akAge; uniform float akSoot;',
    body: /* glsl */ `
  float sd = akI.x;
  vec3 P = vObjP;            // object space (Kit.build centres each set): noise keeps its precision far from the world origin
  vec2 pl = akPlanarE(P, akN0, vAxisW);
  float hb = akI.w;
  int ti = int(floor(fract(sd * 7.13) * 5.999));
  vec3 tint = akT[0];
  for (int i = 0; i < 6; i++) if (i == ti) tint = akT[i];
  // brushed lime wash: uneven coats, the brush strokes, older coats and the daub where it flakes
  float wash = akF3(P * 0.8 + sd * 9.0) * 0.6 + akF3(P * 3.5) * 0.4;
  float brush = akN2(vec2(pl.x * 6.0 + pl.y * 1.2, pl.y * 9.0 - pl.x * 2.0) + sd * 5.0) * 0.6 + akN2(pl * 17.0 + sd) * 0.4;
  vec3 c = tint * (0.86 + 0.22 * wash) * (0.97 + 0.06 * brush);
  // repairs: a few patches of newer render with ragged edges (rare: most panels have none)
  vec3 pc = akCell2(pl * 0.7 + sd * 4.0);
  float patchM = clamp(step(0.9, pc.z) * (1.0 - smoothstep(0.38, 0.44, pc.x + 0.12 * akN2(pl * 7.0) + 0.06 * akN2(pl * 23.0))), 0.0, 1.0);
  c = mix(c, c * vec3(1.05, 1.02, 0.97) * (0.95 + 0.1 * akN2(pl * 5.0)), patchM);
  // flaking: the wash worn thin where the rain hits (low in the panel, under the runoff), the
  // coarse render showing in ragged, elongated patches - never round spots
  float fl = akF3(P * vec3(2.2, 0.9, 2.2) + 11.0) + 0.3 * akR3(P * 18.0);
  float fl2 = akF3(P * vec3(6.0, 2.5, 6.0) + 31.0) + 0.25 * akR3(P * 35.0);
  float wetZone = clamp(akI.z * 0.8 + (1.0 - smoothstep(0.0, 1.2, hb)) * 0.6, 0.0, 1.0);
  float flake = smoothstep(0.78, 0.84, fl2 + 0.08 * wetZone) * smoothstep(0.6, 0.72, fl + 0.1 * wetZone) * akAge;
  float daub = smoothstep(0.88, 0.92, fl2 + 0.06 * wetZone) * smoothstep(0.7, 0.8, fl) * akAge;
  c = mix(c, c * vec3(0.84, 0.8, 0.72), flake * 0.5);
  // grime: grey-brown weathering in broad soft vertical washes, heavier low down
  float grime = smoothstep(0.35, 0.85, akF3(P * vec3(0.7, 0.18, 0.7) + sd * 2.0));
  c = mix(c, c * vec3(0.74, 0.71, 0.63), grime * 0.55 * akAge);
  // rain runoff: streaks from the underside of every rail, sill and brace above (aInfo.z = the
  // runoff from the member above: 1 just under it, fading down the panel), dark at the drip line
  float runS = smoothstep(0.42, 0.8, akN2(vec2(pl.x * 16.0 + sd * 9.0, pl.y * 0.9))) * (0.55 + 0.45 * akN2(vec2(pl.x * 45.0, pl.y * 3.0)));
  float runoff = akI.z * (runS * 0.8 + 0.25 * pow(akI.z, 6.0));
  c *= 1.0 - 0.32 * runoff * akAge;
  c = mix(c, c * vec3(0.92, 0.95, 0.85), runoff * 0.3 * akAge);
  // general grime: dust settles in the texture, darker toward the timbers and under the sills
  c *= 0.86 + 0.14 * akF3(P * 6.0 + sd * 3.0);
  c = mix(c, vec3(0.16, 0.12, 0.08) * (0.8 + 0.4 * akN3(P * 50.0)), daub * 0.85);
  // hairline cracks: a few long meandering lines (shrinkage, settlement) in some panels - never a
  // crackle network; ~0.8 mm wide, fainter once narrower than a pixel
  // (a jagged line: the isoline is pushed about by finer noise, and only short runs of it open)
  float cf = akF2(pl * vec2(1.25, 0.8) + sd * 3.0 + 0.18 * vec2(akN2(pl * 6.0), akN2(pl * 6.0 + 3.0))) + 0.012 * (akN2(pl * 70.0) - 0.5) + 0.005 * (akN2(pl * 190.0) - 0.5);
  float cl = abs(cf - 0.5);
  float fwc = max(fwidth(cf), 1e-5);
  float tw = 0.0007 * fwc / max(akFoot, 1e-5);
  float crack = (1.0 - smoothstep(tw * 0.5, tw * 0.5 + fwc, cl)) * min(1.0, tw / fwc + 0.2);
  crack *= smoothstep(0.66, 0.8, akN2(pl * 0.55 + sd * 5.0 + 7.0)) * smoothstep(0.35, 0.6, akN2(pl * 3.1 + sd * 9.0)) * akAge;
  c *= 1.0 - 0.38 * crack;
  // the last lime wash worn through in patches: an older, yellower coat shows
  float wornW = smoothstep(0.6, 0.74, akF3(P * vec3(1.6, 0.8, 1.6) + sd * 4.0 + 13.0) + 0.12 * wetZone);
  c = mix(c, tint * vec3(0.9, 0.82, 0.68) * (0.8 + 0.25 * wash), wornW * 0.55 * akAge);
  // damp and splash at the foot
  float splash = 1.0 - smoothstep(0.0, 0.7, hb + 0.3 * (akN2(pl * 3.0) - 0.5));
  c = mix(c, c * vec3(0.55, 0.5, 0.42), splash * 0.85);
  float green = (1.0 - smoothstep(0.0, 1.2, hb)) * smoothstep(0.5, 0.75, akF3(P * 2.0)) * 0.6;
  c = mix(c, c * vec3(0.55, 0.62, 0.42), green);
  // edges of a panel against the timbers: dirt and damp lime in the quirk (baked aInfo.y); green
  // algae in the lowest corners where the water stands on the rail
  float aov = akI.y;
  c *= mix(0.8, 1.0, aov);
  c = mix(c, c * vec3(0.62, 0.7, 0.5), clamp((1.0 - aov) * 0.6 * smoothstep(0.5, 0.75, akF3(P * 3.0 + 5.0)), 0.0, 1.0) * akAge);
  c *= 1.0 - akSoot * smoothstep(0.3, 0.8, akF3(P * 0.7 + 2.0));
  akAlb = c;
  akRgh = 0.9 - 0.08 * patchM;
  akAO = mix(0.62, 1.0, aov);
  float hf = 1.0 - smoothstep(0.003, 0.015, (akFoot * 1.4));
  float sand = akR3(P * 520.0) * (1.0 - smoothstep(0.0006, 0.0016, (akFoot * 1.4)));
  akHt = (akN3(P * 90.0) * 0.0005 + brush * 0.0003 - crack * 0.0015 - flake * 0.0005 - daub * 0.0012 + patchM * 0.0005) * hf + sand * 0.00025;
`,
  });
}

// ---------------------------------------------------------- roof tiles --
/** kind 'clay' (plain tiles) | 'slate' (stone slates). Per tile colour from aInfo.x. */
export async function tileMaterial(ctx, opts = {}) {
  const kind = opts.kind || 'clay';
  // fired clay: a fine sandy grain; stone slates: the cleaved rock scan
  const S = await scan(ctx, opts.texture || (kind === 'clay' ? 'pbr/acg_ground27' : 'pbr/acg_rock26'));
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
  float sd = akI.x;
  vec3 P = vObjP;            // object space (Kit.build centres each set): noise keeps its precision far from the world origin
  float h1 = akH1(sd * 71.3), h2 = akH1(sd * 19.1 + 3.0);
  int pi = int(floor(h1 * 3.999));
  vec3 base = akP[0];
  for (int i = 0; i < 4; i++) if (i == pi) base = akP[i];
  base = mix(base, akP[(pi + 1) - 4 * ((pi + 1) / 4)], h2 * 0.5);
  // every tile its own value (+-20 %), and here and there a replacement: newer, brighter clay /
  // a slate from another bed
  base *= 0.8 + 0.4 * akH1(sd * 5.3 + 0.21);
  // every roof its own batch of clay / bed of slate and its own age (the seed's 1/20 bucket is
  // the roof: roof.js)
  float rid = floor(sd * 20.0);
  float rHue = akH1(rid * 7.31 + 0.5), rVal = akH1(rid * 3.77 + 0.2), rAge = akH1(rid * 5.13 + 0.7);
  base *= (0.78 + 0.44 * rVal) * (akW.w > 0.5 ? mix(vec3(1.1, 0.93, 0.8), vec3(0.9, 0.97, 1.08), rHue) : mix(vec3(0.94, 0.97, 1.05), vec3(1.06, 1.02, 0.94), rHue));
  float repl = step(0.94, akH1(sd * 9.1 + 0.4));
  base = mix(base, akW.w > 0.5 ? base * vec3(1.35, 1.15, 1.0) : base * vec3(0.85, 0.92, 1.08), repl);
  // uv: x across the tile (m), y down the tile from its head (m); aInfo.y: exposed (1) .. under the next course (0)
  vec2 tu = vMUv;
  float aov = akI.y;
  // scan detail in the tile's own coordinates (a projection picked per fragment flips at a 45 deg pitch)
  vec3 Ad = normalize(vAxisW - akN0 * dot(akN0, vAxisW) + 1e-5);
  vec3 Ac = cross(akN0, Ad);
  vec2 suv = tu * akScan.x * 1.4 + vec2(akH1(sd * 13.1), akH1(sd * 7.7));
  vec3 sc = texture2D(akScanA, suv, 0.5).rgb / akScan.z;
  vec3 tnS = texture2D(akScanN, suv, 2.6).xyz * 2.0 - 1.0; tnS.y *= akScan.y;
  vec3 nScan = normalize(Ac * tnS.x + Ad * tnS.y + akN0 * max(tnS.z, 0.2));
  float lum = mix(1.0, akLum(sc), 0.45);
  vec3 c = base * lum * (0.9 + 0.2 * akN2(tu * 30.0 + sd * 10.0));
  // fired-clay mottling / slate cleavage
  c *= akW.w > 0.5 ? (0.88 + 0.24 * akF2(tu * 8.0 + sd * 3.0)) : (0.9 + 0.2 * akN2(vec2(tu.x * 4.0, tu.y * 40.0) + sd * 9.0));
  // weathering toward the tail (exposed, wetter)
  c *= 0.92 + 0.12 * smoothstep(0.0, 0.3, tu.y);
  // lichen: sparse, low-contrast rosettes in the tile's own coordinates, in colonies; orange
  // Xanthoria on a few clay tiles
  vec3 cl = akLichen(tu + vec2(sd * 37.0, sd * 11.0), sd * 3.0, 9.0);
  float colony = smoothstep(0.45, 0.75, akF3(P * 0.5 + 4.0));
  float lich = cl.x * colony * akW.x * smoothstep(0.55, 0.9, aov) * (0.4 + 1.1 * rAge);
  vec3 lc = (cl.z > 0.88 && akW.w > 0.5) ? vec3(0.36, 0.17, 0.035) : c * vec3(1.5, 1.5, 1.4) + 0.012;
  c = mix(c, lc * (0.92 + 0.16 * cl.y), lich * 0.38);
  // moss: cushions in clusters, in the laps and on the shaded (north) slopes
  float north = smoothstep(0.0, -0.6, akN0.z);
  float mossM = akW.y * smoothstep(0.55, 0.78, akF3(P * 1.9 + 9.0) + 0.22 * (1.0 - aov) + 0.15 * north - 0.05 + 0.12 * (rAge - 0.5));
  vec3 mc = mix(vec3(0.03, 0.045, 0.01), vec3(0.1, 0.11, 0.03), akN3(P * 35.0));
  c = mix(c, mc, clamp(mossM, 0.0, 1.0) * 0.85);
  c *= 1.0 - akW.z * smoothstep(0.4, 0.9, akF3(P * 0.5 + 3.0));
  c *= mix(0.4, 1.0, aov);
  akAlb = c;
  akRgh = akW.w > 0.5 ? 0.86 : 0.78 + 0.14 * akN2(tu * 20.0);
  akAO = mix(0.3, 1.0, aov);
  akNW = normalize(mix(akN0, nScan, 0.25));
  akHt = mossM * 0.006;
`,
  });
}

// ---------------------------------------------------------- iron --
export function ironMaterial(ctx, opts = {}) {
  return kitMaterial('iron', {
    uniforms: { akRust: { value: opts.rust ?? 0.3 } },
    decl: 'uniform float akRust;',
    body: /* glsl */ `
  vec3 P = vObjP;            // object space (Kit.build centres each set): noise keeps its precision far from the world origin
  // old forged iron: a black oxide skin, dull; rust only where it has flaked (a dark brown, never
  // orange - bright rust is new rust)
  float r = smoothstep(0.5, 0.8, akF3(P * 9.0) + 0.3 * akN3(P * 60.0) - 0.3 + akRust * 0.4);
  vec3 c = mix(vec3(0.03, 0.029, 0.028) * (0.8 + 0.4 * akN3(P * 40.0)), vec3(0.065, 0.034, 0.018) * (0.7 + 0.5 * akN3(P * 120.0)), r);
  akAlb = c; akRgh = mix(0.62, 0.92, r); akMet = mix(0.45, 0.0, r);
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
  vec3 P = vObjP;            // object space (Kit.build centres each set): noise keeps its precision far from the world origin
  float n = akF3(P * akV.y + akI.x * 30.0);
  akAlb = akC * (1.0 - akV.x * 0.5 + akV.x * n) * (0.9 + 0.2 * akH1(akI.x * 17.0)) * mix(0.6, 1.0, akI.y);
  akRgh = akR; akAO = mix(0.4, 1.0, akI.y);
  akMet = ${opts.metal ? opts.metal.toFixed(2) : '0.0'};
  akHt = n * akV.z;
`,
  });
}

/** Bark (a log's skin): fissured ridges running along it (uv.x along, uv.y round the log). */
export function barkMaterial(ctx) {
  return kitMaterial('bark', {
    body: /* glsl */ `
  float u = vMUv.x, v = vMUv.y;
  float sd = akI.x;
  float wv = v * 38.0 + 2.2 * akN2(vec2(u * 2.5, v * 6.0 + sd * 9.0));
  float ridge = abs(sin(wv)) ;
  float plates = smoothstep(0.25, 0.8, akN2(vec2(u * 7.0, v * 22.0) + sd * 5.0));
  float fiss = 1.0 - smoothstep(0.0, 0.35, ridge);
  vec3 c = mix(vec3(0.075, 0.066, 0.055), vec3(0.11, 0.1, 0.085), plates) * (0.8 + 0.35 * akN2(vec2(u * 30.0, v * 60.0)));
  c = mix(c, vec3(0.02, 0.017, 0.014), fiss * 0.8);
  // lichen on the old wood
  c = mix(c, vec3(0.2, 0.21, 0.17), smoothstep(0.7, 0.85, akF2(vec2(u * 3.0, v * 8.0) + sd * 3.0)) * 0.6);
  akAlb = c * mix(0.6, 1.0, akI.y); akRgh = 0.9; akAO = mix(0.5, 1.0, akI.y);
  akHt = -fiss * 0.004 * (1.0 - smoothstep(0.004, 0.012, akFoot)) + plates * 0.001;
`,
  });
}

/** Straw bedding: layers of strands lying every which way (cells of parallel stems, overlapping). */
export function strawMaterial(ctx, opts = {}) {
  return kitMaterial('strawbed', {
    uniforms: { akC: { value: new THREE.Color(...(opts.color || [0.5, 0.38, 0.17])) }, akD: { value: new THREE.Color(...(opts.dark || [0.16, 0.11, 0.05])) } },
    decl: 'uniform vec3 akC; uniform vec3 akD;',
    body: /* glsl */ `
  vec3 P = vObjP;            // object space (Kit.build centres each set): noise keeps its precision far from the world origin
  vec2 pl = akPlanar(P, akN0);
  float top = 0.0, cov = 0.0, ht = 0.0;
  vec3 col = mix(akD, akC * 0.55, 0.6 + 0.4 * akN2(pl * 7.0));
  // three layers of stems; the upper layer covers the lower where its stems lie
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 q = pl * (11.0 + 5.0 * fk) + vec2(fk * 13.1, fk * 7.7);
    vec2 ci = floor(q); vec2 f = fract(q);
    float ang = akH2(ci + fk * 3.3) * 6.2832;
    vec2 dir = vec2(cos(ang), sin(ang));
    float across = dot(f - 0.5, vec2(-dir.y, dir.x)) + 0.08 * sin(dot(f, dir) * 6.0 + ci.x);
    float ph = across * 9.0 + akH2(ci + 5.1) * 3.0;
    float aa = 1.0 - smoothstep(0.12, 0.3, 9.0 * (11.0 + 5.0 * fk) * akFoot);
    float st = 0.5 + 0.5 * sin(ph * 6.2832);
    float stem = mix(0.55, mix(0.55, st, 0.12), aa);       // (the modelled loose stems carry the detail; the bed only a hint)
    // ends of the cell fade so the patches overlap rather than tile
    float edge = smoothstep(0.0, 0.2, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float m = stem * mix(0.35, 1.0, edge) * (1.0 - cov * 0.6);
    vec3 sc = akC * (0.7 + 0.5 * akH2(ci + 9.7)) * (0.85 + 0.3 * akN2(q * 3.0 + dir * 20.0));
    col = mix(col, sc * (1.0 - 0.15 * fk), m);
    cov = max(cov, m);
    ht += stem * (0.0003 - 0.00006 * fk) * aa;
  }
  col *= mix(0.55, 1.0, akI.y);
  akAlb = col; akRgh = 0.75; akAO = mix(0.4, 1.0, akI.y);
  akHt = ht;
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
    col = mix(col, col * 0.35, door * step(0.5, akH1(seed * 8.8)) * step(W, 2.5));
  } else {
    col = plasterC * 0.85 * (0.85 + 0.25 * akF2(h.zy * 1.3 + seed * 5.0));
  }
  // a store / warehouse (a wide opening): stacks of goods - crates and barrels - at two depths
  if (akRoom.z > 0.0 && W >= 2.5) {
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float gz = depth * (0.35 + 0.3 * fk + 0.1 * akH1(seed * 3.3 + fk));
      float tg = gz / d.z;
      if (tg < t) {
        vec3 q = o + d * tg;
        float cx0 = W * (0.15 + 0.5 * akH1(seed * 5.7 + fk * 3.0)), gw = 0.9 + 0.8 * akH1(seed * 2.2 + fk);
        float gh = floorY + 0.8 + 0.9 * akH1(seed * 8.1 + fk) - 0.35 * step(0.5, fract((q.x - cx0) * 1.6));
        if (q.x > cx0 && q.x < cx0 + gw && q.y < gh && q.y > floorY) { col = mix(vec3(0.13, 0.09, 0.055), vec3(0.09, 0.075, 0.06), step(0.5, akH1(floor(q.x * 1.6) + fk))) * (0.8 + 0.3 * akN2(q.xy * 12.0)); h = q; t = tg; }
      }
    }
  }
  // furniture: a table / bench / chest silhouette standing on the floor part way in
  float fz = depth * (0.35 + 0.3 * akH1(seed * 6.6));
  if (akRoom.z > 0.0 && W < 2.5 && fz / d.z < t) {
    float tf = fz / d.z; vec3 q = o + d * tf;
    float fx = W * 0.5 + (akH1(seed * 7.7) - 0.5) * 1.6;
    float fh = floorY + 0.75 + 0.3 * akH1(seed * 2.9);
    if (abs(q.x - fx) < 0.6 + 0.4 * akH1(seed * 1.9) && q.y < fh && q.y > floorY) { col = vec3(0.12, 0.085, 0.055) * (0.8 + 0.3 * akN2(q.xy * 20.0)); h = q; t = tf; }
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
  const U = { akRoom: { value: new THREE.Vector4(opts.light ?? 0.16, opts.depth ?? 4.0, opts.furniture ?? 1, opts.warm ?? 0.5) }, akGl: { value: new THREE.Vector3(opts.pane ?? 0.11, opts.came ?? 0.008, opts.tilt ?? 0.02) } };
  const mat = kitMaterial('glass', {
    uniforms: U, physical: true, params: { specularIntensity: 1, ior: 1.52, specularColor: new THREE.Color(0.86, 1.0, 0.9) },
    decl: `${INTERIOR_GLSL}
uniform vec3 akGl;
float akLead; vec3 akEm;`,
    body: /* glsl */ `
  float sd = akI.x; float typ = akI.y;
  vec2 wuv = vMUv;
  vec3 dims = vAxisL;    // aAxis carries the window size here, not a direction
  vec3 nW = akN0;
  vec3 Rt = normalize(cross(vec3(0.0, 1.0, 0.0), nW));
  float ndv = abs(dot(normalize(cameraPosition - vWPos), nW));
  if (typ > 3.5) {
    // oiled linen stretched on a lattice of laths (a humble house's window): matte, buff, a weave,
    // the laths dark; the room behind barely glows through it
    vec2 lr = wuv / vec2(0.16, 0.2);
    vec2 lf = abs(fract(lr) - 0.5) * vec2(0.16, 0.2);
    float lath = 1.0 - smoothstep(0.008, 0.012, min(0.08 - lf.x, 0.1 - lf.y));
    float weave = 0.5 + 0.25 * (sin(wuv.x * 2200.0) + sin(wuv.y * 2200.0)) * (1.0 - smoothstep(0.1, 0.3, 2200.0 * akFoot / 6.28));
    float stain = akF2(wuv * 4.0 + sd * 9.0);
    vec3 cloth = vec3(0.3, 0.25, 0.16) * (0.75 + 0.35 * stain) * (0.94 + 0.12 * weave) * mix(vec3(1.0), vec3(0.8, 0.72, 0.6), smoothstep(0.5, 0.9, akF2(wuv * 9.0 + 3.0)));
    akAlb = mix(cloth, vec3(0.045, 0.034, 0.024), lath);
    akRgh = mix(0.7, 0.8, lath); akMet = 0.0; akNW = nW; akAO = 1.0; akLead = lath;
    akEm = vec3(0.0);
    akHt = weave * 0.0002 - lath * 0.0;
  } else {
    // quarries: a lattice of lead cames
    float lead = 0.0; vec2 cellId = vec2(0.0); vec2 fq = vec2(0.5); float ed = 1.0;
    float pw = akGl.x, cw = akGl.y;
    if (typ < 1.5) {   // diamond
      vec2 r = vec2(wuv.x / pw + wuv.y / (pw * 1.45), wuv.y / (pw * 1.45) - wuv.x / pw);
      vec2 f = fract(r); cellId = floor(r); fq = f;
      vec2 e = min(f, 1.0 - f) * vec2(pw, pw * 1.45) * 0.7;
      ed = min(e.x, e.y);
    } else {
      vec2 r = wuv / vec2(pw * 1.1, pw * 1.4);
      vec2 f = fract(r); cellId = floor(r); fq = f;
      vec2 e = min(f, 1.0 - f) * vec2(pw * 1.1, pw * 1.4);
      ed = min(e.x, e.y);
    }
    lead = 1.0 - smoothstep(cw * 0.45, cw * 0.6, ed);
    // crown glass: every quarry at its own small angle (a degree or so) and gently domed - the
    // reflections shift a little from pane to pane, never a checker of sky and ground
    float a1 = akH2(cellId + sd * 13.0) - 0.5, a2 = akH2(cellId * 1.7 + sd * 7.0) - 0.5;
    float bulge = (akH2(cellId * 2.3 + sd * 5.0) - 0.5) * 0.05;
    vec2 fc = fq - 0.5;
    vec3 nT = normalize(nW + (Rt * a1 + vec3(0.0, 1.0, 0.0) * a2) * akGl.z + (Rt * fc.x + vec3(0.0, 1.0, 0.0) * fc.y) * bulge
      + (Rt * akN2(wuv * 9.0 + sd) + vec3(0.0, 1.0, 0.0) * akN2(wuv * 9.0 + sd + 5.0) - 0.5) * 0.012);
    vec3 interior = akInterior(vWPos, nW, wuv + vec2(a1, a2) * 0.004, dims, sd);
    // old glass: each quarry its own green-grey body tint and density; dirt gathers in the corners
    // against the leads and in a film over the whole light
    float h3 = akH2(cellId * 3.1 + sd * 2.0);
    vec3 tint = mix(vec3(0.8, 0.86, 0.76), vec3(0.72, 0.8, 0.74), h3) * (0.85 + 0.2 * akH2(cellId * 0.7 + sd));
    float grime = (1.0 - smoothstep(cw * 0.6, cw * 3.0, ed)) * 0.6 + 0.35 * akF2(wuv * 3.0 + sd * 9.0);
    akLead = lead;
    akAlb = mix(vec3(0.012, 0.011, 0.01) * grime, vec3(0.028, 0.029, 0.03), lead);
    akRgh = mix(0.05 + 0.04 * h3 + 0.25 * grime * grime, 0.5, lead);
    akMet = 0.0;
    akNW = mix(nT, nW, lead);
    float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    akEm = interior * tint * (1.0 - F) * (1.0 - lead) * (1.0 - 0.45 * grime);
    akAO = 1.0;
  }
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
  const U = { akRoom: { value: new THREE.Vector4(opts.light ?? 0.3, opts.depth ?? 4.0, opts.furniture ?? 1, opts.warm ?? 0.5) } };
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
  diffuseColor.rgb = akInterior(vWPos, nW, vMUv, dims, (floor(vInfo.x * 8192.0) + 0.5) / 8192.0);
}`);
  };
  mat.customProgramCacheKey = () => 'arch-portal';
  return mat;
}

// ---------------------------------------------------------- soot --
/** Soot laid on a wall above a flame: a transparent decal, dense at the source, fading up and out. */
export function sootMaterial(ctx) {
  const mat = kitMaterial('sootStain', {
    params: { transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 },
    body: /* glsl */ `
  float u = vMUv.x - 0.5, v = vMUv.y;
  float plume = exp(-u * u / (0.02 + 0.06 * v)) * (1.0 - smoothstep(0.15, 1.0, v)) * smoothstep(0.0, 0.08, v);
  float n = akF3(vObjP * 6.0) * 0.6 + akF3(vObjP * 23.0) * 0.4;
  akSootA = clamp(plume * (0.55 + 0.6 * n) * 0.85, 0.0, 0.92);
  akAlb = vec3(0.02, 0.018, 0.016);
  akRgh = 0.95; akAO = 1.0;
`,
    decl: 'float akSootA;',
  });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a = akSootA;\n#include <opaque_fragment>'); };
  mat.userData.noShadow = true;
  return mat;
}

// ---------------------------------------------------------- stains --
/**
 * Weathering stains laid over a surface (weathering.js stain()): a transparent decal of streaks
 * running down from a source. uv: x across (m), y 0 at the source .. 1 at the end; aInfo.x: the
 * kind in its quarter (0 dirt / grime, 1 rust, 2 lime / limescale, 3 green algae) + seed;
 * aInfo.y: strength; aInfo.z: the decal's width (m).
 */
export function stainMaterial(ctx) {
  const mat = kitMaterial('stain', {
    params: { transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 },
    decl: 'float akStA;',
    body: /* glsl */ `
  float kind = floor(akI.x * 4.0);
  float sd = fract(akI.x * 4.0);
  float W = max(akI.z, 0.01);
  float u = vMUv.x, v = clamp(vMUv.y, 0.0, 1.0);
  float uN = u / W;
  // a run of streaks: each its own width and length, wandering a little as it runs down
  float uu = u + 0.012 * sin(v * 7.0 + sd * 30.0);
  float st = akN2(vec2(uu * 34.0 + sd * 50.0, v * 0.8 + sd * 3.0)) * 0.65 + akN2(vec2(uu * 90.0 + sd * 17.0, v * 2.0)) * 0.35;
  float len = 0.35 + 0.65 * akN2(vec2(uu * 11.0 + sd * 13.0, 0.5));
  float run = smoothstep(0.38, 0.72, st) * (1.0 - smoothstep(len * 0.55, len, v));
  // a denser wash right under the source, and soft sides
  float wash = (1.0 - smoothstep(0.0, 0.28, v)) * 0.55;
  float edge = smoothstep(0.0, 0.2, uN) * smoothstep(1.0, 0.8, uN);
  akStA = clamp((run * 0.85 + wash) * edge * akI.y, 0.0, 1.0);
  vec3 c;
  if (kind < 0.5) c = vec3(0.045, 0.04, 0.032);
  else if (kind < 1.5) c = vec3(0.1, 0.045, 0.02) * (0.8 + 0.4 * st);
  else if (kind < 2.5) c = vec3(0.5, 0.49, 0.45) * (0.85 + 0.2 * st);
  else c = vec3(0.035, 0.055, 0.02) * (0.8 + 0.4 * st);
  akAlb = c; akRgh = kind > 2.5 ? 0.55 : 0.9; akAO = 1.0;
`,
  });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a = akStA;\n#include <opaque_fragment>'); };
  mat.userData.noShadow = true;
  return mat;
}

// ---------------------------------------------------------- foam --
/** Scum and foam where water meets a wall (a strip on the water: uv.x along (m), uv.y out from the wall (m)). */
export function foamMaterial(ctx) {
  const U = { akTime: { value: 0 } };
  const mat = kitMaterial('foam', {
    uniforms: U, params: { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 },
    decl: 'uniform float akTime; float akFoA;',
    body: /* glsl */ `
  float u = vMUv.x, v = max(vMUv.y, 0.0), t = akTime;
  float n = akF2(vec2(u * 3.5 + t * 0.05, v * 6.0 - t * 0.08)) * 0.6 + akF2(vec2(u * 11.0 - t * 0.1, v * 17.0 + t * 0.2)) * 0.4;
  float lace = smoothstep(0.5, 0.72, n) * exp(-v / 0.35) + 0.65 * exp(-v / 0.05) * (0.6 + 0.4 * n);
  akFoA = clamp(lace * akI.y, 0.0, 0.9);
  akAlb = vec3(0.5, 0.52, 0.5) * (0.85 + 0.25 * n);
  akRgh = 0.6; akAO = 1.0;
`,
  });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a = akFoA;\n#include <opaque_fragment>'); };
  mat.userData.noShadow = true;
  return mat;
}

// ---------------------------------------------------------- water --
/**
 * Still water in a basin with ripple rings (uv.x = distance to the nearest jet's impact, m) and a
 * light chop; akTime (s) moves the rings - a scene sets M.pool.userData.dkUniforms.akTime.value = t.
 */
export function poolMaterial(ctx, opts = {}) {
  const U = { akTime: { value: 0 }, akCol: { value: new THREE.Color(...(opts.color || [0.012, 0.016, 0.015])) }, akChop: { value: opts.chop ?? 1 }, akPR: { value: opts.roughness ?? 0.03 } };
  return kitMaterial(opts.name || 'pool', {
    // (the basin's surroundings are not in the environment map: a duller, greener reflection)
    uniforms: U, physical: true, params: { ior: 1.33, specularIntensity: 0.75, specularColor: new THREE.Color(0.8, 0.9, 0.85) },
    decl: 'uniform float akTime; uniform vec3 akCol; uniform float akChop; uniform float akPR;',
    body: /* glsl */ `
  vec3 P = vObjP;
  float d = vMUv.x;
  float t = akTime;
  // where a jet lands: the water boils (short broken chop dying away within a few tens of cm), and
  // ripples run out from it - bent and broken by the chop, never clean concentric rings
  float warpR = 2.5 * akN2(P.xz * 7.0 + vec2(t * 0.4, -t * 0.3)) + 1.2 * akN2(P.xz * 19.0 - t * 0.7);
  float rings = sin(d * 42.0 - t * 6.5 + warpR) * exp(-d * 2.4) * 0.0007 * (0.5 + akN2(P.xz * 11.0 + t))
              + (akN3(vec3(P.xz * 34.0, t * 3.2)) - 0.5) * exp(-d * 5.0) * 0.003
              + (akN3(vec3(P.xz * 80.0, t * 5.0)) - 0.5) * exp(-d * 9.0) * 0.0012;
  float chop = ((akN3(vec3(P.xz * 9.0 / akChop, t * 0.7)) - 0.5) * 0.0006 + (akN3(vec3(P.xz * 23.0 / akChop + 3.0, t * 1.3)) - 0.5) * 0.0002) * akChop;
  // open water: wind ripples and a slow swell (low frequencies: never faded)
  float swell = akChop > 1.5 ? (akN3(vec3(P.x * 0.7 + P.z * 0.3, P.z * 1.3, t * 0.4)) - 0.5) * 0.06 + (akN3(vec3(P.x * 2.3, P.z * 3.9, t * 0.9)) - 0.5) * 0.018 + (akN3(vec3(P.x * 6.0 + 1.0, P.z * 9.0, t * 1.6)) - 0.5) * 0.004 : 0.0;
  akAlb = akCol;
  // (a puddle: a film of dust and silt on it here and there)
  akRgh = akPR + (akPR > 0.035 ? 0.25 * smoothstep(0.55, 0.85, akF2(P.xz * 5.0 + 3.0)) : 0.0);
  akHt = rings * (1.0 - smoothstep(0.004, 0.012, akFoot)) + chop * (1.0 - smoothstep(0.004 * akChop, 0.012 * akChop, akFoot)) + swell;
  // a film of dust and the odd leaf near the walls
  akAO = 1.0;
`,
  });
}

/** Falling water (thin jets): bright, streaked, half transparent. */
export function jetMaterial(ctx) {
  // clear water: little body colour, a sharp reflection, see-through except where it is aerated
  // (streaks of white running down the strand)
  const U = { akTime: { value: 0 } };
  const mat = kitMaterial('jet', {
    uniforms: U, physical: true, params: { transparent: true, depthWrite: false, ior: 1.33, specularIntensity: 1.0 },
    decl: 'uniform float akTime; float akJA;',
    body: /* glsl */ `
  float s = akN2(vec2(vMUv.y * 5.0, vMUv.x * 14.0 - akTime * 14.0)) * 0.6 + akN2(vec2(vMUv.y * 11.0 + 3.0, vMUv.x * 30.0 - akTime * 20.0)) * 0.4;
  float air = smoothstep(0.55, 0.85, s);
  float ndv = abs(dot(normalize(cameraPosition - vWPos), akN0));
  akAlb = mix(vec3(0.05, 0.06, 0.06), vec3(0.62, 0.66, 0.66), air);
  akJA = clamp(0.18 + 0.55 * air + 0.5 * pow(1.0 - ndv, 2.0), 0.0, 0.9);
  akRgh = mix(0.04, 0.3, air); akAO = 1.0;
`,
  });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a = akJA;\n#include <opaque_fragment>'); };
  return mat;
}

// ---------------------------------------------------------- the set --
const cache = new Map();
/** All kit materials (cached per ctx + options key). */
export async function archMaterials(ctx, opts = {}) {
  AK_PXH.value = (ctx && (ctx.renderHeight || ctx.height)) || 2160;
  AK_DEBUG.mode = opts.debug || 0;
  const key = JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const [stonePale, stoneGrey, stoneDressed, oak, oakDark, oakPeg, oakSilver, clay, slate, stoneSoot, stoneWet, stoneFar, stoneSett, stoneFloor, stoneQuay, stoneWashed] = await Promise.all([
      // Verdor: weathered pale limestone / sandstone
      stoneMaterial(ctx, { texture: 'pbr/acg_ground27', scale: 0.7, palette: [[0.47, 0.44, 0.37], [0.43, 0.405, 0.345], [0.5, 0.465, 0.39]], variation: 0.13, lichen: 0.7, moss: 0.35, tooled: 0.6, streaks: 0.9, stain: 0.7, ...(opts.stonePale || {}) }),
      // Cling: grey rubble stone
      stoneMaterial(ctx, { texture: 'pbr/acg_ground28', scale: 0.55, palette: [[0.2, 0.185, 0.162], [0.165, 0.155, 0.138], [0.225, 0.198, 0.162]], variation: 0.17, lichen: 0.6, moss: 0.45, tooled: 0.15, ...(opts.stoneGrey || {}) }),
      // dressed grey (quoins, arches, fountain, steps)
      stoneMaterial(ctx, { texture: 'pbr/acg_ground27', scale: 0.7, palette: [[0.235, 0.225, 0.205], [0.2, 0.193, 0.178], [0.265, 0.245, 0.212]], variation: 0.2, lichen: 0.55, moss: 0.35, tooled: 0.55, stain: 0.6, ...(opts.stoneDressed || {}) }),
      oakMaterial(ctx, { tone: 0.45, ...(opts.oak || {}) }),
      oakMaterial(ctx, { tone: 0.75, key: 'dark', ...(opts.oakDark || {}) }),
      // trenails: riven oak, the cut ends weathered grey
      oakMaterial(ctx, { tone: 0.08, key: 'peg', checks: 0.2, ...(opts.oakPeg || {}) }),
      // long-weathered structural oak out in the open (the rig, the platform): silver-grey
      oakMaterial(ctx, { tone: 0.12, key: 'silver', silver: [0.23, 0.215, 0.195], ...(opts.oakSilver || {}) }),
      tileMaterial(ctx, { kind: 'clay', ...(opts.clay || {}) }),
      tileMaterial(ctx, { kind: 'slate', ...(opts.slate || {}) }),
      stoneMaterial(ctx, { palette: [[0.12, 0.11, 0.1], [0.09, 0.085, 0.08], [0.15, 0.13, 0.11]], variation: 0.3, lichen: 0.1, moss: 0.0, tooled: 0.3, soot: 0.6, splash: 0, ...(opts.stoneSoot || {}) }),
      // harbour stone below the tide line: wet, dark, green-brown weed and algae
      stoneMaterial(ctx, { palette: [[0.16, 0.15, 0.12], [0.12, 0.12, 0.09], [0.2, 0.18, 0.14]], variation: 0.25, lichen: 0.0, moss: 0.9, algae: 1.0, tooled: 0.4, splash: 1.0, streaks: 0.8, ...(opts.stoneWet || {}) }),
      // pale stone seen from far off (silhouette LOD): the stone-to-stone variation of a whole wall averages out
      stoneMaterial(ctx, { texture: 'pbr/acg_ground27', scale: 0.7, palette: [[0.48, 0.45, 0.39], [0.45, 0.42, 0.37], [0.5, 0.47, 0.4]], variation: 0.06, lichen: 0.2, moss: 0.2, tooled: 0.0, streaks: 0.9, ...(opts.stoneFar || {}) }),
      // cobbles / setts of a square: grey-brown, worn, moss in the joints, no splash band
      stoneMaterial(ctx, { texture: 'pbr/acg_ground28', scale: 0.8, palette: [[0.21, 0.195, 0.17], [0.14, 0.13, 0.115], [0.27, 0.235, 0.185]], variation: 0.38, lichen: 0.15, moss: 0.3, algae: 0.0, tooled: 0.1, splash: 0.0, streaks: 0.0, stain: 0.6, ...(opts.stoneSett || {}) }),
      // interiors: worn flagstone floors (no weather: no lichen, algae or splash)
      stoneMaterial(ctx, { texture: 'pbr/acg_ground27', scale: 0.7, palette: [[0.42, 0.39, 0.33], [0.36, 0.34, 0.29], [0.46, 0.42, 0.35]], variation: 0.2, lichen: 0.0, moss: 0.0, algae: 0.0, tooled: 0.75, splash: 0.0, streaks: 0.0, stain: 0.5, ...(opts.stoneFloor || {}) }),
      // harbour: pale quay stone with tide zones (the harbour kit's footing is 2.4 m below the
      // water: the tide line at +1.1 m is 3.5 m above it)
      stoneMaterial(ctx, { texture: 'pbr/acg_ground28', scale: 0.6, palette: [[0.45, 0.42, 0.36], [0.41, 0.385, 0.33], [0.48, 0.45, 0.38]], variation: 0.12, lichen: 0.35, moss: 0.25, algae: 0.6, tooled: 0.45, splash: 0.0, streaks: 0.9, stain: 0.8, tide: 3.5, ...(opts.stoneQuay || {}) }),
      // interiors: pale stone under old lime wash
      stoneMaterial(ctx, { texture: 'pbr/acg_ground27', scale: 0.7, palette: [[0.46, 0.43, 0.37], [0.4, 0.37, 0.32], [0.5, 0.46, 0.39]], variation: 0.15, lichen: 0.0, moss: 0.0, algae: 0.0, tooled: 0.4, splash: 0.25, streaks: 0.15, wash: 0.85, ...(opts.stoneWashed || {}) }),
    ]);
    const M = {
      stonePale, stoneGrey, stoneDressed, oak, oakDark, oakPeg, oakSilver, clay, slate, stoneSoot, stoneWet, stoneFar, stoneSett, stoneFloor, stoneWashed, stoneQuay,
      leather: plainMaterial('leather', [0.09, 0.05, 0.03], { roughness: 0.6, vary: 0.3, freq: 25, bump: 0.0008 }),
      mortar: await mortarMaterial(ctx, opts.mortar),
      mortarPale: await mortarMaterial(ctx, { color: [0.3, 0.285, 0.25], key: 'pale', ...(opts.mortarPale || {}) }),
      // interiors: joints filled and lime-washed over with the stones
      mortarWashed: await mortarMaterial(ctx, { color: [0.6, 0.58, 0.52], moss: 0, ao: 0.95, key: 'washed', ...(opts.mortarWashed || {}) }),
      plaster: plasterMaterial(ctx, opts.plaster),
      // indoor lime plaster: kept up, cleaner, warmer
      plasterInt: plasterMaterial(ctx, { age: 0.25, tints: [[0.6, 0.56, 0.48], [0.58, 0.54, 0.46], [0.62, 0.57, 0.48], [0.57, 0.54, 0.47], [0.6, 0.55, 0.46], [0.59, 0.56, 0.5]], ...(opts.plasterInt || {}) }),
      iron: ironMaterial(ctx, opts.iron),
      glass: glassMaterial(ctx, opts.glass),
      portal: portalMaterial(ctx, opts.portal),
      lead: plainMaterial('lead', [0.12, 0.12, 0.125], { roughness: 0.6, vary: 0.3 }),
      straw: plainMaterial('straw', [0.48, 0.36, 0.16], { roughness: 0.8, vary: 0.45, freq: 40, bump: 0.0005 }),
      strawBed: strawMaterial(ctx),
      bark: barkMaterial(ctx),
      linen: plainMaterial('linen', [0.62, 0.6, 0.55], { roughness: 0.92, vary: 0.14, freq: 30, bump: 0.0006, params: { side: THREE.DoubleSide } }),
      sootStain: sootMaterial(ctx),
      stain: stainMaterial(ctx),
      foam: foamMaterial(ctx),
      sacking: plainMaterial('sacking', [0.2, 0.155, 0.1], { roughness: 0.95, vary: 0.3, freq: 60, bump: 0.0008 }),
      clayware: plainMaterial('clayware', [0.3, 0.16, 0.08], { roughness: 0.7, vary: 0.2 }),
      // wet mud / dung caked on wheels, at wall feet
      mud: plainMaterial('mud', [0.075, 0.058, 0.04], { roughness: 0.75, vary: 0.35, freq: 30, bump: 0.0015 }),
      rope: plainMaterial('rope', [0.22, 0.18, 0.12], { roughness: 0.95, vary: 0.3, freq: 80, bump: 0.001 }),
      soot: plainMaterial('soot', [0.02, 0.018, 0.016], { roughness: 0.95 }),
      pool: poolMaterial(ctx),
      // the harbour's water: a long chop (no planar reflection of the quay: see README)
      sea: poolMaterial(ctx, { name: 'sea', chop: 6, color: [0.01, 0.018, 0.017] }),
      // standing rain water on a road or a square: silty, brown, a duller sheen
      puddle: poolMaterial(ctx, { name: 'puddle', chop: 0.4, color: [0.03, 0.024, 0.016], roughness: 0.06 }),
      wetMud: plainMaterial('wetMud', [0.048, 0.038, 0.027], { roughness: 0.3, vary: 0.45, freq: 14, bump: 0.002 }),
      jet: jetMaterial(ctx),
      water: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.012, 0.016, 0.016), roughness: 0.03, metalness: 0, transmission: 0, ior: 1.33 }),
    };
    M.water.name = 'arch:water';
    // walls must block the sun from both sides (thin mortar beds / plaster coats leak light otherwise)
    for (const k of ['mortar', 'mortarPale', 'mortarWashed', 'plaster', 'plasterInt']) if (M[k]) M[k].shadowSide = THREE.DoubleSide;
    // a lamp flame: unlit, bright (HDR), no shadow
    M.flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(9.0, 4.2, 1.1) });
    M.flame.name = 'arch:flame';
    M.flame.userData.noShadow = true;
    M.water.userData.noShadow = true;
    M.pool.userData.noShadow = true;
    M.sea.userData.noShadow = true;
    M.puddle.userData.noShadow = true;
    M.jet.userData.noShadow = true;
    M.glass.userData.noShadow = true;
    M.portal.userData.noShadow = true;
    return M;
  })();
  cache.set(key, p);
  return p;
}
