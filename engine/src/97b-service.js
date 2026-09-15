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
  const p = K.port;
  svcSlab(g, [
    [p.x0, p.up, -p.down, 0.0024, 4],
    [p.x1, p.up, -p.down, 0.0024, 4],
  ], R.w - 0.0012);
  /* Trigger housing, guard and blade -- one set, shared by everything
     in the table. */
  const T = K.trigger;
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
    spin(g, [[S.frontX - 0.016, K.barrel.r1 + 0.004], [S.frontX + 0.016, K.barrel.r1 + 0.004],
      [S.frontX + 0.016, S.y - 0.001], [S.frontX + 0.010, S.y + 0.004],
      [S.frontX - 0.010, S.y + 0.004], [S.frontX - 0.016, S.y - 0.001]], 18, 30);
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
         since about 1960 has. */
      spin(g, [[H.x0, K.barrel.r1 + 0.002], [H.x0 + 0.006, H.r],
        [H.x1 - 0.008, H.r], [H.x1, K.barrel.r1 + 0.002]], 22, 30);
      /* Cooling slots, cut as shallow bands rather than real holes. */
      for (let i = 0; i < 4; i++) {
        const x = H.x0 + 0.018 + i * (H.x1 - H.x0 - 0.036) / 3;
        for (const th of [0.9, 2.24, TAU - 0.9, TAU - 2.24]) {
          band(g, x - 0.010, x + 0.010, H.r - 0.0015, H.r + 0.0005, 8,
            Math.cos(th) * H.r * 0.72, Math.sin(th) * H.r * 0.72);
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

function svcMag(g, K) {
  const M = K.mag;
  if (!M || M.kind === 'none') return;
  if (M.kind === 'drum') {
    spin(g, [[M.x - M.w, 0.004], [M.x - M.w, M.r], [M.x + M.w, M.r], [M.x + M.w, 0.004]],
      26, 34, M.y - M.r, 0);
    band(g, M.x - M.w - 0.004, M.x + M.w + 0.004, M.r * 0.30, M.r * 0.38, 20, M.y - M.r, 0);
    svcSlab(g, [[M.x - 0.011, M.y + 0.006, -M.y * 0.0, 0.0105, 4],
      [M.x + 0.011, M.y + 0.006, 0.0, 0.0105, 4]]);
    return;
  }
  if (M.kind === 'pan') {
    /* The DP-28's record player, lying flat on top of the receiver. */
    spin(g, [[M.y - 0.010, 0.006], [M.y - 0.010, M.r], [M.y + 0.006, M.r],
      [M.y + 0.006, 0.006]], 26, 34, 0, 0);
    return;
  }
  if (M.kind === 'belt') {
    /* A short tab of belt hanging out of the feed tray; the rest of it
       is the box, and the box is a separate prop. */
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = M.x - t * 0.030, y = M.y - t * t * 0.055;
      svcSlab(g, [[x - 0.0045, 0.0052, 0.0052, 0.024, 3]], 0, true, true);
      tubeRun(g, [[x - 0.0040, 0.0038], [x + 0.0040, 0.0038]], 10, true, true, y, 0.006);
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
  mag: { kind: 'box', x: -0.012, y: -0.0215, len: 0.150, curve: 0.30,
    w: 0.0125, d: 0.0135, r: 0.055 },
  stock: { kind: 'wood', butt: -0.330, comb: 0.0245, drop: 0.0300, w: 0.0195 },
  sight: { y: 0.0335, frontX: 0.355, rearX: 0.020, front: 'ears', rear: 'notch' },
  handle: null, rail: null,
  mass: 4.3, bound: 0.50,
  origin: new Vec3(-0.082, -0.0180, 0),
  mats: { steel: ARM_MAT.blued, wood: ARM_MAT.poly, mag: ARM_MAT.blued, bolt: ARM_MAT.bright },
};

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
  return out;
}

const SERVICE_KINDS = {

  /* ---------------- assault rifles ---------------- */

  /* The first one anybody made: a stamped receiver, a long wooden
     handguard and a magazine that hangs almost straight down. */
  stg44: svcSpec({
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
    muzzle: 0.470, barrel: { brake: 'cone', gasAt: 0.330 },
    rec: { rear: -0.140, front: 0.100, up: 0.0215, w: 0.0155 },
    hg: { kind: 'tube', x0: 0.110, x1: 0.215, r: 0.0180 },
    mag: { kind: 'none' },
    grip: { rake: 0.58, len: 0.112 },
    stock: { kind: 'wood', butt: -0.320, comb: 0.0180, drop: 0.0260, w: 0.0165 },
    sight: { y: 0.0345, frontX: 0.395, front: 'ears', rear: 'aperture' },
    mass: 4.9,
  }),
  volkhammer: svcSpec({
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
    muzzle: 0.520, barrel: { brake: 'slots', gasAt: 0.400, r1: 0.0088 },
    rec: { rear: -0.132, front: 0.100, up: 0.0215, w: 0.0158 },
    hg: { kind: 'wood', x0: 0.108, x1: 0.300, drop: 0.0240 },
    mag: { curve: 0.20, len: 0.120, w: 0.0128 },
    stock: { kind: 'wood', butt: -0.355, comb: 0.0205, drop: 0.0320 },
    sight: { y: 0.0325, frontX: 0.470, front: 'hood' },
    mass: 4.6,
  }),
  bm59: svcSpec({
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
    mass: 4.8,
  }),
  ak74: svcSpec({
    muzzle: 0.448, barrel: { brake: 'slots', r0: 0.0120, r1: 0.0088,
      gasAt: 0.285, gasR: 0.0075, gasY: 0.0195 },
    rec: { rear: -0.148, front: 0.098, up: 0.0250, down: 0.0220, w: 0.0172, e: 4.5 },
    hg: { kind: 'wood', x0: 0.112, x1: 0.215, drop: 0.0250, w: 0.0200, upper: 0.0300 },
    mag: { curve: 0.40, len: 0.165, w: 0.0126, d: 0.0138 },
    grip: { rake: 0.36, len: 0.104 },
    stock: { kind: 'poly', butt: -0.330, comb: 0.0225, drop: 0.0300 },
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
    muzzle: 0.345, barrel: { rear: 0.045, r0: 0.0128, r1: 0.0094, step: 0.120, gasAt: 0.230 },
    rec: { rear: -0.220, front: 0.065, up: 0.0255, down: 0.0235, w: 0.0180, e: 4.5 },
    port: { x0: -0.140, x1: -0.100, up: 0.0140, down: 0.0020 },
    hg: { kind: 'tube', x0: 0.060, x1: 0.150, r: 0.0230 },
    grip: { x: -0.026, y: -0.0195, len: 0.104, rake: 0.26 },
    mag: { curve: 0.24, len: 0.155, x: -0.140, y: -0.0230 },
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
  geos.wood = new Geometry(); svcFurniture(geos.wood, K);
  /* A grip is furniture on a wooden gun and part of the frame on a
     polymer one, but it is always its own material -- it is the only
     thing on the gun you are actually touching. */
  svcGrip(geos.wood, K);
  geos.mag = new Geometry(); svcMag(geos.mag, K);
  geos.bolt = new Geometry(); svcBolt(geos.bolt, K);
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
  body.ejectPort = [K.port.x0 + 0.020 - o.x, K.port.up * 0.5 - o.y, K.rec.w + 0.004];
  body.magWell = [K.mag && K.mag.kind !== 'none' ? K.mag.x - o.x : 0,
    K.mag ? K.mag.y - o.y : 0, 0];
  body.boltRest = [0, 0, 0];
  body.boltThrow = [-0.032, 0, 0];
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
