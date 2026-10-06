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
float dkVnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dkH21(i), dkH21(i + vec2(1, 0)), f.x), mix(dkH21(i + vec2(0, 1)), dkH21(i + vec2(1, 1)), f.x), f.y);
}
`;

export const GLSL_SCALES = /* glsl */`
// ---- overlapping (imbricate) scales -----------------------------------------
// Staggered rows; each scale is an ellipse anchored at its base, longer than a
// row so it covers the base of the next row. Of the scales covering a point,
// the one from the earliest row lies on top. Height rises toward the free edge,
// with a dome across, an optional keel, and a rounded (bevelled) rim.
// out: h (0..~1), grad = dh/dp, cav (0 open .. 1 deep crevice), wear (raised rim), id
struct DKScale { float h; vec2 grad; float cav; float wear; float id; vec2 q; };
DKScale dkImbricate(vec2 p, float jit, float keel, float facet) {
  DKScale S; S.h = 0.0; S.grad = vec2(0.0); S.cav = 1.0; S.wear = 0.0; S.id = 0.0; S.q = vec2(0.0);
  float best = 1e9;
  vec2 bq = vec2(0.0); float bW = 1.0, bL = 1.0; vec2 bR = vec2(0.0);
  float ry = floor(p.y);
  for (int dr = -1; dr <= 0; dr++) {
    float r = ry + float(dr);
    float off = mod(r, 2.0) * 0.5;
    float cx = floor(p.x - off + 0.5);
    for (int dc = -1; dc <= 1; dc++) {
      float c = cx + float(dc);
      vec2 rnd = dkH22(vec2(c, r) + 0.37);
      vec2 A = vec2(c + off + (rnd.x - 0.5) * jit, r + (rnd.y - 0.5) * jit * 0.5);
      float Wc = 1.16 + 0.16 * rnd.y, Lc = 1.5 + 0.2 * rnd.x;
      vec2 q = (p - A - vec2(0.0, Lc * 0.5)) / vec2(Wc * 0.5, Lc * 0.5);
      float e2 = dot(q, q);
      if (e2 >= 1.0) continue;
      float key = r * 4.0 + e2;
      if (key < best) { best = key; bq = q; bW = Wc; bL = Lc; bR = rnd; S.id = dkH21(vec2(c, r) + 7.1); }
    }
  }
  if (best > 1e8) return S;
  vec2 q = bq;
  S.q = q;
  float e2 = dot(q, q), e = sqrt(max(e2, 1e-6));
  // body: rise toward the free edge + dome + keel
  const float a = 0.62, b = 0.32;
  float kx = max(0.0, 1.0 - abs(q.x) / 0.22);
  float s = a * (q.y + 1.0) * 0.5 + b * (1.0 - e2) + keel * kx * (q.y + 1.0) * 0.5;
  vec2 ds = vec2(-2.0 * b * q.x + keel * (kx > 0.0 ? -sign(q.x) / 0.22 : 0.0) * (q.y + 1.0) * 0.5,
                 a * 0.5 - 2.0 * b * q.y + keel * kx * 0.5);
  if (facet > 0.0) {
    // crystal-like planar facets: replace the dome with a low pyramid around a per-scale apex
    vec2 ap = vec2((bR.x - 0.5) * 0.4, 0.15 + (bR.y - 0.5) * 0.3);
    vec2 dq = q - ap;
    float px = abs(dq.x) * 1.15, py = abs(dq.y) * 0.8 + dq.x * (bR.y - 0.5) * 0.6;
    float pyr = px > py ? px : py;
    vec2 dpyr = px > py ? vec2(sign(dq.x) * 1.15, 0.0) : vec2((bR.y - 0.5) * 0.6, sign(dq.y) * 0.8);
    s = mix(s, a * (q.y + 1.0) * 0.4 + 0.45 * (1.0 - pyr), facet);
    ds = mix(ds, vec2(0.0, a * 0.4) - 0.45 * dpyr, facet);
  }
  // bevelled rim
  float t = clamp((1.0 - e) / 0.2, 0.0, 1.0);
  float bev = t * t * (3.0 - 2.0 * t);
  float dbev = (t > 0.0 && t < 1.0) ? -6.0 * t * (1.0 - t) / 0.2 : 0.0;
  float amp = 0.85 + 0.3 * bR.y;
  S.h = s * bev * amp;
  vec2 dhq = (ds * bev + s * dbev * q / e) * amp;
  S.grad = dhq / vec2(bW * 0.5, bL * 0.5);
  S.cav = 1.0 - bev;
  S.wear = smoothstep(0.35, 0.95, (q.y + 1.0) * 0.5) * bev * smoothstep(1.0, 0.75, e) + kx * keel * 0.5;
  return S;
}

// ---- belly plates (transverse scutes, symmetric about the ventral midline) ---
// p.x = lateral distance from the midline, p.y = along; both in scale units.
DKScale dkPlates(vec2 p, float plateL, float plateW) {
  DKScale S;
  float y = p.y / plateL;
  float r = floor(y);
  float fy = fract(y);
  float x = p.x / plateW;
  float c = floor(x + 0.5);
  float fx = x - c;             // -0.5 .. 0.5
  vec2 rnd = dkH22(vec2(c, r) + 3.3);
  // rounded-rectangle bevels front/back and at the sides
  float ty = clamp(fy / 0.16, 0.0, 1.0), tb = clamp((1.0 - fy) / 0.05, 0.0, 1.0);
  float tx = clamp((0.5 - abs(fx)) / 0.12, 0.0, 1.0);
  float by = ty * ty * (3.0 - 2.0 * ty), bb = tb * tb * (3.0 - 2.0 * tb), bx = tx * tx * (3.0 - 2.0 * tx);
  float rise = 0.35 + 0.65 * fy;              // imbricate: rises toward the free (posterior) edge
  float bev = by * bb * bx;
  S.h = rise * bev * (0.9 + 0.2 * rnd.x);
  float dby = (ty > 0.0 && ty < 1.0 ? 6.0 * ty * (1.0 - ty) / 0.16 : 0.0) * bb - by * (tb > 0.0 && tb < 1.0 ? 6.0 * tb * (1.0 - tb) / 0.05 : 0.0);
  float dbx = -(tx > 0.0 && tx < 1.0 ? 6.0 * tx * (1.0 - tx) / 0.12 : 0.0) * sign(fx);
  S.grad = vec2(rise * by * bb * dbx / plateW, (0.65 * bev + rise * bx * dby) / plateL) * (0.9 + 0.2 * rnd.x);
  S.cav = 1.0 - bev;
  S.wear = bev * smoothstep(0.55, 0.95, fy);
  S.id = dkH21(vec2(c, r) + 9.7);
  S.q = vec2(fx * 2.0, fy * 2.0 - 1.0);
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
  return S;
}
`;
