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
  hardBox(g, 0.3280, K.sightY - 0.0099, 0, 0.0022, 0.0060, 0.0020);        // post
  // The tip finishes ON the line, not 1.4 mm over it. A post whose tip is
  // proud of the line is a gun that shoots low by however proud it is.
  hardBox(g, 0.3280, K.sightY - 0.0028, 0, 0.0015, 0.0028, 0.0012);        // blade tip

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

/* Where the bead sits, in the barrels' own space. One definition, used by
   the model that draws it and by the mount that reports the sight line —
   they were two numbers three and a half millimetres apart, which is why
   aiming a double put the target just above the bead. */
function doubleBeadY(C) {
  return C.overUnder ? DOUBLE.breechR + 0.0060 : 0.0128;
}

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
    /* The rib on a side-by-side runs level with the tops of the barrels,
       not down in the valley between them. It sat 5 mm low, which put the
       bead below the barrel crowns: aiming the gun meant looking at the
       backs of the two tubes with the bead hidden between them. It tapers
       down towards the muzzle, as a real one does, so the sight line over
       it stays clear along its whole length. */
    const s = C.spacing != null ? C.spacing : 0.0245;
    sweepPath(g, [
      ax(D.breech + 0.020, roundRect(0.0022, 0.0150, s / 2, 3.4, 16), 0.0086),
      ax(L - 0.006, roundRect(0.0022, 0.0140, s / 2 - 0.0008, 3.4, 16), 0.0072),
    ], true, true);
  }
  /* Bead: a small silver ball, proud of the rib, at the muzzle. Its centre
     is the sight line — see doubleGun(), which reads BEAD_Y rather than
     carrying its own second opinion about where the bead is. */
  const beadY = doubleBeadY(C);
  spin(g, [[L - 0.012, 0], [L - 0.008, 0.0034], [L - 0.004, 0.0034], [L - 0.001, 0]],
    14, 40, beadY, 0);

  /* A rear notch, at the breech end of the rib and on the same line.

     A bead on its own is honest for a bird gun and useless in a game: with
     nothing behind it there is no way to know whether the barrel is level,
     and the aim reads as looking over the top of the gun. Two shoulders and
     a gap between them, low enough to see the bead through. */
  const nx = D.breech + 0.052;
  for (const sz of [-1, 1]) {
    hardBox(g, nx, beadY + 0.0026, sz * 0.0056, 0.0026, 0.0040, 0.0018);
  }
  hardBox(g, nx, beadY - 0.0012, 0, 0.0026, 0.0016, 0.0056);

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
  /* The top of the action, and it goes UNDER the sight line rather than
     wherever the barrels' radius happens to put it. It was two and a
     quarter millimetres over the bead on the side-by-sides — a low wall
     thirty centimetres from the eye, which is closer than anything else on
     the gun and so the widest thing in the sight picture. Both the vertex
     scan and the rendered column missed it, because the swept profile's
     apex falls between sample points and the bead sits at almost the same
     angle; only casting the ray at the triangles found it. */
  const top = doubleBeadY(C) - 0.0012;
  const bot = C.overUnder ? -(C.spacing || 0.0245) - D.breechR - 0.006 : -D.breechR - 0.016;
  const halfW = C.overUnder ? 0.0195 : (C.spacing || 0.0245) / 2 + D.breechR + 0.0020;
  const cy = (top + bot) / 2, hh = (top - bot) / 2;
  const act = (x, s = 1) => ax(x, roundRect(hh * s, hh * s, halfW * s, 3.0, 24), cy);
  sweepPath(g, [
    act(-0.0640, 0.86), act(-0.0560, 0.94), act(-0.0300), act(0.0080), act(D.breech - 0.001, 0.99),
  ], true, true);

  /* Top lever: the thumb piece that opens it, canted right the way a
     worn one always ends up.

     It lies IN the top strap, not on it. Built off the action's own top it
     stood eleven millimetres above the bead, a hand's breadth in front of
     the eye — aiming either shotgun meant looking at the opening lever. On
     a real break-action the barrels sit on top of the action and the lever
     is recessed below their line, so the rib runs clear over it. Built off
     the bead now, so it cannot drift above the sight line again whatever
     the action's proportions do. */
  const lev = doubleBeadY(C) - 0.0008;
  hardBox(g, -0.0330, lev - 0.0019, 0, 0.0170, 0.0019, 0.0090);
  sweepPath(g, [
    ax(-0.0230, roundRect(0.0021, 0.0032, 0.0056, 2.6, 12), lev - 0.0021),
    ax(-0.0170, roundRect(0.0020, 0.0030, 0.0040, 2.6, 12), lev - 0.0021, 0.0050),
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
  // Safety on the tang, and the hinge pin's bosses. The safety is on the
  // same strap as the lever, so it takes its height from the same line.
  hardBox(g, -0.0560, lev - 0.0018, 0, 0.0075, 0.0018, 0.0048);
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
     the arc jumps across.

     Their tops used to finish at 17.75 mm with the bead at 17.05 — seven
     tenths of a millimetre proud of the sight line, three times over, down
     the whole length of the barrel. Seven tenths of a millimetre at thirty
     centimetres from the eye is a wall. Everything forward of the bead now
     stops two millimetres under the line, which is the rule the rest of
     this file already follows and this one did not. */
  const clear = doubleBeadY(C) - 0.0020;
  const bot = -s - D.muzzleR - 0.0075;
  for (const x of [0.090, 0.170, 0.250]) {
    hardBox(g, x, (clear + bot) / 2, 0, 0.0060, (clear - bot) / 2, 0.0290);
  }
  /* Electrode prongs: four, in a square around the pair, standing forward
     of the crowns so the gap is visible. Moved outboard rather than down —
     they are the whole look of the muzzle, and at 17 mm they sat just
     inside the sight picture and cluttered it. */
  for (const py of [clear, bot + 0.010]) {
    for (const pz of [-0.025, 0.025]) {
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
  /* The two leads, running back into the action along the right flank —
     not over the rib, where they crossed the bead line at exactly the
     bead's own height and put a copper bar across the sight picture. */
  const lz = 0.0104;
  strut(g, [0.100, cy + rMaj, lz], [-0.010, D.breechR + 0.004, lz], ringOutline(wire, 8));
  strut(g, [0.242, cy + rMaj, lz + 0.0058], [0.100, cy + rMaj, lz + 0.0058], ringOutline(wire, 8));
}

/* The parts that light: the charge tube along the top and the arc gap at
   the muzzle. Their material is emissive, so they are their own geometry. */
function buildParalyzerGlow(g, C) {
  const D = DOUBLE, L = C.barrelLen, s = C.spacing || 0.0245;
  /* Charge tubes, in the waist either side of the stacked barrels.
     
     There used to be one, lying along the top, and it stood eleven and a
     half millimetres above the bead for the whole length of the gun: the
     sight line ran straight through the middle of it. Two tubes in the
     figure-eight's waist light the same amount of gun and leave the rib
     clear, which is where a charge tube would sit on something built to be
     aimed. */
  for (const cz of [-1, 1]) {
    spin(g, [
      [0.055, 0], [0.058, 0.0072], [0.250, 0.0072], [0.253, 0],
    ], 16, 34, -s / 2, cz * (D.muzzleR + 0.0072));
  }
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
  /* The two sights, and they have to agree.

     The blade's tip was at 15.6 mm and the rear notch at 23.8 mm — eight
     millimetres of disagreement over a 28 cm sight radius, which is a gun
     that shoots low even when it is aimed perfectly. Two sights that are
     each correct on their own and not on the same line cannot be aimed
     with, and that is worth more than either of them being pretty.

     C96_SIGHT is the line. Both ends are built from it. */
  const C96_SIGHT = 0.0238;
  hardBox(g, K.muzzle - 0.014, 0.0140, 0, 0.0060, 0.0074, 0.0030);          // blade ramp
  hardBox(g, K.muzzle - 0.014, C96_SIGHT - 0.0026, 0, 0.0014, 0.0030, 0.0011); // blade
  hardBox(g, K.muzzle - 0.014, C96_SIGHT - 0.0060, 0, 0.0050, 0.0044, 0.0026); // its base

  /* Tangent rear sight — the C96's absurd 1000-metre ladder, laid flat.
     Even folded it is the landmark that identifies the gun from behind.

     The piece labelled "the notch's wings" was one solid box 14.4 mm wide
     spanning 20.2 to 25.4 mm, and the sight line runs through the middle of
     that at 23.8. A notch with no gap in it is a plate across your aim, and
     it is the same mistake as the Thompson's peep. */
  hardBox(g, -0.0180, 0.0192, 0, 0.0240, 0.0026, 0.0058);          // the ladder, laid flat
  hardBox(g, -0.0400, 0.0196, 0, 0.0060, 0.0030, 0.0072);          // the base, under the line
  const nz = 0.0031;                                               // half the open notch
  for (const sd of [-1, 1]) {                                      // the shoulders either side
    hardBox(g, -0.0400, C96_SIGHT + 0.0004, sd * (nz + 0.0021), 0.0018, 0.0030, 0.0021);
  }
  for (const s of [-1, 1]) hardBox(g, -0.0400, C96_SIGHT + 0.0016, s * 0.0068, 0.0018, 0.0018, 0.0016);

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

  /* Hammer, at the very back, ring-cut the way the small-ring guns are.

     The ring was drawn at x = 0 — spin() takes absolute stations, and
     these were written as though they were offsets — so the hammer was a
     disc floating in the middle of the frame, 77 mm forward of the spur it
     belongs to and seven and a half millimetres above the sight line. It
     was the wall you saw when you aimed this pistol. It is at the back of
     the frame now, and its crown sits under the line, which is where a
     C96's hammer is: the tangent sight rides above it on the barrel
     extension. */
  const hx = K.recRear + 0.0130;
  spin(g, [[hx - 0.0016, 0], [hx - 0.0016, 0.0074], [hx + 0.0016, 0.0074], [hx + 0.0016, 0]],
    16, 40, 0.0150, 0);
  hardBox(g, hx, 0.0132, 0, 0.0058, 0.0072, 0.0030);
  strut(g, [hx + 0.0020, 0.0158, -0.0016], [hx + 0.0020, 0.0158, 0.0016], ringOutline(0.0040, 12));
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

const MOD5 = {
  muzzle: 0.2050,
  cylX0: -0.0060, cylX1: 0.0500, cylR: 0.0270,
  /* The chamber pitch radius, and therefore how far the bore sits ABOVE
     the cylinder's axis.

     The barrel used to run down the cylinder's own centreline, which meant
     no chamber ever lined up with it: the four holes sat on a circle 14.8
     mm out and the bore went through the middle of them. That is what made
     the gun read as a barrel stuck on the front of a cylinder rather than
     a revolver. On a real one the barrel is offset by exactly this, so the
     chamber at twelve o'clock is the bore's continuation, and the top
     strap has to arch over the cylinder to get above it. Everything about
     a revolver's proportions falls out of this one number. */
  pcd: 0.0148,
  barR: 0.0140,
  bore: 0.0127,                 // .50 -- half an inch, as the name says
  chR: 0.0098,
  gap: 0.0020,                  // the cylinder gap, and you can see through it
};
MOD5.boreY = MOD5.pcd;
MOD5.barRear = MOD5.cylX1 + MOD5.gap;

/* The sight line: over the top strap, which has to arch over a 54 mm
   cylinder, so it sits high and the front sight is a tall ramp off the
   vent rib. One constant; the rear leaf, the front blade and the mount all
   read it rather than each having an opinion. */
const MOD5_SIGHT = 0.0396;

/* Where the hammer turns. The spur is 30 mm up and 21 mm back from here,
   which is what puts it under the shooter's thumb. */
const MOD5_HAMMER = [MOD5.cylX0 - 0.0420, 0.0060];

function buildModel5Steel(g) {
  const K = MOD5;
  const STRAP = 0.0352;               // top of the frame's top strap

  /* Top strap: it arches over the cylinder to reach the bore, which is why
     a revolver's rear sight sits so much higher than its barrel. */
  sweepPath(g, [
    ax(K.cylX0 - 0.008, roundRect(0.0040, 0.0044, 0.0108, 3.2, 20), STRAP - 0.0040),
    ax(K.cylX1 + 0.014, roundRect(0.0040, 0.0046, 0.0112, 3.2, 20), STRAP - 0.0040),
  ], true, true);

  /* Recoil shield and grip frame: the standing breech the cases head
     against, and the wall the hammer falls through. */
  /* Raising the strap raised this too, and the frame's underside came up
     five millimetres off the top of the grip: the gun floated over its own
     handle. The bottom is pinned to -30 mm, where the grip's top is, and
     only the top follows the strap. */
  sweepPath(g, [
    ax(K.cylX0 - 0.048, roundRect(0.0300, 0.0352, 0.0160, 3.0, 24), 0.0052),
    ax(K.cylX0 - 0.026, roundRect(0.0300, 0.0352, 0.0175, 3.0, 24), 0.0052),
    ax(K.cylX0 - 0.004, roundRect(0.0300, 0.0352, 0.0175, 3.0, 24), 0.0052),
  ], true, true);
  // The floor under the cylinder window, joining the two halves of the frame.
  hardBox(g, (K.cylX0 + K.cylX1) / 2, -K.cylR - 0.0060, 0,
    (K.cylX1 - K.cylX0) / 2 + 0.010, 0.0050, 0.0105);

  /* The frame's nose: the boss the barrel screws into, bringing the top
     strap down onto the bore. It starts 6 mm forward of the cylinder face,
     so the cylinder gap and the forcing cone in front of it are both open
     to the side, the way they are on a gun you could actually fire. */
  sweepPath(g, [
    ax(K.cylX1 + 0.006, roundRect(STRAP - K.boreY, 0.0168, 0.0158, 3.0, 22), K.boreY),
    ax(K.cylX1 + 0.020, roundRect(STRAP - K.boreY - 0.0026, 0.0168, 0.0152, 3.0, 22), K.boreY),
  ], true, true);

  /* Barrel: a heavy bull tube on the bore line, its rear face stepped out
     for the forcing cone, crowned at the muzzle. */
  tubeRun(g, [
    [K.barRear, 0.0158], [K.barRear + 0.0055, 0.0158],
    [K.barRear + 0.0090, K.barR], [K.muzzle - 0.010, K.barR],
    [K.muzzle - 0.002, K.barR],
  ], 24, true, false, K.boreY);
  crown(g, K.muzzle, K.barR, K.bore / 2, 0.045, 0.0018);
  // The cone itself, standing in the gap: a short funnel off the breech
  // face, which is the detail that says a bullet jumps this gap.
  spin(g, [
    [K.barRear - 0.0004, 0], [K.barRear - 0.0004, 0.0104],
    [K.barRear + 0.0090, 0.0082], [K.barRear + 0.0090, 0],
  ], 20, 30, K.boreY, 0);

  /* Full-length underlug, the shape this gun is named for: a slab under
     the barrel running unbroken to the muzzle, deep enough to swallow the
     ejector rod when the cylinder is shut. */
  /* Slab-sided and flat-bottomed, a touch wider than the barrel, so there
     is a shoulder where the two meet. Narrower and round it blended into
     the barrel and the pair read as one fat tube -- the Python's lug is
     the line down the side of the gun, and a lug you cannot see is not
     one. */
  sweepPath(g, [
    ax(K.cylX1 + 0.008, roundRect(0.0104, 0.0130, 0.0146, 4.6, 22), -0.0010),
    ax(K.cylX1 + 0.030, roundRect(0.0104, 0.0138, 0.0148, 4.6, 22), -0.0010),
    ax(K.muzzle - 0.024, roundRect(0.0104, 0.0138, 0.0148, 4.6, 22), -0.0010),
    ax(K.muzzle - 0.002, roundRect(0.0104, 0.0126, 0.0144, 4.6, 22), -0.0010),
  ], true, true);
  // The rod's mouth at the front of the lug, where its knurled tip shows.
  spin(g, [
    [K.muzzle - 0.014, 0], [K.muzzle - 0.014, 0.0074],
    [K.muzzle - 0.002, 0.0074], [K.muzzle - 0.002, 0],
  ], 18, 30, -0.0010, 0);

  /* Vent rib: two rails down the barrel's crown with the slots open
     between them. Built as raised bars on a solid strip it read as a
     ladder lying on the barrel; a vent rib is a roof with holes in it, so
     the holes are the gaps between the cross pieces. */
  const ribY = K.boreY + K.barR, ribTop = ribY + 0.0034;
  const rib0 = K.cylX1 + 0.022, rib1 = K.muzzle - 0.002;
  for (const rz of [-1, 1]) {
    sweepPath(g, [
      ax(rib0, roundRect(0.0017, 0.0034, 0.0018, 3.0, 12), ribTop - 0.0017, rz * 0.0064),
      ax(rib1, roundRect(0.0017, 0.0034, 0.0018, 3.0, 12), ribTop - 0.0017, rz * 0.0064),
    ], true, true);
  }
  const bays = 7, bayL = (rib1 - rib0) / bays;
  for (let i = 0; i <= bays; i++) {
    hardBox(g, rib0 + i * bayL, ribTop - 0.0017, 0, 0.0026, 0.0017, 0.0064);
  }

  /* Front sight: a ramp off the rib carrying a blade whose tip finishes on
     the sight line -- not a millimetre over it, which is a gun that shoots
     low by however far over it is. */
  sweepPath(g, [
    ax(K.muzzle - 0.034, roundRect(0.0004, 0.0030, 0.0034, 2.8, 14), ribTop),
    ax(K.muzzle - 0.018, roundRect(MOD5_SIGHT - ribTop - 0.0036, 0.0030, 0.0038, 2.8, 14), ribTop),
    ax(K.muzzle - 0.012, roundRect(MOD5_SIGHT - ribTop - 0.0036, 0.0030, 0.0038, 2.8, 14), ribTop),
  ], true, true);
  hardBox(g, K.muzzle - 0.015, MOD5_SIGHT - 0.0018, 0, 0.0018, 0.0018, 0.0016);

  /* Rear sight: an adjustable leaf on the top strap, its notch open to the
     sky and its shoulders standing either side of the line. */
  const rx = K.cylX0 - 0.012;
  hardBox(g, rx, (STRAP + MOD5_SIGHT) / 2 - 0.0008, 0, 0.0090, (MOD5_SIGHT - STRAP) / 2 + 0.0008, 0.0092);
  hardBox(g, rx, MOD5_SIGHT - 0.0014, 0, 0.0080, 0.0014, 0.0034);          // notch floor
  for (const sd of [-1, 1]) {
    hardBox(g, rx, MOD5_SIGHT + 0.0022, sd * 0.0056, 0.0080, 0.0040, 0.0022);
  }
  // Windage and elevation screws, because an adjustable sight has them.
  strut(g, [rx - 0.0092, MOD5_SIGHT - 0.0030, 0], [rx - 0.0064, MOD5_SIGHT - 0.0030, 0], ringOutline(0.0022, 10));
  strut(g, [rx, MOD5_SIGHT + 0.0010, -0.0090], [rx, MOD5_SIGHT + 0.0010, -0.0064], ringOutline(0.0020, 10));

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

/* The hammer, and it is its own part because the player's thumb pulls it
   back before every shot. Built about its pivot so the game can swing it
   with the same rotate-about-a-pin arithmetic the cylinder uses. */
function buildModel5Hammer(g) {
  const K = MOD5, px = MOD5_HAMMER[0], py = MOD5_HAMMER[1];
  // The body, rising from the pivot to behind the strap.
  sweepPath(g, [
    ax(px - 0.0052, roundRect(0.0230, 0.0090, 0.0044, 2.8, 16), py),
    ax(px + 0.0052, roundRect(0.0230, 0.0090, 0.0044, 2.8, 16), py),
  ], true, true);
  /* The spur, swept back and up behind the strap where a thumb can reach
     it -- and finishing UNDER the sight line, because at rest it sits
     directly between the eye and the rear sight. Two and a half
     millimetres of clearance: a hammer you have to look over is a hammer
     you cannot aim past. */
  sweepPath(g, [
    ax(px - 0.0010, roundRect(0.0044, 0.0044, 0.0042, 2.6, 14), py + 0.0198),
    ax(px - 0.0150, roundRect(0.0046, 0.0046, 0.0050, 2.6, 14), py + 0.0236),
    ax(px - 0.0250, roundRect(0.0040, 0.0040, 0.0054, 2.6, 14), py + 0.0238),
  ], true, true);
  // Checkering on the spur's top, which is the surface the thumb is on.
  for (let i = 0; i < 5; i++) {
    hardBox(g, px - 0.0272 + i * 0.0032, py + 0.0280, 0, 0.0010, 0.0012, 0.0050);
  }
  // The nose that reaches the firing pin, and the pivot boss itself.
  hardBox(g, px + 0.0064, py + 0.0210, 0, 0.0030, 0.0044, 0.0034);
  strut(g, [px, py, -0.0048], [px, py, 0.0048], ringOutline(0.0062, 14));
  void K;
}

/* The cylinder: four chambers, fluted between them, its own actor so it
   can swing out on the crane. */
function buildModel5Cylinder(g) {
  const K = MOD5, N = 4, chR = K.chR, pcd = K.pcd;
  spin(g, [
    [K.cylX0, 0], [K.cylX0, 0.0090], [K.cylX0 - 0.0080, 0.0090], [K.cylX0 - 0.0080, 0],
  ], 18, 36);
  /* The cylinder body, with the flutes cut INTO it.

     They used to be four separate tubes of ten millimetre radius sitting
     on a circle 32.5 mm out -- outside the cylinder's own 27 mm surface.
     A flute is a groove milled into the steel between the chambers, and
     this modeller has no way to subtract one solid from another, so
     placing a tube outside and hoping it reads as a groove is what was
     done. It does not: it reads as four pipes bolted to the sides, which
     is exactly what the player saw hanging off it.

     Cut into the profile instead. The cross-section is a circle at cylR
     that dips toward the axis at the four angles halfway between the
     chambers, and sweeping THAT along the cylinder gives a fluted
     cylinder rather than a plain one with things stuck on. */
  const fluteAt = (i) => (i + 0.5) * TAU / N;
  const cylProfile = (r) => {
    const raw = [];
    const STEPS = 96;
    for (let i = 0; i < STEPS; i++) {
      const th = i * TAU / STEPS;
      let dip = 0;
      for (let k = 0; k < N; k++) {
        // How far into this flute we are, as an angle either side of it.
        let d = th - fluteAt(k);
        while (d > PI) d -= TAU;
        while (d < -PI) d += TAU;
        const halfWidth = TAU / (N * 2) * 0.62;
        if (Math.abs(d) < halfWidth) {
          // A cosine scallop, deepest in the middle of the flute.
          dip = Math.max(dip, Math.cos(d / halfWidth * PI * 0.5) * 0.0042);
        }
      }
      const rr = r - dip;
      raw.push([Math.cos(th) * rr, Math.sin(th) * rr]);
    }
    return profileOutline(raw, 80);
  };
  sweepPath(g, [
    { o: new Vec3(K.cylX0, 0, 0), u: AU, v: AV, pts: cylProfile(K.cylR - 0.0025) },
    { o: new Vec3(K.cylX0 + 0.0025, 0, 0), u: AU, v: AV, pts: cylProfile(K.cylR) },
    { o: new Vec3(K.cylX1 - 0.0025, 0, 0), u: AU, v: AV, pts: cylProfile(K.cylR) },
    { o: new Vec3(K.cylX1, 0, 0), u: AU, v: AV, pts: cylProfile(K.cylR - 0.0025) },
  ], true, true);
  for (let i = 0; i < N; i++) {
    /* Chamber zero sits at twelve o'clock, on the bore. The angles used to
       start at 45 degrees, so the four chambers straddled the top and the
       barrel looked through the steel between two of them. A revolver is
       the one gun where the barrel has to agree with the cylinder about
       where a chamber is, and this is where they agree. */
    const th = i * TAU / N;
    const cy = Math.cos(th) * pcd, cz = Math.sin(th) * pcd;
    // A bored chamber, open at the muzzle end, with a case head showing at
    // the back — four holes you can see into is the whole point of it.
    spin(g, [
      [K.cylX0 + 0.006, 0], [K.cylX0 + 0.006, chR * 0.62],
      [K.cylX0 + 0.004, chR], [K.cylX1 + 0.0004, chR],
      [K.cylX1 + 0.0004, chR + 0.0010], [K.cylX0 - 0.0002, chR + 0.0010],
      [K.cylX0 - 0.0002, 0],
    ], 16, 30, cy, cz);
    // The flutes are in the body's own profile now, not tubes beside it.
  }
  /* Ejector rod, standing forward on the cylinder's own axis — which is
     now below the bore, so it runs inside the underlug when the gun is
     shut and comes out with the cylinder when it is opened. That is the
     whole reason a full-lug revolver has a lug. */
  spin(g, [[K.cylX1, 0], [K.cylX1, 0.0042], [K.muzzle - 0.020, 0.0042],
           [K.muzzle - 0.016, 0.0058], [K.muzzle - 0.012, 0]], 14, 36);
}

/* Grips: rubber, finger-grooved, wrapping the backstrap. */
function buildModel5Grip(g) {
  const K = MOD5, topX = K.cylX0 - 0.040;
  /* A revolver grip, not a tube.

     The old sections held the front-to-back depth within half a millimetre
     of 40 mm down the whole length, which is a straight taper — from the
     side it read as a cardboard tube stuck under the frame, and it is the
     part your hand is on for the entire game. A real one sweeps its
     backstrap out from the frame, swells to its deepest under the palm at
     about forty per cent, and comes back in to a rounded butt. That is the
     shape you feel when you take hold of one, and it is the shape that
     makes the silhouette read. */
  const axis = gripStack(g, topX, -0.0300, 0.1080, 0.34, [
    [0.00, 0.0176, 0.0206, 0.0166, 2.6],
    [0.18, 0.0181, 0.0251, 0.0183, 2.4],
    [0.42, 0.0187, 0.0291, 0.0197, 2.3],
    [0.68, 0.0185, 0.0287, 0.0199, 2.3],
    [0.88, 0.0171, 0.0251, 0.0189, 2.5],
    [1.00, 0.0151, 0.0216, 0.0169, 2.8],
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

/* The Arc Breaker's sight line, over the top of everything the tube
   carries: the tube crowns at 46 mm, its insulator collars at 53.5 and the
   copper ring terminals at 57. One constant, used by the tower, the front
   post and the mount that reports it. */
const ARC_SIGHT = 0.0625;

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
  /* Sights, on a bridge over the accelerator tube.

     They used to sit on the top rail, at 34.9 mm — and the tube, its
     insulator collars and the copper ring terminals rise to 57 mm and run
     the whole length of the gun above them. Aiming this thing meant
     looking into the side of its own barrel. A weapon whose barrel sits
     this high carries its sights on a bridge over it, the way a Lewis or a
     Bren does, so that is what it has now: a tower at the back of the rail
     and a post standing off the tube at the front, half a metre apart.

     ARC_SIGHT is the line both are built to, and the number the mount
     reports. Nothing forward of the tower may cross it. */
  hardBox(g, 0.0300, 0.0268, 0, 0.0900, 0.0034, 0.0110);          // the rail itself

  // Rear tower: two uprights off the rail with the notch bridged between.
  for (const sz of [-1, 1]) {
    hardBox(g, -0.0400, (0.0302 + ARC_SIGHT) / 2, sz * 0.0074,
      0.0032, (ARC_SIGHT - 0.0302) / 2, 0.0026);
  }
  hardBox(g, -0.0400, ARC_SIGHT - 0.0016, 0, 0.0032, 0.0016, 0.0074);          // notch floor
  for (const sz of [-1, 1]) hardBox(g, -0.0400, ARC_SIGHT + 0.0026, sz * 0.0048, 0.0032, 0.0042, 0.0026);
  // A protective ear each side, outboard of the notch.
  for (const sz of [-1, 1]) hardBox(g, -0.0400, ARC_SIGHT + 0.0050, sz * 0.0092, 0.0030, 0.0066, 0.0022);

  // Front post: a pillar off the tube's crown, blade tipped, with wings.
  const fx = 0.4300, ftop = K.tubeY + K.tubeR;
  hardBox(g, fx, (ftop + ARC_SIGHT) / 2, 0, 0.0038, (ARC_SIGHT - ftop) / 2, 0.0044);
  hardBox(g, fx, ARC_SIGHT - 0.0014, 0, 0.0016, 0.0030, 0.0013);               // blade
  for (const sz of [-1, 1]) hardBox(g, fx, ARC_SIGHT + 0.0016, sz * 0.0072, 0.0030, 0.0062, 0.0022);

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
   BOLT RIFLES — the Remington and the Kill Streak.

   Two guns, one action. A bolt rifle is a tube with a barrel
   screwed into the front of it, a bolt that runs in the tube, a
   magazine under it and a stock round the whole thing, and the
   difference between a deer rifle and an anti-materiel gun is
   almost entirely proportion: how thick the barrel is, how big
   the brake on the end of it is, and how much of the stock has
   been cut away to save weight.

   Real dimensions again. A Remington 700 is 1067 mm overall on a
   610 mm barrel; both are shortened here, because a metre of
   rifle held at the hip fills a third of the screen and the
   player is looking at a gun, not carrying a fence post.
   ============================================================ */

function buildRifleSteel(g, K) {
  /* Receiver: a round tube with a flat-bottomed lug, the way a bolt gun's
     is, running from the tang to the barrel shank. */
  sweepPath(g, [
    ax(K.recRear, roundRect(K.recR, K.recR * 0.86, K.recR * 0.94, 3.0, 24)),
    ax(K.recRear + 0.014, roundRect(K.recR, K.recR, K.recR, 3.0, 24)),
    ax(0.0400, roundRect(K.recR, K.recR, K.recR, 3.0, 24)),
    ax(K.barrelRear - 0.002, roundRect(K.recR, K.recR, K.recR, 3.0, 24)),
  ], true, true);
  // Ejection port, cut into the top right of the tube.
  hardBox(g, -0.0050, K.recR * 0.62, K.recR * 0.70, 0.0300, K.recR * 0.40, 0.0030);
  // Recoil lug and the flat the action beds on.
  hardBox(g, K.barrelRear - 0.010, -K.recR - 0.004, 0, 0.0060, 0.0090, 0.0130);

  /* Barrel. A taper, and on the heavy rifle six flutes milled down it —
     which is what a barrel that thick actually has, and what stops it
     reading as a length of pipe. */
  tubeRun(g, [
    [K.barrelRear - 0.004, K.barrelR0],
    [K.barrelRear + 0.030, K.barrelR0],
    [K.muzzle - (K.brake ? K.brake.len : 0.030) - 0.010, K.barrelR1],
    [K.muzzle - (K.brake ? K.brake.len : 0.002), K.barrelR1],
  ], 24, true, false);
  if (K.fluted) {
    for (let i = 0; i < 6; i++) {
      const th = (i / 6) * TAU + 0.3;
      const rr = K.barrelR0 + 0.0040;
      spin(g, [
        [K.barrelRear + 0.055, 0], [K.barrelRear + 0.055, 0.0058],
        [K.muzzle - K.brake.len - 0.040, 0.0058], [K.muzzle - K.brake.len - 0.040, 0],
      ], 12, 34, Math.cos(th) * rr, Math.sin(th) * rr);
    }
  }

  if (K.brake) {
    /* Muzzle brake: a can with ports cut through it, and it is enormous
       because the rifle behind it is. */
    const b = K.brake, x0 = K.muzzle - b.len;
    spin(g, [
      [x0, K.barrelR1], [x0 + 0.010, b.r], [K.muzzle - 0.006, b.r],
      [K.muzzle, b.r * 0.88], [K.muzzle, K.bore + 0.0018], [x0, K.bore + 0.0018],
    ], 26, 34);
    for (let i = 0; i < b.ports; i++) {
      const x = x0 + 0.020 + i * ((b.len - 0.032) / b.ports);
      for (const sz of [-1, 1]) {
        hardBox(g, x, 0, sz * b.r * 0.86, 0.0075, b.r * 0.72, 0.0060);
      }
    }
    crown(g, K.muzzle, K.bore + 0.0022, K.bore, 0.060);
  } else {
    crown(g, K.muzzle, K.barrelR1, K.bore, 0.050);
  }

  /* Trigger group, guard, and the safety on the tang. */
  guardBow(g, [
    [-0.0480, -K.recR - 0.006], [-0.0455, -K.recR - 0.018], [-0.0330, -K.recR - 0.026],
    [-0.0180, -K.recR - 0.025], [-0.0105, -K.recR - 0.017], [-0.0085, -K.recR - 0.006],
  ], 0.0028, 0.0028, 0.0058);
  triggerBlade(g, -0.0300, -K.recR - 0.006, 0, 0.022, 0.0040);
  hardBox(g, K.recRear + 0.008, K.recR + 0.004, 0.0060, 0.0080, 0.0026, 0.0040);

  /* Magazine box, a hinged floorplate under it, and the release. */
  sweepPath(g, [
    ax(K.magX - K.magLen / 2, roundRect(0.0090, 0.0090, 0.0110, 3.2, 18), -K.recR - 0.010),
    ax(K.magX - K.magLen / 2 + 0.006, roundRect(0.0110, 0.0170, 0.0140, 3.2, 18), -K.recR - 0.010),
    ax(K.magX + K.magLen / 2 - 0.006, roundRect(0.0110, 0.0170, 0.0140, 3.2, 18), -K.recR - 0.010),
    ax(K.magX + K.magLen / 2, roundRect(0.0090, 0.0090, 0.0110, 3.2, 18), -K.recR - 0.010),
  ], true, true);
  hardBox(g, K.magX, -K.recR - 0.028, 0, K.magLen / 2, 0.0030, 0.0146);

  /* Sling swivels, front and rear. */
  for (const sx of [K.muzzle * 0.62, K.stockButt + 0.070]) {
    strut(g, [sx, -K.recR - 0.030, -0.0035], [sx, -K.recR - 0.030, 0.0035], ringOutline(0.0030, 10));
  }

  if (K.bipod) {
    /* Bipod, folded back along the forend — it is a rifle you shoot lying
       down and it should look like one even when you are not. */
    for (const sz of [-1, 1]) {
      strut(g, [K.muzzle * 0.56, -K.recR - 0.014, sz * 0.010],
        [K.muzzle * 0.30, -K.recR - 0.052, sz * 0.030], ringOutline(0.0055, 10));
      strut(g, [K.muzzle * 0.30, -K.recR - 0.052, sz * 0.030],
        [K.muzzle * 0.24, -K.recR - 0.046, sz * 0.034], ringOutline(0.0070, 10));
    }
    hardBox(g, K.muzzle * 0.56, -K.recR - 0.012, 0, 0.0130, 0.0090, 0.0150);
  }
}

/* The bolt: body, handle, knob. It runs straight back, which is the whole
   of a bolt gun's reload. */
function buildRifleBolt(g, K) {
  sweepPath(g, [
    ax(K.recRear + 0.010, ringOutline(K.recR * 0.62, 18)),
    ax(K.barrelRear - 0.006, ringOutline(K.recR * 0.62, 18)),
  ], true, true);
  // Handle out of the right flank, swept down and back, with a round knob.
  strut(g, [-0.0180, 0, K.recR * 0.50], [-0.0210, -0.0090, K.recR + 0.0230], ringOutline(0.0048, 12));
  spin(g, [[-0.0300, 0], [-0.0250, 0.0105], [-0.0180, 0.0105], [-0.0140, 0]],
    16, 36, -0.0110, K.recR + 0.0290);
  // Shroud and the cocking piece at the back.
  spin(g, [[K.recRear + 0.002, 0], [K.recRear + 0.002, K.recR * 0.56],
           [K.recRear + 0.014, K.recR * 0.56], [K.recRear + 0.014, 0]], 18, 36);
}

/* Stock. Synthetic on both, so it is the same shape twice with the heavy
   rifle's cut away into a skeleton and given a cheek riser. */
function buildRifleStock(g, K) {
  const st = (x, cy, up, down, hw) => ax(x, roundRect(up, down, hw, 2.4, 22), cy);
  sweepPath(g, [
    st(K.stockButt, -0.0420, 0.0470, 0.0430, 0.0175),
    st(K.stockButt + 0.050, -0.0380, 0.0430, 0.0370, 0.0170),
    st(K.stockButt + 0.130, -0.0300, K.comb + 0.0180, 0.0300, 0.0165),
    st(K.recRear - 0.030, -0.0180, K.comb + 0.0120, 0.0230, 0.0180),
    st(K.recRear + 0.010, -0.0120, K.recR + 0.0030, 0.0210, 0.0195),
  ], true, true);
  // Butt pad.
  hardBox(g, K.stockButt - 0.0030, -0.0420, 0, 0.0035, 0.0480, 0.0175);
  if (K.cheek) {
    hardBox(g, K.stockButt + 0.120, K.comb + 0.0090, 0, 0.0520, 0.0110, 0.0165);
    // Two lightening cuts through the wrist, so it reads as a chassis.
    for (const sx of [K.stockButt + 0.075, K.stockButt + 0.145]) {
      strut(g, [sx, -0.0300, -0.0180], [sx, -0.0300, 0.0180], ringOutline(0.0135, 14));
    }
  }
  /* Forend, running under the barrel and free-floated — the gap is the
     point on a target rifle and it is visible from every angle. */
  const fy = -K.recR - 0.008;
  sweepPath(g, [
    ax(K.barrelRear - 0.020, roundRect(0.0130, 0.0175, 0.0220, 2.6, 22), fy),
    ax(K.barrelRear + 0.030, roundRect(0.0150, 0.0230, 0.0265, 2.5, 22), fy),
    ax(K.muzzle * 0.55, roundRect(0.0150, 0.0230, 0.0265, 2.5, 22), fy),
    ax(K.muzzle * 0.62, roundRect(0.0120, 0.0150, 0.0210, 2.7, 22), fy),
  ], true, true);
  // Pistol grip.
  gripStack(g, K.gripTopX, K.gripTopY, K.gripLen, K.gripRake, [
    [0.00, 0.0180, 0.0220, 0.0175, 2.6],
    [0.30, 0.0165, 0.0200, 0.0168, 2.5],
    [0.70, 0.0162, 0.0200, 0.0168, 2.5],
    [1.00, 0.0170, 0.0212, 0.0176, 2.8],
  ]);
  for (const sd of [-1, 1]) {
    checker(g, K.gripTopX - 0.028, K.gripTopY - 0.052, sd * 0.0172, K.gripRake, -0.94, sd, 4, 7, 0.0060, 0.0010);
  }
}

/* Scope, rings and mount. A telescopic sight is a tube with a bell on the
   front, an ocular bell on the back and a turret housing in the middle,
   and every one of those three is what makes it read as glass rather than
   as a length of pipe lying on the receiver. */
function buildRifleScope(g, K) {
  const S2 = K.scope;
  /* A tube, and it has to be a real one.

     The outline runs down the inside from the objective to the ocular,
     steps out at the back, and comes forward again over the bells and the
     waist. Closing it to the axis instead — which is what a naive lathe
     outline does — puts a solid disc across the front of the scope, and
     what you get is a beautifully machined black hole you cannot see
     through. The inner wall is what gives the sight picture its dark ring;
     the hole down the middle is what makes it a sight. */
  const rIn = S2.bell * 0.66;
  spin(g, [
    [S2.x0 + 0.004, rIn], [S2.x1 - 0.002, rIn],
    [S2.x1, S2.bell * 0.94], [S2.x1 - 0.006, S2.bell], [S2.x1 - 0.048, S2.bell],
    [S2.x1 - 0.075, S2.r], [S2.x0 + 0.055, S2.r],
    [S2.x0 + 0.030, S2.r * 1.06], [S2.x0 + 0.004, S2.bell * 0.92],
  ], 26, 34, S2.y);
  // Turrets: elevation on top, windage on the right.
  const tx = (S2.x0 + S2.x1) / 2 + 0.010;
  hardBox(g, tx, S2.y + S2.r + 0.0130, 0, 0.0135, 0.0130, 0.0135);
  hardBox(g, tx, S2.y, S2.r + 0.0130, 0.0125, 0.0125, 0.0130);
  // Magnification ring, knurled, behind the turrets.
  band(g, S2.x1 - 0.100, S2.x1 - 0.082, S2.r, S2.r + 0.0035, 22, S2.y);
  // Rings and the rail they clamp to.
  for (const rx of [S2.x0 + 0.070, S2.x1 - 0.115]) {
    band(g, rx - 0.008, rx + 0.008, S2.r, S2.r + 0.0055, 22, S2.y);
    hardBox(g, rx, (S2.y - S2.r - K.recR) / 2 + K.recR / 2 + S2.r * 0, 0,
      0.0080, (S2.y - S2.r - K.recR) / 2 + 0.004, 0.0090);
  }
  hardBox(g, (S2.x0 + S2.x1) / 2, K.recR + 0.0035, 0, (S2.x1 - S2.x0) / 2 * 0.7, 0.0035, 0.0105);
}

/* The lens. Its own geometry so it can be glass while the tube is steel —
   a scope whose objective is the same material as its body is a pipe. */
function buildRifleGlass(g, K) {
  const S2 = K.scope;
  /* Rims, not discs.

     A lens modelled as a filled circle is opaque, and an opaque circle
     across the back of a scope is a black hole you cannot aim through —
     which is exactly what it was. Real scopes in games are either rendered
     to a texture or left open, and open is right here: you look down the
     tube at the world, the tube's own inner wall gives you the black ring
     round the edge that a scope actually has, and the reticle floats in
     the middle of it. These two rings are just the glass edges catching
     light at the front and back. */
  const rim = (x0, x1, rIn, rOut) => spin(g, [
    [x0, rIn], [x1, rIn], [x1, rOut], [x0, rOut],
  ], 24, 40, S2.y);
  rim(S2.x0 + 0.006, S2.x0 + 0.010, S2.bell * 0.62, S2.bell * 0.70);
  rim(S2.x1 - 0.010, S2.x1 - 0.006, S2.bell * 0.60, S2.bell * 0.68);
}

/* The reticle: a duplex cross on the first focal plane, which here means
   a few very thin bars sitting a little way inside the ocular. A scope
   that is a black circle can be looked through and not aimed with, and
   the whole reason to carry either of these rifles is the aiming. */
function buildRifleReticle(g, K) {
  const S2 = K.scope, r = S2.bell * 0.80, x = S2.x1 - 0.030;
  const t = 0.00035, thick = 0.0011;
  // Four arms, thick at the rim and hairline toward the middle.
  for (const [dy, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    hardBox(g, x, S2.y + dy * r * 0.62, dz * r * 0.62,
      t, dy ? r * 0.38 : thick, dz ? r * 0.38 : thick);
    hardBox(g, x, S2.y + dy * r * 0.20, dz * r * 0.20,
      t, dy ? r * 0.20 : t * 1.6, dz ? r * 0.20 : t * 1.6);
  }
  // Centre dot.
  hardBox(g, x, S2.y, 0, t, 0.00055, 0.00055);
}

/* ============================================================
   MG 42 — the machine gun.

   Belt-fed, air-cooled, and the fastest thing on the map at
   twelve hundred rounds a minute. Its silhouette is three
   features and nothing else matters: the perforated barrel
   shroud with the great cut-out down the right side, the top
   cover that hinges up over the feed, and the belt hanging out
   of it. Miss any of those and it is a length of pipe on a
   bipod; get them and it is recognisable from across the room.

     overall  1.220   barrel  0.533   weight  11.6 kg
   ============================================================ */

const MG42 = {
  muzzle: 0.7600, shroudRear: 0.1350, shroudFront: 0.5100,
  shroudR: 0.0345, barrelR: 0.0125, bore: 0.00395,
  recRear: -0.1000, recR: 0.0330,
  gripTopX: -0.0740, gripTopY: -0.0260,
  stockButt: -0.3600, feedY: 0.0345, beltZ: 0.0360, coverPin: -0.0460,
};

function buildMgSteel(g) {
  const K = MG42;
  /* Receiver: a stamped box, square-sided with a radiused top, running
     from the buttstock collar to the shroud. */
  const rec = (x, s = 1) => ax(x, roundRect(K.recR * s, K.recR * 0.86 * s, K.recR * 0.80 * s, 3.0, 24));
  sweepPath(g, [
    rec(K.recRear, 0.86), rec(K.recRear + 0.020, 0.94), rec(-0.0300), rec(0.0800),
    rec(K.shroudRear - 0.002, 0.98),
  ], true, true);

  /* Barrel shroud: a perforated jacket with the long cut-out down the
     right flank the barrel is changed through. The holes are real
     geometry — this gun is nothing without them. */
  sweepPath(g, [
    ax(K.shroudRear, ringOutline(K.shroudR, 24)),
    ax(K.shroudFront - 0.020, ringOutline(K.shroudR, 24)),
    ax(K.shroudFront, ringOutline(K.shroudR * 0.86, 24)),
  ], true, true);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 11; i++) {
      const x = K.shroudRear + 0.030 + i * 0.0330;
      const th = -0.95 + row * 0.95;                 // left and top; the right
      const cy = Math.cos(th) * K.shroudR;           // side is the cut-out
      const cz = Math.sin(th) * K.shroudR;
      spin(g, [[x - 0.0085, 0], [x - 0.0085, 0.0095], [x + 0.0085, 0.0095], [x + 0.0085, 0]],
        10, 40, cy, cz);
    }
  }
  // The cut-out itself: a long slot down the right, with a lipped edge.
  hardBox(g, (K.shroudRear + K.shroudFront) / 2 + 0.020, 0, K.shroudR - 0.002,
    (K.shroudFront - K.shroudRear) / 2 - 0.050, K.shroudR * 0.46, 0.0060);
  // Barrel inside it, and a conical flash hider on the end.
  tubeRun(g, [[K.shroudRear - 0.010, K.barrelR], [K.shroudFront + 0.010, K.barrelR * 0.90],
              [K.muzzle - 0.070, K.barrelR * 0.84]], 20, true, false);
  spin(g, [
    [K.muzzle - 0.072, K.barrelR * 0.84], [K.muzzle - 0.060, 0.0215], [K.muzzle - 0.008, 0.0230],
    [K.muzzle, 0.0215], [K.muzzle, K.bore + 0.0018], [K.muzzle - 0.072, K.bore + 0.0018],
  ], 24, 34);
  crown(g, K.muzzle, K.bore + 0.0022, K.bore, 0.055);

  /* The feed tray, which is what is UNDER the cover -- a shallow pan
     across the top of the receiver with a lip either side, and the
     cartridge stop at the back of it. The cover is its own part now (see
     buildMgCover) because it has to open, and you cannot open a lid that
     has been welded to the box.

     This is the part you have never seen: it was inside a closed cover
     that was part of the receiver, so there was nothing to lay a belt
     into and the reload could only ever be a magazine appearing. */
  const trayY = K.feedY - 0.0092;
  hardBox(g, 0.0250, trayY, 0, 0.0620, 0.0022, K.recR * 0.72);          // pan
  for (const sz of [-1, 1]) {                                            // lips
    hardBox(g, 0.0250, trayY + 0.0048, sz * K.recR * 0.72, 0.0620, 0.0030, 0.0028);
  }
  hardBox(g, -0.0330, trayY + 0.0060, 0, 0.0040, 0.0042, K.recR * 0.60); // stop
  // Feed rollers the belt rides over, one each side of the tray mouth.
  for (const sz of [-1, 1]) {
    band(g, 0.0700, 0.0760, 0.0038, 0.0052, 12, trayY + 0.0040, sz * K.recR * 0.50);
  }
  /* The slot the cocking handle runs in, down the right flank. The handle
     itself is its own part -- it travels. */
  hardBox(g, -0.0100, -0.0040, K.recR * 0.88, 0.0480, 0.0055, 0.0022);

  /* Sights: a folding leaf at the back on a tall base, a hooded post at
     the front of the shroud. Both stand well clear of the cover. */
  hardBox(g, -0.0620, K.feedY + 0.0180, 0, 0.0110, 0.0130, 0.0090);
  band(g, -0.0680, -0.0560, 0.0042, 0.0105, 20, K.feedY + 0.0330);
  band(g, K.shroudFront - 0.030, K.shroudFront - 0.010, 0.0090, 0.0120, 20, K.feedY + 0.0330);
  hardBox(g, K.shroudFront - 0.020, K.feedY + 0.0270, 0, 0.0018, 0.0055, 0.0016);
  hardBox(g, K.shroudFront - 0.020, K.feedY + 0.0125, 0, 0.0090, 0.0090, 0.0075);

  /* Trigger group and the spade-ish grip. */
  guardBow(g, [
    [-0.0500, -K.recR - 0.008], [-0.0475, -K.recR - 0.021], [-0.0345, -K.recR - 0.030],
    [-0.0185, -K.recR - 0.029], [-0.0105, -K.recR - 0.020], [-0.0085, -K.recR - 0.008],
  ], 0.0030, 0.0030, 0.0062);
  triggerBlade(g, -0.0300, -K.recR - 0.008, 0, 0.024, 0.0044);

  /* Bipod, folded down under the shroud. */
  for (const sz of [-1, 1]) {
    strut(g, [K.shroudFront - 0.040, -K.shroudR + 0.006, sz * 0.008],
      [K.shroudFront - 0.150, -K.shroudR - 0.150, sz * 0.075], ringOutline(0.0070, 10));
    strut(g, [K.shroudFront - 0.150, -K.shroudR - 0.150, sz * 0.075],
      [K.shroudFront - 0.168, -K.shroudR - 0.142, sz * 0.082], ringOutline(0.0090, 10));
  }
  hardBox(g, K.shroudFront - 0.040, -K.shroudR - 0.004, 0, 0.0140, 0.0100, 0.0160);

  /* Carrying handle on the left of the receiver. */
  strut(g, [-0.0200, 0.0100, -K.recR * 0.80], [-0.0200, 0.0100, -K.recR - 0.030], ringOutline(0.0055, 10));
  strut(g, [-0.0200, 0.0100, -K.recR - 0.030], [0.0500, 0.0100, -K.recR - 0.030], ringOutline(0.0075, 12));
  strut(g, [0.0500, 0.0100, -K.recR - 0.030], [0.0500, 0.0100, -K.recR * 0.80], ringOutline(0.0055, 10));
}

/* The top cover. Hinged at the rear so it swings UP and forward, which is
   the single motion this gun's reload is famous for.

   Built about the hinge pin, so the actor can be turned about its own
   origin and the lid opens instead of flying off. Everything here is in
   cover space: the pin is at x = MG42.coverPin, and the model is offset so
   that the part sits where the closed cover sits when the rotation is
   zero. */
function buildMgCover(g) {
  const K = MG42;
  const px = K.coverPin, py = K.feedY;
  const rel = (x) => x - px;
  sweepPath(g, [
    ax(rel(-0.0400), roundRect(0.0130, 0.0060, K.recR * 0.76, 3.0, 20), 0),
    ax(rel(0.0100), roundRect(0.0150, 0.0060, K.recR * 0.80, 3.0, 20), 0),
    ax(rel(0.1000), roundRect(0.0130, 0.0060, K.recR * 0.74, 3.0, 20), 0),
  ], true, true);
  // Feed pawl housing on top, and the pawl arm under it that walks the belt.
  hardBox(g, rel(0.0200), 0.0180, 0, 0.0280, 0.0055, 0.0110);
  hardBox(g, rel(0.0250), -0.0072, 0.0090, 0.0180, 0.0026, 0.0060);
  // Hinge pin and its two ears.
  strut(g, [rel(-0.0460) + 0.0000, 0, -0.0180], [rel(-0.0460), 0, 0.0180], ringOutline(0.0060, 12));
  // The latch at the front of the cover that holds it shut.
  hardBox(g, rel(0.1010), -0.0020, 0, 0.0040, 0.0090, 0.0090);
  void py;
}

/* The cocking handle. A stubby lever on the right of the receiver that is
   dragged back the length of the slot and let go. */
function buildMgBolt(g) {
  const K = MG42;
  const z = K.recR * 0.90;
  strut(g, [0.0250, -0.0040, z], [0.0250, -0.0040, z + 0.0140], ringOutline(0.0055, 10));
  spin(g, [[0.0250, 0.0000], [0.0250, 0.0105], [0.0330, 0.0125], [0.0410, 0.0105], [0.0410, 0]],
    10, 26, -0.0040, z + 0.0200);
  hardBox(g, 0.0330, -0.0040, z + 0.0210, 0.0090, 0.0110, 0.0040);
}

/* A length of belt in the hand: what the loader actually carries.

   The gun's own belt hangs out of the feed and is fixed to it. This one is
   a loose run of links with a droop in it, held by the leading end, that
   goes into the tray. Without it the reload was a hand going to an open
   cover and back, which is the invisible reload the player has been
   describing all along. */
function buildHandBelt(g, n) {
  const N = n || 12, PITCH = 0.0158;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // Held level at the leading end, sagging away under its own weight.
    const x = -t * PITCH * N;
    const y = -0.052 * t * t;
    const roll = -t * 28;
    game_hardBoxRot(g, x, y, 0, 0.0062, 0.0082, 0.0115, roll);
    const a = roll * PI / 180;
    spin(g, [[-0.0062, 0], [-0.0062, 0.0040], [0.0068, 0.0040], [0.0102, 0.0026], [0.0122, 0]]
      .map(([u, w]) => [x + u * Math.cos(a), w]), 10, 34, y, 0);
  }
}

/* Stock and grip: bakelite, so their own material. */
function buildMgStock(g) {
  const K = MG42;
  const st = (x, cy, up, down, hw) => ax(x, roundRect(up, down, hw, 2.5, 20), cy);
  sweepPath(g, [
    st(K.stockButt, -0.0300, 0.0400, 0.0380, 0.0165),
    st(K.stockButt + 0.060, -0.0250, 0.0330, 0.0300, 0.0160),
    st(K.stockButt + 0.150, -0.0170, 0.0270, 0.0250, 0.0170),
    st(K.recRear + 0.004, -0.0080, 0.0290, 0.0250, 0.0210),
  ], true, true);
  hardBox(g, K.stockButt - 0.0030, -0.0300, 0, 0.0035, 0.0410, 0.0165);
  gripStack(g, K.gripTopX, K.gripTopY, 0.1080, 0.26, [
    [0.00, 0.0190, 0.0225, 0.0180, 2.6],
    [0.30, 0.0170, 0.0200, 0.0170, 2.5],
    [0.70, 0.0168, 0.0200, 0.0170, 2.5],
    [1.00, 0.0176, 0.0218, 0.0180, 2.8],
  ]);
  for (const sd of [-1, 1]) checker(g, K.gripTopX - 0.030, K.gripTopY - 0.056, sd * 0.0176, 0.26, -0.96, sd, 4, 7, 0.0060, 0.0010);
}

/* A box turned about Z. hardBox is axis-aligned, and a belt link that
   does not tilt with the curve it is on reads as a stack of bricks. */
function game_hardBoxRot(g, cx, cy, cz, hx, hy, hz, degZ) {
  const a = degZ * PI / 180, c = Math.cos(a), s2 = Math.sin(a);
  const u = [c, s2, 0], v = [-s2, c, 0], w = [0, 0, 1];
  const faces = [[u, hx], [v, hy], [w, hz]];
  for (const [n, h] of faces) {
    for (const sgn of [1, -1]) {
      const o = [cx + n[0] * h * sgn, cy + n[1] * h * sgn, cz + n[2] * h * sgn];
      const [p, q] = faces.filter((f) => f[0] !== n);
      const base = g.positions.length / 3;
      for (const [a2, b2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const aa = a2 * sgn;
        g.vert(o[0] + p[0][0] * p[1] * aa + q[0][0] * q[1] * b2,
               o[1] + p[0][1] * p[1] * aa + q[0][1] * q[1] * b2,
               o[2] + p[0][2] * p[1] * aa + q[0][2] * q[1] * b2,
               n[0] * sgn, n[1] * sgn, n[2] * sgn,
               (a2 + 1) / 2 * p[1] * 2, (b2 + 1) / 2 * q[1] * 2);
      }
      g.quad(base, base + 1, base + 2, base + 3);
    }
  }
}

/* The belt: fifty rounds hanging out of the feed and swinging. Its own
   actor, because it is the part that moves and the part you notice. */
function buildMgBelt(g) {
  const K = MG42;
  /* An MG 42 does not feed along itself. The belt comes in from the LEFT
     across the feed tray, the rounds are stripped downward as it crosses,
     and the free tail hangs off the RIGHT lip. It was modelled running
     rearward down the left flank, pointing backwards -- which is the
     "magazine is facing the wrong way on the MG 42".

     Three runs, one belt: the loaded part lying IN the tray crossing the
     receiver, the turn over the right lip, and the tail hanging down the
     right side with a little rearward lean as it swings. A link is a box
     and a round is a tube laid across it, so both can point along the run
     whatever direction the run is going. */
  const PITCH = 0.0158;
  const trayY = K.feedY - 0.0048;
  const lip = K.recR * 0.74;
  const R = 0.0042, HEAD = 0.0050, CASE = 0.0570;
  // One link: a box square to the run, and the cartridge lying in it
  // nose-inboard, so every round points at the chamber.
  const link = (at, run, nose) => {
    const q = ringOutline(0.0072, 8);
    strut(g, [at[0] - run[0] * 0.0058, at[1] - run[1] * 0.0058, at[2] - run[2] * 0.0058],
             [at[0] + run[0] * 0.0058, at[1] + run[1] * 0.0058, at[2] + run[2] * 0.0058], q);
    // Case, shoulder and bullet, as three short runs along the nose axis.
    const P = (t) => [at[0] + nose[0] * t, at[1] + nose[1] * t, at[2] + nose[2] * t];
    strut(g, P(-CASE * 0.45), P(CASE * 0.28), ringOutline(R, 10));
    strut(g, P(CASE * 0.28), P(CASE * 0.40), ringOutline(R * 0.80, 10));
    strut(g, P(CASE * 0.40), P(CASE * 0.40 + HEAD * 2.4), ringOutline(R * 0.74, 10), true, true);
  };
  // 1. Across the tray, left lip out to the right lip. Run is +Z, the
  //    rounds lie along -X so they point at the barrel.
  let z = -lip - 0.006;
  const across = Math.max(3, Math.round((lip * 2 + 0.012) / PITCH));
  for (let i = 0; i < across; i++) {
    link([0.0230, trayY, z], [0, 0, 1], [1, 0, 0]);
    z += PITCH;
  }
  // 2. Over the lip: a quarter turn from running outboard to running down.
  let y = trayY, x = 0.0230;
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (PI / 2) * 0.94;
    const run = [0, -Math.sin(a), Math.cos(a)];
    link([x, y, z], run, [1, 0, 0]);
    z += Math.cos(a) * PITCH; y -= Math.sin(a) * PITCH;
  }
  // 3. The tail, hanging and leaning back as it goes.
  for (let i = 0; i < 15; i++) {
    const lean = 0.10 + i * 0.008;
    const run = [-Math.sin(lean), -Math.cos(lean), 0];
    link([x, y, z], run, [0, 0, -1]);
    x += run[0] * PITCH; y += run[1] * PITCH;
  }
}

/* ============================================================
   ENGINE HOOKS

   One material table for the whole rack, so a part named "steel"
   is the same steel on every gun and the set looks like it came
   out of one armoury.
   ============================================================ */

const ARM_MAT = {
  /* Wartime parkerised blue.

     At metalness 1 the colour is not an albedo, it is the reflectance — a
     metal has no diffuse term at all, so a dark colour here does not make a
     dark grey object, it makes a mirror that reflects almost nothing. The
     old 0x33383e was about a fifth of steel's real reflectance, which is
     why the MP5's receiver, the scope tubes and the MG's shroud all fell to
     flat black indoors with the lamps behind the player: there was nothing
     for them to be dark *with*. Oxide-blued steel sits nearer half of bare
     steel, tinted cold. */
  blued: { color: 0x596470, texture: 'metal', roughness: 0.36, metalness: 1 },
  // Machined bright — the Paralyzer and the Model 5 are instruments.
  /* Machined bright — the Paralyzer and the Model 5 are instruments.

     Toned down from 0x9ba2aa when the room probe arrived: with something
     for a mirror to reflect indoors, a reflectance that high stopped
     reading as polished steel and started reading as a white blob with no
     shape in it. Rougher as well, so the highlight spreads over the form
     instead of blowing out one band of it. */
  bright: { color: 0x848c95, texture: 'metal', roughness: 0.38, metalness: 1 },
  // A greyer, rougher steel for things that get hit.
  grey: { color: 0x6b7076, texture: 'metal', roughness: 0.48, metalness: 1 },
  poly: { color: 0x1e2226, texture: 'smooth', roughness: 0.72, metalness: 0 },
  rubber: { color: 0x141618, texture: 'smooth', roughness: 0.86, metalness: 0 },
  walnut: { color: 0x5c4028, texture: 'wood', roughness: 0.64, metalness: 0, uvScale: 18 },
  copper: { color: 0xb46a33, texture: 'metal', roughness: 0.34, metalness: 1 },
  brass: { color: 0xc9a227, texture: 'metal', roughness: 0.30, metalness: 1 },
  glow: { color: 0x9fe8ff, texture: 'smooth', roughness: 0.30, metalness: 0, emissive: 0x54c8ff, emissiveStrength: 1.5 },
  glass: { color: 0xb6c6cc, texture: 'smooth', roughness: 0.12, metalness: 0, opacity: 0.42 },
  // The reticle has to be visible against mud and against a bright sky,
  // so it is emissive rather than merely dark.
  reticle: { color: 0x1a0603, texture: 'smooth', roughness: 0.9, metalness: 0, emissive: 0xff2a1e, emissiveStrength: 2.0 },
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

const RIFLE_KINDS = {
  remington: {
    muzzle: 0.6200, barrelRear: 0.1050, recRear: -0.0900,
    barrelR0: 0.0155, barrelR1: 0.0098, bore: 0.00385,
    recR: 0.0175, brake: null, fluted: false,
    gripTopX: -0.0640, gripTopY: -0.0180, gripLen: 0.1000, gripRake: 0.42,
    stockButt: -0.3400, comb: 0.0180, cheek: false,
    magX: 0.0350, magRows: 1, magLen: 0.0850,
    scope: { x0: -0.0700, x1: 0.1600, r: 0.0175, bell: 0.0245, y: 0.0500 },
    bipod: false,
    origin: new Vec3(-0.0640, -0.0480, 0), mass: 3.9, bound: 0.62,
    mats: { steel: ARM_MAT.blued, wood: ARM_MAT.poly, bolt: ARM_MAT.bright, scope: ARM_MAT.blued, glass: ARM_MAT.glass, reticle: ARM_MAT.reticle },
  },
  killstreak: {
    /* Two millimetres of bore inside forty of steel. Everything about
       this rifle is the wrong way round on purpose: the barrel is as
       thick as a wrist and the hole down the middle of it is the size of
       a pencil lead, which is where the thousand comes from. */
    muzzle: 0.7400, barrelRear: 0.1350, recRear: -0.1050,
    barrelR0: 0.0250, barrelR1: 0.0205, bore: 0.0010,
    recR: 0.0225, brake: { len: 0.1100, r: 0.0330, ports: 5 }, fluted: true,
    gripTopX: -0.0700, gripTopY: -0.0200, gripLen: 0.1080, gripRake: 0.30,
    stockButt: -0.3900, comb: 0.0240, cheek: true,
    magX: 0.0400, magRows: 1, magLen: 0.1250,
    scope: { x0: -0.0850, x1: 0.2100, r: 0.0230, bell: 0.0330, y: 0.0640 },
    bipod: true,
    origin: new Vec3(-0.0700, -0.0520, 0), mass: 12.4, bound: 0.74,
    mats: { steel: ARM_MAT.grey, wood: ARM_MAT.poly, bolt: ARM_MAT.bright, scope: ARM_MAT.blued, glass: ARM_MAT.glass, reticle: ARM_MAT.reticle },
  },
};

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
  body.sightAt = doubleBeadY(C) - o.y;
  /* Where the chamber mouths are when the gun is broken open, so a
     reload can put shells into them rather than at a magazine well the
     gun does not have. */
  body.breechAt = DOUBLE.breech - o.x;
  body.chamberZ = (C.spacing != null ? C.spacing : 0.0245) / 2;
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
    const hammer = new Geometry(); buildModel5Hammer(hammer);
    return fin({ steel, grip, cylinder, hammer }, MOD5_ORIGIN);
  });
  const body = mountArm(this, 'mod5', parts,
    { steel: ARM_MAT.bright, grip: ARM_MAT.rubber, cylinder: ARM_MAT.bright,
      hammer: ARM_MAT.blued },
    opts, 0.20, 2.1, 'steel');
  // The crane pin: forward of the cylinder, low and left. The cylinder
  // swings out about a vertical axis through it, which is the only motion
  // a swing-out revolver has and the reason it looks right when it opens.
  body.crane = [MOD5.cylX1 + 0.014 - MOD5_ORIGIN.x, -0.0150 - MOD5_ORIGIN.y, -0.0150];
  body.ejectPort = [MOD5.cylX0 - MOD5_ORIGIN.x, -MOD5_ORIGIN.y + 0.014, 0.0250];
  /* The hammer's pin, so the game can thumb-cock it with the same
     rotate-about-a-point arithmetic the cylinder's crane uses. */
  body.hammerPin = [MOD5_HAMMER[0] - MOD5_ORIGIN.x, MOD5_HAMMER[1] - MOD5_ORIGIN.y];
  /* Positive, because cocking rotates the spur BACK and DOWN. The other
     sign swings it forward and up, which is the motion of a hammer
     falling. */
  body.hammerCock = 0.52;                        // radians back to full cock
  body.boreAt = MOD5.boreY - MOD5_ORIGIN.y;
  body.muzzleAt = MOD5.muzzle - MOD5_ORIGIN.x;
  body.sightAt = MOD5_SIGHT - MOD5_ORIGIN.y;
  return body;
};

/* ---------------- ammunition, magazines and loaders ----------------

   Spawned as their own actors so the support hand can carry them, and
   cached like every other model. The cartridge dimensions are real and
   live in the game's weapon table; everything here just builds what it
   is handed. */

const AMMO_MAT = {
  brass: { color: 0xb08b32, texture: 'metal', roughness: 0.28, metalness: 1 },
  lead: { color: 0x8e8b84, texture: 'metal', roughness: 0.44, metalness: 1 },
  hull: { color: 0x9c2f24, texture: 'smooth', roughness: 0.62, metalness: 0 },
  steel: { color: 0x565f68, texture: 'metal', roughness: 0.44, metalness: 1 },
  glow: { color: 0x9fe8ff, texture: 'smooth', roughness: 0.30, metalness: 0,
    emissive: 0x54c8ff, emissiveStrength: 1.5 },
};

/* One loose round, for a revolver being fed by hand or a shotgun shell
   going into a chamber. */
Engine.prototype.cartridge = function (opts = {}) {
  const C = opts.round || { headR: 0.0058, caseR: 0.0053, neckR: 0.0048,
    caseLen: 0.0230, overall: 0.0320 };
  const key = 'cart:' + JSON.stringify(C);
  const parts = armCache(this, key, () => {
    const brass = new Geometry(), lead = new Geometry();
    ammoCartridge(brass, lead, C);
    return fin({ brass, lead }, new Vec3(0, 0, 0));
  });
  return mountArm(this, key, parts,
    { brass: AMMO_MAT.brass, lead: AMMO_MAT.lead }, opts, 0.04, 0.02, 'brass');
};

Engine.prototype.shotShell = function (opts = {}) {
  const C = opts.shell || {};
  const key = 'shell:' + JSON.stringify(C);
  const parts = armCache(this, key, () => {
    const brass = new Geometry(), hull = new Geometry();
    ammoShell(brass, hull, C);
    return fin({ brass, hull }, new Vec3(0, 0, 0));
  });
  return mountArm(this, key, parts,
    { brass: AMMO_MAT.brass, hull: opts.hullMaterial || AMMO_MAT.hull },
    opts, 0.05, 0.04, 'hull');
};

Engine.prototype.boxMagazine = function (opts = {}) {
  const C = opts.mag || { w: 0.026, d: 0.021, len: 0.105, curve: 0, witness: 3 };
  const key = 'mag:' + JSON.stringify(C);
  const parts = armCache(this, key, () => {
    const steel = new Geometry(), brass = new Geometry(), lead = new Geometry();
    ammoMagazine(steel, brass, lead, C);
    return fin({ steel, brass, lead }, new Vec3(0, 0, 0));
  });
  return mountArm(this, key, parts,
    { steel: opts.bodyMaterial || AMMO_MAT.steel, brass: AMMO_MAT.brass, lead: AMMO_MAT.lead },
    opts, 0.09, 0.35, 'steel');
};

Engine.prototype.stripperClip = function (opts = {}) {
  const C = opts.clip || { count: 10, pitch: 0.0098,
    round: { headR: 0.0049, caseR: 0.0047, neckR: 0.0040, caseLen: 0.0251, overall: 0.0350 } };
  const key = 'clip:' + JSON.stringify(C);
  const parts = armCache(this, key, () => {
    const steel = new Geometry(), brass = new Geometry(), lead = new Geometry();
    ammoStripperClip(steel, brass, lead, C);
    return fin({ steel, brass, lead }, new Vec3(0, 0, 0));
  });
  return mountArm(this, key, parts,
    { steel: AMMO_MAT.steel, brass: AMMO_MAT.brass, lead: AMMO_MAT.lead },
    opts, 0.07, 0.12, 'steel');
};

Engine.prototype.speedloader = function (opts = {}) {
  const C = opts.loader || { count: 4, pcd: 0.0148,
    round: { headR: 0.0074, caseR: 0.0068, neckR: 0.0064, caseLen: 0.0410, overall: 0.0530 } };
  const key = 'loader:' + JSON.stringify(C);
  const parts = armCache(this, key, () => {
    const steel = new Geometry(), brass = new Geometry(), lead = new Geometry();
    ammoSpeedloader(steel, brass, lead, C);
    return fin({ steel, brass, lead }, new Vec3(0, 0, 0));
  });
  return mountArm(this, key, parts,
    { steel: AMMO_MAT.steel, brass: AMMO_MAT.brass, lead: AMMO_MAT.lead },
    opts, 0.06, 0.20, 'steel');
};

Engine.prototype.powerCell = function (opts = {}) {
  const C = opts.cell || { w: 0.052, h: 0.070, d: 0.038 };
  const key = 'cell:' + JSON.stringify(C);
  const parts = armCache(this, key, () => {
    const steel = new Geometry(), glow = new Geometry();
    ammoCell(steel, glow, C);
    return fin({ steel, glow }, new Vec3(0, 0, 0));
  });
  return mountArm(this, key, parts,
    { steel: AMMO_MAT.steel, glow: AMMO_MAT.glow }, opts, 0.06, 0.4, 'steel');
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
  body.sightAt = ARC_SIGHT - ARC_ORIGIN.y;
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

/* ---------------- the bolt rifles ---------------- */

function makeRifle(kind) {
  const K = RIFLE_KINDS[kind];
  const geos = {};
  geos.steel = new Geometry(); buildRifleSteel(geos.steel, K);
  geos.wood = new Geometry(); buildRifleStock(geos.wood, K);
  geos.bolt = new Geometry(); buildRifleBolt(geos.bolt, K);
  geos.scope = new Geometry(); buildRifleScope(geos.scope, K);
  geos.glass = new Geometry(); buildRifleGlass(geos.glass, K);
  geos.reticle = new Geometry(); buildRifleReticle(geos.reticle, K);
  geos.clip = new Geometry(); buildStripperClip(geos.clip, 5, K.bore + 0.0016, K.bore * 2 + 0.0060);
  return fin(geos, K.origin);
}

function boltRifle(E, kind, opts) {
  const K = RIFLE_KINDS[kind];
  const parts = armCache(E, 'rifle:' + kind, () => makeRifle(kind));
  const body = mountArm(E, 'rifle:' + kind, parts, K.mats, opts, K.bound, K.mass, 'steel');
  const o = K.origin;
  body.boreAt = -o.y;
  body.muzzleAt = K.muzzle - o.x;
  // Aimed through glass, so the sight line is the scope's axis.
  body.sightAt = K.scope.y - o.y;
  body.ejectPort = [-0.005 - o.x, K.recR * 0.62 - o.y, K.recR + 0.004];
  body.boltRest = [0, 0, 0];
  body.boltThrow = [-0.075, 0, 0];
  body.clipRest = [K.magX - o.x, K.recR + 0.030 - o.y, 0];
  if (body.clip) body.clip.visible = false;
  return body;
}

Engine.prototype.remington700 = function (opts = {}) { return boltRifle(this, 'remington', opts); };
Engine.prototype.killStreak = function (opts = {}) { return boltRifle(this, 'killstreak', opts); };

/* ---------------- MG 42 ---------------- */

const MG42_ORIGIN = new Vec3(-0.0740, -0.0560, 0);

Engine.prototype.mg42 = function (opts = {}) {
  const parts = armCache(this, 'mg42', () => {
    const steel = new Geometry(); buildMgSteel(steel);
    const wood = new Geometry(); buildMgStock(wood);
    const belt = new Geometry(); buildMgBelt(belt);
    const bolt = new Geometry(); buildMgBolt(bolt);
    const out = fin({ steel, wood, belt, bolt }, MG42_ORIGIN);
    /* The cover is built about its own hinge pin and is NOT moved into the
       gun's space with the rest -- the actor is placed at the pin instead.
       An actor rotates about its own origin, so a lid whose origin is in
       the middle of the receiver does not open, it scythes. */
    const cover = new Geometry(); buildMgCover(cover);
    out.cover = cover.finalize();
    return out;
  });
  const body = mountArm(this, 'mg42', parts, {
    cover: ARM_MAT.blued, bolt: ARM_MAT.bright,
    steel: ARM_MAT.blued,
    // Bakelite: a dark red-brown that reads brown, not orange. At 0x4a2a18
    // under a bright sky it came out the colour of a traffic cone.
    wood: { color: 0x2b1c14, texture: 'smooth', roughness: 0.66, metalness: 0 },
    belt: { color: 0x7a6a3c, texture: 'metal', roughness: 0.46, metalness: 1 },
  }, opts, 0.76, 11.6, 'steel');
  body.boreAt = -MG42_ORIGIN.y;
  body.muzzleAt = MG42.muzzle - MG42_ORIGIN.x;
  body.sightAt = MG42.feedY + 0.0330 - MG42_ORIGIN.y;
  body.ejectPort = [0.010 - MG42_ORIGIN.x, -MG42.recR * 0.5 - MG42_ORIGIN.y, 0];
  /* What the reload moves. A machine gun is not reloaded by swapping a
     magazine-shaped object: the cover comes up, the old belt is thrown
     clear, a new one is laid in the tray and the cover is slammed shut.
     Each of those is a real part with a real place to be.

     The cover turns about its hinge pin, which is where its geometry is
     built about, so the actor rotates about its own origin -- the pin is
     offset out of the model rather than the model being offset off the
     pin, because a lid that rotates about the middle of the receiver
     scythes through the gun. */
  body.beltRest = [0, 0, 0];
  body.beltDrop = [-0.03, -0.42, 0.10];
  body.coverPin = [MG42.coverPin - MG42_ORIGIN.x, MG42.feedY - MG42_ORIGIN.y, 0];
  body.coverOpen = -104;                       // degrees about Z, up and over
  body.boltRest = [0, 0, 0];
  body.boltThrow = [-0.092, 0, 0];
  if (body.cover) body.cover.setPosition(body.coverPin);
  return body;
};

/* A loose length of belt, for the hand that is loading one. */
Engine.prototype.mgBelt = function (opts = {}) {
  const n = (opts.belt && opts.belt.links) || 12;
  const key = 'mgbelt:' + n;
  const parts = armCache(this, key, () => {
    const belt = new Geometry(); buildHandBelt(belt, n);
    return fin({ belt }, new Vec3(0, 0, 0));
  });
  return mountArm(this, key, parts,
    { belt: { color: 0x7a6a3c, texture: 'metal', roughness: 0.46, metalness: 1 } },
    opts, 0.22, 1.4, 'belt');
};
