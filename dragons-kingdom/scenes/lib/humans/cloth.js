// Garment, hair-strand and prop materials for the human system.
//
// cloth  - garments simulated offline (Blender cloth, offline/garments.py) carry UVs in METRES
//          of the flat pattern (u around, v down), so the photo weave maps from the asset
//          library (ambientCG linen / woven cloth, CC0) land at their real thread scale. On
//          top: dye unevenness, sun fading on the upper side, wear on edges and elbows
//          (aux.g), dust toward the hem (aux.r), wool/linen sheen, baked AO (ao attribute).
// hair   - strand ribbons (offline/hair.py): Kajiya-Kay two-lobe highlight along the strand
//          tangent (primary shifted to the root, secondary tinted and shifted to the tip),
//          per-strand colour variation, depth-in-the-groom darkening (aux), alpha-hashed tips.
// prop   - leather, iron/steel, wood, wicker, bread...: PBR maps from the library or flat.
import * as THREE from 'three';
import { libTexture, NOISE_GLSL } from './materials.js';

const FABRIC = {
  // lum: mean linear luminance of the photo albedo (measured), so the fibre variation is centred on 1
  linen: { id: 'pbr/acg_fabric36', base: 'Fabric36', tile: 0.12, sheen: 0.25, rough: 0.82, lum: 0.5 },
  wool: { id: 'pbr/acg_fabric37', base: 'Fabric37', tile: 0.18, sheen: 0.35, rough: 0.9, lum: 0.062 },
  twill: { id: 'pbr/acg_fabric40', base: 'Fabric40', tile: 0.15, sheen: 0.4, rough: 0.86, lum: 0.09 },
  felt: { id: 'pbr/acg_fabric37', base: 'Fabric37', tile: 0.5, sheen: 0.6, rough: 0.95, lum: 0.062 },
  silk: { id: 'pbr/acg_fabric40', base: 'Fabric40', tile: 0.06, sheen: 0.8, rough: 0.5, lum: 0.09 },
  // rmean: mean of the scan's roughness map (three multiplies it in): the material's roughness is
  // divided by it, so `rough` is the mean the surface really gets (boots read as wet rubber at 0.45)
  leather: { id: 'pbr/acg_leather05', base: 'Leather05', tile: 0.35, sheen: 0.0, rough: 0.72, rmean: 0.54, leather: true, lum: 0.031 },
  blackleather: { id: 'pbr/acg_leather26', base: 'Leather26', tile: 0.35, sheen: 0.0, rough: 0.62, rmean: 0.37, leather: true, lum: 0.0097 },
};

function sheenTint(c) {
  const m = Math.max(c[0], c[1], c[2], 1e-4);
  const k = Math.min(1.0, 0.55 / m);              // brighten to a saturated version of the dye
  return new THREE.Color(c[0] * k, c[1] * k, c[2] * k).lerp(new THREE.Color(0.5, 0.5, 0.5), 0.12);
}

export function clothMaterial(o = {}) {
  const f = FABRIC[o.fabric || 'wool'] || FABRIC.wool;
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(...(o.color || [0.3, 0.3, 0.3])), roughness: Math.min(1, (o.rough ?? f.rough) / (f.rmean || 1)), metalness: 0,
    // fibre sheen takes the dye colour (light scattered inside dyed fibres); a white sheen greys dark cloth
    sheen: o.sheen ?? f.sheen, sheenRoughness: 0.75, sheenColor: sheenTint(o.color || [0.3, 0.3, 0.3]),
    side: THREE.DoubleSide,
  });
  mat.normalMap = libTexture(`${f.id}/${f.base}_nrm.jpg`, { color: false, repeat: true, flipY: true });
  mat.normalScale = new THREE.Vector2(o.weave ?? 0.9, -(o.weave ?? 0.9));   // DirectX-convention maps
  mat.roughnessMap = libTexture(`${f.id}/${f.base}_rgh.jpg`, { color: false, repeat: true, flipY: true });
  const albedo = libTexture(`${f.id}/${f.base}_col.jpg`, { color: true, repeat: true, flipY: true });
  const U = {
    uTile: { value: 1 / (o.tile ?? f.tile) },
    uAlb: { value: albedo }, uAlbMix: { value: o.albedoMix ?? (f.leather ? 0.65 : 0.45) }, uLum: { value: f.lum },
    uWear: { value: o.wear ?? 0.4 }, uDust: { value: o.dust ?? 0.35 }, uFade: { value: o.fade ?? 0.25 },
    uSeed: { value: (o.seed ?? 1) * 0.37 },
    uDustCol: { value: new THREE.Vector3(...(o.dustColor || [0.2, 0.17, 0.13])) },
    uPattern: { value: o.pattern ?? 0 },     // 1 = quilted (gambeson), 2 = stripes
    uPatCol: { value: new THREE.Vector3(...(o.patternColor || [0, 0, 0])) },
    uLeather: { value: f.leather ? 1 : 0 },
  };
  mat.userData.cloth = U;
  mat.customProgramCacheKey = () => 'dk-human-cloth';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float ao; attribute vec4 aux; uniform float uTile;
varying float vAO; varying vec4 vAux; varying vec3 vObjP; varying vec2 vPat; varying vec3 vObjN;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_NORMALMAP
  vNormalMapUv = uv * uTile;
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv = uv * uTile;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vAO = ao; vAux = aux; vObjP = position; vPat = uv; vObjN = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${NOISE_GLSL}
uniform sampler2D uAlb; uniform float uLum; uniform float uAlbMix, uWear, uDust, uFade, uSeed, uTile, uPattern, uLeather; uniform vec3 uDustCol, uPatCol;
varying float vAO; varying vec4 vAux; varying vec3 vObjP; varying vec2 vPat; varying vec3 vObjN;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 base = diffuseColor.rgb;
  // photo fibre variation, normalised to its mean so the dye colour stays as specified
  vec3 a = texture2D(uAlb, vPat * uTile).rgb;
  float al = dot(a, vec3(0.2126, 0.7152, 0.0722));
  float fib = clamp(al / uLum, 0.25, 2.5);
  vec3 c = base * mix(1.0, fib, uAlbMix);
  // uneven dye and fading
  float n1 = hFbm(vObjP * 6.0 + uSeed), n2 = hFbm(vObjP * 23.0 + uSeed * 2.0);
  c *= 0.88 + 0.24 * n1;
  // sun fading bleaches toward a warm, paler tone (faded dye, not a neutral grey)
  c = mix(c, mix(c, vec3(dot(c, vec3(0.3333))) * vec3(1.26, 1.2, 1.08), 0.5), uFade * clamp(vObjN.y * 0.7 + 0.3, 0.0, 1.0) * (0.6 + 0.4 * n2));
  // quilting (gambeson): stitched diamond channels
  if (uPattern > 0.5 && uPattern < 1.5) {
    vec2 q = vPat * 18.0; float s = min(abs(fract(q.x + q.y) - 0.5), abs(fract(q.x - q.y) - 0.5));
    c *= mix(0.78, 1.0, smoothstep(0.0, 0.06, s));
  } else if (uPattern > 1.5) {
    float st = step(0.5, fract(vPat.x * 9.0));
    c = mix(c, uPatCol * (0.88 + 0.24 * n1), st * 0.85);
  }
  // wear (edges, elbows, knees) and dust toward the hem / on the lower body
  float wear = clamp(vAux.g * (0.6 + 0.8 * n2), 0.0, 1.0) * uWear;
  c = mix(c, mix(c, vec3(dot(c, vec3(0.3333))), 0.4) * 1.3, wear * (1.0 - uLeather));
  c = mix(c, c * 0.55, wear * uLeather * 0.6);
  float dust = clamp(vAux.r * (0.5 + n2), 0.0, 1.0) * uDust;
  c = mix(c, max(c, uDustCol * 0.8), dust * 0.35);
  diffuseColor.rgb = c;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uPattern > 0.5 && uPattern < 1.5) {
  vec2 q = vPat * 18.0; float s = min(abs(fract(q.x + q.y) - 0.5), abs(fract(q.x - q.y) - 0.5));
  normal = hBump(normal, -vViewPosition, smoothstep(0.0, 0.12, s) * 0.002, faceDirection);
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{ float aoV = clamp(vAO, 0.0, 1.0);
  reflectedLight.indirectDiffuse *= aoV; reflectedLight.indirectSpecular *= aoV * aoV;
  reflectedLight.directDiffuse *= mix(1.0, aoV, 0.35); }`);
  };
  return mat;
}

/** Hair strands: Kajiya-Kay style highlights along the strand tangent (attribute 'tangent3'). */
export function hairStrandMaterial(o = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(...(o.color || [0.05, 0.03, 0.02])), roughness: o.rough ?? 0.55, metalness: 0,
    side: THREE.DoubleSide, alphaHash: o.alphaHash !== false,
  });
  const U = { uSpec: { value: o.spec ?? 0.14 }, uShift: { value: o.shift ?? 0.12 }, uVar: { value: o.variation ?? 0.25 }, uTint: { value: new THREE.Vector3(...(o.tint || [1.0, 0.75, 0.55])) } };
  mat.userData.hair = U;
  mat.customProgramCacheKey = () => 'dk-human-hair';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float ao; attribute vec3 tangent3; attribute vec4 aux;
varying float vAO; varying vec3 vT; varying vec4 vAux; varying vec2 vHairUv;`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
vec3 tg = tangent3;
#ifdef USE_SKINNING
  tg = vec4( skinMatrix * vec4( tg, 0.0 ) ).xyz;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vAO = ao; vAux = aux; vT = normalize(normalMatrix * tg); vHairUv = uv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uSpec, uShift, uVar; uniform vec3 uTint;
varying float vAO; varying vec3 vT; varying vec4 vAux; varying vec2 vHairUv;
vec3 hairT; float hairSub, hairAlong;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
// per-strand colour (aux.r random, aux.g = along the strand 0 root..1 tip, aux.b = depth in the groom)
// each ribbon reads as several finer hairs: sub-strands across it with their own tone
{ float x = vHairUv.x * 4.0 + vAux.r * 13.0; float id = floor(x); float f = fract(x);
  float h = fract(sin(id * 12.9898 + vAux.r * 78.233) * 43758.5453);
  hairSub = h; hairAlong = vAux.g;
  diffuseColor.rgb *= (1.0 - uVar * 0.5 + uVar * vAux.r) * (0.82 + 0.36 * h) * mix(1.0, 1.15, vAux.g);
  diffuseColor.rgb *= mix(1.0, 0.72, smoothstep(0.35, 0.5, abs(f - 0.5)));
}
diffuseColor.rgb *= mix(1.0, 0.5, vAux.b);
#ifdef USE_ALPHAHASH
// thinning tips and soft ribbon edges: the film finish's jittered sub-frames resolve the
// alpha-hash into fine, semi-transparent strand edges instead of hard clumps
diffuseColor.a = (1.0 - smoothstep(0.75, 1.0, vAux.g) * 0.9) * (1.0 - smoothstep(0.3, 0.5, abs(vHairUv.x - 0.5)) * 0.55);
// roots fade in: a hairline is a density gradient, not the blunt dark ends of ribbons
// (over the first few % only: a pulled-back strand is 20-30 cm long, 10% of it bared the temples)
diffuseColor.a *= mix(0.45, 1.0, smoothstep(0.0, 0.03, vAux.g));
#endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
hairT = normalize(vT);
// shade a strand as a cylinder: the normal is the view vector made perpendicular to the strand
{ vec3 v = normalize(vViewPosition); vec3 nn = normalize(v - hairT * dot(v, hairT)); normal = normalize(mix(nn, normal, 0.35)); }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{ float aoV = clamp(vAO, 0.0, 1.0); reflectedLight.indirectDiffuse *= aoV;
  // sky reflection on hair is weak and takes the hair's colour (light scatters inside the fibre)
  vec3 htint = mix(vec3(1.0), diffuseColor.rgb / max(1e-4, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b))), 0.6);
  reflectedLight.indirectSpecular *= aoV * aoV * 0.12 * htint; reflectedLight.directDiffuse *= mix(1.0, aoV, 0.4); }`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
float hairKK(vec3 T, vec3 L, vec3 V, float shift, float ex) {
  vec3 H = normalize(L + V);
  vec3 Ts = normalize(T + shift * normalize(cross(cross(T, H), T) + 1e-5));
  float th = dot(Ts, H);
  return pow(max(0.0, sqrt(max(0.0, 1.0 - th * th))), ex);
}
void RE_Direct_Hair( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float ndl = dot(geometryNormal, directLight.direction);
  // diffuse wraps around the strand (light passes through thin hair)
  float d = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
  reflectedLight.directDiffuse += directLight.color * d * BRDF_Lambert( material.diffuseColor );
  float vis = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  // narrow lobes: broad ones lay a grey sheen over the whole front of a combed-back head
  float s1 = hairKK(hairT, directLight.direction, geometryViewDir, -uShift, 160.0);
  float s2 = hairKK(hairT, directLight.direction, geometryViewDir, uShift * 1.6, 32.0);
  vec3 hc = material.diffuseColor / max(1e-4, max(material.diffuseColor.r, max(material.diffuseColor.g, material.diffuseColor.b)));
  // primary: surface reflection (mostly white, a little of the fibre colour); secondary: through
  // the fibre (hair coloured); hairSub breaks the band up strand by strand
  // (a white primary at this strength reads as grey dust on brown hair: it takes more of the
  // fibre colour; the first part of each strand lies flat on the scalp and shines less)
  float rootK = mix(0.45, 1.0, smoothstep(0.0, 0.2, hairAlong));
  reflectedLight.directSpecular += directLight.color * vis * uSpec * rootK * (0.4 + 1.0 * hairSub) * (s1 * 0.24 * mix(vec3(1.0), hc, 0.7) + s2 * 0.3 * uTint * hc);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Hair`);
  };
  return mat;
}

// lum: mean linear luminance of the photo albedo (measured) - with an explicit o.color only its
// variation is used (the scan's own hue, e.g. Leather05's red, never tints the prop)
const PROP_PBR = {
  leather: { id: 'pbr/acg_leather05', base: 'Leather05', tile: 0.35, lum: 0.027, rmean: 0.54 },
  blackleather: { id: 'pbr/acg_leather26', base: 'Leather26', tile: 0.35, lum: 0.0055, rmean: 0.37 },
  iron: { id: 'pbr/acg_metal26', base: 'Metal26', tile: 0.4, metal: true, lum: 0.117 },
  wood: { id: 'pbr/acg_wood35', base: 'Wood35', tile: 0.6, lum: 0.074 },
  pine: { id: 'pbr/acg_planks21', base: 'Planks21', tile: 0.8, lum: 0.425 },
  linen: { id: 'pbr/acg_fabric36', base: 'Fabric36', tile: 0.12, lum: 0.5 },
};
/** Generic prop / accessory material. o.kind: leather | blackleather | iron | steel | brass | gold | wood | pine | wicker | bread | rope | flat */
export function propMaterial(o = {}) {
  const k = o.kind || 'flat';
  const p = PROP_PBR[k];
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(...(o.color || [0.5, 0.5, 0.5])), roughness: Math.min(1, (o.rough ?? 0.6) / ((p && p.rmean) || 1)), metalness: o.metal ?? 0, side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  let tile = 1, varAlb = null, varLum = 1;
  if (p) {
    tile = 1 / (o.tile ?? p.tile);
    mat.normalMap = libTexture(`${p.id}/${p.base}_nrm.jpg`, { color: false, repeat: true, flipY: true });
    mat.normalScale = new THREE.Vector2(1, -1);
    // (the forged-iron scan's roughness map is polished-metal low: kettle hats read as chrome -
    // iron keeps the given roughness, its variation comes from the normal map and the noise)
    if (!p.metal) mat.roughnessMap = libTexture(`${p.id}/${p.base}_rgh.jpg`, { color: false, repeat: true, flipY: true });
    if (o.useAlbedo !== false && !o.color) mat.map = libTexture(`${p.id}/${p.base}_col.jpg`, { color: true, repeat: true, flipY: true });
    else if (o.useAlbedo !== false) { varAlb = libTexture(`${p.id}/${p.base}_col.jpg`, { color: true, repeat: true, flipY: true }); varLum = p.lum; }
    if (p.metal) {
      mat.metalnessMap = libTexture(`${p.id}/${p.base}_met.jpg`, { color: false, repeat: true, flipY: true }); mat.metalness = 1;
      // working iron is oxidised and dull: at full strength the forged scan's hammer relief read as
      // crumpled foil and the bare metal colour as chrome against the sky (kettle hats, spear heads)
      mat.normalScale.set(0.35, -0.35);
      mat.color.multiplyScalar(o.oxide ?? 0.62);
    }
  } else if (k === 'wicker') {
    tile = 1 / (o.tile ?? 0.25);
    mat.map = libTexture('pbr/khr_wicker/wicker_basecolor.png', { repeat: true, flipY: false });
    mat.normalMap = libTexture('pbr/khr_wicker/wicker_normal.png', { color: false, repeat: true, flipY: false });
  } else if (k === 'steel') { mat.metalness = 1; mat.roughness = o.rough ?? 0.32; mat.color.setRGB(...(o.color || [0.55, 0.55, 0.56])); }
  else if (k === 'brass' || k === 'gold') { mat.metalness = 1; mat.roughness = o.rough ?? 0.3; mat.color.setRGB(...(o.color || (k === 'gold' ? [0.95, 0.72, 0.32] : [0.75, 0.55, 0.28]))); }
  const U = { uTile: { value: tile }, uSeed: { value: (o.seed ?? 1) * 0.29 }, uKind: { value: ['flat', 'bread', 'rope', 'apple'].indexOf(k) },
    uVarAlb: { value: varAlb }, uVarLum: { value: varLum }, uUseVar: { value: varAlb ? 1 : 0 } };
  mat.customProgramCacheKey = () => 'dk-human-prop';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ao; varying float vAO; varying vec3 vObjP; varying vec2 vPUv; uniform float uTile;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = uv * uTile;
#endif
#ifdef USE_NORMALMAP
  vNormalMapUv = uv * uTile;
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv = uv * uTile;
#endif
#ifdef USE_METALNESSMAP
  vMetalnessMapUv = uv * uTile;
#endif`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = ao; vObjP = position;\n#ifdef USE_NORMALMAP\nvPUv = uv * uTile;\n#else\nvPUv = vec2(0.0);\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\nvarying float vAO; varying vec3 vObjP; varying vec2 vPUv; uniform float uSeed, uKind, uVarLum, uUseVar; uniform sampler2D uVarAlb;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uUseVar > 0.5) { vec3 a = texture2D(uVarAlb, vPUv).rgb; diffuseColor.rgb *= clamp(dot(a, vec3(0.2126, 0.7152, 0.0722)) / uVarLum, 0.3, 2.2); }
{ float n = hFbm(vObjP * 30.0 + uSeed);
  diffuseColor.rgb *= 0.85 + 0.3 * n;
  if (uKind > 0.5 && uKind < 1.5) { diffuseColor.rgb *= mix(vec3(1.0), vec3(1.15, 0.95, 0.75), hN3(vObjP * 120.0)); } }`)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= vAO; reflectedLight.directDiffuse *= mix(1.0, vAO, 0.4);');
  };
  return mat;
}
