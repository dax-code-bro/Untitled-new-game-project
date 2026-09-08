/* ============================================================
   THE WORLD — one island, one save, and for most players one life.

   This is the layer that owns everything else and steps it on one
   clock. Its job is mostly bookkeeping, but two of its rules are
   the game:

   Nothing regenerates. A house that has been emptied stays empty, a
   wall that has been breached stays breached, a deer that has been
   shot is a carcass and then bones and then nothing. The world is
   saved rather than rebuilt, so a seed produces the same island
   forever and the island only ever gets more used.

   And one life per world in multiplayer. When a character dies on a
   server, that account can rejoin only as a spectator — they can
   watch, and that is all. Singleplayer gets unlimited lives, an
   optional creative mode and an optional keep-inventory, because a
   single-player world is somewhere to learn the island.
   ============================================================ */

const GAME_MODE = {
  singleplayer: 'singleplayer',
  multiplayer: 'multiplayer',      // one life, then spectate
  creative: 'creative',
};

/* Carrying things. Volume matters as much as mass — you run out of pack
   long before you run out of back, and a deer quarter is both. */
class Inventory {
  constructor(opts = {}) {
    this.slots = [];
    this.capacityKg = opts.capacityKg != null ? opts.capacityKg : 28;
    this.capacityL = opts.capacityL != null ? opts.capacityL : 55;
    this.equipped = { primary: null, sidearm: null, tool: null, pack: null, clothing: [] };
  }

  get massKg() { return this.slots.reduce((a, s) => a + (s.massKg || 0) * (s.quantity || 1), 0); }
  get volumeL() { return this.slots.reduce((a, s) => a + (s.volumeL || 0) * (s.quantity || 1), 0); }
  get overweight() { return Math.max(0, this.massKg - this.capacityKg); }

  add(item) {
    if (this.volumeL + (item.volumeL || 0) > this.capacityL) {
      return { ok: false, reason: 'no room in the pack' };
    }
    // Over the mass limit you can still pick it up — you just cannot move
    // well, which the Pandolf term in the physiology handles for free.
    const stack = this.slots.find((s) => s.item === item.item && s.stackable && s.condition === item.condition);
    if (stack) stack.quantity += item.quantity || 1;
    else this.slots.push(Object.assign({ quantity: 1 }, item));
    return { ok: true, overweight: this.overweight };
  }

  remove(itemId, quantity = 1) {
    const i = this.slots.findIndex((s) => s.item === itemId);
    if (i < 0) return null;
    const s = this.slots[i];
    const taken = Math.min(s.quantity, quantity);
    s.quantity -= taken;
    if (s.quantity <= 0) this.slots.splice(i, 1);
    return Object.assign({}, s, { quantity: taken });
  }

  has(itemId, quantity = 1) {
    const s = this.slots.find((x) => x.item === itemId);
    return !!s && s.quantity >= quantity;
  }

  /* What the pack is doing to you: the load the physiology model charges
     you for, and the volume that decides what else fits. */
  loadKg() {
    let m = this.massKg;
    for (const k of ['primary', 'sidearm', 'tool']) {
      if (this.equipped[k] && this.equipped[k].massKg) m += this.equipped[k].massKg;
    }
    return m;
  }
}


class Player {
  constructor(opts = {}) {
    this.id = opts.id || 'player';
    this.name = opts.name || 'survivor';
    this.body = new Physiology(opts.body || {});
    this.disease = new DiseaseSystem({ rng: opts.rng });
    this.injury = new InjurySystem({ rng: opts.rng });
    this.inventory = new Inventory(opts.inventory || {});

    this.x = opts.x || 0; this.y = opts.y || 0; this.z = opts.z || 0;
    this.headingRad = 0;
    this.speedMs = 0;
    this.stance = 'standing';        // standing | crouched | prone | swimming
    this.alive = true;
    this.spectating = false;
    this.deaths = 0;

    /* Skills that improve by doing, because a survival game where you are
       equally good at everything on day one has nothing to teach. */
    this.skills = {
      shooting: 0.15, hunting: 0.1, tracking: 0.1, fishing: 0.1, butchering: 0.1,
      cooking: 0.15, medicine: 0.1, carpentry: 0.1, electrical: 0.05,
      welding: 0.0, gunsmithing: 0.05, foraging: 0.1, navigation: 0.15,
    };
    this.knowledge = { diagnosed: [], pathogensSeen: [], poisFound: [], recipesKnown: [] };
    this.noise = 0;
    this.concealment = 0;
    this.scentStrength = 1;
  }

  practise(skill, amount) {
    if (this.skills[skill] == null) return;
    // Diminishing returns, so the first hour teaches more than the hundredth.
    this.skills[skill] = clamp01(this.skills[skill] + amount * (1 - this.skills[skill]) * 0.9);
  }

  /* Everything acting on the player's ability to do anything, multiplied
     together. Each factor is owned by the system that knows about it. */
  capacity() {
    return this.body.status().capacity
      * this.disease.capacityMultiplier()
      * this.injury.capacityMultiplier()
      * (1 - 0.5 * clamp01(this.inventory.overweight / 25));
  }

  die(cause) {
    this.alive = false;
    this.causeOfDeath = cause;
    this.deaths++;
    return cause;
  }
}


class World {
  constructor(opts = {}) {
    this.seed = opts.seed != null ? opts.seed : ISLAND_DEFAULTS.seed;
    this.mode = opts.mode || GAME_MODE.singleplayer;
    this.keepInventory = !!opts.keepInventory;
    this.creativeAllowed = this.mode !== GAME_MODE.multiplayer;
    this.creative = false;

    let s = (this.seed ^ 0x2545f491) >>> 0;
    this.rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

    this.generated = false;
    this.players = new Map();
    this.deadAccounts = new Set();     // multiplayer: one life, then spectate
    this.log = [];
    this.realElapsed = 0;
  }

  /* Build the island. Reports progress because on a full-size map this is a
     few seconds of real work and a silent freeze is not acceptable. */
  generate(opts = {}, onProgress = null) {
    const report = (pct, what) => { if (onProgress) onProgress(pct, what); };

    report(0.02, 'raising the island');
    const gen = generateIsland(Object.assign({ seed: this.seed }, opts.island));
    this.map = gen.map;
    this.islandOpts = gen.opts;
    this.worldSizeM = gen.opts.worldSizeM;

    report(0.45, 'reading the drainage');
    this.classified = classifyTerrain(this.map, { seaLevelM: gen.opts.seaLevelM });
    this.rivers = traceRivers(this.map, { seaLevelM: gen.opts.seaLevelM });

    report(0.58, 'siting the settlements');
    this.pois = siteAll(this.map, this.classified, { rng: this.rng });

    report(0.66, 'building');
    for (const poi of this.pois) buildPoi(poi, this.map, { rng: this.rng });

    report(0.80, 'stocking the water');
    this.clock = new WorldClock(Object.assign({
      rng: this.rng,
      latitudeDeg: opts.latitudeDeg != null ? opts.latitudeDeg : 30.3,
    }, opts.clock));

    this.fishery = new Fishery({ rng: this.rng, maxFish: opts.maxFish != null ? opts.maxFish : 200 });
    this._placeWater();

    report(0.88, 'letting the animals in');
    this.ecology = new Ecology({
      rng: this.rng,
      maxAnimals: opts.maxAnimals != null ? opts.maxAnimals : 500,
      worldSizeM: this.worldSizeM,
      terrain: {
        heightAt: (x, z) => this.map.heightAtWorld(x, z),
        slopeAt: (x, z) => this.map.slopeAtWorld(x, z),
      },
    });
    this._placeFeedingZones();
    this.ecology.populate(opts.animalMix);
    this.fishery.populate();

    report(0.97, 'winding the clock');
    this.electrical = new ElectricalSystem();
    this.generated = true;
    report(1, 'ready');
    return this;
  }

  /* Feeding zones follow the biomes: the meadows carry grass, the woodland
     carries browse and mast, the marsh and the rivers carry water. So the
     animals end up where their food is because the map says so. */
  _placeFeedingZones() {
    const S = this.map.size;
    const step = Math.max(6, Math.floor(S / 46));
    for (let r = step; r < S - step; r += step) {
      for (let c = step; c < S - step; c += step) {
        const b = this.classified.at(c, r);
        if (!b || b.id === 'ocean' || b.id === 'cliff') continue;
        const x = (c / (S - 1) - 0.5) * this.worldSizeM;
        const z = (r / (S - 1) - 0.5) * this.worldSizeM;
        if ((b.grass || 0) + (b.browse || 0) + (b.mast || 0) === 0 && !b.water) continue;
        this.ecology.addZone({
          x, z, radiusM: step * this.map.cellM * 0.62, biome: b.id,
          grass: b.grass || 0, browse: b.browse || 0, mast: b.mast || 0,
          water: !!b.water, cover: b.cover != null ? b.cover : 0.3,
        });
      }
    }
    // The prairie is the cattle's, explicitly.
    const prairie = this.pois.find((p) => p.kind === POI_KIND.prairie);
    if (prairie && prairie.pasture) {
      this.ecology.addZone({
        x: prairie.pasture.x, z: prairie.pasture.z, radiusM: prairie.pasture.radiusM,
        biome: 'prairie', grass: 1.0, browse: 0.1, mast: 0, water: true, cover: 0.1,
      });
    }
    return this.ecology;
  }

  _placeWater() {
    // The sea, first and biggest.
    this.fishery.addBody({
      name: 'the sea', kind: 'salt', x: 0, z: this.worldSizeM * 0.42,
      radiusM: this.worldSizeM * 0.22, maxDepthM: 40, tempC: 20, structure: ['surf', 'open', 'sand'],
    });

    /* River mouths and creek reaches, one per river — but rivers that were
       traced from neighbouring sources converge and reach the sea together,
       so anything within a few hundred metres of a body already placed is
       the same piece of water and is skipped. Without this the fishery ends
       up with eight identical estuaries stacked on one beach. */
    const farFromExisting = (x, z, minM) =>
      !this.fishery.bodies.some((b) => Math.hypot(b.x - x, b.z - z) < minM);

    let mouths = 0, creeks = 0;
    for (const rv of this.rivers) {
      if (!rv.reachesSea) continue;
      const mouth = rv.path[rv.path.length - 1];
      if (farFromExisting(mouth.x, mouth.z, 320)) {
        mouths++;
        this.fishery.addBody({
          name: mouths === 1 ? 'the river mouth' : `river mouth ${mouths}`,
          kind: 'brackish', x: mouth.x, z: mouth.z,
          radiusM: 90, maxDepthM: 5, tempC: 19, structure: ['current', 'estuary', 'rocks'],
        });
      }
      const upstream = rv.path[Math.floor(rv.path.length * 0.35)];
      if (upstream && farFromExisting(upstream.x, upstream.z, 400)) {
        creeks++;
        this.fishery.addBody({
          name: creeks === 1 ? 'the creek' : `creek ${creeks}`,
          kind: 'fresh', x: upstream.x, z: upstream.z,
          radiusM: 55, maxDepthM: 2.2, tempC: 13, flowing: true, spring: upstream.y > 90,
          structure: ['riffles', 'current', 'undercuts', 'springs'],
        });
      }
    }

    /* Standing water where the drainage collects on flat ground. These are
       the lakes and ponds, and they are where the terrain says they are
       rather than where somebody drew them. */
    const S = this.map.size;
    let peakFlow = 0;
    for (let i = 0; i < this.map.water.length; i++) if (this.map.water[i] > peakFlow) peakFlow = this.map.water[i];
    const candidates = [];
    for (let r = 8; r < S - 8; r += 5) {
      for (let c = 8; c < S - 8; c += 5) {
        const i = r * S + c;
        if (this.map.height[i] < 3) continue;
        if (this.map.water[i] < peakFlow * 0.25) continue;
        const x = (c / (S - 1) - 0.5) * this.worldSizeM;
        const z = (r / (S - 1) - 0.5) * this.worldSizeM;
        if (this.map.slopeAtWorld(x, z) > 4) continue;
        candidates.push({ x, z, flow: this.map.water[i], y: this.map.height[i] });
      }
    }
    candidates.sort((a, b) => b.flow - a.flow);
    const placed = [];
    for (const cand of candidates) {
      if (placed.length >= 4) break;
      if (placed.some((p) => Math.hypot(p.x - cand.x, p.z - cand.z) < 500)) continue;
      if (this.fishery.bodies.some((b) => Math.hypot(b.x - cand.x, b.z - cand.z) < 300)) continue;
      placed.push(cand);
      this.fishery.addBody({
        name: placed.length === 1 ? 'the lake' : 'a pond',
        kind: 'fresh', x: cand.x, z: cand.z,
        radiusM: placed.length === 1 ? 220 : 70,
        maxDepthM: placed.length === 1 ? 11 : 3.5,
        tempC: 18, structure: ['weeds', 'timber', 'docks', 'flats'],
      });
    }
    return this.fishery;
  }

  /* ---------------- players ---------------- */

  join(accountId, opts = {}) {
    /* The rule the design asks for: on a multiplayer server, a dead
       character is dead. The account can come back and watch. */
    if (this.mode === GAME_MODE.multiplayer && this.deadAccounts.has(accountId)) {
      return {
        ok: true, spectator: true,
        message: 'You died in this world. You can watch.',
      };
    }
    const spawn = opts.spawn || this.chooseSpawn(opts.side);
    const p = new Player({
      id: accountId, name: opts.name, rng: this.rng,
      x: spawn.x, y: spawn.y, z: spawn.z,
    });
    this.players.set(accountId, p);
    this.logEvent(`${p.name} arrived on the ${spawn.side} shore`);
    return { ok: true, spectator: false, player: p, spawn };
  }

  /* The design asks that you can start on the north, east, west or south of
     the island. Each is a real beach found on the actual coastline rather
     than a fixed coordinate, and each starts you somewhere different in
     relation to everything else. */
  chooseSpawn(side) {
    const sides = ['north', 'east', 'south', 'west'];
    const chosen = sides.includes(side) ? side : sides[(this.rng() * 4) | 0];
    const dir = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[chosen];
    const half = this.worldSizeM * 0.5;

    // Walk in from the edge until the ground comes out of the water.
    let best = null;
    for (let lateral = -0.32; lateral <= 0.32; lateral += 0.04) {
      const ox = dir[0] !== 0 ? dir[0] * half * 0.98 : lateral * this.worldSizeM;
      const oz = dir[1] !== 0 ? dir[1] * half * 0.98 : lateral * this.worldSizeM;
      for (let t = 0; t < 0.9; t += 0.01) {
        const x = ox * (1 - t), z = oz * (1 - t);
        const h = this.map.heightAtWorld(x, z);
        if (h > 1.2 && this.map.slopeAtWorld(x, z) < 12) {
          if (!best || h < best.y) best = { x, y: h, z, side: chosen };
          break;
        }
      }
    }
    return best || { x: 0, y: this.map.heightAtWorld(0, 0), z: 0, side: chosen };
  }

  killPlayer(accountId, cause) {
    const p = this.players.get(accountId);
    if (!p) return null;
    p.die(cause);
    this.logEvent(`${p.name} died of ${cause}`);

    if (this.mode === GAME_MODE.multiplayer) {
      // One life. The body stays where it fell, with everything on it.
      this.deadAccounts.add(accountId);
      this.dropCorpse(p);
      this.players.delete(accountId);
      return { permanent: true, spectator: true, cause };
    }

    if (!this.keepInventory) this.dropCorpse(p);
    const spawn = this.chooseSpawn();
    const fresh = new Player({ id: accountId, name: p.name, rng: this.rng, x: spawn.x, y: spawn.y, z: spawn.z });
    fresh.deaths = p.deaths;
    // Knowledge survives death even when the gear does not — what you
    // learned about the island is not in your pockets.
    fresh.knowledge = p.knowledge;
    fresh.skills = p.skills;
    if (this.keepInventory) fresh.inventory = p.inventory;
    this.players.set(accountId, fresh);
    return { permanent: false, spectator: false, cause, respawn: spawn };
  }

  /* A dead player's gear stays on the island, exactly where they died, for
     as long as the world lasts. Nothing regenerates and nothing evaporates. */
  dropCorpse(player) {
    const corpse = {
      kind: 'corpse', name: player.name, x: player.x, y: player.y, z: player.z,
      diedAt: this.clock ? this.clock.totalDays : 0,
      contents: player.inventory.slots.slice(),
      equipped: Object.assign({}, player.inventory.equipped),
    };
    this.corpses = this.corpses || [];
    this.corpses.push(corpse);
    return corpse;
  }

  /* Non-lethal outcomes. The design asks that a kill in multiplayer can
     leave someone unconscious for anything from three game-minutes to a
     whole game-day, and that duration comes from how hard they were hit. */
  knockOut(accountId, energyJ) {
    const p = this.players.get(accountId);
    if (!p) return null;
    const dayS = this.clock ? this.clock.dayLengthRealS * this.clock.timeScale : 86400;
    const now = this.clock ? this.clock.totalDays * 86400 + this.clock.simSeconds : 0;
    const hit = p.injury.headImpact(energyJ, dayS, now);
    if (!hit) return null;
    this.logEvent(`${p.name} was knocked out (${hit.severity})`);
    return {
      severity: hit.severity,
      gameSeconds: hit.seconds,
      gameMinutes: hit.seconds / 60,
      // While they are down they are exactly as helpless as that sounds.
      lootable: true,
    };
  }

  /* ---------------- the tick ---------------- */

  step(realSeconds) {
    if (!this.generated) return this;
    this.realElapsed += realSeconds;
    const simSeconds = this.clock.tick(realSeconds);
    const env = this.clock.environment();

    const anyPlayer = this.players.values().next().value;
    const px = anyPlayer ? anyPlayer.x : 0;
    const pz = anyPlayer ? anyPlayer.z : 0;
    const now = this.clock.totalDays * 86400 + this.clock.simSeconds;

    /* The ecology runs on its own tick rather than once per rendered frame.
       A deer does not re-decide what it is doing sixty times a second, and
       the difference between deciding at 10 Hz and at 60 Hz is invisible —
       whereas the difference in cost is six-fold, and it is the largest
       single item in the frame. Each tick is handed the whole interval since
       the last one, so nothing is skipped, only batched.

       Fish are slower still: their world changes on the timescale of the
       thermocline, so once a second is generous. */
    this._ecoAccum = (this._ecoAccum || 0) + simSeconds;
    if (this._ecoAccum >= this.clock.timeScale * 0.1) {
      this.ecology.step(this._ecoAccum, Object.assign({ playerX: px, playerZ: pz, now }, env));
      this._ecoAccum = 0;
    }
    this._fishAccum = (this._fishAccum || 0) + simSeconds;
    if (this._fishAccum >= this.clock.timeScale) {
      this.fishery.step(this._fishAccum, env);
      this._fishAccum = 0;
    }
    this.electrical.step(realSeconds, {
      airTempC: env.airTempC, cloudCover: env.cloudCover,
      sunAltitudeDeg: env.sun.altitudeDeg,
    });

    // Breeding is checked once a game-day rather than every step.
    this._breedAccum = (this._breedAccum || 0) + simSeconds / 86400;
    if (this._breedAccum >= 1) {
      this.ecology.breedingStep(this._breedAccum);
      this._breedAccum = 0;
    }

    for (const [id, p] of this.players) {
      if (!p.alive) continue;
      this.stepPlayer(p, simSeconds, env, id);
    }
    return this;
  }

  stepPlayer(p, simSeconds, env, accountId) {
    const days = simSeconds / 86400;
    const altitudeM = Math.max(0, this.map.heightAtWorld(p.x, p.z));
    const biome = this._biomeAt(p.x, p.z);

    /* Weather reports wind at the standard ten metres. What a person
       standing in a meadow actually feels is far less, and what they feel
       inside a wood is less again — the logarithmic wind profile over a
       surface of roughness z0 is the standard relation, and getting it
       wrong systematically over-cools every character in the game because
       convective heat loss scales with the six-tenths power of wind speed. */
    const roughness = biome && (biome.id === 'deepForest' || biome.id === 'pineForest') ? 1.0
      : biome && biome.id === 'woodland' ? 0.5
      : biome && (biome.id === 'scrub' || biome.id === 'prairie') ? 0.1
      : biome && biome.id === 'beach' ? 0.005
      : 0.03;                                    // short grass
    const windAtHead = env.windMs
      * (Math.log(1.6 / roughness) / Math.log(10 / roughness));
    const sheltered = p.sheltered ? 0.15 : 1;

    const playerEnv = Object.assign({}, env, {
      altitudeM,
      windMs: Math.max(0.2, windAtHead * sheltered),
      airTempC: env.airTempC - altitudeM * 0.0065,
      speedMs: p.speedMs,
      gradePercent: p.gradePercent || 0,
      loadKg: p.inventory.loadKg(),
      terrainFactor: biome && biome.terrainFactor ? biome.terrainFactor : 1.2,
      inWater: p.stance === 'swimming',
      waterTempC: 18,
      extraWatts: p.extraWatts || 0,
    });

    p.body.step(simSeconds, playerEnv);
    p.injury.step(simSeconds, p.body, p.disease);
    const killedBy = p.disease.step(days, p.body);

    // Rain and rivers get you wet, which costs you heat and rusts the rifle.
    if (env.precipitation > 0.5 && !p.sheltered) p.body.wet = clamp01(p.body.wet + days * 6);
    else p.body.wet = clamp01(p.body.wet - days * 3);
    if (p.stance === 'swimming') p.body.wet = 1;

    /* Trench foot is a real risk on this island and follows directly from
       being wet and cold for days rather than from a random roll. */
    if (p.body.wet > 0.6 && playerEnv.airTempC < 12) {
      p.wetFeetDays = (p.wetFeetDays || 0) + days;
      if (p.wetFeetDays > 0.5) {
        p.disease.expose(VECTOR.coldWetFeet, { hygiene: p.drySocks ? 0.9 : 0, load: p.wetFeetDays });
        p.wetFeetDays = 0;
      }
    } else p.wetFeetDays = Math.max(0, (p.wetFeetDays || 0) - days * 2);

    if (!p.body.alive) {
      this.killPlayer(accountId, p.body.causeOfDeath);
    } else if (killedBy) {
      this.killPlayer(accountId, killedBy);
    }
    return p;
  }

  _biomeAt(x, z) {
    const S = this.map.size;
    const c = clampTo(Math.round((x / this.worldSizeM + 0.5) * (S - 1)), 0, S - 1);
    const r = clampTo(Math.round((z / this.worldSizeM + 0.5) * (S - 1)), 0, S - 1);
    return this.classified.at(c, r);
  }

  logEvent(text) {
    this.log.push({ day: this.clock ? this.clock.totalDays : 0, text });
    if (this.log.length > 500) this.log.shift();
    return text;
  }

  /* ---------------- persistence ----------------

     The world is saved, never regenerated. The terrain comes back from the
     seed because it is deterministic; everything the players changed comes
     back from this record, because it cannot be derived from anything. */
  serialize() {
    return {
      version: 1,
      seed: this.seed,
      mode: this.mode,
      keepInventory: this.keepInventory,
      clock: this.clock.serialize(),
      deadAccounts: Array.from(this.deadAccounts),
      corpses: this.corpses || [],
      log: this.log.slice(-120),
      // Only what has changed from the generated state. A world where
      // nothing has happened saves in a few kilobytes.
      changes: {
        emptiedRooms: this._emptiedRooms || [],
        breachedWalls: this._breachedWalls || [],
        takenAnimals: this.ecology.stats.killed,
        builtStructures: this._built || [],
      },
      players: Array.from(this.players.entries()).map(([id, p]) => ({
        id, name: p.name, x: p.x, y: p.y, z: p.z,
        skills: p.skills, knowledge: p.knowledge, deaths: p.deaths,
        inventory: p.inventory.slots,
        body: {
          bodyWaterL: p.body.bodyWaterL, glycogenKcal: p.body.glycogenKcal,
          fatMassKg: p.body.fatMassKg, leanMassKg: p.body.leanMassKg,
          coreTempC: p.body.coreTempC, sleepPressure: p.body.sleepPressure,
          bladderMl: p.body.bladderMl, bowelKg: p.body.bowelKg,
          bloodVolumeL: p.body.bloodVolumeL, elapsedH: p.body.elapsedH,
        },
        disease: p.disease.serialize(),
      })),
    };
  }

  /* `opts` takes the same shape generate() does, so a world is restored with
     the settings it was made with. Passing the island options in directly
     silently fell back to the defaults and rebuilt a different island under
     the same save — the one failure mode a persistent world cannot have. */
  static restore(data, opts = {}, onProgress = null) {
    const w = new World({ seed: data.seed, mode: data.mode, keepInventory: data.keepInventory });
    w.generate(opts, onProgress || opts.onProgress);
    w.clock.restore(data.clock);
    w.deadAccounts = new Set(data.deadAccounts || []);
    w.corpses = data.corpses || [];
    w.log = data.log || [];
    for (const rec of data.players || []) {
      const p = new Player({ id: rec.id, name: rec.name, rng: w.rng, x: rec.x, y: rec.y, z: rec.z });
      Object.assign(p.body, rec.body);
      p.disease = DiseaseSystem.deserialize(rec.disease, { rng: w.rng });
      p.skills = rec.skills;
      p.knowledge = rec.knowledge;
      p.deaths = rec.deaths;
      p.inventory.slots = rec.inventory || [];
      w.players.set(rec.id, p);
    }
    return w;
  }

  /* A summary for the loading screen and for anyone checking the world is
     what it should be. */
  describe() {
    const census = this.ecology.census();
    return {
      seed: this.seed,
      sizeKm: this.worldSizeM / 1000,
      elevation: this.map.bounds(),
      pois: this.pois.map((p) => ({
        kind: p.kind, name: p.name, x: Math.round(p.x), z: Math.round(p.z),
        buildings: p.buildings ? p.buildings.length : 0, blurb: p.blurb,
      })),
      rivers: this.rivers.length,
      waterBodies: this.fishery.bodies.map((b) => b.name),
      animals: this.ecology.animals.length,
      species: Object.keys(census).length,
      fish: this.fishery.fish.length,
      feedingZones: this.ecology.zones.length,
    };
  }
}
