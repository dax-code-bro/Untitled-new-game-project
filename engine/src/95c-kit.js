/* ============================================================
   THE KIT, FITTED -- the operators' accessories on the MakeHuman figure
   ============================================================

   95b built every accessory out of four shapes -- a slab, a strap, a band
   and a tube -- sized off a torso that no longer exists, and skinned all
   of it to the trunk: the knee pads and the thigh holster rode the hips,
   the helmet rode the neck. On the dressed MakeHuman figure a plate
   carrier came out as two small tiles with its cummerbund and straps
   inside the shirt.

   So the kit is made here the way the clothes and the head were made --
   measured off the dressed body and the skull it goes on:

   SOFT KIT -- cummerbund, belts, leg straps, the holster's platform -- is
   cast: the outermost cloth sampled on a grid of bearings and heights
   round an axis, ironed stiff, and a sheet with a rolled edge laid on it
   (_kRing). Only the outermost layer counts: at the waist the trousers,
   the tucked shirt and the trouser belt are three. Shoulder straps and
   harness straps are lofted down paths cast onto the body and the head.
   Soft kit takes the cloth's own skin weights, point by point.

   HARD KIT -- plate bags, pouches, magazines, the radio, buckles, the
   holster, knee caps, the helmet shell -- is built as panels in the
   frames of what it sits on (_kSlab: a plate's own curve, a knee's, the
   helmet's), with its relief on grid lines so every edge is crisp, and
   rides the surface under it rigidly: a plate does not bend with the ribs.

   HEAD KIT is bound to the head bone.

   Colour is per vertex over a few materials (cordura, polymer, hardware,
   rubber, glass), so a man's kit is a handful of draws however many
   pouches he carries, and each operator's kit is its own colour.
   ============================================================ */

const KIT_MAT = {
  /* Nylon cordura and webbing: the fine weave at a coarser scale than a shirt's, and a little of
     nylon's sheen. White, so the colour comes from the vertices (each operator's kit colour). */
  cordura:  { color: 0xffffff, texture: 'fabric', roughness: 0.80, metalness: 0, uvScale: 16 },
  /* Moulded polymer: magazines, buckles, the holster, knee caps, the radio. Dark on its own. */
  polymer:  { color: 0xffffff, texture: 'polymer', roughness: 0.90, metalness: 0, uvScale: 16 },
  /* Black-oxide steel and anodised aluminium: buckle frames, rails, screws, the NVG mount. */
  hardware: { color: 0x55585c, texture: 'metal', roughness: 0.48, metalness: 1, uvScale: 8 },
  /* The helmet shell: painted, matte, coloured by its vertices. */
  kevlar:   { color: 0xffffff, texture: 'smooth', roughness: 0.74, metalness: 0 },
  rubber:   { color: 0xffffff, texture: 'smooth', roughness: 0.80, metalness: 0 },
  // Night-vision objectives: coated glass, dark green, glossy.
  lens:     { color: 0xffffff, texture: 'smooth', roughness: 0.06, metalness: 0.3 },
  glass:    { color: 0xffffff, texture: 'smooth', roughness: 0.06, metalness: 0, opacity: 0.32, castShadow: false },
  hazmat:   { color: 0xc9c033, texture: 'fabric', roughness: 0.62, metalness: 0, uvScale: 7 },
};

const _kHex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255].map((x) => Math.pow(x, 1.6));
const _kClamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const _kSS = (e0, e1, x) => { const t = _kClamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/* The kit colour each outfit is worn with: contrasting, the way real kit is bought separately from
   the uniform -- coyote webbing on green, green on coyote, black on black. */
const KIT_COLOURS = {
  coyote: 0x4f5238,   // ranger green on a coyote uniform
  olive: 0x7a6546,    // coyote on olive
  black: 0x2c2d2f,
  navy: 0x26282c,
  hazmat: 0x4a4d36,
};

/* ---------------- 2D and solid helpers ---------------- */

// Signed distance to a polygon (flat [x0, y0, x1, y1, ...]), negative inside. After iq.
function _kPoly(px, py, V) {
  const n = V.length / 2;
  let d = (px - V[0]) ** 2 + (py - V[1]) ** 2, s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const ex = V[j * 2] - V[i * 2], ey = V[j * 2 + 1] - V[i * 2 + 1];
    const wx = px - V[i * 2], wy = py - V[i * 2 + 1];
    const t = _kClamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= V[i * 2 + 1], c2 = py < V[j * 2 + 1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
// A rounded rectangle, half-sizes hx, hy, corner radius r.
function _kRect(u, v, hx, hy, r) {
  const qx = Math.abs(u) - hx + r, qy = Math.abs(v) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/* A BENT FRAME: the space of a plate. A plate is curved round a vertical axis (a single-curve plate,
   radius R), so the natural coordinates on one are arc length across it (u), height (v) and depth
   off its mid-surface (w, outward positive). zAx(y) places the axis -- behind the body for a front
   plate (dir +1), in front of it for a back plate (dir -1) -- and may lean with height. Everything
   that sits on a plate (pouches, webbing, the radio) is modelled in these coordinates, so it lies on
   the curve instead of on a tangent. */
function _kBent(zAx, R, dir, yc, x0 = 0) {
  return {
    R, dir, yc,
    local(x, y, z) {
      const dz = (z - zAx(y)) * dir, r = Math.hypot(x - x0, dz);
      return [R * Math.atan2(x - x0, dz), y - yc, r - R];
    },
    world(u, v, w) {
      const th = u / R, r = R + w, y = yc + v;
      return [x0 + r * Math.sin(th), y, zAx(y) + r * Math.cos(th) * dir];
    },
    // Outward normal at (u, v).
    out(u) { const th = u / R; return [Math.sin(th), 0, Math.cos(th) * dir]; },
  };
}

// A flat frame, for small hard kit: origin and three unit axes.
function _kFlat(O, U, V, W) {
  return {
    world(u, v, w) { return [O[0] + U[0] * u + V[0] * v + W[0] * w, O[1] + U[1] * u + V[1] * v + W[1] * w, O[2] + U[2] * u + V[2] * v + W[2] * w]; },
    local(x, y, z) { const d = [x - O[0], y - O[1], z - O[2]]; return [d[0] * U[0] + d[1] * U[1] + d[2] * U[2], d[0] * V[0] + d[1] * V[1] + d[2] * V[2], d[0] * W[0] + d[1] * W[1] + d[2] * W[2]]; },
  };
}
// The frame a point on a bent frame's face defines: tangent across, up, out.
function _kFlatOn(fr, u, v, w) {
  const o = fr.world(u, v, w), a = fr.world(u + 0.001, v, w), n = fr.world(u, v, w + 0.001);
  const U = _norm3([a[0] - o[0], a[1] - o[1], a[2] - o[2]]), W = _norm3([n[0] - o[0], n[1] - o[1], n[2] - o[2]]);
  const V = _norm3(_cross3(W, U));
  return _kFlat(o, U, V, W);
}

/* A SLAB, built rather than sampled: a rounded-edged panel of thickness t in a frame's (u, v, w),
   its outline a convex region given by a 2D distance (negative inside), its outer face lifted by a
   relief function. The faces are grids laid in rows of v -- rows placed exactly on the edges the
   relief has (webbing, binding, a panel) so those edges are crisp -- and the two faces are joined by
   a rolled edge of radius rr. For the flat things kit is made of this is a few hundred triangles
   where a sampled field was thousands, and it is sharp where the field was soft.
     o.levels   extra v positions to put grid rows on
     o.nu       samples across each row
     o.relief   (u, v) -> height on the outer face (0 at the edge)
     o.back     false for no back face (a panel that sits on something) */
function _kSlab(g, fr, sd, t, rr, o = {}) {
  // The face region is the outline pulled in by the roll's radius.
  const face = (u, v) => sd(u, v) + rr;
  // Its extent in v, and the span of each row in u, found on the outline itself.
  const span = (v) => {
    let lo = -2, hi = 0;                 // search left from the middle: face(lo) > 0 > face(hi)
    let m0 = 0;
    for (let k = 0; k < 40 && face(m0, v) > 0; k++) m0 = (k % 2 ? 1 : -1) * 0.01 * k;
    if (face(m0, v) > 0) return null;
    lo = m0 - 1; hi = m0;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (face(m, v) > 0) lo = m; else hi = m; }
    const uL = hi;
    lo = m0; hi = m0 + 1;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (face(m, v) > 0) hi = m; else lo = m; }
    return [uL, lo];
  };
  let vmin = 0, vmax = 0;
  { let lo = -2, hi = 0; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (span(m)) hi = m; else lo = m; } vmin = hi + 1e-6;
    lo = 0; hi = 2; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (span(m)) lo = m; else hi = m; } vmax = lo - 1e-6; }
  const step = o.dv || 0.012;
  const lv = new Set();
  for (let v = vmin; v < vmax; v += step) lv.add(+v.toFixed(6));
  lv.add(+vmax.toFixed(6));
  for (const v of o.levels || []) if (v > vmin && v < vmax) lv.add(+v.toFixed(6));
  const levels = [...lv].sort((a, b) => a - b);
  const nu = o.nu || 16;
  const relief = o.relief || (() => 0);
  const P = [], X = [];               // positions, and the direction each vertex should face
  const add = (u, v, w, eu, ev, ew) => {
    const p = fr.world(u, v, w), q = fr.world(u + eu * 1e-3, v + ev * 1e-3, w + ew * 1e-3);
    P.push(p); X.push([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
    return P.length - 1;
  };
  const rowsF = [], rowsB = [], spans = levels.map(span);
  for (let j = 0; j < levels.length; j++) {
    const v = levels[j], sp = spans[j] || [0, 0];
    const rf = [], rb = [];
    for (let i = 0; i <= nu; i++) {
      const u = sp[0] + (sp[1] - sp[0]) * i / nu;
      const edge = j === 0 || j === levels.length - 1 || i === 0 || i === nu;
      rf.push(add(u, v, t / 2 + (edge ? 0 : relief(u, v)), 0, 0, 1));
      if (o.back !== false) rb.push(add(u, v, -t / 2, 0, 0, -1));
    }
    rowsF.push(rf); rowsB.push(rb);
  }
  const T = [];
  const quads = (R, flip) => {
    for (let j = 0; j + 1 < R.length; j++) for (let i = 0; i < nu; i++) {
      const a = R[j][i], b = R[j][i + 1], c = R[j + 1][i + 1], d = R[j + 1][i];
      if (flip) T.push(a, c, b, a, d, c); else T.push(a, b, c, a, c, d);
    }
  };
  quads(rowsF, false);
  if (o.back !== false) quads(rowsB, true);
  // The boundary of the face grid, in order round it: bottom row, right side, top row, left side.
  const J = levels.length - 1, ring = [];
  for (let i = 0; i < nu; i++) ring.push([0, i]);
  for (let j = 0; j < J; j++) ring.push([j, nu]);
  for (let i = nu; i > 0; i--) ring.push([J, i]);
  for (let j = J; j > 0; j--) ring.push([j, 0]);
  const K = o.K || 6, rollIdx = [];
  for (const [j, i] of ring) {
    const v = levels[j], sp = spans[j] || [0, 0], u = sp[0] + (sp[1] - sp[0]) * i / nu;
    const e = 1e-4, gu = face(u + e, v) - face(u - e, v), gv = face(u, v + e) - face(u, v - e), gl = Math.hypot(gu, gv) || 1;
    const nu2 = gu / gl, nv2 = gv / gl;
    const col = [rowsF[j][i]];
    for (let k = 1; k < K; k++) {
      const ph = Math.PI * k / K;
      // Front quarter round, a straight wall, back quarter round.
      const wc = ph <= Math.PI / 2 ? t / 2 - rr : -t / 2 + rr;
      const sn = Math.sin(ph), cs = Math.cos(ph);
      col.push(add(u + nu2 * rr * sn, v + nv2 * rr * sn, wc + rr * cs, nu2 * sn, nv2 * sn, cs));
      if (k === K / 2) col.push(add(u + nu2 * rr, v + nv2 * rr, -t / 2 + rr, nu2, nv2, 0));
    }
    col.push(o.back !== false ? rowsB[j][i] : add(u + nu2 * rr * 0.2, v + nv2 * rr * 0.2, -t / 2, 0, 0, -1));
    rollIdx.push(col);
  }
  for (let b = 0; b < rollIdx.length; b++) {
    const A = rollIdx[b], B2 = rollIdx[(b + 1) % rollIdx.length];
    for (let k = 0; k + 1 < A.length; k++) T.push(A[k], B2[k], B2[k + 1], A[k], B2[k + 1], A[k + 1]);
  }
  // Wind every triangle the way its corners face, then smooth normals from the faces.
  const N = P.map(() => [0, 0, 0]);
  for (let i = 0; i < T.length; i += 3) {
    let a = T[i], b = T[i + 1], c = T[i + 2];
    const pa = P[a], pb = P[b], pc = P[c];
    const n = _cross3([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]);
    const x = [X[a][0] + X[b][0] + X[c][0], X[a][1] + X[b][1] + X[c][1], X[a][2] + X[b][2] + X[c][2]];
    if (n[0] * x[0] + n[1] * x[1] + n[2] * x[2] < 0) { T[i + 1] = c; T[i + 2] = b; n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; b = T[i + 1]; c = T[i + 2]; }
    for (const q of [a, b, c]) { N[q][0] += n[0]; N[q][1] += n[1]; N[q][2] += n[2]; }
  }
  const v0 = g.positions.length / 3;
  for (let q = 0; q < P.length; q++) {
    const n = _norm3(N[q]);
    g.vert(P[q][0], P[q][1], P[q][2], n[0], n[1], n[2], 0, 0);
  }
  for (let i = 0; i < T.length; i += 3) g.tri(v0 + T[i], v0 + T[i + 1], v0 + T[i + 2]);
  return v0;
}

/* ---------------- the context: the body the kit is fitted to ---------------- */

function kitContext(skeleton, o) {
  const B = o.body;
  const P = B.positions, J = B.joints, Wt = B.weights, parts = B.parts, n = P.length / 3;
  const W8 = new Float64Array(n * 8);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { W8[i * 8 + k * 2] = J[i * 4 + k]; W8[i * 8 + k * 2 + 1] = Wt[i * 4 + k]; }
  const cs = 0.025, grid = new Map();
  const key = (i, j, k) => (i + 512) + 1024 * ((j + 512) + 1024 * (k + 512));
  for (let v = 0; v < n; v++) {
    const kk = key(Math.floor(P[v * 3] / cs), Math.floor(P[v * 3 + 1] / cs), Math.floor(P[v * 3 + 2] / cs));
    let a = grid.get(kk);
    if (!a) grid.set(kk, (a = []));
    a.push(v);
  }
  // Every body vertex within r of a point.
  const around = (x, y, z, r, fn) => {
    const r2 = r * r;
    for (let i = Math.floor((x - r) / cs); i <= Math.floor((x + r) / cs); i++)
      for (let j = Math.floor((y - r) / cs); j <= Math.floor((y + r) / cs); j++)
        for (let k = Math.floor((z - r) / cs); k <= Math.floor((z + r) / cs); k++) {
          const a = grid.get(key(i, j, k));
          if (!a) continue;
          for (const v of a) {
            const d2 = (P[v * 3] - x) ** 2 + (P[v * 3 + 1] - y) ** 2 + (P[v * 3 + 2] - z) ** 2;
            if (d2 < r2) fn(v, d2);
          }
        }
  };
  const near = (x, y, z, filt) => {
    for (let r = cs; r < 0.5; r *= 2) {
      let best = -1, bd = Infinity;
      around(x, y, z, r, (v, d2) => { if (d2 < bd && (!filt || filt(v))) { bd = d2; best = v; } });
      if (best >= 0) return best;
    }
    return -1;
  };
  // Every body vertex in a column through (x, y), any depth.
  const column = (x, y, r, fn) => {
    for (let i = Math.floor((x - r) / cs); i <= Math.floor((x + r) / cs); i++)
      for (let j = Math.floor((y - r) / cs); j <= Math.floor((y + r) / cs); j++)
        for (let k = -24; k <= 24; k++) {
          const a = grid.get(key(i, j, k));
          if (!a) continue;
          for (const v of a) if (Math.abs(P[v * 3] - x) < r && Math.abs(P[v * 3 + 1] - y) < r) fn(v);
        }
  };
  const trunk = (v) => parts[v] === PART.BODY;
  const K = {
    skeleton, o, st: o.stature || 1, B, P, parts, W8, n,
    around, near, column, trunk,
    arm: (v) => parts[v] === PART.ARM_L || parts[v] === PART.ARM_R || parts[v] === PART.ARM_L_FIELD || parts[v] === PART.ARM_R_FIELD,
    leg: (v) => parts[v] === PART.LEG_L || parts[v] === PART.LEG_R,
    // The front (sign +1) or back (-1) of the trunk at (x, y): its most extreme z there.
    surfZ(x, y, sign, r = 0.012, filt = trunk) {
      let z = null;
      column(x, y, r, (v) => { if (!filt(v)) return; const q = P[v * 3 + 2]; if (z == null || q * sign > z * sign) z = q; });
      return z;
    },
    // The widest point of the trunk at a height, and its depth.
    at(y0, y1, filt = trunk) {
      let w = 0, zf = -1, zb = 1;
      for (let v = 0; v < n; v++) {
        const y = P[v * 3 + 1];
        if (y < y0 || y > y1 || !filt(v)) continue;
        w = Math.max(w, Math.abs(P[v * 3])); zf = Math.max(zf, P[v * 3 + 2]); zb = Math.min(zb, P[v * 3 + 2]);
      }
      return { w, zf, zb, cz: (zf + zb) / 2, d: (zf - zb) / 2 };
    },
    /* The outermost cloth at a height, on a bearing round a vertical axis through (cx, cz): the
       point, and the horizontal direction out. For placing things on a belt or a thigh. */
    castH(y, ang, cx, cz, filt, dy = 0.010) {
      const dx = Math.sin(ang), dz = Math.cos(ang);
      let best = -1, bp = null;
      K.around(cx + dx * 0.12, y, cz + dz * 0.12, 0.22, (v) => {
        if (filt && !filt(v)) return;
        if (Math.abs(P[v * 3 + 1] - y) > dy) return;
        const qx = P[v * 3] - cx, qz = P[v * 3 + 2] - cz, ql = Math.hypot(qx, qz) || 1;
        if ((qx * dx + qz * dz) / ql > 0.995 && ql > best) { best = ql; bp = v; }
      });
      if (bp == null) return null;
      return { p: [cx + dx * best, y, cz + dz * best], n: [dx, 0, dz], v: bp };
    },
    bone(name) {
      const i = skeleton.index(name);
      const p = new Vec3();
      if (i >= 0) skeleton.bones[i].bindMatrix.getTranslation(p);
      return [p.x, p.y, p.z];
    },
    /* Skin weights: the cloth's own under a point (soft kit takes them vertex by vertex), or the
       cloth's averaged over a patch (hard kit rides that patch rigidly). */
    /* Never from a sleeve unless asked: an arm hangs against the flank and the hip, and kit bound to
       the nearest cloth there went with the hand -- the holster's hanger stretched up to it in a slide. */
    bindNear(x, y, z, filt) { const v = near(x, y, z, filt || ((q) => !K.arm(q))); return v < 0 ? [0, 1, 0, 0, 0, 0, 0, 0] : Array.from(W8.subarray(v * 8, v * 8 + 8)); },
    bindAt(x, y, z, r, filt) {
      const list = [];
      around(x, y, z, r, (v) => { if (filt ? filt(v) : !K.arm(v)) list.push(v); });
      if (!list.length) return K.bindNear(x, y, z, filt);
      return _wMixN(W8, list.map((v) => [v, 1 / list.length]));
    },
    bindBone(name) { const i = skeleton.index(name); return [i < 0 ? 0 : i, 1, 0, 0, 0, 0, 0, 0]; },
  };
  return K;
}

/* ---------------- output: geometry per material, skinned as it is built ---------------- */

function _kGroup(groups, mat) {
  let g = groups.get(mat);
  if (!g) { g = new Geometry(); g.part = PART.BODY; g.setColor(1, 1, 1); g.kj = []; g.kw = []; groups.set(mat, g); }
  return g;
}
// Bind every vertex from v0 on: one weight set, or a function of the vertex.
function _kSeal(g, v0, bind) {
  const n = g.positions.length / 3;
  for (let v = g.kj.length / 4; v < n; v++) {
    const b = typeof bind === 'function' ? bind(v) : bind;
    g.kj.push(b[0], b[2], b[4], b[6]); g.kw.push(b[1], b[3], b[5], b[7]);
  }
  void v0;
}
// Texture coordinates in metres, projected down each vertex's dominant normal axis.
function _kBoxUV(g, v0) {
  const P = g.positions, N = g.normals, U = g.uvs;
  for (let v = v0; v < P.length / 3; v++) {
    const ax = Math.abs(N[v * 3]), ay = Math.abs(N[v * 3 + 1]), az = Math.abs(N[v * 3 + 2]);
    if (ax >= ay && ax >= az) { U[v * 2] = P[v * 3 + 2]; U[v * 2 + 1] = P[v * 3 + 1]; }
    else if (ay >= az) { U[v * 2] = P[v * 3]; U[v * 2 + 1] = P[v * 3 + 2]; }
    else { U[v * 2] = P[v * 3]; U[v * 2 + 1] = P[v * 3 + 1]; }
  }
}
/* DECIMATION: quadric error, by half-edge collapse (Garland & Heckbert, keeping one endpoint of
   each edge instead of solving for a new point -- so every surviving vertex keeps its own normal and
   skin weights). The kit's distant versions are the close one decimated to a few millimetres.
   Open edges are never moved; no collapse may leave a sliver or an edge longer than maxLen.
   Returns the kept vertices and triangles. */
function _kDecimate(P, I, maxErr, maxLen = 0.045) {
  const n = P.length / 3, m = I.length / 3;
  const T = Int32Array.from(I), alive = new Uint8Array(m).fill(1);
  const Q = new Float64Array(n * 10), dead = new Uint8Array(n), ver = new Int32Array(n);
  const vf = Array.from({ length: n }, () => []);
  const fn = new Float64Array(m * 3);
  const faceN = (a, b, c, out) => {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return out;
  };
  const tmp = [0, 0, 0];
  for (let f = 0; f < m; f++) {
    const a = T[f * 3], b = T[f * 3 + 1], c = T[f * 3 + 2];
    vf[a].push(f); vf[b].push(f); vf[c].push(f);
    faceN(a, b, c, tmp);
    const l = Math.hypot(tmp[0], tmp[1], tmp[2]);
    if (l < 1e-14) continue;
    const nx = tmp[0] / l, ny = tmp[1] / l, nz = tmp[2] / l, d = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]);
    const w = l * 0.5;
    fn[f * 3] = nx; fn[f * 3 + 1] = ny; fn[f * 3 + 2] = nz;
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (const v of [a, b, c]) for (let k = 0; k < 10; k++) Q[v * 10 + k] += q[k] * w;
  }
  // Open edges pin their vertices.
  const edgeCount = new Map();
  for (let f = 0; f < m; f++) for (let k = 0; k < 3; k++) {
    const a = T[f * 3 + k], b = T[f * 3 + (k + 1) % 3], key = a < b ? a * n + b : b * n + a;
    edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
  }
  const pinned = new Uint8Array(n);
  for (const [key, c] of edgeCount) if (c !== 2) { pinned[Math.floor(key / n)] = 1; pinned[key % n] = 1; }
  const err = (u, v) => {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], a = u * 10, b = v * 10;
    const q = (k) => Q[a + k] + Q[b + k];
    return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z
      + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9);
  };
  /* A binary heap over typed arrays: the cost, and the entry it indexes (u, v and both stamps).
     An array per entry was a million small allocations on a carrier, most of them stale. */
  let cap = 1 << 16, hn = 0, en = 0;
  let HC = new Float64Array(cap), HE = new Int32Array(cap), EU = new Int32Array(cap), EV = new Int32Array(cap), ES = new Int32Array(cap * 2);
  const grow = () => {
    cap *= 2;
    const g2 = (A, k) => { const B2 = new A.constructor(cap * k); B2.set(A); return B2; };
    HC = g2(HC, 1); HE = g2(HE, 1); EU = g2(EU, 1); EV = g2(EV, 1); ES = g2(ES, 2);
  };
  const push = (c, u, v) => {
    if (en >= cap || hn >= cap) grow();
    const e = en++;
    EU[e] = u; EV[e] = v; ES[e * 2] = ver[u]; ES[e * 2 + 1] = ver[v];
    let i = hn++;
    while (i > 0) { const p2 = (i - 1) >> 1; if (HC[p2] <= c) break; HC[i] = HC[p2]; HE[i] = HE[p2]; i = p2; }
    HC[i] = c; HE[i] = e;
  };
  let topC = 0;
  const pop = () => {
    const e = HE[0]; topC = HC[0];
    const lc = HC[--hn], le = HE[hn];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let s2 = i, sv = lc;
      if (l < hn && HC[l] < sv) { s2 = l; sv = HC[l]; }
      if (r < hn && HC[r] < sv) s2 = r;
      if (s2 === i) break;
      HC[i] = HC[s2]; HE[i] = HE[s2]; i = s2;
    }
    HC[i] = lc; HE[i] = le;
    return e;
  };
  const cand = (u, v) => { if (!pinned[u] && !dead[u] && !dead[v]) push(err(u, v), u, v); };
  for (const key of edgeCount.keys()) { const a = Math.floor(key / n), b = key % n; cand(a, b); cand(b, a); }
  const lim = maxErr * maxErr;
  const nb = [0, 0, 0];
  while (hn > 0) {
    const e = pop(), u = EU[e], v = EV[e];
    if (topC > lim) break;
    if (dead[u] || dead[v] || ver[u] !== ES[e * 2] || ver[v] !== ES[e * 2 + 1]) continue;
    // Would any face of u (not shared with v) flip or collapse, moved onto v?
    let ok = true;
    for (const f of vf[u]) {
      if (!alive[f]) continue;
      const a = T[f * 3], b = T[f * 3 + 1], cc = T[f * 3 + 2];
      if (a === v || b === v || cc === v) continue;
      const A = a === u ? v : a, Bq = b === u ? v : b, Cq = cc === u ? v : cc;
      faceN(A, Bq, Cq, nb);
      const l = Math.hypot(nb[0], nb[1], nb[2]);
      if (l < 1e-12 || (nb[0] * fn[f * 3] + nb[1] * fn[f * 3 + 1] + nb[2] * fn[f * 3 + 2]) / l < 0.3) { ok = false; break; }
      /* No slivers and no long edges: a flat plate decimated freely came out as fans of needles,
         and the field's normals interpolated down a needle streak the shading. */
      const e2 = (p1, p2) => (P[p1 * 3] - P[p2 * 3]) ** 2 + (P[p1 * 3 + 1] - P[p2 * 3 + 1]) ** 2 + (P[p1 * 3 + 2] - P[p2 * 3 + 2]) ** 2;
      const s2 = e2(A, Bq) + e2(Bq, Cq) + e2(Cq, A), mx = Math.max(e2(A, Bq), e2(Bq, Cq), e2(Cq, A));
      if (mx > maxLen * maxLen || 3.464 * l / s2 < 0.18) { ok = false; break; }
    }
    if (!ok) continue;
    for (const f of vf[u]) {
      if (!alive[f]) continue;
      const a = T[f * 3], b = T[f * 3 + 1], cc = T[f * 3 + 2];
      if (a === v || b === v || cc === v) { alive[f] = 0; continue; }
      for (let k = 0; k < 3; k++) if (T[f * 3 + k] === u) T[f * 3 + k] = v;
      faceN(T[f * 3], T[f * 3 + 1], T[f * 3 + 2], nb);
      const l = Math.hypot(nb[0], nb[1], nb[2]) || 1;
      fn[f * 3] = nb[0] / l; fn[f * 3 + 1] = nb[1] / l; fn[f * 3 + 2] = nb[2] / l;
      vf[v].push(f);
    }
    dead[u] = 1;
    for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
    // Everything round v has a new neighbourhood: stamp and re-queue.
    const ring = new Set();
    vf[v] = vf[v].filter((f) => alive[f]);
    for (const f of vf[v]) for (let k = 0; k < 3; k++) { const w = T[f * 3 + k]; if (w !== v) ring.add(w); }
    ver[v]++;
    for (const w of ring) ver[w]++;
    for (const w of ring) { cand(v, w); cand(w, v); }
  }
  const keep = [], tris = [];
  const map = new Int32Array(n).fill(-1);
  for (let f = 0; f < m; f++) {
    if (!alive[f]) continue;
    for (let k = 0; k < 3; k++) {
      const v = T[f * 3 + k];
      if (map[v] < 0) { map[v] = keep.length; keep.push(v); }
      tris.push(map[v]);
    }
  }
  return { keep, tris };
}



// Bench only: the triangles and time a step adds (window.__kitStats).
function _kStat(G, label, fn) {
  const on = typeof window !== 'undefined' && window.__kitStats;
  const t0 = on ? performance.now() : 0, n0 = on ? [...G.values()].reduce((a, g) => a + g.indices.length, 0) : 0;
  fn();
  if (on) window.__kitStats.push({ name: label, ms: Math.round(performance.now() - t0), tris: ([...G.values()].reduce((a, g) => a + g.indices.length, 0) - n0) / 3 });
}

/* A SHEET: a grid of points on the inner face of a band (rows up it, columns along it), each with
   its outward direction, thickness and skin weights, made into a closed solid with a rolled edge all
   round -- two loops if it closes on itself (a belt), one if it does not (a platform). */
function _kSheet(g, rows, closedU, rollTop = true) {
  const R = rows.length, Cn = rows[0].length;
  const P = [], X = [], Bd = [], T = [];
  const add = (p, x, b) => { P.push(p); X.push(x); Bd.push(b); return P.length - 1; };
  const O = [], I = [];
  for (let j = 0; j < R; j++) {
    const ro = [], ri = [];
    for (let i = 0; i < Cn; i++) {
      const q = rows[j][i];
      ri.push(add(q.p, q.n.map((x) => -x), q.b));
      ro.push(add([q.p[0] + q.n[0] * q.th, q.p[1] + q.n[1] * q.th, q.p[2] + q.n[2] * q.th], q.n, q.b));
    }
    O.push(ro); I.push(ri);
  }
  const cols = closedU ? Cn : Cn - 1;
  for (let j = 0; j + 1 < R; j++) for (let i = 0; i < cols; i++) {
    const i2 = (i + 1) % Cn;
    T.push(O[j][i], O[j][i2], O[j + 1][i2], O[j][i], O[j + 1][i2], O[j + 1][i]);
    T.push(I[j][i], I[j + 1][i2], I[j][i2], I[j][i], I[j + 1][i], I[j + 1][i2]);
  }
  const loops = [];
  if (closedU) {
    loops.push([...Array(Cn).keys()].map((i) => [0, i]));
    if (rollTop) loops.push([...Array(Cn).keys()].map((i) => [R - 1, i]));
  } else {
    const L = [];
    for (let i = 0; i < Cn; i++) L.push([0, i]);
    for (let j = 1; j < R; j++) L.push([j, Cn - 1]);
    for (let i = Cn - 2; i >= 0; i--) L.push([R - 1, i]);
    for (let j = R - 2; j >= 1; j--) L.push([j, 0]);
    loops.push(L);
  }
  for (const L of loops) {
    const m = L.length, colsR = [];
    for (let k = 0; k < m; k++) {
      const [j, i] = L[k], q = rows[j][i];
      const [ja, ia] = L[(k - 1 + m) % m], [jb, ib] = L[(k + 1) % m];
      const pa = rows[ja][ia].p, pb = rows[jb][ib].p;
      const t = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      let e = _norm3(_cross3(t, q.n));
      // Away from the grid's interior.
      const ji = Math.min(R - 1, Math.max(0, j + (j === 0 ? 1 : j === R - 1 ? -1 : 0)));
      const ii = closedU ? i : Math.min(Cn - 1, Math.max(0, i + (i === 0 ? 1 : i === Cn - 1 ? -1 : 0)));
      const pin = rows[ji][ii].p;
      if ((q.p[0] - pin[0]) * e[0] + (q.p[1] - pin[1]) * e[1] + (q.p[2] - pin[2]) * e[2] < 0) e = e.map((x) => -x);
      const r = q.th / 2, c = [q.p[0] + q.n[0] * r, q.p[1] + q.n[1] * r, q.p[2] + q.n[2] * r];
      const col = [I[j][i]];
      for (const ph of [Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.25]) {
        const cs = Math.cos(ph), sn = Math.sin(ph);
        const d = [q.n[0] * cs + e[0] * sn, q.n[1] * cs + e[1] * sn, q.n[2] * cs + e[2] * sn];
        col.push(add([c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r], d, q.b));
      }
      col.push(O[j][i]);
      colsR.push(col);
    }
    for (let k = 0; k < m; k++) {
      const A = colsR[k], B2 = colsR[(k + 1) % m];
      for (let q = 0; q < 4; q++) T.push(A[q], B2[q], B2[q + 1], A[q], B2[q + 1], A[q + 1]);
    }
  }
  const N = P.map(() => [0, 0, 0]);
  for (let i = 0; i < T.length; i += 3) {
    let a = T[i], b = T[i + 1], c = T[i + 2];
    const pa = P[a], pb = P[b], pc = P[c];
    const n = _cross3([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]);
    const x = [X[a][0] + X[b][0] + X[c][0], X[a][1] + X[b][1] + X[c][1], X[a][2] + X[b][2] + X[c][2]];
    if (n[0] * x[0] + n[1] * x[1] + n[2] * x[2] < 0) { T[i + 1] = c; T[i + 2] = b; n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; b = T[i + 1]; c = T[i + 2]; }
    for (const q of [a, b, c]) { N[q][0] += n[0]; N[q][1] += n[1]; N[q][2] += n[2]; }
  }
  const v0 = g.positions.length / 3;
  for (let q = 0; q < P.length; q++) { const n = _norm3(N[q]); g.vert(P[q][0], P[q][1], P[q][2], n[0], n[1], n[2], 0, 0); }
  for (let i = 0; i < T.length; i += 3) g.tri(v0 + T[i], v0 + T[i + 1], v0 + T[i + 2]);
  _kBoxUV(g, v0);
  let k = 0;
  _kSeal(g, v0, () => Bd[k++]);
  return v0;
}

/* A CAST BAND: soft kit round an axis -- a belt round the waist, a strap round a thigh, a platform on
   the side of one. The outermost cloth is sampled on a grid of bearings and heights (only the
   outermost: at the waist the trousers, the tucked shirt and the trouser belt are three layers, and
   a band cut from the surface took all three), ironed, and a sheet laid on it.
     y0, y1, ny     heights and rows            a0, a1, na  bearings (0 = forward) and columns
     axis(y)        the axis, [x, z] at a height   filt(v)  which body vertices count
     standoff, th   gap and thickness (th may be (a, y) => ...), relief (a, y) => extra
     smooth         ironing passes; bridged (never dips into a hollow)   clear: room left by the arms */
function _kRing(K, g, o) {
  const closed = o.a1 - o.a0 >= Math.PI * 2 - 1e-6;
  const na = o.na;
  const P = K.P, n = K.n;
  const BINS = 720, bins = Array.from({ length: BINS }, () => []);
  for (let v = 0; v < n; v++) {
    const y = P[v * 3 + 1];
    if (y < o.y0 - 0.03 || y > o.y1 + 0.03 || (o.filt && !o.filt(v))) continue;
    const ax = o.axis(y), a = Math.atan2(P[v * 3] - ax[0], P[v * 3 + 2] - ax[1]);
    const r = Math.hypot(P[v * 3] - ax[0], P[v * 3 + 2] - ax[1]);
    bins[((Math.floor((a + Math.PI) / (2 * Math.PI) * BINS) % BINS) + BINS) % BINS].push([v, y, r]);
  }
  const A = (i) => o.a0 + (o.a1 - o.a0) * i / (closed ? na : na - 1);
  let ys = null;
  if (o.levels) {
    const set = new Set([o.y0, o.y1]);
    for (let y = o.y0; y < o.y1; y += o.dy || 0.02) set.add(+y.toFixed(6));
    for (const y of o.levels) if (y > o.y0 && y < o.y1) set.add(+y.toFixed(6));
    ys = [...set].sort((a, b) => a - b);
  }
  const ny = ys ? ys.length : o.ny;
  const Y = (j) => (ys ? ys[j] : o.y0 + (o.y1 - o.y0) * j / (ny - 1));
  const dy = ys ? 0.008 : Math.max(0.006, (o.y1 - o.y0) / (ny - 1) * 0.6);
  const R = [], Vi = [];
  for (let j = 0; j < ny; j++) {
    const rr = [], vv = [];
    for (let i = 0; i < na; i++) {
      const a = A(i), b = ((Math.floor((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * BINS)) % BINS);
      let best = 0, bv = -1;
      for (let d = -3; d <= 3; d++) for (const [v, y, r] of bins[(b + d + BINS) % BINS]) {
        if (Math.abs(y - Y(j)) < dy && r > best) { best = r; bv = v; }
      }
      rr.push(best); vv.push(bv);
    }
    R.push(rr); Vi.push(vv);
  }
  // Holes (no cloth sampled) carried over from the neighbours along the row.
  for (let j = 0; j < ny; j++) for (let i = 0; i < na; i++) if (!R[j][i]) {
    let a = i - 1, b = i + 1;
    while (a >= 0 && !R[j][a]) a--;
    while (b < na && !R[j][b]) b++;
    if (a >= 0 && b < na) { R[j][i] = R[j][a] + (R[j][b] - R[j][a]) * (i - a) / (b - a); Vi[j][i] = Vi[j][a]; }
    else if (a >= 0) { R[j][i] = R[j][a]; Vi[j][i] = Vi[j][a]; } else if (b < na) { R[j][i] = R[j][b]; Vi[j][i] = Vi[j][b]; }
  }
  // Ironed, bridging hollows: a stiff band lies across the small of the back, it does not dip into it.
  for (let it = 0; it < (o.smooth || 6); it++) {
    const R2 = R.map((r) => r.slice());
    for (let j = 0; j < ny; j++) for (let i = 0; i < na; i++) {
      const il = closed ? (i - 1 + na) % na : Math.max(0, i - 1), ir = closed ? (i + 1) % na : Math.min(na - 1, i + 1);
      const jd = Math.max(0, j - 1), ju = Math.min(ny - 1, j + 1);
      const m = (R[j][il] + R[j][ir] + R[jd][i] + R[ju][i] + 2 * R[j][i]) / 6;
      R2[j][i] = o.dip ? m : Math.max(R[j][i], m);
    }
    for (let j = 0; j < ny; j++) R[j] = R2[j];
  }
  const val = (x, a, y) => (typeof x === 'function' ? x(a, y) : x || 0);
  const rows = [];
  for (let j = 0; j < ny; j++) {
    const row = [];
    for (let i = 0; i < na; i++) {
      const a = A(i), y = Y(j), ax = o.axis(y), nn = [Math.sin(a), 0, Math.cos(a)];
      let so = val(o.standoff, a, y), th = val(o.th, a, y) + val(o.relief, a, y);
      const r = R[j][i];
      if (o.clear != null) {
        const q = [ax[0] + nn[0] * (r + so + th), y, ax[1] + nn[2] * (r + so + th)];
        let best = Infinity;
        K.around(q[0], q[1], q[2], 0.05, (v, d2) => { if (K.arm(v) && d2 < best) best = d2; });
        if (best < Infinity) {
          // How far this point could go out before it met the arm: the arm's distance from the axis.
          let ra = Infinity;
          K.around(q[0], q[1], q[2], 0.05, (v) => { if (K.arm(v)) ra = Math.min(ra, Math.hypot(P[v * 3] - ax[0], P[v * 3 + 2] - ax[1])); });
          const room = Math.max(0.003, ra - r - o.clear);
          if (so + th > room) { const k = room / (so + th); so *= k; th *= k; }
        }
      }
      const b = Vi[j][i] >= 0 ? Array.from(K.W8.subarray(Vi[j][i] * 8, Vi[j][i] * 8 + 8)) : K.bindNear(ax[0] + nn[0] * r, y, ax[1] + nn[2] * r);
      row.push({ p: [ax[0] + nn[0] * (r + so), y, ax[1] + nn[2] * (r + so)], n: nn, th: Math.max(0.0015, th), b });
    }
    rows.push(row);
  }
  if (o.col) g.setColor(o.col[0], o.col[1], o.col[2]);
  return _kSheet(g, rows, closed);
}

/* ---------------- the pieces ---------------- */

/* THE PLATE CARRIER. Two plate bags on the plates' own curve, a cummerbund round the ribs under
   them and two padded shoulder straps -- the bags placed from the chest and the back they rest on,
   the soft parts cut from the shirt.

   A plate is a standard size (a medium SAPI is 24 x 32 cm, a little over 25 x 33 in its bag) with
   its upper corners cut away for the shoulders (the "shooter's cut"), and it is curved one way only,
   round a radius of about 30 cm. It rests on the top of the chest and hangs from there: it touches
   the pectorals and stands clear of the belly, it does not follow the stomach in. */
function kitCarrier(K, G, C) {
  const st = K.st;
  const hu = 0.137, hv = 0.170, t = 0.027, R = 0.30, rc = 0.022;
  const cu = 0.050, cv = 0.058;           // the shooter's cut
  const neck = K.bone('neck'), chest = K.bone('chest');
  // The top of the front bag: at the notch of the breastbone, a hand's width under the neck joint.
  const topF = neck[1] - 0.045 * st, topB = topF + 0.018 * st;
  const fit = (top, sign) => {
    /* The axis (behind the body for the front plate) as far forward as it can go with no sample of
       the chest in front of the plate's inner face: fitted separately at the top and the bottom of
       the plate, and a straight lean between -- the plate lies on the chest and hangs from it. */
    const yc = top - hv;
    const need = (y0, y1) => {
      let zA = -Infinity;
      for (let x = -hu + 0.02; x <= hu - 0.02; x += 0.02) for (let y = y0; y <= y1; y += 0.02) {
        const zs = K.surfZ(x, y, sign);
        if (zs == null) continue;
        // Inner face of the plate at x: axis + (R - t/2) cos(theta), for the arc length x.
        const c = Math.cos(x / (R - t / 2)) * (R - t / 2);
        zA = Math.max(zA, sign * zs + 0.004 * st - c);
      }
      return zA;
    };
    const aTop = need(yc + hv * 0.2, top - 0.01), aBot = need(yc - hv + 0.01, yc + hv * 0.2);
    const yT = yc + hv * 0.6, yB = yc - hv * 0.6;
    const zAx = (y) => sign * (aBot + (aTop - aBot) * _kClamp((y - yB) / (yT - yB), -0.5, 1.5));
    return { yc, frame: _kBent(zAx, R, sign, yc) };
  };
  const F = fit(topF, 1), Bk = fit(topB, -1);
  C.front = F; C.back = Bk; C.plate = { hu, hv, t, R };
  const poly = [
    -hu + rc, -hv + rc, hu - rc, -hv + rc, hu - rc, hv - rc - cv, hu - rc - cu, hv - rc,
    -hu + rc + cu, hv - rc, -hu + rc, hv - rc - cv,
  ];
  const sdOutline = (u, v) => _kPoly(u, v, poly) - rc;
  C.sdOutline = sdOutline;
  /* The face of a bag: webbing rows across its lower half (the pouches' mounting), a hook-and-loop
     panel above them for a name tape, and the bound edge round the whole thing. */
  const rows = (v, v0, nRows, u, uw) => {
    if (Math.abs(u) > uw) return 0;
    let r = 0;
    for (let i = 0; i < nRows; i++) {
      const vc = v0 + 0.0125 + i * 0.050;
      r = Math.max(r, 1 - _kSS(0.0112, 0.0128, Math.abs(v - vc)));
    }
    return r * (1 - _kSS(uw - 0.003, uw, Math.abs(u)));
  };
  const face = (front) => (u, v, d2) => {
    let h = 0.0009 * _kSS(-0.013, -0.010, d2) * (1 - _kSS(-0.004, -0.002, d2));         // the binding
    if (front) {
      h += 0.0026 * rows(v, -hv + 0.030, 3, u, hu - 0.020);
      h += 0.0011 * (1 - _kSS(0.0, 0.003, _kRect(u, v - (hv - 0.090), 0.075, 0.034, 0.006)));   // loop panel
    } else {
      h += 0.0026 * rows(v, -hv + 0.030, 5, u, hu - 0.020);
    }
    return h;
  };
  const col = C.col;
  const g = _kGroup(G, 'cordura');
  // Grid rows on every edge the face's relief has.
  const rowLevels = (n) => {
    const L = [];
    for (let i = 0; i < n; i++) { const vc = -hv + 0.030 + 0.0125 + i * 0.050; L.push(vc - 0.0128, vc - 0.0112, vc + 0.0112, vc + 0.0128); }
    return L;
  };
  const bindLv = [-hv + 0.002, -hv + 0.004, -hv + 0.010, -hv + 0.013, hv - 0.013, hv - 0.010, hv - 0.004, hv - 0.002];
  _kStat(G, 'bags', () => { for (const [B0, front] of [[F, true], [Bk, false]]) {
    const fc = face(front);
    const levels = rowLevels(front ? 3 : 5).concat(bindLv, front ? [hv - 0.124, hv - 0.121, hv - 0.059, hv - 0.056] : []);
    g.setColor(col[0], col[1], col[2]);
    const v0 = _kSlab(g, B0.frame, sdOutline, t, 0.008, { levels, nu: 22, dv: 0.02, relief: (u, v) => fc(u, v, sdOutline(u, v)) });
    _kBoxUV(g, v0);
    const c = B0.frame.world(0, 0, -t / 2);
    _kSeal(g, v0, K.bindAt(c[0], c[1], c[2] - 0.02 * B0.frame.dir, 0.12, K.trunk));
  } });
  // The drag handle: a loop of webbing standing up off the top of the back bag.
  {
    const fr = Bk.frame, v = hv - 0.004;
    const rings = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * i / 10;
      const u = -0.042 * Math.cos(a), vv = v + 0.034 * Math.sin(a);
      const p = fr.world(u, vv, t / 2 + 0.004);
      rings.push({ p: new Vec3(p[0], p[1], p[2]), w: 0.0125, d: 0.0022, e: 3.4 });
    }
    const v0 = g.positions.length / 3;
    loftRings(g, rings, 8, true, true);
    _kBoxUV(g, v0);
    const c = fr.world(0, 0, 0);
    _kSeal(g, v0, K.bindAt(c[0], c[1], c[2], 0.12, K.trunk));
  }

  /* THE CUMMERBUND, round the ribs under both bags: cut from the shirt between two heights, ironed
     stiff, 9 mm of laminate with three rows of webbing on it, thinned where the arms hang against
     it so a sleeve rests on it instead of passing through it. */
  const cy0 = F.yc - hv + 0.010 * st, cy1 = cy0 + 0.165 * st;
  const cRow = (p) => {
    let r = 0;
    for (let i = 0; i < 3; i++) { const vc = cy0 + 0.030 + i * 0.050; r = Math.max(r, 1 - _kSS(0.0105, 0.0135, Math.abs(p[1] - vc))); }
    return 0.0016 * r;
  };
  const cLv = [];
  for (let i = 0; i < 3; i++) { const vc = cy0 + 0.030 + i * 0.050; cLv.push(vc - 0.0135, vc - 0.0105, vc + 0.0105, vc + 0.0135); }
  const czC = K.at(cy0, cy1).cz;
  _kStat(G, 'cummerbund', () => _kRing(K, g, {
    y0: cy0, y1: cy1, levels: cLv, dy: 0.02, a0: -Math.PI, a1: Math.PI, na: 60, axis: () => [0, czC], filt: K.trunk,
    standoff: 0.003, th: 0.006, relief: (a, y) => cRow([0, y]), smooth: 8, clear: 0.002, col,
  }));

  /* THE SHOULDER STRAPS: padded, 54 mm wide, over the top of the shoulder from the top of one bag
     to the top of the other. Not cut from the surface: at the shoulder the shirt and the top of the
     sleeve overlap as two layers, and a strap cut from both came out crumpled. So each strap is a
     path in the plane of the strap, every point of it cast out from inside the shoulder onto the
     outermost cloth in that direction, eased along its length, and a padded strap lofted down it:
     fuller along the middle, rolled at the edges. */
  const xc = 0.105 * st, hw = 0.027 * st;
  for (const sx of [1, -1]) {
    const x = sx * xc;
    const mid = K.at(topF - 0.05, topF);
    const Cp = [x, topF - 0.035 * st, mid.cz];
    const hit = (a) => {
      const dy = Math.sin(a), dz = Math.cos(a);
      let best = 0;
      K.around(Cp[0], Cp[1] + dy * 0.08, Cp[2] + dz * 0.08, 0.14, (v) => {
        if (Math.abs(K.P[v * 3] - x) > 0.016) return;
        const qy = K.P[v * 3 + 1] - Cp[1], qz = K.P[v * 3 + 2] - Cp[2], ql = Math.hypot(qy, qz) || 1;
        if ((qy * dy + qz * dz) / ql > 0.992 && ql > best) best = ql;
      });
      return best;
    };
    const S = [];
    for (let i = 0; i <= 40; i++) {
      const a = -0.55 + (Math.PI + 1.1) * i / 40;
      const r = hit(a);
      if (!r) continue;
      S.push({ a, r });
    }
    for (let it = 0; it < 4; it++) for (let i = 1; i + 1 < S.length; i++) S[i].r = Math.max(S[i].r, (S[i - 1].r + 2 * S[i].r + S[i + 1].r) / 4);
    const pts = [];
    for (const { a, r } of S) {
      const rr = r + 0.0015 * st + 0.005 * st;         // the standoff, and half the strap's thickness
      const p = [x, Cp[1] + Math.sin(a) * rr, Cp[2] + Math.cos(a) * rr];
      const lim = p[2] >= Cp[2] ? topF - 0.010 : topB - 0.010;
      if (p[1] < lim) continue;
      pts.push({ p, n: [0, Math.sin(a), Math.cos(a)] });
    }
    if (pts.length < 3) continue;
    const rings = pts.map((q, i) => ({
      p: new Vec3(q.p[0], q.p[1], q.p[2]), w: hw, d: 0.005 * st, e: 3.0,
      right: new Vec3(1, 0, 0), fwd: new Vec3(q.n[0], q.n[1], q.n[2]), uv: i / (pts.length - 1),
    }));
    g.setColor(col[0], col[1], col[2]);
    const v0 = g.positions.length / 3;
    loftRings(g, rings, 14, true, true, true);      // framed by hand, wound the other way round
    _kBoxUV(g, v0);
    _kSeal(g, v0, (v) => K.bindNear(g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2]));
  }
}

/* MAGAZINE POUCHES across the front bag, open-topped, each with a rifle magazine in it BASEPLATE UP
   (the way they are carried: the hand pulls the base, and the feed lips stay clean) held by a loop
   of shock cord with a pull tab. The magazine is a polymer one: the lower body with its grip ribs
   and the flared baseplate are what show above the pouch. */
function kitMagPouches(K, G, C, n) {
  const F = C.front, fr = F.frame, { hu, hv, t } = C.plate;
  const pw = Math.min(0.070, (2 * hu - 0.030) / n), ph = 0.118, pd = 0.034;
  const vb = -hv + 0.016;                                   // pouch bottoms, just above the bag's bottom edge
  const gc = _kGroup(G, 'cordura'), gp = _kGroup(G, 'polymer');
  const c0 = fr.world(0, 0, 0);
  const bind = K.bindAt(c0[0], c0[1], c0[2] - 0.02, 0.12, K.trunk);
  const magCol = C.magCol || [0.11, 0.11, 0.11];
  for (let i = 0; i < n; i++) {
    const uc = (i - (n - 1) / 2) * pw;
    const wc = t / 2 + pd / 2;
    /* The pouch, in the frame of the bag's face where it sits: a box of cordura whose mouth is a
       stiffened band a millimetre proud, with the seams down its front edges. Its top is the mouth;
       the magazine standing in it fills it, as it does a real one. */
    const pf = _kFlatOn(fr, uc, vb + ph / 2, wc);
    gc.setColor(C.col[0], C.col[1], C.col[2]);
    let v0 = _kSlab(gc, pf, (u, v) => _kRect(u, v, pw / 2 - 0.003, ph / 2, 0.005), pd, 0.0055, {
      nu: 8, dv: 0.024,
      levels: [ph / 2 - 0.021, ph / 2 - 0.017],
      relief: (u, v) => 0.0011 * _kSS(ph / 2 - 0.021, ph / 2 - 0.017, v) - 0.0006 * (1 - _kSS(0.0, 0.002, Math.abs(Math.abs(u) - (pw / 2 - 0.012)))),
    });
    _kBoxUV(gc, v0); _kSeal(gc, v0, bind);
    /* The magazine, baseplate up: the lower body out of the mouth with grip ribs across it, then
       the flared baseplate. */
    const top = vb + ph;
    const mf = _kFlatOn(fr, uc, top - 0.026, wc);
    gp.setColor(magCol[0], magCol[1], magCol[2]);
    const ribs = [];
    for (let k = 0; k < 9; k++) ribs.push(0.028 + k * 0.0028);
    v0 = _kSlab(gp, mf, (u, v) => _kRect(u, v, 0.031, 0.060, 0.006), 0.025, 0.004, {
      nu: 8, dv: 0.03, levels: ribs,
      relief: (u, v) => (v > 0.028 && v < 0.052 ? 0.0006 * (0.5 + 0.5 * Math.cos((v - 0.028) * 2 * Math.PI / 0.0056)) : 0),
    });
    _kBoxUV(gp, v0); _kSeal(gp, v0, bind);
    const bf = _kFlatOn(fr, uc, top + 0.038, wc);
    v0 = _kSlab(gp, bf, (u, v) => _kRect(u, v, 0.0335, 0.0058, 0.004), 0.029, 0.0032, { nu: 8, dv: 0.004, K: 4 });
    _kBoxUV(gp, v0); _kSeal(gp, v0, bind);
    // Shock cord over the baseplate, from the front of the pouch to the back, and its pull tab.
    const rings = [];
    for (let j = 0; j <= 10; j++) {
      const a = Math.PI * j / 10;
      const lw = (pd / 2 + 0.002) * Math.cos(a), lv = top + 0.012 + 0.036 * Math.sin(a);
      const p = fr.world(uc, lv, wc + lw);
      rings.push({ p: new Vec3(p[0], p[1], p[2]), w: 0.0022, d: 0.0022, e: 2 });
    }
    gc.setColor(0.06, 0.06, 0.06);
    v0 = gc.positions.length / 3;
    loftRings(gc, rings, 6, true, true);
    _kBoxUV(gc, v0); _kSeal(gc, v0, bind);
    const tf = _kFlatOn(fr, uc, top + 0.004, wc + pd / 2 + 0.0035);
    gp.setColor(0.07, 0.07, 0.07);
    v0 = _kSlab(gp, tf, (u, v) => _kRect(u, v, 0.009, 0.013, 0.003), 0.0032, 0.0012, { nu: 4, dv: 0.01, K: 4 });
    _kBoxUV(gp, v0); _kSeal(gp, v0, bind);
  }
}

/* A flat frame standing on the cloth at a point, facing out along n (horizontal), up the world. */
function _kFrameOut(p, n, lift) {
  const W = _norm3([n[0], 0, n[2]]), V = [0, 1, 0], U = _norm3(_cross3(V, W));
  return _kFlat([p[0] + W[0] * lift, p[1], p[2] + W[2] * lift], U, V, W);
}
// A tube down a path of points (cables, antennae, shock cord), radius r, into a group.
function _kTube(g, pts, r, r1, col, bind, seg = 7) {
  if (col) g.setColor(col[0], col[1], col[2]);
  const rings = pts.map((p, i) => {
    const t = i / (pts.length - 1), rr = r + ((r1 != null ? r1 : r) - r) * t;
    return { p: new Vec3(p[0], p[1], p[2]), w: rr, d: rr, e: 2 };
  });
  const v0 = g.positions.length / 3;
  loftRings(g, rings, seg, true, true);
  _kBoxUV(g, v0); _kSeal(g, v0, bind);
}
function _kCurve(ctrl, n) {
  // Catmull-Rom through control points, n samples.
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n * (ctrl.length - 1), k = Math.min(ctrl.length - 2, Math.floor(t)), f = t - k;
    const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(ctrl.length - 1, k + 2)];
    out.push([0, 1, 2].map((q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * f + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * f * f + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * f * f * f)));
  }
  return out;
}

/* THE ADMIN POUCH AND THE RADIO. The admin pouch rides high on the front bag above the magazines,
   over the name-tape panel: a zipped body under a flap that carries its own tape. The radio is on the
   back bag, high on the off side, in an open-topped pouch with its antenna up and a push-to-talk
   cable run over the shoulder strap to a switch on the front of it -- kit is never symmetrical on a
   real person, and that asymmetry is most of what makes a rig look like somebody's. */
function kitAdmin(K, G, C) {
  const { hu, hv, t } = C.plate, st = K.st;
  const gc = _kGroup(G, 'cordura'), gp = _kGroup(G, 'polymer'), gh = _kGroup(G, 'hardware');
  const col = C.col, dark = C.col.map((x) => x * 0.55);
  const side = C.o.leftHanded ? -1 : 1;
  if (C.front) {
    const fr = C.front.frame, c0 = fr.world(0, 0, 0), bind = K.bindAt(c0[0], c0[1], c0[2] - 0.02, 0.12, K.trunk);
    const vc = hv - 0.082, pw = 0.150, ph = 0.090, pd = 0.024;
    const f = _kFlatOn(fr, 0, vc, t / 2 + pd / 2);
    gc.setColor(col[0], col[1], col[2]);
    let v0 = _kSlab(gc, f, (u, v) => _kRect(u, v, pw / 2, ph / 2, 0.010), pd, 0.006, { nu: 12, dv: 0.03 });
    _kBoxUV(gc, v0); _kSeal(gc, v0, bind);
    // The flap over its top two thirds, and the name tape on the flap.
    const ff = _kFlatOn(fr, 0, vc + 0.014, t / 2 + pd + 0.003);
    v0 = _kSlab(gc, ff, (u, v) => _kRect(u, v, pw / 2 + 0.003, ph / 2 - 0.012, 0.012), 0.005, 0.0022, {
      nu: 14, dv: 0.02, levels: [-0.019, -0.017, 0.017, 0.019],
      relief: (u, v) => 0.0010 * (1 - _kSS(0.0, 0.002, _kRect(u, v, 0.052, 0.018, 0.003))),
    });
    _kBoxUV(gc, v0); _kSeal(gc, v0, bind);
    const tf = _kFlatOn(fr, 0, vc + 0.014, t / 2 + pd + 0.0065);
    gc.setColor(dark[0], dark[1], dark[2]);
    v0 = _kSlab(gc, tf, (u, v) => _kRect(u, v, 0.050, 0.016, 0.003), 0.0016, 0.0007, { nu: 8, dv: 0.01, K: 4 });
    _kBoxUV(gc, v0); _kSeal(gc, v0, bind);
    // Two zip pulls hanging out from under the flap.
    gp.setColor(0.07, 0.07, 0.07);
    for (const su of [-1, 1]) {
      const zf = _kFlatOn(fr, su * 0.040, vc - ph / 2 + 0.012, t / 2 + pd + 0.002);
      v0 = _kSlab(gp, zf, (u, v) => _kRect(u, v, 0.004, 0.011, 0.0035), 0.0022, 0.0009, { nu: 4, dv: 0.01, K: 4 });
      _kBoxUV(gp, v0); _kSeal(gp, v0, bind);
    }
  }
  if (C.back) {
    const fr = C.back.frame, c0 = fr.world(0, 0, 0), bind = K.bindAt(c0[0], c0[1], c0[2] + 0.02, 0.12, K.trunk);
    const uc = side * 0.070, vc = hv - 0.115, pw = 0.072, ph = 0.130, pd = 0.046;
    const f = _kFlatOn(fr, uc, vc, t / 2 + pd / 2);
    gc.setColor(col[0], col[1], col[2]);
    let v0 = _kSlab(gc, f, (u, v) => _kRect(u, v, pw / 2, ph / 2, 0.008), pd, 0.007, {
      nu: 8, dv: 0.03, levels: [ph / 2 - 0.022, ph / 2 - 0.018],
      relief: (u, v) => 0.0011 * _kSS(ph / 2 - 0.022, ph / 2 - 0.018, v),
    });
    _kBoxUV(gc, v0); _kSeal(gc, v0, bind);
    // The radio: its body out of the pouch, a keypad face, two knobs and the antenna.
    const top = vc + ph / 2;
    const rf = _kFlatOn(fr, uc, top - 0.010, t / 2 + pd / 2);
    gp.setColor(0.08, 0.08, 0.075);
    v0 = _kSlab(gp, rf, (u, v) => _kRect(u, v, 0.030, 0.052, 0.006), 0.036, 0.005, { nu: 8, dv: 0.03 });
    _kBoxUV(gp, v0); _kSeal(gp, v0, bind);
    const kn = (u, r, h) => {
      const a = fr.world(uc + u, top + 0.040, t / 2 + pd / 2), b = fr.world(uc + u, top + 0.040 + h, t / 2 + pd / 2);
      _kTube(gp, [a, b], r, r, [0.06, 0.06, 0.06], bind, 10);
    };
    kn(-0.014, 0.0075, 0.016); kn(0.012, 0.0055, 0.012);
    // The antenna, a flexible whip off the top, leaning back and a little out.
    const a0 = fr.world(uc + 0.012, top + 0.050, t / 2 + pd / 2);
    const tip = [a0[0] + side * 0.03, a0[1] + 0.20 * st, a0[2] - 0.035];
    _kTube(gp, _kCurve([a0, [a0[0] + side * 0.006, a0[1] + 0.07, a0[2] - 0.004], tip], 10), 0.0042, 0.0022, [0.05, 0.05, 0.05], bind, 8);
    // The push-to-talk cable: up out of the radio, over the shoulder on top of the strap, down to a
    // switch on the front of the strap.
    const s0 = fr.world(uc - 0.016, top + 0.040, t / 2 + pd / 2);
    const x = side * 0.105 * st;
    const topS = K.castH(K.bone('neck')[1] - 0.02, 0, x, 0, null);
    const sh = K.near(x, K.bone('neck')[1] + 0.01, 0);
    const ys = sh >= 0 ? K.P[sh * 3 + 1] : K.bone('neck')[1];
    const pF = C.front.frame.world(side * 0.075, C.plate.hv + 0.02, C.plate.t / 2 + 0.012);
    const ctrl = [s0, [s0[0], s0[1] + 0.05, s0[2] - 0.01], [x - side * 0.012, ys + 0.020, -0.03], [x - side * 0.012, ys + 0.022, 0.02], [pF[0], pF[1] + 0.03, pF[2] + 0.004], pF];
    void topS;
    _kTube(gp, _kCurve(ctrl, 28), 0.0028, 0.0028, [0.05, 0.05, 0.05], (v) => K.bindNear(gp.positions[v * 3], gp.positions[v * 3 + 1], gp.positions[v * 3 + 2]), 6);
    const pf = _kFlatOn(C.front.frame, side * 0.075, C.plate.hv + 0.004, C.plate.t / 2 + 0.014);
    gp.setColor(0.06, 0.06, 0.06);
    v0 = _kSlab(gp, pf, (u, v) => _kRect(u, v, 0.016, 0.024, 0.006), 0.014, 0.004, { nu: 6, dv: 0.012, K: 4 });
    _kBoxUV(gp, v0);
    const fc = C.front.frame.world(0, 0, 0);
    _kSeal(gp, v0, K.bindAt(fc[0], fc[1], fc[2] - 0.02, 0.12, K.trunk));
    void gh;
  }
}

/* THE BELT: a padded battle belt over the trousers at the waist, a sleeve standing 4 mm off them
   with two rows of webbing on it, open at the front where the rigger's belt inside it shows and
   closes in a Cobra buckle. On it: pistol magazine pouches on the off side, and a first-aid pouch
   at the small of the back for a man in a plate carrier. */
function kitBelt(K, G, C) {
  const st = K.st, o = C.o;
  const gc = _kGroup(G, 'cordura'), gp = _kGroup(G, 'polymer'), gh = _kGroup(G, 'hardware');
  const side = o.leftHanded ? -1 : 1;
  const waist = 0.100 * st;
  const y0 = waist - 0.052 * st, y1 = waist + 0.004 * st;
  const col = C.col, black = [0.055, 0.055, 0.055];
  const inBelt = (p, v, M) => (M.part[v] === PART.ARM_L || M.part[v] === PART.ARM_R ? 1 : 0);
  const rows = (p) => {
    let r = 0;
    for (let i = 0; i < 2; i++) { const vc = y0 + 0.016 + i * 0.025; r = Math.max(r, 1 - _kSS(0.0060, 0.0075, Math.abs(p[1] - vc))); }
    return 0.0014 * r;
  };
  const notArm = (v) => !K.arm(v);
  const ym = (y0 + y1) / 2, bcz = K.at(y0, y1).cz;
  const bLv = [];
  for (let i = 0; i < 2; i++) { const vc = y0 + 0.016 + i * 0.025; bLv.push(vc - 0.0078, vc - 0.0058, vc + 0.0058, vc + 0.0078); }
  // The sleeve, open over the buckle.
  _kStat(G, 'belt', () => _kRing(K, gc, {
    y0, y1, levels: bLv, dy: 0.02, a0: 0.20, a1: Math.PI * 2 - 0.20, na: 52, axis: () => [0, bcz], filt: notArm,
    standoff: 0.004, th: 0.010, relief: (a, y) => rows([0, y]), smooth: 8, clear: 0.002, col,
  }));
  /* The rigger's belt, 44 mm, where it shows: across the front, its ends tucked into the sleeve. Run
     right round inside the sleeve it pushed through it wherever the two bent differently. */
  _kRing(K, gc, {
    y0: ym - 0.020 * st, y1: ym + 0.020 * st, ny: 4, a0: -0.40, a1: 0.40, na: 12, axis: () => [0, bcz], filt: notArm,
    standoff: 0.004, th: 0.0045, smooth: 8, clear: 0.002, col: black,
  });
  void inBelt;
  // The Cobra buckle at the front.
  const fz = K.surfZ(0, ym, 1, 0.012, (v) => true);
  if (fz != null) {
    const bf = _kFlat([0, ym, fz + 0.012], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const bind = K.bindAt(0, ym, fz, 0.06);
    gh.setColor(0.35, 0.35, 0.36);
    let v0 = _kSlab(gh, bf, (u, v) => _kRect(u, v, 0.030, 0.021, 0.006), 0.010, 0.003, {
      nu: 10, dv: 0.008, levels: [-0.012, -0.010, 0.010, 0.012],
      relief: (u, v) => -0.002 * (1 - _kSS(0.0, 0.0015, _kRect(u, v, 0.012, 0.011, 0.003))),
    });
    _kBoxUV(gh, v0); _kSeal(gh, v0, bind);
    // The two halves' prongs, dark in the middle.
    const pf = _kFlat([0, ym, fz + 0.0175], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    gh.setColor(0.18, 0.18, 0.19);
    v0 = _kSlab(gh, pf, (u, v) => _kRect(u, v, 0.010, 0.009, 0.003), 0.003, 0.0012, { nu: 6, dv: 0.006, K: 4 });
    _kBoxUV(gh, v0); _kSeal(gh, v0, bind);
  }
  const cz = K.at(ym - 0.01, ym + 0.01).cz;
  const onBelt = (ang, lift) => {
    const c = K.castH(ym, ang, 0, cz, (v) => !K.arm(v));
    if (!c) return null;
    return { f: _kFrameOut(c.p, c.n, 0.004 + 0.010 + lift), bind: K.bindAt(c.p[0], c.p[1], c.p[2], 0.06, (v) => !K.arm(v)) };
  };
  // Pistol magazine pouches, two, on the off side front.
  if (o.holster) {
    for (let i = 0; i < 2; i++) {
      const ob = onBelt(-side * (0.55 + i * 0.26), 0.012);
      if (!ob) continue;
      gc.setColor(col[0], col[1], col[2]);
      let v0 = _kSlab(gc, ob.f, (u, v) => _kRect(u, v + 0.012, 0.019, 0.042, 0.006), 0.024, 0.005, { nu: 6, dv: 0.03 });
      _kBoxUV(gc, v0); _kSeal(gc, v0, ob.bind);
      const mf = _kFlat(ob.f.world(0, 0.034, 0), [0, 0, 0], [0, 0, 0], [0, 0, 0]);
      void mf;
      const top = _kFlat(ob.f.world(0, 0.038, 0), ob.f.world(1, 0, 0).map((q, k) => q - ob.f.world(0, 0, 0)[k]),
        [0, 1, 0], ob.f.world(0, 0, 1).map((q, k) => q - ob.f.world(0, 0, 0)[k]));
      gp.setColor(0.09, 0.09, 0.09);
      v0 = _kSlab(gp, top, (u, v) => _kRect(u, v, 0.016, 0.012, 0.004), 0.016, 0.004, { nu: 6, dv: 0.01, K: 4 });
      _kBoxUV(gp, v0); _kSeal(gp, v0, ob.bind);
    }
  }
  // The first-aid pouch at the small of the back, for a man in a carrier: a rolled pouch.
  if (C.front) {
    const ob = onBelt(Math.PI, 0.030);
    if (ob) {
      gc.setColor(col[0] * 0.9, col[1] * 0.9, col[2] * 0.9);
      const v0 = _kSlab(gc, ob.f, (u, v) => _kRect(u, v + 0.012, 0.085, 0.048, 0.024), 0.058, 0.020, { nu: 12, dv: 0.02,
        levels: [-0.016, -0.012], relief: (u, v) => -0.0012 * (1 - _kSS(0.0, 0.002, Math.abs(v + 0.014))) });
      _kBoxUV(gc, v0); _kSeal(gc, v0, ob.bind);
    }
  }
  void gh;
}

/* THE DROP-LEG HOLSTER, on the outside of the strong-side thigh: a hanger strap down from the belt,
   a platform shaped to the thigh held by two elastic leg straps with their buckles in front, and on
   the platform a moulded holster with the pistol's grip, the back of its slide and the retention hood
   standing out of the top. It rides the thigh, not the hips. */
function kitHolster(K, G, C) {
  const st = K.st, o = C.o;
  const side = o.leftHanded ? -1 : 1, S = side > 0 ? 'R' : 'L';   // the right hand draws from the right thigh (-x)
  const sx = side > 0 ? -1 : 1;
  const gc = _kGroup(G, 'cordura'), gp = _kGroup(G, 'polymer'), gh = _kGroup(G, 'hardware');
  const hip = K.bone('upperLeg' + S), knee = K.bone('lowerLeg' + S);
  const legPart = S === 'L' ? PART.LEG_L : PART.LEG_R;
  const onLeg = (v) => K.parts[v] === legPart;
  const axis = (y) => { const t = (y - hip[1]) / (knee[1] - hip[1]); return [hip[0] + (knee[0] - hip[0]) * t, hip[2] + (knee[2] - hip[2]) * t]; };
  const col = C.col, black = [0.055, 0.055, 0.055];
  const yTop = -0.105 * st, yBot = -0.300 * st;
  // The platform: the outside of the thigh between two heights.
  _kStat(G, 'holster', () => {
    const aLat = sx * Math.PI / 2 + sx * 0.10;
    _kRing(K, gc, {
      y0: yBot, y1: yTop, ny: 9, a0: aLat - 0.62, a1: aLat + 0.62, na: 12, axis, filt: onLeg,
      standoff: 0.0045, th: 0.007, smooth: 6, col,
    });
    // Two leg straps, 38 mm, right round the thigh.
    for (const yk of [-0.140 * st, -0.255 * st]) {
      _kRing(K, gc, {
        y0: yk - 0.019, y1: yk + 0.019, ny: 3, a0: -Math.PI, a1: Math.PI, na: 36, axis, filt: onLeg,
        standoff: 0.003, th: 0.004, smooth: 6, col: black,
      });
      // The buckle, on the front of the thigh.
      const a = axis(yk), c = K.castH(yk, sx * 0.35, a[0], a[1], onLeg);
      if (c) {
        const f = _kFrameOut(c.p, c.n, 0.012);
        gp.setColor(0.07, 0.07, 0.07);
        const v0 = _kSlab(gp, f, (u, v) => _kRect(u, v, 0.024, 0.022, 0.007), 0.009, 0.003, { nu: 8, dv: 0.01, K: 4 });
        _kBoxUV(gp, v0); _kSeal(gp, v0, K.bindAt(c.p[0], c.p[1], c.p[2], 0.05, onLeg));
      }
    }
    // The hanger, from the belt down to the platform.
    const aT = axis(yTop), cT = K.castH(yTop + 0.01, sx * Math.PI / 2 + sx * 0.10, aT[0], aT[1], onLeg);
    if (!cT) return;
    const beltY = 0.100 * st - 0.030 * st;
    const cb = K.castH(beltY, Math.atan2(cT.n[0], cT.n[2]), 0, K.at(beltY - 0.01, beltY + 0.01).cz, (v) => !K.arm(v));
    if (cb) {
      const p0 = [cb.p[0] + cb.n[0] * 0.018, beltY, cb.p[2] + cb.n[2] * 0.018], p1 = [cT.p[0] + cT.n[0] * 0.010, yTop + 0.02, cT.p[2] + cT.n[2] * 0.010];
      const rings = _kCurve([p0, [(p0[0] + p1[0]) / 2 + cT.n[0] * 0.004, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2 + cT.n[2] * 0.004], p1], 8).map((q) => ({
        p: new Vec3(q[0], q[1], q[2]), w: 0.024, d: 0.003, e: 3.2, right: new Vec3(-cT.n[2], 0, cT.n[0]), fwd: new Vec3(cT.n[0], 0, cT.n[2]),
      }));
      gc.setColor(col[0], col[1], col[2]);
      const v0 = gc.positions.length / 3;
      loftRings(gc, rings, 8, true, true, sx > 0);
      _kBoxUV(gc, v0);
      _kSeal(gc, v0, (v) => K.bindNear(gc.positions[v * 3], gc.positions[v * 3 + 1], gc.positions[v * 3 + 2]));
    }
    /* The holster, canted a little forward on the platform: a moulded shell the shape of the gun,
       the trigger guard's bulge on its front edge; the grip, the back of the slide and the hood over
       them. */
    const yc = -0.180 * st, a = axis(yc), cc = K.castH(yc, sx * Math.PI / 2 + sx * 0.12, a[0], a[1], onLeg);
    if (!cc) return;
    const W = _norm3([cc.n[0], 0, cc.n[2]]);
    const cant = 0.14;
    const Fw = _norm3(_cross3([0, 1, 0], W));             // forward along the thigh's side, one way or the other
    const fwd = Fw[2] > 0 ? Fw : Fw.map((x) => -x);
    const V = _norm3([fwd[0] * Math.sin(cant), Math.cos(cant), fwd[2] * Math.sin(cant)]);
    const U = _norm3(_cross3(V, W));
    const hc = [cc.p[0] + W[0] * (0.011 + 0.021), yc, cc.p[2] + W[2] * (0.011 + 0.021)];
    const f = _kFlat(hc, U, V, W);
    const bind = K.bindAt(cc.p[0], cc.p[1], cc.p[2], 0.07, onLeg);
    const uSign = (U[0] * fwd[0] + U[2] * fwd[2]) > 0 ? 1 : -1;   // +u toward the front of the thigh
    gp.setColor(0.08, 0.08, 0.08);
    let v0 = _kSlab(gp, f, (u, v) => {
      const uu = u * uSign;
      const body = _kRect(uu - 0.004, v, 0.040, 0.085, 0.014);
      const guard = _kRect(uu - 0.036, v - 0.030, 0.016, 0.028, 0.012);
      return Math.min(body, guard);
    }, 0.040, 0.010, { nu: 12, dv: 0.02 });
    _kBoxUV(gp, v0); _kSeal(gp, v0, bind);
    // The grip, raked back out of the top, and the back of the slide above it.
    const gf = _kFlat(f.world(-uSign * 0.016, 0.110, 0.001), U, V, W);
    const rake = 0.30;
    const gU = U, gV = _norm3([V[0] * Math.cos(rake) - U[0] * uSign * Math.sin(rake), V[1] * Math.cos(rake) - U[1] * uSign * Math.sin(rake), V[2] * Math.cos(rake) - U[2] * uSign * Math.sin(rake)]);
    const gf2 = _kFlat(gf.world(0, 0, 0), _norm3(_cross3(gV, W)), gV, W);
    gp.setColor(0.05, 0.05, 0.05);
    v0 = _kSlab(gp, gf2, (u, v) => _kRect(u, v, 0.015, 0.042, 0.007), 0.028, 0.008, { nu: 6, dv: 0.02,
      levels: [-0.02, -0.018, -0.006, -0.004, 0.008, 0.010, 0.022, 0.024],
      relief: (u, v) => 0.0006 * (0.5 + 0.5 * Math.cos(v * 2 * Math.PI / 0.006)) });
    _kBoxUV(gp, v0); _kSeal(gp, v0, bind);
    const sf = _kFlat(f.world(uSign * 0.010, 0.094, 0.001), U, V, W);
    gh.setColor(0.20, 0.20, 0.21);
    v0 = _kSlab(gh, sf, (u, v) => _kRect(u, v, 0.034, 0.013, 0.004), 0.026, 0.004, { nu: 8, dv: 0.01, K: 4 });
    _kBoxUV(gh, v0); _kSeal(gh, v0, bind);
    // The retention hood, a U over the back of the slide.
    const hf = _kFlat(f.world(-uSign * 0.018, 0.098, 0.001), U, V, W);
    gp.setColor(0.08, 0.08, 0.08);
    v0 = _kSlab(gp, hf, (u, v) => Math.max(_kRect(u, v, 0.010, 0.024, 0.008), -_kRect(u, v + 0.012, 0.004, 0.02, 0.003)), 0.034, 0.005, { nu: 6, dv: 0.01, K: 4 });
    _kBoxUV(gp, v0); _kSeal(gp, v0, bind);
  });
}

/* KNEE PADS: a hard polymer cap over a foam pad on the front of each knee, held by two straps round
   the leg above and below it. The cap is a piece of a shell over the knee as it is -- measured off
   the trouser -- and rides the knee; the straps are cut from the trouser leg. */
function kitKnees(K, G, C) {
  const st = K.st;
  const gc = _kGroup(G, 'cordura'), gp = _kGroup(G, 'polymer');
  const col = C.col, black = [0.055, 0.055, 0.055];
  for (const S of ['L', 'R']) {
    const kn = K.bone('lowerLeg' + S), hip = K.bone('upperLeg' + S), an = K.bone('foot' + S);
    const legPart = S === 'L' ? PART.LEG_L : PART.LEG_R;
    const onLeg = (v) => K.parts[v] === legPart;
    /* The leg's own middle at the knee, measured off the trouser: the knee joint is not at the
       middle of the leg's section, and pads centred on it sat on the inside of each knee. */
    {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let v = 0; v < K.n; v++) {
        if (!onLeg(v) || Math.abs(K.P[v * 3 + 1] - kn[1]) > 0.012) continue;
        x0 = Math.min(x0, K.P[v * 3]); x1 = Math.max(x1, K.P[v * 3]); z0 = Math.min(z0, K.P[v * 3 + 2]); z1 = Math.max(z1, K.P[v * 3 + 2]);
      }
      if (x1 > x0) { kn[0] = (x0 + x1) / 2; kn[2] = (z0 + z1) / 2; }
    }
    // The front of the knee, and the leg's axis there.
    const c = K.castH(kn[1] + 0.005 * st, 0, kn[0], kn[2], onLeg, 0.012);
    if (!c) continue;
    const zf = c.p[2];
    const bind = K.bindAt(kn[0], kn[1] - 0.02, zf, 0.06, onLeg);
    /* The pad and its cap, on a frame curved round the leg (the knee's own curve across it): the
       foam pad a soft slab, the cap a harder, domed one on it -- highest over the kneecap, with a
       ridge across it where the cap flexes. */
    const R0 = zf - kn[2];
    const fr = _kBent(() => kn[2], R0 + 0.004, 1, kn[1] - 0.012 * st, kn[0]);
    gc.setColor(0.07, 0.07, 0.07);
    let v0 = _kSlab(gc, fr, (u, v) => _kRect(u, v, 0.058 * st, 0.090 * st, 0.030), 0.014, 0.0065, { nu: 12, dv: 0.02, back: true });
    _kSeal(gc, v0, bind);
    const fr2 = _kBent(() => kn[2], R0 + 0.004 + 0.014, 1, kn[1] - 0.004 * st, kn[0]);
    const hu = 0.048 * st, hv = 0.068 * st;
    gp.setColor(...(C.capCol || [0.09, 0.09, 0.09]));
    v0 = _kSlab(gp, fr2, (u, v) => _kRect(u, v, hu, hv, 0.028), 0.006, 0.0028, {
      nu: 14, dv: 0.012, levels: [-0.006, -0.004, 0.004, 0.006],
      relief: (u, v) => {
        const d = 1 - (u / hu) ** 2 * 0.9 - ((v + 0.008) / hv) ** 2;
        return 0.014 * Math.max(0, d) ** 0.8 - 0.0022 * (1 - _kSS(0.002, 0.005, Math.abs(v)));
      },
    });
    _kSeal(gp, v0, bind);
    const legAxis = (y) => {
      const a = y > kn[1] ? hip : an, t = (y - kn[1]) / (a[1] - kn[1]);
      return [kn[0] + (a[0] - kn[0]) * t, kn[2] + (a[2] - kn[2]) * t];
    };
    for (const yk of [kn[1] + 0.075 * st, kn[1] - 0.085 * st]) {
      _kRing(K, gc, {
        y0: yk - 0.0125, y1: yk + 0.0125, ny: 3, a0: -Math.PI, a1: Math.PI, na: 36, axis: legAxis, filt: onLeg,
        standoff: 0.002, th: 0.004, smooth: 6, col: [0.05, 0.05, 0.05],
      });
    }
    void hip; void an;
  }
}

/* ---------------- the head ---------------- */

// Where the skull is, on this skeleton, in the kit's bind space (as 95b's buildGear measures it).
function _kHead(K) {
  const s = K.st, hi = K.skeleton.index('head');
  const seat = (K.o.headPts ? SDF_HEAD_SEAT : 0.011) * s;
  const chinY = (hi >= 0 ? K.skeleton.bones[hi].bindMatrix.e[13] : 0.61 * s) - seat;
  return { headY: chinY + 0.126 * s, chinY, pts: K.o.headPts || null, s };
}
// A smooth curve through (x, y) knots, clamped at the ends (monotone cubic, so it cannot overshoot).
function _kKnots(K2) {
  return (x) => {
    if (x <= K2[0][0]) return K2[0][1];
    for (let i = 0; i + 1 < K2.length; i++) {
      const [x0, y0] = K2[i], [x1, y1] = K2[i + 1];
      if (x <= x1) { const t = (x - x0) / (x1 - x0), h = t * t * (3 - 2 * t); return y0 + (y1 - y0) * h; }
    }
    return K2[K2.length - 1][1];
  };
}

/* THE HELMET: a high-cut ballistic shell, fitted to the skull under it -- lifted until the crown
   clears the lining and grown until no point of the scalp above the rim is outside it (95b's fit).
   Its rim is the shape that makes a modern helmet read as one: down to just above the brow in front,
   cut away high over the ears, dropping to the back of the skull behind; a rubber trim round it.
   On the shell: a rail down each side (slotted), a shroud on the front for a night-vision mount,
   hook-and-loop panels on the top and back, and under it a four-point harness with an adjustment
   dial at the nape. It is bound to the head. */
function kitHelmet(K, G, C) {
  const H = _kHead(K), s = H.s, pts = H.pts;
  let headY = H.headY, k = 1;
  // The rim's height over the head's middle by bearing (0 = the brow): low at the front, high over the ears, down behind.
  const rimAt = _kKnots([[0, 0.021], [0.60, 0.019], [0.86, 0.034], [1.04, 0.058], [1.88, 0.056], [2.20, 0.030], [2.55, 0.000], [Math.PI, -0.016]]);
  const cz = -0.008 * s;
  const ro0 = [0.099 * s, 0.101 * s, 0.111 * s], th = 0.0095 * s;
  const rimA = (a) => headY + rimAt(Math.abs(a)) * s;
  if (pts) {
    let top = -1e9;
    for (let i = 1; i < pts.length; i += 3) top = Math.max(top, pts[i]);
    const inTop = headY + 0.028 * s + ro0[1] - th;
    headY += Math.max(0, top + 0.005 * s - inTop);
    const cy = headY + 0.028 * s;
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i], y = pts[i + 1], z = pts[i + 2];
      if (y < rimA(Math.atan2(x, z - cz))) continue;
      k = Math.max(k, 1.014 * Math.hypot(x / (ro0[0] - th), (y - cy) / (ro0[1] - th), (z - cz) / (ro0[2] - th)));
    }
    k = Math.min(k, 1.25);
  }
  const cy = headY + 0.028 * s;
  const ro = ro0.map((r) => r * k), ri = ro.map((r) => r - th);
  const bind = K.bindBone('head');
  const rim = (x, z) => rimA(Math.atan2(x, z - cz));
  // A point on an ellipsoid of radii E at a bearing and a height, and its normal.
  const onE = (E, a, y) => {
    const dy = (y - cy) / E[1], f = Math.sqrt(Math.max(0, 1 - dy * dy));
    const x = Math.sin(a) * E[0] * f, z = cz + Math.cos(a) * E[2] * f;
    return { p: [x, y, z], n: _norm3([x / (E[0] * E[0]), (y - cy) / (E[1] * E[1]), (z - cz) / (E[2] * E[2])]) };
  };
  const onShell = (a, y, lift) => { const q = onE(ro, a, y); return { p: q.p.map((c, i) => c + q.n[i] * lift), n: q.n }; };
  C.helmet = { headY, cy, cz, ro, rim, k };
  C.onShell = onShell;
  const gk = _kGroup(G, 'kevlar'), gp = _kGroup(G, 'polymer'), gh = _kGroup(G, 'hardware'), gc = _kGroup(G, 'cordura');
  const shellCol = C.helmetCol || C.col;
  /* THE SHELL, built on its own lines: rows from the rim up to the crown, columns round it. The
     inner face is the lining's ellipsoid, the outer 9.5 mm out, and the rolled edge the sheet puts on
     the rim is the rubber trim. The rim is exactly the curve above -- a sampled shell cut along it
     came out ragged. */
  _kStat(G, 'shell', () => {
    const na = 72, nt = 18, rows = [];
    for (let j = 0; j <= nt; j++) {
      const row = [];
      for (let i = 0; i < na; i++) {
        const a = -Math.PI + 2 * Math.PI * i / na, y0 = rimA(a), top = cy + ri[1];
        const t = j / nt, y = y0 + (top - y0) * (1 - (1 - t) * (1 - t) * 0.0 - 0) * t ** 0.9;
        const q = onE(ri, a, Math.min(y, top - 1e-5));
        row.push({ p: q.p, n: q.n, th, b: bind });
      }
      rows.push(row);
    }
    gk.setColor(shellCol[0], shellCol[1], shellCol[2]);
    _kSheet(gk, rows, true, false);
  });
  /* THE RAILS: 24 mm tall, 7 mm proud, round each side from the temple to behind the ear just above
     the rim, with a slot every 16 mm along them. */
  for (const sgn of [1, -1]) {
    const na = 64, rows = [];
    for (let j = 0; j < 5; j++) {
      const row = [];
      for (let i = 0; i < na; i++) {
        const a = sgn * (1.0 + 1.25 * i / (na - 1)), y = rimA(a) + (0.007 + 0.022 * j / 4) * s;
        const q = onE(ro, a, y);
        const arc = Math.abs(a) * ro[0], ph = (arc / 0.016) % 1;
        const slot = j >= 1 && j <= 3 && Math.abs(ph - 0.5) < 0.18;
        row.push({ p: q.p.map((c, k2) => c + q.n[k2] * 0.0005), n: q.n, th: slot ? 0.0028 : 0.0070, b: bind });
      }
      rows.push(row);
    }
    gp.setColor(0.06, 0.06, 0.06);
    _kSheet(gp, rows, false);
  }
  // THE SHROUD on the front, three holes in it for the mount.
  const sh = onShell(0, rimA(0) + 0.032 * s, 0.0008);
  const sf = _kFlat(sh.p, [1, 0, 0], _norm3(_cross3(sh.n, [1, 0, 0])), sh.n);
  gh.setColor(0.13, 0.13, 0.14);
  let v0 = _kSlab(gh, sf, (u, v) => _kRect(u, v, 0.028 * s, 0.018 * s, 0.007), 0.005 * s, 0.002, { nu: 10, dv: 0.008 });
  _kSeal(gh, v0, bind);
  /* HOOK-AND-LOOP, in the kit's colour: a panel over the crown and one across the back, each a thin
     sheet laid on the shell. */
  const patch = (rowsFn) => { const rows = rowsFn(); gc.setColor(C.col[0], C.col[1], C.col[2]); _kSheet(gc, rows, false); };
  patch(() => {
    const rows = [];
    for (let j = 0; j <= 8; j++) {
      const row = [], zz = cz - 0.052 * s + 0.112 * s * j / 8;
      for (let i = 0; i <= 8; i++) {
        const xx = -0.046 * s + 0.092 * s * i / 8;
        const q2 = (xx / ro[0]) ** 2 + ((zz - cz) / ro[2]) ** 2, yy = cy + ro[1] * Math.sqrt(Math.max(0, 1 - q2));
        const n = _norm3([xx / (ro[0] * ro[0]), (yy - cy) / (ro[1] * ro[1]), (zz - cz) / (ro[2] * ro[2])]);
        row.push({ p: [xx + n[0] * 0.0004, yy + n[1] * 0.0004, zz + n[2] * 0.0004], n, th: 0.0016, b: bind });
      }
      rows.push(row);
    }
    return rows;
  });
  patch(() => {
    const rows = [];
    for (let j = 0; j <= 4; j++) {
      const row = [], y = headY + (0.026 + 0.040 * j / 4) * s;
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI - 0.42 + 0.84 * i / 12, q = onE(ro, a, y);
        row.push({ p: q.p.map((c, k2) => c + q.n[k2] * 0.0004), n: q.n, th: 0.0016, b: bind });
      }
      rows.push(row);
    }
    return rows;
  });
  /* THE HARNESS: a chin strap from the rim in front of each ear, under the jaw; and a strap from the
     rim behind each ear down to the adjustment dial at the nape. Laid on the head's own points; a
     point the cast misses is left out rather than left floating. */
  const gcBind = bind;
  const ribbon = (run) => {
    if (run.length < 3) return;
    const N = run.length - 1, C0 = [0, headY - 0.02 * s, -0.01 * s];
    const rings = run.map((p, i) => {
      const a = run[Math.max(0, i - 1)], b2 = run[Math.min(N, i + 1)];
      const dir = _norm3([b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]]);
      let nrm = [p[0] - C0[0], p[1] - C0[1], p[2] - C0[2]];
      const dd = nrm[0] * dir[0] + nrm[1] * dir[1] + nrm[2] * dir[2];
      nrm = _norm3([nrm[0] - dir[0] * dd, nrm[1] - dir[1] * dd, nrm[2] - dir[2] * dd]);
      const rt = _norm3(_cross3(dir, nrm));
      return { p: new Vec3(p[0], p[1], p[2]), w: 0.0085 * s, d: 0.0018 * s, e: 3.2, right: new Vec3(rt[0], rt[1], rt[2]), fwd: new Vec3(nrm[0], nrm[1], nrm[2]), uv: i / N };
    });
    gc.setColor(0.05, 0.05, 0.05);
    const v1 = gc.positions.length / 3;
    loftRings(gc, rings, 8, true, true);
    _kBoxUV(gc, v1); _kSeal(gc, v1, gcBind);
  };
  if (pts) {
    const Cq = [0, headY - 0.030 * s, -0.004 * s];
    const hug = (p) => {
      const d = _norm3([p[0] - Cq[0], p[1] - Cq[1], p[2] - Cq[2]]);
      let best = -1;
      for (let i = 0; i < pts.length; i += 3) {
        const qx = pts[i] - Cq[0], qy = pts[i + 1] - Cq[1], qz = pts[i + 2] - Cq[2], ql = Math.hypot(qx, qy, qz) || 1;
        if ((qx * d[0] + qy * d[1] + qz * d[2]) / ql > 0.9965 && ql > best) best = ql;
      }
      if (best < 0) return null;
      const r = best + 0.0028 * s;
      return [Cq[0] + d[0] * r, Cq[1] + d[1] * r, Cq[2] + d[2] * r];
    };
    for (const sx of [1, -1]) {
      const front = [], back = [];
      const f0 = onShell(sx * 0.95, rimA(0.95) + 0.004 * s, -0.004 * s).p;
      front.push(f0);
      for (let i = 1; i <= 10; i++) {
        const t = i / 10, q = hug([sx * s * (0.080 - 0.056 * t * t), rimA(0.95) - s * 0.160 * t, s * (0.030 + 0.020 * t * t)]);
        if (q) front.push(q);
      }
      const b0 = onShell(sx * 2.25, rimA(2.25) + 0.004 * s, -0.004 * s).p;
      back.push(b0);
      for (let i = 1; i <= 6; i++) {
        const t = i / 6, a = sx * (2.25 + (Math.PI - 2.25) * t), q = hug(onE(ri, a, rimA(a) - 0.012 * s * t - 0.004 * s).p);
        if (q) back.push(q);
      }
      ribbon(front); ribbon(back);
    }
  }
  // The dial at the nape, under the back of the shell.
  const dq = onE(ri, Math.PI, rimA(Math.PI) - 0.010 * s);
  const dp = [dq.p[0], dq.p[1], dq.p[2] - 0.004 * s];
  _kTube(gp, [dp, [dp[0], dp[1], dp[2] - 0.010 * s]], 0.013 * s, 0.012 * s, [0.06, 0.06, 0.06], bind, 14);
  void gh; void v0;
}

/* NIGHT VISION, flipped up: a mount on the shroud, and a binocular on it -- two tubes on a bridge,
   objective lenses up, eyepiece cups toward the shell -- with its battery pack on the back of the
   helmet as a counterweight and the cable from it run over the top. */
function kitNVG(K, G, C) {
  const Hm = C.helmet;
  if (!Hm) return;
  const s = K.st, bind = K.bindBone('head');
  const gp = _kGroup(G, 'polymer'), gh = _kGroup(G, 'hardware'), gl = _kGroup(G, 'lens'), gc = _kGroup(G, 'cordura');
  const yS = Hm.rim(0, 1) + 0.032 * s;
  const base = C.onShell(0, yS, 0.005 * s);
  // Up the shell at the front, and out from it.
  const up = _norm3(_cross3(base.n, [1, 0, 0])), out = base.n;
  const at = (a, b) => [base.p[0] + up[0] * a + out[0] * b, base.p[1] + up[1] * a + out[1] * b, base.p[2] + up[2] * a + out[2] * b];
  // The mount: a short arm off the shroud, out and up.
  _kTube(gh, [at(0, 0), at(0.018 * s, 0.012 * s), at(0.034 * s, 0.022 * s)], 0.0065 * s, 0.006 * s, [0.12, 0.12, 0.13], bind, 8);
  // The bridge, and two tubes lying up the front of the shell, objectives up, cups toward the brow.
  const bc = at(0.040 * s, 0.030 * s);
  const bf = _kFlat(bc, [1, 0, 0], up, out);
  gp.setColor(0.07, 0.07, 0.07);
  let v0 = _kSlab(gp, bf, (u, v) => _kRect(u, v, 0.026 * s, 0.013 * s, 0.006), 0.022 * s, 0.006, { nu: 10, dv: 0.008, K: 4 });
  _kSeal(gp, v0, bind);
  const ax = _norm3([up[0] + out[0] * 0.25, up[1] + out[1] * 0.25, up[2] + out[2] * 0.25]);
  for (const sx of [1, -1]) {
    const c0 = [bc[0] + sx * 0.027 * s - ax[0] * 0.012 * s, bc[1] - ax[1] * 0.012 * s, bc[2] - ax[2] * 0.012 * s];
    const c1 = [c0[0] + ax[0] * 0.046 * s, c0[1] + ax[1] * 0.046 * s, c0[2] + ax[2] * 0.046 * s];
    _kTube(gp, [c0, [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2], c1], 0.0135 * s, 0.0150 * s, [0.075, 0.075, 0.075], bind, 16);
    _kTube(gl, [c1, [c1[0] + ax[0] * 0.002, c1[1] + ax[1] * 0.002, c1[2] + ax[2] * 0.002]], 0.0125 * s, 0.0125 * s, [0.20, 0.36, 0.30], bind, 16);
    const e1 = [c0[0] - ax[0] * 0.012 * s, c0[1] - ax[1] * 0.012 * s, c0[2] - ax[2] * 0.012 * s];
    _kTube(gp, [c0, e1], 0.0120 * s, 0.0135 * s, [0.035, 0.035, 0.035], bind, 14);
  }
  // Battery pack on the back panel, and its cable over the crown to the mount.
  const bp = C.onShell(Math.PI, Hm.headY + 0.046 * s, 0.013 * s);
  const pf = _kFlat(bp.p, [-1, 0, 0], _norm3(_cross3(bp.n, [-1, 0, 0])), bp.n);
  gc.setColor(C.col[0] * 0.8, C.col[1] * 0.8, C.col[2] * 0.8);
  v0 = _kSlab(gc, pf, (u, v) => _kRect(u, v, 0.034 * s, 0.020 * s, 0.009), 0.024 * s, 0.008, { nu: 10, dv: 0.01 });
  _kSeal(gc, v0, bind);
  const path = [];
  // Polar angle in the midline plane, measured from the back: the pack's top, over the crown, to the mount.
  const pol = (y) => Math.acos(_kClamp((y - Hm.cy) / Hm.ro[1], -1, 1));
  const phB = pol(bp.p[1] + 0.022 * s), phF = pol(yS + 0.030 * s);
  for (let i = 0; i <= 18; i++) {
    const tt = i / 18, ph = phB + (-phF - phB) * tt;          // phB behind (+), through 0 at the crown, to -phF in front
    const y = Hm.cy + Math.cos(ph) * (Hm.ro[1] + 0.004 * s), z = Hm.cz - Math.sin(ph) * (Hm.ro[2] + 0.004 * s);
    path.push([0.014 * s, y, z]);
  }
  _kTube(gp, path, 0.0022 * s, 0.0022 * s, [0.04, 0.04, 0.04], bind, 6);
}

/* GOGGLES: a frame in rubber, a tinted lens set in it, and a wide strap round the back -- pushed up
   onto the forehead for a bare head (Destroyer), or onto the front of the helmet (SWAT), the strap
   round whichever it is on. */
function kitGoggles(K, G, C) {
  const H = _kHead(K), s = H.s, bind = K.bindBone('head');
  const gr = _kGroup(G, 'rubber'), gl = _kGroup(G, 'glass'), gc = _kGroup(G, 'cordura');
  const Hm = C.helmet;
  // The surface they sit on: the helmet's shell, or the skull (sampled from the head's points).
  let y, radius, cz;
  if (Hm) {
    y = Hm.rim(0, Hm.ro[2]) + 0.045 * s; cz = Hm.cz;
    radius = (a) => { const dy = (y - Hm.cy) / Hm.ro[1], f = Math.sqrt(Math.max(0.02, 1 - dy * dy)); return 1 / Math.hypot(Math.sin(a) / (Hm.ro[0] * f), Math.cos(a) / (Hm.ro[2] * f)); };
  } else {
    y = H.headY + 0.058 * s; cz = -0.004 * s;
    const P = H.pts;
    radius = (a) => {
      let best = 0;
      if (P) for (let i = 0; i < P.length; i += 3) {
        if (Math.abs(P[i + 1] - y) > 0.008) continue;
        const qx = P[i], qz = P[i + 2] - cz, ql = Math.hypot(qx, qz);
        if ((qx * Math.sin(a) + qz * Math.cos(a)) / (ql || 1) > 0.993 && ql > best) best = ql;
      }
      return best || 0.085 * s;
    };
  }
  const Rf = radius(0);
  // Frame and lens on a frame curved round the forehead.
  const fr = _kBent(() => cz, Rf + 0.003 * s + 0.008 * s, 1, y);
  const outline = (u, v) => {
    const e = Math.hypot(u / (0.084 * s), v / (0.036 * s)) - 1;
    const nose = 0.030 * s - Math.hypot(u, v + 0.046 * s);
    return Math.max(e * 0.035 * s, nose);
  };
  gr.setColor(0.08, 0.08, 0.08);
  let v0 = _kSlab(gr, fr, outline, 0.016 * s, 0.006 * s, { nu: 20, dv: 0.008 });
  _kSeal(gr, v0, bind);
  const fl = _kBent(() => cz, Rf + 0.003 * s + 0.017 * s, 1, y + 0.002 * s);
  gl.setColor(0.10, 0.12, 0.13);
  v0 = _kSlab(gl, fl, (u, v) => outline(u, v) + 0.006 * s, 0.003 * s, 0.0012, { nu: 20, dv: 0.008, K: 4 });
  _kSeal(gl, v0, bind);
  // The strap, 40 mm, from one side of the frame round the back to the other.
  const rings = [];
  const a0 = 0.084 * s / Rf * 0.92;
  for (let i = 0; i <= 28; i++) {
    const a = a0 + (Math.PI * 2 - 2 * a0) * i / 28, r = radius(a) + 0.0025 * s;
    const p = [Math.sin(a) * r, y, cz + Math.cos(a) * r], n = [Math.sin(a), 0, Math.cos(a)];
    rings.push({ p: new Vec3(p[0], p[1], p[2]), w: 0.020 * s, d: 0.0016 * s, e: 3.4, right: new Vec3(0, 1, 0), fwd: new Vec3(n[0], n[1], n[2]), uv: i / 28 });
  }
  gc.setColor(0.07, 0.07, 0.07);
  v0 = gc.positions.length / 3;
  loftRings(gc, rings, 8, true, true);
  _kBoxUV(gc, v0); _kSeal(gc, v0, bind);
}

/* THE HAZMAT HOOD AND ITS VISOR. A loose hood over the head, falling from the crown past the jaw and
   spreading onto the shoulders as a cape, cast from the skull and the shoulders under it and eased
   well off both, with soft folds where it hangs below the chin. The front is open where the visor is:
   a clear curved panel sealed in with a rubber gasket round its edge. The hood rides the head at the
   top and the shoulders at its hem, blended between. */
function kitHood(K, G, C) {
  const H = _kHead(K), s = H.s, pts = H.pts;
  const gz = _kGroup(G, 'hazmat'), gl = _kGroup(G, 'glass'), gr = _kGroup(G, 'rubber');
  const head = K.bindBone('head');
  let top = H.headY + 0.126 * s;
  if (pts) { top = -1e9; for (let i = 1; i < pts.length; i += 3) top = Math.max(top, pts[i]); }
  const cz = -0.004 * s;
  const yTop = top + 0.022 * s, yBot = K.bone('neck')[1] - 0.070 * s;
  // The radius of whatever is under the hood at a height and bearing: the skull, then the shoulders.
  const na = 48, ys = [];
  const nr = 22;
  for (let j = 0; j <= nr; j++) ys.push(yBot + (yTop - yBot) * j / nr);
  const headR = (y, a) => {
    let best = 0;
    if (pts) for (let i = 0; i < pts.length; i += 3) {
      if (Math.abs(pts[i + 1] - y) > 0.010 * s) continue;
      const qx = pts[i], qz = pts[i + 2] - cz, ql = Math.hypot(qx, qz) || 1;
      if ((qx * Math.sin(a) + qz * Math.cos(a)) / ql > 0.985 && ql > best) best = ql;
    }
    return best;
  };
  const bodyR = (y, a) => {
    const c = K.castH(y, a, 0, cz, (v) => !K.arm(v) || Math.abs(K.P[v * 3]) < 0.16 * s, 0.012);
    return c ? Math.hypot(c.p[0], c.p[2] - cz) : 0;
  };
  const R = ys.map((y) => { const row = []; for (let i = 0; i < na; i++) { const a = -Math.PI + 2 * Math.PI * i / na; row.push(Math.max(headR(y, a) + 0.026 * s, bodyR(y, a) + 0.012 * s)); } return row; });
  // Where nothing was sampled (between the jaw and the shoulders) the rows either side are joined, and
  // the whole is bridged so the cloth hangs across hollows rather than into them.
  for (let j = 0; j <= nr; j++) for (let i = 0; i < na; i++) if (R[j][i] < 0.03 * s) R[j][i] = 0;
  for (let i = 0; i < na; i++) for (let j = 0; j <= nr; j++) if (!R[j][i]) {
    let a = j - 1, b = j + 1;
    while (a >= 0 && !R[a][i]) a--;
    while (b <= nr && !R[b][i]) b++;
    R[j][i] = a >= 0 && b <= nr ? R[a][i] + (R[b][i] - R[a][i]) * (j - a) / (b - a) : a >= 0 ? R[a][i] : b <= nr ? R[b][i] : 0.1 * s;
  }
  for (let it = 0; it < 6; it++) {
    const R2 = R.map((r) => r.slice());
    for (let j = 1; j < nr; j++) for (let i = 0; i < na; i++) {
      const m = (R[j - 1][i] + R[j + 1][i] + R[j][(i + 1) % na] + R[j][(i - 1 + na) % na] + 2 * R[j][i]) / 6;
      R2[j][i] = Math.max(R[j][i], m);
    }
    for (let j = 0; j <= nr; j++) R[j] = R2[j];
  }
  // The crown is a dome: over its last six centimetres each row draws in, to nothing at the top.
  const y0d = yTop - 0.065 * s;
  for (let j = 0; j <= nr; j++) {
    if (ys[j] <= y0d) continue;
    const f = Math.sqrt(Math.max(0, 1 - ((ys[j] - y0d) / (yTop - y0d)) ** 2));
    for (let i = 0; i < na; i++) R[j][i] = Math.max(0.0005, R[j][i] * f);
  }
  const chinY = H.chinY;
  const bindAt = (p, y) => {
    const t = _kSS(chinY - 0.02 * s, chinY + 0.03 * s, y);
    if (t >= 0.999) return head;
    const b = K.bindNear(p[0], p[1], p[2], (v) => !K.arm(v));
    if (t <= 0.001) return b;
    // Blend the body's weights toward the head's.
    const out = b.slice(); for (let q = 1; q < 8; q += 2) out[q] *= (1 - t);
    let hi = -1; for (let q = 0; q < 8; q += 2) if (out[q] === head[0]) hi = q;
    if (hi < 0) { let lo = 1; for (let q = 3; q < 8; q += 2) if (out[q] < out[lo]) lo = q; out[lo - 1] = head[0]; out[lo] = t; } else out[hi + 1] += t;
    const sum = out[1] + out[3] + out[5] + out[7]; for (let q = 1; q < 8; q += 2) out[q] /= sum;
    return out;
  };
  // The visor's window: a band of bearings round the front between two heights.
  const vTop = H.headY + 0.050 * s, vBot = chinY + 0.004 * s, vHalf = 0.95;
  const inWindow = (y, a) => y > vBot && y < vTop && Math.abs(a) < vHalf;
  const point = (j, i, fold) => {
    const a = -Math.PI + 2 * Math.PI * i / na, y = ys[j];
    const below = 1 - _kSS(chinY - 0.03 * s, chinY + 0.02 * s, y);
    const r = R[j][i] + (fold ? 0.005 * s * below * Math.sin(a * 11 + y * 40) : 0);
    const p = [Math.sin(a) * r, y, cz + Math.cos(a) * r];
    return { p, n: [Math.sin(a), 0, Math.cos(a)], th: 0.0025 * s, b: bindAt(p, y) };
  };
  gz.setColor(1, 1, 1);
  // Above the window, below it (closed rings), and beside it (an open band round the back).
  const jTopW = ys.findIndex((y) => y >= vTop), jBotW = ys.findIndex((y) => y > vBot) - 1;
  const band = (j0, j1, i0, i1, closed) => {
    const rows = [];
    for (let j = j0; j <= j1; j++) {
      const row = [];
      if (closed) for (let i = 0; i < na; i++) row.push(point(j, i, true));
      else for (let i = i0; i <= i1; i++) row.push(point(j, ((i % na) + na) % na, true));
      rows.push(row);
    }
    if (rows.length >= 2) _kSheet(gz, rows, closed, !closed ? true : j1 !== nr);
  };
  band(Math.max(0, jTopW), nr, 0, 0, true);
  band(0, Math.max(1, jBotW), 0, 0, true);
  const iw = Math.ceil(vHalf / (2 * Math.PI) * na);
  band(Math.max(0, jBotW), Math.max(1, jTopW), na / 2 + iw, na / 2 + na - iw, false);
  void inWindow;
  // The visor: a clear panel curved round the face, and the gasket round it.
  const rF = R[Math.round((jBotW + jTopW) / 2)][na / 2];
  const fr = _kBent(() => cz, rF + 0.004 * s, 1, (vTop + vBot) / 2);
  const hw = (rF + 0.004 * s) * vHalf, hh = (vTop - vBot) / 2;
  gl.setColor(0.70, 0.78, 0.76);
  let v0 = _kSlab(gl, fr, (u, v) => _kRect(u, v, hw, hh, 0.030 * s), 0.003 * s, 0.0012, { nu: 18, dv: 0.02, K: 4 });
  _kSeal(gl, v0, head);
  const ring = [];
  for (let i = 0; i < 48; i++) {
    const t = i / 48 * Math.PI * 2, u = Math.cos(t), v = Math.sin(t);
    const sq = (x) => Math.sign(x) * Math.pow(Math.abs(x), 0.35);
    const p = fr.world(sq(u) * hw, sq(v) * hh, 0.0015 * s);
    ring.push({ p: new Vec3(p[0], p[1], p[2]), w: 0.0055 * s, d: 0.0055 * s, e: 2 });
  }
  gr.setColor(0.06, 0.06, 0.06);
  v0 = gr.positions.length / 3;
  loftLoop(gr, ring, 8);
  _kBoxUV(gr, v0); _kSeal(gr, v0, head);
}

/* A distant version of a group, by vertex clustering on a grid of `cell`: each occupied cell keeps
   the member nearest its middle (normal, colour, texture coordinates and skin weights and all), the
   triangles are re-pointed and the ones that collapse are dropped. The kit is hundreds of small
   closed parts, and decimation stalls on them; at six metres a buckle is two pixels. */
function _kLod(g, cell) {
  const P = g.positions, NN = g.normals, n = P.length / 3, key = new Map(), cellOf = new Int32Array(n), sum = [];
  /* Clustered by which way each vertex faces as well as where it is: kit is thin, and the two faces
     of a strap or a helmet shell merged into one cell shaded as blotches of camouflage. */
  const facing = (v) => {
    const x = NN[v * 3], y = NN[v * 3 + 1], z = NN[v * 3 + 2], ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    return ax >= ay && ax >= az ? (x > 0 ? 0 : 1) : ay >= az ? (y > 0 ? 2 : 3) : (z > 0 ? 4 : 5);
  };
  for (let v = 0; v < n; v++) {
    const k = Math.floor(P[v * 3] / cell) + ',' + Math.floor(P[v * 3 + 1] / cell) + ',' + Math.floor(P[v * 3 + 2] / cell) + ',' + facing(v);
    let c = key.get(k);
    if (c == null) { c = sum.length; key.set(k, c); sum.push([0, 0, 0, 0]); }
    cellOf[v] = c; const q = sum[c];
    q[0] += P[v * 3]; q[1] += P[v * 3 + 1]; q[2] += P[v * 3 + 2]; q[3]++;
  }
  const rep = new Int32Array(sum.length).fill(-1), best = new Float64Array(sum.length).fill(Infinity);
  for (let v = 0; v < n; v++) {
    const q = sum[cellOf[v]], m = q[3];
    const d = (P[v * 3] - q[0] / m) ** 2 + (P[v * 3 + 1] - q[1] / m) ** 2 + (P[v * 3 + 2] - q[2] / m) ** 2;
    if (d < best[cellOf[v]]) { best[cellOf[v]] = d; rep[cellOf[v]] = v; }
  }
  const o = new Geometry(), idx = new Int32Array(sum.length).fill(-1), seen = new Set();
  const N = g.normals, U = g.uvs, Cc = g.colors, J = g.joints, W = g.weights, I = g.indices;
  const jj = [], ww = [], cols = Cc ? [] : null;
  const get = (c) => {
    if (idx[c] >= 0) return idx[c];
    const v = rep[c];
    idx[c] = o.positions.length / 3;
    o.positions.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); o.normals.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
    o.uvs.push(U[v * 2], U[v * 2 + 1]); o.parts.push(PART.BODY);
    if (cols) cols.push(Cc[v * 3], Cc[v * 3 + 1], Cc[v * 3 + 2]);
    for (let k = 0; k < 4; k++) { jj.push(J[v * 4 + k]); ww.push(W[v * 4 + k]); }
    return idx[c];
  };
  for (let i = 0; i < I.length; i += 3) {
    const a = cellOf[I[i]], b = cellOf[I[i + 1]], c = cellOf[I[i + 2]];
    if (a === b || b === c || a === c) continue;
    // A face repeated in the same winding goes; the same cells wound the other way (the far side of
    // something thin) stays.
    const wkey = a + '>' + b + '>' + c, w2 = b + '>' + c + '>' + a, w3 = c + '>' + a + '>' + b;
    if (seen.has(wkey) || seen.has(w2) || seen.has(w3)) continue;
    seen.add(wkey);
    o.indices.push(get(a), get(b), get(c));
  }
  if (cols) o.colors = cols;
  o.finalize();
  o.joints = new Float32Array(jj); o.weights = new Float32Array(ww);
  return o;
}

/* ---------------- assembly ---------------- */

const KIT_PIECES = {
  carrier: (K, G, C) => kitCarrier(K, G, C),
  pouches: (K, G, C) => { if (C.front) kitMagPouches(K, G, C, C.o.pouches || 3); },
  admin: (K, G, C) => { if (C.front) kitAdmin(K, G, C); },
  belt: (K, G, C) => { kitBelt(K, G, C); if (C.o.holster) kitHolster(K, G, C); },
  knees: (K, G, C) => kitKnees(K, G, C),
  helmet: (K, G, C) => { kitHelmet(K, G, C); if (C.o.nvg) kitNVG(K, G, C); },
  goggles: (K, G, C) => kitGoggles(K, G, C),
  hood: (K, G, C) => kitHood(K, G, C),
  visor: () => {},                 // built with the hood, sealed into it
};

/* Build an operator's kit on the MakeHuman figure. Pieces this module has taken over are built here;
   the rest still come from 95b, bound properly: head kit to the head bone, the rest by the old
   solver. Returns [{ material, geometry, name }] like buildGear. */
function buildKit(skeleton, list, opts) {
  const K = kitContext(skeleton, opts);
  const G = new Map();
  const outfit = opts.outfit || 'olive';
  const C = { o: opts, col: _kHex(opts.kitColor != null ? opts.kitColor : (KIT_COLOURS[outfit] || 0x4f5238)) };
  // The carrier before what hangs on it, the helmet before the goggles on it.
  const order = ['carrier', 'helmet'].concat(list.filter((n) => n !== 'carrier' && n !== 'helmet'));
  const legacy = [];
  for (const name of order) {
    if (!list.includes(name)) continue;
    if (KIT_PIECES[name]) {
      const t0 = performance.now(), n0 = [...G.values()].reduce((a, g) => a + g.indices.length, 0);
      KIT_PIECES[name](K, G, C);
      // Per-piece cost, for the bench (window.__kitStats, when a page asks for it).
      if (typeof window !== 'undefined' && window.__kitStats) {
        window.__kitStats.push({ name, ms: Math.round(performance.now() - t0), tris: ([...G.values()].reduce((a, g) => a + g.indices.length, 0) - n0) / 3 });
      }
    }
    else legacy.push(name);
  }
  const out = [];
  for (const [mat, g] of G) {
    if (!g.indices.length) continue;
    g.finalize();
    g.joints = new Float32Array(g.kj); g.weights = new Float32Array(g.kw);
    delete g.kj; delete g.kw;
    // Its distant versions, for six metres and for sixteen (the body's own break points).
    out.push({ material: KIT_MAT[mat] || GEAR_MAT[mat], geometry: g, name: mat, far: _kLod(g, 0.016), vfar: _kLod(g, 0.032) });
  }
  if (legacy.length) {
    const HEAD = { helmet: 1, respirator: 1, hood: 1, visor: 1, goggles: 1 };
    const hi = skeleton.index('head');
    for (const part of buildGear(skeleton, legacy, Object.assign({}, opts, { body: null }))) {
      // The head's kit rides the head, not the neck.
      const names = legacy.filter((n) => GEAR_PIECES[n] && GEAR_PIECES[n].mat === part.name);
      if (names.length && names.every((n) => HEAD[n]) && hi >= 0) {
        const n = part.geometry.positions.length / 3;
        part.geometry.joints = new Float32Array(n * 4); part.geometry.weights = new Float32Array(n * 4);
        for (let v = 0; v < n; v++) { part.geometry.joints[v * 4] = hi; part.geometry.weights[v * 4] = 1; }
      }
      const same = out.find((q) => q.name === part.name);
      if (same) out.push(Object.assign(part, { name: part.name + '2' }));
      else out.push(part);
    }
  }
  return out;
}
