// Heightfield terrain for sets: islands, coasts, fields.
//
//   const land = heightfield({ x: [x0, x1], z: [z0, z1], nx: 512, nz: 512,
//                              height: (x, z) => ..., splat: (x, z, y, n) => [w0, w1, w2, w3] });
//   scene.add(new THREE.Mesh(land.geometry, await terrainMaterial(ctx, layers)));
//
// The grid can be graded (finer cells near a point of interest) with
// gradedAxis(); normals come from the analytic height function, not from the
// triangles, so lighting is smooth even on a coarse far grid.
import * as THREE from 'three';

/** n+1 coordinates from a to b, denser around `focus` (strength 0 = uniform, 3 = ~10x finer at the focus). */
export function gradedAxis(a, b, n, focus = (a + b) / 2, strength = 0) {
  const out = new Float64Array(n + 1);
  if (!strength) { for (let i = 0; i <= n; i++) out[i] = a + (b - a) * i / n; return out; }
  // density ~ 1 + strength * exp(-(x - focus)^2 / w^2): integrate numerically and invert
  const w = (b - a) * 0.12;
  const M = 4096, cdf = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) {
    const x = a + (b - a) * (i - 0.5) / M;
    cdf[i] = cdf[i - 1] + 1 + strength * strength * Math.exp(-((x - focus) ** 2) / (w * w));
  }
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const target = cdf[M] * i / n;
    while (j < M && cdf[j + 1] < target) j++;
    const f = (target - cdf[j]) / Math.max(cdf[j + 1] - cdf[j], 1e-12);
    out[i] = a + (b - a) * (j + Math.min(1, Math.max(0, f))) / M;
  }
  out[0] = a; out[n] = b;
  return out;
}

/**
 * opts: xs / zs (coordinate arrays) or x:[x0,x1], z:[z0,z1], nx, nz;
 * height(x, z); splat(x, z, y, normal) -> [w0..w3] (optional); color(x, z, y, normal) -> [r,g,b] (optional);
 * skip(x, z, y) -> true drops cells entirely under water etc. (optional).
 */
export function heightfield(opts) {
  const xs = opts.xs || gradedAxis(opts.x[0], opts.x[1], opts.nx);
  const zs = opts.zs || gradedAxis(opts.z[0], opts.z[1], opts.nz);
  const NX = xs.length, NZ = zs.length;
  const N = NX * NZ;
  const pos = new Float32Array(N * 3), nrm = new Float32Array(N * 3);
  const splat = opts.splat ? new Float32Array(N * 4) : null;
  const col = opts.color ? new Float32Array(N * 3) : null;
  const H = opts.height;
  const ys = new Float32Array(N);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) ys[j * NX + i] = H(xs[i], zs[j]);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = xs[i], z = zs[j], y = ys[k];
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    // analytic normal from central differences at the local cell size
    const hx = Math.max(0.05, (xs[Math.min(i + 1, NX - 1)] - xs[Math.max(i - 1, 0)]) * 0.5);
    const hz = Math.max(0.05, (zs[Math.min(j + 1, NZ - 1)] - zs[Math.max(j - 1, 0)]) * 0.5);
    const dx = (H(x + hx, z) - H(x - hx, z)) / (2 * hx), dz = (H(x, z + hz) - H(x, z - hz)) / (2 * hz);
    const l = Math.hypot(dx, 1, dz);
    const n = [-dx / l, 1 / l, -dz / l];
    nrm[k * 3] = n[0]; nrm[k * 3 + 1] = n[1]; nrm[k * 3 + 2] = n[2];
    if (splat) { const w = opts.splat(x, z, y, n); for (let c = 0; c < 4; c++) splat[k * 4 + c] = w[c] || 0; }
    if (col) { const c = opts.color(x, z, y, n); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
  }
  const idx = [];
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    if (opts.skip && opts.skip(ys[a], ys[b], ys[c], ys[d])) continue;
    // split along the shorter diagonal (fewer slivers on ridges)
    if (Math.abs(ys[a] - ys[d]) < Math.abs(ys[b] - ys[c])) idx.push(a, c, d, a, d, b);
    else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (splat) g.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(N > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return { geometry: g, xs, zs, heightAt: H };
}

/** Smooth noise helpers for height functions (deterministic, seeded). */
export function makeNoise(seed = 1) {
  // value-gradient noise on a hashed lattice (no tables: stable across machines)
  const hash = (i, j) => {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const grad = (i, j, x, y) => { const a = hash(i, j) * Math.PI * 2; return Math.cos(a) * x + Math.sin(a) * y; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fade(fx), v = fade(fy);
    const a = grad(i, j, fx, fy), b = grad(i + 1, j, fx - 1, fy), c = grad(i, j + 1, fx, fy - 1), d = grad(i + 1, j + 1, fx - 1, fy - 1);
    return 1.4 * ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v);
  }
  function fbm(x, y, oct = 5, lac = 2.03, gain = 0.5) {
    let s = 0, a = 1, nrm = 0;
    for (let o = 0; o < oct; o++) { s += a * n2(x, y); nrm += a; a *= gain; x = x * lac + 13.7; y = y * lac - 7.3; }
    return s / nrm;
  }
  function ridged(x, y, oct = 5, lac = 2.1, gain = 0.5) {
    let s = 0, a = 0.5, prev = 1, nrm = 0;
    for (let o = 0; o < oct; o++) { let r = 1 - Math.abs(n2(x, y)); r *= r; s += r * a * prev; nrm += a; prev = r; a *= gain; x = x * lac + 31.7; y = y * lac + 5.3; }
    return s / nrm;
  }
  return { n2, fbm, ridged, hash };
}

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
