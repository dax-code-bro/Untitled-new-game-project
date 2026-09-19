/* ==================================================================
   SERVICE ARMS — ONE BUILDER, THIRTY-FIVE GUNS
   ==================================================================
   Every assault rifle, submachine gun and light machine gun in
   multiplayer is built here, from a table.

   WHY A TABLE AND NOT THIRTY-FIVE MODELS

   Because they ARE a table. An STG 44, an AK-47 and an M4 are the same
   nine objects in different proportions: a barrel, a receiver, a
   handguard round the barrel, a pistol grip under the back of the
   receiver, a trigger in a bow, a magazine hanging out of the bottom, a
   stock behind, a front sight near the muzzle and a rear sight near the
   eye. What makes one an AK and another an M4 is where those nine
   things are and how big they are -- not that either of them has a part
   the other has not.

   Hand-modelling thirty-five of them would be thirty-five chances to
   get a trigger guard wrong, and thirty-five places to fix it when the
   hand solve says the finger will not reach. Here there is one trigger
   guard, and moving it moves it on every gun that has one.

   This is the same shape RIFLE_KINDS in 97a-arms.js already uses for
   the two bolt rifles; it is that idea taken as far as it goes.

   THE AXES, which every number below is in:

     +X   toward the muzzle          the bore is the X axis, at y = 0
     +Y   up                         sights are at positive y
     +Z   across, to the right       the gun is symmetric about z = 0

   Metres throughout. `origin` is subtracted at the end so the model's
   pivot lands where the firing hand goes, which is what the viewmodel
   and the hand solve both expect.
   ================================================================== */

/* ---------------- the pieces ---------------- */

/* A rounded box swept down the X axis: [[x, up, down, halfWidth, e], ...]
   The exponent `e` is how square the corners are -- 2 is an ellipse, 8
   is very nearly a rectangle. Receivers are about 3.2; a pressed steel
   one is nearer 5. */
function svcSlab(g, pts, z = 0, capA = true, capB = true, y = 0) {
  sweepPath(g, pts.map(function (p) {
    return ax(p[0], roundRect(p[1], p[2], p[3], p[4] || 3.2, 22), y, z);
  }), capA, capB);
}

/* How high the gun's top surface is at a given x: the receiver where
   there is one, the jacket where there is one, and otherwise the
   barrel's own tapering radius. Anything bolted on top needs this --
   a bracket drawn to a fixed height is a bracket drawn to thin air on
   every weapon whose proportions differ from the one it was tuned on. */
function svcTopAt(K, x) {
  const R = K.rec, B = K.barrel;
  if (x <= R.front) return R.up;
  if (B.shroud && x >= B.shroudX0 && x <= B.shroudX1) return B.shroudR;
  /* And a tube handguard, which is the M60's case: its carry handle
     spans 0.150 to 0.250 and its handguard 0.110 to 0.240, so a
     bracket drawn to the bare barrel starts INSIDE the handguard. */
  if (K.hg && K.hg.kind === 'tube' && x >= K.hg.x0 && x <= K.hg.x1) return K.hg.r;
  /* Matching svcBarrel exactly: r0 out to the step, then r1. */
  if (B.step != null && x <= B.step) return B.r0;
  if (B.step != null) return B.r1;
  const span = Math.max(0.001, K.muzzle - R.front);
  const t = Math.max(0, Math.min(1, (x - R.front) / span));
  return B.r0 + (B.r1 - B.r0) * t;
}

function svcBarrel(g, K) {
  const B = K.barrel;
  /* A MINIGUN HAS SIX BARRELS AND NOT A SEVENTH AROUND THEM.
   *
     svcRotary builds the cluster -- six tubes on a circle of radius
     0.62 * r0 -- and this drew a solid tube of radius r0 straight over
     the top of it, so the Hydra photographed as a smooth pipe with its
     own barrels sealed inside. The one weapon in the table whose
     defining feature is that you can see six muzzles. */
  if (!K.rotary) {
    const pts = [[B.rear, B.r0]];
    if (B.step) pts.push([B.step, B.r0], [B.step + 0.004, B.r1]);
    pts.push([K.muzzle - 0.012, B.r1]);
    tubeRun(g, pts, 18, true, false);
    /* A crowned muzzle, because what sells the end of a barrel is the
       shadow inside it. */
    crown(g, K.muzzle, B.r1, B.bore, 0.030);
  }

  /* Gas system: the tube over the barrel that everything but a
     blowback has, and the block it comes off. */
  if (B.gas) {
    band(g, B.gasAt, B.gasAt + 0.030, B.r1, B.r1 + 0.010, 18);
    tubeRun(g, [[B.gasAt + 0.010, B.gasR], [K.hg.x0 - 0.004, B.gasR]], 14, true, true,
      B.gasY, 0);
  }
  /* A jacket with holes in it: the Thompson, the Sten, the MG 42 and
     anything else that had to be held while it was hot. */
  if (B.shroud) {
    /* WITH HOLES IN IT, and not with lumps on it.
     *
     * This was a solid tube dressed with what the author meant to be
     * holes: `band(x-5mm, x+5mm, R-1mm, R+1.5mm, 8, cy, cz)` -- an
     * annulus whose OWN radius is the shroud's, offset sideways by
     * 0.82R. Six of those per row, overlapping into a collar. The
     * PPSh-41 came out as a stack of doughnuts, which is the single
     * worst-looking thing on any gun in this game.
     *
     * The mistake is not fixable by shrinking the ring, because `band`
     * extrudes along X and a hole in the side of a tube has a RADIAL
     * axis. There is no boolean subtraction here and there does not
     * need to be: what a perforated jacket looks like is the metal
     * BETWEEN the holes. So build that -- rings around, ribs along,
     * and the gaps are real holes you see the barrel through.
     *
     * The Sten, the PPSh, the MG 34 and the service MG 42 all share
     * it, and all four have a genuinely perforated jacket. */
    const SX0 = B.shroudX0, SX1 = B.shroudX1, SR = B.shroudR;
    const wall = 0.0024;
    const rows = Math.max(2, Math.round((SX1 - SX0) / 0.030));
    for (let i = 0; i <= rows; i++) {
      const x = SX0 + i * (SX1 - SX0) / rows;
      const t = (i === 0 || i === rows) ? 0.0090 : 0.0048;
      band(g, x - t * 0.5, x + t * 0.5, SR - wall, SR, 20);
    }
    const ribs = 8;
    for (let k = 0; k < ribs; k++) {
      const th = (k / ribs) * TAU + TAU / (ribs * 2);
      band(g, SX0, SX1, 0, wall * 1.2, 7,
        Math.cos(th) * (SR - wall * 0.5), Math.sin(th) * (SR - wall * 0.5));
    }
  }
  /* The muzzle device, if it has one. A brake is slots; a flash hider
     is prongs; a suppressor-sized can is neither and is a barrel
     attachment rather than part of the gun. */
  if (B.brake === 'slots') {
    band(g, K.muzzle - 0.002, K.muzzle + 0.036, B.bore + 0.0015, B.r1 + 0.005, 20);
    for (let i = 0; i < 3; i++) {
      const x = K.muzzle + 0.006 + i * 0.010;
      band(g, x, x + 0.004, B.r1 + 0.0045, B.r1 + 0.0065, 10, 0, 0);
    }
  } else if (B.brake === 'cage') {
    band(g, K.muzzle - 0.002, K.muzzle + 0.044, B.bore + 0.0020, B.r1 + 0.004, 18);
    for (let k = 0; k < 4; k++) {
      const th = (k / 4) * TAU + 0.4;
      strut(g, [K.muzzle + 0.004, Math.cos(th) * (B.r1 + 0.003), Math.sin(th) * (B.r1 + 0.003)],
        [K.muzzle + 0.042, Math.cos(th) * (B.r1 + 0.004), Math.sin(th) * (B.r1 + 0.004)],
        roundRect(0.0022, 0.0022, 0.0022, 3, 10));
    }
  } else if (B.brake === 'slant') {
    /* The AKM's, and only the AKM's: a plain steel cylinder with the
       front face CUT OFF at an angle, so the gas leaving it pushes the
       muzzle down and to the left. It is a small part and it is the
       one thing you can see on the end of that rifle from any
       distance -- and drawn as the generic slotted brake it was the
       same part as an SVT's, an M60's and a Volkhammer's.

       The cut is the only thing here that is not a surface of
       revolution, so it is the only thing built by hand: a rim whose x
       leans with its own height, an annulus from that rim in to the
       bore, and a wall back to the straight section behind it. */
    const N = 20, r = B.r1 + 0.0042, lean = 0.0125;
    const x0 = K.muzzle - 0.002, x1 = K.muzzle + 0.012;
    sweepPath(g, [ax(x0, ringOutline(r, N), 0, 0), ax(x1, ringOutline(r, N), 0, 0)],
      true, false);
    const tube = g.positions.length / 3 - N;
    const rim = g.positions.length / 3;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU, cy = Math.cos(th) * r, cz = Math.sin(th) * r;
      g.vert(x1 + lean + (cy / r) * lean, cy, cz, cy / r, 0, cz / r, i / N, 1);
    }
    const inner = g.positions.length / 3;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU, ir = B.bore + 0.0018;
      const cy = Math.cos(th) * ir, cz = Math.sin(th) * ir;
      g.vert(x1 + lean + (Math.cos(th) * r / r) * lean, cy, cz, 1, 0, 0, i / N, 0);
    }
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      // The angled face, and the wall carrying it back to the tube.
      g.tri(rim + i, rim + j, inner + j);
      g.tri(rim + i, inner + j, inner + i);
      g.tri(tube + i, tube + j, rim + j);
      g.tri(tube + i, rim + j, rim + i);
    }
  } else if (B.brake === 'cone') {
    spin(g, [[K.muzzle - 0.004, B.bore + 0.002], [K.muzzle + 0.030, B.r1 * 1.9],
      [K.muzzle + 0.030, B.r1 * 2.3], [K.muzzle - 0.004, B.r1 + 0.004]], 20, 34);
  } else if (B.brake === 'ppsh') {
    /* Not a flash hider. The PPSh-41's muzzle device is the barrel
       JACKET carried on past the muzzle and cut away on top: gas goes
       up through the port and the muzzle comes down, which is the
       whole reason a gun firing at nine hundred rounds a minute is
       controllable. It had a cone on it, which is the FG 42's part on
       the wrong rifle. */
    const jr = B.shroudR || (B.r1 + 0.008);
    band(g, K.muzzle - 0.026, K.muzzle + 0.022, jr - 0.0024, jr, 20);
    // The front face, an annulus round the bore.
    band(g, K.muzzle + 0.019, K.muzzle + 0.022, B.bore + 0.0022, jr - 0.0022, 20);
    /* The deflector: the plate standing above the port, leaning back.
       It is the bit you actually see from the side. */
    svcSlab(g, [
      [K.muzzle - 0.020, 0.0026, 0.0026, jr * 0.74, 5],
      [K.muzzle + 0.020, 0.0026, 0.0026, jr * 0.74, 5],
    ], 0, true, true, jr + 0.0024);
  }
}

function svcReceiver(g, K) {
  const R = K.rec;
  svcSlab(g, [
    [R.rear, R.up * 0.86, R.down * 0.86, R.w * 0.88, R.e],
    [R.rear + 0.010, R.up, R.down, R.w, R.e],
    [R.front - 0.014, R.up, R.down, R.w, R.e],
    [R.front, R.up * 0.92, R.down * 0.80, R.w * 0.90, R.e],
  ]);
  /* The ejection port: a shallow recess in the right-hand wall rather
     than a hole, because a hole needs the inside of a receiver behind
     it and there is nothing in there. */
  /* NOT EVERY GUN HAS AN EJECTION PORT. A revolver throws its cases out
     of the cylinder and a riot shield does not throw anything, so both
     say `port: null` -- and this read straight through it and took the
     whole model down with a TypeError. Every optional part in the spec
     can be null and each one has to be treated as meaning what it says
     rather than as an oversight. */
  const p = K.port;
  if (p) {
    svcSlab(g, [
      [p.x0, p.up, -p.down, 0.0024, 4],
      [p.x1, p.up, -p.down, 0.0024, 4],
    ], R.w - 0.0012);
  }
  /* Trigger housing, guard and blade -- one set, shared by everything
     in the table. A shield has no trigger either. */
  const T = K.trigger;
  if (T) {
  svcSlab(g, [
    [T.x - 0.030, -R.down + 0.002, 0.020, R.w * 0.76, 3],
    [T.x + 0.024, -R.down + 0.002, 0.020, R.w * 0.76, 3],
  ]);
  guardBow(g, [
    [T.x + 0.026, -R.down - 0.004], [T.x + 0.022, -R.down - 0.030],
    [T.x + 0.004, -R.down - 0.040], [T.x - 0.020, -R.down - 0.038],
    [T.x - 0.030, -R.down - 0.020], [T.x - 0.032, -R.down - 0.002],
  ], 0.0026, 0.0026, 0.0050);
  triggerBlade(g, T.x, -R.down - 0.004, 0, 0.022, 0.0040);
  }
  /* The charging handle, wherever this one keeps it. */
  const C = K.charge;
  if (C) {
    strut(g, [C.x, C.y, C.z * 0.35], [C.x, C.y, C.z],
      roundRect(0.0045, 0.0045, 0.0045, 3, 12));
    band(g, C.x - 0.008, C.x + 0.008, 0.0, 0.0075, 12, C.y, C.z);
  }
  /* A carrying handle over the top, on the ones that have one.
   *
   * ITS LEGS LAND ON WHATEVER IS ACTUALLY THERE. They were hard-wired
   * to R.up -- the receiver's top -- which is right for the M16 and
   * the AUG, whose handles sit over the receiver, and wrong for the
   * Bren and the MG 34, whose handles are over the BARREL, well
   * forward of it. Both of those photographed as a steel box hovering
   * three centimetres above the gun with two stubs poking down at
   * nothing. A leg that lands on the barrel also gets the collar that
   * clamps it there, because a handle bolted to a smooth pipe is the
   * same lie one step smaller. */
  if (K.handle) {
    const H = K.handle;
    if (H.x0 > R.front) {
      /* OVER THE BARREL is a different part from over the receiver.
       *
       * The Bren's and the MG 34's handles are not bars on two legs;
       * they are a grip on ONE rotating collar clamped round the
       * barrel, which is how you lift a barrel you have just fired two
       * hundred rounds through. Drawn with the receiver pattern they
       * came out as a sheet-metal trough straddling the barrel -- and
       * the trough is its own bug: the receiver bar is written with a
       * NEGATIVE `hb` to push the section up off the axis, which is a
       * degenerate outline that sweeps into an open shell rather than
       * a bar. So this one is built about its own centre instead, with
       * svcSlab's new `y`. */
      const mid = (H.x0 + H.x1) * 0.5, top = svcTopAt(K, mid);
      band(g, mid - 0.015, mid + 0.015, top - 0.001, top + 0.0065, 18);
      strut(g, [mid, top + 0.003, 0], [mid, H.y - 0.006, 0],
        roundRect(0.0065, 0.0065, 0.0105, 4, 12));
      svcSlab(g, [
        [H.x0, 0.0070, 0.0070, 0.0090, 4],
        [H.x0 + 0.012, 0.0085, 0.0085, 0.0110, 4],
        [H.x1 - 0.012, 0.0085, 0.0085, 0.0110, 4],
        [H.x1, 0.0070, 0.0070, 0.0090, 4],
      ], 0, true, true, H.y);
    } else {
      svcSlab(g, [[H.x0, H.y + 0.012, -H.y + 0.004, 0.011, 4],
        [H.x1, H.y + 0.012, -H.y + 0.004, 0.011, 4]]);
      strut(g, [H.x0 + 0.004, R.up, 0], [H.x0 + 0.016, H.y, 0],
        roundRect(0.005, 0.005, 0.009, 3, 10));
      strut(g, [H.x1 - 0.004, R.up, 0], [H.x1 - 0.016, H.y, 0],
        roundRect(0.005, 0.005, 0.009, 3, 10));
    }
  }
  /* THE FEED COVER, on anything belt-fed.
   *
     A belt-fed gun has a hinged lid over the feed tray -- the biggest
     single thing on the top of its receiver, and the part you throw
     open to load it. There was none, so on all five of these the belt
     appeared to run into a flat steel box. Hinged at the front and
     latched at the rear, which is the way round every one of them
     opens. */
  if (K.mag && K.mag.kind === 'belt') {
    const F = K.feed || {};
    const fx0 = F.x0 != null ? F.x0 : R.rear + 0.058;
    const fx1 = F.x1 != null ? F.x1 : R.front - 0.006;
    const up = F.up != null ? F.up : 0.0250;
    const h = up * 0.5, fy = R.up + h - 0.0015, W = R.w;
    svcSlab(g, [
      [fx0, h * 0.58, h * 1.10, W * 0.78, 4],
      [fx0 + 0.020, h, h * 1.10, W * 0.94, 4],
      [fx1 - 0.018, h, h * 1.10, W * 0.94, 4],
      [fx1, h * 0.52, h * 1.10, W * 0.76, 4],
    ], 0, true, true, fy);
    // The latch at the back, and the hinge pin across the front.
    svcSlab(g, [[fx0 - 0.011, 0.0055, 0.0055, W * 0.42, 4],
      [fx0 - 0.001, 0.0055, 0.0055, W * 0.42, 4]], 0, true, true, R.up + 0.0075);
    strut(g, [fx1 - 0.004, R.up + 0.004, -W * 0.90], [fx1 - 0.004, R.up + 0.004, W * 0.90],
      roundRect(0.0026, 0.0026, 0.0026, 3, 8));
  }
  /* And a flat-top rail on the ones that do not. */
  if (K.rail && !K.rail.under) {
    svcSlab(g, [[K.rail.x0, R.up + 0.008, -R.up + 0.001, 0.0095, 6],
      [K.rail.x1, R.up + 0.008, -R.up + 0.001, 0.0095, 6]]);
    const n = Math.round((K.rail.x1 - K.rail.x0) / 0.010);
    for (let i = 0; i < n; i++) {
      const x = K.rail.x0 + (i + 0.5) * (K.rail.x1 - K.rail.x0) / n;
      svcSlab(g, [[x - 0.0022, R.up + 0.0105, -R.up - 0.001, 0.0098, 6],
        [x + 0.0022, R.up + 0.0105, -R.up - 0.001, 0.0098, 6]]);
    }
  }
  /* OR AN ACCESSORY RAIL UNDERNEATH, which is a different part in a
     different place and was being drawn as this one. A pistol's rail
     is moulded into the dust cover BELOW the barrel -- it is what a
     light clips onto -- and the P226 and the G18 were both wearing a
     Picatinny standing up out of the top of the slide, right through
     where the sights look. Nobody caught it because a rail on top is
     correct for the four rifles that also use this field, and the two
     pistols had only ever been looked at in a 90-pixel thumbnail.
   *
     ITS OWN BRANCH, not the same one with the signs flipped. The first
     go did flip the signs, and roundRect's back depth folds a negative
     over to positive y -- the same trap written up on the hooded front
     sight -- so the "under" rail straddled the bore and stuck up
     through the slide anyway. Built about its own centre with
     svcSlab's y instead, where there is no sign to get wrong. */
  if (K.rail && K.rail.under) {
    const h = 0.0042, cy = -R.down - h;
    svcSlab(g, [[K.rail.x0, h, h, 0.0095, 6],
      [K.rail.x1, h, h, 0.0095, 6]], 0, true, true, cy);
    const n = Math.max(2, Math.round((K.rail.x1 - K.rail.x0) / 0.010));
    for (let i = 0; i < n; i++) {
      const x = K.rail.x0 + (i + 0.5) * (K.rail.x1 - K.rail.x0) / n;
      svcSlab(g, [[x - 0.0022, h * 0.6, h + 0.0016, 0.0098, 6],
        [x + 0.0022, h * 0.6, h + 0.0016, 0.0098, 6]], 0, true, true, cy);
    }
  }
}

function svcSights(g, K) {
  const S = K.sight;
  /* Front: a post, and a hood or two ears round it on most. */
  svcSlab(g, [[S.frontX - 0.0022, S.y + 0.002, -0.004, 0.0020, 4],
    [S.frontX + 0.0022, S.y + 0.002, -0.004, 0.0020, 4]]);
  if (S.front === 'hood') {
    /* A HOOD IS A RING ON A POST, NOT A WHEEL ON THE BARREL.
     *
       This was one `spin` -- a surface of revolution whose profile ran
       from the barrel's own radius all the way out to the top of the
       sight -- so it swept a SOLID DISC forty millimetres across,
       centred on the bore, sitting in front of the handguard. Reported
       from the photographs as "this weird circle around its barrel",
       which is exactly what it was, and it is on every hooded rifle in
       the table: the AK, the AK-74, the Garand, the SVT, the MG 34 and
       the MG 42 all carry it.

       The real thing is two separate objects. A BASE, a small block
       clamped to the barrel, and a HOOD, a thin ring about eighteen
       millimetres across standing on top of it with the post inside.
       You see through the ring. The old geometry could not be seen
       through at all -- it was filled in from the barrel outwards,
       which is why it read as a wheel rather than as a sight.

       The ring is centred so its TOP lands on the sight line, because
       that is what the hood is for: the post's tip and the top of the
       hood are at the same height, and a shooter lines up on the post
       with the ring around it. */
    const hr = 0.0090;                 // the ring's outer radius
    const hy = S.y - hr + 0.0016;      // so the top of it sits on the sight line
    band(g, S.frontX - 0.011, S.frontX + 0.011, hr - 0.0016, hr, 20, hy, 0);
    /* The base: barrel to ring, wide enough to read as a clamp rather
       than as a wire.

       A NEGATIVE `hb` IS NOT A DOWNWARD EXTENT. roundRect takes
       (front depth, back depth, half width), and for the back half it
       multiplies by sign(cos) -- so a negative back depth folds that
       side over to POSITIVE y. It is how the sight post above this
       line stands on top of the barrel instead of straddling the bore,
       and my first go at this base used it as though it meant "six
       millimetres below centre", which put the clamp around the bore
       and left the ring floating above it. */
    const hbot = hy - hr;              // the underside of the ring
    svcSlab(g, [[S.frontX - 0.010, hbot + 0.0012, -(K.barrel.r1 - 0.0030), 0.0062, 4],
      [S.frontX + 0.010, hbot + 0.0012, -(K.barrel.r1 - 0.0030), 0.0062, 4]]);
  } else if (S.front === 'ears') {
    for (const sz of [-1, 1]) {
      strut(g, [S.frontX, K.barrel.r1, sz * 0.0085], [S.frontX, S.y + 0.004, sz * 0.0070],
        roundRect(0.0075, 0.0075, 0.0016, 3, 10));
    }
  }
  /* Rear: a notch on a ramp, an aperture on a drum, or a folding
     ladder. All three are the same two boxes with a different hole. */
  /* The base's top was S.y - 0.008 and the aperture ring's underside
     is S.y - 0.0065, so on every rifle with a peep the RING FLOATED
     1.5 mm above its own base -- eight weapons, and a millimetre and a
     half is invisible in a photograph and obvious to a contact test.
     The base reaches the ring now. */
  svcSlab(g, [[S.rearX - 0.010, S.y - 0.004, 0.002, 0.0090, 4],
    [S.rearX + 0.008, S.y - 0.004, 0.002, 0.0090, 4]]);
  if (S.rear === 'aperture') {
    band(g, S.rearX - 0.004, S.rearX + 0.002, 0.0028, 0.0075, 16, S.y + 0.001, 0);
  } else {
    for (const sz of [-1, 1]) {
      svcSlab(g, [[S.rearX - 0.004, S.y + 0.004, -0.001, 0.0022, 5],
        [S.rearX + 0.002, S.y + 0.004, -0.001, 0.0022, 5]], sz * 0.0048);
    }
  }
}

/* ---------------- furniture: handguard and stock ---------------- */

function svcFurniture(g, K) {
  const H = K.hg;
  if (H && H.kind !== 'none') {
    if (H.kind === 'tube') {
      /* A round polymer or alloy handguard, which is what everything
         since about 1960 has.

         THIS OUTLINE WAS WOUND BACKWARDS AND THE HANDGUARD WAS INSIDE
         OUT. `spin` says so at its own definition -- the outline is
         (x, radius) and "must run counter-clockwise in that plane ...
         which is what puts the normals outward" -- and this one ran
         bottom-left, top-left, top-right, bottom-right, which is
         clockwise. Every tube handguard in the game: the M4, the M16,
         the AUG, the Groza, the FG42 and all four launchers.

         It hid because the volume test measures a whole material
         channel at a time, and on a rifle the stock's wood swamps the
         handguard's. The two weapons it showed up on were the
         Panzerschreck and the RPG-7 -- the only ones with a tube
         handguard and NO stock, so nothing was left to mask it.

         Reversed, so it runs anticlockwise: along the bottom first,
         up the far end, back along the top. */
      spin(g, [[H.x0, K.barrel.r1 + 0.002], [H.x1, K.barrel.r1 + 0.002],
        [H.x1 - 0.008, H.r], [H.x0 + 0.006, H.r]], 22, 30);
      if (H.ribs) {
        /* LENGTHWISE, for a handguard that is fluted rather than
           slotted. The FG42's wooden sleeve has grooves running front
           to back; dressed in the ring slots below it came out
           corrugated across its width, like a length of flexible
           conduit, which is the single thing that made that rifle look
           wrong from above. A rib is one thin rod laid along the tube
           at the sleeve's own radius. */
        for (let i = 0; i < H.ribs; i++) {
          const th = TAU * i / H.ribs + TAU / (H.ribs * 2);
          band(g, H.x0 + 0.010, H.x1 - 0.008, 0, 0.0022, 8,
            Math.cos(th) * H.r, Math.sin(th) * H.r);
        }
      } else if (H.slots !== false) {
        /* Cooling slots, cut as shallow bands rather than real holes.
           `slots: false` for a sleeve that has none -- a launcher's
           tube is smooth, and dressing one in M4 cooling slots is why
           every launcher in the game photographed as a pipe with four
           octagonal discs threaded onto it. */
        for (let i = 0; i < 4; i++) {
          const x = H.x0 + 0.018 + i * (H.x1 - H.x0 - 0.036) / 3;
          for (const th of [0.9, 2.24, TAU - 0.9, TAU - 2.24]) {
            band(g, x - 0.010, x + 0.010, H.r - 0.0015, H.r + 0.0005, 8,
              Math.cos(th) * H.r * 0.72, Math.sin(th) * H.r * 0.72);
          }
        }
      }
    } else {
      /* A wooden forend: a slab under the barrel with the top hollowed
         round it, which reads as wood rather than as a pipe. */
      svcSlab(g, [
        [H.x0, -K.barrel.r1 - 0.001, H.drop * 0.72, H.w * 0.80, 3],
        [H.x0 + 0.012, -K.barrel.r1 - 0.001, H.drop, H.w, 3],
        [H.x1 - 0.014, -K.barrel.r1 - 0.001, H.drop, H.w, 3],
        [H.x1, -K.barrel.r1 - 0.001, H.drop * 0.68, H.w * 0.76, 3],
      ]);
      if (H.upper) {
        svcSlab(g, [
          [H.x0 + 0.004, H.upper, -K.barrel.r1 - 0.001, H.w * 0.86, 3],
          [H.x1 - 0.010, H.upper, -K.barrel.r1 - 0.001, H.w * 0.86, 3],
        ]);
      }
    }
  }
  const S = K.stock;
  if (!S || S.kind === 'none') return;
  const R = K.rec;
  if (S.kind === 'wood' || S.kind === 'poly') {
    /* A shoulder stock: wrist, comb and butt. The wrist is the thin
       part behind the receiver, the comb is the top line your cheek
       goes on, and the butt is the plate. */
    svcSlab(g, [
      [R.rear + 0.004, R.up * 0.86, R.down * 0.80, R.w * 0.88, 3.4],
      [R.rear - 0.045, S.comb * 0.86, S.drop * 0.70, S.w * 0.80, 3],
      [S.butt + 0.055, S.comb, S.drop * 0.94, S.w, 3],
      [S.butt + 0.010, S.comb * 0.98, S.drop, S.w * 0.98, 3],
      [S.butt, S.comb * 0.92, S.drop * 0.94, S.w * 0.90, 3],
    ]);
    /* The butt plate. */
    svcSlab(g, [[S.butt - 0.008, S.comb * 0.94, S.drop * 0.96, S.w * 0.94, 3],
      [S.butt, S.comb * 0.94, S.drop * 0.96, S.w * 0.94, 3]]);
  } else if (S.kind === 'tube') {
    /* A collapsible stock on a buffer tube, which is one cylinder and
       one box round it. */
    tubeRun(g, [[R.rear, 0.0165], [S.butt + 0.010, 0.0165]], 16, true, true, S.comb * 0.45, 0);
    svcSlab(g, [
      [S.butt + 0.070, S.comb, S.drop * 0.55, S.w * 0.80, 4],
      [S.butt + 0.010, S.comb, S.drop, S.w, 4],
      [S.butt, S.comb * 0.90, S.drop * 0.92, S.w * 0.92, 4],
    ]);
  } else if (S.kind === 'skeleton') {
    /* A BUTT WITH A HOLE THROUGH IT. The PKM's, and it is the one part
       of that gun nothing else in the rack has -- a laminate butt with
       a grip cut straight through the middle so the second hand has
       somewhere to go when the gun is on its bipod.

       It earns its own kind because a hole is not something the wood
       and poly branch can express: that branch sweeps one solid from
       the wrist to the buttplate, and there is no boolean subtraction
       here to take a bite out of it afterwards. What a hole looks like
       is the material AROUND it, so this is built as the comb above,
       the toe below, and the plate closing the back -- and the gap
       between them is a real gap you see the map through. Same
       reasoning as the perforated barrel jacket. */
    const top = S.comb, bot = S.drop, hole = S.hole || 0.062;
    svcSlab(g, [
      [R.rear + 0.004, R.up * 0.86, R.down * 0.80, R.w * 0.88, 3.4],
      [R.rear - 0.045, top * 0.86, bot * 0.62, S.w * 0.80, 3],
      [R.rear - 0.070, top * 0.90, -bot * 0.10, S.w * 0.86, 3],
    ]);
    // The comb, over the hole.
    svcSlab(g, [
      [R.rear - 0.070, top * 0.90, -bot * 0.10, S.w * 0.86, 3],
      [S.butt + 0.030, top, -bot * 0.05, S.w * 0.88, 3],
      [S.butt, top * 0.92, -bot * 0.02, S.w * 0.84, 3],
    ]);
    // The toe, under it.
    svcSlab(g, [
      [R.rear - 0.062, -bot * 0.10 - hole, bot - hole * 0.30, S.w * 0.74, 3],
      [S.butt + 0.026, -bot * 0.10 - hole, bot - hole * 0.30, S.w * 0.78, 3],
      [S.butt, -bot * 0.10 - hole, bot * 0.94, S.w * 0.76, 3],
    ]);
    // And the plate closing the back of both.
    svcSlab(g, [[S.butt - 0.008, top * 0.94, bot * 0.96, S.w * 0.90, 3],
      [S.butt, top * 0.94, bot * 0.96, S.w * 0.90, 3]]);
  } else if (S.kind === 'wire' || S.kind === 'folder') {
    /* Two rods and a bar: the thing that is welded together in an
       afternoon and rattles for the rest of its life. */
    for (const sz of [-1, 1]) {
      strut(g, [R.rear, -R.down * 0.35, sz * S.w * 0.70],
        [S.butt + 0.020, S.drop * -0.55, sz * S.w * 0.92],
        roundRect(0.0048, 0.0048, 0.0048, 3, 12));
      strut(g, [S.butt + 0.020, S.drop * -0.55, sz * S.w * 0.92],
        [S.butt, S.drop * -0.30, sz * S.w * 0.55],
        roundRect(0.0048, 0.0048, 0.0048, 3, 12));
    }
    svcSlab(g, [[S.butt - 0.006, S.comb * 0.5, S.drop * 0.5, S.w * 0.62, 4],
      [S.butt + 0.006, S.comb * 0.5, S.drop * 0.5, S.w * 0.62, 4]]);
  }
}

/* THE TOGGLE, which only the Luger has and which IS the Luger.
 *
 * A P08's breech is not a slide. It is two links pinned together that
 * jack up in the middle like a knee when the gun fires, and the two
 * knurled discs you pull on are on the knuckle. Nothing about that
 * shape is shared with any other pistol, and the table carried it as
 * `charge` -- one knob on the right flank, which is a charging handle
 * and is what every other self-loader here has. So the most
 * recognisable pistol of the century was being drawn as a generic
 * blocky automatic with a bump on it.
 *
 * Closed, which is how it sits in the hand: the links lie flat along
 * the top of the receiver, the knuckle a little proud, the discs out
 * either side on their pin.
 */
function svcToggle(g, K) {
  const T = K.toggle;
  if (!T) return;
  const R = K.rec, y = R.up + T.rise;
  // The two links, flat along the top, with a step where they meet.
  svcSlab(g, [
    [T.x0, 0.0042, 0.0042, R.w * 0.72, 3.4],
    [T.knuckle - 0.004, 0.0052, 0.0052, R.w * 0.80, 3.4],
    [T.knuckle + 0.004, 0.0052, 0.0052, R.w * 0.80, 3.4],
    [T.x1, 0.0038, 0.0038, R.w * 0.66, 3.4],
  ], 0, true, true, y);
  /* The pin through the knuckle, which is what carries the discs --
     and without it they are two coins floating either side of the
     gun, which is the class of fault attached.test.js exists for. */
  const zr = R.w + T.out;
  strut(g, [T.knuckle, y, -zr - 0.0022], [T.knuckle, y, zr + 0.0022],
    ringOutline(0.0026, 10));
  for (const sz of [-1, 1]) {
    // The disc: a knurled wheel you get a thumb and finger onto.
    band(g, T.knuckle - 0.0088, T.knuckle + 0.0088, 0, T.r, 18, y, sz * zr);
    for (let i = 0; i < 10; i++) {
      const th = (i / 10) * TAU;
      strut(g, [T.knuckle + Math.cos(th) * T.r, y + Math.sin(th) * T.r, sz * (zr - 0.0086)],
        [T.knuckle + Math.cos(th) * T.r, y + Math.sin(th) * T.r, sz * (zr + 0.0086)],
        ringOutline(0.0011, 6));
    }
  }
}

/* ==================================================================
   THE WORK ON A SLIDE
   ==================================================================
   Nine pistols came out of the table as nine copies of one object.
   Measured pairwise against every other gun in the game, six of them
   sat inside a hundredth of each other -- the G18 and the P226 at
   0.0035 against a median difference of 0.0468, which is to say they
   were thirteen times more alike than two guns picked at random. That
   is not a tuning problem. Millimetres on a slide's length do not
   photograph; the difference between a Luger and a Glock is not two
   millimetres of anything, it is that one has a toggle and knurled
   discs and the other has a squared-off polymer block with grooves cut
   in the back of it.

   So the fix is not to move the numbers apart, it is to give the table
   the vocabulary those guns are actually distinguished by. Everything
   below is optional and off unless a spec asks for it, so no existing
   weapon changes by a vertex until its own entry opts in.
   ================================================================== */

/* Cocking serrations. The single most recognisable thing about the
   back half of any self-loading pistol, and the table had no way to
   say it -- so every slide in the game was a smooth block.

   They stand PROUD, not cut in. A groove in a flat wall needs the wall
   to have thickness the renderer knows about; a rib does not, and at
   the distance a sidearm is held a rib and a groove read the same. The
   same reasoning is already written down on the ejection port lip. */
/* ==================================================================
   THE PARTS THAT CHANGE A SILHOUETTE
   ==================================================================
   Same finding as the sidearms, one shelf up. Voxelised and compared
   pairwise, the Groza and the AUG scored 0.15 apart where the median
   pair in the rack is 0.96 -- they were, as shapes, six times more
   alike than two guns drawn at random, and the reason is that the
   table could describe both of them and had no word for what makes
   either one itself. Both are "bullpup, tube handguard, carry handle,
   magazine behind the grip", so both came out as that and nothing
   else. Nine pairs were in the same state.

   What separates them is never a dimension. An AUG's handle IS its
   optical sight and it has a folding vertical grip under the barrel; a
   Groza has a grenade launcher slung under its barrel and a flat rail
   where the handle would be; a G3's cocking handle rides in a tube
   that runs the whole length of the barrel above it; a Bren's magazine
   comes in from the TOP. None of that is expressible in millimetres,
   and all of it is the first thing you see.
   ================================================================== */

function svcAux(g, K) {
  const R = K.rec, W = R.w;

  /* AN AUXILIARY TUBE alongside the bore. One field, and it covers
     the cocking tube over a G3's barrel, the launcher slung under a
     Groza, and the recuperator under a heavy barrel -- they are the
     same object in three places, and each of them is the biggest thing
     on the outside of the gun that wears it. */
  /* ONE FIELD, OR SEVERAL. A Kel-Tec-pattern bullpup pump carries two
     magazine tubes side by side and that pair IS the gun; an over-and-
     under carries its second barrel above the first. Both are "another
     tube alongside the bore", so `tube` takes a list as readily as a
     single one rather than growing a tube2 and then a tube3. */
  for (const T of (Array.isArray(K.tube) ? K.tube : (K.tube ? [K.tube] : []))) {
    const ty = T.y != null ? T.y : 0, tz = T.z || 0;
    tubeRun(g, [[T.x0, T.r], [T.x1, T.r]], T.seg || 16, true, T.open !== true, ty, tz);
    /* Bolted on, not hovering beside. Two collars tying it to whatever
       it runs along -- the fault the attachment sweep exists for, and
       the one a new part is most likely to arrive with.
     *
       ONLY IF IT IS ACTUALLY ALONGSIDE. A suppressor is a tube too,
       and it is COAXIAL -- it screws onto the muzzle, on the bore line,
       so both of these collars became struts from a point to itself.
       A zero-length strut still emits its whole profile, so the Kill
       Streak grew an 82-vertex cluster of zero size sitting on the end
       of its can, which attached.test.js reported the first time it ran
       after and which is otherwise invisible. What ties a coaxial tube
       on is a thread at the back of it, not a bracket. */
    const off = Math.hypot(ty, tz);
    if (off > T.r * 0.5) {
      for (const cx of [T.x0 + 0.020, T.x1 - 0.020]) {
        strut(g, [cx, ty, tz], [cx, 0, 0],
          roundRect(T.r * 0.55, T.r * 0.55, 0.0030, 3.4, 10));
      }
    } else {
      band(g, T.x0 - 0.010, T.x0 + 0.004, T.r * 0.55, T.r * 0.80, 18, ty, tz);
    }
    if (T.muzzle) {
      // A launcher tube has its own mouth, and it is wider than the tube.
      spin(g, [[T.x1 - 0.004, T.r - 0.0030], [T.x1 + 0.016, T.r + 0.0060],
        [T.x1 + 0.016, T.r + 0.0090], [T.x1 - 0.004, T.r + 0.0020]], 18, 34, ty, tz);
      // And its own trigger, hanging under it behind the mouth.
      svcSlab(g, [[T.x0 + 0.030, 0.0080, 0.0140, 0.0090, 4],
        [T.x0 + 0.062, 0.0080, 0.0140, 0.0090, 4]], tz, true, true, ty - T.r - 0.0090);
    }
  }

  /* THE LEVER. One weapon in the rack is worked by throwing a loop
     forward and back under the receiver, and the loop is most of what
     it looks like. It is a closed hoop -- your whole hand goes through
     it -- hinged at the top front and reaching back under the grip,
     which is a shape nothing else here produces. */
  const LV = K.lever;
  if (LV) {
    const y0 = -R.down - 0.002, drop = LV.drop || 0.070;
    guardBow(g, [
      [LV.x1, y0], [LV.x1 + 0.010, y0 - drop * 0.34],
      [LV.x1 - 0.010, y0 - drop * 0.86], [LV.x0 + 0.040, y0 - drop],
      [LV.x0, y0 - drop * 0.72], [LV.x0 - 0.004, y0 - drop * 0.22],
      [LV.x0 + 0.010, y0],
    ], 0.0042, 0.0042, 0.0072);
    // The pin it pivots on, through the receiver walls.
    strut(g, [LV.x1, y0 + 0.004, -W - 0.0016], [LV.x1, y0 + 0.004, W + 0.0016],
      ringOutline(0.0040, 10));
  }

  /* A BREACHING STANDOFF: the toothed collar on the muzzle of a gun
     meant to be pressed against a door hinge and fired. Three prongs
     and a ring, and it is the only muzzle in the rack that is wider
     than the receiver behind it. */
  const BR = K.breacher;
  if (BR) {
    const r = K.barrel.r1, out = BR.r || r + 0.0130;
    band(g, K.muzzle - 0.010, K.muzzle + 0.004, r - 0.0010, out - 0.0030, 20);
    for (let i = 0; i < (BR.n || 3); i++) {
      const th = (i / (BR.n || 3)) * TAU + 0.5;
      strut(g, [K.muzzle, Math.cos(th) * (out - 0.004), Math.sin(th) * (out - 0.004)],
        [K.muzzle + (BR.len || 0.034), Math.cos(th) * out, Math.sin(th) * out],
        roundRect(0.0038, 0.0038, 0.0030, 3.0, 8));
    }
  }

  /* AN INTEGRAL OPTIC. Not a scope bolted to a rail -- a sight that is
     part of the gun and cannot be taken off it, which on the AUG is
     the carry handle itself and is the single thing everybody pictures
     when they picture that rifle. A tube, a bell, and the casting it
     grows out of. */
  const O = K.optic;
  if (O) {
    const oy = O.y != null ? O.y : R.up + 0.030;
    const r = O.r || 0.0170, bell = O.bell || r * 1.30;
    spin(g, [
      [O.x0, 0], [O.x0, bell], [O.x0 + 0.030, bell],
      [O.x0 + 0.044, r], [O.x1 - 0.026, r], [O.x1 - 0.014, r * 1.18],
      [O.x1, r * 1.18], [O.x1, 0],
    ], 22, 34, oy, 0);
    /* THE CASTING UNDER IT, which is what makes this an integral sight
       and not a scope. It runs the full length of the tube and lands
       on the receiver -- so there is no gap, no rings, and nothing to
       take off. */
    svcSlab(g, [
      [O.x0 + 0.014, 0.0030, oy - R.up + 0.0020, W * 0.62, 4],
      [O.x1 - 0.014, 0.0030, oy - R.up + 0.0020, W * 0.62, 4],
    ], 0, true, true, oy - r * 0.62);
    // The elevation drum on top and the windage one on the right.
    strut(g, [O.x1 - 0.048, oy + r * 0.7, 0], [O.x1 - 0.048, oy + r + 0.0070, 0],
      ringOutline(0.0062, 12));
    strut(g, [O.x1 - 0.048, oy, r * 0.7], [O.x1 - 0.048, oy, r + 0.0070],
      ringOutline(0.0062, 12));
  }

  /* VENTS. Holes through a handguard or a receiver wall -- the round
     ones down an M16's forend, the slots stamped in an STG's, the long
     cuts in a machine gun's barrel sleeve. Same reasoning as the
     perforated jacket in svcBarrel: what you build is the metal
     BETWEEN the holes, so these are ribs laid on the surface with real
     gaps left between them. */
  const V = K.vents;
  if (V) {
    const n = V.n || 6;
    const top = V.r != null ? V.r : (K.hg ? (K.hg.r || K.hg.upper || 0.024) : R.up);
    for (let i = 0; i < n; i++) {
      const x = V.x0 + (i + 0.5) * (V.x1 - V.x0) / n;
      if (V.kind === 'slot') {
        // A long cut across: one rib each side of it.
        for (const sz of [-1, 1]) {
          svcSlab(g, [[x - (V.w || 0.0055), 0.0022, 0.0022, 0.0026, 4],
            [x + (V.w || 0.0055), 0.0022, 0.0022, 0.0026, 4]],
            sz * top * 0.86, true, true, V.yOff || 0);
        }
      } else {
        // A round hole: a raised eyelet round it, each side.
        for (const sz of [-1, 1]) {
          strut(g, [x, V.yOff || 0, sz * (top - 0.0020)],
            [x, V.yOff || 0, sz * (top + 0.0014)],
            ringOutline(V.r0 || 0.0044, 12));
        }
      }
    }
  }

  /* THE AMMUNITION BOX, on the belt guns that carry theirs with them.
   *
     Five weapons in this rack are belt-fed and all five had the belt
     simply leaving the feed tray and stopping in mid air. A PKM or an
     RPD is not fed from a box on the ground -- it has a drum or a tin
     clipped to the underside of the receiver, and that box is a third
     of the gun's bulk and most of what tells one machine gun from
     another at a glance. Without it the five of them are one silhouette
     with different barrels. */
  const A = K.ammoBox;
  if (A) {
    const ax = A.x, ay = -R.down - (A.drop || 0.010), az = A.z || 0;
    if (A.kind === 'drum') {
      /* ACROSS THE GUN, not along it. A belt drum's flat faces look
         left and right -- it is a tin of coiled belt lying against the
         weapon's flank, and it is as wide as the gun and as deep as
         your hand. Built with `spin`, whose axis is the bore, it came
         out as a wheel facing forwards: a road sign bolted under the
         receiver. `strut` sweeps a profile between two points, so
         giving it two points across the gun gives the right axis. */
      const dr = A.r || 0.058, dw = A.w || 0.030;
      const dy = A.kind === 'drum' && A.side ? ay : ay - dr;
      strut(g, [ax, dy, az - dw], [ax, dy, az + dw], ringOutline(dr, 26));
      // The rim round the edge, and the bail it hangs from.
      for (const sz of [-1, 1]) {
        strut(g, [ax, dy, az + sz * dw], [ax, dy, az + sz * (dw + 0.0022)],
          ringOutline(dr + 0.0018, 26));
      }
      svcSlab(g, [[ax - 0.012, 0.0070, 0.0070, 0.0110, 4],
        [ax + 0.012, 0.0070, 0.0070, 0.0110, 4]], az, true, true, ay - 0.004);
    } else {
      const hx = (A.len || 0.110) * 0.5, hy = (A.h || 0.075) * 0.5;
      svcSlab(g, [
        [ax - hx, hy * 0.90, hy * 0.90, A.w || 0.036, 5],
        [ax - hx + 0.010, hy, hy, A.w || 0.036, 5],
        [ax + hx - 0.010, hy, hy, A.w || 0.036, 5],
        [ax + hx, hy * 0.90, hy * 0.90, A.w || 0.036, 5],
      ], az, true, true, ay - hy);
      // The lid, the carrying bail, and the two rails it hangs on.
      svcSlab(g, [[ax - hx + 0.004, 0.0040, 0.0040, (A.w || 0.036) + 0.0018, 5],
        [ax + hx - 0.004, 0.0040, 0.0040, (A.w || 0.036) + 0.0018, 5]],
        az, true, true, ay - 0.0020);
      for (const sz of [-1, 1]) {
        strut(g, [ax - hx + 0.012, ay - hy * 1.9, az + sz * (A.w || 0.036)],
          [ax + hx - 0.012, ay - hy * 1.9, az + sz * (A.w || 0.036)],
          roundRect(0.0022, 0.0022, 0.0022, 3, 8), true, true);
      }
    }
  }

  /* A BAYONET, and the lug it locks onto. Two weapons in this rack
     were carried by men who expected to use one, and a Mosin without
     the spike is not the rifle anybody pictures -- it is the same
     length of wood and steel as every other bolt gun here, which is
     what the shape comparison kept saying. */
  const BY = K.bayonet;
  if (BY) {
    const by = BY.y != null ? BY.y : -(K.barrel.r1 + 0.008);
    // The lug under the muzzle, first: a blade on nothing is a floater.
    svcSlab(g, [[BY.x0 - 0.020, 0.0055, 0.0055, 0.0060, 4],
      [BY.x0 + 0.006, 0.0055, 0.0055, 0.0060, 4]], 0, true, true, by + 0.0030);
    if (BY.kind === 'spike') {
      // Cruciform: four flutes down a square section, tapering to a point.
      spin(g, [[BY.x0, 0.0085], [BY.x1 - 0.030, 0.0060], [BY.x1, 0.0008]],
        4, 30, by, 0);
      band(g, BY.x0 - 0.008, BY.x0 + 0.010, 0.0060, 0.0105, 14, by, 0);
    } else {
      // A knife: a flat blade with a false edge and a crossguard.
      svcSlab(g, [
        [BY.x0, 0.0130, 0.0130, 0.0022, 6],
        [BY.x1 - 0.026, 0.0130, 0.0120, 0.0022, 6],
        [BY.x1, 0.0022, 0.0022, 0.0014, 4],
      ], 0, true, true, by);
      band(g, BY.x0 - 0.006, BY.x0 + 0.002, 0.0040, 0.0120, 12, by, 0);
    }
  }

  /* A TOP-MOUNTED MAGAZINE, and the offset sights that go with it.
   *
     The Bren is the only weapon in this rack whose magazine goes in
     from above, and that one fact is its entire silhouette -- a curved
     box standing straight up out of the receiver, with the sights
     pushed off to the left so you can see past it. Built as its own
     part rather than by moving `mag`, because svcMag hangs a magazine
     DOWNWARDS from the receiver and every round it counts into one
     would have poured out of the top. */
  const TM = K.topMag;
  if (TM) {
    const n = TM.n || 5;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = TM.x - t * TM.len * (TM.curve || 0.18);
      const y = R.up + t * TM.len;
      svcSlab(g, [[x - (TM.d || 0.0150), 0.0030, 0.0030, TM.w || 0.0130, 4],
        [x + (TM.d || 0.0150), 0.0030, 0.0030, TM.w || 0.0130, 4]], 0, true, true, y);
    }
    // The catch behind it, and the lip it seats against.
    svcSlab(g, [[TM.x + (TM.d || 0.0150) + 0.002, 0.0060, 0.0060, 0.0080, 4],
      [TM.x + (TM.d || 0.0150) + 0.014, 0.0060, 0.0060, 0.0080, 4]],
      0, true, true, R.up + 0.0060);
  }
}

function svcSerrate(g, K) {
  const S = K.serr;
  if (!S) return;
  const R = K.rec, W = R.w;
  const kind = S.kind || 'vert';
  for (const span of [S.rear, S.front]) {
    if (!span) continue;
    const n = Math.max(2, Math.round((span[1] - span[0]) / (S.pitch || 0.0062)));
    for (let i = 0; i < n; i++) {
      const x = span[0] + (i + 0.5) * (span[1] - span[0]) / n;
      /* How far the rib leans. A 1911's are straight up; a modern
         slide's rake back; the Tokarev's are wide and shallow. */
      const lean = kind === 'slant' ? 0.0075 : 0;
      const top = R.up - (S.inset || 0.0010);
      const bot = -R.down + (S.inset || 0.0010) + (S.depth || 0);
      if (kind === 'scallop') {
        /* Not ribs at all: a column of round dimples, which is what a
           few of these wear instead. */
        for (const sz of [-1, 1]) {
          const my = (top + bot) * 0.5;
          strut(g, [x, my, sz * (W - 0.0002)], [x, my, sz * (W + 0.0016)],
            ringOutline(S.r || 0.0026, 10));
        }
        continue;
      }
      /* Wave: the rib's height rises and falls along the run, which is
         how a wavy-cut slide reads at a glance. */
      const h = kind === 'wave'
        ? 0.55 + 0.45 * Math.cos((i / Math.max(1, n - 1)) * TAU)
        : 1;
      for (const sz of [-1, 1]) {
        strut(g, [x, bot + (top - bot) * (0.5 - 0.5 * h), sz * (W + 0.0002)],
          [x + lean, bot + (top - bot) * (0.5 + 0.5 * h), sz * (W + (S.out || 0.0013))],
          roundRect(S.hw || 0.0017, S.hw || 0.0017, 0.0009, 3.0, 8));
      }
      /* And across the top on the ones that are cut over the whole
         slide rather than only down the flanks. */
      if (S.top) {
        strut(g, [x, R.up - 0.0004, -W * 0.82], [x + lean, R.up + 0.0011, W * 0.82],
          roundRect(S.hw || 0.0017, S.hw || 0.0017, 0.0009, 3.0, 8));
      }
    }
  }
}

/* The hammer, the tang under it, and the muzzle work on the front.
   Three separate small parts, but they share a spec section because
   they are the three things at the two ENDS of a pistol -- and the
   ends are what you see of one in a silhouette. */
function svcSlideWork(g, K) {
  const R = K.rec, W = R.w;

  /* The beavertail. A shelf standing back off the top rear of the
     frame, over the web of the hand -- the reason a 1911 pattern
     reads as a 1911 pattern and a Tokarev does not. */
  const T = K.tang;
  if (T) {
    const bx = T.x != null ? T.x : R.rear;
    svcSlab(g, [
      [bx, 0.0060, 0.0060, W * 0.76, 3.4],
      [bx - (T.len || 0.024) * 0.55, 0.0052, 0.0072, W * 0.70, 3.4],
      [bx - (T.len || 0.024), 0.0026, 0.0060, W * 0.52, 3.0],
    ], 0, true, true, (T.y != null ? T.y : R.up - 0.0060));
  }

  /* The hammer. Three shapes, and which one a pistol wears says more
     about it than its length does: a spur you can thumb back, a ring
     that is lighter and does not snag, or nothing at all because the
     gun is striker-fired and there is no hammer to see. */
  const H = K.hammer;
  if (H && H.kind && H.kind !== 'none') {
    const hx = H.x != null ? H.x : R.rear + 0.004;
    const hy = H.y != null ? H.y : R.up - 0.0020;
    // The pin it swings on, through both walls.
    strut(g, [hx, hy - 0.0090, -W - 0.0014], [hx, hy - 0.0090, W + 0.0014],
      ringOutline(0.0024, 10));
    if (H.kind === 'bob') {
      // Rounded off flush with the tang: a stub and nothing more.
      strut(g, [hx, hy - 0.0090, 0], [hx - 0.0060, hy + 0.0036, 0],
        roundRect(0.0038, 0.0038, 0.0030, 3.0, 12));
    } else {
      // The spine, leaning back over the tang the way a cocked one does.
      strut(g, [hx, hy - 0.0090, 0], [hx - 0.0086, hy + 0.0092, 0],
        roundRect(0.0032, 0.0032, 0.0026, 3.4, 12));
      if (H.kind === 'ring') {
        strut(g, [hx - 0.0100, hy + 0.0120, -0.0026], [hx - 0.0100, hy + 0.0120, 0.0026],
          ringOutline(0.0052, 14));
      } else {
        // A spur: a flat thumbpiece, wider than the spine it sits on.
        svcSlab(g, [[hx - 0.0150, 0.0026, 0.0026, 0.0050, 3.0],
          [hx - 0.0062, 0.0030, 0.0030, 0.0054, 3.0]], 0, true, true, hy + 0.0122);
      }
    }
  }

  /* Compensator ports. Holes in the top of the barrel that let the gas
     out upwards so the muzzle does not climb -- and on a pistol they
     are cut where the barrel stands clear of the slide, which is the
     one bit of a handgun that is not a rectangle. */
  const C = K.comp;
  if (C) {
    const n = C.n || 3;
    for (let i = 0; i < n; i++) {
      const x = C.x0 + (n === 1 ? 0 : i * (C.x1 - C.x0) / (n - 1));
      const r = K.barrel.r1;
      /* A raised collar round each port. A hole with no rim is a dark
         dot, and a dark dot on a barrel is a texture, not a part. */
      strut(g, [x, r - 0.0020, 0], [x, r + 0.0022, 0],
        roundRect(C.w || 0.0030, C.w || 0.0030, C.hw || 0.0022, 3.0, 10));
    }
    if (C.shroud) {
      /* And on the ones where the whole muzzle end is a squared-off
         block rather than a round barrel. */
      const br = K.barrel.r1;
      svcSlab(g, [[C.x0 - 0.008, br + 0.0040, br + 0.0030, 0.0088, 4],
        [C.x1 + 0.008, br + 0.0040, br + 0.0030, 0.0088, 4]]);
    }
  }

  /* A sighting rib down the top of the slide -- a raised flat strip
     between the sights, which a target pistol and a service revolver
     both wear and a plain service auto does not. */
  const B = K.rib;
  if (B) {
    const top = B.onBarrel ? K.barrel.r1 : R.up;
    svcSlab(g, [
      [B.x0, 0.0026, 0.0026, B.hw || 0.0060, 5],
      [B.x1, 0.0026, 0.0026, B.hw || 0.0060, 5],
    ], 0, true, true, top + 0.0014);
    if (B.vent) {
      // Cut through in a line, the way a ventilated rib is.
      const n = Math.max(2, Math.round((B.x1 - B.x0) / 0.014));
      for (let i = 0; i < n; i++) {
        const x = B.x0 + (i + 0.5) * (B.x1 - B.x0) / n;
        strut(g, [x, top + 0.0010, -(B.hw || 0.0060) * 0.5],
          [x, top + 0.0010, (B.hw || 0.0060) * 0.5],
          roundRect(0.0024, 0.0024, 0.0018, 3.0, 8));
      }
    }
  }

  /* An accessory light or laser under the dust cover -- the thing
     hanging off the rail rather than the rail itself. */
  const L = K.underslung;
  if (L) {
    const ly = -R.down - (L.drop || 0.0090);
    svcSlab(g, [
      [L.x0, 0.0072, 0.0072, 0.0098, 4],
      [L.x1 - 0.008, 0.0078, 0.0078, 0.0104, 4],
      [L.x1, 0.0060, 0.0060, 0.0086, 4],
    ], 0, true, true, ly);
    // The lens on the front of it.
    strut(g, [L.x1 - 0.0016, ly, 0], [L.x1 + 0.0020, ly, 0], ringOutline(0.0062, 14));
  }
}

function svcGrip(g, K) {
  const G = K.grip;
  /* A FRONT GRIP, on the two weapons that have one. The M60's is under
     the gas tube and is half of how anybody holds ten kilos of machine
     gun; it was simply absent. It hangs off whatever is above it so it
     cannot float. */
  const F = K.foregrip;
  if (F) {
    const top = svcTopAt(K, F.x);
    gripStack(g, F.x, -(F.under != null ? F.under : top) + 0.002,
      F.len || 0.100, F.rake || 0.10, [
        [0.00, 0.0150, 0.0140, 0.0140, 3.0],
        [0.30, 0.0138, 0.0130, 0.0132, 2.8],
        [0.70, 0.0132, 0.0128, 0.0130, 2.8],
        [1.00, 0.0148, 0.0148, 0.0142, 3.2],
      ]);
  }
  /* THE SECTION, and it is not the same on two of these.
   *
     One profile for every grip in the game made a Mauser broomhandle
     -- round, and the reason the gun is called that -- come out as the
     same flat-sided slab as a Glock's. The three knobs below are what
     a grip's cross-section actually varies in: how deep front to back,
     how wide across, and how square the corners are. Default to the
     numbers that were hard-coded, so a spec that says nothing is
     unchanged. */
  const gd = G.deep != null ? G.deep : 1;
  const gw = G.wide != null ? G.wide : 1;
  const ge = G.e != null ? G.e : 1;
  gripStack(g, G.x, G.y, G.len, G.rake, [
    [0.00, 0.0175 * gd, 0.0165 * gd, 0.0165 * gw, 3.0 * ge],
    [0.22, 0.0168 * gd, 0.0158 * gd, 0.0162 * gw, 3.0 * ge],
    [0.55, 0.0155 * gd, 0.0150 * gd, 0.0158 * gw, 2.8 * ge],
    [0.85, 0.0160 * gd, 0.0158 * gd, 0.0162 * gw, 2.8 * ge],
    [1.00, 0.0168 * gd, 0.0168 * gd, 0.0166 * gw, 3.2 * ge],
  ]);
  /* Checkering on the sides, which is the difference between a grip
     you can feel and a painted slab -- but a smooth walnut target
     panel and a stippled polymer one are not the same surface, so a
     spec can ask for coarser, finer, or none. */
  if (G.check !== false) {
    const ux = -G.rake / Math.hypot(G.rake, 1), uy = -1 / Math.hypot(G.rake, 1);
    const cols = G.checkN ? G.checkN[0] : 5, rows = G.checkN ? G.checkN[1] : 7;
    for (const sz of [-1, 1]) {
      checker(g, G.x + ux * G.len * 0.52, G.y + uy * G.len * 0.52, sz * 0.0161 * gw,
        ux, uy, sz, cols, rows, 0.0072, G.checkH || 0.0009);
    }
  }
}

/* ---------------- magazines ---------------- */

/* A DISC, ABOUT ANY AXIS.
 *
   `spin` revolves about X and only about X, which is right for
   everything shaped like a barrel and wrong for both of the magazines
   that are shaped like a plate. The DP-28's pan lies flat on top of the
   receiver -- its axis is vertical -- and a PPSh drum faces left and
   right, so its axis runs across the gun. Built with spin, the pan came
   out as a cylinder lying along the barrel and the drum as a wheel set
   up to roll forwards, and neither was anywhere near where it should
   have been. */
function svcDisc(g, axis, c, r, half, seg) {
  const n = seg || 28;
  const A = axis === 'y' ? new Vec3(0, 1, 0) : axis === 'z' ? new Vec3(0, 0, 1) : new Vec3(1, 0, 0);
  const U = axis === 'x' ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0);
  const V = axis === 'z' ? new Vec3(0, 1, 0) : new Vec3(0, 0, 1);
  const st = (t, rr) => ({
    o: new Vec3(c[0] + A.x * t, c[1] + A.y * t, c[2] + A.z * t),
    u: U, v: V, pts: ringOutline(rr, n),
  });
  /* A rim that rolls over at each face rather than a cut-off tube: a
     magazine with a sharp edge reads as a coin. */
  sweepPath(g, [
    st(-half, r * 0.80), st(-half * 0.72, r), st(half * 0.72, r), st(half, r * 0.80),
  ], true, true);
}

function svcMag(g, K) {
  const M = K.mag;
  if (!M || M.kind === 'none') return;
  if (M.kind === 'drum') {
    /* Faces left and right, hanging under the receiver, with the neck
       that goes up into the magazine well. */
    svcDisc(g, 'z', [M.x, M.y - M.r * 0.86, 0], M.r, M.w);
    svcDisc(g, 'z', [M.x, M.y - M.r * 0.86, 0], M.r * 0.34, M.w + 0.0035, 20);
    svcSlab(g, [[M.x - 0.011, M.y + 0.004, M.r * 0.30, 0.0105, 4],
      [M.x + 0.011, M.y + 0.004, M.r * 0.30, 0.0105, 4]]);
    return;
  }
  if (M.kind === 'pan') {
    /* The record player: flat on top of the receiver, axis straight up. */
    svcDisc(g, 'y', [M.x, M.y, 0], M.r, 0.011);
    svcDisc(g, 'y', [M.x, M.y + 0.012, 0], M.r * 0.30, 0.006, 18);
    return;
  }
  if (M.kind === 'side') {
    /* OUT TO THE LEFT, HORIZONTALLY.
     *
       The FG42 is the one rifle in the table anybody can name from its
       silhouette alone, and the reason is the magazine: it feeds from
       a twenty-round box lying flat out of the left side of the
       receiver, which is why the gun is so narrow head-on and why the
       sights sit offset. It was carried here as `kind: none` -- no
       magazine at all -- so the model was an FG42 with the one feature
       that makes it an FG42 left off.

       The sweep runs along -Z because the ejection port is at +Z, so
       +Z is the firing side and the magazine is opposite it. The
       cross-section is therefore in X and Y: fore-and-aft is the
       length of the round, up-and-down is its diameter, and the stack
       is what the sweep walks along. */
    const n = 6, sts = [], out = M.out || 0.135, z0 = M.z0 || 0.020;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const taper = 1 - t * 0.07;
      sts.push({
        o: new Vec3(M.x, M.y - t * out * 0.05, -(z0 + t * out)),
        u: new Vec3(1, 0, 0), v: AU,
        pts: roundRect(M.d * taper, M.d * taper, M.w * taper, 3.2, 16),
      });
    }
    sweepPath(g, sts, true, true);
    return;
  }
  if (M.kind === 'belt') {
    /* THE LINKS ONLY. The rounds in them are brass and these are
       steel, and they are different geometry channels -- drawing the
       cartridges here put them in the magazine's blued material, so
       the MG 34's belt was a short black strip under the receiver that
       read as nothing at all. svcRounds draws them now, off the same
       link positions.

       Longer, too, and swung out to the left as it falls: a belt is
       the one part of a machine gun you see from across the map, and
       seven links over 34 mm is a tab, not a belt. */
    for (const L of svcBeltLinks(M, K)) {
      svcSlab(g, [[L.x - 0.0046, 0.0032, 0.0032, 0.0235, 3],
        [L.x + 0.0046, 0.0032, 0.0032, 0.0235, 3]],
      L.z, true, true, L.y + 0.0032);
    }
    return;
  }
  /* The ordinary case: a box magazine, straight or curved, hanging out
     of the well. `curve` is how far the bottom swings forward.
   *
     THE CROSS-SECTION IS SQUARE TO THE SWEEP, not along it. The first
     version set the station's u axis to the direction the magazine
     runs in, which is the one direction it cannot be: sweepPath lays
     the outline in the u-v plane and then walks it from station to
     station, so a u pointing down the sweep gives every section zero
     depth and the magazine came out as a sliver of nothing. Every AK
     in the table was standing there without one. */
  /* `up` for a gun that feeds from ABOVE. The Bren is the one in this
     table: its curved thirty-round box stands up out of the receiver,
     which is why its sights are offset to the left, and it was being
     swept downward like everybody else's -- a top-fed light machine
     gun with its magazine hanging out of the bottom, and only the feed
     lips showing where the magazine is supposed to be. The direction
     is one sign, and the rounds inside use the same formula, so they
     follow it. */
  const sg = M.up ? -1 : 1;
  /* A MAGAZINE INSIDE A GRIP LEANS WITH THE GRIP.
   *
     On a rifle the magazine hangs below the receiver in open air and
     `curve` is the whole story. On a PISTOL the magazine is inside the
     grip, and the grip leans -- gripStack takes a `rake` and walks its
     sections down an axis of (-rake, -1). The magazine walked straight
     down regardless, so on the Luger, whose grip rakes at 0.58 over
     94 mm, the magazine and the column of brass in it came out through
     the FRONT of the grip about fifty millimetres clear of it: a stack
     of cartridges hanging in mid air in front of the trigger guard.
     Every pistol in the game had some of this; the Luger and the
     broomhandle had all of it.

     So: if the magazine sits over the grip, it takes the grip's rake.
     `mag.rake` overrides, and a rifle has neither and is untouched. */
  const inGrip = K.grip && Math.abs(M.x - K.grip.x) < 0.020;
  const rake = M.rake != null ? M.rake : (inGrip ? (K.grip.rake || 0) : 0);
  const lean = Math.atan(rake);
  const n = 8, sts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = lean + M.curve * t;
    const x = M.x - Math.sin(a) * M.len * t + Math.sin(M.curve * t) * M.len * t * 0.62;
    const y = M.y - sg * Math.cos(a) * M.len * t;
    /* Down the magazine is (sin a, -cos a); square to it, in the same
       plane, is (cos a, sin a) -- which at the top is straight forward,
       exactly where a magazine's thickness lies. */
    const taper = 1 - t * 0.05;
    sts.push({
      o: new Vec3(x, y, 0),
      u: new Vec3(Math.cos(a), Math.sin(a), 0),
      v: AV,
      pts: roundRect(M.d * taper, M.d * taper,
        M.w * (M.kind === 'stick' ? taper : 1), 3.6, 18),
    });
  }
  /* A floor plate: one more station, wider and shallower, so the base
     has a lip instead of being a cut-off tube. */
  const last = sts[n];
  const aL = lean + M.curve;
  sts.push({
    o: new Vec3(last.o.x + Math.sin(aL) * 0.008,
      last.o.y - sg * Math.cos(aL) * 0.008, 0),
    u: new Vec3(Math.cos(aL), Math.sin(aL), 0), v: AV,
    pts: roundRect(M.d + 0.0022, M.d + 0.0022, M.w + 0.0022, 4, 18),
  });
  sweepPath(g, sts, true, true);
}

/* ==================================================================
   THE HUNDRED SMALL THINGS
   ==================================================================
   What separates a blockout from a gun.

   A swept receiver, a tube barrel and a plain grip get the silhouette
   right, and at ten metres a silhouette is most of what you see. Up
   close it is a toy: there is nothing on it. A real gun is covered in
   things that had to be there for a reason -- a lever to select fire, a
   catch to drop the magazine, pins holding the two halves together,
   loops for a sling, screws into the gas block, a lip round the
   ejection port so the brass clears.

   All of it is here, once, on the shared builder. Adding a selector
   lever adds one to thirty-three guns, and getting the trigger pin
   wrong gets it wrong on thirty-three -- which is the bargain the whole
   table makes and the reason it is worth making.
   ================================================================== */

function svcDetails(g, K) {
  const R = K.rec, W = R.w;

  /* The ejection port. A recess is not a port: a real one has a lip
     standing proud of the receiver wall to throw the case clear, and a
     shelf below it. */
  const p = K.port;
  if (p) {
  svcSlab(g, [[p.x0 - 0.004, p.up + 0.0035, -p.down + 0.0005, 0.0035, 5],
    [p.x0, p.up + 0.0035, -p.down + 0.0005, 0.0035, 5]], W + 0.0005);
  svcSlab(g, [[p.x1, p.up + 0.0035, -p.down + 0.0005, 0.0035, 5],
    [p.x1 + 0.004, p.up + 0.0035, -p.down + 0.0005, 0.0035, 5]], W + 0.0005);
  svcSlab(g, [[p.x0 - 0.004, p.up + 0.0045, -p.up - 0.0010, 0.0030, 5],
    [p.x1 + 0.004, p.up + 0.0045, -p.up - 0.0010, 0.0030, 5]], W + 0.0010);
  svcSlab(g, [[p.x0 - 0.002, -p.down + 0.0010, p.down + 0.0030, 0.0032, 5],
    [p.x1 + 0.002, -p.down + 0.0010, p.down + 0.0030, 0.0032, 5]], W + 0.0010);
  }

  /* The selector, on the left, where a thumb reaches it. A paddle on a
     round boss -- and the boss matters, because a lever growing
     straight out of a flat wall is a sticker. */
  /* EVERY FIELD DEFAULTED SEPARATELY, not the whole object at once.
   *
     This was `K.selector || { x, y }` -- a fallback for the whole
     thing. I then added a `selector` to the base spec carrying a kind
     and a side and NO x or y, which satisfied the `||` and left
     sel.x undefined. Undefined reaches strut, Math.hypot returns NaN,
     and `NaN || 1` is 1 -- so the length guard does not catch it and
     the direction comes out NaN. 394 vertices of NaN on six rifles,
     which the GPU discards silently: parts that are simply not there.

     That is the "or missing" in the report, and I caused it an hour
     before finding it. An object-level `||` is a trap whenever the
     object can be partially specified; each field defaults on its
     own now. */
  const SEL = K.selector || {};
  const sel = {
    kind: SEL.kind || 'lever',
    side: SEL.side != null ? SEL.side : -1,
    x: SEL.x != null ? SEL.x : R.rear + 0.052,
    y: SEL.y != null ? SEL.y : -R.down * 0.10,
  };
  const sz = sel.side;
  if (sel.kind === 'plate') {
    /* THE AK'S, AND IT IS A DIFFERENT OBJECT. Not a thumb lever: a
       stamped bar as long as the ejection port, on the RIGHT side,
       with a bent tab at the top. It is one of the most recognisable
       things about the rifle, and a generic paddle in its place is
       most of why an AK reads as a generic carbine. */
    const off = W + 0.0012;
    strut(g, [sel.x - 0.004, sel.y, sz * off], [sel.x + 0.062, sel.y + 0.012, sz * off],
      roundRect(0.0062, 0.0062, 0.0016, 3.0, 12));
    strut(g, [sel.x + 0.058, sel.y + 0.012, sz * off],
      [sel.x + 0.070, sel.y + 0.020, sz * (off + 0.0060)],
      roundRect(0.0055, 0.0055, 0.0018, 3.0, 12));
    /* The AB / OD marks above the lever's travel. At sel.y + 0.030 and
       + 0.054 the upper one stood THIRTY-FOUR MILLIMETRES above a
       receiver only twenty-four tall -- two little studs hanging in
       the air over the rifle. They belong on the wall, inside the
       receiver's own height, which is where they are stamped. */
    for (const dy of [0.0, 0.0125]) {
      const my = Math.min(sel.y + 0.010 + dy, R.up - 0.004);
      strut(g, [sel.x + 0.056, my, sz * (W + 0.0002)],
        [sel.x + 0.056, my, sz * (W + 0.0014)],
        ringOutline(0.0022, 8));
    }
  } else {
  /* The boss the lever turns on. It has to be a raised round plate: a
     lever growing straight out of a flat wall is a sticker. */
  strut(g, [sel.x, sel.y, -W - 0.0065], [sel.x, sel.y, -W + 0.0005],
    ringOutline(0.0078, 14));
  /* THE POSITIONS. A selector is not a lever, it is a lever AND the
     stops it clicks into, and those stops are what tell you at a
     glance whether the gun in your hands is a two-position rifle or a
     three-position one. Semi-only guns get SAFE and FIRE; anything
     that will run away gets SAFE, SEMI and AUTO, in that order down
     the plate the way nearly every service rifle of the century laid
     them out.

     They are small raised detents round the boss rather than lettering
     -- at the distance a viewmodel is held, the shape of the stops
     reads and engraving does not. */
  {
    const auto = K.auto !== false;
    const stops = auto ? [0.95, 0.30, -0.42] : [0.95, -0.15];
    for (const a of stops) {
      const dx = sel.x + Math.cos(a) * 0.0108;
      const dy = sel.y + Math.sin(a) * 0.0108;
      /* THROUGH THE WALL, not hovering outside it. These ran from
         -W-0.0072 to -W-0.0018 -- entirely clear of the receiver at
         -W, with a 1.8 mm gap -- and they sit 10.8 mm out from a boss
         whose plate is only 7.8 mm, so they touched the boss either.
         Three little pips floating beside the selector on forty-five
         weapons. A detent is a stop pressed into the wall; it starts
         in the wall. Found by attached.test.js. */
      strut(g, [dx, dy, -W - 0.0072], [dx, dy, -W + 0.0004], ringOutline(0.0013, 8));
    }
  }
  /* And the lever itself, sitting on whichever stop the gun is set to
     -- the top one, SAFE, is wrong for a weapon somebody is carrying
     into a fight, so it rests on the one below it. */
  strut(g, [sel.x, sel.y, -W - 0.0050], [sel.x - 0.020, sel.y - 0.011, -W - 0.0062],
    roundRect(0.0038, 0.0038, 0.0024, 4, 10));
  }

  /* The magazine catch, at the back of the well.
   *
     BELOW THE RECEIVER, where a catch is and where a thumb can reach
     it. It was placed off `K.mag.y + 0.006` -- the magazine's own top,
     which is inside the receiver on every weapon here -- and written
     with a negative `hf`, so it came out as a 12 mm block buried in
     the middle of the receiver. Twenty-three weapons had a magazine
     release you could not see and could not have pressed. Flagged by
     attached.test.js as a cluster touching nothing, which is exactly
     what a part sealed inside a solid looks like from outside: the
     test cannot tell "floating in air" from "buried in steel", and
     both are wrong. */
  if (K.mag && K.mag.kind !== 'none' && K.mag.kind !== 'pan') {
    const mx = K.mag.x - K.mag.d - 0.006;
    const my = -R.down - 0.004;
    svcSlab(g, [[mx - 0.008, 0.0055, 0.0055, 0.0060, 4],
      [mx + 0.004, 0.0055, 0.0055, 0.0060, 4]], 0, true, true, my);
  }

  /* Two takedown pins through the receiver, which is how every one of
     these comes apart.

     THESE WERE BOTH IN THE WRONG PLACE, AND IN THE SAME WRONG PLACE.
     `band` sweeps along the BORE axis -- its first two arguments are x
     -- so `band(-W, +W, ...)` drew a stub a centimetre long lying down
     the barrel line at the origin, twice, and the loop variable `px`
     that says where each pin goes was never read. Thirty-three
     weapons, two pins each, none of them where a pin is.

     A pin goes ACROSS the receiver, which is a run from one wall to
     the other: that is `strut`, not `band`. The head stands a
     millimetre and a half proud on the left, the way a real one
     does. */
  for (const px of [R.rear + 0.030, R.front - 0.026]) {
    const py = -R.down * 0.35;
    strut(g, [px, py, -W - 0.0015], [px, py, W + 0.0015], ringOutline(0.0044, 12));
    // The head, on the left, where your thumb pushes it.
    strut(g, [px, py, -W - 0.0032], [px, py, -W - 0.0012], ringOutline(0.0062, 12));
  }
  /* And the pin the trigger hangs on. */
  {
    const ty = -R.down - 0.0015;
    strut(g, [R.rear + 0.058, ty, -W - 0.0012], [R.rear + 0.058, ty, W + 0.0012],
      ringOutline(0.0032, 10));
  }

  /* Sling swivels: one forward, one on the butt. A gun with nowhere to
     put a sling is a prop.
   *
     AND ONLY WHERE THERE IS SOMETHING TO BOLT ONE TO. The forward
     swivel was drawn unconditionally, so every pistol in the table --
     which has neither a handguard nor a stock -- carried a 20 mm steel
     ring hanging in mid air two centimetres under its barrel, fixed to
     nothing. It is the small floating O under the Luger, the Webley
     and the Tokarev in every photograph of them, and it was there
     because the `hg` branch has an `else` that assumes a barrel to
     hang it from rather than asking whether the weapon takes a sling
     at all. A pistol does not. Neither does a sawn-off. */
  const slung = (K.hg && K.hg.kind !== 'none') || (K.stock && K.stock.kind !== 'none');
  if (slung) {
    const fx = K.hg && K.hg.kind !== 'none' ? K.hg.x1 - 0.014 : K.barrel.rear + 0.060;
    /* HUNG OFF WHATEVER IS ACTUALLY ABOVE IT. `-(barrel.r1 + 0.010)`
       put the loop's top six millimetres BELOW the barrel on every gun
       with no wooden forend -- the Grease Gun, the MP 40, the Micro
       Uzi, the Skorpion, the Stinger -- so the swivel was bolted to
       air there too, in the same way it was on the pistols and for the
       same reason: a height guessed from the barrel rather than taken
       from the part it hangs on. */
    const fy = K.hg && K.hg.kind === 'wood' ? -K.hg.drop
      : (K.hg && K.hg.kind === 'tube' ? -K.hg.r : -K.barrel.r1);
    band(g, fx - 0.0022, fx + 0.0022, 0.0060, 0.0100, 14, fy - 0.006, 0);
  }
  if (K.stock && K.stock.kind !== 'none') {
    const bx = K.stock.butt + 0.055;
    band(g, bx - 0.0022, bx + 0.0022, 0.0060, 0.0100, 14, -K.stock.drop * 0.92, 0);
  }

  /* The front sight base: a block with a pin through it, rather than a
     post growing out of the barrel. */
  const S = K.sight;
  spin(g, [[S.frontX - 0.013, K.barrel.r1], [S.frontX - 0.010, K.barrel.r1 + 0.0075],
    [S.frontX + 0.010, K.barrel.r1 + 0.0075], [S.frontX + 0.013, K.barrel.r1]], 18, 30);
  band(g, S.frontX - 0.0016, S.frontX + 0.0016, K.barrel.r1 + 0.006, K.barrel.r1 + 0.0105,
    10, 0, 0);

  /* A screw in the gas block, and one in the barrel band. */
  if (K.barrel.gas) {
    band(g, K.barrel.gasAt + 0.012, K.barrel.gasAt + 0.017, 0.0, 0.0034, 10,
      K.barrel.r1 + 0.009, 0);
  }

  /* Rivets, on the ones that are pressed out of sheet rather than
     milled from a billet. Six a side, which is what a stamped receiver
     looks like and what makes it read as stamped. */
  if (R.e >= 4.4) {
    /* THE SAME MISTAKE AS THE PINS, AND THIS ONE WAS SIGNED. `rx` --
       where along the receiver each rivet goes -- was computed, never
       used, and then explicitly discarded with `void rx;` to stop a
       linter complaining about it. Twelve rivets, all twelve at the
       origin, on top of one another, on every stamped gun in the game.

       A rivet is a dome standing proud of the wall, which is a short
       run across the plate with a rounded head: one strut per side, at
       the x the loop worked out. */
    for (let i = 0; i < 6; i++) {
      const rx = R.rear + 0.024 + i * (R.front - R.rear - 0.050) / 5;
      const ry = -R.down * 0.42;
      for (const sz of [-1, 1]) {
        strut(g, [rx, ry, sz * (W + 0.0002)], [rx, ry, sz * (W + 0.0019)],
          ringOutline(0.0031, 10));
        // and the dome on the end of it
        spin(g, [[rx - 0.0022, 0.0], [rx - 0.0015, 0.0026], [rx + 0.0015, 0.0026],
          [rx + 0.0022, 0.0]], 10, 30, ry, sz * (W + 0.0019));
      }
    }
  }

}

/* ==================================================================
   THE AMMUNITION
   ==================================================================
   A cartridge is a brass case with a shoulder, a neck, and a bullet
   standing out of the neck -- and the bullet is a different metal from
   the case, which is the whole reason you can tell at a glance whether
   a magazine is full.

   Built as two geometries, `shell` and `tip`, so the case and the
   projectile take their own materials. A single-material round is a
   brass-coloured stick and reads as nothing.
   ================================================================== */

function svcCartridge(shell, tip, A, o, u, v) {
  const R = A.caseR, L = A.len;
  /* Along the round: the head with its rim, the body, the shoulder
     pinching in, the neck, and then the bullet out of the front. */
  const prof = [
    [0.000, 0.0000], [0.000, R * 1.06], [0.0035, R * 1.06], [0.0045, R],
    [L * 0.56, R], [L * 0.64, R * 0.80], [L * 0.68, R * 0.78],
  ];
  const sts = prof.map(function (q) {
    return { o: new Vec3(o.x + u.x * q[0], o.y + u.y * q[0], o.z + u.z * q[0]),
      u: v, v: new Vec3().crossVectors(u, v).normalize(),
      pts: ringOutline(Math.max(0.00012, q[1]), 14) };
  });
  sweepPath(shell, sts, true, false);
  /* The bullet: an ogive, not a cone. A cone reads as a pencil. */
  const bp = [
    [L * 0.66, R * 0.78], [L * 0.80, R * 0.76], [L * 0.90, R * 0.66],
    [L * 0.97, R * 0.42], [L * 1.00, 0.0001],
  ];
  const bs = bp.map(function (q) {
    return { o: new Vec3(o.x + u.x * q[0], o.y + u.y * q[0], o.z + u.z * q[0]),
      u: v, v: new Vec3().crossVectors(u, v).normalize(),
      pts: ringOutline(Math.max(0.00012, q[1]), 14) };
  });
  sweepPath(tip, bs, true, true);
}

/* The column inside a magazine. Double-stacked and staggered, which is
   why a thirty-round box is two rounds wide and not thirty tall -- and
   staggering them is what makes the stack read as separate rounds
   rather than as a striped block. */
/* HOW MANY BANDS THE COLUMN OF ROUNDS IS CUT INTO.
 *
   The rounds inside a magazine were one geometry, so they were one
   actor, so a magazine showed a full column of brass whether it held
   thirty rounds or none. You watch a translucent magazine precisely so
   you can see what is left in it -- that is why real ones are made
   translucent, and the comment on the `smoke` material says so -- and
   this one always said "full".

   One actor per round would be honest and costs thirty actors per gun
   on a rifle, times every gun on the map. Four bands is the compromise
   that buys the thing that matters: a magazine that is visibly going
   down. Quarter resolution on the count, four actors instead of
   thirty.

   Band 0 is at the FEED LIPS and the last to go. That is the right way
   round and it is worth saying why, because the intuition runs the
   other way: rounds leave from the top, but the follower pushes the
   stack up behind them, so the column always starts at the lips and it
   is the BOTTOM of it that disappears. A magazine that emptied from
   the top would have a floating stack with a gap above it. */
const ROUND_BANDS = 4;

/* How far above the magazine's stated y the feed lips sit. The mag's
   own y is where its body starts; the round on top of the follower
   rides a few millimetres proud of that, which is the height the bolt
   face actually meets it at. */
const A_FEED_LIFT = 0.006;

/* Where each link of the exposed belt sits: back from the feed tray,
   falling faster as it goes, and drifting out to the left -- which is
   the side a Maxim-pattern gun's belt hangs on, and the side the model
   ejects away from. Shared between the links and the rounds in them
   so the two cannot drift apart. */
function svcBeltLinks(M, K) {
  /* THE FIRST LINK HAS TO BE IN THE GUN. The belt starts at the
     magazine's own y, which on these four sits 4 mm below the
     receiver's underside -- so the whole belt, links and brass
     together, hung clear of the weapon touching nothing. My own,
     from the commit that gave these guns a belt at all, and found by
     attached.test.js rather than by looking: it is a big obvious part
     and it still read as fine in every photograph, because a belt
     hanging just under a receiver looks like a belt hanging just
     under a receiver. */
  const y0 = K && K.rec ? Math.max(M.y, -K.rec.down + 0.002) : M.y;
  /* EQUAL STEPS ALONG THE PATH, not equal steps in t.
   *
     The fall is quadratic, so eleven links at equal t put the first
     two a millimetre apart and the last two NINETEEN -- and a link is
     6.4 mm tall. The bottom half of the belt came apart into separate
     plates hanging in a line with air between them. From the side it
     looked like a belt; it was a dotted line, and no photograph of it
     said otherwise. attached.test.js did, by flagging the lower links
     as a cluster that reaches nothing.

     So: measure the path, then lay links along it at a fixed pitch a
     little shorter than a link is long, so consecutive plates always
     overlap however steeply the curve is falling. */
  const at = (t) => [M.x - t * 0.050, y0 - t * t * 0.100, -t * t * 0.024];
  const S = 64, cum = [0];
  let prev = at(0);
  for (let i = 1; i <= S; i++) {
    const q = at(i / S);
    cum.push(cum[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]));
    prev = q;
  }
  const len = cum[S];
  const n = Math.max(8, Math.round(len / 0.0082) + 1);
  const out = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const want = (k / (n - 1)) * len;
    while (seg < S - 1 && cum[seg + 1] < want) seg++;
    const span = cum[seg + 1] - cum[seg] || 1;
    const t = (seg + (want - cum[seg]) / span) / S;
    const q = at(Math.min(1, t));
    out.push({ t: Math.min(1, t), x: q[0], y: q[1], z: q[2] });
  }
  return out;
}

function svcRounds(shell, tip, K) {
  const M = K.mag, A = K.ammo;
  if (!M || M.kind === 'none' || !A) return;
  /* A SIDE MAGAZINE IS STEEL AND YOU CANNOT SEE INTO IT.
     Every other magazine in the table is smoked polymer with the
     column showing through, so the rounds are drawn and they hang
     downward out of the well. Give the FG42 one of those and the
     photograph is a rifle with a stack of brass dangling under the
     receiver and the magazine itself edge-on behind it. The FG42's is
     an opaque box lying flat on the left, so there is nothing to
     draw. */
  if (M.kind === 'side') return;
  const across = new Vec3(0, 0, 1);

  if (M.kind === 'drum' || M.kind === 'pan') {
    /* Round the rim, nose inward, which is how both of them hold it. */
    const n = M.kind === 'pan' ? 24 : 20;
    const cy = M.kind === 'pan' ? M.y : M.y - M.r * 0.86;
    const rr = M.r * 0.66;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU;
      const c = Math.cos(th), si = Math.sin(th);
      /* A drum and a pan go into band 0 whole. You cannot see into
         either of them well enough for a count to mean anything, and
         a drum that emptied in quarters would be a quarter of a ring
         of brass hanging in mid air. */
      if (M.kind === 'pan') {
        svcCartridge(shell[0], tip[0], A, new Vec3(M.x + c * rr, cy + 0.002, si * rr),
          new Vec3(-c, 0, -si), new Vec3(0, 1, 0));
      } else {
        svcCartridge(shell[0], tip[0], A, new Vec3(M.x + c * rr, cy + si * rr, 0),
          new Vec3(-c, -si, 0), across);
      }
    }
    return;
  }
  if (M.kind === 'belt') {
    /* A belted round lies ACROSS the gun, nose pointing at the feed
       tray, not fore-and-aft like one in a box. The old code swept a
       7.6 mm tube along X for each link -- a stub, in the wrong
       material, pointing the wrong way. */
    for (const L of svcBeltLinks(M, K)) {
      svcCartridge(shell[0], tip[0], A,
        new Vec3(L.x, L.y + 0.0014, L.z - A.len * 0.5),
        new Vec3(0, 0, 1), new Vec3(1, 0, 0));
    }
    return;
  }

  /* A box: walk down the magazine's own curve, one round every pitch,
     alternating left and right of centre. Only as far as the magazine
     actually goes. */
  const n = Math.min(A.rounds, Math.floor(M.len / A.pitch) * 2);
  const half = A.len * 0.50;
  const sg = M.up ? -1 : 1;              // see the note on M.up in svcMag
  const inGrip = K.grip && Math.abs(M.x - K.grip.x) < 0.020;
  const rake = M.rake != null ? M.rake : (inGrip ? (K.grip.rake || 0) : 0);
  const lean = Math.atan(rake);          // and on the grip's rake
  for (let i = 0; i < n; i++) {
    /* Which band this round belongs to. Rounds are laid two per pitch,
       alternating left and right of centre, so the band has to come
       from the POSITION down the magazine (i >> 1) and not from i --
       otherwise a band is half of one course and half of the next, and
       hiding it takes out a zigzag rather than the bottom of the
       stack. */
    const band = Math.min(ROUND_BANDS - 1,
      Math.floor(((i >> 1) / Math.max(1, (n >> 1))) * ROUND_BANDS));
    const shellB = shell[band] || shell[0];
    const tipB = tip[band] || tip[0];
    const t = (i >> 1) * A.pitch / M.len;
    if (t > 0.98) break;
    const a = lean + M.curve * t;
    const x = M.x - Math.sin(a) * M.len * t + Math.sin(M.curve * t) * M.len * t * 0.62;
    const y = M.y - sg * Math.cos(a) * M.len * t;
    const z = ((i & 1) ? 1 : -1) * A.stagger;
    /* Nose forward, along the magazine's own local 'up' -- which is
       the direction the feed lips point. */
    const u = new Vec3(Math.cos(a), Math.sin(a), 0);
    /* Started half a cartridge behind the centre line, so the round is
       centred in the magazine instead of hanging out of the front of
       it. `half` is the magazine's own depth, which is now derived from
       this same length. */
    svcCartridge(shellB, tipB, A,
      new Vec3(x - u.x * half, y - u.y * half, z), u, across);
  }
}

/* THE ROUND THE BOLT IS CARRYING.
 *
   The last part of a cycle that this gun did not have. The bolt moves,
   the column in the magazine goes down, and the brass comes out of the
   port -- but the thing joining those three, the round being stripped
   off the top of the magazine and pushed into the chamber, was simply
   missing. Watch a rifle closely and that is the motion you see: the
   bolt goes back over an empty feed, then comes forward and takes the
   top round with it.

   One cartridge, built at the ORIGIN and lying along the bore, so it
   can be flown from the feed lips to the chamber by moving its actor
   rather than by rebuilding anything. The arm carries the two ends of
   that journey and the game asks for a position along it.

   Nothing to do with the rounds in the magazine: those are four static
   bands that switch off in order. This is one moving object, and it is
   only ever visible during the few hundredths of a second the bolt is
   running forward. */
function svcFeedRound(shell, tip, K) {
  const A = K.ammo, M = K.mag;
  if (!A || !M || M.kind === 'none' || M.kind === 'belt') return;
  svcCartridge(shell, tip, A, new Vec3(0, 0, 0),
    new Vec3(1, 0, 0), new Vec3(0, 0, 1));
}

/* A bipod, folded down. Two legs off a yoke under the barrel, which is
   the difference between a machine gun and a very heavy rifle. */
function svcBipod(g, K) {
  const P = K.bipod;
  if (!P) return;
  const yokeY = -K.barrel.r1 - 0.004;
  band(g, P.x - 0.010, P.x + 0.010, K.barrel.r1, K.barrel.r1 + 0.007, 16);
  for (const sz of [-1, 1]) {
    strut(g, [P.x, yokeY, sz * 0.006], [P.x - P.rake, yokeY - P.len, sz * P.spread],
      roundRect(0.0040, 0.0040, 0.0040, 3, 10));
    /* The foot, which is what stops it sinking into the floor and is
       also the only part of it anybody ever looks at. */
    strut(g, [P.x - P.rake, yokeY - P.len, sz * P.spread],
      [P.x - P.rake - 0.016, yokeY - P.len - 0.002, sz * P.spread],
      roundRect(0.0035, 0.0035, 0.0055, 4, 10));
  }
}

/* A CROSSBOW IS NOT A RIFLE WITH A BIPOD ON IT.
 *
 * The limbs were drawn by svcBipod, on the reasoning -- written down
 * in the table -- that "two arms swept out and forward from a point
 * under the barrel is exactly what a bipod is and exactly what a
 * crossbow's limbs are". They are not. A bipod has two STRAIGHT legs
 * with feet on them, and the crossbow came out as a rifle with an X
 * across the front: no curve, no taper, little rubber feet on the
 * ends, and above all NO STRING. A bow without a string is a stick.
 *
 * What is actually there: a riser across the front of the rail, two
 * limbs that taper and curve back as they go out, a string from tip to
 * tip drawn back to the latch, and a bolt lying in the groove with its
 * nock against the string. The string is the part that makes the
 * silhouette read, because it is the only straight line on the weapon
 * that goes anywhere diagonally.
 */
function svcLimbs(g, K) {
  const L = K.limbs;
  if (!L) return;
  const x = L.x, y = L.y || 0, sp = L.spread, back = L.sweep || 0.030;
  // The riser: the block the limbs bolt into, across the rail.
  svcSlab(g, [[x - 0.016, 0.0090, 0.0090, 0.0170, 3.4],
    [x + 0.014, 0.0075, 0.0075, 0.0150, 3.4]], 0, true, true, y);
  for (const sz of [-1, 1]) {
    /* Two segments so the limb bends rather than pointing. A limb is
       a leaf spring: thick at the riser, thin at the tip. */
    const mid = [x - back * 0.34, y + 0.0050, sz * sp * 0.55];
    const tip = [x - back, y + 0.0130, sz * sp];
    strut(g, [x, y, sz * 0.0130], mid, roundRect(0.0038, 0.0038, 0.0090, 3, 10));
    strut(g, mid, tip, roundRect(0.0026, 0.0026, 0.0062, 3, 10));
    // The tip nock, which is what the loop of the string sits in.
    strut(g, tip, [x - back - 0.006, y + 0.0150, sz * (sp + 0.004)],
      roundRect(0.0024, 0.0024, 0.0034, 3, 8));
    /* And the string, tip to latch. 1.6 mm of cord, and the whole
       reason anybody can tell what this weapon is. */
    /* 2.4 mm. It photographed as a DASHED line at 640 px and I
       thickened it on the assumption that was the cause; it still
       dashed, so I rendered the same model at 1280 and it came out
       solid. The dashing is rasterisation of a sub-two-pixel feature
       and nothing is wrong with the geometry -- which is worth the
       note, because a broken-looking string is exactly the kind of
       thing that gets "fixed" three times by guessing. 2.4 mm is
       roughly a served bowstring anyway, so it stays. */
    strut(g, tip, [L.latch, y + 0.0110, 0], roundRect(0.0012, 0.0012, 0.0012, 2, 8));
  }
  if (L.bolt !== false) {
    /* The bolt in the groove, nock against the string. A crossbow
       carried with nothing on the rail is a crossbow nobody has
       loaded. */
    const bx0 = L.latch + 0.004, bx1 = x + 0.150;
    tubeRun(g, [[bx0, 0.0038], [bx1 - 0.030, 0.0038]], 8, true, false, y + 0.0110, 0);
    // Head: a short four-sided broadhead taper.
    spin(g, [[bx1 - 0.030, 0.0000], [bx1, 0.0000], [bx1, 0.0010],
      [bx1 - 0.026, 0.0072], [bx1 - 0.030, 0.0040]], 4, 0, y + 0.0110, 0);
    // Fletching, three vanes at the nock end.
    for (let i = 0; i < 3; i++) {
      const th = (i / 3) * TAU;
      strut(g, [bx0 + 0.006, y + 0.0110 + Math.cos(th) * 0.0040, Math.sin(th) * 0.0040],
        [bx0 + 0.006, y + 0.0110 + Math.cos(th) * 0.0105, Math.sin(th) * 0.0105],
        roundRect(0.0140, 0.0140, 0.0004, 6, 6));
    }
  }
}

function svcBolt(g, K) {
  const R = K.rec, C = K.charge;
  const x = C ? C.x : R.front - 0.060;
  /* A BOLT CANNOT BE WIDER THAN THE RECEIVER IT RIDES IN.
   *
     Its radius was R.up * 0.52 -- the receiver's outside height -- which
     is right for everything with a receiver and absurd for the one
     entry whose `rec` is not one. The riot shield's rec IS the shield
     face, 520 mm tall, so it was issued a bolt 270 mm across: measured
     at z -0.135 to +0.135 on a slab 27 mm thick, from the same 130
     vertices that give the MG 42 a sensible 30 mm one.
     
     Capping by the receiver's half-width says the same thing the part
     says -- a bolt is inside the gun -- and it is provably free for
     every real weapon, because on all of them R.up * 0.52 is already
     the smaller of the two. Only the slab changes. */
  const r = Math.min(R.up * 0.52, R.w);
  tubeRun(g, [[x - 0.050, r], [x + 0.020, r]], 16, true, true, 0, 0);
}

/* ==================================================================
   THE TABLE
   ==================================================================
   A base gun, and then each entry says only how it differs. That is
   the point of the whole file: an AK-47 is nine lines, not nine
   hundred, and the nine lines are the nine things that make it an AK.
   ================================================================== */

const SVC_BASE = {
  muzzle: 0.430,
  barrel: { rear: 0.055, r0: 0.0115, r1: 0.0086, bore: 0.0039, step: 0.130,
    gas: true, gasAt: 0.300, gasR: 0.0062, gasY: 0.0180 },
  rec: { rear: -0.145, front: 0.090, up: 0.0230, down: 0.0215, w: 0.0165, e: 3.4 },
  port: { x0: 0.010, x1: 0.050, up: 0.0140, down: 0.0020 },
  trigger: { x: -0.052 },
  charge: { x: 0.030, y: 0.0130, z: 0.0225 },
  hg: { kind: 'wood', x0: 0.120, x1: 0.250, r: 0.0200, w: 0.0195, drop: 0.0250, upper: 0.0230 },
  grip: { x: -0.082, y: -0.0180, len: 0.108, rake: 0.40 },
  /* `clear` MAKES A MAGAZINE TRANSLUCENT, AND IT IS NOW OFF BY
     DEFAULT. It used to be on for everything, with a note arguing
     that seeing the column of rounds is worth more than period
     accuracy. The note was defending a real thing -- the rounds are
     modelled and they are nice -- but the consequence was that every
     WWII rifle in the rack hung a smoked-plastic box off a wooden
     stock. A StG 44 and a Kar 98 with translucent magazines do not
     read as slightly inaccurate; they read as toys, and the report
     that came back was about exactly that.

     Two rows turn it back on, and only two, because only two of these
     weapons genuinely have a see-through magazine: the AUG and the
     P90. Everything else is stamped steel, aluminium or opaque
     polymer, and the rounds inside it are simply not visible -- which
     is also why the column now empties from the bottom rather than
     being the main event. */
  mag: { kind: 'box', x: -0.012, y: -0.0215, len: 0.150, curve: 0.30,
    w: 0.0125, d: 0.0135, r: 0.055, clear: false },
  stock: { kind: 'wood', butt: -0.330, comb: 0.0245, drop: 0.0300, w: 0.0195 },
  sight: { y: 0.0335, frontX: 0.355, rearX: 0.020, front: 'ears', rear: 'notch' },
  handle: null, rail: null, bipod: null, rotary: 0,
  mass: 4.3, bound: 0.50,
  origin: new Vec3(-0.082, -0.0180, 0),
  /* Set per gun by svcSpec below from what the furniture actually is.
     The base said poly for everything, so every wooden stock in the
     table -- the STG, the AK, the Thompson, the Garand, both machine
     guns with wood on them -- was rendering as black plastic. That is
     most of why they all photographed so dark. */
  mats: null,
  ammoKind: 'inter',
};

/* THE CARTRIDGE DECIDES HOW DEEP THE MAGAZINE IS.
 *
   Rounds lie ACROSS a box magazine, nose forward, so the magazine's
   front-to-back depth is the length of the round and nothing else. The
   first version set the depth per gun by eye and gave every gun the
   same 47 mm cartridge, so an AK's rounds -- which are 57 mm -- stood
   two centimetres out of the front of a magazine 28 mm deep, in a neat
   brass row hanging in the air. It looked like a belt feed.

   So the depth is derived from the calibre now and a row cannot get it
   wrong. `pitch` is the rise per round in a staggered column and
   `stagger` is how far each one sits off the centre line. */
const AMMO_KINDS = {
  /* 7.92 Kurz and the like: a rifle case cut down. */
  kurz: { caseR: 0.0050, len: 0.048, pitch: 0.0108, stagger: 0.0042, rounds: 30 },
  /* 7.62x39 and 7.63 -- the intermediate rounds. */
  inter: { caseR: 0.0048, len: 0.056, pitch: 0.0112, stagger: 0.0044, rounds: 30 },
  /* 5.56 and 5.45: small, fast and light. */
  small: { caseR: 0.0042, len: 0.052, pitch: 0.0098, stagger: 0.0038, rounds: 30 },
  /* Full power -- .30-06, 7.62x51, 8x57. Long, and it is why a battle
     rifle's magazine is a slab. */
  full: { caseR: 0.0060, len: 0.071, pitch: 0.0128, stagger: 0.0052, rounds: 20 },
  /* Pistol calibre, for everything in the SMG list. */
  pistol: { caseR: 0.0050, len: 0.030, pitch: 0.0106, stagger: 0.0042, rounds: 32 },
  /* 7.62x25 and 7.63x25: a bottlenecked PISTOL round, 35 mm over all.
     The Tokarev was marked `inter`, which in this table means 7.62x39
     at 56 mm -- and because the magazine's depth is derived from the
     cartridge (`mag.d = ammo.len * 0.52`) that gave a service pistol a
     58 mm deep magazine inside a 30 mm grip. Being a bottleneck round
     is not the same as being an intermediate one. */
  pistolBottle: { caseR: 0.0043, len: 0.035, pitch: 0.0100, stagger: 0.0036, rounds: 8 },
};

/* Walnut where there is wood on the gun, polymer where there is not.
   One rule, applied from what the handguard and the stock say they are
   made of, so a row cannot say 'wood' and then render in plastic. */
function svcMats(K) {
  /* `furniture: 'wood'` for a weapon whose woodwork is not a stock or
     a slab forend -- the RPG-7's heat shield is a wooden sleeve round
     the tube, built as a `tube` handguard, and without this it came
     out in grey polymer on a weapon that has never had any. */
  const wooden = (K.hg && K.hg.kind === 'wood') || (K.stock && K.stock.kind === 'wood')
    || K.furniture === 'wood';
  const out = {
    steel: ARM_MAT.blued,
    wood: wooden ? ARM_MAT.walnut : ARM_MAT.poly,
    mag: K.mag && K.mag.clear ? ARM_MAT.smoke : ARM_MAT.blued,
    bolt: ARM_MAT.bright,
    shell: ARM_MAT.brass,
    tip: ARM_MAT.copper,
  };
  for (let i = 0; i < ROUND_BANDS; i++) {
    out['shell' + i] = ARM_MAT.brass;
    out['tip' + i] = ARM_MAT.copper;
  }
  out.feed = ARM_MAT.brass;
  out.feedTip = ARM_MAT.copper;
  return out;
}

/* A shallow merge, one level into the sub-objects, which is as deep as
   this table ever goes. */
function svcSpec(over) {
  const out = {};
  for (const k of Object.keys(SVC_BASE)) {
    const b = SVC_BASE[k], o = over[k];
    if (o === null) { out[k] = null; continue; }
    if (b && typeof b === 'object' && !(b instanceof Vec3) && o && typeof o === 'object') {
      out[k] = Object.assign({}, b, o);
    } else out[k] = (o === undefined ? b : o);
  }
  for (const k of Object.keys(over)) if (!(k in out)) out[k] = over[k];
  /* The grip is the pivot. Every gun is held in the same place, which
     is why one hand solve serves all of them. */
  if (!over.origin) out.origin = new Vec3(out.grip.x, out.grip.y, 0);
  out.ammo = AMMO_KINDS[out.ammoKind] || AMMO_KINDS.inter;
  /* Derived, never taken from the row: see the note on AMMO_KINDS. */
  if (out.mag && out.mag.kind !== 'none') out.mag.d = out.ammo.len * 0.52;
  if (!out.mats) out.mats = svcMats(out);
  return out;
}

const SERVICE_KINDS = {

  /* ---------------- assault rifles ---------------- */

  /* The first one anybody made: a stamped receiver, a long wooden
     handguard and a magazine that hangs almost straight down. */
  stg44: svcSpec({
    ammoKind: 'kurz',
    muzzle: 0.455, rec: { rear: -0.150, front: 0.095, up: 0.0245, w: 0.0170, e: 5 },
    barrel: { gasAt: 0.310, r1: 0.0090 },
    hg: { kind: 'wood', x0: 0.115, x1: 0.240, drop: 0.0245 },
    mag: { curve: 0.34, len: 0.170 },
    stock: { kind: 'wood', butt: -0.345, comb: 0.0210, drop: 0.0320 },
    /* The lightening slots pressed down both sides of the receiver.
       An STG is a sheet-steel pressing and it shows it; an AK hides the
       same construction under a machined-looking trunnion. With both
       of them drawn as a plain box the two came out 0.22 apart. */
    vents: { kind: 'slot', x0: -0.120, x1: 0.060, n: 5, r: 0.0170,
      w: 0.0090, yOff: -0.0050 },
    // The gas cylinder over the barrel runs the length of the forend.
    tube: { x0: 0.100, x1: 0.330, r: 0.0088, y: 0.0210 },
    sight: { y: 0.0355, frontX: 0.380, front: 'hood' },
    mass: 4.6,
  }),
  /* Side-fed, so the magazine goes out to the left and the gun is
     narrow from the front. */
  fg42: svcSpec({
    ammoKind: 'full',
    muzzle: 0.470, barrel: { brake: 'cone', gasAt: 0.330 },
    rec: { rear: -0.140, front: 0.100, up: 0.0215, w: 0.0155 },
    hg: { kind: 'tube', x0: 0.110, x1: 0.215, r: 0.0180, ribs: 8 },
    /* THE BIPOD. The FG42 is a paratrooper's light machine rifle and
       the folding bipod is half of what it is for -- it was simply
       absent, because the table only ever gave one to the LMG rows.
       Type II pattern: hung off the gas block rather than the muzzle,
       which is the change that stopped it whipping the barrel. */
    bipod: { x: 0.300, len: 0.146, rake: 0.026, spread: 0.066 },
    /* 7.92x57, not the Kurz: the FG42 is a full-power rifle, which is
       most of why it needed the raked grip and the muzzle cone it has
       -- and it feeds from the left. */
    /* `clear: false` because the base row sets it true and svcSpec
       merges one level in: every other magazine in the table is
       smoked polymer so the column of rounds reads through it, and
       inheriting that turned this one into a translucent white slab
       hanging off the side of a steel rifle. The FG42's is an opaque
       box and there are no rounds drawn behind it. */
    /* `z0` is where the magazine STARTS, measured out from the centre
       line, and at 0.019 it began 3.5 mm clear of a receiver whose
       wall is at 0.0155 -- a twenty-round box hanging in the air
       alongside the rifle, touching nothing. Found by
       attached.test.js, which is exactly the fault it was written
       for: invisible from the hero angle because the magazine points
       at the camera, and obvious in a plan view nobody takes. */
    mag: { kind: 'side', x: 0.006, y: 0.002, out: 0.135, z0: 0.0142,
      d: 0.0255, w: 0.0130, clear: false },
    grip: { rake: 0.58, len: 0.112 },
    stock: { kind: 'wood', butt: -0.320, comb: 0.0180, drop: 0.0260, w: 0.0165 },
    sight: { y: 0.0345, frontX: 0.395, front: 'ears', rear: 'aperture' },
    mass: 4.9,
  }),
  volkhammer: svcSpec({
    ammoKind: 'kurz',
    /* A PERFORATED JACKET over the whole barrel, which is what a gun
       stamped out of sheet in a hurry and fired until it glowed
       actually looked like -- and is the one silhouette in this rack
       nothing else in its class has. Measured against the AK-47 and
       the STG it was 0.23 and 0.30: the same wooden-forend,
       curved-magazine, hooded-foresight shape as both, differing only
       in millimetres. It is not that any more. */
    muzzle: 0.440, barrel: { brake: 'slots', r0: 0.0130, r1: 0.0098,
      shroud: true, shroudX0: 0.115, shroudX1: 0.405, shroudR: 0.0255 },
    rec: { rear: -0.155, front: 0.100, up: 0.0260, down: 0.0230, w: 0.0180, e: 5.5 },
    hg: { kind: 'none' },
    foregrip: { x: 0.175, len: 0.096, rake: 0.10, under: 0.0255 },
    /* And a bipod folded under the jacket and a handle over it. This
       is the one weapon in the rack that is ours to decide, and what
       it needed deciding INTO was something no real class boundary
       would produce: a stamped assault rifle built to be fired from
       the ground, with the bulk of a squad gun and the magazine of a
       rifle. Left as an AK with a longer receiver it measured 0.28
       against one. */
    bipod: { x: 0.385, len: 0.130, rake: 0.028, spread: 0.070 },
    handle: { x0: 0.150, x1: 0.250, y: 0.0430 },
    rail: { x0: -0.130, x1: -0.010 },
    mag: { curve: 0.42, len: 0.180, w: 0.0135 },
    stock: { kind: 'wood', butt: -0.335, comb: 0.0230, drop: 0.0335, w: 0.0205 },
    sight: { y: 0.0375, frontX: 0.370, front: 'hood' },
    mass: 5.1,
  }),

  /* The self-loaders: long barrels, wood to the muzzle, and the
     magazine is inside the stock or barely below it. */
  garand: svcSpec({
    ammoKind: 'full',
    muzzle: 0.545, barrel: { rear: 0.060, r0: 0.0125, r1: 0.0092, step: 0.170, gasAt: 0.430 },
    rec: { rear: -0.135, front: 0.105, up: 0.0230, down: 0.0195, w: 0.0165, e: 3.6 },
    hg: { kind: 'wood', x0: 0.105, x1: 0.420, drop: 0.0265, w: 0.0205, upper: 0.0215 },
    /* THE OPERATING ROD, down the right side of the barrel from the
       gas cylinder back to the receiver. It is the single most
       recognisable thing on a Garand and it was not there, which left
       the rifle as a plain wooden stock with a hooded foresight -- the
       same description as the pump shotgun, 0.398 away. */
    tube: { x0: 0.100, x1: 0.450, r: 0.0062, y: -0.0060, z: 0.0165 },
    mag: { kind: 'none' },
    stock: { kind: 'wood', butt: -0.365, comb: 0.0215, drop: 0.0345, w: 0.0210 },
    sight: { y: 0.0330, frontX: 0.500, front: 'ears', rear: 'aperture' },
    charge: { x: 0.052, y: 0.0110, z: 0.0225 },
    mass: 4.8,
  }),
  svt40: svcSpec({
    ammoKind: 'full',
    muzzle: 0.520, barrel: { brake: 'slots', gasAt: 0.400, r1: 0.0088 },
    rec: { rear: -0.132, front: 0.100, up: 0.0215, w: 0.0158 },
    hg: { kind: 'wood', x0: 0.108, x1: 0.300, drop: 0.0240 },
    mag: { curve: 0.20, len: 0.120, w: 0.0128 },
    stock: { kind: 'wood', butt: -0.355, comb: 0.0205, drop: 0.0320 },
    sight: { y: 0.0325, frontX: 0.470, front: 'hood' },
    mass: 4.6,
  }),
  bm59: svcSpec({
    ammoKind: 'full',
    muzzle: 0.500, barrel: { brake: 'cage', gasAt: 0.380, r0: 0.0130, r1: 0.0096 },
    rec: { rear: -0.145, front: 0.105, up: 0.0245, down: 0.0220, w: 0.0175 },
    hg: { kind: 'wood', x0: 0.112, x1: 0.290, drop: 0.0265, w: 0.0205 },
    mag: { curve: 0.26, len: 0.165, w: 0.0135, d: 0.0140 },
    stock: { kind: 'wood', butt: -0.350, comb: 0.0225, drop: 0.0330, w: 0.0205 },
    sight: { y: 0.0355, frontX: 0.450, front: 'ears', rear: 'aperture' },
    mass: 5.2,
  }),

  /* Battle rifles: full-power, heavy, and built round a big receiver. */
  falke: svcSpec({
    ammoKind: 'full',
    muzzle: 0.495, barrel: { brake: 'slots', r0: 0.0135, r1: 0.0100, gasAt: 0.360 },
    rec: { rear: -0.155, front: 0.115, up: 0.0265, down: 0.0235, w: 0.0185, e: 5 },
    hg: { kind: 'tube', x0: 0.122, x1: 0.265, r: 0.0230 },
    /* Cooling holes down both sides of the forend, and a vertical grip
       under it. The Falke is ours to draw as we like, and what it is
       for -- a battle rifle held onto through long bursts -- says it
       should be the one in this rack that is built to be gripped and
       to shed heat. */
    vents: { x0: 0.140, x1: 0.252, n: 6, r: 0.0230, r0: 0.0048 },
    foregrip: { x: 0.205, len: 0.092, rake: 0.08, under: 0.0230 },
    rail: { x0: -0.120, x1: 0.030 },
    mag: { curve: 0.22, len: 0.185, w: 0.0140, d: 0.0150 },
    grip: { rake: 0.44 },
    stock: { kind: 'poly', butt: -0.340, comb: 0.0250, drop: 0.0310, w: 0.0195 },
    sight: { y: 0.0395, frontX: 0.420, front: 'hood', rear: 'aperture' },
    mass: 5.6,
  }),
  g3a: svcSpec({
    ammoKind: 'full',
    muzzle: 0.485, barrel: { brake: 'cage', r0: 0.0130, r1: 0.0098, gas: false },
    rec: { rear: -0.158, front: 0.118, up: 0.0255, down: 0.0230, w: 0.0180, e: 5.5 },
    hg: { kind: 'tube', x0: 0.120, x1: 0.255, r: 0.0235 },
    mag: { curve: 0.16, len: 0.180, w: 0.0138, d: 0.0148 },
    /* THE COCKING TUBE, which is the one thing a G3 cannot be drawn
       without. The bolt handle does not sit on the receiver like every
       other self-loader's -- it rides forward in a tube that runs the
       whole length of the barrel above it, and you slap it down into a
       notch at the front. Without it this rifle and the Falke were
       0.23 apart, two roller-locked 7.62s with tube handguards and
       nothing else to tell them by. */
    tube: { x0: 0.100, x1: 0.435, r: 0.0118, y: 0.0268 },
    charge: { x: 0.415, y: 0.0268, z: 0.0195 },
    stock: { kind: 'poly', butt: -0.345, comb: 0.0230, drop: 0.0290, w: 0.0185 },
    sight: { y: 0.0405, frontX: 0.415, front: 'hood', rear: 'aperture' },
    mass: 5.4,
  }),

  /* Kalashnikov pattern: the gas tube above the barrel, the sharply
     curved magazine, and the receiver cover you can see the join of. */
  ak47: svcSpec({
    muzzle: 0.445, barrel: { r0: 0.0125, r1: 0.0092, gasAt: 0.285, gasR: 0.0075,
      gasY: 0.0195, brake: 'slant' },
    /* The cleaning rod, clipped under the barrel from the front of the
       forend to the bayonet lug. Nothing else in the rack wears one,
       and it is the line that runs the length of the rifle in every
       photograph of an AKM ever taken. */
    tube: { x0: 0.230, x1: 0.430, r: 0.0026, y: -0.0125 },
    rec: { rear: -0.148, front: 0.098, up: 0.0250, down: 0.0220, w: 0.0172, e: 4.5 },
    hg: { kind: 'wood', x0: 0.112, x1: 0.215, drop: 0.0250, w: 0.0200, upper: 0.0300 },
    mag: { curve: 0.52, len: 0.175, w: 0.0128, d: 0.0142 },
    grip: { rake: 0.36, len: 0.104 },
    stock: { kind: 'wood', butt: -0.330, comb: 0.0225, drop: 0.0300 },
    sight: { y: 0.0370, frontX: 0.375, front: 'hood' },
    charge: { x: 0.048, y: 0.0175, z: 0.0215 },
    // The big stamped bar down the right side. See svcDetails.
    selector: { kind: 'plate', side: 1, x: 0.020, y: 0.004 },
    mass: 4.8,
  }),
  ak74: svcSpec({
    ammoKind: 'small',
    muzzle: 0.448, barrel: { brake: 'slots', r0: 0.0120, r1: 0.0088,
      gasAt: 0.285, gasR: 0.0075, gasY: 0.0195 },
    rec: { rear: -0.148, front: 0.098, up: 0.0250, down: 0.0220, w: 0.0172, e: 4.5 },
    hg: { kind: 'wood', x0: 0.112, x1: 0.215, drop: 0.0250, w: 0.0200, upper: 0.0300 },
    /* The lateral cooling grooves down the sides of a 74's forend --
       the one thing on the outside of the rifle that an AKM does not
       also have, and therefore the only honest way to tell the two
       apart without changing what either of them is. */
    vents: { kind: 'slot', x0: 0.128, x1: 0.205, n: 3, r: 0.0200, w: 0.0110 },
    grip: { rake: 0.36, len: 0.104 },
    stock: { kind: 'poly', butt: -0.330, comb: 0.0225, drop: 0.0300 },
    selector: { kind: 'plate', side: 1, x: 0.020, y: 0.004 },
    sight: { y: 0.0370, frontX: 0.378, front: 'hood' },
    charge: { x: 0.048, y: 0.0175, z: 0.0215 },
    mass: 4.4,
  }),
  /* Bullpup: the magazine is BEHIND the grip, so the gun is short and
     the balance is all in the shoulder. */
  groza: svcSpec({
    muzzle: 0.330, barrel: { rear: 0.040, r0: 0.0135, r1: 0.0105, step: 0.110, gasAt: 0.220 },
    rec: { rear: -0.215, front: 0.060, up: 0.0265, down: 0.0230, w: 0.0185, e: 5 },
    port: { x0: -0.135, x1: -0.095, up: 0.0140, down: 0.0020 },
    hg: { kind: 'tube', x0: 0.055, x1: 0.160, r: 0.0225 },
    grip: { x: -0.030, y: -0.0190, len: 0.106, rake: 0.30 },
    mag: { curve: 0.34, len: 0.150, x: -0.135, y: -0.0225 },
    stock: { kind: 'none' },
    /* The other half of the AUG problem, and the answer is the other
       way round: the Groza has no handle at all, it has a flat rail
       along the top of the receiver -- and slung under its barrel, a
       40 mm launcher with its own mouth and its own trigger, which is
       the reason the weapon exists. */
    handle: null,
    rail: { x0: -0.150, x1: 0.020 },
    tube: { x0: 0.020, x1: 0.215, r: 0.0215, y: -0.0350, muzzle: true },
    barrel: { rear: 0.040, r0: 0.0135, r1: 0.0105, step: 0.110, gasAt: 0.220,
      brake: 'cone' },
    sight: { y: 0.0470, frontX: 0.045, rearX: -0.050, front: 'ears', rear: 'aperture' },
    charge: { x: 0.010, y: 0.0180, z: 0.0225 },
    mass: 4.2,
  }),

  /* Stoner pattern: the carry handle, the triangular front sight and
     the round handguard. */
  m16: svcSpec({
    ammoKind: 'small',
    muzzle: 0.505, barrel: { brake: 'cage', r0: 0.0112, r1: 0.0082, gasAt: 0.330, gasR: 0.0038 },
    rec: { rear: -0.140, front: 0.100, up: 0.0220, down: 0.0205, w: 0.0160, e: 4 },
    hg: { kind: 'tube', x0: 0.108, x1: 0.240, r: 0.0215 },
    mag: { curve: 0.20, len: 0.170, w: 0.0125, d: 0.0130 },
    grip: { rake: 0.42 },
    stock: { kind: 'poly', butt: -0.330, comb: 0.0215, drop: 0.0240, w: 0.0180 },
    handle: { x0: -0.010, x1: 0.075, y: 0.0395 },
    sight: { y: 0.0430, frontX: 0.355, rearX: 0.055, front: 'ears', rear: 'aperture' },
    charge: { x: -0.012, y: 0.0180, z: 0.0000 },
    mass: 3.9,
  }),
  m4: svcSpec({
    ammoKind: 'small',
    muzzle: 0.400, barrel: { brake: 'cage', r0: 0.0108, r1: 0.0080, gasAt: 0.245, gasR: 0.0038 },
    rec: { rear: -0.140, front: 0.100, up: 0.0220, down: 0.0205, w: 0.0160, e: 4 },
    hg: { kind: 'tube', x0: 0.105, x1: 0.200, r: 0.0210 },
    mag: { curve: 0.20, len: 0.170, w: 0.0125, d: 0.0130 },
    grip: { rake: 0.42 },
    stock: { kind: 'tube', butt: -0.280, comb: 0.0205, drop: 0.0225, w: 0.0175 },
    rail: { x0: -0.012, x1: 0.086 },
    sight: { y: 0.0390, frontX: 0.265, rearX: 0.060, front: 'ears', rear: 'aperture' },
    charge: { x: -0.012, y: 0.0180, z: 0.0000 },
    mass: 3.4,
  }),
  aug: svcSpec({
    ammoKind: 'small',
    muzzle: 0.345, barrel: { rear: 0.045, r0: 0.0128, r1: 0.0094, step: 0.120, gasAt: 0.230 },
    rec: { rear: -0.220, front: 0.065, up: 0.0255, down: 0.0235, w: 0.0180, e: 4.5 },
    port: { x0: -0.140, x1: -0.100, up: 0.0140, down: 0.0020 },
    hg: { kind: 'tube', x0: 0.060, x1: 0.150, r: 0.0230 },
    grip: { x: -0.026, y: -0.0195, len: 0.104, rake: 0.26 },
    /* One of the two magazines in this rack that really is
       translucent: the AUG's is a smoked polymer box and you can count
       the rounds in it through the side. See the note on the base
       row. */
    mag: { curve: 0.24, len: 0.155, x: -0.140, y: -0.0230, clear: true },
    stock: { kind: 'none' },
    /* NOT A CARRY HANDLE. The AUG's handle is a 1.5x optical sight cast
       into the receiver -- you cannot take it off and there are no iron
       sights under it, which is the whole reason the rifle looks the
       way it does. Drawn as the Groza's steel loop it was the Groza's
       steel loop, and the two of them measured 0.15 apart on a rack
       whose median pair is 0.96. */
    handle: null,
    optic: { x0: -0.098, x1: 0.046, r: 0.0168, bell: 0.0215, y: 0.0455 },
    // And the folding vertical grip, which nothing else here has.
    foregrip: { x: 0.112, len: 0.088, rake: 0.05, under: 0.0230 },
    sight: { y: 0.0500, frontX: 0.035, rearX: -0.060, front: 'none', rear: 'none' },
    charge: { x: 0.005, y: 0.0175, z: 0.0225 },
    mass: 3.8,
  }),
};

/* ==================================================================
   BUILDING ONE
   ================================================================== */

function makeServiceArm(kind) {
  const K = SERVICE_KINDS[kind];
  const geos = {};
  geos.steel = new Geometry();
  svcBarrel(geos.steel, K);
  svcReceiver(geos.steel, K);
  svcSights(geos.steel, K);
  svcDetails(geos.steel, K);
  svcBipod(geos.steel, K);
  svcRotary(geos.steel, K);
  svcCylinder(geos.steel, K);
  svcToggle(geos.steel, K);
  svcSerrate(geos.steel, K);
  svcAux(geos.steel, K);
  svcSlideWork(geos.steel, K);
  svcWarhead(geos.steel, K);
  svcLimbs(geos.steel, K);
  geos.wood = new Geometry(); svcFurniture(geos.wood, K);
  /* A grip is furniture on a wooden gun and part of the frame on a
     polymer one, but it is always its own material -- it is the only
     thing on the gun you are actually touching. */
  svcGrip(geos.wood, K);
  geos.mag = new Geometry(); svcMag(geos.mag, K);
  geos.bolt = new Geometry(); svcBolt(geos.bolt, K);
  /* One pair of channels per band, so the column can be taken down a
     quarter at a time. mountArm is generic over whatever keys are in
     here, so this costs nothing but the names. */
  const shellB = [], tipB = [];
  for (let i = 0; i < ROUND_BANDS; i++) {
    geos['shell' + i] = new Geometry(); geos['tip' + i] = new Geometry();
    shellB.push(geos['shell' + i]); tipB.push(geos['tip' + i]);
  }
  svcRounds(shellB, tipB, K);
  geos.feed = new Geometry(); geos.feedTip = new Geometry();
  svcFeedRound(geos.feed, geos.feedTip, K);
  if (!geos.feed.positions.length) { delete geos.feed; delete geos.feedTip; }
  /* A gun with no magazine has no rounds to show, and an empty
     geometry through mountArm is an actor with nothing in it. Each
     band is dropped on its own: a five-round magazine does not fill
     four bands, and the empty ones must not become empty actors. */
  for (let i = 0; i < ROUND_BANDS; i++) {
    if (!geos['shell' + i].positions.length) {
      delete geos['shell' + i]; delete geos['tip' + i];
    }
  }
  return fin(geos, K.origin);
}

function serviceArm(E, kind, opts) {
  const K = SERVICE_KINDS[kind];
  if (!K) throw new Error('no such service arm: ' + kind);
  const parts = armCache(E, 'svc:' + kind, function () { return makeServiceArm(kind); });
  const body = mountArm(E, 'svc:' + kind, parts, K.mats, opts, K.bound, K.mass, 'steel');
  const o = K.origin;
  body.boreAt = -o.y;
  body.muzzleAt = K.muzzle - o.x;
  /* HOW LONG THE WEAPON ACTUALLY IS, which is not where the round
     leaves it. A Panzerfaust's warhead stands 200 mm out in front of
     the muzzle and an RPG's grenade 310 mm, so anything that frames,
     bounds or reaches for the far end of the model has to ask this and
     not muzzleAt -- the studio rig framed on muzzleAt and cropped the
     RPG's grenade off the side of the picture. The muzzle flash still
     belongs at muzzleAt, because that is where the gas is. */
  body.tipAt = K.warhead ? K.warhead.x1 - o.x : body.muzzleAt;
  body.sightAt = K.sight.y - o.y;
  body.ejectPort = K.port
    ? [K.port.x0 + 0.020 - o.x, K.port.up * 0.5 - o.y, K.rec.w + 0.004]
    : null;
  body.magWell = [K.mag && K.mag.kind !== 'none' ? K.mag.x - o.x : 0,
    K.mag ? K.mag.y - o.y : 0, 0];
  body.boltRest = [0, 0, 0];
  body.boltThrow = [-0.032, 0, 0];
  /* The column, in order from the feed lips down, so the game can hide
     it from the bottom as the magazine empties. Absent bands are left
     out rather than held as nulls -- a five-round magazine genuinely
     has fewer than four. */
  body.roundBands = [];
  for (let i = 0; i < ROUND_BANDS; i++) {
    const a = body['shell' + i], t = body['tip' + i];
    if (a || t) body.roundBands.push([a, t].filter(Boolean));
  }
  /* THE RULE LIVES ON THE WEAPON, not in each game's viewmodel code.
   *
     The first cut of this put the band arithmetic in the zombies
     viewmodel update -- and service arms are what MULTIPLAYER builds,
     so it was written against a gun that does not have them and never
     ran. Two games, two viewmodel paths, one fact about how a magazine
     empties; if the rule is copied into both then it is two rules, and
     the one nobody is looking at is the one that rots.

     `frac` is rounds remaining over capacity. Bands go from the feed
     lips down, so hiding from the top of the index is hiding from the
     bottom of the column, which is the end the follower is pushing
     from. */
  /* WHERE THE ROUND STARTS AND WHERE IT ENDS, in the arm's own space.
   *
     It starts at the FEED LIPS -- the top of the magazine, which is
     where the magazine's own curve begins -- and it ends in the
     CHAMBER, which is the back of the barrel on the bore line. Both
     come out of the same numbers the rest of the gun is built from, so
     a short pistol and a long rifle each get their own without a table
     of offsets: this is the same discipline the reload path already
     follows. */
  body.feedFrom = K.mag && K.mag.kind !== 'none'
    ? [K.mag.x - o.x, K.mag.y - o.y + A_FEED_LIFT, 0] : null;
  body.feedTo = [K.rec.front - 0.030 - o.x, -o.y, 0];
  /* Fly the round from the lips to the chamber. `t` runs 0 to 1 over
     the bolt's FORWARD stroke; anything outside that hides it, because
     a round sitting in mid-air between cycles is worse than no round
     at all.

     It lifts as it goes. A round does not slide in a straight line
     from the magazine to the chamber -- the bolt face pushes the base
     while the nose rides up the feed ramp, so the path is a shallow
     arc and the cartridge tips nose-up on the way. Straight-line
     interpolation reads as a cartridge being teleported along a rail,
     which is worse than not showing it. */
  body.setFeed = function (t) {
    const a = body.feed, b = body.feedTip;
    if (!a && !b) return false;
    const on = t != null && t > 0.001 && t < 0.999 && body.feedFrom;
    if (a) a.visible = !!on;
    if (b) b.visible = !!on;
    if (!on) return false;
    const F = body.feedFrom, T = body.feedTo;
    const x = F[0] + (T[0] - F[0]) * t;
    // The ramp: a half-sine bulge above the straight line.
    const lift = Math.sin(t * Math.PI) * 0.004;
    const y = F[1] + (T[1] - F[1]) * t + lift;
    const tilt = (1 - t) * -9;
    for (const q of [a, b]) {
      if (!q) continue;
      q.setPosition([x, y, 0]);
      q.setRotation([0, 0, tilt]);
    }
    return true;
  };

  body.setRounds = function (frac) {
    const bands = body.roundBands;
    if (!bands || !bands.length) return 0;
    const f = frac == null ? 1 : Math.max(0, Math.min(1, frac));
    let shown = 0;
    for (let i = 0; i < bands.length; i++) {
      /* A band is shown when the column still reaches it. Strictly
         less than, so an empty magazine shows nothing at all rather
         than keeping its bottom band on a rounding error. */
      const on = (i / bands.length) < f;
      if (on) shown++;
      for (const a of bands[i]) a.visible = on;
    }
    return shown;
  };
  body.kind = kind;
  return body;
}

/* Every gun in the table, by name, and a list of what is in it. The
   list is what a test walks to render all of them without being told
   each one separately -- which is the only way a table of this size
   stays honest. */
Engine.prototype.serviceArm = function (kind, opts = {}) { return serviceArm(this, kind, opts); };
Engine.prototype.serviceArmKinds = function () { return Object.keys(SERVICE_KINDS); };
Engine.prototype.serviceArmSpec = function (kind) { return SERVICE_KINDS[kind] || null; };

/* ---------------- submachine guns ----------------
   Short, pistol-calibre, and mostly built round a tube rather than a
   forged receiver. The MP5 is not in this table: it has a hand-built
   model of its own in 97a-arms.js, and a second one here would be two
   MP5s that could disagree. */

Object.assign(SERVICE_KINDS, {

  mp7: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.245, barrel: { rear: 0.035, r0: 0.0090, r1: 0.0068, bore: 0.0023,
      step: 0.085, gas: false },
    rec: { rear: -0.115, front: 0.075, up: 0.0195, down: 0.0180, w: 0.0150, e: 4 },
    port: { x0: 0.006, x1: 0.036, up: 0.0120, down: 0.0020 },
    hg: { kind: 'tube', x0: 0.080, x1: 0.150, r: 0.0165 },
    grip: { x: -0.062, y: -0.0160, len: 0.098, rake: 0.30 },
    trigger: { x: -0.036 },
    mag: { curve: 0.10, len: 0.120, w: 0.0100, d: 0.0105, x: -0.058, y: -0.0180 },
    stock: { kind: 'tube', butt: -0.215, comb: 0.0160, drop: 0.0170, w: 0.0140 },
    rail: { x0: -0.010, x1: 0.062 },
    /* The folding front grip. On a weapon this small it is a third of
       the outline, and it is the one part the UMP does not have -- the
       two of them were 0.356 apart, which for a machine pistol and a
       .45 carbine is far too close. */
    foregrip: { x: 0.118, len: 0.076, rake: 0.04, under: 0.0165 },
    sight: { y: 0.0330, frontX: 0.180, rearX: 0.030, front: 'ears', rear: 'aperture' },
    charge: { x: 0.040, y: 0.0120, z: 0.0200 },
    mass: 1.9, bound: 0.30,
  }),
  ump: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.300, barrel: { rear: 0.040, r0: 0.0110, r1: 0.0088, bore: 0.0058,
      step: 0.100, gas: false },
    rec: { rear: -0.125, front: 0.082, up: 0.0215, down: 0.0195, w: 0.0165, e: 5 },
    hg: { kind: 'tube', x0: 0.086, x1: 0.185, r: 0.0190 },
    grip: { x: -0.068, y: -0.0175, len: 0.102, rake: 0.32 },
    trigger: { x: -0.040 },
    mag: { curve: 0.14, len: 0.145, w: 0.0115, d: 0.0130, x: -0.014, y: -0.0195 },
    stock: { kind: 'folder', butt: -0.240, comb: 0.0180, drop: 0.0200, w: 0.0160 },
    rail: { x0: -0.014, x1: 0.070 },
    sight: { y: 0.0335, frontX: 0.230, rearX: 0.035, front: 'ears', rear: 'aperture' },
    mass: 2.5, bound: 0.34,
  }),
  thompson: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.330, barrel: { rear: 0.045, r0: 0.0120, r1: 0.0098, bore: 0.0058,
      step: 0.110, gas: false, brake: 'slots' },
    rec: { rear: -0.130, front: 0.088, up: 0.0230, down: 0.0210, w: 0.0175, e: 4 },
    hg: { kind: 'wood', x0: 0.092, x1: 0.180, drop: 0.0250, w: 0.0195, upper: null },
    /* The cooling fins turned into the barrel, and the vertical
       foregrip under it. Both are what anybody means when they say
       Thompson, and with neither of them the gun measured 0.392
       against an AK-47 -- a wooden forend, a wooden butt, a box
       magazine and a slotted muzzle, which describes both. */
    vents: { kind: 'slot', x0: 0.190, x1: 0.310, n: 8, r: 0.0098, w: 0.0044 },
    foregrip: { x: 0.140, len: 0.086, rake: 0.06, under: 0.0250 },
    grip: { x: -0.072, y: -0.0190, len: 0.106, rake: 0.20 },
    trigger: { x: -0.044 },
    mag: { curve: 0.04, len: 0.135, w: 0.0135, d: 0.0130, x: -0.008, y: -0.0210 },
    stock: { kind: 'wood', butt: -0.290, comb: 0.0215, drop: 0.0290, w: 0.0195 },
    sight: { y: 0.0350, frontX: 0.300, rearX: 0.040, front: 'ears', rear: 'aperture' },
    charge: { x: 0.050, y: 0.0235, z: 0.0000 },
    mass: 4.8, bound: 0.36,
  }),
  grease: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.290, barrel: { rear: 0.040, r0: 0.0105, r1: 0.0090, bore: 0.0058,
      gas: false, step: 0.095 },
    rec: { rear: -0.145, front: 0.075, up: 0.0215, down: 0.0205, w: 0.0210, e: 2.2 },
    hg: { kind: 'none' },
    grip: { x: -0.070, y: -0.0190, len: 0.098, rake: 0.16 },
    trigger: { x: -0.044 },
    mag: { curve: 0.02, len: 0.175, w: 0.0128, d: 0.0115, x: -0.012, y: -0.0205 },
    stock: { kind: 'wire', butt: -0.255, comb: 0.0140, drop: 0.0180, w: 0.0150 },
    sight: { y: 0.0320, frontX: 0.255, rearX: 0.030, front: 'ears', rear: 'aperture' },
    charge: { x: 0.030, y: 0.0120, z: 0.0230 },
    mass: 3.7, bound: 0.32,
  }),
  sten: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.310, barrel: { rear: 0.042, r0: 0.0098, r1: 0.0082, bore: 0.0045,
      gas: false, shroud: true, shroudX0: 0.060, shroudX1: 0.190, shroudR: 0.0165 },
    rec: { rear: -0.150, front: 0.058, up: 0.0190, down: 0.0180, w: 0.0185, e: 2.2 },
    hg: { kind: 'none' },
    grip: { x: -0.074, y: -0.0170, len: 0.092, rake: 0.10 },
    trigger: { x: -0.046 },
    /* Side-fed -- and it was carried as `kind: none`, so the Sten had
       no magazine at all. That is the same omission the FG 42 had, on
       the gun where it costs even more: a stamped tube with a
       thirty-two round box lying flat out of the left side IS the Sten,
       and without it the model is a pipe with a grip. `kind: side`
       already exists for exactly this. */
    mag: { kind: 'side', x: 0.028, y: 0.0010, out: 0.168, z0: 0.017,
      d: 0.0215, w: 0.0108, clear: false },
    stock: { kind: 'wire', butt: -0.290, comb: 0.0120, drop: 0.0150, w: 0.0140 },
    sight: { y: 0.0295, frontX: 0.265, rearX: 0.020, front: 'ears', rear: 'aperture' },
    charge: { x: 0.026, y: 0.0110, z: 0.0225 },
    mass: 3.2, bound: 0.34,
  }),
  mp40: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.300, barrel: { rear: 0.038, r0: 0.0100, r1: 0.0085, bore: 0.0045,
      gas: false, step: 0.095 },
    rec: { rear: -0.132, front: 0.070, up: 0.0195, down: 0.0185, w: 0.0165, e: 3 },
    hg: { kind: 'none' },
    grip: { x: -0.070, y: -0.0175, len: 0.096, rake: 0.14 },
    trigger: { x: -0.042 },
    mag: { curve: 0.02, len: 0.185, w: 0.0110, d: 0.0120, x: -0.004, y: -0.0190 },
    stock: { kind: 'folder', butt: -0.245, comb: 0.0130, drop: 0.0165, w: 0.0135 },
    sight: { y: 0.0300, frontX: 0.255, rearX: 0.026, front: 'hood', rear: 'notch' },
    charge: { x: 0.028, y: 0.0115, z: 0.0215 },
    mass: 4.0, bound: 0.32,
  }),
  ppsh: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.320, barrel: { rear: 0.040, r0: 0.0100, r1: 0.0085, bore: 0.0038,
      gas: false, shroud: true, shroudX0: 0.075, shroudX1: 0.230, shroudR: 0.0180,
      brake: 'ppsh' },
    rec: { rear: -0.140, front: 0.072, up: 0.0205, down: 0.0195, w: 0.0175, e: 3 },
    hg: { kind: 'wood', x0: 0.020, x1: 0.070, drop: 0.0230, w: 0.0185, upper: null },
    grip: { x: -0.068, y: -0.0190, len: 0.090, rake: 0.08 },
    trigger: { x: -0.042 },
    mag: { kind: 'drum', x: -0.002, y: -0.0205, r: 0.0430, w: 0.0140 },
    stock: { kind: 'wood', butt: -0.300, comb: 0.0180, drop: 0.0290, w: 0.0195 },
    sight: { y: 0.0330, frontX: 0.270, rearX: 0.030, front: 'hood', rear: 'notch' },
    charge: { x: 0.030, y: 0.0130, z: 0.0225 },
    mass: 4.3, bound: 0.36,
  }),
  vector: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.250, barrel: { rear: 0.035, r0: 0.0105, r1: 0.0086, bore: 0.0058,
      gas: false, step: 0.085 },
    rec: { rear: -0.128, front: 0.080, up: 0.0230, down: 0.0250, w: 0.0160, e: 5 },
    hg: { kind: 'tube', x0: 0.085, x1: 0.160, r: 0.0175 },
    grip: { x: -0.058, y: -0.0210, len: 0.100, rake: 0.36 },
    trigger: { x: -0.032 },
    mag: { curve: 0.06, len: 0.150, w: 0.0110, d: 0.0122, x: -0.052, y: -0.0240 },
    stock: { kind: 'folder', butt: -0.220, comb: 0.0180, drop: 0.0190, w: 0.0150 },
    rail: { x0: -0.010, x1: 0.070 },
    sight: { y: 0.0355, frontX: 0.180, rearX: 0.030, front: 'ears', rear: 'aperture' },
    mass: 2.6, bound: 0.30,
  }),
  /* The magazine lies flat along the top, which is the whole silhouette
     of this gun and the reason it is in the table rather than out of it. */
  p90: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.255, barrel: { rear: 0.040, r0: 0.0100, r1: 0.0078, bore: 0.0029,
      gas: false, step: 0.090 },
    rec: { rear: -0.190, front: 0.070, up: 0.0230, down: 0.0260, w: 0.0210, e: 3.4 },
    port: { x0: -0.120, x1: -0.090, up: 0.0100, down: 0.0080 },
    hg: { kind: 'none' },
    grip: { x: 0.012, y: -0.0250, len: 0.100, rake: 0.16 },
    trigger: { x: 0.040 },
    /* And the other one. The P90's magazine lies along the top of the
       gun in clear polymer, with the rounds turned sideways inside it
       -- it is the most visible magazine of any weapon here. */
    mag: { kind: 'stick', x: -0.020, y: 0.0300, len: 0.170, curve: 0.0,
      w: 0.0170, d: 0.0090, clear: true },
    stock: { kind: 'none' },
    handle: { x0: -0.080, x1: 0.010, y: 0.0430 },
    sight: { y: 0.0480, frontX: 0.030, rearX: -0.060, front: 'ears', rear: 'aperture' },
    charge: { x: 0.020, y: 0.0210, z: 0.0240 },
    mass: 2.8, bound: 0.30,
  }),
  skorpion: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.155, barrel: { rear: 0.028, r0: 0.0078, r1: 0.0062, bore: 0.0032,
      gas: false, step: 0.060 },
    rec: { rear: -0.090, front: 0.055, up: 0.0165, down: 0.0150, w: 0.0125, e: 4 },
    port: { x0: 0.004, x1: 0.030, up: 0.0100, down: 0.0020 },
    hg: { kind: 'none' },
    grip: { x: -0.052, y: -0.0145, len: 0.086, rake: 0.22 },
    trigger: { x: -0.030 },
    mag: { curve: 0.06, len: 0.095, w: 0.0092, d: 0.0100, x: -0.044, y: -0.0160 },
    stock: { kind: 'wire', butt: -0.175, comb: 0.0110, drop: 0.0120, w: 0.0110 },
    sight: { y: 0.0270, frontX: 0.120, rearX: 0.018, front: 'ears', rear: 'notch' },
    charge: { x: 0.026, y: 0.0110, z: 0.0180 },
    mass: 1.4, bound: 0.24,
  }),
  microuzi: svcSpec({
    ammoKind: 'pistol',
    muzzle: 0.145, barrel: { rear: 0.025, r0: 0.0092, r1: 0.0078, bore: 0.0045,
      gas: false, step: 0.055 },
    rec: { rear: -0.105, front: 0.048, up: 0.0185, down: 0.0175, w: 0.0165, e: 3 },
    port: { x0: 0.000, x1: 0.026, up: 0.0110, down: 0.0020 },
    hg: { kind: 'none' },
    /* The magazine goes up through the grip, which is what makes this
       one a brick with a barrel. */
    grip: { x: -0.022, y: -0.0180, len: 0.098, rake: 0.06 },
    trigger: { x: -0.002 },
    mag: { curve: 0.0, len: 0.130, w: 0.0110, d: 0.0120, x: -0.028, y: -0.0300 },
    stock: { kind: 'wire', butt: -0.185, comb: 0.0120, drop: 0.0130, w: 0.0120 },
    sight: { y: 0.0290, frontX: 0.110, rearX: 0.012, front: 'ears', rear: 'aperture' },
    charge: { x: 0.010, y: 0.0195, z: 0.0000 },
    mass: 2.0, bound: 0.24,
  }),
});

/* ---------------- light machine guns ----------------
   Long, heavy, fed from something enormous, and on a bipod. The MG 42
   is not here for the same reason the MP5 is not: it already has a
   hand-built model, with a barrel change animation this table has no
   way to express. */

Object.assign(SERVICE_KINDS, {

  mg34: svcSpec({
    ammoKind: 'full',
    muzzle: 0.640, barrel: { rear: 0.060, r0: 0.0135, r1: 0.0105, bore: 0.0040,
      step: 0.200, gas: false, shroud: true, shroudX0: 0.075, shroudX1: 0.400,
      shroudR: 0.0235, brake: 'cone' },
    rec: { rear: -0.170, front: 0.090, up: 0.0265, down: 0.0235, w: 0.0195, e: 3.6 },
    port: { x0: -0.020, x1: 0.020, up: 0.0150, down: 0.0040 },
    hg: { kind: 'none' },
    grip: { x: -0.098, y: -0.0200, len: 0.108, rake: 0.36 },
    trigger: { x: -0.070 },
    mag: { kind: 'belt', x: -0.030, y: -0.0240 },
    stock: { kind: 'wood', butt: -0.400, comb: 0.0240, drop: 0.0300, w: 0.0195 },
    bipod: { x: 0.330, len: 0.155, rake: 0.030, spread: 0.075 },
    /* The Gurttrommel: the 50-round belt drum clipped onto the feed
       side, standing out from the receiver like a film canister. It is
       the one thing on an MG 34 that the MG 42, the PKM and the M60 do
       not also have somewhere. */
    ammoBox: { kind: 'drum', side: true, x: -0.020, r: 0.0480, w: 0.0230,
      drop: -0.0060, z: -0.0480 },
    sight: { y: 0.0405, frontX: 0.430, rearX: 0.000, front: 'ears', rear: 'aperture' },
    charge: { x: 0.040, y: 0.0170, z: 0.0250 },
    mass: 12.1, bound: 0.70,
  }),
  /* THE MG 42, WHICH HAD BEEN BORROWING THE MG 34's MODEL.
   *
     They are not the same gun and they do not look remotely alike. The
     34 is a milled, round-receivered thing with a fluted barrel jacket
     and a horseshoe butt. The 42 is the first mass-produced STAMPED
     machine gun: a slab-sided pressed receiver with a square section,
     a jacket with one enormous rectangular cut-out down the right side
     for the quick-change barrel, a booster cone on the muzzle, a
     pistol grip rather than a spade, and a much deeper bipod. It also
     fires at twice the rate, which is why anyone knows the difference.

     Everything below is that: e = 5.2 makes the receiver read as
     pressed rather than turned, and the rivets that go with a pressed
     receiver come free from the shared detail pass. */
  mg42: svcSpec({
    ammoKind: 'full',
    muzzle: 0.625, barrel: { rear: 0.055, r0: 0.0140, r1: 0.0108, bore: 0.0040,
      step: 0.190, gas: false, shroud: true, shroudX0: 0.070, shroudX1: 0.415,
      shroudR: 0.0252, brake: 'cone' },
    /* SLOTS, NOT HOLES, and the difference is the fastest way anybody
       has ever told an MG 42 from an MG 34: the 34's jacket is drilled
       with round perforations and the 42's is stamped with long
       rectangular cuts, open along its whole right side so the barrel
       can swing out. Both were drawn by the same perforated-jacket
       code and came out as the same gun. */
    vents: { kind: 'slot', x0: 0.090, x1: 0.395, n: 7, r: 0.0252, w: 0.0140 },
    /* Stamped: square in section, flat-sided, and wider than the 34's
       turned tube. */
    rec: { rear: -0.165, front: 0.095, up: 0.0290, down: 0.0250, w: 0.0225, e: 5.2 },
    port: { x0: -0.014, x1: 0.030, up: 0.0170, down: 0.0045 },
    hg: { kind: 'none' },
    /* A pistol grip, where the 34 has a spade. */
    grip: { x: -0.092, y: -0.0215, len: 0.114, rake: 0.40 },
    trigger: { x: -0.064 },
    mag: { kind: 'belt', x: -0.024, y: -0.0250 },
    /* The bakelite butt, straighter and blockier than the 34's. */
    stock: { kind: 'poly', butt: -0.385, comb: 0.0270, drop: 0.0290, w: 0.0210 },
    bipod: { x: 0.355, len: 0.178, rake: 0.034, spread: 0.088 },
    sight: { y: 0.0430, frontX: 0.440, rearX: -0.005, front: 'ears', rear: 'aperture' },
    charge: { x: 0.045, y: 0.0185, z: 0.0265 },
    mass: 11.6, bound: 0.70,
  }),
  m60: svcSpec({
    ammoKind: 'full',
    muzzle: 0.640, barrel: { rear: 0.065, r0: 0.0145, r1: 0.0112, bore: 0.0050,
      step: 0.210, gas: true, gasAt: 0.420, gasR: 0.0085, gasY: -0.0215, brake: 'slots' },
    rec: { rear: -0.175, front: 0.095, up: 0.0280, down: 0.0250, w: 0.0205, e: 4 },
    port: { x0: -0.010, x1: 0.030, up: 0.0160, down: 0.0040 },
    hg: { kind: 'tube', x0: 0.110, x1: 0.240, r: 0.0250 },
    grip: { x: -0.100, y: -0.0215, len: 0.112, rake: 0.38 },
    trigger: { x: -0.072 },
    mag: { kind: 'belt', x: -0.030, y: -0.0255 },
    stock: { kind: 'poly', butt: -0.395, comb: 0.0255, drop: 0.0310, w: 0.0200 },
    bipod: { x: 0.470, len: 0.170, rake: 0.035, spread: 0.082 },
    /* The gas cylinder, ribbed, running from the receiver all the way
       to the bipod at the muzzle -- on an M60 the bipod is bolted to
       the END of that tube, not to the barrel, and the tube is the
       longest single line on the gun. The PKM's equivalent is short
       and tucked up under its barrel, so with neither of them drawn
       the two machine guns measured 0.296 apart. */
    tube: { x0: 0.120, x1: 0.480, r: 0.0105, y: -0.0215 },
    vents: { kind: 'slot', x0: 0.270, x1: 0.420, n: 5, r: 0.0140, w: 0.0100,
      yOff: -0.0215 },
    /* The bandolier box, and it hangs OFF THE LEFT SIDE rather than
       straight underneath -- which is both what an M60 does and the
       reason to give it one: the PKM's tin is centred under the
       receiver, so putting the M60's in the same place would have made
       the two machine guns more alike rather than less. Occupying
       different space is the point. */
    ammoBox: { x: 0.005, len: 0.118, h: 0.070, w: 0.030, drop: 0.004, z: -0.036 },
    handle: { x0: 0.150, x1: 0.250, y: 0.0430 },
    /* The front pistol grip under the gas tube. It is half of how
       anybody holds ten kilos of machine gun and it was not there. */
    foregrip: { x: 0.195, len: 0.104, rake: 0.14 },
    sight: { y: 0.0440, frontX: 0.500, rearX: 0.010, front: 'ears', rear: 'aperture' },
    mass: 10.5, bound: 0.72,
  }),
  pkm: svcSpec({
    ammoKind: 'full',
    muzzle: 0.620, barrel: { rear: 0.060, r0: 0.0138, r1: 0.0106, bore: 0.0039,
      step: 0.200, gas: true, gasAt: 0.400, gasR: 0.0082, gasY: -0.0205, brake: 'cone' },
    rec: { rear: -0.168, front: 0.092, up: 0.0270, down: 0.0240, w: 0.0200, e: 4.5 },
    port: { x0: -0.014, x1: 0.026, up: 0.0155, down: 0.0040 },
    hg: { kind: 'none' },
    grip: { x: -0.096, y: -0.0205, len: 0.110, rake: 0.34 },
    trigger: { x: -0.068 },
    mag: { kind: 'belt', x: -0.028, y: -0.0250 },
    /* THE TIN. A PKM carries its belt in a box clipped under the
       receiver, and it is a third of the gun's bulk. All five belt-fed
       weapons in this rack had the belt simply leaving the feed tray
       and ending in mid air, which is why the M60 and this measured
       0.238 apart -- with the box gone they were the same gun with
       different barrels. */
    ammoBox: { x: -0.010, len: 0.128, h: 0.086, w: 0.038, drop: 0.008 },
    // And the handle on the barrel, for changing it hot.
    handle: { x0: 0.190, x1: 0.290, y: 0.0400 },
    /* The skeleton butt with the grip hole through it. The tin and the
       barrel handle took this and the M60 from 0.238 to 0.299 and then
       stopped moving, because everything either of them was still
       being given was landing in space the other one already occupied.
       A hole is the opposite: it takes occupancy AWAY, in the one part
       of the gun that was identical on both. */
    stock: { kind: 'skeleton', butt: -0.385, comb: 0.0245, drop: 0.0300,
      w: 0.0190, hole: 0.052 },
    bipod: { x: 0.455, len: 0.160, rake: 0.032, spread: 0.078 },
    sight: { y: 0.0420, frontX: 0.480, rearX: 0.005, front: 'hood', rear: 'notch' },
    mass: 9.0, bound: 0.70,
  }),
  rpd: svcSpec({
    ammoKind: 'full',
    muzzle: 0.560, barrel: { rear: 0.055, r0: 0.0128, r1: 0.0098, bore: 0.0039,
      step: 0.180, gas: true, gasAt: 0.360, gasR: 0.0078, gasY: -0.0195 },
    rec: { rear: -0.160, front: 0.088, up: 0.0255, down: 0.0230, w: 0.0190, e: 4 },
    hg: { kind: 'wood', x0: 0.105, x1: 0.215, drop: 0.0250, w: 0.0195, upper: null },
    grip: { x: -0.092, y: -0.0200, len: 0.106, rake: 0.32 },
    trigger: { x: -0.064 },
    mag: { kind: 'drum', x: -0.010, y: -0.0240, r: 0.0510, w: 0.0195 },
    /* The RPD's drum is not a magazine, it is a TIN with a hundred
       linked rounds coiled inside it, and the difference shows: it
       hangs off the receiver on a bail with a catch, not out of a
       magazine well. Drawn as a magazine it was a drum on a stick and
       read as a Thompson's. */
    ammoBox: { kind: 'drum', x: -0.010, r: 0.0560, w: 0.0270, drop: 0.004 },
    stock: { kind: 'wood', butt: -0.370, comb: 0.0235, drop: 0.0295, w: 0.0190 },
    bipod: { x: 0.430, len: 0.150, rake: 0.030, spread: 0.074 },
    sight: { y: 0.0400, frontX: 0.440, rearX: 0.004, front: 'hood', rear: 'notch' },
    mass: 7.4, bound: 0.66,
  }),
  bren: svcSpec({
    ammoKind: 'full',
    muzzle: 0.590, barrel: { rear: 0.058, r0: 0.0132, r1: 0.0100, bore: 0.0039,
      step: 0.190, gas: true, gasAt: 0.390, gasR: 0.0080, gasY: -0.0200, brake: 'cone' },
    rec: { rear: -0.162, front: 0.090, up: 0.0260, down: 0.0230, w: 0.0185, e: 4 },
    port: { x0: -0.010, x1: 0.026, up: 0.0100, down: 0.0130 },
    hg: { kind: 'wood', x0: 0.108, x1: 0.205, drop: 0.0245, w: 0.0190, upper: null },
    grip: { x: -0.094, y: -0.0195, len: 0.106, rake: 0.34 },
    trigger: { x: -0.066 },
    /* Top-fed: the magazine stands up out of the receiver, which is why
       the sights are offset to the left on the real thing. */
    mag: { kind: 'stick', x: -0.010, y: 0.0235, len: 0.150, curve: 0.20,
      w: 0.0130, d: 0.0135, up: true },
    stock: { kind: 'wood', butt: -0.375, comb: 0.0240, drop: 0.0300, w: 0.0190 },
    bipod: { x: 0.450, len: 0.158, rake: 0.030, spread: 0.076 },
    /* The radiator ribs down the Bren's quick-change barrel. It and
       the DP-28 are both bipodded, wood-furnitured, cone-braked gas
       guns and measured 0.247 apart; one has a pan on top and the
       other a curved box, and that turned out not to be enough. */
    vents: { kind: 'slot', x0: 0.240, x1: 0.420, n: 7, r: 0.0110, w: 0.0060 },
    handle: { x0: 0.120, x1: 0.215, y: 0.0420 },
    sight: { y: 0.0410, frontX: 0.455, rearX: 0.000, front: 'ears', rear: 'aperture' },
    mass: 10.2, bound: 0.68,
  }),
  bar: svcSpec({
    ammoKind: 'full',
    muzzle: 0.580, barrel: { rear: 0.058, r0: 0.0130, r1: 0.0100, bore: 0.0040,
      step: 0.185, gas: true, gasAt: 0.380, gasR: 0.0078, gasY: -0.0195 },
    rec: { rear: -0.158, front: 0.090, up: 0.0250, down: 0.0225, w: 0.0180, e: 3.6 },
    hg: { kind: 'wood', x0: 0.105, x1: 0.200, drop: 0.0250, w: 0.0195, upper: 0.0230 },
    grip: { x: -0.090, y: -0.0195, len: 0.104, rake: 0.30 },
    trigger: { x: -0.062 },
    mag: { curve: 0.12, len: 0.160, w: 0.0130, d: 0.0145, x: -0.016, y: -0.0225 },
    stock: { kind: 'wood', butt: -0.380, comb: 0.0235, drop: 0.0310, w: 0.0200 },
    bipod: { x: 0.470, len: 0.155, rake: 0.030, spread: 0.076 },
    sight: { y: 0.0395, frontX: 0.450, rearX: 0.004, front: 'ears', rear: 'aperture' },
    mass: 8.8, bound: 0.66,
  }),
  /* The record player: a flat pan lying on top of the receiver. */
  dp28: svcSpec({
    ammoKind: 'full',
    muzzle: 0.620, barrel: { rear: 0.060, r0: 0.0130, r1: 0.0100, bore: 0.0039,
      step: 0.195, gas: true, gasAt: 0.400, gasR: 0.0078, gasY: -0.0200, brake: 'cone' },
    rec: { rear: -0.155, front: 0.088, up: 0.0245, down: 0.0225, w: 0.0180, e: 3.4 },
    hg: { kind: 'wood', x0: 0.106, x1: 0.195, drop: 0.0240, w: 0.0185, upper: null },
    grip: { x: -0.088, y: -0.0195, len: 0.104, rake: 0.32 },
    trigger: { x: -0.060 },
    mag: { kind: 'pan', x: -0.005, y: 0.0320, r: 0.0700 },
    stock: { kind: 'wood', butt: -0.375, comb: 0.0230, drop: 0.0300, w: 0.0190 },
    /* The gas cylinder running the length of the barrel underneath it,
       with the bipod clamped to the far end -- on a DP that tube is as
       visible as the pan is, and it is what the bipod hangs off rather
       than the barrel. */
    tube: { x0: 0.115, x1: 0.480, r: 0.0080, y: -0.0200 },
    bipod: { x: 0.475, len: 0.160, rake: 0.030, spread: 0.078 },
    sight: { y: 0.0395, frontX: 0.470, rearX: 0.002, front: 'hood', rear: 'notch' },
    mass: 9.1, bound: 0.68,
  }),
  /* Six barrels on a spindle. The one gun in the table that is not the
     nine standard objects, and it is here anyway because seven of the
     nine are still the same -- only the barrel and the feed differ. */
  hydra: svcSpec({
    muzzle: 0.560, barrel: { rear: 0.060, r0: 0.0320, r1: 0.0300, bore: 0.0250,
      step: 0.180, gas: false },
    rec: { rear: -0.150, front: 0.105, up: 0.0330, down: 0.0300, w: 0.0270, e: 3 },
    port: { x0: -0.040, x1: 0.020, up: 0.0180, down: 0.0060 },
    hg: { kind: 'none' },
    grip: { x: -0.098, y: -0.0290, len: 0.112, rake: 0.30 },
    trigger: { x: -0.070 },
    mag: { kind: 'belt', x: -0.040, y: -0.0310 },
    stock: { kind: 'none' },
    handle: { x0: -0.060, x1: 0.060, y: 0.0500 },
    sight: { y: 0.0560, frontX: 0.200, rearX: -0.040, front: 'ears', rear: 'aperture' },
    mass: 18.0, bound: 0.72,
    rotary: 6,
  }),
});

/* A REVOLVER'S CYLINDER IS NOT A MINIGUN'S BARREL CLUSTER.
 *
 * The Webley was built with `rotary: 6` on the reasoning that six bores
 * on a circle is six bores on a circle. It is not: a minigun's six
 * barrels REPLACE the single barrel and run its whole length, while a
 * revolver's six chambers are forty millimetres long, sit BETWEEN the
 * standing breech and the barrel, and the barrel is still there.
 *
 * Sharing the field meant the Webley got six full-length tubes from the
 * breech to the muzzle -- and when I widened the cluster to uncover the
 * Hydra's barrels and suppressed the solid barrel underneath them, the
 * Webley lost its barrel too and came apart into a floating Gatling
 * cluster and a floating grip. One field meaning two things, and the
 * damage showing up on the weapon I was not looking at.
 */
function svcCylinder(g, K) {
  const C = K.cylinder;
  if (!C) return;
  const n = C.n || 6, r = C.r, x0 = C.x0, x1 = C.x1;
  // The drum, capped at both ends.
  spin(g, [[x0, 0.0000], [x1, 0.0000], [x1, r], [x0, r]], 26, 32);
  /* The chambers, as bored holes rather than as painted circles: a
     ring of wall with a hole down the middle, so the front face has
     six shadows in it and not six discs. */
  const cr = C.bore || 0.0060, br = cr + 0.0018, pitch = r * 0.60;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU + TAU / (n * 2);
    band(g, x0 + 0.002, x1 - 0.002, cr, br, 12,
      Math.cos(th) * pitch, Math.sin(th) * pitch);
  }
  // Flutes between them, which is what stops a cylinder reading as a tin.
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    band(g, x0 + 0.006, x1 - 0.006, 0, 0.0034, 8,
      Math.cos(th) * (r + 0.0008), Math.sin(th) * (r + 0.0008));
  }
  /* The top strap over it, tying the standing breech to the barrel --
     without it a top-break revolver is a frame and a floating barrel,
     which is exactly how this one photographed. */
  if (C.strap !== false) {
    svcSlab(g, [[x0 - 0.008, 0.0030, 0.0030, 0.0072, 3.4],
      [x1 + 0.014, 0.0030, 0.0030, 0.0068, 3.4]], 0, true, true, r + 0.0034);
    /* AND THE BLOCK WHERE THE STRAP MEETS THE BARREL'S REAR. The strap
       sits 7.8 mm above the barrel and ended in the air over it, so
       after the cylinder went in the Webley's entire barrel was still
       a separate object -- fifty-seven pieces of it. It LOOKED joined
       in the photograph because the strap crosses the barrel in
       silhouette, which is the whole reason attached.test.js exists.
       On the real weapon this is where the top strap latches down
       onto the barrel's rib. */
    const bt = (K.barrel && K.barrel.r0) || r * 0.6;
    const half = (r + 0.0034 - bt) * 0.5 + 0.0012;
    const mid = (r + 0.0034 + bt) * 0.5;
    svcSlab(g, [[x1 - 0.002, half, half, 0.0072, 3.4],
      [x1 + 0.020, half, half, 0.0066, 3.4]], 0, true, true, mid);
  }
}

/* THE THING THE LAUNCHER LAUNCHES.
 *
 * A Panzerfaust and an RPG-7 are unrecognisable without the grenade on
 * the front and unmistakable with it -- it is the entire silhouette,
 * more than the tube is. Both were carried in the table as a `hg`
 * TUBE HANDGUARD with a big radius, which is a reasonable-sounding
 * hack until you remember that a tube handguard gets dressed in four
 * rings of cooling slots: the Panzerfaust's warhead rendered as a cage
 * of octagonal plates threaded on a pipe.
 *
 * Both profiles are solids of revolution, so the outline runs forward
 * along the axis and back along the surface -- counter-clockwise in
 * (x, radius), which is what puts the normals outward. `spin` says so
 * at its own definition and the tube handguard was wound the wrong way
 * for months.
 */
function svcWarhead(g, K) {
  const H = K.warhead;
  if (!H) return;
  const R = H.r, x0 = H.x0, x1 = H.x1, L = x1 - x0;
  if (H.kind === 'faust') {
    /* Panzerfaust 60: a 149 mm bulb on a 44 mm tube, which is the only
       launcher silhouette anybody can name from across a street.
       Blunt ogive, widest about a third back, then a long cone down
       onto the tube. */
    spin(g, [
      [x0, 0.0000], [x1, 0.0000],
      [x1, 0.0060],
      [x1 - L * 0.10, R * 0.46],
      [x1 - L * 0.22, R * 0.82],
      [x1 - L * 0.36, R],
      [x0 + L * 0.34, R * 0.96],
      [x0 + L * 0.06, R * 0.50],
      [x0, R * 0.34],
    ], 26, 34);
  } else if (H.kind === 'pg7') {
    /* PG-7V: a tail boom out of the muzzle, a boat tail up to the
       85 mm body, a long ogive and the fuze probe on the nose. The
       probe is 35 mm of nothing and it is the detail that says RPG. */
    spin(g, [
      [x0, 0.0000], [x1, 0.0000],
      [x1, 0.0045],
      [x1 - L * 0.12, 0.0062],
      [x1 - L * 0.14, 0.0150],
      [x1 - L * 0.36, R],
      [x0 + L * 0.34, R],
      [x0 + L * 0.22, R * 0.36],
      [x0, R * 0.30],
    ], 26, 34);
  }
}

/* The rotary barrels, which only the minigun has. Six tubes on a circle
   about the bore, a muzzle plate holding their fronts together, and a
   housing over the back where the spindle is. */
function svcRotary(g, K) {
  const n = K.rotary;
  if (!n) return;
  /* Out to where the solid barrel used to be, now that it is gone:
     the cluster IS the gun's muzzle end, so it has to fill the same
     silhouette rather than rattle around inside it.
   *
     Overridable, because `rotary` serves two weapons that are nothing
     alike -- the minigun's six barrels on a spindle and the sawn-off's
     two 12-bore tubes side by side -- and a radius tuned on one is
     wrong on the other. Tuning the Hydra without these moved the
     sawn-off's bores, which is the cost of one field meaning two
     things. */
  const R = K.rotaryR != null ? K.rotaryR : K.barrel.r0 * 0.74;
  const br = K.rotaryBr != null ? K.rotaryBr : 0.0072;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const cy = Math.cos(th) * R, cz = Math.sin(th) * R;
    tubeRun(g, [[K.barrel.rear + 0.030, br], [K.muzzle - 0.004, br]], 12, true, false, cy, cz);
    crown(g, K.muzzle, br, br * 0.55, 0.014);
  }
  band(g, K.muzzle - 0.030, K.muzzle - 0.018, R - br - 0.002, R + br + 0.002, 22);
  band(g, K.barrel.rear + 0.020, K.barrel.rear + 0.050, 0.004, R + br + 0.004, 22);
}
