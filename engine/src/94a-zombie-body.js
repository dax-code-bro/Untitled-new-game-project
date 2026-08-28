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

/* Torso cross-sections per build: [y, halfWidth, halfDepth, squareness]. */
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
    arm: [0.052, 0.041, 0.034, 0.028, 0.024],
    leg: [0.077, 0.066, 0.055, 0.045, 0.038],
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
    arm: [0.045, 0.036, 0.030, 0.025, 0.021],
    leg: [0.072, 0.062, 0.051, 0.042, 0.035],
    coat: { hem: -0.30, collar: 0.51, flare: 1.06, colorIdx: 1 },
  },
  heavy: {
    // A gut that overhangs the belt and a chest that carries above it.
    scale: 1.02, shoulder: 1.06,
    torso: [
      [-0.062, 0.118, 0.104, 2.5], [-0.045, 0.152, 0.126, 2.6],
      [-0.022, 0.178, 0.148, 2.6], [0.000, 0.186, 0.160, 2.6],
      [0.090, 0.190, 0.176, 2.5], [0.175, 0.192, 0.184, 2.4],
      [0.250, 0.188, 0.176, 2.5], [0.320, 0.186, 0.158, 2.6],
      [0.380, 0.188, 0.142, 2.6], [0.425, 0.192, 0.133, 2.6],
      [0.460, 0.200, 0.122, 2.7], [0.487, 0.184, 0.110, 2.6],
      [0.508, 0.136, 0.094, 2.4], [0.528, 0.082, 0.072, 2.2],
    ],
    arm: [0.066, 0.055, 0.046, 0.038, 0.030],
    leg: [0.098, 0.086, 0.070, 0.056, 0.045],
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
    arm: [0.058, 0.046, 0.038, 0.031, 0.026],
    leg: [0.084, 0.072, 0.060, 0.049, 0.040],
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

/* The coat: collar, body, and a hem that hangs past the hips. */
function buildZombieCoat(g, build, rng, segments) {
  const c = build.coat;
  const T = build.torso;
  const lift = 0.012;                       // stand-off, so cloth is not skin
  const rings = [];
  // Follow the trunk's own silhouette upward from the hem to the collar.
  const stops = [c.hem, c.hem + 0.10, 0.00, 0.175, 0.320, 0.425, 0.487, c.collar];
  for (const y of stops) {
    // Nearest authored trunk section, widened into cloth.
    let best = T[0];
    for (const t of T) if (Math.abs(t[0] - y) < Math.abs(best[0] - y)) best = t;
    const spread = y < 0.02 ? c.flare : 1.0;
    rings.push({
      p: new Vec3(0, y, 0),
      w: (best[1] + lift) * spread, d: (best[2] + lift) * spread,
      e: best[3], right: _zRight, fwd: _zFwd,
    });
  }
  rings.reverse();                           // hem last, so the teeth land there
  loftGarment(g, rings, segments, rng, { holes: 0.07 });

  // Collar: a short stand-up band, always intact, so the coat has a top edge.
  const top = rings[0];
  loftRings(g, [
    { p: new Vec3(0, c.collar, 0), w: top.w * 0.62, d: top.d * 0.70, e: 2.3, right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, c.collar + 0.055, -0.008), w: top.w * 0.66, d: top.d * 0.78, e: 2.3, right: _zRight, fwd: _zFwd },
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

/* The whole figure: flesh, then clothes over it. */
function buildZombieBodyGeometry(skeleton, opts = {}) {
  const g = new Geometry();
  const segments = opts.segments || 16;
  const build = ZOMBIE_BUILDS[opts.build] || ZOMBIE_BUILDS.male;
  const rng = new Rng(opts.seed || 7);

  // Flesh.
  const rings = build.torso.map(([y, w, d, e], i) => ({
    p: new Vec3(0, y, 0), w, d, e, uv: i / (build.torso.length - 1),
  }));
  loftRings(g, rings, segments, true, true);
  buildZombieNeck(g, segments, build);

  const a = new Vec3(), b = new Vec3(), c = new Vec3();
  for (const sideName of ['L', 'R']) {
    const side = sideName === 'L' ? 1 : -1;
    skeleton.bones[skeleton.index('upperArm' + sideName)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerArm' + sideName)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('hand' + sideName)].bindMatrix.getTranslation(c);
    const root = new Vec3().copy(a);
    root.x -= side * 0.048 * build.shoulder;
    root.y += 0.052;
    const up = limbRings(root, b, [
      [build.arm[0] * 1.14, build.arm[0] * 1.14, 2.0],
      [build.arm[0], build.arm[0], 2.0],
      [build.arm[1], build.arm[1], 2.0],
    ]);
    const lo = limbRings(b, c, [
      [build.arm[2] * 1.10, build.arm[2] * 1.10, 2.0],
      [build.arm[3], build.arm[3], 2.0],
      [build.arm[4], build.arm[4], 2.1],
    ]);
    loftRings(g, up.concat(lo.slice(1)), segments, false, false);
    buildHand(g, side, c, segments);

    skeleton.bones[skeleton.index('upperLeg' + sideName)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerLeg' + sideName)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('foot' + sideName)].bindMatrix.getTranslation(c);
    const th = limbRings(a, b, [
      [build.leg[0], build.leg[0], 2.2],
      [build.leg[1], build.leg[1], 2.2],
      [build.leg[2], build.leg[2], 2.1],
    ]);
    const sh = limbRings(b, c, [
      [build.leg[2] * 1.08, build.leg[2] * 1.08, 2.1],
      [build.leg[3], build.leg[3] * 1.14, 2.1],
      [build.leg[4], build.leg[4], 2.1],
    ], (t) => -0.010 * Math.sin(t * PI));
    loftRings(g, th.concat(sh.slice(1)), segments, false, false);
    buildShoe(g, side, skeleton, segments);
  }

  // Clothes.
  buildZombieCoat(g, build, rng, segments);
  buildZombieLimbCloth(g, skeleton, build, rng, segments);
  if (opts.build === 'armored') buildWebbing(g, build);

  g.finalize();
  g.computeWeldGroups();
  smoothNormals(g);
  weldNormals(g.normals, g.weldGroups);
  return g;
}
