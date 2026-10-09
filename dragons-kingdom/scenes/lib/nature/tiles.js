// Tile mesh files for the nature caches (written by the offline bakes, read by the runtime).
//
// 'DKTL' | u32 headerBytes | JSON header (padded to 4) | positions f32x3 | normals i8x4 (xyz, pad) |
// ao u8 (padded to 4) | cavity u8 (padded to 4) | indices (u16 or u32) | top heights f32 (topN^2)
// header: { nv, ni, i16, bbox: [x0,y0,z0,x1,y1,z1], topN, topH, x0, z0, size, lod }

const pad4 = (n) => (n + 3) & ~3;

export function encodeTile(hdr, m) {
  const nv = m.positions.length / 3, ni = m.indices.length;
  const i16 = nv < 65536;
  let bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) { const p = m.positions[v * 3 + c]; if (p < bb[c]) bb[c] = p; if (p > bb[c + 3]) bb[c + 3] = p; }
  if (!nv) bb = [0, 0, 0, 0, 0, 0];
  const json = JSON.stringify({ ...hdr, nv, ni, i16, bbox: bb.map((v) => +v.toFixed(3)), topN: m.top.n, topH: m.top.h });
  const jb = new TextEncoder().encode(json), jl = pad4(jb.length);
  const size = 8 + jl + nv * 12 + nv * 4 + pad4(nv) * 2 + pad4(ni * (i16 ? 2 : 4)) + m.top.n * m.top.n * 4;
  const buf = new ArrayBuffer(size), u8 = new Uint8Array(buf), dv = new DataView(buf);
  u8.set([68, 75, 84, 76], 0); dv.setUint32(4, jl, true); u8.set(jb, 8); for (let i = jb.length; i < jl; i++) u8[8 + i] = 32;
  let off = 8 + jl;
  new Float32Array(buf, off, nv * 3).set(m.positions); off += nv * 12;
  new Int8Array(buf, off, nv * 4).set(m.normals); off += nv * 4;
  u8.set(m.ao, off); off += pad4(nv);
  u8.set(m.cavity, off); off += pad4(nv);
  if (i16) new Uint16Array(buf, off, ni).set(m.indices); else new Uint32Array(buf, off, ni).set(m.indices);
  off += pad4(ni * (i16 ? 2 : 4));
  new Float32Array(buf, off, m.top.n * m.top.n).set(m.top.heights);
  return u8;
}

export function decodeTile(ab) {
  const u8 = new Uint8Array(ab), dv = new DataView(ab);
  if (u8[0] !== 68 || u8[1] !== 75 || u8[2] !== 84 || u8[3] !== 76) throw new Error('not a DKTL tile');
  const jl = dv.getUint32(4, true);
  const hdr = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + jl)));
  const { nv, ni, i16 } = hdr;
  let off = 8 + jl;
  const positions = new Float32Array(ab, off, nv * 3); off += nv * 12;
  const normals = new Int8Array(ab, off, nv * 4); off += nv * 4;
  const ao = new Uint8Array(ab, off, nv); off += pad4(nv);
  const cavity = new Uint8Array(ab, off, nv); off += pad4(nv);
  const indices = i16 ? new Uint16Array(ab, off, ni) : new Uint32Array(ab, off, ni); off += pad4(ni * (i16 ? 2 : 4));
  const top = new Float32Array(ab, off, hdr.topN * hdr.topN);
  return { ...hdr, positions, normals, ao, cavity, indices, top };
}
