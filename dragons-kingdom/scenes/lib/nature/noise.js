// Seeded noise for the nature library - plain JS, no three.js, so the same code runs in the
// offline bakes (Node) and in the browser (scatter placement, height queries).
//
//   import { makeNoise, hash2, hash3, mulberry } from './noise.js';
//   const N = makeNoise(7);
//   N.n2(x, z)  N.n3(x, y, z)          gradient noise, about [-1, 1]
//   N.fbm2(x, z, oct)  N.fbm3(x, y, z, oct)  N.ridged2(x, z, oct)  N.cell2(x, z) (Worley F1/F2)
//
// Never uses Math.random: everything is a pure function of the seed and the inputs.

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless integer hashes -> [0, 1). */
export function hash2(i, j, seed = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash3(i, j, k, seed = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 2147483647) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
/** polynomial smooth min / max (k = blend radius) */
export function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); }
export function smax(a, b, k) { return -smin(-a, -b, k); }

export function makeNoise(seed = 1) {
  const rng = mulberry(seed * 9973 + 17);
  const perm = new Int32Array(512);
  const p = new Int32Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  // 2D gradients: 256 unit vectors; 3D: 12 cube-edge gradients (Perlin's improved noise)
  const g2x = new Float64Array(256), g2y = new Float64Array(256);
  for (let i = 0; i < 256; i++) { const a = rng() * Math.PI * 2; g2x[i] = Math.cos(a); g2y[i] = Math.sin(a); }
  const G3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
  const g3 = new Float64Array(256 * 3);
  for (let i = 0; i < 256; i++) { const g = G3[perm[i] % 12]; g3[i * 3] = g[0]; g3[i * 3 + 1] = g[1]; g3[i * 3 + 2] = g[2]; }

  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = perm[X + perm[Y]], b = perm[X + 1 + perm[Y]], c = perm[X + perm[Y + 1]], d = perm[X + 1 + perm[Y + 1]];
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const na = g2x[a] * xf + g2y[a] * yf, nb = g2x[b] * (xf - 1) + g2y[b] * yf;
    const nc = g2x[c] * xf + g2y[c] * (yf - 1), nd = g2x[d] * (xf - 1) + g2y[d] * (yf - 1);
    return 1.41 * ((na + (nb - na) * u) * (1 - v) + (nc + (nd - nc) * u) * v);
  }
  function n3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const X = xi & 255, Y = yi & 255, Z = zi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10), w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z, B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    const gd = (h, x, y, z) => { const k = (h & 255) * 3; return g3[k] * x + g3[k + 1] * y + g3[k + 2] * z; };
    const x1 = gd(perm[AA], xf, yf, zf), x2 = gd(perm[BA], xf - 1, yf, zf);
    const x3 = gd(perm[AB], xf, yf - 1, zf), x4 = gd(perm[BB], xf - 1, yf - 1, zf);
    const x5 = gd(perm[AA + 1], xf, yf, zf - 1), x6 = gd(perm[BA + 1], xf - 1, yf, zf - 1);
    const x7 = gd(perm[AB + 1], xf, yf - 1, zf - 1), x8 = gd(perm[BB + 1], xf - 1, yf - 1, zf - 1);
    const y1 = x1 + (x2 - x1) * u, y2 = x3 + (x4 - x3) * u, y3 = x5 + (x6 - x5) * u, y4 = x7 + (x8 - x7) * u;
    const z1 = y1 + (y2 - y1) * v, z2 = y3 + (y4 - y3) * v;
    return 0.95 * (z1 + (z2 - z1) * w);
  }
  function fbm2(x, y, oct = 5, lac = 2.03, gain = 0.5) {
    let s = 0, a = 1, nrm = 0;
    for (let o = 0; o < oct; o++) { s += a * n2(x, y); nrm += a; a *= gain; x = x * lac + 13.7; y = y * lac - 7.3; }
    return s / nrm;
  }
  function fbm3(x, y, z, oct = 4, lac = 2.03, gain = 0.5) {
    let s = 0, a = 1, nrm = 0;
    for (let o = 0; o < oct; o++) { s += a * n3(x, y, z); nrm += a; a *= gain; x = x * lac + 13.7; y = y * lac - 7.3; z = z * lac + 3.1; }
    return s / nrm;
  }
  function ridged2(x, y, oct = 5, lac = 2.1, gain = 0.5) {
    let s = 0, a = 0.5, prev = 1, nrm = 0;
    for (let o = 0; o < oct; o++) { let r = 1 - Math.abs(n2(x, y)); r *= r; s += r * a * prev; nrm += a; prev = r; a *= gain; x = x * lac + 31.7; y = y * lac + 5.3; }
    return s / nrm;
  }
  /** Worley noise: [F1, F2, cell id hash] for unit cells */
  function cell2(x, y, jitter = 0.9) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const px = cx + 0.5 + (hash2(cx, cy, seed) - 0.5) * jitter, py = cy + 0.5 + (hash2(cx, cy, seed + 7) - 0.5) * jitter;
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(cx, cy, seed + 13); } else if (d < f2) f2 = d;
    }
    return [f1, f2, id];
  }
  /**
   * Fractured-rock displacement: the nearest Voronoi cell's own random plane, evaluated at p.
   * Piecewise planar facets with small steps where cells meet (broken rock), in about [-1, 1].
   */
  function facet3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let best = 9, bx = 0, by = 0, bz = 0, bi = 0, bj = 0, bk = 0;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, cz = zi + k;
      const px = cx + hash3(cx, cy, cz, seed), py = cy + hash3(cx, cy, cz, seed + 1), pz = cz + hash3(cx, cy, cz, seed + 2);
      const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
      if (d < best) { best = d; bx = px; by = py; bz = pz; bi = cx; bj = cy; bk = cz; }
    }
    const a = hash3(bi, bj, bk, seed + 3) * 6.2832, b = hash3(bi, bj, bk, seed + 4) * 2 - 1, r = Math.sqrt(1 - b * b);
    const nx = r * Math.cos(a), ny = b, nz = r * Math.sin(a);
    return ((x - bx) * nx + (y - by) * ny + (z - bz) * nz) * 1.2 + (hash3(bi, bj, bk, seed + 5) - 0.5);
  }
  return { n2, n3, fbm2, fbm3, ridged2, cell2, facet3, seed };
}
