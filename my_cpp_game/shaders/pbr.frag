// Ported from engine/src/50-shaders.js GLSL.pbrFrag (GLSL ES 3.00 -> 4.50 core).
#include "lib/common.glsl"
#include "lib/sky.glsl"
#include "lib/pbr.glsl"
#include "lib/shadow.glsl"
#include "lib/fog.glsl"

in vec3 vWorldPos;
in vec3 vNormal;
in vec4 vTangent;
in vec2 vUv;
in vec3 vTint;
in vec4 vParams;
in float vViewDepth;
in vec3 vObjPos;
in vec3 vObjScale;
in mat3 vObjRot;

/* ---- NATIVE: THE EDGE BEVEL ----
   Nothing built is razor-sharp: a wall, a kerb, a table top all end in a
   rounded edge a centimetre or three across, and that edge is what catches
   the light and tells the eye where one plane turns into the next. Every
   box in the maps is a unit cube scaled by its actor, so its size and the
   fragment's place on it are known here exactly, and the normal a ROUNDED
   box of radius uBevel would have at this point is closed-form:
       q = |p| - (halfExtent - r);  n = sign(p) * max(q, 0)
   which is the face normal across the face and swings through 45 degrees
   at the edge. uBevel is 0 for every mesh that is not a box, and the
   radius is capped at 0.45 of the smallest half-extent so a thin slab
   rounds its edge rather than turning into a cylinder. */
uniform float uBevel;

/* ---- NATIVE: WATER ----
   The maps build their lakes and pools as flat boxes, and a flat dark box
   is what they looked like: a grey sheet with a blurred blob of sun on it.
   uWater marks those draws (the importer tags them by name). The normal
   becomes a sum of directional waves -- a long swell, a cross-swell, wind
   chop -- plus two scrolling octaves of fine noise, evaluated analytically
   in world space, and the roughness drops to nearly a mirror. Everything
   else follows from the PBR and screen-space passes already running: the
   Fresnel term makes it dark looking down and a sky mirror at grazing
   angles, SSR reflects the pier and the trees in the ripples (the rippled
   normal goes into the G-buffer), and the sun turns into a glitter path
   instead of a smear. The high frequencies fade with distance, and the
   roughness rises to stand in for the waves that went sub-pixel. */
uniform float uWater;
/* NATIVE: WEATHERING. The maps are built from flat-coloured boxes, and a
   flat colour over twenty metres of wall or road is the single strongest
   tell that a scene is made of primitives. Three cheap, world-space terms
   the importer switches on per draw (DrawItem::weathering / wetGround):
     - macro variation, 6 m and 25 m octaves of brightness and warmth, so
       no two stretches of the same material are the same shade;
     - on box sides, grime splashed up the foot of the wall and rain
       streaks run down from under its top;
     - on outdoor ground, damp patches, standing puddles (a flat mirror:
       the SSR and probe do the rest) and cracks along noise contours. */
uniform float uWeathering;
/* NATIVE: INTERIOR MAPPING. A window the building kit hung on a solid wall
   has nothing behind it, and dark glass on every house reads as a boarded
   street. uInterior > 0 marks those panes: the view ray is traced, in the
   pane's own frame, into a room that is not there -- back wall, side walls,
   floorboards, ceiling -- with a curtain just behind the glass, a cabinet
   against the back wall, daylight falling off with depth and, in some
   rooms, a lamp. Every room is seeded by where its window is, so no two
   neighbours match. The value is the room's brightness; it is added under
   the glass's own reflection, weighted by what the Fresnel term lets in. */
uniform float uInterior;
uniform float uWetGround;
vec3 waterNormal(vec2 p, float t, float dist){
  vec2 g = vec2(0.0);
  // direction.xy, wavelength (m), amplitude (m)
  /* Wavelengths in no simple ratio and directions spread round a prevailing
     wind, so no two crests line up into the corduroy a regular set makes. */
  const vec4 W[10] = vec4[10](
    vec4( 0.82,  0.57, 11.3, 0.045),
    vec4( 0.36,  0.93,  7.1, 0.030),
    vec4( 0.97,  0.24,  4.7, 0.021),
    vec4(-0.21,  0.98,  3.3, 0.014),
    vec4( 0.70, -0.71,  2.3, 0.010),
    vec4( 0.55,  0.83,  1.61, 0.0068),
    vec4(-0.64,  0.77,  1.13, 0.0047),
    vec4( 0.99, -0.12,  0.79, 0.0032),
    vec4( 0.13,  0.99,  0.53, 0.0021),
    vec4(-0.86,  0.51,  0.37, 0.0014));
  for (int i = 0; i < 10; i++) {
    vec2 d = normalize(W[i].xy);
    float k = 6.2831853 / W[i].z;
    float w = sqrt(9.81 * k);
    float fade = 1.0 - smoothstep(W[i].z * 25.0, W[i].z * 90.0, dist);
    g += W[i].w * k * d * cos(k * dot(d, p) - w * t) * fade;
  }
  // Fine chop: finite-difference gradient of two scrolling noise octaves.
  float near = 1.0 - smoothstep(8.0, 45.0, dist);
  if (near > 0.0) {
    vec2 q1 = p * 1.7 + vec2(t * 0.31, t * 0.17);
    vec2 q2 = p * 4.1 - vec2(t * 0.23, -t * 0.41);
    float e = 0.05;
    float n0 = valueNoise(vec3(q1, 0.0)) + 0.5 * valueNoise(vec3(q2, 3.0));
    float nx = valueNoise(vec3(q1 + vec2(e, 0.0), 0.0)) + 0.5 * valueNoise(vec3(q2 + vec2(e, 0.0), 3.0));
    float nz = valueNoise(vec3(q1 + vec2(0.0, e), 0.0)) + 0.5 * valueNoise(vec3(q2 + vec2(0.0, e), 3.0));
    g += vec2(nx - n0, nz - n0) / e * 0.018 * near;
  }
  return normalize(vec3(-g.x, 1.0, -g.y));
}

vec3 bevelNormal(out float edge){
  vec3 h = 0.5 * vObjScale;
  float r = min(uBevel, 0.45 * min(h.x, min(h.y, h.z)));
  vec3 q = abs(vObjPos) - (h - r);
  vec3 nl = sign(vObjPos) * max(q, vec3(0.0));
  float len = length(nl);
  if (len < 1e-6) { edge = 0.0; return normalize(vNormal); }
  nl /= len;
  float m = max(abs(nl.x), max(abs(nl.y), abs(nl.z)));
  edge = smoothstep(0.0, 0.25, 1.0 - m);      // 0 across a face, 1 on the arc
  return normalize(vObjRot * nl);
}

uniform vec3 uCameraPos;
uniform float uTime;
uniform vec3 uBaseColor;
uniform float uRoughness;
uniform float uMetalness;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uUvScale;
uniform float uNormalStrength;
/* ---- world-projected UVs ----
   A box mesh is a UNIT cube scaled by the actor, and its UVs run 0..1
   across every face. So one uvScale means one tile across a face,
   whatever size that face is: a two-metre crate and a hundred-and-
   seventy-metre ground slab sharing a material get texel densities a
   hundred times apart, and the big one reads as flat shading with a
   smear on it. That is the whole of the "one wall is detailed and the
   next is just maths" fault -- it was never the recipe.

   With uWorldUv the texture is projected from world space down the
   surface's dominant axis instead, and uvScale becomes TILES PER
   METRE. A crate and a runway then carry the same grain, and a slab
   that is twelve metres one way and three the other stops being
   stretched three-to-one. The frame for the normal map has to come
   from the same projection, not from the mesh tangents, or the relief
   lights from the wrong direction on four faces out of six. */
uniform int uWorldUv;
/* ---- the detail layer ----
   Texel density, not more texture. See the block in main(). */
uniform float uDetailScale;
uniform float uDetailFade;
uniform float uDetail;
uniform float uSubsurface;
uniform int uHasMaps;
uniform int uReceiveShadow;
uniform int uDebugMode;
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform sampler2D uOrmMap;
/* ---- FEATURE 6: CLEARCOAT AND SHEEN, PER MATERIAL ----
 *
 * Both default to 0 and both cost one uniform compare when they are.
 * They are NOT behind a quality tier, and that is the point: they are
 * material description, not an effect budget. A map that puts a coat
 * on a crane's paint or sheen on a uniform gets it on a phone, because
 * what it costs is a branch nobody takes on the other four hundred
 * materials in the scene. Nothing in the engine sets either today
 * except the two new presets in 40-material.js, so no existing pixel
 * moves.
 *
 * uClearcoatRough is the coat's own roughness, clamped away from 0 in
 * main() because a perfectly smooth GGX lobe is a delta function that
 * an analytic light can never hit.
 * uSheenColor is the cloth's retroreflective tint -- sheen has no
 * Fresnel, so this IS its reflectance and a saturated one is a strong
 * effect. */
uniform float uClearcoatWeight;
uniform float uClearcoatRough;
uniform float uSheenWeight;
uniform vec3  uSheenColor;
uniform float uSheenRough;

/* ================= PARALLAX OCCLUSION + DETAIL NORMALS =================
 *
 * WHERE THE HEIGHT COMES FROM. 40-material.js builds a full-resolution
 * height field for all 46 recipes -- it has to, because that is what
 * heightToNormal differentiates -- and packs it into uOrmMap.a, the one
 * channel of the three bound maps that nothing sampled. So this costs no
 * new texture, no new texture unit, no new upload path and not one byte
 * of memory. The pack is a FIXED affine window shared by every recipe:
 *
 *     height = alpha * HEIGHT_SPAN + HEIGHT_BIAS
 *
 * fixed, and not per-recipe normalised, because the relative depths are
 * physically right by construction: pantile really does have centimetres
 * of relief and a blued receiver has microns, and normalising each recipe
 * to its own extremes would put the same corrugations on both.
 *
 * THESE TWO NUMBERS ARE LITERALS, NOT UNIFORMS, AND THAT IS DELIBERATE.
 * An unbound uniform reads zero with no error (20-gl.js:98 no-ops an
 * unknown name), and a silently zero height span is a feature that does
 * nothing and leaves nothing to find. A literal cannot be silently zero.
 * engine/test/height.test.js reads both files and fails if they drift. */
const float PARALLAX_HEIGHT_BIAS = -0.45;
const float PARALLAX_HEIGHT_SPAN = 1.70;

/* Depth in UV units for a surface whose relief matches the reference
   recipe, already multiplied by the material's own parallax scale, by
   the tier, and by the distance fade. 0 means the whole march is
   skipped -- which is every tier but ultra, and every material that
   asked to stay flat. */
uniform float uParallaxDepth;
uniform float uParallaxSteps;
uniform float uParallaxFade;
/* This recipe's measured relief, in the same height units the recipes
   wrote: uParallaxTop is its highest point, uParallaxRange its peak to
   trough. Measured at bake time in the loop that was already walking
   every texel, carried on the shared maps object, bound per material.
   Nothing here guesses. */
uniform float uParallaxTop;
uniform float uParallaxRange;
/* 0/1. Gates the reoriented detail-normal blend, the decorrelating
   rotation, the detail roughness term and the Toksvig lift together, so
   one tier key turns the whole close-range package on and off and no
   tier can end up with half of it. */
uniform float uDetailNormal;

/* ---- one height tap ----
   textureGrad and not texture: the march below runs with a data-
   dependent trip count, where the implicit derivative chain is
   undefined, and an explicit-LOD fetch would throw away the anisotropic
   filtering that a grazing-angle effect needs more than any other pass
   in this renderer. The gradients are taken once, outside, from the
   unoffset UV.
   Returned as a 0..1 DEPTH -- 0 at this recipe's highest point, 1 at its
   lowest -- so the ray marches in the same space whatever the recipe. */
float pomDepth(vec2 uvp, vec2 ddx, vec2 ddy){
  float h = textureGrad(uOrmMap, uvp, ddx, ddy).a * PARALLAX_HEIGHT_SPAN + PARALLAX_HEIGHT_BIAS;
  return saturate1((uParallaxTop - h) / max(uParallaxRange, 1e-4));
}

/* ---- steep parallax occlusion mapping, with a binary refinement ----
 *
 * Vt is the view direction in tangent space, pointing away from the
 * surface; Vt.z is the cosine of the view angle. The returned value is
 * the UV offset to add before every other fetch.
 *
 * WHY Vt.z IS CLAMPED AT 0.30. The UV travelled per unit of depth is
 * Vt.xy / Vt.z, which runs away to infinity as the view goes edge on.
 * Unclamped, a wall at eighty-five degrees marches a fifth of a tile per
 * step and the mortar visibly swims as the head moves. 0.30 is
 * cos(72.5 deg); past that a texel is under a pixel wide along u for any
 * tiling this engine ships, so the fetch is mip blur and the extra reach
 * resolves nothing. The clamp also bounds the total excursion at
 * 3.33 * depthScale, which is what keeps the offset inside the
 * anisotropic footprint the driver is filtering over.
 *
 * WHY THE STEP COUNT MOVES WITH THE ANGLE. Head on, the ray is nearly a
 * point and one step would do; edge on it is the full 3.33 * depthScale
 * and needs every step there is. So the budget is spent where the ray is
 * long. The floor of a third keeps the near-normal case from striding so
 * coarsely that a deep pit is jumped clean over.
 *
 * WHY FIVE BINARY HALVINGS AND NOT SIX. The linear search leaves a
 * residual of one stride, 1/12 = 0.083 of the depth range at the high
 * step count. Five halvings cut that to 0.083/32 = 0.0026, and the
 * height channel is eight bits: 1/255 = 0.0039. A sixth halving refines
 * quantisation noise. That is also why twelve linear steps is the right
 * floor -- it is the coarsest stride five halvings can still resolve to
 * below what the texture can express. */
vec2 parallaxOffset(vec2 uvIn, vec3 Vt, float depthScale, float maxSteps){
  vec2 ray = (Vt.xy / max(Vt.z, 0.30)) * depthScale;
  vec2 ddx = dFdx(uvIn);
  vec2 ddy = dFdy(uvIn);

  float nf = mix(maxSteps, max(maxSteps * 0.34, 4.0), saturate1(Vt.z));
  int   n  = int(nf);
  float dz = 1.0 / nf;
  vec2  duv = ray * dz;

  float t = 0.0;                 // ray depth: 0 at the top, 1 at the floor
  vec2  p = uvIn;
  float d = pomDepth(p, ddx, ddy);
  float tPrev = 0.0;

  /* The hard 32 is the same guard the SSAO loop uses: a constant bound
     the compiler can unroll against, with the real count as an early
     break, so no tier can ever ask for an unbounded loop. */
  for (int i = 0; i < 32; i++) {
    if (i >= n || d <= t) break;
    tPrev = t;
    t += dz;
    p -= duv;
    d = pomDepth(p, ddx, ddy);
  }

  /* pLo is the last sample still above the height field, pHi the first
     one under it. UV is affine in t, so bisecting the pair bisects the
     depth interval with it. */
  float lo = tPrev, hi = t;
  vec2  pLo = p + duv, pHi = p;
  for (int i = 0; i < 5; i++) {
    float mid = (lo + hi) * 0.5;
    vec2  pm  = (pLo + pHi) * 0.5;
    float dm  = pomDepth(pm, ddx, ddy);
    if (dm > mid) { hi = mid; pHi = pm; }
    else          { lo = mid; pLo = pm; }
  }
  return pHi - uvIn;
}

/* ---- reoriented normal mapping (Barre-Brisebois & Hill, 2012) ----
   Summing the XY of two tangent-space normals, which is what the detail
   layer did, is only correct where the macro normal is flat. Where it is
   not, the fine slopes are being measured against the wrong plane, so
   grain on a steeply normal-mapped surface tilts the wrong way and
   partly cancels the relief it is supposed to sit on. RNM rotates the
   detail normal into the macro normal's frame first. That is the whole
   difference between grain that lies ON the brick and grain that argues
   with it.
   Written without the divide by t.z: t.z = n1.z + 1 is strictly
   positive, so dropping it only scales the result and the normalize
   takes the scale straight back out. */
vec3 rnmBlend(vec3 n1, vec3 n2){
  vec3 t = n1 + vec3(0.0, 0.0, 1.0);
  vec3 u = n2 * vec3(-1.0, -1.0, 1.0);
  return normalize(t * dot(t, u) - u * t.z);
}

/* ---- the detail layer is the same texture, and that is the problem ----
   Sampling the macro map nine times tighter puts a scale model of the
   pattern inside itself: tiny bricks inside each brick, tiny setts
   inside each sett. Once seen it cannot be unseen, and it is not a
   resolution fault, it is a LATTICE fault. Two copies of one pattern at
   a whole-number scale ratio share a lattice, so they line up, and the
   eye is extremely good at finding that.
   Rotating the fine copy breaks the shared lattice. tan(theta) = 1/phi
   = 0.6180 is chosen deliberately: the golden ratio is the worst-
   approximable irrational, so this is the rotation furthest from
   relining the two lattices up at any small period. The offset moves the
   fine copy's origin off the macro one so they do not agree at the tile
   corner either. Four multiplies and two adds.
   DR_C/DR_S are cos/sin of 31.717 degrees. */
const float DR_C = 0.85065081;
const float DR_S = 0.52573111;
const vec2  DR_O = vec2(0.37, 0.61);
vec2 detailRotate(vec2 p){
  return vec2(p.x * DR_C - p.y * DR_S, p.x * DR_S + p.y * DR_C) + DR_O;
}
/* And the detail normal's own XY has to come back out through the
   inverse rotation, or every fine slope in the game points 31.7 degrees
   away from the one it was baked at and the grain reads as lit from a
   direction the light is not in. */
vec2 detailUnrotate(vec2 p){
  return vec2(p.x * DR_C + p.y * DR_S, -p.x * DR_S + p.y * DR_C);
}


/* Extra point lights — small fixed budget, plenty for torches, muzzle
   flashes and glowing debris. */
uniform int uLightCount;
uniform vec4 uLightPos[8];    // xyz = position, w = radius
uniform vec4 uLightColor[8];  // rgb = colour, a = intensity

/* The view matrix, for the G-buffer normal only. Everything else in
   this shader works in world space; screen-space effects downstream do
   not, and converting once here is cheaper and more accurate than
   having each of them rebuild a view normal from world. */
uniform mat4 uView;

layout(location=0) out vec4 outColor;
/* ---- THE G-BUFFER ----
 *
 * Written by the opaque pass and discarded by the driver on every other
 * pass, because the renderer lowers the draw-buffer mask for them (see
 * _sceneTargets). Declaring it when there is no second attachment is
 * legal and the write goes nowhere, so this needs no #define and does
 * not double the shader permutation count.
 *
 *   .rg  view-space SHADING normal, octahedral, signed
 *   .b   perceptual roughness
 *   .a   metalness
 *
 * The shading normal, emphatically, and not the geometric one. A normal
 * reconstructed from the depth buffer -- which is what this renderer's
 * ambient occlusion does today -- is the normal of the depth surface,
 * so every bump the normal map puts on a brick wall is invisible to it.
 * That is the difference between a reflection that ripples across
 * mortar courses and one that slides over them as if the wall were
 * glass. */
layout(location=1) out vec4 outGBuffer;


vec3 interiorRoom(){
  // Pane frame: x along the wall, y up, z out of the wall (the thin axis).
  vec3 rd = normalize(transpose(vObjRot) * (vWorldPos - uCameraPos));
  vec3 ro = vObjPos;
  if (rd.z > -1e-3) return vec3(0.0);
  // The room's seed comes per instance (params.w, set by the building
  // kit): derived from the pixel's position it would carry that pixel's
  // float error, and the hash turns the error into noise.
  float h = fract(vParams.w * 0.9731 + 0.137);
  float hw = 1.5 + 0.6 * hash11(h * 13.0), depth = 3.0 + 1.5 * hash11(h * 29.0);
  float yFloor = -0.5 * vObjScale.y - 0.95, yCeil = yFloor + 2.7;
  vec3 wall = mix(vec3(0.62, 0.55, 0.44), vec3(0.44, 0.52, 0.56), hash11(h * 3.0));
  wall = mix(wall, vec3(0.66, 0.44, 0.36), step(0.8, hash11(h * 71.0)));
  wall *= 0.75 + 0.25 * hash11(h * 91.0);
  // The curtain, 12 cm behind the glass, drawn in from each side.
  float tc = (-0.12 - ro.z) / rd.z;
  vec3 pc = ro + rd * tc;
  float cw = vObjScale.x * (0.06 + 0.16 * hash11(h * 5.0));
  vec3 curtainCol = mix(vec3(0.55, 0.50, 0.42), vec3(0.35, 0.18, 0.14), hash11(h * 17.0));
  float daylightAtGlass = 1.0;
  /* How bright a room is follows the day outside: a room reads at about a
     quarter of the sunlit street, which is darker than the street, as it
     should be, but not the black of an unlit box. */
  float roomLight = 0.06 + 0.1 * dot(uSunColor, vec3(0.3333)) * uSunIntensity;
  if (abs(pc.x) > 0.5 * vObjScale.x - cw && abs(pc.y) < 0.5 * vObjScale.y + 0.1)
    return curtainCol * (0.88 + 0.12 * sin(pc.x * 38.0)) * daylightAtGlass * roomLight;
  // The room: the nearest of its planes along the ray.
  float tx = ((rd.x > 0.0 ? hw : -hw) - ro.x) / rd.x;
  float ty = ((rd.y > 0.0 ? yCeil : yFloor) - ro.y) / rd.y;
  float tz = (-depth - ro.z) / rd.z;
  float t = min(tx, min(ty, tz));
  vec3 p = ro + rd * t;
  vec3 col;
  if (t == tz) {
    col = wall;
    // A cabinet against the back wall, a picture above it.
    float cx = (hash11(h * 41.0) - 0.5) * hw;
    if (abs(p.x - cx) < 0.55 && p.y < yFloor + 0.85) col = vec3(0.24, 0.15, 0.09) * (0.8 + 0.2 * step(0.5, fract((p.y - yFloor) * 2.4)));
    else if (abs(p.x - cx) < 0.35 && abs(p.y - (yFloor + 1.6)) < 0.25) col = mix(vec3(0.2, 0.3, 0.35), vec3(0.6, 0.45, 0.25), hash11(h * 53.0));
  } else if (t == tx) {
    col = wall * 0.82;
  } else if (rd.y < 0.0) {
    float plank = hash11(floor(p.x * 5.5) + 17.0 * h + floor((p.z + 13.0 * hash11(floor(p.x * 5.5))) * 0.6) * 3.1);
    col = vec3(0.30, 0.19, 0.11) * (0.7 + 0.55 * plank);
  } else {
    col = vec3(0.72, 0.70, 0.66);
  }
  // Daylight through the window falls off with depth; some rooms have a lamp.
  float dayl = 0.3 + 0.7 * exp(p.z * 0.45);
  vec3 lampPos = vec3(0.0, yCeil - 0.35, -0.5 * depth);
  float lampOn = step(0.62, hash11(h * 37.0));
  vec3 lamp = vec3(1.0, 0.82, 0.58) * lampOn * 1.6 / (1.0 + 1.5 * dot(p - lampPos, p - lampPos));
  vec3 lit = col * (vec3(dayl) * roomLight + lamp);
  // The lamp itself, seen on the ceiling.
  if (t == ty && rd.y > 0.0) lit += vec3(1.0, 0.85, 0.6) * lampOn * 6.0 * smoothstep(0.16, 0.1, length(p.xz - lampPos.xz));
  return lit;
}

void main(){
  vec2 uv = vUv * uUvScale;
  /* The projection axis, kept because the tangent frame below needs
     the same one. 0 = mesh UVs, 1 = +-X, 2 = +-Y, 3 = +-Z. */
  int uvAxis = 0;
  if (uWorldUv == 1) {
    vec3 an = abs(normalize(vNormal));
    vec3 wp = vWorldPos;
    if (an.y >= an.x && an.y >= an.z) { uvAxis = 2; uv = wp.xz * uUvScale; }
    else if (an.x >= an.z)            { uvAxis = 1; uv = wp.zy * uUvScale; }
    else                              { uvAxis = 3; uv = wp.xy * uUvScale; }
  }

  /* THE DETAIL LAYER.
   *
     Even at 1024 a texture stretched over a nine-metre wall is about a
     texel every centimetre, and with your face against it you are
     looking at one magnified tile. That is the difference between these
     surfaces and the reference ones up close, and it is a question of
     TEXEL DENSITY rather than of texture size -- going to 2048 would
     cost four times the memory and half the loading time to buy one
     more doubling.

     So the same texture is sampled a second time, tiled far tighter,
     and mixed in only where the camera is close enough to see it. It
     costs one extra fetch of a texture already resident and not one
     byte of memory. Faded out by distance because fine tiling at range
     is aliasing, which is worse than being soft, and because at ten
     metres nobody can see a millimetre anyway.

     The albedo is mixed around 1.0 rather than replaced -- this is a
     contrast modulation on the macro colour, not a second colour. Blend
     it in flat and every surface goes to the average of itself. */
  /* ---- PARALLAX OCCLUSION MAPPING ----
   *
   * This has to happen HERE, before the first fetch, because it moves
   * the UV that every fetch below uses -- albedo, ORM, the normal map
   * and the detail layer all have to read the point the eye actually
   * sees rather than the point the polygon is at. Which in turn means
   * the tangent frame has to exist up here, above the sampling block
   * that used to build it.
   *
   * The frame is rebuilt rather than shared with the normal-mapping
   * block below, and the duplication is on purpose: gating it on
   * uParallaxDepth > 0.0 costs one scalar compare on every tier that
   * has parallax off, which is every tier the test suite runs, against
   * a restructure of thirty lines of load-bearing tangent-frame code
   * that four other features are editing around. Twenty ALU ops at
   * ultra is the cheaper side of that trade by a wide margin.
   *
   * pomNormalLen is declared out here because the Toksvig term below
   * needs the macro normal's pre-normalisation length, which is
   * measured inside the normal-mapping block. 1.0 means "no variance",
   * which is what an untextured surface should read as. */
  vec3 Ng = normalize(vNormal);
  float pomNormalLen = 1.0;
  float pomDepthScale = 0.0;
  if (uHasMaps == 1 && uParallaxDepth > 0.0 && uParallaxRange > 1e-4) {
    /* Faded out with distance for the same reason the detail layer is:
       a stride that is invisible up close is aliasing at range, and
       aliasing is worse than soft. The window is wider than the detail
       layer's eleven metres because the relief is at the MACRO tile
       scale -- mortar courses, sett crowns, pantile rolls -- which is
       about nine times coarser than the 9x-tiled grain and so survives
       roughly three times further before its own steps start to
       shimmer. Renderer-level, so a map with unusually large or small
       architecture can move it. */
    float pDist = length(vWorldPos - uCameraPos);
    float pFade = 1.0 - smoothstep(uParallaxFade * 0.45, uParallaxFade, pDist);
    /* PER-RECIPE DEPTH, FROM THE MEASURED FIELD AND NOT FROM A GUESS.
       uParallaxRange is this recipe's real peak-to-trough in height
       units, measured at bake time. Dividing by brick's 0.82 makes
       brick the unit: pantile (1.357) comes out 1.66x deeper, concrete
       (0.537) 0.66x, marble (0.400) 0.49x, a blued receiver (0.035)
       0.04x -- which is the whole point, because a gun must not grow
       corrugations. The clamp at 2.2 stops a recipe nobody measured
       from opening a hole in a wall. */
    pomDepthScale = uParallaxDepth * clamp(uParallaxRange / 0.82, 0.0, 2.2) * pFade;
  }
  if (pomDepthScale > 0.0) {
    /* The same frame the normal-mapping block builds, for the same
       reason: with a world projection the relief has to be lit and
       marched down the projection's own axes, not the mesh tangents,
       or it comes out inside-out on four faces of six. */
    vec3 pT, pB;
    if (uvAxis != 0) {
      float sgn = uvAxis == 2 ? (vNormal.y < 0.0 ? -1.0 : 1.0)
                : uvAxis == 1 ? (vNormal.x < 0.0 ? -1.0 : 1.0)
                              : (vNormal.z < 0.0 ? -1.0 : 1.0);
      vec3 tw = uvAxis == 1 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 bw = uvAxis == 2 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
      vec3 t0 = tw * sgn - Ng * dot(Ng, tw * sgn);
      pT = dot(t0, t0) > 1e-8 ? normalize(t0) : normalize(cross(Ng, bw));
      vec3 b0 = bw - Ng * dot(Ng, bw) - pT * dot(pT, bw);
      pB = dot(b0, b0) > 1e-8 ? normalize(b0) : cross(Ng, pT);
    } else {
      pT = normalize(vTangent.xyz - Ng * dot(Ng, vTangent.xyz));
      pB = cross(Ng, pT) * vTangent.w;
    }
    vec3 Vw = normalize(uCameraPos - vWorldPos);
    vec3 Vt = vec3(dot(Vw, pT), dot(Vw, pB), dot(Vw, Ng));
    /* SILHOUETTE SAFETY. Below cos 0.08 -- 85.4 degrees -- the surface
       is either turned away from the eye (a back face on a double-sided
       material, where marching would walk the relief the wrong way and
       turn every bump into a dent) or so close to edge on that the
       clamped ray is at full stretch and the whole tile is under a
       pixel. Both cases get the flat surface, which is what the eye
       sees there anyway. This is a HARD cut rather than a fade because
       the region it cuts is a few pixels wide on a silhouette and a
       fade across it costs a branch to hide nothing. */
    if (Vt.z > 0.08) {
      uv += parallaxOffset(uv, Vt, pomDepthScale, max(uParallaxSteps, 4.0));
    }
  }

  float detW = 0.0;
  vec2 dUv = uv;
  if (uHasMaps == 1 && uDetail > 0.001) {
    float dDist = length(vWorldPos - uCameraPos);
    detW = uDetail * (1.0 - smoothstep(uDetailFade * 0.30, uDetailFade, dDist));
    dUv = uv * uDetailScale;
    /* Decorrelated, so the fine copy stops being a scale model of the
       macro one. Gated with the rest of the close-range package so a
       tier that has it off samples exactly the UV it sampled before. */
    if (uDetailNormal > 0.5) dUv = detailRotate(dUv);
  }

  vec3 albedo = uBaseColor * vParams.rgb * vTint;
  float rough = uRoughness;
  float metal = uMetalness;
  float ao = 1.0;

  if (uHasMaps == 1) {
    vec4 tex = texture(uAlbedoMap, uv);
    albedo *= tex.rgb;
    if (detW > 0.001) {
      vec3 dA = texture(uAlbedoMap, dUv).rgb;
      /* DIVIDED BY ITS OWN MEAN, so this is contrast and not gain.
       *
         The first cut multiplied the detail sample by 1.85, a guess
         at twice the average texel. Compare the two frames and the
         detail version is plainly BRIGHTER, not just grainier -- timber
         averages nearer 0.65 than 0.54, so every wall using it got a
         twenty per cent lift it did not ask for, and the same constant
         would have darkened anything darker.

         The 1x1 mip IS the average of the texture. Dividing by it makes
         the layer exactly neutral by construction, for every recipe,
         with no constant to be wrong: light grain brightens, dark grain
         darkens, and the mean of the surface does not move. */
      vec3 dAvg = max(textureLod(uAlbedoMap, dUv, 20.0).rgb, vec3(0.004));
      albedo *= mix(vec3(1.0), dA / dAvg, detW * 0.55);
    }
    vec3 orm = texture(uOrmMap, uv).rgb;
    ao = orm.r;
    rough *= orm.g * 1.25;
    // The map only modulates metalness, never introduces it: a dielectric
    // stays dielectric no matter what the ORM texture says, while a metal
    // picks up the map's variation (rust patches, worn edges).
    metal = uMetalness * mix(1.0, orm.b, 0.85);

    /* ---- THE DETAIL LAYER REACHES ROUGHNESS, AT LAST ----
       It modulated albedo and it modulated the normal and it stopped
       there. 40-material.js's own note above the concrete recipe makes
       the argument against that better than this comment can: under an
       overcast sky a tilted normal returns very nearly the same shade,
       and the only channel that reads as relief is varied SHEEN. So at
       exactly the range where detail matters most -- face against the
       wall, no sun -- the one channel that would have sold it was
       frozen at the macro value.
       One more fetch of a texture that is already bound, already
       mipped and already being sampled twice fixes it, and the same
       fetch carries a micro-occlusion term for the ambient.
       Modulated around the detail tile's own mean, exactly the way the
       albedo is, so this is CONTRAST and not gain: a surface's average
       roughness does not move, which matters because every material in
       the game was authored against that average. The clamps are
       generous but finite -- a recipe with a near-black roughness texel
       must not turn a concrete wall into a mirror. */
    if (detW > 0.001 && uDetailNormal > 0.5) {
      vec4 dOrm = texture(uOrmMap, dUv);
      float dAvgR = max(textureLod(uOrmMap, dUv, 20.0).g, 0.02);
      rough *= mix(1.0, clamp(dOrm.g / dAvgR, 0.55, 1.80), detW * 0.45);
      ao    *= mix(1.0, clamp(dOrm.r, 0.35, 1.0), detW * 0.55);
    }
  }
  rough = clamp(rough, 0.035, 1.0);

  vec3 N = normalize(vNormal);
  if (uHasMaps == 1 && uNormalStrength > 0.001) {
    vec3 T, B;
    if (uvAxis != 0) {
      /* Match the projection exactly: u along the first axis of the
         pair the UV was built from, v along the second. Taking a cross
         product instead gets it right on two of the three axes and
         inside out on the third, because the three pairs are not all
         right-handed -- xz, zy and xy. So both are named.

         The sign flip is the back faces. Projecting world position
         mirrors the texture on the -X, -Y and -Z sides, and a mirrored
         normal map turns every bump into a dent. Flipping u with the
         facing puts the relief back the right way up. */
      float sgn = uvAxis == 2 ? (vNormal.y < 0.0 ? -1.0 : 1.0)
                : uvAxis == 1 ? (vNormal.x < 0.0 ? -1.0 : 1.0)
                              : (vNormal.z < 0.0 ? -1.0 : 1.0);
      vec3 tw = uvAxis == 1 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 bw = uvAxis == 2 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
      vec3 t0 = tw * sgn - N * dot(N, tw * sgn);
      T = dot(t0, t0) > 1e-8 ? normalize(t0) : normalize(cross(N, bw));
      vec3 b0 = bw - N * dot(N, bw) - T * dot(T, bw);
      B = dot(b0, b0) > 1e-8 ? normalize(b0) : cross(N, T);
    } else {
      T = normalize(vTangent.xyz - N * dot(N, vTangent.xyz));
      B = cross(N, T) * vTangent.w;
    }
    vec3 tnRaw = texture(uNormalMap, uv).xyz * 2.0 - 1.0;
    /* The length of the sampled vector BEFORE it is renormalised is a
       free variance measurement. The mip filter averages the stored
       vectors, so a texel whose neighbours disagreed comes back SHORT,
       and how short says how much slope this pixel has averaged away.
       Captured here and spent on roughness after the frame is built --
       see the Toksvig block below. */
    pomNormalLen = clamp(length(tnRaw), 0.25, 1.0);
    vec3 tn = tnRaw;
    tn.xy *= uNormalStrength;
    if (detW > 0.001) {
      vec3 dn = texture(uNormalMap, dUv).xyz * 2.0 - 1.0;
      if (uDetailNormal > 0.5) {
        /* Out of the decorrelating rotation first, then faded by
           distance and by the material's own normal strength, then
           composited with RNM instead of summed. dn.z is floored
           because a normal map texel that quantised to z <= 0 would
           make the blend flip the detail inside out. */
        dn.xy = detailUnrotate(dn.xy) * uNormalStrength * detW * 0.8;
        dn.z  = max(dn.z, 0.05);
        tn = rnmBlend(normalize(tn), normalize(dn));
      } else {
        /* The original additive blend, kept verbatim, so a tier with
           detail normals off renders the identical picture it did. */
        tn.xy += dn.xy * uNormalStrength * detW * 0.8;
      }
    }
    N = normalize(mat3(T, B, N) * normalize(tn));
  }
  if (uBevel > 0.0) {
    float edge;
    vec3 nb = bevelNormal(edge);
    // Bend the (normal-mapped) shading normal by the bevel's turn, and wear
    // the edge slightly: arrises are where paint chips and dirt rubs off.
    N = normalize(N + nb - normalize(vNormal));
    albedo = mix(albedo, albedo * 1.22 + 0.015, edge * 0.45);
  }
  if (uWater > 0.0 && normalize(vNormal).y > 0.5) {
    float wd = length(vWorldPos - uCameraPos);
    N = waterNormal(vWorldPos.xz, uTime, wd);
    albedo = uBaseColor * vParams.rgb;
    rough = mix(0.035, 0.16, smoothstep(25.0, 220.0, wd));
    metal = 0.0;
    ao = 1.0;
    /* Shore foam. A water box's sides are where it meets the seawall and
       the banks, so the distance to them, in metres, is the distance to
       the shore: a broken band of foam that breathes with the swell. */
    vec2 hxz = 0.5 * vObjScale.xz;
    float shore = min(hxz.x - abs(vObjPos.x), hxz.y - abs(vObjPos.z));
    float churn = valueNoise(vec3(vWorldPos.xz * 1.3 + vec2(uTime * 0.2, 0.0), uTime * 0.15))
                * valueNoise(vec3(vWorldPos.xz * 3.7, uTime * 0.3));
    float band = 1.0 - smoothstep(0.0, 1.8 + 0.8 * sin(uTime * 0.7 + vWorldPos.x * 0.2), shore);
    float foam = saturate1(band * (0.35 + churn * 1.6)) * (1.0 - smoothstep(30.0, 120.0, wd));
    albedo = mix(albedo, vec3(0.78, 0.80, 0.78), foam);
    rough = mix(rough, 0.7, foam);
    N = normalize(mix(N, vec3(0.0, 1.0, 0.0), foam * 0.7));
  }
  if (uWeathering > 0.0 && uWater == 0.0) {
    vec3 gN = normalize(vNormal);
    vec3 wp = vWorldPos;
    float m1 = valueNoise(wp * 0.16 + 3.1), m2 = valueNoise(wp * 0.04 - 7.7);
    float macro = (m1 - 0.5) * 0.6 + (m2 - 0.5) * 0.9;
    albedo *= 1.0 + macro * 0.24 * uWeathering;
    albedo = mix(albedo, albedo * vec3(1.06, 1.0, 0.88), saturate1(m2 - 0.45) * 0.8 * uWeathering);
    rough = clamp(rough * (1.0 + macro * 0.12 * uWeathering), 0.035, 1.0);
    /* Open ground seen from height is where a flat tone shows most: 40 m
       and 90 m patches of darker, warmer earth or older paving, and paler
       worn ground between them. */
    if (uWetGround > 0.0 && gN.y > 0.7) {
      float g1 = valueNoise(vec3(wp.xz * 0.025, 11.3)), g2 = valueNoise(vec3(wp.xz * 0.011, 5.9));
      float patchy = smoothstep(0.25, 0.8, g1 * 0.6 + g2 * 0.4);
      albedo *= mix(1.12, 0.66, patchy);
      albedo = mix(albedo, albedo * vec3(1.10, 0.97, 0.80), patchy * 0.6);
    }
    if (abs(gN.y) < 0.5 && uBevel > 0.0) {
      float hb = vObjPos.y + 0.5 * vObjScale.y;     // metres above the box's foot
      float ht = 0.5 * vObjScale.y - vObjPos.y;     // metres below its top
      vec3 side = normalize(cross(gN, vec3(0.0, 1.0, 0.0)));
      float u = dot(wp, side);
      float splash = 0.35 + 0.45 * valueNoise(vec3(u * 1.3, 0.0, 5.3));
      float foot = (1.0 - smoothstep(0.0, splash, hb)) * step(0.8, vObjScale.y);
      float sn = valueNoise(vec3(u * 3.5, wp.y * 0.3, 1.7)) * valueNoise(vec3(u * 9.0, wp.y * 0.05, 9.1));
      float streak = smoothstep(0.16, 0.48, sn) * exp(-ht * 0.5) * step(1.4, vObjScale.y);
      float grime = saturate1(foot * 0.6 + streak * 0.4) * uWeathering;
      albedo *= 1.0 - grime * 0.5;
      albedo = mix(albedo, albedo * vec3(1.05, 0.97, 0.86), grime);
      rough = min(1.0, mix(rough, rough * 1.15, grime));
      ao *= 1.0 - foot * 0.3 * uWeathering;
    }
  }
  if (uWetGround > 0.0 && uWater == 0.0 && normalize(vNormal).y > 0.7) {
    vec2 g = vWorldPos.xz;
    float w = fbm3(vec3(g * 0.085, 2.7));
    float damp = smoothstep(0.50, 0.60, w) * uWetGround;
    float pud = smoothstep(0.60, 0.635, w) * uWetGround;
    float cn = valueNoise(vec3(g * 0.9, 4.2));
    float crack = (1.0 - smoothstep(0.0, 0.03, abs(cn - 0.5)))
                * smoothstep(0.55, 0.75, valueNoise(vec3(g * 0.13, 8.8))) * uWetGround;
    albedo *= 1.0 - crack * 0.55 * (1.0 - pud);
    // Water fills the pores: darker and far smoother. Standing water is a
    // flat mirror over whatever was there.
    albedo *= mix(1.0, 0.6, damp);
    rough = mix(rough, rough * 0.4, damp);
    albedo *= mix(1.0, 0.8, pud);
    rough = mix(rough, 0.03, pud);
    metal *= 1.0 - pud;
    N = normalize(mix(N, normalize(vNormal), pud));
  }
  // Back-facing geometry (double-sided leaves, glass) must not light black.
  if (!gl_FrontFacing) N = -N;
  /* ---- THE GEOMETRIC NORMAL, KEPT ----
   *
   * N above has the normal map, the detail layer and (where feature 5
   * is on) a parallax offset in it, and can be tilted a long way off
   * the triangle. Two things below need to know where the triangle
   * actually is:
   *
   *   horizonOcclusion -- because a reflection that points below the
   *     real surface is fetching sky the surface is standing in front
   *     of, which is the fake rim on every worn metal edge;
   *   the clearcoat lobe and its reflection vector -- because a layer
   *     of lacquer is SMOOTH OVER the relief underneath it. A coat that
   *     picked up the base's bumps would just be a second copy of the
   *     base highlight, which is not what varnish looks like on wood or
   *     paint on a panel.
   *
   * Deliberately its own name and its own declaration rather than a
   * reference to anything earlier in main(): this is feature 6's lane,
   * and the back-face flip has to be applied to it exactly as it is
   * applied to N or a double-sided leaf gets a coat highlight lit from
   * behind.
   *
   * Behind the same gate as its two consumers so that a frame with
   * neither does not pay the normalize. Seeded from N rather than left
   * undefined: if a later author reads it outside the gate they get the
   * shading normal, which is wrong but not garbage. */
  vec3 geoN = N;
  if (uSpecOcclusion > 0.0 || uClearcoatWeight > 0.0) {
    geoN = normalize(vNormal);
    if (!gl_FrontFacing) geoN = -geoN;
  }

  /* ---- TOKSVIG: DISTANT BUMPY SURFACES GET ROUGHER, NOT SPARKLIER ----
   *
   * A tiled roof, chain-link, tread plate, a gravel path. At range the
   * normal map's mip chain averages the bumps away and the surface
   * flattens into a small mirror that catches the sun on one frame and
   * misses it on the next. That is the crawl, and nothing downstream
   * removes it, because the signal genuinely aliased in the shading --
   * FXAA and TAA can only average a sparkle that has already happened.
   *
   * The fix is Toksvig's and the measurement was free: |n| = 1 means one
   * slope under this pixel, |n| = 0.8 means a spread of them, and a
   * spread of slopes IS a wider specular lobe, which is what roughness
   * is. Converted through the Blinn power the two models share:
   *     s  = 2/alpha^2 - 2,  ft = |n| / (|n| + s(1 - |n|)),  s' = ft*s
   * and back. s' <= s always, so this can only ever roughen.
   *
   * THE 0.985 FLOOR IS NOT ARBITRARY. An eight-bit normal map quantises
   * each component to 2/255 = 0.0078, so a unit vector comes back with
   * |n| as low as 0.993 at mip 0 with no averaging at all. Engaging
   * below 0.985 keeps quantisation noise out of it entirely: a flat
   * surface close up is untouched, bit for bit. 0.86 is where the
   * averaged spread is wide enough that Toksvig's approximation is the
   * dominant term rather than a correction to it. */
  float tVar = 1.0 - smoothstep(0.86, 0.985, pomNormalLen);
  if (uDetailNormal > 0.5 && tVar > 0.001) {
    float al  = max(rough * rough, 1e-3);
    float s   = 2.0 / (al * al) - 2.0;
    float ft  = pomNormalLen / max(pomNormalLen + s * (1.0 - pomNormalLen), 1e-4);
    float alT = sqrt(2.0 / max(ft * s + 2.0, 2.0));
    rough = clamp(mix(rough, sqrt(alT), tVar), rough, 1.0);
  }

  vec3 V = normalize(uCameraPos - vWorldPos);
  float NoV = max(dot(N, V), 1e-4);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 diffuseColor = albedo * (1.0 - metal);

  vec3 color = vec3(0.0);
  /* ---- FEATURE 6 PER-FRAGMENT SETUP ----
   *
   * Everything the three new lobes share, computed once. F0, rough and
   * NoV are all final by this point, so the sun, all eight punctual
   * lights and the ambient term read one evaluation of each of these
   * rather than eight or ten.
   *
   * WRITTEN SO THE DEFAULT MATERIAL COMPUTES ALMOST NOTHING. The first
   * cut evaluated the coat's Fresnel -- a pow(x, 5) -- unconditionally,
   * on the reasoning that it multiplies out to 1 when there is no coat.
   * It does, and on SwiftShader it also cost 60 per cent of the frame
   * at the low tier, on every material in the game, to compute a number
   * that was always 1. A transcendental is not free just because its
   * result is. Everything below is inside the branch that needs it, and
   * both branches are on a UNIFORM, so they are coherent across the
   * whole draw call rather than per pixel.
   *
   * msComp is vec3(1.0) exactly when the tier has the energy half off;
   * specularMultiScatter returns on its first line in that case. */
  vec3 msComp = vec3(1.0);
  if (uSpecEnergy > 0.0) msComp = specularMultiScatter(F0, rough, NoV, uSpecEnergy);

  float ccW = saturate1(uClearcoatWeight);
  float shW = saturate1(uSheenWeight);
  float ccRough = clamp(uClearcoatRough, 0.03, 1.0);
  float shRough = clamp(uSheenRough, 0.07, 1.0);
  /* What reaches the layers underneath the coat and the cloth. Starts
     at exactly 1.0, and 1.0 is an exact multiply in IEEE 754 -- which
     is why every base term below can be written as "... * baseAtten"
     with no second branch and still produce, for an ordinary material,
     the bits the shader produced before this feature existed. */
  float baseAtten = 1.0;
  float NoVc = NoV;
  if (ccW > 0.0) {
    /* The geometric normal, because the coat is flat over the base's
       relief. A coat reflecting 12% of the light at this angle can only
       pass 88% of it down; the second pass of the same Fresnel on the
       way back out is the higher-order term glTF's single-scatter
       clearcoat leaves out, and so does this. */
    NoVc = max(dot(geoN, V), 1e-4);
    baseAtten -= ccW * (0.04 + 0.96 * pow(1.0 - NoVc, 5.0));
  }
  if (shW > 0.0) {
    /* Sheen takes energy off the base by its own directional albedo,
       weighted by how strongly the cloth is tinted. Without this a
       sheened material is simply brighter than the same material
       without sheen, which is the classic way a sheen lobe breaks a
       grey chart. */
    float shE = sheenDirAlbedo(NoV) * shW
      * max(max(uSheenColor.r, uSheenColor.g), uSheenColor.b);
    baseAtten *= 1.0 - saturate1(shE);
  }

  /* --- sun --- */
  vec3 L = normalize(uSunDir);
  float NoL = dot(N, L);
  float shadow = 1.0;
  if (uReceiveShadow == 1) shadow = shadowFactor(vWorldPos, vViewDepth, max(NoL, 0.0));

  // Debug views. Cheap to keep — a black screen or a missing shadow is
  // otherwise almost impossible to diagnose from the final image alone.
  if (uDebugMode > 0) {
    if (uDebugMode == 1) { outColor = vec4(vec3(shadow), 1.0); return; }
    if (uDebugMode == 2) { outColor = vec4(N * 0.5 + 0.5, 1.0); return; }
    if (uDebugMode == 3) { outColor = vec4(albedo, 1.0); return; }
    if (uDebugMode == 4) { outColor = vec4(vec3(rough), 1.0); return; }
    if (uDebugMode == 5) { outColor = vec4(vec3(vViewDepth / 60.0), 1.0); return; }
  }

  if (NoL > 0.0) {
    vec3 H = normalize(V + L);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);
    float D = distributionGGX(NoH, rough);
    vec3 F = fresnelSchlick(VoH, F0);
    /* THE VISIBILITY TERM, GATED BY A UNIFORM AND NOT BY A MIX.
       The condition is the same for every fragment in the draw call, so
       one side is executed and the other is not -- there is no
       divergence to pay for and a tier with uSpecEnergy 0 does not
       evaluate the new term at all. The else branch is the original
       expression character for character, including its 1e-4 clamp, so
       that tier's frame is bit-identical. */
    vec3 spec;
    if (uSpecEnergy > 0.0) {
      spec = D * visSmithGGX(NoV, NoL, rough) * F * msComp;
    } else {
      float G = geometrySmith(NoV, NoL, rough);
      spec = (D * G * F) / max(4.0 * NoV * NoL, 1e-4);
    }
    vec3 kD = (vec3(1.0) - F);
    vec3 radiance = uSunColor * uSunIntensity;
    color += (kD * diffuseColor * INV_PI + spec) * baseAtten * radiance * NoL * shadow;

    /* The coat's own highlight, on top of the base it just attenuated.
       Its own normal, its own roughness, its own Fresnel at LoH -- and
       no metalness, because a clearcoat is always a dielectric at
       IOR 1.5. This is what puts a sharp window reflection on a
       varnished stock while the walnut underneath stays soft. */
    if (ccW > 0.0) {
      float NoLc = max(dot(geoN, L), 0.0);
      if (NoLc > 0.0) {
        float NoHc = max(dot(geoN, H), 0.0);
        float LoH = max(dot(L, H), 1e-4);
        float Dc = distributionGGX(NoHc, ccRough);
        float Fc = 0.04 + 0.96 * pow(1.0 - LoH, 5.0);
        color += Dc * visKelemen(LoH) * Fc * ccW * radiance * NoLc * shadow;
      }
    }
    /* And the cloth's rim. No Fresnel: uSheenColor IS the lobe's
       reflectance. The shading normal rather than the geometric one,
       because a weave's rim follows the weave. */
    if (shW > 0.0) {
      color += uSheenColor * distributionCharlie(NoH, shRough)
        * visAshikhmin(NoV, NoL) * shW * radiance * NoL * shadow;
    }
  }

  /* --- subsurface wrap: light bleeding through thin surfaces --- */
  if (uSubsurface > 0.0) {
    float back = saturate1(dot(-N, L) * 0.5 + 0.5);
    float wrap = pow(back, 2.0) * uSubsurface;
    // Transmission is tinted by the material, warmed slightly.
    color += diffuseColor * uSunColor * uSunIntensity * wrap * 0.55 * mix(0.35, 1.0, shadow);
  }

  /* --- ambient from the sky ---
   *
     SHADOWED POINTS SEE LESS SKY, and until this line they saw all of
     it. The sky irradiance here is a hemisphere lookup on the normal
     with nothing between it and the surface: a wall inside a room with
     a roof on it got exactly the same ambient as the same wall out in
     the open. Which is why every interior in the game -- the hotel
     lobby, the bunker, the cottage -- rendered as flat grey fill. It
     was not the textures on those walls and it was not the tiling. A
     surface lit by a uniform hemisphere and nothing else has no shape,
     whatever is painted on it.

     Proper sky visibility means tracing the hemisphere, which this
     engine is not going to do at sixty frames on a phone. But there is
     already a buffer that knows what is above a point: the SUN SHADOW
     MAP. Physically it answers a different question -- is the sun
     blocked, not is the sky blocked -- and for the occluders that
     actually matter here they are the same object. A roof blocks both.
     A crate blocks both, from most of the sky it covers.

     So a shadowed point keeps (1 - uSkyOcclusion) of its sky. Indoors
     that is the roof putting the room in half light, which is what
     makes lamps, muzzle flash and the light out of a doorway read as
     light instead of as colour. Outdoors it is the reason a shadow on
     a sunlit map looks like a shadow rather than a grey patch.

     Two things are deliberately left out of it. The punctual lights,
     because a torch in a dark room must not be dimmed by the roof that
     makes the room dark. And uRoomAmbient, which is the floor under
     the whole thing -- the term that stops an unlit interior going to
     black. Specular gets three quarters of the attenuation rather than
     all of it: a polished floor indoors still catches the doorway. */
  float skyVis = mix(1.0 - uSkyOcclusion, 1.0, shadow);
  vec3 irradiance = envIrradiance(N) * skyVis;
  vec3 kS = fresnelSchlickRough(NoV, F0, rough);
  vec3 kD = (vec3(1.0) - kS) * (1.0 - metal);
  vec3 R = reflect(-V, N);
  // Rough surfaces reflect an increasingly averaged sky.
  /* The baked probe when there is one, and the analytic lerp this
     line used to be when there is not -- envRadiance holds both, so
     the shape of the ambient term here is unchanged. */
  vec3 envSpec = envRadiance(R, N, rough)
    * mix(skyVis, 1.0, 0.25) + uRoomAmbient;
  /* ---- FEATURE 6: THE AMBIENT SPECULAR, CORRECTED ----
     Three multiplies on one term, each of them off by default.

     msComp: the same multiple-scattering factor the direct lobes use.
       Without it a rough metal is energy-correct under the sun and
       still dead under the sky, which is worse than being wrong in
       both -- the two halves of its shading would disagree.

     specularOcclusion x horizonOcclusion: the reason a crevice stops
       glowing. The first says a narrow lobe escapes a crease that a
       diffuse hemisphere could not; the second says a reflection
       pointing below the triangle is not a reflection at all. They
       multiply because they occlude different things -- the AO map's
       cavity, and the geometry's own horizon.

     KEPT OFF THE DIFFUSE DELIBERATELY. The scalar ao already
     multiplies the whole ambient sum on the line below, which is the
     term underside.test.js measures and interior.test.js's ratio
     depends on. Specular occlusion is an additional, narrower cut and
     it only ever touches the specular half. */
  vec3 ambSpec = envSpec * envBRDF(F0, rough, NoV);
  if (uSpecEnergy > 0.0) {
    /* Ess FROM THE SAME SPLIT-SUM THE LOBE JUST USED, and not from the
       fit msComp carries. envBRDF returns F0*A + B, so at F0 = 1 it is
       A + B, which IS the single-scatter directional albedo of exactly
       this lobe -- the integrated table at ultra, the analytic fit
       everywhere else. Compensating against it makes the white furnace
       return exactly 1 either way. Using msComp here instead overshot
       by up to 20% at mid roughness on the furnace rig, because the
       fit and the table disagree by that much and the error lands
       entirely on rough metal. One extra LUT tap, on the tier that
       has a LUT. */
    ambSpec *= msFromEss(F0, envBRDF(vec3(1.0), rough, NoV).r, uSpecEnergy);
  }
  if (uSpecOcclusion > 0.0) {
    float so = specularOcclusion(NoV, ao, rough) * horizonOcclusion(R, geoN);
    ambSpec *= mix(1.0, so, uSpecOcclusion);
  }
  color += (kD * diffuseColor * irradiance + ambSpec) * ao * baseAtten;

  /* The coat's share of the environment, at the coat's roughness. This
     is the whole read of lacquer: a sharp sky sitting in the varnish
     over a soft one in the paint. envBRDF with a hard 0.04 because the
     coat is always a dielectric; no horizon term, because Rc is built
     from geoN and dot(Rc, geoN) = NoVc >= 0 makes it identically 1. */
  if (ccW > 0.0) {
    vec3 Rc = reflect(-V, geoN);
    vec3 ccEnv = envRadiance(Rc, geoN, ccRough) * mix(skyVis, 1.0, 0.25) + uRoomAmbient;
    vec3 ccSpec = ccEnv * envBRDF(vec3(0.04), ccRough, NoVc) * ccW;
    if (uSpecOcclusion > 0.0) {
      ccSpec *= mix(1.0, specularOcclusion(NoVc, ao, ccRough), uSpecOcclusion);
    }
    color += ccSpec * ao;
  }
  /* Ambient sheen. The Charlie lobe is broad and retroreflective, so
     the diffuse irradiance is the right probe for it rather than a
     mirror direction -- and weighting by the same directional albedo
     that took the energy off the base keeps the two in step. Without
     this line cloth only gets its rim in direct sun, and a uniform in
     shade goes back to looking like cardboard. */
  if (shW > 0.0) {
    color += uSheenColor * irradiance * sheenDirAlbedo(NoV) * shW * ao;
  }

  /* --- punctual lights --- */
  for (int i = 0; i < 8; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPos[i].xyz - vWorldPos;
    float dist = length(toL);
    float radius = uLightPos[i].w;
    if (dist > radius) continue;
    vec3 Li = toL / max(dist, 1e-4);
    float lNoL = max(dot(N, Li), 0.0);
    if (lNoL <= 0.0) continue;
    // Windowed inverse-square: physical falloff that still reaches zero.
    float d2 = dist * dist;
    float win = saturate1(1.0 - pow(dist / radius, 4.0));
    float atten = (win * win) / (d2 + 1.0);
    vec3 H = normalize(V + Li);
    float NoH = max(dot(N, H), 0.0);
    float D = distributionGGX(NoH, rough);
    vec3 F = fresnelSchlick(max(dot(V, H), 0.0), F0);
    vec3 spec;
    if (uSpecEnergy > 0.0) {
      spec = D * visSmithGGX(NoV, lNoL, rough) * F * msComp;
    } else {
      float G = geometrySmith(NoV, lNoL, rough);
      spec = (D * G * F) / max(4.0 * NoV * lNoL, 1e-4);
    }
    vec3 radiance = uLightColor[i].rgb * uLightColor[i].a * atten;
    color += ((vec3(1.0) - F) * diffuseColor * INV_PI + spec) * baseAtten * radiance * lNoL;
    /* Coat and cloth under a torch or a muzzle flash, the same two
       lobes the sun gets. Both conditions are uniform across the draw,
       so a scene of ordinary materials runs the loop it ran before. */
    if (ccW > 0.0) {
      float NoLc = max(dot(geoN, Li), 0.0);
      if (NoLc > 0.0) {
        float NoHc = max(dot(geoN, H), 0.0);
        float LoH = max(dot(Li, H), 1e-4);
        float Dc = distributionGGX(NoHc, ccRough);
        float Fc = 0.04 + 0.96 * pow(1.0 - LoH, 5.0);
        color += Dc * visKelemen(LoH) * Fc * ccW * radiance * NoLc;
      }
    }
    if (shW > 0.0) {
      color += uSheenColor * distributionCharlie(NoH, shRough)
        * visAshikhmin(NoV, lNoL) * shW * radiance * lNoL;
    }
  }

  color += uEmissive;
  if (uInterior > 0.0) {
    float NoVi = max(dot(normalize(vNormal), normalize(uCameraPos - vWorldPos)), 0.0);
    float Fi = 0.04 + 0.96 * pow(1.0 - NoVi, 5.0);
    color += interiorRoom() * uInterior * (1.0 - Fi);
  }

  vec3 viewDir = normalize(vWorldPos - uCameraPos);
  color = applyFog(color, vWorldPos, uCameraPos, viewDir);

  float alpha = uOpacity;
#ifdef ALPHA_CLIP
  // Grass blades taper to nothing; clipping keeps the silhouette crisp.
  if (uHasMaps == 1) alpha *= texture(uAlbedoMap, uv).a;
  if (alpha < 0.35) discard;
  alpha = 1.0;
#endif
  outColor = vec4(color, alpha);

  /* The G-buffer. The renderer masks attachment 1 off for every pass but
     the opaque one, so on those passes this write is discarded by the
     driver and on a tier with no G-buffer at all it goes nowhere.
     mat3(uView) is the rotation of the view matrix -- the translation is
     irrelevant to a direction -- and the result is renormalised because
     the view matrix is not guaranteed orthonormal once a non-uniform
     scale is in the stack. */
  outGBuffer = vec4(octEncode(normalize(mat3(uView) * N)), rough, metal);
}
