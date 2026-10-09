// GLSL building blocks for the creature shaders (injected into three.js
// MeshStandard/MeshPhysical materials with onBeforeCompile).
//
// Scale patterns work in "chain coordinates" (see skin.js): x = around the
// body (v), y = along it (u), measured in scale widths, with each scale's
// free edge toward +y. Every pattern returns an analytic height gradient, so
// the normal is exact at any distance (no derivative noise), and a cavity
// term for occlusion and dirt.

export const GLSL_COMMON = /* glsl */`
float dkH21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 dkH22(vec2 p) { float n = dkH21(p); return vec2(n, dkH21(p + n + 17.17)); }
float dkH31(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float dkVnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = dkH31(i), b = dkH31(i + vec3(1, 0, 0)), c = dkH31(i + vec3(0, 1, 0)), d = dkH31(i + vec3(1, 1, 0));
  float e = dkH31(i + vec3(0, 0, 1)), g = dkH31(i + vec3(1, 0, 1)), h = dkH31(i + vec3(0, 1, 1)), k = dkH31(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float dkFbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * dkVnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s / 0.9375; }
vec3 dkH33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// value noise with its analytic gradient (quintic fade): vec4(value, d/dx, d/dy, d/dz)
vec4 dkNoised(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = dkH31(i), b = dkH31(i + vec3(1, 0, 0)), c = dkH31(i + vec3(0, 1, 0)), d = dkH31(i + vec3(1, 1, 0));
  float e = dkH31(i + vec3(0, 0, 1)), f1 = dkH31(i + vec3(1, 0, 1)), g = dkH31(i + vec3(0, 1, 1)), h = dkH31(i + vec3(1, 1, 1));
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f1, k7 = -a + b + c - d + e - f1 - g + h;
  return vec4(a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z,
    du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y));
}
float dkVnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dkH21(i), dkH21(i + vec2(1, 0)), f.x), mix(dkH21(i + vec2(0, 1)), dkH21(i + vec2(1, 1)), f.x), f.y);
}
`;

export const GLSL_SCALES = /* glsl */`
// ---- overlapping (imbricate) scales, in a size hierarchy ----------------------
// Real reptile skin is not one coin-sized scale repeated: big keeled dorsal scutes
// run in rows along the back, scattered enlarged tubercles stud the upper flanks,
// medium overlapping scales cover the sides, small scales fill in toward the
// belly and the joints. Three levels of the same staggered-row pattern are laid
// in the chain coordinates (big = 2x, medium = 1x, small = 0.55x the base size);
// whether a scale EXISTS is decided at its own anchor (latitude around the body,
// region, a per-scale hash), so every scale is drawn whole and bigger ones lie
// over smaller ones. Each scale is an ellipse anchored at its base, longer than a
// row so it covers the base of the next row; of the scales covering a point, the
// one from the earliest row lies on top. Height rises toward the free edge, with
// a dome across, a keel, and a rounded (bevelled) rim.
// out: h (0..~1), grad = dh/dp, cav (0 open .. 1 deep crevice), wear (raised, rubbed), id, lv (level, -1 none)
struct DKScale { float h; vec2 grad; float cav; float wear; float id; vec2 q; float lv; };
uniform vec4 uHier;    // x: dorsal scute amount, y: medium-scale coverage, z: neck fineness, w: flank tubercles
uniform vec4 uZones;   // x: withers z, y: pelvis z, z: neck ramp (m), w: L
float dkPresence(float lv, float lat, float neck, float r, float region) {
  if (lv > 1.5) return 1.0;
  if (region > 1.5 && region < 2.5) {                     // limbs: lat 0 = front of the limb
    if (lv < 0.5) return step(r, (1.0 - smoothstep(0.16, 0.36, lat)) * uHier.x * 0.9);
    return step(r, 1.0 - smoothstep(0.5, 0.7, lat));
  }
  if (region > 2.5 && region < 3.5) return lv < 0.5 ? 0.0 : step(r, 1.0 - smoothstep(0.35, 0.6, lat));   // toes
  if (region > 4.5) return lv < 0.5 ? 0.0 : 1.0;          // wing arm: medium + small
  if (lv < 0.5) {
    float rows = smoothstep(0.025, 0.055, lat) * (1.0 - smoothstep(0.2 - 0.08 * neck, 0.36 - 0.12 * neck, lat));
    float tub = (1.0 - smoothstep(0.28, 0.6, lat)) * smoothstep(0.12, 0.3, lat) * uHier.w * (1.0 - neck * 0.6);
    return step(r, max(rows * uHier.x, tub));
  }
  float m = (1.0 - smoothstep(0.56, 0.74, lat)) * (1.0 - uHier.z * neck * smoothstep(0.18, 0.45, lat));
  return step(r, m * uHier.y);
}
DKScale dkImbricateL(vec2 p, float lev, float lv, float jit, float keel, float facet, float halfN, float neck, float region) {
  DKScale S; S.h = 0.0; S.grad = vec2(0.0); S.cav = 1.0; S.wear = 0.0; S.id = 0.0; S.q = vec2(0.0); S.lv = -1.0;
  vec2 pl = p * lev;
  float best = 1e9;
  vec2 bq = vec2(0.0); float bW = 1.0, bL = 1.0; vec2 bR = vec2(0.0);
  float ry = floor(pl.y);
  float salt = lv * 17.31;
  for (int dr = -1; dr <= 0; dr++) {
    float r = ry + float(dr);
    float off = mod(r, 2.0) * 0.5 + (dkH21(vec2(r, 5.7 + salt)) - 0.5) * 0.3;   // rows are not perfectly staggered
    float cx = floor(pl.x - off + 0.5);
    for (int dc = -1; dc <= 1; dc++) {
      float c = cx + float(dc);
      vec2 rnd = dkH22(vec2(c, r) + 0.37 + salt);
      vec2 A = vec2(c + off + (rnd.x - 0.5) * jit, r + (rnd.y - 0.5) * jit * 0.5);
      float latA = abs(A.x / lev) / max(halfN, 1.0);
      if (dkPresence(lv, latA, neck, dkH21(vec2(c, r) + 3.1 + salt), region) < 0.5) continue;
      float Wc = 1.14 + 0.2 * rnd.y, Lc = 1.48 + 0.26 * rnd.x;
      if (lv < 0.5) { Wc *= 0.92; Lc *= 1.12; }          // scutes: a little elongated
      vec2 q = (pl - A - vec2(0.0, Lc * 0.5)) / vec2(Wc * 0.5, Lc * 0.5);
      // an irregular outline: the radius wobbles with the angle, differently per scale
      float ph = atan(q.y, q.x);
      float wob = 1.0 + 0.09 * sin(3.0 * ph + rnd.x * 6.28) + 0.05 * sin(5.0 * ph + rnd.y * 6.28) + (q.y > 0.0 ? 0.0 : 0.06);
      float e2 = dot(q, q) / (wob * wob);
      if (e2 >= 1.0) continue;
      float key = r * 4.0 + e2;
      if (key < best) { best = key; bq = q / wob; bW = Wc; bL = Lc; bR = rnd; S.id = dkH21(vec2(c, r) + 7.1 + salt); }
    }
  }
  if (best > 1e8) return S;
  S.lv = lv;
  vec2 q = bq;
  S.q = q;
  float e2 = dot(q, q), e = sqrt(max(e2, 1e-6));
  // body: rise toward the free edge + dome + keel (scutes: a strong central keel)
  float kk = lv < 0.5 ? max(keel, 0.35) : keel * (0.6 + 0.8 * bR.x);
  const float a = 0.58, b = 0.34;
  float kw = lv < 0.5 ? 0.3 : 0.22;
  float kx = max(0.0, 1.0 - abs(q.x) / kw);
  float s = a * (q.y + 1.0) * 0.5 + b * (1.0 - e2) + kk * kx * (q.y + 1.0) * 0.5;
  vec2 ds = vec2(-2.0 * b * q.x + kk * (kx > 0.0 ? -sign(q.x) / kw : 0.0) * (q.y + 1.0) * 0.5,
                 a * 0.5 - 2.0 * b * q.y + kk * kx * 0.5);
  if (facet > 0.0) {
    // crystal-like planar facets: a low pyramid around a per-scale apex (Starlight)
    vec2 ap = vec2((bR.x - 0.5) * 0.4, 0.15 + (bR.y - 0.5) * 0.3);
    vec2 dq = q - ap;
    float px = abs(dq.x) * 1.15, py = abs(dq.y) * 0.8 + dq.x * (bR.y - 0.5) * 0.6;
    float pyr = px > py ? px : py;
    vec2 dpyr = px > py ? vec2(sign(dq.x) * 1.15, 0.0) : vec2((bR.y - 0.5) * 0.6, sign(dq.y) * 0.8);
    s = mix(s, a * (q.y + 1.0) * 0.4 + 0.45 * (1.0 - pyr), facet);
    ds = mix(ds, vec2(0.0, a * 0.4) - 0.45 * dpyr, facet);
  }
  // bevelled rim (soft: the skin folds in between, it is not a cut)
  float bw = lv < 0.5 ? 0.24 : 0.2;
  float t = clamp((1.0 - e) / bw, 0.0, 1.0);
  float bev = t * t * (3.0 - 2.0 * t);
  float dbev = (t > 0.0 && t < 1.0) ? -6.0 * t * (1.0 - t) / bw : 0.0;
  // each scale sits at its own height: some lie flat, some are raised
  float amp = (0.55 + 0.7 * dkH21(bR * 3.7 + 1.3)) * (lv > 1.5 ? 0.75 : 1.0);
  S.h = s * bev * amp;
  vec2 dhq = (ds * bev + s * dbev * q / e) * amp;
  // big scutes (osteoderms) are pitted and rough, not polished coins
  if (lv < 0.5) {
    vec2 pq = q * 2.6 + bR * 17.0;
    float n0 = dkVnoise2(pq), nx = dkVnoise2(pq + vec2(0.05, 0.0)), ny = dkVnoise2(pq + vec2(0.0, 0.05));
    S.h += (n0 - 0.5) * 0.12 * bev;
    dhq += vec2(nx - n0, ny - n0) / 0.05 * 2.6 * 0.12 * bev;
  }
  S.grad = dhq / vec2(bW * 0.5, bL * 0.5);
  S.cav = 1.0 - bev;
  // rubbed: the keel and the crown of raised scales, more on big scutes, varied per scale
  S.wear = (smoothstep(0.4, 0.95, (q.y + 1.0) * 0.5) * bev * smoothstep(1.0, 0.7, e) * 0.5 + kx * kk * 0.8) * (0.25 + 0.75 * dkH21(bR + 9.3)) * (lv < 0.5 ? 1.0 : 0.6);
  return S;
}
DKScale dkHier(vec2 p, float jit, float keel, float facet, float halfN, float neck, float region) {
  DKScale S = dkImbricateL(p, 0.5, 0.0, jit, keel, facet, halfN, neck, region);
  if (S.lv < 0.0) S = dkImbricateL(p, 1.0, 1.0, jit, keel, facet, halfN, neck, region);
  if (S.lv < 0.0) S = dkImbricateL(p, 1.8, 2.0, jit * 1.2, keel * 0.4, facet, halfN, neck, region);
  return S;
}
DKScale dkImbricate(vec2 p, float jit, float keel, float facet) { return dkImbricateL(p, 1.0, 2.0, jit, keel, facet, 1.0, 0.0, 0.0); }

// ---- belly plates (transverse scutes, symmetric about the ventral midline) ---
// p.x = lateral distance from the midline, p.y = along; both in scale units.
// Real ventral scutes are not graph paper: rows differ in length, seams bow back toward the
// sides (they follow the girth), every row has its own column widths and stagger, and the
// plates shrink toward the flanks.
DKScale dkPlates(vec2 p, float plateL, float plateW) {
  DKScale S;
  float xn = p.x / plateW;
  float y0 = p.y / plateL;
  // uneven row lengths + seams curving back toward the sides + a little meander
  float y = y0 + 0.32 * (dkVnoise2(vec2(y0 * 0.45, 2.3)) - 0.5) - 0.05 * xn * xn + 0.1 * (dkVnoise2(vec2(y0 * 0.9, xn * 0.6 + 5.0)) - 0.5);
  float r = floor(y);
  float fy = fract(y);
  vec2 rr = dkH22(vec2(r, 1.7));
  // per-row column width and stagger; narrower plates toward the flanks
  float wRow = 0.8 + 0.45 * rr.x;
  float xs = xn / wRow;
  xs = sign(xs) * pow(abs(xs), 0.85);
  float x = xs + (rr.y - 0.5) * 0.6 + 0.5;
  float c = floor(x + 0.5);
  float fx = x - c;             // -0.5 .. 0.5
  vec2 rnd = dkH22(vec2(c, r) + 3.3);
  // rounded-rectangle bevels front/back and at the sides
  float ty = clamp(fy / 0.16, 0.0, 1.0), tb = clamp((1.0 - fy) / 0.05, 0.0, 1.0);
  float tx = clamp((0.5 - abs(fx)) / (0.1 + 0.06 * rnd.y), 0.0, 1.0);
  float by = ty * ty * (3.0 - 2.0 * ty), bb = tb * tb * (3.0 - 2.0 * tb), bx = tx * tx * (3.0 - 2.0 * tx);
  float rise = 0.35 + 0.65 * fy;              // imbricate: rises toward the free (posterior) edge
  float bev = by * bb * bx;
  float a = 0.8 + 0.4 * rnd.x;
  S.h = rise * bev * a;
  float dby = (ty > 0.0 && ty < 1.0 ? 6.0 * ty * (1.0 - ty) / 0.16 : 0.0) * bb - by * (tb > 0.0 && tb < 1.0 ? 6.0 * tb * (1.0 - tb) / 0.05 : 0.0);
  float dbx = -(tx > 0.0 && tx < 1.0 ? 6.0 * tx * (1.0 - tx) / (0.1 + 0.06 * rnd.y) : 0.0) * sign(fx);
  S.grad = vec2(rise * by * bb * dbx / (plateW * wRow), (0.65 * bev + rise * bx * dby) / plateL) * a;
  // worn, scratched plates (the belly drags on the ground)
  float sc = smoothstep(0.75, 0.95, dkVnoise2(vec2(fx * 3.0 + rnd.x * 9.0, fy * 26.0)));
  S.cav = max(1.0 - bev, sc * 0.25 * bev);
  S.wear = bev * smoothstep(0.55, 0.95, fy) * (0.5 + 0.5 * rnd.y);
  S.id = dkH21(vec2(c, r) + 9.7);
  S.q = vec2(fx * 2.0, fy * 2.0 - 1.0);
  S.lv = 3.0;
  return S;
}

// ---- granular scales (joints, limb backs, lids): Voronoi domes in a plane ----
DKScale dkGranule(vec2 p) {
  DKScale S;
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 9.0, d2 = 9.0; vec2 v1 = vec2(0.0); vec2 id1 = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = dkH22(ip + g) * 0.8 + 0.1;
    vec2 r = g + o - fp;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; v1 = r; id1 = ip + g; } else if (d < d2) d2 = d;
  }
  const float rad = 0.68;
  float hh = max(0.0, 1.0 - d1 / (rad * rad));
  float edge = smoothstep(0.0, 0.16, sqrt(d2) - sqrt(d1));
  S.h = hh * edge * 0.8;
  S.grad = (hh > 0.0 ? 2.0 * v1 / (rad * rad) : vec2(0.0)) * edge * 0.8;
  S.cav = 1.0 - edge;
  S.wear = hh * edge * 0.5;
  S.id = dkH21(id1);
  S.q = -v1;
  S.lv = 4.0;
  return S;
}
`;

export const GLSL_VOR3 = /* glsl */`
// ---- 3D anisotropic Voronoi scales ----------------------------------------------
// Cells are seeded in 3D rest space, so the surface slices them into an irregular
// mosaic with no projection blending, no seams and no chain-coordinate stretching
// (the way real lizard and crocodile skin looks: no two scales alike, sizes grading
// smoothly). The metric is compressed along T (the free-edge direction): scales are
// elongated along the body (an > 1). Each scale tilts up toward its free edge, so its
// rear rim stands above the front of the next one (imbricate overlap).
// p: rest position / cell size. Returns height (cell units), its gradient d/dp,
// cavity, crown (raised, rubbed), two per-scale randoms.
struct DKV3 { float h; vec3 g; float cav; float crown; float id; float id2; };
float dkKeel3 = 0.0;   // keel height along each scale (set by the caller)
// shape: q = d1 / F2s, where F2s is a SMOOTH minimum of the distances to all the other
// cell points (no creases inside a scale where the second-nearest neighbour changes):
// 0 at the scale's centre, ~1 on its border -> height 1 - q^k: k = 2 a rounded bead,
// k = 6 a flat plate with a rounded rim; tilt raises the free (rear) edge (imbricate)
DKV3 dkVor3(vec3 p, vec3 T, float an, float tilt, float k, float cavW, float jit) {
  vec3 ip = floor(p), fp = fract(p);
  float ka = 1.0 / an - 1.0;
  const float K = 9.0;
  float d1 = 1e9; vec3 m1 = vec3(0.0); vec3 c1 = vec3(0.0);
  float ws = 0.0; vec3 wg = vec3(0.0); float w1 = 0.0; vec3 g1w = vec3(0.0);
  for (int kk = -1; kk <= 1; kk++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(kk));
    vec3 o = 0.5 + (dkH33(ip + g) - 0.5) * jit;
    vec3 r = g + o - fp;
    vec3 rm = r + ka * dot(r, T) * T;
    float l = sqrt(dot(rm, rm)) + 1e-5;
    float w = exp(-K * l);
    vec3 gl = -(rm + ka * dot(rm, T) * T) / l;          // grad of l w.r.t. p
    ws += w; wg += w * gl;
    if (l < d1) { d1 = l; m1 = rm; c1 = ip + g; w1 = w; g1w = gl; }
  }
  DKV3 V;
  float wo = max(ws - w1, 1e-30);
  float l2 = -log(wo) / K;                               // smooth distance to the other cells
  vec3 g2 = (wg - w1 * g1w) / wo;
  float q = clamp(d1 / max(l2, 1e-4), 0.0, 1.0);
  vec3 gq = (g1w * l2 - d1 * g2) / (l2 * l2);
  float qk = pow(q, k);
  float prof = 1.0 - qk;
  vec3 gprof = -k * qk / max(q, 1e-4) * gq;
  float tl = clamp(-dot(m1, T), -0.6, 0.6);              // -0.5 front .. +0.5 free (rear) edge
  vec3 gtl = abs(tl) < 0.6 ? T / an : vec3(0.0);
  vec3 h3 = dkH33(c1 + 7.7);
  float amp = 0.65 + 0.7 * h3.x;                         // some scales lie flat, some stand proud
  float body = 1.0 + tilt * tl;
  V.h = prof * body * amp;
  V.g = (gprof * body + prof * tilt * gtl) * amp;
  if (dkKeel3 > 0.0) {
    // a low ridge down the middle of the scale, strongest toward its free (rear) edge
    vec3 lat = m1 - dot(m1, T) * T;
    float ll = length(lat) + 1e-5;
    const float kw = 0.2;
    float kr = max(0.0, 1.0 - ll / kw) * smoothstep(-0.5, 0.35, tl) * prof;
    V.h += dkKeel3 * kr * amp;
    V.g += dkKeel3 * (ll < kw ? (lat / ll) / kw : vec3(0.0)) * smoothstep(-0.5, 0.35, tl) * prof * amp;
  }
  V.cav = smoothstep(1.0 - cavW, 1.0, q);
  V.crown = prof * prof * clamp(0.6 + tilt * tl * 1.5, 0.0, 1.0) * (0.5 + 0.5 * h3.x);
  V.id = h3.y; V.id2 = h3.z;
  return V;
}
// sparse enlarged tubercles (osteoderms) on a coarser lattice: a raised, keeled dome in
// some of its cells (density 0..1), overriding the small scales under it
struct DKT3 { float m; float h; vec3 g; float id; };
DKT3 dkTub3(vec3 p, vec3 T, float density, float rad) {
  vec3 ip = floor(p), fp = fract(p);
  float best = 1e9; vec3 br = vec3(0.0); vec3 bc = vec3(0.0);
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 c = ip + g;
    if (dkH33(c + 3.3).x > density) continue;
    vec3 r = g + 0.25 + 0.5 * dkH33(c + 9.1) - fp;
    float d = dot(r, r);
    if (d < best) { best = d; br = r; bc = c; }
  }
  DKT3 R; R.m = 0.0; R.h = 0.0; R.g = vec3(0.0); R.id = 0.0;
  vec3 hh = dkH33(bc + 5.5);
  float rr = rad * (0.7 + 0.5 * hh.x);
  if (best >= rr * rr) return R;
  float d = sqrt(best), x = d / rr;
  float a = 0.9 + 0.5 * hh.y;
  vec3 lat = br - dot(br, T) * T;
  float kw = rr * 0.3;
  float kl = max(0.0, 1.0 - length(lat) / kw);
  float prof = 1.0 - x * x;
  R.h = prof * a * (1.0 + 0.45 * kl);
  R.g = (2.0 * br / (rr * rr)) * a * (1.0 + 0.45 * kl) + prof * a * 0.45 * (kl > 0.0 ? normalize(lat + 1e-6) / kw : vec3(0.0));
  R.m = smoothstep(1.0, 0.82, x);
  R.id = hh.z;
  return R;
}
`;
