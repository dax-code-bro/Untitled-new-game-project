/* ============================================================
   VEHICLES -- the campaign's helicopter, tanks and mortar.

   Built the way the guns are: swept sections and boxes, in metres,
   with every part that moves split out as its own geometry and its
   own pivot (fin / mountArm, 97a-arms.js), so a mission turns a rotor
   or a turret with turnAbout and nothing else.

   HELICOPTER  A utility helicopter of the period, Black Hawk-sized:
     a 15 m fuselage, a four-bladed 16 m rotor and a canted tail rotor.
     The cabin is built OPEN -- floor, roof, pillars, bulkheads, both
     doors slid back -- because the opening shot of the first mission
     is a camera inside it looking at five faces.
     Parts: body, glass, inside, rotor, tailRotor.  Nose to +X.

   TANK        A main battle tank: a slab-sided hull on two tracks, an
     angular turret on a ring, a long gun. Parts: hull, wheels, turret,
     gun, and the turret's and the hull's painted markings as their own
     material -- the Hydra tanks carry HYDRA in white on the turret and
     the skirts. Gun to +X.

   MORTAR      An 81 mm mortar: base plate, tube, bipod and sight. Parts:
     base, tube, legs. The tube to +X, at its firing elevation.
   ============================================================ */

const VEH_MAT = {
  olive: { color: 0x434a39, texture: 'paint', roughness: 0.82, metalness: 0, uvScale: 0.6 },
  hydra: { color: 0x1a1b1c, texture: 'paint', roughness: 0.88, metalness: 0, uvScale: 0.6 },
  white: { color: 0xe8e6de, texture: 'paint', roughness: 0.6, metalness: 0, uvScale: 1 },
  glass: { color: 0x3a4650, texture: 'smooth', roughness: 0.08, metalness: 0, opacity: 0.55 },
  rotor: { color: 0x232526, texture: 'paint', roughness: 0.55, metalness: 0.2, uvScale: 1 },
  cabin: { color: 0x585c58, texture: 'paint', roughness: 0.8, metalness: 0.05, uvScale: 1 },
  rubber: { color: 0x161718, texture: 'smooth', roughness: 0.9, metalness: 0 },
  steel: { color: 0x5c6064, texture: 'metal', roughness: 0.5, metalness: 1 },
  track: { color: 0x2c2b29, texture: 'metal', roughness: 0.75, metalness: 0.6 },
};

/* Sweep along X with sections centred at (y, z=0): [x, top, bottom, halfWidth, yCentre]. */
function vehSweep(g, rows, e = 3, n = 24, caps = true, z = 0) {
  sweepPath(g, rows.map(([x, top, bot, hw, yc]) => ax(x, roundRect(top, bot, hw, e, n), yc, z)), caps, caps);
}

/* ---------------- the helicopter ---------------- */

const HELI_SEAT_X = [-1.50, -0.95, -0.40];

function buildHeliParts() {
  const body = new Geometry(), glass = new Geometry(), inside = new Geometry();
  const rotor = new Geometry(), tail = new Geometry();
  // Nose and cockpit, the boxy-round Black Hawk front.
  vehSweep(body, [
    [4.75, 0.25, 0.20, 0.30, 1.40], [4.45, 0.62, 0.42, 0.78, 1.52], [3.95, 0.86, 0.58, 1.04, 1.66],
    [3.20, 1.02, 0.70, 1.18, 1.78], [2.45, 1.06, 0.74, 1.22, 1.82],
  ], 2.6, 28);
  // The windscreen and the cockpit side windows: a glass cap over the upper nose.
  vehSweep(glass, [
    [4.40, 0.36, 0.04, 0.70, 1.80], [3.95, 0.56, 0.04, 1.06, 1.90], [3.15, 0.68, 0.04, 1.20, 1.96],
    [2.55, 0.70, 0.04, 1.24, 1.97],
  ], 2.4, 28);
  // The cabin: belly, floor, roof, pillars and bulkheads, doors open both sides.
  const X0 = -1.85, X1 = 2.45, FY = 0.88, RY = 2.78, HW = 1.22;
  vehSweep(body, [[X1, 0.08, 0.52, HW, FY], [X0, 0.08, 0.52, HW, FY]], 3.2, 24);              // belly
  vehSweep(body, [[X1, 0.30, 0.06, HW, RY - 0.12], [X0, 0.30, 0.06, HW, RY - 0.12]], 3.0, 24);  // roof
  for (const s of [-1, 1]) {
    hardBox(body, X1 - 0.30, (FY + RY) / 2, s * (HW - 0.05), 0.30, (RY - FY) / 2, 0.05);     // front pillar
    hardBox(body, X0 + 0.62, (FY + RY) / 2, s * (HW - 0.05), 0.62, (RY - FY) / 2, 0.05);     // rear panel
    // The slid-back doors, standing proud of the rear panel.
    hardBox(body, X0 + 0.66, (FY + RY) / 2 - 0.05, s * (HW + 0.05), 0.70, (RY - FY) / 2 - 0.1, 0.03);
    // Steps under the door.
    hardBox(body, 0.4, FY - 0.42, s * (HW + 0.05), 1.0, 0.04, 0.12);
  }
  hardBox(inside, X0 + 0.05, (FY + RY) / 2, 0, 0.05, (RY - FY) / 2, HW - 0.1);              // rear bulkhead
  hardBox(inside, (X0 + X1) / 2, FY + 0.02, 0, (X1 - X0) / 2, 0.03, HW - 0.08);               // floor
  // The bulkhead behind the pilots, with a gap through the middle.
  for (const s of [-1, 1]) hardBox(inside, X1 - 0.05, (FY + RY) / 2, s * 0.78, 0.05, (RY - FY) / 2, 0.42);
  /* Troop seats: a canvas bench down each side, three seats a side, facing each other across the
     hold -- the rear three against the rear panel, the front one by the open door on a pole frame. */
  for (const s of [-1, 1]) {
    for (const x of HELI_SEAT_X) {
      hardBox(inside, x, FY + 0.46, s * (HW - 0.36), 0.25, 0.03, 0.22);                  // seat pan
      hardBox(inside, x, FY + 0.82, s * (HW - 0.13), 0.25, 0.34, 0.025);                 // canvas back
      hardBox(inside, x, FY + 0.22, s * (HW - 0.56), 0.02, 0.22, 0.02);                  // front leg
    }
    // The frame the backs hang from: a rail along the wall and a post at each end.
    hardBox(inside, (HELI_SEAT_X[0] + HELI_SEAT_X[2]) / 2, FY + 1.18, s * (HW - 0.12), 0.85, 0.02, 0.02);
    for (const x of [HELI_SEAT_X[0] - 0.27, HELI_SEAT_X[2] + 0.27]) hardBox(inside, x, FY + 0.6, s * (HW - 0.12), 0.02, 0.6, 0.02);
  }
  // The tail cone and boom.
  vehSweep(body, [
    [X0, 0.95, 0.96, 1.16, 1.84], [-3.2, 0.62, 0.56, 0.72, 2.06], [-6.0, 0.33, 0.30, 0.33, 2.36],
    [-8.7, 0.25, 0.22, 0.22, 2.56],
  ], 2.8, 24);
  // The fin and the stabilator.
  vehSweep(body, [[-8.3, 0.10, 0.10, 0.10, 2.6], [-9.3, 1.85, 0.10, 0.10, 2.6]], 3, 16);
  hardBox(body, -8.95, 3.55, 0, 0.45, 0.85, 0.10);
  hardBox(body, -8.6, 2.38, 0, 0.45, 0.05, 2.15);
  // Engines either side of the mast, and the cowling between them.
  for (const s of [-1, 1]) vehSweep(body, [[0.95, 0.30, 0.30, 0.30, 3.02], [-2.1, 0.26, 0.26, 0.26, 3.0]], 2.2, 20, true, s * 0.58);
  hardBox(body, -0.4, 2.98, 0, 1.4, 0.24, 0.62);
  {
    // The mast: a vertical post from the cowling to the hub.
    const st = (y, r) => ({ o: new Vec3(0.2, y, 0), u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1), pts: ringOutline(r, 16) });
    sweepPath(body, [st(3.1, 0.17), st(3.55, 0.15)], true, true);
  }
  // Landing gear: the main wheels under the cockpit, a tail wheel under the boom.
  for (const s of [-1, 1]) {
    const wheel = (x, z, r) => {
      const st = (zz) => ({ o: new Vec3(x, r, zz), u: new Vec3(1, 0, 0), v: new Vec3(0, 1, 0), pts: ringOutline(r, 18) });
      sweepPath(body, [st(z - 0.11), st(z + 0.11)], true, true);
    };
    wheel(2.05, s * 1.42, 0.34);
    hardBox(body, 2.05, 0.62, s * 1.30, 0.06, 0.30, 0.06);
  }
  {
    const st = (zz) => ({ o: new Vec3(-7.7, 0.22, zz), u: new Vec3(1, 0, 0), v: new Vec3(0, 1, 0), pts: ringOutline(0.22, 14) });
    sweepPath(body, [st(-0.08), st(0.08)], true, true);
    hardBox(body, -7.7, 1.1, 0, 0.05, 0.9, 0.05);
  }
  // The rotor: hub and four blades, in the hub's plane; it turns about Y through the mast.
  const HUB = new Vec3(0.2, 3.62, 0);
  {
    const st = (y, r) => ({ o: new Vec3(HUB.x, y, HUB.z), u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1), pts: ringOutline(r, 16) });
    sweepPath(rotor, [st(HUB.y - 0.08, 0.32), st(HUB.y + 0.10, 0.28)], true, true);
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const len = 8.0, droop = 0.10;
    const cx = HUB.x + dx * (0.4 + len / 2), cz = HUB.z + dz * (0.4 + len / 2);
    hardBox(rotor, cx, HUB.y - droop / 2, cz, dx ? len / 2 : 0.27, 0.03, dz ? len / 2 : 0.27);
  }
  // The tail rotor on the right of the fin, turning about Z.
  const TR = new Vec3(-9.05, 3.55, 0.28);
  {
    const st = (z, r) => ({ o: new Vec3(TR.x, TR.y, z), u: new Vec3(1, 0, 0), v: new Vec3(0, 1, 0), pts: ringOutline(r, 12) });
    sweepPath(tail, [st(TR.z - 0.08, 0.12), st(TR.z + 0.08, 0.12)], true, true);
  }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    hardBox(tail, TR.x + dx * 0.88, TR.y + dy * 0.88, TR.z + 0.04, dx ? 0.80 : 0.11, dy ? 0.80 : 0.11, 0.02);
  }
  return fin({ body, glass, inside, rotor, tailRotor: tail }, new Vec3(0, 0, 0), { rotor: HUB, tailRotor: TR });
}

Engine.prototype.helicopter = function (opts = {}) {
  const parts = armCache(this, 'helicopter', buildHeliParts);
  const tint = opts.paint ? { body: Object.assign({}, VEH_MAT.olive, { color: opts.paint }) } : {};
  const body = mountArm(this, 'helicopter', parts,
    { body: tint.body || VEH_MAT.olive, glass: VEH_MAT.glass, inside: VEH_MAT.cabin, rotor: VEH_MAT.rotor, tailRotor: VEH_MAT.rotor },
    Object.assign({ physics: false, lod: false }, opts), 10, 5000, 'body');
  // Where people sit: a seat on either bench at each x, sitting at z = +-0.80 and facing the other side.
  body.cabin = { floorY: 0.88, seatX: HELI_SEAT_X.slice(), seatZ: 0.80, seatY: 1.34, door: { x: 0.6, z: 1.22 } };
  return body;
};

/* ---------------- the tank ---------------- */

function buildTankParts(label) {
  const hull = new Geometry(), wheels = new Geometry(), turret = new Geometry(), gun = new Geometry();
  const hullMark = new Geometry(), turretMark = new Geometry();
  // The hull between the tracks: slab sides, a sloped glacis, a flat engine deck.
  vehSweep(hull, [
    [4.00, 0.16, 0.10, 1.05, 1.12], [3.70, 0.42, 0.40, 1.10, 1.02], [3.10, 0.52, 0.52, 1.10, 0.98],
    [-3.70, 0.56, 0.52, 1.10, 0.98], [-3.95, 0.48, 0.40, 1.05, 1.00],
  ], 8, 24);
  // The deck over the tracks and the fenders.
  hardBox(hull, -0.1, 1.48, 0, 3.85, 0.06, 1.84);
  // Track skirts, with the bolt line along them.
  for (const s of [-1, 1]) {
    hardBox(hull, -0.1, 1.02, s * 1.72, 3.85, 0.42, 0.10);
    for (let i = 0; i < 14; i++) hardBox(hull, -3.6 + i * 0.55, 1.36, s * 1.83, 0.025, 0.025, 0.012);
  }
  // Running gear: seven road wheels a side under the skirt, the sprocket and idler, and the track.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const x = -3.1 + i * 1.02;
      const st = (z) => ({ o: new Vec3(x, 0.38, z), u: new Vec3(1, 0, 0), v: new Vec3(0, 1, 0), pts: ringOutline(0.33, 16) });
      sweepPath(wheels, [st(s * 1.32), st(s * 1.66)], true, true);
    }
    for (const x of [-3.85, 3.65]) {
      const st = (z) => ({ o: new Vec3(x, 0.56, z), u: new Vec3(1, 0, 0), v: new Vec3(0, 1, 0), pts: ringOutline(0.36, 16) });
      sweepPath(wheels, [st(s * 1.30), st(s * 1.68)], true, true);
    }
    hardBox(wheels, -0.1, 0.06, s * 1.49, 3.95, 0.06, 0.22);       // track on the ground
    hardBox(wheels, -0.1, 0.80, s * 1.49, 3.85, 0.05, 0.22);       // and its return run
  }
  // The turret: a wedge-fronted slab on the ring, the bustle out the back.
  const RING = new Vec3(-0.3, 1.54, 0);
  vehSweep(turret, [
    [2.10, 0.34, 0.30, 0.86, 1.96], [1.30, 0.44, 0.40, 1.52, 1.98], [-1.70, 0.46, 0.42, 1.66, 1.98],
    [-2.75, 0.40, 0.36, 1.50, 2.00],
  ], 8, 24);
  // Hatches and the commander's machine gun.
  {
    const st = (y, r) => ({ o: new Vec3(-0.9, y, 0.62), u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1), pts: ringOutline(r, 16) });
    sweepPath(turret, [st(2.42, 0.42), st(2.58, 0.38)], true, true);
  }
  hardBox(turret, -0.9, 2.62, -0.55, 0.36, 0.05, 0.30);
  sweepPath(turret, [ax(-0.75, ringOutline(0.03, 10), 2.86, 0.62), ax(0.55, ringOutline(0.025, 10), 2.86, 0.62)], true, true);
  hardBox(turret, -0.95, 2.72, 0.62, 0.14, 0.12, 0.06);
  // Smoke dischargers either side of the front.
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    sweepPath(turret, [ax(1.25, ringOutline(0.05, 10), 2.20 + k * 0.10, s * 1.45), ax(1.50, ringOutline(0.05, 10), 2.24 + k * 0.10, s * 1.45)], true, true);
  }
  // The gun: mantlet, a long tube with a fume extractor, the muzzle.
  const TRUN = new Vec3(1.75, 1.98, 0);
  hardBox(gun, 2.0, 1.98, 0, 0.30, 0.30, 0.44);
  tubeRun(gun, [[2.25, 0.13], [4.2, 0.115], [4.25, 0.16], [5.1, 0.16], [5.15, 0.11], [7.3, 0.095], [7.35, 0.105], [7.55, 0.105]], 18, true, true, 1.98, 0);
  crown(gun, 7.55, 0.105, 0.06, 0.4, 0, 1.98, 0);
  // The markings: the name on both sides of the turret and both skirts, in white.
  if (label) {
    for (const s of [-1, 1]) {
      ctlStamp(turretMark, label, -0.6, 1.80, 0.36, s * 1.665, s, { weight: 0.15, proud: 0.006 });
      ctlStamp(hullMark, label, 0.0, 0.80, 0.40, s * 1.825, s, { weight: 0.15, proud: 0.006 });
    }
  }
  const geos = { hull, wheels, turret, gun };
  const piv = { turret: RING, gun: TRUN };
  if (label) { geos.hullMark = hullMark; geos.turretMark = turretMark; piv.turretMark = RING; }
  return fin(geos, new Vec3(0, 0, 0), piv);
}

Engine.prototype.tank = function (opts = {}) {
  const label = opts.label || '';
  const parts = armCache(this, 'tank:' + label, () => buildTankParts(label));
  const paint = opts.paint === 'hydra' ? VEH_MAT.hydra : VEH_MAT.olive;
  const t = mountArm(this, 'tank:' + label, parts,
    { hull: paint, wheels: VEH_MAT.track, turret: paint, gun: paint, hullMark: VEH_MAT.white, turretMark: VEH_MAT.white },
    Object.assign({ physics: false, lod: false }, opts), 6, 60000, 'hull');
  t.muzzle = new Vec3(7.6, 1.98, 0);
  return t;
};

/* ---------------- the mortar ---------------- */

function buildMortarParts() {
  const base = new Geometry(), tube = new Geometry(), legs = new Geometry();
  // Base plate: a ribbed disc with the socket in the middle.
  {
    const st = (y, r) => ({ o: new Vec3(0, y, 0), u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1), pts: ringOutline(r, 22) });
    sweepPath(base, [st(0.0, 0.27), st(0.035, 0.27), st(0.05, 0.22)], true, true);
    sweepPath(base, [st(0.05, 0.07), st(0.11, 0.06)], true, true);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      hardBox(base, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, Math.abs(Math.cos(a)) * 0.10 + 0.012, 0.02, Math.abs(Math.sin(a)) * 0.10 + 0.012);
    }
  }
  // The tube, from the socket up and forward at 60 degrees.
  const EL = 60 * Math.PI / 180, L = 1.27;
  const dir = new Vec3(Math.cos(EL), Math.sin(EL), 0);
  const at = (d) => new Vec3(dir.x * d, 0.08 + dir.y * d, 0);
  const tst = (d, r) => {
    const p = at(d);
    return { o: p, u: new Vec3(-dir.y, dir.x, 0), v: new Vec3(0, 0, 1), pts: ringOutline(r, 18) };
  };
  sweepPath(tube, [tst(0, 0.06), tst(0.06, 0.052), tst(L - 0.04, 0.050), tst(L, 0.056)], true, false);
  // Its muzzle is open: a short dark bore.
  sweepPath(tube, [tst(L, 0.042), tst(L - 0.25, 0.042)], false, true);
  // The collar the bipod clamps to, and the sight.
  sweepPath(tube, [tst(0.70, 0.068), tst(0.80, 0.068)], true, true);
  {
    const c = at(0.75);
    hardBox(tube, c.x - 0.05, c.y + 0.05, -0.10, 0.04, 0.06, 0.03);
    hardBox(tube, c.x - 0.05, c.y + 0.13, -0.10, 0.06, 0.03, 0.03);
  }
  // Bipod: two legs from the collar down to the ground, spread, with a cross brace.
  const top = at(0.75);
  for (const s of [-1, 1]) {
    const foot = [top.x + 0.28, 0.02, s * 0.36];
    strut(legs, [top.x, top.y, 0], foot, ringOutline(0.017, 10));
  }
  strut(legs, [top.x + 0.17, top.y * 0.42, -0.22], [top.x + 0.17, top.y * 0.42, 0.22], ringOutline(0.014, 10));
  const geos = fin({ base, tube, legs }, new Vec3(0, 0, 0), null);
  return geos;
}

Engine.prototype.mortar = function (opts = {}) {
  const parts = armCache(this, 'mortar', buildMortarParts);
  const m = mountArm(this, 'mortar', parts,
    { base: VEH_MAT.steel, tube: VEH_MAT.olive, legs: VEH_MAT.olive },
    Object.assign({ physics: false, lod: false }, opts), 1.5, 40, 'base');
  m.muzzle = new Vec3(Math.cos(Math.PI / 3) * 1.27, 0.08 + Math.sin(Math.PI / 3) * 1.27, 0);
  return m;
};
