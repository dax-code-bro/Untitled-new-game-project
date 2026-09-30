/* =====================================================================
   A BODY THAT IS A REAL BODY
   ---------------------------------------------------------------------
   The same MakeHuman figure the head is cut from (94f), fitted to the
   engine's skeleton and skinned with MakeHuman's own weights.

   THE FIT. MakeHuman stands in an A-pose -- arms out at forty-five degrees,
   elbows bent, feet apart -- and the engine's rig hangs its arms and stands
   its legs straight. Each engine bone gets the rotation and the stretch
   that carry MakeHuman's segment for that bone (the joint at its root to
   the joint at the next) onto the rig's own, and every vertex is moved by
   the blend of those transforms its skin weights give it -- which is to
   say the figure is POSED into the rig's bind pose the way MakeHuman poses
   it, by its own weights, and then bound to the rig with the same weights.

   THE HEAD is not fitted: it keeps exactly the placement the head actor
   gives it (chin on the head bone, less the seat), and the neck bone is
   stretched from the rig's neck to wherever MakeHuman's head joint lands
   under that placement. Below the line of the jaw the weights are moved
   onto the head bone, wholly at the cut, so the body's neck and the rigid
   head share their edge exactly, in every pose. `mhHeadPlace` is that
   placement, for Engine.character to give the head actor.

   THE FEET: the rig's foot bone sits all but on the sole, MakeHuman's ankle
   7 cm above it, so the ankle is mapped to a point that far above the foot
   bone and the soles land on the ground line (-0.875 x stature).
   ===================================================================== */

function _m3FromTo(a, b) {
  // The shortest rotation taking unit vector a to unit vector b (Rodrigues), row-major 3x3.
  const v = _cross3(a, b), c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (c < -0.9999) return [-1, 0, 0, 0, 1, 0, 0, 0, -1];
  const k = 1 / (1 + c);
  return [
    v[0] * v[0] * k + c, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1],
    v[1] * v[0] * k + v[2], v[1] * v[1] * k + c, v[1] * v[2] * k - v[0],
    v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c,
  ];
}
const _m3mul = (R, x, y, z) => [R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z];

function makeMhBodyGeometry(skeleton, opts = {}) {
  const D = _mhDecode();
  const fig = _mhFigure(opts.fig || {});
  const st = opts.stature || 1;
  const P = fig.P, J = fig.J;
  const Q = {};
  for (const b of skeleton.bones) { const v = new Vec3(); b.bindMatrix.getTranslation(v); Q[b.name] = [v.x, v.y, v.z]; }

  /* The head's placement, as the head actor will have it: head-frame metres x k, the chin on the
     head bone less the seat, 6 mm forward. k from the head's height, exactly as Engine.character
     sizes a field-built head (0.262 m from 0.132 under the eyes to the crown). */
  const LM = _mhLandmarks(fig);
  const hf = LM.H, hiY = LM.hiY, chinY = LM.chinY;
  const k = 0.262 / (hiY + 0.132) * st;
  const Qh = Q.head;
  const off = [0, -chinY * k - SDF_HEAD_SEAT * st, 0.006 * st];
  const headT = (v) => [Qh[0] + off[0] + k * hf[v * 3], Qh[1] + off[1] + k * hf[v * 3 + 1], Qh[2] + off[2] + k * hf[v * 3 + 2]];
  const headPt = (p) => { const h = fig.toHF(p[0], p[1], p[2]); return [Qh[0] + off[0] + k * h[0], Qh[1] + off[1] + k * h[1], Qh[2] + off[2] + k * h[2]]; };
  const sR = k * fig.s;                      // world metres per MakeHuman unit, across a limb

  // The segments. Each: MakeHuman root and tip, the rig's root and tip.
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  let sole = 1e9;
  for (let v = 0; v < D.nBody; v++) if (P[v * 3 + 1] < sole) sole = P[v * 3 + 1];
  const spineMid = lerp(J.spineA, J.spineB, 0.5);
  const X = {};
  const seg = (name, p0, p1, q0, q1) => {
    const u = _norm3(sub(p1, p0)), w = _norm3(sub(q1, q0));
    const sAx = len(sub(q1, q0)) / (len(sub(p1, p0)) || 1);
    /* THICKNESS FOLLOWS LENGTH. A segment the rig makes 17% shorter than MakeHuman's (a thigh) is a
       smaller thigh, not a squatter one: scaled across by what it was scaled along, within limits.
       Scaled across by the head's scale regardless, the trunk came out a quarter too thick for its
       height -- a barrel chest on a pelvis like a pear, which is most of why the men read as women. */
    X[name] = { p0, q0, u, R: _m3FromTo(u, w), sAx, sRad: sR * Math.max(0.78, Math.min(1.04, sAx / sR)) };
  };
  /* THE SPINE IS AT THE BACK. MakeHuman's spine joints run down the vertebrae, 2 to 9 cm behind the
     line of the chin; the rig's run straight down under the head. Fitted joint to joint, the whole
     trunk was carried forward by the difference -- chest thrust out, seat thrust back, a pigeon.
     So the trunk's targets keep MakeHuman's own depth, taken where the head puts it. */
  const Qd = (q, p) => [q[0], q[1], headPt(p)[2]];
  const rigid = (name, p0, q0, R) => { X[name] = { p0, q0, u: [0, 1, 0], R, sAx: sR, sRad: sR }; };
  seg('hips', J.hips, spineMid, Qd(Q.hips, J.hips), Qd(Q.spine, spineMid));
  seg('spine', spineMid, J.chest, Qd(Q.spine, spineMid), Qd(Q.chest, J.chest));
  seg('chest', J.chest, J.neck, Qd(Q.chest, J.chest), Qd(Q.neck, J.neck));
  seg('neck', J.neck, J.head, Qd(Q.neck, J.neck), headPt(J.head));
  // The neck meets a head sized by the head's own scale: across, it stays at that scale.
  X.neck.sRad = sR;
  for (const s of ['L', 'R']) {
    seg('shoulder' + s, J['shoulder' + s], J['upperArm' + s], Q['shoulder' + s], Q['upperArm' + s]);
    seg('upperArm' + s, J['upperArm' + s], J['lowerArm' + s], Q['upperArm' + s], Q['lowerArm' + s]);
    seg('lowerArm' + s, J['lowerArm' + s], J['hand' + s], Q['lowerArm' + s], Q['hand' + s]);
    // The hand carries on the line of the forearm.
    const fa = _norm3(sub(Q['hand' + s], Q['lowerArm' + s]));
    const hl = len(sub(J['finger' + s], J['hand' + s])) * sR;
    seg('hand' + s, J['hand' + s], J['finger' + s], Q['hand' + s], [Q['hand' + s][0] + fa[0] * hl, Q['hand' + s][1] + fa[1] * hl, Q['hand' + s][2] + fa[2] * hl]);
    X['hand' + s].sAx = sR;
    seg('upperLeg' + s, J['upperLeg' + s], J['lowerLeg' + s], Q['upperLeg' + s], Q['lowerLeg' + s]);
    const qAnkle = [Q['foot' + s][0], -0.875 * st + (J['foot' + s][1] - sole) * sR, Q['foot' + s][2]];
    seg('lowerLeg' + s, J['lowerLeg' + s], J['foot' + s], Q['lowerLeg' + s], qAnkle);
    rigid('foot' + s, J['foot' + s], qAnkle, X['lowerLeg' + s].R);
  }
  const apply = (T, x, y, z) => {
    const dx = x - T.p0[0], dy = y - T.p0[1], dz = z - T.p0[2];
    const a = dx * T.u[0] + dy * T.u[1] + dz * T.u[2];
    const rx = dx - a * T.u[0], ry = dy - a * T.u[1], rz = dz - a * T.u[2];
    const lx = T.u[0] * a * T.sAx + rx * T.sRad, ly = T.u[1] * a * T.sAx + ry * T.sRad, lz = T.u[2] * a * T.sAx + rz * T.sRad;
    const r = _m3mul(T.R, lx, ly, lz);
    return [T.q0[0] + r[0], T.q0[1] + r[1], T.q0[2] + r[2]];
  };

  // The body's faces: everything the head does not have. Fitted per original vertex.
  const bodyFaces = [];
  const need = new Uint8Array(D.nBody);
  D.F.forEach((fc, i) => { if (!fig.headFace[i]) { bodyFaces.push(i); for (const v of fc) need[v] = 1; } });
  const nv = D.nBody;
  const out = new Float32Array(nv * 3);
  const joints = new Float32Array(nv * 4), weights = new Float32Array(nv * 4);
  const headBone = D.B.indexOf('head');
  const boneIdx = D.B.map((b) => skeleton.index(b));
  const dom = new Int32Array(nv);
  for (let v = 0; v < nv; v++) {
    if (!need[v]) continue;
    const W = [];
    let wh = 0;
    for (let q = 0; q < 4; q++) {
      const w = D.W[v * 8 + q * 2 + 1] / 255;
      if (w <= 0) continue;
      const b = D.W[v * 8 + q * 2];
      if (b === headBone) wh += w; else W.push([b, w]);
    }
    // Below the line of the jaw, onto the head: wholly at the cut, MakeHuman's own weights 3.5 cm down.
    const below = _mhCutY(hf[v * 3 + 2]) - hf[v * 3 + 1];
    const wo = 1 - _ss(0, 0.035, below);
    const wh2 = Math.max(wh, wo);
    const rest = W.reduce((s2, x) => s2 + x[1], 0);
    const kk = rest > 0 ? (1 - wh2) / rest : 0;
    let L = [];
    if (wh2 > 0) L.push([headBone, wh2]);
    for (const [b, w] of W) if (w * kk > 0) L.push([b, w * kk]);
    // At most four influences (what the renderer skins with), renormalised, for the fit and the skin alike.
    L = L.sort((x, y) => y[1] - x[1]).slice(0, 4);
    const tot = L.reduce((s2, x) => s2 + x[1], 0) || 1;
    L = L.map(([b, w]) => [b, w / tot]);
    let px = 0, py = 0, pz = 0;
    L.forEach(([b, w], q) => {
      const p = b === headBone ? headT(v) : apply(X[D.B[b]], P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      px += p[0] * w; py += p[1] * w; pz += p[2] * w;
      joints[v * 4 + q] = boneIdx[b]; weights[v * 4 + q] = w;
    });
    dom[v] = L.length ? L[0][0] : 0;
    out[v * 3] = px; out[v * 3 + 1] = py; out[v * 3 + 2] = pz;
  }

  /* A MAN'S CHEST AND SEAT. MakeHuman's default figure carries the pectorals as two defined mounds
     with a crease under each and the buttocks as a high round shelf; under a shirt and trousers, and
     lit from above, that read as a woman's chest and a cartoon's backside ("the chest and rear end
     look way too alien"). Both are blended toward a smoothed copy of themselves -- the volume stays,
     the definition goes -- the chest only on a man (a woman keeps her figure), the seat on everyone. */
  const adj = Array.from({ length: nv }, () => []);
  for (const i of bodyFaces) {
    const f = D.F[i];
    for (let j = 0; j < f.length; j++) { const a = f[j], b = f[(j + 1) % f.length]; if (a !== b) { adj[a].push(b); adj[b].push(a); } }
  }
  const fem = (opts.fig && opts.fig.type) === 'female';
  const smoothToward = (zone, iters, amount) => {
    const Z = new Float64Array(nv);
    for (let v = 0; v < nv; v++) if (need[v]) Z[v] = zone(out[v * 3] / st, out[v * 3 + 1] / st, out[v * 3 + 2] / st);
    const A = Float64Array.from(out), T = new Float64Array(out.length);
    for (let it = 0; it < iters; it++) {
      for (let v = 0; v < nv; v++) {
        if (Z[v] <= 0 || !adj[v].length) { T[v * 3] = A[v * 3]; T[v * 3 + 1] = A[v * 3 + 1]; T[v * 3 + 2] = A[v * 3 + 2]; continue; }
        let x = 0, y = 0, z = 0;
        for (const q of adj[v]) { x += A[q * 3]; y += A[q * 3 + 1]; z += A[q * 3 + 2]; }
        const n = adj[v].length;
        T[v * 3] = x / n; T[v * 3 + 1] = y / n; T[v * 3 + 2] = z / n;
      }
      A.set(T);
    }
    for (let v = 0; v < nv; v++) if (Z[v] > 0) for (let k = 0; k < 3; k++) out[v * 3 + k] += (A[v * 3 + k] - out[v * 3 + k]) * amount * Z[v];
  };
  if (!fem) smoothToward((x, y, z) => (z > 0.0 ? _ss(0.0, 0.05, z) : 0) * _ss(0.22, 0.30, y) * (1 - _ss(0.44, 0.50, y)) * (1 - _ss(0.13, 0.18, Math.abs(x))), 40, 0.7);
  smoothToward((x, y, z) => (z < -0.02 ? _ss(-0.02, -0.07, z) : 0) * _ss(-0.24, -0.15, y) * (1 - _ss(0.04, 0.12, y)) * (1 - _ss(0.13, 0.18, Math.abs(x))), 40, fem ? 0.35 : 0.6);

  /* ARMS AT THE SIDES, NOT THROUGH THEM. MakeHuman stands with its arms out at forty-five degrees;
     swung down to hang beside the body, the upper arm passed straight through the lats and the side
     of the chest -- in the rest pose the sleeve overlapped the trunk by seven centimetres. A real arm
     at rest lies against the side and the side gives under it. So wherever a hanging arm is, the
     trunk is moved out of its way (toward the middle), by the arm's own measured thickness, and the
     move is smoothed into the skin round it so the side is dented, not creased. */
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1;
    const A0 = Q['upperArm' + sd], B0 = Q['lowerArm' + sd], C0 = Q['hand' + sd];
    const armJ = new Set(['upperArm', 'lowerArm', 'hand'].map((n) => skeleton.index(n + sd)));
    const aw = (v) => { let w = 0; for (let q = 0; q < 4; q++) if (armJ.has(joints[v * 4 + q])) w += weights[v * 4 + q]; return w; };
    const near = (p) => {
      // Closest point on shoulder->elbow->wrist; t runs 0..1 down the upper arm, 1..2 down the forearm.
      let best = null;
      for (const [a, b, t0] of [[A0, B0, 0], [B0, C0, 1]]) {
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2));
        const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
        const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
        if (!best || d < best.d) best = { d, c, t: t0 + t };
      }
      return best;
    };
    // The arm's thickness along its length, from its own skin (a high percentile, so the biceps count).
    const bins = Array.from({ length: 20 }, () => []);
    for (let v = 0; v < nv; v++) {
      if (!need[v] || out[v * 3] * sx <= 0 || aw(v) < 0.92) continue;
      const q = near([out[v * 3], out[v * 3 + 1], out[v * 3 + 2]]);
      bins[Math.min(19, Math.floor(q.t * 10))].push(q.d);
    }
    const R = bins.map((b) => { if (!b.length) return 0; b.sort((x, y) => x - y); return b[Math.floor(b.length * 0.9)]; });
    for (let i = 0; i < 20; i++) if (!R[i]) R[i] = R[i - 1] || 0.04 * st;
    const rad = (t) => { const f = Math.min(19, Math.max(0, t * 10 - 0.5)), i = Math.floor(f), j = Math.min(19, i + 1); return R[i] + (R[j] - R[i]) * (f - i); };
    const Dp = new Float64Array(nv * 3), hit = new Uint8Array(nv);
    const pushOut = () => {
      for (let v = 0; v < nv; v++) {
        if (!need[v] || out[v * 3] * sx <= 0) continue;
        const w = aw(v);
        if (w > 0.45) continue;
        const p = [out[v * 3] + Dp[v * 3], out[v * 3 + 1] + Dp[v * 3 + 1], out[v * 3 + 2] + Dp[v * 3 + 2]];
        const q = near(p);
        // Above the shoulder joint is the shoulder's own business; below the elbow the forearm hangs clear
        // of the hip on its own, and denting the hip for it bent the trousers' fork out of true.
        if (q.t <= 0.02 || q.t > 1.0) continue;
        const rr = rad(q.t) + 0.004 * st;
        if (q.d >= rr) continue;
        const k = 1 - _ss(0.25, 0.45, w);                  // the armpit's blended skin gives less
        const dir = q.d > 1e-5 ? [(p[0] - q.c[0]) / q.d, (p[1] - q.c[1]) / q.d, (p[2] - q.c[2]) / q.d] : [-sx, 0, 0];
        for (let m = 0; m < 3; m++) Dp[v * 3 + m] += dir[m] * (rr - q.d) * k;
        hit[v] = 1;
      }
    };
    for (let round = 0; round < 3; round++) {
      pushOut();
      // Spread each move into the skin round it.
      for (let it = 0; it < 6; it++) {
        const T = Float64Array.from(Dp);
        for (let v = 0; v < nv; v++) {
          if (!need[v] || !adj[v].length || aw(v) > 0.6) continue;
          let x = 0, y = 0, z = 0;
          for (const q of adj[v]) { x += Dp[q * 3]; y += Dp[q * 3 + 1]; z += Dp[q * 3 + 2]; }
          const n = adj[v].length;
          T[v * 3] = Dp[v * 3] * 0.5 + x / n * 0.5; T[v * 3 + 1] = Dp[v * 3 + 1] * 0.5 + y / n * 0.5; T[v * 3 + 2] = Dp[v * 3 + 2] * 0.5 + z / n * 0.5;
        }
        Dp.set(T);
      }
    }
    pushOut();
    for (let i = 0; i < nv * 3; i++) out[i] += Dp[i];
    void hit;
  }

  // Normals over the unsplit surface (so a seam in the texture is not a seam in the shading); along
  // the jaw the whole figure's, as the head has them.
  const N = new Float32Array(nv * 3);
  const tris = [];
  for (const i of bodyFaces) {
    const f = D.F[i], fs = D.FS[i];
    for (let j = 1; j + 1 < f.length; j++) {
      const a = f[0], b = f[j], c = f[j + 1];
      if (a === b || b === c || a === c) continue;
      tris.push(fs[0], fs[j], fs[j + 1]);
      const ux = out[b * 3] - out[a * 3], uy = out[b * 3 + 1] - out[a * 3 + 1], uz = out[b * 3 + 2] - out[a * 3 + 2];
      const vx = out[c * 3] - out[a * 3], vy = out[c * 3 + 1] - out[a * 3 + 1], vz = out[c * 3 + 2] - out[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { N[q * 3] += nx; N[q * 3 + 1] += ny; N[q * 3 + 2] += nz; }
    }
  }
  for (let v = 0; v < nv; v++) {
    if (fig.seam[v]) { N[v * 3] = fig.N[v * 3]; N[v * 3 + 1] = fig.N[v * 3 + 1]; N[v * 3 + 2] = fig.N[v * 3 + 2]; }
    const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l;
  }

  const PARTOF = (name) => /Arm|hand|shoulder/.test(name) ? (name.endsWith('L') ? PART.ARM_L : PART.ARM_R)
    : /Leg|foot/.test(name) ? (name.endsWith('L') ? PART.LEG_L : PART.LEG_R) : name === 'neck' || name === 'head' ? PART.NECK : PART.BODY;
  const place = { offset: off, scale: k / SDF_HEAD_TO_UNITS, fig: fig.key };

  if (opts.dress === false) {
    /* Undressed: the split vertices, with MakeHuman's own texture coordinates -- x6, so a unit of
       the skin material is about a third of a metre, the size it is on the head. */
    const g = new Geometry();
    const sMap = new Int32Array(D.O.length).fill(-1);
    const J4 = [], W4 = [];
    const emit = (sIdx) => {
      if (sMap[sIdx] >= 0) return sMap[sIdx];
      const v = D.O[sIdx];
      g.part = PARTOF(D.B[dom[v]]);
      sMap[sIdx] = g.vert(out[v * 3], out[v * 3 + 1], out[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], D.UV[sIdx * 2] * 6, D.UV[sIdx * 2 + 1] * 6);
      for (let q = 0; q < 4; q++) { J4.push(joints[v * 4 + q]); W4.push(weights[v * 4 + q]); }
      return sMap[sIdx];
    };
    for (let i = 0; i < tris.length; i += 3) g.tri(emit(tris[i]), emit(tris[i + 1]), emit(tris[i + 2]));
    g.joints = new Float32Array(J4); g.weights = new Float32Array(W4);
    g.finalize();
    g.mhHeadPlace = place;
    g.mh = true;
    g.mhSkinOnly = true;
    return g;
  }

  /* DRESSED (94h). The fitted body as a working mesh -- one vertex per MakeHuman vertex, texture
     coordinates per corner -- and the garments cut from it. */
  const base = _cmNew();
  const idx = new Int32Array(nv).fill(-1);
  for (let v = 0; v < nv; v++) {
    if (!need[v]) continue;
    idx[v] = base.P.length / 3;
    base.P.push(out[v * 3], out[v * 3 + 1], out[v * 3 + 2]);
    base.BP.push(out[v * 3], out[v * 3 + 1], out[v * 3 + 2]);
    base.BN.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
    for (let q = 0; q < 4; q++) base.W.push(joints[v * 4 + q], weights[v * 4 + q]);
    base.S.push(v);
  }
  for (const i of bodyFaces) {
    const f = D.F[i], fs = D.FS[i];
    for (let j = 1; j + 1 < f.length; j++) {
      if (f[0] === f[j] || f[j] === f[j + 1] || f[0] === f[j + 1]) continue;
      base.T.push(idx[f[0]], idx[f[j]], idx[f[j + 1]]);
      base.UV.push(D.UV[fs[0] * 2], D.UV[fs[0] * 2 + 1], D.UV[fs[j] * 2], D.UV[fs[j] * 2 + 1], D.UV[fs[j + 1] * 2], D.UV[fs[j + 1] * 2 + 1]);
    }
  }
  const Bidx = {};
  for (const b of skeleton.bones) Bidx[b.name] = skeleton.index(b.name);
  const od = opts.outfitDef || null;
  const dr = _mhDress(base, Q, Bidx, { stature: st, outfitDef: od, fit: opts.fit, lod: opts.lod });
  const names = skeleton.bones.map((b) => b.name);
  const partOf = (M) => (v) => PARTOF(names[M.W[v * 8]] || 'hips');

  // Colours: tints (the outfit table's hexes, deepened the way 94c deepens them) over a white cloth
  // material for a civilian; for an operator the material carries the colour and only the belt is darker.
  const hex3 = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255].map((x) => Math.pow(x, 1.6));
  const white = [1, 1, 1];
  const topC = od && od.top ? hex3(od.top.color) : white;
  const underC = od && od.under ? hex3(od.under.color) : null;
  const botC = od && od.bottom ? hex3(od.bottom.color) : white;
  const beltC = od ? (od.belt != null ? hex3(od.belt) : botC) : [0.24, 0.24, 0.24];
  const shirtCol = (v, M) => {
    if (!underC) return topC;
    const x = M.BP[v * 3], y = M.BP[v * 3 + 1], z = M.BP[v * 3 + 2];
    if (z < 0.02 * st || y < 0.35 * st) return topC;
    const m = Math.max(0, Math.min(1, ((y - 0.37 * st) * 0.30 - Math.abs(x)) / (0.014 * st) + 0.5));
    const w = m * m * (3 - 2 * m);
    return topC.map((c, i) => c + (underC[i] - c) * w);
  };
  const cloth = _cmMerge([[dr.shirt, shirtCol], [dr.trousers, botC], [dr.belt, beltC]]);
  const g = _cmToGeometry(cloth, 1, partOf(cloth), (v) => [cloth.colors[v * 3], cloth.colors[v * 3 + 1], cloth.colors[v * 3 + 2]]);

  // The skin that shows, with the whole figure's normals along the jaw (as the head has them).
  const sk = dr.skin;
  /* Metres x 1.67: the head's texture coordinates run once round a 0.6 m head, so the skin's grain is
     the same size either side of the jaw line and the join does not show as a change of texture. */
  g.neck = _cmToGeometry(sk, 1.67, partOf(sk), null,
    (v) => (sk.S[v] >= 0 && fig.seam[sk.S[v]] ? [fig.N[sk.S[v] * 3], fig.N[sk.S[v] * 3 + 1], fig.N[sk.S[v] * 3 + 2]] : null));
  g.hands = dr.hands ? _cmToGeometry(dr.hands, dr.uvM, partOf(dr.hands)) : null;
  const shoes = od && od.shoes;
  /* The upper in the shoe's colour (white for an operator: his boot material carries it), the sole in
     its own, and a boot's rand -- the rubber round its toe and heel -- darker than the upper. */
  const upC = shoes ? hex3(shoes.color) : white, soC = shoes ? (shoes.sole != null ? hex3(shoes.sole) : upC.map((x) => x * 0.55)) : [0.12, 0.12, 0.12];
  const randC = upC.map((x) => x * 0.5);
  const bt = dr.boots;
  const laceC = upC.map((x) => x * 0.3);
  g.boots = _cmToGeometry(bt, 1, partOf(bt), (v) => (bt.sole[v] === 1 ? soC : bt.sole[v] === 2 ? randC : bt.sole[v] === 3 ? laceC : upC));
  g.mhHeadPlace = place;
  g.mh = true;
  return g;
}
