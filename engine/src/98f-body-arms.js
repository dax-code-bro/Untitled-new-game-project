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

/* CLOSE THE HAND ON THE GUN, joint by joint.
 *
 * Reported: "the hands and fingers aren't positioned correctly." Measured against the weapon's
 * own surface they were not: the rig's grip solve left the M4's middle and ring fingertips 56 to
 * 66 mm off the grip in mid-air, and the support hand's four fingers standing straight up the
 * side of the handguard, tips 13 to 27 mm clear of it with the bones through it. The body hand
 * followed those joints faithfully, so it held the gun the same way.
 *
 * A finger closes the way a real one does: from the knuckle out, each joint bending until the
 * bone beyond it comes to rest on the surface (or the joint runs out of travel), then the next.
 * So it wraps -- along the underside, up the side, over the top -- whatever the shape under it.
 * The knuckles stay where the grip solve put them; the trigger finger keeps its own solve (it
 * lies along a trigger, it does not wrap); the thumb closes onto the gun the same way.
 *
 * The records are rewritten in place -- joints, tip, bend axis -- so everything that turns a
 * finger afterwards (the reload opening the hand, the trigger) turns it about these joints. */
function _wrapHand(rec, sf, palmA, nR, radius, firing, keepThumb) {
  const { sub, add, mul, dot, cross, len, nrm } = _ba;
  const DEG = Math.PI / 180;
  const rot = (v, k, t) => {
    const c = Math.cos(t), s = Math.sin(t), d = dot(k, v) * (1 - c);
    return [v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * d,
      v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * d,
      v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * d];
  };
  // How far the skin of a bone keeps off the gun: its worst point, its own radius taken off.
  const clear = (p, dir, L, r) => {
    let m = Infinity;
    for (const t of [0.25, 0.45, 0.65, 0.85, 1.0]) {
      const q = add(p, mul(dir, L * t));
      m = Math.min(m, sf(q[0], q[1], q[2]) - r * (t === 1 ? 0.85 : 1));
    }
    return m;
  };
  /* One joint, starting from the angle the grip solve gave it: if that bone is in the gun, out to
     the nearest angle that clears it (opening first, as a finger does); then closed from there
     until the bone touches -- or the joint runs out of travel. */
  /* `allow`: how deep the bone may already be. A knuckle the grip solve sank into the gun puts the
     start of its bone in it whatever the angle; asking that bone to clear entirely swung the whole
     finger out into the air. It may be as deep as its knuckle is, and no deeper. */
  const joint = (p, prev, k, L, r, start, lo, hi, noClose, allow = 0) => {
    const STEP = 2.0 * DEG;
    const c = (t) => clear(p, rot(prev, k, t), L, r) - allow;
    let t = Math.max(lo, Math.min(hi, start));
    if (c(t) < 0) {
      let found = null, bestT = t, bestC = c(t);
      for (let n = 1; n <= 45 && found == null; n++) {
        for (const tt of [t - n * STEP, t + n * STEP]) {
          if (tt < lo - 1e-6 || tt > hi + 1e-6) continue;
          const cc = c(tt);
          if (cc >= 0) { found = tt; break; }
          if (cc > bestC) { bestC = cc; bestT = tt; }
        }
      }
      t = found != null ? found : bestT;
      if (found == null) return t;
    }
    if (noClose) return t;
    // Close while it stays clear and keeps coming nearer the gun: a bone swinging past a thin part
    // (a grip seen edge on) stops where it was closest, not out in the air beyond it.
    let cur = c(t);
    while (t + STEP <= hi + 1e-6) {
      const cn = c(t + STEP);
      if (cn < 0 || cn > cur + 0.0004) break;
      t += STEP; cur = cn;
    }
    return t;
  };
  // The signed angle from a to b about k, both taken square to k.
  const angle = (a, b, k) => {
    const pa = nrm(sub(a, mul(k, dot(a, k)))), pb = nrm(sub(b, mul(k, dot(b, k))));
    return Math.atan2(dot(cross(pa, pb), k), dot(pa, pb));
  };
  /* A FINGER WITH NOTHING TO HOLD CURLS, it does not stand out straight. Where the closing finds no
     surface in reach (the shield's open hand beside its bar, one finger straight up behind the
     clear panel; a support finger past the end of what it holds), the finger closes into the fist
     as a relaxed hand's does -- as far as it can without going into the gun. */
  const curlLoose = (d, R) => {
    const tipSf = sf(d.tip[0], d.tip[1], d.tip[2]), midSf = sf(d.pivots3[2][0], d.pivots3[2][1], d.pivots3[2][2]);
    if (tipSf < 0.025 && (tipSf < 0.015 || midSf < 0.012)) return;
    // A finger the closing wrapped bends the way it was wrapped (a support finger may close either
    // way, see below); folded against that, its bones came out mirrored, drawn inside out.
    let k = nrm(d.axis);
    const want = nrm(cross(palmA, nR));
    if (!d.wrapped && dot(k, want) < 0) k = mul(k, -1);
    const P0 = d.pivots3[0];
    const L = [len(sub(d.pivots3[1], P0)), len(sub(d.pivots3[2], d.pivots3[1])), len(sub(d.tip, d.pivots3[2]))];
    const d0 = nrm(sub(d.pivots3[1], P0));
    const P1 = add(P0, mul(d0, L[0]));
    /* Every curl of the two outer joints that keeps clear of the gun, and of those the one whose tip
       comes to rest on it (within 4 mm), else nearest it, the deeper fold breaking a tie. Three fixed
       curls were tried before and the finger left straight if all three touched: the DP 28's middle
       finger stood up past its barrel, its tip 56 mm off anything. */
    let best = null;
    for (let a1 = 90; a1 >= 0; a1 -= 10) for (let a2 = 80; a2 >= 0; a2 -= 10) {
      let dir = rot(d0, k, a1 * DEG);
      const P2 = add(P1, mul(dir, L[1]));
      dir = rot(dir, k, a2 * DEG);
      const T = add(P2, mul(dir, L[2]));
      if (clear(P1, nrm(sub(P2, P1)), L[1], R[1] * 0.7) < 0 || clear(P2, nrm(sub(T, P2)), L[2], R[2] * 0.7) < 0) continue;
      const ts = sf(T[0], T[1], T[2]);
      const e = Math.max(0, ts - 0.004) - 0.00001 * (a1 + a2);
      if (!best || e < best.e) best = { e, ts, a: a1 + a2, P2, T };
    }
    if (!best || best.a < 30) return;
    // A finger with something in reach (its tip under 25 mm off) is only folded if that brings it
    // nearer: folded anyway, the Scattergun's and Breakwater's support middles came off their pumps.
    if (tipSf < 0.025 && best.ts > tipSf - 0.003) return;
    d.pivots3 = [P0, P1, best.P2];
    d.joints = [P1, best.P2];
    d.tip = best.T;
    d.axis = k;
    d.open = -1;
    d.curled = true;
  };
  // A melee handle (the shield's, the hammer's) is a bar the grip solve already wraps.
  if (rec.grip === 'haft') {
    const Rh = [radius, radius * 0.92, radius * 0.82];
    for (const d of rec.byFinger.slice(0, 4)) curlLoose(d, Rh);
    rec.digits = rec.byFinger.slice(0, 4);
    return [];
  }
  const trig = rec.indexPlane != null;                // the firing hand's index lies on a trigger
  /* A HAND THAT STARTS INSIDE THE OTHER ONE moves out first. On a two-handed pistol grip the
     solve put the support hand's knuckles where the firing hand's fingertips are, so every finger
     began inside that hand and the closing could only swing them out forward. The whole hand
     slides out to its own side and a little forward until the knuckles clear, then closes over. */
  {
    const ks = rec.byFinger.map((d) => d.pivots3[0]);
    const worst = (dv) => Math.min(...ks.map((k) => sf(k[0] + dv[0], k[1] + dv[1], k[2] + dv[2])));
    // Only a hand inside the OTHER hand: knuckles the solve sank into the gun itself (a shield's
    // second handle) are where the weapon's authored anchor wants them.
    const rawSf = sf.raw || sf;
    const inGun = Math.min(...ks.map((k) => rawSf(k[0], k[1], k[2]))) < radius;
    if (sf.raw && !inGun && worst([0, 0, 0]) < radius) {
      /* Out along the surface's own outward direction at the knuckles (under a forend that is
         down; beside a firing hand it is out to the side); sideways only if that is undefined. */
      const c = ks.reduce((a2, k) => add(a2, mul(k, 0.25)), [0, 0, 0]), e = 0.003;
      let dir = [sf(c[0] + e, c[1], c[2]) - sf(c[0] - e, c[1], c[2]), sf(c[0], c[1] + e, c[2]) - sf(c[0], c[1] - e, c[2]),
        sf(c[0], c[1], c[2] + e) - sf(c[0], c[1], c[2] - e)];
      if (len(dir) < 1e-6) {
        const side = (rec.wrist.p[2] + c[2]) < 0 ? -1 : 1;
        dir = [0.35, 0, side];
      }
      dir = nrm(dir);
      let dv = null;
      for (let n = 1; n <= 30; n++) { const t = mul(dir, n * 0.0015); if (worst(t) >= radius * 0.9) { dv = t; break; } }
      if (dv) {
        const mv = (q) => { if (q) { q[0] += dv[0]; q[1] += dv[1]; q[2] += dv[2]; } };
        const seen = new Set();
        const mvOnce = (q) => { if (q && !seen.has(q)) { seen.add(q); mv(q); } };
        for (const d of rec.byFinger) { for (const q of d.pivots3) mvOnce(q); mvOnce(d.tip); if (d.joints) for (const q of d.joints) mvOnce(q); mvOnce(d.knuckle); }
        if (rec.pivots) for (const q of rec.pivots) mvOnce(q);
        mvOnce(rec.wrist.p); mvOnce(rec.thumbPivot); mvOnce(rec.thumbMid); mvOnce(rec.thumbTip);
        rec.shifted = dv;
      }
    }
  }
  const R = [radius, radius * 0.92, radius * 0.82];
  for (let f = 0; f < 4; f++) {
    const d = rec.byFinger[f];
    /* The trigger finger keeps the trigger solve's pose: it reaches forward to a trigger, and any
       closing at all curls it back round the guard into a fist (grip.test, "reaches forward"). It
       only opens a bone the solve left inside the gun. */
    const isTrig = trig && f === 3;
    const onTrigger = isTrig;
    const P0 = d.pivots3[0];
    const L = [len(sub(d.pivots3[1], P0)), len(sub(d.pivots3[2], d.pivots3[1])), len(sub(d.tip, d.pivots3[2]))];
    // The bend axis, signed so a positive turn closes toward the palm.
    let k = nrm(d.axis);
    const want = nrm(cross(palmA, nR));
    if (dot(k, want) < 0) k = mul(k, -1);
    // The grip solve's own bones, as directions, to start each joint from.
    const rigDir = [nrm(sub(d.pivots3[1], P0)), nrm(sub(d.pivots3[2], d.pivots3[1])), nrm(sub(d.tip, d.pivots3[2]))];
    // The knuckle turns about the rig's first bone (it may need to open well clear of a magazine or
    // close well in); the middle and last joints bend only forward, as far as a finger's do.
    const lim = [[-50 * DEG, 70 * DEG], [0, 105 * DEG], [0, 80 * DEG]];
    const curl = (k, s0 = 0) => {
      let dir = nrm(sub(rigDir[0], mul(k, dot(rigDir[0], k))));
      const pts = [P0];
      let p = P0;
      for (let j = 0; j < 3; j++) {
        const start = j === 0 ? s0 : Math.max(0, angle(dir, rigDir[j], k));
        /* The trigger finger keeps the trigger solve's pose -- it lies along a blade, it does not
           wrap -- and only opens a bone that the solve left inside the gun (its tip through the
           magwell). */
        const t = onTrigger
          ? joint(p, dir, k, L[j], R[j] * 0.8, j === 0 ? 0 : angle(dir, rigDir[j], k), -40 * DEG, 110 * DEG, true)
          : joint(p, dir, k, L[j], R[j], start, lim[j][0], j === 0 ? Math.max(lim[0][1], s0 + 10 * DEG) : lim[j][1], false,
            Math.min(0, sf(p[0], p[1], p[2]) - R[j]) - 0.0025);
        dir = rot(dir, k, t);
        p = add(p, mul(dir, L[j]));
        pts.push(p);
      }
      return pts;
    };
    /* How well a finger rests on the gun: each joint's distance from lying on the surface, a joint
       in the gun counting double. */
    /* ...and a finger on an upright grip (a pistol grip, a vertical foregrip, a magazine housing)
       holds it by going ROUND it: one whose tip ends more than 30 mm ahead of its knuckle is lying
       along something else. The Barrett's middle and ring fingers lay straight along the side of its
       magazine, tips 9 cm out, and the C96's support fingers along its magazine housing, and scored
       as well as a wrap because every joint touched the gun. */
    const fwdCost = (T) => (!isTrig && (!rec.gripAxis || Math.abs(rec.gripAxis[1]) > 0.8))
      ? 2 * Math.max(0, T[0] - P0[0] - 0.03) : 0;
    const score = (P1, P2, T) => [[P1, R[0]], [P2, R[1]], [T, R[2] * 0.85]].reduce((acc, [q, r]) => {
      const e = sf(q[0], q[1], q[2]) - r;
      return acc + (e < 0 ? -2 * e : e);
    }, fwdCost(T));
    /* Closing is whichever way brings the finger onto the gun. The palm side the hand's frame
       implies came out the wrong way round on some support hands (the Mauser's forend, the
       Remington's, the MG 42's), and those fingers curled into a fist in the air beside it, every
       joint at its limit and the middles 10 to 20 mm off. A support finger is closed both ways
       and keeps the one that rests on the gun. */
    let pts = curl(k);
    /* A finger on an upright grip may also start already folded round it: from the
       grip solve's line, straight ahead, the Barrett's ring and middle fingers lay along its
       magazine and the first degree of closing ran them into it, though the 28 mm between grip and
       magazine takes a finger across the strap. */
    if (!isTrig && (!rec.gripAxis || Math.abs(rec.gripAxis[1]) > 0.8)) {
      for (const s0 of [40 * DEG, 80 * DEG]) {
        const alt = curl(k, s0);
        if (score(alt[1], alt[2], alt[3]) < score(pts[1], pts[2], pts[3]) - 0.001) pts = alt;
      }
    }
    if (!firing && !isTrig) {
      const kk = mul(k, -1), alt = curl(kk);
      if (score(alt[1], alt[2], alt[3]) < score(pts[1], pts[2], pts[3]) - 0.002) { pts = alt; k = kk; }
    }
    /* THE TRIGGER FINGER GOES TO THE TRIGGER. Where the grip solve could not reach the guard from
       its knuckle in the plane the other fingers curl in -- the P226's opening is 17 mm above that
       plane -- it laid the finger out straight, 9 cm forward and 35 mm off the gun, a finger
       pointing at the target beside the muzzle. A finger can tilt out of that plane (the index
       spreads 20 to 30 degrees), so the knuckle is aimed in both angles and the two outer joints
       bend to put the pad of the last bone in the opening, every bone kept off the frame and the
       tip still ahead of the knuckle (grip.test). Kept when the pad lands nearer than the solve's. */
    if (isTrig && rec.trigAt) {
      /* On the BLADE, not in the middle of the hole. rec.trigAt is the centre of the guard's
         opening; the trigger hangs at the back of it, and a pad sent to the centre lay along the
         guard's bottom bar under the blade's tip (the audit's commonest firing-hand fault). The
         first metal behind the centre, at its height, is the blade: the pad goes against its face,
         a little above the middle, on the gun's centre line. */
      let T = rec.trigAt;
      for (let x = T[0]; x > T[0] - 0.03; x -= 0.0007) {
        if (sf(x, T[1], 0) < 0.0015) { T = [x + 0.0075, T[1] + 0.002, 0]; break; }
      }
      const c0 = nrm(cross(k, nrm(sub(rigDir[0], mul(k, dot(rigDir[0], k))))));
      const pose = (yaw, pitch, a1, a2) => {
        const kk = rot(k, c0, pitch);
        let dir = rot(nrm(sub(rigDir[0], mul(k, dot(rigDir[0], k)))), c0, pitch);
        dir = rot(dir, kk, yaw);
        const P1 = add(P0, mul(dir, L[0]));
        dir = rot(dir, kk, a1);
        const P2 = add(P1, mul(dir, L[1]));
        dir = rot(dir, kk, a2);
        return { kk, P: [P0, P1, P2, add(P2, mul(dir, L[2]))] };
      };
      const padOf = (P) => add(P[2], mul(sub(P[3], P[2]), 0.55));
      const dist = (a, b) => len(sub(a, b));
      const cost = (q) => {
        const P = q.P;
        let pen = 0;
        for (let j = 0; j < 3; j++) {
          for (const t of j === 2 ? [0.5, 1] : [0.35, 0.7, 1]) {
            const x = add(P[j], mul(sub(P[j + 1], P[j]), t));
            pen = Math.max(pen, R[j] * 0.75 - sf(x[0], x[1], x[2]));
          }
        }
        const fwd = P[3][0] - P0[0];
        const KP = 2.0;
        const pipGap = sf(P[1][0], P[1][1], P[1][2]) - R[0] - 0.006;
        return dist(padOf(P), T) + 3 * Math.max(0, pen) + 3 * Math.max(0, 0.013 - fwd) + KP * Math.max(0, pipGap);
      };
      const rigCost = cost({ P: [P0, d.pivots3[1], d.pivots3[2], d.tip] });
      // Coarse: the nearest poses by distance alone, then those costed against the gun.
      const cand = [];
      for (let y = -40; y <= 70; y += 10) for (let pi = -30; pi <= 30; pi += 10)
        for (let a1 = 0; a1 <= 105; a1 += 15) for (let a2 = 0; a2 <= 80; a2 += 20) {
          const q = pose(y * DEG, pi * DEG, a1 * DEG, a2 * DEG);
          cand.push([dist(padOf(q.P), T), y, pi, a1, a2]);
        }
      cand.sort((u, v) => u[0] - v[0]);
      let best = null;
      for (const c of cand.slice(0, 60)) {
        const q = pose(c[1] * DEG, c[2] * DEG, c[3] * DEG, c[4] * DEG);
        const e = cost(q);
        if (!best || e < best.e) best = { e, a: c.slice(1) };
      }
      // Fine: each angle in turn, a degree or two at a time.
      const lo = [-40, -30, 0, 0], hi = [70, 30, 105, 80];
      for (const st of [5, 2, 1]) {
        for (let it = 0, moved = true; it < 12 && moved; it++) {
          moved = false;
          for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) {
            const a = best.a.slice(); a[i] = Math.max(lo[i], Math.min(hi[i], a[i] + sg * st));
            const e = cost(pose(a[0] * DEG, a[1] * DEG, a[2] * DEG, a[3] * DEG));
            if (e < best.e - 1e-5) { best = { e, a }; moved = true; }
          }
        }
      }
      d.trigWrap = [+(rigCost * 1000).toFixed(1), +(best.e * 1000).toFixed(1)].concat(best.a);
      if (best.e < rigCost - 0.004) {
        const q = pose(best.a[0] * DEG, best.a[1] * DEG, best.a[2] * DEG, best.a[3] * DEG);
        d.pivots3 = [q.P[0], q.P[1], q.P[2]];
        d.joints = [q.P[1], q.P[2]];
        d.tip = q.P[3];
        d.axis = q.kk;
        d.open = -1;
        d.wrapped = true;
      }
      continue;
    }
    // Kept only if it rests on the gun better than the grip solve's finger did. Where the solve
    // already had it right (a shield's handle, some forends), its pose stands.
    if (score(pts[1], pts[2], pts[3]) >= score(d.pivots3[1], d.pivots3[2], d.tip) - 0.001) { curlLoose(d, R); continue; }
    d.pivots3 = [pts[0], pts[1], pts[2]];
    d.joints = [pts[1], pts[2]];
    d.tip = pts[3];
    d.axis = k;
    d.open = -1;
    d.wrapped = true;
    curlLoose(d, R);
  }
  // The thumb, its two bones, closing onto the gun from where the grip solve laid it.
  /* THE FIRING THUMB GOES ROUND TO THE FAR SIDE. The grip solve laid it forward along the near
     side of the frame, under the receiver -- from the eye, a second finger pointing at the muzzle
     beside the trigger finger. A right hand's thumb comes round the back of the grip, its web on the
     backstrap, and lies along the LEFT of the frame. Not on a single action, whose thumb the game
     drives up to the hammer from where the solve put it. */
  /* Both thumb moves below are for the grips they describe: the firing thumb goes round the back of a
     PISTOL grip (an upright one), the support thumb along the side of a forend or a pistol frame. On a
     ram's or a shield's handle bar they sent the thumb straight out into the air. */
  const upright = !rec.gripAxis || Math.abs(rec.gripAxis[1]) > 0.8;
  const underFore = rec.gripRound && rec.gripRound[1] > 0.9;
  if (firing && upright && !keepThumb && rec.thumbPivot && rec.thumbMid && rec.thumbTip) {
    const rT = radius * 1.05;
    const L0 = len(sub(rec.thumbMid, rec.thumbPivot)), L1 = len(sub(rec.thumbTip, rec.thumbMid));
    // Out from the middle of the frame to the left until clear of it, at a given station.
    const leftOf = (q) => { const p = [q[0], q[1], 0]; for (let n = 0; n < 40 && sf(p[0], p[1], p[2]) < rT; n++) p[2] -= 0.0015; return p; };
    // The base: behind the backstrap, a little to the right of centre (where the web of the hand is).
    let b0 = [rec.thumbPivot[0], rec.thumbPivot[1], 0.004], behind = true;
    for (let n = 0; n < 30 && sf(b0[0], b0[1], b0[2]) < rT; n++) b0[0] -= 0.0015;
    /* Where a stock comes down behind the grip (the Scattergun's, the MG 42's) there is no clear
       place behind the backstrap to step back to, and the base was left 15 mm inside the wood.
       Then the web stays on its own side of the grip, stepped out to the right until clear -- or
       the thumb stays where the grip solve put it. */
    if (sf(b0[0], b0[1], b0[2]) < rT * 0.8) {
      b0 = rec.thumbPivot.slice();
      behind = false;
      for (let n = 0; n < 15 && sf(b0[0], b0[1], b0[2]) < rT; n++) b0[2] += 0.0015;
    }
    /* ROOTED AT THE LEFT REAR CORNER of the grip, not behind its middle: the thumb's root joint is
       on the far side of the backstrap and the web wraps round behind it (the palm's thenar is
       drawn round to here, _bodyArm). From behind the middle, its first bone crossed the back of
       the frame square to the gun -- from the eye, a thumb lying across the slide in the sight
       picture. Clear behind, it comes forward along the left side from just ahead of the
       backstrap. */
    if (behind) {
      const c0 = leftOf([b0[0] + rT + 0.004, b0[1], 0]);
      if (c0[2] > -0.05 && sf(c0[0], c0[1], c0[2]) >= rT * 0.95) b0 = c0;
    }
    /* AGAINST THE RECEIVER, not beside the trigger guard. At the grip solve's thumb height there is
       often nothing but the guard's thin bar ahead of the grip, and the thumb lay along that, 20 to
       27 mm under the receiver -- in the open space below the gun, where from the right it showed
       as a second finger pointing at the muzzle under the trigger finger. A thumb rides up against
       the bottom edge of the receiver's (or frame's) left side: from the station's own height up to
       the first height where the gun is a body and not a bar (16 mm across or more), a little into
       it. Where the frame is already there (a pistol's), nothing moves. */
    const bodyAt = (x, y0) => {
      for (let y = y0; y <= y0 + 0.045; y += 0.0015) {
        let n = 0;
        for (let z = -0.03; z <= 0.03; z += 0.002) if (sf(x, y, z) < 0) n++;
        if (n >= 8) return y;
      }
      return null;
    };
    const raise = (q) => {
      const y = bodyAt(q[0], q[1]);
      return y != null && y > q[1] + 0.004 ? [q[0], y + 0.005, q[2]] : q;
    };
    const tip = leftOf(raise(rec.thumbTip));
    // The middle joint between them, held off the corner of the grip it goes round.
    const mid = leftOf(raise([b0[0] + (tip[0] - b0[0]) * 0.42, (b0[1] + tip[1]) / 2, 0]));
    // Lengths kept: the bones laid along base -> mid -> tip as far as they reach.
    // Each joint pushed out to the left until it clears the grip it lies on.
    const push = (q) => { const p = q.slice(); for (let n = 0; n < 30 && sf(p[0], p[1], p[2]) < rT; n++) p[2] -= 0.0012; return p; };
    const d0 = nrm(sub(mid, b0)), M = push(add(b0, mul(d0, L0)));
    const d1 = nrm(sub(tip, M)), T = push(add(M, mul(d1, L1)));
    if (sf(b0[0], b0[1], b0[2]) > rT * 0.8 && sf(M[0], M[1], M[2]) > rT * 0.8 && sf(T[0], T[1], T[2]) > rT * 0.8) {
      rec.thumbPivot = b0; rec.thumbMid = M; rec.thumbTip = T;
      // Its bend: across the thumb and the line into the gun.
      let k = nrm(cross(d0, [0, 0, 1]));
      rec.thumbAxis = k;
      rec.thumbMoved = true;
    }
  }
  /* THE SUPPORT THUMB LIES ALONG THE LEFT OF WHAT IT HOLDS, pointing at the muzzle -- on a forend
     and on a pistol's frame alike. The grip solve aimed it forward and up off the side, and on the
     M4 it reached past the end of the handguard into the air. From its own base, along the left
     surface: the joints pushed out until they clear it. Only kept if it ends nearer the gun. */
  /* On a forend, or round a pistol's frame (where it closes over the firing hand: `sf.raw`) -- not on
     a vertical foregrip, where the thumb wraps over the fingers as the grip solve put it; laid along
     the Arc Breaker's foregrip it came out bent up into a boomerang. */
  if (!firing && (underFore || (upright && sf.raw)) && rec.thumbPivot && rec.thumbMid && rec.thumbTip) {
    const rT = radius * 1.05;
    const T0 = rec.thumbPivot;
    const L0 = len(sub(rec.thumbMid, T0)), L1 = len(sub(rec.thumbTip, rec.thumbMid));
    const leftAt = (x, y) => { const p = [x, y, 0]; for (let n = 0; n < 50 && sf(p[0], p[1], p[2]) < rT; n++) p[2] -= 0.0012; return p; };
    /* At the height of the frame. Below a pistol's slide, ahead of the guard, there is nothing at
       the thumb's own height, and the search left it on the centre line in the air under the gun,
       showing out the other side. It rises until there is a side to lie along. */
    const sideAt = (x, y) => {
      for (let yy = y; yy <= y + 0.035; yy += 0.0015) if (sf(x, yy, 0) < rT) return leftAt(x, yy);
      return leftAt(x, y);
    };
    const yT = T0[1] + 0.004;
    const M = sideAt(T0[0] + L0 * 0.95, yT), T = sideAt(T0[0] + (L0 + L1) * 0.92, yT + 0.002);
    const dNow = sf(rec.thumbTip[0], rec.thumbTip[1], rec.thumbTip[2]), dNew = sf(T[0], T[1], T[2]);
    if (dNew < Math.max(dNow, rT * 1.6) && Math.abs(T[2]) < 0.07 && len(sub(M, T0)) < L0 * 1.6) {
      rec.thumbMid = M; rec.thumbTip = T;
      rec.thumbAxis = nrm(cross(nrm(sub(M, T0)), [0, 0, -1]));
      rec.thumbMoved = true;
    }
  }
  // Only a thumb left floating: one the grip solve laid on the gun is already where it belongs.
  const tt = rec.thumbTip;
  if (rec.thumbPivot && rec.thumbMid && tt && rec.thumbAxis && sf(tt[0], tt[1], tt[2]) > 0.014) {
    const T0 = rec.thumbPivot;
    const L0 = len(sub(rec.thumbMid, T0)), L1 = len(sub(rec.thumbTip, rec.thumbMid));
    let d0 = nrm(sub(rec.thumbMid, T0)), d1 = nrm(sub(rec.thumbTip, rec.thumbMid));
    let k = nrm(rec.thumbAxis);
    // Closing is whichever way brings the tip to the gun: tried both ways, a little.
    const tipAt = (kk, t) => { const a0 = rot(d0, kk, t), a1 = rot(d1, kk, t); const q = add(add(T0, mul(a0, L0)), mul(a1, L1)); return sf(q[0], q[1], q[2]); };
    if (tipAt(mul(k, -1), 15 * DEG) < tipAt(k, 15 * DEG)) k = mul(k, -1);
    const rT = radius * 1.05;
    const t0 = joint(T0, d0, k, L0, rT, 0, -30 * DEG, 70 * DEG);
    d0 = rot(d0, k, t0);
    const M = add(T0, mul(d0, L0));
    d1 = rot(d1, k, t0);
    const t1 = joint(M, d1, k, L1, rT * 0.85, 0, -25 * DEG, 60 * DEG);
    d1 = rot(d1, k, t1);
    rec.thumbMid = M;
    rec.thumbTip = add(M, mul(d1, L1));
    rec.thumbAxis = k;
  }
  // The finger list the game turns fingers by is the four kept fingers, in order -- not every
  // trial build the solve made on the way.
  rec.digits = rec.byFinger.slice(0, 4);
  // This hand's bones as capsules, for the other hand to close onto (a two-handed pistol grip).
  const caps = [];
  for (const d of rec.byFinger) {
    const q = [d.pivots3[0], d.pivots3[1], d.pivots3[2], d.tip];
    for (let j = 0; j < 3; j++) caps.push([q[j], q[j + 1], R[j]]);
  }
  if (rec.thumbPivot && rec.thumbMid && rec.thumbTip) { caps.push([rec.thumbPivot, rec.thumbMid, radius * 1.05]); caps.push([rec.thumbMid, rec.thumbTip, radius * 0.9]); }
  return caps;
}

/* The gun's surface with a hand's bones added to it: what the support hand of a two-handed pistol
   grip closes onto is the firing hand's fingers wrapped round the grip, not the grip under them. */
function _surfaceWithHand(sf, caps) {
  const { sub, dot } = _ba;
  const f = (x, y, z) => {
    let d = sf(x, y, z);
    const p = [x, y, z];
    for (const [a, b, r] of caps) {
      const ab = sub(b, a), ap = sub(p, a);
      const t = Math.max(0, Math.min(1, dot(ap, ab) / (dot(ab, ab) || 1)));
      const dx = ap[0] - ab[0] * t, dy = ap[1] - ab[1] * t, dz = ap[2] - ab[2] * t;
      // Fingers are soft: the support fingers press a few millimetres into the firing hand's.
      const dd = Math.hypot(dx, dy, dz) - r + 0.004;
      if (dd < d) d = dd;
    }
    return d;
  };
  f.raw = sf;
  return f;
}

/* Points on the palm's skin (palm side, clear of the knuckle row where the fingers bend), in the
   figure's space: what _bodyArm closes the palm onto the grip by. Cached per side. */
function _palmSamples(src, S, palmMHk) {
  const key = '_palmPts' + S;
  if (src[key]) return src[key];
  const { g, info } = src, H = info[S];
  const { sub, dot } = _ba;
  const P = g.positions, nv = P.length / 3;
  const hvIdx = new Map();
  for (let i = 0; i < H.hv.length; i++) hvIdx.set(H.hv[i], i);
  const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const cand = [];
  for (let i = 0; i < nv; i++) {
    const hi = hvIdx.get(g.srcVert[i]);
    if (hi === undefined) continue;
    let palm = 0;
    for (let m = 0; m < 5; m++) {
      const w = H.ws[hi * 5 + m];
      if (w < 1e-3) continue;
      const fg = H.fingers[m];
      palm += w * (1 - ss(fg.js[0] * fg.L - 0.017, fg.js[0] * fg.L + 0.017, H.s[hi * 5 + m]));
    }
    if (palm < 0.85) continue;
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], d = sub(p, palmMHk.o);
    // Behind the knuckle row by 2.5 cm or more, and on the palm side of the hand's middle.
    if (dot(d, palmMHk.a) > -0.025 || dot(d, palmMHk.c) < 0.004) continue;
    cand.push(p);
  }
  const step = Math.max(1, Math.floor(cand.length / 60));
  src[key] = cand.filter((_, i) => i % step === 0);
  return src[key];
}

/* Build one arm (skin and sleeve) in the weapon's space.
 *
 *   S      'R' or 'L' (the figure's side)
 *   rec    the rig's record of this hand (makeViewmodelArms `digits.right/left`)
 *   shoulder  where the rig's sleeve starts, weapon space
 *   base   the first palette slot of this arm: base+0 sleeve, +1 forearm, +2 palm,
 *          +3 thumb, +4 + f*3 + b finger f bone b (the rig's own numbering, f 0 = little)
 */
function _bodyArm(src, S, rec, shoulder, base, sf, keepThumb) {
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
  let palmR = kFrame(kMidR, sub(BF[3].pivots3[0], BF[0].pivots3[0]), nR, sgnK);
  let palmCarry = _baCarry(palmMHk, palmR, hk, hk, hk);
  // The fingers and thumb closed onto this weapon's own surface (the rig only placed the knuckles well).
  if (sf && !rec.__wrapped) { rec.__caps = _wrapHand(rec, sf, palmR.a, nR, 0.0088, S === 'R', keepThumb); rec.__wrapped = true; }
  /* THE PALM CLOSES ONTO THE GRIP, as a finger does. Framed from the fingers alone, the palm came
     out in line with their first bones -- a hand with its knuckles straight. On a pistol grip those
     bones run across the front strap, so the palm stood straight out to the side of the gun with the
     wrist 10 cm off it: from above, both arms of a two-handed pistol hold made a T, every firing
     forearm stuck out at right angles to its gun, and the thumb, rooted on that palm, crossed the
     back of the slide in the sight picture. The palm turns about the knuckle row toward its own
     palm side, from the fingers' line, until its skin meets the gun (or the knuckles are bent as
     far as a hand's go), so it lies on the grip and the wrist falls behind it. */
  /* Not round a melee handle (`haft`: the hammer's, the knife's, the shield's bar): the grip solve's
     own fist round the bar already sets that palm, and turned further, the hammer's forearm came
     into the aimed view from the middle of the right edge. */
  if (sf && rec.grip !== 'haft') {
    // The palm side again, from the fingers as they now are (the trigger finger is no guide to it).
    const use = S === 'R' && rec.indexPlane != null ? [0, 1, 2] : [0, 1, 2, 3];
    let n2 = [0, 0, 0], cs = [0, 0, 0];
    for (const f of use) {
      const k0 = BF[f].pivots3[0], d0 = nrm(sub(BF[f].pivots3[1], k0));
      n2 = add(n2, nrm(cross(BF[f].axis, d0)));
      const t = sub(BF[f].tip, k0);
      cs = add(cs, sub(t, mul(d0, dot(t, d0))));
    }
    n2 = nrm(n2);
    if (dot(cs, n2) < 0) n2 = mul(n2, -1);
    const fr0 = kFrame(kMidR, sub(BF[3].pivots3[0], BF[0].pivots3[0]), n2, sgnK);
    const turnF = (t) => {
      const c = Math.cos(t), s = Math.sin(t);
      return { o: fr0.o, b: fr0.b, a: add(mul(fr0.a, c), mul(fr0.c, -s)), c: add(mul(fr0.c, c), mul(fr0.a, s)) };
    };
    const pts = _palmSamples(src, S, palmMHk);
    const clearAt = (t) => {
      const cr = _baCarry(palmMHk, turnF(t), hk, hk, hk);
      let m = Infinity;
      for (const p of pts) { const q = cr(p); m = Math.min(m, sf(q[0], q[1], q[2])); }
      return m;
    };
    const DEG = Math.PI / 180, TOUCH = -0.0025, HI = 90 * DEG, LO = -20 * DEG;
    /* A support hand under a forend CUPS it: its palm closes until it meets the gun or the wrist
       comes up a third of the way up the forend's side, not on up the side of a narrow one (the
       C96's magazine housing) until the wrist is over the gun and the arm comes down into the
       picture from the top of the screen. */
    const wristOk = rec.constructed
      ? (t) => _baCarry(palmMHk, turnF(t), hk, hk, hk)(Jw)[1] <= rec.constructed.yb + 0.35 * (rec.constructed.yt - rec.constructed.yb)
      : () => true;
    let t = 0;
    if (clearAt(0) < TOUCH) {
      for (let n = 1; LO <= -n * 2 * DEG; n++) if (clearAt(-n * 2 * DEG) >= TOUCH) { t = -n * 2 * DEG; break; }
    } else {
      for (const st of [6 * DEG, 1.5 * DEG]) while (t + st <= HI && clearAt(t + st) >= TOUCH && wristOk(t + st)) t += st;
    }
    palmR = turnF(t);
    palmCarry = _baCarry(palmMHk, palmR, hk, hk, hk);
    nR = palmR.c;
    rec.palmFlex = +(t / DEG).toFixed(1);
  }
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
  let thumbCarry = null, thenarShift = null;
  if (rec.thumbPivot && rec.thumbMid && rec.thumbTip && rec.thumbAxis) {
    const fg = MF[4];
    /* ROOTED ON THE PALM. The rig's thumb pivot is its own point, and the palm is fitted to the
       knuckle row separately; where the two disagreed, the skin between the thumb and the hand
       was pulled across the gap -- the tent of skin at the web on nearly every support hand the
       audit looked at, and on the SVT-40 a sheet of it up across the forend. The thumb starts
       where the palm puts the figure's own thumb base. */
    let t0 = palmCarry(fg.piv[0]);
    let t1 = V(rec.thumbMid);
    /* A FIRING THUMB GOES ROUND THE BACK OF THE GRIP: its root is on the far side of the backstrap
       (_wrapHand), where the flat palm cannot reach. The thenar -- the palm's skin that belongs to
       the thumb -- is drawn round to it, most at the thumb's root and none at the wrist, so the web
       wraps the backstrap instead of the thumb leaving the palm on the near side and crossing the
       gun. */
    if (S === 'R' && rec.thumbMoved && rec.indexPlane != null) {
      let D = sub(V(rec.thumbPivot), t0);
      const dl = len(D);
      if (dl > 0.05) D = mul(D, 0.05 / dl);
      thenarShift = D;
      t0 = add(t0, D);
    }
    /* And it swings from there no further than a thumb does: the first bone kept within 70
       degrees of where the palm carries the figure's own thumb, or the web twists into a spike. */
    if (!thenarShift) {
      const rest = nrm(sub(palmCarry(fg.piv[1]), t0));
      let a = sub(t1, t0);
      const L = len(a) || 0.03;
      a = mul(a, 1 / L);
      const cosA = dot(a, rest), MAXA = 70 * Math.PI / 180;
      if (cosA < Math.cos(MAXA)) {
        const perp = nrm(sub(a, mul(rest, cosA)));
        a = add(mul(rest, Math.cos(MAXA)), mul(perp, Math.sin(MAXA)));
        t1 = add(t0, mul(a, L));
      }
    }
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
            if (thenarShift) {
              // The thenar drawn round with the thumb's root: all of it at the root, none 4.5 cm back.
              const g2 = ss(-0.045, -0.004, s), D = thenarShift;
              const thenar = (p) => { const q = palmCarry(p); return [q[0] + D[0] * g2, q[1] + D[1] * g2, q[2] + D[2] * g2]; };
              parts.push([thenar, 2, wH * wsf * (1 - t[0])]);
            } else parts.push([palmCarry, 2, wH * wsf * (1 - t[0])]);
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
/* THE SUPPORT HAND ON A FOREND, BUILT FROM THE FOREND.
 *
 * The rig's grip solve seats a support hand by searching for wherever a knuckle row fits the
 * surface best, and across sixty guns that search lands everywhere: over the top of a round shroud
 * (M16, Volkhammer, PPSh -- the palm in the sight picture), palm flat on the side, a hand pulled
 * into a torn sheet of skin under the G3's handguard. A support hand on a forend is not a search
 * problem. It is one hold: palm under the forend, the knuckle row along its lower right edge (index
 * forward, beside the thumb), the fingers curling up the right side, the thumb along the left side
 * pointing at the muzzle. So the forend is measured at the hand's station -- its underside, its top
 * and its two sides -- and the hand is put there; _wrapHand then closes every finger onto the
 * metal as before. The rig's actors still carry the hand (the reload moves them and the hand goes
 * with them); only where it rests on the gun is decided here. */
function _constructForeGrip(rec, sf, bore, hold) {
  const { sub, add, mul, nrm, len } = _ba;
  if (!rec || !rec.byFinger || !rec.at || bore == null) return false;
  const x0 = rec.at[0];
  /* Over 40 mm of the forend, not one slice: a ringed handguard (the G3's) or a cage shroud (the
     Volkhammer's) is mostly air in any one slice, and a hand holds the envelope of it. And measured
     from OUTSIDE in, by distance alone: whether a point is inside these meshes (parity) is not
     reliable off the centre plane -- it read the M4's handguard as 12 mm wide -- but how far a point
     is from the metal always is. */
  const XS = [-0.02, -0.012, -0.004, 0.004, 0.012, 0.02].map((o) => x0 + o);
  const near = (y, z) => { for (const x of XS) if (sf(x, y, z) < 0.001) return true; return false; };
  let yb = null, yt = null, zr = null, zl = null;
  for (let y = bore - 0.07; y <= bore; y += 0.001) if (near(y, 0) || near(y, -0.005) || near(y, 0.005)) { yb = y; break; }
  for (let y = bore + 0.03; y >= bore; y -= 0.001) if (near(y, 0) || near(y, -0.005) || near(y, 0.005)) { yt = y; break; }
  if (yb == null || yt == null) return false;
  const ym = (yb + yt) / 2, yq = yb + 0.25 * (yt - yb);
  for (let z = 0.06; z >= 0; z -= 0.001) if (near(ym, z) || near(yq, z)) { zr = z; break; }
  for (let z = -0.06; z <= 0; z += 0.001) if (near(ym, z) || near(yq, z)) { zl = z; break; }
  if (zr == null || zl == null) return false;
  zr = Math.max(zr, 0.006); zl = Math.min(zl, -0.006);
  const R = 0.0095, pitch = 0.0202;
  const SWEEP = 25 * Math.PI / 180;
  const cY = Math.cos(SWEEP), sY = Math.sin(SWEEP);
  const turn = (v, t) => {                          // rotate v about -x by t: closes +z toward +y
    const c = Math.cos(t), s2 = Math.sin(t);
    return [v[0], v[1] * c + v[2] * s2, -v[1] * s2 + v[2] * c];
  };
  for (let f = 0; f < 4; f++) {
    const d = rec.byFinger[f];
    const L = [len(sub(d.pivots3[1], d.pivots3[0])), len(sub(d.pivots3[2], d.pivots3[1])), len(sub(d.tip, d.pivots3[2]))];
    /* Under the forend, a third of the way in from its right edge: the forend rests in the palm, the
       first bone of each finger goes round the corner and the rest curl up the side. At the corner
       itself, on a wide handguard, the fingers rose flat up the side like a board. */
    /* Two holds (makeBodyArms closes both onto the gun and keeps the one that rests on it): `wide`,
       the knuckles a third of the way in from the right edge, the first bone rising up the lower
       corner and the finger lying up the flat side -- a wide handguard, the M4's or the MG 42's
       jacket; and `slim`, the first bone flat along the underside and the finger turning up hard at
       the corner, the knuckles over toward the left edge -- a slim forend held in a fist. Set a third
       of the way in on a slim forend, the first bones overshot its side by 25 mm and the fingers
       stood out to the right of the Scattergun's barrels. */
    const wide = hold === 'slim' ? 0 : 1;
    const zSlim = Math.max(zr + R * 0.3 - L[0] * 0.85, zl + 0.004), zWide = Math.max(zr - 0.30 * (zr - zl), 0.004);
    const P0 = [x0 + (f - 1.5) * pitch, yb - R * 0.7, wide ? zWide : Math.min(zWide, zSlim)];
    let dir = nrm([0, 0.25 + 0.30 * wide, 1]);
    const P1 = add(P0, mul(dir, L[0]));
    dir = turn(dir, 1.15 - 0.65 * wide);
    const P2 = add(P1, mul(dir, L[1]));
    dir = turn(dir, 0.55 - 0.15 * wide);
    const T = add(P2, mul(dir, L[2]));
    /* ANGLED FORWARD as they wrap, the whole hand turned about the knuckle row's middle: a support
       hand does not grip square across the forend -- its fingers lean toward the muzzle as they
       come up the side, so the index knuckle sits further under and the wrist trails back toward
       the shooter. Square across, the palm's long axis ran straight out to the left and aimed, the
       support arm came in flat from the side edge of the screen. */
    const zc = wide ? zWide : Math.min(zWide, zSlim);
    const turnY = (q) => {
      const dx = q[0] - x0, dz = q[2] - zc;
      return [x0 + dx * cY + dz * sY, q[1], zc - dx * sY + dz * cY];
    };
    const Q = [P0, P1, P2, T].map(turnY);
    d.pivots3 = [Q[0], Q[1], Q[2]];
    d.joints = [Q[1], Q[2]];
    d.knuckle = Q[0];
    d.tip = Q[3];
    d.axis = [-cY, 0, sY];
    d.open = -1;
  }
  // The thumb along the left side, pointing at the muzzle; its root is where the palm puts it.
  rec.thumbPivot = [x0 + 0.012, yb - 0.004, zl - R * 0.6];
  rec.thumbMid = [x0 + 0.045, yb + 0.25 * (ym - yb), zl - R * 0.9];
  rec.thumbTip = [x0 + 0.075, yb + 0.4 * (ym - yb), zl - R * 0.9];
  rec.thumbAxis = [0, -1, 0];
  rec.digits = rec.byFinger.slice(0, 4);
  rec.constructed = { yb, yt, zl, zr };
  return true;
}

/* A hand record copied deep (its arrays and plain objects), to try a hold on without touching the
   one the game keeps; and the winner's values written back into the kept record's own objects, so
   everything already holding a reference to a finger keeps it. */
function _cloneRec(o) {
  if (Array.isArray(o)) return o.map(_cloneRec);
  if (!o || typeof o !== 'object') return o;
  if (Object.getPrototypeOf(o) !== Object.prototype) return o;
  const c = {};
  for (const k of Object.keys(o)) c[k] = _cloneRec(o[k]);
  return c;
}
function _adoptRec(dst, src) {
  const fingers = dst.byFinger;
  for (const k of Object.keys(src)) if (k !== 'byFinger' && k !== 'digits') dst[k] = src[k];
  src.byFinger.forEach((d, f) => { if (fingers[f]) Object.assign(fingers[f], d); else fingers[f] = d; });
  dst.digits = dst.byFinger.slice(0, 4);
}
/* How well a hand's fingers rest on the gun: each joint's distance from lying on the surface, a joint
   in the gun counting double -- the same measure _wrapHand closes a finger by. */
/* Measured against the gun itself (`sf`); the ceiling over the sights (`sfCeil`) only counts where a
   joint is through it -- resting against that line in the air is not resting on the gun. */
function _restScore(rec, sf, sfCeil) {
  const R = [0.0088, 0.0081, 0.0072];
  let acc = 0;
  for (const d of rec.byFinger.slice(0, 4)) {
    [d.pivots3[1], d.pivots3[2], d.tip].forEach((q, j) => {
      const e = sf(q[0], q[1], q[2]) - R[j];
      acc += e < 0 ? -2 * e : e;
      const c = sfCeil ? sfCeil(q[0], q[1], q[2]) - R[j] : e;
      if (c < e && c < 0) acc -= 2 * c;
    });
  }
  return acc;
}

function makeBodyArms(parts, shoulders, sf, keepThumb, ext) {
  if (parts.__bodyArms !== undefined) return parts.__bodyArms;
  parts.__bodyArms = null;
  const src = _bodyArmSource();
  if (!src || !parts.digits) return null;
  try {
    const r = _bodyArm(src, 'R', parts.digits.right, shoulders.right, 0, sf, keepThumb);
    /* The support hand closes onto the gun and onto the firing hand's fingers wherever the two
       hands share the grip (a two-handed pistol); on a rifle they are half a metre apart and the
       firing hand changes nothing. */
    const rc = parts.digits.right && parts.digits.right.__caps;
    const sfL = sf && rc && rc.length ? _surfaceWithHand(sf, rc) : sf;
    const dl = parts.digits.left;
    let sfS = sfL;
    /* And no finger above the sights: the support hand's surface gets a ceiling just under the
       sight line, so a finger curling up the forend's side stops there instead of crossing it --
       nor above the forend's own top by more than a fingertip: a support hand's fingers come up its
       side to the top edge, they do not lie across the top (the M16's did, an overhand hold). */
    const ceiling = (rec) => {
      /* ...nor quite to the top edge: fingers that reached it lay across the top of a slim forend's
         barrel. (Capped at the bore instead, they could not fit up a tall forend -- the
         Breakwater's -- and were pushed out sideways, 55 mm off it.) */
      const top = rec.constructed ? rec.constructed.yt - 0.004 : Infinity;
      if (ext.sightY == null && top === Infinity) return sfL;
      const lim = Math.min(ext.sightY != null ? ext.sightY - 0.004 : Infinity, top), under = sfL;
      const f = (x, y, z) => Math.min(under(x, y, z), lim - y);
      f.raw = under.raw;
      return f;
    };
    let l = null;
    if (parts.hasLeft && dl && sf && ext && (dl.grip === 'fore' || dl.grip === 'woodFore' || dl.grip === 'tube')) {
      /* BOTH HOLDS, and the one that rests on the gun is kept: across sixty forends neither the
         wide-handguard hold nor the slim fist is right for every one, and the forend's width alone
         did not say which (measured: each won on guns either side of every threshold tried). */
      let best = null;
      for (const hold of ['wide', 'slim']) {
        const r2 = _cloneRec(dl);
        if (!_constructForeGrip(r2, sf, ext.boreY, hold)) break;
        const sfH = ceiling(r2);
        const body = _bodyArm(src, 'L', r2, shoulders.left, 16, sfH);
        /* The palm-under hold unless the fist is clearly better: the fist's palm is round the left
           side, and from there the hand reads as gripping from above. */
        const sc = _restScore(r2, sfL, sfH) * (hold === 'slim' ? 1 / 0.7 : 1);
        if (!best || sc < best.sc) best = { sc, body, r2, hold };
      }
      if (best) {
        _adoptRec(dl, best.r2);
        dl.hold = best.hold;
        l = best.body;
      }
    }
    /* Any other support hold keeps under the sight line too: wrapped round the C96's magazine
       housing, its support fingers came up over it and 4.6 mm into the sight picture. */
    if (!l && parts.hasLeft) l = _bodyArm(src, 'L', dl, shoulders.left, 16, dl ? ceiling(dl) : sfS);
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

/* THE FIRING HAND IS FITTED TO ITS GRIP, not hung at a number.
 *
 * Multiplayer has one anchor for the firing hand on all seventy-five guns, and the grips are
 * nowhere near one place: measured against that anchor, the MG 42's trigger is 58 mm above the
 * index knuckle and its little finger's knuckle hangs below the bottom of the grip; the MP5's
 * hand sits 30 mm under its trigger group; on the M4 and the P226 the knuckle row stood 15 to
 * 25 mm in front of the front strap, on the gun's centre line, with the web of the hand 20 mm
 * under the receiver -- fingers that came round the grip from in front of it and lay straight
 * along its far side, and a middle finger whose knuckle was level with the trigger guard, so the
 * guard stopped it closing and it pointed off into the air.
 *
 * A hand on a pistol grip sits with its middle finger tucked under the trigger guard (or under
 * the frame, where there is no guard) and its knuckle row on the side of the grip just behind the
 * front strap; the index finger then lies at the guard's opening and the web of the hand comes
 * up under the receiver. So: solve the hand once where the anchor says (geometry only, nothing
 * spawned), measure where the front strap runs into the guard above the middle finger, move the
 * anchor so the middle knuckle lands one finger-radius under that and 8 mm behind the strap, and
 * once more from there (the solve seats the hand against the surface itself, so the first move is
 * not all kept). A support hand wrapped round the firing hand (a pistol's) moves with it.
 *
 * Only for the `pistol` grip with a surface to measure; `opts.fitHand === false` keeps the
 * anchor as given. */
function _fitFiringHand(hands, opts) {
  const { sub, len } = _ba;
  const sf = opts.surface;
  if (!sf || opts.fitHand === false || !hands || !hands.right) return hands;
  /* Any grip whose index works a trigger: the `pistol` and `wrist` kinds and a weapon's own grip
     that says so (the C96's, the MG 42's) -- left out, those hands sat 26 to 51 mm under their
     triggers. */
  const gripIn = hands.rightGrip || 'pistol';
  const gk = typeof gripIn === 'string' ? GRIP_KINDS[gripIn] : gripIn;
  if (!gk || gk.index !== 'trigger') return hands;
  // Metal anywhere across the middle of the gun at (x, y): a guard bar or a strap is not always
  // on the centre plane itself.
  const solid = (x, y) => {
    for (const z of [0, -0.005, 0.005, -0.010, 0.010]) if (sf(x, y, z) < 0) return true;
    return false;
  };
  const trial = (at) => {
    const rec = {};
    const g3 = () => [new Geometry(), new Geometry(), new Geometry()];
    try {
      buildViewHand(new Geometry(), new Vec3(at[0], at[1], at[2]), 1, { grip: gripIn, thumbGeo: new Geometry(),
        out: rec, boreY: opts.boreY, sightY: opts.sightY, indexGeo: new Geometry(),
        digitGeos: [new Geometry(), new Geometry(), new Geometry(), new Geometry()], palmGeo: new Geometry(),
        phalanxGeos: [g3(), g3(), g3(), g3()], surface: sf });
    } catch (e) { return null; }
    return rec.byFinger && rec.byFinger[2] ? rec : null;
  };
  // The front strap at height y: out of the metal forward if x0 starts in it, else back until metal.
  const frontAt = (y, x0) => {
    if (solid(x0, y)) {
      for (let x = x0; x < x0 + 0.04; x += 0.001) if (!solid(x, y)) return x - 0.0005;
      return null;
    }
    for (let x = x0; x > x0 - 0.07; x -= 0.001) if (solid(x, y)) return x + 0.0005;
    return null;
  };
  /* What is over the fingers, ahead of the strap: down from the bore at x, the last edge from
     metal into air that has 25 mm of air under it -- the bottom of the trigger guard's bar, or of
     the frame where there is no guard (the guard's own opening is air too, but metal follows it). */
  const ceilingAt = (x, yLow) => {
    const yHigh = opts.boreY != null ? opts.boreY : 0.02;
    // Runs of metal and air, top down.
    const runs = [];
    for (let y = yHigh; y >= yLow; y -= 0.001) {
      const m = solid(x, y);
      if (!runs.length || runs[runs.length - 1].m !== m) runs.push({ m, top: y, bot: y });
      else runs[runs.length - 1].bot = y;
    }
    /* A GUARD FIRST, from the top down: the first thin bar under the receiver with its opening over
       it and air under it. Searched from the bottom up, the Ranger's lower bar 40 mm under its guard
       was taken for the guard and the hand dropped to the end of its travel, the trigger 52 mm above
       the index knuckle. */
    for (let i = 2; i < runs.length; i++) {
      const air = runs[i], bar = runs[i - 1], above = runs[i - 2];
      if (air.m || !bar.m || above.m) continue;
      if (bar.top - bar.bot < 0.012 && above.top - above.bot >= 0.006 && (air.top - air.bot >= 0.010 || i === runs.length - 1)) {
        return { y: air.top, guard: true };
      }
    }
    // The last metal-to-air edge with 25 mm of air (or the end of the scan) under it.
    for (let i = runs.length - 1; i > 0; i--) {
      const r = runs[i];
      if (r.m || !runs[i - 1].m || r.top - r.bot < 0.025 - 0.0011) continue;
      /* A GUARD, or the frame? A guard is a thin bar with its opening over it; then the middle
         finger goes under the bar and the index rides in the opening. Under a plain frame (a
         bullpup's body, a grip with no guard in front of it) there is no opening to put the index
         in, and tucking the middle finger under it put the AUG's index knuckle inside the stock:
         there the INDEX goes under it. */
      const bar = runs[i - 1], above = runs[i - 2];
      const guard = bar.top - bar.bot < 0.012 && !!above && !above.m && above.top - above.bot >= 0.006;
      return { y: r.top, guard };
    }
    return null;
  };
  const R = 0.0095;                   // a finger's radius, skin included
  /* Up to four solves, each moving the anchor most of the way to where the last one says the
     middle knuckle should be; the one whose knuckle actually landed nearest its target is kept.
     The hand seats itself against the grip after the anchor moves, so the response is not
     linear, and an unchecked last step is how the MG 42's hand first went off up its receiver. */
  const base = hands.right;
  let at = base.slice(), best = null;
  at[2] += 0.004;
  for (let it = 0; it < 4; it++) {
    const rec = trial(at);
    if (!rec) break;
    const m = rec.byFinger[2].pivots3[0];
    const f0 = frontAt(m[1], m[0] + 0.012);
    if (f0 == null) break;
    /* Read a little way ahead of the strap, station by station out to 64 mm: right in front of it
       the line can run down the trigger blade itself and never see the opening above the guard's
       bar -- and on the M1911 and the Thompson the guard does not begin until 25 to 35 mm ahead of
       the strap. Read only that close, the frame's edge was taken for the ceiling, the index sent
       under it, and the hand sat a finger low (the Thompson's ring and little knuckles below the
       bottom of its grip, its trigger 37 mm above the index knuckle). The first station that finds a
       guard is the one; failing that, the nearest frame. */
    let ceil = null;
    /* Straight under the trigger first: the guard's bottom bar is what is directly below the trigger
       blade. Read from the strap outward alone, a station through the guard's own rear upright sees
       no opening and takes whatever bar is lower down (the Ranger's, 40 mm under its guard). */
    const TA = rec.trigAt;
    if (TA) {
      for (const ox of [0.004, 0.010, -0.002, 0.016]) {
        const c = ceilingAt(TA[0] + ox, m[1] - 0.06);
        if (c && c.guard && c.y < TA[1]) { ceil = c; break; }
      }
    }
    if (!ceil) {
      for (const ox of [0.016, 0.022, 0.010, 0.028, 0.034, 0.040, 0.046, 0.052, 0.058, 0.064]) {
        const c = ceilingAt(f0 + ox, m[1] - 0.06);
        if (c && c.guard) { ceil = c; break; }
        if (c && !ceil && ox <= 0.022) ceil = c;
      }
    }
    if (ceil == null) break;
    const spread = len(sub(rec.byFinger[3].pivots3[0], m)) || 0.0194;
    const Y = ceil.y - R - 0.0015 - (ceil.guard ? 0 : spread);
    const fy = frontAt(Y, f0 + 0.010);
    if (fy == null) break;
    /* The knuckle row just AHEAD of the front strap, at the grip's front corner (and, below, 4 mm
       out from its side) -- so the first bone of each finger lies across the strap. Set 8 mm behind
       it, the first bone met the corner end-on and stood off it, its middle joint 7 mm proud of the
       strap. Further ahead (6 mm) laid the middle finger's first bone squarer across, but brought
       the index knuckle to within 6 mm of the trigger on the Grease Gun and folded the trigger
       finger back on itself; the "second finger reaching forward" it was chasing was the thumb
       (see _wrapHand). */
    let X = fy + 0.002;
    /* And not into the stock. Raising the hand raises the web of it, and on a gun whose stock
       or receiver comes down behind the grip (the Scattergun, the MG 42) the thumb's base went
       14 mm into the wood. Buried, it counts against the solve and the next step goes back down. */
    const T = rec.thumbPivot;
    const buried = T ? Math.max(0, 0.007 - sf(T[0], T[1], T[2])) : 0;
    let tY = Y;
    if (buried > 0) tY = Math.min(Y, m[1] - buried * 1.2);
    const err = Math.hypot(X - m[0], Y - m[1]) + 3 * buried;
    if (!best || err < best.err) best = { at: at.slice(), err };
    if (err < 0.002) break;
    const nx = Math.max(base[0] - 0.03, Math.min(base[0] + 0.02, at[0] + 0.85 * (X - m[0])));
    const ny = Math.max(base[1] - 0.03, Math.min(base[1] + 0.07, at[1] + 0.85 * (tY - m[1])));
    if (Math.abs(nx - at[0]) < 0.001 && Math.abs(ny - at[1]) < 0.001) break;
    at = [nx, ny, at[2]];
  }
  if (!best) return hands;
  at = best.at;
  const dx = at[0] - hands.right[0], dy = at[1] - hands.right[1];
  if (!dx && !dy) return hands;
  const out = Object.assign({}, hands, { right: at, fitted: [+dx.toFixed(4), +dy.toFixed(4)] });
  // A support hand round the firing hand's fingers (a two-handed pistol grip) goes where they go.
  if (hands.left && Math.abs(hands.left[0] - hands.right[0]) < 0.05) {
    out.left = [hands.left[0] + dx, hands.left[1] + dy, hands.left[2]];
  }
  return out;
}

/* MULTIPLAYER'S SUPPORT STATION, off bare barrel. The automatic station is two-thirds of the way out
 * (handsFor, mp-game); on a gun with nothing under the barrel there -- the MP7, UMP, Vector -- that
 * put the hand round the bare barrel by the front sight. With `opts.supportStation === 'auto'` it
 * slides back, up to 80 mm, to the front of whatever there is to hold; no further (sent 160 mm back,
 * the AUG's hand left the gun altogether). Authored anchors (zombies) keep their station: a pump
 * gun's support hand has to stay on the pump. */
function _supportStation(hands, opts) {
  const sf = opts.surface;
  if (!sf || opts.supportStation !== 'auto' || !hands || !hands.left) return hands;
  const grip = hands.leftGrip || 'fore';
  if (grip !== 'fore' && grip !== 'woodFore' && grip !== 'tube') return hands;
  const bore = opts.boreY != null ? opts.boreY : 0.03;
  const depth = (x) => {
    let low = null, seen = false;
    for (let y = bore; y > bore - 0.11; y -= 0.001) {
      let m = false;
      for (const z of [0, -0.006, 0.006, -0.012, 0.012]) if (sf(x, y, z) < 0) { m = true; break; }
      if (m) { seen = true; low = y; } else if (seen && low - y > 0.006) break;
    }
    return low == null ? 0 : bore - low;
  };
  const x0 = hands.left[0];
  if (depth(x0) >= 0.018) return hands;
  const stop = Math.max(hands.right ? hands.right[0] + 0.10 : 0.08, x0 - 0.08);
  for (let x = x0; x > stop; x -= 0.004) {
    const d = depth(x);
    if (d > 0.075) break;                         // the magazine: stay ahead of it
    if (d >= 0.022) {
      const nx = Math.max(stop, x - 0.03);
      return Object.assign({}, hands, { left: [nx, hands.left[1], hands.left[2]], fittedLeft: [+(nx - x0).toFixed(4), 0] });
    }
  }
  return hands;
}

/* Swap the rig's tubes for the body's arms. The rig's actors keep every transform the game gives
   them and stop being drawn; the arms are drawn from them. `opts.stickArms` keeps the old look. */
const _viewmodelArmsRig = Engine.prototype.viewmodelArms;
Engine.prototype.viewmodelArms = function (weapon, hands, opts = {}) {
  /* Fitted once per arms key: the cache below returns the same arms for the same key, and the fit
     is a hand solve of its own. */
  const fkey = 'arms:' + (opts.key || JSON.stringify(hands));
  if (!(this._armCache && this._armCache[fkey])) hands = _supportStation(_fitFiringHand(hands, opts), opts);
  const arms = _viewmodelArmsRig.call(this, weapon, hands, opts);
  if (arms && hands && hands.fitted) arms.fitted = hands.fitted;
  if (arms && hands && hands.fittedLeft) arms.fittedLeft = hands.fittedLeft;
  if (!arms || opts.stickArms || this.stickArms) return arms;
  const key = 'arms:' + (opts.key || JSON.stringify(hands));
  const parts = this._armCache && this._armCache[key];
  if (!parts) return arms;
  const back = parts.shoulderX != null ? parts.shoulderX : -0.07;
  const drop = opts.drop != null ? opts.drop : -0.335, spread = opts.spread != null ? opts.spread : 0.315;
  const body = makeBodyArms(parts, { right: [back, drop, spread], left: [back, drop, -spread] }, opts.surface || null, !!opts.thumb,
    { boreY: opts.boreY != null ? opts.boreY : null, sightY: opts.sightY != null ? opts.sightY : null });
  if (!body) return arms;
  // The thumbs were closed onto the gun after the rig handed these out: the game turns them by these.
  const dr = parts.digits.right, dl = parts.digits.left;
  if (dr && dr.thumbAxis) arms.thumbAxis = parts.thumbAxis = dr.thumbAxis;
  if (dr && dr.thumbPivot) arms.thumbPivot = parts.thumbPivot = dr.thumbPivot;
  if (dl && dl.thumbAxis) arms.lThumbAxis = parts.lThumbAxis = dl.thumbAxis;
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
  // Far enough from the front end that the thumb, laid along the side, still has forend under it.
  x = Math.min(x, muzzle - 0.08, x1 - 0.07);
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
