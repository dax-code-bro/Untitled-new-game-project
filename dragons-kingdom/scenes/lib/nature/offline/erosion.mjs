// Hydraulic + thermal erosion on a heightmap (offline bakes only).
//
// Droplet erosion after Hans Theobald Beyer, "Implementation of a method for hydraulic erosion"
// (2015): each raindrop runs downhill with inertia, picks up sediment while its carrying capacity
// (slope x speed x water) exceeds its load, drops it where it slows, and evaporates. Hundreds of
// thousands of drops cut dendritic gullies and valleys, leave alluvial fans and smooth the spurs
// between them - the look of real weathered land that noise alone never has.
// Thermal erosion then lets slopes steeper than the angle of repose slump into scree.
//
//   erodeHydraulic(h, W, H, { cell, drops, seed, mask })   (h: Float32Array W*H, metres; in place)
//   erodeThermal(h, W, H, { cell, talus, iterations, mask })
import { mulberry } from '../noise.js';

/**
 * opts: cell (m), drops, seed, radius (cells), inertia, capacity, minCapacity, erode, deposit,
 * evaporate, gravity, maxSteps, mask(i, j) -> weight 0..1 (0: no erosion / drop dies), maxDepth
 * (m, limits how deep one drop may cut at a node), onProgress(frac).
 */
export function erodeHydraulic(h, W, H, opts = {}) {
  const cell = opts.cell ?? 1;
  const o = {
    drops: 200000, seed: 1, radius: 3, inertia: 0.06, capacity: 5, minCapacity: 0.01, erode: 0.3, deposit: 0.25,
    evaporate: 0.015, gravity: 4, maxSteps: 64, initialWater: 1, initialSpeed: 1, ...opts,
  };
  const rng = mulberry(o.seed);
  // erosion brush (normalised weights within the radius)
  const R = o.radius, bOff = [], bW = [];
  { let s = 0; for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) { const d = Math.hypot(x, y); if (d <= R) { bOff.push([x, y]); const w = 1 - d / R; bW.push(w); s += w; } } for (let i = 0; i < bW.length; i++) bW[i] /= s; }
  // heights in "cell units" so slopes are dimensionless
  const inv = 1 / cell;
  const mask = opts.mask ? new Float32Array(W * H) : null;
  if (mask) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) mask[j * W + i] = opts.mask(i, j);
  for (let k = 0; k < W * H; k++) h[k] *= inv;
  const hg = (x, y) => {   // height + gradient by bilinear interpolation
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, k = j * W + i;
    const a = h[k], b = h[k + 1], c = h[k + W], d = h[k + W + 1];
    return [a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v, (b - a) * (1 - v) + (d - c) * v, (c - a) * (1 - u) + (d - b) * u];
  };
  const progressEvery = Math.max(1, Math.floor(o.drops / 20));
  for (let n = 0; n < o.drops; n++) {
    if (opts.onProgress && n % progressEvery === 0) opts.onProgress(n / o.drops);
    let x = 1 + rng() * (W - 3), y = 1 + rng() * (H - 3);
    if (mask && mask[Math.floor(y) * W + Math.floor(x)] < rng()) continue;
    let dx = 0, dy = 0, speed = o.initialSpeed, water = o.initialWater, sed = 0;
    for (let step = 0; step < o.maxSteps; step++) {
      const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, k = j * W + i;
      const [hh, gx, gy] = hg(x, y);
      dx = dx * o.inertia - gx * (1 - o.inertia);
      dy = dy * o.inertia - gy * (1 - o.inertia);
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) { const a = rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= len; dy /= len; }
      x += dx; y += dy;
      if (x < 1 || y < 1 || x >= W - 2 || y >= H - 2) break;
      const mk = mask ? mask[Math.floor(y) * W + Math.floor(x)] : 1;
      if (mk <= 0) break;       // the drop left the erodible land (sea, cliff edge)
      const nh = hg(x, y)[0];
      const dh = nh - hh;
      const cap = Math.max(-dh * speed * water * o.capacity, o.minCapacity);
      if (sed > cap || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * o.deposit;
        sed -= amt;
        h[k] += amt * (1 - u) * (1 - v); h[k + 1] += amt * u * (1 - v); h[k + W] += amt * (1 - u) * v; h[k + W + 1] += amt * u * v;
      } else {
        const amt = Math.min((cap - sed) * o.erode * mk, -dh);
        for (let b = 0; b < bOff.length; b++) {
          const xi = i + bOff[b][0], yi = j + bOff[b][1];
          if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
          const kk = yi * W + xi, w = amt * bW[b];
          const d = h[kk] < w ? h[kk] : w;
          h[kk] -= d; sed += d;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed + dh * o.gravity));
      water *= 1 - o.evaporate;
      if (water < 0.01) break;
    }
  }
  for (let k = 0; k < W * H; k++) h[k] *= cell;
  return h;
}

/** Slopes steeper than `talus` (rise/run) shed material downhill (scree, rounded crests). */
export function erodeThermal(h, W, H, opts = {}) {
  const cell = opts.cell ?? 1, talus = (opts.talus ?? 0.8) * cell, it = opts.iterations ?? 20, rate = opts.rate ?? 0.25;
  const d = new Float32Array(W * H);
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let n = 0; n < it; n++) {
    d.fill(0);
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      if (opts.mask && opts.mask(i, j) <= 0) continue;
      let maxd = 0, tot = 0;
      for (const [a, b] of nb) { const dd = h[k] - h[k + b * W + a]; if (dd > talus) { tot += dd - talus; if (dd > maxd) maxd = dd; } }
      if (tot <= 0) continue;
      const move = rate * (maxd - talus) * 0.5;
      for (const [a, b] of nb) { const dd = h[k] - h[k + b * W + a]; if (dd > talus) { const m = move * (dd - talus) / tot; d[k] -= m; d[k + b * W + a] += m; } }
    }
    for (let k = 0; k < W * H; k++) h[k] += d[k];
  }
  return h;
}

/** Flow accumulation (D8 on the filled surface order): how much land drains through each node. */
export function flowAccumulation(h, W, H) {
  const order = new Int32Array(W * H);
  for (let k = 0; k < W * H; k++) order[k] = k;
  order.sort((a, b) => h[b] - h[a]);
  const acc = new Float32Array(W * H).fill(1);
  for (const k of order) {
    const i = k % W, j = (k / W) | 0;
    let best = -1, bd = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      if (!a && !b) continue;
      const x = i + a, y = j + b;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dd = (h[k] - h[y * W + x]) / (a && b ? 1.414 : 1);
      if (dd > bd) { bd = dd; best = y * W + x; }
    }
    if (best >= 0) acc[best] += acc[k];
  }
  return acc;
}

// ------------------------------------------------------------------ stream power ---
// Fluvial incision dh/dt = -K A^m S (n = 1), solved implicitly along the drainage tree
// (Braun & Willett 2013, "FastScape"), with depressions routed by priority-flood (Barnes 2014)
// and linear hillslope diffusion. This is what turns noise hills into dendritic valley systems.

class MinHeap {
  constructor(n) { this.k = new Float64Array(n); this.v = new Int32Array(n); this.n = 0; }
  push(key, val) {
    let i = this.n++; const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], n = --this.n, lk = k[n], lv = v[n];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
    k[i] = lk; v[i] = lv;
    return top;
  }
}

/**
 * opts: cell (m), iterations, K (1/yr-ish, scaled), m (area exponent), dt, D (diffusion m^2/step),
 * outlet(i, j) -> true for base-level nodes (sea, grid border), erodible(i, j) -> 0..1.
 * Returns { area } (drainage area per node, m^2) of the final state.
 */
export function erodeStreamPower(h, W, H, opts = {}) {
  const cell = opts.cell ?? 1, it = opts.iterations ?? 30, K = opts.K ?? 0.002, m = opts.m ?? 0.5, D = opts.D ?? 0, eps = 1e-4;
  const N = W * H;
  const rec = new Int32Array(N), order = new Int32Array(N), area = new Float64Array(N), hf = new Float64Array(N);
  const er = new Float32Array(N), isOut = new Uint8Array(N);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    isOut[k] = (i === 0 || j === 0 || i === W - 1 || j === H - 1 || (opts.outlet && opts.outlet(i, j))) ? 1 : 0;
    er[k] = opts.erodible ? opts.erodible(i, j) : 1;
  }
  const visited = new Uint8Array(N);
  const heap = new MinHeap(N);
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [-1, 1, 1.4142], [1, -1, 1.4142], [-1, -1, 1.4142]];
  for (let n = 0; n < it; n++) {
    if (opts.onProgress) opts.onProgress(n / it);
    // drainage tree by priority flood from the outlets
    visited.fill(0); heap.n = 0;
    for (let k = 0; k < N; k++) if (isOut[k]) { visited[k] = 1; hf[k] = h[k]; rec[k] = k; heap.push(h[k], k); }
    let no = 0;
    while (heap.n) {
      const c = heap.pop(); order[no++] = c;
      const ci = c % W, cj = (c / W) | 0;
      for (const [a, b] of NB) {
        const x = ci + a, y = cj + b;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const k = y * W + x;
        if (visited[k]) continue;
        visited[k] = 1; rec[k] = c;
        hf[k] = Math.max(h[k], hf[c] + eps);
        heap.push(hf[k], k);
      }
    }
    // drainage area (upstream first)
    for (let k = 0; k < N; k++) area[k] = cell * cell;
    for (let q = no - 1; q >= 0; q--) { const k = order[q], r = rec[k]; if (r !== k) area[r] += area[k]; }
    // implicit incision, downstream first (receivers are always solved before their donors);
    // inside filled depressions the node is raised toward the fill (lakes silt up)
    for (let q = 0; q < no; q++) {
      const k = order[q], r = rec[k];
      if (r === k || !er[k]) continue;
      const dx = cell * (((k % W) !== (r % W)) && (((k / W) | 0) !== ((r / W) | 0)) ? 1.4142 : 1);
      const f = K * er[k] * Math.pow(area[k], m) / dx;
      const hn = (h[k] + f * h[r]) / (1 + f);
      h[k] = hn < h[r] ? h[r] + eps : hn;     // never dig below the receiver (no new pits)
    }
    // hillslope diffusion
    if (D > 0) {
      const tmp = new Float32Array(h);
      for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
        const k = j * W + i;
        if (!er[k]) continue;
        tmp[k] = h[k] + D * er[k] * (h[k - 1] + h[k + 1] + h[k - W] + h[k + W] - 4 * h[k]) / (cell * cell);
      }
      h.set(tmp);
    }
  }
  return { area };
}
