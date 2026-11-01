// Small shared helpers. No dependencies.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const dampFactor = (lambda, dt) => 1 - Math.exp(-lambda * dt);

// Distance from point P to segment AB in the XZ plane. Returns {d, t}.
const _seg = { d: 0, t: 0 };
export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t - px, cz = az + dz * t - pz;
  _seg.d = Math.sqrt(cx * cx + cz * cz);
  _seg.t = t;
  return _seg;
}

// Catmull-Rom through control points, resampled at roughly `step` metres.
// Passes exactly through the first and last points.
export function smoothPath(ctrl, step = 8) {
  if (ctrl.length < 3) return resample(ctrl, step);
  const pts = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const dense = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(segLen / 2));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(ctrl[ctrl.length - 1].slice());
  return resample(dense, step);
}

// Evenly resample a polyline at ~step metres.
export function resample(line, step) {
  const out = [line[0].slice()];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = step - carry;
    while (s <= L) {
      const t = s / L;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      s += step;
    }
    carry = L - (s - step);
  }
  const last = line[line.length - 1];
  const pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.35) out.push(last.slice());
  else out[out.length - 1] = last.slice();
  return out;
}

export function polylineLengths(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) {
    acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return acc;
}

// GLSL snippet shared by several shaders: hash + value noise + fbm.
export const GLSL_NOISE = /* glsl */ `
float sbHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float sbNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(sbHash(i), sbHash(i+vec2(1,0)), u.x), mix(sbHash(i+vec2(0,1)), sbHash(i+vec2(1,1)), u.x), u.y);
}
float sbFbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ s += a*sbNoise(p); p = p*2.03 + 17.1; a *= 0.5; }
  return s;
}
`;
