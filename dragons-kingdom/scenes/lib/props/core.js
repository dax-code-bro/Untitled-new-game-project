// Props library - geometry core. Everything is built at setup() from code (deterministic, seeded)
// into indexed BufferGeometries with the attributes the prop materials (materials.js) read:
//
//   position, normal (computed), uv (METRES: u along the grain / along a rope / across a cloth,
//   v across), aPiece (0..1: one random value per piece - per-plank tone, texture offset),
//   aAO (0..1 baked occlusion: 1 open, 0 fully occluded), aWear (0..1: worn arris, rubbed edge)
//
//   const b = new Builder();
//   box(b, frame, [sx, sy, sz], { bevel: 0.006, grain: 'x', piece: rnd() });
//   tube(b, points, radius, { sides: 8 });
//   const geo = b.geometry();
//
// Frames are plain objects { o: Vector3, x, y, z: unit Vector3 } (see frame()).
import * as THREE from 'three';

// ------------------------------------------------------------------ random --
/** Seeded generator in [0, 1) (mulberry32). */
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Stateless hash of integers -> [0, 1). */
export function hash(...v) {
  let h = 2166136261 >>> 0;
  for (const x of v) { h = Math.imul(h ^ ((x * 73856093) | 0), 16777619) >>> 0; h ^= h >>> 13; }
  h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function h3(ix, iy, iz) { return hash(ix, iy * 7919 + 13, iz * 104729 + 7); }
/** 3D value noise in [0, 1]. */
export function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), fx), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), fx), fy),
    l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), fx), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
/** Signed fbm around 0 (about -0.5..0.5). */
export function fbm(x, y, z, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (vnoise(x * f + i * 7.1, y * f + i * 3.3, z * f + i * 5.7) - 0.5); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ frames --
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** A frame: origin + orthonormal axes. */
export function frame(o = [0, 0, 0], x = [1, 0, 0], y = [0, 1, 0]) {
  const O = Array.isArray(o) ? V(...o) : o.clone();
  const X = (Array.isArray(x) ? V(...x) : x.clone()).normalize();
  let Y = (Array.isArray(y) ? V(...y) : y.clone());
  Y.addScaledVector(X, -Y.dot(X)).normalize();
  const Z = V().crossVectors(X, Y);
  return { o: O, x: X, y: Y, z: Z };
}
/** Frame at o turned by yaw about +y (and optional pitch about the local x, roll about local z). */
export function yawFrame(o, yaw = 0, pitch = 0, roll = 0) {
  const e = new THREE.Euler(pitch, yaw, roll, 'YXZ');
  const q = new THREE.Quaternion().setFromEuler(e);
  return { o: Array.isArray(o) ? V(...o) : o.clone(), x: V(1, 0, 0).applyQuaternion(q), y: V(0, 1, 0).applyQuaternion(q), z: V(0, 0, 1).applyQuaternion(q) };
}
/** Point in frame F from local coordinates. */
export function fp(F, a, b, c) {
  return V(F.o.x + a * F.x.x + b * F.y.x + c * F.z.x, F.o.y + a * F.x.y + b * F.y.y + c * F.z.y, F.o.z + a * F.x.z + b * F.y.z + c * F.z.z);
}
/** Direction in frame F. */
export function fd(F, a, b, c) { return V(a * F.x.x + b * F.y.x + c * F.z.x, a * F.x.y + b * F.y.y + c * F.z.y, a * F.x.z + b * F.y.z + c * F.z.z); }
/** Sub-frame: local origin + local axes of F (rotated by yaw/pitch/roll in F's space). */
export function sub(F, o = [0, 0, 0], yaw = 0, pitch = 0, roll = 0) {
  const L = yawFrame([0, 0, 0], yaw, pitch, roll);
  return { o: fp(F, ...o), x: fd(F, L.x.x, L.x.y, L.x.z), y: fd(F, L.y.x, L.y.y, L.y.z), z: fd(F, L.z.x, L.z.y, L.z.z) };
}
/** Frame whose x axis runs from a to b (y as close to `up` as possible). */
export function axisFrame(a, b, up = [0, 1, 0]) {
  const X = V().subVectors(b, a);
  const len = X.length(); X.normalize();
  let U = Array.isArray(up) ? V(...up) : up.clone();
  if (Math.abs(U.dot(X)) > 0.98) U = Math.abs(X.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  const F = frame(V().addVectors(a, b).multiplyScalar(0.5), X, U);
  F.len = len;
  return F;
}

// ----------------------------------------------------------------- builder --
class Grow {
  constructor(n, T = Float32Array) { this.a = new T(n); this.n = 0; this.T = T; }
  ensure(k) { if (this.n + k > this.a.length) { const b = new this.T(Math.max(this.a.length * 2, this.n + k + 64)); b.set(this.a.subarray(0, this.n)); this.a = b; } }
  view() { return this.a.subarray(0, this.n); }
}

/** Accumulates one mesh (one material). */
export class Builder {
  constructor() { this.P = new Grow(3 * 1024); this.U = new Grow(2 * 1024); this.A = new Grow(3 * 1024); this.X = new Grow(3 * 2048, Uint32Array); this.N = null; }
  get count() { return this.P.n / 3; }
  /** Add a vertex: p (Vector3), u, v (metres), piece, ao, wear. Returns its index. */
  v(p, u = 0, w = 0, piece = 0, ao = 1, wear = 0) {
    this.P.ensure(3); this.U.ensure(2); this.A.ensure(3);
    this.P.a[this.P.n++] = p.x; this.P.a[this.P.n++] = p.y; this.P.a[this.P.n++] = p.z;
    this.U.a[this.U.n++] = u; this.U.a[this.U.n++] = w;
    this.A.a[this.A.n++] = piece; this.A.a[this.A.n++] = ao; this.A.a[this.A.n++] = wear;
    return this.count - 1;
  }
  t(a, b, c) { this.X.ensure(3); this.X.a[this.X.n++] = a; this.X.a[this.X.n++] = b; this.X.a[this.X.n++] = c; }
  q(a, b, c, d) { this.t(a, b, c); this.t(a, c, d); }
  /** Grid of (nu + 1) x (nv + 1) vertices from fn(i, j) -> [p, u, v, piece, ao, wear]; quads i-major. */
  grid(nu, nv, fn, { wrapU = false, flip = false } = {}) {
    const base = this.count;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const r = fn(i, j); this.v(r[0], r[1], r[2], r[3] ?? 0, r[4] ?? 1, r[5] ?? 0); }
    const row = nu + 1;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * row + i, b = a + 1, c = a + row + 1, d = a + row;
      if (flip) this.q(a, d, c, b); else this.q(a, b, c, d);
    }
    return base;
  }
  /** Transform the vertices added since index `from` by matrix m (Matrix4). */
  apply(m, from = 0) {
    const a = this.P.a, v = new THREE.Vector3();
    for (let i = from * 3; i < this.P.n; i += 3) { v.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(m); a[i] = v.x; a[i + 1] = v.y; a[i + 2] = v.z; }
  }
  /** Displace vertices since `from` with fn(x, y, z, k) -> [x, y, z]. */
  deform(fn, from = 0) {
    const a = this.P.a;
    for (let i = from * 3, k = from; i < this.P.n; i += 3, k++) { const r = fn(a[i], a[i + 1], a[i + 2], k); a[i] = r[0]; a[i + 1] = r[1]; a[i + 2] = r[2]; }
  }
  /** Append a BufferGeometry (positions, uv; optional aPiece/aAO/aWear). */
  addGeometry(g, piece = 0, m = null) {
    const base = this.count;
    const P = g.attributes.position, U = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); if (m) v.applyMatrix4(m);
      this.v(v, U ? U.getX(i) : 0, U ? U.getY(i) : 0, g.attributes.aPiece ? g.attributes.aPiece.getX(i) : piece, g.attributes.aAO ? g.attributes.aAO.getX(i) : 1, g.attributes.aWear ? g.attributes.aWear.getX(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i += 3) this.t(base + g.index.getX(i), base + g.index.getX(i + 1), base + g.index.getX(i + 2));
    else for (let i = 0; i < P.count; i += 3) this.t(base + i, base + i + 1, base + i + 2);
  }
  geometry({ normals = true } = {}) {
    const g = new THREE.BufferGeometry();
    const P = this.P.view().slice(), U = this.U.view().slice(), A = this.A.view();
    const n = P.length / 3;
    const piece = new Float32Array(n), ao = new Float32Array(n), wear = new Float32Array(n);
    for (let i = 0; i < n; i++) { piece[i] = A[i * 3]; ao[i] = A[i * 3 + 1]; wear[i] = A[i * 3 + 2]; }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setAttribute('aPiece', new THREE.BufferAttribute(piece, 1));
    g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
    g.setAttribute('aWear', new THREE.BufferAttribute(wear, 1));
    const idx = this.X.view();
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? idx.slice() : new Uint16Array(idx), 1));
    if (normals) g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

/** Give a foreign geometry the prop attributes (defaults: piece p, ao 1, wear 0). */
export function ensureAttrs(g, p = 0) {
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.aPiece) g.setAttribute('aPiece', new THREE.BufferAttribute(new Float32Array(n).fill(p), 1));
  if (!g.attributes.aAO) g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  if (!g.attributes.aWear) g.setAttribute('aWear', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

/** A set of builders keyed by material name -> one Group of meshes. */
export class Kit {
  constructor() { this.b = {}; }
  get(name) { if (!this.b[name]) { this.b[name] = new Builder(); this.b[name].name = name; } return this.b[name]; }
  build(mats, { name = 'prop', castShadow = true, receiveShadow = true } = {}) {
    const g = new THREE.Group(); g.name = name;
    let tris = 0;
    for (const [k, b] of Object.entries(this.b)) {
      if (!b.X.n) continue;
      const mat = mats[k];
      if (!mat) throw new Error(`props: no material "${k}"`);
      const m = new THREE.Mesh(b.geometry(), mat);
      m.name = `${name}:${k}`; m.castShadow = castShadow; m.receiveShadow = receiveShadow;
      g.add(m); tris += b.X.n / 3;
    }
    g.userData.tris = tris;
    return g;
  }
}

// -------------------------------------------------------------- primitives --
/**
 * A bevelled box (a plank, a board, a beam, a stave) centred in frame F, size [sx, sy, sz].
 * o: bevel (m), seg (max segment length, m), grain 'x'|'y'|'z' (u runs along it), piece,
 *    noise (amplitude, m) + nf (frequency): hand-made irregularity, warp(x, y, z) -> [x, y, z]
 *    (local, before the frame: bows, tapers), skip (faces to leave out: '+x', '-y', ...),
 *    ao(x, y, z) -> 0..1 (local), wearEdge (m: how far from an arris the wear attribute reaches).
 */
export function box(b, F, size, o = {}) {
  const [sx, sy, sz] = size;
  const r = Math.min(o.bevel ?? 0.004, 0.45 * Math.min(sx, sy, sz));
  const seg = o.seg ?? 0.25;
  const piece = o.piece ?? 0;
  const grain = o.grain ?? 'x';
  const skip = new Set(o.skip || []);
  const na = o.noise ?? 0, nf = o.nf ?? 4, ns = piece * 97.3;
  const wearEdge = o.wearEdge ?? 0.012;
  // coordinates along each axis: the rounded rows at both ends, then even segments
  const ax = (s) => {
    const h = s / 2, out = [-h];
    if (r > 1e-5) { out.push(-h + r * 0.3, -h + r); }
    const inner = s - 2 * r, n = Math.max(1, Math.ceil(inner / seg));
    for (let i = 1; i < n; i++) out.push(-h + r + (inner * i) / n);
    if (r > 1e-5) { out.push(h - r, h - r * 0.3); }
    out.push(h);
    return out;
  };
  const C = [ax(sx), ax(sy), ax(sz)];
  const H = [sx / 2 - r, sy / 2 - r, sz / 2 - r];
  // map a point on the inner box's surface to the rounded surface
  const pt = (c) => {
    const q = [0, 0, 0], n = [0, 0, 0];
    for (let k = 0; k < 3; k++) { q[k] = clamp(c[k], -H[k], H[k]); n[k] = c[k] - q[k]; }
    let l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9 || r < 1e-5) return c.slice();
    const out = [q[0] + n[0] / l * r, q[1] + n[1] / l * r, q[2] + n[2] / l * r];
    return out;
  };
  const faces = [
    ['+x', 0, 1, 2, 1], ['-x', 0, 1, 2, -1], ['+y', 1, 2, 0, 1], ['-y', 1, 2, 0, -1], ['+z', 2, 0, 1, 1], ['-z', 2, 0, 1, -1],
  ];
  const tmp = new THREE.Vector3();
  for (const [name, a, b1, c1, s] of faces) {
    if (skip.has(name)) continue;
    const A1 = C[b1], A2 = C[c1];
    const base = b.count;
    for (let j = 0; j < A2.length; j++) for (let i = 0; i < A1.length; i++) {
      const c = [0, 0, 0];
      c[a] = s * size[a] / 2; c[b1] = A1[i]; c[c1] = A2[j];
      let p = pt(c);
      // wear: closeness to an arris (two coordinates near their limits)
      let near = 0;
      for (let k = 0; k < 3; k++) near += smooth(wearEdge, 0, size[k] / 2 - Math.abs(c[k]));
      const wear = clamp(near - 1, 0, 1);
      if (na) { const nn = fbm(p[0] * nf + ns, p[1] * nf, p[2] * nf, 2) * na; p = [p[0] * (1 + nn / Math.max(0.05, sx)), p[1] * (1 + nn / Math.max(0.05, sy)), p[2] * (1 + nn / Math.max(0.05, sz))]; }
      if (o.warp) p = o.warp(p[0], p[1], p[2]);
      // uv in metres: u along the grain, v across (around the piece)
      let u, w;
      if (grain === 'x') { u = c[0]; w = a === 1 ? c[2] + sy : a === 2 ? c[1] : c[1] + c[2]; }
      else if (grain === 'y') { u = c[1]; w = a === 0 ? c[2] : a === 2 ? c[0] + sz : c[0] + c[2]; }
      else { u = c[2]; w = a === 0 ? c[1] : a === 1 ? c[0] + sx : c[0] + c[1]; }
      // end grain: faces across the grain get their own coordinates (rings, not streaks)
      const endGrain = (grain === 'x' && a === 0) || (grain === 'y' && a === 1) || (grain === 'z' && a === 2);
      if (endGrain) { u = 50 + c[b1]; w = c[c1]; }
      const ao = o.ao ? o.ao(c[0], c[1], c[2]) : 1;
      tmp.copy(fp(F, p[0], p[1], p[2]));
      b.v(tmp, u, w, piece, ao, endGrain ? Math.max(wear, 0.5) : wear);
    }
    const nu = A1.length;
    for (let j = 0; j < A2.length - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const p0 = base + j * nu + i, p1 = p0 + 1, p2 = p0 + nu + 1, p3 = p0 + nu;
      if (s > 0) b.q(p0, p1, p2, p3); else b.q(p0, p3, p2, p1);
    }
  }
}

/**
 * A tube along points (Vector3[]), radius number | fn(t 0..1) -> r. o: sides, caps (bool),
 * piece, twist (radians per metre - for rope strands' uv), uScale, ao(t, a) -> 0..1, closed.
 * u runs along the tube (metres), v around it (metres of circumference).
 */
export function tube(b, pts, radius, o = {}) {
  const sides = o.sides ?? 8, piece = o.piece ?? 0;
  const curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, !!o.closed, 'centripetal') : new THREE.LineCurve3(pts[0], pts[1]);
  const len = curve.getLength();
  const n = o.segments ?? Math.max(2, Math.ceil(len / (o.seg ?? 0.06)));
  const frames = curve.computeFrenetFrames(n, !!o.closed);
  const R = typeof radius === 'function' ? radius : () => radius;
  // ropes: v = 0..1 round the rope (the rope shader twists its strands with it)
  const vNorm = o.vNorm ?? (typeof b.name === 'string' && b.name.startsWith('rope'));
  const base = b.count;
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPointAt(t, P);
    const r = R(t);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2 + (o.twist ?? 0) * t * len;
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      b.v(P.clone().addScaledVector(N, r), t * len * (o.uScale ?? 1), vNorm ? k / sides : (k / sides) * 2 * Math.PI * r, piece, o.ao ? o.ao(t, a) : 1, o.wear ?? 0);
    }
  }
  const row = sides + 1;
  for (let i = 0; i < n; i++) for (let k = 0; k < sides; k++) {
    const a = base + i * row + k;
    b.q(a, a + 1, a + row + 1, a + row);
  }
  if (o.caps) {
    for (const [i, s] of [[0, -1], [n, 1]]) {
      curve.getPointAt(i / n, P);
      const c = b.v(P, 0, 0, piece, 0.8, 0.6);
      for (let k = 0; k < sides; k++) {
        const a = base + i * row + k;
        if (s > 0) b.t(c, a, a + 1); else b.t(c, a + 1, a);
      }
    }
  }
  return { curve, len };
}

/**
 * A lathe: profile [[r, y], ...] (bottom -> top, outside), revolved in frame F around its y axis.
 * o: seg (around), piece, rFn(r, y, angle) -> r (irregular / hand-thrown), uv: u around (metres
 * of circumference at that radius), v along the profile (metres), ao(i, y) -> 0..1.
 */
export function lathe(b, F, profile, o = {}) {
  const seg = o.seg ?? 32, piece = o.piece ?? 0;
  const base = b.count;
  let acc = 0;
  const vs = profile.map((p, i) => (i ? (acc += Math.hypot(p[0] - profile[i - 1][0], p[1] - profile[i - 1][1])) : 0));
  for (let i = 0; i < profile.length; i++) {
    const [r0, y] = profile[i];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const r = o.rFn ? o.rFn(r0, y, a, i) : r0;
      b.v(fp(F, Math.cos(a) * r, y, Math.sin(a) * r), (k / seg) * 2 * Math.PI * Math.max(r0, 0.01), vs[i], piece, o.ao ? o.ao(i, y) : 1, o.wear ? o.wear(i) : 0);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < profile.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = base + i * row + k;
    b.q(a, a + row, a + row + 1, a + 1);
  }
}

// ------------------------------------------------------------------ curves --
/** Points of a hanging line from a to b with sag (m at the middle; a parabola close to the catenary). */
export function sagLine(a, b, sag, n = 16, sideways = null) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    if (sideways) p.addScaledVector(sideways, 4 * t * (1 - t));
    out.push(p);
  }
  return out;
}

/** Real catenary between a and b for a cord of length L (> span): points (n + 1). */
export function catenary(a, b, L, n = 32) {
  const dx = Math.hypot(b.x - a.x, b.z - a.z), dy = b.y - a.y;
  const span = Math.max(1e-4, dx);
  // solve sqrt(L^2 - dy^2) = 2 c sinh(span / 2c) for c (bisection on 1/c)
  const target = Math.sqrt(Math.max(L * L - dy * dy, span * span * 1.000001));
  let lo = 1e-4, hi = 50 / span;
  for (let i = 0; i < 80; i++) {
    const k = (lo + hi) / 2;           // k = 1 / c
    const f = (2 / k) * Math.sinh(k * span / 2) - target;
    if (f > 0) hi = k; else lo = k;
  }
  const c = 2 / (lo + hi);
  // horizontal offset of the vertex: y(x) = c cosh((x - x0) / c) + C
  const x0 = span / 2 - c * Math.asinh(dy / (2 * c * Math.sinh(span / (2 * c))));
  const y0 = c * Math.cosh((0 - x0) / c);
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  const out = [];
  for (let i = 0; i <= n; i++) {
    const x = (span * i) / n;
    const y = c * Math.cosh((x - x0) / c) - y0;
    out.push(new THREE.Vector3(a.x + dir.x * x, a.y + y, a.z + dir.z * x));
  }
  return out;
}

/** Arc-length resample of a polyline: n + 1 points evenly spaced. */
export function resample(pts, n) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = d[d.length - 1], out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n;
    while (j < d.length - 2 && d[j + 1] < s) j++;
    const t = (s - d[j]) / Math.max(1e-9, d[j + 1] - d[j]);
    out.push(pts[j].clone().lerp(pts[j + 1], clamp(t, 0, 1)));
  }
  out.length_m = L;
  return out;
}

/**
 * Laid rope: three strands twisted round each other (right-hand lay) along pts - real geometry for
 * ropes close to the camera. radius = the whole rope. o: sides (per strand), lay (m per turn), piece.
 * Far ropes: use tube() with the rope material (its shader draws the lay).
 */
export function laidRope(b, pts, radius, o = {}) {
  const curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : new THREE.LineCurve3(pts[0], pts[1]);
  const len = curve.getLength();
  const lay = o.lay ?? radius * 7;
  const n = Math.max(8, Math.ceil(len / (lay / 10)));
  const fr = curve.computeFrenetFrames(n, false);
  const rs = radius * 0.54, off = radius * 0.46;
  for (let s = 0; s < 3; s++) {
    const p0 = [], P = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      curve.getPointAt(t, P);
      const a = (s / 3) * Math.PI * 2 + (t * len / lay) * Math.PI * 2;
      p0.push(P.clone().addScaledVector(fr.normals[i], Math.cos(a) * off).addScaledVector(fr.binormals[i], Math.sin(a) * off));
    }
    tube(b, p0, rs, { sides: o.sides ?? 6, piece: (o.piece ?? 0) + s * 0.01, segments: n, wear: 0.1 });
  }
}

// --------------------------------------------------------------- utilities --
/** Merge geometries that share attributes into one (no index renumbering surprises). */
export function mergeInto(b, geos) { for (const [g, m, piece] of geos) b.addGeometry(g, piece ?? 0, m); }

/** Bounding box of an Object3D in world space. */
export function bounds(obj) { return new THREE.Box3().setFromObject(obj); }

/** Set castShadow/receiveShadow on every mesh. */
export function shadows(obj, cast = true, receive = true) { obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } }); return obj; }

/** Fetch a JSON from the props cache (offline bakes). Returns null when it is missing. */
const cacheMemo = new Map();
export function loadCache(name) {
  if (!cacheMemo.has(name)) {
    const url = new URL(`./cache/${name}`, import.meta.url).href;
    cacheMemo.set(name, fetch(url).then((r) => (r.ok ? (name.endsWith('.json') ? r.json() : r.arrayBuffer()) : null)).catch(() => null));
  }
  return cacheMemo.get(name);
}
