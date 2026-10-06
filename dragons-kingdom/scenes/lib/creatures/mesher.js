// Narrow-band surface nets on a separable, non-uniform ("warped") grid.
//
// Why: a creature needs dense geometry where close-ups happen (head, eyes,
// lips) and much less on the torso. A grid whose x/y/z grid lines are spaced
// non-uniformly (fine inside "detail regions", coarse elsewhere) is still a
// plain structured grid, so surface nets stays watertight with no cracks
// between resolutions - unlike octree or patch approaches.
//
// Narrow band: the volume is visited in 16-cell super-blocks and 4-cell
// blocks; only blocks the surface can pass through (|f(centre)| <= 1.3 x
// half-diagonal) are evaluated point by point, each with a culled primitive
// list. Everything else takes the sign of its block. Evaluation streams
// z-layer by z-layer, so memory stays small.
//
// Output: positions (projected onto the iso-surface), SDF-gradient normals,
// triangle indices (outward-facing), plus a `query(x,y,z)` evaluator that
// reuses the culling grid for later per-vertex work (weights, AO).

import { SDFModel } from './sdf.js';

/**
 * Grid line coordinates from min to max. Spacing = hBase, except inside
 * regions [{a, b, h}] where it is h, ramping linearly back to hBase over
 * `ramp` metres so cells never change size abruptly.
 */
export function axisCoords(min, max, hBase, regions = [], ramp = hBase * 10) {
  const spacing = (x) => {
    let h = hBase;
    for (const r of regions) {
      const d = x < r.a ? r.a - x : x > r.b ? x - r.b : 0;
      const hr = d === 0 ? r.h : r.h + (hBase - r.h) * Math.min(1, d / ramp);
      if (hr < h) h = hr;
    }
    return h;
  };
  const xs = [min];
  let x = min;
  while (x < max) {
    // midpoint rule keeps the spacing smooth
    const h0 = spacing(x), h = spacing(x + h0 * 0.5);
    x += h;
    xs.push(x);
  }
  return Float64Array.from(xs);
}

/** index of the cell [xs[i], xs[i+1]] containing x (clamped). */
function locate(xs, x) {
  let lo = 0, hi = xs.length - 1;
  if (x <= xs[0]) return 0;
  if (x >= xs[hi]) return hi - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  return lo;
}

/**
 * Polygonize the SDF.
 * opts.h (base spacing, metres), opts.regions: [{min:[x,y,z], max:[x,y,z], h}],
 * opts.pad (bbox padding), opts.project (Newton steps, default 2).
 */
export function polygonize(model, opts) {
  const t0 = Date.now();
  if (!model.P) model.compile();
  const h = opts.h;
  const pad = opts.pad ?? h * 6;
  const bb = model.bounds();
  const regions = opts.regions || [];
  const reg = (c) => regions.map((r) => ({ a: r.min[c], b: r.max[c], h: r.h }));
  const xs = axisCoords(bb[0] - pad, bb[3] + pad, h, reg(0));
  const ys = axisCoords(bb[1] - pad, bb[4] + pad, h, reg(1));
  const zs = axisCoords(bb[2] - pad, bb[5] + pad, h, reg(2));
  const NX = xs.length, NY = ys.length, NZ = zs.length;
  const BS = 4, SS = 4;                                   // cells per block, blocks per super-block
  const BX = Math.ceil((NX - 1) / BS), BY = Math.ceil((NY - 1) / BS), BZ = Math.ceil((NZ - 1) / BS);
  const SX = Math.ceil(BX / SS), SY = Math.ceil(BY / SS), SZ = Math.ceil(BZ / SS);
  const gx = (i) => xs[Math.min(i, NX - 1)], gy = (j) => ys[Math.min(j, NY - 1)], gz = (k) => zs[Math.min(k, NZ - 1)];

  // block state: 0 outside, 1 inside, 2 active; lists in a pool
  const nB = BX * BY * BZ;
  const bState = new Uint8Array(nB);
  const bListStart = new Int32Array(nB), bListEnd = new Int32Array(nB);
  let pool = new Int32Array(1 << 20), poolN = 0;
  const pushList = (arr) => {
    if (poolN + arr.length > pool.length) { const np = new Int32Array(Math.max(pool.length * 2, poolN + arr.length)); np.set(pool); pool = np; }
    const s = poolN; for (let i = 0; i < arr.length; i++) pool[poolN++] = arr[i];
    return s;
  };
  let evals = 0, activeBlocks = 0;
  const bIndex = (bi, bj, bk) => bi + BX * (bj + BY * bk);
  for (let sk = 0; sk < SZ; sk++) for (let sj = 0; sj < SY; sj++) for (let si = 0; si < SX; si++) {
    const i0 = si * SS * BS, j0 = sj * SS * BS, k0 = sk * SS * BS;
    const i1 = Math.min((si + 1) * SS * BS, NX - 1), j1 = Math.min((sj + 1) * SS * BS, NY - 1), k1 = Math.min((sk + 1) * SS * BS, NZ - 1);
    const mn = [gx(i0), gy(j0), gz(k0)], mx = [gx(i1), gy(j1), gz(k1)];
    const half = 0.5 * Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    const list = model.cull(mn[0], mn[1], mn[2], mx[0], mx[1], mx[2], h * 2);
    let sState = 0;
    if (list.length) {
      const f = model.evalList((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2, list); evals++;
      sState = Math.abs(f) <= half * 1.3 + h * 2 ? 2 : f < 0 ? 1 : 0;
    }
    for (let bk = sk * SS; bk < Math.min((sk + 1) * SS, BZ); bk++)
      for (let bj = sj * SS; bj < Math.min((sj + 1) * SS, BY); bj++)
        for (let bi = si * SS; bi < Math.min((si + 1) * SS, BX); bi++) {
          const b = bIndex(bi, bj, bk);
          if (sState !== 2) { bState[b] = sState; continue; }
          const ci0 = bi * BS, cj0 = bj * BS, ck0 = bk * BS;
          const ci1 = Math.min(ci0 + BS, NX - 1), cj1 = Math.min(cj0 + BS, NY - 1), ck1 = Math.min(ck0 + BS, NZ - 1);
          const bmn = [gx(ci0), gy(cj0), gz(ck0)], bmx = [gx(ci1), gy(cj1), gz(ck1)];
          const bhalf = 0.5 * Math.hypot(bmx[0] - bmn[0], bmx[1] - bmn[1], bmx[2] - bmn[2]);
          const sub = model.cull(bmn[0], bmn[1], bmn[2], bmx[0], bmx[1], bmx[2], h * 2, list);
          if (!sub.length) { bState[b] = 0; continue; }
          const f = model.evalList((bmn[0] + bmx[0]) / 2, (bmn[1] + bmx[1]) / 2, (bmn[2] + bmx[2]) / 2, sub); evals++;
          if (Math.abs(f) <= bhalf * 1.3 + h * 2) {
            bState[b] = 2; activeBlocks++;
            bListStart[b] = pushList(sub); bListEnd[b] = poolN;
          } else bState[b] = f < 0 ? 1 : 0;
        }
  }

  // --- stream z layers (only active blocks are ever touched)
  const NXY = NX * NY;
  const activeByLayer = Array.from({ length: BZ }, () => []);
  for (let bk = 0; bk < BZ; bk++) for (let bj = 0; bj < BY; bj++) for (let bi = 0; bi < BX; bi++) {
    const b = bIndex(bi, bj, bk);
    if (bState[b] === 2) activeByLayer[bk].push(b);
  }
  const layerV = [new Float32Array(NXY), new Float32Array(NXY)];   // point values, layers k and k+1
  const stamp = new Int32Array(NXY).fill(-1);                        // layer a point value was computed for
  const cellV = [new Int32Array(NXY).fill(-1), new Int32Array(NXY).fill(-1)];
  const written = [[], []];
  let pos = new Float32Array(1 << 18), nV = 0;
  let idx = new Uint32Array(1 << 19), nI = 0;

  const fillLayer = (k, out) => {
    const bks = [Math.min(Math.floor(k / BS), BZ - 1)];
    if (k % BS === 0 && k > 0 && k / BS - 1 < BZ) bks.push(k / BS - 1);
    const z = zs[k];
    for (const bk of bks) for (const b of activeByLayer[bk]) {
      const bi = b % BX, bj = Math.floor(b / BX) % BY;
      const s = bListStart[b], e = bListEnd[b];
      const iE = Math.min(bi * BS + BS, NX - 1), jE = Math.min(bj * BS + BS, NY - 1);
      for (let j = bj * BS; j <= jE; j++) for (let i = bi * BS; i <= iE; i++) {
        const p = i + j * NX;
        if (stamp[p] === k) continue;
        stamp[p] = k;
        out[p] = model.evalList(xs[i], ys[j], z, pool, s, e); evals++;
      }
    }
  };

  const pushV = (x, y, z) => {
    if ((nV + 1) * 3 > pos.length) { const np = new Float32Array(pos.length * 2); np.set(pos); pos = np; }
    pos[nV * 3] = x; pos[nV * 3 + 1] = y; pos[nV * 3 + 2] = z;
    return nV++;
  };
  const pushQuad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (nI + 6 > idx.length) { const ni = new Uint32Array(idx.length * 2); ni.set(idx); idx = ni; }
    idx[nI++] = a; idx[nI++] = b; idx[nI++] = c;
    idx[nI++] = a; idx[nI++] = c; idx[nI++] = d;
  };

  // corner offsets of a cell and its 12 edges
  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  fillLayer(0, layerV[0]);
  for (let k = 0; k < NZ - 1; k++) {
    const A = layerV[k & 1], Bv = layerV[(k + 1) & 1];
    fillLayer(k + 1, Bv);
    const cur = cellV[k & 1], prev = cellV[(k + 1) & 1];
    const wr = written[k & 1];
    for (let n = 0; n < wr.length; n++) cur[wr[n]] = -1;
    wr.length = 0;
    const bk = Math.min(Math.floor(k / BS), BZ - 1);
    const blocks = activeByLayer[bk];
    // cells of layer k
    for (const b of blocks) {
      const bi = b % BX, bj = Math.floor(b / BX) % BY;
      const iE = Math.min(bi * BS + BS, NX - 1), jE = Math.min(bj * BS + BS, NY - 1);
      for (let j = bj * BS; j < jE; j++) for (let i = bi * BS; i < iE; i++) {
        const p = i + j * NX;
        cv[0] = A[p]; cv[1] = A[p + 1]; cv[2] = A[p + NX]; cv[3] = A[p + NX + 1];
        cv[4] = Bv[p]; cv[5] = Bv[p + 1]; cv[6] = Bv[p + NX]; cv[7] = Bv[p + NX + 1];
        let mask = 0;
        for (let c = 0; c < 8; c++) if (cv[c] < 0) mask |= 1 << c;
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (let e = 0; e < 12; e++) {
          const c0 = ED[e][0], c1 = ED[e][1];
          const v0 = cv[c0], v1 = cv[c1];
          if ((v0 < 0) === (v1 < 0)) continue;
          const t = v0 / (v0 - v1);
          const o0 = CO[c0], o1 = CO[c1];
          const x0 = xs[i + o0[0]], y0 = ys[j + o0[1]], z0 = zs[k + o0[2]];
          const x1 = xs[i + o1[0]], y1 = ys[j + o1[1]], z1 = zs[k + o1[2]];
          sx += x0 + (x1 - x0) * t; sy += y0 + (y1 - y0) * t; sz += z0 + (z1 - z0) * t; cnt++;
        }
        cur[p] = pushV(sx / cnt, sy / cnt, sz / cnt);
        wr.push(p);
      }
    }
    // x/y-edges on point layer k (cells in layers k-1 and k) and z-edges k..k+1 (cells in layer k)
    for (const b of blocks) {
      const bi = b % BX, bj = Math.floor(b / BX) % BY;
      const iE = Math.min(bi * BS + BS, NX - 1), jE = Math.min(bj * BS + BS, NY - 1);
      for (let j = Math.max(1, bj * BS); j < jE; j++) for (let i = Math.max(1, bi * BS); i < iE; i++) {
        const p = i + j * NX;
        const a0 = A[p] < 0;
        if (k > 0) {
          if (a0 !== (A[p + 1] < 0)) pushQuad(prev[p - NX], prev[p], cur[p], cur[p - NX]);
          if (a0 !== (A[p + NX] < 0)) pushQuad(prev[p - 1], cur[p - 1], cur[p], prev[p]);
        }
        if (a0 !== (Bv[p] < 0)) pushQuad(cur[p - 1 - NX], cur[p - NX], cur[p], cur[p - 1]);
      }
    }
  }

  const positions = pos.slice(0, nV * 3);
  let index = idx.slice(0, nI);
  const tGrid = Date.now();

  // --- evaluator reusing the block lists (for projection, normals, weights, AO)
  const listAt = (x, y, z) => {
    const i = locate(xs, x), j = locate(ys, y), k = locate(zs, z);
    const b = bIndex(Math.min(Math.floor(i / BS), BX - 1), Math.min(Math.floor(j / BS), BY - 1), Math.min(Math.floor(k / BS), BZ - 1));
    if (bState[b] === 2) return [bListStart[b], bListEnd[b]];
    return null;
  };
  const fullList = model.all;
  const query = (x, y, z) => {
    const r = listAt(x, y, z);
    if (r) return model.evalList(x, y, z, pool, r[0], r[1]);
    // outside the narrow band: evaluate everything near the point (slower, rare)
    const near = model.cull(x, y, z, x, y, z, h * 4, fullList);
    return near.length ? model.evalList(x, y, z, near) : 1e3;
  };
  const listFor = (x, y, z) => {
    const r = listAt(x, y, z);
    if (r) return pool.subarray(r[0], r[1]);
    return Int32Array.from(model.cull(x, y, z, x, y, z, h * 4, fullList));
  };
  const localH = (x, y, z) => Math.min(xs[locate(xs, x) + 1] - xs[locate(xs, x)], ys[locate(ys, y) + 1] - ys[locate(ys, y)], zs[locate(zs, z) + 1] - zs[locate(zs, z)]);
  const grad = (x, y, z, e, out) => {
    out[0] = query(x + e, y, z) - query(x - e, y, z);
    out[1] = query(x, y + e, z) - query(x, y - e, z);
    out[2] = query(x, y, z + e) - query(x, y, z - e);
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
    return l / (2 * e);
  };

  // --- project vertices onto the iso-surface and compute normals
  const normals = new Float32Array(nV * 3);
  const g = [0, 0, 0];
  const steps = opts.project ?? 2;
  for (let v = 0; v < nV; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const e = localH(x, y, z) * 0.25;
    for (let s = 0; s < steps; s++) {
      const f = query(x, y, z);
      const gl = grad(x, y, z, e, g);
      const step = f / Math.max(gl, 0.2);
      // never move a vertex more than half a cell (keeps the topology sane)
      const lim = e * 2;
      const st = Math.max(-lim, Math.min(lim, step));
      x -= g[0] * st; y -= g[1] * st; z -= g[2] * st;
    }
    grad(x, y, z, e, g);
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
    normals[v * 3] = g[0]; normals[v * 3 + 1] = g[1]; normals[v * 3 + 2] = g[2];
  }

  // --- orient triangles outward (compare face normal with the SDF normal) and
  // drop degenerate ones; choose the better diagonal of each quad
  const out = new Uint32Array(index.length);
  let nO = 0;
  const tri = (a, b, c) => {
    if (a === b || b === c || a === c) return;
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const ux = positions[b * 3] - ax, uy = positions[b * 3 + 1] - ay, uz = positions[b * 3 + 2] - az;
    const wx = positions[c * 3] - ax, wy = positions[c * 3 + 1] - ay, wz = positions[c * 3 + 2] - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const sn = nx * (normals[a * 3] + normals[b * 3] + normals[c * 3]) + ny * (normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1]) + nz * (normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2]);
    if (nx * nx + ny * ny + nz * nz < 1e-24) return;
    if (sn >= 0) { out[nO++] = a; out[nO++] = b; out[nO++] = c; } else { out[nO++] = a; out[nO++] = c; out[nO++] = b; }
  };
  const d2 = (a, b) => { const dx = positions[a * 3] - positions[b * 3], dy = positions[a * 3 + 1] - positions[b * 3 + 1], dz = positions[a * 3 + 2] - positions[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; };
  for (let q = 0; q < index.length; q += 6) {
    const a = index[q], b = index[q + 1], c = index[q + 2], d = index[q + 5];
    // quad a b c d: split along the shorter diagonal
    if (d2(a, c) <= d2(b, d)) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
  }
  index = out.slice(0, nO);

  return {
    positions, normals, index,
    query, listFor, grad, localH,
    stats: { NX, NY, NZ, vertices: nV, triangles: nO / 3, evals, activeBlocks, msGrid: tGrid - t0, msTotal: Date.now() - t0 },
  };
}

export { SDFModel };
