// Procedural textures generated in JS (import from 'dk/textures.js').
// Deterministic (seeded), no downloads, no canvas.
import { mulberry32, createNoise2D, fbm } from './noise.js';

function toTexture(THREE, data, size, { srgb = true } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Ashlar stone wall: running-bond blocks with mortar joints.
 * One texture tile = `rows` courses. Returns { map, roughnessMap }.
 */
export function stoneBlocks(THREE, { size = 512, rows = 8, cols = 4, seed = 7, base = [150, 142, 128], mortar = [96, 90, 82] } = {}) {
  const rng = mulberry32(seed);
  const noise = createNoise2D(seed + 1);
  const data = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const rowH = size / rows;
  // per-block tint
  const tints = [];
  for (let r = 0; r < rows; r++) { tints.push([]); for (let c = 0; c <= cols; c++) tints[r].push(0.78 + rng() * 0.32); }
  const offsets = Array.from({ length: rows }, (_, r) => (r % 2 ? 0.5 : 0) + (rng() - 0.5) * 0.2);
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / rowH);
    const fy = (y % rowH) / rowH;
    for (let x = 0; x < size; x++) {
      const u = x / size * cols + offsets[r];
      const c = ((Math.floor(u) % cols) + cols) % cols;
      const fx = u - Math.floor(u);
      const colW = size / cols;
      const ex = Math.min(fx, 1 - fx) * colW, ey = Math.min(fy, 1 - fy) * rowH;
      const edge = Math.min(ex, ey);
      const grain = fbm(noise, x / size * 24, y / size * 24, 4) * 0.5 + fbm(noise, x / size * 6 + 3, y / size * 6, 3) * 0.5;
      const chip = edge + grain * 3.5;
      const isMortar = chip < 2.2;
      const k = (isMortar ? 1 : tints[r][c]) * (1 + grain * 0.35);
      const src = isMortar ? mortar : base;
      const i = (y * size + x) * 4;
      // edge darkening (ambient-occlusion look) near joints
      const ao = isMortar ? 0.8 : Math.min(1, 0.72 + edge / 18);
      data[i] = Math.max(0, Math.min(255, src[0] * k * ao));
      data[i + 1] = Math.max(0, Math.min(255, src[1] * k * ao));
      data[i + 2] = Math.max(0, Math.min(255, src[2] * k * ao));
      data[i + 3] = 255;
      const rv = isMortar ? 250 : 200 + grain * 60;
      rough[i] = rough[i + 1] = rough[i + 2] = Math.max(0, Math.min(255, rv)); rough[i + 3] = 255;
    }
  }
  return { map: toTexture(THREE, data, size), roughnessMap: toTexture(THREE, rough, size, { srgb: false }) };
}

/** Overlapping roof shingles (scalloped rows). */
export function roofShingles(THREE, { size = 256, rows = 10, cols = 8, seed = 11, color = [62, 72, 104] } = {}) {
  const rng = mulberry32(seed);
  const noise = createNoise2D(seed + 3);
  const data = new Uint8Array(size * size * 4);
  const rowH = size / rows;
  const tint = Array.from({ length: rows * (cols + 1) }, () => 0.8 + rng() * 0.35);
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / rowH);
    const fy = (y % rowH) / rowH;           // 0 at top of shingle row (texture v grows upward on cones)
    for (let x = 0; x < size; x++) {
      const u = x / size * cols + (r % 2) * 0.5;
      const c = Math.floor(u);
      const fx = u - c;
      // rounded bottom edge of each shingle
      const curve = 0.18 * (1 - Math.pow(2 * fx - 1, 2));
      const shade = fy < curve ? 0.55 : 0.85 + 0.15 * (1 - fy);
      const side = Math.min(fx, 1 - fx) < 0.04 ? 0.7 : 1;
      const g = 1 + fbm(noise, x / size * 16, y / size * 16, 3) * 0.25;
      const k = tint[r * (cols + 1) + (((c % cols) + cols) % cols)] * shade * side * g;
      const i = (y * size + x) * 4;
      data[i] = Math.min(255, color[0] * k); data[i + 1] = Math.min(255, color[1] * k); data[i + 2] = Math.min(255, color[2] * k); data[i + 3] = 255;
    }
  }
  return toTexture(THREE, data, size);
}

/**
 * Rescale a geometry's UVs so a texture tile covers `tile` world units,
 * using a per-vertex planar projection chosen by the normal (box mapping).
 */
export function boxProjectUVs(geometry, tile = 4) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new geometry.attributes.position.constructor(uv, 2));
  return geometry;
}

/** Cylinder / cone UVs scaled to world units (u around, v up). */
export function scaleRadialUVs(geometry, radius, height, tile = 4) {
  const uv = geometry.attributes.uv;
  const su = (2 * Math.PI * radius) / tile, sv = height / tile;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(su)), uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geometry;
}
