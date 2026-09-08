/* ============================================================
   ELECTRICITY — volts, amps, ohms, and the consequences of
   getting them wrong.

   The design asks that building your own house means going through
   what building a real house means, and wiring is the part of that
   which can kill you twice: once by burning the place down and once
   by stopping your heart. So circuits here carry real conductor
   resistance, real breaker ratings and real ampacity, and the shock
   model uses the published current thresholds — because "do not
   work on it live" should be a lesson the game can actually teach.
   ============================================================ */

/* American Wire Gauge: resistance in ohms per kilometre of one
   conductor at 25 C, and the ampacity the code allows for it. The two
   together are why you cannot run a workshop off lighting cable. */
const AWG = {
  18: { ohmPerKm: 20.95, ampacity: 7 },
  16: { ohmPerKm: 13.17, ampacity: 10 },
  14: { ohmPerKm: 8.286, ampacity: 15 },
  12: { ohmPerKm: 5.211, ampacity: 20 },
  10: { ohmPerKm: 3.277, ampacity: 30 },
  8:  { ohmPerKm: 2.061, ampacity: 40 },
  6:  { ohmPerKm: 1.296, ampacity: 55 },
  4:  { ohmPerKm: 0.815, ampacity: 70 },
  2:  { ohmPerKm: 0.513, ampacity: 95 },
  0:  { ohmPerKm: 0.322, ampacity: 125 },
};

/* Body resistance, hand to hand, in ohms. The spread is enormous and it is
   the single thing that decides whether a shock is a fright or a funeral:
   dry skin is a hundred times the resistance of wet skin, and a cut through
   the callus removes the protection entirely. */
const BODY_RESISTANCE = {
  dry: 15000,
  damp: 3000,
  wet: 1000,
  immersed: 500,
  brokenSkin: 300,     // internal resistance alone; the skin is no longer in circuit
};

/* Effects of 50-60 Hz current through the trunk, in amperes. These are the
   standard published thresholds and they are unforgivingly close together —
   the difference between "cannot let go" and "fibrillation" is a factor of
   five, which is why a slightly wetter hand is a different accident. */
const SHOCK_THRESHOLDS = [
  { amps: 0.001, effect: 'perception', text: 'a tingle' },
  { amps: 0.005, effect: 'startle', text: 'a jolt you snatch your hand back from' },
  { amps: 0.010, effect: 'letGo', text: 'the muscles clamp — you cannot let go' },
  { amps: 0.030, effect: 'respiratory', text: 'the chest locks up and you stop breathing' },
  { amps: 0.050, effect: 'fibrillation', text: 'the heart goes to fibrillation' },
  { amps: 2.0, effect: 'arrest', text: 'cardiac arrest and deep burns' },
];


class Conductor {
  constructor(gauge, lengthM, opts = {}) {
    this.gauge = gauge;
    this.lengthM = lengthM;
    this.spec = AWG[gauge] || AWG[14];
    this.material = opts.material || 'copper';
    // Aluminium conductors of the same gauge carry about 61% of copper's
    // conductance, which is why a like-for-like swap overheats.
    const k = this.material === 'aluminium' ? 1 / 0.61 : 1;
    // Out and back: a circuit is two conductors long.
    this.resistance = (this.spec.ohmPerKm / 1000) * lengthM * 2 * k;
    this.ampacity = this.spec.ampacity * (this.material === 'aluminium' ? 0.78 : 1);
    this.damaged = !!opts.damaged;
    this.insulation = opts.insulation != null ? opts.insulation : 1;   // 0 = bare
    this.temperatureC = 25;
  }

  /* Conductors heat as the square of the current. Past ampacity they cook
     their insulation, and bare conductors in a wall cavity are how a house
     burns down at three in the morning. */
  step(dt, amps, ambientC = 20) {
    const heating = (amps * amps) * this.resistance;      // watts
    const cooling = (this.temperatureC - ambientC) * 0.9 * Math.max(this.lengthM, 0.5);
    this.temperatureC += ((heating - cooling) * dt) / (Math.max(this.lengthM, 0.5) * 380);
    if (this.temperatureC > 90) {
      this.insulation = Math.max(0, this.insulation - dt * (this.temperatureC - 90) * 0.0006);
    }
    return {
      temperatureC: this.temperatureC,
      overloaded: amps > this.ampacity,
      insulationFailing: this.insulation < 0.35,
      fireRisk: this.temperatureC > 150 && this.insulation < 0.5,
    };
  }
}


class Load {
  constructor(opts) {
    this.name = opts.name || 'load';
    this.watts = opts.watts || 0;
    this.voltage = opts.voltage || 120;
    this.on = !!opts.on;
    /* Motors draw several times their running current for the moment it
       takes to get turning. It is why the lights dim when the fridge kicks
       in, and why a circuit that runs a saw fine trips when you start it. */
    this.inrushMultiple = opts.inrushMultiple != null ? opts.inrushMultiple
      : (opts.motor ? 6 : 1);
    this.inrushRemaining = 0;
    this.motor = !!opts.motor;
    this.resistive = !opts.motor;
    this.powerFactor = opts.powerFactor != null ? opts.powerFactor : (opts.motor ? 0.8 : 1);
    this.broken = !!opts.broken;
  }

  switchOn() { this.on = true; this.inrushRemaining = this.motor ? 0.35 : 0; }
  switchOff() { this.on = false; this.inrushRemaining = 0; }

  currentA(actualVoltage) {
    if (!this.on || this.broken) return 0;
    // Resistive loads draw less current at lower voltage; a motor tries to
    // hold its power and draws more, which is how brownouts kill compressors.
    const base = this.motor
      ? this.watts / (Math.max(actualVoltage, 40) * this.powerFactor)
      : (this.watts / this.voltage) * (actualVoltage / this.voltage);
    return base * (this.inrushRemaining > 0 ? this.inrushMultiple : 1);
  }

  step(dt) { if (this.inrushRemaining > 0) this.inrushRemaining -= dt; }
}


class Circuit {
  constructor(opts = {}) {
    this.name = opts.name || 'circuit';
    this.breakerA = opts.breakerA != null ? opts.breakerA : 15;
    this.conductor = opts.conductor || new Conductor(opts.gauge || 14, opts.lengthM || 20);
    this.loads = [];
    this.tripped = false;
    this.gfci = !!opts.gfci;
    this.gfciTripMa = 5;        // the code figure for personnel protection
    this.leakageA = 0;
    this.faults = [];           // { kind: 'short'|'ground'|'open', ... }
    this.nominalV = opts.voltage || 120;
  }

  add(load) { this.loads.push(load); return load; }

  /* Solve the circuit. Loads are in parallel across the supply, and the
     conductor is in series with all of them — so every extra load drops the
     voltage a little for everything else on that run. That is why the lights
     dim, and it is the same arithmetic in the game as on paper. */
  solve(supplyV) {
    if (this.tripped) return { volts: 0, amps: 0, drop: 0 };
    if (this.faults.some((f) => f.kind === 'open')) return { volts: 0, amps: 0, drop: 0, open: true };

    let volts = supplyV;
    let amps = 0;
    // Two passes: guess at nominal, then re-solve at the sagged voltage.
    for (let iter = 0; iter < 3; iter++) {
      amps = 0;
      for (const l of this.loads) amps += l.currentA(volts);
      for (const f of this.faults) {
        // A dead short is limited only by the conductor, which is why it
        // draws hundreds of amps and why the breaker exists.
        if (f.kind === 'short') amps += supplyV / Math.max(this.conductor.resistance + 0.02, 0.02);
        if (f.kind === 'ground') { this.leakageA = f.leakageA || 0.08; amps += this.leakageA; }
      }
      const drop = amps * this.conductor.resistance;
      volts = Math.max(0, supplyV - drop);
    }
    return { volts, amps, drop: supplyV - volts };
  }

  step(dt, supplyV, ambientC = 20) {
    for (const l of this.loads) l.step(dt);
    const s = this.solve(supplyV);
    const wire = this.conductor.step(dt, s.amps, ambientC);

    const events = [];
    /* Breakers are thermal-magnetic: a small overload takes time to trip and
       a dead short trips instantly. Modelling both is what makes the
       difference between a breaker you can nurse and one you cannot. */
    if (s.amps > this.breakerA * 5) {
      this.tripped = true;
      events.push({ kind: 'breaker', instant: true, text: `${this.name}: breaker snapped straight out` });
    } else if (s.amps > this.breakerA) {
      this._overloadS = (this._overloadS || 0) + dt * (s.amps / this.breakerA);
      if (this._overloadS > 12) {
        this.tripped = true;
        this._overloadS = 0;
        events.push({ kind: 'breaker', instant: false, text: `${this.name}: breaker tripped on overload` });
      }
    } else {
      this._overloadS = Math.max(0, (this._overloadS || 0) - dt * 0.5);
    }

    if (this.gfci && this.leakageA * 1000 > this.gfciTripMa) {
      this.tripped = true;
      events.push({ kind: 'gfci', text: `${this.name}: ground fault device tripped` });
    }
    if (wire.fireRisk) events.push({ kind: 'fire', text: `${this.name}: the cable is smoking in the wall` });
    else if (wire.overloaded) events.push({ kind: 'hot', text: `${this.name}: the cable is running hot` });
    // A sag past about 12% dims lights visibly and starts stalling motors.
    if (s.volts < this.nominalV * 0.88 && s.amps > 0) {
      events.push({ kind: 'sag', text: `${this.name}: ${s.volts.toFixed(0)} V at the outlet` });
    }
    return { volts: s.volts, amps: s.amps, drop: s.drop, wire, events };
  }

  reset() {
    if (this.faults.some((f) => f.kind === 'short')) {
      // Resetting into a fault just trips it again, which is the correct and
      // very annoying real behaviour.
      return { ok: false, reason: 'it trips straight back out — find the fault first' };
    }
    this.tripped = false;
    this.leakageA = 0;
    this._overloadS = 0;
    return { ok: true };
  }
}


class PowerSource {
  constructor(opts = {}) {
    this.name = opts.name || 'source';
    this.kind = opts.kind || 'generator';      // generator | solar | battery | grid | hand
    this.nominalV = opts.voltage || 240;
    this.capacityW = opts.capacityW || 5000;
    this.fuelL = opts.fuelL || 0;
    this.fuelCapacityL = opts.fuelCapacityL || 20;
    // A small diesel burns roughly 0.28 litres per kilowatt-hour.
    this.litresPerKWh = opts.litresPerKWh != null ? opts.litresPerKWh : 0.30;
    this.running = false;
    this.batteryKWh = opts.batteryKWh || 0;
    this.batteryChargeKWh = opts.batteryChargeKWh || 0;
    this.solarKW = opts.solarKW || 0;
    this.runHours = 0;
    this.condition = opts.condition != null ? opts.condition : 1;
    this.serviceHours = opts.serviceHours || 100;
  }

  start() {
    if (this.kind === 'generator') {
      if (this.fuelL <= 0.05) return { ok: false, reason: 'no fuel' };
      if (this.condition < 0.2) return { ok: false, reason: 'it turns over and will not catch' };
      this.running = true;
      return { ok: true };
    }
    this.running = true;
    return { ok: true };
  }
  stop() { this.running = false; }

  /* How much this source can deliver right now, and what it costs to do it. */
  step(dt, demandW, env = {}) {
    const hours = dt / 3600;
    let availableW = 0;

    if (this.kind === 'generator') {
      if (!this.running) return { volts: 0, availableW: 0 };
      availableW = this.capacityW * (0.55 + 0.45 * this.condition);
      const deliveredW = Math.min(demandW, availableW);
      // Even idling it burns fuel; that is what makes a generator a decision
      // rather than a switch.
      const kWh = ((deliveredW * 0.85 + this.capacityW * 0.15) / 1000) * hours;
      this.fuelL = Math.max(0, this.fuelL - kWh * this.litresPerKWh);
      if (this.fuelL <= 0) { this.running = false; return { volts: 0, availableW: 0, ranDry: true }; }
      this.runHours += hours;
      this.condition = Math.max(0, this.condition - hours / (this.serviceHours * 12));
      // Loaded past its rating, the voltage and frequency both sag.
      const overload = clamp01((demandW - availableW) / Math.max(availableW, 1));
      return {
        volts: this.nominalV * (1 - 0.22 * overload) * (0.94 + 0.06 * this.condition),
        availableW, deliveredW, fuelL: this.fuelL,
        needsService: this.runHours > this.serviceHours,
      };
    }

    if (this.kind === 'solar') {
      // Output follows the sun's elevation and the cloud cover, because it
      // does. A battery bank is what makes it useful after dark.
      const sunAlt = env.sunAltitudeDeg != null ? env.sunAltitudeDeg : 0;
      const irradiance = Math.max(0, Math.sin((sunAlt * Math.PI) / 180))
        * (1 - 0.75 * (env.cloudCover || 0));
      const genKW = this.solarKW * irradiance;
      const drawKW = Math.min(demandW / 1000, genKW + this.batteryChargeKWh / Math.max(hours, 1e-6));
      const net = (genKW - drawKW) * hours;
      this.batteryChargeKWh = clampTo(this.batteryChargeKWh + net, 0, this.batteryKWh);
      availableW = (genKW + (this.batteryChargeKWh > 0.05 ? this.batteryKWh * 250 : 0)) * 1000;
      return {
        volts: this.batteryChargeKWh > 0.02 || genKW > 0.02 ? this.nominalV : 0,
        availableW, generatedKW: genKW, chargeKWh: this.batteryChargeKWh,
      };
    }

    if (this.kind === 'battery') {
      const drawKWh = (demandW / 1000) * hours;
      if (this.batteryChargeKWh <= 0) return { volts: 0, availableW: 0 };
      this.batteryChargeKWh = Math.max(0, this.batteryChargeKWh - drawKWh);
      // Lead-acid sags under load and recovers when you take the load off.
      const soc = this.batteryChargeKWh / Math.max(this.batteryKWh, 1e-6);
      return {
        volts: this.nominalV * (0.86 + 0.14 * soc),
        availableW: this.batteryKWh * 400, chargeKWh: this.batteryChargeKWh,
      };
    }
    return { volts: 0, availableW: 0 };
  }
}


class ElectricalSystem {
  constructor() {
    this.sources = [];
    this.circuits = [];
    this.mainBreakerA = 100;
    this.mainTripped = false;
    this.events = [];
  }

  addSource(s) { this.sources.push(s); return s; }
  addCircuit(c) { this.circuits.push(c); return c; }

  step(dt, env = {}) {
    this.events.length = 0;

    let demandW = 0;
    for (const c of this.circuits) {
      if (c.tripped) continue;
      const s = c.solve(this._bestVoltage());
      demandW += s.amps * s.volts;
    }

    let supplyV = 0, availableW = 0;
    for (const src of this.sources) {
      const r = src.step(dt, demandW, env);
      if (r.volts > supplyV) supplyV = r.volts;
      availableW += r.availableW || 0;
      if (r.ranDry) this.events.push({ kind: 'fuel', text: `${src.name} ran out of fuel` });
      if (r.needsService) this.events.push({ kind: 'service', text: `${src.name} is overdue an oil change` });
    }
    this._supplyV = supplyV;

    if (this.mainTripped) supplyV = 0;

    let totalA = 0;
    for (const c of this.circuits) {
      const r = c.step(dt, supplyV * (c.nominalV / 240 > 0.7 ? 1 : 0.5), env.airTempC);
      totalA += r.amps;
      for (const e of r.events) this.events.push(e);
    }
    if (totalA > this.mainBreakerA) {
      this.mainTripped = true;
      this.events.push({ kind: 'main', text: 'the main breaker went — the whole place is dark' });
    }

    return { supplyV, demandW, availableW, totalA, events: this.events };
  }

  _bestVoltage() {
    return this._supplyV != null ? this._supplyV : 240;
  }

  /* Touching something live. What happens is decided by the voltage, by how
     wet the person is, and by whether the current has a path through the
     chest — a hand-to-hand shock crosses the heart and a hand-to-same-side
     one mostly does not. */
  shock(circuit, opts = {}) {
    if (circuit.tripped) return { current: 0, effect: 'nothing — it is dead', fatal: false };
    const supply = this._bestVoltage() * (circuit.nominalV / 240 > 0.7 ? 1 : 0.5);
    const solved = circuit.solve(supply);
    const volts = solved.volts;
    if (volts < 25) return { current: 0, effect: 'nothing you would notice', fatal: false };

    const condition = opts.wet ? (opts.immersed ? 'immersed' : 'wet')
      : opts.damp ? 'damp' : opts.brokenSkin ? 'brokenSkin' : 'dry';
    let resistance = BODY_RESISTANCE[condition];
    // Boots and gloves are the whole difference and cost almost nothing.
    if (opts.insulatedBoots) resistance += 100000;
    if (opts.insulatedGloves) resistance += 200000;
    // Standing on damp concrete is a very good connection to earth.
    if (opts.groundedFooting) resistance *= 0.55;

    const current = volts / resistance;
    let effect = 'a tingle', fatal = false, letGo = false;
    for (const t of SHOCK_THRESHOLDS) {
      if (current >= t.amps) {
        effect = t.text;
        letGo = t.effect === 'letGo' || t.effect === 'respiratory' || t.effect === 'fibrillation';
        fatal = t.effect === 'fibrillation' || t.effect === 'arrest';
      }
    }
    // The device that exists precisely to stop this.
    if (circuit.gfci && current * 1000 > circuit.gfciTripMa) {
      circuit.tripped = true;
      return {
        current, effect: 'a hard jolt, and then the ground fault device cut it',
        fatal: false, letGo: false, savedByGfci: true,
      };
    }
    return { current, currentMa: current * 1000, effect, fatal, letGo, resistance, volts };
  }
}


/* Wiring a run correctly, which the design wants to be a job rather than a
   menu click. Gets checked against the same rules an inspector would use. */
function checkWiring(spec) {
  const problems = [];
  const gauge = AWG[spec.gauge];
  if (!gauge) return { ok: false, problems: ['that is not a wire gauge'] };

  if (spec.breakerA > gauge.ampacity) {
    problems.push(`a ${spec.breakerA} A breaker on ${spec.gauge} AWG — the breaker will never trip before the cable catches fire`);
  }
  const expectedLoadA = (spec.expectedLoadW || 0) / (spec.voltage || 120);
  if (expectedLoadA > spec.breakerA * 0.8) {
    problems.push('continuous load over 80% of the breaker rating');
  }
  const conductor = new Conductor(spec.gauge, spec.lengthM || 20);
  const dropV = expectedLoadA * conductor.resistance;
  const dropPct = (dropV / (spec.voltage || 120)) * 100;
  if (dropPct > 3) problems.push(`${dropPct.toFixed(1)}% voltage drop over that run — too long for this gauge`);
  if (spec.wet && !spec.gfci) problems.push('a wet location with no ground fault protection');
  if (!spec.ground) problems.push('no earth conductor');
  if (spec.aluminium && !spec.antioxidant) problems.push('aluminium terminated without antioxidant — it will loosen and arc');

  return { ok: problems.length === 0, problems, dropPct, conductor };
}
