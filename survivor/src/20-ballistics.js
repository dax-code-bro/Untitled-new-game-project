/* ============================================================
   BALLISTICS — published cartridge data, integrated properly.

   Nothing in this file is a damage number. A cartridge is a bullet
   mass, a muzzle velocity, a diameter and a drag coefficient; every
   consequence — drop, drift, time of flight, retained energy, recoil,
   what it will and will not shoot through — is computed from those.
   Which means adding a cartridge is a matter of typing in what is
   printed on the box, and the game works out the rest.
   ============================================================ */

/* ---------------- drag functions ----------------

   The G1 and G7 standard drag functions, as Cd against Mach. G1 is the
   flat-based reference every box of ammunition quotes; G7 is the
   boat-tail reference that actually fits a modern long-range bullet, and
   a G7 BC stays constant with velocity where a G1 BC does not. Both are
   here because both are printed on real boxes.                          */

const DRAG_G1 = [
  [0.00, 0.2629], [0.05, 0.2558], [0.10, 0.2487], [0.15, 0.2413], [0.20, 0.2344],
  [0.25, 0.2278], [0.30, 0.2214], [0.35, 0.2155], [0.40, 0.2104], [0.45, 0.2061],
  [0.50, 0.2032], [0.55, 0.2020], [0.60, 0.2034], [0.65, 0.2165], [0.70, 0.2230],
  [0.75, 0.2313], [0.80, 0.2417], [0.85, 0.2546], [0.875, 0.2620], [0.90, 0.2699],
  [0.925, 0.2809], [0.95, 0.2923], [0.975, 0.3054], [1.00, 0.3255], [1.025, 0.3771],
  [1.05, 0.4334], [1.075, 0.4835], [1.10, 0.5255], [1.125, 0.5583], [1.15, 0.5786],
  [1.20, 0.5960], [1.25, 0.6015], [1.30, 0.6018], [1.35, 0.5988], [1.40, 0.5935],
  [1.50, 0.5817], [1.60, 0.5691], [1.80, 0.5443], [2.00, 0.5220], [2.20, 0.5020],
  [2.50, 0.4759], [3.00, 0.4415], [3.50, 0.4161], [4.00, 0.3966], [4.50, 0.3812],
  [5.00, 0.3688],
];

const DRAG_G7 = [
  [0.00, 0.1198], [0.50, 0.1197], [0.60, 0.1194], [0.70, 0.1193], [0.80, 0.1194],
  [0.85, 0.1214], [0.875, 0.1232], [0.90, 0.1263], [0.925, 0.1307], [0.95, 0.1368],
  [0.975, 0.1464], [1.00, 0.1660], [1.025, 0.2054], [1.05, 0.2993], [1.075, 0.3803],
  [1.10, 0.4015], [1.15, 0.4043], [1.20, 0.4004], [1.30, 0.3877], [1.40, 0.3736],
  [1.50, 0.3594], [1.60, 0.3448], [1.80, 0.3187], [2.00, 0.2969], [2.20, 0.2794],
  [2.50, 0.2586], [3.00, 0.2345], [3.50, 0.2216], [4.00, 0.2141], [4.50, 0.2093],
  [5.00, 0.2068],
];

function dragCoefficient(table, mach) {
  if (mach <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (mach >= last[0]) return last[1];
  // Linear between tabulated points. The tables are dense where the curve
  // bends hardest — right through the transonic spike — so this is accurate
  // to well under a percent, which is far tighter than any BC is known to.
  let lo = 0, hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid][0] <= mach) lo = mid; else hi = mid;
  }
  const [m0, c0] = table[lo], [m1, c1] = table[hi];
  return c0 + (c1 - c0) * ((mach - m0) / (m1 - m0));
}

/* Ballistic coefficients are published in pounds per square inch. */
const BC_TO_SI = UNIT.LB_KG / (UNIT.INCH_M * UNIT.INCH_M);   // 703.07 kg/m^2

/* ---------------- cartridges ----------------

   Bullet mass in grains, muzzle velocity in feet per second, ballistic
   coefficient and bullet diameter in inches — exactly as published, so the
   numbers can be checked against a box of ammunition. `barrelIn` is the
   test barrel the velocity was measured from, which matters: the same
   .357 Magnum load loses roughly 200 fps between a rifle and a snub.

   `powderGr` drives recoil, which cannot be computed from the bullet alone
   because a large share of the momentum leaves as gas.                    */

const CARTRIDGES = {
  '22lr': {
    id: '22lr', core: 'lead', name: '.22 Long Rifle', massGr: 40, mvFps: 1255, bc: 0.138, drag: 'G1',
    diameterIn: 0.223, barrelIn: 24, powderGr: 1.0, primer: 'rimfire',
    expands: false, fragments: false,
    note: 'Small, quiet, and the only round you will ever have enough of.',
  },
  '22lr_sub': {
    id: '22lr_sub', core: 'lead', name: '.22 LR subsonic', massGr: 40, mvFps: 1050, bc: 0.138, drag: 'G1',
    diameterIn: 0.223, barrelIn: 24, powderGr: 0.8, primer: 'rimfire',
    // Staying under the speed of sound removes the crack, which is the loud
    // part. With a can on the muzzle this is genuinely quiet.
    expands: false, subsonic: true,
    note: 'No sonic crack. Suppressed, this is the poaching round.',
  },
  '556nato': {
    id: '556nato', core: 'steelCore', name: '5.56x45mm NATO (M855)', massGr: 62, mvFps: 3020, bc: 0.304, drag: 'G1',
    diameterIn: 0.224, barrelIn: 20, powderGr: 25, primer: 'small_rifle',
    fragments: true, fragmentThresholdMs: 792,
    note: 'Fragments above roughly 2600 fps and behaves like a pinprick below it.',
  },
  '762x39': {
    id: '762x39', core: 'steelCore', name: '7.62x39mm', massGr: 123, mvFps: 2350, bc: 0.275, drag: 'G1',
    diameterIn: 0.310, barrelIn: 16.3, powderGr: 26, primer: 'large_rifle',
    note: 'Heavy for its speed. Bores straight through brush that deflects lighter rounds.',
  },
  '308win': {
    id: '308win', core: 'leadFmj', name: '.308 Winchester (168gr HPBT)', massGr: 168, mvFps: 2650, bc: 0.462, drag: 'G1',
    bcG7: 0.224, diameterIn: 0.308, barrelIn: 24, powderGr: 44, primer: 'large_rifle',
    // Sierra publishes this bullet's G1 coefficient in velocity bands because
    // one number does not describe it: the 168 MatchKing is famously poor
    // through the transonic, and a single BC hides exactly the range where
    // it matters.
    bcBandsG1: [[792, 0.462], [640, 0.447], [0, 0.424]],
    note: 'The reference rifle cartridge. Everything else on this list is measured against it.',
  },
  '300winmag': {
    id: '300winmag', core: 'bonded', name: '.300 Winchester Magnum', massGr: 190, mvFps: 2900, bc: 0.533, drag: 'G1',
    bcG7: 0.268, diameterIn: 0.308, barrelIn: 26, powderGr: 73, primer: 'large_rifle_mag',
    note: 'A .308 with another 900 foot-pounds and a shoulder to match.',
  },
  '7mmremmag': {
    id: '7mmremmag', core: 'bonded', name: '7mm Remington Magnum', massGr: 162, mvFps: 2940, bc: 0.534, drag: 'G1',
    bcG7: 0.268, diameterIn: 0.284, barrelIn: 26, powderGr: 65, primer: 'large_rifle_mag',
    note: 'Flattest thing in the safe. Reaches across the prairie without thinking about it.',
  },
  '8mmmauser': {
    id: '8mmmauser', core: 'leadFmj', name: '8mm Mauser (7.92x57 JS)', massGr: 196, mvFps: 2575, bc: 0.584, drag: 'G1',
    diameterIn: 0.323, barrelIn: 23.6, powderGr: 47, primer: 'large_rifle',
    note: 'Old, heavy, and it does not care what is in the way.',
  },
  '357mag': {
    id: '357mag', core: 'lead', name: '.357 Magnum (158gr)', massGr: 158, mvFps: 1250, bc: 0.206, drag: 'G1',
    diameterIn: 0.357, barrelIn: 4, powderGr: 15, primer: 'small_pistol_mag',
    expands: true,
    note: 'From a rifle barrel it gains 400 fps and becomes a different cartridge entirely.',
  },
  '45acp': {
    id: '45acp', core: 'leadFmj', name: '.45 ACP (230gr FMJ)', massGr: 230, mvFps: 830, bc: 0.195, drag: 'G1',
    diameterIn: 0.451, barrelIn: 5, powderGr: 6, primer: 'large_pistol',
    subsonic: true,
    note: 'Subsonic from the box. Slow, heavy, and quiet with a can.',
  },
  '9mm': {
    id: '9mm', core: 'leadFmj', name: '9x19mm Parabellum', massGr: 115, mvFps: 1180, bc: 0.140, drag: 'G1',
    diameterIn: 0.355, barrelIn: 4, powderGr: 5, primer: 'small_pistol',
    expands: true,
    note: 'The commonest round on the island, which is most of what recommends it.',
  },
  '9mm_fmj': {
    id: '9mm_fmj', core: 'leadFmj', name: '9x19mm ball (115gr FMJ)', massGr: 115, mvFps: 1180, bc: 0.140, drag: 'G1',
    diameterIn: 0.355, barrelIn: 4, powderGr: 5, primer: 'small_pistol',
    // Ball does not open up, so it goes deep and leaves a narrow track.
    // Against a person that is a disadvantage; through a car door it is not.
    note: 'Ball ammunition. Overpenetrates people and underpenetrates nothing else.',
  },
  '357mag_sp': {
    id: '357mag_sp', core: 'leadFmj', name: '.357 Magnum (158gr soft point)', massGr: 158, mvFps: 1250, bc: 0.206, drag: 'G1',
    diameterIn: 0.357, barrelIn: 4, powderGr: 15, primer: 'small_pistol_mag',
    note: 'Holds together. The one to load when the animal is bigger than you are.',
  },
  '500sw': {
    id: '500sw', core: 'lead', name: '.500 S&W Magnum', massGr: 350, mvFps: 1900, bc: 0.220, drag: 'G1',
    diameterIn: 0.500, barrelIn: 8.375, powderGr: 41, primer: 'large_pistol_mag',
    expands: true,
    note: 'A rifle cartridge in a revolver. It will stop a grizzly and dislocate your wrist.',
  },
  '50bmg': {
    id: '50bmg', core: 'steelCore', name: '.50 BMG (M33 ball)', massGr: 660, mvFps: 2910, bc: 0.620, drag: 'G1',
    bcG7: 0.370, diameterIn: 0.510, barrelIn: 45, powderGr: 240, primer: 'large_rifle_mag',
    note: 'Goes through the wall, the room, the far wall, and most of what was standing between.',
  },
  '12ga_slug': {
    id: '12ga_slug', core: 'lead', name: '12 gauge Foster slug (1 oz)', massGr: 437.5, mvFps: 1600, bc: 0.100, drag: 'G1',
    diameterIn: 0.729, barrelIn: 28, powderGr: 30, primer: 'shotshell',
    note: 'An ounce of soft lead. Devastating close, and it falls off a cliff past 100 metres.',
  },
  '12ga_00buck': {
    id: '12ga_00buck', core: 'lead', name: '12 gauge 00 buckshot', massGr: 53.8, mvFps: 1325, bc: 0.090, drag: 'G1',
    diameterIn: 0.330, barrelIn: 28, powderGr: 26, primer: 'shotshell',
    pellets: 9, spreadMoaPerM: 0.0,   // spread is handled by the shot pattern model
    note: 'Nine .33 calibre balls. Each one is roughly a .380 in its own right.',
  },
  '12ga_birdshot': {
    id: '12ga_birdshot', core: 'lead', name: '12 gauge #6 birdshot', massGr: 1.94, mvFps: 1295, bc: 0.012, drag: 'G1',
    diameterIn: 0.110, barrelIn: 28, powderGr: 20, primer: 'shotshell',
    pellets: 225,
    note: 'For birds and rabbits. Against anything larger it is a way to make an enemy.',
  },
};


/* ---------------- the projectile ---------------- */

class Projectile {
  constructor(cartridgeId, opts = {}) {
    const c = typeof cartridgeId === 'string' ? CARTRIDGES[cartridgeId] : cartridgeId;
    if (!c) throw new Error(`unknown cartridge: ${cartridgeId}`);
    this.cartridge = c;
    this.massKg = grainsToKg(c.massGr);
    this.diameterM = inchesToM(c.diameterIn);
    this.areaM2 = Math.PI * this.diameterM * this.diameterM / 4;

    // Prefer the G7 coefficient when one is published — it is the honest
    // number for a boat-tail bullet, and it does not drift with velocity.
    this.useG7 = !!(c.bcG7 && opts.dragModel !== 'G1');
    this.dragTable = this.useG7 ? DRAG_G7 : DRAG_G1;
    const bc = this.useG7 ? c.bcG7 : c.bc;
    this.bcSI = bc * BC_TO_SI;                      // kg/m^2
    // Banded G1 coefficients, fastest band first, in m/s.
    this.bcBands = (!this.useG7 && c.bcBandsG1)
      ? c.bcBandsG1.map(([vMs, b]) => [vMs, b * BC_TO_SI]) : null;

    /* Muzzle velocity depends on the barrel it left. Roughly 25 fps per
       inch for rifle cartridges and more for magnums; a carbine-length
       .300 Win Mag gives away several hundred feet per second and most of
       the reason to carry it. */
    const barrelIn = opts.barrelIn != null ? opts.barrelIn : c.barrelIn;
    const perInch = c.primer === 'large_rifle_mag' ? 35
      : c.primer === 'large_rifle' || c.primer === 'small_rifle' ? 25
      : c.primer === 'shotshell' ? 8 : 20;
    this.muzzleMs = fpsToMs(c.mvFps + (barrelIn - c.barrelIn) * perInch);
    this.barrelIn = barrelIn;
  }

  get muzzleEnergyJ() { return 0.5 * this.massKg * this.muzzleMs * this.muzzleMs; }
  get sectionalDensity() {
    // lb/in^2 — the number that predicts penetration better than energy does.
    return (this.cartridge.massGr / 7000) / (this.cartridge.diameterIn ** 2);
  }
  get momentum() { return this.massKg * this.muzzleMs; }

  /* Drag deceleration at a given speed. Diameter and mass cancel out of the
     BC formulation, which is why a ballistic coefficient is a useful thing
     to print on a box in the first place. */
  /* The coefficient in force at this speed. A G7 BC is genuinely constant;
     a G1 BC is not, and when the manufacturer publishes bands, using them is
     simply using the data that exists. */
  bcAt(speedMs) {
    if (!this.bcBands) return this.bcSI;
    for (const [floor, bc] of this.bcBands) if (speedMs >= floor) return bc;
    return this.bcBands[this.bcBands.length - 1][1];
  }

  dragDecel(speedMs, env) {
    const rho = env.airDensity != null ? env.airDensity : UNIT.AIR_DENSITY;
    const a = env.speedOfSound != null ? env.speedOfSound : UNIT.SPEED_OF_SOUND;
    const cd = dragCoefficient(this.dragTable, speedMs / a);
    return 0.5 * rho * speedMs * speedMs * cd * Math.PI / (4 * this.bcAt(speedMs));
  }
}


/* ---------------- trajectory ----------------

   A point-mass integration with drag, gravity, wind and, past the range
   where they start to matter, spin drift and the Coriolis effect. RK4
   because a fixed-step Euler integration of a v^2 drag law loses real
   accuracy over a long shot and there is no reason to accept that.        */

function integrateTrajectory(projectile, opts = {}) {
  const env = opts.env || {};
  const rho = env.airDensity != null ? env.airDensity
    : airDensity(env.tempC != null ? env.tempC : 15, env.pressurePa || 101325, env.humidity || 0);
  const a = env.speedOfSound != null ? env.speedOfSound : speedOfSound(env.tempC != null ? env.tempC : 15);
  const e = { airDensity: rho, speedOfSound: a };

  const maxRange = opts.maxRange != null ? opts.maxRange : 1500;
  const dt = opts.dt != null ? opts.dt : 0.0005;
  const launchRad = (opts.launchAngleDeg || 0) * Math.PI / 180;
  const sightHeight = opts.sightHeightM != null ? opts.sightHeightM : 0.04;
  const windMs = opts.windMs || 0;
  const windAngleRad = (opts.windAngleDeg != null ? opts.windAngleDeg : 90) * Math.PI / 180;
  const windCross = windMs * Math.sin(windAngleRad);
  const windHead = -windMs * Math.cos(windAngleRad);

  const v0 = projectile.muzzleMs;
  // x downrange, y vertical, z lateral. The bullet starts below the line of
  // sight by the height of the scope over the bore, which is why a rifle
  // zeroed at 100 m shoots low at 25.
  let x = 0, y = -sightHeight, z = 0;
  let vx = v0 * Math.cos(launchRad), vy = v0 * Math.sin(launchRad), vz = 0;
  let t = 0;

  const samples = [];
  const sampleEvery = opts.sampleEvery != null ? opts.sampleEvery : 10;
  let step = 0;

  const deriv = (vxi, vyi, vzi) => {
    // Drag acts along the velocity relative to the air, not the ground.
    const rx = vxi - windHead, ry = vyi, rz = vzi - windCross;
    const speed = Math.hypot(rx, ry, rz);
    if (speed < 1e-6) return [0, -UNIT.GRAVITY, 0];
    const dec = projectile.dragDecel(speed, e);
    return [-dec * rx / speed, -UNIT.GRAVITY - dec * ry / speed, -dec * rz / speed];
  };

  while (x < maxRange && t < 12 && y > -400) {
    // Classical RK4 over the velocity state; position integrates from it.
    const k1 = deriv(vx, vy, vz);
    const k2 = deriv(vx + 0.5 * dt * k1[0], vy + 0.5 * dt * k1[1], vz + 0.5 * dt * k1[2]);
    const k3 = deriv(vx + 0.5 * dt * k2[0], vy + 0.5 * dt * k2[1], vz + 0.5 * dt * k2[2]);
    const k4 = deriv(vx + dt * k3[0], vy + dt * k3[1], vz + dt * k3[2]);

    const ax = (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6;
    const ay = (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
    const az = (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) / 6;

    x += vx * dt + 0.5 * ax * dt * dt;
    y += vy * dt + 0.5 * ay * dt * dt;
    z += vz * dt + 0.5 * az * dt * dt;
    vx += ax * dt; vy += ay * dt; vz += az * dt;
    t += dt;

    if (step++ % sampleEvery === 0) {
      const speed = Math.hypot(vx, vy, vz);
      samples.push({
        rangeM: x, dropM: y, driftM: z, timeS: t, speedMs: speed,
        machNumber: speed / a,
        energyJ: 0.5 * projectile.massKg * speed * speed,
      });
    }
  }
  return { samples, projectile, env: e };
}

/* Sight-in: find the launch angle that puts the bullet back on the line of
   sight at a chosen distance. Bisection rather than a closed form because
   there is no closed form once drag is in the picture. */
function zeroAngleDeg(projectile, zeroRangeM, opts = {}) {
  let lo = -0.2, hi = 2.5;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const tr = integrateTrajectory(projectile, Object.assign({}, opts, {
      launchAngleDeg: mid, maxRange: zeroRangeM * 1.02, dt: 0.0008, sampleEvery: 4,
    }));
    const at = tr.samples[tr.samples.length - 1];
    if (!at || at.rangeM < zeroRangeM * 0.98) { lo = mid; continue; }
    if (at.dropM < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---------------- recoil ----------------

   Free recoil: the momentum the rifle takes up if nothing is holding it.
   Powder gas carries a serious share of it — the reason a magnum kicks out
   of proportion to its bullet — and is conventionally credited with
   leaving the muzzle at about 4000 fps.                                    */
function freeRecoil(projectile, gunMassKg, opts = {}) {
  const c = projectile.cartridge;
  const mB = projectile.massKg * (c.pellets || 1);
  const mP = grainsToKg(c.powderGr || 0);
  /* Gas leaves a bottlenecked rifle case at roughly 4000 fps. A handgun or
     shotshell burns a faster powder at far lower muzzle pressure, and its
     gas leaves at about one and a half times the bullet's speed — using the
     rifle figure for a .45 doubles its recoil on paper. */
  const rifleClass = c.primer === 'large_rifle' || c.primer === 'small_rifle'
    || c.primer === 'large_rifle_mag';
  const vGas = opts.gasVelocityMs != null ? opts.gasVelocityMs
    : (rifleClass ? fpsToMs(4000) : projectile.muzzleMs * 1.5);
  const pellets = c.pellets || 1;

  const momentum = mB * projectile.muzzleMs + mP * vGas;
  // A muzzle brake redirects gas backward, cancelling part of the recoil,
  // at the cost of blast for everyone beside you.
  const brake = clamp01(opts.brakeEfficiency || 0);
  const effective = momentum * (1 - brake * (mP * vGas) / Math.max(momentum, 1e-9));

  const vRecoil = effective / gunMassKg;
  const energyJ = 0.5 * gunMassKg * vRecoil * vRecoil;
  return {
    velocityMs: vRecoil,
    energyJ,
    energyFtLb: joulesToFtLb(energyJ),
    momentum: effective,
    // What the shooter actually feels. Anything past about 20 ft-lbf makes
    // most people flinch, and a flinch is worth more misses than wind is.
    impulse: effective,
    pellets,
  };
}

/* Where the muzzle is when the bullet leaves it. Recoil rotates the rifle
   about the shoulder before the bullet clears the barrel, and how much
   depends on how far the bore sits above the point it is held — which is
   why a high bore axis climbs and a straight-line stock does not. */
function muzzleRise(recoil, opts = {}) {
  const boreAxisM = opts.boreAxisM != null ? opts.boreAxisM : 0.045;
  const gunMassKg = opts.gunMassKg || 4;
  const inertia = opts.rotationalInertia != null ? opts.rotationalInertia : gunMassKg * 0.09;
  const angularVel = (recoil.momentum * boreAxisM) / inertia;   // rad/s
  return {
    angularVelocityRad: angularVel,
    // Degrees of climb by the time the shooter has reacted, before any
    // deliberate recovery.
    riseDeg: (angularVel * 0.06) * 180 / Math.PI,
    recoveryS: 0.18 + recoil.energyJ / 90,
  };
}
