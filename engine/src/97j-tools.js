/* ============================================================
   TOOLS — the things you hold that are not weapons
   ============================================================
   A pair of lineman's pliers and a gas torch, built the same way and
   to the same conventions as every arm in 97a: the long axis is +X,
   the origin sits in the web of the firing hand, and the parts come
   back named so the game can move them.

   They exist because an interaction that takes twenty seconds and
   holds you still has to show you SOMETHING. Search and Destroy asks
   a man to cut a padlock and then to weld it back on, and until these
   were built he did both while holding a rifle -- which is the same
   fault as the crank lever you could walk away from, one layer up: the
   game says one thing and the picture says another.

   Both are ONE HANDED and short. A viewmodel prop that reaches as far
   forward as a rifle fills the screen, and the whole point of the
   moment is that the player can see the tank he is working on.
   ============================================================ */

/* ---------------- wire cutters ---------------- */

/* Real lineman's pliers are about 200 mm overall with the pivot a third
   of the way up. Held, the handles run back into the fist and only the
   head is forward of it, which is why the origin is near the pivot
   rather than at the back of the handles. */
const PLIER = {
  pin: 0.0180,          // where the two halves turn about, on X
  jaw: 0.0760,          // the tip
  handle: -0.1050,      // the end of the grips
  half: 0.0062,         // half the thickness of one half, in Z
  gap: 0.0016,          // the two halves do not occupy the same metal
};

const PLIER_ORIGIN = new Vec3(-0.0460, -0.0080, 0);

/* One half of the tool: a jaw forward of the pin and a handle behind it,
   built about the pin so the actor can turn on it. `side` is -1 or +1,
   which puts this half on its own side of the joint in Z. */
function buildPlierHalf(g, side) {
  const P = PLIER;
  const z = side * (P.half + P.gap * 0.5);

  /* THE JAW. Deep at the pin and tapering to the cutting edge, with the
     edge itself a thin wedge -- a jaw of constant thickness reads as a
     spanner. Built as three boxes rather than a swept profile because
     the taper is in two planes at once and a box stack is honest about
     where the facets are. */
  hardBox(g, (P.pin + 0.0120) / 1, 0.0020, z, 0.0150, 0.0135, P.half);
  hardBox(g, 0.0430, 0.0010, z, 0.0170, 0.0100, P.half * 0.92);
  hardBox(g, 0.0660, 0.0002, z, 0.0110, 0.0062, P.half * 0.80);
  // The cutting edge, on the inside face: a shallow wedge at the throat.
  hardBox(g, 0.0300, -0.0090, side * P.gap * 0.5, 0.0075, 0.0026, P.half * 0.34);

  /* THE PIN BOSS. A round swelling where the two halves cross, because
     the joint of a pair of pliers is the thickest part of it. */
  spin(g, [
    [z - P.half, 0], [z - P.half, 0.0148], [z + P.half, 0.0148], [z + P.half, 0],
  ], 18, 26);
  // spin() revolves about X, so the boss above is built about the wrong
  // axis for a pin that runs in Z. Done as a short tube in Z instead.
  tubeRunZ(g, P.pin, 0.0000, z - P.half, z + P.half, 0.0150, 18);

  /* THE HANDLE, running back and down into the fist, and swelling at
     the end so it cannot slide out of a closed hand. */
  const a = [P.pin - 0.0060, -0.0040, z];
  const b = [-0.0380, -0.0150, z * 1.35];
  const c = [P.handle, -0.0250, z * 1.65];
  strut(g, a, b, ringOutline(0.0068, 12));
  strut(g, b, c, ringOutline(0.0062, 12));
}

/* The rubber over the handles, as its own part so it can be its own
   material. Two sleeves, one per half. */
function buildPlierGrip(g, side) {
  const P = PLIER;
  const z = side * (P.half + P.gap * 0.5);
  const b = [-0.0330, -0.0140, z * 1.30];
  const c = [P.handle + 0.0060, -0.0244, z * 1.62];
  strut(g, b, c, ringOutline(0.0112, 14));
  // A collar at each end, so the sleeve has ends instead of stopping.
  strut(g, b, [b[0] - 0.006, b[1] - 0.0004, b[2] * 1.01], ringOutline(0.0126, 14));
  strut(g, [c[0] + 0.008, c[1] + 0.0006, c[2] * 0.99], c, ringOutline(0.0126, 14));
}

/* A tube whose axis runs in Z rather than X. The arms toolkit is built
   around +X because every barrel is, and a hinge pin is the one thing
   in a hand tool that is not. */
function tubeRunZ(g, x, y, z0, z1, r, seg = 16) {
  const U = new Vec3(1, 0, 0), V = new Vec3(0, 1, 0);
  const ring = ringOutline(r, seg);
  sweepPath(g, [
    { o: new Vec3(x, y, z0), u: U, v: V, pts: ring },
    { o: new Vec3(x, y, z1), u: U, v: V, pts: ring },
  ], true, true);
}

Engine.prototype.wireCutters = function (opts = {}) {
  const parts = armCache(this, 'cutters', () => {
    const upper = new Geometry(); buildPlierHalf(upper, -1);
    const lower = new Geometry(); buildPlierHalf(lower, 1);
    const grip = new Geometry();
    buildPlierGrip(grip, -1); buildPlierGrip(grip, 1);
    /* Both halves turn about the pin, so both get it as their pivot.
       Without it each half would swing about the model origin, which is
       in the palm -- the jaws would scythe rather than bite. */
    const pin = new Vec3(PLIER.pin, 0, 0);
    return fin({ upper, lower, grip }, PLIER_ORIGIN, { upper: pin, lower: pin });
  });
  const body = mountArm(this, 'cutters', parts,
    { upper: ARM_MAT.bright, lower: ARM_MAT.bright, grip: ARM_MAT.rubber },
    opts, 0.13, 0.5, 'upper');
  /* No bore and no sights. muzzleAt is read by anything that wants the
     working end -- here that is the cutting edge, which is where the
     sparks come from. */
  body.muzzleAt = PLIER.jaw - PLIER_ORIGIN.x;
  body.boreAt = -PLIER_ORIGIN.y;
  body.tool = true;
  /* HOW FAR THE JAWS OPEN, in radians, and which way each half turns.
     Published rather than hardcoded in the game, because the game is
     what animates the bite and it must not have to guess. */
  body.biteAxis = [0, 0, 1];
  body.biteOpen = 0.30;
  /* WHERE IT IS HELD, in the viewmodel's own right/up/forward metres.
     Up and in against the work, not down at the hip where a rifle
     rides -- a tool at rifle height is a speck in the bottom corner.
     Read by the viewmodel; see the note there. */
  body.holdAt = [0.082, -0.108, 0.315];
  body.holdTip = 0.45;
  return body;
};

/* ---------------- the blowtorch ---------------- */

const TORCH = {
  bottle: -0.0850,      // back of the gas bottle
  neck: 0.0150,         // where the valve sits
  tip: 0.1450,          // the nozzle face
  r: 0.0270,            // bottle radius
};

const TORCH_ORIGIN = new Vec3(-0.0300, -0.0120, 0);

function buildTorchBottle(g) {
  const T = TORCH;
  /* A disposable gas cylinder: domed at the bottom, a rolled rim at the
     top, and a waist where the valve screws on. */
  spin(g, [
    [T.bottle, 0], [T.bottle + 0.0060, T.r * 0.72], [T.bottle + 0.0170, T.r],
    [-0.0180, T.r], [-0.0130, T.r * 0.97], [-0.0090, T.r * 0.62],
    [T.neck - 0.0040, T.r * 0.40], [T.neck, T.r * 0.34], [T.neck, 0],
  ], 22, 30);
  // The rolled seam round the middle, which is what says "pressed tin".
  band(g, -0.0460, -0.0424, T.r, T.r + 0.0022, 22);
}

function buildTorchHead(g) {
  const T = TORCH;
  // Valve body, knurled adjuster, and the mixing tube out to the nozzle.
  tubeRun(g, [[T.neck - 0.0020, 0.0170], [T.neck + 0.0180, 0.0170]], 18);
  tubeRun(g, [[T.neck + 0.0180, 0.0092], [T.tip - 0.0180, 0.0092]], 16);
  // The nozzle: a flared cup with the air holes behind it.
  spin(g, [
    [T.tip - 0.0180, 0], [T.tip - 0.0180, 0.0104], [T.tip - 0.0050, 0.0150],
    [T.tip, 0.0166], [T.tip, 0.0120], [T.tip - 0.0060, 0.0104],
    [T.tip - 0.0180, 0.0072], [T.tip - 0.0180, 0],
  ], 20, 30);
  /* The adjusting knob, off to the side on its own stem, because a torch
     with no control on it is a pipe. */
  const s = [T.neck + 0.0060, -0.0100, 0.0160];
  strut(g, [T.neck + 0.0060, -0.0060, 0.0100], s, ringOutline(0.0034, 10));
  strut(g, s, [T.neck + 0.0060, -0.0128, 0.0206], ringOutline(0.0086, 14));
}

/* The flame, as its own part so it can be switched on and scaled. A
   blue cone inside a longer soft one -- a single cone reads as a
   traffic bollard. */
function buildTorchFlame(g) {
  const T = TORCH;
  spin(g, [
    [T.tip + 0.0010, 0], [T.tip + 0.0050, 0.0092], [T.tip + 0.0230, 0.0062],
    [T.tip + 0.0360, 0], [T.tip + 0.0010, 0],
  ], 16, 20);
}

Engine.prototype.blowtorch = function (opts = {}) {
  const parts = armCache(this, 'torch', () => {
    const bottle = new Geometry(); buildTorchBottle(bottle);
    const head = new Geometry(); buildTorchHead(head);
    const flame = new Geometry(); buildTorchFlame(flame);
    return fin({ bottle, head, flame }, TORCH_ORIGIN);
  });
  const body = mountArm(this, 'torch', parts,
    { bottle: ARM_MAT.lacquer, head: ARM_MAT.bright, flame: ARM_MAT.glow },
    opts, 0.19, 1.1, 'bottle');
  body.muzzleAt = TORCH.tip - TORCH_ORIGIN.x;
  body.boreAt = -TORCH_ORIGIN.y;
  body.tool = true;
  /* Off until it is lit. A torch that is burning in the loadout screen
     is a torch nobody ever turned on. */
  if (body.flame) body.flame.visible = false;
  body.holdAt = [0.090, -0.120, 0.345];
  body.holdTip = 0.50;
  return body;
};
