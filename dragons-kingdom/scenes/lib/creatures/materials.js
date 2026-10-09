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

import { GLSL_COMMON, GLSL_SCALES, GLSL_VOR3 } from './glsl.js';

const lin = (THREE, r, g, b) => new THREE.Color(r, g, b);                       // linear values
const srgb = (THREE, r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

/** Per-creature looks (provisional colours; see README). Colours are linear. */
export function lookParams(THREE, look) {
  const L = {
    charcoal: {
      // APPROVED (DRAGONS.md): scales COMPLETELY BLACK, eyes BLUE, wing membrane GRAY WITH BLACK
      // STRIPES THROUGHOUT, standard orange-red fire (fire.js).
      // Black keratin (albedo ~0.012) under a low, satin sheen: flat-topped imbricate scales,
      // so the sky reflects in broad bands across many scales (as on a black monitor or
      // crocodile), never one blue-grey highlight per bead; a little field dust low on the legs.
      base: lin(THREE, 0.0125, 0.0122, 0.0125), belly: lin(THREE, 0.017, 0.016, 0.0155), dorsal: lin(THREE, 0.0105, 0.0102, 0.0105),
      wear: lin(THREE, 0.034, 0.032, 0.03), crev: 0.78, dust: lin(THREE, 0.075, 0.066, 0.055), salt: lin(THREE, 0.4, 0.4, 0.38),
      rough: [0.6, 0.12, 0.1, 0.28], amp: 0.17, keel: 0.22, facet: 0.0, jit: 0.3, metal: [0, 0], mottle: 0.18,
      hier: [1.0, 1.0, 0.65, 0.0], damp: 0.35, bellyP: [0.6, 1.25, 0.55, 0.5], scarCol: lin(THREE, 0.03, 0.026, 0.025),
      scl: [0.8, 0.36, 0.75, 1.5], tub: [0.28, 2.7, 0.7, 0], skin2: [0.3, 0.35, 0, 0.28], plateZ: -0.03,
      // body scale profile: flat tops (dome exponent), a keel along each scale, wide soft grooves
      vor: [6.0, 0.3, 0.14, 1.35],
      // old healed scars [a.xyz, halfWidth, b.xyz, strength] in L units (rest pose): left flank, right neck, right shoulder, left thigh
      scars: [[0.066, 0.19, 0.17, 0.0042, 0.061, 0.143, 0.092, 0.9], [-0.027, 0.258, 0.335, 0.003, -0.025, 0.236, 0.298, 0.8],
        [-0.071, 0.172, 0.2, 0.003, -0.069, 0.152, 0.216, 0.75], [0.076, 0.132, 0.03, 0.0026, 0.071, 0.112, -0.012, 0.7]],
      dustAmt: 0.35, saltAmt: 0.05, oral: lin(THREE, 0.09, 0.03, 0.035), oralDark: lin(THREE, 0.02, 0.006, 0.008),
      // GRAY membrane with BLACK STRIPES throughout: noise-warped bands across every panel
      // (stripes block the light, the grey skin between them lets a little through)
      membrane: lin(THREE, 0.1, 0.1, 0.104), trans: lin(THREE, 0.05, 0.05, 0.052), vein: lin(THREE, 0.06, 0.05, 0.05), memRough: 0.55, memSpec: 0.32, memSpecD: 0.6,
      stripe: [7.0, 0.36, 0.6, 1.0], stripeCol: lin(THREE, 0.009, 0.009, 0.01),
      horn: [lin(THREE, 0.02, 0.019, 0.018), lin(THREE, 0.09, 0.085, 0.078)], claw: [lin(THREE, 0.018, 0.017, 0.016), lin(THREE, 0.06, 0.055, 0.05)],
      tooth: lin(THREE, 0.36, 0.3, 0.2), sclera: lin(THREE, 0.02, 0.018, 0.02),
      // BLUE eyes (a deep slate blue iris with a dark limbal ring; never emissive)
      iris: [lin(THREE, 0.026, 0.075, 0.21), lin(THREE, 0.005, 0.016, 0.055)],
      fire: 'standard',
    },
    leaf: {
      // APPROVED (DRAGONS.md): scales DARK GREEN, eyes YELLOW, wing membrane LIGHT GREEN,
      // a unique purplish-blue fire (fire.js; not used on screen in Episode 1).
      // Dark green like an emerald tree monitor in shade: a darker back, a paler green belly,
      // mottled, never a toy's flat saturated green; little (greenish) dust
      base: lin(THREE, 0.012, 0.04, 0.012), belly: lin(THREE, 0.05, 0.08, 0.03), dorsal: lin(THREE, 0.006, 0.022, 0.007),
      wear: lin(THREE, 0.03, 0.06, 0.025), crev: 0.55, dust: lin(THREE, 0.1, 0.11, 0.07), salt: lin(THREE, 0.5, 0.52, 0.48),
      rough: [0.54, 0.12, 0.1, 0.28], amp: 0.18, keel: 0.14, facet: 0.0, jit: 0.3, metal: [0, 0], mottle: 0.35,
      // (fewer big scutes on the limbs: plates down the forearm read as gauntlets)
      hier: [0.55, 1.0, 0.55, 0.0], damp: 0.2, bellyP: [0.42, 0.8, 0.25, 0.3], plateZ: -0.02,
      scl: [0.62, 0.36, 0.7, 1.45], tub: [0.16, 2.8, 0.6, 0], skin2: [0.2, 0.3, 0, 0.3], scl2: [0.62, 0.55, 0, 0],
      vor: [5.0, 0.24, 0.15, 1.25],
      // (dark gums and lip margins: a pink lip line drew a frog's smile)
      dustAmt: 0.2, saltAmt: 0.05, oral: lin(THREE, 0.07, 0.03, 0.028), oralDark: lin(THREE, 0.025, 0.008, 0.008),
      // LIGHT GREEN membrane; the light through it is limited (thick skin), so it never glows
      membrane: lin(THREE, 0.15, 0.25, 0.08), trans: lin(THREE, 0.15, 0.24, 0.07), vein: lin(THREE, 0.06, 0.11, 0.035), memRough: 0.56, memSpec: 0.4, memSpecD: 0.7,
      horn: [lin(THREE, 0.04, 0.045, 0.03), lin(THREE, 0.24, 0.22, 0.15)], claw: [lin(THREE, 0.03, 0.03, 0.025), lin(THREE, 0.14, 0.12, 0.09)],
      tooth: lin(THREE, 0.5, 0.44, 0.32), sclera: lin(THREE, 0.04, 0.036, 0.012),
      // clear YELLOW eyes
      iris: [lin(THREE, 0.42, 0.3, 0.02), lin(THREE, 0.12, 0.07, 0.006)],
      fire: 'leaf',
    },
    starlight: {
      // albino: white keratin over pale skin (a faint warm flush where the skin is thin), each
      // scale a flat polished facet tilted its own way - glints, never a glow
      // REFLECTIVE: every scale a flat, hard, polished plate tilted its own way (8-15 degrees), so
      // the sun breaks into many small glints and the sky into a mosaic of cool and warm
      // reflections - never emission, never one chrome sheet. Albedo ~0.6 with faint warm/cool
      // variation; the crevices only a little darker than the scales (no plaster-cast AO).
      base: lin(THREE, 0.6, 0.6, 0.605), belly: lin(THREE, 0.58, 0.57, 0.565), dorsal: lin(THREE, 0.62, 0.62, 0.635),
      wear: lin(THREE, 0.7, 0.7, 0.7), crev: 0.9, dust: lin(THREE, 0.45, 0.43, 0.4), salt: lin(THREE, 0.8, 0.8, 0.78),
      rough: [0.16, 0.06, 0.07, 0.25], amp: 0.18, keel: 0.0, facet: 1.0, jit: 0.25, metal: [0, 0], mottle: 0.06,
      hier: [0.85, 1.0, 0.5, 0.0], damp: 0.0, bellyP: [0.42, 0.85, 0.15, 0.3], plateZ: -0.02,
      crevCol: lin(THREE, 0.52, 0.47, 0.47), crevAmt: 0.15,
      scl: [0.8, 0.42, 0.75, 1.3], tub: [0.0, 2.5, 0.0, 0], skin2: [0.06, 0.15, 0, 0.14], skin3: [0.35, 0.16, 1.0, 0], scl2: [0.62, 0.55, 0, 0],
      vor: [8.0, 0.0, 0.16, 1.1],
      dustAmt: 0.2, saltAmt: 0.0, oral: lin(THREE, 0.45, 0.16, 0.16), oralDark: lin(THREE, 0.1, 0.03, 0.03),
      // white-grey membranes (albino, but thick enough that blood barely tints them), silver highlights
      membrane: lin(THREE, 0.5, 0.5, 0.505), trans: lin(THREE, 0.07, 0.066, 0.068), vein: lin(THREE, 0.5, 0.32, 0.32), memRough: 0.45, memSpec: 0.6,
      // a hard polish on the scale plates (the glints) over a satin base - not a chrome coat
      clearcoat: 0.7, clearcoatRough: 0.08,
      horn: [lin(THREE, 0.62, 0.6, 0.55), lin(THREE, 0.78, 0.77, 0.74)], claw: [lin(THREE, 0.5, 0.48, 0.44), lin(THREE, 0.75, 0.74, 0.7)],
      tooth: lin(THREE, 0.66, 0.62, 0.52), iris: [lin(THREE, 0.5, 0.3, 0.34), lin(THREE, 0.2, 0.06, 0.1)], sclera: lin(THREE, 0.22, 0.14, 0.14),
    },
    gold: {
      // 24-karat gold: a deep, warm yellow-gold (not pale brass), from pigment and a thin-film
      // sheen in a living skin - only a little metallic tint; a newborn's soft scales, wet
      // (gold's own reflectance, F0 ~ linear (1.0, 0.77, 0.34): metallic, so this IS the
      // reflection colour; the earlier orange albedo read as brass/bronze/copper)
      base: lin(THREE, 1.0, 0.77, 0.34), belly: lin(THREE, 1.0, 0.8, 0.44), dorsal: lin(THREE, 0.97, 0.73, 0.29),
      wear: lin(THREE, 1.0, 0.84, 0.5), crev: 0.9, dust: lin(THREE, 0.3, 0.25, 0.18), salt: lin(THREE, 0.7, 0.7, 0.68),
      // soft, not-yet-hardened scales: low relief, broad soft sheen; the gold shows as a
      // partly metallic reflection, the wet film (clearcoat) carries broad highlights
      // gold reads as gold through its tinted reflection: metallic crowns (broad, soft sheen at
      // roughness ~0.4, never pin-point sparkle), less in the soft grooves
      rough: [0.34, 0.05, 0.04, 0.1], amp: 0.03, keel: 0.0, facet: 0.0, jit: 0.45, metal: [0.8, 0.42], mottle: 0.16,
      hier: [0.0, 0.5, 0.3, 0.0], damp: 0.0, bellyP: [0.38, 0.8, 0.15, 0.18], plateZ: -0.03,
      crevCol: lin(THREE, 0.62, 0.36, 0.14), crevAmt: 0.2,
      // soft newborn head scales: a fine granular tier on the head (low relief, still readable)
      headRelief: 2.0,
      scl: [0.75, 0.42, 0.7, 1.1], tub: [0.0, 2.5, 0.0, 0], skin2: [0.0, 0.15, 0, 0.08], skin3: [0.1, 0.18, 0, 0],
      // amniotic residue: a pale, slimy film in patches and streaks
      residue: [0.24, 0.8, 0.74, 0.52],
      dustAmt: 0.0, saltAmt: 0.0, oral: lin(THREE, 0.5, 0.2, 0.16), oralDark: lin(THREE, 0.14, 0.04, 0.035),
      // the tiny crumpled wings: damp gold skin, satin not mirror (a smooth membrane fold mirrored blue sky)
      membrane: lin(THREE, 0.62, 0.38, 0.1), trans: lin(THREE, 0.5, 0.28, 0.08), vein: lin(THREE, 0.45, 0.12, 0.05), memRough: 0.6,
      // a newborn's claws and egg tooth: soft, translucent amber keratin, not white
      horn: [lin(THREE, 0.5, 0.34, 0.12), lin(THREE, 0.66, 0.52, 0.3)], claw: [lin(THREE, 0.3, 0.18, 0.06), lin(THREE, 0.46, 0.32, 0.14)],
      // a newborn's dark, wet eye: deep bronze-brown iris, a wide pupil in the dim chamber
      tooth: lin(THREE, 0.75, 0.7, 0.58), iris: [lin(THREE, 0.13, 0.075, 0.025), lin(THREE, 0.03, 0.017, 0.007)], sclera: lin(THREE, 0.04, 0.025, 0.015), pupil: 0.13, fleck: lin(THREE, 0.5, 0.36, 0.1),
      // the wet film: glossy but not a mirror (on the soft, lumpy newborn skin a mirror film
      // broke the window's reflection into pin-point sparkle)
      wet: true, wetRough: 0.1,
    },
    scout: {
      base: lin(THREE, 0.055, 0.05, 0.045), belly: lin(THREE, 0.17, 0.15, 0.12), dorsal: lin(THREE, 0.035, 0.034, 0.033),
      wear: lin(THREE, 0.1, 0.095, 0.085), crev: 0.5, dust: lin(THREE, 0.2, 0.18, 0.15), salt: lin(THREE, 0.6, 0.6, 0.58),
      rough: [0.4, 0.12, 0.08, 0.3], amp: 0.26, keel: 0.25, facet: 0.0, jit: 0.25, metal: [0, 0], mottle: 0.3,
      hier: [0.6, 1.0, 0.4, 0.0], damp: 0.15, bellyP: [0.7, 1.8, 0.85, 0.55],
      dustAmt: 0.25, saltAmt: 0.3, oral: lin(THREE, 0.25, 0.07, 0.07), oralDark: lin(THREE, 0.05, 0.012, 0.012),
      membrane: lin(THREE, 0.05, 0.045, 0.04), trans: lin(THREE, 0.3, 0.16, 0.09), vein: lin(THREE, 0.06, 0.025, 0.015), memRough: 0.55,
      horn: [lin(THREE, 0.04, 0.038, 0.034), lin(THREE, 0.2, 0.18, 0.15)], claw: [lin(THREE, 0.03, 0.028, 0.025), lin(THREE, 0.12, 0.11, 0.09)],
      tooth: lin(THREE, 0.55, 0.48, 0.35), iris: [lin(THREE, 0.45, 0.38, 0.12), lin(THREE, 0.14, 0.11, 0.025)], sclera: lin(THREE, 0.04, 0.035, 0.02),
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
  else if (P.clearcoat) { mat.clearcoat = P.clearcoat; mat.clearcoatRoughness = P.clearcoatRough ?? 0.12; }   // hard, polished scale crowns (Starlight)
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
    uWet: { value: new THREE.Vector4(P.wet ? 1 : 0, P.wetRough ?? 0.035, 0.3, 0) },   // wet film amount, wet roughness, dry-patch roughness
    uHier: { value: new THREE.Vector4(...(P.hier || [1, 1, 0.6, 0.35])) },
    uZones: { value: new THREE.Vector4(ctx.zones?.withersZ ?? ctx.L * 0.25, ctx.zones?.pelvisZ ?? 0, ctx.L * 0.06, ctx.L) },
    uBellyP: { value: new THREE.Vector4(...(P.bellyP || [0.85, 3.0, 0.75, 0.75])) },   // plate length, width (scale units), seam darkness, relief
    uDamp: { value: new THREE.Vector4(P.damp ?? 0, 0.72, 0.45, 0) },
    uScarA: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
    uScarB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
    uScarCol: { value: P.scarCol || lin(THREE, 0.1, 0.085, 0.08) },
    uResidue: { value: new THREE.Vector4(...(P.residue || [0, 0, 0, 0])) },
    // 3D mosaic scales: cell size factors (body, granular, head) relative to the chain scale unit, elongation
    uScl: { value: new THREE.Vector4(...(P.scl || [0.85, 0.42, 0.75, 1.35])) },
    // enlarged tubercles: density, lattice size (x the body cell), height
    uTub: { value: new THREE.Vector4(...(P.tub || [0.3, 2.6, 0.9, 0])) },
    // cell jitter (lower = more even scale sizes), size factor on the lower flanks/chest/throat
    // (latD > ~0.45: small scales there, as on a monitor's chest - no "breastplate")
    uScl2: { value: new THREE.Vector4(...(P.scl2 || [0.62, 1, 0, 0])) },
    // micro relief on the scales: amount, feature size (x the scale unit)
    uSkin3: { value: new THREE.Vector4(...(P.skin3 || [1, 0.16, 0, 0])) },
    // belly plates end this far (L) in front of the withers when y = 1 (Leaf, Starlight, hatchling: no chest plates)
    uBellyZ: { value: new THREE.Vector4(P.plateZ ?? 0, P.plateZ !== undefined ? 1 : 0, 0, 0) },
    // crevice dust fill, crown wear (bleached keratin), -, per-scale tone variation
    uSkin2: { value: new THREE.Vector4(...(P.skin2 || [0.4, 0.4, 0, 0.3])) },
    // body-scale profile: dome exponent (higher = flatter top), keel height, groove width, imbricate tilt
    uVor: { value: new THREE.Vector4(...(P.vor || [3.0, 0.0, 0.22, 0.9])) },
    // relief multiplier on the head (the newborn's soft head scales)
    uHeadRel: { value: P.headRelief ?? 1.0 },
  };
  // healed scars (rest-space segments, metres): [a(3), halfWidth, b(3), strength]
  (P.scars || []).slice(0, 4).forEach((sc, i) => {
    const Lc = ctx.L;
    U.uScarA.value[i].set(sc[0] * Lc, sc[1] * Lc, sc[2] * Lc, sc[3] * Lc);
    U.uScarB.value[i].set(sc[4] * Lc, sc[5] * Lc, sc[6] * Lc, sc[7]);
  });
  mat.userData.dkUniforms = U;
  mat.customProgramCacheKey = () => `dk-skin-${physical}-${P.metal[0] > 0}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aScale; attribute vec4 aMask; attribute vec4 aMask2; attribute vec4 aNoise; attribute vec2 aWarp;
varying vec4 vScale; varying vec4 vMask; varying vec4 vMask2; varying vec3 vRest; varying vec3 vRestN; varying vec3 vRestT; varying vec4 vNoise; varying vec2 vWarp;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vScale = aScale; vMask = aMask; vMask2 = aMask2; vRest = position; vRestN = normal; vRestT = tangent.xyz; vNoise = aNoise; vWarp = aWarp;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vScale; varying vec4 vMask; varying vec4 vMask2; varying vec3 vRest; varying vec3 vRestN; varying vec3 vRestT; varying vec4 vNoise; varying vec2 vWarp;
uniform vec4 uScl, uScl2, uTub, uSkin2, uSkin3, uBellyZ, uVor; uniform float uHeadRel;
uniform vec3 uBase, uBelly, uDorsal, uWearCol, uDustCol, uSaltCol, uOral, uOralDark;
uniform vec4 uRough, uPat, uDirt, uMisc, uWound, uCrev, uWet, uBellyP, uDamp; uniform float uWoundR;
uniform vec4 uScarA[4]; uniform vec4 uScarB[4]; uniform vec3 uScarCol; uniform vec4 uResidue;
float dkResM;
${GLSL_COMMON}
${GLSL_SCALES}
${GLSL_VOR3}
${PERTURB}
vec2 dkGrad; float dkDetail, dkCav, dkAO, dkRoughOut, dkMetalOut, dkOralM, dkGranM, dkWetK; vec3 dkGranG; float dkGranH;
float dkScarM, dkDampM, dkMicro = 0.5;
void dkSkin(inout vec3 albedo) {
  vec2 p = vec2(vScale.y, vScale.x);               // chain coordinates: x = around, y = along (free edge +y)
  float fwc = max(length(fwidth(p)), 1e-5);
  float L = uDirt.w;
  float region = vMask2.w;
  // low-frequency noises are precomputed per vertex (skin.js: aNoise / aWarp)
  float n1 = vNoise.x;                              // large mottling
  float n2 = vNoise.w;                              // medium
  dkOralM = clamp(vMask2.y, 0.0, 1.0);
  float isHead = (region > 0.5 && region < 1.5) ? 1.0 : 0.0;
  float neck = region < 0.5 ? smoothstep(uZones.x, uZones.x + uZones.z, vRest.z) : 0.0;
  float latD = vScale.z / max(vScale.w, 1.0);       // 0 on the dorsal midline .. 1 on the ventral one
  // ---- chain-coordinate layers: big keeled dorsal scutes in rows along the spine (and
  // across the fronts of the limbs), transverse belly plates
  vec2 pw = p + (vWarp - 0.5) * 0.9;
  DKScale S = dkImbricateL(pw, 0.5, 0.0, uPat.w, uPat.y, uPat.z, vScale.w, neck, region);
  // (no chain-row scales where the jaw turns granular at the chin: the rows converge at the
  // jaw tip and drew a swirl of stripes there)
  // (nor where a limb chain meets the body: its rows converge there - the radial "pole" fan on
  // the thigh/stifle - so the junction uses the 3D mosaic)
  float chainM = S.lv >= 0.0 && isHead < 0.5 && !(region > 3.5 && region < 4.5 && vMask.x > 0.35) && !(region > 1.5 && region < 2.5 && vMask.x > 0.04) ? 1.0 : 0.0;
  dkDetail = 1.0 - smoothstep(0.3, 0.9, fwc * 0.5);
  float latV = vScale.w - vScale.z;                 // lateral distance from the ventral midline (scale units)
  float bellySel = vMask.y + (n2 - 0.5) * 0.25;
  if (uBellyZ.y > 0.5) bellySel -= smoothstep(uZones.x + uBellyZ.x * L - uZones.z * 0.6, uZones.x + uBellyZ.x * L, vRest.z) * 0.8;
  // (the border is decided per plate, so it is ragged along plate edges - no ruled line)
  DKScale SP = dkPlates(vec2(latV, vScale.x + (n2 - 0.5) * 0.4), uBellyP.x, uBellyP.y);
  if (bellySel + (SP.id - 0.5) * 0.3 > 0.5) {
    S = SP;
    S.h *= uBellyP.w; S.grad *= uBellyP.w; S.cav *= uBellyP.z;
    dkDetail = 1.0 - smoothstep(0.3, 0.9, fwc / uBellyP.x);
    chainM = 1.0;
  }
  // ---- wing fingers: smooth, thin skin over the bone (no body-scale tier: scaled fingers read
  // as rope or scaly tubes), with soft transverse creases (bat fingers)
  if (region > 5.5 && region < 6.5) {
    float cr = vScale.x * 0.9 + (n2 - 0.5) * 3.0;
    S.h = 0.0; S.cav = 0.12 * smoothstep(0.6, 1.0, sin(cr * 6.2832)) ; S.wear = 0.15; S.id = 0.5 + 0.2 * (n1 - 0.5); S.lv = 3.5;
    S.grad = vec2(0.0, 0.06 * cos(cr * 6.2832));
    chainM = 1.0;
  }
  // ---- 3D mosaic scales everywhere else (rest-space anisotropic Voronoi, see glsl.js):
  // overlapping body scales elongated along the body, small domed granules at the
  // joints and around the eyes, flat polygonal plates on the head
  float gm = clamp(vMask.x, 0.0, 1.0);
  vec3 Tr = vRestT - vRestN * dot(vRestT, vRestN);
  Tr = dot(Tr, Tr) > 1e-8 ? normalize(Tr) : vec3(0.0, 0.0, 1.0);
  float gran = max(gm, isHead);
  float csRaw = max(vMask2.z * mix(mix(uScl.x, uScl.y, gm), uScl.z * mix(1.0, 0.65, gm), isHead), L * 0.0012);
  // smaller scales on the lower flanks, chest and throat (per creature)
  csRaw *= mix(1.0, uScl2.y, smoothstep(0.4, 0.72, latD) * (region < 0.5 ? 1.0 : 0.0) * (1.0 - isHead));
  float an = mix(uScl.w, 1.0, gran);
  float tilt = mix(uVor.w, 0.0, gran);                      // imbricate: rear edge raised
  float dome = mix(uVor.x, mix(2.2, 5.0, isHead), gran);    // profile exponent: flat-topped plates .. granules .. flat head plates
  float groove = mix(uVor.z, mix(0.3, 0.16, isHead), gran); // crevice width (fraction of q)
  dkKeel3 = uVor.y * (1.0 - gran);                          // a keel along each body scale
  // size grading: octave levels; a coarse scale either stays whole or splits into fine
  // ones (decided per coarse scale), so big and small scales meet along scale borders
  // the way they do on real skin (no cross-faded double patterns)
  float lv = log2(csRaw / L);
  float l0 = floor(lv), fsub = lv - l0;
  float gA = L * exp2(l0), gC = gA * 2.0;
  float fwr = length(fwidth(vRest));
  float vh = 0.0, vcav = 0.0, vcr = 0.0, vid = 0.0; vec3 vg = vec3(0.0);
  float gDet = 1.0;
  if (chainM < 0.5) {
    // the pattern of a level depends only on its size (offset (n) for size 2^n), so the
    // pattern is continuous where the octave index changes
    DKV3 C = dkVor3(vRest / gC + (l0 + 1.0) * 7.31, Tr, an, tilt, dome, groove, uScl2.x);
    float dC = 1.0 - smoothstep(0.35, 0.9, fwr / gC);
    if (C.id2 >= fsub) {
      DKV3 F = dkVor3(vRest / gA + l0 * 7.31, Tr, an, tilt, dome, groove, uScl2.x);
      float dF = 1.0 - smoothstep(0.35, 0.9, fwr / gA);
      vh = F.h * gA * dF; vg = (F.g + uSkin3.z * (vec3(F.id, F.id2, fract(F.id * 7.13 + F.id2)) - 0.5) * 2.2) * dF; vcav = F.cav * dF; vcr = F.crown * dF; vid = F.id;
      gDet = dF;
    } else {
      vh = C.h * gC * dC; vg = (C.g + uSkin3.z * (vec3(C.id, C.id2, fract(C.id * 7.13 + C.id2)) - 0.5) * 2.2) * dC; vcav = C.cav * dC; vcr = C.crown * dC; vid = C.id;
      gDet = dC;
    }
    // scattered enlarged tubercles on the upper flanks, the neck and the outer limbs
    float tubD = 0.0;
    if (region < 0.5) tubD = uTub.x * smoothstep(0.06, 0.18, latD) * (1.0 - smoothstep(0.36, 0.52, latD));
    else if (region > 1.5 && region < 2.5) tubD = uTub.x * 0.55 * (1.0 - smoothstep(0.25, 0.55, latD));
    tubD *= (1.0 - gm) * (0.6 + 0.8 * n2);
    if (tubD > 0.01) {
      float gt = gC * 0.7 * uTub.y;
      DKT3 Tb = dkTub3(vRest / gt + 3.7, Tr, tubD, 0.42);
      float dT = 1.0 - smoothstep(0.35, 0.9, fwr / gt);
      if (Tb.m > 0.0) {
        float tm = Tb.m;
        vh = mix(vh, Tb.h * gt * uTub.z * dT, tm);
        vg = mix(vg, Tb.g * uTub.z * dT, tm);
        vcav = max(vcav * (1.0 - tm), 3.0 * tm * (1.0 - tm));
        vcr = mix(vcr, smoothstep(0.2, 1.0, Tb.h) * 0.9, tm);
        vid = mix(vid, Tb.id, tm);
      }
    }
  }
  float relief3 = mix(0.3, mix(0.22, 0.3, gm), isHead) * (uPat.x / 0.26) * mix(1.0, uHeadRel, isHead);
  // micro relief on the scales themselves: pits, creases and growth texture of old keratin
  // (no scale is a polished cushion), faded once it gets smaller than a pixel
  if (chainM < 0.5 && uSkin3.x > 0.0) {
    float cm = max(vMask2.z, L * 0.001) * uSkin3.y;
    vec4 mn = dkNoised(vRest / cm + 5.3);
    vec4 mn2 = dkNoised(vRest / (cm * 0.43) + 17.1);
    float fade = 1.0 - smoothstep(0.25, 0.7, fwr / cm);
    float on = (1.0 - vcav) * fade * uSkin3.x;
    vg += (mn.yzw + mn2.yzw * 0.45) * on * 0.08 / max(relief3, 1e-3);
    vcr *= 0.8 + 0.4 * mn.x;
    dkMicro = mix(0.5, mn.x * 0.7 + mn2.x * 0.3, on);
  }
  // ---- joint wrinkles (lines across the chain, on top of either layer)
  float wr = vMask.w * (0.6 + 0.4 * n2) * (1.0 - isHead);
  float wph = vScale.x * 1.7 + n2 * 4.0;
  float wv = sin(wph);
  vec2 wg = vec2(0.0, wr * 0.35 * 0.5 * cos(wph) * 1.7);
  // ---- healed scars: old gashes across several scales (rest-space segments)
  dkScarM = 0.0;
  for (int i = 0; i < 4; i++) {
    if (uScarB[i].w <= 0.0) continue;
    vec3 a = uScarA[i].xyz, ba = uScarB[i].xyz - a, pa = vRest - a;
    float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float wv2 = uScarA[i].w * (0.55 + 0.45 * sin(hh * 3.14159)) * (0.75 + 0.5 * dkVnoise2(vec2(hh * 14.0, float(i) * 3.0)));
    float dd = length(pa - ba * hh);
    dkScarM = max(dkScarM, (1.0 - smoothstep(wv2 * 0.55, wv2, dd)) * uScarB[i].w);
  }
  // amniotic residue (newborn): a pale, slimy film in patches and streaks that softens the scales
  dkResM = 0.0;
  if (uResidue.x > 0.0) {
    vec3 rq = vRest / uDirt.w;
    float rn = dkFbm(vec3(rq.x * 14.0, rq.y * 30.0, rq.z * 14.0)) * 0.7 + dkFbm(rq * 60.0 + 3.1) * 0.3;
    dkResM = smoothstep(0.5, 0.66, rn + 0.08 * (vMask.y - 0.5)) * uResidue.x;
  }
  // torn wing root (scout): an open, wet, dark wound - no scale relief inside, a ragged rim
  float dkWoundM = 0.0;
  if (uWoundR > 0.0) {
    float wd = length(vRest - uWound.xyz) + (n2 - 0.5) * uWoundR * 0.6 + (dkVnoise2(vRest.xz / uWoundR * 6.0) - 0.5) * uWoundR * 0.3;
    dkWoundM = smoothstep(uWoundR, uWoundR * 0.7, wd) * uWound.w;
  }
  float soften = (1.0 - dkScarM) * (1.0 - 0.75 * dkResM) * (1.0 - 0.9 * dkWoundM);
  float detK = mix(gDet, dkDetail, chainM) * (1.0 - dkOralM);
  dkGrad = (S.grad * uPat.x * chainM * dkDetail + wg * dkDetail) * soften * (1.0 - dkOralM);
  dkGranG = vg * relief3 * (1.0 - chainM) * soften * (1.0 - dkOralM);
  dkGranH = vh * relief3;
  dkGranM = 1.0 - chainM;
  float cav = mix(vcav, max(S.cav, wr * smoothstep(0.3, -0.9, wv) * 0.6), chainM);
  cav = max(cav, (1.0 - chainM) * wr * smoothstep(0.3, -0.9, wv) * 0.6);
  float crown = mix(vcr, S.wear, chainM);
  float sid = mix(vid, S.id, chainM);
  dkCav = cav * detK * soften;
  // --- colour
  vec3 col = uBase;
  col = mix(col, uDorsal, smoothstep(0.6, 0.0, latD) * 0.6 * (1.0 - isHead));
  col = mix(col, uBelly, smoothstep(0.35, 0.85, vMask.y));
  col *= 1.0 + uMisc.y * (n1 - 0.5) * 1.2;
  col *= 1.0 + uSkin2.w * (sid - 0.5) * detK;                                   // every scale its own shade
  col = mix(col, uDorsal * 1.15 + uWearCol * 0.15, (S.lv < 0.5 && S.lv >= 0.0 ? 0.35 : 0.0) * detK * chainM);   // dorsal scutes: weathered
  col = mix(col, uWearCol, clamp(crown * uSkin2.y * detK, 0.0, 1.0));           // rubbed, bleached keratin on the crowns
  col = mix(col, uScarCol, dkScarM * 0.85);
  col = mix(col, uResidue.yzw * mix(vec3(1.0), col * 1.6, 0.35), dkResM * 0.1);        // a thin translucent slime, not white flakes
  // crevices: shaded where occluded, dust-filled where they are open to the sky
  float open = clamp(vMask2.x * 1.15, 0.0, 1.0);
  col *= mix(1.0, uMisc.x, dkCav * (1.0 - 0.55 * open) * (1.0 - uCrev.w));
  col = mix(col, uCrev.rgb, clamp(dkCav * 1.6, 0.0, 1.0) * uCrev.w);     // flesh between the scales
  float crevDust = clamp(uSkin2.x * dkCav * 1.3 * open * smoothstep(0.45, 0.75, vNoise.y + 0.25 * (n2 - 0.5)), 0.0, 1.0);
  col = mix(col, uDustCol * 0.85, crevDust);
  // old keratin: dust held in the micro pits, lighter worn high points
  float pit = smoothstep(0.42, 0.18, dkMicro) * (1.0 - dkCav);
  col *= 0.9 + 0.22 * dkMicro;
  col = mix(col, uDustCol * 0.7, pit * uSkin2.x * 0.55 * open);
  // dust settles on the lower body and in crevices; salt crust in the deepest ones
  float low = smoothstep(uDirt.x, 0.0, vRest.y) + vMask.y * 0.25;
  float dn = vNoise.y;
  float dust = clamp(low * uDirt.y * smoothstep(0.48, 0.72, dn) + dkCav * low * 0.8 * uDirt.y * smoothstep(0.35, 0.6, dn), 0.0, 0.85);
  float salt = smoothstep(0.55, 0.75, vNoise.z) * smoothstep(0.2, 0.8, dkCav + 0.2 * low) * uDirt.z * clamp(low * 1.5, 0.0, 1.0);
  col = mix(col, uDustCol, dust);
  col = mix(col, uSaltCol, salt);
  // damp patches (dew, wet grass, mud) on the lower body: darker, glossier
  dkDampM = uDamp.x * smoothstep(0.52, 0.68, vNoise.z * 0.8 + low * 0.35 + (n2 - 0.5) * 0.2) * (1.0 - dust);
  col *= mix(1.0, uDamp.y, dkDampM);
  // mouth interior: wet gums/palate/tongue
  vec3 oral = mix(uOralDark, uOral, smoothstep(0.2, 0.9, vMask2.x) * (0.7 + 0.3 * n2));
  if (region > 6.5) oral = mix(uOralDark * 1.4, uBase * 0.8, 0.7);      // eyelid margins: wet, a little darker than the skin, not red
  col = mix(col, oral, dkOralM);
  // wound (detached wing stump): dark, rough
  if (uWoundR > 0.0) {
    col = mix(col, vec3(0.016, 0.005, 0.004) * (0.7 + 0.6 * vNoise.y), dkWoundM);
    dkCav = max(dkCav, dkWoundM * 0.3);
  }
  albedo = col;
  // --- roughness / metalness: polished crowns, rough dusty grooves
  float r = uRough.x + uRough.y * (sid - 0.5) - uRough.z * crown * detK + uRough.w * (dust + crevDust) + 0.25 * salt + 0.18 * dkCav + 0.2 * (0.5 - dkMicro);
  r = mix(r, 0.2, dkOralM);
  r = sqrt(r * r + (1.0 - detK) * 0.05 * (1.0 - dkOralM));    // sub-pixel scale relief -> roughness
  r = mix(r, r * uDamp.z, dkDampM);
  r = mix(r, 0.32, dkScarM * 0.7);                                                       // scar tissue: smooth, shiny
  r = mix(r, 0.3, dkResM);                                                               // slimy residue: soft sheen (the wet film carries the highlights)
  r = mix(r, 0.22, dkWoundM);                                                            // wet
  dkRoughOut = clamp(r, 0.06, 1.0);
  dkMetalOut = mix(uMisc.z, uMisc.w, clamp(dkCav * 1.4 + dust, 0.0, 1.0)) * (1.0 - dkOralM) * (1.0 - 0.75 * smoothstep(0.35, 0.85, vMask.y)) * (1.0 - 0.25 * dkResM);
  dkAO = vMask2.x * (1.0 - 0.55 * dkCav);
  // wet film (hatchling): mostly wet, streaks running down the body and a few drying patches
  dkWetK = 1.0;
  if (uWet.x > 0.0) {
    float streak = dkFbm(vec3(vRest.x * 9.0 / uDirt.w, vRest.y * 2.0 / uDirt.w, vRest.z * 9.0 / uDirt.w) * 6.0);
    dkWetK = clamp(0.35 + 0.9 * smoothstep(0.3, 0.6, streak) + 0.4 * vNoise.y, 0.0, 1.0) * uWet.x;
    dkRoughOut = mix(dkRoughOut, dkRoughOut * 0.85, dkWetK);   // (the film, not the base, carries the sharp highlights)
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
    n1 = dkPerturb(pv, n1, sl, faceDirection);
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
    // (and not on the undersides: a film facing sideways-down under the body - the crevice of a
    // folded thigh - sees body and ground, not sky; the rest-pose AO bake cannot know the pose)
    {
      vec3 dkUpV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
      clearcoatSpecularIndirect *= ambientOcclusion * ambientOcclusion * smoothstep(-0.2, 0.35, dot(reflect(-geometryViewDir, geometryClearcoatNormal), dkUpV))
        * smoothstep(-0.25, 0.4, dot(geometryClearcoatNormal, dkUpV));
    }
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
  #endif
}
#include <aomap_fragment>
#if defined( DK_SSAO ) && defined( USE_CLEARCOAT )
  // the runtime's screen-space AO darkens diffuse and specular IBL but not the clearcoat: the
  // wet film must not mirror the sky inside crevices the pose creates (the rest-pose AO bake
  // cannot know a thigh folded against the belly)
  { float dkAoC = mix( 1.0, dkAoS.r, dkAOStrength ); clearcoatSpecularIndirect *= dkAoC * dkAoC; }
#endif`);
  };
  return mat;
}

// ------------------------------------------------------------- membrane
/** (|x|, y, z, span) of the left wing root in rest space, for rest-space patterns. */
function wingRootOf(ctx) {
  const w = ctx.anat && ctx.anat.wings && (ctx.anat.wings.find((x) => x.side === 'L') || ctx.anat.wings[0]);
  if (!w) return [0, 0, 0, 1];
  let span = 0;
  for (const f of w.fingers) { const t = f.points[f.points.length - 1]; span = Math.max(span, Math.hypot(t[0] - w.root[0], t[1] - w.root[1], t[2] - w.root[2])); }
  return [Math.abs(w.root[0]), w.root[1], w.root[2], span || 1];
}
function membraneMaterial(THREE, P, ctx) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: P.memRough, metalness: 0, side: THREE.DoubleSide });
  const U = {
    uMemCol: { value: P.membrane }, uTransCol: { value: P.trans }, uVeinCol: { value: P.vein },
    uBillowL: { value: 0 }, uBillowR: { value: 0 }, uBillowScale: { value: ctx.L * 0.06 },
    uL: { value: ctx.L }, uFold: { value: 0 }, uMemRough: { value: P.memRough }, uMemSpec: { value: P.memSpec ?? 0.55 }, uMemSpecD: { value: P.memSpecD ?? 1.0 },
    // stripes (Charcoal: black bands throughout the grey membrane): count across the span,
    // band width (fraction of a period), noise warp, amount; the wing root and span (rest space)
    uStripe: { value: new THREE.Vector4(...(P.stripe || [0, 0, 0, 0])) }, uStripeCol: { value: P.stripeCol || new THREE.Color(0, 0, 0) },
    uWingRoot: { value: new THREE.Vector4(...wingRootOf(ctx)) },
    // torn membrane (the scout's lost LEFT wing): 0 = whole, 1 = ripped off the body
    uTear: { value: 0 },
  };
  mat.userData.dkUniforms = U;
  mat.customProgramCacheKey = () => 'dk-membrane';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aWing; attribute vec4 aEdge; attribute vec4 aBGrad;
uniform float uBillowL, uBillowR, uBillowScale;
varying vec4 vWing; varying vec4 vEdge; varying vec3 vRest;`)
      // camber: the panel is displaced along its normal by h = billow * profile, and the normal
      // is tilted by the gradient of h (n' = n - grad h), so the curved sail shades as curved
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
vec3 dkN0 = objectNormal;
{
  float bil = aEdge.z > 0.0 ? uBillowL : uBillowR;
  #ifdef USE_SKINNING
    vec3 bg = (skinMatrix * vec4(aBGrad.xyz, 0.0)).xyz;
  #else
    vec3 bg = aBGrad.xyz;
  #endif
  objectNormal = normalize(objectNormal - bil * uBillowScale * bg);
}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
vWing = aWing; vEdge = aEdge; vRest = position;
{ float bil = aEdge.z > 0.0 ? uBillowL : uBillowR; transformed += normalize(dkN0) * bil * aWing.w * uBillowScale; }`);
    let frag = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vWing; varying vec4 vEdge; varying vec3 vRest;
uniform vec3 uMemCol, uTransCol, uVeinCol, uStripeCol; uniform float uL, uFold, uMemRough, uMemSpec, uMemSpecD, uTear; uniform vec4 uStripe, uWingRoot;
float dkStripeM = 0.0;
${GLSL_COMMON}
${PERTURB}
float dkVein, dkThin, dkMemH, dkMemR; vec3 dkVeinAtt; vec3 dkMemG;
// blood vessels: meandering, branching lines (iso-contours of stretched value noise at three
// scales: arteries along the bones, branches, capillaries), thinning toward the free edge
float dkVessels(vec2 uv, float det, float detC) {
  // uv.x across the panel, uv.y along the vessels' general direction (out from the bones).
  // Vessels are ridges of a noise that varies mostly ACROSS (so they run along, meandering),
  // thinner and gated at finer scales (branches that start and stop), never closed loops.
  float m1 = dkVnoise2(vec2(uv.y * 0.9, 3.7)) - 0.5;
  float n1 = dkVnoise2(vec2(uv.x * 3.2 + m1 * 1.6, uv.y * 0.35));
  float r1 = 1.0 - smoothstep(0.0, 0.085, abs(n1 - 0.5));
  float m2 = dkVnoise2(vec2(uv.y * 2.1, 9.1)) - 0.5;
  float n2 = dkVnoise2(vec2(uv.x * 8.0 + m2 * 2.4 + uv.y * 0.8, uv.y * 0.9 + 5.0));
  float g2 = smoothstep(0.4, 0.65, dkVnoise2(vec2(uv.x * 2.0, uv.y * 1.5) + 11.0));
  float r2 = (1.0 - smoothstep(0.0, 0.06, abs(n2 - 0.5))) * g2;
  float n3 = dkVnoise2(vec2(uv.x * 20.0 + uv.y * 3.0, uv.y * 2.5 + 2.0));
  float g3 = smoothstep(0.5, 0.7, dkVnoise2(vec2(uv.x * 5.0, uv.y * 4.0) + 3.0));
  float r3 = (1.0 - smoothstep(0.0, 0.03, abs(n3 - 0.5))) * g3;
  return max(r1 * det, max(r2 * 0.6 * det, r3 * 0.3 * detC));
}
void dkMembrane(inout vec3 col) {
  float a = vWing.x, b = vWing.y, pid = vWing.z;
  if (uTear > 0.0) {
    // ripped from the body along a ragged line (the plagiopatagium's body edge, a = 0) and
    // split from the trailing edge into the wing in a few places
    float jag = dkVnoise2(vec2(b * 22.0, 1.3)) * 0.6 + dkVnoise2(vec2(b * 70.0, 4.1)) * 0.4;
    if (pid > 3.5 && a < 0.1 + 0.16 * jag) discard;
    float split = smoothstep(0.82, 0.97, dkVnoise2(vec2((pid > 3.5 ? a : b) * 9.0 + pid * 3.0, 2.0))) * smoothstep(0.55, 1.0, pid > 3.5 ? b : a);
    if (split * (0.7 + 0.6 * dkVnoise2(vec2(a, b) * 60.0)) > 0.55) discard;
  }
  vec2 fp = vec2(a, b);
  float fw = max(length(fwidth(fp)), 1e-5);
  float det = 1.0 - smoothstep(0.012, 0.035, fw);         // vessels resolvable
  float detC = 1.0 - smoothstep(0.004, 0.009, fw);        // capillaries, fine creases
  float along = pid > 3.5 ? b : a;
  float across = pid > 3.5 ? a : b;
  float nn = dkVnoise2(vec2(along * 6.0 + pid * 3.1, across * 6.0));
  dkVein = dkVessels(vec2(across * (pid > 3.5 ? 2.2 : 1.4) + pid * 1.7, along * 1.6), det, detC) * smoothstep(1.0, 0.75, along) * 0.6;
  // thickness: thick near bones and at the trailing-edge hem
  float nearBone = 1.0 - smoothstep(0.0, uL * 0.012, vEdge.x);
  float hem = 1.0 - smoothstep(0.0, uL * 0.004, vEdge.y);
  dkThin = (1.0 - 0.75 * nearBone) * (1.0 - 0.5 * hem) * (1.0 - 0.45 * dkVein) * (0.6 + 0.8 * dkFbm(vRest / uL * 9.0)) * (1.0 - 0.55 * uFold);
  // blood in the vessels absorbs the transmitted light: veins show dark red against the sun
  vec3 vt = uVeinCol / max(max(uVeinCol.r, uVeinCol.g), max(uVeinCol.b, 1e-4));
  dkVeinAtt = mix(vec3(1.0), vt * 0.8, dkVein * 0.55);      // soft vessels, never drawn lines
  float mot = dkFbm(vRest / uL * 30.0);
  float mot2 = dkFbm(vRest / uL * 90.0 + 4.1);
  // in reflected light the vessels show as a faint darker tracery, the skin is mottled, darker
  // and thicker along the bones and at the hem, a little paler where it is thinnest
  col = mix(uMemCol, uVeinCol, dkVein * 0.14) * (0.78 + 0.3 * mot + 0.16 * mot2) * (1.0 - 0.35 * hem) * (1.0 - 0.15 * uFold);
  col *= mix(1.0, 0.68, nearBone) * (0.9 + 0.2 * smoothstep(0.3, 1.0, dkThin));
  // pigment stripes: noise-warped bands across the span (concentric about the shoulder, so
  // every band crosses several panels), forking and pinching like an animal's pattern;
  // the pigment is in the skin, so the bands also block the light coming through
  if (uStripe.w > 0.0) {
    vec2 q = vec2(abs(vRest.x) - uWingRoot.x, vRest.z - uWingRoot.z) / uWingRoot.w;
    // bands run ALONG the fingers (out from the wrist toward the trailing edge), wavy, tapered
    // and broken, two or three per panel: bands across the radiating fingers - concentric or
    // straight - drew a spider's web
    float across = pid > 3.5 ? a : b;
    float r = across * (pid > 0.5 && pid < 3.5 ? 2.0 : 3.0) + pid * 0.37;
    float w1 = dkVnoise2(q * 3.0 + 4.0) - 0.5, w2 = dkVnoise2(q * 9.0 + 1.3) - 0.5;
    float ph = r + (w1 * 1.2 + w2 * 0.35) * uStripe.z;
    float band = 0.5 - 0.5 * cos(ph * 6.2832);                         // 0 between bands .. 1 at a band centre
    float wv = uStripe.y * (0.25 + 1.3 * dkVnoise2(q * vec2(5.0, 9.0) + 9.0) * dkVnoise2(q * 13.0 + 2.0));   // bands swell, taper and pinch
    float edge = fwidth(ph) * 1.5 + 0.09;          // (soft pigment edges, not a printed graphic)
    dkStripeM = smoothstep(1.0 - wv - edge, 1.0 - wv + edge, band) * uStripe.w;
    dkStripeM *= smoothstep(0.18, 0.42, dkVnoise2(q * vec2(7.0, 3.5) + 2.7) + 0.2 * band);   // bands break and fork
    dkStripeM *= smoothstep(0.03, 0.12, length(q));                     // no band on the shoulder itself
    col = mix(col, uStripeCol * (0.85 + 0.3 * mot), dkStripeM);
    dkThin *= 1.0 - 0.85 * dkStripeM;
  }
  // relief: vessels raised a little, fine stretch creases across the span; a folded wing
  // gathers into many soft wrinkles running along the bones
  // elastin fibres: fine ridges spanning the panel (bat wings show them as striations)
  float fib = along * 90.0 + nn * 14.0 + dkVnoise2(vec2(across * 4.0, along * 7.0)) * 10.0;
  float fibA = smoothstep(0.35, 0.75, dkVnoise2(vec2(across * 2.5 + 7.0, along * 3.0)));      // in patches, not everywhere
  float crease = (sin(fib) * 0.5 + 0.5) * 0.0005 * uL * detC * fibA + (sin(along * 23.0 + nn * 6.0) * 0.5 + 0.5) * 0.00025 * uL * det;
  col *= 1.0 - 0.09 * (sin(fib) * 0.5 + 0.5) * detC * fibA;
  // the skin gathers in a few soft folds running along each bone (it slides over the bone as
  // the fingers spread and flex), fading out a hand's breadth from it
  float fdB = vEdge.x / (uL * 0.0045);
  float boneFold = (sin(fdB * 6.2832 + nn * 2.5) * 0.5 + 0.5) * (1.0 - smoothstep(0.4, 3.2, fdB)) * smoothstep(0.0, 0.35, fdB);
  crease += boneFold * 0.0007 * uL * det;
  col *= 1.0 - 0.07 * boneFold * det;
  float wrinkle = (sin(across * 70.0 + nn * 9.0 + dkVnoise2(vec2(along * 9.0, across * 4.0)) * 5.0) * 0.5 + 0.5) * 0.0014 * uL * det * uFold;
  dkMemH = crease * (1.0 - uFold) + wrinkle + dkVein * 0.00012 * uL;
  // tension wrinkles fanning out from the finger tips into the panel (the skin is pulled taut
  // between the tips of a spread hand)
  if (pid > 0.5 && pid < 3.5) {
    float ta = (1.0 - a) * 2.5;
    float d0 = length(vec2(ta, b)), d1 = length(vec2(ta, 1.0 - b));
    float th0 = atan(b, ta + 1e-3), th1 = atan(1.0 - b, ta + 1e-3);
    float tw = (sin(th0 * 16.0 + nn * 2.5) * 0.5 + 0.5) * exp(-d0 * 3.5) + (sin(th1 * 16.0 + nn * 2.5) * 0.5 + 0.5) * exp(-d1 * 3.5);
    dkMemH += tw * 0.0006 * uL * det * (1.0 - uFold);
  }
  // leathery micro texture (bat-wing skin): a fine network of creases in rest space with an
  // analytic slope, so the sheen breaks up instead of reading as a smooth sheet
  float sc = uL * 0.0032;
  vec4 l1 = dkNoised(vRest / sc + 1.7);
  vec4 l2 = dkNoised(vRest / (sc * 0.42) + 9.2);
  float fwr = length(fwidth(vRest));
  float lf = (1.0 - smoothstep(0.3, 0.8, fwr / sc));
  float lf2 = (1.0 - smoothstep(0.3, 0.8, fwr / (sc * 0.42)));
  // (kept subtle: stronger, it reads as felt or cloth instead of skin)
  dkMemG = (-2.0 * sign(l1.x - 0.5) * l1.yzw * 0.03 * lf + l2.yzw * 0.015 * lf2) * (1.0 + uFold);
  float cr = 1.0 - 2.0 * abs(l1.x - 0.5);
  col *= 1.0 - 0.18 * smoothstep(0.75, 1.0, cr) * lf;           // creases a little darker
  dkMemR = clamp(uMemRough * (0.8 + 0.45 * l2.x) * (0.72 + 0.6 * mot) + 0.1 * cr * lf + 0.08 * hem + 0.12 * nearBone, 0.15, 1.0);
}
vec3 dkTransmit(vec3 lightCol, vec3 L, vec3 N, vec3 V) {
  float back = saturate(-dot(N, L));
  float fwd = pow(saturate(dot(-V, L)), 6.0);
  return lightCol * uTransCol * dkVeinAtt * dkThin * back * (0.3 + 1.6 * fwd) * RECIPROCAL_PI;
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 c; dkMembrane(c); diffuseColor.rgb = c; }`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = dkMemR;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = dkPerturb(-vViewPosition, normal, dkSlope(dkMemH, -vViewPosition), faceDirection);
{
  vec3 pv = -vViewPosition;
  vec2 sl = vec2(dot(dkMemG, dFdx(vRest)) / max(length(dFdx(pv)), 1e-7), dot(dkMemG, dFdy(vRest)) / max(length(dFdy(pv)), 1e-7));
  normal = dkPerturb(pv, normal, sl, faceDirection);
}`);
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
    // direct (sun) sheen per creature: a melanistic membrane is matte black skin, not a grey tarp
    frag = frag.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.directSpecular *= uMemSpecD;`);
    frag = frag.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  radiance *= uMemSpec;   // skin, not plastic: a satin sheen, no mirror-bright sky at grazing angles
#endif
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
  const U = { uIrisA: { value: P.iris[0] }, uIrisB: { value: P.iris[1] }, uSclera: { value: P.sclera }, uEyeR: { value: eyeRadius }, uPupil: { value: P.pupil ?? 0.075 },
    uFleck: { value: P.fleck || new THREE.Color(0, 0, 0) }, uFleckAmt: { value: P.fleck ? 0.7 : 0 } };
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
uniform vec3 uIrisA, uIrisB, uSclera, uFleck; uniform float uEyeR, uPupil, uFleckAmt;
float dkEyeOcc = 1.0;
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
  // fine metallic flecks in the iris stroma (reptile eyes; the gold newborn's are gold)
  float fl = smoothstep(0.78, 0.95, dkVnoise2(vec2(th * 26.0, rho * 14.0) + 3.0)) * smoothstep(0.25, 0.5, rho) * (1.0 - smoothstep(0.85, 0.98, rho));
  iris = mix(iris, uFleck, fl * uFleckAmt);
  iris *= 1.0 - 0.75 * smoothstep(0.78, 1.0, rho);         // dark limbal ring
  iris *= 1.0 - 0.3 * smoothstep(0.35, 0.0, rho) * 0.0 + 0.18 * (dkVnoise2(vec2(th * 7.0, rho * 2.0)) - 0.5);   // blotches
  iris = mix(iris, uIrisB * 0.4, smoothstep(1.2, 1.6, pu) * 0.0 + (1.0 - smoothstep(1.0, 1.35, pu)) * 0.5);
  iris = mix(vec3(0.004), iris, smoothstep(0.95, 1.08, pu));
  float inIris = 1.0 - smoothstep(0.98, 1.03, rho);
  return mix(uSclera, iris, inIris);
}
`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
diffuseColor.rgb = dkIris(-vViewPosition, normal);
// the upper lid and the brow shade the top of the eye; the socket darkens its rim
{ float occ = mix(0.65, 1.0, smoothstep(0.65, -0.1, vEyeL.y)) * mix(0.7, 1.0, smoothstep(0.45, 0.8, vEyeL.z));
  diffuseColor.rgb *= occ; dkEyeOcc = occ; }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= dkEyeOcc;
reflectedLight.directDiffuse *= mix(0.6, 1.0, dkEyeOcc);`);
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
  if (kind > 3.5) {
    // gums: wet, fleshy, a little lumpy, darker in the folds between the teeth
    float lump = dkVnoise2(vec2(ar * 9.0, t * 6.0 + seed * 13.0));
    col = uGum * (0.9 + 0.5 * lump) * vec3(1.15, 0.9, 0.85);
    dkKR = 0.32 + 0.12 * lump;
  } else {
    // teeth: every tooth its own shade; stained brown-yellow at the gum line (tartar), ivory
    // in the middle, pale worn enamel at the tip; fine vertical cracks
    float tid = seed;
    vec3 ivory = uTooth * (0.72 + 0.45 * tid) * vec3(1.0, 0.97 - 0.08 * tid, 0.9 - 0.14 * tid);
    ivory *= mix(1.0, 0.62, smoothstep(0.78, 0.9, fract(tid * 7.31)));                 // a few old, dark-stained teeth
    col = ivory * (0.85 + 0.25 * stri);
    float crack = smoothstep(0.82, 0.95, dkVnoise2(vec2(ar * 40.0 + tid * 7.0, t * 2.5)));
    col *= 1.0 - 0.35 * crack * smoothstep(0.15, 0.6, t);
    vec3 stain = uTooth * vec3(0.62, 0.52, 0.36);
    col = mix(stain, col, smoothstep(0.08, 0.28 + 0.15 * tid, t));                      // tartar / staining near the gum
    col = mix(col, uTooth * vec3(1.06, 1.03, 0.97) * 1.12, smoothstep(0.75, 1.0, t) * (0.6 + 0.4 * tid));   // pale worn tip
    col = mix(uGum * 0.6, col, smoothstep(0.03, 0.14, t));                            // buried in the gum
    dkKR = mix(0.55, 0.28, smoothstep(0.2, 0.9, t)) + 0.15 * crack;
  }` : `
  if (kind < 0.5) {          // horn: growth rings toward the base, polished tip
    col = mix(uHornA, uHornB, pow(t, 1.4));
    col *= 0.8 + 0.35 * stri;
    dkKR = mix(0.55, 0.3, t) + 0.1 * (stri - 0.5);
  } else if (kind < 1.5) {   // claw
    col = mix(uClawA, uClawB, pow(t, 1.6));
    col *= 0.85 + 0.3 * stri;
    dkKR = mix(0.45, 0.25, t);
  } else {                   // dorsal spike: weathered, dusty keratin (no polished saw teeth)
    col = mix(uHornA, uHornB, pow(t, 1.2) * 0.65);
    col *= 0.8 + 0.35 * stri;
    dkKR = 0.62 + 0.1 * (stri - 0.5);
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
    membraneTorn: membraneMaterial(THREE, P, ctx),
    eye: eyeMaterial(THREE, P, ctx, eyeR),
    keratin: keratinMaterial(THREE, P, 'keratin'),
    teeth: keratinMaterial(THREE, P, 'teeth'),
    /** pose-driven uniforms: billowL/billowR (-1..1), pupil (slit width) */
    setPoseUniforms(u) {
      for (const mm of [mats.membrane, mats.membraneTorn]) {
        const m = mm.userData.dkUniforms;
        if (u.billowL !== undefined) m.uBillowL.value = u.billowL;
        if (u.billowR !== undefined) m.uBillowR.value = u.billowR;
        m.uFold.value = u.drape ? Math.max(u.drape.L ? u.drape.L[1] : 0, u.drape.R ? u.drape.R[1] : 0) : 0;
      }
      if (u.tear !== undefined) mats.membraneTorn.userData.dkUniforms.uTear.value = u.tear;
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
