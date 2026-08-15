/* ============================================================
   MATH — vectors, quaternions, matrices, noise, RNG.
   Everything here is allocation-conscious: the heavy operations
   take an `out` argument so hot loops never touch the GC.
   ============================================================ */

const EPS = 1e-6;
const PI = Math.PI;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function sign(x) { return x < 0 ? -1 : 1; }

/* Deterministic RNG — games that look the same on every device are easier
   to debug, and fracture patterns must be reproducible across a rebuild. */
class Rng {
  constructor(seed = 1) { this.s = (seed >>> 0) || 1; }
  next() {
    // xorshift32
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n) % n; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  unitVec3(out = new Vec3()) {
    // Marsaglia: uniform on the sphere, no pole clustering.
    const z = this.range(-1, 1);
    const a = this.range(0, TAU);
    const r = Math.sqrt(1 - z * z);
    return out.set(r * Math.cos(a), r * Math.sin(a), z);
  }
}

/* ---------------- Vec3 ---------------- */

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  setScalar(s) { this.x = this.y = this.z = s; return this; }

  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addVectors(a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  mul(v) { this.x *= v.x; this.y *= v.y; this.z *= v.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }

  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  distanceTo(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  distanceToSq(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }

  normalize() {
    const l = this.length();
    if (l > EPS) { const i = 1 / l; this.x *= i; this.y *= i; this.z *= i; }
    return this;
  }
  setLength(l) { return this.normalize().scale(l); }
  clampLength(max) { const l = this.length(); if (l > max && l > EPS) this.scale(max / l); return this; }

  cross(v) { return this.crossVectors(this, v); }
  crossVectors(a, b) {
    const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  min(v) { this.x = Math.min(this.x, v.x); this.y = Math.min(this.y, v.y); this.z = Math.min(this.z, v.z); return this; }
  max(v) { this.x = Math.max(this.x, v.x); this.y = Math.max(this.y, v.y); this.z = Math.max(this.z, v.z); return this; }

  /* Any vector perpendicular to this one — used to build contact tangent
     frames, where only orthogonality matters, not a particular direction. */
  perpendicular(out = new Vec3()) {
    if (Math.abs(this.x) < 0.57735) out.set(1, 0, 0);
    else if (Math.abs(this.y) < 0.57735) out.set(0, 1, 0);
    else out.set(0, 0, 1);
    return out.crossVectors(this, out).normalize();
  }

  applyQuat(q) {
    const { x, y, z } = this, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    // t = 2 * cross(q.xyz, v); v' = v + q.w * t + cross(q.xyz, t)
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + qy * tz - qz * ty;
    this.y = y + qw * ty + qz * tx - qx * tz;
    this.z = z + qw * tz + qx * ty - qy * tx;
    return this;
  }
  /* Rotate by the inverse of q — world space back into a body's local frame. */
  applyQuatInv(q) {
    const { x, y, z } = this, qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + qy * tz - qz * ty;
    this.y = y + qw * ty + qz * tx - qx * tz;
    this.z = z + qw * tz + qx * ty - qy * tx;
    return this;
  }

  applyMat4(m) {
    const { x, y, z } = this, e = m.e;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15] || 1);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
  /* Direction transform: ignores translation. */
  applyMat4Dir(m) {
    const { x, y, z } = this, e = m.e;
    this.x = e[0] * x + e[4] * y + e[8] * z;
    this.y = e[1] * x + e[5] * y + e[9] * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;
    return this;
  }

  equalsApprox(v, eps = 1e-5) {
    return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps && Math.abs(this.z - v.z) < eps;
  }
  isFinite() { return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z); }
  toArray(a = [], o = 0) { a[o] = this.x; a[o + 1] = this.y; a[o + 2] = this.z; return a; }
  fromArray(a, o = 0) { this.x = a[o]; this.y = a[o + 1]; this.z = a[o + 2]; return this; }
  static from(v) {
    if (v == null) return new Vec3();
    if (v instanceof Vec3) return v.clone();
    if (Array.isArray(v)) return new Vec3(v[0] || 0, v[1] || 0, v[2] || 0);
    if (typeof v === 'number') return new Vec3(v, v, v);
    return new Vec3(v.x || 0, v.y || 0, v.z || 0);
  }
}

Vec3.ZERO = new Vec3(0, 0, 0);
Vec3.UP = new Vec3(0, 1, 0);

/* A small pool of scratch vectors. Hot paths borrow from here instead of
   allocating; each function documents how many it uses so they never
   collide across a call boundary. */
const _v = [];
for (let i = 0; i < 32; i++) _v.push(new Vec3());

/* ---------------- Quaternion ---------------- */

class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quat(this.x, this.y, this.z, this.w); }
  identity() { return this.set(0, 0, 0, 1); }

  setAxisAngle(axis, angle) {
    const h = angle * 0.5, s = Math.sin(h);
    return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(h));
  }
  setEuler(x, y, z) {
    // YXZ order: yaw, then pitch, then roll — the intuitive order for cameras
    // and characters, so `rotation: [pitch, yaw, roll]` reads naturally.
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    this.x = s1 * c2 * c3 + c1 * s2 * s3;
    this.y = c1 * s2 * c3 - s1 * c2 * s3;
    this.z = c1 * c2 * s3 - s1 * s2 * c3;
    this.w = c1 * c2 * c3 + s1 * s2 * s3;
    return this;
  }
  mul(q) { return this.mulQuats(this, q); }
  premul(q) { return this.mulQuats(q, this); }
  mulQuats(a, b) {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w;
    const bx = b.x, by = b.y, bz = b.z, bw = b.w;
    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by + ay * bw + az * bx - ax * bz;
    this.z = aw * bz + az * bw + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
  conjugate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  dot(q) { return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w; }
  normalize() {
    let l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    if (l < EPS) return this.identity();
    l = 1 / l;
    this.x *= l; this.y *= l; this.z *= l; this.w *= l;
    return this;
  }
  /* Integrate an angular velocity for dt. This is the exponential-map form,
     which stays stable at high spin rates where the naive q += 0.5*w*q*dt
     visibly inflates the quaternion. */
  integrate(w, dt) {
    const ax = w.x * dt, ay = w.y * dt, az = w.z * dt;
    const angle = Math.sqrt(ax * ax + ay * ay + az * az);
    if (angle < 1e-9) return this;
    const s = Math.sin(angle * 0.5) / angle;
    _q1.set(ax * s, ay * s, az * s, Math.cos(angle * 0.5));
    return this.premul(_q1).normalize();
  }
  slerp(q, t) {
    let cos = this.dot(q);
    let bx = q.x, by = q.y, bz = q.z, bw = q.w;
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let s0, s1;
    if (cos > 0.9995) { s0 = 1 - t; s1 = t; }
    else {
      const theta = Math.acos(cos), sin = Math.sin(theta);
      s0 = Math.sin((1 - t) * theta) / sin;
      s1 = Math.sin(t * theta) / sin;
    }
    this.x = this.x * s0 + bx * s1;
    this.y = this.y * s0 + by * s1;
    this.z = this.z * s0 + bz * s1;
    this.w = this.w * s0 + bw * s1;
    return this.normalize();
  }
  /* Shortest rotation taking direction `from` to direction `to`. */
  setFromUnitVectors(from, to) {
    let r = from.dot(to) + 1;
    if (r < 1e-6) {
      // Opposite vectors: any perpendicular axis is a valid 180° turn.
      r = 0;
      if (Math.abs(from.x) > Math.abs(from.z)) this.set(-from.y, from.x, 0, r);
      else this.set(0, -from.z, from.y, r);
    } else {
      this.set(
        from.y * to.z - from.z * to.y,
        from.z * to.x - from.x * to.z,
        from.x * to.y - from.y * to.x,
        r,
      );
    }
    return this.normalize();
  }
  /* Look down -Z at `dir` with the given up vector (camera / character facing). */
  setLookRotation(dir, up = Vec3.UP) {
    const f = _v[28].copy(dir).normalize();
    const r = _v[29].crossVectors(up, f);
    if (r.lengthSq() < 1e-8) r.copy(f).perpendicular(r);
    r.normalize();
    const u = _v[30].crossVectors(f, r);
    // Build from the rotation matrix basis (r, u, f) via the trace method.
    const m00 = r.x, m01 = u.x, m02 = f.x;
    const m10 = r.y, m11 = u.y, m12 = f.y;
    const m20 = r.z, m21 = u.z, m22 = f.z;
    const trace = m00 + m11 + m22;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      this.set((m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s);
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      this.set(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      this.set((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      this.set((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
    }
    return this.normalize();
  }
  static from(v) {
    if (v == null) return new Quat();
    if (v instanceof Quat) return v.clone();
    if (Array.isArray(v)) {
      // 3 numbers read as Euler angles in degrees — far friendlier to write.
      if (v.length === 3) return new Quat().setEuler(v[0] * DEG, v[1] * DEG, v[2] * DEG);
      return new Quat(v[0], v[1], v[2], v[3]);
    }
    return new Quat(v.x || 0, v.y || 0, v.z || 0, v.w == null ? 1 : v.w);
  }
}

const _q1 = new Quat();

/* ---------------- Mat3 (inertia tensors) ---------------- */

class Mat3 {
  constructor() { this.e = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]); }
  identity() { const e = this.e; e[0] = 1; e[1] = 0; e[2] = 0; e[3] = 0; e[4] = 1; e[5] = 0; e[6] = 0; e[7] = 0; e[8] = 1; return this; }
  setDiagonal(x, y, z) { const e = this.e; e[0] = x; e[1] = 0; e[2] = 0; e[3] = 0; e[4] = y; e[5] = 0; e[6] = 0; e[7] = 0; e[8] = z; return this; }
  copy(m) { this.e.set(m.e); return this; }

  /* Rotate a (symmetric) tensor into world space: R * M * Rᵀ. */
  setRotatedDiagonal(q, dx, dy, dz) {
    // Columns of R, i.e. the body axes expressed in world space.
    const c0 = _v[24].set(1, 0, 0).applyQuat(q);
    const c1 = _v[25].set(0, 1, 0).applyQuat(q);
    const c2 = _v[26].set(0, 0, 1).applyQuat(q);
    const e = this.e;
    e[0] = dx * c0.x * c0.x + dy * c1.x * c1.x + dz * c2.x * c2.x;
    e[1] = dx * c0.x * c0.y + dy * c1.x * c1.y + dz * c2.x * c2.y;
    e[2] = dx * c0.x * c0.z + dy * c1.x * c1.z + dz * c2.x * c2.z;
    e[3] = e[1];
    e[4] = dx * c0.y * c0.y + dy * c1.y * c1.y + dz * c2.y * c2.y;
    e[5] = dx * c0.y * c0.z + dy * c1.y * c1.z + dz * c2.y * c2.z;
    e[6] = e[2];
    e[7] = e[5];
    e[8] = dx * c0.z * c0.z + dy * c1.z * c1.z + dz * c2.z * c2.z;
    return this;
  }
  transformVec3(v, out = new Vec3()) {
    const e = this.e, { x, y, z } = v;
    return out.set(
      e[0] * x + e[3] * y + e[6] * z,
      e[1] * x + e[4] * y + e[7] * z,
      e[2] * x + e[5] * y + e[8] * z,
    );
  }
}

/* ---------------- Mat4 (column-major, GL layout) ---------------- */

class Mat4 {
  constructor() {
    this.e = new Float32Array(16);
    this.identity();
  }
  identity() {
    const e = this.e;
    e[0] = 1; e[1] = 0; e[2] = 0; e[3] = 0;
    e[4] = 0; e[5] = 1; e[6] = 0; e[7] = 0;
    e[8] = 0; e[9] = 0; e[10] = 1; e[11] = 0;
    e[12] = 0; e[13] = 0; e[14] = 0; e[15] = 1;
    return this;
  }
  copy(m) { this.e.set(m.e); return this; }
  clone() { return new Mat4().copy(this); }

  compose(pos, quat, scl) {
    const e = this.e;
    const { x, y, z, w } = quat;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = scl.x, sy = scl.y, sz = scl.z;
    e[0] = (1 - (yy + zz)) * sx; e[1] = (xy + wz) * sx; e[2] = (xz - wy) * sx; e[3] = 0;
    e[4] = (xy - wz) * sy; e[5] = (1 - (xx + zz)) * sy; e[6] = (yz + wx) * sy; e[7] = 0;
    e[8] = (xz + wy) * sz; e[9] = (yz - wx) * sz; e[10] = (1 - (xx + yy)) * sz; e[11] = 0;
    e[12] = pos.x; e[13] = pos.y; e[14] = pos.z; e[15] = 1;
    return this;
  }
  mulMatrices(a, b) {
    const ae = a.e, be = b.e, te = this.e;
    for (let c = 0; c < 4; c++) {
      const b0 = be[c * 4], b1 = be[c * 4 + 1], b2 = be[c * 4 + 2], b3 = be[c * 4 + 3];
      te[c * 4] = ae[0] * b0 + ae[4] * b1 + ae[8] * b2 + ae[12] * b3;
      te[c * 4 + 1] = ae[1] * b0 + ae[5] * b1 + ae[9] * b2 + ae[13] * b3;
      te[c * 4 + 2] = ae[2] * b0 + ae[6] * b1 + ae[10] * b2 + ae[14] * b3;
      te[c * 4 + 3] = ae[3] * b0 + ae[7] * b1 + ae[11] * b2 + ae[15] * b3;
    }
    return this;
  }
  mul(m) { return this.mulMatrices(this, m); }

  invert() {
    const e = this.e;
    const a00 = e[0], a01 = e[1], a02 = e[2], a03 = e[3];
    const a10 = e[4], a11 = e[5], a12 = e[6], a13 = e[7];
    const a20 = e[8], a21 = e[9], a22 = e[10], a23 = e[11];
    const a30 = e[12], a31 = e[13], a32 = e[14], a33 = e[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-12) return this.identity();
    det = 1 / det;
    e[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    e[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    e[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    e[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    e[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    e[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    e[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    e[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    e[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    e[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    e[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    e[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    e[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    e[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    e[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    e[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return this;
  }
  transpose() {
    const e = this.e;
    let t;
    t = e[1]; e[1] = e[4]; e[4] = t;
    t = e[2]; e[2] = e[8]; e[8] = t;
    t = e[6]; e[6] = e[9]; e[9] = t;
    t = e[3]; e[3] = e[12]; e[12] = t;
    t = e[7]; e[7] = e[13]; e[13] = t;
    t = e[11]; e[11] = e[14]; e[14] = t;
    return this;
  }
  /* Inverse-transpose of the upper 3×3, written into a Mat4's top-left.
     Normals need this whenever scaling is non-uniform. */
  setNormalMatrix(m) {
    this.copy(m).invert().transpose();
    const e = this.e;
    e[3] = 0; e[7] = 0; e[11] = 0;
    e[12] = 0; e[13] = 0; e[14] = 0; e[15] = 1;
    return this;
  }

  perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    const e = this.e;
    e[0] = f / aspect; e[1] = 0; e[2] = 0; e[3] = 0;
    e[4] = 0; e[5] = f; e[6] = 0; e[7] = 0;
    e[8] = 0; e[9] = 0; e[11] = -1;
    e[12] = 0; e[13] = 0; e[15] = 0;
    const nf = 1 / (near - far);
    e[10] = (far + near) * nf;
    e[14] = 2 * far * near * nf;
    return this;
  }
  ortho(l, r, b, t, n, f) {
    const e = this.e;
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    e[0] = -2 * lr; e[1] = 0; e[2] = 0; e[3] = 0;
    e[4] = 0; e[5] = -2 * bt; e[6] = 0; e[7] = 0;
    e[8] = 0; e[9] = 0; e[10] = 2 * nf; e[11] = 0;
    e[12] = (l + r) * lr; e[13] = (t + b) * bt; e[14] = (f + n) * nf; e[15] = 1;
    return this;
  }
  lookAt(eye, target, up) {
    const z = _v[20].subVectors(eye, target);
    if (z.lengthSq() < 1e-12) z.set(0, 0, 1);
    z.normalize();
    const x = _v[21].crossVectors(up, z);
    if (x.lengthSq() < 1e-12) {
      // Looking straight up or down — nudge so the basis stays well-formed.
      z.x += 1e-4;
      z.normalize();
      x.crossVectors(up, z);
    }
    x.normalize();
    const y = _v[22].crossVectors(z, x);
    const e = this.e;
    e[0] = x.x; e[1] = y.x; e[2] = z.x; e[3] = 0;
    e[4] = x.y; e[5] = y.y; e[6] = z.y; e[7] = 0;
    e[8] = x.z; e[9] = y.z; e[10] = z.z; e[11] = 0;
    e[12] = -x.dot(eye); e[13] = -y.dot(eye); e[14] = -z.dot(eye); e[15] = 1;
    return this;
  }
  getTranslation(out = new Vec3()) { const e = this.e; return out.set(e[12], e[13], e[14]); }
}

/* ---------------- AABB ---------------- */

class Aabb {
  constructor() { this.min = new Vec3(Infinity, Infinity, Infinity); this.max = new Vec3(-Infinity, -Infinity, -Infinity); }
  reset() { this.min.setScalar(Infinity); this.max.setScalar(-Infinity); return this; }
  expandPoint(p) { this.min.min(p); this.max.max(p); return this; }
  expandScalar(s) { this.min.x -= s; this.min.y -= s; this.min.z -= s; this.max.x += s; this.max.y += s; this.max.z += s; return this; }
  center(out = new Vec3()) { return out.addVectors(this.min, this.max).scale(0.5); }
  extents(out = new Vec3()) { return out.subVectors(this.max, this.min).scale(0.5); }
  overlaps(b) {
    return this.min.x <= b.max.x && this.max.x >= b.min.x
      && this.min.y <= b.max.y && this.max.y >= b.min.y
      && this.min.z <= b.max.z && this.max.z >= b.min.z;
  }
  containsPoint(p) {
    return p.x >= this.min.x && p.x <= this.max.x
      && p.y >= this.min.y && p.y <= this.max.y
      && p.z >= this.min.z && p.z <= this.max.z;
  }
  /* Slab test. Returns entry distance, or -1 on a miss. */
  rayHit(origin, dir, maxDist) {
    let tmin = 0, tmax = maxDist;
    for (const ax of ['x', 'y', 'z']) {
      const d = dir[ax];
      if (Math.abs(d) < 1e-9) {
        if (origin[ax] < this.min[ax] || origin[ax] > this.max[ax]) return -1;
      } else {
        const inv = 1 / d;
        let t1 = (this.min[ax] - origin[ax]) * inv;
        let t2 = (this.max[ax] - origin[ax]) * inv;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    return tmin;
  }
}

/* ---------------- Noise ---------------- */

/* Classic 3D simplex noise. Drives wind, terrain, and every procedural
   texture in the engine, so it is worth having the real thing rather than
   layered sine waves — those produce visible grid artifacts on close detail. */
const _grad3 = [
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
];

class Noise {
  constructor(seed = 1337) {
    const rng = new Rng(seed);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise3(xin, yin, zin) {
    const F3 = 1 / 3, G3 = 1 / 6;
    const perm = this.perm, permMod12 = this.permMod12;
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0; else {
      const gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (_grad3[gi0] * x0 + _grad3[gi0 + 1] * y0 + _grad3[gi0 + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0; else {
      const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (_grad3[gi1] * x1 + _grad3[gi1 + 1] * y1 + _grad3[gi1 + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0; else {
      const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (_grad3[gi2] * x2 + _grad3[gi2 + 1] * y2 + _grad3[gi2 + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0; else {
      const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n3 = t3 * t3 * (_grad3[gi3] * x3 + _grad3[gi3 + 1] * y3 + _grad3[gi3 + 2] * z3);
    }
    return 32 * (n0 + n1 + n2 + n3);
  }

  /* Fractal Brownian motion — the workhorse for texture and terrain detail. */
  fbm(x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /* Ridged noise: sharp creases, ideal for rock, bark and mountain silhouettes. */
  ridged(x, y, z, octaves = 4) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise3(x * freq, y * freq, z * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
