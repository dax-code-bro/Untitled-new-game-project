// Props library - materials. three.js MeshPhysicalMaterials (so the cinematic stack's AO,
// contact shadows, cascades and fast IBL patch them like every other lit material) with one
// shared shader patch that reads the prop attributes written by core.js:
//
//   uv (metres along the grain / rope / cloth), aPiece (per-piece random), aAO (baked
//   occlusion), aWear (worn arris; on cloth: the double layers of hems, seams and patches)
//
// and draws, on top of a CC0 photo scan used only as luminance/normal DETAIL (its colour is
// replaced by the material's own, so one scan serves tarred oak, silvered ash and fresh pine):
//   per-piece tone and texture offset (no two planks alike), macro blotches, worn arrises,
//   cavity occlusion, dirt toward the ground, a waterline (wet, darker, weed below it),
//   procedural relief (rope lay, throwing rings, wicker) through a derivative bump.
//
// Thin sheets (sails, bunting, banners, awnings, laundry) use clothMaterial(): the same, plus
// LIGHT THROUGH THE CLOTH - sun and sky light arriving on the far side is transmitted, tinted
// by the dye, and blocked twice where the cloth is doubled (seams, hems, patches show as darker
// bands against the light, as in a real backlit sail). A double-sided sheet normally shadows
// its own unlit face in three.js (the shadow lookup is pushed along the normal, through the
// sheet); the cloth material pushes it toward the light instead, so the far side's light is
// what the near side transmits.
//
//   const M = await propMaterials(ctx);             // shared standard set (cached per ctx)
//   M.wood.tar, M.wood.oak, M.iron, M.rope, M.linen ...
//   const sail = await clothMaterial(ctx, { color: [0.36, 0.3, 0.22], transmission: 0.35, seams: 0.6 });
import * as THREE from 'three';
import { loadPBR } from '../assets.js';

// ------------------------------------------------------------------ GLSL --
const NOISE = /* glsl */ `
float prH1(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
float prH2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float prH3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float prN2(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(prH2(i), prH2(i + vec2(1, 0)), f.x), mix(prH2(i + vec2(0, 1)), prH2(i + vec2(1, 1)), f.x), f.y); }
float prN3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(prH3(i), prH3(i + vec3(1,0,0)), f.x), mix(prH3(i + vec3(0,1,0)), prH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(prH3(i + vec3(0,0,1)), prH3(i + vec3(1,0,1)), f.x), mix(prH3(i + vec3(0,1,1)), prH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
const mat3 prRM = mat3(0.788, -0.494, 0.367, 0.535, 0.845, 0.0, -0.31, 0.194, 0.931);
float prF3(vec3 p) { p = prRM * p; return prN3(p) * 0.5 + prN3(p * 2.03 + 7.1) * 0.3 + prN3(p * 4.11 + 3.3) * 0.2; }
float prF2(vec2 p) { return prN2(p) * 0.5 + prN2(p * 2.03 + 7.1) * 0.3 + prN2(p * 4.11 + 3.3) * 0.2; }
// height -> perturbed normal (view space), Mikkelsen's surface-gradient bump
vec3 prBump(vec3 pos, vec3 n, float h) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}
`;

const VERT_DECL = /* glsl */ `
attribute float aPiece;
attribute float aAO;
attribute float aWear;
varying float vPrPiece; varying float vPrAO; varying float vPrWear;
varying vec2 vPrUv; varying vec3 vPrW; varying vec3 vPrO;
`;
const VERT_UV = /* glsl */ `
vPrUv = uv; vPrAO = aAO; vPrWear = aWear; vPrO = position; vPrPiece = aPiece;
#ifdef USE_INSTANCING
vPrPiece = fract(aPiece + instanceMatrix[3].x * 0.7317 + instanceMatrix[3].z * 0.3171 + instanceMatrix[3].y * 0.1131);
vPrO = position + instanceMatrix[3].xyz * 0.37;
#endif
`;
const VERT_WORLD = /* glsl */ `
{ vec4 prw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  prw = instanceMatrix * prw;
#endif
  vPrW = (modelMatrix * prw).xyz; }
`;

const FRAG_DECL = /* glsl */ `
varying float vPrPiece; varying float vPrAO; varying float vPrWear;
varying vec2 vPrUv; varying vec3 vPrW; varying vec3 vPrO;
uniform vec3 prC1, prC2, prMean, prWearC, prDirtC, prAlgaeC;
uniform vec2 prTile;
uniform float prDetail, prPieceVar, prMacro, prMacroF, prWear, prAOk, prRoughVar, prTexRough, prBumpK, prGrain;
uniform vec4 prDirt;      // y base, height, strength, -
uniform vec4 prWet;       // waterline y, splash band (m), weed band below (m), strength
uniform vec4 prPat;       // pattern params (rope lay / stripes / rings)
uniform vec3 prPatC;      // pattern colour (stripes)
uniform vec4 prSeam;      // cloth: seam spacing along u (m), seam width, spacing along v, width
float prTr = 0.0;         // cloth: transmission at this fragment
vec3 prTrC = vec3(0.0);   // cloth: transmitted colour
${NOISE}
`;

// the colour stage (replaces map_fragment): photo scan as detail on the material's own colours
const FRAG_COLOR = /* glsl */ `
float prP = vPrPiece;
vec2 prOff = vec2(prH1(prP * 91.7 + 0.3), prH1(prP * 37.3 + 1.7)) * 13.0;
vec2 prT = vPrUv / prTile + prOff;
#ifdef USE_MAP
vec3 prTex = texture2D(map, prT).rgb;
#else
vec3 prTex = prMean;
#endif
vec3 prDet = pow(max(prTex / prMean, vec3(0.0)), vec3(prDetail));
float prPv = prH1(prP * 13.13 + 0.71);
vec3 prCol = mix(prC1, prC2, prPv);
prCol *= 1.0 + prPieceVar * (prH1(prP * 7.77 + 3.1) - 0.5);
#ifdef PR_MACRO_UV
float prMac = prF2(vec2(vPrUv.x * prMacroF * 0.3, vPrUv.y * prMacroF * 3.0) + prP * 17.0);
#else
float prMac = prF3(vPrO * prMacroF + prP * 17.0);
#endif
prCol *= 1.0 + prMacro * (prMac - 0.5) * 2.0;
float prHgt = 0.0;
#ifdef PR_MACRO_UV
{
  // fine streaks along the grain (late wood / early wood), a few darker lines
  float gr = prN2(vec2(vPrUv.x * 2.2 + prP * 31.0, vPrUv.y * 140.0 + prP * 17.0)) * 0.65 + prN2(vec2(vPrUv.x * 6.0, vPrUv.y * 420.0)) * 0.35;
  prCol *= 1.0 + prGrain * (gr - 0.5) * 2.0;
}
#endif
#ifdef PR_ROPE
{
  // laid rope: three strands twisted right-handed; prPat.x = lay (m per turn), v = 0..1 round
  float s = fract(3.0 * vPrUv.y + vPrUv.x / prPat.x);
  float prof = 1.0 - pow(abs(2.0 * s - 1.0), 2.2);
  float fib = prN2(vec2(vPrUv.x * 340.0, s * 9.0 + floor(3.0 * vPrUv.y + vPrUv.x / prPat.x) * 7.0));
  prHgt = (prof * 0.0035 + fib * 0.0004) * prBumpK;
  prCol *= mix(0.45, 1.0, prof) * (0.85 + 0.3 * fib);
}
#endif
#ifdef PR_RINGS
{
  // thrown pottery: throwing rings along the profile (v, metres), finger marks
  float r = sin(vPrUv.y * 6.2832 / prPat.x + prN2(vPrUv * vec2(3.0, 1.0)) * 2.0);
  prHgt = r * prPat.y * prBumpK + prF2(vPrUv * 40.0) * 0.0002 * prBumpK;
  prCol *= 1.0 + 0.05 * r;
}
#endif
#ifdef PR_STRIPES
{
  float st = step(prPat.y, fract(vPrUv.x / prPat.x));
  prCol = mix(prCol, prPatC * (1.0 + prPieceVar * (prH1(prP * 7.77 + 3.1) - 0.5)), st);
}
#endif
vec3 prC = prCol * prDet;
// worn arrises: the coat / tar / patina rubbed off to paler wood or bright metal
float prWm = clamp(vPrWear * prWear * (0.55 + 0.9 * prN2(vPrUv * 31.0 + prP * 5.0)), 0.0, 1.0);
prC = mix(prC, prWearC * prDet * (0.85 + 0.3 * prN2(vPrUv * 57.0)), prWm);
// cavities
prC *= mix(1.0, vPrAO, prAOk);
// dirt and damp toward the ground
float prDirtM = prDirt.z * (1.0 - smoothstep(prDirt.x, prDirt.x + prDirt.y * (0.6 + 0.8 * prN2(vPrW.xz * 4.0 + vPrW.y)), vPrW.y));
prC = mix(prC, prC * prDirtC, clamp(prDirtM, 0.0, 1.0));
// waterline: wet and dark above it in a splash band, weed and slime below it
float prUnder = 1.0 - smoothstep(prWet.x - 0.015, prWet.x + 0.015, vPrW.y);
float prSplash = 1.0 - smoothstep(prWet.x, prWet.x + prWet.y * (0.5 + prN2(vPrW.xz * 3.0 + 1.3)), vPrW.y);
float prWetM = prWet.w * max(prSplash, prUnder);
prC *= mix(1.0, 0.6, prWetM);
float prWeed = prWet.w * prUnder * smoothstep(0.25, 0.75, prN2(vPrW.xz * 9.0 + vPrW.y * 4.0) + 0.35 * smoothstep(prWet.x - prWet.z, prWet.x, vPrW.y));
prC = mix(prC, prAlgaeC * prDet, clamp(prWeed, 0.0, 0.85));
`;

const FRAG_ROUGH = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
roughnessFactor *= mix(1.0, texture2D(roughnessMap, prT).g * 1.25, prTexRough);
#endif
roughnessFactor *= 1.0 + prRoughVar * (prPv - 0.5) * 2.0 + prRoughVar * (prMac - 0.5);
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.7, prWm * 0.5);
roughnessFactor = mix(roughnessFactor, 0.22, clamp(prWetM, 0.0, 1.0));
roughnessFactor = clamp(roughnessFactor, 0.04, 1.0);
`;

// cloth: light through the sheet (direct lights through RE_Direct, sky through the back side)
const CLOTH_DECL = /* glsl */ `
uniform float prTrans, prTransFwd;
void RE_Direct_PrCloth( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float back = saturate( - dot( geometryNormal, directLight.direction ) );
  // diffuse transmission (wool and linen scatter what they let through) plus a forward lobe when
  // the eye looks toward the light through the cloth
  float fwd = pow( saturate( dot( - geometryViewDir, directLight.direction ) ), 8.0 ) * prTransFwd;
  reflectedLight.directDiffuse += directLight.color * prTrC * prTr * back * ( RECIPROCAL_PI + fwd );
}
#undef RE_Direct
#define RE_Direct RE_Direct_PrCloth
`;
const CLOTH_COLOR = /* glsl */ `
{
  // doubled cloth (hems, seams, patches: aWear) blocks the light twice; the weave lets a little
  // more through between the threads; stains and grime block more
  float dbl = clamp(vPrWear, 0.0, 1.0);
  // seams: the cloths (bolts ~0.6 m wide) sewn edge over edge - doubled, a low ridge, two rows of
  // stitches; each bolt woven and fulled in its own batch: its own tone
  for (int k = 0; k < 2; k++) {
    float sp = k == 0 ? prSeam.x : prSeam.z;
    if (sp <= 0.0) continue;
    float wd = k == 0 ? prSeam.y : prSeam.w;
    float x = k == 0 ? vPrUv.x : vPrUv.y, y = k == 0 ? vPrUv.y : vPrUv.x;
    float f = x / sp;
    float d = abs(f - floor(f + 0.5)) * sp;
    float aa = fwidth(x) * 1.2 + 1e-5;
    float sm = 1.0 - smoothstep(wd * 0.5, wd * 0.5 + aa, d);
    dbl = max(dbl, sm);
    prHgt += sm * 0.0012;
    float st = (1.0 - smoothstep(0.0012, 0.0012 + aa, abs(d - wd * 0.36))) * step(0.45, fract(y / 0.008 + floor(f + 0.5) * 0.37));
    prC *= 1.0 - 0.35 * st * (1.0 - smoothstep(0.001, 0.004, aa));
    prC *= 0.93 + 0.14 * prH1(floor(f) * 3.71 + float(k) * 9.1 + 0.5);
  }
  float weave = prTex.r / max(prMean.r, 1e-3);
  prTr = prTrans * mix(1.0, prTrans * 1.5, dbl) * clamp(1.6 - 0.6 * weave, 0.6, 1.4);
  prTr *= mix(1.0, 0.6, clamp(prDirtM + prWm, 0.0, 1.0));
  // what comes through is the dye, deepened (light crosses the coloured fibres)
  vec3 prCv = prC;
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  prCv *= vColor.rgb;
#endif
  prTrC = pow(max(prCv, vec3(1e-4)), vec3(1.25)) * 2.2;
}
`;
const CLOTH_BACKSKY = /* glsl */ `
#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
{
  #if defined( DK_FASTIBL )
  vec3 prBackIrr = dkFastIBLIrradiance( - geometryNormal );
  #else
  vec3 prBackIrr = getIBLIrradiance( - geometryNormal );
  #endif
  reflectedLight.indirectDiffuse += prBackIrr * prTrC * prTr * RECIPROCAL_PI;
}
#endif
`;
// shadow lookups pushed toward the light (not along the normal, which goes through a thin sheet)
const SHADOW_FIX_FROM = 'shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );';
const SHADOW_FIX_TO = `{ vec3 prG = vec3( directionalShadowMatrix[ i ][ 0 ][ 2 ], directionalShadowMatrix[ i ][ 1 ][ 2 ], directionalShadowMatrix[ i ][ 2 ][ 2 ] );
  vec3 prSN = dot( shadowWorldNormal, prG ) > 0.0 ? - shadowWorldNormal : shadowWorldNormal;
  shadowWorldPosition = worldPosition + vec4( prSN * directionalLightShadows[ i ].shadowNormalBias, 0 ); }`;

// ------------------------------------------------------------- factory --
const texMean = new WeakMap();
/** Mean colour (linear) of a loaded albedo texture (drawn small on a canvas). */
function meanColor(tex) {
  if (!tex || !tex.image) return [0.5, 0.5, 0.5];
  const src = tex.source || tex.image;
  if (texMean.has(src)) return texMean.get(src);
  let out = [0.5, 0.5, 0.5];
  try {
    const c = new OffscreenCanvas(32, 32);
    const g = c.getContext('2d');
    g.drawImage(tex.image, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    const s = [0, 0, 0];
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += lin(d[i + k]);
    out = s.map((v) => Math.max(1e-3, v / (d.length / 4)));
  } catch (e) { /* keep grey */ }
  texMean.set(src, out);
  return out;
}

const texSets = new Map();
async function scan(ctx, id) {
  if (!id) return null;
  if (!texSets.has(id)) texSets.set(id, loadPBR(id, ctx, { repeat: 1, anisotropy: 16 }));
  return texSets.get(id);
}

let matSerial = 0;
/**
 * A prop surface. o: {
 *   scan: 'pbr/acg_wood35' (detail texture set) | null, tile: [u, v] metres per texture repeat,
 *   color: [r,g,b] linear, color2 (per-piece alternative), pieceVar (0.25), macro (0.12), macroF (2.5 /m),
 *   detail (1: photo luminance contrast), normalScale (1), roughness (0.8), roughVar (0.15),
 *   texRough (1: how much the scan's roughness map counts), metalness (0),
 *   wear (0.6), wearColor, ao (0.6: baked cavity strength), dirt: { y, h, k, color }, wet: { y, band, weed, k },
 *   algae ([r,g,b]), rope: lay (m), rings: { period, depth }, stripes: { period, duty, color },
 *   bump (1), cloth: { transmission, forward } (thin translucent sheet), side, sheen, physical extras }
 */
export async function surface(ctx, o = {}) {
  const set = await scan(ctx, o.scan === undefined ? 'pbr/acg_wood35' : o.scan);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: o.roughness ?? 0.8, metalness: o.metalness ?? 0,
    side: o.side ?? (o.cloth ? THREE.DoubleSide : THREE.FrontSide),
  });
  if (o.sheen) { mat.sheen = o.sheen; mat.sheenRoughness = o.sheenRoughness ?? 0.6; mat.sheenColor = new THREE.Color(...(o.sheenColor || [1, 1, 1])); }
  if (o.clearcoat) { mat.clearcoat = o.clearcoat; mat.clearcoatRoughness = o.clearcoatRoughness ?? 0.4; }
  if (o.vertexColors) mat.vertexColors = true;
  if (set) {
    if (set.map) mat.map = set.map;
    if (set.normalMap) { mat.normalMap = set.normalMap; const s = o.normalScale ?? 1; mat.normalScale.set(s, set.normalScale.y < 0 ? -s : s); }
    if (set.roughnessMap) mat.roughnessMap = set.roughnessMap;
  }
  const mean = set && set.map ? meanColor(set.map) : [0.5, 0.5, 0.5];
  const C = (v, d) => new THREE.Color(...(v || d));
  const dirt = o.dirt || {}, wet = o.wet || {};
  const U = {
    prC1: { value: C(o.color, [0.3, 0.22, 0.15]) },
    prC2: { value: C(o.color2 || o.color, [0.3, 0.22, 0.15]) },
    prMean: { value: new THREE.Vector3(...mean) },
    prWearC: { value: C(o.wearColor, [0.45, 0.38, 0.3]) },
    prDirtC: { value: C(dirt.color, [0.55, 0.5, 0.44]) },
    prAlgaeC: { value: C(o.algae, [0.06, 0.07, 0.03]) },
    prTile: { value: new THREE.Vector2(...(o.tile || [1, 1])) },
    prDetail: { value: o.detail ?? 1 },
    prPieceVar: { value: o.pieceVar ?? 0.25 },
    prMacro: { value: o.macro ?? 0.12 },
    prMacroF: { value: o.macroF ?? 2.5 },
    prWear: { value: o.wear ?? 0.6 },
    prAOk: { value: o.ao ?? 0.6 },
    prRoughVar: { value: o.roughVar ?? 0.15 },
    prTexRough: { value: o.texRough ?? 1 },
    prBumpK: { value: o.bump ?? 1 },
    prGrain: { value: o.grain ?? 0.18 },
    prDirt: { value: new THREE.Vector4(dirt.y ?? -100, dirt.h ?? 0.3, dirt.k ?? 0, 0) },
    prWet: { value: new THREE.Vector4(wet.y ?? -1e4, wet.band ?? 0.3, wet.weed ?? 0.3, wet.k ?? 0) },
    prPat: { value: new THREE.Vector4(o.rope ?? (o.rings?.period ?? o.stripes?.period ?? 1), o.rings?.depth ?? o.stripes?.duty ?? 0.5, 0, 0) },
    prPatC: { value: C(o.stripes?.color, [0.5, 0.5, 0.5]) },
    prTrans: { value: o.cloth?.transmission ?? 0 },
    prTransFwd: { value: o.cloth?.forward ?? 1.5 },
    prSeam: { value: new THREE.Vector4(o.seams?.u ?? 0, o.seams?.w ?? 0.03, o.seams?.v ?? 0, o.seams?.vw ?? 0.03) },
  };
  const defines = {};
  if (o.rope) defines.PR_ROPE = 1;
  if (o.rings) defines.PR_RINGS = 1;
  if (o.stripes) defines.PR_STRIPES = 1;
  if (o.cloth) defines.PR_CLOTH = 1;
  if (o.rope || o.rings || o.cloth) defines.PR_BUMP = 1;
  if (o.macroUV) defines.PR_MACRO_UV = 1;
  mat.defines = { ...(mat.defines || {}), ...defines };
  const key = 'dk-prop-' + Object.keys(defines).sort().join('-') + (o.vertexColors ? '-vc' : '');
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    let vs = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + VERT_UV)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_WORLD);
    if (o.cloth) {
      const chunk = THREE.ShaderChunk.shadowmap_vertex;
      if (!chunk.includes(SHADOW_FIX_FROM)) throw new Error('props: three.js shadowmap_vertex changed - cannot patch the cloth shadow lookup');
      vs = vs.replace('#include <shadowmap_vertex>', chunk.replace(SHADOW_FIX_FROM, SHADOW_FIX_TO));
    }
    sh.vertexShader = vs;
    let fs = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <map_fragment>', FRAG_COLOR + (o.cloth ? CLOTH_COLOR : '') + '\ndiffuseColor.rgb *= prC;\n')
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(/vNormalMapUv/g, 'prT') + '\n#ifdef PR_BUMP\nnormal = prBump(-vViewPosition, normal, prHgt);\n#endif\n')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= mix(1.0, vPrAO, 0.7);\n');
    if (o.cloth) {
      fs = fs.replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + CLOTH_DECL)
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + CLOTH_BACKSKY);
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  mat.name = o.name || `prop-${++matSerial}`;
  mat.userData.prop = U;
  return mat;
}

/** A thin translucent sheet (see surface(); o.cloth defaults filled in). */
export function clothMaterial(ctx, o = {}) {
  return surface(ctx, {
    scan: o.scan ?? 'pbr/acg_fabric36', tile: o.tile ?? [0.5, 0.5], detail: o.detail ?? 0.6,
    roughness: o.roughness ?? 0.92, roughVar: 0.06, pieceVar: o.pieceVar ?? 0.08, macro: o.macro ?? 0.08, macroF: o.macroF ?? 0.8,
    wear: o.wear ?? 0, ao: o.ao ?? 0.5, normalScale: o.normalScale ?? 0.6,
    // (the sheen of dyed cloth is its fibre colour, a little paler - a white sheen reads as plastic)
    sheen: o.sheen ?? 0.2, sheenRoughness: 0.6, sheenColor: o.sheenColor ?? (o.color ? o.color.map((c) => Math.min(1, c * 0.75 + 0.12)) : [0.7, 0.68, 0.62]),
    cloth: { transmission: o.transmission ?? 0.3, forward: o.forward ?? 1.5 },
    ...o,
  });
}

// ------------------------------------------------------------ standard set --
const sets = new WeakMap();
/**
 * The shared props palette (one instance per ctx). Colours are linear.
 *   wood: tar (pine-tarred hull planks), oak (seasoned oak, brown), silver (weathered grey),
 *         pale (fresh-cut ash / pine), dark (old dark oak, furniture), stave (barrel oak),
 *         spar (masts, yards: oiled pine), withy (willow rods: baskets, hoops), hull (tarred,
 *         with a waterline at y = 0)
 *   iron, ironDark, rope, ropeTar, linen, wool, hessian, straw, clay, clayGlaze, clayDark,
 *   leather, horn, wax
 */
export async function propMaterials(ctx) {
  if (sets.has(ctx)) return sets.get(ctx);
  const p = (async () => {
    const W = (o) => surface(ctx, { scan: 'pbr/acg_wood35', tile: [0.9, 0.25], detail: 0.55, macroUV: true, macro: 0.12, macroF: 2.0, grain: 0.2, ...o });
    const [tar, oak, silver, pale, dark, stave, spar, withy, hull] = await Promise.all([
      W({ name: 'wood-tar', color: [0.07, 0.045, 0.028], color2: [0.09, 0.06, 0.035], roughness: 0.55, roughVar: 0.35, wear: 0.9, wearColor: [0.2, 0.14, 0.09], pieceVar: 0.4, detail: 0.6, macro: 0.1 }),
      W({ name: 'wood-oak', color: [0.2, 0.13, 0.075], color2: [0.25, 0.17, 0.1], roughness: 0.78, wear: 0.7, wearColor: [0.34, 0.25, 0.16] }),
      W({ name: 'wood-silver', color: [0.2, 0.18, 0.155], color2: [0.17, 0.145, 0.115], roughness: 0.85, wear: 0.5, wearColor: [0.3, 0.27, 0.23], pieceVar: 0.3, macro: 0.07, grain: 0.28 }),
      W({ name: 'wood-pale', color: [0.42, 0.32, 0.2], color2: [0.36, 0.26, 0.15], roughness: 0.75, wear: 0.4, wearColor: [0.5, 0.4, 0.27] }),
      W({ name: 'wood-dark', color: [0.09, 0.055, 0.032], color2: [0.12, 0.075, 0.04], roughness: 0.6, wear: 0.8, wearColor: [0.22, 0.15, 0.09] }),
      W({ name: 'wood-stave', color: [0.17, 0.11, 0.065], color2: [0.23, 0.155, 0.09], roughness: 0.72, wear: 0.8, wearColor: [0.32, 0.23, 0.15], pieceVar: 0.4, tile: [0.7, 0.18] }),
      W({ name: 'wood-spar', color: [0.24, 0.16, 0.09], color2: [0.2, 0.13, 0.075], roughness: 0.6, wear: 0.5, wearColor: [0.33, 0.24, 0.15], tile: [1.4, 0.3] }),
      W({ name: 'wood-withy', color: [0.26, 0.17, 0.09], color2: [0.2, 0.12, 0.06], roughness: 0.55, wear: 0.0, pieceVar: 0.45, tile: [0.6, 0.05], detail: 0.5, macro: 0.05 }),
      W({ name: 'wood-hull', color: [0.055, 0.038, 0.025], color2: [0.085, 0.056, 0.034], roughness: 0.5, roughVar: 0.4, wear: 1.0, wearColor: [0.17, 0.12, 0.08], pieceVar: 0.45, detail: 0.6, macro: 0.1, wet: { y: 0.0, band: 0.35, weed: 0.4, k: 1 }, algae: [0.035, 0.045, 0.018] }),
    ]);
    const iron = await surface(ctx, { name: 'iron', scan: 'pbr/acg_metal26', tile: [0.35, 0.35], detail: 0.45, color: [0.045, 0.036, 0.03], color2: [0.07, 0.045, 0.028], metalness: 0.3, roughness: 0.7, roughVar: 0.3, wear: 0.6, wearColor: [0.1, 0.095, 0.09], pieceVar: 0.4 });
    const ironDark = await surface(ctx, { name: 'iron-dark', scan: 'pbr/acg_metal26', tile: [0.35, 0.35], detail: 0.25, color: [0.03, 0.028, 0.026], metalness: 0.4, roughness: 0.55, wear: 0.6, wearColor: [0.12, 0.11, 0.1] });
    const R = (o) => surface(ctx, { scan: 'pbr/acg_fabric36', tile: [0.15, 0.15], detail: 0.3, normalScale: 0.4, roughness: 0.88, roughVar: 0.1, wear: 0, pieceVar: 0.15, macro: 0.1, macroF: 3, rope: 0.06, ...o });
    const rope = await R({ name: 'rope', color: [0.3, 0.23, 0.14], color2: [0.26, 0.2, 0.12] });
    const ropeTar = await R({ name: 'rope-tar', color: [0.07, 0.055, 0.04], color2: [0.09, 0.07, 0.05], roughness: 0.65 });
    const linen = await clothMaterial(ctx, { name: 'linen', color: [0.58, 0.53, 0.44], color2: [0.62, 0.58, 0.5], transmission: 0.35 });
    const wool = await clothMaterial(ctx, { name: 'wool', scan: 'pbr/acg_fabric37', tile: [0.35, 0.35], color: [0.33, 0.28, 0.21], color2: [0.29, 0.25, 0.19], transmission: 0.22, roughness: 0.95 });
    const hessian = await surface(ctx, { name: 'hessian', scan: 'pbr/acg_fabric40', tile: [0.09, 0.09], detail: 0.7, normalScale: 1.6, color: [0.3, 0.2, 0.095], color2: [0.26, 0.175, 0.085], roughness: 0.95, pieceVar: 0.2, macro: 0.15, macroF: 4, wear: 0.3, wearColor: [0.4, 0.33, 0.22], sheen: 0.3, sheenColor: [0.6, 0.48, 0.3], dirt: { y: 0, h: 0.12, k: 0.4, color: [0.7, 0.62, 0.5] } });
    const straw = await surface(ctx, { name: 'straw', scan: null, color: [0.5, 0.38, 0.17], color2: [0.42, 0.33, 0.17], roughness: 0.42, roughVar: 0.4, pieceVar: 0.55, macro: 0.1, macroF: 8, wear: 0, ao: 0.85, cloth: { transmission: 0.25, forward: 1.0 }, side: THREE.DoubleSide });
    const clay = await surface(ctx, { name: 'clay', scan: 'pbr/acg_ground03', tile: [0.4, 0.4], detail: 0.35, normalScale: 0.25, color: [0.32, 0.15, 0.075], color2: [0.36, 0.19, 0.1], roughness: 0.82, pieceVar: 0.25, macro: 0.15, macroF: 6, wear: 0.5, wearColor: [0.25, 0.13, 0.08], rings: { period: 0.009, depth: 0.0004 } });
    const clayGlaze = await surface(ctx, { name: 'clay-glaze', scan: 'pbr/acg_ground03', tile: [0.4, 0.4], detail: 0.2, normalScale: 0.1, color: [0.13, 0.065, 0.015], color2: [0.045, 0.055, 0.014], roughness: 0.22, roughVar: 0.3, pieceVar: 0.4, macro: 0.25, macroF: 5, wear: 0.6, wearColor: [0.3, 0.15, 0.08], rings: { period: 0.009, depth: 0.0003 }, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    const clayDark = await surface(ctx, { name: 'clay-dark', scan: 'pbr/acg_ground03', tile: [0.4, 0.4], detail: 0.3, normalScale: 0.2, color: [0.07, 0.055, 0.045], color2: [0.09, 0.07, 0.05], roughness: 0.55, roughVar: 0.3, wear: 0.6, wearColor: [0.2, 0.12, 0.07], rings: { period: 0.009, depth: 0.0003 } });
    const leather = await surface(ctx, { name: 'leather', scan: 'pbr/acg_leather26', tile: [0.3, 0.3], detail: 0.5, color: [0.12, 0.065, 0.035], color2: [0.15, 0.085, 0.045], roughness: 0.55, roughVar: 0.3, wear: 0.8, wearColor: [0.24, 0.15, 0.09] });
    const wax = await surface(ctx, { name: 'wax', scan: null, color: [0.62, 0.55, 0.38], roughness: 0.35, wear: 0, pieceVar: 0.1, cloth: { transmission: 0.5, forward: 0.6 } });
    return { wood: { tar, oak, silver, pale, dark, stave, spar, withy, hull }, iron, ironDark, rope, ropeTar, linen, wool, hessian, straw, clay, clayGlaze, clayDark, leather, wax };
  })();
  sets.set(ctx, p);
  return p;
}

/** Paint a per-vertex colour (linear) from fn(x, y, z, i) -> [r, g, b]; the material needs vertexColors. */
export function paint(g, fn) {
  const P = g.attributes.position, c = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) c.set(fn(P.getX(i), P.getY(i), P.getZ(i), i), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
