/* =====================================================================
   FIRST-PERSON ARMS FROM THE BODY
   ---------------------------------------------------------------------
   Reported: "all the models, specifically the hands and arms, are
   developed, but when you actually hold a gun it's the same old model --
   the arms are just sticks with little squares and lines sticking out of
   them hovering over the bone."

   Correct. The bodies were rebuilt on the MakeHuman figure (94g) with
   real hands, and the viewmodel (98) went on lofting tubes: a sleeve
   tube, a block for a palm and three capsules a finger. Everything that
   makes the viewmodel work is in that rig, though -- the grip solve that
   closes each finger onto this weapon's surface, the trigger finger, the
   thumb that cocks a hammer, the wrist that gives under recoil, the
   support hand that leaves the forend to fetch a magazine -- and all of
   it drives ACTORS, one per palm, thumb and finger bone.

   So the rig stays and its tubes are no longer drawn. What is drawn is
   the body's own forearm and hand, cut from the same MakeHuman figure the
   characters wear, closed onto the rig's solved grip and skinned to the
   rig's actors:

     REST. The figure's hand is opened flat (the fingers drawn together,
     94g `handInfo.open`) and found finger by finger -- each finger's
     axis, its three joints and the axis it bends about. Every bone of it
     is carried onto the matching bone of the solved grip (knuckle to
     knuckle, along the bone, palm side to palm side), and every vertex
     moves by the blend of those carries its weights give it: the
     figure's own skin weights between forearm and hand, then the hand's
     share split across palm, thumb and finger bones by where on the hand
     it lies. So the hand lands closed round this weapon's grip exactly
     where the rig put its tubes.

     MOTION. The same weights skin it to the rig's actors. At rest every
     actor sits on the weapon's frame, so a bone's palette entry is just
     the actor's transform relative to the weapon -- whatever the game
     does to a finger, a palm or a forearm (the trigger, the reload, the
     give) the real hand does, with the skin blending across each joint
     instead of three capsules hinging apart.

   The sleeve is the figure's forearm too, stood off its skin by a
   sleeve's thickness, with folds and a turned cuff above the wrist.
   ===================================================================== */

let _bodyArmSrc;
function _bodyArmSource() {
  if (_bodyArmSrc !== undefined) return _bodyArmSrc;
  _bodyArmSrc = null;
  if (typeof makeMhBodyGeometry !== 'function') return null;
  try {
    const skel = makeHumanoidSkeleton(1, 'mh');
    const info = { open: true };
    const g = makeMhBodyGeometry(skel, {
      fig: { seed: 5, type: 'male', skinColor: 0xc8a080, build: 1 }, stature: 1, dress: false, handInfo: info,
    });
    if (!g.srcVert || !info.L || !info.R) return null;
    const Q = {};
    for (const b of skel.bones) { const v = new Vec3(); b.bindMatrix.getTranslation(v); Q[b.name] = [v.x, v.y, v.z]; }
    _bodyArmSrc = { g, info, Q, skel };
  } catch (e) { _bodyArmSrc = null; }
  return _bodyArmSrc;
}

const _ba = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  nrm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/* A frame: origin, the long axis `a`, and the palm side `c` made square to it; b = c x a. */
function _baFrame(o, a, cHint) {
  const A = _ba.nrm(a);
  let c = _ba.sub(cHint, _ba.mul(A, _ba.dot(A, cHint)));
  if (_ba.len(c) < 1e-6) c = Math.abs(A[1]) < 0.9 ? _ba.cross(A, [0, 1, 0]) : _ba.cross(A, [1, 0, 0]);
  const C = _ba.nrm(c);
  return { o, a: A, b: _ba.cross(C, A), c: C };
}

/* The carry from one frame to another, stretched along and across. */
function _baCarry(from, to, sa, sb, sc) {
  return (p) => {
    const d = _ba.sub(p, from.o);
    const x = _ba.dot(d, from.a) * sa, y = _ba.dot(d, from.b) * sb, z = _ba.dot(d, from.c) * sc;
    return [to.o[0] + to.a[0] * x + to.b[0] * y + to.c[0] * z,
      to.o[1] + to.a[1] * x + to.b[1] * y + to.c[1] * z,
      to.o[2] + to.a[2] * x + to.b[2] * y + to.c[2] * z];
  };
}
const _baClamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* Build one arm (skin and sleeve) in the weapon's space.
 *
 *   S      'R' or 'L' (the figure's side)
 *   rec    the rig's record of this hand (makeViewmodelArms `digits.right/left`)
 *   shoulder  where the rig's sleeve starts, weapon space
 *   base   the first palette slot of this arm: base+0 sleeve, +1 forearm, +2 palm,
 *          +3 thumb, +4 + f*3 + b finger f bone b (the rig's own numbering, f 0 = little)
 */
function _bodyArm(src, S, rec, shoulder, base) {
  const { g, info, Q, skel } = src;
  const H = info[S];
  if (!H || !rec || !rec.wrist || !rec.byFinger) return null;
  for (let f = 0; f < 4; f++) if (!rec.byFinger[f]) return null;
  const { sub, add, mul, dot, cross, len, nrm } = _ba;
  const P = g.positions, J4 = g.joints, W4 = g.weights;
  const nv = P.length / 3;
  const iHand = skel.index('hand' + S), iFore = skel.index('lowerArm' + S), iUp = skel.index('upperArm' + S);
  const Jw = Q['hand' + S], Je = Q['lowerArm' + S];
  const foreLen = len(sub(Jw, Je)), upLen = len(sub(Je, Q['upperArm' + S]));
  const uMH = nrm(sub(Jw, Je));
  const hvIdx = new Map();
  for (let i = 0; i < H.hv.length; i++) hvIdx.set(H.hv[i], i);

  /* ---- the figure's frames ---- */
  const MF = H.fingers;            // 0 index, 1 middle, 2 ring, 3 little, 4 thumb
  const nMH = H.n;
  const palmMH = _baFrame(Jw, sub(MF[1].piv[0], Jw), nMH);
  const foreMH = _baFrame(Jw, uMH, nMH);
  // Bone frames: knuckle-ward joint, along the finger, palm side = k x d.
  const boneMH = MF.map((fg) => {
    const ends = fg.js.map((t) => t).concat([1]);
    const out = [];
    for (let j = 0; j < 3; j++) {
      if (ends[j] >= 1) { out.push(null); continue; }
      const o = fg.piv[j];
      const L = (Math.min(1, ends[j + 1]) - ends[j]) * fg.L;
      out.push({ fr: _baFrame(o, fg.d, cross(fg.k, fg.d)), L });
    }
    return out;
  });
  /* ---- the rig's frames ---- */
  const V = (a) => [a[0], a[1], a[2]];
  const wR = V(rec.wrist.p);
  const BF = rec.byFinger;          // 0 little .. 3 index
  const mhOf = [3, 2, 1, 0];         // rig finger -> figure finger
  // The palm side of the rig's hand: what every finger closes toward (n = k x d).
  let nR = [0, 0, 0];
  for (let f = 0; f < 4; f++) {
    const d0 = nrm(sub(BF[f].pivots3[1], BF[f].pivots3[0]));
    nR = add(nR, nrm(cross(BF[f].axis, d0)));
  }
  nR = nrm(nR);
  /* Signed by what the fingers do, not by the bend axis alone: the support hand's axes come out
     the other way round from the firing hand's, and a palm normal taken from them faced away from
     the forend -- the hand built palm-down under the gun. A finger curls toward its palm, so the
     tips sit off each proximal bone on the palm side. */
  let curlSum = [0, 0, 0];
  for (let f = 0; f < 4; f++) {
    const k0 = BF[f].pivots3[0], d0 = nrm(sub(BF[f].pivots3[1], k0));
    const t = sub(BF[f].tip, k0);
    curlSum = add(curlSum, sub(t, mul(d0, dot(t, d0))));
  }
  if (dot(curlSum, nR) < 0) nR = mul(nR, -1);
  const kMidR = V(BF[2].pivots3[0]);
  /* THE HAND IS HUNG FROM ITS KNUCKLES, at one scale. The rig's palm is a short block (7 to 9 cm
     wrist to knuckle against the figure's 12) and its "wrist" is only where that block starts, so
     fitting the figure's palm between the rig's wrist and knuckles squashed it lengthwise and tore
     it at the knuckle line. The knuckles are what the grip solve actually placed -- every finger
     closes from them -- so the figure's middle knuckle goes onto the rig's, the hand is scaled
     evenly by the width across the knuckles, and the wrist falls where that hand's wrist is. */
  const kMidMH = MF[1].piv[0];
  const hk = _baClamp(len(sub(BF[3].pivots3[0], BF[0].pivots3[0])) / (len(sub(MF[0].piv[0], MF[3].piv[0])) || 1), 0.74, 1.1);
  const sAlong = hk, sAcross = hk;
  /* AND SQUARED TO THE KNUCKLE LINE, not to the wrist. The rig's "wrist" is only where its palm
     block begins, and on a pistol grip that is up by the web of the thumb -- wrist to knuckle there
     runs nearly ALONG the knuckle line, and a palm squared to it came out turned a quarter round
     against its own fingers. Both palms are framed the same way: the palm side, and the line from
     little knuckle to index knuckle across it (signed as the figure's hand has it, so a right hand
     stays a right hand); the long axis is what is square to both. */
  const kFrame = (o, kl, c, sgn) => {
    const C = nrm(c);
    let B = sub(kl, mul(C, dot(kl, C)));
    B = mul(nrm(B), sgn);
    return { o, a: cross(B, C), b: B, c: C };
  };
  const klMH0 = sub(MF[0].piv[0], MF[3].piv[0]);
  const sgnK = dot(klMH0, palmMH.b) >= 0 ? 1 : -1;
  const palmMHk = kFrame(kMidMH, klMH0, palmMH.c, sgnK);
  const palmR = kFrame(kMidR, sub(BF[3].pivots3[0], BF[0].pivots3[0]), nR, sgnK);
  const palmCarry = _baCarry(palmMHk, palmR, hk, hk, hk);
  const wristR = palmCarry(Jw);
  /* THE FOREARM RUNS ON FROM THE HAND. A wrist holding a gun is all but straight; aimed at the
     rig's "shoulder" (a point it chose only so its sleeve tube would leave the frame low) the
     forearm met the hand at up to a right angle, and the skin blended across that joint came out
     a stretched slab. So the forearm carries on along the hand, turned toward that point by no
     more than a wrist will bend. */
  const handLine = mul(palmR.a, -1);
  const toSh = nrm(sub(shoulder, wristR));
  const cosT = Math.max(-1, Math.min(1, dot(handLine, toSh))), th = Math.acos(cosT);
  /* 55 degrees: with the forearm on the hand's own line, a pistol pulled to the eye ran its
     forearm straight back into the camera and the near plane cut it open. */
  const MAXB = 55 * Math.PI / 180;
  let foreDir = handLine;
  if (th > 1e-4) {
    const t = Math.min(1, MAXB / th);
    // Slerp from the hand's own line toward the shoulder, by t of the angle between them.
    const so = Math.sin(th);
    foreDir = nrm(add(mul(handLine, Math.sin((1 - t) * th) / so), mul(toSh, Math.sin(t * th) / so)));
  }
  // _baFrame's `a` runs elbow -> wrist, as the figure's does.
  const foreR = _baFrame(wristR, mul(foreDir, -1), nR);
  const fs = hk * 0.5 + 0.5;
  const foreCarry = _baCarry(foreMH, foreR, 1, fs, fs);
  /* And the upper arm bends at the elbow: on back past it, dropping and swinging out to its own
     side, so it leaves the frame at the bottom corner -- not on up to a shoulder (which, from an
     eye at the height of the sights, is BELOW the gun), and not straight on through the camera. */
  const elbowR = foreCarry(Je);
  const out = S === 'R' ? 1 : -1;            // the weapon's right is +Z
  const toShoulder = nrm(add(foreDir, [0, -0.65, 0.5 * out]));
  const upMH = _baFrame(Je, sub(Je, Q['upperArm' + S]), nMH);
  const upR = _baFrame(elbowR, mul(toShoulder, -1), nR);
  const upCarry = _baCarry(upMH, upR, 1, fs, fs);
  const boneCarry = [];
  for (let f = 0; f < 4; f++) {
    const m = mhOf[f], d = BF[f];
    const pts = [V(d.pivots3[0]), V(d.pivots3[1]), V(d.pivots3[2]), V(d.tip)];
    // The rig's tip is the last ring's centre; the figure's is the end of the pad.
    const lastDir = nrm(sub(pts[3], pts[2]));
    pts[3] = add(pts[3], mul(lastDir, (d.r || 0.009) * 0.85));
    const sr = hk;
    // The pad side of this finger: its bend axis, signed by which way the finger actually curls.
    const d0 = nrm(sub(pts[1], pts[0])), tp = sub(pts[3], pts[0]);
    const padSgn = dot(cross(V(d.axis), d0), sub(tp, mul(d0, dot(tp, d0)))) >= 0 ? 1 : -1;
    boneCarry.push([0, 1, 2].map((j) => {
      const bm = boneMH[m][j];
      if (!bm) return null;
      const a = sub(pts[j + 1], pts[j]);
      const L = len(a);
      const fr = _baFrame(pts[j], a, mul(cross(V(d.axis), nrm(a)), padSgn));
      return _baCarry(bm.fr, fr, _baClamp(L / (bm.L || 1), 0.6, 1.6), sr, sr);
    }));
  }
  // The thumb: base joint to middle joint, middle joint to tip.
  let thumbCarry = null;
  if (rec.thumbPivot && rec.thumbMid && rec.thumbTip && rec.thumbAxis) {
    const fg = MF[4];
    const t0 = V(rec.thumbPivot), t1 = V(rec.thumbMid);
    let t2 = V(rec.thumbTip);
    t2 = add(t2, mul(nrm(sub(t2, t1)), 0.009));
    let ax = V(rec.thumbAxis);
    // The thumb's pad faces across the palm: sign its axis so it does.
    if (dot(cross(ax, nrm(sub(t1, V(rec.thumbPivot)))), nR) < 0) ax = mul(ax, -1);
    const m0 = fg.piv[0], m1 = fg.piv[1], m2 = fg.tip;
    const a0 = sub(t1, t0), a1 = sub(t2, t1);
    const fr0 = _baFrame(m0, fg.d, cross(fg.k, fg.d)), fr1 = _baFrame(m1, fg.d, cross(fg.k, fg.d));
    const L0 = len(sub(m1, m0)) || 0.03, L1 = Math.max(0.01, dot(sub(m2, m1), fg.d));
    const sr = hk;
    thumbCarry = [
      _baCarry(fr0, _baFrame(t0, a0, cross(ax, nrm(a0))), _baClamp(len(a0) / L0, 0.6, 1.6), sr, sr),
      _baCarry(fr1, _baFrame(t1, a1, cross(ax, nrm(a1))), _baClamp(len(a1) / L1, 0.6, 1.6), sr, sr),
    ];
  }

  /* ---- weights, and the hand closed onto the grip ---- */
  const RAMP = [0.017, 0.006, 0.005];
  const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const keep = new Uint8Array(nv);          // in this arm at all
  const along = new Float32Array(nv);       // metres from the wrist joint toward the hand (negative up the forearm)
  const outP = new Float32Array(nv * 3);
  const outJ = new Float32Array(nv * 4), outW = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    let wH = 0, wF = 0, wU = 0, wAll = 0;
    for (let q = 0; q < 4; q++) {
      const j = J4[i * 4 + q], w = W4[i * 4 + q];
      if (w <= 0) continue;
      wAll += w;
      if (j === iHand) wH += w; else if (j === iFore) wF += w; else if (j === iUp) wU += w;
    }
    const p0 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const al = dot(sub(p0, Jw), uMH);
    along[i] = al;
    if (wH + wF + wU < 0.6 * (wAll || 1) || al < -(foreLen + upLen)) continue;
    keep[i] = 1;
    // [carry, slot, weight]
    const parts = [];
    const wArm = Math.max(0, 1 - wH - wU);
    if (wArm > 0) parts.push([foreCarry, 1, wArm]);
    if (wU > 0) parts.push([upCarry, 1, wU]);
    if (wH > 0) {
      const hi = hvIdx.get(g.srcVert[i]);
      if (hi === undefined) parts.push([palmCarry, 2, wH]);
      else {
        for (let m = 0; m < 5; m++) {
          const wsf = H.ws[hi * 5 + m];
          if (wsf < 1e-3) continue;
          const fg = MF[m], s = H.s[hi * 5 + m];
          const t = [0, 1, 2].map((j) => (fg.js[j] >= 1 ? 0 : ss(fg.js[j] * fg.L - RAMP[j], fg.js[j] * fg.L + RAMP[j], s)));
          if (m < 4) {
            const f = mhOf.indexOf(m), bc = boneCarry[f];
            parts.push([palmCarry, 2, wH * wsf * (1 - t[0])]);
            parts.push([bc[0] || palmCarry, 4 + f * 3, wH * wsf * (t[0] - t[1])]);
            parts.push([bc[1] || bc[0] || palmCarry, 4 + f * 3 + 1, wH * wsf * (t[1] - t[2])]);
            parts.push([bc[2] || bc[1] || bc[0] || palmCarry, 4 + f * 3 + 2, wH * wsf * t[2]]);
          } else if (thumbCarry) {
            parts.push([palmCarry, 2, wH * wsf * (1 - t[0])]);
            parts.push([thumbCarry[0], 3, wH * wsf * (t[0] - t[1])]);
            parts.push([thumbCarry[1], 3, wH * wsf * t[1]]);
          } else parts.push([palmCarry, 2, wH * wsf]);
        }
      }
    }
    let tot = 0;
    const p = [0, 0, 0];
    const slotW = new Map();
    for (const [carry, slot, w] of parts) {
      if (w <= 1e-5) continue;
      const q = carry(p0);
      p[0] += q[0] * w; p[1] += q[1] * w; p[2] += q[2] * w; tot += w;
      slotW.set(slot, (slotW.get(slot) || 0) + w);
    }
    if (tot <= 0) { keep[i] = 0; continue; }
    outP[i * 3] = p[0] / tot; outP[i * 3 + 1] = p[1] / tot; outP[i * 3 + 2] = p[2] / tot;
    const top = [...slotW.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const tw = top.reduce((s2, x) => s2 + x[1], 0) || 1;
    top.forEach(([slot, w], q) => { outJ[i * 4 + q] = base + slot; outW[i * 4 + q] = w / tw; });
  }

  /* ---- the skin: the hand and the forearm up under the cuff ---- */
  const CUFF = -0.034;          // the sleeve ends this far up from the wrist joint
  const I = g.indices;
  const skin = new Geometry();
  const mapS = new Int32Array(nv).fill(-1);
  const U = g.uvs;
  const emitS = (i) => {
    if (mapS[i] >= 0) return mapS[i];
    mapS[i] = skin.vert(outP[i * 3], outP[i * 3 + 1], outP[i * 3 + 2], 0, 1, 0, U[i * 2] * 4, U[i * 2 + 1] * 4);
    return mapS[i];
  };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!keep[a] || !keep[b] || !keep[c]) continue;
    if (Math.max(along[a], along[b], along[c]) < CUFF - 0.05) continue;
    skin.tri(emitS(a), emitS(b), emitS(c));
  }
  const sJ = [], sW = [];
  const orderS = [];
  for (let i = 0; i < nv; i++) if (mapS[i] >= 0) orderS[mapS[i]] = i;
  for (const i of orderS) { for (let q = 0; q < 4; q++) { sJ.push(outJ[i * 4 + q]); sW.push(outW[i * 4 + q]); } }

  /* ---- the sleeve: the forearm stood off by a sleeve's thickness ---- */
  // Smooth normals of the carried arm, welded across texture seams, to stand the cloth off along.
  const nrmAcc = new Float32Array(nv * 3);
  const weld = new Map();
  const key = (i) => `${Math.round(P[i * 3] * 2e4)},${Math.round(P[i * 3 + 1] * 2e4)},${Math.round(P[i * 3 + 2] * 2e4)}`;
  const rep = new Int32Array(nv);
  for (let i = 0; i < nv; i++) { if (!keep[i]) continue; const k = key(i); if (!weld.has(k)) weld.set(k, i); rep[i] = weld.get(k); }
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!keep[a] || !keep[b] || !keep[c]) continue;
    const pa = [outP[a * 3], outP[a * 3 + 1], outP[a * 3 + 2]];
    const n = cross(sub([outP[b * 3], outP[b * 3 + 1], outP[b * 3 + 2]], pa), sub([outP[c * 3], outP[c * 3 + 1], outP[c * 3 + 2]], pa));
    for (const v of [a, b, c]) { const r = rep[v]; nrmAcc[r * 3] += n[0]; nrmAcc[r * 3 + 1] += n[1]; nrmAcc[r * 3 + 2] += n[2]; }
  }
  const nOf = (i) => nrm([nrmAcc[rep[i] * 3], nrmAcc[rep[i] * 3 + 1], nrmAcc[rep[i] * 3 + 2]]);
  const sleeve = new Geometry();
  const mapC = new Int32Array(nv).fill(-1);
  // Around the arm, for the folds: angle about the forearm's axis in the rig's frame.
  const axisR = foreR.a;
  const ringAng = (p) => {
    const d = sub(p, wristR);
    return Math.atan2(dot(d, foreR.c), dot(d, foreR.b));
  };
  const cuffP = (i) => {
    // Vertices below the cuff line are drawn up onto it, so the cuff is a clean edge.
    let p = [outP[i * 3], outP[i * 3 + 1], outP[i * 3 + 2]];
    const over = along[i] - CUFF;
    if (over > 0) p = sub(p, mul(axisR, over));
    return p;
  };
  const standOff = (i) => {
    const p = cuffP(i), n = nOf(i);
    const al = Math.min(along[i], CUFF);
    const ang = ringAng(p);
    // A sleeve's thickness, more where cloth bunches above the cuff and along the inside of the elbow.
    const bunch = Math.exp(-Math.pow((al - CUFF + 0.05) / 0.035, 2));
    const fold = 0.0016 * Math.sin(al * 70 + ang * 2.0) + 0.0011 * Math.sin(al * 140 - ang * 3.0 + 1.3);
    const off = 0.0062 + bunch * 0.0030 + fold * (0.6 + bunch);
    return add(p, mul(n, off));
  };
  const emitC = (i) => {
    if (mapC[i] >= 0) return mapC[i];
    const p = standOff(i);
    // Texture in metres: round the arm and along it.
    const ang = ringAng(p);
    mapC[i] = sleeve.vert(p[0], p[1], p[2], 0, 1, 0, ang * 0.045 * 8, along[i] * 8);
    return mapC[i];
  };
  const edgeCount = new Map();
  const ek = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!keep[a] || !keep[b] || !keep[c]) continue;
    if (Math.min(along[a], along[b], along[c]) >= CUFF) continue;
    sleeve.tri(emitC(a), emitC(b), emitC(c));
    const ra = rep[a], rb = rep[b], rc = rep[c];
    for (const [x, y] of [[ra, rb], [rb, rc], [rc, ra]]) {
      const k = ek(x, y);
      const e = edgeCount.get(k);
      if (e) e.n++; else edgeCount.set(k, { n: 1, x, y });
    }
  }
  // The cuff: the open edge nearest the wrist, turned in to the skin so the sleeve has a thickness.
  const lipJ = [];
  for (const e of edgeCount.values()) {
    if (e.n !== 1) continue;
    if (along[e.x] < CUFF - 0.03 || along[e.y] < CUFF - 0.03) continue;
    const ia = mapC[e.x], ib = mapC[e.y];
    if (ia < 0 || ib < 0) continue;
    const inA = add(cuffP(e.x), mul(nOf(e.x), 0.0012)), inB = add(cuffP(e.y), mul(nOf(e.y), 0.0012));
    const pa = sleeve.positions.slice(ia * 3, ia * 3 + 3), pb = sleeve.positions.slice(ib * 3, ib * 3 + 3);
    const ua = sleeve.uvs[ia * 2], ub = sleeve.uvs[ib * 2];
    const a2 = sleeve.vert(pa[0], pa[1], pa[2], 0, 1, 0, ua, 0);
    const b2 = sleeve.vert(pb[0], pb[1], pb[2], 0, 1, 0, ub, 0);
    const c2 = sleeve.vert(inB[0], inB[1], inB[2], 0, 1, 0, ub, 0.05);
    const d2 = sleeve.vert(inA[0], inA[1], inA[2], 0, 1, 0, ua, 0.05);
    // Wound to face out of the cuff (toward the hand); both windings, the lip is thin.
    sleeve.tri(a2, c2, b2); sleeve.tri(a2, d2, c2);
    sleeve.tri(a2, b2, c2); sleeve.tri(a2, c2, d2);
    lipJ.push(e.x, e.y, e.y, e.x);
  }
  const orderC = [];
  for (let i = 0; i < nv; i++) if (mapC[i] >= 0) orderC[mapC[i]] = i;
  const cJ = [], cW = [];
  for (const i of orderC) { for (let q = 0; q < 4; q++) { cJ.push(base + 0); cW.push(q === 0 ? 1 : 0); } }
  for (let k = 0; k < lipJ.length; k++) { cJ.push(base + 0, 0, 0, 0); cW.push(1, 0, 0, 0); }

  const fin = (geo, J, Wt) => {
    geo.joints = new Float32Array(J); geo.weights = new Float32Array(Wt);
    geo.finalize();
    geo.computeWeldGroups();
    smoothNormals(geo);
    weldNormals(geo.normals, geo.weldGroups);
    return geo;
  };
  return { skin: fin(skin, sJ, sW), sleeve: fin(sleeve, cJ, cW) };
}

/* Both arms for a viewmodel's parts, cached on them. */
function makeBodyArms(parts, shoulders) {
  if (parts.__bodyArms !== undefined) return parts.__bodyArms;
  parts.__bodyArms = null;
  const src = _bodyArmSource();
  if (!src || !parts.digits) return null;
  try {
    const r = _bodyArm(src, 'R', parts.digits.right, shoulders.right, 0);
    const l = parts.hasLeft ? _bodyArm(src, 'L', parts.digits.left, shoulders.left, 16) : null;
    if (!r) return null;
    parts.__bodyArms = { r, l };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('body arms:', e && e.message);
    parts.__bodyArms = null;
  }
  return parts.__bodyArms;
}

/* A palette that is the rig's actors, read relative to the weapon each time it is uploaded. */
function _bodyArmPalette(weapon, slots) {
  const s = Object.create(Skeleton.prototype);
  s.bones = slots.map(() => null);
  s.byName = new Map();
  s.matrices = new Float32Array(slots.length * 16);
  s.texture = null;
  s._texFrame = -1;
  // World matrices straight off the rig: the arms' own actor sits at the origin (see below).
  s.refresh = function () {
    for (let i = 0; i < slots.length; i++) {
      const a = slots[i] || weapon;
      this.matrices.set(a.matrix.e, i * 16);
    }
  };
  s.uploadTexture = function (gl, frame) {
    if (frame === undefined || frame !== this._texFrame) this.refresh();
    return Skeleton.prototype.uploadTexture.call(this, gl, frame);
  };
  return s;
}

/* Swap the rig's tubes for the body's arms. The rig's actors keep every transform the game gives
   them and stop being drawn; the arms are drawn from them. `opts.stickArms` keeps the old look. */
const _viewmodelArmsRig = Engine.prototype.viewmodelArms;
Engine.prototype.viewmodelArms = function (weapon, hands, opts = {}) {
  const arms = _viewmodelArmsRig.call(this, weapon, hands, opts);
  if (!arms || opts.stickArms || this.stickArms) return arms;
  const key = 'arms:' + (opts.key || JSON.stringify(hands));
  const parts = this._armCache && this._armCache[key];
  if (!parts) return arms;
  const back = parts.shoulderX != null ? parts.shoulderX : -0.07;
  const drop = opts.drop != null ? opts.drop : -0.335, spread = opts.spread != null ? opts.spread : 0.315;
  const body = makeBodyArms(parts, { right: [back, drop, spread], left: [back, drop, -spread] });
  if (!body) return arms;
  const slot = (side) => {
    const R = side > 0;
    const pal = R ? arms.palm : arms.lPalm, fore = R ? arms.skin : arms.lSkin;
    const out = [R ? arms.sleeve : arms.lSleeve, fore, pal || fore, (R ? arms.thumb : arms.lThumb) || pal || fore];
    const bones = R ? arms.rBones : arms.lBones;
    for (let f = 0; f < 4; f++) for (let b = 0; b < 3; b++) {
      const ch = bones && bones[f];
      out.push((ch && (ch[b] || ch[b - 1] || ch[0])) || pal || fore);
    }
    return out;
  };
  const slots = slot(1).concat(arms.lSkin ? slot(-1) : new Array(16).fill(null));
  const pal = _bodyArmPalette(weapon, slots);
  const skinMat = this.material(opts.skinMaterial || VIEW_ARM_MATERIALS.skin);
  /* Both faces of the sleeve: where the near plane cuts a forearm the eye looks into the sleeve,
     and with one face it saw straight through the cloth to the skin inside. */
  const sm = opts.sleeveMaterial || VIEW_ARM_MATERIALS.sleeve;
  const sleeveMat = typeof sm === 'object' && typeof sm.doubleSided === 'boolean' ? sm   // already a material
    : this.material(Object.assign({}, typeof sm === 'object' ? sm : { color: sm }, { doubleSided: true }));
  const made = [];
  const spawn = (geo, mat, name) => {
    if (!geo || !geo.indices || !geo.indices.length) return null;
    /* NOT parented to the weapon. The palette carries the whole placement (each slot is a rig
       actor's world matrix), so this actor stays at the origin -- and off the weapon's child list,
       which everything that measures "the gun" walks (weaponSurface, weaponForend, the sweep's
       contact checks): hung there, the arms would be measured as part of the gun they hold. It
       is never culled, being placed by its palette rather than its position. */
    const a = new Actor(this, { name, mesh: this._gpuMeshOf(geo), material: mat, skeleton: pal, boundRadius: 0.9 });
    a.noCull = true;
    a.armsOf = weapon;
    // Destroyed with the weapon all the same (95-engine `destroy` takes its `rigged` with it).
    (weapon.rigged || (weapon.rigged = [])).push(a);
    this.actors.push(a);
    made.push(a);
    return a;
  };
  const bodySkin = [spawn(body.r.skin, skinMat, 'armSkinR')], bodySleeve = [spawn(body.r.sleeve, sleeveMat, 'armSleeveR')];
  if (body.l && arms.lSkin) { bodySkin.push(spawn(body.l.skin, skinMat, 'armSkinL')); bodySleeve.push(spawn(body.l.sleeve, sleeveMat, 'armSleeveL')); }
  if (!made.length) return arms;
  /* The rig stops being drawn and goes on being posed and measured: `noDraw` (95-engine) skips it
     at the draw and nowhere else, so every transform the arms read is current and every test that
     measures the solved hand still has its geometry. */
  for (const a of arms.parts) a.noDraw = true;
  arms.rig = arms.parts.slice();
  arms.body = made;
  // By material, for whatever dresses the arms afterwards (Bunker Nine's chosen hero).
  arms.bodySkin = bodySkin.filter(Boolean);
  arms.bodySleeve = bodySleeve.filter(Boolean);
  // Whatever shows or hides the arms shows or hides these: they are what `parts` now draws.
  arms.parts = arms.parts.concat(made);
  return arms;
};

/* WHERE A LONG GUN'S FOREND IS, from its own geometry.
 *
 * Multiplayer (and the campaign, which plays on it) has sixty guns and no
 * authored hand anchors, so the support hand was put two-thirds of the way
 * to the muzzle. On the M4 that is past the end of the handguard, on bare
 * barrel: there was nothing within reach for the grip solve to close the
 * fingers onto, so they stood straight up beside the gun -- the "lines
 * sticking out" of the report, now drawn as a real hand doing the same
 * wrong thing.
 *
 * The forend is the stretch of the gun ahead of the magazine that is
 * fat below the bore and is not the magazine: profiled along the bore
 * in 5 mm slices, the longest run whose underside sits 12 mm or more
 * below the bore line and above the bottom of a magazine. Returns the
 * run and a station 55% along it (a support hand rides the front half),
 * or null when there is no such run (a pistol, a bare tube). */
Engine.prototype.weaponForend = function (root) {
  if (!root || !this.geometryOf) return null;
  const bore = root.boreAt != null ? root.boreAt : 0.04;
  const muzzle = root.muzzleAt != null ? root.muzzleAt : 0.5;
  const STEP = 0.005, n = Math.max(1, Math.ceil(muzzle / STEP));
  const lo = new Float32Array(n).fill(1e9), wid = new Float32Array(n);
  const game = this;
  const walk = (a, local) => {
    const geo = a.mesh && game.geometryOf(a.mesh);
    if (geo && geo.positions) {
      const q = geo.positions, m = local ? local.e : null, I = geo.indices;
      const tf = (i) => {
        const x = q[i * 3], y = q[i * 3 + 1], z = q[i * 3 + 2];
        return m ? [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]] : [x, y, z];
      };
      const put = (x, y, z) => {
        const k = Math.floor(x / STEP);
        if (k < 0 || k >= n || Math.abs(z) > 0.06 || y > bore + 0.05) return;
        if (y < lo[k]) lo[k] = y;
        if (Math.abs(z) > wid[k]) wid[k] = Math.abs(z);
      };
      // Sampled over every triangle: a box has vertices only at its corners, and a handguard is a box.
      if (I) for (let t = 0; t < I.length; t += 3) {
        const A = tf(I[t]), B = tf(I[t + 1]), C = tf(I[t + 2]);
        const e = Math.max(Math.abs(B[0] - A[0]), Math.abs(C[0] - A[0]), Math.abs(C[0] - B[0]));
        const N = Math.min(60, Math.max(1, Math.ceil(e / 0.004)));
        for (let u = 0; u <= N; u++) for (let v = 0; u + v <= N; v++) {
          const a = u / N, b2 = v / N, c = 1 - a - b2;
          put(A[0] * c + B[0] * a + C[0] * b2, A[1] * c + B[1] * a + C[1] * b2, A[2] * c + B[2] * a + C[2] * b2);
        }
      }
    }
    for (const c of (a.children || [])) {
      if (c.noDraw || c.skeleton) continue;      // not the arms
      const cm = new Mat4();
      cm.compose(c._position, c._rotation, c.scale);
      if (local) { const t = new Mat4(); t.mulMatrices(local, cm); walk(c, t); } else walk(c, cm);
    }
  };
  walk(root, null);
  // Ahead of the magazine: the first slice past the deepest point near the grip.
  let deep = -1, dy = 1e9;
  for (let k = 0; k < Math.min(n, Math.floor(0.2 / STEP)); k++) if (lo[k] < dy) { dy = lo[k]; deep = k; }
  let start = deep >= 0 && dy < bore - 0.06 ? deep : 0;
  while (start < n && lo[start] < bore - 0.06) start++;
  let best = null, run = null;
  for (let k = start; k < n; k++) {
    const ok = lo[k] < bore - 0.012 && lo[k] > bore - 0.075 && wid[k] > 0.010;
    if (ok) { if (!run) run = { a: k, b: k }; else run.b = k; } else if (run) { if (!best || run.b - run.a > best.b - best.a) best = run; run = null; }
  }
  if (run && (!best || run.b - run.a > best.b - best.a)) best = run;
  if (!best || (best.b - best.a + 1) * STEP < 0.05) return null;
  const x0 = best.a * STEP, x1 = (best.b + 1) * STEP;
  let x = x0 + (x1 - x0) * 0.55;
  x = Math.min(x, muzzle - 0.07, x1 - 0.045);
  x = Math.max(x, x0 + 0.03);
  /* Whether anything is under the bore at a station (a forend, a vertical grip): the caller keeps
     its own station when there is, and only moves a hand that would otherwise be on bare barrel. */
  const under = (xs) => {
    const k = Math.floor(xs / STEP);
    let m = 1e9;
    for (let j = Math.max(0, k - 1); j <= Math.min(n - 1, k + 1); j++) m = Math.min(m, lo[j]);
    // 22 mm: a gas block or a sight base hangs 15 to 20 below the bore, and a hand cannot hold one.
    return m < bore - 0.022;
  };
  return { x, from: x0, to: x1, under };
};
