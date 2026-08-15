/* ============================================================
   ANIMALS — sculpted, skinned, furred creatures with real brains.

   v2: every animal is ONE connected mesh — a body sculpted with
   lofted rings around a real quadruped skeleton (the same pipeline
   the human character uses), auto-skinned by bone distance, and
   posed by driving bone rotations from the gait system. No more
   floating parts: neck flows out of the chest, legs grow out of
   the shoulders and hips, and everything bends at real joints.

   Fur comes from the procedural 'fur' texture: dense strands
   running along the body, clumping, hide-tone patches and pale
   guard hairs, with the strand field driving the normal map so
   raking light shimmers across the coat.

   The brain (graze -> wander -> alert -> flee, herds, fawns that
   shadow their mothers, blinking, ear and tail flicks) carries
   over from v1 unchanged.

   Convention: yaw 0 faces +Z; forward is (sin yaw, 0, cos yaw).
   ============================================================ */

/* Proportions are taken from the real animals. Whitetail reference
   (a mature buck): shoulder height ~0.95m, torso ~1.15m, chest girth depth
   ~0.47m but only ~0.32m WIDE — deer are slab-sided, not barrels — a long
   ~0.55m neck carried high, a ~0.29m wedge head, and thin legs whose cannon
   bones are barely 5cm across. bodyW/bodyD are half-width/half-depth. */
/* Dimensions are the published biometrics of the real animals, the same way
   the AAA hunting games author theirs.
   Whitetail (Odocoileus virginianus), mature buck at k=1.0:
     shoulder 0.98m (recorded range 0.90-1.05, trophies to ~1.07)
     nose-to-tail-base ~1.9m, tail 0.30m  (total length range 1.52-2.13m)
     chest ~0.45m deep but only ~0.28m wide; cannon bone ~3.4cm across
     neck 0.50m; head 0.30m; ears ~0.16m; flat-out gallop ~13 m/s
   Eastern cottontail at k=1.0: 0.43m long, ~0.17m at the shoulder,
     ~6cm ears, ~7.5 m/s in the zigzag sprint. */
const ANIMAL_SPECIES = {
  deer: {
    shoulder: 0.98, bodyLen: 1.08, bodyW: 0.14, bodyD: 0.225,
    neckLen: 0.5, headLen: 0.3, earScale: 1.05, tailLen: 0.3, legW: 0.017,
    furLen: 0.038, shells: 14,
    coat: { male: 0xa08454, female: 0xab9060, fawn: 0xb59a68 },
    texture: { male: 'furDeer', female: 'furDeer', fawn: 'furFawn' },
    walkSpeed: 1.2, runSpeed: 11, gait: 'quad',
    alertR: 6.5, safeR: 16, grazes: true,
  },
  rabbit: {
    shoulder: 0.17, bodyLen: 0.3, bodyW: 0.07, bodyD: 0.095,
    neckLen: 0.06, headLen: 0.095, earScale: 1.35, tailLen: 0.045, legW: 0.011,
    furLen: 0.021, shells: 10,
    coat: { male: 0x9c8768, female: 0xa8946f, fawn: 0xb4a17e },
    texture: { male: 'fur', female: 'fur', fawn: 'fur' },
    walkSpeed: 0.6, runSpeed: 7.5, gait: 'hop',
    alertR: 4.5, safeR: 10, grazes: true,
  },
  // Real reference (WebSearch, dimensions.com + wildlife biology sources):
  // shoulder 1.0-1.4m male, body 1.68-2.44m nose-to-tail, heavy-set/broad-
  // chested with thick limbs and a short tail; dense grizzled brown coat,
  // silver-tipped guard hairs, darker legs/underside; surprisingly fast for
  // its bulk (short-burst speed near 35mph / ~15.6 m/s). Reuses the same
  // generic quadruped skeleton/loft/fur-shell pipeline as deer — a real new
  // species from real proportions, not a re-skin.
  bear: {
    shoulder: 1.2, bodyLen: 1.3, bodyW: 0.26, bodyD: 0.3,
    neckLen: 0.22, headLen: 0.36, earScale: 0.42, tailLen: 0.06, legW: 0.046,
    furLen: 0.05, shells: 15,
    coat: { male: 0x5c4530, female: 0x6b5138 },
    texture: { male: 'fur', female: 'fur' },
    walkSpeed: 1.3, runSpeed: 14, gait: 'quad',
    alertR: 8, safeR: 20, grazes: true,
  },
};

/* Yearling / mature / trophy — the same three tiers the hunting games use. */
const ANIMAL_SIZES = { small: 0.85, medium: 1.0, large: 1.12 };
const ANTLER_POINTS = { small: 2, medium: 4, large: 6 };

/* ---------------- skeleton ---------------- */

function makeQuadSkeleton(sp, k) {
  const W = sp.bodyW * k, D = sp.bodyD * k, BL = sp.bodyLen * k, NL = sp.neckLen * k, HL = sp.headLen * k;
  // The shoulder measurement is to the TOP of the withers; the spine line
  // sits half a chest below it, and the legs own everything under the belly.
  const spineY = sp.shoulder * k - D * 0.45;
  const legTop = spineY - D * 0.35;
  const upper = legTop * 0.52, lower = legTop * 0.46;
  const B = [];
  const bone = (name, parent, pos) => { B.push([name, parent, pos]); return B.length - 1; };

  const hips = bone('hips', -1, [0, spineY, -BL * 0.34]);
  const spine = bone('spine', hips, [0, 0.01 * k, BL * 0.3]);
  const chest = bone('chest', spine, [0, 0.01 * k, BL * 0.3]);
  // A deer's neck leaves the chest at ~55 degrees and is over half a metre
  // long — most of what makes the silhouette read "deer" lives here.
  const neck1 = bone('neck1', chest, [0, D * 0.5, BL * 0.1]);
  const neck2 = bone('neck2', neck1, [0, NL * 0.36, NL * 0.32]);
  const head = bone('head', neck2, [0, NL * 0.34, NL * 0.32]);
  bone('muzzle', head, [0, -HL * 0.08, HL * 0.65]);
  bone('earL', head, [HL * 0.3, HL * 0.42, -HL * 0.14]);
  bone('earR', head, [-HL * 0.3, HL * 0.42, -HL * 0.14]);
  const tail1 = bone('tail1', hips, [0, D * 0.42, -BL * 0.2]);
  bone('tail2', tail1, [0, -sp.tailLen * k * 0.8, -sp.tailLen * k * 0.35]);
  for (const side of [1, -1]) {
    const s = side > 0 ? 'L' : 'R';
    const fu = bone('fUp' + s, chest, [side * W * 0.6, -D * 0.35, BL * 0.05]);
    const fl = bone('fLo' + s, fu, [0, -upper, 0]);
    bone('fFt' + s, fl, [0, -lower, 0.015 * k]);
    const ru = bone('rUp' + s, hips, [side * W * 0.62, -D * 0.3, -BL * 0.03]);
    const rl = bone('rLo' + s, ru, [0, -upper, -0.02 * k]);
    bone('rFt' + s, rl, [0, -lower, 0.02 * k]);
  }
  return new Skeleton(B.map(([n, p, pos]) => new Bone(n, p, pos, null)));
}

/* ---------------- sculpt ---------------- */

/* The body is ONE continuous lofted surface from the rump, along the spine,
   up the neck and out to the nose — no seams anywhere on the animal's
   centreline. Each station along that path is a superellipse cross-section
   with a muscle-shaping function on top: haunch and shoulder bulges, the
   brisket keel, a subtle spine ridge. Legs, ears and tail are lofted tubes
   whose roots are buried inside the body.

   UV layout (the coat texture depends on it): u wraps each ring with u=0 at
   the spine; v runs rump 0.02 -> nose 0.78; legs use 0.80-0.955 with hooves
   at 0.955-0.97; ears sit at 0.985. */

function bodyLoft(g, stations, segs) {
  const right = new Vec3(1, 0, 0);
  const tan = new Vec3(), up = new Vec3();
  const rows = [];
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const prev = stations[Math.max(0, i - 1)], next = stations[Math.min(stations.length - 1, i + 1)];
    tan.subVectors(next.p, prev.p);
    if (tan.lengthSq() < 1e-10) tan.set(0, 0, 1);
    tan.normalize();
    up.crossVectors(tan, right).normalize();
    const e = st.e || 2.2;
    const row = [];
    for (let sIdx = 0; sIdx <= segs; sIdx++) {
      const a = (sIdx / segs) * TAU;              // 0 = spine, PI = belly
      const sa = Math.sin(a), ca = Math.cos(a);
      const rx = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e) * st.w;
      const ry = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e) * st.d;
      const m = st.shape ? st.shape(a) : 1;
      const x = st.p.x + right.x * rx * m + up.x * ry * m;
      const y = st.p.y + right.y * rx * m + up.y * ry * m;
      const z = st.p.z + right.z * rx * m + up.z * ry * m;
      const idx = g.positions.length / 3;
      g.vert(x, y, z, right.x * sa + up.x * ca, right.y * sa + up.y * ca, right.z * sa + up.z * ca, sIdx / segs, st.uv);
      row.push(idx);
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let sIdx = 0; sIdx < segs; sIdx++) {
      g.quad(rows[i][sIdx], rows[i][sIdx + 1], rows[i + 1][sIdx + 1], rows[i + 1][sIdx]);
    }
  }
  // Cap both ends with fans to the station centres.
  const capFan = (row, st, flip) => {
    const ci = g.positions.length / 3;
    g.vert(st.p.x, st.p.y, st.p.z, 0, flip ? -0.5 : 0.5, flip ? -0.8 : 0.8, 0.5, st.uv);
    for (let sIdx = 0; sIdx < segs; sIdx++) {
      if (flip) g.tri(ci, row[sIdx + 1], row[sIdx]);
      else g.tri(ci, row[sIdx], row[sIdx + 1]);
    }
  };
  capFan(rows[0], stations[0], true);
  capFan(rows[rows.length - 1], stations[stations.length - 1], false);
}

/* Wrap-aware gaussian bump on a ring angle, for muscle shaping. */
function angBump(a, centre, width, amp) {
  let d = Math.abs(a - centre);
  if (d > PI) d = TAU - d;
  return amp * Math.exp(-(d * d) / (width * width));
}

function makeQuadGeometry(skeleton, sp, k, opts = {}) {
  const g = new Geometry();
  const W = sp.bodyW * k, D = sp.bodyD * k, BL = sp.bodyLen * k, NL = sp.neckLen * k, HL = sp.headLen * k;
  const P = (name) => { const v = new Vec3(); skeleton.bones[skeleton.index(name)].bindMatrix.getTranslation(v); return v; };

  const hips = P('hips'), chest = P('chest'), neck1 = P('neck1');
  const headP = P('head'), muzzle = P('muzzle'), tail1 = P('tail1'), tail2 = P('tail2');
  const spineY = hips.y;

  /* Anatomy as angular shaping functions, not just ellipses: each is a set
     of wrap-aware gaussian bumps over the ring angle (0 = spine). */
  const haunch = (a) => 1 + angBump(a, PI * 0.62, 0.55, 0.16) + angBump(a, TAU - PI * 0.62, 0.55, 0.16) + angBump(a, 0, 0.35, -0.05);
  const croup = (a) => 1 + angBump(a, PI * 0.55, 0.6, 0.1) + angBump(a, TAU - PI * 0.55, 0.6, 0.1);
  const waist = (a) => 1 + angBump(a, 0, 0.4, -0.06) + angBump(a, PI, 0.7, -0.03);
  const brisket = (a) => 1 + angBump(a, PI, 0.5, 0.14) + angBump(a, 0, 0.35, -0.04);
  const shoulderS = (a) => 1 + angBump(a, PI * 0.42, 0.42, 0.11) + angBump(a, TAU - PI * 0.42, 0.42, 0.11);
  const withers = (a) => 1 + angBump(a, 0, 0.3, 0.09);
  const throat = (a) => 1 + angBump(a, PI, 0.6, 0.07);
  const jaw = (a) => 1 + angBump(a, PI * 0.72, 0.5, 0.13) + angBump(a, TAU - PI * 0.72, 0.5, 0.13);
  const brow = (a) => 1 + angBump(a, PI * 0.3, 0.35, 0.07) + angBump(a, TAU - PI * 0.3, 0.35, 0.07);

  const np = (t) => new Vec3().copy(neck1).lerp(headP, t);
  const hp = (t) => new Vec3().copy(headP).lerp(muzzle, t);
  const st = (p, w, d, uv, shape, e) => ({ p, w, d, uv, shape, e });

  /* The whole centreline — rump to nose — as one dense loft. */
  bodyLoft(g, [
    st(new Vec3(0, spineY - D * 0.1, hips.z - BL * 0.36), W * 0.18, D * 0.22, 0.02, null, 2.0),
    st(new Vec3(0, spineY - D * 0.02, hips.z - BL * 0.26), W * 0.6, D * 0.68, 0.05, croup, 2.1),
    st(new Vec3(0, spineY + D * 0.02, hips.z - BL * 0.1), W * 0.9, D * 0.9, 0.09, haunch, 2.2),
    st(new Vec3(0, spineY + D * 0.01, hips.z + BL * 0.04), W * 0.97, D * 0.94, 0.13, haunch, 2.2),
    st(new Vec3(0, spineY - D * 0.02, hips.z + BL * 0.16), W * 0.9, D * 0.85, 0.18, waist, 2.2),
    st(new Vec3(0, spineY - D * 0.04, hips.z + BL * 0.28), W * 0.85, D * 0.82, 0.22, waist, 2.25),
    st(new Vec3(0, spineY - D * 0.05, chest.z - BL * 0.12), W * 0.92, D * 0.96, 0.27, brisket, 2.3),
    st(new Vec3(0, spineY - D * 0.04, chest.z), W * 0.95, D * 1.05, 0.31, brisket, 2.3),
    st(new Vec3(0, spineY + D * 0.02, chest.z + BL * 0.09), W * 0.85, D * 0.97, 0.36, shoulderS, 2.2),
    st(new Vec3(0, spineY + D * 0.1, chest.z + BL * 0.16), W * 0.68, D * 0.8, 0.4, withers, 2.1),
    st(new Vec3(0, spineY + D * 0.16, chest.z + BL * 0.21), W * 0.52, D * 0.62, 0.43, withers, 2.0),
    st(np(0.12), W * 0.48, D * 0.55, 0.48, throat, 2.0),
    st(np(0.32), W * 0.42, D * 0.48, 0.52, throat, 2.0),
    st(np(0.52), W * 0.38, D * 0.43, 0.56, null, 2.0),
    st(np(0.7), W * 0.35, D * 0.39, 0.6, null, 2.0),
    st(np(0.86), W * 0.32, D * 0.36, 0.63, null, 2.0),
    st(hp(-0.18), HL * 0.3, HL * 0.36, 0.655, jaw, 2.0),
    st(hp(0.04), HL * 0.34, HL * 0.4, 0.675, (a) => jaw(a) * brow(a), 2.0),
    st(hp(0.26), HL * 0.29, HL * 0.34, 0.695, brow, 2.0),
    st(hp(0.46), HL * 0.22, HL * 0.26, 0.715, null, 2.0),
    st(hp(0.66), HL * 0.16, HL * 0.19, 0.735, null, 1.95),
    st(hp(0.84), HL * 0.12, HL * 0.135, 0.755, null, 1.9),
    st(hp(0.98), HL * 0.09, HL * 0.1, 0.772, null, 1.85),
    st(hp(1.06), HL * 0.04, HL * 0.045, 0.778, null, 1.8),
  ], 36);

  /* Legs: 8 stations, joint bulges at knee and fetlock, root buried well
     inside the body with no cap to poke through. */
  const LW = sp.legW * k;
  const lu = (t) => 0.8 + t * 0.17;
  for (const sSide of ['L', 'R']) {
    for (const f of ['f', 'r']) {
      const up2 = P(f + 'Up' + sSide), lo = P(f + 'Lo' + sSide), ft = P(f + 'Ft' + sSide);
      const hoof = new Vec3(ft.x, 0.004, ft.z + 0.02 * k);
      const thighW = f === 'r' ? D * 0.3 : D * 0.23;
      loftRings(g, [
        { p: new Vec3(up2.x * 0.7, up2.y + D * 0.2, up2.z), w: thighW, d: thighW * 1.45, e: 2.1, uv: lu(0) },
        { p: up2.clone().lerp(lo, 0.3), w: LW * 2.0, d: LW * 2.6, e: 2.05, uv: lu(0.2) },
        { p: up2.clone().lerp(lo, 0.62), w: LW * 1.3, d: LW * 1.6, e: 2.0, uv: lu(0.38) },
        { p: lo, w: LW * 1.12, d: LW * 1.3, e: 2.0, uv: lu(0.52) },        // knee/hock
        { p: lo.clone().lerp(ft, 0.3), w: LW * 0.88, d: LW * 0.98, e: 2.0, uv: lu(0.66) },
        { p: lo.clone().lerp(ft, 0.68), w: LW * 0.8, d: LW * 0.88, e: 2.0, uv: lu(0.8) },
        { p: ft, w: LW * 1.0, d: LW * 1.1, e: 2.0, uv: lu(0.9) },          // fetlock
        { p: hoof, w: LW * 1.12, d: LW * 1.22, e: 1.6, uv: lu(1) },
      ], 22, false, true);
    }
  }

  /* Ears: rooted INSIDE the skull (start ring buried, no cap) so they grow
     out of the head instead of hovering on it. */
  const earL = P('earL'), earR = P('earR');
  const earLen = HL * 0.55 * sp.earScale;
  for (const [e2, sgn] of [[earL, 1], [earR, -1]]) {
    const root = new Vec3(e2.x - sgn * HL * 0.14, e2.y - HL * 0.16, e2.z + HL * 0.05);
    const tip = new Vec3(e2.x + sgn * earLen * 0.38, e2.y + earLen * 0.95, e2.z - earLen * 0.16);
    loftRings(g, [
      { p: root, w: HL * 0.13, d: HL * 0.1, e: 2.0, uv: 0.98 },
      { p: e2, w: HL * 0.17, d: HL * 0.08, e: 1.8, uv: 0.98 },
      { p: new Vec3().copy(e2).lerp(tip, 0.55), w: HL * 0.2, d: HL * 0.06, e: 1.8, uv: 0.98 },
      { p: tip, w: HL * 0.045, d: HL * 0.028, e: 1.8, uv: 0.98 },
    ], 10, false, true);
  }

  /* Tail: rooted inside the rump. */
  loftRings(g, [
    { p: new Vec3(tail1.x, tail1.y - D * 0.1, tail1.z + D * 0.25), w: D * 0.2, d: D * 0.24, e: 2.0, uv: 0.82 },
    { p: tail1, w: D * 0.16, d: D * 0.18, e: 2.0, uv: 0.83 },
    { p: new Vec3().copy(tail1).lerp(tail2, 0.5), w: D * 0.13, d: D * 0.15, e: 2.0, uv: 0.845 },
    { p: new Vec3(tail2.x, tail2.y - 0.01, tail2.z - 0.015), w: D * 0.05, d: D * 0.06, e: 2.0, uv: 0.86 },
  ], 10, false, true);

  smoothNormals(g);
  const geo = g.finalize();

  /* Auto-skin: score every bone segment by inverse-quartic distance and
     keep the strongest four — the same scheme the human uses. */
  const SEGS = [
    ['hips', 'spine'], ['spine', 'chest'], ['chest', 'neck1'], ['neck1', 'neck2'],
    ['neck2', 'head'], ['head', 'muzzle'], ['hips', 'tail1'], ['tail1', 'tail2'],
    ['head', 'earL'], ['head', 'earR'],
  ];
  for (const s of ['L', 'R']) for (const f of ['f', 'r']) {
    SEGS.push([f + 'Up' + s, f + 'Lo' + s], [f + 'Lo' + s, f + 'Ft' + s]);
  }
  const segments = [];
  const pa = new Vec3(), pb = new Vec3();
  for (const [a, b] of SEGS) {
    const ai = skeleton.index(a), bi = skeleton.index(b);
    if (ai < 0 || bi < 0) continue;
    skeleton.bones[ai].bindMatrix.getTranslation(pa);
    skeleton.bones[bi].bindMatrix.getTranslation(pb);
    segments.push({ a: pa.clone(), b: pb.clone(), boneA: ai, boneB: bi });
  }
  const n = geo.positions.length / 3;
  const joints = new Float32Array(n * 4);
  const weights = new Float32Array(n * 4);
  const p = new Vec3(), closest = new Vec3();
  for (let i = 0; i < n; i++) {
    p.set(geo.positions[i * 3], geo.positions[i * 3 + 1], geo.positions[i * 3 + 2]);
    const merged = new Map();
    for (const seg of segments) {
      closestPointOnSegment(p, seg.a, seg.b, closest);
      const d2 = Math.max(closest.distanceToSq(p), 1e-5);
      const t = clamp(seg.a.distanceTo(closest) / Math.max(seg.a.distanceTo(seg.b), 1e-5), 0, 1);
      const w = 1 / (d2 * d2);
      merged.set(seg.boneA, (merged.get(seg.boneA) || 0) + w * (1 - t));
      merged.set(seg.boneB, (merged.get(seg.boneB) || 0) + w * t);
    }
    const top = Array.from(merged.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0; for (const [, w] of top) sum += w;
    if (sum < 1e-9) { joints[i * 4] = 0; weights[i * 4] = 1; continue; }
    for (let q = 0; q < 4; q++) {
      joints[i * 4 + q] = top[q] ? top[q][0] : 0;
      weights[i * 4 + q] = top[q] ? top[q][1] / sum : 0;
    }
  }
  geo.joints = joints;
  geo.weights = weights;
  return geo;
}

/* ---------------- antlers (bone-parented attachment) ---------------- */

function antlerMesh(engine, points, side) {
  return engine._mesh(`antler:${points}:${side}`, () => {
    const g = new Geometry();
    const sx = side;
    // A real whitetail main beam rises off the skull, sweeps OUT, then curves
    // FORWARD and back in toward the nose — a C shape seen from above. Tines
    // (G2, G3...) rise nearly vertically off the top of that beam, and the
    // short brow tine (G1) sits just above the base.
    // The pedicle starts BELOW the skull surface so the rack grows out of
    // the head instead of resting on it, with the knobby burr at the skin.
    const beam = [
      new Vec3(-0.01 * sx, -0.06, 0.0),
      new Vec3(0, 0, 0),
      new Vec3(0.07 * sx, 0.10, 0.01),
      new Vec3(0.15 * sx, 0.19, 0.09),
      new Vec3(0.18 * sx, 0.24, 0.21),
      new Vec3(0.13 * sx, 0.27, 0.33),
    ];
    for (let i = 0; i < beam.length - 1; i++) {
      const taper = 1 - Math.max(0, i - 1) * 0.16;
      appendLimb(g, beam[i], beam[i + 1], 0.017 * taper, 0.014 * taper, 7);
    }
    // Burr: the swollen ring where antler meets skin.
    appendLimb(g, new Vec3(0, -0.012, 0), new Vec3(0.005 * sx, 0.012, 0), 0.024, 0.02, 7);
    // Brow tine.
    appendLimb(g, new Vec3(0.03 * sx, 0.06, 0.03), new Vec3(0.015 * sx, 0.16, 0.09), 0.009, 0.003, 5);
    // Standing tines along the beam, tallest in the middle of the rack.
    const tines = Math.max(1, points - 1);
    for (let t = 0; t < tines; t++) {
      const f = 0.3 + (t / Math.max(1, tines - 1)) * 0.5;
      const i0 = Math.min(beam.length - 2, Math.floor(f * (beam.length - 1)));
      const base = new Vec3().copy(beam[i0]).lerp(beam[i0 + 1], f * (beam.length - 1) - i0);
      const h = 0.2 * Math.sin(PI * (0.25 + 0.6 * (t / Math.max(1, tines - 1))));
      const tip = new Vec3(base.x - 0.03 * sx, base.y + h + 0.06, base.z + 0.015);
      appendLimb(g, base, tip, 0.008, 0.0028, 5);
    }
    return g.finalize();
  });
}

/* ---------------- the animal ---------------- */

let _animalId = 0;

class Animal {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.id = _animalId++;
    const S = ANIMAL_SPECIES[opts.species] ? opts.species : 'deer';
    this.species = S;
    this.spec = ANIMAL_SPECIES[S];
    this.sex = opts.sex || (Math.random() < 0.5 ? 'male' : 'female');
    this.sizeName = ANIMAL_SIZES[opts.size] ? opts.size : 'medium';
    this.isBaby = this.sex === 'fawn';
    this.k = (opts.scaleMul || 1) * ANIMAL_SIZES[this.sizeName] * (this.isBaby ? 0.45 : 1);
    this.mother = opts.mother || null;
    this.mule = !!opts.mule;
    this.rng = new Rng(opts.seed || (7000 + this.id * 131));

    const at = Vec3.from(opts.at || [0, 0, 0]);
    this.x = at.x; this.z = at.z;
    this.groundY = typeof opts.groundY === 'function' ? opts.groundY : null;
    this.baseY = typeof opts.groundY === 'number' ? opts.groundY : at.y;
    this.yaw = this.rng.range(0, TAU);
    this.speed = 0;
    this.state = 'graze';
    this.stateT = this.rng.range(0, 2);
    this.phase = this.rng.range(0, 1);
    this.headDown = this.spec.grazes ? 1 : 0;
    this.blinkT = this.rng.range(1, 4); this.blink = 0;
    this.earT = this.rng.range(1, 5); this.earFlick = 0;
    this.tailT = this.rng.range(2, 6); this.tailFlick = 0;
    this.herd = opts.herd || null;
    this.dead = false;

    this._build();
  }

  _groundAt(x, z) { return this.groundY ? this.groundY(x, z) : this.baseY; }

  _build() {
    const e = this.engine, sp = this.spec, k = this.k;
    // One skeleton per animal (it holds this animal's pose), but the sculpted
    // skinned mesh is cached per species+size, so a herd shares geometry.
    this.skeleton = makeQuadSkeleton(sp, k);
    const meshKey = `quad:${this.species}:${k.toFixed(2)}`;
    this.mesh = e._mesh(meshKey, () => makeQuadGeometry(this.skeleton, sp, k));

    const coat = this.isBaby ? sp.coat.fawn : (sp.coat[this.sex] || sp.coat.female);
    const tex = (sp.texture && sp.texture[this.isBaby ? 'fawn' : this.sex]) || 'fur';
    this.actor = new Actor(e, {
      name: `animal${this.id}`,
      mesh: this.mesh,
      material: e.material({ texture: tex, color: this.mule ? 0x7d7261 : coat, roughness: 0.95, uvScale: 1, doubleSided: true, textureSize: 512 }),
      skeleton: this.skeleton,
      animator: { update: (dt) => this._drive(dt), add() {}, play() {} },
      at: [this.x, this.baseY, this.z],
      boundRadius: 2.2 * k,
    });
    // Shell fur: extra inflated, strand-clipped passes give the coat real
    // depth — hair tips physically break the silhouette. The comb vector
    // lays the coat backward and down the way real hair lies. Low-power
    // devices get fewer layers.
    const qn = e.renderer.qualityName;
    this.actor.furShells = qn === 'low' ? Math.max(4, Math.round((sp.shells || 8) * 0.5)) : (sp.shells || 8);
    // Longer than real fur, deliberately — biologically accurate 3-4cm
    // guard hair is invisible as "sticking up" volume at normal camera
    // distance, it only reads in extreme macro. Games exaggerate shell
    // length for exactly this reason.
    this.actor.furLength = (sp.furLen || 0.02) * k * 1.8;
    // A weak comb: mostly outward-along-the-normal (hair actually stands
    // up off the silhouette) with only a slight backward lean, not the
    // near-50/50 mix that was combing it flat against the body everywhere.
    this.actor.furComb = [0, -0.1, -0.22];
    e.actors.push(this.actor);
    this.parts = [this.actor];

    // Eyes and antlers ride the head bone. A real eye is two distinct
    // parts, not one flat ball: a glossy iris (deer/rabbit eyes read as a
    // rich near-black brown, not pure black) and a smaller true-black
    // pupil riding just proud of it so it doesn't z-fight. Both are
    // deliberately very low roughness — the wet-shine catchlight that
    // sells "alive" comes from real specular reflection off that low
    // roughness under the actual scene lighting, not a painted highlight.
    const headIdx = this.skeleton.index('head');
    const HL = sp.headLen * k;
    const irisM = e.material({ color: 0x2b1608, roughness: 0.05, metalness: 0 });
    const pupilM = e.material({ color: 0x040302, roughness: 0.08, metalness: 0 });
    const sphereMesh = e._mesh('sphere', () => Shapes.sphere(0.5, 20, 28));
    this.eyes = [];
    this.pupils = [];
    for (const s of [1, -1]) {
      const eye = new Actor(e, {
        mesh: sphereMesh, material: irisM,
        parent: this.actor, parentBone: headIdx,
        offset: [s * HL * 0.3, HL * 0.14, HL * 0.3],
      });
      eye.scale.setScalar(HL * 0.13);
      e.actors.push(eye); this.parts.push(eye); this.eyes.push(eye);

      const pupil = new Actor(e, {
        mesh: sphereMesh, material: pupilM,
        parent: this.actor, parentBone: headIdx,
        offset: [s * HL * 0.32, HL * 0.14, HL * 0.39],
      });
      pupil.scale.setScalar(HL * 0.072);
      e.actors.push(pupil); this.parts.push(pupil); this.pupils.push(pupil);
    }
    this.antlers = [];
    if (this.species === 'deer' && this.sex === 'male' && !this.isBaby) {
      const boneM = e.material({ color: 0xcfc4a8, roughness: 0.7 });
      for (const s of [1, -1]) {
        const a = new Actor(e, {
          mesh: antlerMesh(e, ANTLER_POINTS[this.sizeName], s), material: boneM,
          parent: this.actor, parentBone: headIdx,
          offset: [s * HL * 0.2, HL * 0.34, -HL * 0.12],
        });
        a.scale.setScalar(k);
        e.actors.push(a); this.parts.push(a); this.antlers.push(a);
      }
    }
  }

  /* ---------------- the brain (unchanged from v1) ---------------- */

  _threatInfo() {
    const e = this.engine;
    const t = e.animalThreat || (e.camera && e.camera.position);
    if (!t) return null;
    const dx = this.x - t.x, dz = this.z - t.z;
    return { dx, dz, d: Math.sqrt(dx * dx + dz * dz) };
  }

  spook(from) {
    if (from) { const p = Vec3.from(from); this.yaw = Math.atan2(this.x - p.x, this.z - p.z); }
    this.state = 'flee';
    this.stateT = this.rng.range(2.2, 3.6);
  }

  update(dt) {
    if (this.dead) return;
    const sp = this.spec, k = this.k;
    this.stateT -= dt;
    const th = this._threatInfo();

    if (this.mother && !this.mother.dead) {
      const m = this.mother;
      if (m.state === 'flee' && this.state !== 'flee') { this.state = 'flee'; this.stateT = 2.5; }
      if (this.state !== 'flee') {
        const dx = m.x - this.x, dz = m.z - this.z;
        if (dx * dx + dz * dz > 2.2) { this.state = 'follow'; this.yaw = Math.atan2(dx, dz); }
        else if (this.state === 'follow') { this.state = 'graze'; this.stateT = this.rng.range(1, 3); }
      }
    }

    switch (this.state) {
      case 'graze':
        this.speed = lerp(this.speed, 0, dt * 6);
        this.headDown = lerp(this.headDown, 1, dt * 2.5);
        if (th && th.d < sp.alertR) { this.state = 'alert'; this.stateT = this.rng.range(0.5, 1.2); }
        else if (this.stateT <= 0) { this.state = 'wander'; this.stateT = this.rng.range(1.5, 3.5); this.yaw += this.rng.range(-1.2, 1.2); }
        break;
      case 'wander': {
        this.speed = lerp(this.speed, sp.walkSpeed * k, dt * 3);
        this.headDown = lerp(this.headDown, 0.25, dt * 2);
        if (this.herd) {
          const hx = this.herd.cx - this.x, hz = this.herd.cz - this.z;
          if (hx * hx + hz * hz > 36) this.yaw = lerp(this.yaw, Math.atan2(hx, hz), dt * 0.8);
        }
        if (th && th.d < sp.alertR) { this.state = 'alert'; this.stateT = this.rng.range(0.4, 1); }
        else if (this.stateT <= 0) { this.state = 'graze'; this.stateT = this.rng.range(2, 5); }
        break;
      }
      case 'alert':
        this.speed = lerp(this.speed, 0, dt * 10);
        this.headDown = lerp(this.headDown, 0, dt * 8);
        if (th && th.d < sp.alertR * 0.55) this.spook({ x: this.x - th.dx, y: 0, z: this.z - th.dz });
        else if (this.stateT <= 0) {
          if (th && th.d < sp.alertR) { this.stateT = this.rng.range(1, 2.5); }
          else { this.state = 'graze'; this.stateT = this.rng.range(1, 2.5); }
        }
        break;
      case 'follow':
        this.speed = lerp(this.speed, sp.walkSpeed * 1.7 * k, dt * 4);
        this.headDown = lerp(this.headDown, 0.1, dt * 3);
        break;
      case 'flee': {
        this.speed = lerp(this.speed, sp.runSpeed * k, dt * 4);
        this.headDown = lerp(this.headDown, 0, dt * 10);
        if (th) {
          const away = Math.atan2(th.dx, th.dz);
          this.yaw = lerp(this.yaw, away + Math.sin(this.engine.time * 2.1 + this.id) * 0.35, dt * 3);
        }
        if (this.stateT <= 0 && (!th || th.d > sp.safeR)) { this.state = 'alert'; this.stateT = this.rng.range(0.8, 1.6); }
        break;
      }
    }

    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;

    const stride = (sp.gait === 'hop' ? 0.7 : 1.4) * k;
    if (this.speed > 0.03) this.phase = (this.phase + (this.speed / stride) * dt) % 1;

    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.12; this.blinkT = this.rng.range(1.5, 5); }
    this.blink = Math.max(0, this.blink - dt);
    this.earT -= dt;
    if (this.earT <= 0) { this.earFlick = 0.3; this.earT = this.rng.range(2, 6); }
    this.earFlick = Math.max(0, this.earFlick - dt);
    this.tailT -= dt;
    if (this.tailT <= 0) { this.tailFlick = 0.5; this.tailT = this.rng.range(2, 7); }
    this.tailFlick = Math.max(0, this.tailFlick - dt);
  }

  /* ---------------- bone driver (runs as the actor's animator) ---------------- */

  _drive() {
    const sp = this.spec, k = this.k, sk = this.skeleton;
    const running = this.speed > sp.walkSpeed * k * 2.2;
    const ph = this.phase * TAU;

    const hop = sp.gait === 'hop'
      ? (this.speed > 0.1 ? Math.abs(Math.sin(ph)) * 0.14 * k * (1 + this.speed * 0.5) : 0)
      : (running ? Math.abs(Math.sin(ph)) * 0.28 * k : 0);
    this.actor.setPosition([this.x, this._groundAt(this.x, this.z) + hop, this.z]);
    this.actor.setRotation(new Quat().setEuler(0, this.yaw, 0));

    const bone = (name) => sk.bones[sk.index(name)];

    // Torso: a touch of pitch with the bound.
    bone('spine').localRotation.setEuler(running ? Math.sin(ph) * 0.08 : 0, 0, 0);
    bone('chest').localRotation.setEuler(running ? Math.sin(ph) * 0.06 : 0, 0, 0);

    // Neck chain: bind pose is the natural half-raised carry; positive pitch
    // lowers the nose into the grass, negative lifts to full alarm.
    const down = this.headDown;
    const nod = this.speed > 0.05 && !running ? Math.sin(ph * 2) * 0.05 : 0;
    bone('neck1').localRotation.setEuler(lerp(-0.12, 0.95, down) + nod, 0, 0);
    bone('neck2').localRotation.setEuler(lerp(-0.15, 0.55, down), 0, 0);
    bone('head').localRotation.setEuler(lerp(0.1, -0.5, down), 0, 0);

    // Legs: walk is a lateral sequence, running is bounding pairs. The lower
    // leg folds as the upper swings back, which is what makes a stride read
    // as a stride instead of a pendulum.
    const phases = sp.gait === 'hop'
      ? [0.05, 0, 0.5, 0.55]
      : (running ? [0, 0.12, 0.55, 0.65] : [0, 0.5, 0.75, 0.25]);
    const amp = this.speed < 0.05 ? 0 : (running ? 0.8 : 0.45);
    const legNames = [['fUpL', 'fLoL'], ['fUpR', 'fLoR'], ['rUpL', 'rLoL'], ['rUpR', 'rLoR']];
    for (let i = 0; i < 4; i++) {
      const swing = Math.sin((this.phase + phases[i]) * TAU) * amp;
      const fold = Math.max(0, Math.sin((this.phase + phases[i]) * TAU + 1.9)) * amp * (running ? 1.2 : 0.8);
      bone(legNames[i][0]).localRotation.setEuler(swing, 0, 0);
      bone(legNames[i][1]).localRotation.setEuler(i < 2 ? fold * 0.7 : -fold * 0.7, 0, 0);
    }

    // Ears and tail.
    const flick = this.earFlick > 0 ? Math.sin(this.earFlick * 24) * 0.6 : 0;
    bone('earL').localRotation.setEuler(0, 0, 0.25 + flick);
    bone('earR').localRotation.setEuler(0, 0, -0.25 - flick * 0.4);
    const flag = this.state === 'flee' ? 1 : (this.tailFlick > 0 ? Math.abs(Math.sin(this.tailFlick * 14)) * 0.5 : 0);
    bone('tail1').localRotation.setEuler(-flag * 1.9, this.tailFlick > 0 ? Math.sin(this.tailFlick * 18) * 0.3 : 0, 0);

    sk.update();

    // Blink: the lids are a vertical squash of the eye and pupil together.
    const lid = this.blink > 0 ? 0.15 : 1;
    const HL = sp.headLen * k;
    for (const eye of this.eyes) eye.scale.set(HL * 0.16, HL * 0.16 * lid, HL * 0.16);
    for (const pupil of this.pupils) pupil.scale.set(HL * 0.09, HL * 0.09 * lid, HL * 0.09);
  }

  destroy() {
    this.dead = true;
    for (const p of this.parts) p.destroy();
  }
}

/* ---------------- engine surface ---------------- */

Engine.prototype.animal = function (opts = {}) {
  if (!this.animals) {
    this.animals = [];
    this.onUpdate((dt) => {
      let cx = 0, cz = 0, n = 0;
      for (const a of this.animals) if (!a.dead && a.herd) { cx += a.x; cz += a.z; n++; }
      for (const a of this.animals) {
        if (a.dead) continue;
        if (a.herd && n) { a.herd.cx = cx / n; a.herd.cz = cz / n; }
        a.update(dt);
      }
    });
  }
  const a = new Animal(this, opts);
  this.animals.push(a);
  return a;
};

Engine.prototype.herdOf = function (opts = {}) {
  const n = opts.count || 6;
  const at = Vec3.from(opts.at || [0, 0, 0]);
  const spread = opts.spread || 4;
  const herd = { cx: at.x, cz: at.z };
  const rng = new Rng(opts.seed || 99);
  const out = [];
  const sizes = ['small', 'medium', 'large'];
  for (let i = 0; i < n; i++) {
    const sex = i === 0 ? 'male' : (rng.next() < 0.55 ? 'female' : 'male');
    const a = this.animal(Object.assign({}, opts, {
      sex, size: sizes[(rng.next() * 3) | 0], herd,
      at: [at.x + rng.range(-spread, spread), at.y, at.z + rng.range(-spread, spread)],
      seed: (opts.seed || 99) * 31 + i,
    }));
    out.push(a);
    if (sex === 'female' && rng.next() < 0.6) {
      out.push(this.animal(Object.assign({}, opts, {
        sex: 'fawn', size: 'small', herd, mother: a,
        at: [a.x + rng.range(-1, 1), at.y, a.z + rng.range(-1, 1)],
        seed: (opts.seed || 99) * 57 + i,
      })));
    }
  }
  return out;
};

Engine.prototype.testPlate = function (opts = {}) {
  const miles = clamp(opts.miles || 1, 0.02, 10);
  const side = Math.sqrt(miles) * 1609.34;
  const g = this.ground(Object.assign({ size: side }, opts));
  g.userData = { testPlate: true, miles, side };
  return g;
};
