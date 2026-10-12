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
  // dual contouring (o.dc): each crossing carries the exact surface normal (finite differences of the
  // world SDF), and the cell's vertex minimises the distance to the crossings' tangent planes (QEF).
  // Joint faces, bed tops and arrises then meet at sharp edges instead of the ~1-cell round that
  // plain surface nets leaves (the 'pillow' / 'stacked mattress' look at every LOD).
  const dc = !!o.dc;
  const hermite = dc ? new Map() : null;
  const DE = Math.min(0.02, h * 0.04);
  const herm = (ia, ja, ka, axis, t) => {
    const key = idx(ia, ja, ka) * 3 + axis;
    let r = hermite.get(key);
    if (r) return r;
    const px = X0 + (ia + (axis === 0 ? t : 0)) * h, py = Y0 + (ja + (axis === 1 ? t : 0)) * h, pz = Z0 + (ka + (axis === 2 ? t : 0)) * h;
    const c0 = axis === 1 ? colAt(ia, ka) : world.column(px, pz);
    const cx = world.column(px + DE, pz), cz = world.column(px, pz + DE);
    const fyp = world.sdf(px, py + DE, pz, c0), fym = world.sdf(px, py - DE, pz, c0);
    const f0 = world.sdf(px, py, pz, c0);
    let gx = (world.sdf(px + DE, py, pz, cx) - f0) / DE, gy = (fyp - fym) / (2 * DE), gz = (world.sdf(px, py, pz + DE, cz) - f0) / DE;
    evals += 5;
    const gl = Math.hypot(gx, gy, gz);
    if (!(gl > 1e-6)) { gx = 0; gy = 1; gz = 0; } else { gx /= gl; gy /= gl; gz /= gl; }
    r = [ia + (axis === 0 ? t : 0), ja + (axis === 1 ? t : 0), ka + (axis === 2 ? t : 0), gx, gy, gz];
    hermite.set(key, r);
    return r;
  };
  const ATA = new Float64Array(9), ATB = new Float64Array(3), EV = new Float64Array(9), EW = new Float64Array(3);
  // symmetric 3x3 eigen decomposition (cyclic Jacobi): a (row-major, destroyed) -> values w, vectors v (columns)
  const jacobi3 = (a, w, v) => {
    v.fill(0); v[0] = v[4] = v[8] = 1;
    for (let sweep = 0; sweep < 12; sweep++) {
      const off = a[1] * a[1] + a[2] * a[2] + a[5] * a[5];
      if (off < 1e-14) break;
      for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
        const apq = a[p * 3 + q];
        if (Math.abs(apq) < 1e-12) continue;
        const app = a[p * 3 + p], aqq = a[q * 3 + q];
        const th = 0.5 * (aqq - app) / apq;
        const tt = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
        for (let r = 0; r < 3; r++) {          // A <- A J
          const arp = a[r * 3 + p], arq = a[r * 3 + q];
          a[r * 3 + p] = c * arp - s * arq; a[r * 3 + q] = s * arp + c * arq;
        }
        for (let r = 0; r < 3; r++) {          // A <- J^T A
          const apr = a[p * 3 + r], aqr = a[q * 3 + r];
          a[p * 3 + r] = c * apr - s * aqr; a[q * 3 + r] = s * apr + c * aqr;
        }
        for (let r = 0; r < 3; r++) {          // V <- V J
          const vrp = v[r * 3 + p], vrq = v[r * 3 + q];
          v[r * 3 + p] = c * vrp - s * vrq; v[r * 3 + q] = s * vrp + c * vrq;
        }
      }
    }
    w[0] = a[0]; w[1] = a[4]; w[2] = a[8];
  };
  const dcN = [0, 0, 0];
  for (let j = 0; j < ny - 1; j++) for (let k = 0; k < nz - 1; k++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { cv[c] = f[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    if (dc) { ATA.fill(0); ATB.fill(0); dcN[0] = dcN[1] = dcN[2] = 0; }
    for (const [a, b] of EDGES) {
      const fa = cv[a], fb = cv[b];
      if ((fa < 0) === (fb < 0)) continue;
      const t = fa / (fa - fb);
      sx += (a & 1) + (((b & 1) - (a & 1)) * t); sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
      n++;
      if (dc) {
        // the edge runs from corner a along one axis (b - a is 1, 2 or 4)
        const axis = (b - a) === 1 ? 0 : (b - a) === 2 ? 1 : 2;
        const H = herm(i + (a & 1), j + ((a >> 1) & 1), k + ((a >> 2) & 1), axis, t);
        const nx_ = H[3], ny_ = H[4], nz_ = H[5];
        const d = nx_ * H[0] + ny_ * H[1] + nz_ * H[2];
        ATA[0] += nx_ * nx_; ATA[1] += nx_ * ny_; ATA[2] += nx_ * nz_; ATA[4] += ny_ * ny_; ATA[5] += ny_ * nz_; ATA[8] += nz_ * nz_;
        ATB[0] += nx_ * d; ATB[1] += ny_ * d; ATB[2] += nz_ * d;
        dcN[0] += nx_; dcN[1] += ny_; dcN[2] += nz_;
      }
    }
    let gi = i + sx / n, gj = j + sy / n, gk = k + sz / n;
    if (dc) {
      // QEF about the mass point m: x = m + pinv(AtA) (Atb - AtA m), small eigenvalues truncated
      ATA[3] = ATA[1]; ATA[6] = ATA[2]; ATA[7] = ATA[5];
      const rx = ATB[0] - (ATA[0] * gi + ATA[1] * gj + ATA[2] * gk);
      const ry = ATB[1] - (ATA[3] * gi + ATA[4] * gj + ATA[5] * gk);
      const rz = ATB[2] - (ATA[6] * gi + ATA[7] * gj + ATA[8] * gk);
      jacobi3(ATA, EW, EV);
      const wmax = Math.max(EW[0], EW[1], EW[2]);
      let qx = 0, qy = 0, qz = 0;
      for (let e = 0; e < 3; e++) {
        if (EW[e] < 0.1 * wmax) continue;
        const vx = EV[e], vy = EV[3 + e], vz = EV[6 + e];
        const s = (vx * rx + vy * ry + vz * rz) / EW[e];
        qx += vx * s; qy += vy * s; qz += vz * s;
      }
      const lo = -0.02, hi = 1.02;
      const di = gi + qx, dj = gj + qy, dk = gk + qz;
      const inside = di >= i + lo && di <= i + hi && dj >= j + lo && dj <= j + hi && dk >= k + lo && dk <= k + hi;
      // the planes must (nearly) meet at the solution; else the cell holds two separate sheets or a
      // feature smaller than the cell (a grike, a chip) - keep the surface-nets placement there
      let err = 0;
      if (inside) {
        for (const [a, b] of EDGES) {
          if ((cv[a] < 0) === (cv[b] < 0)) continue;
          const axis = (b - a) === 1 ? 0 : (b - a) === 2 ? 1 : 2;
          const Hh = hermite.get(idx(i + (a & 1), j + ((a >> 1) & 1), k + ((a >> 2) & 1)) * 3 + axis);
          const e = Hh[3] * (di - Hh[0]) + Hh[4] * (dj - Hh[1]) + Hh[5] * (dk - Hh[2]);
          err = Math.max(err, Math.abs(e));
        }
      }
      if (inside && err < 0.3) {
        const nl = Math.hypot(dcN[0], dcN[1], dcN[2]) || 1;
        cellV[cidx(i, j, k)] = P.length / 3;
        P.push(X0 + di * h, Y0 + dj * h, Z0 + dk * h); Nn.push(dcN[0] / nl, dcN[1] / nl, dcN[2] / nl);
        continue;
      }
    }
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
    if (dc) {
      // sharp features: take the split whose two triangles agree best with their corners' normals
      // (the diagonal then runs along a crease instead of across it)
      const fit = (p, q, r) => {
        const ux = P[q * 3] - P[p * 3], uy = P[q * 3 + 1] - P[p * 3 + 1], uz = P[q * 3 + 2] - P[p * 3 + 2];
        const vx = P[r * 3] - P[p * 3], vy = P[r * 3 + 1] - P[p * 3 + 1], vz = P[r * 3 + 2] - P[p * 3 + 2];
        let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const l = Math.hypot(cx, cy, cz);
        if (l < 1e-12) return -3;
        cx /= l; cy /= l; cz /= l;
        let s = 0;
        for (const w of [p, q, r]) s += cx * Nn[w * 3] + cy * Nn[w * 3 + 1] + cz * Nn[w * 3 + 2];
        return s;
      };
      const s1 = fit(a, b, c) + fit(a, c, d), s2 = fit(a, b, d) + fit(b, c, d);
      if (s1 >= s2) I.push(a, b, c, a, c, d); else I.push(a, b, d, b, c, d);
      return;
    }
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
  // optional per-vertex extras from the world (verdor: depth below the top of the rock / its soil, bare flag, bed pinch),
  // evaluated with the nearest node's column
  let extTop = null, extPin = null;
  if (world.surfaceInfo) {
    extTop = new Uint8Array(nv); extPin = new Int8Array(nv);
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const ii = Math.min(nx - 1, Math.max(0, Math.round((x - X0) / h))), kk = Math.min(nz - 1, Math.max(0, Math.round((z - Z0) / h)));
      const [dt, pn, bare] = world.surfaceInfo(x, y, z, colAt(ii, kk));
      // depth in 0.1 m (0..12.7 m) + 128 when the rock top above is bare (an outcrop, no soil lip)
      extTop[v] = Math.max(0, Math.min(127, Math.round(dt / 0.1))) + (bare ? 128 : 0);
      extPin[v] = Math.max(-127, Math.min(127, Math.round(pn / 0.02)));
    }
  }
  const normals = new Int8Array(nv * 4);
  for (let v = 0; v < nv; v++) { normals[v * 4] = Math.round(Nn[v * 3] * 127); normals[v * 4 + 1] = Math.round(Nn[v * 3 + 1] * 127); normals[v * 4 + 2] = Math.round(Nn[v * 3 + 2] * 127); }
  return {
    positions: Float32Array.from(P), normals, ao: Uint8Array.from(AO, (a) => Math.round(a * 255)), cavity: Uint8Array.from(CAV, (a) => Math.round(a * 255)),
    indices: Uint32Array.from(I), top: { n: tn, h, heights: top }, evals, grid: [nx, ny, nz], extTop, extPin,
  };
}
