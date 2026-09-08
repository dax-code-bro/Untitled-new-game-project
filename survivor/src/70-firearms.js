/* ============================================================
   FIREARMS — a weapon is an assembly of parts that wear out.

   The design asks that guns be taken apart, oiled and put back
   together, and that ammunition be made rather than found. So a
   firearm here is a parts list with condition on each part, a bore
   that fouls, a spring that takes a set, and an extractor that will
   eventually let go of a case at the worst moment. Reliability is
   computed from those, not rolled against a stat.

   Ballistics comes entirely from 20-ballistics.js: this file decides
   what leaves the muzzle and how well, and that file decides what
   happens after.
   ============================================================ */

const ACTION = {
  boltAction: 'boltAction', leverAction: 'leverAction', pump: 'pump',
  semiAuto: 'semiAuto', fullAuto: 'fullAuto', revolver: 'revolver',
  breakAction: 'breakAction', singleShot: 'singleShot',
};

/* Every part that can be worn, broken, cleaned or replaced. `wearRate` is
   how fast it degrades per round fired; `critical` parts stop the gun dead
   when they fail, the rest just make it worse. */
const PART = {
  barrel: { name: 'barrel', wearRate: 2.2e-5, critical: true, cleanable: true },
  bore: { name: 'bore', wearRate: 0, critical: false, cleanable: true, fouls: true },
  chamber: { name: 'chamber', wearRate: 1.4e-5, critical: true, cleanable: true, fouls: true },
  bolt: { name: 'bolt', wearRate: 1.1e-5, critical: true, cleanable: true },
  firingPin: { name: 'firing pin', wearRate: 2.6e-5, critical: true, cleanable: true },
  extractor: { name: 'extractor', wearRate: 4.5e-5, critical: true, cleanable: true },
  ejector: { name: 'ejector', wearRate: 2.4e-5, critical: false, cleanable: true },
  recoilSpring: { name: 'recoil spring', wearRate: 5.5e-5, critical: true, cleanable: false },
  sear: { name: 'sear', wearRate: 1.8e-5, critical: true, cleanable: true },
  hammer: { name: 'hammer', wearRate: 0.9e-5, critical: true, cleanable: true },
  magazineSpring: { name: 'magazine spring', wearRate: 3.2e-5, critical: false, cleanable: false },
  gasSystem: { name: 'gas system', wearRate: 2.0e-5, critical: true, cleanable: true, fouls: true },
  stock: { name: 'stock', wearRate: 0.3e-5, critical: false, cleanable: false },
  trigger: { name: 'trigger', wearRate: 0.6e-5, critical: true, cleanable: true },
  cylinder: { name: 'cylinder', wearRate: 1.0e-5, critical: true, cleanable: true, fouls: true },
};

const WEAPONS = {
  remington700_308: {
    id: 'remington700_308', name: 'Remington 700', cartridge: '308win', action: ACTION.boltAction,
    barrelIn: 24, capacity: 4, massKg: 3.9, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'ejector', 'sear', 'trigger', 'stock'],
    baseAccuracyMoa: 1.0, cycleTimeS: 1.25, railed: true, threaded: false,
    note: 'Nothing on this island shoots straighter out of the box.',
  },
  remington700_300wm: {
    id: 'remington700_300wm', name: 'Remington 700 Magnum', cartridge: '300winmag', action: ACTION.boltAction,
    barrelIn: 26, capacity: 3, massKg: 4.1, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'ejector', 'sear', 'trigger', 'stock'],
    baseAccuracyMoa: 1.1, cycleTimeS: 1.4, railed: true,
    note: 'The same rifle with another nine hundred foot-pounds and a shoulder to match.',
  },
  remington700_7mm: {
    id: 'remington700_7mm', name: 'Remington 700 7mm', cartridge: '7mmremmag', action: ACTION.boltAction,
    barrelIn: 26, capacity: 3, massKg: 4.0, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'ejector', 'sear', 'trigger', 'stock'],
    baseAccuracyMoa: 1.0, cycleTimeS: 1.4, railed: true,
    note: 'Reaches further than anything else you can carry all day.',
  },
  ruger1022: {
    id: 'ruger1022', name: '.22 semi-automatic', cartridge: '22lr', action: ACTION.semiAuto,
    barrelIn: 18.5, capacity: 10, massKg: 2.3, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'recoilSpring', 'magazineSpring', 'sear', 'trigger', 'stock'],
    baseAccuracyMoa: 1.8, cycleTimeS: 0.18, railed: true, threaded: true,
    note: 'The gun you will actually feed yourself with.',
  },
  ak47: {
    id: 'ak47', name: 'AK-47', cartridge: '762x39', action: ACTION.fullAuto,
    barrelIn: 16.3, capacity: 30, massKg: 4.3, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'gasSystem', 'recoilSpring', 'magazineSpring', 'sear', 'trigger', 'stock'],
    baseAccuracyMoa: 3.5, cycleTimeS: 0.1, rpm: 600, railed: false, threaded: true,
    // Loose tolerances buy reliability at the cost of accuracy, which is the
    // entire design of the thing.
    foulingTolerance: 2.6,
    note: 'Filthy, wet, sandy — it does not care. It also does not shoot groups.',
  },
  m16: {
    id: 'm16', name: 'M16', cartridge: '556nato', action: ACTION.fullAuto,
    barrelIn: 20, capacity: 30, massKg: 3.4, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'ejector', 'gasSystem', 'recoilSpring', 'magazineSpring', 'sear', 'trigger', 'stock'],
    baseAccuracyMoa: 1.6, cycleTimeS: 0.075, rpm: 800, railed: true, threaded: true,
    // Direct impingement puts the combustion gas into the receiver, so it
    // fouls its own action and cares a great deal about being cleaned.
    foulingTolerance: 0.65,
    note: 'Shoots beautifully and demands to be looked after.',
  },
  mauser98: {
    id: 'mauser98', name: 'Mauser 98', cartridge: '8mmmauser', action: ACTION.boltAction,
    barrelIn: 23.6, capacity: 5, massKg: 4.1, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'ejector', 'sear', 'trigger', 'stock'],
    baseAccuracyMoa: 2.2, cycleTimeS: 1.35, railed: false,
    // Controlled-round feed: the case is held from the moment it leaves the
    // magazine until it is thrown clear. It is why this action has a
    // reputation and why it still works filthy.
    foulingTolerance: 2.2,
    note: 'A hundred years old and it will outlast everything else in the safe.',
  },
  colt1911: {
    id: 'colt1911', name: 'Colt 1911', cartridge: '45acp', action: ACTION.semiAuto,
    barrelIn: 5, capacity: 7, massKg: 1.1, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'recoilSpring', 'magazineSpring', 'sear', 'hammer', 'trigger'],
    baseAccuracyMoa: 3.0, cycleTimeS: 0.14, threaded: true,
    note: 'Heavy, slow, subsonic. Very quiet with a can on it.',
  },
  revolver357: {
    id: 'revolver357', name: '.357 revolver', cartridge: '357mag', action: ACTION.revolver,
    barrelIn: 4, capacity: 6, massKg: 1.0, parts: ['barrel', 'bore', 'cylinder', 'firingPin', 'sear', 'hammer', 'trigger'],
    baseAccuracyMoa: 4.0, cycleTimeS: 0.4,
    // No extractor and no magazine to fail, and it does not care what it is
    // fed. A revolver is the answer when nothing has been cleaned in a month.
    foulingTolerance: 3.5,
    note: 'Six rounds, no way to jam, and it will fire .38 when the magnums run out.',
  },
  revolver500: {
    id: 'revolver500', name: '.50 revolver', cartridge: '500sw', action: ACTION.revolver,
    barrelIn: 8.375, capacity: 5, massKg: 2.05, parts: ['barrel', 'bore', 'cylinder', 'firingPin', 'sear', 'hammer', 'trigger'],
    baseAccuracyMoa: 3.5, cycleTimeS: 0.9, foulingTolerance: 3.0,
    note: 'For when the thing coming at you weighs more than a car door.',
  },
  barrett50: {
    id: 'barrett50', name: '.50 rifle', cartridge: '50bmg', action: ACTION.semiAuto,
    barrelIn: 29, capacity: 10, massKg: 13.6, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'gasSystem', 'recoilSpring', 'magazineSpring', 'sear', 'trigger', 'stock'],
    baseAccuracyMoa: 1.5, cycleTimeS: 0.6, railed: true, brakeEfficiency: 0.6,
    note: 'Goes through the wall, the room and the far wall. Weighs as much as a child.',
  },
  shotgun12: {
    id: 'shotgun12', name: '12 gauge pump', cartridge: '12ga_00buck', action: ACTION.pump,
    barrelIn: 28, capacity: 5, massKg: 3.4, parts: ['barrel', 'bore', 'chamber', 'bolt', 'firingPin', 'extractor', 'sear', 'trigger', 'stock'],
    baseAccuracyMoa: 30, cycleTimeS: 0.6, chokeable: true, foulingTolerance: 2.0,
    acceptsCartridges: ['12ga_00buck', '12ga_slug', '12ga_birdshot'],
    note: 'Three completely different guns depending on what you put in it.',
  },
};

/* Attachments, fitted the way they are fitted: a rail needs a rail, a
   suppressor needs a threaded muzzle, and a bipod does nothing standing up. */
const ATTACHMENT = {
  scope4x: { id: 'scope4x', name: '4x scope', mount: 'rail', massKg: 0.4, magnification: 4, accuracyMoa: -0.35, sightRadiusBonus: 0, fov: 0.28 },
  scope10x: { id: 'scope10x', name: '10x scope', mount: 'rail', massKg: 0.7, magnification: 10, accuracyMoa: -0.5, fov: 0.11, eyeReliefPenalty: 0.2 },
  redDot: { id: 'redDot', name: 'red dot', mount: 'rail', massKg: 0.15, magnification: 1, accuracyMoa: -0.15, fov: 1, targetSpeedBonus: 0.3 },
  ironSights: { id: 'ironSights', name: 'iron sights', mount: 'integral', massKg: 0, magnification: 1, accuracyMoa: 0, fov: 1 },
  suppressor: { id: 'suppressor', name: 'suppressor', mount: 'thread', massKg: 0.5, noiseDb: -28, muzzleVelocityPct: 1.5, accuracyMoa: -0.1, foulingRate: 1.6, heatBuild: 2.2 },
  bipod: { id: 'bipod', name: 'bipod', mount: 'rail', massKg: 0.35, accuracyMoaProne: -0.55, swayReduction: 0.6, requiresProne: true },
  slingLoop: { id: 'slingLoop', name: 'sling', mount: 'stud', massKg: 0.2, swayReduction: 0.25, carryComfort: 0.3 },
  muzzleBrake: { id: 'muzzleBrake', name: 'muzzle brake', mount: 'thread', massKg: 0.15, brakeEfficiency: 0.45, noiseDb: 6, dustSignature: 2.0 },
  foregrip: { id: 'foregrip', name: 'foregrip', mount: 'rail', massKg: 0.2, swayReduction: 0.2, recoilRecovery: 0.15 },
  lightMount: { id: 'lightMount', name: 'weapon light', mount: 'rail', massKg: 0.18, lightM: 60, batteryDrain: 1 },
  extendedMag: { id: 'extendedMag', name: 'extended magazine', mount: 'magwell', massKg: 0.25, capacityMultiplier: 2 },
  choke: { id: 'choke', name: 'full choke', mount: 'choke', massKg: 0.05, patternTightness: 0.55 },
};


class Firearm {
  constructor(weaponId, opts = {}) {
    const spec = WEAPONS[weaponId];
    if (!spec) throw new Error(`unknown weapon: ${weaponId}`);
    this.spec = spec;
    this.id = weaponId;
    this.name = spec.name;
    this.cartridgeId = opts.cartridgeId || spec.cartridge;
    this.attachments = {};
    this.roundsFired = 0;
    this.roundsSinceCleaning = 0;
    this.fouling = 0;              // 0..1 in the bore and action
    this.oilLevel = opts.oilLevel != null ? opts.oilLevel : 0.6;
    this.wet = 0;
    this.sandy = 0;
    this.barrelTempC = 20;
    this.magazine = [];
    this.chambered = null;
    this.jammed = null;
    this.disassembled = false;
    this.zeroRangeM = opts.zeroRangeM || 100;

    this.parts = {};
    for (const p of spec.parts) {
      this.parts[p] = {
        spec: PART[p], condition: opts.condition != null ? opts.condition : 0.55 + Math.random() * 0.45,
        broken: false, fouling: 0,
      };
    }
  }

  get massKg() {
    let m = this.spec.massKg;
    for (const a of Object.values(this.attachments)) m += a.massKg || 0;
    return m;
  }

  get capacity() {
    const ext = this.attachments.magwell;
    return Math.round(this.spec.capacity * (ext && ext.capacityMultiplier ? ext.capacityMultiplier : 1));
  }

  /* Fitting an attachment. It has to have somewhere to go, which is the
     point: you cannot put a scope on a rifle with no rail, and you cannot
     thread a can onto an unthreaded muzzle without a die and a lathe. */
  attach(attachmentId) {
    const a = ATTACHMENT[attachmentId];
    if (!a) return { ok: false, reason: 'no such attachment' };
    if (a.mount === 'rail' && !this.spec.railed) {
      return { ok: false, reason: `${this.name} has no rail — it needs a mount fitted first` };
    }
    if (a.mount === 'thread' && !this.spec.threaded) {
      return { ok: false, reason: `${this.name}'s muzzle is not threaded` };
    }
    if (a.mount === 'choke' && !this.spec.chokeable) {
      return { ok: false, reason: 'this barrel does not take chokes' };
    }
    this.attachments[a.mount] = a;
    return { ok: true, fitted: a.name };
  }

  detach(mount) {
    const a = this.attachments[mount];
    delete this.attachments[mount];
    return a || null;
  }

  /* The projectile this gun launches, with barrel length applied. */
  projectile(cartridgeId) {
    const id = cartridgeId || this.cartridgeId;
    const p = new Projectile(id, { barrelIn: this.spec.barrelIn });
    const can = this.attachments.thread;
    if (can && can.muzzleVelocityPct) {
      // A suppressor adds a little velocity by extending the pressure curve.
      p.muzzleMs *= 1 + can.muzzleVelocityPct / 100;
    }
    return p;
  }

  /* Practical accuracy in minutes of angle, from the gun's mechanical
     accuracy plus everything that is currently making it worse. */
  accuracyMoa(opts = {}) {
    let moa = this.spec.baseAccuracyMoa;
    // A shot-out bore is the biggest single term, and it never comes back.
    moa /= Math.max(0.25, this.parts.barrel ? this.parts.barrel.condition : 1);
    moa += this.fouling * 0.9;
    // A hot barrel walks its point of impact.
    moa += clamp01((this.barrelTempC - 60) / 200) * 1.6;
    for (const a of Object.values(this.attachments)) {
      if (a.accuracyMoa) moa += a.accuracyMoa;
      if (a.accuracyMoaProne && opts.prone) moa += a.accuracyMoaProne;
    }
    // The shooter, not the rifle: fatigue, breathing, heart rate, and how
    // much of the body is on the ground.
    const stance = opts.prone ? 0.35 : opts.kneeling ? 0.7 : opts.supported ? 0.45 : 1;
    let sway = stance * (1 + 2.4 * clamp01(opts.fatigue || 0)) * (1 + 1.6 * clamp01(opts.breathless || 0));
    for (const a of Object.values(this.attachments)) {
      if (a.swayReduction && (!a.requiresProne || opts.prone)) sway *= 1 - a.swayReduction;
    }
    sway *= 1 - 0.45 * clamp01(opts.skill != null ? opts.skill : 0.5);
    // Cold, shaking hands cost more than most people expect.
    sway *= 1 + 1.2 * clamp01(opts.shivering || 0);
    return Math.max(0.2, moa + sway * 2.2);
  }

  /* Reliability. Every term is something the player did or failed to do. */
  reliability() {
    const tolerance = this.spec.foulingTolerance != null ? this.spec.foulingTolerance : 1;
    let p = 1;
    // Fouling, scaled by how much this design tolerates.
    p -= clamp01(this.fouling / tolerance) * 0.35;
    // Oil is the difference between a working gun and a museum piece, and
    // too much oil in dust is as bad as none.
    p -= clamp01(0.45 - this.oilLevel) * 0.5;
    p -= clamp01(this.sandy * (0.4 + this.oilLevel * 0.6)) * 0.45 / tolerance;
    p -= clamp01(this.wet) * 0.12;
    /* Wear compounds rather than adding up, and it bites late.

       Summing a flat penalty per part made a rifle with ten percent wear
       everywhere only seventy percent reliable, which is not how a gun that
       has had a few hundred rounds through it behaves — it works fine. The
       curve below is nearly flat while everything is merely used and falls
       off a cliff once a part is genuinely worn out, so reliability tracks
       the worst component rather than the average of all of them. */
    for (const part of Object.values(this.parts)) {
      if (part.broken) return 0;
      const wear = 1 - part.condition;
      const bite = part.spec.critical ? 0.55 : 0.14;
      p *= 1 - Math.pow(wear, 1.8) * bite;
    }
    // A revolver has almost nothing to go wrong; a gas gun has plenty.
    if (this.spec.action === ACTION.revolver || this.spec.action === ACTION.boltAction) p += 0.12;
    return clamp01(p);
  }

  load(rounds) {
    const space = this.capacity - this.magazine.length;
    const taken = Math.min(space, rounds.length);
    for (let i = 0; i < taken; i++) this.magazine.push(rounds[i]);
    return taken;
  }

  chamber() {
    if (this.chambered) return true;
    const r = this.magazine.pop();
    if (!r) return false;
    this.chambered = r;
    return true;
  }

  /* Pull the trigger. Returns what happened — a shot, a stoppage, or a
     click. Stoppages are typed, because clearing them is different work:
     a failure to feed is a tap and a rack, a case head separation is a rod
     down the barrel and a long time on your knees. */
  fire(opts = {}) {
    if (this.disassembled) return { fired: false, reason: 'it is in pieces' };
    if (this.jammed) return { fired: false, reason: 'jammed', jam: this.jammed };
    if (!this.chambered && !this.chamber()) return { fired: false, reason: 'empty' };

    const round = this.chambered;
    const rel = this.reliability();
    const rng = opts.rng || Math.random;

    if (rng() > rel) {
      // Which stoppage depends on what is worst about the gun right now.
      const pin = this.parts.firingPin ? this.parts.firingPin.condition : 1;
      const ext = this.parts.extractor ? this.parts.extractor.condition : 1;
      const mag = this.parts.magazineSpring ? this.parts.magazineSpring.condition : 1;
      const worst = Math.min(pin, ext, mag, 1 - this.fouling);
      let kind;
      if (worst === pin) kind = 'light strike';
      else if (worst === ext) kind = 'failure to extract';
      else if (worst === mag) kind = 'failure to feed';
      else kind = 'failure to eject — stovepipe';
      if (round && round.condition != null && round.condition < 0.2) kind = 'dud round';
      this.jammed = {
        kind,
        clearSeconds: kind === 'failure to extract' ? 9 : kind === 'dud round' ? 2.5 : 3.5,
        needsTool: kind === 'failure to extract' && rng() < 0.35,
      };
      this.chambered = kind === 'dud round' ? null : this.chambered;
      return { fired: false, reason: 'stoppage', jam: this.jammed };
    }

    this.chambered = null;
    this.roundsFired++;
    this.roundsSinceCleaning++;

    // Fouling and heat, both scaled by the cartridge's powder charge.
    const cart = CARTRIDGES[round && round.cartridgeId ? round.cartridgeId : this.cartridgeId];
    const charge = (cart && cart.powderGr) ? cart.powderGr : 20;
    const canMul = this.attachments.thread && this.attachments.thread.foulingRate
      ? this.attachments.thread.foulingRate : 1;
    this.fouling = clamp01(this.fouling + (charge / 46000) * canMul);
    this.oilLevel = Math.max(0, this.oilLevel - 0.0016);
    this.barrelTempC += charge * 0.055 * (this.attachments.thread && this.attachments.thread.heatBuild
      ? this.attachments.thread.heatBuild : 1);

    for (const part of Object.values(this.parts)) {
      part.condition = Math.max(0, part.condition - part.spec.wearRate * (charge / 40) * (1 + this.fouling));
      if (part.condition <= 0.02 && part.spec.critical) part.broken = true;
    }

    const proj = this.projectile(round && round.cartridgeId);
    const recoil = freeRecoil(proj, this.massKg, {
      brakeEfficiency: (this.attachments.thread && this.attachments.thread.brakeEfficiency)
        || this.spec.brakeEfficiency || 0,
    });
    const rise = muzzleRise(recoil, { gunMassKg: this.massKg, boreAxisM: 0.045 });

    // How loud, and how far that carries. A suppressed subsonic .22 is a
    // different animal from a braked magnum and the animals know it.
    const baseDb = 155 + Math.log10(Math.max(charge, 1)) * 12;
    const can = this.attachments.thread;
    const db = baseDb + (can && can.noiseDb ? can.noiseDb : 0)
      + (cart && cart.subsonic ? -12 : 0);
    // Sound falls 6 dB per doubling of distance; audible at roughly 45 dB.
    const audibleM = Math.pow(10, (db - 45) / 20);

    return {
      fired: true, projectile: proj, recoil, muzzleRise: rise,
      accuracyMoa: this.accuracyMoa(opts),
      noiseDb: db, audibleM,
      barrelTempC: this.barrelTempC,
      // Every shot tells every animal inside that radius roughly where you
      // are, which is the real cost of the shot you missed.
      alerts: audibleM,
    };
  }

  clearJam(dt, opts = {}) {
    if (!this.jammed) return { cleared: true };
    if (this.jammed.needsTool && !opts.hasTool) {
      return { cleared: false, reason: 'the case is stuck fast — you need a rod' };
    }
    this.jammed.progress = (this.jammed.progress || 0) + dt;
    if (this.jammed.progress >= this.jammed.clearSeconds) {
      this.jammed = null;
      return { cleared: true };
    }
    return { cleared: false, remaining: this.jammed.clearSeconds - this.jammed.progress };
  }

  cool(dt, ambientC = 20) {
    this.barrelTempC += (ambientC - this.barrelTempC) * clamp01(dt / 240);
  }

  /* --- maintenance ---
     Stripping a gun is a sequence, and you cannot clean the bore with the
     barrel still in the stock. Each step is separate so the player is
     actually doing the job. */
  disassemble(opts = {}) {
    if (this.disassembled) return { ok: false, reason: 'already stripped' };
    if (this.chambered) return { ok: false, reason: 'clear it first' };
    this.disassembled = true;
    this.stripLevel = opts.detailed ? 'detail' : 'field';
    return {
      ok: true,
      parts: Object.keys(this.parts),
      // A detail strip reaches everything and takes a lot longer, and if you
      // do it in the field you will lose a spring in the grass.
      seconds: opts.detailed ? 900 : 90,
      risk: opts.detailed && !opts.onBench ? 'you will lose something' : null,
    };
  }

  cleanPart(partName, opts = {}) {
    if (!this.disassembled) return { ok: false, reason: 'strip it first' };
    const part = this.parts[partName];
    if (!part) return { ok: false, reason: 'no such part' };
    if (!part.spec.cleanable) return { ok: false, reason: `the ${part.spec.name} does not clean, it gets replaced` };
    if (!opts.solvent) return { ok: false, reason: 'you need solvent — water alone will not shift carbon' };
    part.fouling = 0;
    // Cleaning cannot undo wear. A shot-out barrel is a shot-out barrel.
    return { ok: true, cleaned: part.spec.name };
  }

  oil(amount = 1, opts = {}) {
    if (!opts.oil) return { ok: false, reason: 'no oil' };
    this.oilLevel = clamp01(this.oilLevel + amount * 0.5);
    // Over-oiling in dust is worse than dry, because the oil holds the grit
    // against the moving parts.
    return {
      ok: true, oilLevel: this.oilLevel,
      warning: this.oilLevel > 0.9 ? 'that is too much oil for dusty country' : null,
    };
  }

  reassemble() {
    if (!this.disassembled) return { ok: false, reason: 'it is already together' };
    this.disassembled = false;
    let f = 0;
    for (const p of Object.values(this.parts)) f += p.fouling;
    this.fouling = clamp01(f / Math.max(Object.keys(this.parts).length, 1));
    if (this.fouling < 0.05) this.roundsSinceCleaning = 0;
    return { ok: true, reliability: this.reliability() };
  }

  replacePart(partName, condition = 1) {
    const part = this.parts[partName];
    if (!part) return { ok: false, reason: 'no such part' };
    part.condition = clamp01(condition);
    part.broken = false;
    part.fouling = 0;
    return { ok: true };
  }

  /* Everything wrong with it, in plain words. This is what the player sees
     when they look the thing over, and it is the diagnosis loop again: the
     game describes symptoms and the player works out the cause. */
  inspect() {
    const notes = [];
    if (this.fouling > 0.6) notes.push('the action is thick with carbon');
    else if (this.fouling > 0.3) notes.push('it is getting dirty');
    if (this.oilLevel < 0.2) notes.push('bone dry — it needs oil');
    if (this.oilLevel > 0.9) notes.push('running with oil, and picking up dust');
    if (this.sandy > 0.3) notes.push('grit in the action');
    if (this.wet > 0.5) notes.push('soaked, and it will rust by morning');
    if (this.barrelTempC > 120) notes.push('the barrel is too hot to hold');
    for (const [name, p] of Object.entries(this.parts)) {
      if (p.broken) notes.push(`the ${p.spec.name} is broken`);
      else if (p.condition < 0.25) notes.push(`the ${p.spec.name} is nearly gone`);
      else if (p.condition < 0.5 && p.spec.critical) notes.push(`the ${p.spec.name} is worn`);
    }
    return {
      notes,
      reliability: this.reliability(),
      accuracyMoa: this.accuracyMoa({ prone: false, skill: 0.5 }),
      roundsFired: this.roundsFired,
      roundsSinceCleaning: this.roundsSinceCleaning,
    };
  }
}


/* ------------------------------------------------------------------
   HANDLOADING

   The design says ammunition has to be made or found. Making it is
   four operations and a set of components, and the load has to be
   inside the pressure envelope for the cartridge or the rifle comes
   apart in your hands. Underloaded rounds squib and stick a bullet
   in the bore, which is worse than a misfire because the next round
   fired behind it destroys the barrel.
   ------------------------------------------------------------------ */
const POWDER = {
  fast: { name: 'fast pistol powder', burnRate: 1.0, suitedTo: ['45acp', '9mm', '357mag', '500sw'] },
  medium: { name: 'medium rifle powder', burnRate: 0.55, suitedTo: ['762x39', '556nato', '308win', '8mmmauser'] },
  slow: { name: 'slow magnum powder', burnRate: 0.32, suitedTo: ['300winmag', '7mmremmag', '50bmg'] },
  black: { name: 'black powder', burnRate: 1.4, suitedTo: [], corrosive: true, foulingMultiplier: 6 },
};

function handload(spec) {
  const cart = CARTRIDGES[spec.cartridgeId];
  if (!cart) return { ok: false, reason: 'no such cartridge' };
  const problems = [];

  if (!spec.case) problems.push('no case');
  if (!spec.primer) problems.push('no primer');
  else if (spec.primer !== cart.primer) problems.push(`wrong primer — this takes a ${cart.primer.replace(/_/g, ' ')}`);
  if (!spec.bullet) problems.push('no bullet');
  if (!spec.powder) problems.push('no powder');

  const powder = POWDER[spec.powder];
  const chargeGr = spec.chargeGr || 0;
  const nominal = cart.powderGr || 20;

  let pressureRatio = 1;
  if (powder) {
    // Burn rate against the case: a fast pistol powder in a rifle case at a
    // rifle charge weight is a detonation, and a slow magnum powder in a
    // pistol case will not build enough pressure to leave the barrel.
    const suited = powder.suitedTo.includes(spec.cartridgeId);
    const rateMismatch = suited ? 1 : (powder.burnRate / (nominal > 30 ? 0.45 : 1.0));
    pressureRatio = (chargeGr / nominal) * rateMismatch;
    if (!suited) problems.push(`${powder.name} is the wrong burn rate for ${cart.name}`);
  }

  const timesFired = spec.caseTimesFired || 0;
  // Brass work-hardens. Past about five firings on a full-power load the
  // head starts to separate, and that dumps gas into the action.
  if (timesFired > 5) problems.push('this case has been loaded too many times — the head will separate');
  if (spec.case && !spec.trimmed && timesFired > 1) problems.push('the case has stretched and needs trimming');
  if (!spec.resized && timesFired > 0) problems.push('the case has not been resized — it will not chamber');

  const fatal = pressureRatio > 1.35;
  const squib = pressureRatio < 0.55;
  if (fatal) problems.push('this charge is far over pressure — it will wreck the gun and your hands');
  if (squib) problems.push('this charge is too light — the bullet will stick in the barrel');

  const ok = problems.length === 0;
  return {
    ok, problems, pressureRatio,
    round: ok ? {
      cartridgeId: spec.cartridgeId,
      condition: clamp01(0.75 + (spec.skill || 0.5) * 0.25),
      // A careful handload can beat factory ammunition for consistency, and
      // a careless one is worse than either.
      velocityVariancePct: lerpN(4.5, 0.8, clamp01(spec.skill || 0.5)),
      handloaded: true, chargeGr, powder: spec.powder,
      corrosive: !!(powder && powder.corrosive),
    } : null,
    danger: fatal ? 'catastrophic' : squib ? 'squib' : null,
  };
}

/* Reclaiming components. Lead can be cast, brass can be reloaded, and
   primers essentially cannot be made — which is what makes a box of primers
   the most valuable thing in a looted house. */
function salvageComponents(items) {
  return {
    brass: items.filter((i) => i.kind === 'fired case' && i.condition > 0.3).length,
    leadKg: items.filter((i) => i.kind === 'lead').reduce((a, i) => a + (i.kg || 0), 0),
    primers: items.filter((i) => i.kind === 'primer').length,
    note: 'Cases and lead you can keep going with. Primers you cannot make.',
  };
}
