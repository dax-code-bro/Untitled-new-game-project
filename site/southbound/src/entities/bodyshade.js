// People up close: skin, hair, eyes and cloth each lit the way they really behave.
//
// - Skin: light goes into it and comes out a little way off, red travelling furthest, so the edge
//   between light and shadow on a face is soft and warm instead of a hard grey line; thin parts
//   (ear rims, the outline of the face) glow red when the sun is behind them; the shine is two layers
//   (a tight oily one over a broad soft one); pores and fine creases show within a couple of metres.
// - Hair: a strand highlight that runs across the hair (Kajiya-Kay, two lobes: a white one and
//   a second, shifted one coloured by the hair itself), and light that passes through the edges.
// - Eyes: wet, sitting in their sockets (they don't glow with skylight they can't see).
// - Cloth: cotton and wool catch the light at grazing angles (a soft sheen on the folds and edges).
//
// All of it goes into three's own lighting (RE_Direct) behind #defines, so each kind only costs
// where it's used. On Phone none of it is switched on.
import * as THREE from 'three';

let level = 2; // 0 off (Phone), 1 the lighting only (Low), 2 everything
export function setBodyShadeQuality(q) { level = q.label === 'Phone' ? 0 : q.label === 'Low' ? 1 : 2; }
export const bodyShadeLevel = () => level;

const GLOBALS = /* glsl */ `
#ifdef SB_SKIN
float sbSkinK = 1.0;
#endif
#ifdef SB_HAIR
vec3 sbHairB = vec3(0.0, 1.0, 0.0);
#endif
#ifdef SB_SHEEN
float sbSheenK = 1.0;
#endif
#ifdef SB_SHEEN
float sbCharlie(float r, float nh) { float a = r * r, ia = 1.0 / a; float s2 = max(1.0 - nh * nh, 0.0078125); return (2.0 + ia) * pow(s2, ia * 0.5) / (2.0 * PI); }
#endif
`;

const DIRECT = /* glsl */ `
#if defined(SB_SKIN)
  {
    float sbNL = dot(geometryNormal, directLight.direction);
    // diffusion: per colour, the light wraps round the curve (red furthest)
    vec3 sbW = vec3(0.24, 0.075, 0.045) * sbSkinK;
    vec3 sbWrap = clamp((vec3(sbNL) + sbW) / (1.0 + sbW), 0.0, 1.0) / (1.0 + sbW * 0.25);
    reflectedLight.directDiffuse += sbWrap * directLight.color * BRDF_Lambert(material.diffuseColor);
    // two shine layers
    PhysicalMaterial sbM2 = material; sbM2.roughness = min(1.0, material.roughness * 1.75);
    PhysicalMaterial sbM1 = material; sbM1.roughness = max(0.2, material.roughness * 0.7);
    vec3 sbSpec = mix(BRDF_GGX(directLight.direction, geometryViewDir, geometryNormal, material),
      BRDF_GGX(directLight.direction, geometryViewDir, geometryNormal, sbM1) * 0.4 + BRDF_GGX(directLight.direction, geometryViewDir, geometryNormal, sbM2) * 0.6, sbSkinK);
    reflectedLight.directSpecular += irradiance * sbSpec;
    // sun behind them: light comes through round the edges (ear rims, the outline of the face), reddened
    float sbRim = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.0);
    float sbBack = pow(saturate(dot(geometryViewDir, -directLight.direction)), 3.0) * sbRim;
    reflectedLight.directDiffuse += sbBack * sbSkinK * 0.16 * vec3(1.0, 0.36, 0.22) * directLight.color * material.diffuseColor;
  }
#elif defined(SB_HAIR)
  {
    float sbNL = dot(geometryNormal, directLight.direction);
    float sbLit = saturate(sbNL * 0.65 + 0.35); // light gets in among the strands
    vec3 sbH = normalize(directLight.direction + geometryViewDir);
    vec3 sbT1 = normalize(sbHairB + geometryNormal * 0.1), sbT2 = normalize(sbHairB - geometryNormal * 0.16);
    float sbA = dot(sbT1, sbH), sbB = dot(sbT2, sbH);
    float sbS1 = pow(sqrt(max(0.0, 1.0 - sbA * sbA)), 110.0), sbS2 = pow(sqrt(max(0.0, 1.0 - sbB * sbB)), 24.0);
    vec3 sbTint = clamp(material.diffuseColor * 5.0 + 0.03, 0.0, 1.0);
    vec3 sbSpec = vec3(sbS1) * 0.022 + sbS2 * 0.035 * sbTint;
    float sbFace = smoothstep(-0.2, 0.3, sbNL);
    reflectedLight.directSpecular += sbSpec * sbFace * directLight.color;
    reflectedLight.directDiffuse += sbLit * directLight.color * BRDF_Lambert(material.diffuseColor);
    // the edge of the hair against the light
    float sbBack = pow(saturate(dot(geometryViewDir, -directLight.direction)), 6.0);
    reflectedLight.directDiffuse += sbBack * 0.2 * directLight.color * material.diffuseColor;
  }
#else
  reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
#endif
#ifdef SB_SHEEN
  {
    vec3 sbH = normalize(directLight.direction + geometryViewDir);
    float sbNV = saturate(dot(geometryNormal, geometryViewDir)), sbNLs = saturate(dot(geometryNormal, directLight.direction));
    float sbD = sbCharlie(0.55, saturate(dot(geometryNormal, sbH)));
    float sbV = saturate(1.0 / (4.0 * (sbNLs + sbNV - sbNLs * sbNV) + 1e-4));
    reflectedLight.directSpecular += irradiance * sbSheenK * sbD * sbV * mix(material.diffuseColor * 2.0, vec3(0.06), 0.35);
  }
#endif
`;

let patchedPars = null;
function parsChunk() {
  if (patchedPars) return patchedPars;
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const re = /reflectedLight\.directSpecular \+= irradiance \* BRDF_GGX\( directLight\.direction, geometryViewDir, geometryNormal, material \);\s*reflectedLight\.directDiffuse \+= irradiance \* BRDF_Lambert\( material\.diffuseColor \);/;
  if (!re.test(src)) { console.warn('bodyshade: three lighting chunk changed; people use plain lighting'); patchedPars = src; return src; }
  patchedPars = GLOBALS + src.replace(re, DIRECT);
  return patchedPars;
}

// pores and fine creases (object-space noise, as a bump), faded out past a couple of metres
const PORES = /* glsl */ `
float sbPh(vec3 p) { return fract(sin(dot(floor(p), vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float sbPn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sbPh(i), sbPh(i + vec3(1,0,0)), f.x), mix(sbPh(i + vec3(0,1,0)), sbPh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sbPh(i + vec3(0,0,1)), sbPh(i + vec3(1,0,1)), f.x), mix(sbPh(i + vec3(0,1,1)), sbPh(i + vec3(1,1,1)), f.x), f.y), f.z); }
void sbBump(inout vec3 n, float h, float k) {
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  n = normalize(abs(det) * n - g * k);
}
`;

// skin (and the bare-skin parts of a suit): called from the outfit material's onBeforeCompile
// (entities/clothing.js). `posVar` is an object-space position varying; `skinExpr` says where it's skin.
export function shadeSkin(sh, posVar, skinExpr) {
  if (level === 0) return;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + PORES)
    .replace('#include <lights_physical_pars_fragment>', parsChunk())
    .replace('#include <lights_fragment_begin>', `
  sbSkinK = ${skinExpr};
  ${level >= 2 ? `{
    // pores (~1.3 mm) and the skin's fine grain (~4 mm), each fading out once a pixel is too big to
    // show it (no branch: the bump needs screen derivatives)
    vec3 sbQ = ${posVar};
    float sbFp = length(fwidth(sbQ));
    float sbWp = 1.0 - smoothstep(0.0003, 0.0009, sbFp), sbWg = 1.0 - smoothstep(0.001, 0.003, sbFp);
    float sbH = sbPn(sbQ * 700.0) * 0.6 * sbWp + sbPn(sbQ * 230.0 + 3.1) * 0.4 * sbWg;
    sbBump(normal, sbH, 0.00035 * sbSkinK);
  }` : ''}
#include <lights_fragment_begin>`);
}

// cloth: the sheen at grazing angles (suits, shirts, trousers)
export function shadeCloth(sh, clothExpr = '1.0') {
  if (level === 0) return;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <lights_physical_pars_fragment>', parsChunk())
    .replace('#include <lights_fragment_begin>', `sbSheenK = ${clothExpr};\n#include <lights_fragment_begin>`);
}

// A person's own materials (shared by everyone wearing the same model; clones made for recolouring
// are new objects and get shaded again). The player's outfit materials go through shadeSkin and
// shadeCloth from entities/clothing.js instead.
const done = new WeakSet();
const chain = (m, fn, key) => {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = function (sh, r) { prev?.call(this, sh, r); fn(sh); };
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
};
export function shadePersonMaterial(m) {
  if (level === 0 || !m || done.has(m) || m.defines?.OF_SKIN !== undefined || m.defines?.OF_SUIT !== undefined) return;
  done.add(m);
  if (m.name === 'hair' || m.name === 'eyebrows') {
    m.defines = { ...(m.defines || {}), SB_HAIR: '' };
    m.roughness = 0.6;
    chain(m, (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <lights_physical_pars_fragment>', parsChunk())
        .replace('#include <lights_fragment_begin>', `
  #ifdef USE_MAP
  {
    // the strand direction: which way the texture's v runs across the surface
    vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition); vec2 st0 = dFdx(vMapUv), st1 = dFdy(vMapUv);
    vec3 b = cross(q1, normal) * st0.y + cross(normal, q0) * st1.y;
    float bl = length(b); if (bl > 1e-12) sbHairB = b / bl;
  }
  #endif
#include <lights_fragment_begin>`);
    }, 'sbhair');
  } else if (m.name === 'eyes') {
    // wet, and set back in the head: the sockets and lids shade most of the sky
    m.roughness = 0.03; m.envMapIntensity = 1.4;
    chain(m, (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse *= 0.5; reflectedLight.directDiffuse *= 0.82; reflectedLight.indirectSpecular *= 0.8;');
    }, 'sbeyes');
  } else if (m.name === 'skin') {
    m.defines = { ...(m.defines || {}), SB_SKIN: '' };
    chain(m, (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSbP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSbP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSbP;');
      shadeSkin(sh, 'vSbP', '1.0');
    }, 'sbskin');
  } else if (m.name === 'suit') {
    m.defines = { ...(m.defines || {}), SB_SHEEN: '' };
    chain(m, (sh) => shadeCloth(sh, '1.0'), 'sbsuit');
  }
}
export function shadePerson(root) {
  if (level === 0) return;
  root.traverse((o) => { if (!o.isMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) shadePersonMaterial(m); });
}
