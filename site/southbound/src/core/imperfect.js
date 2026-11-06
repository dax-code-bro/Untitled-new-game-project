// Micro-surface imperfection and abrasion for every PBR surface in the game.
//
// Real surfaces are never uniformly glossy: hands, weather and wear leave patches that are
// shinier or duller, glossy paint and metal carry hairline scratches that only show where they
// catch a highlight, anything facing up collects a little dust, and nothing is perfectly flat up
// close. This adds all of that to three.js's shared Standard/Physical shader code, so every
// material that uses the stock roughness/normal stages gets it (cars' trim, props, guns, street
// furniture, interiors, clothing, glass). Materials with their own surface model (buildings,
// terrain, roads, car paint) replace those stages and keep theirs.
//
// On top of that, meshes that core/abrasion.js has baked (SB_WEAR) wear along their real edges:
// the convex ones knocked back to what's under the finish, the inside corners full of grime, each
// substrate in its own way (see abrasion.js).
//
// Everything is in world space (no UVs needed), derived from the view position the shader already
// has, and fades out with distance so it never sparkles. Medium preset and up.
import * as THREE from 'three';

const PARS = /* glsl */ `
#ifdef STANDARD
float sbImpH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sbImpN(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sbImpH(i), sbImpH(i + vec3(1,0,0)), f.x), mix(sbImpH(i + vec3(0,1,0)), sbImpH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sbImpH(i + vec3(0,0,1)), sbImpH(i + vec3(1,0,1)), f.x), mix(sbImpH(i + vec3(0,1,1)), sbImpH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// hairline scratches: short straight lines in random directions, a couple per 11 cm cell, laid in
// the surface's own plane
float sbImpScratch(vec3 p, vec3 n){
  vec3 an = abs(n);
  vec2 q = (an.y > max(an.x, an.z) ? p.xz : (an.x > an.z ? p.zy : p.xy)) * 9.0;
  vec2 c = floor(q), f = fract(q);
  float s = 0.0;
  for (int k = 0; k < 2; k++) {
    float h = fract(sin(dot(c + float(k) * 7.13, vec2(127.1, 311.7))) * 43758.5453);
    if (h < 0.55) continue;
    float a = h * 31.4159;
    vec2 d = vec2(cos(a), sin(a)), o = vec2(fract(h * 13.7), fract(h * 71.3));
    float across = abs(dot(f - o, vec2(-d.y, d.x))), along = abs(dot(f - o, d));
    s += (1.0 - smoothstep(0.0, 0.012, across)) * (1.0 - smoothstep(0.18, 0.48, along));
  }
  return clamp(s, 0.0, 1.0);
}
vec3 sbImpBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir){
  vec3 sx = normalize(dFdx(surf_pos)), sy = normalize(dFdy(surf_pos));
  vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surf_norm - grad);
}
#ifdef SB_WEAR
varying vec4 vSbEdge; varying float vSbScale;
#endif
#endif
`;

const ROUGH = /* glsl */ `
#if defined( STANDARD ) && !defined( FLAT_SHADED ) && !defined( SB_NO_IMPERFECT )
{
  vec3 sbW = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
  float sbD = length(vViewPosition);
  float n3 = sbImpN(sbW * 0.37 + 5.0);
  float glossy = 1.0 - smoothstep(0.25, 0.8, roughnessFactor);
  if (sbD < 40.0) {
    // up close: handled, rubbed and weathered patches, some shinier and some duller; hairline
    // scratches that catch the light on paint, metal and glass; dust on whatever faces up
    vec3 sbWN = inverseTransformDirection(normalize(vNormal), viewMatrix);
    float sbNear = 1.0 - smoothstep(6.0, 40.0, sbD);
    float n1 = sbImpN(sbW * 1.7), n2 = sbImpN(sbW * 6.3 + 17.0);
    roughnessFactor += ((n3 * 0.55 + n1 * 0.45 - 0.5) * (0.07 + 0.14 * glossy)) + (n2 - 0.5) * 0.05 * sbNear;
    if (sbD < 9.0) roughnessFactor += sbImpScratch(sbW, sbWN) * glossy * 0.32 * (1.0 - smoothstep(2.0, 9.0, sbD));
    float sbDust = smoothstep(0.55, 0.95, sbWN.y) * smoothstep(0.38, 0.78, n1 * 0.6 + n3 * 0.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.43, 0.4, 0.35), sbDust * 0.1);
    roughnessFactor = mix(roughnessFactor, 0.9, sbDust * 0.22);
  } else {
    // far away only the broad patches are left (one noise, not five)
    roughnessFactor += (n3 - 0.5) * (0.07 + 0.14 * glossy);
  }
  roughnessFactor = clamp(roughnessFactor, 0.03, 1.0);
}
#endif
`;

// edge wear and cavity grime, after metalness is known (painted metal chips to bare steel)
const WEAR = /* glsl */ `
#if defined( STANDARD ) && defined( SB_WEAR ) && !defined( FLAT_SHADED ) && !defined( SB_NO_IMPERFECT )
if (vSbEdge.w < 0.5 && length(vViewPosition) < 45.0) {
  int fam = int(vSbEdge.w * 100.0 + 0.5) - 1;
  vec3 sbW = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
  // how far this pixel is from the nearest outside edge (dv) and inside corner (dc), in metres
  float dv = 1e9, dc = 1e9;
  if (vSbEdge.x < 5000.0) dv = min(dv, vSbEdge.x); else if (vSbEdge.x < 50000.0) dc = min(dc, vSbEdge.x - 10000.0);
  if (vSbEdge.y < 5000.0) dv = min(dv, vSbEdge.y); else if (vSbEdge.y < 50000.0) dc = min(dc, vSbEdge.y - 10000.0);
  if (vSbEdge.z < 5000.0) dv = min(dv, vSbEdge.z); else if (vSbEdge.z < 50000.0) dc = min(dc, vSbEdge.z - 10000.0);
  dv *= vSbScale; dc *= vSbScale;
  float fam_w = fam == 3 ? 1.3 : fam == 4 ? 1.2 : fam == 6 ? 1.6 : fam == 8 ? 1.5 : fam == 13 ? 1.5 : fam == 2 ? 0.7 : fam == 7 || fam == 12 ? 0.5 : fam == 10 ? 0.6 : fam == 9 ? 0.8 : 1.0;
  // only coatings and brittle things chip off in flakes (paint, wood, stone, plaster)
  float chips = fam == 1 || fam == 3 || fam == 4 || fam == 6 || fam == 13 ? 1.0 : 0.0;
  float age = sbImpN(sbW * 0.23 + 11.0); // some things (and some sides of things) have had a harder life
  float nb = sbImpN(sbW * 18.0) * 0.6 + sbImpN(sbW * 55.0) * 0.4; // a chipped, ragged line, not a stripe
  // most of an edge is barely touched, here and there it's knocked back a centimetre or more
  float width = (0.004 + 0.026 * age) * fam_w * (0.15 + 1.6 * nb * nb);
  float fw = fwidth(dv) + 1e-4;
  float edge = 1.0 - smoothstep(width - fw, width + fw, dv);
  // and a few chips stand off the edge on their own
  float nc = sbImpN(sbW * 34.0 + 3.0);
  edge = max(edge, chips * step(0.8 - 0.22 * age, nc) * (1.0 - smoothstep(0.02 * fam_w, 0.045 * fam_w, dv)) * smoothstep(0.25, 0.6, age));
  float cav = 1.0 - smoothstep(0.0, (0.015 + 0.05 * age) * (0.55 + nb), dc);
  float fade = 1.0 - smoothstep(25.0, 45.0, length(vViewPosition));
  edge *= fade; cav *= fade * (0.55 + 0.45 * age);
  vec3 dc0 = diffuseColor.rgb;
  if (fam == 1) { // painted metal: chips to bright bare steel, rust in the joints
    diffuseColor.rgb = mix(dc0, vec3(0.6, 0.6, 0.58), edge); metalnessFactor = mix(metalnessFactor, 1.0, edge); roughnessFactor = mix(roughnessFactor, 0.32, edge);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.11, 0.05), cav * 0.55); roughnessFactor = mix(roughnessFactor, 0.9, cav * 0.6); metalnessFactor *= 1.0 - cav * 0.8;
  } else if (fam == 2) { // bare metal: edges rubbed bright and smooth, dark oily grime in the corners
    diffuseColor.rgb = mix(dc0, min(dc0 * 1.25 + 0.05, vec3(1.0)), edge * 0.7); roughnessFactor *= 1.0 - 0.55 * edge;
    diffuseColor.rgb *= 1.0 - 0.55 * cav; roughnessFactor = mix(roughnessFactor, 0.7, cav * 0.55);
  } else if (fam == 3) { // raw wood: worn pale on the arrises, dirty in the joints
    diffuseColor.rgb = mix(dc0, dc0 * 1.45 + vec3(0.05, 0.035, 0.015), edge * 0.7); roughnessFactor = mix(roughnessFactor, min(1.0, roughnessFactor + 0.12), edge);
    diffuseColor.rgb *= 1.0 - 0.5 * cav;
  } else if (fam == 4) { // painted wood: the paint rubs through to timber
    diffuseColor.rgb = mix(dc0, vec3(0.27, 0.15, 0.06), edge * 0.85); roughnessFactor = mix(roughnessFactor, 0.8, edge);
    diffuseColor.rgb *= 1.0 - 0.45 * cav;
  } else if (fam == 5) { // plastic: stress-whitened edges
    diffuseColor.rgb = mix(dc0, dc0 * 0.8 + 0.14, edge * 0.6); roughnessFactor = min(1.0, roughnessFactor + 0.18 * edge);
    diffuseColor.rgb *= 1.0 - 0.4 * cav;
  } else if (fam == 6) { // stone, concrete, brick: chipped pale, grime in the recesses
    diffuseColor.rgb = mix(dc0, dc0 * 1.3 + 0.03, edge * 0.6);
    diffuseColor.rgb *= 1.0 - 0.45 * cav; roughnessFactor = mix(roughnessFactor, 0.95, cav * 0.4);
  } else if (fam == 7) { // glass: frosted where it's been rubbed
    roughnessFactor = mix(roughnessFactor, 0.45, edge * 0.8); diffuseColor.rgb *= 1.0 - 0.3 * cav; roughnessFactor = mix(roughnessFactor, 0.6, cav * 0.5);
  } else if (fam == 8) { // fabric: faded and fluffy on the edges
    float g = dot(dc0, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb = mix(dc0, mix(dc0, vec3(g), 0.5) * 1.3 + 0.02, edge * 0.7); roughnessFactor = mix(roughnessFactor, 1.0, edge);
    diffuseColor.rgb *= 1.0 - 0.35 * cav;
  } else if (fam == 9) { // leather: pale and polished where it rubs, dark in the creases
    diffuseColor.rgb = mix(dc0, dc0 * 1.4 + 0.02, edge * 0.6); roughnessFactor *= 1.0 - 0.35 * edge;
    diffuseColor.rgb *= 1.0 - 0.5 * cav;
  } else if (fam == 10) { // rubber: dusty grey
    diffuseColor.rgb = mix(dc0, vec3(0.16, 0.155, 0.15), edge * 0.6); roughnessFactor = mix(roughnessFactor, 1.0, edge);
    diffuseColor.rgb *= 1.0 - 0.4 * cav;
  } else if (fam == 12) { // ceramic: tiny white chips, grimy grout lines
    diffuseColor.rgb = mix(dc0, vec3(0.7, 0.7, 0.68), edge * 0.5); diffuseColor.rgb *= 1.0 - 0.5 * cav; roughnessFactor = mix(roughnessFactor, 0.85, cav * 0.6);
  } else if (fam == 13) { // plaster: scuffed white, dirty in the corners
    diffuseColor.rgb = mix(dc0, dc0 * 0.85 + 0.12, edge * 0.5); roughnessFactor = mix(roughnessFactor, 1.0, edge * 0.5);
    diffuseColor.rgb *= 1.0 - 0.4 * cav;
  } else { // anything else: a little lighter on the edges, darker in the corners
    diffuseColor.rgb = mix(dc0, dc0 * 1.2 + 0.03, edge * 0.4); diffuseColor.rgb *= 1.0 - 0.4 * cav;
  }
  roughnessFactor = clamp(roughnessFactor, 0.03, 1.0); metalnessFactor = clamp(metalnessFactor, 0.0, 1.0);
}
#endif
`;

const NORMAL = /* glsl */ `
#if defined( STANDARD ) && !defined( FLAT_SHADED ) && !defined( SB_NO_IMPERFECT )
{
  // up close nothing is perfectly flat: a faint orange-peel / cast / worn texture in the highlights
  float sbD2 = length(vViewPosition);
  if (sbD2 < 18.0) {
    vec3 sbW2 = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
    float sbFade = 1.0 - smoothstep(3.0, 18.0, sbD2);
    float bh = sbImpN(sbW2 * 9.0) * 0.6 + sbImpN(sbW2 * 23.0) * 0.4;
    normal = sbImpBump(-vViewPosition, normal, vec2(dFdx(bh), dFdy(bh)) * 0.03 * sbFade, faceDirection);
  }
}
#endif
`;

const VPARS = /* glsl */ `
#if defined( STANDARD ) && defined( SB_WEAR )
attribute vec4 sbEdge; varying vec4 vSbEdge; varying float vSbScale;
#endif
`;
const VMAIN = /* glsl */ `
#if defined( STANDARD ) && defined( SB_WEAR )
vSbEdge = sbEdge;
vSbScale = length(modelMatrix[0].xyz);
#ifdef USE_INSTANCING
vSbScale *= length(instanceMatrix[0].xyz);
#endif
#endif
`;

let installed = false;
export function installImperfections(quality) {
  if (installed || quality.label === 'Phone' || quality.label === 'Low') return false;
  installed = true;
  const C = THREE.ShaderChunk;
  C.roughnessmap_pars_fragment += '\n' + PARS;
  C.roughnessmap_fragment += '\n' + ROUGH;
  C.metalnessmap_fragment += '\n' + WEAR;
  C.normal_fragment_maps += '\n' + NORMAL;
  C.displacementmap_pars_vertex += '\n' + VPARS;
  C.clipping_planes_vertex += '\n' + VMAIN;
  return true;
}
