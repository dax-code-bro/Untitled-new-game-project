// FX library - decals: blood, soot, scorch, burns, wetness painted onto any surface the way a
// make-up artist or a set dresser would - on skin, scales, cloth, stone and timber, following the
// surface when it moves (skinned characters and creatures included).
//
// Geometry: a box projector (centre, direction into the surface, size [w, h, depth]) selects the
// target mesh's triangles inside the box AT PLACEMENT TIME (pose the character first). For skinned
// meshes the decal is itself a SkinnedMesh on the same skeleton (bind-space positions, skin
// indices and weights copied), so the stain rides on the skin in every later pose; large static
// triangles (a wall, a floor) are clipped to the box so the shader only runs where it is needed.
// No target: a small grid patch draped on fx.ground(x, z) (pools, stains on the paving).
//
// Shading: TWO passes over the same geometry, both pure functions of t:
//   1. absorb  - multiplies what is already drawn by the film's transmittance T (per channel):
//                thin blood tints skin / plaster / linen red, thick blood hides it - the way a
//                real liquid film works (alpha-blending a red colour over white gives pink-grey);
//   2. shine   - a lit MeshPhysicalMaterial (so it gets the scene's sun, shadows, sky, AO and
//                the cinematic stack's patches) drawn additively: the film's own body colour
//                (blood scatters red), its wet specular (clearcoat) and the meniscus relief (a
//                bump from the procedural thickness field).
// Every kind is evaluated procedurally in metres (sharp at any resolution, no textures).
//
// Kinds (GLSL, `kind`):
//   coat     broad irregular coverage (a jaw and throat dark with blood, hands, a sleeve)
//   splat    one impact: lobed blob, radiating spines, satellite drops thrown along `dir`
//   spatter  fine mist of drops thinning away from `src` (a spray carried onto a face)
//   stamps   the hits of an fx.blood.spray, each drop appearing at its own hit time
//   run      drips / rivulets running down along gravity, lengthening over time, beads at the ends
//   smear    a dragged stroke along +u (a body sliding down a wall, a wiped face), streaked
//   soak     absorbed into fabric, spreading by wicking along warp and weft, tide line when dry
//   pool     a spreading puddle, fingers running ahead along paving joints
//   burn     skin burn: raw glossy centre, blistered skin, blackened crisp edge, reddened halo
//   scorch   soot / heat discolouration (fire on stone, timber, cloth; no gloss)
//   char     charred timber or leather: black, alligator-cracked, dull sheen
//   wet      plain wetness (water): darker, glossy
import * as THREE from 'three';
import { Effect } from './manager.js';
import { arr3, norm3, cross3, dot3, clamp, smoothstep, hash01 } from './util.js';
import { LATE_GLSL, makeLateUniforms, makeLate } from './late.js';

export const MAX_STAMPS = 48;

// ------------------------------------------------------------------ materials (liquids) --
// sigma: absorption per unit thickness (1 unit ~ 0.5 mm of film) for light passing in and out;
// alb: the film's own diffuse colour once optically thick (linear); rough/coat: wet -> dry.
export const DECAL_LIQUIDS = {
  // whole blood: reflectance ~0.25-0.35 in deep red, a few % in green/blue (fresh, oxygenated);
  // drying turns it brown-black (methaemoglobin) and matte, edges first
  blood: { spec: 0, sigWet: [1.0, 7.0, 8.0], sigDry: [1.5, 4.0, 4.6], albWet: [0.11, 0.005, 0.005], albDry: [0.035, 0.012, 0.008], rough: [0.06, 0.55], coat: [0.6, 0.08], coatRough: [0.02, 0.4], h: 0.0006 },
  // venous / older blood (darker, less saturated) - wounds, pooled under bodies
  // (coat 0.6 / 0.02: a mirror of the blue sky turned big wet areas violet; a slightly rougher,
  // weaker coat keeps the wet glint without repainting the film)
  bloodDark: { spec: 0, sigWet: [1.3, 8.0, 8.5], sigDry: [1.6, 4.2, 4.8], albWet: [0.09, 0.0045, 0.004], albDry: [0.03, 0.01, 0.007], rough: [0.05, 0.55], coat: [0.42, 0.08], coatRough: [0.07, 0.4], h: 0.0007 },
  // diluted blood (washed, runoff, pink water on skin)
  bloodThin: { spec: 0, sigWet: [0.12, 1.4, 1.6], sigDry: [0.25, 1.2, 1.4], albWet: [0.05, 0.012, 0.012], albDry: [0.03, 0.012, 0.01], rough: [0.08, 0.5], coat: [0.8, 0.05], coatRough: [0.03, 0.4], h: 0.0003 },
  soot: { sigWet: [2.2, 2.3, 2.4], sigDry: [2.2, 2.3, 2.4], albWet: [0.012, 0.011, 0.01], albDry: [0.012, 0.011, 0.01], rough: [0.9, 0.95], coat: [0, 0], coatRough: [0.5, 0.5], h: 0.0 },
  char: { sigWet: [6, 6, 6], sigDry: [6, 6, 6], albWet: [0.009, 0.008, 0.007], albDry: [0.009, 0.008, 0.007], rough: [0.55, 0.6], coat: [0.05, 0.05], coatRough: [0.35, 0.35], h: 0.0025 },
  water: { spec: 0, sigWet: [0.35, 0.33, 0.3], sigDry: [0, 0, 0], albWet: [0, 0, 0], albDry: [0, 0, 0], rough: [0.1, 0.9], coat: [0.9, 0], coatRough: [0.03, 0.5], h: 0.0002 },
  mud: { spec: 0.15, sigWet: [1.2, 1.5, 1.9], sigDry: [0.8, 1.0, 1.3], albWet: [0.06, 0.045, 0.03], albDry: [0.16, 0.13, 0.1], rough: [0.25, 0.95], coat: [0.5, 0], coatRough: [0.1, 0.5], h: 0.0015 },
  // skin burn colours: albWet = raw dermis (glossy red-pink), albDry = blistered epidermis
  burn: { sigWet: [0.25, 1.4, 1.6], sigDry: [0.25, 1.4, 1.6], albWet: [0.32, 0.055, 0.045], albDry: [0.42, 0.3, 0.2], rough: [0.18, 0.45], coat: [0.7, 0.1], coatRough: [0.08, 0.3], h: 0.0015 },
};

// ------------------------------------------------------------------ GLSL --
const NOISE = /* glsl */`
float fxdH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 fxdH2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float fxdN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxdH(i), fxdH(i + vec2(1.0, 0.0)), u.x), mix(fxdH(i + vec2(0.0, 1.0)), fxdH(i + vec2(1.0, 1.0)), u.x), u.y); }
float fxdF(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * fxdN(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.97; }
float fxdF3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * fxdN(p); p = p * 2.07 + vec2(5.3, 1.1); a *= 0.5; } return s / 0.875; }
// distance to the nearest Voronoi edge (cobble / crack joints), cell size 1
float fxdVorEdge(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = fxdH2(i + g) * 0.8 + 0.1;
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return (d2 - d1) * 0.5;
}
`;

// every kind writes: d (film thickness, units ~0.5 mm), cov (0..1 coverage, crisp edge),
// dryBias (how much drier this point is than the decal on average: edges and thin films dry first)
const KINDS = /* glsl */`
uniform vec2 uSize;        // metres (w, h)
uniform float uSeed, uAge, uGrow, uAmount, uDry;
uniform vec2 uDown;        // gravity in decal coords (unit)
uniform vec2 uSrc;         // source point in decal coords (metres, centre = 0)
uniform vec4 uP;           // kind params
uniform vec4 uJoint;       // pool: joint cell size (m), joint width (m), pattern (0 none, 1 cobbles, 2 flags), joint depth
#if FX_STAMPS > 0
uniform vec4 uStamp[FX_STAMPS];   // x, y (m), radius (m), hit time (s, relative to t0)
uniform vec4 uStampB[FX_STAMPS];  // dir x, dir y (unit, travel on the surface), elongation, seed
uniform float uNStamps;
#endif
vec2 fxdSeedOff() { return vec2(fract(uSeed * 0.1731) * 97.0, fract(uSeed * 0.3317) * 53.0); }

// a crisp-edged liquid profile from a signed field c (>0 inside, metres): rounded meniscus
float fxdFilm(float c, float w) { return smoothstep(0.0, w, c); }

// one drop hit on a surface: an ellipse stretched along its travel dir, with a tail and a few
// satellites ahead of it (velocity carries fluid past the contact point)
void fxdDrop(vec2 p, vec2 c, float r, vec2 dir, float el, float sd, inout float d, inout float cov) {
  vec2 q = p - c;
  float a = dot(q, dir), b = dot(q, vec2(-dir.y, dir.x));
  float L = r * (1.0 + el);
  // body: ellipse (front heavier), lobed rim
  float ang = atan(b, a);
  float lob = 1.0 + 0.18 * (fxdN(vec2(ang * 2.2 + sd * 7.0, sd)) - 0.5) * 2.0 * min(1.0, r * 400.0);
  float e = length(vec2(a / L, b / r));
  float c0 = (lob - e) * r;
  float dd = fxdFilm(c0, r * 0.35) * (1.0 + 0.4 * smoothstep(-L, L, a));
  // tail: a tapering streak ahead of the drop (an "exclamation mark")
  if (el > 0.3) {
    float tl = r * (1.5 + 4.0 * el * fxdH(vec2(sd, 3.1)));
    float s = clamp((a - L * 0.6) / tl, 0.0, 1.0);
    float w = r * 0.42 * (1.0 - s);
    float ct = (w - abs(b + 0.15 * r * sin(s * 6.0 + sd * 9.0))) * step(L * 0.6, a) * step(a, L * 0.6 + tl);
    dd = max(dd, fxdFilm(ct, r * 0.12) * 0.7);
    // satellite bead at the tail end
    vec2 bc = vec2(L * 0.6 + tl + r * 0.5, 0.0);
    float cb = r * 0.35 * fxdH(vec2(sd, 7.7)) - length(vec2(a, b) - bc);
    dd = max(dd, fxdFilm(cb, r * 0.1) * 0.8);
  }
  d = max(d, dd * (0.8 + 0.5 * fxdH(vec2(sd, 1.3))));
  cov = max(cov, step(0.001, dd));
}

// spatter: drops on a jittered grid at two scales, density falling away from uSrc
void fxdSpatter(vec2 p, float cell, float dens, float rMax, float elong, inout float d, inout float cov) {
  vec2 so = fxdSeedOff();
  for (int lvl = 0; lvl < 3; lvl++) {
    float cs = cell * (lvl == 0 ? 1.0 : (lvl == 1 ? 0.45 : 0.2));
    vec2 g = p / cs + so * float(lvl + 1);
    vec2 gi = floor(g);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 id = gi + vec2(float(x), float(y));
      vec2 h = fxdH2(id);
      vec2 c = (id + 0.15 + 0.7 * h - so * float(lvl + 1)) * cs;
      vec2 fromSrc = c - uSrc;
      float dist = length(fromSrc);
      float k = dens * exp(-dist / max(uP.x, 1e-4)) * (lvl == 0 ? 0.35 : (lvl == 1 ? 0.6 : 0.9));
      float hp = fxdH(id + 17.3);
      if (hp > k) continue;
      float r = rMax * (lvl == 0 ? 1.0 : (lvl == 1 ? 0.5 : 0.25)) * (0.25 + 0.75 * pow(fxdH(id + 5.1), 2.0));
      vec2 dir = dist > 1e-5 ? fromSrc / dist : vec2(1.0, 0.0);
      fxdDrop(p, c, r, dir, elong * (0.4 + 0.6 * fxdH(id + 9.9)) * smoothstep(0.0, uP.x * 0.5, dist), fxdH(id + 2.2) * 100.0, d, cov);
    }
  }
}

// rivulets running down from a source band; length grows with uGrow (0..1); returns into d/cov
void fxdRuns(vec2 p, vec2 o, float halfW, float n, float lenMax, float w0, float grow, float sdo, inout float d, inout float cov) {
  vec2 dn = uDown, pr = vec2(-dn.y, dn.x);
  for (int i = 0; i < 9; i++) {
    if (float(i) >= n) break;
    float h1 = fxdH(vec2(float(i), sdo)), h2 = fxdH(vec2(float(i), sdo + 3.7)), h3 = fxdH(vec2(float(i), sdo + 7.1));
    vec2 oi = o + pr * (h1 * 2.0 - 1.0) * halfW;
    float w = w0 * (0.6 + 0.8 * h3);
    // never run out of the projector box (a ruled cut-off reads at once)
    vec2 hb = 0.5 * uSize - w * 3.0;
    float tx = abs(dn.x) > 1e-3 ? (sign(dn.x) * hb.x - oi.x) / dn.x : 1e9;
    float ty = abs(dn.y) > 1e-3 ? (sign(dn.y) * hb.y - oi.y) / dn.y : 1e9;
    float L = min(lenMax * (0.25 + 0.75 * h2) * (0.6 + 0.4 * h3), max(0.0, min(tx, ty)) * (0.55 + 0.45 * h2)) * grow;
    vec2 q = p - oi;
    float s = dot(q, dn);
    if (s < -w * 2.0 || s > L + w * 3.0) continue;
    float mea = (fxdN(vec2(s / max(w * 12.0, 1e-4) + h1 * 31.0, h2 * 17.0)) - 0.5) * w * 3.0 * smoothstep(0.0, w * 6.0, s);
    float lat = dot(q, pr) - mea;
    float ws = w * (1.0 - 0.45 * clamp(s / max(L, 1e-4), 0.0, 1.0));
    float cr = (ws - abs(lat)) * step(0.0, s) * step(s, L);
    float dd = fxdFilm(cr, ws * 0.6) * 1.3;
    // the bead at the front of the run: rounder and thicker
    float cb = w * 1.25 - length(vec2(s - L, lat) * vec2(0.8, 1.0));
    dd = max(dd, fxdFilm(cb, w * 0.5) * 2.2 * step(0.02, grow));
    d = max(d, dd);
    cov = max(cov, step(0.001, dd));
  }
}

void fxdEval(vec2 uv, out float d, out float cov, out float dryBias) {
  vec2 p = (uv - 0.5) * uSize;
  vec2 so = fxdSeedOff();
  float mn = min(uSize.x, uSize.y);
  d = 0.0; cov = 0.0; dryBias = 0.0;
#if defined(FX_KIND_COAT)
  // broad coverage: an irregular sheet, thinning and breaking up toward its edge, drips below
  vec2 q = p / (0.5 * uSize);
  float e = 1.0 - length(q);
  float n = fxdF(p / (mn * 0.22) + so);
  float n2 = fxdF3(p / (mn * 0.06) + so * 1.7);
  // gravity streaks: a coat is a film that flowed downhill - its thickness and its edge follow
  // long, narrow streaks along uDown (an isotropic blob read as paint)
  vec2 pd = vec2(dot(p, vec2(-uDown.y, uDown.x)), dot(p, uDown));
  float st = fxdF(vec2(pd.x / (mn * 0.05), pd.y / (mn * 0.7)) + so * 0.9);
  float c = (e * 1.1 + (n - 0.5) * 0.75 + (n2 - 0.5) * 0.18 + (st - 0.5) * 0.35 - (1.0 - uAmount) * 0.6 - 0.08) * mn * 0.5;
  float sheet = fxdFilm(c, mn * 0.012) * (0.5 + 1.4 * smoothstep(0.0, mn * 0.18, c)) * (0.75 + 0.5 * n2) * (0.5 + 1.0 * st);
  d = sheet; cov = step(0.001, sheet);
  dryBias = 0.35 * (1.0 - smoothstep(0.0, mn * 0.12, c));
  if (uP.y > 0.0) fxdRuns(p, -uDown * mn * 0.05, mn * 0.38, uP.y, mn * uP.z, mn * 0.012, uGrow, uSeed, d, cov);
#elif defined(FX_KIND_SPLAT)
  vec2 dir = normalize(uSrc + vec2(1e-5, 0.0));     // uSrc here = throw direction
  float r0 = mn * 0.16 * (0.6 + 0.4 * uAmount);
  float ang = atan(p.y, p.x);
  float lob = 1.0 + 0.35 * (fxdF3(vec2(ang * 1.6 + so.x, so.y)) - 0.5) * 2.0;
  float along = dot(normalize(p + 1e-6), dir);
  float rr = r0 * lob * (1.0 + 0.35 * max(0.0, along));
  float cb = rr - length(p);
  d = fxdFilm(cb, r0 * 0.12) * (1.4 + 0.8 * fxdF3(p / r0 * 2.0 + so));
  // spines: thin radiating streaks, longer in the throw direction
  for (int i = 0; i < 14; i++) {
    float h1 = fxdH(vec2(float(i), uSeed)), h2 = fxdH(vec2(float(i), uSeed + 1.3));
    float a = 6.2832 * h1;
    vec2 sd = vec2(cos(a), sin(a));
    float fw = max(0.0, dot(sd, dir));
    float L = r0 * (1.2 + 2.8 * h2 * (0.3 + fw));
    float s = dot(p, sd), b = dot(p, vec2(-sd.y, sd.x));
    float w = r0 * 0.12 * (1.0 - clamp((s - r0 * 0.6) / L, 0.0, 1.0)) * (0.6 + 0.8 * h2);
    float cs = (w - abs(b)) * step(r0 * 0.5, s) * step(s, r0 * 0.6 + L);
    d = max(d, fxdFilm(cs, w * 0.4 + 1e-5) * 0.9);
    vec2 bc = sd * (r0 * 0.6 + L + r0 * 0.15);
    float cbd = r0 * 0.12 * (0.5 + h2) - length(p - bc);
    d = max(d, fxdFilm(cbd, r0 * 0.05) * 1.1);
  }
  cov = step(0.001, d);
  if (uP.x > 0.0) fxdSpatter(p, mn * 0.11, 0.9 * uAmount, mn * 0.02, 1.2, d, cov);
  dryBias = 0.3 * (1.0 - smoothstep(0.0, r0 * 0.3, cb));
#elif defined(FX_KIND_SPATTER)
  fxdSpatter(p, mn * uP.y, uAmount, mn * uP.z, uP.w, d, cov);
  dryBias = 0.25;
#elif defined(FX_KIND_STAMPS)
#if FX_STAMPS > 0
  for (int i = 0; i < FX_STAMPS; i++) {
    if (float(i) >= uNStamps) break;
    vec4 s = uStamp[i], sb = uStampB[i];
    if (uAge < s.w) continue;
    // a drop arrives, spreads in ~30 ms and stays
    float sp = smoothstep(s.w, s.w + 0.03, uAge);
    fxdDrop(p, s.xy, s.z * (0.4 + 0.6 * sp), sb.xy, sb.z, sb.w, d, cov);
  }
  dryBias = 0.2;
#endif
#elif defined(FX_KIND_RUN)
  // a source blob at the top and runs below it
  vec2 o = -uDown * mn * 0.32;
  float cb = mn * 0.09 * uAmount - length((p - o) * vec2(1.0, 1.6));
  d = fxdFilm(cb, mn * 0.02) * 1.6;
  cov = step(0.001, d);
  fxdRuns(p, o, mn * 0.08 * (0.5 + uAmount), uP.y > 0.0 ? uP.y : 4.0, mn * 0.75, mn * 0.016, uGrow, uSeed, d, cov);
  dryBias = 0.15;
#elif defined(FX_KIND_SMEAR)
  // a stroke along +x (a body sliding down a wall, a hand wiping), painted like a dry brush: an
  // impact blob where it started, then a dozen drag bands - the middle ones wide and long, the
  // outer ones narrow and ending early - each with ragged edges, fine drag lines along the
  // motion and thinning as the blood is used up; drips run down from the heavy start
  float s = p.x / uSize.x + 0.5;                              // 0 start .. 1 end
  float W = uSize.y;
  float head = uGrow;
  float yc = (fxdN(vec2(s * 2.5, uSeed + 4.0)) - 0.5) * W * 0.16;
  float yy = p.y - yc;
  float fine = fxdN(vec2(p.x / (uSize.x * 1.3), yy / (W * 0.011)) + so * 1.3);
  float fine2 = fxdN(vec2(p.x / (uSize.x * 0.6), yy / (W * 0.03)) + so * 0.7);
  float body = 0.0;
  for (int i = 0; i < 12; i++) {
    float h1 = fxdH(vec2(float(i), uSeed + 11.0)), h2 = fxdH(vec2(float(i), uSeed + 12.7)), h3 = fxdH(vec2(float(i), uSeed + 14.3));
    float lane = (h1 - 0.5) * 0.9;                              // -0.45..0.45 of W
    float outer = abs(lane) / 0.45;
    float y0 = lane * W + (fxdN(vec2(s * 3.0 + h2 * 9.0, float(i))) - 0.5) * W * 0.06;
    float w = W * (0.05 + 0.13 * h2) * (1.0 - 0.5 * outer) * (1.0 - 0.35 * s);
    float s0 = 0.02 + 0.12 * h3 * outer, s1 = mix(1.0, 0.35, outer * (0.4 + 0.6 * h2)) - 0.1 * h3;
    float rag = (fxdN(vec2(p.x / (W * 0.25), float(i) * 7.0 + h1 * 13.0)) - 0.5) * w * 0.8;
    float cb = w - abs(yy - y0) + rag;
    float along = smoothstep(s0, s0 + 0.03, s) * (1.0 - smoothstep(s1 - 0.12, s1, s));
    float dd = smoothstep(0.0, W * 0.012, cb) * along * (0.7 + 0.6 * h1) * (1.0 - 0.45 * outer);
    body = max(body, dd);
  }
  float tail = smoothstep(0.98, 0.9, s) * smoothstep(0.0, W * 0.01, (head - s) * uSize.x);
  body *= tail * (0.55 + 0.45 * fine) * (0.7 + 0.5 * fine2) * mix(1.8, 0.8, s);
  // gaps in the film: drag lines where the cloth / skin did not touch
  body *= smoothstep(0.12, 0.3, fine * 0.7 + fine2 * 0.4 - 0.15 * s);
  // impact blob at the start (lobed)
  vec2 bc = vec2(-uSize.x * 0.5 + W * 0.42, yc);
  vec2 bq = p - bc;
  float ba = atan(bq.y, bq.x);
  float br = W * 0.4 * (1.0 + 0.3 * (fxdF3(vec2(ba * 1.5 + so.x, so.y)) - 0.5) * 2.0);
  float blob = fxdFilm(br - length(bq * vec2(1.2, 1.0)), W * 0.015) * (1.6 + 0.8 * fxdF3(bq / W * 4.0 + so));
  d = max(body, blob * step(0.001, head));
  cov = step(0.001, d);
  if (uP.y > 0.0) {
    vec2 o = bc - uDown * W * 0.1;
    fxdRuns(p, o, W * 0.35, uP.y, uSize.x * uP.z, W * 0.03, clamp((uAge - 0.4) / max(uP.w, 0.1), 0.0, 1.0), uSeed + 5.0, d, cov);
  }
  dryBias = 0.2 + 0.35 * s;
#elif defined(FX_KIND_SOAK)
  // wicking: radius grows like sqrt(t) (Washburn), faster along the warp and weft
  float R = mn * 0.5 * uAmount * sqrt(clamp(uGrow, 0.0, 1.0));
  float nw = fxdF(vec2(p.x / (mn * 0.1), p.y / (mn * 0.35)) + so) + fxdF(vec2(p.x / (mn * 0.35), p.y / (mn * 0.1)) + so * 1.3);
  float fib = fxdN(vec2(p.x / (mn * 0.0015), p.y / (mn * 0.012)) + so) * 0.5 + fxdN(vec2(p.x / (mn * 0.012), p.y / (mn * 0.0015)) + so) * 0.5;
  float c = R * (0.75 + 0.45 * (nw - 1.0)) - length(p - uSrc) + (fib - 0.5) * mn * 0.012;
  cov = smoothstep(-mn * 0.004, mn * 0.02, c);
  // soaked fabric: an even film inside (absorbed: lower than a surface film), a tide line where
  // the liquid front carried the dissolved pigment
  d = cov * (0.9 + 0.5 * fxdF3(p / (mn * 0.05) + so)) * uP.y;
  float tide = exp(-max(c, 0.0) / (mn * 0.012)) * cov;
  d += tide * 0.9 * uDry;
  dryBias = 0.4 * (1.0 - smoothstep(0.0, mn * 0.1, c));
#elif defined(FX_KIND_POOL)
  // a spreading pool (viscous gravity current: fast, then slowing): lobed outline from a domain
  // warp that grows with the pool, the front running ahead along paving joints
  float R = mn * 0.5 * uGrow * uAmount;
  float j = 0.0;
  if (uJoint.z > 0.5) {
    float e = uJoint.z < 1.5 ? fxdVorEdge(p / uJoint.x + so) * uJoint.x
      : min(abs(fract(p.x / uJoint.x + 0.5 * floor(p.y / (uJoint.x * 0.7))) - 0.5), abs(fract(p.y / (uJoint.x * 0.7)) - 0.5)) * uJoint.x;
    j = smoothstep(uJoint.y, 0.0, e) * uJoint.w;              // 1 on a joint
  }
  vec2 wv = vec2(fxdF(p / (mn * 0.35) + so), fxdF(p / (mn * 0.35) + so + 7.3)) - 0.5;
  float dist = length(p - uSrc + wv * R * 0.9);
  float c = R * (1.0 + 0.25 * j) - dist + (fxdF3(p / (mn * 0.05) + so) - 0.5) * R * 0.1;
  c = min(c, min(0.5 * uSize.x - abs(p.x), 0.5 * uSize.y - abs(p.y)) - mn * 0.02);
  d = fxdFilm(c, mn * 0.006) * (2.5 + 2.5 * smoothstep(0.0, mn * 0.08, c) + 1.5 * j);
  cov = step(0.001, d);
  dryBias = 0.5 * (1.0 - smoothstep(0.0, mn * 0.05, c));
#elif defined(FX_KIND_GASH)
  // a laceration along +x: an open split (dark, deep red inside), swollen bruised lips, blood
  // welling out of it and running down along gravity
  float L = uSize.x * 0.42;
  float s = clamp(p.x / L, -1.0, 1.0);
  float open = uSize.y * 0.06 * (1.0 - s * s) * (0.7 + 0.6 * fxdN(vec2(p.x / (uSize.x * 0.08), uSeed)));
  float yy = p.y - (fxdN(vec2(p.x / (uSize.x * 0.3), uSeed + 3.0)) - 0.5) * uSize.y * 0.12;
  float inside = step(abs(p.x), L) * smoothstep(open, open * 0.4, abs(yy));
  float lip = step(abs(p.x), L * 1.05) * smoothstep(open * 3.5, open, abs(yy)) * (1.0 - inside);
  d = max(inside * 3.5, lip * 0.5);
  cov = max(step(0.001, inside), lip * 0.0);
  dryBias = 0.0;
  if (uP.y > 0.0) fxdRuns(p, vec2(0.0, 0.0) + uDown * open, L * 0.8, uP.y, max(uSize.x, uSize.y) * uP.z, uSize.y * 0.02, uGrow, uSeed + 9.0, d, cov);
  cov = max(cov, step(0.001, d));
#elif defined(FX_KIND_BURN)
  // zones from the centre out: raw (wet, glossy), blistered, blackened rim, reddened halo
  vec2 q = p / (0.5 * uSize);
  float n = fxdF(p / (mn * 0.18) + so), n2 = fxdF3(p / (mn * 0.05) + so * 1.3);
  float c = (1.0 - length(q)) + (n - 0.5) * 0.8 + (n2 - 0.5) * 0.25 - (1.0 - uAmount) * 0.7;
  cov = smoothstep(-0.25, -0.05, c);
  d = c;                                                        // the shader below reads zones from c
  dryBias = 0.0;
#elif defined(FX_KIND_SCORCH)
  vec2 q = p / (0.5 * uSize);
  float n = fxdF(p / (mn * 0.25) + so);
  float c = (1.0 - length(q)) + (n - 0.5) * 0.9 - (1.0 - uAmount) * 0.8;
  d = smoothstep(-0.1, 0.6, c) * (0.6 + 0.6 * fxdF3(p / (mn * 0.04) + so)) * uP.y;
  cov = smoothstep(-0.1, 0.1, c);
#elif defined(FX_KIND_CHAR)
  vec2 q = p / (0.5 * uSize);
  float n = fxdF(p / (mn * 0.2) + so);
  float c = (1.0 - length(q)) + (n - 0.5) * 0.7 - (1.0 - uAmount) * 0.7;
  float cr = fxdVorEdge(p / max(uP.y, 1e-4) + so);
  cov = smoothstep(0.0, 0.08, c);
  d = cov * (1.0 + 2.5 * smoothstep(0.1, 0.0, cr));           // cracks: deeper (the relief)
#elif defined(FX_KIND_WET)
  vec2 q = p / (0.5 * uSize);
  float n = fxdF(p / (mn * 0.2) + so);
  float c = (1.0 - length(q)) + (n - 0.5) * 0.6 - (1.0 - uAmount) * 0.7;
  cov = smoothstep(0.0, 0.1, c); d = cov;
#endif
}
`;

// colour / gloss of the film from (d, cov, dry); writes T (transmittance multiplier), alb, rough, coat, h (m)
const SHADE = /* glsl */`
uniform vec3 uSigWet, uSigDry, uAlbWet, uAlbDry;
uniform vec2 uRough, uCoat, uCoatRough;
uniform float uHScale, uOpacity;
void fxdShade(vec2 uv, out vec3 T, out vec3 alb, out float cov, out float rough, out float coat, out float coatR, out float h) {
  float d, dryBias;
  fxdEval(uv, d, cov, dryBias);
  float dry = clamp(uDry * (1.0 + dryBias * 1.5) + dryBias * uDry * 0.5, 0.0, 1.0);
#if defined(FX_KIND_BURN)
  // c (in d) > 0.55 raw, 0.25..0.55 blistered, 0.0..0.25 charred rim, < 0 reddened halo
  float c = d;
  vec2 p = (uv - 0.5) * uSize;
  float mn = min(uSize.x, uSize.y);
  float raw = smoothstep(0.42, 0.62, c);
  float rim = smoothstep(-0.08, 0.04, c) * (1.0 - smoothstep(0.16, 0.3, c));
  float blis = smoothstep(0.1, 0.3, c) * (1.0 - raw);
  // blisters: domed bumps in the blistered zone
  float bv = fxdVorEdge(p / (mn * 0.06) + 3.0);
  float bump = smoothstep(0.0, 0.25, bv) * blis;
  vec3 rawC = uAlbWet * (0.75 + 0.5 * fxdF3(p / (mn * 0.03)));
  vec3 blisC = mix(uAlbDry, uAlbWet * 1.3, 0.35 * fxdF3(p / (mn * 0.02) + 7.0));
  vec3 charC = vec3(0.012, 0.009, 0.007) * (0.6 + 0.8 * fxdF3(p / (mn * 0.015)));
  alb = mix(blisC, rawC, raw);
  alb = mix(alb, charC, rim);
  float opaque = max(max(raw, blis), rim);
  float halo = smoothstep(-0.25, -0.02, c) * (1.0 - opaque);
  T = mix(vec3(1.0), uSigWet * 0.0 + vec3(1.0, 0.55, 0.5), halo) * (1.0 - opaque);
  alb *= opaque;
  rough = mix(mix(uRough.y, uRough.x, raw), 0.8, rim);
  coat = mix(uCoat.y, uCoat.x, raw) * (1.0 - rim);
  coatR = mix(uCoatRough.y, uCoatRough.x, raw);
  h = (bump * 0.8 + raw * -0.4 + rim * 0.3 * fxdF3(p / (mn * 0.01))) * uHScale;
  cov = max(cov, halo);
#else
  vec3 sig = mix(uSigWet, uSigDry, dry);
  // dried films shrink and crack (thick areas)
  float dd = d * (1.0 - 0.25 * dry);
  T = exp(-2.0 * dd * sig);
  vec3 opq = 1.0 - exp(-dd * sig * 1.2);
  alb = mix(uAlbWet, uAlbDry, dry) * opq;
  rough = mix(uRough.x, uRough.y, dry);
  coat = mix(uCoat.x, uCoat.y, dry) * smoothstep(0.0, 0.25, d);
  coatR = mix(uCoatRough.x, uCoatRough.y, dry);
  h = dd * uHScale;
#if defined(FX_KIND_POOL)
  // a pool on stone is no mirror: a skin forms in patches (matte, slightly darker), dust and grit
  // float on it, and its surface swells and dips over the stone below (breaking up the sky in it)
  vec2 pp = (uv - 0.5) * uSize;
  float mnp = min(uSize.x, uSize.y);
  // (only as it dries: a matte skin on a fresh pool scattered the blue sky over it - violet paint)
  float skinP = smoothstep(0.42, 0.72, fxdF(pp / (mnp * 0.1) + 17.0)) * dry;
  float grit = smoothstep(0.8, 0.95, fxdF3(pp / (mnp * 0.007) + 3.0));
  rough = mix(rough, 0.42, skinP * 0.8);
  coat *= 1.0 - 0.65 * skinP;
  coatR = mix(coatR, 0.22, skinP);
  alb = mix(alb, vec3(0.045, 0.032, 0.022) * cov, grit * 0.6);
  h += (fxdF(pp / (mnp * 0.04) + 5.0) - 0.5) * 0.0005 * smoothstep(0.0, 0.3, d);
#endif
#if defined(FX_KIND_SOAK)
  // absorbed into the fibres: the weave shows through, no film on top (only a damp sheen)
  alb *= 0.2; coat *= 0.15; h = 0.0;
#endif
#endif
  // soft margin at the projector box (misplaced decals never show a ruled edge)
  float em = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  cov *= smoothstep(0.0, 0.03, em);
  T = mix(vec3(1.0), T, cov * uOpacity);
  alb *= cov * uOpacity;
}
`;

const VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec3 aDecal;
varying vec3 vDecal;
void main() {
  vDecal = aDecal;
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
}`;

const FRAG_ABSORB = /* glsl */`
precision highp float;
varying vec3 vDecal;
${NOISE}
${KINDS}
${SHADE}
void main() {
  if (vDecal.x < 0.0 || vDecal.x > 1.0 || vDecal.y < 0.0 || vDecal.y > 1.0) discard;
  vec3 T, alb; float cov, rough, coat, coatR, h;
  fxdShade(vDecal.xy, T, alb, cov, rough, coat, coatR, h);
  if (cov <= 0.001) discard;
  // fade toward the projector's depth limits (wrap-around on curved surfaces)
  float zf = 1.0 - smoothstep(0.35, 0.5, abs(vDecal.z));
  gl_FragColor = vec4(mix(vec3(1.0), T, zf), 1.0);
}`;

// Screen-space reflection of the wet film (late pass: the opaque scene's colour + depth): the
// ray off the film is marched in view space against the scene's depth; where it meets a wall, a
// person, a cart, the film mirrors THAT instead of the sky map (a pool in the square reflects the
// house fronts, not a blue sky the houses would hide). Misses keep the sky map.
const SSR_GLSL = /* glsl */`
${LATE_GLSL}
uniform mat4 dkProjM;
uniform float fxdSSR;
float fxdSceneZAt(vec2 uv) {
  float d = texture(dkSceneDepth, uv).r;
  if (d >= 1.0) return 1e9;
  float z = d * 2.0 - 1.0;
  return 2.0 * dkLateNearFar.x * dkLateNearFar.y / ((dkLateNearFar.y + dkLateNearFar.x) - z * (dkLateNearFar.y - dkLateNearFar.x));
}
vec2 fxdUV(vec3 q) { vec4 c = dkProjM * vec4(q, 1.0); return c.xy / max(c.w, 1e-5) * 0.5 + 0.5; }
vec4 fxdSSRTrace(vec3 P, vec3 R) {
  if (dkLateOn < 0.5 || fxdSSR <= 0.0) return vec4(0.0);
  float s = 0.05, sPrev = 0.0;
  vec3 prevQ = P;
  for (int i = 0; i < FXD_SSR_STEPS; i++) {
    vec3 Q = P + R * s;
    if (-Q.z <= dkLateNearFar.x) break;
    vec2 uv = fxdUV(Q);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;   // left the frame: the sky map
    float sz = fxdSceneZAt(uv), rz = -Q.z;
    // crossed behind the depth surface within this step (a step's own length is the thickness
    // allowed: a wall is hit, the ground far behind a post is not)
    if (rz > sz + 0.01 && rz - sz < 0.04 + 1.5 * (s - sPrev)) {
      vec3 a = prevQ, b = Q;
      for (int k = 0; k < 5; k++) { vec3 m = 0.5 * (a + b); if (-m.z > fxdSceneZAt(fxdUV(m))) b = m; else a = m; }
      vec2 ub = fxdUV(b);
      vec2 e = min(ub, 1.0 - ub);
      float fade = smoothstep(0.0, 0.06, min(e.x, e.y)) * (1.0 - smoothstep(0.6, 1.0, s / FXD_SSR_MAX));
      return vec4(fxSceneColor(ub * dkLateSize), fade);
    }
    prevQ = Q; sPrev = s;
    s *= FXD_SSR_GROW;
  }
  return vec4(0.0);
}
`;

let kindKeyCounter = 0;

/** Build the two materials for a decal kind (ssr: march steps, 0 = sky map only). */
function makeMaterials(kind, liquid, stamps, uniforms, ssr = 0) {
  const defines = { [`FX_KIND_${kind.toUpperCase()}`]: 1, FX_STAMPS: stamps };
  const absorb = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG_ABSORB, uniforms, defines,
    transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  // (a liquid film has ONE interface - the clearcoat is its surface; the base layer is the light
  // scattered back from inside it, with no second mirror: L.spec 0 for liquids)
  const Lq = typeof liquid === 'string' ? DECAL_LIQUIDS[liquid] : liquid;
  const shine = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: Lq?.spec ?? 0.35,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  // (geometric steps from 5 cm out to 25 m whatever the count: more steps = finer, not further)
  // (keep the material's own STANDARD / PHYSICAL defines: without PHYSICAL three drops IOR and
  // USE_SPECULAR, and the base layer silently becomes a 4 % mirror with F90 = 1 - a second,
  // sky-blue reflection on every film)
  shine.defines = { ...shine.defines, ...defines, ...(ssr ? { FXD_SSR_STEPS: ssr, FXD_SSR_MAX: '25.0', FXD_SSR_GROW: Math.pow(25 / 0.05, 1 / ssr).toFixed(5) } : {}), ...(globalThis.__fxdDebug ? { FXD_DEBUG: globalThis.__fxdDebug } : {}) };
  shine.userData.dkNoSSAO = false;
  const key = `fxdecal-${kind}-${stamps}-${Lq?.spec ?? 0.35}-${ssr}-${globalThis.__fxdDebug || 0}`;
  shine.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aDecal;\nvarying vec3 vDecal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDecal = aDecal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vDecal;
${ssr ? SSR_GLSL : ''}
${NOISE}
${KINDS}
${SHADE}
vec3 fxdT; vec3 fxdAlb; float fxdCov, fxdRough, fxdCoat, fxdCoatR, fxdHt;
// Mikkelsen 2010 surface gradient bump (three's perturbNormalArb, with our own height derivatives)
vec3 fxdBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)); vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vDecal.x < 0.0 || vDecal.x > 1.0 || vDecal.y < 0.0 || vDecal.y > 1.0) discard;
fxdShade(vDecal.xy, fxdT, fxdAlb, fxdCov, fxdRough, fxdCoat, fxdCoatR, fxdHt);
if (fxdCov <= 0.001) discard;
diffuseColor.rgb = fxdAlb;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fxdRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // pixel-footprint derivatives of the film height (metres): divided by the derivative of the
  // surface position they turn into a slope (the meniscus rim catches the light)
  vec2 dH = vec2(dFdx(fxdHt), dFdy(fxdHt));
  float pxm = max(length(dFdx(-vViewPosition)), 1e-6);
  dH = clamp(dH, vec2(-pxm * 2.0), vec2(pxm * 2.0));
  normal = fxdBump(-vViewPosition, normal, dH, faceDirection);
}`)
      .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n#ifdef USE_CLEARCOAT\nclearcoatNormal = normal;\n#endif')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat = fxdCoat;
material.clearcoatRoughness = clamp(fxdCoatR, 0.0525, 1.0);
#endif`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined(USE_CLEARCOAT) && defined(FXD_SSR_STEPS) && defined(RE_IndirectSpecular)
{
  vec4 ssr = fxdSSRTrace(geometryPosition, reflect(-geometryViewDir, geometryClearcoatNormal));
  // (a rougher film blurs what it mirrors: fade the sharp trace with the coat's roughness)
  clearcoatRadiance = mix(clearcoatRadiance, ssr.rgb, ssr.a * fxdSSR * (1.0 - smoothstep(0.08, 0.35, material.clearcoatRoughness)));
}
#endif`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
{ float zf = 1.0 - smoothstep(0.35, 0.5, abs(vDecal.z)); gl_FragColor.rgb *= zf * min(1.0, fxdCov * 4.0); gl_FragColor.a = 0.0; }
#if defined(FXD_DEBUG)
#if FXD_DEBUG == 1
gl_FragColor.rgb = reflectedLight.directDiffuse;
#elif FXD_DEBUG == 2
gl_FragColor.rgb = reflectedLight.directSpecular;
#elif FXD_DEBUG == 3
gl_FragColor.rgb = reflectedLight.indirectDiffuse;
#elif FXD_DEBUG == 4
gl_FragColor.rgb = reflectedLight.indirectSpecular;
#elif FXD_DEBUG == 5
gl_FragColor.rgb = clearcoatSpecularIndirect + clearcoatSpecularDirect;
#elif FXD_DEBUG == 6
gl_FragColor.rgb = vec3(material.clearcoat, fxdCoat, material.specularF90);
#endif
#endif`);
  };
  shine.customProgramCacheKey = () => key;
  return { absorb, shine };
}

function liquidUniforms(liq, o = {}) {
  const L = typeof liq === 'string' ? DECAL_LIQUIDS[liq] : liq;
  const v3 = (a) => new THREE.Vector3(...a);
  return {
    uSigWet: { value: v3(L.sigWet) }, uSigDry: { value: v3(L.sigDry) },
    uAlbWet: { value: v3(L.albWet) }, uAlbDry: { value: v3(L.albDry) },
    uRough: { value: new THREE.Vector2(...L.rough) }, uCoat: { value: new THREE.Vector2(...L.coat) },
    uCoatRough: { value: new THREE.Vector2(...L.coatRough) }, uHScale: { value: o.height ?? L.h },
    uOpacity: { value: o.opacity ?? 1 },
  };
}

// ------------------------------------------------------------------ projection --
/**
 * Projector frame: centre c (world), into = direction INTO the surface, up hint, size [w, h, depth].
 * Returns { c, x, y, z, w, h, depth } (z points OUT of the surface toward the projector).
 */
export function projectorFrame(center, into, size, up = [0, 1, 0], roll = 0) {
  const z = norm3(arr3(into).map((v) => -v));
  let upv = arr3(up);
  if (Math.abs(dot3(upv, z)) > 0.97) upv = Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [0, 0, -1];
  let x = norm3(cross3(upv, z));
  let y = cross3(z, x);
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const x2 = x.map((v, i) => v * c + y[i] * s), y2 = y.map((v, i) => -x[i] * s + v * c);
    x = x2; y = y2;
  }
  const S = arr3(size.length === 2 ? [size[0], size[1], Math.max(size[0], size[1])] : size);
  return { c: arr3(center), x, y, z, w: S[0], h: S[1], depth: S[2] };
}

function toDecal(F, p, out) {
  const dx = p[0] - F.c[0], dy = p[1] - F.c[1], dz = p[2] - F.c[2];
  out[0] = (dx * F.x[0] + dy * F.x[1] + dz * F.x[2]) / F.w + 0.5;
  out[1] = (dx * F.y[0] + dy * F.y[1] + dz * F.y[2]) / F.h + 0.5;
  out[2] = (dx * F.z[0] + dy * F.z[1] + dz * F.z[2]) / F.depth;
  return out;
}

/**
 * Decal geometry on `target` (Mesh | SkinnedMesh) for projector frame F (target posed NOW).
 * opts.maxAngle: keep triangles facing the projector within this angle (deg, default 80);
 * opts.clip: clip large static triangles to the box (default true).
 * Returns { geometry, skinned, count } or null when nothing is inside.
 */
export function projectOnMesh(target, F, opts = {}) {
  const g = target.geometry;
  const pos = g.attributes.position, nrm = g.attributes.normal;
  if (!pos) return null;
  const skinned = !!target.isSkinnedMesh;
  target.updateWorldMatrix(true, false);
  if (skinned) { target.skeleton.update(); }
  const N = pos.count;
  const W = new Float32Array(N * 3);       // posed world positions
  const D = new Float32Array(N * 3);       // decal coords
  const v = new THREE.Vector3(), mw = target.matrixWorld;
  for (let i = 0; i < N; i++) {
    if (skinned) target.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
    v.applyMatrix4(mw);
    W[i * 3] = v.x; W[i * 3 + 1] = v.y; W[i * 3 + 2] = v.z;
    toDecal(F, [v.x, v.y, v.z], D.subarray(i * 3, i * 3 + 3));
  }
  const idx = g.index ? g.index.array : null;
  const T = idx ? idx.length / 3 : N / 3;
  const cosMax = Math.cos(((opts.maxAngle ?? 80) * Math.PI) / 180);
  const margin = opts.margin ?? 0.02;
  const keep = [];
  for (let t = 0; t < T; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (const k of [a, b, c]) {
      const x = D[k * 3], y = D[k * 3 + 1], z = D[k * 3 + 2];
      if (x < u0) u0 = x; if (x > u1) u1 = x; if (y < v0) v0 = y; if (y > v1) v1 = y; if (z < w0) w0 = z; if (z > w1) w1 = z;
    }
    if (u1 < -margin || u0 > 1 + margin || v1 < -margin || v0 > 1 + margin || w1 < -0.5 || w0 > 0.5) continue;
    // facing: posed triangle normal vs the projector's out direction
    const ax = W[b * 3] - W[a * 3], ay = W[b * 3 + 1] - W[a * 3 + 1], az = W[b * 3 + 2] - W[a * 3 + 2];
    const bx = W[c * 3] - W[a * 3], by = W[c * 3 + 1] - W[a * 3 + 1], bz = W[c * 3 + 2] - W[a * 3 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    let f = (nx * F.z[0] + ny * F.z[1] + nz * F.z[2]) / nl;
    if (opts.doubleSided) f = Math.abs(f);
    if (f < cosMax) continue;
    keep.push(a, b, c, (u1 - u0) > 1.2 || (v1 - v0) > 1.2);
  }
  if (!keep.length) return null;
  // build: shared vertices remapped; big static triangles clipped
  const P = [], Nn = [], Dd = [], SI = [], SW = [], I = [];
  const remap = new Map();
  const si = skinned ? g.attributes.skinIndex : null, sw = skinned ? g.attributes.skinWeight : null;
  const pushV = (k) => {
    if (remap.has(k)) return remap.get(k);
    const id = P.length / 3;
    P.push(pos.getX(k), pos.getY(k), pos.getZ(k));
    if (nrm) Nn.push(nrm.getX(k), nrm.getY(k), nrm.getZ(k)); else Nn.push(0, 1, 0);
    Dd.push(D[k * 3], D[k * 3 + 1], D[k * 3 + 2]);
    if (skinned) { SI.push(si.getX(k), si.getY(k), si.getZ(k), si.getW(k)); SW.push(sw.getX(k), sw.getY(k), sw.getZ(k), sw.getW(k)); }
    remap.set(k, id);
    return id;
  };
  const clipOn = opts.clip !== false && !skinned;
  for (let i = 0; i < keep.length; i += 4) {
    const a = keep[i], b = keep[i + 1], c = keep[i + 2], big = keep[i + 3];
    if (!(clipOn && big)) { I.push(pushV(a), pushV(b), pushV(c)); continue; }
    // Sutherland-Hodgman against u in [-m, 1+m], v in [-m, 1+m] (local pos, normal, decal coords)
    const vert = (k) => ({ p: [pos.getX(k), pos.getY(k), pos.getZ(k)], n: nrm ? [nrm.getX(k), nrm.getY(k), nrm.getZ(k)] : [0, 1, 0], d: [D[k * 3], D[k * 3 + 1], D[k * 3 + 2]] });
    let poly = [vert(a), vert(b), vert(c)];
    const m = margin;
    const planes = [[0, -m, 1], [0, 1 + m, -1], [1, -m, 1], [1, 1 + m, -1]];
    for (const [ax, lim, sgn] of planes) {
      const out = [];
      for (let j = 0; j < poly.length; j++) {
        const A = poly[j], B = poly[(j + 1) % poly.length];
        const da = (A.d[ax] - lim) * sgn, db = (B.d[ax] - lim) * sgn;
        if (da >= 0) out.push(A);
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db);
          const L = (x, y) => x.map((q, r) => q + (y[r] - q) * t);
          out.push({ p: L(A.p, B.p), n: L(A.n, B.n), d: L(A.d, B.d) });
        }
      }
      poly = out;
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    const base = P.length / 3;
    for (const V of poly) { P.push(...V.p); Nn.push(...V.n); Dd.push(...V.d); }
    for (let j = 1; j + 1 < poly.length; j++) I.push(base, base + j, base + j + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  geo.setAttribute('aDecal', new THREE.Float32BufferAttribute(Dd, 3));
  if (skinned) {
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  }
  geo.setIndex(I);
  geo.computeBoundingSphere();
  return { geometry: geo, skinned, count: I.length / 3 };
}

/** A grid patch draped on the ground function (world space) covering the projector footprint. */
export function projectOnGround(fx, F, res = 24, lift = 0.004) {
  const P = [], Nn = [], Dd = [], I = [];
  const n = res;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = i / n, v = j / n;
    const x = F.c[0] + F.x[0] * (u - 0.5) * F.w + F.y[0] * (v - 0.5) * F.h;
    const z = F.c[2] + F.x[2] * (u - 0.5) * F.w + F.y[2] * (v - 0.5) * F.h;
    const y = fx.ground(x, z) + lift;
    const e = 0.05;
    const nx = fx.ground(x - e, z) - fx.ground(x + e, z), nz = fx.ground(x, z - e) - fx.ground(x, z + e);
    const nl = Math.hypot(nx, 2 * e, nz);
    P.push(x, y, z); Nn.push(nx / nl, 2 * e / nl, nz / nl);
    Dd.push(...toDecal(F, [x, y, z], [0, 0, 0]));
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    I.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  geo.setAttribute('aDecal', new THREE.Float32BufferAttribute(Dd, 3));
  geo.setIndex(I);
  geo.computeBoundingSphere();
  return { geometry: geo, skinned: false, count: I.length / 3 };
}

/** A flat quad in the projector's plane, lifted `lift` toward the projector (walls, hit planes). */
export function projectOnPlane(F, lift = 0.003) {
  const P = [], Nn = [], Dd = [];
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const p = [0, 1, 2].map((k) => F.c[k] + F.x[k] * (u - 0.5) * F.w + F.y[k] * (v - 0.5) * F.h + F.z[k] * lift);
    P.push(...p); Nn.push(...F.z); Dd.push(u, v, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  geo.setAttribute('aDecal', new THREE.Float32BufferAttribute(Dd, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeBoundingSphere();
  return { geometry: geo, skinned: false, count: 2 };
}

// ------------------------------------------------------------------ the effect --
const KIND_DEFAULTS = {
  coat: { p: [0, 3, 0.6, 0], grow: [0.4, 6] },       // p.y = drip count, p.z = drip length (x min size)
  splat: { p: [1, 0, 0, 0] },                         // p.x > 0: add satellite spatter
  spatter: { p: [0.15, 0.04, 0.012, 1.0] },           // p.x falloff (m), p.y cell (x min size), p.z max drop (x min size), p.w elongation
  stamps: { p: [0, 0, 0, 0] },
  run: { p: [0, 4, 0, 0], grow: [0.0, 8] },
  smear: { p: [0, 4, 0.9, 3.0], grow: [0, 0.8] },    // p.y drips, p.z drip length (x height), p.w drip time (s)
  soak: { p: [0, 0.45, 0, 0], grow: [0, 20] },       // p.y film strength
  pool: { p: [0, 0, 0, 0], grow: [0, 30] },
  burn: { p: [0, 0, 0, 0] },
  gash: { p: [0, 4, 0.8, 0], grow: [0.2, 4] },          // p.y runs, p.z run length (x max size)
  scorch: { p: [0, 1.0, 0, 0] },
  char: { p: [0, 0.02, 0, 0] },
  wet: { p: [0, 0, 0, 0] },
};
const KIND_LIQUID = { burn: 'burn', scorch: 'soot', char: 'char', wet: 'water' };

/**
 * A decal effect. o: {
 *   kind, liquid ('blood' | 'bloodDark' | 'bloodThin' | 'soot' | 'char' | 'water' | 'mud' | 'burn' | {...}),
 *   target (Mesh/SkinnedMesh, or an array; null = the ground, or a flat quad with plane: true),
 *   at [x,y,z] world (the projector centre, ON the surface), dir (into the surface),
 *   up, roll (rad), size [w,h,(depth)] metres, t0, seed, amount 0..1,
 *   grow: [delay, tau] (s) -> uGrow = 1 - e^{-(t - t0 - delay)/tau}  | (t) => 0..1,
 *   dry: number 0..1 | [tStart, tEnd] seconds after t0 | (t) => 0..1,
 *   src: [x, y] metres in decal coords (spatter source / soak start / pool source), throw: [dx, dy] (splat),
 *   down: world gravity (default [0,-1,0]), joints: { cell, width, pattern: 'cobbles'|'flags', depth },
 *   stamps: [{ x, y, r, t, dir: [dx, dy], el, seed }], params: [x,y,z,w] (kind params), opacity, height
 * }
 */
export class DecalEffect extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: `fx-decal-${o.kind || 'coat'}`, ...o });
    this.kind = o.kind || 'coat';
    const def = KIND_DEFAULTS[this.kind];
    if (!def) throw new Error(`fx decal: unknown kind "${this.kind}"`);
    const size = o.size || [0.3, 0.3];
    this.F = projectorFrame(fx.at(o.at, this.t0), o.dir || [0, -1, 0], size, o.up || [0, 1, 0], o.roll || 0);
    const nSt = this.kind === 'stamps' ? Math.min(MAX_STAMPS, Math.max(1, o.maxStamps ?? (o.stamps || []).length)) : 0;
    const liquid = o.liquid || KIND_LIQUID[this.kind] || 'blood';
    const p = o.params || def.p;
    const down = arr3(o.down ?? [0, -1, 0]);
    const dd = [dot3(down, this.F.x), dot3(down, this.F.y)];
    const dl = Math.hypot(dd[0], dd[1]);
    const u = {
      uSize: { value: new THREE.Vector2(this.F.w, this.F.h) },
      uSeed: { value: (o.seed ?? 1) * 1.0 }, uAge: { value: 0 }, uGrow: { value: 1 }, uAmount: { value: o.amount ?? 1 }, uDry: { value: 0 },
      uDown: { value: new THREE.Vector2(dl > 0.05 ? dd[0] / dl : 0, dl > 0.05 ? dd[1] / dl : -1) },
      uSrc: { value: new THREE.Vector2(...(o.src || o.throw || [0, 0])) },
      uP: { value: new THREE.Vector4(...p) },
      uJoint: { value: new THREE.Vector4(o.joints?.cell ?? 0.12, o.joints?.width ?? 0.012, o.joints ? (o.joints.pattern === 'flags' ? 2 : 1) : 0, o.joints?.depth ?? 1) },
      ...liquidUniforms(liquid, o),
    };
    if (nSt) {
      u.uStamp = { value: Array.from({ length: nSt }, () => new THREE.Vector4(0, 0, 0, 1e9)) };
      u.uStampB = { value: Array.from({ length: nSt }, () => new THREE.Vector4(1, 0, 0, 0)) };
      u.uNStamps = { value: 0 };
      this.setStamps(o.stamps || [], u);
    }
    this.uniforms = u;
    this.growSpec = o.grow ?? def.grow ?? null;
    this.drySpec = o.dry ?? 0;
    // reflections of the surroundings in big wet films on the ground / walls (pools, smears, the
    // drops of a spray): screen-space, in the late pass (o.ssr: false / steps; tier sets the count)
    const ssrSteps = o.ssr === false ? 0 : typeof o.ssr === 'number' ? o.ssr
      : (['pool', 'smear', 'stamps', 'splat', 'wet'].includes(this.kind) ? { draft: 16, preview: 24, final: 32, ultra: 48 }[fx.tier.name] ?? 24 : 0);
    if (ssrSteps) Object.assign(u, makeLateUniforms(), { dkProjM: { value: new THREE.Matrix4() }, fxdSSR: { value: o.ssrStrength ?? 1 } });
    this.ssr = ssrSteps;
    const mats = makeMaterials(this.kind, liquid, nSt, u, ssrSteps);
    this.mats = mats;
    // geometry on every target (or the ground)
    const targets = o.target == null ? [null] : Array.isArray(o.target) ? o.target : [o.target];
    this.meshes = [];
    let tri = 0;
    for (const tg of targets) {
      const r = tg ? projectOnMesh(tg, this.F, o) : o.plane ? projectOnPlane(this.F, o.lift ?? 0.003) : projectOnGround(fx, this.F, o.res ?? 24, o.lift ?? 0.004);
      if (!r) continue;
      tri += r.count;
      for (const [mat, order] of [[mats.absorb, 1], [mats.shine, 2]]) {
        const m = r.skinned ? new THREE.SkinnedMesh(r.geometry, mat) : new THREE.Mesh(r.geometry, mat);
        m.name = `${this.object.name}-${order === 1 ? 'absorb' : 'shine'}`;
        m.renderOrder = (o.renderOrder ?? 3) + order * 0.01;
        m.castShadow = false; m.receiveShadow = order === 2;
        m.frustumCulled = false;
        m.userData.dkNoVelocity = true;
        if (order === 2 && this.ssr && !r.skinned) makeLate(m, u);
        if (r.skinned) {
          // same transform + skeleton as the skin: add next to it
          m.bind(tg.skeleton, tg.bindMatrix);
          m.bindMode = tg.bindMode;
          (tg.parent || fx.group).add(m);
          m.position.copy(tg.position); m.quaternion.copy(tg.quaternion); m.scale.copy(tg.scale);
        } else if (tg) {
          tg.add(m);             // rides on the object
        } else {
          this.object.add(m);
        }
        this.meshes.push(m);
      }
    }
    this.triangles = tri;
    if (!this.meshes.length) console.warn(`[fx] decal ${this.kind}: nothing inside the projector at`, this.F.c);
  }

  /** stamps: [{ x, y (metres, decal coords), r, t (s after t0), dir [dx,dy], el, seed }] */
  setStamps(list, u = this.uniforms) {
    const n = Math.min(u.uStamp.value.length, list.length);
    for (let i = 0; i < n; i++) {
      const s = list[i];
      u.uStamp.value[i].set(s.x, s.y, s.r, s.t ?? 0);
      const d = s.dir || [1, 0], l = Math.hypot(d[0], d[1]) || 1;
      u.uStampB.value[i].set(d[0] / l, d[1] / l, s.el ?? 0.5, s.seed ?? i * 7.3);
    }
    u.uNStamps.value = n;
  }

  /** decal coords (metres from the centre) of a world point (to place stamps). */
  toLocal(p) {
    const q = toDecal(this.F, arr3(p), [0, 0, 0]);
    return [(q[0] - 0.5) * this.F.w, (q[1] - 0.5) * this.F.h, q[2] * this.F.depth];
  }

  update(t) {
    const a = t - this.t0;
    const vis = a >= 0 && this.enabled;
    for (const m of this.meshes) m.visible = vis;
    if (!vis) return;
    const u = this.uniforms;
    u.uAge.value = a;
    const g = this.growSpec;
    u.uGrow.value = typeof g === 'function' ? clamp(g(t)) : Array.isArray(g) ? (a <= g[0] ? 0 : 1 - Math.exp(-(a - g[0]) / Math.max(1e-3, g[1]))) : 1;
    const d = this.drySpec;
    u.uDry.value = typeof d === 'function' ? clamp(d(t)) : Array.isArray(d) ? smoothstep(d[0], d[1], a) : clamp(d);
  }
  dispose() {
    for (const m of this.meshes) m.parent?.remove(m);
    this.mats.absorb.dispose(); this.mats.shine.dispose();
  }
}
