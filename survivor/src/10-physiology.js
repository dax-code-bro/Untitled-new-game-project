/* ============================================================
   PHYSIOLOGY — the body as a set of coupled reservoirs.

   The design rule for this file: no bar goes down at "1 point per
   second". Every rate is computed from something physical, so that
   when the player asks "why am I dying", the answer is a chain of
   real causes — you carried 30 kg up a 20% grade in the sun, which
   cost 900 W, which cost you 1.4 L of sweat an hour, which you did
   not replace.

   Where a published model exists, it is used by name rather than
   approximated, and the reference is in the comment. Where one does
   not, the constant is labelled as a game constant so nobody later
   mistakes it for physiology.
   ============================================================ */

/* Specific heat of human tissue, J/(kg K). Standard value in every
   thermoregulation model since Stolwijk. */
const BODY_SPECIFIC_HEAT = 3470;
/* Latent heat of vaporisation of sweat at skin temperature, J/kg. */
const SWEAT_LATENT_HEAT = 2.43e6;
/* 1 clo, the unit of clothing insulation, in m^2 K / W. */
const CLO = 0.155;

/* Energy density of the reserves the body actually burns.
   Adipose tissue is not pure fat — roughly 87% triacylglycerol by mass —
   so it yields well under the 9.4 kcal/g of the lipid itself. */
const KCAL_PER_KG = {
  fat: 7700,        // adipose tissue, the classic 7700 kcal/kg
  glycogen: 4100,   // stored wet, with ~3 g water per gram of glycogen
  lean: 1020,       // catabolising muscle is a terrible fuel and costs you the muscle
};

/* Hydration milestones as fraction of body mass lost. These are the
   numbers used in sports-medicine and military heat-injury guidance. */
const DEHYDRATION = {
  thirst: 0.02,       // performance measurably down, thirst is insistent
  impaired: 0.04,     // strength and endurance falling, headache
  serious: 0.06,      // dizziness, tingling, no sweat to spare
  severe: 0.10,       // delirium, unable to self-rescue
  fatal: 0.12,        // circulatory collapse; ~20% of total body water
};

/* Core temperature landmarks, degrees C. */
const CORE_TEMP = {
  normal: 37.0,
  mildHypothermia: 35.0,
  moderateHypothermia: 32.0,
  severeHypothermia: 28.0,
  fatalCold: 24.0,
  heatExhaustion: 39.0,
  heatStroke: 40.0,
  fatalHeat: 42.5,
};

/* Tetens saturation vapour pressure, kPa. Drives every evaporative
   calculation in the thermal model. */
function saturationVapourKpa(celsius) {
  return 0.61078 * Math.exp((17.27 * celsius) / (celsius + 237.3));
}

/* DuBois body surface area, m^2. Still the standard after a century. */
function bodySurfaceArea(massKg, heightCm) {
  return 0.007184 * Math.pow(massKg, 0.425) * Math.pow(heightCm, 0.725);
}

/* Mifflin-St Jeor resting metabolic rate, kcal/day. Replaced
   Harris-Benedict as the recommended equation because it is more accurate
   in modern populations. */
function basalMetabolicRate(massKg, heightCm, ageYears, sex = 'male') {
  const base = 10 * massKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'female' ? base - 161 : base + 5;
}

/* Pandolf load-carriage equation — metabolic cost of walking with a load,
   in watts. This is the US Army Research Institute of Environmental
   Medicine model, and it is the reason a heavy pack on a hill is a survival
   problem rather than a movement-speed modifier.

     M = 1.5W + 2.0(W+L)(L/W)^2 + n(W+L)(1.5V^2 + 0.35VG)

   W body mass kg, L load kg, V speed m/s, G grade percent, n terrain factor.

   The (L/W)^2 term is why the last few kilos hurt so much more than the
   first: cost of carrying rises with the square of the load fraction. */
function pandolfWatts(massKg, loadKg, speedMs, gradePercent, terrainFactor = 1.0) {
  const W = massKg, L = Math.max(0, loadKg), V = Math.max(0, speedMs), G = gradePercent;
  const total = W + L;
  let M = 1.5 * W
    + 2.0 * total * Math.pow(L / W, 2)
    + terrainFactor * total * (1.5 * V * V + 0.35 * V * G);

  // Santee correction for downhill. Pandolf alone keeps subtracting cost as
  // the slope steepens until walking downhill is free and then generative,
  // which is not a thing bodies do — braking on a steep descent costs more
  // than strolling on the flat.
  if (G < 0) {
    const C = terrainFactor * ((G * total * V) / 3.5
      - ((total * Math.pow(G + 6, 2)) / W)
      + (25 - Math.pow(V, 2)));
    M = 1.5 * W + 2.0 * total * Math.pow(L / W, 2)
      + terrainFactor * total * (1.5 * V * V) - C;
  }
  return Math.max(1.5 * W, M);
}

/* Terrain factors from the same body of work. Loose sand really is more
   than twice the cost of a road, which is why the beach is a trap. */
const TERRAIN_FACTOR = {
  blacktop: 1.0, dirtRoad: 1.1, gravel: 1.2, lightBrush: 1.2,
  heavyBrush: 1.5, tallGrass: 1.3, swamp: 1.8, looseSand: 2.1,
  shallowSnow: 1.6, deepSnow: 2.5, mud: 1.7, scree: 1.9, water: 3.5,
};

/* North American wind chill index, degrees C, for T <= 10 C and wind
   above 4.8 km/h. Outside that envelope it is not defined and returning
   the raw temperature is the honest answer. */
function windChill(celsius, windMs) {
  const v = windMs * 3.6;
  if (celsius > 10 || v < 4.8) return celsius;
  const p = Math.pow(v, 0.16);
  return 13.12 + 0.6215 * celsius - 11.37 * p + 0.3965 * celsius * p;
}


class Physiology {
  constructor(opts = {}) {
    this.massKg = opts.massKg != null ? opts.massKg : 80;
    this.heightCm = opts.heightCm != null ? opts.heightCm : 178;
    this.age = opts.age != null ? opts.age : 30;
    this.sex = opts.sex || 'male';

    this.leanMassKg = this.massKg * (1 - (opts.bodyFat != null ? opts.bodyFat : 0.16));
    this.fatMassKg = this.massKg - this.leanMassKg;
    this.baselineMassKg = this.massKg;

    this.surfaceArea = bodySurfaceArea(this.massKg, this.heightCm);
    this.bmrKcalDay = basalMetabolicRate(this.massKg, this.heightCm, this.age, this.sex);

    /* --- water ---------------------------------------------------
       Total body water is ~60% of mass in an adult male, ~50% female.
       `bodyWaterL` is the live figure; the deficit against baseline is
       what actually kills, not an abstract "thirst" number. */
    const waterFraction = this.sex === 'female' ? 0.50 : 0.60;
    this.baselineWaterL = this.massKg * waterFraction;
    this.bodyWaterL = this.baselineWaterL;

    /* --- energy -------------------------------------------------- */
    this.glycogenKcal = 2000;          // ~500 g liver+muscle, wet
    this.glycogenMaxKcal = 2000;
    this.bloodGlucose = 5.0;           // mmol/L, normal fasting 4.0-5.4

    /* --- gut ----------------------------------------------------- */
    this.stomach = { kcal: 0, waterL: 0, massKg: 0, solidsKg: 0 };
    this.intestineKcal = 0;
    this.bowelKg = 0;                  // urge around 0.15, involuntary near 0.35
    this.bladderMl = 0;

    /* --- sleep --------------------------------------------------- */
    // Borbély two-process model: S is homeostatic sleep pressure, 0-1.
    this.sleepPressure = 0.25;
    this.hoursAwake = 0;
    this.asleep = false;
    this.cumulativeSleepDebtH = 0;

    /* --- thermal ------------------------------------------------- */
    this.coreTempC = CORE_TEMP.normal;
    this.skinTempC = 33.0;
    this.sweatRateLh = 0;
    this.drippedLh = 0;                // sweat produced that never evaporated
    this.shivering = 0;                // 0-1, adds metabolic heat and costs energy
    this.clothingClo = opts.clothingClo != null ? opts.clothingClo : 0.8;
    this.wet = 0;                      // 0-1; wet clothing loses most of its insulation

    /* --- circulation --------------------------------------------- */
    // ~70 mL/kg in adult males, 65 in females.
    this.bloodVolumeL = this.massKg * (this.sex === 'female' ? 0.065 : 0.070);
    this.baselineBloodL = this.bloodVolumeL;

    /* --- state --------------------------------------------------- */
    this.alive = true;
    this.causeOfDeath = null;
    this.unconsciousFor = 0;
    this.elapsedH = 0;
  }

  /* ---------------- derived read-outs ---------------- */

  /* Water deficit as a fraction of body mass — the axis every published
     dehydration threshold is stated on. */
  get dehydration() {
    const deficitKg = this.baselineWaterL - this.bodyWaterL;   // 1 L water ~ 1 kg
    return Math.max(0, deficitKg / this.baselineMassKg);
  }

  get bodyFatPercent() { return this.fatMassKg / this.massKg; }

  /* Body mass index. Below 13 is the figure the famine-medicine literature
     treats as the edge of survivable. */
  get bmi() { return this.massKg / Math.pow(this.heightCm / 100, 2); }

  /* Fraction of blood volume lost — the ATLS haemorrhage classes are
     defined on this: I <15%, II 15-30%, III 30-40%, IV >40%. */
  get bloodLossFraction() {
    return Math.max(0, (this.baselineBloodL - this.bloodVolumeL) / this.baselineBloodL);
  }

  get hemorrhageClass() {
    const f = this.bloodLossFraction;
    if (f < 0.15) return 1;
    if (f < 0.30) return 2;
    if (f < 0.40) return 3;
    return 4;
  }

  /* Circadian alertness from the two-process model: the wake drive C minus
     the sleep pressure S. This is why 04:00 is hard even when rested, and
     why a second wind arrives mid-evening. */
  circadianDrive(hourOfDay) {
    // Peak alertness late afternoon, trough around 04:00-05:00.
    return 0.5 + 0.5 * Math.sin((2 * Math.PI * (hourOfDay - 10.5)) / 24);
  }

  alertness(hourOfDay) {
    return clamp01(0.35 + 0.75 * this.circadianDrive(hourOfDay) - 0.85 * this.sleepPressure);
  }

  /* ---------------- inputs ---------------- */

  drink(litres, opts = {}) {
    if (litres <= 0) return;
    this.stomach.waterL += litres;
    this.stomach.massKg += litres;
    // Salinity matters: seawater at ~35 g/L needs more water to excrete than
    // it provides, so drinking it accelerates dehydration rather than easing it.
    if (opts.salinityGL && opts.salinityGL > 9) {
      this.stomach.waterL -= litres * Math.min(1.8, opts.salinityGL / 20);
    }
  }

  eat(food) {
    this.stomach.kcal += food.kcal || 0;
    this.stomach.waterL += food.waterL || 0;
    this.stomach.solidsKg += food.dryMassKg || 0;
    this.stomach.massKg += (food.waterL || 0) + (food.dryMassKg || 0);
  }

  bleed(litresPerSecond, dt) { this.bloodVolumeL = Math.max(0, this.bloodVolumeL - litresPerSecond * dt); }

  urinate() { const v = this.bladderMl; this.bladderMl = 0; return v; }
  defecate() { const m = this.bowelKg; this.bowelKg = 0; return m; }

  /* ---------------- the step ----------------

     `dt` is in seconds of *simulated* time. The world clock compresses a
     day into 40 real minutes, so it hands this function the simulated
     seconds that elapsed, not the wall-clock ones — otherwise a
     36x-compressed day would starve nobody. */
  step(dt, env = {}) {
    if (!this.alive) return this;
    const hours = dt / 3600;
    this.elapsedH += hours;

    const airC = env.airTempC != null ? env.airTempC : 18;
    const windMs = env.windMs || 0;
    const humidity = env.humidity != null ? env.humidity : 0.5;
    const speedMs = env.speedMs || 0;
    const gradePct = env.gradePercent || 0;
    const loadKg = env.loadKg || 0;
    const terrain = env.terrainFactor != null ? env.terrainFactor : 1.1;
    const inWater = !!env.inWater;
    const hourOfDay = env.hourOfDay != null ? env.hourOfDay : 12;

    /* -------- 1. metabolic rate -------- */
    const bmrWatts = (this.bmrKcalDay * UNIT.KCAL_J) / 86400;
    let workWatts = speedMs > 0.05
      ? pandolfWatts(this.massKg, loadKg, speedMs, gradePct, terrain)
      : bmrWatts * 1.15;                       // standing still still costs above resting
    workWatts += (env.extraWatts || 0);        // chopping, digging, hauling
    // Shivering is expensive. Peak thermogenesis is around 5x resting for
    // short bursts, but sustained shivering is closer to 2.5x — and it is
    // paid for out of glycogen, so a cold night burns the food you have not
    // eaten. When the glycogen runs out the shivering fails, and that is
    // usually the moment hypothermia stops being survivable.
    /* Shivering runs on two fuels. Hard shivering is glycogen-driven and
       stops when the glycogen does — which is why the last hours of
       hypothermia are the ones where the shivering has stopped. But
       low-level thermogenesis burns fat, and anyone with fat on them can
       hold that indefinitely. Gating the whole response on glycogen made a
       hungry character hypothermic on a mild afternoon, which is not what
       bodies do. */
    const fromFat = this.fatMassKg > 0.5 ? 0.4 : 0;
    const fromGlycogen = clamp01(this.glycogenKcal / (this.glycogenMaxKcal * 0.25));
    const shiverFuel = Math.max(fromFat, fromGlycogen);
    const shiverWatts = this.shivering * 2.5 * bmrWatts * shiverFuel;
    const totalWatts = Math.max(bmrWatts, workWatts) + shiverWatts;
    const kcalBurned = (totalWatts * dt) / UNIT.KCAL_J;

    /* -------- 2. digestion -------- */
    // The stomach empties at a roughly constant caloric rate — about
    // 2 kcal/min for mixed meals — which is why you cannot out-eat a
    // deficit in one sitting.
    const emptyKcal = Math.min(this.stomach.kcal, 2 * (dt / 60));
    this.stomach.kcal -= emptyKcal;
    this.intestineKcal += emptyKcal;
    const absorbKcal = Math.min(this.intestineKcal, 3.5 * (dt / 60));
    this.intestineKcal -= absorbKcal;

    // Water leaves the stomach far faster than calories do.
    const absorbWater = Math.min(this.stomach.waterL, (0.6 / 3600) * dt * 4);
    this.stomach.waterL -= absorbWater;
    this.bodyWaterL += absorbWater;

    // Indigestible residue becomes bowel content. Roughly a third of solid
    // intake by mass ends up as stool.
    const toBowel = Math.min(this.stomach.solidsKg, this.stomach.solidsKg * (dt / 7200));
    this.stomach.solidsKg -= toBowel;
    this.bowelKg += toBowel * 0.34;
    this.stomach.massKg = this.stomach.waterL + this.stomach.solidsKg;

    /* -------- 3. energy balance -------- */
    let deficit = kcalBurned - absorbKcal;
    if (deficit < 0) {
      // Surplus: top up glycogen first, then store the rest as fat.
      const toGlycogen = Math.min(-deficit, this.glycogenMaxKcal - this.glycogenKcal);
      this.glycogenKcal += toGlycogen;
      const toFat = (-deficit - toGlycogen);
      this.fatMassKg += toFat / KCAL_PER_KG.fat;
      deficit = 0;
    } else {
      const fromGlycogen = Math.min(this.glycogenKcal, deficit);
      this.glycogenKcal -= fromGlycogen;
      deficit -= fromGlycogen;
      if (deficit > 0) {
        // Once glycogen is gone the body runs on fat, and — importantly —
        // on muscle. The lean-mass share rises as fat runs out, which is
        // the mechanism that actually kills the starving.
        const leanShare = this.fatMassKg > 1 ? 0.12 : 0.75;
        const fatKcal = deficit * (1 - leanShare);
        const leanKcal = deficit * leanShare;
        this.fatMassKg = Math.max(0, this.fatMassKg - fatKcal / KCAL_PER_KG.fat);
        this.leanMassKg = Math.max(0, this.leanMassKg - leanKcal / KCAL_PER_KG.lean);
      }
    }
    this.bloodGlucose = clampTo(3.2 + 2.2 * (this.glycogenKcal / this.glycogenMaxKcal)
      + (absorbKcal > 0 ? 0.8 : 0), 1.5, 9.0);
    this.massKg = this.leanMassKg + this.fatMassKg + this.bodyWaterL - this.baselineWaterL + this.bowelKg;

    /* -------- 4. thermoregulation --------
       A two-node balance: metabolic heat in, dry loss through clothing and
       the boundary air layer out, evaporative loss out. */
    const A = this.surfaceArea;
    // Wet clothing loses most of its insulation, and immersion removes the
    // still-air layer entirely. Cold water takes heat ~25x faster than air,
    // which is why the sea kills so much faster than the night.
    const effClo = inWater
      ? this.clothingClo * 0.12                       // submerged: near enough to nothing
      : this.clothingClo * (1 - 0.75 * this.wet);
    const hc = inWater ? 200 : Math.max(3.1, 8.3 * Math.pow(Math.max(windMs, 0.1), 0.6));
    const resistance = effClo * CLO + 1 / hc;
    const ambient = inWater ? (env.waterTempC != null ? env.waterTempC : airC) : airC;
    const dryLossW = (A * (this.skinTempC - ambient)) / resistance;

    // Sweating: driven by core temperature above set point, capped by what
    // the air can actually take away. Humid air is dangerous precisely
    // because sweat that does not evaporate cools nothing but still costs
    // the water — the mechanism behind every wet-bulb heat death.
    //
    // The cap is the real evaporative capacity: the Lewis relation gives the
    // evaporative heat transfer coefficient as 16.5 x hc (W/m^2 per kPa), and
    // the driving force is the vapour pressure difference between saturated
    // skin and the actual air, not some fraction of relative humidity.
    const thermalDrive = clamp01((this.coreTempC - 37.2) / 1.5);
    const desiredSweatLh = thermalDrive * 2.0;
    const pSkin = saturationVapourKpa(this.skinTempC);
    const pAir = humidity * saturationVapourKpa(airC);
    const clothingEvapResistance = 1 + 0.92 * hc * effClo * CLO;
    const maxEvapW = inWater ? 0
      : Math.max(0, (16.5 * hc * A * (pSkin - pAir)) / clothingEvapResistance);
    const evapCapacityLh = (maxEvapW * 3600) / SWEAT_LATENT_HEAT;
    // Dehydration suppresses sweating, which is the trap that closes: the
    // drier you get, the worse you cool, the hotter you run, the more you
    // sweat. Heat stroke in the field is usually the end of this loop.
    this.sweatRateLh = desiredSweatLh * (1 - 0.7 * ramp(this.dehydration, 0.03, 0.09));

    // The body sweats what it wants to sweat; the air takes what it can. The
    // difference runs off you, and that water is gone without having cooled
    // anything. It is the reason humid heat is so much more dangerous than
    // dry heat at the same temperature, and the reason a soaked shirt is a
    // warning rather than a sign the cooling is working.
    const evaporatedLh = Math.min(this.sweatRateLh, Math.max(0, evapCapacityLh));
    this.drippedLh = this.sweatRateLh - evaporatedLh;
    const evapW = (evaporatedLh / 3600) * SWEAT_LATENT_HEAT
      + (inWater ? 0 : 10 * A);              // insensible skin diffusion + respiratory, ~0.6 L/day

    // Shivering fails below about 30 C — the body stops trying, which is
    // why severe hypothermia accelerates once it starts.
    this.shivering = clamp01((36.8 - this.coreTempC) / 1.8)
      * (1 - 0.5 * ramp(this.dehydration, 0.06, 0.12))
      * ramp(this.coreTempC, 29.5, 31.5);

    const storedW = totalWatts - dryLossW - evapW;
    this.coreTempC += (storedW * dt) / (this.massKg * BODY_SPECIFIC_HEAT);
    // Skin sits between core and ambient. The resistance between them is not
    // a constant: vasoconstriction in the cold roughly triples it, which is
    // the body's first and cheapest defence — cold hands are the core being
    // defended. Immersion is the exception. Water strips heat off perfused
    // muscle faster than skin vasoconstriction can protect it, so the
    // effective internal resistance collapses, and that is why cold water
    // kills in an hour where cold air of the same temperature takes a day.
    const internalR = inWater ? 0.075
      : lerpN(0.040, 0.115, clamp01((37.0 - this.coreTempC) / 1.2));
    const skinTarget = ambient + (this.coreTempC - ambient) * clamp01(resistance / (resistance + internalR));
    this.skinTempC += (skinTarget - this.skinTempC) * clamp01(dt / 300);

    /* -------- 5. water balance -------- */
    let waterOutL = this.sweatRateLh * hours;
    waterOutL += 0.019 * hours;               // respiratory loss, ~450 mL/day
    waterOutL += 0.020 * hours;               // insensible skin loss
    waterOutL += 0.006 * hours * (totalWatts / bmrWatts);  // extra breathing under load

    // Urine production, ~1 mL/kg/h when euhydrated. Antidiuretic hormone
    // shuts this down hard when water is short — the body will concentrate
    // urine to a quarter of normal volume before it gives up water.
    const adh = 1 - 0.8 * ramp(this.dehydration, 0.005, 0.05);
    const overload = clamp01((this.bodyWaterL - this.baselineWaterL) / 1.5);
    const urineMlH = this.massKg * 1.0 * adh * (1 + 2.5 * overload);
    const urineL = (urineMlH / 1000) * hours;
    this.bladderMl += urineMlH * hours;
    waterOutL += urineL;

    this.bodyWaterL = Math.max(0, this.bodyWaterL - waterOutL);
    this.bloodVolumeL = Math.max(0, Math.min(this.baselineBloodL,
      this.bloodVolumeL - waterOutL * 0.12 + absorbWater * 0.12));

    // Losing control is not optional. If the bladder passes its involuntary
    // threshold the character voids, which is a hygiene and morale problem
    // rather than a medical one — but it is not something you can ignore.
    this.wetSelf = false;
    if (this.bladderMl > 700) { this.bladderMl = 0; this.wetSelf = true; this.wet = Math.min(1, this.wet + 0.25); }
    if (this.bowelKg > 0.38) { this.bowelKg = 0; this.soiledSelf = true; }
    else this.soiledSelf = false;

    /* -------- 6. sleep -------- */
    // Two-process model. S rises toward 1 while awake with a ~18.2 h time
    // constant and falls toward 0 while asleep with a ~4.2 h one — which is
    // why eight hours of sleep repays sixteen of waking.
    if (this.asleep) {
      this.sleepPressure += (0 - this.sleepPressure) * (1 - Math.exp(-hours / 4.2));
      this.hoursAwake = 0;
      this.cumulativeSleepDebtH = Math.max(0, this.cumulativeSleepDebtH - hours * 1.6);
    } else {
      this.sleepPressure += (1 - this.sleepPressure) * (1 - Math.exp(-hours / 18.2));
      this.hoursAwake += hours;
      if (this.hoursAwake > 16) this.cumulativeSleepDebtH += hours;
    }

    /* -------- 7. lethality -------- */
    this._checkVitals(hours, hourOfDay);
    return this;
  }

  _checkVitals(hours, hourOfDay) {
    const d = this.dehydration;
    if (d >= DEHYDRATION.fatal) return this._die('dehydration');
    if (this.coreTempC <= CORE_TEMP.fatalCold) return this._die('hypothermia');
    if (this.coreTempC >= CORE_TEMP.fatalHeat) return this._die('hyperthermia');
    if (this.bloodLossFraction >= 0.45) return this._die('exsanguination');
    // Starvation kills through wasting, not through an empty calorie bar.
    // BMI 13 or the loss of ~half of lean mass is the edge in the
    // famine-medicine literature.
    if (this.bmi < 13 || this.leanMassKg < this.baselineMassKg * 0.28) return this._die('starvation');
    if (this.bloodGlucose < 1.8) return this._die('hypoglycaemia');
    // Total sleep deprivation is lethal in animal models in 11-32 days; the
    // human evidence is thinner but points the same way. Modelled as a hard
    // limit far past the point the player has been warned repeatedly.
    if (this.cumulativeSleepDebtH > 24 * 11) return this._die('fatal insomnia');
    return null;
  }

  _die(cause) {
    this.alive = false;
    this.causeOfDeath = cause;
    return cause;
  }

  /* A single structured read-out for the HUD, the diagnosis screen and the
     save file. Everything here is derived, so it can never disagree with
     the simulation the way a parallel set of "display" fields would. */
  status(hourOfDay = 12) {
    const d = this.dehydration;
    return {
      alive: this.alive,
      causeOfDeath: this.causeOfDeath,
      massKg: this.massKg,
      dehydration: d,
      thirst: ramp(d, 0.005, DEHYDRATION.serious),
      hunger: 1 - clamp01(this.glycogenKcal / this.glycogenMaxKcal),
      energy: clamp01(0.25 + 0.75 * (this.glycogenKcal / this.glycogenMaxKcal)),
      coreTempC: this.coreTempC,
      thermalStress: this.coreTempC < 36.5
        ? -ramp(36.5 - this.coreTempC, 0, 4.5)
        : ramp(this.coreTempC - 37.5, 0, 3.0),
      shivering: this.shivering,
      sweatRateLh: this.sweatRateLh,
      sweatWastedLh: this.drippedLh || 0,
      bladder: clamp01(this.bladderMl / 600),
      bowel: clamp01(this.bowelKg / 0.35),
      needsToilet: this.bladderMl > 250 || this.bowelKg > 0.15,
      urgentToilet: this.bladderMl > 500 || this.bowelKg > 0.28,
      sleepPressure: this.sleepPressure,
      alertness: this.alertness(hourOfDay),
      hoursAwake: this.hoursAwake,
      bloodLoss: this.bloodLossFraction,
      hemorrhageClass: this.hemorrhageClass,
      bloodGlucose: this.bloodGlucose,
      bmi: this.bmi,
      // What the player can actually do right now: the product of every
      // system that is currently degraded.
      capacity: clamp01(
        (1 - 0.85 * ramp(d, DEHYDRATION.thirst, DEHYDRATION.severe))
        * (1 - 0.6 * ramp(1 - this.glycogenKcal / this.glycogenMaxKcal, 0.7, 1.0))
        * (1 - 0.7 * ramp(Math.abs(this.coreTempC - 37), 1.5, 4.0))
        * (1 - 0.5 * ramp(this.sleepPressure, 0.75, 1.0))
        * (1 - 0.9 * ramp(this.bloodLossFraction, 0.15, 0.40)),
      ),
    };
  }
}
