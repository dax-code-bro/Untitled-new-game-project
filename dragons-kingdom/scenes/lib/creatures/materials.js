// Creature materials: three.js MeshStandard/MeshPhysical materials extended
// with onBeforeCompile (so they keep three's lighting, shadows, IBL and any
// runtime-wide shader patches).
//
//   skin      procedural overlapping scales in chain coordinates (skin.js),
//             belly plates, dorsal crest row, granular scales at joints,
//             wrinkles, edge wear, crevice dirt, dust and salt on the lower
//             body, mouth interior; per-look colours; scale detail fades to
//             extra roughness when a scale gets smaller than a pixel (no
//             shimmer at 4K, no "plastic" look from far away).
//   membrane  wing skin with veins and thin-membrane TRANSLUCENCY: sunlight
//             and sky light from behind pass through (attenuated by veins,
//             bones and thickness, shadowed by the body). Lit, never emissive.
//   eye       cornea with a refracted iris (the iris is ray-traced through
//             the curved cornea), slit pupil, clearcoat "wet" reflection.
//   keratin   horns, claws, spikes: growth rings, striations, base-to-tip tone.
//   teeth     ivory enamel with gum-line staining.
// Nothing here is emissive.

import { GLSL_COMMON, GLSL_SCALES } from './glsl.js';

const lin = (THREE, r, g, b) => new THREE.Color(r, g, b);                       // linear values
const srgb = (THREE, r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

/** Per-creature looks (provisional colours; see README). Colours are linear. */
export function lookParams(THREE, look) {
  const L = {
    charcoal: {
      base: lin(THREE, 0.026, 0.025, 0.027), belly: lin(THREE, 0.04, 0.036, 0.034), dorsal: lin(THREE, 0.018, 0.018, 0.02),
      wear: lin(THREE, 0.075, 0.07, 0.066), crev: 0.5, dust: lin(THREE, 0.15, 0.12, 0.085), salt: lin(THREE, 0.55, 0.55, 0.53),
      // dry, dusty hide: broad soft sheen, never lacquer; dried mud and field dust on the lower body
      rough: [0.64, 0.16, 0.08, 0.3], amp: 0.26, keel: 0.18, facet: 0.0, jit: 0.25, metal: [0, 0], mottle: 0.25,
      dustAmt: 0.72, saltAmt: 0.12, oral: lin(THREE, 0.09, 0.03, 0.035), oralDark: lin(THREE, 0.02, 0.006, 0.008),
      membrane: lin(THREE, 0.018, 0.016, 0.016), trans: lin(THREE, 0.045, 0.012, 0.006), vein: lin(THREE, 0.03, 0.008, 0.006), memRough: 0.62,
      horn: [lin(THREE, 0.02, 0.019, 0.018), lin(THREE, 0.11, 0.1, 0.09)], claw: [lin(THREE, 0.018, 0.017, 0.016), lin(THREE, 0.06, 0.055, 0.05)],
      tooth: lin(THREE, 0.3, 0.25, 0.15), iris: [lin(THREE, 0.55, 0.27, 0.03), lin(THREE, 0.26, 0.07, 0.01)], sclera: lin(THREE, 0.05, 0.035, 0.02),
    },
    leaf: {
      base: lin(THREE, 0.04, 0.085, 0.022), belly: lin(THREE, 0.2, 0.22, 0.085), dorsal: lin(THREE, 0.022, 0.05, 0.016),
      wear: lin(THREE, 0.12, 0.16, 0.07), crev: 0.45, dust: lin(THREE, 0.22, 0.19, 0.15), salt: lin(THREE, 0.62, 0.62, 0.6),
      rough: [0.58, 0.14, 0.08, 0.3], amp: 0.3, keel: 0.12, facet: 0.0, jit: 0.25, metal: [0, 0], mottle: 0.35,
      dustAmt: 0.6, saltAmt: 0.15, oral: lin(THREE, 0.32, 0.09, 0.08), oralDark: lin(THREE, 0.07, 0.015, 0.015),
      membrane: lin(THREE, 0.03, 0.06, 0.02), trans: lin(THREE, 0.16, 0.15, 0.035), vein: lin(THREE, 0.06, 0.04, 0.012), memRough: 0.58,
      horn: [lin(THREE, 0.05, 0.05, 0.035), lin(THREE, 0.32, 0.29, 0.2)], claw: [lin(THREE, 0.03, 0.03, 0.025), lin(THREE, 0.16, 0.14, 0.1)],
      tooth: lin(THREE, 0.48, 0.42, 0.3), iris: [lin(THREE, 0.55, 0.42, 0.05), lin(THREE, 0.18, 0.2, 0.02)], sclera: lin(THREE, 0.08, 0.07, 0.03),
    },
    starlight: {
      base: lin(THREE, 0.7, 0.71, 0.72), belly: lin(THREE, 0.5, 0.5, 0.51), dorsal: lin(THREE, 0.72, 0.73, 0.74),
      wear: lin(THREE, 0.78, 0.78, 0.76), crev: 0.72, dust: lin(THREE, 0.42, 0.38, 0.32), salt: lin(THREE, 0.8, 0.8, 0.78),
      rough: [0.22, 0.14, 0.08, 0.3], amp: 0.3, keel: 0.0, facet: 1.0, jit: 0.2, metal: [0, 0], mottle: 0.06,
      dustAmt: 0.2, saltAmt: 0.0, oral: lin(THREE, 0.45, 0.16, 0.16), oralDark: lin(THREE, 0.1, 0.03, 0.03),
      // white-grey membranes (albino, but thick enough that blood barely tints them), silver highlights
      membrane: lin(THREE, 0.6, 0.6, 0.61), trans: lin(THREE, 0.34, 0.33, 0.32), vein: lin(THREE, 0.46, 0.43, 0.43), memRough: 0.45,
      clearcoat: 0.55,
      horn: [lin(THREE, 0.62, 0.6, 0.55), lin(THREE, 0.78, 0.77, 0.74)], claw: [lin(THREE, 0.5, 0.48, 0.44), lin(THREE, 0.75, 0.74, 0.7)],
      tooth: lin(THREE, 0.7, 0.66, 0.56), iris: [lin(THREE, 0.62, 0.36, 0.42), lin(THREE, 0.3, 0.08, 0.14)], sclera: lin(THREE, 0.3, 0.2, 0.2),
    },
    gold: {
      base: lin(THREE, 0.95, 0.64, 0.17), belly: lin(THREE, 0.86, 0.58, 0.24), dorsal: lin(THREE, 0.88, 0.58, 0.14),
      wear: lin(THREE, 1.0, 0.8, 0.42), crev: 0.55, dust: lin(THREE, 0.3, 0.25, 0.18), salt: lin(THREE, 0.7, 0.7, 0.68),
      // gold from a saturated dielectric (a golden gecko / chrysalis), not a metal: only a
      // little metalness on the scale crowns; fleshy amber skin shows between the scales
      rough: [0.34, 0.14, 0.1, 0.2], amp: 0.26, keel: 0.0, facet: 0.0, jit: 0.3, metal: [0.5, 0.0], mottle: 0.3,
      crevCol: lin(THREE, 0.42, 0.13, 0.035), crevAmt: 0.75,
      dustAmt: 0.0, saltAmt: 0.0, oral: lin(THREE, 0.45, 0.14, 0.12), oralDark: lin(THREE, 0.1, 0.02, 0.02),
      membrane: lin(THREE, 0.45, 0.31, 0.12), trans: lin(THREE, 0.9, 0.55, 0.2), vein: lin(THREE, 0.4, 0.15, 0.06), memRough: 0.5,
      horn: [lin(THREE, 0.55, 0.45, 0.28), lin(THREE, 0.75, 0.66, 0.46)], claw: [lin(THREE, 0.45, 0.38, 0.25), lin(THREE, 0.7, 0.62, 0.45)],
      tooth: lin(THREE, 0.7, 0.62, 0.48), iris: [lin(THREE, 0.5, 0.25, 0.04), lin(THREE, 0.2, 0.06, 0.01)], sclera: lin(THREE, 0.08, 0.05, 0.03),
      wet: true,
    },
    scout: {
      base: lin(THREE, 0.055, 0.05, 0.045), belly: lin(THREE, 0.17, 0.15, 0.12), dorsal: lin(THREE, 0.035, 0.034, 0.033),
      wear: lin(THREE, 0.1, 0.095, 0.085), crev: 0.5, dust: lin(THREE, 0.2, 0.18, 0.15), salt: lin(THREE, 0.6, 0.6, 0.58),
      rough: [0.4, 0.12, 0.08, 0.3], amp: 0.26, keel: 0.25, facet: 0.0, jit: 0.2, metal: [0, 0], mottle: 0.3,
      dustAmt: 0.25, saltAmt: 0.3, oral: lin(THREE, 0.25, 0.07, 0.07), oralDark: lin(THREE, 0.05, 0.012, 0.012),
      membrane: lin(THREE, 0.05, 0.045, 0.04), trans: lin(THREE, 0.42, 0.2, 0.1), vein: lin(THREE, 0.06, 0.025, 0.015), memRough: 0.55,
      horn: [lin(THREE, 0.04, 0.038, 0.034), lin(THREE, 0.2, 0.18, 0.15)], claw: [lin(THREE, 0.03, 0.028, 0.025), lin(THREE, 0.12, 0.11, 0.09)],
      tooth: lin(THREE, 0.58, 0.51, 0.38), iris: [lin(THREE, 0.6, 0.5, 0.15), lin(THREE, 0.25, 0.2, 0.04)], sclera: lin(THREE, 0.06, 0.05, 0.03),
    },
  };
  if (!L[look]) throw new Error(`unknown look ${look}`);
  return L[look];
}

const PERTURB = /* glsl */`
vec3 dkPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos)), vSigmaY = normalize(dFdy(surf_pos));
  vec3 R1 = cross(vSigmaY, surf_norm), R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
// metric slope of a world-space height h across the pixel footprint
vec2 dkSlope(float h, vec3 pos) { return vec2(dFdx(h) / max(length(dFdx(pos)), 1e-7), dFdy(h) / max(length(dFdy(pos)), 1e-7)); }
`;

// ----------------------------------------------------------------- skin
function skinMaterial(THREE, P, ctx) {
  const physical = !!P.wet || !!P.clearcoat;
  const Mat = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new Mat({ color: 0xffffff, roughness: 1, metalness: P.metal[0] > 0 ? 1 : 0 });
  if (P.wet) { mat.clearcoat = 1.0; mat.clearcoatRoughness = 0.04; }   // wet film (hatchling), varied per pixel below
  else if (P.clearcoat) { mat.clearcoat = P.clearcoat; mat.clearcoatRoughness = 0.12; }   // hard, polished scale crowns (Starlight)
  mat.defines = { USE_TANGENT: '' };
  const lowY = (ctx.spec.hipY ?? 0.2) * ctx.L * 0.55;
  const U = {
    uBase: { value: P.base }, uBelly: { value: P.belly }, uDorsal: { value: P.dorsal }, uWearCol: { value: P.wear },
    uDustCol: { value: P.dust }, uSaltCol: { value: P.salt }, uOral: { value: P.oral }, uOralDark: { value: P.oralDark },
    uRough: { value: new THREE.Vector4(...P.rough) },
    uPat: { value: new THREE.Vector4(P.amp, P.keel, P.facet, P.jit) },
    uDirt: { value: new THREE.Vector4(lowY, P.dustAmt, P.saltAmt, ctx.L) },
    uMisc: { value: new THREE.Vector4(P.crev, P.mottle, P.metal[0], P.metal[1]) },
    uWound: { value: new THREE.Vector4(0, 0, 0, 0) }, uWoundR: { value: 0 },
    uCrev: { value: new THREE.Vector4(...(P.crevCol ? [P.crevCol.r, P.crevCol.g, P.crevCol.b, P.crevAmt ?? 0.6] : [0, 0, 0, 0])) },
    uWet: { value: new THREE.Vector4(P.wet ? 1 : 0, 0.035, 0.3, 0) },   // wet film amount, wet roughness, dry-patch roughness
  };
  mat.userData.dkUniforms = U;
  mat.customProgramCacheKey = () => `dk-skin-${physical}-${P.metal[0] > 0}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aScale; attribute vec4 aMask; attribute vec4 aMask2; attribute vec4 aNoise; attribute vec2 aWarp;
varying vec4 vScale; varying vec4 vMask; varying vec4 vMask2; varying vec3 vRest; varying vec3 vRestN; varying vec4 vNoise; varying vec2 vWarp;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vScale = aScale; vMask = aMask; vMask2 = aMask2; vRest = position; vRestN = normal; vNoise = aNoise; vWarp = aWarp;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vScale; varying vec4 vMask; varying vec4 vMask2; varying vec3 vRest; varying vec3 vRestN; varying vec4 vNoise; varying vec2 vWarp;
uniform vec3 uBase, uBelly, uDorsal, uWearCol, uDustCol, uSaltCol, uOral, uOralDark;
uniform vec4 uRough, uPat, uDirt, uMisc, uWound, uCrev, uWet; uniform float uWoundR;
${GLSL_COMMON}
${GLSL_SCALES}
${PERTURB}
struct DKTri { float h; vec3 g; float cav; float wear; float id; };
// Voronoi tiles projected on the three rest-space planes, blended by the smooth rest normal
DKTri dkTriGran(vec3 rp, vec3 nw) {
  DKTri T; T.h = 0.0; T.g = vec3(0.0); T.cav = 0.0; T.wear = 0.0; T.id = 0.0;
  float ws = 0.0;
  if (nw.x > 0.03) { DKScale G = dkGranule(rp.yz); T.h += nw.x * G.h; T.g += nw.x * vec3(0.0, G.grad); T.cav += nw.x * G.cav; T.wear += nw.x * G.wear; T.id += nw.x * G.id; ws += nw.x; }
  if (nw.y > 0.03) { DKScale G = dkGranule(rp.xz + 17.3); T.h += nw.y * G.h; T.g += nw.y * vec3(G.grad.x, 0.0, G.grad.y); T.cav += nw.y * G.cav; T.wear += nw.y * G.wear; T.id += nw.y * G.id; ws += nw.y; }
  if (nw.z > 0.03) { DKScale G = dkGranule(rp.xy + 31.7); T.h += nw.z * G.h; T.g += nw.z * vec3(G.grad, 0.0); T.cav += nw.z * G.cav; T.wear += nw.z * G.wear; T.id += nw.z * G.id; ws += nw.z; }
  float iw = 1.0 / max(ws, 1e-4);
  T.h *= iw; T.g *= iw; T.cav *= iw; T.wear *= iw; T.id *= iw;
  return T;
}
vec2 dkGrad; float dkDetail, dkCav, dkAO, dkRoughOut, dkMetalOut, dkOralM, dkGranM, dkWetK; vec3 dkGranG; float dkGranH;
void dkSkin(inout vec3 albedo) {
  vec2 p = vec2(vScale.y, vScale.x);               // x = around, y = along (free edge +y)
  float fw = max(length(fwidth(p)), 1e-5);
  dkDetail = 1.0 - smoothstep(0.3, 0.9, fw);
  float L = uDirt.w;
  // low-frequency noises are precomputed per vertex (skin.js: aNoise / aWarp)
  float n1 = vNoise.x;                              // large mottling
  float n2 = vNoise.w;                              // medium
  dkOralM = clamp(vMask2.y, 0.0, 1.0);
  // --- pick the scale field: main imbricate, belly plates, dorsal crest row
  vec2 pw = p + (vWarp - 0.5) * 0.9;
  DKScale S = dkImbricate(pw, uPat.w, uPat.y, uPat.z);
  float latV = vScale.w - vScale.z;                 // lateral distance from the ventral midline (scale units)
  float bellySel = vMask.y + (n2 - 0.5) * 0.25;
  if (bellySel > 0.5) { S = dkPlates(vec2(latV, vScale.x + (n2 - 0.5) * 0.4), 0.85, 3.4); S.h *= 0.75; S.grad *= 0.75; }
  float isHead = (vMask2.w > 0.5 && vMask2.w < 1.5) ? 1.0 : 0.0;   // head: polygonal plates (3D tiles below)
  float dorsSel = vMask.z + (n2 - 0.5) * 0.2;
  if (dorsSel > 0.5) {
    DKScale D = dkImbricate(vec2(vScale.z / 1.7, vScale.x / 1.5), 0.15, 0.6, uPat.z);
    D.grad /= vec2(1.7, 1.5);
    S = D;
  }
  // --- joint wrinkles (lines across the chain)
  float wr = vMask.w * (0.6 + 0.4 * n2);
  float wph = vScale.x * 1.7 + n2 * 4.0;
  float wv = sin(wph);
  S.h += wr * 0.35 * (wv * 0.5 + 0.5);
  S.grad.y += wr * 0.35 * 0.5 * cos(wph) * 1.7;
  S.cav = max(S.cav, wr * smoothstep(0.3, -0.9, wv) * 0.6);
  // --- granular skin at chain junctions and polygonal head plates: Voronoi tiles in
  // rest space, blended triplanar on the smooth rest normal, with an analytic
  // height gradient (no screen-space derivative of the height -> no blocky bump)
  float gm = clamp(vMask.x, 0.0, 1.0);
  dkGranM = max(gm, isHead);
  dkGranH = 0.0; dkGranG = vec3(0.0);
  float gDet = 1.0;
  if (dkGranM > 0.01) {
    // the tile size varies over the body; scaling rest coordinates by a varying size
    // would smear the pattern (rest positions are metres from the origin), so the
    // size is quantised to half-octave levels and two fixed levels are cross-faded
    float gsRaw = max(vMask2.z * mix(0.8, mix(1.05, 0.75, gm), isHead), L * 0.0015);   // tile size (m)
    float relief = mix(0.3, mix(0.17, 0.3, gm), isHead);                                // head plates are flatter
    vec3 nw = pow(abs(normalize(vRestN)), vec3(4.0)); nw /= nw.x + nw.y + nw.z;
    float lv = log2(gsRaw / L) * 2.0;
    float l0 = floor(lv), fb = smoothstep(0.3, 0.7, lv - l0);
    float gA = L * exp2(l0 * 0.5), gB = gA * 1.41421356;
    float fwr = length(fwidth(vRest));
    float dA = (1.0 - smoothstep(0.3, 0.8, fwr / gA)) * (1.0 - fb), dB = (1.0 - smoothstep(0.3, 0.8, fwr / gB)) * fb;
    float gh = 0.0, gc = 0.0, gwr = 0.0, gid = 0.0; vec3 g3 = vec3(0.0);
    if (fb < 0.999) { DKTri T = dkTriGran(vRest / gA + l0 * 7.31, nw); gh += T.h * gA * dA; g3 += T.g * dA; gc += T.cav * dA; gwr += T.wear * dA; gid += T.id * (1.0 - fb); }
    if (fb > 0.001) { DKTri T = dkTriGran(vRest / gB + (l0 + 1.0) * 7.31, nw); gh += T.h * gB * dB; g3 += T.g * dB; gc += T.cav * dB; gwr += T.wear * dB; gid += T.id * fb; }
    gDet = dA + dB;
    dkGranH = gh * relief;
    dkGranG = g3 * relief;                          // d(height)/d(rest position)
    float m = max(smoothstep(0.35, 0.65, gm + (n2 - 0.5) * 0.3), isHead);
    S.cav = mix(S.cav, gc, m); S.wear = mix(S.wear, gwr, m); S.id = mix(S.id, gid, m);
    S.grad *= 1.0 - m;
    dkGranM = m;
  }
  // chain-coordinate detail fade does not apply to the 3D tiles (their own fade is gDet)
  float detailK = mix(dkDetail, 1.0, dkGranM) * (1.0 - dkOralM);
  dkGrad = S.grad * uPat.x * detailK;
  dkCav = S.cav * detailK;
  // --- colour
  vec3 col = uBase;
  col = mix(col, uDorsal, smoothstep(0.6, 0.0, vScale.z / max(vScale.w, 1.0)) * 0.6);
  col = mix(col, uBelly, smoothstep(0.35, 0.85, vMask.y));
  col *= 1.0 + uMisc.y * (n1 - 0.5) * 1.2;
  col *= 1.0 + 0.22 * (S.id - 0.5) * mix(dkDetail, gDet, dkGranM);
  col = mix(col, uWearCol, S.wear * 0.55 * detailK);
  col *= mix(1.0, uMisc.x, dkCav * (1.0 - uCrev.w));
  col = mix(col, uCrev.rgb, clamp(dkCav * 1.6, 0.0, 1.0) * uCrev.w);     // flesh between the scales
  // dust settles on the lower body and in crevices; salt crust in the deepest ones
  float low = smoothstep(uDirt.x, 0.0, vRest.y) + vMask.y * 0.25;
  float dn = vNoise.y;
  float dust = clamp(low * uDirt.y * smoothstep(0.48, 0.72, dn) + dkCav * low * 0.8 * uDirt.y * smoothstep(0.35, 0.6, dn), 0.0, 0.85);
  float salt = smoothstep(0.55, 0.75, vNoise.z) * smoothstep(0.2, 0.8, dkCav + 0.2 * low) * uDirt.z * clamp(low * 1.5, 0.0, 1.0);
  col = mix(col, uDustCol, dust);
  col = mix(col, uSaltCol, salt);
  // mouth interior: wet gums/palate/tongue
  vec3 oral = mix(uOralDark, uOral, smoothstep(0.2, 0.9, vMask2.x) * (0.7 + 0.3 * n2));
  col = mix(col, oral, dkOralM);
  // wound (detached wing stump): dark, rough
  if (uWoundR > 0.0) {
    float w = smoothstep(uWoundR, uWoundR * 0.55, length(vRest - uWound.xyz) + (n2 - 0.5) * uWoundR * 0.5) * uWound.w;
    col = mix(col, vec3(0.05, 0.008, 0.006), w);
    dkCav = max(dkCav, w * 0.5);
  }
  albedo = col;
  // --- roughness / metalness
  float r = uRough.x + uRough.y * (S.id - 0.5) - uRough.z * S.wear * detailK + uRough.w * dust + 0.25 * salt;
  r = mix(r, 0.2, dkOralM);
  r = sqrt(r * r + (1.0 - mix(dkDetail, gDet, dkGranM)) * 0.05 * (1.0 - dkOralM));    // sub-pixel scale relief -> roughness
  dkRoughOut = clamp(r, 0.06, 1.0);
  dkMetalOut = mix(uMisc.z, uMisc.w, clamp(dkCav * 1.4 + dust, 0.0, 1.0)) * (1.0 - dkOralM) * (1.0 - 0.75 * smoothstep(0.35, 0.85, vMask.y));
  dkAO = vMask2.x * (1.0 - 0.55 * dkCav);
  // wet film (hatchling): mostly wet, streaks running down the body and a few drying patches
  dkWetK = 1.0;
  if (uWet.x > 0.0) {
    float streak = dkFbm(vec3(vRest.x * 9.0 / uDirt.w, vRest.y * 2.0 / uDirt.w, vRest.z * 9.0 / uDirt.w) * 6.0);
    dkWetK = clamp(0.35 + 0.9 * smoothstep(0.3, 0.6, streak) + 0.4 * vNoise.y, 0.0, 1.0) * uWet.x;
    dkRoughOut = mix(dkRoughOut, dkRoughOut * 0.6, dkWetK);
    albedo *= mix(1.0, 0.82, dkWetK);                 // wet surfaces darken a little
  }
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 a; dkSkin(a); diffuseColor.rgb = a; }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  if (uWet.x > 0.0) {
    material.clearcoat *= dkWetK;
    material.clearcoatRoughness = mix(uWet.z, uWet.y, dkWetK);
  }
#endif`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = dkRoughOut;`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = dkMetalOut;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 T = normalize(vTangent), B = normalize(vBitangent);
  T = normalize(T - normal * dot(normal, T));
  vec3 Bc = cross(normal, T);
  B = Bc * sign(dot(B, Bc) + 1e-6);
  vec3 n1 = normalize(normal - dkGrad.x * B - dkGrad.y * T);
  if (dkGranM > 0.0) {
    vec3 pv = -vViewPosition;
    vec2 sl = vec2(dot(dkGranG, dFdx(vRest)) / max(length(dFdx(pv)), 1e-7), dot(dkGranG, dFdy(vRest)) / max(length(dFdy(pv)), 1e-7));
    vec3 n2 = dkPerturb(pv, normal, sl, faceDirection);
    n1 = normalize(mix(n1, n2, dkGranM));
  }
  normal = n1;
}`)
      .replace('#include <aomap_fragment>', `
{
  float ambientOcclusion = dkAO;
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  reflectedLight.directDiffuse *= mix(1.0, 1.0 - 0.5 * dkCav, 1.0) * mix(1.0, vMask2.x, 0.35);
  #if defined( USE_CLEARCOAT )
    // the wet film reflects the sky only where the sky is visible (crevices and the
    // underside facing the ground would otherwise show mirror-bright sky patches)
    clearcoatSpecularIndirect *= ambientOcclusion * ambientOcclusion * smoothstep(-0.35, 0.25, dot(reflect(-geometryViewDir, geometryClearcoatNormal), (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
  #endif
}
#include <aomap_fragment>`);
  };
  return mat;
}

// ------------------------------------------------------------- membrane
function membraneMaterial(THREE, P, ctx) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: P.memRough, metalness: 0, side: THREE.DoubleSide });
  const U = {
    uMemCol: { value: P.membrane }, uTransCol: { value: P.trans }, uVeinCol: { value: P.vein },
    uBillowL: { value: 0 }, uBillowR: { value: 0 }, uBillowScale: { value: ctx.L * 0.025 },
    uL: { value: ctx.L },
  };
  mat.userData.dkUniforms = U;
  mat.customProgramCacheKey = () => 'dk-membrane';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aWing; attribute vec4 aEdge;
uniform float uBillowL, uBillowR, uBillowScale;
varying vec4 vWing; varying vec4 vEdge; varying vec3 vRest;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
vWing = aWing; vEdge = aEdge; vRest = position;
{ float bil = aEdge.z > 0.0 ? uBillowL : uBillowR; transformed += normalize(objectNormal) * bil * aWing.w * uBillowScale; }`);
    let frag = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vWing; varying vec4 vEdge; varying vec3 vRest;
uniform vec3 uMemCol, uTransCol, uVeinCol; uniform float uL;
${GLSL_COMMON}
${PERTURB}
float dkVein, dkThin, dkMemH; vec3 dkVeinAtt;
void dkMembrane(inout vec3 col) {
  float a = vWing.x, b = vWing.y, pid = vWing.z;
  vec2 fp = vec2(a, b);
  float fw = max(length(fwidth(fp)), 1e-5);
  float det = 1.0 - smoothstep(0.012, 0.035, fw);         // veins (up to ~15 per panel) resolvable
  float detC = 1.0 - smoothstep(0.004, 0.009, fw);        // fine creases (60 per panel)
  // veins: main vessels run along the fingers (chiro) or chordwise (plagio), with meandering branches
  float along = pid > 3.5 ? b : a;
  float across = pid > 3.5 ? a : b;
  float nn = dkVnoise2(vec2(along * 6.0 + pid * 3.1, across * 6.0));
  float c1 = across * (pid > 3.5 ? 9.0 : 6.0) + 0.35 * sin(along * 7.0 + pid * 2.0) + 0.45 * (nn - 0.5);
  float l1 = 1.0 - smoothstep(0.0, 0.07, abs(fract(c1) - 0.5) * 2.0 * 0.5);
  float c2 = (across * 15.0 + along * 9.0) + 1.2 * dkVnoise2(vec2(along * 9.0, across * 11.0 + pid));
  float gate = smoothstep(0.45, 0.6, dkVnoise2(vec2(along * 4.0 + 5.0, across * 4.0 + pid * 2.0)));
  float l2 = (1.0 - smoothstep(0.0, 0.05, abs(fract(c2) - 0.5))) * gate;
  dkVein = max(l1 * 0.9, l2 * 0.55) * det * smoothstep(0.98, 0.85, along);
  // thickness: thick near bones and at the trailing-edge hem
  float nearBone = 1.0 - smoothstep(0.0, uL * 0.012, vEdge.x);
  float hem = 1.0 - smoothstep(0.0, uL * 0.004, vEdge.y);
  dkThin = (1.0 - 0.75 * nearBone) * (1.0 - 0.5 * hem) * (1.0 - 0.5 * dkVein) * (0.6 + 0.8 * dkFbm(vRest / uL * 9.0));
  // blood in the vessels absorbs the transmitted light: veins show dark red against the sun
  vec3 vt = uVeinCol / max(max(uVeinCol.r, uVeinCol.g), max(uVeinCol.b, 1e-4));
  dkVeinAtt = mix(vec3(1.0), vt * 0.45, dkVein);
  float mot = dkFbm(vRest / uL * 30.0);
  col = mix(uMemCol, uVeinCol, dkVein * 0.6) * (0.8 + 0.4 * mot) * (1.0 - 0.3 * hem);
  // fine stretch creases across the span (relief for the bump)
  dkMemH = (sin(along * 60.0 + nn * 6.0) * 0.5 + 0.5) * 0.0004 * uL * detC + dkVein * 0.0005 * uL;
}
vec3 dkTransmit(vec3 lightCol, vec3 L, vec3 N, vec3 V) {
  float back = saturate(-dot(N, L));
  float fwd = pow(saturate(dot(-V, L)), 6.0);
  return lightCol * uTransCol * dkVeinAtt * dkThin * back * (0.3 + 1.6 * fwd) * RECIPROCAL_PI;
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 c; dkMembrane(c); diffuseColor.rgb = c; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = dkPerturb(-vViewPosition, normal, dkSlope(dkMemH, -vViewPosition), faceDirection);`);
    // transmitted sunlight: a copy of three's directional-light block (same shadow
    // lookup) in its own scope, after the normal lighting; the include itself is
    // left in place so runtime patches (cinematic AO / cascades) still apply.
    {
      const chunk = THREE.ShaderChunk.lights_fragment_begin;
      const a = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
      const b = a >= 0 ? chunk.indexOf('#endif', chunk.indexOf('#pragma unroll_loop_end', a)) : -1;
      if (a >= 0 && b > a) {
        let blockSrc = chunk.slice(a, b + '#endif'.length);
        blockSrc = blockSrc.replace(/RE_Direct\(\s*directLight[^;]*;/, 'reflectedLight.directDiffuse += dkTransmit(directLight.color, directLight.direction, geometryNormal, geometryViewDir);');
        frag = frag.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n{\n' + blockSrc + '\n}\n');
      } else console.warn('[creatures] membrane: three.js lights chunk changed - no translucency');
    }
    frag = frag.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( RE_IndirectDiffuse )
  reflectedLight.indirectDiffuse += uTransCol * dkVeinAtt * dkThin * getIBLIrradiance( -geometryNormal ) * 0.3 * RECIPROCAL_PI;
#endif`);
    sh.fragmentShader = frag;
  };
  return mat;
}

// ------------------------------------------------------------------ eye
function eyeMaterial(THREE, P, ctx, eyeRadius) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.025, specularIntensity: 0.2 });
  const U = { uIrisA: { value: P.iris[0] }, uIrisB: { value: P.iris[1] }, uSclera: { value: P.sclera }, uEyeR: { value: eyeRadius }, uPupil: { value: 0.1 } };
  mat.userData.dkUniforms = U;
  mat.customProgramCacheKey = () => 'dk-eye';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aEye; attribute vec4 aEyeX; attribute vec4 aEyeZ;
uniform float uEyeR;
varying vec3 vEyeC; varying vec3 vEyeX; varying vec3 vEyeZ; varying vec3 vEyeL;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  mat4 sm = mat4(1.0);
  #ifdef USE_SKINNING
  sm = skinMatrix;
  #endif
  vec3 ax = normalize(normalMatrix * (sm * vec4(aEyeX.xyz, 0.0)).xyz);
  vec3 az = normalize(normalMatrix * (sm * vec4(aEyeZ.xyz, 0.0)).xyz);
  vec3 ay = cross(az, ax);
  vEyeX = ax; vEyeZ = az; vEyeL = aEye.xyz;
  vEyeC = mvPosition.xyz - uEyeR * (aEye.x * ax + aEye.y * ay + aEye.z * az);
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vEyeC; varying vec3 vEyeX; varying vec3 vEyeZ; varying vec3 vEyeL;
uniform vec3 uIrisA, uIrisB, uSclera; uniform float uEyeR, uPupil;
${GLSL_COMMON}
vec3 dkIris(vec3 P, vec3 N) {
  vec3 X = normalize(vEyeX), Z = normalize(vEyeZ), Y = cross(Z, X);
  vec3 V = normalize(P);
  // refract through the cornea (n = 1.376) and hit the iris plane
  vec3 R = refract(V, N, 1.0 / 1.376);
  const float zi = 0.52;
  vec3 C = vEyeC;
  float den = dot(R, Z);
  float t = den < -1e-4 ? dot(C + Z * zi * uEyeR - P, Z) / den : 0.0;
  vec3 Hh = P + R * max(t, 0.0);
  vec2 h = vec2(dot(Hh - C, X), dot(Hh - C, Y)) / uEyeR;
  float rho = length(h) / 0.84;
  float th = atan(h.y, h.x);
  // slit pupil (vertical) with a soft edge
  float pw = uPupil, ph = 0.66;
  float pu = length(vec2(h.x / pw, h.y / ph));
  float fib = dkVnoise2(vec2(th * 18.0, rho * 3.0)) * 0.6 + dkVnoise2(vec2(th * 55.0, rho * 9.0)) * 0.4;
  vec3 iris = mix(uIrisA, uIrisB, smoothstep(0.15, 1.0, rho));
  iris *= 0.65 + 0.7 * fib;
  iris *= 1.0 - 0.6 * smoothstep(0.82, 1.0, rho);          // dark limbal ring
  iris = mix(iris, uIrisB * 0.4, smoothstep(1.2, 1.6, pu) * 0.0 + (1.0 - smoothstep(1.0, 1.35, pu)) * 0.5);
  iris = mix(vec3(0.004), iris, smoothstep(0.95, 1.08, pu));
  float inIris = 1.0 - smoothstep(0.98, 1.03, rho);
  return mix(uSclera, iris, inIris);
}
`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
diffuseColor.rgb = dkIris(-vViewPosition, normal);`);
  };
  return mat;
}

// -------------------------------------------------------------- keratin
function keratinMaterial(THREE, P, kind) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0 });
  const isTooth = kind === 'teeth';
  const U = { uHornA: { value: P.horn[0] }, uHornB: { value: P.horn[1] }, uClawA: { value: P.claw[0] }, uClawB: { value: P.claw[1] }, uTooth: { value: P.tooth }, uGum: { value: P.oral } };
  mat.userData.dkUniforms = U;
  mat.customProgramCacheKey = () => `dk-keratin-${isTooth}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aKer; varying vec4 vKer; varying vec2 vKuv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vKer = aKer; vKuv = uv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vKer; varying vec2 vKuv;
uniform vec3 uHornA, uHornB, uClawA, uClawB, uTooth, uGum;
${GLSL_COMMON}
${PERTURB}
float dkKR; vec2 dkKS;
// relief height of the keratin surface at (t along, ar around); fs/fr fade the
// fine striations / growth rings once they get smaller than a pixel
float dkKHf(float t, float ar, float kind, float seed, float rad, float fs, float fr) {
  float stri = dkVnoise2(vec2(ar * 46.0 + seed * 10.0, t * 4.0)) * 0.6 + (dkVnoise2(vec2(ar * 120.0, t * 10.0 + seed)) - 0.5) * 0.4 * fs + 0.2;
  float rings = sin(t * 110.0 + seed * 30.0 + stri * 1.2) * 0.5 + 0.5;          // fine growth lines
  float ridges = smoothstep(-0.3, 1.0, sin(t * 34.0 + seed * 6.0));              // broad ridges (also in the geometry)
  ${isTooth ? `return stri * rad * 0.02;` : `
  if (kind < 0.5) return ((ridges * 0.5 + rings * 0.3 * fr) * (1.0 - t) + stri * 0.12) * rad * 0.06;
  if (kind < 1.5) return stri * rad * 0.05;
  return (stri * 0.6 + rings * fr * 0.2 * (1.0 - t)) * rad * 0.06;`}
}
vec3 dkKeratin() {
  float t = vKer.x, kind = vKer.y, seed = vKer.z, rad = vKer.w;
  float ar = vKuv.x;
  vec2 dA = vec2(dFdx(ar), dFdy(ar));
  if (abs(dA.x) > 0.3 || abs(dA.y) > 0.3) dA = vec2(0.0);          // uv wrap seam
  vec2 dT = vec2(dFdx(t), dFdy(t));
  float fs = 1.0 - smoothstep(0.25, 0.6, length(vec2(length(dA) * 120.0, length(dT) * 10.0)));
  float fr = 1.0 - smoothstep(0.12, 0.35, length(dT) * 110.0 / 6.2832);
  float stri = dkVnoise2(vec2(ar * 46.0 + seed * 10.0, t * 4.0)) * 0.6 + (dkVnoise2(vec2(ar * 120.0, t * 10.0 + seed)) - 0.5) * 0.4 * fs + 0.2;
  // bump: parametric derivatives (finite differences) chained with the smooth uv derivatives
  float h0 = dkKHf(t, ar, kind, seed, rad, fs, fr);
  float dhdt = (dkKHf(t + 1e-3, ar, kind, seed, rad, fs, fr) - h0) * 1e3;
  float dhda = (dkKHf(t, ar + 1e-3, kind, seed, rad, fs, fr) - h0) * 1e3;
  vec3 pv = -vViewPosition;
  dkKS = vec2((dhdt * dT.x + dhda * dA.x) / max(length(dFdx(pv)), 1e-7), (dhdt * dT.y + dhda * dA.y) / max(length(dFdy(pv)), 1e-7));
  vec3 col;
  ${isTooth ? `
  col = uTooth * (0.85 + 0.25 * stri);
  col = mix(col, uTooth * vec3(1.05, 1.02, 0.95) * 1.15, smoothstep(0.6, 1.0, t));   // translucent-looking pale tip
  col = mix(uGum, col, smoothstep(0.08, 0.3, t));                                    // gum line
  col *= 1.0 - 0.25 * smoothstep(0.4, 0.0, t);
  dkKR = mix(0.4, 0.22, t);` : `
  if (kind < 0.5) {          // horn: growth rings toward the base, polished tip
    col = mix(uHornA, uHornB, pow(t, 1.4));
    col *= 0.8 + 0.35 * stri;
    dkKR = mix(0.55, 0.3, t) + 0.1 * (stri - 0.5);
  } else if (kind < 1.5) {   // claw
    col = mix(uClawA, uClawB, pow(t, 1.6));
    col *= 0.85 + 0.3 * stri;
    dkKR = mix(0.45, 0.25, t);
  } else {                   // dorsal spike
    col = mix(uHornA, uHornB, pow(t, 1.2) * 0.8);
    col *= 0.8 + 0.35 * stri;
    dkKR = 0.45;
  }`}
  return col;
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = dkKeratin();`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = dkKR;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = dkPerturb(-vViewPosition, normal, dkKS, faceDirection);`);
  };
  return mat;
}

/** All materials of one creature. */
export function makeMaterials(THREE, look, ctx) {
  const P = lookParams(THREE, look);
  const skin = skinMaterial(THREE, P, ctx);
  const eyeR = ctx.eyeRadius ?? ctx.L * 0.006;
  const mats = {
    params: P,
    skin, finger: skin, lid: skin,
    membrane: membraneMaterial(THREE, P, ctx),
    eye: eyeMaterial(THREE, P, ctx, eyeR),
    keratin: keratinMaterial(THREE, P, 'keratin'),
    teeth: keratinMaterial(THREE, P, 'teeth'),
    /** pose-driven uniforms: billowL/billowR (-1..1), pupil (slit width) */
    setPoseUniforms(u) {
      const m = mats.membrane.userData.dkUniforms;
      if (u.billowL !== undefined) m.uBillowL.value = u.billowL;
      if (u.billowR !== undefined) m.uBillowR.value = u.billowR;
      if (u.pupil !== undefined) mats.eye.userData.dkUniforms.uPupil.value = u.pupil;
      if (u.wound !== undefined) {
        const s = skin.userData.dkUniforms;
        s.uWound.value.set(u.wound.center[0], u.wound.center[1], u.wound.center[2], u.wound.amount);
        s.uWoundR.value = u.wound.radius;
      }
    },
  };
  return mats;
}
