/* ============================================================
   AMMUNITION, and the things that carry it.

   Everything here is prefixed `ammo` because the engine's modules are
   concatenated into one scope, and 96-pistol already has a
   ammoMagazine and 97a-arms a ammoStripperClip. A later file silently
   wins, so naming a function the same as one in another module does not
   collide -- it replaces it, and the first symptom was the Remington
   failing to build.

   These are the models the player watches go into the gun during a
   reload, and they are held at arm's length -- twenty-five centimetres
   from the eye, filling a quarter of the screen. Everything else on a
   weapon is seen at half a metre; a magazine is the closest object in
   the game.

   They were boxes and plain cylinders: a shotgun shell was one smooth
   tube of brass with no head, no rim, no crimp; a magazine was a
   rectangular block with a smaller block stuck on the bottom. At the
   distance they are actually seen, a smooth tube reads as a smooth tube.

   Every model here is built from the real object's dimensions:

     12 gauge shell   18.5 mm across the hull, 70 mm long, 22 mm brass
                      head, rim 1.3 mm proud, six-point crimp
     .45 ACP          11.5 mm rim, 23 mm case, 32 mm overall
     9x19             9.9 mm rim, 19.15 mm case, 29.7 mm overall
     7.63 Mauser      25.1 mm case on a stripper clip of ten
     .500 magnum      13.7 mm rim, 41 mm case
   ============================================================ */

/* A cartridge: rimmed or rimless head, extractor groove, a case that
   tapers into a shoulder and neck where the calibre has one, and a
   bullet seated in it. Built along +X with the bullet forward, base at
   the origin, so it can be laid into a magazine or a chamber by its
   own transform. */
function ammoCartridge(gBrass, gLead, C) {
  const headR = C.headR, caseR = C.caseR != null ? C.caseR : headR * 0.94;
  const neckR = C.neckR != null ? C.neckR : caseR;
  const L = C.caseLen, tip = C.overall;
  /* Head: the rim, the extractor groove cut behind it, then the web.
     The groove is the detail that says this is a cartridge and not a
     length of tube -- it is the only thing on a case that is not a
     smooth taper, so it is what the eye finds. */
  spin(gBrass, [
    [0, 0], [0, headR],
    [0.0013, headR],                       // rim, standing proud
    [0.0016, headR - 0.0011],              // into the extractor groove
    [0.0030, headR - 0.0011],
    [0.0040, headR],                       // and back out to the web
    [L * 0.82, caseR],
    [L * 0.90, neckR + (caseR - neckR) * 0.35],
    [L, neckR],                            // the case mouth
    [L, 0],
  ], 18, 34);
  // Primer, in the middle of the head, slightly dished.
  spin(gBrass, [
    [-0.0004, 0], [-0.0004, headR * 0.42], [0.0006, headR * 0.44], [0.0006, 0],
  ], 14, 40);
  /* Bullet: seated in the neck, so it starts inside the case and comes
     out of it. An ogive rather than a cone -- a cone reads as a pencil. */
  const nose = tip - L;
  const og = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    // A tangent ogive, flattened to a small meplat at the tip.
    const r = (neckR + 0.0001) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.4)));
    og.push([L - 0.004 + nose * t, i === 7 ? Math.max(r, neckR * 0.16) : r]);
  }
  /* The bullet sits flush in the case mouth, a hair proud of it. At 97
     per cent of the neck it left the case's own mouth cap showing as a
     dark ring round the bullet, and every round in a speedloader looked
     like an empty tube with a nail in it. */
  spin(gLead, [[L - 0.006, 0], [L - 0.006, neckR + 0.0001],
    [L + 0.0004, neckR + 0.0001]].concat(og)
    .concat([[L + nose, 0]]), 16, 30);
}

/* A shotgun shell: brass head, a rim you can see, a ribbed plastic hull
   and the folded star crimp at the mouth. Built along +X, base at the
   origin. */
function ammoShell(gBrass, gHull, C) {
  const R = C.r != null ? C.r : 0.00925, L = C.len != null ? C.len : 0.0700;
  const head = C.head != null ? C.head : 0.0220;
  spin(gBrass, [
    [0, 0], [0, R + 0.0013],               // the rim, 1.3 mm proud
    [0.0016, R + 0.0013],
    [0.0020, R + 0.0002],
    [head - 0.006, R + 0.0002],
    [head, R],                             // where the brass ends
    [head, 0],
  ], 18, 34);
  spin(gBrass, [
    [-0.0004, 0], [-0.0004, R * 0.40], [0.0006, R * 0.42], [0.0006, 0],
  ], 14, 40);
  /* The hull, up to the crimp. Very slightly barrelled, the way a fired
     and reloaded one is. */
  /* The hull starts INSIDE the brass, not level with its lip: at the
     same station and two tenths of a millimetre wider it pushed a red
     ring out through the brass. */
  spin(gHull, [
    [head - 0.006, 0], [head - 0.006, R - 0.0004],
    [head + 0.004, R + 0.0002],
    [L - 0.012, R + 0.0002],
    [L - 0.004, R - 0.0004],
    [L - 0.0015, R - 0.0022],              // rolling in toward the crimp
    [L, R - 0.0060],
    [L, 0],
  ], 18, 34);
  /* The crimp: six folds meeting at the centre. Six little wedges rather
     than a flat disc, because the star is the whole silhouette of the end
     of a shell and a flat end reads as a pipe. */
  for (let i = 0; i < 6; i++) {
    const th = i * TAU / 6;
    const c = Math.cos(th), sn = Math.sin(th);
    const rr = R - 0.0026;
    strut(gHull,
      [L - 0.0016, c * rr * 0.62, sn * rr * 0.62],
      [L - 0.0002, c * rr, sn * rr],
      ringOutline(0.0016, 6));
  }
  // Ribs round the hull, faint, where the wad sits.
  for (const bx of [head + 0.012, head + 0.024]) {
    band(gHull, bx - 0.0009, bx + 0.0009, R - 0.0004, R + 0.0009, 20);
  }
}

/* A box magazine: the body, the feed lips, a witness slot down the side,
   the floorplate and the baseplate catch -- and a round showing at the
   top, because a loaded magazine has one and it is the thing that says
   it is loaded.

   Built with the feed lips at +Y and the floorplate at -Y, its own
   origin at the top, so the hand can carry it by the top and push it up
   into a well. */
function ammoMagazine(gSteel, gBrass, gLead, C) {
  const w = C.w, d = C.d, L = C.len;
  const curve = C.curve || 0;
  /* The body, swept down in stations so a curved magazine actually
     curves instead of being a leaning box. */
  const N = 7;
  const st = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = -L * t;
    // A banana magazine's curve is an arc, deepest at the bottom.
    const x = curve * t * t;
    st.push({
      o: new Vec3(x, y, 0),
      u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1),
      pts: roundRect(d * 0.5, d * 0.5, w * 0.5, 3.2, 22),
    });
  }
  sweepPath(gSteel, st, false, true);
  /* Feed lips: two shoulders at the mouth with the gap between them the
     round comes out of. */
  for (const sz of [-1, 1]) {
    hardBox(gSteel, 0, 0.0030, sz * (w * 0.5 - 0.0016), d * 0.5, 0.0034, 0.0018);
  }
  hardBox(gSteel, -d * 0.5 + 0.0016, 0.0026, 0, 0.0018, 0.0030, w * 0.5 - 0.0020);
  /* Witness slots down the flank -- the little holes that show how many
     rounds are left. Raised rims round them, so they read at arm's
     length rather than being invisible dots. */
  for (let i = 0; i < (C.witness || 0); i++) {
    const y = -L * (0.24 + i * 0.17);
    const x = curve * Math.pow(0.24 + i * 0.17, 2);
    for (const sz of [-1, 1]) {
      band(gSteel, sz * (w * 0.5 - 0.0006), sz * (w * 0.5 + 0.0008),
        0.0022, 0.0038, 12, y, 0);
      void x;
    }
  }
  /* Ribs along the back, which is what a stamped magazine has and what
     catches the light on one. */
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.19;
    const y = -L * t, x = curve * t * t;
    hardBox(gSteel, x - d * 0.5 - 0.0006, y, 0, 0.0010, 0.0026, w * 0.5 - 0.0030);
  }
  // Floorplate, standing proud of the body all the way round, and its catch.
  const fy = -L, fx = curve;
  sweepPath(gSteel, [
    { o: new Vec3(fx, fy + 0.0030, 0), u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1),
      pts: roundRect(d * 0.5 + 0.0016, d * 0.5 + 0.0016, w * 0.5 + 0.0016, 3.4, 20) },
    { o: new Vec3(fx, fy - 0.0042, 0), u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1),
      pts: roundRect(d * 0.5 + 0.0016, d * 0.5 + 0.0016, w * 0.5 + 0.0016, 3.4, 20) },
  ], true, true);
  hardBox(gSteel, fx + d * 0.5 - 0.0020, fy - 0.0064, 0, 0.0034, 0.0026, w * 0.28);
  /* The top round, sitting under the lips at the feed angle. This is the
     detail that makes a magazine look loaded instead of like a box. */
  if (C.round) {
    const R = C.round;
    const bg = new Geometry(), bl = new Geometry();
    ammoCartridge(bg, bl, R);
    // Lay it across the magazine, nose forward and slightly up.
    const lay = (src, dst) => {
      const P = src.positions, I = src.indices, N2 = src.normals;
      const base = dst.positions.length / 3;
      const ca = Math.cos(0.16), sa = Math.sin(0.16);
      for (let i = 0; i < P.length; i += 3) {
        // Along the magazine's own +X (out of the front), nose up a little.
        const x = P[i], y = P[i + 1], z = P[i + 2];
        const px = -R.overall * 0.5 + x, py = y, pz = z;
        dst.vert(px * ca - py * sa + 0.0004, px * sa + py * ca - 0.0022, pz,
          N2 ? N2[i] : 0, N2 ? N2[i + 1] : 1, N2 ? N2[i + 2] : 0, 0, 0);
      }
      for (let i = 0; i < I.length; i += 3) dst.tri(base + I[i], base + I[i + 1], base + I[i + 2]);
    };
    lay(bg.finalize(), gBrass);
    lay(bl.finalize(), gLead);
  }
}

/* A stripper clip: the pressed steel spring strip and the rounds standing
   in it, held by their extractor grooves. */
function ammoStripperClip(gSteel, gBrass, gLead, C) {
  const n = C.count || 10, pitch = C.pitch || 0.0098;
  const span = (n - 1) * pitch;
  // The strip, a channel with turned-over edges.
  sweepPath(gSteel, [
    { o: new Vec3(0, 0, -span * 0.5 - 0.004), u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1),
      pts: roundRect(0.0052, 0.0018, 0.0028, 3.0, 14) },
    { o: new Vec3(0, 0, span * 0.5 + 0.004), u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1),
      pts: roundRect(0.0052, 0.0018, 0.0028, 3.0, 14) },
  ], true, true);
  for (const sz of [-1, 1]) {
    hardBox(gSteel, 0.0044, 0, sz * (span * 0.5 + 0.0034), 0.0020, 0.0040, 0.0016);
  }
  // The rounds, nose up, alternating a hair fore and aft the way they sit.
  const bg = new Geometry(), bl = new Geometry();
  ammoCartridge(bg, bl, C.round);
  const stamp = (src, dst, dz, dx) => {
    const P = src.positions, I = src.indices, N2 = src.normals;
    const base = dst.positions.length / 3;
    for (let i = 0; i < P.length; i += 3) {
      // The cartridge is built along +X; stand it up along +Y.
      dst.vert(P[i + 1] + dx, P[i] + 0.0026, P[i + 2] + dz,
        N2 ? N2[i + 1] : 0, N2 ? N2[i] : 1, N2 ? N2[i + 2] : 0, 0, 0);
    }
    for (let i = 0; i < I.length; i += 3) dst.tri(base + I[i], base + I[i + 1], base + I[i + 2]);
  };
  const fb = bg.finalize(), fl = bl.finalize();
  for (let i = 0; i < n; i++) {
    const dz = -span * 0.5 + i * pitch;
    const dx = (i % 2) * 0.0006;
    stamp(fb, gBrass, dz, dx);
    stamp(fl, gLead, dz, dx);
  }
}

/* A speedloader: the knob, the body, and however many rounds hanging
   nose-down out of it on the cylinder's own pitch circle. */
function ammoSpeedloader(gSteel, gBrass, gLead, C) {
  const n = C.count || 6, pcd = C.pcd || 0.0148;
  spin(gSteel, [
    [0, 0], [0, 0.0128], [0.0060, 0.0140], [0.0140, 0.0140],
    [0.0150, 0.0120], [0.0150, 0], 
  ], 20, 34);
  // The knurled release knob on the back.
  spin(gSteel, [
    [0.0150, 0], [0.0150, 0.0070], [0.0210, 0.0068], [0.0210, 0],
  ], 16, 34);
  for (let i = 0; i < 10; i++) {
    const th = i * TAU / 10;
    strut(gSteel, [0.0158, Math.cos(th) * 0.0068, Math.sin(th) * 0.0068],
      [0.0204, Math.cos(th) * 0.0072, Math.sin(th) * 0.0072], ringOutline(0.0009, 5));
  }
  const bg = new Geometry(), bl = new Geometry();
  ammoCartridge(bg, bl, C.round);
  const fb = bg.finalize(), fl = bl.finalize();
  const stamp = (src, dst, cy, cz) => {
    const P = src.positions, I = src.indices, N2 = src.normals;
    const base = dst.positions.length / 3;
    for (let i = 0; i < P.length; i += 3) {
      // Nose pointing out of the loader, i.e. along -X from its face.
      dst.vert(0.0040 - P[i], P[i + 1] + cy, P[i + 2] + cz,
        N2 ? -N2[i] : 0, N2 ? N2[i + 1] : 1, N2 ? N2[i + 2] : 0, 0, 0);
    }
    for (let i = 0; i < I.length; i += 3) dst.tri(base + I[i], base + I[i + 2], base + I[i + 1]);
  };
  for (let i = 0; i < n; i++) {
    const th = i * TAU / n;
    stamp(fb, gBrass, Math.cos(th) * pcd, Math.sin(th) * pcd);
    stamp(fl, gLead, Math.cos(th) * pcd, Math.sin(th) * pcd);
  }
}

/* An energy cell: a finned block with a window down the side showing the
   charge, and the two contacts it seats on. */
function ammoCell(gSteel, gGlow, C) {
  const w = C.w || 0.052, h = C.h || 0.070, d = C.d || 0.038;
  sweepPath(gSteel, [
    { o: new Vec3(-w * 0.5, 0, 0), u: new Vec3(0, 1, 0), v: new Vec3(0, 0, 1),
      pts: roundRect(h * 0.5, h * 0.5, d * 0.5, 3.6, 22) },
    { o: new Vec3(w * 0.5, 0, 0), u: new Vec3(0, 1, 0), v: new Vec3(0, 0, 1),
      pts: roundRect(h * 0.5, h * 0.5, d * 0.5, 3.6, 22) },
  ], true, true);
  // Cooling fins along the top.
  for (let i = 0; i < 5; i++) {
    hardBox(gSteel, -w * 0.5 + 0.006 + i * (w - 0.012) / 4, h * 0.5 + 0.0022, 0,
      0.0016, 0.0026, d * 0.42);
  }
  // Contacts on the bottom face.
  for (const sz of [-1, 1]) {
    hardBox(gSteel, 0, -h * 0.5 - 0.0018, sz * d * 0.22, w * 0.30, 0.0020, 0.0044);
  }
  // The charge window, lit, recessed into both flanks.
  for (const sz of [-1, 1]) {
    hardBox(gGlow, 0, 0, sz * (d * 0.5 - 0.0004), w * 0.34, h * 0.28, 0.0016);
  }
}
