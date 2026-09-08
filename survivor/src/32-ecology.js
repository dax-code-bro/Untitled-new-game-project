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
  }

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
    this.stats = { active: 0, nearby: 0, distant: 0, born: 0, died: 0, killed: 0 };
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

    for (const z of this.zones) z.step(days, ctx.seasonGrowth != null ? ctx.seasonGrowth : 1);

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

    this._scavenge(days);
    this._predate(days);
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

  _zoneAt(x, z) {
    for (const zn of this.zones) if (zn.contains(x, z)) return zn;
    return null;
  }

  /* Full behaviour, near the player. */
  _stepActive(a, dt, ctx) {
    this._advanceNeeds(a, dt, ctx);
    if (!a.alive) return;

    const px = ctx.playerX || 0, pz = ctx.playerZ || 0;
    const dx = a.x - px, dz = a.z - pz;
    const dist = Math.hypot(dx, dz);

    const chance = a.detectionChance(dx, dz, ctx);
    // Awareness builds and decays rather than flipping, so an animal gets
    // nervous, looks up, and gives you a moment to freeze — which is the
    // moment the whole hunt turns on.
    a.awareOfPlayer = clamp01(a.awareOfPlayer + (chance - 0.25) * dt * 0.9);

    const s = a.species;
    if (a.awareOfPlayer > 0.75 && dist < s.flightDistanceM) {
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
    for (const z of this.zones) {
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

  _chooseIdleBehaviour(a, ctx) {
    const hour = ctx.hourOfDay != null ? ctx.hourOfDay : 12;
    const active = this._isActiveHour(a.species.activity, hour);
    if (a.thirst > 0.7) {
      const water = this.zones.find((z) => z.water);
      if (water) {
        a.behaviour = BEHAVIOUR.drinking;
        a.targetX = water.x; a.targetZ = water.z;
        if (Math.hypot(a.x - water.x, a.z - water.z) < water.radiusM) a.thirst = Math.max(0, a.thirst - 0.02);
        return;
      }
    }
    if (!active) { a.behaviour = BEHAVIOUR.bedded; return; }
    if (a.hunger > 0.3) {
      const zone = this._zoneAt(a.x, a.z);
      const types = DIET_FORAGE[a.species.diet] || [];
      const hasFood = zone && types.some((t) => (zone.stock[t] || 0) > 1);
      if (hasFood) {
        a.behaviour = a.species.diet === DIET.grazer ? BEHAVIOUR.grazing : BEHAVIOUR.browsing;
        return;
      }
      const target = this._bestZoneFor(a);
      if (target) { a.behaviour = BEHAVIOUR.travelling; a.targetX = target.x; a.targetZ = target.z; return; }
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
    for (const a of this.animals) {
      if (!a.alive) continue;
      const s = a.species;
      if (!s.scavenges && s.diet !== DIET.carnivore && s.diet !== DIET.omnivore
        && s.diet !== DIET.scavenger) continue;
      for (const c of this.carcasses) {
        if (c.skeletal) continue;
        const d = Math.hypot(a.x - c.x, a.z - c.z);
        if (d > c.scentRadiusM) continue;
        c.scavengersOnIt++;
        if (d < 40) {
          a.behaviour = BEHAVIOUR.scavenging;
          const ate = Math.min(c.meatRemainingKg, a.dailyForageKg * days * 2);
          c.meatRemainingKg -= ate;
          a.energyKcal = Math.min(a.maxEnergyKcal, a.energyKcal + ate * 2200);
        } else if (d < c.scentRadiusM) {
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
    animal.behaviour = animal.species.dangerous && (animal.species.aggression || 0) > 0.3
      ? BEHAVIOUR.chasing : BEHAVIOUR.fleeing;
    const away = opts.fromX != null
      ? Math.atan2(animal.x - opts.fromX, animal.z - opts.fromZ) : this.rng() * Math.PI * 2;
    // A mortally hit deer typically covers 50-200 m before it drops. That
    // distance, and the blood on the way, is the trail.
    const runM = lerpN(400, 40, clamp01(severity)) * (0.6 + this.rng() * 0.8);
    animal.targetX = animal.x + Math.sin(away) * runM;
    animal.targetZ = animal.z + Math.cos(away) * runM;
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

  near(x, z, radiusM, filter = null) {
    const r2 = radiusM * radiusM;
    return this.animals.filter((a) => {
      if (!a.alive) return false;
      if (filter && !filter(a)) return false;
      const dx = a.x - x, dz = a.z - z;
      return dx * dx + dz * dz <= r2;
    });
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
