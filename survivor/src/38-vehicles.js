/* ============================================================
   VEHICLES — horses and motor cars.

   Both are here rather than in the game layer for the same reason
   everything else is: a horse is a metabolic animal with published
   gait costs and a car is an engine curve, a gearbox and four
   contact patches. Neither is a speed multiplier.

   The horse numbers come from equine exercise physiology: an
   average riding horse of 500 kg walks at 1.6 m/s, trots at 3.5,
   canters at 6.5 and gallops at 13-16 for a distance measured in
   minutes rather than hours. Its aerobic ceiling is roughly 35
   times its resting rate, and above that it is burning an anaerobic
   reserve it has to stand still to pay back. That reserve is why a
   ridden gallop is a decision and not a travel mode.

   The car numbers come from the same place any vehicle dynamics
   model does: torque against engine speed, a gear ratio, a final
   drive, rolling resistance proportional to weight, drag
   proportional to the square of speed, and a friction circle at the
   tyres that decides whether the thing goes where it is pointed.
   ============================================================ */

/* Gaits, with the metabolic cost of each. The costs are in watts per
   kilogram of horse and come from treadmill work: a walk is remarkably
   cheap and a gallop is not sustainable by any measure. */
const GAIT = {
  halt:   { id: 'halt',   name: 'halt',   speedMs: 0,    wattsPerKg: 1.5,  jolt: 0 },
  walk:   { id: 'walk',   name: 'walk',   speedMs: 1.6,  wattsPerKg: 5.5,  jolt: 0.05 },
  trot:   { id: 'trot',   name: 'trot',   speedMs: 3.6,  wattsPerKg: 17.0, jolt: 0.55 },
  canter: { id: 'canter', name: 'canter', speedMs: 6.5,  wattsPerKg: 34.0, jolt: 0.28 },
  // A gallop is about 5.5 J per kilogram per metre, which at 14 m/s is 77
  // watts per kilogram — above the aerobic ceiling, but only by a third.
  // That margin is why a horse can gallop for a mile and not for an hour.
  gallop: { id: 'gallop', name: 'gallop', speedMs: 14.0, wattsPerKg: 77.0, jolt: 0.4 },
};
const GAIT_ORDER = ['halt', 'walk', 'trot', 'canter', 'gallop'];

/* Breeds differ in the way that matters to a rider: how fast, how long,
   and how much they will put up with. */
const HORSE_BREED = {
  quarter:     { name: 'quarter horse', massKg: 500, speedScale: 1.06, staminaScale: 0.9,  temperament: 0.75, carryFraction: 0.20 },
  thoroughbred:{ name: 'thoroughbred',  massKg: 500, speedScale: 1.16, staminaScale: 0.8,  temperament: 0.45, carryFraction: 0.18 },
  mustang:     { name: 'mustang',       massKg: 380, speedScale: 0.98, staminaScale: 1.15, temperament: 0.25, carryFraction: 0.22 },
  draft:       { name: 'draft horse',   massKg: 820, speedScale: 0.78, staminaScale: 1.05, temperament: 0.85, carryFraction: 0.25 },
  pony:        { name: 'pony',          massKg: 300, speedScale: 0.85, staminaScale: 1.1,  temperament: 0.7,  carryFraction: 0.20 },
};

class Horse {
  constructor(opts = {}) {
    const breed = HORSE_BREED[opts.breed] || HORSE_BREED.quarter;
    this.breed = breed;
    this.breedId = opts.breed || 'quarter';
    this.name = opts.name || breed.name;
    this.massKg = opts.massKg || breed.massKg;
    this.x = opts.x || 0; this.y = opts.y || 0; this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speedMs = 0;
    this.gait = 'halt';
    this.alive = true;

    /* Aerobic capacity and the anaerobic reserve, both as energy stores.
       A fit horse's VO2max is around 160 ml of oxygen per kilogram per
       minute, which at 20.9 joules per millilitre is about 55 watts per
       kilogram — two to three times what a person can do. That is the
       whole reason a horse is worth having. Anything above it comes out of
       the anaerobic reserve, and the reserve refills only slowly. */
    this.aerobicWatts = this.massKg * 55;
    this.reserveJ = this.massKg * 4200;             // anaerobic pool
    this.reserveMaxJ = this.reserveJ;
    this.fatigue = 0;                               // 0 fresh, 1 finished
    this.hydrationL = this.massKg * 0.62;
    this.hydrationMaxL = this.hydrationL;
    this.gutFillKg = 8;                             // it has to eat, constantly
    this.coreTempC = 37.8;

    /* Temperament is what a horse does when it is frightened, and a
       frightened horse is the leading cause of riding injuries in the real
       world. Trust rises with handling and falls with being shot off. */
    this.trust = opts.trust != null ? opts.trust : breed.temperament * 0.4;
    this.spook = 0;
    this.wild = opts.wild !== false;
    this.rider = null;
    this.saddled = !!opts.saddled;
    this.lame = false;
    this.injuries = [];
  }

  get maxSpeedMs() { return GAIT.gallop.speedMs * this.breed.speedScale * (this.lame ? 0.35 : 1); }
  get carryCapacityKg() { return this.massKg * this.breed.carryFraction; }

  gaitSpeed(gaitId) {
    const g = GAIT[gaitId] || GAIT.halt;
    return g.speedMs * this.breed.speedScale * (this.lame ? 0.35 : 1) * (1 - 0.35 * this.fatigue);
  }

  /* Asking for a gait is not the same as getting it. A tired, thirsty or
     frightened horse refuses, and a wild one refuses everything. */
  ask(gaitId, opts = {}) {
    if (!this.alive) return { ok: false, reason: 'it is dead' };
    const want = GAIT[gaitId] ? gaitId : 'walk';
    const idx = GAIT_ORDER.indexOf(want);
    if (this.wild && this.trust < 0.55) return { ok: false, reason: 'it will not take a rider' };

    // Willingness falls with fatigue and rises with trust and horsemanship.
    const skill = clamp01(opts.skill != null ? opts.skill : 0.2);
    const demand = idx / 4;
    const willing = clamp01(0.35 + this.trust * 0.5 + skill * 0.4 - this.fatigue * 0.8 - this.spook * 0.3);
    if (demand > willing) {
      const gave = GAIT_ORDER[Math.max(0, Math.min(idx - 1, Math.floor(willing * 4)))];
      this.gait = gave;
      return { ok: false, reason: 'it will not give you that', gait: gave };
    }
    this.gait = want;
    return { ok: true, gait: want };
  }

  /* One step of the horse, ridden or not. The rider's mass is a load in the
     same sense the player's pack is: it costs the horse energy to carry. */
  step(dt, opts = {}) {
    if (!this.alive) return this;
    const g = GAIT[this.gait] || GAIT.halt;
    const load = (opts.riderMassKg || 0) + (opts.cargoKg || 0);
    // Carrying costs a little more than its share of the horse's own mass.
    const loadFactor = 1 + (load / this.massKg) * 1.1;
    const grade = clamp01(Math.abs(opts.gradePct || 0) / 30) * (opts.gradePct > 0 ? 1 : 0.3);
    const terrain = opts.terrainFactor != null ? opts.terrainFactor : 1;

    const demandW = g.wattsPerKg * this.massKg * loadFactor * (1 + grade * 1.6) * terrain;
    const overW = demandW - this.aerobicWatts;
    if (overW > 0) {
      this.reserveJ = Math.max(0, this.reserveJ - overW * dt);
      // Out of reserve, the horse simply cannot hold the gait.
      if (this.reserveJ <= 0 && GAIT_ORDER.indexOf(this.gait) > 1) {
        this.gait = 'trot';
      }
    } else {
      // Recovery is slow, and slower still if it is hot or dehydrated.
      const heat = clamp01((this.coreTempC - 38.5) / 3);
      const dry = clamp01(1 - this.hydrationL / this.hydrationMaxL);
      const recoverW = (-overW) * 0.45 * (1 - heat * 0.6) * (1 - dry * 0.7) * this.breed.staminaScale;
      this.reserveJ = Math.min(this.reserveMaxJ, this.reserveJ + recoverW * dt);
    }
    this.fatigue = 1 - this.reserveJ / this.reserveMaxJ;

    /* Heat, on the same ledger the human physiology uses: metabolism makes
       it, dry loss sheds some of it, and sweat has to carry the rest or the
       core temperature climbs. A horse working hard in the heat has to
       evaporate ten to fifteen litres an hour, which is why an endurance
       ride is planned around water rather than around distance. */
    const airTempC = opts.airTempC != null ? opts.airTempC : 15;
    const heatW = demandW * 0.8;                   // four fifths of it is waste heat
    // Convection and respiration, which get much worse as the air warms.
    const dryLossW = this.massKg * (10 - clamp01((airTempC - 10) / 25) * 6);
    const needEvapW = Math.max(0, heatW - dryLossW);
    // Fifteen litres an hour is about the ceiling, and a dehydrated horse
    // cannot reach it, which is exactly how they die on a hot ride.
    const hydration = clamp01(this.hydrationL / (this.hydrationMaxL * 0.94));
    const maxEvapW = 10100 * (this.massKg / 500) * (0.25 + 0.75 * hydration);
    const evapW = Math.min(needEvapW, maxEvapW);
    const sweatLh = (evapW * 3600) / 2.43e6;
    this.hydrationL = Math.max(0, this.hydrationL - sweatLh * (dt / 3600));
    this.sweatRateLh = sweatLh;
    // 3470 J/kg/K is the specific heat of tissue.
    this.coreTempC += ((heatW - dryLossW - evapW) / (this.massKg * 3470)) * dt
      - (this.coreTempC - 37.6) * 0.06 * (dt / 60);
    this.coreTempC = clampTo(this.coreTempC, 36.5, 43);

    // Heat stroke in a horse begins around 41 C and is fatal by 43.
    if (this.coreTempC > 41.5) this.fatigue = Math.min(1, this.fatigue + dt / 900);
    if (this.coreTempC > 43 || this.hydrationL <= this.hydrationMaxL * 0.75) {
      if (this.coreTempC > 43) { this.alive = false; this.rider = null; }
    }

    this.gutFillKg = Math.max(0, this.gutFillKg - (dt / 3600) * 0.9);
    this.spook = Math.max(0, this.spook - dt * 0.12);

    // Move.
    const target = this.gaitSpeed(this.gait);
    this.speedMs += (target - this.speedMs) * clamp01(dt / 1.4);
    if (opts.steer != null) this.heading += opts.steer * dt * (0.7 + 1.4 / (1 + this.speedMs * 0.25));
    this.x += Math.sin(this.heading) * this.speedMs * dt;
    this.z += Math.cos(this.heading) * this.speedMs * dt;
    return this;
  }

  drink(litres) { this.hydrationL = Math.min(this.hydrationMaxL, this.hydrationL + litres); return this; }
  graze(dt) {
    this.gutFillKg = Math.min(14, this.gutFillKg + (dt / 3600) * 1.4);
    this.reserveJ = Math.min(this.reserveMaxJ, this.reserveJ + this.massKg * 40 * (dt / 3600));
    return this;
  }

  /* Handling. Every calm minute near a horse buys a little trust; every
     bad surprise costs a lot of it. This is the whole taming loop. */
  handle(dt, opts = {}) {
    /* Half an hour of standing quietly with a wild horse is roughly what it
       takes before it will let you on, and one bad moment undoes most of
       it. Both of those numbers are the point of the mechanic. */
    const gentle = opts.gentle !== false;
    const rate = gentle ? 0.00025 : -0.02;
    this.trust = clamp01(this.trust + rate * dt * (1 - this.spook));
    if (this.trust > 0.55) this.wild = false;
    return this.trust;
  }

  startle(intensity = 1) {
    this.spook = clamp01(this.spook + intensity * (1 - this.trust * 0.6));
    // A spooked horse with a rider on it may put them on the floor.
    if (this.rider && this.spook > 0.75) return { unseated: true, fallSpeedMs: Math.max(3, this.speedMs) };
    return { unseated: false };
  }
}


/* ------------------------------------------------------------------
   MOTOR VEHICLES

   Torque curve, gearbox, final drive, and the two resistances that
   decide top speed. Everything below is the same arithmetic a real
   drivetrain does; there is no top-speed constant anywhere in it.
   ------------------------------------------------------------------ */
const VEHICLE_SPEC = {
  pickup: {
    name: 'pickup truck', massKg: 2100, dragCd: 0.44, frontalAreaM2: 3.2,
    peakTorqueNm: 420, peakTorqueRpm: 3600, redlineRpm: 5600, idleRpm: 750,
    gears: [3.66, 2.13, 1.4, 1.0, 0.79], finalDrive: 3.73, wheelRadiusM: 0.38,
    tankL: 98, driveWheels: 2, groundClearanceM: 0.24, seats: 3,
    tyreGrip: 0.85, fuel: 'petrol', litresPer100kmAt90: 13.5,
  },
  sedan: {
    name: 'saloon', massKg: 1500, dragCd: 0.31, frontalAreaM2: 2.2,
    peakTorqueNm: 240, peakTorqueRpm: 4200, redlineRpm: 6400, idleRpm: 800,
    gears: [3.55, 2.05, 1.38, 1.0, 0.78, 0.64], finalDrive: 4.05, wheelRadiusM: 0.32,
    tankL: 60, driveWheels: 2, groundClearanceM: 0.14, seats: 5,
    tyreGrip: 0.92, fuel: 'petrol', litresPer100kmAt90: 7.2,
  },
  suv: {
    name: 'four-wheel drive', massKg: 2400, dragCd: 0.42, frontalAreaM2: 3.0,
    peakTorqueNm: 390, peakTorqueRpm: 3200, redlineRpm: 5200, idleRpm: 700,
    gears: [4.02, 2.34, 1.52, 1.0, 0.75], finalDrive: 3.9, wheelRadiusM: 0.4,
    tankL: 85, driveWheels: 4, groundClearanceM: 0.28, seats: 5,
    tyreGrip: 0.88, fuel: 'diesel', litresPer100kmAt90: 11.0,
  },
  quad: {
    name: 'quad bike', massKg: 320, dragCd: 0.9, frontalAreaM2: 1.1,
    peakTorqueNm: 60, peakTorqueRpm: 5500, redlineRpm: 8000, idleRpm: 1200,
    gears: [3.2, 1.9, 1.3, 1.0], finalDrive: 3.6, wheelRadiusM: 0.3,
    tankL: 18, driveWheels: 4, groundClearanceM: 0.3, seats: 2,
    tyreGrip: 0.78, fuel: 'petrol', litresPer100kmAt90: 6.0,
  },
  van: {
    name: 'panel van', massKg: 2600, dragCd: 0.5, frontalAreaM2: 4.1,
    peakTorqueNm: 360, peakTorqueRpm: 2800, redlineRpm: 4600, idleRpm: 720,
    gears: [4.1, 2.3, 1.5, 1.0, 0.8], finalDrive: 4.1, wheelRadiusM: 0.35,
    tankL: 80, driveWheels: 2, groundClearanceM: 0.18, seats: 3,
    tyreGrip: 0.8, fuel: 'diesel', litresPer100kmAt90: 10.5,
  },
};

/* Petrol goes off. Sealed in a tank out of the sun it is usable for months
   and questionable after a year; diesel keeps longer but grows things in
   the water at the bottom. A car that has stood since the world ended does
   not start on the first turn of the key, and that is the point. */
function fuelViability(fuel, ageDays) {
  const halfLifeDays = fuel === 'diesel' ? 540 : 180;
  return clamp01(Math.pow(0.5, ageDays / halfLifeDays));
}

class Vehicle {
  constructor(opts = {}) {
    const spec = VEHICLE_SPEC[opts.type] || VEHICLE_SPEC.pickup;
    this.spec = spec;
    this.type = opts.type || 'pickup';
    this.name = opts.name || spec.name;
    this.x = opts.x || 0; this.y = opts.y || 0; this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speedMs = 0;
    this.rpm = 0;
    this.gear = 0;                       // index into spec.gears; -1 reverse
    this.running = false;

    this.fuelL = opts.fuelL != null ? opts.fuelL : 0;
    this.fuelAgeDays = opts.fuelAgeDays != null ? opts.fuelAgeDays : 400;
    this.batteryCharge = opts.batteryCharge != null ? opts.batteryCharge : 0;
    this.hasBattery = opts.hasBattery !== false;
    this.engineCondition = opts.engineCondition != null ? opts.engineCondition : 0.6;
    this.tyres = [1, 1, 1, 1].map((v, i) => (opts.tyres ? opts.tyres[i] : 0.6 + Math.random() * 0.4));
    this.bodyIntegrity = opts.bodyIntegrity != null ? opts.bodyIntegrity : 0.7;
    this.oilLevel = opts.oilLevel != null ? opts.oilLevel : 0.5;
    this.coolantLevel = opts.coolantLevel != null ? opts.coolantLevel : 0.5;
    this.engineTempC = 15;
    this.odometerM = 0;
    this.driver = null;
    this.cargo = [];
    this.headlights = false;
  }

  get missing() {
    const m = [];
    if (!this.hasBattery) m.push('battery');
    if (this.fuelL < 1) m.push('fuel');
    if (this.oilLevel < 0.15) m.push('engine oil');
    if (this.coolantLevel < 0.15) m.push('coolant');
    if (this.tyres.filter((t) => t > 0.15).length < 3) m.push('a tyre');
    return m;
  }

  get flatTyres() { return this.tyres.filter((t) => t <= 0.15).length; }

  /* Turning the key. Every reason a real engine refuses is a reason here:
     a dead battery, stale petrol, no oil, a seized engine. */
  start(opts = {}) {
    const rng = opts.rng || Math.random;
    if (this.running) return { ok: true, already: true };
    if (!this.hasBattery) return { ok: false, reason: 'no battery' };
    if (this.batteryCharge < 0.12) return { ok: false, reason: 'the battery is flat', crank: true };
    if (this.fuelL < 0.5) return { ok: false, reason: 'no fuel' };
    if (this.oilLevel < 0.1) return { ok: false, reason: 'it will seize without oil' };

    const via = fuelViability(this.spec.fuel, this.fuelAgeDays);
    // Cranking costs charge whether or not it catches.
    this.batteryCharge = Math.max(0, this.batteryCharge - 0.06);
    const cold = clamp01((5 - (opts.airTempC != null ? opts.airTempC : 15)) / 25);
    /* Stale petrol does not make an engine harder to start, it makes it not
       start: the light ends have gone and what is left is varnish in the
       jets. So viability multiplies rather than subtracts. */
    let p = (0.35 + this.engineCondition * 0.55) * (0.25 + 0.75 * via) * (1 - cold * 0.5);
    p *= this.engineCondition > 0.2 ? 1 : 0.2;
    if (rng() > clamp01(p)) return { ok: false, reason: 'it turns over and does not catch', chance: clamp01(p) };
    this.running = true;
    this.rpm = this.spec.idleRpm;
    return { ok: true, chance: clamp01(p) };
  }

  stop() { this.running = false; this.rpm = 0; return this; }

  /* Engine torque against speed: a rising curve to the peak and a falling
     one after it, which is what gives a real engine a useful band. */
  torqueAt(rpm) {
    const s = this.spec;
    if (rpm < s.idleRpm * 0.5 || rpm > s.redlineRpm) return 0;
    const r = rpm / s.peakTorqueRpm;
    // Two-sided curve: torque peaks at 1.0 and falls off either side.
    const shape = r <= 1 ? 0.55 + 0.45 * r : Math.max(0, 1 - 0.55 * (r - 1) * (r - 1) * 3.2);
    return s.peakTorqueNm * shape * (0.4 + 0.6 * this.engineCondition);
  }

  gearRatio() {
    if (this.gear < 0) return -this.spec.gears[0] * 1.1;
    return this.spec.gears[Math.min(this.gear, this.spec.gears.length - 1)];
  }

  /* One step of the drivetrain. Throttle 0..1, brake 0..1, steer -1..1. */
  step(dt, opts = {}) {
    const s = this.spec;
    const throttle = clamp01(opts.throttle || 0);
    const brake = clamp01(opts.brake || 0);
    const grade = (opts.gradePct || 0) / 100;
    const surface = opts.surfaceGrip != null ? opts.surfaceGrip : 1;
    const mass = s.massKg + (opts.loadKg || 0);

    // Engine speed follows road speed through the gearbox.
    const ratio = this.gearRatio();
    const wheelOmega = this.speedMs / s.wheelRadiusM;
    this.rpm = this.running
      ? Math.max(s.idleRpm, Math.min(s.redlineRpm, (wheelOmega * Math.abs(ratio) * s.finalDrive * 60) / (2 * Math.PI)))
      : 0;

    let tractionN = 0;
    if (this.running && this.oilLevel > 0.05) {
      const torque = this.torqueAt(this.rpm) * throttle;
      tractionN = (torque * Math.abs(ratio) * s.finalDrive * 0.9) / s.wheelRadiusM;
      if (this.gear < 0) tractionN = -tractionN;
    }

    /* The friction circle. A tyre can only put down so much force, and a
       flat one puts down almost none. This is what makes gravel and a wet
       hillside different from tarmac. */
    const tyreHealth = this.tyres.reduce((a, b) => a + b, 0) / 4;
    const grip = s.tyreGrip * surface * (0.25 + 0.75 * tyreHealth);
    const maxTractionN = grip * mass * 9.80665 * (s.driveWheels === 4 ? 1 : 0.55);
    const slipping = Math.abs(tractionN) > maxTractionN;
    if (slipping) tractionN = Math.sign(tractionN) * maxTractionN;

    // Resistances.
    const rollingN = 0.014 * mass * 9.80665 * (2 - tyreHealth) * (1 / Math.max(0.3, surface));
    const rho = 1.225;
    const dragN = 0.5 * rho * s.dragCd * s.frontalAreaM2 * this.speedMs * this.speedMs;
    const gradeN = mass * 9.80665 * grade;
    const brakeN = brake * grip * mass * 9.80665 * 0.9;

    const v = this.speedMs;
    let netN = tractionN - Math.sign(v || 1) * (rollingN + dragN + brakeN) - gradeN;
    if (Math.abs(v) < 0.2 && throttle < 0.05 && !brake) netN = -Math.sign(v) * Math.min(Math.abs(v) * mass / dt, rollingN);
    this.speedMs += (netN / mass) * dt;
    if (brake > 0.5 && Math.abs(this.speedMs) < 0.4) this.speedMs = 0;

    /* Steering. A car understeers above the speed the friction circle
       supports, which is why you cannot take a bend at any speed you like. */
    if (opts.steer) {
      const wheelbase = s.wheelRadiusM * 7.5;
      const maxLatA = grip * 9.80665;
      const wanted = opts.steer * 0.55;                       // radians of wheel angle
      const radius = wheelbase / Math.max(0.02, Math.abs(Math.tan(wanted)));
      const latA = (this.speedMs * this.speedMs) / radius;
      const scale = latA > maxLatA ? maxLatA / latA : 1;      // understeer
      this.heading += Math.sign(wanted) * (Math.abs(this.speedMs) / radius) * scale * dt;
    }

    this.x += Math.sin(this.heading) * this.speedMs * dt;
    this.z += Math.cos(this.heading) * this.speedMs * dt;
    this.odometerM += Math.abs(this.speedMs) * dt;

    /* Fuel. Brake specific fuel consumption of a petrol engine is about
       300 g/kWh, which is where the litres come from — not from a rate
       per second. */
    if (this.running) {
      const powerW = Math.max(0, tractionN * Math.abs(this.speedMs)) + (this.rpm / s.redlineRpm) * 6000;
      const gPerS = (powerW / 1000) * (this.spec.fuel === 'diesel' ? 0.21 : 0.30) / 3.6;
      const density = this.spec.fuel === 'diesel' ? 0.832 : 0.745;
      this.fuelL = Math.max(0, this.fuelL - (gPerS * dt) / (density * 1000));
      if (this.fuelL <= 0) { this.running = false; }
      // Charging, and the engine warming up.
      this.batteryCharge = Math.min(1, this.batteryCharge + dt * 0.002);
      const load = clamp01(powerW / 40000);
      // With coolant it settles at a thermostat temperature; without, there
      // is nothing carrying the heat away and it climbs until something
      // gives.
      const target = (70 + load * 35) * (this.coolantLevel > 0.2 ? 1 : 1.7);
      this.engineTempC += (target - this.engineTempC) * clamp01(dt / 120);
      if (this.engineTempC > 118) {
        // Overheating with no coolant destroys the engine, permanently.
        this.engineCondition = Math.max(0, this.engineCondition - dt * 0.004);
        if (this.engineCondition <= 0.02) this.running = false;
      }
    } else {
      this.engineTempC += (15 - this.engineTempC) * clamp01(dt / 600);
      if (this.headlights) this.batteryCharge = Math.max(0, this.batteryCharge - dt * 0.00035);
    }

    // Oil burns in a tired engine, and a dry engine is a dead engine.
    if (this.running) this.oilLevel = Math.max(0, this.oilLevel - dt * 2e-6 * (1.6 - this.engineCondition));

    return { slipping, tractionN, dragN, rollingN };
  }

  /* A crash. The energy is the same energy the injury model wants, so a
     collision at speed is handed straight to it rather than being scaled
     into a health bar. */
  collide(closingSpeedMs, opts = {}) {
    const mass = this.spec.massKg + (opts.loadKg || 0);
    const energyJ = 0.5 * mass * closingSpeedMs * closingSpeedMs;
    const crumple = opts.crumpleM != null ? opts.crumpleM : 0.55;
    const decelG = (closingSpeedMs * closingSpeedMs) / (2 * crumple) / 9.80665;
    this.bodyIntegrity = Math.max(0, this.bodyIntegrity - clamp01(energyJ / 400000));
    if (closingSpeedMs > 12) this.engineCondition = Math.max(0, this.engineCondition - clamp01(energyJ / 900000));
    if (closingSpeedMs > 6) {
      const t = (Math.random() * 4) | 0;
      this.tyres[t] = Math.max(0, this.tyres[t] - 0.4);
    }
    this.speedMs *= 0.15;
    /* An unbelted occupant meets the interior at the speed the car was
       doing; a belted one rides the crumple zone down. The difference is
       roughly a factor of six in peak deceleration, and it is the whole
       reason seatbelts exist. */
    const belted = opts.belted !== false;
    return {
      energyJ,
      decelG: belted ? decelG : decelG * 5.5,
      occupantEnergyJ: 0.5 * (opts.occupantMassKg || 80) * closingSpeedMs * closingSpeedMs * (belted ? 0.18 : 1),
      wrecked: this.bodyIntegrity <= 0.05,
    };
  }

  /* Shooting a car is not shooting a wall: the layer stack says what a
     bullet does to a door, an engine block or a tyre. */
  hitBy(part) {
    if (part === 'tyre') { const t = (Math.random() * 4) | 0; this.tyres[t] = 0; return 'tyre destroyed'; }
    if (part === 'engine') { this.engineCondition = Math.max(0, this.engineCondition - 0.25); if (this.engineCondition < 0.15) this.running = false; return 'engine damaged'; }
    if (part === 'tank') { this.fuelL = Math.max(0, this.fuelL * 0.4); return 'fuel leaking'; }
    if (part === 'radiator') { this.coolantLevel = 0; return 'coolant lost'; }
    this.bodyIntegrity = Math.max(0, this.bodyIntegrity - 0.03);
    return 'holed';
  }

  refuel(litres, opts = {}) {
    this.fuelL = Math.min(this.spec.tankL, this.fuelL + litres);
    // Fresh fuel dilutes the old stuff rather than replacing it.
    const fresh = opts.ageDays != null ? opts.ageDays : 0;
    const total = Math.max(0.001, this.fuelL);
    this.fuelAgeDays = (this.fuelAgeDays * (total - litres) + fresh * litres) / total;
    return this.fuelL;
  }

  describe() {
    const m = this.missing;
    return {
      name: this.name,
      running: this.running,
      speedKph: Math.abs(this.speedMs) * 3.6,
      fuelL: this.fuelL,
      fuelPct: this.fuelL / this.spec.tankL,
      fuelViability: fuelViability(this.spec.fuel, this.fuelAgeDays),
      engineCondition: this.engineCondition,
      flatTyres: this.flatTyres,
      missing: m,
      driveable: m.length === 0 && this.engineCondition > 0.15,
    };
  }
}
