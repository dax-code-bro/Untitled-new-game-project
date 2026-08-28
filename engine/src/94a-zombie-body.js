/* ============================================================
   ZOMBIE BODIES — four builds, and the clothes they died in.

   Not one body scaled four ways. Each build carries its own
   cross-section stack, so a heavy trunk is barrel-chested with a
   gut that overhangs, a light one is narrow through the shoulder
   and wider at the hip, and an armoured one is a slab with
   webbing on it. Scaling a single silhouette gives you one
   person at four sizes, which is exactly what reads as cloned.

   Clothing is built as garments — a coat with a collar, sleeves,
   trousers — lofted as shells a few millimetres off the body and
   then destroyed: hems torn into teeth, panels punched out, flaps
   left hanging. A garment that is a recognisable garment first
   and ruined second is what says "this used to be a person with
   a job", which strips of cloth hanging off a torso never do.

   Everything is authored in the skeleton's bind-pose space, hips
   at the origin, same as 94-human.js, and reuses that file's
   lofting toolkit rather than duplicating it.
   ============================================================ */

/* Torso cross-sections per build: [y, halfWidth, halfDepth, squareness,
   forwardOffset]. The fifth number is what lets a gut hang off the front
   instead of the body simply becoming a wider barrel — a ring centred on
   the spine can only ever describe a drum, and a drum reads as "big", not
   as "fat". */
const ZOMBIE_BUILDS = {
  male: {
    scale: 1.0, shoulder: 1.0,
    torso: [
      [-0.062, 0.092, 0.078, 2.3], [-0.045, 0.122, 0.090, 2.4],
      [-0.022, 0.144, 0.100, 2.4], [0.000, 0.148, 0.101, 2.4],
      [0.090, 0.133, 0.088, 2.4], [0.175, 0.122, 0.081, 2.5],
      [0.250, 0.133, 0.090, 2.5], [0.320, 0.146, 0.098, 2.6],
      [0.380, 0.156, 0.103, 2.6], [0.425, 0.163, 0.101, 2.6],
      [0.460, 0.172, 0.095, 2.7], [0.487, 0.159, 0.087, 2.6],
      [0.508, 0.113, 0.074, 2.4], [0.528, 0.068, 0.058, 2.2],
    ],
    arm: [0.062, 0.052, 0.047, 0.040, 0.031],
    leg: [0.090, 0.079, 0.066, 0.058, 0.045],
    shoulderCaps: 0.068,
    garment: 'shirt',
    coat: { hem: -0.26, collar: 0.53, flare: 1.10, colorIdx: 0 },
  },
  female: {
    // Narrower through the shoulder, tucked at the waist, wider at the hip:
    // the shoulder-to-hip ratio is the whole read, not overall size.
    scale: 0.945, shoulder: 0.88,
    torso: [
      [-0.062, 0.094, 0.076, 2.2], [-0.045, 0.126, 0.090, 2.3],
      [-0.022, 0.150, 0.101, 2.3], [0.000, 0.153, 0.102, 2.3],
      [0.090, 0.130, 0.085, 2.3], [0.175, 0.110, 0.074, 2.4],
      [0.250, 0.120, 0.086, 2.4], [0.320, 0.133, 0.096, 2.5],
      [0.380, 0.141, 0.101, 2.5], [0.425, 0.145, 0.100, 2.5],
      [0.460, 0.150, 0.090, 2.6], [0.487, 0.138, 0.082, 2.5],
      [0.508, 0.101, 0.070, 2.3], [0.528, 0.062, 0.055, 2.2],
    ],
    arm: [0.054, 0.045, 0.041, 0.035, 0.027],
    leg: [0.083, 0.073, 0.060, 0.053, 0.041],
    shoulderCaps: 0.058,
    bust: { x: 0.058, y: 0.408, z: 0.078, out: 0.048, drop: 0.052, r: 0.050 },
    garment: 'dress',
    coat: { hem: -0.30, collar: 0.51, flare: 1.06, colorIdx: 1 },
  },
  heavy: {
    // A gut that overhangs the belt and a chest that carries above it.
    scale: 1.02, shoulder: 1.06,
    torso: [
      [-0.062, 0.118, 0.104, 2.5], [-0.045, 0.152, 0.126, 2.6, 0.008],
      [-0.022, 0.178, 0.148, 2.6, 0.018], [0.000, 0.186, 0.160, 2.6, 0.026],
      [0.090, 0.190, 0.176, 2.5, 0.030], [0.175, 0.192, 0.184, 2.4, 0.038],
      [0.250, 0.188, 0.176, 2.5, 0.030], [0.320, 0.186, 0.158, 2.6, 0.014],
      [0.380, 0.188, 0.142, 2.6], [0.425, 0.192, 0.133, 2.6],
      [0.460, 0.200, 0.122, 2.7], [0.487, 0.184, 0.110, 2.6],
      [0.508, 0.136, 0.094, 2.4], [0.528, 0.082, 0.072, 2.2],
    ],
    arm: [0.078, 0.068, 0.060, 0.050, 0.037],
    leg: [0.108, 0.096, 0.082, 0.070, 0.052],
    shoulderCaps: 0.082,
    garment: 'overalls',
    coat: { hem: -0.20, collar: 0.53, flare: 1.14, colorIdx: 2 },
  },
  armored: {
    // Slab-sided: a plate carrier squares the trunk off and the
    // squareness value does most of that on its own.
    scale: 1.01, shoulder: 1.10,
    torso: [
      [-0.062, 0.100, 0.084, 2.4], [-0.045, 0.130, 0.096, 2.5],
      [-0.022, 0.152, 0.108, 2.5], [0.000, 0.158, 0.110, 2.5],
      [0.090, 0.150, 0.104, 2.6], [0.175, 0.148, 0.102, 2.8],
      [0.250, 0.158, 0.114, 3.0], [0.320, 0.170, 0.126, 3.2],
      [0.380, 0.178, 0.132, 3.2], [0.425, 0.184, 0.130, 3.1],
      [0.460, 0.196, 0.118, 2.9], [0.487, 0.178, 0.104, 2.7],
      [0.508, 0.126, 0.082, 2.4], [0.528, 0.074, 0.062, 2.2],
    ],
    arm: [0.070, 0.059, 0.053, 0.045, 0.034],
    leg: [0.096, 0.085, 0.072, 0.063, 0.049],
    shoulderCaps: 0.078,
    garment: 'tunic',
    coat: { hem: -0.10, collar: 0.55, flare: 1.02, colorIdx: 3 },
  },
};

/* ---------------- neck ----------------
   The old neck was a four-ring tube, and a tube meeting a jaw leaves a
   gap at the sides however well the centres line up — which is what made
   heads look posted on a stick. This one flares into the trapezius at the
   bottom, carries the two sternocleidomastoid cords up the front, and
   ends wide enough and high enough to sit inside the skull base. */
function buildZombieNeck(g, segments, build) {
  const k = build.scale;
  const rings = [
    { p: new Vec3(0, 0.492, 0.000), w: 0.108 * k, d: 0.096 * k, e: 2.6 },
    { p: new Vec3(0, 0.520, 0.003), w: 0.083 * k, d: 0.079 * k, e: 2.4 },
    { p: new Vec3(0, 0.548, 0.006), w: 0.069 * k, d: 0.068 * k, e: 2.2 },
    { p: new Vec3(0, 0.578, 0.008), w: 0.063 * k, d: 0.063 * k, e: 2.1 },
    { p: new Vec3(0, 0.608, 0.009), w: 0.062 * k, d: 0.063 * k, e: 2.1 },
    // Wide again at the top so it meets the underside of the skull rather
    // than disappearing into it.
    { p: new Vec3(0, 0.634, 0.008), w: 0.070 * k, d: 0.074 * k, e: 2.2 },
    { p: new Vec3(0, 0.652, 0.006), w: 0.078 * k, d: 0.082 * k, e: 2.3 },
  ];
  loftRings(g, rings, segments, false, false);

  // Sternocleidomastoids: the two cords from behind the ear to the collarbone.
  for (const side of [-1, 1]) {
    const cord = [
      { p: new Vec3(side * 0.030 * k, 0.640 * 1, 0.012 * k), w: 0.011 * k, d: 0.011 * k, e: 2.2 },
      { p: new Vec3(side * 0.034 * k, 0.590, 0.030 * k), w: 0.013 * k, d: 0.012 * k, e: 2.2 },
      { p: new Vec3(side * 0.030 * k, 0.540, 0.044 * k), w: 0.014 * k, d: 0.012 * k, e: 2.2 },
      { p: new Vec3(side * 0.022 * k, 0.500, 0.050 * k), w: 0.012 * k, d: 0.010 * k, e: 2.2 },
    ];
    loftRings(g, cord, 8, true, true);
  }
  // Larynx, on the builds that show one.
  if (build !== ZOMBIE_BUILDS.female) {
    const l = [
      { p: new Vec3(0, 0.560, 0.052 * k), w: 0.016 * k, d: 0.010 * k, e: 2.3 },
      { p: new Vec3(0, 0.578, 0.056 * k), w: 0.019 * k, d: 0.013 * k, e: 2.3 },
      { p: new Vec3(0, 0.596, 0.052 * k), w: 0.015 * k, d: 0.010 * k, e: 2.3 },
    ];
    loftRings(g, l, 8, true, true);
  }
}

/* A bust, as two forms merged into the chest. A centred ring cannot make
   one — it would push the back out as far as the front — so this is
   separate geometry, skinned by the same vertex-to-bone solve as
   everything else. */
function buildBust(g, build) {
  const B = build.bust;
  for (const side of [-1, 1]) {
    const rings = [];
    const N = 5;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // Out from the ribs, forward, and drooping as it goes.
      const proj = Math.sin(t * PI * 0.62);
      rings.push({
        p: new Vec3(side * B.x * (1 - t * 0.18), B.y - t * B.drop, B.z + proj * B.out),
        w: B.r * Math.sin((1 - t * 0.62) * PI * 0.5) + 0.004,
        d: B.r * Math.sin((1 - t * 0.62) * PI * 0.5) + 0.004,
        e: 2.2, uv: t,
      });
    }
    loftRings(g, rings, 12, true, true);
  }
}

/* A joint ball, centred on a bone head. */
function buildJoint(g, at, r) {
  loftRings(g, [
    { p: new Vec3(at.x, at.y - r * 0.86, at.z), w: r * 0.52, d: r * 0.52, e: 2.1 },
    { p: new Vec3(at.x, at.y - r * 0.40, at.z), w: r * 0.94, d: r * 0.94, e: 2.1 },
    { p: new Vec3(at.x, at.y + r * 0.06, at.z), w: r, d: r, e: 2.1 },
    { p: new Vec3(at.x, at.y + r * 0.52, at.z), w: r * 0.88, d: r * 0.88, e: 2.1 },
    { p: new Vec3(at.x, at.y + r * 0.90, at.z), w: r * 0.48, d: r * 0.48, e: 2.1 },
  ], 12, true, true);
}

/* Deltoid caps: the shoulder mass that makes a frame read as broad. */
function buildShoulderCaps(g, skeleton, build) {
  const a = new Vec3();
  for (const sideName of ['L', 'R']) {
    const side = sideName === 'L' ? 1 : -1;
    skeleton.bones[skeleton.index('upperArm' + sideName)].bindMatrix.getTranslation(a);
    const r = build.shoulderCaps;
    loftRings(g, [
      { p: new Vec3(a.x - side * 0.030, a.y + 0.055, a.z), w: r * 0.72, d: r * 0.80, e: 2.3 },
      { p: new Vec3(a.x + side * 0.010, a.y + 0.030, a.z), w: r, d: r * 0.94, e: 2.2 },
      { p: new Vec3(a.x + side * 0.040, a.y - 0.020, a.z), w: r * 0.86, d: r * 0.82, e: 2.1 },
    ], 12, true, true);
  }
}

/* ---------------- garments ----------------
   A tube that is torn rather than merely irregular: the hem is cut into
   teeth of differing depth, whole panels are punched out to leave holes
   the body shows through, and the surface is emitted double-sided so a
   hole reads as a hole from either side rather than vanishing. */
function loftGarment(g, rings, segments, rng, opts = {}) {
  const holes = opts.holes != null ? opts.holes : 0.06;
  const hemTeeth = opts.hemTeeth !== false;
  const base = g.positions.length / 3;
  const row = segments + 1;
  const tmp = new Vec3(), nrm = new Vec3();

  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const last = i === rings.length - 1;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * TAU;
      // Ragged hem: the final ring rides up and down around the body.
      const tooth = (last && hemTeeth)
        ? (Math.sin(s * 2.3 + rng.range(0, 0.4)) * 0.5 + 0.5) * 0.055 + rng.range(0, 0.02)
        : 0;
      const wob = 1 + rng.range(-0.012, 0.012);
      ringVertex(tmp, r.p, r.right || _zRight, r.fwd || _zFwd, r.w * wob, r.d * wob, a, r.e || 2);
      nrm.set(tmp.x - r.p.x, tmp.y - r.p.y, tmp.z - r.p.z).normalize();
      g.vert(tmp.x, tmp.y + tooth, tmp.z, nrm.x, nrm.y, nrm.z, (s / segments) * 2, i / (rings.length - 1) * 2);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < segments; s++) {
      // Punch a panel out entirely: this is the tear.
      if (rng.next() < holes) continue;
      const a = base + i * row + s;
      g.quad(a, a + 1, a + row + 1, a + row);
      g.quad(a, a + row, a + row + 1, a + 1);   // inside face, so holes read
    }
  }
}

const _zRight = new Vec3(1, 0, 0);
const _zFwd = new Vec3(0, 0, 1);

/* The wardrobe. Each build died in something different, and the garment is
   as much of the silhouette as the body under it: a dress with a skirt
   reads female from across a room in a way that a coat on a narrow frame
   never will. */
function torsoAt(T, y) {
  let best = T[0];
  for (const t of T) if (Math.abs(t[0] - y) < Math.abs(best[0] - y)) best = t;
  return best;
}

function garmentRing(T, y, lift, spread) {
  const b = torsoAt(T, y);
  return {
    p: new Vec3(0, y, (b[4] || 0) * 0.9),
    w: (b[1] + lift) * (spread || 1), d: (b[2] + lift) * (spread || 1),
    e: b[3], right: _zRight, fwd: _zFwd,
  };
}

function buildZombieGarment(g, build, rng, segments) {
  const T = build.torso;
  const c = build.coat;
  const lift = 0.012;
  const kind = build.garment || 'shirt';

  if (kind === 'dress') {
    /* Bodice down to the waist, then a skirt that flares to the knee. The
       flare is the whole point — it is a shape no trouser leg can make. */
    const bodice = [0.51, 0.487, 0.425, 0.380, 0.320, 0.250, 0.175]
      .map((y) => garmentRing(T, y, lift));
    loftGarment(g, bodice, segments, rng, { holes: 0.05, hemTeeth: false });
    const waist = garmentRing(T, 0.175, lift);
    const skirt = [
      { p: new Vec3(0, 0.175, 0), w: waist.w, d: waist.d, e: 2.4, right: _zRight, fwd: _zFwd },
      { p: new Vec3(0, 0.060, 0), w: waist.w * 1.22, d: waist.d * 1.30, e: 2.4, right: _zRight, fwd: _zFwd },
      { p: new Vec3(0, -0.090, 0), w: waist.w * 1.46, d: waist.d * 1.58, e: 2.3, right: _zRight, fwd: _zFwd },
      { p: new Vec3(0, -0.250, 0), w: waist.w * 1.60, d: waist.d * 1.74, e: 2.2, right: _zRight, fwd: _zFwd },
      { p: new Vec3(0, -0.380, 0), w: waist.w * 1.58, d: waist.d * 1.72, e: 2.2, right: _zRight, fwd: _zFwd },
    ];
    loftGarment(g, skirt, segments, rng, { holes: 0.09 });
    // A collar band, so the bodice has a top edge.
    const top = garmentRing(T, 0.51, lift);
    loftRings(g, [
      { p: new Vec3(0, 0.505, 0), w: top.w * 0.60, d: top.d * 0.68, e: 2.3, right: _zRight, fwd: _zFwd },
      { p: new Vec3(0, 0.540, -0.006), w: top.w * 0.62, d: top.d * 0.72, e: 2.3, right: _zRight, fwd: _zFwd },
    ], segments, false, false);
    return;
  }

  if (kind === 'overalls') {
    /* A shirt to the waist, then a bib and straps over it — the bib is
       what tells you it is workwear and not a coat. */
    const shirt = [0.53, 0.487, 0.425, 0.380, 0.320, 0.250, 0.175, 0.090, -0.02]
      .map((y) => garmentRing(T, y, lift));
    loftGarment(g, shirt, segments, rng, { holes: 0.06 });
    // Trouser body over the seat.
    const seat = [0.20, 0.09, 0.0, -0.10].map((y) => garmentRing(T, y, lift + 0.010, 1.02));
    loftGarment(g, seat, segments, rng, { holes: 0.04, hemTeeth: false });
    // Bib across the chest.
    const bibW = torsoAt(T, 0.36)[1] * 0.72;
    loftRings(g, [
      { p: new Vec3(0, 0.200, torsoAt(T, 0.20)[2] + lift + 0.008), w: bibW, d: 0.014, e: 3.0, right: _zRight, fwd: _zFwd },
      { p: new Vec3(0, 0.430, torsoAt(T, 0.43)[2] + lift + 0.008), w: bibW * 1.02, d: 0.014, e: 3.0, right: _zRight, fwd: _zFwd },
    ], 12, true, true);
    for (const side of [-1, 1]) {
      loftRings(g, [
        { p: new Vec3(side * bibW * 0.72, 0.430, torsoAt(T, 0.43)[2] + lift), w: 0.020, d: 0.010, e: 2.6 },
        { p: new Vec3(side * 0.082, 0.500, 0.020), w: 0.020, d: 0.010, e: 2.6 },
        { p: new Vec3(side * 0.084, 0.480, -0.070), w: 0.020, d: 0.010, e: 2.6 },
        { p: new Vec3(side * 0.070, 0.330, -0.110), w: 0.020, d: 0.010, e: 2.6 },
      ], 10, true, true);
    }
    return;
  }

  if (kind === 'tunic') {
    // Short field tunic, cut at the hip, over the webbing.
    const tunic = [c.collar, 0.487, 0.425, 0.380, 0.320, 0.250, 0.175, 0.090, c.hem]
      .map((y) => garmentRing(T, y, lift, y < 0.05 ? c.flare : 1));
    loftGarment(g, tunic, segments, rng, { holes: 0.05 });
    const top = garmentRing(T, c.collar, lift);
    loftRings(g, [
      { p: new Vec3(0, c.collar, 0), w: top.w * 0.62, d: top.d * 0.70, e: 2.3, right: _zRight, fwd: _zFwd },
      { p: new Vec3(0, c.collar + 0.050, -0.008), w: top.w * 0.66, d: top.d * 0.78, e: 2.3, right: _zRight, fwd: _zFwd },
    ], segments, false, false);
    return;
  }

  /* Default: a work shirt, untucked, over trousers. */
  const shirt = [c.collar, 0.487, 0.425, 0.380, 0.320, 0.250, 0.175, 0.090, -0.05]
    .map((y) => garmentRing(T, y, lift, y < 0.05 ? 1.06 : 1));
  loftGarment(g, shirt, segments, rng, { holes: 0.06 });
  const seat = [0.16, 0.06, -0.04, -0.14].map((y) => garmentRing(T, y, lift + 0.012, 1.03));
  loftGarment(g, seat, segments, rng, { holes: 0.04, hemTeeth: false });
  const top = garmentRing(T, c.collar, lift);
  loftRings(g, [
    { p: new Vec3(0, c.collar, 0), w: top.w * 0.62, d: top.d * 0.70, e: 2.3, right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, c.collar + 0.052, -0.008), w: top.w * 0.66, d: top.d * 0.78, e: 2.3, right: _zRight, fwd: _zFwd },
  ], segments, false, false);
}

/* Sleeves and trouser legs, lofted along the actual bones. */
function buildZombieLimbCloth(g, skeleton, build, rng, segments) {
  const lift = 0.010;
  const a = new Vec3(), b = new Vec3(), c = new Vec3();
  for (const side of ['L', 'R']) {
    // Sleeve: shoulder to somewhere down the forearm, torn off at the end.
    skeleton.bones[skeleton.index('upperArm' + side)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerArm' + side)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('hand' + side)].bindMatrix.getTranslation(c);
    const cut = rng.range(0.35, 1.0);        // where the sleeve gives out
    const wrist = new Vec3().copy(b).lerp(c, cut);
    const upper = limbRings(a, b, [
      [build.arm[0] + lift + 0.014, build.arm[0] + lift + 0.012, 2.1],
      [build.arm[1] + lift + 0.008, build.arm[1] + lift + 0.008, 2.1],
    ]);
    const lower = limbRings(b, wrist, [
      [build.arm[2] + lift + 0.006, build.arm[2] + lift + 0.006, 2.1],
      [build.arm[3] + lift, build.arm[3] + lift, 2.1],
    ]);
    loftGarment(g, upper.concat(lower.slice(1)), segments, rng, { holes: 0.05 });

    // Trouser leg, torn off below the knee on some.
    skeleton.bones[skeleton.index('upperLeg' + side)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerLeg' + side)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('foot' + side)].bindMatrix.getTranslation(c);
    const legCut = rng.range(0.3, 1.0);
    const ankle = new Vec3().copy(b).lerp(c, legCut);
    const thigh = limbRings(a, b, [
      [build.leg[0] + lift + 0.010, build.leg[0] + lift + 0.010, 2.2],
      [build.leg[2] + lift + 0.006, build.leg[2] + lift + 0.006, 2.2],
    ]);
    const shin = limbRings(b, ankle, [
      [build.leg[3] + lift + 0.004, build.leg[3] + lift + 0.004, 2.2],
      [build.leg[4] + lift, build.leg[4] + lift, 2.2],
    ]);
    loftGarment(g, thigh.concat(shin.slice(1)), segments, rng, { holes: 0.05 });
  }
}

/* Webbing and plates, for the one that died in kit. */
function buildWebbing(g, build) {
  const k = build.scale;
  // Chest plate.
  const plate = [
    { p: new Vec3(0, 0.250, 0.104 * k), w: 0.150 * k, d: 0.020 * k, e: 3.0, right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, 0.360, 0.126 * k), w: 0.166 * k, d: 0.022 * k, e: 3.0, right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, 0.440, 0.126 * k), w: 0.170 * k, d: 0.022 * k, e: 3.0, right: _zRight, fwd: _zFwd },
  ];
  loftRings(g, plate, 14, true, true);
  // Shoulder straps.
  for (const side of [-1, 1]) {
    loftRings(g, [
      { p: new Vec3(side * 0.070 * k, 0.440, 0.120 * k), w: 0.026 * k, d: 0.012 * k, e: 2.6 },
      { p: new Vec3(side * 0.082 * k, 0.500, 0.060 * k), w: 0.026 * k, d: 0.012 * k, e: 2.6 },
      { p: new Vec3(side * 0.086 * k, 0.500, -0.060 * k), w: 0.026 * k, d: 0.012 * k, e: 2.6 },
      { p: new Vec3(side * 0.074 * k, 0.420, -0.110 * k), w: 0.026 * k, d: 0.012 * k, e: 2.6 },
    ], 10, true, true);
  }
  // Belt and a pouch.
  loftRings(g, [
    { p: new Vec3(0, 0.150, 0), w: 0.156 * k, d: 0.112 * k, e: 2.7, right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, 0.192, 0), w: 0.158 * k, d: 0.114 * k, e: 2.7, right: _zRight, fwd: _zFwd },
  ], 16, false, false);
  loftRings(g, [
    { p: new Vec3(-0.070 * k, 0.120, 0.106 * k), w: 0.046 * k, d: 0.030 * k, e: 2.8, right: _zRight, fwd: _zFwd },
    { p: new Vec3(-0.070 * k, 0.180, 0.108 * k), w: 0.048 * k, d: 0.032 * k, e: 2.8, right: _zRight, fwd: _zFwd },
  ], 12, true, true);
}

/* Blood, as geometry rather than tint. Patches conform to the trunk a
   millimetre off the cloth, so they darken the garment where something
   ran down it — which is what a stain is. Kept in its own geometry so it
   can carry its own wet, dark material; painted into the cloth mesh it
   would just be a differently-coloured coat. */
function buildBloodStains(g, build, rng) {
  const T = build.torso;
  const N = 5 + Math.floor(rng.range(0, 4));
  for (let i = 0; i < N; i++) {
    // Stains start high and run down: chest, throat, belly.
    const y0 = rng.range(0.06, 0.50);
    const len = rng.range(0.06, 0.26);
    const ang = rng.range(-1.2, 1.2);           // mostly on the front
    const wide = rng.range(0.035, 0.085);
    const rows = 4, cols = 5;
    const base = g.positions.length / 3;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const y = y0 - len * t;
      const sec = torsoAt(T, y);
      // Narrows as it runs, the way a drip does.
      const halfA = (wide / Math.max(sec[1], 0.05)) * (1 - t * 0.45);
      for (let cI = 0; cI <= cols; cI++) {
        const u = cI / cols;
        const a = ang + (u - 0.5) * 2 * halfA + Math.sin(t * 5 + i) * 0.05;
        const rw = sec[1] + 0.014, rd = sec[2] + 0.014;
        const px = Math.sin(a) * rw, pz = Math.cos(a) * rd + (sec[4] || 0) * 0.9;
        const nl = Math.hypot(px, pz) || 1;
        g.vert(px, y, pz, px / nl, 0.12, pz / nl, u, t);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let cI = 0; cI < cols; cI++) {
        const q = base + r * (cols + 1) + cI;
        g.quad(q, q + 1, q + cols + 2, q + cols + 1);
      }
    }
  }
}

/* Where a thrower can tear itself open, in bind-pose space. Five down the
   left flank working downward, then the face. Returned as data rather than
   geometry so the game can hang two actors on each — a wet cavity and the
   bone in it, which one mesh could only ever be one of. */
function zombieWoundSpots(buildName) {
  const build = ZOMBIE_BUILDS[buildName] || ZOMBIE_BUILDS.male;
  const T = build.torso;
  const spots = [];
  /* Staggered down the flank rather than stacked: five holes in a straight
     vertical line read as a row of buttons, not as somewhere a hand went in
     five times. The angles walk fore and aft around the ribs, and the
     heights are uneven. */
  const heights = [0.445, 0.352, 0.283, 0.196, 0.108];
  const angles  = [1.21,  1.55,  1.12,  1.63,  1.34];
  for (let i = 0; i < heights.length; i++) {
    const y = heights[i];
    const sec = torsoAt(T, y);
    const a = angles[i];                         // round onto the left flank
    spots.push({
      bone: y > 0.30 ? 'chest' : 'spine',
      pos: [Math.sin(a) * (sec[1] - 0.006), y, Math.cos(a) * (sec[2] - 0.006) + (sec[4] || 0) * 0.9],
      r: 0.027 + i * 0.0032,
      bone_r: 0.011 + i * 0.001,
    });
  }
  // The last one: the face. Taken in bone space directly.
  spots.push({ bone: 'head', pos: [0.030, 0.150, 0.070], r: 0.030, bone_r: 0.016, face: true });
  return spots;
}

/* The whole figure: flesh, then clothes over it. *//* The clothes, as their own mesh over the same skeleton.

   This is the difference between a dressed figure and a painted one. Flesh
   and cloth in a single geometry share a single material, so the coat can
   only ever be the colour the skin is — which is exactly what "you are just
   colouring the body" looks like. Two meshes, two materials, one skeleton,
   and the skin solver weights both the same way so they move together. */
function buildZombieClothGeometry(skeleton, opts = {}) {
  const g = new Geometry();
  const segments = opts.segments || 16;
  const build = ZOMBIE_BUILDS[opts.build] || ZOMBIE_BUILDS.male;
  const rng = new Rng((opts.seed || 7) * 3 + 11);

  buildZombieGarment(g, build, rng, segments);
  buildZombieLimbCloth(g, skeleton, build, rng, segments);
  buildGarmentDetail(g, skeleton, build, rng);
  if (opts.build === 'armored') buildWebbing(g, build);

  g.finalize();
  g.computeWeldGroups();
  smoothNormals(g);
  weldNormals(g.normals, g.weldGroups);
  return g;
}

/* The bits that make cloth read as tailored rather than as a tube: a belt
   with a buckle, a button placket down the front, turned cuffs at wrist and
   ankle, and lapels where a collar opens. Small pieces, but they are what
   the eye uses to decide it is looking at a garment. */
function buildGarmentDetail(g, skeleton, build, rng) {
  const T = build.torso;
  const kind = build.garment || 'shirt';
  const lift = 0.014;

  // Belt at the waist, with a buckle.
  const beltY = kind === 'dress' ? 0.175 : 0.150;
  const bs = torsoAt(T, beltY);
  loftRings(g, [
    { p: new Vec3(0, beltY - 0.020, (bs[4] || 0) * 0.9), w: bs[1] + lift + 0.004, d: bs[2] + lift + 0.004, e: bs[3], right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, beltY + 0.020, (bs[4] || 0) * 0.9), w: bs[1] + lift + 0.004, d: bs[2] + lift + 0.004, e: bs[3], right: _zRight, fwd: _zFwd },
  ], 18, false, false);
  loftRings(g, [
    { p: new Vec3(0, beltY, bs[2] + lift + 0.008 + (bs[4] || 0) * 0.9), w: 0.030, d: 0.010, e: 3.0, right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, beltY, bs[2] + lift + 0.016 + (bs[4] || 0) * 0.9), w: 0.030, d: 0.010, e: 3.0, right: _zRight, fwd: _zFwd },
  ], 8, true, true);

  // Button placket, down the centre of the front.
  if (kind !== 'tunic') {
    const yTop = kind === 'dress' ? 0.48 : build.coat.collar - 0.06;
    for (let i = 0; i < 6; i++) {
      const y = yTop - i * ((yTop - beltY - 0.02) / 5);
      const sec = torsoAt(T, y);
      const z = sec[2] + lift + 0.006 + (sec[4] || 0) * 0.9;
      loftRings(g, [
        { p: new Vec3(0, y, z), w: 0.009, d: 0.004, e: 2.4, right: _zRight, fwd: _zFwd },
        { p: new Vec3(0, y, z + 0.006), w: 0.009, d: 0.004, e: 2.4, right: _zRight, fwd: _zFwd },
      ], 8, true, true);
    }
    // The placket strip they sit on.
    const a = torsoAt(T, yTop), b2 = torsoAt(T, beltY);
    loftRings(g, [
      { p: new Vec3(0, yTop, a[2] + lift + 0.003 + (a[4] || 0) * 0.9), w: 0.020, d: 0.004, e: 3.0, right: _zRight, fwd: _zFwd },
      { p: new Vec3(0, beltY, b2[2] + lift + 0.003 + (b2[4] || 0) * 0.9), w: 0.020, d: 0.004, e: 3.0, right: _zRight, fwd: _zFwd },
    ], 8, true, true);
  }

  // Lapels: two panels folded back off the collar.
  if (kind === 'shirt' || kind === 'overalls') {
    const sec = torsoAt(T, 0.44);
    for (const side of [-1, 1]) {
      loftRings(g, [
        { p: new Vec3(side * 0.030, build.coat.collar - 0.02, sec[2] + lift + (sec[4] || 0) * 0.9), w: 0.024, d: 0.006, e: 2.8 },
        { p: new Vec3(side * 0.058, 0.400, sec[2] + lift - 0.004 + (sec[4] || 0) * 0.9), w: 0.030, d: 0.006, e: 2.8 },
        { p: new Vec3(side * 0.040, 0.330, sec[2] + lift - 0.010 + (sec[4] || 0) * 0.9), w: 0.020, d: 0.005, e: 2.8 },
      ], 8, true, true);
    }
  }

  // Turned cuffs at the wrists, and boot tops at the ankles.
  const w = new Vec3(), e = new Vec3(), k = new Vec3(), f = new Vec3();
  for (const sideName of ['L', 'R']) {
    skeleton.bones[skeleton.index('lowerArm' + sideName)].bindMatrix.getTranslation(e);
    skeleton.bones[skeleton.index('hand' + sideName)].bindMatrix.getTranslation(w);
    const cuffAt = new Vec3().copy(e).lerp(w, 0.80);
    const cuffEnd = new Vec3().copy(e).lerp(w, 0.94);
    loftRings(g, [
      { p: cuffAt, w: build.arm[4] + 0.016, d: build.arm[4] + 0.016, e: 2.2 },
      { p: cuffEnd, w: build.arm[4] + 0.013, d: build.arm[4] + 0.013, e: 2.2 },
    ], 12, true, true);

    skeleton.bones[skeleton.index('lowerLeg' + sideName)].bindMatrix.getTranslation(k);
    skeleton.bones[skeleton.index('foot' + sideName)].bindMatrix.getTranslation(f);
    const bootTop = new Vec3().copy(k).lerp(f, 0.52);
    const bootLow = new Vec3().copy(k).lerp(f, 0.99);
    loftRings(g, [
      { p: bootTop, w: build.leg[4] + 0.020, d: build.leg[4] + 0.020, e: 2.3 },
      { p: new Vec3().copy(bootTop).lerp(bootLow, 0.5), w: build.leg[4] + 0.017, d: build.leg[4] + 0.019, e: 2.3 },
      { p: bootLow, w: build.leg[4] + 0.015, d: build.leg[4] + 0.018, e: 2.3 },
    ], 12, true, true);
  }
  void rng;
}

/* The whole figure: flesh only. Clothes are a separate mesh. */
function buildZombieBodyGeometry(skeleton, opts = {}) {
  const g = new Geometry();
  const segments = opts.segments || 16;
  const build = ZOMBIE_BUILDS[opts.build] || ZOMBIE_BUILDS.male;
  const rng = new Rng(opts.seed || 7);

  // Flesh.
  const rings = build.torso.map(([y, w, d, e, zo], i) => ({
    p: new Vec3(0, y, zo || 0), w, d, e, uv: i / (build.torso.length - 1),
  }));
  loftRings(g, rings, segments, true, true);
  buildZombieNeck(g, segments, build);
  if (build.bust) buildBust(g, build);
  if (build.shoulderCaps) buildShoulderCaps(g, skeleton, build);

  const a = new Vec3(), b = new Vec3(), c = new Vec3();
  for (const sideName of ['L', 'R']) {
    const side = sideName === 'L' ? 1 : -1;
    skeleton.bones[skeleton.index('upperArm' + sideName)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerArm' + sideName)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('hand' + sideName)].bindMatrix.getTranslation(c);
    const root = new Vec3().copy(a);
    root.x -= side * 0.048 * build.shoulder;
    root.y += 0.052;
    /* Upper arm swells at the biceps and necks in above the elbow; the
       forearm swells again at the flexors and runs down to a narrow wrist.
       A single monotonic taper from shoulder to hand is what turns an arm
       into a noodle, however thick you make the top of it. */
    const up = limbRings(root, b, [
      [build.arm[0] * 1.16, build.arm[0] * 1.16, 2.0],
      [build.arm[0] * 1.02, build.arm[0] * 1.02, 2.0],
      [build.arm[1] * 1.06, build.arm[1] * 1.06, 2.0],
      [build.arm[1] * 0.92, build.arm[1] * 0.92, 2.0],
    ]);
    const lo = limbRings(b, c, [
      [build.arm[2] * 1.02, build.arm[2] * 1.02, 2.0],
      [build.arm[2] * 1.12, build.arm[2] * 1.12, 2.0],
      [build.arm[3], build.arm[3], 2.0],
      [build.arm[4], build.arm[4] * 1.06, 2.1],
    ]);
    loftRings(g, up.concat(lo.slice(1)), segments, false, false);
    /* An elbow. A limb lofted straight through its joint pinches to a
       crease the moment the skin solver bends it — there is nothing at the
       hinge to hold the volume. A ball at the joint is what keeps an arm
       an arm through its whole range. */
    buildJoint(g, b, build.arm[1] * 1.04);
    buildHand(g, side, c, segments);

    skeleton.bones[skeleton.index('upperLeg' + sideName)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerLeg' + sideName)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('foot' + sideName)].bindMatrix.getTranslation(c);
    /* Thigh full at the top, knee narrow, calf belly behind the shin, thin
       at the ankle. Same reasoning as the arm. */
    const th = limbRings(a, b, [
      [build.leg[0] * 1.06, build.leg[0] * 1.06, 2.2],
      [build.leg[1], build.leg[1], 2.2],
      [build.leg[2] * 1.04, build.leg[2] * 1.04, 2.1],
      [build.leg[2] * 0.94, build.leg[2] * 0.96, 2.1],
    ]);
    const sh = limbRings(b, c, [
      [build.leg[2] * 0.98, build.leg[2] * 1.02, 2.1],
      [build.leg[3] * 1.12, build.leg[3] * 1.22, 2.1],
      [build.leg[3] * 0.92, build.leg[3] * 0.96, 2.1],
      [build.leg[4], build.leg[4], 2.1],
    ], (t) => -0.014 * Math.sin(t * PI));
    loftRings(g, th.concat(sh.slice(1)), segments, false, false);
    buildJoint(g, b, build.leg[2] * 1.06);          // knee
    buildJoint(g, a, build.leg[0] * 0.92);          // hip socket
    buildShoe(g, side, skeleton, segments);
  }

  g.finalize();
  g.computeWeldGroups();
  smoothNormals(g);
  weldNormals(g.normals, g.weldGroups);
  return g;
}

/* Blood is a second mesh over the same skeleton, so it can be its own
   material and still move with the body. */
function buildZombieBloodGeometry(skeleton, opts = {}) {
  const g = new Geometry();
  const build = ZOMBIE_BUILDS[opts.build] || ZOMBIE_BUILDS.male;
  buildBloodStains(g, build, new Rng((opts.seed || 7) * 13 + 5));
  g.finalize();
  g.computeWeldGroups();
  smoothNormals(g);
  weldNormals(g.normals, g.weldGroups);
  return g;
}
