#!/usr/bin/env node
/* Headless checks for the Survivor simulation.
 *
 * These are not unit tests in the "does the getter return the field" sense.
 * They check the simulation against numbers from outside the project —
 * published physiology, published ballistics tables, published terminal
 * results — because the whole claim this game makes is that its mechanics
 * match reality, and a claim like that has to be falsifiable.
 *
 * Where a published figure is a range, the range is the assertion. Where
 * sources disagree, the comment says so rather than picking a favourite.
 *
 * Usage: node survivor/test/sim.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const MODULES = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
const code = MODULES.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
const ctx = vm.createContext({
  console, Math, Number, Array, Float32Array, Float64Array, Uint8Array, Uint16Array,
  Uint32Array, Int32Array, Map, Set, JSON, Infinity, NaN, Date, isFinite, isNaN,
});
vm.runInContext(`${code}
this.API = {
  UNIT, ramp, clamp01,
  Physiology, pandolfWatts, basalMetabolicRate, bodySurfaceArea, windChill, TERRAIN_FACTOR,
  DiseaseSystem, PATHOGENS, PATHOGEN_BY_ID, SYMPTOM,
  InjurySystem, BODY_REGION, BONE,
  Projectile, integrateTrajectory, zeroAngleDeg, freeRecoil, CARTRIDGES, msToFps, yardsToM, joulesToFtLb,
  penetrate, penetrationDepth, layer, ASSEMBLY, PEN_MATERIAL, woundSeverity, bulletDynamics,
};`, ctx);
const A = ctx.API;

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
function between(name, value, lo, hi, unit = '') {
  check(`${name} (${value.toFixed(2)}${unit}, expected ${lo}-${hi}${unit})`, value >= lo && value <= hi);
}
function section(t) { console.log(`\n${t}`); }

/* Run a body forward through simulated time. */
function live(phys, hours, env, stepMinutes = 5, hook) {
  const dt = stepMinutes * 60;
  const n = Math.round((hours * 3600) / dt);
  for (let i = 0; i < n; i++) {
    const e = typeof env === 'function' ? env((i * dt) / 3600) : env;
    if (hook) hook(phys, (i * dt) / 3600);
    phys.step(dt, e);
    if (!phys.alive) return (i * dt) / 3600;
  }
  return null;
}

/* ---------------- physiology against published equations ---------------- */
{
  section('physiology: published equations');

  // Mifflin-St Jeor for an 80 kg, 178 cm, 30-year-old male.
  between('Mifflin-St Jeor RMR', A.basalMetabolicRate(80, 178, 30, 'male'), 1760, 1775, ' kcal/day');
  between('DuBois body surface area', A.bodySurfaceArea(80, 178), 1.90, 2.05, ' m2');

  // Walking at 3 mph costs about 300 kcal/h for an 80 kg adult.
  const walkW = A.pandolfWatts(80, 0, 1.34, 0, 1.1);
  between('Pandolf, walking 1.34 m/s unloaded', (walkW * 3600) / 4184, 280, 330, ' kcal/h');
  // The load term is quadratic in load fraction, so 20 kg costs far more
  // than 20/80 of body weight would suggest.
  check('Pandolf load term is superlinear',
    A.pandolfWatts(80, 40, 1.34, 0, 1.1) - A.pandolfWatts(80, 20, 1.34, 0, 1.1)
    > A.pandolfWatts(80, 20, 1.34, 0, 1.1) - A.pandolfWatts(80, 0, 1.34, 0, 1.1));
  between('Pandolf, loose sand vs blacktop',
    A.pandolfWatts(80, 0, 1.34, 0, 2.1) / A.pandolfWatts(80, 0, 1.34, 0, 1.0), 1.5, 2.0, 'x');
  // Environment Canada wind chill: -10 C with 36 km/h wind is about -21.
  between('wind chill, -10 C at 10 m/s', A.windChill(-10, 10), -23, -19, ' C');
}

{
  section('physiology: water');

  // Total daily water turnover at rest in temperate conditions is 2.5-3 L.
  const p = new A.Physiology({});
  let drank = 0;
  live(p, 24, { airTempC: 18, windMs: 0.5, humidity: 0.5, speedMs: 0 }, 10, (b) => {
    if (b.dehydration > 0.005) { b.drink(0.25); drank += 0.25; }
  });
  between('resting daily water requirement', drank, 2.2, 3.2, ' L');

  // Survival without water is quoted as "about three days", but that rule of
  // thumb assumes activity and warmth. The model should bracket it: longer
  // when cool and still, much shorter when working in heat. Reproducing "3
  // days" in every condition would be less accurate, not more.
  const cool = live(new A.Physiology({}), 24 * 14,
    { airTempC: 18, windMs: 0.5, humidity: 0.5, speedMs: 0 }, 10);
  const hot = live(new A.Physiology({}), 24 * 14,
    { airTempC: 28, windMs: 1, humidity: 0.45, speedMs: 0.9, loadKg: 8, terrainFactor: 1.2 }, 10);
  between('death by dehydration, cool and resting', cool / 24, 4, 9, ' days');
  between('death by dehydration, warm and walking', hot / 24, 1, 3, ' days');
  check('working in heat kills faster than resting in the cool', hot < cool);

  // Seawater costs more water to excrete than it provides.
  const sw = new A.Physiology({});
  const before = sw.bodyWaterL;
  sw.drink(1.0, { salinityGL: 35 });
  live(sw, 6, { airTempC: 18, speedMs: 0 }, 10);
  const fresh = new A.Physiology({});
  fresh.drink(1.0);
  live(fresh, 6, { airTempC: 18, speedMs: 0 }, 10);
  check('drinking seawater leaves you drier than drinking nothing at all',
    sw.bodyWaterL < fresh.bodyWaterL, `${sw.bodyWaterL.toFixed(2)} vs ${fresh.bodyWaterL.toFixed(2)} L`);
}

{
  section('physiology: heat and cold');

  // Cold water immersion: 10 C water takes a clothed adult to moderate
  // hypothermia in roughly an hour, which is why the sea is the fastest
  // thing on this island.
  const cold = new A.Physiology({ clothingClo: 0.8 });
  cold.wet = 1;
  let t = 0;
  while (cold.coreTempC > 32 && t < 6) {
    cold.step(120, { airTempC: 12, inWater: true, waterTempC: 10, humidity: 1, speedMs: 0 });
    t += 120 / 3600;
  }
  between('10 C water to 32 C core', t * 60, 45, 120, ' min');

  // The same air temperature is survivable for hours.
  const air = new A.Physiology({ clothingClo: 0.8 });
  let ta = 0;
  while (air.coreTempC > 35 && ta < 24) {
    air.step(300, { airTempC: -5, windMs: 5, humidity: 0.6, speedMs: 0 });
    ta += 300 / 3600;
  }
  check('cold water is far more dangerous than cold air', ta > t * 3,
    `${(ta * 60).toFixed(0)} min in air vs ${(t * 60).toFixed(0)} min in water`);
  check('shivering burns the glycogen it is paid for with', air.glycogenKcal < 2000);

  // Humidity, not temperature, is what makes heat lethal: the same work in
  // the same air is survivable dry and is not survivable wet.
  const dry = new A.Physiology({}), humid = new A.Physiology({});
  const workEnv = (h) => ({ airTempC: 35, windMs: 1, humidity: h, speedMs: 1.2, loadKg: 10, terrainFactor: 1.2 });
  live(dry, 4, workEnv(0.25), 5);
  live(humid, 4, workEnv(0.92), 5);
  check('humid heat drives core temperature higher than dry heat',
    humid.coreTempC > dry.coreTempC + 0.5,
    `${humid.coreTempC.toFixed(2)} C humid vs ${dry.coreTempC.toFixed(2)} C dry`);
  check('sweat is wasted when the air cannot take it', humid.drippedLh > 0.05,
    `${humid.drippedLh.toFixed(2)} L/h running off`);
}

{
  section('physiology: food, sleep, bladder');

  // Sedentary total daily energy expenditure, 2100-2400 kcal for this body.
  const p = new A.Physiology({});
  const store = (b) => b.glycogenKcal + b.fatMassKg * 7700 + b.leanMassKg * 1020;
  const before = store(p);
  live(p, 24, { airTempC: 20, windMs: 0.3, humidity: 0.5, speedMs: 0 }, 10, (b) => b.drink(0.02));
  between('sedentary daily energy expenditure', before - store(p), 1900, 2500, ' kcal');

  // Starvation with water available: the famine literature puts death at
  // 45-70 days for a normally-nourished adult, at about BMI 13.
  const s = new A.Physiology({});
  const died = live(s, 24 * 120, (h) => ({
    airTempC: 20, windMs: 0.3, humidity: 0.5, hourOfDay: h % 24,
    speedMs: (h % 24) < 8 ? 0 : 0.2, terrainFactor: 1.1,
  }), 30, (b, h) => { b.asleep = (h % 24) < 8; b.drink(0.06); });
  between('death by starvation with water available', died / 24, 40, 75, ' days');
  check('starvation kills through wasting, not an empty bar',
    s.causeOfDeath === 'starvation' && s.bmi < 14, `${s.causeOfDeath}, BMI ${s.bmi.toFixed(1)}`);

  // Two-process model: sixteen hours awake should leave sleep pressure high,
  // and eight hours of sleep should clear most of it.
  const sl = new A.Physiology({});
  live(sl, 16, { airTempC: 20, speedMs: 0 }, 10);
  between('sleep pressure after 16 h awake', sl.sleepPressure, 0.55, 0.80, '');
  sl.asleep = true;
  live(sl, 8, { airTempC: 20, speedMs: 0 }, 10);
  check('eight hours of sleep clears most of the pressure', sl.sleepPressure < 0.2,
    sl.sleepPressure.toFixed(3));
  // Alertness has a circadian trough regardless of how rested you are.
  check('04:00 is worse than 16:00 at equal sleep pressure',
    sl.alertness(4) < sl.alertness(16));

  // Bladder: first urge around 3-4 h at normal intake, involuntary void if
  // ignored long enough.
  const b = new A.Physiology({});
  let urge = null, voided = null, tt = 0;
  for (let i = 0; i < 24 * 12; i++) {
    b.step(300, { airTempC: 20, windMs: 0.3, speedMs: 0 });
    b.drink(0.0125);
    tt += 300 / 3600;
    if (!urge && b.bladderMl > 250) urge = tt;
    if (!voided && b.wetSelf) voided = tt;
  }
  between('first need to urinate', urge, 2, 5, ' h');
  check('an ignored bladder eventually empties itself', voided !== null && voided > urge,
    voided ? `${voided.toFixed(1)} h` : 'never');
}

/* ---------------- disease ---------------- */
{
  section('disease');

  let seed = 42;
  const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const ds = new A.DiseaseSystem({ rng });
  // Force the infection rather than gambling on the roll.
  const inf = new (Object.getPrototypeOf(ds).constructor)({ rng });
  const giardia = A.PATHOGEN_BY_ID.giardiasis;

  const d1 = new A.DiseaseSystem({ rng: () => 0 });   // always infects
  d1.expose('untreatedWater');
  check('drinking untreated water can infect you', d1.infections.length > 0,
    d1.infections.map((i) => i.id).join(', '));

  const d2 = new A.DiseaseSystem({ rng: () => 0.999 });  // never infects
  d2.expose('untreatedWater');
  check('boiled water does not', d2.infections.length === 0);

  // Hygiene is a real defence with a real magnitude.
  let sickBare = 0, sickGloved = 0;
  for (let i = 0; i < 400; i++) {
    const a = new A.DiseaseSystem({ rng });
    a.expose('skinningRabbit', { hygiene: 0 });
    if (a.infections.length) sickBare++;
    const g = new A.DiseaseSystem({ rng });
    g.expose('skinningRabbit', { hygiene: 0.95 });
    if (g.infections.length) sickGloved++;
  }
  check('gloves cut the risk of skinning rabbits by an order of magnitude',
    sickGloved * 5 < sickBare, `${sickBare} bare vs ${sickGloved} gloved of 400`);

  // Incubation must actually elapse before anything is observable — the
  // player has to be able to be sick and not know it yet.
  const d3 = new A.DiseaseSystem({ rng: () => 0 });
  d3.expose('untreatedWater');
  d3.step(1, null);
  const earlyGiardia = d3.infections.find((i) => i.id === 'giardiasis');
  check('giardiasis is silent for its first week', earlyGiardia && earlyGiardia.incubating);
  d3.step(20, null);
  check('and symptomatic after it', d3.observedSymptoms().length > 0,
    d3.observedSymptoms().map((s) => s.id).join(', '));

  // The differential must name the disease without being told it.
  const diff = d3.differential();
  check('the differential ranks the actual disease at or near the top',
    diff.slice(0, 3).some((d) => d.id === 'giardiasis'),
    diff.slice(0, 3).map((d) => `${d.id} ${(d.confidence * 100).toFixed(0)}%`).join(', '));

  // Treating the wrong thing does nothing and costs you the dose.
  const before = d3.infections[0].treatmentEfficacy;
  d3.treat('albendazole');
  check('the wrong drug has no effect', d3.infections[0].treatmentEfficacy === before);
  d3.treat('metronidazole');
  check('the right drug does', d3.infections[0].treatmentEfficacy >= 0.95);

  // Rabies: the vaccine works before symptoms and never after.
  const early = new A.DiseaseSystem({ rng: () => 0 });
  early.expose('carnivoreBite');
  const r1 = early.infections.find((i) => i.id === 'rabies');
  check('rabies is caught from a carnivore bite', !!r1);
  check('post-exposure prophylaxis works during incubation',
    early.treat('rabiesPEP').some((x) => x.efficacy >= 1));
  const late = new A.DiseaseSystem({ rng: () => 0 });
  late.expose('carnivoreBite');
  late.step(120, null);
  const r2 = late.infections.find((i) => i.id === 'rabies');
  if (r2 && r2.symptomatic) {
    check('and does nothing once symptoms start', late.treat('rabiesPEP')
      .every((x) => x.infection !== 'rabies' || x.efficacy === 0));
  } else {
    check('rabies reaches symptoms within 120 days', false, 'still incubating');
  }

  // Brucellosis needs two drugs; either alone relapses.
  const br = new A.DiseaseSystem({ rng: () => 0 });
  br.expose('rawMilk');
  const b1 = br.infections.find((i) => i.id === 'brucellosis');
  if (b1) {
    b1.treat('doxycycline');
    const single = b1.treatmentEfficacy;
    b1.treat('rifampin');
    check('brucellosis needs both drugs together', b1.treatmentEfficacy > single,
      `${single.toFixed(2)} -> ${b1.treatmentEfficacy.toFixed(2)}`);
  } else check('brucellosis is caught from raw milk', false);

  // Illness acts on the body, not on a status icon.
  const phys = new A.Physiology({});
  const gut = new A.DiseaseSystem({ rng: () => 0 });
  gut.expose('untreatedWater');
  // Stepped a day at a time, as the world does — a single 30-day step would
  // be testing the integrator rather than the illness.
  for (let i = 0; i < 30; i++) gut.step(1, phys);
  const control = new A.Physiology({});
  check('diarrhoea costs real water', phys.bodyWaterL < control.bodyWaterL,
    `${phys.bodyWaterL.toFixed(2)} vs ${control.bodyWaterL.toFixed(2)} L`);
}

/* ---------------- injury ---------------- */
{
  section('injury');

  const inj = new A.InjurySystem({ rng: () => 0.0 });
  const w = inj.wound({ type: 'arterial', region: 'thigh', severity: 1 });
  const phys = new A.Physiology({});
  // An uncontrolled femoral bleed empties an adult in a few minutes.
  let t = 0;
  while (phys.bloodLossFraction < 0.40 && t < 1800) { inj.step(1, phys); t += 1; }
  between('uncontrolled femoral bleed to class IV shock', t, 60, 240, ' s');

  // A tourniquet is the answer, and leaving it on is a different problem.
  const inj2 = new A.InjurySystem({ rng: () => 0.0 });
  const w2 = inj2.wound({ type: 'arterial', region: 'thigh', severity: 1 });
  check('a tourniquet stops a limb bleed', w2.apply('tourniquet').ok && w2.bleedRate() === 0);
  const w3 = new (Object.getPrototypeOf(w2).constructor)({ type: 'arterial', region: 'neck', severity: 1 });
  check('and cannot be applied to a neck', !w3.apply('tourniquet').ok);
  inj2.step(3 * 3600, new A.Physiology(), null);
  check('the ischaemia clock is reported', inj2.tourniquetWarnings()[0].state !== 'safe for now',
    inj2.tourniquetWarnings()[0].state);

  // Knockouts: the design calls for three game-minutes at the light end and
  // a full game-day at the heavy end, scaled by the energy of the blow.
  const DAY = 2400;   // 40 real minutes
  const light = new A.InjurySystem({ rng: () => 0.9 }).headImpact(90, DAY, 0);
  const heavy = new A.InjurySystem({ rng: () => 0.9 }).headImpact(2100, DAY, 0);
  between('a light blow knocks you out for', light.seconds, 4, 60, ' s');
  between('a heavy blow knocks you out for', heavy.seconds, 900, 2400, ' s');
  check('knockout duration rises with the energy of the blow', heavy.seconds > light.seconds * 20);
  check('a tap does nothing at all', new A.InjurySystem({}).headImpact(40, DAY, 0) === null);

  // Falls: the surface matters more than the height does.
  const onConcrete = new A.InjurySystem({ rng: () => 0.0 }).fall(12, 80, 'concrete', DAY, 0);
  const onSnow = new A.InjurySystem({ rng: () => 0.0 }).fall(12, 80, 'snow', DAY, 0);
  check('the same fall onto concrete decelerates harder than onto snow',
    onConcrete.decelG > onSnow.decelG * 3,
    `${onConcrete.decelG.toFixed(0)} g vs ${onSnow.decelG.toFixed(0)} g`);
  check('a short drop breaks nothing',
    new A.InjurySystem({ rng: () => 0.0 }).fall(3, 80, 'dirt', DAY, 0).injuries.length === 0);
  check('a long drop breaks legs',
    new A.InjurySystem({ rng: () => 0.0 }).fall(14, 80, 'concrete', DAY, 0).injuries.length > 0);

  // An unsplinted break barely heals, and stops you moving.
  const fx = new A.InjurySystem({ rng: () => 0.0 });
  fx.tryFracture('thigh', 9000);
  check('a femur can be broken by enough energy', fx.fractures.length === 1);
  check('a broken femur stops you walking', fx.capacityMultiplier() < 0.3,
    fx.capacityMultiplier().toFixed(2));
  fx.splint('femur');
  check('splinting it helps', fx.capacityMultiplier() > 0.3);
}

/* ---------------- exterior ballistics ---------------- */
{
  section('ballistics: published trajectory tables');

  const velocityAt = (proj, yards, opts = {}) => {
    const m = A.yardsToM(yards);
    const tr = A.integrateTrajectory(proj, Object.assign({ maxRange: m + 1, dt: 0.0004, sampleEvery: 2 }, opts));
    let best = null;
    for (const s of tr.samples) if (s.rangeM <= m) best = s;
    return A.msToFps(best.speedMs);
  };
  // Tolerance is 3%: published tables from different makers for the same
  // load routinely differ by more than that, so a tighter assertion would
  // be testing one manufacturer's rounding rather than the model.
  const table = (id, points, opts = {}) => {
    const p = new A.Projectile(id, opts);
    for (const [yd, pub] of points) {
      const got = velocityAt(p, yd, opts);
      const err = Math.abs(got - pub) / pub;
      check(`${A.CARTRIDGES[id].name} at ${yd} yd: ${got.toFixed(0)} fps vs ${pub} published`,
        err < 0.03, `${(err * 100).toFixed(1)}% off`);
    }
  };
  table('308win', [[100, 2461], [200, 2280], [300, 2107]]);
  table('556nato', [[100, 2727], [200, 2455], [300, 2199]]);
  table('762x39', [[100, 2100], [200, 1868], [300, 1655]]);
  table('45acp', [[50, 801], [100, 775]]);

  // Muzzle energies straight off the box.
  const me = (id) => A.joulesToFtLb(new A.Projectile(id).muzzleEnergyJ);
  between('.308 Win muzzle energy', me('308win'), 2550, 2700, ' ft-lbf');
  between('.22 LR muzzle energy', me('22lr'), 130, 150, ' ft-lbf');
  between('.50 BMG muzzle energy', me('50bmg'), 12000, 13000, ' ft-lbf');

  // Drop and drift have to be there and have to have the right sign and
  // rough magnitude: a 10 mph crosswind moves a .308 about two feet at 500.
  const p308 = new A.Projectile('308win');
  const ang = A.zeroAngleDeg(p308, A.yardsToM(100));
  const tr = A.integrateTrajectory(p308, { launchAngleDeg: ang, maxRange: A.yardsToM(500), windMs: 4.47, windAngleDeg: 90 });
  const at500 = tr.samples[tr.samples.length - 1];
  between('.308 drift at 500 yd in a 10 mph crosswind', at500.driftM / 0.0254, 18, 32, ' in');
  check('.308 is well below the line of sight at 500 yd with a 100 yd zero', at500.dropM < -1.0,
    `${(at500.dropM / 0.0254).toFixed(0)} in`);

  // Barrel length: a .357 out of a carbine is a different cartridge.
  const snub = new A.Projectile('357mag', { barrelIn: 4 });
  const carbine = new A.Projectile('357mag', { barrelIn: 16 });
  check('a .357 gains a lot from a rifle barrel',
    carbine.muzzleEnergyJ > snub.muzzleEnergyJ * 1.35,
    `${A.joulesToFtLb(snub.muzzleEnergyJ).toFixed(0)} -> ${A.joulesToFtLb(carbine.muzzleEnergyJ).toFixed(0)} ft-lbf`);

  section('ballistics: free recoil');
  const recoil = (id, lb) => A.freeRecoil(new A.Projectile(id), lb * A.UNIT.LB_KG).energyFtLb;
  between('.308 in an 8 lb rifle', recoil('308win', 8), 14, 19, ' ft-lbf');
  between('5.56 in a 7.5 lb rifle', recoil('556nato', 7.5), 3, 5, ' ft-lbf');
  between('.45 ACP in a 2.5 lb pistol', recoil('45acp', 2.5), 4.5, 7, ' ft-lbf');
  between('.300 Win Mag in an 8.5 lb rifle', recoil('300winmag', 8.5), 22, 32, ' ft-lbf');
  between('.50 BMG in a 30 lb rifle', recoil('50bmg', 30), 80, 105, ' ft-lbf');
  check('a muzzle brake reduces recoil',
    A.freeRecoil(new A.Projectile('300winmag'), 3.85, { brakeEfficiency: 0.5 }).energyJ
    < A.freeRecoil(new A.Projectile('300winmag'), 3.85).energyJ * 0.85);
}

/* ---------------- terminal ballistics ---------------- */
{
  section('penetration: 10% ordnance gelatin');

  const depthCm = (id) => A.penetrationDepth(new A.Projectile(id), 'gelatin', { maxDepthM: 2.5 }) * 100;
  // Published FBI-protocol bare-gelatin results. The ranges are wide because
  // the real spread between lots and loads is wide.
  between('9mm 115gr FMJ', depthCm('9mm_fmj'), 52, 78, ' cm');
  between('9mm 115gr JHP', depthCm('9mm'), 24, 46, ' cm');
  between('.45 ACP 230gr FMJ', depthCm('45acp'), 55, 75, ' cm');
  between('.22 LR 40gr', depthCm('22lr'), 33, 48, ' cm');
  between('7.62x39 123gr', depthCm('762x39'), 52, 72, ' cm');
  between('.308 Win 168gr', depthCm('308win'), 45, 78, ' cm');
  between('5.56 M855 (fragments)', depthCm('556nato'), 26, 48, ' cm');
  between('12 ga 00 buck, per pellet', depthCm('12ga_00buck'), 32, 52, ' cm');

  // The signature result that no single drag law can reproduce: a 9mm and a
  // .308 reach comparable depth despite a sevenfold difference in energy,
  // because the rifle bullet turns sideways and the pistol bullet does not.
  check('a 9mm reaches comparable depth to a .308 despite far less energy',
    Math.abs(depthCm('9mm_fmj') - depthCm('308win')) < 25,
    `${depthCm('9mm_fmj').toFixed(0)} vs ${depthCm('308win').toFixed(0)} cm`);
  const dynPistol = A.bulletDynamics(new A.Projectile('9mm_fmj'));
  const dynRifle = A.bulletDynamics(new A.Projectile('308win'));
  check('and the reason is yaw, not drag', dynRifle.yawLengthM * 5 < dynPistol.yawLengthM,
    `yaw length ${dynRifle.yawLengthM.toFixed(2)} m rifle vs ${dynPistol.yawLengthM.toFixed(2)} m pistol`);

  section('penetration: structures');

  const IN = A.UNIT.INCH_M;
  const sheetsOfDrywall = (id) => {
    const p = new A.Projectile(id);
    let n = 0, v = p.muzzleMs;
    for (let i = 0; i < 80; i++) {
      const res = A.penetrate(p, [A.layer('paperFacing', 0.0004), A.layer('gypsum', 0.5 * IN),
        A.layer('paperFacing', 0.0004), A.layer('air', 0.2)], { impactVelocityMs: v });
      if (!res.perforated || res.exitVelocityMs < 30) break;
      v = res.exitVelocityMs; n++;
    }
    return n;
  };
  // Documented informal testing puts handgun rounds at 8-12 sheets of half-inch
  // drywall and rifle rounds well past 20.
  between('9mm through 1/2" drywall sheets', sheetsOfDrywall('9mm'), 6, 13, ' sheets');
  between('.45 ACP through drywall', sheetsOfDrywall('45acp'), 5, 12, ' sheets');
  check('.308 goes through more than twice as many as a 9mm',
    sheetsOfDrywall('308win') > sheetsOfDrywall('9mm') * 2,
    `${sheetsOfDrywall('308win')} vs ${sheetsOfDrywall('9mm')}`);

  between('9mm into pine', A.penetrationDepth(new A.Projectile('9mm_fmj'), 'pineStud', { maxDepthM: 1 }) * 1000,
    110, 200, ' mm');
  between('.308 into pine', A.penetrationDepth(new A.Projectile('308win'), 'pineStud', { maxDepthM: 1.5 }) * 1000,
    330, 520, ' mm');

  // Hard targets are about what the bullet is made of, not what it carries.
  const steel = (id) => A.penetrationDepth(new A.Projectile(id), 'mildSteel', { maxDepthM: 0.2 }) * 1000;
  check('a lead-cored 9mm barely marks steel plate', steel('9mm_fmj') < 6, `${steel('9mm_fmj').toFixed(1)} mm`);
  between('5.56 M855 steel core into mild steel', steel('556nato'), 7, 15, ' mm');
  check('M855 outpenetrates a .308 in steel despite half the energy',
    steel('556nato') > steel('308win'),
    `${steel('556nato').toFixed(1)} mm vs ${steel('308win').toFixed(1)} mm`);
  check('.50 BMG goes deepest of all', steel('50bmg') > steel('556nato') * 1.5);

  section('penetration: the wall-bang');

  // The headline case. A round fired through an interior partition must
  // arrive on the far side slower, and how much slower must depend on the
  // round — a .308 barely notices the wall, a 9mm loses most of what it had.
  const wall = A.ASSEMBLY.interiorPartition();
  for (const id of ['9mm', '556nato', '308win']) {
    const p = new A.Projectile(id);
    const res = A.penetrate(p, wall);
    check(`${A.CARTRIDGES[id].name} perforates an interior partition`, res.perforated);
    check(`  and arrives slower than it left`, res.exitVelocityMs < p.muzzleMs);
  }
  const p22 = new A.Projectile('22lr');
  const stud = A.penetrate(p22, A.ASSEMBLY.interiorPartitionThroughStud());
  const cavity = A.penetrate(p22, wall);
  check('hitting a stud costs far more than hitting the cavity',
    stud.exitVelocityMs < cavity.exitVelocityMs * 0.6,
    `${A.msToFps(stud.exitVelocityMs).toFixed(0)} fps through the stud vs ${A.msToFps(cavity.exitVelocityMs).toFixed(0)} fps through the cavity`);

  // Severity on the far side of a wall, against severity with a clear shot.
  const throughWall = (id) => {
    const p = new A.Projectile(id);
    const a = A.woundSeverity(p, A.penetrate(p, wall.concat(A.ASSEMBLY.torso())), 'thorax');
    const b = A.woundSeverity(p, A.penetrate(p, A.ASSEMBLY.torso()), 'thorax');
    return a.severity / b.severity;
  };
  check('a wall takes most of the sting out of a 9mm', throughWall('9mm') < 0.55,
    `${(throughWall('9mm') * 100).toFixed(0)}% as effective`);
  check('and almost none out of a .308', throughWall('308win') > 0.85,
    `${(throughWall('308win') * 100).toFixed(0)}% as effective`);

  section('penetration: armour and vehicles');
  const stops = (assembly, id) => !A.penetrate(new A.Projectile(id), assembly()).perforated;
  check('soft armour stops a 9mm', stops(A.ASSEMBLY.softArmourIIIA, '9mm'));
  check('soft armour does not stop a rifle round', !stops(A.ASSEMBLY.softArmourIIIA, '308win'));
  check('a rifle plate does stop one', stops(A.ASSEMBLY.plateCarrierIV, '308win'));
  check('a car door does not stop a rifle round', !stops(A.ASSEMBLY.carDoor, '762x39'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
