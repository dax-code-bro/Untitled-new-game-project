// Signed-distance "sculpt" of a creature body, evaluated on the CPU at setup
// time (no three.js dependency, so it also runs in Node for tests/benchmarks).
//
// A body is an ordered list of primitives. Each primitive is combined into the
// running value with a smooth union (op 'add') or a smooth subtraction (op
// 'sub'), with its own blend radius k (metres). Order matters for subtraction:
// unions first, then cavities (mouth, eye sockets, nostrils), then anything
// that must sit inside a cavity (tongue), then more cavities.
//
// Primitive kinds
//   cone : "round cone" between points a and b with radii ra, rb (iq), whose
//          cross-section can be elliptical: sx/sy scale the local x/y axes
//          (x = right of the segment frame, y = `up` projected off the axis).
//   ell  : ellipsoid at c with radii (rx, ry, rz) in a frame given by the
//          unit axes ax (local x), ay (local y); local z = ax x ay.
//
// Every primitive also carries `bone` (skin weight target), `chain` (+ the
// arc-length range it covers, for scale coordinates) and `tag` (material
// region hints). Those are used by skin.js, not here.

const STRIDE = 26;
const T_CONE = 0, T_ELL = 1;
const OP_ADD = 0, OP_SUB = 1;

export class SDFModel {
  constructor() {
    this.prims = [];
    this.noise = null;      // { amp, freq, seed }: sculpted surface irregularity added to the final distance
    this.quiet = [];        // [x, y, z, r]: spheres where the irregularity fades out (eyes: the socket must stay clean)
  }

  /** Round cone (elliptical cross-section optional). a, b: [x,y,z]. */
  cone(a, b, ra, rb, o = {}) {
    this.prims.push({ kind: 'cone', a: [...a], b: [...b], ra, rb, sx: o.sx ?? 1, sy: o.sy ?? 1, up: o.up ?? [0, 1, 0],
      k: o.k ?? 0, op: o.op ?? 'add', bone: o.bone ?? null, chain: o.chain ?? null, s0: o.s0 ?? 0, s1: o.s1 ?? 0, tag: o.tag ?? null, w: o.w ?? 1, grp: o.grp ?? -1 });
    return this;
  }

  /** Ellipsoid. c: centre, r: [rx,ry,rz], ax/ay: local x and y axes (unit, orthogonal). */
  ell(c, r, o = {}) {
    let ax = o.ax ?? [1, 0, 0], ay = o.ay ?? [0, 1, 0];
    ax = norm(ax); ay = norm(sub(ay, scale(ax, dot(ay, ax))));
    this.prims.push({ kind: 'ell', c: [...c], r: [...r], ax, ay, az: cross(ax, ay),
      k: o.k ?? 0, op: o.op ?? 'add', bone: o.bone ?? null, chain: o.chain ?? null, s0: o.s0 ?? 0, s1: o.s1 ?? 0, tag: o.tag ?? null, w: o.w ?? 1, grp: o.grp ?? -1 });
    return this;
  }

  /** Start a new group id: primitives created with { grp: id } are hard-unioned together, then smooth-blended into the body once. */
  group() { this._g = (this._g ?? 0) + 1; return this._g; }

  /** Pack into a flat Float64Array for fast evaluation; computes AABBs. */
  compile() {
    const n = this.prims.length;
    const P = new Float64Array(n * STRIDE);
    const box = new Float64Array(n * 6);
    this.prims.forEach((p, i) => {
      const o = i * STRIDE;
      P[o + 1] = p.op === 'sub' ? OP_SUB : OP_ADD;
      P[o + 2] = p.k;
      P[o + 24] = p.grp;
      if (p.kind === 'cone') {
        const ez0 = sub(p.b, p.a); const len = Math.hypot(...ez0);
        if (!(len > 1e-9)) throw new Error('degenerate cone');
        const ez = scale(ez0, 1 / len);
        let ey = sub(p.up, scale(ez, dot(p.up, ez)));
        if (Math.hypot(...ey) < 1e-6) ey = Math.abs(ez[1]) < 0.9 ? sub([0, 1, 0], scale(ez, ez[1])) : sub([1, 0, 0], scale(ez, ez[0]));
        ey = norm(ey);
        const ex = cross(ey, ez);
        let r1 = p.ra, r2 = p.rb;
        // a round cone needs |r1 - r2| < len; clamp the smaller sphere if not
        if (Math.abs(r1 - r2) >= len * 0.98) { if (r1 > r2) r2 = r1 - len * 0.98; else r1 = r2 - len * 0.98; }
        const rr = r1 - r2, l2 = len * len;
        P[o] = T_CONE;
        P.set(p.a, o + 3); P.set(ex, o + 6); P.set(ey, o + 9); P.set(ez, o + 12);
        P[o + 15] = 1 / p.sx; P[o + 16] = 1 / p.sy; P[o + 17] = Math.min(p.sx, p.sy);
        P[o + 18] = len; P[o + 19] = r1; P[o + 20] = r2; P[o + 21] = rr; P[o + 22] = l2 - rr * rr; P[o + 23] = l2;
        const m = Math.max(p.sx, p.sy);
        for (let c = 0; c < 3; c++) {
          box[i * 6 + c] = Math.min(p.a[c] - r1 * m, p.b[c] - r2 * m);
          box[i * 6 + 3 + c] = Math.max(p.a[c] + r1 * m, p.b[c] + r2 * m);
        }
      } else {
        P[o] = T_ELL;
        P.set(p.c, o + 3); P.set(p.ax, o + 6); P.set(p.ay, o + 9); P.set(p.az, o + 12);
        P[o + 15] = p.r[0]; P[o + 16] = p.r[1]; P[o + 17] = p.r[2];
        // exact AABB of a rotated ellipsoid
        for (let c = 0; c < 3; c++) {
          const e = Math.hypot(p.ax[c] * p.r[0], p.ay[c] * p.r[1], p.az[c] * p.r[2]);
          box[i * 6 + c] = p.c[c] - e; box[i * 6 + 3 + c] = p.c[c] + e;
        }
      }
    });
    this.P = P; this.box = box; this.n = n;
    const all = new Int32Array(n); for (let i = 0; i < n; i++) all[i] = i;
    this.all = all;
    return this;
  }

  /** Overall AABB [minx,miny,minz,maxx,maxy,maxz] of the 'add' primitives. */
  bounds() {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.n; i++) {
      if (this.P[i * STRIDE + 1] !== OP_ADD) continue;
      for (let c = 0; c < 3; c++) { b[c] = Math.min(b[c], this.box[i * 6 + c]); b[3 + c] = Math.max(b[3 + c], this.box[i * 6 + 3 + c]); }
    }
    return b;
  }

  /** Distance of point to primitive i (raw, unblended). */
  primDist(i, x, y, z) {
    const P = this.P, o = i * STRIDE;
    const dx = x - P[o + 3], dy = y - P[o + 4], dz = z - P[o + 5];
    if (P[o] === T_CONE) {
      const u = (dx * P[o + 6] + dy * P[o + 7] + dz * P[o + 8]) * P[o + 15];
      const v = (dx * P[o + 9] + dy * P[o + 10] + dz * P[o + 11]) * P[o + 16];
      const w = dx * P[o + 12] + dy * P[o + 13] + dz * P[o + 14];
      const len = P[o + 18], r1 = P[o + 19], r2 = P[o + 20], rr = P[o + 21], a2 = P[o + 22], l2 = P[o + 23];
      const il2 = 1 / l2;
      const yy = w * len, zz = yy - l2;
      const x2 = l2 * l2 * (u * u + v * v);
      const y2 = yy * yy * l2, z2 = zz * zz * l2;
      const kk = Math.sign(rr) * rr * rr * x2;
      let d;
      if (Math.sign(zz) * a2 * z2 > kk) d = Math.sqrt(x2 + z2) * il2 - r2;
      else if (Math.sign(yy) * a2 * y2 < kk) d = Math.sqrt(x2 + y2) * il2 - r1;
      else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
      return d * P[o + 17];
    }
    const lx = (dx * P[o + 6] + dy * P[o + 7] + dz * P[o + 8]) / P[o + 15];
    const ly = (dx * P[o + 9] + dy * P[o + 10] + dz * P[o + 11]) / P[o + 16];
    const lz = (dx * P[o + 12] + dy * P[o + 13] + dz * P[o + 14]) / P[o + 17];
    const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const k1 = Math.sqrt(lx * lx / (P[o + 15] * P[o + 15]) + ly * ly / (P[o + 16] * P[o + 16]) + lz * lz / (P[o + 17] * P[o + 17]));
    if (k1 < 1e-12) return -Math.min(P[o + 15], P[o + 16], P[o + 17]);
    return k0 * (k0 - 1) / k1;
  }

  /** Blended distance using primitive indices list[s..e). Consecutive members of a
   * group are combined with a hard min first and blended into the result once
   * (no smooth-union bulges where the pieces of one chain overlap). */
  evalList(x, y, z, list, s = 0, e = list.length) {
    const P = this.P;
    let acc = 1e9, gAcc = 1e9, curG = -1, gK = 0, gSub = false;
    for (let n = s; n <= e; n++) {
      let i = -1, g = -2;
      if (n < e) { i = list[n]; g = P[i * STRIDE + 24]; }
      if (g !== curG && curG >= 0) {
        // flush the open group
        acc = combine(acc, gAcc, gK, gSub);
        curG = -1; gAcc = 1e9;
      }
      if (n === e) break;
      const d = this.primDist(i, x, y, z);
      const o = i * STRIDE;
      if (g >= 0) {
        if (curG < 0) { curG = g; gK = P[o + 2]; gSub = P[o + 1] !== OP_ADD; }
        if (d < gAcc) gAcc = d;
        continue;
      }
      acc = combine(acc, d, P[o + 2], P[o + 1] !== OP_ADD);
    }
    const N = this.noise;
    if (N && acc < N.amp * 8 && acc > -N.amp * 8) {
      // two octaves of value noise plus a ridged octave: lumpy, skin-like irregularity
      let qa = 1;
      const Q = this.quiet;
      for (let i = 0; i < Q.length; i += 4) {
        const dx = x - Q[i], dy = y - Q[i + 1], dz = z - Q[i + 2], r = Q[i + 3];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 4 * r * r) { const t = Math.max(0, Math.sqrt(d2) / r - 1); qa = Math.min(qa, t * t * (3 - 2 * t)); }
      }
      if (qa <= 0) return acc;
      const f = N.freq;
      const n1 = vnoise3(x * f, y * f, z * f), n2 = vnoise3(x * f * 2.7 + 11.1, y * f * 2.7, z * f * 2.7);
      const r = 1 - Math.abs(vnoise3(x * f * 1.3 + 3.3, y * f * 1.3, z * f * 1.3) * 2 - 1);
      acc += qa * N.amp * ((n1 - 0.5) * 1.3 + (n2 - 0.5) * 0.6 - r * r * 0.5 + 0.18);
    }
    return acc;
  }

  /** Indices of primitives whose AABB, grown by `pad` (+ their own k), meets the box. */
  cull(minx, miny, minz, maxx, maxy, maxz, pad, from = this.all) {
    const out = [];
    const B = this.box, P = this.P;
    for (let n = 0; n < from.length; n++) {
      const i = from[n];
      const g = pad + P[i * STRIDE + 2];
      const o = i * 6;
      if (B[o] - g > maxx || B[o + 3] + g < minx || B[o + 1] - g > maxy || B[o + 4] + g < miny || B[o + 2] - g > maxz || B[o + 5] + g < minz) continue;
      out.push(i);
    }
    return out;
  }
}

// fast 3D value noise (deterministic integer hash)
function ih(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = ih(xi, yi, zi), b = ih(xi + 1, yi, zi), c = ih(xi, yi + 1, zi), d = ih(xi + 1, yi + 1, zi);
  const e = ih(xi, yi, zi + 1), f = ih(xi + 1, yi, zi + 1), g = ih(xi, yi + 1, zi + 1), h = ih(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * fx, x2 = c + (d - c) * fx, x3 = e + (f - e) * fx, x4 = g + (h - g) * fx;
  const y1 = x1 + (x2 - x1) * fy, y2 = x3 + (x4 - x3) * fy;
  return y1 + (y2 - y1) * fz;
}

function combine(acc, d, k, isSub) {
  if (!isSub) {
    if (k > 0) { const h = Math.max(k - Math.abs(acc - d), 0) / k; return Math.min(acc, d) - h * h * k * 0.25; }
    return Math.min(acc, d);
  }
  const b = -d;
  if (k > 0) { const h = Math.max(k - Math.abs(acc - b), 0) / k; return Math.max(acc, b) + h * h * k * 0.25; }
  return Math.max(acc, b);
}

// ---------------------------------------------------------------- vectors
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mix = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
