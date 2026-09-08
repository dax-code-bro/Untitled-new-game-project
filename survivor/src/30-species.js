/* ============================================================
   SPECIES — real animals, with the numbers that make them real.

   Masses, home ranges, group sizes and activity patterns are the
   published field-biology figures. The nutrition block is USDA
   composition per 100 g of raw meat, and it is not decoration: fat
   content is what decides whether a winter of rabbit kills you, and
   protein poisoning is in the disease table because these numbers
   make it happen on their own.

   `dress` is the fraction of live mass that becomes usable meat.
   Hunters call it yield and it is much lower than people expect —
   a 90 kg deer is about 30 kg of boned-out venison, not 90.
   ============================================================ */

const DIET = {
  grazer: 'grazer',       // grass and forbs
  browser: 'browser',     // leaves, twigs, shrubs
  mast: 'mast',           // nuts, acorns, berries
  omnivore: 'omnivore',
  carnivore: 'carnivore',
  scavenger: 'scavenger',
  granivore: 'granivore',
};

const ACTIVITY = {
  diurnal: 'diurnal',
  nocturnal: 'nocturnal',
  crepuscular: 'crepuscular',   // dawn and dusk, which is most game animals
  cathemeral: 'cathemeral',     // any time
};

const SPECIES = {
  whitetailDeer: {
    id: 'whitetailDeer', name: 'Whitetail deer', class: 'ungulate',
    massKg: [45, 130], shoulderHeightM: [0.9, 1.1], lengthM: [1.5, 2.0],
    diet: DIET.browser, activity: ACTIVITY.crepuscular,
    groupSize: [1, 8], homeRangeKm2: 1.6, topSpeedMs: 13.4, sprintS: 20,
    flightDistanceM: 90, alertness: 0.85, hearingM: 250, smellM: 400, visionM: 180,
    dress: 0.42, gestationDays: 200, litter: [1, 3], maturityDays: 550,
    nutrition: { kcal: 120, proteinG: 23, fatG: 1.4, waterG: 74 },
    hides: { name: 'deer hide', areaM2: 1.4 }, antlers: true,
    dangerous: false, fleeOnWound: true,
    note: 'The staple. Lean to the point of danger if it is all you eat.',
  },
  muleDeer: {
    id: 'muleDeer', name: 'Mule deer', class: 'ungulate',
    massKg: [50, 150], shoulderHeightM: [0.9, 1.1], lengthM: [1.6, 2.1],
    diet: DIET.browser, activity: ACTIVITY.crepuscular,
    groupSize: [2, 12], homeRangeKm2: 3.2, topSpeedMs: 12.5, sprintS: 25,
    flightDistanceM: 140, alertness: 0.8, hearingM: 280, smellM: 450, visionM: 220,
    dress: 0.42, gestationDays: 204, litter: [1, 2], maturityDays: 550,
    nutrition: { kcal: 122, proteinG: 23, fatG: 1.6, waterG: 74 },
    hides: { name: 'deer hide', areaM2: 1.6 }, antlers: true,
    dangerous: false, fleeOnWound: true,
    note: 'Bounds away in that stiff-legged stot instead of running. Hard to lead.',
  },
  elk: {
    id: 'elk', name: 'Elk', class: 'ungulate',
    massKg: [225, 320], shoulderHeightM: [1.3, 1.5], lengthM: [2.1, 2.7],
    diet: DIET.grazer, activity: ACTIVITY.crepuscular,
    groupSize: [4, 30], homeRangeKm2: 12, topSpeedMs: 12.0, sprintS: 40,
    flightDistanceM: 200, alertness: 0.75, hearingM: 350, smellM: 600, visionM: 300,
    dress: 0.43, gestationDays: 245, litter: [1, 1], maturityDays: 730,
    nutrition: { kcal: 111, proteinG: 23, fatG: 1.4, waterG: 75 },
    hides: { name: 'elk hide', areaM2: 3.0 }, antlers: true,
    dangerous: false, chargesInRut: true,
    note: 'One animal is a winter of meat and a week of carrying it.',
  },
  grizzlyBear: {
    id: 'grizzlyBear', name: 'Grizzly bear', class: 'bear',
    massKg: [130, 360], shoulderHeightM: [1.0, 1.3], lengthM: [1.8, 2.4],
    diet: DIET.omnivore, activity: ACTIVITY.cathemeral,
    groupSize: [1, 1], homeRangeKm2: 400, topSpeedMs: 15.6, sprintS: 30,
    flightDistanceM: 40, alertness: 0.7, hearingM: 300, smellM: 3000, visionM: 120,
    dress: 0.38, gestationDays: 235, litter: [1, 3], maturityDays: 1800,
    // Bear fat swings enormously with the season: a bear in October is
    // carrying the winter on its back, and that fat is the most valuable
    // thing on this island if you are living on lean meat.
    nutrition: { kcal: 161, proteinG: 20, fatG: 8.3, waterG: 70, seasonalFat: true },
    hides: { name: 'grizzly hide', areaM2: 3.5 },
    dangerous: true, aggression: 0.55, chargeDistanceM: 30, bluffChargeChance: 0.55,
    trichinella: true,
    note: 'Faster than you over any distance. The fat is worth the risk and the risk is real.',
  },
  blackBear: {
    id: 'blackBear', name: 'American black bear', class: 'bear',
    massKg: [55, 250], shoulderHeightM: [0.7, 1.0], lengthM: [1.4, 2.0],
    diet: DIET.omnivore, activity: ACTIVITY.crepuscular,
    groupSize: [1, 1], homeRangeKm2: 40, topSpeedMs: 13.9, sprintS: 25,
    flightDistanceM: 70, alertness: 0.7, hearingM: 280, smellM: 2500, visionM: 110,
    dress: 0.38, gestationDays: 220, litter: [1, 3], maturityDays: 1300,
    nutrition: { kcal: 155, proteinG: 20, fatG: 8.3, waterG: 71, seasonalFat: true },
    hides: { name: 'black bear hide', areaM2: 2.4 },
    dangerous: true, aggression: 0.25, chargeDistanceM: 20, bluffChargeChance: 0.75,
    trichinella: true,
    note: 'Usually leaves if you make yourself known. Usually.',
  },
  grayWolf: {
    id: 'grayWolf', name: 'Gray wolf', class: 'canid',
    massKg: [30, 55], shoulderHeightM: [0.66, 0.81], lengthM: [1.3, 1.6],
    diet: DIET.carnivore, activity: ACTIVITY.crepuscular,
    groupSize: [3, 9], homeRangeKm2: 250, topSpeedMs: 16.7, sprintS: 60,
    flightDistanceM: 150, alertness: 0.9, hearingM: 1600, smellM: 2400, visionM: 250,
    dress: 0.35, gestationDays: 63, litter: [4, 6], maturityDays: 700,
    nutrition: { kcal: 130, proteinG: 22, fatG: 4.0, waterG: 72 },
    hides: { name: 'wolf pelt', areaM2: 1.2 },
    dangerous: true, aggression: 0.4, packHunter: true, rabiesVector: true,
    // A pack coordinates. They will test you, split, and take the angle you
    // are not watching.
    note: 'They hunt as a unit and they are better at it than you are.',
  },
  coyote: {
    id: 'coyote', name: 'Coyote', class: 'canid',
    massKg: [8, 20], shoulderHeightM: [0.55, 0.66], lengthM: [1.0, 1.35],
    diet: DIET.omnivore, activity: ACTIVITY.nocturnal,
    groupSize: [1, 4], homeRangeKm2: 15, topSpeedMs: 17.9, sprintS: 30,
    flightDistanceM: 200, alertness: 0.92, hearingM: 1200, smellM: 1800, visionM: 220,
    dress: 0.33, gestationDays: 63, litter: [4, 7], maturityDays: 340,
    nutrition: { kcal: 128, proteinG: 22, fatG: 3.8, waterG: 73 },
    hides: { name: 'coyote pelt', areaM2: 0.8 },
    dangerous: true, aggression: 0.15, rabiesVector: true, scavenges: true,
    note: 'Will find your kill before you get back to it.',
  },
  redFox: {
    id: 'redFox', name: 'Red fox', class: 'canid',
    massKg: [3.5, 8], shoulderHeightM: [0.35, 0.5], lengthM: [0.6, 0.9],
    diet: DIET.omnivore, activity: ACTIVITY.nocturnal,
    groupSize: [1, 2], homeRangeKm2: 5, topSpeedMs: 13.4, sprintS: 20,
    flightDistanceM: 120, alertness: 0.95, hearingM: 900, smellM: 1200, visionM: 180,
    dress: 0.30, gestationDays: 52, litter: [4, 6], maturityDays: 300,
    nutrition: { kcal: 125, proteinG: 21, fatG: 4.2, waterG: 73 },
    hides: { name: 'fox pelt', areaM2: 0.5 },
    dangerous: false, rabiesVector: true, scavenges: true,
    note: 'Worth more as a pelt than as a meal.',
  },
  cougar: {
    id: 'cougar', name: 'Cougar', class: 'felid',
    massKg: [40, 100], shoulderHeightM: [0.6, 0.9], lengthM: [1.5, 2.4],
    diet: DIET.carnivore, activity: ACTIVITY.nocturnal,
    groupSize: [1, 1], homeRangeKm2: 300, topSpeedMs: 22.2, sprintS: 12,
    flightDistanceM: 60, alertness: 0.95, hearingM: 700, smellM: 800, visionM: 400,
    dress: 0.34, gestationDays: 92, litter: [2, 3], maturityDays: 730,
    nutrition: { kcal: 126, proteinG: 22, fatG: 3.5, waterG: 73 },
    hides: { name: 'cougar hide', areaM2: 1.8 },
    // An ambush predator does not give you a flight distance. You find out
    // it was there when it is already moving.
    dangerous: true, aggression: 0.6, ambush: true, stalkDistanceM: 40,
    note: 'You will not see it first. That is the entire animal.',
  },
  bobcat: {
    id: 'bobcat', name: 'Bobcat', class: 'felid',
    massKg: [6, 16], shoulderHeightM: [0.35, 0.5], lengthM: [0.7, 1.1],
    diet: DIET.carnivore, activity: ACTIVITY.crepuscular,
    groupSize: [1, 1], homeRangeKm2: 20, topSpeedMs: 13.4, sprintS: 15,
    flightDistanceM: 90, alertness: 0.93, hearingM: 600, smellM: 500, visionM: 300,
    dress: 0.32, gestationDays: 63, litter: [2, 4], maturityDays: 365,
    nutrition: { kcal: 124, proteinG: 22, fatG: 3.2, waterG: 74 },
    hides: { name: 'bobcat pelt', areaM2: 0.7 },
    dangerous: false, aggression: 0.1, ambush: true,
    note: 'Takes the rabbits you were counting on.',
  },
  wildBoar: {
    id: 'wildBoar', name: 'Wild boar', class: 'suid',
    massKg: [50, 140], shoulderHeightM: [0.75, 1.0], lengthM: [1.3, 1.8],
    diet: DIET.omnivore, activity: ACTIVITY.nocturnal,
    groupSize: [3, 15], homeRangeKm2: 8, topSpeedMs: 11.1, sprintS: 25,
    flightDistanceM: 60, alertness: 0.7, hearingM: 400, smellM: 1500, visionM: 90,
    dress: 0.52, gestationDays: 115, litter: [4, 8], maturityDays: 300,
    nutrition: { kcal: 212, proteinG: 20, fatG: 14, waterG: 66 },
    hides: { name: 'boar hide', areaM2: 1.5 }, tusks: true,
    dangerous: true, aggression: 0.45, chargeDistanceM: 15, trichinella: true,
    note: 'Fat, which matters. Also bad tempered and low to the ground, which matters more.',
  },
  cottontailRabbit: {
    id: 'cottontailRabbit', name: 'Eastern cottontail', class: 'lagomorph',
    massKg: [0.8, 1.8], shoulderHeightM: [0.15, 0.2], lengthM: [0.36, 0.48],
    diet: DIET.grazer, activity: ACTIVITY.crepuscular,
    groupSize: [1, 1], homeRangeKm2: 0.05, topSpeedMs: 12.1, sprintS: 8,
    flightDistanceM: 12, alertness: 0.9, hearingM: 300, smellM: 200, visionM: 250,
    dress: 0.55, gestationDays: 28, litter: [3, 8], maturityDays: 90,
    // Almost no fat at all. This is the animal behind protein poisoning, and
    // an island winter spent on rabbit is a way to starve with a full belly.
    nutrition: { kcal: 114, proteinG: 21.8, fatG: 2.3, waterG: 75 },
    hides: { name: 'rabbit skin', areaM2: 0.12 },
    dangerous: false, tularemia: true, freezesWhenSpotted: true,
    note: 'Easy to take and nearly fat-free. Living on them will kill you.',
  },
  graySquirrel: {
    id: 'graySquirrel', name: 'Eastern gray squirrel', class: 'rodent',
    massKg: [0.4, 0.7], shoulderHeightM: [0.08, 0.11], lengthM: [0.23, 0.3],
    diet: DIET.mast, activity: ACTIVITY.diurnal,
    groupSize: [1, 3], homeRangeKm2: 0.012, topSpeedMs: 5.6, sprintS: 10,
    flightDistanceM: 15, alertness: 0.88, hearingM: 120, smellM: 90, visionM: 140,
    dress: 0.45, gestationDays: 44, litter: [2, 4], maturityDays: 300,
    nutrition: { kcal: 120, proteinG: 21.2, fatG: 3.2, waterG: 74 },
    hides: { name: 'squirrel skin', areaM2: 0.05 },
    dangerous: false, climbs: true, hoardsFood: true,
    note: 'Small, everywhere, and a .22 does the job without waking the valley.',
  },
  raccoon: {
    id: 'raccoon', name: 'Raccoon', class: 'procyonid',
    massKg: [4, 9], shoulderHeightM: [0.23, 0.3], lengthM: [0.6, 0.95],
    diet: DIET.omnivore, activity: ACTIVITY.nocturnal,
    groupSize: [1, 4], homeRangeKm2: 2, topSpeedMs: 6.7, sprintS: 12,
    flightDistanceM: 25, alertness: 0.75, hearingM: 200, smellM: 400, visionM: 100,
    dress: 0.40, gestationDays: 65, litter: [2, 5], maturityDays: 365,
    nutrition: { kcal: 255, proteinG: 23, fatG: 17, waterG: 60 },
    hides: { name: 'raccoon pelt', areaM2: 0.6 },
    dangerous: false, rabiesVector: true, raidsStorage: true, climbs: true,
    note: 'Will open your food cache. Has hands and knows it.',
  },
  wildTurkey: {
    id: 'wildTurkey', name: 'Wild turkey', class: 'bird',
    massKg: [3.5, 11], shoulderHeightM: [0.5, 0.7], lengthM: [0.8, 1.25],
    diet: DIET.granivore, activity: ACTIVITY.diurnal,
    groupSize: [4, 20], homeRangeKm2: 4, topSpeedMs: 7.8, sprintS: 15,
    flightDistanceM: 80, alertness: 0.94, hearingM: 250, smellM: 20, visionM: 500,
    dress: 0.60, gestationDays: 28, litter: [8, 14], maturityDays: 300,
    nutrition: { kcal: 146, proteinG: 25, fatG: 4.4, waterG: 70 },
    // Eyesight is the whole defence — near-panoramic and very good at motion.
    // Smell is essentially nil, so wind does not matter and standing still does.
    dangerous: false, roostsInTrees: true, flies: true,
    note: 'Sees everything, smells nothing. Do not move.',
  },
  mallardDuck: {
    id: 'mallardDuck', name: 'Mallard', class: 'bird',
    massKg: [0.7, 1.6], shoulderHeightM: [0.2, 0.28], lengthM: [0.5, 0.65],
    diet: DIET.omnivore, activity: ACTIVITY.diurnal,
    groupSize: [2, 25], homeRangeKm2: 3, topSpeedMs: 25, sprintS: 120,
    flightDistanceM: 60, alertness: 0.85, hearingM: 200, smellM: 30, visionM: 300,
    dress: 0.55, gestationDays: 28, litter: [8, 13], maturityDays: 300,
    nutrition: { kcal: 337, proteinG: 16, fatG: 28, waterG: 55 },
    dangerous: false, flies: true, waterfowl: true,
    note: 'Fat — genuinely fat — which is worth more than the meat.',
  },
  canadaGoose: {
    id: 'canadaGoose', name: 'Canada goose', class: 'bird',
    massKg: [3, 6.5], shoulderHeightM: [0.5, 0.7], lengthM: [0.75, 1.1],
    diet: DIET.grazer, activity: ACTIVITY.diurnal,
    groupSize: [4, 40], homeRangeKm2: 6, topSpeedMs: 24, sprintS: 180,
    flightDistanceM: 120, alertness: 0.9, hearingM: 300, smellM: 30, visionM: 400,
    dress: 0.55, gestationDays: 28, litter: [4, 8], maturityDays: 700,
    nutrition: { kcal: 305, proteinG: 16, fatG: 26, waterG: 57 },
    dangerous: false, flies: true, waterfowl: true, sentries: true,
    note: 'A flock posts sentries. There is always one head up.',
  },
  cattle: {
    id: 'cattle', name: 'Cattle', class: 'ungulate',
    massKg: [450, 800], shoulderHeightM: [1.3, 1.5], lengthM: [2.2, 2.7],
    diet: DIET.grazer, activity: ACTIVITY.diurnal,
    groupSize: [8, 40], homeRangeKm2: 2, topSpeedMs: 11, sprintS: 15,
    flightDistanceM: 25, alertness: 0.4, hearingM: 200, smellM: 500, visionM: 300,
    dress: 0.45, gestationDays: 283, litter: [1, 1], maturityDays: 550,
    nutrition: { kcal: 250, proteinG: 20, fatG: 19, waterG: 60 },
    hides: { name: 'cowhide', areaM2: 4.0 },
    dangerous: true, aggression: 0.1, bullsCharge: true,
    anthrax: true, brucellosis: true, milkable: true,
    note: 'Half a tonne of standing food that cannot leave the island either.',
  },
  horse: {
    id: 'horse', name: 'Horse', class: 'ungulate',
    massKg: [380, 600], shoulderHeightM: [1.4, 1.7], lengthM: [2.2, 2.6],
    diet: DIET.grazer, activity: ACTIVITY.diurnal,
    groupSize: [2, 12], homeRangeKm2: 8, topSpeedMs: 16.5, sprintS: 90,
    flightDistanceM: 60, alertness: 0.7, hearingM: 400, smellM: 600, visionM: 350,
    dress: 0.44, gestationDays: 340, litter: [1, 1], maturityDays: 1100,
    nutrition: { kcal: 133, proteinG: 21, fatG: 4.6, waterG: 73 },
    hides: { name: 'horsehide', areaM2: 3.6 },
    dangerous: false, rideable: true, tameable: true, staminaS: 1800,
    note: 'Worth far more under you than in the pot.',
  },
  opossum: {
    id: 'opossum', name: 'Virginia opossum', class: 'marsupial',
    massKg: [2, 6], shoulderHeightM: [0.15, 0.2], lengthM: [0.6, 0.9],
    diet: DIET.scavenger, activity: ACTIVITY.nocturnal,
    groupSize: [1, 1], homeRangeKm2: 0.5, topSpeedMs: 3.3, sprintS: 8,
    flightDistanceM: 8, alertness: 0.5, hearingM: 120, smellM: 300, visionM: 60,
    dress: 0.38, gestationDays: 13, litter: [6, 9], maturityDays: 300,
    nutrition: { kcal: 221, proteinG: 22, fatG: 14, waterG: 63 },
    dangerous: false, scavenges: true, playsDead: true,
    note: 'Plays dead rather than running, which makes it the easiest meat on the island.',
  },
};

const SPECIES_LIST = Object.keys(SPECIES);

/* Draw a concrete individual from a species' published ranges. Sex dimorphism
   is real and large in the ungulates and bears, so it is applied rather than
   averaged away. */
function rollIndividual(speciesId, rng = Math.random) {
  const s = SPECIES[speciesId];
  if (!s) throw new Error(`unknown species: ${speciesId}`);
  const male = rng() < 0.5;
  const [lo, hi] = s.massKg;
  // Females sit in the lower part of the range, males the upper, with
  // overlap — which is how you can sometimes tell before you shoot.
  const t = male ? 0.35 + rng() * 0.65 : rng() * 0.6;
  const massKg = lo + (hi - lo) * t;
  const ageDays = s.maturityDays * (0.6 + rng() * 3.5);
  return {
    speciesId, male, massKg, ageDays,
    lengthM: lerpN(s.lengthM[0], s.lengthM[1], t),
    shoulderHeightM: lerpN(s.shoulderHeightM[0], s.shoulderHeightM[1], t),
    // Trophy antlers grow with age and condition, and only on males.
    antlerScore: (s.antlers && male) ? clamp01((ageDays / s.maturityDays - 1) / 4) * (0.6 + rng() * 0.4) : 0,
    condition: 0.55 + rng() * 0.45,
  };
}

/* What butchering an animal actually yields. */
function butcherYield(individual, opts = {}) {
  const s = SPECIES[individual.speciesId];
  const skill = clamp01(opts.skill != null ? opts.skill : 0.5);
  // A poor job leaves meat on the bone; a good one gets most of it.
  const efficiency = 0.62 + 0.35 * skill;
  const meatKg = individual.massKg * s.dress * efficiency * (0.85 + 0.3 * individual.condition);

  const n = s.nutrition;
  // Seasonal animals put on fat before winter and burn it after. A bear in
  // October and the same bear in April are different foods.
  const fatMul = n.seasonalFat && opts.dayOfYear != null
    ? 0.45 + 1.1 * clamp01(Math.sin(((opts.dayOfYear - 60) / 365) * 2 * Math.PI) * 0.5 + 0.5)
    : 1;
  const fatG = n.fatG * fatMul * (0.7 + 0.6 * individual.condition);
  const kcalPer100 = n.proteinG * 4 + fatG * 9;

  return {
    meatKg,
    kcal: meatKg * 10 * kcalPer100,
    proteinKg: (meatKg * n.proteinG) / 100,
    fatKg: (meatKg * fatG) / 100,
    waterL: (meatKg * n.waterG) / 1000,
    // Protein as a share of energy. Above about 45% the liver cannot keep up
    // with the nitrogen load, which is exactly the protein-poisoning trap.
    proteinEnergyFraction: (n.proteinG * 4) / kcalPer100,
    hide: s.hides ? Object.assign({}, s.hides) : null,
    boneKg: individual.massKg * 0.14,
    sinewKg: individual.massKg * 0.008,
    fatRendered: (meatKg * fatG) / 100,
    trophy: individual.antlerScore > 0 ? { antlerScore: individual.antlerScore } : null,
    // Every disease this animal can hand you while you are elbow-deep in it.
    exposures: [
      s.trichinella ? VECTOR.undercookedBear : null,
      s.tularemia ? VECTOR.skinningRabbit : null,
      (s.anthrax || s.brucellosis) ? VECTOR.butcheringCattle : null,
    ].filter(Boolean),
  };
}
