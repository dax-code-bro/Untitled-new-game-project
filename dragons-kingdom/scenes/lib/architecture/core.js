// Architecture kit - core: seeded randomness, noise, and a fast geometry accumulator.
//
// Every building is generated into a few accumulators (one per material: stone, mortar, oak,
// plaster, tiles, iron, glass ...) in the building's local frame, optionally deformed as a whole
// (lean, ridge sag, settling), and only then turned into one BufferGeometry per material - a
// house is a handful of draw calls however many stones, pegs and tiles it has.
//
// Vertex layout shared by every kit material (see materials.js):
//   position, normal (computed after deformation), uv (metres, meaning depends on the piece)
//   aInfo  vec4: x = piece seed (0..1), y = baked occlusion (1 open .. 0 buried), z = arris
//                (0 flat face .. 1 on a rounded edge), w = height above the building's footing (m)
//   aAxis  vec3: the piece's grain / bedding direction (timber: along the beam; tiles: down the slope)
import * as THREE from 'three';

// ------------------------------------------------------------------ random --
export function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A seeded generator with helpers. */
export function makeRand(seed) {
  const r = mulberry(Math.floor(seed * 7919 + 13));
  const R = () => r();
  R.range = (a, b) => a + (b - a) * r();
  R.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  R.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  R.chance = (p) => r() < p;
  R.sym = (a) => (r() * 2 - 1) * a;                        // uniform in [-a, a]
  R.gauss = (s = 1) => { let u = 0; for (let i = 0; i < 4; i++) u += r(); return (u - 2) * 1.732 * s; };
  R.fork = (k = 0) => makeRand(r() * 1e6 + k);
  return R;
}
/** Stateless hash of up to 3 integers -> [0, 1). */
export function hash3(ix, iy = 0, iz = 0) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(iz | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** 3D value noise in [0, 1]. */
export function vnoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz), b = hash3(ix + 1, iy, iz), c = hash3(ix, iy + 1, iz), d = hash3(ix + 1, iy + 1, iz);
  const e = hash3(ix, iy, iz + 1), f = hash3(ix + 1, iy, iz + 1), g = hash3(ix, iy + 1, iz + 1), h = hash3(ix + 1, iy + 1, iz + 1);
  const x0 = a + (b - a) * fx, x1 = c + (d - c) * fx, x2 = e + (f - e) * fx, x3 = g + (h - g) * fx;
  const y0 = x0 + (x1 - x0) * fy, y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}
/** fbm in about [-1, 1]. */
export function fbm3(x, y, z, oct = 3) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += (vnoise3(x * f + i * 17.3, y * f - i * 9.1, z * f + i * 5.7) * 2 - 1) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ frames --
/**
 * A local frame: origin + three axes (not necessarily unit or orthogonal - a frame may shear).
 * F = [ox, oy, oz, xx, xy, xz, yx, yy, yz, zx, zy, zz]; local (a, b, c) -> o + a X + b Y + c Z.
 */
export function frame(o = [0, 0, 0], X = [1, 0, 0], Y = [0, 1, 0], Z = null) {
  if (!Z) Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  return [o[0], o[1], o[2], X[0], X[1], X[2], Y[0], Y[1], Y[2], Z[0], Z[1], Z[2]];
}
/** Frame rotated by yaw (about +y) at o. */
export function yawFrame(o, yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); return frame(o, [c, 0, -s], [0, 1, 0], [s, 0, c]); }
/** Frame with x along dir (unit), y as close to `up` as possible. */
export function axisFrame(o, dir, up = [0, 1, 0]) {
  const X = norm(dir);
  let Z = cross(X, up);
  if (len(Z) < 1e-5) Z = cross(X, [1, 0, 0]);
  Z = norm(Z);
  const Y = cross(Z, X);
  return frame(o, X, Y, Z);
}
/** Child frame: a local frame expressed inside a parent frame. */
export function sub(P, o = [0, 0, 0], X = [1, 0, 0], Y = [0, 1, 0], Z = null) {
  const L = frame(o, X, Y, Z);
  const pt = xf(P, L[0], L[1], L[2]);
  const d = (v0, v1, v2) => [P[3] * v0 + P[6] * v1 + P[9] * v2, P[4] * v0 + P[7] * v1 + P[10] * v2, P[5] * v0 + P[8] * v1 + P[11] * v2];
  return [...pt, ...d(L[3], L[4], L[5]), ...d(L[6], L[7], L[8]), ...d(L[9], L[10], L[11])];
}
export function xf(F, a, b, c) { return [F[0] + a * F[3] + b * F[6] + c * F[9], F[1] + a * F[4] + b * F[7] + c * F[10], F[2] + a * F[5] + b * F[8] + c * F[11]]; }
export function xd(F, a, b, c) { return [a * F[3] + b * F[6] + c * F[9], a * F[4] + b * F[7] + c * F[10], a * F[5] + b * F[8] + c * F[11]]; }
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const subv = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// ------------------------------------------------------------- accumulator --
class Grow {
  constructor(n, T = Float32Array) { this.a = new T(n); this.n = 0; this.T = T; }
  push(...v) { if (this.n + v.length > this.a.length) this.grow(v.length); for (let i = 0; i < v.length; i++) this.a[this.n++] = v[i]; }
  grow(k) { const b = new this.T(Math.max(this.a.length * 2, this.n + k + 16)); b.set(this.a.subarray(0, this.n)); this.a = b; }
  view() { return this.a.subarray(0, this.n); }
}

/** Accumulates triangles for one material. */
export class Acc {
  constructor(name = '') {
    this.name = name;
    this.P = new Grow(3 * 4096); this.U = new Grow(2 * 4096); this.I = new Grow(4 * 4096); this.A = new Grow(3 * 4096);
    this.X = new Grow(3 * 8192, Uint32Array);
    this.baseY = 0;            // world y of the footing: aInfo.w = y - baseY
    this.groups = [];          // [{ start, count, tag }] optional triangle ranges (damage, culling)
  }
  get vcount() { return this.P.n / 3; }
  get tcount() { return this.X.n / 3; }
  /** Push one vertex; returns its index. info = [seed, ao, arris]; axis = [x, y, z]. */
  v(x, y, z, u, w, s, ao, ar, ax, ay, az) {
    const P = this.P; if (P.n + 3 > P.a.length) P.grow(3);
    P.a[P.n++] = x; P.a[P.n++] = y; P.a[P.n++] = z;
    const U = this.U; if (U.n + 2 > U.a.length) U.grow(2);
    U.a[U.n++] = u; U.a[U.n++] = w;
    const I = this.I; if (I.n + 4 > I.a.length) I.grow(4);
    I.a[I.n++] = s; I.a[I.n++] = ao; I.a[I.n++] = ar; I.a[I.n++] = y - this.baseY;
    const A = this.A; if (A.n + 3 > A.a.length) A.grow(3);
    A.a[A.n++] = ax; A.a[A.n++] = ay; A.a[A.n++] = az;
    return this.P.n / 3 - 1;
  }
  t(a, b, c) { const X = this.X; if (X.n + 3 > X.a.length) X.grow(3); X.a[X.n++] = a; X.a[X.n++] = b; X.a[X.n++] = c; }
  q(a, b, c, d) { this.t(a, b, c); this.t(a, c, d); }
  /** Mark the triangles added since `start` (a tcount) with a tag (for later damage / hiding). */
  group(startTri, tag) { this.groups.push({ start: startTri * 3, count: (this.tcount - startTri) * 3, tag }); }
  /** Apply a deformation (x, y, z) -> [x, y, z] to every vertex added so far (or from `from`). */
  deform(fn, from = 0) {
    const a = this.P.a;
    for (let i = from * 3; i < this.P.n; i += 3) { const r = fn(a[i], a[i + 1], a[i + 2]); a[i] = r[0]; a[i + 1] = r[1]; a[i + 2] = r[2]; }
  }
  /** Transform the vertices from index `from` by frame F (positions; aAxis as directions). */
  transform(F, from = 0) {
    const a = this.P.a, ax = this.A.a;
    for (let i = from * 3; i < this.P.n; i += 3) {
      const x = a[i], y = a[i + 1], z = a[i + 2];
      a[i] = F[0] + x * F[3] + y * F[6] + z * F[9]; a[i + 1] = F[1] + x * F[4] + y * F[7] + z * F[10]; a[i + 2] = F[2] + x * F[5] + y * F[8] + z * F[11];
      const u = ax[i], v = ax[i + 1], w = ax[i + 2];
      ax[i] = u * F[3] + v * F[6] + w * F[9]; ax[i + 1] = u * F[4] + v * F[7] + w * F[10]; ax[i + 2] = u * F[5] + v * F[8] + w * F[11];
    }
    // height above the footing follows the new positions
    const I = this.I.a;
    for (let i = from, k = from * 3; k < this.P.n; i++, k += 3) I[i * 4 + 3] = a[k + 1] - this.baseY;
  }
  /** Append another accumulator's content. */
  append(o) {
    const base = this.vcount;
    const cp = (dst, src) => { if (dst.n + src.n > dst.a.length) dst.grow(src.n); dst.a.set(src.a.subarray(0, src.n), dst.n); dst.n += src.n; };
    cp(this.P, o.P); cp(this.U, o.U); cp(this.I, o.I); cp(this.A, o.A);
    const X = this.X; if (X.n + o.X.n > X.a.length) X.grow(o.X.n);
    const i0 = X.n;
    for (let i = 0; i < o.X.n; i++) X.a[X.n++] = o.X.a[i] + base;
    for (const g of o.groups) this.groups.push({ start: g.start + i0, count: g.count, tag: g.tag });
  }
  /** BufferGeometry (normals computed from the final, deformed positions). */
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P.view().slice(), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.U.view().slice(), 2));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.I.view().slice(), 4));
    g.setAttribute('aAxis', new THREE.BufferAttribute(this.A.view().slice(), 3));
    const idx = this.X.view();
    g.setIndex(new THREE.BufferAttribute(this.vcount > 65535 ? idx.slice() : new Uint16Array(idx), 1));
    g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData.groups = this.groups;
    return g;
  }
}

/** A set of accumulators keyed by material name. */
export class Kit {
  constructor(baseY = 0) { this.accs = {}; this.baseY = baseY; }
  get(name) { if (!this.accs[name]) { this.accs[name] = new Acc(name); this.accs[name].baseY = this.baseY; } return this.accs[name]; }
  setBase(y) { this.baseY = y; for (const a of Object.values(this.accs)) a.baseY = y; }
  deform(fn) { for (const a of Object.values(this.accs)) a.deform(fn); }
  /** Append another kit (built in its own local frame) transformed by frame F. */
  merge(other, F = null) {
    for (const [name, acc] of Object.entries(other.accs)) {
      const dst = this.get(name);
      const from = dst.vcount;
      dst.append(acc);
      if (F) dst.transform(F, from);
    }
    return this;
  }
  /** One mesh per material; mats: { name: Material }. Returns a Group. */
  build(mats, opts = {}) {
    const grp = new THREE.Group();
    let tris = 0;
    for (const [name, acc] of Object.entries(this.accs)) {
      if (!acc.tcount) continue;
      const mat = mats[name];
      if (!mat) throw new Error(`architecture: no material "${name}"`);
      const m = new THREE.Mesh(acc.toGeometry(), mat);
      m.name = `${opts.name || 'arch'}:${name}`;
      m.castShadow = mat.userData.noShadow ? false : opts.castShadow ?? true;
      m.receiveShadow = true;
      grp.add(m);
      tris += acc.tcount;
    }
    grp.userData.tris = tris;
    return grp;
  }
}

// ------------------------------------------------------------- primitives --
const FACE_AX = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
// face k: normal axis FACE_AX[k][0] with sign FACE_AX[k][3]; in-plane axes [1], [2]
// skip bits: 1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z
function axisCoords(s, r, maxSeg, rs) {
  const h = s / 2, out = [-h];
  if (r > 1e-4) { if (rs > 1) out.push(-h + r * 0.38); out.push(-h + r); }
  const inner = s - 2 * r;
  const n = Math.max(1, Math.ceil(inner / maxSeg));
  for (let i = 1; i < n; i++) out.push(-h + r + (inner * i) / n);
  if (r > 1e-4) { out.push(h - r); if (rs > 1) out.push(h - r * 0.38); }
  out.push(h);
  return out;
}

/**
 * A rounded, irregular block (a stone, a beam, a slab) in frame F (centred, extends +-s/2).
 * o: r (edge rounding, m), rs (rounding segments 1|2), seg (max segment length, m, or [x, y, z]),
 *    skip (face bits), seed (0..1), noise (amplitude, m), nf (noise frequency, 1/m),
 *    pillow (face bulge, m), chip (arris damage, m), aoDepth (> 0: faces behind the +z face
 *    darken with depth - stones set in mortar), aoFloor, axis ([x,y,z] grain direction, local),
 *    bend (fn(lx, ly, lz) -> [dx, dy, dz] local offset: bows, sags), uvMode 'beam' | 'box',
 *    wane ([sy, sz] arris that is waney / barky, 0 none), adze (amplitude of hewing scallops, m),
 *    warp (fn(lx, ly, lz) -> [x, y, z] local position: wedges, voussoirs, worn treads)
 */
export function block(acc, F, sx, sy, sz, o = {}) {
  const r = Math.min(o.r ?? 0.01, 0.45 * Math.min(sx, sy, sz));
  const rs = o.rs ?? 1;
  const segv = Array.isArray(o.seg) ? o.seg : [o.seg ?? 0.3, o.seg ?? 0.3, o.seg ?? 0.3];
  const skipBits = o.skip ?? 0;
  const C = [axisCoords(sx, r, segv[0], rs), axisCoords(sy, r, segv[1], rs), axisCoords(sz, r, segv[2], rs)];
  // a hidden back face (-z, stones set in a wall) needs no rounding rows at the back
  if ((skipBits & 32) && r > 1e-4) { const z = C[2]; C[2] = z.filter((v, i) => i === 0 || v >= sz / 2 - r - 1e-6 || (i > 0 && v > -sz / 2 + r + 1e-6)).filter((v, i, a) => !(i === 1 && Math.abs(v - (-sz / 2 + r)) < 1e-6)); }
  const S = [sx, sy, sz], H = [sx / 2 - r, sy / 2 - r, sz / 2 - r];
  const skip = o.skip ?? 0;
  const seed = o.seed ?? 0;
  const na = o.noise ?? 0, nf = o.nf ?? 6, pil = o.pillow ?? 0, chip = o.chip ?? 0;
  const aoD = o.aoDepth ?? 0, aoF = o.aoFloor ?? 0.3;
  const bend = o.bend || null;
  const ad = o.adze ?? 0;
  const wane = o.wane || null;
  const so = seed * 131.7;
  const axL = o.axis || [1, 0, 0];
  // the pith of the log this piece was hewn from (boxed heart: near the middle; or off-centre)
  const ph1 = hash3(Math.floor(seed * 1e6), 7), ph2 = hash3(Math.floor(seed * 1e6), 11);
  const pith = o.pith || [(ph1 - 0.5) * sy * 0.9, (ph2 - 0.5) * sz * 0.9 + (ph1 > 0.7 ? sz * 0.6 : 0)];
  const AX = norm(xd(F, axL[0], axL[1], axL[2]));
  const map = new Map();
  const n1 = C[1].length, n2 = C[2].length;
  // a mirrored (left-handed) frame flips the winding
  const det = F[3] * (F[7] * F[11] - F[8] * F[10]) - F[4] * (F[6] * F[11] - F[8] * F[9]) + F[5] * (F[6] * F[10] - F[7] * F[9]);
  const mir = det < 0;
  const p = [0, 0, 0];
  // sharp blocks (no rounding) keep hard edges: their faces do not share vertices
  const hard = r <= 1e-4;
  let faceK = 0;
  const vid = (i0, i1, i2) => {
    const key = ((i0 * n1 + i1) * n2 + i2) * (hard ? 8 : 1) + (hard ? faceK : 0);
    let id = map.get(key);
    if (id !== undefined) return id;
    p[0] = C[0][i0]; p[1] = C[1][i1]; p[2] = C[2][i2];
    // rounded box: clamp to the inner box, push out by r along the offset direction
    const q0 = clamp(p[0], -H[0], H[0]), q1 = clamp(p[1], -H[1], H[1]), q2 = clamp(p[2], -H[2], H[2]);
    let d0 = p[0] - q0, d1 = p[1] - q1, d2 = p[2] - q2;
    const dl = Math.hypot(d0, d1, d2);
    let nx, ny, nz, ar = 0;
    if (dl > 1e-9) { nx = d0 / dl; ny = d1 / dl; nz = d2 / dl; ar = (Math.abs(nx) < 0.97 && Math.abs(ny) < 0.97 && Math.abs(nz) < 0.97) ? 1 : 0; }
    else { nx = 0; ny = 0; nz = 1; }
    let lx = q0 + nx * r, ly = q1 + ny * r, lz = q2 + nz * r;
    // face normal for flat vertices (dl == 0 cannot happen on the surface except degenerate r=0)
    if (dl <= 1e-9) {
      const ex = Math.abs(p[0]) / (sx / 2), ey = Math.abs(p[1]) / (sy / 2), ez = Math.abs(p[2]) / (sz / 2);
      if (ex >= ey && ex >= ez) { nx = Math.sign(p[0]); ny = 0; nz = 0; } else if (ey >= ez) { nx = 0; ny = Math.sign(p[1]); nz = 0; } else { nx = 0; ny = 0; nz = Math.sign(p[2]); }
      lx = p[0]; ly = p[1]; lz = p[2];
    }
    // displacement along the (local) normal
    let disp = 0;
    if (pil) {
      // bulge on each face, falling to 0 at the arrises
      const fx = 1 - Math.pow(Math.min(1, Math.abs(lx) / (sx / 2)), 4), fy = 1 - Math.pow(Math.min(1, Math.abs(ly) / (sy / 2)), 4), fz = 1 - Math.pow(Math.min(1, Math.abs(lz) / (sz / 2)), 4);
      disp += pil * (Math.abs(nx) > 0.5 ? fy * fz : Math.abs(ny) > 0.5 ? fx * fz : fx * fy);
    }
    const wp0 = xf(F, lx, ly, lz);
    if (na) disp += na * fbm3(wp0[0] * nf + so, wp0[1] * nf, wp0[2] * nf, 3);
    if (chip && ar) disp -= chip * Math.max(0, vnoise3(wp0[0] * 9 + so, wp0[1] * 9, wp0[2] * 9) * 1.6 - 0.6);
    if (ad) {
      // hewing scallops along the length (local x), on the side faces
      const sxp = lx * 9.5 + vnoise3(lx * 2 + so, ny * 3, nz * 3) * 2.2;
      disp -= ad * (0.5 + 0.5 * Math.cos(sxp * Math.PI * 2)) * (1 - Math.abs(nx));
    }
    if (wane && (wane[0] || wane[1])) {
      // a waney arris: the edge keeps the tree's rounded surface (cut inward)
      const ty = ly * Math.sign(wane[0] || 1), tz = lz * Math.sign(wane[1] || 1);
      const w = Math.max(0, (ty / (sy / 2) + tz / (sz / 2)) - 1.25) * (0.6 + 0.8 * vnoise3(lx * 1.3 + so, 0, 0));
      disp -= w * Math.min(sy, sz) * 0.35;
    }
    lx += nx * disp; ly += ny * disp; lz += nz * disp;
    if (bend) { const b = bend(lx, ly, lz); lx += b[0]; ly += b[1]; lz += b[2]; }
    if (o.warp) { const b = o.warp(lx, ly, lz); lx = b[0]; ly = b[1]; lz = b[2]; }
    const w = xf(F, lx, ly, lz);
    let ao = 1;
    if (o.aoFn) ao = o.aoFn(p[0], p[1], p[2]);
    else if (aoD > 0) {
      const dep = sz / 2 - p[2];
      ao = 1 - (1 - aoF) * clamp(dep / aoD, 0, 1);
      // faces that look into an opening (a jamb's reveal) stay open: aoOpen bits 1 -x, 2 +x, 4 -y, 8 +y
      const oo = o.aoOpen || 0;
      if (((oo & 1) && p[0] <= -sx / 2 + r + 1e-6) || ((oo & 2) && p[0] >= sx / 2 - r - 1e-6) || ((oo & 4) && p[1] <= -sy / 2 + r + 1e-6) || ((oo & 8) && p[1] >= sy / 2 - r - 1e-6)) ao = 1;
    }
    // uv: metres; 'beam': u along x, v around the section
    let u, vv;
    if (o.uvFn) { const q = o.uvFn(p[0], p[1], p[2]); u = q[0]; vv = q[1]; }
    else if (o.uvMode === 'box') {
      if (Math.abs(nx) > 0.6) { u = lz; vv = ly; } else if (Math.abs(ny) > 0.6) { u = lx; vv = lz; } else { u = lx; vv = ly; }
    } else {
      // 'beam': u along the length, v = distance from the tree's pith (growth rings in the shader)
      u = lx + sx / 2;
      vv = Math.hypot(ly - pith[0], lz - pith[1]);
    }
    id = acc.v(w[0], w[1], w[2], u, vv, seed, ao, ar, AX[0], AX[1], AX[2]);
    map.set(key, id);
    return id;
  };
  for (let k = 0; k < 6; k++) {
    if (skip & (1 << k)) continue;
    faceK = k;
    const [na_, a1, a2, sg] = FACE_AX[k];
    const ia = sg > 0 ? C[na_].length - 1 : 0;
    const A1 = C[a1], A2 = C[a2];
    for (let i = 0; i < A1.length - 1; i++) {
      for (let j = 0; j < A2.length - 1; j++) {
        const idx = (ii, jj) => { const t = [0, 0, 0]; t[na_] = ia; t[a1] = ii; t[a2] = jj; return vid(t[0], t[1], t[2]); };
        const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
        // winding: outward normal = sign * (axis a1 x axis a2) - the cyclic order (n, a1, a2) is right-handed
        if ((sg > 0) !== mir) acc.q(a, b, c, d); else acc.q(a, d, c, b);
      }
    }
  }
  void S;
}

/**
 * A quad grid surface: fn(u, v) -> { p: [x,y,z], uv: [u, v], ao, ar, seed } for u, v in [0, 1].
 * nu, nv segments. axis = grain direction (world).
 */
export function grid(acc, nu, nv, fn, axis = [1, 0, 0], flip = false) {
  const ids = new Array((nu + 1) * (nv + 1));
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const r = fn(i / nu, j / nv);
    ids[j * (nu + 1) + i] = acc.v(r.p[0], r.p[1], r.p[2], r.uv ? r.uv[0] : i / nu, r.uv ? r.uv[1] : j / nv, r.seed ?? 0, r.ao ?? 1, r.ar ?? 0, axis[0], axis[1], axis[2]);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = ids[j * (nu + 1) + i], b = ids[j * (nu + 1) + i + 1], c = ids[(j + 1) * (nu + 1) + i + 1], d = ids[(j + 1) * (nu + 1) + i];
    if (flip) acc.q(a, d, c, b); else acc.q(a, b, c, d);
  }
}

/**
 * A flat polygon with holes (THREE.Shape in the frame's x-y plane, normal +z), triangulated;
 * uv = local x, y in metres. Used for mortar beds, plaster faces, floors.
 */
export function shapeFace(acc, F, shape, o = {}) {
  const pts = shape.extractPoints(o.curveSegs ?? 12);
  const tris = THREE.ShapeUtils.triangulateShape(pts.shape, pts.holes);
  const all = [...pts.shape, ...pts.holes.flat()];
  const base = acc.vcount;
  const AX = norm(xd(F, ...(o.axis || [1, 0, 0])));
  for (const q of all) {
    const w = xf(F, q.x, q.y, 0);
    acc.v(w[0], w[1], w[2], q.x + (o.uo?.[0] ?? 0), q.y + (o.uo?.[1] ?? 0), o.seed ?? 0, o.ao ?? 1, 0, AX[0], AX[1], AX[2]);
  }
  for (const t of tris) { if (o.flip) acc.t(base + t[0], base + t[2], base + t[1]); else acc.t(base + t[0], base + t[1], base + t[2]); }
}

/** An extruded strip along a polyline in 3D (rope, lead came, gutter, iron strap): rectangle w x h section. */
export function strip(acc, pts, w, h, o = {}) {
  const up = o.up || [0, 1, 0];
  let prevN = null;
  const ring = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const T = norm(subv(b, a));
    let N = cross(T, up); if (len(N) < 1e-6) N = prevN || [1, 0, 0]; N = norm(N); prevN = N;
    const B = cross(N, T);
    const c = pts[i];
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    ring.push(corners.map(([x, y]) => acc.v(c[0] + N[0] * x + B[0] * y, c[1] + N[1] * x + B[1] * y, c[2] + N[2] * x + B[2] * y, i, x, o.seed ?? 0, 1, 0, T[0], T[1], T[2])));
  }
  for (let i = 0; i < ring.length - 1; i++) for (let k = 0; k < 4; k++) {
    const a = ring[i][k], b = ring[i][(k + 1) % 4], c = ring[i + 1][(k + 1) % 4], d = ring[i + 1][k];
    acc.q(a, b, c, d);
  }
}

/** A tube along points (round section, nseg sides): ropes, rails, pegs, chains. */
export function tube(acc, pts, rad, o = {}) {
  const ns = o.sides ?? 6;
  const up = o.up || [0, 1, 0];
  const rings = [];
  let prevN = null;
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const T = norm(subv(b, a));
    let N = prevN ? subv(prevN, sc(T, dot(prevN, T))) : cross(T, up);
    if (len(N) < 1e-6) N = cross(T, [1, 0, 0]);
    N = norm(N); prevN = N;
    const B = cross(T, N);
    if (i > 0) along += len(subv(pts[i], pts[i - 1]));
    const rr = typeof rad === 'function' ? rad(i / (pts.length - 1)) : rad;
    const ring = [];
    for (let k = 0; k <= ns; k++) {
      const an = (k / ns) * Math.PI * 2;
      const c = Math.cos(an), s = Math.sin(an);
      const c0 = pts[i];
      ring.push(acc.v(c0[0] + (N[0] * c + B[0] * s) * rr, c0[1] + (N[1] * c + B[1] * s) * rr, c0[2] + (N[2] * c + B[2] * s) * rr, along, (k / ns) * rr * 6.283, o.seed ?? 0, 1, 0, T[0], T[1], T[2]));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < ns; k++) acc.q(rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]);
  if (o.caps) {
    for (const [ri, sgn] of [[0, -1], [rings.length - 1, 1]]) {
      const ring = rings[ri];
      const c = pts[ri];
      const ci = acc.v(c[0], c[1], c[2], 0, 0, o.seed ?? 0, 1, 0, 0, 1, 0);
      for (let k = 0; k < ns; k++) { if (sgn > 0) acc.t(ci, ring[k], ring[k + 1]); else acc.t(ci, ring[k + 1], ring[k]); }
    }
  }
}

/** Catmull-Rom sampled curve through points, n samples. */
export function curve(points, n) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return c.getPoints(n).map((v) => [v.x, v.y, v.z]);
}
/** Catenary-ish sag between a and b (rope): n points, sag (m) at the middle. */
export function sagLine(a, b, sag, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) { const f = i / n; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f), a[2] + (b[2] - a[2]) * f]); }
  return out;
}

/**
 * A surface of revolution about the frame's y axis: profile [[r, y], ...] (bottom to top),
 * seg sides. uv: (angle * r, y). Used for bowls, jugs, lamps, basins.
 */
export function lathe(acc, F, profile, seg = 24, o = {}) {
  const rings = [];
  for (const [r, y] of profile) {
    const ring = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const wob = o.wobble ? 1 + o.wobble * Math.sin(a * 3 + (o.seed ?? 0) * 10) : 1;
      const p = xf(F, Math.cos(a) * r * wob, y, Math.sin(a) * r * wob);
      ring.push(acc.v(p[0], p[1], p[2], a * Math.max(r, 0.01), y, o.seed ?? 0, o.ao ?? 1, 0, 0, 1, 0));
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < seg; i++) acc.q(rings[k][i], rings[k + 1][i], rings[k + 1][i + 1], rings[k][i + 1]);
}
