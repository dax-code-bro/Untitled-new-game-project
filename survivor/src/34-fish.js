/* ============================================================
   FISH — two hundred of them, and they are not standing still.

   Fish are not loot in a water volume. Each one belongs to a
   species with a real temperature preference, a real depth band
   and real feeding times, and it moves between them as the water
   warms and cools through the day. Which is why the bass are in
   the shallows at dawn and sulking in twelve feet of water at two
   in the afternoon, and why the trout are not in the lake at all
   once summer arrives.
   ============================================================ */

const WATER = { fresh: 'fresh', brackish: 'brackish', salt: 'salt' };

const FISH_SPECIES = {
  largemouthBass: {
    id: 'largemouthBass', name: 'Largemouth bass', water: WATER.fresh,
    massKg: [0.4, 4.5], lengthM: [0.25, 0.6],
    tempC: [18, 27], tempToleranceC: [10, 32],
    depthM: [0.5, 6], structure: ['weeds', 'timber', 'docks'],
    feedsAt: ['dawn', 'dusk'], baits: ['minnow', 'crawfish', 'frog', 'spinner', 'plastic worm'],
    fightStrength: 0.75, wariness: 0.6,
    nutrition: { kcal: 97, proteinG: 19, fatG: 2.0 },
    note: 'Ambushes from cover. Fish the weed edge, not the open water.',
  },
  smallmouthBass: {
    id: 'smallmouthBass', name: 'Smallmouth bass', water: WATER.fresh,
    massKg: [0.3, 2.5], lengthM: [0.2, 0.5],
    tempC: [16, 22], tempToleranceC: [5, 28],
    depthM: [1, 8], structure: ['rocks', 'current', 'gravel'],
    feedsAt: ['dawn', 'dusk', 'day'], baits: ['crawfish', 'minnow', 'spinner', 'jig'],
    fightStrength: 0.9, wariness: 0.65,
    nutrition: { kcal: 97, proteinG: 19, fatG: 2.0 },
    note: 'Pound for pound the hardest fight in fresh water.',
  },
  bluegill: {
    id: 'bluegill', name: 'Bluegill', water: WATER.fresh,
    massKg: [0.05, 0.5], lengthM: [0.1, 0.28],
    tempC: [20, 28], tempToleranceC: [8, 33],
    depthM: [0.3, 3], structure: ['weeds', 'shallows', 'docks'],
    feedsAt: ['dawn', 'day', 'dusk'], baits: ['worm', 'cricket', 'grub', 'bread'],
    fightStrength: 0.3, wariness: 0.2,
    nutrition: { kcal: 97, proteinG: 20, fatG: 0.9 },
    note: 'Will bite anything, all day. When nothing else is working, these are dinner.',
  },
  pumpkinseed: {
    id: 'pumpkinseed', name: 'Pumpkinseed', water: WATER.fresh,
    massKg: [0.04, 0.35], lengthM: [0.08, 0.22],
    tempC: [20, 27], tempToleranceC: [7, 32],
    depthM: [0.3, 2.5], structure: ['weeds', 'shallows'],
    feedsAt: ['day'], baits: ['worm', 'grub', 'cricket'],
    fightStrength: 0.25, wariness: 0.18,
    nutrition: { kcal: 97, proteinG: 20, fatG: 0.9 },
    note: 'Small, gaudy and completely without caution.',
  },
  blackCrappie: {
    id: 'blackCrappie', name: 'Black crappie', water: WATER.fresh,
    massKg: [0.15, 1.1], lengthM: [0.15, 0.4],
    tempC: [17, 24], tempToleranceC: [6, 30],
    depthM: [1.5, 7], structure: ['timber', 'brushpiles'],
    feedsAt: ['dawn', 'dusk', 'night'], baits: ['minnow', 'jig'],
    fightStrength: 0.35, wariness: 0.4, schooling: true,
    nutrition: { kcal: 97, proteinG: 19, fatG: 0.8 },
    note: 'Schools tight around sunken brush. Find one and you have found forty.',
  },
  yellowPerch: {
    id: 'yellowPerch', name: 'Yellow perch', water: WATER.fresh,
    massKg: [0.06, 0.6], lengthM: [0.12, 0.3],
    tempC: [15, 22], tempToleranceC: [2, 27],
    depthM: [2, 10], structure: ['weeds', 'flats'],
    feedsAt: ['day'], baits: ['worm', 'minnow', 'jig'],
    fightStrength: 0.28, wariness: 0.3, schooling: true,
    nutrition: { kcal: 91, proteinG: 19, fatG: 0.9 },
    note: 'Best eating fish in the lake and no one argues about it.',
  },
  channelCatfish: {
    id: 'channelCatfish', name: 'Channel catfish', water: WATER.fresh,
    massKg: [0.5, 9], lengthM: [0.3, 0.9],
    tempC: [21, 29], tempToleranceC: [4, 34],
    depthM: [2, 12], structure: ['bottom', 'holes', 'current'],
    feedsAt: ['night', 'dusk'], baits: ['cutbait', 'liver', 'stinkbait', 'worm'],
    fightStrength: 0.8, wariness: 0.25,
    nutrition: { kcal: 105, proteinG: 18, fatG: 2.9 },
    // Hunts by smell and taste, so it does not care how dark or muddy it is.
    note: 'Tastes the water. Night, mud and a rotten bait and it will find you.',
  },
  brownBullhead: {
    id: 'brownBullhead', name: 'Brown bullhead', water: WATER.fresh,
    massKg: [0.15, 1.2], lengthM: [0.15, 0.4],
    tempC: [20, 28], tempToleranceC: [3, 34],
    depthM: [0.5, 5], structure: ['bottom', 'mud'],
    feedsAt: ['night'], baits: ['worm', 'liver', 'stinkbait'],
    fightStrength: 0.3, wariness: 0.1, spines: true,
    nutrition: { kcal: 105, proteinG: 18, fatG: 2.7 },
    note: 'Spines will put a hole in your hand. Handle it the right way round.',
  },
  northernPike: {
    id: 'northernPike', name: 'Northern pike', water: WATER.fresh,
    massKg: [1, 12], lengthM: [0.45, 1.2],
    tempC: [10, 20], tempToleranceC: [0, 26],
    depthM: [1, 6], structure: ['weeds', 'bays'],
    feedsAt: ['dawn', 'day', 'dusk'], baits: ['minnow', 'spoon', 'spinner', 'deadbait'],
    fightStrength: 0.95, wariness: 0.45, teeth: true,
    nutrition: { kcal: 88, proteinG: 19, fatG: 0.7 },
    note: 'Will bite through mono. Use a wire trace or lose the lure and the fish.',
  },
  walleye: {
    id: 'walleye', name: 'Walleye', water: WATER.fresh,
    massKg: [0.5, 5], lengthM: [0.3, 0.75],
    tempC: [12, 21], tempToleranceC: [0, 27],
    depthM: [3, 14], structure: ['gravel', 'points', 'flats'],
    feedsAt: ['dusk', 'night', 'dawn'], baits: ['minnow', 'leech', 'nightcrawler', 'jig'],
    fightStrength: 0.55, wariness: 0.7, lightSensitive: true,
    nutrition: { kcal: 93, proteinG: 19, fatG: 1.2 },
    // The reflective eye that gives it its name is why it owns low light.
    note: 'Sees in the dark better than its food does. Fish the last half hour.',
  },
  rainbowTrout: {
    id: 'rainbowTrout', name: 'Rainbow trout', water: WATER.fresh,
    massKg: [0.2, 3], lengthM: [0.2, 0.6],
    tempC: [10, 16], tempToleranceC: [0, 24],
    depthM: [0.5, 6], structure: ['current', 'riffles', 'springs'],
    feedsAt: ['dawn', 'dusk'], baits: ['fly', 'worm', 'salmon egg', 'spinner'],
    fightStrength: 0.7, wariness: 0.85,
    nutrition: { kcal: 141, proteinG: 20, fatG: 6.2 },
    note: 'Oily, which on an island of lean meat makes it worth more than its size.',
  },
  brookTrout: {
    id: 'brookTrout', name: 'Brook trout', water: WATER.fresh,
    massKg: [0.1, 1.2], lengthM: [0.15, 0.4],
    tempC: [8, 15], tempToleranceC: [0, 20],
    depthM: [0.3, 3], structure: ['springs', 'riffles', 'undercuts'],
    feedsAt: ['dawn', 'dusk'], baits: ['fly', 'worm', 'grub'],
    fightStrength: 0.55, wariness: 0.9,
    nutrition: { kcal: 148, proteinG: 20, fatG: 6.6 },
    // Needs cold clean water and disappears from anything else, which makes
    // it an indicator of where the springs are.
    note: 'Where these live, the water is safe. Where they have gone, it is not.',
  },
  commonCarp: {
    id: 'commonCarp', name: 'Common carp', water: WATER.fresh,
    massKg: [1, 14], lengthM: [0.35, 0.9],
    tempC: [18, 28], tempToleranceC: [3, 35],
    depthM: [0.5, 5], structure: ['mud', 'shallows'],
    feedsAt: ['day', 'dawn'], baits: ['corn', 'bread', 'dough', 'worm'],
    fightStrength: 0.85, wariness: 0.8,
    nutrition: { kcal: 127, proteinG: 18, fatG: 5.6 },
    note: 'Nobody wants to eat it until the third week.',
  },
  longnoseGar: {
    id: 'longnoseGar', name: 'Longnose gar', water: WATER.fresh,
    massKg: [1.5, 15], lengthM: [0.6, 1.6],
    tempC: [22, 30], tempToleranceC: [10, 35],
    depthM: [0.5, 4], structure: ['surface', 'backwaters'],
    feedsAt: ['day', 'dusk'], baits: ['minnow', 'cutbait'],
    fightStrength: 0.8, wariness: 0.35, teeth: true, roeToxic: true,
    nutrition: { kcal: 110, proteinG: 20, fatG: 2.5 },
    // The flesh is fine. The eggs will make you very ill indeed.
    note: 'Armoured like a log. The roe is poisonous — throw it away, all of it.',
  },
  americanEel: {
    id: 'americanEel', name: 'American eel', water: WATER.brackish,
    massKg: [0.3, 3], lengthM: [0.4, 1.1],
    tempC: [14, 25], tempToleranceC: [2, 30],
    depthM: [0.5, 8], structure: ['bottom', 'rocks', 'estuary'],
    feedsAt: ['night'], baits: ['worm', 'cutbait', 'crab'],
    fightStrength: 0.6, wariness: 0.4, slippery: true,
    nutrition: { kcal: 184, proteinG: 18, fatG: 11.7 },
    note: 'Fattest thing you will pull out of the water here. Impossible to hold.',
  },
  stripedBass: {
    id: 'stripedBass', name: 'Striped bass', water: WATER.brackish,
    massKg: [1.5, 20], lengthM: [0.4, 1.2],
    tempC: [13, 22], tempToleranceC: [4, 28],
    depthM: [1, 15], structure: ['current', 'rips', 'estuary'],
    feedsAt: ['dawn', 'dusk', 'night'], baits: ['bunker', 'eel', 'plug', 'cutbait'],
    fightStrength: 0.95, wariness: 0.6, schooling: true,
    nutrition: { kcal: 97, proteinG: 18, fatG: 2.3 },
    note: 'Follows the tide into the river mouth and back out again.',
  },
  redDrum: {
    id: 'redDrum', name: 'Red drum', water: WATER.salt,
    massKg: [1, 15], lengthM: [0.35, 1.0],
    tempC: [18, 28], tempToleranceC: [8, 33],
    depthM: [0.3, 6], structure: ['flats', 'surf', 'oyster'],
    feedsAt: ['dawn', 'day', 'dusk'], baits: ['crab', 'shrimp', 'cutbait', 'spoon'],
    fightStrength: 0.85, wariness: 0.5,
    nutrition: { kcal: 90, proteinG: 19, fatG: 1.0 },
    note: 'Tails in inches of water on the flats. You can see them before you cast.',
  },
  summerFlounder: {
    id: 'summerFlounder', name: 'Summer flounder', water: WATER.salt,
    massKg: [0.4, 4], lengthM: [0.3, 0.8],
    tempC: [15, 24], tempToleranceC: [5, 28],
    depthM: [2, 20], structure: ['sand', 'bottom', 'channels'],
    feedsAt: ['day'], baits: ['squid', 'minnow', 'jig'],
    fightStrength: 0.4, wariness: 0.3, ambush: true,
    nutrition: { kcal: 86, proteinG: 18, fatG: 1.2 },
    note: 'Lies buried in the sand with both eyes up. Drag the bait along the bottom.',
  },
  atlanticMackerel: {
    id: 'atlanticMackerel', name: 'Atlantic mackerel', water: WATER.salt,
    massKg: [0.3, 1.6], lengthM: [0.25, 0.5],
    tempC: [8, 18], tempToleranceC: [2, 22],
    depthM: [2, 25], structure: ['open', 'schools'],
    feedsAt: ['dawn', 'day', 'dusk'], baits: ['sabiki', 'spoon', 'jig'],
    fightStrength: 0.5, wariness: 0.2, schooling: true, schoolSize: [20, 200],
    nutrition: { kcal: 205, proteinG: 19, fatG: 13.9 },
    // The single richest source of fat available without killing something
    // large, and it comes in shoals.
    note: 'Oily and comes in hundreds. This is how you survive a lean month.',
  },
  bluefish: {
    id: 'bluefish', name: 'Bluefish', water: WATER.salt,
    massKg: [0.8, 8], lengthM: [0.3, 0.9],
    tempC: [16, 26], tempToleranceC: [10, 30],
    depthM: [0.5, 12], structure: ['surf', 'open', 'blitz'],
    feedsAt: ['dawn', 'dusk'], baits: ['plug', 'cutbait', 'spoon'],
    fightStrength: 0.9, wariness: 0.15, teeth: true, schooling: true,
    nutrition: { kcal: 124, proteinG: 20, fatG: 4.2 },
    note: 'Bites everything including your fingers. Use pliers.',
  },
  blacktipShark: {
    id: 'blacktipShark', name: 'Blacktip shark', water: WATER.salt,
    massKg: [8, 55], lengthM: [1.0, 1.9],
    tempC: [20, 30], tempToleranceC: [15, 32],
    depthM: [1, 25], structure: ['surf', 'open'],
    feedsAt: ['dawn', 'dusk', 'night'], baits: ['cutbait', 'bunker', 'whole fish'],
    fightStrength: 1.0, wariness: 0.3, teeth: true, dangerous: true,
    nutrition: { kcal: 130, proteinG: 21, fatG: 4.5, ureaBleed: true },
    // Shark flesh holds urea and turns to ammonia unless it is bled at once
    // and soaked. Get that wrong and it is inedible.
    note: 'Bleed it the moment it is out of the water or you will not be able to eat it.',
  },
};

const FISH_SPECIES_LIST = Object.keys(FISH_SPECIES);


class Fish {
  constructor(speciesId, opts = {}) {
    const s = FISH_SPECIES[speciesId];
    this.speciesId = speciesId;
    this.species = s;
    const rng = opts.rng || Math.random;
    // Big fish are rare. A cubed roll gives a natural population where most
    // are small and the occasional one is worth talking about.
    const t = Math.pow(rng(), 2.4);
    this.massKg = lerpN(s.massKg[0], s.massKg[1], t);
    this.lengthM = lerpN(s.lengthM[0], s.lengthM[1], t);
    this.x = opts.x || 0; this.z = opts.z || 0;
    this.depthM = lerpN(s.depthM[0], s.depthM[1], rng());
    this.bodyId = opts.bodyId != null ? opts.bodyId : 0;
    this.hunger = 0.3 + rng() * 0.5;
    this.spooked = 0;
    this.alive = true;
    this.hooked = false;
    this.stamina = 1;
    this.id = opts.id || 0;
  }

  /* How well the fish is doing where it currently is. Outside its tolerance
     it is stressed and will not feed; outside it by a long way it dies,
     which is what empties a shallow pond of trout in August. */
  comfort(waterTempC) {
    const s = this.species;
    if (waterTempC >= s.tempC[0] && waterTempC <= s.tempC[1]) return 1;
    if (waterTempC < s.tempToleranceC[0] || waterTempC > s.tempToleranceC[1]) return 0;
    return waterTempC < s.tempC[0]
      ? ramp(waterTempC, s.tempToleranceC[0], s.tempC[0])
      : 1 - ramp(waterTempC, s.tempC[1], s.tempToleranceC[1]);
  }

  /* Whether this fish will take this offering, right now. Every term is
     something the player can change: what they tied on, how deep they fished
     it, what time they came, and whether they crashed through the shallows
     getting there. */
  biteChance(opts = {}) {
    const s = this.species;
    if (!this.alive || this.hooked) return 0;
    const comfort = this.comfort(opts.waterTempC != null ? opts.waterTempC : 20);
    if (comfort <= 0.05) return 0;

    const baitMatch = s.baits.includes(opts.bait) ? 1
      : opts.bait === 'worm' ? 0.35 : 0.12;      // a worm interests most things a little
    const period = opts.period || 'day';
    const timeMatch = s.feedsAt.includes(period) ? 1 : 0.22;

    const depthErr = Math.abs((opts.depthM != null ? opts.depthM : 1) - this.depthM);
    const depthMatch = clamp01(1 - depthErr / 3.5);

    const stealth = 1 - clamp01(this.spooked) * s.wariness;
    // Barometric pressure genuinely moves fish: a falling glass ahead of a
    // front turns them on, and the day after it passes turns them off.
    const pressure = opts.pressureTrend != null
      ? clamp01(0.65 + opts.pressureTrend * -0.5) : 1;

    return clamp01(this.hunger * comfort * baitMatch * timeMatch * depthMatch
      * stealth * pressure * (0.55 + 0.45 * (opts.skill != null ? opts.skill : 0.5)));
  }

  /* Landing it is a separate problem from hooking it. Line strength against
     a fish that pulls harder than it weighs is how you lose the big one. */
  fight(dt, opts = {}) {
    if (!this.hooked) return { landed: false, lost: false };
    const s = this.species;
    const lineKg = opts.lineStrengthKg != null ? opts.lineStrengthKg : 4;
    const drag = clamp01(opts.drag != null ? opts.drag : 0.5);
    const rodAction = opts.rodAction != null ? opts.rodAction : 0.5;

    // Peak pull is a multiple of body mass for a strong fish.
    const pullKg = this.massKg * (0.8 + 2.2 * s.fightStrength) * this.stamina
      * (0.7 + 0.6 * (opts.surge != null ? opts.surge : Math.random()));
    // The rod absorbs surges; that is what a rod is for.
    const lineLoadKg = pullKg * (1 - 0.35 * rodAction) * (0.4 + drag);

    this.stamina = Math.max(0, this.stamina - dt * (0.10 + 0.35 * drag) / (0.5 + this.massKg * 0.35));

    if (lineLoadKg > lineKg) return { landed: false, lost: true, reason: 'line broke', lineLoadKg };
    if (drag < 0.12 && Math.random() < dt * 0.15) return { landed: false, lost: true, reason: 'threw the hook' };
    if (s.teeth && !opts.wireTrace && Math.random() < dt * 0.22) {
      return { landed: false, lost: true, reason: 'bit through the line' };
    }
    if (this.stamina <= 0.05) return { landed: true, lost: false, lineLoadKg };
    return { landed: false, lost: false, lineLoadKg, tension: lineLoadKg / lineKg };
  }

  fillet(opts = {}) {
    const s = this.species;
    const skill = clamp01(opts.skill != null ? opts.skill : 0.5);
    // Fillet yield off a whole fish is 30-45% depending on species and knife.
    const yieldFrac = 0.30 + 0.14 * skill;
    const kg = this.massKg * yieldFrac;
    return {
      kg,
      kcal: kg * 10 * s.nutrition.kcal,
      proteinKg: (kg * s.nutrition.proteinG) / 100,
      fatKg: (kg * s.nutrition.fatG) / 100,
      // Shark has to be bled immediately or the urea in the flesh turns and
      // it is not food any more.
      ruined: !!(s.nutrition.ureaBleed && !opts.bledImmediately),
      // Gar roe is genuinely toxic to mammals. It is not a trap invented for
      // the game.
      toxicRoe: !!s.roeToxic,
      offalKg: this.massKg * 0.2,   // bait for the next one, or for a trap
    };
  }
}


/* A body of water: a lake, a pond, a river reach, or the sea around the
   island. It carries its own temperature, which is what actually decides
   what lives in it. */
class WaterBody {
  constructor(opts) {
    this.id = opts.id;
    this.name = opts.name || 'water';
    this.kind = opts.kind || WATER.fresh;
    this.x = opts.x; this.z = opts.z;
    this.radiusM = opts.radiusM || 60;
    this.maxDepthM = opts.maxDepthM || 6;
    this.flowing = !!opts.flowing;
    this.spring = !!opts.spring;
    this.surfaceTempC = opts.tempC != null ? opts.tempC : 18;
    this.structure = opts.structure || ['weeds'];
    this.potable = opts.kind !== WATER.salt;
    this.contamination = opts.contamination != null ? opts.contamination : 0.35;

    /* Holds. Fish are not spread evenly over a lake and never have been —
       they sit on structure: a weed edge, a sunken tree, a gravel point, a
       rip in the current. Placing them uniformly makes fishing a matter of
       standing anywhere long enough, which is the opposite of fishing. With
       holds, the skill is finding the spot, and a player who learns where
       the bass live on this lake has learned something real about it. */
    this.holds = [];
    const rng = opts.rng || Math.random;
    const n = Math.max(3, Math.round(this.radiusM / 45));
    for (let i = 0; i < n; i++) {
      // Most structure is near the edge — weed lines, drop-offs, points.
      const ang = rng() * Math.PI * 2;
      const r = this.radiusM * (0.35 + 0.6 * Math.sqrt(rng()));
      const kind = this.structure[(rng() * this.structure.length) | 0];
      this.holds.push({
        x: this.x + Math.cos(ang) * r,
        z: this.z + Math.sin(ang) * r,
        kind,
        radiusM: 14 + rng() * 22,
        depthM: this.maxDepthM * (0.15 + rng() * 0.7),
        quality: 0.4 + rng() * 0.6,
      });
    }
  }

  /* The hold nearest a point, if the point is close enough to be fishing it. */
  holdNear(x, z, toleranceM = 0) {
    let best = null, bestD = Infinity;
    for (const h of this.holds) {
      const d = Math.hypot(h.x - x, h.z - z);
      if (d < h.radiusM + toleranceM && d < bestD) { bestD = d; best = h; }
    }
    return best;
  }

  contains(x, z) {
    const dx = x - this.x, dz = z - this.z;
    return dx * dx + dz * dz <= this.radiusM * this.radiusM;
  }

  /* Water temperature at depth. A lake stratifies in summer: the surface
     bakes and the deep water stays cold, which is exactly why the trout go
     down and the bass come up. Flowing water and springs barely stratify. */
  tempAtDepth(depthM) {
    if (this.flowing || this.spring) return this.surfaceTempC;
    const thermocline = this.maxDepthM * 0.35;
    if (depthM <= thermocline) return this.surfaceTempC;
    const deep = Math.min(this.surfaceTempC, 8);
    return lerpN(this.surfaceTempC, deep, clamp01((depthM - thermocline) / (this.maxDepthM - thermocline)));
  }

  /* Surface temperature follows the air with a lag that grows with volume.
     A pond tracks the day; a lake tracks the season. */
  step(days, airTempC) {
    const inertia = this.flowing ? 0.6 : clampTo(this.maxDepthM / 4, 0.5, 12);
    this.surfaceTempC += (airTempC - this.surfaceTempC) * clamp01(days / inertia);
    if (this.spring) this.surfaceTempC = lerpN(this.surfaceTempC, 10, 0.6);
  }
}


class Fishery {
  constructor(opts = {}) {
    this.rng = opts.rng || Math.random;
    this.maxFish = opts.maxFish != null ? opts.maxFish : 200;
    this.bodies = [];
    this.fish = [];
    this.nextId = 1;
  }

  addBody(opts) {
    const b = new WaterBody(Object.assign({ id: this.bodies.length, rng: this.rng }, opts));
    this.bodies.push(b);
    return b;
  }

  /* Stock each water body with the species that can actually live in it —
     no trout in the warm shallow pond, no red drum in the creek. */
  populate() {
    if (!this.bodies.length) return 0;
    /* Weight by area, but compressed, and with a floor. Straight area gives
       the sea nearly everything and leaves a spring creek holding one fish,
       which is true of biomass and useless as a place to go fishing. */
    const weights = this.bodies.map((b) => Math.pow(b.radiusM, 1.35));
    const total = weights.reduce((a, c) => a + c, 0);
    const floor = Math.min(8, Math.floor(this.maxFish / (this.bodies.length * 3)));

    for (let bi = 0; bi < this.bodies.length; bi++) {
      const body = this.bodies[bi];
      const n = Math.max(floor, Math.round((weights[bi] / total) * (this.maxFish - floor * this.bodies.length)));
      // The species has to tolerate this water at all.
      const suitable = this._suitableFor(body);
      if (!suitable.length) continue;
      for (let i = 0; i < n && this.fish.length < this.maxFish; i++) {
        const sid = suitable[(this.rng() * suitable.length) | 0];
        const sp = FISH_SPECIES[sid];
        // Put the fish on a hold whose structure it actually uses. A
        // largemouth wants the weed edge; a smallmouth wants the rocks.
        const matching = body.holds.filter((h) => sp.structure.includes(h.kind));
        const pool = matching.length ? matching : body.holds;
        const hold = pool[(this.rng() * pool.length) | 0];
        const ang = this.rng() * Math.PI * 2;
        const r = Math.sqrt(this.rng()) * (hold ? hold.radiusM : body.radiusM);
        const f = new Fish(sid, {
          id: this.nextId++, bodyId: body.id, rng: this.rng,
          x: (hold ? hold.x : body.x) + Math.cos(ang) * r,
          z: (hold ? hold.z : body.z) + Math.sin(ang) * r,
        });
        f.holdX = hold ? hold.x : body.x;
        f.holdZ = hold ? hold.z : body.z;
        f.holdRadiusM = hold ? hold.radiusM : body.radiusM;
        this.fish.push(f);
      }
    }

    /* Rounding, and water bodies too cold or too salt for anything on the
       list, leave the island short of the population it is meant to carry.
       Top it up from the water that can actually hold fish rather than
       accepting whatever fell out of the division. */
    let guard = this.maxFish * 4;
    const stockable = this.bodies.filter((b) => this._suitableFor(b).length);
    while (this.fish.length < this.maxFish && stockable.length && guard-- > 0) {
      const body = stockable[(this.rng() * stockable.length) | 0];
      const suitable = this._suitableFor(body);
      const sid = suitable[(this.rng() * suitable.length) | 0];
      const sp = FISH_SPECIES[sid];
      const matching = body.holds.filter((h) => sp.structure.includes(h.kind));
      const pool = matching.length ? matching : body.holds;
      const hold = pool[(this.rng() * pool.length) | 0];
      const ang = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * (hold ? hold.radiusM : body.radiusM);
      const f = new Fish(sid, {
        id: this.nextId++, bodyId: body.id, rng: this.rng,
        x: (hold ? hold.x : body.x) + Math.cos(ang) * r,
        z: (hold ? hold.z : body.z) + Math.sin(ang) * r,
      });
      f.holdX = hold ? hold.x : body.x;
      f.holdZ = hold ? hold.z : body.z;
      f.holdRadiusM = hold ? hold.radiusM : body.radiusM;
      this.fish.push(f);
    }
    return this.fish.length;
  }

  /* Which species can live in this water at all — the same test the initial
     stocking uses, kept in one place so the top-up cannot disagree with it. */
  _suitableFor(body) {
    return FISH_SPECIES_LIST.filter((id) => {
      const s = FISH_SPECIES[id];
      if (s.water !== body.kind && !(s.water === WATER.brackish && body.kind !== WATER.fresh)) return false;
      return body.surfaceTempC >= s.tempToleranceC[0] && body.surfaceTempC <= s.tempToleranceC[1] + 6;
    });
  }

  step(dt, ctx = {}) {
    const days = dt / 86400;
    for (const b of this.bodies) b.step(days, ctx.airTempC != null ? ctx.airTempC : 18);

    for (const f of this.fish) {
      if (!f.alive) continue;
      const body = this.bodies[f.bodyId];
      if (!body) continue;
      f.hunger = clamp01(f.hunger + days * 2.2);
      f.spooked = Math.max(0, f.spooked - dt / 240);
      f.stamina = Math.min(1, f.stamina + dt / 300);

      /* Fish move to the depth that suits them, every day, both ways. This
         is the single most useful thing an angler can know and the game
         should reward knowing it. */
      const target = this._preferredDepth(f, body);
      f.depthM += (target - f.depthM) * clamp01(dt / 900);

      // Wander around the hold and come back to it. Fish move; they do not
      // move away from the structure that is feeding and hiding them.
      if (f.holdX != null) {
        const dx = f.holdX - f.x, dz = f.holdZ - f.z;
        const d = Math.hypot(dx, dz);
        const wander = clamp01(dt / 600);
        if (d > f.holdRadiusM) { f.x += dx * wander; f.z += dz * wander; }
        else {
          f.x += (this.rng() - 0.5) * wander * 12;
          f.z += (this.rng() - 0.5) * wander * 12;
        }
      }

      // A fish stuck outside its tolerance eventually dies. Shallow warm
      // water in high summer is what kills trout.
      if (f.comfort(body.tempAtDepth(f.depthM)) <= 0.02 && this.rng() < days * 0.4) {
        f.alive = false;
      }
    }
    this.fish = this.fish.filter((f) => f.alive);
    return this;
  }

  _preferredDepth(fish, body) {
    const s = fish.species;
    const mid = (s.tempC[0] + s.tempC[1]) / 2;
    // Walk down through the water column and take the depth whose
    // temperature is closest to what this species wants.
    let best = fish.depthM, bestErr = Infinity;
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const d = clampTo((i / steps) * body.maxDepthM, s.depthM[0], s.depthM[1]);
      const err = Math.abs(body.tempAtDepth(d) - mid);
      if (err < bestErr) { bestErr = err; best = d; }
    }
    return best;
  }

  /* Cast a line. Returns the fish that took it, if any. */
  cast(x, z, opts = {}) {
    const body = this.bodies.find((b) => b.contains(x, z));
    if (!body) return { ok: false, reason: 'no water there' };

    // Fishing a hold is not the same as fishing open water, and the game
    // should say which one the player is doing.
    const hold = body.holdNear(x, z, 10);

    const nearby = this.fish.filter((f) => {
      if (!f.alive || f.hooked || f.bodyId !== body.id) return false;
      const dx = f.x - x, dz = f.z - z;
      return dx * dx + dz * dz < (opts.rangeM || 30) ** 2;
    });
    if (!nearby.length) {
      return { ok: false, reason: hold ? 'nothing home' : 'open water — find the structure', hold: null };
    }

    // Crashing about on the bank puts them down for a while.
    const noise = clamp01(opts.noise || 0);
    for (const f of nearby) f.spooked = clamp01(f.spooked + noise * 0.6);

    const env = {
      waterTempC: body.tempAtDepth(opts.depthM != null ? opts.depthM : 1),
      bait: opts.bait, depthM: opts.depthM, period: opts.period,
      pressureTrend: opts.pressureTrend, skill: opts.skill,
    };
    // Best chance first, but not deterministically — the small greedy one
    // often beats the big careful one to the bait.
    const ranked = nearby
      .map((f) => ({ f, p: f.biteChance(env) }))
      .filter((e) => e.p > 0)
      .sort((a, b) => b.p - a.p);
    for (const e of ranked) {
      if (this.rng() < e.p * (opts.soakSeconds != null ? clamp01(opts.soakSeconds / 45) : 1)) {
        e.f.hooked = true;
        e.f.stamina = 1;
        return { ok: true, fish: e.f, biteChance: e.p, hold: hold ? hold.kind : null };
      }
    }
    return {
      ok: false, reason: 'no takers', best: ranked.length ? ranked[0].p : 0,
      hold: hold ? hold.kind : null, fishPresent: nearby.length,
    };
  }

  land(fish) {
    fish.hooked = false;
    fish.alive = false;
    this.fish = this.fish.filter((f) => f !== fish);
    return fish;
  }

  release(fish) {
    fish.hooked = false;
    fish.spooked = 1;
    fish.hunger = 0;
    return fish;
  }

  census() {
    const out = {};
    for (const f of this.fish) out[f.speciesId] = (out[f.speciesId] || 0) + 1;
    return out;
  }
}
