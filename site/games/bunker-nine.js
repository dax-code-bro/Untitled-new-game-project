/* ============================================================
   BUNKER NINE — round-based undead survival in a WWII bunker.

   Built on the Legend Engine (LE). One map, one player, waves of
   the dead coming through boarded windows. Points buy boards,
   guns off the wall, and the doors that make the bunker bigger.

   Everything here is original — the map, the characters, the
   voice lines. The formula (windows, points, chalk guns, rounds)
   is genre convention; the content is ours.

   Exposes window.BUNKER.start(opts) and window.__T (test hooks).
   ============================================================ */
(function () {
'use strict';

/* ---------------- tuning ---------------- */

const ECONOMY = {
  start: 500,
  hit: 10,            // per bullet that lands
  kill: 60,           // on top of hits
  headshotKill: 100,  // instead of the 60
  knifeKill: 230,     // the blade pays better than the gun, and should
  board: 10,          // per board repaired
  doorGenerator: 750,
  stairGate: 1000,
  wallGun: 1500,      // what the user specced: wall guns are 1500...
  wallAmmo: 500,      // ...and ammo off the same chalk is 500
  crate: 900,
  upgrade: 5000,     // what the rock asks, and it is worth it
};

/* ---------------- where a round lands ----------------

   Eleven regions down a body, as fractions of its height from the soles up,
   with the lateral offset from the spine deciding arm from torso. The
   multipliers here are what the diagram on the bench reads out — it is
   generated from this table rather than drawn beside it, so it cannot drift
   away from what the gun actually does. */
const HIT_REGIONS = [
  { id: 'head', label: 'Head', lo: 0.895, hi: 1.02, mul: null, crit: true },
  { id: 'neck', label: 'Neck', lo: 0.855, hi: 0.895, mul: null, critScale: 0.78, crit: true },
  { id: 'shoulder', label: 'Shoulders', lo: 0.775, hi: 0.855, mul: 1.05, lateral: 0.17 },
  { id: 'upperTorso', label: 'Upper torso', lo: 0.715, hi: 0.855, mul: 1.15 },
  { id: 'midTorso', label: 'Mid torso', lo: 0.615, hi: 0.715, mul: 1.0 },
  { id: 'lowerTorso', label: 'Lower torso', lo: 0.495, hi: 0.615, mul: 0.9 },
  { id: 'hand', label: 'Hands', lo: 0.44, hi: 0.60, mul: 0.7, lateral: 0.26 },
  { id: 'arm', label: 'Arms', lo: 0.545, hi: 0.80, mul: 0.8, lateral: 0.20 },
  { id: 'upperLeg', label: 'Upper legs', lo: 0.28, hi: 0.495, mul: 0.85 },
  { id: 'lowerLeg', label: 'Lower legs', lo: 0.06, hi: 0.28, mul: 0.75 },
  { id: 'foot', label: 'Feet', lo: -0.05, hi: 0.06, mul: 0.7 },
];

/* Which region a hit point falls in. A limb wins over the central region
   covering the same band: an arm is in front of the chest from most angles,
   and a round that clips it should read as an arm rather than as a torso
   shot that happened to be off centre. */
function hitRegion(z, point) {
  const H = 1.75;
  const feet = z.actor.position.y - H * 0.5;
  const f = (point.y - feet) / H;
  const dx = point.x - z.actor.position.x, dz = point.z - z.actor.position.z;
  const lat = Math.hypot(dx, dz);
  for (const r of HIT_REGIONS) {
    if (f < r.lo || f >= r.hi) continue;
    if (r.lateral && lat < r.lateral) continue;
    if (!r.lateral) {
      const limb = HIT_REGIONS.find((q) => q.lateral && f >= q.lo && f < q.hi && lat >= q.lateral);
      if (limb) return limb;
    }
    return r;
  }
  return HIT_REGIONS.find((q) => q.id === 'midTorso');
}

function regionMul(region, spec) {
  if (region.crit) return spec.headMul * (region.critScale || 1);
  return region.mul;
}

/* ---------------- the workbench ----------------

   Five slots on a gun, one part in each. Everything here changes both the
   numbers and the silhouette: an attachment you cannot see on the weapon is
   a menu entry, not a modification.

   `fold` takes the base spec and returns the changes to merge, so the
   effect of a part is written once, next to its name and its price, rather
   than smeared through the firing code. Anything a part must not go on is
   listed in `bans`. */
const ATTACH = {
  slots: ['mag', 'muzzle', 'barrel', 'optic', 'stock'],
  /* Five slots, three parts. A gun with one of everything is a gun with
     no decision behind it: every build ends up the same, and the parts
     stop being worth their price because you were always going to own
     all of them. Three out of five is a choice you have to make twice --
     what to take, and what to give up to take it. */
  maxFitted: 3,
  slotName: { mag: 'MAGAZINE', muzzle: 'MUZZLE', barrel: 'BARREL', optic: 'OPTIC', stock: 'STOCK' },
  parts: {
    /* --- magazines --- */
    fastmag: { slot: 'mag', name: 'Fast Magazine', cost: 1250,
      blurb: 'Fewer rounds, far quicker to change',
      fold: (w) => ({ mag: Math.max(2, Math.round(w.mag * 0.65)), reload: w.reload * 0.62 }) },
    extmag: { slot: 'mag', name: 'Extended Magazine', cost: 1750,
      blurb: 'Ten more rounds',
      fold: (w) => ({ mag: w.mag + 10, reload: w.reload * 1.06 }) },
    drummag: { slot: 'mag', name: 'Drum Magazine', cost: 3000,
      blurb: 'Forty more rounds, and slower to swap',
      fold: (w) => ({ mag: w.mag + 40, reload: w.reload * 1.45, moveMul: (w.moveMul || 1) * 0.95 }) },
    /* --- muzzles --- */
    suppressor: { slot: 'muzzle', name: 'Suppressor', cost: 2000,
      blurb: 'Quiet. They take longer to work out where you are',
      fold: (w) => ({ quiet: true, dmg: w.dmg * 0.92, spread: w.spread * 0.86 }) },
    compensator: { slot: 'muzzle', name: 'Compensator', cost: 1500,
      blurb: 'Holds the muzzle down under fire',
      fold: (w) => ({ recoil: Object.assign({}, w.recoil, { up: w.recoil.up * 0.62, climb: w.recoil.climb * 0.5 }) }) },
    annihilator: { slot: 'muzzle', name: 'Mark One Annihilator', cost: 3500,
      blurb: 'Recoil, very nearly gone',
      fold: (w) => ({ recoil: Object.assign({}, w.recoil, {
        up: w.recoil.up * 0.22, side: w.recoil.side * 0.28, climb: w.recoil.climb * 0.15, recover: w.recoil.recover * 1.4 }),
        kick: w.kick * 0.35 }) },
    /* --- barrels --- */
    skullsplitter: { slot: 'barrel', name: 'Skull Splitter Barrel', cost: 3250,
      blurb: 'Sixty more on every head shot',
      fold: (w) => ({ headBonus: 60 }) },
    longbarrel: { slot: 'barrel', name: 'Long Barrel', cost: 1500,
      blurb: 'Reaches further and gets there faster',
      fold: (w) => ({ muzzleVel: (w.muzzleVel || 300) * 1.5, spread: w.spread * 0.78,
        moveMul: (w.moveMul || 1) * 0.94 }) },
    shortbarrel: { slot: 'barrel', name: 'Short Barrel', cost: 1250,
      blurb: 'Handier, and you move quicker with it',
      fold: (w) => ({ moveMul: (w.moveMul || 1) * 1.14, spread: w.spread * 1.25 }) },
    bayonet: { slot: 'barrel', name: 'Bayonet Lug', cost: 2250,
      blurb: 'The blade lives on the gun. Butt-strokes hit like the knife',
      fold: () => ({ bayonet: true }) },
    /* --- optics --- */
    reddot: { slot: 'optic', name: 'Red Dot', cost: 1000,
      blurb: 'A clean dot instead of iron',
      fold: (w) => ({ sightH: w.sightH + 0.012, adsSpread: (w.adsSpread != null ? w.adsSpread : 0.25) * 0.8 }) },
    thermal: { slot: 'optic', name: 'Thermal Optic', cost: 3000,
      blurb: 'They glow. Nothing else does',
      fold: (w) => ({ sightH: w.sightH + 0.016, thermal: true }) },
    rangefinder: { slot: 'optic', name: 'Rangefinder Optic', cost: 2000,
      blurb: 'Reads the distance, and steadies the shot for it',
      fold: (w) => ({ sightH: w.sightH + 0.014, rangefinder: true, adsSpread: (w.adsSpread != null ? w.adsSpread : 0.25) * 0.6 }) },
    nightvision: { slot: 'optic', name: 'Night Vision', cost: 2250,
      blurb: 'Green, grainy, and you can see the corners',
      fold: (w) => ({ sightH: w.sightH + 0.018, nightvision: true }) },
    scope7x: { slot: 'optic', name: '7x Sniper Optic', cost: 2750,
      blurb: 'Seven times, and no use at all up close',
      fold: (w) => ({ sightH: w.sightH + 0.020, sightFov: 0.22, adsTime: w.adsTime * 1.5,
        adsSpread: 0.05, scoped: true }),
      bans: ['scatter', 'sawnoff', 'paralyzer', 'mp5', 'remington', 'killstreak'] },
    /* --- stock --- */
    dual: { slot: 'stock', name: "What's Better Than One", cost: 4000,
      blurb: 'Two of them. No optic, no sights, and you are slow',
      fold: (w) => ({ dual: true, mag: w.mag * 2, dmg: w.dmg * 1.85,
        moveMul: (w.moveMul || 1) * 0.72, noAds: true, reload: w.reload * 1.5,
        recoil: Object.assign({}, w.recoil, { side: w.recoil.side * 1.7 }) }),
      bans: ['arc', 'ram', 'shield', 'knife', 'hammer', 'obliterator',
        'remington', 'killstreak', 'mg42'] },
  },
  /* Wonder weapons and the melee kit take nothing at all. */
  noWork: ['arc', 'knife', 'hammer', 'ram', 'shield', 'shieldWorn'],
  /* A gun that gains a second copy of itself gains a name with it. */
  dualName: { m1911: 'River & Blaze', blaze: 'Blaze & River', mp5: 'Twin MP5', thompson: 'Double Thompson',
    scatter: 'Both Barrels Twice', sawnoff: 'Sawn-Off Pair', mauser: 'Twin Mauser',
    paralyzer: 'Twin Paralyzer' },
};

/* The generator is turned by hand, and the five seconds it takes are the
   whole design of it: the horde does not stop while you are holding a crank,
   so the round you choose to do this in matters. */
const GEN = { crank: 5.0, reach: 2.4, rpm: 190 };

/* The minigun on the roof. Three minutes, three thousand rounds a minute,
   ten a round — five hundred a second into whatever it is looking at, and
   then it is finished and you buy it again.

   Fifty shots a second is more than the frame rate, so the gun works out
   how many rounds it owes since the last frame and spends them together.
   Firing once a frame instead would silently cap it at sixty a second and
   turn a minigun into a rifle. */
const MINIGUN = {
  cost: 4500, time: 180, dps: 500, rpm: 3000, dmg: 10,
  range: 34, arc: 1.15, spin: 62, cool: 12,
};

/* How far under the mud a body starts and how long it takes to get out. */
const RISE_DEPTH = 1.9, RISE_TIME = 1.9;

/* What the Arc Breaker leaves behind: ten seconds locked rigid, taking
   current the whole time, arcing and twitching so you can see which ones
   are safe to turn your back on. */
const STUN = { time: 10, dps: 5, arcEvery: 0.16 };

/* What the support hand fetches and carries, per weapon.

   These were primitives: a box for a magazine, a strip with five plain
   cylinders for a clip, two smooth tubes for shotgun shells. They are the
   closest objects in the game -- twenty-five centimetres from the eye and
   filling a quarter of the screen while the hand brings them up -- and at
   that distance a smooth tube reads as a smooth tube.

   They are real models now, built from the real cartridge's dimensions,
   and each weapon says which one it carries and how big its rounds are. */
const AMMO = {
  /* .45 ACP: 11.5 mm rim, 23 mm case, 32.4 mm overall. Straight-walled,
     so the neck is the same as the case. */
  acp45: { headR: 0.00575, caseR: 0.00560, neckR: 0.00560, caseLen: 0.0230, overall: 0.0324 },
  // 9x19: 9.93 mm rim, 19.15 mm case, 29.7 mm overall, slight taper.
  para9: { headR: 0.00497, caseR: 0.00480, neckR: 0.00450, caseLen: 0.0192, overall: 0.0297 },
  // 7.63 Mauser: a bottlenecked little rifle round in a pistol.
  mau763: { headR: 0.00490, caseR: 0.00470, neckR: 0.00400, caseLen: 0.0251, overall: 0.0350 },
  // .30-06 class, for the bolt rifles.
  rifle30: { headR: 0.00600, caseR: 0.00580, neckR: 0.00430, caseLen: 0.0633, overall: 0.0846 },
  // .500-class magnum for the Model 5, straight-walled and enormous.
  mag500: { headR: 0.00740, caseR: 0.00700, neckR: 0.00680, caseLen: 0.0410, overall: 0.0530 },
  // 7.92x57 for the MG.
  mauser8: { headR: 0.00595, caseR: 0.00570, neckR: 0.00420, caseLen: 0.0570, overall: 0.0805 },
};

const WEAPONS = {
/* ---------------- RECOIL, AGAINST THE REAL CARTRIDGE ----------------
 *
 * Every weapon here already had its own recoil block, hand-tuned. This
 * is the check on those numbers: free recoil energy, computed from the
 * cartridge each weapon actually fires and the weight of the gun that
 * fires it, so the ORDER of the kicks is something that can be argued
 * about rather than a matter of taste.
 *
 *   v_gun = (Wb·Vb + 1.75·Wp·Vb) / (7000 · Wg)      ft/s
 *   E     = Wg · v_gun² / 64.348                    ft·lb
 *
 * with bullet and powder in grains, velocity in ft/s, gun in pounds --
 * the standard free-recoil formula, 1.75 being the usual figure for
 * powder gas leaving faster than the bullet.
 *
 *   WEAPON        CARTRIDGE       BULLET   MV     GUN     E
 *   MP5           9x19 Para        115 gr  1150   5.6 lb   1.15
 *   Thompson      .45 ACP          230     920   10.6      1.45
 *   Mauser C96    7.63x25           86    1425    2.5      2.36
 *   M1911         .45 ACP          230     830    2.4      5.19
 *   Blaze         .45 ACP          230     830    2.4      5.19
 *   MG 42         8x57 IS          198    2500   25.5      6.11
 *   Remington 700 .308 Win         150    2820    8.0     16.76
 *   Scattergun    12 ga 1-1/8 oz   492    1200    7.5     17.50
 *   Model 5       .50 AE           300    1475    4.4     19.53
 *   Sawn-Off      12 ga 1-1/8 oz   492    1200    5.0     26.19
 *   Kill Streak   .50 BMG          660    2900   30.0    103.7
 *
 * Muzzle rise is not proportional to that -- a hundred times the MP5's
 * kick is not something a screen can show and a hand can hold. It is
 * fitted as up = 0.323 · E^0.77, the curve through the MP5 and the
 * 1911, and every trigger-limited weapon in the game was already within
 * a few per cent of it. Two were not:
 *
 *   MAUSER. It kicked HARDER than the 1911 -- 1.50 against 1.15 -- and
 *   a 7.63x25 has less than half a .45 ACP's recoil energy. The C96 is
 *   a small fast bullet: flat, penetrating, and mild in the hand. It
 *   comes down to 0.63, which is where the curve puts it, and it gains
 *   the thing that calibre is actually famous for, which is going
 *   straight through what it hits.
 *
 *   SHOTGUNS AND THE RIFLE. 12 gauge and .308 are within five per cent
 *   of each other in recoil energy, and the game had the rifle kicking
 *   thirty per cent harder than the shotgun. Levelled, with the
 *   shotguns a shade above where the curve puts them because a shotgun's
 *   recoil is a shove rather than a snap and `up` is all this has to say
 *   it with.
 *
 * Two departures are deliberate and stay:
 *
 *   MG 42. The curve says 1.29 a shot. At twelve hundred rounds a minute
 *   that is twenty-six degrees a second and the gun is unusable. It is a
 *   twenty-five pound belt-fed gun on a bipod and the real answer to its
 *   recoil is the mass and the mount, neither of which this models; the
 *   game's climb-and-recover pair already carries what sustained fire
 *   does to it. Left at 0.55.
 *
 *   KILL STREAK. The curve says 12.1. A .50 BMG fired standing would put
 *   the muzzle at the ceiling and the shooter on the floor, which is
 *   true and is not a game. Left at 7.5, which is still by a distance
 *   the hardest thing to shoot twice.
 */
  m1911: {
    name: 'M1911', slotName: 'SIDEARM',
    dmg: 55, headMul: 3.0, mag: 7, reserve: 42, refire: 0.16,
    reload: 1.5, auto: false, pellets: 1, spread: 0.4,
    kick: 1.6, sfx: 'shot1911', reloadKind: 'mag',
    // sightH: height of the sight line above the weapon's own origin, so
    // aiming can place the gun such that the real notch-and-blade land on
    // the camera axis. Measured off the model, not eyeballed.
    sightH: 0.0455, sightFov: 0.74, adsTime: 0.16,
    recoil: { up: 1.15, side: 0.5, climb: 0.28, recover: 9, back: 0.016, roll: 0.006, impulse: 9 },
    ammo: { mag: { w: 0.024, d: 0.020, len: 0.086, curve: 0, witness: 0, round: AMMO.acp45 } },
    /* Two hands on a pistol means the support palm against the BACK of
       the firing fingers and its own fingers over them -- not a second
       hand beside the grip lower down, which is where this was and which
       reads as two people holding the same gun. Up level with the firing
       hand and outboard by the thickness of its fingers. */
    hands: { right: [-0.004, -0.020, 0.017], rightGrip: 'pistol', left: [0.006, -0.030, -0.034], leftGrip: { axis: [-0.28, -0.94, 0], round: [0, 0, 1], girth: 0.078, spread: 0.0184, close: 0.90, index: 'wrap', thumb: 'stack', drop: 0 } },
  },
  /* River's twin. Same pistol, different loading: the rounds carry an
     incendiary compound, so what they leave behind burns for a while after
     the shot has stopped mattering. Half the sidearm's impact and rather
     more than half its damage once the fire has had its say.

     The pair of them is the point. Fit both with the dual-wield stock and
     you are holding two 1911s; put both through the rock and the pair
     becomes something else again. */
  blaze: {
    name: 'Blaze', slotName: 'BLAZE',
    dmg: 34, headMul: 2.6, mag: 8, reserve: 56, refire: 0.16,
    reload: 1.5, auto: false, pellets: 1, spread: 0.5,
    kick: 1.5, sfx: 'shotBlaze', reloadKind: 'mag',
    burn: { dps: 26, time: 5 },
    sightH: 0.0455, sightFov: 0.74, adsTime: 0.16,
    recoil: { up: 1.10, side: 0.5, climb: 0.26, recover: 9, back: 0.017, roll: 0.007, impulse: 9 },
    ammo: { mag: { w: 0.024, d: 0.020, len: 0.086, curve: 0, witness: 0, round: AMMO.acp45 } },
    /* The 1911's twin, and it had been left behind on the old two-handed
       numbers -- a second hand beside the grip lower down, with a thumb
       that mirrored across the top of the slide. Same gun, same hold. */
    hands: { right: [-0.004, -0.020, 0.017], rightGrip: 'pistol', left: [0.006, -0.030, -0.034], leftGrip: { axis: [-0.28, -0.94, 0], round: [0, 0, 1], girth: 0.078, spread: 0.0184, close: 0.90, index: 'wrap', thumb: 'stack', drop: 0 } },
  },
  thompson: {
    name: 'Thompson', slotName: 'THOMPSON',
    dmg: 40, headMul: 2.2, mag: 30, reserve: 210, refire: 0.1,
    reload: 2.3, auto: true, pellets: 1, spread: 1.1,
    kick: 0.9, sfx: 'shotThompson', reloadKind: 'mag',
    sightH: 0.0955, sightFov: 0.80, adsTime: 0.22,
    recoil: { up: 0.42, side: 0.30, climb: 0.13, recover: 11, back: 0.011, roll: 0.004, impulse: 5 },
    ammo: { mag: { w: 0.028, d: 0.024, len: 0.112, curve: 0, witness: 0, round: AMMO.acp45 } },
    /* It has a VERTICAL foregrip -- the thing the gun is famous for -- and
       it was being held with `woodFore`, which is the grip for a fat
       horizontal shotgun forend: the hand laid along the top with the
       thumb pointing at the muzzle. So the support thumb came out lying
       flat down the receiver. `foregrip` wraps all four fingers round a
       vertical grip with the thumb over them, which is how you hold one. */
    /* MEASURED against the model, which has no vertical foregrip on it.
       Between x 300 and 430 this Thompson carries a horizontal handguard
       spanning y +30 to +60 and nothing whatever below y +15 -- and the
       support hand was anchored at y -52, a hundred millimetres under the
       nearest geometry, wrapping four fingers round thin air. It touched
       0% of the gun where the others touch 27 to 30. A hand under a
       handguard is `fore`. */
    hands: { right: [-0.006, -0.024, 0.016], rightGrip: 'pistol', left: [0.356, 0.030, 0], leftGrip: 'fore' },
  },
  scatter: {
    name: 'Scattergun', slotName: 'SCATTERGUN',
    dmg: 22, headMul: 1.6, mag: 2, reserve: 38, refire: 0.5,
    reload: 2.6, auto: false, pellets: 8, spread: 5.5,
    kick: 3.2, sfx: 'shotScatter', reloadKind: 'break',
    sightH: 0.0275, sightFov: 0.86, adsTime: 0.24, adsSpread: 0.55,
    recoil: { up: 3.05, side: 0.9, climb: 0.75, recover: 7, back: 0.040, roll: 0.013, impulse: 20 },
    ammo: { shell: { r: 0.00925, len: 0.0700, head: 0.0220 } },
    hands: { right: [-0.014, -0.046, 0.016], rightGrip: 'wrist', /* NOTE, measured and left alone. `woodFore` declares 92 mm of girth
       and this gun's forend measures 48 across by 33 deep -- so the hand
       opens for something twice the thickness of what is there. Setting
       it to the measured 50 moved the quadrant split from 75/1/24/0 to
       69/1/30/0, which is to say it changed nothing that matters, so the
       girth is not what is wrong with this hand and I have not altered
       how the gun is held on the strength of a number that did not
       respond. The same is true of the Mauser's 62-against-43.
       
       What IS wrong is elsewhere: the support hands that fail to straddle
       their grips are exactly the ones whose skin is far from their own
       anchor -- 34, 71, 108, 108 and 152 vertices within 55 mm of it,
       against 425 to 503 for every hand that passes. That is the thread
       to pull, and it is a question about where the hand mesh is built
       rather than about how wide it opens. */
      /* The forend's own axis. It was at [0.242, -0.006, -0.020]: 12 mm
         past the end of the wood, which runs x 0.056 to 0.230, and offset
         into the left barrel. On the middle of the wood the little finger
         goes 8 per cent buried to 0 and nothing else moves. */
      left: [0.190, -0.009, 0], leftGrip: 'woodFore' },
  },
  /* The stun gun. A double gun with no wood on it: a capacitor bank where
     the rib should be, copper wound round both barrels, emitter rings at
     the muzzles. The slug is only half of what it does — everything it
     touches locks up for ten seconds and takes current the whole time,
     which is worth more than the damage from about round fifteen on, when
     the slug itself has stopped mattering. */
  paralyzer: {
    name: 'Paralyzer', slotName: 'PARALYZER',
    dmg: 12, headMul: 1.8, mag: 2, reserve: 40, refire: 0.62,
    reload: 2.4, auto: false, pellets: 10, spread: 4.6,
    kick: 3.0, sfx: 'shotParalyzer', reloadKind: 'break',
    pierce: 3, pierceFalloff: 0.86, stun: true,
    sightH: 0.0425, sightFov: 0.86, adsTime: 0.26, adsSpread: 0.62,
    recoil: { up: 2.4, side: 0.85, climb: 0.60, recover: 7.5, back: 0.034, roll: 0.012, impulse: 18 },
    moveMul: 0.94, muzzleVel: 62,
    ammo: { shell: { r: 0.00925, len: 0.0640, head: 0.0260 }, hullMaterial: { color: 0x2b5c74, texture: 'smooth', roughness: 0.5, metalness: 0, emissive: 0x1d6c92, emissiveStrength: 0.55 } },
    hands: { right: [-0.014, -0.046, 0.016], rightGrip: 'wrist', left: [0.268, -0.010, -0.020], leftGrip: 'tube' },
  },
  mp5: {
    name: 'MP5', slotName: 'MP5',
    dmg: 34, headMul: 2.3, mag: 30, reserve: 240, refire: 0.075,
    reload: 2.1, auto: true, pellets: 1, spread: 0.95,
    kick: 0.8, sfx: 'shotMP5', reloadKind: 'mag',
    sightH: 0.0435, sightFov: 0.80, adsTime: 0.19,
    recoil: { up: 0.36, side: 0.26, climb: 0.11, recover: 12, back: 0.008, roll: 0.003, impulse: 4 },
    moveMul: 1.0, muzzleVel: 400,
    ammo: { mag: { w: 0.026, d: 0.021, len: 0.126, curve: 0.011, witness: 4, round: AMMO.para9 } },
    hands: { right: [-0.012, -0.044, 0.016], rightGrip: 'pistol', /* Sliced at its own station, this MP5's handguard runs y 0 to +40 and
       z -17 to +17; the hand was anchored at y -14, z -20 -- below it and
       outside it, 21 mm from the nearest metal. On the underside, on the
       centreline. */
      left: [0.232, 0, 0], leftGrip: 'fore' },
  },
  sawnoff: {
    name: 'Sawn-Off', slotName: 'SAWN-OFF',
    dmg: 30, headMul: 1.5, mag: 2, reserve: 34, refire: 0.34,
    reload: 2.0, auto: false, pellets: 12, spread: 9.5,
    kick: 4.2, sfx: 'shotSawn', reloadKind: 'break',
    sightH: 0.026, sightFov: 0.94, adsTime: 0.18, adsSpread: 0.85,
    recoil: { up: 4.20, side: 1.6, climb: 1.05, recover: 6.5, back: 0.055, roll: 0.021, impulse: 27 },
    moveMul: 1.06, muzzleVel: 48,
    ammo: { shell: { r: 0.00925, len: 0.0700, head: 0.0220 } },
    hands: { right: [-0.016, -0.048, 0.016], rightGrip: 'pistol', /* MEASURED AND REVERTED: putting this on the forend's own axis.
         The anchor is 20 mm PAST the end of the wood -- the forend runs x
         0.050 to 0.150 -- and offset to z -0.020, which is inside the left
         barrel: the bore sits at z -0.01225 with an 11 mm wall, and the
         anchor is 8.7 mm from that axis. Moving it to the middle of the
         wood at [0.110, -0.009, 0] took the ring finger from 17 per cent
         buried to 0 and the middle from 25 to 0, and put the little finger
         8 to 25 and the index 17 to 25. A wash, and the regression guard
         failed it. */
      left: [0.170, -0.004, -0.020], leftGrip: 'woodFore' },
  },
  hammer: {
    name: 'Claw Hammer', slotName: 'HAMMER',
    dmg: 0, headMul: 1, mag: Infinity, reserve: Infinity, refire: 9,
    reload: 0, auto: false, pellets: 0, spread: 0,
    /* `tool`, not `melee`, and the distinction is load-bearing.
     *
     * It swings and it hits things, but it does no damage and it exists to
     * put boards back on a window -- so it must not go down the melee
     * ATTACK path. Anything sweeping "the weapons" has to exclude it on
     * `tool` as well as on `melee`, or it turns up in places it makes no
     * sense: it was measured for a sight picture it does not have, and it
     * was built a set of magazines and optics nobody will ever see. */
    kick: 0, sfx: 'dryFire', tool: true,
    sightH: 0.05, sightFov: 0.95, adsTime: 0.2,
    recoil: { up: 0, side: 0, climb: 0, recover: 12 },
    hands: { right: [0.006, -0.002, 0.012], left: null, rightGrip: 'haft' },
  },
  knife: {
    name: 'Trench Knife', slotName: 'KNIFE',
    dmg: 100, headMul: 1.0, mag: Infinity, reserve: Infinity, refire: 0.42,
    reload: 0, auto: false, pellets: 1, spread: 0,
    kick: 1.0, sfx: 'knife', melee: true, range: 2.2,
    sightH: 0.05, sightFov: 0.95, adsTime: 0.18,
    recoil: { up: 0.5, side: 0.4, climb: 0, recover: 12 },
    hands: { right: [-0.006, -0.002, 0.012], left: null, rightGrip: 'haft' },
  },
  /* What a sheriff was carrying. Four chambers, a barrel you could lose
     your nerve looking down, and enough behind each round to carry it
     through two more bodies. */
  obliterator: {
    name: 'Obliterated Model 5', slotName: 'MODEL 5',
    dmg: 620, headMul: 2.0, mag: 4, reserve: 32, refire: 0.44,
    reload: 3.1, auto: false, pellets: 1, spread: 0.5,
    kick: 3.4, sfx: 'shotModel5', revolver: true, reloadKind: 'revolver',
    /* Single action: the hammer has to come back before every shot, and it
       is the shooter's thumb that does it. */
    thumbCock: true,
    pierce: 2, pierceFalloff: 0.62,
    sightH: 0.030, sightFov: 0.86, adsTime: 0.26, adsSpread: 0.18,
    recoil: { up: 4.2, side: 1.5, climb: 0.30, recover: 7, back: 0.062, roll: 0.030, impulse: 34 },
    /* The web of the hand, and it was 44 mm below the model's own origin --
       which IS the web by construction. The hand sat halfway down a 108 mm
       grip with the frame towering over it, and the shooter's thumb ended
       up a hundred millimetres short of a hammer it is supposed to cock. */
    ammo: { loader: { count: 4, pcd: 0.0148, round: AMMO.mag500 } },
    // Punches armour: half an inch of lead goes through riot plate.
    punchesPlate: true,
    hands: { right: [-0.010, -0.013, 0.015], rightGrip: 'pistol', left: [0.030, -0.030, -0.028], leftGrip: { axis: [-0.28, -0.94, 0], round: [0, 0, 1], girth: 0.074, spread: 0.0192, close: 0.90, index: 'wrap', thumb: 'along', drop: 0 } },
  },
  mauser: {
    name: 'Mauser C96', slotName: 'MAUSER',
    dmg: 165, headMul: 2.4, mag: 10, reserve: 90, refire: 0.16,
    reload: 2.3, auto: false, pellets: 1, spread: 0.7,
    kick: 0.7, sfx: 'shotMauser', reloadKind: 'clip',
    sightH: 0.036, sightFov: 0.90, adsTime: 0.20, adsSpread: 0.22,
    /* 7.63x25: two thirds of a .45's recoil energy, and it goes through
       what it hits. See the recoil table above the weapon list. */
    recoil: { up: 0.63, side: 0.28, climb: 0.05, recover: 12, back: 0.008, roll: 0.003, impulse: 5 },
    pierce: 1, pierceFalloff: 0.70,
    ammo: { clip: { count: 10, pitch: 0.0096, round: AMMO.mau763 } },
    /* Two hands, and the second one is not decoration.
     *
     * This had `left: null` -- one hand on the grip and nothing else -- and
     * the entire carry-the-load path is gated on there being a support arm,
     * so the Mauser was the one weapon in the game that reloaded with an
     * invisible hand: the clip never appeared, on any frame, while every
     * other gun's load travelled up in plain sight. Measured: 0 of 138
     * frames.
     *
     * A C96 is loaded with the off hand pushing a stripper clip down into
     * the guide, and it is held with the off hand under the magazine
     * housing in front of the trigger guard, which is where this one goes. */
    /* NOTE, measured and left alone. This declares 62 mm of girth and the
       C96's grip part measures 54 fore-and-aft by 30 across -- about 43.
       Correcting it moved the fingers' best achievable reach from 35 mm
       to 32, which is to say it was not the cause of anything, so the
       number stays as it is rather than changing how the gun sits in the
       hand on the strength of a measurement that did not respond. The
       reach is limited by the grip being narrower than a hand, which is
       what a broomhandle is. */
    hands: { right: [-0.010, -0.020, 0.014], rightGrip: { axis: [-0.10, -0.99, 0], round: [0, 0, -1], girth: 0.062, spread: 0.0196, close: 0.98, index: 'trigger', thumb: 'over', drop: 0 },
      /* Forward of the magazine housing, on the barrel extension.
       *
       * It was 62 mm in front of the firing hand, which on a life-size
       * hand is inside it: aimed, the two came out as one skin-coloured
       * lump across the middle of the screen with the gun invisible
       * behind them. A C96 is held with the off hand well forward under
       * the barrel extension, which is both correct and 110 mm clear. */
      /* MEASURED AND REVERTED, and the result is the useful part: this
         anchor does not matter. Moved to the forend's own axis at [0.075,
         -0.034, 0], from past the end of the wood and off into a barrel,
         and every digit of this hand came back IDENTICAL -- 33, 42, 25, 25
         per cent buried, to the sample. Whatever is putting the Paralyzer's
         support hand in its copper coils is downstream of where it is
         asked to go, so moving the ask achieves nothing.

         And `glow` is not the false positive it looked like. It sounded
         like a halo -- emissive, strength 1.5 -- but buildParalyzerGlow
         makes two SOLID charge tubes 14.4 mm across, sitting in the
         waist either side of the stacked barrels from x 0.055 to 0.253.
         They are as real as the copper and belong in the surface a hand
         avoids; excluding them would put a hand through visible tubes.

         Which leaves this gun the same shape of problem as the Kill
         Streak: its forend is x 0.050 to 0.090, forty millimetres of it,
         and everywhere a support hand can actually reach past that is
         coil, charge tube or barrel. There is no wood to hold. */
      left: [0.112, -0.026, -0.020], leftGrip: { axis: [0.96, -0.28, 0], round: [0, 1, 0], girth: 0.042, spread: 0.0186, close: 0.92, index: 'wrap', thumb: 'along', drop: 0 } },
  },
  /* A rifle for the long shots across the field. Bolt action, so it is
     five rounds and then you are working the handle while they close —
     the whole of its character is that it does not forgive a miss. */
  remington: {
    name: 'Remington 700', slotName: 'REMINGTON',
    dmg: 320, headMul: 3.0, mag: 5, reserve: 50, refire: 1.05,
    reload: 3.0, auto: false, pellets: 1, spread: 0.16,
    kick: 3.0, sfx: 'shotRifle', reloadKind: 'clip',
    pierce: 1, pierceFalloff: 0.78,
    sightH: 0.098, sightFov: 0.34, adsTime: 0.34, adsSpread: 0.03, scoped: true,
    recoil: { up: 2.90, side: 0.8, climb: 0.20, recover: 7, back: 0.038, roll: 0.010, impulse: 21 },
    moveMul: 0.90, muzzleVel: 800,
    ammo: { clip: { count: 5, pitch: 0.0126, round: AMMO.rifle30 } },
    hands: { right: [-0.012, -0.028, 0.016], rightGrip: 'wrist', left: [0.328, -0.006, -0.021], leftGrip: 'woodFore' },
  },
  /* The Kill Streak. Two millimetres of bore inside forty of steel, and a
     thousand behind every one of the three rounds it holds. It goes
     through whatever is in front of what you were aiming at, and it will
     take the muzzle off the top of the screen every time. */
  killstreak: {
    name: 'The Kill Streak', slotName: 'KILL STREAK',
    dmg: 1000, headMul: 2.0, mag: 3, reserve: 21, refire: 1.55,
    reload: 3.7, auto: false, pellets: 1, spread: 0.06,
    kick: 7.0, sfx: 'shotKillStreak', reloadKind: 'clip',
    pierce: 5, pierceFalloff: 0.94,
    sightH: 0.116, sightFov: 0.20, adsTime: 0.46, adsSpread: 0.015, scoped: true,
    recoil: { up: 7.5, side: 1.6, climb: 1.30, recover: 5, back: 0.055, roll: 0.014, impulse: 29 },
    moveMul: 0.78, muzzleVel: 1400,
    ammo: { clip: { count: 5, pitch: 0.0130, round: AMMO.rifle30 } },
    // Punches armour: an anti-materiel round does not care about plate.
    punchesPlate: true,
    /* There is nowhere clean on this rifle to put a support hand, and the
       anchor is a choice between three bad places rather than a mistake.
       Measured per weapon PART by ray parity, the hand here is 17 per
       cent inside the SCOPE and 8 inside the bolt -- and the reason is
       arithmetic: the scope tube sits at y 41 to 87 mm, the barrel's top
       is at 24, and 16.5 mm of gap does not admit a 21.2 mm finger, so a
       hand wrapping this barrel anywhere under the optic has its fingers
       in the glass.
       Forward of the scope is worse. Moved to x 0.460, past both the
       scope's front at 0.210 and the bipod's mount at 0.414, the little
       finger went 58 per cent buried to 17 and the ring 42 to 25 -- and
       the middle finger went 33 to 58, because 0.460 is the middle of the
       fluted section, six scallops cut 6.2 mm into the barrel, and a hand
       laid on a fluted barrel sits in the grooves. The fleet average
       improved, 11.9 per cent to 11.6, on a trade of two fingers for one.
       What is actually clear is x 0.135 to 0.190, which is under the
       scope, and x 0.590 to 0.630, which is 600 mm out at the muzzle
       brake. This rifle needs its scope raised or its flutes shortened
       before an anchor can be right. */
    hands: { right: [-0.012, -0.030, 0.016], rightGrip: 'wrist', left: [0.200, 0.001, 0], leftGrip: 'woodFore' },
  },
  /* Belt-fed, twelve hundred a minute, and it weighs as much as the door
     it is standing behind. Fifty rounds go in about two and a half
     seconds, which is the trade. */
  mg42: {
    name: 'MG 42', slotName: 'MG 42',
    dmg: 46, headMul: 1.9, mag: 50, reserve: 350, refire: 0.05,
    reload: 4.4, auto: true, pellets: 1, spread: 1.9,
    kick: 1.5, sfx: 'shotMG42', reloadKind: 'belt',
    sightH: 0.1235, sightFov: 0.86, adsTime: 0.34, adsSpread: 0.30,
    recoil: { up: 0.55, side: 0.42, climb: 0.16, recover: 9, back: 0.010, roll: 0.004, impulse: 5 },
    moveMul: 0.76, muzzleVel: 755,
    ammo: { mag: { w: 0.062, d: 0.048, len: 0.086, curve: 0, witness: 0, round: AMMO.mauser8 } },
    /* And the anchor was in front of the grip. Sliced at the grip's own
       height the metal here runs x -38 to -27; the web was declared at
       -12, twenty millimetres forward of the nearest of it, which is the
       same fault as the Thompson's support hand and has the same effect:
       the hand closes on air and the seating search then drags it
       somewhere else. */
    hands: { right: [-0.032, -0.026, 0.016], /* It has a pistol grip and a trigger in a guard, like everything else
       on this list -- it was the one weapon whose index finger was told to
       wrap with the other three, so it closed into the grip and finished
       27 mm BEHIND its own knuckle while the other twelve reached forward
       onto their triggers. `thumb: 'up'` belongs on a spade grip, which
       this is not. */
      /* The support hand was under nothing at all. Sliced along its own
         length, this MG 42's barrel jacket runs from x 300 to 520 at y
         +67 to +100 -- and the hand was anchored at y -8, seventy-five
         millimetres below the underside of the thing it is supposed to be
         holding, and 22 mm off to one side of it. Measured 93 mm from the
         nearest metal on the gun, the worst anchor in the game by a
         factor of three, and its palm rested 0% of its skin on the
         weapon. On the jacket's underside now. */
      /* And `round` was still the spade's too. It points from the hand
         at what the hand is holding, and at [1,0,0] that is "from behind,
         toward the muzzle" -- a hand pushing the grip rather than closed
         round it. Every finger then left its knuckle sideways off the gun
         and curled forward into the air: measured, this hand touched 4%
         of the weapon where the other pistol grips touch 15 to 20. A
         pistol grip is held from the weapon's right. */
      rightGrip: { axis: [-0.06, -0.998, 0], round: [0, 0, -1], girth: 0.056, spread: 0.0192, close: 1.0, index: 'trigger', thumb: 'over', drop: 0 }, left: [0.400, 0.067, 0], leftGrip: 'tube' },
  },
  /* The two answers to plate. Both are melee, both are slow, and both are
     mystery-box only — you do not get to plan for an armoured runner, you
     get to be glad you happen to be holding one. */
  ram: {
    name: 'Battering Ram', slotName: 'BATTERING RAM',
    dmg: 480, headMul: 1.0, mag: Infinity, reserve: Infinity, refire: 1.05,
    reload: 0, auto: false, pellets: 1, spread: 0,
    kick: 3.2, sfx: 'ramHit', melee: true, range: 2.6, heavy: true,
    knockback: 9.5, sweep: 1.15,
    sightH: 0.08, sightFov: 1.0, adsTime: 0.30,
    recoil: { up: 2.2, side: 0.8, climb: 0, recover: 8 },
    /* Both hands on the HANDLES, which this ram has two of and neither
       hand was on.
       
       They were on the smooth underside of the body at y -55, z -30, and
       the note that put them there was about getting the support hand
       back from four centimetres outside the ram -- true, and it moved
       the hand onto a barrel with nothing to hold. sweep.test measures
       skin in the four quadrants round the point a hand holds and gave
       this weapon 3 of 4 on the right and 0 of 4 on the left: 0 is not a
       grip slightly off, it is a hand somewhere else.
       
       buildRamSteel welds two U-handles to the body, at x 80 and 260 in
       its own space and 100 and 280 after the origin offset, each a 22 mm
       bar 110 mm long standing 105 mm off the axis. The first points
       straight up; the second is rolled 0.9 radians, which puts it at y
       65, z 82. Both bars run along X, so both hands wrap X and `round`
       points from the hand down at the bar it holds -- straight down on
       the rear handle, down and inboard on the rolled one. Rear hand
       first, front hand forward, which is how a ram is carried.

       Measured: the left hand goes from 0 quadrants of 4 to 3 and the
       right stays at 3. So the handles are where the arithmetic said and
       the hands are on them, and neither has closed all the way round
       one -- which puts this weapon in the same bracket as the Mauser's
       and the Paralyzer's support hands rather than in a bracket of its
       own. A 22 mm bar is thinner than anything else in this game gets
       held by, so the girth was set to 24 to match it -- and that is a
       truthful declaration that changes NOTHING. Measured, both hands
       stay at exactly 3 quadrants of 4 with the girth halved. The
       Scattergun note records the same experiment on a forend, 92 mm
       declared against 48 measured, corrected to 50, quadrant split
       75/1/24/0 to 69/1/30/0. Twice now: how wide the hand is told to
       open is not what decides whether it closes round.

       Which points the same way as everything else about this row. Three
       hands sit at 3 of 4 -- these two, the Mauser's left, the
       Paralyzer's left -- and `close` is already 1.0 on all of them, so
       the missing quadrant is the far side, where the fingertips would
       come round to meet the thumb. Four fingers whose whole shape is
       one direction do not wrap a 22 mm bar, and that is the same
       structural finding as the buried-digit work: a rigid row. */
    hands: {
      right: [0.100, 0.105, 0],
      rightGrip: { axis: [1, 0, 0], round: [0, -1, 0], girth: 0.024, spread: 0.0190, close: 1.0, index: 'wrap', thumb: 'along', drop: 0 },
      left: [0.280, 0.065, 0.082],
      leftGrip: { axis: [1, 0, 0], round: [0, -0.62, -0.78], girth: 0.024, spread: 0.0190, close: 1.0, index: 'wrap', thumb: 'along', drop: 0 } },
  },
  shieldWorn: {
    name: 'Cracked Riot Shield', slotName: 'CRACKED SHIELD',
    dmg: 130, headMul: 1.0, mag: Infinity, reserve: Infinity, refire: 0.66,
    reload: 0, auto: false, pellets: 1, spread: 0,
    kick: 1.4, sfx: 'shieldHit', melee: true, range: 2.0,
    knockback: 3.8, sweep: 0.9, blocks: true,
    sightH: 0.05, sightFov: 1.0, adsTime: 0.26,
    recoil: { up: 0.9, side: 0.5, climb: 0, recover: 11 },
    /* On the shield's own hardware. SHIELD_ORIGIN is placed on the grip
       bar, so the firing hand belongs at the origin and the support arm in
       the forearm cuff, 170 mm up and 40 mm forward of it. Both hands were
       out in front of the panel holding nothing. */
    hands: { right: [0, 0, 0], rightGrip: 'haft', left: [0.040, 0.150, 0], leftGrip: { axis: [0, 0, 1], round: [-1, 0, 0], girth: 0.050, spread: 0.0190, close: 1.0, index: 'wrap', thumb: 'along', drop: 0 } },
  },
  shield: {
    name: 'Riot Shield', slotName: 'RIOT SHIELD',
    dmg: 190, headMul: 1.0, mag: Infinity, reserve: Infinity, refire: 0.58,
    reload: 0, auto: false, pellets: 1, spread: 0,
    kick: 1.4, sfx: 'shieldHit', melee: true, range: 2.1,
    knockback: 5.0, sweep: 0.9, blocks: true,
    sightH: 0.05, sightFov: 1.0, adsTime: 0.22,
    recoil: { up: 0.9, side: 0.5, climb: 0, recover: 11 },
    /* On the shield's own hardware. SHIELD_ORIGIN is placed on the grip
       bar, so the firing hand belongs at the origin and the support arm in
       the forearm cuff, 170 mm up and 40 mm forward of it. Both hands were
       out in front of the panel holding nothing. */
    hands: { right: [0, 0, 0], rightGrip: 'haft', left: [0.040, 0.150, 0], leftGrip: { axis: [0, 0, 1], round: [-1, 0, 0], girth: 0.050, spread: 0.0190, close: 1.0, index: 'wrap', thumb: 'along', drop: 0 } },
  },
  arc: {
    name: 'Arc Breaker', slotName: 'ARC BREAKER',
    dmg: 900, headMul: 1.0, mag: 6, reserve: 30, refire: 0.55,
    reload: 2.9, auto: false, pellets: 1, spread: 0,
    kick: 1.2, sfx: 'shotArc', reloadKind: 'cell',
    sightH: 0.0580, sightFov: 0.82, adsTime: 0.26,
    recoil: { up: 0.9, side: 0.2, climb: 0.2, recover: 8, back: 0.018, roll: 0.006, impulse: 9 },
    ammo: { cell: { w: 0.052, h: 0.070, d: 0.038 } },
    hands: { right: [-0.014, -0.046, 0.016], rightGrip: 'pistol', left: [0.188, -0.052, -0.020], leftGrip: { axis: [-0.10, -0.99, 0], round: [0, 0, 1], girth: 0.058, spread: 0.0196, close: 1.0, index: 'wrap', thumb: 'over', drop: 0 } },
    /* THE HIVE.
     *
     * It does not kill the thing you shot. It gets into that one's head
     * and from there into every head near it, and what dies is the
     * network. Ten thousand damage per brain, which is not a number
     * balanced against health -- it is a statement that a hijacked brain
     * is finished, whatever body it is in.
     *
     * `fail` is the small chance a brain does not take. It exists so the
     * weapon is not a switch: at one in eight, a crowd of twelve loses
     * ten or eleven and the one still walking is the one you have to
     * deal with, which is a better moment than twelve at once every
     * time.
     *
     * `resist` is a judgement call and worth saying so. A flat ten
     * thousand one-shots the Amalgamation and the boss as surely as it
     * does a walker, and those two are the only fights in the game with
     * a shape to them. Rather than exempt them -- which would need a
     * rule saying they are not on the hive, and the Amalgamation is
     * four of them fused, so it is more on the hive than anything else
     * in the room -- they are simply harder to hold: their brains
     * refuse three times in four. Hijacked, they still die. */
    hive: { radius: 3.6, dmg: 10000, fail: 0.125, max: 24 },
  },
};

/* Perks. Bought once from a wall station, kept until you die. Each one
   changes a rule rather than a number where it can — a perk you can feel
   without reading the HUD is worth three that adjust a multiplier. */
const PERKS = {
  supersoldier: {
    name: 'SUPER SOLDIER', cost: 2500, color: 0xff6a3a,
    blurb: 'Maximum health 100 to 300. Slightly quicker on your feet.',
  },
  deflect: {
    name: 'DEFLECT', cost: 2000, color: 0x66d4ff,
    blurb: 'Immune to all projectile damage.',
  },
  shieldup: {
    name: 'SHIELD UP', cost: 3000, color: 0xb08cff,
    blurb: 'Hold a shield. Nothing touches you, and they forget where you are.',
  },
  adrenaline: {
    name: 'ADRENALINE', cost: 2000, color: 0xffd23a,
    blurb: 'Faster on your feet, three minutes of sprint, slide and slide-cancel, and you reload at double speed.',
  },
};

/* ---------------- writing ----------------

   A five by seven pixel alphabet, so a sign in this game can actually say
   something. Every label in the bunker until now was either a coloured
   panel or nothing at all -- "a machine with writing on it" is not a
   texture job when there are no textures with words in them, it is a font.

   Each glyph is seven rows of five bits, low bit on the left. Rendered as
   small boxes, which at a centimetre a pixel is a stencilled sign from
   across a room and a legible one from in front of it. */
const FONT57 = {
  A: [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11], B: [0x0F, 0x11, 0x11, 0x0F, 0x11, 0x11, 0x0F],
  C: [0x0E, 0x11, 0x01, 0x01, 0x01, 0x11, 0x0E], D: [0x07, 0x09, 0x11, 0x11, 0x11, 0x09, 0x07],
  E: [0x1F, 0x01, 0x01, 0x0F, 0x01, 0x01, 0x1F], F: [0x1F, 0x01, 0x01, 0x0F, 0x01, 0x01, 0x01],
  G: [0x0E, 0x11, 0x01, 0x1D, 0x11, 0x11, 0x1E], H: [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  I: [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E], J: [0x1C, 0x08, 0x08, 0x08, 0x08, 0x09, 0x06],
  K: [0x11, 0x09, 0x05, 0x03, 0x05, 0x09, 0x11], L: [0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x1F],
  M: [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11], N: [0x11, 0x13, 0x15, 0x19, 0x11, 0x11, 0x11],
  O: [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], P: [0x0F, 0x11, 0x11, 0x0F, 0x01, 0x01, 0x01],
  Q: [0x0E, 0x11, 0x11, 0x11, 0x15, 0x09, 0x16], R: [0x0F, 0x11, 0x11, 0x0F, 0x05, 0x09, 0x11],
  S: [0x1E, 0x01, 0x01, 0x0E, 0x10, 0x10, 0x0F], T: [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0A], X: [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04], Z: [0x1F, 0x10, 0x08, 0x04, 0x02, 0x01, 0x1F],
  0: [0x0E, 0x11, 0x19, 0x15, 0x13, 0x11, 0x0E], 1: [0x04, 0x06, 0x04, 0x04, 0x04, 0x04, 0x0E],
  2: [0x0E, 0x11, 0x10, 0x08, 0x04, 0x02, 0x1F], 3: [0x1F, 0x08, 0x04, 0x08, 0x10, 0x11, 0x0E],
  4: [0x08, 0x0C, 0x0A, 0x09, 0x1F, 0x08, 0x08], 5: [0x1F, 0x01, 0x0F, 0x10, 0x10, 0x11, 0x0E],
  6: [0x0C, 0x02, 0x01, 0x0F, 0x11, 0x11, 0x0E], 7: [0x1F, 0x10, 0x08, 0x04, 0x02, 0x02, 0x02],
  8: [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E], 9: [0x0E, 0x11, 0x11, 0x1E, 0x10, 0x08, 0x06],
  ' ': [0, 0, 0, 0, 0, 0, 0], '-': [0, 0, 0, 0x1F, 0, 0, 0], '.': [0, 0, 0, 0, 0, 0x06, 0x06],
};

/* Write a word onto a wall, in boxes.
 *
 * `at` is the centre of the line; `right` and `up` are the two axes it runs
 * along, which is what lets the same call letter a machine's front, the
 * side of a crate or the lid of a box without any of them needing to be
 * axis-aligned. Returns the actors so a sign can be lit, hidden or thrown. */
function writeText(game, text, at, right, up, opts = {}) {
  const px = opts.px || 0.012;                 // one pixel
  const gap = opts.gap || 1;                   // pixels between letters
  const mat = opts.material || { color: 0xf0e6d0, texture: 'smooth', roughness: 0.55, metalness: 0 };
  const str = String(text).toUpperCase();
  const w = 5, h = 7;
  const advance = w + gap;
  const total = str.length * advance - gap;
  const out = [];
  const R = right, U = up;
  for (let i = 0; i < str.length; i++) {
    const rows = FONT57[str[i]];
    if (!rows) continue;
    const x0 = (i * advance - total / 2) * px;
    for (let r = 0; r < h; r++) {
      const bits = rows[r];
      if (!bits) continue;
      /* Runs of lit pixels become ONE box rather than five. A four letter
         word is about a hundred pixels and a hundred actors for a sign is
         a hundred draw calls nobody needs. */
      let c = 0;
      while (c < w) {
        if (!(bits & (1 << c))) { c++; continue; }
        let n = 0;
        while (c + n < w && (bits & (1 << (c + n)))) n++;
        const cx = x0 + (c + n / 2 - w / 2 + 0.5) * px;
        const cy = ((h - 1) / 2 - r) * px;
        const a = game.box({
          at: [at[0] + R[0] * cx + U[0] * cy, at[1] + R[1] * cx + U[1] * cy, at[2] + R[2] * cx + U[2] * cy],
          size: [Math.max(px * n, px * 0.9), px, px * (opts.depth || 0.5)],
          material: mat, physics: false,
        });
        // Boxes are axis-aligned; turn each one onto the sign's own plane.
        if (opts.rotation) a.setRotation(opts.rotation);
        out.push(a);
        c += n;
      }
    }
  }
  return out;
}

/* ---------------- the perk machines ----------------

   Each perk was a steel box with a coloured square on the front, and the
   four of them were the same box. They are machines now, and each one is
   its own machine: a cabinet with a lit header carrying the perk's name in
   stencilled letters, a glass front with its own bottles standing behind
   it, a dispensing slot with a flap, a coin plate, a vent, and feet.

   Every one is built from the perk's own colour, so the light it throws on
   the floor tells you which one you are walking toward before you can read
   it. */
function buildPerkMachine(game, S, id, def, at, yaw = 0) {
  const c = def.color;
  const steel = { color: 0x4a5058, texture: 'metal', roughness: 0.46, metalness: 0.7 };
  const shell = { color: 0x2c3138, texture: 'metal', roughness: 0.52, metalness: 0.55 };
  const dark = { color: 0x14171b, texture: 'metal', roughness: 0.7, metalness: 0.3 };
  const lit = { color: 0x0a0a0c, texture: 'smooth', roughness: 0.25, metalness: 0,
    emissive: c, emissiveStrength: 2.4 };
  const glass = { color: 0x9fb4c4, texture: 'smooth', roughness: 0.06, metalness: 0,
    opacity: 0.24, transparent: true };
  const X = at[0], Y = at[1], Z = at[2];
  /* Which way it faces.
   *
   * Every machine was built facing +Z whatever wall it stood against, so
   * the one on the SOUTH wall had its front, its lettering, its window and
   * its dispensing slot pressed into the concrete and its blank back to the
   * room. Yaw is in quarter turns, and only quarter turns: a vending
   * machine stands square to a wall or it is not against one.
   *
   * Everything below is written as an offset from the machine's own origin
   * with +z out of its front, and put()/dim() turn that into the world. */
  const q = ((Math.round(yaw / 90) % 4) + 4) % 4;
  const cs = [1, 0, -1, 0][q], sn = [0, 1, 0, -1][q];
  const put = (dx, dy, dz) => [X + dx * cs + dz * sn, Y + dy, Z - dx * sn + dz * cs];
  const dim = (w, h, d) => (q % 2 ? [d, h, w] : [w, h, d]);
  // The two axes a sign runs along, in world terms.
  const RIGHT = [cs, 0, -sn], UP = [0, 1, 0];
  const parts = [];
  const box = (o, sz, m, phys) => {
    const a = game.box({ at: put(o[0], o[1], o[2]), size: dim(sz[0], sz[1], sz[2]),
      material: m, static: !!phys, physics: phys !== false });
    if (phys === false) parts.push(a);
    return a;
  };
  // Cabinet: the solid part, and the only part with collision on it.
  const body = box([0, 0.80, 0], [0.74, 1.60, 0.62], shell, true);
  // Shoulders and a sloped top, so it is not a fridge.
  box([0, 1.62, 0], [0.80, 0.06, 0.68], steel, false);
  box([0, 1.70, -0.06], [0.80, 0.12, 0.50], steel, false);
  /* Header sign, lit, with the name across it.
   *
   * The pixel size is a ceiling, not a setting. Every glyph is 5 wide on
   * a 6 pixel advance, so a word of n letters is 6n-1 pixels; at the old
   * fixed 13.5 mm that is 797 mm for ADRENALINE across a sign 700 mm
   * wide, and the first and last letters hung 48 mm off either end into
   * the cabinet's dark shoulder. Fit to the sign instead and no name can
   * ever overrun it: SUPER, SOLDIER, DEFLECT, SHIELD and UP all come in
   * under the cap and are unchanged; only ADRENALINE steps down, to
   * 11.2 mm, which still stands 78 mm tall in a 220 mm band. */
  const words = def.name.split(' ');
  const SIGN_W = 0.70, MARGIN = 0.02;
  const fit = (word, cap) => Math.min(cap, (SIGN_W - 2 * MARGIN) / (word.length * 6 - 1));
  box([0, 1.44, 0.33], [SIGN_W, 0.22, 0.034], lit, false);
  for (const a of writeText(game, words[0], put(0, 1.44, 0.355), RIGHT, UP,
    { px: fit(words[0], 0.0135), material: { color: 0x07080a, texture: 'smooth', roughness: 0.8 } })) parts.push(a);
  if (words[1]) {
    box([0, 1.22, 0.33], [SIGN_W, 0.18, 0.034], lit, false);
    for (const a of writeText(game, words[1], put(0, 1.22, 0.355), RIGHT, UP,
      { px: fit(words[1], 0.0115), material: { color: 0x07080a, texture: 'smooth', roughness: 0.8 } })) parts.push(a);
  }
  /* The window, its frame, and what is behind it.
     Nothing here is under 26 mm in any axis. A pane of glass is 6 mm in
     life and reads as a flat card at that scale -- and the sweep's check
     for paper-thin geometry, which exists because a 2D card standing in the
     bunker is exactly the fault it was written for, is right to flag it. */
  box([0, 0.86, 0.315], [0.56, 0.62, 0.032], glass, false);
  for (const sx of [-1, 1]) box([sx * 0.30, 0.86, 0.315], [0.06, 0.68, 0.05], steel, false);
  box([0, 1.19, 0.315], [0.66, 0.05, 0.05], steel, false);
  box([0, 0.53, 0.315], [0.66, 0.05, 0.05], steel, false);
  /* Two shelves of bottles standing in the dark behind the glass.
     Stock, not hero models: three a shelf and three pieces each rather than
     the full seven-piece bottle. Ten detailed bottles per machine is
     seventy actors apiece and two hundred and eighty across the four, all
     of them behind a pane of glass in a dark cabinet where the difference
     between a crimped cap and a cylinder cannot be seen. The one that comes
     out of the slot and into your hand is the detailed one. */
  for (let r = 0; r < 2; r++) {
    box([0, 0.62 + r * 0.30, 0.16], [0.54, 0.032, 0.26], dark, false);
    for (let k = -1; k <= 1; k++) {
      const bx2 = k * 0.155, by2 = 0.70 + r * 0.30;
      box([bx2, by2, 0.16], [0.048, 0.075, 0.048],
        { color: 0x2a3a30, texture: 'smooth', roughness: 0.1, opacity: 0.6, transparent: true }, false);
      box([bx2, by2 + 0.004, 0.16], [0.052, 0.030, 0.052],
        { color: def.color, texture: 'fabric', roughness: 0.8 }, false);
      box([bx2, by2 + 0.052, 0.16], [0.024, 0.030, 0.024],
        { color: 0xb9a15c, texture: 'metal', roughness: 0.35, metalness: 0.9 }, false);
    }
  }
  // Dispensing slot, with a flap that swings when one comes out.
  box([0, 0.26, 0.315], [0.34, 0.035, 0.05], steel, false);
  const flap = game.box({ at: put(0, 0.20, 0.325), size: dim(0.32, 0.13, 0.026),
    material: dark, physics: false });
  parts.push(flap);
  box([0, 0.135, 0.20], [0.30, 0.032, 0.24], dark, false);
  // Coin plate, a slot in it, and a vent down the side.
  box([0.26, 0.42, 0.315], [0.16, 0.20, 0.032], steel, false);
  box([0.26, 0.46, 0.328], [0.015, 0.06, 0.01], dark, false);
  /* The vent, as a louvre rather than six floating slivers -- six boxes
     14 mm thick and 300 mm long is a stack of cards, and that is exactly
     the shape that reads as a 2D glitch when you walk past it. */
  box([-0.305, 0.40, 0.20], [0.03, 0.26, 0.34], dark, false);
  for (let k = 0; k < 5; k++) {
    box([-0.318, 0.315 + k * 0.045, 0.20], [0.026, 0.026, 0.30], steel, false);
  }
  // Feet, so it stands on the floor rather than growing out of it.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box([sx * 0.30, 0.025, sz * 0.24], [0.09, 0.05, 0.09], dark, false);
  }
  /* A lit edge round the window rather than a lit panel across it: a full
     pane of emissive colour covered the glass, the shelves and every bottle
     behind it, and seeing into it is what a window is for. */
  const strip = { color: 0x0a0a0c, texture: 'smooth', roughness: 0.3, emissive: c, emissiveStrength: 2.2 };
  const glow = box([0, 1.175, 0.325], [0.58, 0.026, 0.022], strip, false);
  box([0, 0.545, 0.325], [0.58, 0.026, 0.022], strip, false);
  for (const sx of [-1, 1]) box([sx * 0.29, 0.86, 0.325], [0.026, 0.65, 0.022], strip, false);
  const lightAt = put(0, 1.0, 0.7);
  const light = game.light({ at: lightAt, color: c, intensity: 7, radius: 3.4 });
  return { id, def, at: put(0, 1.0, 0.55), glow, body, parts, flap, light,
    face: put(0, 0.30, 0.42), yaw: q * 90 };
}

/* Buying one, which takes as long as drinking one.
 *
 * Five seconds, and every part of it is on screen: the machine kicks the
 * bottle out of its slot fast enough that you have to catch it, the hand
 * takes it out of the air, the thumb goes under the cap and flicks it off,
 * it goes up, and the empty is thrown away. The perk lands when the bottle
 * is empty rather than when the money leaves -- which is also five seconds
 * in a room that does not stop, and that is the point.
 *
 * The bottle is a real model in the hand, not a sprite: the same one that
 * was standing behind the glass a moment ago. */
function startDrink(game, S, P, hud, sfx, st) {
  if (S.drink) return;
  const at = st.face;
  const b = buildPerkBottle(game, st.def, [at[0], at[1], at[2]], 1);
  const holder = game.box({ at: [at[0], at[1], at[2]], size: 0.01, physics: false, visible: false });
  for (const q of b.parts) { q.parent = holder; }
  // Re-centre the parts on the holder now they are parented to it.
  let k = 0;
  const ys = [-0.055, 0.000, 0.000, 0.062, 0.086, 0.101, 0.005];
  for (const q of b.parts) { q.setPosition([0, ys[k] || 0, 0]); k++; }
  const cap = b.parts[5];
  if (S.perkFlap) void S.perkFlap;
  sfx.perkPop ? sfx.perkPop() : sfx.buy();
  S.drink = { st, holder, parts: b.parts, cap, t: 0, dur: 5.0, done: false, flap: st.flap,
    from: at.slice(), thrown: false };
}

/* Run it. Five beats, and the hand is where the bottle is for four of them. */
function updateDrink(game, S, P, hud, sfx, dt) {
  const D = S.drink;
  if (!D) return;
  D.t += dt;
  const f = Math.min(1, D.t / D.dur);
  const cam = game.camera;
  // The hand's position, in front of the eye and a little to the right.
  const eye = cam.position;
  const fwd = _vTmp1.copy(cam.target).sub(eye).normalize();
  // Right and up from the view direction. These little vector helpers carry
  // cross(), not crossVectors(), so the order is this-cross-argument.
  const right = _vTmp2.set(fwd.x, fwd.y, fwd.z).cross({ x: 0, y: 1, z: 0 }).normalize();
  const up = { x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x };
  const hand = (out2, into2, rise) => [
    eye.x + fwd.x * out2 + right.x * into2 + up.x * rise,
    eye.y + fwd.y * out2 + right.y * into2 + up.y * rise,
    eye.z + fwd.z * out2 + right.z * into2 + up.z * rise,
  ];
  if (f < 0.16) {
    // Out of the slot, fast, on an arc toward the hand.
    const u = f / 0.16;
    const to = hand(0.34, 0.13, -0.18);
    const p = [
      D.from[0] + (to[0] - D.from[0]) * u,
      D.from[1] + (to[1] - D.from[1]) * u + Math.sin(u * Math.PI) * 0.35,
      D.from[2] + (to[2] - D.from[2]) * u,
    ];
    D.holder.setPosition(p);
    D.holder.setRotation([u * 520, u * 300, 0]);
    if (D.flap) D.flap.setRotation([Math.sin(u * Math.PI) * 62, 0, 0]);
  } else if (f < 0.30) {
    // Caught, and turned upright.
    const u = (f - 0.16) / 0.14;
    D.holder.setPosition(hand(0.34, 0.13, -0.18 + u * 0.04));
    D.holder.setRotation([(1 - u) * 40, 0, (1 - u) * -30]);
    if (D.flap) D.flap.setRotation([0, 0, 0]);
  } else if (f < 0.40) {
    // The thumb goes under the cap and flicks it off.
    if (!D.popped) {
      D.popped = true;
      sfx.perk();
      if (D.cap) {
        D.cap.parent = null;
        const c = D.cap.position;
        const fly = game.cylinder({ at: [c.x, c.y, c.z], radius: 0.017, height: 0.012,
          material: { color: 0xb9a15c, texture: 'metal', roughness: 0.35, metalness: 0.9 },
          lifetime: 5, mass: 0.008, velocity: [right.x * 1.4 + fwd.x, 1.6, right.z * 1.4 + fwd.z],
          bounce: 0.4, friction: 0.6 });
        if (fly.body) fly.body.angularVelocity.set(9, 5, 7);
        D.cap.visible = false;
      }
    }
    D.holder.setPosition(hand(0.32, 0.12, -0.14));
  } else if (f < 0.82) {
    /* Up and back. Tipped further the emptier it gets, which is what a
       bottle being drunk actually does. */
    const u = (f - 0.40) / 0.42;
    D.holder.setPosition(hand(0.26, 0.09, -0.06 + u * 0.05));
    D.holder.setRotation([-20 - u * 78, 0, -8]);
    if (!D.gulp || D.t - D.gulp > 0.42) { D.gulp = D.t; if (sfx.gulp) sfx.gulp(); }
  } else if (!D.thrown) {
    // Thrown away, and it is a real bottle that lands and rolls.
    D.thrown = true;
    const p = D.holder.position;
    for (const q of D.parts) { if (q !== D.cap) q.destroy(); }
    const empty = game.cylinder({ at: [p.x, p.y, p.z], radius: 0.033, height: 0.104,
      material: { color: 0x2a3a30, texture: 'smooth', roughness: 0.10, opacity: 0.55, transparent: true },
      lifetime: 12, mass: 0.22, bounce: 0.25, friction: 0.7,
      velocity: [fwd.x * 3.4 + right.x * 1.2, 1.4, fwd.z * 3.4 + right.z * 1.2] });
    if (empty.body) empty.body.angularVelocity.set(7, 3, 11);
    D.holder.destroy();
    // And NOW you have the perk.
    P.perks[D.st.id] = true;
    hud.banner(D.st.def.name, '#' + D.st.def.color.toString(16).padStart(6, '0'));
    hud.perks(P.perks);
    if (D.st.id === 'supersoldier') { P.maxHp = 300; P.hp = 300; hud.damage(1); }
    if (S.bark) S.bark('perk', true);
  }
  if (f >= 1) S.drink = null;
}

/* One bottle. Not a blob: a base, a body with a waist, a shoulder, a neck,
   a crimped cap and a label band in the perk's own colour. */
function buildPerkBottle(game, def, at, scale = 1) {
  const s = scale;
  const glassM = { color: 0x2a3a30, texture: 'smooth', roughness: 0.10, metalness: 0,
    opacity: 0.55, transparent: true };
  const juice = { color: 0x101014, texture: 'smooth', roughness: 0.2, metalness: 0,
    emissive: def.color, emissiveStrength: 1.5 };
  const capM = { color: 0xb9a15c, texture: 'metal', roughness: 0.35, metalness: 0.9 };
  const parts = [];
  const cyl = (y, r, h, m) => {
    const a = game.cylinder({ at: [at[0], at[1] + y * s, at[2]], radius: r * s, height: h * s,
      material: m, physics: false });
    parts.push(a); return a;
  };
  cyl(-0.055, 0.031, 0.012, glassM);          // base
  cyl(0.000, 0.030, 0.100, juice);            // what is in it
  cyl(0.000, 0.033, 0.104, glassM);           // the glass round it
  cyl(0.062, 0.026, 0.028, glassM);           // shoulder
  cyl(0.086, 0.014, 0.026, glassM);           // neck
  cyl(0.101, 0.017, 0.012, capM);             // crimped cap
  // The label: a band round the middle in the perk's colour.
  const band = game.cylinder({ at: [at[0], at[1] + 0.005 * s, at[2]], radius: 0.0345 * s,
    height: 0.042 * s, material: { color: def.color, texture: 'fabric', roughness: 0.8 },
    physics: false });
  parts.push(band);
  return { parts, root: parts[1] };
}

const SHIELD = { duration: 5.0, cooldown: 22 };
const SLIDE = { speed: 11.5, duration: 0.62, cooldown: 1.1, height: 0.9 };

const ROUNDS = {
  countFor: (r) => Math.min(4 + Math.ceil(r * 2.6), 33),
  hpFor: (r) => (r <= 9 ? 110 + (r - 1) * 55 : 550 * Math.pow(1.09, r - 9)),
  // They hit harder as well as soak more. Without this, a late round is
  // only a longer round rather than a more dangerous one.
  dmgFor: (r) => Math.min(60, 18 + (r - 1) * 2.4),
  maxAlive: (r) => Math.min(7 + r, 13),
  spawnGap: (r) => Math.max(2.6 - r * 0.12, 0.9),
  lull: 8,
  // How fast the dead move, by round: early rounds shamble, later ones run.
  speedFor: (r, rng) => {
    if (r <= 2) return 0.9 + rng() * 0.5;
    if (r <= 5) return rng() < 0.5 ? 1.2 + rng() * 0.6 : 2.2 + rng() * 0.6;
    return rng() < 0.25 ? 1.6 : 3.0 + rng() * 1.3;
  },
};

const PLAYER = {
  /* Two seconds after the last hit, and quick once it starts: the fight is
     meant to be about position, not about nursing a health bar. */
  hp: 100, regenDelay: 2.0, regenRate: 55, lowAt: 25,
  adsSpread: 0.28,        // aimed shots tighten to this fraction of hip spread
  plankTime: 1.0,         // one second a plank, five for a window
  sprintSpeed: 7.4, walkSpeed: 4.2, adsSpeed: 2.3,
  fov: 1.0, sprintFov: 1.06,
  attackRange: 1.45, attackCooldown: 0.9,
  interactRange: 2.0,
};

/* ---------------- the script ----------------
   Two voices. Cpl. Dee "Patch" Okafor — combat engineer, dry as
   dust, talking to herself because the radio mostly talks back.
   The Nightwatchman — whoever is on the other end of that radio,
   cheerful in a way that stops being comforting.  */

const CAST = {
  /* Four voices, and they are meant to be told apart with your eyes shut.
     `voiceBox` is the throat the engine's formant synthesiser is given;
     `say` is what the browser's own synthesiser is set to underneath it,
     where the device has one. See sayLine(). */
  patch: {
    name: 'CPL. "PATCH" OKAFOR', base: 215, spread: 60, type: 'triangle', color: '#ffd27a',
    // In the room with you. Nothing between the two of you, so: no band, no rasp.
    voiceBox: { pitch: 152, tract: 1.02, rasp: 0.10, breath: 0.12, rate: 5.4, swing: 0.20,
      say: { pitch: 1.02, rate: 1.04 } },
  },
  radio: {
    name: 'THE NIGHTWATCHMAN', base: 122, spread: 26, type: 'square', color: '#7ad7ff',
    /* A man on the other end of a set. The 300-2600 band and the drive are
       most of why he sounds like a radio and not like a person; the slow
       rate is the rest of it -- he is reading, not talking. */
    voiceBox: { pitch: 106, tract: 1.14, rasp: 0.30, breath: 0.06, rate: 4.4, swing: 0.08,
      radio: true, say: { pitch: 0.74, rate: 0.92 } },
  },
  stalker: {
    name: 'STALKER', base: 88, spread: 14, type: 'sine', color: '#9de89d',
    // Close, low and mostly air. Quiet on purpose: you should lean in.
    voiceBox: { pitch: 72, tract: 1.30, rasp: 0.55, breath: 0.60, rate: 3.1, swing: 0.05,
      volume: 0.72, say: { pitch: 0.30, rate: 0.72 } },
  },
  exit42: {
    name: 'EXIT FOUR TWO', base: 244, spread: 70, type: 'square', color: '#ff9a6a',
    // Rising pitch on every syllable, fast, and never settling. Panic.
    voiceBox: { pitch: 238, tract: 0.82, rasp: 0.22, breath: 0.18, rate: 6.9, swing: 0.48,
      rise: true, say: { pitch: 1.66, rate: 1.28 } },
  },
};

/* ---------------- the people who hold the gun ----------------

   Ten of them, and the difference between them is meant to be audible
   before it is readable: each has a pitch, a spread and a waveform, so the
   blips under the subtitle are that person's voice and you learn who is
   talking without looking. What they say is the other half.

   Every line here is written for this game. None of them are quotes.

   `lines` is keyed by event. A character who has nothing to say about an
   event falls through to COMMON, so nothing is ever silent, and the picker
   never repeats a line until it has been through the set. */
const HEROES = {
  adams: {
    name: 'CPL. ADAMS',
    bio: 'Eighty-five. Soviet officer. Pinned here when the line broke and never got the order to leave.',
    voice: { base: 104, spread: 20, type: 'sawtooth', color: '#d8a05a' },
    voiceBox: { pitch: 88, tract: 1.17, rasp: 0.62, breath: 0.16, rate: 3.9, swing: 0.09, say: { pitch: 0.62, rate: 0.80 } }, // 85, a career of shouting over artillery
    /* What you actually see of a character in a first-person game is two
       forearms. So that is where the ten of them are made to differ: skin,
       and what the sleeve is made of. Bear in mind the skin texture bakes
       its own warmth and the subsurface term adds red on top, so these
       bases run cold -- a hex that looks grey here lands on skin. */
    look: { skin: 0xaba5a2, rough: 0.80, sleeve: 0x3a3c31, sleeveTex: 'fabric', sleeveRough: 0.97 }, // Soviet greatcoat wool, and eighty-five years of weather
    /* Eighty-five, and still standing like a man at attention because he
       has never been told to stand any other way. Heavy Soviet frame gone
       thin at the shoulders, close grey crop, a moustache he has had
       longer than most people here have been alive, and the greatcoat. */
    body: { build: 1.02, height: 1.78, faceType: 'heavy', seed: 17, outfit: 'greatcoat', eyes: 0x5a6a72,
      hair: 'crop', hairColor: 0x8f8b84, beard: 'moustache', beardColor: 0x9a958d },
    lines: {
      pick: ['I was told to hold this position. Nobody has told me otherwise.'],
      start: ['Another night. The night is not the problem.',
        'Stand where you can see the door. Everything else is detail.'],
      roundStart: ['Here they come. Count them if it helps you.',
        'Positions.', 'Again.'],
      roundClear: ['Quiet. Use it.', 'Reload now. Not later.'],
      deepRound: ['I have been in worse. Not many. But worse.'],
      firstBlood: ['That one is finished.'],
      headshot: ['Through the eye. Old habit.', 'Head. Always the head.'],
      multiKill: ['Three of them in a line. They should have spread out.'],
      lastStand: ['I am still standing. That is the whole of it.',
        'Not tonight. I have plans tonight.'],
      regen: ['Better. Keep moving.'],
      reload: ['Reloading. Cover the door.', 'Empty. Give me a moment.'],
      dry: ['Nothing. Nothing at all.'],
      melee: ['Close work. Fine.'],
      buyGun: ['This will do.'],
      buyPerk: ['A young man\'s advantage. I will take it.'],
      box: ['A box that gives you a rifle. I have stopped asking.'],
      boxGood: ['Now that is a weapon.'],
      door: ['Open. Do not stand in it.'],
      power: ['Lights. Every moth on the coast will know.'],
      grenade: ['Grenade. Move.'],
      boss: ['That one is armoured. Aim for what is not.'],
      bossDown: ['Down. It took long enough.'],
      amalgam: ['That is several of them wearing one skin.'],
      meteor: ['A rock from the sky. Of course.'],
      upgrade: ['The rock has done something to it. I do not ask what.'],
      bench: ['Tools. Good. A soldier should mend his own rifle.'],
      grace: ['Ten seconds. Do not waste them standing here.'],
      crawler: ['It lost its legs and kept coming. So would I.'],
      spitter: ['It spits. Do not let it land on you.'],
      death: ['So. Here.'],
      planeCrash: ['He nearly made it. They usually nearly make it.'],
    },
  },

  carlos: {
    name: 'CARLOS',
    bio: 'Kept the generators running at the depot. Knows every fuse in the building and half the prayers.',
    voice: { base: 158, spread: 32, type: 'triangle', color: '#ffb066' },
    voiceBox: { pitch: 126, tract: 1.03, rasp: 0.16, breath: 0.08, rate: 5.4, swing: 0.17, say: { pitch: 0.92, rate: 1.02 } },
    look: { skin: 0x847c76, rough: 0.70, sleeve: 0x2f3a48, sleeveTex: 'fabric', sleeveRough: 0.90 }, // depot coveralls, oil into the weave
    /* Built by twenty years of lifting things that were not designed to be
       lifted. Depot coveralls with the oil worked into them, a full black
       beard, hair tied back out of the way of the machinery. */
    body: { build: 1.14, height: 1.76, faceType: 'heavy', seed: 23, outfit: 'coveralls', eyes: 0x3a2a1c,
      hair: 'tied', hairColor: 0x1a1512, beard: 'full', beardColor: 0x171310 },
    lines: {
      pick: ['I fix things. Tonight I am fixing this.'],
      start: ['Okay. Okay. We can work with this.',
        'Windows, door, stairs. That is three things to watch. I can count to three.'],
      roundStart: ['They are up.', 'Here we go again, hermano.', 'Back to work.'],
      roundClear: ['Breathe. Board something.', 'That is one more we lived through.'],
      deepRound: ['I stopped counting rounds. I count doors now.'],
      firstBlood: ['One down. Only the whole coast to go.'],
      headshot: ['Right between them.', 'Clean.'],
      multiKill: ['All of you? All of you at once? Fine.'],
      lastStand: ['No no no — not like this.', 'Still here. Still here.'],
      regen: ['Okay. Okay, I am okay.'],
      reload: ['Reloading — hold them!', 'Give me two seconds.'],
      dry: ['Empty! Empty!'],
      melee: ['Get off me!'],
      buyGun: ['That is better than what I had.'],
      buyPerk: ['I do not know what is in this. I drank it anyway.'],
      box: ['It hums when you open it. That cannot be good.'],
      boxGood: ['Oh, that is beautiful.'],
      door: ['Door is open. New problems that way.'],
      power: ['Power is up! Everything works now — everything.'],
      grenade: ['Fire in the hole!'],
      boss: ['That one is wearing a wall.'],
      bossDown: ['It is down. Somebody tell me it is down.'],
      amalgam: ['What — what is that? That is too many arms.'],
      meteor: ['Something came down out there. Something big.'],
      upgrade: ['The rock ate my gun and gave it back angry.'],
      bench: ['A proper bench. Now I can actually do something.'],
      grace: ['Go, go — while they are still turning around!'],
      crawler: ['It is on the floor and it is faster!'],
      spitter: ['Acid — do not let it touch you!'],
      death: ['I am sorry. I am so sorry.'],
      planeCrash: ['He was almost here. He was almost here.'],
    },
  },

  sam: {
    name: 'SAM',
    bio: 'Was driving a supply run when the road stopped meaning anything. Dry, quick, and hard to rattle.',
    voice: { base: 228, spread: 42, type: 'triangle', color: '#9fd8ff' },
    voiceBox: { pitch: 196, tract: 0.88, rasp: 0.08, breath: 0.12, rate: 5.6, swing: 0.20, say: { pitch: 1.24, rate: 1.05 } },
    look: { skin: 0x9d9691, rough: 0.72, sleeve: 0x54492f, sleeveTex: 'fabric', sleeveRough: 0.95 }, // canvas driving jacket
    /* Long, rangy, and never in a hurry about anything. Canvas driving
       jacket, hair swept back off a high forehead, three days of stubble
       that has been three days of stubble for a month. */
    body: { build: 0.94, height: 1.83, faceType: 'male', seed: 31, outfit: 'driver', eyes: 0x4a5a3c,
      hair: 'swept', hairColor: 0x4a3a2a, beard: 'stubble', beardColor: 0x453629 },
    lines: {
      pick: ['I only came here for the fuel.'],
      start: ['Right. Let us be professional about this.',
        'Four windows, one door, one staircase. That is a floor plan, not a fortress.'],
      roundStart: ['Up they get.', 'Company.', 'Round two of infinity.'],
      roundClear: ['Quiet. Suspiciously quiet.', 'Board a window. Earn your keep.'],
      deepRound: ['At this point I am just curious how far this goes.'],
      firstBlood: ['That is one.'],
      headshot: ['Neat.', 'Straight through.'],
      multiKill: ['You all lined up. That was polite of you.'],
      lastStand: ['That is a lot of red. That is too much red.',
        'Fine. Fine. Walking it off.'],
      regen: ['There we go. Much better.'],
      reload: ['Reloading, do not die.', 'Give me a second — a real one.'],
      dry: ['Click. Fantastic.'],
      melee: ['Personal space.'],
      buyGun: ['Upgrade. About time.'],
      buyPerk: ['Tastes like a battery. Worth it.'],
      box: ['A magic box. Sure. Why not.'],
      boxGood: ['Oh, I am keeping this.'],
      door: ['Door is open. Try to look pleased.'],
      power: ['Power. Now the interesting things work.'],
      grenade: ['Grenade out!'],
      boss: ['Big one. Armoured. Wonderful.'],
      bossDown: ['And that is why we aim low.'],
      amalgam: ['That is several people who have stopped being several people.'],
      meteor: ['Something just landed and it was not a plane.'],
      upgrade: ['The rock rebuilt it. I am not going to argue with the rock.'],
      bench: ['A workbench. Finally, someone who thinks ahead.'],
      grace: ['Ten seconds head start. Use every one.'],
      crawler: ['Low one! Watch your feet.'],
      spitter: ['It spits. Move sideways, not backwards.'],
      death: ['Well. That is that, then.'],
      planeCrash: ['He got so close. That is the part I hate.'],
    },
  },

  chrissy: {
    name: 'CHRISSY',
    bio: 'Nineteen. Out hunting with her father until he started acting strange. Hid in an empty house for two days.',
    voice: { base: 272, spread: 50, type: 'sine', color: '#ffc0e0' },
    voiceBox: { pitch: 232, tract: 0.83, rasp: 0.05, breath: 0.30, rate: 6.4, swing: 0.30, say: { pitch: 1.42, rate: 1.16 } }, // nineteen, and frightened
    look: { skin: 0xb4aea9, rough: 0.62, sleeve: 0x6b3230, sleeveTex: 'fabric', sleeveRough: 0.98 }, // her father's flannel, far too big for her
    /* Nineteen, small, and wearing a shirt cut for a man twice her size
       because it was her father's. Long hair she has stopped tying back.
       The only one here who does not look like she chose this. */
    body: { build: 0.82, height: 1.63, faceType: 'female', seed: 5, outfit: 'flannel', eyes: 0x5a7a86,
      hair: 'long', hairColor: 0x6a4426, beard: null },
    lines: {
      pick: ['I hid for two days. I am not hiding tonight.'],
      start: ['I have hunted before. This is not that. But it is closer than nothing.',
        'Dad taught me to wait for the shot. I am going to wait for the shot.'],
      roundStart: ['They are coming.', 'Okay. Okay, here.', 'Ready. I am ready.'],
      roundClear: ['It stopped. It actually stopped.', 'Reload while it is quiet. He always said that.'],
      deepRound: ['I have lasted longer than I thought I would.'],
      firstBlood: ['Got it. I got it.'],
      headshot: ['One shot. Like he taught me.', 'Right there.'],
      multiKill: ['All of them — I got all of them!'],
      lastStand: ['I cannot — I cannot take another one.', 'Please. Please, not yet.'],
      regen: ['Okay. I am okay. I am okay.'],
      reload: ['Reloading! Do not let them in!', 'Empty — cover me!'],
      dry: ['No, no, no, not now!'],
      melee: ['Back off!'],
      buyGun: ['This is heavier than the rifle at home.'],
      buyPerk: ['That was disgusting. Do I feel different?'],
      box: ['It is glowing. Things that glow have not helped so far.'],
      boxGood: ['Oh — oh, this is good, this is really good.'],
      door: ['It is open. I do not like what is behind it.'],
      power: ['The lights came on. I forgot what that looked like.'],
      grenade: ['Throwing! Get down!'],
      boss: ['That one is huge. That one is really huge.'],
      bossDown: ['It fell. It actually fell.'],
      amalgam: ['That was people. That was people once.'],
      meteor: ['Something fell out of the sky. I felt it in the floor.'],
      upgrade: ['My gun is warm. It should not be warm.'],
      bench: ['I can fix it here? Show me. Show me how.'],
      grace: ['Go now — go, go, go!'],
      crawler: ['On the ground! It is on the ground!'],
      spitter: ['It spat at me! What is that, what is that?'],
      death: ['Dad. I tried.'],
      planeCrash: ['He was coming for us. Somebody was actually coming for us.'],
    },
  },

  rebecca: {
    name: 'REBECCA',
    bio: 'Forty. Twenty of them in a ring, a cage, or somewhere with no referee. Fights like it is arithmetic.',
    voice: { base: 202, spread: 34, type: 'triangle', color: '#ff8a8a' },
    voiceBox: { pitch: 172, tract: 0.93, rasp: 0.14, breath: 0.07, rate: 4.9, swing: 0.12, say: { pitch: 1.10, rate: 0.96 } }, // forty, and steady
    look: { skin: 0x89827c, rough: 0.66, sleeve: 0x2b2b2e, sleeveTex: 'fabric', sleeveRough: 0.99 }, // hand wraps and nothing over them
    /* Forty, and every kilogram of her is deliberate. Fighting kit and
       nothing over it: wraps to the elbow, hair shorn to the wood so
       there is nothing to grab. */
    body: { build: 1.06, height: 1.72, faceType: 'female', seed: 41, outfit: 'fighter', eyes: 0x2e2018,
      hair: 'crop', hairColor: 0x14100e, beard: null },
    lines: {
      pick: ['I have never lost a fight I understood. Let me understand this one.'],
      start: ['Footwork first. Everything else is footwork.',
        'Do not stand still and do not get surrounded. That is the whole sport.'],
      roundStart: ['Bell.', 'Round starts. Move your feet.', 'Up we go.'],
      roundClear: ['Corner. Breathe. Reload.', 'Good round. Next one is harder.'],
      deepRound: ['This is the round where people get tired and stop moving. Do not.'],
      firstBlood: ['First one.'],
      headshot: ['Head shot. Lights out.', 'Straight down the middle.'],
      multiKill: ['Four. That is a combination.'],
      lastStand: ['I have been hurt worse in a ring with a referee.',
        'Get up. Get up.'],
      regen: ['Back in it.'],
      reload: ['Reloading — hold the line.', 'Two seconds. Cover.'],
      dry: ['Dry. Working on it.'],
      melee: ['Come on then.'],
      buyGun: ['Heavier. Good.'],
      buyPerk: ['Every fighter has something in the bottle. This one is honest about it.'],
      box: ['A box that hands out weapons. Every gym has a superstition.'],
      boxGood: ['Now we are talking.'],
      door: ['Door is open. New ground, same rules.'],
      power: ['Lights up. Everybody can see everybody now.'],
      grenade: ['Grenade — clear out!'],
      boss: ['Big, slow, armoured. I have fought this exact man.'],
      bossDown: ['And he goes down like all of them.'],
      amalgam: ['That is not one opponent. Do not treat it like one.'],
      meteor: ['Something landed hard enough to move the floor.'],
      upgrade: ['It kicks worse and it hits harder. Fair trade.'],
      bench: ['Tape your hands, check your gear. Same thing.'],
      grace: ['Ten seconds. Get to open ground.'],
      crawler: ['Low! Watch the low one!'],
      spitter: ['Ranged. Break the line of sight.'],
      death: ['Beaten. Fairly, even.'],
      planeCrash: ['He was in the air. He was in the air and they still got him.'],
    },
  },

  hank: {
    name: 'HANK',
    bio: 'Big. Was big before all this and it has only become more useful. Enjoys the work more than he should.',
    voice: { base: 116, spread: 24, type: 'square', color: '#c9a06a' },
    voiceBox: { pitch: 78, tract: 1.24, rasp: 0.34, breath: 0.05, rate: 4.2, swing: 0.10, say: { pitch: 0.52, rate: 0.88 } }, // the biggest chest in the room
    look: { skin: 0x9f9792, rough: 0.74, sleeve: 0x4a5560, sleeveTex: 'fabric', sleeveRough: 0.94 }, // work shirt, sleeves rolled past the elbow
    /* The biggest thing in the bunker that is still on your side. Work
       shirt with the sleeves rolled past the elbow, a neck that does not
       narrow, and chops down both sides of a face that enjoys this. */
    body: { build: 1.34, height: 1.91, faceType: 'heavy', seed: 11, outfit: 'workshirt', eyes: 0x4a5f6a,
      hair: 'short', hairColor: 0x3a2b1e, beard: 'chops', beardColor: 0x33261a },
    lines: {
      pick: ['Point me at it.'],
      start: ['Good. A small room and a lot of them. That suits me.',
        'You lot stay behind me. There is a lot of me.'],
      roundStart: ['Come on then!', 'Up.', 'More of you. Good.'],
      roundClear: ['That is it? Already?', 'Load up. I am not tired.'],
      deepRound: ['This is the best night I have had in years.'],
      firstBlood: ['One!'],
      headshot: ['Popped it.', 'Head off.'],
      multiKill: ['All of you! All of you at once!'],
      lastStand: ['That actually hurt. That one actually hurt.',
        'Not done. Not nearly done.'],
      regen: ['Right. Better.'],
      reload: ['Reloading! Hold them off me!', 'Empty — busy!'],
      dry: ['Out! Out!'],
      melee: ['Fine. Hands it is.'],
      buyGun: ['Heavy. I like heavy.'],
      buyPerk: ['Tastes like a fight. Good.'],
      box: ['Give me something big.'],
      boxGood: ['Ha! Look at it!'],
      door: ['Door is down. Move up.'],
      power: ['Lights! Now I can see what I am hitting!'],
      grenade: ['Grenade! Down!'],
      boss: ['Finally. Something my size.'],
      bossDown: ['Down you go. Big lad.'],
      amalgam: ['That is a lot of arms for one thing.'],
      meteor: ['Something hit the field. Felt it in my boots.'],
      upgrade: ['It is heavier and it is hotter. Perfect.'],
      bench: ['I break them, I might as well learn to mend them.'],
      grace: ['Ten seconds! Run!'],
      crawler: ['On the deck! Stamp on it!'],
      spitter: ['It is spitting! Do not stand there!'],
      death: ['Ah. Should have ducked.'],
      planeCrash: ['He came for us. Nobody comes for us. And look.'],
    },
  },

  frank: {
    name: 'OLD MAN FRANK',
    bio: 'Eighty. A Black Native American in a winter trenchcoat who was fighting a war in 1855 and stepped through something that should not have been open.',
    voice: { base: 130, spread: 22, type: 'sawtooth', color: '#a8d8b8' },
    voiceBox: { pitch: 94, tract: 1.20, rasp: 0.52, breath: 0.22, rate: 3.6, swing: 0.13, say: { pitch: 0.66, rate: 0.76 } }, // eighty, warm, weathered
    look: { skin: 0x544e4b, rough: 0.82, sleeve: 0x35291f, sleeveTex: 'fabric', sleeveRough: 0.97 }, // the winter trenchcoat he walked in wearing
    /* Eighty, and he walked out of 1855 in a winter trenchcoat that has
       been through both. Long grey hair, a heavy grey beard, and a coat
       that reaches his boots. */
    body: { build: 1.00, height: 1.80, faceType: 'male', seed: 53, outfit: 'trenchcoat', eyes: 0x2a1f16,
      hair: 'long', hairColor: 0x746f68, beard: 'full', beardColor: 0x7d786f },
    lines: {
      pick: ['I walked through a door in a field and it was a hundred years later. So be it.'],
      start: ['I do not know the year and I do not know the enemy. I know the work.',
        'The coat has been through one war already. It will manage another.'],
      roundStart: ['They come.', 'Steady now.', 'Again they come.'],
      roundClear: ['Quiet. Load the piece.', 'Rest a moment. Only a moment.'],
      deepRound: ['I have stood a long night before. This one is longer.'],
      firstBlood: ['One is finished.'],
      headshot: ['Through the head. It is the only kindness left.', 'Straight and true.'],
      multiKill: ['Several at once. The line broke.'],
      lastStand: ['I have bled more than this and walked further.',
        'Not here. Not in a strange year.'],
      regen: ['The bleeding has stopped. Good.'],
      reload: ['Charging the piece! Hold!', 'A moment — I am loading.'],
      dry: ['Empty. Empty and they still come.'],
      melee: ['Then we do it close.'],
      buyGun: ['A strange rifle. It will speak the same language.'],
      buyPerk: ['Medicine, they call it. Very well.'],
      box: ['A chest that gives up a weapon. There are stories about chests.'],
      boxGood: ['Now this is a good gun. I can feel it.'],
      door: ['The door is open. Beyond is more of the same.'],
      power: ['Light without fire. I will never be used to it.'],
      grenade: ['Shell away! Down!'],
      boss: ['That one wears iron. Find where the iron ends.'],
      bossDown: ['It has fallen. Iron and all.'],
      amalgam: ['That is more than one soul in one body. That is wrong.'],
      meteor: ['A star came down. I have seen a star come down before.'],
      upgrade: ['The stone has changed the gun. I will not ask how.'],
      bench: ['A bench and tools. A man can mend his own things. Good.'],
      grace: ['Ten seconds of grace. Take the ground.'],
      crawler: ['It crawls. It does not stop.'],
      spitter: ['It throws poison! Stand aside!'],
      death: ['A hundred years for this. Well.'],
      planeCrash: ['A machine that flies, and they pulled it down. Even here.'],
    },
  },

  chris: {
    name: 'CHRIS',
    bio: 'An intelligence quotient of two hundred and forty, and no useful instinct for when to stop explaining.',
    voice: { base: 188, spread: 28, type: 'sine', color: '#b6a8ff' },
    voiceBox: { pitch: 138, tract: 0.99, rasp: 0.06, breath: 0.04, rate: 7.1, swing: 0.07, say: { pitch: 1.00, rate: 1.22 } }, // fast and level: nothing is a surprise
    look: { skin: 0xa8a29d, rough: 0.68, sleeve: 0x585c60, sleeveTex: 'fabric', sleeveRough: 0.88 }, // whatever was hanging in the laboratory
    /* Two hundred and forty points of intelligence quotient and no
       exercise at all. Narrow, slightly stooped, whatever was hanging in
       the laboratory, and a goatee he is quite pleased with. */
    body: { build: 0.86, height: 1.75, faceType: 'male', seed: 67, outfit: 'labcoat', eyes: 0x3f5a4a,
      hair: 'thick', hairColor: 0x2b241d, beard: 'goatee', beardColor: 0x261f1a },
    lines: {
      pick: ['I have modelled this. The model says run. I am overruling the model.'],
      start: ['Four ingress points, one chokepoint, one elevated position. This is survivable.',
        'They come in waves, which means they have a scheduler. Everything with a scheduler has a flaw.'],
      roundStart: ['Wave incoming. Expect roughly a third more than last time.',
        'They are up.', 'Next iteration.'],
      roundClear: ['Wave cleared. Use the interval — the interval is the only free thing here.',
        'Reload now. The cost of reloading later is much higher.'],
      deepRound: ['The difficulty curve is superlinear. At some point it wins. Not yet.'],
      firstBlood: ['One removed.'],
      headshot: ['Cranial. Three times the damage for the same round.',
        'The head is worth aiming at. The maths is not close.'],
      multiKill: ['Four in one burst. That is efficient.'],
      lastStand: ['Twenty-five health. That is one more contact. Exactly one.',
        'I would like to revise my earlier estimate.'],
      regen: ['Regenerating. Do not spend it immediately.'],
      reload: ['Reloading — I am briefly useless.', 'Magazine change. Cover the interval.'],
      dry: ['Empty. Entirely predictable and I still did it.'],
      melee: ['Suboptimal. Doing it anyway.'],
      buyGun: ['Better damage per second. Marginally worse handling. Net positive.'],
      buyPerk: ['I have no idea what is in this and I drank all of it.'],
      box: ['A random weapon dispenser. The expected value is genuinely good.'],
      boxGood: ['Oh, that is well above the mean.'],
      door: ['Door open. The map just got larger and so did the problem.'],
      power: ['Power restored. Everything that was decorative is now functional.'],
      grenade: ['Grenade — mind the radius!'],
      boss: ['Heavily armoured. The armour is not everywhere. Find the gap.'],
      bossDown: ['Down. That took more ammunition than it should have.'],
      amalgam: ['That is multiple bodies sharing a nervous system. I would love an hour with it.'],
      meteor: ['Impact, outside, roughly a hundred metres. Nothing we launched.'],
      upgrade: ['It has restructured the metal. I can see the grain and it is wrong.'],
      bench: ['Attachments. Now the numbers become interesting.'],
      grace: ['Ten seconds of invulnerability. Convert it into distance.'],
      crawler: ['Low profile — your sights are above it.'],
      spitter: ['Ranged acid. Break line of sight, it cannot lead a target.'],
      death: ['I did the sums. The sums were right. I was still here.'],
      planeCrash: ['He had the altitude. He had everything. And a biological threw acid at an aircraft.'],
    },
  },

  remi: {
    name: 'VALENTINE REMI',
    bio: 'Never once let a bad moment pass without a remark. It is not clear whether this is courage or a condition.',
    voice: { base: 198, spread: 56, type: 'triangle', color: '#ffe08a' },
    voiceBox: { pitch: 154, tract: 0.95, rasp: 0.12, breath: 0.09, rate: 5.8, swing: 0.42, say: { pitch: 1.12, rate: 1.08 } }, // the pitch does the joking
    look: { skin: 0x99918c, rough: 0.70, sleeve: 0x5c2a34, sleeveTex: 'fabric', sleeveRough: 0.86 }, // a colour nobody else would have picked
    /* Dressed, on purpose, in a colour nobody else would have picked, and
       carrying it. Hair set and holding, clean-shaven, and standing as
       though somebody is about to take a photograph. */
    body: { build: 0.96, height: 1.74, faceType: 'female', seed: 73, outfit: 'burgundy', eyes: 0x4a2f24,
      hair: 'swept', hairColor: 0x2e1f18, beard: null },
    lines: {
      pick: ['Marvellous. A small room, poor lighting, and an audience.'],
      start: ['I want it on record that I asked to be posted somewhere warm.',
        'They are slow, they are stupid, and there are thousands. Two out of three is not bad.'],
      roundStart: ['Curtain up.', 'Ah — the guests.', 'And here they are, right on time, as ever.'],
      roundClear: ['A pause! How generous of them.', 'Reload, darling. The next act is bigger.'],
      deepRound: ['I have outlived my own funeral arrangements at this point.'],
      firstBlood: ['One! Only a great many left.'],
      headshot: ['Oh, that was lovely.', 'Straight through the thinking part.'],
      multiKill: ['A group booking! Delightful.'],
      lastStand: ['This is the bit where I make a joke and it does not help.',
        'I am fine. I am very obviously not fine.'],
      regen: ['Better! Mostly better. Better-ish.'],
      reload: ['Reloading — do entertain them for me.', 'Empty! Terribly sorry!'],
      dry: ['Click. The saddest sound in the world.'],
      melee: ['Very well — the personal touch.'],
      buyGun: ['Ooh. Heavier than it looks and twice as rude.'],
      buyPerk: ['I have drunk worse in nicer rooms.'],
      box: ['A box that gives you a gun. Do not think about it. I am thinking about it.'],
      boxGood: ['Oh, you beautiful thing. Come here.'],
      door: ['A door! And behind it, more of the same, I expect.'],
      power: ['Light! Now we can all see how bad this is.'],
      grenade: ['Present for you!'],
      boss: ['Oh, they have sent the big one. I feel quite flattered.'],
      bossDown: ['Timber.'],
      amalgam: ['That is several people who have had a dreadful committee meeting.'],
      meteor: ['Something has fallen out of the sky. I refuse to be surprised.'],
      upgrade: ['The rock has improved my gun and I am choosing not to think about the rest.'],
      bench: ['A workbench! I shall be insufferable about this.'],
      grace: ['Ten seconds! Do run, it is undignified but effective.'],
      crawler: ['It has lost its legs and gained enthusiasm.'],
      spitter: ['It spits! Rude, and also corrosive!'],
      death: ['Ah. Well. It was going so well.'],
      planeCrash: ['He was in the air. Actually airborne. And they spat him out of the sky.'],
    },
  },

  rodriguez: {
    name: 'RODRIGUEZ',
    bio: 'Walks into rooms like the room has been waiting for him. Annoyingly, it usually has.',
    voice: { base: 142, spread: 38, type: 'square', color: '#ff9a5a' },
    voiceBox: { pitch: 108, tract: 1.10, rasp: 0.24, breath: 0.06, rate: 5.0, swing: 0.19, say: { pitch: 0.74, rate: 1.00 } },
    look: { skin: 0x79716c, rough: 0.69, sleeve: 0x2a211c, sleeveTex: 'plastic', sleeveRough: 0.44 }, // leather, and he knows it
    /* Walks into rooms like the room has been waiting for him. Leather,
       and he knows it. Thick dark hair, a moustache, and the shoulders to
       go with the entrance. */
    body: { build: 1.10, height: 1.81, faceType: 'male', seed: 89, outfit: 'leather', eyes: 0x241a12,
      hair: 'thick', hairColor: 0x120e0b, beard: 'moustache', beardColor: 0x100c09 },
    lines: {
      pick: ['You picked right.'],
      start: ['Small room, bad odds, no way out. My kind of night.',
        'Stay near me and stay behind me. In that order.'],
      roundStart: ['Let us go.', 'Bring it.', 'Up and at them.'],
      roundClear: ['Too easy. Say it with me.', 'Reload. Look impressive doing it.'],
      deepRound: ['At this point they are just sending them to watch.'],
      firstBlood: ['That is one for me.'],
      headshot: ['Boom. Right there.', 'Head shot. Naturally.'],
      multiKill: ['All of you! Every one of you!'],
      lastStand: ['Alright — alright, that one landed.', 'Still standing. Watch me.'],
      regen: ['Yeah. Back.'],
      reload: ['Reloading — buy me a second!', 'Dry! Hold them!'],
      dry: ['Empty! Come on!'],
      melee: ['Alright. Close.'],
      buyGun: ['Now this is a gun.'],
      buyPerk: ['Whatever is in this, give me two.'],
      box: ['Alright, box. Impress me.'],
      boxGood: ['Yes! Yes, that is the one!'],
      door: ['Door is open. Follow me.'],
      power: ['Lights on. Let them see who did this.'],
      grenade: ['Grenade — heads down!'],
      boss: ['Big one. Good. I was getting bored.'],
      bossDown: ['And down goes the big one.'],
      amalgam: ['That thing is wearing four people. Still going down.'],
      meteor: ['Something big just hit the field.'],
      upgrade: ['The rock made it meaner. So did I.'],
      bench: ['Give me ten minutes with this and a screwdriver.'],
      grace: ['Ten seconds — move!'],
      crawler: ['Low one, low one!'],
      spitter: ['It spits acid! Do not eat it!'],
      death: ['No. Not like this.'],
      planeCrash: ['He was up there. He was actually up there.'],
    },
  },
};

const HERO_ORDER = ['rodriguez', 'sam', 'adams', 'chrissy', 'rebecca', 'hank',
  'frank', 'chris', 'remi', 'carlos'];

/* Anything a character has nothing of their own to say about. Deliberately
   plain — it is a floor, not a voice. */
const COMMON = {
  roundStart: ['Here they come.'],
  roundClear: ['Clear. For now.'],
  reload: ['Reloading!'],
  dry: ['Empty!'],
  headshot: ['Head shot.'],
  firstBlood: ['One down.'],
};

/* ---------------- graphics presets ----------------

   Four tiers, and each one is a whole position rather than a slider.
   `tier` is what the renderer is told; the rest is the game's own share of
   the cost, which on this map is most of it — the battlefield outside is
   several hundred props and the lamps each cost a shadow pass.

   The frame-rate figures are the target the tier is aimed at, not a
   promise: they are what it should hold on the hardware it is meant for. */
/* The four tiers.

   The column beside each name used to promise a framerate — and had them
   the wrong way round, so LOW advertised 30-50 and ULTRA 100-200, which is
   backwards: the cheap setting is the fast one. No build can know what
   frames a machine will turn in anyway, so the column says what a tier
   costs relative to the others, which is the part that is actually true. */
const GRAPHICS = {
  /* Deliberately a machine from 1996: a quarter of the display resolution
     upscaled with no filtering at all, the palette quantised, and the
     frame rate pinned at 24 so the motion has that stutter too. It is not
     "low with a filter on" -- everything is off and the pixels are the
     point. */
  retro: {
    name: 'RETRO', tier: 'retro', target: '24 FPS, ON PURPOSE',
    blurb: 'Quarter resolution, hard pixels, a small palette and 24 frames a second.',
    far: false, decals: false, smoke: false, lamps: 4, particles: 0.2, shadows: false,
  },
  low: {
    name: 'LOW', tier: 'low', target: 'FASTEST',
    blurb: 'Simplest shapes. No bloom, no far battlefield, one shadow cascade.',
    far: false, decals: false, smoke: false, lamps: 5, particles: 0.35, shadows: true,
    // Measured at roughly a quarter of Normal's frame time.
  },
  normal: {
    name: 'NORMAL', tier: 'normal', target: 'BASELINE',
    blurb: 'What the game was built to look like.',
    far: true, decals: true, smoke: true, lamps: 99, particles: 1, shadows: true,
  },
  high: {
    name: 'HIGH', tier: 'high', target: 'COSTS MORE',
    blurb: 'Ambient occlusion, soft shadows, supersampled and sharpened back.',
    far: true, decals: true, smoke: true, lamps: 99, particles: 1.3, shadows: true,
  },
  ultra: {
    name: 'ULTRA', tier: 'ultra', target: 'COSTS MOST',
    blurb: 'Rendered at nearly twice the display and resolved down. Wants the hardware.',
    far: true, decals: true, smoke: true, lamps: 99, particles: 1.8, shadows: true,
  },
};
const GRAPHICS_ORDER = ['retro', 'low', 'normal', 'high', 'ultra'];

/* Things that are a matter of taste rather than of hardware.

   They live in the same menu below the tiers and the cursor walks straight
   from one section into the other, so there is one list and one index. */
const TOGGLES = {
  autoRepair: {
    name: 'AUTO REPAIR', def: false,
    blurb: 'Off: hold the use key to board a window. On: standing at one boards it.',
  },
  flinch: {
    name: 'HIT FLINCH', def: true,
    blurb: 'The view rolls away from a blow. Turn it off if it makes you ill.',
  },
  gore: {
    name: 'BLOOD AND GORE', def: true,
    blurb: 'Hits throw blood along the bullet\'s path and killing blows make a mess.',
  },
  shellCasings: {
    name: 'SPENT BRASS', def: true,
    blurb: 'Cases stay on the floor for a few seconds after they leave the gun.',
  },
  spokenWords: {
    name: 'SPOKEN WORDS', def: true,
    blurb: 'Lines are read aloud by the browser under the character\'s own voice. Off leaves the voice and the subtitle.',
  },
};
const TOGGLE_ORDER = ['autoRepair', 'flinch', 'gore', 'shellCasings', 'spokenWords'];

function loadToggles() {
  const out = {};
  for (const k of TOGGLE_ORDER) out[k] = TOGGLES[k].def;
  try {
    /* Versioned, and the version was bumped deliberately.

       AUTO REPAIR defaults to off, and the gate that reads it is correct
       -- measured: with it off nothing rebuilds in seven seconds standing
       at a stripped window, with it on all five boards go back. But a
       saved value overrides the default, and anyone who played a build
       from before the toggle existed has one sitting in their browser
       telling the game to board windows by proximity forever. Reading a
       new key throws those away once, so the default actually applies. */
    const raw = JSON.parse(localStorage.getItem('b9.toggles.v2') || '{}');
    for (const k of TOGGLE_ORDER) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  } catch (e) { /* a browser with storage turned off still gets the defaults */ }
  return out;
}

function saveToggles(t) {
  try { localStorage.setItem('b9.toggles.v2', JSON.stringify(t)); } catch (e) { /* no matter */ }
}

const LINES = {
  /* The rock. Nobody knows what it is and nobody is going to find out;
     what matters is that it takes a gun and gives it back worse. */
  meteorFall: [
    ['radio', 'Bunker Nine, we have something inbound and it is not ours.'],
    ['patch', 'It is not theirs either by the look of it.'],
  ],
  meteorWake: [
    ['patch', 'It took the round. It did not mind the round.'],
  ],
  amalgam: [
    ['patch', 'That is more than one of them.'],
    ['radio', 'Say again, Bunker Nine.'],
    ['patch', 'I said it is more than one of them and they have stopped arguing about it.'],
  ],
  intro: [
    ['radio', 'Good evening, Bunker Nine. Lights out on the whole coast except you.'],
    ['patch', 'Then somebody should tell whatever is out in that fog to stop knocking.'],
    ['radio', 'Board the windows, corporal. The dead do love a draught.'],
  ],
  firstBlood: [['patch', 'That one stopped. The rest of you take notes.']],
  roundStart: [
    [['radio', 'More of them coming down the hill. I count... plenty.']],
    [['patch', 'Reload, breathe. Same song, louder verse.']],
    [['radio', 'They remember this place, you know. They just do not remember why.']],
    [['patch', 'Boards will not hold forever. Good thing neither will they.']],
    [['radio', 'The generator hums, the moths are drawn. Do keep the noise up.']],
  ],
  lowAmmo: [['patch', 'Running dry. Chalk says the wall sells courage at five hundred a box.']],
  buy_thompson: [['patch', 'Eight hundred a minute says nothing else gets through that window.']],
  buy_scatter: [['patch', 'Both barrels. Subtlety went out with the lights.']],
  buy_mp5: [
    ['patch', 'Nine millimetre, thirty in the box, and it does not climb. Take it.'],
    ['radio', 'That one was not here yesterday, corporal. Do not think about that.'],
  ],
  buy_paralyzer: [
    ['patch', 'Whoever built this was not trying to kill anything. They were trying to hold it still.'],
    ['radio', 'Ten seconds of current. Ten seconds is a long time up here.'],
  ],
  buyScatter: [['patch', 'Both barrels. Subtlety went out with the lights.']],
  powerStart: [
    ['patch', 'Both hands on it. Five seconds. Do not let go.'],
    ['radio', 'Turn it, corporal. Turn it and do not look at the window.'],
  ],
  power: [
    ['patch', 'Generator is up. Bunker Nine has a heartbeat again.'],
    ['radio', 'Warm light in the window. That is how they will find you, corporal.'],
  ],
  crateOpen: [['radio', 'Ah, the supply crate. Property of no army that admits to it.']],
  crateArc: [['patch', 'This is not standard issue. This is not any issue.']],
  dealFair: [['patch', 'He gave me more than it was worth. That is somehow worse.']],
  dealRobbed: [['patch', 'That was robbery and he knows it.']],
  dealAngry: [['radio', 'Whatever is behind that counter has stopped pretending to be a shopkeeper.']],
  shopFirst: [
    ['patch', 'The door just shut behind me.'],
    ['radio', 'Then whatever is down there wants a word. There is a counter. Do not put your hands on it.'],
  ],
  boss: [
    ['radio', 'Movement on the stair. Heavy. Slow. Not stopping.'],
    ['patch', 'That is a lot of man behind a lot of plastic.'],
    ['radio', 'He cannot hold that shield up forever. Nobody can.'],
  ],
  model5: [
    ['patch', 'He was still holding it. Four chambers, and every one of them a mistake for whoever is stood behind the first.'],
  ],
  mauser: [
    ['patch', 'A Mauser. Somebody brought this a long way to end up down here.'],
  ],
  /* Said once, the first time a lamp on the tell-tale lights. It names the
     shape of the puzzle -- three, and the third one is the one that starts
     it -- without naming any of the three. The plate does the counting;
     this is only there so the plate is understood to be a counter and not
     a fault light. */
  goldFirst: [
    ['patch', 'There is a plate on the east wall with three lamps on it. One of them has just come on.'],
    ['radio', 'Then two of them have not. Whatever it is counting, it wants all three.'],
  ],
  goldSecond: [
    ['patch', 'Two lamps. Same plate.'],
    ['radio', 'One to go, Bunker Nine. Keep doing whatever it is you have been doing.'],
  ],
  gold: [
    ['patch', 'Something just came out of the east wall. A belt line.'],
    ['radio', 'Feeding what, exactly.'],
    ['patch', 'Gold. They were casting rounds in gold down here.'],
    ['radio', 'Somebody was very sure the ordinary kind would not be enough.'],
  ],
  blitz: [['radio', 'And the lightning takes the whole choir at once. Marvelous.']],
  nearDeath: [['patch', 'Still here. Angrier, but still here.']],

  /* ---- Exit Four Two ----
     He is not a pilot. That is the whole of it. Everything he says is a
     man reading a placard out loud and hoping somebody corrects him. */
  exit1: [
    ['exit42', 'Hello? Hello — is somebody there? Please say somebody is there.'],
    ['radio', 'Bunker Nine, that is not my traffic. Somebody has found a live set.'],
    ['exit42', 'My name is — they called me Exit Four Two. I am in an aircraft. I do not fly aircraft.'],
  ],
  exit2: [
    ['exit42', 'That — was that it? That is what it is meant to sound like?'],
    ['exit42', 'Alright. Alright. It is turning. It is actually turning.'],
  ],
  exit3: [
    ['exit42', 'I heard three. Three is all of them, is it? Tell me three is all of them.'],
    ['radio', 'Three is all of them, son.'],
  ],
  exit4: [
    ['exit42', 'Bearing. Bearing, yes. I am writing it on my hand.'],
  ],
  exit5: [
    ['exit42', 'I can see your lights. I can see them from here. I am coming.'],
    ['radio', 'Bunker Nine — get off the roof.'],
  ],
  exitInbound: [
    ['exit42', 'Wheels down in ninety seconds. Ninety seconds and we are all going home.'],
  ],
  exitHit: [
    ['exit42', 'Something hit the — the glass, something is on the glass, it is coming THROUGH the—'],
    ['radio', 'Exit Four Two. Exit Four Two, pull up.'],
  ],
  exitCrash: [
    ['radio', 'Exit Four Two is down. Exit Four Two is down in the trees.'],
    ['radio', '...Bunker Nine, take what he brought and hold your post.'],
  ],

  /* ---- Stalker ----
     Something in the treeline that is not one of them and is not one of us.
     Says very little and never twice. */
  stalker1: [['stalker', 'You board the windows. Good. They come through the windows.']],
  stalker2: [['stalker', 'The rock is not from here. Neither am I. Do not touch it barehanded.']],
  stalker3: [['stalker', 'I counted them tonight. There are more than there were.']],
  stalker4: [['stalker', 'The one with four arms. Leave it to the gun on the roof.']],
  stalker5: [['stalker', 'You are lasting longer than the last one. Do not let that comfort you.']],
  gameOver: [['radio', 'Rest now, Bunker Nine. I will keep a light on for the next one.']],
};

/* ---------------- procedural sound ----------------
   No audio files anywhere in the engine, so every effect is a
   little synth recipe: stacked tones and noise impacts. Voices are
   radio blips — a pitch pattern per character under a subtitle,
   the way games talked before they could talk. */

function makeSfx(game) {
  const A = game.audio;
  const t = (f, d, ty, v) => A.tone(f, d, ty, v);
  return {
    /* Guns are reports, not tones. Each one is the same noise transient at a
       different bore, with a little tonal colour on top for character —
       the mechanical ring of a slide, the crack of a rifle. The scattergun
       used to be a 950 Hz sawtooth, which is the noise a kazoo makes and
       which is what it sounded like. */
    /* One voice per weapon.
     
       There used to be five shared sounds -- pistol, smg, scatter,
       magnum, arc -- and eighteen weapons drawing on them, so a .45
       and a 7.63 Mauser were the same noise and the Thompson and the MP5
       were indistinguishable. Every one of these is built from what the
       gun actually is: how much powder, how long the barrel, what the
       action does, and how the room answers it. */

    // .45 ACP, subsonic: no real crack, a fat low blast, hard slide.
    shot1911() {
      A.report(0.34, { crack: 0.34, crackHz: 1500, bodyHz0: 1250, bodyHz1: 240,
        thump: 0.85, thumpHz: 132, dur: 0.16, mech: 0.30, mechHz: 2600, mechLen: 0.045,
        tail: 0.16, tailLen: 0.34 });
    },
    // The same pistol with a fire load: a hiss riding out behind it.
    shotBlaze() {
      A.report(0.36, { crack: 0.40, crackHz: 1700, bodyHz0: 1400, bodyHz1: 280,
        thump: 0.8, thumpHz: 138, dur: 0.19, mech: 0.28, mechHz: 2600,
        tail: 0.22, tailHz: 1400, tailLen: 0.5 });
      t(3400, 0.20, 'sawtooth', 0.022);
    },
    /* Thompson: heavy open-bolt .45. The bolt slamming forward is half of
       what you hear, and it is the reason it chugs rather than cracks. */
    shotThompson() {
      A.report(0.40, { crack: 0.30, crackHz: 1300, bodyHz0: 1150, bodyHz1: 210,
        thump: 0.95, thumpHz: 118, dur: 0.17, mech: 0.55, mechHz: 1500, mechLen: 0.06,
        mechDelay: 0.012, tail: 0.18, tailLen: 0.30, minGap: 0.03 });
    },
    // MP5: closed bolt 9 mm, tight and high and over very fast.
    shotMP5() {
      A.report(0.20, { crack: 0.95, crackHz: 3100, crackLen: 0.030,
        bodyHz0: 1800, bodyHz1: 420, thump: 0.42, thumpHz: 168, dur: 0.10,
        mech: 0.34, mechHz: 3000, mechLen: 0.035, tail: 0.12, tailLen: 0.22, minGap: 0.02 });
    },
    // 12 gauge from a full-length barrel: a big soft boom with a long room.
    shotScatter() {
      A.report(0.92, { crack: 0.45, crackHz: 900, bodyHz0: 900, bodyHz1: 105,
        thump: 1.0, thumpHz: 82, dur: 0.34, mech: 0, tail: 0.34, tailHz: 700, tailLen: 1.0 });
    },
    /* Sawn-off: the same shell with none of the barrel to burn it in, so
       far more of it happens outside the gun. Louder, harsher, shorter. */
    shotSawn() {
      A.report(1.0, { crack: 0.80, crackHz: 1500, crackLen: 0.06, volume: 1.15,
        bodyHz0: 1500, bodyHz1: 130, thump: 1.0, thumpHz: 74, dur: 0.30,
        tail: 0.42, tailHz: 800, tailLen: 1.2 });
    },
    // The Paralyzer: a shotgun with a capacitor bank behind it.
    shotParalyzer() {
      A.report(0.80, { crack: 0.5, crackHz: 2000, bodyHz0: 1300, bodyHz1: 180,
        thump: 0.85, thumpHz: 90, dur: 0.26, tail: 0.30, tailHz: 1600, tailLen: 0.8 });
      t(2600, 0.09, 'sawtooth', 0.05);
      setTimeout(() => t(1200, 0.14, 'triangle', 0.035), 40);
    },
    // 7.63 Mauser: a little bottlenecked rifle round out of a pistol.
    shotMauser() {
      A.report(0.26, { crack: 1.0, crackHz: 3400, crackLen: 0.026,
        bodyHz0: 2000, bodyHz1: 380, thump: 0.45, thumpHz: 152, dur: 0.12,
        mech: 0.36, mechHz: 2800, tail: 0.16, tailLen: 0.30 });
    },
    /* The Model 5. Half an inch of straight-walled case out of a six-inch
       barrel in a concrete room: the loudest thing in the game, and the
       tail goes on long after the shot. */
    shotModel5() {
      A.report(1.0, { crack: 0.9, crackHz: 1800, crackLen: 0.07, volume: 1.3,
        bodyHz0: 1300, bodyHz1: 90, thump: 1.25, thumpHz: 62, dur: 0.42,
        tail: 0.55, tailHz: 900, tailLen: 1.9, minGap: 0.05 });
      setTimeout(() => t(120, 0.5, 'sine', 0.05), 20);
    },
    // The Arc Breaker: a capacitor emptying itself.
    shotArc() {
      A.report(0.34, { volume: 0.75, crack: 0.5, crackHz: 2600,
        bodyHz0: 1700, bodyHz1: 300, thump: 0.5, thumpHz: 110, dur: 0.18,
        tail: 0.25, tailHz: 2200, tailLen: 0.7 });
      t(1900, 0.05, 'sawtooth', 0.06); t(640, 0.1, 'square', 0.07);
    },
    // A full-power rifle round: a whip-crack, and the room a long time after.
    shotRifle() {
      A.report(0.62, { crack: 1.15, crackHz: 3600, crackLen: 0.05, volume: 1.1,
        bodyHz0: 1600, bodyHz1: 150, thump: 0.9, thumpHz: 96, dur: 0.26,
        tail: 0.45, tailHz: 1300, tailLen: 1.5 });
    },
    // The KillStreak: the same, with more of everything.
    shotKillStreak() {
      A.report(0.78, { crack: 1.25, crackHz: 3300, crackLen: 0.06, volume: 1.2,
        bodyHz0: 1500, bodyHz1: 120, thump: 1.05, thumpHz: 84, dur: 0.32,
        tail: 0.5, tailHz: 1100, tailLen: 1.8 });
    },
    /* MG42 at twelve hundred rounds a minute. The individual shots are not
       separable by ear -- what you hear is the belt and the bolt, which is
       why it is the one gun that gets more mech than blast. */
    shotMG42() {
      A.report(0.52, { crack: 0.85, crackHz: 2900, crackLen: 0.022, volume: 0.85,
        bodyHz0: 1500, bodyHz1: 320, thump: 0.6, thumpHz: 104, dur: 0.09,
        mech: 0.55, mechHz: 2200, mechLen: 0.030, mechDelay: 0.008,
        tail: 0.16, tailLen: 0.24, minGap: 0.012 });
    },
    /* Kept because the minigun and the turret still call for them: a
       generic burst that is nobody's signature weapon. */
    shotPistol() { A.report(0.30); t(1750, 0.022, 'square', 0.045); },
    shotSmg() { A.report(0.22, { volume: 0.9 }); t(1450, 0.018, 'square', 0.04); },
    shotMagnum() { A.report(0.72); t(2300, 0.02, 'square', 0.04); },
    dryFire() { t(1300, 0.02, 'square', 0.06); },
    magRelease() { t(1500, 0.022, 'square', 0.07); },
    magOut() { t(420, 0.05, 'square', 0.07); A.impact(0.2); },
    magIn() { t(300, 0.06, 'square', 0.09); A.impact(0.35); t(900, 0.03, 'square', 0.05); },
    slideRelease() { A.impact(0.55); t(1250, 0.035, 'square', 0.09); t(600, 0.05, 'sawtooth', 0.07); },
    hitmark() { t(2300, 0.02, 'square', 0.05); },
    headmark() { t(2800, 0.025, 'square', 0.06); t(3400, 0.02, 'square', 0.04); },
    groan(pitch) { t(58 + pitch * 30, 0.5, 'sawtooth', 0.05); t(74 + pitch * 26, 0.42, 'triangle', 0.06); },
    tear() { t(140, 0.08, 'sawtooth', 0.1); A.impact(0.25); },
    board() { A.impact(0.55); t(95, 0.06, 'square', 0.11); t(210, 0.05, 'square', 0.06); },
    nail() { A.impact(0.30); t(2100, 0.022, 'square', 0.075); t(760, 0.035, 'square', 0.05); },
    buy() { t(1250, 0.05, 'square', 0.1); t(1650, 0.06, 'square', 0.08); A.impact(0.3); },
    denied() { t(160, 0.12, 'square', 0.09); },
    doorOpen() { A.impact(0.9); t(70, 0.3, 'sawtooth', 0.12); },
    powerOn() { t(52, 0.7, 'sawtooth', 0.14); t(104, 0.5, 'sine', 0.1); t(208, 0.4, 'sine', 0.06); },
    /* A relay closing behind a steel plate, and the filament coming up
       behind it. Deliberately small: the tell-tale is confirmation, not a
       reward, and a fanfare on the second lamp would make the third one an
       anticlimax. */
    tellLamp() {
      A.impact(0.16);
      t(146, 0.05, 'square', 0.06);
      setTimeout(() => { t(880, 0.16, 'sine', 0.05); t(1320, 0.12, 'sine', 0.025); }, 60);
    },
    powerup() { for (let i = 0; i < 4; i++) setTimeout(() => t(660 * Math.pow(1.25, i), 0.09, 'triangle', 0.1), i * 70); },
    /* A vending machine letting go of a bottle: a solenoid clack, the
       bottle hitting the flap, and the flap swinging back. */
    /* A drum is two kilos of steel and brass. It does not click out, it
       drops, and it goes back in with a rock and a heavy catch. */
    drumOut() { A.impact(0.55); t(88, 0.09, 'square', 0.10); setTimeout(() => A.impact(0.3), 90); },
    drumIn() { A.impact(0.42); setTimeout(() => { A.impact(0.7); t(120, 0.07, 'square', 0.11); }, 140); },
    perkPop() {
      A.impact(0.32);
      t(96, 0.05, 'square', 0.09);
      setTimeout(() => { A.impact(0.5); t(1400, 0.05, 'triangle', 0.05); }, 110);
      setTimeout(() => t(210, 0.09, 'sine', 0.04), 190);
    },
    // A mouthful going down. Pitch falls as the bottle empties.
    gulp() {
      const f = 150 + Math.random() * 40;
      t(f, 0.09, 'sine', 0.07);
      setTimeout(() => t(f * 0.72, 0.07, 'sine', 0.05), 55);
    },
    // Glass on concrete.
    bottleDrop() { A.impact(0.35); t(2400, 0.05, 'triangle', 0.04); },
    blitz() { A.impact(1); t(60, 0.6, 'sawtooth', 0.18); t(2400, 0.3, 'sawtooth', 0.06); },
    hurt() { t(85, 0.2, 'sawtooth', 0.14); },
    heartbeat() { t(46, 0.11, 'sine', 0.2); setTimeout(() => t(40, 0.09, 'sine', 0.16), 180); },
    /* Taking a hit, in the character's own pitch. Not a word — a sound. The
       voice table gives the pitch, so Chrissy yelps and Hank barks and it
       is the same three lines of code. */
    playerGrunt(frac, voice) {
      const v = voice || { base: 170, spread: 30, type: 'sawtooth' };
      const hurt = 1 - Math.max(0, Math.min(1, frac));
      const f = v.base * (0.86 + hurt * 0.34);
      t(f, 0.13 + hurt * 0.09, v.type, 0.075);
      setTimeout(() => t(f * 0.84, 0.10, 'sine', 0.05), 80);
      A.impact(0.10, { volume: 0.5 });
    },
    /* A breath drawn through the teeth: filtered noise, in and out. */
    breath() { A.impact(0.12, { volume: 0.7 }); setTimeout(() => A.impact(0.09, { volume: 0.5 }), 330); },
    /* The wound closing. Quiet, and low enough not to be mistaken for a
       pickup — it is information, not a reward. */
    regenStart() { t(392, 0.18, 'sine', 0.055); setTimeout(() => t(523, 0.22, 'sine', 0.05), 110); },
    roundSting() {
      [220, 185, 147].forEach((f, i) => setTimeout(() => { t(f, 0.5, 'triangle', 0.12); t(f / 2, 0.55, 'sine', 0.1); }, i * 260));
    },
    roundClear() {
      [147, 196, 247].forEach((f, i) => setTimeout(() => t(f, 0.35, 'triangle', 0.1), i * 180));
    },
    crateSpin() { t(880, 0.04, 'square', 0.06); },
    vault() { A.impact(0.5); t(110, 0.1, 'sawtooth', 0.08); },
    knife() { t(2600, 0.035, 'sawtooth', 0.07); t(900, 0.06, 'triangle', 0.05); },
    spit() { t(300, 0.1, 'sawtooth', 0.09); t(160, 0.16, 'square', 0.07); },
    splat() { A.impact(0.45); t(90, 0.18, 'sawtooth', 0.1); },
    deflect() { t(1400, 0.06, 'sine', 0.09); t(2100, 0.05, 'sine', 0.06); },
    shieldUp() { for (let i = 0; i < 3; i++) setTimeout(() => t(420 + i * 190, 0.14, 'sine', 0.09), i * 55); },
    perk() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => t(f, 0.16, 'triangle', 0.1), i * 90)); },
    slide() { t(220, 0.3, 'sawtooth', 0.07); A.impact(0.3); },
    /* shotMagnum and shotPistol were declared a second time here, further
       down the same object literal. A later key wins in an object literal,
       silently, so the versions at the top of this table were dead and
       every rewrite of them changed nothing. */
    /* A gun hitting a concrete floor: the receiver landing, then the
       lighter parts of it rattling once and stopping. */
    gunDrop() {
      A.impact(0.55);
      t(180, 0.12, 'sawtooth', 0.055);
      setTimeout(() => { A.impact(0.22); t(900, 0.04, 'square', 0.04); }, 110);
      setTimeout(() => t(1400, 0.03, 'square', 0.025), 190);
    },
    gunPickup() {
      t(420, 0.05, 'triangle', 0.055);
      setTimeout(() => t(680, 0.06, 'triangle', 0.05), 60);
      A.impact(0.18);
    },
    cylinderOut() { t(520, 0.05, 'square', 0.06); t(240, 0.07, 'triangle', 0.05); },
    /* A single action coming to full cock: the sear dragging over the
       half-cock notch, then the hard click of it dropping into full. Two
       sounds, not one, and the second is the one the player is waiting
       for -- it is the gun telling them it will fire again. */
    hammerCock() {
      t(180, 0.05, 'sawtooth', 0.045);
      setTimeout(() => { t(1500, 0.018, 'square', 0.075); t(760, 0.03, 'square', 0.05); }, 42);
    },
    /* A break gun sounds nothing like a magazine. The lever, the hinge
       taking the weight of the barrels, two brass cases going in against
       the chamber walls, and the snap of the action closing. */
    breakOpen() { t(1100, 0.028, 'square', 0.07); A.impact(0.30); t(300, 0.09, 'triangle', 0.06); },
    shellIn() { t(360, 0.045, 'triangle', 0.06); setTimeout(() => t(330, 0.045, 'triangle', 0.055), 90); },
    breakShut() { A.impact(0.55); t(820, 0.035, 'square', 0.10); t(1400, 0.02, 'square', 0.05); },
    /* A bolt is a long steel noise in two parts: the handle turning up and
       the body running back, then the same in reverse with a round under it. */
    boltBack() { t(240, 0.05, 'square', 0.06); setTimeout(() => t(180, 0.11, 'sawtooth', 0.07), 60); },
    boltHome() { t(200, 0.09, 'sawtooth', 0.07); setTimeout(() => { A.impact(0.42); t(760, 0.03, 'square', 0.08); }, 90); },
    clipIn() { t(1900, 0.02, 'square', 0.05);
      for (let i = 0; i < 3; i++) setTimeout(() => t(520 - i * 40, 0.03, 'triangle', 0.05), 70 + i * 55); },
    /* The MG 42's own noises. A stamped top cover is a big thin sheet: it
       comes up with a ringing creak and goes down like a car bonnet, and
       the belt going into the tray is fifty brass links landing on steel,
       not one click. */
    coverUp() { t(420, 0.05, 'sawtooth', 0.06);
      setTimeout(() => { t(1150, 0.09, 'triangle', 0.05); A.impact(0.22); }, 70); },
    coverDown() { A.impact(0.72); t(240, 0.07, 'square', 0.11);
      setTimeout(() => { t(1600, 0.03, 'square', 0.07); t(900, 0.05, 'triangle', 0.05); }, 55); },
    beltIn() { for (let i = 0; i < 6; i++) {
      setTimeout(() => t(1500 + Math.random() * 900, 0.018, 'square', 0.045), i * 34);
    } setTimeout(() => A.impact(0.30), 170); },
    cellOut() { t(880, 0.05, 'triangle', 0.06); t(160, 0.10, 'sawtooth', 0.05); },
    cellIn() { A.impact(0.35); t(300, 0.06, 'square', 0.07);
      setTimeout(() => t(1240, 0.09, 'sine', 0.06), 80); },
    /* The bench grace: a rising two-note all-clear, and a falling one when
       it runs out and they can reach you again. */
    graceStart() { [660, 990].forEach((f, i) => setTimeout(() => t(f, 0.14, 'triangle', 0.09), i * 90)); },
    graceEnd() { [520, 390].forEach((f, i) => setTimeout(() => t(f, 0.16, 'triangle', 0.08), i * 110)); },
    /* Exit Four Two. A field telephone is a bell struck twice, a step is a
       single acknowledging beep, a drum going up is a big soft one, and the
       aeroplane hitting the trees is the largest noise this game makes. */
    phoneRing() {
      for (let k = 0; k < 2; k++) setTimeout(() => {
        for (let i = 0; i < 7; i++) setTimeout(() => t(1180, 0.03, 'triangle', 0.055), i * 42);
      }, k * 420);
    },
    exitBeep() { t(880, 0.07, 'square', 0.06); setTimeout(() => t(1320, 0.09, 'square', 0.055), 90); },
    drumBlast() { A.report(0.95, { volume: 1.1 }); setTimeout(() => A.impact(0.8), 70); },
    planeCrash() {
      A.report(1.0, { volume: 1.2 });
      for (let i = 1; i < 5; i++) setTimeout(() => A.impact(1 - i * 0.13), i * 130);
      t(48, 1.6, 'sawtooth', 0.16);
      t(31, 2.2, 'sine', 0.14);
    },
    /* The aircraft itself, heard before it is seen: two engines slightly
       out of step with each other, which is the beat you hear from a piston
       twin and the reason it sounds like an aeroplane and not a tone. */
    planeEngine() { t(96, 0.5, 'sawtooth', 0.035); t(101, 0.5, 'sawtooth', 0.033); },

    /* The small constant things.

       Footsteps were missing entirely, which is why moving felt like
       sliding: a room with a concrete floor answers when you cross it, and
       the absence of that is felt long before it is noticed. Kept very
       quiet — a sound that plays twice a second has to be almost nothing or
       it becomes the whole soundtrack. */
    step(hard) { A.impact(hard ? 0.16 : 0.11, { volume: hard ? 0.30 : 0.22 }); },
    land(force) { A.impact(Math.min(0.5, 0.22 + force * 0.3), { volume: 0.5 }); },
    jump() { t(220, 0.05, 'sine', 0.035); },
    /* Swapping weapons: cloth, then the weight of the next one arriving. */
    swap() { t(700, 0.04, 'triangle', 0.045); setTimeout(() => A.impact(0.22, { volume: 0.4 }), 90); },
    /* The window boards going on and the horde working at them from outside
       already have sounds. This is the one for a board coming off in your
       face, which had none. */
    boardLost() { A.impact(0.6); t(150, 0.13, 'sawtooth', 0.09); t(420, 0.06, 'square', 0.05); },
    cylinderIn() { A.impact(0.4); t(700, 0.05, 'square', 0.08); },
    ramHit() { A.impact(1); t(70, 0.28, 'sawtooth', 0.16); t(190, 0.12, 'square', 0.10); },
    ramSwing() { t(230, 0.16, 'sine', 0.05); },
    shieldHit() { A.impact(0.7); t(430, 0.10, 'square', 0.10); t(160, 0.16, 'sawtooth', 0.08); },
    shieldBlock() { A.impact(0.45); t(620, 0.07, 'square', 0.09); t(300, 0.09, 'triangle', 0.06); },
    blast() { A.impact(1); t(48, 0.55, 'sawtooth', 0.20); t(120, 0.30, 'square', 0.13); t(1800, 0.10, 'sawtooth', 0.06); },
    pinPull() { t(1900, 0.03, 'square', 0.06); t(900, 0.04, 'square', 0.04); },
  };
}

/* Speak a line: subtitle plus a run of radio blips in the speaker's
   register. Returns total duration so lines can queue. */
/* The chosen character speaking for themselves.

   Kept apart from say(): the radio conversations are scripted exchanges
   between two named people, whereas this is one person reacting, and it
   needs a shorter leash — a bark that steps on the last bark is the single
   fastest way to make a talkative character unbearable. So: a cooldown, a
   bag that empties before it refills so you do not hear the same line
   twice running, and a per-event chance for the ones that fire often. */
/* Saying a line out loud.
 *
 * Two layers, because neither is enough on its own.
 *
 * The engine's formant synthesiser is the one that always runs: it is
 * built here, so a character sounds identical on every machine, and the
 * throat it is given is what makes Frank eighty and Chrissy nineteen.
 * But it does not say English -- it says the RHYTHM of the line.
 *
 * The browser's own synthesiser does say English, and where it exists it
 * is layered underneath at low volume with the character's pitch and rate
 * applied. Where it does not -- and it does not, on plenty of devices --
 * nothing is missing, because the voice was never carrying the words.
 * The subtitle carries the words. This is the part everybody gets wrong:
 * building on speechSynthesis alone means the character has no voice at
 * all on the machines that lack it.
 */
let _sayVoices = null;
let _voiceOf = null;          // characterId -> SpeechSynthesisVoice
/* The words layer can be turned off, and the flag lives here rather than on
   the run state because sayLine() is called from places that do not have the
   run state in hand. */
let _spokenWords = true;
function setSpokenWords(on) {
  _spokenWords = !!on;
  if (!on) { try { speechSynthesis.cancel(); } catch (e) { void e; } }
}

/* Real voices, one each.
 *
 * The formant synthesiser in the engine gives every character a throat, and
 * it is honest about what it is: it says the rhythm of a line in a body of a
 * particular size. But ten characters out of one synthesiser at different
 * frequencies is ten settings of one voice, and that is what it sounds like.
 *
 * Every desktop and phone browser ships a set of genuinely different
 * recorded voices -- different speakers, different accents, actually
 * different people. There is no fetching anything from anywhere: they are
 * already on the machine. What was missing was USING them as voices rather
 * than as a quiet layer of words under the synth, and handing each character
 * their own instead of hashing them all into the same one.
 *
 * Assignment is stable and distinct: characters are dealt voices in a fixed
 * order from a pool sorted by how well each voice matches the character's
 * register, and a voice already dealt is not dealt again while unused ones
 * remain. So Frank and Chrissy are two different people on every machine
 * that has two voices, and the same two people every time the game opens.
 */
function voicePool() {
  if (typeof speechSynthesis === 'undefined') return [];
  if (!_sayVoices || !_sayVoices.length) {
    try { _sayVoices = speechSynthesis.getVoices() || []; } catch (e) { _sayVoices = []; }
  }
  if (!_sayVoices || !_sayVoices.length) return [];
  const en = _sayVoices.filter((v) => /^en/i.test(v.lang || ''));
  return en.length ? en : _sayVoices;
}

/* A guess at where a voice sits, from its name. Nothing else is on offer --
   the API exposes a name, a language and a flag for local or remote, and
   nothing about the speaker. Names are all most platforms give, so names are
   what this reads, and it falls back to neutral for anything it does not
   recognise rather than pretending. */
const VOICE_FEM = /(female|woman|samantha|karen|moira|tessa|fiona|victoria|allison|ava|susan|zira|hazel|serena|kate|amelie|joana|luciana|nicky|sandy|shelley|grandma)/i;
const VOICE_MASC = /(male|man|daniel|alex|fred|tom|oliver|rishi|aaron|arthur|gordon|david|mark|george|james|reed|eddy|junior|ralph|albert|grandpa)/i;
function voiceRegister(v) {
  const n = (v && v.name) || '';
  if (VOICE_FEM.test(n)) return 1;         // higher
  if (VOICE_MASC.test(n)) return -1;       // lower
  return 0;
}

/* Deal the voices out. Called once, and again if the browser fills in its
   voice list late -- which Chrome does, so a first line spoken before the
   list arrives would otherwise fix everybody on nothing. */
function assignVoices() {
  /* Read the list fresh. It is cached for the common case, but this is the
     one call that must never work from a stale copy: it runs when the
     browser says the voices changed, and a cached list would deal out
     voices the machine no longer has. */
  _sayVoices = null;
  const pool = voicePool();
  if (!pool.length) { _voiceOf = null; return false; }
  const people = [];
  for (const id of HERO_ORDER) if (HEROES[id]) people.push({ id, box: HEROES[id].voiceBox });
  for (const id of Object.keys(CAST)) people.push({ id, box: CAST[id].voiceBox });
  /* Lowest voices dealt first, so the deepest character gets first pick of
     the deepest voice on the machine rather than whatever is left after
     everybody above them has taken one. */
  people.sort((a, b) => ((a.box && a.box.pitch) || 130) - ((b.box && b.box.pitch) || 130));
  const used = new Array(pool.length).fill(0);
  const out = {};
  for (const q of people) {
    const pitch = (q.box && q.box.pitch) || 130;
    // Under about 120 Hz reads as a low voice, over about 175 as a high one.
    const want = pitch < 120 ? -1 : pitch > 175 ? 1 : 0;
    let best = null, bestScore = -1e9;
    for (let i = 0; i < pool.length; i++) {
      const v = pool[i];
      let score = -Math.abs(voiceRegister(v) - want) * 10;
      /* Least-used first, and by a wide margin. A machine with four voices
         and fourteen characters cannot give everybody their own -- but it
         can give three or four people each voice instead of handing the
         same one to all fourteen, which is what a plain "unused" bonus does
         the moment the unused ones run out. The pitch and rate on top of a
         shared voice then keep those three apart. */
      score -= used[i] * 100;
      // Local voices are recorded; remote ones need the network and may not
      // arrive at all.
      if (v.localService) score += 3;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best != null) { used[best]++; out[q.id] = pool[best]; }
  }
  _voiceOf = out;
  return true;
}

function systemVoiceFor(who) {
  if (typeof speechSynthesis === 'undefined') return null;
  // Chrome populates the list asynchronously, so a first line spoken before
  // it lands must not fix everybody on nothing: keep trying until there is
  // something to deal.
  if (!_voiceOf || !Object.keys(_voiceOf).length) assignVoices();
  return (_voiceOf && _voiceOf[who]) || null;
}
if (typeof speechSynthesis !== 'undefined') {
  try { speechSynthesis.onvoiceschanged = () => { _sayVoices = null; assignVoices(); }; } catch (e) { void e; }
}

/* How long a line will be on screen: as long as it takes to say, with a
   floor for the short ones and a fallback for a browser with the audio
   context still locked. */
function lineLength(game, text, V) {
  let spoken = 0;
  try { spoken = game.audio.speakLength(text, V || {}) || 0; } catch (e) { void e; }
  return Math.max(1.6, Math.max(spoken + 0.35, text.length * 0.042));
}

/* Recorded voices, if there are any.
 *
 * The browser's own voices are the ones every text-to-speech video on the
 * internet uses, and they sound like it. The engine's synthesiser is
 * honest but it is a synthesiser. Neither is a person.
 *
 * So: any line can have a real recording. `tools/voice-lines.js` writes out
 * every line in the game with a stable id derived from the speaker and the
 * exact words; drop `voice/<id>.mp3` next to the game and it plays instead.
 * The id is computed the same way here, so there is no lookup table to
 * drift out of step with the script.
 *
 * A manifest is fetched once at boot listing which ids exist, so a missing
 * recording costs nothing -- no failed request per line, no pause while a
 * 404 comes back. Anything not in it falls through to the synthesised
 * voice, which means a half-finished voice pack is a game with some lines
 * acted and the rest spoken, never a game with silent characters.
 */
const VOICE_DIR = 'voice/';
let _clipHave = null;          // Set of ids that exist, or null until loaded
const _clipCache = new Map();

function lineId(who, text) {
  const s = who + '|' + String(text).trim();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function loadVoicePack() {
  if (_clipHave) return;
  _clipHave = new Set();
  if (typeof fetch === 'undefined') return;
  fetch(VOICE_DIR + 'have.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((list) => { if (Array.isArray(list)) _clipHave = new Set(list); })
    .catch(() => { /* no pack; the synthesised voices carry it */ });
}

/* Play the recording if there is one. Returns its length in seconds, or 0
   if there is nothing to play -- which is the caller's signal to speak. */
function playClip(game, who, text) {
  if (!_clipHave || !_clipHave.size) return 0;
  const id = lineId(who, text);
  if (!_clipHave.has(id)) return 0;
  try {
    let a = _clipCache.get(id);
    if (!a) { a = new Audio(VOICE_DIR + id + '.mp3'); a.preload = 'auto'; _clipCache.set(id, a); }
    a.currentTime = 0;
    a.volume = 1;
    const pr = a.play();
    if (pr && pr.catch) pr.catch(() => { /* autoplay refused; subtitle stands */ });
    // duration is NaN until the file has loaded at least its header.
    return isFinite(a.duration) && a.duration > 0 ? a.duration : 0.001;
  } catch (e) { return 0; }
}

/* Say it.
 *
 * The real voice leads. Where the machine has one, it is the character
 * speaking -- at full volume, with that character's own voice, pitch and
 * rate -- and the engine's synthesiser drops to a quiet breath underneath
 * for body. Where the machine has none, the synthesiser is the voice and
 * carries the line on its own. Either way the subtitle is there.
 *
 * This was the wrong way round: the synth ran at full and the words were
 * mixed in underneath at 0.62, so ten characters came out as one instrument
 * at ten frequencies with a stock voice murmuring behind it.
 *
 * `who` names the character, so the voice dealt to them is the voice they
 * get. Falling back to the pitch means two characters with the same pitch
 * would share, which is the thing being fixed.
 */
function sayLine(game, text, V, opts = {}) {
  const say = (V && V.say) || null;
  const who = opts.who || (V && V.id) || null;
  /* A real recording beats everything and plays alone -- layering a
     synthesiser under an actor is how you make an actor sound synthetic. */
  const clip = who ? playClip(game, who, text) : 0;
  if (clip > 0) return clip > 0.01 ? clip : 0;
  let real = null;
  if (say && _spokenWords && typeof speechSynthesis !== 'undefined' && !opts.noWords) {
    real = systemVoiceFor(who);
  }
  /* Under a real voice the synth is body, not speech -- quiet, and without
     the fricatives and plosives, which would fight the consonants of a
     voice actually saying them. */
  const box = Object.assign({}, V || {}, opts.box || {});
  if (real) box.volume = (box.volume != null ? box.volume : 1) * 0.22;
  let dur = 0;
  try { dur = game.audio.speak(text, box) || 0; } catch (e) { void e; }

  if (real) {
    try {
      const u = new SpeechSynthesisUtterance(String(text));
      /* The voice is the person; pitch and rate are how that person is
         feeling. Kept near 1 so a real voice is not warped back into
         sounding like a synthesiser -- the whole point of using it is that
         it is somebody rather than a setting. */
      u.pitch = Math.max(0.55, Math.min(1.6, 1 + ((say.pitch || 1) - 1) * 0.45));
      u.rate = Math.max(0.6, Math.min(1.5, 1 + ((say.rate || 1) - 1) * 0.7));
      u.volume = opts.wordVolume != null ? opts.wordVolume : 1;
      u.voice = real;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { void e; }
  }
  return dur;
}

/* The character you picked, on the only part of them you can see.
 *
 * The arms are built once, with the weapons, long before anybody has
 * chosen anyone -- so this reassigns the materials rather than rebuilding
 * the meshes. Every weapon has its own pair of arms, so it is every
 * weapon's arms that have to change, or you would be Frank until you drew
 * the Thompson.
 *
 * Geometry is deliberately not touched. Hands that differ in shape per
 * character would mean ten sets of grip solutions per gun, and the grip is
 * the thing the player has already told me twice is wrong -- one set of
 * hands that is right is worth more than ten that are nearly. */
function applyHeroLook(game, P, hero) {
  const L = (hero && hero.look) || null;
  if (!L || !P || !P.view) return;
  const skinMat = game.material({ color: L.skin, texture: 'skin',
    roughness: L.rough != null ? L.rough : 0.72, metalness: 0, subsurface: 0.12 });
  const sleeveMat = game.material({ color: L.sleeve, texture: L.sleeveTex || 'fabric',
    roughness: L.sleeveRough != null ? L.sleeveRough : 0.96, metalness: 0, uvScale: 1.4 });
  for (const v of Object.values(P.view)) {
    const a = v.arms;
    if (!a) continue;
    for (const m of [a.skin, a.lSkin, a.thumb]) if (m) m.material = skinMat;
    for (const m of [a.sleeve, a.lSleeve]) if (m) m.material = sleeveMat;
  }
}

function makeHeroVoice(game, hud, getHero, isOver, floor) {
  const bags = {};
  const HOT = { headshot: 0.16, reload: 0.30, dry: 0.5, melee: 0.22, firstBlood: 1,
    crawler: 0.25, spitter: 0.35, multiKill: 0.55, regen: 0.5 };
  return function bark(event, force) {
    if (isOver && isOver() && !force) return;
    const hero = getHero();
    if (!hero) return;
    const now = performance.now() / 1000;
    if (now < floor.until && !force) return;
    const chance = HOT[event];
    if (chance != null && !force && Math.random() > chance) return;
    const set = (hero.lines && hero.lines[event]) || COMMON[event];
    if (!set || !set.length) return;
    const key = hero.id + ':' + event;
    if (!bags[key] || !bags[key].length) bags[key] = set.slice();
    const idx = Math.floor(Math.random() * bags[key].length);
    const text = bags[key].splice(idx, 1)[0];
    // Out loud, in this character's own voice.
    const dur = lineLength(game, text, hero.voiceBox);
    const spoken = sayLine(game, text, hero.voiceBox, { who: hero.id });
    /* Quiet until the line has finished, and then some.
     *
     * This was `dur * 0.62`, which is shorter than the line's own subtitle
     * stays on screen — so the next bark could replace a sentence you were
     * still reading, and a typical forty-five character line could be
     * followed by another one 1.2 seconds later. A character who speaks
     * every 1.2 seconds is not a character, it is a fault.
     *
     * The floor is now the line's own length plus a breath, which puts a
     * natural gap of about three and a half seconds between anything the
     * character says off their own bat. Forced lines — a round starting,
     * the boss arriving, going down, anything Exit Four Two says — skip
     * this entirely and always land. */
    floor.until = now + dur + 1.6;
    const c = { name: hero.name, color: hero.voice.color };
    hud.subtitle(c, text, dur);
    // Same rule as the radio: the blips are what you get when the voice
    // could not run, not a layer on top of it.
    if (spoken <= 0) {
      const blips = Math.min(13, Math.max(4, Math.round(text.length / 7)));
      for (let i = 0; i < blips; i++) {
        setTimeout(() => {
          const f = hero.voice.base + (Math.sin(i * 2.7) * 0.5 + Math.random() * 0.5) * hero.voice.spread;
          game.audio.tone(f, 0.05, hero.voice.type, 0.05);
        }, 70 + i * (dur * 480 / blips));
      }
    }
    return dur;
  };
}

/* One mouth at a time.

   The radio and the character kept separate clocks, so a scripted exchange
   could start while the character was mid-sentence and replace the line on
   screen — there is one subtitle slot and two things writing to it. They
   share a floor now: whoever is speaking holds it until they have finished,
   and the character's own remarks yield to the radio, which is scripted and
   is usually telling you something you need. */
function makeVoice(game, hud, isOver, floor) {
  return function say(lineSet, priority) {
    if (isOver() && !priority) return;
    const now = performance.now() / 1000;
    if (now < floor.until && !priority) return;
    let delay = 0;
    for (const [who, text] of lineSet) {
      const c = CAST[who];
      /* The subtitle has to be on screen for as long as the line takes to
         say. That length is known before anything is spoken -- speakLength
         does the same arithmetic speak() does -- which is what lets the
         whole exchange be laid out here without the second speaker landing
         on top of the first. A floor of 1.6s covers the two-word lines,
         which are spoken faster than they are read. */
      const dur = lineLength(game, text, c.voiceBox);
      setTimeout(() => {
        if (isOver() && !priority) return;
        const spoken = sayLine(game, text, c.voiceBox, { who });
        hud.subtitle(c, text, dur);
        /* Blips are the fallback, not the voice. If the synthesiser spoke
           -- audio enabled, context alive -- they would only muddy it. */
        if (spoken > 0) return;
        const blips = Math.min(14, Math.max(5, Math.round(text.length / 7)));
        for (let i = 0; i < blips; i++) {
          setTimeout(() => {
            const f = c.base + (Math.sin(i * 2.7) * 0.5 + Math.random() * 0.5) * c.spread;
            game.audio.tone(f, 0.055, c.type, 0.055);
            if (who === 'radio' && i % 3 === 0) game.audio.tone(f * 2.01, 0.03, 'square', 0.02);
          }, 90 + i * (dur * 500 / blips));
        }
      }, delay * 1000);
      // A beat between speakers, because two people in a scripted exchange
      // do not start talking the instant the other stops.
      delay += dur + 0.45;
    }
    floor.until = now + delay;
    return delay;
  };
}

/* ---------------- the bunker ----------------
   Original layout. Three spaces:

     MESS      12 x 9 m ground floor, spawn room. Two windows,
               both chalk guns, the stair gate east, the door west.
     GENERATOR 9.6 x 9 m, west. Two windows, the power switch,
               the supply crate.
     LOFT      the floor above MESS's east half. One high window,
               sandbags, the best view in a place with no views.

   Wall math: inner shells with 0.4 m slabs. Windows are 1.6 x 1.2
   openings at 0.9 sill, framed by splitting the wall run into
   sill / header / side pieces. */

/* The bunker is a square blockhouse with a roof you can fight on, one wing
   off the west wall, and a battlefield around it that you can see and never
   reach. Back wall is -Z, front is +Z, and the stairs are in the back-right
   corner, which from the door means +X and -Z. */
const MAP = {
  main:  { x0: -7.0, x1: 7.0, z0: -7.0, z1: 7.0, y0: 0, y1: 3.4 },
  // The wing behind the door on the left, where the power is.
  side:  { x0: -16.0, x1: -7.4, z0: -5.0, z1: 5.0, y0: 0, y1: 3.4 },
  // The roof deck sits on the blockhouse and is open to the sky.
  /* The deck starts below the top of the walls on purpose. Butted at
     exactly 3.4 the two faces are coincident, and a coincident edge is a
     hairline the rasteriser fills with whatever is behind it — which from
     inside the blockhouse is the sky. A line of daylight ran round the top
     of every wall. Eleven centimetres of overlap and the seam is gone. */
  roof:  { x0: -7.0, x1: 7.0, z0: -7.0, z1: 7.0, y0: 3.29, y1: 3.6, rail: 0.62 },
  /* Fifteen risers of 0.233 up a 4.05 run — 27 cm of tread, which a capsule
     walks rather than catches on. Against the east wall, climbing toward the
     back corner so the flight ends where the roof hatch is. */
  stair: { x0: 4.5, x1: 6.9, zBot: -1.35, zTop: -5.4, steps: 15 },
  // Free to climb: no gate, no cost. The way up is supposed to be obvious.
  door1: { x: -7.4, z0: -1.1, z1: 1.1, h: 2.4 },   // main <-> side wing
  // Where the meteorite came through the wing roof.
  hole:  { x: -12.6, z: 1.0, r: 1.5 },
};

/* Zombies do not appear in the room. They come up out of the ground far out
   in the battlefield and walk in, so the pads are thirty metres out and the
   window is only where they finally get through. */
const WINDOWS = [
  /* Sixteen metres out, not thirty. Far enough that you watch them come and
     have time to decide which window to stand at; near enough that the walk
     is under fifteen seconds, which at thirty was a twenty-five second
     commute per body and made round one feel empty. */
  { id: 'W1', room: 'main', inside: [-2.8, 0, -6.0], sillAt: [-2.8, 1.5, -7.2], pad: [-4.5, 0, -17.0], face: 'N', wx: [-3.6, -2.0] },
  { id: 'W2', room: 'main', inside: [ 1.2, 0, -6.0], sillAt: [ 1.2, 1.5, -7.2], pad: [ 3.5, 0, -19.5], face: 'N', wx: [ 0.4,  2.0] },
  { id: 'W3', room: 'main', inside: [ 6.0, 0,  2.0], sillAt: [ 7.2, 1.5,  2.0], pad: [ 18.5, 0, 5.0], face: 'E', wz: [ 1.2,  2.8] },
  { id: 'W4', room: 'main', inside: [-1.2, 0,  6.0], sillAt: [-1.2, 1.5,  7.2], pad: [-2.5, 0,  18.0], face: 'S', wx: [-2.0, -0.4] },
  { id: 'W5', room: 'side', inside: [-14.8, 0, -0.8], sillAt: [-16.2, 1.5, -0.8], pad: [-25.0, 0, -3.0], face: 'W', wz: [-1.6, 0.0] },
];

// Boards span X on the two walls that run along X, and Z on the other two.
const WIN_SPANS_X = (face) => face === 'N' || face === 'S';

/* ---------------- Exit Four Two ----------------

 Somebody is alive on the other end of the radio and he is not a soldier.
 He is sitting in an aircraft he has never flown, at an airfield nobody is
 left to run, and the only person who can talk him into the air is the one
 standing in a bunker being eaten.

 Five steps, and none of them is a button that says DO THE EASTER EGG.
 Each is a thing you would plausibly do anyway, done in an order that only
 makes sense once he has asked for it:

   1  ANSWER      the handset on the mess wall, once the power is on.
   2  LISTEN      hold the generator so he can hear one catch.
   3  PRIME       put a round through each of the three fuel drums.
   4  BEARING     stand on the roof facing the treeline and read it to him.
   5  LIGHTS      every window boarded at once, lit from inside.

 And then he comes. And then a spitter puts acid through the canopy.

 The steps are checked here rather than scattered through the systems they
 watch, so the whole egg is one thing you can read top to bottom. */
const EXIT42 = {
bearing: Math.PI,          // due north-ish, out over the treeline
bearingTol: 0.30,
listenFor: 2.2,            // seconds of held generator
flyIn: 16,                 // how long the aircraft is in the sky
hitAt: 0.62,               // where on that flight the acid lands
};

function buildExit42(game, S) {
/* The handset. It only matters after the power is on, so it hangs dead on
   the mess wall until then and is nothing but a prop. */
const dark = { color: 0x22252a, texture: 'smooth', roughness: 0.8, metalness: 0 };
const steel = { color: 0x4d565f, texture: 'metal', roughness: 0.5, metalness: 1 };
const at = [MAP.main.x1 - 0.34, 1.34, -1.15];
const box = game.box({ at, size: [0.18, 0.26, 0.13], material: dark, physics: false });
const cradle = game.box({ at: [at[0] - 0.11, at[1] + 0.09, at[2]], size: [0.09, 0.05, 0.16],
  material: steel, physics: false });
const handset = game.box({ at: [at[0] - 0.15, at[1] + 0.14, at[2]], size: [0.05, 0.05, 0.19],
  material: dark, physics: false });
const bell = game.light({ at: [at[0] - 0.4, at[1] + 0.2, at[2]], color: 0x7ad7ff, intensity: 0, radius: 3 });
S.exit = {
  step: 0, at, parts: [box, cradle, handset], bell, ring: 0, listen: 0,
  drums: [], plane: null, flight: 0, done: false, said: {},
};

/* Three drums out in the mud, where you can see them from a window and
   put a round through them. They are props until he asks for them. */
const rust = { color: 0x6b4a2c, texture: 'rust', roughness: 0.92, metalness: 0.25 };
for (const [dx, dz] of [[-3.4, -12.2], [6.2, -10.6], [11.4, -3.8]]) {
  const d = game.cylinder({ at: [dx, 0.44, dz], radius: 0.29, height: 0.88,
    material: rust, physics: true, mass: 0, static: true });
  for (const ry of [0.24, 0.64]) {
    game.cylinder({ at: [dx, ry, dz], radius: 0.305, height: 0.05, material: rust, physics: false });
  }
  S.exit.drums.push({ actor: d, lit: false, at: [dx, 0.44, dz] });
}
}

/* One step done. Announces itself and lets the character answer. */
function exitStep(S, hud, sfx, n, banner) {
if (S.exit.step >= n) return;
S.exit.step = n;
sfx.exitBeep();
hud.banner(banner, '#ff9a6a');
S.voice(LINES['exit' + n]);
}

function updateExit42(game, S, P, hud, sfx, dt) {
const E = S.exit;
if (!E || E.done) return;

/* 0 -> 1  The handset rings once the lights are on, and keeps ringing
   until somebody picks it up. A light behind it so you can find the wall
   it is on rather than hunting a dark room for a noise. */
if (E.step === 0) {
  if (!S.powered) return;
  E.ring -= dt;
  if (E.ring <= 0) { E.ring = 2.6; sfx.phoneRing(); }
  E.bell.intensity = 3.5 + Math.sin(S.time * 9) * 3;
  return;
}
E.bell.intensity = Math.max(0, E.bell.intensity - dt * 6);

/* 1 -> 2  He cannot find the master switch and does not believe the
   engine will catch. Hold the generator crank while he listens. */
if (E.step === 1) {
  const ps = S.powerSwitch;
  const near = ps && dist2d(P.actor.position, { x: ps.at[0], z: ps.at[2] }) < 2.6;
  /* Standing at it is not enough — he wants to hear the thing turning
     over, so the key has to be down and you have to hold it there while
     the horde is behind you. */
  if (near && S.input.useDown) {
    E.listen += dt;
    if (E.listen >= EXIT42.listenFor) exitStep(S, hud, sfx, 2, 'HE HEARD IT');
  } else E.listen = Math.max(0, E.listen - dt * 0.6);
  return;
}

/* 2 -> 3  Three drums, one round each. He counts the bangs down the
   line and primes a cylinder for every one of them. */
if (E.step === 2) {
  let lit = 0;
  for (const d of E.drums) if (d.lit) lit++;
  if (lit >= E.drums.length) exitStep(S, hud, sfx, 3, 'THREE PRIMED');
  return;
}

/* 3 -> 4  A bearing, read off the parapet. You have to be on the roof
   and looking the way he has to fly. */
if (E.step === 3) {
  const p = P.actor.position;
  if (p.y > MAP.roof.y0) {
    let d = ((game._camYaw - EXIT42.bearing) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    if (Math.abs(d) < EXIT42.bearingTol) {
      E.listen += dt;
      if (E.listen >= 1.6) { E.listen = 0; exitStep(S, hud, sfx, 4, 'BEARING PASSED'); }
    } else E.listen = 0;
  }
  return;
}

/* 4 -> 5  Runway lights: every window whole at the same time, with the
   power on behind them. It is the hardest of the five on purpose — it is
   the one that asks you to stop shooting and go and build. */
if (E.step === 4) {
  const allUp = S.windows.every((w) => w.boards.every(Boolean));
  if (allUp && S.powered) {
    exitStep(S, hud, sfx, 5, 'HE IS COMING');
    E.flight = 0;
    E.plane = buildPlane(game, S);
  }
  return;
}

/* 5  The flight. He crosses the field, banks, and lines up on the strip
   of light. At sixty-two per cent of it a spitter puts a piece of itself
   through the canopy, and the rest is a long way down. */
if (E.step === 5 && E.plane) {
  E.flight += dt;
  const u = Math.min(1, E.flight / EXIT42.flyIn);
  const pl = E.plane;
  // A long arc in from the treeline, dropping and turning as it comes.
  const x = 82 - u * 96;
  const z = -74 + u * 62;
  const y = 34 - u * 26 - (u > EXIT42.hitAt ? Math.pow((u - EXIT42.hitAt) / (1 - EXIT42.hitAt), 2) * 7 : 0);
  pl.root.setPosition([x, Math.max(1.5, y), z]);
  const bank = (u > EXIT42.hitAt ? -70 * (u - EXIT42.hitAt) / (1 - EXIT42.hitAt) : -14);
  pl.root.setRotation([bank, 34 - u * 26, -6 - u * 4]);
  if (u > 0.04 && !E.said.inbound) { E.said.inbound = true; S.voice(LINES.exitInbound); }

  if (u >= EXIT42.hitAt && !E.hit) {
    E.hit = true;
    sfx.spit();
    S.voice(LINES.exitHit);
    addShake(S, 0.5, 0.6);
  }
  if (E.hit) {
    // Smoke off the cowling and a fire that grows the whole way down.
    if (Math.random() < dt * 40) {
      game.particles.smoke([x + (Math.random() - 0.5) * 2, Math.max(1.5, y) + 1, z + (Math.random() - 0.5) * 2],
        { count: 2, color: 0x2a2622 });
    }
    if (Math.random() < dt * 22) {
      game.particles.sparks([x, Math.max(1.5, y), z],
        { count: 3, speed: 3, color: 0xffb03a, colorEnd: 0x5a1a06 });
    }
  }
  if (u >= 1) {
    exitCrash(game, S, P, hud, sfx, [x, 1.2, z]);
  }
}
}

/* The aircraft. Not much of one — it is seen from a bunker roof at fifty
 metres and then it is on fire — but it has a fuselage, a wing, a tail and
 two engines, and that is the difference between an aeroplane and a dart. */
function buildPlane(game, S) {
const skin = { color: 0x6a7078, texture: 'metal', roughness: 0.52, metalness: 1 };
const dark = { color: 0x25282c, texture: 'smooth', roughness: 0.8, metalness: 0 };
const glass = { color: 0x9fc4d8, texture: 'smooth', roughness: 0.12, metalness: 0, opacity: 0.5 };
const parts = [];
const root = game.box({ at: [0, -400, 0], size: [1, 1, 1], material: skin, physics: false });
root.visible = false;
const add = (a, at, rot) => { a.parent = root; a.setPosition(at); if (rot) a.setRotation(rot); parts.push(a); return a; };
// Fuselage, nose to tail.
const fus = game.cylinder({ radius: 0.85, height: 11.5, material: skin, physics: false });
add(fus, [0, 0, 0], [0, 0, 90]);
add(game.cone({ radius: 0.85, height: 1.8, material: skin, physics: false }), [6.4, 0, 0], [0, 0, -90]);
// Canopy, which is the part that matters later.
add(game.box({ size: [2.6, 0.7, 1.1], material: glass, physics: false }), [2.2, 0.72, 0]);
// Wing, one slab with a taper faked by a second thinner one outboard.
add(game.box({ size: [2.9, 0.30, 16.5], material: skin, physics: false }), [0.4, -0.25, 0]);
add(game.box({ size: [1.6, 0.22, 5.0], material: skin, physics: false }), [0.2, -0.25, 8.6]);
add(game.box({ size: [1.6, 0.22, 5.0], material: skin, physics: false }), [0.2, -0.25, -8.6]);
// Two engines and their discs.
for (const ez of [-3.6, 3.6]) {
  add(game.cylinder({ radius: 0.62, height: 2.6, material: dark, physics: false }), [1.5, -0.2, ez], [0, 0, 90]);
  add(game.cylinder({ radius: 1.55, height: 0.06, material: {
    color: 0x8a8a8a, texture: 'smooth', roughness: 0.4, metalness: 0, opacity: 0.28 },
    physics: false }), [2.9, -0.2, ez], [0, 0, 90]);
}
// Tail: fin and stabiliser.
add(game.box({ size: [2.2, 2.6, 0.22], material: skin, physics: false }), [-5.2, 1.3, 0]);
add(game.box({ size: [1.7, 0.20, 6.2], material: skin, physics: false }), [-5.0, 0.2, 0]);
S.exitPlane = { root, parts };
return S.exitPlane;
}

function exitCrash(game, S, P, hud, sfx, at) {
const E = S.exit;
E.done = true;
E.step = 6;
if (E.plane) { for (const q of E.plane.parts) q.visible = false; E.plane.root.visible = false; }
// A long orange bloom out in the field, and the floor moving under you.
const fl = game.light({ at: [at[0], at[1] + 3, at[2]], color: 0xffb04a, intensity: 400, radius: 60 });
fl._decay = 1.4;
for (let i = 0; i < 26; i++) {
  game.particles.sparks([at[0] + (Math.random() - 0.5) * 9, at[1] + Math.random() * 5, at[2] + (Math.random() - 0.5) * 9],
    { count: 5, speed: 14, color: 0xffd27a, colorEnd: 0x5a1a06 });
}
for (let i = 0; i < 16; i++) {
  game.particles.smoke([at[0] + (Math.random() - 0.5) * 12, at[1] + Math.random() * 8, at[2] + (Math.random() - 0.5) * 12],
    { count: 3, color: 0x1d1a17 });
}
sfx.planeCrash();
addShake(S, 1.0, 1.9);
S.voice(LINES.exitCrash, true);
// Every character has their own way of taking it. Delayed, so it lands in
// the silence after the noise rather than on top of it.
setTimeout(() => S.bark('planeCrash', true), 3200);
/* What it leaves. He was carrying what he could and it is scattered over
   a hundred metres of mud, so: everything you were out of, and the rifle
   out of the wreck. */
for (const id of Object.keys(P.ammo)) {
  if (WEAPONS[id]) { P.ammo[id].mag = WEAPONS[id].mag; P.ammo[id].reserve = WEAPONS[id].reserve; }
}
P.give('killstreak');
hud.ammo(P);
hud.pointsDelta(S.addPoints(5000));
hud.points(S.points);
hud.banner('EXIT FOUR TWO', '#ff9a6a');
}


function buildMap(game, S) {
  const MAT = {
    /* uvScale is tiles-per-face, not tiles-per-metre, and every wall and
       floor in here is a single slab twelve to fifteen metres long. At 1.3
       the 256-pixel concrete stretched across the whole of it, so each
       surface showed one magnified blotch of the texture — which is why the
       roof deck came out as a dark red-brown stain in full daylight while a
       test box beside it was properly sunlit. These tile at roughly a metre
       and a half now. */
    /* These read about three times darker than their hex suggests. The
       concrete texture multiplies albedo by its own mid-grey and then knocks
       ambient down again through the AO channel, so a nominal 0x76736c
       surface lands near 0x2a2a28. Under lamps at night nobody noticed; in
       daylight the roof deck came out black. The colours are pre-multiplied
       up to compensate — bright here, correct on screen. */
    /* Corrected once, not twice. These were pushed up to compensate for the
       concrete texture eating three quarters of the albedo; the texture
       itself is fixed now, so the same lift again just bleaches the room. */
    wall: { color: 0xa6a29a, texture: 'concrete', roughness: 0.94, metalness: 0, uvScale: 5, normalStrength: 0.45 },
    wallDark: { color: 0x827e77, texture: 'concrete', roughness: 0.95, metalness: 0, uvScale: 5 },
    floor: { color: 0x8d8981, texture: 'concrete', roughness: 0.9, metalness: 0, uvScale: 7, normalStrength: 0.45 },
    wood: { color: 0x584023, texture: 'wood', roughness: 0.8, metalness: 0, uvScale: 2 },
    board: { color: 0x7d5c36, texture: 'wood', roughness: 0.85, metalness: 0, uvScale: 3 },
    steel: { color: 0x4a4e54, texture: 'metal', roughness: 0.5, metalness: 1 },
    sand: { color: 0x8a7f5e, texture: 'fabric', roughness: 0.98, metalness: 0, uvScale: 2 },
    chalk: { color: 0xf5f2e6, texture: 'smooth', roughness: 0.9, metalness: 0, emissive: 0xcfe8ff, emissiveStrength: 0.35 },
    // Outside. Churned mud, scorched steel, and wire.
    /* uvScale is tiles-per-FACE, and this face is the whole battlefield --
       a hundred and sixty metres of it. At 3 that is one 256-pixel tile
       stretched over fifty-three metres, so at the player's feet a single
       texel covers a fifth of a metre and the strength-3 normal map built
       from it turns into a field of steep facets, every one of them
       catching a specular highlight. That is the dithered crimson mess in
       front of the camera: the dirt recipe's red channel is its strongest,
       so a blown-out one goes red.

       Exactly the mistake the walls had ("At 1.3 the 256-pixel concrete
       stretched across the whole of it"), fixed there and never checked
       here. These tile at about two metres now. */
    /* And desaturated. 0x453c2e reads as a reasonable brown as a swatch
       and is 1 : 0.76 : 0.46 once it is linear, which under a warm sun is
       terracotta. Churned wet earth is a grey-brown; it is only orange in
       a paint catalogue. */
    // For the small props -- crater spoil, mounds -- which are a metre or
    // two across. The ground plane passes its own, see buildMap.
    mud: { color: 0x4a443b, texture: 'dirt', roughness: 1.0, metalness: 0, uvScale: 2 },
    mudDark: { color: 0x2f2b25, texture: 'dirt', roughness: 1.0, metalness: 0, uvScale: 12 },
    burnt: { color: 0x2b2a28, texture: 'metal', roughness: 0.82, metalness: 1 },
    hull: { color: 0x4a4c3e, texture: 'metal', roughness: 0.72, metalness: 1, uvScale: 2 },
    wire: { color: 0x53504a, texture: 'metal', roughness: 0.6, metalness: 1 },
    cloth: { color: 0x4b4a3c, texture: 'fabric', roughness: 0.96, metalness: 0, uvScale: 3 },
    bark: { color: 0x261f1a, texture: 'wood', roughness: 0.96, metalness: 0, uvScale: 4 },
  };

  // A static slab from bounds, the whole bunker is made of these.
  /* A slab with no thickness is not a wall, it is a card.

     Two of these were being built: the partition between the wing and the
     main room ran from SD.x1 to M.x0 - W, and those are the same plane --
     the wing's east wall and the bunker's west wall are one wall, so the
     gap they were filling is zero wide. The result was a pair of
     3.4 x 4.3 metre boxes with no depth standing inside the room: lit
     from one side, invisible edge-on, and exactly the flat block the
     player kept walking into. Anything under a millimetre in any axis is
     a mistake in the arithmetic that made it, so it does not get built. */
  /* Both take an optional NAME, and it is not decoration.
   *
   * sweep.test finds pairs of faces fighting for the same plane and
   * reports whatever the actor is called. With nothing set that is
   * "actor5578", and the only way back to the line that built it is
   * arithmetic on coordinates printed to two decimals against a map
   * assembled from expressions -- which is how four of these came to be
   * left alone as not confidently locatable. A name costs a string. */
  const slab = (x0, x1, y0, y1, z0, z1, material = MAT.wall, name = null) => {
    if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
    const a = game.box({
      at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      size: [x1 - x0, y1 - y0, z1 - z0],
      material, static: true,
    });
    if (a && name) a.name = name;
    return a;
  };
  // Decoration outside the fight: drawn, never collided with.
  const deco = (x0, x1, y0, y1, z0, z1, material, name = null) => {
    if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
    const a = game.box({
      at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      size: [x1 - x0, y1 - y0, z1 - z0],
      material, physics: false,
    });
    if (a && name) a.name = name;
    return a;
  };
  // A wall run along X or Z with window holes cut into it.
  const wallX = (z0, z1, x0, x1, y1, holes = []) => {
    let cur = x0;
    for (const [hx0, hx1] of holes) {
      if (hx0 > cur) slab(cur, hx0, 0, y1, z0, z1);
      slab(hx0, hx1, 0, 0.9, z0, z1);         // sill
      slab(hx0, hx1, 2.1, y1, z0, z1);        // header
      cur = hx1;
    }
    if (cur < x1) slab(cur, x1, 0, y1, z0, z1);
  };
  const wallZ = (x0, x1, z0, z1, y1, holes = [], yBase = 0, sill = 0.9, head = 2.1) => {
    let cur = z0;
    for (const [hz0, hz1] of holes) {
      if (hz0 > cur) slab(x0, x1, yBase, y1, cur, hz0);
      slab(x0, x1, yBase, sill, hz0, hz1);
      slab(x0, x1, head, y1, hz0, hz1);
      cur = hz1;
    }
    if (cur < z1) slab(x0, x1, yBase, y1, cur, z1);
  };

  const M = MAP.main, SD = MAP.side, R = MAP.roof, ST = MAP.stair, D1 = MAP.door1;
  const W = 0.4;   // wall thickness

  /* ---------------- the ground, and the war on it ----------------

     Everything from here to the treeline is scenery. None of it collides
     except the ground itself: it exists to be looked at over the parapet and
     to be the place the dead climb out of. Keeping it non-colliding means a
     zombie walking in from thirty metres never snags on a tank track, and
     the whole field costs four draw calls instead of four hundred. */
  /* The battlefield floor, and why it rendered crimson.

     uvScale here is NOT the material's uvScale: ground() bakes its own
     into the terrain mesh (span = uvScale x size) and the material's then
     multiplies again in the shader. So the two numbers compound, and both
     of them were wrong in opposite directions.

     ground() defaults to 0.35, which across a hundred and sixty metres is
     one 256-pixel tile every four hundred and fifty-seven metres. Raising
     the MATERIAL's uvScale to fix it did nothing visible twice, then
     raising ground()'s to 105 as well made it far worse: 105 x 160 x 88
     put a whole tile in every centimetre, so every screen pixel averaged
     a random scatter of texels -- and the average of a texture lands on
     its dominant channel, which for dirt is red. That was the dithered
     crimson slick in front of the player. It was never the colour.

     Measured rather than argued: a plain box of this exact material
     rendered (95, 83, 63) -- clean grey-brown -- while the ground beside
     it in the same frame rendered (32, 20, 12). Same material, same
     light, same shader. The only difference was UV density.

     0.57 x 160 = 91 tiles across the field, about one every metre and
     three quarters, with the material at 1 so it does not multiply. */
  game.ground({ material: { ...MAT.mud, uvScale: 1 }, size: 160, uvScale: 0.57, segments: 48 });

  /* Everything the battlefield builds gets registered as it is made, so the
     graphics setting can take the whole of it away in one go rather than
     hunting for handles afterwards. Done by wrapping the three spawners for
     the length of the section: the alternative is threading a bucket
     through nine helper functions and remembering it in each of them, and
     one of them would eventually be forgotten. */
  S.detail = { far: [], smoke: [] };
  const rawSpawn = { box: game.box, cylinder: game.cylinder, sphere: game.sphere, cone: game.cone };
  /* Anything under half a metre out here does not cast a shadow.

     The battlefield is about three and a half thousand separate pieces
     within thirty metres of the door -- wire, splinters, shell fragments,
     rubble. Every one of them was a shadow caster, and a shadow map
     covering the whole map gives each of them a few texels at a grazing
     sun angle, so what they actually rendered was a field of dithered
     speckle over the near ground. That is the noise in front of the
     player, and it is why the shadowed ground read as a dark red fizz
     rather than as mud: the mean of a heavily dithered dark region is
     dominated by whichever pixels came through lit, and a lit dirt texel
     is warm.

     The stakes, hulls and sandbags are all bigger than this and still
     cast. Materials are cached by spec, so this adds a handful of
     material objects, not one per piece. */
  const SHADOW_MIN = 0.55;
  const spanOf = (o) => {
    const s = o.size;
    const box = Array.isArray(s) ? Math.max(s[0], s[1], s[2]) : (typeof s === 'number' ? s : 0);
    return Math.max(box, (o.radius || 0) * 2, o.height || 0);
  };
  const collect = (bucket) => {
    for (const k of Object.keys(rawSpawn)) {
      game[k] = function (o) {
        let spec = o;
        if (o && o.material && typeof o.material === 'object' && spanOf(o) > 0
          && spanOf(o) < SHADOW_MIN) {
          spec = Object.assign({}, o, { material: Object.assign({}, o.material, { castShadow: false }) });
        }
        const a = rawSpawn[k].call(game, spec); bucket.push(a); return a;
      };
    }
  };
  const stopCollecting = () => { for (const k of Object.keys(rawSpawn)) game[k] = rawSpawn[k]; };
  collect(S.detail.far);

  // Shell holes. A dark disc for the pit and a raised lip of spoil round it.
  const crater = (x, z, r) => {
    game.cylinder({ at: [x, 0.055, z], radius: r, height: 0.05, material: MAT.mudDark, physics: false });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + (x + z) * 0.3;
      game.sphere({ at: [x + Math.cos(a) * r * 0.94, 0.06, z + Math.sin(a) * r * 0.94],
        radius: r * 0.17, material: MAT.mud, physics: false });
    }
  };

  /* A trench: a dark cut in the ground with a sandbag parapet either side and
     duckboards along the bottom. Not a hole — nothing here is walked in, and
     a real cut would be a trap for anything pathing across it. */
  const trench = (x0, z0, x1, z1, w = 1.5) => {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz) * 57.2958;
    const mid = [(x0 + x1) / 2, 0, (z0 + z1) / 2];
    const cut = game.box({ at: [mid[0], 0.050, mid[2]], size: [w, 0.04, len], material: MAT.mudDark, physics: false });
    cut.setRotation([0, ang, 0]);
    // Duckboards down the middle.
    for (let t = 0.05; t < 1; t += 0.11) {
      const b = game.box({ at: [x0 + dx * t, 0.090, z0 + dz * t], size: [w * 0.7, 0.05, 0.22], material: MAT.bark, physics: false });
      b.setRotation([0, ang, 0]);
    }
    // Sandbags stacked along both lips, two courses, offset like real ones.
    for (const side of [-1, 1]) {
      const nx = (dz / len) * side * (w / 2 + 0.18), nz = (-dx / len) * side * (w / 2 + 0.18);
      for (let t = 0; t < 1; t += 0.055) {
        for (let c = 0; c < 2; c++) {
          const j = ((t * 100 + c * 7) % 5 - 2) * 0.02;
          const bag = game.box({
            at: [x0 + dx * t + nx + j, 0.11 + c * 0.20, z0 + dz * t + nz + j],
            size: [0.46, 0.20, 0.30], material: MAT.sand, physics: false });
          bag.setRotation([0, ang + (c ? 9 : -6), 0]);
        }
      }
    }
  };

  /* Wire: angle-iron pickets with a coil strung between them. The coil is a
     ring of short bars rather than a real helix — at this distance the
     silhouette is the whole of it. */
  const wireRun = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const n = Math.max(2, Math.round(len / 2.2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      deco(x0 + dx * t - 0.04, x0 + dx * t + 0.04, 0, 1.15, z0 + dz * t - 0.04, z0 + dz * t + 0.04, MAT.wire);
    }
    for (let k = 0; k < n * 5; k++) {
      const t = (k + 0.5) / (n * 5);
      const cx = x0 + dx * t, cz = z0 + dz * t;
      for (let s = 0; s < 5; s++) {
        const a = (s / 5) * Math.PI * 2 + k * 0.7;
        const bar = game.box({ at: [cx + Math.cos(a) * 0.30, 0.62 + Math.sin(a) * 0.30, cz],
          size: [0.035, 0.30, 0.035], material: MAT.wire, physics: false });
        bar.setRotation([0, Math.atan2(dx, dz) * 57.2958, a * 57.2958 + 90]);
      }
    }
  };

  /* A dead tank. Hull low and square, one track thrown and lying beside it,
     the turret blown off its ring and sitting nose-down in the mud — which is
     the only silhouette that reads as "destroyed" rather than "parked". */
  const tankWreck = (x, z, yaw) => {
    const g = game.box({ at: [x, 0.55, z], size: [3.1, 0.85, 5.4], material: MAT.hull, physics: false });
    g.setRotation([0, yaw, 0]);
    const s = game.box({ at: [x, 1.15, z - 0.4], size: [2.4, 0.5, 3.2], material: MAT.hull, physics: false });
    s.setRotation([0, yaw, 0]);
    // Running gear both sides, and one track shed into the mud.
    for (const side of [-1, 1]) {
      const rad = Math.atan2(1, 0);
      for (let k = 0; k < 6; k++) {
        const w2 = game.cylinder({ at: [x + Math.cos(yaw / 57.2958) * side * 1.45, 0.42,
          z - 2.1 + k * 0.84 + Math.sin(yaw / 57.2958) * side * 1.45],
          radius: 0.36, height: 0.34, material: MAT.burnt, physics: false });
        w2.setRotation([0, yaw, 90]);
        void rad;
      }
    }
    const thrown = game.box({ at: [x + 2.6, 0.09, z + 1.2], size: [0.5, 0.18, 4.0], material: MAT.burnt, physics: false });
    thrown.setRotation([0, yaw + 24, 0]);
    // Turret, off the ring and face down.
    const tur = game.box({ at: [x - 1.9, 0.62, z + 2.4], size: [2.2, 1.0, 2.6], material: MAT.burnt, physics: false });
    tur.setRotation([28, yaw + 62, 14]);
    const bar = game.cylinder({ at: [x - 2.9, 0.35, z + 3.9], radius: 0.13, height: 3.0, material: MAT.burnt, physics: false });
    bar.setRotation([72, yaw + 62, 0]);
    // Blast scorch under it.
    game.cylinder({ at: [x, 0.045, z], radius: 4.2, height: 0.03, material: MAT.mudDark, physics: false });
  };

  /* A body in the mud. Deliberately not a character rig: these never move,
     there are dozens of them, and a skinned mesh each would cost more than
     the entire bunker. Boxes and a helmet, face down. */
  const bodyProne = (x, z, yaw) => {
    const put = (dx, dy, dz, sx, sy, sz, mat, rx = 0) => {
      const c = Math.cos(yaw / 57.2958), s2 = Math.sin(yaw / 57.2958);
      const a = game.box({ at: [x + dx * c - dz * s2, dy, z + dx * s2 + dz * c], size: [sx, sy, sz], material: mat, physics: false });
      a.setRotation([rx, yaw, 0]);
      return a;
    };
    put(0, 0.14, 0, 0.46, 0.24, 0.72, MAT.cloth);          // torso
    put(0, 0.13, 0.52, 0.24, 0.22, 0.34, MAT.cloth);       // hips
    put(-0.34, 0.10, 0.05, 0.60, 0.16, 0.18, MAT.cloth, 8);  // arm out
    put(0.30, 0.10, 0.16, 0.52, 0.16, 0.18, MAT.cloth, -5);  // arm under
    put(-0.12, 0.11, 0.98, 0.18, 0.18, 0.78, MAT.cloth);   // leg
    put(0.14, 0.11, 0.92, 0.18, 0.18, 0.70, MAT.cloth, 6); // leg
    const helm = game.sphere({ at: [x - Math.sin(yaw / 57.2958) * 0.52, 0.16, z - Math.cos(yaw / 57.2958) * 0.52],
      radius: 0.17, material: { color: 0x3f4436, texture: 'metal', roughness: 0.78, metalness: 1 }, physics: false });
    helm.scale.y *= 0.6;
  };

  // A gun pit: sandbag horseshoe with a wrecked barrel poking over the lip.
  const emplacement = (x, z, yaw) => {
    for (let k = 0; k < 13; k++) {
      const a = -1.5 + (k / 12) * 4.2 + yaw / 57.2958;
      for (let c = 0; c < 3; c++) {
        const bag = game.box({ at: [x + Math.cos(a) * 1.9, 0.11 + c * 0.20, z + Math.sin(a) * 1.9],
          size: [0.46, 0.20, 0.30], material: MAT.sand, physics: false });
        bag.setRotation([0, -a * 57.2958 + (c ? 8 : -6), 0]);
      }
    }
    const mount = game.cylinder({ at: [x, 0.35, z], radius: 0.22, height: 0.7, material: MAT.burnt, physics: false });
    const bar = game.cylinder({ at: [x + Math.sin(yaw / 57.2958) * 0.9, 0.95, z + Math.cos(yaw / 57.2958) * 0.9],
      radius: 0.07, height: 1.9, material: MAT.burnt, physics: false });
    bar.setRotation([64, yaw, 0]);
    void mount;
  };

  /* The treeline. Burnt, limbless, and close enough together to read as a
     wood — it is what stops the world ending in a hard edge, so it wants to
     be a wall of trunks rather than a scatter of sticks. */
  /* A cone, not a cylinder. Every one of these is seen against a bright
     smoke-lit sky, which means it is read as a silhouette and nothing else —
     and the silhouette of a cylinder is a plank. Tapering it is the whole
     difference between a wood and a row of fence posts. */
  const deadTree = (x, z, h, lean) => {
    /* Three silhouettes, not one.

       A shelled wood is mostly broken: trunks snapped off at head height,
       trunks split lengthways, and a few that survived with a point on
       them. Building every one as a cone gives a hundred identical
       triangles round the horizon, and what that reads as is a picket
       fence — which is exactly what it looked like. The kind is picked off
       the position so the ring is deterministic and the same tree is the
       same tree every time the map loads. */
    const kind = Math.abs(Math.round(x * 7 + z * 13)) % 5;
    const yaw = (x * 37 + z * 11) % 360;
    const r0 = 0.19 + h * 0.017;

    if (kind < 2) {
      // Snapped: a stump with a torn top, a third to a half of full height.
      const hs = h * (0.30 + (Math.abs(Math.round(x * 3 + z * 5)) % 20) / 100);
      const t = game.cylinder({ at: [x, hs * 0.5, z], radius: r0 * 1.05, height: hs, material: MAT.bark, physics: false });
      t.setRotation([lean, yaw, lean * 0.6]);
      // Splinters standing off the break, which is what says "snapped".
      for (let k = 0; k < 3; k++) {
        const a2 = (yaw + k * 118) / 57.2958;
        const sp = game.cone({ at: [x + Math.cos(a2) * r0 * 0.5, hs + 0.34, z + Math.sin(a2) * r0 * 0.5],
          radius: r0 * 0.30, height: 0.75, material: MAT.bark, physics: false });
        sp.setRotation([10 - k * 7, yaw + k * 40, 8 - k * 9]);
      }
      return;
    }

    /* Trunk for the bottom two thirds, taper only above that. A cone from
       the mud to the tip is a spike; the parallel trunk is most of what the
       eye uses to tell a wood from a fence. */
    const t = game.cylinder({ at: [x, h * 0.38, z], radius: r0, height: h * 0.76, material: MAT.bark, physics: false });
    t.setRotation([lean, yaw, lean * 0.6]);
    if (kind === 4) {
      // Split: the top has come apart into two leaning limbs.
      for (const sgn of [-1, 1]) {
        const lb = game.cone({ at: [x + sgn * 0.5, h * 0.90, z + sgn * 0.2], radius: r0 * 0.62, height: h * 0.36, material: MAT.bark, physics: false });
        lb.setRotation([sgn * 16, yaw, sgn * 13]);
      }
    } else {
      const cap = game.cone({ at: [x + lean * 0.006 * h, h * 0.86, z], radius: r0 * 0.94, height: h * 0.24, material: MAT.bark, physics: false });
      cap.setRotation([lean, 0, lean * 0.6]);
    }
    for (let k = 0; k < 4; k++) {
      const a2 = (x * 13 + z * 7 + k * 97) % 360;
      const len = 1.5 - k * 0.26;
      const br = game.cone({ at: [x + Math.cos(a2 / 57.2958) * len * 0.4, h * (0.42 + k * 0.14), z + Math.sin(a2 / 57.2958) * len * 0.4],
        radius: 0.07, height: len, material: MAT.bark, physics: false });
      br.setRotation([58 + k * 6, a2, 0]);
    }
  };

  /* Smoke standing over the field. Stacked soft spheres, widening and fading
     as they rise, which is what a column of smoke does and what a billboard
     sprite cannot do from a rooftop you can walk around. */
  const smokeColumn = (x, z, h, tint = 0x2a2723) => {
    for (let k = 0; k < 9; k++) {
      const t = k / 8;
      const s = game.sphere({ at: [x + Math.sin(t * 3 + x) * t * 2.2, 1.2 + t * h, z + Math.cos(t * 2 + z) * t * 1.6],
        radius: 1.1 + t * 3.4, physics: false,
        material: { color: tint, texture: 'smooth', roughness: 1, metalness: 0, opacity: 0.30 - t * 0.20 } });
      void s;
    }
  };

  // Laid out so the two ends of the field read differently: trench system and
  // wire to the north where most of the horde comes from, armour graveyard to
  // the east, and a shelled wood all the way round the outside.
  trench(-34, -21, 12, -19, 1.7);
  trench(10, -19, 30, -25, 1.6);
  trench(-26, -30, -8, -33, 1.5);
  trench(-33, 4, -26, 22, 1.5);
  trench(14, 16, 32, 21, 1.5);
  trench(-17, -8.5, 16, -8.5, 1.6);
  trench(-10.5, 9.5, 12, 9.5, 1.5);
  for (const [cx, cz, cr] of [[-15, -16, 2.6], [4, -22, 3.4], [19, -12, 2.2], [-24, 6, 3.0],
    [11, 18, 2.8], [-9, 24, 2.4], [26, 2, 3.6], [-30, -6, 2.0], [0, -33, 4.0],
    [-11, -11, 2.2], [8, -12, 1.8], [13, 4, 2.4], [-13, 8, 2.0], [3, 14, 2.6],
    [-19, -3, 1.7], [21, -3, 2.1], [-6, -17, 1.9], [17, 12, 2.3]]) crater(cx, cz, cr);
  wireRun(-31, -14, -10, -14);
  wireRun(-8, -15, 13, -15);
  wireRun(15, -13, 31, -9);
  wireRun(-30, 12, -14, 15);
  wireRun(8, 25, 28, 22);
  // A second belt of wire close in, which is the one you shoot over.
  wireRun(-20, -10.5, -9.5, -10.5);
  wireRun(-9, -11, 11, -11);
  wireRun(11.5, -10, 22, -8);
  wireRun(-11, 11, 10, 11.5);
  wireRun(11, 9, 20, 6);
  tankWreck(21, -20, 34);
  tankWreck(27, 8, -108);
  tankWreck(-22, -25, 71);
  tankWreck(-27, 17, 152);
  tankWreck(-14, -17, 12);
  tankWreck(15, 15, -46);
  emplacement(-18, -12, 20);
  emplacement(12, -12, -14);
  emplacement(24, 14, 190);
  emplacement(-13, 12, 118);
  emplacement(15, 8, -70);
  // Bodies, thickest where the wire is.
  for (let k = 0; k < 120; k++) {
    const a = (k * 2.39996), rr = 9.5 + ((k * 7919) % 1000) / 1000 * 16;
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    if (Math.abs(bx) < 9.5 && Math.abs(bz) < 9.5) continue;
    bodyProne(bx, bz, (k * 47) % 360);
  }
  /* Three rings of them, staggered, so there is depth in the wood rather
     than one row with sky behind it. The far ring is what the render
     distance ends on and it wants to be solid. */
  /* Clustered, and at wildly different heights.
   *
   * These were laid out at an exactly even angle -- a hundred and twenty
   * trees round a circle is one every 1.6 m at that radius -- with eight
   * metres of height variation on trunks that all started at four. Seen
   * from the mud, washed out by distance fog, that is a comb: a row of
   * evenly spaced pale spikes with a level top line, which is a fence and
   * not a wood.
   *
   * A shelled wood is patchy. Where the shells fell there is nothing
   * standing and where they did not there is a thicket. So the angle is
   * jittered hard enough to open real gaps and close real clumps, and the
   * height range now runs from a knee-high stump to something twice the
   * bunker, so the skyline has a shape instead of a level. */
  for (const [count, r0, spread, h0, hv, phase] of [
    [120, 30, 7, 1.6, 12.0, 0], [96, 38, 7, 1.4, 11.0, 0.41], [80, 46, 8, 1.2, 10.0, 0.83],
  ]) {
    for (let k = 0; k < count; k++) {
      // Deterministic jitter, ±0.7 of a slot: enough to clump and to gap.
      const slot = Math.PI * 2 / count;
      const j = (((k * 2654435761) % 1000) / 1000 - 0.5) * 1.4;
      const a = (k / count) * Math.PI * 2 + phase + j * slot;
      const rr = r0 + ((k * 613) % 100) / 100 * spread;
      /* Height off a different multiplier from the angle, or tall trees
         land at regular intervals round the ring and the clumping is
         undone by a rhythm in the skyline. Squared, so short stumps are
         common and the tall ones are rare -- which is what a wood that has
         been shelled for a year looks like. */
      const u = ((k * 40503) % 1000) / 1000;
      deadTree(Math.cos(a) * rr, Math.sin(a) * rr, h0 + u * u * hv, ((k * 53) % 14) - 7);
    }
  }
  stopCollecting();
  collect(S.detail.smoke);
  smokeColumn(21, -20, 15);
  smokeColumn(-22, -25, 13);
  smokeColumn(27, 8, 17, 0x322c26);
  smokeColumn(-28, 18, 12);
  smokeColumn(2, -34, 20, 0x26241f);

  stopCollecting();

  /* ---------------- the blockhouse ---------------- */

  /* Floor pad, a step proud of the mud, and an apron round the outside.
   *
   * The wing's pad runs 1.6 m under the blockhouse's, and until now both
   * had their top face at exactly y = 0.02. Two outward-facing surfaces on
   * the same plane, overlapping over 19.8 square metres: the rasteriser has
   * no way to choose between them, so which one is drawn flips from pixel
   * to pixel and frame to frame as the camera moves. That is nineteen
   * square metres of crawling, shimmering floor in the doorway between the
   * two rooms -- and it throws no error, which is why it survived every
   * test that looks for exceptions.
   *
   * The wing's pad drops two millimetres, top and bottom, so the two share
   * no plane at all. In the overlap the blockhouse's floor simply wins, and
   * two millimetres is neither visible nor something you can walk into. */
  slab(M.x0 - W - 1.2, M.x1 + W + 1.2, -0.30, 0.02, M.z0 - W - 1.2, M.z1 + W + 1.2, MAT.floor);
  slab(SD.x0 - W - 0.8, M.x0, -0.302, 0.018, SD.z0 - W - 0.8, SD.z1 + W + 0.8, MAT.floor);

  // Four walls of the square, with the window holes cut in.
  wallX(M.z0 - W, M.z0, M.x0 - W, M.x1 + W, M.y1, [[-3.6, -2.0], [0.4, 2.0]]);
  wallX(M.z1, M.z1 + W, M.x0 - W, M.x1 + W, M.y1, [[-2.0, -0.4]]);
  wallZ(M.x1, M.x1 + W, M.z0, M.z1, M.y1, [[1.2, 2.8]]);
  // West wall carries the doorway through to the wing.
  wallZ(M.x0 - W, M.x0, M.z0, D1.z0, M.y1);
  wallZ(M.x0 - W, M.x0, D1.z1, M.z1, M.y1);
  slab(M.x0 - W, M.x0, D1.h, M.y1, D1.z0, D1.z1, MAT.wall);   // door header

  // The wing: three outside walls, its own window, and a shared partition.
  wallZ(SD.x0 - W, SD.x0, SD.z0, SD.z1, SD.y1, [[-1.6, 0.0]]);
  /* The wing's two long walls run 40 mm past SD.x1, into the solid of the
     connector wall that starts there. Otherwise they end on exactly the
     plane the wing's roof ends on, both faces pointing the same way out
     of the building -- which is a genuine fight, and it was five of the
     pairs the sweep reports. The alternative, pushing the ROOF out
     instead, was tried and is worse: it slides the wing's roof over the
     main one and gives the two of them a shared ceiling underside, which
     is the same fault somewhere less convenient. Move the thing that
     ends up buried. */
  wallX(SD.z0 - W, SD.z0, SD.x0 - W, SD.x1 + 0.04, SD.y1);
  wallX(SD.z1, SD.z1 + W, SD.x0 - W, SD.x1 + 0.04, SD.y1);
  slab(SD.x1, M.x0 - W, 0, SD.y1, SD.z0 - W, D1.z0, MAT.wall);
  slab(SD.x1, M.x0 - W, 0, SD.y1, D1.z1, SD.z1 + W, MAT.wall);

  /* Roof over the wing.
   *
   * The hole was here from the moment the map was built: four slabs laid
   * round a gap, eight torn wedges at its edge and a shaft of daylight
   * coming down through it -- all of it standing there on round one, hours
   * before anything came through the roof. The rock hides itself until it
   * falls; the hole it makes never did.
   *
   * So the roof is whole to start with. The patch over the impact point is
   * solid concrete like the rest of it, the torn edge is built but not
   * shown, and the daylight is at zero. The meteorite takes all three when
   * it lands. The hole is eight wedges rather than a ring so the edge reads
   * as torn concrete rather than as a drilled circle. */
  {
    const H = MAP.hole, r = H.r;
    const RY = SD.y1 - 0.11;   // overlap the walls, same reason as the deck
    /* And the same 40 mm lip as the blockhouse deck, for the same reason:
       a roof ending flush with the outer face of its walls puts the roof's
       edge and the wall's face on one plane, both pointing outward, and
       that shimmers along the whole top of the wing as you walk past. */
    /* The lip goes on the three OUTSIDE edges and deliberately not on
       SD.x1, which is where the wing meets the main room. Pushing it out
       there was tried: it slides the wing's roof over the main room's,
       and since both are ceilings hung at the same height it hands them
       a shared underside plane, both facing down, which is a worse fault
       than the one it cures. The wing's long walls carry the offset at
       that edge instead -- they end up buried in the connector wall,
       which a roof does not. */
    const OH = 0.04;
    slab(SD.x0 - W - OH, SD.x1, RY, SD.y1 + 0.3, SD.z0 - W - OH, H.z - r, MAT.wallDark);
    slab(SD.x0 - W - OH, SD.x1, RY, SD.y1 + 0.3, H.z + r, SD.z1 + W + OH, MAT.wallDark);
    slab(SD.x0 - W - OH, H.x - r, RY, SD.y1 + 0.3, H.z - r, H.z + r, MAT.wallDark);
    slab(H.x + r, SD.x1, RY, SD.y1 + 0.3, H.z - r, H.z + r, MAT.wallDark);
    // The bit that is still there until it is not.
    const patch = slab(H.x - r, H.x + r, RY, SD.y1 + 0.3, H.z - r, H.z + r, MAT.wallDark);
    const edge = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      /* Standing proud of the deck, not flush with it. At SD.y1 + 0.15
         a 300 mm block tops out at exactly SD.y1 + 0.30, which is the
         roof's own top face -- so the two pieces of this ring that
         happen to sit square to the axes shared a plane with the deck,
         both facing up, on a surface the player walks on. They are torn
         slab round a hole punched by a meteorite; proud is also what
         they should look like. */
      const w2 = game.box({ at: [H.x + Math.cos(a) * r * 0.86, SD.y1 + 0.19, H.z + Math.sin(a) * r * 0.86],
        size: [0.7, 0.3, 0.5], material: MAT.wallDark, physics: false });
      w2.setRotation([0, -a * 57.2958, 0]);
      w2.visible = false;
      edge.push(w2);
    }
    // Daylight and smoke coming down through it, once there is a through.
    const shaft = game.light({ at: [H.x, SD.y1 - 0.6, H.z], color: 0xd8c9a4, intensity: 0, radius: 7.0 });
    S.roofHole = { patch, edge, shaft, at: [H.x, SD.y1, H.z], open: false };
  }

  const RISE = R.y1 / ST.steps, RUN = (ST.zBot - ST.zTop) / ST.steps;

  /* ---------------- the stair, and what holds it up ----------------

     Back-right corner, against the east wall, climbing toward -Z. Nothing is
     bought to use it and nothing stands in the way of it: it is the one route
     in the map that is supposed to be read at a glance. */

  {
    /* Built the way a stair is built: two raked stringers, treads sitting on
       them, one continuous handrail on the open side, and props under the
       stringers carrying the load down to a sole plate.

       The first pass drew each of these as a per-step fragment — a rail bar
       for every tread, a stringer chunk every other tread, props sized to
       the ceiling — and the corner of the room filled with floating black
       bars that read as wreckage rather than as a staircase. Every long
       member here is one box rotated to the pitch instead. */
    const PITCH = Math.atan2(RISE, RUN);              // 41.6 degrees
    const RUN_LEN = Math.hypot(ST.zBot - ST.zTop, R.y1);
    const midZ = (ST.zBot + ST.zTop) / 2, midY = R.y1 / 2;
    const raked = (x0, x1, dy, th, mat) => {
      const a = game.box({
        at: [(x0 + x1) / 2, midY + dy, midZ],
        size: [x1 - x0, th, RUN_LEN], material: mat, physics: false,
      });
      a.setRotation([PITCH * 57.2958, 0, 0]);
      return a;
    };

    /* Treads. These are the collision -- everything else here is drawn only.
     *
     * The last one arrives at exactly R.y1, which is also the top face of
     * the landing it runs under: two upward faces on one plane over 0.7
     * square metres, right where the player steps off the stairs and looks
     * down. Two millimetres of drop settles it in the landing's favour --
     * and the landing IS the top step, so nothing is lost by the tread
     * being fractionally under it. */
    for (let k = 0; k < ST.steps; k++) {
      const y = (k + 1) * RISE - (k === ST.steps - 1 ? 0.002 : 0);
      const z1 = ST.zBot - k * RUN;
      slab(ST.x0, ST.x1, y - 0.24, y, z1 - RUN - 0.02, z1, MAT.floor, 'stair tread ' + k);
      // Riser board closing the front of each step.
      deco(ST.x0 + 0.02, ST.x1 - 0.02, y - 0.24, y - 0.02, z1 - RUN - 0.04, z1 - RUN + 0.01, MAT.wood, 'stair riser ' + k);
    }
    // Stringers down both sides, under the nosings.
    raked(ST.x0 - 0.02, ST.x0 + 0.13, -0.20, 0.34, MAT.wood);
    raked(ST.x1 - 0.13, ST.x1 + 0.02, -0.20, 0.34, MAT.wood);

    /* Handrail: outboard of the stair edge, not through it. The old posts
       sat at x 4.45-4.53 and the treads start at 4.50, so the rail ran
       inside the steps you were trying to walk up. */
    const RX = ST.x0 - 0.11;
    raked(RX - 0.035, RX + 0.035, 0.95, 0.06, MAT.steel);         // top rail
    raked(RX - 0.025, RX + 0.025, 0.52, 0.04, MAT.steel);         // mid rail
    for (let k = 0; k <= ST.steps; k += 3) {
      const y = k * RISE, z1 = ST.zBot - k * RUN;
      deco(RX - 0.035, RX + 0.035, y, y + 1.0, z1 - 0.035, z1 + 0.035, MAT.steel);
    }
    // Newel at the bottom, so the rail lands on something.
    deco(RX - 0.05, RX + 0.05, 0, 1.06, ST.zBot - 0.05, ST.zBot + 0.05, MAT.steel);

    /* Landing at the head of the flight, spanning the whole slot: a landing
       the width of the stair alone leaves a slot of open sky down each side
       of it, which you fall through on the way to the parapet. */
    /* And it reaches four millimetres PAST the last tread rather than
       stopping level with it. Both ended at the same z, so the landing's
       front face and the tread's front face were one plane with 0.58
       square metres of overlap, which is the largest of these in the
       map. Overhanging by four millimetres buries the tread's face
       inside the landing's solid, and a buried face is not drawn -- the
       same relation the treads already have with the floor, and one the
       coplanar check now understands. The landing IS the top step, so a
       lip that size is nothing to look at.

       And at the other end it stops six millimetres SHORT of M.z0 - W,
       which is the outer face of the wall it runs into. Ending exactly
       there put the landing's back face on the same plane as the wall's
       own outer face, both pointing the same way and both drawn: 0.29
       square metres, and the landing was spanning the full thickness of
       the wall to do it. Six millimetres leaves it buried in the wall
       instead of flush with the far side of it. */
    slab(ST.x0 - 0.1, M.x1, R.y0, R.y1, M.z0 - W + 0.006, ST.zBot - (ST.steps - 1) * RUN + 0.004, MAT.floor, 'stair landing');

    /* Under the stair. Props that stop at the stringer, not at the ceiling:
       a post that runs the full height of the room is not holding a
       staircase up, it is a fence across the corner. */
    /* The sole plate stops four millimetres short of the bottom step's
       front face. Both ran to ST.zBot, so the front of the plate and the
       front of the tread were the same plane, both pointing into the
       room and both drawn -- 0.21 square metres of it, at the foot of
       the stairs where you walk past it. The same two millimetres of
       clearance the last tread was already given against the landing,
       for the same reason. Measured: the 0.21 goes, and map.test is 14
       of 14, so the four millimetres cost nothing.

       It only became visible once the coplanar check learned to ignore a
       face buried in a third solid. This pair was being reported on
       their BOTTOM faces -- both resting on the floor, both buried in
       it, neither ever drawn -- and because a pair is reported once, the
       false positive was masking the real fight on their fronts. */
    deco(ST.x0 + 0.06, ST.x1 - 0.06, 0, 0.09, ST.zTop + 0.2, ST.zBot - 0.004, MAT.wood, 'stair sole plate');
    for (let k = 0; k < 4; k++) {
      const z1 = ST.zBot - 0.55 - k * 0.95;
      const h = Math.max(0.35, ((ST.zBot - z1) / RUN) * RISE - 0.30);
      for (const px of [ST.x0 + 0.16, ST.x1 - 0.16]) {
        deco(px - 0.06, px + 0.06, 0.09, h, z1 - 0.06, z1 + 0.06, MAT.wood);
      }
      // Cross brace between the pair, just under the stringer.
      deco(ST.x0 + 0.16, ST.x1 - 0.16, h - 0.11, h, z1 - 0.05, z1 + 0.05, MAT.wood);
    }

    /* Supplies, low enough to sit under the flight and clear of the treads
       you walk on. Nothing here has physics: it is stores, not an obstacle
       course, and the user could not get up the stairs for the furniture. */
    const supply = [[5.10, -2.05, 0.62], [5.80, -2.35, 0.54], [5.25, -3.05, 0.50],
      [6.30, -2.15, 0.48], [6.05, -2.95, 0.44], [5.65, -3.55, 0.40]];
    for (const [sx, sz, ss] of supply) {
      const c = game.box({ at: [sx, 0.09 + ss * 0.45, sz], size: [ss, ss * 0.9, ss],
        material: MAT.wood, physics: false });
      c.setRotation([0, (sx * 53 + sz * 17) % 34 - 17, 0]);
    }
    for (const [sx, sz] of [[4.98, -1.72], [5.52, -1.62], [6.24, -1.78]]) {
      const bag = game.box({ at: [sx, 0.26, sz], size: [0.5, 0.34, 0.34], material: MAT.sand, physics: false });
      bag.setRotation([0, (sx * 31) % 30 - 15, 0]);
    }
  }

  /* ---------------- the roof ---------------- */

  /* Deck, with a slot cut out of it for the stair.

     The slot is not the size of the opening at the top: it has to start
     where the treads run out of headroom. A tread at height y needs the
     ceiling gone above y + 2.0, the ceiling is at 3.4, so everything from
     the sixth step back is open sky. Cut only the top of the flight and the
     player walks face-first into the underside of their own roof. */
  /* Where the slot has to start is set by the player's head, not by the
     tread. A body is about two metres tall and stands on the step, so the
     ceiling at 3.4 has to be gone from the point where tread + 2.0 exceeds
     it — plus the radius of the capsule, because they are walking into it
     rather than teleporting onto it. Cut to the tread height instead and
     you climb five steps and stop dead with your head in the concrete,
     which is exactly what happened. */
  const HEAD = 2.05, BODY_R = 0.45;
  const zClear = ST.zBot - ((R.y0 - HEAD) / RISE) * RUN + BODY_R;
  const SLOT = { x0: ST.x0 - 0.1, x1: M.x1, z0: M.z0 - W, z1: Math.min(-2.0, zClear) };
  {
    /* The deck overhangs the walls by 40 mm.
     *
     * It used to end exactly flush with their outer faces, which put the
     * edge of the deck and the face of the wall on the same plane, both
     * pointing outward, over half a square metre on each of the four sides.
     * Two outward faces on one plane is a fight the rasteriser cannot
     * settle -- it shimmers along every top edge of the building as you
     * walk. A real roof has a lip on it anyway; that is what throws the
     * shadow line that says where a building stops. */
    const OH = 0.04;
    slab(M.x0 - W - OH, M.x1 + W + OH, R.y0, R.y1, SLOT.z1, M.z1 + W + OH, MAT.floor);
    slab(M.x0 - W - OH, SLOT.x0, R.y0, R.y1, SLOT.z0 - OH, SLOT.z1, MAT.floor);
    /* Started 20 mm inside the wall rather than flush with its inner face:
       flush put the deck's edge and the wall's face on one plane inside the
       stairwell, where you look straight at both of them on the way up. */
    slab(SLOT.x1 - 0.02, M.x1 + W + OH, R.y0, R.y1, SLOT.z0 - OH, SLOT.z1, MAT.floor);
  }
  // Rail round the open side of the slot, so the hole reads as a hole.
  const RT = R.y1 - 0.06, RH = R.y1 + R.rail;
  {
    /* Guard rail all the way round the stairwell, with a kick plate at the
       deck. Railed on two sides only, the opening read as a black rectangle
       you could walk into — the first thing you meet when you step off the
       flight should be a roof, not a hole. */
    const zTopEdge = ST.zBot - (ST.steps - 1) * RUN;   // where the landing ends
    const rail = (x0, x1, z0, z1) => {
      deco(x0, x1, RT, RT + 0.06, z0, z1, MAT.steel);              // kick plate
      deco(x0, x1, RT + 0.94, RT + 1.00, z0, z1, MAT.steel);       // top rail
      deco(x0, x1, RT + 0.50, RT + 0.55, z0, z1, MAT.steel);       // mid rail
    };
    const post = (x, z) => deco(x - 0.04, x + 0.04, RT, RT + 1.0, z - 0.04, z + 0.04, MAT.steel);
    // Front edge of the opening, and the landing edge behind it.
    rail(SLOT.x0 - 0.05, SLOT.x1, SLOT.z1 - 0.05, SLOT.z1 + 0.05);
    rail(SLOT.x0 - 0.05, SLOT.x1, zTopEdge - 0.05, zTopEdge + 0.05);
    // West edge, between the two.
    rail(SLOT.x0 - 0.05, SLOT.x0 + 0.05, zTopEdge, SLOT.z1);
    for (let x = SLOT.x0; x <= SLOT.x1; x += 1.1) { post(x, SLOT.z1); post(x, zTopEdge); }
    for (let z = zTopEdge; z <= SLOT.z1; z += 1.1) post(SLOT.x0, z);
  }
  slab(M.x0 - W, M.x1 + W, RT, RH, M.z1, M.z1 + W, MAT.wall);
  slab(M.x0 - W, M.x1 + W, RT, RH, M.z0 - W, M.z0, MAT.wall);
  slab(M.x0 - W, M.x0, RT, RH, M.z0, M.z1, MAT.wall);
  slab(M.x1, M.x1 + W, RT, RH, M.z0, ST.zTop - RUN, MAT.wall);
  slab(M.x1, M.x1 + W, RT, RH, ST.zTop - RUN, M.z1, MAT.wall);
  {
    // Pickets leaning outward with two coils strung along them, all the way
    // round. This is the edge of the playable world and it should look like
    // somebody meant it to be.
    /* Short and leaning out, not a picket fence. The first pass stood
       0.72 m of steel every 90 cm all the way round the deck and the roof
       became a stockade you could not see the war through — the entire
       point of going up there. */
    const stake = (x, z, ox, oz) => {
      const a = game.box({ at: [x, RH + 0.19, z], size: [0.04, 0.40, 0.04], material: MAT.wire, physics: false });
      a.setRotation([oz * 34, 0, -ox * 34]);
    };
    // Three strands the length of each run, with barbs whipped onto the
    // middle one. Strands read as wire from any distance; a coil of little
    // boxes only read as a row of black posts across the view.
    const strand = (alongX, at, y, from, to) => {
      const b2 = alongX
        ? game.box({ at: [(from + to) / 2, y, at], size: [to - from, 0.022, 0.022], material: MAT.wire, physics: false })
        : game.box({ at: [at, y, (from + to) / 2], size: [0.022, 0.022, to - from], material: MAT.wire, physics: false });
      return b2;
    };
    const barb = (x, y, z, ang) => {
      for (let q = 0; q < 2; q++) {
        const c2 = game.box({ at: [x, y, z], size: [0.012, 0.09, 0.012], material: MAT.wire, physics: false });
        c2.setRotation([q ? 52 : -52, ang, q ? 40 : -40]);
      }
    };
    for (const [alongX, at, ox, oz] of [[true, M.z1 + 0.2, 0, 1], [true, M.z0 - 0.2, 0, -1],
      [false, M.x0 - 0.2, -1, 0], [false, M.x1 + 0.2, 1, 0]]) {
      const lo = alongX ? M.x0 : M.z0, hi = alongX ? M.x1 : M.z1;
      for (let t = lo; t <= hi; t += 2.6) alongX ? stake(t, at, ox, oz) : stake(at, t, ox, oz);
      for (const dy of [0.10, 0.22, 0.34]) strand(alongX, at, RH + dy, lo, hi);
      for (let t = lo + 0.3; t <= hi; t += 0.55) {
        if (alongX) barb(t, RH + 0.22, at, 0); else barb(at, RH + 0.22, t, 90);
      }
    }
  }

  /* ---------------- where the walls meet the roof ----------------

     A beam course round the top of every wall, and joists across the
     ceiling. It is the right detail for a poured blockhouse — nothing here
     was cast in one piece — and it also settles the seam. Butted or
     overlapped, the wall/ceiling join renders as a hard bright line one
     pixel tall all the way round the room, and a bright straight line at
     the top of a wall reads as daylight through a crack. A timber that is
     actually there is a better answer than chasing the rasteriser. */
  {
    /* A soffit, not a moulding. Deep enough and dark enough to occlude the
       junction itself from anywhere below it.

       The wall meets the slab in a line that renders bright whatever the
       geometry does — overlapped, butted, capped with a shallow beam, it
       came back every time, and a bright straight line at the top of a wall
       reads as daylight through a crack no matter what is actually causing
       it. Thirty centimetres of dark timber standing proud of the wall puts
       the whole junction behind something solid. */
    const CY = R.y0, TH = 0.30, DP = 0.30;
    const beam = { color: 0x4a3722, texture: 'wood', roughness: 0.92, metalness: 0, uvScale: 5 };
    const face = { color: 0x3a2b1a, texture: 'wood', roughness: 0.94, metalness: 0, uvScale: 4 };
    // Main room, all four walls. Top buried a full ten centimetres into the
    // slab so no edge of it lands anywhere near the junction line.
    const run = (x0, x1, z0, z1) => {
      slab(x0, x1, CY - TH, CY + 0.10, z0, z1, beam);
      // A fascia hanging below the soffit's outer edge, which is what makes
      // it read as built rather than as a stripe of darker wall.
      slab(x0, x1, CY - TH - 0.06, CY - TH + 0.02, z0, z1, face);
    };
    /* Everywhere except over the stair. The soffit hangs to 2.99 and the
       flight climbs to 3.6, so a course carried across the stairwell is a
       beam through the top four treads and the landing you step onto. */
    /* Timbers that meet run INTO each other, not up against each other.
     *
     * Everything crossing the short way used to terminate at M.z0 and
     * M.z1 -- exactly the plane the front and back courses present -- so
     * every joist end cap and both side courses were coplanar with the
     * course they butt into. Twenty-five pairs of surfaces fighting for
     * the same plane, all along the top of the room, which is where a
     * bright flickering line is least welcome given the whole reason
     * this soffit exists is to hide a bright line at the top of a wall.
     *
     * A joist buried six centimetres into a thirty-centimetre course is
     * how it would actually be built, and its end cap is then inside
     * something rather than level with its face. */
    const IN = 0.06;
    /* Front and back run the full width; the sides run BETWEEN them,
       from one course's inner face to the other's. That is how a timber
       course is actually framed, and it is also the only arrangement
       where no two of them present a face on the same plane pointing the
       same way: the side courses' outer faces land on M.x0 and M.x1
       along with the front and back ones, but their z ranges only touch
       there, they do not overlap, so there is no shared area to fight
       over.
       
       My first attempt inset the sides by 60 mm instead, which left the
       ends of the front and back courses sharing a plane with them and
       showed up as two more pairs at x = plus and minus 7 -- ceiling,
       and visible from underneath. */
    run(M.x0, SLOT.x0 - 0.1, M.z0, M.z0 + DP);        // back wall, west of the slot
    run(M.x0, M.x1, M.z1 - DP, M.z1);                 // front wall
    run(M.x0, M.x0 + DP, M.z0 + DP, M.z1 - DP);       // west wall, between the two
    run(M.x1 - DP, M.x1, SLOT.z1, M.z1 - DP);         // east wall, south of the slot
    // Joists across the short way, clear of the stair slot.
    for (let x = M.x0 + 2.2; x < SLOT.x0 - 0.4; x += 2.2) {
      slab(x - 0.10, x + 0.10, CY - 0.26, CY + 0.10, M.z0 + IN, M.z1 - IN, beam);
    }
    // The wing gets the same treatment, and the same joinery.
    const WY = SD.y1 - 0.11;
    /* The wing gets the same framing as the main room: front and back run
       the width, the side runs BETWEEN them. It was left inset by 60 mm
       when the main room was corrected, so its side course still overlapped
       the other two at the same height and the three of them shared an
       underside -- ceiling, and lit by the wing's own lamps. I fixed one
       room and not the other in the same edit. */
    slab(SD.x0, SD.x1 - IN, WY - TH, WY + 0.10, SD.z0, SD.z0 + DP, beam);
    slab(SD.x0, SD.x1 - IN, WY - TH, WY + 0.10, SD.z1 - DP, SD.z1, beam);
    slab(SD.x0, SD.x0 + DP, WY - TH, WY + 0.10, SD.z0 + DP, SD.z1 - DP, beam);
  }

  /* ---------------- doors ---------------- */
  S.doors = {
    side: {
      cost: ECONOMY.doorGenerator, open: false, label: 'Force the wing door',
      at: [M.x0 - 0.2, 1.2, (D1.z0 + D1.z1) / 2],
      actors: [
        game.box({ at: [M.x0 - 0.2, 1.2, (D1.z0 + D1.z1) / 2], size: [0.3, 2.4, D1.z1 - D1.z0], material: MAT.board, static: true }),
      ],
    },
  };

  /* ---------------- chalk guns ---------------- */
  const chalkMat = MAT.chalk;
  const thompsonChalk = game.thompson({ at: [-1.4, 1.55, M.z0 + 0.14], physics: false, material: chalkMat, woodMaterial: chalkMat });
  const scatterChalk = makeScattergun(game, { at: [-6.3, 1.55, M.z0 + 0.14], chalk: true });
  void thompsonChalk; void scatterChalk;

  /* The MP5 is on the far wall of the wing, so it is the first thing the
     power run pays for on the way back. */
  const mp5Chalk = makeMP5(game, { at: [SD.x0 + 0.16, 1.55, 0.6], chalk: true });
  mp5Chalk.root.setRotation([0, 90, 0]);
  /* And the Arc Breaker is on the roof, behind the parapet, where you have
     to have already been up the stairs to know it exists. */
  const paraChalk = makeParalyzer(game, { at: [-4.4, R.y1 + 0.46, M.z0 + 0.14], chalk: true });

  /* Chalk for the two long guns as well: the rifle at the back of the
     wing, where you would be if you were shooting out of the west window,
     and the machine gun on the roof, where you would be if you were
     shooting at everything. */
  /* Turned to lie ALONG the wall, like the MP5 four lines up.
   *
   * Every weapon is modelled with its muzzle down +X, which is correct
   * for the chalk guns on the z-facing walls -- the Thompson, the
   * Scattergun, and the two on the roof parapet -- because there the
   * muzzle already runs along the wall. This wing's west wall faces
   * along X, so a gun left unrotated points its muzzle straight out of
   * it. The MP5 on this same wall has the 90 degree turn; the rifle
   * beneath it never got one, so it hung nose-on and the only part of it
   * you could see was the barrel, end on, standing up like a pipe. That
   * is the report exactly: through the wall, and not recognisably the
   * gun the prompt names.
   *
   * Turning it created a second problem, because a gun that used to be
   * 90 mm of wall now needs a metre of it. At z -3.4 the butt ran 180 mm
   * into the fuse panel that lives at z -3.30 to -2.70, so the stock
   * came out of the front of the box. The clear run of this wall is from
   * the corner at z -5.00 to the edge of that panel at -3.30, which is
   * 1.68 m for a rifle 0.97 m long; centred in it the rifle spans -4.64
   * to -3.68, a clear 380 mm from the panel and 360 mm from the corner. */
  const remChalk = makeRemington(game, { at: [SD.x0 + 0.16, 1.55, -3.96], chalk: true });
  remChalk.root.setRotation([0, 90, 0]);
  const mgChalk = makeMG42(game, { at: [4.2, R.y1 + 0.46, M.z0 + 0.14], chalk: true });
  void remChalk; void mgChalk;

  S.buys = [
    /* Spread along the wall so that the interact radius cannot reach two
       of them at once. They were 1.7 m apart with a 2.0 m reach, so from
       anywhere along that wall two or three were live together and half a
       step changed the answer -- "I move slightly and I accidentally buy
       the other thing". Facing decides between them now, but the honest
       fix is not to have to decide: 2.45 m apart is wider than the reach,
       so each is on its own. */
    { id: 'thompson', at: [-1.4, 1.4, M.z0 + 0.3], weapon: 'thompson', label: 'Thompson' },
    { id: 'scatter', at: [-6.3, 1.4, M.z0 + 0.3], weapon: 'scatter', label: 'Scattergun' },
    { id: 'mp5', at: [SD.x0 + 0.5, 1.4, 0.6], weapon: 'mp5', label: 'MP5' },
    { id: 'paralyzer', at: [-4.4, R.y1 + 1.15, M.z0 + 0.5], weapon: 'paralyzer', label: 'Paralyzer' },
    { id: 'remington', at: [SD.x0 + 0.5, 1.4, -3.96], weapon: 'remington', label: 'Remington 700' },
    { id: 'mg42', at: [4.2, R.y1 + 1.15, M.z0 + 0.5], weapon: 'mg42', label: 'MG 42' },
  ];
  void mp5Chalk; void paraChalk;

  /* Grenade crate, stencilled and open, on the wall between the two guns. */
  const nadeAt = [-3.85, 1.05, M.z0 + 0.26];
  game.box({ at: nadeAt, size: [0.52, 0.34, 0.30], static: true,
    material: { color: 0x4c5340, texture: 'wood', roughness: 0.92, uvScale: 3 } });
  game.box({ at: [nadeAt[0], nadeAt[1] + 0.19, nadeAt[2] + 0.02], size: [0.54, 0.05, 0.32], static: true,
    material: { color: 0x3e4436, texture: 'wood', roughness: 0.92, uvScale: 3 } });
  for (let k = 0; k < 3; k++) {
    game.sphere({ at: [nadeAt[0] - 0.15 + k * 0.15, nadeAt[1] + 0.24, nadeAt[2] - 0.02], radius: 0.052,
      physics: false, material: { color: 0x3f4a33, texture: 'metal', roughness: 0.62, metalness: 1 } });
  }
  S.nadeBuy = { at: nadeAt };

  /* ---------------- the generator, in the wing ----------------
     Cranked by hand, and until it turns nothing in the bunker draws power. */
  const GX = -13.4, GZ = -3.0;
  game.box({ at: [GX, 0.75, GZ], size: [1.8, 1.5, 1.3], material: MAT.steel, static: true });
  game.cylinder({ at: [GX + 1.2, 0.5, GZ - 0.2], radius: 0.32, height: 1.0, material: MAT.steel, static: true });
  const wheel = game.cylinder({ at: [GX + 0.98, 0.95, GZ], radius: 0.30, height: 0.09, material: MAT.steel, static: true });
  wheel.setRotation([0, 0, 90]);
  game.cylinder({ at: [GX - 0.65, 1.85, GZ], radius: 0.075, height: 1.4, material: { color: 0x2a2622, texture: 'metal', roughness: 0.8, metalness: 1 }, static: true });
  // The crank itself: a shaft out of the housing with a bent handle on it.
  const crankShaft = game.cylinder({ at: [GX + 0.95, 0.95, GZ + 0.72], radius: 0.035, height: 0.34, material: MAT.steel, physics: false });
  crankShaft.setRotation([90, 0, 0]);
  const crankArm = game.box({ at: [GX + 0.95, 1.18, GZ + 0.90], size: [0.06, 0.46, 0.06], material: MAT.steel, physics: false });
  const crankGrip = game.cylinder({ at: [GX + 0.95, 1.40, GZ + 0.99], radius: 0.045, height: 0.16, material: { color: 0x2e2a24, texture: 'fabric', roughness: 0.9 }, physics: false });
  crankGrip.setRotation([90, 0, 0]);

  const PANEL_X = SD.x0 + 0.1, PANEL_Y = 1.52, PANEL_Z = -3.0;
  const panelSteel = { color: 0x53585e, texture: 'metal', roughness: 0.55, metalness: 1 };
  const panelDark = { color: 0x24272b, texture: 'metal', roughness: 0.65, metalness: 1 };
  game.box({ at: [PANEL_X, PANEL_Y, PANEL_Z], size: [0.05, 0.78, 0.60], material: panelDark, static: true });
  game.box({ at: [PANEL_X + 0.07, PANEL_Y, PANEL_Z], size: [0.14, 0.62, 0.46], material: panelSteel, static: true });
  const lampRed = game.sphere({ at: [PANEL_X + 0.15, PANEL_Y + 0.235, PANEL_Z + 0.15], radius: 0.032, material: { color: 0x2a0a08, texture: 'smooth', roughness: 0.3, emissive: 0xff2a1e, emissiveStrength: 2.2 }, physics: false });
  const lampGreen = game.sphere({ at: [PANEL_X + 0.15, PANEL_Y + 0.235, PANEL_Z + 0.02], radius: 0.032, material: { color: 0x081a08, texture: 'smooth', roughness: 0.3, emissive: 0x1a3a12, emissiveStrength: 0.2 }, physics: false });
  for (let f = 0; f < 4; f++) {
    const fu = game.cylinder({ at: [PANEL_X + 0.15, PANEL_Y - 0.20, PANEL_Z - 0.16 + f * 0.105], radius: 0.026, height: 0.055, material: { color: 0x8a6a3a, texture: 'metal', roughness: 0.5, metalness: 1 }, physics: false });
    fu.setRotation([0, 0, 90]);
  }
  game.cylinder({ at: [PANEL_X + 0.06, PANEL_Y + 0.85, PANEL_Z + 0.24], radius: 0.032, height: 1.1, material: panelDark, static: true });
  S.powerSwitch = {
    at: [GX + 0.95, 1.1, GZ + 1.35], on: false, cranking: 0, crankSpin: 0,
    crankShaft, crankArm, crankGrip, wheel, lampRed, lampGreen,
    lx: PANEL_X, ly: PANEL_Y, lz: PANEL_Z,
  };

  /* ---------------- the meteorite ----------------

     It is not there when the round starts. Somewhere before round ten it
     comes through the wing roof, and the arrival is the event: a whistle,
     a bang you feel through the floor, the lights swinging, dust off the
     ceiling. Everything below is built at load and hidden, because
     spawning two dozen actors in the frame the thing lands is a stutter
     at exactly the moment the player is looking.

     Once it is down it is inert. Put a round into it and it wakes up,
     which is the only instruction anybody gets. */
  {
    const H = MAP.hole;
    const hidden = [];
    const rockMat = { color: 0x241f1c, texture: 'concrete', roughness: 0.86, metalness: 0, uvScale: 3 };
    const veinMat = { color: 0x2a0d05, texture: 'smooth', roughness: 0.42, metalness: 0,
      emissive: 0xff5a12, emissiveStrength: 2.6 };
    // The rock: overlapping spheres, so it has no single silhouette.
    hidden.push(game.sphere({ at: [H.x, 0.62, H.z], radius: 0.92, material: rockMat, static: true }));
    for (let k = 0; k < 7; k++) {
      const a2 = (k / 7) * Math.PI * 2;
      hidden.push(game.sphere({ at: [H.x + Math.cos(a2) * 0.62, 0.5 + ((k * 37) % 10) / 10 * 0.55, H.z + Math.sin(a2) * 0.62],
        radius: 0.34 + ((k * 71) % 10) / 10 * 0.22, material: rockMat, physics: false }));
    }
    // Molten seams through the cracks.
    const veins = [];
    for (let k = 0; k < 9; k++) {
      const a2 = (k / 9) * Math.PI * 2 + 0.3;
      const v = game.box({ at: [H.x + Math.cos(a2) * 0.80, 0.55 + Math.sin(k * 2.1) * 0.35, H.z + Math.sin(a2) * 0.80],
        size: [0.10, 0.42, 0.10], material: veinMat, physics: false });
      v.setRotation([Math.sin(k) * 40, -a2 * 57.2958, Math.cos(k) * 35]);
      veins.push(v); hidden.push(v);
    }
    // Broken floor and spoil thrown out round the impact.
    hidden.push(game.cylinder({ at: [H.x, 0.075, H.z], radius: 2.3, height: 0.07, material: MAT.mudDark, physics: false }));
    for (let k = 0; k < 12; k++) {
      const a2 = (k / 12) * Math.PI * 2;
      const c = game.box({ at: [H.x + Math.cos(a2) * 1.9, 0.10, H.z + Math.sin(a2) * 1.9],
        size: [0.6, 0.2, 0.45], material: MAT.floor, physics: false });
      c.setRotation([((k * 17) % 20) - 10, -a2 * 57.2958, ((k * 29) % 24) - 12]);
      hidden.push(c);
    }
    // The cradle you put a gun in: two steel forks driven into the rock.
    const cradle = [];
    for (const dz of [-0.3, 0.3]) {
      const f2 = game.box({ at: [H.x + 0.95, 1.05, H.z + dz], size: [0.10, 0.55, 0.10], material: MAT.steel, physics: false });
      cradle.push(f2); hidden.push(f2);
    }
    for (const q of hidden) q.visible = false;
    const glow = game.light({ at: [H.x, 1.5, H.z], color: 0xff7a2a, intensity: 0, radius: 6.5 });

    S.meteor = {
      at: [H.x + 1.55, 1.0, H.z], busy: false, timer: 0, holding: null, cradle,
      slot: [H.x + 0.95, 1.25, H.z], centre: [H.x, 0.85, H.z], radius: 1.55,
      // Somewhere from three to nine. It has to be before ten, and it wants
      // to be after you have had time to buy something worth upgrading.
      round: 3 + Math.floor(Math.random() * 7),
      state: 'waiting', fall: 0, armed: false, parts: hidden, veins, glow,
      shell: hidden.slice(0, 8),   // the rock's own spheres, which break open
    };
    buildVortex(game, S);
    buildAlien(game, S);
  }

  /* ---------------- mystery box, against the side of the stair ---------- */
  const BX = [ST.x0 - 0.85, 0.4, -2.4];
  S.crate = {
    at: BX, busy: false, cost: ECONOMY.crate,
    base: game.box({ at: BX, size: [1.15, 0.8, 0.8], material: MAT.wood, static: true }),
    lid: game.box({ at: [BX[0], BX[1] + 0.44, BX[2]], size: [1.15, 0.1, 0.8], material: MAT.steel, physics: false }),
    offer: null, offerId: null, timer: 0, flash: null, flashT: 0,
  };

  /* ---------------- the workshop ----------------

     Its own corner, not a table in the middle of the floor. The bench runs
     along two walls in the front-left angle of the blockhouse and the
     shelves are bracketed to those walls above it, which is the whole
     point: a shelf standing in open air is a shelf nobody built, and a
     bench a metre off the wall with its tool rail floating behind it reads
     as scenery rather than as a place someone works.

     A mesh screen closes the fourth side with a gap to walk in by, so the
     corner is a room you step into. Standing at the bench takes your
     attention off the floor entirely, so it wants to be somewhere you have
     to choose to go. */
  {
    const WX = M.x0, WZ = M.z1;                       // the corner's two walls
    const BX = -5.50, BZ = WZ - 0.48;                 // main bench, along +Z
    const RX = WX + 0.48, RZ = 5.00;                  // return bench, along -X
    const vice = { color: 0x4a4e54, texture: 'metal', roughness: 0.5, metalness: 1 };
    const blk = { color: 0x24272b, texture: 'metal', roughness: 0.55, metalness: 1 };
    const gls = { color: 0x14202a, texture: 'smooth', roughness: 0.14, metalness: 0,
      emissive: 0x2a6a90, emissiveStrength: 0.7 };
    const mesh = { color: 0x3a3f45, texture: 'metal', roughness: 0.62, metalness: 1 };

    /* Pegboard, screwed flat to both walls. Everything else in the corner
       hangs off it, which is how a workshop wall actually gets built. */
    game.box({ at: [-5.30, 1.62, WZ - 0.045], size: [3.30, 1.30, 0.05], material: MAT.board, static: true });
    game.box({ at: [WX + 0.045, 1.62, 5.35], size: [0.05, 1.30, 2.60], material: MAT.board, static: true });

    /* Benches: top, apron, legs at the front only — the back edge is
       carried on a ledger screwed to the wall, the way a fitted bench is. */
    /* `dy` drops a run a hair, and the second one uses it.
     *
     * The two benches meet in an L and both tops were at exactly y 0.985,
     * so where they overlap in the corner the two top faces were one
     * plane, both pointing up and both drawn -- 0.09 square metres on the
     * surface you stand at to use the workbench. Two millimetres puts the
     * second run's top inside the first's solid, and a buried face is not
     * drawn. Measured: the 0.09 goes and map.test is 14 of 14. */
    const benchRun = (cx, cz, sx, sz, alongX, dy = 0, tag = 'bench') => {
      const top = game.box({ at: [cx, 0.94 + dy, cz], size: [sx, 0.09, sz], material: MAT.wood, static: true });
      if (top) top.name = tag + ' top';
      if (alongX) {
        game.box({ at: [cx, 0.83 + dy, cz - sz / 2 + 0.06], size: [sx, 0.16, 0.09], material: MAT.wood, static: true });
        game.box({ at: [cx, 0.86 + dy, cz + sz / 2 - 0.03], size: [sx, 0.10, 0.06], material: MAT.board, static: true });
        for (const dx of [-sx / 2 + 0.16, sx / 2 - 0.16]) {
          game.box({ at: [cx + dx, 0.45, cz - sz / 2 + 0.12], size: [0.11, 0.90, 0.11], material: MAT.wood, static: true });
        }
      } else {
        game.box({ at: [cx + sx / 2 - 0.06, 0.83 + dy, cz], size: [0.09, 0.16, sz], material: MAT.wood, static: true });
        game.box({ at: [cx - sx / 2 + 0.03, 0.86 + dy, cz], size: [0.06, 0.10, sz], material: MAT.board, static: true });
        for (const dz of [-sz / 2 + 0.16, sz / 2 - 0.16]) {
          game.box({ at: [cx + sx / 2 - 0.12, 0.45, cz + dz], size: [0.11, 0.90, 0.11], material: MAT.wood, static: true });
        }
      }
    };
    benchRun(BX, BZ, 3.10, 0.86, true, 0, 'long bench');
    benchRun(RX, RZ, 0.86, 2.40, false, -0.002, 'return bench');

    /* Shelves, on brackets, against the pegboard on both walls. */
    const shelf = (cx, cz, sx, sz, y, alongX) => {
      game.box({ at: [cx, y, cz], size: [sx, 0.045, sz], material: MAT.board, static: true });
      const ends = alongX ? [[-sx / 2 + 0.07, 0], [sx / 2 - 0.07, 0]] : [[0, -sz / 2 + 0.07], [0, sz / 2 - 0.07]];
      for (const [ox, oz] of ends) {
        game.box({ at: [cx + ox, y - 0.10, cz + (alongX ? sz / 2 - 0.06 : oz)],
          size: [0.03, 0.16, 0.14], material: vice, physics: false })
          .setRotation(alongX ? [0, 0, 0] : [0, 90, 0]);
      }
    };
    for (const y of [1.34, 1.70, 2.06]) {
      shelf(-6.10, WZ - 0.20, 1.55, 0.30, y, true);
      shelf(-4.20, WZ - 0.20, 1.55, 0.30, y, true);
    }
    for (const y of [1.34, 1.70]) shelf(WX + 0.20, 5.20, 0.30, 2.10, y, false);

    /* What the bench sells, sitting on those shelves. Scopes in a row,
       magazines stood on end, a drum, muzzle devices, spare barrels — so
       the menu is a list of things you can already see on the wall. */
    for (let k = 0; k < 5; k++) {
      const sx = -6.72 + k * 0.29;
      game.cylinder({ at: [sx, 1.775, WZ - 0.22], radius: 0.026, height: 0.17, material: blk, physics: false })
        .setRotation([0, 0, 90]);
      game.cylinder({ at: [sx + 0.09, 1.775, WZ - 0.22], radius: 0.024, height: 0.010, material: gls, physics: false })
        .setRotation([0, 0, 90]);
    }
    for (let k = 0; k < 7; k++) {
      game.box({ at: [-6.74 + k * 0.23, 1.455, WZ - 0.22], size: [0.030, 0.17, 0.055], material: blk, physics: false })
        .setRotation([0, 0, (k * 11) % 9 - 4]);
    }
    game.cylinder({ at: [-4.80, 1.815, WZ - 0.22], radius: 0.085, height: 0.05, material: blk, physics: false })
      .setRotation([90, 0, 0]);
    for (let k = 0; k < 4; k++) {
      game.cylinder({ at: [-4.45 + k * 0.17, 1.785, WZ - 0.22], radius: 0.027, height: 0.13, material: vice, physics: false })
        .setRotation([0, 0, 90]);
    }
    for (let k = 0; k < 4; k++) {
      game.cylinder({ at: [-4.70 + k * 0.16, 1.470, WZ - 0.22], radius: 0.014, height: 0.26, material: vice, physics: false })
        .setRotation([0, 0, 74 + k * 6]);
    }
    // Stock parts and a stripped receiver on the top shelf.
    for (let k = 0; k < 3; k++) {
      game.box({ at: [-6.50 + k * 0.42, 2.13, WZ - 0.22], size: [0.36, 0.09, 0.10], material: MAT.wood, physics: false })
        .setRotation([0, 0, 3 - k * 3]);
    }
    game.box({ at: [-4.40, 2.13, WZ - 0.22], size: [0.52, 0.08, 0.09], material: blk, physics: false });
    // Ammunition boxes on the return shelves.
    for (let k = 0; k < 4; k++) {
      game.box({ at: [WX + 0.22, 1.40, 4.35 + k * 0.44], size: [0.20, 0.11, 0.30],
        material: MAT.board, physics: false });
    }
    for (let k = 0; k < 3; k++) {
      game.cylinder({ at: [WX + 0.22, 1.79, 4.55 + k * 0.55], radius: 0.055, height: 0.20, material: vice, physics: false })
        .setRotation([90, 0, 0]);
    }

    /* Tool rail on the pegboard, above the main bench: hammers, files,
       drivers, a hacksaw, hanging where a hand can reach them. */
    game.box({ at: [-5.30, 1.18, WZ - 0.10], size: [3.10, 0.05, 0.06], material: vice, static: true });
    for (let k = 0; k < 13; k++) {
      const tx = -6.72 + k * 0.24;
      game.box({ at: [tx, 1.03, WZ - 0.12], size: [0.035, 0.28, 0.035],
        material: k % 3 === 0 ? MAT.wood : vice, physics: false }).setRotation([0, 0, (k * 17) % 14 - 7]);
    }
    game.box({ at: [-3.95, 1.55, WZ - 0.10], size: [0.42, 0.30, 0.03], material: vice, physics: false })
      .setRotation([0, 0, 12]);

    /* Bench vice, parts trays, oil can, a box of shells, and the lamp. */
    game.box({ at: [-6.72, 1.05, BZ - 0.24], size: [0.24, 0.14, 0.20], material: vice, physics: false });
    game.cylinder({ at: [-6.72, 1.05, BZ - 0.46], radius: 0.020, height: 0.22, material: vice, physics: false })
      .setRotation([90, 0, 0]);
    for (const dx of [-0.85, -0.30, 0.28]) {
      game.box({ at: [BX + dx, 1.03, BZ + 0.22], size: [0.34, 0.09, 0.24], material: vice, physics: false });
    }
    game.cylinder({ at: [BX + 1.10, 1.06, BZ - 0.10], radius: 0.045, height: 0.15, material: vice, physics: false });
    game.cylinder({ at: [BX + 1.10, 1.16, BZ - 0.16], radius: 0.010, height: 0.11, material: vice, physics: false })
      .setRotation([44, 0, 0]);
    game.box({ at: [BX + 0.62, 1.02, BZ - 0.16], size: [0.20, 0.07, 0.14], material: MAT.board, physics: false });
    for (let k = 0; k < 4; k++) {
      game.cylinder({ at: [BX + 0.58 + k * 0.026, 1.07, BZ - 0.16], radius: 0.009, height: 0.045,
        material: { color: 0xa8843c, texture: 'metal', roughness: 0.3, metalness: 1 }, physics: false });
    }
    // Conduit and the shade over the bench, hung off the ceiling.
    game.cylinder({ at: [BX, 2.72, BZ + 0.10], radius: 0.014, height: 0.62, material: vice, physics: false });
    game.box({ at: [BX, 2.36, BZ + 0.10], size: [0.60, 0.09, 0.24], material: vice, physics: false });

    /* The screen that makes it a corner: a steel mesh panel on posts,
       with a gap at the far end to walk in by. */
    for (const [zc, zl] of [[6.20, 1.55], [4.62, 0.60]]) {
      // Frame first, then the mesh itself as a grid of bars. A solid panel
      // here is a black wall across the corner: it is metal, it faces away
      // from every lamp in the room, and a metal has no diffuse term to
      // catch what little light does reach it.
      game.box({ at: [-3.72, 2.16, zc], size: [0.09, 0.09, zl], material: vice, static: true });
      game.box({ at: [-3.72, 0.06, zc], size: [0.09, 0.09, zl], material: vice, static: true });
      for (let k = 0; k <= 6; k++) {
        game.box({ at: [-3.72, 0.12 + k * 0.335, zc], size: [0.03, 0.022, zl], material: mesh, physics: false });
      }
      const n = Math.max(2, Math.round(zl / 0.26));
      for (let k = 0; k <= n; k++) {
        game.box({ at: [-3.72, 1.11, zc - zl / 2 + (zl * k) / n], size: [0.03, 2.10, 0.022], material: mesh, physics: false });
      }
      // One invisible slab carries the collision, so the mesh is a barrier
      // without being a hundred colliders.
      game.box({ at: [-3.72, 1.10, zc], size: [0.05, 2.05, zl], material: mesh, static: true, visible: false });
    }
    for (const zc of [WZ - 0.08, 5.42, 4.32]) {
      game.box({ at: [-3.72, 1.10, zc], size: [0.10, 2.20, 0.10], material: vice, static: true });
    }
    // Duckboard on the floor, so the corner has a floor of its own.
    for (let k = 0; k < 8; k++) {
      game.box({ at: [-5.60 + k * 0.00, 0.035, 4.35 + k * 0.30], size: [3.20, 0.05, 0.16],
        material: MAT.wood, physics: false });
    }

    S.bench = {
      at: [BX, 1.0, BZ - 0.72], open: false, slot: 0, index: 0,
      spin: 0.9, preview: false, picking: false, damage: false,
      light: game.light({ at: [BX, 2.28, BZ + 0.10], color: 0xfff0d0, intensity: 26, radius: 4.6 }),
    };
  }

  /* ---------------- the minigun on the roof ----------------

     Bolted to the parapet on the north side, looking out over the ground
     the dead walk in across. It is not a weapon you carry — you buy three
     minutes of it and go back to the window. */
  {
    const gunMat = { color: 0x3a3f45, texture: 'metal', roughness: 0.42, metalness: 1 };
    const boxMat = { color: 0x3f4a33, texture: 'metal', roughness: 0.62, metalness: 1 };
    const MG = [0.0, R.y1, M.z0 + 0.85];
    // Pedestal, and the yoke the gun turns in.
    game.cylinder({ at: [MG[0], MG[1] + 0.22, MG[2]], radius: 0.14, height: 0.44, material: gunMat, static: true });
    game.cylinder({ at: [MG[0], MG[1] + 0.46, MG[2]], radius: 0.20, height: 0.06, material: gunMat, physics: false });
    // Everything that turns hangs off this pivot.
    const yoke = game.box({ at: [MG[0], MG[1] + 0.62, MG[2]], size: 1, physics: false, visible: false });
    const parts = [];
    const add = (a, pos, rot) => { a.parent = yoke; a.setPosition(pos); if (rot) a.setRotation(rot); parts.push(a); return a; };
    for (const sz of [-1, 1]) {
      add(game.box({ size: [0.10, 0.34, 0.05], material: gunMat, physics: false }), [-0.10, -0.06, sz * 0.20]);
    }
    add(game.box({ size: [0.42, 0.20, 0.30], material: gunMat, physics: false }), [-0.02, 0.02, 0]);   // receiver
    // Six barrels in a cluster, on their own actor so the cluster spins.
    /* The cluster's pivot is an invisible unit cube and must stay that way:
       it is in `parts` so it moves with the yoke, and anything that turns
       the whole list visible turns it into a one-metre white box sitting on
       the roof. Kept out of the list instead. */
    const cluster = game.box({ size: 1, physics: false, visible: false });
    cluster.parent = yoke;
    cluster.setPosition([0.22, 0.02, 0]);
    const barrels = [];
    for (let k = 0; k < 6; k++) {
      const a2 = (k / 6) * Math.PI * 2;
      const bl = game.cylinder({ radius: 0.019, height: 0.62, material: gunMat, physics: false });
      bl.parent = cluster;
      bl.setPosition([0.31, Math.cos(a2) * 0.048, Math.sin(a2) * 0.048]);
      bl.setRotation([0, 0, 90]);
      barrels.push(bl); parts.push(bl);
    }
    add(game.cylinder({ radius: 0.062, height: 0.06, material: gunMat, physics: false }), [0.02, 0.02, 0], [0, 0, 90]);
    // Ammunition box and the belt running up into the receiver.
    add(game.box({ size: [0.34, 0.26, 0.22], material: boxMat, physics: false }), [-0.26, -0.16, 0.22]);
    for (let k = 0; k < 6; k++) {
      add(game.box({ size: [0.05, 0.03, 0.09], material: { color: 0xa8843c, texture: 'metal', roughness: 0.3, metalness: 1 }, physics: false }),
        [-0.22 + k * 0.045, -0.05 - Math.sin(k * 0.5) * 0.04, 0.16], [0, 0, -14 - k * 3]);
    }
    // Shield plate, and a lamp on the mount that comes on with it.
    add(game.box({ size: [0.04, 0.30, 0.44], material: gunMat, physics: false }), [-0.20, 0.06, 0]);
    for (const q of parts) q.visible = true;
    yoke.visible = false; cluster.visible = false;
    S.minigun = {
      at: [MG[0], MG[1] + 0.9, MG[2] - 0.9], mount: MG, yoke, cluster, barrels,
      t: 0, cool: 0, spin: 0, spinUp: 0, owed: 0, target: null, aim: -Math.PI / 2,
      lamp: game.light({ at: [MG[0], MG[1] + 1.0, MG[2]], color: 0xffc061, intensity: 0, radius: 5 }),
    };
  }

  /* ---------------- perks ---------------- */
  /* Each with the way it faces, because a machine against the south wall
     built facing north has its front in the concrete. Deflect was exactly
     that: window, lettering and dispensing slot pressed into the wall,
     blank back to the room. */
  /* Standing OFF the wall reads as standing the wrong way round.
   *
   * All four faced correctly and all four floated: Deflect 0.94 m off the
   * south wall, Adrenaline 0.79 off the west, Shield Up 0.59, Super
   * Soldier 0.49 off the parapet. A vending machine with a metre of open
   * floor behind it is not against anything, and the side you see walking
   * up to it is its blank black flank -- which is exactly what a machine
   * turned the wrong way looks like.
   *
   * Deflect was the worst of them because it was also 0.90 m off the EAST
   * wall, closer to that one than to the wall it faced away from, so from
   * most of the room it read as an east-wall machine standing sideways.
   * It moves 0.50 m west as well, out of the corner, so there is no
   * question which wall it belongs to.
   *
   * The deepest part of the cabinet is the shoulder at 0.68, so 0.34 back
   * from the origin; each one is placed to leave 40 mm of shadow gap. */
  const PERK_SPOTS = [
    ['supersoldier', [2.2, R.y1, -6.62], 0],    // roof, back to the north parapet
    ['adrenaline', [-15.62, 0, 3.6], 90],       // wing, back to the west wall
    ['deflect', [5.6, 0, 6.62], 180],           // main room, back to the south wall
    ['shieldup', [-6.0, 0, -6.62], 0],          // main room, back to the north wall
  ];
  S.perkStations = PERK_SPOTS.map(([id, at, yaw]) => buildPerkMachine(game, S, id, PERKS[id], at, yaw));

  /* The shield bubble, hidden until raised. */
  S.shieldMesh = game.sphere({
    at: [0, -50, 0], radius: 1.15, physics: false,
    material: { color: 0x6a4aa8, texture: 'smooth', roughness: 0.1, metalness: 0,
      opacity: 0.30, emissive: 0xb08cff, emissiveStrength: 1.1 },
  });
  S.shieldMesh.visible = false;

  /* ---------------- boards on every window ---------------- */
  S.windows = WINDOWS.map((w) => {
    const win = { def: w, boards: [], zombiesAt: 0 };
    for (let i = 0; i < 5; i++) win.boards.push(spawnBoard(game, w, i, MAT.board));
    return win;
  });
  S.boardMat = MAT.board;

  /* ---------------- light ---------------- */
  S.lamps = [];
  /* 0xffc98f -- (255, 201, 143) -- is a very saturated tungsten, and while
     every surface in the room was rendering at a third of its albedo that
     did not matter: the walls, floor and crates were near black and the
     lamp colour had almost nothing to tint. With the textures corrected
     the room came back at full brightness and every single thing in it
     was the same orange, because one strongly coloured source lighting
     correct albedo IS a monochrome. A hanging bulb in a bunker is warm;
     it is not amber gel. Pulled back toward white, and the cold fills
     over the stairs and the side door brought up so the room is lit from
     two directions in two colours and has some shape to it. */
  const lamp = (x, y, z, intensity, color = 0xffd8ae) => {
    const l = game.light({ at: [x, y, z], color, intensity, radius: 8 });
    const shade = game.cone({ at: [x, y + 0.20, z], radius: 0.17, height: 0.20, material: MAT.steel, physics: false });
    shade.setRotation([180, 0, 0]);
    // Flex up to the slab, and the bulb under the shade.
    const drop = Math.max(0.05, R.y0 - (y + 0.30));
    game.cylinder({ at: [x, y + 0.30 + drop / 2, z], radius: 0.011, height: drop,
      material: { color: 0x1d1f22, texture: 'fabric', roughness: 0.9 }, physics: false });
    game.sphere({ at: [x, y + 0.04, z], radius: 0.055, physics: false, material: {
      color: 0x2a2412, texture: 'smooth', roughness: 0.25, emissive: 0xffd9a0, emissiveStrength: 2.6 } });
    S.lamps.push({ light: l, full: intensity });
    return l;
  };
  /* Hung well clear of the deck. At 3.0 they sat twenty-nine centimetres
     under a ceiling at 3.29, which blew the underside of the slab to white
     — and a white ceiling meeting a darker wall reads as a strip of daylight
     coming through a gap, which is exactly what it was mistaken for. */
  lamp(-1.0, 2.42, 0.5, 88);
  lamp(3.6, 2.42, 4.0, 74);
  lamp(-12.4, 2.42, 1.2, 80);
  lamp(-2.0, 2.4, M.z0 + 1.4, 70, 0xcfe8ff);
  lamp(-5.4, 2.4, M.z0 + 1.4, 70, 0xcfe8ff);
  lamp(SD.x0 + 1.3, 2.4, 0.6, 62, 0xcfe8ff);
  /* Daylight arrives as much from the whole smoke-lit sky as from the sun,
     and it is the sky term that lights every upward-facing surface — the
     roof deck most of all. At the night map's 1.5 the deck read as a black
     slab under an overcast noon; at 2.2 it read as standing water, which is
     the same mistake from the other side. */
  game.renderer.sky.intensity = 1.75;
  setPower(game, S, false);

  // No basement in this map. The workshop code is left in place and simply
  // never built, so switching it back on is one call rather than a rewrite.
  S.shop = null;

/* ---------------- the eighteen carat conveyor ----------------

     Parked inside the east wall so that what the player sees, when the
     three conditions land, is a belt line coming out of solid concrete
     rather than one that was standing there all along. Clear of the
     stairwell and of the window on that wall. */
  {
    const bx = 6.15, by = 1.62, bz = 4.0;
    /* Dusty painted machinery, not a mirror. At metalness 1 a lamp beside
       it does almost nothing — a metal has no diffuse term, and the belt
       lives in the darkest corner of the room. */
    const steel = { color: 0x6b7178, texture: 'metal', roughness: 0.52, metalness: 0.45 };
    const dark = { color: 0x35393e, texture: 'metal', roughness: 0.68, metalness: 0.3 };
    const root = game.box({ at: [bx, by, bz], size: 1, physics: false, visible: false });
    const parts = [];
    const add = (a, pos, rot) => { a.parent = root; a.setPosition(pos); if (rot) a.setRotation(rot); parts.push(a); return a; };
    add(game.box({ size: [1.35, 0.075, 0.44], material: dark, physics: false }), [0, 0, 0]);
    for (const sz of [-1, 1]) add(game.box({ size: [1.35, 0.11, 0.035], material: steel, physics: false }), [0, 0.055, sz * 0.225]);
    for (const sx of [-1, 1]) add(game.cylinder({ radius: 0.055, height: 0.42, material: steel, physics: false }), [sx * 0.64, 0.012, 0], [90, 0, 0]);
    for (const sx of [-1, 1]) add(game.cylinder({ radius: 0.022, height: 0.55, material: dark, physics: false }), [sx * 0.5, -0.31, 0.16]);
    add(game.box({ size: [0.34, 0.36, 0.40], material: steel, physics: false }), [0.74, 0.16, 0]);
    const rollers = [];
    for (let k = -4; k <= 4; k++) {
      rollers.push(add(game.cylinder({ radius: 0.034, height: 0.40, material: steel, physics: false }), [k * 0.135, 0.048, 0], [90, 0, 0]));
    }
    const lamp = add(game.sphere({ radius: 0.038, physics: false, material: {
      color: 0x3a2f12, texture: 'smooth', roughness: 0.3, emissive: 0xffc23a, emissiveStrength: 0 } }), [0.74, 0.40, 0]);
    root.visible = false;
    for (const q of parts) q.visible = false;

    /* The tell-tale.
     *
     * The belt used to arrive out of a blank wall with nothing anywhere in
     * the map saying it existed or what woke it. That is not a secret, it
     * is a coin flip -- three conditions in a particular combination is not
     * something anybody guesses, and an easter egg nobody can reach is the
     * same as one that was never built.
     *
     * So: a stencilled plate bolted to the wall above where the belt comes
     * out, with three dead lamps in a row. You can see it on the first
     * round. It tells you nothing about WHAT the three things are -- that
     * is still yours to work out -- but it tells you there are exactly
     * three of them, and it lights one at a time so you know when you have
     * got one right. That is the whole difference between a puzzle and a
     * rumour. */
    /* Bolted to the east wall itself, not floating where the belt is parked
       -- the belt sits a metre out into the room because it has to slide,
       and a plate hanging in mid-air a metre off the wall reads as a bug,
       not as a fixture. MAP.main.x1 is the inner face; the plate's back is
       flush with it and everything on the plate stands proud toward the
       player, who is looking east at it. */
    const px = MAP.main.x1 - 0.025, py = by + 0.92;
    const plate = game.box({ at: [px, py, bz], size: [0.05, 0.30, 0.72],
      material: { color: 0x4c4136, texture: 'metal', roughness: 0.72, metalness: 0.42 },
      physics: false });
    // Four bolts, because a plate with no fixings reads as a decal.
    for (const sy2 of [-1, 1]) for (const sz2 of [-1, 1]) {
      game.sphere({ at: [px - 0.030, py + sy2 * 0.115, bz + sz2 * 0.305], radius: 0.017,
        material: { color: 0x6d6558, texture: 'metal', roughness: 0.5, metalness: 0.8 },
        physics: false });
    }
    const tell = [];
    for (let k = 0; k < 3; k++) {
      // Recessed in a housing, so a dead lamp still reads as a lamp.
      game.cylinder({ at: [px - 0.030, py, bz + (k - 1) * 0.21], radius: 0.048, height: 0.05,
        material: { color: 0x2b2721, texture: 'metal', roughness: 0.65, metalness: 0.5 },
        rotation: [0, 0, 90], physics: false });
      tell.push(game.sphere({ at: [px - 0.057, py, bz + (k - 1) * 0.21], radius: 0.033,
        material: { color: 0x3a2f12, texture: 'smooth', roughness: 0.28,
          emissive: 0xffc23a, emissiveStrength: 0 }, physics: false }));
    }
    S.belt = { root, parts, rollers, lamp, plate, tell, lit: -1,
      at: [bx, by, bz], out: 0, running: false, dropT: 0, spin: 0 };
  }

  /* The nav grids, built last so everything solid is already standing.

     Chest height rather than floor height: the sweep is looking for what a
     walking body cannot pass, and a body's shoulders clear a kerb its shins
     do not. Two levels, since the stair between them is the room graph's
     business. */
  buildExit42(game, S);

  S.nav = {
    ground: buildNavLevel(game, { x0: MAP.side.x0, x1: MAP.main.x1, z0: MAP.main.z0, z1: MAP.main.z1 }, 1.05),
    roof: buildNavLevel(game, { x0: MAP.roof.x0, x1: MAP.roof.x1, z0: MAP.roof.z0, z1: MAP.roof.z1 },
      MAP.roof.y1 + 1.05),
  };
}

function spawnBoard(game, w, slot, mat) {
  const at = w.sillAt.slice();
  at[1] = w.sillAt[1] - 0.45 + slot * 0.24 + (slot % 2) * 0.03;
  const alongX = WIN_SPANS_X(w.face);
  const size = alongX ? [1.78, 0.19, 0.06] : [0.06, 0.19, 1.78];
  const b = game.box({ at, size, material: mat, physics: false });
  const jitter = ((slot * 37) % 10 - 5) * 1.1;
  b.setRotation(alongX ? [0, jitter * 0.3, jitter] : [jitter, jitter * 0.3, 0]);
  return b;
}

function setPower(game, S, on) {
  // A lamp the graphics setting has switched off stays off.
  for (const L of S.lamps) L.light.intensity = L.off ? 0 : (on ? L.full : L.full * 0.45);
  S.powered = on;
}

/* ---------------- the rack ----------------

   Every weapon in the game is now a real model out of the engine —
   swept profiles at real dimensions, the same way the Thompson and the
   1911 are built — rather than an assembly of stretched cubes. They used
   to be, and it showed: the MP5's rear sight was a sphere, the Arc
   Breaker was a black lump, and next to the two real models the rest of
   the rack looked like it had been thrown together in a lunch break,
   because it had.

   What is left here is the adaptor. The game moves weapons as
   `{ root, parts }` groups with named moving pieces, so each of these
   turns an engine actor and its children into that shape. `opts.chalk`
   paints the whole thing in the wall-buy's chalk, which works because
   every part goes through one tint.

   The pieces each gun exposes are the pieces its reload animation moves:

     swing / hinge   the break guns' barrels, and the pin they drop on
     mag / bolt      a box magazine and a cocking handle
     clip / bolt     a stripper clip and the bolt it feeds past
     cylinder/crane  a revolver's cylinder and the arm it swings out on
     cell            the Arc Breaker's battery
*/

const CHALK_MAT = {
  color: 0xf5f2e6, texture: 'smooth', roughness: 0.9,
  emissive: 0xcfe8ff, emissiveStrength: 0.35,
};

/* Turn an engine weapon actor into the group the game moves. */
function rackGroup(body, extra = {}) {
  const parts = [body];
  for (const name of (body.partNames || []).slice(1)) if (body[name]) parts.push(body[name]);
  return Object.assign({ root: body, parts }, extra);
}

function rackOpts(opts) {
  const o = { physics: false, at: opts.at || [0, 0, 0] };
  if (opts.chalk) o.tint = CHALK_MAT;
  return o;
}

/* The three break guns. Their barrels, forend and — on the Paralyzer —
   coils and charge tube all travel together on the hinge pin, so they are
   handed over as one swing list with a rest transform apiece. */
function rackBreak(body) {
  const swing = [];
  for (const name of body.swingParts) {
    if (body[name]) swing.push({ a: body[name], p: [0, 0, 0], r: [0, 0, 0] });
  }
  return rackGroup(body, { swing, hinge: body.hinge });
}

function makeScattergun(game, opts = {}) { return rackBreak(game.scattergun(rackOpts(opts))); }
function makeSawedOff(game, opts = {}) { return rackBreak(game.sawnOff(rackOpts(opts))); }
function makeParalyzer(game, opts = {}) { return rackBreak(game.paralyzer(rackOpts(opts))); }

function makeMP5(game, opts = {}) {
  const b = game.mp5(rackOpts(opts));
  return rackGroup(b, { mag: [b.mag], bolt: b.bolt, boltRest: b.boltRest, boltThrow: b.boltThrow });
}

function makeMauser(game, opts = {}) {
  const b = game.mauserC96(rackOpts(opts));
  return rackGroup(b, {
    bolt: b.bolt, boltRest: b.boltRest, boltThrow: b.boltThrow,
    clip: b.clip, clipRest: b.clipRest,
  });
}

function makeObliterator(game, opts = {}) {
  const b = game.model5(rackOpts(opts));
  return rackGroup(b, { cylinder: b.cylinder, crane: b.crane,
    hammer: b.hammer, hammerPin: b.hammerPin, hammerCock: b.hammerCock });
}

function makeArcProjector(game, opts = {}) {
  const b = game.arcBreaker(rackOpts(opts));
  // The cell and its window drop out together.
  const cell = [b.cell, b.cellGlow].filter(Boolean);
  return rackGroup(b, { cell: b.cell, cellParts: cell, cellRest: b.cellRest, cellDrop: b.cellDrop, coils: b.copper });
}

/* The two bolt rifles and the machine gun. The rifles feed off a stripper
   clip through the open action, which is the reload the game already
   animates; the MG drops its belt and takes another. */
function boltRifleGroup(b) {
  return rackGroup(b, {
    bolt: b.bolt, boltRest: b.boltRest, boltThrow: b.boltThrow,
    clip: b.clip, clipRest: b.clipRest,
  });
}
function makeRemington(game, opts = {}) { return boltRifleGroup(game.remington700(rackOpts(opts))); }
function makeKillStreak(game, opts = {}) { return boltRifleGroup(game.killStreak(rackOpts(opts))); }

function makeMG42(game, opts = {}) {
  const b = game.mg42(rackOpts(opts));
  /* Four moving parts, because this gun is reloaded and not swapped: the
     cocking handle, the top cover, the belt hanging out of the feed and
     the cover's hinge pin the lid turns about. */
  return rackGroup(b, {
    belt: b.belt, beltRest: b.beltRest, beltDrop: b.beltDrop,
    cover: b.cover, coverPin: b.coverPin, coverOpen: b.coverOpen,
    bolt: b.bolt, boltRest: b.boltRest, boltThrow: b.boltThrow,
  });
}

function makeKnife(game, opts = {}) { return rackGroup(game.trenchKnife(rackOpts(opts))); }
function makeHammer(game, opts = {}) { return rackGroup(game.clawHammer(rackOpts(opts))); }
function makeBatteringRam(game, opts = {}) { return rackGroup(game.batteringRam(rackOpts(opts))); }

function makeRiotShield(game, opts = {}) {
  const o = rackOpts(opts);
  // The cracked one you take off the mini boss is smoked and scarred.
  if (opts.smoked) o.panelMaterial = { color: 0x6a6f74, texture: 'smooth', roughness: 0.42, metalness: 0, opacity: 0.62 };
  return rackGroup(game.riotShield(o));
}

/* ---------------- the one you are ----------------
 *
 * A first-person game shows you two forearms, so that is where the ten
 * of them differed: skin and sleeve. Which is not a character, it is a
 * swatch -- and it meant the ten names on the title card were ten names.
 *
 * Each of them is now a whole body, standing in front of you while you
 * choose, built out of what the game already knows how to make:
 *
 *   FRAME. One of the four the body sculptor has, plus a girth. The four
 *   are four PEOPLE and ten characters cannot be four people, so a
 *   character names the frame it is nearest and a number for how much of
 *   it there is -- Chrissy is a light frame at 0.82, Hank a heavy one at
 *   1.34. Widths and limb radii scale; heights do not, because a wider
 *   person is not a taller one.
 *
 *   FACE. The head sculptor's own archetype and a seed, so no two share
 *   a skull, and `rot: 0` -- the decay term the dead are built with,
 *   turned all the way off. The same sculptor, alive.
 *
 *   HAIR AND FACIAL HAIR. Cut out of that head's own surface and pushed
 *   out along its normals, so a crop hugs the skull it is on rather than
 *   a general one. Seven styles and six beards between them.
 *
 *   CLOTHES. Their own garment in the outfit table -- greatcoat,
 *   coveralls, flannel, trenchcoat, lab coat -- built as one mesh with
 *   per-vertex tints, which is the same one draw call the dead cost.
 *
 * Built lazily and kept: the first look at a character costs a couple of
 * hundred milliseconds and every look after that is free. Ten of them
 * only exist if you look at all ten.
 */
const HERO_STAGE = [0.5, 1.1, 1.95];      // 2.45 m in front of where you start

function heroModel(game, S, id) {
  S.heroModels = S.heroModels || {};
  if (S.heroModels[id]) return S.heroModels[id];
  const H = HEROES[id];
  const B = (H && H.body) || {};
  const L = (H && H.look) || {};
  /* `zombie: true` with `rot: 0` is not a contradiction: that flag
     selects the CLOTHED builder -- body, garment, head with a decay
     term -- and rot is the decay. At zero it is a living person in
     clothes, which is the thing this needs and the thing the living
     path (a bare body and no garment at all) cannot make. */
  const a = game.character({
    at: HERO_STAGE, name: 'hero:' + id,
    zombie: true, rot: 0, blood: false, face: 'static',
    zombieBuild: B.faceType === 'female' ? 'female' : B.faceType === 'heavy' ? 'heavy' : 'male',
    /* Damped. The four frames already carry most of the difference
       between a light body and a heavy one -- the heavy build's torso is
       nearly 30 per cent wider than the male one before any of this --
       so a character's own number is applied at just over half strength.
       At full strength Hank's 1.34 on top of the heavy frame produced a
       slab with the arms lost inside it. */
    girth: 1 + ((B.build || 1) - 1) * 0.55,
    outfit: B.outfit, faceType: B.faceType || 'male', seed: B.seed || 5,
    hair: B.hair, hairColor: B.hairColor, beard: B.beard, beardColor: B.beardColor,
    height: B.height || 1.78,
    skin: { color: L.skin || 0x9d9691, texture: 'skin',
      roughness: L.rough != null ? L.rough : 0.72, metalness: 0, subsurface: 0.12 },
    material: { color: L.skin || 0x9d9691, texture: 'skin',
      roughness: L.rough != null ? L.rough : 0.72, metalness: 0, subsurface: 0.12 },
    clothMaterial: { color: 0xffffff, texture: 'fabric', roughness: 0.95, metalness: 0, uvScale: 2.4 },
  });
  /* Eyes. The head sculptor leaves sockets and the dead get lit ones
     put into them by hand; a living face with empty sockets is the one
     thing that stops a character reading as a person. Same sockets,
     same measurements -- a white, a coloured iris and a black pupil,
     and nothing emissive, because these are alive. */
  if (a.head && a.skeleton) {
    const hb = a.skeleton.index('head');
    const hs = a.head.scale.y;
    const ho = a.head.localOffset;
    const EX = 0.091 * 0.82, EY = 0.032, EZ = 0.2335;
    const irisCol = B.eyes != null ? B.eyes : 0x4a3a24;
    a.eyeParts = [];
    for (const side of [-1, 1]) {
      const bx = ho.x + side * EX * hs, by = ho.y + EY * hs, bz = ho.z + EZ * hs;
      const mk = (r, col, dz, flat) => {
        const q = game.sphere({ radius: r * hs / 0.389, physics: false,
          material: { color: col, texture: 'smooth', roughness: 0.14, metalness: 0 } });
        q.parent = a; q.parentBone = hb;
        q.localOffset = new window.LE.Vec3(bx, by, bz + dz);
        q.scale.z *= flat;
        a.eyeParts.push(q);
        return q;
      };
      mk(0.0104, 0xcfc8ba, 0, 0.34);          // the white
      mk(0.0074, irisCol, 0.0018, 0.34);      // iris
      mk(0.0034, 0x0d0906, 0.0030, 0.40);     // pupil
    }
  }
  const b = a.controller.body;
  b.gravityScale = 0;
  b.isTrigger = true;
  b.setPosition({ x: HERO_STAGE[0], y: HERO_STAGE[1], z: HERO_STAGE[2] });
  if (a.animator) a.animator.play('idle', 0);
  S.heroModels[id] = a;
  return a;
}

function heroModelVisible(a, on) {
  if (!a) return;
  a.visible = on;
  for (const k of ['head', 'cloth', 'blood', 'armor', 'hair', 'beard']) {
    if (a[k]) a[k].visible = on;
  }
  for (const q of a.eyeParts || []) q.visible = on;
}

/* Show one and hide the rest. Turned slowly on the spot, because a
   figure standing dead still in front of you reads as a mannequin and
   the whole point is that it does not. */
function showHeroModel(game, S, id) {
  S.heroModels = S.heroModels || {};
  for (const k in S.heroModels) heroModelVisible(S.heroModels[k], false);
  if (S.started) return null;                 // once you are playing, nobody is on the stage
  const a = heroModel(game, S, id);
  heroModelVisible(a, true);
  /* facing is the yaw the actor is given, and facing 0 is +Z -- the
     controller derives it as atan2(dx, dz) from where it is walking, so
     walking toward +Z is zero. The camera stands at z 4.30 looking down
     -Z at a stage at z 1.95, so a character facing the camera faces +Z
     and that is zero, not pi. Pi turned all ten of them round to face
     the wall. */
  a.controller.facing = 0;
  return a;
}

function turnHeroModel(game, S, dt) {
  if (S.started) return;
  /* The first one is staged on the first FRAME rather than during
     start-up. Building a character is a couple of hundred milliseconds
     and start-up is the one place in this game where that is worth
     something -- by the time the title card is on screen there is a
     whole frame's worth of room for it. */
  if (!S.heroStaged) {
    S.heroStaged = true;
    try { showHeroModel(game, S, S.heroId); } catch (e) { console.warn('hero model:', e.message); }
  }
  if (!S.heroModels) return;
  const a = S.heroModels[S.heroId];
  if (!a || !a.visible) return;
  S.heroSpin = (S.heroSpin || 0) + dt * 0.30;
  a.controller.facing = Math.sin(S.heroSpin) * 0.62;
}

/* ---------------- player ---------------- */

function makePlayer(game, S, hud, sfx, voice) {
  const hero = game.character({ at: [0.5, 1.1, 4.4], face: false, name: 'player' });
  hero.visible = false;
  if (hero.head) hero.head.visible = false;
  game.firstPerson(hero, { eyeHeight: 1.62 });
  // Facing -Z, which is the back wall, the Thompson and the stair beyond it.
  game._camYaw = Math.PI;

  const P = {
    actor: hero, hp: PLAYER.hp, lastHit: -99, downs: 0,
    slots: ['m1911'], slot: 0, knifeSlot: 'knife',
    ammo: {
      m1911: { mag: WEAPONS.m1911.mag, reserve: WEAPONS.m1911.reserve },
      knife: { mag: Infinity, reserve: Infinity },
      hammer: { mag: Infinity, reserve: Infinity },
      ram: { mag: Infinity, reserve: Infinity },
      shield: { mag: Infinity, reserve: Infinity },
    },
    nades: GRENADE.start, nadeCd: 0,
    swingT: 0, blocking: false, blockT: 0,
    gold: 0, goldAmmo: false,
    upgraded: {}, camoOff: {}, fitted: {},
    cooldown: 0, reloading: 0, reloadStage: 0, breakStage: 0, cylStage: 0, beltStage: 0,
    trigT: 0, trigHold: 0,
    clipStage: 0, cellStage: 0, swayT: 0,
    // Three springs: muzzle rise, drive back along the bore, and twist.
    kickPitch: 0, kickVel: 0, kickBack: 0, backVel: 0, kickRoll: 0, rollVel: 0,
    slideCycle: 0, slideCycleMax: 0.085,
    /* Single-action cocking. cockT runs from the shot to the moment the
       hammer is back; before the first shot of a magazine it is already
       there, which is why it starts at its finished value. */
    cockT: 1, cockMax: 0.30, cockStage: 1,
    view: {}, muzzleT: 0, alive: true,
    // Aim, sprint and recoil state.
    ads: 0, adsWant: false, sprint: 0, sprinting: false,
    recoil: { pitch: 0, yaw: 0 }, recoilApplied: { pitch: 0, yaw: 0 },
    arms: {},
    perks: {}, maxHp: PLAYER.hp,
    stamina: 1, sliding: 0, slideCd: 0, slideDir: null,
    shieldT: 0, shieldCd: 0,
    prevSlot: 0, knifeOut: false,
    building: false, buildingWas: false, buildT: 0, lastBeat: -1, prevSlotBuild: 0,
  };

  /* View models: one instance of each weapon, shown when equipped. */
  P.view.m1911 = { kind: 'single', actor: game.pistol1911({ physics: false }), muzzle: 0.24 };
  /* Blaze is River's pistol in the other hand: the same model, engraved
     with its own name and gripped in red instead of blue. Building it as
     a second model would be two of everything for a colour change. */
  P.view.blaze = { kind: 'single', muzzle: 0.24, actor: game.pistol1911({
    physics: false, engrave: 'Blaze',
    gripMaterial: { color: 0x8f1c10, texture: 'smooth', roughness: 0.50, metalness: 0 },
    material: { color: 0xd8ccc4, texture: 'metal', roughness: 0.26, metalness: 1 },
  }) };
  P.view.thompson = { kind: 'single', actor: game.thompson({ physics: false }), muzzle: 0.55 };
  /* Muzzle distance and sight height come off each model rather than from
     a number typed here. A gun whose muzzle flash is 4 cm from where the
     barrel ends, or whose sights are aligned to a guess, is a gun that
     never quite looks or aims right, and no amount of tuning by eye fixes
     it — the model knows where its own muzzle is, so it is asked. */
  /* Single-actor weapons get the same `parts` list the groups have, so
     everything downstream — showing, hiding, retinting for the upgrade —
     works off one list rather than off a hand-written set of names. */
  const singleParts = (a) => {
    const out = [a];
    for (const k of ['slide', 'mag', 'wood', 'grips', 'mark', 'bolt']) if (a[k]) out.push(a[k]);
    return out;
  };
  for (const id of ['m1911', 'thompson', 'blaze']) {
    if (P.view[id]) P.view[id].parts = singleParts(P.view[id].actor);
  }

  const rack = (id, made) => {
    const v = Object.assign(made, { kind: 'group', muzzle: made.root.muzzleAt || 0.3 });
    P.view[id] = v;
    if (made.root.sightAt != null && WEAPONS[id]) WEAPONS[id].sightH = made.root.sightAt;
    return v;
  };
  rack('scatter', makeScattergun(game));
  rack('arc', makeArcProjector(game));
  rack('knife', makeKnife(game));
  rack('hammer', makeHammer(game));
  rack('ram', makeBatteringRam(game));
  rack('shield', makeRiotShield(game));
  rack('obliterator', makeObliterator(game));
  rack('mauser', makeMauser(game));
  rack('paralyzer', makeParalyzer(game));
  rack('mp5', makeMP5(game));
  rack('sawnoff', makeSawedOff(game));
  rack('remington', makeRemington(game));
  rack('killstreak', makeKillStreak(game));
  rack('mg42', makeMG42(game));
  rack('shieldWorn', makeRiotShield(game));
  // Hands, parented to each weapon so they inherit its every motion.
  for (const [id, v] of Object.entries(P.view)) {
    const root = v.kind === 'single' ? v.actor : v.root;
    /* The single-action revolver gets its thumb as a separate mesh, because
       its thumb has a job: dragging the hammer back between shots. */
    /* The weapon's own surface goes with them, so each finger is closed
       until it touches this gun rather than curled by a constant. */
    /* The bore height goes with them. It is what tells the trigger finger
       where a trigger cannot be -- above the bore is the top of the slide,
       and the solve was perfectly happy to lay the finger along it. */
    v.arms = game.viewmodelArms(root, WEAPONS[id].hands,
      { key: id, thumb: !!WEAPONS[id].thumbCock,
        boreY: (root && root.boreAt != null) ? root.boreAt : null,
        surface: weaponSurface(game, root) });
  }
  /* Every reload prop, built now.

     A magazine, a stripper clip, a belt, a pair of shells and four loose
     cartridges: fourteen weapons' worth, made once at start-up so that
     nothing is uploaded to the card during a fight. They are hidden
     immediately; the reload shows them. */
  for (const [id, v] of Object.entries(P.view)) {
    const sp = WEAPONS[id];
    if (!sp || sp.melee || !sp.reloadKind) continue;
    try {
      const pr = reloadProp(game, P, v, sp, sp.reloadKind, id);
      if (pr) for (const q of pr.parts) q.visible = false;
    } catch (e) { void e; }
  }
  for (const v of Object.values(P.view)) setViewVisible(v, false);

  /* Pointer lock: click to capture, mouse drives engine yaw/pitch.

     And on a controller, WITHOUT a click.

     This is the bug that has been closing the tab mid-round. Pointer lock
     was only ever asked for on a mouse click, and someone playing on a pad
     never clicks -- so the lock is never taken, the operating system's
     cursor stays live on top of the page, and the pad drives it. A stray
     press then lands on whatever browser furniture the pointer happens to
     be sitting over, and the game is gone.

     With the lock held the cursor is hidden and swallowed: nothing outside
     the canvas can be hit at all. So the moment a pad is seen doing
     anything, the lock is taken and kept -- re-taken if it drops, with a
     little patience, because a browser refuses the request for about a
     second after Escape and will refuse it forever if it is asked in a
     loop. */
  const canvas = game.canvas;
  canvas.style.cursor = 'none';
  const lockNow = () => {
    if (S.testMode || S.gameOver || S.paused) return;
    if (document.pointerLockElement === canvas) return;
    if (S._lockAt && performance.now() - S._lockAt < 1400) return;
    S._lockAt = performance.now();
    try {
      const r = canvas.requestPointerLock();
      // Chrome returns a promise now; a refusal here is normal and must not
      // reach the console as an unhandled rejection every second.
      if (r && r.catch) r.catch(() => {});
    } catch (e) { void e; }
  };
  S.lockPointer = lockNow;
  canvas.addEventListener('click', lockNow);
  /* Losing it is a signal, not an accident: Escape, an alt-tab, or the pad
     nudging something. If a pad is connected and the game is live, take it
     back. If it is not, leave the cursor alone -- someone on a mouse may
     have pressed Escape on purpose. */
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) return;
    if (!game.input.pad.connected) return;
    setTimeout(lockNow, 1500);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousedown', (e) => { if (e.button === 2) game.input.pointer.rightDown = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) game.input.pointer.rightDown = false; });
  /* A controller that walks the system cursor must not also aim.
   *
   * Under pointer lock the browser reports cursor motion as movementX and
   * movementY and does not say what moved the cursor. Plenty of pads --
   * through Steam Input, a vendor driver, or the operating system's own
   * accessibility mapping -- drive the pointer with the LEFT stick, so
   * pushing forward to walk arrives here as the mouse being pushed
   * forward and the view pitches up; pulling back to reverse pitches it
   * down. That is the report exactly, including why it only happens with
   * the cursor hidden: hidden IS pointer lock, and this handler is the
   * only thing listening then. It is also why the right stick was always
   * fine -- nothing was emulating a mouse with that one.
   *
   * The game already reads both sticks straight from the Gamepad API, so
   * while a stick is deflected there is nothing an emulated pointer can
   * add except a second, unasked-for input on the same axis. Dropped.
   *
   * The cost is that a player walking on a stick while aiming with a real
   * mouse loses the mouse for as long as they are walking. That is a rare
   * way to hold a game and this is not: a pad on its own is broken
   * without it, and the two cannot be told apart from inside the page,
   * because the emulated events are indistinguishable from real ones. */
  /* Any deflection at all, and for a moment after it stops. The driver's
     pointer emulation is smoothed -- it keeps gliding for a tenth of a
     second after the stick centres -- so a test on the stick's CURRENT
     position lets the tail of every push through, which reads as the view
     drifting up whenever you stop walking. And the threshold is as near
     zero as the reading goes, because the stick's own dead zone has
     already been taken out upstream: what arrives here as 0.03 is a real
     push, and a real push is what moves the cursor. */
  let padMoveAt = 0;
  const padDriving = () => {
    const pd = game.input.pad;
    if (!pd || !pd.connected) return false;
    if (Math.hypot(pd.lx || 0, pd.ly || 0) > 0.02
      || Math.hypot(pd.rx || 0, pd.ry || 0) > 0.02) {
      padMoveAt = performance.now();
      return true;
    }
    return performance.now() - padMoveAt < 260;
  };
  /* 0.0021 radians per reported pixel is the base this game was tuned at.
     Everything the settings screen offers is a factor ON it, so the number
     in the menu means the same thing whatever the base becomes later, and
     1.00x is always what the game shipped feeling like. Aiming keeps
     whatever fraction of it S.adsSensMul says -- the same figure the stick
     uses, so the two devices agree about what aiming does. */
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (padDriving()) return;
    const k = 0.0021 * (S.mouseSens == null ? 1 : S.mouseSens)
      * (1 - P.ads * (1 - (S.adsSensMul == null ? 0.55 : S.adsSensMul)));
    game._camYaw -= e.movementX * k;
    game._camPitch = Math.max(-1.45, Math.min(1.45,
      game._camPitch + e.movementY * k * (S.invertY ? -1 : 1)));
  });

  P.equipped = () => P.slots[Math.max(0, Math.min(P.slot, P.slots.length - 1))] || P.slots[0] || 'm1911';
  /* The gun as it is actually configured. Every read of the weapon's stats
     goes through here, so an attachment written once in the catalogue takes
     effect everywhere — firing, recoil, aiming, reloading, the HUD — without
     any of those having to know attachments exist. Cached on the fitted set,
     because this runs several times a frame. */
  P.fitted = {};
  P.specFor = (id) => {
    const base = WEAPONS[id] || WEAPONS.m1911;
    const fit = P.fitted[id];
    if (!fit) return base;
    const key = ATTACH.slots.map((sl) => fit[sl] || '-').join('|');
    if (base.__cacheKey === key && base.__cached) return base.__cached;
    let out = Object.assign({}, base);
    for (const sl of ATTACH.slots) {
      const part = fit[sl] && ATTACH.parts[fit[sl]];
      if (part) Object.assign(out, part.fold(out));
    }
    if (out.dual && ATTACH.dualName[id]) { out.name = ATTACH.dualName[id]; out.slotName = out.name.toUpperCase(); }
    out.__base = base;
    base.__cacheKey = key; base.__cached = out;
    return out;
  };
  P.spec = () => P.specFor(P.equipped());
  P.ammoFor = (id) => P.ammo[id] || { mag: Infinity, reserve: Infinity };

  P.give = (id) => {
    if (!P.ammo[id]) P.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    else { P.ammo[id].mag = WEAPONS[id].mag; P.ammo[id].reserve = WEAPONS[id].reserve; }
    const have = P.slots.indexOf(id);
    if (have >= 0) { P.slot = have; }
    else if (P.slots.length < 2) { P.slots.push(id); P.slot = P.slots.length - 1; }
    else {
      /* Both hands full: the one being replaced goes on the FLOOR rather
         than out of existence. Losing a gun you paid for because you
         picked up the wrong thing is the single worst way this game could
         take something from you, and it is entirely avoidable -- it lands
         where you were standing and it is still there. */
      const gone = P.slots[P.slot];
      P.slots[P.slot] = id;
      if (gone && gone !== id) dropWeapon(game, S, P, gone);
    }
    P.reloading = 0;
    hud.flashWeapon(WEAPONS[id].slotName);
  };

  return P;
}

/* Attachments you can see on the gun.

   Built once per weapon the first time anything is fitted to it and then
   just shown or hidden, because a part that is bought and sold and bought
   again should not leak a new set of actors every time. Positions come off
   the weapon's own measurements — its muzzle distance and its sight height
   — so a scope sits above the real sight line on every gun rather than
   above a guessed one. */
/* What each attachment stands IN FOR on each weapon.
 *
 * An extended magazine used to be drawn as well as the magazine already in
 * the gun -- two magazines in the same well, one inside the other, on every
 * weapon that takes one. Same for the drum and the fast mag. An attachment
 * that adds a part without taking the old one away is not a modification,
 * it is a second gun growing out of the first.
 *
 * Keyed by slot and then by weapon, because the part is called something
 * different on nearly every model: an MP5 has a `mag`, a Mauser has a
 * `clip`, an MG 42 has a `belt` and the Arc Breaker has a `cell` with its
 * own glow. Read off the models rather than assumed -- every name here was
 * taken from the built weapon, not from memory. */
/* Which family each weapon belongs to, where its muzzle distance alone
   would get it wrong -- a Mauser is 247 mm long and takes a pistol's parts;
   the Kill Streak is a rifle whatever else it is. */
const HOST_CLASS = {
  m1911: 'pistol', blaze: 'pistol', obliterator: 'pistol', mauser: 'pistol',
  thompson: 'smg', mp5: 'smg', sawnoff: 'smg', scatter: 'smg', paralyzer: 'smg',
  remington: 'rifle', killstreak: 'rifle', mg42: 'rifle', arc: 'rifle',
};

/* And what each one FEEDS FROM, which is a different question.
 *
 * `HOST_CLASS` decides whether a long barrel is a pistol's or a rifle's.
 * It does not decide whether the weapon has a magazine well, and eight of
 * the fourteen do not: the Model 5 is a revolver, three are break guns,
 * three feed off a stripper clip, one off a belt and one off a battery.
 * Every one of them was being given a box magazine to hang under a well it
 * does not have -- a straight black box in mid-air below a cylinder, bolted
 * to nothing, which is what "the Model 5 attachments are so weird" is.
 *
 * The magazine slots build against this instead, so each action gets the
 * thing that action actually carries more ammunition in. */
const HOST_FEED = {
  m1911: 'box', blaze: 'box', thompson: 'box', mp5: 'box',
  obliterator: 'cylinder',
  scatter: 'break', sawnoff: 'break', paralyzer: 'break',
  mauser: 'clip', remington: 'clip', killstreak: 'clip',
  mg42: 'belt', arc: 'cell',
};

/* Where the magazine slot's part hangs, per weapon, in the weapon's own
   space. Under the well on the guns that have one, on the frame or the
   receiver flank on the ones that do not -- and never on a part that
   moves, so nothing is left floating when a cylinder swings out or a
   barrel breaks open.
   
   A single number here was the other half of the fault: every gun had its
   magazine parts hung at [-0.010, -0.092, 0], which is under the well of a
   1911 and thin air on a Thompson, a break gun or a machine gun. */
const MAG_MOUNT = {
  m1911: { fastmag: [-0.010, -0.092, 0], extmag: [-0.008, -0.086, 0], drummag: [0.004, -0.030, 0] },
  blaze: { fastmag: [-0.010, -0.092, 0], extmag: [-0.008, -0.086, 0], drummag: [0.004, -0.030, 0] },
  mp5: { fastmag: [0.090, -0.118, 0], extmag: [0.090, -0.100, 0], drummag: [0.092, -0.046, 0] },
  thompson: { fastmag: [0.092, -0.104, 0], extmag: [0.092, -0.088, 0], drummag: [0.094, -0.030, 0] },
  // Revolver: all three live on the frame, clear of the cylinder's swing.
  obliterator: { fastmag: [-0.004, 0.010, 0], extmag: [0.030, 0.030, 0], drummag: [0.040, 0.020, 0] },
  // Break guns: on the receiver flank, behind the hinge so the barrels can drop.
  scatter: { fastmag: [-0.020, 0.026, 0], extmag: [-0.026, 0.030, 0], drummag: [-0.040, 0.020, 0] },
  sawnoff: { fastmag: [-0.014, 0.022, 0], extmag: [-0.018, 0.026, 0], drummag: [-0.030, 0.016, 0] },
  paralyzer: { fastmag: [-0.020, 0.030, 0], extmag: [-0.026, 0.034, 0], drummag: [-0.040, 0.024, 0] },
  // Clip guns: the spare clip stands on the receiver, the boxes hang below it.
  mauser: { fastmag: [0.004, 0.030, 0], extmag: [0.016, -0.030, 0], drummag: [0.020, -0.026, 0] },
  remington: { fastmag: [0.010, 0.034, 0], extmag: [0.020, -0.024, 0], drummag: [0.024, -0.020, 0] },
  killstreak: { fastmag: [0.014, 0.040, 0], extmag: [0.026, -0.026, 0], drummag: [0.030, -0.022, 0] },
  // Machine gun: everything hangs off the feed, on the side the belt runs.
  mg42: { fastmag: [0.060, 0.084, 0.020], extmag: [0.086, 0.076, 0.048], drummag: [0.030, 0.060, 0.030] },
  // Arc Breaker: on and behind the cell housing.
  arc: { fastmag: [0.020, 0.010, 0], extmag: [0.020, 0.020, 0], drummag: [0.020, 0.030, 0] },
};

/* Which of the gun's own parts each attachment stands IN FOR.
 *
 * Keyed by the PART, not by the slot, because not every part in a slot
 * replaces anything. An extended magazine and a drum are whole magazines
 * and the gun's own has to go; a fast magazine is a baseplate extension
 * with a pull loop on it, which bolts to the bottom of the magazine you
 * already have and would look absurd floating on its own. Keying this by
 * slot hid the magazine under all three, which is the opposite error to the
 * one it was written to fix.
 *
 * The part names differ on nearly every model -- an MP5 has a `mag`, a
 * Mauser a `clip`, an MG 42 a `belt`, the Arc Breaker a `cell` with its own
 * glow -- and every name here was read off the built weapon. */
const MAG_PART = {
  m1911: ['mag'], blaze: ['mag'], thompson: ['mag'], mp5: ['mag'],
  mauser: ['clip'], remington: ['clip'], killstreak: ['clip'],
  mg42: ['belt'], arc: ['cell', 'cellGlow'],
};
/* And which of those an attachment actually stands in for.
 *
 * This used to be "extended magazine and drum replace whatever the gun
 * calls its magazine", on all fourteen. On the four weapons with a
 * magazine well that is right. Everywhere else it was wrong twice over:
 * the part being fitted is not a magazine at all now -- a cartridge slide,
 * a side saddle, a spare clip -- and the thing being hidden was load-
 * bearing. Fitting an extended magazine to the Mauser hid the stripper
 * clip, which is the actor the RELOAD animates: the gun quietly lost its
 * reload animation the moment you bought an attachment for it.
 *
 * So: only a real magazine replaces a real magazine. A longer belt
 * replaces the belt it is longer than, and the belt drum contains it. A
 * cartridge slide, a side saddle, a bandolier, a spare clip, a second
 * cell and a back canister are all ADDITIONS, and hide nothing. */
const BOX_MAG = {
  m1911: ['mag'], blaze: ['mag'], thompson: ['mag'], mp5: ['mag'],
};
const BELT_MAG = { mg42: ['belt'] };
const REPLACES = {
  extmag: Object.assign({}, BOX_MAG, BELT_MAG),
  drummag: Object.assign({}, BOX_MAG, BELT_MAG),
  // fastmag deliberately absent: it is an addition, not a replacement.
};

/* The magazine the ANIMATION should move: the fitted one if there is one,
   the gun's own otherwise. Without this the reload drops and returns a
   magazine that is not on screen while the drum hanging off the gun sits
   perfectly still through the whole thing. */
function activeMag(v) {
  return (v.magSwap && v.magSwap.length) ? v.magSwap : (v.magOwn || null);
}

/* Where the barrel really ends, measured off the model.
 *
 * Every weapon reports a `muzzleAt`, and on some of them it is the point
 * the flash comes from rather than the crown -- the Thompson's is 48 mm
 * past its own barrel, because a Cutts compensator sits on the front and
 * the number was written for the flash. A suppressor hung off it is a
 * suppressor screwed to nothing, floating in front of the gun.
 *
 * So it is measured instead: the furthest-forward vertex that lies within
 * 20 mm of the bore axis, which is the barrel and nothing else -- a stock,
 * a drum or a foregrip is nowhere near the bore. Walked once per weapon at
 * start-up, and it cannot drift out of step with a model that changes. */
function boreEnd(game, root, bore, fallback) {
  if (!root || !game.geometryOf) return fallback;
  let best = -1e9;
  const walk = (a, local) => {
    const geo = a.mesh && game.geometryOf(a.mesh);
    if (geo && geo.positions) {
      const q = geo.positions, m = local ? local.e : null;
      for (let i = 0; i < q.length; i += 9) {
        let x = q[i], y = q[i + 1], z = q[i + 2];
        if (m) {
          const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
          const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
          const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
          x = wx; y = wy; z = wz;
        }
        if (Math.hypot(y - bore, z) < 0.020 && x > best) best = x;
      }
    }
    for (const c of (a.children || [])) {
      const cm = new LegendEngine.Mat4();
      cm.compose(c._position, c._rotation, c.scale);
      if (local) { const t = new LegendEngine.Mat4(); t.mulMatrices(local, cm); walk(c, t); }
      else walk(c, cm);
    }
  };
  try { walk(root, null); } catch (e) { void e; return fallback; }
  // A weapon whose bore is nowhere near where it says keeps its own number.
  if (best < -1e8) return fallback;
  return best;
}

function applyAttachmentLooks(game, P, id) {
  const v = P.view[id];
  if (!v) return;
  const root = v.kind === 'single' ? v.actor : v.root;
  const base = WEAPONS[id];
  /* Three measurements off the weapon itself: how far the muzzle is, how
     high the sight line runs, and where the bore sits. The last was
     guessed as three tenths of the sight height, which was near enough on
     one gun and two centimetres out on the rest — a suppressor floating
     below its own barrel. Every model reports its own bore now. */
  /* Not this weapon's kit at all. Building three magazine parts, four
     optics and four barrels for a claw hammer is fourteen models nobody
     will ever see, and it is how a hammer ended up measurably wearing an
     extended magazine 73 mm off its own head. */
  if (ATTACH.noWork.includes(id) || base.melee) return;
  const M = v.muzzle || 0.3, H = base.sightH || 0.04;
  const B = root && root.boreAt != null ? root.boreAt : H * 0.30;
  /* Where the barrel actually ENDS, which is not where the muzzle flash
     goes. `v.muzzle` is the flash point and it is deliberately a little
     past the crown -- on the 1911 it is 240 mm against a 190 mm barrel.
     Hanging a suppressor off it put every muzzle device on the two pistols
     and the Thompson 38 to 48 mm out in front of the gun, screwed to
     nothing. The models report their own crown; use it. */
  const MZ = boreEnd(game, root, B, root && root.muzzleAt != null ? root.muzzleAt : M);
  if (!v.att) {
    /* Every part is a real model out of the engine now, authored around its
       own mount point — so all that is left here is deciding where on this
       particular weapon each mount sits, which comes off the weapon's own
       measurements rather than off a table of guesses per gun.

       They used to be built here out of boxes and cylinders: a suppressor
       was one cylinder, a red dot was a box with a red slab on the front, a
       seven-power scope was three cylinders in a row. These are the parts
       the bench exists to show off, so they were the most conspicuous pile
       of boxes left in the game. */
    /* What KIND of weapon this is, so a part can be built for it.
     *
     * A long barrel for a pistol is not a long barrel for a rifle and an
     * MP5 does not take a 1911's magazine -- they are different objects
     * sharing a slot. One model per attachment, hung on everything, is what
     * put a pistol magazine on a submachine gun. */
    const cls = HOST_CLASS[id] || (base.melee ? 'pistol' : M > 0.60 ? 'rifle' : M > 0.30 ? 'smg' : 'pistol');
    const feed = HOST_FEED[id] || 'box';
    /* The weapon's own ammunition, handed to the part builder so a
       cartridge slide on the Model 5 carries .50 and a side saddle on the
       scattergun carries twelve gauge -- rather than every gun's spare
       rounds being the same generic pill. */
    const A = base.ammo || {};
    const dims = {};
    if (A.round) { dims.roundR = +(A.round.headR || 0.0072).toFixed(4); dims.roundLen = +(A.round.overall || 0.052).toFixed(4); }
    if (A.shell) { dims.roundR = +(A.shell.r || 0.0092).toFixed(4); dims.roundLen = +(A.shell.len || 0.070).toFixed(4); }
    if (A.clip) { dims.clipCount = A.clip.count || 5; dims.clipPitch = +(A.clip.pitch || 0.0126).toFixed(4); dims.roundR = +((A.clip.round && A.clip.round.headR) || 0.0042).toFixed(4); }
    if (A.loader) { dims.pcd = +(A.loader.pcd || 0.0155).toFixed(4); dims.roundR = +((A.loader.round && A.loader.round.headR) || 0.0072).toFixed(4); }
    const mount = (partId, pos, rot) => {
      const grp = game.gunPart(partId, { host: cls, feed, dims, bore: (base.bore || 0.0046) });
      if (!grp) return [];
      grp.setPosition(pos);
      if (rot) grp.setRotation(rot);
      grp.parent = root;
      const list = [grp];
      for (const nm of (grp.partNames || []).slice(1)) if (grp[nm]) list.push(grp[nm]);
      for (const q of list) q.visible = false;
      return list;
    };
    /* Where a magazine part goes on THIS gun. The table first, then the
       model's own magazine well if it has one, then a guess -- so a weapon
       added later still gets its parts somewhere sane rather than under a
       1911's well. */
    const mm = MAG_MOUNT[id];
    const magAt = (partId, fallback) => {
      if (mm && mm[partId]) return mm[partId];
      const w = (root && root.magWell) || null;
      if (w) return [w[0] + (partId === 'drummag' ? 0.006 : 0), w[1] - (partId === 'drummag' ? 0.004 : 0.014), w[2]];
      return fallback;
    };
    // Muzzle devices go on the bore at the muzzle; barrels replace the
    // front of it; optics sit on the sight line; magazines under the well.
    const muz = [MZ - 0.012, B, 0];
    const opt = [0.012, H - 0.010, 0];
    v.att = {
      suppressor: mount('suppressor', muz),
      compensator: mount('compensator', muz),
      annihilator: mount('annihilator', muz),
      skullsplitter: mount('skullsplitter', [MZ * 0.70, B, 0]),
      longbarrel: mount('longbarrel', [MZ - 0.030, B, 0]),
      shortbarrel: mount('shortbarrel', [MZ * 0.66, B, 0]),
      bayonet: mount('bayonet', [MZ * 0.72, B - 0.019, 0]),
      reddot: mount('reddot', opt),
      thermal: mount('thermal', opt),
      nightvision: mount('nightvision', opt),
      rangefinder: mount('rangefinder', opt),
      scope7x: mount('scope7x', [0.006, H - 0.014, 0]),
      /* Where the magazine slot hangs, per weapon. Under the well on the
         guns that have one; on the frame or the receiver flank on the ones
         that do not. If a gun is not in the table it falls back to its own
         reported magazine well, and only then to a guess. */
      fastmag: mount('fastmag', magAt('fastmag', [-0.010, -0.092, 0])),
      extmag: mount('extmag', magAt('extmag', [-0.008, -0.086, 0])),
      drummag: mount('drummag', magAt('drummag', [0.004, -0.030, 0])),
    };
  }
  /* The gun's own magazine, found once. `v.mag` is set by the racking code
     on the models that already animate one; everything else is looked up by
     the name this weapon calls it. */
  if (!v.magOwn) {
    const names = MAG_PART[id] || [];
    const own = Array.isArray(v.mag) ? v.mag.slice() : [];
    for (const nm of names) if (root && root[nm] && own.indexOf(root[nm]) < 0) own.push(root[nm]);
    v.magOwn = own;
  }

  const fit = P.fitted[id] || {};
  const wanted = new Set(ATTACH.slots.map((sl) => fit[sl]).filter(Boolean));
  for (const [k, arr] of Object.entries(v.att)) {
    const on = wanted.has(k);
    for (const a of arr) { a.visible = on; a.__attOn = on; }
  }

  /* Out with the old. A fitted magazine hides the one the gun came with,
     and becomes the one the reload animates -- so the drum drops out of the
     well and comes back rather than the invisible stock magazine doing it
     while the drum stays bolted on. */
  /* A fitted magazine hides the one the gun came with and becomes the one
     the reload animates -- so the drum drops out of the well and comes back
     rather than an invisible stock magazine doing it while the drum stays
     bolted on. A part that only ADDS to the magazine leaves it alone. */
  const magPart = fit.mag;
  const swaps = !!(magPart && REPLACES[magPart] && REPLACES[magPart][id]);
  v.magSwap = swaps && v.att[magPart] ? v.att[magPart].slice() : null;
  for (const a of (v.magOwn || [])) { a.__replaced = !!v.magSwap; a.visible = !v.magSwap; }
  /* And `v.mag` is what the group reload path reads, so it has to point at
     whichever magazine is actually on the gun. */
  if (Array.isArray(v.mag) || v.magSwap) v.mag = activeMag(v) || [];
}

/* The weapon's skin, as a distance from any point to it.
 *
 * Handed to the hand builder so a finger can be CLOSED until it touches
 * rather than curled by a constant and hoped over. Every fingertip in the
 * game was sitting 15 to 45 mm off the weapon because how far a hand closes
 * was a property of the grip KIND, and the girth of an actual gun at an
 * actual grip point is not a constant.
 *
 * Built once per weapon at startup and thrown away after. A uniform grid
 * over the model's own vertices: exact enough at these scales -- the meshes
 * run to twenty thousand vertices on a pistol -- and fast enough that
 * solving five digits on two hands for eighteen weapons is not noticeable.
 *
 * Everything is read in the weapon's LOCAL space, which is the space the
 * hands are authored in. Using actor.matrix here would mix in the world
 * transform of a gun that is at that moment somewhere in the bunker, and
 * every distance out of it would be meaningless. */
/* CALLED BEFORE THE ARMS AND THE PROPS ATTACH, and that is not a detail.
 *
 * This walks `root` and everything under it. At the moment the builder
 * calls it, a weapon's root holds the weapon; a few lines later the hands
 * are parented to it, and a few lines after that the reload prop -- a
 * magazine, a clip, a belt -- is parented to it too and hidden. So the
 * field the solve is given is the gun alone, which is right, and any
 * later caller building one from the same root gets the gun plus two
 * things that are not the gun.
 *
 * Both have already cost a measurement. A probe that forgot the arms
 * reported every trigger several millimetres INSIDE something, because it
 * was measuring the range to the finger resting there. And grip.test
 * counted the hidden magazine as weapon for long enough to open a bug
 * about the Thompson's trigger finger being a third inside its receiver,
 * which it never was. Blind both before calling this from anywhere
 * downstream of start-up: with them in, the Scattergun's trigger point
 * reads 2.3 mm inside solid against 5.5 mm of clear air, and the
 * Paralyzer's 1.7 against 8.9. */
function weaponSurface(game, root) {
  if (!root || !game.geometryOf) return null;
  /* Only how MANY sampled vertices the walk found, not where they are:
     the guard below wants a count and nothing else does. */
  let nPts = 0;
  /* Triangles as well as points. The point list keeps every third vertex,
     which is plenty to answer "how far to the surface" and useless for
     "which side of it" -- a flat panel has vertices only at its corners,
     so a shell marked from vertices is a shell full of holes. */
  const tris = [];
  const walk = (a, local) => {
    const geo = a.mesh && game.geometryOf(a.mesh);
    if (geo && geo.positions) {
      const q = geo.positions;
      const m = local ? local.e : null;
      if (geo.indices) {
        const I = geo.indices;
        const tf = (i) => {
          const x = q[i * 3], y = q[i * 3 + 1], z = q[i * 3 + 2];
          if (!m) return [x, y, z];
          return [m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14]];
        };
        for (let i = 0; i < I.length; i += 3) tris.push(tf(I[i]), tf(I[i + 1]), tf(I[i + 2]));
      }
      // Every third vertex: a fingertip is 10 mm across and these meshes are
      // far finer than that, so a third of them describes the same surface.
      for (let i = 0; i < q.length; i += 9) nPts += 3;
    }
    for (const c of (a.children || [])) {
      const cm = new LegendEngine.Mat4();
      cm.compose(c._position, c._rotation, c.scale);
      if (local) { const t = new LegendEngine.Mat4(); t.mulMatrices(local, cm); walk(c, t); }
      else walk(c, cm);
    }
  };
  walk(root, null);
  if (nPts < 30) return null;

  /* There WAS a grid of points here, and nothing ever read it.
     It is what the field used before the switch to point-to-triangle
     below, and when that landed the query moved to the triangle grid and
     this one was left standing: built for every weapon at start-up,
     several thousand points bucketed into a Map with string keys, and
     then never looked at again. Gone, along with the point list itself --
     only the count survives, because the guard above wants to know
     whether the walk found a mesh at all. */
  /* Distance to the nearest TRIANGLE, not the nearest vertex.
   *
   * The solve wants each joint one finger-radius plus a hair off the
   * weapon's skin, and it was being handed the range to the closest
   * VERTEX instead. On a swept mesh the vertices sit on the section rings
   * and a flat panel between two rings has none in the middle, so the
   * field reads several millimetres further out than the surface actually
   * is -- and the solve, believing it, drives the finger that much into
   * the metal. That is not a small correction: measured by ray parity,
   * between 14% and 63% of each hand's finger surface was inside its gun,
   * and moving the hand closer only buried it deeper, because the error
   * grows as you approach the middle of a panel.
   *
   * Point-to-triangle, over a grid of triangles rather than of points, so
   * a lookup still touches a handful of them. */
  const TCELL = 0.016;
  /* Each triangle's own box, kept alongside so a query can reject one
     without running the region test on it. Indexed by the triangle's
     start offset, the same number the grid cells hold. */
  const tlo = new Float32Array(tris.length), thi = new Float32Array(tris.length);
  let wlo0 = 1e9, wlo1 = 1e9, wlo2 = 1e9, whi0 = -1e9, whi1 = -1e9, whi2 = -1e9;
  for (let t = 0; t < tris.length; t += 3) {
    const A = tris[t], B2 = tris[t + 1], C = tris[t + 2];
    for (let c = 0; c < 3; c++) {
      tlo[t + c] = Math.min(A[c], B2[c], C[c]);
      thi[t + c] = Math.max(A[c], B2[c], C[c]);
    }
    if (tlo[t] < wlo0) wlo0 = tlo[t];
    if (tlo[t + 1] < wlo1) wlo1 = tlo[t + 1];
    if (tlo[t + 2] < wlo2) wlo2 = tlo[t + 2];
    if (thi[t] > whi0) whi0 = thi[t];
    if (thi[t + 1] > whi1) whi1 = thi[t + 1];
    if (thi[t + 2] > whi2) whi2 = thi[t + 2];
  }
  /* A DENSE grid over the weapon's own box, not a hash of cells.
   *
   * Counted over a start-up, four cells in five that a query looked up
   * were empty -- and every one of those cost a key to build and a hash
   * to miss on. A weapon is a metre of gun at most, which at 16 mm cells
   * is a box of a few tens of thousands of them, so the whole grid fits
   * in two flat arrays: where each cell's triangles start, and the
   * triangles themselves end to end. An empty cell is then one integer
   * read that comes back equal to the next one, and a cell outside the
   * weapon's box is a bounds check. Same cells, same contents, same
   * answers -- it is only the way they are reached that changes. */
  const gx0 = Math.floor(wlo0 / TCELL), gy0 = Math.floor(wlo1 / TCELL), gz0 = Math.floor(wlo2 / TCELL);
  const nx = Math.floor(whi0 / TCELL) - gx0 + 1;
  const ny = Math.floor(whi1 / TCELL) - gy0 + 1;
  const nz = Math.floor(whi2 / TCELL) - gz0 + 1;
  const nCell = nx * ny * nz;
  const gStart = new Int32Array(nCell + 1);
  for (let t = 0; t < tris.length; t += 3)
    for (let i = Math.floor(tlo[t] / TCELL); i <= Math.floor(thi[t] / TCELL); i++)
      for (let j = Math.floor(tlo[t + 1] / TCELL); j <= Math.floor(thi[t + 1] / TCELL); j++)
        for (let k = Math.floor(tlo[t + 2] / TCELL); k <= Math.floor(thi[t + 2] / TCELL); k++)
          gStart[((i - gx0) * ny + (j - gy0)) * nz + (k - gz0) + 1]++;
  for (let c = 0; c < nCell; c++) gStart[c + 1] += gStart[c];
  const gItem = new Int32Array(gStart[nCell]);
  const fill = gStart.slice(0, nCell);
  for (let t = 0; t < tris.length; t += 3)
    for (let i = Math.floor(tlo[t] / TCELL); i <= Math.floor(thi[t] / TCELL); i++)
      for (let j = Math.floor(tlo[t + 1] / TCELL); j <= Math.floor(thi[t + 1] / TCELL); j++)
        for (let k = Math.floor(tlo[t + 2] / TCELL); k <= Math.floor(thi[t + 2] / TCELL); k++)
          gItem[fill[((i - gx0) * ny + (j - gy0)) * nz + (k - gz0)]++] = t;
  /* Which triangles this query has already measured.
     A triangle wider than a cell is filed in every cell it crosses, and a
     query reads twenty-seven of them at the first ring alone, so without
     this the same triangle gets the full region test several times over
     for the same answer. A stamp per query costs one comparison. */
  const seen = new Int32Array(tris.length);
  let visit = 0;
  /* And for the queries that are nowhere near the weapon at all, the box
     again: the search gives up after six rings, so anything further than
     six cells outside it cannot find a triangle. Most queries are exactly
     that -- a solver stepping a fingertip through the air around the gun. */
  const REACH = 7 * TCELL;
  /* Closest point on a triangle to a point: the standard region test --
     the three vertices, the three edges, or the face interior. */
  const triDist2 = (px, py, pz, A, B2, C) => {
    const abx = B2[0]-A[0], aby = B2[1]-A[1], abz = B2[2]-A[2];
    const acx = C[0]-A[0], acy = C[1]-A[1], acz = C[2]-A[2];
    const apx = px-A[0], apy = py-A[1], apz = pz-A[2];
    const d1 = abx*apx + aby*apy + abz*apz, d2 = acx*apx + acy*apy + acz*apz;
    let cx, cy, cz;
    if (d1 <= 0 && d2 <= 0) { cx = A[0]; cy = A[1]; cz = A[2]; }
    else {
      const bpx = px-B2[0], bpy = py-B2[1], bpz = pz-B2[2];
      const d3 = abx*bpx + aby*bpy + abz*bpz, d4 = acx*bpx + acy*bpy + acz*bpz;
      if (d3 >= 0 && d4 <= d3) { cx = B2[0]; cy = B2[1]; cz = B2[2]; }
      else {
        const vc = d1*d4 - d3*d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) {
          const v2 = d1 / (d1 - d3);
          cx = A[0] + abx*v2; cy = A[1] + aby*v2; cz = A[2] + abz*v2;
        } else {
          const cpx = px-C[0], cpy = py-C[1], cpz = pz-C[2];
          const d5 = abx*cpx + aby*cpy + abz*cpz, d6 = acx*cpx + acy*cpy + acz*cpz;
          if (d6 >= 0 && d5 <= d6) { cx = C[0]; cy = C[1]; cz = C[2]; }
          else {
            const vb = d5*d2 - d1*d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) {
              const w3 = d2 / (d2 - d6);
              cx = A[0] + acx*w3; cy = A[1] + acy*w3; cz = A[2] + acz*w3;
            } else {
              const va = d3*d6 - d5*d4;
              if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
                const w3 = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                cx = B2[0] + (C[0]-B2[0])*w3; cy = B2[1] + (C[1]-B2[1])*w3; cz = B2[2] + (C[2]-B2[2])*w3;
              } else {
                const den = 1 / (va + vb + vc);
                const v2 = vb * den, w3 = vc * den;
                cx = A[0] + abx*v2 + acx*w3; cy = A[1] + aby*v2 + acy*w3; cz = A[2] + abz*v2 + acz*w3;
              }
            }
          }
        }
      }
    }
    const dx = cx-px, dy = cy-py, dz = cz-pz;
    return dx*dx + dy*dy + dz*dz;
  };
  const surf = (x, y, z) => {
    if (!tris.length) return 1;
    if (x < wlo0 - REACH || x > whi0 + REACH || y < wlo1 - REACH || y > whi1 + REACH ||
        z < wlo2 - REACH || z > whi2 + REACH) return 1;
    const gi = Math.floor(x / TCELL), gj = Math.floor(y / TCELL), gk = Math.floor(z / TCELL);
    let best = 1e9;
    visit++;
    for (let r = 0; r <= 6; r++) {
      /* Walk the SHELL, not the cube with its middle skipped. At the
         sixth ring that is 2197 iterations to visit 866 cells, and the
         1331 skipped ones each cost an abs and a max to skip. */
      for (let a2 = -r; a2 <= r; a2++) {
        const ea = (a2 === -r || a2 === r);
        for (let b2 = -r; b2 <= r; b2++) {
          const eb = ea || b2 === -r || b2 === r;
          // On a face of the shell every k belongs; otherwise only the two ends.
          for (let c2 = -r; c2 <= r; c2 += (eb || r === 0) ? 1 : (2 * r)) {
            /* The CELL's box before the cell's contents.
             *
             * Counted over a start-up: 269 million triangles stamped to
             * measure 15 per query. Ninety-four per cent of the work was
             * rejecting triangles one at a time out of cells that were
             * wholly further away than the best answer so far.
             *
             * Rejecting the cell instead is exact, not an approximation.
             * A triangle wider than a cell is filed in every cell its box
             * overlaps, including the one holding its own nearest point,
             * and that cell's box is no further from the query than the
             * triangle is -- so a cell further away than `best` cannot be
             * holding the winner, only copies of triangles that will be
             * reached through nearer cells. And this runs before the key
             * and the lookup, so a rejected cell costs no hashing either. */
            const bi = (gi + a2) * TCELL, bj = (gj + b2) * TCELL, bk = (gk + c2) * TCELL;
            const cdx = x < bi ? bi - x : (x > bi + TCELL ? x - bi - TCELL : 0);
            const cdy = y < bj ? bj - y : (y > bj + TCELL ? y - bj - TCELL : 0);
            const cdz = z < bk ? bk - z : (z > bk + TCELL ? z - bk - TCELL : 0);
            if (cdx * cdx + cdy * cdy + cdz * cdz >= best) continue;
            const ii = gi + a2 - gx0, jj = gj + b2 - gy0, kk = gk + c2 - gz0;
            if (ii < 0 || ii >= nx || jj < 0 || jj >= ny || kk < 0 || kk >= nz) continue;
            const ci0 = (ii * ny + jj) * nz + kk;
            for (let ci = gStart[ci0], ce = gStart[ci0 + 1]; ci < ce; ci++) {
              const t = gItem[ci];
              // Measured already, this query, from another cell it crosses.
              if (seen[t] === visit) continue;
              seen[t] = visit;
              /* Its box first. The distance to a box is a lower bound on
                 the distance to what is inside it, so a box already
                 further away than the best triangle so far cannot win and
                 does not need the region test. */
              const bx = x < tlo[t] ? tlo[t] - x : (x > thi[t] ? x - thi[t] : 0);
              const by = y < tlo[t + 1] ? tlo[t + 1] - y : (y > thi[t + 1] ? y - thi[t + 1] : 0);
              const bz = z < tlo[t + 2] ? tlo[t + 2] - z : (z > thi[t + 2] ? z - thi[t + 2] : 0);
              if (bx * bx + by * by + bz * bz >= best) continue;
              const d = triDist2(x, y, z, tris[t], tris[t + 1], tris[t + 2]);
              if (d < best) best = d;
            }
          }
        }
      }
      // One ring past the first hit: a nearer triangle can sit diagonally.
      if (best < 1e9 && r >= 1) break;
    }
    return best < 1e9 ? Math.sqrt(best) : 1;
  };

  /* Is this point INSIDE the weapon?
   *
   * The distance above is to the nearest VERTEX and has no sign, so it
   * cannot tell a finger resting on a surface from one buried in it -- and
   * a finger lying in the middle of a large flat panel, the side of a
   * receiver say, is far from every vertex while being deep inside the
   * solid. That is not a hypothetical: measured by ray parity against the
   * weapons' own triangles, 14% of the 1911's finger surface and 63% of
   * the MG 42's support hand were inside the gun. The solver's own
   * anti-clipping term was reading the one number that cannot see it.
   *
   * A coarse occupancy grid answers it in a lookup. Cells the geometry
   * passes through are the shell; flooding inwards from the outside
   * leaves the interior as whatever the flood never reached. Only the
   * INTERIOR counts as solid, not the shell -- a finger touching the
   * surface must stay legal, or every hand in the game gets pushed a
   * cell off the weapon it is holding. */
  /* RAY PARITY, which is exact and cannot be fooled by a hollow shell.
   *
   * This was an occupancy grid: rasterise the triangles into cells, flood
   * inwards from a corner, and call whatever the flood never reached the
   * inside. That works on a solid. These weapons are not solids. They are
   * swept SHELLS -- a handguard is a tube, a barrel jacket is a tube with
   * slots cut in it -- and a flood walks straight into an open end and
   * fills the lot, so `inside` answered false everywhere and every
   * anti-clipping term in the builder was reading a constant. I fixed the
   * grid's cell size, raised its cap, and it made no difference at all,
   * because the mechanism was wrong and not merely mis-sized.
   *
   * Parity needs no grid and no flood: a ray from a point crosses a
   * surface an odd number of times exactly when the point is inside it.
   * Measured this way against the weapons' own triangles, 10 to 25 per
   * cent of each of the MP5's support fingers is inside the gun and 41
   * per cent of its thumb -- which is what a hand standing through a
   * handguard looks like as a number, and what nothing in the builder
   * could see.
   *
   * Cast along +X, and bucket the triangles by the (y, z) cell they cover
   * so a ray tests a handful rather than six thousand. Counting both
   * directions from the same candidates costs one comparison more and
   * buys the one guard parity needs: on a CLOSED surface the two parities
   * agree, and where they disagree the mesh is open along that line and
   * the answer is not to be trusted -- so it says outside, which is the
   * safe way to be wrong. */
  if (!tris.length) { surf.inside = () => false; return surf; }
  /* Four millimetres, not ten.
   *
   * The parity test reads ONE column cell and runs an exact point-in-2D-
   * triangle test on everything filed in it, so the cell size cannot
   * change the answer: a triangle whose shadow covers the ray's (y, z) has
   * a (y, z) box covering it too, and is filed in that cell whatever the
   * cell measures. All the size decides is how many triangles get tested
   * and thrown away -- and at ten millimetres a rifle's column held every
   * triangle down the whole length of the barrel that shared those ten
   * millimetres of section. Finer cells, same answer, less of it. */
  const PCELL = 0.004;
  const pkey = (j, k) => j * 8192 + k;
  const pgrid = new Map();
  for (let t = 0; t < tris.length; t += 3) {
    const A = tris[t], B2 = tris[t + 1], C = tris[t + 2];
    const j0 = Math.floor(Math.min(A[1], B2[1], C[1]) / PCELL);
    const j1 = Math.floor(Math.max(A[1], B2[1], C[1]) / PCELL);
    const k0 = Math.floor(Math.min(A[2], B2[2], C[2]) / PCELL);
    const k1 = Math.floor(Math.max(A[2], B2[2], C[2]) / PCELL);
    for (let j = j0; j <= j1; j++) {
      for (let k = k0; k <= k1; k++) {
        const kk = pkey(j, k);
        let cell = pgrid.get(kk);
        if (!cell) { cell = []; pgrid.set(kk, cell); }
        cell.push(t);
      }
    }
  }
  const inside = (x, y, z) => {
    const cell = pgrid.get(pkey(Math.floor(y / PCELL), Math.floor(z / PCELL)));
    if (!cell) return false;
    let ahead = 0, behind = 0;
    for (let c = 0; c < cell.length; c++) {
      const t = cell[c];
      const A = tris[t], B2 = tris[t + 1], C = tris[t + 2];
      // Does the ray's (y, z) point land in this triangle's shadow?
      const ay = A[1] - y, az = A[2] - z;
      const by = B2[1] - y, bz = B2[2] - z;
      const cy = C[1] - y, cz = C[2] - z;
      const wc = ay * bz - by * az;
      const wa = by * cz - cy * bz;
      const wb = cy * az - ay * cz;
      if (!((wa >= 0 && wb >= 0 && wc >= 0) || (wa <= 0 && wb <= 0 && wc <= 0))) continue;
      const den = wa + wb + wc;
      if (den === 0) continue;
      // Where along x it crosses, by the same weights.
      const hx = (A[0] * wa + B2[0] * wb + C[0] * wc) / den;
      if (hx > x) ahead++; else behind++;
    }
    // Open along this line: the two counts disagree, and outside is the
    // safe answer.
    if (((ahead & 1) === 1) !== ((behind & 1) === 1)) return false;
    return (ahead & 1) === 1;
  };
  /* SIGNED, and this is the whole fault behind "the fingers are jumbled up
   * with the gun".
   *
   * Everything that places a hand -- the anchor seating, the knuckle row,
   * the curl -- scores a candidate by how near this field is to a
   * finger's own radius. Unsigned, a knuckle ten millimetres INSIDE the
   * slide reads ten millimetres and scores perfectly, so a search over
   * that field does not merely tolerate burying the hand in the gun: it
   * is indifferent between resting on the metal and being ten
   * millimetres under it, and coordinate descent will take whichever it
   * reaches first. Measured on the 1911, it took the inside: the four
   * knuckles came out at y -11, +8, +27 and +45 -- climbing the frame
   * and onto the top of the slide -- while a hundred millimetres of grip
   * below them had no finger on it at all.
   *
   * Negative inside the solid turns that indifference into a cost, and
   * every consumer of this field gets the fix at once without knowing
   * anything about occupancy grids. The sign only appears past the shell
   * band, so a finger genuinely touching the surface still reads zero and
   * stays legal. */
  const signed = (x, y, z) => (inside(x, y, z) ? -surf(x, y, z) : surf(x, y, z));
  signed.inside = inside;
  signed.unsigned = surf;
  return signed;
}

/* Where each slot hangs off a weapon, in that weapon's own space. Derived
   from its measured muzzle distance and sight height rather than listed per
   gun, so a marker lands on the right part of every weapon including the
   ones that do not exist yet. */
function attachAnchor(slot, id, v) {
  const base = WEAPONS[id] || WEAPONS.m1911;
  const r = v.kind === 'single' ? v.actor : v.root;
  const M = v.muzzle || 0.3, H = base.sightH || 0.04;
  const B = r && r.boreAt != null ? r.boreAt : H * 0.30;
  switch (slot) {
    case 'muzzle': return [M - 0.01, B, 0];
    case 'barrel': return [M * 0.68, B - 0.022, 0];
    case 'optic': return [0.03, H + 0.030, 0];
    case 'mag': return [-0.010, -0.080, 0];
    default: return [-0.215, 0.004, 0];        // stock
  }
}

/* World point to canvas pixels. Behind the camera comes back null so a
   marker for something off-screen is dropped rather than drawn mirrored. */
function toScreen(game, p) {
  const m = game.camera.viewProj.e;
  const x = p[0], y = p[1], z = p[2];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw <= 1e-4) return null;
  const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw;
  const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
  const r = game.canvas.getBoundingClientRect();
  return [(cx * 0.5 + 0.5) * r.width, (1 - (cy * 0.5 + 0.5)) * r.height];
}

/* Pros and cons, read off the fold rather than written twice. Comparing the
   folded spec against the base is the only way these can never disagree
   with what the part actually does. */
function attachEffects(id, partId) {
  const base = WEAPONS[id];
  const part = ATTACH.parts[partId];
  if (!base || !part) return { pros: [], cons: [] };
  const after = Object.assign({}, base, part.fold(base));
  const pros = [], cons = [];
  const cmp = (label, a, b, higherIsBetter, fmt) => {
    if (a == null || b == null || Math.abs(b - a) < 1e-6) return;
    const better = higherIsBetter ? b > a : b < a;
    const pct = Math.round(Math.abs(b - a) / (Math.abs(a) || 1) * 100);
    const text = `${label} ${fmt ? fmt(b) : (pct + '%')}`;
    (better ? pros : cons).push(text);
  };
  cmp('magazine', base.mag, after.mag, true, (v2) => v2 + ' rounds');
  cmp('reload', base.reload, after.reload, false, (v2) => v2.toFixed(2) + ' s');
  cmp('damage', base.dmg, after.dmg, true);
  cmp('spread', base.spread, after.spread, false);
  cmp('muzzle rise', base.recoil.up, after.recoil.up, false);
  cmp('sideways kick', base.recoil.side, after.recoil.side, false);
  cmp('handling', base.moveMul || 1, after.moveMul || 1, true);
  cmp('velocity', base.muzzleVel || 300, after.muzzleVel || 300, true);
  if (after.headBonus) pros.push(`+${after.headBonus} on the head`);
  if (after.bayonet) pros.push('butt-strokes hit like the knife');
  if (after.quiet) pros.push('quiet');
  if (after.noAds) cons.push('no sights at all');
  if (after.dual) pros.push('two of them');
  return { pros: pros.slice(0, 4), cons: cons.slice(0, 4) };
}

/* The damage diagram: a body out of eleven boxes, each carrying what this
   gun does to it. Laid out in percentages of the panel. */
const DMG_BOXES = {
  head:       { x: 40, y: 0,  w: 20, h: 11, short: 'HEAD' },
  neck:       { x: 42, y: 11, w: 16, h: 5,  short: 'NECK' },
  shoulder:   { x: 26, y: 16, w: 48, h: 7,  short: 'SHOULDERS' },
  upperTorso: { x: 36, y: 23, w: 28, h: 12, short: 'UPPER' },
  midTorso:   { x: 36, y: 35, w: 28, h: 11, short: 'MID' },
  lowerTorso: { x: 36, y: 46, w: 28, h: 10, short: 'LOWER' },
  arm:        { x: 22, y: 23, w: 12, h: 24, short: 'ARM' },
  hand:       { x: 22, y: 47, w: 12, h: 8,  short: 'HAND' },
  upperLeg:   { x: 37, y: 56, w: 26, h: 17, short: 'UPPER LEG' },
  lowerLeg:   { x: 37, y: 73, w: 26, h: 19, short: 'LOWER LEG' },
  foot:       { x: 37, y: 92, w: 26, h: 8,  short: 'FEET' },
};

function damageTable(spec) {
  return HIT_REGIONS.map((r) => {
    const box = DMG_BOXES[r.id];
    if (!box) return null;
    const per = spec.dmg * regionMul(r, spec) + (r.crit ? (spec.headBonus || 0) : 0);
    const total = per * (spec.pellets > 1 ? spec.pellets : 1);
    return Object.assign({}, box, {
      crit: !!r.crit,
      dmg: Math.round(total),
    });
  }).filter(Boolean);
}

/* What each gun is called after the rock has had it. A single "Upgraded"
   prefix is the lazy version and it makes every weapon feel the same; a
   name apiece is most of what makes putting a gun in worth doing. */
const UPGRADE_NAMES = {
  m1911: 'Riverbed', blaze: 'Wildfire', thompson: 'Chicago Ironworks', mp5: 'Nine Millimetre Sermon',
  remington: 'Seven Hundred Yards', killstreak: 'The Long Goodbye', mg42: 'Forty-Three',
  scatter: 'Both Barrels', sawnoff: 'Last Word', paralyzer: 'Grand Mal',
  mauser: 'Kaiser', obliterator: 'Total Obliteration', arc: 'Arc Angel',
  knife: 'Wound Man', hammer: 'Hard Labour', ram: 'Door Policy',
  shield: 'Wall Order', shieldWorn: 'Wall Order',
};

/* The upgraded finish. The meteorite writes P.upgraded[id]; the bench can
   turn the camo off and on again without giving up the upgrade itself. */
function applyUpgradeLook(game, P, id) {
  const v = P.view[id];
  if (!v) return;
  const on = !!(P.upgraded && P.upgraded[id]) && !(P.camoOff && P.camoOff[id]);
  // The whole weapon takes the camo, not just its frame.
  const parts = v.parts || [v.actor];
  for (const a of parts) {
    if (!a.__baseMat) a.__baseMat = a.material;
    a.material = on
      ? game.material({ color: 0x2a0f06, texture: 'metal', roughness: 0.34, metalness: 1,
        emissive: 0xff5a12, emissiveStrength: 1.5 })
      : a.__baseMat;
  }
}

function setViewVisible(v, on) {
  if (v.arms) for (const a of v.arms.parts) a.visible = on;
  /* Every part, from one list.

     Visibility does not cascade to children in this engine — each actor is
     tested on its own — so a weapon is only put away if every piece of it
     is. The old version named three children by hand and missed the two
     that every gun has: the slide and the magazine stayed on screen after
     you swapped away, hanging in the air where the gun used to be. That is
     the other half of "my old gun is still floating there". */
  /* Except the parts an attachment has taken the place of.
   *
   * This runs every frame for every weapon, and it turned the gun's own
   * magazine back on immediately after applyAttachmentLooks had hidden it
   * -- so an extended magazine and a drum were still drawn over the top of
   * the stock magazine on six weapons, which is the exact fault the
   * replacement table was written to fix, undone one line later by the
   * function that puts guns away. Marked parts stay off. */
  for (const p of v.parts) p.visible = on && !p.__replaced;
  // Attachment parts follow the weapon, but only the ones actually fitted:
  // showing the whole set on draw hangs every scope and muzzle device the
  // gun has ever worn off it at once.
  if (v.att) for (const arr of Object.values(v.att)) for (const a of arr) a.visible = on && !!a.__attOn;
  // The magazine in the support hand only exists during a reload, and never
  // for a weapon that has been put away.
  if (v.prop) for (const a of v.prop.parts) a.visible = false;
}

/* Position the equipped weapon against the camera every frame — bob,
   sway, recoil, reload dip. This is the whole first-person feel. */
function updateViewmodel(game, P, dt, moving, S, sfx) {
  const spec = P.spec();
  const v = P.view[P.equipped()];
  /* Behind a scope the weapon is not drawn at all. The eye is at the
     ocular; a rifle you can still see the outside of is a rifle you are not
     looking through, and at 7x the viewmodel shares the camera's field of
     view so it swells to fill the screen. The sight picture is the HUD's
     job from here. */
  const shown = P.alive && !P.scoped;
  for (const [id, view] of Object.entries(P.view)) setViewVisible(view, id === P.equipped() && shown);
  /* Still positioned while it is hidden: the muzzle's world point, the
     ejection port and the reload state all come out of this function, and a
     shot fired through a scope still has to throw its flash and its brass
     from the right place. */
  if (!P.alive) return;

  const cam = game.camera;
  const f = _vTmp1.copy(cam.target).sub(cam.position).normalize();
  const right = _vTmp3.copy(f).cross(_vTmp2.set(0, 1, 0)).normalize();
  // True camera up = right x forward. Negating it flips every vertical
  // offset, which sends a gun meant to sit low in frame up into the sky.
  const up = _vTmp4.copy(right).cross(f).normalize();

  P.swayT += dt * (moving ? 7.2 : 1.6);
  const sway = 1 - P.ads * 0.88;                 // aiming kills the bob
  const bobY = Math.sin(P.swayT * 2) * (moving ? 0.006 : 0.0016) * sway;
  const bobX = Math.cos(P.swayT) * (moving ? 0.004 : 0.001) * sway;
  /* Recoil on the weapon itself, as a spring rather than a fade.
   *
   * kickPitch used to bleed off linearly at a fixed rate and that was the
   * whole of it: the muzzle tilted up and drifted back down, and nothing
   * else happened. A gun going off does not tilt, it is DRIVEN -- back
   * into the hand along the bore, up, and twisted, and then the shooter
   * pulls it back down and slightly past where it started before it
   * settles. That overshoot is what reads as mass. An exponential decay
   * has none: it approaches zero and stops, which feels like the gun is
   * being lowered rather than fighting you.
   *
   * So each of the three axes is a damped spring. Stiffness sets how
   * quickly it comes back, damping how much it overshoots on the way --
   * under 1.0 it rings, which is what a light gun does, and the heavy
   * ones are damped nearer to critical so they come back slowly and
   * once. */
  /* The muzzle flash fading. It is a kept light rather than a disposable
     one (see the firing code), so it is put out here instead of by the
     engine's decay list -- 0.05 s, the same life it had before. */
  if (P.flashLights) {
    for (const fl of Object.values(P.flashLights)) {
      if (fl.intensity <= 0) continue;
      fl.intensity -= fl.intensity * Math.min(1, dt / 0.05);
      if (fl.intensity < 0.5) fl.intensity = 0;
    }
  }

  const KS = 190, KD = 15;                 // stiffness, damping
  P.kickVel = (P.kickVel || 0) + (-P.kickPitch * KS - (P.kickVel || 0) * KD) * dt;
  P.kickPitch += P.kickVel * dt;
  P.backVel = (P.backVel || 0) + (-(P.kickBack || 0) * KS * 1.15 - (P.backVel || 0) * KD * 1.05) * dt;
  P.kickBack = (P.kickBack || 0) + P.backVel * dt;
  P.rollVel = (P.rollVel || 0) + (-(P.kickRoll || 0) * KS * 0.8 - (P.rollVel || 0) * KD * 0.9) * dt;
  P.kickRoll = (P.kickRoll || 0) + P.rollVel * dt;
  if (Math.abs(P.kickPitch) < 1e-5 && Math.abs(P.kickVel) < 1e-4) { P.kickPitch = 0; P.kickVel = 0; }
  if (Math.abs(P.kickBack) < 1e-6 && Math.abs(P.backVel) < 1e-5) { P.kickBack = 0; P.backVel = 0; }
  if (Math.abs(P.kickRoll) < 1e-5 && Math.abs(P.rollVel) < 1e-4) { P.kickRoll = 0; P.rollVel = 0; }
  /* A reload brings the weapon UP and inboard, not down.

     It used to dip 90 mm, which on top of a hip carry that already sits
     128 mm below the eye put the whole gun off the bottom of the screen:
     the character loaded it somewhere around his knees and the player
     watched an empty room. You cannot see the shells go in if you cannot
     see the gun. It lifts to where the hands are working and rolls
     inboard so the breech faces the camera, then settles back. */
  const rl = P.reloading > 0 ? Math.sin(Math.min(1, 1 - P.reloading / spec.reload) * Math.PI) : 0;
  const dip = -rl * 0.098;
  const drawIn = rl * 0.052;
  const rollIn = rl * 18;

  const root = v.kind === 'single' ? v.actor : v.root;

  /* Hip carry, aimed carry, and the sprint cant, blended.

     Aimed: the gun goes dead-centre and drops by its own sight height, so
     the real rear notch and front blade land exactly on the camera axis.
     That is why every weapon carries a measured sightH — nothing here is
     tuned by eye, and every gun aims correctly because the geometry says
     where its sights are. */
  /* Hip carry. -0.17 at 0.34 m is 26 degrees below the camera axis, and
     half the vertical field of view is 28 — the weapon sat on the very
     bottom edge of the frame with only the barrel showing, which is most
     of what "the guns look broken" was. */
  /* On the bench the weapon is held out at arm's length, dead centre, with
     the hands taken off it — it is the same viewmodel, so what you inspect
     is exactly what you carry, down to the attachments. */
  const bench = S && S.bench && S.bench.open ? S.bench : null;
  const po = bench ? { x: bench.damage ? -0.115 : 0, y: 0.012, d: 0.60 } : P.poseOverride;
  if (bench && v.arms) for (const q of v.arms.parts) q.visible = false;
  /* Hip carry, scaled to the weapon. A pistol and a submachine gun cannot
     sit in the same place: the pistol is 24 cm long and reads as held out
     in front, while the SMG is 37 cm and at the same offset its receiver
     fills a third of the screen. Longer guns go further right, further
     down and slightly further out, which is what a rifle carried at the
     hip actually does. */
  const len = Math.max(0.2, v.muzzle || 0.3);
  const bulk = Math.min(1, Math.max(0, (len - 0.24) / 0.34));
  /* Hip carry.

     This has been argued with itself twice. At -100 mm the sight line of
     a rifle came out 50 mm below the eye and the gun read as carried at
     the chin, so it went down to -186 for a rifle -- and at -186, with
     half the frame at the weapon's distance being 213, the receiver sat
     87% of the way to the bottom corner. A screenshot of a Thompson
     reload shows the whole receiver off the bottom right and two forearms
     where the gun should be.

     Both attempts were solving the wrong variable. A carried weapon is
     not level with the eye and lower down: it is level with the ribs and
     POINTED DOWN. Move the origin back up to where you can see it, and
     tip the muzzle instead -- the gun then reads as slung at the hip
     because the barrel goes down and away, which is what a hip carry
     actually looks like, and the receiver, the ejection port, the bolt
     and the magazine well are all on screen where the animation is.

     A rifle now sits 67% of the way down instead of 87, and its muzzle,
     seven degrees below the axis over half a metre of barrel, still comes
     out well under the horizon.

     The per-length terms are much smaller than they were, too. Pushing a
     long gun further right and lower than a pistol is right in principle
     -- a rifle carried at the hip does sit further outboard -- but at 46
     and 36 mm on top of a 30% longer hold, a Thompson's receiver was
     against the right edge of the frame with only the barrel in shot. */
  const hipX = (po ? po.x : 0.092 + bulk * 0.020) - drawIn + bobX * (bench ? 0 : 1),
        hipY = (po ? po.y : -0.106 - bulk * 0.022) + (bench ? 0 : bobY - dip),
        hipD = po ? po.d : 0.355 + bulk * 0.055;
  const adsX = 0, adsY = -spec.sightH, adsD = 0.30;
  const a = P.ads;
  /* Hold the whole viewmodel further out.
   *
   * A screenshot of the Mauser aimed is two life-size hands filling the
   * middle of the screen with the gun somewhere behind them -- which is
   * what "every time I aim down sights with the Mauser I'm getting
   * flashing white" is: a pale skin-coloured mass across the view, not a
   * light. The hands are not too big; they are correct, and 300 mm from
   * the eye a correct hand is enormous. This is the whole reason real
   * engines draw the viewmodel at its own narrow field of view.
   *
   * With one shared camera the same effect comes from holding the model
   * further away, so it subtends less. The lateral offsets go out with
   * the distance so the framing is unchanged -- the gun sits in the same
   * part of the picture, it is simply smaller and no longer pressed
   * against the eye.
   *
   * The aimed VERTICAL offset is deliberately NOT scaled. It is -sightH
   * exactly, because that is what puts the front blade and the rear notch
   * on the camera axis, and it is -sightH at any distance. Scaling it
   * would take every measured sight line in this file off axis at once. */
  const OUT = 1.30;
  const offR = hipX * OUT * (1 - a) + adsX * a;
  const offU = hipY * OUT * (1 - a) + adsY * a;
  const dist = (hipD * (1 - a) + adsD * a) * OUT;

  // Sprinting: gun canted down and inboard, out of the sight line.
  const sp = P.sprint * (1 - a);
  const sprintDrop = sp * 0.10, sprintIn = sp * 0.05;

  const px = cam.position.x + f.x * dist + right.x * (offR - sprintIn) + up.x * (offU - sprintDrop);
  const py = cam.position.y + f.y * dist + right.y * (offR - sprintIn) + up.y * (offU - sprintDrop);
  const pz = cam.position.z + f.z * dist + right.z * (offR - sprintIn) + up.z * (offU - sprintDrop);
  /* The gun driven back along its own bore. This is the part that was
     missing entirely -- a weapon that rises but never moves reads as a
     picture being rotated, not as something with mass being shoved into
     your hand. It comes toward the eye, so it also gets momentarily
     bigger, which is most of the punch. */
  const kb = P.kickBack || 0;
  root.setPosition([px - f.x * kb, py - f.y * kb, pz - f.z * kb]);

  const fh = Math.hypot(f.x, f.z) || 1e-6;
  const yaw = Math.atan2(-f.z / fh, f.x / fh);
  /* Muzzle down at the hip, level at the sights.

     Seven degrees, blended out entirely with the aim so the sight picture
     is untouched -- the whole point of every measured sightH in this file
     is that aiming is geometry and not taste, and a cant that survived
     into ADS would break all of it. A little more while sprinting, on top
     of the cant the sprint already has. */
  /* ...and levelled again during a reload, on top of the lift. The gun
     comes up to where the hands are working precisely so the breech, the
     well and the port face the camera; leaving seven degrees of muzzle
     droop in tips all three of them away again. */
  const hipTip = bench ? 0 : (1 - a) * (0.122 + sp * 0.10) * (1 - rl * 0.85);
  const pitch = Math.asin(Math.max(-1, Math.min(1, f.y))) + P.kickPitch * 0.06 - hipTip;
  /* Roll the weapon inboard while sprinting, and again while reloading so
     the breech, the magazine well or the open cylinder turns to face the
     camera. A gun reloaded side-on hides the one thing worth watching. */
  const roll = sp * 0.42 + (1 - a) * 0.03 + rollIn * 0.0175 + (P.kickRoll || 0);
  /* Composed from explicit axis-angles rather than Euler triples. setEuler
     takes (pitch, yaw, roll) in YXZ, which is easy to feed in the wrong
     order and gives a weapon that rolls when it should pitch — and the
     mistake stays invisible until the player looks up. */
  _vQuat1.setAxisAngle(_vAxisY, yaw);
  _vQuat2.setAxisAngle(_vAxisZ, pitch);
  _vQuat1.mulQuats(_vQuat1, _vQuat2);
  if (roll > 1e-4) {
    _vQuat2.setAxisAngle(_vAxisX, roll);
    _vQuat1.mulQuats(_vQuat1, _vQuat2);
  }
  if (bench) {
    // Turn it on the spot, and tip it slightly so it is not a flat side-on.
    _vQuat2.setAxisAngle(_vAxisY, bench.spin || 0);
    _vQuat1.mulQuats(_vQuat1, _vQuat2);
    _vQuat2.setAxisAngle(_vAxisX, 0.30);
    _vQuat1.mulQuats(_vQuat1, _vQuat2);
  }
  root.setRotation(_vQuat1);

  P.muzzleWorld = [px + f.x * v.muzzle, py + f.y * v.muzzle + 0.03 * (1 - a), pz + f.z * v.muzzle];

  /* Hammer swing. Two strikes a plank: wind up over the shoulder, drive
     down, recover — driven off the same clock that places the plank, so
     the nail sound lands on the blow rather than near it. */
  if (P.equipped() === 'hammer') {
    const period = 0.5;                         // two swings per second
    const ph = ((P.buildT || 0) % period) / period;
    // Fast down-stroke, slower recovery: ease the two halves differently.
    const swing = ph < 0.35
      ? -0.55 + Math.pow(ph / 0.35, 2) * 1.55
      : 1.0 - (ph - 0.35) / 0.65 * 1.55;
    _vQuat2.setAxisAngle(_vAxisZ, swing);
    _vQuat1.mulQuats(_vQuat1, _vQuat2);
    root.setRotation(_vQuat1);
    const lunge = Math.max(0, swing) * 0.05;
    root.setPosition([px + f.x * lunge, py + f.y * lunge - lunge * 0.25, pz + f.z * lunge]);
  }

  /* Melee swings. Each weapon gets its own arc off one clock that counts
     down from the moment of the strike, so the animation and the hit are
     the same event rather than two things that happen near each other.

       ram     hauled back past the shoulder, then driven straight forward
               along the look vector — it is a thrust, not a swing
       shield  turned edge-on and shoved, a short flat push
       knife   a diagonal slash across the body */
  const swingSpec = MELEE_SWING[P.equipped()];
  if (swingSpec && P.swingT > 0) {
    const u = 1 - P.swingT / swingSpec.time;          // 0 at the strike, 1 done
    // Hard out, slow back.
    const drive = u < swingSpec.out
      ? Math.pow(u / swingSpec.out, 0.6)
      : 1 - (u - swingSpec.out) / (1 - swingSpec.out);
    if (swingSpec.thrust) {
      const reach = drive * swingSpec.reach;
      root.setPosition([px + f.x * reach, py + f.y * reach - 0.02 * (1 - drive), pz + f.z * reach]);
      _vQuat2.setAxisAngle(_vAxisZ, -0.30 * (1 - drive));
      _vQuat1.mulQuats(_vQuat1, _vQuat2);
      root.setRotation(_vQuat1);
    } else {
      _vQuat2.setAxisAngle(_vAxisZ, swingSpec.arc * (drive - 0.35));
      _vQuat1.mulQuats(_vQuat1, _vQuat2);
      if (swingSpec.yaw) {
        _vQuat2.setAxisAngle(_vAxisY, swingSpec.yaw * (0.5 - drive));
        _vQuat1.mulQuats(_vQuat1, _vQuat2);
      }
      root.setRotation(_vQuat1);
      const lunge = drive * swingSpec.reach;
      root.setPosition([px + f.x * lunge, py + f.y * lunge, pz + f.z * lunge]);
    }
  } else if (spec.blocks && P.blocking) {
    /* Raised: the face comes across the view and turns square to the front,
       which is both the read and the hitbox. */
    const b = P.blockT;
    _vQuat2.setAxisAngle(_vAxisY, -0.55 * b);
    _vQuat1.mulQuats(_vQuat1, _vQuat2);
    root.setRotation(_vQuat1);
    root.setPosition([px + f.x * 0.10 * b, py + 0.055 * b, pz + f.z * 0.10 * b]);
  }

  /* Break-action reload: the top lever goes over, the whole front end
     drops on the hinge pin, the empties come out over your shoulder, two
     fresh ones go in and it snaps shut. Open fast, hang while it is fed,
     shut fast — a single linear sweep across the whole reload reads as the
     gun sagging rather than as a person working it. */
  if (spec.reloadKind === 'break' && v.swing) {
    let open = 0;
    if (P.reloading > 0) {
      const u = 1 - P.reloading / spec.reload;
      open = u < 0.17 ? u / 0.17 : (u < 0.70 ? 1 : Math.max(0, 1 - (u - 0.70) / 0.20));
      /* A stage counter that only ever goes up.

         This used to be a boolean: set at u > 0.06, cleared again at
         u > 0.62 — and cleared meant the first test passed again on the very
         next frame, so from there to the end of the reload it threw two
         empties and played the break sound EVERY FRAME. About fifty-five
         frames of a scattergun reload, which is a hundred and ten cases on
         the floor and fifty-five overlapping clacks. That is the shower of
         shells and most of the noise. */
      if (P.breakStage < 1 && u > 0.06) {
        P.breakStage = 1; sfx.breakOpen();
        ejectShell(game, S, P, v); ejectShell(game, S, P, v);
      }
      if (P.breakStage < 2 && u > 0.62) { P.breakStage = 2; sfx.shellIn(); }
      if (P.breakStage < 3 && u > 0.88) { P.breakStage = 3; sfx.breakShut(); }
    } else if (P.breakStage) { P.breakStage = 0; }
    const hx = v.hinge[0], hy = v.hinge[1];
    const ang = -0.62 * open;                 // radians; muzzle drops
    const c = Math.cos(ang), sn = Math.sin(ang);
    for (const e of v.swing) {
      const dx = e.p[0] - hx, dy = e.p[1] - hy;
      e.a.setPosition([hx + dx * c - dy * sn, hy + dx * sn + dy * c, e.p[2]]);
      e.a.setRotation([e.r[0], e.r[1], e.r[2] + ang * 57.2958]);
    }
  }

  /* Box magazine on a group model. The single-actor path below drives
     v.actor.mag; a group hangs its magazine off several parts (a curved
     thirty-rounder is four boxes), so they move together. */
  const magParts = spec.reloadKind === 'mag' ? activeMag(v) : null;
  if (magParts && magParts.length) {
    const out = P.reloading > 0 && P.reloadStage >= 1 && P.reloadStage < 2;
    for (const m of magParts) m.visible = !out;
    if (v.bolt && v.boltThrow) {
      // Cocking handle: thrown back and released on the last beat. The
      // throw is the model's own, along the axis its tube actually runs.
      const t = P.reloading > 0 && P.reloadStage >= 2
        ? Math.sin(Math.min(1, Math.max(0, 1 - P.reloading / spec.reload - 0.70) / 0.18) * Math.PI) : 0;
      const R = v.boltRest, T = v.boltThrow;
      v.bolt.setPosition([R[0] + T[0] * t, R[1] + T[1] * t, R[2] + T[2] * t]);
    }
  }

  /* Stripper clip. Bolt back, clip pressed down into the open action, clip
     flicked away, bolt home. The clip is hidden until it is wanted, which
     is why it exists as its own part rather than as a moment of hand
     animation nobody can see. */
  if (spec.reloadKind === 'clip' && v.clip && v.bolt) {
    const R = v.boltRest, T = v.boltThrow || [-0.038, 0, 0];
    if (P.reloading > 0) {
      const u = 1 - P.reloading / spec.reload;
      const back = u < 0.22 ? u / 0.22 : (u < 0.80 ? 1 : 1 - (u - 0.80) / 0.20);
      v.bolt.setPosition([R[0] + T[0] * back, R[1] + T[1] * back, R[2] + T[2] * back]);
      /* Where the clip IS is not decided here any more.
       *
       * There were two stripper clips: this one, which appeared at the
       * guide and was pressed down by nothing, and a second one built as
       * a carried prop that the hand brought up and dropped at 30%. So
       * the player saw a clip fly up, vanish, and a different clip push
       * itself into the rifle with no hand near it -- the invisible
       * reload again, in the half of it I had not looked at. The carried
       * prop IS this actor now (see reloadProp), it travels the whole way
       * on one path, and the support hand is placed from it every frame.
       *
       * A stage counter, and the fourth place this was a boolean. Set at
       * 30% and cleared at 76% means the opening test passes again on the
       * very next frame, so the clip seats once a frame for the last
       * quarter of the reload. The reload test in engine/test/map.test.js
       * is what found these two; the other two were found in play. */
      if (P.clipStage < 1 && u > 0.42) { P.clipStage = 1; sfx.clipIn(); }
      if (P.clipStage < 2 && u > 0.82) { P.clipStage = 2; sfx.boltHome(); }
    } else {
      v.bolt.setPosition(R);
      v.clip.visible = false;
      if (v.clipRest) v.clip.setPosition(v.clipRest);
      v.clip.setRotation([0, 0, 0]);
      P.clipStage = 0;
    }
  }

  /* The MG 42, reloaded the way an MG 42 is reloaded.

     "He needs to do how you would reload the real thing... clip in the
      magazine, and then put the actual belt feeding in, just like how you
      would reload the real thing, do the exact animation and cycle."

     There is no magazine on this gun and there never was; what was there
     was a magazine-shaped animation borrowed from the Arc Breaker's
     battery, which is why it read as wrong even when it looked good. The
     real cycle, in order, and the whole of it is on screen:

       0.00 - 0.16  cock. The handle is dragged the length of its slot and
                    let go; the bolt is held open, which it must be before
                    the cover can take a belt.
       0.14 - 0.30  the top cover comes up on its hinge, 104 degrees, up
                    and over towards the muzzle.
       0.26 - 0.40  the spent belt is thrown clear off the right lip.
       0.34 - 0.68  a new belt is carried up in the left hand and LAID IN
                    the tray, leading round against the cartridge stop.
       0.68 - 0.82  the cover is slammed shut on it.
       0.82 - 1.00  the handle is worked once more and the gun settles.

     Each beat has a sound on a stage counter rather than a boolean, for
     the reason every other stage counter in this file exists. */
  if (spec.reloadKind === 'belt' && v.cover) {
    if (P.reloading > 0) {
      const u = 1 - P.reloading / spec.reload;
      const seg = (a, b) => Math.max(0, Math.min(1, (u - a) / (b - a)));
      const ease = (t) => t * t * (3 - 2 * t);
      // Cocking handle: back hard, forward under spring. Twice.
      const cock1 = seg(0.00, 0.09) * (1 - seg(0.09, 0.15));
      const cock2 = seg(0.82, 0.89) * (1 - seg(0.89, 0.95));
      const ct = Math.max(cock1, cock2);
      if (v.bolt && v.boltThrow) {
        const R = v.boltRest || [0, 0, 0], T = v.boltThrow;
        v.bolt.setPosition([R[0] + T[0] * ct, R[1] + T[1] * ct, R[2] + T[2] * ct]);
      }
      /* The lid. Open is a full swing; shut is faster than open, because a
         top cover is lifted and then dropped. */
      const open = ease(seg(0.14, 0.30)) * (1 - Math.pow(seg(0.68, 0.80), 0.7));
      v.cover.setRotation([0, 0, (v.coverOpen || 96) * open]);
      /* The old belt leaves. It swings off the lip and falls away rather
         than blinking out -- you can watch it go.
         
         Whichever belt is actually fitted: with a longer belt bought at
         the bench it is that one that has to move, not the stock belt
         hidden underneath it. */
      const beltNow = (v.magSwap && v.magSwap.length) ? v.magSwap : (v.belt ? [v.belt] : []);
      for (const bp of beltNow) {
        const goneT = ease(seg(0.26, 0.42));
        const backT = ease(seg(0.60, 0.72));
        const D = v.beltDrop || [-0.03, -0.42, 0.10];
        const k = goneT * (1 - backT);
        const R0 = bp.__beltRest || (bp.__beltRest = [bp.position.x, bp.position.y, bp.position.z]);
        bp.setPosition([R0[0] + D[0] * k, R0[1] + D[1] * k, R0[2] + D[2] * k]);
        bp.setRotation([0, 0, -46 * k]);
        // Hidden only in the gap between the old one leaving and the new
        // one being in the tray, so the feed is never simply empty-looking
        // for half the reload.
        bp.visible = !(u > 0.44 && u < 0.66);
      }
      if (P.beltStage < 1 && u > 0.04) { P.beltStage = 1; sfx.boltHome(); }
      if (P.beltStage < 2 && u > 0.16) { P.beltStage = 2; sfx.coverUp(); }
      if (P.beltStage < 3 && u > 0.62) { P.beltStage = 3; sfx.beltIn(); }
      if (P.beltStage < 4 && u > 0.74) { P.beltStage = 4; sfx.coverDown(); }
      if (P.beltStage < 5 && u > 0.86) { P.beltStage = 5; sfx.boltHome(); }
    } else {
      v.cover.setRotation([0, 0, 0]);
      const beltNow = (v.magSwap && v.magSwap.length) ? v.magSwap : (v.belt ? [v.belt] : []);
      for (const bp of beltNow) {
        if (bp.__beltRest) bp.setPosition(bp.__beltRest);
        bp.setRotation([0, 0, 0]);
        bp.visible = true;
      }
      if (v.bolt) v.bolt.setPosition(v.boltRest || [0, 0, 0]);
      P.beltStage = 0;
    }
  }

  /* Battery cell. Drops clear of the housing, a fresh one seats, and the
     coils come back up as it takes charge. */
  if (spec.reloadKind === 'cell' && v.cell) {
    const CP = v.cellParts || [v.cell], R = v.cellRest || [0, 0, 0], D = v.cellDrop || [0, -0.15, 0];
    if (P.reloading > 0) {
      const u = 1 - P.reloading / spec.reload;
      const outAmt = u < 0.26 ? u / 0.26 : (u < 0.62 ? 1 : Math.max(0, 1 - (u - 0.62) / 0.24));
      for (const c of CP) {
        c.setPosition([R[0] + D[0] * outAmt, R[1] + D[1] * outAmt, R[2] + D[2] * outAmt]);
        c.setRotation([0, 0, -22 * outAmt]);
      }
      if (P.cellStage < 1 && u > 0.10) { P.cellStage = 1; sfx.cellOut(); }
      if (P.cellStage < 2 && u > 0.66) { P.cellStage = 2; sfx.cellIn(); }
      if (u > 0.86 && Math.random() < 0.4) {
        game.particles.sparks(P.muzzleWorld || [0, 0, 0], { count: 3, speed: 2.2, color: 0x7fd8ff, colorEnd: 0x1a3a4a });
      }
    } else {
      for (const c of CP) { c.setPosition(R); c.setRotation([0, 0, 0]); }
      P.cellStage = 0;
    }
  }

  /* The support hand doing the loading.

     Everything below this point used to happen by itself: the magazine
     vanished, a magazine appeared, and the arms sat on the gun throughout.
     Now the support arm leaves the forend, drops out of frame, comes back
     up with something in it, and puts it in — and the something is a real
     actor you can watch travel.

     The path is described in the weapon's own space, so it works on a
     pistol and on a belt-fed machine gun without a table of offsets: down
     and outboard to fetch, then up to the magazine well, then away. */
  if (v.arms && v.arms.support && v.arms.support.length) {
    const kind = spec.reloadKind;
    /* The revolver joins the list. Its cylinder swung out and four
       rounds appeared in it by themselves -- the one reload in the game
       still being done by an invisible hand. */
    const carries = kind === 'mag' || kind === 'clip' || kind === 'cell'
      || kind === 'break' || kind === 'revolver' || kind === 'belt';
    let ox = 0, oy = 0, oz = 0, propT = -1;
    if (P.reloading > 0 && carries) {
      const u = 1 - P.reloading / spec.reload;
      /* Four beats: away from the gun, out of shot, back with the load,
         and home. Smoothed, because a hand that moves linearly between
         poses reads as a lift rather than as an arm. */
      const ease = (t) => t * t * (3 - 2 * t);
      const seg = (a, b) => Math.max(0, Math.min(1, (u - a) / (b - a)));
      const away = ease(seg(0.05, 0.30));
      const back = ease(seg(0.42, 0.74));
      const settle = ease(seg(0.74, 0.94));
      /* Reach: down and to the SUPPORT SIDE, not down and out of the
         picture.

         It used to drop 150 mm. The weapon is carried 186 mm below the
         camera axis and lifted 98 during a reload, and half the frame at
         the weapon's distance is 185 mm -- so a hand 150 mm below the gun
         was 88 mm below the bottom edge of the screen, and everything it
         was carrying went with it. The player watched an empty room and
         a gun that reloaded itself, which is exactly what he reported.

         The room is sideways. There is 13 cm of frame to the right of the
         gun and 45 to the left, so the fetch goes to the support side --
         camera-left, the weapon's -Z -- and only dips far enough to read
         as reaching. Every millimetre of that is on screen. */
      const reach = away * (1 - back);
      ox = -0.030 * reach;
      oy = -0.052 * reach - 0.026 * back * (1 - settle);
      oz = -0.135 * reach;
      // The load is in the hand between fetching it and seating it. The
      // window is set per kind below, against the beat the gun's own part
      // changes on -- see RELOAD_WINDOW.
      const win = RELOAD_WINDOW[kind] || RELOAD_WINDOW.mag;
      if (u > win[0] && u < win[1]) propT = (u - win[0]) / (win[1] - win[0]);
    }
    /* Where the support hand goes. If it is carrying something, it is put
       where that thing is a few lines below instead -- the hand and the
       load have to be one movement, and running them on two paths that
       merely pass near each other is why the magazine looked like it was
       flying alongside the hand rather than being held by it. */
    let handSet = false;

    /* The thing being carried. One prop per weapon, built the first time it
       is needed and then hidden — a magazine for a box gun, a stripper clip
       for the bolt guns, a cell for the Arc, a pair of shells for a break
       gun. It rides the same path as the hand, a few centimetres in front
       of where the fingers close. */
    if (propT >= 0) {
      const prop = reloadProp(game, P, v, spec, kind);
      if (prop) {
        /* Where the load is going, and how it gets there.

           Everything used to travel the same path to the same place: up
           from below-outboard to the magazine well, whatever it was. A
           stripper clip does not go into a magazine well, it goes into the
           guide on TOP of the receiver and the rounds are pressed down out
           of it. Shotgun shells go into the chamber mouths, nose first,
           and stay there. A speedloader goes onto the face of an open
           cylinder and is twisted off. Sending all of them to the same
           point is the invisible reload with a prop attached to it. */
        let u2 = Math.min(1, Math.max(0, propT));
        let e = u2 * u2 * (3 - 2 * u2);
        // Which actor actually travels. For most weapons it is the whole
        // prop; the revolver moves one cartridge at a time out of four.
        let propRoot = prop.root;
        const bore = (v.root && v.root.boreAt) || 0.06;
        const muzzle = (v.root && v.root.muzzleAt) || 0.3;
        let to = v.magWell || (v.root && v.root.magWell) || [M_WELL_X(v), -0.055, 0];
        let from = FETCH(to);
        let rot = [0, 0, 0], rot0 = [0, 0, 0];
        let show = true;

        if (kind === 'break') {
          /* Into the chamber mouths of the broken-open barrels: the pair
             comes up from below the breech, noses forward, and slides in.
             Once they are home the shells stay -- the gun's own barrels
             carry them from there. */
          const bx = (v.root && v.root.breechAt) || 0.030;
          to = [bx + 0.004, bore - 0.0002, -0.0122];
          from = FETCH(to, -0.055);
          rot = [0, 0, 0]; rot0 = [0, -34, -22];
          show = u2 < 0.995;
        } else if (kind === 'revolver') {
          /* Four rounds, one chamber at a time.
           *
           * The hand makes the same short trip four times over the length
           * of the reload: down to the pocket, up to the cylinder face,
           * press, back down. Each round stops in the chamber it was put in
           * and stays there -- they are the gun's rounds now -- so by the
           * end of the reload there are four cartridges sitting in the
           * cylinder rather than a speedloader that has vanished.
           *
           * The prop path below carries the one currently in the fingers;
           * the ones already seated are placed and left alone. */
          const cr = v.crane || [0.09, bore, -0.015];
          const N = Math.max(1, spec.mag || 4);
          const seat = (i) => {
            // Round the cylinder face, in the order a thumb would use them.
            const th = (i / N) * Math.PI * 2 + 0.4;
            const pcd = 0.0148;
            return [cr[0] - 0.030, bore + Math.sin(th) * pcd, cr[2] - 0.045 + Math.cos(th) * pcd];
          };
          const each = 1 / N;
          const which = Math.min(N - 1, Math.floor(u2 / each));
          const sub = (u2 - which * each) / each;      // 0..1 within this one
          if (prop.rounds) {
            for (let i = 0; i < N; i++) {
              const grp = prop.rounds.filter((q, k) => Math.floor(k / (prop.rounds.length / N)) === i);
              const done2 = i < which;
              const now2 = i === which;
              for (const q of grp) {
                q.visible = done2 || (now2 && sub > 0.12);
                /* Nose forward, down the chamber.
                 *
                 * These were turned ninety degrees about Z, which takes a
                 * cartridge from pointing at the muzzle to standing
                 * vertically -- so every round already loaded was stood on
                 * end in the cylinder like a row of little chimneys. A
                 * cartridge model runs along +X by construction, and +X is
                 * where the barrel is, so the seated rotation is zero. */
                if (done2) { q.setPosition(seat(i)); q.setRotation([0, 0, 0]); }
              }
            }
          }
          const sTo = seat(which);
          to = sTo;
          from = FETCH(sTo);
          // Home is nose-down-the-chamber; it arrives tipped and straightens.
          rot = [0, 0, 0]; rot0 = [0, -28, 34];
          // Only the one being loaded rides the path.
          propRoot = prop.rounds ? prop.rounds[Math.floor(which * (prop.rounds.length / N))] : prop.root;
          propT = sub;
          show = true;
        } else if (kind === 'clip') {
          /* The whole of it on one path: up out of the pouch, into the
             stripper guide on top of the open action, PRESSED DOWN so the
             rounds strip off it into the magazine, then flicked clear.
             Three legs rather than one, because a clip that arrives and
             stops is a clip nobody loaded. The hand is placed from
             wherever this ends up, so it is on the clip for all three --
             the press included, which is the leg that used to happen by
             itself. */
          const seat = v.clipRest || [0.012, bore + 0.030, 0];
          const fetch = FETCH(seat, -0.075, -0.150);
          const leg = (a2, b2) => Math.max(0, Math.min(1, (u2 - a2) / (b2 - a2)));
          const eIn = leg(0, 0.42), ePress = leg(0.42, 0.76), eOut = leg(0.80, 1);
          const sIn = eIn * eIn * (3 - 2 * eIn);
          const sPr = ePress * ePress * (3 - 2 * ePress);
          const cx = fetch[0] + (seat[0] - fetch[0]) * sIn;
          const cy2 = fetch[1] + (seat[1] - fetch[1]) * sIn - 0.042 * sPr;
          const cz = fetch[2] + (seat[2] - fetch[2]) * sIn;
          // Thrown off to the support side as it leaves.
          to = [cx - 0.010 * eOut, cy2 + 0.055 * eOut, cz - 0.090 * eOut];
          from = to;
          const tilt = 1 - sIn;
          rot = [22 * tilt, -30 * tilt, 16 * tilt + 40 * eOut];
          rot0 = rot;
          show = eOut < 0.92;
        } else if (kind === 'belt') {
          /* Into the feed tray, from the left, laid flat.

             The belt is carried by its leading link and goes in across the
             gun -- so it arrives level with the tray and slightly outboard
             of it, and the last of the travel is sideways rather than up.
             That is the difference between laying a belt in and posting a
             magazine. */
          const trayY = ((v.root && v.root.sightAt) || 0.09) - 0.030;
          to = [0.096, trayY, -0.020];
          from = [to[0] - 0.020, to[1] - 0.070, to[2] - 0.165];
          rot = [0, 0, 0]; rot0 = [0, -34, -30];
          show = u2 < 0.96;
        } else if (kind === 'cell') {
          /* Into the housing the cell actually lives in. This went to the
             magazine well -- which the Arc Breaker does not have, so it
             fell through to a guess and the cell was posted into the air
             below the accelerator tube. The weapon reports where its cell
             rests; use that. */
          const cr = v.cellRest || [to[0], to[1] + 0.004, to[2]];
          to = [cr[0], cr[1], cr[2]];
          from = FETCH(to, -0.058);
          rot = [0, 0, 0]; rot0 = [0, -24, -18];
        } else {
          /* A magazine goes up the well nose-first, tipped a little as
             the hand brings it round, straightening as it seats.
             
             And what is fitted changes how it is done, because the object
             in the hand is a different weight and shape. A drum is heavy
             and wide: it comes in from further out, low, and is rocked in
             back-first the way a drum has to be. An extended magazine is
             long enough that it has to be brought up steeper or its nose
             catches the well. A fast magazine has a loop on it and is
             snapped in from a shorter reach, which is what it is for. */
          const fitted = (P.fitted[P.equipped()] || {}).mag;
          if (fitted === 'drummag') {
            from = FETCH(to, -0.062, -0.185);
            rot0 = [0, -34, -40];
            rot = [0, 0, -6];
          } else if (fitted === 'extmag') {
            from = FETCH(to, -0.078, -0.120);
            rot0 = [0, -8, -26];
          } else if (fitted === 'fastmag') {
            from = FETCH(to, -0.040, -0.105);
            rot0 = [0, -14, -12];
          } else {
            rot0 = [0, -12, -16];
          }
        }
        void muzzle;
        // Recompute, since a per-round path above resets how far along it is.
        u2 = Math.min(1, Math.max(0, propT));
        e = u2 * u2 * (3 - 2 * u2);
        if (kind !== 'revolver') for (const q of prop.parts) q.visible = show;
        const px = to[0] + (from[0] - to[0]) * (1 - e);
        const py = to[1] + (from[1] - to[1]) * (1 - e);
        const pz = to[2] + (from[2] - to[2]) * (1 - e);
        propRoot.setPosition([px, py, pz]);
        propRoot.setRotation([
          rot[0] + (rot0[0] - rot[0]) * (1 - e),
          rot[1] + (rot0[1] - rot[1]) * (1 - e),
          rot[2] + (rot0[2] - rot[2]) * (1 - e),
        ]);
        /* And the hand goes to it.
         *
         * The hand and the load were on two separate paths that happened to
         * run near each other, so the magazine travelled beside the hand
         * rather than in it -- which is what "he doesn't even hold a
         * magazine" looks like. The hand is placed FROM the load's position
         * now, offset by where the fingers close on it, so the two cannot
         * drift apart however either path is changed.
         *
         * The offset is where a hand grips each kind: a magazine is held
         * near its base, a clip by its spine, a pair of shells at their
         * heads, a cell by its body. */
        const hold = kind === 'break' ? [-0.030, -0.008, -0.010]
          : kind === 'clip' ? [-0.004, 0.050, -0.008]
            : kind === 'revolver' ? [-0.010, -0.030, -0.012]
              : kind === 'belt' ? [-0.010, -0.014, -0.030]
                : [0.000, -0.052, -0.006];
        /* Where the support hand sits when it is on the weapon. Taken from
           the built hand rather than from the weapon table, because the
           builder drops it for a forend and then seats it against the
           surface -- so the authored number is not where the hand is. */
        const dl = v.arms.digits && v.arms.digits.left;
        const home = (dl && dl.at) || (WEAPONS[P.equipped()].hands.left) || [0, 0, 0];
        for (const q of v.arms.support) {
          q.setPosition([px + hold[0] - home[0], py + hold[1] - home[1], pz + hold[2] - home[2]]);
        }
        handSet = true;
      }
    } else if (v.prop) {
      for (const q of v.prop.parts) q.visible = false;
    }
    if (!handSet) for (const q of v.arms.support) q.setPosition([ox, oy, oz]);
  }

  /* Revolver reload: the cylinder swings out on its crane, hangs there
     while it is fed, and snaps back. Three beats over the reload time
     rather than one continuous move, because that is how the hands work —
     out, load, shut. */
  if (spec.revolver && v.cylinder && v.crane) {
    /* The cylinder swings out about the crane pin — a vertical axis
       forward of it and to the left — and nothing else. Sliding it
       sideways and calling that a swing is the usual shortcut, and it
       reads as the cylinder falling off the gun. */
    if (P.reloading > 0) {
      const u = 1 - P.reloading / spec.reload;      // 0 at the start, 1 done
      const outAmt = u < 0.20 ? u / 0.20 : (u < 0.78 ? 1 : 1 - (u - 0.78) / 0.22);
      const ang = -1.08 * outAmt;                   // radians, out to the left
      const c = Math.cos(ang), sn = Math.sin(ang);
      // Rotate the cylinder's own origin about the pin, then turn it to match.
      const px = v.crane[0], pz = v.crane[2];
      const dx = -px, dz = -pz;
      v.cylinder.setPosition([px + dx * c + dz * sn, 0, pz - dx * sn + dz * c]);
      v.cylinder.setRotation([0, ang * 57.2958, 0]);
      /* A stage counter, for the same reason the break gun has one: a
         boolean set at 5% and cleared at 86% passes its own opening test
         again on the very next frame, and plays the cylinder swinging out
         once per frame for the rest of the reload. */
      if (P.cylStage < 1 && u > 0.05) { P.cylStage = 1; sfx.cylinderOut(); }
      if (P.cylStage < 2 && u > 0.50) { P.cylStage = 2; sfx.shellIn(); }
      if (P.cylStage < 3 && u > 0.86) { P.cylStage = 3; sfx.cylinderIn(); }
    } else {
      v.cylinder.setPosition([0, 0, 0]);
      v.cylinder.setRotation([0, 0, 0]);
      P.cylStage = 0;
    }
  }

  /* Thumb-cocking, which is the whole ceremony of a single action: the
     hammer falls with the shot, then the thumb comes off the grip, reaches
     up over the strap, drags the spur back to full cock and drops away
     again. The player fires no faster than the thumb works.

     The hammer turns about its pin and the thumb about its base joint, both
     with the same rotate-about-a-point arithmetic the cylinder's crane
     uses -- an actor turns about its own origin, and neither of these has
     its origin where its joint is. */
  if (v.hammer && v.hammerPin) {
    const pin = v.hammerPin, pv = v.arms && v.arms.thumbPivot;
    // Eased, and lagging the thumb slightly: the spur moves because the
    // thumb is on it, so the thumb leads and the hammer follows.
    const u = Math.min(1, Math.max(0, P.cockT));
    const reach = Math.sin(Math.min(1, u * 1.35) * Math.PI * 0.5);        // thumb up and back
    const drag = u < 0.18 ? 0 : Math.min(1, (u - 0.18) / 0.82);      // hammer follows
    const pull = drag * drag * (3 - 2 * drag);
    const ang = (v.hammerCock || 0.52) * pull;
    const c = Math.cos(ang), sn = Math.sin(ang);
    // Rotating about the pin: move the actor's origin the way the pin
    // would carry it, then turn it by the same angle.
    const dx = -pin[0], dy = -pin[1];
    v.hammer.setPosition([pin[0] + dx * c - dy * sn, pin[1] + dx * sn + dy * c, 0]);
    v.hammer.setRotation([0, 0, ang * 57.2958]);
    if (v.arms && v.arms.thumb && pv) {
      /* The thumb lifts, swings back over the strap and returns. It is one
         rotation about its base joint, out and back, so the tip travels
         the arc a thumb travels and the web never leaves the grip. */
      /* Positive: a positive turn about +Z takes the thumb from pointing
         forward to pointing up, which is the way it has to go to reach a
         hammer spur above it. Negative laid it flat along the frame --
         the direction a thumb goes to get OFF the hammer. */
      const lift = 1.02 * reach * (1 - u * 0.28);
      const cl = Math.cos(lift), sl = Math.sin(lift);
      const tx = -pv[0], ty = -pv[1];
      v.arms.thumb.setPosition([pv[0] + tx * cl - ty * sl, pv[1] + tx * sl + ty * cl, 0]);
      v.arms.thumb.setRotation([0, 0, lift * 57.2958]);
    }
    if (P.cockT < 1) {
      P.cockT = Math.min(1, P.cockT + dt / (P.cockMax || 0.30));
      if (P.cockStage < 1 && P.cockT > 0.86) { P.cockStage = 1; sfx.hammerCock(); }
    }
    if (P.cockT >= 1) P.cockStage = 1;
  }

  /* The trigger finger, which had never moved.
   *
   * "The fingers need to move and all that -- on the Model 5 I need them
   *  to pull the trigger."
   *
   * It was welded into the hand mesh, so it could not. It is its own mesh
   * now, like the thumb, and it turns about its own base knuckle: back and
   * in as the trigger breaks, forward again as it resets. One rotation, on
   * the same clock as the shot, so the finger and the bang are the same
   * event rather than two things that happen near each other.
   *
   * Held on an automatic weapon -- a finger that flutters at twelve
   * hundred rounds a minute is a vibration, not a trigger pull -- and one
   * clean cycle per shot on everything else. */
  /* ---------------- the hands, which now have fingers that move ---------

     Every digit is its own mesh with its own knuckle, so this can turn
     them. Zero is the pose the grip solve built and every contact test
     measures -- the hand closed on the weapon -- and a positive angle
     closes further, because `turn` in the viewmodel rotates the pointing
     direction toward the closing one. So opening is negative, and the
     resting hand costs nothing: no rotation at all.

     This is the fix for "the fingers don't do anything, they're just
     static figures so it jumbles up animations". They were one welded
     casting; the support hand could be slid to the magazine well but not
     opened, so it arrived as a closed fist and the magazine appeared
     inside it. */
  const turnDigit = (act, piv, axis, ang) => {
    if (!act || !piv) return;
    const q = new LegendEngine.Quat().setAxisAngle(
      new LegendEngine.Vec3(axis ? axis[0] : 0, axis ? axis[1] : 0, axis ? axis[2] : 1), ang);
    act.setRotation(q);
    /* Hold the knuckle still. An actor's transform is translate-then-
       rotate, so to fix a point p it has to sit at p - R*p. */
    const r = new LegendEngine.Vec3(piv[0], piv[1], piv[2]).applyQuat(q);
    act.setPosition([piv[0] - r.x, piv[1] - r.y, piv[2] - r.z]);
  };
  const poseHand = (arms, which, amount) => {
    if (!arms) return;
    const fingers = which === 'left' ? arms.lFingers : arms.rFingers;
    const pivots = which === 'left' ? arms.lPivots : arms.rPivots;
    const rec = arms.digits && arms.digits[which];
    if (!fingers || !pivots || !rec || !rec.digits) return;
    for (let f = 0; f < 4; f++) {
      const d = rec.digits[f];
      if (!fingers[f] || !pivots[f] || !d) continue;
      /* The little finger opens furthest and the index least, which is
         what a hand actually does when it lets go of something. */
      /* Nearly together. At 1.15 down to 0.78 the four fingers opened by
         visibly different amounts, and since a rigid turn about the
         knuckle cannot uncurl them, what came out was four posts of four
         different heights standing off the handguard -- a staircase, not
         a hand. A hand relaxing opens its fingers by almost the same
         amount; the little finger leads by a hair and that is all. */
      const lean = [1.06, 1.0, 0.96, 0.90][f];
      /* A rigid turn about the base knuckle cannot UNCURL a finger -- it
         swings the whole hook open, which is what letting go looks like
         from outside and is as far as one joint can take it. 1.25 rad at
         the knuckle carries the fingertip far enough to read as an open
         hand; less and it looks like the hand twitched. Opening turns
         away from the closing direction, so it can never drive a finger
         into the weapon however far it goes. */
      /* And not so far. One joint swinging 72 degrees is a claw opening;
         a hand letting go of something rotates its knuckles about half
         that and does the rest by straightening, which one rigid turn
         cannot do. Asking for the part it CAN do reads as a hand; asking
         for the whole of it reads as a mistake. */
      // `open` is the sign that takes this finger AWAY from the weapon,
      // measured when it was built rather than assumed to be negative.
      turnDigit(fingers[f], pivots[f], d.axis, (d.open || -1) * amount * 0.62 * lean);
    }
    const th = which === 'left' ? arms.lThumb : arms.thumb;
    const tp = which === 'left' ? arms.lThumbPivot : arms.thumbPivot;
    // About the thumb's own opening axis. World Z swung it up and down
    // the frame instead of off the fingers.
    const ta = which === 'left' ? arms.lThumbAxis : arms.thumbAxis;
    if (th && tp) turnDigit(th, tp, ta || [0, 0, 1], -amount * 0.42);
  };
  /* The support hand through a reload: it lets go, travels open, closes on
     what it is fetching, and opens again to release. RELOAD_WINDOW already
     says when each weapon's load is in that hand -- the same numbers the
     carried magazine is shown on -- so the grip and the object it grips
     appear on exactly the same beat instead of near each other. */
  if (v.arms && v.arms.lFingers) {
    let open = 0;
    if (P.reloading > 0 && spec.reload) {
      const done = 1 - P.reloading / spec.reload;
      const win = RELOAD_WINDOW[spec.reloadKind] || [0.15, 0.65];
      /* Open early and hold it open until the load is in the hand, rather
         than peaking for one frame at the window's edge and collapsing.
         The smoothing below is 14 per second, so a spike that narrow
         never reaches the hand at all. */
      const o0 = Math.max(0.05, win[0] * 0.75);
      if (done < o0) open = Math.min(1, done / o0);
      else if (done < win[0]) open = 1;
      else if (done < win[1]) open = 0.15;          // closed ON the load
      else open = Math.max(0, 1 - (done - win[1]) / Math.max(0.08, 1 - win[1]));
    }
    P.handOpen = (P.handOpen || 0) + (open - (P.handOpen || 0)) * Math.min(1, dt * 14);
    poseHand(v.arms, 'left', P.handOpen);
  }

  if (v.arms && v.arms.index && v.arms.indexPivot) {
    const iv = v.arms.indexPivot;
    const auto = !!spec.auto;
    const held = S.input && S.input.fireHeld && P.ammoFor(P.equipped()).mag > 0 && P.reloading <= 0;
    let pull;
    if (auto) {
      // Rides in to the break and stays there while the gun is firing.
      P.trigHold = Math.max(0, Math.min(1, (P.trigHold || 0) + (held ? dt / 0.06 : -dt / 0.09)));
      pull = P.trigHold;
    } else {
      // One press per shot, off the refire clock: fast in, slower out.
      const cyc = Math.max(0.06, Math.min(0.30, spec.refire || 0.16));
      P.trigT = Math.max(0, (P.trigT || 0) - dt);
      const t = 1 - P.trigT / cyc;
      pull = P.trigT > 0 ? (t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65) : 0;
    }
    // Taking the slack out of a trigger and breaking it is about nine
    // degrees at the knuckle. More reads as a finger curling into a fist.
    const ang = -0.158 * Math.max(0, Math.min(1, pull));
    const c = Math.cos(ang), sn = Math.sin(ang);
    const dx = -iv[0], dy = -iv[1];
    v.arms.index.setPosition([iv[0] + dx * c - dy * sn, iv[1] + dx * sn + dy * c, 0]);
    v.arms.index.setRotation([0, 0, ang * 57.2958]);
  }

  /* Reciprocating slide. A half-sine over the cycle time: back hard, forward
     on the return, which is the shape the real thing traces. */
  const gunActor = v.kind === 'single' ? v.actor : v.root;
  if (gunActor.slide) {
    if (P.slideCycle > 0) {
      P.slideCycle = Math.max(0, P.slideCycle - dt);
      const cyc = P.slideCycleMax || 0.085;
      const u = 1 - P.slideCycle / cyc;
      const back = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
      gunActor.slide.setPosition([-(gunActor.slideTravel || 0.02) * back, 0, 0]);
    } else {
      gunActor.slide.setPosition([0, 0, 0]);
    }
  }
}

/* Recoil, applied to the camera itself rather than only to the gun.

   Two components, because real recoil has two: a kick that snaps the
   muzzle up and settles back, and a climb that does not give itself back
   — the player has to pull down against it. A gun with only the first
   feels weightless; one with only the second feels like a broken mouse. */
/* World shake. Not recoil — this is the room moving, and it is applied to
   the same two angles for the same reason: one place adds it, one place
   takes it back, so it can never accumulate into the player's own aim. */
function addShake(S, mag, time) {
  S.shake = S.shake || { t: 0, mag: 0, max: 0 };
  S.shake.mag = Math.max(S.shake.mag, mag);
  S.shake.max = Math.max(S.shake.max, mag);
  S.shake.t = Math.max(S.shake.t, time);
  S.shake.life = S.shake.t;
}

function updateRecoil(game, P, dt, S) {
  const R = P.recoil, A = P.recoilApplied;
  // Take back last frame's offset before re-applying, so recoil never
  // eats the player's own aim.
  game._camPitch -= A.pitch;
  game._camYaw -= A.yaw;
  if (S && S.shake && S.shake.t > 0) {
    S.shake.t = Math.max(0, S.shake.t - dt);
    // Decays over its own life, and rattles fast enough to read as impact
    // rather than as a wobble.
    const k = S.shake.life > 0 ? S.shake.t / S.shake.life : 0;
    const amp = S.shake.mag * k * k;
    const tt = (S.frame || 0) * 0.9;
    R.pitch += Math.sin(tt * 3.1) * amp * 0.6 + (Math.random() - 0.5) * amp * 0.5;
    R.yaw += Math.cos(tt * 2.3) * amp * 0.5 + (Math.random() - 0.5) * amp * 0.4;
    if (S.shake.t <= 0) { S.shake.mag = 0; S.shake.max = 0; }
  }

  const spec = P.spec();
  const k = Math.exp(-(spec.recoil ? spec.recoil.recover : 9) * dt);
  R.pitch *= k;
  R.yaw *= k;
  if (Math.abs(R.pitch) < 1e-5) R.pitch = 0;
  if (Math.abs(R.yaw) < 1e-5) R.yaw = 0;

  A.pitch = R.pitch;
  A.yaw = R.yaw;
  game._camPitch += A.pitch;
  game._camYaw += A.yaw;
  game._camPitch = Math.max(-1.45, Math.min(1.45, game._camPitch));
}

const _vTmp1 = { x: 0, y: 0, z: 0, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }, sub(o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; }, cross(o) { const x = this.y * o.z - this.z * o.y, y = this.z * o.x - this.x * o.z, z = this.x * o.y - this.y * o.x; this.x = x; this.y = y; this.z = z; return this; }, normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
_vTmp1.scale = function (k) { this.x *= k; this.y *= k; this.z *= k; return this; };
const _clone = () => Object.assign(Object.create(Object.getPrototypeOf(_vTmp1)), _vTmp1);
const _vTmp2 = _clone();
const _vTmp3 = _clone();
const _vTmp4 = _clone();
let _vQuat1 = null, _vQuat2 = null;   // need LE at boot; assigned in start()
let _vAxisX = null, _vAxisY = null, _vAxisZ = null;

/* Fire the equipped weapon. Raycasts from the camera, damage to
   zombies, points per hit, gore on kill. */
function tryFire(game, S, P, hud, sfx, dt) {
  const spec = P.spec();
  const am = P.ammoFor(P.equipped());
  P.cooldown -= dt;
  if (P.reloading > 0) return;
  const wantFire = spec.auto ? S.input.fireHeld : S.input.firePressed;
  if (!wantFire || P.cooldown > 0) return;
  /* Whatever kills next, this is what killed it. killZombie() is the one
     funnel every death goes through and it does not know what fired --
     bullets, the knife, a grenade and the meteor all arrive there the
     same way -- so the credit is left here for it to pick up. */
  S.creditWeapon = P.equipped();

  if (spec.melee) { /* no magazine to check */ } else if (am.mag <= 0) {
    sfx.dryFire();
    if (am.reserve <= 0) { if (Math.random() < 0.4) S.voice(LINES.lowAmmo); S.bark('dry'); }
    else tryReload(P, sfx, S);
    P.cooldown = 0.25;
    return;
  }

  /* Melee: a short cone-ish probe instead of a bullet, its own kill
     bounty, and no ammo to spend. */
  /* Gold is spent by the shot, not the pellet, so a shotgun does not eat
     eight of them at a time. */
  if (P.goldAmmo && !spec.melee) {
    P.gold--;
    if (P.gold <= 0) { P.gold = 0; P.goldAmmo = false; }
  }
  if (spec.melee) {
    P.cooldown = spec.refire;
    P.kickPitch = Math.min(3, P.kickPitch + spec.kick);
    P.swingT = (MELEE_SWING[P.equipped()] || { time: 0.34 }).time;
    if (spec.sfx === 'ramHit') sfx.ramSwing(); else sfx.knife();
    const cam0 = game.camera;
    const fw = _vTmp1.copy(cam0.target).sub(cam0.position).normalize();
    const hitM = game.raycast([cam0.position.x, cam0.position.y, cam0.position.z],
      [fw.x, fw.y, fw.z], spec.range,
      (b) => b !== P.actor.body && !b.isTrigger && !(b.userData && b.userData.bulletPassthrough));
    const zm = hitM && hitM.actor && hitM.actor.userData && hitM.actor.userData.zombie;
    if (zm && !zm.dead) {
      if (sfx[spec.sfx]) sfx[spec.sfx]();
      // A ram or a shield shoves what it hits, and a wide one catches more
      // than the single body the ray found.
      if (spec.knockback) {
        for (const other of S.zombies) {
          if (other.dead || other.parked) continue;
          const op = other.actor.position;
          const dx = op.x - P.actor.position.x, dz = op.z - P.actor.position.z;
          const d = Math.hypot(dx, dz);
          if (d > spec.range + 0.5 || d < 1e-4) continue;
          const along = (dx / d) * fw.x + (dz / d) * fw.z;
          if (along < spec.sweep - 1) continue;         // outside the arc
          const b = other.actor.controller.body;
          b.velocity.x += (dx / d) * spec.knockback;
          b.velocity.z += (dz / d) * spec.knockback;
          if (other !== zm) hurtZombie(game, S, other, spec.dmg * 0.55, [op.x, op.y + 0.9, op.z], false, 'melee');
        }
      }
      hurtZombie(game, S, zm, spec.dmg, hitM.point, false, spec.melee ? 'melee' : 'bullet');
      sfx.hitmark();
      hud.hitmark(false);
      if (zm.dead) {
        S.killsTotal++;
        const pts = S.addPoints(ECONOMY.knifeKill);
        hud.pointsDelta(pts);
      } else {
        hud.pointsDelta(S.addPoints(ECONOMY.hit));
      }
      hud.points(S.points);
    }
    return;
  }

  am.mag--;
  P.cooldown = spec.refire;
  P.kickPitch = Math.min(3, P.kickPitch + spec.kick);

  /* Muzzle rise. Negative pitch is up in this camera, so recoil subtracts.
     Aiming braces the weapon: about a third less climb, the way a shouldered
     gun actually behaves. */
  const rc = spec.recoil;
  if (rc) {
    const brace = 1 - P.ads * 0.35;
    const deg = Math.PI / 180;
    // Eighteen carat is heavier and hotter: more kick, and a climb that
    // builds faster over a burst. That is the price of the damage.
    const gk = P.goldAmmo ? GOLD.recoilMul : 1;
    const gc = P.goldAmmo ? GOLD.climbMul : 1;
    P.recoil.pitch -= rc.up * deg * (0.85 + Math.random() * 0.3) * brace * gk;
    P.recoil.yaw += rc.side * deg * (Math.random() - 0.5) * 2 * brace * gk;
    // The part that does not come back — the player has to fight this down.
    game._camPitch -= rc.climb * deg * brace * gc;
    // recoilApplied is owned by updateRecoil alone. Writing the new value
    // here makes the next frame subtract an offset it never added, which
    // inverts the whole effect and pushes the muzzle down.
  }
  /* Drive the three recoil springs.

     `kick` was the only number a weapon had and it only ever tilted the
     muzzle. `back` is how far the gun is shoved along its own bore, and
     it is the one that gives a shot weight; `roll` is the twist, and it
     takes a random sign so a burst walks rather than tracking a straight
     line up the screen. These add to VELOCITY, because a shot is an
     impulse -- something hits the gun and then the spring deals with it,
     which is why the muzzle keeps climbing for a moment after the round
     has gone and then comes back past centre. */
  const rcS = spec.recoil || {};
  P.kickVel = (P.kickVel || 0) + (rcS.impulse != null ? rcS.impulse : spec.kick * 5.5);
  P.backVel = (P.backVel || 0) - (rcS.back != null ? rcS.back : 0.010 + spec.kick * 0.011) * 34;
  P.rollVel = (P.rollVel || 0) + (Math.random() < 0.5 ? -1 : 1)
    * (rcS.roll != null ? rcS.roll : 0.004 + spec.kick * 0.004) * 26;
  sfx[spec.sfx]();
  hud.ammo(P);
  S.statShot(P.equipped());
  // The trigger breaks with the shot, so the finger's clock starts here.
  P.trigT = Math.max(0.06, Math.min(0.30, spec.refire || 0.16));
  P.slideCycle = spec.auto ? 0.055 : 0.085;
  P.slideCycleMax = P.slideCycle;
  if (spec.thumbCock) {
    // The hammer has just fallen. The thumb starts again from nothing, and
    // so does the stage counter -- the shot is the only place that can
    // reset it, because by the time the viewmodel next runs the timer has
    // already moved off zero and a test for zero there never fires.
    P.cockT = 0;
    P.cockStage = 0;
    P.cockMax = Math.min(0.34, spec.refire * 0.72);
  }
  ejectShell(game, S, P, P.view[P.equipped()]);

  /* Muzzle flash: light plus sparks, one frame of each.
   *
   * ONE light, kept and re-lit. This made a new one every shot and let the
   * engine decay and delete it, which at the MG 42's twelve hundred rounds
   * a minute is twenty actors created and destroyed every second while the
   * gun is held down -- churn, in the middle of the busiest thing the game
   * ever does. The same lamp is simply moved and turned back up. */
  if (P.muzzleWorld) {
    game.particles.sparks(P.muzzleWorld, { count: spec.pellets > 1 ? 14 : 8, speed: 5, color: 0xffd27a });
    /* One lamp per flash colour, kept. A light is a plain record in the
       renderer's list with no decay on it, so it survives to be used
       again; it is faded out by hand in updateViewmodel. Two of them ever
       exist -- muzzle orange and the Arc Breaker's blue. */
    const warm = spec.sfx !== 'shotArc';
    P.flashLights = P.flashLights || {};
    const k = warm ? 'warm' : 'arc';
    if (!P.flashLights[k]) {
      P.flashLights[k] = game.light({ at: P.muzzleWorld,
        color: warm ? 0xffc061 : 0x66d4ff, intensity: 0, radius: 8 });
    }
    const fl = P.flashLights[k];
    fl.position.set(P.muzzleWorld[0], P.muzzleWorld[1], P.muzzleWorld[2]);
    fl.intensity = 130;
  }

  const cam = game.camera;
  const fwd = _vTmp1.copy(cam.target).sub(cam.position).normalize();
  let killsThisShot = 0;

  // Aimed fire tightens the cone; a shotgun tightens less than a rifle,
  // which is what its own adsSpread is for.
  const aimTighten = 1 - P.ads * (1 - (spec.adsSpread != null ? spec.adsSpread : PLAYER.adsSpread));
  /* One shot, one piece of feedback.

     Every one of these used to fire per pellet. A scattergun throws eight,
     so putting a barrel into a body played eight hit chimes stacked inside
     the same frame — eight square waves at 2300 Hz on top of each other,
     which is a screech rather than a hit marker — and a barrel into a wall
     threw eight dust puffs at once. The pellets still each do their own
     damage; it is the noise about them that is collected. */
  let anyHit = false, anyHead = false, pointsThisShot = 0;
  let wallHit = null, wallCount = 0;
  for (let p = 0; p < spec.pellets; p++) {
    const spread = spec.spread * aimTighten * Math.PI / 180;
    // Perturb along camera right and up so the cone is a cone from any
    // facing; one shared scalar collapses the pattern into a stripe.
    const rx = (Math.random() - 0.5) * spread, ry = (Math.random() - 0.5) * spread;
    const rl = Math.hypot(fwd.x, fwd.z) || 1e-6;
    const rgt = { x: fwd.z / rl, z: -fwd.x / rl };
    const dir = [fwd.x + rgt.x * rx, fwd.y + ry, fwd.z + rgt.z * rx];
    // Bodies this pellet has already gone through, for penetrating rounds.
    const pierced = [];
    // A round into the rock wakes it up. Checked on the pellet's own ray,
    // because the meteorite is a dozen overlapping spheres and hitting any
    // one of them is hitting it.
    if (p === 0) {
      const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      meteorShot(S, [cam.position.x, cam.position.y, cam.position.z],
        [dir[0] / dl, dir[1] / dl, dir[2] / dl], hud, sfx);
    }
    const from = [cam.position.x, cam.position.y, cam.position.z];
    const hit = game.raycast(from, dir, 60,
      (b) => b !== P.actor.body && !b.isTrigger && !(b.userData && b.userData.bulletPassthrough));

    /* Bodies on the floor. They are trigger bodies so that nobody has to
       climb over their own work, and the physics raycast skips triggers
       by design -- so this pellet asks the corpses itself, and only
       counts one that is NEARER than whatever solid thing the ray found.
       Shoot a body enough and it comes apart and is gone. */
    const cp = corpseAlong(S, from, dir, hit ? hit.distance : 60);
    if (cp) {
      shootCorpse(game, S, cp.z, spec.dmg * (P.goldAmmo ? GOLD.dmgMul : 1), cp.point);
      continue;
    }
    if (!hit) continue;

    const z = hit.actor && hit.actor.userData && hit.actor.userData.zombie;
    if (z && !z.dead) {
      /* Which way it was facing when the round arrived, so the death can
         be a fall forward rather than a fall back. Recorded on the body
         because killZombie is several frames and two functions away. */
      {
        const zf = z.actor.controller.facing;
        const dl2 = Math.hypot(dir[0], dir[2]) || 1;
        z.__shotFromBehind = (dir[0] / dl2) * Math.sin(zf) + (dir[2] / dl2) * Math.cos(zf) > 0.35;
      }
      const region = hitRegion(z, hit.point);
      const headshot = !!region.crit;
      const dmg = (spec.dmg * regionMul(region, spec) + (headshot ? (spec.headBonus || 0) : 0))
        * (P.goldAmmo ? GOLD.dmgMul : 1);
      // Snapshot before the kill: death parks the body at the pool lot,
      // and the chain has to arc from the corpse, not the car park.
      const diedAt = { x: z.actor.position.x, y: z.actor.position.y, z: z.actor.position.z };
      hurtZombie(game, S, z, dmg, hit.point, headshot,
        spec.stun ? 'shock' : spec.burn ? 'fire'
          : (P.goldAmmo ? 'gold' : spec.punchesPlate ? 'heavy' : 'bullet'),
        spec.burn ? { burn: spec.burn } : null);
      let awarded = S.addPoints(ECONOMY.hit);
      if (z.dead) {
        killsThisShot++;
        const mult = z.V ? z.V.points : 1;
        awarded += S.addPoints((headshot ? ECONOMY.headshotKill : ECONOMY.kill) * mult);
      }
      pointsThisShot += awarded;
      anyHit = true;
      if (headshot) anyHead = true;
      /* Penetration. A round that pierces carries on through the body it
         hit, losing a share each pass, until it runs out of passes or meets
         something that is not a zombie. Skipping the ones already hit is
         what stops it spending every pass on the same torso. */
      if (spec.pierce) {
        let carry = dmg, passes = spec.pierce;
        let from = hit.point;
        while (passes-- > 0) {
          pierced.push(z);
          carry *= spec.pierceFalloff;
          const nxt = game.raycast([from.x + dir[0] * 0.06, from.y + dir[1] * 0.06, from.z + dir[2] * 0.06], dir, 40,
            (b) => b !== P.actor.body && !b.isTrigger && !(b.userData && b.userData.bulletPassthrough)
              && !(b.userData && b.userData.zombie && pierced.indexOf(b.userData.zombie) >= 0));
          if (!nxt) break;
          const z2 = nxt.actor && nxt.actor.userData && nxt.actor.userData.zombie;
          if (!z2 || z2.dead) break;                     // it stopped in a wall
          const reg2 = hitRegion(z2, nxt.point);
          const head2 = !!reg2.crit;
          hurtZombie(game, S, z2, carry * regionMul(reg2, spec) + (head2 ? (spec.headBonus || 0) : 0), nxt.point, head2,
            spec.stun ? 'shock' : spec.burn ? 'fire'
          : (P.goldAmmo ? 'gold' : spec.punchesPlate ? 'heavy' : 'bullet'),
            spec.burn ? { burn: spec.burn } : null);
          pointsThisShot += S.addPoints(head2 ? ECONOMY.headshotKill : ECONOMY.hit);
          from = nxt.point;
        }
      }
      /* THE HIVE.
       *
       * It went into the body it hit; from there it goes into every
       * head near that body. Not a chain -- a chain jumps three times
       * and stops, and this is meant to take a crowd. Every brain
       * inside the radius is tried, each one on its own roll, and every
       * one that takes is finished.
       *
       * Rolled from the body that was hit rather than from the muzzle,
       * so it spreads from where the round landed. `max` is a ceiling
       * on how many bolts and how much damage one trigger pull can
       * cost the frame, not a rule about the hive. */
      if (spec.hive) {
        const H = spec.hive;
        const src = [diedAt.x, diedAt.y + 1.0, diedAt.z];
        let held = 0, refused = 0;
        for (const other of S.zombies) {
          if (held >= H.max) break;
          if (other === z || other.dead || other.parked) continue;
          if (dist2d(other.actor.position, diedAt) >= H.radius) continue;
          // Its own roll, and the two big ones are much harder to hold.
          const resist = (other.V && other.V.hiveResist) || 0;
          if (Math.random() < H.fail + resist * (1 - H.fail)) {
            refused++;
            // A refusal is visible: the bolt reaches it and dies there.
            const op = other.actor.position;
            arcBolt(game, src, [op.x, op.y + 1.5, op.z]);
            continue;
          }
          const op = other.actor.position;
          arcBolt(game, src, [op.x, op.y + 1.4, op.z]);
          // Straight at the head, which is what the weapon is doing.
          hurtZombie(game, S, other, H.dmg, [op.x, op.y + 1.5, op.z], true, 'shock');
          if (other.dead) {
            const mult = other.V ? other.V.points : 1;
            pointsThisShot += S.addPoints(ECONOMY.headshotKill * mult);
            killsThisShot++;
          }
          held++;
        }
        if (held > 2) sfx.hitmark();
        if (held) S.lastHive = { held, refused, at: S.time };
      }
    } else {
      // Wall hit, remembered rather than puffed: one cloud for the shot.
      wallCount++;
      if (!wallHit) wallHit = hit.point;
      // A drum he is waiting on. One round each and he counts the bangs.
      if (S.exit && S.exit.step === 2 && hit.actor) {
        for (const dr of S.exit.drums) {
          if (dr.lit || dr.actor !== hit.actor) continue;
          dr.lit = true;
          dr.actor.material = game.material({ color: 0x2a1a10, texture: 'rust',
            roughness: 0.95, metalness: 0.2, emissive: 0xff5a12, emissiveStrength: 1.1 });
          const l = game.light({ at: [dr.at[0], dr.at[1] + 1.2, dr.at[2]],
            color: 0xffa03a, intensity: 90, radius: 12 });
          l._decay = 1.1;
          game.particles.sparks([dr.at[0], dr.at[1] + 0.5, dr.at[2]],
            { count: 22, speed: 9, color: 0xffd27a, colorEnd: 0x5a1a06 });
          game.particles.smoke([dr.at[0], dr.at[1] + 1.4, dr.at[2]], { count: 6, color: 0x1d1a17 });
          sfx.drumBlast();
        }
      }
    }
  }
  if (anyHit) {
    if (anyHead) S.bark('headshot');
    anyHead ? sfx.headmark() : sfx.hitmark();
    hud.hitmark(anyHead);
    if (pointsThisShot) hud.pointsDelta(pointsThisShot);
  }
  if (wallCount) {
    // A little bigger for a pattern than for a single round, but one cloud.
    game.particles.dust(wallHit, { count: Math.min(4 + wallCount, 10), color: 0x8d8a82 });
  }
  if (killsThisShot >= 3) S.bark('multiKill');
  if (killsThisShot && !S.firstBloodDone) { S.firstBloodDone = true; S.voice(LINES.firstBlood); S.bark('firstBlood'); }
  hud.points(S.points);
}

function arcBolt(game, a, b) {
  // A run of glowing points between two positions — lightning on a budget.
  const n = 7;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 0.4;
    const y = a.y + 1 + (Math.random() - 0.5) * 0.5;
    const z = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * 0.4;
    game.particles.sparks([x, y, z], { count: 3, speed: 1.5, color: 0x66d4ff, colorEnd: 0x1a5f8a });
  }
}

/* Where the load is fetched from, in the weapon's own space.

   This is the fix for "I'm not holding a magazine. I'm not holding
   anything. I'm still invisibly reloading." Nothing was wrong with the
   animation: the magazine really was in the hand, on the right path, at
   the right moment. It was simply below the bottom edge of the screen for
   all but the last few frames of its travel, and by the time it arrived
   the window that showed it had already closed.

   The weapon sits about 186 mm below the camera axis at the hip and rises
   98 during a reload; half the picture at that distance is 185 mm. So
   there are roughly 90 mm of frame below the gun and 460 mm to its left.
   A fetch that goes 175 mm DOWN is off screen by 85. A fetch that goes 55
   down and 135 to the support side is the same reach, the same distance
   travelled, and every frame of it is visible.

   dy and dz are the drop and the outboard reach; the defaults are the
   ones almost everything uses. */
function FETCH(to, dy, dz) {
  const y = dy == null ? -0.052 : dy;
  const z = dz == null ? -0.140 : dz;
  return [to[0] - 0.028, to[1] + y, to[2] + z];
}

/* When the carried load is visible, per reload kind.

   These are not free numbers. Each one is pinned to the beat the WEAPON's
   own part changes on, because for half a second there were two
   magazines: the carried one was still flying at prog 0.62, which is
   exactly when the gun's own magazine came back. And before prog 0.34
   there was no magazine at all, in the hand or in the gun -- a fifth of a
   second of a man reloading with an empty fist.

     mag      gun's magazine hidden 0.16 -> 0.62   (reloadStage 1 -> 2)
     clip     gun's own clip seats   0.28 -> 0.74
     cell     cell is clear of the housing 0.26 -> 0.62
     break    nothing gun-side; the shells stay in the chambers
     revolver cylinder is out 0.20 -> 0.78

   The carried thing therefore arrives exactly as the gun-side part takes
   over, and leaves nothing empty behind it. */
const RELOAD_WINDOW = {
  mag: [0.14, 0.63],
  clip: [0.10, 0.86],
  cell: [0.16, 0.63],
  belt: [0.34, 0.66],
  break: [0.20, 0.68],
  revolver: [0.22, 0.78],
};

/* Where the magazine goes in, when the model has not said. */
function M_WELL_X(v) {
  const root = v.kind === 'single' ? v.actor : v.root;
  return (root && root.magWell && root.magWell[0]) || 0.02;
}

/* The thing the support hand is carrying.

   Built once per weapon and kept, because a reload happens every few
   seconds and spawning a magazine each time is a mesh upload each time.
   Parented to the weapon, so it inherits every bit of sway and recoil the
   gun has and does not swim about relative to the hand holding it. */

function reloadProp(game, P, v, spec, kind, forId) {
  P.props = P.props || {};
  /* The id is a parameter now, so these can be built at start-up instead
     of the first time each weapon is reloaded. A magazine is a few hundred
     triangles and a mesh upload, and doing it on the frame a man with an
     empty gun reaches for one is a hitch at the worst possible moment --
     the same class of fault as the stutter this pass is chasing, just
     spread over fourteen weapons instead of one. */
  const id = forId || P.equipped();
  const cached = P.props[id];
  /* Kept between reloads, but only while it is still the right object.
     The clip guns hand back the WEAPON's own clip actor, and a weapon
     given again is a new viewmodel with a new clip -- a cache that
     returned the old one would drive an actor no longer in the scene, and
     the reload would go invisible in exactly the way this whole pass is
     about. */
  if (cached && (kind !== 'clip' || cached.root === v.clip)) {
    v.prop = cached;
    return cached;
  }
  const root = v.kind === 'single' ? v.actor : v.root;
  if (!root) return null;

  const A = spec.ammo || {};
  let made = null;
  if (kind === 'mag') {
    made = game.boxMagazine({ physics: false, mag: Object.assign({
      w: 0.026, d: 0.021, len: 0.105, curve: 0, witness: 0, round: AMMO.para9,
    }, A.mag || {}), bodyMaterial: A.magMaterial });
  } else if (kind === 'clip') {
    /* The weapon already has one. Building a second meant two clips on
       screen a fifth of a second apart, and neither of them held for the
       part of the reload that matters. */
    if (v.clip) {
      P.props[id] = { root: v.clip, parts: [v.clip] };
      v.prop = P.props[id];
      return P.props[id];
    }
    made = game.stripperClip({ physics: false, clip: Object.assign({
      count: 10, pitch: 0.0098, round: AMMO.mau763,
    }, A.clip || {}) });
  } else if (kind === 'cell') {
    made = game.powerCell({ physics: false, cell: Object.assign({
      w: 0.052, h: 0.070, d: 0.038,
    }, A.cell || {}) });
  } else if (kind === 'belt') {
    made = game.mgBelt({ physics: false, belt: { links: 12 } });
  } else if (kind === 'break') {
    /* Two shells held between the fingers, which is how you load a
       double: the pair goes in together. They are their own actors so
       they can be left in the chambers rather than vanishing. */
    const shells = [];
    for (let i = 0; i < 2; i++) {
      const sh = game.shotShell({ physics: false,
        shell: Object.assign({ r: 0.00925, len: 0.0700, head: 0.0220 }, A.shell || {}),
        hullMaterial: A.hullMaterial });
      sh.setRotation([0, 0, 0]);
      shells.push(sh);
    }
    // The first is the holder; the second rides beside it.
    shells[0].parent = root;
    shells[1].parent = shells[0];
    shells[1].setPosition([0, 0, 0.0212]);
    const parts0 = [];
    for (const sh of shells) {
      parts0.push(sh);
      for (const n of sh.partNames || []) if (sh[n]) parts0.push(sh[n]);
    }
    for (const q of parts0) q.visible = false;
    P.props[id] = { root: shells[0], parts: parts0, shells };
    v.prop = P.props[id];
    return P.props[id];
  } else if (kind === 'revolver') {
    /* Loose rounds, thumbed in one at a time.
     *
     * It was a speedloader -- a moon clip with four rounds in it, pressed
     * on and twisted off, which takes about a second. That is a competition
     * shooter's tool and this is a man in a bunker with a handful of .50
     * out of his coat pocket. Four separate cartridges now, each going into
     * its own chamber in turn, which is what the reload time was already
     * paying for and what "I want him to load the round" describes.
     *
     * They are their own actors so they can be left IN the chambers rather
     * than vanishing at the end -- the cylinder carries them from there. */
    const rounds = [];
    for (let i = 0; i < (spec.mag || 4); i++) {
      const r = game.cartridge({ physics: false,
        round: Object.assign({}, AMMO.mag500, A.round || {}) });
      r.parent = root;
      rounds.push(r);
      for (const n of r.partNames || []) if (r[n]) rounds.push(r[n]);
    }
    for (const q of rounds) q.visible = false;
    P.props[id] = { root: rounds[0], parts: rounds, rounds };
    v.prop = P.props[id];
    return P.props[id];
  } else return null;

  made.parent = root;
  const parts = [made];
  for (const n of made.partNames || []) if (made[n]) parts.push(made[n]);
  for (const q of parts) q.visible = false;
  P.props[id] = { root: made, parts };
  v.prop = P.props[id];
  return P.props[id];
}

/* Eject a case. A real little brass cylinder with velocity and spin,
   thrown up and to the right out of the port, that lands and stays for a
   moment. Nothing sells a gun firing like brass leaving it. */
function ejectShell(game, S, P, v) {
  if (S.toggles && !S.toggles.shellCasings) return;
  const gun = v.kind === 'single' ? v.actor : v.root;
  if (!gun.ejectPort) return;
  const m = gun.matrix.e;
  const lp = gun.ejectPort;
  // Transform the port and the ejection direction by the gun's own matrix,
  // so brass leaves the port in the direction the gun is actually pointing.
  const wx = m[0] * lp[0] + m[4] * lp[1] + m[8] * lp[2] + m[12];
  const wy = m[1] * lp[0] + m[5] * lp[1] + m[9] * lp[2] + m[13];
  const wz = m[2] * lp[0] + m[6] * lp[1] + m[10] * lp[2] + m[14];
  const dir = [0.35, 0.75, 1.0];                       // up, right and back
  const ex = m[0] * dir[0] + m[4] * dir[1] + m[8] * dir[2];
  const ey = m[1] * dir[0] + m[5] * dir[1] + m[9] * dir[2];
  const ez = m[2] * dir[0] + m[6] * dir[1] + m[10] * dir[2];
  const sp = 2.4 + Math.random() * 1.2;
  const shell = game.cylinder({
    at: [wx, wy, wz], radius: 0.0058, height: 0.023, lifetime: 3.4,
    material: P.goldAmmo
      ? { color: 0xf5c93f, texture: 'metal', roughness: 0.10, metalness: 1, emissive: 0x5a3f06, emissiveStrength: 0.55 }
      : { color: 0xc79a43, texture: 'metal', roughness: 0.3, metalness: 1 },
    velocity: [ex * sp + (Math.random() - 0.5), ey * sp + 1.2, ez * sp + (Math.random() - 0.5)],
    bounce: 0.35, friction: 0.6, mass: 0.012,
  });
  if (shell.body) {
    shell.body.angularVelocity.set(
      (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26);
  }
  S.brass.push(shell);
  if (S.brass.length > 24) { const old = S.brass.shift(); if (old && !old.dead) old.destroy(); }
}

/* Drop the spent magazine. It falls, bounces once and lies there. */
/* The magazine that just hit the floor.
 *
 * This dropped one grey 26 x 100 x 21 box for every weapon in the game --
 * the same brick out of a 1911, an MP5 and a drum-fed Thompson -- and only
 * on the two guns that happen to call their magazine `mag`, so the Mauser
 * and the MG 42 dropped nothing at all. It is the real magazine now: the
 * weapon's own ammunition description gives its width, depth, length and
 * curve, and a fitted drum drops a drum. */
function dropMagazine(game, S, P, v) {
  const gun = v.kind === 'single' ? v.actor : v.root;
  if (!gun || !gun.magWell) return;
  const m = gun.matrix.e;
  const lp = gun.magWell;
  const wx = m[0] * lp[0] + m[4] * lp[1] + m[8] * lp[2] + m[12];
  const wy = m[1] * lp[0] + m[5] * lp[1] + m[9] * lp[2] + m[13];
  const wz = m[2] * lp[0] + m[6] * lp[1] + m[10] * lp[2] + m[14];
  const spec = P.spec();
  const A = (spec && spec.ammo) || {};
  const fit = (P.fitted[P.equipped()] || {}).mag;
  const vel = [(Math.random() - 0.5) * 0.6, -0.8, (Math.random() - 0.5) * 0.6];
  let drop = null;
  try {
    if (fit === 'drummag') {
      /* A drum is not a stick with more rounds in it, so what hits the
         floor is the drum's own model -- the same one that was on the gun a
         moment ago. */
      drop = game.gunPart('drummag', { at: [wx, wy, wz], lifetime: 6, mass: 0.55,
        physics: true, velocity: vel, bounce: 0.15, friction: 0.9 });
    } else {
      // Longer for an extended magazine, stubbier for a fast one.
      const shape = fit === 'extmag' ? { len: 0.150 } : fit === 'fastmag' ? { len: 0.078 } : {};
      drop = game.boxMagazine({
        at: [wx, wy, wz], lifetime: 6, mass: 0.13,
        mag: Object.assign({ w: 0.026, d: 0.021, len: 0.105, curve: 0, witness: 0,
          round: AMMO.para9 }, A.mag || {}, shape),
        bodyMaterial: A.magMaterial,
        velocity: vel, bounce: 0.2, friction: 0.8,
      });
    }
  } catch (e) { void e; }
  if (!drop) return;
  const body = drop.root || drop;
  if (body.body) body.body.angularVelocity.set((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5);
  S.brass.push(body);
}

function tryReload(P, sfx, S) {
  const spec = P.spec();
  const am = P.ammoFor(P.equipped());
  if (spec.melee || P.reloading > 0 || am.mag >= spec.mag || am.reserve <= 0) return;
  // Adrenaline works the hands as well as the legs.
  P.reloading = spec.reload / (P.perks.adrenaline ? 2 : 1);
  /* Staged, so the hands do the job in order rather than dipping for a
     second and coming up full: release the catch, the old magazine falls
     clear, the fresh one goes in, and the slide runs forward on it. */
  P.reloadStage = 0;
  P.breakStage = 0;
  P.cylStage = 0;
  P.clipStage = 0;
  P.cellStage = 0;
  sfx.magRelease();
  if (S && S.bark) S.bark('reload');
}

function finishReload(P, hud) {
  const spec = P.spec();
  const am = P.ammoFor(P.equipped());
  const want = spec.mag - am.mag;
  const take = Math.min(want, am.reserve);
  am.mag += take;
  am.reserve -= take;
  hud.ammo(P);
}

function dist2d(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.hypot(dx, dz); }

/* ---------------- the dead ---------------- */

/* Dead flesh reads green-grey and dry — high roughness, and much less
   subsurface than living skin, which is what stops it glowing warm at the
   edges the way the player's own hands do. */
const ZOMBIE_SKIN = { color: 0x8d9c78, texture: 'skin', roughness: 0.88, metalness: 0, subsurface: 0.12 };

/* Torn clothing, varied. A horde in one uniform reads as clones; a spread
   of faded field greys, dried blood and dirty canvas reads as a crowd that
   used to be people with different jobs. */
/* Cloth people actually wore, filthy: field grey, brown canvas, dirty
   drill, oiled wool. Saturated teal and orange read as costume, and a
   costume on a green body reads as a painted body. */
/* The male looks, cycled through the pool so a horde is mixed rather than
   four copies of one man. 'walker' is the imported body; the rest dress the
   procedural one. */
const MALE_LOOKS = ['walker', 'street', 'college', 'prison'];

/* The heavy build in uniform. A sheriff was carrying something; an officer
   was not, which is the whole difference between them for the player. */
const HEAVY_LOOKS = ['sheriff', 'officer'];

/* What a dead sheriff leaves behind, and how often. */
const SHERIFF_DROP = { model5: 0.16, mauser: 0.22, life: 26 };

/* The one that comes for you from round ten.

   Obese, fully kitted, and quick for his size. He carries a shield that
   eats everything from the front — but only in bursts: it takes a beating
   and then it is gone for half a minute, and that window is the fight. */
/* The workshop.

   Stock is rolled once a match, so what he has is what he has. Buyback is
   rolled per gun and per match too, and it is not always in your favour —
   the same Thompson might be worth 1700 or 900 depending on how he feels
   about you this run, and you find out by selling it.

   Perks come at a discount you have to buy with things you already own.
   Every gun you donate lifts the discount and lands in the crate behind
   him, where you can see exactly what you gave up. You can take it back
   out. Twice. */
const SHOP = {
  stockSize: 3,
  guns: ['thompson', 'scatter', 'arc', 'mauser', 'obliterator', 'ram', 'shield'],
  markup: [1.0, 1.45],
  buybackLow: 0.55, buybackHigh: 1.15,
  bribeStep: 0.14, maxDiscount: 0.55,
  stealsAllowed: 2,
  turretDps: 900,
};

const BOSS = {
  // Fast for his size — a little under a runner once the heavy build's own
  // speed multiplier is applied, which is the brief.
  from: 10, hp: 1000, speed: [3.5, 3.8], dmg: 2.4, points: 3.5,
  shieldHp: 420, shieldUp: 7.5, shieldCd: 32, shieldArc: 0.42,
  dropShield: 0.28, everyRounds: 4,
};

/* How each melee weapon moves. `out` is the fraction of the animation spent
   driving forward; the rest is the recovery, which is always slower. */
const MELEE_SWING = {
  ram: { time: 0.95, out: 0.30, reach: 0.62, thrust: true },
  shield: { time: 0.50, out: 0.34, reach: 0.34, arc: 0.5, yaw: 0.9 },
  shieldWorn: { time: 0.58, out: 0.34, reach: 0.30, arc: 0.45, yaw: 0.8 },
  knife: { time: 0.34, out: 0.38, reach: 0.20, arc: 1.5, yaw: 1.1 },
  hammer: { time: 0.40, out: 0.35, reach: 0.16, arc: 1.7 },
};

/* Raising the shield. It eats damage from the front and slows you down;
   it does not make you invulnerable, and nothing gets blocked from behind. */
const SHIELD_BLOCK = { arc: 0.55, slow: 0.45, raise: 6.0 };

/* Eighteen carat.

   Three conditions, none of them signposted: the generator running, Super
   Soldier held, and Shield Up held. Meet all three and a conveyor runs out
   of the east wall and starts dropping rounds. They double every gun's
   damage, they go through plate, and they cost you a harder climb on every
   shot — the extra mass has to go somewhere. The casings come out gold. */
const GOLD = {
  rounds: 120, dmgMul: 2.0, recoilMul: 1.7, climbMul: 2.1,
  beltSpeed: 0.55, dropEvery: 1.5,
};

/* Grenades. The inner radius kills outright; between there and the outer
   one the blast wounds, and anything that lives through it inside legRadius
   loses its legs and comes on as a crawler — which is what the outer edge of
   a frag does to something that no longer bleeds out. Late rounds have so
   much health that the blast never kills, and that is the point: past a
   certain round grenades stop being a clear and start being a way to put a
   whole group on the floor. */
const GRENADE = {
  start: 2, max: 4, cost: 750, fuse: 2.9,
  throwSpeed: 14.5, grav: 19.6, bounce: 0.34,
  damage: 1400, killRadius: 2.4, outerRadius: 5.6, legRadius: 4.6,
  playerDamage: 55, playerRadius: 3.4,
};

const RAG_COLORS = [0x6f6c5c, 0x7a6a52, 0x5e6355, 0x83795f,
                    0x615c4e, 0x726446, 0x555a4d, 0x7d7460];
/* Dead skin, darker than it wants to be. The procedural skin texture warms
   whatever tint it is given, so a colour picked to look right on a swatch
   comes out as a bright tan head floating over a dark body. */
/* One rotten green, varied only slightly — the body under the clothes
   should read as the same dead thing the head is, not as a second colour
   scheme competing with it. */
/* Cooler and greyer than they look on a swatch. The skin texture warms
   whatever tint it is given and the subsurface term adds more on top, so a
   colour that reads dead in the hex comes out alive on the model -- the
   same trap the viewmodel hands fell into twice. */
const SKIN_TONES = [0x6a7560, 0x6f7864, 0x64705a, 0x6c745e,
                    0x687260, 0x656e5a, 0x717a67, 0x67735c];

/* Four builds, each with its own body model, and what being that build
   does to it. A heavy one is slower and much harder to put down; one in
   webbing is harder still; a light one is quicker and softer. Crossed with
   the four movement types that is sixteen distinct things coming at you,
   from four bodies and one head sculptor. */
/* `walk` is what a body of this build does when its VARIANT asks for the
   generic walk. The male and armoured frames are burdened -- stooped
   right over with the arms hanging and trailing, feet scuffing, as if
   something is on their back, which is what a walker is meant to read
   as. The light and heavy frames keep their own gaits, because a small
   fast body and a big slow one are already saying something and
   flattening all three into one clip would say less, not more. */
const BODY_TYPES = [
  { id: 'male',    faceType: 'male',   hp: 1.00, speed: 1.00, walk: 'zwalk_burden' },
  { id: 'female',  faceType: 'female', hp: 0.90, speed: 1.12, walk: 'zwalk_light' },
  { id: 'heavy',   faceType: 'heavy',  hp: 1.45, speed: 0.80, walk: 'zwalk_heavy' },
  { id: 'armored', faceType: 'male',   hp: 1.80, speed: 0.92, walk: 'zwalk_burden' },
];

/* The four kinds. Health and damage multiply on top of the round curve,
   so a runner at round 12 is still a runner — the variant changes how it
   plays, the round changes how hard it hits. */
const VARIANTS = {
  walker: {
    weight: 1.0, speed: [0.95, 1.55], hp: 1.0, dmg: 1.0, points: 1.0,
    clip: 'zwalk', clipSpeed: 1.0, eye: 0xff7a2a, attack: ['zattack_grab', 'zattack'],
  },
  /* Runners.

     `speed` is the cruise; the controller's runSpeed is 1.35x that, and a
     lucid one gets another 1.22 on top. At 4.3 that compounded to 7.08 m/s
     against a player sprint of 7.4 -- a runner was moving at very nearly
     the speed you can run away at, which is why they crossed the map
     before you could turn round. A runner should be frightening because
     you cannot ignore it, not because it is already on you: 3.0 peaks at
     4.94, two thirds of a sprint, so you can break contact by running but
     not by walking, and it still closes about two and a half times faster
     than a walker. */
  /* It moves like a person, and that is the frightening part: upright,
     a real stride, weight over its feet. Everything wrong with it is
     above the waist -- one arm clutched hard across the chest, held all
     the way in, and that is the arm that comes off the body and swings
     when it reaches you. A player who has watched it held for twenty
     metres has already read the wind-up. */
  runner: {
    weight: 0.0, speed: [2.2, 3.0], hp: 0.8, dmg: 1.0, points: 1.15,
    clip: 'zrun_hold', clipSpeed: 1.0, eye: 0xff3a18, from: 4,
    attack: ['zattack_swing', 'zattack_swing', 'zattack_bite'],
    run: true,
  },
  crawler: {
    // Low, quiet and easy to lose track of — worth less because it is
    // slow, but it comes through gaps the standing ones cannot use.
    weight: 0.0, speed: [1.2, 1.7], hp: 0.55, dmg: 1.15, points: 0.9,
    clip: 'zcrawl', clipSpeed: 1.0, eye: 0xffb02a, from: 3, attack: ['zattack_rake'],
    crawl: true, height: 0.95,
  },
  /* The armoured runner. Not a variant of the walker — the point of it is
     that a thing already too fast to fight comfortably is also wearing
     something bullets will not go through. Guns are wasted on it; the
     battering ram, the riot shield and eighteen carat rounds are not. */
  armored: {
    // Slower than a bare runner, because it is carrying the plate.
    weight: 0.0, speed: [1.9, 2.6], hp: 1.0, dmg: 1.25, points: 1.8,
    clip: 'zrun', clipSpeed: 1.0, eye: 0x8fd0ff, from: 8, attack: ['zattack_slam', 'zattack_bite'],
    plated: true, run: true,
  },
  /* THE FAT ONE.
   *
   * Slow, and it does not fall over when you would like it to. Fifty
   * points of health ON TOP of the round's curve rather than a
   * multiplier of it -- which matters more than it sounds: a multiplier
   * would make it a nuisance at round three and irrelevant at round
   * twenty, and a flat fifty is the other way round, a real wall early
   * and a rounding error late. That is the right shape for a body whose
   * whole job is to be in the doorway while the fast ones come past it.
   *
   * Second slowest, behind the thrower. Both cannot be the slowest, and
   * the thrower keeps it: something that throws has a reason never to
   * reach you, and something this size has to be able to corner you.
   */
  fat: {
    weight: 0.0, speed: [0.80, 1.08], hp: 1.0, hpFlat: 50, dmg: 1.35, points: 1.5,
    clip: 'zwalk_heavy', clipSpeed: 0.88, eye: 0xffa03a, from: 3,
    attack: ['zattack_slam', 'zattack_grab'],
    heavy: true,
  },
  /* Not rolled into the mix like the others: the boss is scheduled by the
     round, one at a time. */
  boss: {
    weight: 0.0, speed: BOSS.speed, hp: 1.0, dmg: BOSS.dmg, points: BOSS.points,
    clip: 'zwalk_heavy', clipSpeed: 1.45, eye: 0x9ad8ff, from: BOSS.from,
    attack: ['zattack_slam', 'zattack_hook'],
    /* Wearing the plate but not immune behind it. Those are two different
       things and conflating them cost him his kit: his defence is the shield
       and the thousand health, and making him bulletproof as well leaves
       nothing to do in the window where the shield is down. */
    wearsPlate: true, boss: true, hiveResist: 0.75,
  },
  /* The Amalgamation.

     Several of them that did not come apart cleanly. It is one body
     carrying the parts of three more: a second head grown out of the
     shoulder, two spare arms hanging off the back, and the fused mass
     between them. It is slow, it does not stagger, and it has more health
     than the boss — the answer to it is the Paralyzer, the rock, or
     running away and letting the minigun have it.

     It arrives from twelve and never more than one at a time. */
  amalgam: {
    weight: 0.0, speed: [0.85, 1.15], hp: 6.0, dmg: 2.4, points: 4.0,
    clip: 'zwalk_heavy', clipSpeed: 0.72, eye: 0xc86aff, from: 12,
    attack: ['zattack_hook', 'zattack_slam', 'zattack_grab'],
    amalgam: true, heavy: true, solo: true, hiveResist: 0.75,
  },
  spitter: {
    /* Keeps its distance and throws. The only ranged threat in the game,
       and the reason Deflect is worth buying.

       It is also the slowest thing that walks. One of its legs does not
       work: the knee is locked, the toe is down, and the foot is dragged
       round rather than swung, so it lurches over the good leg and off
       it again. That is what buys it the range -- it will never catch
       you, so it does not try, and the whole shape of the fight against
       one is that you can walk away from it and it will still hit you. */
    weight: 0.0, speed: [0.72, 0.95], hp: 1.25, dmg: 1.0, points: 1.4,
    clip: 'zlimp', clipSpeed: 1.0, eye: 0x7cff5a, from: 6,
    ranged: {
      // Far enough to pick you off across a room, slow enough that the
      // chunk is a thing you watch coming and step out of. Reduced gravity
      // keeps the arc flat and readable instead of mortaring it into the
      // ceiling, which is what a real lob does at this speed.
      range: 17, minRange: 5.0, cooldown: 3.6, speed: 9.5, grav: 7.0,
      dmg: 18, splash: 2.2,
    },
  },
};

/* Throwers carry no ammunition, so they make it. Five chunks come out of
   the flank, one socket at a time, each one costing them a share of what
   they have and leaving a hole that stays open — by the fourth there is
   bone in it. The sixth is their own face, and that one kills them on the
   way out, which is why it hits hardest. */
const RIP = {
  bodyThrows: 5,
  bodyTime: 0.62,        // into zrip, where the hand comes free of the ribs
  faceTime: 0.72,        // into zripface
  throwTime: 0.46,       // into zspit, where the arm whips through
  boneFrom: 3,           // the socket at which bone starts showing
  selfCost: 0.15,        // of max hp, per body rip
  faceDmg: 2.4,
  faceSplash: 1.35,
};

/* How the mix shifts with the round. Early rounds are all walkers; the
   others fade in so each one gets a round of its own to be noticed. */
function variantWeights(round) {
  return {
    walker: 1.0,
    runner: round < 4 ? 0 : Math.min(0.85, (round - 3) * 0.14),
    crawler: round < 3 ? 0 : Math.min(0.45, (round - 2) * 0.09),
    spitter: round < 6 ? 0 : Math.min(0.32, (round - 5) * 0.07),
    fat: round < 3 ? 0 : Math.min(0.30, (round - 2) * 0.06),
    armored: round < 8 ? 0 : Math.min(0.26, (round - 7) * 0.05),
    /* Rare on purpose. One in twenty bodies from round twelve, and the
       spawner will not put a second one in the room while the first is up
       — two of these at once is not a fight, it is a wall. */
    amalgam: round < 12 ? 0 : Math.min(0.05, (round - 11) * 0.012),
  };
}

function pickVariant(round, rng, S) {
  const w = variantWeights(round);
  /* A variant marked solo is not rolled while one of it is already up.
     There is a difference between a rare heavy body and two rare heavy
     bodies in the same doorway, and only one of them is a fight. */
  if (S && S.zombies) {
    for (const k in w) {
      const V = VARIANTS[k];
      if (V && V.solo && S.zombies.some((z) => !z.dead && !z.parked && z.kind === k)) w[k] = 0;
    }
  }
  let total = 0;
  for (const k in w) total += w[k];
  let r = rng() * total;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'walker';
}

function roomOf(p) {
  /* Three places to be: the blockhouse floor, the wing through the door, and
     the roof. Height decides the roof because the stair is the only way onto
     it and the whole deck is above the ceiling slab. */
  if (p.y > MAP.roof.y0 - 0.6) return 'roof';
  if (p.x < MAP.side.x1 + 0.2) return 'side';
  return 'main';
}

/* ---------------- navigation ----------------

   Between rooms the graph below is enough — there are three of them and two
   ways between them. Inside a room the horde used to walk straight at the
   player, which is right up until something is in the way: the workbench,
   the crates, the shop counter, the meteorite. Then they pressed into it
   and stayed there, and the complaint was that they do not always find a
   route. So there is a grid now, and A* over it.

   The grid is built once, at map build, by marching rays along every row
   and every column at chest height and marking whatever they hit. Two
   levels — the floor and the roof deck — because the stair is the only way
   between them and the room graph already owns that. */
const NAV = { cell: 0.5 };

function buildNavLevel(game, box, y) {
  const c = NAV.cell;
  const w = Math.ceil((box.x1 - box.x0) / c);
  const h = Math.ceil((box.z1 - box.z0) / c);
  const g = new Uint8Array(w * h);
  const solid = (b) => b && !b.isTrigger && !(b.userData && b.userData.zombie)
    && !(b.userData && b.userData.player);
  const mark = (x, z) => {
    const i = Math.floor((x - box.x0) / c), j = Math.floor((z - box.z0) / c);
    if (i >= 0 && i < w && j >= 0 && j < h) g[j * w + i] = 1;
  };
  /* March, do not single-cast. One ray down a row reports only the first
     thing it meets; restarting a little past each hit walks the whole row
     and finds the far side of the bench as well as the near side. */
  const sweep = (along) => {
    const n = along === 'x' ? h : w;
    for (let k = 0; k < n; k++) {
      const fixed = (along === 'x' ? box.z0 : box.x0) + (k + 0.5) * c;
      let t = 0;
      const span = along === 'x' ? box.x1 - box.x0 : box.z1 - box.z0;
      for (let guard = 0; guard < 200 && t < span; guard++) {
        const ox = along === 'x' ? box.x0 + t : fixed;
        const oz = along === 'x' ? fixed : box.z0 + t;
        const dir = along === 'x' ? [1, 0, 0] : [0, 0, 1];
        const hit = game.raycast([ox, y, oz], dir, span - t, solid);
        if (!hit) break;
        const d = Math.hypot(hit.point.x - ox, hit.point.z - oz);
        mark(hit.point.x, hit.point.z);
        t += d + c * 0.5;
      }
    }
  };
  sweep('x');
  sweep('z');
  return { box, w, h, c, g };
}

function navBlocked(nav, i, j) {
  if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return true;
  return nav.g[j * nav.w + i] === 1;
}

/* A* over one level. Returns world-space waypoints, or null when there is
   no route — in which case the caller falls back to walking straight at the
   player, which is what it always used to do. */
function navPath(nav, from, to) {
  const c = nav.c, b = nav.box, w = nav.w, h = nav.h;
  const ci = (x) => Math.max(0, Math.min(w - 1, Math.floor((x - b.x0) / c)));
  const cj = (z) => Math.max(0, Math.min(h - 1, Math.floor((z - b.z0) / c)));
  const si = ci(from.x), sj = cj(from.z);
  let ti = ci(to.x), tj = cj(to.z);
  if (si === ti && sj === tj) return [];
  /* If the player is standing in a cell the sweep called solid — against a
     wall, on the stairs — walk out to the nearest cell that is not. */
  if (navBlocked(nav, ti, tj)) {
    let best = null, bd = 1e9;
    for (let j = Math.max(0, tj - 4); j <= Math.min(h - 1, tj + 4); j++) {
      for (let i = Math.max(0, ti - 4); i <= Math.min(w - 1, ti + 4); i++) {
        if (navBlocked(nav, i, j)) continue;
        const d = (i - ti) * (i - ti) + (j - tj) * (j - tj);
        if (d < bd) { bd = d; best = [i, j]; }
      }
    }
    if (!best) return null;
    ti = best[0]; tj = best[1];
  }
  const n = w * h;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = sj * w + si, goal = tj * w + ti;
  gScore[start] = 0;
  // A binary heap would be tidier; the grid is under two thousand cells and
  // a linear scan over the open set costs less than the code to avoid it.
  const open = [start];
  const hEst = (k) => {
    const i = k % w, j = (k / w) | 0;
    const dx = Math.abs(i - ti), dz = Math.abs(j - tj);
    return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  let found = false;
  let guard = 0;
  while (open.length && guard++ < 20000) {
    let bi = 0, bf = Infinity;
    for (let k = 0; k < open.length; k++) {
      const f = gScore[open[k]] + hEst(open[k]);
      if (f < bf) { bf = f; bi = k; }
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) { found = true; break; }
    closed[cur] = 1;
    const i = cur % w, j = (cur / w) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (navBlocked(nav, ni, nj)) continue;
      // No cutting a corner diagonally through two walls that meet.
      if (di && dj && (navBlocked(nav, i + di, j) || navBlocked(nav, i, j + dj))) continue;
      const k = nj * w + ni;
      if (closed[k]) continue;
      const step = (di && dj) ? Math.SQRT2 : 1;
      const g2 = gScore[cur] + step;
      if (g2 < gScore[k]) {
        gScore[k] = g2; came[k] = cur;
        if (open.indexOf(k) < 0) open.push(k);
      }
    }
  }
  if (!found) return null;
  const out = [];
  for (let k = goal; k !== -1 && k !== start; k = came[k]) {
    out.push([b.x0 + (k % w + 0.5) * c, 0, b.z0 + (((k / w) | 0) + 0.5) * c]);
  }
  out.reverse();
  /* Smooth: a grid path is a staircase, and a body walking a staircase
     zigzags. Drop any waypoint the one after it can be reached from
     directly, which turns the staircase back into the two or three corners
     that were actually the point. */
  const keep = [];
  let at = { x: from.x, z: from.z };
  for (let k = 0; k < out.length; k++) {
    const next = out[k + 1];
    if (next && navClear(nav, at, { x: next[0], z: next[2] })) continue;
    keep.push(out[k]);
    at = { x: out[k][0], z: out[k][2] };
  }
  return keep;
}

/* Bresenham-ish walk between two points over the grid. */
function navClear(nav, a, b) {
  const c = nav.c;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(d / (c * 0.5));
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const i = Math.floor((x - nav.box.x0) / c), j = Math.floor((z - nav.box.z0) / c);
    if (navBlocked(nav, i, j)) return false;
  }
  return true;
}

/* Waypoint chains between rooms. Small map, hand-authored graph. */
function routeTo(fromRoom, toRoom, S) {
  const D = MAP.door1, st = MAP.stair;
  const door = [MAP.main.x0 - 0.3, 0, (D.z0 + D.z1) / 2];
  // Foot of the flight, then the head of it. Two points is enough: the run is
  // straight, and a walker that reaches the bottom step can see the top one.
  const base = [(st.x0 + st.x1) / 2, 0, st.zBot + 0.6];
  const top = [(st.x0 + st.x1) / 2, MAP.roof.y1, st.zTop - 0.8];
  const key = fromRoom + '>' + toRoom;
  const table = {
    'side>main': [door], 'main>side': [door],
    'main>roof': [base, top], 'roof>main': [top, base],
    'side>roof': [door, base, top], 'roof>side': [top, base, door],
  };
  return table[key] || [];
}

/* The pool. Building a character is expensive — a skin-weight solve, a
   sculpted head, a full mesh upload — so it happens once per pool slot,
   staggered behind the title screen, and never during play. Spawning is
   a teleport and a reset; dying is a parking job. */

function buildPooledZombie(game, S, i) {
  const rag = RAG_COLORS[i % RAG_COLORS.length];
  const tone = SKIN_TONES[(i * 3) % SKIN_TONES.length];
  const body = BODY_TYPES[i % BODY_TYPES.length];
  /* Male zombies come in four looks that cycle through the pool: the
     imported body, which arrives with its clothes, head and rot sculpted
     into one mesh, and three dressed variants of the procedural body.
     Anything with a model skips the procedural garment, blood and head
     layers entirely — it already has them. */
  const look = body.id === 'male' ? MALE_LOOKS[(i / BODY_TYPES.length | 0) % MALE_LOOKS.length] : null;
  // The heavy build turns up in uniform: half sheriffs, half officers.
  const heavyLook = body.id === 'heavy' ? HEAVY_LOOKS[(i / BODY_TYPES.length | 0) % HEAVY_LOOKS.length] : null;
  const model = look === 'walker' && WALKER ? WALKER : null;
  const outfit = heavyLook || (look && look !== 'walker' ? look : null);
  const a = game.character({
    model, outfit,
    at: [200 + i * 4, -38, 0],
    // The imported body carries its own UV layout, so it wants its own
    // texture density and a tone chosen against its sculpted detail rather
    // than the flat one the procedural flesh uses.
    ...(model ? { material: {
      color: 0x84906a, texture: 'rust', roughness: 0.95, metalness: 0,
      subsurface: 0.03, uvScale: 4,
    } } : {}),
    /* The body material is flesh only -- the coat is its own mesh.
     *
     * It was the CORROSION texture, on the argument that rotted flesh
     * reads as mottled rather than as an even tint. The argument is right
     * and the texture is wrong: it is pitted metal, and on a head 230 mm
     * across at uvScale 3 it lands as three or four enormous blotches that
     * erase the brow, the cheekbones and the jaw -- a green camouflage
     * ball with two embers in it. Winding it up to 14 only turned the ball
     * mustard and made it look crocheted.
     *
     * The mottling belongs in the GEOMETRY, and now it is there: the head
     * sculpt has its own rot pass, with the eyes sunk, the temples caved,
     * the cheeks fallen in and the skin dried onto the vault, seeded so no
     * two are alike. So the surface can be skin -- the same texture the
     * living heads and the viewmodel hands use, and those read correctly --
     * in a colour that is already dead. */
    material: { color: tone, texture: 'skin', roughness: 0.88, metalness: 0, subsurface: 0.07, uvScale: 3 },
    // A dressed variant carries its colours per vertex, so its material has
    // to be white or every tint would be multiplied down by a rag colour.
    clothMaterial: { color: outfit ? 0xffffff : rag, texture: 'fabric', roughness: 0.96, metalness: 0, uvScale: 2.2 },
    bloodMaterial: { color: 0x37100b, texture: 'smooth', roughness: 0.30, metalness: 0 },
    // Rotted flesh reads as mottled, not as an even tint. The skin texture
    // warms whatever colour it is given into something living; a corroded
    // one blotches it instead, which is the difference between a pale head
    // and a dead one.
    skin: { color: tone, texture: 'skin', roughness: 0.88, metalness: 0, subsurface: 0.07, uvScale: 3 },
    seed: 20 + (i * 5) % 11,
    face: 'static', zombie: true,
    // Every pooled body carries plate; it is only made visible on the ones
    // that spawn armoured, which costs one hidden mesh and no rebuild.
    armor: true,
    armorMaterial: { color: 0x6a7078, texture: 'metal', roughness: 0.42, metalness: 1, uvScale: 2 },
    zombieBuild: body.id, faceType: body.faceType,
  });
  a.bodyType = body.id;
  a.buildDef = body;
  a.outfitName = outfit;
  a.controller.body.gravityScale = 0;
  a.controller.autoAnimate = false;   // the zombie brain owns the clips
  /* Eyes, as two pieces each: a dark wet iris sitting on the head's own
     globe, and a small hot pupil inside it. One glowing bead reads as a
     lamp; iris-inside-socket reads as something looking at you. */
  /* Eye placement is derived from the head's own transform rather than
     guessed. The head mesh is a child of the head bone with its own offset
     and scale, and the sockets are at known coordinates inside that mesh —
     so bone-space position is offset + meshCoordinate * headScale. Typing
     bone-space numbers by hand is how the old glowing beads ended up
     hovering a hand's width above everyone's skull. */
  const eyes = [];
  if (a.head && a.skeleton && !model) {
    const hb = a.skeleton.index('head');
    const hs = a.head.scale.y;                       // head mesh scale
    const ho = a.head.localOffset;                   // head mesh offset on the bone
    const EX = 0.091 * 0.82, EY = 0.032, EZ = 0.2335;   // socket, in head-mesh space
    for (const side of [-1, 1]) {
      const bx = ho.x + side * EX * hs;
      const by = ho.y + EY * hs;
      const bz = ho.z + EZ * hs;
      const iris = game.sphere({ radius: 0.0088 * hs / 0.389, physics: false, material: {
        color: 0x1a1408, texture: 'smooth', roughness: 0.16, metalness: 0 } });
      iris.parent = a; iris.parentBone = hb;
      iris.localOffset = new window.LE.Vec3(bx, by, bz);
      // sphere() bakes the radius into actor.scale, so flattening has to
      // multiply that scale, not replace it.
      iris.scale.z *= 0.40;
      const pupil = game.sphere({ radius: 0.0040 * hs / 0.389, physics: false, material: {
        color: 0x120903, texture: 'smooth', roughness: 0.3,
        emissive: 0xff7a2a, emissiveStrength: 2.4 } });
      pupil.parent = a; pupil.parentBone = hb;
      pupil.localOffset = new window.LE.Vec3(bx, by, bz + 0.0016);
      pupil.scale.z *= 0.5;
      eyes.push(iris, pupil);
    }
  }
  const wounds = buildZombieWounds(game, a, body.id);
  /* The boss carries a full-height riot shield on his left arm. Built with
     the body and hidden, so a boss round costs no construction; it is
     parented to the forearm bone so it swings with him. */
  let bossShield = null;
  if (a.skeleton) {
    const sh = makeRiotShield(game, { smoked: true });
    const bi = a.skeleton.index('lowerArmL');
    sh.root.parent = a; sh.root.parentBone = bi;
    /* Orientation is in the forearm's frame, not the world's. With the arm
       raised forward — which is where every zombie clip puts it — the bone's
       local -Y points the way he is going and local +Z points up, so the
       shield has to be turned a quarter turn about X for its face to look
       forward and its height to stand upright. Left flat, it hangs broadside
       across him and hides the whole man. */
    /* Out past the fist, not level with it. The forearm bone is the elbow;
       measured on the boss, his hand sits 0.24 down the bone from it and the
       fist ends around 0.30, so a shield hung at 0.15 has his whole hand
       standing through the front face. -X in this frame is across his chest,
       which is where a carried shield actually covers. */
    sh.root.localOffset = new window.LE.Vec3(-0.05, -0.40, 0.04);
    sh.root.setRotation([90, 0, 6]);
    sh.root.scale.set(0.94, 0.94, 0.94);
    sh.root.visible = false;
    for (const q of sh.parts) q.visible = false;
    bossShield = sh;
  }

  /* The Amalgamation's spare parts.

     Built on every body in the pool and hidden, because the alternative is
     spawning a dozen actors in the frame one arrives — and it arrives in
     the middle of round twelve, which is the worst possible moment for a
     stutter. Each piece hangs off a real bone, so they move with whatever
     the body is doing rather than floating alongside it. */
  const grafts = [];
  if (a.skeleton) {
    const flesh = { color: 0x6b5346, texture: 'skin', roughness: 0.74, metalness: 0, subsurface: 0.3 };
    const dead = { color: 0x4e4038, texture: 'skin', roughness: 0.82, metalness: 0, subsurface: 0.2 };
    const graft = (boneName, mk, off, rot, sc) => {
      const q = mk();
      q.parent = a;
      q.parentBone = a.skeleton.index(boneName);
      q.localOffset = new window.LE.Vec3(off[0], off[1], off[2]);
      if (rot) q.setRotation(rot);
      if (sc) q.scale.set(sc, sc, sc);
      q.visible = false;
      grafts.push(q);
      return q;
    };
    // A second head, growing out of the right shoulder and turned away.
    graft('upperArmR', () => game.sphere({ radius: 0.105, material: flesh, physics: false }),
      [0.02, -0.09, 0.05], [0, 40, 24]);
    graft('upperArmR', () => game.box({ size: [0.10, 0.07, 0.05], material: dead, physics: false }),
      [0.02, -0.15, 0.09], [0, 40, 24]);
    // Two spare arms off the back, hanging.
    for (const [side, bn] of [[-1, 'spine'], [1, 'spine']]) {
      graft(bn, () => game.capsule({ radius: 0.052, height: 0.30, material: dead, physics: false }),
        [side * 0.20, 0.02, -0.16], [26, 0, side * 34]);
      graft(bn, () => game.capsule({ radius: 0.044, height: 0.26, material: dead, physics: false }),
        [side * 0.30, -0.22, -0.22], [48, 0, side * 20]);
      graft(bn, () => game.sphere({ radius: 0.055, material: dead, physics: false }),
        [side * 0.36, -0.38, -0.25]);
    }
    // The fused mass across the back and shoulders that holds it together.
    graft('spine', () => game.sphere({ radius: 0.17, material: flesh, physics: false }), [0, 0.06, -0.13]);
    graft('chest', () => game.sphere({ radius: 0.15, material: flesh, physics: false }), [0.10, 0.04, -0.10]);
    graft('chest', () => game.sphere({ radius: 0.13, material: dead, physics: false }), [-0.13, -0.02, -0.09]);
    // A third pair of legs, dragging.
    for (const side of [-1, 1]) {
      graft('hips', () => game.capsule({ radius: 0.056, height: 0.34, material: dead, physics: false }),
        [side * 0.17, -0.10, -0.18], [34, 0, side * 12]);
    }
  }
  /* Posture. The clips animate the limbs; biasing the spine and head in the
     animator's rest pose gives every one of them a slightly different
     stooped carriage on top of whatever it is playing. */
  if (a.skeleton && a.animator) {
    const bend = (name, x, y, zr) => {
      const bi = a.skeleton.index(name);
      if (bi < 0 || !a.animator.restRotations[bi]) return;
      a.animator.restRotations[bi].setEuler(x, y, zr);
    };
    const lean = 0.10 + (i % 5) * 0.022;
    bend('spine', lean, 0, 0);
    bend('chest', lean * 0.6, (i % 3 - 1) * 0.06, 0);
    bend('head', -lean * 0.45, (i % 4 - 1.5) * 0.07, (i % 3 - 1) * 0.05);
  }
  const z = { actor: a, eyes, wounds, bossShield, grafts, parked: true, dead: true, poolSlot: i, anim: '',
    ripStage: 0, ripT: 0, throwT: 0, ripFace: false };
  a.userData = { zombie: z };
  setZombieVisible(z, false);
  S.pool.push(z);
  return z;
}

/* Wound sockets: five down the flank and one on the face, built hidden on
   every pooled body and revealed one at a time as a thrower opens itself up
   for ammunition. Building them with the body rather than at the moment of
   the throw means throwing costs nothing, and a zombie that has already
   given up four chunks still walks around carrying all four holes.

   Each socket is a wet cavity with a splinter of bone sunk in it. The
   cavity is squashed flat against the surface it sits on so it reads as a
   torn opening rather than a lump stuck to the ribs. */
function buildZombieWounds(game, a, buildName) {
  const wounds = [];
  if (!a.skeleton || !window.LE.zombieWoundSpots) return wounds;
  const spots = window.LE.zombieWoundSpots(buildName);
  // Bind-pose heights of the spine chain, hips at the origin. The torso
  // sockets are authored in that space, so the bone-local offset is simply
  // the socket minus the bone it hangs on.
  const BONE_Y = { hips: 0, spine: 0.16, chest: 0.34, neck: 0.50, head: 0.61 };
  for (const s of spots) {
    const bi = a.skeleton.index(s.bone);
    if (bi < 0) continue;
    let ox = s.pos[0], oy = s.pos[1] - (BONE_Y[s.bone] || 0), oz = s.pos[2];
    /* Flat against the surface, not sitting on it. The thin axis is the
       one pointing out of the body: at 0.15 the shape is a disc half-buried
       in the flesh, so the mesh hides its edges and what is left reads as an
       opening. A rounder one is a bead glued to the ribs, which is what the
       first pass looked like. */
    let sx = 0.15, sy = 1.35, sz = 1.05;
    if (s.face) {
      /* Derived from the head actor's own transform for exactly the reason
         the eyes are: the head mesh is a child of the head bone with its
         own offset and scale, and a number typed by hand in bone space is
         how you get a wound hovering beside a skull instead of in it. An
         imported body has no separate head actor, so it falls back to the
         nominal figures. */
      const hs = a.head ? a.head.scale.y : 0.389;
      const ho = a.head ? a.head.localOffset : { x: 0, y: 0.14, z: 0.006 };
      ox = ho.x + 0.098 * 0.82 * hs;        // cheek, just outboard of the eye
      oy = ho.y - 0.030 * hs;
      oz = ho.z + 0.196 * hs;
      sx = 0.95; sy = 1.10; sz = 0.16;
    }
    /* Outward normal at the socket, so everything below can be sunk along
       it. A sphere left centred on the skin is a bead stuck to the ribs;
       sunk past its own middle, only a shallow cap shows and the eye reads
       it as an opening. */
    let nx, ny = 0, nz;
    if (s.face) { nx = 0.42; ny = -0.10; nz = 0.90; }
    else { const L = Math.hypot(ox, oz) || 1; nx = ox / L; nz = oz / L; }
    /* The socket is authored 6 mm inside the skin, so each layer is pushed
       back out along the normal and then a hair further, stacking a raw red
       border under a black opening under a splinter of bone. */
    const at = (d) => new window.LE.Vec3(ox + nx * d, oy + ny * d, oz + nz * d);
    // Torn edge: a wider, matte ring of raw muscle that the hole sits in.
    const rim = game.sphere({ radius: s.r * 1.45, physics: false, material: {
      color: 0x4c1712, texture: 'rust', roughness: 0.90, metalness: 0, uvScale: 9 } });
    rim.parent = a; rim.parentBone = bi;
    rim.localOffset = at(0.005);
    // sphere() bakes the radius into actor.scale, so squashing multiplies
    // that scale rather than replacing it.
    rim.scale.x *= sx * 0.80; rim.scale.y *= sy * 0.95; rim.scale.z *= sz * 0.95;
    rim.visible = false;
    const cavity = game.sphere({ radius: s.r, physics: false, material: {
      color: 0x140403, texture: 'smooth', roughness: 0.66, metalness: 0 } });
    cavity.parent = a; cavity.parentBone = bi;
    cavity.localOffset = at(0.0082);
    cavity.scale.x *= sx; cavity.scale.y *= sy; cavity.scale.z *= sz;
    cavity.visible = false;
    // The splinter, standing out of the hole far enough to catch a light.
    const bone = game.sphere({ radius: s.bone_r, physics: false, material: {
      color: 0xafa48a, texture: 'smooth', roughness: 0.62, metalness: 0 } });
    bone.parent = a; bone.parentBone = bi;
    bone.localOffset = at(0.0115);
    // A sliver lying across the opening, not a plug filling it.
    bone.scale.x *= sx * 2.0; bone.scale.y *= 1.30; bone.scale.z *= sz * 0.42;
    bone.visible = false;
    wounds.push({ rim, cavity, bone, shown: false, boneShown: false, face: !!s.face });
  }
  return wounds;
}

/* One place that decides what a zombie is playing, so a state change can
   never leave two clips fighting over the same bones. */
function playZombieAnim(z, name, fade) {
  if (z.anim === name || !z.actor.animator) return;
  z.anim = name;
  z.actor.animator.play(name, fade != null ? fade : 0.18);
}

function setZombieVisible(z, on) {
  z.actor.visible = on;
  if (z.actor.head) z.actor.head.visible = on;
  if (z.actor.armor) z.actor.armor.visible = on && !!z.wearsPlate;
  if (z.bossShield) {
    /* Only the parts, never the root: the root of a group model is the
       1x1x1 placeholder box every builder pivots on, and it is built
       invisible on purpose. Showing it hangs a metre-wide default-material
       cube in front of the shield. */
    const show = on && !!z.boss && z.bUp > 0;
    for (const q of z.bossShield.parts) q.visible = show;
  }
  // The spare bodies, on the one variant that has them.
  if (z.grafts) for (const q of z.grafts) q.visible = on && !!(z.V && z.V.amalgam);
  // The coat and the stains are separate meshes on the same skeleton, so
  // they need hiding too — otherwise a parked body leaves its clothes
  // standing out at the far end of the world where the pool lives.
  if (z.actor.cloth) z.actor.cloth.visible = on;
  if (z.actor.blood) z.actor.blood.visible = on;
  for (const e of z.eyes) e.visible = on;
  for (const w of z.wounds || []) {
    w.rim.visible = on && w.shown;
    w.cavity.visible = on && w.shown;
    w.bone.visible = on && w.boneShown;
  }
}

/* A body coming back out of the pool is whole again. */
function healWounds(z) {
  for (const w of z.wounds || []) {
    w.shown = false; w.boneShown = false;
    w.rim.visible = false; w.cavity.visible = false; w.bone.visible = false;
  }
}

function parkZombie(game, S, z) {
  z.parked = true;
  z.dead = true;
  setZombieVisible(z, false);
  const b = z.actor.controller.body;
  b.gravityScale = 0;
  b.velocity.setScalar(0);
  b.setPosition({ x: 200 + z.poolSlot * 4, y: 1.1, z: 0 });
  z.actor.controller.move(0, 0);
}

function spawnZombie(game, S, win, forceVariant) {
  /* A boss is a big man, so he needs a big body — take a heavy slot out of
     the pool if one is free rather than putting a thousand health on
     whatever came up next. */
  /* Pick the kind first, then the body, because two of them want a heavy
     one — the boss because he is a big man, and the Amalgamation because
     it is four of them. */
  const kind0 = forceVariant || pickVariant(S.round, Math.random, S);
  const wantsHeavy = kind0 === 'boss' || (VARIANTS[kind0] && VARIANTS[kind0].heavy);
  let z = wantsHeavy
    ? (S.pool.find((q) => q.parked && q.actor.bodyType === 'heavy') || S.pool.find((q) => q.parked))
    : S.pool.find((q) => q.parked);
  /* Corpses hold pool slots. When every body is either walking or lying
     on the floor, the floor gives one up -- the oldest, so what
     disappears is the one furthest behind you and least likely to be
     watched. A round is never skipped because the last one is still
     cooling. */
  if (!z) {
    const old = oldestCorpse(S);
    if (old) { retireCorpse(game, S, old); z = old; }
  }
  if (!z) return null;
  const kind = kind0;
  const V = VARIANTS[kind];
  const B = z.actor.buildDef || BODY_TYPES[0];
  const speed = (V.speed[0] + Math.random() * (V.speed[1] - V.speed[0])) * B.speed;
  const b = z.actor.controller.body;
  b.gravityScale = 1;
  b.velocity.setScalar(0);
  /* Underground, and climbing out. They are visible across open field from
     the moment they arrive, so appearing fully upright reads as a spawn;
     coming up out of the mud reads as the map. */
  const px = win.def.pad[0] + (Math.random() - 0.5) * 2.6;
  const pz = win.def.pad[2] + (Math.random() - 0.5) * 2.6;
  b.gravityScale = 0;
  b.setPosition({ x: px, y: 1.1 - RISE_DEPTH, z: pz });
  z.actor.controller.moveSpeed = speed;
  z.actor.controller.runSpeed = speed * 1.35;
  // A boss has a flat pool that does not scale with the round — the shield
  // is what makes him harder later, not the number.
  const maxHp = V.boss ? BOSS.hp
    : ROUNDS.hpFor(S.round) * V.hp * B.hp + (V.hpFlat || 0);
  Object.assign(z, {
    parked: false, dead: false,
    kind, V, build: B.id,
    hp: maxHp, maxHp,
    dmg: ROUNDS.dmgFor(S.round) * V.dmg,
    state: 'rising', riseT: RISE_TIME * (0.8 + Math.random() * 0.5), riseAt: [px, pz], win, speed,
    tearT: 0, attackT: 0, groanT: 1 + Math.random() * 3, stuckT: 0, lastPos: null,
    vault: null, spitT: 1 + Math.random() * 2, anim: '',
    ripStage: 0, ripT: 0, throwT: 0, ripFace: false,
    legless: false, plated: !!V.plated, wearsPlate: !!(V.plated || V.wearsPlate), clangT: 0,
    boss: !!V.boss, bShield: V.boss ? BOSS.shieldHp : 0,
    bUp: V.boss ? 1 : 0, bUpT: V.boss ? BOSS.shieldUp : 0, bCd: 0,
    // Runners drop in and out of a remembered human sprint.
    lucid: 0, lucidT: 2 + Math.random() * 4,
    stunT: 0, arcT: 0, stunSeed: 0, burnT: 0, burnDps: 0,
    routeKey: '', wpIdx: 0,
  });
  if (z.actor.visualOffset) z.actor.visualOffset.set(0, 0, 0);
  healWounds(z);
  // A body coming back out of the pool has its legs again.
  if (z.actor.skeleton) for (const nm of ['lowerLegL', 'lowerLegR']) {
    const bn = z.actor.skeleton.bone(nm);
    if (bn) bn.localScale.set(1, 1, 1);
  }
  // Crawlers ride a shorter capsule so the folded body sits on the floor.
  z.actor.controller.height = V.crawl ? V.height : 1.75;
  /* The Amalgamation gets its bulk from the parts bolted to it and from
     taking a heavy body out of the pool, not from a scale multiplier.
     Scaling the actor would scale a skinned mesh whose head, coat and eyes
     are separate actors riding its bones, and the hit regions are measured
     against a fixed capsule — so a body at 1.34 would take head shots to
     its collarbone. Bigger by construction, same capsule. */
  if (z.grafts) for (const q of z.grafts) q.visible = !!V.amalgam;
  for (let k = 1; k < z.eyes.length; k += 2) {
    z.eyes[k].material = game.material({ color: 0x120903, texture: 'smooth', roughness: 0.3,
      emissive: V.eye, emissiveStrength: 2.4 });
  }
  // The walk belongs to the body; the run, crawl and throw belong to the
  // variant. A heavy walker waddles, a light one has a quicker, narrower
  // track — and both still sprint the same way if they are runners.
  z.moveClip = V.clip === 'zwalk' ? B.walk : V.clip;
  setZombieVisible(z, true);
  playZombieAnim(z, z.moveClip, 0.25);
  win.zombiesAt++;
  if (!S.zombies.includes(z)) S.zombies.push(z);
  return z;
}

/* `source` decides whether the hit lands at all. Plate turns bullets: the
   round sparks off it and does nothing, which is the whole identity of the
   armoured runner and the reason the melee weapons and the gold rounds
   exist. Everything else — a ram, a shield edge, an eighteen carat round —
   goes straight through it. */
function hurtZombie(game, S, z, dmg, at, headshot, source, opts) {
  if (z.dead) return;
  /* The boss's shield is a health pool of its own, not an immunity. Hit it
     from the front while it is up and it takes the damage instead of him;
     break it and he is open until it comes back. */
  if (z.boss && z.bUp > 0 && z.bShield > 0) {
    const zp = z.actor.position;
    const dx = at[0] - zp.x, dz = at[2] - zp.z;
    const d = Math.hypot(dx, dz) || 1;
    const fx = Math.sin(z.actor.controller.facing), fz = Math.cos(z.actor.controller.facing);
    if ((dx / d) * fx + (dz / d) * fz > BOSS.shieldArc) {
      z.bShield -= dmg;
      game.particles.sparks(at, { count: 9, speed: 5, color: 0xdff0ff, colorEnd: 0x4a6070 });
      game.audio.impact(0.34);
      if (z.bShield <= 0) {
        z.bShield = 0; z.bUp = 0; z.bCd = BOSS.shieldCd;
        game.particles.sparks([zp.x, zp.y + 1.0, zp.z], { count: 30, speed: 8, color: 0xdff0ff, colorEnd: 0x24303a });
        game.audio.impact(1);
      }
      return;
    }
  }
  /* Plate turns bullets -- but not everything that comes out of a barrel
     is a bullet in the sense the plate was designed for. A half-inch
     magnum and an anti-materiel rifle round go through it; that is what
     the calibre is FOR, and it is the reason to carry something that
     heavy when the armoured ones start coming. Gold rounds and every
     melee weapon already went through, and 'heavy' joins them. */
  if (z.plated && (source === 'bullet' || source === 'blast' || source === 'shock')) {
    game.particles.sparks(at, { count: 7, speed: 4.5, color: 0xffe6a8, colorEnd: 0x6a5a30 });
    game.audio.impact(0.28);
    z.clangT = 0.2;
    return;
  }
  if (z.plated && source === 'heavy') {
    // It goes through, and it is loud about it.
    game.particles.sparks(at, { count: 14, speed: 7, color: 0xfff0c0, colorEnd: 0x6a5a30 });
    game.audio.impact(0.6);
    z.clangT = 0.12;
  }
  z.hp -= dmg;
  /* Blood, and it comes out the way the round went in.

     This was five sparks in a dark red -- confetti, and the same confetti
     whether you had touched something with a knife or put a .50 through
     its chest. A hit should throw spray along the bullet's path, leave a
     mist hanging where it went in, and get worse the harder it was.

     `dir` is the direction of travel: from the shooter to the wound for a
     shot, and away from the body's centre for a blow that has no ray.
     Blood that sprays evenly in every direction reads as a burst pipe. */
  const zp0 = z.actor.position;
  let dir = null;
  if (opts && opts.dir) dir = opts.dir;
  else if (S.player && S.player.actor) {
    const pp = S.player.actor.position;
    const dx = at[0] - pp.x, dy = at[1] - (pp.y + 0.6), dz = at[2] - pp.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    dir = [dx / L, dy / L, dz / L];
  }
  if (S.toggles && S.toggles.gore !== false) {
    /* Scaled by how hard the hit was, against this round's own health, so
       a graze off a big one is a spatter and a magnum is a fountain. */
    const bite = Math.max(0.25, Math.min(2.4, dmg / Math.max(40, z.maxHp * 0.25)));
    const head = headshot ? 1.7 : 1;
    game.particles.blood(at, {
      count: Math.round(7 + bite * 9 * head),
      speed: 3.2 + bite * 2.6,
      direction: dir,
      spread: source === 'melee' ? 0.75 : 0.5,
      size: 0.8 + bite * 0.35,
    });
    /* A headshot is its own event: the spray goes up and back, and there
       is something more than mist in it. */
    if (headshot) {
      game.particles.gore([at[0], at[1] + 0.04, at[2]], {
        count: 5, speed: 3.0, direction: dir, size: 0.75,
      });
    }
  }
  void zp0;
  if (source === 'fire') {
    /* Incendiary. The hit itself is light; what the round is for is what
       it leaves behind, and it stacks its clock rather than its damage —
       a second shot into a burning body resets the timer, it does not
       double the rate. */
    z.burnT = Math.max(z.burnT || 0, opts && opts.burn ? opts.burn.time : 5);
    z.burnDps = Math.max(z.burnDps || 0, opts && opts.burn ? opts.burn.dps : 20);
  }
  if (source === 'shock') {
    /* Current, not damage. The slug is worth less every round and the ten
       seconds are worth more — by the twenties the Arc Breaker is a crowd
       control weapon that happens to also shoot. */
    z.stunT = Math.max(z.stunT || 0, STUN.time);
    z.stunSeed = Math.random() * 6.28;
  }
  if (z.hp <= 0) {
    /* The killing blow makes a mess. Everything above is the wound; this
       is the body coming apart, and it is worth being bigger than any
       single hit that led to it. */
    if (S.toggles && S.toggles.gore !== false) {
      game.particles.gore([at[0], at[1], at[2]], {
        count: headshot ? 16 : 11,
        speed: headshot ? 5.4 : 4.0,
        direction: dir,
        size: headshot ? 1.15 : 0.95,
      });
    }
    killZombie(game, S, z, headshot, source);
  }
}

/* ================= CORPSES =================
 *
 * There were none. A zombie that lost its last point of health was
 * teleported to the far end of the world in the same frame, so every
 * one of them vanished mid-step -- no death, no body, no evidence that
 * the room had been fought in.
 *
 * A corpse is the same pooled body it always was, left where it fell
 * with its last death frame held. Which means corpses SPEND POOL SLOTS,
 * and the pool is what spawning draws from, so the two have to be
 * budgeted against each other or a busy round starves: `budget` is the
 * most that may lie about at once, and a spawn that finds no free body
 * takes the oldest corpse before it gives up. That is the crash the
 * request was worried about, and it is a bookkeeping problem rather
 * than a memory one.
 *
 * They are trigger bodies while they lie there, so you walk through a
 * pile of them rather than being fenced in by your own work. The
 * physics raycast skips triggers by design, so shooting one is tested
 * separately -- see corpseAlong().
 */
const CORPSE = {
  life: 240,             // four minutes, as asked
  fade: 6,               // sinks through the floor over the last six seconds
  budget: 8,             // at once; the oldest goes first
  breakUp: 260,          // damage into one body before it comes apart
  hitRadius: 0.55,       // how near a shot has to pass to count as a hit
};

/* Which way it goes down, from what put it down. The look of a death is
   most of what tells you what you hit it with, so this is not cosmetic:
   a head shot folds where it stands, the current drops it like a post,
   and a grenade throws it. */
function deathClipFor(z, headshot, source) {
  if (headshot) return 'zdie_head';
  if (source === 'shock') return 'zdie_shock';
  if (source === 'fire') return 'zdie_burn';
  if (source === 'blast') return 'zdie_blast';
  if (source === 'melee') return Math.random() < 0.5 ? 'zdie_knees' : 'zdie_face';
  /* A shot from behind pitches it forward. The player is the only thing
     shooting, so "behind" is the body facing away from them. */
  if (z.__shotFromBehind) return 'zdie_face';
  return Math.random() < 0.28 ? 'zdie_knees' : 'zdie_back';
}

/* Lay one down: stop it, take it out of the way of everything that
   walks, and hold the last frame of its death. */
function startCorpse(game, S, z, headshot, source) {
  const b = z.actor.controller.body;
  z.actor.controller.move(0, 0);
  b.velocity.setScalar(0);
  b.angularVelocity.setScalar(0);
  b.gravityScale = 0;
  b.isTrigger = true;
  b.userData = b.userData || {};
  b.userData.corpse = true;
  z.corpseT = CORPSE.life;
  z.corpseAt = S.time;
  z.gore = 0;
  z.isCorpse = true;
  playZombieAnim(z, deathClipFor(z, headshot, source), 0.08);
  if (z.actor.animator) z.actor.animator.speed = 1;
}

/* The oldest one lying about, or null. */
function oldestCorpse(S) {
  let best = null;
  for (const z of S.zombies) {
    if (!z.isCorpse || z.parked) continue;
    if (!best || z.corpseAt < best.corpseAt) best = z;
  }
  return best;
}

function retireCorpse(game, S, z) {
  z.isCorpse = false;
  const b = z.actor.controller.body;
  b.isTrigger = false;
  if (b.userData) b.userData.corpse = false;
  parkZombie(game, S, z);
}

/* Ages them out, and keeps the pile inside its budget. */
function updateCorpses(game, S, dt) {
  let n = 0;
  for (const z of S.zombies) {
    if (!z.isCorpse || z.parked) continue;
    n++;
    z.corpseT -= dt;
    /* The last few seconds it sinks rather than blinking out. A body
       that disappears between two frames is the thing that makes a
       player doubt what they saw a moment ago. */
    if (z.corpseT < CORPSE.fade) {
      const u = Math.max(0, z.corpseT) / CORPSE.fade;
      z.actor.visualOffset = z.actor.visualOffset || new window.LE.Vec3(0, 0, 0);
      z.actor.visualOffset.set(0, -(1 - u) * 0.9, 0);
    }
    if (z.corpseT <= 0) {
      if (z.actor.visualOffset) z.actor.visualOffset.set(0, 0, 0);
      retireCorpse(game, S, z);
      n--;
    }
  }
  while (n > CORPSE.budget) {
    const old = oldestCorpse(S);
    if (!old) break;
    if (old.actor.visualOffset) old.actor.visualOffset.set(0, 0, 0);
    retireCorpse(game, S, old);
    n--;
  }
}

/* Is there a corpse along this shot, and how far? A segment-to-point
   test against the body's middle, which is all the precision a thing
   lying on the floor needs -- and it is why corpses can be triggers
   and still be shootable. */
function corpseAlong(S, from, dir, maxT) {
  const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const dx = dir[0] / dl, dy = dir[1] / dl, dz = dir[2] / dl;
  let hit = null, hitT = maxT;
  for (const z of S.zombies) {
    if (!z.isCorpse || z.parked) continue;
    const p = z.actor.position;
    // Centre of a body on the floor, not of a body standing up.
    const cx = p.x - from[0], cy = p.y + 0.22 - from[1], cz = p.z - from[2];
    const t = cx * dx + cy * dy + cz * dz;
    if (t <= 0 || t >= hitT) continue;
    const ex = cx - dx * t, ey = cy - dy * t, ez = cz - dz * t;
    if (Math.hypot(ex, ey, ez) > CORPSE.hitRadius) continue;
    hit = z; hitT = t;
  }
  return hit ? { z: hit, t: hitT, point: [from[0] + dx * hitT, from[1] + dy * hitT, from[2] + dz * hitT] } : null;
}

/* Shooting one. It takes the damage, and past a threshold it comes
   apart and is gone -- which is the answer to emptying a drum into a
   body that is already dead: the body leaves rather than the frame
   rate. */
function shootCorpse(game, S, z, dmg, at) {
  z.gore = (z.gore || 0) + dmg;
  if (S.toggles && S.toggles.gore !== false) {
    game.particles.blood(at, { count: 5, speed: 2.2, size: 0.7 });
  }
  game.audio.impact(0.18);
  if (z.gore < CORPSE.breakUp) return;
  const p = z.actor.position;
  if (S.toggles && S.toggles.gore !== false) {
    game.particles.gore([p.x, p.y + 0.25, p.z], { count: 18, speed: 4.6, size: 1.0 });
  }
  for (let i = 0; i < 5; i++) {
    const g = game.box({
      at: [p.x + (Math.random() - 0.5) * 0.5, p.y + 0.3 + Math.random() * 0.2, p.z + (Math.random() - 0.5) * 0.5],
      size: [0.12 + Math.random() * 0.1, 0.09, 0.09],
      material: { color: 0x5a120c, texture: 'smooth', roughness: 0.7 },
      lifetime: 2.0, velocity: [(Math.random() - 0.5) * 4, 2.2 + Math.random() * 2, (Math.random() - 0.5) * 4],
    });
    if (g.body) g.body.angularVelocity.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
  }
  game.audio.impact(0.7);
  if (z.actor.visualOffset) z.actor.visualOffset.set(0, 0, 0);
  retireCorpse(game, S, z);
}

function killZombie(game, S, z, headshot, source) {
  z.dead = true;
  S.killsTotal++;
  S.statKill(S.creditWeapon, headshot);
  if (z.state === 'rising' || z.state === 'toWindow' || z.state === 'tearing') z.win.zombiesAt--;
  const p = z.actor.position;
  // Gibs: a burst of dark red chunks with real physics, plus dust. The
  // engine pools nothing here, so they get lifetimes and stay few.
  game.particles.sparks([p.x, p.y + 0.9, p.z], { count: 16, speed: 3.5, color: 0x8a1a12, colorEnd: 0x300806 });
  game.particles.dust([p.x, p.y + 0.4, p.z], { count: 6, color: 0x4a3f33 });
  const gibs = headshot ? 4 : 3;
  for (let i = 0; i < gibs; i++) {
    const g = game.box({
      at: [p.x + (Math.random() - 0.5) * 0.3, p.y + 0.8 + Math.random() * 0.5, p.z + (Math.random() - 0.5) * 0.3],
      size: [0.14 + Math.random() * 0.1, 0.1, 0.1],
      material: { color: 0x5a120c, texture: 'smooth', roughness: 0.7 },
      lifetime: 2.2, velocity: [(Math.random() - 0.5) * 5, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 5],
    });
    if (g.body) g.body.angularVelocity.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
  }
  /* A sheriff sometimes goes down still holding it. Officers never do —
     they are a big body worth no drop, which is what makes the sheriff
     worth picking out of a crowd. */
  /* His shield sometimes comes off him in one piece — a worse one than the
     box gives you, because it has already been through this. */
  if (z.boss && Math.random() < BOSS.dropShield) {
    spawnEnemyDrop(game, S, [p.x + 0.4, p.y + 0.25, p.z], 'shieldWorn');
  }
  if (z.actor.outfitName === 'sheriff') {
    const roll = Math.random();
    const id = roll < SHERIFF_DROP.model5 ? 'obliterator'
      : roll < SHERIFF_DROP.model5 + SHERIFF_DROP.mauser ? 'mauser' : null;
    if (id) spawnEnemyDrop(game, S, [p.x, p.y + 0.25, p.z], id);
  }
  // Powerup roll.
  if (!S.powerupActive && Math.random() < 0.04) dropPowerup(game, S, p);
  /* And then it lies there. The one exception is a body that is not on
     the floor to begin with -- something killed while it is still
     climbing out of the mud has nowhere to fall to, and the pool wants
     it back. */
  if (z.state === 'rising') parkZombie(game, S, z);
  else startCorpse(game, S, z, headshot, source);
  game.audio.impact(0.5);
}

const POWERUPS = {
  maxammo: { label: 'FULL RESUPPLY', color: 0x59ff7a },
  blitz: { label: 'BLITZ', color: 0xffd23a },
  double: { label: 'PAYDAY', color: 0x66d4ff },
};

/* A gun an enemy left behind: spinning, on its own clock, and it has to
   be picked up rather than walked over.

   Renamed from dropWeapon. There are two different things called
   "dropping a weapon" in this game -- a reward an enemy leaves, which
   floats and expires, and the gun the player just swapped away from,
   which falls where it was and stays. A second function called
   dropWeapon was added for the latter with a different signature, and in
   one concatenated scope the later declaration silently won: killing the
   boss then called the player's version with a position where it wanted
   a player, and threw. Two jobs, two names. */
function spawnEnemyDrop(game, S, at, id) {
  const built = buildWorldWeapon(game, id) || makeMauser(game);
  built.root.setPosition(at);
  S.drops.push({ id, root: built.root, parts: built.parts, t: SHERIFF_DROP.life, spin: 0, baseY: at[1] });
}

/* Take a weapon out of the player's hands, leaving the sidearm behind. */
function dropFromHands(P, id) {
  const at = P.slots.indexOf(id);
  if (at < 0) return;
  P.slots.splice(at, 1);
  if (!P.slots.length) P.slots.push('m1911');
  P.slot = Math.min(P.slot, P.slots.length - 1);
  P.reloading = 0;
}

/* A weapon on the floor.
 *
 * It is a real model with a real rigid body, thrown out in front of the
 * player with a bit of spin, and it bounces and settles wherever it
 * lands. Ammunition travels with it, so a gun put down half-empty comes
 * back half-empty rather than being quietly refilled -- and it does NOT
 * pick itself up when you walk over it, because a gun you have just
 * swapped away from is lying exactly where you are standing and would
 * come straight back.
 */
function dropWeapon(game, S, P, id) {
  const w = WEAPONS[id];
  if (!w || w.noDrop) return null;
  const built = buildWorldWeapon(game, id);
  if (!built) return null;
  const cam = game.camera;
  const fx = cam.target.x - cam.position.x, fy = cam.target.y - cam.position.y,
    fz = cam.target.z - cam.position.z;
  const L = Math.hypot(fx, fy, fz) || 1;
  const p = P.actor.position;
  const at = [p.x + fx / L * 0.55, p.y + 0.35, p.z + fz / L * 0.55];
  built.root.setPosition(at);
  built.root.setRotation([Math.random() * 40 - 20, Math.random() * 360, 70 + Math.random() * 40]);
  const am = P.ammo[id] || { mag: w.mag, reserve: w.reserve };
  const drop = {
    id, actor: built.root, parts: built.parts,
    mag: am.mag, reserve: am.reserve,
    t: 0, vy: 1.6, spin: (Math.random() - 0.5) * 6,
    vx: fx / L * 1.9, vz: fz / L * 1.9,
    at: at.slice(), rest: false, rot: [0, Math.random() * 360, 78],
  };
  S.floorGuns = S.floorGuns || [];
  S.floorGuns.push(drop);
  if (S.__sfx && S.__sfx.gunDrop) S.__sfx.gunDrop();
  return drop;
}

/* Fall, tumble, land. Its own integrator rather than the rigid-body
   solver: a weapon is a group of a dozen parented actors and giving the
   root a body would have the parts inherit a physics transform they were
   never authored for -- the Model 5's cylinder would swing off its crane
   the first time it hit the floor. */
function updateDrops(game, S, dt) {
  if (!S.floorGuns || !S.floorGuns.length) return;
  for (const d of S.floorGuns) {
    d.t += dt;
    if (!d.rest) {
      d.vy -= 17 * dt;
      d.at[0] += d.vx * dt;
      d.at[1] += d.vy * dt;
      d.at[2] += d.vz * dt;
      d.vx *= 0.90; d.vz *= 0.90;
      d.rot[2] += d.spin * dt * 57.2958;
      // The floor it fell onto, whatever height that is.
      const hit = game.raycast([d.at[0], d.at[1] + 0.4, d.at[2]], [0, -1, 0], 3.0,
        (b) => !b.isTrigger && b !== P_BODY(S));
      const floorY = hit ? hit.point[1] : 0;
      if (d.at[1] <= floorY + 0.055) {
        d.at[1] = floorY + 0.055;
        if (Math.abs(d.vy) < 1.1) {
          // Settled: lie flat.
          d.rest = true;
          d.vy = 0; d.vx = 0; d.vz = 0;
          d.rot = [0, d.rot[1], 82];
        } else {
          d.vy = -d.vy * 0.32;
          d.spin *= 0.4;
        }
      }
      d.actor.setPosition(d.at);
      d.actor.setRotation(d.rot);
    }
  }
}

function P_BODY(S) { return S.player && S.player.actor && S.player.actor.body; }

/* The world model for a weapon, for the floor and for the shop crate.
   One place that knows which factory builds which id, instead of the
   four-branch chain that had grown in three separate spots. */
function buildWorldWeapon(game, id) {
  const F = {
    obliterator: makeObliterator, mauser: makeMauser, ram: makeBatteringRam,
    shield: makeRiotShield, shieldWorn: makeRiotShield, scatter: makeScattergun,
    sawnoff: makeSawedOff, paralyzer: makeParalyzer, arc: makeArcProjector,
    mp5: makeMP5, remington: makeRemington, killstreak: makeKillStreak,
    mg42: makeMG42, knife: makeKnife, hammer: makeHammer,
  };
  if (F[id]) return F[id](game);
  if (id === 'm1911' || id === 'blaze') {
    const b = game.pistol1911({ physics: false });
    return { root: b, parts: [b].concat((b.partNames || []).map((n) => b[n]).filter(Boolean)) };
  }
  const b = game.thompson({ physics: false });
  return { root: b, parts: [b].concat((b.partNames || []).map((n) => b[n]).filter(Boolean)) };
}

function dropPowerup(game, S, p) {
  const keys = Object.keys(POWERUPS);
  const kind = keys[Math.floor(Math.random() * keys.length)];
  const def = POWERUPS[kind];
  const a = game.box({
    at: [p.x, p.y + 0.15, p.z], size: 0.34, physics: false,
    material: { color: 0x181818, texture: 'smooth', roughness: 0.3, emissive: def.color, emissiveStrength: 1.6 },
  });
  S.powerupActive = { kind, actor: a, t: 20, spin: 0, baseY: p.y + 0.15 };
}

function applyPowerup(game, S, P, hud, sfx) {
  const pu = S.powerupActive;
  const def = POWERUPS[pu.kind];
  sfx.powerup();
  hud.banner(def.label, '#' + def.color.toString(16).padStart(6, '0'));
  if (pu.kind === 'maxammo') {
    for (const id of Object.keys(P.ammo)) { P.ammo[id].mag = WEAPONS[id].mag; P.ammo[id].reserve = WEAPONS[id].reserve; }
    P.nades = GRENADE.max;
    hud.ammo(P);
  } else if (pu.kind === 'blitz') {
    let n = 0;
    for (const z of S.zombies) if (!z.dead) { killZombie(game, S, z, false); n++; }
    S.addPoints(400);
    sfx.blitz();
    if (n >= 6) S.voice(LINES.blitz);
    game.renderer.post.exposureFlash = 1;   // harmless if unsupported
  } else if (pu.kind === 'double') {
    S.mul = 2;
    S.mulT = 30;
  }
  pu.actor.destroy();
  S.powerupActive = null;
}

/* Per-frame zombie brain. */
function updateZombie(game, S, P, z, dt, sfx) {
  if (z.dead || z.parked) return;
  const a = z.actor;
  const pos = a.position;
  const V = z.V;

  z.groanT -= dt;
  if (z.groanT < 0) {
    z.groanT = 2.5 + Math.random() * 4;
    if (dist2d(pos, P.actor.position) < 14) sfx.groan(z.kind === 'runner' ? 0.9 : Math.random() * 0.5);
  }

  /* Burning. Unlike the current this does not stop the body: it keeps
     coming and it keeps cooking, which is the whole character of the
     weapon — you are not buying a stun, you are buying the next five
     seconds' worth of damage in advance. */
  if (z.burnT > 0) {
    z.burnT -= dt;
    hurtZombie(game, S, z, (z.burnDps || 20) * dt, [pos.x, pos.y + 1.0, pos.z], false, 'burn');
    if (z.dead) return;
    if (Math.random() < dt * 26) {
      game.particles.sparks([pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.4 + Math.random() * 1.3, pos.z + (Math.random() - 0.5) * 0.4],
        { count: 2, speed: 1.4, color: 0xffb03a, colorEnd: 0x5a1a06 });
    }
    if (z.burnT <= 0) z.burnDps = 0;
  }

  /* Paralysed. Nothing else in the AI runs — it cannot walk, tear, throw
     or swing — and the current keeps working the whole time. The body is
     not still, though: a rigid corpse reads as a bug, so it shakes on the
     spot and throws arcs off itself. */
  if (z.stunT > 0) {
    z.stunT -= dt;
    a.controller.move(0, 0);
    hurtZombie(game, S, z, STUN.dps * dt, [pos.x, pos.y + 1.0, pos.z], false, 'gold');
    if (z.dead) return;
    const t = S.time * 34 + (z.stunSeed || 0);
    a.visualOffset = a.visualOffset || new window.LE.Vec3(0, 0, 0);
    a.visualOffset.set(Math.sin(t) * 0.030, Math.abs(Math.sin(t * 1.7)) * 0.022, Math.cos(t * 1.3) * 0.030);
    a.controller.facing += Math.sin(t * 0.9) * 0.06;
    z.arcT = (z.arcT || 0) - dt;
    if (z.arcT <= 0) {
      z.arcT = STUN.arcEvery;
      const h = 0.35 + Math.random() * 1.4;
      arcBolt(game,
        [pos.x + (Math.random() - 0.5) * 0.5, pos.y + h, pos.z + (Math.random() - 0.5) * 0.5],
        [pos.x + (Math.random() - 0.5) * 0.9, pos.y + h + (Math.random() - 0.5) * 0.7, pos.z + (Math.random() - 0.5) * 0.9]);
    }
    if (z.stunT <= 0 && a.visualOffset) a.visualOffset.set(0, 0, 0);
    return;
  }

  if (z.vault) {
    const v = z.vault;
    v.t += dt / v.dur;
    const t = Math.min(1, v.t);
    const arc = Math.sin(t * PI_ARC) * 0.6;
    a.body.setPosition({ x: v.from[0] + (v.to[0] - v.from[0]) * t, y: v.from[1] + (v.to[1] - v.from[1]) * t + arc + 1.0, z: v.from[2] + (v.to[2] - v.from[2]) * t });
    a.body.velocity.setScalar(0);
    if (t >= 1) { z.vault = null; z.state = 'hunt'; playZombieAnim(z, z.moveClip, 0.2); }
    return;
  }

  const move = (tx, tz, urgency = 1) => {
    const dx = tx - pos.x, dz = tz - pos.z;
    const d = Math.hypot(dx, dz) || 1e-5;
    a.controller.move(dx / d, dz / d, urgency > 1.2);
  };

  /* Where the zombie thinks the player is. A raised shield does not make
     the player invisible so much as forgettable: the horde keeps walking
     to the last place it saw them and then mills about there. */
  const atBench = !!(S.bench && S.bench.open);
  /* Working at the bench sends them away, not merely off by a few metres.

     The old version scattered their idea of the player by up to two and a
     half metres, which is no distance at all — they milled about on top of
     you, and closing the bench was a coin toss between walking out into a
     clean train and walking out into the middle of the horde. They now walk
     to the far corner of the room, which at this map's size is a good
     thirteen metres and the length of the floor. */
  if (atBench && !S.benchLastKnown) {
    const p = P.actor.position;
    S.benchLastKnown = {
      x: p.x > 0 ? MAP.main.x0 + 1.4 : MAP.main.x1 - 1.4, y: p.y,
      z: p.z > 0 ? MAP.main.z0 + 1.4 : MAP.main.z1 - 1.4,
    };
  } else if (!atBench) S.benchLastKnown = null;
  const target = (S.shieldActive || atBench)
    ? (S.benchLastKnown || S.lastKnown || P.actor.position)
    : P.actor.position;

  if (z.state === 'rising') {
    /* Clawing up out of the ground. Gravity is off for the climb — a capsule
       started below the floor and left to the solver either shoots out or
       jams under it, and neither looks like a body pulling itself free. */
    a.controller.move(0, 0);
    playZombieAnim(z, 'zcrawl', 0.2);
    z.riseT -= dt;
    const k = 1 - Math.max(0, z.riseT) / (RISE_TIME * 1.3);
    const body = a.controller.body;
    body.velocity.setScalar(0);
    body.setPosition({ x: z.riseAt[0], y: 1.1 - RISE_DEPTH * (1 - Math.min(1, k * 1.15)), z: z.riseAt[1] });
    // Spoil thrown up round the shoulders while it works its way out.
    if (Math.random() < 0.35) {
      game.particles.dust([z.riseAt[0] + (Math.random() - 0.5) * 0.7, 0.15,
        z.riseAt[1] + (Math.random() - 0.5) * 0.7], { count: 3, color: 0x4e4436 });
    }
    if (z.riseT <= 0) {
      body.gravityScale = 1;
      body.setPosition({ x: z.riseAt[0], y: 1.1, z: z.riseAt[1] });
      z.state = 'toWindow';
      playZombieAnim(z, z.moveClip, 0.3);
    }
  } else if (z.state === 'toWindow') {
    playZombieAnim(z, z.moveClip);
    const sill = z.win.def.sillAt, ins = z.win.def.inside;
    /* Straight at the sill, standing off it by the length of an arm.

       This used to steer to a fixed blend of the spawn pad and the sill —
       fifteen per cent of the way back toward where it came from. That was
       invisible while the pads sat three metres outside the window. The pads
       are twenty-six to thirty-one metres out in the field now, and fifteen
       per cent of that is four metres of open ground: the walkers crossed
       the whole battlefield, stopped short of the wall, and stood there,
       because the switch into 'tearing' wants to be within 1.5 m of the
       sill and they never got closer than three. */
    const ox = sill[0] - ins[0], oz = sill[2] - ins[2];
    const ol = Math.hypot(ox, oz) || 1;
    move(sill[0] + (ox / ol) * 0.55, sill[2] + (oz / ol) * 0.55);
    if (dist2d(pos, { x: sill[0], z: sill[2] }) < 1.5) { z.state = 'tearing'; z.tearT = 0.8; }
  } else if (z.state === 'tearing') {
    a.controller.move(0, 0);
    // The tear loop runs the whole time it is working at the boards, so the
    // arms are ripping between planks instead of snapping to a pose only on
    // the frame a board actually comes off.
    playZombieAnim(z, 'ztear', 0.22);
    const win = z.win;
    z.tearT -= dt;
    if (z.tearT <= 0) {
      const slot = win.boards.map((b, i) => (b ? i : -1)).filter((i) => i >= 0).pop();
      if (slot == null) {
        win.zombiesAt--;
        sfx.vault();
        /* Both ends in the same space, which they were not.

           The vault interpolates from `from` to `to` and then adds 1.0 to
           the result, because a window's `inside` is a point on the FLOOR
           and a body's position is its centre a metre up -- which is why
           `from` is the body's position minus one. But `to` had the metre
           added to it as well, so it was already in body-centre space when
           the interpolation added another: every zombie that came through
           a window finished its climb standing two metres above the floor
           and then dropped a metre into the room. That is the fifteen
           metres a second the speed trace kept catching on runners,
           crawlers and armoured alike and never on a walker -- not because
           of what they are, but because those are the ones that vault. */
        z.vault = { from: [pos.x, pos.y - 1.0, pos.z], to: [win.def.inside[0], win.def.inside[1], win.def.inside[2]], t: 0, dur: win.def.high ? 1.5 : 0.9 };
        z.state = 'vaulting';
      } else {
        const b = win.boards[slot];
        win.boards[slot] = null;
        sfx.tear();
        /* The plank goes where the hands went. Throwing it in a random
           direction reads as the board exploding off the wall; throwing it
           along the line from the window to the zombie reads as being torn
           off by the thing standing there. */
        const bp = b.position;
        const dx = pos.x - bp.x, dy = (pos.y + 0.6) - bp.y, dz = pos.z - bp.z;
        const dl = Math.hypot(dx, dy, dz) || 1;
        const yank = 3.4 + Math.random() * 1.6;
        S.debris.push({
          actor: b,
          vel: [dx / dl * yank + (Math.random() - 0.5) * 0.8,
                dy / dl * yank + 1.6,
                dz / dl * yank + (Math.random() - 0.5) * 0.8],
          spin: (Math.random() - 0.5) * 12, t: 1.6,
        });
        game.particles.dust([b.position.x, b.position.y, b.position.z], { count: 5, color: 0x7d5c36 });
        z.tearT = 2.1;
      }
    }
  } else if (z.state === 'hunt') {
    const zr = roomOf(pos), pr = roomOf(target);
    const d = dist2d(pos, target);

    /* Throwers hold a firing line rather than closing — and each throw
       starts with tearing the ammunition out of themselves, which is a real
       animation with a real cost, not a chunk appearing in a hand. */
    if (V.ranged && zr === pr && !S.shieldActive) {
      const R = V.ranged;
      if (z.ripT > 0) {                      // mid-rip: the hand is in the wound
        a.controller.move(0, 0);
        z.ripT -= dt;
        if (z.ripT <= 0) releaseChunk(game, S, z, sfx);
        return;
      }
      if (z.throwT > 0) {                    // chunk in hand, arm winding back
        a.controller.move(0, 0);
        z.throwT -= dt;
        if (z.throwT <= 0) {
          throwChunk(game, S, z, P, R, sfx, z.ripFace);
          // The face is the one they do not survive — but they get it away
          // first, which is the whole reason it is worth dodging.
          if (z.ripFace) killZombie(game, S, z, false);
        }
        return;
      }
      z.spitT -= dt;
      if (d < R.range && d > R.minRange) {
        a.controller.move(0, 0);
        playZombieAnim(z, 'zidle', 0.2);
        if (z.spitT <= 0 && hasLineOfSight(game, z, P)) {
          z.spitT = R.cooldown;
          beginRip(game, S, z, sfx);
        }
        return;
      }
      if (d <= R.minRange) {                 // too close — back off
        move(pos.x * 2 - target.x, pos.z * 2 - target.z);
        playZombieAnim(z, z.moveClip);
        return;
      }
    }

    if (zr === pr) {
      /* Same room, and now with something between you and them.

         Straight at the player is right until the bench, the crates, the
         counter or the rock is in the way — then it is a body pressing into
         a wall for the rest of the round, which is what "they do not find a
         route" looked like. Walk the direct line when it is clear, and put
         a path round the obstacle when it is not. The path is recomputed
         only when the player has moved a metre and a half or the old one has
         gone stale, so a room full of them is not a room full of searches. */
      const nav = S.nav && (zr === 'roof' ? S.nav.roof : S.nav.ground);
      let tx = target.x, tz = target.z;
      if (nav && d > 1.6) {
        const straight = navClear(nav, pos, target);
        if (straight) { z.navPath = null; }
        else {
          const stale = !z.navPath || (z.navAt == null) || (S.time - z.navAt > 0.7)
            || dist2d(z.navFor || { x: 1e9, z: 0 }, target) > 1.5;
          if (stale) {
            z.navPath = navPath(nav, pos, target);
            z.navAt = S.time;
            z.navFor = { x: target.x, z: target.z };
            z.navIdx = 0;
          }
          const path = z.navPath;
          if (path && path.length) {
            let wp = path[Math.min(z.navIdx, path.length - 1)];
            if (dist2d(pos, { x: wp[0], z: wp[2] }) < 0.55) {
              z.navIdx = Math.min(z.navIdx + 1, path.length - 1);
              wp = path[z.navIdx];
            }
            tx = wp[0]; tz = wp[2];
          }
        }
      } else z.navPath = null;
      /* Runs because it is a runner, not because its speed happens to be
         over a number. The threshold was 2.4, which slowing the runners
         down would have quietly dropped half of them back to a walk. */
      move(tx, tz, (V.run || V.boss) ? 2 : 1);
      playZombieAnim(z, z.moveClip);
      z.attackT -= dt;
      if (!S.shieldActive && d < PLAYER.attackRange && z.attackT <= 0 && Math.abs(pos.y - P.actor.position.y) < 1.6) {
        z.attackT = PLAYER.attackCooldown;
        /* Each kind strikes its own way — the walkers grab, the runners
           bite, the crawler rakes at your ankles, and the heavy ones bring
           both arms over. A variant with more than one takes turns, so a
           crowd of walkers is not one animation played twelve times. */
        const set = (z.V && z.V.attack) || ['zattack'];
        z.atkIdx = ((z.atkIdx || 0) + 1) % set.length;
        playZombieAnim(z, set[z.atkIdx], 0.05);
        z.anim = '';
        hurtPlayer(game, S, P, z.dmg, sfx, 'melee', pos);
      }
    } else {
      /* Walk the route in order and remember where you are on it.

         The old picker re-derived the waypoint every frame from distance:
         take the first one further than 0.9 m away and within 1.8 m of your
         height. On a staircase the body sits almost exactly 0.9 m from the
         foot of the flight, so one frame it was 0.97 away and the answer was
         "go back to the bottom", the next it was 0.85 and the answer was "go
         to the top" — and it stood there rocking on the third step until the
         round ended. Waypoints advance and never go back. */
      const route = routeTo(zr, pr, S);
      const key = zr + '>' + pr;
      if (z.routeKey !== key) { z.routeKey = key; z.wpIdx = 0; }
      let wp = route[Math.min(z.wpIdx, route.length - 1)];
      if (wp && dist2d(pos, { x: wp[0], z: wp[2] }) < 1.3) {
        z.wpIdx = Math.min(z.wpIdx + 1, route.length - 1);
        wp = route[z.wpIdx];
      }
      if (wp) move(wp[0], wp[2]); else move(target.x, target.z);
      playZombieAnim(z, z.moveClip);
    }

    if (z.lastPos != null) {
      const moved = dist2d(pos, z.lastPos);
      z.stuckT = moved < 0.02 ? z.stuckT + dt : 0;
      if (z.stuckT > 1.6) { a.body.velocity.x += (Math.random() - 0.5) * 4; a.body.velocity.z += (Math.random() - 0.5) * 4; z.stuckT = 0; }
    }
    z.lastPos = { x: pos.x, z: pos.z };
  }

  /* The shield runs on a clock: up for a while, then gone for thirty-two
     seconds whether it broke or simply timed out. He cannot hide behind it
     for the whole fight, and that gap is the fight. */
  if (z.boss) {
    if (z.bUp > 0) {
      z.bUpT -= dt;
      if (z.bUpT <= 0) { z.bUp = 0; z.bCd = BOSS.shieldCd; }
    } else {
      z.bCd -= dt;
      if (z.bCd <= 0) { z.bUp = 1; z.bUpT = BOSS.shieldUp; z.bShield = BOSS.shieldHp; }
    }
    if (z.bossShield) {
      for (const q of z.bossShield.parts) q.visible = z.bUp > 0;
    }
  }

  /* A runner is trying to remember how this used to work. Most of the time
     it does not, and runs on the disorderly clip. Every few seconds
     something lands and it sprints properly for a moment — faster, cleaner,
     head over its feet — and then it comes apart again. */
  if (V.run && z.state === 'hunt' && !z.legless) {
    z.lucidT -= dt;
    if (z.lucidT <= 0) {
      if (z.lucid > 0) { z.lucid = 0; z.lucidT = 3.5 + Math.random() * 5; }
      else { z.lucid = 1; z.lucidT = 1.4 + Math.random() * 2.2; }
      /* Lucid is the clean sprint with the arm released; the rest of the
         time it is back on its own clip -- the runner's held arm, the
         armoured one's laden run. Falling back to 'zrun' matters only
         for a variant that names no clip of its own. */
      z.moveClip = z.lucid ? 'zrun_human' : (V.clip || 'zrun');
      // The remembered sprint is a real one, and it closes ground faster.
      const boost = z.lucid ? 1.22 : 1;
      z.actor.controller.moveSpeed = z.speed * boost;
      z.actor.controller.runSpeed = z.speed * 1.35 * boost;
      if (z.anim === 'zrun' || z.anim === 'zrun_human' || z.anim === 'zrun_hold') {
        playZombieAnim(z, z.moveClip, 0.22);
      }
    }
  }

  if (z.actor.animator) z.actor.animator.speed = V.clipSpeed * (z.lucid ? 1.05 : 1);

  for (const other of S.zombies) {
    if (other === z || other.dead || other.parked) continue;
    const d = dist2d(pos, other.actor.position);
    if (d < 0.62 && d > 1e-4) {
      const push = (0.62 - d) * 2.4;
      a.body.velocity.x += (pos.x - other.actor.position.x) / d * push;
      a.body.velocity.z += (pos.z - other.actor.position.z) / d * push;
    }
  }
}

const PI_ARC = Math.PI;

function hasLineOfSight(game, z, P) {
  const a = z.actor.position, b = P.actor.position;
  const dx = b.x - a.x, dy = (b.y + 0.2) - (a.y + 0.6), dz = b.z - a.z;
  const L = Math.hypot(dx, dy, dz) || 1;
  const hit = game.raycast([a.x, a.y + 0.6, a.z], [dx / L, dy / L, dz / L], L + 0.2,
    (bd) => bd !== z.actor.body && !bd.isTrigger && !(bd.userData && bd.userData.bulletPassthrough));
  return !hit || hit.body === P.actor.body;
}

/* A thrown clot of something that used to be inside it. Travels as a real
   projectile so it can be dodged, blocked by geometry, and stopped dead by
   the Deflect perk. */
/* Reach in and take hold. The chunk does not exist yet — it comes free
   partway through the clip, which is what releaseChunk is waiting for. */
function beginRip(game, S, z, sfx) {
  const face = z.ripStage >= RIP.bodyThrows;
  z.ripFace = face;
  z.ripT = face ? RIP.faceTime : RIP.bodyTime;
  playZombieAnim(z, face ? 'zripface' : 'zrip', 0.07);
  z.anim = '';                          // one-shot: the next state retakes the bones
  sfx.tear();
  sfx.groan(face ? 0.9 : 0.4);
}

/* The chunk comes away: the hole it came out of opens for good and the body
   pays for it. The arm is still holding the thing — the throw is the next
   beat, so the chunk is visibly in a hand before it is in the air. */
function releaseChunk(game, S, z, sfx) {
  z.ripT = 0;
  if (z.dead) return;
  const face = z.ripFace;
  const w = z.wounds[Math.min(z.ripStage, z.wounds.length - 1)];
  const p = z.actor.position;
  if (w) {
    w.shown = true;
    w.rim.visible = true;
    w.cavity.visible = true;
    // Deep enough now that there is something white in it.
    if (face || z.ripStage >= RIP.boneFrom) { w.boneShown = true; w.bone.visible = true; }
  }
  game.particles.sparks([p.x, p.y + (face ? 1.42 : 0.95), p.z],
    { count: face ? 14 : 9, speed: 2.4, color: 0x8a1a12, colorEnd: 0x2a0705 });
  z.ripStage++;
  // Never fatal on its own: the flank costs them, the face finishes them.
  if (!face) z.hp = Math.max(1, z.hp - z.maxHp * RIP.selfCost);
  z.throwT = RIP.throwTime;
  playZombieAnim(z, 'zspit', 0.08);
  z.anim = '';
}

function throwChunk(game, S, z, P, R, sfx, face) {
  const from = { x: z.actor.position.x, y: z.actor.position.y + 0.95, z: z.actor.position.z };
  const to = P.actor.position;
  const dx = to.x - from.x, dz = to.z - from.z;
  const flat = Math.hypot(dx, dz) || 1;
  const grav = R.grav || 19.6;
  const t = flat / R.speed;
  // Lead the arc so it lands where the player is, not where they were.
  const vy = (to.y - from.y) / t + 0.5 * grav * t;
  // Meat, not a glowing pip: dark and wet, with only enough sick green in
  // the emissive to stay legible crossing an unlit bunker.
  const proj = game.sphere({
    at: [from.x, from.y, from.z], radius: face ? 0.15 : 0.115, physics: false,
    material: { color: 0x4a1410, texture: 'smooth', roughness: 0.28,
      emissive: 0x54831e, emissiveStrength: face ? 1.2 : 0.8 },
  });
  proj.scale.x *= 1.3; proj.scale.z *= 0.78;     // a torn lump, not a ball
  S.projectiles.push({
    actor: proj, vel: [dx / flat * R.speed, vy, dz / flat * R.speed],
    dmg: R.dmg * (face ? RIP.faceDmg : 1),
    splash: R.splash * (face ? RIP.faceSplash : 1),
    grav, spin: (Math.random() - 0.5) * 11, rot: 0, life: 5,
  });
  sfx.spit();
}

/* Putting the weapon down and stepping away from the bench.

   You have been standing still with your back to the room; the ten seconds
   are the game's half of that bargain. Nothing can touch you and you can
   shoot the whole time, which is long enough to get moving and start a
   train rather than to be caught flat-footed against the wall you were
   working at. */
const BENCH_GRACE = 10;

function closeBench(S, sfx) {
  if (!S.bench || !S.bench.open) return;
  S.bench.open = false;
  S.grace = BENCH_GRACE;
  if (sfx && sfx.graceStart) sfx.graceStart();
  if (S.bark) S.bark('grace', true);
}

function hurtPlayer(game, S, P, dmg, sfx, kind, from) {
  // Working at the bench means you are not there as far as the horde is
  // concerned. Anything already swinging when you opened it misses too.
  if (S.bench && S.bench.open) return;
  // And for ten seconds after, while you get clear of the corner.
  if (S.grace > 0) return;
  if (!P.alive || S.godMode) return;
  if (P.shieldT > 0) return;                                   // nothing gets through
  if (kind === 'projectile' && P.perks.deflect) { sfx.deflect(); return; }
  /* A raised riot shield stops what comes at its face. Only from the front:
     the whole trade is that holding it costs you your back and half your
     speed. */
  if (P.blocking && P.blockT > 0.55 && from) {
    const pp = P.actor.position;
    const dx = from.x - pp.x, dz = from.z - pp.z;
    const d = Math.hypot(dx, dz) || 1;
    const fwd = game.camera ? { x: game.camera.target.x - game.camera.position.x, z: game.camera.target.z - game.camera.position.z } : null;
    if (fwd) {
      const fl = Math.hypot(fwd.x, fwd.z) || 1;
      if (((dx / d) * (fwd.x / fl) + (dz / d) * (fwd.z / fl)) > SHIELD_BLOCK.arc) {
        sfx.shieldBlock();
        return;
      }
    }
  }
  P.hp -= dmg;
  P.lastHit = S.time;
  P.regenning = false;
  sfx.hurt();
  // The character, not the HUD. A different grunt each time and not one
  // every single hit, so a crowd does not turn him into a metronome.
  if (Math.random() < 0.55) sfx.playerGrunt(P.hp / P.maxHp, S.hero && S.hero().voice);

  /* Flinch. The head goes away from whatever hit it and rolls with the
     blow, then comes back — the roll is what makes it read as being struck
     rather than as the camera being nudged. It goes through the recoil
     system, so it is taken back off the player's aim next frame instead of
     stealing it. */
  {
    const mag = Math.min(1, dmg / 45);
    let side = (Math.random() - 0.5) * 2;
    if (from && game.camera) {
      const pp = P.actor.position;
      const dx = from.x - pp.x, dz = from.z - pp.z;
      const dl = Math.hypot(dx, dz) || 1;
      const fw = { x: game.camera.target.x - game.camera.position.x, z: game.camera.target.z - game.camera.position.z };
      const fl = Math.hypot(fw.x, fw.z) || 1;
      // Cross product's y: positive when the blow came from the left.
      side = ((fw.z / fl) * (dx / dl) - (fw.x / fl) * (dz / dl));
    }
    if (S.toggles.flinch) {
      const deg = Math.PI / 180;
      P.recoil.pitch += (2.6 + mag * 5.0) * deg;
      P.recoil.yaw += side * (3.0 + mag * 5.5) * deg;
      P.flinchRoll = (P.flinchRoll || 0) - side * (2.4 + mag * 4.0) * deg;
    }
  }
  // A single frame of white-hot red, on top of the standing wound vignette.
  S.hud.hitFlash(Math.min(1, 0.35 + dmg / 60));
  S.hud.damage(P.hp / P.maxHp);
  const lowAt = PLAYER.lowAt;   // absolute, so it means the same to a Supersoldier
  if (P.hp <= lowAt && P.hp + dmg > lowAt) { S.voice(LINES.nearDeath); S.bark('lastStand', true); }
  if (P.hp <= 0) {
    P.alive = false;
    S.gameOver = true;
    closeCrate(S);
    document.exitPointerLock && document.exitPointerLock();
    S.bark('death', true);
    S.voice(LINES.gameOver, true);
    S.hud.gameOver(S.round, S.killsTotal);
  }
}

/* A grenade in the air: thrown along the look vector, bounces off whatever
   it hits, and goes off on its fuse rather than on contact. */
function throwGrenade(game, S, P, sfx) {
  if (P.nades <= 0 || !P.alive) return;
  P.nades--;
  const cam = game.camera;
  const f = _vTmp1.copy(cam.target).sub(cam.position).normalize();
  const a = game.sphere({
    at: [cam.position.x + f.x * 0.45, cam.position.y + f.y * 0.45 - 0.08, cam.position.z + f.z * 0.45],
    radius: 0.055, physics: false,
    material: { color: 0x3f4a33, texture: 'metal', roughness: 0.62, metalness: 1 },
  });
  S.grenades.push({
    actor: a, t: GRENADE.fuse, spin: 9,  rot: 0,
    vel: [f.x * GRENADE.throwSpeed, f.y * GRENADE.throwSpeed + 2.2, f.z * GRENADE.throwSpeed],
  });
  sfx.magRelease();
}

/* Take a zombie's legs off. It keeps its health and its points value; it
   simply cannot stand up any more. The shins are collapsed on the skeleton
   rather than the mesh being rebuilt, so it costs nothing and the crawl
   clip drives what is left. */
function makeCrawler(game, S, z) {
  if (z.dead || z.legless) return;
  z.legless = true;
  z.kind = 'crawler';
  z.V = VARIANTS.crawler;
  z.moveClip = 'zcrawl';
  z.anim = '';
  z.speed = VARIANTS.crawler.speed[0] + Math.random() * (VARIANTS.crawler.speed[1] - VARIANTS.crawler.speed[0]);
  z.actor.controller.moveSpeed = z.speed;
  z.actor.controller.runSpeed = z.speed;
  z.actor.controller.height = VARIANTS.crawler.height;
  const sk = z.actor.skeleton;
  if (sk) for (const n of ['lowerLegL', 'lowerLegR']) {
    const b = sk.bone(n);
    if (b) b.localScale.set(0.02, 0.02, 0.02);
  }
  const p = z.actor.position;
  game.particles.sparks([p.x, p.y + 0.2, p.z], { count: 18, speed: 4.2, color: 0x8a1a12, colorEnd: 0x2c0605 });
  for (let i = 0; i < 2; i++) {
    game.box({
      at: [p.x + (Math.random() - 0.5) * 0.4, p.y + 0.25, p.z + (Math.random() - 0.5) * 0.4],
      size: [0.10, 0.30, 0.10], material: { color: 0x5a120c, texture: 'smooth', roughness: 0.7 },
      lifetime: 2.4, velocity: [(Math.random() - 0.5) * 4, 2.2 + Math.random() * 2, (Math.random() - 0.5) * 4],
    });
  }
  playZombieAnim(z, 'zcrawl', 0.12);
}

function detonate(game, S, P, at, sfx) {
  // A grenade kill belongs to the grenade, not to whatever is in your hands.
  S.creditWeapon = 'grenade';
  game.particles.sparks(at, { count: 42, speed: 9, color: 0xffd27a, colorEnd: 0x5a1e08 });
  game.particles.smoke(at, { count: 14, color: 0x4a4640 });
  const fl = game.light({ at, color: 0xffca7a, intensity: 26, range: 11 });
  fl._decay = 0.09;
  sfx.blast();
  game.audio.impact(1);
  for (const z of S.zombies) {
    if (z.dead || z.parked) continue;
    const p = z.actor.position;
    const d = Math.hypot(p.x - at[0], p.y + 0.9 - at[1], p.z - at[2]);
    if (d > GRENADE.outerRadius) continue;
    const fall = Math.pow(1 - d / GRENADE.outerRadius, 1.5);
    const dmg = d < GRENADE.killRadius ? 1e6 : GRENADE.damage * fall;
    hurtZombie(game, S, z, dmg, [p.x, p.y + 0.9, p.z], false, 'blast');
    if (!z.dead && d < GRENADE.legRadius) makeCrawler(game, S, z);
  }
  const pp = P.actor.position;
  const pd = Math.hypot(pp.x - at[0], pp.y - at[1], pp.z - at[2]);
  if (pd < GRENADE.playerRadius) {
    hurtPlayer(game, S, P, GRENADE.playerDamage * (1 - pd / GRENADE.playerRadius), sfx, 'blast');
  }
}

/* Roll the workshop for this match: what is on the shelf, what he is
   asking, and what he is willing to give you back. */
function rollShop(S) {
  const sh = S.shop;
  if (!sh) return;
  if (!sh) return;
  const pool = SHOP.guns.slice();
  sh.stock = [];
  for (let k = 0; k < SHOP.stockSize && pool.length; k++) {
    sh.stock.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  for (const id of SHOP.guns) {
    const base = ECONOMY.wallGun;
    sh.prices[id] = Math.round(base * (SHOP.markup[0] + Math.random() * (SHOP.markup[1] - SHOP.markup[0])) / 50) * 50;
    sh.buyback[id] = Math.round(base * (SHOP.buybackLow + Math.random() * (SHOP.buybackHigh - SHOP.buybackLow)) / 50) * 50;
  }
}

/* Something he does not want down here. The turrets do not negotiate. */
function shopTurrets(game, S, dt, sfx) {
  const sh = S.shop;
  if (!sh) return;
  for (const z of S.zombies) {
    if (z.dead || z.parked) continue;
    const p = z.actor.position;
    if (p.y > sh.room.y1 || p.y < sh.room.y0 - 1) continue;
    if (p.x < sh.room.x0 || p.x > sh.room.x1 + 1.2) continue;
    for (const t of sh.turrets) {
      game.particles.sparks([p.x, p.y + 1.1, p.z], { count: 6, speed: 7, color: 0xffe08a, colorEnd: 0x7a3a10 });
      void t;
    }
    hurtZombie(game, S, z, SHOP.turretDps * dt, [p.x, p.y + 1.0, p.z], false, 'gold');
    if (Math.random() < 0.2) sfx.hitmark();
  }
  void dt;
}

/* ---------------- graphics ----------------

   One function applies a whole preset, and it is the only thing that
   writes the renderer's tier or hides scenery, so what you see always
   matches what the menu says. Called on boot from whatever was saved, and
   again every time somebody picks a line. */
function applyGraphics(game, S, key) {
  const g = GRAPHICS[key];
  if (!g) return;
  S.settings.current = key;
  game.renderer.setQuality(g.tier);
  game.renderer.resize(game.canvas.clientWidth, game.canvas.clientHeight);
  game.renderer.post.bloom = (g.tier === 'low' || g.tier === 'retro') ? 0
    : (S.baseBloom != null ? S.baseBloom : game.renderer.post.bloom);
  /* Retro wants its pixels hard. The canvas is a quarter of the display
     and the browser would smooth it back up into mush without this, which
     would be the one thing the tier exists to avoid. */
  game.canvas.style.imageRendering = g.tier === 'retro' ? 'pixelated' : '';
  S.fpsCap = game.renderer.quality.fpsCap || 0;

  if (S.detail) {
    for (const a of S.detail.far) a.visible = g.far;
    for (const a of S.detail.smoke) a.visible = g.smoke;
  }
  /* Lamps past the budget are switched off rather than dimmed. Only Low
     has a budget worth having: the renderer already uploads the eight
     nearest the camera every frame, so culling further up the range takes
     light out of rooms for nothing — which on a map with a dozen lamps
     leaves whole corners black. */
  if (S.lamps) {
    S.lamps.forEach((L, k) => {
      L.off = k >= g.lamps;
      if (L.light) L.light.intensity = L.off ? 0 : (L.full || L.light.intensity);
    });
  }
  S.particleScale = g.particles;
  try { localStorage.setItem('b9.graphics', key); } catch (e) { void e; }
}

/* ---------------- the meteorite ----------------

   Three states. It waits somewhere out past the atmosphere until its round
   comes up; it falls, which takes four seconds of rising whistle and ends
   in a bang you feel; and then it is down, dead, until somebody puts a
   round into it. Nothing tells the player that last part except the rock
   itself, which sits there doing nothing until it is hit. */
/* Punch the hole. Called once, when the rock lands.
 *
 * The concrete does not simply vanish: the patch is broken into chunks that
 * fall into the wing, which is what a two-tonne rock going through a roof
 * does and is also the difference between a hole appearing and a hole
 * having been made. Guarded so a second call cannot double the debris. */
function openRoofHole(game, S) {
  const R = S.roofHole;
  if (!R || R.open) return;
  R.open = true;
  if (R.patch) {
    /* Break it up if the engine can, and take it away either way -- a
       fracture that fails must not leave the roof intact. */
    try { game.shatter(R.patch, { pieces: 14, point: R.at, impulse: 6 }); } catch (e) { void e; }
    if (R.patch.destroy) { try { R.patch.destroy(); } catch (e) { void e; } }
  }
  for (const w of R.edge) w.visible = true;
  R.shaft.intensity = 26;
  // Dust off the broken edge, falling rather than blowing out.
  game.particles.dust([R.at[0], R.at[1] - 0.4, R.at[2]], { count: 46, speed: 2.4, color: 0x6b6154 });
}

function updateMeteor(game, S, P, hud, sfx, dt) {
  const m = S.meteor;
  if (!m) return;

  if (m.state === 'waiting') {
    if (S.started && S.round >= m.round && S.alive !== false) {
      m.state = 'falling';
      m.fall = 4.0;
      if (LINES.meteorFall) S.voice(LINES.meteorFall);
      S.bark('meteor', true);
      hud.banner('SOMETHING IS COMING DOWN', '#ff7a2a');
      if (sfx.incoming) sfx.incoming();
    }
    return;
  }

  if (m.state === 'falling') {
    m.fall -= dt;
    // The shake builds the whole way down, so the impact is the end of
    // something rather than a single jolt out of nowhere.
    const u = 1 - Math.max(0, m.fall) / 4.0;
    addShake(S, 0.004 + u * u * 0.016, 0.12);
    if (m.fall <= 0) {
      m.state = 'down';
      for (const q of m.parts) q.visible = true;
      m.glow.intensity = 30;
      addShake(S, 0.16, 1.5);
      game.audio.impact(1.0);
      if (sfx.powerOn) sfx.powerOn();
      const H = MAP.hole;
      /* And NOW there is a hole in the roof. The slab over the impact point
         goes, the torn edge appears, and the daylight comes on -- so the
         banner is describing something that just happened rather than
         pointing at a hole that has been there all night. */
      openRoofHole(game, S);
      game.particles.sparks([H.x, 1.2, H.z], { count: 90, speed: 14, color: 0xffb060, colorEnd: 0x40180a });
      game.particles.smoke([H.x, 1.6, H.z], { count: 40, speed: 3.2, color: 0x3a3128 });
      hud.banner('IT CAME THROUGH THE ROOF', '#ff7a2a');
    }
    return;
  }

  // Down. The seams breathe, and the light with them.
  const b = 0.72 + Math.sin((S.time || 0) * 1.7) * 0.28;
  m.glow.intensity = (m.armed ? 34 : 18) * b;

  // The rings fall into each other, each faster than the one outside it.
  const V = S.vortex;
  if (V && V.open) {
    V.t += dt;
    for (const r of V.rings) {
      r.a.setRotation([r.tilt + Math.sin(V.t * 0.7) * 3, r.spin * V.t * 57.2958, 0]);
    }
    V.light.intensity = 14 + Math.sin(V.t * 2.3) * 5;
    if (Math.random() < 0.25) {
      game.particles.sparks([V.at[0], V.at[1] + 0.1, V.at[2]],
        { count: 2, speed: 1.6, color: 0x9a6aff, colorEnd: 0x1a0a3a });
    }
  }

  /* The thing in the hole does the work.
   *
   * Four beats over the three seconds the upgrade takes: it comes up out of
   * the vortex, it takes the weapon, it goes back down with it, and it
   * comes back up holding it. The gun is genuinely off the player for the
   * whole of it -- that is the cost of the thing, along with the points,
   * and it only reads as a cost if your hands are actually empty. */
  if (m.busy) {
    m.timer -= dt;
    const A = S.alien;
    const done = 1 - Math.max(0, Math.min(1, m.timer / 3.0));
    if (A) {
      if (!A.visible) { A.visible = true; for (const q of A.parts) q.visible = true; }
      /* Up, hold, down, up. Rising out of a hole and sinking back into it
         is one number: how far above the floor it is. */
      const rise = done < 0.22 ? done / 0.22
        : done < 0.42 ? 1
          : done < 0.62 ? 1 - (done - 0.42) / 0.20 * 1.35
            : done < 0.80 ? -0.35
              : Math.min(1, -0.35 + (done - 0.80) / 0.20 * 1.35);
      const y = V ? V.at[1] - 0.42 + rise * 0.95 : 1;
      A.root.setPosition([V ? V.at[0] : 0, y, V ? V.at[2] : 0]);
      /* Facing you while it works, rather than spinning on the spot. */
      const pp = S.player && S.player.actor ? S.player.actor.position : null;
      const fy = pp ? Math.atan2(pp.x - (V ? V.at[0] : 0), pp.z - (V ? V.at[2] : 0)) * 57.2958 : 0;
      A.root.setRotation([0, fy + Math.sin(done * 4.0) * 5, 0]);
      /* And the arms do the work.
       *
       * Five beats, and the weapon is in its hands for four of them: up
       * out of the hole with the arms hanging; reaching out and closing on
       * the gun; carrying it in against the chest and down; coming back up
       * with it; holding it out to you. The gun is parented to a holder
       * between its two hands, so it goes exactly where they go rather
       * than being placed near them each frame -- which is what made it
       * read as floating beside the alien instead of being carried. */
      const segA = (a2, b2) => Math.max(0, Math.min(1, (done - a2) / (b2 - a2)));
      if (done < 0.20) alienPose(A, 'down', 'down', 0);
      else if (done < 0.32) alienPose(A, 'down', 'reach', segA(0.20, 0.32));
      else if (done < 0.44) alienPose(A, 'reach', 'carry', segA(0.32, 0.44));
      else if (done < 0.86) alienPose(A, 'carry', 'carry', 0);
      else alienPose(A, 'carry', 'offer', segA(0.86, 1.00));
      if (m.display && !m.parented && A.hold) {
        for (const q of m.display) { q.parent = A.hold; q.setPosition([0, 0, 0]); }
        m.parented = true;
      }
    }
    if (Math.random() < 0.5) {
      game.particles.sparks([V ? V.at[0] : m.slot[0], (V ? V.at[1] : m.slot[1]) + 0.2, V ? V.at[2] : m.slot[2]],
        { count: 3, speed: 4, color: 0x9a6aff, colorEnd: 0x1a0a3a });
    }
    if (m.timer <= 0) {
      m.busy = false;
      m.holding = m.pending;
      m.pending = null;
      addShake(S, 0.05, 0.5);
      game.audio.impact(0.6);
      hud.banner('IT IS HOLDING IT OUT TO YOU', '#9a6aff');
    }
  } else if (S.alien && S.alien.visible && !m.holding) {
    // Back down the hole once nobody needs it.
    const A = S.alien;
    const p = A.root.position;
    const floor = (S.vortex ? S.vortex.at[1] : 0.6) - 0.9;
    // Arms back down as it sinks, so it does not go under still offering.
    alienPose(A, 'offer', 'down', 1);
    if (p.y > floor) A.root.setPosition([p.x, p.y - dt * 0.9, p.z]);
    else { A.visible = false; for (const q of A.parts) q.visible = false; }
  }
}

/* ---------------- the minigun ----------------

   Runs itself. It picks the nearest body inside its arc, turns onto it,
   spins up, and then spends rounds — as many as the elapsed time says it
   owes, because at fifty a second the gun fires faster than the game
   draws and one shot per frame would quietly make it a rifle. */
function updateMinigun(game, S, P, hud, sfx, dt) {
  const mg = S.minigun;
  if (!mg) return;
  if (mg.cool > 0) mg.cool = Math.max(0, mg.cool - dt);
  if (mg.t <= 0) {
    // Wind down.
    mg.spinUp = Math.max(0, mg.spinUp - dt * 0.8);
    mg.lamp.intensity = 0;
    if (mg.spinUp > 0) {
      mg.spin += dt * MINIGUN.spin * mg.spinUp;
      mg.cluster.setRotation([mg.spin * 57.2958, 0, 0]);
    }
    return;
  }

  const was = mg.t;
  mg.t -= dt;
  if (mg.t <= 0) {
    mg.t = 0; mg.cool = MINIGUN.cool; mg.target = null;
    hud.banner('MINIGUN DRY', '#8a8272');
    return;
  }
  // Ten seconds out, the lamp starts blinking.
  const blink = mg.t < 10 ? (Math.floor(mg.t * 4) % 2 === 0 ? 1 : 0.2) : 1;
  mg.lamp.intensity = 26 * blink;
  void was;

  /* Pick a target: nearest live body inside the arc and range, measured
     from the mount rather than from the player. */
  const M = mg.mount;
  let best = null, bestD = Infinity;
  for (const z of S.zombies) {
    if (z.dead || z.parked) continue;
    const zp = z.actor.position;
    const dx = zp.x - M[0], dz = zp.z - M[2];
    const d = Math.hypot(dx, dz);
    if (d > MINIGUN.range) continue;
    // It looks out over the north face; it will not shoot into its own roof.
    const ang = Math.atan2(dz, dx);
    let rel = ang - (-Math.PI / 2);
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) > MINIGUN.arc) continue;
    if (d < bestD) { bestD = d; best = z; }
  }
  mg.target = best;

  // Turn onto it, and spin up only while there is something to shoot.
  if (best) {
    const zp = best.actor.position;
    const want = Math.atan2(zp.z - M[2], zp.x - M[0]);
    let diff = want - mg.aim;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    mg.aim += diff * Math.min(1, dt * 6);
    mg.spinUp = Math.min(1, mg.spinUp + dt * 1.6);
  } else {
    mg.spinUp = Math.max(0, mg.spinUp - dt * 0.9);
  }
  mg.yoke.setRotation([0, -mg.aim * 57.2958 - 90, 0]);
  mg.spin += dt * MINIGUN.spin * mg.spinUp;
  mg.cluster.setRotation([mg.spin * 57.2958, 0, 0]);

  if (!best || mg.spinUp < 0.65) return;

  /* Spend the rounds the clock says are due. Capped per frame so a hitch
     cannot dump a whole magazine into one body in a single step. */
  mg.owed += dt * (MINIGUN.rpm / 60) * mg.spinUp;
  const shots = Math.min(Math.floor(mg.owed), 90);
  if (shots <= 0) return;
  mg.owed -= shots;
  const zp = best.actor.position;
  const muzzle = [M[0] + Math.cos(mg.aim) * 0.55, M[1] + 0.62, M[2] + Math.sin(mg.aim) * 0.55];
  hurtZombie(game, S, best, MINIGUN.dmg * shots, [zp.x, zp.y + 1.0, zp.z], false, 'bullet');
  S.addPoints(Math.round(ECONOMY.hit * 0.15 * shots));
  if (best.dead) S.addPoints(ECONOMY.kill);
  // One flash and one burst of sparks a frame, however many rounds went.
  game.particles.sparks(muzzle, { count: 4, speed: 9, color: 0xffd27a, colorEnd: 0x6a2a08 });
  game.particles.sparks([zp.x, zp.y + 1.0, zp.z], { count: 3, speed: 3, color: 0x7a1610, colorEnd: 0x2c0605 });
  mg.flash = mg.flash || game.light({ at: muzzle, color: 0xffc061, intensity: 0, radius: 6 });
  mg.flash.position.set(muzzle[0], muzzle[1], muzzle[2]);
  mg.flash.intensity = 70;
  if (!mg.sfxT || mg.sfxT <= 0) { sfx.shotSmg(); mg.sfxT = 0.05; }
  mg.sfxT -= dt;
}

/* A shot that goes into the rock wakes it up. Checked against the shot's
   own ray rather than against the physics world, because the rock is a
   dozen static spheres and any one of them is a hit. */
/* What is inside the rock.
 *
 * The rock used to "wake up" -- a banner, a shake, and its seams glowing a
 * bit brighter -- and then work like a machine with a cradle on it. Nothing
 * ever came out. This cracks it open properly: the shell breaks, and what
 * is underneath is a hole that is not a hole in anything, with something
 * living in it.
 *
 * The vortex is five rings falling into each other, each turning faster
 * than the one outside it and each a little darker, over a hole that is
 * simply black. Nothing about it is a texture -- it is depth done with
 * geometry, because a flat disc with a swirl painted on it reads as a
 * sticker on the floor from any angle but straight down. */
function buildVortex(game, S) {
  const H = MAP.hole;
  const at = [H.x, 0.72, H.z];
  const rings = [];
  for (let k = 0; k < 5; k++) {
    const f = k / 4;
    const r = 1.05 - f * 0.72;
    const a = game.torus
      ? game.torus({ at: [at[0], at[1] + f * -0.16, at[2]], radius: r, tube: 0.055 - f * 0.024,
        material: { color: 0x120a2e, texture: 'smooth', roughness: 0.25, metalness: 0.1,
          emissive: k % 2 ? 0x6a2fd0 : 0x2fd0c0, emissiveStrength: 2.6 - f * 0.8 },
        physics: false })
      : game.cylinder({ at: [at[0], at[1] + f * -0.16, at[2]], radius: r, height: 0.03,
        material: { color: 0x120a2e, texture: 'smooth', roughness: 0.25, metalness: 0.1,
          emissive: k % 2 ? 0x6a2fd0 : 0x2fd0c0, emissiveStrength: 2.6 - f * 0.8 },
        physics: false });
    a.visible = false;
    rings.push({ a, spin: (k % 2 ? -1 : 1) * (0.5 + k * 0.55), tilt: f * 6 });
  }
  // The hole itself: black, and below the rings so they read as descending
  // into it rather than as hoops lying on the floor.
  const maw = game.cylinder({ at: [at[0], at[1] - 0.30, at[2]], radius: 0.42, height: 0.04,
    material: { color: 0x02020a, texture: 'smooth', roughness: 1, metalness: 0 }, physics: false });
  maw.visible = false;
  const light = game.light({ at: [at[0], at[1] + 0.5, at[2]], color: 0x7a4cff, intensity: 0, radius: 6 });
  S.vortex = { at, rings, maw, light, open: false, t: 0 };
}

/* The thing that comes out of it.
 *
 * Small -- a metre and a bit -- because something that has to reach up out
 * of a hole in the floor, take a rifle off you and carry it back down is
 * more unsettling at that size than at three metres. Built rather than
 * hinted at: a long skull, two black eyes set too far round the sides, a
 * neck, a narrow chest, and two arms with too many joints in them. */
/* The thing that lives in the vortex.
 *
 * Built as a JOINTED figure rather than a heap of cylinders parented to
 * one root. It had no joints at all: the arms were nine fixed pieces hung
 * off the body, and the upgraded weapon was placed at a point in the air
 * near its chest and called "riding in its hands". So it never actually
 * took anything and never actually gave anything back -- it went down, it
 * came up, and the gun was in your hands again.
 *
 * Now each arm is a chain -- shoulder, elbow, wrist -- and the weapon is
 * parented to a holder BETWEEN the two hands, so where the hands go the
 * gun goes. It can reach out, close on the weapon, carry it down, and hold
 * it out to you at the end, which is what was asked for and what the
 * moment is for. */
function buildAlien(game, S) {
  const skin = { color: 0x6f7f74, texture: 'skin', roughness: 0.42, metalness: 0, subsurface: 0.2 };
  const dark = { color: 0x07090c, texture: 'smooth', roughness: 0.12, metalness: 0.1 };
  const glow = { color: 0x143a34, texture: 'smooth', roughness: 0.3, metalness: 0,
    emissive: 0x3fe0c0, emissiveStrength: 2.2 };
  const root = game.box({ at: [0, -5, 0], size: 0.02, physics: false, visible: false });
  const parts = [];
  const add = (a, parent, pos, rot) => {
    a.parent = parent; a.setPosition(pos); if (rot) a.setRotation(rot); parts.push(a); return a;
  };
  const joint = (parent, pos) => {
    const a = game.box({ size: 0.008, physics: false, visible: false });
    a.parent = parent; a.setPosition(pos); parts.push(a); return a;
  };

  /* Torso: a tapered ribcage rather than a can, with the light showing
     through between the ribs. */
  add(game.cylinder({ radius: 0.082, height: 0.20, material: skin, physics: false }), root, [0, 0.30, 0]);
  add(game.cylinder({ radius: 0.062, height: 0.14, material: skin, physics: false }), root, [0, 0.19, 0]);
  add(game.sphere({ radius: 0.094, material: skin, physics: false }), root, [0, 0.41, 0]);
  for (let k = 0; k < 4; k++) {
    add(game.box({ size: [0.145 - k * 0.012, 0.011, 0.10], material: glow, physics: false }),
      root, [0, 0.23 + k * 0.050, 0.050]);
  }
  // Spine down the back, which is what makes it read as a body and not a pot.
  for (let k = 0; k < 5; k++) {
    add(game.sphere({ radius: 0.017 - k * 0.0016, material: skin, physics: false }),
      root, [0, 0.20 + k * 0.058, -0.062]);
  }
  // Neck and skull: long, with a jaw under it.
  add(game.cylinder({ radius: 0.026, height: 0.11, material: skin, physics: false }), root, [0, 0.51, -0.006]);
  const skull = add(game.sphere({ radius: 0.086, material: skin, physics: false }), root, [0, 0.615, 0]);
  add(game.sphere({ radius: 0.058, material: skin, physics: false }), root, [0, 0.598, 0.052]);
  add(game.box({ size: [0.070, 0.030, 0.062], material: skin, physics: false }), root, [0, 0.560, 0.040]);
  add(game.box({ size: [0.052, 0.010, 0.020], material: dark, physics: false }), root, [0, 0.549, 0.062]);
  for (const sz of [-1, 1]) {
    add(game.sphere({ radius: 0.029, material: dark, physics: false }), root, [sz * 0.052, 0.622, 0.046]);
    // A ridge over each eye, so the face has a brow.
    add(game.box({ size: [0.040, 0.012, 0.030], material: skin, physics: false }), root, [sz * 0.050, 0.650, 0.040]);
  }

  /* Two arms, jointed. Every segment hangs off the joint above it, so
     turning a shoulder carries the whole arm and whatever it is holding. */
  const shoulders = [], elbows = [], wrists = [];
  for (const sz of [-1, 1]) {
    const sh = joint(root, [sz * 0.086, 0.400, 0]);
    add(game.cylinder({ radius: 0.020, height: 0.19, material: skin, physics: false }), sh, [0, -0.095, 0]);
    add(game.sphere({ radius: 0.023, material: skin, physics: false }), sh, [0, 0, 0]);
    const el = joint(sh, [0, -0.190, 0]);
    add(game.cylinder({ radius: 0.0165, height: 0.18, material: skin, physics: false }), el, [0, -0.090, 0]);
    add(game.sphere({ radius: 0.019, material: skin, physics: false }), el, [0, 0, 0]);
    const wr = joint(el, [0, -0.180, 0]);
    // The hand: a narrow palm and three long fingers, no thumb.
    add(game.box({ size: [0.034, 0.052, 0.018], material: skin, physics: false }), wr, [0, -0.026, 0]);
    for (let f = 0; f < 3; f++) {
      const fx = (f - 1) * 0.013;
      add(game.cylinder({ radius: 0.0058, height: 0.044, material: skin, physics: false }),
        wr, [fx, -0.070, 0.004], [10, 0, 0]);
      add(game.cylinder({ radius: 0.0050, height: 0.038, material: skin, physics: false }),
        wr, [fx, -0.104, 0.016], [34, 0, 0]);
    }
    shoulders.push(sh); elbows.push(el); wrists.push(wr);
  }
  /* Where a carried weapon sits: between the two hands, so it goes exactly
     where they go. Parented to the LEFT wrist, with the right hand posed
     to meet it. */
  const hold = joint(wrists[0], [0.086, -0.070, 0.030]);

  for (const q of parts) q.visible = false;
  S.alien = { root, parts, skull, shoulders, elbows, wrists, hold,
    at: [0, -5, 0], visible: false };
}

/* The poses it moves between, as three angles an arm. Blended, because a
   figure that snaps between poses is a puppet and one that eases between
   them is a creature. */
const ALIEN_POSE = {
  // Hanging, on the way up and on the way down.
  down: { sh: [6, 0, 26], el: [16, 0, 10], wr: [22, 0, 4] },
  // Reaching out for the weapon, arms straight, palms up.
  reach: { sh: [-74, 0, 12], el: [-16, 0, 4], wr: [-26, 0, 0] },
  // Carrying it in against the chest.
  carry: { sh: [-40, 0, 20], el: [-64, 0, 8], wr: [-14, 0, 0] },
  // Holding it out to you: further than reach, and lower, so it is offered
  // rather than presented.
  offer: { sh: [-86, 0, 14], el: [-8, 0, 3], wr: [-34, 0, 0] },
};

function alienPose(A, a, b, t) {
  if (!A || !A.shoulders) return;
  const P1 = ALIEN_POSE[a] || ALIEN_POSE.down, P2 = ALIEN_POSE[b] || P1;
  const k = Math.max(0, Math.min(1, t));
  const e = k * k * (3 - 2 * k);
  const mix = (u, v) => u + (v - u) * e;
  for (let i = 0; i < 2; i++) {
    const sz = i === 0 ? -1 : 1;
    A.shoulders[i].setRotation([mix(P1.sh[0], P2.sh[0]), 0, sz * mix(P1.sh[2], P2.sh[2])]);
    A.elbows[i].setRotation([mix(P1.el[0], P2.el[0]), 0, sz * mix(P1.el[2], P2.el[2])]);
    A.wrists[i].setRotation([mix(P1.wr[0], P2.wr[0]), 0, sz * mix(P1.wr[2], P2.wr[2])]);
  }
}

function meteorShot(S, from, dir, hud, sfx) {
  const m = S.meteor;
  if (!m || m.state !== 'down' || m.armed) return false;
  const c = m.centre;
  const ox = c[0] - from[0], oy = c[1] - from[1], oz = c[2] - from[2];
  const t = ox * dir[0] + oy * dir[1] + oz * dir[2];
  if (t < 0 || t > 60) return false;
  const px = from[0] + dir[0] * t, py = from[1] + dir[1] * t, pz = from[2] + dir[2] * t;
  if (Math.hypot(px - c[0], py - c[1], pz - c[2]) > m.radius) return false;
  m.armed = true;
  addShake(S, 0.16, 1.6);
  hud.banner('IT IS OPEN', '#9a6aff');
  if (sfx && sfx.crack) sfx.crack();
  else if (sfx && sfx.powerOn) sfx.powerOn();
  crackRock(S);
  return true;
}

/* The shell comes off and the hole underneath opens.
 *
 * Called once, when a round goes into the rock. The outer spheres go, the
 * rings come on, and the light under them starts. Everything that follows
 * -- the thing that lives in it, taking a gun down and bringing it back --
 * hangs off this moment, so it has to read as the rock BREAKING rather than
 * as the rock switching on, which is what a banner and a brighter glow was. */
function crackRock(S) {
  const V = S.vortex;
  if (!V || V.open) return;
  V.open = true;
  const m = S.meteor;
  /* The shell has to come off, not thin out.
   *
   * Hiding every other sphere left a rock that still looked like a rock,
   * sitting squarely on top of the vortex and hiding all of it -- the
   * player would see one glowing ring poking out from under a boulder. The
   * big central mass goes entirely, and the seven round it are pushed out
   * and down into a broken rim, which is what is left when something comes
   * up through the middle of a rock. */
  const shell = m.shell || [];
  if (shell[0]) shell[0].visible = false;
  for (let i = 1; i < shell.length; i++) {
    const a = shell[i];
    if (!a) continue;
    const p2 = a.position;
    const dx = p2.x - S.vortex.at[0], dz = p2.z - S.vortex.at[2];
    const d = Math.hypot(dx, dz) || 1;
    a.setPosition([S.vortex.at[0] + dx / d * (d + 0.42), Math.max(0.22, p2.y - 0.30),
      S.vortex.at[2] + dz / d * (d + 0.42)]);
  }
  for (const v2 of (m.veins || [])) v2.visible = false;
  for (const r of V.rings) r.a.visible = true;
  V.maw.visible = true;
  V.light.intensity = 14;
}

/* ---------------- interaction ---------------- */

function nearestInteract(S, P) {
  const p = P.actor.position;
  const R = PLAYER.interactRange;
  // The workbench. Nothing here can be fitted to a wonder weapon or to the
  // melee kit, so standing at it holding one says so rather than opening a
  // panel with every line greyed out.
  if (S.bench && dist2d(p, { x: S.bench.at[0], z: S.bench.at[2] }) < R + 0.5 && p.y < 2.4) {
    const held = P.equipped();
    if (ATTACH.noWork.includes(held)) {
      return { kind: 'benchNo', cost: 0, label: `The ${P.spec().name} takes nothing` };
    }
    return { kind: 'bench', cost: 0, label: `Work on the ${P.spec().name}` };
  }
  // Wall buys.
  /* Whichever one you are LOOKING at.
   *
   * This returned the first entry in the list that was in range, and along
   * the north wall the Thompson, the grenade crate and the scattergun sit
   * within a metre and a half of each other -- so standing anywhere near
   * them put two or three in range at once and which one you got depended
   * on the order they happen to be declared in. Take half a step and the
   * answer changes for no reason you can see, which is exactly what buying
   * the wrong thing feels like.
   *
   * Everything in range is scored on the angle between the way you are
   * facing and the thing itself, with distance only breaking near-ties.
   * Facing a wall gun is unambiguous even when three are within reach.
   *
   * The grenade crate goes through the same choice for the same reason --
   * it is on the same wall, between the two guns. */
  {
    /* Without a camera there is nothing to face, so fall back to the old
       first-in-range behaviour rather than returning nothing at all -- a
       bare `return` here would also skip the doors, the shop and everything
       else below. */
    const cam = S.game && S.game.camera;
    const fx = cam ? cam.target.x - cam.position.x : 0;
    const fz = cam ? cam.target.z - cam.position.z : 0;
    const fl = Math.hypot(fx, fz) || 1;
    const cand = [];
    const consider = (at, make) => {
      const dx = at[0] - p.x, dz = at[2] - p.z;
      const d = Math.hypot(dx, dz) || 1e-4;
      // cos of the angle off the view direction; 1 is dead ahead.
      const face = cam ? (dx / d) * (fx / fl) + (dz / d) * (fz / fl) : 1;
      // Behind you is never what you meant.
      if (face < 0.15) return;
      cand.push({ score: face - d * 0.04, make });
    };
    for (const b of S.buys) {
      /* Against the buy's own height, not against a hard-coded 1.0. The
         Paralyzer is on the roof: measured against the ground floor it could
         never be reached from anywhere you can actually stand. */
      if (dist2d(p, { x: b.at[0], z: b.at[2] }) < R && Math.abs(p.y - b.at[1]) < 2.0) {
        consider(b.at, () => {
          const owned = P.slots.includes(b.weapon);
          const cost = owned ? ECONOMY.wallAmmo : ECONOMY.wallGun;
          return { kind: 'buy', buy: b, cost, label: `${b.label} — ${owned ? 'AMMO ' : ''}${cost}` };
        });
      }
    }
    if (S.nadeBuy && dist2d(p, { x: S.nadeBuy.at[0], z: S.nadeBuy.at[2] }) < R
      && Math.abs(p.y - 1) < 2) {
      consider(S.nadeBuy.at, () => (P.nades >= GRENADE.max
        ? { kind: 'nadeFull', cost: 0, label: 'Grenades — full', inert: true }
        : { kind: 'nades', cost: GRENADE.cost, label: `Grenades — ${GRENADE.cost}` }));
    }
    if (cand.length) {
      cand.sort((a, b2) => b2.score - a.score);
      return cand[0].make();
    }
  }
  /* Downstairs. Everything he offers is an interact point rather than a
     menu — same key, same prompt line as the rest of the map. */
  const sh = S.shop;
  if (sh && p.y < -0.5) {
    const c = sh.counterAt;
    for (let k = 0; k < sh.stock.length; k++) {
      const st = sh.standAt[k];
      if (st && dist2d(p, { x: st[0], z: st[1] }) < 0.95) {
        const id = sh.stock[k];
        if (!id) continue;
        const cost = Math.round(sh.prices[id] * (1 - sh.discount));
        return { kind: 'shopBuy', id, cost, label: `${WEAPONS[id].name} — ${cost}${sh.discount > 0 ? '  (discounted)' : ''}` };
      }
    }
    // Perk board at the far end of the counter.
    if (dist2d(p, { x: sh.perkAt[0], z: sh.perkAt[1] }) < 1.0) {
      const owed = Object.keys(PERKS).filter((k) => !P.perks[k]);
      if (!owed.length) return { kind: 'shopNone', cost: 0, label: 'He has nothing left you do not have', inert: true };
      const id = owed[S.round % owed.length];
      const cost = Math.round(PERKS[id].cost * (1 - sh.discount));
      return { kind: 'shopPerk', id, cost, label: `${PERKS[id].name} — ${cost}   (${Math.round(sh.discount * 100)}% off)` };
    }
    // Sell or donate what you are holding, at the counter itself.
    if (dist2d(p, { x: c[0], z: c[2] }) < 1.3) {
      const held = P.equipped();
      if (held === 'm1911' || held === 'knife' || held === 'hammer') {
        return { kind: 'shopNone', cost: 0, label: 'He does not want that', inert: true };
      }
      const back = sh.buyback[held] || 600;
      return { kind: 'shopSell', id: held, cost: 0, back,
        label: `Sell the ${WEAPONS[held].name} — he offers ${back}   [hold to donate instead]`, hold: false };
    }
    // The crate: donate into it, or take something back out.
    if (dist2d(p, { x: sh.crateAt[0], z: sh.crateAt[2] }) < 1.15) {
      const held = P.equipped();
      const canGive = held !== 'm1911' && held !== 'knife' && held !== 'hammer';
      if (canGive) {
        return { kind: 'shopDonate', id: held, cost: 0,
          label: `Give up the ${WEAPONS[held].name} — discount goes to ${Math.round(Math.min(SHOP.maxDiscount, sh.discount + SHOP.bribeStep) * 100)}%` };
      }
      if (sh.donated.length) {
        const id = sh.donated[sh.donated.length - 1];
        return { kind: 'shopSteal', id, cost: 0,
          label: `Take the ${WEAPONS[id].name} back${sh.stolen >= SHOP.stealsAllowed ? '  — he is watching' : ''}` };
      }
      return { kind: 'shopNone', cost: 0, label: 'The crate is empty', inert: true };
    }
  }

  /* Everything past here is on the surface. Most of these checks are
     distance in the horizontal plane only, so from the basement — directly
     under the mess — you could reach up through the floor and buy the
     generator door. */
  if (p.y < -0.5) return null;

  // The grenade crate is chosen together with the wall guns below, because
  // it stands between two of them and picking it by list order is the fault
  // being fixed.
  for (const st of S.perkStations) {
    if (dist2d(p, { x: st.at[0], z: st.at[2] }) < R && Math.abs(p.y - st.at[1]) < 2.2) {
      if (P.perks[st.id]) return { kind: 'perkOwned', cost: 0, label: `${st.def.name} — held`, inert: true };
      return { kind: 'perk', st, cost: st.def.cost, label: `${st.def.name} — ${st.def.cost}   ${st.def.blurb}` };
    }
  }
  for (const [id, d] of Object.entries(S.doors)) {
    if (!d.open && dist2d(p, { x: d.at[0], z: d.at[2] }) < R + 0.6) {
      return { kind: 'door', id, door: d, cost: d.cost, label: `${d.label} — ${d.cost}` };
    }
  }
  if (!S.powered && dist2d(p, { x: S.powerSwitch.at[0], z: S.powerSwitch.at[2] }) < R) {
    return { kind: 'power', cost: 0, label: 'Start the generator' };
  }
  /* The minigun. Buying it starts a clock, not a weapon: you cannot carry
     it and you cannot aim it, and three minutes is long enough that the
     round it covers is a choice worth making. */
  const mg = S.minigun;
  if (mg && dist2d(p, { x: mg.at[0], z: mg.at[2] }) < R + 0.6 && Math.abs(p.y - mg.at[1]) < 2.2) {
    if (mg.t > 0) {
      return { kind: 'mgOn', cost: 0, inert: true,
        label: `Minigun — ${Math.ceil(mg.t)}s left` };
    }
    if (!S.powered) return { kind: 'mgOn', cost: 0, inert: true, label: 'No power to the roof' };
    if (mg.cool > 0) return { kind: 'mgOn', cost: 0, inert: true, label: `Minigun — cooling, ${Math.ceil(mg.cool)}s` };
    return { kind: 'minigun', cost: MINIGUN.cost, label: `Minigun — ${MINIGUN.cost}   (three minutes)` };
  }

  /* The upgrade cradle. Three seconds with the gun in the rock and it
     comes back out with twice the damage, twice the magazine and a name
     nobody sanctioned. It will not take a wonder weapon and it will not
     take a tool. */
  const mt = S.meteor;
  if (mt && mt.state === 'down' && dist2d(p, { x: mt.at[0], z: mt.at[2] }) < R + 0.5 && Math.abs(p.y - 1) < 2.4) {
    if (!mt.armed) return { kind: 'meteorCold', cost: 0, label: 'The rock is dead. Put a round into it.', inert: true };
    if (!S.powered) return { kind: 'meteorCold', cost: 0, label: 'No power to the wing', inert: true };
    if (mt.holding) return { kind: 'meteorTake', cost: 0, label: `Take the ${WEAPONS[mt.holding].name}` };
    if (mt.busy) return { kind: 'meteorCold', cost: 0, label: 'Working', inert: true };
    const held = P.equipped();
    if (ATTACH.noWork.includes(held) || P.upgraded[held]) {
      return { kind: 'meteorCold', cost: 0,
        label: P.upgraded[held] ? `The ${P.spec().name} has been through already` : `It will not take the ${P.spec().name}`,
        inert: true };
    }
    return { kind: 'meteor', cost: ECONOMY.upgrade, label: `Upgrade the ${WEAPONS[held].name} — ${ECONOMY.upgrade}` };
  }

  /* A gun an enemy left behind: it spins and it expires, but it still
     has to be asked for. */
  if (S.drops && S.drops.length) {
    for (const d of S.drops) {
      const q = d.root && d.root.position;
      if (!q) continue;
      if (dist2d(p, q) < 1.35 && Math.abs(p.y - q.y) < 1.9) {
        return { kind: 'takeDrop', drop: d, cost: 0, hold: false,
          label: `Pick up the ${WEAPONS[d.id].name}` };
      }
    }
  }

  /* A gun someone dropped. Deliberately NOT automatic: the one you just
     swapped away from is lying where you are standing, and picking it up
     by walking would put it straight back in your hands. */
  if (S.floorGuns && S.floorGuns.length) {
    let best = null, bestD = 2.0;
    for (const d of S.floorGuns) {
      if (!d.rest && d.t < 0.6) continue;          // still in the air
      const dd = dist2d(p, { x: d.at[0], z: d.at[2] });
      if (dd < bestD && Math.abs(p.y - d.at[1]) < 2.0) { bestD = dd; best = d; }
    }
    if (best) {
      return { kind: 'pickup', drop: best, cost: 0, hold: false,
        label: `Pick up the ${WEAPONS[best.id].name}  —  ${best.mag} + ${best.reserve}` };
    }
  }

  const c = S.crate;
  if (dist2d(p, { x: c.at[0], z: c.at[2] }) < R + 0.4 && Math.abs(p.y - c.at[1]) < 2.2) {
    // Nothing to take while the reel is still turning over.
    if (c.offer && !(c.reelT > 0)) return { kind: 'take', cost: 0, label: `Take ${WEAPONS[c.offerId].name}` };
    if (c.offer) return { kind: 'crateSpin', cost: 0, inert: true, label: 'Wait for it' };
    if (!c.busy) return { kind: 'crate', cost: c.cost, label: `Supply crate — ${c.cost}` };
  }
  // The handset, while it is ringing and nobody has answered it.
  if (S.exit && S.exit.step === 0 && S.powered) {
    const e = S.exit.at;
    if (Math.abs(p.y + 0.5 - e[1]) < 2.2 && dist2d(p, { x: e[0], z: e[2] }) < R) {
      return { kind: 'exitPhone', cost: 0, label: 'Answer the handset' };
    }
  }
  // Window repair.
  for (const win of S.windows) {
    const s = win.def.sillAt;
    if (Math.abs(p.y + 0.5 - s[1]) < 2.2 && dist2d(p, { x: s[0], z: s[2] }) < R) {
      if (win.boards.some((b) => !b)) return { kind: 'repair', win, cost: 0, label: 'Rebuild barricade', hold: true };
    }
  }
  return null;
}

function doInteract(game, S, P, hud, sfx, it, dt) {
  if (it.inert) return;
  if (it.cost > S.points) { sfx.denied(); hud.prompt(it.label + '  — need more points', true); return; }
  if (it.kind === 'shopBuy') {
    S.points -= it.cost;
    P.give(it.id);
    S.shop.stock[S.shop.stock.indexOf(it.id)] = null;
    sfx.buy(); hud.points(S.points); hud.ammo(P);
    return;
  }
  if (it.kind === 'shopPerk') {
    S.points -= it.cost;
    P.perks[it.id] = true;
    sfx.perk();
    hud.banner(PERKS[it.id].name, '#' + PERKS[it.id].color.toString(16).padStart(6, '0'));
    hud.perks(P.perks); hud.points(S.points);
    return;
  }
  if (it.kind === 'shopSell') {
    S.addPoints(it.back);
    hud.pointsDelta(it.back);
    dropFromHands(P, it.id);
    sfx.buy(); hud.points(S.points); hud.ammo(P);
    S.voice(it.back > ECONOMY.wallGun ? LINES.dealFair : LINES.dealRobbed);
    return;
  }
  if (it.kind === 'shopDonate') {
    const sh = S.shop;
    sh.discount = Math.min(SHOP.maxDiscount, sh.discount + SHOP.bribeStep);
    sh.donated.push(it.id);
    // It goes in the crate, and you can see it in there.
    const k = sh.donated.length - 1;
    const built = it.id === 'obliterator' ? makeObliterator(game)
      : it.id === 'mauser' ? makeMauser(game)
      : it.id === 'ram' ? makeBatteringRam(game)
      : (it.id === 'shield' || it.id === 'shieldWorn') ? makeRiotShield(game)
      : it.id === 'scatter' ? makeScattergun(game)
      : it.id === 'arc' ? makeArcProjector(game)
      : { root: game.thompson({ physics: false }), parts: [] };
    built.root.setPosition([sh.crateAt[0] + ((k % 3) - 1) * 0.28, sh.crateAt[1] + 0.42 + (k / 3 | 0) * 0.12, sh.crateAt[2] + (((k / 3 | 0) % 2) - 0.5) * 0.26]);
    built.root.setRotation([0, k * 37, 74]);
    sh.pile = sh.pile || [];
    sh.pile.push(built);
    dropFromHands(P, it.id);
    sfx.buy(); hud.ammo(P);
    hud.banner(`DISCOUNT ${Math.round(sh.discount * 100)}%`, '#f0c256');
    return;
  }
  if (it.kind === 'shopSteal') {
    const sh = S.shop;
    sh.donated.pop();
    const built = sh.pile && sh.pile.pop();
    if (built) { built.root.destroy(); for (const q of built.parts) q.destroy(); }
    sh.discount = Math.max(0, sh.discount - SHOP.bribeStep);
    P.give(it.id);
    sh.stolen++;
    sfx.buy(); hud.ammo(P);
    if (sh.stolen > SHOP.stealsAllowed) {
      sh.hostile = true;
      S.voice(LINES.dealAngry);
      hud.banner('HE SAW THAT', '#b3221c');
    } else {
      hud.banner(`TAKEN BACK  (${SHOP.stealsAllowed + 1 - sh.stolen} left)`, '#f0c256');
    }
    return;
  }
  if (it.kind === 'nades') {
    S.points -= it.cost;
    P.nades = GRENADE.max;
    sfx.buy();
    hud.ammo(P);
    hud.points(S.points);
    return;
  }
  if (it.kind === 'perk') {
    S.points -= it.cost;
    sfx.buy();
    hud.points(S.points);
    /* The perk lands when the bottle is empty, not when the money leaves.
       Buying it used to be instantaneous -- a banner and a number -- and a
       thing you drink should take as long as drinking it. */
    startDrink(game, S, P, hud, sfx, it.st);
    return;
  }
  if (it.kind === 'buy') {
    S.points -= it.cost; sfx.buy();
    const owned = P.slots.includes(it.buy.weapon);
    P.give(it.buy.weapon);
    if (!owned) S.voice(LINES['buy_' + it.buy.weapon] || LINES.buyScatter);
    hud.ammo(P); hud.points(S.points);
  } else if (it.kind === 'door') {
    S.points -= it.cost; sfx.doorOpen();
    it.door.open = true;
    for (const a of it.door.actors) a.destroy();
    // The wing has its own window, and it only matters once you are in there.
    if (it.id === 'side') S.activeWindows.push('W5');
    hud.points(S.points);
  } else if (it.kind === 'power') {
    /* Nothing happens on the press. You take hold of the crank and you turn
       it for five seconds, and the whole time the horde is still coming —
       which is the point of making it take five seconds. */
    const ps = S.powerSwitch;
    if (!ps.cranking) { ps.cranking = GEN.crank; sfx.doorOpen(); S.voice(LINES.powerStart || LINES.power); }
  } else if (it.kind === 'exitPhone') {
    exitStep(S, hud, sfx, 1, 'SOMEBODY IS ON THE LINE');
  } else if (it.kind === 'bench') {
    Object.assign(S.bench, { open: true, slot: 0, index: 0, spin: 0.9,
      preview: false, picking: false, damage: false });
    sfx.buy();
  } else if (it.kind === 'benchNo') {
    hud.banner('NOTHING FITS THAT', '#c8562e');
  } else if (it.kind === 'minigun') {
    S.points -= it.cost; sfx.buy();
    S.minigun.t = MINIGUN.time;
    S.minigun.owed = 0;
    hud.points(S.points);
    hud.banner('THREE MINUTES', '#ffd27a');
  } else if (it.kind === 'meteor') {
    /* The gun goes into the cradle and the player stands there without one
       for three seconds, which is the whole cost of the thing — five
       thousand points and three seconds in a room that does not stop. */
    S.points -= it.cost; sfx.buy();
    const id = P.equipped();
    S.meteor.busy = true;
    S.meteor.timer = 3.0;
    S.meteor.pending = id;
    /* It takes the gun off you. Actually off you: out of the slot list, so
       your hands are empty and the round does not stop while they are. That
       is half the price of an upgrade and it never used to be charged --
       the weapon stayed in view the whole time it was supposedly in the
       rock. */
    S.meteor.tookFrom = P.slots.indexOf(id);
    if (S.meteor.tookFrom >= 0) {
      P.slots = P.slots.filter((w) => w !== id);
      P.slot = Math.max(0, Math.min(P.slot, P.slots.length - 1));
      P.reloading = 0;
      hud.ammo(P);
    }
    /* And carries it down the hole, as a real model in its hands.
       Parented to the creature, so the weapon inherits every bit of the
       rise and the sink rather than being animated alongside it. */
    try {
      const made = buildWorldWeapon(game, id);
      if (made && made.root) {
        /* Into the HOLDER between its two hands, not onto its body. Hung
           off the root, the gun sat at a fixed point near the chest while
           the arms did whatever they liked -- which is why it read as
           floating beside the creature rather than being carried by it. */
        made.root.parent = (S.alien && S.alien.hold) ? S.alien.hold : (S.alien ? S.alien.root : null);
        made.root.setPosition([0, 0, 0]);
        made.root.setRotation([0, 0, -18]);
        S.meteor.display = [made.root];
        S.meteor.displayRoot = made.root;
        S.meteor.parented = true;
      }
    } catch (e) { void e; }
    hud.points(S.points);
    hud.banner('IT HAS TAKEN IT', '#9a6aff');
  } else if (it.kind === 'meteorTake') {
    const id = S.meteor.holding;
    S.meteor.holding = null;
    if (S.meteor.displayRoot) {
      try { S.meteor.displayRoot.destroy(); } catch (e) { void e; }
      S.meteor.displayRoot = null;
    }
    if (S.meteor.display) { for (const q of S.meteor.display) q.visible = false; }
    S.meteor.display = null;
    S.meteor.parented = false;
    // Back in your hands, in the slot it came out of.
    if (S.meteor.tookFrom != null && S.meteor.tookFrom >= 0 && !P.slots.includes(id)) {
      P.slots.splice(Math.min(S.meteor.tookFrom, P.slots.length), 0, id);
      P.slot = P.slots.indexOf(id);
      hud.ammo(P);
    }
    S.meteor.tookFrom = null;
    P.upgraded[id] = true;
    applyUpgradeLook(game, P, id);
    const w = WEAPONS[id];
    if (!w.__preUpgrade) w.__preUpgrade = { dmg: w.dmg, mag: w.mag, name: w.name, slotName: w.slotName };
    w.dmg = w.__preUpgrade.dmg * 2;
    w.mag = w.__preUpgrade.mag * 2;
    w.reserve = Math.round(w.reserve * 1.5);
    w.name = UPGRADE_NAMES[id] || w.__preUpgrade.name;
    w.slotName = w.name.toUpperCase();
    w.__cacheKey = null;
    if (P.ammo[id]) { P.ammo[id].mag = w.mag; P.ammo[id].reserve = w.reserve; }
    P.give(id);
    sfx.buy();
    S.bark('buyGun');
    hud.ammo(P);
    hud.banner(w.slotName, '#ff7a2a');
  } else if (it.kind === 'crate') {
    S.points -= it.cost; sfx.buy();
    openCrate(game, S, P, hud, sfx);
    hud.points(S.points);
  } else if (it.kind === 'take') {
    const c = S.crate;
    P.give(c.offerId);
    sfx.buy();
    S.bark('boxGood');
    if (c.offerId === 'arc') S.voice(LINES.crateArc);
    closeCrate(S);
    hud.ammo(P);
  } else if (it.kind === 'takeDrop') {
    it.drop.want = true;
  } else if (it.kind === 'pickup') {
    const d = it.drop;
    const i = S.floorGuns.indexOf(d);
    if (i >= 0) S.floorGuns.splice(i, 1);
    for (const q of d.parts) { if (q.destroy) q.destroy(); else q.visible = false; }
    P.give(d.id);
    // It comes back with the ammunition it had when it went down, not full.
    P.ammo[d.id] = { mag: d.mag, reserve: d.reserve };
    sfx.gunPickup();
    hud.ammo(P);
    S.bark('buyGun');
  } else if (it.kind === 'repair') {
    /* Boarding up takes a second a plank, five for a full window, and it
       is done with a hammer rather than by standing near the wall: the
       tool comes out, the arm swings, the nail goes in. Being unable to
       shoot while you do it is the whole cost of repairing. */
    if (S.repairFrame !== S.frame - 1) { S.repairT = PLAYER.plankTime; P.buildT = 0; }
    S.repairFrame = S.frame;
    P.building = true;
    S.repairT -= dt;
    P.buildT = (P.buildT || 0) + dt;
    // Two strikes per plank, on the beat.
    const beat = Math.floor((PLAYER.plankTime - S.repairT) / (PLAYER.plankTime / 2));
    if (beat !== P.lastBeat) { P.lastBeat = beat; if (beat > 0) sfx.nail(); }
    if (S.repairT <= 0) {
      S.repairT = PLAYER.plankTime;
      const win = it.win;
      const slot = win.boards.findIndex((b) => !b);
      if (slot >= 0) {
        win.boards[slot] = spawnBoard(game, win.def, slot, S.boardMat);
        sfx.board();
        game.particles.dust([win.def.sillAt[0], win.def.sillAt[1], win.def.sillAt[2]], { count: 4, color: 0x7d5c36 });
        hud.pointsDelta(S.addPoints(ECONOMY.board));
        hud.points(S.points);
      }
    }
  }
}

/* Every gun the box can give you, built once and kept. Spawning eight
   weapons on each open would allocate eight sets of actors every time and
   destroy them again; the meshes are cached by the engine anyway, so the
   only thing that costs is the actors, and they are worth keeping. */
const CRATE_POOL = ['thompson', 'scatter', 'arc', 'obliterator', 'mauser', 'blaze', 'ram', 'shield', 'killstreak'];

function crateDisplay(game, id) {
  if (id === 'thompson') { const t = game.thompson({ physics: false }); return { root: t, parts: [t, t.wood, t.slide, t.mag].filter(Boolean) }; }
  if (id === 'blaze') {
    const t = game.pistol1911({ physics: false, engrave: 'Blaze',
      gripMaterial: { color: 0x8f1c10, texture: 'smooth', roughness: 0.50, metalness: 0 } });
    return { root: t, parts: [t, t.grips, t.slide, t.mag, t.mark].filter(Boolean) };
  }
  if (id === 'killstreak') return makeKillStreak(game);
  if (id === 'ram') return makeBatteringRam(game);
  if (id === 'shield') return makeRiotShield(game);
  if (id === 'scatter') return makeScattergun(game);
  if (id === 'obliterator') return makeObliterator(game);
  if (id === 'mauser') return makeMauser(game);
  return makeArcProjector(game);
}

function crateReel(game, S) {
  const c = S.crate;
  if (c.reel) return c.reel;
  c.reel = {};
  for (const id of CRATE_POOL) {
    const d = crateDisplay(game, id);
    d.root.setPosition([c.at[0], c.at[1] + 0.2, c.at[2]]);
    for (const q of d.parts) q.visible = false;
    c.reel[id] = d;
  }
  return c.reel;
}

function openCrate(game, S, P, hud, sfx) {
  const c = S.crate;
  c.busy = true;
  const roll = Math.random();
  /* The melee pair only turn up once the generator is running, so the
     answer to armour arrives at roughly the round armour does. */
  c.offerId = S.powered
    ? (roll < 0.17 ? 'thompson' : roll < 0.32 ? 'scatter' : roll < 0.45 ? 'arc'
      : roll < 0.56 ? 'obliterator' : roll < 0.67 ? 'blaze' : roll < 0.78 ? 'ram'
      : roll < 0.90 ? 'shield' : 'killstreak')
    : (roll < 0.28 ? 'thompson' : roll < 0.50 ? 'scatter' : roll < 0.68 ? 'mauser'
      : roll < 0.86 ? 'blaze' : 'arc');
  S.voice(LINES.crateOpen);
  S.bark('box');
  // Lid swings, and the reel starts turning over.
  c.lid.setRotation([0, 0, -70]);
  c.lid.setPosition([c.at[0] - 0.45, c.at[1] + 0.75, c.at[2]]);

  /* The reel. Every gun the box can hand out flashes past before it stops,
     which is the whole ritual of the thing — the box is not a random
     number, it is eight seconds of hoping. */
  crateReel(game, S);
  c.offer = c.reel[c.offerId];
  c.reelT = 2.6;                 // how long it flashes before it settles
  c.reelStep = 0;
  c.reelIdx = 0;
  c.rise = 0;
  c.timer = 8 + c.reelT;
  c.glow = game.light({ at: [c.at[0], c.at[1] + 1, c.at[2]], color: 0x86e2ff, intensity: 70, radius: 6 });
  let spins = 0;
  c.spinInterval = setInterval(() => { sfx.crateSpin(); if (++spins > 10) { clearInterval(c.spinInterval); c.spinInterval = null; } }, 160);
}

/* One frame of the reel: show one gun, hide the rest, and slow down as it
   runs out — a reel that stops dead is a list, a reel that decelerates is
   a decision being made. */
function updateCrateReel(game, S, dt, sfx) {
  const c = S.crate;
  if (!c.reel || c.reelT == null || c.reelT <= 0) return false;
  c.reelT -= dt;
  const u = 1 - Math.max(0, c.reelT) / 2.6;
  const every = 0.045 + u * u * 0.34;            // slows toward the end
  c.reelStep -= dt;
  if (c.reelStep <= 0) {
    c.reelStep = every;
    c.reelIdx = (c.reelIdx + 1) % CRATE_POOL.length;
    if (sfx && sfx.crateSpin && u > 0.5) sfx.crateSpin();
  }
  const showing = c.reelT <= 0 ? c.offerId : CRATE_POOL[c.reelIdx];
  for (const id of CRATE_POOL) {
    const on = id === showing;
    for (const q of c.reel[id].parts) q.visible = on;
    if (on) {
      c.reel[id].root.setPosition([c.at[0], c.at[1] + 0.55, c.at[2]]);
      c.reel[id].root.setRotation([0, (S.time * 90) % 360, 0]);
    }
  }
  if (c.reelT <= 0) { c.reelT = 0; if (sfx && sfx.buy) sfx.buy(); }
  return true;
}

function closeCrate(S) {
  const c = S.crate;
  // The reel is kept between opens, so putting a gun away is hiding it.
  if (c.reel) for (const id of CRATE_POOL) for (const q of c.reel[id].parts) q.visible = false;
  if (c.glow) { c.glow._decay = 0.05; c.glow = null; }   // engine sweeps it out
  if (c.spinInterval) { clearInterval(c.spinInterval); c.spinInterval = null; }
  c.offer = null; c.offerId = null; c.busy = false; c.reelT = 0;
  c.lid.setRotation([0, 0, 0]);
  c.lid.setPosition([c.at[0], c.at[1] + 0.44, c.at[2]]);
}

/* ---------------- HUD ----------------
   All DOM, injected here so the page needs nothing but a canvas.
   Serif, parchment-on-dark, red where it matters. */

function makeHud() {
  const old = document.getElementById('b9hud');
  if (old) old.remove();
  const oldCss = document.getElementById('b9hud-css');
  if (oldCss) oldCss.remove();
  const css = document.createElement('style');
  css.id = 'b9hud-css';
  css.textContent = `
  #b9hud { position:fixed; inset:0; pointer-events:none; font-family:Georgia,'Times New Roman',serif; color:#e8ddc8; z-index:10; }
  #b9hud .round { position:absolute; left:26px; bottom:18px; font-size:64px; color:#b3221c;
    text-shadow:0 0 18px rgba(179,34,28,.55), 0 2px 2px #000; font-style:italic; }
  #b9hud .roundlbl { position:absolute; left:28px; bottom:86px; font-size:13px; letter-spacing:.35em; color:#8c7f68; }
  #b9hud .points { position:absolute; right:26px; bottom:64px; font-size:30px; text-align:right; text-shadow:0 2px 3px #000; }
  #b9hud .ammo { position:absolute; right:26px; bottom:18px; font-size:22px; text-align:right; color:#cfc3ab; text-shadow:0 2px 3px #000; }
  #b9hud .ammo .wname { font-size:12px; letter-spacing:.3em; color:#8c7f68; display:block; }
  #b9hud .cross { position:absolute; left:50%; top:50%; width:4px; height:4px; margin:-2px; border-radius:50%;
    background:rgba(232,221,200,.85); box-shadow:0 0 4px #000; }
  #b9hud .hitm { position:absolute; left:50%; top:50%; width:18px; height:18px; margin:-9px; opacity:0; }
  #b9hud .hitm:before,#b9hud .hitm:after { content:''; position:absolute; inset:0;
    border:2px solid #e8ddc8; border-radius:0; transform:rotate(45deg); border-bottom:none; border-left:none; }
  #b9hud .hitm:after { transform:rotate(225deg); }
  #b9hud .hitm.head:before,#b9hud .hitm.head:after { border-color:#ff5040; }
  #b9hud .prompt { position:absolute; left:50%; bottom:26%; transform:translateX(-50%); font-size:19px;
    background:rgba(8,6,4,.72); padding:8px 22px; border:1px solid #4a4234; letter-spacing:.06em; display:none; }
  #b9hud .prompt .key { color:#ffd27a; }
  /* The parts list lives on the right and the controls on the left, with
     the weapon between them. Both were centred to begin with and they sat
     on top of each other — the list you are reading through the panel that
     tells you how to read it. */
  #b9hud .bench { position:absolute; right:3%; top:50%; transform:translateY(-50%);
    width:min(600px,58vw); background:rgba(10,8,6,.93); border:1px solid #5a5140; padding:18px 22px;
    display:none; letter-spacing:.05em; }
  #b9hud .bench .bhead { font-size:19px; color:#e8ddc8; border-bottom:1px solid #4a4234; padding-bottom:9px; margin-bottom:11px; }
  #b9hud .bench .brow { display:flex; flex-direction:column; gap:6px; }
  #b9hud .bench .opt { display:flex; justify-content:space-between; font-size:15px; padding:6px 9px; border:1px solid transparent; }
  #b9hud .bench .opt.sel { border-color:#ffd27a; background:rgba(255,210,122,.10); }
  #b9hud .bench .opt.fitted { color:#8ce8a0; }
  #b9hud .bench .opt.banned { color:#6b6455; }
  /* The X. Two gradients drawn corner to corner across the row, in the
     red the HUD already uses for "no". A line of grey text saying it
     will not fit is something you have to read; this you see. */
  #b9hud .bench .opt.crossed { position:relative; overflow:hidden; }
  #b9hud .bench .opt.crossed:before, #b9hud .bench .opt.crossed:after {
    content:''; position:absolute; left:-6%; right:-6%; top:50%; height:2px;
    background:rgba(200,86,46,.72); pointer-events:none; }
  #b9hud .bench .opt.crossed:before { transform:rotate(9.5deg); }
  #b9hud .bench .opt.crossed:after { transform:rotate(-9.5deg); }
  #b9hud .bench .opt .why { color:#8a8272; font-size:12.5px; }
  #b9hud .bench .bfoot { margin-top:13px; padding-top:9px; border-top:1px solid #4a4234; color:#8a8272; font-size:13px; }
  /* The bench screen. The weapon is the real viewmodel, turned on the spot
     and pushed out to arm's length; everything here is drawn over it. */
  #b9hud .benchwrap { position:absolute; inset:0; display:none; }
  #b9hud .bsvg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
  #b9hud .bmarks { position:absolute; inset:0; }
  #b9hud .mark { position:absolute; transform:translate(-50%,-50%); white-space:nowrap;
    font-size:13px; letter-spacing:.08em; color:#e8ddc8; text-shadow:0 0 6px #000; }
  #b9hud .mark .plus { display:inline-block; width:23px; height:23px; line-height:21px; text-align:center;
    border:1px solid #e8ddc8; border-radius:50%; font-size:16px; background:rgba(8,6,4,.55); }
  #b9hud .mark .nm { display:inline-block; padding:3px 9px; border:1px solid #6b6455;
    background:rgba(8,6,4,.72); }
  #b9hud .mark.sel .plus, #b9hud .mark.sel .nm { border-color:#ffd27a; color:#ffd27a; }
  #b9hud .mark .slot { display:block; font-size:10.5px; color:#8a8272; margin-bottom:3px; letter-spacing:.14em; }
  #b9hud .bhint { position:absolute; left:50%; bottom:5%; transform:translateX(-50%); color:#8a8272;
    font-size:13px; letter-spacing:.06em; text-align:center; }
  #b9hud .bhint b { color:#ffd27a; font-weight:normal; }
  /* The controls, spelled out and always on screen while the bench is open.
     A hint strip along the bottom is fine for a control you already know;
     it is no use at all for a screen nobody has seen before, and the bench
     has ten of them. */
  #b9hud .bkeys { position:absolute; left:3%; top:50%; transform:translateY(-50%);
    width:min(252px,24vw); background:rgba(8,6,4,.92); border:1px solid #5a5140; padding:13px 15px;
    font-size:12.5px; letter-spacing:.05em; }
  #b9hud .bkeys h4 { margin:0 0 4px; font-size:12px; font-weight:normal; color:#e8ddc8; letter-spacing:.14em; }
  #b9hud .bkeys .step { color:#8a8272; font-size:11.5px; margin:0 0 10px; line-height:1.45; }
  #b9hud .bkeys .step b { color:#ffd27a; font-weight:normal; }
  #b9hud .bkeys dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:4px 10px; align-items:baseline; }
  #b9hud .bkeys dt { color:#ffd27a; white-space:nowrap; }
  #b9hud .bkeys dd { margin:0; color:#c8bfa8; }
  #b9hud .bkeys .pad { margin-top:9px; padding-top:8px; border-top:1px solid #4a4234; color:#6f8fa8; font-size:11.5px; line-height:1.5; }
  #b9hud .bkeys .pad b { color:#7ad7ff; font-weight:normal; }
  /* Settings. One screen, four positions, and it says what each one costs
     — a preset called "high" that does not say what it is for is a guess
     the player has to make with their own frame rate. */
  #b9hud .settings { position:absolute; inset:0; background:rgba(6,5,4,.86); display:none;
    align-items:center; justify-content:center; }
  #b9hud .settings .panel { width:min(640px,88vw); background:rgba(12,10,8,.96); border:1px solid #5a5140;
    padding:22px 26px; letter-spacing:.05em; }
  #b9hud .settings h3 { margin:0 0 4px; font-size:19px; font-weight:normal; color:#e8ddc8; letter-spacing:.16em; }
  #b9hud .settings .sub { color:#8a8272; font-size:12.5px; margin-bottom:16px; }
  #b9hud .settings .opt { display:flex; justify-content:space-between; align-items:baseline;
    padding:9px 12px; border:1px solid transparent; font-size:15px; color:#c8bfa8; }
  #b9hud .settings .opt.sel { border-color:#ffd27a; background:rgba(255,210,122,.10); color:#ffd27a; }
  /* The badge lives inside the right-hand column rather than after it.
     Appended to the row it became a third flex item and shoved the frame
     rate out of line with every other row. */
  #b9hud .settings .opt .rt { display:flex; align-items:baseline; gap:12px;
    justify-content:flex-end; min-width:150px; white-space:nowrap; }
  #b9hud .settings .opt .use { color:#8ce8a0; font-size:11px; width:44px; text-align:right; }
  #b9hud .settings .opt .why { display:block; color:#8a8272; font-size:12px; margin-top:3px; }
  #b9hud .settings .opt .fps { color:#8ce8a0; font-size:12.5px; white-space:nowrap; }
  #b9hud .settings .sec { margin:18px 0 8px; font-size:12.5px; letter-spacing:.2em; color:#8a8272; }
  #b9hud .settings .sfoot { margin-top:16px; padding-top:11px; border-top:1px solid #4a4234;
    color:#8a8272; font-size:12.5px; }
  #b9hud .settings .sfoot b { color:#ffd27a; font-weight:normal; }
  /* Damage diagram. A body drawn out of eleven boxes, each labelled with
     what this gun actually does to it. */
  #b9hud .bdmg { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:min(330px,30vw); background:rgba(8,6,4,.90); border:1px solid #5a5140; padding:14px 16px;
    display:none; font-size:13px; letter-spacing:.05em; }
  #b9hud .bdmg h4 { margin:0 0 10px; font-size:14px; font-weight:normal; color:#e8ddc8; letter-spacing:.10em; }
  #b9hud .bdmg .body { position:relative; height:270px; margin:4px 0 8px; }
  #b9hud .bdmg .reg { position:absolute; border:1px solid #6b6455; background:rgba(120,96,60,.20);
    font-size:10.5px; color:#e8ddc8; text-align:center; }
  #b9hud .bdmg .reg.crit { border-color:#c8562e; background:rgba(200,86,46,.26); }
  #b9hud .bdmg .reg span { position:absolute; right:3px; top:50%; transform:translateY(-50%);
    color:#ffd27a; font-size:11.5px; }
  #b9hud .bdmg .reg { padding-right:26px; box-sizing:border-box; line-height:1.1; }
  #b9hud .bdmg .note { color:#8a8272; font-size:11.5px; margin-top:6px; }
  #b9hud .subs { position:absolute; left:50%; bottom:12%; transform:translateX(-50%); width:min(760px,80vw);
    text-align:center; font-size:18px; text-shadow:0 2px 3px #000; display:none; }
  #b9hud .subs .who { font-size:12px; letter-spacing:.3em; display:block; margin-bottom:4px; }
  /* Shown only while a controller is live and the pointer is not locked --
     the state in which a stray press lands on browser furniture and takes
     the tab with it. It says the one thing that fixes it. */
  #b9hud .cursorwarn { position:absolute; left:50%; top:6%; transform:translateX(-50%);
    font-size:14px; letter-spacing:.18em; color:#ffd27a; background:rgba(0,0,0,.62);
    border:1px solid #6a5a34; padding:7px 16px; display:none; text-align:center; }
  #b9hud .banner { position:absolute; left:50%; top:20%; transform:translateX(-50%); font-size:34px;
    letter-spacing:.28em; opacity:0; text-shadow:0 0 22px currentColor; transition:opacity .3s; }
  #b9hud .advig { position:absolute; inset:0; opacity:0; transition:opacity .05s;
    background:radial-gradient(ellipse at center, transparent 34%, rgba(0,0,0,.82) 92%); }
  #b9hud .cross { transition:opacity .08s; }
  /* The scope picture.

     A seven-power optic drawn as geometry is a losing proposition: the
     viewmodel shares the camera, so narrowing the field of view to zoom
     magnifies the rifle by exactly as much as it magnifies the target, and
     the scope swells until the tube is most of the screen and the eye
     relief is two centimetres. Every game that ships a sniper solves it
     the same way — put the rifle away at full magnification and draw the
     sight picture instead. The black is the tube, the ring is the ocular
     bell, and the world shows through the hole at whatever field of view
     the optic is worth.

     The surround is one enormous box-shadow spread rather than a mask, so
     it covers any aspect ratio and needs nothing from the compositor. */
  #b9hud .scope { position:absolute; inset:0; opacity:0; pointer-events:none;
    transition:opacity .06s; --sd:64vmin; }
  #b9hud .scope .glass { position:absolute; left:50%; top:50%; margin:calc(var(--sd) / -2);
    width:var(--sd); height:var(--sd); border-radius:50%;
    background:radial-gradient(circle at 38% 30%, rgba(150,190,210,.09), transparent 56%);
    box-shadow:0 0 0 9999px #000, inset 0 0 38px 12px rgba(0,0,0,.7),
      inset 0 0 0 2px rgba(30,27,23,.95); }
  /* The reticle rides inside the tube, so it is clipped by the bell the way
     a real one is and the posts run out to the edge instead of past it. */
  #b9hud .scope .ret { position:absolute; left:50%; top:50%; width:var(--sd); height:var(--sd);
    margin:calc(var(--sd) / -2); border-radius:50%; overflow:hidden; }
  #b9hud .scope i { position:absolute; display:block; background:#0b0908; }
  #b9hud .scope .vh { left:50%; width:3.2px; margin-left:-1.6px; }
  #b9hud .scope .hz { top:50%; height:3.2px; margin-top:-1.6px; }
  /* Duplex: four thick posts stopping short of the middle, thin arms
     carrying on in. It is what keeps a crosshair from disappearing into a
     dark target, and it is the reason a scope reads as a scope. */
  #b9hud .scope .fine { opacity:.85; }
  #b9hud .scope .dot { left:50%; top:50%; width:2.6px; height:2.6px; margin:-1.3px 0 0 -1.3px;
    border-radius:50%; background:#c8352a; box-shadow:0 0 6px #ff5a3c; }
  #b9hud .hitflash { position:absolute; inset:0; opacity:0; background:#8c0a06; mix-blend-mode:screen; }
  #b9hud .dmg { position:absolute; inset:0; opacity:0;
    background:radial-gradient(ellipse at center, transparent 42%, rgba(140,10,6,.75) 100%); transition:opacity .25s; }
  #b9hud .title { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    justify-content:center; background:rgba(4,3,2,.9); transition:opacity 1.4s; pointer-events:auto; }
  #b9hud .title h1 { font-size:64px; letter-spacing:.3em; color:#e8ddc8; margin:0 0 8px; font-weight:400; }
  #b9hud .title h1 span { color:#b3221c; }
  #b9hud .title p { color:#8c7f68; letter-spacing:.2em; font-size:14px; margin:4px 0; }
  /* Ten of them, and the one you pick is remembered. Names only — the bio
     of whichever is under the cursor sits underneath, so the grid stays a
     grid instead of ten paragraphs. */
  #b9hud .picker { margin:20px 0 2px; text-align:center; }
  #b9hud .picker .plbl { display:block; font-size:11px; letter-spacing:.28em; color:#6b6455; margin-bottom:10px; }
  #b9hud .pgrid { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; max-width:min(720px,86vw); }
  #b9hud .pgrid .who { padding:6px 12px; border:1px solid #4a4234; color:#8c7f68; font-size:11.5px;
    letter-spacing:.16em; cursor:pointer; pointer-events:auto; background:rgba(0,0,0,.25); }
  #b9hud .pgrid .who:hover { border-color:#6b6455; color:#c8bfa8; }
  #b9hud .pgrid .who.on { border-color:#ffd27a; color:#ffd27a; background:rgba(255,210,122,.10); }
  #b9hud .pbio { margin-top:11px; min-height:34px; max-width:min(640px,84vw); color:#8a8272;
    font-size:12.5px; letter-spacing:.04em; line-height:1.5; }
  #b9hud .stam { position:absolute; left:50%; bottom:19%; transform:translateX(-50%); width:150px; height:3px;
    background:rgba(0,0,0,.55); opacity:0; transition:opacity .25s; }
  #b9hud .stamfill { height:100%; background:#e8ddc8; width:100%; }
  #b9hud .shield { position:absolute; right:26px; bottom:118px; font-size:12px; letter-spacing:.22em; color:#8c7f68; }
  /* The ten seconds after the bench. A ring rather than a number, because
     what you need to know while running is how much of it is left, not what
     second it is. */
  #b9hud .grace { position:absolute; left:50%; top:14%; transform:translateX(-50%); text-align:center;
    opacity:0; transition:opacity .2s; }
  #b9hud .grace .lbl { display:block; font-size:11px; letter-spacing:.28em; color:#7ad7ff; margin-bottom:5px; }
  #b9hud .grace .bar { width:190px; height:3px; background:rgba(0,0,0,.5); }
  #b9hud .grace .fill { height:100%; background:#7ad7ff; width:100%; box-shadow:0 0 8px #7ad7ff; }
  #b9hud .grace .num { display:block; margin-top:5px; font-size:22px; color:#e8ddc8; }
  #b9hud .perks { position:absolute; left:26px; bottom:112px; font-size:11px; letter-spacing:.18em; }
  #b9hud .pdelta { position:absolute; right:30px; bottom:100px; font-size:18px; color:#ffd27a; opacity:0; }
  #b9hud .flick { animation:b9flick 1.4s ease-out; }
  @keyframes b9flick { 0%{opacity:0} 12%{opacity:1} 22%{opacity:.2} 34%{opacity:1} 44%{opacity:.35} 60%{opacity:1} 100%{opacity:1} }
  `;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'b9hud';
  root.innerHTML = `
    <div class="dmg"></div><div class="hitflash"></div><div class="advig"></div><div class="scope">
      <div class="glass"></div>
      <div class="ret">
        <i class="vh" style="top:0;height:34%"></i><i class="vh" style="top:66%;height:34%"></i>
        <i class="hz" style="left:0;width:34%"></i><i class="hz" style="left:66%;width:34%"></i>
        <i class="vh fine" style="top:34%;height:32%;width:1px;margin-left:-.5px"></i>
        <i class="hz fine" style="left:34%;width:32%;height:1px;margin-top:-.5px"></i>
        <i class="dot"></i>
      </div>
    </div><div class="cross"></div><div class="hitm"></div>
    <div class="roundlbl">ROUND</div><div class="round">1</div>
    <div class="points">500</div><div class="pdelta"></div>
    <div class="ammo"><span class="wname">SIDEARM</span><span class="nums">7 / 42</span></div>
    <div class="prompt"></div>
    <div class="cursorwarn">CLICK ONCE TO LOCK THE CURSOR — the pad is moving it</div>
    <div class="subs"><span class="who"></span><span class="text"></span></div>
    <div class="banner"></div>
    <div class="grace"><span class="lbl">CLEAR &nbsp;·&nbsp; THEY CANNOT TOUCH YOU</span>
      <div class="bar"><div class="fill"></div></div><span class="num">10</span></div>
    <div class="stam"><div class="stamfill"></div></div>
    <div class="shield"></div><div class="perks"></div>
    <div class="benchwrap">
      <svg class="bsvg"></svg>
      <div class="bmarks"></div>
      <div class="bench"><div class="bhead"></div><div class="brow"></div><div class="bfoot"></div></div>
      <div class="bkeys"></div>
      <div class="bhint"></div>
      <div class="bdmg"></div>
    </div>
    <div class="settings"><div class="panel">
      <h3>SETTINGS</h3><div class="sub">GRAPHICS</div>
      <div class="sopts"></div>
      <div class="sfoot"></div>
    </div></div>
    <div class="title"><h1>BUNKER <span>NINE</span></h1>
      <p>THE DEAD COME THROUGH THE WINDOWS. POINTS BUY EVERYTHING.</p>
      <p>WASD MOVE &nbsp;·&nbsp; MOUSE LOOK &nbsp;·&nbsp; RIGHT-CLICK AIM &nbsp;·&nbsp; SHIFT SPRINT</p>
      <p>F USE &nbsp;·&nbsp; R RELOAD &nbsp;·&nbsp; Q SWAP &nbsp;·&nbsp; SPACE JUMP</p>
      <p>V KNIFE &nbsp;·&nbsp; G SHIELD &nbsp;·&nbsp; CTRL SLIDE (ADRENALINE)</p>
      <p style="color:#ffd27a">AT THE WORKBENCH &nbsp; A/D SLOT &nbsp;·&nbsp; W/S PART &nbsp;·&nbsp; F FIT &nbsp;·&nbsp; TAB LEAVE</p>
      <p style="color:#7ad7ff">CONTROLLER &nbsp; STICKS MOVE/LOOK &nbsp;·&nbsp; RT FIRE &nbsp;·&nbsp; LT AIM &nbsp;·&nbsp; L3 SPRINT &nbsp;·&nbsp; RB KNIFE &nbsp;·&nbsp; B USE/SLIDE &nbsp;·&nbsp; X RELOAD &nbsp;·&nbsp; Y SWAP</p>
      <p style="color:#6b6455">PICK A NAME BELOW &nbsp;·&nbsp; ON A PAD, LB / RB CHANGE IT</p>
      <p class="padstate" style="color:#6b6455">NO CONTROLLER DETECTED — press a button on it to wake it</p>
      <div class="picker"><span class="plbl">WHO ARE YOU TONIGHT?</span>
        <div class="pgrid"></div><div class="pbio"></div></div>
      <p class="go" style="color:#e8ddc8;margin-top:22px">CLICK TO STAND POST</p></div>`;
  document.body.appendChild(root);
  const $ = (c) => root.querySelector(c);
  const els = {
    round: $('.round'), points: $('.points'), ammo: $('.ammo .nums'), wname: $('.ammo .wname'),
    prompt: $('.prompt'), cursorwarn: $('.cursorwarn'), subs: $('.subs'), subWho: $('.subs .who'), subText: $('.subs .text'), vig: $('.advig'), scope: $('.scope'), glass: $('.scope .glass'),
    grace: $('.grace'), graceFill: $('.grace .fill'), graceNum: $('.grace .num'),
    flash: $('.hitflash'),
    banner: $('.banner'), dmg: $('.dmg'), title: $('.title'), hitm: $('.hitm'), pdelta: $('.pdelta'),
    cross: $('.cross'), stam: $('.stam'), stamFill: $('.stamfill'), shield: $('.shield'), perks: $('.perks'),
    bench: $('.bench'), bhead: $('.bhead'), brow: $('.brow'), bfoot: $('.bfoot'),
    benchwrap: $('.benchwrap'), bsvg: $('.bsvg'), bmarks: $('.bmarks'),
    bhint: $('.bhint'), bdmg: $('.bdmg'), bkeys: $('.bkeys'),
    settings: $('.settings'), sopts: $('.sopts'), sfoot: $('.sfoot'),
  };
  let subTimer = 0, hmTimer = 0, pdAcc = 0, pdTimer = 0, bnTimer = 0;
  return {
    els,
    round(n) { els.round.textContent = n; els.round.classList.remove('flick'); void els.round.offsetWidth; els.round.classList.add('flick'); },
    points(n) { els.points.textContent = n; },
    pointsDelta(n) { pdAcc += n; els.pdelta.textContent = '+' + pdAcc; els.pdelta.style.opacity = 1; clearTimeout(pdTimer); pdTimer = setTimeout(() => { els.pdelta.style.opacity = 0; pdAcc = 0; }, 700); },
    ammo(P) {
      const am = P.ammoFor(P.equipped()) || { mag: 0, reserve: 0 };
      const show = (n) => (n === Infinity ? '∞' : n);
      els.ammo.textContent = `${show(am.mag)} / ${show(am.reserve)}`;
      els.wname.textContent = P.spec().slotName
        + (P.goldAmmo ? `   ★${P.gold}` : '')
        + (P.nades > 0 ? `   ✚${P.nades}` : '');
    },
    flashWeapon(name) { els.wname.textContent = name; },
    /* The settings screen. Same shape as the bench: rendered from state,
       never patched, because it is nine lines of markup. */
    settings(st) {
      if (!st) { els.settings.style.display = 'none'; return; }
      els.settings.style.display = 'flex';
      const gfx = GRAPHICS_ORDER.map((k, i) => {
        const g = GRAPHICS[k];
        const cls = ['opt', i === st.index ? 'sel' : '', k === st.current ? 'on' : ''].join(' ');
        return `<div class="${cls}"><span>${g.name}<span class="why">${g.blurb}</span></span>`
          + `<span class="rt"><span class="fps">${g.target}</span>`
          + `<span class="use">${k === st.current ? 'IN USE' : ''}</span></span></div>`;
      }).join('');
      const tog = TOGGLE_ORDER.map((k, j) => {
        const T = TOGGLES[k], on = !!st.toggles[k];
        const i = GRAPHICS_ORDER.length + j;
        const cls = ['opt', i === st.index ? 'sel' : ''].join(' ');
        return `<div class="${cls}"><span>${T.name}<span class="why">${T.blurb}</span></span>`
          + `<span class="rt"><span class="fps" style="color:${on ? '#8ce8a0' : '#6b6455'}">`
          + `${on ? 'ON' : 'OFF'}</span><span class="use"></span></span></div>`;
      }).join('');
      els.sopts.innerHTML = gfx + '<div class="sec">GAMEPLAY</div>' + tog;
      els.sfoot.innerHTML = '<b>W / S</b> or <b>↑ ↓</b> choose &nbsp;·&nbsp; <b>F</b> or <b>ENTER</b> apply or flip'
        + ' &nbsp;·&nbsp; <b>ESC</b> back to the fight'
        + '<br><span style="color:#6f8fa8">Controller &nbsp; <b style="color:#7ad7ff">Stick ↑↓</b> choose'
        + ' &nbsp; <b style="color:#7ad7ff">X</b> apply &nbsp; <b style="color:#7ad7ff">◯</b> back</span>'
        + '<br>Your choice is remembered on this machine.';
    },

    /* The bench screen. Rendered from state every time it changes rather
       than patched in place — it is a handful of markers and a short list,
       and rebuilding is cheaper than keeping a second copy of the truth. */
    bench(state) {
      if (!state) {
        if (els.benchwrap.style.display !== 'none') els.cross.style.display = '';
        els.benchwrap.style.display = 'none';
        return;
      }
      els.benchwrap.style.display = 'block';
      // The room's HUD has no business over a screen you are reading.
      els.subs.style.display = 'none';
      els.cross.style.display = 'none';

      /* Preview: everything except the weapon goes away. */
      const show = !state.preview;
      els.bmarks.style.display = show ? 'block' : 'none';
      els.bsvg.style.display = show ? 'block' : 'none';

      /* Anchor markers, one per slot, sitting on the part of the gun they
         belong to, with a leader line back to it.

         Their labels are clamped into the band between the two panels. A
         marker sits where its part is, and on a long gun the muzzle end of
         that is off behind the control list — so the label for the barrel
         was rendering half underneath the panel explaining how to fit one.
         The leader line still ends at the real anchor, so nothing lies
         about where the part is; only the text moves. */
      const W = els.benchwrap.clientWidth || 1;
      const padL = Math.min(252, W * 0.24) + W * 0.03 + 14;
      const padR = W - (Math.min(600, W * 0.58) + 44) - W * 0.03 - 14;
      const clampX = (x) => (state.picking || !state.preview
        ? Math.max(padL, Math.min(padR > padL ? padR : x, x))
        : x);
      els.bmarks.innerHTML = state.marks.map((m) => {
        const cls = ['mark', m.slot === state.slot ? 'sel' : ''].join(' ');
        const body = m.fitted
          ? `<span class="nm">${m.fitted}</span>`
          : '<span class="plus">+</span>';
        return `<div class="${cls}" style="left:${clampX(m.lx)}px; top:${m.ly}px">`
          + `<span class="slot">${ATTACH.slotName[m.slot]}</span>${body}</div>`;
      }).join('');
      /* Then push each label clear of the panels by its own width.

         Clamping the anchor point is not enough: a label is centred on it,
         so "Skull Splitter Barrel" clamped to the edge of the control list
         still hangs half of itself underneath. Nothing knows how wide a
         label is until it has been laid out, so the shove happens after,
         measured off the panels that are actually on screen. */
      const shoved = [];
      const boxOf = (el) => (el && el.style.display !== 'none' ? el.getBoundingClientRect() : null);
      const wrapBox = els.benchwrap.getBoundingClientRect();
      const guards = [boxOf(els.bkeys), boxOf(els.bench)].filter(Boolean);
      const nodes = els.bmarks.children;
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i], m = state.marks[i];
        let x = clampX(m.lx);
        const r = el.getBoundingClientRect();
        const half = r.width / 2 + 12;
        const top = r.top - wrapBox.top, bot = top + r.height;
        for (const g of guards) {
          const gt = g.top - wrapBox.top, gb = g.bottom - wrapBox.top;
          if (bot < gt || top > gb) continue;      // clear of it vertically
          const gl = g.left - wrapBox.left, gr = g.right - wrapBox.left;
          if (x + half > gl && x - half < gr) {
            // Out the near side, whichever that is.
            x = (x < (gl + gr) / 2) ? gl - half : gr + half;
          }
        }
        el.style.left = x + 'px';
        shoved.push(x);
      }

      const w = els.bsvg.clientWidth || 1, h = els.bsvg.clientHeight || 1;
      els.bsvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      els.bsvg.innerHTML = state.marks.map((m, i) => {
        const c = m.slot === state.slot ? '#ffd27a' : '#8a8272';
        const lx = shoved[i] != null ? shoved[i] : clampX(m.lx);
        return `<line x1="${m.ax}" y1="${m.ay}" x2="${lx}" y2="${m.ly}" stroke="${c}" stroke-width="1"/>`
          + `<circle cx="${m.ax}" cy="${m.ay}" r="2.5" fill="${c}"/>`;
      }).join('');

      // The option list, only while a slot is actually being worked on.
      if (state.picking && show) {
        els.bench.style.display = 'block';
        els.bhead.textContent = `${state.weapon}  —  ${ATTACH.slotName[state.slot]}`;
        els.brow.innerHTML = state.options.map((o, i) => {
          /* A part you cannot have gets a great X drawn across the whole
             row -- two lines corner to corner, not a word in grey you
             have to read to find out. There are two reasons a row is
             crossed and they say different things: `banned` is "not on
             this weapon, ever", `full` is "not until you take something
             else off", and the second one is your own doing so it says
             so. */
          const blocked = o.banned || o.full;
          const cls = ['opt', i === state.index ? 'sel' : '', o.fitted ? 'fitted' : '',
            blocked ? 'banned' : '', blocked ? 'crossed' : ''].join(' ');
          const right = o.banned ? 'will not fit this weapon'
            : o.full ? `${state.maxFitted} parts already on it`
            : o.fitted ? 'FITTED  ·  [F] strip it off'
            : `${o.cost}`;
          const pros = (o.pros || []).map((t) => `<span style="color:#8ce8a0">+ ${t}</span>`).join('&nbsp; ');
          const cons = (o.cons || []).map((t) => `<span style="color:#e07a5a">− ${t}</span>`).join('&nbsp; ');
          return `<div class="${cls}"><span>${o.name}<br><span class="why">${o.blurb}</span>`
            + (pros || cons ? `<br><span class="why">${pros} ${cons}</span>` : '')
            + `</span><span>${right}</span></div>`;
        }).join('');
        const full = state.fitted >= state.maxFitted;
        els.bfoot.innerHTML = '<span style="color:#ffd27a">W / S</span> part &nbsp;&nbsp;'
          + '<span style="color:#ffd27a">F</span> fit or strip &nbsp;&nbsp;'
          + '<span style="color:#ffd27a">TAB</span> back &nbsp;&nbsp;&nbsp;'
          + `<span style="color:${full ? '#c8562e' : '#8a8272'}">`
          + `${state.fitted} of ${state.maxFitted} parts</span> &nbsp;&nbsp;&nbsp;`
          + `points <span style="color:#e8ddc8">${state.points}</span>`;
      } else {
        els.bench.style.display = 'none';
      }

      els.bhint.innerHTML = state.preview
        ? '<b>P</b> leave preview &nbsp;·&nbsp; <b>A / D</b> turn it &nbsp;·&nbsp; <b>TAB</b> put it down'
        : '<b>A / D</b> slot &nbsp;·&nbsp; <b>Q / E</b> turn it &nbsp;·&nbsp; <b>F</b> work on it'
          + ' &nbsp;·&nbsp; <b>P</b> preview' + (state.camo ? ' &nbsp;·&nbsp; <b>C</b> camo' : '')
          + ' &nbsp;·&nbsp; hold <b>SHIFT</b> damage &nbsp;·&nbsp; <b>TAB</b> put it down';

      /* The full control list. Two states, because the keys mean different
         things depending on whether you are choosing a slot or choosing a
         part for it, and a list that shows both at once is the reason
         people cannot work out how to fit anything. */
      els.bkeys.style.display = show ? 'block' : 'none';
      if (show) {
        const rows = state.picking
          ? [['W / S', 'move through the parts'],
             ['F', 'fit the highlighted part'],
             ['F', 'on a fitted part, strip it off'],
             ['Q / E', 'turn the weapon'],
             ['TAB', 'back to the slots'],
             ['P', 'preview — hide all of this'],
             ['hold SHIFT', 'damage by placement']]
          : [['A / D', 'choose a slot'],
             ['F', 'open that slot'],
             ['Q / E', 'turn the weapon'],
             ['P', 'preview — hide all of this']]
            .concat(state.camo ? [['C', 'switch the camo']] : [])
            .concat([['hold SHIFT', 'damage by placement'],
                     ['TAB', 'put the weapon down']]);
        els.bkeys.innerHTML =
          '<h4>WORKING ON A WEAPON</h4>'
          + '<p class="step">' + (state.picking
            ? 'Pick a part and press <b>F</b>. It comes off the shelf, costs points, and goes on the gun where you can see it.'
            : 'A slot with a <b>+</b> is empty. Line one up, press <b>F</b>, then pick a part.')
          + '</p><dl>'
          + rows.map(([k, t]) => `<dt>${k}</dt><dd>${t}</dd>`).join('')
          + '</dl>'
          /* This panel claimed a stick that was not read and an X that
             did nothing. Both are true now, and it names the buttons the
             rest of the game uses rather than a second layout. */
          + '<div class="pad">Controller<br><b>' + (state.picking ? 'Stick / D-pad ↑↓' : 'Stick / D-pad ←→')
          + '</b> move &nbsp; <b>A</b> ' + (state.picking ? 'fit or strip' : 'open the slot')
          + '<br><b>B</b> back &nbsp; <b>Y</b> preview &nbsp; <b>LB / RB</b> turn'
          + '<br><b>LT</b> damage' + (state.camo ? ' &nbsp; <b>X</b> camo' : '') + '</div>';
      }

      // The damage diagram, on a hold.
      if (state.damage && show) {
        els.bdmg.style.display = 'block';
        els.bdmg.innerHTML = `<h4>${state.weapon} — DAMAGE BY PLACEMENT</h4><div class="body">`
          + state.damage.map((d) => `<div class="reg${d.crit ? ' crit' : ''}" style="left:${d.x}%; `
            + `top:${d.y}%; width:${d.w}%; height:${d.h}%">${d.short}<span>${d.dmg}</span></div>`).join('')
          + `</div><div class="note">${state.damageNote}</div>`;
      } else els.bdmg.style.display = 'none';
    },
    prompt(text, warn) {
      if (!text) { els.prompt.style.display = 'none'; return; }
      els.prompt.style.display = 'block';
      els.prompt.innerHTML = `<span class="key">[F]</span> ${text}`;
      els.prompt.style.borderColor = warn ? '#b3221c' : '#4a4234';
    },
    subtitle(cast, text, dur) {
      els.subs.style.display = 'block';
      els.subWho.textContent = cast.name;
      els.subWho.style.color = cast.color;
      els.subText.textContent = '"' + text + '"';
      clearTimeout(subTimer);
      subTimer = setTimeout(() => { els.subs.style.display = 'none'; }, dur * 1000 + 400);
    },
    banner(text, color) {
      els.banner.textContent = text;
      els.banner.style.color = color || '#e8ddc8';
      els.banner.style.opacity = 1;
      clearTimeout(bnTimer);
      bnTimer = setTimeout(() => { els.banner.style.opacity = 0; }, 2200);
    },
    hitmark(head) {
      els.hitm.classList.toggle('head', !!head);
      els.hitm.style.opacity = 1;
      clearTimeout(hmTimer);
      hmTimer = setTimeout(() => { els.hitm.style.opacity = 0; }, 90);
    },
    /* The red at the edges. Below the low mark it pulses with the heart
       rather than sitting still, which is the difference between a hud
       element and a character who is in trouble. */
    damage(frac, lowT) {
      let o = Math.min(1, (1 - frac) * 1.12);
      if (lowT > 0) {
        const beat = 60 / 110;
        const ph = (lowT % beat) / beat;
        o = Math.min(1, o * (0.86 + Math.pow(1 - ph, 6) * 0.5));
      }
      els.dmg.style.opacity = o;
    },
    stamina(frac, athlete) {
      els.stam.style.opacity = frac < 0.999 ? 1 : 0;
      els.stamFill.style.width = (frac * 100).toFixed(1) + '%';
      els.stamFill.style.background = athlete ? '#59ff7a' : '#e8ddc8';
    },
    shield(active, cd) {
      if (active > 0) { els.shield.textContent = 'SHIELD ' + Math.ceil(active * SHIELD.duration) + 's'; els.shield.style.color = '#b08cff'; els.shield.style.opacity = 1; }
      else if (cd > 0) { els.shield.textContent = 'SHIELD ' + Math.ceil(cd) + 's'; els.shield.style.color = '#6b6455'; els.shield.style.opacity = 1; }
      else { els.shield.textContent = 'SHIELD READY [G]'; els.shield.style.color = '#8c7f68'; els.shield.style.opacity = 1; }
    },
    perks(held) {
      els.perks.innerHTML = Object.keys(held).map((k) =>
        `<span style="color:#${PERKS[k].color.toString(16).padStart(6, '0')}">${PERKS[k].name}</span>`).join(' &nbsp;·&nbsp; ');
    },
    /* Aiming hides the crosshair — the sights are the crosshair now, and
       leaving a dot floating over the front blade is the tell that a game's
       iron sights are decorative. */
    aim(ads, sprinting, scoped) {
      els.cross.style.opacity = (1 - ads) * (sprinting ? 0.25 : 1);
      root.style.setProperty('--ads', ads.toFixed(3));
      els.vig.style.opacity = (ads * 0.55).toFixed(3);
      /* The glass only comes up over the last of the movement, so the rifle
         is still visible while it is being shouldered and only gives way
         once the eye is behind the optic. */
      const k = scoped ? Math.max(0, (ads - 0.72) / 0.28) : 0;
      els.scope.style.opacity = k.toFixed(3);
      // The tube opens up into place rather than snapping to full size.
      els.scope.style.setProperty('--sd', (64 - 10 * (1 - k)).toFixed(2) + 'vmin');
    },
    /* The tube drifts, the reticle does not.

       Recoil in this game is applied to the camera itself, so the middle of
       the screen already is where the bullet goes; moving the crosshair off
       it would be a lie about the point of aim. What can move honestly is
       the eye behind the glass, so the bell wanders a few pixels with the
       shooter's breathing and the crosshair stays put. */
    scopeOffset(x, y) {
      els.glass.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    },
    /* Left of the ten seconds. Zero hides it. */
    grace(t, total) {
      els.grace.style.opacity = t > 0 ? 1 : 0;
      if (t <= 0) return;
      els.graceFill.style.width = ((t / total) * 100).toFixed(1) + '%';
      els.graceNum.textContent = Math.ceil(t);
    },
    /* One frame of red across the whole screen, gone in a fifth of a second.
       Separate from the wound vignette, which is a standing state — this is
       the moment of contact. */
    hitFlash(k) {
      els.flash.style.transition = 'none';
      els.flash.style.opacity = Math.min(0.75, k).toFixed(2);
      // Two frames, so the browser has a value to animate away from.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        els.flash.style.transition = 'opacity .22s ease-out';
        els.flash.style.opacity = 0;
      }));
    },
    /* The character grid on the title screen. Rendered once, then only the
       selected class and the bio line move. */
    picker(current, onPick) {
      const grid = els.title.querySelector('.pgrid');
      const bio = els.title.querySelector('.pbio');
      if (!grid) return;
      const paint = (id) => {
        for (const el of grid.children) el.className = 'who' + (el.dataset.id === id ? ' on' : '');
        bio.textContent = HEROES[id] ? HEROES[id].bio : '';
      };
      grid.innerHTML = HERO_ORDER.map((id) =>
        `<div class="who" data-id="${id}">${HEROES[id].name}</div>`).join('');
      for (const el of grid.children) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          paint(el.dataset.id);
          onPick(el.dataset.id);
        });
        el.addEventListener('mouseenter', () => {
          bio.textContent = HEROES[el.dataset.id].bio;
        });
        el.addEventListener('mouseleave', () => paint(current()));
      }
      paint(current());
    },
    hideTitle() { els.title.style.opacity = 0; setTimeout(() => { els.title.style.display = 'none'; }, 1500); },
    gameOver(round, kills) {
      // The update loop stops calling aim() once you are down, so the glass
      // would otherwise stay up over the death screen.
      els.scope.style.opacity = 0;
      els.title.innerHTML = `<h1 style="color:#b3221c">YOU FELL</h1>
        <p>SURVIVED TO ROUND ${round} &nbsp;·&nbsp; ${kills} OF THE DEAD PUT DOWN</p>
        <p class="go" style="color:#e8ddc8;margin-top:22px;cursor:pointer">CLICK TO STAND POST AGAIN</p>`;
      els.title.style.display = 'flex';
      els.title.style.opacity = 1;
      els.title.querySelector('.go').addEventListener('click', () => location.reload());
    },
  };
}

/* ---------------- rounds ---------------- */

function startRound(game, S, hud, sfx) {
  S.round++;
  S.toSpawn = ROUNDS.countFor(S.round);
  /* One of him on round ten, and every fourth round after. Announced,
     because a thing with a thousand health arriving unannounced is not a
     fight, it is an ambush. */
  S.bossDue = S.round >= BOSS.from && (S.round - BOSS.from) % BOSS.everyRounds === 0;
  S.spawnT = 1.5;
  S.betweenRounds = false;
  hud.round(S.round);
  sfx.roundSting();
  S.bark(S.round === 1 ? 'start' : (S.round >= 15 && S.round % 5 === 0 ? 'deepRound' : 'roundStart'), true);
  if (S.round > 1 && S.round % 2 === 0) {
    const pool = LINES.roundStart;
    S.voice(pool[Math.floor(Math.random() * pool.length)]);
  }
}

function updateRounds(game, S, P, hud, sfx, dt) {
  const alive = S.zombies.filter((z) => !z.dead).length;

  if (S.betweenRounds) {
    S.lullT -= dt;
    if (S.lullT <= 0) startRound(game, S, hud, sfx);
    return;
  }

  if (S.toSpawn > 0 && alive < ROUNDS.maxAlive(S.round)) {
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      S.spawnT = ROUNDS.spawnGap(S.round);
      // Prefer windows in or beside the player's room, like a director
      // keeping the pressure where the player is looking.
      const pr = roomOf(P.actor.position);
      const options = S.windows.filter((w) => S.activeWindows.includes(w.def.id));
      const near = options.filter((w) => w.def.room === pr);
      const pickFrom = near.length && Math.random() < 0.65 ? near : options;
      const win = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      if (S.bossDue) {
        const bz = win && spawnZombie(game, S, win, 'boss');
        if (bz) {
          S.bossDue = false;
          S.toSpawn--;
          hud.banner('SOMETHING BIG IS COMING THROUGH', '#9ad8ff');
          S.voice(LINES.boss);
          S.bark('boss', true);
          // You feel him arrive before you see him.
          addShake(S, 0.10, 1.6);
          game.audio.impact(0.9);
        }
      } else {
        const nz = win && spawnZombie(game, S, win);
        if (nz) {
          S.toSpawn--;
          /* The Amalgamation announces itself. It is one in twenty from
             round twelve and it takes half a magazine to notice — the
             player should know which one it is before it is on them. */
          if (nz.kind === 'amalgam') {
            hud.banner('AMALGAMATION', '#c86aff');
            S.voice(LINES.amalgam);
            S.bark('amalgam', true);
            addShake(S, 0.06, 1.1);
            game.audio.impact(0.7);
          }
        }
      }
    }
  }

  const aliveNow = S.zombies.some((z) => !z.dead);
  if (S.toSpawn === 0 && !aliveNow && !S.gameOver) {
    S.betweenRounds = true;
    S.lullT = ROUNDS.lull;
    sfx.roundClear();
    S.bark('roundClear', true);
    /* Stalker. Whoever he is, he is in the treeline and he is watching, and
       he says one thing every fourth round from the fifth on — never twice,
       and never enough to explain himself. */
    S.stalkerSaid = S.stalkerSaid || 0;
    if (S.round >= 5 && (S.round - 5) % 4 === 0 && S.stalkerSaid < 5) {
      S.stalkerSaid++;
      const line = LINES['stalker' + S.stalkerSaid];
      if (line) setTimeout(() => S.voice(line), 3600);
    }
  }
}

/* ---------------- boot ---------------- */

function start(opts = {}) {
  const LE = window.LE;
  _vQuat1 = new LE.Quat();
  _vQuat2 = new LE.Quat();
  _vAxisX = new LE.Vec3(1, 0, 0);
  _vAxisY = new LE.Vec3(0, 1, 0);
  _vAxisZ = new LE.Vec3(0, 0, 1);

  const game = LE.create({
    canvas: opts.canvas || '#game',
    quality: opts.quality || undefined,
    gravity: -19.6,
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  /* Night that you can still fight in. The ground colour matters more than
     it looks: metal and wet concrete take their downward light from it, and
     a black floor drains every surface in the room from below. */
  /* Daylight, and none of it clean. The sun is up and the whole sky is
     working through smoke, which is why the zenith is brown rather than blue
     and the fog is the colour of the field rather than of air. The horizon
     doubles as the reflection probe for every metal in the map, so it stays
     neutral: warm it and the guns turn to brass. */
  game.setSky('day', {
    /* Thinner, and darker.
     *
     * At 0.013 with a fog the colour of dry chalk, everything past thirty
     * metres was the same pale value -- so a burnt wood that is very nearly
     * black in its own material came out as a row of sand-coloured spikes,
     * and the treeline lost its shape as well as its colour. The fog is
     * meant to say "you cannot see how far this goes", not to erase the
     * only thing on the horizon. Half the density, and a colder, dirtier
     * grey that a black trunk can still read against. */
    /* Halfway back. At 0.0072 the far ground stopped being fogged at all
       and a hard bright band appeared along the horizon where the fogged
       part met the unfogged part -- worse than the problem. This keeps the
       air and still leaves a black trunk darker than the sky behind it. */
    fogDensity: 0.0104, fog: 0x7d7669,
    /* The zenith was a neutral grey and the sky was turned up to 2.2, and
       between them every up-facing surface in the map — the roof deck, the
       mud, the top of every crate — came out pale and slightly cool while
       the walls stayed warm. On a smoke-lit day that reads as standing
       water. Warmer above, and less of it. */
    /* `ground` is the downward half of the sky light -- the bounce off the
       mud that fills everything the sun cannot reach. At 0x4c463b that is
       about 0.08 linear, which is not a fill, it is a floor at black: out
       on the field a zombie's HEAD was lit and its whole body below the
       shoulders was a silhouette with pale rips in it. A shadowed thing
       still has to be a thing. Up to about 0.16 linear, which lifts the
       shadows without touching anything the sun is on. */
    zenith: 0x7d7469, horizon: 0x9d9385, ground: 0x6b6456,
    sun: [0.35, 0.62, -0.70], sunColor: 0xffe0b4,
    sunIntensity: 1.6, exposure: 1.08, clouds: 0.55,
    /* The reflection environment inside the bunker.

       The sky doubles as the probe for every metal, and the shader has no
       occlusion, so a receiver indoors reflects a sky it cannot see —
       mostly the dim ground term, since that is the direction the walls are
       in. A metal has no diffuse to fall back on, so the guns came out as
       silhouettes: black shapes with a hard edge and a lamp glint. This is
       the lit concrete standing in for the probe, in the lamps' colour and
       at about their brightness off a wall. The value is a colour, so it is
       read through the same sRGB curve as every other one here: 0x908c85 is
       about 0.28 linear, which is what the sweep that chose it measured. */
    room: 0x908c85,
  });
  game.renderer.post.vignette = 0.28;
  game.renderer.post.grain = 0.022;
  /* Depth precision, which is what all the "glitchy black slabs" were.

     A 24-bit depth buffer over near 0.02 / far 500 is a ratio of 25000 to
     one, and non-linear: by thirty metres out neighbouring surfaces a
     centimetre apart land in the same depth bucket and fight over which is
     in front, flickering to black as the camera turns. Every flat thing on
     that ground — crater floors, trench cuts, blast scorch — sat one to two
     centimetres proud of it. Near 0.09 with the far plane pulled in to the
     treeline is nine times the precision, and the decals stand further off
     as well. The viewmodel rides at 0.34 m, so a 0.09 near plane is nowhere
     near it. */
  game.camera.near = 0.09;
  game.camera.far = 220;

  const S = {
    time: 0, points: ECONOMY.start, mul: 1, mulT: 0,
    round: 0, toSpawn: 0, spawnT: 0, betweenRounds: false, lullT: 0,
    zombies: [], pool: [], debris: [], brass: [], windows: [], buys: [], doors: {},
    projectiles: [], perkStations: [], shieldActive: false, lastKnown: null,
    activeWindows: ['W1', 'W2', 'W3', 'W4'], powered: false,
    killsTotal: 0, gameOver: false, started: false,
    firstBloodDone: false, powerupActive: null,
    testMode: !!opts.test, godMode: false,
    input: { fireHeld: false, firePressed: false, aimHeld: false, sprintHeld: false, useDown: false },
    testHold: {},
    grenades: [], goldPickups: [], belt: null, drops: [], shop: null,
    settings: { open: false, index: 1, current: 'normal' }, particleScale: 1,
    grace: 0, toggles: loadToggles(),
  };
  S.addPoints = (n) => { const a = Math.round(n * S.mul); S.points += a; return a; };

  /* ---------------- the tally ----------------
   *
   * What the pause screen shows, and what a save carries. Kept per
   * weapon as well as in total, because "which gun is actually doing the
   * work" is the question a player has after nine rounds and the total
   * cannot answer it.
   *
   * Kills are credited to S.creditWeapon, which whatever dealt the damage
   * sets before it deals it -- see tryFire and the grenade blast. A death
   * with nothing set is credited to 'other' rather than to the last gun
   * that happened to fire, which would be a lie about the knife and about
   * everything the map kills for you. */
  S.stats = { kills: 0, headshots: 0, shots: 0, revives: 0, byWeapon: {} };
  S.creditWeapon = null;
  const bucket = (id) => {
    const k = id || 'other';
    return S.stats.byWeapon[k] || (S.stats.byWeapon[k] = { shots: 0, kills: 0, headshots: 0 });
  };
  /* A shot is a trigger pull, not a pellet. A scattergun throwing eight
     at once is one shot in every sense a player means by the word, and
     counting pellets would make its kills-per-shot a fifth of the truth. */
  S.statShot = (id) => { S.stats.shots++; bucket(id).shots++; };
  S.statKill = (id, head) => {
    S.stats.kills++;
    const b = bucket(id);
    b.kills++;
    if (head) { S.stats.headshots++; b.headshots++; }
  };

  /* ---------------- settings from the shell ----------------
   *
   * The front end owns the settings screen and hands the whole object in
   * here; every field it can act on is copied onto S under the name the
   * game already uses, and BUNKER_SHELL.applySettings() writes the same
   * fields again whenever one changes. Absent, every one of these stays
   * undefined and each read site falls back to the number the game was
   * tuned at -- so the game runs identically with no front end at all,
   * which is what the test harness does. */
  S.applyShellSettings = (cfg) => {
    if (!cfg) return;
    if (cfg.sensitivity != null) S.mouseSens = cfg.sensitivity;
    if (cfg.padSensitivity != null) S.padSens = cfg.padSensitivity;
    if (cfg.adsMultiplier != null) S.adsSensMul = cfg.adsMultiplier;
    if (cfg.invertY != null) S.invertY = !!cfg.invertY;
    if (cfg.triggerThreshold != null) S.trigThreshold = cfg.triggerThreshold;
    if (cfg.vibration != null) S.vibration = !!cfg.vibration;
    if (cfg.vibrationStrength != null) S.vibrationStrength = cfg.vibrationStrength;
    if (cfg.gParticles != null) S.particleScale = cfg.gParticles;
    if (cfg.volSfx != null) S.volSfx = cfg.volSfx;
    if (cfg.volVoice != null) S.volVoice = cfg.volVoice;
    if (cfg.subtitles != null && S.toggles) S.toggles.subtitles = !!cfg.subtitles;
    if (game.input) {
      if (cfg.deadzoneLeft != null) game.input.deadzone = cfg.deadzoneLeft;
      if (cfg.deadzoneRight != null) game.input.deadzoneRight = cfg.deadzoneRight;
    }
  };
  S.applyShellSettings(opts.settings);

  setSpokenWords(S.toggles.spokenWords);
  // Ask once whether there is a voice pack. Nothing waits on the answer.
  loadVoicePack();

  const hud = makeHud();
  S.hud = hud;
  /* The engine, on the run state. nearestInteract needs the camera -- what
     you are pointing at decides which of three wall guns a metre apart you
     are asking for -- and it is called from three places that would all
     have to grow a parameter otherwise. */
  S.game = game;
  const sfx = makeSfx(game);
  // Exposed for the reload test, which counts how often each one fires:
  // twice now a stage held in a boolean has played its sound every frame.
  S.__sfx = sfx;
  // Shared between the radio and the character, so only one of them is
  // ever writing to the single subtitle slot.
  const speech = { until: 0 };
  const voice = makeVoice(game, hud, () => S.gameOver, speech);
  S.voice = voice;

  /* Who you are.

     Remembered on the machine, so the person who has decided they are
     Old Man Frank does not have to choose again every night. The title
     screen offers the ten; anything unrecognised falls back to the first. */
  S.heroId = HERO_ORDER[0];
  try {
    const saved = localStorage.getItem('b9.hero');
    if (saved && HEROES[saved]) S.heroId = saved;
  } catch (e) { /* storage off; the default stands */ }
  S.hero = () => Object.assign({ id: S.heroId }, HEROES[S.heroId]);
  const bark = makeHeroVoice(game, hud, S.hero, () => S.gameOver, speech);
  S.bark = bark;
  hud.picker(() => S.heroId, (id) => {
    S.setHero(id);
    try { localStorage.setItem('b9.hero', id); } catch (e) { /* storage off */ }
    sfx.buy();
    // A word in their own voice, so you hear who you have chosen.
    bark('pick', true);
  });

  buildMap(game, S);

  /* Whatever was chosen last time on this machine, or the tier the
     renderer worked out for itself on the way in — so a first run on a
     laptop does not open on Ultra and a returning player does not have to
     set it again. */
  S.baseBloom = game.renderer.post.bloom;
  {
    let want = null;
    try { want = localStorage.getItem('b9.graphics'); } catch (e) { void e; }
    if (!GRAPHICS[want]) {
      const t = game.renderer.qualityName;
      want = GRAPHICS[t] ? t : 'normal';
    }
    S.settings.index = Math.max(0, GRAPHICS_ORDER.indexOf(want));
    applyGraphics(game, S, want);
  }
  // Three zombies up front so round one is ready; the rest of the pool
  // fills in one at a time behind the title card and early rounds.
  /* Thirteen was the number of bodies that can be UP at once. Corpses
     lie in pool slots now, up to CORPSE.budget of them, so the pool has
     to carry both or a round with eight dead on the floor spawns five
     fewer than it should. They are still built one at a time behind the
     menu, so this costs nothing at start-up. */
  const POOL_SIZE = 13 + CORPSE.budget;
  for (let i = 0; i < 3; i++) buildPooledZombie(game, S, i);
  let poolNext = 3;
  const trickle = () => {
    if (poolNext >= POOL_SIZE) return;
    buildPooledZombie(game, S, poolNext++);
    setTimeout(trickle, 450);
  };
  setTimeout(trickle, 1200);
  const P = makePlayer(game, S, hud, sfx, voice);
  S.player = P;
  /* The chosen character, on the arms. Applied here rather than at the
     picker, because the saved choice from last night never goes through the
     picker -- and the arms do not exist until makePlayer has built them. */
  applyHeroLook(game, P, S.hero());
  /* One way to change character, so the mouse, the pad and the test cannot
     each remember a different half of what changing character means. */
  S.setHero = (id) => {
    if (!HEROES[id]) return;
    S.heroId = id;
    applyHeroLook(game, P, S.hero());
    // And put them on the stage in front of you, if you are still choosing.
    try { showHeroModel(game, S, id); } catch (e) { console.warn('hero model:', e.message); }
  };
  /* And one way to flip a setting, for the same reason. Flipping the value
     is the small half of it; saving it and telling whatever the setting
     actually controls is the half that gets forgotten in the second place
     that flips it. */
  S.setToggle = (k, on) => {
    if (!TOGGLES[k]) return;
    S.toggles[k] = !!on;
    if (k === 'spokenWords') setSpokenWords(S.toggles[k]);
    saveToggles(S.toggles);
  };
  hud.ammo(P);
  hud.points(S.points);

  /* Input edge-tracking. */
  const startGame = () => {
    if (S.started) return;
    S.started = true;
    hud.hideTitle();
    // Off the stage: the room is a bunker again.
    if (S.heroModels) for (const k in S.heroModels) heroModelVisible(S.heroModels[k], false);
    setTimeout(() => voice(LINES.intro, true), 900);
    S.roundStartAt = S.time + 5.2;   // game time, so tests and pauses behave
  };
  hud.els.title.addEventListener('click', startGame);
  /* A controller cannot click. Without this the title screen is a wall for
     anyone playing on a pad — which is exactly what "controller support
     doesn't work" looks like from the sofa. Any button, or any key, starts. */
  window.addEventListener('keydown', startGame);
  let padPick = false;
  const padWatch = setInterval(() => {
    const pd = game.input.pad;
    const el = hud.els.title.querySelector('.padstate');
    if (pd.connected && el) {
      /* Say whether the browser recognised the layout.
       *
       * Every button index and both trigger readings depend on the pad
       * reporting `mapping: "standard"`, and one that does not is handed
       * over in whatever order the device happens to use. On an unknown
       * layout the game now takes movement and the raw buttons and leaves
       * the right stick and the triggers alone, rather than guessing --
       * so it walks and shoots but does not aim on the stick. That is a
       * real difference in what the pad can do, and the player is the one
       * holding it, so it says so instead of quietly behaving oddly. */
      el.textContent = pd.standard
        ? 'CONTROLLER READY — ' + (pd.id || 'gamepad').slice(0, 34)
        : 'CONTROLLER: LAYOUT NOT RECOGNISED — move and fire only. '
          + (pd.id || 'gamepad').slice(0, 30);
      el.style.color = pd.standard ? '#59ff7a' : '#ffc061';
    }
    /* On a pad the bumpers walk the cast rather than starting the game —
       otherwise the picker is mouse-only and someone on a sofa is stuck
       with whoever the game chose for them. */
    if (pd.connected && (pd.buttons.lb || pd.buttons.rb)) {
      if (!padPick) {
        padPick = true;
        const n = HERO_ORDER.length;
        let k = HERO_ORDER.indexOf(S.heroId);
        k = (k + (pd.buttons.rb ? 1 : n - 1) + n) % n;
        S.setHero(HERO_ORDER[k]);
        try { localStorage.setItem('b9.hero', S.heroId); } catch (e) { /* storage off */ }
        hud.picker(() => S.heroId, () => {});
        sfx.buy();
        bark('pick', true);
      }
    } else {
      padPick = false;
      if (pd.connected && Object.values(pd.buttons).some(Boolean)) { startGame(); }
    }
    if (S.started) clearInterval(padWatch);
  }, 120);
  window.addEventListener('gamepadconnected', () => game.input._pollGamepad());
  if (opts.test) startGame();

  game.onUpdate((dt) => {
    if (window.__FREEZE) return;   // test/profiling hatch: engine only
    S.time += dt;
    if (S.grace > 0) {
      S.grace = Math.max(0, S.grace - dt);
      if (S.grace === 0 && sfx.graceEnd) sfx.graceEnd();
    }
    S.frame = (S.frame || 0) + 1;
    const i = game.input;
    const pad = i.pad;
    /* Controller: right stick aims, triggers fire and aim, and the face
       buttons carry everything the keyboard does. Look is applied here
       rather than folded into keys because aiming needs the analog value —
       a stick mapped to arrow keys can only ever look at one speed. */
    if (pad.connected && P.alive && !S.gameOver) {
      /* A pad that is being USED takes the pointer. Merely being plugged
         in is not enough -- someone with a controller sitting on the desk
         and a hand on the mouse should keep their cursor. Any stick past
         the dead zone or any button down means the pad is in play. */
      const locked = document.pointerLockElement === game.canvas;
      if (!locked && S.lockPointer) {
        const busy = Math.abs(pad.lx) + Math.abs(pad.ly) + Math.abs(pad.rx) + Math.abs(pad.ry) > 0.12
          || pad.lt > 0.2 || pad.rt > 0.2
          || Object.keys(pad.buttons).some((k) => pad.buttons[k]);
        if (busy) S.lockPointer();
      }
      /* And say so. A browser will only give the lock to a page the person
         has interacted with, and a gamepad button is not an interaction as
         far as it is concerned -- so if the request keeps being refused,
         the one thing that fixes it has to be on screen. */
      if (hud.els.cursorwarn) hud.els.cursorwarn.style.display = locked ? 'none' : 'block';
      const look = 2.6 * dt * (S.padSens == null ? 1 : S.padSens);
      // Squared response: fine control near centre, fast whip at the rim.
      const sx = pad.rx * Math.abs(pad.rx), sy = pad.ry * Math.abs(pad.ry);
      // Aiming slows the turn rate, by the same fraction the mouse uses.
      const sens = 1 - P.ads * (1 - (S.adsSensMul == null ? 0.55 : S.adsSensMul));
      game._camYaw -= sx * look * sens;
      game._camPitch = Math.max(-1.45, Math.min(1.45,
        game._camPitch + sy * look * sens * (S.invertY ? -1 : 1)));
    }
    // testHold lets a headless harness drive held inputs without simulating
    // devices — the same code path a real button takes, just another source.
    const th = S.testHold;
    /* The right trigger has to be seen released before it is believed.

       A pad whose trigger axis rests above the threshold — and plenty of
       them do, depending on how the browser maps it — reads as held from
       the moment it is plugged in. A semi-automatic weapon wants an edge so
       it fires once and stops; an automatic one wants the level, so it
       empties the magazine the instant you draw it and never stops. That is
       exactly the shape of the bug: only the full-autos ran away. */
    if (pad.rt <= 0.2) S.padTriggerArmed = true;
    const rtHeld = S.padTriggerArmed && pad.rt > (S.trigThreshold == null ? 0.45 : S.trigThreshold);
    // Space is the jump now, so it is not also the trigger.
    S.input.fireHeld = i.pointer.down || rtHeld || !!th.fire;
    S.input.firePressed = i.pointer.justDown || (S.padTriggerArmed && pad.pressed.rt) || (!!th.fire && !th._firePrev);
    S.input.jumpPressed = i.justPressed(' ') || !!pad.pressed.a;
    S.input.aimHeld = i.down('control') || i.pointer.rightDown
      || pad.lt > (S.trigThreshold == null ? 0.40 : S.trigThreshold * 0.9) || !!th.aim;
    S.input.sprintHeld = i.down('shift') || !!pad.buttons.ls || !!th.sprint;
    // Held rather than pressed: the easter egg wants to know you are
    // standing at the generator with your hand on it, not that you tapped it.
    S.input.useDown = i.down('f') || i.down('x') || !!pad.buttons.b;
    th._firePrev = !!th.fire;

    if (S.gameOver || !S.started) return;
    if (S.roundStartAt != null && S.time >= S.roundStartAt) { S.roundStartAt = null; startRound(game, S, hud, sfx); }

    /* Player movement: camera-relative WASD through the capsule controller. */
    if (P.alive) {
      const yaw = game.cameraYaw;
      let mx = i.axes.x, mz = -i.axes.y;
      // A harness can steer the player through the same path a key does.
      if (S.testHold.mx != null) mx = S.testHold.mx;
      if (S.testHold.mz != null) mz = S.testHold.mz;
      /* With the bench panel open the movement keys drive the list, so they
         must not also drive the player — otherwise picking a scope walks you
         out of range of the bench that is showing it to you. */
      if (S.bench && S.bench.open) { mx = 0; mz = 0; }
      /* A last dead zone on the combined stick, in the game rather than the
         driver. Anything that leaks through here keeps `_desired` non-zero,
         and the controller only applies stopping friction when the desired
         direction is exactly zero — so a few hundredths of stick drift reads
         as skating across the floor forever. */
      if (Math.hypot(mx, mz) < 0.12) { mx = 0; mz = 0; }
      /* forward = (sin yaw, 0, cos yaw); right = forward x up = (-cos, 0, sin).
         Adding the lateral term on x and subtracting on z mirrors the strafe,
         which is why A and D — and the whole left stick — felt inverted. */
      const wx = Math.sin(yaw) * mz - Math.cos(yaw) * mx;
      const wz = Math.cos(yaw) * mz + Math.sin(yaw) * mx;
      /* Sprint: only forward, only unaimed, only while there is stamina —
         and it locks out firing, which is what makes taking it a decision
         rather than a free speed boost. Athlete triples the tank. */
      // Three minutes of continuous sprint against the base one.
      const maxStam = P.perks.adrenaline ? 3.0 : 1.0;
      const wantSprint = S.input.sprintHeld && mz > 0.35 && !P.adsWant
        && P.reloading <= 0 && P.stamina > 0.02;
      P.sprinting = wantSprint && (Math.abs(mx) + Math.abs(mz)) > 0.1 && P.sliding <= 0;
      P.stamina = Math.max(0, Math.min(maxStam,
        P.stamina + (P.sprinting ? -dt / (P.perks.adrenaline ? 3.0 : 1.0) : dt * (P.perks.adrenaline ? 0.55 : 0.32))));
      P.sprint += ((P.sprinting ? 1 : 0) - P.sprint) * Math.min(1, dt * 11);

      /* Slide, for Athlete. A sprint committed to a direction: you keep the
         speed you had, you cannot steer much, and you come out of it low. */
      P.slideCd = Math.max(0, P.slideCd - dt);
      if (P.perks.adrenaline && P.sliding <= 0 && P.slideCd <= 0 && P.sprinting
          && (i.justPressed('control') || i.justPressed('c') || pad.pressed.b)) {
        P.sliding = SLIDE.duration;
        P.slideCd = SLIDE.cooldown;
        P.slideDir = { x: wx, z: wz };
        sfx.slide();
      }

      const perkSpeed = (P.perks.adrenaline ? 1.42 : 1) * (P.perks.supersoldier ? 1.12 : 1)
        * (1 - SHIELD_BLOCK.slow * P.blockT);
      const knifeSpeed = P.equipped() === 'knife' ? 1.30 : 1;
      let base = P.adsWant ? PLAYER.adsSpeed : PLAYER.walkSpeed;
      P.actor.controller.runSpeed = PLAYER.sprintSpeed * perkSpeed * knifeSpeed;
      P.actor.controller.moveSpeed = base * perkSpeed * knifeSpeed * (P.spec().moveMul || 1);

      if (P.sliding > 0) {
        P.sliding -= dt;
        const d = P.slideDir;
        const k = Math.max(0.25, P.sliding / SLIDE.duration);
        P.actor.controller.moveSpeed = SLIDE.speed * k * perkSpeed;
        P.actor.controller.move(d.x, d.z, false);
      } else {
        P.actor.controller.move(wx, wz, P.sprinting);
      }

      /* Aim down sights. */
      // A gun in each hand has nothing to look down.
      P.adsWant = S.input.aimHeld && !P.sprinting && P.reloading <= 0 && !P.spec().noAds;
      const at = P.spec().adsTime || 0.2;
      P.ads += ((P.adsWant ? 1 : 0) - P.ads) * Math.min(1, dt / at);
      if (P.ads < 0.002) P.ads = 0;
      if (P.ads > 0.998) P.ads = 1;
      // Field of view follows the aim: narrowing is most of what sells it.
      const spec0 = P.spec();
      const fovK = PLAYER.fov * (1 - P.ads) + (spec0.sightFov || 0.8) * P.ads;
      game.camera.fov = 55 * (fovK + P.sprint * (PLAYER.sprintFov - 1)) * Math.PI / 180;
      /* Behind the glass the rifle itself is out of the picture: the eye is
         at the ocular, and a scope you can see the outside of is a scope you
         are not looking through. P.scoped is read by the viewmodel, which
         puts every part of the weapon away while it is true. */
      P.scoped = !!spec0.scoped && P.ads > 0.72;
      hud.aim(P.ads, P.sprinting, !!spec0.scoped);
      if (P.scoped) {
        // A held breath is never quite still. Two slow beats, a few pixels.
        const t = S.time || 0;
        hud.scopeOffset(Math.sin(t * 0.83) * 3.4 + Math.sin(t * 2.10) * 1.1,
          Math.sin(t * 0.61) * 2.8 + Math.cos(t * 1.70) * 1.0);
      }

      if (i.justPressed('r') || pad.pressed.x) tryReload(P, sfx, S);
      P.swingT = Math.max(0, P.swingT - dt);
      /* Aim, on a shield, means put it between you and them. */
      P.blocking = !!(P.spec() && P.spec().blocks) && S.input.aimHeld && P.swingT <= 0;
      P.blockT += ((P.blocking ? 1 : 0) - P.blockT) * Math.min(1, dt * SHIELD_BLOCK.raise);
      P.nadeCd = Math.max(0, P.nadeCd - dt);
      if ((i.justPressed('t') || pad.pressed.lb) && P.nadeCd <= 0 && P.nades > 0) {
        P.nadeCd = 0.55;
        sfx.pinPull();
        throwGrenade(game, S, P, sfx);
        hud.ammo(P);
      }

      /* Hammer while building. It takes the weapon's place for as long as
         the hold lasts, which is why boarding up costs you your gun. The
         flag is raised by the repair interaction later in the frame and
         cleared here, so one frame without a repair puts the gun back. */
      if (P.building !== P.buildingWas) {
        P.buildingWas = P.building;
        if (P.building) {
          P.prevSlotBuild = P.slot;
          if (!P.slots.includes('hammer')) P.slots.push('hammer');
          P.slot = P.slots.indexOf('hammer');
        } else {
          P.slots = P.slots.filter((w) => w !== 'hammer');
          P.slot = Math.min(P.prevSlotBuild || 0, Math.max(0, P.slots.length - 1));
          P.lastBeat = -1;
        }
        P.reloading = 0;
        P.cooldown = Math.min(P.cooldown, P.spec().refire);
        hud.ammo(P);
      }
      P.building = false;

      /* Knife on a hold-to-swap key, so it never costs you a weapon slot. */
      const wantKnife = i.down('v') || i.down('e') || !!pad.buttons.rb;
      if (wantKnife !== P.knifeOut) {
        P.knifeOut = wantKnife;
        if (wantKnife) { P.prevSlot = P.slot; P.slots.push('knife'); P.slot = P.slots.length - 1; }
        else { P.slots = P.slots.filter((w) => w !== 'knife'); P.slot = Math.min(P.prevSlot, P.slots.length - 1); }
        P.reloading = 0;
        P.cooldown = Math.min(P.cooldown, P.spec().refire);
        hud.ammo(P);
      }

      /* Shield Up. */
      P.shieldCd = Math.max(0, P.shieldCd - dt);
      if (P.shieldT > 0) {
        P.shieldT -= dt;
        if (P.shieldT <= 0) { S.shieldActive = false; hud.shield(0, P.shieldCd); if (S.shieldMesh) S.shieldMesh.visible = false; }
      } else if (P.perks.shieldup && P.shieldCd <= 0
                 && (i.justPressed('g') || pad.pressed.ls)) {
        P.shieldT = SHIELD.duration;
        P.shieldCd = SHIELD.cooldown;
        S.shieldActive = true;
        // They keep going to where you were, not where you are.
        S.lastKnown = { x: P.actor.position.x, y: P.actor.position.y, z: P.actor.position.z };
        if (S.shieldMesh) S.shieldMesh.visible = true;
        sfx.shieldUp();
        hud.banner('SHIELD', '#b08cff');
      }
      if (S.shieldMesh && P.shieldT > 0) {
        const pp = P.actor.position;
        S.shieldMesh.setPosition([pp.x, pp.y + 0.1, pp.z]);
      }
      hud.shield(P.shieldT / SHIELD.duration, P.shieldCd);
      hud.stamina(P.stamina / maxStam, !!P.perks.adrenaline);
      hud.grace(S.grace, BENCH_GRACE);

      /* Settings. Escape opens it anywhere except at the bench, where
         escape already means "put the gun down". The game keeps running
         behind it — this is a shooter, and a pause menu that stops the
         round is a pause menu you can hide in. */
      if (!(S.bench && S.bench.open)) {
        if (i.justPressed('escape') || i.justPressed('o') || pad.pressed.start) {
          S.settings.open = !S.settings.open;
          if (S.settings.open) S.settings.index = GRAPHICS_ORDER.indexOf(S.settings.current);
          sfx.buy();
        }
      }
      if (S.settings.open) {
        const ng = GRAPHICS_ORDER.length;
        const n = ng + TOGGLE_ORDER.length;
        const up = i.justPressed('w') || i.justPressed('arrowup') || pad.pressed.up;
        const dn = i.justPressed('s') || i.justPressed('arrowdown') || pad.pressed.down;
        if (up) S.settings.index = (S.settings.index + n - 1) % n;
        if (dn) S.settings.index = (S.settings.index + 1) % n;
        if (i.justPressed('f') || i.justPressed('enter') || pad.pressed.x) {
          if (S.settings.index < ng) {
            applyGraphics(game, S, GRAPHICS_ORDER[S.settings.index]);
            hud.banner(GRAPHICS[S.settings.current].name, '#8ce8a0');
          } else {
            const k = TOGGLE_ORDER[S.settings.index - ng];
            S.setToggle(k, !S.toggles[k]);
            hud.banner(TOGGLES[k].name + (S.toggles[k] ? ' ON' : ' OFF'), '#8ce8a0');
          }
          sfx.buy();
        }
        if (pad.pressed.b) S.settings.open = false;
        hud.settings({ index: S.settings.index, current: S.settings.current, toggles: S.toggles });
        // Nothing else takes input while it is up.
        mx = 0; mz = 0;
      } else {
        hud.settings(null);
      }

      /* The workbench panel. While it is open the movement keys drive the
         list instead of the player, and nothing can reach you — the horde
         loses interest and mills about, which is the whole reason you can
         afford to stand still and read a menu in the middle of a round. */
      const bench = S.bench;
      if (bench && bench.open) {
        const held = P.equipped();
        const fit = P.fitted[held] || (P.fitted[held] = {});
        const slot = ATTACH.slots[bench.slot];

        /* ---- and on a pad ----
         *
         * The engine folds a standard pad's d-pad onto the arrow keys and
         * its face buttons onto space and x, which is enough to MOVE
         * around this screen and not enough to do anything on it: fit,
         * leave, preview, turn and camo were all keys with no button
         * behind them. A menu you can walk around and cannot act in is
         * the worst of the two, because it looks like it works.
         *
         * A for fit, B for back, Y for preview, X for camo, the bumpers
         * to turn it, and the left trigger for the damage table -- which
         * is the layout every other screen in the game already uses, so
         * there is nothing new to learn at the bench. */
        const padFit = pad.pressed.a;
        const padBack = pad.pressed.b;
        const padPrev = pad.pressed.y;
        const padCamo = pad.pressed.x;
        const padTurn = (pad.buttons.lb ? -1 : 0) + (pad.buttons.rb ? 1 : 0);

        /* And the left stick, which the panel has been claiming works for
           some time. The engine folds the D-PAD onto the arrow keys; the
           stick it folds onto the movement axes, which is what you want
           while walking and nothing at all while reading a list. Held
           direction with a repeat -- a third of a second to the first,
           then eight a second, the same as every list in the front end.
           Edge-detected off `bench.stickWas`, so a held stick does not
           run the cursor off the end of the list in one frame. */
        const sVert = Math.abs(pad.ly) > 0.5 ? (pad.ly > 0 ? 1 : -1) : 0;
        const sHoriz = Math.abs(pad.lx) > 0.5 ? (pad.lx > 0 ? 1 : -1) : 0;
        const sDir = bench.picking ? sVert : sHoriz;
        let stickStep = 0;
        if (sDir !== (bench.stickWas || 0)) {
          bench.stickWas = sDir;
          bench.stickT = 0.34;
          stickStep = sDir;
        } else if (sDir) {
          bench.stickT = (bench.stickT || 0) - dt;
          if (bench.stickT <= 0) { bench.stickT = 0.125; stickStep = sDir; }
        }

        /* Turning it. The weapon on the bench is the real viewmodel, pushed
           out to arm's length and spun on the spot, so what you are looking
           at is exactly what you will be holding — including every
           attachment, because they are the same actors. */
        const turn = (i.down('q') || i.down('a') ? -1 : 0) + (i.down('e') || i.down('d') ? 1 : 0) + padTurn;
        if (bench.preview || bench.picking) bench.spin += turn * dt * 2.2;
        else if (!bench.picking) bench.spin += turn * dt * (bench.preview ? 2.2 : 0);
        if (i.justPressed('p') || padPrev) bench.preview = !bench.preview;
        bench.damage = i.down('shift') || pad.lt > 0.4 || !!S.testHold.damage;

        /* How many parts are already on this weapon. A part that is
           already fitted, or that would replace one that is, does not
           count against the limit -- swapping a red dot for a thermal is
           not a fourth part. */
        const fittedCount = ATTACH.slots.reduce((n2, k2) => n2 + (fit[k2] ? 1 : 0), 0);
        const slotTaken = !!fit[slot];
        const options = Object.entries(ATTACH.parts)
          .filter(([, q]) => q.slot === slot)
          .map(([id2, q]) => {
            const eff = attachEffects(held, id2);
            const isFitted = fit[slot] === id2;
            return {
              id: id2, name: q.name, blurb: q.blurb, cost: q.cost,
              fitted: isFitted,
              banned: !!(q.bans && q.bans.includes(held)),
              full: !isFitted && !slotTaken && fittedCount >= ATTACH.maxFitted,
              pros: eff.pros, cons: eff.cons,
            };
          });
        bench.fittedCount = fittedCount;
        bench.index = Math.max(0, Math.min(bench.index, options.length - 1));

        if (!bench.picking && !bench.preview) {
          // Choosing which slot to work on.
          if (i.justPressed('a') || i.justPressed('arrowleft') || stickStep < 0) { bench.slot = (bench.slot + ATTACH.slots.length - 1) % ATTACH.slots.length; bench.index = 0; }
          if (i.justPressed('d') || i.justPressed('arrowright') || stickStep > 0) { bench.slot = (bench.slot + 1) % ATTACH.slots.length; bench.index = 0; }
          if (i.justPressed('f') || padFit) { bench.picking = true; sfx.buy(); }
        } else if (bench.picking) {
          if (i.justPressed('w') || i.justPressed('arrowup') || stickStep < 0) bench.index = (bench.index + options.length - 1) % options.length;
          if (i.justPressed('s') || i.justPressed('arrowdown') || stickStep > 0) bench.index = (bench.index + 1) % options.length;
          if (i.justPressed('f') || padFit) {
            const o = options[bench.index];
            if (o && o.full) {
              hud.banner('THREE PARTS IS THE LIMIT', '#c8562e');
              sfx.dryFire();
            } else if (o && !o.banned) {
              if (o.fitted) {
                delete fit[slot];
                S.addPoints(Math.round(ATTACH.parts[o.id].cost * 0.4));
                sfx.buy(); hud.banner('STRIPPED', '#8a8272');
              } else if (S.points >= o.cost) {
                S.points -= o.cost;
                fit[slot] = o.id;
                sfx.buy(); hud.banner(ATTACH.parts[o.id].name.toUpperCase(), '#ffd27a');
              } else hud.banner('NOT ENOUGH', '#c8562e');
              hud.points(S.points);
              const am2 = P.ammo[held];
              const sp2 = P.specFor(held);
              if (am2) am2.mag = Math.min(am2.mag, sp2.mag);
              applyAttachmentLooks(game, P, held);
              hud.ammo(P);
            }
          }
        }

        /* Camo, once the meteorite has been through the gun: you can put it
           back to how it left the factory and change your mind again. */
        if (P.upgraded && P.upgraded[held] && (i.justPressed('c') || padCamo)) {
          P.camoOff = P.camoOff || {};
          P.camoOff[held] = !P.camoOff[held];
          applyUpgradeLook(game, P, held);
          hud.banner(P.camoOff[held] ? 'ORIGINAL FINISH' : 'LAVA', '#ff7a2a');
        }

        if (i.justPressed('tab') || i.justPressed('escape') || padBack) {
          if (bench.picking) bench.picking = false;
          else if (bench.preview) bench.preview = false;
          else closeBench(S, sfx);
        }
        if (dist2d(P.actor.position, { x: bench.at[0], z: bench.at[2] }) > PLAYER.interactRange + 1.6) closeBench(S, sfx);

        // Markers, projected from the weapon's own anchors.
        const v = P.view[held];
        const root = v && (v.kind === 'single' ? v.actor : v.root);
        const marks = [];
        if (root && !bench.preview) {
          for (const sl of ATTACH.slots) {
            const anch = attachAnchor(sl, held, v);
            const m = root.matrix.e;
            const wp = [
              m[0] * anch[0] + m[4] * anch[1] + m[8] * anch[2] + m[12],
              m[1] * anch[0] + m[5] * anch[1] + m[9] * anch[2] + m[13],
              m[2] * anch[0] + m[6] * anch[1] + m[10] * anch[2] + m[14],
            ];
            const sc = toScreen(game, wp);
            if (!sc) continue;
            const up = sl === 'mag' ? 1 : -1;
            marks.push({
              slot: sl, ax: sc[0], ay: sc[1],
              lx: sc[0] + (sl === 'stock' ? -96 : sl === 'muzzle' ? 96 : 0),
              ly: sc[1] + up * (sl === 'optic' ? 88 : sl === 'mag' ? 58 : 70),
              fitted: fit[sl] ? ATTACH.parts[fit[sl]].name : null,
            });
          }
        }
        const spec2 = P.specFor(held);
        /* A light on the weapon itself while it is up.

           The bench is in the darkest corner of the room by design, which
           is fine for standing at and useless for looking at a gun: on the
           inspection screen the whole point is that you can see what you
           just bolted to it. The light rides with the weapon rather than
           sitting on the bench, so it works wherever the pose puts it. */
        if (!bench.inspect) {
          bench.inspect = game.light({ at: bench.at, color: 0xfff2dc, intensity: 0, radius: 3.2 });
        }
        {
          const rp = root ? root.position : null;
          const cp = game.camera.position;
          if (rp) {
            bench.inspect.position.set(rp.x + (cp.x - rp.x) * 0.45, rp.y + 0.34, rp.z + (cp.z - rp.z) * 0.45);
            bench.inspect.intensity = 26;
          }
        }
        hud.bench({
          weapon: spec2.name, slot, options, index: bench.index, points: S.points,
          fitted: bench.fittedCount, maxFitted: ATTACH.maxFitted,
          marks, preview: bench.preview, picking: bench.picking,
          camo: !!(P.upgraded && P.upgraded[held]),
          damage: bench.damage ? damageTable(spec2) : null,
          damageNote: spec2.pellets > 1
            ? `${spec2.pellets} pellets — figures are a full pattern on the spot`
            : `per round${spec2.pierce ? `, and it carries through ${spec2.pierce} more` : ''}`,
        });
      } else if (bench) {
        hud.bench(null);
        if (bench.inspect) bench.inspect.intensity = 0;
      }
      /* Swapping. The knife and the hammer are temporary slots pushed onto
         the end of the list, so the two carried weapons are always slots 0
         and 1 and the swap has to be expressed in those terms — never as
         `1 - P.slot`, which with a third slot out resolves to -1 and takes
         the whole frame down with it. */
      const swapTo = (n) => {
        if (P.slots.length <= n || n < 0) return;
        if (P.knifeOut) { P.knifeOut = false; P.slots = P.slots.filter((w) => w !== 'knife'); }
        P.slot = Math.max(0, Math.min(n, P.slots.length - 1));
        P.reloading = 0; P.reloadStage = 0; P.breakStage = 0;
        /* The cooldown belongs to the weapon that set it, not to the player.
           The hammer's refire is nine seconds — swing it once while boarding
           a window and the gun you swap back to is dead for the next nine,
           which is the ritual that had to be performed to get it shooting
           again. */
        P.cooldown = Math.min(P.cooldown, P.spec().refire);
        sfx.swap();
        hud.ammo(P);
        hud.flashWeapon(P.spec().slotName);
      };
      if (i.justPressed('q') || pad.pressed.y) {
        const cur = P.knifeOut ? (P.prevSlot || 0) : P.slot;
        swapTo(cur === 0 ? 1 : 0);
      }
      if (i.justPressed('1')) swapTo(0);
      if (i.justPressed('2')) swapTo(1);

      if (P.reloading > 0) {
        const spec = P.spec();
        const prog = 1 - P.reloading / spec.reload;
        const v = P.view[P.equipped()];
        /* The stages every reload passes through — but only a box magazine
           actually drops a magazine and runs a slide. This block used to do
           both for every weapon, so a break-action shotgun played a magazine
           release, a magazine seating and a slide going forward while its
           own code was working the hinge, and a revolver did the same over
           its cylinder. Each kind gets its own sounds now, and the ones with
           their own animation code are left to it. */
        const kind = spec.reloadKind;
        if (P.reloadStage === 0 && prog > 0.16) {
          P.reloadStage = 1;
          if (kind === 'mag') {
            // Whichever magazine is actually fitted -- the drum if there is
            // one, otherwise the gun's own.
            for (const m of (activeMag(v) || [])) m.visible = false;
            dropMagazine(game, S, P, v);
            // A drum coming out of a well is a heavier noise than a stick.
            const fm = (P.fitted[P.equipped()] || {}).mag;
            if (fm === 'drummag' && sfx.drumOut) sfx.drumOut(); else sfx.magOut();
          } else if (kind === 'revolver') sfx.cylinderOut();
          else if (kind === 'clip') sfx.boltBack();
          else if (kind === 'cell') sfx.cellOut();
        } else if (P.reloadStage === 1 && prog > 0.62) {
          P.reloadStage = 2;
          if (kind === 'mag') {
            for (const m of (activeMag(v) || [])) m.visible = true;
            const fm2 = (P.fitted[P.equipped()] || {}).mag;
            if (fm2 === 'drummag' && sfx.drumIn) sfx.drumIn(); else sfx.magIn();
          } else if (kind === 'revolver') sfx.cylinderIn();
          else if (kind === 'clip') sfx.clipIn();
          else if (kind === 'cell') sfx.cellIn();
        } else if (P.reloadStage === 2 && prog > 0.88) {
          P.reloadStage = 3;
          if (kind === 'mag') {
            P.slideCycle = 0.16; P.slideCycleMax = 0.16; // runs forward on the fresh mag
            sfx.slideRelease();
          } else if (kind === 'clip') sfx.boltHome();
        }
        P.reloading -= dt;
        if (P.reloading <= 0) { P.reloading = 0; P.reloadStage = 0; P.breakStage = 0; finishReload(P, hud); }
      }

      if (!P.sprinting && !(S.bench && S.bench.open)) tryFire(game, S, P, hud, sfx, dt);
      updateRecoil(game, P, dt, S);

      /* The flinch roll, spun into the camera's up vector.

         lookAt takes an up, so tilting that about the look direction is a
         roll and nothing else in the engine has to learn a new concept.
         Rodrigues about the forward axis; it decays back to level in about
         a third of a second, which is a flinch rather than a lurch. */
      P.flinchRoll = (P.flinchRoll || 0) * Math.exp(-6.5 * dt);
      if (Math.abs(P.flinchRoll) < 2e-4) P.flinchRoll = 0;
      {
        const cam = game.camera;
        const a = P.flinchRoll;
        if (a === 0) cam.up.set(0, 1, 0);
        else {
          const fx = cam.target.x - cam.position.x, fy = cam.target.y - cam.position.y,
            fz = cam.target.z - cam.position.z;
          const fl = Math.hypot(fx, fy, fz) || 1;
          const ux = fx / fl, uy = fy / fl, uz = fz / fl;
          const c = Math.cos(a), sn = Math.sin(a);
          // u = (0,1,0); f x u = (-uz, 0, ux); f.u = uy
          const k = uy * (1 - c);
          cam.up.set(-uz * sn + ux * k, c + uy * k, ux * sn + uz * k);
        }
      }
      // The viewmodel is NOT placed here. Update hooks run before the
      // camera moves, so a gun positioned from cam.position in this pass is
      // hung off last frame's camera — it lags the view by a frame and
      // whips around whenever the player walks. It goes in a late hook,
      // after _updateCamera, where the camera is final for the frame.
      P._moving = Math.abs(mx) + Math.abs(mz) > 0.1;

      /* Footsteps.

         There were none at all, which is why walking felt like sliding — a
         concrete floor answers when you cross it, and the absence of that
         is felt long before it is noticed. Paced off the same clock as the
         view bob, so the foot lands when the camera drops, and a little
         harder when you are running. */
      const ctl = P.actor.controller;
      const grounded = !ctl || ctl.grounded !== false;
      if (P._moving && grounded && P.alive) {
        const rate = P.sprinting ? 3.05 : (P.ads > 0.5 ? 1.55 : 2.10);
        P.stepPhase = (P.stepPhase || 0) + dt * rate;
        if (P.stepPhase >= 1) { P.stepPhase -= 1; sfx.step(P.sprinting); }
      } else P.stepPhase = 0.62;   // most of the way, so the next step is prompt

      /* And landing, which needs to know how far you fell. */
      if (ctl) {
        const wasAir = P._air;
        P._air = ctl.grounded === false;
        if (wasAir && !P._air) sfx.land(Math.min(1, Math.abs(P._fallV || 0) / 9));
        if (P._air) P._fallV = P.actor.body ? P.actor.body.velocity.y : 0;
      }

      /* Jump. Off the same controller as everything else, so it gets the
         coyote time and the buffered press the engine already implements. */
      if (S.input.jumpPressed && !(S.bench && S.bench.open) && P.sliding <= 0) {
        P.actor.controller.jump();
        sfx.jump();
      }

      updateDrops(game, S, dt);

      /* Interact. */
      const it = (S.bench && S.bench.open) ? null : nearestInteract(S, P);
      if (it) {
        /* Boarding a window is work, and work is a key you are holding
           rather than a place you are standing. With AUTO REPAIR on it goes
           back to happening by proximity, for anyone who liked it that way. */
        const auto = it.kind === 'repair' && S.toggles.autoRepair;
        hud.prompt(it.label + (auto ? '' : it.hold ? ' (hold)' : ''));
        if (auto
            || (it.hold ? (i.down('f') || i.down('x') || pad.buttons.b)
                        : (i.justPressed('f') || i.justPressed('x') || pad.pressed.b))) {
          doInteract(game, S, P, hud, sfx, it, dt);
        }
      } else hud.prompt(null);

      /* Regen, and the sound of nearly not making it.

         The threshold is an absolute twenty-five rather than a fraction, so
         it means the same thing to a Supersoldier on three hundred as to
         everyone else: twenty-five is one more swing. Below it the edges of
         the screen star out red, and you can hear the character — a heart
         going at about a hundred and ten, and a breath drawn between beats.
         The moment the wound starts closing there is a note for it, so you
         know to stop running before you have counted the seconds. */
      const regenning = P.hp < P.maxHp && S.time - P.lastHit > PLAYER.regenDelay;
      if (regenning) {
        if (!P.regenning) { P.regenning = true; sfx.regenStart(); }
        P.hp = Math.min(P.maxHp, P.hp + PLAYER.regenRate * dt);
      } else if (P.hp >= P.maxHp) P.regenning = false;
      if (!regenning && S.time - P.lastHit < PLAYER.regenDelay) P.regenning = false;

      const low = P.hp > 0 && P.hp <= PLAYER.lowAt;
      if (low) {
        P.lowT = (P.lowT || 0) + dt;
        // 110 bpm. The breath lands between beats, not on them.
        const beat = 60 / 110;
        const n = Math.floor(P.lowT / beat);
        if (n !== P.lastBeat) { P.lastBeat = n; sfx.heartbeat(); }
        const m = Math.floor((P.lowT + beat * 0.5) / (beat * 3));
        if (m !== P.lastBreath) { P.lastBreath = m; sfx.breath(); }
      } else { P.lowT = 0; P.lastBeat = -1; P.lastBreath = -1; }
      hud.damage(P.hp / P.maxHp, low ? P.lowT : 0);
    }

    if (!S.shieldActive) {
      S.lastKnown = { x: P.actor.position.x, y: P.actor.position.y, z: P.actor.position.z };
    }

    /* World systems. */
    updateRounds(game, S, P, hud, sfx, dt);
    for (const z of S.zombies) updateZombie(game, S, P, z, dt, sfx);
    updateCorpses(game, S, dt);
    turnHeroModel(game, S, dt);

    /* Thrown bile in flight. Gravity, a splash on impact, and Deflect
       gets its own sound so the perk is audibly doing something. */
    for (let k = S.projectiles.length - 1; k >= 0; k--) {
      const pr = S.projectiles[k];
      pr.life -= dt;
      pr.vel[1] -= (pr.grav || 19.6) * dt;
      if (pr.spin) { pr.rot += pr.spin * dt; pr.actor.setRotation([pr.rot * 57.3, pr.rot * 34, 0]); }
      const q = pr.actor.position;
      const nx = q.x + pr.vel[0] * dt, ny = q.y + pr.vel[1] * dt, nz = q.z + pr.vel[2] * dt;
      const seg = Math.hypot(nx - q.x, ny - q.y, nz - q.z) || 1e-5;
      const hit = game.raycast([q.x, q.y, q.z], [(nx - q.x) / seg, (ny - q.y) / seg, (nz - q.z) / seg], seg + 0.05,
        (b) => !b.isTrigger && !(b.userData && b.userData.zombie));
      const near = dist2d(q, P.actor.position) < 0.9 && Math.abs(q.y - P.actor.position.y) < 1.3;
      if (hit || near || ny < 0.05 || pr.life <= 0) {
        const at = [q.x, Math.max(0.06, q.y), q.z];
        game.particles.sparks(at, { count: 14, speed: 3, color: 0x8aff4a, colorEnd: 0x1c3a10 });
        game.particles.smoke(at, { count: 5, color: 0x3c5a20 });
        const d2 = Math.hypot(P.actor.position.x - at[0], P.actor.position.z - at[2]);
        if (d2 < pr.splash) hurtPlayer(game, S, P, pr.dmg * (1 - d2 / pr.splash), sfx, 'projectile');
        sfx.splat();
        pr.actor.destroy();
        S.projectiles.splice(k, 1);
        continue;
      }
      pr.actor.setPosition([nx, ny, nz]);
    }

    /* Downstairs. The door shuts once you are through it, the turrets deal
       with anything that followed, and if you have taken back more than he
       allows, the miniguns are already turning when you come down. */
    if (S.shop) {
      const sh = S.shop;
      const inside = P.actor.position.y < -0.5;
      /* Shut behind you once you are in the room, and open again when you
         come back to it. Latching it closed for as long as you are
         downstairs locks the player in with him, which is a different game
         to the one described. */
      const pz = P.actor.position.z;
      const want = (P.actor.position.y < -1.9 && pz < sh.doorAt[2] - 0.5) ? 1 : 0;
      if (Math.abs(sh.doorT - want) > 1e-3) {
        sh.doorT += (want - sh.doorT) * Math.min(1, dt * 3.4);
        sh.door.setPosition([
          sh.doorOpenAt[0] + (sh.doorAt[0] - sh.doorOpenAt[0]) * sh.doorT,
          sh.doorAt[1], sh.doorAt[2],
        ]);
      }
      if (inside && !sh.wasIn) {
        sh.wasIn = true;
        game.audio.impact(0.9);
        if (!sh.greeted) { sh.greeted = true; S.voice(LINES.shopFirst); }
        if (sh.hostile) {
          hud.banner('HE WAS WAITING', '#b3221c');
          sh.firing = 3.0;
        }
      } else if (!inside && sh.wasIn) {
        sh.wasIn = false;
      }
      if (inside) shopTurrets(game, S, dt, sfx);
      if (sh.firing > 0) {
        sh.firing -= dt;
        for (const t of sh.turrets) {
          game.particles.sparks(t.at, { count: 4, speed: 12, color: 0xffd27a, colorEnd: 0x6a2a08 });
        }
        if (Math.random() < 0.55) { sfx.shotSmg(); }
        hurtPlayer(game, S, P, 120 * dt, sfx, 'turret', { x: P.actor.position.x, z: P.actor.position.z - 1 });
      }
    }

    /* Turning the generator. Hold still and it comes up; walk off and it
       spins down and you start again. The handle actually goes round — a
       progress bar with no moving part in the world reads as a menu. */
    {
      const ps = S.powerSwitch;
      if (ps.cranking > 0 && !ps.on) {
        const away = dist2d(P.actor.position, { x: ps.at[0], z: ps.at[2] }) > GEN.reach;
        if (away) {
          ps.cranking = 0;
          hud.banner('LET GO OF THE CRANK', '#c8562e');
        } else {
          ps.cranking -= dt;
          ps.crankSpin += dt * GEN.rpm * 6;
          const r = ps.crankSpin;
          const c = Math.cos(r / 57.2958), sn = Math.sin(r / 57.2958);
          ps.crankArm.setPosition([ps.crankArm.position.x, 0.95 + c * 0.23, ps.crankGrip.position.z]);
          ps.crankArm.setRotation([0, 0, r]);
          ps.crankGrip.setPosition([ps.crankGrip.position.x, 0.95 + c * 0.46, ps.crankGrip.position.z + sn * 0.02]);
          ps.wheel.setRotation([0, 0, 90 + r * 0.6]);
          hud.banner(`CRANKING  ${Math.max(0, ps.cranking).toFixed(1)}`, '#e8ddc8');
          if (ps.cranking <= 0) {
            ps.on = true;
            ps.cranking = 0;
            setPower(game, S, true);
            sfx.powerOn();
            ps.lampRed.material = game.material({ color: 0x2a0a08, texture: 'smooth', roughness: 0.3, emissive: 0x3a0a08, emissiveStrength: 0.2 });
            ps.lampGreen.material = game.material({ color: 0x081a08, texture: 'smooth', roughness: 0.3, emissive: 0x3aff5a, emissiveStrength: 2.6 });
            hud.banner('POWER', '#8ce8a0');
            S.voice(LINES.power);
            S.bark('power', true);
          }
        }
      }
    }

    updateMinigun(game, S, P, hud, sfx, dt);
    updateMeteor(game, S, P, hud, sfx, dt);
    updateDrink(game, S, P, hud, sfx, dt);

    updateExit42(game, S, P, hud, sfx, dt);
    // The engines, while it is in the air. One note a beat, so it grows as
    // it comes in rather than arriving all at once.
    if (S.exit && S.exit.step === 5 && S.exit.plane) {
      S.exitEngT = (S.exitEngT || 0) - dt;
      if (S.exitEngT <= 0) { S.exitEngT = 0.5; sfx.planeEngine(); }
    }

    /* The eighteen carat conveyor. Nothing announces the conditions; the
       belt arriving is the announcement. */
    if (S.belt) {
      const bl = S.belt;
      /* The three, in the order the plate reads them. Kept as a list so the
         lamp and the gate cannot drift apart: the gate is `every one lit`. */
      const cond = [S.powered, !!P.perks.supersoldier, !!P.perks.shieldup];
      const nLit = cond.reduce((a, c) => a + (c ? 1 : 0), 0);
      if (nLit !== bl.lit) {
        for (let k = 0; k < bl.tell.length; k++) {
          // Lit in order, not in place: three scattered lamps read as
          // faults, three filling left to right reads as progress.
          const on = k < nLit;
          bl.tell[k].material = game.material({ color: on ? 0xffd270 : 0x3a2f12, texture: 'smooth',
            roughness: 0.28, emissive: 0xffc23a, emissiveStrength: on ? 3.4 : 0 });
        }
        // Only when something was gained, and not for the last one -- the
        // belt's own arrival is louder than any confirmation could be.
        if (nLit > bl.lit && bl.lit >= 0 && nLit < 3) {
          sfx.tellLamp();
          /* Once each, and only on the way up -- losing power puts a lamp
             out and nobody needs to be told about that twice. */
          if (nLit === 1 && !bl.said1) { bl.said1 = true; S.voice(LINES.goldFirst); }
          if (nLit === 2 && !bl.said2) { bl.said2 = true; S.voice(LINES.goldSecond); }
        }
        bl.lit = nLit;
      }
      const earned = nLit === 3;
      if (earned && !bl.running) {
        bl.running = true;
        // Parts only. The root is the group's invisible pivot cube.
        for (const q of bl.parts) q.visible = true;
        bl.lamp.material = game.material({ color: 0x3a2f12, texture: 'smooth', roughness: 0.3,
          emissive: 0xffc23a, emissiveStrength: 3.2 });
        /* Its own lamp is emissive, which makes the bulb glow and lights
           nothing. The belt lives in a dark corner of the east wall, so it
           gets a real light too — created here rather than at map load, so
           an easter egg nobody has earned costs no light slot. */
        /* Off the open end and only slightly above it. Hung directly over
           the belt it lit nothing you can see: the faces the player looks at
           are the end caps and the near rail, and a lamp overhead sits
           behind all of them. Out at the drop point it catches the rounds. */
        bl.light = game.light({ at: [bl.at[0] - 1.0, bl.at[1] + 0.42, bl.at[2]],
          color: 0xffc884, intensity: 6, radius: 4.2 });
        sfx.powerOn();
        S.voice(LINES.gold);
        hud.banner('EIGHTEEN CARAT', '#f0c256');
      }
      if (bl.running) {
        // Slide it out of the wall, then run it.
        bl.out = Math.min(1, bl.out + dt * GOLD.beltSpeed);
        bl.root.setPosition([bl.at[0] - bl.out * 1.25, bl.at[1], bl.at[2]]);
        if (bl.light) bl.light.position.x = bl.root.position.x - 1.0;
        bl.spin += dt * 4.2;
        for (const r of bl.rollers) r.setRotation([90, 0, bl.spin * 57.3]);
        if (bl.out >= 1) {
          bl.dropT -= dt;
          if (bl.dropT <= 0) {
            bl.dropT = GOLD.dropEvery;
            // Off the inboard end of the belt, wherever the belt has got to.
            const px2 = bl.root.position.x - 0.72, pz2 = bl.at[2] + (Math.random() - 0.5) * 0.3;
            const round = game.cylinder({
              at: [px2, bl.at[1] + 0.06, pz2], radius: 0.010, height: 0.040, lifetime: 22,
              material: { color: 0xf2c141, texture: 'metal', roughness: 0.16, metalness: 0.72,
                emissive: 0x8a6210, emissiveStrength: 0.7 },
              velocity: [-0.7, 0.4, (Math.random() - 0.5) * 0.6],
            });
            if (round.body) round.body.angularVelocity.set(4, 2, 6);
            S.goldPickups.push({ actor: round, t: 22 });
          }
        }
      }
      // Walk over a round and it goes in the gun.
      for (let k = S.goldPickups.length - 1; k >= 0; k--) {
        const gp = S.goldPickups[k];
        gp.t -= dt;
        const q = gp.actor.position;
        if (gp.t <= 0) { gp.actor.destroy(); S.goldPickups.splice(k, 1); continue; }
        if (dist2d(q, P.actor.position) < 1.0 && Math.abs(q.y - P.actor.position.y) < 1.6) {
          P.gold = Math.min(GOLD.rounds, (P.gold || 0) + 20);
          P.goldAmmo = true;
          sfx.powerup();
          hud.ammo(P);
          gp.actor.destroy();
          S.goldPickups.splice(k, 1);
        }
      }
    }

    /* Grenades: thrown, bounced, and off on the fuse rather than on
       contact, so one can be rolled round a corner or bounced off a wall
       into a group. */
    for (let k = S.grenades.length - 1; k >= 0; k--) {
      const gr = S.grenades[k];
      gr.t -= dt;
      gr.vel[1] -= GRENADE.grav * dt;
      const q = gr.actor.position;
      let nx = q.x + gr.vel[0] * dt, ny = q.y + gr.vel[1] * dt, nz = q.z + gr.vel[2] * dt;
      const seg = Math.hypot(nx - q.x, ny - q.y, nz - q.z) || 1e-5;
      const hit = game.raycast([q.x, q.y, q.z], [(nx - q.x) / seg, (ny - q.y) / seg, (nz - q.z) / seg], seg + 0.06,
        (b) => !b.isTrigger && !(b.userData && b.userData.zombie) && b !== P.actor.body);
      if (hit) {
        // Reflect off the surface and lose most of the energy to it.
        const nvec = hit.normal || { x: 0, y: 1, z: 0 };
        const dot = gr.vel[0] * nvec.x + gr.vel[1] * nvec.y + gr.vel[2] * nvec.z;
        gr.vel[0] = (gr.vel[0] - 2 * dot * nvec.x) * GRENADE.bounce;
        gr.vel[1] = (gr.vel[1] - 2 * dot * nvec.y) * GRENADE.bounce;
        gr.vel[2] = (gr.vel[2] - 2 * dot * nvec.z) * GRENADE.bounce;
        nx = hit.point.x + nvec.x * 0.07; ny = hit.point.y + nvec.y * 0.07; nz = hit.point.z + nvec.z * 0.07;
        if (Math.hypot(gr.vel[0], gr.vel[1], gr.vel[2]) > 1.2) game.audio.impact(0.22);
      }
      if (ny < 0.06) { ny = 0.06; gr.vel[1] = Math.abs(gr.vel[1]) * GRENADE.bounce; }
      gr.rot += gr.spin * dt;
      gr.actor.setPosition([nx, ny, nz]);
      gr.actor.setRotation([gr.rot * 57.3, gr.rot * 41, 0]);
      if (gr.t <= 0) {
        detonate(game, S, P, [nx, ny, nz], sfx);
        gr.actor.destroy();
        S.grenades.splice(k, 1);
      }
    }

    /* Torn boards tumble. */
    for (let k = S.debris.length - 1; k >= 0; k--) {
      const d = S.debris[k];
      d.t -= dt;
      const pos = d.actor.position;
      d.vel[1] -= 12 * dt;
      d.actor.setPosition([pos.x + d.vel[0] * dt, pos.y + d.vel[1] * dt, pos.z + d.vel[2] * dt]);
      if (d.t <= 0) { d.actor.destroy(); S.debris.splice(k, 1); }
    }

    /* Dropped guns: spin on the floor, and go in the hands of whoever
       walks over them. */
    for (let k = S.drops.length - 1; k >= 0; k--) {
      const d = S.drops[k];
      d.t -= dt; d.spin += dt * 1.9;
      const at = d.root.position;
      d.root.setPosition([at.x, d.baseY + Math.sin(d.spin * 1.7) * 0.05, at.z]);
      d.root.setRotation([0, d.spin * 57.3, 0]);
      // Blink out the last five seconds — parts only, never the pivot.
      if (d.t < 5) { const on = Math.floor(d.t * 5) % 2 === 0; for (const q of d.parts) q.visible = on; }
      /* Taken by pressing, not by walking.
       
         A gun on the floor that jumps into your hands as you run past
         will take the weapon you are holding and replace it with a
         Mauser at the worst possible moment. It waits to be picked up
         now, like everything else you can interact with -- `d.want` is
         set by the interact code when the player actually asks. */
      const gone = d.t <= 0;
      const taken = !gone && d.want;
      if (taken) {
        d.want = false;
        P.give(d.id);
        sfx.gunPickup();
        hud.flashWeapon(WEAPONS[d.id].name);
        hud.ammo(P);
        S.voice(d.id === 'obliterator' ? LINES.model5 : LINES.mauser);
      }
      if (gone || taken) {
        d.root.destroy(); for (const q of d.parts) q.destroy();
        S.drops.splice(k, 1);
      }
    }

    /* Powerup float, pickup, expiry. */
    if (S.powerupActive) {
      const pu = S.powerupActive;
      pu.t -= dt; pu.spin += dt * 2.4;
      pu.actor.setRotation([0, pu.spin * 57.3, 0]);
      const base = pu.actor.position;
      pu.actor.setPosition([base.x, pu.baseY + Math.sin(pu.spin * 1.8) * 0.12, base.z]);
      if (pu.t < 4) pu.actor.visible = Math.floor(pu.t * 6) % 2 === 0;
      if (dist2d(base, P.actor.position) < 1.25 && Math.abs(base.y - P.actor.position.y) < 1.8) applyPowerup(game, S, P, hud, sfx);
      else if (pu.t <= 0) { pu.actor.destroy(); S.powerupActive = null; }
    }
    if (S.mulT > 0) { S.mulT -= dt; if (S.mulT <= 0) S.mul = 1; }

    /* Crate lifecycle: the reel turns over first, and only when it has
       settled does the gun it landed on rise out of the box. */
    const c = S.crate;
    if (c.offer) {
      c.timer -= dt;
      if (updateCrateReel(game, S, dt, sfx)) {
        // Still turning. Nothing rises while it is undecided.
        c.rise = 0;
      } else {
        c.rise = Math.min(1, c.rise + dt / 1.6);
        c.offer.root.setPosition([c.at[0], c.at[1] + 0.55 + c.rise * 0.50, c.at[2]]);
        c.offer.root.setRotation([0, S.time * 40 % 360, 0]);
      }
      if (c.timer <= 0) closeCrate(S);
    }

    /* Lamp flicker: dying grid before power, breathing warmth after. */
    for (let li = 0; li < S.lamps.length; li++) {
      const L = S.lamps[li];
      const base = S.powered ? L.full : L.full * 0.45;
      const n = Math.sin(S.time * (S.powered ? 2.1 : 13) + li * 7.3) * 0.5 + Math.sin(S.time * 27 + li * 3.1) * 0.5;
      L.light.intensity = base * (S.powered ? 1 + n * 0.06 : Math.max(0.35, 0.8 + n * 0.35));
    }
  });

  /* Weapon placement, after the camera is final for this frame. */
  game.onLateUpdate((dt) => {
    if (!S.started || S.gameOver || !P.alive) return;
    updateViewmodel(game, P, dt, !!P._moving, S, sfx);
  });

  /* Test hooks: everything QA needs to drive the game headless. */
  // Layout constants, so a walk-the-stairs or path-to-the-window test can
  // ask the map where things are instead of hard-coding coordinates that
  // drift the moment the map does.
  window.__T_MAP = MAP;
  window.__T_WINDOWS = WINDOWS;
  window.__T_roomOf = roomOf;
  window.__T_WEAPONS = WEAPONS;
  // Model builders, so a test can stand one on a bench and photograph it
  // without having to equip it and fight the viewmodel for the frame.
  // Things a test needs to reach that the game keeps to itself.
  window.__T_SYS = { ATTACH, GRAPHICS, GRAPHICS_ORDER, applyGraphics, meteorShot,
    nearestInteract, doInteract, applyAttachmentLooks, applyUpgradeLook, UPGRADE_NAMES,
    /* PLAYER, so a test can narrow the field of view and get a close look
       at the hands. The viewmodel shares the camera, so there is no other
       way to magnify it — and the fov is recomputed from the aim every
       frame, which makes setting camera.fov directly useless. */
    PLAYER, TOGGLES, TOGGLE_ORDER, HEROES, HERO_ORDER, EXIT42, updateExit42, exitStep,
    CAST, sayLine, setSpokenWords, applyHeroLook, assignVoices, systemVoiceFor, voicePool,
    lineId, loadVoicePack, weaponSurface };
  window.__T_MAKE = { makeParalyzer, makeMP5, makeSawedOff, makeScattergun, makeObliterator,
    makeMauser, makeArcProjector, makeKnife, makeHammer, makeRiotShield, makeBatteringRam };
  const __THooks = window.__T = {
    game, S, P, WEAPONS, ECONOMY, LINES,
    spawn(winId, variant) {
      const win = S.windows.find((w) => w.def.id === (winId || S.activeWindows[0]));
      return win ? spawnZombie(game, S, win, variant) : null;
    },
    setPoints(n) { S.points = n; hud.points(n); },
    give(id) { S.player.give(id); hud.ammo(S.player); },
    // Drive a reload from a test without going through the key handler.
    reload() { tryReload(S.player, sfx, S); },
    /* Override the hip carry so a screenshot can frame the weapon instead
       of catching the corner of it. Null clears the override. */
    viewPose(x, y, d) { P.poseOverride = (x == null) ? null : { x, y, d }; },
    killAll() { for (const z of S.zombies) if (!z.dead) killZombie(game, S, z, false); },
    forceRound(n) { S.round = n - 1; S.toSpawn = 0; for (const z of S.zombies) if (!z.dead) killZombie(game, S, z, false); startRound(game, S, hud, sfx); },
    god(on) { S.godMode = on !== false; },
    /* Hurt a body directly, so a harness can look at what a hit throws
       off it without having to line up a shot first. */
    hurt(z, dmg, at, headshot, source) {
      const p = z.actor.position;
      hurtZombie(game, S, z, dmg, at || [p.x, p.y + 0.9, p.z], !!headshot, source || 'bullet');
    },
    hold(o) { Object.assign(S.testHold, o); },
    release() { S.testHold = {}; },
    teleport(x, y, z) { P.actor.controller.teleport(new window.LE.Vec3(x, y, z)); },
    look(yaw, pitch) { game._camYaw = yaw; game._camPitch = Math.max(-1.45, Math.min(1.45, pitch)); },
    idleInPool() { return S.pool.filter((z) => z.parked).length; },
    poolReady() { return S.pool.filter((z) => z.parked).length; },
    spawnKind(kind, winId) {
      const win = S.windows.find((w) => w.def.id === (winId || S.activeWindows[0]));
      return win ? spawnZombie(game, S, win, kind) : null;
    },
    variantOdds(r) { return variantWeights(r); },
    kill(z) { killZombie(game, S, z, false); },
    shop() {
      const sh = S.shop;
      return sh && {
        stock: sh.stock.filter(Boolean), discount: sh.discount, stolen: sh.stolen,
        hostile: sh.hostile, donated: sh.donated.slice(),
        prices: sh.stock.filter(Boolean).map((id) => [id, sh.prices[id], sh.buyback[id]]),
      };
    },
    goDown() { const c = S.shop.counterAt; __THooks.teleport(c[0], c[1] + 1.1, c[2] + 0.4); },
    interactAt(x, y, z) {
      __THooks.teleport(x, y, z);
      game.step(1 / 60);
      const it = nearestInteract(S, P);
      return it && { kind: it.kind, label: it.label, cost: it.cost };
    },
    doInteractAt(x, y, z) {
      __THooks.teleport(x, y, z);
      game.step(1 / 60);
      const it = nearestInteract(S, P);
      if (it) doInteract(game, S, P, hud, sfx, it, 1 / 60);
      return it && it.kind;
    },
    buildPool(n) { while (S.pool.length < n) buildPooledZombie(game, S, S.pool.length); return S.pool.length; },
    ripState() {
      return S.zombies.filter((z) => !z.parked && z.V && z.V.ranged).map((z) => ({
        kind: z.kind, dead: z.dead, hp: Math.round(z.hp * 10) / 10, maxHp: Math.round(z.maxHp * 10) / 10,
        ripStage: z.ripStage, ripT: z.ripT, throwT: z.throwT, face: z.ripFace,
        holes: z.wounds.filter((w) => w.shown).length,
        bones: z.wounds.filter((w) => w.boneShown).length,
        faceHole: z.wounds.some((w) => w.face && w.shown),
      }));
    },
    projectiles() {
      return S.projectiles.map((pr) => ({
        at: [pr.actor.position.x, pr.actor.position.y, pr.actor.position.z],
        speed: Math.hypot(pr.vel[0], pr.vel[1], pr.vel[2]),
        dmg: Math.round(pr.dmg * 10) / 10, grav: pr.grav,
      }));
    },
    woundSockets(slot) {
      // Bone-parented actors keep their world transform in the matrix, not
      // in .position — .position is the local offset and never moves.
      const z = S.pool[slot || 0];
      if (!z || !z.wounds) return [];
      const w3 = (a) => [a.matrix.e[12], a.matrix.e[13], a.matrix.e[14]];
      return z.wounds.map((w) => ({
        face: w.face, root: w3(z.actor), head: z.actor.head ? w3(z.actor.head) : null,
        cavity: w3(w.cavity), bone: w3(w.bone),
      }));
    },
  };

  rollShop(S);
  if (!opts.test) game.start();
  return { game, S, P };
}

/* The imported body for the male zombie. Loaded once before the game
   starts; every male in the horde shares its geometry and gets its own
   skeleton. If the fetch fails the procedural body is used instead, so the
   game still runs with no model file present. */
let WALKER = null;

async function preload(base) {
  try {
    /* Relative to the page, which lives in games/ — the model does not.
       Left as a bare 'models/...' this resolved to games/models/walker.bin
       on every host that is not the repo root, so the deployed build has
       been quietly falling back to the procedural body. */
    const res = await fetch((base || '../') + 'models/walker.bin');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    WALKER = window.LE.parseRiggedMesh(await res.arrayBuffer());
  } catch (err) {
    WALKER = null;
    console.warn('walker model unavailable, falling back to the procedural body:', err.message);
  }
  return !!WALKER;
}

window.BUNKER = {
  start, preload, WEAPONS, ECONOMY, LINES, CAST,
  // The front end owns the settings screen; these are what it drives.
  applyGraphics, GRAPHICS, GRAPHICS_ORDER,
  // Exposed so the models can be inspected on their own, outside the map.
  models: { makeRiotShield, makeBatteringRam, makeHammer, makeKnife, makeScattergun, makeArcProjector },
};
})();
