// FX library - tileable 3D noise volume shared by every FX shader (built once per page in JS,
// deterministic: the same bytes on every machine).
//
//   R: value-noise fbm (4 octaves)          - soft, wispy density
//   G: inverted Worley fbm (3 octaves)      - billowy "cauliflower" cells (smoke, dust, steam)
//   B: a second, decorrelated value fbm     - curl / domain-warp offsets
//   A: fine detail value noise (2 octaves at 4x frequency) - erosion of edges
// Size N^3 (tier.noise3D), RepeatWrapping, linear filtering.
import * as THREE from 'three';

function hashI(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueFbm(f, N, octaves, base, seed) {
  const out = new Float32Array(N * N * N);
  for (let o = 0, amp = 0.5; o < octaves; o++, amp *= 0.5) {
    const P = base << o;
    // lattice values for this octave
    const lat = new Float32Array(P * P * P);
    for (let i = 0; i < lat.length; i++) lat[i] = hashI(i % P, Math.floor(i / P) % P, Math.floor(i / (P * P)), seed + o * 31);
    const sc = P / N;
    for (let z = 0; z < N; z++) {
      const fz = z * sc, iz = Math.floor(fz), uz = fz - iz, sz = uz * uz * (3 - 2 * uz);
      const z0 = (iz % P) * P * P, z1 = ((iz + 1) % P) * P * P;
      for (let y = 0; y < N; y++) {
        const fy = y * sc, iy = Math.floor(fy), uy = fy - iy, sy = uy * uy * (3 - 2 * uy);
        const y0 = (iy % P) * P, y1 = ((iy + 1) % P) * P;
        for (let x = 0; x < N; x++) {
          const fx = x * sc, ix = Math.floor(fx), ux = fx - ix, sx = ux * ux * (3 - 2 * ux);
          const x0 = ix % P, x1 = (ix + 1) % P;
          const a = lat[z0 + y0 + x0] + (lat[z0 + y0 + x1] - lat[z0 + y0 + x0]) * sx;
          const b = lat[z0 + y1 + x0] + (lat[z0 + y1 + x1] - lat[z0 + y1 + x0]) * sx;
          const c = lat[z1 + y0 + x0] + (lat[z1 + y0 + x1] - lat[z1 + y0 + x0]) * sx;
          const d = lat[z1 + y1 + x0] + (lat[z1 + y1 + x1] - lat[z1 + y1 + x0]) * sx;
          const ab = a + (b - a) * sy, cd = c + (d - c) * sy;
          out[x + N * (y + N * z)] += amp * (ab + (cd - ab) * sz);
        }
      }
    }
  }
  return out;
}

function worleyFbm(N, octaves, base, seed) {
  const out = new Float32Array(N * N * N);
  for (let o = 0, amp = 0.55; o < octaves; o++, amp *= 0.5) {
    const P = base << o;
    // one feature point per cell
    const pts = new Float32Array(P * P * P * 3);
    for (let i = 0; i < P * P * P; i++) {
      const cx = i % P, cy = Math.floor(i / P) % P, cz = Math.floor(i / (P * P));
      pts[i * 3] = cx + hashI(cx, cy, cz, seed + o * 17);
      pts[i * 3 + 1] = cy + hashI(cx, cy, cz, seed + o * 17 + 1);
      pts[i * 3 + 2] = cz + hashI(cx, cy, cz, seed + o * 17 + 2);
    }
    const sc = P / N;
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const px = (x + 0.5) * sc, py = (y + 0.5) * sc, pz = (z + 0.5) * sc;
      const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
      let best = 9;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz;
        const wx = ((cx % P) + P) % P, wy = ((cy % P) + P) % P, wz = ((cz % P) + P) % P;
        const k = (wx + P * (wy + P * wz)) * 3;
        const qx = pts[k] + (cx - wx) - px, qy = pts[k + 1] + (cy - wy) - py, qz = pts[k + 2] + (cz - wz) - pz;
        const d2 = qx * qx + qy * qy + qz * qz;
        if (d2 < best) best = d2;
      }
      out[x + N * (y + N * z)] += amp * (1 - Math.min(1, Math.sqrt(best)));
    }
  }
  return out;
}

function normalize(f) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < f.length; i++) { const v = f[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * k;
  return f;
}

const cache = new Map();
/** The shared RGBA8 noise volume of size N (built once per page). */
export function noiseVolume(N = 64, seed = 7) {
  const key = `${N}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const r = normalize(valueFbm(null, N, 4, 4, seed));
  const g = normalize(worleyFbm(N, 3, 3, seed + 101));
  const b = normalize(valueFbm(null, N, 3, 3, seed + 211));
  const a = normalize(valueFbm(null, N, 2, 16, seed + 307));
  const data = new Uint8Array(N * N * N * 4);
  for (let i = 0; i < N * N * N; i++) {
    data[i * 4] = Math.round(r[i] * 255); data[i * 4 + 1] = Math.round(g[i] * 255);
    data[i * 4 + 2] = Math.round(b[i] * 255); data[i * 4 + 3] = Math.round(a[i] * 255);
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1; t.generateMipmaps = false; t.needsUpdate = true;
  t.name = `fx-noise-${N}`;
  cache.set(key, t);
  return t;
}

/** GLSL helpers for the noise volume (declare `uniform highp sampler3D uNoise;` first). */
export const NOISE_GLSL = /* glsl */`
vec4 fxN(vec3 p) { return texture(uNoise, p); }
// smoke density field: billowy cells eroded by wisps, in [0,1]
float fxBillow(vec3 p) { vec4 n = texture(uNoise, p); return clamp(n.g * 0.75 + n.r * 0.45 - 0.2, 0.0, 1.0); }
float fxWisp(vec3 p) { vec4 n = texture(uNoise, p); return n.r; }
`;
