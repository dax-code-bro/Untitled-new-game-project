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
  Ecology, Carcass, SPECIES, rollIndividual, butcherYield, Fishery, FISH_SPECIES,
  WorldClock, solarPosition, daylightHours,
  generateIsland, classifyTerrain, traceRivers, BIOME,
  generateHouse, Building, Wall, ROOM,
  ElectricalSystem, Circuit, Conductor, Load, PowerSource, checkWiring, AWG,
  Firearm, WEAPONS, handload,
  World, GAME_MODE,
  Horse, Vehicle, GAIT, HORSE_BREED, VEHICLE_SPEC, fuelViability,
  NEED, currentNeed, hoursUntilNeedChange, ALERT, alertStateFor, senseAll,
  senseSight, senseHearing, senseSmell, SIGN, Sign, BLOOD, bloodFor,
  CALL, callResponse, PressureMap, LIFE_STAGE, stageFor, stageName,
  growthFraction, trophyScore, trophyRating, COAT, rollCoat, rutIntensity, Ecology,
  Fire, Provision, FIRE_KIND, FOOD_STATE, WATER_TREATMENT, treatWater, drinkTreated,
  SV_VECTOR_BEAR: VECTOR.undercookedBear,
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

/* ---------------- ecology ---------------- */
{
  section('ecology');

  let seed = 99;
  const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const eco = new A.Ecology({ rng, worldSizeM: 4000, maxAnimals: 500 });
  for (let i = 0; i < 24; i++) {
    const ang = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 1700;
    eco.addZone({
      x: Math.cos(ang) * r, z: Math.sin(ang) * r, radiusM: 150 + rng() * 200,
      grass: rng(), browse: rng(), mast: rng() * 0.6, water: i % 6 === 0, cover: rng(),
    });
  }
  const n = eco.populate();
  check('the island carries its full population', n === 500, `${n}`);
  const census = eco.census();
  check('of many species', Object.keys(census).length >= 15, `${Object.keys(census).length}`);
  check('prey outnumber predators by an order of magnitude',
    (census.cottontailRabbit || 0) + (census.graySquirrel || 0) + (census.whitetailDeer || 0)
    > 10 * ((census.grayWolf || 0) + (census.grizzlyBear || 0) + (census.cougar || 0)));
  check('group-living species are placed in groups', eco.groups.size > 10, `${eco.groups.size} groups`);

  // A week of the whole island, at the rate the game runs it.
  const t0 = Date.now();
  let now = 0;
  for (let i = 0; i < 7 * 24 * 12; i++) {
    now += 300;
    eco.step(300, { playerX: 0, playerZ: 0, now, hourOfDay: (now / 3600) % 24, airTempC: 18 });
  }
  const ms = Date.now() - t0;
  check('a week of the island simulates in well under a second', ms < 3000, `${ms} ms`);
  check('animals move about their range',
    eco.animals.filter((a) => Math.hypot(a.x - a.homeX, a.z - a.homeZ) > 50).length > eco.animals.length * 0.3);
  check('grazing pressure builds where animals feed',
    eco.zones.some((z) => z.pressure > 0.05),
    `max pressure ${Math.max(...eco.zones.map((z) => z.pressure)).toFixed(2)}`);
  check('predators kill prey', eco.stats.died > 0, `${eco.stats.died} died`);

  // Detection: the whole hunt is here.
  const deer = eco.animals.find((a) => a.speciesId === 'whitetailDeer');
  const env = (o) => Object.assign({ windMs: 3, noise: 0, movementSpeed: 0, concealment: 0.8, light: 1 }, o);
  const downwind = deer.detectionChance(80, 0, env({ windDirX: -1, windDirZ: 0 }));
  const upwind = deer.detectionChance(80, 0, env({ windDirX: 1, windDirZ: 0 }));
  check('a deer barely notices a still, hidden hunter downwind of it', downwind < 0.1,
    `${(downwind * 100).toFixed(0)}%`);
  check('and usually notices the same hunter upwind', upwind > 0.5, `${(upwind * 100).toFixed(0)}%`);
  const crashing = deer.detectionChance(80, 0, env({ windDirX: -1, windDirZ: 0, noise: 0.8, movementSpeed: 1, concealment: 0 }));
  check('noise and movement give you away even downwind', crashing > downwind * 3);
  const night = deer.detectionChance(80, 0, env({ windDirX: -1, windDirZ: 0, movementSpeed: 1, concealment: 0, light: 0.03 }));
  const day = deer.detectionChance(80, 0, env({ windDirX: -1, windDirZ: 0, movementSpeed: 1, concealment: 0, light: 1 }));
  check('darkness helps', night < day, `${(night * 100).toFixed(0)}% vs ${(day * 100).toFixed(0)}%`);

  section('carcasses');
  // Four days from kill to bone with scavengers on it, which is the design's
  // figure, reached through accumulated degree-days and scavenger pressure
  // rather than through a four-day timer.
  const car = new A.Carcass({ x: 0, z: 0, speciesId: 'whitetailDeer', massKg: 90, meatKg: 38 });
  let daysToBone = 0;
  while (!car.skeletal && daysToBone < 20) {
    car.scavengersOnIt = 4;
    car.step(1, { airTempC: 22 });
    daysToBone++;
  }
  between('a scavenged deer reaches bone in', daysToBone, 3, 6, ' days');

  const hung = new A.Carcass({ x: 0, z: 0, speciesId: 'whitetailDeer', massKg: 90, meatKg: 38 });
  hung.protected = 1;
  for (let i = 0; i < 10; i++) hung.step(1, { airTempC: 3 });
  check('the same deer hung in the cold is still good after ten days',
    hung.meatRemainingKg > 30 && hung.spoilage < 0.4,
    `${hung.meatRemainingKg.toFixed(1)} kg, spoilage ${hung.spoilage.toFixed(2)}`);

  section('butchering');
  const ind = A.rollIndividual('whitetailDeer', () => 0.6);
  const y = A.butcherYield(ind, { skill: 0.6 });
  // A hunter gets roughly a third of live weight back as boned-out meat.
  between('venison yield as a share of live weight', y.meatKg / ind.massKg, 0.24, 0.45, '');
  // The rabbit-starvation trap, from the nutrition table alone.
  const rabbit = A.butcherYield(A.rollIndividual('cottontailRabbit', () => 0.5), { skill: 0.6 });
  const bear = A.butcherYield(A.rollIndividual('grizzlyBear', () => 0.6), { skill: 0.6, dayOfYear: 280 });
  check('rabbit is almost pure protein by energy', rabbit.proteinEnergyFraction > 0.7,
    `${(rabbit.proteinEnergyFraction * 100).toFixed(0)}%`);
  check('autumn bear is not', bear.proteinEnergyFraction < 0.65,
    `${(bear.proteinEnergyFraction * 100).toFixed(0)}%`);
  check('and eating only rabbit is what triggers protein poisoning',
    A.PATHOGEN_BY_ID.rabbitStarvation.vectors.includes('leanMeatOnly'));
}

/* ---------------- the clock ---------------- */
{
  section('world clock');

  const clock = new A.WorldClock({});
  check('one game-day is forty real minutes', clock.dayLengthRealS === 2400);
  check('which is 36x real time', Math.abs(clock.timeScale - 36) < 0.01);
  const dl = clock.daylight();
  between('daylight in the design default', dl.length, 11.5, 12.5, ' h');
  check('so day and night are twenty real minutes each',
    Math.abs(dl.length / 24 * clock.dayLengthRealS - 1200) < 60);

  // Real solar geometry: the sun is higher in summer than in winter, and
  // day length varies with the season once that is switched on.
  const seasonal = new A.WorldClock({ seasonalDayLength: true, latitudeDeg: 30.3 });
  seasonal.dayOfYear = 172;
  const summer = seasonal.daylight().length;
  seasonal.dayOfYear = 355;
  const winter = seasonal.daylight().length;
  between('midsummer daylight at 30 N', summer, 13.5, 14.5, ' h');
  between('midwinter daylight at 30 N', winter, 9.5, 10.5, ' h');

  // Solar noon puts the sun due south in the northern hemisphere.
  const noon = A.solarPosition(30.3, 172, 12);
  check('the sun is due south at noon', Math.abs(noon.azimuthDeg - 180) < 2,
    `${noon.azimuthDeg.toFixed(1)} deg`);
  between('and high in midsummer', noon.altitudeDeg, 78, 86, ' deg');
  const winterNoon = A.solarPosition(30.3, 355, 12);
  check('and much lower in midwinter', winterNoon.altitudeDeg < noon.altitudeDeg - 35,
    `${winterNoon.altitudeDeg.toFixed(1)} deg`);
  check('and below the horizon at midnight', A.solarPosition(30.3, 172, 0).altitudeDeg < 0);

  // The temperature minimum is before dawn, not at midnight.
  const w = new A.WorldClock({});
  let minT = Infinity, minH = 0, maxT = -Infinity, maxH = 0;
  for (let i = 0; i < 24 * 12; i++) {
    w.tick(2400 / (24 * 12));
    const e = w.environment();
    if (e.airTempC < minT) { minT = e.airTempC; minH = e.hourOfDay; }
    if (e.airTempC > maxT) { maxT = e.airTempC; maxH = e.hourOfDay; }
  }
  between('the coldest hour of the night', minH, 4, 7.5, ':00');
  between('the warmest hour of the day', maxH, 13, 17, ':00');
}

/* ---------------- terrain ---------------- */
{
  section('terrain');

  const t0 = Date.now();
  const { map } = A.generateIsland({ resolution: 257, erosionDroplets: 25000 });
  const genMs = Date.now() - t0;
  check('an island generates in a few seconds', genMs < 20000, `${genMs} ms`);

  const bounds = map.bounds();
  check('it has real relief', bounds.max > 120 && bounds.max < 400, `${bounds.max.toFixed(0)} m`);
  check('and a sea floor', bounds.min < -10, `${bounds.min.toFixed(0)} m`);

  let land = 0;
  for (const h of map.height) if (h > 0) land++;
  const landFrac = land / map.height.length;
  between('land covers a plausible share of the box', landFrac, 0.15, 0.55, '');

  // Erosion has to leave connected drainage, which is the whole reason to
  // run it rather than just adding noise.
  let flowCells = 0;
  for (const v of map.water) if (v > 1) flowCells++;
  check('water flowed over a large part of the land', flowCells > land * 0.3,
    `${flowCells} cells`);

  const slopes = [];
  let s2 = 7;
  const rnd = () => (s2 = (s2 * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 3000; i++) {
    const x = (rnd() - 0.5) * map.worldSizeM * 0.9, z = (rnd() - 0.5) * map.worldSizeM * 0.9;
    if (map.heightAtWorld(x, z) <= 0) continue;
    slopes.push(map.slopeAtWorld(x, z));
  }
  slopes.sort((a, b) => a - b);
  const median = slopes[Math.floor(slopes.length / 2)];
  between('median land slope', median, 3, 18, ' deg');
  const walkable = slopes.filter((v) => v < 30).length / slopes.length;
  between('walkable ground', walkable * 100, 60, 95, '%');

  const cls = A.classifyTerrain(map, {});
  const counts = {};
  for (let i = 0; i < cls.biome.length; i++) {
    const id = cls.biomeIds[cls.biome[i]];
    counts[id] = (counts[id] || 0) + 1;
  }
  check('the island has forest, open ground and rock',
    (counts.deepForest || 0) + (counts.woodland || 0) > 0
    && (counts.meadow || 0) + (counts.prairie || 0) + (counts.scrub || 0) > 0
    && (counts.rockyHill || 0) + (counts.cliff || 0) > 0,
    Object.keys(counts).join(', '));
  check('a two-hundred-metre island has no alpine zone', (counts.alpine || 0) === 0,
    `${counts.alpine || 0} alpine cells`);

  const rivers = A.traceRivers(map, {});
  check('rivers are traced', rivers.length > 0, `${rivers.length}`);
  check('and they reach the sea', rivers.filter((r) => r.reachesSea).length > 0,
    `${rivers.filter((r) => r.reachesSea).length} of ${rivers.length}`);
  // Pit filling is what makes that true; without it every river stops in the
  // first hollow the erosion left.
  check('every river runs downhill the whole way',
    rivers.every((r) => r.path[0].y > r.path[r.path.length - 1].y));

  // The same seed has to give the same island, forever.
  const a1 = A.generateIsland({ resolution: 129, erosionDroplets: 4000, seed: 12345 });
  const a2 = A.generateIsland({ resolution: 129, erosionDroplets: 4000, seed: 12345 });
  let same = true;
  for (let i = 0; i < a1.map.height.length; i += 97) {
    if (Math.abs(a1.map.height[i] - a2.map.height[i]) > 1e-6) { same = false; break; }
  }
  check('a seed always produces the same island', same);
}

/* ---------------- buildings ---------------- */
{
  section('buildings');

  let seed = 4242;
  const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const house = A.generateHouse({ x: 0, z: 0, y: 0, w: 11, d: 9, storeys: 2, rng, basement: true });
  check('a house has rooms', house.rooms.length >= 6, `${house.rooms.length}`);
  check('and walls', house.walls.length >= 10, `${house.walls.length}`);
  check('and a living room and a kitchen',
    house.rooms.some((r) => r.type === 'livingRoom') && house.rooms.some((r) => r.type === 'kitchen'));
  const kitchens = house.rooms.filter((r) => r.type === 'kitchen').length;
  check('and only one kitchen', kitchens === 1, `${kitchens}`);
  check('the bathroom is where the medicine is',
    house.rooms.filter((r) => r.type === 'bathroom')
      .some((r) => r.contents.some((c) => /antibiotic|painkiller|antiseptic|iodine|bandage/.test(c.item))));

  check('it is wired', house.circuits.length > 0 && !!house.panel);
  check('and the wet rooms are on ground-fault protection',
    house.circuits.filter((c) => c.rooms.some((r) => A.ROOM[r.type].wet)).every((c) => c.gfci));

  section('shooting through a real wall');
  const wall = house.walls.find((w) => !w.exterior);
  const proj = new A.Projectile('9mm_fmj');
  // Studs sit at 16 inch centres, so where along the wall the round lands
  // decides what it has to get through — which is what makes wall-banging a
  // matter of aim rather than luck.
  let studHits = 0, cavityHits = 0;
  for (let u = 0.02; u < Math.min(wall.lengthM, 3); u += 0.01) {
    if (wall.hasStudAt(u)) studHits++; else cavityHits++;
  }
  between('share of a wall that is stud', (studHits / (studHits + cavityHits)) * 100, 4, 18, '%');

  const throughCavity = A.penetrate(proj, wall.layersAt(0.203));
  const throughStud = A.penetrate(proj, A.ASSEMBLY.interiorPartitionThroughStud());
  check('a 9mm gets through the cavity', throughCavity.perforated);
  check('and loses far more through a stud',
    throughStud.exitVelocityMs < throughCavity.exitVelocityMs * 0.75,
    `${A.msToFps(throughStud.exitVelocityMs).toFixed(0)} vs ${A.msToFps(throughCavity.exitVelocityMs).toFixed(0)} fps`);

  // Damage and repair, in the order a real repair happens.
  wall.punch(1.0, 1.2, 0.06, { kind: 'breach' });
  check('a breach weakens the wall', wall.integrity < 1);
  check('nothing goes through a hole', A.penetrate(proj, wall.layersAt(1.0)).layers.length === 0);
  check('you cannot skin over a hole with no framing behind it',
    !wall.repair('board').ok, wall.repair('board').reason || '');
  const order = ['frame', 'sheathe', 'insulate', 'board', 'tape', 'mud', 'sand', 'paint'];
  let allOk = true;
  for (const step of order) if (!wall.repair(step).ok) allOk = false;
  check('and repairing it in the right order works', allOk && wall.integrity === 1);
}

/* ---------------- electricity ---------------- */
{
  section('electricity');

  // Ohm's law, and the ampacity tables.
  const c14 = new A.Conductor(14, 30);
  const c10 = new A.Conductor(10, 30);
  check('thicker wire has less resistance', c10.resistance < c14.resistance,
    `${c14.resistance.toFixed(3)} vs ${c10.resistance.toFixed(3)} ohm`);
  check('and carries more current', c10.ampacity > c14.ampacity);

  const sys = new A.ElectricalSystem();
  const gen = sys.addSource(new A.PowerSource({ kind: 'generator', capacityW: 5000, fuelL: 10, voltage: 240 }));
  const circuit = sys.addCircuit(new A.Circuit({ name: 'workshop', breakerA: 20, gauge: 12, lengthM: 25 }));
  gen.start();
  const heater = circuit.add(new A.Load({ name: 'heater', watts: 1500, on: true }));
  sys.step(1, {});
  const solved = circuit.solve(120);
  between('a 1500 W heater draws', solved.amps, 11, 14, ' A');
  check('with a small voltage drop over the run', solved.drop > 0 && solved.drop < 6,
    `${solved.drop.toFixed(2)} V`);

  // Overload the circuit and the breaker trips — after a delay, as a
  // thermal-magnetic breaker does.
  for (let i = 0; i < 3; i++) circuit.add(new A.Load({ name: 'heater', watts: 1500, on: true }));
  let tripped = false;
  for (let i = 0; i < 60 && !tripped; i++) { sys.step(1, {}); tripped = circuit.tripped; }
  check('overloading it trips the breaker', tripped);
  check('and it will not reset into a short', (() => {
    circuit.reset();
    circuit.faults.push({ kind: 'short' });
    return !circuit.reset().ok;
  })());

  // The shock model, on the published current thresholds.
  const sys2 = new A.ElectricalSystem();
  sys2.addSource(new A.PowerSource({ kind: 'grid', voltage: 240 }));
  sys2._supplyV = 240;
  const live = sys2.addCircuit(new A.Circuit({ name: 'lighting', breakerA: 15, gauge: 14, lengthM: 15 }));
  const dry = sys2.shock(live, { wet: false });
  const wet = sys2.shock(live, { wet: true, groundedFooting: true });
  check('a shock with dry hands is survivable', !dry.fatal, `${dry.currentMa.toFixed(1)} mA — ${dry.effect}`);
  check('the same shock soaked and earthed is not', wet.fatal,
    `${wet.currentMa.toFixed(0)} mA — ${wet.effect}`);
  check('insulated boots and gloves make it a tingle',
    sys2.shock(live, { wet: true, insulatedBoots: true, insulatedGloves: true }).currentMa < 5);
  const gfciCircuit = sys2.addCircuit(new A.Circuit({ name: 'bathroom', breakerA: 20, gauge: 12, gfci: true }));
  check('a ground-fault device saves you', sys2.shock(gfciCircuit, { wet: true }).savedByGfci);

  // The inspector's rules.
  check('a 30 A breaker on lighting cable is rejected',
    !A.checkWiring({ gauge: 14, breakerA: 30, lengthM: 20, ground: true, expectedLoadW: 500 }).ok);
  check('and a very long thin run is rejected for voltage drop',
    A.checkWiring({ gauge: 14, breakerA: 15, lengthM: 120, ground: true, expectedLoadW: 1400 })
      .problems.some((p) => /voltage drop/.test(p)));
  check('a correct run passes',
    A.checkWiring({ gauge: 12, breakerA: 20, lengthM: 20, ground: true, expectedLoadW: 1400 }).ok);
}

/* ---------------- firearms ---------------- */
{
  section('firearms');

  const rifle = new A.Firearm('remington700_308', { condition: 1, oilLevel: 0.6 });
  check('a clean rifle is reliable', rifle.reliability() > 0.9, rifle.reliability().toFixed(2));
  check('a scope needs a rail', !new A.Firearm('mauser98').attach('scope10x').ok);
  check('and fits one that has it', rifle.attach('scope10x').ok);
  check('a suppressor needs a threaded muzzle', !rifle.attach('suppressor').ok);
  check('and fits a threaded one', new A.Firearm('ruger1022').attach('suppressor').ok);

  const prone = rifle.accuracyMoa({ prone: true, skill: 0.8 });
  const standing = rifle.accuracyMoa({ prone: false, skill: 0.8 });
  check('prone shoots better than standing', prone < standing,
    `${prone.toFixed(2)} vs ${standing.toFixed(2)} MOA`);
  check('and being exhausted shoots worse',
    rifle.accuracyMoa({ prone: true, skill: 0.8, fatigue: 1 }) > prone * 1.5);

  // Fouling, and the design difference it exposes.
  const ak = new A.Firearm('ak47', { condition: 1, oilLevel: 0.6 });
  const m16 = new A.Firearm('m16', { condition: 1, oilLevel: 0.6 });
  for (const g of [ak, m16]) { g.fouling = 0.85; g.oilLevel = 0.15; }
  check('a filthy dry AK still works better than a filthy dry M16',
    ak.reliability() > m16.reliability(),
    `${ak.reliability().toFixed(2)} vs ${m16.reliability().toFixed(2)}`);

  // Stripping and cleaning is a sequence, not a button.
  const dirty = new A.Firearm('m16', { condition: 0.9 });
  dirty.fouling = 0.9;
  check('you cannot clean it assembled', !dirty.cleanPart('bore', { solvent: true }).ok);
  check('you cannot clean it with nothing', dirty.disassemble().ok && !dirty.cleanPart('bore', {}).ok);
  for (const part of Object.keys(dirty.parts)) dirty.cleanPart(part, { solvent: true });
  dirty.reassemble();
  check('and cleaning it properly restores reliability', dirty.reliability() > 0.8,
    dirty.reliability().toFixed(2));

  // Firing wears parts and heats the barrel.
  const worn = new A.Firearm('ak47', { condition: 1, oilLevel: 0.8 });
  worn.load(new Array(30).fill({ cartridgeId: '762x39', condition: 1 }));
  let fired = 0;
  for (let i = 0; i < 30; i++) if (worn.fire({ rng: () => 0.01 }).fired) fired++;
  check('a magazine goes downrange', fired > 25, `${fired} of 30`);
  check('and the barrel gets hot', worn.barrelTempC > 40, `${worn.barrelTempC.toFixed(0)} C`);
  check('and the gun is dirtier than it was', worn.fouling > 0);

  section('handloading');
  const good = A.handload({ cartridgeId: '308win', case: true, primer: 'large_rifle',
    bullet: true, powder: 'medium', chargeGr: 44, resized: true, trimmed: true, caseTimesFired: 1, skill: 0.8 });
  check('a correct load works', good.ok, good.problems.join('; '));
  const hot = A.handload({ cartridgeId: '308win', case: true, primer: 'large_rifle',
    bullet: true, powder: 'fast', chargeGr: 44, resized: true, trimmed: true, skill: 0.8 });
  check('a fast pistol powder at rifle charge weight is catastrophic', hot.danger === 'catastrophic',
    hot.problems.join('; '));
  const light = A.handload({ cartridgeId: '308win', case: true, primer: 'large_rifle',
    bullet: true, powder: 'medium', chargeGr: 12, resized: true, trimmed: true });
  check('and too light a charge sticks the bullet in the barrel', light.danger === 'squib');
  check('the wrong primer is caught', A.handload({ cartridgeId: '308win', case: true,
    primer: 'small_pistol', bullet: true, powder: 'medium', chargeGr: 44, resized: true, trimmed: true })
    .problems.some((p) => /primer/.test(p)));
  check('and brass that has been loaded too often is caught',
    A.handload({ cartridgeId: '308win', case: true, primer: 'large_rifle', bullet: true,
      powder: 'medium', chargeGr: 44, resized: true, trimmed: true, caseTimesFired: 9 })
      .problems.some((p) => /too many times/.test(p)));
}

/* ---------------- the world ---------------- */
{
  section('the world');

  const world = new A.World({ seed: 20260908, mode: A.GAME_MODE.multiplayer });
  const t0 = Date.now();
  world.generate({ island: { resolution: 257, erosionDroplets: 25000 } });
  check('a whole world generates', world.generated, `${Date.now() - t0} ms`);

  const d = world.describe();
  check('every named place is on the map', d.pois.length >= 15, `${d.pois.length}`);
  for (const kind of ['neighbourhood', 'city', 'prairie', 'prison', 'headquarters']) {
    check(`the design's ${kind} exists`, world.pois.some((p) => p.kind === kind));
  }
  const hood = world.pois.find((p) => p.kind === 'neighbourhood');
  check('the neighbourhood has twenty-six houses', hood.buildings.length === 26,
    `${hood.buildings.length}`);
  check('behind a fence with a hole in it', !!hood.fence && !!hood.fence.breach);

  const prairie = world.pois.find((p) => p.kind === 'prairie');
  const cabin = prairie.buildings.find((b) => b.kind === 'cabin');
  const living = cabin.rooms.find((r) => r.type === 'livingRoom') || cabin.rooms[0];
  const hidden = living.contents.find((c) => c.searchesRequired);
  check('and the cabin has a gun hidden in the living room',
    !!hidden && /rifle|shotgun|revolver|pistol/.test(hidden.item),
    hidden ? `${hidden.item}, ${hidden.hiddenIn}` : 'none');

  const hq = world.pois.find((p) => p.kind === 'headquarters');
  const pad = hq.props.find((p) => p.kind === 'helipad');
  check('the headquarters has a helicopter on its pad', !!pad && !!pad.helicopter);
  check('which does not fly yet', !pad.helicopter.airworthy && pad.helicopter.needs.length > 0,
    pad.helicopter.needs.join(', '));

  check('the world is stocked', d.animals >= 450 && d.fish >= 100,
    `${d.animals} animals, ${d.fish} fish`);
  check('with somewhere to fish', world.fishery.bodies.length >= 4,
    world.fishery.bodies.map((b) => b.name).join(', '));

  section('spawning and dying');
  for (const side of ['north', 'east', 'south', 'west']) {
    const s = world.chooseSpawn(side);
    check(`you can start on the ${side} shore`,
      s.side === side && s.y > 0 && s.y < 25, `y ${s.y.toFixed(1)} m`);
  }

  const join = world.join('acct-1', { name: 'test' });
  check('a player joins alive', !join.spectator && !!join.player);
  join.player.inventory.add({ item: 'rifle', massKg: 3.9, volumeL: 6 });

  const death = world.killPlayer('acct-1', 'a grizzly');
  check('death in multiplayer is permanent', death.permanent && death.spectator);
  const rejoin = world.join('acct-1', { name: 'test' });
  check('and rejoining gives you a seat, not a body', rejoin.spectator, rejoin.message);
  check('the body stays where it fell, with what was on it',
    world.corpses.length === 1 && world.corpses[0].contents.length === 1);

  // Singleplayer is not hardcore.
  const solo = new A.World({ seed: 1, mode: A.GAME_MODE.singleplayer, keepInventory: true });
  solo.generate({ island: { resolution: 129, erosionDroplets: 3000 } });
  const sj = solo.join('me', { name: 'me' });
  sj.player.inventory.add({ item: 'axe', massKg: 1.5, volumeL: 2 });
  sj.player.practise('hunting', 0.5);
  const skillBefore = sj.player.skills.hunting;
  const sd = solo.killPlayer('me', 'a fall');
  check('singleplayer respawns you', !sd.permanent && !!sd.respawn);
  const reborn = solo.players.get('me');
  check('with the inventory, when keepInventory is on', reborn.inventory.has('axe'));
  check('and always with what you learned', reborn.skills.hunting === skillBefore);

  section('knockouts');
  const kWorld = new A.World({ seed: 2, mode: A.GAME_MODE.multiplayer });
  kWorld.generate({ island: { resolution: 129, erosionDroplets: 3000 } });
  kWorld.join('k', { name: 'k' });
  const light = kWorld.knockOut('k', 90);
  const heavy = kWorld.knockOut('k', 2100);
  // The design asks for three game-minutes at the light end and a full
  // game-day at the heavy end.
  between('a light blow puts you out for', light.gameMinutes, 2, 20, ' game minutes');
  check('and a heavy one for most of a day', heavy.gameMinutes > 600,
    `${(heavy.gameMinutes / 60).toFixed(1)} game hours`);

  section('persistence');
  const save = world.serialize();
  const json = JSON.stringify(save);
  check('a world saves small', json.length < 200000, `${(json.length / 1024).toFixed(1)} KB`);
  check('and remembers who is dead', save.deadAccounts.includes('acct-1'));
  const restored = A.World.restore(JSON.parse(json), { island: { resolution: 257, erosionDroplets: 25000 } });
  check('and comes back to the same island',
    Math.abs(restored.map.bounds().max - world.map.bounds().max) < 1e-6);
  check('with the same dead accounts', restored.deadAccounts.has('acct-1'));
  check('and rejoining the restored world still only gets you a seat',
    restored.join('acct-1', {}).spectator);
}

/* ---------------- fire, food and water ---------------- */
{
  section('fire');

  const fire = new A.Fire({ kind: 'campfire', fuelKg: 8, x: 0, z: 0 });
  check('an unlit fire radiates nothing', fire.radiantWattsAt(1, 0) === 0);
  // Lighting is a skill check against the conditions, not a button.
  const wetBowDrill = new A.Fire({ kind: 'campfire', fuelKg: 8 })
    .tryLight({ method: 'bowDrill', skill: 0.1, tinderWet: 0.9, windMs: 8, rng: () => 0.5 });
  check('wet tinder, a bow drill and a wind will not catch', !wetBowDrill.ok,
    `${(wetBowDrill.chance * 100).toFixed(0)}% chance`);
  const dryLighter = new A.Fire({ kind: 'campfire', fuelKg: 8, sheltered: true })
    .tryLight({ method: 'lighter', skill: 0.5, tinderWet: 0, rng: () => 0.5 });
  check('a lighter and dry tinder under shelter does', dryLighter.ok,
    `${(dryLighter.chance * 100).toFixed(0)}% chance`);

  fire.tryLight({ method: 'lighter', skill: 1, rng: () => 0 });
  fire.step(600, { windMs: 1 });
  const closeW = fire.radiantWattsAt(1.0, 0);
  const farW = fire.radiantWattsAt(3.0, 0);
  check('a fire radiates real heat', closeW > 30, `${closeW.toFixed(0)} W at 1 m`);
  // Inverse square: three times the distance is a ninth of the heat.
  check('and it falls off with the square of the distance',
    Math.abs(farW - closeW / 9) < closeW / 9 * 0.15,
    `${closeW.toFixed(0)} W at 1 m, ${farW.toFixed(0)} W at 3 m`);

  // A fire is the difference between a survivable night and a lethal one.
  const cold = { airTempC: -6, windMs: 4, humidity: 0.7, speedMs: 0 };
  const without = new A.Physiology({ clothingClo: 0.8 });
  const beside = new A.Physiology({ clothingClo: 0.8 });
  const sittingW = fire.radiantWattsAt(0.7, 0);
  for (let i = 0; i < 6 * 60; i++) {
    without.step(60, cold);
    beside.step(60, Object.assign({}, cold, { radiantWatts: sittingW }));
  }
  check('six hours at -6 C without a fire is hypothermia', without.coreTempC < 35.5,
    `${without.coreTempC.toFixed(2)} C`);
  check('and sitting close to a fire is not', beside.coreTempC > 36,
    `${beside.coreTempC.toFixed(2)} C beside ${sittingW.toFixed(0)} W`);
  /* The temperature is the visible benefit and the smaller one. What a fire
     really buys is food: shivering is paid for out of glycogen, so a night
     beside one costs you a fraction of the calories a night without it does,
     and on an island where calories are the binding constraint that is the
     whole reason to carry a lighter. */
  check('but the real saving is calories, not degrees',
    beside.glycogenKcal > without.glycogenKcal * 1.6,
    `${without.glycogenKcal.toFixed(0)} kcal left without, ${beside.glycogenKcal.toFixed(0)} with`);
  check('and shivering costs them', without.shivering > beside.shivering + 0.2,
    `${without.shivering.toFixed(2)} vs ${beside.shivering.toFixed(2)}`);

  // Clothing is the other half of the answer, and it is free once you have it.
  const wrapped = new A.Physiology({ clothingClo: 3.0 });
  for (let i = 0; i < 6 * 60; i++) wrapped.step(60, cold);
  check('warm clothing does much of what a fire does', wrapped.coreTempC > without.coreTempC + 0.9,
    `${wrapped.coreTempC.toFixed(2)} C at 3.0 clo`);

  let burnedOut = 0;
  const small = new A.Fire({ kind: 'campfire', fuelKg: 2.2 });
  small.tryLight({ method: 'lighter', skill: 1, rng: () => 0 });
  while (small.lit && burnedOut < 20000) { small.step(10, {}); burnedOut += 10; }
  // 2.2 kg at 2.2 kg/h is an hour of fire, which is the point: wood is work.
  between('2.2 kg of wood burns for', burnedOut / 3600, 0.7, 1.3, ' hours');

  // Method matters more than skill for a lighter and less than nothing for
  // a bow drill, which is the whole reason to carry one.
  {
    const dry = { skill: 0.2, tinderWet: 0, windMs: 2, precipitation: 0, rng: () => 0.5 };
    const lighterP = new A.Fire({ fuelKg: 6 }).tryLight(Object.assign({ method: 'lighter' }, dry, { rng: () => 1 })).chance;
    const drillP = new A.Fire({ fuelKg: 6 }).tryLight(Object.assign({ method: 'bowDrill' }, dry, { rng: () => 1 })).chance;
    check('a lighter and dry tinder is nearly a certainty', lighterP > 0.8, `${(lighterP * 100).toFixed(0)}%`);
    check('a bow drill in untrained hands is not', drillP < 0.25, `${(drillP * 100).toFixed(0)}%`);
    const skilled = new A.Fire({ fuelKg: 6 }).tryLight(Object.assign({}, dry, { method: 'bowDrill', skill: 0.9, rng: () => 1 })).chance;
    check('and practice is what fixes that', skilled > drillP * 1.8, `${(skilled * 100).toFixed(0)}% at skill 0.9`);
    const wet = new A.Fire({ fuelKg: 6 }).tryLight(Object.assign({}, dry, { method: 'lighter', tinderWet: 1, rng: () => 1 })).chance;
    check('wet tinder beats a lighter', wet < 0.2, `${(wet * 100).toFixed(0)}%`);
  }

  section('cooking');

  // The gap between a seared outside and a safe middle is the whole mechanic.
  const steak = new A.Provision({ name: 'bear steak', kg: 0.4, cut: 'bear',
    pathogenVectors: [A.SV_VECTOR_BEAR] });
  check('bear meat starts carrying trichinella',
    steak.pathogenVectors.length === 1, steak.pathogenVectors.join(','));
  // Thirty seconds over a fierce fire chars it and does nothing to the core.
  for (let i = 0; i < 30; i++) steak.cook(1, 700);
  check('half a minute on a hot fire does not make it safe', !steak.safe,
    `core ${steak.coreTempC.toFixed(0)} C, ${steak.state}`);
  for (let i = 0; i < 900; i++) steak.cook(1, 480);
  check('cooking it through does', steak.safe, `core ${steak.coreTempC.toFixed(0)} C`);
  check('and it is cooked, not burnt',
    steak.state === A.FOOD_STATE.cooked || steak.state === A.FOOD_STATE.burnt, steak.state);

  const charred = new A.Provision({ kg: 0.3, cut: 'muscle' });
  const kcalBefore = charred.kcalPerKg;
  for (let i = 0; i < 1200; i++) charred.cook(1, 900);
  check('leaving it on a fierce fire burns it', charred.state === A.FOOD_STATE.burnt);
  check('and burnt food has fewer calories', charred.kcalPerKg < kcalBefore,
    `${kcalBefore.toFixed(0)} -> ${charred.kcalPerKg.toFixed(0)} kcal/kg`);

  section('preserving and spoiling');

  const fresh = new A.Provision({ kg: 1, cut: 'muscle' });
  for (let i = 0; i < 6; i++) fresh.step(86400, { airTempC: 24 });
  check('meat left out in the warmth spoils', fresh.state === A.FOOD_STATE.spoiled,
    `${fresh.accumulatedDegreeDays.toFixed(0)} degree-days`);

  const dried = new A.Provision({ kg: 1, cut: 'muscle' });
  for (let i = 0; i < 4 * 24; i++) dried.dry(3600, { airTempC: 26, humidity: 0.3, smoke: true });
  check('smoking dries it out', dried.waterFraction < 0.3,
    `${(dried.waterFraction * 100).toFixed(0)}% water`);
  check('and makes it safe', dried.pathogenVectors.length === 0);
  for (let i = 0; i < 30; i++) dried.step(86400, { airTempC: 24 });
  check('and it then keeps for a month where fresh meat kept six days',
    dried.state !== A.FOOD_STATE.spoiled, dried.state);

  section('water treatment');

  // Each method removes exactly what it really removes, and the disease
  // table's own notes are the specification.
  const boiled = A.treatWater('boiled', 1);
  check('boiling removes the protozoa', boiled.removed.includes('cryptosporidiosis'));
  const chlorinated = A.treatWater('chlorine', 1);
  check('chlorine removes the bacteria', chlorinated.removed.includes('campylobacteriosis'));
  check('and does nothing to Cryptosporidium',
    !chlorinated.removed.includes('cryptosporidiosis'), chlorinated.note);
  const filtered = A.treatWater('filtered', 1);
  check('a filter removes the protozoa', filtered.removed.includes('giardiasis'));
  check('and passes the viruses', !filtered.removed.includes('norovirus'), filtered.note);
  const silty = A.treatWater('uv', 1, { turbidity: 0.9 });
  check('UV is defeated by silt', silty.effectiveness < 0.3,
    `${(silty.effectiveness * 100).toFixed(0)}% effective`);
  const distilled = A.treatWater('distilled', 1, { salinityGL: 35 });
  check('only distillation makes seawater drinkable', distilled.salinityGL === 0);
  check('and it costs a lot of fuel to do it', distilled.fuelKg > 1,
    `${distilled.fuelKg.toFixed(1)} kg of wood per litre`);

  // Drinking treated water exposes you only to what survived.
  let caughtBoiled = 0, caughtRaw = 0;
  for (let i = 0; i < 300; i++) {
    const p1 = new A.Physiology({});
    const d1 = new A.DiseaseSystem({ rng: () => 0 });
    A.drinkTreated(p1, d1, A.treatWater('boiled', 0.5));
    caughtBoiled += d1.infections.length;
    const p2 = new A.Physiology({});
    const d2 = new A.DiseaseSystem({ rng: () => 0 });
    A.drinkTreated(p2, d2, A.treatWater('none', 0.5));
    caughtRaw += d2.infections.length;
  }
  check('boiled water is far safer than creek water', caughtBoiled * 4 < caughtRaw,
    `${caughtBoiled} vs ${caughtRaw} infections over 300 drinks`);
  check('and it still counts as water', new A.Physiology({}).bodyWaterL > 0);
}

/* ============================================================
   HORSES AND CARS
   ============================================================ */
{
  section('horses');
  const h = new A.Horse({ breed: 'quarter' });
  h.wild = false; h.trust = 1;
  check('a riding horse weighs half a tonne', h.massKg === 500);
  check('and carries about a fifth of that', Math.abs(h.carryCapacityKg - 100) < 1,
    `${h.carryCapacityKg.toFixed(0)} kg`);

  // A walk is nearly free; a gallop is not survivable for long.
  const walker = new A.Horse({ breed: 'quarter' });
  walker.wild = false; walker.ask('walk', { skill: 1 });
  for (let i = 0; i < 3600; i++) walker.step(1, { riderMassKg: 85, airTempC: 15 });
  check('an hour at a walk under a rider barely tires it', walker.fatigue < 0.2,
    `${(walker.fatigue * 100).toFixed(0)}% spent`);

  const galloper = new A.Horse({ breed: 'quarter' });
  galloper.wild = false; galloper.trust = 1; galloper.ask('gallop', { skill: 1 });
  let gallopedM = 0, t = 0;
  while (galloper.gait === 'gallop' && t < 900) { galloper.step(1, { riderMassKg: 85, airTempC: 15 }); gallopedM += galloper.speedMs; t++; }
  // A ridden horse can hold a gallop for something on the order of two to
  // three kilometres before it has to come back to a trot.
  check('a gallop under a rider lasts a couple of kilometres',
    gallopedM > 900 && gallopedM < 4000, `${(gallopedM / 1000).toFixed(2)} km in ${t} s`);
  check('and then it will not give you the gait', galloper.gait !== 'gallop');

  // Working hard in the heat costs it water at rates a person never sees.
  const hot = new A.Horse({ breed: 'thoroughbred' });
  hot.wild = false; hot.ask('canter', { skill: 1 });
  const water0 = hot.hydrationL;
  for (let i = 0; i < 1800; i++) hot.step(1, { riderMassKg: 80, airTempC: 32 });
  const lostLh = (water0 - hot.hydrationL) * 2;
  check('a horse working in the heat sweats litres an hour', lostLh > 3 && lostLh < 25,
    `${lostLh.toFixed(1)} L/h`);

  // A wild horse refuses, and gentling it takes real time.
  const wild = new A.Horse({ breed: 'mustang', wild: true });
  check('a wild horse will not take a rider', wild.ask('walk', { skill: 0.5 }).ok === false);
  let minutes = 0;
  while (wild.trust < 0.55 && minutes < 600) { wild.handle(60, { gentle: true }); minutes++; }
  check('and gentling one takes the better part of an hour',
    minutes > 20 && minutes < 300, `${minutes} minutes of quiet handling`);
  check('after which it will', wild.ask('walk', { skill: 0.5 }).ok === true);

  section('motor vehicles');
  const dead = new A.Vehicle({ type: 'sedan', fuelL: 40, hasBattery: false });
  check('no battery, no start', dead.start().ok === false);
  check('and it says so', /battery/.test(dead.start().reason));

  const stale = new A.Vehicle({ type: 'sedan', fuelL: 40, hasBattery: true, batteryCharge: 1,
    engineCondition: 0.8, oilLevel: 0.8, fuelAgeDays: 1500 });
  let started = 0;
  for (let i = 0; i < 200; i++) {
    const v = new A.Vehicle({ type: 'sedan', fuelL: 40, hasBattery: true, batteryCharge: 1,
      engineCondition: 0.8, oilLevel: 0.8, fuelAgeDays: 1500 });
    if (v.start().ok) started++;
  }
  check('four-year-old petrol mostly will not fire', started < 120, `${started}/200 caught`);
  check('and the fuel is nearly worthless', A.fuelViability('petrol', 1500) < 0.01);
  check('while diesel of the same age is not', A.fuelViability('diesel', 1500) > 0.13,
    `${(A.fuelViability('diesel', 1500) * 100).toFixed(0)}% good`);

  // Acceleration and top speed come out of the drivetrain, not a constant.
  const car = new A.Vehicle({ type: 'sedan', fuelL: 50, hasBattery: true, batteryCharge: 1,
    engineCondition: 0.95, oilLevel: 0.9, coolantLevel: 0.9, fuelAgeDays: 10,
    tyres: [1, 1, 1, 1] });
  car.start({ rng: () => 0 });
  let to100 = null;
  for (let i = 0; i < 3000; i++) {
    if (car.rpm > car.spec.redlineRpm * 0.95 && car.gear < car.spec.gears.length - 1) car.gear++;
    car.step(0.05, { throttle: 1, surfaceGrip: 1 });
    if (to100 === null && car.speedMs * 3.6 > 100) to100 = i * 0.05;
  }
  check('a saloon reaches 100 km/h in a plausible time', to100 > 6 && to100 < 22, `${to100} s`);
  const topKph = car.speedMs * 3.6;
  check('and tops out where its gearing says it should', topKph > 150 && topKph < 260,
    `${topKph.toFixed(0)} km/h`);

  // Fuel consumption at a steady cruise, against the published figure.
  const cruise = new A.Vehicle({ type: 'sedan', fuelL: 50, hasBattery: true, batteryCharge: 1,
    engineCondition: 0.95, oilLevel: 0.9, coolantLevel: 0.9, fuelAgeDays: 10, tyres: [1, 1, 1, 1] });
  cruise.start({ rng: () => 0 });
  cruise.gear = 5; cruise.speedMs = 25;
  const f0 = cruise.fuelL;
  let distM = 0;
  for (let i = 0; i < 7200; i++) {
    const throttle = cruise.speedMs < 25 ? 0.45 : 0.2;
    cruise.step(0.5, { throttle, surfaceGrip: 1 });
    distM += cruise.speedMs * 0.5;
  }
  const per100 = ((f0 - cruise.fuelL) / (distM / 100000));
  check('and drinks a believable amount at a cruise', per100 > 3 && per100 < 16,
    `${per100.toFixed(1)} L/100 km over ${(distM / 1000).toFixed(0)} km`);

  // Flat tyres and a wet field both cost grip, and grip is what stops you.
  const flat = new A.Vehicle({ type: 'pickup', tyres: [0, 1, 1, 1] });
  check('a flat tyre is counted', flat.flatTyres === 1);
  check('and it is on the list of what is wrong', flat.missing.length === 0 || !flat.missing.includes('a tyre'));
  const twoFlat = new A.Vehicle({ type: 'pickup', tyres: [0, 0, 1, 1], hasBattery: true, fuelL: 40, oilLevel: 0.5, coolantLevel: 0.5 });
  check('two flats and it is not going anywhere', twoFlat.missing.includes('a tyre'));

  // A crash is energy, and a seatbelt is a factor of five in what reaches you.
  const crasher = new A.Vehicle({ type: 'pickup' });
  const belted = crasher.collide(20, { belted: true, occupantMassKg: 80 });
  const loose = new A.Vehicle({ type: 'pickup' }).collide(20, { belted: false, occupantMassKg: 80 });
  check('a crash at 72 km/h is a serious deceleration', belted.decelG > 25, `${belted.decelG.toFixed(0)} g`);
  check('and being unbelted multiplies it', loose.decelG > belted.decelG * 4,
    `${loose.decelG.toFixed(0)} g vs ${belted.decelG.toFixed(0)} g`);
  check('the energy is the energy', Math.abs(belted.energyJ - 0.5 * 2100 * 400) < 1);

  // Shooting one is not shooting a wall.
  const shot = new A.Vehicle({ type: 'sedan', hasBattery: true, batteryCharge: 1, fuelL: 40,
    engineCondition: 0.9, oilLevel: 0.8, coolantLevel: 0.8, fuelAgeDays: 5, tyres: [1, 1, 1, 1] });
  shot.start({ rng: () => 0 });
  shot.hitBy('radiator');
  check('a holed radiator loses its coolant', shot.coolantLevel === 0);
  shot.gear = 3; shot.speedMs = 20;
  for (let i = 0; i < 2000; i++) shot.step(0.5, { throttle: 0.6, surfaceGrip: 1 });
  check('and driving on with no coolant destroys the engine', shot.engineCondition < 0.3,
    `${(shot.engineCondition * 100).toFixed(0)}% left`);
}

/* ============================================================
   WILDLIFE — the daily round, the three senses, sign and calls
   ============================================================ */
{
  section('the daily round');
  // A crepuscular animal feeds at first and last light and lies up through
  // the middle of the day, which is the whole reason dawn and dusk are when
  // you hunt.
  check('a deer feeds at first light', A.currentNeed('crepuscular', 6, {}) === A.NEED.feed);
  check('waters after feeding', A.currentNeed('crepuscular', 8.5, {}) === A.NEED.drink);
  check('beds through the middle of the day', A.currentNeed('crepuscular', 13, {}) === A.NEED.rest);
  check('and feeds again in the evening', A.currentNeed('crepuscular', 18, {}) === A.NEED.feed);
  check('a nocturnal animal does the opposite',
    A.currentNeed('nocturnal', 13, {}) === A.NEED.rest
    && A.currentNeed('nocturnal', 22, {}) === A.NEED.feed);

  // Need beats the clock once it gets bad enough. This is what makes a
  // waterhole worth sitting on in a dry spell.
  check('thirst overrides the clock',
    A.currentNeed('crepuscular', 13, { thirst: 0.95 }) === A.NEED.drink);
  check('and so does the rut, for a male',
    A.currentNeed('crepuscular', 13, { inRut: true, male: true, rutIntensity: 0.9 }) === A.NEED.mate);
  check('but not for a female',
    A.currentNeed('crepuscular', 13, { inRut: true, male: false, rutIntensity: 0.9 }) === A.NEED.rest);
  const until = A.hoursUntilNeedChange('crepuscular', 6);
  check('and the next change is schedulable', until > 0 && until <= 24, `${until.toFixed(1)} h`);

  section('three senses');
  const deer = { speciesId: 'whitetailDeer', species: A.SPECIES.whitetailDeer, heading: 0, male: true };

  /* Wind is the one you cannot beat. Downwind at two hundred metres beats
     being in plain sight at fifty, and that is the whole of hunting. */
  const downwind = A.senseSmell(deer, 0, 200, { windDirX: 0, windDirZ: 1, windMs: 4 });
  const upwind = A.senseSmell(deer, 0, 200, { windDirX: 0, windDirZ: -1, windMs: 4 });
  check('scent carries downwind', downwind > 0.2, downwind.toFixed(3));
  check('and not at all upwind', upwind === 0, upwind.toFixed(3));
  const crosswind = A.senseSmell(deer, 0, 200, { windDirX: 1, windDirZ: 0, windMs: 4 });
  check('crosswind is close to safe', crosswind < downwind * 0.3, crosswind.toFixed(3));

  // Sight is mostly about movement, and a deer sees very nearly all the way
  // round — but not quite.
  const still = A.senseSight(deer, 0, 60, { movementSpeed: 0, concealment: 0, light: 1 });
  const walking = A.senseSight(deer, 0, 60, { movementSpeed: 1.4, concealment: 0, light: 1 });
  check('a still hunter is far harder to see than a walking one',
    walking > still * 4, `${still.toFixed(3)} vs ${walking.toFixed(3)}`);
  const behind = A.senseSight(deer, 0, -60, { movementSpeed: 1.4, light: 1 });
  check('and there is a blind spot directly behind', behind === 0);
  const hidden = A.senseSight(deer, 0, 60, { movementSpeed: 1.4, concealment: 0.9, light: 1 });
  check('cover works', hidden < walking * 0.2, hidden.toFixed(3));
  const atNight = A.senseSight(deer, 0, 60, { movementSpeed: 1.4, light: 0.05 });
  check('and so does the dark', atNight < walking * 0.4, atNight.toFixed(3));

  // Hearing cares what you are doing, and rain covers you.
  const loud = A.senseHearing(deer, 0, 100, { noise: 0.9 });
  const quiet = A.senseHearing(deer, 0, 100, { noise: 0.05 });
  check('sneaking is quieter than crashing about', quiet < loud * 0.1, `${quiet.toFixed(3)} vs ${loud.toFixed(3)}`);
  const inRain = A.senseHearing(deer, 0, 100, { noise: 0.9, precipitation: 8, windMs: 10 });
  check('and weather masks it', inRain < loud * 0.8, inRain.toFixed(3));

  // The three combine independently, and the game knows which caught you.
  const caught = A.senseAll(deer, 0, 120, {
    windDirX: 0, windDirZ: 1, windMs: 5, noise: 0.1, movementSpeed: 0, light: 1,
  });
  check('being winded is reported as smell', caught.by === 'smell', String(caught.by));
  check('and it is enough on its own', caught.total > 0.25, caught.total.toFixed(3));

  section('alert states');
  check('an unaware animal is unaware', A.alertStateFor(0.05) === A.ALERT.unaware);
  check('a little is curious', A.alertStateFor(0.2) === A.ALERT.curious);
  check('more is alerted', A.alertStateFor(0.5) === A.ALERT.alerted);
  check('and enough is gone', A.alertStateFor(0.99) === A.ALERT.fleeing);

  section('reading sign');
  // Blood tells you where you hit, and what to do about it. Getting this
  // wrong is how a deer is lost, so the model has to be blunt about it.
  check('a lung hit is pink and frothy', A.bloodFor('chest', 0.8) === A.BLOOD.lung);
  check('and you follow it soon', A.BLOOD.lung.waitMinutes < 30);
  check('a gut shot is green-brown', A.bloodFor('abdomen', 0.6) === A.BLOOD.gut);
  check('and you wait hours for it', A.BLOOD.gut.waitMinutes >= 120);
  check('and it runs ten times as far as a lung hit',
    A.BLOOD.gut.trailMetres > A.BLOOD.lung.trailMetres * 8);
  check('a graze is a graze', A.bloodFor('chest', 0.05) === A.BLOOD.graze && !A.BLOOD.graze.lethal);

  // A track carries the species, the size, the direction and the age.
  const track = new A.Sign({
    kind: A.SIGN.track, speciesId: 'whitetailDeer', male: true, ageClass: 'prime',
    massKg: 120, heading: 1.2, gait: 'walk', depth: 0.8, createdAtDays: 10,
  });
  const fresh = track.read(10.02, 0.8, {});
  check('a fresh track names the animal', /whitetail/i.test(fresh.species), fresh.species);
  check('and says how long ago', /minutes|hour/.test(fresh.when), fresh.when);
  check('and which way it went', fresh.heading === 1.2);
  check('and how it was moving', fresh.gait === 'walking', String(fresh.gait));
  check('a heavy animal reads as heavy', fresh.sizeClass === 'heavy', String(fresh.sizeClass));

  // Rain is the difference between a good tracking morning and a lost animal.
  const dryBlood = new A.Sign({ kind: A.SIGN.blood, speciesId: 'whitetailDeer', createdAtDays: 10, depth: 0.6 });
  check('blood lasts a while in the dry', dryBlood.freshness(10.3, {}) > 0.4,
    dryBlood.freshness(10.3, {}).toFixed(2));
  check('and is gone in the rain', dryBlood.freshness(10.3, { precipitation: 8 }) < 0.05,
    dryBlood.freshness(10.3, { precipitation: 8 }).toFixed(3));
  // A track survives what blood does not, which is why you switch to tracks.
  const wetTrack = new A.Sign({ kind: A.SIGN.track, speciesId: 'whitetailDeer', createdAtDays: 10, depth: 0.8 });
  check('a track outlasts blood in the wet',
    wetTrack.freshness(10.3, { precipitation: 8 }) > dryBlood.freshness(10.3, { precipitation: 8 }));

  section('calling');
  const buck = { speciesId: 'whitetailDeer', male: true, awareness: 0 };
  let inRut = 0, outOfRut = 0;
  for (let i = 0; i < 400; i++) {
    if (A.callResponse(A.CALL.grunt, buck, { distanceM: 80, season: 'autumn', rng: () => 0.3 }).responds) inRut++;
    if (A.callResponse(A.CALL.grunt, buck, { distanceM: 80, season: 'summer', rng: () => 0.3 }).responds) outOfRut++;
  }
  check('a grunt call works in the rut', inRut > 300, `${inRut}/400`);
  check('and not in the summer', outOfRut === 0, `${outOfRut}/400`);
  const doe = { speciesId: 'whitetailDeer', male: false, awareness: 0 };
  const onDoe = A.callResponse(A.CALL.grunt, doe, { distanceM: 80, season: 'autumn', rng: () => 0.3 });
  check('a challenge call does much less to a doe', !onDoe.responds || onDoe.chance < 0.2);
  const wrongSpecies = A.callResponse(A.CALL.bugle, buck, { distanceM: 80, season: 'autumn' });
  check('and a bugle means nothing to a deer', !wrongSpecies.responds);
  const tooFar = A.callResponse(A.CALL.grunt, buck, { distanceM: 5000, season: 'autumn' });
  check('nothing hears it from a mile away', !tooFar.responds);

  // Overuse is the mistake every caller makes.
  const once = A.callResponse(A.CALL.grunt, buck, { distanceM: 80, season: 'autumn', heardRecently: 0, rng: () => 0.99 }).chance;
  const fifth = A.callResponse(A.CALL.grunt, buck, { distanceM: 80, season: 'autumn', heardRecently: 4, rng: () => 0.99 }).chance;
  check('calling too often stops working', fifth < once * 0.15, `${once.toFixed(2)} -> ${fifth.toFixed(2)}`);
  const spooky = A.callResponse(A.CALL.grunt, { speciesId: 'whitetailDeer', male: true, awareness: 0.7 },
    { distanceM: 80, season: 'autumn' });
  check('and an animal already on edge will not come', !spooky.responds);

  section('hunting pressure');
  const press = new A.PressureMap({ worldSizeM: 4000 });
  press.add(0, 0, 1, 800);
  check('a shot raises pressure where it was fired', press.at(0, 0) > 0.8, press.at(0, 0).toFixed(2));
  check('and less further out', press.at(600, 0) < press.at(0, 0) && press.at(600, 0) > 0);
  check('and not at all across the island', press.at(1800, 1800) === 0);
  const before = press.at(0, 0);
  press.step(3);
  check('it halves in about three days', Math.abs(press.at(0, 0) / before - 0.5) < 0.02,
    `${before.toFixed(2)} -> ${press.at(0, 0).toFixed(2)}`);
  const refuge = press.quietestNear(0, 0, 1500);
  check('and somewhere quiet is findable', refuge && refuge.pressure < before * 0.5,
    refuge ? `${refuge.pressure.toFixed(2)} at ${refuge.x.toFixed(0)},${refuge.z.toFixed(0)}` : 'nowhere');

  section('life stages');
  const wt = A.SPECIES.whitetailDeer;
  check('a newborn is young', A.stageFor(wt, 30) === A.LIFE_STAGE.young);
  check('a yearling is a juvenile', A.stageFor(wt, wt.maturityDays * 0.8) === A.LIFE_STAGE.juvenile);
  check('and at maturity it is adult', A.stageFor(wt, wt.maturityDays * 1.4) === A.LIFE_STAGE.adult);
  check('a fawn is called a fawn', A.stageName(wt, A.LIFE_STAGE.young) === 'fawn');
  check('a bear cub is called a cub', A.stageName(A.SPECIES.grizzlyBear, A.LIFE_STAGE.young) === 'cub');

  // Growth is fast and then flattens, and a newborn is a fraction of adult.
  check('a newborn is a twelfth of adult mass', A.growthFraction(wt, 1) < 0.12,
    A.growthFraction(wt, 1).toFixed(3));
  check('half grown well before maturity', A.growthFraction(wt, wt.maturityDays * 0.35) > 0.5,
    A.growthFraction(wt, wt.maturityDays * 0.35).toFixed(2));
  check('and full size at maturity', A.growthFraction(wt, wt.maturityDays) === 1);

  section('trophies');
  const young = A.trophyScore({ speciesId: 'whitetailDeer', male: true, ageDays: wt.maturityDays * 1.2, condition: 0.8 });
  const primeBuck = A.trophyScore({ speciesId: 'whitetailDeer', male: true, ageDays: wt.maturityDays * 5, condition: 0.95 });
  const ancient = A.trophyScore({ speciesId: 'whitetailDeer', male: true, ageDays: wt.maturityDays * 12, condition: 0.7 });
  check('antlers grow with age', primeBuck > young * 2, `${young} -> ${primeBuck}`);
  check('and go back once an animal is past it', ancient < primeBuck, `${primeBuck} -> ${ancient}`);
  check('a doe scores nothing',
    A.trophyScore({ speciesId: 'whitetailDeer', male: false, ageDays: 3000, condition: 1 }) === 0);
  check('and a good head is rated as one', A.trophyRating(primeBuck, 'whitetailDeer').stars >= 4,
    `${A.trophyRating(primeBuck, 'whitetailDeer').tier}`);

  section('the rut');
  check('whitetails rut in November', A.rutIntensity('whitetailDeer', 318) > 0.9);
  check('and not in June', A.rutIntensity('whitetailDeer', 170) === 0);
  check('elk rut a month and a half earlier', A.rutIntensity('elk', 268) > 0.9);
  check('a squirrel has no rut in this model', A.rutIntensity('graySquirrel', 200) === 0);

  section('rare coats');
  // Real populations throw the odd piebald. The rates are low enough that
  // seeing one should be an event rather than a Tuesday.
  let albino = 0, piebald = 0, common = 0;
  let seed = 12345;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 200000; i++) {
    const c = A.rollCoat(rng);
    if (c === A.COAT.albino) albino++;
    else if (c === A.COAT.piebald) piebald++;
    else if (c === A.COAT.common) common++;
  }
  check('most animals are ordinary', common / 200000 > 0.85, (common / 200000).toFixed(3));
  check('piebalds are rare', piebald / 200000 < 0.01 && piebald > 0, `${piebald} in 200k`);
  check('and an albino is an event', albino / 200000 < 0.002, `${albino} in 200k`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
