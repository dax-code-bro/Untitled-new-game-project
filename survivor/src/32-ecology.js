/* ============================================================
   ECOLOGY — five hundred animals that are somewhere even when
   nobody is looking at them.

   The population is a fixed budget of 500 land animals. They are
   not spawned in front of the player and despawned behind him;
   they hold territories, walk between feeding zones, bedding cover
   and water on a daily rhythm, eat down the forage where they
   graze, breed, starve, kill each other and rot where they fall.

   Cost is controlled by detail level rather than by population.
   Near the player an animal runs its full behaviour every step.
   Far away it advances statistically — it still gets hungry, still
   moves between the zones it uses, still dies — but at a fraction
   of a percent of the cost. Walk across the island and the herd you
   left behind has moved on and eaten the meadow down, because it
   did, not because a script decided it should have.
   ============================================================ */

const BEHAVIOUR = {
  bedded: 'bedded', grazing: 'grazing', browsing: 'browsing', drinking: 'drinking',
  travelling: 'travelling', alert: 'alert', fleeing: 'fleeing', stalking: 'stalking',
  chasing: 'chasing', attacking: 'attacking', scavenging: 'scavenging', dead: 'dead',
};

/* Detail levels, by distance from the player. */
const LOD = { ACTIVE: 0, NEARBY: 1, DISTANT: 2 };

/* Forage. A feeding zone holds a stock of each forage type and regrows it
   logistically toward a carrying capacity — so a meadow that a herd of elk
   has stood in for a week is visibly eaten down and takes real time to come
   back, and the herd has to move on. */
const FORAGE = { grass: 'grass', browse: 'browse', mast: 'mast', carrion: 'carrion', prey: 'prey' };

const DIET_FORAGE = {
  grazer: [FORAGE.grass],
  browser: [FORAGE.browse, FORAGE.mast],
  mast: [FORAGE.mast, FORAGE.browse],
  granivore: [FORAGE.mast, FORAGE.grass],
  omnivore: [FORAGE.mast, FORAGE.browse, FORAGE.carrion, FORAGE.prey],
  carnivore: [FORAGE.prey, FORAGE.carrion],
  scavenger: [FORAGE.carrion, FORAGE.mast],
};


class FeedingZone {
  constructor(opts) {
    this.x = opts.x; this.z = opts.z;
    this.radiusM = opts.radiusM || 120;
    this.biome = opts.biome || 'meadow';
    // Standing crop in kilograms of dry matter. A good meadow carries a few
    // hundred kilos per hectare, and this is sized to its area.
    const hectares = (Math.PI * this.radiusM * this.radiusM) / 10000;
    this.capacity = {
      grass: (opts.grass || 0) * hectares * 250,
      browse: (opts.browse || 0) * hectares * 120,
      mast: (opts.mast || 0) * hectares * 40,
    };
    this.stock = {
      grass: this.capacity.grass, browse: this.capacity.browse, mast: this.capacity.mast,
    };
    this.water = !!opts.water;
    this.cover = opts.cover != null ? opts.cover : 0.3;   // how well an animal can hide here
    this.pressure = 0;      // grazing pressure, for the display and for AI
  }

  contains(x, z) {
    const dx = x - this.x, dz = z - this.z;
    return dx * dx + dz * dz <= this.radiusM * this.radiusM;
  }

  /* Which of an animal's needs this place can answer. A zone is not one
     thing: a marsh edge feeds and waters, a thicket feeds nobody but is the
     only place to lie up in daylight. An animal picks the nearest zone that
     serves what it wants right now, which is the whole of the daily
     movement pattern. */
  serves(need) {
    if (need === NEED.drink) return this.water;
    if (need === NEED.rest) return this.cover > 0.5;
    if (need === NEED.feed) {
      return this.stock.grass + this.stock.browse + this.stock.mast > 1;
    }
    if (need === NEED.mate) {
      // Rutting ground is where the food and the cover meet, because that
      // is where the females are.
      return this.cover > 0.35 && this.capacity.grass + this.capacity.browse > 1;
    }
    return false;
  }

  /* Take up to `wantKg` of the forage types this animal eats. Returns what
     was actually available, which is the whole point — a stripped zone feeds
     nobody and the herd has to move. */
  graze(forageTypes, wantKg) {
    let got = 0;
    for (const t of forageTypes) {
      if (!this.stock[t]) continue;
      const take = Math.min(this.stock[t], wantKg - got);
      this.stock[t] -= take;
      got += take;
      if (got >= wantKg) break;
    }
    return got;
  }

  /* Logistic regrowth: fastest when the sward is half eaten, slow when bare
     (nothing left to photosynthesise) and slow when full (nowhere to put it).
     Season scales the rate, so winter really does not feed anyone. */
  step(days, seasonFactor = 1) {
    for (const t of ['grass', 'browse', 'mast']) {
      const cap = this.capacity[t];
      if (cap <= 0) continue;
      const s = this.stock[t];
      const r = (t === 'grass' ? 0.09 : t === 'browse' ? 0.035 : 0.012) * seasonFactor;
      this.stock[t] = clampTo(s + r * s * (1 - s / cap) * days + cap * 0.0005 * days * seasonFactor, 0, cap);
    }
    const total = this.capacity.grass + this.capacity.browse + this.capacity.mast;
    this.pressure = total > 0
      ? 1 - (this.stock.grass + this.stock.browse + this.stock.mast) / total : 0;
  }
}


/* ------------------------------------------------------------------
   A carcass. The design calls for four days from kill to bone, and on
   an island with this many scavengers that is what happens — but it
   happens because of scavengers and temperature, not because of a
   four-day timer.

   The intrinsic rate is accumulated degree-days, which is the metric
   forensic entomology actually uses. Left completely alone in mild
   weather a deer takes weeks. It does not get left alone: coyotes,
   foxes, ravens, opossums and bears find it, and their combined
   pressure is what drives the four-day figure. Cache it, hang it high,
   or keep it cold, and it lasts far longer — which is a real skill
   the player can learn and a real reason to build a smokehouse.
   ------------------------------------------------------------------ */
class Carcass {
  constructor(opts) {
    this.x = opts.x; this.y = opts.y || 0; this.z = opts.z;
    this.speciesId = opts.speciesId;
    this.individual = opts.individual;
    this.initialMassKg = opts.massKg;
    this.massKg = opts.massKg;
    this.meatRemainingKg = opts.meatKg != null ? opts.meatKg : opts.massKg * 0.4;
    this.initialMeatKg = this.meatRemainingKg;
    this.boneKg = opts.massKg * 0.14;

    this.ageDays = 0;
    this.accumulatedDegreeDays = 0;
    this.stage = 'fresh';
    this.protected = 0;        // 0..1: cached, hung, or in a cold store
    this.skinned = false;
    this.butchered = false;
    // Scent carries a long way and is what brings the bears in.
    this.scentRadiusM = 200;
    this.scavengersOnIt = 0;
    this.spoilage = 0;         // 0..1; past ~0.35 the meat is a gamble
  }

  get skeletal() { return this.stage === 'skeletal'; }

  step(days, opts = {}) {
    const tempC = opts.airTempC != null ? opts.airTempC : 15;
    this.ageDays += days;
    // Below 4 C almost nothing happens, which is the whole basis of hanging
    // game in cold weather.
    this.accumulatedDegreeDays += Math.max(0, tempC - 4) * days;

    const shielded = 1 - 0.85 * this.protected;

    /* Insects and bacteria on their own, measured in accumulated degree-days
       because that is the metric forensic entomology uses. Skeletonisation
       by decay alone runs to well over a thousand degree-days — weeks in
       mild weather. */
    const intrinsicKg = this.initialMeatKg * (days * 0.055) * clamp01(this.accumulatedDegreeDays / 250) * shielded;

    /* Scavengers, which on an island this full are what actually strips a
       carcass. They eat at a rate, not at a fraction of what is left, and a
       coyote gets through a couple of kilos a day. Three or four animals on
       a deer takes it to bone in about four days, which is the figure the
       design asks for and the reason it lands there. */
    const scavengerKgPerDay = 2.6;
    const scavKg = this.scavengersOnIt * scavengerKgPerDay * days * shielded;

    const consumed = Math.min(this.meatRemainingKg, intrinsicKg + scavKg);
    this.meatRemainingKg -= consumed;
    this.massKg = this.boneKg + this.meatRemainingKg;

    this.spoilage = clamp01(this.accumulatedDegreeDays / 90);

    /* Stage follows the state of the carcass, not the clock. A deer hung in
       a cold shed is still fresh on day eight; the same deer left in the sun
       is bones by Thursday. */
    const gone = 1 - this.meatRemainingKg / Math.max(this.initialMeatKg, 1e-6);
    const add = this.accumulatedDegreeDays;
    this.stage = gone > 0.96 ? 'skeletal'
      : gone > 0.55 ? 'advanced decay'
      : add > 45 ? 'active decay'
      : add > 14 ? 'bloat' : 'fresh';

    // Bloat carries furthest. Once it is bones it stops advertising.
    this.scentRadiusM = this.stage === 'skeletal' ? 20
      : 200 + 600 * clamp01(this.accumulatedDegreeDays / 40);
    this.scavengersOnIt = 0;   // recounted each step by the ecology
    return this;
  }

  /* Eating from a carcass that has been out too long is a real decision with
     a real risk, not a flat "spoiled" flag. */
  takeMeat(kg) {
    const got = Math.min(this.meatRemainingKg, kg);
    this.meatRemainingKg -= got;
    return {
      kg: got,
      spoilage: this.spoilage,
      safeCooked: this.spoilage < 0.55,
      // Botulinum and the rest do not care how well you cook them.
      toxinRisk: clamp01((this.spoilage - 0.5) / 0.5),
    };
  }
}


class Animal {
  constructor(individual, opts = {}) {
    Object.assign(this, individual);
    this.species = SPECIES[individual.speciesId];
    this.id = opts.id != null ? opts.id : 0;
    this.x = opts.x || 0; this.y = opts.y || 0; this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speedMs = 0;
    this.alive = true;
    this.behaviour = BEHAVIOUR.bedded;
    this.lod = LOD.DISTANT;

    // Home range, as a centre and a radius derived from the published area.
    this.homeX = this.x; this.homeZ = this.z;
    this.homeRadiusM = Math.sqrt((this.species.homeRangeKm2 * 1e6) / Math.PI);

    this.groupId = opts.groupId != null ? opts.groupId : -1;
    this.zoneIndex = -1;
    this.targetX = this.x; this.targetZ = this.z;

    /* Condition and needs, in the same currency the player's body uses so
       that a starving winter shows up in the animals before it shows up in
       the player. */
    this.energyKcal = this.massKg * 900;         // usable reserve
    this.maxEnergyKcal = this.massKg * 1400;
    this.hunger = 0.2 + Math.random() * 0.2;
    this.thirst = 0.2;
    this.fatigue = 0;
    this.fear = 0;
    this.awareOfPlayer = 0;                       // 0..1, builds before it flees
    this.woundSeverity = 0;
    this.bleedRate = 0;
    this.lastSeenPlayerT = -1e9;

    /* Who this animal is, beyond its numbers. Stage and coat are rolled
       once and then drive how it looks, how it behaves and what it is worth
       to shoot. */
    this.stage = stageFor(this.species, this.ageDays);
    this.coat = this.coat || COAT.common;
    this.alert = ALERT.unaware;
    this.lastSensedBy = null;        // 'sight' | 'hearing' | 'smell'
    this.lastKnownPlayerX = 0;
    this.lastKnownPlayerZ = 0;

    /* Sign. An animal lays a footprint every stride, so the distance it has
       walked since the last one is what decides when the next one drops. */
    this.sinceTrackM = 0;
    this.sinceDroppingS = 0;
    this.gait = 'walk';
    this.motherId = opts.motherId != null ? opts.motherId : -1;
  }

  /* What to call it: 'mature whitetail buck', 'whitetail fawn'. */
  get label() {
    const s = this.species;
    const stage = stageName(s, this.stage);
    if (this.stage === LIFE_STAGE.young || this.stage === LIFE_STAGE.juvenile) {
      return `${s.name.toLowerCase()} ${stage}`;
    }
    if (s.antlers) return `${s.name.toLowerCase()} ${this.male ? 'buck' : 'doe'}`;
    return `${this.male ? 'male' : 'female'} ${s.name.toLowerCase()}`;
  }

  /* How big it is right now, which for anything not yet grown is not how
     big its species gets. Everything that draws it or butchers it asks
     here rather than reading massKg directly. */
  get growth() { return growthFraction(this.species, this.ageDays); }
  get currentMassKg() { return this.massKg * this.growth; }
  get currentShoulderM() {
    // Legs are nearly full length long before the body fills out, which is
    // exactly why a fawn looks like a deer drawn by someone in a hurry.
    return this.shoulderHeightM * (0.55 + 0.45 * Math.pow(this.growth, 0.55));
  }
  get currentLengthM() { return this.lengthM * (0.45 + 0.55 * this.growth); }

  get bmrWatts() {
    // Kleiber's law: metabolic rate scales with the three-quarter power of
    // mass, not with mass. It is why a squirrel eats a quarter of its body
    // weight a day and an elk does not.
    return 3.4 * Math.pow(this.massKg, 0.75);
  }

  /* Daily forage requirement in kilograms of dry matter — a couple of
     percent of body mass for a ruminant, far more relative to size for a
     small mammal. */
  get dailyForageKg() {
    return Math.pow(this.massKg, 0.75) * 0.055;
  }

  /* How readily this animal will notice a player at a given distance, given
     wind, noise and whether it is moving. Every term is a species figure. */
  detectionChance(dx, dz, opts = {}) {
    const s = this.species;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return 1;

    // Smell is the one you cannot beat by being still, and it is the sense
    // that matters most for the animals worth hunting. Being downwind of a
    // grizzly is not a suggestion.
    let scent = 0;
    if (s.smellM > 0 && opts.windDirX != null) {
      // Positive when the wind carries the player's scent toward the animal.
      const toAnimal = dist > 0 ? { x: dx / dist, z: dz / dist } : { x: 0, z: 0 };
      const downwind = toAnimal.x * opts.windDirX + toAnimal.z * opts.windDirZ;
      const carry = clamp01(downwind) * clamp01((opts.windMs || 0) / 4 + 0.25);
      scent = carry * clamp01(1 - dist / s.smellM);
    }

    const noise = clamp01(1 - dist / s.hearingM) * clamp01(opts.noise || 0);
    const sight = clamp01(1 - dist / s.visionM)
      * clamp01(0.12 + (opts.movementSpeed || 0) * 0.55)
      * (1 - clamp01(opts.concealment || 0))
      * clamp01(0.25 + (opts.light != null ? opts.light : 1) * 0.75);

    // The senses are independent, so combine them as independent chances
    // rather than adding them.
    const miss = (1 - clamp01(scent)) * (1 - clamp01(noise)) * (1 - clamp01(sight));
    return clamp01((1 - miss) * s.alertness);
  }
}


class Ecology {
  constructor(opts = {}) {
    this.rng = opts.rng || Math.random;
    this.maxAnimals = opts.maxAnimals != null ? opts.maxAnimals : 500;
    this.worldSizeM = opts.worldSizeM || 4000;
    this.terrain = opts.terrain || null;      // { heightAt, slopeAt } from the engine

    this.animals = [];
    this.carcasses = [];
    this.zones = [];
    this.groups = new Map();
    this.nextId = 1;

    // Round-robin cursor for the distant tier, so every animal is visited
    // on a fixed budget rather than the whole population every step.
    this._cursor = 0;

    /* A spatial hash over the animals. Predation and scavenging both ask
       "what is near this point", and doing that by scanning five hundred
       animals for each of twenty predators every step is most of the cost
       of the whole simulation. The grid is rebuilt on the same slow cadence
       those systems run on, because animals do not move far in a game-hour
       and a stale bucket costs nothing but a distance check. */
    this._gridCellM = 200;
    this._grid = new Map();
    this._predateAccum = 0;
    this._scavengeAccum = 0;
    this.stats = { active: 0, nearby: 0, distant: 0, born: 0, died: 0, killed: 0 };

    /* Sign the animals have left. Only what is near enough for the player
       to find is kept: an island's worth of footprints is millions of them
       and nobody is ever going to look at the ones four kilometres away. */
    this.signs = [];
    this.maxSigns = opts.maxSigns != null ? opts.maxSigns : 2400;
    this.signRadiusM = opts.signRadiusM != null ? opts.signRadiusM : 420;

    /* Where it has been noisy. This is what stops the island being hunted
       out: the animals do not die, they leave. */
    this.pressure = new PressureMap({ worldSizeM: this.worldSizeM });
    this.nowDays = 0;
  }

  /* ---------------- sign ----------------

     Everything an animal leaves behind, generated from the animal that
     left it. The store is bounded and centred on the player, because sign
     nobody can reach is sign nobody will ever read. */

  addSign(opts) {
    const sign = new Sign(Object.assign({ createdAtDays: this.nowDays }, opts));
    this.signs.push(sign);
    if (this.signs.length > this.maxSigns) {
      // Drop the oldest, which is also the faintest.
      this.signs.splice(0, this.signs.length - this.maxSigns);
    }
    return sign;
  }

  _expireSign(ctx) {
    if (!this.signs.length) return;
    this._signSweep = (this._signSweep || 0) + 1;
    if (this._signSweep < 30) return;          // a couple of times a second is plenty
    this._signSweep = 0;
    const px = ctx.playerX || 0, pz = ctx.playerZ || 0;
    const weather = ctx.weather || {};
    const keepR = this.signRadiusM * 2.4;
    let w = 0;
    for (let i = 0; i < this.signs.length; i++) {
      const sg = this.signs[i];
      if (sg.freshness(this.nowDays, weather) <= 0.02) continue;
      if (Math.hypot(sg.x - px, sg.z - pz) > keepR) continue;
      this.signs[w++] = sg;
    }
    this.signs.length = w;
  }

  /* Sign within reach, freshest first, already read. This is what the
     player's eyes get handed when they look at the ground. */
  signsNear(x, z, radiusM, opts = {}) {
    const out = [];
    const weather = opts.weather || {};
    const skill = opts.skill != null ? opts.skill : 0.3;
    for (const sg of this.signs) {
      if (Math.hypot(sg.x - x, sg.z - z) > radiusM) continue;
      const read = sg.read(this.nowDays, skill, weather);
      if (!read) continue;
      out.push({ sign: sg, read });
    }
    out.sort((a, b) => b.read.freshness - a.read.freshness);
    return out;
  }

  /* An animal walking lays tracks at its own stride length, and only near
     enough to matter. Called from the movement step. */
  _layTracks(a, movedM, ctx) {
    const px = ctx.playerX || 0, pz = ctx.playerZ || 0;
    if (Math.hypot(a.x - px, a.z - pz) > this.signRadiusM) { a.sinceTrackM = 0; return; }
    const g = GAIT_SIGN[a.gait] || GAIT_SIGN.walk;
    const stride = Math.max(0.25, g.strideBodyLengths * a.currentLengthM);
    a.sinceTrackM += movedM;
    if (a.sinceTrackM < stride) return;
    a.sinceTrackM = 0;

    /* How deep a track presses in is the animal's weight over the area of
       its foot against how soft the ground is. A heavy animal on wet ground
       leaves something you can read for days. */
    const soft = ctx.groundSoftness ? ctx.groundSoftness(a.x, a.z) : 0.5;
    const depth = clamp01((a.currentMassKg / 400) * (0.35 + soft) * g.depth);
    this.addSign({
      kind: SIGN.track, x: a.x, z: a.z, speciesId: a.speciesId, male: a.male,
      ageClass: a.stage, massKg: a.currentMassKg, heading: a.heading,
      gait: a.gait, depth, animalId: a.id,
      substrate: soft > 0.7 ? 'mud' : soft > 0.4 ? 'soil' : 'hard ground',
    });
  }

  /* Droppings, beds and rut sign, on their own slow clocks. */
  _laySign(a, dt, ctx) {
    const px = ctx.playerX || 0, pz = ctx.playerZ || 0;
    if (Math.hypot(a.x - px, a.z - pz) > this.signRadiusM) return;

    // An ungulate passes droppings roughly a dozen times a day.
    a.sinceDroppingS += dt;
    const every = 86400 / (a.species.class === 'ungulate' ? 13 : 6);
    if (a.sinceDroppingS > every) {
      a.sinceDroppingS = 0;
      this.addSign({
        kind: SIGN.dropping, x: a.x, z: a.z, speciesId: a.speciesId, male: a.male,
        ageClass: a.stage, massKg: a.currentMassKg, depth: 0.6, animalId: a.id,
      });
    }

    // A bedded animal leaves a bed the length of its body.
    if (a.behaviour === BEHAVIOUR.bedded && !a._bedLaid) {
      a._bedLaid = true;
      this.addSign({
        kind: SIGN.bed, x: a.x, z: a.z, speciesId: a.speciesId, male: a.male,
        ageClass: a.stage, massKg: a.currentMassKg, heading: a.heading,
        amount: a.currentLengthM, depth: 0.7, animalId: a.id,
      });
    } else if (a.behaviour !== BEHAVIOUR.bedded) a._bedLaid = false;

    /* Rut sign. A buck in the rut rubs trees and paws scrapes, and those
       are the signs that tell you a good one is working this ground —
       which is the whole reason to hunt a rub line. */
    const rut = ctx.dayOfYear != null ? rutIntensity(a.speciesId, ctx.dayOfYear) : 0;
    if (rut > 0.3 && a.male && (a.stage === LIFE_STAGE.adult || a.stage === LIFE_STAGE.prime)) {
      a._rutSignAccum = (a._rutSignAccum || 0) + dt;
      if (a._rutSignAccum > 3600 / rut) {
        a._rutSignAccum = 0;
        const kind = this.rng() < 0.5 ? SIGN.rub : SIGN.scrape;
        this.addSign({
          kind, x: a.x, z: a.z, speciesId: a.speciesId, male: true,
          ageClass: a.stage, massKg: a.currentMassKg, depth: 0.8, animalId: a.id,
        });
      }
    }
  }

  /* ---------------- calling ----------------

     Blow a call and see what answers. Everything within earshot of the
     right species gets a roll; what responds starts walking to you, and
     what does not like it leaves. */
  respondToCall(callId, x, z, opts = {}) {
    const call = CALL[callId];
    if (!call) return { ok: false, reason: 'no such call' };
    this._callHistory = this._callHistory || new Map();
    const heard = this._callHistory.get(callId) || 0;

    const results = { ok: true, call, responded: [], spooked: [], heardBy: 0 };
    for (const a of this.animals) {
      if (!a.alive) continue;
      const dist = Math.hypot(a.x - x, a.z - z);
      if (dist > call.rangeM) continue;
      results.heardBy++;
      const r = callResponse(call, Object.assign({ awareness: a.awareOfPlayer }, a), {
        distanceM: dist, season: opts.season, windMs: opts.windMs,
        heardRecently: heard, rng: this.rng,
      });
      if (r.responds) {
        a.behaviour = BEHAVIOUR.travelling;
        a.targetX = x; a.targetZ = z;
        a._answeringCall = callId;
        results.responded.push(a);
      } else if (r.spooks) {
        a.awareOfPlayer = Math.max(a.awareOfPlayer, 0.8);
        a.alert = ALERT.spooked;
        results.spooked.push(a);
      }
    }
    // Call shyness decays; for now each blow counts and the count fades in
    // the same step the pressure does.
    this._callHistory.set(callId, heard + 1);
    this._callDecay = 0;
    return results;
  }

  /* A shot, or anything else loud. Raises pressure over the area it
     carried, and everything that heard it reacts. */
  disturb(x, z, opts = {}) {
    const radius = opts.radiusM || 800;
    this.pressure.add(x, z, opts.amount != null ? opts.amount : 1, radius);
    let startled = 0;
    for (const a of this.animals) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d > radius) continue;
      const heard = clamp01(1 - (d / radius) ** 1.5);
      if (heard < 0.05) continue;
      a.awareOfPlayer = clamp01(a.awareOfPlayer + heard * 0.85);
      a.lastKnownPlayerX = x; a.lastKnownPlayerZ = z;
      a.lastSensedBy = 'hearing';
      a.alert = alertStateFor(a.awareOfPlayer);
      if (a.awareOfPlayer > 0.7) {
        a.behaviour = BEHAVIOUR.fleeing;
        const dx = a.x - x, dz = a.z - z, m = Math.max(1e-6, Math.hypot(dx, dz));
        a.targetX = a.x + (dx / m) * 400;
        a.targetZ = a.z + (dz / m) * 400;
        startled++;
      }
    }
    return { startled };
  }

  /* ---------------- world setup ---------------- */

  addZone(opts) {
    const z = new FeedingZone(opts);
    this.zones.push(z);
    return z;
  }

  /* Populate to the budget, weighted so the result is a plausible community
     rather than 500 grizzly bears. Predator numbers follow their prey. */
  populate(mix, opts = {}) {
    const weights = mix || Ecology.DEFAULT_MIX;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [speciesId, w] of Object.entries(weights)) {
      const n = Math.round((w / total) * this.maxAnimals);
      for (let i = 0; i < n && this.animals.length < this.maxAnimals; i++) {
        this.spawn(speciesId, opts);
      }
    }
    this._formGroups();
    return this.animals.length;
  }

  spawn(speciesId, opts = {}) {
    if (this.animals.length >= this.maxAnimals) return null;
    const s = SPECIES[speciesId];
    const half = this.worldSizeM / 2;
    // Prefer a feeding zone this species can actually eat in — animals live
    // where their food is, so the map's ecology places them, not a uniform
    // random scatter.
    const usable = this.zones.filter((z) => {
      const types = DIET_FORAGE[s.diet] || [];
      return types.some((t) => (z.capacity[t] || 0) > 0);
    });
    let x, z;
    if (usable.length && this.rng() < 0.85) {
      const zone = usable[(this.rng() * usable.length) | 0];
      const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * zone.radiusM;
      x = zone.x + Math.cos(a) * r; z = zone.z + Math.sin(a) * r;
    } else {
      x = (this.rng() - 0.5) * this.worldSizeM * 0.9;
      z = (this.rng() - 0.5) * this.worldSizeM * 0.9;
    }
    const ind = rollIndividual(speciesId, this.rng);
    // A coat is rolled once and kept: the piebald doe is the same piebald
    // doe every time you see her, which is what makes her worth talking about.
    ind.coat = rollCoat(this.rng);
    const a = new Animal(ind, {
      id: this.nextId++, x, z,
      y: this.terrain ? this.terrain.heightAt(x, z) : 0,
      heading: this.rng() * Math.PI * 2,
    });
    this.animals.push(a);
    return a;
  }

  /* Herds and packs. Group-living species are placed as groups, which is why
     you find nine wolves or none. */
  _formGroups() {
    const bySpecies = new Map();
    for (const a of this.animals) {
      if (!bySpecies.has(a.speciesId)) bySpecies.set(a.speciesId, []);
      bySpecies.get(a.speciesId).push(a);
    }
    let gid = 1;
    for (const [speciesId, list] of bySpecies) {
      const s = SPECIES[speciesId];
      const [lo, hi] = s.groupSize;
      if (hi <= 1) continue;
      let i = 0;
      while (i < list.length) {
        const size = lo + Math.floor(this.rng() * (hi - lo + 1));
        const members = list.slice(i, i + size);
        if (members.length < 2) break;
        const leader = members[0];
        const g = { id: gid, speciesId, members, leader, x: leader.x, z: leader.z };
        this.groups.set(gid, g);
        for (const m of members) {
          m.groupId = gid;
          // Cluster the group in space instead of leaving them scattered.
          const ang = this.rng() * Math.PI * 2, r = this.rng() * 40;
          m.x = leader.x + Math.cos(ang) * r;
          m.z = leader.z + Math.sin(ang) * r;
          m.homeX = leader.x; m.homeZ = leader.z;
          if (this.terrain) m.y = this.terrain.heightAt(m.x, m.z);
        }
        gid++;
        i += size;
      }
    }
  }

  /* ---------------- the step ---------------- */

  step(dt, ctx = {}) {
    const days = dt / 86400;
    const px = ctx.playerX || 0, pz = ctx.playerZ || 0;
    this.nowDays += days;
    this.pressure.step(days);
    this._expireSign(ctx);

    /* Forage regrows on a timescale of days. Advancing seven hundred zones
       sixty times a second computes the same curve at absurd resolution, so
       it runs on an accumulator and is handed the whole elapsed interval —
       logistic growth over one hour-long step and over a hundred tiny ones
       agree to well inside a blade of grass. */
    this._growthAccum = (this._growthAccum || 0) + days;
    if (this._growthAccum >= 1 / 24) {
      const g = ctx.seasonGrowth != null ? ctx.seasonGrowth : 1;
      for (const z of this.zones) z.step(this._growthAccum, g);
      this._growthAccum = 0;
    }

    // Carcasses first: scavengers need to know what is out there.
    for (const c of this.carcasses) c.step(days, ctx);

    // Assign detail levels. Full behaviour is expensive and only matters
    // where it can be observed.
    const activeR = 220, nearR = 900;
    let iActive = 0, iNear = 0, iDist = 0;
    for (const a of this.animals) {
      if (!a.alive) continue;
      const d2 = (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz);
      a.lod = d2 < activeR * activeR ? LOD.ACTIVE : d2 < nearR * nearR ? LOD.NEARBY : LOD.DISTANT;
      if (a.lod === LOD.ACTIVE) iActive++; else if (a.lod === LOD.NEARBY) iNear++; else iDist++;
    }
    this.stats.active = iActive; this.stats.nearby = iNear; this.stats.distant = iDist;

    for (const a of this.animals) {
      if (!a.alive) continue;
      if (a.lod === LOD.ACTIVE) this._stepActive(a, dt, ctx);
      else if (a.lod === LOD.NEARBY) this._stepNearby(a, dt, ctx);
    }

    // Distant animals advance on a round-robin budget, catching up whatever
    // time has passed since they were last visited. Nothing is frozen; it is
    // simply not looked at very often.
    const budget = Math.min(this.animals.length, 48);
    for (let i = 0; i < budget; i++) {
      const a = this.animals[this._cursor % this.animals.length];
      this._cursor++;
      if (!a || !a.alive || a.lod !== LOD.DISTANT) continue;
      const since = ctx.now != null ? Math.max(dt, ctx.now - (a._lastStepT || ctx.now)) : dt;
      a._lastStepT = ctx.now;
      this._stepDistant(a, Math.min(since, 3600), ctx);
    }

    /* Predation and scavenging are hourly problems, not per-frame ones. A
       wolf does not decide to hunt sixty times a second, and running them
       on an accumulator rather than every step takes the ecology from the
       most expensive thing in the loop to one of the cheapest — with
       identical behaviour, because each catch-up call is handed the whole
       elapsed interval. */
    this._scavengeAccum += days;
    this._predateAccum += days;
    const hour = 1 / 24;
    if (this._scavengeAccum >= hour * 0.5) {
      this._rebuildGrid();
      this._scavenge(this._scavengeAccum);
      this._scavengeAccum = 0;
    }
    if (this._predateAccum >= hour) {
      this._predate(this._predateAccum);
      this._predateAccum = 0;
    }
    this._cull();
    return this;
  }

  /* Needs, common to every detail level: this is what makes an animal that
     nobody has looked at for two days genuinely hungrier. */
  _advanceNeeds(a, dt, ctx) {
    const days = dt / 86400;
    const burn = (a.bmrWatts * (1 + a.speedMs * 0.5) * dt) / UNIT.KCAL_J;
    a.energyKcal -= burn;
    a.hunger = clamp01(1 - a.energyKcal / a.maxEnergyKcal);
    a.thirst = clamp01(a.thirst + days * 1.6);
    a.fatigue = clamp01(a.fatigue + (a.speedMs > a.species.topSpeedMs * 0.55 ? dt / a.species.sprintS : -dt / 90));

    if (a.bleedRate > 0) {
      a.woundSeverity = clamp01(a.woundSeverity + a.bleedRate * dt * 0.02);
      if (a.woundSeverity >= 1) this.kill(a, 'bled out');
    }
    if (a.energyKcal <= 0) this.kill(a, 'starvation');
  }

  _forage(a, dt) {
    const zone = this._zoneAt(a.x, a.z);
    if (!zone) return 0;
    const types = DIET_FORAGE[a.species.diet] || [];
    const wantKg = a.dailyForageKg * (dt / 86400) * (1 + a.hunger);
    const got = zone.graze(types, wantKg);
    // Dry matter runs about 2500 kcal/kg for forage.
    a.energyKcal = Math.min(a.maxEnergyKcal, a.energyKcal + got * 2500);
    if (zone.water) a.thirst = Math.max(0, a.thirst - dt / 600);
    return got;
  }

  /* Zones are static once the world is built, so they go into a fixed grid
     built on first use. With seven hundred of them, a linear scan per animal
     per step was the single hottest line in the simulation. */
  _zoneAt(x, z) {
    if (!this._zoneGrid) {
      this._zoneCellM = 200;
      this._zoneGrid = new Map();
      const inv = 1 / this._zoneCellM;
      for (const zn of this.zones) {
        const c0 = Math.floor((zn.x - zn.radiusM) * inv), c1 = Math.floor((zn.x + zn.radiusM) * inv);
        const r0 = Math.floor((zn.z - zn.radiusM) * inv), r1 = Math.floor((zn.z + zn.radiusM) * inv);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const key = (c * 73856093) ^ (r * 19349663);
            let cell = this._zoneGrid.get(key);
            if (!cell) { cell = []; this._zoneGrid.set(key, cell); }
            cell.push(zn);
          }
        }
      }
    }
    const inv = 1 / this._zoneCellM;
    const cell = this._zoneGrid.get((Math.floor(x * inv) * 73856093) ^ (Math.floor(z * inv) * 19349663));
    if (!cell) return null;
    for (const zn of cell) if (zn.contains(x, z)) return zn;
    return null;
  }

  /* Full behaviour, near the player. */
  _stepActive(a, dt, ctx) {
    this._advanceNeeds(a, dt, ctx);
    if (!a.alive) return;

    const px = ctx.playerX || 0, pz = ctx.playerZ || 0;
    const dx = a.x - px, dz = a.z - pz;
    const dist = Math.hypot(dx, dz);

    /* Three senses, separately, so the animal knows what caught it and the
       player can be told. Being winded is different from being seen, and a
       hunter who cannot tell which happened learns nothing. */
    const sensed = senseAll(a, dx, dz, ctx);
    if (sensed.total > 0.02) {
      a.lastSensedBy = sensed.by;
      a.lastKnownPlayerX = px; a.lastKnownPlayerZ = pz;
    }
    /* Awareness builds and decays rather than flipping, so an animal gets
       nervous, looks up, and gives you a moment to freeze — which is the
       moment the whole hunt turns on. It fades at the rate a bumped animal
       really settles at, which is minutes rather than seconds. */
    const decay = AWARENESS_DECAY_PER_MIN * (dt / 60);
    a.awareOfPlayer = clamp01(a.awareOfPlayer + sensed.total * dt * 0.9 - decay);
    // Pressure makes everything jumpier: a valley that has been shot in is
    // a valley where nothing lets you close.
    const pressed = this.pressure.at(a.x, a.z);
    if (pressed > 0.05) a.awareOfPlayer = clamp01(a.awareOfPlayer + pressed * dt * 0.04);
    a.alert = alertStateFor(a.awareOfPlayer);

    const s = a.species;
    if (a.awareOfPlayer > 0.75 && dist < s.flightDistanceM * (1 + pressed * 0.8)) {
      if (s.dangerous && (s.aggression || 0) > 0.35 && dist < (s.chargeDistanceM || 20)) {
        a.behaviour = BEHAVIOUR.attacking;
      } else if (s.dangerous && (s.aggression || 0) > 0.35 && this.rng() < 0.02) {
        a.behaviour = BEHAVIOUR.chasing;
      } else {
        a.behaviour = BEHAVIOUR.fleeing;
        // Flee directly away, and take the herd with you.
        a.targetX = a.x + (dx / Math.max(dist, 1e-6)) * 250;
        a.targetZ = a.z + (dz / Math.max(dist, 1e-6)) * 250;
        this._alarmGroup(a);
      }
      a.fear = clamp01(a.fear + dt * 0.7);
    } else if (a.awareOfPlayer > 0.4) {
      a.behaviour = BEHAVIOUR.alert;
      a.fear = clamp01(a.fear + dt * 0.15);
    } else {
      a.fear = clamp01(a.fear - dt * 0.08);
      this._chooseIdleBehaviour(a, ctx);
    }

    this._move(a, dt, ctx);
    this._laySign(a, dt, ctx);
    if (a.behaviour === BEHAVIOUR.grazing || a.behaviour === BEHAVIOUR.browsing) this._forage(a, dt);
  }

  /* Mid distance: needs, foraging and travel, no per-step detection. */
  _stepNearby(a, dt, ctx) {
    this._advanceNeeds(a, dt, ctx);
    if (!a.alive) return;
    a.awareOfPlayer = clamp01(a.awareOfPlayer - dt * 0.2);
    this._chooseIdleBehaviour(a, ctx);
    this._move(a, dt * 0.5, ctx);
    if (a.behaviour === BEHAVIOUR.grazing || a.behaviour === BEHAVIOUR.browsing) this._forage(a, dt);
  }

  /* Far away: no path, no steering. The animal is still hungry, still eats
     down the zone it is in, and still moves between the zones it uses — it
     just arrives rather than walks. */
  _stepDistant(a, dt, ctx) {
    this._advanceNeeds(a, dt, ctx);
    if (!a.alive) return;
    a.awareOfPlayer = 0;
    a.speedMs = 0;
    this._forage(a, dt);

    // Move to a better zone when the current one is eaten out or the animal
    // is thirsty. This is what makes the map's herds genuinely mobile.
    if (a.hunger > 0.55 || a.thirst > 0.7) {
      const target = this._bestZoneFor(a);
      if (target) {
        const ang = this.rng() * Math.PI * 2, r = this.rng() * target.radiusM * 0.8;
        a.x = target.x + Math.cos(ang) * r;
        a.z = target.z + Math.sin(ang) * r;
        if (this.terrain) a.y = this.terrain.heightAt(a.x, a.z);
        if (target.water) a.thirst = 0.1;
      }
    }
  }

  _bestZoneFor(a) {
    const types = DIET_FORAGE[a.species.diet] || [];
    let best = null, bestScore = -Infinity;
    // An animal picks from the zones inside its home range, not from every
    // zone on the island — which is both correct and a great deal cheaper.
    // An animal's home range does not move, so the set of zones it can
    // reach is fixed for its life. Working it out once is the difference
    // between this being the hottest function in the simulation and it not
    // showing up at all.
    if (!a._zonePool) {
      a._zonePool = this._zonesWithin(a.homeX, a.homeZ, Math.max(a.homeRadiusM * 1.6, 400));
    }
    for (const z of a._zonePool) {
      let food = 0;
      for (const t of types) food += z.stock[t] || 0;
      const d = Math.hypot(z.x - a.homeX, z.z - a.homeZ);
      // Animals do not cross the island for a better meadow; they work their
      // home range. Distance past it is heavily penalised.
      const reach = d < a.homeRadiusM ? 1 : a.homeRadiusM / d;
      const score = food * reach + (z.water && a.thirst > 0.6 ? 5000 : 0);
      if (score > bestScore) { bestScore = score; best = z; }
    }
    return best;
  }

  _zonesWithin(x, z, radiusM) {
    if (!this._zoneGrid) this._zoneAt(x, z);       // builds the grid
    const inv = 1 / this._zoneCellM;
    const span = Math.min(9, Math.ceil(radiusM * inv));
    const cx = Math.floor(x * inv), cz = Math.floor(z * inv);
    const seen = new Set();
    const out = [];
    for (let gz = cz - span; gz <= cz + span; gz++) {
      for (let gx = cx - span; gx <= cx + span; gx++) {
        const cell = this._zoneGrid.get((gx * 73856093) ^ (gz * 19349663));
        if (!cell) continue;
        for (const zn of cell) { if (!seen.has(zn)) { seen.add(zn); out.push(zn); } }
      }
    }
    return out.length ? out : this.zones;
  }

  /* What an animal is doing when nothing is frightening it.

     This is the daily round, and it is the heart of hunting the island:
     an animal is at a feeding zone because it is dawn and it is hungry,
     at water because it has just fed, bedded in a thicket because it is
     one in the afternoon. Learn a species' clock and you know where to
     be. Needs override the clock once they get bad enough, which is what
     makes a waterhole worth sitting on in a dry spell. */
  _chooseIdleBehaviour(a, ctx) {
    const hour = ctx.hourOfDay != null ? ctx.hourOfDay : 12;
    const rut = ctx.dayOfYear != null ? rutIntensity(a.speciesId, ctx.dayOfYear) : 0;
    const need = currentNeed(a.species.activity, hour, {
      thirst: a.thirst, hunger: a.hunger, fatigue: a.fatigue,
      inRut: rut > 0.35, male: a.male, rutIntensity: rut,
    });
    a.need = need;

    if (!a._zonePool || a._zonePoolAt !== (this._zoneEpoch || 0)) {
      a._zonePool = this._zonesWithin(a.homeX, a.homeZ, Math.max(a.homeRadiusM * 1.6, 400));
      a._zonePoolAt = this._zoneEpoch || 0;
    }

    /* Where it goes for that need. Nearest first, but a zone under
       pressure is worth walking past — which is how a shot-at herd ends up
       two valleys over without anything having to teleport them. */
    const pick = () => {
      let best = null, bestCost = Infinity;
      const pool = a._zonePool.length ? a._zonePool : this.zones;
      for (const z of pool) {
        if (!z.serves(need)) continue;
        const d = Math.hypot(z.x - a.x, z.z - a.z);
        const press = this.pressure.at(z.x, z.z);
        // Cover is worth walking for when you want to lie up, and worth
        // something even when you are feeding.
        const shelter = need === NEED.rest ? (1 - z.cover) * 900 : (1 - z.cover) * 120;
        const cost = d + press * 700 + shelter;
        if (cost < bestCost) { bestCost = cost; best = z; }
      }
      return best;
    };

    const here = this._zoneAt(a.x, a.z);
    const atRightPlace = here && here.serves(need);

    if (need === NEED.drink) {
      if (atRightPlace) {
        a.behaviour = BEHAVIOUR.drinking;
        a.thirst = Math.max(0, a.thirst - 0.02);
        return;
      }
      const z = pick();
      if (z) { a.behaviour = BEHAVIOUR.travelling; a.targetX = z.x; a.targetZ = z.z; return; }
    }

    if (need === NEED.feed) {
      const types = DIET_FORAGE[a.species.diet] || [];
      if (here && types.some((t) => (here.stock[t] || 0) > 1)) {
        a.behaviour = a.species.diet === DIET.grazer ? BEHAVIOUR.grazing : BEHAVIOUR.browsing;
        return;
      }
      const z = pick() || this._bestZoneFor(a);
      if (z) { a.behaviour = BEHAVIOUR.travelling; a.targetX = z.x; a.targetZ = z.z; return; }
    }

    if (need === NEED.mate) {
      /* A rutting male walks. That is the whole reason the rut is the
         season to hunt: an animal that spent all summer in a thicket is
         suddenly crossing open ground in daylight looking for females. */
      if (!a._mateTarget || Math.hypot(a.x - a._mateTarget.x, a.z - a._mateTarget.z) < 40) {
        const z = pick();
        if (z) a._mateTarget = { x: z.x, z: z.z };
      }
      if (a._mateTarget) {
        a.behaviour = BEHAVIOUR.travelling;
        a.targetX = a._mateTarget.x; a.targetZ = a._mateTarget.z;
        return;
      }
    }

    if (need === NEED.rest) {
      if (atRightPlace || !a._zonePool.length) { a.behaviour = BEHAVIOUR.bedded; return; }
      const z = pick();
      if (z && Math.hypot(z.x - a.x, z.z - a.z) > 30) {
        a.behaviour = BEHAVIOUR.travelling; a.targetX = z.x; a.targetZ = z.z; return;
      }
      a.behaviour = BEHAVIOUR.bedded;
      return;
    }

    a.behaviour = BEHAVIOUR.bedded;
  }

  _isActiveHour(activity, hour) {
    switch (activity) {
      case ACTIVITY.diurnal: return hour > 6 && hour < 19;
      case ACTIVITY.nocturnal: return hour < 6 || hour > 19;
      // Crepuscular is the one that matters: the deer are up at first and
      // last light and bedded through the middle of the day, so when you
      // hunt decides what you find.
      case ACTIVITY.crepuscular:
        return (hour > 4.5 && hour < 8.5) || (hour > 17 && hour < 21);
      default: return true;
    }
  }

  _move(a, dt, ctx) {
    const s = a.species;
    let speed = 0;
    switch (a.behaviour) {
      case BEHAVIOUR.fleeing: speed = s.topSpeedMs * (1 - 0.6 * a.fatigue); break;
      case BEHAVIOUR.chasing:
      case BEHAVIOUR.attacking: speed = s.topSpeedMs * 0.9 * (1 - 0.5 * a.fatigue); break;
      case BEHAVIOUR.travelling: speed = s.topSpeedMs * 0.16; break;
      case BEHAVIOUR.alert: speed = s.topSpeedMs * 0.05; break;
      case BEHAVIOUR.grazing:
      case BEHAVIOUR.browsing:
      case BEHAVIOUR.scavenging: speed = 0.25; break;
      case BEHAVIOUR.drinking: speed = 0.4; break;
      default: speed = 0;
    }
    // Injury slows an animal down, which is why a hit deer can be followed.
    speed *= (1 - 0.7 * a.woundSeverity);
    a.speedMs = speed;
    if (speed <= 0) return;

    const dx = a.targetX - a.x, dz = a.targetZ - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 1) return;
    let step = speed * dt;
    if (step > d) step = d;
    a.x += (dx / d) * step;
    a.z += (dz / d) * step;
    a.heading = Math.atan2(dx, dz);
    if (this.terrain) a.y = this.terrain.heightAt(a.x, a.z);

    /* Which gait it is in, from how fast it is going relative to what it
       can do. This decides the animation and it decides the tracks, which
       is the point: a running animal leaves a running animal's stride and
       you can read that off the ground an hour later. */
    const frac = speed / Math.max(1e-6, s.topSpeedMs);
    a.gait = frac > 0.72 ? (s.id === 'muleDeer' ? 'stot' : 'gallop')
      : frac > 0.42 ? 'canter'
      : frac > 0.16 ? 'trot' : 'walk';
    this._layTracks(a, step, ctx);
  }

  /* One animal spooking takes the herd with it — which is the difference
     between a shot and a season. */
  _alarmGroup(a) {
    if (a.groupId < 0) return;
    const g = this.groups.get(a.groupId);
    if (!g) return;
    for (const m of g.members) {
      if (m === a || !m.alive) continue;
      m.awareOfPlayer = Math.max(m.awareOfPlayer, 0.8);
      m.behaviour = BEHAVIOUR.fleeing;
      m.targetX = a.targetX + (this.rng() - 0.5) * 60;
      m.targetZ = a.targetZ + (this.rng() - 0.5) * 60;
    }
  }

  /* Scavengers find carcasses by scent and work them down. This is what
     turns a kill into bones in four days, and what turns a kill you left
     unattended into nothing at all. */
  _scavenge(days) {
    if (!this.carcasses.length) return;
    // Driven from the carcasses rather than from the population: there are
    // a handful of carcasses and five hundred animals, and only the ones
    // close enough to smell it are candidates.
    for (const c of this.carcasses) {
      if (c.skeletal) continue;
      const candidates = this.near(c.x, c.z, c.scentRadiusM, (a) => {
        const s = a.species;
        return s.scavenges || s.diet === DIET.carnivore || s.diet === DIET.omnivore
          || s.diet === DIET.scavenger;
      });
      for (const a of candidates) {
        const d = Math.hypot(a.x - c.x, a.z - c.z);
        c.scavengersOnIt++;
        if (d < 40) {
          a.behaviour = BEHAVIOUR.scavenging;
          const ate = Math.min(c.meatRemainingKg, a.dailyForageKg * days * 2);
          c.meatRemainingKg -= ate;
          a.energyKcal = Math.min(a.maxEnergyKcal, a.energyKcal + ate * 2200);
        } else {
          a.behaviour = BEHAVIOUR.travelling;
          a.targetX = c.x; a.targetZ = c.z;
        }
      }
    }
  }

  /* Predation. Without this the wolves starve and the deer breed until the
     meadows are bare — and neither is a world. Hunting success is low, as it
     is in life: a wolf pack fails far more often than it succeeds, and that
     is why a pack needs a large territory. */
  _predate(days) {
    if (days <= 0) return;
    for (const pred of this.animals) {
      if (!pred.alive) continue;
      const s = pred.species;
      if (s.diet !== DIET.carnivore && !(s.diet === DIET.omnivore && pred.hunger > 0.75)) continue;
      if (pred.hunger < 0.35) continue;

      // Hunt inside the territory, not across the island.
      const reach = s.packHunter ? 900 : 450;
      const prey = this.near(pred.x, pred.z, reach, (a) =>
        a !== pred && a.species.diet !== DIET.carnivore
        && a.massKg < pred.massKg * (s.packHunter ? 9 : 2.2)
        && a.massKg > pred.massKg * 0.02);
      if (!prey.length) continue;

      const target = prey[(this.rng() * prey.length) | 0];
      // Base success per day of hunting, lifted by pack size and by the
      // prey already being hurt, cut by how much bigger the prey is.
      const packSize = pred.groupId >= 0 && this.groups.has(pred.groupId)
        ? this.groups.get(pred.groupId).members.filter((m) => m.alive).length : 1;
      let p = 0.16 * (s.ambush ? 1.9 : 1) * (1 + 0.22 * (packSize - 1));
      p *= 1 + 1.6 * target.woundSeverity;
      p *= clamp01(1.3 - target.massKg / (pred.massKg * 3));
      p *= days * 1.4;

      if (this.rng() < clamp01(p)) {
        const carcass = this.kill(target, `taken by ${s.name.toLowerCase()}`);
        // The pack feeds, which is the point.
        const share = Math.min(carcass.meatRemainingKg, pred.dailyForageKg * 3);
        carcass.meatRemainingKg -= share;
        pred.energyKcal = Math.min(pred.maxEnergyKcal, pred.energyKcal + share * 2200);
        if (packSize > 1) {
          for (const m of this.groups.get(pred.groupId).members) {
            if (!m.alive || m === pred) continue;
            const ms = Math.min(carcass.meatRemainingKg, m.dailyForageKg * 2.5);
            carcass.meatRemainingKg -= ms;
            m.energyKcal = Math.min(m.maxEnergyKcal, m.energyKcal + ms * 2200);
          }
        }
      }
    }
  }

  /* ---------------- events ---------------- */

  kill(animal, cause = 'unknown') {
    if (!animal.alive) return null;
    animal.alive = false;
    animal.behaviour = BEHAVIOUR.dead;
    animal.causeOfDeath = cause;
    this.stats.died++;
    if (cause === 'hunted') this.stats.killed++;

    const c = new Carcass({
      x: animal.x, y: animal.y, z: animal.z,
      speciesId: animal.speciesId, individual: animal,
      massKg: animal.massKg,
      meatKg: animal.massKg * animal.species.dress,
    });
    this.carcasses.push(c);
    // Losing a member scatters the rest.
    this._alarmGroup(animal);
    return c;
  }

  /* A hit that is not immediately fatal. A wounded animal runs, and how far
     it runs before it goes down is the tracking problem — which is the part
     of hunting most games skip and the part that actually is hunting. */
  wound(animal, severity, opts = {}) {
    animal.woundSeverity = clamp01(animal.woundSeverity + severity);
    animal.bleedRate = Math.max(animal.bleedRate, severity * 0.5);
    animal.awareOfPlayer = 1;
    animal.fear = 1;
    animal.alert = ALERT.fleeing;
    animal.behaviour = animal.species.dangerous && (animal.species.aggression || 0) > 0.3
      ? BEHAVIOUR.chasing : BEHAVIOUR.fleeing;
    const away = opts.fromX != null
      ? Math.atan2(animal.x - opts.fromX, animal.z - opts.fromZ) : this.rng() * Math.PI * 2;

    /* Where you hit decides everything that happens next: how far it goes,
       how long you should wait, and what the blood on the ground looks
       like. The blood is generated from the hit rather than from the
       severity, so reading it correctly tells you the truth and reading it
       wrong is your mistake. */
    const blood = bloodFor(opts.region || 'chest', severity);
    animal.hitBlood = blood;
    animal.hitRegion = opts.region || 'chest';

    // A lung-hit deer goes a hundred metres; a gut-hit one goes a mile.
    const runM = blood.trailMetres * (0.6 + this.rng() * 0.8);
    animal.targetX = animal.x + Math.sin(away) * runM;
    animal.targetZ = animal.z + Math.cos(away) * runM;

    /* Lay the trail as real sign, so it is found the same way tracks are
       and fades the same way in the rain. */
    const steps = Math.min(90, Math.max(4, Math.round(runM / 6)));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      // Blood thins out as the animal clots, and the first fifty metres is
      // where nearly all of it is.
      const amount = blood.volume * Math.pow(1 - t, 1.7);
      if (amount < 0.03) break;
      this.addSign({
        kind: SIGN.blood, x: animal.x + Math.sin(away) * runM * t,
        z: animal.z + Math.cos(away) * runM * t,
        speciesId: animal.speciesId, male: animal.male, ageClass: animal.stage,
        massKg: animal.currentMassKg, heading: away, blood, amount,
        depth: 0.5 + blood.spread * 0.4, animalId: animal.id,
      });
    }
    // And a tuft of hair at the hit, which is what tells you the shot
    // connected at all when there is no blood for the first twenty metres.
    this.addSign({
      kind: SIGN.hair, x: animal.x, z: animal.z, speciesId: animal.speciesId,
      male: animal.male, ageClass: animal.stage, massKg: animal.currentMassKg,
      depth: 0.4, animalId: animal.id,
    });

    if (severity >= 1) return this.kill(animal, 'hunted');
    return null;
  }

  /* The blood trail a wounded animal leaves, as points a player can find.
     Density falls with distance as the bleeding slows. */
  bloodTrail(animal, spacingM = 4) {
    if (animal.bleedRate <= 0) return [];
    const pts = [];
    const dx = animal.targetX - animal.x, dz = animal.targetZ - animal.z;
    const d = Math.hypot(dx, dz);
    const n = Math.min(120, Math.floor(d / spacingM));
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(n - 1, 1);
      pts.push({
        x: animal.x + dx * t, z: animal.z + dz * t,
        amount: animal.bleedRate * (1 - t * 0.75),
        // Frothy pink is a lung hit and the animal is close to down; dark is
        // liver; green is gut, and that one is a long day.
        kind: animal.woundSeverity > 0.7 ? 'frothy' : animal.woundSeverity > 0.4 ? 'dark' : 'sparse',
      });
    }
    return pts;
  }

  /* Population maintenance. Births replace losses toward the carrying
     capacity the zones can actually support, so hunting a species out has
     consequences that last. */
  _cull() {
    this.animals = this.animals.filter((a) => a.alive);
    this.carcasses = this.carcasses.filter((c) => !(c.skeletal && c.ageDays > 30));
  }

  breedingStep(days) {
    if (this.animals.length >= this.maxAnimals) return 0;
    const counts = {};
    for (const a of this.animals) counts[a.speciesId] = (counts[a.speciesId] || 0) + 1;
    let born = 0;
    for (const [speciesId, n] of Object.entries(counts)) {
      const s = SPECIES[speciesId];
      if (n < 2) continue;
      // Litters per female per year, halved for sex ratio, damped by how
      // full the island already is.
      const perYear = ((s.litter[0] + s.litter[1]) / 2) * (365 / Math.max(s.gestationDays, 60));
      const pressure = 1 - this.animals.length / this.maxAnimals;
      const expected = n * 0.5 * perYear * (days / 365) * pressure * 0.4;
      let k = Math.floor(expected);
      if (this.rng() < expected - k) k++;
      for (let i = 0; i < k && this.animals.length < this.maxAnimals; i++) {
        this.spawn(speciesId);
        born++;
      }
    }
    this.stats.born += born;
    return born;
  }

  /* ---------------- queries ---------------- */

  _rebuildGrid() {
    this._grid.clear();
    const inv = 1 / this._gridCellM;
    for (const a of this.animals) {
      if (!a.alive) continue;
      const key = (Math.floor(a.x * inv) * 73856093) ^ (Math.floor(a.z * inv) * 19349663);
      let cell = this._grid.get(key);
      if (!cell) { cell = []; this._grid.set(key, cell); }
      cell.push(a);
    }
  }

  near(x, z, radiusM, filter = null) {
    const r2 = radiusM * radiusM;
    const inv = 1 / this._gridCellM;
    const span = Math.ceil(radiusM * inv);
    const cx = Math.floor(x * inv), cz = Math.floor(z * inv);
    // A very wide query is cheaper as a linear scan than as a few hundred
    // bucket lookups, so fall back for those.
    if (this._grid.size === 0 || span > 8) {
      return this.animals.filter((a) => {
        if (!a.alive) return false;
        if (filter && !filter(a)) return false;
        const dx = a.x - x, dz = a.z - z;
        return dx * dx + dz * dz <= r2;
      });
    }
    const out = [];
    for (let gz = cz - span; gz <= cz + span; gz++) {
      for (let gx = cx - span; gx <= cx + span; gx++) {
        const cell = this._grid.get((gx * 73856093) ^ (gz * 19349663));
        if (!cell) continue;
        for (const a of cell) {
          if (!a.alive) continue;
          if (filter && !filter(a)) continue;
          const dx = a.x - x, dz = a.z - z;
          if (dx * dx + dz * dz <= r2) out.push(a);
        }
      }
    }
    return out;
  }

  carcassesNear(x, z, radiusM) {
    const r2 = radiusM * radiusM;
    return this.carcasses.filter((c) => {
      const dx = c.x - x, dz = c.z - z;
      return dx * dx + dz * dz <= r2;
    });
  }

  census() {
    const out = {};
    for (const a of this.animals) out[a.speciesId] = (out[a.speciesId] || 0) + 1;
    return out;
  }
}

/* A plausible island community. Prey vastly outnumber predators, small
   animals outnumber large ones, and the totals land on the 500 budget. */
Ecology.DEFAULT_MIX = {
  cottontailRabbit: 95, graySquirrel: 85, whitetailDeer: 70, muleDeer: 26,
  wildTurkey: 34, mallardDuck: 30, canadaGoose: 18, raccoon: 26, opossum: 16,
  cattle: 34, horse: 10, wildBoar: 20, elk: 12,
  coyote: 14, redFox: 10, grayWolf: 9, bobcat: 6, blackBear: 6,
  grizzlyBear: 3, cougar: 2,
};
