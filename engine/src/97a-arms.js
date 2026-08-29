/* ============================================================
   ARMS — the rest of the rack.

   Built the way the 1911 (96-pistol.js) and the Thompson
   (97-thompson.js) are built, and for the same reason: a gun made
   of stretched cubes reads as a pile of boxes no matter how many
   boxes you use, because the thing your eye actually reads is the
   cross-section. A receiver is one profile dragged along an axis;
   a barrel is a circle; a magazine is a rounded rectangle that
   walks down a curve. Sweep and revolve those and the gun comes
   out looking machined.

   Same datum as both: Y = 0 is the bore axis, +X runs to the
   muzzle, +Z is the weapon's right. Each model finishes by moving
   its origin to the web of the firing hand, so the game can hold
   every gun the same way.

   Everything here shares the toolkit those two modules define —
   profileOutline, sweepPath, ringOutline, roundRect, hardBox,
   offsetGeometry — plus the two primitives below, which the first
   two guns did not need.
   ============================================================ */

const AU = new Vec3(0, 1, 0), AV = new Vec3(0, 0, 1);

/* A station on the X axis carrying a profile in (y, z). */
function ax(x, pts, y = 0, z = 0) {
  return { o: new Vec3(x, y, z), u: AU, v: AV, pts };
}

/* A run of circular sections: [[x, r], ...]. Barrels, tubes, pins. */
function tubeRun(g, pts, seg = 20, capA = true, capB = true, y = 0, z = 0) {
  sweepPath(g, pts.map((p) => ax(p[0], ringOutline(p[1], seg), y, z)), capA, capB);
}

/* Revolve a closed outline about the X axis.

   The outline is given in (x, radius) and must run counter-clockwise in
   that plane — x to the right, radius up — which is what puts the normals
   outward. Because the outline is closed, a shape that returns to r = 0
   caps itself, and a shape that dips back inward cuts a bore. That is the
   whole reason this exists: a crowned muzzle, a hooded front sight, a
   fluted revolver cylinder and a scope bell are all one closed outline and
   nothing else, where each would otherwise be four or five parts fighting
   to meet at a seam.

   `smooth` is the corner-splitting threshold from profileOutline: below it
   the two edges share a normal and the surface rounds, above it the corner
   stays sharp. Crowns and chamfers live or die on that number. */
function spin(g, raw, seg = 24, smooth = 32, cy = 0, cz = 0) {
  const prof = profileOutline(raw, smooth);
  const n = prof.length, base = g.positions.length / 3;
  const vArc = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    vArc[k] = vArc[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]);
  }
  for (let s = 0; s <= seg; s++) {
    const th = (s / seg) * TAU, c = Math.cos(th), si = Math.sin(th);
    for (let k = 0; k < n; k++) {
      const p = prof[k];
      // The 2D normal's radial component rides around with the revolution.
      // Metres both ways, matching sweepPath: arc round the revolution,
      // arc along the profile.
      g.vert(p[0], cy + p[1] * c, cz + p[1] * si,
             p[2], p[3] * c, p[3] * si, (s / seg) * TAU * p[1], vArc[k]);
    }
  }
  for (let s = 0; s < seg; s++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      g.quad(base + s * n + k, base + s * n + k2,
             base + (s + 1) * n + k2, base + (s + 1) * n + k);
    }
  }
}

/* A crowned muzzle: the bore actually goes in. Depth is generous because
   what sells it is the shadow, and a 2 mm dimple has none. */
function crown(g, x, outR, boreR, depth = 0.035, taper = 0) {
  spin(g, [
    [x - depth, boreR],
    [x - 0.0015, boreR],
    [x, boreR + 0.0004],
    [x, outR],                       // muzzle face
    [x - 0.006, outR + taper],
    [x - depth, outR + taper],
  ], 22, 34);
}

/* A hoop standing around the bore — barrel band, sight hood, muzzle nut. */
function band(g, x0, x1, rIn, rOut, seg = 22, cy = 0, cz = 0) {
  spin(g, [
    [x0, rIn], [x1, rIn], [x1, rOut], [x0, rOut],
  ], seg, 34, cy, cz);
}

/* Sweep a profile from one point to another. Struts, rails, wire stocks,
   hammer hafts — anything that is a straight member between two places
   the rest of the model has already decided on. */
function strut(g, a, b, pts, capA = true, capB = true) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz) || 1;
  const dir = new Vec3(dx / L, dy / L, dz / L);
  // Any two vectors square to the run will do; pick the one that keeps
  // the profile's "up" as close to world up as the run allows.
  const ref = Math.abs(dir.y) > 0.94 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
  const v = new Vec3().crossVectors(dir, ref).normalize();
  const u = new Vec3().crossVectors(v, dir).normalize();
  sweepPath(g, [
    { o: new Vec3(a[0], a[1], a[2]), u, v, pts },
    { o: new Vec3(b[0], b[1], b[2]), u, v, pts },
  ], capA, capB);
}

/* A trigger guard: a bow swept along a list of points, each station
   square to the local run so the bow keeps its section round the bend. */
function guardBow(g, pts, hf = 0.0022, hb = 0.0022, hw = 0.0046, z = 0) {
  const sts = pts.map(([x, y], i) => {
    const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
    return {
      o: new Vec3(x, y, z), u: new Vec3(-dy / L, dx / L, 0), v: AV,
      pts: roundRect(hf, hb, hw, 2.5, 12),
    };
  });
  sweepPath(g, sts, true, true);
}

/* A trigger: a curved blade with a finger-piece, not a cube. */
function triggerBlade(g, x, y, z = 0, len = 0.021, hw = 0.0038) {
  const pts = [
    [x + 0.0035, y + 0.004], [x + 0.0015, y - len * 0.35],
    [x - 0.0015, y - len * 0.72], [x - 0.0075, y - len],
  ];
  const sts = pts.map(([px, py], i) => {
    const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
    return {
      o: new Vec3(px, py, z), u: new Vec3(-dy / L, dx / L, 0), v: AV,
      pts: roundRect(0.0016, 0.0016, hw, 2.4, 10),
    };
  });
  sweepPath(g, sts, true, true);
}

/* A grip: a raked stack of rounded rectangles. `rake` is how far the
   bottom trails the top, in metres per metre of drop. */
function gripStack(g, topX, topY, len, rake, sections, z = 0) {
  const axis = new Vec3(-rake, -1, 0).normalize();
  const u = new Vec3().crossVectors(AV, axis).normalize();
  const sts = sections.map(([t, hf, hb, hw, e]) => ({
    o: new Vec3(topX + axis.x * len * t, topY + axis.y * len * t, z),
    u, v: AV, pts: roundRect(hf, hb, hw, e || 2.5, 20),
  }));
  sweepPath(g, sts, true, true);
  return axis;
}

/* Checkering, as geometry: a diamond field of shallow pyramids pressed
   into a flat. Cheap — four triangles each — and it is the difference
   between a grip you can feel and a painted slab. */
function checker(g, ox, oy, oz, ux, uy, nz, cols, rows, pitch, depth) {
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = (i - (cols - 1) / 2) * pitch, b = (j - (rows - 1) / 2) * pitch;
      const cx = ox + ux * a, cy = oy + uy * a + b, cz = oz;
      const h = pitch * 0.5;
      const base = g.positions.length / 3;
      const tip = g.vert(cx, cy, cz + nz * depth, 0, 0, nz, 0.5, 0.5);
      void tip;
      const rim = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([p, q]) =>
        g.vert(cx + ux * p, cy + uy * p + q, cz, 0, 0, nz, (p / h + 1) / 2, (q / h + 1) / 2));
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        if (nz > 0) g.tri(base, rim[k], rim[k2]);
        else g.tri(base, rim[k2], rim[k]);
      }
    }
  }
}

/* ============================================================
   MP5 — Heckler & Koch, A3 pattern, from the spec:

     overall (extended)  0.680      barrel      0.225
     overall (collapsed) 0.550      weight      2.5 kg
     receiver width      0.034      calibre     9x19

   The MP5's whole silhouette is three parallel tubes stacked in a
   wedge — receiver, cocking tube, barrel — with a rotary drum on
   the back and a hooded post on the front. Get those three axes
   and the two sights right and the rest is detail.
   ============================================================ */

const MP5 = {
  muzzle: 0.3600,
  barrelRear: 0.1350,
  recFront: 0.1400,
  recRear: -0.0720,
  recUp: 0.0175, recDown: 0.0168, recHalfW: 0.0170,
  ribY: 0.0205,                 // cocking tube / receiver rib axis
  sightY: 0.0450,               // the sight line: it has to clear the
                                // cocking tube, which is why an MP5's sights
                                // stand as tall as they do
  cockR: 0.0122,
  boreOD: 0.0078,               // 9 mm
  gripTopX: -0.0080, gripTopY: -0.0168,
  magX: 0.0640, magY: -0.0170,
  stockButt: -0.3050,
};

function buildMP5Steel(g) {
  const K = MP5;

  /* Receiver: a stamped tube, flat-bottomed, radiused everywhere else,
     with a step down at the rear where the stock collar clamps on. */
  const rec = (x, s = 1) => ax(x, roundRect(K.recUp * s, K.recDown * s, K.recHalfW * s, 2.7, 26));
  sweepPath(g, [
    rec(K.recRear, 0.90), rec(K.recRear + 0.012, 0.90), rec(K.recRear + 0.016, 1),
    rec(0.020), rec(0.090), rec(K.recFront - 0.008), rec(K.recFront, 0.94),
  ], true, true);

  /* The rib along the top, running unbroken into the cocking tube — on the
     real gun they are one pressing, and modelling them as two parts that
     merely touch is what makes a copy look like a copy. */
  sweepPath(g, [
    ax(K.recRear + 0.004, roundRect(0.0050, 0.0090, 0.0072, 3.0, 16), K.ribY),
    ax(0.040, roundRect(0.0050, 0.0090, 0.0072, 3.0, 16), K.ribY),
    ax(K.recFront - 0.004, roundRect(0.0056, 0.0090, 0.0080, 3.0, 16), K.ribY),
  ], true, true);

  /* Cocking tube, receiver front to front sight, with the handle's slot
     cut as a shallow flat on the left flank. */
  sweepPath(g, [
    ax(K.recFront - 0.006, ringOutline(0.0128, 20), K.ribY),
    ax(K.recFront + 0.004, ringOutline(K.cockR, 20), K.ribY),
    ax(0.3020, ringOutline(K.cockR, 20), K.ribY),
    ax(0.3140, ringOutline(0.0104, 20), K.ribY),
  ], true, true);
  // Slot, as a recessed channel rather than a painted line.
  hardBox(g, 0.230, K.ribY + 0.0020, -K.cockR + 0.0016, 0.062, 0.0030, 0.0020);

  /* Barrel: stepped at the chamber, tapering to a threaded muzzle, crowned. */
  tubeRun(g, [
    [K.barrelRear - 0.004, 0.0110], [K.barrelRear + 0.030, 0.0110],
    [K.barrelRear + 0.034, 0.0082], [K.muzzle - 0.030, 0.0075],
    [K.muzzle - 0.028, 0.0086], [K.muzzle - 0.002, 0.0086],
  ], 20, true, false);
  crown(g, K.muzzle, 0.0086, K.boreOD / 2, 0.038);

  /* Front sight: a hooded post, its tip on the sight line and not a
     millimetre off it. Two sights that are each individually beautiful and
     do not share a line cannot be aimed with, and the player finds that out
     the first time they miss something at ten metres. */
  band(g, 0.3160, 0.3400, 0.0120, 0.0152, 22, K.sightY);
  // The hood's base, bridging it down to the cocking tube well under the
  // sight line — anything that crosses that line is a wall across the aim.
  hardBox(g, 0.3280, 0.0270, 0, 0.0080, 0.0075, 0.0060);
  hardBox(g, 0.3280, K.sightY - 0.0085, 0, 0.0022, 0.0060, 0.0020);        // post
  hardBox(g, 0.3280, K.sightY - 0.0014, 0, 0.0015, 0.0028, 0.0012);        // blade tip

  /* Rear sight: an aperture you look through, on the same line. The MP5's
     is a rotary drum, so the ring is drum-sized and carries the four click
     bosses round its rim — but what the eye needs is the hole, and a drum
     modelled as a solid wheel is a wall across the sight picture. */
  const dx = K.recRear + 0.0300;
  hardBox(g, dx, 0.0290, 0, 0.0180, 0.0100, 0.0105);                       // tower
  band(g, dx - 0.0090, dx + 0.0090, 0.0068, 0.0128, 24, K.sightY);
  for (let i = 0; i < 4; i++) {
    const th = i * TAU / 4 + 0.4;
    strut(g, [dx - 0.0100, K.sightY + Math.cos(th) * 0.0104, Math.sin(th) * 0.0104],
          [dx + 0.0100, K.sightY + Math.cos(th) * 0.0104, Math.sin(th) * 0.0104],
          ringOutline(0.0021, 8));
  }

  /* Magazine well: a collar hung under the receiver, raked forward with the
     magazine. Two paddle-release ears at the back of it. */
  const magAxis = new Vec3(0.20, -1, 0).normalize();
  const magU = new Vec3().crossVectors(AV, magAxis).normalize();
  const wellAt = (d, s) => ({
    o: new Vec3(K.magX + magAxis.x * d, K.magY + magAxis.y * d, 0),
    u: magU, v: AV, pts: roundRect(0.0163 * s, 0.0163 * s, 0.0122 * s, 2.9, 20),
  });
  sweepPath(g, [wellAt(-0.006, 1.10), wellAt(0.002, 1.10), wellAt(0.004, 1.0), wellAt(0.030, 1.0)], true, true);
  // Paddle release, behind the well where the trigger finger reaches it.
  for (const s of [-1, 1]) {
    hardBox(g, K.magX - 0.0175, K.magY - 0.0220, s * 0.0128, 0.0055, 0.0085, 0.0024);
  }

  /* Trigger group housing, the trigger and its guard. */
  sweepPath(g, [
    ax(-0.0330, roundRect(0.0060, 0.0130, 0.0148, 2.8, 18), -0.0160),
    ax(0.0060, roundRect(0.0060, 0.0140, 0.0152, 2.8, 18), -0.0160),
    ax(0.0340, roundRect(0.0060, 0.0110, 0.0148, 2.8, 18), -0.0160),
  ], true, true);
  guardBow(g, [
    [0.0010, -0.0300], [0.0030, -0.0410], [0.0130, -0.0480],
    [0.0250, -0.0470], [0.0320, -0.0400], [0.0340, -0.0300],
  ], 0.0024, 0.0024, 0.0052);
  triggerBlade(g, 0.0180, -0.0300);
  // Selector lever, ambidextrous, at the natural thumb.
  for (const s of [-1, 1]) {
    strut(g, [-0.0140, -0.0180, s * 0.0148], [-0.0140, -0.0180, s * 0.0200], ringOutline(0.0052, 12));
    hardBox(g, -0.0250, -0.0200, s * 0.0200, 0.0120, 0.0035, 0.0018);
  }

  /* Stock rails and the collar they slide through: the A3's two tubes. */
  for (const s of [-1, 1]) {
    strut(g, [K.recRear + 0.004, -0.0060, s * 0.0116], [K.recRear - 0.010, -0.0060, s * 0.0116],
      ringOutline(0.0062, 12));
  }
  // Sling loop under the wrist, and the receiver's rear end cap.
  strut(g, [K.recRear + 0.010, -0.0230, -0.0040], [K.recRear + 0.010, -0.0230, 0.0040], ringOutline(0.0034, 10));
}

/* The retractable stock: two rails and a stamped butt. Its own part so the
   gun can be shown collapsed when it is slung and extended when it is up. */
function buildMP5Stock(g) {
  const K = MP5;
  for (const s of [-1, 1]) {
    strut(g, [K.recRear - 0.006, -0.0060, s * 0.0116], [K.stockButt + 0.022, -0.0130, s * 0.0116],
      ringOutline(0.0056, 12));
  }
  // Butt plate, canted the way the A3's is, on a short neck.
  strut(g, [K.stockButt + 0.030, -0.0130, -0.0116], [K.stockButt + 0.030, -0.0130, 0.0116], ringOutline(0.0058, 12));
  sweepPath(g, [
    ax(K.stockButt + 0.004, roundRect(0.0300, 0.0230, 0.0120, 2.6, 20), -0.0180),
    ax(K.stockButt + 0.026, roundRect(0.0250, 0.0180, 0.0090, 2.6, 20), -0.0170),
  ], true, true);
}

/* Handguard and grip: black polymer, so a separate geometry and a
   separate material to the steel. */
function buildMP5Poly(g) {
  const K = MP5;
  /* Slim handguard, hung off the barrel with finger scallops underneath. */
  const hg = (x, up, down, hw) => ax(x, roundRect(up, down, hw, 2.5, 22), -0.0060);
  sweepPath(g, [
    hg(0.1460, 0.0120, 0.0130, 0.0140),
    hg(0.1580, 0.0140, 0.0205, 0.0166),
    hg(0.2100, 0.0140, 0.0222, 0.0172),
    hg(0.2400, 0.0140, 0.0214, 0.0170),
    hg(0.2800, 0.0136, 0.0206, 0.0166),
    hg(0.3020, 0.0125, 0.0150, 0.0138),
  ], true, true);
  // Finger scallops, cut in as a narrowing of the section rather than added
  // as bumps: three rings glued to the outside read as barnacles.
  for (const sx of [0.180, 0.212, 0.244]) {
    sweepPath(g, [
      hg(sx - 0.0075, 0.0140, 0.0216, 0.0168),
      hg(sx, 0.0140, 0.0206, 0.0158),
      hg(sx + 0.0075, 0.0140, 0.0216, 0.0168),
    ], false, false);
  }

  /* Pistol grip. The MP5's is nearly upright and swells at the heel. */
  gripStack(g, K.gripTopX, K.gripTopY, 0.1080, 0.30, [
    [0.00, 0.0165, 0.0195, 0.0158, 2.7],
    [0.22, 0.0150, 0.0180, 0.0150, 2.6],
    [0.55, 0.0142, 0.0172, 0.0148, 2.6],
    [0.84, 0.0148, 0.0186, 0.0154, 2.6],
    [1.00, 0.0130, 0.0164, 0.0140, 2.8],
  ]);
  // Stippling on both flanks, where the palm and fingers actually land.
  for (const s of [-1, 1]) {
    checker(g, K.gripTopX - 0.022, K.gripTopY - 0.055, s * 0.0150, 0.30, -0.95, s, 4, 9, 0.0060, 0.0009);
  }
}

/* Magazine: 30 rounds of 9 mm on a long shallow curve.

   The curve is the point. A 9 mm case is very slightly tapered, so a stack
   of thirty of them describes an arc of about 340 mm radius, and a straight
   MP5 magazine is the single most common way to get this gun wrong. It is
   built as a stack of stations walking down that arc, each one square to
   the local tangent, so the well end meets the receiver flush and the
   floorplate ends up where the real one does. */
function buildMP5Mag(g) {
  const K = MP5;
  const R = 0.3400, LEN = 0.1960, RAKE0 = 0.20;
  const sts = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const t = i / N, d = LEN * t;
    const th = d / R;
    // Walk the arc: the axis rakes further forward the further down it goes.
    const rake = RAKE0 + th;
    const axis = new Vec3(rake, -1, 0).normalize();
    const u = new Vec3().crossVectors(AV, axis).normalize();
    // Position, integrated along the arc rather than guessed.
    let cx = K.magX, cy = K.magY;
    for (let j = 0; j < i; j++) {
      const dj = LEN * (j + 0.5) / N, rj = RAKE0 + dj / R;
      const aj = new Vec3(rj, -1, 0).normalize();
      cx += aj.x * (LEN / N); cy += aj.y * (LEN / N);
    }
    const s = i === 0 ? 1.05 : (i === N ? 1.04 : 1.0);
    sts.push({ o: new Vec3(cx, cy, 0), u, v: AV, pts: roundRect(0.0152 * s, 0.0152 * s, 0.0114 * s, 2.9, 20) });
  }
  sweepPath(g, sts, true, true);
}

/* Charging handle: the tube's own knob, thrown forward and slapped down. */
function buildMP5Bolt(g) {
  const K = MP5;
  strut(g, [0.2760, K.ribY, -K.cockR + 0.002], [0.2760, K.ribY, -K.cockR - 0.0150], ringOutline(0.0058, 14));
  hardBox(g, 0.2760, K.ribY, -K.cockR - 0.0165, 0.0090, 0.0060, 0.0030);
}

/* ============================================================
   BREAK-ACTION DOUBLES — the trench gun, the sawn-off and the
   Paralyzer are the same action three ways, so they are one
   builder with three configurations rather than three guns that
   happen to look alike.

   12 gauge, from the spec: bore 0.0185, barrel wall 0.0018, so a
   tube 0.0221 across at the breech tapering to 0.0205. Two of
   them on 0.0245 centres is a side-by-side; one over the other
   is an over-and-under.

   Split by what moves: everything forward of the hinge pin is a
   separate geometry, because the whole gun opens on that pin.
   ============================================================ */

const DOUBLE = {
  bore: 0.00925, breechR: 0.01105, muzzleR: 0.01025,
  hinge: [0.0210, -0.0240],
  breech: 0.0180,
};

function doubleBores(C) {
  const D = DOUBLE, s = C.spacing != null ? C.spacing : 0.0245;
  return C.overUnder ? [[0, 0], [0, -s]] : [[0, -s / 2], [0, s / 2]];
  void D;
}

/* Everything forward of the pin: barrels, rib, bead, forend. */
function buildDoubleBarrels(g, C) {
  const D = DOUBLE, L = C.barrelLen, bores = doubleBores(C);
  for (const [by, bz] of bores) {
    tubeRun(g, [
      [D.breech - 0.004, D.breechR + 0.0016], [D.breech + 0.010, D.breechR + 0.0016],
      [D.breech + 0.014, D.breechR], [L - 0.030, D.muzzleR],
      [L - 0.002, D.muzzleR],
    ], 20, true, false, by, bz);
    crown(g, L, D.muzzleR, D.bore, 0.055);
  }

  /* The rib: the flat between or over the barrels that carries the bead.
     On a side-by-side it fills the valley; on an over-and-under it sits on
     top. Either way it is what the eye runs down, so it is not optional. */
  if (C.overUnder) {
    sweepPath(g, [
      ax(D.breech + 0.020, roundRect(0.0018, 0.0060, 0.0072, 3.2, 14), D.breechR + 0.0006),
      ax(L - 0.006, roundRect(0.0018, 0.0055, 0.0072, 3.2, 14), D.muzzleR + 0.0006),
    ], true, true);
  } else {
    const s = C.spacing != null ? C.spacing : 0.0245;
    sweepPath(g, [
      ax(D.breech + 0.020, roundRect(0.0020, 0.0090, s / 2, 3.4, 16), 0.0035),
      ax(L - 0.006, roundRect(0.0020, 0.0085, s / 2 - 0.0008, 3.4, 16), 0.0035),
    ], true, true);
  }
  // Bead: a small silver ball, proud of the rib, at the muzzle.
  spin(g, [[L - 0.012, 0], [L - 0.008, 0.0034], [L - 0.004, 0.0034], [L - 0.001, 0]],
    14, 40, (C.overUnder ? DOUBLE.breechR + 0.0060 : 0.0090), 0);

  /* Barrel bands: two hoops that hold the pair together. Without them a
     side-by-side reads as two loose pipes. */
  if (!C.overUnder) {
    const s = C.spacing != null ? C.spacing : 0.0245;
    for (const bx of C.bands || []) {
      for (const bz of [-s / 2, s / 2]) band(g, bx - 0.005, bx + 0.005, D.muzzleR, D.muzzleR + 0.0022, 18, 0, bz);
      hardBox(g, bx, 0, 0, 0.0050, 0.0030, s / 2);
    }
  } else {
    for (const bx of C.bands || []) {
      hardBox(g, bx, -(C.spacing || 0.0245) / 2, 0, 0.0050, (C.spacing || 0.0245) / 2 + 0.004, 0.0060);
    }
  }

  /* Extractor lump and the hook that grips the pin: the underside detail
     you only see when it is open, which is exactly when it matters. */
  hardBox(g, D.breech - 0.002, C.overUnder ? -(C.spacing || 0.0245) - 0.006 : -0.0130, 0,
    0.0080, 0.0060, 0.0150);
  strut(g, [D.hinge[0], D.hinge[1], -0.0130], [D.hinge[0], D.hinge[1], 0.0130], ringOutline(0.0062, 14));

  if (C.science) buildParalyzerFront(g, C);
}

/* The forend, which travels with the barrels. Wood on the two shotguns,
   nothing on the Paralyzer — its coils do that job. */
function buildDoubleForend(g, C) {
  const D = DOUBLE, s = C.spacing != null ? C.spacing : 0.0245;
  const x0 = C.forend[0], x1 = C.forend[1];
  const y = C.overUnder ? -s - 0.004 : -0.0090;
  const hw = C.overUnder ? 0.0230 : s / 2 + 0.0120;
  sweepPath(g, [
    ax(x0, roundRect(0.0100, 0.0130, hw * 0.80, 2.6, 20), y),
    ax(x0 + 0.020, roundRect(0.0120, 0.0210, hw, 2.5, 20), y),
    ax(x1 - 0.040, roundRect(0.0120, 0.0210, hw, 2.5, 20), y),
    ax(x1, roundRect(0.0100, 0.0135, hw * 0.74, 2.7, 20), y),
  ], true, true);
  void D;
}

/* Receiver, trigger group and the top lever. Stays in the hand. */
function buildDoubleAction(g, C) {
  const D = DOUBLE;
  const top = C.overUnder ? D.breechR + 0.006 : D.breechR + 0.004;
  const bot = C.overUnder ? -(C.spacing || 0.0245) - D.breechR - 0.006 : -D.breechR - 0.016;
  const halfW = C.overUnder ? 0.0195 : (C.spacing || 0.0245) / 2 + D.breechR + 0.0020;
  const cy = (top + bot) / 2, hh = (top - bot) / 2;
  const act = (x, s = 1) => ax(x, roundRect(hh * s, hh * s, halfW * s, 3.0, 24), cy);
  sweepPath(g, [
    act(-0.0640, 0.86), act(-0.0560, 0.94), act(-0.0300), act(0.0080), act(D.breech - 0.001, 0.99),
  ], true, true);

  /* Top lever: the thumb piece that opens it, canted right the way a
     worn one always ends up. */
  hardBox(g, -0.0330, top + 0.0040, 0, 0.0170, 0.0038, 0.0090);
  sweepPath(g, [
    ax(-0.0230, roundRect(0.0032, 0.0032, 0.0056, 2.6, 12), top + 0.0055),
    ax(-0.0170, roundRect(0.0030, 0.0030, 0.0040, 2.6, 12), top + 0.0055, 0.0050),
  ], true, true);

  /* Trigger group: two blades in one guard on the shotguns, one on the
     Paralyzer, which fires both barrels together. */
  guardBow(g, [
    [-0.0480, bot - 0.0010], [-0.0450, bot - 0.0130], [-0.0330, bot - 0.0205],
    [-0.0180, bot - 0.0195], [-0.0100, bot - 0.0120], [-0.0080, bot - 0.0010],
  ], 0.0026, 0.0026, 0.0056);
  if (C.twinTriggers) {
    triggerBlade(g, -0.0380, bot - 0.0020, 0, 0.019, 0.0032);
    triggerBlade(g, -0.0250, bot - 0.0020, 0, 0.019, 0.0032);
  } else {
    triggerBlade(g, -0.0300, bot - 0.0020, 0, 0.021, 0.0042);
  }
  // Safety on the tang, and the hinge pin's bosses.
  hardBox(g, -0.0560, top + 0.0030, 0, 0.0075, 0.0026, 0.0048);
  for (const s of [-1, 1]) {
    strut(g, [D.hinge[0] - 0.006, D.hinge[1], s * (halfW - 0.0040)],
      [D.hinge[0] - 0.006, D.hinge[1], s * (halfW + 0.0010)], ringOutline(0.0072, 14));
  }
  if (C.science) buildParalyzerBack(g, C);
}

/* Buttstock and grip. `stock` is 'full' for a shouldered gun, 'stub' for
   a sawn-off's bobbed pistol grip. */
function buildDoubleStock(g, C) {
  const D = DOUBLE;
  const top = C.overUnder ? D.breechR + 0.004 : D.breechR + 0.002;
  const bot = C.overUnder ? -(C.spacing || 0.0245) - D.breechR - 0.004 : -D.breechR - 0.014;

  if (C.stock === 'full') {
    /* Wrist into a comb that falls away from the rib — a stock with no
       drop puts the eye a centimetre over the barrels and looks wrong at
       a glance even to someone who could not say why. */
    const st = (x, cy, up, down, hw) => ax(x, roundRect(up, down, hw, 2.4, 22), cy);
    sweepPath(g, [
      st(-0.0620, (top + bot) / 2, (top - bot) / 2 - 0.001, (top - bot) / 2 - 0.001, 0.0180),
      st(-0.0900, -0.0170, 0.0230, 0.0210, 0.0175),
      st(-0.1400, -0.0250, 0.0250, 0.0230, 0.0190),
      st(-0.2100, -0.0330, 0.0330, 0.0300, 0.0215),
      st(-0.2900, -0.0410, 0.0420, 0.0400, 0.0230),
      st(-0.3200, -0.0430, 0.0450, 0.0430, 0.0225),
    ], true, true);
    // Recoil pad: a soft black block, checkered, standing proud.
    hardBox(g, -0.3235, -0.0430, 0, 0.0035, 0.0470, 0.0230);
    // Pistol grip swelling under the wrist.
    gripStack(g, -0.0980, bot - 0.0020, 0.0740, 0.36, [
      [0.00, 0.0180, 0.0230, 0.0175, 2.6],
      [0.35, 0.0165, 0.0215, 0.0170, 2.5],
      [0.75, 0.0160, 0.0215, 0.0172, 2.5],
      [1.00, 0.0150, 0.0200, 0.0165, 2.8],
    ]);
    for (const s of [-1, 1]) checker(g, -0.115, bot - 0.040, s * 0.0172, 0.36, -0.93, s, 4, 6, 0.0060, 0.0010);
  } else {
    /* Bobbed grip: cut off behind the wrist, which is the whole point of
       a sawn-off and the reason it kicks the way it does. */
    gripStack(g, -0.0680, bot + 0.0060, 0.1000, 0.42, [
      [0.00, 0.0195, 0.0230, 0.0180, 2.6],
      [0.30, 0.0170, 0.0205, 0.0168, 2.5],
      [0.70, 0.0165, 0.0205, 0.0170, 2.5],
      [1.00, 0.0175, 0.0225, 0.0180, 2.8],
    ]);
    for (const s of [-1, 1]) checker(g, -0.092, bot - 0.038, s * 0.0176, 0.42, -0.91, s, 4, 7, 0.0058, 0.0010);
  }
}

/* ---------------- the Paralyzer's laboratory ----------------

   The brief was "fully metal, double barrel, looks scientific". The
   read is: nothing wooden, nothing blued, everything either machined
   bright or wound in copper — an instrument that happens to be a
   shotgun rather than a shotgun with a gadget bolted on. */

function buildParalyzerFront(g, C) {
  const D = DOUBLE, L = C.barrelLen, s = C.spacing || 0.0245;
  /* Ceramic standoffs the coil is wound between, and the muzzle shroud
     the arc jumps across. */
  for (const x of [0.090, 0.170, 0.250]) {
    hardBox(g, x, -s / 2, 0, 0.0060, s / 2 + D.muzzleR + 0.0075, 0.0290);
  }
  // Electrode prongs: four, in a square around the pair, standing forward
  // of the crowns so the gap is visible.
  for (const py of [D.muzzleR + 0.008, -s - D.muzzleR - 0.008]) {
    for (const pz of [-0.017, 0.017]) {
      strut(g, [L - 0.020, py, pz], [L + 0.022, py * 0.62, pz * 0.62], ringOutline(0.0028, 10));
      spin(g, [[L + 0.022, 0], [L + 0.026, 0.0034], [L + 0.030, 0]], 10, 40, py * 0.62, pz * 0.62);
    }
  }
  // Emitter ring the prongs stand off from.
  band(g, L - 0.026, L - 0.018, D.muzzleR + 0.010, D.muzzleR + 0.017, 24, -s / 2);
}

function buildParalyzerBack(g, C) {
  const s = C.spacing || 0.0245;
  /* Heat-sink fins down both flanks of the action — the part that says
     this thing dumps energy somewhere. */
  for (let i = 0; i < 7; i++) {
    const x = -0.052 + i * 0.0092;
    hardBox(g, x, -s / 2, 0, 0.0022, 0.0230, 0.0250);
  }
  // Gauge housing on the left of the standing breech.
  strut(g, [-0.0180, 0.0080, -0.0230], [-0.0180, 0.0080, -0.0300], ringOutline(0.0085, 16));
}

/* Copper: the induction coil, wound in real turns rather than painted on
   as a striped cylinder. Twenty-eight turns costs nothing and it is the
   single thing that makes the gun read as an instrument. */
function buildParalyzerCoil(g, C) {
  const D = DOUBLE, s = C.spacing || 0.0245;
  const cy = -s / 2, rMaj = s / 2 + D.muzzleR + 0.0042, wire = 0.0026;
  const runs = [[0.100, 0.162], [0.180, 0.242]];
  for (const [x0, x1] of runs) {
    const turns = Math.round((x1 - x0) / (wire * 2.15));
    for (let t = 0; t < turns; t++) {
      const x = x0 + (t + 0.5) * (x1 - x0) / turns;
      spin(g, [
        [x - wire, rMaj - wire], [x + wire, rMaj - wire],
        [x + wire, rMaj + wire], [x - wire, rMaj + wire],
      ], 20, 44, cy);
    }
  }
  // The two leads, running back along the top into the action.
  strut(g, [0.100, cy + rMaj, 0], [-0.010, D.breechR + 0.010, 0], ringOutline(wire, 8));
  strut(g, [0.242, cy + rMaj, 0.004], [0.100, cy + rMaj, 0.004], ringOutline(wire, 8));
}

/* The parts that light: the charge tube along the top and the arc gap at
   the muzzle. Their material is emissive, so they are their own geometry. */
function buildParalyzerGlow(g, C) {
  const D = DOUBLE, L = C.barrelLen, s = C.spacing || 0.0245;
  // Charge tube, lying in the valley on top of the barrels.
  spin(g, [
    [0.055, 0], [0.058, 0.0090], [0.250, 0.0090], [0.253, 0],
  ], 18, 34, D.breechR + 0.0085);
  // The gap itself: a disc of light standing between the prongs.
  spin(g, [[L + 0.017, 0], [L + 0.018, 0.0165], [L + 0.019, 0]], 22, 40, -s / 2);
}

/* ============================================================
   MAUSER C96 — the broomhandle, from the spec:

     overall 0.288   barrel 0.140   height 0.145   width 0.038

   Everything about this pistol is unusual and all of it is
   load-bearing: the magazine sits in front of the trigger, the
   bolt runs in a round housing on top of a slab-sided frame, and
   the grip is a turned wooden broom handle. Straighten any one of
   those and it stops being a C96.
   ============================================================ */

const C96 = { muzzle: 0.1850, barrelRear: 0.0450, recRear: -0.0760, magX: 0.0000 };

function buildMauserSteel(g) {
  const K = C96;
  /* Frame: a slab, flat-sided, with the bolt housing riding on top of it.
     Swept as one profile so the two are the same casting, which they are. */
  const frame = (x, up, down, hw) => ax(x, roundRect(up, down, hw, 3.4, 22), -0.0060);
  sweepPath(g, [
    frame(K.recRear + 0.002, 0.0125, 0.0105, 0.0110),
    frame(-0.0600, 0.0135, 0.0125, 0.0148),
    frame(-0.0180, 0.0135, 0.0170, 0.0152),
    frame(0.0180, 0.0135, 0.0175, 0.0152),
    frame(0.0400, 0.0130, 0.0130, 0.0140),
    frame(K.barrelRear + 0.004, 0.0120, 0.0105, 0.0120),
  ], true, true);

  /* Bolt housing: the round tube the bolt runs in, and the rails that
     carry it, from the rear of the frame to the barrel shank. */
  sweepPath(g, [
    ax(K.recRear, ringOutline(0.0110, 20), 0.0060),
    ax(K.recRear + 0.006, ringOutline(0.0122, 20), 0.0060),
    ax(0.0180, ringOutline(0.0122, 20), 0.0060),
    ax(0.0300, ringOutline(0.0112, 20), 0.0060),
    ax(K.barrelRear + 0.006, ringOutline(0.0106, 20), 0.0060),
  ], true, false);

  /* Barrel: long, slim, stepped once, crowned. */
  tubeRun(g, [
    [K.barrelRear, 0.0098], [K.barrelRear + 0.014, 0.0098],
    [K.barrelRear + 0.017, 0.0072], [K.muzzle - 0.002, 0.0068],
  ], 20, true, false);
  crown(g, K.muzzle, 0.0068, 0.00385, 0.030);
  // Front blade on its ramp.
  hardBox(g, K.muzzle - 0.014, 0.0090, 0, 0.0060, 0.0028, 0.0030);
  hardBox(g, K.muzzle - 0.014, 0.0128, 0, 0.0014, 0.0028, 0.0011);

  /* Tangent rear sight — the C96's absurd 1000-metre ladder, laid flat.
     Even folded it is the landmark that identifies the gun from behind. */
  hardBox(g, -0.0180, 0.0192, 0, 0.0240, 0.0026, 0.0058);
  hardBox(g, -0.0400, 0.0200, 0, 0.0060, 0.0034, 0.0072);
  hardBox(g, -0.0400, 0.0228, 0, 0.0018, 0.0026, 0.0072);          // the notch's wings
  for (const s of [-1, 1]) hardBox(g, -0.0400, 0.0238, s * 0.0056, 0.0018, 0.0018, 0.0016);

  /* Magazine box, ahead of the guard, with its stamped floor and the
     follower slot up the right side. */
  sweepPath(g, [
    ax(K.magX, roundRect(0.0100, 0.0100, 0.0092, 3.2, 18), -0.0230),
    ax(K.magX + 0.0060, roundRect(0.0230, 0.0230, 0.0100, 3.2, 18), -0.0230),
    ax(K.magX + 0.0400, roundRect(0.0230, 0.0230, 0.0100, 3.2, 18), -0.0230),
    ax(K.magX + 0.0460, roundRect(0.0100, 0.0100, 0.0092, 3.2, 18), -0.0230),
  ], true, true);
  hardBox(g, K.magX + 0.0230, -0.0470, 0, 0.0250, 0.0030, 0.0104);

  /* Trigger group. */
  guardBow(g, [
    [-0.0490, -0.0230], [-0.0470, -0.0330], [-0.0370, -0.0400],
    [-0.0250, -0.0392], [-0.0180, -0.0320], [-0.0160, -0.0225],
  ], 0.0024, 0.0024, 0.0050);
  triggerBlade(g, -0.0330, -0.0230, 0, 0.019, 0.0034);

  /* Hammer, at the very back, ring-cut the way the small-ring guns are. */
  spin(g, [[0, 0], [0, 0.0090], [0.0030, 0.0090], [0.0030, 0]], 16, 40, 0.0225, 0);
  hardBox(g, K.recRear + 0.0130, 0.0225, 0, 0.0060, 0.0080, 0.0030);
  strut(g, [K.recRear + 0.0150, 0.0225, -0.0016], [K.recRear + 0.0150, 0.0225, 0.0016], ringOutline(0.0044, 12));
}

/* The bolt: it runs straight back in its housing, which is what the
   stripper-clip reload actually looks like. */
function buildMauserBolt(g) {
  const K = C96;
  sweepPath(g, [
    ax(K.recRear + 0.004, ringOutline(0.0100, 18), 0.0060),
    ax(-0.0300, ringOutline(0.0100, 18), 0.0060),
  ], true, true);
  // The two knurled wings you pull it back by.
  for (const s of [-1, 1]) {
    hardBox(g, K.recRear + 0.0120, 0.0060, s * 0.0114, 0.0100, 0.0068, 0.0026);
    for (let i = 0; i < 4; i++) hardBox(g, K.recRear + 0.0050 + i * 0.0046, 0.0060, s * 0.0142, 0.0011, 0.0064, 0.0006);
  }
}

/* Stripper clip: ten rounds in a steel comb, shown only while it is being
   pressed into the open action. The rounds point forward and stand side by
   side across the gun, which is the way they actually go in. */
function buildStripperClip(g, rounds = 10, calR = 0.00385, pitch = 0.0086) {
  const w = ((rounds - 1) / 2) * pitch + calR;
  hardBox(g, -0.0140, 0.0060, 0, 0.0030, 0.0090, w);              // the comb
  hardBox(g, -0.0100, 0.0060, 0, 0.0016, 0.0068, w);
  for (let i = 0; i < rounds; i++) {
    const z = (i - (rounds - 1) / 2) * pitch;
    // Cases nose-forward and ogived: a clip of plain cylinders reads as a
    // comb of dowels.
    spin(g, [
      [-0.0155, 0], [-0.0155, calR], [-0.0030, calR], [-0.0024, calR * 0.90],
      [0.0034, calR * 0.84], [0.0092, calR * 0.48], [0.0112, 0],
    ], 12, 36, 0.0060, z);
  }
}

/* The broom handle itself: turned walnut, grooved, in its own geometry
   because it is the one part of the gun that is not steel. */
function buildMauserGrip(g) {
  const axis = new Vec3(0.30, -1, 0).normalize();
  const u = new Vec3().crossVectors(AV, axis).normalize();
  const at = (d, r, e) => ({
    o: new Vec3(-0.0620 + axis.x * d, -0.0180 + axis.y * d, 0),
    u, v: AV, pts: roundRect(r * 1.02, r * 1.02, r * 0.88, e, 20),
  });
  sweepPath(g, [
    at(0.000, 0.0150, 3.0), at(0.008, 0.0168, 2.6), at(0.026, 0.0175, 2.3),
    at(0.052, 0.0170, 2.2), at(0.074, 0.0163, 2.3), at(0.086, 0.0150, 2.8),
  ], true, true);
  // Twelve turned grooves — the detail that gives the broomhandle its name.
  for (let i = 0; i < 9; i++) {
    const d = 0.014 + i * 0.0072;
    const t = d / 0.086;
    const r = lerp(0.0172, 0.0155, t) - 0.0011;
    const cx = -0.0620 + axis.x * d, cy = -0.0180 + axis.y * d;
    sweepPath(g, [
      { o: new Vec3(cx - axis.x * 0.0016, cy - axis.y * 0.0016, 0), u, v: AV, pts: roundRect(r, r, r * 0.88, 2.3, 18) },
      { o: new Vec3(cx + axis.x * 0.0016, cy + axis.y * 0.0016, 0), u, v: AV, pts: roundRect(r, r, r * 0.88, 2.3, 18) },
    ], false, false);
  }
}

/* ============================================================
   OBLITERATED MODEL 5 — a four-chamber magnum. Not a real gun,
   but built to real proportions: a .500-class revolver's cylinder
   is 0.052 across and 0.056 long, and putting four chambers in
   it instead of five is what makes each of them look like a hole
   you could lose a finger in.
   ============================================================ */

const MOD5 = { muzzle: 0.2050, cylX0: -0.0060, cylX1: 0.0500, cylR: 0.0270, bore: 0.0064 };

function buildModel5Steel(g) {
  const K = MOD5;
  /* Frame: top strap over the cylinder, standing breech behind it, forcing
     cone in front. Three runs, because the cylinder window between them is
     a gap rather than a section. */
  sweepPath(g, [
    ax(K.cylX0 - 0.006, roundRect(0.0055, 0.0055, 0.0110, 3.2, 20), K.cylR + 0.0060),
    ax(K.cylX1 + 0.010, roundRect(0.0060, 0.0060, 0.0112, 3.2, 20), K.cylR + 0.0060),
  ], true, true);
  sweepPath(g, [                                        // recoil shield and grip frame
    ax(K.cylX0 - 0.048, roundRect(0.0230, 0.0300, 0.0160, 3.0, 24), 0),
    ax(K.cylX0 - 0.026, roundRect(K.cylR + 0.0115, 0.0300, 0.0175, 3.0, 24), 0),
    ax(K.cylX0 - 0.004, roundRect(K.cylR + 0.0115, 0.0300, 0.0175, 3.0, 24), 0),
  ], true, true);
  sweepPath(g, [                                        // forcing cone
    ax(K.cylX1 + 0.002, roundRect(K.cylR + 0.0110, 0.0250, 0.0170, 3.0, 24), 0),
    ax(K.cylX1 + 0.020, roundRect(K.cylR + 0.0110, 0.0250, 0.0170, 3.0, 24), 0),
  ], true, true);
  // The floor under the window, joining the two halves of the frame.
  hardBox(g, (K.cylX0 + K.cylX1) / 2, -K.cylR - 0.0060, 0, (K.cylX1 - K.cylX0) / 2 + 0.012, 0.0050, 0.0105);

  /* Barrel: a heavy underlugged bull with a vent rib. */
  tubeRun(g, [
    [K.cylX1 + 0.014, 0.0135], [K.cylX1 + 0.030, 0.0135],
    [K.muzzle - 0.008, 0.0128], [K.muzzle - 0.002, 0.0128],
  ], 22, false, false);
  crown(g, K.muzzle, 0.0128, K.bore / 2, 0.045, 0.0016);
  sweepPath(g, [
    ax(K.cylX1 + 0.016, roundRect(0.0075, 0.0130, 0.0100, 3.2, 18), -0.0110),
    ax(K.muzzle - 0.030, roundRect(0.0075, 0.0130, 0.0100, 3.2, 18), -0.0110),
    ax(K.muzzle - 0.002, roundRect(0.0075, 0.0110, 0.0095, 3.2, 18), -0.0110),
  ], true, true);
  sweepPath(g, [
    ax(K.cylX1 + 0.016, roundRect(0.0038, 0.0090, 0.0072, 3.4, 16), 0.0135),
    ax(K.muzzle - 0.002, roundRect(0.0038, 0.0090, 0.0072, 3.4, 16), 0.0135),
  ], true, true);
  for (let i = 0; i < 6; i++) {
    hardBox(g, K.cylX1 + 0.034 + i * 0.0190, 0.0176, 0, 0.0058, 0.0016, 0.0044);
  }
  // Front ramp and the rear notch, on one line.
  hardBox(g, K.muzzle - 0.016, 0.0198, 0, 0.0090, 0.0035, 0.0032);
  hardBox(g, K.muzzle - 0.016, 0.0244, 0, 0.0016, 0.0040, 0.0014);
  hardBox(g, K.cylX0 - 0.012, K.cylR + 0.0130, 0, 0.0075, 0.0035, 0.0090);
  for (const s of [-1, 1]) hardBox(g, K.cylX0 - 0.012, K.cylR + 0.0160, s * 0.0062, 0.0075, 0.0026, 0.0028);

  /* Hammer, spurred and checkered, behind the breech. */
  hardBox(g, K.cylX0 - 0.046, 0.0230, 0, 0.0120, 0.0060, 0.0038);
  hardBox(g, K.cylX0 - 0.054, 0.0290, 0, 0.0080, 0.0035, 0.0055);
  for (let i = 0; i < 5; i++) hardBox(g, K.cylX0 - 0.062 + i * 0.0028, 0.0322, 0, 0.0009, 0.0012, 0.0050);

  /* Trigger in its guard, under the breech. */
  guardBow(g, [
    [K.cylX0 - 0.052, -0.0290], [K.cylX0 - 0.054, -0.0400], [K.cylX0 - 0.040, -0.0480],
    [K.cylX0 - 0.020, -0.0470], [K.cylX0 - 0.008, -0.0390], [K.cylX0 - 0.006, -0.0290],
  ], 0.0030, 0.0030, 0.0060);
  triggerBlade(g, K.cylX0 - 0.030, -0.0290, 0, 0.023, 0.0044);
  // Cylinder release, left side of the frame.
  hardBox(g, K.cylX0 - 0.024, 0.0060, -0.0180, 0.0110, 0.0040, 0.0022);
  // The crane arm: it stands in front of the cylinder on the left and is
  // what the whole cylinder swings out on.
  strut(g, [K.cylX1 + 0.004, -0.0150, -0.0150], [K.cylX1 + 0.026, -0.0150, -0.0150], ringOutline(0.0056, 14));
}

/* The cylinder: four chambers, fluted between them, its own actor so it
   can swing out on the crane. */
function buildModel5Cylinder(g) {
  const K = MOD5, N = 4, chR = 0.0098, pcd = 0.0148;
  spin(g, [
    [K.cylX0, 0], [K.cylX0, 0.0090], [K.cylX0 - 0.0080, 0.0090], [K.cylX0 - 0.0080, 0],
  ], 18, 36);
  spin(g, [
    [K.cylX0, 0], [K.cylX0, K.cylR - 0.0025], [K.cylX0 + 0.0025, K.cylR],
    [K.cylX1 - 0.0025, K.cylR], [K.cylX1, K.cylR - 0.0025], [K.cylX1, 0],
  ], 30, 36);
  for (let i = 0; i < N; i++) {
    const th = i * TAU / N + PI / 4;
    const cy = Math.cos(th) * pcd, cz = Math.sin(th) * pcd;
    // A bored chamber, open at the muzzle end, with a case head showing at
    // the back — four holes you can see into is the whole point of it.
    spin(g, [
      [K.cylX0 + 0.006, 0], [K.cylX0 + 0.006, chR * 0.62],
      [K.cylX0 + 0.004, chR], [K.cylX1 + 0.0004, chR],
      [K.cylX1 + 0.0004, chR + 0.0010], [K.cylX0 - 0.0002, chR + 0.0010],
      [K.cylX0 - 0.0002, 0],
    ], 16, 30, cy, cz);
    // Flute milled between this chamber and the next.
    const fth = th + TAU / (N * 2);
    const fy = Math.cos(fth) * (K.cylR + 0.0055), fz = Math.sin(fth) * (K.cylR + 0.0055);
    spin(g, [
      [K.cylX0 + 0.0080, 0], [K.cylX0 + 0.0080, 0.0100],
      [K.cylX1 - 0.0080, 0.0100], [K.cylX1 - 0.0080, 0],
    ], 14, 34, fy, fz);
  }
  // Ejector rod, standing forward under the barrel.
  spin(g, [[K.cylX1, 0], [K.cylX1, 0.0042], [K.cylX1 + 0.030, 0.0042],
           [K.cylX1 + 0.034, 0.0060], [K.cylX1 + 0.038, 0]], 14, 36);
}

/* Grips: rubber, finger-grooved, wrapping the backstrap. */
function buildModel5Grip(g) {
  const K = MOD5, topX = K.cylX0 - 0.040;
  const axis = gripStack(g, topX, -0.0300, 0.1080, 0.34, [
    [0.00, 0.0195, 0.0210, 0.0175, 2.5],
    [0.20, 0.0185, 0.0225, 0.0192, 2.4],
    [0.48, 0.0180, 0.0230, 0.0196, 2.4],
    [0.76, 0.0182, 0.0232, 0.0196, 2.4],
    [1.00, 0.0175, 0.0215, 0.0180, 2.7],
  ]);
  for (let i = 0; i < 3; i++) {
    const d = 0.026 + i * 0.026;
    const cx = topX + axis.x * d, cy = -0.0300 + axis.y * d;
    strut(g, [cx + 0.0160, cy, -0.0130], [cx + 0.0160, cy, 0.0130], ringOutline(0.0050, 12));
  }
  for (const s of [-1, 1]) checker(g, topX - 0.030, -0.0750, s * 0.0192, 0.34, -0.94, s, 4, 8, 0.0058, 0.0009);
}

/* ============================================================
   ARC BREAKER — the wonder weapon.

   The failure mode for a fictional gun is that nothing about it
   is dimensioned, so it comes out as one big lump. This one is
   dimensioned off a real gun's ergonomics and only then made
   strange: the grip, trigger and sight line are a carbine's, and
   the strangeness is all in what sits between them — an
   accelerator tube wound in copper, a cell hanging where a
   magazine would, and three emitter horns that throw the arc
   across a gap you can see daylight through.
   ============================================================ */

const ARC = {
  tip: 0.5600, emitter: 0.4900, tubeY: 0.0230, tubeR: 0.0230,
  bodyRear: -0.1050, bodyFront: 0.1900, cellX: 0.0620, cellY: -0.0300,
  butt: -0.2400,
};

function buildArcSteel(g) {
  const K = ARC;
  /* Receiver: a milled block with a flat top rail, cut away at the sides
     into a lattice of vents so it reads as machined rather than cast. */
  const bd = (x, up, down, hw) => ax(x, roundRect(up, down, hw, 3.2, 24), 0);
  sweepPath(g, [
    bd(K.bodyRear, 0.0210, 0.0250, 0.0225),
    bd(K.bodyRear + 0.014, 0.0240, 0.0280, 0.0265),
    bd(0.0400, 0.0240, 0.0280, 0.0265),
    bd(0.1300, 0.0235, 0.0250, 0.0250),
    bd(K.bodyFront, 0.0215, 0.0195, 0.0215),
  ], true, true);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = -0.0640 + i * 0.0380;
      hardBox(g, x, -0.0040, s * 0.0268, 0.0130, 0.0110, 0.0022);
    }
  }
  /* Top rail with a set of iron sights, because a wonder weapon you cannot
     aim is a toy. Rear notch at the back of the rail, blade at the front. */
  hardBox(g, 0.0300, 0.0268, 0, 0.0900, 0.0034, 0.0110);
  hardBox(g, -0.0400, 0.0330, 0, 0.0070, 0.0038, 0.0090);
  for (const s of [-1, 1]) hardBox(g, -0.0400, 0.0364, s * 0.0062, 0.0070, 0.0028, 0.0028);
  hardBox(g, 0.1180, 0.0340, 0, 0.0060, 0.0050, 0.0034);
  hardBox(g, 0.1180, 0.0398, 0, 0.0016, 0.0030, 0.0013);

  /* Accelerator tube: the barrel's replacement. Stepped up at each coil
     pack, and it does not end in a muzzle — it ends in a gap. */
  sweepPath(g, [
    ax(0.1000, ringOutline(0.0200, 22), K.tubeY),
    ax(0.1900, ringOutline(K.tubeR, 22), K.tubeY),
    ax(0.4200, ringOutline(K.tubeR, 22), K.tubeY),
    ax(0.4400, ringOutline(0.0190, 22), K.tubeY),
  ], true, true);
  // Insulator collars between the coil packs.
  for (const x of [0.2050, 0.2850, 0.3650]) band(g, x - 0.008, x + 0.008, K.tubeR, K.tubeR + 0.0075, 24, K.tubeY);

  /* Emitter: three horns on 120 degrees, sweeping in toward a point the
     arc jumps from. The gap between their tips is the whole silhouette. */
  for (let i = 0; i < 3; i++) {
    const th = i * TAU / 3 - PI / 2;
    const r0 = 0.0290, r1 = 0.0130;
    const a = [0.4400, K.tubeY + Math.cos(th) * r0, Math.sin(th) * r0];
    const m = [K.emitter, K.tubeY + Math.cos(th) * r0 * 0.92, Math.sin(th) * r0 * 0.92];
    const b = [K.tip - 0.012, K.tubeY + Math.cos(th) * r1, Math.sin(th) * r1];
    strut(g, a, m, roundRect(0.0060, 0.0060, 0.0075, 2.6, 14));
    strut(g, m, b, roundRect(0.0045, 0.0045, 0.0055, 2.6, 14));
    spin(g, [[K.tip - 0.014, 0], [K.tip - 0.006, 0.0050], [K.tip, 0]], 12, 40,
      K.tubeY + Math.cos(th) * r1, Math.sin(th) * r1);
  }
  band(g, 0.4380, 0.4520, K.tubeR - 0.002, K.tubeR + 0.0110, 24, K.tubeY);

  /* Cell well, hung under the body where a magazine goes, with its catch. */
  sweepPath(g, [
    ax(K.cellX - 0.0300, roundRect(0.0100, 0.0100, 0.0230, 3.2, 20), K.cellY),
    ax(K.cellX - 0.0230, roundRect(0.0230, 0.0230, 0.0250, 3.2, 20), K.cellY),
    ax(K.cellX + 0.0230, roundRect(0.0230, 0.0230, 0.0250, 3.2, 20), K.cellY),
    ax(K.cellX + 0.0300, roundRect(0.0100, 0.0100, 0.0230, 3.2, 20), K.cellY),
  ], true, true);
  hardBox(g, K.cellX + 0.0330, K.cellY - 0.0060, 0, 0.0080, 0.0075, 0.0110);

  /* Trigger group. */
  guardBow(g, [
    [-0.0480, -0.0250], [-0.0455, -0.0370], [-0.0330, -0.0455],
    [-0.0180, -0.0445], [-0.0100, -0.0360], [-0.0080, -0.0250],
  ], 0.0030, 0.0030, 0.0062);
  triggerBlade(g, -0.0300, -0.0250, 0, 0.023, 0.0044);

  /* Shoulder brace: a tube frame back to a padded plate, with heat fins on
     top of the neck. */
  for (const s of [-1, 1]) {
    strut(g, [K.bodyRear + 0.004, -0.0080, s * 0.0140], [K.butt + 0.026, -0.0230, s * 0.0170],
      ringOutline(0.0068, 12));
  }
  strut(g, [K.butt + 0.030, -0.0230, -0.0170], [K.butt + 0.030, -0.0230, 0.0170], ringOutline(0.0068, 12));
  sweepPath(g, [
    ax(K.butt, roundRect(0.0330, 0.0300, 0.0130, 2.6, 20), -0.0180),
    ax(K.butt + 0.022, roundRect(0.0280, 0.0250, 0.0105, 2.6, 20), -0.0180),
  ], true, true);
  for (let i = 0; i < 6; i++) {
    hardBox(g, K.bodyRear - 0.012 - i * 0.0130, 0.0090, 0, 0.0028, 0.0170, 0.0150);
  }
}

/* Copper: three coil packs wound round the accelerator tube, plus the bus
   bars that feed them from the cell. */
function buildArcCopper(g) {
  const K = ARC, wire = 0.0032;
  for (const [x0, x1] of [[0.2160, 0.2740], [0.2960, 0.3540], [0.3760, 0.4260]]) {
    const turns = Math.round((x1 - x0) / (wire * 2.2));
    for (let t = 0; t < turns; t++) {
      const x = x0 + (t + 0.5) * (x1 - x0) / turns;
      spin(g, [
        [x - wire, K.tubeR + 0.001], [x + wire, K.tubeR + 0.001],
        [x + wire, K.tubeR + 0.001 + wire * 2], [x - wire, K.tubeR + 0.001 + wire * 2],
      ], 22, 44, K.tubeY);
    }
  }
  // Bus bar down the right flank, cell to the first coil.
  strut(g, [K.cellX + 0.020, K.cellY + 0.014, 0.0230], [0.2000, K.tubeY - 0.010, 0.0230],
    roundRect(0.0028, 0.0028, 0.0060, 3.0, 10));
  strut(g, [0.2000, K.tubeY - 0.010, 0.0230], [0.2160, K.tubeY, 0.0230], roundRect(0.0028, 0.0028, 0.0060, 3.0, 10));
  // Ring terminals where it lands.
  for (const x of [0.2160, 0.2960, 0.3760]) band(g, x - 0.004, x + 0.004, K.tubeR + 0.0072, K.tubeR + 0.0110, 20, K.tubeY);
}

/* The lit parts: the tube's own charge window and the arc across the gap. */
function buildArcGlow(g) {
  const K = ARC;
  // Charge window: a band of light showing through a slot in the tube.
  for (const [x0, x1] of [[0.2760, 0.2940], [0.3560, 0.3740]]) {
    band(g, x0, x1, K.tubeR - 0.0020, K.tubeR + 0.0012, 24, K.tubeY);
  }
  // The gap: a small bright core suspended between the three horns.
  spin(g, [
    [K.tip - 0.026, 0], [K.tip - 0.018, 0.0110], [K.tip - 0.006, 0.0110], [K.tip - 0.002, 0],
  ], 20, 34, K.tubeY);
  // Pilot light on the receiver's left, where a fire selector would be.
  spin(g, [[-0.0180, 0], [-0.0180, 0.0060], [-0.0150, 0.0060], [-0.0150, 0]], 14, 40, 0.0060, -0.0270);
}

/* The cell: a machined can with a glass window, which drops out of the well
   on reload. Its own actor, so it can. */
function buildArcCell(g) {
  const K = ARC;
  sweepPath(g, [
    ax(K.cellX - 0.0225, roundRect(0.0215, 0.0215, 0.0225, 3.0, 22), K.cellY),
    ax(K.cellX - 0.0180, roundRect(0.0235, 0.0235, 0.0245, 3.0, 22), K.cellY),
    ax(K.cellX + 0.0180, roundRect(0.0235, 0.0235, 0.0245, 3.0, 22), K.cellY),
    ax(K.cellX + 0.0225, roundRect(0.0215, 0.0215, 0.0225, 3.0, 22), K.cellY),
  ], true, true);
  // Contacts on top, ribs down the sides, and the pull tab underneath.
  for (const s of [-1, 1]) strut(g, [K.cellX + s * 0.0110, K.cellY + 0.0235, 0], [K.cellX + s * 0.0110, K.cellY + 0.0290, 0], ringOutline(0.0038, 10));
  for (let i = 0; i < 3; i++) hardBox(g, K.cellX - 0.012 + i * 0.012, K.cellY, 0.0250, 0.0028, 0.0210, 0.0016);
  hardBox(g, K.cellX, K.cellY - 0.0255, 0, 0.0130, 0.0035, 0.0110);
}

function buildArcCellGlow(g) {
  const K = ARC;
  for (const s of [-1, 1]) hardBox(g, K.cellX, K.cellY - 0.002, s * 0.0244, 0.0140, 0.0130, 0.0010);
}

/* ============================================================
   THE THINGS YOU SWING

   A knife, a hammer, a ram and a shield. They get the same
   treatment as the guns for the same reason: a blade is a swept
   profile with a taper, and a hammer head is a forging, and both
   look like what they are the moment their cross-section is right.
   ============================================================ */

/* Trench knife: double-edged blade with a fuller, a knuckle bow, and a
   skull-crusher on the pommel. Point at +X, edges in Z. */
function buildKnifeSteel(g) {
  const tip = 0.1900, guard = 0.0000;
  /* Blade. Diamond section: a spine down the middle falling to an edge each
     side. Modelled as a flattened rounded rect whose width collapses toward
     the point and whose thickness collapses toward the edges. */
  // Edges up and down, flats to the sides: that is how a dagger sits in a
  // fist, and it is what decides whether the blade reads as a blade or as
  // a length of wire when you are holding it.
  const bl = (x, hw, th) => ax(x, roundRect(hw, hw, th, 1.5, 20));
  sweepPath(g, [
    bl(guard + 0.002, 0.0135, 0.0024),
    bl(0.0300, 0.0152, 0.0026),
    bl(0.1100, 0.0142, 0.0022),
    bl(0.1550, 0.0110, 0.0018),
    bl(tip - 0.010, 0.0052, 0.0011),
    bl(tip, 0.0010, 0.0004),
  ], true, true);
  /* Spine: a raised rib down the centre of each flank. A diamond section
     alone comes out as a flat lozenge; the rib is what makes the light
     break twice across the blade instead of once. */
  for (const s of [-1, 1]) {
    sweepPath(g, [
      ax(0.0060, roundRect(0.0038, 0.0038, 0.0007, 2.2, 10), 0, s * 0.0020),
      ax(0.0300, roundRect(0.0050, 0.0050, 0.0009, 2.2, 10), 0, s * 0.0022),
      ax(0.1300, roundRect(0.0044, 0.0044, 0.0008, 2.2, 10), 0, s * 0.0019),
      ax(0.1600, roundRect(0.0026, 0.0026, 0.0004, 2.2, 10), 0, s * 0.0013),
    ], true, true);
  }
  /* Crossguard, and the knuckle bow arching over the grip — the thing that
     makes a trench knife a trench knife. */
  hardBox(g, guard - 0.004, 0, 0, 0.0055, 0.0235, 0.0075);
  /* Knuckle bow: it leaves the guard, drops clear of the fingers and comes
     back to the pommel — a D over the whole hand. The M1918's bow is what
     you punch with, so it stands well proud of the grip rather than
     hugging it. */
  const bow = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, a = PI * t;
    bow.push([guard - 0.004 - t * 0.0920, -0.0140 - Math.sin(a) * 0.0260]);
  }
  guardBow(g, bow, 0.0038, 0.0038, 0.0060);
  // Four brass-knuckle bumps along the bow's outside.
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.21, a = PI * t;
    spin(g, [[guard - 0.004 - t * 0.0920 - 0.0035, 0], [guard - 0.004 - t * 0.0920, 0.0068],
             [guard - 0.004 - t * 0.0920 + 0.0035, 0]], 12, 40,
      -0.0140 - Math.sin(a) * 0.0260 - 0.0038, 0);
  }
  // Pommel: a faceted skull-crusher.
  spin(g, [
    [-0.1080, 0], [-0.1080, 0.0090], [-0.0980, 0.0115], [-0.0940, 0.0100], [-0.0940, 0],
  ], 8, 20);
}

function buildKnifeGrip(g) {
  const at = (x, r, e) => ax(x, roundRect(r, r, r * 0.86, e, 18));
  sweepPath(g, [
    at(-0.0940, 0.0120, 2.6), at(-0.0840, 0.0140, 2.4), at(-0.0620, 0.0132, 2.3),
    at(-0.0400, 0.0136, 2.3), at(-0.0180, 0.0130, 2.4), at(-0.0060, 0.0116, 2.8),
  ], true, true);
  // Four finger rings, the M1918 pattern.
  for (let i = 0; i < 4; i++) {
    const x = -0.0840 + i * 0.0210;
    sweepPath(g, [ax(x - 0.0018, roundRect(0.0116, 0.0116, 0.0100, 2.3, 16)),
                  ax(x + 0.0018, roundRect(0.0116, 0.0116, 0.0100, 2.3, 16))], false, false);
  }
}

/* Claw hammer: a forged head on a hickory haft.

   Laid out the way the game holds everything else — the haft runs along X
   with the butt in the hand and the eye at the far end, and the head
   crosses Y, face down, claw up. That is the orientation you nail a board
   in, which is the only thing this tool is for. */
const HAMR = { eye: 0.2050 };

function buildHammerSteel(g) {
  const X = HAMR.eye;
  /* Head: a forging that runs down from the eye to the face, swelling at
     the eye where the haft goes through. Built along Y with struts, because
     that is the axis it lies on. */
  strut(g, [X, 0.0140, 0], [X, -0.0380, 0], roundRect(0.0125, 0.0125, 0.0125, 2.9, 18));
  strut(g, [X, 0.0180, 0], [X, -0.0060, 0], roundRect(0.0165, 0.0165, 0.0160, 3.0, 18));   // eye swell
  // Striking face: domed and chamfered, not a flat disc.
  spin(g, [[-0.0490, 0], [-0.0490, 0.0122], [-0.0455, 0.0132], [-0.0380, 0.0132]],
    20, 34, 0, 0);
  {
    // The face is a Y-axis surface, so it is built as its own small revolve
    // laid on its side: a short cone capped by a dome.
    const base = g.positions.length / 3, seg = 20;
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * TAU, c = Math.cos(th), si = Math.sin(th);
      g.vert(X + c * 0.0132, -0.0380, si * 0.0132, c * 0.35, -0.94, si * 0.35, s / seg, 0);
      g.vert(X + c * 0.0100, -0.0480, si * 0.0100, c * 0.35, -0.94, si * 0.35, s / seg, 1);
    }
    for (let s = 0; s < seg; s++) {
      const i = base + s * 2;
      g.quad(i, i + 1, i + 3, i + 2);
    }
    const c0 = g.vert(X, -0.0495, 0, 0, -1, 0, 0.5, 0.5);
    const rim = [];
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * TAU;
      rim.push(g.vert(X + Math.cos(th) * 0.0100, -0.0480, Math.sin(th) * 0.0100, 0, -1, 0,
        (Math.cos(th) + 1) / 2, (Math.sin(th) + 1) / 2));
    }
    for (let s = 0; s < seg; s++) g.tri(c0, rim[s + 1], rim[s]);
  }
  /* Claw: two tines curving up and back from the eye, tapering to a split
     that a nail head fits into. */
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7, a = t * 1.30;
      pts.push([X - 0.0100 - Math.sin(a) * 0.0620, 0.0100 + (1 - Math.cos(a)) * 0.0300 + t * 0.0060]);
    }
    const sts = pts.map(([px, py], i) => {
      const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
      const t = i / (pts.length - 1);
      return {
        o: new Vec3(px, py, s * lerp(0.0000, 0.0075, t)), u: new Vec3(-dy / L, dx / L, 0), v: AV,
        pts: roundRect(lerp(0.0115, 0.0032, t), lerp(0.0115, 0.0032, t), lerp(0.0060, 0.0022, t), 2.6, 14),
      };
    });
    sweepPath(g, sts, true, true);
  }
}

function buildHammerHaft(g) {
  const X = HAMR.eye;
  // Hickory, oval in section, swelling to the butt so it cannot slip.
  const at = (x, hf, hw) => ax(x, roundRect(hf, hf, hw, 2.5, 18));
  sweepPath(g, [
    at(X + 0.0180, 0.0092, 0.0125), at(X - 0.0100, 0.0084, 0.0112), at(X - 0.0900, 0.0080, 0.0105),
    at(X - 0.1900, 0.0086, 0.0112), at(X - 0.2500, 0.0098, 0.0128), at(X - 0.2620, 0.0088, 0.0112),
  ], true, true);
  // Rubber overgrip: four ribs where the hand closes.
  for (let i = 0; i < 4; i++) {
    const x = X - 0.2380 + i * 0.0190;
    sweepPath(g, [at(x - 0.0025, 0.0104, 0.0132), at(x + 0.0025, 0.0104, 0.0132)], false, false);
  }
}

/* Battering ram: a length of pipe with a hardened striking head and two
   welded handles. Nothing clever, and it should not look clever. */
function buildRamSteel(g) {
  const L = 0.5200;
  spin(g, [
    [-0.0800, 0], [-0.0800, 0.0480], [-0.0740, 0.0520], [L - 0.0600, 0.0520],
    [L - 0.0400, 0.0560], [L - 0.0060, 0.0560], [L, 0.0500], [L, 0],
  ], 26, 34);
  // Ribs round the head — where it takes the impact.
  for (const x of [L - 0.030, L - 0.060]) band(g, x - 0.006, x + 0.006, 0.0560, 0.0620, 26);
  // Two handles, welded top and side, at a body's width apart.
  for (const [hx, ang] of [[0.0800, 0], [0.2600, 0.9]]) {
    const cy = Math.cos(ang), cz = Math.sin(ang);
    const a = [hx - 0.055, cy * 0.050, cz * 0.050], b = [hx - 0.055, cy * 0.105, cz * 0.105];
    const c = [hx + 0.055, cy * 0.105, cz * 0.105], d = [hx + 0.055, cy * 0.050, cz * 0.050];
    strut(g, a, b, ringOutline(0.0110, 12));
    strut(g, b, c, ringOutline(0.0110, 12));
    strut(g, c, d, ringOutline(0.0110, 12));
  }
}

/* Riot shield: a curved polycarbonate panel in a frame, with a forearm
   cuff behind it. The curve is the whole thing — a flat sheet reads as a
   road sign. The face looks down +X like every other weapon's muzzle. */
const SHLD = { H: 0.5000, W: 0.2500, R: 0.3400, T: 0.0080 };

function shieldPt(t, y, back) {
  const S = SHLD, th = t * (S.W / S.R);
  return [-(S.R - Math.cos(th) * S.R) - (back ? S.T : 0), y, Math.sin(th) * S.R];
}

function buildShieldPanel(g) {
  const S = SHLD, cols = 16, rows = 11, row = cols + 1;
  for (const back of [false, true]) {
    const base = g.positions.length / 3;
    for (let j = 0; j <= rows; j++) {
      const y = -S.H + (2 * S.H) * (j / rows);
      for (let i = 0; i <= cols; i++) {
        const t = -1 + 2 * (i / cols), th = t * (S.W / S.R);
        const p = shieldPt(t, y, back);
        const sgn = back ? -1 : 1;
        g.vert(p[0], p[1], p[2], Math.cos(th) * sgn, 0, Math.sin(th) * sgn, i / cols, j / rows);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a2 = base + j * row + i;
        if (back) g.quad(a2, a2 + row, a2 + row + 1, a2 + 1);
        else g.quad(a2, a2 + 1, a2 + row + 1, a2 + row);
      }
    }
  }
  // Edges, so the panel is a slab and not two sheets.
  for (const j of [0, rows]) {
    const y = -S.H + (2 * S.H) * (j / rows), ny = j === 0 ? -1 : 1;
    const base = g.positions.length / 3;
    for (let i = 0; i <= cols; i++) {
      const t = -1 + 2 * (i / cols);
      const f = shieldPt(t, y, false), b = shieldPt(t, y, true);
      g.vert(f[0], f[1], f[2], 0, ny, 0, i / cols, 0);
      g.vert(b[0], b[1], b[2], 0, ny, 0, i / cols, 1);
    }
    for (let i = 0; i < cols; i++) {
      const k = base + i * 2;
      if (ny > 0) g.quad(k, k + 1, k + 3, k + 2);
      else g.quad(k, k + 2, k + 3, k + 1);
    }
  }
}

function buildShieldFrame(g) {
  const S = SHLD;
  // Rim, top and bottom, following the curve; side rails straight.
  for (const y of [-S.H, S.H]) {
    let prev = null;
    for (let i = 0; i <= 10; i++) {
      const t = -1 + 2 * (i / 10);
      const p = shieldPt(t, y, false);
      p[0] -= S.T / 2;
      if (prev) strut(g, prev, p, roundRect(0.0075, 0.0075, 0.0105, 2.6, 12));
      prev = p;
    }
  }
  for (const s of [-1, 1]) {
    const a = shieldPt(s, -S.H, false), b = shieldPt(s, S.H, false);
    a[0] -= S.T / 2; b[0] -= S.T / 2;
    strut(g, a, b, roundRect(0.0075, 0.0075, 0.0105, 2.6, 12));
  }
  /* Behind: a forearm cuff up high and a grip bar low, on standoffs. The
     hand goes through one and holds the other, which is why the shield sits
     where it does relative to the body. */
  const back = -(S.R - Math.cos(0) * S.R) - S.T;
  strut(g, [back, 0.1000, -0.0420], [back - 0.0350, 0.1000, -0.0420], ringOutline(0.0075, 12));
  strut(g, [back, 0.1000, 0.0420], [back - 0.0350, 0.1000, 0.0420], ringOutline(0.0075, 12));
  strut(g, [back - 0.0350, 0.1000, -0.0420], [back - 0.0350, 0.1000, 0.0420], ringOutline(0.0125, 14));
  strut(g, [back, -0.0700, -0.0300], [back - 0.0750, -0.0700, -0.0300], ringOutline(0.0080, 12));
  strut(g, [back, -0.0700, 0.0300], [back - 0.0750, -0.0700, 0.0300], ringOutline(0.0080, 12));
  strut(g, [back - 0.0750, -0.0700, -0.0300], [back - 0.0750, -0.0700, 0.0300], ringOutline(0.0110, 14));
  // A viewport band across the top third, in the frame's own steel.
  for (const y of [0.2000, 0.2600]) {
    let prev = null;
    for (let i = 0; i <= 10; i++) {
      const t = -1 + 2 * (i / 10);
      const p = shieldPt(t, y, false);
      p[0] += 0.0015;
      if (prev) strut(g, prev, p, roundRect(0.0022, 0.0022, 0.0035, 2.6, 10));
      prev = p;
    }
  }
}

/* The Arc Breaker's grip and forward hold: rubber over a steel core, the
   only soft thing on the gun. */
function buildArcGrip(g) {
  const K = ARC;
  gripStack(g, -0.0300, -0.0260, 0.1120, 0.28, [
    [0.00, 0.0180, 0.0215, 0.0175, 2.6],
    [0.24, 0.0165, 0.0195, 0.0165, 2.5],
    [0.58, 0.0160, 0.0195, 0.0166, 2.5],
    [0.86, 0.0166, 0.0210, 0.0172, 2.5],
    [1.00, 0.0150, 0.0186, 0.0155, 2.8],
  ]);
  for (const s of [-1, 1]) checker(g, -0.055, -0.070, s * 0.0168, 0.28, -0.96, s, 4, 8, 0.0060, 0.0010);
  /* Forward grip under the accelerator, where the off hand goes. Angled
     back, because a vertical one on a gun this long puts the elbow out. */
  gripStack(g, 0.1560, -0.0180, 0.0900, 0.34, [
    [0.00, 0.0175, 0.0210, 0.0180, 2.6],
    [0.30, 0.0160, 0.0190, 0.0168, 2.5],
    [0.70, 0.0158, 0.0190, 0.0168, 2.5],
    [1.00, 0.0170, 0.0210, 0.0178, 2.8],
  ]);
  void K;
}

/* ============================================================
   ENGINE HOOKS

   One material table for the whole rack, so a part named "steel"
   is the same steel on every gun and the set looks like it came
   out of one armoury.
   ============================================================ */

const ARM_MAT = {
  // Wartime parkerised blue: nearly black until light rakes it.
  blued: { color: 0x33383e, texture: 'metal', roughness: 0.36, metalness: 1 },
  // Machined bright — the Paralyzer and the Model 5 are instruments.
  bright: { color: 0x9ba2aa, texture: 'metal', roughness: 0.32, metalness: 1 },
  // A greyer, rougher steel for things that get hit.
  grey: { color: 0x6b7076, texture: 'metal', roughness: 0.48, metalness: 1 },
  poly: { color: 0x121417, texture: 'smooth', roughness: 0.72, metalness: 0 },
  rubber: { color: 0x141618, texture: 'smooth', roughness: 0.86, metalness: 0 },
  walnut: { color: 0x5c4028, texture: 'wood', roughness: 0.64, metalness: 0, uvScale: 18 },
  copper: { color: 0xb46a33, texture: 'metal', roughness: 0.34, metalness: 1 },
  brass: { color: 0xc9a227, texture: 'metal', roughness: 0.30, metalness: 1 },
  glow: { color: 0x9fe8ff, texture: 'smooth', roughness: 0.30, metalness: 0, emissive: 0x54c8ff, emissiveStrength: 1.5 },
  glass: { color: 0xb6c6cc, texture: 'smooth', roughness: 0.12, metalness: 0, opacity: 0.42 },
};

/* Mount a built set of geometries as one actor with named children.

   `main` is the part that carries the physics hull and the actor's own
   material; everything else hangs off it, so moving the parent moves the
   gun and moving a child animates it. `opts.tint` overrides every
   material at once, which is how a chalk outline on a wall and an
   upgraded gun's lava camo are the same code path. */
function mountArm(E, key, parts, mats, opts, boundR, mass, main) {
  const geo = parts[main];
  const b = geo.bounds;
  const pts = [];
  for (const x of [b.min.x, b.max.x]) {
    for (const y of [b.min.y, b.max.y]) {
      for (const z of [b.min.z, b.max.z]) pts.push(new Vec3(x, y, z));
    }
  }
  const shape = opts.physics === false ? null : Shape.convex(pts);
  const matFor = (name) => opts.tint || opts[name + 'Material'] || mats[name];
  const body = E._spawn(
    Object.assign({}, opts, {
      material: opts.material || matFor(main),
      mass: opts.mass != null ? opts.mass : mass,
    }),
    E._mesh(key + ':' + main, () => geo), shape, boundR);
  body.name = opts.name || key;
  body.partNames = [main];
  for (const name of Object.keys(parts)) {
    if (name === main) continue;
    const a = E._spawn({ material: matFor(name), physics: false },
      E._mesh(key + ':' + name, () => parts[name]), null, boundR);
    a.parent = body;
    body[name] = a;
    body.partNames.push(name);
  }
  return body;
}

/* Build once, keep forever: every one of these is a few thousand triangles
   of swept profile and none of it changes at runtime. */
function armCache(E, key, build) {
  const c = E._armParts || (E._armParts = {});
  if (!c[key]) c[key] = build();
  return c[key];
}

function fin(geos, origin) {
  const out = {};
  for (const k of Object.keys(geos)) out[k] = offsetGeometry(geos[k], origin).finalize();
  return out;
}

/* ---------------- MP5 ---------------- */

const MP5_ORIGIN = new Vec3(-0.0080, -0.0300, 0);

Engine.prototype.mp5 = function (opts = {}) {
  const parts = armCache(this, 'mp5', () => {
    const steel = new Geometry(); buildMP5Steel(steel);
    const poly = new Geometry(); buildMP5Poly(poly);
    const mag = new Geometry(); buildMP5Mag(mag);
    const bolt = new Geometry(); buildMP5Bolt(bolt);
    const stock = new Geometry(); buildMP5Stock(stock);
    return fin({ steel, poly, mag, bolt, stock }, MP5_ORIGIN);
  });
  const body = mountArm(this, 'mp5', parts,
    { steel: ARM_MAT.blued, poly: ARM_MAT.poly, mag: ARM_MAT.blued, bolt: ARM_MAT.blued, stock: ARM_MAT.blued },
    opts, 0.36, 2.5, 'steel');
  body.ejectPort = [0.0800, 0.0210, 0.0175];
  body.magWell = [0.0900, -0.0600, 0];
  body.boltRest = [0, 0, 0];
  body.boltThrow = [-0.030, 0, 0];
  body.boreAt = -MP5_ORIGIN.y;
  body.muzzleAt = MP5.muzzle - MP5_ORIGIN.x;
  body.sightAt = MP5.sightY - MP5_ORIGIN.y;
  return body;
};

/* ---------------- the break-action three ---------------- */

const DOUBLE_KINDS = {
  scatter: {
    barrelLen: 0.4800, spacing: 0.0245, bands: [0.190, 0.360],
    forend: [0.0560, 0.2300], stock: 'full', twinTriggers: true,
    origin: new Vec3(-0.0980, -0.0420, 0), mass: 3.4, bound: 0.42,
    mats: { steel: ARM_MAT.blued, wood: ARM_MAT.walnut, swing: ARM_MAT.blued, forend: ARM_MAT.walnut },
  },
  sawnoff: {
    barrelLen: 0.2300, spacing: 0.0245, bands: [],
    forend: [0.0500, 0.1500], stock: 'stub', twinTriggers: true,
    origin: new Vec3(-0.0680, -0.0340, 0), mass: 2.4, bound: 0.24,
    mats: { steel: ARM_MAT.blued, wood: ARM_MAT.walnut, swing: ARM_MAT.blued, forend: ARM_MAT.walnut },
  },
  paralyzer: {
    barrelLen: 0.4200, spacing: 0.0300, bands: [0.060, 0.320], overUnder: true,
    forend: [0.0500, 0.0900], stock: 'full', twinTriggers: false, science: true,
    origin: new Vec3(-0.0980, -0.0620, 0), mass: 4.1, bound: 0.42,
    mats: {
      steel: ARM_MAT.bright, wood: ARM_MAT.grey, swing: ARM_MAT.bright, forend: ARM_MAT.grey,
      copper: ARM_MAT.copper, glow: ARM_MAT.glow,
    },
  },
};

function makeDoubleGun(kind) {
  const C = DOUBLE_KINDS[kind];
  const geos = {};
  geos.steel = new Geometry(); buildDoubleAction(geos.steel, C);
  geos.wood = new Geometry(); buildDoubleStock(geos.wood, C);
  geos.swing = new Geometry(); buildDoubleBarrels(geos.swing, C);
  geos.forend = new Geometry(); buildDoubleForend(geos.forend, C);
  if (C.science) {
    geos.copper = new Geometry(); buildParalyzerCoil(geos.copper, C);
    geos.glow = new Geometry(); buildParalyzerGlow(geos.glow, C);
  }
  return fin(geos, C.origin);
}

function doubleGun(E, kind, opts) {
  const C = DOUBLE_KINDS[kind];
  const parts = armCache(E, kind, () => makeDoubleGun(kind));
  const body = mountArm(E, kind, parts, C.mats, opts, C.bound, C.mass, 'steel');
  const o = C.origin;
  body.hinge = [DOUBLE.hinge[0] - o.x, DOUBLE.hinge[1] - o.y, 0];
  // Every part forward of the pin, so the caller can swing them together.
  body.swingParts = ['swing', 'forend'].concat(C.science ? ['copper', 'glow'] : []);
  body.ejectPort = [DOUBLE.breech - o.x, -o.y + 0.004, 0.0140];
  body.boreAt = -o.y;
  body.muzzleAt = C.barrelLen - o.x + (C.science ? 0.030 : 0);
  body.sightAt = (C.overUnder ? DOUBLE.breechR + 0.0094 : 0.0124) - o.y;
  return body;
}

Engine.prototype.scattergun = function (opts = {}) { return doubleGun(this, 'scatter', opts); };
Engine.prototype.sawnOff = function (opts = {}) { return doubleGun(this, 'sawnoff', opts); };
Engine.prototype.paralyzer = function (opts = {}) { return doubleGun(this, 'paralyzer', opts); };

/* ---------------- Mauser C96 ---------------- */

const C96_ORIGIN = new Vec3(-0.0620, -0.0460, 0);

Engine.prototype.mauserC96 = function (opts = {}) {
  const parts = armCache(this, 'c96', () => {
    const steel = new Geometry(); buildMauserSteel(steel);
    const wood = new Geometry(); buildMauserGrip(wood);
    const bolt = new Geometry(); buildMauserBolt(bolt);
    const clip = new Geometry(); buildStripperClip(clip, 10, 0.00385, 0.0086);
    return fin({ steel, wood, bolt, clip }, C96_ORIGIN);
  });
  const body = mountArm(this, 'c96', parts,
    { steel: ARM_MAT.blued, wood: ARM_MAT.walnut, bolt: ARM_MAT.blued, clip: ARM_MAT.brass },
    opts, 0.16, 1.2, 'steel');
  body.ejectPort = [0.0100 - C96_ORIGIN.x, 0.0180 - C96_ORIGIN.y, 0];
  body.boltRest = [0, 0, 0];
  body.boltThrow = [-0.038, 0, 0];
  // Where the clip is presented: above the open action, nose forward.
  body.clipRest = [-0.0100 - C96_ORIGIN.x, 0.0400 - C96_ORIGIN.y, 0];
  // It only exists during a reload; the rest of the time a clip standing in
  // the air above the action is just a bug with brass on it.
  if (body.clip) body.clip.visible = false;
  body.boreAt = -C96_ORIGIN.y;
  body.muzzleAt = C96.muzzle - C96_ORIGIN.x;
  body.sightAt = 0.0238 - C96_ORIGIN.y;
  return body;
};

/* ---------------- Obliterated Model 5 ---------------- */

const MOD5_ORIGIN = new Vec3(-0.0460, -0.0450, 0);

Engine.prototype.model5 = function (opts = {}) {
  const parts = armCache(this, 'mod5', () => {
    const steel = new Geometry(); buildModel5Steel(steel);
    const grip = new Geometry(); buildModel5Grip(grip);
    const cylinder = new Geometry(); buildModel5Cylinder(cylinder);
    return fin({ steel, grip, cylinder }, MOD5_ORIGIN);
  });
  const body = mountArm(this, 'mod5', parts,
    { steel: ARM_MAT.bright, grip: ARM_MAT.rubber, cylinder: ARM_MAT.bright },
    opts, 0.20, 2.1, 'steel');
  // The crane pin: forward of the cylinder, low and left. The cylinder
  // swings out about a vertical axis through it, which is the only motion
  // a swing-out revolver has and the reason it looks right when it opens.
  body.crane = [MOD5.cylX1 + 0.014 - MOD5_ORIGIN.x, -0.0150 - MOD5_ORIGIN.y, -0.0150];
  body.ejectPort = [MOD5.cylX0 - MOD5_ORIGIN.x, -MOD5_ORIGIN.y + 0.014, 0.0250];
  body.boreAt = -MOD5_ORIGIN.y;
  body.muzzleAt = MOD5.muzzle - MOD5_ORIGIN.x;
  body.sightAt = MOD5.cylR + 0.0186 - MOD5_ORIGIN.y;
  return body;
};

/* ---------------- Arc Breaker ---------------- */

const ARC_ORIGIN = new Vec3(-0.0300, -0.0420, 0);

Engine.prototype.arcBreaker = function (opts = {}) {
  const parts = armCache(this, 'arc', () => {
    const steel = new Geometry(); buildArcSteel(steel);
    const grip = new Geometry(); buildArcGrip(grip);
    const copper = new Geometry(); buildArcCopper(copper);
    const glow = new Geometry(); buildArcGlow(glow);
    const cell = new Geometry(); buildArcCell(cell);
    const cellGlow = new Geometry(); buildArcCellGlow(cellGlow);
    return fin({ steel, grip, copper, glow, cell, cellGlow }, ARC_ORIGIN);
  });
  const body = mountArm(this, 'arc', parts, {
    steel: ARM_MAT.grey, grip: ARM_MAT.rubber, copper: ARM_MAT.copper,
    glow: ARM_MAT.glow, cell: ARM_MAT.blued, cellGlow: ARM_MAT.glow,
  }, opts, 0.44, 6.2, 'steel');
  body.cellRest = [0, 0, 0];
  body.cellDrop = [0.010, -0.150, 0];
  body.ejectPort = [0.0600 - ARC_ORIGIN.x, 0.0100 - ARC_ORIGIN.y, 0.0270];
  body.boreAt = ARC.tubeY - ARC_ORIGIN.y;
  body.muzzleAt = ARC.tip - ARC_ORIGIN.x;
  body.sightAt = 0.0349 - ARC_ORIGIN.y;
  return body;
};

/* ---------------- the things you swing ---------------- */

const KNIFE_ORIGIN = new Vec3(-0.0500, 0, 0);

Engine.prototype.trenchKnife = function (opts = {}) {
  const parts = armCache(this, 'knife', () => {
    const steel = new Geometry(); buildKnifeSteel(steel);
    const grip = new Geometry(); buildKnifeGrip(grip);
    return fin({ steel, grip }, KNIFE_ORIGIN);
  });
  const body = mountArm(this, 'knife', parts,
    { steel: ARM_MAT.bright, grip: ARM_MAT.rubber }, opts, 0.16, 0.5, 'steel');
  body.muzzleAt = 0.1900 - KNIFE_ORIGIN.x;
  return body;
};

const HAMMER_ORIGIN = new Vec3(-0.0200, 0, 0);

Engine.prototype.clawHammer = function (opts = {}) {
  const parts = armCache(this, 'hammer', () => {
    const steel = new Geometry(); buildHammerSteel(steel);
    const haft = new Geometry(); buildHammerHaft(haft);
    return fin({ steel, haft }, HAMMER_ORIGIN);
  });
  const body = mountArm(this, 'hammer', parts,
    { steel: ARM_MAT.grey, haft: ARM_MAT.walnut }, opts, 0.20, 0.7, 'steel');
  body.muzzleAt = HAMR.eye - HAMMER_ORIGIN.x;
  return body;
};

const RAM_ORIGIN = new Vec3(-0.0200, 0, 0);

Engine.prototype.batteringRam = function (opts = {}) {
  const parts = armCache(this, 'ram', () => {
    const steel = new Geometry(); buildRamSteel(steel);
    return fin({ steel }, RAM_ORIGIN);
  });
  const body = mountArm(this, 'ram', parts, { steel: ARM_MAT.grey }, opts, 0.32, 16, 'steel');
  body.muzzleAt = 0.4200 - RAM_ORIGIN.x;
  return body;
};

const SHIELD_ORIGIN = new Vec3(-0.0830, -0.0700, 0);

Engine.prototype.riotShield = function (opts = {}) {
  const parts = armCache(this, 'shield', () => {
    const panel = new Geometry(); buildShieldPanel(panel);
    const frame = new Geometry(); buildShieldFrame(frame);
    return fin({ frame, panel }, SHIELD_ORIGIN);
  });
  const body = mountArm(this, 'shield', parts,
    { frame: ARM_MAT.grey, panel: ARM_MAT.glass }, opts, 0.56, 5.5, 'frame');
  body.muzzleAt = 0.2000;
  return body;
};
