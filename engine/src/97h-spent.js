/* ==================================================================
   WHAT THE GUN THROWS AWAY
   ==================================================================

   Two things leave a weapon and land on the floor: the case out of the
   port on every shot, and the magazine out of the well on every reload.
   Both existed in zombies and neither in multiplayer -- seventy-five
   guns firing without a single piece of brass in the air and reloading
   without a magazine ever hitting the ground.

   They are here rather than in either game because both are the same
   short piece of arithmetic -- take a point and a direction in the
   weapon's own space, put them through the weapon's matrix, and spawn a
   rigid body there -- and neither knows anything about a player.

   The list of what has been thrown is the caller's: a game with a
   corpse budget and a game with a round timer want different limits, so
   `keep` takes the array and the cap and does the trimming. */

/* A CASE OUT OF THE PORT.
 *
   A REVOLVER HAS NO PORT, which is the point of it. `drop` is the
   ejector rod instead: the cases are pushed out of the back of the
   cylinder by hand and fall more or less straight down at your feet.
   They come from the magazine well, which on a revolver is where the
   cylinder is, and they leave with almost no speed -- brass off a rod
   drops, it does not fly.

     gun    the weapon actor, whose matrix does the whole transform
     o      { drop, gold, lifetime, keep, cap }

   Returns the actor, or null if the weapon has nowhere for brass to
   come from. */
Engine.prototype.ejectCase = function (gun, o = {}) {
  if (!gun || !gun.matrix) return null;
  const drop = !!o.drop;
  const lp = drop ? (gun.magWell || null) : gun.ejectPort;
  if (!lp) return null;
  const m = gun.matrix.e;
  /* The port and the ejection direction through the gun's own matrix, so
     brass leaves in the direction the gun is actually pointing. */
  const wx = m[0] * lp[0] + m[4] * lp[1] + m[8] * lp[2] + m[12];
  const wy = m[1] * lp[0] + m[5] * lp[1] + m[9] * lp[2] + m[13];
  const wz = m[2] * lp[0] + m[6] * lp[1] + m[10] * lp[2] + m[14];
  // Out of a port: up, right and back. Off a rod: down and barely at all.
  const dir = drop ? [-0.25, -0.9, 0.15] : [0.35, 0.75, 1.0];
  const ex = m[0] * dir[0] + m[4] * dir[1] + m[8] * dir[2];
  const ey = m[1] * dir[0] + m[5] * dir[1] + m[9] * dir[2];
  const ez = m[2] * dir[0] + m[6] * dir[1] + m[10] * dir[2];
  const sp = drop ? 0.5 + Math.random() * 0.4 : 2.4 + Math.random() * 1.2;
  const shell = this.cylinder({
    at: [wx, wy, wz], radius: 0.0058, height: 0.023,
    lifetime: o.lifetime == null ? 3.4 : o.lifetime,
    material: o.gold
      ? { color: 0xf5c93f, texture: 'metal', roughness: 0.10, metalness: 1,
        emissive: 0x5a3f06, emissiveStrength: 0.55 }
      : { color: 0xc79a43, texture: 'metal', roughness: 0.3, metalness: 1 },
    velocity: drop
      ? [ex * sp + (Math.random() - 0.5) * 0.35, ey * sp - 0.2,
        ez * sp + (Math.random() - 0.5) * 0.35]
      : [ex * sp + (Math.random() - 0.5), ey * sp + 1.2, ez * sp + (Math.random() - 0.5)],
    bounce: 0.35, friction: 0.6, mass: 0.012,
  });
  if (shell.body) {
    shell.body.angularVelocity.set(
      (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26);
  }
  keepSpent(o.keep, shell, o.cap);
  return shell;
};

/* THE SPENT MAGAZINE.
 *
   It falls, bounces once and lies there. The zombies version of this
   dropped one grey 26 x 100 x 21 box for every weapon in the game --
   the same brick out of a 1911, an MP5 and a drum-fed Thompson -- and
   only on the two guns that happen to call their magazine `mag`, so the
   bolt rifles and the MG dropped nothing at all. It is the real
   magazine: the weapon's own ammunition description gives its width,
   depth, length and curve, and a fitted drum drops a drum.

     o   { ammo, fitted, lifetime, keep, cap } */
Engine.prototype.dropMagazine = function (gun, o = {}) {
  if (!gun || !gun.magWell || !gun.matrix) return null;
  const m = gun.matrix.e, lp = gun.magWell;
  const wx = m[0] * lp[0] + m[4] * lp[1] + m[8] * lp[2] + m[12];
  const wy = m[1] * lp[0] + m[5] * lp[1] + m[9] * lp[2] + m[13];
  const wz = m[2] * lp[0] + m[6] * lp[1] + m[10] * lp[2] + m[14];
  const A = o.ammo || {};
  const fit = o.fitted;
  const life = o.lifetime == null ? 6 : o.lifetime;
  const vel = [(Math.random() - 0.5) * 0.6, -0.8, (Math.random() - 0.5) * 0.6];
  let made = null;
  try {
    if (fit === 'drummag') {
      /* A drum is not a stick with more rounds in it, so what hits the
         floor is the drum's own model -- the same one that was on the
         gun a moment ago. */
      made = this.gunPart('drummag', { at: [wx, wy, wz], lifetime: life, mass: 0.55,
        physics: true, velocity: vel, bounce: 0.15, friction: 0.9 });
    } else {
      // Longer for an extended magazine, stubbier for a fast one.
      const shape = fit === 'extmag' ? { len: 0.150 }
        : fit === 'fastmag' ? { len: 0.078 } : {};
      made = this.boxMagazine({
        at: [wx, wy, wz], lifetime: life, mass: 0.13,
        mag: Object.assign({ w: 0.026, d: 0.021, len: 0.105, curve: 0, witness: 0,
          round: RELOAD_AMMO.para9 }, A.mag || {}, shape),
        bodyMaterial: A.magMaterial,
        velocity: vel, bounce: 0.2, friction: 0.8,
      });
    }
  } catch (e) { void e; }
  if (!made) return null;
  const body = made.root || made;
  if (body.body) {
    body.body.angularVelocity.set((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5);
  }
  keepSpent(o.keep, body, o.cap);
  return body;
};

/* The litter list, trimmed from the oldest end. A game with a corpse
   budget and a game with a round timer want different caps, so both the
   array and the cap come from the caller. */
function keepSpent(list, a, cap) {
  if (!list || !a) return;
  list.push(a);
  const n = cap || 24;
  while (list.length > n) {
    const old = list.shift();
    if (old && !old.dead && old.destroy) old.destroy();
  }
}
