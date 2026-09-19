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
function svcSlab(g, pts, z = 0, capA = true, capB = true) {
  sweepPath(g, pts.map(function (p) {
    return ax(p[0], roundRect(p[1], p[2], p[3], p[4] || 3.2, 22), 0, z);
  }), capA, capB);
}

function svcBarrel(g, K) {
  const B = K.barrel;
  const pts = [[B.rear, B.r0]];
  if (B.step) pts.push([B.step, B.r0], [B.step + 0.004, B.r1]);
  pts.push([K.muzzle - 0.012, B.r1]);
  tubeRun(g, pts, 18, true, false);
  /* A crowned muzzle, because what sells the end of a barrel is the
     shadow inside it. */
  crown(g, K.muzzle, B.r1, B.bore, 0.030);

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
    band(g, B.shroudX0, B.shroudX1, B.r1 + 0.004, B.shroudR, 20);
    const n = Math.max(3, Math.round((B.shroudX1 - B.shroudX0) / 0.026));
    for (let i = 0; i < n; i++) {
      const x = B.shroudX0 + (i + 0.5) * (B.shroudX1 - B.shroudX0) / n;
      for (let k = 0; k < 6; k++) {
        const th = (k / 6) * TAU + (i % 2) * 0.5;
        band(g, x - 0.005, x + 0.005, B.shroudR - 0.001, B.shroudR + 0.0015, 8,
          Math.cos(th) * B.shroudR * 0.82, Math.sin(th) * B.shroudR * 0.82);
      }
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
  } else if (B.brake === 'cone') {
    spin(g, [[K.muzzle - 0.004, B.bore + 0.002], [K.muzzle + 0.030, B.r1 * 1.9],
      [K.muzzle + 0.030, B.r1 * 2.3], [K.muzzle - 0.004, B.r1 + 0.004]], 20, 34);
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
  /* A carrying handle over the top, on the ones that have one. */
  if (K.handle) {
    const H = K.handle;
    svcSlab(g, [[H.x0, H.y + 0.012, -H.y + 0.004, 0.011, 4],
      [H.x1, H.y + 0.012, -H.y + 0.004, 0.011, 4]]);
    strut(g, [H.x0 + 0.004, R.up, 0], [H.x0 + 0.016, H.y, 0],
      roundRect(0.005, 0.005, 0.009, 3, 10));
    strut(g, [H.x1 - 0.004, R.up, 0], [H.x1 - 0.016, H.y, 0],
      roundRect(0.005, 0.005, 0.009, 3, 10));
  }
  /* And a flat-top rail on the ones that do not. */
  if (K.rail) {
    svcSlab(g, [[K.rail.x0, R.up + 0.008, -R.up + 0.001, 0.0095, 6],
      [K.rail.x1, R.up + 0.008, -R.up + 0.001, 0.0095, 6]]);
    const n = Math.round((K.rail.x1 - K.rail.x0) / 0.010);
    for (let i = 0; i < n; i++) {
      const x = K.rail.x0 + (i + 0.5) * (K.rail.x1 - K.rail.x0) / n;
      svcSlab(g, [[x - 0.0022, R.up + 0.0105, -R.up - 0.001, 0.0098, 6],
        [x + 0.0022, R.up + 0.0105, -R.up - 0.001, 0.0098, 6]]);
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
  svcSlab(g, [[S.rearX - 0.010, S.y - 0.008, 0.002, 0.0090, 4],
    [S.rearX + 0.008, S.y - 0.008, 0.002, 0.0090, 4]]);
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
      } else {
        /* Cooling slots, cut as shallow bands rather than real holes. */
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

function svcGrip(g, K) {
  const G = K.grip;
  gripStack(g, G.x, G.y, G.len, G.rake, [
    [0.00, 0.0175, 0.0165, 0.0165, 3.0],
    [0.22, 0.0168, 0.0158, 0.0162, 3.0],
    [0.55, 0.0155, 0.0150, 0.0158, 2.8],
    [0.85, 0.0160, 0.0158, 0.0162, 2.8],
    [1.00, 0.0168, 0.0168, 0.0166, 3.2],
  ]);
  /* Checkering on the sides, which is the difference between a grip
     you can feel and a painted slab. */
  const ux = -G.rake / Math.hypot(G.rake, 1), uy = -1 / Math.hypot(G.rake, 1);
  for (const sz of [-1, 1]) {
    checker(g, G.x + ux * G.len * 0.52, G.y + uy * G.len * 0.52, sz * 0.0161,
      ux, uy, sz, 5, 7, 0.0072, 0.0009);
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
    /* A short tab of belt out of the feed tray, curving away and down;
       the rest of it is in a box, and the box is a separate prop.
       Each link is a plate and a round, and the plate needs TWO
       stations -- swept from one it is nothing at all. */
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = M.x - t * 0.034;
      const y = M.y - t * t * 0.060;
      svcSlab(g, [[x - 0.0042, y + 0.0060, -y + 0.0000, 0.0230, 3],
        [x + 0.0042, y + 0.0060, -y + 0.0000, 0.0230, 3]], 0, true, true);
      tubeRun(g, [[x - 0.0038, 0.0038], [x + 0.0038, 0.0038]], 10, true, true,
        y + 0.0010, 0.0150);
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
  const n = 8, sts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = M.curve * t;
    const x = M.x + Math.sin(a) * M.len * t * 0.62;
    const y = M.y - Math.cos(a) * M.len * t;
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
  const aL = M.curve;
  sts.push({
    o: new Vec3(last.o.x + Math.sin(aL) * 0.008, last.o.y - Math.cos(aL) * 0.008, 0),
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
    for (const dy of [0.0, 0.024]) {
      strut(g, [sel.x + 0.056, sel.y + 0.030 + dy, sz * (W + 0.0002)],
        [sel.x + 0.056, sel.y + 0.030 + dy, sz * (W + 0.0014)],
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
      strut(g, [dx, dy, -W - 0.0072], [dx, dy, -W - 0.0018], ringOutline(0.0013, 8));
    }
  }
  /* And the lever itself, sitting on whichever stop the gun is set to
     -- the top one, SAFE, is wrong for a weapon somebody is carrying
     into a fight, so it rests on the one below it. */
  strut(g, [sel.x, sel.y, -W - 0.0050], [sel.x - 0.020, sel.y - 0.011, -W - 0.0062],
    roundRect(0.0038, 0.0038, 0.0024, 4, 10));
  }

  /* The magazine catch, at the back of the well. */
  if (K.mag && K.mag.kind !== 'none' && K.mag.kind !== 'pan') {
    const mx = K.mag.x - K.mag.d - 0.006, my = K.mag.y + 0.006;
    svcSlab(g, [[mx - 0.008, my + 0.004, 0.009, 0.0060, 4],
      [mx + 0.004, my + 0.004, 0.009, 0.0060, 4]]);
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
     put a sling is a prop. */
  const fx = K.hg && K.hg.kind !== 'none' ? K.hg.x1 - 0.014 : K.barrel.rear + 0.060;
  const fy = -(K.hg && K.hg.kind === 'wood' ? K.hg.drop : K.barrel.r1 + 0.010);
  band(g, fx - 0.0022, fx + 0.0022, 0.0060, 0.0100, 14, fy - 0.006, 0);
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
  if (M.kind === 'belt') return;      // the belt builds its own rounds

  /* A box: walk down the magazine's own curve, one round every pitch,
     alternating left and right of centre. Only as far as the magazine
     actually goes. */
  const n = Math.min(A.rounds, Math.floor(M.len / A.pitch) * 2);
  const half = A.len * 0.50;
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
    const a = M.curve * t;
    const x = M.x + Math.sin(a) * M.len * t * 0.62;
    const y = M.y - Math.cos(a) * M.len * t;
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

function svcBolt(g, K) {
  const R = K.rec, C = K.charge;
  const x = C ? C.x : R.front - 0.060;
  tubeRun(g, [[x - 0.050, R.up * 0.52], [x + 0.020, R.up * 0.52]], 16, true, true, 0, 0);
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
};

/* Walnut where there is wood on the gun, polymer where there is not.
   One rule, applied from what the handguard and the stock say they are
   made of, so a row cannot say 'wood' and then render in plastic. */
function svcMats(K) {
  const wooden = (K.hg && K.hg.kind === 'wood') || (K.stock && K.stock.kind === 'wood');
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
    mag: { kind: 'side', x: 0.006, y: 0.002, out: 0.135, z0: 0.019,
      d: 0.0255, w: 0.0130, clear: false },
    grip: { rake: 0.58, len: 0.112 },
    stock: { kind: 'wood', butt: -0.320, comb: 0.0180, drop: 0.0260, w: 0.0165 },
    sight: { y: 0.0345, frontX: 0.395, front: 'ears', rear: 'aperture' },
    mass: 4.9,
  }),
  volkhammer: svcSpec({
    ammoKind: 'kurz',
    muzzle: 0.440, barrel: { brake: 'slots', r0: 0.0130, r1: 0.0098 },
    rec: { rear: -0.155, front: 0.100, up: 0.0260, down: 0.0230, w: 0.0180, e: 5.5 },
    hg: { kind: 'wood', x0: 0.118, x1: 0.235, drop: 0.0270, w: 0.0210 },
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
    charge: { x: 0.140, y: 0.0210, z: 0.0180 },
    stock: { kind: 'poly', butt: -0.345, comb: 0.0230, drop: 0.0290, w: 0.0185 },
    sight: { y: 0.0405, frontX: 0.415, front: 'hood', rear: 'aperture' },
    mass: 5.4,
  }),

  /* Kalashnikov pattern: the gas tube above the barrel, the sharply
     curved magazine, and the receiver cover you can see the join of. */
  ak47: svcSpec({
    muzzle: 0.445, barrel: { r0: 0.0125, r1: 0.0092, gasAt: 0.285, gasR: 0.0075, gasY: 0.0195 },
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
    mag: { curve: 0.40, len: 0.165, w: 0.0126, d: 0.0138 },
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
    handle: { x0: -0.070, x1: 0.040, y: 0.0390 },
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
    handle: { x0: -0.090, x1: 0.030, y: 0.0420 },
    sight: { y: 0.0500, frontX: 0.035, rearX: -0.060, front: 'ears', rear: 'aperture' },
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
    /* Side-fed, so from the front this one is a pipe and nothing else. */
    mag: { kind: 'none' },
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
      brake: 'cone' },
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
    handle: { x0: 0.150, x1: 0.250, y: 0.0430 },
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
    stock: { kind: 'wood', butt: -0.385, comb: 0.0245, drop: 0.0300, w: 0.0190 },
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
    mag: { kind: 'stick', x: -0.010, y: 0.0450, len: 0.155, curve: 0.22,
      w: 0.0130, d: 0.0135 },
    stock: { kind: 'wood', butt: -0.375, comb: 0.0240, drop: 0.0300, w: 0.0190 },
    bipod: { x: 0.450, len: 0.158, rake: 0.030, spread: 0.076 },
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

/* The rotary barrels, which only the minigun has. Six tubes on a circle
   about the bore, a muzzle plate holding their fronts together, and a
   housing over the back where the spindle is. */
function svcRotary(g, K) {
  const n = K.rotary;
  if (!n) return;
  const R = K.barrel.r0 * 0.62, br = 0.0062;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const cy = Math.cos(th) * R, cz = Math.sin(th) * R;
    tubeRun(g, [[K.barrel.rear + 0.030, br], [K.muzzle - 0.004, br]], 12, true, false, cy, cz);
    crown(g, K.muzzle, br, br * 0.55, 0.014);
  }
  band(g, K.muzzle - 0.030, K.muzzle - 0.018, R - br - 0.002, R + br + 0.002, 22);
  band(g, K.barrel.rear + 0.020, K.barrel.rear + 0.050, 0.004, R + br + 0.004, 22);
}
