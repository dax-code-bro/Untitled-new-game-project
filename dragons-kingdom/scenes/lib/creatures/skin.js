// Per-vertex data for the polygonized body:
//   * skin weights (4 bones) from the distance to each sculpt primitive
//     (every primitive belongs to a bone), smoothed over the mesh;
//   * "chain coordinates" for the scale shader: u along the body chain
//     (spine, each leg, each toe, wing arm, jaw), v around it. The number of
//     scale columns N around a chain is constant (like the fixed scale-row
//     count of a snake), so v wraps seamlessly and scales shrink where the
//     body is thin (neck, snout, tail tip, toes). The wrap seam is put where it
//     cannot be seen as a seam: under the belly (belly plates are symmetric
//     about it), behind the limbs (granular scales), under the toes;
//   * masks: junction (granular skin where two chains meet), belly plates,
//     dorsal crest row, joint wrinkles, ambient occlusion, mouth interior.
// Pure JS (no three.js) so it can be benchmarked in Node.

import { clamp, smoothstep, norm, sub, dot, cross, len, add, scale, vnoise3 } from './sdf.js';

/** Build CSR vertex adjacency from triangles. */
export function adjacency(nV, index) {
  const deg = new Int32Array(nV + 1);
  for (let i = 0; i < index.length; i++) deg[index[i] + 1] += 2;
  for (let i = 0; i < nV; i++) deg[i + 1] += deg[i];
  const nb = new Int32Array(deg[nV]);
  const fill = deg.slice(0, nV);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    nb[fill[a]++] = b; nb[fill[a]++] = c;
    nb[fill[b]++] = a; nb[fill[b]++] = c;
    nb[fill[c]++] = a; nb[fill[c]++] = b;
  }
  return { start: deg, nb };
}

/** Rotation-minimizing frames along a polyline: per segment {a, t, n, b, s0, len}. */
export function chainFrames(points, refUp) {
  const segs = [];
  let n = norm(refUp), s = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], d = sub(points[i + 1], a), l = len(d);
    const t = norm(d);
    // transport n: remove tangent component
    n = sub(n, scale(t, dot(n, t)));
    if (len(n) < 1e-6) n = Math.abs(t[1]) < 0.9 ? sub([0, 1, 0], scale(t, t[1])) : sub([1, 0, 0], scale(t, t[0]));
    n = norm(n);
    segs.push({ a, t, n, b: cross(t, n), s0: s, len: l });
    s += l;
  }
  return { segs, total: s };
}

/** Closest point on a chain: { s, theta, r, t, n, b }. */
function chainProject(fr, p) {
  let best = null, bd = Infinity;
  for (const g of fr.segs) {
    const d = sub(p, g.a);
    const w = clamp(dot(d, g.t), 0, g.len);
    const q = sub(d, scale(g.t, w));
    const dd = dot(q, q);
    if (dd < bd) { bd = dd; best = { g, w, q }; }
  }
  const { g, w, q } = best;
  const theta = Math.atan2(dot(q, g.b), dot(q, g.n));
  return { s: g.s0 + w, theta, r: Math.sqrt(bd), t: g.t, n: g.n, b: g.b };
}

/**
 * opts: { scaleSize: {spine, limb, toe, jaw} (metres per scale at the chain's median radius),
 *         ao: {step, n}, oral(p, boneName) -> 0..1 }
 */
export function computeSkin(anat, mesh, boneIndex, opts = {}) {
  const { positions, normals, index } = mesh;
  const nV = positions.length / 3;
  const sdf = anat.sdf;
  const P = sdf.P, prims = sdf.prims;
  const L = anat.L;
  // per-primitive info
  const chainNames = Object.keys(anat.chains);
  const chainId = Object.fromEntries(chainNames.map((c, i) => [c, i]));
  const nP = prims.length;
  const pBone = new Int32Array(nP), pChain = new Int32Array(nP), pSigma = new Float64Array(nP), pAdd = new Uint8Array(nP);
  const pTag = prims.map((p) => p.tag || '');
  prims.forEach((p, i) => {
    pBone[i] = p.bone != null ? boneIndex[p.bone] : -1;
    if (p.bone != null && boneIndex[p.bone] === undefined) throw new Error(`unknown bone ${p.bone}`);
    pChain[i] = p.chain != null && chainId[p.chain] !== undefined ? chainId[p.chain] : -1;
    const r = p.kind === 'cone' ? Math.max(p.ra, p.rb) * Math.max(p.sx, p.sy) : Math.max(...p.r) * 0.7;
    pSigma[i] = Math.max(p.k * 0.6, r * 0.35, L * 1e-4);
    pAdd[i] = p.op === 'add' ? 1 : 0;
  });

  // ---------------------------------------------------- 1) raw weights
  const nBones = Object.keys(boneIndex).length;
  const W = new Float32Array(nV * 4), I = new Uint16Array(nV * 4);
  const domChain = new Int16Array(nV).fill(-1), domTag = new Array(nV);
  const boneAcc = new Float64Array(nBones), chainAcc = new Float64Array(chainNames.length);
  const touched = [], touchedC = [];
  for (let v = 0; v < nV; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const list = mesh.listFor(x, y, z);
    let bestTag = '', bestW = -1;
    for (let n = 0; n < list.length; n++) {
      const i = list[n];
      if (!pAdd[i] || pBone[i] < 0) continue;
      const d = sdf.primDist(i, x, y, z);
      const w = Math.exp(-4 * Math.max(d, 0) / pSigma[i]);
      if (w < 1e-4) continue;
      const b = pBone[i];
      if (boneAcc[b] === 0) touched.push(b);
      boneAcc[b] += w;
      const c = pChain[i];
      if (c >= 0) { if (chainAcc[c] === 0) touchedC.push(c); chainAcc[c] += w; }
      if (w > bestW) { bestW = w; bestTag = pTag[i]; }
    }
    domTag[v] = bestTag;
    // top 4 bones
    touched.sort((a, b) => boneAcc[b] - boneAcc[a]);
    let sum = 0;
    for (let k = 0; k < 4 && k < touched.length; k++) sum += boneAcc[touched[k]];
    for (let k = 0; k < 4; k++) {
      if (k < touched.length && sum > 0) { I[v * 4 + k] = touched[k]; W[v * 4 + k] = boneAcc[touched[k]] / sum; } else { I[v * 4 + k] = touched[0] ?? 0; W[v * 4 + k] = 0; }
    }
    let bc = -1, bcw = -1;
    for (const c of touchedC) if (chainAcc[c] > bcw) { bcw = chainAcc[c]; bc = c; }
    domChain[v] = bc;
    for (const b of touched) boneAcc[b] = 0;
    for (const c of touchedC) chainAcc[c] = 0;
    touched.length = 0; touchedC.length = 0;
  }

  // ---------------------------------------------------- 2) smooth weights over the mesh
  const adj = adjacency(nV, index);
  const smoothIters = opts.weightSmooth ?? 3;
  const acc = new Map();
  for (let it = 0; it < smoothIters; it++) {
    const W2 = new Float32Array(nV * 4), I2 = new Uint16Array(nV * 4);
    for (let v = 0; v < nV; v++) {
      acc.clear();
      for (let k = 0; k < 4; k++) { const w = W[v * 4 + k]; if (w > 0) acc.set(I[v * 4 + k], (acc.get(I[v * 4 + k]) || 0) + w); }
      const s0 = adj.start[v], s1 = adj.start[v + 1];
      const cnt = s1 - s0;
      if (cnt) {
        const f = 1 / cnt;
        for (let e = s0; e < s1; e++) {
          const u = adj.nb[e];
          for (let k = 0; k < 4; k++) { const w = W[u * 4 + k]; if (w > 0) acc.set(I[u * 4 + k], (acc.get(I[u * 4 + k]) || 0) + w * f); }
        }
      }
      const ent = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = ent.reduce((s, e) => s + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        if (k < ent.length) { I2[v * 4 + k] = ent[k][0]; W2[v * 4 + k] = ent[k][1] / sum; } else { I2[v * 4 + k] = ent[0] ? ent[0][0] : 0; W2[v * 4 + k] = 0; }
      }
    }
    W.set(W2); I.set(I2);
  }

  // ---------------------------------------------------- 2b) weights stay within their part
  // (rev. 2) The raw weights come from primitive distances in the sculpt pose, where the upper arm
  // lies against the flank: arm skin picked up trunk bones and flank skin arm bones, and when the
  // arm folded the other way the shoulder skin turned inside out (hundreds of inverted triangles,
  // a black "hole" in Starlight's armpit). Now a body (spine-chain) vertex never rides a limb bone
  // directly - a humerus / femur weight goes to its helper (half the limb's rotation), any other
  // limb bone to the helper too - and a limb vertex rides only its own limb's bones plus the bones
  // it hangs from (thorax + shoulder helper; pelvis + lumbar + hip helper).
  if (opts.partWeights ?? true) {
    const spineC = chainId.spine;
    const boneName = Object.keys(boneIndex).reduce((a, n) => { a[boneIndex[n]] = n; return a; }, []);
    const partOfBone = (n) => { const m = /^(w_[LR]|hl_[LR])_/.exec(n); return m ? m[1] : null; };
    const helperOf = (part) => boneIndex[part.startsWith('w_') ? `${part}_sh` : `${part}_h`];
    const rootOf = (part) => boneIndex[part.startsWith('w_') ? `${part}_0` : `${part}_0`];
    const hangs = { w: ['thorax', 'rib_thorax'], hl: ['pelvis', 'lumbar'] };
    const chainPartName = chainNames.map((nm) => { const m = /^(w_[LR]|hl_[LR])/.exec(nm); return m ? m[1] : null; });
    for (let v = 0; v < nV; v++) {
      const c = domChain[v];
      if (c < 0) continue;
      const part = chainPartName[c];
      if (c !== spineC && !part) continue;
      acc.clear();
      let best = -1, bestW = -1;
      for (let k = 0; k < 4; k++) {
        const w = W[v * 4 + k];
        if (!(w > 0)) continue;
        const bi = I[v * 4 + k], bn = boneName[bi];
        let to = bi;
        const bp = partOfBone(bn);
        if (c === spineC) {
          if (bp && !/_(sh|h)$/.test(bn)) to = helperOf(bp) ?? bi;
        } else {
          const kind = part.startsWith('w_') ? 'w' : 'hl';
          const own = bp === part;
          if (!own && !hangs[kind].includes(bn)) to = -1;      // reassigned below
        }
        if (to >= 0) { acc.set(to, (acc.get(to) || 0) + w); if (w > bestW && to !== -1 && partOfBone(boneName[to]) === part) { bestW = w; best = to; } }
        else acc.set(-1, (acc.get(-1) || 0) + w);
      }
      if (acc.has(-1)) {
        const lost = acc.get(-1); acc.delete(-1);
        const tgt = best >= 0 ? best : rootOf(part);
        acc.set(tgt, (acc.get(tgt) || 0) + lost);
      }
      const ent = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = ent.reduce((q, e) => q + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) { if (k < ent.length) { I[v * 4 + k] = ent[k][0]; W[v * 4 + k] = ent[k][1] / sum; } else { I[v * 4 + k] = ent[0][0]; W[v * 4 + k] = 0; } }
    }
  }

  // ---------------------------------------------------- 2c) feather the part seams
  // (rev. 2b) 2b leaves a hard seam where body skin meets limb skin: across it one vertex rides
  // the thorax, the next the humerus. When the arm swings far from the sculpt pose (gliding,
  // sitting) the seam opened into a "curtain" of stretched triangles metres tall. Here the weights
  // in a band either side of every body/limb seam (surface distance <= seamFeather) are relaxed
  // towards a smooth blend - Jacobi iterations over the mesh with the vertices outside the band
  // held fixed - so the shoulder and hip skin stretch over a hand's breadth instead of one triangle.
  const feather = opts.seamFeather ?? L * 0.03;
  if ((opts.partWeights ?? true) && feather > 0) {
    const spineC = chainId.spine;
    const cls = new Int8Array(nV).fill(-1);      // -1 other, 0 body, 1 limb
    for (let v = 0; v < nV; v++) {
      const c = domChain[v];
      if (c < 0) continue;
      if (c === spineC) cls[v] = 0; else if (/^(w_[LR]|hl_[LR])/.test(chainNames[c])) cls[v] = 1;
    }
    // surface distance from the seams (Dijkstra over mesh edges, cut off at `feather`)
    const dist = new Float64Array(nV).fill(Infinity);
    const heap = [];
    const push = (v, d) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const elen = (a, b) => Math.hypot(positions[a * 3] - positions[b * 3], positions[a * 3 + 1] - positions[b * 3 + 1], positions[a * 3 + 2] - positions[b * 3 + 2]);
    for (let v = 0; v < nV; v++) {
      if (cls[v] < 0) continue;
      for (let e = adj.start[v]; e < adj.start[v + 1]; e++) {
        const u = adj.nb[e];
        if (cls[u] >= 0 && cls[u] !== cls[v]) { const d = elen(u, v) * 0.5; if (d < dist[v]) { dist[v] = d; push(v, d); } }
      }
    }
    while (heap.length) {
      const [d, v] = pop();
      if (d > dist[v]) continue;
      for (let e = adj.start[v]; e < adj.start[v + 1]; e++) {
        const u = adj.nb[e];
        const nd = d + elen(u, v);
        if (nd < dist[u] && nd <= feather) { dist[u] = nd; push(u, nd); }
      }
    }
    const band = [];
    for (let v = 0; v < nV; v++) if (dist[v] <= feather) band.push(v);
    if (band.length) {
      // dense weights over the bones that occur in the band and its first outside ring
      const slot = new Int32Array(nV).fill(-1);
      const rows = [];
      const addRow = (v) => { if (slot[v] < 0) { slot[v] = rows.length; rows.push(v); } };
      for (const v of band) { addRow(v); for (let e = adj.start[v]; e < adj.start[v + 1]; e++) addRow(adj.nb[e]); }
      const col = new Map();
      for (const v of rows) for (let k = 0; k < 4; k++) if (W[v * 4 + k] > 0 && !col.has(I[v * 4 + k])) col.set(I[v * 4 + k], col.size);
      const nb = col.size, nR = rows.length;
      let cur = new Float32Array(nR * nb), nxt = new Float32Array(nR * nb);
      rows.forEach((v, r) => { for (let k = 0; k < 4; k++) { const w = W[v * 4 + k]; if (w > 0) cur[r * nb + col.get(I[v * 4 + k])] += w; } });
      nxt.set(cur);
      const iters = opts.seamIters ?? 80;
      for (let it = 0; it < iters; it++) {
        for (const v of band) {
          const r = slot[v], s0 = adj.start[v], s1 = adj.start[v + 1], f = 0.7 / Math.max(1, s1 - s0);
          for (let j = 0; j < nb; j++) nxt[r * nb + j] = cur[r * nb + j] * 0.3;
          for (let e = s0; e < s1; e++) { const q = slot[adj.nb[e]] * nb; for (let j = 0; j < nb; j++) nxt[r * nb + j] += cur[q + j] * f; }
        }
        const tmp = cur; cur = nxt; nxt = tmp;     // (rows outside the band hold their start values in both)
      }
      const bones = [...col.keys()];
      for (const v of band) {
        const r = slot[v];
        const ent = [];
        for (let j = 0; j < nb; j++) if (cur[r * nb + j] > 1e-4) ent.push([bones[j], cur[r * nb + j]]);
        ent.sort((a, b) => b[1] - a[1]);
        const top = ent.slice(0, 4), sum = top.reduce((q, e) => q + e[1], 0) || 1;
        for (let k = 0; k < 4; k++) { if (k < top.length) { I[v * 4 + k] = top[k][0]; W[v * 4 + k] = top[k][1] / sum; } else { I[v * 4 + k] = top[0][0]; W[v * 4 + k] = 0; } }
      }
    }
  }

  // ---------------------------------------------------- 3) chain coordinates
  const frames = chainNames.map((c) => chainFrames(anat.chains[c].points, anat.chains[c].refUp));
  const proj = new Array(nV);
  for (let v = 0; v < nV; v++) {
    const c = domChain[v];
    if (c < 0) { proj[v] = null; continue; }
    proj[v] = chainProject(frames[c], [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]);
  }
  // radius tables per chain -> N and u(s)
  const BINS = 256;
  const chainN = new Float64Array(chainNames.length), uTables = [];
  chainNames.forEach((name, c) => {
    const fr = frames[c];
    const sumR = new Float64Array(BINS), cnt = new Float64Array(BINS);
    for (let v = 0; v < nV; v++) {
      if (domChain[v] !== c) continue;
      const b = Math.min(BINS - 1, Math.floor(proj[v].s / fr.total * BINS));
      sumR[b] += proj[v].r; cnt[b]++;
    }
    const R = new Float64Array(BINS);
    let last = -1;
    for (let b = 0; b < BINS; b++) if (cnt[b] > 0) { R[b] = sumR[b] / cnt[b]; if (last < 0) for (let q = 0; q < b; q++) R[q] = R[b]; last = b; } else if (last >= 0) R[b] = -1;
    // fill gaps by linear interpolation
    for (let b = 0; b < BINS; b++) if (R[b] < 0) { let e = b; while (e < BINS && R[e] < 0) e++; const r0 = R[b - 1], r1 = e < BINS ? R[e] : r0; for (let q = b; q < e; q++) R[q] = r0 + (r1 - r0) * (q - b + 1) / (e - b + 1); b = e; }
    if (last < 0) R.fill(L * 0.01);
    // smooth heavily
    for (let it = 0; it < 6; it++) for (let b = 1; b < BINS - 1; b++) R[b] = 0.25 * R[b - 1] + 0.5 * R[b] + 0.25 * R[b + 1];
    const sorted = [...R].sort((a, b) => a - b);
    const kind = anat.chains[name].kind;
    const size = (opts.scaleSize || {})[kind] ?? L * 0.006;
    const N = Math.max(6, Math.round(2 * Math.PI * sorted[BINS >> 1] / size));
    chainN[c] = N;
    // u(s) = integral N / (2 pi R(s)) ds
    const U = new Float64Array(BINS + 1);
    const ds = fr.total / BINS;
    for (let b = 0; b < BINS; b++) U[b + 1] = U[b] + N / (2 * Math.PI * Math.max(R[b], L * 0.0008)) * ds;
    uTables.push({ U, ds, total: fr.total, R });
  });
  // the spine and jaw run toward the head: flip so that u grows toward the scale's free edge (tail-ward)
  const flip = chainNames.map((n) => (anat.chains[n].kind === 'spine' || anat.chains[n].kind === 'jaw' ? -1 : 1));

  const scaleA = new Float32Array(nV * 4);   // u, v, latFromDorsal, halfN
  const tangent = new Float32Array(nV * 4);
  for (let v = 0; v < nV; v++) {
    const pr = proj[v], c = domChain[v];
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    if (!pr) { tangent[v * 4] = 1; tangent[v * 4 + 3] = 1; continue; }
    const tb = uTables[c];
    const f = clamp(pr.s / tb.ds, 0, BINS - 1e-6), b = Math.floor(f);
    const u = (tb.U[b] + (tb.U[b + 1] - tb.U[b]) * (f - b)) * flip[c];
    const N = chainN[c];
    scaleA[v * 4] = u;
    scaleA[v * 4 + 1] = pr.theta / (2 * Math.PI) * N;
    scaleA[v * 4 + 2] = Math.abs(pr.theta) / (2 * Math.PI) * N;
    scaleA[v * 4 + 3] = N / 2;
    // tangent: direction of increasing u, projected on the surface
    let t = scale(pr.t, flip[c]);
    const nn = [nx, ny, nz];
    t = sub(t, scale(nn, dot(t, nn)));
    if (len(t) < 1e-6) t = Math.abs(nx) < 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0]);
    t = norm(t);
    // direction of increasing theta at this point of the circle
    const ct = Math.cos(pr.theta), st = Math.sin(pr.theta);
    const dTheta = [pr.b[0] * ct - pr.n[0] * st, pr.b[1] * ct - pr.n[1] * st, pr.b[2] * ct - pr.n[2] * st];
    const bt = cross(nn, t);
    tangent[v * 4] = t[0]; tangent[v * 4 + 1] = t[1]; tangent[v * 4 + 2] = t[2];
    tangent[v * 4 + 3] = dot(bt, dTheta) >= 0 ? 1 : -1;
  }

  // ---------------------------------------------------- 4) masks
  const mask = new Float32Array(nV * 4);   // granular, belly, dorsal, wrinkle
  const mask2 = new Float32Array(nV * 4);  // ao, oral, scaleSizeWorld, region
  const gran = new Float32Array(nV);
  // triangles whose vertices belong to different chains -> granular junction
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (domChain[a] !== domChain[b] || domChain[b] !== domChain[c] || domChain[a] < 0) { gran[a] = gran[b] = gran[c] = 1; }
  }
  // dilate (decaying) so the pattern change is gradual
  for (let it = 0; it < 3; it++) {
    const g2 = gran.slice();
    for (let v = 0; v < nV; v++) {
      if (gran[v] >= 1) continue;
      let mx = 0;
      for (let e = adj.start[v]; e < adj.start[v + 1]; e++) mx = Math.max(mx, gran[adj.nb[e]]);
      g2[v] = Math.max(gran[v], mx * 0.62);
    }
    gran.set(g2);
  }
  const boneNames = Object.keys(boneIndex);
  const parentOf = anat.bones.reduce((o, b) => { o[b.name] = b.parent; return o; }, {});
  for (let v = 0; v < nV; v++) {
    const pr = proj[v], c = domChain[v];
    const kind = c >= 0 ? anat.chains[chainNames[c]].kind : 'none';
    const th = pr ? Math.abs(pr.theta) : 0;
    let g = gran[v];
    if (kind === 'limb') g = Math.max(g, smoothstep(0.72 * Math.PI, 0.86 * Math.PI, th));
    if (kind === 'skull' && pr && opts.snoutGranular) g = Math.max(g, smoothstep(opts.snoutGranular[0], opts.snoutGranular[1], pr.s));
    if (kind === 'jaw' && pr && opts.chinGranular) g = Math.max(g, smoothstep(opts.chinGranular[0], opts.chinGranular[1], pr.s));
    const tag = domTag[v] || '';
    const isHead = kind === 'skull' || tag === 'head' || tag === 'eyesocket' || tag === 'nostril';
    // small granular scales around the eyes (circumorbital) and on the lids
    if (opts.eyes) for (const e of opts.eyes) {
      const dx = positions[v * 3] - e.center[0], dy = positions[v * 3 + 1] - e.center[1], dz = positions[v * 3 + 2] - e.center[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / e.radius;
      g = Math.max(g, smoothstep(2.3, 1.45, d));
    }
    let belly = 0, dorsal = 0;
    if (kind === 'spine' && !isHead) {
      belly = smoothstep(0.68 * Math.PI, 0.8 * Math.PI, th);
      dorsal = 1 - smoothstep(0.035 * Math.PI, 0.075 * Math.PI, th);
    }
    if (kind === 'jaw') {
      belly = smoothstep(0.62 * Math.PI, 0.75 * Math.PI, th) * 0.7;
      // the chin plates stop short of the jaw tip, where the chain's rows converge (they drew
      // concentric stripes there); the tip is granular like the snout
      if (pr && opts.chinGranular) belly *= 1 - smoothstep(opts.chinGranular[0] - 0.4 * (opts.chinGranular[1] - opts.chinGranular[0]), opts.chinGranular[0] + 0.3 * (opts.chinGranular[1] - opts.chinGranular[0]), pr.s);
    }
    // wrinkles where two bones of one chain share the vertex (bending joints)
    let wr = 0;
    const b0 = boneNames[I[v * 4]], b1 = boneNames[I[v * 4 + 1]];
    if (W[v * 4 + 1] > 0.05 && (parentOf[b0] === b1 || parentOf[b1] === b0)) wr = clamp(4 * W[v * 4] * W[v * 4 + 1], 0, 1);
    mask[v * 4] = g; mask[v * 4 + 1] = belly; mask[v * 4 + 2] = dorsal; mask[v * 4 + 3] = wr;
    // region id for the shader: 0 torso/neck/tail, 1 head, 2 limb, 3 toe, 4 jaw, 5 wing arm
    // 8 = the wrist pad of a folded wing (a weight-bearing callus: granular, cracked, dusty)
    const region = tag === 'wpad' ? 8 : isHead ? 1 : kind === 'limb' ? (chainNames[c].startsWith('w_') ? 5 : 2) : kind === 'toe' ? 3 : kind === 'jaw' ? 4 : 0;
    mask2[v * 4 + 3] = region;
    if (region === 8) mask[v * 4] = Math.max(mask[v * 4], 0.85);
    // world size of one scale unit here (for anti-aliasing and normal strength)
    // (from the chain's smoothed cross-section radius at this point, not the vertex's own
    // distance: muscle bulges must not make the scales jump in size)
    if (pr) {
      const N = chainN[c], tb = uTables[c];
      const f = clamp(pr.s / tb.ds, 0, BINS - 1.001), b = Math.floor(f);
      const Rs = tb.R[b] + (tb.R[b + 1] - tb.R[b]) * (f - b);
      mask2[v * 4 + 2] = 2 * Math.PI * Math.max(0.6 * Rs + 0.4 * pr.r, L * 0.0008) / N;
    } else mask2[v * 4 + 2] = L * 0.004;
    if (opts.eyes) for (const e of opts.eyes) {
      const dx = positions[v * 3] - e.center[0], dy = positions[v * 3 + 1] - e.center[1], dz = positions[v * 3 + 2] - e.center[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / e.radius;
      if (d < 2.6) mask2[v * 4 + 2] = Math.min(mask2[v * 4 + 2], e.radius * (0.16 + 0.12 * Math.max(0, d - 1.2)));
    }
  }

  // ---------------------------------------------------- 4b) smooth the scale direction across chain junctions
  // The 3D scale mosaic is elongated along the tangent; where two chains meet (shoulder,
  // hip, neck base) their tangents differ, which would cut the mosaic along a seam. The
  // tangent is relaxed over the mesh where the junction mask is set, so it turns gradually.
  {
    const it = opts.tangentSmooth ?? 12;
    for (let k = 0; k < it; k++) {
      const t2 = tangent.slice();
      for (let v = 0; v < nV; v++) {
        const g = mask[v * 4];
        if (g <= 0.02) continue;
        let x = tangent[v * 4], y = tangent[v * 4 + 1], z = tangent[v * 4 + 2];
        for (let e = adj.start[v]; e < adj.start[v + 1]; e++) {
          const u = adj.nb[e];
          let ux = tangent[u * 4], uy = tangent[u * 4 + 1], uz = tangent[u * 4 + 2];
          if (ux * x + uy * y + uz * z < 0) { ux = -ux; uy = -uy; uz = -uz; }     // a direction, not a vector
          x += ux * g; y += uy * g; z += uz * g;
        }
        const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
        const d = x * nx + y * ny + z * nz;
        x -= d * nx; y -= d * ny; z -= d * nz;
        const l = Math.hypot(x, y, z);
        if (l > 1e-8) { t2[v * 4] = x / l; t2[v * 4 + 1] = y / l; t2[v * 4 + 2] = z / l; }
      }
      tangent.set(t2);
    }
  }

  // ---------------------------------------------------- 4c) smooth the scale size across chain junctions
  // (each chain has its own scale unit; an abrupt change would tear the mosaic)
  {
    const it = opts.sizeSmooth ?? 16;
    const ls = new Float32Array(nV);
    for (let v = 0; v < nV; v++) ls[v] = Math.log(Math.max(mask2[v * 4 + 2], 1e-6));
    for (let k = 0; k < it; k++) {
      const l2 = ls.slice();
      for (let v = 0; v < nV; v++) {
        const g = Math.min(1, mask[v * 4] * 1.5 + (k < 3 ? 0.35 : 0));
        if (g <= 0.02) continue;
        let acc = 0, n = 0;
        for (let e = adj.start[v]; e < adj.start[v + 1]; e++) { acc += ls[adj.nb[e]]; n++; }
        if (n) l2[v] = ls[v] + (acc / n - ls[v]) * g;
      }
      ls.set(l2);
    }
    for (let v = 0; v < nV; v++) mask2[v * 4 + 2] = Math.exp(ls[v]);
    // fine granules around the eyes (after the smoothing, which would wash them out)
    if (opts.eyes) for (let v = 0; v < nV; v++) for (const e of opts.eyes) {
      const dx = positions[v * 3] - e.center[0], dy = positions[v * 3 + 1] - e.center[1], dz = positions[v * 3 + 2] - e.center[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / e.radius;
      if (d < 3.2) mask2[v * 4 + 2] = Math.min(mask2[v * 4 + 2], e.radius * (0.2 + 0.22 * Math.max(0, d - 1.15)));
    }
  }

  // ---------------------------------------------------- 5) ambient occlusion from the SDF
  // (rev. 2) occlusion only from the vertex's own part: the body is not darkened by the limbs and
  // a limb not by the body or the other limbs. The bake is made in the sculpt pose, so occlusion
  // between parts belongs to that one pose: the armpit stayed black when the arm folded away from
  // it (it read as a hole). The runtime's screen-space AO supplies the pose's real contact shadow.
  const aoSteps = opts.ao?.n ?? 6, aoStep = opts.ao?.step ?? L * 0.006;
  const partOfChain = (name) => { if (!name) return 0; const m = /^(w_[LR]|hl_[LR])/.exec(name); return m ? m[1] : 0; };
  const chainPart = chainNames.map(partOfChain);
  const pPart = prims.map((p) => partOfChain(p.chain));
  const fbuf = new Int32Array(Math.max(16, nP));
  const aoQuery = (x, y, z, part) => {
    const list = mesh.listFor(x, y, z);
    let n = 0;
    for (let q = 0; q < list.length; q++) if (pPart[list[q]] === part) fbuf[n++] = list[q];
    return n ? sdf.evalList(x, y, z, fbuf, 0, n) : 1e3;
  };
  for (let v = 0; v < nV; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    const part = domChain[v] >= 0 ? chainPart[domChain[v]] : 0;
    let occ = 0, wsum = 0, w = 1;
    for (let i = 1; i <= aoSteps; i++) {
      const d = aoStep * i * i * 0.5 + aoStep * 0.5 * i;
      const f = aoQuery(x + nx * d, y + ny * d, z + nz * d, part);
      occ += w * clamp((d - f) / d, 0, 1);
      wsum += w;
      w *= 0.72;
    }
    mask2[v * 4] = clamp(1 - 1.35 * occ / wsum, 0, 1);
  }
  // oral (mouth interior)
  if (opts.oral) for (let v = 0; v < nV; v++) {
    mask2[v * 4 + 1] = opts.oral([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], domTag[v]);
  }

  // ---------------------------------------------------- 6) split the v-wrap seam
  // triangles whose v straddles the wrap (same chain, |dv| > N/2) get copies of
  // their negative-v vertices shifted by N
  const extra = [];
  const dupOf = new Int32Array(nV).fill(-1);
  const newIndex = index.slice();
  let nV2 = nV;
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ch = domChain[a];
    if (ch < 0 || domChain[b] !== ch || domChain[c] !== ch) continue;
    const va = scaleA[a * 4 + 1], vb = scaleA[b * 4 + 1], vc = scaleA[c * 4 + 1];
    const half = scaleA[a * 4 + 3];
    if (Math.max(va, vb, vc) - Math.min(va, vb, vc) <= half) continue;
    for (let k = 0; k < 3; k++) {
      const vi = index[t + k];
      if (scaleA[vi * 4 + 1] >= 0) continue;
      if (dupOf[vi] < 0) { dupOf[vi] = nV2++; extra.push(vi); }
      newIndex[t + k] = dupOf[vi];
    }
  }
  const grow = (arr, comp) => {
    const out = new arr.constructor((nV2) * comp);
    out.set(arr);
    extra.forEach((src, k) => { for (let c = 0; c < comp; c++) out[(nV + k) * comp + c] = arr[src * comp + c]; });
    return out;
  };
  const res = {
    noise: grow(vertexNoise(positions, L).noise, 4), warp: grow(vertexNoise(positions, L).warp, 2),
    positions: grow(positions, 3), normals: grow(normals, 3), index: newIndex,
    skinIndex: grow(I, 4), skinWeight: grow(W, 4), scale: grow(scaleA, 4), tangent: grow(tangent, 4), mask: grow(mask, 4), mask2: grow(mask2, 4),
    chainNames, chainN: [...chainN], domChain, seamVerts: extra.length,
  };
  for (let k = 0; k < extra.length; k++) res.scale[(nV + k) * 4 + 1] += res.scale[(nV + k) * 4 + 3] * 2;
  return res;
}

const fbm3 = (x, y, z, oct) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise3(x, y, z); n += a; x = x * 2.03 + 11.7; y = y * 2.03 + 11.7; z = z * 2.03 + 11.7; a *= 0.5; } return s / n; };
/**
 * Low-frequency noises for the skin shader, per vertex (they vary over many
 * vertices, so interpolation is exact enough and the shader saves ~20 octaves
 * of 3D noise per pixel): x mottling, y dust patches, z salt, w medium noise;
 * warp = 2D domain warp of the scale rows.
 */
export function vertexNoise(positions, L) {
  const n = positions.length / 3;
  const noise = new Float32Array(n * 4), warp = new Float32Array(n * 2);
  for (let v = 0; v < n; v++) {
    const x = positions[v * 3] / L, y = positions[v * 3 + 1] / L, z = positions[v * 3 + 2] / L;
    noise[v * 4] = fbm3(x * 9, y * 9, z * 9, 4);
    noise[v * 4 + 1] = fbm3(x * 70 + 3.1, y * 70 + 3.1, z * 70 + 3.1, 3) * 0.6 + fbm3(x * 14 + 1.3, y * 14 + 1.3, z * 14 + 1.3, 3) * 0.4;
    noise[v * 4 + 2] = fbm3(x * 40 + 7.7, y * 40 + 7.7, z * 40 + 7.7, 3);
    noise[v * 4 + 3] = vnoise3(x * 60, y * 60, z * 60);
    warp[v * 2] = vnoise3(x * 35, y * 35, z * 35);
    warp[v * 2 + 1] = vnoise3(x * 35 + 7.3, y * 35 + 7.3, z * 35 + 7.3);
  }
  return { noise, warp };
}
