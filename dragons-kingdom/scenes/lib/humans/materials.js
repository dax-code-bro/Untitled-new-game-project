// Materials for the human system (scenes/lib/humans).
//
// All of them extend three.js' physically based materials through onBeforeCompile, so sun
// shadows, HDRI light and the cinematic stack's patches (GTAO, contact shadows, cascades)
// still apply. They never replace '#include <lights_fragment_begin>' or
// '#include <aomap_fragment>' (the cinematic patch hooks those); custom lighting goes in
// through a redefined RE_Direct.
//
//   skin  - photographic MakeHuman albedo (CC0) toned per character, procedural pores and fine
//           lines (object space, faded below pixel size), oily T-zone, lips, nails,
//           subsurface-style diffuse (colour-dependent wrap + softened normal for the red
//           channel), back-lit translucency where the flesh is thin (ears, nostrils,
//           fingers), baked per-vertex AO on the indirect light only
//   eye   - MakeHuman iris/sclera texture, wet cornea lobe (clearcoat whose normal bulges
//           over the iris along the gaze axis), lid-shadow AO, sclera slightly off-white
//   card  - brows, lashes, hair cards: alpha-hashed (the film finish's 8 jittered sub-frames
//           turn it into soft coverage), Kajiya-Kay style two-lobe hair highlight
//   cloth - woven fabric (photo normal maps from the asset library at real weave scale),
//           sheen, dye unevenness, wear at edges, dust toward the hem, baked AO
//   leather / metal / wood / props
import * as THREE from 'three';
import { libUrl } from '../assets.js';

const texCache = new Map();
/** Load a texture from assets-lib (cached). color: true -> sRGB. */
export function libTexture(rel, { color = true, repeat = false, flipY = true } = {}) {
  const key = `${rel}|${color}|${repeat}|${flipY}`;
  if (!texCache.has(key)) {
    const t = new THREE.TextureLoader().load(libUrl(rel));
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.flipY = flipY;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
export function libTextureAsync(rel, opts = {}) {
  const t = libTexture(rel, opts);
  if (t.image) return Promise.resolve(t);
  return new Promise((resolve, reject) => {
    const img = t.source?.data;
    if (img && img.complete) return resolve(t);
    new THREE.TextureLoader().load(libUrl(rel), (tt) => { t.image = tt.image; t.needsUpdate = true; resolve(t); }, undefined, reject);
  });
}

// ------------------------------------------------------------------ GLSL --
export const NOISE_GLSL = /* glsl */ `
float hH3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hN3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hH3(i), hH3(i + vec3(1,0,0)), f.x), mix(hH3(i + vec3(0,1,0)), hH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hH3(i + vec3(0,0,1)), hH3(i + vec3(1,0,1)), f.x), mix(hH3(i + vec3(0,1,1)), hH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float hFbm(vec3 p) { return hN3(p) * 0.55 + hN3(p * 2.07 + 3.1) * 0.28 + hN3(p * 4.13 + 7.7) * 0.17; }
// cellular (F1) distance in 3D, cell size 1
float hCell(vec3 p) {
  vec3 i = floor(p), f = fract(p); float d = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(hH3(i + g), hH3(i + g + 11.3), hH3(i + g + 27.1));
    vec3 r = g + o - f; d = min(d, dot(r, r));
  }
  return sqrt(d);
}
// perturb a view-space normal by the screen-space gradient of a height h (metres along the normal)
vec3 hBump(vec3 n, vec3 viewPos, float h, float facing) {
  vec3 dpx = dFdx(viewPos), dpy = dFdy(viewPos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1) * facing;
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - g);
}
`;

// =================================================================== SKIN ==
/**
 * opts: map (assets-lib path), tone [r,g,b] multiplier, saturation, redness, rough (0.45),
 *       oil (0..1 T-zone shine), pores (1), age (0..1: deeper lines), sss (1), seed
 */
export function skinMaterial(o = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: o.rough ?? 0.46, metalness: 0,
    ior: 1.4, specularIntensity: 0.9,
    sheen: 0.12, sheenRoughness: 0.4, sheenColor: new THREE.Color(0.55, 0.45, 0.4),
    clearcoat: o.oil ?? 0.12, clearcoatRoughness: 0.34,
    // double-sided: the gap between a rolled eyeball and the inner lid, or a sleeve's cuff,
    // looks into the head / arm - with back faces culled that showed the hair or the sky
    // through the skull (a black patch in the inner eye corner)
    side: THREE.DoubleSide,
  });
  if (o.map) mat.map = libTexture(o.map);
  const U = {
    uTone: { value: new THREE.Vector3(...(o.tone || [1, 1, 1])) },
    uSat: { value: o.saturation ?? 1.0 },
    uRed: { value: o.redness ?? 0.0 },
    uPores: { value: o.pores ?? 1.0 },
    uAge: { value: o.age ?? 0.3 },
    uSSS: { value: o.sss ?? 1.0 },
    uSeed: { value: (o.seed ?? 1) * 0.137 },
    uDirt: { value: o.dirt ?? 0.0 },
    uFlush: { value: o.flush ?? 0.5 },
    uLid: { value: o.lid ?? 0.5 },
    uScalp: { value: new THREE.Vector3(...(o.scalpColor || [0.05, 0.03, 0.02])) },
    uBeard: { value: new THREE.Vector3(...(o.beardColor || [0.04, 0.025, 0.015])) },
  };
  mat.userData.skin = U;
  mat.customProgramCacheKey = () => 'dk-human-skin';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float ao; attribute float thick; attribute vec4 aux; attribute vec4 aux2; attribute vec4 aux3; attribute vec3 albg;
varying vec3 vObjP; varying float vAO; varying float vThick; varying vec4 vAux; varying vec4 vAux2; varying vec4 vAux3; varying vec3 vAlbG;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vObjP = position; vAO = ao; vThick = thick; vAux = aux; vAux2 = aux2; vAux3 = aux3; vAlbG = albg;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${NOISE_GLSL}
uniform vec3 uTone, uScalp, uBeard; uniform float uSat, uRed, uPores, uAge, uSSS, uSeed, uDirt, uFlush, uLid;
varying vec3 vObjP; varying float vAO; varying float vThick; varying vec4 vAux; varying vec4 vAux2; varying vec4 vAux3; varying vec3 vAlbG;
vec3 skinSmoothN; float skinThin; vec3 skinTransCol;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // character tone on the photographic albedo (keeps its lips, cheeks, knuckles, freckles);
  // vAlbG (offline) takes the photo shoot's light and make-up out of the face at 1-5 cm
  vec3 c = diffuseColor.rgb * vAlbG * uTone;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(vec3(0.0), mix(vec3(l), c, uSat));
  // subtle mottling: blood flow / pigment variation at 1-3 cm, never repeating
  float m1 = hFbm(vObjP * 55.0 + uSeed) - 0.5, m2 = hFbm(vObjP * 160.0 + uSeed * 3.0) - 0.5;
  c *= 1.0 + vec3(0.085, -0.022, -0.035) * m1 * 2.0 + vec3(0.035, 0.04, 0.035) * m2;
  // sparse fine pigment speckle (1-2 mm) and tiny capillary flecks: photographed skin is never even
  { float sp = smoothstep(0.78, 0.97, hN3(vObjP * 650.0 + uSeed * 5.0));
    float cap = smoothstep(0.86, 0.99, hN3(vObjP * 1300.0 + 17.0));
    c *= 1.0 - vec3(0.1, 0.13, 0.14) * sp;
    c = mix(c, c * vec3(1.06, 0.9, 0.9), cap * 0.6); }
  c = mix(c, c * vec3(1.12, 0.92, 0.9), uRed * (0.5 + m1));
  // where blood shows (cheeks, nose tip, chin, ears) / thin cool skin under the eyes
  c = mix(c, c * vec3(1.1, 0.84, 0.84), vAux2.r * uFlush * (0.7 + 0.6 * m1));
  // periorbital skin (upper lid, crease, under-eye; aux2.b): the photo albedo carries make-up
  // there (reddish lid shadow, pale concealer under the eye). Replace its colour by plain skin
  // chroma at the same luminance, a touch darker and cooler (thin skin over the orbit).
  { float lumc = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 plain = lumc * vec3(1.17, 0.94, 0.8) * vec3(0.96, 0.95, 0.98) * 0.94;
    c = mix(c, plain, clamp(vAux2.b * 0.85, 0.0, 0.85)); }
  // lid margin: lash line and wet rim of the eye opening (dark, barely red)
  c = mix(c, c * vec3(0.62, 0.56, 0.55), vAux2.g * uLid);
  // lips (aux.r) a little deeper, nails (aux.g) paler
  c = mix(c, c * vec3(0.98, 0.7, 0.72), vAux.r * 0.75);
  // pores read in the colour too (a touch darker, shadowed openings) where they are resolved
  { float fwc = length(fwidth(vObjP));
    float fp = 1.0 - smoothstep(0.35, 1.0, fwc * 1600.0);
    float pc = hCell(vObjP * 1600.0 + uSeed);
    c *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.4, pc)) * fp * (1.0 - vAux.r) * (1.0 - vAux.a); }
  // fine mottling at 2-4 mm (the step between the 1-3 cm blotches and the pores)
  c *= 1.0 + 0.045 * (hN3(vObjP * 380.0 + uSeed * 7.0) - 0.5);
  // nails: a little paler and pinker than the finger (blood under the plate), never chalk white;
  // the cuticle at the nail's edge a touch darker
  c = mix(c, vec3(l) * vec3(1.1, 0.92, 0.9) + vec3(0.008, 0.005, 0.005), vAux.g * 0.45);
  c *= 1.0 - 0.12 * smoothstep(0.1, 0.35, vAux.g) * (1.0 - smoothstep(0.35, 0.6, vAux.g));
  // hands: redder knuckles and fingertips (blood close under thin skin), knuckle skin a little
  // darker in its folds (a single even pink read as a rubber glove)
  { float kn = vAux3.b, tip = vAux3.a;
    float fold = hN3(vObjP * vec3(1400.0, 1400.0, 1400.0) + 3.0);
    c *= mix(vec3(1.0), vec3(1.07, 0.9, 0.88), clamp(kn * 0.9 + tip * 0.8, 0.0, 1.0));
    c *= 1.0 - 0.12 * kn * smoothstep(0.55, 0.9, fold); }
  c *= mix(1.0, 0.82, uDirt * hN3(vObjP * 90.0));
  // scalp under the hair takes the hair colour (roots, density), aux.a
  // (a darkened, hair-tinted skin at partial coverage - a straight mix with the hair colour
  // reads as a grey band along the hairline)
  { float lc = dot(c, vec3(0.2126, 0.7152, 0.0722)), ls = max(1e-3, dot(uScalp, vec3(0.2126, 0.7152, 0.0722)));
    vec3 tinted = c * mix(vec3(1.0), uScalp / ls, 0.45) * mix(1.0, ls / max(lc, 1e-3), 0.3);
    c = mix(c, tinted, smoothstep(0.1, 0.8, vAux.a));
    c = mix(c, uScalp * (0.6 + 0.5 * hN3(vObjP * 900.0)), smoothstep(0.65, 1.0, vAux.a) * 0.96); }
  // stubble / shaved beard shadow (aux.b): fine dark dots in a soft tint
  { float dots = smoothstep(0.55, 0.9, hN3(vObjP * 2600.0 + 3.0));
    c = mix(c, c * mix(vec3(1.0), uBeard / max(0.02, dot(uBeard, vec3(0.333))) * 0.35, 0.6), vAux.b * (0.55 + 0.45 * dots)); }
  diffuseColor.rgb = c;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  float tz = hFbm(vObjP * 40.0 + 9.0);
  roughnessFactor = clamp(roughnessFactor * (0.8 + 0.35 * tz) - vAux.r * 0.2 - vAux.g * 0.05 + vAux.b * 0.15 + vAux.a * 0.35 - vAux2.g * 0.3 - vAux2.r * 0.04
                          - vAux3.r * 0.1 + (1.0 - vAux3.r) * 0.04 + vAux3.g * 0.05, 0.12, 0.95);
  // pores hold no oil film: the sheen breaks up into a fine stipple where they are resolved
  { float fwr = length(fwidth(vObjP));
    float fpr = 1.0 - smoothstep(0.35, 1.0, fwr * 1600.0);
    float pr = hCell(vObjP * 1600.0 + uSeed);
    roughnessFactor = min(0.95, roughnessFactor + 0.1 * (1.0 - smoothstep(0.0, 0.45, pr)) * fpr * (1.0 - vAux.r)); }
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
skinSmoothN = normal;
{
  // pores + fine lines, faded out where they would be smaller than ~1.5 pixels
  float fw = length(fwidth(vObjP));
  float poreScale = 1600.0;                       // ~0.6 mm cells
  float fadeP = 1.0 - smoothstep(0.5, 1.5, fw * poreScale);
  float fadeL = 1.0 - smoothstep(0.35, 1.0, fw * 420.0);
  float h = 0.0;
  if (fadeP > 0.0) {
    float c = hCell(vObjP * poreScale + uSeed);
    h -= (1.0 - smoothstep(0.0, 0.45, c)) * 0.00023 * fadeP * (1.0 - vAux.r) * (1.0 - 0.5 * vAux3.g);
    h += (hN3(vObjP * 3800.0) - 0.5) * 0.00003 * fadeP;
  }
  // lips (aux.r): fine vertical grooves (~1 mm apart, wavy), not a smooth plastic surface
  if (vAux.r > 0.01 && fadeP > 0.0) {
    float g = fract(vObjP.x * 950.0 + hN3(vObjP * 220.0) * 1.6);
    h -= pow(1.0 - abs(g - 0.5) * 2.0, 5.0) * 0.00007 * vAux.r * fadeP;
  }
  if (fadeL > 0.0) {
    // fine crossing lines (skin "texture"), deeper with age
    float a = hN3(vObjP * vec3(900.0, 250.0, 900.0) + 2.0), b = hN3(vObjP * vec3(250.0, 900.0, 600.0) + 5.0);
    h -= (pow(1.0 - abs(a - 0.5) * 2.0, 6.0) + pow(1.0 - abs(b - 0.5) * 2.0, 6.0)) * (0.00003 + 0.00006 * uAge) * fadeL;
  }
  h += (hFbm(vObjP * 260.0) - 0.5) * 0.00012;   // soft undulation (fat, tendons, skin folds)
  // knuckle skin: loose, folded (crossing creases), fingertip whorls are below pixel size
  if (vAux3.b > 0.01) {
    float k1 = hN3(vObjP * vec3(2200.0, 600.0, 2200.0) + 1.0), k2 = hN3(vObjP * vec3(600.0, 2200.0, 600.0) + 4.0);
    h -= (pow(1.0 - abs(k1 - 0.5) * 2.0, 5.0) + pow(1.0 - abs(k2 - 0.5) * 2.0, 5.0)) * 0.00012 * vAux3.b * fadeL;
  }
  h *= uPores * (1.0 - vAux.g);                  // nails stay smooth
  normal = hBump(normal, -vViewPosition, h, faceDirection);
  float thin = exp(-vThick / 0.006);   // ears, nostrils, eyelid rims - not the forehead
  skinThin = thin;
  skinTransCol = diffuseColor.rgb * vec3(1.0, 0.35, 0.22);
}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_SHEEN
  material.sheenColor *= 1.0 - vAux.a;
#endif
#ifdef USE_CLEARCOAT
  material.clearcoat *= 1.0 - vAux.a;
  // the oil film lives on the T-zone (an oily sheen on the neck and a waxy hotspot on the
  // cheekbones read as plastic); the lid margin is wet
  material.clearcoat *= 0.12 + 0.88 * vAux3.r;
  material.clearcoat = max(material.clearcoat, 0.9 * vAux2.g);
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.08, vAux2.g);
#endif
`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float aoV = clamp(vAO, 0.0, 1.0);
  aoV = mix(aoV, 1.0 - (1.0 - aoV) * 0.55, vAux3.g);   // curled fingers: the baked cavity AO went purple-black
  reflectedLight.indirectDiffuse *= mix(vec3(aoV), vec3(aoV) * vec3(1.0, 0.86, 0.82), 1.0 - aoV);
  reflectedLight.indirectSpecular *= aoV * aoV * (1.0 - 0.85 * vAux.a);
  reflectedLight.directSpecular *= 1.0 - 0.8 * vAux.a;
}`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
void RE_Direct_Skin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  // subsurface-style diffuse: colour-dependent wrap on a softened normal (red light travels
  // further under the skin), energy-normalised; specular on the detailed normal
  vec3 nS = normalize(mix(geometryNormal, skinSmoothN, 0.7));
  float ndl = dot(nS, directLight.direction);
  // (a wide red wrap leaks past the shadow map's terminator - normal bias - as hard-edged red
  // patches on the dark side of the face: keep it narrow)
  vec3 w = vec3(0.17, 0.065, 0.035) * uSSS;
  vec3 diff = clamp((vec3(ndl) + w) / (1.0 + w), 0.0, 1.0);
  diff = mix(diff, diff * diff * (3.0 - 2.0 * diff), 0.25);
  vec3 irr = diff * directLight.color;
  reflectedLight.directDiffuse += irr * BRDF_Lambert( material.diffuseColor );
  // translucency where the flesh is thin (ears, nostrils, fingers): light arriving from behind
  float back = clamp(dot(-geometryNormal, directLight.direction), 0.0, 1.0);
  reflectedLight.directDiffuse += directLight.color * skinTransCol * back * back * skinThin * 0.35 * uSSS;
  // specular (+ clearcoat oil layer + sheen) exactly as three's physical model
  float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
  vec3 irradiance = dotNL * directLight.color;
  #ifdef USE_CLEARCOAT
    float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
    vec3 ccIrradiance = dotNLcc * directLight.color;
    clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
  #endif
  #ifdef USE_SHEEN
    sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
  #endif
  reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Skin`);
  };
  return mat;
}

// ==================================================================== EYE ==
export function eyeMaterial(o = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.25, metalness: 0, ior: 1.376,
    clearcoat: 1.0, clearcoatRoughness: 0.02,
  });
  if (o.map) mat.map = libTexture(o.map);
  const U = { uIrisTint: { value: new THREE.Vector3(...(o.irisTint || [1, 1, 1])) }, uScleraTint: { value: new THREE.Vector3(...(o.scleraTint || [0.93, 0.87, 0.8])) } };
  mat.customProgramCacheKey = () => 'dk-human-eye';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float ao; attribute vec3 gaze; attribute float iris;
varying float vAO; varying vec3 vGaze; varying float vIris;`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
vec3 gz = gaze;
#ifdef USE_SKINNING
  gz = vec4( skinMatrix * vec4( gz, 0.0 ) ).xyz;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vAO = ao; vIris = iris; vGaze = normalize(normalMatrix * gz);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uIrisTint, uScleraTint;
varying float vAO; varying vec3 vGaze; varying float vIris;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // far from the iris the eye texture's atlas runs into its black background: a rolled eye
  // showed a black patch in the inner corner. Outside the limbus, dark texels become sclera.
  { float lt = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float far = smoothstep(1.15, 1.35, vIris) * (1.0 - smoothstep(0.25, 0.45, lt));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.74, 0.7), far); }
  float irisW = smoothstep(0.98, 0.9, vIris);           // vIris: angle from the gaze axis / limbus angle
  // irises in daylight read darker and less saturated than the texture (the cornea and the
  // iris' own depth): desaturate a little, then tint
  { float li = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(li), diffuseColor.rgb, 0.7), irisW); }
  diffuseColor.rgb *= mix(uScleraTint, uIrisTint, irisW);
  // sclera: warmer and a little pinker toward the corners (vessels), never paper white
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.86, 0.82), smoothstep(1.6, 2.6, vIris) * (1.0 - irisW));
  diffuseColor.rgb *= mix(1.0, 0.68, smoothstep(0.85, 1.0, vIris) * smoothstep(1.18, 1.0, vIris)); // limbal ring
}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
{
  // the wet cornea is the mirror; the sclera's tear film is thinner and the lids shade it
  float kc = smoothstep(1.2, 0.85, vIris);
  material.clearcoat *= mix(0.4, 1.0, kc);
  material.clearcoatRoughness = mix(0.12, 0.015, kc);
}`)
      .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
{
  // cornea: over the iris the wet surface is a smaller sphere bulging along the gaze axis
  float k = smoothstep(1.25, 0.6, vIris);
  clearcoatNormal = normalize(clearcoatNormal + vGaze * k * 0.55);
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float aoV = clamp(vAO, 0.0, 1.0);
  // the eye sits in a skin-coloured socket: its fill light is warm bounce, not just blue sky
  reflectedLight.indirectDiffuse *= aoV * vec3(1.22, 1.0, 0.86);
  reflectedLight.indirectSpecular *= mix(1.0, aoV * aoV, 0.85);
  reflectedLight.directDiffuse *= mix(1.0, aoV, 0.6);
}`);
  };
  return mat;
}

// =================================================================== CARDS ==
/** Alpha-textured hair cards / brows / lashes. o.map (RGBA), o.color tint, o.alphaFromRGB */
export function cardMaterial(o = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(...(o.color || [0.05, 0.035, 0.025])), roughness: o.rough ?? 0.7, metalness: 0, specularIntensity: 0.5,
    side: THREE.DoubleSide, alphaHash: true, sheen: 0.0,
  });
  if (o.map) mat.alphaMap = libTexture(o.map, { color: false });
  if (o.map && o.colorMap) { mat.map = libTexture(o.map); mat.color.setRGB(...(o.tint || [1, 1, 1])); }
  mat.userData.dkNoSSAO = false;
  // uLower: opacity of the LOWER lashes relative to the upper ones (attribute lw = 1 there): the
  // MakeHuman lash cards draw them as thick as the upper row, which reads as eyeliner
  const U = { uAlphaChannel: { value: o.alphaChannel ?? 3 }, uAlphaGain: { value: o.alphaGain ?? 1.0 }, uShift: { value: o.shift ?? 0.08 }, uLower: { value: o.lower ?? 0.4 } };
  mat.userData.card = U;
  mat.customProgramCacheKey = () => 'dk-human-card';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float ao; attribute float lw; varying float vAO; varying float vLw;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vAO = ao; vLw = lw;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uAlphaChannel, uAlphaGain, uShift, uLower; varying float vAO; varying float vLw;`)
      .replace('#include <alphamap_fragment>', `
#ifdef USE_ALPHAMAP
  vec4 am = texture2D( alphaMap, vAlphaMapUv );
  float a = uAlphaChannel > 2.5 ? am.a : am.g;
  diffuseColor.a *= clamp(smoothstep(0.08, 0.45, a) * uAlphaGain * mix(1.0, uLower, vLw), 0.0, 1.0);
#endif`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= vAO;
reflectedLight.directDiffuse *= mix(1.0, vAO, 0.5);`);
  };
  return mat;
}

// ================================================================= SIMPLE ==
export function simpleTexturedMaterial(o = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(...(o.color || [1, 1, 1])), roughness: o.rough ?? 0.5, metalness: 0, clearcoat: o.clearcoat ?? 0, clearcoatRoughness: 0.2 });
  if (o.map) mat.map = libTexture(o.map);
  mat.customProgramCacheKey = () => 'dk-human-simple';
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float ao; varying float vAO;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = ao;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAO;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= vAO; reflectedLight.directDiffuse *= mix(1.0, vAO, 0.75); reflectedLight.directSpecular *= vAO;');
  };
  return mat;
}
