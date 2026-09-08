/* ============================================================
   DISEASE — you are told symptoms, never a diagnosis.

   The rule this file exists to enforce: the game never announces
   "you have giardiasis". It announces greasy stools, bloating and
   sulphurous belching starting nine days after you drank from that
   creek, and leaves the identification to the player. Treatment is
   only effective if it matches the actual pathogen, so guessing
   costs you the drug.

   Every entry is a real disease with its real vector, incubation
   window, symptom set and treatment. They are chosen to sit on top
   of things the player will actually do: drink from a stream, skin
   a rabbit, eat a bear, get bitten by a coyote, sleep in a derelict
   house full of mouse droppings.
   ============================================================ */

/* Observable signs. The player sees these strings and nothing else —
   which is why they are written the way a person would notice them
   rather than the way a chart would record them. */
const SYMPTOM = {
  fever:            { id: 'fever', text: 'burning up, skin hot to the touch' },
  chills:           { id: 'chills', text: 'shaking chills that come and go' },
  nightSweats:      { id: 'nightSweats', text: 'waking soaked through' },
  headache:         { id: 'headache', text: 'a headache behind the eyes' },
  fatigue:          { id: 'fatigue', text: 'bone tired past what the work explains' },
  myalgia:          { id: 'myalgia', text: 'deep aching in the muscles' },
  calfPain:         { id: 'calfPain', text: 'the calves hurt to touch' },
  jointPain:        { id: 'jointPain', text: 'joints stiff and sore' },
  wateryDiarrhea:   { id: 'wateryDiarrhea', text: 'watery diarrhoea' },
  greasyStool:      { id: 'greasyStool', text: 'pale greasy stools that float' },
  bloodyDiarrhea:   { id: 'bloodyDiarrhea', text: 'blood in the stool' },
  bloating:         { id: 'bloating', text: 'bloated, gassy, foul sulphurous belching' },
  cramps:           { id: 'cramps', text: 'gripping abdominal cramps' },
  vomiting:         { id: 'vomiting', text: 'vomiting, cannot keep anything down' },
  nausea:           { id: 'nausea', text: 'queasy' },
  weightLoss:       { id: 'weightLoss', text: 'losing weight fast' },
  periorbitalEdema: { id: 'periorbitalEdema', text: 'the face is puffy, swollen around both eyes' },
  redEyes:          { id: 'redEyes', text: 'eyes bright red, but not weeping or gritty' },
  jaundice:         { id: 'jaundice', text: 'skin and whites of the eyes gone yellow' },
  bullseyeRash:     { id: 'bullseyeRash', text: 'an expanding ring-shaped rash with a pale centre' },
  blackEschar:      { id: 'blackEschar', text: 'a painless sore with a black crust' },
  ulcerAndNode:     { id: 'ulcerAndNode', text: 'an ulcer where the skin was cut, and a hard swollen gland above it' },
  swollenNodes:     { id: 'swollenNodes', text: 'swollen tender glands' },
  woundRedStreak:   { id: 'woundRedStreak', text: 'red streaks running up from the wound' },
  woundHot:         { id: 'woundHot', text: 'the wound is hot, tight and weeping' },
  trismus:          { id: 'trismus', text: 'jaw locking, hard to open the mouth' },
  spasms:           { id: 'spasms', text: 'whole-body muscle spasms triggered by noise and light' },
  cough:            { id: 'cough', text: 'a dry hacking cough' },
  productiveCough:  { id: 'productiveCough', text: 'coughing up thick coloured phlegm' },
  dyspnea:          { id: 'dyspnea', text: 'short of breath, cannot fill the lungs' },
  chestPain:        { id: 'chestPain', text: 'sharp chest pain when breathing in' },
  confusion:        { id: 'confusion', text: 'thoughts will not line up' },
  paresthesia:      { id: 'paresthesia', text: 'tingling and crawling at an old bite' },
  hydrophobia:      { id: 'hydrophobia', text: 'throat spasms at the sight of water' },
  agitation:        { id: 'agitation', text: 'wild, cannot stay still, terrified of nothing' },
  hypersalivation:  { id: 'hypersalivation', text: 'drooling, cannot swallow' },
  diplopia:         { id: 'diplopia', text: 'seeing double' },
  ptosis:           { id: 'ptosis', text: 'eyelids drooping' },
  dysphagia:        { id: 'dysphagia', text: 'cannot swallow properly' },
  descendingWeak:   { id: 'descendingWeak', text: 'weakness spreading downward from the face' },
  numbFeet:         { id: 'numbFeet', text: 'feet numb, blotchy white and red' },
  footPain:         { id: 'footPain', text: 'feet burning and swollen, agony to stand' },
  lowBP:            { id: 'lowBP', text: 'grey, clammy, pulse thin and fast' },
  tachycardia:      { id: 'tachycardia', text: 'heart racing at rest' },
};

/* Interventions. `crafted` marks the ones a player can make on the island
   without finding a pharmacy — the rest have to be looted, which is what
   makes the hospital and the headquarters worth the trip. */
const TREATMENT = {
  metronidazole:  { id: 'metronidazole', name: 'Metronidazole', crafted: false },
  tinidazole:     { id: 'tinidazole', name: 'Tinidazole', crafted: false },
  nitazoxanide:   { id: 'nitazoxanide', name: 'Nitazoxanide', crafted: false },
  azithromycin:   { id: 'azithromycin', name: 'Azithromycin', crafted: false },
  ciprofloxacin:  { id: 'ciprofloxacin', name: 'Ciprofloxacin', crafted: false },
  doxycycline:    { id: 'doxycycline', name: 'Doxycycline', crafted: false },
  amoxicillin:    { id: 'amoxicillin', name: 'Amoxicillin', crafted: false },
  cephalexin:     { id: 'cephalexin', name: 'Cephalexin', crafted: false },
  gentamicin:     { id: 'gentamicin', name: 'Gentamicin', crafted: false },
  albendazole:    { id: 'albendazole', name: 'Albendazole', crafted: false },
  rifampin:       { id: 'rifampin', name: 'Rifampin', crafted: false },
  penicillin:     { id: 'penicillin', name: 'Penicillin', crafted: false },
  antitoxinTet:   { id: 'antitoxinTet', name: 'Tetanus antitoxin', crafted: false },
  antitoxinBot:   { id: 'antitoxinBot', name: 'Botulinum antitoxin', crafted: false },
  rabiesPEP:      { id: 'rabiesPEP', name: 'Rabies vaccine + immunoglobulin', crafted: false },
  oralRehydration:{ id: 'oralRehydration', name: 'Oral rehydration salts', crafted: true },
  debridement:    { id: 'debridement', name: 'Debride and irrigate the wound', crafted: true },
  rewarmDry:      { id: 'rewarmDry', name: 'Dry the feet, rewarm slowly, elevate', crafted: true },
  eatFat:         { id: 'eatFat', name: 'Eat fat or carbohydrate', crafted: true },
  rest:           { id: 'rest', name: 'Rest and fluids', crafted: true },
};

/* How you catch things. Each is raised by a specific player action, so the
   chain from decision to illness is always traceable. */
const VECTOR = {
  untreatedWater: 'untreatedWater',
  undercookedMeat: 'undercookedMeat',
  undercookedBear: 'undercookedBear',
  skinningRabbit: 'skinningRabbit',
  butcheringCattle: 'butcheringCattle',
  rawMilk: 'rawMilk',
  carnivoreBite: 'carnivoreBite',
  soilContaminatedWound: 'soilContaminatedWound',
  dirtyWound: 'dirtyWound',
  rodentDroppings: 'rodentDroppings',
  freshwaterImmersion: 'freshwaterImmersion',
  tickBite: 'tickBite',
  spoiledCannedFood: 'spoiledCannedFood',
  personToPerson: 'personToPerson',
  coldWetFeet: 'coldWetFeet',
  leanMeatOnly: 'leanMeatOnly',
};

/* ------------------------------------------------------------------
   The pathogen table.

   `stages` run in order; each has a duration in days and the symptoms
   that are present during it. `lethality` is the probability of death
   per day once the final stage is reached and untreated — deliberately
   per-day rather than a single roll, so that a player who works out the
   diagnosis late still has something to play for.
   ------------------------------------------------------------------ */
const PATHOGENS = [
  {
    id: 'giardiasis', name: 'Giardiasis',
    vectors: [VECTOR.untreatedWater],
    incubationDays: [7, 14],
    stages: [
      { days: 21, symptoms: ['greasyStool', 'bloating', 'cramps', 'fatigue', 'weightLoss'] },
    ],
    // Classically no fever, which is the discriminator against bacterial
    // enteritis — the player who notices that gets it right.
    selfLimiting: true, lethality: 0.004,
    treatments: { metronidazole: 1.0, tinidazole: 1.0, nitazoxanide: 0.85, oralRehydration: 0.15 },
    note: 'Drinking surface water without boiling or filtering.',
  },
  {
    id: 'cryptosporidiosis', name: 'Cryptosporidiosis',
    vectors: [VECTOR.untreatedWater],
    incubationDays: [2, 10],
    stages: [{ days: 14, symptoms: ['wateryDiarrhea', 'cramps', 'nausea', 'fever', 'weightLoss'] }],
    selfLimiting: true, lethality: 0.005,
    // Chlorine does not touch the oocysts; only boiling or a fine filter does.
    treatments: { nitazoxanide: 1.0, oralRehydration: 0.25 },
    note: 'Surface water. Survives chlorine — only boiling or filtration removes it.',
  },
  {
    id: 'campylobacteriosis', name: 'Campylobacter enteritis',
    vectors: [VECTOR.undercookedMeat, VECTOR.untreatedWater],
    incubationDays: [1, 3],
    stages: [{ days: 7, symptoms: ['fever', 'bloodyDiarrhea', 'cramps', 'headache', 'myalgia'] }],
    selfLimiting: true, lethality: 0.01,
    treatments: { azithromycin: 1.0, ciprofloxacin: 0.8, oralRehydration: 0.2 },
    note: 'Undercooked poultry and game, or water fouled by it.',
  },
  {
    id: 'trichinellosis', name: 'Trichinellosis',
    vectors: [VECTOR.undercookedBear],
    incubationDays: [1, 2],
    stages: [
      { days: 5, symptoms: ['nausea', 'wateryDiarrhea', 'cramps'] },
      // The muscle phase is the giveaway: bilateral puffiness around the eyes
      // with high fever and deep muscle pain is trichinella and very little else.
      { days: 30, symptoms: ['periorbitalEdema', 'myalgia', 'fever', 'fatigue', 'headache'] },
    ],
    selfLimiting: false, lethality: 0.012,
    treatments: { albendazole: 1.0 },
    note: 'Bear meat. Freezing does not reliably kill it — only cooking through does.',
  },
  {
    id: 'tularemia', name: 'Tularemia',
    vectors: [VECTOR.skinningRabbit, VECTOR.tickBite],
    incubationDays: [3, 5],
    stages: [{ days: 21, symptoms: ['ulcerAndNode', 'fever', 'chills', 'headache', 'myalgia', 'fatigue'] }],
    selfLimiting: false, lethality: 0.06,
    treatments: { gentamicin: 1.0, doxycycline: 0.9, ciprofloxacin: 0.9 },
    note: 'Skinning rabbits bare-handed. A cut on the hand is all it needs.',
  },
  {
    id: 'rabbitStarvation', name: 'Protein poisoning',
    vectors: [VECTOR.leanMeatOnly],
    incubationDays: [7, 12],
    stages: [{ days: 14, symptoms: ['wateryDiarrhea', 'headache', 'fatigue', 'lowBP', 'weightLoss'] }],
    selfLimiting: false, lethality: 0.09,
    // Not an infection at all: the liver cannot deaminate protein fast enough
    // to live on lean meat alone, so you starve on a full stomach. No drug
    // fixes it; fat or carbohydrate does, immediately.
    treatments: { eatFat: 1.0 },
    note: 'Weeks of nothing but lean meat. Rabbit is the classic — almost no fat on it.',
  },
  {
    id: 'rabies', name: 'Rabies',
    vectors: [VECTOR.carnivoreBite],
    incubationDays: [30, 90],
    stages: [
      { days: 4, symptoms: ['paresthesia', 'fever', 'headache', 'fatigue'] },
      { days: 7, symptoms: ['hydrophobia', 'agitation', 'hypersalivation', 'confusion'] },
    ],
    selfLimiting: false, lethality: 1.0,
    // The only entry in this table where treatment must precede symptoms.
    // Once the prodrome starts, rabies is effectively always fatal, and the
    // game does not pretend otherwise.
    treatments: { rabiesPEP: 1.0 },
    prophylaxisOnly: true,
    note: 'Bites from wolves, coyotes, foxes and bats. The vaccine works before symptoms and never after.',
  },
  {
    id: 'tetanus', name: 'Tetanus',
    vectors: [VECTOR.soilContaminatedWound],
    incubationDays: [3, 21],
    stages: [
      { days: 2, symptoms: ['trismus', 'headache'] },
      { days: 10, symptoms: ['trismus', 'spasms', 'nightSweats', 'tachycardia'] },
    ],
    selfLimiting: false, lethality: 0.11,
    treatments: { antitoxinTet: 1.0, metronidazole: 0.45, debridement: 0.3 },
    note: 'Deep dirty wounds — rusted metal, splinters, anything driven into soil.',
  },
  {
    id: 'leptospirosis', name: 'Leptospirosis',
    vectors: [VECTOR.freshwaterImmersion, VECTOR.rodentDroppings],
    incubationDays: [5, 14],
    stages: [
      // Red eyes without discharge plus calf pain is the classic pair.
      { days: 7, symptoms: ['fever', 'calfPain', 'redEyes', 'headache', 'chills'] },
      { days: 10, symptoms: ['jaundice', 'confusion', 'lowBP', 'fatigue'] },
    ],
    selfLimiting: false, lethality: 0.08,
    treatments: { doxycycline: 1.0, penicillin: 0.95, ciprofloxacin: 0.6 },
    note: 'Swimming or wading in still fresh water, especially where rats are.',
  },
  {
    id: 'lyme', name: 'Lyme disease',
    vectors: [VECTOR.tickBite],
    incubationDays: [3, 30],
    stages: [
      { days: 14, symptoms: ['bullseyeRash', 'fever', 'fatigue', 'headache', 'myalgia'] },
      { days: 60, symptoms: ['jointPain', 'fatigue', 'confusion'] },
    ],
    selfLimiting: false, lethality: 0.002,
    treatments: { doxycycline: 1.0, amoxicillin: 0.9, cephalexin: 0.5 },
    note: 'Ticks, from tall grass and brush. Check yourself after crossing the prairie.',
  },
  {
    id: 'hantavirus', name: 'Hantavirus pulmonary syndrome',
    vectors: [VECTOR.rodentDroppings],
    incubationDays: [7, 42],
    stages: [
      { days: 5, symptoms: ['fever', 'myalgia', 'headache', 'nausea'] },
      { days: 4, symptoms: ['dyspnea', 'cough', 'tachycardia', 'lowBP', 'confusion'] },
    ],
    selfLimiting: false, lethality: 0.38,
    // There is no cure. Rest and warmth buy time and nothing else, which is
    // exactly the real situation.
    treatments: { rest: 0.25 },
    note: 'Sweeping out a derelict house. Disturbing mouse droppings aerosolises it.',
  },
  {
    id: 'woundInfection', name: 'Wound infection (cellulitis)',
    vectors: [VECTOR.dirtyWound],
    incubationDays: [1, 3],
    stages: [
      { days: 3, symptoms: ['woundHot', 'fever'] },
      { days: 4, symptoms: ['woundRedStreak', 'woundHot', 'fever', 'chills', 'swollenNodes'] },
      { days: 5, symptoms: ['fever', 'confusion', 'tachycardia', 'lowBP'] },   // sepsis
    ],
    selfLimiting: false, lethality: 0.22,
    treatments: { cephalexin: 1.0, amoxicillin: 0.8, azithromycin: 0.6, debridement: 0.4 },
    note: 'Any wound left dirty. The commonest thing on this list and the easiest to prevent.',
  },
  {
    id: 'anthraxCutaneous', name: 'Cutaneous anthrax',
    vectors: [VECTOR.butcheringCattle],
    incubationDays: [1, 7],
    stages: [{ days: 14, symptoms: ['blackEschar', 'swollenNodes', 'fever', 'headache'] }],
    selfLimiting: false, lethality: 0.15,
    // Painless is the tell. A sore that does not hurt is not a normal sore.
    treatments: { ciprofloxacin: 1.0, doxycycline: 0.95, penicillin: 0.8 },
    note: 'Butchering cattle that died on their own. The sore does not hurt — that is the warning.',
  },
  {
    id: 'brucellosis', name: 'Brucellosis',
    vectors: [VECTOR.butcheringCattle, VECTOR.rawMilk],
    incubationDays: [7, 30],
    stages: [{ days: 45, symptoms: ['fever', 'nightSweats', 'jointPain', 'myalgia', 'fatigue', 'weightLoss'] }],
    selfLimiting: false, lethality: 0.02,
    // Undulant fever: it comes in waves, which is why it gets missed.
    treatments: { doxycycline: 0.7, rifampin: 0.7 },
    combination: { drugs: ['doxycycline', 'rifampin'], efficacy: 1.0 },
    note: 'Raw milk, or handling cattle tissue. One drug alone usually relapses — it needs two.',
  },
  {
    id: 'botulism', name: 'Botulism',
    vectors: [VECTOR.spoiledCannedFood],
    incubationDays: [0.5, 1.5],
    stages: [
      { days: 1, symptoms: ['diplopia', 'ptosis', 'dysphagia'] },
      { days: 8, symptoms: ['descendingWeak', 'dysphagia', 'dyspnea'] },
    ],
    selfLimiting: false, lethality: 0.20,
    // No fever and a completely clear head, with paralysis marching downward.
    // Nothing else on this list looks like that.
    treatments: { antitoxinBot: 1.0 },
    note: 'Swollen or dented cans. No fever, mind perfectly clear, weakness spreading down from the eyes.',
  },
  {
    id: 'norovirus', name: 'Norovirus',
    vectors: [VECTOR.personToPerson, VECTOR.untreatedWater],
    incubationDays: [0.5, 2],
    stages: [{ days: 2.5, symptoms: ['vomiting', 'wateryDiarrhea', 'cramps', 'nausea'] }],
    selfLimiting: true, lethality: 0.002,
    treatments: { oralRehydration: 0.6, rest: 0.3 },
    note: 'Violent, brief, and it will not kill you — but it will dehydrate you, and that will.',
  },
  {
    id: 'pneumonia', name: 'Bacterial pneumonia',
    vectors: [VECTOR.personToPerson],
    incubationDays: [1, 4],
    stages: [
      { days: 3, symptoms: ['fever', 'productiveCough', 'chills'] },
      { days: 8, symptoms: ['productiveCough', 'chestPain', 'dyspnea', 'fever', 'confusion'] },
    ],
    selfLimiting: false, lethality: 0.13,
    treatments: { amoxicillin: 1.0, azithromycin: 0.9, doxycycline: 0.7 },
    // Exposure and exhaustion are what let it in, which links it back to the
    // rest of the simulation rather than making it a random event.
    note: 'Follows cold, wet and exhaustion. Keep dry and rested and it mostly does not happen.',
  },
  {
    id: 'trenchFoot', name: 'Immersion foot',
    vectors: [VECTOR.coldWetFeet],
    incubationDays: [0.5, 3],
    stages: [
      { days: 2, symptoms: ['numbFeet'] },
      { days: 10, symptoms: ['footPain', 'numbFeet', 'fever'] },
    ],
    selfLimiting: false, lethality: 0.01,
    treatments: { rewarmDry: 1.0 },
    note: 'Days in wet boots above freezing. Dry socks are the whole cure and the whole prevention.',
  },
];

const PATHOGEN_BY_ID = {};
for (const p of PATHOGENS) PATHOGEN_BY_ID[p.id] = p;


/* One active infection in one character. */
class Infection {
  constructor(pathogen, rng) {
    this.pathogen = pathogen;
    this.id = pathogen.id;
    const [lo, hi] = pathogen.incubationDays;
    // Each infection draws its own incubation, so two players who drank from
    // the same creek do not fall ill on the same afternoon.
    this.incubationDays = lo + (hi - lo) * (rng ? rng() : Math.random());
    this.ageDays = 0;
    this.stageIndex = -1;      // -1 while incubating
    this.stageDays = 0;
    this.cured = false;
    this.resolved = false;
    this.treatmentEfficacy = 0;
    this.drugsGiven = [];
    this.severity = 0;
  }

  get incubating() { return this.stageIndex < 0; }
  get symptomatic() { return this.stageIndex >= 0 && !this.resolved; }

  currentSymptoms() {
    if (!this.symptomatic) return [];
    return this.pathogen.stages[this.stageIndex].symptoms;
  }

  /* Applying a treatment. Efficacy is looked up against the *actual*
     pathogen, so treating a viral gut infection with an antibiotic does
     precisely what it does in life: nothing, and you have spent the pills. */
  treat(drugId) {
    if (this.resolved) return { effect: 'already resolved', efficacy: 0 };
    this.drugsGiven.push(drugId);

    const p = this.pathogen;
    if (p.prophylaxisOnly && this.symptomatic) {
      // Rabies. The window closed when symptoms started.
      return { effect: 'too late', efficacy: 0, fatal: true };
    }

    let eff = p.treatments[drugId] || 0;
    // Some infections need two drugs together and relapse on either alone.
    if (p.combination && p.combination.drugs.every((d) => this.drugsGiven.includes(d))) {
      eff = Math.max(eff, p.combination.efficacy);
    }
    this.treatmentEfficacy = Math.max(this.treatmentEfficacy, eff);
    if (eff <= 0) return { effect: 'no effect', efficacy: 0 };
    if (eff >= 0.95) return { effect: 'correct', efficacy: eff };
    return { effect: 'partial', efficacy: eff };
  }

  step(days, rng) {
    if (this.resolved) return;
    this.ageDays += days;

    if (this.incubating) {
      if (this.ageDays < this.incubationDays) return;
      // Incubation ended part-way through this step. The remainder belongs to
      // the first stage — dropping it meant the step in which symptoms began
      // had zero severity and did the body no harm at all, however long the
      // step was.
      this.stageIndex = 0;
      this.stageDays = 0;
      days = Math.min(days, this.ageDays - this.incubationDays);
    } else {
      this.stageDays += days;
    }
    const stage = this.pathogen.stages[this.stageIndex];

    // An effective drug shortens the illness sharply and blunts its severity;
    // a partly effective one does part of that and can still fail.
    this.stageDays += days * this.treatmentEfficacy * 4;

    const last = this.stageIndex === this.pathogen.stages.length - 1;
    this.severity = clamp01((this.stageIndex + 1) / this.pathogen.stages.length)
      * (1 - 0.85 * this.treatmentEfficacy);

    if (this.stageDays >= stage.days) {
      if (last) {
        this.resolved = true;
        this.cured = this.treatmentEfficacy > 0.5 || this.pathogen.selfLimiting;
      } else {
        this.stageIndex++;
        this.stageDays = 0;
      }
    }
  }

  /* Probability of death over `days` at the current stage. Untreated final
     stages kill; treated ones mostly do not. */
  mortalityRisk(days) {
    if (this.resolved || this.incubating) return 0;
    const last = this.stageIndex === this.pathogen.stages.length - 1;
    if (!last) return 0;
    const daily = this.pathogen.lethality / Math.max(1, this.pathogen.stages[this.stageIndex].days);
    return daily * days * (1 - this.treatmentEfficacy);
  }
}


class DiseaseSystem {
  constructor(opts = {}) {
    this.infections = [];
    this.immunity = {};              // pathogen id -> 0..1
    this.exposureLog = [];
    this.rng = opts.rng || Math.random;
    /* Vaccination is a real defence and the game should reward finding it. */
    this.vaccinated = { tetanus: false, rabies: false };
  }

  /* Raised by the action that caused it, with the risk that action carries.
     `hygiene` is 0..1 — gloves when skinning, boiled water, a clean knife —
     and it multiplies the risk down, which is how the player earns safety. */
  expose(vector, opts = {}) {
    const hygiene = clamp01(opts.hygiene != null ? opts.hygiene : 0);
    const load = opts.load != null ? opts.load : 1;
    const caught = [];

    for (const p of PATHOGENS) {
      if (!p.vectors.includes(vector)) continue;
      if (this.infections.some((i) => i.id === p.id && !i.resolved)) continue;

      let risk = (BASE_RISK[p.id] != null ? BASE_RISK[p.id] : 0.06) * load;
      risk *= (1 - 0.9 * hygiene);
      risk *= (1 - clamp01(this.immunity[p.id] || 0));
      if (p.id === 'tetanus' && this.vaccinated.tetanus) risk *= 0.02;

      if (this.rng() < risk) {
        const inf = new Infection(p, this.rng);
        this.infections.push(inf);
        caught.push(p.id);
      }
    }
    this.exposureLog.push({ vector, hygiene, caught });
    if (this.exposureLog.length > 200) this.exposureLog.shift();
    return caught;
  }

  treat(drugId) {
    const results = [];
    for (const inf of this.infections) {
      if (inf.resolved) continue;
      results.push(Object.assign({ infection: inf.id }, inf.treat(drugId)));
    }
    // Treating an illness you do not have is not free. The dose is gone.
    if (!results.length) return [{ infection: null, effect: 'nothing to treat', efficacy: 0 }];
    return results;
  }

  /* Everything the player can currently observe, merged and deduplicated —
     because a body with two infections presents one confusing picture, not
     two tidy lists. That ambiguity is the diagnosis puzzle. */
  observedSymptoms() {
    const seen = new Map();
    for (const inf of this.infections) {
      if (!inf.symptomatic) continue;
      for (const sid of inf.currentSymptoms()) {
        const prev = seen.get(sid) || 0;
        seen.set(sid, Math.max(prev, inf.severity));
      }
    }
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sid, sev]) => ({ id: sid, text: SYMPTOM[sid] ? SYMPTOM[sid].text : sid, severity: sev }));
  }

  /* A field guide, not an answer key: given what the player can see, which
     diseases are consistent with it and how well. The player still has to
     decide, and an early presentation matches half the table. */
  differential() {
    const present = new Set(this.observedSymptoms().map((s) => s.id));
    if (!present.size) return [];
    const out = [];
    for (const p of PATHOGENS) {
      const all = new Set();
      for (const st of p.stages) for (const s of st.symptoms) all.add(s);
      let matched = 0;
      for (const s of present) if (all.has(s)) matched++;
      if (!matched) continue;
      // Reward specificity: matching most of what a disease causes counts for
      // more than matching one symptom that half the table shares.
      const coverage = matched / present.size;
      const specificity = matched / all.size;
      out.push({
        id: p.id, name: p.name, note: p.note,
        confidence: clamp01(0.65 * coverage + 0.35 * specificity),
        treatments: Object.keys(p.treatments),
      });
    }
    return out.sort((a, b) => b.confidence - a.confidence);
  }

  step(days, physiology) {
    let died = null;
    for (const inf of this.infections) {
      const wasResolved = inf.resolved;
      inf.step(days, this.rng);

      if (inf.symptomatic && physiology) this._applyBurden(inf, days, physiology);

      const risk = inf.mortalityRisk(days);
      if (risk > 0 && this.rng() < risk) died = inf.pathogen.name;

      if (!wasResolved && inf.resolved) {
        // Surviving something buys real, partial, decaying immunity.
        this.immunity[inf.id] = Math.min(0.95, (this.immunity[inf.id] || 0) + 0.7);
      }
    }
    this.infections = this.infections.filter((i) => !i.resolved || i.ageDays < 90);
    // Immunity wanes.
    for (const k of Object.keys(this.immunity)) {
      this.immunity[k] = Math.max(0, this.immunity[k] - days / 900);
    }
    if (died && physiology) physiology._die(died);
    return died;
  }

  /* Illness is not a status icon — it acts on the body through the same
     reservoirs everything else does. Diarrhoea costs litres, fever costs
     calories and raises the thermal set point, weakness costs capacity. */
  _applyBurden(inf, days, phys) {
    const s = inf.currentSymptoms();
    const sev = inf.severity;
    const seconds = days * 86400;

    if (s.includes('wateryDiarrhea') || s.includes('bloodyDiarrhea')) {
      phys.bodyWaterL = Math.max(0, phys.bodyWaterL - 0.9 * sev * days);
    }
    if (s.includes('greasyStool')) {
      // Malabsorption: the calories go straight through you.
      phys.intestineKcal *= Math.max(0, 1 - 0.5 * sev * days);
    }
    if (s.includes('vomiting')) {
      phys.stomach.kcal *= Math.max(0, 1 - 3 * sev * days);
      phys.bodyWaterL = Math.max(0, phys.bodyWaterL - 0.5 * sev * days);
    }
    if (s.includes('fever')) {
      // Fever is an elevated set point, not just a number: it raises core
      // temperature and costs roughly 10-13% more metabolism per degree.
      phys.coreTempC += Math.min(2.2, 1.8 * sev) * clamp01(seconds / 7200)
        * (phys.coreTempC < 37 + 2.2 * sev ? 1 : 0) * 0.35;
      phys.glycogenKcal = Math.max(0, phys.glycogenKcal - 240 * sev * days);
    }
    if (s.includes('lowBP')) {
      phys.bloodVolumeL = Math.max(0, phys.bloodVolumeL - 0.25 * sev * days);
    }
    this.systemicBurden = sev;
  }

  /* Multiplier on everything the player can physically do. */
  capacityMultiplier() {
    let m = 1;
    for (const inf of this.infections) {
      if (!inf.symptomatic) continue;
      const s = inf.currentSymptoms();
      let hit = 0.15 * inf.severity;
      if (s.includes('descendingWeak') || s.includes('spasms')) hit += 0.5 * inf.severity;
      if (s.includes('footPain')) hit += 0.4 * inf.severity;
      if (s.includes('dyspnea')) hit += 0.35 * inf.severity;
      if (s.includes('myalgia') || s.includes('fatigue')) hit += 0.15 * inf.severity;
      if (s.includes('confusion')) hit += 0.2 * inf.severity;
      m *= (1 - clamp01(hit));
    }
    return clamp01(m);
  }

  serialize() {
    return {
      infections: this.infections.map((i) => ({
        id: i.id, ageDays: i.ageDays, incubationDays: i.incubationDays,
        stageIndex: i.stageIndex, stageDays: i.stageDays,
        treatmentEfficacy: i.treatmentEfficacy, drugsGiven: i.drugsGiven.slice(),
        resolved: i.resolved, cured: i.cured,
      })),
      immunity: Object.assign({}, this.immunity),
      vaccinated: Object.assign({}, this.vaccinated),
    };
  }

  static deserialize(data, opts = {}) {
    const ds = new DiseaseSystem(opts);
    ds.immunity = Object.assign({}, data.immunity || {});
    ds.vaccinated = Object.assign({ tetanus: false, rabies: false }, data.vaccinated || {});
    for (const rec of data.infections || []) {
      const p = PATHOGEN_BY_ID[rec.id];
      if (!p) continue;
      const inf = new Infection(p, ds.rng);
      Object.assign(inf, rec);
      inf.pathogen = p;
      ds.infections.push(inf);
    }
    return ds;
  }
}

/* Per-exposure infection probability with no precautions taken. These are
   game constants tuned so that careless play gets you sick within a week and
   careful play mostly does not — the real-world attack rates vary far too
   much with dose and locale to be quoted as single numbers. */
const BASE_RISK = {
  giardiasis: 0.14, cryptosporidiosis: 0.07, campylobacteriosis: 0.10,
  trichinellosis: 0.22, tularemia: 0.09, rabbitStarvation: 0.85,
  rabies: 0.16, tetanus: 0.05, leptospirosis: 0.05, lyme: 0.04,
  hantavirus: 0.015, woundInfection: 0.28, anthraxCutaneous: 0.02,
  brucellosis: 0.05, botulism: 0.30, norovirus: 0.12, pneumonia: 0.06,
  trenchFoot: 0.45,
};
