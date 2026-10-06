// Geometry for rigid creature parts, generated as plain arrays (no three.js):
//   keratin(items)  horns, claws, teeth, dorsal spikes: curved, tapered,
//                   flattened tubes along a quadratic Bezier, with growth
//                   rings on horns. One bone per item (rigid skinning).
//   tubes(items)    finger bones of the wings: tapered tubes along polylines,
//                   skinned to consecutive bones with blended joints.
//   eyeball(...)    sphere with a cornea bulge in eye space (+z = gaze).
//   lids(...)       upper/lower eyelid shells (rotate about the eye centre).

import { add, sub, scale, norm, cross, dot, len, lerp3, clamp, mix } from './sdf.js';

function bezier(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2]];
}
function bezierTan(p0, p1, p2, t) {
  return norm([2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]), 2 * (1 - t) * (p1[2] - p0[2]) + 2 * t * (p2[2] - p1[2])]);
}

class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; this.si = []; this.sw = []; this.ex = []; this.tan = []; }
  get n() { return this.pos.length / 3; }
  v(p, nr, uv, bones, weights, extra = [0, 0, 0, 0]) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(nr[0], nr[1], nr[2]); this.uv.push(uv[0], uv[1]);
    this.si.push(bones[0] ?? 0, bones[1] ?? 0, bones[2] ?? 0, bones[3] ?? 0);
    this.sw.push(weights[0] ?? 1, weights[1] ?? 0, weights[2] ?? 0, weights[3] ?? 0);
    this.ex.push(extra[0], extra[1], extra[2], extra[3]);
    return this.n - 1;
  }
  out() {
    return { positions: Float32Array.from(this.pos), normals: Float32Array.from(this.nrm), uvs: Float32Array.from(this.uv), index: Uint32Array.from(this.idx),
      skinIndex: Uint16Array.from(this.si), skinWeight: Float32Array.from(this.sw), extra: Float32Array.from(this.ex),
      tangent: this.tan.length ? Float32Array.from(this.tan) : null };
  }
}

/**
 * Keratin items: { points:[p0,p1,p2], radii:[r0,r1,r2], flat (y/x section ratio), up, bone, kind, rings? }
 * boneIndex: name -> index. extra attribute = (t along item 0..1, kindId, ringPhase, seed).
 */
export function keratin(items, boneIndex, opts = {}) {
  const B = new Builder();
  const KIND = { horn: 0, claw: 1, tooth: 2, spike: 3 };
  items.forEach((it, n) => {
    const [p0, p1, p2] = it.points;
    // dense enough for 4K close-ups (horn growth ridges are geometry, ~6 segments per ridge)
    const segs = it.kind === 'tooth' ? 10 : it.kind === 'spike' ? 12 : it.kind === 'claw' ? 24 : 72;
    const around = it.kind === 'tooth' ? 12 : it.kind === 'spike' ? 10 : it.kind === 'claw' ? 16 : 36;
    const b = boneIndex[it.bone];
    if (b === undefined) throw new Error(`keratin: unknown bone ${it.bone}`);
    const base = B.n;
    // frame: tangent t, "up" u for the flattening axis
    let up0 = it.up || [0, 1, 0];
    const seed = ((n * 2654435761) >>> 0) / 4294967296;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const c = bezier(p0, p1, p2, t);
      const tg = bezierTan(p0, p1, p2, t);
      let ux = sub(up0, scale(tg, dot(up0, tg)));
      if (len(ux) < 1e-5) ux = Math.abs(tg[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      ux = norm(ux);
      const vx = cross(tg, ux);
      // radius profile: quadratic through r0, r1, r2 (with a slight bulge near the base)
      const r = t < 0.5 ? mix(it.radii[0], it.radii[1], t / 0.5) : mix(it.radii[1], it.radii[2], Math.pow((t - 0.5) / 0.5, 0.9));
      const ring = it.rings ? 1 + 0.05 * Math.max(0, Math.sin(t * 34 + seed * 6)) * (1 - t) : 1;
      const fa = it.flat ?? 1;
      // the flat axis: by default the section is squashed along `ux` (spikes: sideways)
      for (let j = 0; j <= around; j++) {
        const a = (j / around) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        let ax, ay;
        if (it.flatAxis === 'side') { ax = r * ring * ca * fa; ay = r * ring * sa; } else { ax = r * ring * ca; ay = r * ring * sa * fa; }
        // spikes and claws get a sharper back edge (keel)
        const p = add(c, add(scale(vx, ax), scale(ux, ay)));
        const nn = norm(add(scale(vx, ca / Math.max(fa, 0.2) * (it.flatAxis === 'side' ? 1 : fa)), scale(ux, sa * (it.flatAxis === 'side' ? fa : 1 / Math.max(fa, 0.2)))));
        B.v(p, nn, [j / around, t], [b], [1], [t, KIND[it.kind] ?? 0, seed, r]);
      }
    }
    const row = around + 1;
    for (let i = 0; i < segs; i++) for (let j = 0; j < around; j++) {
      const a = base + i * row + j, c = a + row;
      B.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
    // close the base with a small cap (it sits inside the skin anyway)
  });
  return B.out();
}

/**
 * Finger tubes: items { points:[...4], radii:[...4], names:[bone x3] }.
 * extra = (t along the finger, 0, 0, radius).
 */
export function tubes(items, boneIndex, opts = {}) {
  const B = new Builder();
  const around = opts.around ?? 10;
  for (const it of items) {
    const pts = it.points, rad = it.radii;
    const segPer = opts.segPer ?? 8;
    const arcBefore = [0];
    for (let s = 1; s < pts.length; s++) arcBefore.push(arcBefore[s - 1] + len(sub(pts[s], pts[s - 1])));
    const base = B.n;
    let rows = 0;
    let up = [0, 1, 0];
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const tg = norm(sub(b, a));
      for (let i = s === 0 ? 0 : 1; i <= segPer; i++) {
        const f = i / segPer;
        const c = lerp3(a, b, f);
        // knuckle swelling at the joints
        const kn = 1 + 0.18 * Math.exp(-Math.pow(f / 0.12, 2)) * (s > 0 ? 1 : 0) + 0.18 * Math.exp(-Math.pow((1 - f) / 0.12, 2)) * (s < pts.length - 2 ? 1 : 0);
        const r = mix(rad[s], rad[s + 1], f) * kn;
        let ux = sub(up, scale(tg, dot(up, tg))); ux = norm(ux); up = ux;
        const vx = cross(tg, ux);
        // bones: segment s -> names[s]; blend into the next bone near the joint
        const bj = Math.min(s, it.names.length - 1), bn = Math.min(s + 1, it.names.length - 1);
        const wn = bn !== bj ? 0.5 * Math.max(0, (f - 0.85) / 0.15) : 0;
        const tAlong = (s + f) / (pts.length - 1);
        const arc = arcBefore[s] + f * len(sub(b, a));
        for (let j = 0; j <= around; j++) {
          const ang = (j / around) * Math.PI * 2;
          const nn = add(scale(vx, Math.cos(ang)), scale(ux, Math.sin(ang)));
          B.v(add(c, scale(nn, r)), nn, [j / around, tAlong], [boneIndex[it.names[bj]], boneIndex[it.names[bn]]], [1 - wn, wn], [tAlong, arc, 0, r]);
          const dAng = add(scale(vx, -Math.sin(ang)), scale(ux, Math.cos(ang)));
          B.tan.push(tg[0], tg[1], tg[2], dot(cross(nn, tg), dAng) >= 0 ? 1 : -1);
        }
        rows++;
      }
    }
    const row = around + 1;
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < around; j++) {
      const a = base + i * row + j, c = a + row;
      B.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
    // round cap at the tip
    const tipC = pts[pts.length - 1], last = base + (rows - 1) * row;
    const tdir = norm(sub(tipC, pts[pts.length - 2]));
    const tc = B.v(add(tipC, scale(tdir, rad[rad.length - 1])), tdir, [0.5, 1], [boneIndex[it.names[it.names.length - 1]]], [1], [1, arcBefore[pts.length - 1], 0, rad[rad.length - 1]]);
    B.tan.push(tdir[0], tdir[1], tdir[2], 1);
    for (let j = 0; j < around; j++) B.idx.push(last + j, tc, last + j + 1);
  }
  return B.out();
}

/**
 * Eyeball in eye space: centre at origin, gaze +z, radius 1 (scaled later).
 * The cornea is a bulge over the front cap. uv.x = angle from gaze (0..pi)/pi.
 */
export function eyeball(opts = {}) {
  const B = new Builder();
  const nLat = opts.lat ?? 48, nLon = opts.lon ?? 64;
  const cornea = opts.cornea ?? 0.18;      // bulge height (eye radii)
  const capAng = opts.capAngle ?? 0.62;    // half-angle of the cornea (radians)
  for (let i = 0; i <= nLat; i++) {
    const th = (i / nLat) * Math.PI;       // 0 = gaze direction
    for (let j = 0; j <= nLon; j++) {
      const ph = (j / nLon) * Math.PI * 2;
      const dir = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      const bulge = th < capAng ? cornea * Math.pow(Math.cos((th / capAng) * Math.PI / 2), 2) : 0;
      const r = 1 + bulge;
      B.v(scale(dir, r), dir, [th / Math.PI, j / nLon], [0], [1]);
    }
  }
  const row = nLon + 1;
  for (let i = 0; i < nLat; i++) for (let j = 0; j < nLon; j++) {
    const a = i * row + j, c = a + row;
    B.idx.push(a, a + 1, c, a + 1, c + 1, c);
  }
  const o = B.out();
  computeNormals(o);
  return o;
}

/**
 * Eyelid shell in eye space (gaze +z, up +y): a spherical band of radius
 * rOut covering polar angles [0, maxAng] from the +y (upper) or -y (lower)
 * pole, with a rounded margin. Rotating it about the eye's x axis closes it.
 */
export function eyelid(upper, opts = {}) {
  const B = new Builder();
  const rIn = opts.rIn ?? 1.04, rOut = opts.rOut ?? 1.16;
  const span = opts.span ?? 1.25;         // half-width in azimuth (radians around the gaze)
  const reach = opts.reach ?? 1.15;       // polar angle the margin reaches (from the lid pole)
  const nA = 28, nR = 14;
  const sgn = upper ? 1 : -1;
  // param: a in [-1,1] across, r in [0,1] from the back (pole region) to the margin, then around the margin to the inner side
  const pt = (a, k, rad) => {
    // polar angle from the lid pole, azimuth around the pole
    const pol = mix(0.15, reach, k) * (1 - 0.18 * a * a);
    const az = a * span;
    // pole axis is +y (upper) / -y (lower); azimuth sweeps through +z (front)
    const dir = [Math.sin(pol) * Math.sin(az), sgn * Math.cos(pol), Math.sin(pol) * Math.cos(az)];
    return scale(dir, rad);
  };
  const rows = [];
  // outer surface from back to margin, rounded margin, inner surface back
  const prof = [];
  for (let i = 0; i <= nR; i++) prof.push([i / nR, rOut]);
  const nM = 6;
  for (let i = 1; i < nM; i++) { const f = i / nM; prof.push([1 + 0.025 * Math.sin(f * Math.PI), mix(rOut, rIn, (1 - Math.cos(f * Math.PI)) / 2)]); }
  for (let i = nR; i >= 0; i--) prof.push([i / nR, rIn]);
  for (let pi = 0; pi < prof.length; pi++) {
    const [k, rad] = prof[pi];
    const row = [];
    for (let j = 0; j <= nA; j++) {
      const a = (j / nA) * 2 - 1;
      const p = pt(a, k, rad);
      row.push(B.v(p, norm(p), [j / nA, pi / (prof.length - 1)], [0], [1], [k, pi < nR + 1 ? 0 : pi < nR + nM ? 1 : 2, 0, 0]));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < nA; j++) {
    const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j], d = rows[i + 1][j + 1];
    if (upper) B.idx.push(a, c, b, b, c, d); else B.idx.push(a, b, c, b, d, c);
  }
  const o = B.out();
  computeNormals(o);
  return o;
}

/** Area-weighted vertex normals in place. */
export function computeNormals(o) {
  const p = o.positions, idx = o.index, n = new Float32Array(p.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { n[q] += nx; n[q + 1] += ny; n[q + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  o.normals = n;
  return o;
}
