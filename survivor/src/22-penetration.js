/* ============================================================
   PENETRATION — what a bullet does after it stops being in the air.

   A wall in this game is not a surface with a "penetrable" flag. It
   is a stack of layers with thicknesses and materials, and a round
   arrives at each one with whatever velocity the previous one left
   it. That is why a .308 goes through an interior partition and out
   the far side of the room, a 9mm makes it through and arrives
   tumbling and weak, and a .22 buries itself in the second sheet of
   gypsum.

   The model is Poncelet's: the resisting force on a penetrator is a
   strength term that does not care how fast you are going plus an
   inertial term that cares enormously.

       F = A_eff * (R_t + 0.5 * rho * Cd * v^2)

   integrated along the path. The strength term dominates in steel and
   concrete; the inertial term dominates in tissue and water. That
   single expression is why armour is rated in thickness and why
   penetration in flesh barely improves with velocity.

   The part that makes it agree with real terminal-ballistics results
   is A_eff. A bullet that is still point-forward presents its nose;
   one that has begun to yaw presents its side, which for a rifle
   spitzer is five times the area. Yaw is why a .308 and a 9mm reach
   nearly the same depth in gelatin despite a sevenfold difference in
   energy, and why the second wall is always harder than the first.
   ============================================================ */

/* rho in kg/m^3, R_t in Pa.

   R_t is the dynamic cavity-expansion resistance, not the handbook
   compressive strength — it runs several times higher, because the
   material is being opened in microseconds rather than crushed in a
   press. The values here were fitted to published penetration results,
   and the fits are in survivor/test/ballistics.test.js so they can be
   rechecked rather than trusted.                                        */
const PEN_MATERIAL = {
  air:              { id: 'air', density: 1.225, Rt: 0, cd: 1.0 },
  gypsum:           { id: 'gypsum', density: 700, Rt: 4.0e7, cd: 1.0, brittle: true },
  paperFacing:      { id: 'paperFacing', density: 800, Rt: 4e6, cd: 1.0 },
  fiberglassBatt:   { id: 'fiberglassBatt', density: 16, Rt: 6e4, cd: 1.2 },
  pineStud:         { id: 'pineStud', density: 500, Rt: 3.6e7, cd: 1.0, splinters: true },
  hardwood:         { id: 'hardwood', density: 750, Rt: 8.5e7, cd: 1.0, splinters: true },
  plywood:          { id: 'plywood', density: 600, Rt: 4.8e7, cd: 1.0, splinters: true },
  osb:              { id: 'osb', density: 640, Rt: 5.2e7, cd: 1.0, splinters: true },
  greenTrunk:       { id: 'greenTrunk', density: 900, Rt: 6.5e7, cd: 1.0, splinters: true },
  vinylSiding:      { id: 'vinylSiding', density: 1400, Rt: 1.8e7, cd: 1.0, brittle: true },
  houseWrap:        { id: 'houseWrap', density: 900, Rt: 3e6, cd: 1.0 },
  asphaltShingle:   { id: 'asphaltShingle', density: 1100, Rt: 1.4e7, cd: 1.0 },
  glass:            { id: 'glass', density: 2500, Rt: 1.0e8, cd: 1.0, hardnessPa: 4.0e8, brittle: true, shatters: true },
  temperedGlass:    { id: 'temperedGlass', density: 2500, Rt: 1.3e8, cd: 1.0, hardnessPa: 5.0e8, brittle: true, shatters: true },
  brick:            { id: 'brick', density: 1900, Rt: 1.9e8, cd: 1.0, hardnessPa: 2.6e8, brittle: true },
  cinderBlockWeb:   { id: 'cinderBlockWeb', density: 1400, Rt: 1.2e8, cd: 1.0, hardnessPa: 2.0e8, brittle: true },
  concrete:         { id: 'concrete', density: 2350, Rt: 2.2e8, cd: 1.0, hardnessPa: 3.0e8, brittle: true },
  reinforcedConcrete:{ id: 'reinforcedConcrete', density: 2450, Rt: 3.4e8, cd: 1.0, hardnessPa: 4.2e8, brittle: true },
  sheetSteel:       { id: 'sheetSteel', density: 7850, Rt: 9.0e8, cd: 1.0, hardnessPa: 1.1e9 },
  mildSteel:        { id: 'mildSteel', density: 7850, Rt: 1.20e9, cd: 1.0, hardnessPa: 1.5e9 },
  armourSteel:      { id: 'armourSteel', density: 7850, Rt: 2.6e9, cd: 1.0, hardnessPa: 4.2e9 },
  aluminium:        { id: 'aluminium', density: 2700, Rt: 4.0e8, cd: 1.0, hardnessPa: 6e8 },
  soil:             { id: 'soil', density: 1500, Rt: 2.0e7, cd: 1.1 },
  sand:             { id: 'sand', density: 1600, Rt: 4.0e7, cd: 1.1 },
  sandbag:          { id: 'sandbag', density: 1550, Rt: 3.6e7, cd: 1.1 },
  water:            { id: 'water', density: 998, Rt: 2e4, cd: 1.0 },
  ice:              { id: 'ice', density: 917, Rt: 4.5e7, cd: 1.0, brittle: true },
  snowpack:         { id: 'snowpack', density: 300, Rt: 1.2e6, cd: 1.0 },
  brush:            { id: 'brush', density: 120, Rt: 1.2e6, cd: 1.2, deflects: true },
  /* Tissue. 10% ordnance gelatin is the standard proxy and is what every
     published penetration figure is measured in, so it is the calibration
     target rather than an approximation of one. Its strength term is tiny:
     penetration in flesh is almost purely inertial, which is precisely why
     it improves so little with velocity and so much with sectional density. */
  gelatin:          { id: 'gelatin', density: 1030, Rt: 2.2e5, cd: 1.0, tissue: true },
  muscle:           { id: 'muscle', density: 1060, Rt: 3.0e5, cd: 1.0, tissue: true },
  lung:             { id: 'lung', density: 400, Rt: 1.2e5, cd: 1.0, tissue: true },
  bone:             { id: 'bone', density: 1900, Rt: 1.4e8, cd: 1.0, hardnessPa: 3e8, brittle: true, tissue: true },
  hide:             { id: 'hide', density: 1100, Rt: 1.2e7, cd: 1.0, tissue: true },
    /* Woven aramid does not resist by cavity expansion at all — it catches the
     round in a tensioned web and spreads the load across the weave. The
     lumped resistance that reproduces its rated performance is far higher
     than the fibre's bulk strength, which is why a 7 mm pad stops a 9mm and
     70 mm of pine does not. */
  kevlarSoft:       { id: 'kevlarSoft', density: 1440, Rt: 1.8e9, cd: 1.0, fabric: true, hardnessPa: 4e8 },
  ceramicPlate:     { id: 'ceramicPlate', density: 3800, Rt: 3.0e9, cd: 1.0, hardnessPa: 1.4e10, brittle: true, shatters: true },
};

/* How hard the thing doing the penetrating is. This is the property that
   decides whether a bullet goes through steel or splashes off it, and it
   has almost nothing to do with how much energy it carries: a 9mm and an
   M855 differ by a factor of three in energy and a factor of twenty in what
   they will do to a steel plate, because one has a lead core and the other
   has a hardened steel one. Values are dynamic flow strength in Pa. */
const CORE_STRENGTH = {
  lead:      6.0e7,    // unjacketed soft lead: .22 LR, buckshot, cast bullets
  leadFmj:   1.1e8,    // copper-jacketed lead core: most ball ammunition
  bonded:    1.6e8,    // bonded hunting bullets, built to hold together
  steelCore: 7.0e8,    // M855, mild-steel-cored 7.62x39
  ap:        1.4e9,    // hardened steel armour-piercing
  tungsten:  3.0e9,    // the expensive answer
};

/* Bullet behaviour in a medium: how readily it turns sideways, and how much
   bigger it gets when it does.

   `yawLengthM` is the distance in gelatin over which a bullet goes from
   point-forward to fully broadside. A long pointed rifle bullet has its
   centre of pressure well ahead of its centre of gravity and turns over in
   ten or fifteen centimetres. A stubby round-nose pistol bullet often never
   turns over at all, which is exactly why it keeps going.                  */
function bulletDynamics(projectile) {
  const c = projectile.cartridge;
  // Length is not printed on a box; it is set by mass, calibre and lead's
  // density, and this recovers it to within a millimetre or two.
  const lengthM = (projectile.massKg / (11340 * 0.82))
    / (Math.PI * projectile.diameterM * projectile.diameterM / 4);
  const ld = lengthM / projectile.diameterM;

  // Broadside area over nose area for a cylinder of this proportion.
  const broadsideRatio = (4 * ld) / Math.PI;

  /* Slender, pointed bullets turn over soonest, and the dependence is
     brutally steep: a 3-calibre spitzer is broadside inside fifteen
     centimetres of tissue while a 1.4-calibre round-nose pistol bullet
     never turns over at all inside a human being. Calibrated so that the
     published gelatin depths for both come out right — which they cannot,
     with any single drag law, unless yaw is in the model. */
  let yawLengthM = 0.75 / Math.pow(Math.max(ld - 1.15, 0.05), 1.095);
  if (c.expands) yawLengthM = 999;           // an expanding bullet upsets rather than yaws
  if (c.pellets) yawLengthM = 999;           // spheres have no orientation to lose

  return {
    lengthM, ld, broadsideRatio, yawLengthM,
    coreStrengthPa: CORE_STRENGTH[c.core || 'leadFmj'],
    // A hollow point opens to about 1.55x calibre in tissue, so about 2.4x
    // frontal area, and it does it in the first few centimetres.
    expansionArea: c.expands ? 2.4 : 1.0,
    fragments: !!c.fragments,
    fragmentThresholdMs: c.fragmentThresholdMs || 0,
  };
}

/* One material layer in a target stack. */
function layer(materialId, thicknessM, opts = {}) {
  const m = PEN_MATERIAL[materialId];
  if (!m) throw new Error(`unknown material: ${materialId}`);
  return Object.assign({ material: m, thicknessM, obliquityDeg: 0 }, opts);
}

/* ------------------------------------------------------------------
   Drive a projectile through a stack of layers.

   Returns the exit velocity from every layer, where it stopped if it
   stopped, and the state it is in when it comes out the far side —
   because a round that arrives tumbling and subsonic after two walls
   is a different threat from the one that was fired.
   ------------------------------------------------------------------ */
function penetrate(projectile, layers, opts = {}) {
  const dyn = opts.dynamics || bulletDynamics(projectile);
  let v = opts.impactVelocityMs != null ? opts.impactVelocityMs : projectile.muzzleMs;
  const m0 = projectile.massKg;
  let mass = m0;
  const noseArea = projectile.areaM2;

  let yaw = opts.initialYaw || 0;        // 0 = point on, 1 = fully broadside
  let expanded = false;
  let fragmented = false;
  let mushroom = 1;                      // frontal area growth from deformation
  let eroded = 0;                        // fraction of the penetrator lost
  const results = [];

  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    const mat = L.material;
    // Hitting at an angle means more material in the way, by the secant of
    // the obliquity — a wall struck at 60 degrees is twice as thick.
    const obliq = clampTo(L.obliquityDeg || 0, 0, 85) * Math.PI / 180;
    const path = L.thicknessM / Math.max(0.15, Math.cos(obliq));
    const entryV = v;

    if (v <= 1 || mass <= 0) {
      results.push({ layer: li, material: mat.id, entryMs: entryV, exitMs: 0, stopped: true, penetratedM: 0 });
      break;
    }

    // March through the layer. Small steps because yaw, expansion and
    // fragmentation all change the effective area as it goes, and a single
    // closed-form solve would have to assume none of them happen.
    // Resolve the penetrator, not the layer: erosion and mushrooming happen
    // over a fraction of the bullet's own length, and against steel the whole
    // event is over in a few millimetres. Long soft-target tracks cost more
    // steps but the loop exits the moment the round stops.
    const dxTarget = Math.min(0.004, Math.max(dyn.lengthM / 12, 0.0004));
    const steps = clampTo(Math.ceil(path / dxTarget), 8, 4000);
    const dx = path / steps;
    let travelled = 0;
    let stopped = false;

    for (let i = 0; i < steps; i++) {
      if (mat.tissue && projectile.cartridge.expands && !expanded && travelled > 0.02) {
        expanded = true;
      }
      if (dyn.fragments && !fragmented && mat.tissue && v > dyn.fragmentThresholdMs) {
        // Above its fragmentation threshold a thin-jacketed round comes
        // apart, which shortens penetration and vastly widens the wound.
        // Below it, the same bullet behaves like an ice pick.
        fragmented = true;
        mass *= 0.75;
      }

      // Yaw develops in proportion to the medium's density relative to
      // gelatin — nothing turns over in air, everything turns over in steel.
      if (dyn.yawLengthM < 100 && yaw < 1) {
        const rate = (mat.density / 1030) / dyn.yawLengthM;
        yaw = Math.min(1, yaw + rate * dx);
      }

      /* Deformation and erosion.

         The pressure at the nose of a penetrator is the stagnation
         pressure of the material flowing past it. While that stays under
         the penetrator's own flow strength the bullet holds its shape and
         Poncelet alone describes it. Once it exceeds that strength the
         bullet starts behaving like a fluid: it mushrooms, which multiplies
         its frontal area, and it erodes, which takes away the mass that was
         doing the pushing. Both effects run away with velocity.

         This is the whole reason a lead-cored bullet cannot defeat steel
         at any sane muzzle velocity while a hardened steel core can, and
         why hard targets are so much more about what the bullet is made of
         than about how much energy it has. */
      /* The pressure that can actually be brought to bear on the nose is
         limited by what the target is able to withstand: a fluid cannot
         push back harder than it can hold together, however fast you drive
         through it. So the driver is the smaller of the stagnation pressure
         and the target's own dynamic hardness.

         Getting this wrong the other way round — using stagnation pressure
         alone — makes a rifle bullet erode away inside ballistic gelatin,
         where in reality it comes out the far side barely marked. */
      const abrasive = mat.hardnessPa != null ? mat.hardnessPa : mat.Rt;
      const stagnation = Math.min(0.5 * mat.density * v * v, abrasive);
      if (stagnation > dyn.coreStrengthPa) {
        const excess = stagnation / dyn.coreStrengthPa - 1;
        const perLength = dx / Math.max(dyn.lengthM, 1e-4);
        mushroom = Math.min(6, mushroom + excess * perLength * 0.55);
        const loss = Math.min(0.4, excess * perLength * 0.30);
        mass *= (1 - loss);
        eroded += loss;
        if (mass < m0 * 0.12) { v = 0; stopped = true; break; }
      }

      const areaMul = (expanded ? dyn.expansionArea : 1)
        * (1 + yaw * (dyn.broadsideRatio - 1))
        * (fragmented ? 1.35 : 1)
        * mushroom;
      const aEff = noseArea * areaMul;

      /* Integrate in v-squared, where the equation of motion is linear and
         has a closed form:

             d(v^2)/dx = -(2 A / m) (R_t + K v^2),  K = rho Cd / 2
             v^2(x+dx) = (v^2 + R_t/K) e^(-2 A K dx / m) - R_t/K

         Stepping v directly with forward Euler loses a third of the depth
         over a long track in soft tissue, because the retarding force falls
         as the bullet slows and Euler keeps charging the entry-speed rate
         for the whole step. This form is exact for constant area over the
         step, so the step size only has to be short enough to resolve yaw
         and erosion — not the velocity decay. */
      const K = 0.5 * mat.density * mat.cd;
      const u = v * v;
      let uNext;
      if (K > 1e-9) {
        const c = mat.Rt / K;
        uNext = (u + c) * Math.exp((-2 * aEff * K * dx) / mass) - c;
      } else {
        uNext = u - (2 * aEff * mat.Rt * dx) / mass;
      }
      if (uNext <= 0) {
        // Stopped inside this step. Solve for where.
        const frac = K > 1e-9
          ? (mass / (2 * aEff * K)) * Math.log((u + mat.Rt / K) / (mat.Rt / K)) / dx
          : (u * mass) / (2 * aEff * mat.Rt * dx);
        travelled += dx * clamp01(frac);
        v = 0; stopped = true; break;
      }
      v = Math.sqrt(uNext);
      travelled += dx;
    }

    results.push({
      layer: li, material: mat.id, entryMs: entryV, exitMs: v,
      stopped, penetratedM: travelled,
      energyLostJ: 0.5 * mass * (entryV * entryV - v * v),
      yaw, expanded, fragmented, mushroom, erodedFraction: eroded,
      // Spall: a brittle layer that is perforated throws its own fragments
      // out the back, which is why concrete and glass hurt people who were
      // only standing near the wall.
      spall: !stopped && mat.brittle && entryV > 250,
      shattered: !stopped && !!mat.shatters,
    });

    if (stopped) break;
  }

  const last = results[results.length - 1];
  const exitMs = last && !last.stopped ? last.exitMs : 0;
  const perforated = !!(last && !last.stopped && results.length === layers.length);

  return {
    layers: results,
    perforated,
    exitVelocityMs: exitMs,
    exitEnergyJ: 0.5 * mass * exitMs * exitMs,
    exitMassKg: mass,
    yaw, expanded, fragmented, mushroom, erodedFraction: eroded,
    stoppedInLayer: last && last.stopped ? last.layer : null,
    // What the round is capable of on the far side. A bullet that has lost
    // its point-forward flight is far less able to penetrate the next thing.
    residualPenetrationClass: exitMs === 0 ? 'stopped'
      : exitMs < 120 ? 'spent'
      : yaw > 0.5 ? 'tumbling'
      : exitMs < 340 ? 'weakened' : 'effective',
  };
}

/* Depth reached in an unbounded medium — the number every published gelatin
   result is quoted as. */
function penetrationDepth(projectile, materialId, opts = {}) {
  const res = penetrate(projectile, [layer(materialId, opts.maxDepthM || 2.0)], opts);
  const l = res.layers[0];
  return l.stopped ? l.penetratedM : (opts.maxDepthM || 2.0);
}

/* ------------------------------------------------------------------
   Standard wall build-ups. These are the actual assemblies, in order,
   because the whole point is that a wall is a stack and not a number.
   ------------------------------------------------------------------ */
const IN = UNIT.INCH_M;

const ASSEMBLY = {
  /* An interior partition: paper, gypsum, cavity, gypsum, paper. This is
     the one the design calls out, and it is the one you can shoot a person
     through without ever seeing them. */
  interiorPartition: () => [
    layer('paperFacing', 0.0004), layer('gypsum', 0.5 * IN), layer('paperFacing', 0.0004),
    layer('air', 3.5 * IN),
    layer('paperFacing', 0.0004), layer('gypsum', 0.5 * IN), layer('paperFacing', 0.0004),
  ],
  /* Through a stud rather than the cavity — the 16-inch spacing means about
     one shot in four hits wood, and that shot arrives noticeably slower. */
  interiorPartitionThroughStud: () => [
    layer('paperFacing', 0.0004), layer('gypsum', 0.5 * IN), layer('paperFacing', 0.0004),
    layer('pineStud', 3.5 * IN),
    layer('paperFacing', 0.0004), layer('gypsum', 0.5 * IN), layer('paperFacing', 0.0004),
  ],
  /* Exterior wall of a typical frame house: siding, sheathing, insulated
     cavity, drywall. */
  exteriorFrameWall: () => [
    layer('vinylSiding', 0.045 * IN), layer('houseWrap', 0.01 * IN),
    layer('osb', 0.5 * IN), layer('fiberglassBatt', 3.5 * IN),
    layer('paperFacing', 0.0004), layer('gypsum', 0.5 * IN), layer('paperFacing', 0.0004),
  ],
  exteriorBrickVeneer: () => [
    layer('brick', 3.5 * IN), layer('air', 1 * IN), layer('houseWrap', 0.01 * IN),
    layer('osb', 0.5 * IN), layer('fiberglassBatt', 3.5 * IN), layer('gypsum', 0.5 * IN),
  ],
  cinderBlockWall: () => [
    layer('concrete', 1.25 * IN), layer('cinderBlockWeb', 5.5 * IN), layer('concrete', 1.25 * IN),
  ],
  concreteWall: (inches = 8) => [layer('concrete', inches * IN)],
  window: () => [layer('glass', 0.125 * IN), layer('air', 0.5 * IN), layer('glass', 0.125 * IN)],
  woodDoor: () => [layer('hardwood', 0.25 * IN), layer('air', 1.0 * IN), layer('hardwood', 0.25 * IN)],
  steelDoor: () => [layer('sheetSteel', 0.03 * IN), layer('fiberglassBatt', 1.5 * IN), layer('sheetSteel', 0.03 * IN)],
  carDoor: () => [layer('sheetSteel', 0.032 * IN), layer('air', 3 * IN), layer('sheetSteel', 0.032 * IN)],
  carWindscreen: () => [layer('glass', 0.1 * IN), layer('houseWrap', 0.03 * IN), layer('glass', 0.1 * IN)],
  softArmourIIIA: () => [layer('kevlarSoft', 0.28 * IN)],
  plateCarrierIV: () => [layer('ceramicPlate', 0.35 * IN), layer('kevlarSoft', 0.28 * IN)],
  sandbagWall: (inches = 12) => [layer('sandbag', inches * IN)],
  /* A torso, front to back, for terminal effect on the other side of
     whatever the round has already been through. */
  torso: () => [
    layer('hide', 0.08 * IN), layer('muscle', 1.2 * IN), layer('bone', 0.4 * IN),
    layer('lung', 5 * IN), layer('bone', 0.4 * IN), layer('muscle', 1.2 * IN), layer('hide', 0.08 * IN),
  ],
  deerChest: () => [
    layer('hide', 0.12 * IN), layer('muscle', 1.5 * IN), layer('bone', 0.3 * IN),
    layer('lung', 7 * IN), layer('bone', 0.3 * IN), layer('muscle', 1.5 * IN), layer('hide', 0.12 * IN),
  ],
  /* A grizzly's shoulder is the reason people argue about calibre. */
  grizzlyShoulder: () => [
    layer('hide', 0.5 * IN), layer('muscle', 4 * IN), layer('bone', 1.2 * IN),
    layer('lung', 9 * IN), layer('bone', 0.8 * IN), layer('muscle', 4 * IN), layer('hide', 0.5 * IN),
  ],
};

/* ------------------------------------------------------------------
   Wound severity from what actually arrived.

   Permanent cavity scales with the presented area along the track;
   temporary cavity — the stretch that only damages inelastic tissue —
   scales with the energy actually deposited. Keeping them separate is
   why this can tell the difference between a .22 through the liver and
   a fragmenting 5.56 through the same liver.
   ------------------------------------------------------------------ */
function woundSeverity(projectile, penResult, regionId) {
  const track = penResult.layers.filter((l) => PEN_MATERIAL[l.material].tissue);
  if (!track.length) return { severity: 0, permanentCm3: 0, temporaryCm3: 0, throughAndThrough: false };

  let depositedJ = 0, pathM = 0;
  for (const l of track) { depositedJ += l.energyLostJ; pathM += l.penetratedM; }

  const areaMul = (penResult.expanded ? 3.2 : 1)
    * (1 + penResult.yaw * 4) * (penResult.fragmented ? 1.5 : 1);
  const permanentCm3 = projectile.areaM2 * areaMul * pathM * 1e6;
  // Only energy above roughly 300 J does meaningful stretch damage; below
  // that the tissue simply moves and comes back.
  const temporaryCm3 = Math.max(0, depositedJ - 300) * 0.9;

  const region = BODY_REGION[regionId] || BODY_REGION.thorax;
  const severity = clamp01(
    (permanentCm3 / 60) * (region.vital ? 1.6 : 0.7)
    + (temporaryCm3 / 2600) * (region.vital ? 1.1 : 0.35),
  );

  return {
    severity,
    permanentCm3, temporaryCm3, depositedJ, trackLengthM: pathM,
    throughAndThrough: penResult.perforated,
    // A through-and-through leaves two holes and takes its energy with it;
    // a bullet that stops inside dumps everything it had.
    bleedMultiplier: 1 + (penResult.perforated ? 0.8 : 0) + penResult.yaw * 0.6,
  };
}
