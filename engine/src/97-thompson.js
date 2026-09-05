/* ============================================================
   THOMPSON — an M1A1 submachine gun, dimensioned from the spec.

     overall length  32.0 in   0.8128     barrel   10.5 in  0.2667
     weight           10 lb    ~4.5 kg    calibre  .45 ACP

   Same datum convention as the 1911 (96-pistol.js): Y = 0 is the
   bore axis, +X runs to the muzzle, +Z is the weapon's right.
   The sweep toolkit — profileOutline, sweepPath, ringOutline,
   roundRect, hardBox — is shared with that module.

   M1A1 pattern deliberately: side charging handle, plain barrel
   with no cooling fins, no compensator, fixed L rear sight, stick
   magazine. The drum is the gangster gun; the stick is the war.
   ============================================================ */

const TOMMY = {
  overall: 0.8128,
  barrelLen: 0.2667,
  muzzle: 0.5200,            // receiver front + barrel
  receiverFront: 0.2533,
  receiverRear: -0.0134,
  stockButt: -0.2928,
  recHalfW: 0.0190,          // 1.5 in receiver slab
  recUp: 0.0215,
  recDown: 0.0180,
};

/* The wooden furniture and the steel are separate geometries so the
   gun is two materials and two draw calls: blued steel and walnut. */

function buildTommySteel(g) {
  const U = new Vec3(0, 1, 0), V = new Vec3(0, 0, 1);
  const T = TOMMY;

  /* Receiver: a milled slab, flat sides, rounded top corners, flatter
     bottom. One section dragged the whole length, stepped slightly
     lower behind the barrel. */
  const rec = (x, opts = {}) => ({
    o: new Vec3(x, 0.0018, 0), u: U, v: V,
    pts: roundRect(T.recUp * (opts.top || 1), T.recDown, T.recHalfW, 3.2, 24),
  });
  sweepPath(g, [
    rec(T.receiverRear),
    rec(T.receiverRear + 0.030),
    rec(0.130),
    rec(0.190, { top: 0.96 }),
    rec(T.receiverFront, { top: 0.90 }),
  ], true, true);

  /* Lower frame: shallower slab hung under the receiver carrying the
     trigger group, mag well and grip mounts. */
  const low = (x, depth) => ({
    o: new Vec3(x, -0.012, 0), u: U, v: V,
    pts: roundRect(0.004, depth, T.recHalfW * 0.88, 2.8, 20),
  });
  sweepPath(g, [
    low(0.000, 0.030),
    low(0.060, 0.034),
    low(0.120, 0.034),
    low(0.170, 0.026),
    low(T.receiverFront - 0.010, 0.020),
  ], true, true);

  /* Barrel, tapering, with a step at the receiver. */
  const ring = (x, r) => ({ o: new Vec3(x, 0, 0), u: U, v: V, pts: ringOutline(r, 22) });
  sweepPath(g, [
    ring(T.receiverFront - 0.002, 0.0140),
    ring(T.receiverFront + 0.018, 0.0140),
    ring(T.receiverFront + 0.022, 0.0116),
    ring(T.muzzle - 0.030, 0.0098),
    ring(T.muzzle, 0.0096),
  ], false, false);
  // Muzzle face as an annulus around a recessed bore, exactly the 1911's
  // trick: a capped disc would hide the hole.
  {
    const br = 0.0057;                         // .45 bore
    const outR = ringOutline(0.0096, 22), inR = ringOutline(br, 22);
    const X = T.muzzle, base = g.positions.length / 3;
    for (const p of outR) g.vert(X, p[0], p[1], 1, 0, 0, p[0] * 5, p[1] * 5);
    for (const p of outR) {
      const th = Math.atan2(p[1], p[0]);
      g.vert(X, br * Math.cos(th), br * Math.sin(th), 1, 0, 0, 0, 0);
    }
    const n = outR.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      g.quad(base + i, base + j, base + n + j, base + n + i);
    }
    // Bore walls, inward-facing, and a floor.
    const b2 = g.positions.length / 3;
    for (const p of inR) g.vert(X, p[0], p[1], 0, -p[2], -p[3], p[0] * 5, p[1] * 5);
    for (const p of inR) g.vert(X - 0.03, p[0], p[1], 0, -p[2], -p[3], p[0] * 5, p[1] * 5);
    const m = inR.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      g.quad(b2 + i, b2 + j, b2 + m + j, b2 + m + i);
    }
    const cb = g.positions.length / 3;
    const c = g.vert(X - 0.03, 0, 0, 1, 0, 0, 0, 0);
    for (const p of inR) g.vert(X - 0.03, p[0], p[1], 1, 0, 0, p[0] * 5, p[1] * 5);
    for (let i = 0; i < m; i++) g.tri(c, cb + 1 + i, cb + 1 + (i + 1) % m);
  }

  /* Front sight blade on its base. Its tip is set level with the rear
     aperture's centre (recUp + 0.0040 = 0.0255): a front sight that does
     not share a line with the rear one cannot be aimed with, however
     correct each is on its own. */
  hardBox(g, T.muzzle - 0.014, 0.0143, 0, 0.0060, 0.0048, 0.0048);
  hardBox(g, T.muzzle - 0.014, 0.0223, 0, 0.0016, 0.0032, 0.0012);

  /* Rear sight: the M1A1's stamped L peep between two protective wings.

     The leaf was one solid box 8.8 mm tall and 20.8 mm wide sitting exactly
     on the sight line — a peep with no hole in it, which is a steel plate
     welded across your aim. It is the whole of "you cannot see through the
     iron sights", and the same mistake is easy to make on every gun here
     because a sight modelled as one hardBox looks right from outside and is
     a wall from behind.

     A frame instead: two uprights and a bridge over the top, leaving a
     3.4 mm aperture centred on the line. */
  const rx = T.receiverRear + 0.0210;
  hardBox(g, rx, T.recUp + 0.0048, 0.0125, 0.0075, 0.0052, 0.0022);   // wings
  hardBox(g, rx, T.recUp + 0.0048, -0.0125, 0.0075, 0.0052, 0.0022);
  const ap = 0.0034;                                     // aperture half-size
  const ay = T.recUp + 0.0040;
  for (const sz of [-1, 1]) {                            // uprights
    hardBox(g, rx, ay, sz * (ap + 0.0022), 0.0016, 0.0044, 0.0022);
  }
  hardBox(g, rx, ay + ap + 0.0016, 0, 0.0016, 0.0016, ap + 0.0044);   // bridge
  hardBox(g, rx, ay - ap - 0.0016, 0, 0.0016, 0.0016, ap + 0.0044);   // and the base

  // Its track stays with the receiver; the handle itself reciprocates and
  // lives in its own geometry.
  hardBox(g, 0.050, 0.0090, T.recHalfW + 0.0002, 0.055, 0.0028, 0.0008);

  /* Selector and safety levers, left side. */
  for (const lx of [0.010, 0.038]) {
    sweepPath(g, [
      { o: new Vec3(lx, -0.004, -T.recHalfW * 0.86), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0036, 12) },
      { o: new Vec3(lx, -0.004, -T.recHalfW * 0.86 - 0.0062), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0036, 12) },
    ], false, true);
  }


  /* Trigger guard and serrated trigger. */
  const guardPts = [
    [0.052, -0.0455], [0.056, -0.0560], [0.068, -0.0640], [0.084, -0.0660],
    [0.100, -0.0635], [0.110, -0.0560], [0.113, -0.0465],
  ];
  const guard = guardPts.map(([x, y], i) => {
    const p = guardPts[Math.max(0, i - 1)], q = guardPts[Math.min(guardPts.length - 1, i + 1)];
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
    return { o: new Vec3(x, y, 0), u: new Vec3(-dy / L, dx / L, 0), v: V, pts: roundRect(0.0022, 0.0022, 0.0046, 2.5, 12) };
  });
  sweepPath(g, guard, true, true);
  // Trigger, faced with three ridges — serrated, not smooth.
  hardBox(g, 0.081, -0.0530, 0, 0.0024, 0.0078, 0.0038);
  for (const ty of [-0.0505, -0.0530, -0.0555]) {
    hardBox(g, 0.0835, ty, 0, 0.0007, 0.0009, 0.0034);
  }

  /* Butt plate, and the sling loop under the stock wrist. */
  hardBox(g, T.stockButt - 0.0022, -0.0560, 0, 0.0025, 0.0575, 0.0195);
  const loop = (x, y) => {
    sweepPath(g, [
      { o: new Vec3(x, y, -0.0035), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0028, 10) },
      { o: new Vec3(x, y, 0.0035), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0028, 10) },
    ], true, true);
  };
  loop(-0.205, -0.0895);   // resting against the stock's belly
  loop(0.360, -0.0395);    // under the foregrip, touching it
}

/* The charging handle, on its own so it can ride back with each shot. */
function buildTommyBolt(g) {
  const U = new Vec3(0, 1, 0), T = TOMMY;
  sweepPath(g, [
    { o: new Vec3(0.085, 0.0090, T.recHalfW - 0.002), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0058, 14) },
    { o: new Vec3(0.085, 0.0090, T.recHalfW + 0.0105), u: U, v: new Vec3(1, 0, 0), pts: ringOutline(0.0058, 14) },
  ], false, true);
}

/* Magazine: a 30-round stick, stamped ribs up each face. */
function buildTommyMag(g) {
  const V = new Vec3(0, 0, 1);
  const magAxis = new Vec3(0.045, -1, 0).normalize();
  const magU = new Vec3().crossVectors(V, magAxis).normalize();
  const magAt = (d, grow) => ({
    o: new Vec3(0.148 + magAxis.x * d, -0.040 + magAxis.y * d, 0),
    u: magU, v: V,
    pts: roundRect(0.0148 * grow, 0.0148 * grow, 0.0102 * grow, 2.7, 18),
  });
  sweepPath(g, [magAt(0, 1.06), magAt(0.012, 1.06), magAt(0.014, 1.0), magAt(0.165, 1.0), magAt(0.172, 1.02)], true, true);
  hardBox(g, 0.148 + magAxis.x * 0.09, -0.040 - 0.09, 0.0104, 0.0022, 0.055, 0.0007);
  hardBox(g, 0.148 + magAxis.x * 0.09, -0.040 - 0.09, -0.0104, 0.0022, 0.055, 0.0007);
}

function buildTommyWood(g) {
  const U = new Vec3(0, 1, 0), V = new Vec3(0, 0, 1);
  const T = TOMMY;

  /* Buttstock: tall at the butt, tapering to the wrist, with real drop —
     the comb falls away from the bore line, which is most of a rifle
     silhouette. Swept butt-to-receiver so the frame matches the receiver's. */
  const stock = (x, cy, up, down, hw) => ({
    o: new Vec3(x, cy, 0), u: U, v: V, pts: roundRect(up, down, hw, 2.35, 22),
  });
  sweepPath(g, [
    stock(T.stockButt, -0.0560, 0.0530, 0.0530, 0.0180),
    stock(T.stockButt + 0.055, -0.0510, 0.0500, 0.0480, 0.0172),
    stock(-0.155, -0.0395, 0.0430, 0.0330, 0.0160),
    stock(-0.085, -0.0270, 0.0330, 0.0210, 0.0150),
    stock(-0.038, -0.0175, 0.0245, 0.0140, 0.0146),
    stock(-0.012, -0.0150, 0.0220, 0.0125, 0.0142),
  ], true, true);

  /* Pistol grip, raked back hard the way a Thompson's is. */
  const gripAxis = new Vec3(-0.42, -1, 0).normalize();
  const gripU = new Vec3().crossVectors(V, gripAxis).normalize();
  const gripAt = (d, up, hb, hw) => ({
    o: new Vec3(0.030 + gripAxis.x * d, -0.040 + gripAxis.y * d, 0),
    u: gripU, v: V,
    pts: roundRect(up, hb, hw, 2.5, 18),
  });
  sweepPath(g, [
    gripAt(0.000, 0.0210, 0.0210, 0.0135),
    gripAt(0.030, 0.0165, 0.0180, 0.0128),
    gripAt(0.062, 0.0155, 0.0175, 0.0128),
    gripAt(0.086, 0.0165, 0.0195, 0.0132),   // flare at the heel
  ], true, true);

  /* Horizontal foregrip under the barrel — the M1A1's, not the 1928
     vertical broomhandle. Grooved: three finger scallops read as one. */
  const fore = (x, r) => ({
    o: new Vec3(x, -0.0195, 0), u: U, v: V, pts: roundRect(r * 0.72, r, 0.0146, 2.3, 18),
  });
  sweepPath(g, [
    fore(0.262, 0.0165),
    fore(0.285, 0.0185),
    fore(0.320, 0.0192),
    fore(0.355, 0.0192),
    fore(0.395, 0.0180),
    fore(0.422, 0.0150),
  ], true, true);
}

/* ---------------- engine hook ---------------- */

const TOMMY_MATERIALS = {
  // Blued steel is nearly black until light rakes it. Roughness sits above
  // the 1911's polish: wartime parkerised-blue, not a show finish.
  // Parkerised, but a metal all the same: see the note on ARM_MAT.blued.
/* Metal colours here are REFLECTANCES, not paint.
 *
 * With metalness 1 the shader uses the colour as F0 and there is no
 * diffuse term at all, and the ambient a metal gets indoors reduces to
 * roughly `room * envBRDFApprox(F0, rough, NoV)` -- which face-on is
 * about `room * F0`. So a colour chosen for how the finish looks in a
 * paint chart, rather than for how much light steel actually reflects,
 * comes out black on any face the lamps do not glint off.
 *
 * The Thompson's magazine was the proof: a large flat panel at 0x4d565f,
 * which is 0.10 linear where iron is 0.5 to 0.6, rendering as a pure
 * black rectangle with no gradient anywhere on it. Real blued and
 * parkerised steel is dark because the oxide is a thin absorbing film
 * over the metal, not because the metal stopped being a mirror.
 *
 * These are the five that were physically impossible for a conductor --
 * all under 0.12 linear. Same hues, same order from darkest to lightest,
 * moved up to where steel actually sits. The others in this game already
 * run 0x848c95 to 0xc2c8ce and are left alone.
 */
  steel: { color: 0x6b7078, texture: 'metal', roughness: 0.44, metalness: 1 },
  /* uvScale 5, not 18.
   *
   * On a swept section U runs AROUND the cross-section and V along the
   * sweep, so at 18 repeats the grain wraps helically and a stock comes
   * out banded diagonally in cream and tan -- a barber's pole, not wood.
   * It is on every wooden part in the game. Five repeats over a forearm
   * puts the figure along the piece, which is the way a stock is cut. */
  wood: { color: 0x5c4028, texture: 'wood', roughness: 0.66, metalness: 0, uvScale: 5 },
};

function makeThompson() {
  const steel = new Geometry();
  buildTommySteel(steel);
  const wood = new Geometry();
  buildTommyWood(wood);
  const bolt = new Geometry();
  buildTommyBolt(bolt);
  const mag = new Geometry();
  buildTommyMag(mag);
  // Origin at the pistol grip, matching the 1911's hand-centred datum.
  const origin = new Vec3(0.030, -0.070, 0);
  return {
    steel: offsetGeometry(steel, origin).finalize(),
    wood: offsetGeometry(wood, origin).finalize(),
    bolt: offsetGeometry(bolt, origin).finalize(),
    mag: offsetGeometry(mag, origin).finalize(),
  };
}

Engine.prototype.thompson = function (opts = {}) {
  let parts = this._tommyParts;
  if (!parts) parts = this._tommyParts = makeThompson();
  /* Register the CPU-side meshes where every other weapon puts them, so
     the sight-line test can reach this one too. The Thompson is the gun
     whose rear peep shipped as a solid plate; leaving it out of the test
     that catches exactly that would be a poor joke. */
  (this._armParts || (this._armParts = {})).thompson = parts;

  const b = parts.steel.bounds;
  const pts = [];
  for (const x of [b.min.x, b.max.x]) {
    for (const y of [b.min.y, b.max.y]) {
      for (const z of [b.min.z, b.max.z]) pts.push(new Vec3(x, y, z));
    }
  }
  const shape = opts.physics === false ? null : Shape.convex(pts);
  const body = this._spawn(
    Object.assign({}, opts, {
      material: opts.material || TOMMY_MATERIALS.steel,
      mass: opts.mass != null ? opts.mass : 4.5,
    }),
    this._mesh('tommy:steel', () => parts.steel), shape, 0.6);
  body.name = opts.name || 'thompson';

  const wood = this._spawn(
    { material: opts.woodMaterial || TOMMY_MATERIALS.wood, physics: false },
    this._mesh('tommy:wood', () => parts.wood), null, 0.6);
  wood.parent = body;
  body.wood = wood;

  const child = (suffix, geo, mat) => {
    const a = this._spawn({ material: mat, physics: false },
      this._mesh('tommy:' + suffix, () => geo), null, 0.6);
    a.parent = body;
    return a;
  };
  body.slide = child('bolt', parts.bolt, opts.material || TOMMY_MATERIALS.steel);
  body.mag = child('mag', parts.mag, opts.material || TOMMY_MATERIALS.steel);
  body.ejectPort = [0.0700, 0.0930, 0.0210];
  body.magWell = [0.1180, -0.0300, 0];
  body.slideTravel = 0.030;
  body.boreAt = 0.070;                 // the origin sits 70 mm under the bore
  body.muzzleAt = TOMMY.muzzle + 0.030;
  body.sightAt = TOMMY.recUp + 0.0040 + 0.070;
  return body;
};
