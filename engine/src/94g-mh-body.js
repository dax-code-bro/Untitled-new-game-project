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

/* RELAXED HANDS. MakeHuman's hand is modelled flat with the fingers spread, and the rig has no finger
   bones to close it, so every hand hung at a man's side splayed like a starfish. A hand at rest is
   half closed: each finger bent a little at the knuckle, more at the middle joint and a little at the
   last, the little finger most, the fingers drawn together, the thumb bent toward the palm.

   Found on the mesh, not assumed: geodesic distance from the wrist (the band where the forearm's
   weight hands over to the hand's) peaks at the five fingertips, and the shortest of those is the
   thumb. Each vertex belongs to the fingers by its geodesic distance to their tips (softly, so the
   webs between them bend with both). Each finger's axis is the long axis of its free part, its knuckle
   a proportion of its length back from the tip, its palm side the side the thumb is on. The joints
   are bent tip first, each about its own rest pivot (forward kinematics), each over a short ramp so
   the knuckle rounds instead of creasing. */
function _mhRelaxHands(D, P, adj, st, knuckle) {
  const nv = D.nBody;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const pt = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const dist = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  // Rodrigues: p rotated by angle t about unit axis k through c.
  const rot = (p, c, k, t) => {
    const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
    const co = Math.cos(t), si = Math.sin(t), d = (k[0] * x + k[1] * y + k[2] * z) * (1 - co);
    return [c[0] + x * co + (k[1] * z - k[2] * y) * si + k[0] * d,
      c[1] + y * co + (k[2] * x - k[0] * z) * si + k[1] * d,
      c[2] + z * co + (k[0] * y - k[1] * x) * si + k[2] * d];
  };
  for (const side of ['L', 'R']) {
    const hb = D.B.indexOf('hand' + side);
    const wv = new Float32Array(nv);
    for (let v = 0; v < nv; v++) for (let q = 0; q < 4; q++) if (D.W[v * 8 + q * 2] === hb) wv[v] += D.W[v * 8 + q * 2 + 1] / 255;
    const inH = (v) => wv[v] > 0.5 && adj[v].length > 0;
    const geo = (seeds) => {
      const g = new Float64Array(nv).fill(Infinity);
      let open = [];
      for (const v of seeds) { g[v] = 0; open.push(v); }
      while (open.length) {
        const nx = [];
        for (const u of open) for (const w of adj[u]) if (inH(w)) { const d = g[u] + dist(u, w); if (d < g[w] - 1e-9) { g[w] = d; nx.push(w); } }
        open = nx;
      }
      return g;
    };
    const band = [];
    for (let v = 0; v < nv; v++) if (wv[v] > 0.3 && wv[v] < 0.7 && adj[v].length) band.push(v);
    if (!band.length) continue;
    const gw = geo(band);
    const hv = [];
    for (let v = 0; v < nv; v++) if (inH(v) && gw[v] < Infinity) hv.push(v);
    hv.sort((a, b) => gw[b] - gw[a]);
    const tips = [];
    for (const v of hv) {
      if (tips.length === 5) break;
      if (gw[v] < 0.05 * st) break;
      if (!tips.every((t) => dist(t, v) > 0.025 * st)) continue;
      if (adj[v].every((w) => gw[w] <= gw[v])) tips.push(v);
    }
    if (tips.length < 5) continue;
    // Middle reaches furthest, the thumb least; of the two left, the index is the one nearer the thumb.
    tips.sort((a, b) => gw[b] - gw[a]);
    const thumb = tips[4], middle = tips[0], little = tips[3];
    const [ia, ib] = [tips[1], tips[2]];
    const index = dist(ia, thumb) < dist(ib, thumb) ? ia : ib, ring = index === ia ? ib : ia;
    const order = [index, middle, ring, little, thumb];
    const gt = order.map((t) => geo([t]));
    const lab = new Int8Array(nv).fill(-1);
    for (const v of hv) { let b = 0; for (let f = 1; f < 5; f++) if (gt[f][v] < gt[b][v]) b = f; lab[v] = b; }
    // The web: where a finger's region meets its neighbour's (the thumb's web is the index's side of it).
    const web = [Infinity, Infinity, Infinity, Infinity, Infinity];
    for (const v of hv) for (const w of adj[v]) if (lab[w] >= 0 && lab[w] !== lab[v]) {
      const f = lab[v];
      if (f < 4 && lab[w] === 4) continue;
      web[f] = Math.min(web[f], gt[f][v]);
    }
    const F = order.map((tip, f) => {
      const free = hv.filter((v) => lab[v] === f && gt[f][v] < web[f]);
      if (free.length < 8) return null;
      const c = [0, 0, 0];
      for (const v of free) { c[0] += P[v * 3] / free.length; c[1] += P[v * 3 + 1] / free.length; c[2] += P[v * 3 + 2] / free.length; }
      let d = nrm(sub(pt(tip), c));
      for (let it = 0; it < 20; it++) {
        const acc = [0, 0, 0];
        for (const v of free) { const q = sub(pt(v), c), s = dot(q, d); acc[0] += q[0] * s; acc[1] += q[1] * s; acc[2] += q[2] * s; }
        d = nrm(acc);
      }
      if (dot(d, sub(pt(tip), c)) < 0) d = [-d[0], -d[1], -d[2]];
      return { tip, c, d, sTip: dot(sub(pt(tip), c), d) };
    });
    if (F.some((x) => !x)) continue;
    // The fingers' plane, and its palm side: the side the thumb is on.
    let n = nrm(_cross3(F[1].d, sub(F[0].c, F[3].c)));
    const mid4 = [0, 1, 2, 3].reduce((a, f) => [a[0] + F[f].c[0] / 4, a[1] + F[f].c[1] / 4, a[2] + F[f].c[2] / 4], [0, 0, 0]);
    if (dot(n, sub(pt(thumb), mid4)) < 0) n = [-n[0], -n[1], -n[2]];
    /* The knuckles: MakeHuman's finger joint lies on the knuckle line (10.6 cm from the middle
       fingertip on its figure). Each finger's knuckle is where its own axis meets that line, the line
       curving back 4 mm at the index and ring and 13 mm at the little finger. */
    const K = knuckle(side);
    const Lm = Math.max(0.06 * st, dot(sub(pt(middle), K), F[1].d));
    const hs = Lm / 0.106;
    const arc = [0.004, 0, 0.004, 0.013].map((x) => x * hs);
    const DEG = Math.PI / 180;
    // Bends (degrees) at the knuckle, the middle joint and the last: least at the index, most at the little finger.
    const bend = [[10, 24, 10], [17, 31, 14], [22, 35, 16], [28, 40, 18], [10, 16, 0]];
    const joint = [0, 0.46, 0.73];
    const toPalm = nrm(sub(mid4, pt(thumb)));
    const R = F.map((fg, f) => {
      let M;
      if (f < 4) {
        // On the finger's axis, level (along the middle finger) with the knuckle line.
        const t = (dot(sub(K, fg.c), F[1].d) - arc[f]) / (dot(fg.d, F[1].d) || 1);
        M = [fg.c[0] + fg.d[0] * t, fg.c[1] + fg.d[1] * t, fg.c[2] + fg.d[2] * t];
      } else {
        const t = fg.sTip - 0.64 * Lm;
        M = [fg.c[0] + fg.d[0] * t, fg.c[1] + fg.d[1] * t, fg.c[2] + fg.d[2] * t];
      }
      const L = Math.max(0.03 * st, dot(sub(pt(fg.tip), M), fg.d));
      // Fingers bend toward the palm; the thumb across it, toward the little finger's side.
      const want = f < 4 ? n : nrm([n[0] * 0.5 + toPalm[0] * 0.5, n[1] * 0.5 + toPalm[1] * 0.5, n[2] * 0.5 + toPalm[2] * 0.5]);
      const k = nrm(_cross3(fg.d, want));
      // Splay: draw each finger most of the way toward the middle finger's line, about the palm's normal.
      let spK = null, spA = 0;
      if (f !== 1 && f < 4) {
        const dp = [fg.d[0] - n[0] * dot(fg.d, n), fg.d[1] - n[1] * dot(fg.d, n), fg.d[2] - n[2] * dot(fg.d, n)];
        const dm = [F[1].d[0] - n[0] * dot(F[1].d, n), F[1].d[1] - n[1] * dot(F[1].d, n), F[1].d[2] - n[2] * dot(F[1].d, n)];
        const cx = _cross3(nrm(dp), nrm(dm)), sn = Math.hypot(cx[0], cx[1], cx[2]);
        if (sn > 1e-4) { spK = nrm(cx); spA = Math.atan2(sn, dot(nrm(dp), nrm(dm))) * 0.7; }
      }
      const js = f < 4 ? joint : [0, 0.5, 2];
      const piv = js.map((t) => [M[0] + fg.d[0] * L * t, M[1] + fg.d[1] * L * t, M[2] + fg.d[2] * L * t]);
      return { M, L, k, spK, spA, piv, js, ang: bend[f].map((x) => x * DEG) };
    });
    const ramp = 0.006 * st, sig = 0.004 * st;
    for (const v of hv) {
      const p0 = pt(v);
      let tot = 0;
      const ws = [0, 0, 0, 0, 0];
      const gmin = Math.min(gt[0][v], gt[1][v], gt[2][v], gt[3][v], gt[4][v]);
      for (let f = 0; f < 5; f++) { ws[f] = Math.exp(-(gt[f][v] - gmin) / sig); tot += ws[f]; }
      const acc = [0, 0, 0];
      for (let f = 0; f < 5; f++) {
        const w = ws[f] / tot;
        if (w < 1e-4) continue;
        const r = R[f];
        const s = dot(sub(p0, r.M), F[f].d) / r.L;
        let p = p0;
        for (let j = 2; j >= 0; j--) {
          const t = _ss(r.js[j] * r.L - ramp, r.js[j] * r.L + ramp, s * r.L);
          if (t <= 0) continue;
          p = rot(p, r.piv[j], r.k, r.ang[j] * t);
          if (j === 0 && r.spK) p = rot(p, r.piv[0], r.spK, r.spA * t);
        }
        acc[0] += p[0] * w; acc[1] += p[1] * w; acc[2] += p[2] * w;
      }
      P[v * 3] = acc[0]; P[v * 3 + 1] = acc[1]; P[v * 3 + 2] = acc[2];
    }
  }
}

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
  _mhRelaxHands(D, out, adj, st, (s) => apply(X['hand' + s], J['finger' + s][0], J['finger' + s][1], J['finger' + s][2]));

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
  const laceC = shoes && shoes.kind === 'sneaker' ? [0.82, 0.82, 0.80] : upC.map((x) => x * 0.3);   // a trainer's laces are white
  g.boots = _cmToGeometry(bt, 1, partOf(bt), (v) => (bt.sole[v] === 1 ? soC : bt.sole[v] === 2 ? randC : bt.sole[v] === 3 ? laceC : upC));
  g.mhHeadPlace = place;
  g.mh = true;
  return g;
}
