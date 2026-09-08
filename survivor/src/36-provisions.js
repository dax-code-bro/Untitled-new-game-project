/* ============================================================
   PROVISIONS — cooking, water treatment, fire and spoilage.

   These sit in the simulation rather than in the game's UI layer
   because they are the inputs the physiology and disease models
   already expect. Whether a piece of bear meat still carries
   trichinella is not a cosmetic property of a menu item; it is a
   temperature-and-time question with a published answer, and the
   answer decides whether the player gets ill three weeks later.

   The same goes for water. The disease table already says that
   Cryptosporidium survives chlorine and that only boiling or a
   fine filter removes it. This file is where that gets honoured,
   so a player who chlorinates creek water is protected against
   exactly the things chlorine protects against and no others.
   ============================================================ */

const FOOD_STATE = {
  raw: 'raw', cooking: 'cooking', cooked: 'cooked', burnt: 'burnt',
  dried: 'dried', smoked: 'smoked', spoiled: 'spoiled',
};

/* Core temperature and hold time to make meat safe, from food-safety
   guidance. The point of separating them is that a fierce fire chars the
   outside long before the middle is safe, which is exactly how people give
   themselves trichinellosis from a seared bear steak. */
const SAFE_CORE = {
  // Whole-muscle beef and game: 63 C with a rest, or 71 C instantly.
  muscle: { tempC: 71, holdS: 15 },
  // Ground or minced anything mixes surface bacteria through the middle.
  ground: { tempC: 71, holdS: 30 },
  // Poultry carries salmonella deeper.
  bird: { tempC: 74, holdS: 15 },
  // Trichinella cysts die at 71 C. Freezing does not reliably kill the
  // species found in bear, which is why the disease table hangs
  // trichinellosis off bear specifically.
  bear: { tempC: 71, holdS: 60 },
  pork: { tempC: 71, holdS: 30 },
  fish: { tempC: 63, holdS: 15 },
};

/* A fire's useful output. A small campfire runs a few kilowatts of which
   only a fraction reaches you as radiation, and it falls off with the square
   of the distance — which is why one side of you roasts while the other
   stays cold, and why a reflector wall is worth building. */
const FIRE_KIND = {
  tinderBundle: { name: 'tinder bundle', kW: 1.5, burnKgPerHour: 0.4, radius: 1.2 },
  campfire: { name: 'campfire', kW: 12, burnKgPerHour: 2.2, radius: 3.5 },
  cookFire: { name: 'cooking fire', kW: 8, burnKgPerHour: 1.6, radius: 2.6 },
  longFire: { name: 'long fire', kW: 22, burnKgPerHour: 4.5, radius: 5.0 },
  woodStove: { name: 'wood stove', kW: 9, burnKgPerHour: 1.4, radius: 6.0, enclosed: true },
  forge: { name: 'forge', kW: 30, burnKgPerHour: 5.0, radius: 2.0, maxTempC: 1300 },
};


class Fire {
  constructor(opts = {}) {
    const kind = FIRE_KIND[opts.kind] || FIRE_KIND.campfire;
    this.kind = kind;
    this.kindId = opts.kind || 'campfire';
    this.x = opts.x || 0; this.y = opts.y || 0; this.z = opts.z || 0;
    this.fuelKg = opts.fuelKg || 0;
    this.lit = false;
    this.ageS = 0;
    this.flameTempC = 0;
    this.sheltered = !!opts.sheltered;
  }

  /* Lighting a fire is a skill check against the conditions, not a button.
     Wet tinder in a wind with a bow drill is genuinely hard; a lighter and
     dry birch bark is not. */
  tryLight(opts = {}) {
    if (this.lit) return { ok: true, already: true };
    if (this.fuelKg < 0.2) return { ok: false, reason: 'nothing to burn' };
    const method = opts.method || 'bowDrill';
    const base = { lighter: 0.97, matches: 0.85, ferroRod: 0.7, flintSteel: 0.45, bowDrill: 0.22 }[method] || 0.2;
    const skill = clamp01(opts.skill != null ? opts.skill : 0.2);
    const wet = clamp01(opts.tinderWet != null ? opts.tinderWet : 0);
    const wind = opts.windMs || 0;
    const rain = opts.precipitation || 0;

    let p = base * (0.45 + 0.75 * skill);
    p *= 1 - 0.85 * wet;                       // wet tinder is most of the battle
    p *= this.sheltered ? 1 : (1 - clamp01(wind / 14) * 0.5 - clamp01(rain / 8) * 0.6);
    p = clamp01(p);
    const rng = opts.rng || Math.random;
    if (rng() > p) return { ok: false, reason: 'it will not catch', chance: p };
    this.lit = true;
    this.ageS = 0;
    return { ok: true, chance: p };
  }

  addFuel(kg) { this.fuelKg += kg; return this.fuelKg; }

  step(dt, env = {}) {
    if (!this.lit) { this.flameTempC = 0; return this; }
    this.ageS += dt;
    // Wind and rain both cost fuel: one fans it, the other fights it.
    const exposure = this.sheltered ? 1
      : 1 + clamp01((env.windMs || 0) / 12) * 0.5 + clamp01((env.precipitation || 0) / 10) * 0.8;
    const burn = (this.kind.burnKgPerHour / 3600) * dt * exposure;
    this.fuelKg = Math.max(0, this.fuelKg - burn);
    if (this.fuelKg <= 0) { this.lit = false; this.flameTempC = 0; return this; }
    if (!this.sheltered && (env.precipitation || 0) > 14 && Math.random() < dt / 60) {
      this.lit = false;                       // heavy rain eventually wins
      return this;
    }
    // A fire's flame runs far hotter than anything you cook over it, and the
    // useful cooking temperature is the bed of embers, which takes time.
    const settled = clamp01(this.ageS / 600);
    this.flameTempC = this.kind.maxTempC || (450 + 350 * settled);
    return this;
  }

  /* Radiant heat reaching a point, in watts. Inverse-square from the fire,
     with the emitted fraction of the total output that actually radiates.
     This goes straight into the physiology as `radiantWatts`, which is why
     sitting by a fire genuinely warms you rather than setting a flag. */
  radiantWattsAt(x, z, opts = {}) {
    if (!this.lit) return 0;
    const d = Math.max(0.4, Math.hypot(x - this.x, z - this.z));
    if (d > this.kind.radius * 4) return 0;
    // Roughly a fifth of a wood fire's output leaves as radiation; the rest
    // goes up the column as hot gas.
    const radiated = this.kind.kW * 1000 * 0.2;
    // A person intercepts about half a square metre of it, facing the fire.
    const intercepted = (radiated / (4 * Math.PI * d * d)) * 0.55;
    // An enclosed stove heats the room instead of the person in front of it.
    return this.kind.enclosed ? Math.min(intercepted * 0.4 + 60, 220) : intercepted;
  }

  cookingTempC() { return this.lit ? this.flameTempC : 0; }
}


/* A portion of food, with the state that decides what it does to you. */
class Provision {
  constructor(opts = {}) {
    this.name = opts.name || 'meat';
    this.kg = opts.kg || 0.3;
    this.kcalPerKg = opts.kcalPerKg || 1200;
    this.proteinFraction = opts.proteinFraction != null ? opts.proteinFraction : 0.75;
    this.waterFraction = opts.waterFraction != null ? opts.waterFraction : 0.7;
    this.cut = opts.cut || 'muscle';        // keys of SAFE_CORE
    this.state = opts.state || FOOD_STATE.raw;
    this.coreTempC = opts.coreTempC != null ? opts.coreTempC : 12;
    this.holdS = 0;
    this.surfaceCharS = 0;
    this.ageDays = 0;
    this.accumulatedDegreeDays = 0;
    // Which disease vectors this portion still carries.
    this.pathogenVectors = (opts.pathogenVectors || []).slice();
  }

  get safe() { return this.pathogenVectors.length === 0; }

  /* Cooking. The middle heats by conduction, so a fierce fire chars the
     outside long before the core is safe. That gap is the whole mechanic:
     a seared bear steak looks done and still carries trichinella. */
  cook(dt, fireTempC, opts = {}) {
    if (fireTempC < 60) return this;
    const thickness = opts.thicknessM != null ? opts.thicknessM : Math.cbrt(this.kg / 1050) * 0.9;
    // Time constant scales with the square of thickness, as conduction does.
    const tau = Math.max(20, 900 * thickness * thickness * 40);
    this.coreTempC += (fireTempC * 0.72 - this.coreTempC) * clamp01(dt / tau);
    this.state = FOOD_STATE.cooking;

    const spec = SAFE_CORE[this.cut] || SAFE_CORE.muscle;
    if (this.coreTempC >= spec.tempC) {
      this.holdS += dt;
      if (this.holdS >= spec.holdS) {
        this.state = FOOD_STATE.cooked;
        // Heat kills what heat kills. Botulinum spores are the exception —
        // they need pressure canning, and nothing done over a campfire
        // touches them.
        this.pathogenVectors = this.pathogenVectors.filter((v) => v === VECTOR.spoiledCannedFood);
      }
    }
    // Surface char. Past a point it is carbon, and carbon has no calories.
    if (fireTempC > 300) this.surfaceCharS += dt * (fireTempC / 600);
    if (this.surfaceCharS > 240) {
      this.state = FOOD_STATE.burnt;
      this.kcalPerKg *= Math.max(0.45, 1 - (this.surfaceCharS - 240) / 1800);
    }
    return this;
  }

  /* Preserving. Drying and smoking both work by taking the water out, which
     is why dried meat keeps for months and a fresh cut keeps for a day. */
  dry(dt, opts = {}) {
    const airTempC = opts.airTempC != null ? opts.airTempC : 20;
    const humidity = opts.humidity != null ? opts.humidity : 0.5;
    if (airTempC < 4) return this;
    const rate = (dt / 86400) * (0.35 + airTempC * 0.02) * (1 - humidity) * (opts.smoke ? 1.6 : 1);
    this.waterFraction = Math.max(0.12, this.waterFraction - rate);
    // Water leaves; the calories stay, so a dried portion is denser.
    this.kg = Math.max(this.kg * 0.35, this.kg - this.kg * rate * 0.8);
    this.kcalPerKg = Math.min(4200, this.kcalPerKg * (1 + rate * 0.5));
    if (this.waterFraction < 0.25) {
      this.state = opts.smoke ? FOOD_STATE.smoked : FOOD_STATE.dried;
      if (opts.smoke) this.pathogenVectors = [];
    }
    return this;
  }

  /* Spoilage, on the same accumulated-degree-day basis the carcass model
     uses — one physical clock for rot, not two. Drying and smoking stop it
     because the bacteria have no water to work with. */
  step(dt, env = {}) {
    const days = dt / 86400;
    const tempC = env.airTempC != null ? env.airTempC : 15;
    this.ageDays += days;
    const dryProtection = clamp01((0.55 - this.waterFraction) / 0.4);
    this.accumulatedDegreeDays += Math.max(0, tempC - 4) * days * (1 - 0.92 * dryProtection);
    if (this.accumulatedDegreeDays > 55 && this.state !== FOOD_STATE.spoiled) {
      this.state = FOOD_STATE.spoiled;
    }
    return this;
  }

  /* What eating this actually does. Returns the argument for
     Physiology.eat plus the disease exposures it carries. */
  consume() {
    const spoiled = this.state === FOOD_STATE.spoiled;
    const vectors = this.pathogenVectors.slice();
    if (spoiled) vectors.push(VECTOR.undercookedMeat);
    return {
      food: {
        kcal: this.kg * this.kcalPerKg * (spoiled ? 0.7 : 1),
        waterL: this.kg * this.waterFraction,
        dryMassKg: this.kg * (1 - this.waterFraction),
      },
      // Protein as a share of energy, so the protein-poisoning path stays
      // driven by what the player is actually living on.
      proteinEnergyFraction: this.proteinFraction,
      exposures: vectors,
      state: this.state,
      hygiene: this.state === FOOD_STATE.cooked || this.state === FOOD_STATE.smoked ? 0.9 : 0.1,
    };
  }
}


/* ------------------------------------------------------------------
   WATER TREATMENT

   Each method removes what it really removes. The differences are the
   reason to carry more than one: boiling handles everything but costs
   fuel and time, a filter is instant but passes viruses, and chlorine
   is light and cheap and does nothing at all to Cryptosporidium — the
   disease table says so in its own note, and this is where that stops
   being flavour text.
   ------------------------------------------------------------------ */
const WATER_TREATMENT = {
  none: { name: 'untreated', removes: [], effort: 0 },
  boiled: {
    name: 'boiled',
    // A rolling boil is sufficient at any altitude a person walks to.
    removes: ['giardiasis', 'cryptosporidiosis', 'campylobacteriosis', 'norovirus', 'leptospirosis'],
    needs: ['fire', 'container'], secondsPerLitre: 60, fuelKgPerLitre: 0.25,
  },
  filtered: {
    name: 'filtered',
    // A 0.2 micron filter takes out protozoa and bacteria and passes viruses,
    // which is the honest limitation of every field filter.
    removes: ['giardiasis', 'cryptosporidiosis', 'campylobacteriosis', 'leptospirosis'],
    needs: ['filter'], secondsPerLitre: 45, wearPerLitre: 0.004,
    note: 'Takes out the protozoa and the bacteria. Viruses go straight through.',
  },
  charcoalSand: {
    name: 'improvised filter',
    // Charcoal, sand and cloth clear the sediment and some of the load, and
    // are not a substitute for boiling. Saying otherwise would be a lie the
    // player pays for a fortnight later.
    removes: ['giardiasis'],
    partial: { cryptosporidiosis: 0.5, campylobacteriosis: 0.4 },
    needs: ['charcoal', 'sand', 'cloth'], secondsPerLitre: 180,
    note: 'Better than nothing. Not the same as boiling.',
  },
  chlorine: {
    name: 'chlorinated',
    removes: ['campylobacteriosis', 'norovirus', 'leptospirosis'],
    // The oocysts have a wall chlorine cannot get through at field doses.
    needs: ['chlorine'], secondsPerLitre: 1800, dosePerLitre: 0.004,
    note: 'Kills the bacteria and the viruses. Cryptosporidium survives it.',
  },
  uv: {
    name: 'UV treated',
    removes: ['giardiasis', 'cryptosporidiosis', 'campylobacteriosis', 'norovirus', 'leptospirosis'],
    needs: ['uvPen', 'power'], secondsPerLitre: 90,
    note: 'Works on clear water only. Silt shadows the bugs and they survive.',
  },
  distilled: {
    name: 'distilled',
    removes: ['giardiasis', 'cryptosporidiosis', 'campylobacteriosis', 'norovirus', 'leptospirosis'],
    needs: ['still', 'fire'], secondsPerLitre: 900, fuelKgPerLitre: 1.4,
    note: 'The only thing that makes seawater drinkable.',
    desalinates: true,
  },
};

/* Treat a quantity of water and get back what is left in it. */
function treatWater(method, litres, opts = {}) {
  const t = WATER_TREATMENT[method] || WATER_TREATMENT.none;
  const turbidity = clamp01(opts.turbidity != null ? opts.turbidity : 0.2);
  // Silty water defeats UV and clogs a filter; the manufacturers say so.
  const effectiveness = method === 'uv' ? 1 - turbidity * 0.85
    : method === 'filtered' ? 1 - turbidity * 0.3 : 1;

  return {
    litres,
    method,
    name: t.name,
    note: t.note || null,
    // Pathogen ids this water no longer carries.
    removed: (t.removes || []).slice(),
    partial: Object.assign({}, t.partial || {}),
    effectiveness: clamp01(effectiveness),
    // Seawater is still seawater unless it was distilled.
    salinityGL: t.desalinates ? 0 : (opts.salinityGL || 0),
    secondsSpent: (t.secondsPerLitre || 0) * litres,
    fuelKg: (t.fuelKgPerLitre || 0) * litres,
    needs: t.needs || [],
  };
}

/* Drinking treated water: what the physiology gets, and which disease
   vectors survived the treatment. The disease system is handed only what is
   left, so protection is exactly as good as the method really is. */
function drinkTreated(physiology, diseaseSystem, treated, opts = {}) {
  physiology.drink(treated.litres, { salinityGL: treated.salinityGL });
  if (!diseaseSystem) return { caught: [] };

  const source = opts.source || VECTOR.untreatedWater;
  // Nothing removed and nothing partial means untreated water, and the
  // exposure is the full one.
  const fullyRemoved = new Set(treated.removed);
  const surviving = PATHOGENS.filter((p) => p.vectors.includes(source) && !fullyRemoved.has(p.id));
  if (!surviving.length) return { caught: [] };

  // Hygiene here is the share of the risk the treatment took away, which is
  // how the disease model already expresses partial protection.
  const removedShare = fullyRemoved.size / Math.max(1,
    PATHOGENS.filter((p) => p.vectors.includes(source)).length);
  const partialShare = Object.values(treated.partial || {}).reduce((a, b) => a + b, 0) * 0.25;
  const hygiene = clamp01((removedShare + partialShare) * treated.effectiveness);

  return { caught: diseaseSystem.expose(source, { hygiene, load: opts.load || 1 }) };
}
