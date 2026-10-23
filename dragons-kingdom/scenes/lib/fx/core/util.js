// FX library - small deterministic helpers (hashes, noise, easing, vectors).
//
// Everything here is a pure function of its arguments: no Math.random, no clocks. Integer hashes
// (not sin-hashes) so values do not depend on float precision at large indices or times.

/** 32-bit integer hash -> [0, 1). Any number of integer-ish arguments. */
export function hash01(...a) {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < a.length; i++) {
    let k = Math.floor(a[i]) | 0;
    k = Math.imul(k ^ (k >>> 16), 0x7feb352d);
    k = Math.imul(k ^ (k >>> 15), 0x846ca68b);
    k ^= k >>> 16;
    h = Math.imul(h ^ k, 0x01000193);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** hash in [-1, 1) */
export const hashS = (...a) => hash01(...a) * 2 - 1;

/** A stream of hashed values for one item: r(k) -> [0,1) for k = 0, 1, 2 ... */
export function stream(seed, i) { return (k) => hash01(seed, i, k); }

/** Approx. standard normal from two hashes (Box-Muller). */
export function gauss(seed, i, k) {
  const u = Math.max(1e-7, hash01(seed, i, k)), v = hash01(seed, i, k + 7919);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const fract = (x) => x - Math.floor(x);

// ---------------------------------------------------------------- noise (CPU) --
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad1(seed, i) { return hash01(seed, i) * 2 - 1; }
/** 1D gradient noise, roughly in [-0.5, 0.5]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = grad1(seed, i) * f, b = grad1(seed, i + 1) * (f - 1);
  return a + (b - a) * fade(f);
}
/** 1D fbm in about [-1, 1]. */
export function fbm1(x, seed = 0, oct = 4) {
  let s = 0, a = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * noise1(x, seed + o * 101); n += a; x *= 2.03; a *= 0.5; }
  return (s / n) * 2;
}
/** 3D value noise in [0, 1] (smooth). */
export function vnoise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
    r += w * hash01(seed, ix + dx, iy + dy, iz + dz);
  }
  return r;
}
/**
 * A smooth, divergence-free-ish turbulent velocity field (curl of three phase-shifted noise
 * potentials), evaluated at (x, y, z, t). Returns [vx, vy, vz] with |v| ~ 1. Used to wobble
 * particle paths; the integral over a particle's age is approximated analytically by callers.
 */
export function curl3(x, y, z, t, seed = 0, out = [0, 0, 0]) {
  const e = 0.35;
  const P = (ax, ay, az, s) => vnoise3(ax, ay + t * 0.31, az - t * 0.23, seed + s);
  const p1y1 = P(x, y + e, z, 11), p1y0 = P(x, y - e, z, 11), p1z1 = P(x, y, z + e, 11), p1z0 = P(x, y, z - e, 11);
  const p2x1 = P(x + e, y, z, 23), p2x0 = P(x - e, y, z, 23), p2z1 = P(x, y, z + e, 23), p2z0 = P(x, y, z - e, 23);
  const p3x1 = P(x + e, y, z, 37), p3x0 = P(x - e, y, z, 37), p3y1 = P(x, y + e, z, 37), p3y0 = P(x, y - e, z, 37);
  const k = 1 / (2 * e);
  out[0] = ((p3y1 - p3y0) - (p2z1 - p2z0)) * k;
  out[1] = ((p1z1 - p1z0) - (p3x1 - p3x0)) * k;
  out[2] = ((p2x1 - p2x0) - (p1y1 - p1y0)) * k;
  return out;
}

// ---------------------------------------------------------------- ballistics --
/**
 * Point mass with linear drag k (1/s) toward a moving air velocity w and gravity g, analytic:
 *   v(t) = vt + (v0 - vt) e^{-kt},  vt = w + g/k
 *   p(t) = p0 + vt t + (v0 - vt)(1 - e^{-kt})/k
 * writes p (and v if given). k -> 0 falls back to the drag-free parabola.
 */
export function ballistic(p0, v0, g, k, w, t, p, v) {
  if (k < 1e-5) {
    for (let i = 0; i < 3; i++) {
      p[i] = p0[i] + v0[i] * t + 0.5 * g[i] * t * t;
      if (v) v[i] = v0[i] + g[i] * t;
    }
    return p;
  }
  const e = Math.exp(-k * t), f = (1 - e) / k;
  for (let i = 0; i < 3; i++) {
    const vt = (w ? w[i] : 0) + g[i] / k;
    p[i] = p0[i] + vt * t + (v0[i] - vt) * f;
    if (v) v[i] = vt + (v0[i] - vt) * e;
  }
  return p;
}
/**
 * First time (> 0) a drag ballistic path crosses height y = h going down (bisection on the
 * analytic path; the path is convex in y so one crossing after the apex). Returns Infinity if it
 * never does within tMax.
 */
export function ballisticHitY(p0, v0, g, k, w, h, tMax = 30) {
  const p = [0, 0, 0];
  if (p0[1] <= h) return 0;
  // march coarse, then bisect
  let a = 0, b = 0, dt = 0.02;
  for (let t = dt; t <= tMax; t += dt) {
    ballistic(p0, v0, g, k, w, t, p);
    if (p[1] <= h) { b = t; break; }
    a = t; dt = Math.min(0.25, dt * 1.15);
  }
  if (b === 0) return Infinity;
  for (let i = 0; i < 30; i++) {
    const m = 0.5 * (a + b);
    ballistic(p0, v0, g, k, w, m, p);
    if (p[1] > h) a = m; else b = m;
  }
  return 0.5 * (a + b);
}

// ---------------------------------------------------------------- easing --
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
export const easeInOut = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
/** 0 before a, rises to 1 at b, stays, falls to 0 between c and d (all smooth). */
export function envelope(t, a, b, c = Infinity, d = Infinity) {
  if (t <= a || t >= d) return 0;
  const up = b > a ? smoothstep(a, b, t) : 1;
  const down = d > c && Number.isFinite(c) ? 1 - smoothstep(c, d, t) : 1;
  return up * down;
}

/** [x,y,z] | THREE.Vector3 | {x,y,z} -> [x,y,z] */
export function arr3(v, def = [0, 0, 0]) {
  if (v == null) return def.slice();
  if (Array.isArray(v)) return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
  return [v.x ?? 0, v.y ?? 0, v.z ?? 0];
}
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export function norm3(a) { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Orthonormal basis [u, v] perpendicular to unit n. */
export function basis3(n) {
  const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm3(cross3(a, n));
  return [u, cross3(n, u)];
}
/** A random unit vector inside a cone of half-angle `spread` (radians) around unit dir. */
export function coneDir(dir, spread, h1, h2, out = [0, 0, 0]) {
  const [u, v] = basis3(dir);
  const ct = 1 - h1 * (1 - Math.cos(spread)), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = 2 * Math.PI * h2;
  for (let i = 0; i < 3; i++) out[i] = dir[i] * ct + (u[i] * Math.cos(ph) + v[i] * Math.sin(ph)) * st;
  return out;
}

/**
 * Resolve an "at" spec to a position at time t: [x,y,z] | Vector3 | (t) => Vector3|[x,y,z] |
 * { object, offset: [x,y,z] } (offset in the object's local frame; reads the object's current
 * world matrix - pose it for t first) | { point: name } (director point via api.point).
 */
export function resolveAt(at, t, THREE, api) {
  if (at == null) return [0, 0, 0];
  if (typeof at === 'function') return arr3(at(t));
  if (Array.isArray(at) || at.isVector3) return arr3(at);
  if (at.object) {
    const o = at.object;
    o.updateWorldMatrix(true, false);
    const v = new THREE.Vector3(...arr3(at.offset)).applyMatrix4(o.matrixWorld);
    return [v.x, v.y, v.z];
  }
  if (at.point && api?.point) return arr3(api.point(at.point, t));
  if ('x' in at) return arr3(at);
  return [0, 0, 0];
}
