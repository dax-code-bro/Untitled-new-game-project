/* ============================================================
   THE BODY AS A FIELD -- a continuous anatomical surface.

   Every living body in the game was lofted tubes: a torso, two arms and
   two legs, each a closed stack of superellipse rings pushed into the
   others. Rings can only describe a cross-section that sweeps along one
   axis, so there was no pectoral, no deltoid cap, no glute, no calf that
   sits BEHIND the shin, and every joint was two tubes butting into each
   other. From any distance it read as a mannequin made of pipe.

   This builds the body the way a sculptor blocks one in: as masses. Each
   is a signed-distance primitive -- a round cone for a bone's length, an
   ellipsoid for a muscle belly, a rounded box for a pocket -- and the
   masses of one region are blended with a smooth minimum, so a biceps
   runs into a deltoid runs into a pectoral with no seam, the way flesh
   does. The field is then meshed (surface nets on a narrow band, then
   every vertex projected back onto the true surface) and its normals
   come straight from the field's gradient, which is why the result
   shades like a surface and not like a stack of rings.

   WHY SEVERAL FIELDS AND NOT ONE. In the bind pose the arms hang against
   the flanks and the thighs nearly touch. A single blended field fuses
   them -- and fused skin is a web that tears the moment an arm lifts to
   hold a rifle, which every bot in the game does. So each region is its
   own field and its own meshing pass (trunk, each arm, each leg, the
   neck, each boot), and the regions meet where a real garment has a
   seam: at the shoulder, the crotch and the boot top.

   CLOTHES ARE THE SAME FIELD, OFFSET. A uniform is the body grown by its
   ease -- a centimetre over the trunk, more down a trouser leg -- with
   the folds a garment actually makes added as displacement where it
   actually makes them: stacked at the elbow and the back of the knee,
   bunched over the belt and above the boot. Pockets are rounded boxes
   blended into the leg. That is geometry, so it catches light and casts
   shadow; the weave is left to the fabric's normal map.
   ============================================================ */

/* ---------------- primitives ---------------- */

function _sdRoundCone(px, py, pz, a, b, r1, r2) {
  // iq: round cone between a (radius r1) and b (radius r2).
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const xx = (pax * l2 - bax * y), xy = (pay * l2 - bay * y), xz = (paz * l2 - baz * y);
  const x2 = xx * xx + xy * xy + xz * xz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

function _sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c[0]), y = (py - c[1]), z = (pz - c[2]);
  const k0 = Math.sqrt((x / r[0]) ** 2 + (y / r[1]) ** 2 + (z / r[2]) ** 2);
  const k1 = Math.sqrt((x / (r[0] * r[0])) ** 2 + (y / (r[1] * r[1])) ** 2 + (z / (r[2] * r[2])) ** 2);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
}

// A rounded box in a local frame: c centre, u/v/w unit axes, h half-sizes, rad rounding.
function _sdRoundBox(px, py, pz, c, u, v, w, h, rad) {
  const dx = px - c[0], dy = py - c[1], dz = pz - c[2];
  const qx = Math.abs(dx * u[0] + dy * u[1] + dz * u[2]) - h[0] + rad;
  const qy = Math.abs(dx * v[0] + dy * v[1] + dz * v[2]) - h[1] + rad;
  const qz = Math.abs(dx * w[0] + dy * w[1] + dz * w[2]) - h[2] + rad;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - rad;
}

function _smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/* A region: a list of masses blended at `k`, optionally grown by an
   ease and displaced by a fold function. */
function _region(prims, k) {
  return { prims, k, ease: 0, fold: null, cut: null, bmin: null, bmax: null };
}

/* A bounding sphere per mass, so a block of the grid only evaluates the
   masses that can reach it. Blending reaches `k` past a surface, so that
   goes on the radius too. */
function _primBound(p, k) {
  let c, r;
  if (p.t === 'c') { c = _lerp3(p.a, p.b, 0.5); r = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) * 0.5 + Math.max(p.r1, p.r2); }
  else if (p.t === 'e') { c = p.c; r = Math.max(p.r[0], p.r[1], p.r[2]); }
  else { c = p.c; r = Math.hypot(p.h[0], p.h[1], p.h[2]) + p.rad; }
  return { c, r: r + (p.k != null ? p.k : k) + 0.002 };
}

function _evalRegion(R, x, y, z) {
  let d = 1e9;
  const P = R.active || R.prims;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    let e;
    if (p.t === 'c') e = _sdRoundCone(x, y, z, p.a, p.b, p.r1, p.r2);
    else if (p.t === 'e') e = _sdEllipsoid(x, y, z, p.c, p.r);
    else e = _sdRoundBox(x, y, z, p.c, p.u, p.v, p.w, p.h, p.rad);
    const k = p.k != null ? p.k : R.k;
    // `op: 's'` carves: a smooth subtraction, for sockets, nostrils and seams.
    if (p.op === 's') d = -_smin(-d, e, k);
    else d = _smin(d, e, k);
  }
  d -= R.ease;
  if (R.fold) d += R.fold(x, y, z);
  // A cut is a half-space the region is clipped to (where it meets the next one).
  if (R.cut) d = Math.max(d, R.cut(x, y, z));
  return d;
}

/* ---------------- meshing: surface nets on a narrow band ---------------- */

function _meshRegion(g, R, h, part, uvFn) {
  const bmin = R.bmin, bmax = R.bmax;
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1;
  const ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1;
  const nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const N = nx * ny * nz;
  R._bounds = R.prims.map((p) => _primBound(p, R.k));
  const val = new Float32Array(N).fill(NaN);
  const f = (x, y, z) => _evalRegion(R, x, y, z);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const X = (i) => bmin[0] + i * h, Y = (j) => bmin[1] + j * h, Z = (k) => bmin[2] + k * h;

  // Only blocks near the surface are sampled finely.
  const B = 4, diag = Math.sqrt(3) * B * h * 0.5;
  for (let bk = 0; bk < nz - 1; bk += B) for (let bj = 0; bj < ny - 1; bj += B) for (let bi = 0; bi < nx - 1; bi += B) {
    const ci = Math.min(bi + B, nx - 1), cj = Math.min(bj + B, ny - 1), ck = Math.min(bk + B, nz - 1);
    const mx = (X(bi) + X(ci)) * 0.5, my = (Y(bj) + Y(cj)) * 0.5, mz = (Z(bk) + Z(ck)) * 0.5;
    // Only the masses that can reach this block (plus their blend).
    const act = [];
    for (let q = 0; q < R.prims.length; q++) {
      const bd = R._bounds[q];
      if (Math.hypot(mx - bd.c[0], my - bd.c[1], mz - bd.c[2]) < bd.r + diag * 1.2 + R.ease) act.push(R.prims[q]);
    }
    if (!act.some((q) => q.op !== 's')) continue;       // nothing solid anywhere near
    R.active = act;
    const dc = f(mx, my, mz);
    if (Math.abs(dc) > diag * 2.6 + 0.025 * (R.bandScale || 1)) { R.active = null; continue; }   // generous: the field is not an exact distance
    for (let k = bk; k <= ck; k++) for (let j = bj; j <= cj; j++) for (let i = bi; i <= ci; i++) {
      const n = idx(i, j, k);
      if (val[n] !== val[n]) val[n] = f(X(i), Y(j), Z(k));
    }
    R.active = null;
  }

  const cellV = new Int32Array(N).fill(-1);
  const base = g.positions.length / 3;
  const vpos = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0, ok = true;
    for (let c = 0; c < 8; c++) {
      const v = val[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
      if (v !== v) { ok = false; break; }
      cv[c] = v; if (v < 0) neg++;
    }
    if (!ok || neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + (((b & 1) - (a & 1)) * t);
      sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
      sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
      cnt++;
    }
    cellV[idx(i, j, k)] = vpos.length / 3;
    vpos.push(X(i) + sx / cnt * h, Y(j) + sy / cnt * h, Z(k) + sz / cnt * h);
  }

  // Project each vertex onto the true surface and take the normal from the field.
  const e = h * 0.35, nv = vpos.length / 3;
  const nrm = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    let x = vpos[v * 3], y = vpos[v * 3 + 1], z = vpos[v * 3 + 2];
    for (let it = 0; it < 2; it++) {   // a Newton step onto the surface, then the gradient there for the normal
      const d = f(x, y, z);
      const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) / (2 * e) || 1;
      const s = Math.max(-h, Math.min(h, d)) / gl;
      const inv = 1 / (gl * 2 * e);
      x -= gx * inv * s; y -= gy * inv * s; z -= gz * inv * s;
      if (it === 1) { nrm[v * 3] = gx * inv; nrm[v * 3 + 1] = gy * inv; nrm[v * 3 + 2] = gz * inv; }
    }
    vpos[v * 3] = x; vpos[v * 3 + 1] = y; vpos[v * 3 + 2] = z;
  }

  /* Merge vertices that landed almost on top of each other. Surface nets
     puts one vertex per cell, and near a cell corner two neighbours can
     sit a fraction of a millimetre apart: slivers that shade fine but
     turn any measurement of stretch into noise, and waste triangles. Every
     edge the quads below will make is checked, and the short ones are
     collapsed (union-find), so nothing slips between two buckets. */
  const remap = new Int32Array(nv);
  for (let v = 0; v < nv; v++) remap[v] = v;
  const find = (v) => { while (remap[v] !== v) { remap[v] = remap[remap[v]]; v = remap[v]; } return v; };
  const minLen2 = (h * 0.28) * (h * 0.28);
  const quads = [];
  const prev = g.part;
  g.part = part;
  const uv = [0, 0];
  for (let v = 0; v < nv; v++) {
    const x = vpos[v * 3], y = vpos[v * 3 + 1], z = vpos[v * 3 + 2];
    uvFn(x, y, z, uv);
    g.vert(x, y, z, nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2], uv[0], uv[1]);
  }
  g.part = prev;

  // One quad per sign-changing edge, between the four cells around it.
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // Measured: the natural cell order winds inward, so the outward face is the reverse.
    quads.push(flip ? [a, b, c, d] : [a, d, c, b]);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v0 = val[idx(i, j, k)], v1 = val[idx(i + 1, j, k)];
    if (v0 !== v0 || v1 !== v1 || (v0 < 0) === (v1 < 0)) continue;
    quad(cellV[idx(i, j - 1, k - 1)], cellV[idx(i, j, k - 1)], cellV[idx(i, j, k)], cellV[idx(i, j - 1, k)], v0 < 0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = val[idx(i, j, k)], v1 = val[idx(i, j + 1, k)];
    if (v0 !== v0 || v1 !== v1 || (v0 < 0) === (v1 < 0)) continue;
    quad(cellV[idx(i - 1, j, k - 1)], cellV[idx(i - 1, j, k)], cellV[idx(i, j, k)], cellV[idx(i, j, k - 1)], v0 < 0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = val[idx(i, j, k)], v1 = val[idx(i, j, k + 1)];
    if (v0 !== v0 || v1 !== v1 || (v0 < 0) === (v1 < 0)) continue;
    quad(cellV[idx(i - 1, j - 1, k)], cellV[idx(i, j - 1, k)], cellV[idx(i, j, k)], cellV[idx(i - 1, j, k)], v0 < 0);
  }
  // Collapse the short edges, then emit what is left (a quad that lost a corner is a triangle).
  const d2 = (a, b) => (vpos[a * 3] - vpos[b * 3]) ** 2 + (vpos[a * 3 + 1] - vpos[b * 3 + 1]) ** 2 + (vpos[a * 3 + 2] - vpos[b * 3 + 2]) ** 2;
  for (const q of quads) for (let e = 0; e < 4; e++) {
    const a = find(q[e]), b = find(q[(e + 1) % 4]);
    if (a !== b && d2(a, b) < minLen2) remap[Math.max(a, b)] = Math.min(a, b);
  }
  for (const q of quads) {
    const r = q.map(find);
    const uniq = r.filter((x, i) => r.indexOf(x) === i);
    if (uniq.length === 4) g.quad(base + r[0], base + r[1], base + r[2], base + r[3]);
    else if (uniq.length === 3) g.tri(base + uniq[0], base + uniq[1], base + uniq[2]);
  }
  return nv;
}

/* A texture seam: a cylindrical UV wraps from 1 back to 0 somewhere, and
   the triangles across it would stretch the whole texture backwards over
   one strip. Those triangles get their own copies of the wrapped corners
   with u shifted by one period. */
function _fixUvSeams(g, triFrom, triTo, period) {
  const I = g.indices, U = g.uvs;
  for (let t = triFrom; t < triTo; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ua = U[a * 2], ub = U[b * 2], uc = U[c * 2];
    const hi = Math.max(ua, ub, uc), lo = Math.min(ua, ub, uc);
    if (hi - lo < period * 0.5) continue;
    for (let s = 0; s < 3; s++) {
      const v = I[t + s];
      if (U[v * 2] < hi - period * 0.5) {
        const p = g.positions, n = g.normals;
        const nvi = g.vert(p[v * 3], p[v * 3 + 1], p[v * 3 + 2], n[v * 3], n[v * 3 + 1], n[v * 3 + 2], U[v * 2] + period, U[v * 2 + 1]);
        if (g.parts) g.parts[nvi] = g.parts[v];
        I[t + s] = nvi;
      }
    }
  }
}

/* ---------------- the body ---------------- */

const _bp = new Vec3();
function _bonePos(skeleton, name, st) {
  const i = skeleton.index(name);
  skeleton.bones[i].bindMatrix.getTranslation(_bp);
  return [_bp.x / st, _bp.y / st, _bp.z / st];
}
const _lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const _cone = (a, b, r1, r2, k) => ({ t: 'c', a, b, r1, r2, k });
const _ell = (c, r, k) => ({ t: 'e', c, r, k });
function _norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function _cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function _box(c, u, v, h, rad, k) {
  const U = _norm3(u), V0 = _norm3(v), W = _norm3(_cross3(U, V0)), V = _cross3(W, U);
  return { t: 'b', c, u: U, v: V, w: W, h, rad, k };
}

/* Folds along a limb: bands of ridges perpendicular to the limb axis,
   concentrated where the garment is compressed. `sites` are [t, width,
   amplitude] along the segment a->b. */
function _foldsAlong(a, b, sites, seed, rings) {
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
  const L2 = ax * ax + ay * ay + az * az, L = Math.sqrt(L2);
  return (x, y, z) => {
    const t = ((x - a[0]) * ax + (y - a[1]) * ay + (z - a[2]) * az) / L2;
    if (t < -0.1 || t > 1.1) return 0;
    // Around-the-limb angle, from a fixed reference, so a ridge wavers.
    const ang = Math.atan2(x - a[0] - ax * t, z - a[2] - az * t);
    let d = 0;
    for (const [c, w, amp] of sites) {
      const u = (t - c) / w;
      if (u < -1.5 || u > 1.5) continue;
      const env = Math.exp(-u * u * 2.2);
      const s = t * L * (rings || 38) + Math.sin(ang * 2 + seed) * 0.9 + Math.sin(ang * 3.1 + seed * 1.7) * 0.5;
      d += -amp * env * (0.5 + 0.5 * Math.sin(s));
    }
    return d;
  };
}

/* Outfits: how loose, how folded, and what is sewn on. */
const BODY_FIT = {
  fatigues: { trunk: 0.010, sleeve: 0.012, leg: 0.014, fold: 1.0, pockets: true, cuffs: true },
  hazmat:   { trunk: 0.026, sleeve: 0.030, leg: 0.032, fold: 2.0, pockets: false, cuffs: true, tape: true },
  tight:    { trunk: 0.004, sleeve: 0.004, leg: 0.005, fold: 0.3, pockets: false, cuffs: false },
};

/* Build the body. Returns a Geometry tagged with PART like the lofted
   body (so the skin solver binds it the same way), with the neck, hands
   and boots split off as their own geometries for their own materials. */
function makeSdfBodyGeometry(skeleton, opts = {}) {
  const st = opts.stature || 1;
  const kb = opts.thickness || 1;
  const kw = Math.pow(kb, 0.85);          // girth follows build, a little sub-linear
  const fit = BODY_FIT[opts.fit || 'fatigues'] || BODY_FIT.fatigues;
  const h = opts.resolution || 0.011;
  const seed = (opts.seed || 7) * 1.37;

  const J = {};
  for (const n of ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR',
    'lowerArmL', 'lowerArmR', 'handL', 'handR', 'upperLegL', 'upperLegR', 'lowerLegL', 'lowerLegR', 'footL', 'footR']) {
    J[n] = _bonePos(skeleton, n, st);
  }

  const g = new Geometry();
  g.parts = [];
  /* UVs IN METRES. u runs round the region (angle x its circumference),
     v straight up it, so a fabric's grid is square and the same size on
     a sleeve as on the chest; a material's uvScale is then "tiles per
     metre". The wrap is one circumference, and the triangles across it
     are given their own shifted corners. */
  const cyl = (cx, cz, circ) => (x, y, z, out) => {
    const a = Math.atan2(x - cx, z - cz) / (2 * Math.PI) + 0.5;
    out[0] = a * circ; out[1] = y;
  };
  const meshWrapped = (G2, R, hh, part, cx, cz, circ) => {
    const t0 = G2.indices.length;
    _meshRegion(G2, R, hh, part, cyl(cx, cz, circ));
    _fixUvSeams(G2, t0, G2.indices.length, circ);
  };

  /* ---- TRUNK: pelvis to collar, with the deltoid caps ---- */
  const w = (v) => v * kw;
  const T = [
    _ell([0, 0.020, -0.004], [w(0.150), 0.105, w(0.100)]),               // pelvis / hips
    _ell([w(0.066), -0.018, -0.050], [w(0.082), 0.092, w(0.070)]),        // glute L
    _ell([-w(0.066), -0.018, -0.050], [w(0.082), 0.092, w(0.070)]),       // glute R
    _ell([0, 0.175, 0.004], [w(0.128), 0.125, w(0.092)]),                 // abdomen / waist
    _ell([0, 0.335, -0.004], [w(0.142), 0.150, w(0.104)]),                // ribcage
    _ell([w(0.066), 0.395, 0.052], [w(0.078), 0.058, w(0.040)]),          // pectoral L
    _ell([-w(0.066), 0.395, 0.052], [w(0.078), 0.058, w(0.040)]),         // pectoral R
    _ell([w(0.088), 0.330, -0.052], [w(0.060), 0.110, w(0.042)]),         // lat L
    _ell([-w(0.088), 0.330, -0.052], [w(0.060), 0.110, w(0.042)]),        // lat R
    _ell([0, 0.468, -0.022], [w(0.118), 0.050, w(0.068)]),                // trapezius / upper back
    _ell([0, 0.448, 0.020], [w(0.100), 0.040, w(0.070)]),                 // collarbone line
  ];
  /* The shoulder SLOPE belongs to the trunk -- trapezius running down to
     the acromion -- and stops short of the joint, under the sleeve. The
     deltoid itself is the arm's: a trunk that owns the cap sticks out past
     the sleeve as a ledge, which is what read as shoulder pads. */
  for (const s of [1, -1]) {
    const ua = J['upperArm' + (s > 0 ? 'L' : 'R')];
    T.push(_ell([ua[0] * 0.72, ua[1] + 0.028, ua[2] - 0.006], [w(0.070), 0.040, w(0.058)], 0.04));
  }
  const trunk = _region(T, 0.045);
  trunk.ease = fit.trunk;
  trunk.bmin = [-0.30 * kw - 0.05, -0.14, -0.22 * kw - 0.03];
  trunk.bmax = [0.30 * kw + 0.05, 0.535, 0.20 * kw + 0.03];
  // Shirt folds: bunched at the waist where it is tucked into the belt.
  trunk.fold = (x, y, z) => {
    const u = (y - 0.095) / 0.07;
    if (u < -1.5 || u > 1.5) return 0;
    const ang = Math.atan2(x, z);
    return -0.0035 * fit.fold * Math.exp(-u * u * 2) * (0.5 + 0.5 * Math.sin(ang * 9 + Math.sin(y * 60 + seed) * 1.4 + seed));
  };
  // The collar: a band of doubled cloth standing up round the neck.
  T.push({ t: 'c', a: [0, 0.505, -0.010], b: [0, 0.532, -0.004], r1: w(0.074), r2: w(0.070), k: 0.012 });
  // Clip the trunk below the crotch and above the collar: the legs and neck take over.
  // ...and hollow the collar out round the neck, so the shirt stands off it.
  trunk.cut = (x, y, z) => Math.max(-0.105 - y + Math.abs(x) * 0.35, y - 0.534,
    // (the hole is {r < 0.056, y > 0.49}; subtracting it is max(d, -hole))
    Math.min(0.056 - Math.sqrt(x * x + (z + 0.006) * (z + 0.006)), y - 0.490));
  meshWrapped(g, trunk, h, PART.BODY, 0, 0, 0.92 * kw);

  /* ---- ARMS: sleeve from inside the deltoid to the cuff ---- */
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const sh = J['upperArm' + S], el = J['lowerArm' + S], wr = J['hand' + S];
    const top = [sh[0] - s * 0.010, sh[1] + 0.012, sh[2]];
    const A = [
      _ell([sh[0] + s * 0.006, sh[1] - 0.004, sh[2]], [w(0.050), 0.060, w(0.054)]),                    // deltoid
      _cone(top, el, w(0.046), w(0.039)),
      _ell(_lerp3(sh, el, 0.45).map((v, i) => v + [0, 0, 0.018][i]), [w(0.038), 0.080, w(0.036)]),   // biceps
      _ell(_lerp3(sh, el, 0.40).map((v, i) => v + [0, 0, -0.020][i]), [w(0.040), 0.090, w(0.038)]),  // triceps
      _cone(el, wr, w(0.040), w(0.028)),
      _ell(_lerp3(el, wr, 0.22).map((v, i) => v + [s * 0.006, 0, 0.008][i]), [w(0.040), 0.075, w(0.036)]), // forearm flexors
    ];
    const arm = _region(A, 0.030);
    arm.ease = fit.sleeve;
    const lo = [Math.min(top[0], wr[0]) - 0.09, wr[1] - 0.02, Math.min(sh[2], wr[2]) - 0.09];
    const hi = [Math.max(top[0], wr[0]) + 0.09, top[1] + 0.07, Math.max(sh[2], wr[2]) + 0.09];
    arm.bmin = lo; arm.bmax = hi;
    const folds = _foldsAlong(top, wr, [[0.49, 0.10, 0.004 * fit.fold], [0.30, 0.12, 0.0015 * fit.fold], [0.93, 0.05, 0.0025 * fit.fold]], seed + s, 70);
    const cuffC = _lerp3(el, wr, 0.93);
    arm.fold = (x, y, z) => {
      let d = folds(x, y, z);
      if (fit.cuffs) {   // the cuff: a band of doubled cloth just short of the wrist
        const u = (y - cuffC[1]) / 0.012;
        d -= 0.0025 * Math.exp(-u * u);
      }
      return d;
    };
    // Starts inside the shoulder cap, ends at the cuff; the glove takes over.
    arm.cut = (x, y, z) => (wr[1] + 0.012) - y;
    if (fit.pockets) {   // a sleeve pocket on the upper arm, outside face
      const pc = _lerp3(sh, el, 0.34);
      A.push(_box([pc[0] + s * w(0.046), pc[1], pc[2] + 0.004], [0, 1, 0], [0, 0, 1], [0.050, 0.004 + fit.sleeve * 0.2, 0.040], 0.006, 0.012));
    }
    meshWrapped(g, arm, h, s > 0 ? PART.ARM_L_FIELD : PART.ARM_R_FIELD, sh[0], sh[2], 0.30 * kw);
  }

  /* ---- LEGS: trouser leg from inside the pelvis to above the boot ---- */
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const hp = J['upperLeg' + S], kn = J['lowerLeg' + S], an = J['foot' + S];
    const top = [hp[0] - s * 0.012, hp[1] + 0.07, hp[2] - 0.004];
    const ankle = [an[0], an[1] + 0.10, an[2]];
    const L = [
      _cone(top, kn, w(0.088), w(0.052)),
      _ell(_lerp3(hp, kn, 0.45).map((v, i) => v + [s * 0.004, 0, 0.026][i]), [w(0.058), 0.150, w(0.050)]),   // quadriceps
      _ell(_lerp3(hp, kn, 0.40).map((v, i) => v + [0, 0, -0.024][i]), [w(0.055), 0.140, w(0.048)]),          // hamstrings
      _ell(_lerp3(hp, kn, 0.70).map((v, i) => v + [-s * 0.022, 0, 0.004][i]), [w(0.036), 0.090, w(0.040)]),  // adductor / vastus medialis
      _ell([kn[0], kn[1], kn[2] + 0.014], [w(0.050), 0.050, w(0.052)]),                                     // knee
      _cone(kn, ankle, w(0.050), w(0.034)),
      _ell(_lerp3(kn, an, 0.28).map((v, i) => v + [0, 0, -0.030][i]), [w(0.046), 0.095, w(0.042)]),          // calf
    ];
    const leg = _region(L, 0.035);
    leg.ease = fit.leg;
    leg.bmin = [hp[0] - 0.16, ankle[1] - 0.04, hp[2] - 0.15];
    leg.bmax = [hp[0] + 0.16, top[1] + 0.05, hp[2] + 0.15];
    const folds = _foldsAlong(top, ankle, [[0.52, 0.08, 0.0045 * fit.fold], [0.95, 0.06, 0.005 * fit.fold], [0.05, 0.05, 0.002 * fit.fold]], seed + 3 * s, 60);
    leg.fold = folds;
    // Inner-thigh cut keeps the two legs apart; the hem tucks into the boot.
    leg.cut = (x, y, z) => Math.max(y - top[1], (ankle[1] - 0.01) - y, 0.004 - s * x);   // each leg stays on its own side of the midline
    if (fit.pockets) {   // cargo pocket on the outer thigh, with a flap
      const pc = _lerp3(hp, kn, 0.52);
      L.push(_box([pc[0] + s * w(0.074), pc[1], pc[2] + 0.004], [0, 1, 0], [0, 0, 1], [0.078, 0.006 + fit.leg * 0.3, 0.064], 0.008, 0.014));
      L.push(_box([pc[0] + s * w(0.080), pc[1] + 0.066, pc[2] + 0.004], [0, 1, 0], [0, 0, 1], [0.020, 0.008 + fit.leg * 0.3, 0.068], 0.005, 0.006));
    }
    meshWrapped(g, leg, h, s > 0 ? PART.LEG_L_FIELD : PART.LEG_R_FIELD, hp[0], hp[2], 0.48 * kw);
  }
  const clothVerts = g.positions.length / 3;

  /* ---- NECK (skin) ---- */
  const ng = new Geometry(); ng.parts = [];
  {
    const nb = J.neck, hd = J.head;
    const N = [
      /* Full width to half way up, then tapering in to END INSIDE the
         head's own neck stub (94d), up under the jaw: the jaw overhangs
         the join, as it does on a person, so neither open end is on show. */
      _cone([0, 0.492, -0.006], [0, 0.584, 0.002], w(0.056), w(0.053)),
      _cone([0, 0.584, 0.002], [0, 0.616, 0.006], w(0.053), 0.030),
      _ell([0, 0.540, -0.022], [0.060, 0.034, 0.046]),                          // nape
      _ell([0, 0.505, -0.020], [w(0.080), 0.030, w(0.055)]),                   // where the trapezius meets it
      _ell([0.030, 0.545, 0.028], [0.018, 0.045, 0.016]), _ell([-0.030, 0.545, 0.028], [0.018, 0.045, 0.016]), // sternomastoids
    ];
    void nb; void hd;
    const neck = _region(N, 0.02);
    neck.bmin = [-0.12, 0.47, -0.12]; neck.bmax = [0.12, 0.632, 0.12];
    neck.cut = (x, y, z) => Math.max(0.48 - y, y - 0.626);
    meshWrapped(ng, neck, h * 0.9, PART.NECK, 0, 0, 0.40);
  }

  /* ---- BOOTS ---- */
  const bg = new Geometry(); bg.parts = [];
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const an = J['foot' + S];
    const sole = -0.875;
    const B = [
      _cone([an[0], an[1] + 0.13, an[2] - 0.004], [an[0], an[1] + 0.02, an[2] - 0.006], 0.052, 0.050),          // shaft
      _box([an[0] + s * 0.004, sole + 0.040, an[2] + 0.042], [1, 0, 0], [0, 1, 0], [0.048, 0.040, 0.128], 0.030),  // foot
      _ell([an[0] + s * 0.003, sole + 0.042, an[2] + 0.140], [0.046, 0.036, 0.050], 0.03),                      // toe box
      _box([an[0] + s * 0.004, sole + 0.012, an[2] + 0.040], [1, 0, 0], [0, 1, 0], [0.054, 0.012, 0.150], 0.008, 0.01), // sole
      _ell([an[0], sole + 0.050, an[2] - 0.070], [0.042, 0.042, 0.036], 0.03),                                    // heel
    ];
    const boot = _region(B, 0.025);
    boot.bmin = [an[0] - 0.09, sole - 0.02, an[2] - 0.15];
    boot.bmax = [an[0] + 0.09, an[1] + 0.17, an[2] + 0.24];
    boot.cut = (x, y, z) => Math.max(sole - y, y - (an[1] + 0.155));
    // Lacing ridges across the instep.
    boot.fold = (x, y, z) => {
      const dz = z - (an[2] + 0.04), dx = x - an[0];
      if (dz < -0.06 || dz > 0.09 || Math.abs(dx) > 0.03) return 0;
      return -0.0018 * (0.5 + 0.5 * Math.sin((y + dz * 0.7) * 260)) * Math.exp(-dx * dx * 4000);
    };
    _meshRegion(bg, boot, h * 0.85, s > 0 ? PART.LEG_L_FIELD : PART.LEG_R_FIELD, (x, y, z, out) => { out[0] = x * 4 + z * 2; out[1] = y * 4 + z * 2; });
  }

  /* ---- HANDS (gloved or bare, the caller's choice of material) ---- */
  const hg = new Geometry(); hg.parts = [];
  for (const s of [1, -1]) {
    hg.part = s > 0 ? PART.ARM_L : PART.ARM_R;
    const wr = J['hand' + (s > 0 ? 'L' : 'R')];
    buildHand(hg, s, new Vec3(wr[0], wr[1], wr[2]), 14, opts.claw);
  }

  for (const G2 of [g, ng, bg, hg]) {
    while (G2.parts.length < G2.positions.length / 3) G2.parts.push(G2.part || 0);
  }
  void clothVerts;
  g.finalize();
  ng.finalize(); bg.finalize(); hg.finalize();
  hg.computeWeldGroups && hg.computeWeldGroups();
  if (typeof smoothNormals === 'function') smoothNormals(hg);
  g.neckGeo = ng; g.bootGeo = bg; g.handGeo = hg;
  return g;
}
