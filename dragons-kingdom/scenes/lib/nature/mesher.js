// Narrow-band surface nets for an SDF world (offline bakes, and small runtime meshes such as boulders).
//
//   const m = meshTile(world, { x0, z0, size, h, apron, ylo, yhi, coarse })
//   -> { positions: Float32Array, normals: Int8Array (xyz + pad), ao: Uint8Array, cavity: Uint8Array,
//        indices: Uint32Array, top: { n, h, heights: Float32Array } }
//
// world: { column(x, z), sdf(x, y, z, col) }. The grid covers [x0 - apron*h, x0 + size + apron*h] (same in
// z) and [ylo, yhi]; quads are emitted for every grid edge with a sign change, so neighbouring tiles of
// the same resolution share identical vertices along their overlap (no cracks), and tiles of different
// resolutions overlap by the apron (cracks between LODs are covered).
// coarse (> 1): evaluate the SDF on a coarse grid first and exactly only near the surface - most of a
// tile's volume is air or solid rock far from any face.
// Vertices: surface-nets placement (mean of edge crossings), then projected onto the trilinear
// interpolant along its gradient (planar joint faces stay planar); normals from the grid gradient;
// ambient occlusion from the SDF along the normal (caves, notches and joints darken).

export function meshTile(world, o) {
  const h = o.h, A = o.apron ?? 2, C = Math.max(1, o.coarse | 0);
  // node counts, padded to multiples of the coarse step
  const pad = (n) => Math.ceil((n) / C) * C + 1;
  const nx = pad(Math.round(o.size / h) + 2 * A), nz = nx;
  const ny = pad(Math.ceil((o.yhi - o.ylo) / h));
  const X0 = o.x0 - A * h, Z0 = o.z0 - A * h, Y0 = o.ylo;
  const N = nx * ny * nz;
  const f = new Float32Array(N);
  const done = new Uint8Array(N);
  const idx = (i, j, k) => (j * nz + k) * nx + i;        // j: y, k: z
  const cols = new Array(nx * nz);
  const colAt = (i, k) => cols[k * nx + i] || (cols[k * nx + i] = world.column(X0 + i * h, Z0 + k * h));
  let evals = 0;
  const ev = (i, j, k) => { const q = idx(i, j, k); if (!done[q]) { f[q] = world.sdf(X0 + i * h, Y0 + j * h, Z0 + k * h, colAt(i, k)); done[q] = 1; evals++; } return f[q]; };

  if (C > 1) {
    // coarse pass
    for (let k = 0; k < nz; k += C) for (let i = 0; i < nx; i += C) for (let j = 0; j < ny; j += C) ev(i, j, k);
    const thresh = 1.9 * C * h;
    for (let k = 0; k < nz - 1; k += C) for (let i = 0; i < nx - 1; i += C) for (let j = 0; j < ny - 1; j += C) {
      let mn = 1e9, mx = -1e9;
      for (let c = 0; c < 8; c++) { const v = f[idx(i + (c & 1) * C, j + ((c >> 1) & 1) * C, k + ((c >> 2) & 1) * C)]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const near = mn < 0 && mx > 0 || Math.min(Math.abs(mn), Math.abs(mx)) < thresh;
      if (near) {
        for (let c = 0; c <= C; c++) for (let b = 0; b <= C; b++) for (let a = 0; a <= C; a++) ev(i + a, j + b, k + c);
      } else {
        // far from the surface: trilinear fill from the coarse corners (sign is safe here)
        const c000 = f[idx(i, j, k)], c100 = f[idx(i + C, j, k)], c010 = f[idx(i, j + C, k)], c110 = f[idx(i + C, j + C, k)];
        const c001 = f[idx(i, j, k + C)], c101 = f[idx(i + C, j, k + C)], c011 = f[idx(i, j + C, k + C)], c111 = f[idx(i + C, j + C, k + C)];
        for (let c = 0; c <= C; c++) for (let b = 0; b <= C; b++) for (let a = 0; a <= C; a++) {
          const q = idx(i + a, j + b, k + c);
          if (done[q]) continue;
          const u = a / C, v = b / C, w = c / C;
          f[q] = ((c000 * (1 - u) + c100 * u) * (1 - v) + (c010 * (1 - u) + c110 * u) * v) * (1 - w) + ((c001 * (1 - u) + c101 * u) * (1 - v) + (c011 * (1 - u) + c111 * u) * v) * w;
          done[q] = 2;
        }
      }
    }
  } else {
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) ev(i, j, k);
  }
  // the top of the column grid is open air (cap it so tops are closed)
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { const q = idx(i, ny - 1, k); if (f[q] < 0) f[q] = 0.01; }

  // trilinear sample + gradient of the grid field at grid coordinates (gi, gj, gk)
  const G = (gi, gj, gk, out) => {
    const i = Math.min(nx - 2, Math.max(0, Math.floor(gi))), j = Math.min(ny - 2, Math.max(0, Math.floor(gj))), k = Math.min(nz - 2, Math.max(0, Math.floor(gk)));
    const u = gi - i, v = gj - j, w = gk - k;
    const c000 = f[idx(i, j, k)], c100 = f[idx(i + 1, j, k)], c010 = f[idx(i, j + 1, k)], c110 = f[idx(i + 1, j + 1, k)];
    const c001 = f[idx(i, j, k + 1)], c101 = f[idx(i + 1, j, k + 1)], c011 = f[idx(i, j + 1, k + 1)], c111 = f[idx(i + 1, j + 1, k + 1)];
    const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u, x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    out[0] = y0 + (y1 - y0) * w;
    out[1] = (((c100 - c000) * (1 - v) + (c110 - c010) * v) * (1 - w) + ((c101 - c001) * (1 - v) + (c111 - c011) * v) * w) / h;
    out[2] = ((x10 - x00) * (1 - w) + (x11 - x01) * w) / h;
    out[3] = (y1 - y0) / h;
  };
  // smoother normals: central differences of the node values, trilinearly blended
  const nodeGrad = (i, j, k, out) => {
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1), k0 = Math.max(0, k - 1), k1 = Math.min(nz - 1, k + 1);
    out[0] += (f[idx(i1, j, k)] - f[idx(i0, j, k)]) / ((i1 - i0) * h);
    out[1] += (f[idx(i, j1, k)] - f[idx(i, j0, k)]) / ((j1 - j0) * h);
    out[2] += (f[idx(i, j, k1)] - f[idx(i, j, k0)]) / ((k1 - k0) * h);
  };

  // ---- vertices: one per cell with a sign change
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => (j * (nz - 1) + k) * (nx - 1) + i;
  const P = [], Nn = [], AO = [], CAV = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8), tmp = [0, 0, 0, 0], g = [0, 0, 0];
  for (let j = 0; j < ny - 1; j++) for (let k = 0; k < nz - 1; k++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { cv[c] = f[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const fa = cv[a], fb = cv[b];
      if ((fa < 0) === (fb < 0)) continue;
      const t = fa / (fa - fb);
      sx += (a & 1) + (((b & 1) - (a & 1)) * t); sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
      n++;
    }
    let gi = i + sx / n, gj = j + sy / n, gk = k + sz / n;
    // project onto the interpolated surface (stay inside the cell's neighbourhood)
    for (let it = 0; it < 3; it++) {
      G(gi, gj, gk, tmp);
      const gl2 = tmp[1] * tmp[1] + tmp[2] * tmp[2] + tmp[3] * tmp[3];
      if (gl2 < 1e-8) break;
      const s = tmp[0] / gl2 / h;
      gi = Math.min(i + 1.2, Math.max(i - 0.2, gi - s * tmp[1])); gj = Math.min(j + 1.2, Math.max(j - 0.2, gj - s * tmp[2])); gk = Math.min(k + 1.2, Math.max(k - 0.2, gk - s * tmp[3]));
    }
    // normal: blend the node gradients of the cell
    g[0] = g[1] = g[2] = 0;
    { const ii = Math.round(gi), jj = Math.round(gj), kk = Math.round(gk); nodeGrad(Math.min(nx - 1, Math.max(0, ii)), Math.min(ny - 1, Math.max(0, jj)), Math.min(nz - 1, Math.max(0, kk)), g); }
    G(gi, gj, gk, tmp); g[0] += tmp[1]; g[1] += tmp[2]; g[2] += tmp[3];
    const gl = Math.hypot(g[0], g[1], g[2]) || 1;
    const nxv = g[0] / gl, nyv = g[1] / gl, nzv = g[2] / gl;
    const px = X0 + gi * h, py = Y0 + gj * h, pz = Z0 + gk * h;
    cellV[cidx(i, j, k)] = P.length / 3;
    P.push(px, py, pz); Nn.push(nxv, nyv, nzv);
  }
  // ---- ambient occlusion along the normal (grid where possible, exact SDF outside the grid)
  const sampleF = (x, y, z) => {
    const gi = (x - X0) / h, gj = (y - Y0) / h, gk = (z - Z0) / h;
    if (gj > ny - 1) return 1e3;   // above everything in the tile: open sky
    if (gi >= 0 && gk >= 0 && gi <= nx - 1 && gk <= nz - 1 && gj >= 0) { G(gi, gj, gk, tmp); return tmp[0]; }
    return world.sdf(x, y, z);
  };
  const aoD = o.aoDistances || [0.5, 1.3, 3.2, 7.5];
  for (let v = 0; v < P.length / 3; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2], ax = Nn[v * 3], ay = Nn[v * 3 + 1], az = Nn[v * 3 + 2];
    let occ = 0, wsum = 0, cav = 0;
    for (let q = 0; q < aoD.length; q++) {
      const d = aoD[q];
      // bend the probe slightly toward the sky (light comes mostly from above)
      const bx = ax, by = ay + 0.35, bz = az, bl = Math.hypot(bx, by, bz);
      const fv = sampleF(px + bx / bl * d, py + by / bl * d, pz + bz / bl * d);
      const o1 = Math.max(0, Math.min(1, (d - fv) / d));
      const w = 1 / (1 + q * 0.6);
      occ += o1 * w; wsum += w;
      if (q === 0) cav = o1;
    }
    AO.push(Math.max(0, 1 - 1.35 * occ / wsum));
    CAV.push(cav);
  }

  // ---- quads: one per grid edge with a sign change (all four cells exist)
  const I = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    // split along the shorter diagonal
    const d1 = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const d2 = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (d1 <= d2) I.push(a, b, c, a, c, d); else I.push(a, b, d, b, c, d);
  };
  for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const v0 = f[idx(i, j, k)];
    // x edge
    if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) {
      const v1 = f[idx(i + 1, j, k)];
      if ((v0 < 0) !== (v1 < 0)) quad(cellV[cidx(i, j - 1, k - 1)], cellV[cidx(i, j, k - 1)], cellV[cidx(i, j, k)], cellV[cidx(i, j - 1, k)], v0 >= 0);
    }
    // y edge
    if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) {
      const v1 = f[idx(i, j + 1, k)];
      if ((v0 < 0) !== (v1 < 0)) quad(cellV[cidx(i - 1, j, k - 1)], cellV[cidx(i - 1, j, k)], cellV[cidx(i, j, k)], cellV[cidx(i, j, k - 1)], v0 >= 0);
    }
    // z edge
    if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) {
      const v1 = f[idx(i, j, k + 1)];
      if ((v0 < 0) !== (v1 < 0)) quad(cellV[cidx(i - 1, j - 1, k)], cellV[cidx(i, j - 1, k)], cellV[cidx(i, j, k)], cellV[cidx(i - 1, j, k)], v0 >= 0);
    }
  }
  // ---- top surface heights on the node grid inside the tile (for scattering at runtime)
  const tn = Math.round(o.size / h) + 1;
  const top = new Float32Array(tn * tn);
  for (let k = 0; k < tn; k++) for (let i = 0; i < tn; i++) {
    const ii = i + A, kk = k + A;
    let y = NaN;
    for (let j = ny - 2; j >= 0; j--) {
      const a = f[idx(ii, j, kk)], b = f[idx(ii, j + 1, kk)];
      if (a < 0 && b >= 0) { y = Y0 + (j + a / (a - b)) * h; break; }
    }
    top[k * tn + i] = y;
  }
  const nv = P.length / 3;
  const normals = new Int8Array(nv * 4);
  for (let v = 0; v < nv; v++) { normals[v * 4] = Math.round(Nn[v * 3] * 127); normals[v * 4 + 1] = Math.round(Nn[v * 3 + 1] * 127); normals[v * 4 + 2] = Math.round(Nn[v * 3 + 2] * 127); }
  return {
    positions: Float32Array.from(P), normals, ao: Uint8Array.from(AO, (a) => Math.round(a * 255)), cavity: Uint8Array.from(CAV, (a) => Math.round(a * 255)),
    indices: Uint32Array.from(I), top: { n: tn, h, heights: top }, evals, grid: [nx, ny, nz],
  };
}
