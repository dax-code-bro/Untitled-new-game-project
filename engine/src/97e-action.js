/* WHAT A WEAPON'S ACTION DOES, in one place, for both games.
 *
 * Bunker Nine had a table like this and drove eight moving parts off it.
 * Multiplayer built the SAME weapons -- the same serviceArm, with the
 * same bolt, cylinder, hammer, cover and belt hanging off it -- and drove
 * none of them: seventy-five guns firing with a dead receiver. Counted,
 * not guessed: every one of `bolt`, `cylinder`, `hammer`, `cover`,
 * `belt`, `forend` and `swing` appears zero times in mp-game.js.
 *
 * So the table and the posing live here now, where the engine that
 * builds the parts can be asked what to do with them, and both games
 * call the same function. A mechanism that only half the game animates
 * is a mechanism that will drift.
 *
 * WHICH PARTS EXIST, measured across all 81 models:
 *   bolt only ................ 78
 *   bolt + cover + belt ...... 1   (MG42)
 *   cylinder + hammer ........ 1   (Model 5)
 *   forend + swing ........... 3   (the three break guns)
 *   nothing .................. 1   (the riot shield)
 * A pump gun's forend, a lever, a revolver's cylinder on anything but
 * the Model 5: those are not animated because they are not BUILT yet.
 * Everything here skips a part it cannot find, so adding one to a model
 * is all it takes to make it move.
 */
const WEAPON_ACTIONS = {
  /* Gas or recoil works the breech: a case a shot, and the bolt runs. */
  selfLoading: { eject: 'shot', cycle: 'shot', all: false },
  /* Your hand works it, between shots -- a turnbolt. It lifts, draws,
     returns and turns down, and it takes most of a second. */
  manual: { eject: 'cycle', cycle: 'hand', all: false, turn: true },
  /* A pump gun. The FOREND travels, not the bolt, and the shooter's
     support hand goes with it -- which is the whole read. */
  pump: { eject: 'cycle', cycle: 'hand', all: false, rack: true },
  /* A lever drops away from the grip and comes back. */
  lever: { eject: 'cycle', cycle: 'hand', all: false, lever: true },
  /* The cylinder turns and the hammer falls. Nothing leaves until the
     ejector rod is pushed, which is what the reload is for. */
  revolver: { eject: 'reload', cycle: 'none', all: true, index: true },
  /* Hinged: both barrels empty together when it breaks open. */
  break: { eject: 'open', cycle: 'none', all: true, hinge: true },
  /* A link and a case per shot, and the bolt runs the whole time. */
  belt: { eject: 'shot', cycle: 'shot', all: false, feed: true },
  /* Externally driven: the barrels spin whether or not it is firing. */
  rotary: { eject: 'shot', cycle: 'spin', all: false },
  /* Nothing in it is a cartridge. */
  energy: { eject: 'never', cycle: 'none', all: false },
};

/* Which action a weapon has, from its own declaration first and its
   family second. The family is a fallback because mp-data groups
   "Pump and break" and "Lever and revolver" under one heading each --
   useful for a menu, not enough to animate from. */
const ACTION_BY_FAMILY = {
  bolt: 'manual', breakopen: 'break', belt: 'belt', rotary: 'rotary',
  pump: 'pump', handcannon: 'revolver', lever: 'lever',
};
function weaponAction(spec) {
  if (!spec) return WEAPON_ACTIONS.selfLoading;
  if (spec.act && WEAPON_ACTIONS[spec.act]) return WEAPON_ACTIONS[spec.act];
  if (spec.action && WEAPON_ACTIONS[spec.action]) return WEAPON_ACTIONS[spec.action];
  if (spec.revolver) return WEAPON_ACTIONS.revolver;
  const f = ACTION_BY_FAMILY[spec.fam];
  if (f) return WEAPON_ACTIONS[f];
  const k = spec.reloadKind;
  if (k === 'break') return WEAPON_ACTIONS.break;
  if (k === 'belt') return WEAPON_ACTIONS.belt;
  if (k === 'cell') return WEAPON_ACTIONS.energy;
  if (k === 'revolver') return WEAPON_ACTIONS.revolver;
  return WEAPON_ACTIONS.selfLoading;
}

/* Pose one weapon's moving parts.
 *
 * `s` is where the gun is in each of its motions, all 0..1:
 *   fire    the automatic cycle -- 0 in battery, 1 fully back
 *   hand    a hand-worked cycle -- 0 closed, 1 at the back of the stroke
 *   reload  the reload, 0 at the start and 1 at the end
 *   trigger how far the trigger is back, for the hammer
 *   spin    total revolutions, for a rotary
 *   rounds  how many shots this weapon has fired, for a cylinder to index
 *
 * Every part is optional. A model that does not carry one is skipped,
 * so this is safe to call on all eighty-one. */
/* Turn a part about a point that is not its own origin.
 *
   A child actor composes position, rotation and scale about its origin
   and the engine gives it no pivot, so a break gun's barrel group -- an
   actor whose origin is the gun's -- can only swing about the gun's
   origin, which puts the muzzle through the stock. Rotating about P is
   the same rotation plus a translation of (P - R.P), which is exact and
   costs nothing, and it leaves the model's rest pose exactly where every
   measurement in the suite expects to find it. */
function turnAbout(a, pivot, axis, deg) {
  if (!a) return;
  if (!pivot) { a.setRotation(axis === 'x' ? [deg, 0, 0] : axis === 'y' ? [0, deg, 0] : [0, 0, deg]); return; }
  const r = deg * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
  const px = pivot[0], py = pivot[1], pz = pivot[2];
  let rx, ry, rz;
  if (axis === 'x') { rx = px; ry = py * c - pz * sn; rz = py * sn + pz * c; }
  else if (axis === 'y') { rx = px * c + pz * sn; ry = py; rz = -px * sn + pz * c; }
  else { rx = px * c - py * sn; ry = px * sn + py * c; rz = pz; }
  a.setRotation(axis === 'x' ? [deg, 0, 0] : axis === 'y' ? [0, deg, 0] : [0, 0, deg]);
  a.setPosition([px - rx, py - ry, pz - rz]);
}

function poseAction(gun, act, s) {
  if (!gun || !act) return;
  const fire = s.fire || 0, hand = s.hand || 0, reload = s.reload || 0;
  const back = act.cycle === 'shot' ? fire : (act.cycle === 'hand' ? hand : 0);

  /* The breech. Along the throw the MODEL declares, so a side-charging
     SMG and an inline rifle each move along the axis their own tube
     actually runs. */
  if (gun.bolt && gun.boltThrow) {
    const R = gun.boltRest || [0, 0, 0], T = gun.boltThrow;
    gun.bolt.setPosition([R[0] + T[0] * back, R[1] + T[1] * back, R[2] + T[2] * back]);
    /* A turnbolt does not just slide. It lifts through 90 degrees before
       it will come back and turns down again before it will fire, and
       the lift happens at the very start and end of the stroke -- which
       is what makes a bolt gun read as a bolt gun and not an SMG. */
    if (act.turn) {
      const lift = Math.min(1, back / 0.22);
      gun.bolt.setRotation([90 * lift, 0, 0]);
    }
  }
  /* A pistol's slide, which is the same motion under another name. */
  if (gun.slide) gun.slide.setPosition([-(gun.slideTravel || 0.02) * back, 0, 0]);

  /* A pump gun's forend runs back along the magazine tube under the
     shooter's hand. */
  if (act.rack && gun.forend) {
    gun.forend.setPosition([-(gun.rackTravel || 0.072) * hand, 0, 0]);
  }
  /* A lever swings down and forward about its pin at the back of the
     trigger guard. */
  if (act.lever && gun.lever) {
    turnAbout(gun.lever, gun.leverPivot, 'z', -(gun.leverSwing || 58) * hand);
  }
  /* A revolver indexes: one chamber per shot, and it turns while the
     hammer is coming back rather than after it falls. */
  if (act.index) {
    /* Whichever group actually IS the cylinder. On most revolvers that
       is `cylinder`; on the six-shot grenade launcher the cylinder is
       modelled as the magazine, because on that gun it is. */
    const cyl = gun.cylinder || (gun.magPivot ? gun.mag : null);
    if (cyl) {
      const n = gun.chambers || 6, step = 360 / n;
      turnAbout(cyl, gun.cylinder ? gun.cylinderPivot : gun.magPivot, 'x',
        (s.rounds || 0) * step + step * (s.trigger || 0));
    }
  }
  /* The hammer, on anything that shows one: back with the trigger and
     down at the break. */
  if (gun.hammer) {
    const t = s.trigger || 0;
    /* Rises with the first 80 per cent of the pull and drops through
       the last twenty, which is where a trigger actually breaks. */
    const rise = t < 0.8 ? t / 0.8 : 1 - (t - 0.8) / 0.2;
    gun.hammer.setRotation([0, 0, (gun.hammerArc || 34) * rise]);
  }
  /* A belt gun's top cover lifts on the reload, and the belt itself
     creeps in a link at a time as the gun runs. */
  if (act.feed) {
    if (gun.cover) gun.cover.setRotation([0, 0, -(gun.coverArc || 62) * beltCover(reload)]);
    if (gun.belt) gun.belt.setPosition([0, 0, -(gun.linkPitch || 0.016) * ((s.rounds || 0) % 4)]);
  }
  /* A break gun hinges open in the middle of its reload and shuts
     again -- and the barrels are the `swing` group on those models. */
  if (act.hinge && gun.swing) {
    /* NEGATIVE, and about the pin. A rotation about Z carries +X toward
       +Y, which tips the muzzle UP; a break gun's barrels drop. */
    turnAbout(gun.swing, gun.swingPivot, 'z', -(gun.hingeArc || 26) * breakOpen(reload));
  }
  /* A rotary's barrels never stop while it is spun up. They are the
     `cylinder` group -- the barrel cluster, offset to its own axis -- not
     the bolt, which on a rotary does not exist as a single thing. */
  if (act.cycle === 'spin' && gun.cylinder) {
    turnAbout(gun.cylinder, gun.cylinderPivot, 'x', (s.spin || 0) * 360);
  }
}
/* Open through the middle of the reload and shut before the end: the
   gun is not usable open, so it cannot still be open when the reload
   says it is finished. */
function breakOpen(r) {
  if (r <= 0) return 0;
  if (r < 0.18) return r / 0.18;
  if (r < 0.74) return 1;
  return Math.max(0, 1 - (r - 0.74) / 0.20);
}
function beltCover(r) { return breakOpen(r); }
