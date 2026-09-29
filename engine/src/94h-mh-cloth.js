/* =====================================================================
   CLOTHES CUT FROM THE BODY
   ---------------------------------------------------------------------
   The MakeHuman figure (94g) is dressed the way a pattern cutter would
   dress it: each garment is a piece of the body's own surface, cut out
   along a clean line, let out by the garment's ease, smoothed until it
   stops following every muscle, and folded where cloth folds. Because
   every vertex of a garment IS a point of the body (or lies between
   two), it carries the body's skin weights exactly: a sleeve bends with
   the elbow inside it and never through it.

   THE WORKING MESH ("cm") shares its vertices and keeps texture
   coordinates per corner, so a seam in MakeHuman's UV layout is not a
   seam in the geometry. Four operations do all the cutting:

     _cmClip       keep the part of a mesh where a field is <= 0, the
                   cut running exactly along the field's zero line -- a
                   cuff is a straight line round the wrist, not the
                   zig-zag of whichever triangles happened to be there;
     _cmSubdivide  split every triangle in four (cloth wants the
                   resolution for its folds that skin does not);
     _cmSmooth     Taubin smoothing, per-vertex strength, hem lines
                   smoothed along themselves;
     _cmHem        turn every open edge under by the cloth's thickness,
                   so a sleeve has a lip and not a knife edge you can see
                   the inside past.

   Then _mhDress puts them together for fatigues, a hazmat suit, or a
   civilian outfit from OUTFITS (94a), and the pieces come back as the
   geometries Engine.character already knows: the garment, the skin that
   shows (neck, and any bare arm), the hands, the boots.
   ===================================================================== */

function _cmNew() { return { P: [], BP: [], BN: [], W: [], T: [], UV: [], S: [] }; }   // S: the body vertex each came from, or -1
const _cmNV = (M) => M.P.length / 3;

/* Weights: 4 x [joint, weight] per vertex, flat. Mixing sums by joint, keeps the heaviest
   four and renormalises -- the same rule the renderer skins with. */
function _wMixN(W, list) {
  const m = new Map();
  for (const [v, t] of list) {
    if (t <= 0) continue;
    for (let k = 0; k < 4; k++) {
      const w = W[v * 8 + k * 2 + 1] * t;
      if (w > 0) { const j = W[v * 8 + k * 2]; m.set(j, (m.get(j) || 0) + w); }
    }
  }
  const L = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const tot = L.reduce((s, x) => s + x[1], 0) || 1;
  const out = [0, 0, 0, 0, 0, 0, 0, 0];
  L.forEach(([j, w], k) => { out[k * 2] = j; out[k * 2 + 1] = w / tot; });
  return out;
}
function _cmCopyVert(O, M, v) {
  const i = _cmNV(O);
  for (let k = 0; k < 3; k++) { O.P.push(M.P[v * 3 + k]); O.BP.push(M.BP[v * 3 + k]); O.BN.push(M.BN[v * 3 + k]); }
  for (let k = 0; k < 8; k++) O.W.push(M.W[v * 8 + k]);
  O.S.push(M.S[v]);
  return i;
}
function _cmLerpVert(O, M, a, b, t) {
  const i = _cmNV(O);
  for (let k = 0; k < 3; k++) {
    O.P.push(M.P[a * 3 + k] + (M.P[b * 3 + k] - M.P[a * 3 + k]) * t);
    O.BP.push(M.BP[a * 3 + k] + (M.BP[b * 3 + k] - M.BP[a * 3 + k]) * t);
  }
  const n = [0, 1, 2].map((k) => M.BN[a * 3 + k] * (1 - t) + M.BN[b * 3 + k] * t);
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  O.BN.push(n[0] / l, n[1] / l, n[2] / l);
  O.W.push(..._wMixN(M.W, [[a, 1 - t], [b, t]]));
  O.S.push(t < 1e-4 ? M.S[a] : t > 1 - 1e-4 ? M.S[b] : -1);
  return i;
}

/* Keep where f <= 0. f is per vertex of M; the cut is linear along each edge. */
function _cmClip(M, f) {
  const nv = _cmNV(M);
  const F = Float64Array.from(f, (x) => (Math.abs(x) < 1e-5 ? 1e-5 : x));   // nothing exactly on the line: no slivers
  const O = _cmNew();
  const map = new Int32Array(nv).fill(-1);
  const edge = new Map();
  const keep = (v) => (map[v] >= 0 ? map[v] : (map[v] = _cmCopyVert(O, M, v)));
  const cut = (a, b) => {
    const key = a < b ? a * nv + b : b * nv + a;
    let r = edge.get(key);
    if (r == null) { const t = F[a] / (F[a] - F[b]); r = _cmLerpVert(O, M, a, b, t); edge.set(key, r); }
    return r;
  };
  for (let i = 0; i < M.T.length; i += 3) {
    const c = [M.T[i], M.T[i + 1], M.T[i + 2]];
    const inn = c.map((v) => F[v] <= 0);
    if (!inn[0] && !inn[1] && !inn[2]) continue;
    const uv = [0, 1, 2].map((k) => [M.UV[i * 2 + k * 2], M.UV[i * 2 + k * 2 + 1]]);
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const p = c[k], q = c[(k + 1) % 3];
      if (inn[k]) poly.push([keep(p), uv[k]]);
      if (inn[k] !== inn[(k + 1) % 3]) {
        const t = F[p] / (F[p] - F[q]);
        const u2 = uv[(k + 1) % 3];
        poly.push([cut(p, q), [uv[k][0] + (u2[0] - uv[k][0]) * t, uv[k][1] + (u2[1] - uv[k][1]) * t]]);
      }
    }
    for (let k = 1; k + 1 < poly.length; k++) {
      O.T.push(poly[0][0], poly[k][0], poly[k + 1][0]);
      O.UV.push(...poly[0][1], ...poly[k][1], ...poly[k + 1][1]);
    }
  }
  return O;
}

/* Every triangle into four at its edge midpoints. */
function _cmSubdivide(M) {
  const nv = _cmNV(M);
  const O = _cmNew();
  for (let v = 0; v < nv; v++) _cmCopyVert(O, M, v);
  const edge = new Map();
  const mid = (a, b) => {
    const key = a < b ? a * nv + b : b * nv + a;
    let r = edge.get(key);
    if (r == null) { r = _cmLerpVert(O, M, a, b, 0.5); edge.set(key, r); }
    return r;
  };
  for (let i = 0; i < M.T.length; i += 3) {
    const [a, b, c] = [M.T[i], M.T[i + 1], M.T[i + 2]];
    const ua = [M.UV[i * 2], M.UV[i * 2 + 1]], ub = [M.UV[i * 2 + 2], M.UV[i * 2 + 3]], uc = [M.UV[i * 2 + 4], M.UV[i * 2 + 5]];
    const m2 = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    const uab = m2(ua, ub), ubc = m2(ub, uc), uca = m2(uc, ua);
    O.T.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    O.UV.push(...ua, ...uab, ...uca, ...uab, ...ub, ...ubc, ...uca, ...ubc, ...uc, ...uab, ...ubc, ...uca);
  }
  return O;
}

/* Neighbours (CSR) and which vertices sit on an open edge. */
function _cmTopo(M) {
  const nv = _cmNV(M);
  const ec = new Map();
  for (let i = 0; i < M.T.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = M.T[i + k], b = M.T[i + (k + 1) % 3];
    const key = a < b ? a * nv + b : b * nv + a;
    ec.set(key, (ec.get(key) || 0) + 1);
  }
  const deg = new Int32Array(nv), bdeg = new Int32Array(nv);
  for (const [key, n] of ec) { const a = Math.floor(key / nv), b = key % nv; deg[a]++; deg[b]++; if (n === 1) { bdeg[a]++; bdeg[b]++; } }
  const off = new Int32Array(nv + 1);
  for (let v = 0; v < nv; v++) off[v + 1] = off[v] + deg[v];
  const adj = new Int32Array(off[nv]), fill = off.slice(0, nv);
  const boff = new Int32Array(nv + 1);
  for (let v = 0; v < nv; v++) boff[v + 1] = boff[v] + bdeg[v];
  const badj = new Int32Array(boff[nv]), bfill = boff.slice(0, nv);
  for (const [key, n] of ec) {
    const a = Math.floor(key / nv), b = key % nv;
    adj[fill[a]++] = b; adj[fill[b]++] = a;
    if (n === 1) { badj[bfill[a]++] = b; badj[bfill[b]++] = a; }
  }
  return { off, adj, boff, badj, isB: (v) => boff[v + 1] > boff[v] };
}

/* Taubin smoothing (a shrink step and an inflate step, so a sleeve does not get thinner every
   pass). s(v) in 0..1 is how much each vertex takes part; hem vertices move only along the hem. */
function _cmSmooth(M, iters, s, topo, plain) {
  const nv = _cmNV(M);
  const T = topo || _cmTopo(M);
  const P = M.P, tmp = new Float64Array(nv * 3);
  const S = new Float64Array(nv);
  for (let v = 0; v < nv; v++) S[v] = typeof s === 'function' ? s(v) : s;
  for (let it = 0; it < iters * (plain ? 1 : 2); it++) {
    const lam = plain ? 0.5 : it % 2 === 0 ? 0.55 : -0.58;
    for (let v = 0; v < nv; v++) {
      const b = T.isB(v);
      const o0 = b ? T.boff[v] : T.off[v], o1 = b ? T.boff[v + 1] : T.off[v + 1];
      const A = b ? T.badj : T.adj;
      let x = 0, y = 0, z = 0;
      const n = o1 - o0;
      if (!n || S[v] <= 0) { tmp[v * 3] = P[v * 3]; tmp[v * 3 + 1] = P[v * 3 + 1]; tmp[v * 3 + 2] = P[v * 3 + 2]; continue; }
      for (let o = o0; o < o1; o++) { const q = A[o]; x += P[q * 3]; y += P[q * 3 + 1]; z += P[q * 3 + 2]; }
      const k = lam * S[v];
      tmp[v * 3] = P[v * 3] + (x / n - P[v * 3]) * k;
      tmp[v * 3 + 1] = P[v * 3 + 1] + (y / n - P[v * 3 + 1]) * k;
      tmp[v * 3 + 2] = P[v * 3 + 2] + (z / n - P[v * 3 + 2]) * k;
    }
    for (let i = 0; i < nv * 3; i++) P[i] = tmp[i];
  }
  return T;
}

/* Skin weights smoothed over the garment: cloth spreads a joint's bend over more of itself than
   skin does, and it is what keeps a crotch seam from tearing open in a slide. */
function _cmSmoothWeights(M, iters, s, topo) {
  const nv = _cmNV(M);
  const T = topo || _cmTopo(M);
  for (let it = 0; it < iters; it++) {
    const W2 = new Array(nv * 8);
    for (let v = 0; v < nv; v++) {
      const k = typeof s === 'function' ? s(v) : s;
      const n = T.off[v + 1] - T.off[v];
      let w;
      if (k <= 0 || !n) w = M.W.slice(v * 8, v * 8 + 8);
      else {
        const list = [[v, 1 - k]];
        for (let o = T.off[v]; o < T.off[v + 1]; o++) list.push([T.adj[o], k / n]);
        w = _wMixN(M.W, list);
      }
      for (let q = 0; q < 8; q++) W2[v * 8 + q] = w[q];
    }
    M.W = W2;
  }
}

/* NO EDGE SHORTER THAN CLOTH CAN FOLD. MakeHuman packs its vertices a millimetre apart down the
   midline between the legs, and a cut leaves slivers along every hem; a stride that moves two such
   neighbours a centimetre apart stretches the edge between them tenfold. Cloth has no detail at that
   scale, so every edge under `minLen` is collapsed (its two ends merged at their midpoint, weights
   mixed) and the triangles it leaves degenerate are dropped. Texture coordinates stay per corner. */
function _cmCollapseShort(M, minLen) {
  const nv = _cmNV(M), P = M.P;
  const par = new Int32Array(nv);
  for (let v = 0; v < nv; v++) par[v] = v;
  const find = (v) => { while (par[v] !== v) { par[v] = par[par[v]]; v = par[v]; } return v; };
  const used = new Uint8Array(nv);
  // A hem is left exactly where it was cut: collapsing into it frays the edge.
  const cnt = new Map();
  for (let i = 0; i < M.T.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = M.T[i + k], b = M.T[i + (k + 1) % 3], key = a < b ? a * nv + b : b * nv + a;
    cnt.set(key, (cnt.get(key) || 0) + 1);
  }
  const onHem = new Uint8Array(nv);
  for (const [key, n] of cnt) if (n === 1) { onHem[Math.floor(key / nv)] = 1; onHem[key % nv] = 1; }
  const m2 = minLen * minLen;
  for (let i = 0; i < M.T.length; i += 3) for (let k = 0; k < 3; k++) {
    let a = M.T[i + k], b = M.T[i + (k + 1) % 3];
    if (used[a] || used[b]) continue;
    const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2];
    if (dx * dx + dy * dy + dz * dz >= m2) continue;
    // Into the hem, where the hem is: an inner point merges onto the edge's point, not the other way.
    if (onHem[b] && !onHem[a]) { const t = a; a = b; b = t; }
    const keepA = onHem[a] && !onHem[b];
    used[a] = used[b] = 1;
    par[b] = a;
    if (!keepA) for (let q = 0; q < 3; q++) { P[a * 3 + q] = (P[a * 3 + q] + P[b * 3 + q]) / 2; M.BP[a * 3 + q] = (M.BP[a * 3 + q] + M.BP[b * 3 + q]) / 2; }
    const w = _wMixN(M.W, [[a, 0.5], [b, 0.5]]);
    for (let q = 0; q < 8; q++) M.W[a * 8 + q] = w[q];
  }
  const T2 = [], UV2 = [];
  for (let i = 0; i < M.T.length; i += 3) {
    const a = find(M.T[i]), b = find(M.T[i + 1]), c = find(M.T[i + 2]);
    if (a === b || b === c || a === c) continue;
    T2.push(a, b, c);
    for (let q = 0; q < 6; q++) UV2.push(M.UV[i * 2 + q]);
  }
  const changed = T2.length !== M.T.length;
  M.T = T2; M.UV = UV2;
  return changed;
}

/* Weights averaged over SPACE rather than over the mesh, inside `zone(v)` (0..1): where the drape has
   bridged a hollow -- the cleft of the seat -- the cloth's two sides are neighbours in space but a
   long way apart on the mesh, and smoothing along the mesh never mixed a left buttock with a right. */
function _cmSmoothWeightsSpatial(M, radius, zone) {
  const nv = _cmNV(M), P = M.P;
  const cell = radius, grid = new Map();
  const key = (x, y, z) => Math.floor(x / cell) * 73856093 ^ Math.floor(y / cell) * 19349663 ^ Math.floor(z / cell) * 83492791;
  const Z = new Float64Array(nv);
  for (let v = 0; v < nv; v++) {
    Z[v] = zone(v);
    const k = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(v);
  }
  const W2 = M.W.slice();
  for (let v = 0; v < nv; v++) {
    if (Z[v] <= 0) continue;
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const list = [];
    let tot = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const c = grid.get(key(x + dx * cell, y + dy * cell, z + dz * cell));
      if (!c) continue;
      for (const q of c) {
        const d = Math.hypot(P[q * 3] - x, P[q * 3 + 1] - y, P[q * 3 + 2] - z);
        if (d > radius) continue;
        const w = 1 - d / radius;
        list.push([q, w]); tot += w;
      }
    }
    if (!tot) continue;
    const avg = _wMixN(M.W, list.map(([q, w]) => [q, w / tot]));
    const mixed = _wMixN([...M.W.slice(v * 8, v * 8 + 8), ...avg], [[0, 1 - Z[v]], [1, Z[v]]]);
    for (let q = 0; q < 8; q++) W2[v * 8 + q] = mixed[q];
  }
  M.W = W2;
}

/* The two thighs' shares of a vertex's weight re-dealt as a smooth function of x, over `width`
   either side of the midline, `zone(v)` (0..1) of the way (see its use in _mhDress). */
function _cmResplitLR(M, zone, jL, jR, width) {
  const nv = _cmNV(M), W = M.W;
  for (let v = 0; v < nv; v++) {
    const z = zone(v);
    if (z <= 0) continue;
    let iL = -1, iR = -1, wL = 0, wR = 0;
    for (let k = 0; k < 4; k++) {
      if (W[v * 8 + k * 2] === jL && W[v * 8 + k * 2 + 1] > 0) { iL = k; wL = W[v * 8 + k * 2 + 1]; }
      else if (W[v * 8 + k * 2] === jR && W[v * 8 + k * 2 + 1] > 0) { iR = k; wR = W[v * 8 + k * 2 + 1]; }
    }
    const tot = wL + wR;
    if (tot <= 0) continue;
    const f = _ss01(-width, width, M.P[v * 3]);   // where the CLOTH is: the drape bridged the fork, so body points 4 cm apart are cloth 5 mm apart
    const nL = wL + (tot * f - wL) * z, nR = tot - nL;
    const free = (skip) => {
      let m = -1;
      for (let k = 0; k < 4; k++) if (k !== skip && (m < 0 || W[v * 8 + k * 2 + 1] < W[v * 8 + m * 2 + 1])) m = k;
      return m;
    };
    if (iL < 0) { iL = free(iR); W[v * 8 + iL * 2] = jL; }
    if (iR < 0) { iR = free(iL); W[v * 8 + iR * 2] = jR; }
    W[v * 8 + iL * 2 + 1] = nL; W[v * 8 + iR * 2 + 1] = nR;
    let t = 0;
    for (let k = 0; k < 4; k++) t += W[v * 8 + k * 2 + 1];
    if (t > 0) for (let k = 0; k < 4; k++) W[v * 8 + k * 2 + 1] /= t;
  }
}

/* Every open edge smoothed along itself: a cut follows the mesh's own wobble and the drape moves
   its points by slices, and a waistband or a cuff is a clean line. */
function _cmSmoothLoops(M, iters) {
  for (const L of _cmBoundaryLoops(M)) {
    const n = L.length;
    if (n < 5) continue;
    for (let it = 0; it < iters; it++) {
      const cur = L.map(({ v }) => [M.P[v * 3], M.P[v * 3 + 1], M.P[v * 3 + 2]]);
      for (let j = 0; j < n; j++) {
        const a = cur[(j + n - 1) % n], b = cur[(j + 1) % n], v = L[j].v;
        for (let k = 0; k < 3; k++) M.P[v * 3 + k] = cur[j][k] * 0.5 + (a[k] + b[k]) * 0.25;
      }
    }
  }
}

/* Keep a garment out of the sleeves. `F` is one side's limb frame (shoulder, elbow, wrist); the
   sleeve's thickness down its length is measured off `ref` (the shirt, its vertices bound almost
   wholly to that arm, `armW(M, v)`), and every vertex of `M` that is not itself the sleeve and lies
   inside it is moved out of the way, the move smoothed into the cloth round it. The same rule the
   body follows (94g), for the ease the cloth added on both sides. */
function _cmArmClear(M, ref, F, armW, margin) {
  const near = (p) => {
    let best = null;
    for (const [a, b, t0] of [[F.sh, F.el, 0], [F.el, F.wr, 1]]) {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2));
      const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
      const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      if (!best || d < best.d) best = { d, c, t: t0 + t };
    }
    return best;
  };
  const bins = Array.from({ length: 20 }, () => []);
  for (let v = 0; v < _cmNV(ref); v++) {
    if (armW(ref, v) < 0.92) continue;
    const q = near([ref.P[v * 3], ref.P[v * 3 + 1], ref.P[v * 3 + 2]]);
    bins[Math.min(19, Math.floor(q.t * 10))].push(q.d);
  }
  const R = bins.map((b) => { if (!b.length) return 0; b.sort((x, y) => x - y); return b[Math.floor(b.length * 0.9)]; });
  for (let i = 0; i < 20; i++) if (!R[i]) R[i] = R[i - 1] || 0.05;
  const rad = (t) => { const f = Math.min(19, Math.max(0, t * 10 - 0.5)), i = Math.floor(f), j = Math.min(19, i + 1); return R[i] + (R[j] - R[i]) * (f - i); };
  const nv = _cmNV(M), topo = _cmTopo(M), D = new Float64Array(nv * 3);
  const sx = Math.sign(F.sh[0]) || 1;
  const push = () => {
    for (let v = 0; v < nv; v++) {
      if (M.P[v * 3] * sx <= 0) continue;
      const w = armW(M, v);
      if (w > 0.45) continue;
      const p = [M.P[v * 3] + D[v * 3], M.P[v * 3 + 1] + D[v * 3 + 1], M.P[v * 3 + 2] + D[v * 3 + 2]];
      const q = near(p);
      if (q.t <= 0.02) continue;
      const rr = rad(q.t) + margin;
      if (q.d >= rr) continue;
      const k = 1 - _ss01(0.25, 0.45, w);
      const dir = q.d > 1e-5 ? [(p[0] - q.c[0]) / q.d, (p[1] - q.c[1]) / q.d, (p[2] - q.c[2]) / q.d] : [-sx, 0, 0];
      for (let m = 0; m < 3; m++) D[v * 3 + m] += dir[m] * (rr - q.d) * k;
    }
  };
  for (let round = 0; round < 3; round++) {
    push();
    for (let it = 0; it < 5; it++) {
      const T = Float64Array.from(D);
      for (let v = 0; v < nv; v++) {
        if (armW(M, v) > 0.6) continue;
        const o0 = topo.off[v], o1 = topo.off[v + 1];
        if (o1 === o0) continue;
        let x = 0, y = 0, z = 0;
        for (let o = o0; o < o1; o++) { const q = topo.adj[o]; x += D[q * 3]; y += D[q * 3 + 1]; z += D[q * 3 + 2]; }
        const n = o1 - o0;
        T[v * 3] = D[v * 3] * 0.5 + x / n * 0.5; T[v * 3 + 1] = D[v * 3 + 1] * 0.5 + y / n * 0.5; T[v * 3 + 2] = D[v * 3 + 2] * 0.5 + z / n * 0.5;
      }
      D.set(T);
    }
  }
  push();
  for (let i = 0; i < nv * 3; i++) M.P[i] += D[i];
}

function _cmNormals(M) {
  const nv = _cmNV(M), P = M.P, N = new Float64Array(nv * 3);
  for (let i = 0; i < M.T.length; i += 3) {
    const a = M.T[i], b = M.T[i + 1], c = M.T[i + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { N[q * 3] += nx; N[q * 3 + 1] += ny; N[q * 3 + 2] += nz; }
  }
  for (let v = 0; v < nv; v++) {
    const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
    if (l > 0) { N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l; } else { N[v * 3] = M.BN[v * 3]; N[v * 3 + 1] = M.BN[v * 3 + 1]; N[v * 3 + 2] = M.BN[v * 3 + 2]; }
  }
  return N;
}

/* The open edges, as loops, each edge in the direction its triangle runs it. */
function _cmBoundaryLoops(M) {
  const nv = _cmNV(M);
  const cnt = new Map();
  for (let i = 0; i < M.T.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = M.T[i + k], b = M.T[i + (k + 1) % 3];
    const key = a < b ? a * nv + b : b * nv + a;
    cnt.set(key, (cnt.get(key) || 0) + 1);
  }
  const next = new Map();
  for (let i = 0; i < M.T.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = M.T[i + k], b = M.T[i + (k + 1) % 3];
    const key = a < b ? a * nv + b : b * nv + a;
    if (cnt.get(key) === 1) next.set(a, { b, tri: i / 3, k });
  }
  const loops = [], seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const L = [];
    let v = start;
    while (v != null && !seen.has(v)) { seen.add(v); const e = next.get(v); if (!e) break; L.push({ v, tri: e.tri, k: e.k }); v = e.b; }
    if (L.length > 2) loops.push(L);
  }
  return loops;
}

/* Geodesic-ish distance (along edges) from a set of vertices. */
function _cmDistFrom(M, seeds, topo, maxD) {
  const nv = _cmNV(M), T = topo || _cmTopo(M), P = M.P;
  const D = new Float64Array(nv).fill(Infinity);
  const heap = [];
  const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const v of seeds) { D[v] = 0; push(0, v); }
  while (heap.length) {
    const [d, v] = pop();
    if (d > D[v] || d > (maxD || Infinity)) continue;
    for (let o = T.off[v]; o < T.off[v + 1]; o++) {
      const q = T.adj[o];
      const nd = d + Math.hypot(P[q * 3] - P[v * 3], P[q * 3 + 1] - P[v * 3 + 1], P[q * 3 + 2] - P[v * 3 + 2]);
      if (nd < D[q]) { D[q] = nd; push(nd, q); }
    }
  }
  return D;
}

/* Turn every open edge under: a strip from the edge straight in toward the body by the cloth's
   depth, wound on from the garment's own triangles so it faces out of the opening. */
function _cmHem(M, depth, loops, uvk = 1) {
  const N = _cmNormals(M);
  for (const L of loops || _cmBoundaryLoops(M)) {
    const inner = L.map(({ v }) => {
      const i = _cmCopyVert(M, M, v);
      for (let k = 0; k < 3; k++) M.P[i * 3 + k] -= N[v * 3 + k] * depth;
      return i;
    });
    for (let j = 0; j < L.length; j++) {
      const a = L[j].v, b = L[(j + 1) % L.length].v, a2 = inner[j], b2 = inner[(j + 1) % L.length];
      const t = L[j].tri, k = L[j].k;
      const ua = [M.UV[t * 6 + k * 2], M.UV[t * 6 + k * 2 + 1]], ub = [M.UV[t * 6 + ((k + 1) % 3) * 2], M.UV[t * 6 + ((k + 1) % 3) * 2 + 1]];
      const off = [0, -depth * 1.2 * uvk];
      // The garment runs a->b; the strip runs b->a on its outer edge.
      M.T.push(b, a, a2, b, a2, b2);
      M.UV.push(...ub, ...ua, ua[0] + off[0], ua[1] + off[1], ...ub, ua[0] + off[0], ua[1] + off[1], ub[0] + off[0], ub[1] + off[1]);
    }
  }
}

/* A patch sewn onto a garment -- a pocket, a flap, a knee panel: a rounded slab laid on the
   surface round `c`, skinned with whatever it lies on. u and v span it (metres, unit vectors),
   `depth` is how far it stands off, `lip` leaves its lower edge standing (a flap). */
function _cmPatch(M, N, c, v, w, h, depth, opts = {}) {
  const u = _norm3(_cross3(v, opts.face));        // so that u x v faces out
  const uvk = opts.uvk || 1;
  const nv = _cmNV(M), P = M.P;
  const R = Math.hypot(w, h) * 0.75 + 0.03;
  const cand = [];
  for (let q = 0; q < nv; q++) {
    const dx = P[q * 3] - c[0], dy = P[q * 3 + 1] - c[1], dz = P[q * 3 + 2] - c[2];
    if (dx * dx + dy * dy + dz * dz < R * R) cand.push(q);
  }
  if (!cand.length) return;
  // The side the patch belongs on: the candidate normals averaged, facing the way the caller asked.
  const nearest = (p) => {
    let best = cand[0], bd = Infinity;
    for (const q of cand) {
      const dx = P[q * 3] - p[0], dy = P[q * 3 + 1] - p[1], dz = P[q * 3 + 2] - p[2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd && (N[q * 3] * opts.face[0] + N[q * 3 + 1] * opts.face[1] + N[q * 3 + 2] * opts.face[2]) > 0.2) { bd = d; best = q; }
    }
    return best;
  };
  const nx = opts.nx || 9, ny = opts.ny || 11;
  const edge = opts.edge || 0.18;
  const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const base = _cmNV(M);
  const grid = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const a = i / nx * 2 - 1, b = j / ny * 2 - 1;
    const t = [c[0] + u[0] * a * w / 2 + v[0] * b * h / 2, c[1] + u[1] * a * w / 2 + v[1] * b * h / 2, c[2] + u[2] * a * w / 2 + v[2] * b * h / 2];
    const q = nearest(t);
    const n = [N[q * 3], N[q * 3 + 1], N[q * 3 + 2]];
    const dd = (t[0] - P[q * 3]) * n[0] + (t[1] - P[q * 3 + 1]) * n[1] + (t[2] - P[q * 3 + 2]) * n[2];
    const onS = [t[0] - n[0] * dd, t[1] - n[1] * dd, t[2] - n[2] * dd];
    const lipEdge = opts.lip && b < -0.999;
    const prof = lipEdge ? ss(1, 1 - edge, Math.abs(a)) : ss(1, 1 - edge, Math.abs(a)) * ss(1, 1 - edge, Math.abs(b));
    const bulge = opts.bulge ? opts.bulge * (1 - a * a) * (1 - b * b) : 0;
    const d = 0.0006 + depth * prof + bulge;
    const i2 = _cmCopyVert(M, M, q);
    M.P[i2 * 3] = onS[0] + n[0] * d; M.P[i2 * 3 + 1] = onS[1] + n[1] * d; M.P[i2 * 3 + 2] = onS[2] + n[2] * d;
    // Skinned like the cloth under it -- the three nearest points, by distance, not the one nearest:
    // across a knee the weights change in a centimetre, and a patch that jumped with them tore.
    {
      const near = [];
      for (const c2 of cand) {
        const dx = P[c2 * 3] - onS[0], dy = P[c2 * 3 + 1] - onS[1], dz = P[c2 * 3 + 2] - onS[2];
        const dd = dx * dx + dy * dy + dz * dz;
        if (near.length < 3) { near.push([c2, dd]); near.sort((a2, b2) => a2[1] - b2[1]); }
        else if (dd < near[2][1]) { near[2] = [c2, dd]; near.sort((a2, b2) => a2[1] - b2[1]); }
      }
      const iw = near.map(([c2, dd]) => [c2, 1 / (Math.sqrt(dd) + 0.002)]);
      const tw = iw.reduce((s2, x) => s2 + x[1], 0);
      const w = _wMixN(M.W, iw.map(([c2, w2]) => [c2, w2 / tw]));
      for (let k = 0; k < 8; k++) M.W[i2 * 8 + k] = w[k];
    }
    grid.push({ i: i2, uv: [a * w / 2 * uvk, b * h / 2 * uvk] });
  }
  const at = (i, j) => grid[j * (nx + 1) + i];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const A = at(i, j), B = at(i + 1, j), C = at(i + 1, j + 1), D = at(i, j + 1);
    // u x v is the outward face when u runs across and v up, seen from outside.
    M.T.push(A.i, B.i, C.i, A.i, C.i, D.i);
    M.UV.push(...A.uv, ...B.uv, ...C.uv, ...A.uv, ...C.uv, ...D.uv);
  }
  if (opts.lip) {
    // The flap's standing lower edge, turned under to the surface.
    for (let i = 0; i < nx; i++) {
      const A = at(i, 0), B = at(i + 1, 0);
      const a2 = _cmCopyVert(M, M, A.i), b2 = _cmCopyVert(M, M, B.i);
      for (const [src, dst] of [[A.i, a2], [B.i, b2]]) {
        for (let k = 0; k < 3; k++) M.P[dst * 3 + k] = M.P[src * 3 + k] - M.BN[src * 3 + k] * (depth + 0.0006);
      }
      M.T.push(B.i, A.i, a2, B.i, a2, b2);
      M.UV.push(...B.uv, ...A.uv, A.uv[0], A.uv[1] - 0.01 * uvk, ...B.uv, A.uv[0], A.uv[1] - 0.01 * uvk, B.uv[0], B.uv[1] - 0.01 * uvk);
    }
  }
  return base;
}

/* The working mesh out as an engine Geometry: split wherever a corner's texture coordinate
   differs, normals shared across the split. */
function _cmToGeometry(M, uvScale, partOf, colorOf, normalOf) {
  const nv = _cmNV(M);
  const N = _cmNormals(M);
  if (normalOf) for (let v = 0; v < nv; v++) { const n = normalOf(v); if (n) { N[v * 3] = n[0]; N[v * 3 + 1] = n[1]; N[v * 3 + 2] = n[2]; } }
  const g = new Geometry();
  const J4 = [], W4 = [], C = colorOf ? [] : null;
  const seen = new Map();
  const emit = (v, u, w) => {
    const key = v * 1e6 + Math.round(u * 997) * 1009 + Math.round(w * 991);
    let r = seen.get(key);
    if (r != null) return r;
    g.part = partOf(v);
    r = g.vert(M.P[v * 3], M.P[v * 3 + 1], M.P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], u * uvScale, w * uvScale);
    for (let k = 0; k < 4; k++) { J4.push(M.W[v * 8 + k * 2]); W4.push(M.W[v * 8 + k * 2 + 1]); }
    if (C) { const c = colorOf(v); C.push(c[0], c[1], c[2]); }
    seen.set(key, r);
    return r;
  };
  for (let i = 0; i < M.T.length; i += 3) {
    const a = emit(M.T[i], M.UV[i * 2], M.UV[i * 2 + 1]);
    const b = emit(M.T[i + 1], M.UV[i * 2 + 2], M.UV[i * 2 + 3]);
    const c = emit(M.T[i + 2], M.UV[i * 2 + 4], M.UV[i * 2 + 5]);
    if (a !== b && b !== c && a !== c) g.tri(a, b, c);
  }
  void nv;
  g.joints = new Float32Array(J4); g.weights = new Float32Array(W4);
  if (C) g.colors = C;
  g.finalize();
  return g;
}

/* Metres of body per unit of MakeHuman's texture space, measured on the mesh, so a fabric's
   uvScale (tiles per metre) means the same on this body as on every other. */
function _cmUvMetres(M) {
  const r = [];
  for (let i = 0; i < M.T.length; i += 3 * 7) {
    const a = M.T[i], b = M.T[i + 1];
    const d3 = Math.hypot(M.P[a * 3] - M.P[b * 3], M.P[a * 3 + 1] - M.P[b * 3 + 1], M.P[a * 3 + 2] - M.P[b * 3 + 2]);
    const du = Math.hypot(M.UV[i * 2] - M.UV[i * 2 + 2], M.UV[i * 2 + 1] - M.UV[i * 2 + 3]);
    if (du > 1e-6 && d3 > 1e-5) r.push(d3 / du);
  }
  r.sort((x, y) => x - y);
  return r.length ? r[r.length >> 1] : 1;
}

const _ss01 = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const _hash1 = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/* CLOTH SPANS HOLLOWS. Skin goes into every dip -- between the shoulder blades, under the chest,
   the cleft of the seat -- and cloth bridges them, because it is hung from the high points and
   pulled taut between them. Two passes do most of that:

   _cmHullSlices: in horizontal slices, move each vertex toward the slice's convex hull (radially
   from the slice's centre), `k` of the way. `group(v)` splits a slice into separate tubes (the two
   legs), or returns -1 to leave a vertex alone (an arm, when the slice is through the chest).

   _cmHang: down the front and the back, the cloth hangs from whatever stands furthest out above it
   -- the chest, the shoulder blades -- toward what stands out below it, so a shirt falls from the
   pectorals to the belt instead of tucking in under them. */
function _hull2(pts) {
  const P2 = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P2.length < 3) return P2;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P2) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P2.length - 1; i >= 0; i--) { const p = P2[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
function _cmHullSlices(M, y0, y1, dy, k, group) {
  const nv = _cmNV(M), P = M.P;
  const bins = new Map();
  for (let v = 0; v < nv; v++) {
    const y = M.BP[v * 3 + 1];
    if (y < y0 || y > y1) continue;
    const gi = group(v);
    if (gi < 0) continue;
    const key = Math.floor((y - y0) / dy) * 16 + gi;
    let b = bins.get(key);
    if (!b) bins.set(key, (b = []));
    b.push(v);
  }
  for (const vs of bins.values()) {
    if (vs.length < 6) continue;
    let cx = 0, cz = 0;
    for (const v of vs) { cx += P[v * 3]; cz += P[v * 3 + 2]; }
    cx /= vs.length; cz /= vs.length;
    const H = _hull2(vs.map((v) => [P[v * 3], P[v * 3 + 2]]));
    if (H.length < 3) continue;
    for (const v of vs) {
      const dx = P[v * 3] - cx, dz = P[v * 3 + 2] - cz;
      const r = Math.hypot(dx, dz);
      if (r < 1e-5) continue;
      const ux = dx / r, uz = dz / r;
      // Where the ray from the centre through this vertex leaves the hull.
      let R = r;
      for (let i = 0; i < H.length; i++) {
        const a = H[i], b = H[(i + 1) % H.length];
        const ex = b[0] - a[0], ez = b[1] - a[1];
        const den = ux * ez - uz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((a[0] - cx) * ez - (a[1] - cz) * ex) / den;
        const s2 = ((a[0] - cx) * uz - (a[1] - cz) * ux) / den;
        if (t > 0 && s2 >= -1e-6 && s2 <= 1 + 1e-6) { R = Math.max(R, t); }
      }
      const nr = r + (R - r) * k;
      P[v * 3] = cx + ux * nr; P[v * 3 + 2] = cz + uz * nr;
    }
  }
}
function _cmHang(M, sel, dx, k, sign, ax = 2, colAx = 0) {
  // Hangs along y, standing out along axis `ax` (z: front/back, x: the sides); sign picks which way is out.
  const nv = _cmNV(M), P = M.P;
  const cols = new Map();
  for (let v = 0; v < nv; v++) {
    if (!sel(v)) continue;
    const key = Math.floor(P[v * 3 + colAx] / dx);
    let c = cols.get(key);
    if (!c) cols.set(key, (c = []));
    c.push(v);
  }
  for (const vs of cols.values()) {
    if (vs.length < 4) continue;
    // The upper hull of (y, sign*z): the taut line the cloth hangs along.
    const pts = vs.map((v) => [P[v * 3 + 1], sign * P[v * 3 + ax]]).sort((a, b) => a[0] - b[0]);
    const up = [];
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    for (const p of pts) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) >= 0) up.pop(); up.push(p); }
    for (const v of vs) {
      const y = P[v * 3 + 1];
      let j = 0;
      while (j + 1 < up.length && up[j + 1][0] < y) j++;
      if (j + 1 >= up.length) continue;
      const a = up[j], b = up[j + 1];
      const t = (y - a[0]) / ((b[0] - a[0]) || 1);
      const zh = a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, t));
      const z = sign * P[v * 3 + ax];
      if (zh > z) P[v * 3 + ax] = sign * (z + (zh - z) * k);
    }
  }
}

/* ---------------------------------------------------------------------
   DRESSING
   ---------------------------------------------------------------------
   base: the fitted body as a working mesh (bind pose, rig space).
   Q:    the rig's joints (bind positions).
   B:    bone name -> skeleton index.
   Returns { cloth, skin, hands, boots } as working meshes, and colours.
   --------------------------------------------------------------------- */
function _mhDress(base, Q, B, opts) {
  const st = opts.stature || 1;
  const od = opts.outfitDef || null;
  const hazmat = !od && opts.fit === 'hazmat';
  const nv = _cmNV(base);
  const P = base.BP;
  const uvM = _cmUvMetres(base), uvk = 1 / uvM;     // texture units per metre
  const arms = { L: ['upperArmL', 'lowerArmL', 'handL'].map((n) => B[n]), R: ['upperArmR', 'lowerArmR', 'handR'].map((n) => B[n]) };
  const legs = { L: ['upperLegL', 'lowerLegL', 'footL'].map((n) => B[n]), R: ['upperLegR', 'lowerLegR', 'footR'].map((n) => B[n]) };
  const wsum = (W, v, set) => { let s2 = 0; for (let k = 0; k < 4; k++) if (set.includes(W[v * 8 + k * 2])) s2 += W[v * 8 + k * 2 + 1]; return s2; };
  const sub3 = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  const dot3 = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const len3 = (x) => Math.hypot(x[0], x[1], x[2]);

  // Per-side limb frames.
  const S = {};
  for (const s of ['L', 'R']) {
    const sh = Q['upperArm' + s], el = Q['lowerArm' + s], wr = Q['hand' + s];
    const hp = Q['upperLeg' + s], kn = Q['lowerLeg' + s], an = Q['foot' + s];
    S[s] = {
      sh, el, wr, hp, kn, an,
      uUp: _norm3(sub3(el, sh)), uFore: _norm3(sub3(wr, el)), l1: len3(sub3(el, sh)), l2: len3(sub3(wr, el)),
      uThigh: _norm3(sub3(kn, hp)), uShin: _norm3(sub3(an, kn)), k1: len3(sub3(kn, hp)), k2: len3(sub3(an, kn)),
    };
  }
  // Metres down an arm from the shoulder joint, and down a leg from the hip joint.
  const armAlong = (s, p) => {
    const F = S[s], t1 = dot3(sub3(p, F.sh), F.uUp);
    return t1 < F.l1 ? t1 : F.l1 + dot3(sub3(p, F.el), F.uFore);
  };
  const legAlong = (s, p) => {
    const F = S[s], t1 = dot3(sub3(p, F.hp), F.uThigh);
    return t1 < F.k1 ? t1 : F.k1 + dot3(sub3(p, F.kn), F.uShin);
  };

  const sole = -0.875 * st;
  const neckQ = Q.neck;
  // The landmarks every garment is cut to, in the rig's own terms.
  const waistY = 0.100 * st;                  // the top of the trousers, just under the navel
  const beltH = 0.040 * st;
  const collarAt = (p) => p[1] - (neckQ[1] - 0.034 * st - 0.44 * (p[2] - neckQ[2]));   // higher at the nape than at the throat
  const bootTop = sole + 0.160 * st;
  const trouserEnd = sole + 0.110 * st;

  // Per-vertex limb membership, from the skin weights.
  const A = { L: new Float64Array(nv), R: new Float64Array(nv) }, Lg = { L: new Float64Array(nv), R: new Float64Array(nv) };
  for (let v = 0; v < nv; v++) for (const s of ['L', 'R']) { A[s][v] = wsum(base.W, v, arms[s]); Lg[s][v] = wsum(base.W, v, legs[s]); }
  const pAt = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const armSide = (v) => (A.L[v] >= A.R[v] ? 'L' : 'R');
  const legSide = (v) => (Lg.L[v] >= Lg.R[v] ? 'L' : 'R');
  const wristCut = (v, p) => { const F = S[armSide(v)]; return dot3(sub3(p, F.wr), F.uFore); };   // + toward the fingers
  /* THE NECKLINE follows the neck: where MakeHuman's own weights hand the skin from the chest to
     the neck is where the neck rises out of the shoulders, all the way round -- a plane through the
     neck caught the top of the trapezius and cut a boat neck out to the shoulder points. */
  const neckSet = [B.neck, B.head];
  const NW = new Float64Array(nv);
  for (let v = 0; v < nv; v++) NW[v] = wsum(base.W, v, neckSet);

  /* THE GARMENTS, as fields: <= 0 inside. */
  const sleeveFrac = od && od.top ? od.top.sleeve : 1;
  const legFrac = od && od.bottom ? od.bottom.hem : 1;
  const coat = !!(od && od.top && od.top.hem < -0.075);
  const tucked = !od || !!od.belt || hazmat;
  const topHemY = tucked ? waistY - 0.045 * st : coat ? -0.20 * st : 0.012 * st;
  const gloved = !od;
  const fShirt = new Float64Array(nv), fTrou = new Float64Array(nv), fGlove = new Float64Array(nv), fBoot = new Float64Array(nv);
  for (let v = 0; v < nv; v++) {
    const p = pAt(v);
    const arm = Math.max(A.L[v], A.R[v]);
    const s = armSide(v), F = S[s];
    const hem = (topHemY - p[1]) * (1 - arm) - 0.05 * arm;
    const sl = arm > 0.3
      ? (sleeveFrac >= 0.9 ? wristCut(v, p) + 0.012 * st : armAlong(s, p) - sleeveFrac * (F.l1 + F.l2))
      : -0.05;
    fShirt[v] = Math.max(Math.min(NW[v] - 0.30, collarAt(p) + 0.02 * st), hem, sl);
    const ls = legSide(v);
    const legEnd = legFrac >= 0.95 ? trouserEnd - p[1] : legAlong(ls, p) - legFrac * (S[ls].k1 + S[ls].k2);
    fTrou[v] = Math.max(p[1] - waistY, legEnd, arm - 0.5);
    fGlove[v] = Math.max(0.5 - arm, -0.035 * st - wristCut(v, p));
    fBoot[v] = Math.max(p[1] - bootTop, arm - 0.5);
  }
  // The skin that shows: wherever no garment reaches, and 18 mm up under each edge.
  const tuck = 0.018 * st;
  const fSkin = new Float64Array(nv);
  for (let v = 0; v < nv; v++) {
    let m = Math.max(-fShirt[v] - tuck, -fTrou[v] - tuck, -fBoot[v] - tuck);
    if (gloved) m = Math.max(m, -fGlove[v] - tuck);
    fSkin[v] = m;
  }

  const shirt = _cmClip(base, fShirt);
  const trousers = _cmClip(base, fTrou);
  const gloves = gloved ? _cmClip(base, fGlove) : null;
  const skin = _cmClip(base, fSkin);

  const fold = hazmat ? 1.8 : od ? 0.8 : 1.1;
  const easeT = hazmat ? 0.032 : od ? 0.012 : 0.016;
  const crotch = [0, -0.080 * st, 0.020 * st];
  const dCrotch = (p) => Math.hypot(p[0] - crotch[0], (p[1] - crotch[1]) * 0.8, p[2] - crotch[2]);

  /* Let a piece out: subdivide, smooth away the anatomy, stand it off the body by its ease, keep
     it outside the body everywhere, and fold it. */
  const tailor = (M, cfg) => {
    const G = cfg.subdivide === false ? M : _cmSubdivide(M);
    const topo = _cmTopo(G);
    const it = cfg.smooth != null ? cfg.smooth : 6;
    if (it > 0) _cmSmooth(G, it, (v) => (cfg.smoothS ? cfg.smoothS(v, G) : 1), topo);
    if (cfg.flatten) _cmSmooth(G, cfg.flatten.iters, (v) => cfg.flatten.s([G.BP[v * 3], G.BP[v * 3 + 1], G.BP[v * 3 + 2]]), topo, true);
    const N0 = _cmNormals(G);
    const nvG = _cmNV(G);
    const bp = (v) => [G.BP[v * 3], G.BP[v * 3 + 1], G.BP[v * 3 + 2]];
    for (let v = 0; v < nvG; v++) {
      const e = cfg.ease(bp(v)) * st;
      for (let k = 0; k < 3; k++) G.P[v * 3 + k] += N0[v * 3 + k] * e;
    }
    if (cfg.drape) {
      /* The drape is worked out slice by slice, which on its own leaves a contour line at every
         slice. So it is kept as a displacement and that is smoothed over the surface before it is
         applied: the bulk of the move survives, the terraces do not. */
      const P0 = G.P.slice();
      cfg.drape(G);
      const D = new Float64Array(nvG * 3);
      for (let i = 0; i < nvG * 3; i++) D[i] = G.P[i] - P0[i];
      const D2 = new Float64Array(nvG * 3);
      for (let it2 = 0; it2 < 14; it2++) {
        for (let v = 0; v < nvG; v++) {
          const o0 = topo.off[v], o1 = topo.off[v + 1];
          let x = 0, y = 0, z = 0;
          for (let o = o0; o < o1; o++) { const q = topo.adj[o]; x += D[q * 3]; y += D[q * 3 + 1]; z += D[q * 3 + 2]; }
          const n = o1 - o0 || 1;
          D2[v * 3] = D[v * 3] * 0.4 + x / n * 0.6; D2[v * 3 + 1] = D[v * 3 + 1] * 0.4 + y / n * 0.6; D2[v * 3 + 2] = D[v * 3 + 2] * 0.4 + z / n * 0.6;
        }
        D.set(D2);
      }
      for (let i = 0; i < nvG * 3; i++) G.P[i] = P0[i] + D[i];
      /* ...and the hang taken again, unsmoothed: the smoothing that removes the terraces also let the
         cloth curl back in under the chest by a quarter -- a bust's profile, not a man's shirt, which
         drops almost straight from the chest to the belt. */
      if (cfg.rehang) {
        // Kept as a displacement too, faded toward the sides (a column hung off the edge of the chest
        // kinked into a point there) and smoothed a little, so it straightens without creasing.
        const P1 = G.P.slice();
        cfg.rehang(G);
        const D2 = new Float64Array(nvG * 3);
        for (let v = 0; v < nvG; v++) {
          const f = cfg.rehangFade ? cfg.rehangFade(v, G) : 1;
          for (let k = 0; k < 3; k++) D2[v * 3 + k] = (G.P[v * 3 + k] - P1[v * 3 + k]) * f;
        }
        for (let it2 = 0; it2 < 4; it2++) {
          const T = Float64Array.from(D2);
          for (let v = 0; v < nvG; v++) {
            const o0 = topo.off[v], o1 = topo.off[v + 1];
            if (o1 === o0) continue;
            let x = 0, y = 0, z = 0;
            for (let o = o0; o < o1; o++) { const q = topo.adj[o]; x += D2[q * 3]; y += D2[q * 3 + 1]; z += D2[q * 3 + 2]; }
            const n = o1 - o0;
            T[v * 3] = D2[v * 3] * 0.5 + x / n * 0.5; T[v * 3 + 1] = D2[v * 3 + 1] * 0.5 + y / n * 0.5; T[v * 3 + 2] = D2[v * 3 + 2] * 0.5 + z / n * 0.5;
          }
          D2.set(T);
        }
        for (let i = 0; i < nvG * 3; i++) G.P[i] = P1[i] + D2[i];
      }
    }
    const eMin = (cfg.minEase != null ? cfg.minEase : 0.004) * st;
    /* Never inside the body it is on -- measured against the body with its smallest bumps smoothed
       off, or every nipple and knuckle would push a point up through the cloth over it. */
    const ref = { P: G.BP.slice() };
    _cmSmooth(Object.assign({}, G, ref), cfg.refSmooth || 8, 1, topo, true);
    for (let v = 0; v < nvG; v++) {
      const d = (G.P[v * 3] - ref.P[v * 3]) * G.BN[v * 3] + (G.P[v * 3 + 1] - ref.P[v * 3 + 1]) * G.BN[v * 3 + 1] + (G.P[v * 3 + 2] - ref.P[v * 3 + 2]) * G.BN[v * 3 + 2];
      if (d < eMin) for (let k = 0; k < 3; k++) G.P[v * 3 + k] += G.BN[v * 3 + k] * (eMin - d);
    }
    if (cfg.folds) {
      const N1 = _cmNormals(G);
      for (let v = 0; v < nvG; v++) {
        const d = cfg.folds(bp(v), v, G) * st;
        if (d) for (let k = 0; k < 3; k++) G.P[v * 3 + k] += N1[v * 3 + k] * d;
      }
      _cmSmooth(G, 1, 0.35, topo);
    }
    if ((cfg.wIters || 0) > 0) _cmSmoothWeights(G, cfg.wIters, (v) => (cfg.wS ? cfg.wS(bp(v)) : 0.5), topo);
    if (cfg.collapse !== false) for (let pass = 0; pass < 8; pass++) if (!_cmCollapseShort(G, 0.004 * st)) break;
    if (cfg.loops !== false) _cmSmoothLoops(G, 12);
    return G;
  };

  // Folds: bands of cloth gathered across a limb near a joint, broken up round it.
  const ringFolds = (p, F0, u, center, spread, freq, amp, seed) => {
    const r = sub3(p, F0);
    const t = dot3(r, u) - center;
    const env = Math.exp(-(t * t) / (spread * spread));
    if (env < 0.02) return 0;
    const ang = Math.atan2(r[0] * u[2] - r[2] * u[0], r[1] * 0.3 + r[2] * 0.7 + r[0] * 0.2);
    const s2 = t * freq * 2 * Math.PI + Math.sin(ang * 2 + seed) * 1.1 + Math.sin(ang * 3.3 + seed * 1.9) * 0.6;
    return -amp * env * (0.5 + 0.5 * Math.sin(s2));
  };
  const trouEase = (p) => {
    let e = easeT + 0.004;
    const dc = dCrotch(p);
    e += 0.004 * Math.exp(-(dc * dc) / (0.0036 * st * st));                        // the crotch hangs, it does not cup
    if (p[1] < -0.10 * st) e += 0.007 * _ss01(-0.10 * st, -0.20 * st, p[1]);         // cut full through the thigh and below
    if (p[1] > waistY - 0.05 * st) e += 0.005 * _ss01(waistY - 0.05 * st, waistY - 0.01 * st, p[1]);   // the waistband sits outside the shirt
    if (p[1] < -0.52 * st) e += 0.005 * _ss01(-0.52 * st, -0.70 * st, p[1]);      // the shin hangs loose
    // Tucked into the boot: gathered in to the shaft below its top, bloused out over it just above.
    if (p[1] < bootTop + 0.06 * st) e += 0.006 * Math.exp(-Math.pow((p[1] - bootTop - 0.018 * st) / (0.022 * st), 2));
    if (p[1] < bootTop) e -= 0.010 * _ss01(bootTop, bootTop - 0.025 * st, p[1]);
    return e;
  };
  const side = (p, s) => p[0] * (s === 'L' ? 1 : -1) > -0.01 * st;

  const shirtT = tailor(shirt, {
    smooth: 7,
    flatten: { iters: 24, s: (p) => (p[2] > 0.02 * st && p[1] > 0.28 * st && p[1] < 0.48 * st && Math.abs(p[0]) < 0.14 * st ? 1 : 0) },
    ease: (p) => {
      let e = easeT;
      if (p[2] < -0.02 * st) e += 0.003;                                             // cut fuller across the back
      e += 0.006 * _ss01(0.14 * st, 0.17 * st, Math.abs(p[0])) * _ss01(S.L.sh[1] - 0.02 * st, S.L.sh[1] - 0.09 * st, p[1]);   // a sleeve is a tube, not a second skin (below the shoulder cap)
      if (tucked) {
        // Tucked in under the waistband (whose top the belt covers), bloused out over the belt above it.
        const t = _ss01(waistY + 0.002 * st, waistY + 0.014 * st, p[1]);
        e += -0.003 * (1 - t) + 0.006 * t * Math.exp(-Math.pow((p[1] - waistY - 0.024 * st) / (0.026 * st), 2));
      } else if (p[1] < waistY + 0.03 * st) {
        e = Math.max(e, trouEase(p) + (coat && p[1] < waistY - 0.02 * st ? 0.010 : 0.005));      // worn over the trousers
      }
      return e;
    },
    folds: (p, v, G) => {
      let d = 0;
      for (const s of ['L', 'R']) {
        const F = S[s];
        const aw = wsum(G.W, v, arms[s]);          // a sleeve's folds are the sleeve's: never on the chest beside it
        if (aw < 0.05) continue;
        d += aw * ringFolds(p, F.el, F.uFore, 0.0, 0.055 * st, 1 / (0.026 * st), 0.0030 * fold, s === 'L' ? 1.3 : 4.1);        // the elbow
        d += aw * ringFolds(p, F.wr, F.uFore, -0.035 * st, 0.030 * st, 1 / (0.018 * st), 0.0022 * fold, s === 'L' ? 2.2 : 5.5); // bunched at the cuff
        d += aw * ringFolds(p, F.sh, F.uUp, 0.10 * st, 0.05 * st, 1 / (0.045 * st), 0.0014 * fold, s === 'L' ? 0.7 : 3.2);    // down the upper arm
      }
      if (tucked) {   // gathered into the waistband
        const u = (p[1] - (waistY + 0.026 * st)) / (0.022 * st);
        if (u > -1.8 && u < 1.8) {
          const ang = Math.atan2(p[0], p[2]);
          d -= 0.0018 * fold * Math.exp(-u * u) * (0.5 + 0.5 * Math.sin(ang * 11 + Math.sin(ang * 3 + 1.3) * 0.8));
        }
      }
      return d;
    },
    drape: (G) => {
      const armW = (v) => wsum(G.W, v, arms.L) + wsum(G.W, v, arms.R);
      const torso = (v) => armW(v) < 0.25;
      _cmHullSlices(G, topHemY - 0.02 * st, 0.50 * st, 0.012 * st, 0.85, (v) => (torso(v) ? 0 : -1));
      const band = (v) => torso(v) && G.BP[v * 3 + 1] > waistY - 0.01 * st && G.BP[v * 3 + 1] < 0.47 * st;
      _cmHang(G, (v) => band(v) && G.P[v * 3 + 2] > 0.02 * st, 0.012 * st, 0.9, 1);
      _cmHang(G, (v) => band(v) && G.P[v * 3 + 2] < -0.03 * st, 0.012 * st, 0.7, -1);
      // (Not down the sides: hung from the ribcage the trunk stood out into the arms hanging there.)
    },
    rehangFade: (v, G) => 1 - _ss01(0.07 * st, 0.12 * st, Math.abs(G.P[v * 3])),
    rehang: (G) => {
      const armW = (v) => wsum(G.W, v, arms.L) + wsum(G.W, v, arms.R);
      const band = (v) => armW(v) < 0.25 && G.BP[v * 3 + 1] > waistY - 0.01 * st && G.BP[v * 3 + 1] < 0.40 * st;
      _cmHang(G, (v) => band(v) && G.P[v * 3 + 2] > 0.03 * st, 0.012 * st, 1.0, 1);
      _cmHang(G, (v) => band(v) && G.P[v * 3 + 2] < -0.04 * st, 0.012 * st, 0.8, -1);
    },
    wIters: 14, wS: (p) => {
      const de = Math.min(Math.hypot(p[0] - S.L.el[0], p[1] - S.L.el[1], p[2] - S.L.el[2]), Math.hypot(p[0] - S.R.el[0], p[1] - S.R.el[1], p[2] - S.R.el[2]));
      return (p[1] > 0.26 * st && p[1] < 0.52 * st) || de < 0.09 * st ? 0.85 : 0.4;
    },
  });

  /* THE SHOULDER. Brought up and across onto a rifle, the front of the shoulder is where the arm's
     share of the cloth changes fastest, and it tore to three times its length at high port. Forty
     more rounds of averaging there, faded in and out smoothly so the fade itself is no edge. */
  _cmSmoothWeights(shirtT, 40, (v) => {
    const x = Math.abs(shirtT.BP[v * 3]), y = shirtT.BP[v * 3 + 1];
    return 0.8 * _ss01(0.07 * st, 0.12 * st, x) * (1 - _ss01(0.24 * st, 0.29 * st, x)) * _ss01(0.28 * st, 0.36 * st, y);
  });

  const trouT = tailor(trousers, {
    smooth: 7,
    ease: trouEase,
    folds: (p) => {
      let d = 0;
      for (const s of ['L', 'R']) {
        const F = S[s];
        if (!side(p, s)) continue;
        d += ringFolds(p, F.kn, F.uShin, -0.005 * st, 0.07 * st, 1 / (0.035 * st), 0.0032 * fold, s === 'L' ? 0.4 : 2.9);   // the knee
        d += ringFolds(p, F.an, F.uShin, -(bootTop - F.an[1]) - 0.020 * st, 0.026 * st, 1 / (0.018 * st), 0.0035 * fold, s === 'L' ? 1.7 : 3.8);  // bloused over the boot top
        d += ringFolds(p, F.hp, F.uThigh, 0.05 * st, 0.06 * st, 1 / (0.05 * st), 0.0016 * fold, s === 'L' ? 2.6 : 0.9);  // drag from the crotch
      }
      return d;
    },
    drape: (G) => {
      _cmHullSlices(G, sole + 0.10 * st, waistY + 0.01 * st, 0.012 * st, 0.8,
        (v) => (G.BP[v * 3 + 1] > -0.07 * st ? 0 : G.BP[v * 3] >= 0 ? 1 : 2));
      // The seat hangs from the buttocks to the backs of the thighs.
      _cmHang(G, (v) => G.P[v * 3 + 2] < -0.02 * st && G.BP[v * 3 + 1] < waistY - 0.03 * st && G.BP[v * 3 + 1] > -0.40 * st, 0.012 * st, 0.75, -1);
    },
    // The seat only: off the midline and above the fork, where the legs part in a stride.
    rehangFade: (v, G) => _ss01(0.025 * st, 0.06 * st, Math.abs(G.P[v * 3])) * _ss01(-0.20 * st, -0.12 * st, G.BP[v * 3 + 1]),
    rehang: (G) => _cmHang(G, (v) => G.P[v * 3 + 2] < -0.02 * st && G.BP[v * 3 + 1] < -0.02 * st && G.BP[v * 3 + 1] > -0.40 * st, 0.012 * st, 1.0, -1),
    wIters: 14, wS: (p) => {
      // Harder over the knees: MakeHuman hands a knee from thigh to shin in a centimetre, and a slide
      // folds it right over. Cloth spreads that bend over a hand's width of itself.
      const dk = Math.min(Math.hypot(p[0] - S.L.kn[0], p[1] - S.L.kn[1], p[2] - S.L.kn[2]), Math.hypot(p[0] - S.R.kn[0], p[1] - S.R.kn[1], p[2] - S.R.kn[2]));
      return dCrotch(p) < 0.14 * st || dk < 0.11 * st || (p[2] < 0 && p[1] > -0.2 * st && p[1] < waistY) ? 0.85 : 0.4;
    },
  });
  // The seat and the knees: the same, for a slide and a jump.
  _cmSmoothWeights(trouT, 48, (v) => {
    const p = [trouT.BP[v * 3], trouT.BP[v * 3 + 1], trouT.BP[v * 3 + 2]];
    const dk = Math.min(Math.hypot(p[0] - S.L.kn[0], p[1] - S.L.kn[1], p[2] - S.L.kn[2]), Math.hypot(p[0] - S.R.kn[0], p[1] - S.R.kn[1], p[2] - S.R.kn[2]));
    const seat = (1 - _ss01(-0.02 * st, 0.03 * st, p[2])) * _ss01(-0.26 * st, -0.18 * st, p[1]) * (1 - _ss01(waistY - 0.04 * st, waistY + 0.01 * st, p[1]));
    const fork = 1 - _ss01(0.10 * st, 0.17 * st, dCrotch(p));
    return 0.8 * Math.max(1 - _ss01(0.08 * st, 0.14 * st, dk), seat, fork);
  });

  /* Across the seat and the fly, above the fork, the two thighs' shares of the weight are dealt as a
     smooth function of distance from the midline (_cmResplitLR): MakeHuman switches them in a
     centimetre, and a stride -- one thigh forward, one back -- tore the cloth across the cleft to six
     times its length. Below the fork the legs part, and it fades out there. */
  _cmResplitLR(trouT, (v) => {
    const x = trouT.BP[v * 3], y = trouT.BP[v * 3 + 1];
    return _ss01(-0.25 * st, -0.13 * st, y) * (1 - _ss01(waistY - 0.03 * st, waistY + 0.01 * st, y)) * (1 - _ss01(0.09 * st, 0.15 * st, Math.abs(x)));
  }, B.upperLegL, B.upperLegR, 0.065 * st);

  // Neither the shirt's trunk nor the trousers' hips inside a sleeve: the arms hang against the sides.
  for (const sd of ['L', 'R']) {
    const armW = (M, v) => wsum(M.W, v, arms[sd]);
    _cmArmClear(shirtT, shirtT, S[sd], armW, 0.003 * st);
    _cmArmClear(trouT, shirtT, S[sd], armW, 0.003 * st);
  }
  // The clearing packs the cloth at the side of the chest closer: no edge shorter than cloth folds, again.
  for (const M of [shirtT, trouT]) for (let pass = 0; pass < 8; pass++) if (!_cmCollapseShort(M, 0.004 * st)) break;

  const bootT = _mhBoots(base, S, st, sole, bootTop, od, (p) => trouEase(p), legs, wsum);

  const gloveT = gloves ? tailor(gloves, { subdivide: false, smooth: 2, ease: () => 0.0026, minEase: 0.0018, collapse: false }) : null;

  /* The belt: a band cut from the trousers at the waist and stood off them. */
  let belt = null;
  if (tucked && !hazmat) {
    const nt = _cmNV(trouT), fb = new Float64Array(nt);
    for (let v = 0; v < nt; v++) {
      const y = trouT.BP[v * 3 + 1];
      fb[v] = Math.max(y - (waistY - 0.001 * st), (waistY - 0.001 * st - beltH) - y);
    }
    belt = _cmClip(trouT, fb);
    const Nb = _cmNormals(belt);
    for (let v = 0; v < _cmNV(belt); v++) {
      // Stood off the trousers, and its top lifted over their turned-down waistband edge.
      const y = belt.BP[v * 3 + 1], lift = _ss01(waistY - 0.012 * st, waistY - 0.001 * st, y) * 0.007 * st;
      for (let k = 0; k < 3; k++) belt.P[v * 3 + k] += Nb[v * 3 + k] * 0.0055 * st;
      belt.P[v * 3 + 1] += lift;
    }
    _cmHem(belt, 0.005 * st, null, uvk);
  }

  /* The collar: a stand collar raised off the shirt's neckline (the highest of its open edges). */
  let collarLoop = null, best = -Infinity;
  for (const L of _cmBoundaryLoops(shirtT)) {
    let y = 0; for (const { v } of L) y += shirtT.P[v * 3 + 1];
    if (y / L.length > best) { best = y / L.length; collarLoop = L; }
  }
  if (collarLoop && !hazmat) {
    const H = (od ? 0.024 : 0.034) * st;
    /* The neckline as cut follows the weights, which wander a few millimetres up and down between
       vertices; a collar raised straight off that is a row of battlements. Smoothed along itself
       first -- a neckline is a clean curve. */
    {
      const L = collarLoop, n = L.length;
      for (let it2 = 0; it2 < 40; it2++) {
        const cur = L.map(({ v }) => [shirtT.P[v * 3], shirtT.P[v * 3 + 1], shirtT.P[v * 3 + 2]]);
        for (let j = 0; j < n; j++) {
          const a = cur[(j + n - 1) % n], b = cur[(j + 1) % n], v = L[j].v;
          for (let k2 = 0; k2 < 3; k2++) shirtT.P[v * 3 + k2] = cur[j][k2] * 0.5 + (a[k2] + b[k2]) * 0.25;
        }
      }
    }
    const top = collarLoop.map(({ v }) => {
      const i = _cmCopyVert(shirtT, shirtT, v);
      const dx = shirtT.P[v * 3] - neckQ[0], dz = shirtT.P[v * 3 + 2] - neckQ[2];
      const r = Math.hypot(dx, dz) || 1;
      const back = _ss01(0.0, -0.05 * st, dz);           // taller at the back
      shirtT.P[i * 3] -= dx / r * 0.004 * st;
      shirtT.P[i * 3 + 1] += H * (0.8 + 0.3 * back);
      shirtT.P[i * 3 + 2] -= dz / r * 0.004 * st;
      return i;
    });
    for (let j = 0; j < collarLoop.length; j++) {
      const a = collarLoop[j].v, b = collarLoop[(j + 1) % collarLoop.length].v;
      const a2 = top[j], b2 = top[(j + 1) % collarLoop.length];
      const t = collarLoop[j].tri, k = collarLoop[j].k;
      const ua = [shirtT.UV[t * 6 + k * 2], shirtT.UV[t * 6 + k * 2 + 1]], ub = [shirtT.UV[t * 6 + ((k + 1) % 3) * 2], shirtT.UV[t * 6 + ((k + 1) % 3) * 2 + 1]];
      const lift = H * uvk;
      shirtT.T.push(b, a, a2, b, a2, b2);
      shirtT.UV.push(...ub, ...ua, ua[0], ua[1] + lift, ...ub, ua[0], ua[1] + lift, ub[0], ub[1] + lift);
    }
  }

  // Every open edge of the cloth turned under (the collar's top included).
  _cmHem(shirtT, 0.006 * st, null, uvk);
  _cmHem(trouT, 0.006 * st, null, uvk);
  if (gloveT) _cmHem(gloveT, 0.003 * st, null, uvk);

  /* Pockets and flaps, sewn on last so nothing turns their edges under. */
  const s0 = _cmNV(shirtT), t0 = _cmNV(trouT);
  if (!od && !hazmat) {
    const Ns = _cmNormals(shirtT), Nt = _cmNormals(trouT);
    for (const s of ['L', 'R']) {
      const F = S[s], sx = s === 'L' ? 1 : -1, out = [sx, 0, 0];
      const alongA = (t, o) => [F.sh[0] + F.uUp[0] * t + o[0], F.sh[1] + F.uUp[1] * t + o[1], F.sh[2] + F.uUp[2] * t + o[2]];
      const upA = [-F.uUp[0], -F.uUp[1], -F.uUp[2]];
      // Sleeve pocket on the upper arm, outer face, and its flap.
      const pc = alongA(F.l1 * 0.40, [sx * 0.045 * st, 0, 0]);
      _cmPatch(shirtT, Ns, pc, upA, 0.070 * st, 0.090 * st, 0.004 * st, { face: out, bulge: 0.002 * st, uvk });
      _cmPatch(shirtT, Ns, [pc[0] + upA[0] * 0.040 * st, pc[1] + upA[1] * 0.040 * st, pc[2] + upA[2] * 0.040 * st], upA, 0.078 * st, 0.030 * st, 0.0075 * st, { face: out, lip: true, edge: 0.12, uvk });
      // The cargo pocket on the outer thigh and its flap; a smaller one on the calf.
      const upT = [-F.uThigh[0], -F.uThigh[1], -F.uThigh[2]];
      const tc = [F.hp[0] + F.uThigh[0] * F.k1 * 0.56 + sx * 0.078 * st, F.hp[1] + F.uThigh[1] * F.k1 * 0.56, F.hp[2] + F.uThigh[2] * F.k1 * 0.56 + 0.004 * st];
      _cmPatch(trouT, Nt, tc, upT, 0.130 * st, 0.170 * st, 0.007 * st, { face: out, bulge: 0.006 * st, nx: 11, ny: 13, uvk });
      _cmPatch(trouT, Nt, [tc[0] + upT[0] * 0.078 * st, tc[1] + upT[1] * 0.078 * st, tc[2] + upT[2] * 0.078 * st], upT, 0.138 * st, 0.044 * st, 0.0125 * st, { face: out, lip: true, edge: 0.10, uvk });
      const upS = [-F.uShin[0], -F.uShin[1], -F.uShin[2]];
      const cc = [F.kn[0] + F.uShin[0] * F.k2 * 0.30 + sx * 0.050 * st, F.kn[1] + F.uShin[1] * F.k2 * 0.30, F.kn[2] + F.uShin[2] * F.k2 * 0.30];
      _cmPatch(trouT, Nt, cc, upS, 0.070 * st, 0.090 * st, 0.004 * st, { face: out, bulge: 0.002 * st, uvk });
      // The knee panel a pad slides into.
      _cmPatch(trouT, Nt, [F.kn[0], F.kn[1] + 0.01 * st, F.kn[2] + 0.055 * st], [0, 1, 0], 0.110 * st, 0.130 * st, 0.0028 * st, { face: [0, 0, 1], edge: 0.25, uvk });
      // A back pocket.
      _cmPatch(trouT, Nt, [sx * 0.070 * st, -0.010 * st, -0.13 * st], [0, 1, 0], 0.120 * st, 0.130 * st, 0.003 * st, { face: [0, 0, -1], uvk });
    }
  }

  // ...and each patch's weights smoothed across it, so it bends as one piece of cloth.
  if (!od && !hazmat) {
    _cmSmoothWeights(shirtT, 6, (v) => (v >= s0 ? 0.7 : 0));
    _cmSmoothWeights(trouT, 6, (v) => (v >= t0 ? 0.7 : 0));
  }

  /* The weave: every cloth triangle mapped round the limb or trunk it is on. */
  {
    const frames = [{ o: [0, 0, -0.01 * st], axis: [0, 1, 0], out: [0, 0, 1], R: 0.15 * st }];
    for (const s of ['L', 'R']) {
      const F = S[s], sx = s === 'L' ? 1 : -1;
      frames.push({ o: F.sh, axis: _norm3(sub3(F.sh, F.wr)), out: [sx, 0, 0], R: 0.05 * st });
      frames.push({ o: F.hp, axis: _norm3(sub3(F.hp, F.an)), out: [sx, 0, 0], R: 0.08 * st });
    }
    const pickOf = (M) => (i) => {
      let aL = 0, aR = 0, lL = 0, lR = 0, y = 0;
      for (let k = 0; k < 3; k++) {
        const v = M.T[i + k];
        aL += wsum(M.W, v, arms.L); aR += wsum(M.W, v, arms.R); lL += wsum(M.W, v, legs.L); lR += wsum(M.W, v, legs.R);
        y += M.BP[v * 3 + 1];
      }
      if (Math.max(aL, aR) > 1.5) return aL >= aR ? 1 : 3;
      if (Math.max(lL, lR) > 1.5 && y / 3 < -0.02 * st) return lL >= lR ? 2 : 4;
      return 0;
    };
    for (const M of [shirtT, trouT, belt]) if (M) _cmCylUV(M, frames, pickOf(M));
  }

  return { shirt: shirtT, trousers: trouT, belt, boots: bootT, hands: gloveT, skin, gloved, uvM, waistY, beltH, coat, tucked };
}

/* THE WEAVE'S OWN COORDINATES. MakeHuman's texture layout is for a skin map: its islands are
   turned every which way and stretched round the curves, and a ripstop grid laid on it came out as
   wavy contour lines across the chest. Cloth is cut in panels with the grain straight down them, so
   here each triangle is mapped round its own limb or the trunk -- u round it, v along it, both in
   metres -- with the wrap seam where a garment has its seam: the centre of the back, the inside of
   the arm, the inside of the leg. `frames` are {o, axis, out, R}; `pick(tri)` says whose it is. */
function _cmCylUV(M, frames, pick) {
  const P = M.P;
  for (let i = 0; i < M.T.length; i += 3) {
    const F = frames[pick(i)];
    const e2 = F.out, e1 = _norm3(_cross3(F.axis, e2));
    const ang = [], vv = [];
    for (let k = 0; k < 3; k++) {
      const v = M.T[i + k];
      const r = [P[v * 3] - F.o[0], P[v * 3 + 1] - F.o[1], P[v * 3 + 2] - F.o[2]];
      const t = r[0] * F.axis[0] + r[1] * F.axis[1] + r[2] * F.axis[2];
      const rr = [r[0] - F.axis[0] * t, r[1] - F.axis[1] * t, r[2] - F.axis[2] * t];
      ang.push(Math.atan2(rr[0] * e1[0] + rr[1] * e1[1] + rr[2] * e1[2], rr[0] * e2[0] + rr[1] * e2[1] + rr[2] * e2[2]));
      vv.push(t);
    }
    if (Math.max(...ang) - Math.min(...ang) > Math.PI) for (let k = 0; k < 3; k++) if (ang[k] < 0) ang[k] += 2 * Math.PI;
    for (let k = 0; k < 3; k++) { M.UV[(i + k) * 2] = ang[k] * F.R; M.UV[(i + k) * 2 + 1] = vv[k]; }
  }
}

/* All the cloth pieces of one figure into one working mesh, with a colour for every vertex. */
function _cmMerge(pieces) {
  const O = _cmNew();
  const colors = [];
  for (const [M, col] of pieces) {
    if (!M) continue;
    const base = _cmNV(O);
    for (let v = 0; v < _cmNV(M); v++) { _cmCopyVert(O, M, v); const c = typeof col === 'function' ? col(v, M) : col; colors.push(c[0], c[1], c[2]); }
    for (const i of M.T) O.T.push(i + base);
    for (const u of M.UV) O.UV.push(u);
  }
  O.colors = colors;
  return O;
}

/* The boots (see _mhDress): a pair modelled on the figure's own feet, as a working mesh, each
   vertex skinned like the nearest point of the foot or shin under it. */
function _mhBoots(base, S, st, sole, bootTop, od, trouEase, legs, wsum) {
  const nv = _cmNV(base), P = base.BP;
  const sneaker = !!(od && od.shoes && od.shoes.kind === 'sneaker');
  const top = sneaker ? sole + 0.075 * st : bootTop;
  const g = new Geometry(); g.parts = [];
  const sides = [];
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    // The foot, measured: everything of this leg's below the ankle.
    const ids = [];
    for (let v = 0; v < nv; v++) if (P[v * 3] * sx > 0 && P[v * 3 + 1] < sole + 0.13 * st && wsum(base.W, v, legs[s]) > 0.5) ids.push(v);
    let heel = [0, 0, 1e9], toe = [0, 0, -1e9];
    let ax = 0, az = 0, na = 0, ar = 0;
    for (const v of ids) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      if (y < sole + 0.05 * st && z < heel[2]) heel = [x, y, z];
      if (y < sole + 0.05 * st && z > toe[2]) toe = [x, y, z];
      if (y > sole + 0.09 * st && y < sole + 0.125 * st) { ax += x; az += z; na++; }
    }
    ax /= na || 1; az /= na || 1;
    for (const v of ids) {
      const y = P[v * 3 + 1];
      if (y > sole + 0.09 * st && y < sole + 0.125 * st) ar = Math.max(ar, Math.hypot(P[v * 3] - ax, P[v * 3 + 2] - az));
    }
    const d = _norm3([toe[0] - heel[0], 0, toe[2] - heel[2]]);
    const u = [d[2], 0, -d[0]];
    // Width across the ball of the foot, measured square to the foot.
    let wMin = 1e9, wMax = -1e9;
    for (const v of ids) {
      if (P[v * 3 + 1] > sole + 0.045 * st) continue;
      const w = (P[v * 3] - heel[0]) * u[0] + (P[v * 3 + 2] - heel[2]) * u[2];
      wMin = Math.min(wMin, w); wMax = Math.max(wMax, w);
    }
    const L = Math.hypot(toe[0] - heel[0], toe[2] - heel[2]) + 0.022 * st;      // a boot is longer than the foot in it
    const W = (wMax - wMin) + 0.016 * st;
    const wc = (wMin + wMax) / 2;
    const at = (along, y) => [heel[0] - d[0] * 0.008 * st + d[0] * along + u[0] * wc, y, heel[2] - d[2] * 0.008 * st + d[2] * along + u[2] * wc];
    // A boot's shaft takes the trouser tucked into it; a trainer, or a boot under a bare shin, hugs the ankle.
    const bare = sneaker || (od && od.bottom && od.bottom.hem < 0.95);
    const tIn = bare ? 0.007 * st : Math.max(0.010, Math.min(0.024, trouEase([ax, top - 0.01 * st, az]) / st + 0.004)) * st;
    const rTop = ar + tIn, rAnk = ar + 0.009 * st;
    const B = [
      _cone([ax, top, az - 0.004 * st], [ax, sole + 0.070 * st, az - 0.006 * st], rTop, rAnk),                              // shaft
      _box(at(L * 0.47, sole + 0.042 * st), u, [0, 1, 0], [W / 2, 0.040 * st, L * 0.36], 0.028 * st),                      // foot
      _ell(at(L - 0.045 * st, sole + 0.036 * st), [W / 2 - 0.002 * st, 0.030 * st, 0.050 * st], 0.03 * st),                // toe box
      _ell(at(0.042 * st, sole + 0.052 * st), [0.040 * st, 0.046 * st, 0.042 * st], 0.03 * st),                            // heel
      _box(at(L * 0.5, sole + 0.013 * st), u, [0, 1, 0], [W / 2 + 0.006 * st, 0.013 * st, L * 0.5 + 0.004 * st], 0.008 * st, 0.008 * st),   // sole
    ];
    const R = _region(B, 0.024 * st);
    R.bmin = [Math.min(heel[0], toe[0], ax) - 0.12 * st, sole - 0.02 * st, Math.min(heel[2], az) - 0.12 * st];
    R.bmax = [Math.max(heel[0], toe[0], ax) + 0.12 * st, top + 0.04 * st, toe[2] + 0.08 * st];
    R.cut = (x, y, z) => Math.max(sole - y, y - top);
    // Lacing: ridges across the instep, on the line of the foot.
    const lc = at(L * 0.55, 0);
    R.fold = (x, y, z) => {
      const al = (x - lc[0]) * d[0] + (z - lc[2]) * d[2], ac = (x - lc[0]) * u[0] + (z - lc[2]) * u[2];
      if (al < -0.12 * st || al > 0.06 * st || Math.abs(ac) > 0.03 * st || y < sole + 0.05 * st) return 0;
      return -0.0018 * st * (0.5 + 0.5 * Math.sin((y - al * 0.7) * 260 / st)) * Math.exp(-ac * ac * 4000 / (st * st));
    };
    const v0 = g.positions.length / 3;
    _meshRegion(g, R, 0.0075 * st, s === 'L' ? PART.LEG_L : PART.LEG_R, (x, y, z, out) => { out[0] = x * 4 + z * 2; out[1] = y * 4 + z * 2; });
    sides.push({ sx, v0, v1: g.positions.length / 3 });
  }
  const M = _cmNew();
  for (const { sx, v0, v1 } of sides) {
    const cand = [];
    for (let v = 0; v < nv; v++) if (P[v * 3 + 1] < top + 0.05 * st && P[v * 3] * sx > 0 && wsum(base.W, v, legs[sx > 0 ? 'L' : 'R']) > 0.5) cand.push(v);
    for (let i = v0; i < v1; i++) {
      const x = g.positions[i * 3], y = g.positions[i * 3 + 1], z = g.positions[i * 3 + 2];
      let best = cand[0], bd = Infinity;
      for (const q of cand) {
        const dx = P[q * 3] - x, dy = P[q * 3 + 1] - y, dz = P[q * 3 + 2] - z;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) { bd = dd; best = q; }
      }
      M.P.push(x, y, z); M.BP.push(x, y, z);
      M.BN.push(g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]);
      for (let k = 0; k < 8; k++) M.W.push(base.W[best * 8 + k]);
      M.S.push(-1);
    }
  }
  for (let i = 0; i < g.indices.length; i++) { const v = g.indices[i]; M.T.push(v); M.UV.push(g.uvs[v * 2], g.uvs[v * 2 + 1]); }
  _cmSmoothWeights(M, 3, 0.5);
  return M;
}
