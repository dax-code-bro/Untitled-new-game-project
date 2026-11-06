// Procedural vehicles.
//
// Each body is a signed-distance shape (hood, cabin, fenders, mirrors, wheel
// arches, beds and boxes), meshed with surface nets at a few centimetres and
// shaded by one clear-coat car-paint material. Glass, pillars, lights, grille,
// plates, trim and panel gaps are drawn per pixel from the car's own
// measurements, so edges stay crisp at any distance. Wheels are lathed tyres
// with real rims and brake discs. Everything is built in code at load time:
// no download, and every model has real-world proportions.
import * as THREE from 'three';
import { worldUniforms } from '../world/terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cabinLayout, buildInterior, wheelGeometryCab, dialMaterials, dialGeometry } from './cabin.js';

// ---------------------------------------------------------------- helpers
const hyp2 = (a, b) => Math.sqrt(a * a + b * b);
const hyp3 = (a, b, c) => Math.sqrt(a * a + b * b + c * c);
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// Smooth 1D profile through control points (Catmull-Rom), tabulated for speed.
function profile(points, step = 0.01) {
  const p = points.slice().sort((a, b) => a[0] - b[0]);
  const x0 = p[0][0], x1 = p[p.length - 1][0];
  const n = Math.max(2, Math.ceil((x1 - x0) / step) + 1);
  const val = new Float32Array(n), der = new Float32Array(n);
  const at = (x) => {
    let i = 0;
    while (i < p.length - 2 && x > p[i + 1][0]) i++;
    const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(p.length - 1, i + 2)];
    const t = (x - b[0]) / Math.max(1e-6, c[0] - b[0]);
    const m1 = (c[1] - a[1]) / Math.max(1e-6, c[0] - a[0]) * (c[0] - b[0]);
    const m2 = (d[1] - b[1]) / Math.max(1e-6, d[0] - b[0]) * (c[0] - b[0]);
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * b[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * c[1] + (t3 - t2) * m2;
  };
  for (let i = 0; i < n; i++) val[i] = at(x0 + i * step);
  for (let i = 0; i < n; i++) der[i] = (val[Math.min(n - 1, i + 1)] - val[Math.max(0, i - 1)]) / (step * (i === 0 || i === n - 1 ? 1 : 2));
  const idx = (x) => Math.min(n - 1, Math.max(0, Math.round((x - x0) / step)));
  return { f: (x) => val[idx(x)], d: (x) => der[idx(x)] };
}

// A body block: side profile (top/bottom vs z), front/rear faces (z vs y) and
// half-width vs y, intersected with rounded edges.
function block({ top, bot, front, rear, side, kTop = 0.1, kBot = 0.04, kEnd = 0.25 }) {
  const T = profile(top), B = profile(bot), F = profile(front), R = profile(rear), S = profile(side);
  return (x, y, z) => {
    const dx = (Math.abs(x) - S.f(y)) / hyp2(1, S.d(y));
    const dt = (y - T.f(z)) / hyp2(1, T.d(z));
    const db = (B.f(z) - y) / hyp2(1, B.d(z));
    const df = (z - F.f(y)) / hyp2(1, F.d(y));
    const dr = (R.f(y) - z) / hyp2(1, R.d(y));
    let d = smax(dx, dt, kTop);
    d = smax(d, db, kBot);
    d = smax(d, df, kEnd);
    return smax(d, dr, kEnd);
  };
}
function roundBox(cx, cy, cz, hx, hy, hz, r) {
  const f = (x, y, z) => {
    const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
    return hyp3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
  // lower bound of the distance (box without rounding) for early outs
  f.bound = (x, y, z) => Math.max(Math.abs(x - cx) - hx, Math.abs(y - cy) - hy, Math.abs(z - cz) - hz);
  return f;
}
const mirrorX = (f) => { const g = (x, y, z) => f(Math.abs(x), y, z); if (f.bound) g.bound = (x, y, z) => f.bound(Math.abs(x), y, z); return g; };

// ------------------------------------------------------------ surface nets
function surfaceNets(sdf, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 2, ny = Math.ceil((max[1] - min[1]) / h) + 2, nz = Math.ceil((max[2] - min[2]) / h) + 2;
  const F = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  // coarse pass (every 3rd point); fine points are only evaluated near the surface
  const C = 3, cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const G = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) G[i + cx * (j + cy * k)] = sdf(min[0] + i * C * h, min[1] + j * C * h, min[2] + k * C * h);
  const band = C * h * 1.9;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) { F[id(i, j, k)] = 1; continue; }
    const gi = Math.round(i / C), gj = Math.round(j / C), gk = Math.round(k / C);
    const g = G[gi + cx * (gj + cy * gk)];
    F[id(i, j, k)] = Math.abs(g) > band ? g : sdf(min[0] + i * h, min[1] + j * h, min[2] + k * h);
  }
  const V = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ed = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const c = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let q = 0; q < 8; q++) { c[q] = F[id(i + co[q][0], j + co[q][1], k + co[q][2])]; if (c[q] < 0) mask |= 1 << q; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of ed) {
      if ((c[a] < 0) === (c[b] < 0)) continue;
      const t = c[a] / (c[a] - c[b]);
      sx += co[a][0] + (co[b][0] - co[a][0]) * t; sy += co[a][1] + (co[b][1] - co[a][1]) * t; sz += co[a][2] + (co[b][2] - co[a][2]) * t; n++;
    }
    V[id(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
  }
  const nrm = new Float32Array(pos.length);
  const e = h * 0.5;
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    const gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = hyp3(gx, gy, gz) || 1;
    nrm[v] = gx / l; nrm[v + 1] = gy / l; nrm[v + 2] = gz / l;
  }
  const idx = [];
  const tri = (a, b, cc) => {
    // orient each triangle with the field gradient
    const ax = pos[b * 3] - pos[a * 3], ay = pos[b * 3 + 1] - pos[a * 3 + 1], az = pos[b * 3 + 2] - pos[a * 3 + 2];
    const bx = pos[cc * 3] - pos[a * 3], by = pos[cc * 3 + 1] - pos[a * 3 + 1], bz = pos[cc * 3 + 2] - pos[a * 3 + 2];
    const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
    const g = fx * (nrm[a * 3] + nrm[b * 3] + nrm[cc * 3]) + fy * (nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[cc * 3 + 1]) + fz * (nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[cc * 3 + 2]);
    if (g >= 0) idx.push(a, b, cc); else idx.push(a, cc, b);
  };
  const quad = (a, b, cc, d) => { if (a < 0 || b < 0 || cc < 0 || d < 0) return; tri(a, b, cc); tri(a, cc, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = F[id(i, j, k)] < 0;
    if (s0 !== (F[id(i + 1, j, k)] < 0)) quad(V[id(i, j - 1, k - 1)], V[id(i, j, k - 1)], V[id(i, j, k)], V[id(i, j - 1, k)]);
    if (s0 !== (F[id(i, j + 1, k)] < 0)) quad(V[id(i - 1, j, k - 1)], V[id(i, j, k - 1)], V[id(i, j, k)], V[id(i - 1, j, k)]);
    if (s0 !== (F[id(i, j, k + 1)] < 0)) quad(V[id(i - 1, j - 1, k)], V[id(i, j - 1, k)], V[id(i, j, k)], V[id(i - 1, j, k)]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------ vehicle specs
// z points forward (front bumper at +L/2), x right, y up, ground at y = 0.
// belt: bottom of the side windows; roof: roof height; zA0/zA1: windscreen
// base/top; zC1/zC0: roof end / rear-window base; zB: B-pillar; doorR: rear
// door edge (99 = coupe); glassBack: no side glass behind this z.
const P = {
  sedan: { L: 4.7, W: 1.84, ride: 0.16, Rw: 0.33, tw: 0.225, axF: 1.38, axR: -1.42, belt: 0.98, roof: 1.44,
    zA0: 0.72, zA1: -0.12, zC1: -1.05, zC0: -1.68, nose: 0.7, hood: 0.95, deck: 1.0, tail: 0.92, hwc: 0.86, tumble: 0.32,
    zB: -0.42, doorR: -1.2, glassBack: -99, head: [0.6, 0.74, 0.19, 0.05], tail4: [0.64, 0.86, 0.17, 0.06], grille: 0.36, spokes: 10 },
  'sedan-sports': { L: 4.6, W: 1.92, ride: 0.12, Rw: 0.35, tw: 0.27, axF: 1.4, axR: -1.33, belt: 0.86, roof: 1.27,
    zA0: 0.5, zA1: -0.38, zC1: -0.98, zC0: -1.78, nose: 0.58, hood: 0.8, deck: 0.88, tail: 0.86, hwc: 0.8, tumble: 0.48,
    zB: -0.95, doorR: 99, glassBack: -1.35, head: [0.64, 0.64, 0.2, 0.04], tail4: [0.62, 0.8, 0.22, 0.04], grille: 0.42, spokes: 5, fender: 0.17 },
  'hatchback-sports': { L: 4.2, W: 1.8, ride: 0.14, Rw: 0.32, tw: 0.215, axF: 1.28, axR: -1.32, belt: 0.95, roof: 1.43,
    zA0: 0.66, zA1: -0.2, zC1: -1.55, zC0: -1.98, nose: 0.68, hood: 0.92, deck: 0.95, tail: 0.95, hwc: 0.84, tumble: 0.3,
    zB: -0.85, doorR: 99, glassBack: -1.65, head: [0.6, 0.74, 0.17, 0.05], tail4: [0.66, 0.98, 0.12, 0.08], grille: 0.32, spokes: 5, fender: 0.14 },
  suv: { L: 4.9, W: 1.95, ride: 0.24, Rw: 0.38, tw: 0.255, axF: 1.45, axR: -1.45, belt: 1.18, roof: 1.78,
    zA0: 0.95, zA1: 0.12, zC1: -2.2, zC0: -2.36, nose: 0.92, hood: 1.12, deck: 1.18, tail: 1.14, hwc: 0.92, tumble: 0.18,
    zB: -0.3, doorR: -1.4, glassBack: -99, head: [0.66, 0.94, 0.2, 0.06], tail4: [0.78, 1.12, 0.12, 0.13], grille: 0.48, spokes: 6 },
  'suv-luxury': { L: 5.0, W: 2.0, ride: 0.22, Rw: 0.4, tw: 0.27, axF: 1.5, axR: -1.5, belt: 1.2, roof: 1.82,
    zA0: 0.92, zA1: 0.05, zC1: -2.15, zC0: -2.38, nose: 0.95, hood: 1.15, deck: 1.2, tail: 1.16, hwc: 0.94, tumble: 0.2,
    zB: -0.35, doorR: -1.45, glassBack: -99, head: [0.66, 0.97, 0.22, 0.05], tail4: [0.78, 1.14, 0.14, 0.07], grille: 0.52, spokes: 10 },
  van: { L: 5.0, W: 1.95, ride: 0.17, Rw: 0.34, tw: 0.235, axF: 1.6, axR: -1.45, belt: 1.05, roof: 1.92,
    zA0: 1.55, zA1: 0.42, zC1: -2.4, zC0: -2.47, nose: 0.78, hood: 1.02, deck: 1.05, tail: 1.05, hwc: 0.92, tumble: 0.14,
    zB: 0.05, doorR: -1.25, glassBack: -99, head: [0.64, 0.86, 0.2, 0.06], tail4: [0.82, 1.2, 0.09, 0.22], grille: 0.4, spokes: 6 },
  delivery: { L: 5.8, W: 2.05, ride: 0.2, Rw: 0.37, tw: 0.24, axF: 1.85, axR: -1.7, belt: 1.25, roof: 2.6,
    zA0: 2.15, zA1: 1.45, zC1: -2.88, zC0: -2.9, nose: 0.88, hood: 1.18, deck: 1.25, tail: 1.25, hwc: 1.0, tumble: 0.02,
    zB: -99, doorR: 99, glassBack: 1.0, head: [0.7, 0.95, 0.18, 0.08], tail4: [0.92, 0.8, 0.08, 0.2], grille: 0.5, spokes: 0, stripe: 1.5 },
  ambulance: { L: 6.2, W: 2.1, ride: 0.22, Rw: 0.38, tw: 0.245, axF: 2.0, axR: -1.85, belt: 1.28, roof: 2.68,
    zA0: 2.3, zA1: 1.62, zC1: -3.08, zC0: -3.1, nose: 0.92, hood: 1.2, deck: 1.28, tail: 1.28, hwc: 1.03, tumble: 0.02,
    zB: -99, doorR: 99, glassBack: 1.15, head: [0.72, 0.98, 0.18, 0.08], tail4: [0.95, 0.9, 0.08, 0.2], grille: 0.5, spokes: 0, stripe: 1.15, bar: 'siren' },
  truck: { L: 5.5, W: 2.0, ride: 0.26, Rw: 0.4, tw: 0.265, axF: 1.72, axR: -1.75, belt: 1.24, roof: 1.92,
    zA0: 1.02, zA1: 0.3, zC1: -0.55, zC0: -0.6, nose: 1.02, hood: 1.2, deck: 1.26, tail: 1.24, hwc: 0.94, tumble: 0.14,
    zB: -99, doorR: 99, glassBack: -99, head: [0.68, 1.02, 0.17, 0.08], tail4: [0.92, 1.0, 0.07, 0.16], grille: 0.55, spokes: 6, bed: [-0.72, -2.68, 0.86] },
  firetruck: { L: 8.8, W: 2.45, ride: 0.36, Rw: 0.5, tw: 0.3, axF: 2.9, axR: -2.7, belt: 1.7, roof: 2.9, cabover: true,
    zA0: 4.36, zA1: 4.18, zC1: 2.42, zC0: 2.4, nose: 1.4, hood: 1.6, deck: 2.7, tail: 2.7, hwc: 1.18, tumble: 0.04,
    zB: 3.3, doorR: 99, glassBack: 2.55, head: [0.9, 0.85, 0.16, 0.08], tail4: [1.1, 1.0, 0.07, 0.15], grille: 0.6, spokes: 0, stripe: 1.25, bar: 'siren', box: [2.3, -4.4, 2.7] },
  'garbage-truck': { L: 8.2, W: 2.4, ride: 0.36, Rw: 0.5, tw: 0.3, axF: 2.75, axR: -2.3, belt: 1.75, roof: 2.95, cabover: true,
    zA0: 4.06, zA1: 3.9, zC1: 2.32, zC0: 2.3, nose: 1.4, hood: 1.6, deck: 3.3, tail: 3.3, hwc: 1.16, tumble: 0.04,
    zB: -99, doorR: 99, glassBack: 2.5, head: [0.88, 0.85, 0.16, 0.08], tail4: [1.08, 1.1, 0.07, 0.15], grille: 0.6, spokes: 0, box: [2.2, -4.1, 3.35], twoTone: true },
};
P.taxi = { ...P.sedan, L: 4.8, bar: 'taxi' };
P.police = { ...P.sedan, L: 5.0, axF: 1.48, axR: -1.5, zA0: 0.8, zC0: -1.8, zC1: -1.12, doorR: -1.28, bar: 'siren', livery: 1, spokes: 0 };

// Derive a new model from a base body: scale length/width/height and tweak
// the roofline, then optional body styles (wagon, muscle, bus, crew cab, off-road).
export function deriveSpec(baseKey, o = {}) {
  const b = P[baseKey];
  const L = o.L || b.L, W = o.W || b.W, kz = L / b.L, kx = W / b.W, ky = o.hk || 1;
  const s = { ...b, L, W, bar: o.bar ?? b.bar, livery: o.livery ?? b.livery };
  for (const k of ['axF', 'axR', 'zA0', 'zA1', 'zC0', 'zC1']) s[k] = b[k] * kz;
  if (b.zB > -50) s.zB = b.zB * kz;
  if (b.doorR < 50) s.doorR = b.doorR * kz;
  if (b.glassBack > -50) s.glassBack = b.glassBack * kz;
  for (const k of ['belt', 'roof', 'nose', 'hood', 'deck', 'tail']) s[k] = b[k] * ky;
  s.hwc = b.hwc * kx;
  s.head = [b.head[0] * kx, b.head[1] * ky, b.head[2] * kx, b.head[3]];
  s.tail4 = [b.tail4[0] * kx, b.tail4[1] * ky, b.tail4[2] * kx, b.tail4[3]];
  if (b.bed) s.bed = [b.bed[0] * kz, b.bed[1] * kz, b.bed[2] * ky];
  if (b.box) s.box = [b.box[0] * kz, b.box[1] * kz, b.box[2] * ky];
  if (b.stripe) s.stripe = b.stripe * ky;
  if (o.rake) s.zA1 += o.rake;
  if (o.fast && !b.box) s.zC1 = Math.min(s.zA1 - 0.6, s.zC1 + o.fast);
  if (o.spokes !== undefined) s.spokes = o.spokes;
  if (o.fender !== undefined) s.fender = o.fender;
  if (o.Rw) s.Rw = o.Rw;
  if (o.wagon) { s.zC0 = -L / 2 + 0.1; s.zC1 = -L / 2 + 0.25; s.deck = s.belt; s.doorR = s.axR + s.Rw + 0.05; s.tail4 = [s.tail4[0], s.belt + 0.08, 0.08, 0.16]; }
  if (o.muscle) { s.zA0 -= 0.25; s.zA1 -= 0.3; s.zC1 -= 0.1; s.hood += 0.04; s.nose += 0.06; s.zB = s.zC1 + 0.35; s.doorR = 99; s.glassBack = s.zC1 - 0.1; }
  if (o.offroad) { s.ride += 0.08; s.Rw *= 1.12; s.zC0 = -L / 2 + 0.12; s.zC1 = -L / 2 + 0.25; s.doorR = 99; s.zB = s.zA1 - 0.55; }
  if (o.crew && s.bed) { s.zC0 -= 0.75; s.zC1 -= 0.75; s.bed = [s.bed[0] - 0.75, s.bed[1], s.bed[2]]; s.zB = s.zA1 - 0.65; s.doorR = s.zC0 + 0.12; }
  if (o.bus) {
    // full-length passenger box with a band of windows down both sides
    s.zA0 = L / 2 - 0.25; s.zA1 = L / 2 - 0.45; s.zC0 = -L / 2 + 0.05; s.zC1 = -L / 2 + 0.08;
    s.belt = 1.35 * ky; s.roof = 2.95 * ky; s.hood = s.belt; s.nose = 0.9; s.deck = s.belt; s.tail = s.belt;
    s.axF = L / 2 - 2.3; s.axR = -L / 2 + 2.6; s.glassBack = -99; s.zB = -99; s.doorR = 99; s.Rw = 0.5; s.tw = 0.3; s.hwc = W / 2 - 0.02; s.tumble = 0.0;
    s.head = [W / 2 - 0.3, 0.7, 0.16, 0.08]; s.tail4 = [W / 2 - 0.15, 0.9, 0.08, 0.18]; s.stripe = 1.05; s.cabover = true; delete s.box; s.bus = true;
  }
  return s;
}
export function registerSpec(id, spec) { P[id] = spec; }
// Rico's '89 pickup: a short-bed workhorse on steel wheels, faded paint and rust
P['rusty-pickup'] = { ...deriveSpec('truck', { L: 5.2, W: 1.95, hk: 0.97, spokes: 0 }), rust: 0.85 };
export function hasSpec(id) { return !!P[id]; }

function bodySDF(s) {
  const L2 = s.L / 2, W2 = s.W / 2;
  const parts = [];
  // lower body: nose -> hood -> belt line -> deck -> tail
  const top = s.cabover
    ? [[L2, s.belt - 0.1], [L2 - 0.3, s.belt], [-L2, s.belt]]
    : [[L2, s.nose], [L2 - 0.3, s.nose + (s.hood - s.nose) * 0.55], [s.zA0 + 0.12, s.hood], [s.zA0, s.belt], [s.zC0, s.belt],
      [s.zC0 - 0.12, s.deck], [-L2 + 0.22, s.deck - 0.02], [-L2, s.tail]];
  const lowFront = s.ride + 0.1;
  parts.push(block({
    top, kTop: s.cabover ? 0.12 : 0.13, kEnd: s.cabover ? 0.18 : 0.32,
    bot: [[L2, lowFront + 0.08], [L2 - 0.5, s.ride], [-L2 + 0.5, s.ride], [-L2, lowFront + 0.1]],
    front: [[0, L2 - 0.12], [lowFront + 0.15, L2], [s.nose, L2 - (s.cabover ? 0.02 : 0.06)], [s.nose + 0.4, L2 - 0.4]],
    rear: [[0, -L2 + 0.12], [lowFront + 0.15, -L2], [s.tail + 0.2, -L2 + 0.06]],
    side: [[0, W2 - 0.08], [s.ride + 0.12, W2 - 0.015], [(s.ride + s.belt) / 2, W2], [s.belt, W2 - 0.04], [s.belt + 0.3, W2 - 0.12]],
  }));
  // greenhouse
  const rspan = s.zA1 - s.zC1;
  parts.push(block({
    top: [[s.zA1 + 0.3, s.roof - 0.06], [s.zA1, s.roof - 0.015], [s.zC1 + rspan * 0.5, s.roof], [s.zC1, s.roof - 0.02], [s.zC1 - 0.3, s.roof - 0.08]],
    bot: [[-L2, s.belt - 0.25], [L2, s.belt - 0.25]],
    front: [[s.belt, s.zA0], [s.roof, s.zA1]], rear: [[s.belt, s.zC0], [s.roof, s.zC1]],
    side: [[s.belt, s.hwc], [s.roof, s.hwc - (s.roof - s.belt) * s.tumble]],
    kTop: s.cabover ? 0.1 : 0.09, kEnd: s.cabover ? 0.12 : 0.05, kBot: 0.02,
  }));
  // cargo box (box trucks)
  if (s.box) {
    const [z0, z1, yt] = s.box;
    parts.push(roundBox(0, (s.belt - 0.6 + yt) / 2, (z0 + z1) / 2, W2, (yt - (s.belt - 0.6)) / 2, (z0 - z1) / 2, 0.1));
  }
  // fender humps over the wheels
  const axles = [s.axF, s.axR];
  const fender = s.fender || 0.12;
  const fenders = (x, y, z) => {
    let d = 1e9;
    for (const za of axles) d = Math.min(d, hyp2(z - za, y - s.Rw) - (s.Rw + fender));
    return smax(smax(d, Math.abs(x) - W2 + 0.005, 0.06), (W2 - 0.5) - Math.abs(x), 0.06);
  };
  // side mirrors and roof equipment
  const mirror = mirrorX(roundBox(s.hwc + 0.12, s.belt + 0.07, s.zA0 - 0.12, 0.1, 0.06, 0.05, 0.035));
  const mirrorArm = mirrorX(roundBox(s.hwc + 0.03, s.belt + 0.04, s.zA0 - 0.12, 0.06, 0.02, 0.025, 0.012));
  const extras = [mirror, mirrorArm];
  if (s.bar === 'siren') extras.push(roundBox(0, s.roof + 0.07, s.cabover ? s.zA1 - 0.5 : (s.zA1 + s.zC1) / 2 + 0.25, 0.62, 0.065, 0.13, 0.05));
  if (s.bar === 'taxi') extras.push(roundBox(0, s.roof + 0.1, (s.zA1 + s.zC1) / 2, 0.36, 0.1, 0.11, 0.04));
  if (s.tow) {
    extras.push(roundBox(0, s.belt + 0.55, -s.L / 2 + 0.6, 0.12, 0.6, 0.12, 0.03));
    extras.push(roundBox(0, s.belt + 0.95, -s.L / 2 + 0.05, 0.08, 0.08, 0.7, 0.03));
  }
  if (s.cabover && s.box && !s.twoTone) {
    // ladder rails on the fire engine
    extras.push(mirrorX(roundBox(0.55, s.box[2] + 0.12, -1.0, 0.04, 0.05, 3.2, 0.02)));
    for (let z = -4.0; z <= 2.0; z += 0.5) extras.push(roundBox(0, s.box[2] + 0.12, z, 0.55, 0.025, 0.025, 0.012));
  }
  return (x, y, z) => {
    let d = smin(parts[0](x, y, z), parts[1](x, y, z), s.cabover ? 0.05 : 0.04);
    if (parts[2]) d = smin(d, parts[2](x, y, z), 0.04);
    d = smin(d, fenders(x, y, z), 0.14);
    for (const e of extras) if (!e.bound || e.bound(x, y, z) < d) d = Math.min(d, e(x, y, z));
    // wheel arches (cut only through the outer shell so the wells stay closed)
    for (const za of axles) {
      const arch = smax(hyp2(z - za, y - s.Rw) - (s.Rw + 0.075), (W2 - 0.4) - Math.abs(x), 0.02);
      d = smax(d, -arch, 0.03);
    }
    // pickup bed
    if (s.bed) {
      const [zf, zr, floor] = s.bed;
      const cav = roundBox(0, floor + 1.0, (zf + zr) / 2, W2 - 0.08, 1.0, (zf - zr) / 2, 0.03)(x, y, z);
      d = smax(d, -cav, 0.02);
    }
    return d;
  };
}

// ------------------------------------------------------------ materials
const BODY_GLSL = /* glsl */ `
uniform vec3 uPaint, uPaint2;
uniform float uMetal, uLights, uBrake, uSirenR, uSirenB, uLivery, uTint, uLightK, uClear, uRust, uDirt, uWet;
float sbFlake = 0.0;
uniform vec4 uCab, uCabZ, uBody, uAxle, uHead, uTail, uMisc, uBar;
varying vec3 vCarP; varying vec3 vCarN;
vec3 sbAlb; vec3 sbEmit; float sbRough, sbMetal, sbCoat, sbGlassK;
float sbHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sbNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sbHash(i), sbHash(i + vec3(1,0,0)), f.x), mix(sbHash(i + vec3(0,1,0)), sbHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sbHash(i + vec3(0,0,1)), sbHash(i + vec3(1,0,1)), f.x), mix(sbHash(i + vec3(0,1,1)), sbHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sbRect(vec2 p, vec2 c, vec2 hs, float r){ vec2 q = abs(p - c) - hs + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sbGap(float d){ float aa = fwidth(d) * 1.5 + 1e-4; return 1.0 - smoothstep(0.0025, 0.0025 + aa, abs(d)); }
void sbPlate(vec2 p, vec2 c){
  float pl = sbRect(p, c, vec2(0.26, 0.062), 0.012);
  if (pl < 0.0){ sbAlb = vec3(0.72, 0.73, 0.74); sbRough = 0.45; sbMetal = 0.0; sbCoat = 0.0;
    if (abs(p.y - c.y + 0.005) < 0.024 && abs(p.x - c.x) < 0.2 && fract((p.x - c.x) * 16.0) < 0.62) sbAlb = vec3(0.04, 0.06, 0.16); }
}
void sbZones(){
  vec3 n = normalize(vCarN); vec3 p = vCarP; float ax = abs(p.x);
  float belt = uCab.x, roof = uCab.y;
  float doorF = uAxle.x - uAxle.z - 0.14;
  sbAlb = uPaint; sbRough = mix(0.3, 0.36, uMetal); sbMetal = uMetal * 0.6; sbCoat = 1.0; sbEmit = vec3(0.0); sbGlassK = 0.0;
  bool paint = true;
  // liveries
  if (uLivery > 0.5 && uLivery < 1.5 && ((p.z < doorF && p.z > uMisc.w + 0.0 && p.y < belt && p.y > uBody.w + 0.16) || p.y > belt + 0.02)) sbAlb = uPaint2;
  if (uBar.z > 0.0 && abs(p.y - uBar.z) < 0.1) sbAlb = uPaint2;
  if (uBar.w > 0.5 && p.z < uCabZ.z - 0.05 && p.y > belt - 0.5) sbAlb = uPaint2;
  // lower trim, skirts and underside
  if (p.y < uBody.w + 0.05 || n.y < -0.55) { sbAlb = vec3(0.022); sbRough = 0.75; sbMetal = 0.0; sbCoat = 0.0; paint = false; }
  // wheel wells
  float dW = min(length(vec2(p.z - uAxle.x, p.y - uAxle.z)), length(vec2(p.z - uAxle.y, p.y - uAxle.z)));
  if (dW < uAxle.z + 0.09 && ax < uBody.x - 0.012) { sbAlb = vec3(0.01); sbRough = 0.92; sbMetal = 0.0; sbCoat = 0.0; paint = false; }
  // greenhouse: windscreen, rear window, side glass, pillars and trim
  if (p.y > belt + 0.02 && p.y < roof + 0.01) {
    float tw = clamp((p.y - belt) / (roof - belt), 0.0, 1.0);
    float zws = mix(uCabZ.x, uCabZ.y, tw), zrw = mix(uCabZ.z, uCabZ.w, tw);
    float hwc = uCab.z - (p.y - belt) * uCab.w;
    bool glass = false, trim = false;
    if (p.y < roof - 0.025) {
      if (p.z > zws - 0.1 && n.z > 0.15) { glass = ax < hwc - 0.09; trim = !glass && ax < hwc - 0.065; }
      else if (p.z < zrw + 0.1 && n.z < -0.15) { glass = ax < hwc - 0.1; trim = !glass && ax < hwc - 0.075; }
      else if (abs(n.x) > 0.3 && n.y < 0.85) {
        float zf = zws - 0.11, zr = max(zrw + 0.14, uMisc.x), yt = roof - 0.07;
        float edge = min(min(zf - p.z, p.z - zr), yt - p.y);
        if (edge > 0.0) { glass = edge > 0.016 && abs(p.z - uAxle.w) > 0.045; trim = !glass; }
      }
    }
    if (glass) { sbGlassK = 1.0; sbAlb = vec3(0.01, 0.012, 0.014) * (1.0 - uTint * 0.8) + vec3(0.03, 0.035, 0.04) * (1.0 - uTint) * step(p.y, belt + (roof - belt) * 0.45); sbRough = 0.025; sbMetal = 0.0; sbCoat = 1.0; paint = false; }
    else if (trim) { sbAlb = vec3(0.018); sbRough = 0.3; sbMetal = 0.0; sbCoat = 0.6; paint = false; }
  }
  // front: headlights, grille, plate
  if (n.z > 0.25 && p.z > uBody.y - 0.6) {
    vec2 hp = vec2(ax, p.y) - uHead.xy;
    hp.y -= hp.x * 0.18; // lamps sweep up toward the corners
    float hl = sbRect(hp, vec2(0.0), uHead.zw, 0.025);
    if (hl < 0.0){
      float led = abs(hp.y - uHead.w * 0.55) < uHead.w * 0.22 && abs(hp.x) < uHead.z * 0.85 ? 1.0 : 0.0;
      float proj = length(hp - vec2(-uHead.z * 0.45, -uHead.w * 0.15)) < uHead.w * 0.55 ? 1.0 : 0.0;
      sbAlb = vec3(0.5); sbMetal = 0.95; sbRough = 0.05; sbCoat = 1.0; paint = false;
      if (proj > 0.5) { sbAlb = vec3(0.04); sbMetal = 0.0; sbRough = 0.02; }
      sbEmit = vec3(1.0, 0.96, 0.9) * (led * (1.2 + uLights * 6.0) + proj * uLights * 12.0 + 0.04 * (1.0 - led)) * uLightK;
    } else if (hl < 0.008) { sbAlb = vec3(0.06); sbRough = 0.25; sbMetal = 0.6; paint = false; }
    vec2 gc = vec2(0.0, uHead.y - uHead.w - 0.075);
    float gr = sbRect(p.xy, gc, vec2(uMisc.z, 0.075), 0.03);
    if (gr < 0.0) { float m = step(0.45, fract(p.x * 30.0)) * step(0.45, fract(p.y * 30.0 + step(0.5, fract(p.x * 15.0)) * 0.5));
      sbAlb = vec3(0.012 + m * 0.035); sbRough = 0.5; sbMetal = 0.4; sbCoat = 0.0; paint = false; }
    else if (gr < 0.014) { sbAlb = vec3(0.7); sbMetal = 1.0; sbRough = 0.12; paint = false; }
    sbPlate(p.xy, vec2(0.0, uBody.w + 0.2));
  }
  // rear: tail lights and plate
  if (n.z < -0.25 && p.z < uBody.z + 0.6) {
    float tl = sbRect(vec2(ax, p.y), uTail.xy, uTail.zw, 0.025);
    if (tl < 0.0) { sbAlb = vec3(0.22, 0.008, 0.008); sbRough = 0.08; sbMetal = 0.1; sbCoat = 1.0; paint = false;
      float inner = sbRect(vec2(ax, p.y), uTail.xy, uTail.zw - 0.025, 0.02);
      sbEmit = vec3(1.0, 0.03, 0.015) * ((inner < 0.0 ? 1.0 : 0.35) * (0.2 + uLights * 1.6 + uBrake * 5.0)); }
    sbPlate(p.xy, vec2(0.0, uBody.w + 0.38));
  }
  // roof equipment: siren bar / taxi sign
  if (uBar.x > 0.0 && p.y > uBar.x) {
    if (uBar.y < 1.5) { bool l = p.x < 0.0; sbAlb = l ? vec3(0.3, 0.01, 0.01) : vec3(0.01, 0.02, 0.3); sbRough = 0.08; sbMetal = 0.0; sbCoat = 1.0;
      sbEmit = l ? vec3(1.0, 0.02, 0.02) * uSirenR * 9.0 : vec3(0.05, 0.18, 1.0) * uSirenB * 9.0; }
    else { sbAlb = vec3(0.9, 0.85, 0.6); sbRough = 0.2; sbCoat = 0.5; sbMetal = 0.0; sbEmit = vec3(1.0, 0.8, 0.3) * (0.15 + uLights * 2.5); }
    paint = false;
  }
  // old paint: rust from the sills and arches up, a sun-faded, chalky top
  if (paint && uRust > 0.0) {
    float rn = sbNoise(p * 7.0) * 0.6 + sbNoise(p * 23.0) * 0.4;
    float low = clamp(1.0 - (p.y - uBody.w) / 0.45, 0.0, 1.0) + clamp(1.0 - dW / (uAxle.z + 0.25), 0.0, 1.0) * 0.6;
    float th = 0.66 - uRust * 0.16 - low * 0.22;
    float r = smoothstep(th, th + 0.05, rn);
    sbCoat *= 1.0 - uRust * 0.85; sbRough = mix(sbRough, 0.72, uRust * 0.8); sbMetal *= 1.0 - uRust * 0.7;
    if (n.y > 0.5) sbAlb = mix(sbAlb, sbAlb * 0.75 + 0.1, uRust * 0.55);
    sbAlb = mix(sbAlb, mix(vec3(0.13, 0.05, 0.018), vec3(0.32, 0.13, 0.04), sbNoise(p * 70.0)), r);
    sbRough = mix(sbRough, 0.95, r); sbMetal *= 1.0 - r; sbCoat *= 1.0 - r;
    if (r > 0.5) paint = false;
  }
  // door handles
  if (paint && abs(n.x) > 0.6 && abs(p.y - (belt - 0.085)) < 0.017) {
    if (abs(p.z - (uAxle.w > -50.0 ? uAxle.w - 0.22 : doorF - 0.85)) < 0.075 || (uMisc.w < 50.0 && abs(p.z - (uMisc.w + 0.22 + 0.12)) < 0.075 && false)) { sbAlb = vec3(0.55); sbMetal = 1.0; sbRough = 0.18; paint = false; }
  }
  // panel gaps: doors, hood, boot
  if (paint) {
    float g = 0.0;
    if (abs(n.x) > 0.45 && p.y > uBody.w + 0.12 && p.y < belt + 0.01) {
      g = max(g, sbGap(p.z - doorF));
      if (uAxle.w > -50.0) g = max(g, sbGap(p.z - uAxle.w));
      if (uMisc.w < 50.0) g = max(g, sbGap(p.z - uMisc.w));
    }
    if (n.y > 0.35 && p.y < belt + 0.02) {
      if (p.z > uCabZ.x) { g = max(g, sbGap(p.z - uCabZ.x - 0.07) * step(ax, uBody.x - 0.1)); g = max(g, sbGap(ax - uBody.x + 0.1) * step(uCabZ.x + 0.07, p.z)); }
      if (p.z < uCabZ.z && uMisc.y > 0.5) { g = max(g, sbGap(p.z - uCabZ.z + 0.07) * step(ax, uBody.x - 0.1)); g = max(g, sbGap(ax - uBody.x + 0.1) * step(p.z, uCabZ.z - 0.07)); }
    }
    sbAlb *= 1.0 - g * 0.9; sbCoat *= 1.0 - g; sbRough = mix(sbRough, 0.8, g);
  }
  // metallic paint: flakes under the clear coat, tiny mirrors at random angles (a sparkle in the sun)
  if (paint && uMetal > 0.3) sbFlake = uMetal;
  // dirt: road film and dust from the sills up, mud thrown up behind the wheels; the roof and bonnet
  // only gather it once the car's really filthy. Mud when it's wet, dust when it's dry
  if (uDirt > 0.0) {
    float dn = sbNoise(p * 9.0) * 0.6 + sbNoise(p * 31.0) * 0.4;
    float low = clamp(1.0 - (p.y - uBody.w) / 0.55, 0.0, 1.0);
    float spray = clamp(1.0 - dW / (uAxle.z + 0.55), 0.0, 1.0) * step(p.y, uAxle.z * 2.2 + uBody.w);
    float top = n.y > 0.6 ? 0.2 : 0.0;
    float m = clamp((low * 0.9 + spray * 0.8 + top) * uDirt * 1.6 - (1.0 - dn) * 0.55, 0.0, 1.0);
    if (sbGlassK > 0.5) {
      // a film of dust on the glass, but not in the arcs the wipers sweep on the windscreen
      float wipe = 0.0;
      if (n.z > 0.15) { vec2 q = vec2(ax - 0.32, p.y - belt); wipe = step(length(q), (roof - belt) * 0.95) * step(0.0, q.y); }
      sbAlb = mix(sbAlb, vec3(0.16, 0.14, 0.11), m * 0.6 * (1.0 - wipe)); sbRough = mix(sbRough, 0.6, m * (1.0 - wipe));
    } else {
      vec3 dirtC = mix(vec3(0.33, 0.28, 0.21), vec3(0.19, 0.14, 0.09), uWet);
      sbAlb = mix(sbAlb, dirtC, m); sbRough = mix(sbRough, mix(0.9, 0.5, uWet), m); sbCoat *= 1.0 - m * 0.9; sbMetal *= 1.0 - m; sbFlake *= 1.0 - m;
    }
  }
  // rain: beads of water standing on the glass and the paint
  if (uWet > 0.05 && n.y > -0.2) {
    vec3 c = p * 38.0; vec3 ci = floor(c); float h = sbHash(ci);
    float rr = length(fract(c) - 0.5 - (vec3(sbHash(ci + 3.1), sbHash(ci + 7.7), sbHash(ci + 1.3)) - 0.5) * 0.4);
    float bead = (1.0 - smoothstep(0.08 + h * 0.12, 0.12 + h * 0.14, rr)) * step(0.35, h) * uWet;
    if (sbGlassK > 0.5) { sbAlb += vec3(0.05, 0.055, 0.06) * bead; sbRough = mix(sbRough, 0.1, bead); }
    else { sbRough = mix(sbRough, 0.04, bead); sbCoat = max(sbCoat, bead); }
  }
}
`;

function bodyUniforms(s) {
  const V4 = (a, b, c, d) => ({ value: new THREE.Vector4(a, b, c, d) });
  return {
    uPaint: { value: new THREE.Color(0.6, 0.6, 0.62) }, uPaint2: { value: new THREE.Color(0.85, 0.85, 0.85) },
    uMetal: { value: 0.5 }, uLights: { value: 0 }, uBrake: { value: 0 }, uSirenR: { value: 0 }, uSirenB: { value: 0 },
    uLivery: { value: s.livery || 0 }, uTint: { value: 0.2 }, uLightK: { value: 1 },
    uCab: V4(s.belt, s.roof, s.hwc, s.tumble), uCabZ: V4(s.zA0, s.zA1, s.zC0, s.zC1),
    uBody: V4(s.W / 2, s.L / 2, -s.L / 2, s.ride), uAxle: V4(s.axF, s.axR, s.Rw, s.zB),
    uHead: V4(...s.head), uTail: V4(...s.tail4),
    uMisc: V4(s.glassBack, s.box ? 0 : 1, s.grille, s.doorR),
    uBar: V4(s.bar ? s.roof + 0.008 : 0, s.bar === 'taxi' ? 2 : 1, s.stripe || 0, s.twoTone ? 1 : 0),
    uClear: { value: 0 }, uRust: { value: s.rust || 0 },
    uDirt: { value: 0 }, uWet: worldUniforms.uWet, // (shared: the weather's wetness)
  };
}

export { getWheelMaterial };
// mode: undefined = closed shell (painted glass), 'cabin' = the glass is cut out
// (when uClear is on) and the inside of the shell is trimmed like an interior,
// 'glass' = only the windows, see-through. Pass `u` to share another
// material's uniforms (paint, lights) with this one.
export function makeBodyMaterial(s, physical, mode, u) {
  const Mat = physical || mode === 'glass' ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Mat({ color: 0xffffff, roughness: 0.35, metalness: 0.3, ...(physical || mode === 'glass' ? { clearcoat: 1, clearcoatRoughness: 0.04 } : {}) });
  m.name = 'carbody';
  m.userData.u = u || bodyUniforms(s);
  if (mode === 'cabin') m.side = THREE.DoubleSide;
  if (mode === 'glass') { m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide; }
  const zones = mode === 'glass'
    ? `#include <color_fragment>
sbZones();
if (sbGlassK < 0.5) discard;
{ float fr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 4.0);
  float a = 0.14 + uTint * 0.5;
  if (uAxle.w > -50.0 && vCarP.z < uAxle.w - 0.05 && uTint > 0.3) a += 0.25; // privacy glass in the back
  // edge-on glass turns into a mirror of the sky, not a black sheet
  diffuseColor.rgb = mix(vec3(0.012, 0.014, 0.016), vec3(0.32, 0.35, 0.39), fr); diffuseColor.a = mix(a, 0.5, fr); }`
    : mode === 'cabin'
      ? `#include <color_fragment>
sbZones();
if (uClear > 0.5) {
  if (sbGlassK > 0.5) discard;
  if (!gl_FrontFacing) {
    // inside of the shell: headliner, door cards with an armrest band, carpet
    float yy = vCarP.y;
    sbAlb = yy > uCab.x + 0.03 ? vec3(0.3, 0.29, 0.27) : yy < uBody.w + 0.14 ? vec3(0.022) : abs(yy - (uCab.x - 0.17)) < 0.03 ? vec3(0.085, 0.082, 0.078) : vec3(0.04);
    sbRough = 0.92; sbMetal = 0.0; sbCoat = 0.0; sbEmit = vec3(0.0);
  }
}
diffuseColor.rgb = sbAlb;`
      : '#include <color_fragment>\nsbZones();\ndiffuseColor.rgb = sbAlb;';
  m.onBeforeCompile = function (shader) {
    Object.assign(shader.uniforms, this.userData.u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarP; varying vec3 vCarN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarP = position; vCarN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + BODY_GLSL)
      .replace('#include <color_fragment>', zones)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = sbRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (sbFlake > 0.0) { vec3 fc = floor(vCarP * 480.0); vec3 fj = vec3(sbHash(fc), sbHash(fc + 5.3), sbHash(fc + 9.1)) - 0.5;
    normal = normalize(normal + fj * 0.32 * sbFlake * (1.0 - smoothstep(1.5, 7.0, length(vViewPosition)))); }`)
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = sbMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sbEmit;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= sbCoat;\n#endif');
  };
  m.customProgramCacheKey = () => 'sbcarbody' + (physical || mode === 'glass' ? 'p' : 's') + (mode || '');
  return m;
}
// shadow pass for the cabin shell: sunlight comes in through the windows
export function makeCabinDepthMaterial(u) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.userData.u = u;
  m.onBeforeCompile = function (shader) {
    Object.assign(shader.uniforms, this.userData.u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarP; varying vec3 vCarN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarP = position; vCarN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPaint, uPaint2;\n' + BODY_GLSL.replace('uniform vec3 uPaint, uPaint2;', ''))
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nsbZones();\nif (uClear > 0.5 && sbGlassK > 0.5) discard;');
  };
  m.customProgramCacheKey = () => 'sbcabdepth';
  return m;
}

// ------------------------------------------------------------ wheels
// Three levels of detail. A full wheel (lathed tyre, bevelled spoked rim, barrel, hub, disc and
// caliper) is ~20k triangles; four of them were most of a car, and most of every street's
// triangles. Past ~10 m the medium wheel keeps the spokes with coarser curves and no bevels; past
// ~35 m the low wheel is a tyre and a rim face, ~100 triangles.
export const WHEEL_LOD = [0, 10, 35];
const wheelCache = new Map();
export function wheelGeometry(s, spokesOverride, level = 0) {
  const key = `${s.Rw}|${s.tw}|${spokesOverride ?? s.spokes}|${level}`;
  if (wheelCache.has(key)) return wheelCache.get(key);
  const g = wheelGeometryRaw({ ...s, spokes: spokesOverride ?? s.spokes }, level);
  wheelCache.set(key, g);
  return g;
}
function wheelGeometryRaw(s, level = 0) {
  const R = s.Rw, w = s.tw, rr = R * 0.68;
  const D = [{ lathe: 48, curve: 40, bevel: 2, barrel: 40, hub: 20, disc: 36 }, { lathe: 22, curve: 10, bevel: 0, barrel: 14, hub: 8, disc: 12 }][level] || null;
  const parts = [];
  const paint = (g, col, rough, metal) => {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3), rm = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; rm[i * 2] = rough; rm[i * 2 + 1] = metal; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
    parts.push(g);
  };
  // tyre: lathed cross-section with rounded shoulders and sidewall bulge
  const prof = [[rr - 0.005, -w / 2 + 0.01], [R - 0.06, -w / 2 - 0.006], [R - 0.022, -w / 2 + 0.008], [R - 0.004, -w / 2 + 0.035],
    [R, -w / 4], [R, w / 4], [R - 0.004, w / 2 - 0.035], [R - 0.022, w / 2 - 0.008], [R - 0.06, w / 2 + 0.006], [rr - 0.005, w / 2 - 0.01]];
  if (!D) {
    // far away: a tyre (four profile points) and a flat rim face in the rim's colour
    const lp = [[rr, -w / 2], [R - 0.03, -w / 2], [R, 0], [R - 0.03, w / 2], [rr, w / 2]];
    const t = new THREE.LatheGeometry(lp.map(([r, y]) => new THREE.Vector2(r, y)), 10); t.rotateZ(-Math.PI / 2);
    paint(t, [0.028, 0.028, 0.03], 0.88, 0);
    const f = new THREE.CircleGeometry(rr, 10); f.rotateY(Math.PI / 2); f.translate(w / 2 - 0.03, 0, 0);
    const rimColFar = s.spokes === 0 ? [0.32, 0.33, 0.34] : (s.spokes === 5 ? [0.08, 0.08, 0.085] : s.spokes === 14 ? [0.75, 0.62, 0.3] : [0.5, 0.51, 0.53]);
    paint(f, rimColFar, 0.3, 1);
    const g = mergeGeometries(parts); g.computeBoundingSphere(); return g;
  }
  const tyre = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), D.lathe);
  tyre.rotateZ(-Math.PI / 2);
  paint(tyre, [0.028, 0.028, 0.03], 0.88, 0);
  // rim face: spokes cut from a disc (extruded with bevels)
  const face = new THREE.Shape();
  face.absarc(0, 0, rr, 0, Math.PI * 2, false);
  const spokes = s.spokes;
  if (spokes > 0) {
    const n = spokes, gap = spokes >= 14 ? 0.07 : spokes >= 10 ? 0.11 : 0.2;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + gap, a1 = ((i + 1) / n) * Math.PI * 2 - gap;
      const h = new THREE.Path();
      const ri = rr * 0.36, ro = rr * 0.88;
      h.moveTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
      h.lineTo(Math.cos(a0 + 0.03) * ro, Math.sin(a0 + 0.03) * ro);
      h.absarc(0, 0, ro, a0 + 0.03, a1 - 0.03, false);
      h.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri);
      h.absarc(0, 0, ri, a1, a0, true);
      face.holes.push(h);
    }
  } else {
    // steel wheel: ring of round vents
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, h = new THREE.Path(); h.absarc(Math.cos(a) * rr * 0.62, Math.sin(a) * rr * 0.62, rr * 0.11, 0, Math.PI * 2, true); face.holes.push(h); }
  }
  const rim = new THREE.ExtrudeGeometry(face, { depth: 0.03, bevelEnabled: D.bevel > 0, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: Math.max(1, D.bevel), curveSegments: D.curve });
  rim.rotateY(Math.PI / 2);
  rim.translate(w / 2 - 0.05, 0, 0);
  const rimCol = s.spokes === 0 ? [0.32, 0.33, 0.34] : (s.spokes === 5 ? [0.08, 0.08, 0.085] : s.spokes === 14 ? [0.75, 0.62, 0.3] : [0.62, 0.63, 0.65]);
  paint(rim, rimCol, s.spokes === 5 ? 0.35 : 0.22, 1);
  // barrel, hub, brake disc and caliper seen through the spokes
  const barrel = new THREE.CylinderGeometry(rr, rr, w * 0.86, D.barrel, 1, true); barrel.rotateZ(Math.PI / 2);
  paint(barrel, [0.25, 0.25, 0.26], 0.4, 1);
  const hub = new THREE.CylinderGeometry(rr * 0.2, rr * 0.24, 0.05, D.hub); hub.rotateZ(Math.PI / 2); hub.translate(w / 2 - 0.02, 0, 0);
  paint(hub, rimCol, 0.25, 1);
  const disc = new THREE.CylinderGeometry(rr * 0.8, rr * 0.8, 0.028, D.disc); disc.rotateZ(Math.PI / 2); disc.translate(w * 0.05, 0, 0);
  paint(disc, [0.32, 0.31, 0.3], 0.45, 1);
  const cal = new THREE.BoxGeometry(0.05, rr * 0.42, rr * 0.3); cal.translate(w * 0.12, rr * 0.55, -rr * 0.3);
  paint(cal, s.spokes === 5 ? [0.5, 0.04, 0.02] : [0.12, 0.12, 0.12], 0.4, 0.2);
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

let wheelMat = null;
function getWheelMaterial() {
  if (wheelMat) return wheelMat;
  wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  wheelMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aRM; varying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  };
  return wheelMat;
}

// ------------------------------------------------------------ public API
export const CAR_TYPES = Object.keys(P);

export function buildCar(type, quality) {
  const s = P[type] || P.sedan;
  const phone = quality && (quality.key === 'phone' || quality.key === 'low');
  const h = Math.max(phone ? 0.065 : 0.045, s.L / (phone ? 100 : 150));
  const top = Math.max(s.roof, s.box ? s.box[2] : 0) + 0.25;
  const sdf = bodySDF(s);
  const geo = surfaceNets(sdf, [-s.W / 2 - 0.3, 0.0, -s.L / 2 - 0.1], [s.W / 2 + 0.3, top, s.L / 2 + 0.1], h);
  const root = new THREE.Group();
  const mat = makeBodyMaterial(s, quality ? quality.physicalPaint !== false : true);
  const hi = new THREE.Mesh(geo, mat);
  const lo = new THREE.Mesh(surfaceNets(sdf, [-s.W / 2 - 0.3, 0.0, -s.L / 2 - 0.1], [s.W / 2 + 0.3, top, s.L / 2 + 0.1], Math.max(0.11, s.L / 60)), mat);
  hi.castShadow = lo.castShadow = true; hi.receiveShadow = lo.receiveShadow = true;
  hi.userData.shell = lo.userData.shell = true;
  const body = new THREE.LOD();
  // up close: the same shell with the glass cut out and a real interior inside
  const L = quality && quality.key === 'phone' ? null : cabinLayout(s); // phones keep the tinted shell
  if (L) {
    const cab = new THREE.Mesh(geo, mat);
    cab.name = 'cabin'; cab.castShadow = cab.receiveShadow = true; cab.userData.shell = true;
    const glass = new THREE.Mesh(geo, mat); glass.name = 'cabin-glass'; glass.userData.noHit = true; glass.renderOrder = 2;
    const inner = new THREE.Mesh(buildInterior(s), getWheelMaterial()); inner.name = 'cabin-int'; inner.userData.noHit = true; inner.receiveShadow = true;
    const wheel = new THREE.Group(); wheel.name = 'cabin-wheel'; wheel.position.set(L.wheel.x, L.wheel.y, L.wheel.z); wheel.rotation.x = L.wheel.tau;
    const spin = new THREE.Mesh(wheelGeometryCab(), getWheelMaterial()); spin.name = 'cabin-spin'; spin.userData.noHit = true; spin.receiveShadow = true; wheel.add(spin);
    const { dialMat, needleMat } = dialMaterials();
    const dials = new THREE.Group(); dials.name = 'cabin-dials';
    dials.position.set(L.dx, L.wheel.y + 0.04, L.dashZ - 0.004); dials.rotation.set(0.3, Math.PI, 0);
    const face = new THREE.Mesh(dialGeometry(), dialMat); face.userData.noHit = true; dials.add(face);
    const ng = new THREE.BoxGeometry(0.0035, 0.047, 0.002).translate(0, 0.019, 0);
    for (const [nm, x] of [['needle-spd', 0.075], ['needle-rpm', -0.075]]) {
      const nd = new THREE.Mesh(ng, needleMat); nd.name = nm; nd.position.set(x, 0, 0.003); nd.rotation.z = 0.75 * Math.PI; nd.userData.noHit = true; nd.visible = false; dials.add(nd);
    }
    cab.add(glass, inner, wheel, dials);
    body.addLevel(cab, 0);
    body.addLevel(hi, 22);
  } else body.addLevel(hi, 0);
  body.addLevel(lo, phone ? 25 : 45);
  // far away a car is a few dozen pixels: a coarse shell, ~1/5 of the low one, and no shadow detail lost
  const far = new THREE.Mesh(surfaceNets(sdf, [-s.W / 2 - 0.3, 0.0, -s.L / 2 - 0.1], [s.W / 2 + 0.3, top, s.L / 2 + 0.1], Math.max(0.2, s.L / 26)), mat);
  far.castShadow = far.receiveShadow = true; far.userData.shell = true;
  body.addLevel(far, phone ? 60 : 95);
  body.name = 'body';
  body.material = mat; // shared by both levels
  root.add(body);
  const wgs = WHEEL_LOD.map((_, i) => wheelGeometry(s, undefined, i));
  const wm = getWheelMaterial();
  const wx = s.W / 2 - s.tw / 2 - 0.035;
  for (const [fz, fb] of [[s.axF, 'front'], [s.axR, 'back']]) {
    for (const side of ['left', 'right']) {
      const node = new THREE.Group();
      node.name = `wheel-${fb}-${side}`;
      node.position.set(side === 'right' ? wx : -wx, s.Rw, fz);
      if (side === 'left') node.rotation.y = Math.PI;
      const lod = new THREE.LOD();
      wgs.forEach((g, i) => { const m = new THREE.Mesh(g, wm); m.castShadow = i < 2; m.userData.noWear = true; lod.addLevel(m, WHEEL_LOD[i], 0.1); });
      node.add(lod);
      root.add(node);
    }
  }
  root.userData.procedural = true;
  root.userData.spec = s;
  return root;
}

// Real-world paint mix seen on US roads (white/black/grey/silver dominate).
const PAINTS = [
  [0.80, 0.80, 0.78, 0.0, 22], [0.012, 0.012, 0.014, 0.3, 18], [0.12, 0.125, 0.13, 0.6, 15], [0.42, 0.43, 0.45, 1.0, 13],
  [0.012, 0.035, 0.11, 0.7, 8], [0.32, 0.012, 0.012, 0.4, 8], [0.36, 0.28, 0.19, 0.6, 3], [0.03, 0.08, 0.045, 0.6, 2],
  [0.06, 0.1, 0.16, 0.8, 4], [0.5, 0.18, 0.02, 0.3, 2], [0.2, 0.2, 0.19, 0.0, 5],
];
export function randomPaint(rnd = Math.random) {
  let t = rnd() * PAINTS.reduce((a, p) => a + p[4], 0);
  for (const p of PAINTS) if ((t -= p[4]) <= 0) return p;
  return PAINTS[0];
}
export const FIXED_PAINT = {
  taxi: [0.62, 0.42, 0.02, 0.0], police: [0.01, 0.01, 0.012, 0.2], ambulance: [0.8, 0.8, 0.78, 0.0], firetruck: [0.45, 0.012, 0.01, 0.3],
  'garbage-truck': [0.04, 0.16, 0.06, 0.2], delivery: [0.82, 0.82, 0.8, 0.0], 'sedan-sports': [0.55, 0.06, 0.01, 0.7],
  'rusty-pickup': [0.2, 0.3, 0.31, 0.05],
};
export const SECOND_PAINT = { police: [0.85, 0.85, 0.85], ambulance: [0.5, 0.01, 0.01], firetruck: [0.85, 0.85, 0.8], 'garbage-truck': [0.75, 0.75, 0.72], delivery: [0.04, 0.12, 0.35] };
export { surfaceNets, smax, smin, roundBox, block, profile, mirrorX, hyp2, hyp3 };
