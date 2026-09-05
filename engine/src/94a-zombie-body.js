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

/* One frame, at a different girth.
 *
 * The four builds above are four PEOPLE, and ten characters cannot be
 * four people. Rather than author six more torso stacks -- which would
 * be six more tables to keep in step every time the shoulder yoke or the
 * coat hem moves -- a character names the frame it is closest to and a
 * number for how much of it there is. Every cross-section half-width and
 * half-depth, every limb radius and the shoulder caps scale together;
 * the HEIGHTS in the stack do not, because a wider person is not a
 * taller one and scaling those would stretch the torso as well as
 * thicken it.
 *
 * Cached on frame and girth, because the geometry builders ask for it
 * once per mesh and a character is four meshes.
 */

/* No two of them in the same clothes.
 *
 * A crowd of ten in `street` was ten identical shirts, which is the
 * single loudest thing that says "this is one model repeated" -- louder
 * than the faces, because the shirt is most of the silhouette. Every
 * colour in an outfit is nudged per body: value up or down by up to a
 * fifth, and hue by a little, off the same seed that varies the face
 * and the wounds. Clothes that came off different people and have been
 * worn since.
 *
 * Keyed and cached on outfit and seed, because the cloth mesh is built
 * once per body and asks for this once.
 */
const _jitterCache = new Map();
function jitterOutfit(outfit, name, seed) {
  if (!outfit) return outfit;
  const key = name + ':' + seed;
  let out = _jitterCache.get(key);
  if (out) return out;
  const rng = new Rng((seed || 3) * 977 + 41);
  const tint = (c) => {
    if (c == null) return c;
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    // One value shift for the whole garment, so a shirt does not turn
    // into a tie-dye -- plus a small independent nudge per channel.
    const v = rng.range(0.82, 1.18);
    r = Math.max(0, Math.min(255, Math.round(r * v * rng.range(0.94, 1.06))));
    g = Math.max(0, Math.min(255, Math.round(g * v * rng.range(0.94, 1.06))));
    b = Math.max(0, Math.min(255, Math.round(b * v * rng.range(0.94, 1.06))));
    return (r << 16) | (g << 8) | b;
  };
  const piece = (o) => (o ? Object.assign({}, o, { color: tint(o.color),
    sole: o.sole != null ? tint(o.sole) : undefined,
    brim: o.brim != null ? tint(o.brim) : undefined }) : o);
  out = Object.assign({}, outfit, {
    top: piece(outfit.top), under: piece(outfit.under), bottom: piece(outfit.bottom),
    shoes: piece(outfit.shoes), hat: piece(outfit.hat),
    belt: outfit.belt != null ? tint(outfit.belt) : undefined,
    badge: outfit.badge,        // a badge is a badge; it is issued, not worn in
  });
  _jitterCache.set(key, out);
  return out;
}

const _girthCache = new Map();
function buildAtGirth(name, girth) {
  const base = ZOMBIE_BUILDS[name] || ZOMBIE_BUILDS.male;
  if (!girth || Math.abs(girth - 1) < 1e-4) return base;
  const key = name + ':' + girth.toFixed(3);
  let out = _girthCache.get(key);
  if (out) return out;
  const g = Math.max(0.6, Math.min(1.8, girth));
  out = Object.assign({}, base);
  // [height, halfWidth, halfDepth, squareness, (belly)] -- widths only.
  out.torso = base.torso.map((r) => {
    const c = r.slice();
    c[1] *= g; c[2] *= g;
    if (c.length > 4) c[4] *= g;
    return c;
  });
  out.arm = base.arm.map((v) => v * g);
  out.leg = base.leg.map((v) => v * (1 + (g - 1) * 0.80));   // legs thicken less than a gut does
  out.shoulderCaps = base.shoulderCaps * g;
  if (base.bust) out.bust = Object.assign({}, base.bust);
  if (base.coat) out.coat = Object.assign({}, base.coat, { flare: base.coat.flare * (1 + (g - 1) * 0.5) });
  _girthCache.set(key, out);
  return out;
}

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
  /* `lift` is how far off the flesh this sits, so the same shape can be
     emitted twice: once as the body and once, a few millimetres out, as
     the garment over it. Without the second one the shirt is a smooth
     tube lofted from the torso stack alone, and it flattens the chest it
     is supposed to be covering -- which is why the women read as having
     none at all under their clothes. */
  const lift = arguments.length > 2 && arguments[2] ? arguments[2] : 0;
  for (const side of [-1, 1]) {
    const rings = [];
    const N = 5;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // Out from the ribs, forward, and drooping as it goes.
      const proj = Math.sin(t * PI * 0.62);
      rings.push({
        p: new Vec3(side * B.x * (1 - t * 0.18), B.y - t * B.drop, B.z + proj * B.out + lift * 0.55),
        w: B.r * Math.sin((1 - t * 0.62) * PI * 0.5) + 0.004 + lift,
        d: B.r * Math.sin((1 - t * 0.62) * PI * 0.5) + 0.004 + lift,
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
/* Caps sit on the torso but belong to the arm: a deltoid left behind when
   the shoulder lifts tears a hole at the top of the sleeve. */
function buildShoulderCaps(g, skeleton, build) {
  const a = new Vec3();
  const was = g.part;
  for (const sideName of ['L', 'R']) {
    const side = sideName === 'L' ? 1 : -1;
    g.part = sideName === 'L' ? PART.ARM_L : PART.ARM_R;
    skeleton.bones[skeleton.index('upperArm' + sideName)].bindMatrix.getTranslation(a);
    const r = build.shoulderCaps;
    loftRings(g, [
      { p: new Vec3(a.x - side * 0.030, a.y + 0.055, a.z), w: r * 0.72, d: r * 0.80, e: 2.3 },
      { p: new Vec3(a.x + side * 0.010, a.y + 0.030, a.z), w: r, d: r * 0.94, e: 2.2 },
      { p: new Vec3(a.x + side * 0.040, a.y - 0.020, a.z), w: r * 0.86, d: r * 0.82, e: 2.1 },
    ], 12, true, true);
  }
  g.part = was;
}

/* ---------------- garments ----------------
   A tube that is torn rather than merely irregular: the hem is cut into
   teeth of differing depth, whole panels are punched out to leave holes
   the body shows through, and the surface is emitted double-sided so a
   hole reads as a hole from either side rather than vanishing. */
function loftGarment(g, rings, segments, rng, opts = {}) {
  const holes = opts.holes != null ? opts.holes : 0.06;
  const hemTeeth = opts.hemTeeth !== false;
  const thick = opts.thick != null ? opts.thick : 0.006;
  /* Where tears are allowed. Punching panels out anywhere leaves a bare
     stomach and bare shoulders, which is not a torn shirt — it is a shirt
     with the middle missing. Cloth gives out at the hem and the elbows and
     knees, so a band restricts the damage to the rows that should take it. */
  const band = opts.tearBand || null;
  const row = segments + 1;
  const tmp = new Vec3(), nrm = new Vec3();

  /* Cloth is built as two shells a few millimetres apart — an outside and a
     lining — rather than one surface emitted twice.

     Emitting the same quad with both windings puts two triangles at exactly
     the same depth: they z-fight, and whichever wins carries an outward
     normal while facing away, so it shades as though lit from inside. That
     is where the hard black patches across every chest came from. Two real
     shells also give the garment an edge you can see at every hem, cuff and
     torn opening, which is most of what separates a coat from a paint job.

     Both shells share one hole mask and one set of hem teeth so a tear goes
     cleanly through the material instead of stopping at the lining. */
  const tooth = [], wob = [];
  for (let i = 0; i < rings.length; i++) {
    const last = i === rings.length - 1;
    for (let s = 0; s <= segments; s++) {
      tooth.push((last && hemTeeth)
        ? (Math.sin(s * 2.3 + rng.range(0, 0.4)) * 0.5 + 0.5) * 0.055 + rng.range(0, 0.02)
        : 0);
      wob.push(1 + rng.range(-0.012, 0.012));
    }
  }
  const cut = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const y = rings[i].p.y;
    const allowed = !band || (y >= band[0] && y <= band[1]);
    for (let s = 0; s < segments; s++) cut.push(allowed && rng.next() < holes);
  }

  const shell = (inset, flip) => {
    const base = g.positions.length / 3;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      for (let s = 0; s <= segments; s++) {
        const k = i * row + s;
        const a = (s / segments) * TAU;
        const w = Math.max(r.w * wob[k] - inset, 0.004);
        const d = Math.max(r.d * wob[k] - inset, 0.004);
        ringVertex(tmp, r.p, r.right || _zRight, r.fwd || _zFwd, w, d, a, r.e || 2);
        nrm.set(tmp.x - r.p.x, tmp.y - r.p.y, tmp.z - r.p.z).normalize();
        if (flip) nrm.set(-nrm.x, -nrm.y, -nrm.z);
        g.vert(tmp.x, tmp.y + tooth[k], tmp.z, nrm.x, nrm.y, nrm.z,
          (s / segments) * 2, i / (rings.length - 1) * 2);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let s = 0; s < segments; s++) {
        if (cut[i * segments + s]) continue;   // punched out: this is the tear
        const a = base + i * row + s;
        if (flip) g.quad(a, a + row, a + row + 1, a + 1);
        else g.quad(a, a + 1, a + row + 1, a + row);
      }
    }
    return base;
  };
  const outer = shell(0, false);
  const inner = shell(thick, true);

  /* Close the two shells to each other at the openings, so a collar, a cuff
     and a hem all show the thickness of the material end-on. */
  for (const i of [0, rings.length - 1]) {
    for (let s = 0; s < segments; s++) {
      const o = outer + i * row + s, n = inner + i * row + s;
      if (i === 0) g.quad(o, n, n + 1, o + 1);
      else g.quad(o, o + 1, n + 1, n);
    }
  }
}

const _zRight = new Vec3(1, 0, 0);
const _zFwd = new Vec3(0, 0, 1);
/* A ring whose cross-section stands UP: width across X, height up Y.
   `_zFwd` puts the section flat in the XZ plane, which is right for a
   band lofted vertically and catastrophically wrong for anything lofted
   along Z -- the sections then lie in the plane they are being stacked
   in, and what you get is a set of overlapping horizontal discs with no
   height at all. Every boot in the game was that: a flat pancake in the
   ground plane, invisible inside the foot it was supposed to cover, and
   the bare flesh foot was what the player actually saw. */
const _yFwd = new Vec3(0, 1, 0);

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

/* ============================================================
   OUTFITS

   What a zombie died in, as a description rather than a switch
   buried in the builder. Every piece is a colour and a cut, and
   the whole outfit is emitted into one mesh with per-vertex
   tints, so a white shirt over blue jeans over brown boots is
   still one material and one draw call.

   Coverage is the rule the old garments broke: the trunk is
   closed from the collar to below the seat, a yoke curves over
   each shoulder to meet the sleeve, and the trousers run to the
   ankle. Tears are confined to bands where cloth actually gives
   out — hems, elbows, knees — because a hole punched anywhere
   reads as a missing shirt rather than a ruined one.
   ============================================================ */
const OUTFITS = {
  /* Z=1. The standard male: whatever he had on when it happened. */
  street: {
    top: { color: 0xe4e2db, collar: 0.512, hem: -0.055, sleeve: 0.22, tears: 0.05 },
    bottom: { color: 0x46587a, hem: 0.99, tears: 0.07, knees: true },
    shoes: { kind: 'boot', color: 0x3b2c1e },
    hat: null, wire: false,
  },
  /* Z=2. Sweatshirt over a black tee, and the cap never came off. */
  college: {
    top: { color: 0x7d2233, collar: 0.520, hem: -0.075, sleeve: 0.93, tears: 0.035 },
    under: { color: 0x15171b, collar: 0.500, hem: -0.10 },
    bottom: { color: 0x1b1d21, hem: 0.99, tears: 0.03 },
    shoes: { kind: 'sneaker', color: 0xe2e0da, sole: 0xa8323c },
    hat: { color: 0x7d2233, brim: 0x5e1a27 }, wire: false,
  },
  /* The heavy build in uniform. A sheriff carried a revolver, and
     sometimes it is still on him. */
  sheriff: {
    top: { color: 0x3f4a53, collar: 0.516, hem: -0.070, sleeve: 0.90, tears: 0.035 },
    under: { color: 0xb9bcc0, collar: 0.500, hem: -0.09 },
    bottom: { color: 0x2b323a, hem: 0.99, tears: 0.03 },
    shoes: { kind: 'boot', color: 0x1e1a17 },
    hat: { color: 0x2f3740, brim: 0x232a31 }, wire: false,
    badge: 0xd9b13a, belt: 0x241f1a,
  },
  /* An officer, of one army or the other. He is not carrying anything you
     want, which is the point of him: a big body worth no drop at all. */
  officer: {
    top: { color: 0x4b4f3c, collar: 0.520, hem: -0.080, sleeve: 0.94, tears: 0.04 },
    under: { color: 0x8d8a72, collar: 0.502, hem: -0.10 },
    bottom: { color: 0x3e4232, hem: 0.99, tears: 0.035 },
    shoes: { kind: 'boot', color: 0x241d18 },
    hat: { color: 0x4b4f3c, brim: 0x2b2e22 }, wire: false,
    badge: 0xb8b2a0, belt: 0x2a221c,
  },
  /* Z=4. The depot mechanic, still in what he worked in. */
  mechanic: {
    top: { color: 0x2a3644, collar: 0.512, hem: -0.068, sleeve: 0.62, tears: 0.055 },
    under: { color: 0x8e8a80, collar: 0.500, hem: -0.06 },
    bottom: { color: 0x2a3644, hem: 0.99, tears: 0.06, knees: true },
    shoes: { kind: 'boot', color: 0x241d18 },
    hat: null, wire: false, belt: 0x1a1512,
  },
  /* Z=5. Whoever was on the ward when it came through. */
  medic: {
    top: { color: 0xa8a69f, collar: 0.518, hem: -0.100, sleeve: 0.90, tears: 0.07 },
    under: { color: 0x3d5560, collar: 0.500, hem: -0.09 },
    bottom: { color: 0x2f3238, hem: 0.99, tears: 0.05 },
    shoes: { kind: 'sneaker', color: 0x6a6760, sole: 0x8e8b84 },
    hat: null, wire: false,
  },
  /* Z=6. Off the land, and dressed for it. */
  farmer: {
    top: { color: 0x5c4a2a, collar: 0.508, hem: -0.052, sleeve: 0.40, tears: 0.06 },
    under: { color: 0x9a9488, collar: 0.498, hem: -0.05 },
    bottom: { color: 0x35424e, hem: 0.99, tears: 0.075, knees: true },
    shoes: { kind: 'boot', color: 0x2e2118 },
    hat: { color: 0x4a3c22, brim: 0x352b18 }, wire: false,
  },
  /* Z=7. A conscript. Neither army wants him back. */
  conscript: {
    top: { color: 0x38402c, collar: 0.516, hem: -0.072, sleeve: 0.92, tears: 0.05 },
    under: { color: 0x6a6a58, collar: 0.502, hem: -0.09 },
    bottom: { color: 0x2f3526, hem: 0.99, tears: 0.055, knees: true },
    shoes: { kind: 'boot', color: 0x1e1913 },
    hat: null, wire: false, belt: 0x241d16,
  },

  /* ---- the living ----
     ...
     The palette below was authored twice. The first pass used hexes at
     the values these colours have on a screen, and every one of the ten
     came out washed pale -- a brown trenchcoat the same value as the
     face above it, a deep red flannel that read as salmon. Vertex tints
     do NOT go through the sRGB curve on the way in (see setColor), so a
     hex here lands about twice as bright as the same hex on a material.
     Every colour is halved from what it looks like it should be, and the
     two deliberately pale things -- a lab coat and a dress shirt -- are
     only taken off the peg rather than halved.
     The ten you play as. Same builder, same one mesh and one draw call
     as the dead wear -- what changes is the cut and the palette, which
     is the whole reason this is a table of descriptions rather than a
     switch in the geometry.

     Colours here are per-vertex tints and are NOT put through the sRGB
     curve on the way in (see setColor). They are authored by eye
     against that, the same as the five outfits above. */

  /* Adams: Soviet greatcoat, eighty-five years of weather in it. */
  greatcoat: {
    top: { color: 0x2d2e26, collar: 0.522, hem: -0.115, sleeve: 0.97, tears: 0.012 },
    under: { color: 0x464539, collar: 0.502, hem: -0.10 },
    bottom: { color: 0x25261f, hem: 0.99, tears: 0.01 },
    shoes: { kind: 'boot', color: 0x120e0c },
    hat: null, wire: false, belt: 0x15110e,
  },
  /* Carlos: depot coveralls, oil worked into the weave. */
  coveralls: {
    top: { color: 0x252d38, collar: 0.512, hem: -0.070, sleeve: 0.88, tears: 0.015 },
    under: { color: 0x98958d, collar: 0.500, hem: -0.06 },
    bottom: { color: 0x252d38, hem: 0.99, tears: 0.02 },
    shoes: { kind: 'boot', color: 0x171310 },
    hat: null, wire: false, belt: 0x120f0d,
  },
  /* Sam: canvas driving jacket over a shirt gone soft. */
  driver: {
    top: { color: 0x453b24, collar: 0.514, hem: -0.062, sleeve: 0.86, tears: 0.018 },
    under: { color: 0x5c5950, collar: 0.500, hem: -0.08 },
    bottom: { color: 0x1e2228, hem: 0.99, tears: 0.02 },
    shoes: { kind: 'boot', color: 0x251c15 },
    hat: null, wire: false,
  },
  /* Chrissy: her father's flannel, far too big for her. */
  flannel: {
    top: { color: 0x542a28, collar: 0.508, hem: -0.090, sleeve: 0.95, tears: 0.02 },
    under: { color: 0xa8a59c, collar: 0.498, hem: -0.04 },
    bottom: { color: 0x2d3541, hem: 0.99, tears: 0.03 },
    shoes: { kind: 'boot', color: 0x2c221a },
    hat: null, wire: false,
  },
  /* Rebecca: fighting kit and nothing over it. */
  fighter: {
    top: { color: 0x1d1d1f, collar: 0.502, hem: -0.030, sleeve: 0.10, tears: 0.01 },
    bottom: { color: 0x121215, hem: 0.62, tears: 0.01 },
    shoes: { kind: 'sneaker', color: 0x0e0e10, sole: 0x8f8c86 },
    hat: null, wire: false,
  },
  /* Hank: work shirt, sleeves rolled past the elbow. */
  workshirt: {
    top: { color: 0x3f474e, collar: 0.512, hem: -0.058, sleeve: 0.44, tears: 0.02 },
    bottom: { color: 0x1f251d, hem: 0.99, tears: 0.02 },
    shoes: { kind: 'boot', color: 0x1a1510 },
    hat: null, wire: false, belt: 0x120f0d,
  },
  /* Frank: the winter trenchcoat he walked in wearing. */
  trenchcoat: {
    top: { color: 0x352a21, collar: 0.524, hem: -0.135, sleeve: 0.98, tears: 0.02 },
    under: { color: 0x3d3933, collar: 0.500, hem: -0.10 },
    bottom: { color: 0x221d18, hem: 0.99, tears: 0.015 },
    shoes: { kind: 'boot', color: 0x15110d },
    hat: null, wire: false, belt: 0x19140f,
  },
  /* Chris: whatever was hanging in the laboratory. */
  labcoat: {
    top: { color: 0xa8a6a1, collar: 0.518, hem: -0.108, sleeve: 0.93, tears: 0.008 },
    under: { color: 0x373e43, collar: 0.500, hem: -0.09 },
    bottom: { color: 0x25272b, hem: 0.99, tears: 0.008 },
    shoes: { kind: 'sneaker', color: 0x4d4b47, sole: 0xa8a59f },
    hat: null, wire: false,
  },
  /* Remi: a colour nobody else would have picked. */
  burgundy: {
    top: { color: 0x4e2028, collar: 0.516, hem: -0.082, sleeve: 0.92, tears: 0.006 },
    under: { color: 0x151114, collar: 0.500, hem: -0.09 },
    bottom: { color: 0x171418, hem: 0.99, tears: 0.006 },
    shoes: { kind: 'boot', color: 0x150f11 },
    hat: null, wire: false,
  },
  /* Rodriguez: leather, and he knows it. */
  leather: {
    top: { color: 0x251c16, collar: 0.514, hem: -0.070, sleeve: 0.90, tears: 0.01 },
    under: { color: 0x585652, collar: 0.498, hem: -0.06 },
    bottom: { color: 0x17191e, hem: 0.99, tears: 0.012 },
    shoes: { kind: 'boot', color: 0x15100d },
    hat: null, wire: false, belt: 0x0f0d0a,
  },

  /* Z=3. Prison issue, and the wire he went through to get out. */
  prison: {
    top: { color: 0xd07227, collar: 0.508, hem: -0.045, sleeve: 0.42, tears: 0.05 },
    under: { color: 0xd6d2c8, collar: 0.498, hem: -0.02 },
    bottom: { color: 0xd07227, hem: 0.99, tears: 0.05 },
    shoes: { kind: 'boot', color: 0x241f1b },
    hat: null, wire: true,
  },
};

/* A shoulder yoke: the piece that was missing.

   A sleeve is a tube down the arm and the trunk shell is an ellipse round
   the spine, and between the two — over the top of the deltoid — neither
   reaches. That gap is why every zombie had bare shoulders. The yoke is a
   short curved tube from the collar, over the shoulder, down to where the
   sleeve begins, which closes it and reads as a seam rather than a patch. */
function buildShoulderYoke(g, skeleton, build, lift, segments) {
  const a = new Vec3();
  for (const sideName of ['L', 'R']) {
    const side = sideName === 'L' ? 1 : -1;
    g.part = sideName === 'L' ? PART.ARM_L : PART.ARM_R;
    skeleton.bones[skeleton.index('upperArm' + sideName)].bindMatrix.getTranslation(a);
    const neck = torsoAt(build.torso, 0.487);
    const r0 = build.shoulderCaps * 0.92, r1 = build.arm[0] + lift + 0.018;
    loftRings(g, [
      { p: new Vec3(side * neck[1] * 0.42, 0.505, 0), w: r0 * 0.80, d: r0 * 0.94, e: 2.2 },
      { p: new Vec3(side * (neck[1] * 0.82), 0.496, 0), w: r0 * 0.96, d: r0 * 1.02, e: 2.2 },
      { p: new Vec3(a.x + side * 0.012, a.y + 0.062, a.z), w: r0 * 1.10, d: r0 * 1.12, e: 2.2 },
      { p: new Vec3(a.x + side * 0.004, a.y + 0.012, a.z), w: r1, d: r1, e: 2.1 },
    ], segments, false, false);
  }
  g.part = PART.BODY;
}

/* Trousers as one closed garment: seat over the hips, then a leg down each
   side to the ankle. The old version stopped at mid-thigh and left the rest
   to a separate tube that did not meet it. */
function buildTrousers(g, skeleton, build, rng, segments, spec) {
  // Trousers hang close. Adding the garment standoff on top of a generous
  // limb radius is how a leg ends up wider than the torso above it.
  const T = build.torso, lift = 0.018;
  g.part = PART.BODY;
  g.setColor(spec.color);
  const seat = [0.215, 0.150, 0.075, 0.000, -0.075, -0.140]
    .map((y) => garmentRing(T, y, lift, 1.012));
  loftGarment(g, seat, segments, rng, { holes: 0.02, hemTeeth: false, thick: 0.007 });

  const a = new Vec3(), b = new Vec3(), c = new Vec3();
  for (const sideName of ['L', 'R']) {
    g.part = sideName === 'L' ? PART.LEG_L : PART.LEG_R;
    skeleton.bones[skeleton.index('upperLeg' + sideName)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerLeg' + sideName)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('foot' + sideName)].bindMatrix.getTranslation(c);
    const ankle = new Vec3().copy(b).lerp(c, spec.hem);
    const L = 0.014;
    const thigh = limbRings(a, b, [
      [build.leg[0] + L + 0.008, build.leg[0] + L + 0.008, 2.2],
      [build.leg[0] + L + 0.005, build.leg[0] + L + 0.005, 2.2],
      [build.leg[1] + L + 0.004, build.leg[1] + L + 0.004, 2.2],
      [build.leg[2] + L + 0.005, build.leg[2] + L + 0.005, 2.2],
      [build.leg[2] + L + 0.003, build.leg[2] + L + 0.003, 2.2],
    ]);
    const shin = limbRings(b, ankle, [
      [build.leg[2] + L + 0.003, build.leg[2] + L + 0.003, 2.2],
      [build.leg[3] + L + 0.005, build.leg[3] + L + 0.006, 2.2],
      [build.leg[3] + L + 0.003, build.leg[3] + L + 0.003, 2.2],
      [build.leg[4] + L + 0.004, build.leg[4] + L + 0.004, 2.2],
      [build.leg[4] + L + 0.002, build.leg[4] + L + 0.002, 2.2],
    ]);
    // Ripped jeans go at the knee, which is the only place denim ever goes.
    const knee = b.y;
    loftGarment(g, thigh.concat(shin.slice(1)), segments, rng, {
      holes: spec.tears, hemTeeth: false, thick: 0.007,
      tearBand: spec.knees ? [knee - 0.10, knee + 0.13] : null,
    });
  }
  g.part = PART.BODY;
}

function buildShoes(g, skeleton, build, segments, spec) {
  const b = new Vec3(), c = new Vec3();
  for (const sideName of ['L', 'R']) {
    g.part = sideName === 'L' ? PART.LEG_L : PART.LEG_R;
    skeleton.bones[skeleton.index('lowerLeg' + sideName)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('foot' + sideName)].bindMatrix.getTranslation(c);
    const r = build.leg[4];
    const top = new Vec3().copy(b).lerp(c, spec.kind === 'boot' ? 0.55 : 0.86);
    g.setColor(spec.color);
    // Upper: a boot climbs the shin, a sneaker sits at the ankle.
    loftRings(g, [
      { p: top, w: r + 0.030, d: r + 0.030, e: 2.3 },
      { p: new Vec3().copy(top).lerp(c, 0.55), w: r + 0.034, d: r + 0.036, e: 2.3 },
      { p: new Vec3(c.x, c.y + 0.030, c.z + 0.012), w: r + 0.032, d: r + 0.046, e: 2.4 },
    ], segments, true, false);
    /* The boot, built over the foot's OWN cross-sections.

       This was a second list of numbers hand-typed to sit near the first
       one, and they disagreed: the flesh foot runs to z + 0.207 and the
       boot stopped at + 0.128, so eighty millimetres of bare green toe
       stuck out the front of it, and there was nothing behind the heel
       either. Widening it by guesswork fixed the length and left the toe
       poking through the top instead. Derived from HUMAN_SHOE with a few
       millimetres of leather round it, it cannot disagree again. */
    /* The flesh foot's cross-section is a hard superellipse (exponent 3),
       the boot's was a rounder 2.6, so at the toe the foot's square
       corners came through the leather's rounded ones -- two pale patches
       either side of the toe cap. A boot is squarer than a foot, not
       rounder. */
    const CLEAR_W = 0.008, CLEAR_H = 0.009;
    /* Extra room at the toe. The foot's last two cross-sections are tiny
       -- 19 mm half-width at the tip -- and a flat 8 mm of leather round a
       section that small still let the foot's square corners through the
       boot's rounder ones. A boot toe is chunky anyway; a toe cap is the
       one place on a boot that is obviously bigger than the foot in it. */
    const toe = (bz) => smoothstep(0.09, 0.21, bz);
    const bootRings = (padW, padH, lift) => {
      const rings = HUMAN_SHOE.map(([bz, hw, up]) => {
        const t = toe(bz);
        const top = HUMAN.sole + up + padH + t * 0.019;
        const bot = HUMAN.sole - lift;
        return { p: new Vec3(c.x, (top + bot) * 0.5, c.z + bz),
          w: hw + padW + t * 0.019, d: (top - bot) * 0.5, e: 3.3, right: _zRight, fwd: _yFwd };
      });
      /* One ring past the end. HUMAN_SHOE's last station IS the toe, and
         the flesh foot closes with a cap a few millimetres beyond it --
         so a boot that stops exactly on the last station leaves the very
         apex of the toe outside, which is one vertex and was visible as
         a pale spot on two of the four builds. */
      const last = rings[rings.length - 1];
      rings.push({ p: new Vec3(c.x, last.p.y, last.p.z + 0.018),
        w: last.w * 0.55, d: last.d * 0.60, e: 3.0, right: _zRight, fwd: _yFwd });
      return rings;
    };
    loftRings(g, bootRings(CLEAR_W, CLEAR_H, 0.004), segments, true, true);
    // Sole: a slab under the same outline, in its own colour.
    g.setColor(spec.sole != null ? spec.sole : spec.color);
    loftRings(g, HUMAN_SHOE.map(([bz, hw]) => {
      const top = HUMAN.sole + 0.016, bot = HUMAN.sole - 0.010;
      return { p: new Vec3(c.x, (top + bot) * 0.5, c.z + bz),
        w: hw + CLEAR_W + 0.005 + toe(bz) * 0.013, d: (top - bot) * 0.5,
        e: 3.6, right: _zRight, fwd: _yFwd };
    }), segments, true, true);
  }
  g.setColor(null);
  g.part = PART.BODY;
}

/* A ball cap: crown, then a brim over the brow. */
function buildCap(g, skeleton, segments, spec) {
  g.part = PART.NECK;
  const h = new Vec3();
  skeleton.bones[skeleton.index('head')].bindMatrix.getTranslation(h);
  g.setColor(spec.color);
  loftRings(g, [
    { p: new Vec3(h.x, h.y + 0.075, h.z - 0.004), w: 0.104, d: 0.108, e: 2.4, right: _zRight, fwd: _zFwd },
    { p: new Vec3(h.x, h.y + 0.135, h.z - 0.004), w: 0.100, d: 0.104, e: 2.4, right: _zRight, fwd: _zFwd },
    { p: new Vec3(h.x, h.y + 0.180, h.z - 0.006), w: 0.074, d: 0.078, e: 2.3, right: _zRight, fwd: _zFwd },
    { p: new Vec3(h.x, h.y + 0.205, h.z - 0.006), w: 0.030, d: 0.032, e: 2.2, right: _zRight, fwd: _zFwd },
  ], segments, false, true);
  g.setColor(spec.brim != null ? spec.brim : spec.color);
  loftRings(g, [
    { p: new Vec3(h.x, h.y + 0.078, h.z + 0.060), w: 0.092, d: 0.048, e: 3.0, right: _zRight, fwd: _zFwd },
    { p: new Vec3(h.x, h.y + 0.070, h.z + 0.135), w: 0.078, d: 0.040, e: 3.0, right: _zRight, fwd: _zFwd },
    { p: new Vec3(h.x, h.y + 0.066, h.z + 0.178), w: 0.050, d: 0.020, e: 2.8, right: _zRight, fwd: _zFwd },
  ], 12, true, true);
  g.setColor(null);
  g.part = PART.BODY;
}

/* A duty belt with a buckle, and a badge on the chest. What separates a
   uniform from a shirt in a colour. */
function buildDutyBelt(g, build, outfit) {
  const T = build.torso;
  g.part = PART.BODY;
  g.setColor(outfit.belt);
  const y = 0.150;
  const b = torsoAt(T, y);
  loftRings(g, [
    { p: new Vec3(0, y - 0.028, (b[4] || 0) * 0.9), w: b[1] + 0.040, d: b[2] + 0.040, e: b[3], right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, y + 0.028, (b[4] || 0) * 0.9), w: b[1] + 0.040, d: b[2] + 0.040, e: b[3], right: _zRight, fwd: _zFwd },
  ], 16, false, false);
  g.setColor(0xc9b072);
  loftRings(g, [
    { p: new Vec3(0, y, b[2] + 0.050 + (b[4] || 0) * 0.9), w: 0.038, d: 0.012, e: 3.0, right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, y, b[2] + 0.058 + (b[4] || 0) * 0.9), w: 0.034, d: 0.010, e: 3.0, right: _zRight, fwd: _zFwd },
  ], 10, true, true);
  // Badge, high on the left breast.
  const c = torsoAt(T, 0.400);
  g.setColor(outfit.badge);
  loftRings(g, [
    { p: new Vec3(c[1] * 0.46, 0.400, c[2] + 0.034 + (c[4] || 0) * 0.9), w: 0.028, d: 0.006, e: 2.2, right: _zRight, fwd: _zFwd },
    { p: new Vec3(c[1] * 0.46, 0.400, c[2] + 0.042 + (c[4] || 0) * 0.9), w: 0.020, d: 0.004, e: 2.2, right: _zRight, fwd: _zFwd },
  ], 10, true, true);
  g.setColor(null);
}

/* Barbed wire, wound round the trunk. Cosmetic — it does nothing but say
   where this one came from and what it went through on the way out. */
function buildBarbwire(g, build, rng) {
  const T = build.torso;
  g.part = PART.BODY;
  g.setColor(0x6e6a60);
  const turns = 3.4, steps = 96, y0 = 0.44, y1 = -0.02;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = y0 + (y1 - y0) * t;
    const sec = torsoAt(T, y);
    const ang = t * turns * TAU;
    const r = 0.010;
    pts.push({
      p: new Vec3(Math.sin(ang) * (sec[1] + 0.050), y, Math.cos(ang) * (sec[2] + 0.050) + (sec[4] || 0) * 0.9),
      w: r, d: r, e: 2.0,
    });
  }
  loftRings(g, pts, 5, true, true);
  // Barbs, every few turns of the strand.
  for (let i = 6; i < pts.length - 6; i += 7) {
    const c = pts[i].p;
    const out = new Vec3(c.x, 0, c.z);
    if (out.lengthSq() > 1e-6) out.normalize();
    for (const k of [-1, 1]) {
      loftRings(g, [
        { p: new Vec3(c.x, c.y, c.z), w: 0.005, d: 0.005, e: 2 },
        { p: new Vec3(c.x + out.x * 0.026, c.y + k * 0.022, c.z + out.z * 0.026), w: 0.0015, d: 0.0015, e: 2 },
      ], 4, true, true);
    }
  }
  g.setColor(null);
  void rng;
}

function buildZombieGarment(g, build, rng, segments, outfit) {
  const T = build.torso;
  const c = build.coat;
  if (outfit) { buildOutfitTop(g, build, rng, segments, outfit); return; }
  /* How far the garment floats off the skin. At 12 mm on a trunk 150 mm
     across, a coat is 8 % bigger than the body inside it — which is not a
     coat, it is a paint job, and it reads on screen as bare skin in a
     different colour. Cloth hangs. */
  const lift = 0.028;
  const kind = build.garment || 'shirt';
  // The chest, under whatever this is. Same reason as the outfit path.
  if (build.bust) buildBust(g, build, lift + 0.006);

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

/* The top half of an outfit: an undershirt if there is one, then the shirt
   or sweatshirt over it, closed from the collar to below the seat so there
   is no bare stomach anywhere in the middle. */
function buildOutfitTop(g, build, rng, segments, outfit) {
  const T = build.torso;
  const lift = 0.028;
  g.part = PART.BODY;
  if (outfit.under) {
    const u = outfit.under;
    g.setColor(u.color);
    const rows = [u.collar, 0.470, 0.400, 0.330, 0.250, 0.170, 0.090, 0.010, u.hem];
    loftGarment(g, rows.map((y) => garmentRing(T, y, lift - 0.012)), segments, rng,
      { holes: 0.02, hemTeeth: false, thick: 0.005 });
  }
  const t = outfit.top;
  g.setColor(t.color);
  const rows = [t.collar, 0.487, 0.440, 0.390, 0.330, 0.270, 0.205, 0.140, 0.070, 0.000, -0.070, t.hem];
  loftGarment(g, rows.map((y, i) => garmentRing(T, y, lift, i > 8 ? 1.02 : 1)), segments, rng,
    { holes: t.tears, thick: 0.007, tearBand: [t.hem, 0.16] });
  // Over the chest, not through it.
  if (build.bust) buildBust(g, build, lift + 0.006);
  // A rolled collar, so the neck opening has an edge rather than a raw rim.
  const top = garmentRing(T, t.collar, lift);
  loftRings(g, [
    { p: new Vec3(0, t.collar, 0), w: top.w * 0.64, d: top.d * 0.72, e: 2.3, right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, t.collar + 0.048, -0.006), w: top.w * 0.70, d: top.d * 0.80, e: 2.3, right: _zRight, fwd: _zFwd },
  ], segments, false, false);
  g.setColor(null);
}

/* Sleeves and trouser legs, lofted along the actual bones. */
function buildZombieLimbCloth(g, skeleton, build, rng, segments, outfit) {
  const lift = 0.019;
  const a = new Vec3(), b = new Vec3(), c = new Vec3();
  for (const side of ['L', 'R']) {
    // Sleeve: shoulder to somewhere down the forearm, torn off at the end.
    g.part = side === 'L' ? PART.ARM_L : PART.ARM_R;
    skeleton.bones[skeleton.index('upperArm' + side)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerArm' + side)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('hand' + side)].bindMatrix.getTranslation(c);
    /* Sleeve length runs over the whole arm, shoulder to wrist, so a
       T-shirt can stop halfway down the bicep. Measured only along the
       forearm, the shortest sleeve any outfit could have still reached past
       the elbow. Below the halfway mark the sleeve ends on the upper arm
       and the forearm section is not built at all. */
    const sleeve = outfit ? outfit.top.sleeve : rng.range(0.68, 1.0);
    const shortSleeve = sleeve < 0.5;
    const cut = shortSleeve ? 0 : (sleeve - 0.5) * 2;
    if (outfit) g.setColor(outfit.top.color);
    const wrist = new Vec3().copy(b).lerp(c, cut);
    // Same ring density as the arm underneath, for the same reason: a
    // sleeve with one ring at the elbow folds flat when the elbow does.
    const upperEnd = shortSleeve ? new Vec3().copy(a).lerp(b, Math.max(sleeve * 2, 0.18)) : b;
    const upper = limbRings(a, upperEnd, [
      [build.arm[0] + lift + 0.016, build.arm[0] + lift + 0.014, 2.1],
      [build.arm[0] + lift + 0.013, build.arm[0] + lift + 0.012, 2.1],
      [build.arm[1] + lift + 0.014, build.arm[1] + lift + 0.013, 2.1],
      [build.arm[1] + lift + 0.010, build.arm[1] + lift + 0.010, 2.1],
      [build.arm[1] + lift + 0.008, build.arm[1] + lift + 0.008, 2.1],
    ]);
    const lower = limbRings(b, wrist, [
      [build.arm[2] + lift + 0.008, build.arm[2] + lift + 0.008, 2.1],
      [build.arm[2] + lift + 0.007, build.arm[2] + lift + 0.007, 2.1],
      [build.arm[2] + lift + 0.005, build.arm[2] + lift + 0.005, 2.1],
      [build.arm[3] + lift + 0.002, build.arm[3] + lift + 0.002, 2.1],
      [build.arm[3] + lift, build.arm[3] + lift, 2.1],
    ]);
    loftGarment(g, shortSleeve ? upper : upper.concat(lower.slice(1)), segments, rng,
      { holes: outfit ? outfit.top.tears : 0.05, thick: 0.006,
        tearBand: outfit ? [b.y - 0.10, b.y + 0.10] : null });
    if (outfit) { g.setColor(null); continue; }   // trousers are their own piece

    // Trouser leg, torn off below the knee on some.
    g.part = side === 'L' ? PART.LEG_L : PART.LEG_R;
    skeleton.bones[skeleton.index('upperLeg' + side)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerLeg' + side)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('foot' + side)].bindMatrix.getTranslation(c);
    const legCut = rng.range(0.3, 1.0);
    const ankle = new Vec3().copy(b).lerp(c, legCut);
    const thigh = limbRings(a, b, [
      [build.leg[0] + lift + 0.014, build.leg[0] + lift + 0.014, 2.2],
      [build.leg[0] + lift + 0.010, build.leg[0] + lift + 0.010, 2.2],
      [build.leg[1] + lift + 0.010, build.leg[1] + lift + 0.010, 2.2],
      [build.leg[2] + lift + 0.009, build.leg[2] + lift + 0.009, 2.2],
      [build.leg[2] + lift + 0.006, build.leg[2] + lift + 0.006, 2.2],
    ]);
    const shin = limbRings(b, ankle, [
      [build.leg[2] + lift + 0.006, build.leg[2] + lift + 0.006, 2.2],
      [build.leg[3] + lift + 0.008, build.leg[3] + lift + 0.010, 2.2],
      [build.leg[3] + lift + 0.004, build.leg[3] + lift + 0.004, 2.2],
      [build.leg[4] + lift + 0.002, build.leg[4] + lift + 0.002, 2.2],
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

/* ============================================================
   ARMOUR — the thin plate the running ones wear.

   Its own skinned mesh over the same skeleton, so it can be
   steel while the cloth under it stays cloth. Deliberately
   sparse: a chest and back plate, shoulder caps, bracers and
   shin guards. It is a layer someone strapped on in a hurry,
   not a suit — the point is that it reads as metal from across
   a room, because a player has to know at a glance that
   shooting it is a waste of ammunition.
   ============================================================ */
function buildZombieArmorGeometry(skeleton, opts = {}) {
  const g = new Geometry();
  const segments = opts.segments || 14;
  const build = buildAtGirth(opts.build, opts.girth);
  const T = build.torso;
  const a = new Vec3(), b = new Vec3(), c = new Vec3();

  g.part = PART.BODY;
  // Cuirass, sitting proud of whatever coat is under it.
  const lift = 0.052;
  const rows = [0.470, 0.420, 0.360, 0.300, 0.240, 0.180];
  loftRings(g, rows.map((y, i) => {
    const r = garmentRing(T, y, lift - i * 0.002);
    return { p: r.p, w: r.w, d: r.d, e: 2.9, right: _zRight, fwd: _zFwd };
  }), segments, false, false);
  // A raised rib at each band join, so it is plate and not a barrel.
  for (const y of [0.420, 0.300]) {
    const r = garmentRing(T, y, lift + 0.008);
    loftRings(g, [
      { p: new Vec3(0, y - 0.012, 0), w: r.w, d: r.d, e: 2.9, right: _zRight, fwd: _zFwd },
      { p: new Vec3(0, y + 0.012, 0), w: r.w, d: r.d, e: 2.9, right: _zRight, fwd: _zFwd },
    ], segments, false, false);
  }
  // A gorget at the throat.
  const neck = garmentRing(T, 0.487, lift - 0.014);
  loftRings(g, [
    { p: new Vec3(0, 0.487, 0), w: neck.w * 0.68, d: neck.d * 0.76, e: 2.6, right: _zRight, fwd: _zFwd },
    { p: new Vec3(0, 0.524, -0.004), w: neck.w * 0.60, d: neck.d * 0.70, e: 2.5, right: _zRight, fwd: _zFwd },
  ], segments, false, false);

  for (const sideName of ['L', 'R']) {
    const side = sideName === 'L' ? 1 : -1;
    g.part = sideName === 'L' ? PART.ARM_L : PART.ARM_R;
    skeleton.bones[skeleton.index('upperArm' + sideName)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerArm' + sideName)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('hand' + sideName)].bindMatrix.getTranslation(c);
    const r = build.shoulderCaps * 1.24;
    loftRings(g, [
      { p: new Vec3(a.x + side * 0.004, a.y + 0.070, a.z), w: r * 0.74, d: r * 0.82, e: 2.5 },
      { p: new Vec3(a.x + side * 0.014, a.y + 0.026, a.z), w: r, d: r * 0.98, e: 2.5 },
      { p: new Vec3(a.x + side * 0.020, a.y - 0.040, a.z), w: r * 0.90, d: r * 0.86, e: 2.4 },
    ], segments, true, false);
    const w0 = new Vec3().copy(b).lerp(c, 0.12), w1 = new Vec3().copy(b).lerp(c, 0.78);
    loftRings(g, [
      { p: w0, w: build.arm[2] + 0.030, d: build.arm[2] + 0.030, e: 2.6 },
      { p: w1, w: build.arm[3] + 0.026, d: build.arm[3] + 0.026, e: 2.6 },
    ], segments, true, true);

    g.part = sideName === 'L' ? PART.LEG_L : PART.LEG_R;
    skeleton.bones[skeleton.index('lowerLeg' + sideName)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('foot' + sideName)].bindMatrix.getTranslation(c);
    const s0 = new Vec3().copy(b).lerp(c, 0.10), s1 = new Vec3().copy(b).lerp(c, 0.80);
    loftRings(g, [
      { p: s0, w: build.leg[3] + 0.034, d: build.leg[3] + 0.036, e: 2.7 },
      { p: s1, w: build.leg[4] + 0.030, d: build.leg[4] + 0.032, e: 2.7 },
    ], segments, true, true);
  }
  g.part = PART.BODY;
  g.finalize();
  g.computeWeldGroups();
  smoothNormals(g);
  weldNormals(g.normals, g.weldGroups);
  return g;
}

/* Where a thrower can tear itself open, in bind-pose space. Five down the
   left flank working downward, then the face. Returned as data rather than
   geometry so the game can hang two actors on each — a wet cavity and the
   bone in it, which one mesh could only ever be one of. */
/* Where the holes go. Girth is not threaded in here on purpose: a wound
   spot is a place on the flank, and it is read back through the same
   base frame the caller asked for, so widening a character does not
   move a hole it does not have. */
function zombieWoundSpots(buildName) {
  const build = buildAtGirth(buildName, 1);
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

/* ---------------- and then it died ----------------

   The head has had a rot pass for a while: eyes sunk, temples caved,
   cheeks fallen, lips retreated. The BODY never did. So every zombie in
   the game was a healthy anatomical figure -- correct biceps, correct
   calf belly, correct shoulder-to-hip ratio -- wearing a corpse's head
   and a green material. That mismatch is most of what "they look
   middling" was: nothing below the jaw said dead.

   What actually happens to a body is that the soft tissue goes and the
   skeleton stops being an inference. So this works on the flesh only,
   after the limbs are lofted and before the normals are computed, and it
   does five things, all of them derived from position alone so they land
   correctly on four different builds without a table per build:

     - the muscle bellies waste, and the joints do not, which is what
       throws an elbow and a knee into relief without enlarging either
     - the ribs surface through the flank, deepest at the side and fading
       to nothing at the sternum and the spine, where there is bone
       immediately under the skin either way
     - the belly falls in toward the spine
     - the collarbones, the shoulder blades, the spine and the hip points
       come up proud
     - one side goes further than the other, seeded, so a crowd is a crowd

   `limbs` is the list of bone segments the flesh was lofted along; the
   caller has them already and passing them beats re-deriving them. */
function rotZombieBody(g, build, limbs, rot, seed) {
  const R = clamp(rot, 0, 1);
  if (R <= 0) return;
  const P = g.positions;
  const k = build.scale;
  const noise = new Noise(seed * 977 + 3);
  const lean = (seed % 5) / 4 - 0.5;          // which side went first
  const cp = new Vec3(), pv = new Vec3();

  for (let i = 0; i < P.length; i += 3) {
    let x = P[i], y = P[i + 1], z = P[i + 2];
    const sx = x >= 0 ? 1 : -1;
    /* How far gone this side is. A body does not decompose symmetrically
       and a symmetric one looks manufactured. */
    const S = R * (1 + sx * lean * 0.5);

    /* --- the limbs waste --- */
    pv.set(x, y, z);
    let near = null, nearD = 1e9, nearT = 0;
    for (const L of limbs) {
      closestPointOnSegment(pv, L.a, L.b, cp);
      const d = cp.distanceTo(pv);
      if (d < nearD) {
        nearD = d; near = L;
        const len = Math.max(L.a.distanceTo(L.b), 1e-5);
        nearT = clamp(L.a.distanceTo(cp) / len, 0, 1);
      }
    }
    if (near && nearD < near.r * 2.2) {
      /* Peaks at the middle of the bone and goes to zero at both ends, so
         a wasted forearm still meets a full-size elbow and wrist. That
         difference IS the read: a limb thinned evenly just looks thin. */
      const belly = Math.sin(nearT * PI);
      const pull = belly * belly * 0.30 * S;
      closestPointOnSegment(pv, near.a, near.b, cp);
      x += (cp.x - x) * pull; y += (cp.y - y) * pull; z += (cp.z - z) * pull;
      /* And the tendons stand out where there is no muscle to hide them:
         a shallow corrugation along the bone, strongest at the ends. */
      const cord = noise.fbm(x * 26, y * 26, z * 26, 2) * (1 - belly) * 0.0045 * S;
      const dx = x - cp.x, dy = y - cp.y, dz = z - cp.z;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      x += (dx / dl) * cord; y += (dy / dl) * cord; z += (dz / dl) * cord;
    }

    /* --- the trunk --- *
       Everything below is gated to the trunk by position: the arms hang
       outboard of 0.22 and the legs start below the hips, so a spatial
       gate needs no per-vertex part array and cannot get out of step with
       one. */
    const inTrunk = Math.abs(x) < 0.235 * k && y > -0.075 && y < 0.545;
    if (inTrunk) {
      const rad = Math.sqrt(x * x + z * z) || 1e-5;
      const ux = x / rad, uz = z / rad;
      /* Where round the trunk this vertex is. 0 at the sternum, 1 at the
         flank, back to 0 at the spine -- the two places where bone is
         directly under skin and there is nothing to fall in. */
      const round = Math.abs(ux);
      const front = clamp(uz, 0, 1);
      const back = clamp(-uz, 0, 1);

      // Ribs: six of them, surfacing through the flank.
      const ribBand = smoothstep(0.255, 0.310, y) * (1 - smoothstep(0.455, 0.500, y));
      if (ribBand > 0) {
        const rib = Math.cos((y - 0.262) * (PI * 2 / 0.0345));
        // Sharp troughs, soft crests: the gaps between ribs are what you
        // see, not the ribs themselves.
        const cut = -Math.max(0, -rib) * 0.5 - rib * 0.5 + 0.5;
        const amp = ribBand * round * (0.4 + front * 0.6) * 0.0135 * S;
        x -= ux * cut * amp; z -= uz * cut * amp;
      }

      // The belly falls in toward the spine.
      const gut = smoothstep(-0.010, 0.070, y) * (1 - smoothstep(0.175, 0.265, y));
      z -= front * gut * 0.052 * S * k;
      x -= ux * front * gut * 0.016 * S * k;

      // Sternum: a ridge left standing between the two fallen sides.
      const stern = smoothstep(0.285, 0.330, y) * (1 - smoothstep(0.460, 0.505, y))
        * (1 - smoothstep(0.020, 0.062, Math.abs(x)));
      z += stern * front * 0.010 * S;

      // Collarbones, running out from the notch to each shoulder.
      const clav = (1 - smoothstep(0.014, 0.030, Math.abs(y - 0.470 - Math.abs(x) * 0.055)))
        * smoothstep(0.012, 0.045, Math.abs(x)) * (1 - smoothstep(0.130, 0.180, Math.abs(x)));
      z += clav * front * 0.0115 * S;

      // Shoulder blades on the back, and the spine down the middle of it.
      const scap = smoothstep(0.315, 0.360, y) * (1 - smoothstep(0.440, 0.485, y))
        * smoothstep(0.028, 0.070, Math.abs(x)) * (1 - smoothstep(0.115, 0.165, Math.abs(x)));
      z -= scap * back * 0.0125 * S;
      const spineY = 0.5 + 0.5 * Math.cos((y + 0.06) * (PI * 2 / 0.052));
      const spine = (1 - smoothstep(0.012, 0.042, Math.abs(x)))
        * smoothstep(0.020, 0.090, y) * (1 - smoothstep(0.440, 0.510, y));
      z -= spine * back * (0.006 + spineY * 0.006) * S;

      // Hip points.
      const ilium = (1 - smoothstep(0.020, 0.055, Math.abs(y + 0.012)))
        * smoothstep(0.075, 0.115, Math.abs(x)) * (1 - smoothstep(0.150, 0.200, Math.abs(x)));
      x += ux * ilium * 0.009 * S; z += uz * ilium * 0.006 * S;
    }

    /* And the skin dries: a fine ridging over everything, stronger the
       further gone the body is. The head pass does the same thing, at the
       same frequencies, so the two surfaces match where they meet. */
    const dry = noise.fbm(x * 9.0, y * 9.0, z * 9.0, 3) * 0.0026 * (1 + R * 2.2)
      + noise.fbm(x * 27.0, y * 27.0, z * 27.0, 2) * 0.0016 * R;
    const nl = Math.sqrt(x * x + z * z) || 1;
    x += (x / nl) * dry; z += (z / nl) * dry;

    P[i] = x; P[i + 1] = y; P[i + 2] = z;
  }
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
  const build = buildAtGirth(opts.build, opts.girth);
  const rng = new Rng((opts.seed || 7) * 3 + 11);

  const outfit = jitterOutfit(OUTFITS[opts.outfit] || null, opts.outfit, opts.seed);
  g.part = PART.BODY;
  buildZombieGarment(g, build, rng, segments, outfit);
  if (outfit) {
    /* Every piece is its own closed shell, and together they leave no bare
       skin anywhere between the collar and the shoes. */
    /* The yoke was emitted with no tint set, so it took whatever the
       colour buffer was left on -- which after the garment is cleared,
       meaning white. Every dressed body in the game, the five zombie
       outfits included, has had two white pads on its shoulders. It is
       part of the shirt and it is painted the shirt's colour. */
    g.setColor(outfit.top.color);
    buildShoulderYoke(g, skeleton, build, 0.019, segments);
    g.setColor(null);
    buildZombieLimbCloth(g, skeleton, build, rng, segments, outfit);
    buildTrousers(g, skeleton, build, rng, segments, outfit.bottom);
    buildShoes(g, skeleton, build, segments, outfit.shoes);
    if (outfit.belt) buildDutyBelt(g, build, outfit);
    if (outfit.hat) buildCap(g, skeleton, segments, outfit.hat);
    if (outfit.wire) buildBarbwire(g, build, rng);
    g.part = PART.BODY;
  } else {
    buildZombieLimbCloth(g, skeleton, build, rng, segments);
    g.part = PART.BODY;
    buildGarmentDetail(g, skeleton, build, rng);
    g.part = PART.BODY;
    /* Boots on the ones without a named outfit too. They had none: the
       foot geometry is fine -- 277 mm long and 100 wide, which is a
       shoe -- but it lives in the FLESH mesh, so an undressed zombie
       walked around on two bare pale-green flippers that read, against
       dark trouser legs, as the biggest thing in the silhouette. Nobody
       died barefoot. A worn work boot, in one of four colours off the
       same seed that picks everything else. */
    const BOOTS = [
      { kind: 'boot', color: 0x35291f, sole: 0x241d17 },
      { kind: 'boot', color: 0x2b2b2e, sole: 0x1d1d20 },
      { kind: 'boot', color: 0x463524, sole: 0x2a211a },
      { kind: 'boot', color: 0x3a3a33, sole: 0x25251f },
    ];
    buildShoes(g, skeleton, build, segments, BOOTS[(opts.seed || 7) % BOOTS.length]);
    g.part = PART.BODY;
    if (opts.build === 'armored') buildWebbing(g, build);
  }

  g.finalize();
  g.computeWeldGroups();
  smoothNormals(g);
  weldNormals(g.normals, g.weldGroups);
  /* And on the clothes, where it does the most obvious work of all: a
     collar, a cuff, a lapel and the inside of a torn opening are all
     cavities, and without this a coat is one flat colour with creases
     drawn on it. Gentler than the flesh -- cloth is a shell a few
     millimetres off the body, so a hard AO would band along every seam. */
  bakeCavityAO(g, { radius: 0.070, strength: 0.62, floor: 0.42, samples: 700 });
  // Then the dirt, over the top of it.
  grimeCloth(g, rng, opts.seed || 7);
  return g;
}

/* ---------------- grime ----------------

   Nothing in this game has been indoors for eighty-five years, and every
   garment on every zombie was showroom clean -- which reads as costume,
   not as clothing, and is most of why the dressed variants looked like
   fancy dress next to the filthy map they walk across.

   Dirt is not distributed evenly. It climbs a trouser leg from the hem,
   collects at the knee and the seat and the cuff, and turns up as
   splashes wherever something was walked through. So the tint is a
   function of height with patches over it, multiplied into the vertex
   colour after the cavity pass so a soiled hem is dark AND occluded
   rather than one or the other.

   It darkens and browns together: mud takes blue out of a colour before
   it takes red, which is why a lightly muddied garment goes warm and a
   heavily muddied one goes brown, and why simply multiplying every
   channel equally just looks like the light went out. */
function grimeCloth(g, rng, seed) {
  const P = g.positions, C = g.colors;
  if (!C) return;
  const noise = new Noise((seed || 7) * 41 + 19);
  const n = P.length / 3;
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    // Up from the hem: everything below the waist, hardest at the ankle.
    const low = 1 - smoothstep(-0.55, 0.20, y);
    // Splashes and hand-wear, at two scales.
    const splash = noise.fbm(x * 7.0, y * 5.0, z * 7.0, 3) * 0.5 + 0.5;
    const wear = noise.fbm(x * 19.0, y * 15.0, z * 19.0, 2) * 0.5 + 0.5;
    /* Knees and the seat: a band that catches whatever the legs went
       through, independent of how low down the garment reaches. */
    const knee = (1 - smoothstep(0.06, 0.20, Math.abs(y + 0.36))) * 0.5;
    let k = low * (0.42 + splash * 0.70) + knee * splash * 1.3 + wear * 0.16;
    k = Math.min(0.88, k);
    C[v * 3] *= 1 - k * 0.52;
    C[v * 3 + 1] *= 1 - k * 0.61;
    C[v * 3 + 2] *= 1 - k * 0.74;
  }
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
    g.part = sideName === 'L' ? PART.ARM_L : PART.ARM_R;
    skeleton.bones[skeleton.index('lowerArm' + sideName)].bindMatrix.getTranslation(e);
    skeleton.bones[skeleton.index('hand' + sideName)].bindMatrix.getTranslation(w);
    const cuffAt = new Vec3().copy(e).lerp(w, 0.80);
    const cuffEnd = new Vec3().copy(e).lerp(w, 0.94);
    loftRings(g, [
      { p: cuffAt, w: build.arm[4] + 0.016, d: build.arm[4] + 0.016, e: 2.2 },
      { p: cuffEnd, w: build.arm[4] + 0.013, d: build.arm[4] + 0.013, e: 2.2 },
    ], 12, true, true);

    g.part = sideName === 'L' ? PART.LEG_L : PART.LEG_R;
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
  const build = buildAtGirth(opts.build, opts.girth);
  const rng = new Rng(opts.seed || 7);

  // Flesh.
  const rings = build.torso.map(([y, w, d, e, zo], i) => ({
    p: new Vec3(0, y, zo || 0), w, d, e, uv: i / (build.torso.length - 1),
  }));
  g.part = PART.BODY;
  loftRings(g, rings, segments, true, true);
  g.part = PART.NECK;
  buildZombieNeck(g, segments, build);
  g.part = PART.BODY;
  if (build.bust) buildBust(g, build);
  if (build.shoulderCaps) buildShoulderCaps(g, skeleton, build);

  const a = new Vec3(), b = new Vec3(), c = new Vec3();
  /* Every bone the flesh is lofted along, kept so the rot pass can waste
     the muscle between the joints without re-deriving any of it. `r` is
     roughly how far the flesh reaches from that bone, which is what tells
     a torso vertex from a limb one. */
  const limbs = [];
  for (const sideName of ['L', 'R']) {
    const side = sideName === 'L' ? 1 : -1;
    g.part = sideName === 'L' ? PART.ARM_L : PART.ARM_R;
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
    /* Six rings a segment, not four. The skin solver weights a vertex by
       which bone it is nearest, so a ring sitting alone at a joint gets
       split half and half between the two bones and collapses into the
       chord the moment the joint closes — which is what turned a bent arm
       into a flat sheet from shoulder to hand. Rings either side of the
       hinge stay dominated by one bone each and hold the limb open. */
    const up = limbRings(root, b, [
      [build.arm[0] * 1.16, build.arm[0] * 1.16, 2.0],
      [build.arm[0] * 1.09, build.arm[0] * 1.09, 2.0],
      [build.arm[0] * 1.02, build.arm[0] * 1.02, 2.0],
      [build.arm[1] * 1.10, build.arm[1] * 1.10, 2.0],
      [build.arm[1] * 1.02, build.arm[1] * 1.02, 2.0],
      [build.arm[1] * 0.92, build.arm[1] * 0.92, 2.0],
    ]);
    const lo = limbRings(b, c, [
      [build.arm[2] * 1.02, build.arm[2] * 1.02, 2.0],
      [build.arm[2] * 1.09, build.arm[2] * 1.09, 2.0],
      [build.arm[2] * 1.12, build.arm[2] * 1.12, 2.0],
      [build.arm[2] * 1.02, build.arm[2] * 1.02, 2.0],
      [build.arm[3], build.arm[3], 2.0],
      [build.arm[4], build.arm[4] * 1.06, 2.1],
    ]);
    loftRings(g, up.concat(lo.slice(1)), segments, false, false);
    limbs.push({ a: root.clone(), b: b.clone(), r: build.arm[0] * 1.16 },
      { a: b.clone(), b: c.clone(), r: build.arm[2] * 1.12 });
    /* An elbow. A limb lofted straight through its joint pinches to a
       crease the moment the skin solver bends it — there is nothing at the
       hinge to hold the volume. A ball at the joint is what keeps an arm
       an arm through its whole range. */
    buildJoint(g, b, build.arm[1] * 1.04);
    /* Hooked. A dead hand is pulled into a claw by its own tendons, and
       a claw is also what reaching through a window looks like -- the
       open paddle a living hand gets would read as waving. */
    buildHand(g, side, c, segments, 0.62);

    g.part = sideName === 'L' ? PART.LEG_L : PART.LEG_R;
    skeleton.bones[skeleton.index('upperLeg' + sideName)].bindMatrix.getTranslation(a);
    skeleton.bones[skeleton.index('lowerLeg' + sideName)].bindMatrix.getTranslation(b);
    skeleton.bones[skeleton.index('foot' + sideName)].bindMatrix.getTranslation(c);
    /* Thigh full at the top, knee narrow, calf belly behind the shin, thin
       at the ankle. Same reasoning as the arm. */
    const th = limbRings(a, b, [
      [build.leg[0] * 1.06, build.leg[0] * 1.06, 2.2],
      [build.leg[0] * 0.99, build.leg[0] * 0.99, 2.2],
      [build.leg[1], build.leg[1], 2.2],
      [build.leg[2] * 1.08, build.leg[2] * 1.08, 2.1],
      [build.leg[2] * 1.04, build.leg[2] * 1.04, 2.1],
      [build.leg[2] * 0.94, build.leg[2] * 0.96, 2.1],
    ]);
    const sh = limbRings(b, c, [
      [build.leg[2] * 0.98, build.leg[2] * 1.02, 2.1],
      [build.leg[3] * 1.08, build.leg[3] * 1.16, 2.1],
      [build.leg[3] * 1.12, build.leg[3] * 1.22, 2.1],
      [build.leg[3] * 1.00, build.leg[3] * 1.06, 2.1],
      [build.leg[3] * 0.92, build.leg[3] * 0.96, 2.1],
      [build.leg[4], build.leg[4], 2.1],
    ], (t) => -0.014 * Math.sin(t * PI));
    loftRings(g, th.concat(sh.slice(1)), segments, false, false);
    limbs.push({ a: a.clone(), b: b.clone(), r: build.leg[0] * 1.06 },
      { a: b.clone(), b: c.clone(), r: build.leg[3] * 1.22 });
    buildJoint(g, b, build.leg[2] * 1.06);          // knee
    buildJoint(g, a, build.leg[0] * 0.92);          // hip socket
    buildShoe(g, side, skeleton, segments);
  }
  g.part = PART.BODY;

  /* Decomposition, over the finished flesh. Before finalize, so the
     normals are computed from the sculpted surface rather than from the
     healthy one -- displace after they are computed and the ribs are
     invisible however deep they are cut. Same default as the head takes,
     off the same seed, so a body and its face are equally far gone. */
  rotZombieBody(g, build, limbs,
    opts.rot != null ? opts.rot : 0.55 + (((opts.seed || 5) * 7) % 9) / 20,
    opts.seed || 5);

  g.finalize();
  g.computeWeldGroups();
  smoothNormals(g);
  weldNormals(g.normals, g.weldGroups);
  /* The same contact shading the face gets. On a body it is the armpit,
     the hollow between the ribs the rot pass just cut, the inside of the
     elbow and the knee, and the gaps between the fingers -- the places
     that were rendering exactly as bright as the shoulder on top of
     them. A wider radius than the head, because the cavities are. */
  bakeCavityAO(g, { radius: 0.085, strength: 0.85, floor: 0.30, samples: 800 });
  return g;
}

/* Blood is a second mesh over the same skeleton, so it can be its own
   material and still move with the body. */
function buildZombieBloodGeometry(skeleton, opts = {}) {
  const g = new Geometry();
  const build = buildAtGirth(opts.build, opts.girth);
  buildBloodStains(g, build, new Rng((opts.seed || 7) * 13 + 5));
  g.finalize();
  g.computeWeldGroups();
  smoothNormals(g);
  weldNormals(g.normals, g.weldGroups);
  return g;
}
