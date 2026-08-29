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
        adsSpread: 0.05 }),
      bans: ['scatter', 'sawnoff', 'paralyzer', 'mp5'] },
    /* --- stock --- */
    dual: { slot: 'stock', name: "What's Better Than One", cost: 4000,
      blurb: 'Two of them. No optic, no sights, and you are slow',
      fold: (w) => ({ dual: true, mag: w.mag * 2, dmg: w.dmg * 1.85,
        moveMul: (w.moveMul || 1) * 0.72, noAds: true, reload: w.reload * 1.5,
        recoil: Object.assign({}, w.recoil, { side: w.recoil.side * 1.7 }) }),
      bans: ['arc', 'ram', 'shield', 'knife', 'hammer', 'obliterator'] },
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

/* How far under the mud a body starts and how long it takes to get out. */
const RISE_DEPTH = 1.9, RISE_TIME = 1.9;

/* What the Arc Breaker leaves behind: ten seconds locked rigid, taking
   current the whole time, arcing and twitching so you can see which ones
   are safe to turn your back on. */
const STUN = { time: 10, dps: 5, arcEvery: 0.16 };

const WEAPONS = {
  m1911: {
    name: 'M1911', slotName: 'SIDEARM',
    dmg: 55, headMul: 3.0, mag: 7, reserve: 42, refire: 0.16,
    reload: 1.5, auto: false, pellets: 1, spread: 0.4,
    kick: 1.6, sfx: 'shotPistol', reloadKind: 'mag',
    // sightH: height of the sight line above the weapon's own origin, so
    // aiming can place the gun such that the real notch-and-blade land on
    // the camera axis. Measured off the model, not eyeballed.
    sightH: 0.0455, sightFov: 0.74, adsTime: 0.16,
    recoil: { up: 1.15, side: 0.5, climb: 0.28, recover: 9 },
    hands: { right: [-0.004, -0.020, 0.017], left: [0.014, -0.056, -0.022], leftGrip: 'pistol' },
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
    kick: 1.5, sfx: 'shotPistol', reloadKind: 'mag',
    burn: { dps: 26, time: 5 },
    sightH: 0.0455, sightFov: 0.74, adsTime: 0.16,
    recoil: { up: 1.10, side: 0.5, climb: 0.26, recover: 9 },
    hands: { right: [-0.004, -0.020, 0.017], left: [0.014, -0.056, -0.022], leftGrip: 'pistol' },
  },
  thompson: {
    name: 'Thompson', slotName: 'THOMPSON',
    dmg: 40, headMul: 2.2, mag: 30, reserve: 210, refire: 0.1,
    reload: 2.3, auto: true, pellets: 1, spread: 1.1,
    kick: 0.9, sfx: 'shotSmg', reloadKind: 'mag',
    sightH: 0.0955, sightFov: 0.80, adsTime: 0.22,
    recoil: { up: 0.42, side: 0.30, climb: 0.13, recover: 11 },
    hands: { right: [-0.006, -0.024, 0.016], left: [0.330, -0.020, -0.017] },
  },
  scatter: {
    name: 'Scattergun', slotName: 'SCATTERGUN',
    dmg: 22, headMul: 1.6, mag: 2, reserve: 38, refire: 0.5,
    reload: 2.6, auto: false, pellets: 8, spread: 5.5,
    kick: 3.2, sfx: 'shotScatter', reloadKind: 'break',
    sightH: 0.0275, sightFov: 0.86, adsTime: 0.24, adsSpread: 0.55,
    recoil: { up: 2.6, side: 0.9, climb: 0.75, recover: 7 },
    hands: { right: [-0.014, -0.046, 0.016], left: [0.242, -0.006, -0.020] },
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
    kick: 3.0, sfx: 'shotArc', reloadKind: 'break',
    pierce: 3, pierceFalloff: 0.86, stun: true,
    sightH: 0.0425, sightFov: 0.86, adsTime: 0.26, adsSpread: 0.62,
    recoil: { up: 2.4, side: 0.85, climb: 0.60, recover: 7.5 },
    moveMul: 0.94, muzzleVel: 62,
    hands: { right: [-0.014, -0.046, 0.016], left: [0.268, -0.010, -0.020] },
  },
  mp5: {
    name: 'MP5', slotName: 'MP5',
    dmg: 34, headMul: 2.3, mag: 30, reserve: 240, refire: 0.075,
    reload: 2.1, auto: true, pellets: 1, spread: 0.95,
    kick: 0.8, sfx: 'shotSmg', reloadKind: 'mag',
    sightH: 0.0435, sightFov: 0.80, adsTime: 0.19,
    recoil: { up: 0.36, side: 0.26, climb: 0.11, recover: 12 },
    moveMul: 1.0, muzzleVel: 400,
    hands: { right: [-0.012, -0.044, 0.016], left: [0.232, -0.014, -0.020] },
  },
  sawnoff: {
    name: 'Sawn-Off', slotName: 'SAWN-OFF',
    dmg: 30, headMul: 1.5, mag: 2, reserve: 34, refire: 0.34,
    reload: 2.0, auto: false, pellets: 12, spread: 9.5,
    kick: 4.2, sfx: 'shotScatter', reloadKind: 'break',
    sightH: 0.026, sightFov: 0.94, adsTime: 0.18, adsSpread: 0.85,
    recoil: { up: 3.6, side: 1.6, climb: 1.05, recover: 6.5 },
    moveMul: 1.06, muzzleVel: 48,
    hands: { right: [-0.016, -0.048, 0.016], left: [0.170, -0.004, -0.020] },
  },
  hammer: {
    name: 'Claw Hammer', slotName: 'HAMMER',
    dmg: 0, headMul: 1, mag: Infinity, reserve: Infinity, refire: 9,
    reload: 0, auto: false, pellets: 0, spread: 0,
    kick: 0, sfx: 'dryFire', tool: true,
    sightH: 0.05, sightFov: 0.95, adsTime: 0.2,
    recoil: { up: 0, side: 0, climb: 0, recover: 12 },
    hands: { right: [0.006, -0.002, 0.012], left: null, rightGrip: 'pistol' },
  },
  knife: {
    name: 'Trench Knife', slotName: 'KNIFE',
    dmg: 100, headMul: 1.0, mag: Infinity, reserve: Infinity, refire: 0.42,
    reload: 0, auto: false, pellets: 1, spread: 0,
    kick: 1.0, sfx: 'knife', melee: true, range: 2.2,
    sightH: 0.05, sightFov: 0.95, adsTime: 0.18,
    recoil: { up: 0.5, side: 0.4, climb: 0, recover: 12 },
    hands: { right: [-0.006, -0.002, 0.012], left: null },
  },
  /* What a sheriff was carrying. Four chambers, a barrel you could lose
     your nerve looking down, and enough behind each round to carry it
     through two more bodies. */
  obliterator: {
    name: 'Obliterated Model 5', slotName: 'MODEL 5',
    dmg: 620, headMul: 2.0, mag: 4, reserve: 32, refire: 0.44,
    reload: 3.1, auto: false, pellets: 1, spread: 0.5,
    kick: 3.4, sfx: 'shotMagnum', revolver: true, reloadKind: 'revolver',
    pierce: 2, pierceFalloff: 0.62,
    sightH: 0.030, sightFov: 0.86, adsTime: 0.26, adsSpread: 0.18,
    recoil: { up: 4.2, side: 1.5, climb: 0.30, recover: 7 },
    hands: { right: [-0.014, -0.044, 0.014], left: [0.026, -0.056, -0.028], leftGrip: 'pistol' },
  },
  mauser: {
    name: 'Mauser C96', slotName: 'MAUSER',
    dmg: 165, headMul: 2.4, mag: 10, reserve: 90, refire: 0.16,
    reload: 2.3, auto: false, pellets: 1, spread: 0.7,
    kick: 1.5, sfx: 'shotPistol', reloadKind: 'clip',
    sightH: 0.036, sightFov: 0.90, adsTime: 0.20, adsSpread: 0.22,
    recoil: { up: 1.5, side: 0.6, climb: 0.06, recover: 11 },
    hands: { right: [-0.010, -0.020, 0.014], left: null },
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
    hands: { right: [-0.02, -0.055, -0.03], left: [0.10, -0.05, 0.12] },
  },
  shieldWorn: {
    name: 'Cracked Riot Shield', slotName: 'CRACKED SHIELD',
    dmg: 130, headMul: 1.0, mag: Infinity, reserve: Infinity, refire: 0.66,
    reload: 0, auto: false, pellets: 1, spread: 0,
    kick: 1.4, sfx: 'shieldHit', melee: true, range: 2.0,
    knockback: 3.8, sweep: 0.9, blocks: true,
    sightH: 0.05, sightFov: 1.0, adsTime: 0.26,
    recoil: { up: 0.9, side: 0.5, climb: 0, recover: 11 },
    hands: { right: [-0.02, -0.045, -0.02], left: [0.02, -0.02, 0.10] },
  },
  shield: {
    name: 'Riot Shield', slotName: 'RIOT SHIELD',
    dmg: 190, headMul: 1.0, mag: Infinity, reserve: Infinity, refire: 0.58,
    reload: 0, auto: false, pellets: 1, spread: 0,
    kick: 1.4, sfx: 'shieldHit', melee: true, range: 2.1,
    knockback: 5.0, sweep: 0.9, blocks: true,
    sightH: 0.05, sightFov: 1.0, adsTime: 0.22,
    recoil: { up: 0.9, side: 0.5, climb: 0, recover: 11 },
    hands: { right: [-0.02, -0.045, -0.02], left: [0.02, -0.02, 0.10] },
  },
  arc: {
    name: 'Arc Breaker', slotName: 'ARC BREAKER',
    dmg: 900, headMul: 1.0, mag: 6, reserve: 30, refire: 0.55,
    reload: 2.9, auto: false, pellets: 1, spread: 0,
    kick: 1.2, sfx: 'shotArc', reloadKind: 'cell',
    sightH: 0.0580, sightFov: 0.82, adsTime: 0.26,
    recoil: { up: 0.9, side: 0.2, climb: 0.2, recover: 8 },
    hands: { right: [-0.014, -0.046, 0.016], left: [0.188, -0.052, -0.020] },
    chain: { count: 3, radius: 4.0, dmg: 500 },
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
  hp: 100, regenDelay: 3.5, regenRate: 40,
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
  patch: { name: 'CPL. "PATCH" OKAFOR', base: 215, spread: 60, type: 'triangle', color: '#ffd27a' },
  radio: { name: 'THE NIGHTWATCHMAN', base: 122, spread: 26, type: 'square', color: '#7ad7ff' },
};

/* ---------------- graphics presets ----------------

   Four tiers, and each one is a whole position rather than a slider.
   `tier` is what the renderer is told; the rest is the game's own share of
   the cost, which on this map is most of it — the battlefield outside is
   several hundred props and the lamps each cost a shadow pass.

   The frame-rate figures are the target the tier is aimed at, not a
   promise: they are what it should hold on the hardware it is meant for. */
const GRAPHICS = {
  low: {
    name: 'LOW', tier: 'low', target: '30–50 FPS',
    blurb: 'Simplest shapes. No bloom, no far battlefield, one shadow cascade.',
    far: false, decals: false, smoke: false, lamps: 5, particles: 0.35, shadows: true,
  },
  normal: {
    name: 'NORMAL', tier: 'medium', target: '50–70 FPS',
    blurb: 'What the game was built to look like.',
    far: true, decals: true, smoke: true, lamps: 99, particles: 1, shadows: true,
  },
  high: {
    name: 'HIGH', tier: 'high', target: '60–100 FPS',
    blurb: 'Sharper shadows, the full battlefield, every lamp.',
    far: true, decals: true, smoke: true, lamps: 99, particles: 1.3, shadows: true,
  },
  ultra: {
    name: 'ULTRA', tier: 'ultra', target: '100–200 FPS',
    blurb: 'Rendered above the display and downsampled. Wants the hardware.',
    far: true, decals: true, smoke: true, lamps: 99, particles: 1.8, shadows: true,
  },
};
const GRAPHICS_ORDER = ['low', 'normal', 'high', 'ultra'];

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
  gold: [
    ['patch', 'Something just came out of the east wall. A belt line.'],
    ['radio', 'Feeding what, exactly.'],
    ['patch', 'Gold. They were casting rounds in gold down here.'],
    ['radio', 'Somebody was very sure the ordinary kind would not be enough.'],
  ],
  blitz: [['radio', 'And the lightning takes the whole choir at once. Marvelous.']],
  nearDeath: [['patch', 'Still here. Angrier, but still here.']],
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
    shotPistol() { A.impact(0.85); t(1750, 0.03, 'square', 0.10); t(210, 0.09, 'sawtooth', 0.12); },
    shotSmg() { A.impact(0.7); t(1450, 0.025, 'square', 0.09); t(240, 0.07, 'sawtooth', 0.11); },
    shotScatter() { A.impact(1.0); t(950, 0.05, 'sawtooth', 0.14); t(120, 0.16, 'sawtooth', 0.16); },
    shotArc() { t(1900, 0.06, 'sawtooth', 0.09); t(640, 0.12, 'square', 0.10); t(96, 0.2, 'sine', 0.14); },
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
    powerup() { for (let i = 0; i < 4; i++) setTimeout(() => t(660 * Math.pow(1.25, i), 0.09, 'triangle', 0.1), i * 70); },
    blitz() { A.impact(1); t(60, 0.6, 'sawtooth', 0.18); t(2400, 0.3, 'sawtooth', 0.06); },
    hurt() { t(85, 0.2, 'sawtooth', 0.14); },
    heartbeat() { t(46, 0.11, 'sine', 0.2); setTimeout(() => t(40, 0.09, 'sine', 0.16), 180); },
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
    shotMagnum() { A.impact(1); t(1350, 0.045, 'square', 0.14); t(150, 0.20, 'sawtooth', 0.17); t(62, 0.26, 'sine', 0.10); },
    shotPistol() { A.impact(0.8); t(1600, 0.03, 'square', 0.10); t(230, 0.09, 'sawtooth', 0.11); },
    cylinderOut() { t(520, 0.05, 'square', 0.06); t(240, 0.07, 'triangle', 0.05); },
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
function makeVoice(game, hud, isOver) {
  let busy = 0;
  return function say(lineSet, priority) {
    if (isOver() && !priority) return;
    const now = performance.now() / 1000;
    if (now < busy && !priority) return;
    let delay = 0;
    for (const [who, text] of lineSet) {
      const c = CAST[who];
      const dur = Math.max(1.6, text.length * 0.045);
      setTimeout(() => {
        if (isOver() && !priority) return;
        hud.subtitle(c, text, dur);
        // One blip per word-ish, wandering around the character's pitch.
        const blips = Math.min(14, Math.max(5, Math.round(text.length / 7)));
        for (let i = 0; i < blips; i++) {
          setTimeout(() => {
            const f = c.base + (Math.sin(i * 2.7) * 0.5 + Math.random() * 0.5) * c.spread;
            game.audio.tone(f, 0.055, c.type, 0.055);
            if (who === 'radio' && i % 3 === 0) game.audio.tone(f * 2.01, 0.03, 'square', 0.02);
          }, 90 + i * (dur * 500 / blips));
        }
      }, delay * 1000);
      delay += dur + 0.25;
    }
    busy = now + delay;
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
    mud: { color: 0x3b3327, texture: 'dirt', roughness: 1.0, metalness: 0, uvScale: 3 },
    mudDark: { color: 0x241f18, texture: 'dirt', roughness: 1.0, metalness: 0, uvScale: 2 },
    burnt: { color: 0x2b2a28, texture: 'metal', roughness: 0.82, metalness: 1 },
    hull: { color: 0x4a4c3e, texture: 'metal', roughness: 0.72, metalness: 1, uvScale: 2 },
    wire: { color: 0x53504a, texture: 'metal', roughness: 0.6, metalness: 1 },
    cloth: { color: 0x4b4a3c, texture: 'fabric', roughness: 0.96, metalness: 0, uvScale: 3 },
    bark: { color: 0x261f1a, texture: 'wood', roughness: 0.96, metalness: 0, uvScale: 4 },
  };

  // A static slab from bounds, the whole bunker is made of these.
  const slab = (x0, x1, y0, y1, z0, z1, material = MAT.wall) => game.box({
    at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    size: [x1 - x0, y1 - y0, z1 - z0],
    material, static: true,
  });
  // Decoration outside the fight: drawn, never collided with.
  const deco = (x0, x1, y0, y1, z0, z1, material) => game.box({
    at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    size: [x1 - x0, y1 - y0, z1 - z0],
    material, physics: false,
  });
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
  game.ground({ material: MAT.mud, size: 160 });

  /* Everything the battlefield builds gets registered as it is made, so the
     graphics setting can take the whole of it away in one go rather than
     hunting for handles afterwards. Done by wrapping the three spawners for
     the length of the section: the alternative is threading a bucket
     through nine helper functions and remembering it in each of them, and
     one of them would eventually be forgotten. */
  S.detail = { far: [], smoke: [] };
  const rawSpawn = { box: game.box, cylinder: game.cylinder, sphere: game.sphere, cone: game.cone };
  const collect = (bucket) => {
    for (const k of Object.keys(rawSpawn)) {
      game[k] = function (o) { const a = rawSpawn[k].call(game, o); bucket.push(a); return a; };
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
  for (const [count, r0, spread, h0, hv, phase] of [
    [120, 31, 4, 4.2, 8.0, 0], [96, 37, 4, 3.8, 7.2, 0.03], [80, 43, 5, 3.4, 6.4, 0.06],
  ]) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + phase;
      const rr = r0 + ((k * 613) % 100) / 100 * spread;
      deadTree(Math.cos(a) * rr, Math.sin(a) * rr, h0 + ((k * 311) % 100) / 100 * hv, ((k * 53) % 14) - 7);
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

  // Floor pad, a step proud of the mud, and an apron round the outside.
  slab(M.x0 - W - 1.2, M.x1 + W + 1.2, -0.30, 0.02, M.z0 - W - 1.2, M.z1 + W + 1.2, MAT.floor);
  slab(SD.x0 - W - 0.8, M.x0, -0.30, 0.02, SD.z0 - W - 0.8, SD.z1 + W + 0.8, MAT.floor);

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
  wallX(SD.z0 - W, SD.z0, SD.x0 - W, SD.x1, SD.y1);
  wallX(SD.z1, SD.z1 + W, SD.x0 - W, SD.x1, SD.y1);
  slab(SD.x1, M.x0 - W, 0, SD.y1, SD.z0 - W, D1.z0, MAT.wall);
  slab(SD.x1, M.x0 - W, 0, SD.y1, D1.z1, SD.z1 + W, MAT.wall);

  /* Roof over the wing, with a ragged hole punched in it where the rock came
     through. The hole is eight wedges rather than a ring so the edge reads as
     torn concrete instead of a drilled circle. */
  {
    const H = MAP.hole, r = H.r;
    const RY = SD.y1 - 0.11;   // overlap the walls, same reason as the deck
    slab(SD.x0 - W, SD.x1, RY, SD.y1 + 0.3, SD.z0 - W, H.z - r, MAT.wallDark);
    slab(SD.x0 - W, SD.x1, RY, SD.y1 + 0.3, H.z + r, SD.z1 + W, MAT.wallDark);
    slab(SD.x0 - W, H.x - r, RY, SD.y1 + 0.3, H.z - r, H.z + r, MAT.wallDark);
    slab(H.x + r, SD.x1, RY, SD.y1 + 0.3, H.z - r, H.z + r, MAT.wallDark);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const w2 = game.box({ at: [H.x + Math.cos(a) * r * 0.86, SD.y1 + 0.15, H.z + Math.sin(a) * r * 0.86],
        size: [0.7, 0.3, 0.5], material: MAT.wallDark, physics: false });
      w2.setRotation([0, -a * 57.2958, 0]);
    }
    // Daylight and smoke coming down through it.
    game.light({ at: [H.x, SD.y1 - 0.6, H.z], color: 0xd8c9a4, intensity: 26, radius: 7.0 });
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

    // Treads. These are the collision — everything else here is drawn only.
    for (let k = 0; k < ST.steps; k++) {
      const y = (k + 1) * RISE;
      const z1 = ST.zBot - k * RUN;
      slab(ST.x0, ST.x1, y - 0.24, y, z1 - RUN - 0.02, z1, MAT.floor);
      // Riser board closing the front of each step.
      deco(ST.x0 + 0.02, ST.x1 - 0.02, y - 0.24, y - 0.02, z1 - RUN - 0.04, z1 - RUN + 0.01, MAT.wood);
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
    slab(ST.x0 - 0.1, M.x1, R.y0, R.y1, M.z0 - W, ST.zBot - (ST.steps - 1) * RUN, MAT.floor);

    /* Under the stair. Props that stop at the stringer, not at the ceiling:
       a post that runs the full height of the room is not holding a
       staircase up, it is a fence across the corner. */
    deco(ST.x0 + 0.06, ST.x1 - 0.06, 0, 0.09, ST.zTop + 0.2, ST.zBot, MAT.wood);   // sole plate
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
    slab(M.x0 - W, M.x1 + W, R.y0, R.y1, SLOT.z1, M.z1 + W, MAT.floor);
    slab(M.x0 - W, SLOT.x0, R.y0, R.y1, SLOT.z0, SLOT.z1, MAT.floor);
    slab(SLOT.x1, M.x1 + W, R.y0, R.y1, SLOT.z0, SLOT.z1, MAT.floor);
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
    run(M.x0, SLOT.x0 - 0.1, M.z0, M.z0 + DP);        // back wall, west of the slot
    run(M.x0, M.x1, M.z1 - DP, M.z1);                 // front wall
    run(M.x0, M.x0 + DP, M.z0, M.z1);                 // west wall
    run(M.x1 - DP, M.x1, SLOT.z1, M.z1);              // east wall, south of the slot
    // Joists across the short way, clear of the stair slot.
    for (let x = M.x0 + 2.2; x < SLOT.x0 - 0.4; x += 2.2) {
      slab(x - 0.10, x + 0.10, CY - 0.26, CY + 0.10, M.z0, M.z1, beam);
    }
    // The wing gets the same treatment.
    const WY = SD.y1 - 0.11;
    slab(SD.x0, SD.x1, WY - TH, WY + 0.10, SD.z0, SD.z0 + DP, beam);
    slab(SD.x0, SD.x1, WY - TH, WY + 0.10, SD.z1 - DP, SD.z1, beam);
    slab(SD.x0, SD.x0 + DP, WY - TH, WY + 0.10, SD.z0, SD.z1, beam);
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
  const thompsonChalk = game.thompson({ at: [-2.0, 1.55, M.z0 + 0.14], physics: false, material: chalkMat, woodMaterial: chalkMat });
  const scatterChalk = makeScattergun(game, { at: [-5.4, 1.55, M.z0 + 0.14], chalk: true });
  void thompsonChalk; void scatterChalk;

  /* The MP5 is on the far wall of the wing, so it is the first thing the
     power run pays for on the way back. */
  const mp5Chalk = makeMP5(game, { at: [SD.x0 + 0.16, 1.55, 0.6], chalk: true });
  mp5Chalk.root.setRotation([0, 90, 0]);
  /* And the Arc Breaker is on the roof, behind the parapet, where you have
     to have already been up the stairs to know it exists. */
  const paraChalk = makeParalyzer(game, { at: [-4.4, R.y1 + 0.46, M.z0 + 0.14], chalk: true });

  S.buys = [
    { id: 'thompson', at: [-2.0, 1.4, M.z0 + 0.3], weapon: 'thompson', label: 'Thompson' },
    { id: 'scatter', at: [-5.4, 1.4, M.z0 + 0.3], weapon: 'scatter', label: 'Scattergun' },
    { id: 'mp5', at: [SD.x0 + 0.5, 1.4, 0.6], weapon: 'mp5', label: 'MP5' },
    { id: 'paralyzer', at: [-4.4, R.y1 + 1.15, M.z0 + 0.5], weapon: 'paralyzer', label: 'Paralyzer' },
  ];
  void mp5Chalk; void paraChalk;

  /* Grenade crate, stencilled and open, on the wall between the two guns. */
  const nadeAt = [-3.7, 1.05, M.z0 + 0.26];
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
    };
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
    const benchRun = (cx, cz, sx, sz, alongX) => {
      game.box({ at: [cx, 0.94, cz], size: [sx, 0.09, sz], material: MAT.wood, static: true });
      if (alongX) {
        game.box({ at: [cx, 0.83, cz - sz / 2 + 0.06], size: [sx, 0.16, 0.09], material: MAT.wood, static: true });
        game.box({ at: [cx, 0.86, cz + sz / 2 - 0.03], size: [sx, 0.10, 0.06], material: MAT.board, static: true });
        for (const dx of [-sx / 2 + 0.16, sx / 2 - 0.16]) {
          game.box({ at: [cx + dx, 0.45, cz - sz / 2 + 0.12], size: [0.11, 0.90, 0.11], material: MAT.wood, static: true });
        }
      } else {
        game.box({ at: [cx + sx / 2 - 0.06, 0.83, cz], size: [0.09, 0.16, sz], material: MAT.wood, static: true });
        game.box({ at: [cx - sx / 2 + 0.03, 0.86, cz], size: [0.06, 0.10, sz], material: MAT.board, static: true });
        for (const dz of [-sz / 2 + 0.16, sz / 2 - 0.16]) {
          game.box({ at: [cx + sx / 2 - 0.12, 0.45, cz + dz], size: [0.11, 0.90, 0.11], material: MAT.wood, static: true });
        }
      }
    };
    benchRun(BX, BZ, 3.10, 0.86, true);
    benchRun(RX, RZ, 0.86, 2.40, false);

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

  /* ---------------- perks ---------------- */
  const PERK_SPOTS = [
    ['supersoldier', [2.2, R.y1, -6.2]],      // roof, by the stair head
    ['adrenaline', [-14.9, 0, 3.6]],           // wing, past the generator
    ['deflect', [6.1, 0, 5.7]],                // ground floor, front-right
    ['shieldup', [-6.0, 0, -6.1]],             // ground floor, back-left
  ];
  S.perkStations = PERK_SPOTS.map(([id, at]) => {
    const def = PERKS[id];
    const body = game.box({ at: [at[0], at[1] + 0.55, at[2]], size: [0.62, 1.1, 0.5], material: MAT.steel, static: true });
    game.box({ at: [at[0], at[1] + 1.16, at[2]], size: [0.68, 0.12, 0.56], material: MAT.wallDark, static: true });
    const glow = game.box({
      at: [at[0], at[1] + 0.78, at[2] + 0.26], size: [0.34, 0.34, 0.03], physics: false,
      material: { color: 0x101010, texture: 'smooth', roughness: 0.3, emissive: def.color, emissiveStrength: 1.6 },
    });
    return { id, def, at: [at[0], at[1] + 1.0, at[2]], glow, body };
  });

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
  const lamp = (x, y, z, intensity, color = 0xffc98f) => {
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
  lamp(-2.0, 2.4, M.z0 + 1.4, 55, 0xcfe8ff);
  lamp(-5.4, 2.4, M.z0 + 1.4, 55, 0xcfe8ff);
  lamp(SD.x0 + 1.3, 2.4, 0.6, 48, 0xcfe8ff);
  /* Daylight arrives as much from the whole smoke-lit sky as from the sun,
     and it is the sky term that lights every upward-facing surface — the
     roof deck most of all. At the night map's 1.5 the deck read as a black
     slab under an overcast noon. */
  game.renderer.sky.intensity = 2.2;
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
    S.belt = { root, parts, rollers, lamp, at: [bx, by, bz], out: 0, running: false, dropT: 0, spin: 0 };
  }
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
  return rackGroup(b, { cylinder: b.cylinder, crane: b.crane });
}

function makeArcProjector(game, opts = {}) {
  const b = game.arcBreaker(rackOpts(opts));
  // The cell and its window drop out together.
  const cell = [b.cell, b.cellGlow].filter(Boolean);
  return rackGroup(b, { cell: b.cell, cellParts: cell, cellRest: b.cellRest, cellDrop: b.cellDrop, coils: b.copper });
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
    cooldown: 0, reloading: 0, reloadStage: 0, swayT: 0, kickPitch: 0,
    slideCycle: 0, slideCycleMax: 0.085,
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
  rack('shieldWorn', makeRiotShield(game));
  // Hands, parented to each weapon so they inherit its every motion.
  for (const [id, v] of Object.entries(P.view)) {
    const root = v.kind === 'single' ? v.actor : v.root;
    v.arms = game.viewmodelArms(root, WEAPONS[id].hands, { key: id });
  }
  for (const v of Object.values(P.view)) setViewVisible(v, false);

  /* Pointer lock: click to capture, mouse drives engine yaw/pitch. */
  const canvas = game.canvas;
  canvas.addEventListener('click', () => {
    if (S.testMode || S.gameOver) return;
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousedown', (e) => { if (e.button === 2) game.input.pointer.rightDown = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) game.input.pointer.rightDown = false; });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    game._camYaw -= e.movementX * 0.0021;
    game._camPitch = Math.max(-1.45, Math.min(1.45, game._camPitch + e.movementY * 0.0021));
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
    else { P.slots[P.slot] = id; }
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
function applyAttachmentLooks(game, P, id) {
  const v = P.view[id];
  if (!v) return;
  const root = v.kind === 'single' ? v.actor : v.root;
  const base = WEAPONS[id];
  const M = v.muzzle || 0.3, H = base.sightH || 0.04;
  if (!v.att) {
    const steel = { color: 0x4a4e54, texture: 'metal', roughness: 0.42, metalness: 1 };
    const black = { color: 0x1d2024, texture: 'metal', roughness: 0.58, metalness: 1 };
    const glassR = { color: 0x140808, texture: 'smooth', roughness: 0.12, metalness: 0,
      emissive: 0xff2a1e, emissiveStrength: 2.2 };
    const glassG = { color: 0x081408, texture: 'smooth', roughness: 0.12, metalness: 0,
      emissive: 0x4affa0, emissiveStrength: 2.0 };
    const mk = (spec, pos, rot) => {
      const a = spec(); a.parent = root; a.setPosition(pos); if (rot) a.setRotation(rot);
      a.visible = false; return a;
    };
    const cyl = (r, h, m) => () => game.cylinder({ radius: r, height: h, material: m, physics: false });
    const box = (sz, m) => () => game.box({ size: sz, material: m, physics: false });
    v.att = {
      suppressor: [
        mk(cyl(0.024, 0.17, black), [M - 0.02, H * 0.30, 0], [0, 0, 90]),
        mk(cyl(0.027, 0.012, steel), [M - 0.10, H * 0.30, 0], [0, 0, 90]),
      ],
      compensator: [
        mk(cyl(0.021, 0.055, steel), [M - 0.02, H * 0.30, 0], [0, 0, 90]),
        mk(box([0.045, 0.030, 0.006], black), [M - 0.02, H * 0.30 + 0.017, 0]),
      ],
      annihilator: [
        mk(box([0.085, 0.044, 0.044], black), [M + 0.01, H * 0.30, 0]),
        mk(box([0.020, 0.056, 0.010], steel), [M + 0.03, H * 0.30, 0]),
        mk(box([0.020, 0.010, 0.056], steel), [M + 0.03, H * 0.30, 0]),
        mk(cyl(0.028, 0.014, steel), [M - 0.03, H * 0.30, 0], [0, 0, 90]),
      ],
      longbarrel: [mk(cyl(0.013, 0.19, steel), [M + 0.06, H * 0.30, 0], [0, 0, 90])],
      shortbarrel: [mk(cyl(0.020, 0.035, steel), [M * 0.62, H * 0.30, 0], [0, 0, 90])],
      skullsplitter: [
        mk(cyl(0.018, 0.13, black), [M * 0.72, H * 0.30, 0], [0, 0, 90]),
        mk(box([0.10, 0.008, 0.030], steel), [M * 0.72, H * 0.30 + 0.019, 0]),
      ],
      bayonet: [
        mk(box([0.17, 0.024, 0.005], steel), [M * 0.86, H * 0.30 - 0.020, 0], [0, 0, 2]),
        mk(box([0.055, 0.016, 0.012], black), [M * 0.62, H * 0.30 - 0.020, 0]),
      ],
      reddot: [
        mk(box([0.055, 0.030, 0.040], black), [0.02, H + 0.030, 0]),
        mk(box([0.004, 0.026, 0.034], glassR), [0.046, H + 0.032, 0]),
      ],
      thermal: [
        mk(cyl(0.026, 0.115, black), [0.03, H + 0.036, 0], [0, 0, 90]),
        mk(cyl(0.024, 0.008, glassG), [0.086, H + 0.036, 0], [0, 0, 90]),
        mk(box([0.05, 0.020, 0.040], black), [0.02, H + 0.012, 0]),
      ],
      nightvision: [
        mk(cyl(0.030, 0.125, black), [0.03, H + 0.038, 0], [0, 0, 90]),
        mk(cyl(0.028, 0.008, glassG), [0.092, H + 0.038, 0], [0, 0, 90]),
      ],
      rangefinder: [
        mk(box([0.10, 0.038, 0.046], black), [0.03, H + 0.034, 0]),
        mk(box([0.004, 0.022, 0.030], glassR), [0.079, H + 0.036, 0]),
        mk(box([0.028, 0.016, 0.016], steel), [0.03, H + 0.056, 0.026]),
      ],
      scope7x: [
        mk(cyl(0.023, 0.24, black), [0.06, H + 0.044, 0], [0, 0, 90]),
        mk(cyl(0.032, 0.030, black), [0.17, H + 0.044, 0], [0, 0, 90]),
        mk(cyl(0.028, 0.030, black), [-0.05, H + 0.044, 0], [0, 0, 90]),
        mk(box([0.030, 0.030, 0.030], steel), [0.02, H + 0.020, 0]),
        mk(box([0.030, 0.030, 0.030], steel), [0.12, H + 0.020, 0]),
      ],
      extmag: [mk(box([0.036, 0.055, 0.030], black), [-0.010, -0.098, 0])],
      drummag: [
        mk(cyl(0.070, 0.042, black), [0.005, -0.105, 0], [90, 0, 0]),
        mk(cyl(0.050, 0.048, steel), [0.005, -0.105, 0], [90, 0, 0]),
      ],
      fastmag: [mk(box([0.040, 0.020, 0.034], steel), [-0.010, -0.062, 0])],
    };
  }
  const fit = P.fitted[id] || {};
  const wanted = new Set(ATTACH.slots.map((sl) => fit[sl]).filter(Boolean));
  for (const [k, arr] of Object.entries(v.att)) {
    const on = wanted.has(k);
    for (const a of arr) { a.visible = on; a.__attOn = on; }
  }
}

/* Where each slot hangs off a weapon, in that weapon's own space. Derived
   from its measured muzzle distance and sight height rather than listed per
   gun, so a marker lands on the right part of every weapon including the
   ones that do not exist yet. */
function attachAnchor(slot, id, v) {
  const base = WEAPONS[id] || WEAPONS.m1911;
  const M = v.muzzle || 0.3, H = base.sightH || 0.04;
  switch (slot) {
    case 'muzzle': return [M - 0.01, H * 0.30, 0];
    case 'barrel': return [M * 0.68, H * 0.30 - 0.022, 0];
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
  for (const p of v.parts) p.visible = on;
  // Attachment parts follow the weapon, but only the ones actually fitted:
  // showing the whole set on draw hangs every scope and muzzle device the
  // gun has ever worn off it at once.
  if (v.att) for (const arr of Object.values(v.att)) for (const a of arr) a.visible = on && !!a.__attOn;
}

/* Position the equipped weapon against the camera every frame — bob,
   sway, recoil, reload dip. This is the whole first-person feel. */
function updateViewmodel(game, P, dt, moving, S, sfx) {
  const spec = P.spec();
  const v = P.view[P.equipped()];
  for (const [id, view] of Object.entries(P.view)) setViewVisible(view, id === P.equipped() && P.alive);
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
  P.kickPitch = Math.max(0, P.kickPitch - dt * 9);
  const dip = P.reloading > 0 ? Math.sin(Math.min(1, 1 - P.reloading / spec.reload) * Math.PI) * 0.09 : 0;

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
  const hipX = (po ? po.x : 0.085 + bulk * 0.055) + bobX * (bench ? 0 : 1),
        hipY = (po ? po.y : -0.10 - bulk * 0.045) + (bench ? 0 : bobY - dip),
        hipD = po ? po.d : 0.34 + bulk * 0.05;
  const adsX = 0, adsY = -spec.sightH, adsD = 0.30;
  const a = P.ads;
  const offR = hipX * (1 - a) + adsX * a;
  const offU = hipY * (1 - a) + adsY * a;
  const dist = hipD * (1 - a) + adsD * a;

  // Sprinting: gun canted down and inboard, out of the sight line.
  const sp = P.sprint * (1 - a);
  const sprintDrop = sp * 0.10, sprintIn = sp * 0.05;

  const px = cam.position.x + f.x * dist + right.x * (offR - sprintIn) + up.x * (offU - sprintDrop);
  const py = cam.position.y + f.y * dist + right.y * (offR - sprintIn) + up.y * (offU - sprintDrop);
  const pz = cam.position.z + f.z * dist + right.z * (offR - sprintIn) + up.z * (offU - sprintDrop);
  root.setPosition([px, py, pz]);

  const fh = Math.hypot(f.x, f.z) || 1e-6;
  const yaw = Math.atan2(-f.z / fh, f.x / fh);
  const pitch = Math.asin(Math.max(-1, Math.min(1, f.y))) + P.kickPitch * 0.06;
  // Roll the weapon inboard while sprinting; hold it level while aimed.
  const roll = sp * 0.42 + (1 - a) * 0.03;
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
      if (!P.breakOpen && u > 0.06) { P.breakOpen = true; sfx.cylinderOut(); ejectShell(game, S, P, v); ejectShell(game, S, P, v); }
      if (P.breakOpen && u > 0.62) { P.breakOpen = false; sfx.magIn(); }
      if (P.reloadStage < 3 && u > 0.88) { P.reloadStage = 3; sfx.cylinderIn(); }
    } else if (P.breakOpen) { P.breakOpen = false; }
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
  if (spec.reloadKind === 'mag' && Array.isArray(v.mag)) {
    const out = P.reloading > 0 && P.reloadStage >= 1 && P.reloadStage < 2;
    for (const m of v.mag) m.visible = !out;
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
      const inClip = u > 0.28 && u < 0.74;
      v.clip.visible = inClip;
      if (inClip) {
        // The clip comes down into the open action and the rounds are
        // stripped off it, so it travels and then leaves.
        const t = Math.min(1, (u - 0.28) / 0.28);
        v.clip.setPosition([v.clipRest[0], v.clipRest[1] - 0.040 * t, v.clipRest[2]]);
      }
      if (!P.clipIn && u > 0.30) { P.clipIn = true; sfx.magIn(); }
      if (P.clipIn && u > 0.76) { P.clipIn = false; sfx.slideRelease(); }
    } else {
      v.bolt.setPosition(R);
      v.clip.visible = false;
      P.clipIn = false;
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
      if (!P.cellOut && u > 0.10) { P.cellOut = true; sfx.magOut(); }
      if (P.cellOut && u > 0.66) { P.cellOut = false; sfx.magIn(); }
      if (u > 0.86 && Math.random() < 0.4) {
        game.particles.sparks(P.muzzleWorld || [0, 0, 0], { count: 3, speed: 2.2, color: 0x7fd8ff, colorEnd: 0x1a3a4a });
      }
    } else {
      for (const c of CP) { c.setPosition(R); c.setRotation([0, 0, 0]); }
      P.cellOut = false;
    }
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
      if (!P.cylOut && u > 0.05) { P.cylOut = true; sfx.cylinderOut(); }
      if (P.cylOut && u > 0.86) { P.cylOut = false; sfx.cylinderIn(); }
    } else {
      v.cylinder.setPosition([0, 0, 0]);
      v.cylinder.setRotation([0, 0, 0]);
      P.cylOut = false;
    }
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

  if (spec.melee) { /* no magazine to check */ } else if (am.mag <= 0) {
    sfx.dryFire();
    if (am.reserve <= 0 && Math.random() < 0.4) S.voice(LINES.lowAmmo);
    else tryReload(P, sfx);
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
  sfx[spec.sfx]();
  hud.ammo(P);
  P.slideCycle = spec.auto ? 0.055 : 0.085;
  P.slideCycleMax = P.slideCycle;
  ejectShell(game, S, P, P.view[P.equipped()]);

  // Muzzle flash: light + sparks, one frame of each.
  if (P.muzzleWorld) {
    game.particles.sparks(P.muzzleWorld, { count: spec.pellets > 1 ? 14 : 8, speed: 5, color: 0xffd27a });
    const fl = game.light({ at: P.muzzleWorld, color: spec.sfx === 'shotArc' ? 0x66d4ff : 0xffc061, intensity: 130, radius: 8 });
    fl._decay = 0.05;   // engine removes lights whose _decay is set
  }

  const cam = game.camera;
  const fwd = _vTmp1.copy(cam.target).sub(cam.position).normalize();
  let killsThisShot = 0;

  // Aimed fire tightens the cone; a shotgun tightens less than a rifle,
  // which is what its own adsSpread is for.
  const aimTighten = 1 - P.ads * (1 - (spec.adsSpread != null ? spec.adsSpread : PLAYER.adsSpread));
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
    const hit = game.raycast([cam.position.x, cam.position.y, cam.position.z], dir, 60,
      (b) => b !== P.actor.body && !b.isTrigger && !(b.userData && b.userData.bulletPassthrough));
    if (!hit) continue;

    const z = hit.actor && hit.actor.userData && hit.actor.userData.zombie;
    if (z && !z.dead) {
      const region = hitRegion(z, hit.point);
      const headshot = !!region.crit;
      const dmg = (spec.dmg * regionMul(region, spec) + (headshot ? (spec.headBonus || 0) : 0))
        * (P.goldAmmo ? GOLD.dmgMul : 1);
      // Snapshot before the kill: death parks the body at the pool lot,
      // and the chain has to arc from the corpse, not the car park.
      const diedAt = { x: z.actor.position.x, y: z.actor.position.y, z: z.actor.position.z };
      hurtZombie(game, S, z, dmg, hit.point, headshot,
        spec.stun ? 'shock' : spec.burn ? 'fire' : (P.goldAmmo ? 'gold' : 'bullet'),
        spec.burn ? { burn: spec.burn } : null);
      let awarded = S.addPoints(ECONOMY.hit);
      if (z.dead) {
        killsThisShot++;
        const mult = z.V ? z.V.points : 1;
        awarded += S.addPoints((headshot ? ECONOMY.headshotKill : ECONOMY.kill) * mult);
      }
      hud.pointsDelta(awarded);
      headshot ? sfx.headmark() : sfx.hitmark();
      hud.hitmark(headshot);
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
            spec.stun ? 'shock' : spec.burn ? 'fire' : (P.goldAmmo ? 'gold' : 'bullet'),
            spec.burn ? { burn: spec.burn } : null);
          const pts2 = S.addPoints(head2 ? ECONOMY.headshotKill : ECONOMY.hit);
          hud.pointsDelta(pts2);
          from = nxt.point;
        }
      }
      // Arc chain: jump to neighbours of the first thing it kills.
      if (spec.chain) {
        let jumps = 0;
        for (const other of S.zombies) {
          if (jumps >= spec.chain.count) break;
          if (other === z || other.dead) continue;
          const d = dist2d(other.actor.position, diedAt);
          if (d < spec.chain.radius) {
            arcBolt(game, diedAt, other.actor.position);
            hurtZombie(game, S, other, spec.chain.dmg, other.actor.position, false, 'bullet');
            if (other.dead) { S.addPoints(ECONOMY.kill); hud.pointsDelta(ECONOMY.kill); }
            jumps++;
          }
        }
      }
    } else {
      // Wall hit: dust and a chip sound at the point.
      game.particles.dust(hit.point, { count: 4, color: 0x8d8a82 });
    }
  }
  if (killsThisShot && !S.firstBloodDone) { S.firstBloodDone = true; S.voice(LINES.firstBlood); }
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

/* Eject a case. A real little brass cylinder with velocity and spin,
   thrown up and to the right out of the port, that lands and stays for a
   moment. Nothing sells a gun firing like brass leaving it. */
function ejectShell(game, S, P, v) {
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
function dropMagazine(game, S, P, v) {
  const gun = v.kind === 'single' ? v.actor : v.root;
  if (!gun.magWell || !gun.mag) return;
  const m = gun.matrix.e;
  const lp = gun.magWell;
  const wx = m[0] * lp[0] + m[4] * lp[1] + m[8] * lp[2] + m[12];
  const wy = m[1] * lp[0] + m[5] * lp[1] + m[9] * lp[2] + m[13];
  const wz = m[2] * lp[0] + m[6] * lp[1] + m[10] * lp[2] + m[14];
  const drop = game.box({
    at: [wx, wy, wz], size: [0.026, 0.10, 0.021], lifetime: 6,
    material: { color: 0x53585e, texture: 'metal', roughness: 0.5, metalness: 1 },
    velocity: [(Math.random() - 0.5) * 0.6, -0.8, (Math.random() - 0.5) * 0.6],
    bounce: 0.2, friction: 0.8, mass: 0.09,
  });
  if (drop.body) drop.body.angularVelocity.set((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5);
  S.brass.push(drop);
}

function tryReload(P, sfx) {
  const spec = P.spec();
  const am = P.ammoFor(P.equipped());
  if (spec.melee || P.reloading > 0 || am.mag >= spec.mag || am.reserve <= 0) return;
  // Adrenaline works the hands as well as the legs.
  P.reloading = spec.reload / (P.perks.adrenaline ? 2 : 1);
  /* Staged, so the hands do the job in order rather than dipping for a
     second and coming up full: release the catch, the old magazine falls
     clear, the fresh one goes in, and the slide runs forward on it. */
  P.reloadStage = 0;
  sfx.magRelease();
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
const SKIN_TONES = [0x76835f, 0x7c8664, 0x6f7d59, 0x79815e,
                    0x738060, 0x707c5a, 0x7e8767, 0x74815c];

/* Four builds, each with its own body model, and what being that build
   does to it. A heavy one is slower and much harder to put down; one in
   webbing is harder still; a light one is quicker and softer. Crossed with
   the four movement types that is sixteen distinct things coming at you,
   from four bodies and one head sculptor. */
const BODY_TYPES = [
  { id: 'male',    faceType: 'male',   hp: 1.00, speed: 1.00, walk: 'zwalk' },
  { id: 'female',  faceType: 'female', hp: 0.90, speed: 1.12, walk: 'zwalk_light' },
  { id: 'heavy',   faceType: 'heavy',  hp: 1.45, speed: 0.80, walk: 'zwalk_heavy' },
  { id: 'armored', faceType: 'male',   hp: 1.80, speed: 0.92, walk: 'zwalk' },
];

/* The four kinds. Health and damage multiply on top of the round curve,
   so a runner at round 12 is still a runner — the variant changes how it
   plays, the round changes how hard it hits. */
const VARIANTS = {
  walker: {
    weight: 1.0, speed: [0.95, 1.55], hp: 1.0, dmg: 1.0, points: 1.0,
    clip: 'zwalk', clipSpeed: 1.0, eye: 0xff7a2a,
  },
  runner: {
    weight: 0.0, speed: [3.1, 4.3], hp: 0.8, dmg: 1.0, points: 1.15,
    clip: 'zrun', clipSpeed: 1.0, eye: 0xff3a18, from: 4,
    run: true,
  },
  crawler: {
    // Low, quiet and easy to lose track of — worth less because it is
    // slow, but it comes through gaps the standing ones cannot use.
    weight: 0.0, speed: [1.2, 1.7], hp: 0.55, dmg: 1.15, points: 0.9,
    clip: 'zcrawl', clipSpeed: 1.0, eye: 0xffb02a, from: 3,
    crawl: true, height: 0.95,
  },
  /* The armoured runner. Not a variant of the walker — the point of it is
     that a thing already too fast to fight comfortably is also wearing
     something bullets will not go through. Guns are wasted on it; the
     battering ram, the riot shield and eighteen carat rounds are not. */
  armored: {
    weight: 0.0, speed: [2.8, 3.7], hp: 1.0, dmg: 1.25, points: 1.8,
    clip: 'zrun', clipSpeed: 1.0, eye: 0x8fd0ff, from: 8,
    plated: true, run: true,
  },
  /* Not rolled into the mix like the others: the boss is scheduled by the
     round, one at a time. */
  boss: {
    weight: 0.0, speed: BOSS.speed, hp: 1.0, dmg: BOSS.dmg, points: BOSS.points,
    clip: 'zwalk_heavy', clipSpeed: 1.45, eye: 0x9ad8ff, from: BOSS.from,
    /* Wearing the plate but not immune behind it. Those are two different
       things and conflating them cost him his kit: his defence is the shield
       and the thousand health, and making him bulletproof as well leaves
       nothing to do in the window where the shield is down. */
    wearsPlate: true, boss: true,
  },
  spitter: {
    // Keeps its distance and throws. The only ranged threat in the game,
    // and the reason Deflect is worth buying.
    weight: 0.0, speed: [1.0, 1.4], hp: 1.25, dmg: 1.0, points: 1.4,
    clip: 'zwalk', clipSpeed: 0.85, eye: 0x7cff5a, from: 6,
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
    armored: round < 8 ? 0 : Math.min(0.26, (round - 7) * 0.05),
  };
}

function pickVariant(round, rng) {
  const w = variantWeights(round);
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
      subsurface: 0.03, uvScale: 1,
    } } : {}),
    // The body material is now flesh only — the coat is its own mesh.
    material: { color: tone, texture: 'rust', roughness: 0.92, metalness: 0, subsurface: 0.05, uvScale: 3 },
    // A dressed variant carries its colours per vertex, so its material has
    // to be white or every tint would be multiplied down by a rag colour.
    clothMaterial: { color: outfit ? 0xffffff : rag, texture: 'fabric', roughness: 0.96, metalness: 0, uvScale: 2.2 },
    bloodMaterial: { color: 0x37100b, texture: 'smooth', roughness: 0.30, metalness: 0 },
    // Rotted flesh reads as mottled, not as an even tint. The skin texture
    // warms whatever colour it is given into something living; a corroded
    // one blotches it instead, which is the difference between a pale head
    // and a dead one.
    skin: { color: tone, texture: 'rust', roughness: 0.92, metalness: 0, subsurface: 0.05, uvScale: 3 },
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
  const z = { actor: a, eyes, wounds, bossShield, parked: true, dead: true, poolSlot: i, anim: '',
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
  const z = forceVariant === 'boss'
    ? (S.pool.find((q) => q.parked && q.actor.bodyType === 'heavy') || S.pool.find((q) => q.parked))
    : S.pool.find((q) => q.parked);
  if (!z) return null;
  const kind = forceVariant || pickVariant(S.round, Math.random);
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
  const maxHp = V.boss ? BOSS.hp : ROUNDS.hpFor(S.round) * V.hp * B.hp;
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
  if (z.plated && (source === 'bullet' || source === 'blast' || source === 'shock')) {
    game.particles.sparks(at, { count: 7, speed: 4.5, color: 0xffe6a8, colorEnd: 0x6a5a30 });
    game.audio.impact(0.28);
    z.clangT = 0.2;
    return;
  }
  z.hp -= dmg;
  game.particles.sparks(at, { count: 5, speed: 2.5, color: 0x7a1610, colorEnd: 0x2c0605 });
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
  if (z.hp <= 0) killZombie(game, S, z, headshot);
}

function killZombie(game, S, z, headshot) {
  z.dead = true;
  S.killsTotal++;
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
    dropWeapon(game, S, [p.x + 0.4, p.y + 0.25, p.z], 'shieldWorn');
  }
  if (z.actor.outfitName === 'sheriff') {
    const roll = Math.random();
    const id = roll < SHERIFF_DROP.model5 ? 'obliterator'
      : roll < SHERIFF_DROP.model5 + SHERIFF_DROP.mauser ? 'mauser' : null;
    if (id) dropWeapon(game, S, [p.x, p.y + 0.25, p.z], id);
  }
  // Powerup roll.
  if (!S.powerupActive && Math.random() < 0.04) dropPowerup(game, S, p);
  parkZombie(game, S, z);
  game.audio.impact(0.5);
}

const POWERUPS = {
  maxammo: { label: 'FULL RESUPPLY', color: 0x59ff7a },
  blitz: { label: 'BLITZ', color: 0xffd23a },
  double: { label: 'PAYDAY', color: 0x66d4ff },
};

/* A gun on the floor, spinning, with its own model. Walk over it to take
   it — it goes into a free slot, or replaces what you are holding. */
function dropWeapon(game, S, at, id) {
  const built = id === 'obliterator' ? makeObliterator(game)
    : id === 'mauser' ? makeMauser(game)
    : id === 'shieldWorn' || id === 'shield' ? makeRiotShield(game)
    : id === 'ram' ? makeBatteringRam(game)
    : makeMauser(game);
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
  if (atBench && !S.benchLastKnown) {
    S.benchLastKnown = { x: P.actor.position.x + (Math.random() - 0.5) * 5, y: P.actor.position.y,
      z: P.actor.position.z + (Math.random() - 0.5) * 5 };
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
        z.vault = { from: [pos.x, pos.y - 1.0, pos.z], to: [win.def.inside[0], win.def.inside[1] + 1.0, win.def.inside[2]], t: 0, dur: win.def.high ? 1.5 : 0.9 };
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
      move(target.x, target.z, z.speed > 2.4 ? 2 : 1);
      playZombieAnim(z, z.moveClip);
      z.attackT -= dt;
      if (!S.shieldActive && d < PLAYER.attackRange && z.attackT <= 0 && Math.abs(pos.y - P.actor.position.y) < 1.6) {
        z.attackT = PLAYER.attackCooldown;
        playZombieAnim(z, 'zattack', 0.05);
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
      z.moveClip = z.lucid ? 'zrun_human' : 'zrun';
      // The remembered sprint is a real one, and it closes ground faster.
      const boost = z.lucid ? 1.22 : 1;
      z.actor.controller.moveSpeed = z.speed * boost;
      z.actor.controller.runSpeed = z.speed * 1.35 * boost;
      if (z.anim === 'zrun' || z.anim === 'zrun_human') playZombieAnim(z, z.moveClip, 0.22);
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

function hurtPlayer(game, S, P, dmg, sfx, kind, from) {
  // Working at the bench means you are not there as far as the horde is
  // concerned. Anything already swinging when you opened it misses too.
  if (S.bench && S.bench.open) return;
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
  sfx.hurt();
  S.hud.damage(P.hp / P.maxHp);
  const lowAt = P.maxHp * 0.25;
  if (P.hp <= lowAt && P.hp + dmg > lowAt) S.voice(LINES.nearDeath);
  if (P.hp <= 0) {
    P.alive = false;
    S.gameOver = true;
    closeCrate(S);
    document.exitPointerLock && document.exitPointerLock();
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
  game.renderer.post.bloom = g.tier === 'low' ? 0 : (S.baseBloom != null ? S.baseBloom : game.renderer.post.bloom);

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
function updateMeteor(game, S, P, hud, sfx, dt) {
  const m = S.meteor;
  if (!m) return;

  if (m.state === 'waiting') {
    if (S.started && S.round >= m.round && S.alive !== false) {
      m.state = 'falling';
      m.fall = 4.0;
      if (LINES.meteorFall) S.voice(LINES.meteorFall);
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
      game.particles.sparks([H.x, 1.2, H.z], { count: 90, speed: 14, color: 0xffb060, colorEnd: 0x40180a });
      game.particles.smoke([H.x, 1.6, H.z], { count: 40, speed: 3.2, color: 0x3a3128 });
      hud.banner('IT CAME THROUGH THE ROOF', '#ff7a2a');
    }
    return;
  }

  // Down. The seams breathe, and the light with them.
  const b = 0.72 + Math.sin((S.time || 0) * 1.7) * 0.28;
  m.glow.intensity = (m.armed ? 34 : 18) * b;

  if (m.busy) {
    m.timer -= dt;
    // Sparks off the cradle while it works, and a shake on the last beat.
    if (Math.random() < 0.6) {
      game.particles.sparks(m.slot, { count: 4, speed: 6, color: 0xffb060, colorEnd: 0x40180a });
    }
    if (m.timer <= 0) {
      m.busy = false;
      m.holding = m.pending;
      m.pending = null;
      addShake(S, 0.05, 0.5);
      game.audio.impact(0.6);
      hud.banner('READY', '#ff7a2a');
    }
  }
}

/* A shot that goes into the rock wakes it up. Checked against the shot's
   own ray rather than against the physics world, because the rock is a
   dozen static spheres and any one of them is a hit. */
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
  addShake(S, 0.09, 1.0);
  hud.banner('IT IS AWAKE', '#ff7a2a');
  if (sfx && sfx.powerOn) sfx.powerOn();
  return true;
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
  for (const b of S.buys) {
    /* Against the buy's own height, not against a hard-coded 1.0. The
       Paralyzer is on the roof: measured against the ground floor it could
       never be reached from anywhere you can actually stand. */
    if (dist2d(p, { x: b.at[0], z: b.at[2] }) < R && Math.abs(p.y - b.at[1]) < 2.0) {
      const owned = P.slots.includes(b.weapon);
      const cost = owned ? ECONOMY.wallAmmo : ECONOMY.wallGun;
      return { kind: 'buy', buy: b, cost, label: `${b.label} — ${owned ? 'AMMO ' : ''}${cost}` };
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

  if (S.nadeBuy && dist2d(p, { x: S.nadeBuy.at[0], z: S.nadeBuy.at[2] }) < R && Math.abs(p.y - 1) < 2) {
    if (P.nades >= GRENADE.max) return { kind: 'nadeFull', cost: 0, label: 'Grenades — full', inert: true };
    return { kind: 'nades', cost: GRENADE.cost, label: `Grenades — ${GRENADE.cost}` };
  }
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

  const c = S.crate;
  if (dist2d(p, { x: c.at[0], z: c.at[2] }) < R + 0.4) {
    if (c.offer) return { kind: 'take', cost: 0, label: `Take ${WEAPONS[c.offerId].name}` };
    if (!c.busy) return { kind: 'crate', cost: c.cost, label: `Supply crate — ${c.cost}` };
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
    P.perks[it.st.id] = true;
    sfx.perk();
    hud.banner(it.st.def.name, '#' + it.st.def.color.toString(16).padStart(6, '0'));
    hud.perks(P.perks);
    if (it.st.id === 'supersoldier') { P.maxHp = 300; P.hp = 300; hud.damage(1); }
    hud.points(S.points);
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
  } else if (it.kind === 'bench') {
    Object.assign(S.bench, { open: true, slot: 0, index: 0, spin: 0.9,
      preview: false, picking: false, damage: false });
    sfx.buy();
  } else if (it.kind === 'benchNo') {
    hud.banner('NOTHING FITS THAT', '#c8562e');
  } else if (it.kind === 'meteor') {
    /* The gun goes into the cradle and the player stands there without one
       for three seconds, which is the whole cost of the thing — five
       thousand points and three seconds in a room that does not stop. */
    S.points -= it.cost; sfx.buy();
    const id = P.equipped();
    S.meteor.busy = true;
    S.meteor.timer = 3.0;
    S.meteor.pending = id;
    hud.points(S.points);
    hud.banner('IN THE ROCK', '#ff7a2a');
  } else if (it.kind === 'meteorTake') {
    const id = S.meteor.holding;
    S.meteor.holding = null;
    if (S.meteor.display) { for (const q of S.meteor.display) q.visible = false; }
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
    if (c.offerId === 'arc') S.voice(LINES.crateArc);
    closeCrate(S);
    hud.ammo(P);
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

function openCrate(game, S, P, hud, sfx) {
  const c = S.crate;
  c.busy = true;
  const roll = Math.random();
  /* The melee pair only turn up once the generator is running, so the
     answer to armour arrives at roughly the round armour does. */
  c.offerId = S.powered
    ? (roll < 0.20 ? 'thompson' : roll < 0.38 ? 'scatter' : roll < 0.52 ? 'arc'
      : roll < 0.64 ? 'obliterator' : roll < 0.76 ? 'blaze' : roll < 0.88 ? 'ram' : 'shield')
    : (roll < 0.30 ? 'thompson' : roll < 0.54 ? 'scatter' : roll < 0.72 ? 'mauser'
      : roll < 0.88 ? 'blaze' : 'arc');
  S.voice(LINES.crateOpen);
  // Lid swings, the prize rises out of the box glowing.
  c.lid.setRotation([0, 0, -70]);
  c.lid.setPosition([c.at[0] - 0.45, c.at[1] + 0.75, c.at[2]]);
  let disp;
  if (c.offerId === 'thompson') { const t = game.thompson({ physics: false }); disp = { root: t, parts: t.wood ? [t.wood] : [] }; }
  else if (c.offerId === 'blaze') { const t = game.pistol1911({ physics: false, engrave: 'Blaze' }); disp = { root: t, parts: t.grips ? [t.grips, t.slide, t.mag, t.mark] : [] }; }
  else if (c.offerId === 'ram') disp = makeBatteringRam(game);
  else if (c.offerId === 'shield') disp = makeRiotShield(game);
  else if (c.offerId === 'scatter') disp = makeScattergun(game);
  else if (c.offerId === 'obliterator') disp = makeObliterator(game);
  else if (c.offerId === 'mauser') disp = makeMauser(game);
  else disp = makeArcProjector(game);
  disp.root.setPosition([c.at[0], c.at[1] + 0.2, c.at[2]]);
  c.offer = disp;
  c.rise = 0;
  c.timer = 8;
  c.glow = game.light({ at: [c.at[0], c.at[1] + 1, c.at[2]], color: 0x86e2ff, intensity: 70, radius: 6 });
  let spins = 0;
  c.spinInterval = setInterval(() => { sfx.crateSpin(); if (++spins > 10) { clearInterval(c.spinInterval); c.spinInterval = null; } }, 160);
}

function closeCrate(S) {
  const c = S.crate;
  if (c.offer) { for (const p of c.offer.parts) p.destroy(); c.offer.root.destroy(); }
  if (c.glow) { c.glow._decay = 0.05; c.glow = null; }   // engine sweeps it out
  if (c.spinInterval) { clearInterval(c.spinInterval); c.spinInterval = null; }
  c.offer = null; c.offerId = null; c.busy = false;
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
  #b9hud .bench { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:min(720px,86vw); background:rgba(10,8,6,.90); border:1px solid #5a5140; padding:18px 22px;
    display:none; letter-spacing:.05em; }
  #b9hud .bench .bhead { font-size:19px; color:#e8ddc8; border-bottom:1px solid #4a4234; padding-bottom:9px; margin-bottom:11px; }
  #b9hud .bench .brow { display:flex; flex-direction:column; gap:6px; }
  #b9hud .bench .opt { display:flex; justify-content:space-between; font-size:15px; padding:6px 9px; border:1px solid transparent; }
  #b9hud .bench .opt.sel { border-color:#ffd27a; background:rgba(255,210,122,.10); }
  #b9hud .bench .opt.fitted { color:#8ce8a0; }
  #b9hud .bench .opt.banned { color:#6b6455; }
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
    width:min(266px,25vw); background:rgba(8,6,4,.88); border:1px solid #5a5140; padding:13px 15px;
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
  #b9hud .settings .opt.on:after { content:'IN USE'; color:#8ce8a0; font-size:11px; margin-left:10px; }
  #b9hud .settings .opt .why { display:block; color:#8a8272; font-size:12px; margin-top:3px; }
  #b9hud .settings .opt .fps { color:#8ce8a0; font-size:12.5px; white-space:nowrap; }
  #b9hud .settings .sfoot { margin-top:16px; padding-top:11px; border-top:1px solid #4a4234;
    color:#8a8272; font-size:12.5px; }
  #b9hud .settings .sfoot b { color:#ffd27a; font-weight:normal; }
  /* Damage diagram. A body drawn out of eleven boxes, each labelled with
     what this gun actually does to it. */
  #b9hud .bdmg { position:absolute; right:3%; top:50%; transform:translateY(-50%);
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
  #b9hud .banner { position:absolute; left:50%; top:20%; transform:translateX(-50%); font-size:34px;
    letter-spacing:.28em; opacity:0; text-shadow:0 0 22px currentColor; transition:opacity .3s; }
  #b9hud .advig { position:absolute; inset:0; opacity:0; transition:opacity .05s;
    background:radial-gradient(ellipse at center, transparent 34%, rgba(0,0,0,.82) 92%); }
  #b9hud .cross { transition:opacity .08s; }
  #b9hud .dmg { position:absolute; inset:0; opacity:0;
    background:radial-gradient(ellipse at center, transparent 42%, rgba(140,10,6,.75) 100%); transition:opacity .25s; }
  #b9hud .title { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    justify-content:center; background:rgba(4,3,2,.9); transition:opacity 1.4s; pointer-events:auto; }
  #b9hud .title h1 { font-size:64px; letter-spacing:.3em; color:#e8ddc8; margin:0 0 8px; font-weight:400; }
  #b9hud .title h1 span { color:#b3221c; }
  #b9hud .title p { color:#8c7f68; letter-spacing:.2em; font-size:14px; margin:4px 0; }
  #b9hud .stam { position:absolute; left:50%; bottom:19%; transform:translateX(-50%); width:150px; height:3px;
    background:rgba(0,0,0,.55); opacity:0; transition:opacity .25s; }
  #b9hud .stamfill { height:100%; background:#e8ddc8; width:100%; }
  #b9hud .shield { position:absolute; right:26px; bottom:118px; font-size:12px; letter-spacing:.22em; color:#8c7f68; }
  #b9hud .perks { position:absolute; left:26px; bottom:112px; font-size:11px; letter-spacing:.18em; }
  #b9hud .pdelta { position:absolute; right:30px; bottom:100px; font-size:18px; color:#ffd27a; opacity:0; }
  #b9hud .flick { animation:b9flick 1.4s ease-out; }
  @keyframes b9flick { 0%{opacity:0} 12%{opacity:1} 22%{opacity:.2} 34%{opacity:1} 44%{opacity:.35} 60%{opacity:1} 100%{opacity:1} }
  `;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'b9hud';
  root.innerHTML = `
    <div class="dmg"></div><div class="advig"></div><div class="cross"></div><div class="hitm"></div>
    <div class="roundlbl">ROUND</div><div class="round">1</div>
    <div class="points">500</div><div class="pdelta"></div>
    <div class="ammo"><span class="wname">SIDEARM</span><span class="nums">7 / 42</span></div>
    <div class="prompt"></div>
    <div class="subs"><span class="who"></span><span class="text"></span></div>
    <div class="banner"></div>
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
      <p class="padstate" style="color:#6b6455">NO CONTROLLER DETECTED — press a button on it to wake it</p>
      <p class="go" style="color:#e8ddc8;margin-top:22px">CLICK TO STAND POST</p></div>`;
  document.body.appendChild(root);
  const $ = (c) => root.querySelector(c);
  const els = {
    round: $('.round'), points: $('.points'), ammo: $('.ammo .nums'), wname: $('.ammo .wname'),
    prompt: $('.prompt'), subs: $('.subs'), subWho: $('.subs .who'), subText: $('.subs .text'), vig: $('.advig'),
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
      els.sopts.innerHTML = GRAPHICS_ORDER.map((k, i) => {
        const g = GRAPHICS[k];
        const cls = ['opt', i === st.index ? 'sel' : '', k === st.current ? 'on' : ''].join(' ');
        return `<div class="${cls}"><span>${g.name}<span class="why">${g.blurb}</span></span>`
          + `<span class="fps">${g.target}</span></div>`;
      }).join('');
      els.sfoot.innerHTML = '<b>W / S</b> or <b>↑ ↓</b> choose &nbsp;·&nbsp; <b>F</b> or <b>ENTER</b> apply'
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

      // Anchor markers, one per slot, sitting on the part of the gun they
      // belong to, with a leader line back to it.
      els.bmarks.innerHTML = state.marks.map((m) => {
        const cls = ['mark', m.slot === state.slot ? 'sel' : ''].join(' ');
        const body = m.fitted
          ? `<span class="nm">${m.fitted}</span>`
          : '<span class="plus">+</span>';
        return `<div class="${cls}" style="left:${m.lx}px; top:${m.ly}px">`
          + `<span class="slot">${ATTACH.slotName[m.slot]}</span>${body}</div>`;
      }).join('');
      const w = els.bsvg.clientWidth || 1, h = els.bsvg.clientHeight || 1;
      els.bsvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      els.bsvg.innerHTML = state.marks.map((m) => {
        const c = m.slot === state.slot ? '#ffd27a' : '#8a8272';
        return `<line x1="${m.ax}" y1="${m.ay}" x2="${m.lx}" y2="${m.ly}" stroke="${c}" stroke-width="1"/>`
          + `<circle cx="${m.ax}" cy="${m.ay}" r="2.5" fill="${c}"/>`;
      }).join('');

      // The option list, only while a slot is actually being worked on.
      if (state.picking && show) {
        els.bench.style.display = 'block';
        els.bhead.textContent = `${state.weapon}  —  ${ATTACH.slotName[state.slot]}`;
        els.brow.innerHTML = state.options.map((o, i) => {
          const cls = ['opt', i === state.index ? 'sel' : '', o.fitted ? 'fitted' : '', o.banned ? 'banned' : ''].join(' ');
          const right = o.banned ? 'will not fit this weapon'
            : o.fitted ? 'FITTED  ·  [F] strip it off'
            : `${o.cost}`;
          const pros = (o.pros || []).map((t) => `<span style="color:#8ce8a0">+ ${t}</span>`).join('&nbsp; ');
          const cons = (o.cons || []).map((t) => `<span style="color:#e07a5a">− ${t}</span>`).join('&nbsp; ');
          return `<div class="${cls}"><span>${o.name}<br><span class="why">${o.blurb}</span>`
            + (pros || cons ? `<br><span class="why">${pros} ${cons}</span>` : '')
            + `</span><span>${right}</span></div>`;
        }).join('');
        els.bfoot.innerHTML = '<span style="color:#ffd27a">W / S</span> part &nbsp;&nbsp;'
          + '<span style="color:#ffd27a">F</span> fit or strip &nbsp;&nbsp;'
          + '<span style="color:#ffd27a">TAB</span> back &nbsp;&nbsp;&nbsp;'
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
          + '<div class="pad">Controller &nbsp; <b>' + (state.picking ? 'Stick ↑↓' : 'Stick ←→')
          + '</b> move &nbsp; <b>X</b> ' + (state.picking ? 'fit' : 'open')
          + ' &nbsp; <b>R2</b> damage &nbsp; <b>◯</b> back</div>';
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
    damage(frac) { els.dmg.style.opacity = Math.min(1, (1 - frac) * 1.12); },
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
    aim(ads, sprinting) {
      els.cross.style.opacity = (1 - ads) * (sprinting ? 0.25 : 1);
      root.style.setProperty('--ads', ads.toFixed(3));
      els.vig.style.opacity = (ads * 0.55).toFixed(3);
    },
    hideTitle() { els.title.style.opacity = 0; setTimeout(() => { els.title.style.display = 'none'; }, 1500); },
    gameOver(round, kills) {
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
          // You feel him arrive before you see him.
          addShake(S, 0.10, 1.6);
          game.audio.impact(0.9);
        }
      } else if (win && spawnZombie(game, S, win)) S.toSpawn--;
    }
  }

  const aliveNow = S.zombies.some((z) => !z.dead);
  if (S.toSpawn === 0 && !aliveNow && !S.gameOver) {
    S.betweenRounds = true;
    S.lullT = ROUNDS.lull;
    sfx.roundClear();
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
    fogDensity: 0.013, fog: 0x8c8578,
    zenith: 0x6f6f6a, horizon: 0x9a9184, ground: 0x4c463b,
    sun: [0.35, 0.62, -0.70], sunColor: 0xffe0b4,
    sunIntensity: 1.6, exposure: 1.08, clouds: 0.55,
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
    input: { fireHeld: false, firePressed: false, aimHeld: false, sprintHeld: false },
    testHold: {},
    grenades: [], goldPickups: [], belt: null, drops: [], shop: null,
    settings: { open: false, index: 1, current: 'normal' }, particleScale: 1,
  };
  S.addPoints = (n) => { const a = Math.round(n * S.mul); S.points += a; return a; };

  const hud = makeHud();
  S.hud = hud;
  const sfx = makeSfx(game);
  const voice = makeVoice(game, hud, () => S.gameOver);
  S.voice = voice;

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
      want = t === 'low' ? 'low' : t === 'ultra' ? 'ultra' : t === 'high' ? 'high' : 'normal';
    }
    S.settings.index = Math.max(0, GRAPHICS_ORDER.indexOf(want));
    applyGraphics(game, S, want);
  }
  // Three zombies up front so round one is ready; the rest of the pool
  // fills in one at a time behind the title card and early rounds.
  const POOL_SIZE = 13;
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
  hud.ammo(P);
  hud.points(S.points);

  /* Input edge-tracking. */
  const startGame = () => {
    if (S.started) return;
    S.started = true;
    hud.hideTitle();
    setTimeout(() => voice(LINES.intro, true), 900);
    S.roundStartAt = S.time + 5.2;   // game time, so tests and pauses behave
  };
  hud.els.title.addEventListener('click', startGame);
  /* A controller cannot click. Without this the title screen is a wall for
     anyone playing on a pad — which is exactly what "controller support
     doesn't work" looks like from the sofa. Any button, or any key, starts. */
  window.addEventListener('keydown', startGame);
  const padWatch = setInterval(() => {
    const pd = game.input.pad;
    const el = hud.els.title.querySelector('.padstate');
    if (pd.connected && el) {
      el.textContent = 'CONTROLLER READY — ' + (pd.id || 'gamepad').slice(0, 34);
      el.style.color = '#59ff7a';
    }
    if (pd.connected && Object.values(pd.buttons).some(Boolean)) { startGame(); }
    if (S.started) clearInterval(padWatch);
  }, 120);
  window.addEventListener('gamepadconnected', () => game.input._pollGamepad());
  if (opts.test) startGame();

  game.onUpdate((dt) => {
    if (window.__FREEZE) return;   // test/profiling hatch: engine only
    S.time += dt;
    S.frame = (S.frame || 0) + 1;
    const i = game.input;
    const pad = i.pad;
    /* Controller: right stick aims, triggers fire and aim, and the face
       buttons carry everything the keyboard does. Look is applied here
       rather than folded into keys because aiming needs the analog value —
       a stick mapped to arrow keys can only ever look at one speed. */
    if (pad.connected && P.alive && !S.gameOver) {
      const look = 2.6 * dt;
      // Squared response: fine control near centre, fast whip at the rim.
      const sx = pad.rx * Math.abs(pad.rx), sy = pad.ry * Math.abs(pad.ry);
      const sens = 1 - P.ads * 0.45;            // aiming slows the turn rate
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
    const rtHeld = S.padTriggerArmed && pad.rt > 0.45;
    // Space is the jump now, so it is not also the trigger.
    S.input.fireHeld = i.pointer.down || rtHeld || !!th.fire;
    S.input.firePressed = i.pointer.justDown || (S.padTriggerArmed && pad.pressed.rt) || (!!th.fire && !th._firePrev);
    S.input.jumpPressed = i.justPressed(' ') || !!pad.pressed.a;
    S.input.aimHeld = i.down('control') || i.pointer.rightDown || pad.lt > 0.4 || !!th.aim;
    S.input.sprintHeld = i.down('shift') || !!pad.buttons.ls || !!th.sprint;
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
      hud.aim(P.ads, P.sprinting);

      if (i.justPressed('r') || pad.pressed.x) tryReload(P, sfx);
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
        const n = GRAPHICS_ORDER.length;
        const up = i.justPressed('w') || i.justPressed('arrowup') || pad.pressed.up;
        const dn = i.justPressed('s') || i.justPressed('arrowdown') || pad.pressed.down;
        if (up) S.settings.index = (S.settings.index + n - 1) % n;
        if (dn) S.settings.index = (S.settings.index + 1) % n;
        if (i.justPressed('f') || i.justPressed('enter') || pad.pressed.x) {
          applyGraphics(game, S, GRAPHICS_ORDER[S.settings.index]);
          hud.banner(GRAPHICS[S.settings.current].name, '#8ce8a0');
          sfx.buy();
        }
        if (pad.pressed.b) S.settings.open = false;
        hud.settings({ index: S.settings.index, current: S.settings.current });
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

        /* Turning it. The weapon on the bench is the real viewmodel, pushed
           out to arm's length and spun on the spot, so what you are looking
           at is exactly what you will be holding — including every
           attachment, because they are the same actors. */
        const turn = (i.down('q') || i.down('a') ? -1 : 0) + (i.down('e') || i.down('d') ? 1 : 0);
        if (bench.preview || bench.picking) bench.spin += turn * dt * 2.2;
        else if (!bench.picking) bench.spin += turn * dt * (bench.preview ? 2.2 : 0);
        if (i.justPressed('p')) bench.preview = !bench.preview;
        bench.damage = i.down('shift') || pad.lt > 0.4 || !!S.testHold.damage;

        const options = Object.entries(ATTACH.parts)
          .filter(([, q]) => q.slot === slot)
          .map(([id2, q]) => {
            const eff = attachEffects(held, id2);
            return {
              id: id2, name: q.name, blurb: q.blurb, cost: q.cost,
              fitted: fit[slot] === id2,
              banned: !!(q.bans && q.bans.includes(held)),
              pros: eff.pros, cons: eff.cons,
            };
          });
        bench.index = Math.max(0, Math.min(bench.index, options.length - 1));

        if (!bench.picking && !bench.preview) {
          // Choosing which slot to work on.
          if (i.justPressed('a') || i.justPressed('arrowleft')) { bench.slot = (bench.slot + ATTACH.slots.length - 1) % ATTACH.slots.length; bench.index = 0; }
          if (i.justPressed('d') || i.justPressed('arrowright')) { bench.slot = (bench.slot + 1) % ATTACH.slots.length; bench.index = 0; }
          if (i.justPressed('f')) { bench.picking = true; sfx.buy(); }
        } else if (bench.picking) {
          if (i.justPressed('w') || i.justPressed('arrowup')) bench.index = (bench.index + options.length - 1) % options.length;
          if (i.justPressed('s') || i.justPressed('arrowdown')) bench.index = (bench.index + 1) % options.length;
          if (i.justPressed('f')) {
            const o = options[bench.index];
            if (o && !o.banned) {
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
        if (P.upgraded && P.upgraded[held] && i.justPressed('c')) {
          P.camoOff = P.camoOff || {};
          P.camoOff[held] = !P.camoOff[held];
          applyUpgradeLook(game, P, held);
          hud.banner(P.camoOff[held] ? 'ORIGINAL FINISH' : 'LAVA', '#ff7a2a');
        }

        if (i.justPressed('tab') || i.justPressed('escape')) {
          if (bench.picking) bench.picking = false;
          else if (bench.preview) bench.preview = false;
          else bench.open = false;
        }
        if (dist2d(P.actor.position, { x: bench.at[0], z: bench.at[2] }) > PLAYER.interactRange + 1.6) bench.open = false;

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
        hud.bench({
          weapon: spec2.name, slot, options, index: bench.index, points: S.points,
          marks, preview: bench.preview, picking: bench.picking,
          camo: !!(P.upgraded && P.upgraded[held]),
          damage: bench.damage ? damageTable(spec2) : null,
          damageNote: spec2.pellets > 1
            ? `${spec2.pellets} pellets — figures are a full pattern on the spot`
            : `per round${spec2.pierce ? `, and it carries through ${spec2.pierce} more` : ''}`,
        });
      } else if (bench) {
        hud.bench(null);
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
        P.reloading = 0; P.reloadStage = 0;
        /* The cooldown belongs to the weapon that set it, not to the player.
           The hammer's refire is nine seconds — swing it once while boarding
           a window and the gun you swap back to is dead for the next nine,
           which is the ritual that had to be performed to get it shooting
           again. */
        P.cooldown = Math.min(P.cooldown, P.spec().refire);
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
        if (P.reloadStage === 0 && prog > 0.16) {
          P.reloadStage = 1;
          if (v.kind === 'single' && v.actor.mag) v.actor.mag.visible = false;
          dropMagazine(game, S, P, v);
          sfx.magOut();
        } else if (P.reloadStage === 1 && prog > 0.62) {
          P.reloadStage = 2;
          if (v.kind === 'single' && v.actor.mag) v.actor.mag.visible = true;
          sfx.magIn();
        } else if (P.reloadStage === 2 && prog > 0.88) {
          P.reloadStage = 3;
          P.slideCycle = 0.16; P.slideCycleMax = 0.16;   // runs forward on the fresh mag
          sfx.slideRelease();
        }
        P.reloading -= dt;
        if (P.reloading <= 0) { P.reloading = 0; P.reloadStage = 0; finishReload(P, hud); }
      }

      if (!P.sprinting && !(S.bench && S.bench.open)) tryFire(game, S, P, hud, sfx, dt);
      updateRecoil(game, P, dt, S);
      // The viewmodel is NOT placed here. Update hooks run before the
      // camera moves, so a gun positioned from cam.position in this pass is
      // hung off last frame's camera — it lags the view by a frame and
      // whips around whenever the player walks. It goes in a late hook,
      // after _updateCamera, where the camera is final for the frame.
      P._moving = Math.abs(mx) + Math.abs(mz) > 0.1;

      /* Jump. Off the same controller as everything else, so it gets the
         coyote time and the buffered press the engine already implements. */
      if (S.input.jumpPressed && !(S.bench && S.bench.open) && P.sliding <= 0) {
        P.actor.controller.jump();
      }

      /* Interact. */
      const it = (S.bench && S.bench.open) ? null : nearestInteract(S, P);
      if (it) {
        hud.prompt(it.label + (it.hold ? ' (hold)' : ''));
        if (it.hold ? (i.down('f') || i.down('x') || pad.buttons.b)
                    : (i.justPressed('f') || i.justPressed('x') || pad.pressed.b)) {
          doInteract(game, S, P, hud, sfx, it, dt);
        }
      } else hud.prompt(null);

      /* Regen. */
      if (P.hp < P.maxHp && S.time - P.lastHit > PLAYER.regenDelay) {
        P.hp = Math.min(P.maxHp, P.hp + PLAYER.regenRate * dt);
        hud.damage(P.hp / P.maxHp);
      }
      if (P.hp < P.maxHp * 0.3 && Math.floor(S.time * 1.1) !== Math.floor((S.time - dt) * 1.1)) sfx.heartbeat();
    }

    if (!S.shieldActive) {
      S.lastKnown = { x: P.actor.position.x, y: P.actor.position.y, z: P.actor.position.z };
    }

    /* World systems. */
    updateRounds(game, S, P, hud, sfx, dt);
    for (const z of S.zombies) updateZombie(game, S, P, z, dt, sfx);

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
          }
        }
      }
    }

    updateMeteor(game, S, P, hud, sfx, dt);

    /* The eighteen carat conveyor. Nothing announces the conditions; the
       belt arriving is the announcement. */
    if (S.belt) {
      const bl = S.belt;
      const earned = S.powered && P.perks.supersoldier && P.perks.shieldup;
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
      const gone = d.t <= 0;
      const taken = !gone && dist2d(at, P.actor.position) < 1.15 && Math.abs(at.y - P.actor.position.y) < 1.8;
      if (taken) {
        P.give(d.id);
        sfx.buy();
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

    /* Crate lifecycle. */
    const c = S.crate;
    if (c.offer) {
      c.rise = Math.min(1, c.rise + dt / 2.2);
      c.offer.root.setPosition([c.at[0], c.at[1] + 0.2 + c.rise * 0.85, c.at[2]]);
      c.offer.root.setRotation([0, S.time * 40 % 360, 0]);
      c.timer -= dt;
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
    nearestInteract, doInteract, applyAttachmentLooks, applyUpgradeLook, UPGRADE_NAMES };
  window.__T_MAKE = { makeParalyzer, makeMP5, makeSawedOff, makeScattergun, makeObliterator,
    makeMauser, makeArcProjector, makeKnife, makeHammer, makeRiotShield, makeBatteringRam };
  const __THooks = window.__T = {
    game, S, P, WEAPONS, ECONOMY, LINES,
    spawn(winId) {
      const win = S.windows.find((w) => w.def.id === (winId || S.activeWindows[0]));
      return win ? spawnZombie(game, S, win) : null;
    },
    setPoints(n) { S.points = n; hud.points(n); },
    give(id) { S.player.give(id); hud.ammo(S.player); },
    // Drive a reload from a test without going through the key handler.
    reload() { tryReload(S.player, sfx); },
    /* Override the hip carry so a screenshot can frame the weapon instead
       of catching the corner of it. Null clears the override. */
    viewPose(x, y, d) { P.poseOverride = (x == null) ? null : { x, y, d }; },
    killAll() { for (const z of S.zombies) if (!z.dead) killZombie(game, S, z, false); },
    forceRound(n) { S.round = n - 1; S.toSpawn = 0; for (const z of S.zombies) if (!z.dead) killZombie(game, S, z, false); startRound(game, S, hud, sfx); },
    god(on) { S.godMode = on !== false; },
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
  // Exposed so the models can be inspected on their own, outside the map.
  models: { makeRiotShield, makeBatteringRam, makeHammer, makeKnife, makeScattergun, makeArcProjector },
};
})();
