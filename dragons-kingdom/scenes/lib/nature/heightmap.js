// Heightmap files for the nature caches (shared by the offline bakes and the runtime loader).
//
// Format (little endian): 'DKHM' | u32 headerBytes | JSON header (padded to 4) | Float32 heights
// (row-major, z rows of x) | optional extra layers (Uint8 each, named in header.layers).
// header: { x0, z0, cell, nx, nz, layers: [{ name, scale }] }

export function encodeHeightmap(hdr, heights, layers = []) {
  const json = JSON.stringify({ ...hdr, layers: layers.map((l) => ({ name: l.name, scale: l.scale ?? 1 })) });
  const jb = new TextEncoder().encode(json);
  const jl = (jb.length + 3) & ~3;
  const n = hdr.nx * hdr.nz;
  const size = 8 + jl + n * 4 + layers.length * ((n + 3) & ~3);
  const buf = new ArrayBuffer(size);
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  u8.set([68, 75, 72, 77], 0);
  dv.setUint32(4, jl, true);
  u8.set(jb, 8); for (let i = jb.length; i < jl; i++) u8[8 + i] = 32;
  new Float32Array(buf, 8 + jl, n).set(heights);
  let off = 8 + jl + n * 4;
  for (const l of layers) { u8.set(l.data, off); off += (n + 3) & ~3; }
  return new Uint8Array(buf);
}

export function decodeHeightmap(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer), dv = new DataView(arrayBuffer);
  if (u8[0] !== 68 || u8[1] !== 75 || u8[2] !== 72 || u8[3] !== 77) throw new Error('not a DKHM heightmap');
  const jl = dv.getUint32(4, true);
  const hdr = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + jl)));
  const n = hdr.nx * hdr.nz;
  const heights = new Float32Array(arrayBuffer.slice(8 + jl, 8 + jl + n * 4));
  const layers = {};
  let off = 8 + jl + n * 4;
  for (const l of hdr.layers || []) { layers[l.name] = u8.slice(off, off + n); off += (n + 3) & ~3; }
  return { ...hdr, heights, layers };
}

/** Bicubic (Catmull-Rom) sampler: smooth (C1) heights between the nodes, clamped at the edges. */
export function heightSampler(hm) {
  const { x0, z0, cell, nx, nz, heights: h } = hm;
  const at = (i, j) => h[(j < 0 ? 0 : j >= nz ? nz - 1 : j) * nx + (i < 0 ? 0 : i >= nx ? nx - 1 : i)];
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  function sample(x, z) {
    const fx = (x - x0) / cell, fz = (z - z0) / cell;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const r = [];
    for (let b = -1; b <= 2; b++) r.push(cr(at(i - 1, j + b), at(i, j + b), at(i + 1, j + b), at(i + 2, j + b), u));
    return cr(r[0], r[1], r[2], r[3], v);
  }
  function layer(name, x, z) {
    const L = hm.layers[name]; if (!L) return 0;
    const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 0;
    return L[j * nx + i] / 255;
  }
  const inside = (x, z) => x >= x0 && z >= z0 && x <= x0 + (nx - 1) * cell && z <= z0 + (nz - 1) * cell;
  return { sample, layer, inside, hm };
}
