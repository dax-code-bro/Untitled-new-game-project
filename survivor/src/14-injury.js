/* ============================================================
   INJURY — wounds, breaks, bleeds and the lights going out.

   Damage here is anatomical, not a hit-point pool. A round through
   the thigh is a femoral bleed with a clock on it; the same round
   through the forearm is an inconvenience. That distinction is the
   whole reason to simulate injury at all, and it is what makes a
   knocked-out player in multiplayer a person lying on the floor for
   a measurable, causally-determined length of time rather than a
   respawn timer.
   ============================================================ */

/* Regions carry the properties that decide what a hit means: how much
   blood is behind them, what breaks, and how quickly a bleed there kills.
   `bleedScale` multiplies the base haemorrhage rate for a given wound. */
const BODY_REGION = {
  head:      { id: 'head', massFraction: 0.081, bleedScale: 1.3, vital: true,  bone: 'skull',    tourniquetable: false },
  neck:      { id: 'neck', massFraction: 0.020, bleedScale: 3.4, vital: true,  bone: 'cervical', tourniquetable: false },
  thorax:    { id: 'thorax', massFraction: 0.216, bleedScale: 2.6, vital: true, bone: 'ribs',    tourniquetable: false },
  abdomen:   { id: 'abdomen', massFraction: 0.139, bleedScale: 2.2, vital: true, bone: null,     tourniquetable: false },
  pelvis:    { id: 'pelvis', massFraction: 0.142, bleedScale: 2.4, vital: true, bone: 'pelvis',  tourniquetable: false },
  upperArm:  { id: 'upperArm', massFraction: 0.033, bleedScale: 1.1, vital: false, bone: 'humerus', tourniquetable: true },
  forearm:   { id: 'forearm', massFraction: 0.019, bleedScale: 0.7, vital: false, bone: 'radius',  tourniquetable: true },
  hand:      { id: 'hand', massFraction: 0.006, bleedScale: 0.4, vital: false, bone: 'metacarpal', tourniquetable: true },
  thigh:     { id: 'thigh', massFraction: 0.100, bleedScale: 2.8, vital: false, bone: 'femur',   tourniquetable: true },
  lowerLeg:  { id: 'lowerLeg', massFraction: 0.047, bleedScale: 1.2, vital: false, bone: 'tibia', tourniquetable: true },
  foot:      { id: 'foot', massFraction: 0.014, bleedScale: 0.5, vital: false, bone: 'metatarsal', tourniquetable: true },
};

/* Bones, with the healing times orthopaedics actually quotes. A broken femur
   is a campaign-ending injury on an island with no surgeon, and it should be. */
const BONE = {
  skull:      { name: 'skull', breakEnergyJ: 2200, healDays: 84, immobilises: null },
  cervical:   { name: 'cervical spine', breakEnergyJ: 1900, healDays: 120, immobilises: 'all' },
  ribs:       { name: 'ribs', breakEnergyJ: 700, healDays: 42, immobilises: 'torso' },
  pelvis:     { name: 'pelvis', breakEnergyJ: 2900, healDays: 90, immobilises: 'legs' },
  humerus:    { name: 'humerus', breakEnergyJ: 1500, healDays: 56, immobilises: 'arm' },
  radius:     { name: 'radius', breakEnergyJ: 900, healDays: 42, immobilises: 'arm' },
  metacarpal: { name: 'hand bone', breakEnergyJ: 400, healDays: 35, immobilises: 'hand' },
  femur:      { name: 'femur', breakEnergyJ: 4000, healDays: 112, immobilises: 'legs' },
  tibia:      { name: 'tibia', breakEnergyJ: 2200, healDays: 84, immobilises: 'legs' },
  metatarsal: { name: 'foot bone', breakEnergyJ: 350, healDays: 42, immobilises: 'foot' },
};

/* Wound archetypes. `bleedLps` is litres per second before any dressing,
   before the region multiplier. A severed femoral artery — arterial, thigh,
   full severity — comes out at about 25 mL/s, which takes an adult to class
   IV shock in a minute and a half and kills in three. That is the published
   picture, and it is also roughly a third of resting cardiac output, which
   is the right order for one large vessel. */
const WOUND_TYPE = {
  abrasion:   { id: 'abrasion',   bleedLps: 0.00004, infectionRisk: 0.10, healDays: 4 },
  laceration: { id: 'laceration', bleedLps: 0.00060, infectionRisk: 0.25, healDays: 10 },
  puncture:   { id: 'puncture',   bleedLps: 0.00035, infectionRisk: 0.45, healDays: 14 },
  gunshot:    { id: 'gunshot',    bleedLps: 0.00260, infectionRisk: 0.55, healDays: 30 },
  arterial:   { id: 'arterial',   bleedLps: 0.00900, infectionRisk: 0.50, healDays: 35 },
  burn:       { id: 'burn',       bleedLps: 0.00010, infectionRisk: 0.60, healDays: 21 },
  bite:       { id: 'bite',       bleedLps: 0.00110, infectionRisk: 0.75, healDays: 16 },
  crush:      { id: 'crush',      bleedLps: 0.00090, infectionRisk: 0.35, healDays: 28 },
};

/* Field interventions, best first. Each states what it actually does,
   because "heals you" is not a mechanic — stopping a bleed and closing a
   wound are different jobs and the player should have to know which. */
const CARE = {
  directPressure: { id: 'directPressure', stopsBleed: 0.65, cleans: 0.0, closes: 0.0, temporary: true },
  pressureDressing:{ id: 'pressureDressing', stopsBleed: 0.85, cleans: 0.3, closes: 0.2 },
  tourniquet:     { id: 'tourniquet', stopsBleed: 1.0, cleans: 0.0, closes: 0.0, limbOnly: true, ischaemic: true },
  woundPacking:   { id: 'woundPacking', stopsBleed: 0.9, cleans: 0.2, closes: 0.1, junctionalOnly: true },
  hemostaticGauze:{ id: 'hemostaticGauze', stopsBleed: 0.95, cleans: 0.4, closes: 0.3 },
  sutures:        { id: 'sutures', stopsBleed: 0.9, cleans: 0.5, closes: 1.0 },
  cautery:        { id: 'cautery', stopsBleed: 0.95, cleans: 0.7, closes: 0.8, causesBurn: true },
  irrigate:       { id: 'irrigate', stopsBleed: 0.0, cleans: 0.85, closes: 0.0 },
  antiseptic:     { id: 'antiseptic', stopsBleed: 0.0, cleans: 0.95, closes: 0.0 },
  splint:         { id: 'splint', stopsBleed: 0, cleans: 0, closes: 0, stabilisesBone: true },
};


class Wound {
  constructor(opts) {
    this.type = WOUND_TYPE[opts.type] || WOUND_TYPE.laceration;
    this.region = BODY_REGION[opts.region] || BODY_REGION.thorax;
    this.severity = clamp01(opts.severity != null ? opts.severity : 0.5);
    this.ageDays = 0;
    this.bleedControl = 0;       // 0..1, how much of the bleed is stopped
    this.cleanliness = opts.clean ? 0.9 : 0.1;
    this.closed = false;
    this.tourniquetSeconds = 0;
    this.infected = false;
    this.healed = false;
    this.contaminatedWithSoil = !!opts.soil;
  }

  /* Litres per second, right now. */
  bleedRate() {
    if (this.healed) return 0;
    // A wound clots on its own given time; a big one clots slower, and an
    // artery does not clot at all in any time that matters.
    const clotting = this.type === WOUND_TYPE.arterial
      ? clamp01(this.ageDays * 0.05)
      : clamp01(this.ageDays / (0.15 + this.severity * 0.6));
    const open = (1 - this.bleedControl) * (1 - clotting) * (this.closed ? 0.15 : 1);
    return this.type.bleedLps * this.severity * this.region.bleedScale * open;
  }

  apply(careId) {
    const c = CARE[careId];
    if (!c) return { ok: false, reason: 'unknown intervention' };
    if (c.limbOnly && !this.region.tourniquetable) {
      // A tourniquet on a neck or a torso is not a treatment, and the game
      // should say so rather than quietly applying it.
      return { ok: false, reason: `a tourniquet cannot go on the ${this.region.id}` };
    }
    this.bleedControl = Math.max(this.bleedControl, c.stopsBleed);
    this.cleanliness = Math.max(this.cleanliness, c.cleans);
    if (c.closes >= 1) this.closed = true;
    if (careId === 'tourniquet') this.tourniquet = true;
    if (c.causesBurn) this.cleanliness = Math.max(this.cleanliness, 0.7);
    return { ok: true, bleedRate: this.bleedRate() };
  }

  step(days) {
    if (this.healed) return;
    this.ageDays += days;
    if (this.tourniquet) this.tourniquetSeconds += days * 86400;
    const rate = this.closed ? 1.6 : 1.0;
    const infectionDrag = this.infected ? 0.35 : 1.0;
    if (this.ageDays * rate * infectionDrag >= this.type.healDays * (0.5 + this.severity)) {
      this.healed = true;
    }
  }
}


class InjurySystem {
  constructor(opts = {}) {
    this.wounds = [];
    this.fractures = [];
    this.concussion = null;
    this.unconsciousUntil = 0;    // simulated seconds
    this.painLevel = 0;
    this.rng = opts.rng || Math.random;
  }

  /* --- wounds --- */
  wound(opts) {
    const w = new Wound(opts);
    this.wounds.push(w);
    return w;
  }

  /* --- fractures ---
     Whether a bone breaks is decided by the energy delivered to it, so the
     same fall breaks a tibia and not a femur, and a .50 does not merely
     "damage" a limb. */
  tryFracture(regionId, energyJ) {
    const region = BODY_REGION[regionId];
    if (!region || !region.bone) return null;
    const bone = BONE[region.bone];
    if (energyJ < bone.breakEnergyJ * 0.6) return null;
    // Between 60% and 100% of the threshold it is a coin weighted by how
    // close you got; above it, the bone goes.
    const p = clamp01((energyJ - bone.breakEnergyJ * 0.6) / (bone.breakEnergyJ * 0.4));
    if (this.rng() > p) return null;
    const fx = {
      bone: region.bone, name: bone.name, region: regionId,
      compound: energyJ > bone.breakEnergyJ * 2.2,   // bone through skin
      splinted: false, healDays: bone.healDays, ageDays: 0, healed: false,
      immobilises: bone.immobilises,
    };
    this.fractures.push(fx);
    if (fx.compound) {
      // An open fracture is a wound as well as a break, and it is the one
      // most likely to go septic.
      this.wound({ type: 'laceration', region: regionId, severity: 0.8, soil: true });
    }
    return fx;
  }

  splint(boneId) {
    const fx = this.fractures.find((f) => f.bone === boneId && !f.healed);
    if (!fx) return { ok: false, reason: 'no such untreated fracture' };
    fx.splinted = true;
    return { ok: true };
  }

  /* --- concussion and unconsciousness ---

     Head injury is graded by the energy that reached the skull. The
     unconsciousness that follows is what multiplayer needs: a knockout is
     not a coin flip, it is a duration you can read off the severity of the
     hit. A graze puts someone down for a couple of minutes; a rifle butt to
     the temple puts them down for the rest of the day.

     `dayLengthSeconds` is passed in so the durations below stay anchored to
     the game's own clock rather than to wall time. */
  headImpact(energyJ, dayLengthSeconds, now) {
    // Below roughly 60 J a blow to the head hurts and does nothing else.
    if (energyJ < 60) return null;
    const skull = BONE.skull.breakEnergyJ;
    const grade = clamp01((energyJ - 60) / (skull - 60));

    // Duration is exponential in grade between the two ends the design calls
    // for: three game-minutes at the light end, a full game-day at the point
    // the skull is about to fail.
    const minSec = 3 * (dayLengthSeconds / 1440);        // 3 game-minutes
    const maxSec = dayLengthSeconds;                      // one full game-day
    const seconds = minSec * Math.pow(maxSec / minSec, grade);

    this.concussion = {
      grade,
      severity: grade < 0.25 ? 'mild' : grade < 0.6 ? 'moderate' : 'severe',
      // Post-concussive symptoms outlast the unconsciousness by a long way.
      symptomDays: 1 + grade * 20,
      ageDays: 0,
    };
    this.unconsciousUntil = Math.max(this.unconsciousUntil, now + seconds);
    if (energyJ > skull) this.tryFracture('head', energyJ);
    return { seconds, grade, severity: this.concussion.severity };
  }

  /* Falls. Impact energy is the kinetic energy at landing, but what reaches
     the skeleton depends enormously on what you land on and whether you roll
     — which is why the same fall onto snow and onto concrete are different
     injuries. */
  fall(velocityMs, massKg, surface = 'dirt', dayLengthSeconds = 2400, now = 0) {
    const stoppingDistance = {
      concrete: 0.02, asphalt: 0.03, wood: 0.05, dirt: 0.08,
      grass: 0.12, sand: 0.22, mud: 0.25, snow: 0.35, water: 0.6, brush: 0.3,
    }[surface] || 0.08;

    const ke = 0.5 * massKg * velocityMs * velocityMs;
    // The force is what injures; a longer stop is a smaller force for the
    // same energy. This is why landing surface matters more than height does.
    const decelG = (velocityMs * velocityMs) / (2 * stoppingDistance * UNIT.GRAVITY);
    if (velocityMs < 3.5) return { ke, decelG, injuries: [] };

    const injuries = [];
    // Below about 4 m/s (a 0.8 m drop) nothing happens; at 10 m/s (5 m) legs
    // start breaking; past 15 m/s (11.5 m) survival is the exception.
    // Energy travels up the skeleton and is absorbed on the way, so the
    // tibia takes the brunt and the pelvis takes what is left. That ordering
    // is why ankles and shins break in falls far more often than hips do.
    let legEnergy = ke * 0.45;
    for (const r of ['lowerLeg', 'thigh', 'pelvis']) {
      const fx = this.tryFracture(r, legEnergy);
      if (fx) injuries.push(fx.name);
      legEnergy *= 0.6;
    }
    if (decelG > 90) {
      const hit = this.headImpact(ke * 0.12, dayLengthSeconds, now);
      if (hit) injuries.push(`concussion (${hit.severity})`);
    }
    if (velocityMs > 8) {
      this.wound({ type: 'abrasion', region: 'thigh', severity: clamp01(velocityMs / 20) });
    }
    return { ke, decelG, injuries };
  }

  /* --- state --- */
  isUnconscious(now) { return now < this.unconsciousUntil; }

  /* Total blood loss rate. Two ceilings apply, and both are real: you cannot
     lose blood faster than the heart moves it, and as pressure falls the
     bleeding itself slows — which is why severe haemorrhage has a long
     unpleasant tail rather than a clean end. */
  totalBleedLps(physiology) {
    let t = 0;
    for (const w of this.wounds) t += w.bleedRate();
    if (physiology) {
      const perfusion = 1 - 0.75 * clamp01(physiology.bloodLossFraction / 0.5);
      t *= perfusion;
      t = Math.min(t, 0.083);            // resting cardiac output, ~5 L/min
    }
    return t;
  }

  /* Ischaemia clock. A tourniquet is the correct answer to a limb
     haemorrhage and a wrong answer to leave on: past about two hours the
     limb starts dying, and the game tells you so rather than letting you
     forget. */
  tourniquetWarnings() {
    return this.wounds
      .filter((w) => w.tourniquet && !w.healed)
      .map((w) => ({
        region: w.region.id,
        minutes: w.tourniquetSeconds / 60,
        state: w.tourniquetSeconds > 7200 ? 'limb is dying'
          : w.tourniquetSeconds > 3600 ? 'nerve damage likely' : 'safe for now',
      }));
  }

  capacityMultiplier() {
    let m = 1;
    for (const fx of this.fractures) {
      if (fx.healed) continue;
      const relief = fx.splinted ? 0.45 : 1;
      if (fx.immobilises === 'legs') m *= 1 - 0.85 * relief;
      else if (fx.immobilises === 'arm') m *= 1 - 0.35 * relief;
      else if (fx.immobilises === 'torso') m *= 1 - 0.30 * relief;
      else if (fx.immobilises === 'all') m *= 0.05;
      else m *= 1 - 0.12 * relief;
    }
    if (this.concussion && this.concussion.ageDays < this.concussion.symptomDays) {
      m *= 1 - 0.4 * this.concussion.grade
        * (1 - this.concussion.ageDays / this.concussion.symptomDays);
    }
    m *= 1 - 0.5 * clamp01(this.painLevel);
    return clamp01(m);
  }

  step(dt, physiology, diseaseSystem) {
    const days = dt / 86400;

    const bleed = this.totalBleedLps(physiology);
    if (bleed > 0 && physiology) physiology.bleed(bleed, dt);

    let pain = 0;
    for (const w of this.wounds) {
      w.step(days);
      if (w.healed) continue;
      pain += w.severity * 0.35;
      // A dirty wound is how tetanus and cellulitis get in — routed through
      // the disease system so there is one model of infection, not two.
      if (diseaseSystem && !w.infected && this.rng() < w.type.infectionRisk * (1 - w.cleanliness) * days) {
        w.infected = true;
        diseaseSystem.expose('dirtyWound', { hygiene: w.cleanliness, load: w.severity + 0.5 });
        if (w.contaminatedWithSoil) {
          diseaseSystem.expose('soilContaminatedWound', { hygiene: w.cleanliness, load: w.severity + 0.5 });
        }
      }
    }
    for (const fx of this.fractures) {
      if (fx.healed) continue;
      fx.ageDays += days * (fx.splinted ? 1.0 : 0.55);   // an unsplinted break barely heals
      pain += fx.splinted ? 0.25 : 0.6;
      if (fx.ageDays >= fx.healDays) fx.healed = true;
    }
    if (this.concussion) this.concussion.ageDays += days;

    this.painLevel = clamp01(pain);
    this.wounds = this.wounds.filter((w) => !w.healed || w.ageDays < 60);
    return this;
  }

  summary() {
    return {
      wounds: this.wounds.filter((w) => !w.healed).map((w) => ({
        type: w.type.id, region: w.region.id, severity: w.severity,
        bleedLps: w.bleedRate(), controlled: w.bleedControl > 0.6,
        infected: w.infected, closed: w.closed,
      })),
      fractures: this.fractures.filter((f) => !f.healed).map((f) => ({
        bone: f.name, compound: f.compound, splinted: f.splinted,
        daysRemaining: Math.max(0, f.healDays - f.ageDays),
      })),
      concussion: this.concussion && this.concussion.ageDays < this.concussion.symptomDays
        ? this.concussion.severity : null,
      bleedLps: this.totalBleedLps(),
      pain: this.painLevel,
      tourniquets: this.tourniquetWarnings(),
    };
  }
}
