/* ============================================================
   ATTACHMENTS — the parts that bolt onto the guns.

   Every weapon in the game is a swept model at real dimensions
   now, and until this file existed the things you screwed onto
   them were not: a suppressor was one cylinder, a red dot was a
   box with a red slab stuck to its front, a seven-power scope was
   three cylinders in a row. They are the parts the player is
   invited to look at — the bench exists to show them off — so
   they were the most conspicuous remaining pile of boxes in the
   game.

   Same toolkit, same convention: +X toward the muzzle, +Y up, +Z
   the shooter's right. Each part is authored around ITS OWN
   MOUNT POINT, so the game can keep hanging them off the anchors
   it already computes from each weapon's measured muzzle
   distance, sight height and bore.

   Real dimensions again, because they are what stop a suppressor
   looking like a bin: a 9 mm can is 180 mm long and 38 mm across,
   a red dot's window is 22 mm, a drum holds its rounds in a
   spiral 90 mm across.
   ============================================================ */

const ATT_MAT = {
  // Reflectance, not albedo — see ARM_MAT.blued. A black metal that
  // reflects nothing is a hole in the gun, not a finish.
  black: { color: 0x3c4147, texture: 'metal', roughness: 0.52, metalness: 1 },
  steel: { color: 0x50555c, texture: 'metal', roughness: 0.40, metalness: 1 },
  poly: { color: 0x1e2226, texture: 'smooth', roughness: 0.70, metalness: 0 },
  bright: { color: 0x9ba2aa, texture: 'metal', roughness: 0.30, metalness: 1 },
  glassR: { color: 0x2a1008, texture: 'smooth', roughness: 0.10, metalness: 0,
    emissive: 0xff2a1e, emissiveStrength: 1.4 },
  glassG: { color: 0x08180e, texture: 'smooth', roughness: 0.10, metalness: 0,
    emissive: 0x4affa0, emissiveStrength: 1.2 },
  lens: { color: 0x0d1a22, texture: 'smooth', roughness: 0.08, metalness: 0 },
};

/* Knurling: a band of fine diamonds cut round a cylinder. Two crossed
   helices of shallow grooves, which is what knurling is, and it is the
   detail that says a part was made on a lathe rather than extruded. */
function knurl(g, x0, x1, r, rows = 22) {
  /* Each diamond is a box, not a small lathed lump.

     Lathing them was correct and cost a hundred triangles apiece, which
     put thirteen thousand triangles into a suppressor — more than the
     gun it screws onto. At a millimetre proud on a twenty-millimetre
     cylinder the difference between a box and a turned bump is not
     visible at any range the player will ever see it from, and it is a
     tenth of the cost. */
  const cols = 6, w = (x1 - x0) / cols;
  for (let i = 0; i < rows; i++) {
    const th = (i / rows) * TAU;
    for (let k = 0; k < cols; k++) {
      const x = x0 + (k + 0.5) * w;
      const a = th + ((k % 2) ? 0.5 : 0) * (TAU / rows);
      const cy = Math.cos(a), cz = Math.sin(a);
      hardBox(g, x, cy * (r + 0.0005), cz * (r + 0.0005),
        w * 0.30, Math.abs(cy) * 0.0009 + 0.0004, Math.abs(cz) * 0.0009 + 0.0004);
    }
  }
}

/* A rail clamp: the block and the two jaws that hold an optic to the top
   of a receiver. Every sight in the game sits on one, and a sight that
   floats over the gun with nothing under it is the tell. */
function railClamp(g, x, drop, w = 0.017) {
  hardBox(g, x, -drop * 0.5, 0, w, drop * 0.5, 0.0125);
  hardBox(g, x, -drop, 0, w * 1.15, 0.0042, 0.0170);
  // Thumb nut on the right.
  strut(g, [x, -drop + 0.002, 0.0170], [x, -drop + 0.002, 0.0250], ringOutline(0.0060, 12));
  hardBox(g, x, -drop + 0.002, 0.0255, 0.0055, 0.0030, 0.0075);
}

/* ---------------- muzzle devices ---------------- */

function buildSuppressor(g, bore) {
  /* A 9 mm can: 180 long, 38 across, a knurled mount collar at the back
     and a stepped front cap. The bore goes all the way through, which is
     visible from in front and from the bench. */
  const R = 0.0190, L = 0.1850;
  spin(g, [
    [0, bore + 0.0020], [0.0060, bore + 0.0020], [0.0090, 0.0148],
    [0.0230, 0.0148], [0.0260, R], [L - 0.0140, R], [L - 0.0090, R * 0.92],
    [L, R * 0.86], [L, bore + 0.0022], [0.0060, bore + 0.0022],
  ], 26, 34);
  knurl(g, 0.0100, 0.0225, 0.0149, 20);
  // Two shallow relief cuts down the tube, and the serial band.
  for (const x of [0.058, 0.112]) band(g, x, x + 0.0035, R - 0.0012, R + 0.0004, 24);
  band(g, L - 0.030, L - 0.018, R - 0.0010, R + 0.0006, 24);
}

function buildCompensator(g, bore) {
  /* Short, and cut with three ports that vent up: what a compensator does
     is push the muzzle down, so its ports have to be on top and they have
     to be visibly on top. */
  const R = 0.0148, L = 0.0620;
  spin(g, [
    [0, bore + 0.0020], [0.0050, bore + 0.0020], [0.0075, 0.0125],
    [0.0140, 0.0125], [0.0165, R], [L - 0.0060, R], [L, R * 0.88],
    [L, bore + 0.0022], [0.0050, bore + 0.0022],
  ], 24, 34);
  knurl(g, 0.0080, 0.0135, 0.0126, 18);
  for (let i = 0; i < 3; i++) {
    const x = 0.0230 + i * 0.0120;
    hardBox(g, x, R * 0.72, 0, 0.0038, R * 0.55, 0.0055);
    hardBox(g, x, R * 0.30, 0, 0.0038, R * 0.90, 0.0022);
  }
}

function buildAnnihilator(g, bore) {
  /* The Mark One. A three-chamber squared brake with baffles you can see
     into from the side, because what it is selling is that the gun has
     almost no recoil left and it should look like it is doing something
     violent about the gas. */
  const L = 0.1000, HW = 0.0215, HH = 0.0205;
  sweepPath(g, [
    ax(0, roundRect(0.0120, 0.0120, 0.0120, 3.0, 18)),
    ax(0.0090, roundRect(0.0120, 0.0120, 0.0120, 3.0, 18)),
    ax(0.0130, roundRect(HH, HH, HW, 3.6, 22)),
    ax(L - 0.0090, roundRect(HH, HH, HW, 3.6, 22)),
    ax(L, roundRect(HH * 0.88, HH * 0.88, HW * 0.88, 3.6, 22)),
  ], true, true);
  // Bore, opened out into a cone at the front.
  spin(g, [
    [L + 0.0006, bore + 0.0060], [0.0130, bore + 0.0022], [0, bore + 0.0022],
    [0, bore], [0.0130, bore], [L + 0.0006, bore + 0.0050],
  ], 22, 34);
  // Three baffle slots cut clean through, top and both flanks.
  for (let i = 0; i < 3; i++) {
    const x = 0.0250 + i * 0.0230;
    hardBox(g, x, HH * 0.60, 0, 0.0055, HH * 0.55, HW * 0.72);
    for (const sz of [-1, 1]) hardBox(g, x, 0, sz * HW * 0.66, 0.0055, HH * 0.66, 0.0060);
  }
  // Crown.
  band(g, L - 0.0030, L, bore + 0.0050, HW * 0.86, 22);
}

/* ---------------- barrels ---------------- */

function buildSkullSplitter(g, bore) {
  /* An octagonal heavy barrel with a top rib. Round is what every other
     barrel in the game is; eight flats is instantly a different part, and
     the rib gives it a line to read along. */
  const L = 0.1450, R = 0.0158;
  /* An octagon sampled at the same point count as everything else it is
     swept with. sweepPath stitches station to station by index, so two
     stations with different point counts cannot be joined — and an eight
     sided outline and a twenty sided one are exactly that. Sampling the
     octagon's boundary at twenty points keeps the flats and keeps the
     count, so the shank can be round and the barrel can be octagonal in
     one run. */
  const oct = (r, n = 20) => {
    const raw = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      // Distance from centre to the octagon's edge at this bearing.
      const seg = ((a + PI / 8) % (TAU / 8)) - PI / 8;
      raw.push([Math.cos(a) * r / Math.cos(seg), Math.sin(a) * r / Math.cos(seg)]);
    }
    return profileOutline(raw, 20);
  };
  sweepPath(g, [
    ax(0, ringOutline(0.0126, 20)), ax(0.0080, ringOutline(0.0126, 20)),
    ax(0.0110, oct(R)), ax(L - 0.0080, oct(R)), ax(L, oct(R * 0.94)),
  ], true, false);
  crown(g, L, R * 0.80, bore, 0.045);
  // Rib along the top, and a sharpened crown lip.
  sweepPath(g, [
    ax(0.0140, roundRect(0.0032, 0.0080, 0.0058, 3.2, 14), R * 0.92),
    ax(L - 0.0040, roundRect(0.0032, 0.0080, 0.0058, 3.2, 14), R * 0.92),
  ], true, true);
  band(g, L - 0.0055, L - 0.0010, R * 0.80, R * 1.02, 20);
}

/* Barrels, and why there is more than one of each.
 *
 * There was ONE long barrel and it went on everything -- the same 200 mm
 * tube with the same profile bolted to a 1911, an MP5 and an MG 42. A long
 * barrel for a pistol is not a long barrel for a rifle: a pistol gets a
 * threaded extension a hand's length long with a compensator profile on the
 * end, a submachine gun gets a slim shrouded tube, and a rifle gets a heavy
 * fluted bull barrel with a gas block on it. They are different objects
 * that happen to share a slot.
 *
 * `host` says which kind of weapon it is going on. The bore comes from the
 * host too, so a .50 does not get a 9 mm muzzle. */
function buildLongBarrel(g, bore, host) {
  if (host === 'rifle') {
    /* Heavy, fluted, with a gas block. Long enough to change the gun's
       silhouette from the side, which is the point of buying one. */
    const L = 0.3000;
    tubeRun(g, [[0, 0.0150], [0.0140, 0.0150], [0.0180, 0.0136], [L - 0.0400, 0.0124],
      [L - 0.0360, 0.0132], [L - 0.0020, 0.0130]], 24, true, false);
    // Six flutes down the length, which is what a bull barrel is for.
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6;
      spin(g, [[0.055, 0.0126], [0.075, 0.0112], [L - 0.075, 0.0112], [L - 0.055, 0.0126]],
        10, true, Math.sin(a) * 0.0128, Math.cos(a) * 0.0128);
    }
    // Gas block, squared off, with a port in the top of it.
    hardBox(g, 0.0620, 0.0000, 0, 0.0170, 0.0175, 0.0150);
    hardBox(g, 0.0620, 0.0180, 0, 0.0060, 0.0055, 0.0060);
    band(g, L - 0.030, L - 0.016, 0.0128, 0.0146, 22);
    crown(g, L, 0.0130, bore, 0.060);
    return;
  }
  if (host === 'smg') {
    // Slim, shrouded, with a vented sleeve over the tube.
    const L = 0.2200;
    tubeRun(g, [[0, 0.0118], [0.0090, 0.0118], [0.0120, 0.0096], [L - 0.0020, 0.0092]], 22, true, false);
    for (let k = 0; k < 5; k++) {
      band(g, 0.040 + k * 0.032, 0.052 + k * 0.032, 0.0094, 0.0122, 18);
    }
    crown(g, L, 0.0092, bore, 0.045);
    return;
  }
  /* A pistol: a threaded extension about a hand long, stepped down from the
     bushing and knurled at the muzzle so it can be turned on by hand. */
  const L = 0.1150;
  tubeRun(g, [[0, 0.0128], [0.0100, 0.0128], [0.0135, 0.0104], [L - 0.0220, 0.0100],
    [L - 0.0180, 0.0116], [L - 0.0020, 0.0116]], 22, true, false);
  knurl(g, L - 0.0170, L - 0.0040, 0.0117, 20);
  crown(g, L, 0.0116, bore, 0.050);
  band(g, 0.0180, 0.0300, 0.0104, 0.0120, 20);
}

function buildShortBarrel(g, bore, host) {
  if (host === 'rifle') {
    // A cut-down rifle barrel keeps its heavier profile and gains a brake.
    const L = 0.0720;
    tubeRun(g, [[0, 0.0150], [0.0100, 0.0150], [0.0130, 0.0164], [L - 0.0020, 0.0164]], 22, true, false);
    for (let k = 0; k < 3; k++) hardBox(g, 0.028 + k * 0.016, 0.0130, 0, 0.0045, 0.0055, 0.0170);
    crown(g, L, 0.0164, bore, 0.030, 0.0010);
    return;
  }
  const L = host === 'smg' ? 0.0560 : 0.0480;
  tubeRun(g, [[0, 0.0128], [0.0080, 0.0128], [0.0110, 0.0142], [L - 0.0020, 0.0142]], 22, true, false);
  knurl(g, 0.0140, L - 0.0060, 0.0143, 20);
  crown(g, L, 0.0142, bore, 0.030, 0.0010);
}

function buildBayonet(g) {
  /* A spear-point blade on a socket lug. Edges up and down, flats to the
     sides, the same way the trench knife is oriented — a blade you see
     edge-on reads as a wire. */
  const L = 0.1750;
  const bl = (x, hw, th) => ax(x, roundRect(hw, hw, th, 1.5, 18));
  sweepPath(g, [
    bl(0.0180, 0.0130, 0.0022), bl(0.0400, 0.0148, 0.0024),
    bl(0.1150, 0.0136, 0.0021), bl(0.1500, 0.0100, 0.0016),
    bl(L - 0.0080, 0.0046, 0.0010), bl(L, 0.0009, 0.0004),
  ], true, true);
  // Fuller down each flank.
  for (const sd of [-1, 1]) {
    sweepPath(g, [
      ax(0.0260, roundRect(0.0040, 0.0040, 0.0007, 2.2, 10), 0, sd * 0.0019),
      ax(0.1300, roundRect(0.0036, 0.0036, 0.0006, 2.2, 10), 0, sd * 0.0017),
    ], true, true);
  }
  // Socket lug: the ring that goes over the barrel and the bar under it.
  band(g, 0, 0.0180, 0.0112, 0.0148, 20);
  hardBox(g, 0.0090, -0.0180, 0, 0.0110, 0.0055, 0.0075);
  hardBox(g, 0.0175, -0.0060, 0, 0.0035, 0.0130, 0.0068);
}

/* ---------------- optics ----------------

   All five hang off the same rail clamp and all five are authored with
   their MOUNT at the origin, so the game's optic anchor drops them on the
   sight line without any per-sight fiddling. */

function buildRedDot(g) {
  const L = 0.0620, R = 0.0155, drop = 0.0180;
  // Tube body with a hood over the window and a turret on top.
  spin(g, [
    [0, R * 0.62], [L, R * 0.62], [L, R], [L - 0.0060, R],
    [L - 0.0090, R * 0.90], [0.0120, R * 0.90], [0.0090, R], [0, R],
  ], 22, 34, drop);
  hardBox(g, L - 0.0030, drop + R * 0.55, 0, 0.0055, R * 0.55, R * 0.62);   // hood
  hardBox(g, 0.0230, drop + R + 0.0075, 0, 0.0090, 0.0080, 0.0090);         // turret
  hardBox(g, 0.0230, drop, R + 0.0075, 0.0085, 0.0085, 0.0075);
  knurl(g, 0.0165, 0.0295, 0.0080, 12);
  railClamp(g, 0.0250, drop - R * 0.55);
}

function buildRedDotGlass(g) {
  const L = 0.0620, R = 0.0155, drop = 0.0180;
  // One canted window, which is what a tube dot has and what makes it
  // glint differently to the steel around it.
  spin(g, [[L - 0.0140, 0], [L - 0.0140, R * 0.86], [L - 0.0125, R * 0.86], [L - 0.0125, 0]],
    20, 40, drop);
  // The dot itself.
  hardBox(g, L - 0.0132, drop, 0, 0.0006, 0.0009, 0.0009);
}

function buildThermal(g) {
  const drop = 0.0195, L = 0.1150;
  // Squared body — thermal optics are boxes, not tubes, and that is the
  // whole of how you tell it from the night sight at a glance.
  sweepPath(g, [
    ax(0, roundRect(0.0180, 0.0180, 0.0165, 5.0, 20), drop),
    ax(0.0150, roundRect(0.0195, 0.0195, 0.0180, 5.0, 20), drop),
    ax(L - 0.0250, roundRect(0.0195, 0.0195, 0.0180, 5.0, 20), drop),
    ax(L - 0.0160, roundRect(0.0215, 0.0215, 0.0200, 5.2, 20), drop),
    ax(L, roundRect(0.0215, 0.0215, 0.0200, 5.2, 20), drop),
  ], true, true);
  // Cooling fins along the top, and the eyecup at the back.
  for (let i = 0; i < 5; i++) hardBox(g, 0.0300 + i * 0.0120, drop + 0.0205, 0, 0.0030, 0.0035, 0.0140);
  spin(g, [[-0.0180, 0.0090], [0, 0.0090], [0, 0.0155], [-0.0180, 0.0175]], 20, 34, drop);
  railClamp(g, 0.0450, drop - 0.0165);
  hardBox(g, 0.0180, drop - 0.0140, 0.0190, 0.0060, 0.0055, 0.0035);   // record button
}

function buildThermalGlass(g) {
  const drop = 0.0195, L = 0.1150;
  hardBox(g, L - 0.0025, drop, 0, 0.0018, 0.0175, 0.0165);
}

function buildNightVision(g) {
  const drop = 0.0200, L = 0.1300, R = 0.0230;
  spin(g, [
    [-0.0140, 0.0105], [0, 0.0105], [0.0080, 0.0175], [L - 0.0320, 0.0175],
    [L - 0.0260, R], [L - 0.0040, R], [L, R * 0.90],
    [L, R * 0.74], [L - 0.0260, R * 0.80], [L - 0.0320, 0.0155],
    [0.0080, 0.0155], [0, 0.0088], [-0.0140, 0.0088],
  ], 26, 34, drop);
  knurl(g, L - 0.0230, L - 0.0080, R + 0.0002, 24);
  // Battery cap on top and the IR illuminator alongside.
  strut(g, [0.0330, drop + 0.0175, 0], [0.0330, drop + 0.0290, 0], ringOutline(0.0080, 14));
  spin(g, [[0.0500, 0], [0.0500, 0.0075], [L - 0.0340, 0.0075], [L - 0.0340, 0]],
    16, 36, drop + 0.0130, 0.0210);
  railClamp(g, 0.0480, drop - 0.0155);
}

function buildNightVisionGlass(g) {
  const drop = 0.0200, L = 0.1300, R = 0.0230;
  spin(g, [[L - 0.0060, 0], [L - 0.0060, R * 0.78], [L - 0.0045, R * 0.78], [L - 0.0045, 0]],
    22, 40, drop);
  spin(g, [[L - 0.0345, 0], [L - 0.0345, 0.0062], [L - 0.0335, 0.0062], [L - 0.0335, 0]],
    14, 40, drop + 0.0130, 0.0210);
}

function buildRangefinder(g) {
  const drop = 0.0190, L = 0.1050;
  sweepPath(g, [
    ax(0, roundRect(0.0170, 0.0170, 0.0155, 3.2, 20), drop),
    ax(0.0130, roundRect(0.0185, 0.0185, 0.0170, 3.2, 20), drop),
    ax(L - 0.0120, roundRect(0.0185, 0.0185, 0.0170, 3.2, 20), drop),
    ax(L, roundRect(0.0165, 0.0165, 0.0152, 3.2, 20), drop),
  ], true, true);
  // Display block on top, laser aperture beside the objective, and the
  // ranging button where a thumb finds it.
  hardBox(g, 0.0280, drop + 0.0215, 0, 0.0150, 0.0045, 0.0110);
  hardBox(g, 0.0280, drop + 0.0255, 0, 0.0110, 0.0015, 0.0080);
  spin(g, [[L - 0.0120, 0], [L - 0.0120, 0.0058], [L - 0.0020, 0.0058], [L - 0.0020, 0]],
    14, 36, drop + 0.0120, 0.0110);
  hardBox(g, 0.0140, drop - 0.0120, 0.0175, 0.0055, 0.0050, 0.0030);
  railClamp(g, 0.0420, drop - 0.0155);
}

function buildRangefinderGlass(g) {
  const drop = 0.0190, L = 0.1050;
  hardBox(g, L - 0.0022, drop - 0.0020, 0, 0.0016, 0.0125, 0.0125);
  spin(g, [[L - 0.0032, 0], [L - 0.0032, 0.0046], [L - 0.0022, 0.0046], [L - 0.0022, 0]],
    12, 40, drop + 0.0120, 0.0110);
  hardBox(g, 0.0280, drop + 0.0257, 0, 0.0105, 0.0004, 0.0075);        // the readout
}

function buildScope7x(g) {
  const drop = 0.0230, L = 0.2450, R = 0.0165, bell = 0.0240;
  const rIn = bell * 0.64;
  spin(g, [
    [0.0040, rIn], [L - 0.0020, rIn],
    [L, bell * 0.92], [L - 0.0060, bell], [L - 0.0420, bell],
    [L - 0.0640, R], [0.0520, R], [0.0280, R * 1.06], [0.0040, bell * 0.90],
  ], 26, 34, drop);
  hardBox(g, 0.1250, drop + R + 0.0120, 0, 0.0125, 0.0120, 0.0125);
  hardBox(g, 0.1250, drop, R + 0.0120, 0.0115, 0.0115, 0.0120);
  band(g, 0.0620, 0.0790, R, R + 0.0034, 22, drop);
  knurl(g, 0.0625, 0.0785, R + 0.0035, 24);
  for (const rx of [0.0560, 0.1650]) {
    band(g, rx - 0.0075, rx + 0.0075, R, R + 0.0052, 22, drop);
    railClamp(g, rx, drop - R - 0.0052);
  }
}

function buildScope7xGlass(g) {
  const drop = 0.0230, L = 0.2450, bell = 0.0240;
  const rim = (x0, x1, rI, rO) => spin(g, [[x0, rI], [x1, rI], [x1, rO], [x0, rO]], 24, 40, drop);
  rim(L - 0.0090, L - 0.0060, bell * 0.60, bell * 0.68);
  rim(0.0060, 0.0090, bell * 0.58, bell * 0.66);
}

function buildScope7xReticle(g) {
  const drop = 0.0230, bell = 0.0240, r = bell * 0.56, x = 0.0300;
  const t = 0.00030, thin = 0.0009;
  for (const [dy, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    hardBox(g, x, drop + dy * r * 0.64, dz * r * 0.64, t, dy ? r * 0.36 : thin, dz ? r * 0.36 : thin);
    hardBox(g, x, drop + dy * r * 0.21, dz * r * 0.21, t, dy ? r * 0.21 : t * 1.6, dz ? r * 0.21 : t * 1.6);
  }
  hardBox(g, x, drop, 0, t, 0.00050, 0.00050);
}

/* ---------------- magazines ---------------- */

function buildFastMag(g, o) {
  const wide = (o && o.host) !== 'pistol' ? 1.42 : 1;
  /* A baseplate extension with a pull loop: the part that makes a magazine
     quicker to strip is a handle on the bottom of it, and that is what it
     should look like. */
  sweepPath(g, [
    ax(0, roundRect(0.0060, 0.0060, 0.0125 * wide, 3.2, 18), 0),
    ax(0.0060, roundRect(0.0125, 0.0125, 0.0140 * wide, 3.2, 18), -0.0060),
    ax(0.0300, roundRect(0.0125, 0.0125, 0.0140 * wide, 3.2, 18), -0.0060),
    ax(0.0360, roundRect(0.0060, 0.0060, 0.0125 * wide, 3.2, 18), 0),
  ], true, true);
  // Loop under it.
  const bow = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, a = PI * t;
    bow.push([0.0050 + t * 0.0260, -0.0180 - Math.sin(a) * 0.0130]);
  }
  guardBow(g, bow, 0.0026, 0.0026, 0.0058);
}

/* Extended magazines, and why a submachine gun does not wear a pistol's.
 *
 * There was one of these and it went on everything: a short single-stack
 * box hanging below the well, on the 1911 where it belongs and equally on
 * the MP5, which feeds from a 30-round curved double-stack twice as long
 * and bent to follow the taper of the cartridge. It is the same slot and it
 * is not the same object.
 *
 * A pistol gets a straight single-stack extension. A submachine gun gets a
 * long curved double-stack. A rifle gets a short straight double-stack with
 * a steel floor plate. The rake and the curve are the difference you see
 * from the side, which is the only angle a magazine is ever seen from. */
function buildExtMag(g, o) {
  const host = (o && o.host) || 'pistol';
  const rake = host === 'smg' ? 0.10 : host === 'rifle' ? 0.06 : 0.20;
  const axis = new Vec3(rake, -1, 0).normalize();
  const u = new Vec3().crossVectors(AV, axis).normalize();
  // Width across, depth front-to-back, and how far it hangs.
  const W = host === 'pistol' ? 0.0112 : 0.0165;
  const D = host === 'pistol' ? 0.0150 : host === 'smg' ? 0.0145 : 0.0170;
  const LEN = host === 'smg' ? 0.145 : host === 'rifle' ? 0.078 : 0.062;
  const curve = host === 'smg' ? 0.055 : host === 'rifle' ? 0.012 : 0;
  const st = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const d = -0.004 + t * (LEN + 0.004);
    // The bend, growing with depth, which is what a curved magazine is.
    const bend = curve * t * t;
    const sc = i === 0 ? 1.05 : (i === N ? 1.04 : 1.0);
    st.push({
      o: new Vec3(axis.x * d + bend, axis.y * d, 0), u, v: AV,
      pts: roundRect(D * sc, D * sc, W * sc, 2.9, 20),
    });
  }
  sweepPath(g, st, true, true);
  // Witness holes down the spine, and a floor plate on the double-stacks.
  const holes = host === 'pistol' ? 3 : 5;
  for (let i = 0; i < holes; i++) {
    const t = (i + 1) / (holes + 1);
    const d = t * LEN, bend = curve * t * t;
    strut(g, [axis.x * d + bend, axis.y * d, W - 0.0006],
      [axis.x * d + bend, axis.y * d, W + 0.0010], ringOutline(0.0024, 10));
  }
  if (host !== 'pistol') {
    const d = LEN, bend = curve;
    strut(g, [axis.x * d + bend, axis.y * d, -W - 0.004],
      [axis.x * d + bend, axis.y * d, W + 0.004], roundRect(D * 1.06, D * 1.06, 0.0030, 2.6, 16));
  }
}

function buildDrumMag(g) {
  /* A real drum: a disc on its side, a wound spiral visible through the
     face, a hub, a wind key and the feed tower that meets the well. Two
     stacked cylinders is what it was, and a drum is the one magazine
     nobody will accept as a cylinder. */
  const R = 0.0470, cy = -0.0680;
  strut(g, [0, cy, -0.0165], [0, cy, 0.0165], roundRect(R, R, R, 5.0, 30));
  // Rim band and the face plates.
  for (const z of [-0.0170, 0.0170]) {
    strut(g, [0, cy, z], [0, cy, z + Math.sign(z) * 0.0030], roundRect(R * 0.98, R * 0.98, R * 0.98, 5.0, 30));
  }
  // The spiral, on the right face, where it can be seen.
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const a = t * TAU * 2.1;
    const rr = R * (0.90 - t * 0.52);
    hardBox(g, Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.0205, 0.0042, 0.0042, 0.0018);
  }
  // Hub and wind key.
  strut(g, [0, cy, -0.0230], [0, cy, 0.0230], ringOutline(0.0105, 18));
  hardBox(g, 0, cy, 0.0250, 0.0180, 0.0035, 0.0035);
  // Feed tower up into the magazine well.
  sweepPath(g, [
    ax(0, roundRect(0.0125, 0.0125, 0.0105, 3.0, 18), cy + R - 0.006),
    ax(0.0040, roundRect(0.0140, 0.0140, 0.0118, 3.0, 18), cy + R + 0.014),
    ax(0.0000, roundRect(0.0150, 0.0150, 0.0125, 3.0, 18), cy + R + 0.030),
  ], true, true);
}

/* ---------------- engine hook ---------------- */

/* One geometry per material an attachment needs. Most are a body and
   nothing else; the sights add glass, and the scope adds a reticle. */
const ATT_BUILD = {
  suppressor: { body: (g) => buildSuppressor(g, 0.0046), mat: 'black', bound: 0.20 },
  compensator: { body: (g) => buildCompensator(g, 0.0046), mat: 'steel', bound: 0.08 },
  annihilator: { body: (g) => buildAnnihilator(g, 0.0046), mat: 'black', bound: 0.12 },
  skullsplitter: { body: (g) => buildSkullSplitter(g, 0.0046), mat: 'black', bound: 0.16 },
  longbarrel: { perHost: true, body: (g, o) => buildLongBarrel(g, o.bore, o.host), mat: 'steel', bound: 0.32 },
  shortbarrel: { perHost: true, body: (g, o) => buildShortBarrel(g, o.bore, o.host), mat: 'steel', bound: 0.09 },
  bayonet: { body: buildBayonet, mat: 'bright', bound: 0.20 },
  reddot: { body: buildRedDot, glass: buildRedDotGlass, glassMat: 'glassR', mat: 'black', bound: 0.09 },
  thermal: { body: buildThermal, glass: buildThermalGlass, glassMat: 'glassG', mat: 'poly', bound: 0.14 },
  nightvision: { body: buildNightVision, glass: buildNightVisionGlass, glassMat: 'glassG', mat: 'black', bound: 0.15 },
  rangefinder: { body: buildRangefinder, glass: buildRangefinderGlass, glassMat: 'glassR', mat: 'poly', bound: 0.13 },
  scope7x: { body: buildScope7x, glass: buildScope7xGlass, glassMat: 'lens',
    reticle: buildScope7xReticle, mat: 'black', bound: 0.27 },
  fastmag: { perHost: true, body: (g, o) => buildFastMag(g, o), mat: 'steel', bound: 0.06 },
  extmag: { perHost: true, body: buildExtMag, mat: 'black', bound: 0.09 },
  drummag: { body: buildDrumMag, mat: 'black', bound: 0.12 },
};

/* Spawn one attachment as a small group. `tint` paints every piece at
   once, so a chalk outline or an upgraded gun's camo is one argument. */
Engine.prototype.gunPart = function (id, opts = {}) {
  const D = ATT_BUILD[id];
  if (!D) return null;
  /* Which weapon it is going on, and how big that weapon's bore is.
   *
   * Every attachment used to be built once and hung on everything, so a
   * pistol's long barrel was a rifle's long barrel and an MP5 wore a
   * pistol's magazine. The parts that CARE about the host build a version
   * for it; the ones that do not -- an optic is an optic -- fall back to a
   * single shared model and the same cache key they always had. */
  const host = opts.host || 'pistol';
  const bore = opts.bore || 0.0046;
  const varies = !!D.perHost;
  const key = 'att:' + id + (varies ? ':' + host + ':' + bore.toFixed(4) : '');
  const build = { host, bore };
  const parts = armCache(this, key, () => {
    const out = { body: new Geometry() };
    D.body(out.body, build);
    if (D.glass) { out.glass = new Geometry(); D.glass(out.glass, build); }
    if (D.reticle) { out.reticle = new Geometry(); D.reticle(out.reticle, build); }
    for (const k of Object.keys(out)) out[k].finalize();
    return out;
  });
  const mats = {
    body: opts.tint || ATT_MAT[D.mat],
    glass: opts.tint || ATT_MAT[D.glassMat || 'lens'],
    reticle: opts.tint || ATT_MAT.glassR,
  };
  /* physics off by default, because an attachment is normally bolted to a
     gun and inherits its motion -- but the caller can ask for a body, which
     is how a drum magazine dropped during a reload falls on the floor as
     itself rather than as a generic grey brick. */
  return mountArm(this, key, parts, mats,
    Object.assign({ physics: false }, opts), D.bound, 0.2, 'body');
};
