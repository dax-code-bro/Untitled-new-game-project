// Chunk geometry + map image builders (used by the terrain worker, and on the main thread as a fallback).
import { heightAt, colorAt, islandD, WORLD } from './terrain.js';

const col = [0, 0, 0];

export function buildChunk(x0, z0, size, res) {
  const n = res + 1, step = size / res, W = n + 2;
  const H = new Float32Array(W * W);
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) H[(j + 1) * W + (i + 1)] = heightAt(x0 + i * step, z0 + j * step);
  const skirtN = 4 * n;
  const vcount = n * n + skirtN;
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), cl = new Float32Array(vcount * 3);
  let minH = Infinity, maxH = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = H[(j + 1) * W + (i + 1)];
    const hl = H[(j + 1) * W + i], hr = H[(j + 1) * W + i + 2];
    const hu = H[j * W + i + 1], hd = H[(j + 2) * W + i + 1];
    let nx = -(hr - hl), ny = 2 * step, nz = -(hd - hu);
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const v = j * n + i;
    pos[v * 3] = i * step; pos[v * 3 + 1] = h; pos[v * 3 + 2] = j * step;
    nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
    colorAt(x0 + i * step, z0 + j * step, h, ny, col);
    cl[v * 3] = col[0]; cl[v * 3 + 1] = col[1]; cl[v * 3 + 2] = col[2];
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }
  // index buffer: grid + skirts (skirts hide cracks between LOD levels)
  const tris = res * res * 2 + 4 * res * 2 * 2;
  const idx = vcount > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  let k = 0;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const a = j * n + i, b = (j + 1) * n + i, c = a + 1, d = b + 1;
    idx[k++] = a; idx[k++] = b; idx[k++] = c;
    idx[k++] = c; idx[k++] = b; idx[k++] = d;
  }
  const skirt = Math.max(4, size * 0.03);
  let s = n * n;
  const edges = [
    (t) => t, // top row (j=0)
    (t) => (n - 1) * n + t, // bottom row
    (t) => t * n, // left column
    (t) => t * n + n - 1, // right column
  ];
  for (const ed of edges) {
    const start = s;
    for (let t = 0; t < n; t++) {
      const v = ed(t);
      pos[s * 3] = pos[v * 3]; pos[s * 3 + 1] = pos[v * 3 + 1] - skirt; pos[s * 3 + 2] = pos[v * 3 + 2];
      nor[s * 3] = nor[v * 3]; nor[s * 3 + 1] = nor[v * 3 + 1]; nor[s * 3 + 2] = nor[v * 3 + 2];
      cl[s * 3] = cl[v * 3]; cl[s * 3 + 1] = cl[v * 3 + 1]; cl[s * 3 + 2] = cl[v * 3 + 2];
      s++;
    }
    for (let t = 0; t < res; t++) {
      const a = ed(t), b = ed(t + 1), c = start + t, d = start + t + 1;
      // both windings so the skirt is visible from either side
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
      idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
  }
  const corners = [islandD(x0, z0), islandD(x0 + size, z0), islandD(x0, z0 + size), islandD(x0 + size, z0 + size)];
  const water = Math.max(...corners) < 0.8 && minH < WORLD.lake;
  return { pos, nor, col: cl, idx, minH, maxH, water };
}

// RGBA top-down map with hill shading. cx, cz: center; span: meters covered.
export function buildMap(cx, cz, span, px) {
  const out = new Uint8ClampedArray(px * px * 4);
  const step = span / px;
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const x = cx - span / 2 + (i + 0.5) * step, z = cz - span / 2 + (j + 0.5) * step;
    const h = heightAt(x, z);
    const e = Math.max(2, step);
    const hx = heightAt(x + e, z) - h, hz = heightAt(x, z + e) - h;
    const ny = 1 / Math.hypot(hx / e, 1, hz / e);
    colorAt(x, z, h, ny, col);
    let r = Math.pow(col[0], 1 / 2.2), g = Math.pow(col[1], 1 / 2.2), b = Math.pow(col[2], 1 / 2.2);
    const shade = 1 + (-hx + -hz) / e * 0.9; // light from the north-west
    r *= shade; g *= shade; b *= shade;
    if (h < 0) { const dk = Math.min(1, -h / 30); r = 0.16 - dk * 0.08; g = 0.42 - dk * 0.16; b = 0.58 - dk * 0.12; }
    else if (h < WORLD.lake && islandD(x, z) < 0.8) { r = 0.2; g = 0.45; b = 0.5; }
    const o = (j * px + i) * 4;
    out[o] = r * 255; out[o + 1] = g * 255; out[o + 2] = b * 255; out[o + 3] = 255;
  }
  return out;
}
