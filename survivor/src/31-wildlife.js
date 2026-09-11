/* ============================================================
   WILDLIFE — need zones, senses, sign, calls and pressure.

   This is the layer that turns a population of animals into
   something you can hunt rather than something you can find.
   The shape of it follows what a hunting simulation has to
   model, and every piece of it is grounded in the same place
   the rest of this game is: what the animal actually does.

   Four ideas carry the whole thing.

   An animal is somewhere for a reason. It is at a feeding
   zone because it is hungry and it is dawn, at water because
   it has fed, bedded in cover because it is the middle of the
   day. Learning a species is learning its clock, and the clock
   is the species' own activity pattern rather than a schedule
   invented for the game.

   Three senses, separately. Sight is a cone that cares about
   movement, light and cover. Hearing is a radius that cares
   about what you are doing and what is between you. Smell is
   a plume that goes exactly where the wind goes, and there is
   no crouching your way out of it. They are independent, so
   they combine as independent probabilities, and the one that
   catches you tells you what you did wrong.

   Everything leaves sign. A footprint carries the species,
   roughly the weight, often the sex, the direction of travel,
   the gait, and how long ago it was made. Blood carries where
   you hit. Droppings carry what it has been eating and when it
   was here. Reading them is the actual game, and it only works
   if the sign is generated from the truth rather than sprinkled
   about as a hint.

   Pressure. An animal that has been shot at leaves and does
   not come back for days. Hunt one valley out and you have to
   walk to the next one, which is the only honest way to make a
   finite island last.
   ============================================================ */

/* ------------------------------------------------------------------
   NEED ZONES

   Where an animal wants to be, and when. The daily pattern comes from
   the species' activity type: a crepuscular animal feeds at first and
   last light and beds through the middle of the day, a nocturnal one
   does the same shifted, and a cathemeral one works in bouts around the
   clock. Hours are the hour of the day, 0-24.
   ------------------------------------------------------------------ */
const NEED = {
  feed: 'feed',
  drink: 'drink',
  rest: 'rest',
  mate: 'mate',
};

/* Which need is active at which hour, per activity pattern. The drinking
   windows sit just after the feeding ones, because that is the order a
   ruminant does it in: fill up, then go to water. */
const DAY_PLAN = {
  crepuscular: [
    { from: 4.5, to: 8.0, need: NEED.feed },
    { from: 8.0, to: 9.0, need: NEED.drink },
    { from: 9.0, to: 16.0, need: NEED.rest },
    { from: 16.0, to: 20.5, need: NEED.feed },
    { from: 20.5, to: 21.5, need: NEED.drink },
    { from: 21.5, to: 28.5, need: NEED.rest },     // wraps past midnight
  ],
  diurnal: [
    { from: 6.0, to: 11.0, need: NEED.feed },
    { from: 11.0, to: 12.0, need: NEED.drink },
    { from: 12.0, to: 14.5, need: NEED.rest },
    { from: 14.5, to: 19.0, need: NEED.feed },
    { from: 19.0, to: 30.0, need: NEED.rest },
  ],
  nocturnal: [
    { from: 19.5, to: 24.0, need: NEED.feed },
    { from: 0.0, to: 1.0, need: NEED.drink },
    { from: 1.0, to: 4.5, need: NEED.feed },
    { from: 4.5, to: 19.5, need: NEED.rest },
  ],
  cathemeral: [
    // Bouts around the clock: bears and boar are busy whenever they are
    // hungry, which in autumn is most of the time.
    { from: 5.0, to: 9.5, need: NEED.feed },
    { from: 9.5, to: 10.5, need: NEED.drink },
    { from: 10.5, to: 13.5, need: NEED.rest },
    { from: 13.5, to: 18.0, need: NEED.feed },
    { from: 18.0, to: 19.0, need: NEED.drink },
    { from: 19.0, to: 22.5, need: NEED.rest },
    { from: 22.5, to: 29.0, need: NEED.feed },
  ],
};

/* What an animal wants right now. Needs override the clock when they get
   bad enough — a thirsty animal goes to water whatever the hour, which is
   what makes a waterhole worth sitting on in a dry spell. */
function currentNeed(activity, hourOfDay, opts = {}) {
  const thirst = opts.thirst || 0;
  const hunger = opts.hunger || 0;
  const fatigue = opts.fatigue || 0;
  if (thirst > 0.8) return NEED.drink;
  if (opts.inRut && opts.male && (opts.rutIntensity || 0) > 0.5) return NEED.mate;
  if (fatigue > 0.9) return NEED.rest;
  if (hunger > 0.85) return NEED.feed;

  const plan = DAY_PLAN[activity] || DAY_PLAN.crepuscular;
  const h = hourOfDay;
  for (const slot of plan) {
    // Slots may run past midnight, so test both the plain and wrapped hour.
    if ((h >= slot.from && h < slot.to) || (h + 24 >= slot.from && h + 24 < slot.to)) {
      return slot.need;
    }
  }
  return NEED.rest;
}

/* When the next need change is due, so an animal can be scheduled rather
   than polled. Returns hours from now. */
function hoursUntilNeedChange(activity, hourOfDay) {
  const plan = DAY_PLAN[activity] || DAY_PLAN.crepuscular;
  let best = 24;
  for (const slot of plan) {
    for (const edge of [slot.from, slot.to]) {
      let d = edge - hourOfDay;
      if (d <= 0.001) d += 24;
      if (d < best) best = d;
    }
  }
  return best;
}


/* ------------------------------------------------------------------
   ALERTNESS

   What an animal is doing about you. These are states rather than a
   single number because the behaviour at each is different and the
   player has to be able to read which one they are looking at: an
   alerted deer stares and stamps, a spooked one leaves.
   ------------------------------------------------------------------ */
const ALERT = {
  unaware: 'unaware',
  curious: 'curious',     // heard something, looking
  alerted: 'alerted',     // knows something is there, has not placed it
  spooked: 'spooked',     // has placed it and is leaving
  fleeing: 'fleeing',     // running
};

/* How fast awareness builds and fades. A prey animal forgets slowly —
   a deer that has been bumped stays jumpy for the best part of an hour,
   which is why the second stalk on the same animal is the hard one. */
const AWARENESS_DECAY_PER_MIN = 0.035;

function alertStateFor(awareness) {
  if (awareness >= 0.98) return ALERT.fleeing;
  if (awareness >= 0.72) return ALERT.spooked;
  if (awareness >= 0.38) return ALERT.alerted;
  if (awareness >= 0.12) return ALERT.curious;
  return ALERT.unaware;
}


/* ------------------------------------------------------------------
   SENSES

   Three of them, computed separately so the game can say which one
   caught you. Sight cares about movement, light, cover and whether you
   are in front of the animal at all. Hearing cares about what you are
   doing and what is between you. Smell cares only about the wind.
   ------------------------------------------------------------------ */

/* An animal's field of view. Prey with eyes on the sides of the head see
   very nearly all the way round — a deer has about 300 degrees — which is
   why you cannot simply walk up behind one. Predators with forward eyes
   see less but see it better. */
function fieldOfViewDeg(species) {
  if (species.class === 'bird') return 300;
  if (species.class === 'ungulate') return 300;
  if (species.class === 'bear') return 250;
  if (species.class === 'cat' || species.class === 'canid') return 200;
  return 260;
}

function senseSight(animal, dx, dz, opts) {
  const s = animal.species;
  const dist = Math.hypot(dx, dz);
  if (dist > s.visionM) return 0;

  // Behind the animal is genuinely behind it, and the blind spot is small.
  const toward = Math.atan2(dx, dz);
  let off = Math.abs(((toward - animal.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const halfFov = (fieldOfViewDeg(s) / 2) * Math.PI / 180;
  if (off > halfFov) return 0;

  /* Detail falls off with the square of distance the way acuity does, not
     linearly: a deer that can pick you out at fifty metres cannot at two
     hundred even though two hundred is inside its range. */
  const range = clamp01(1 - (dist / s.visionM) ** 2);
  // Movement is most of it. A still hunter in the open is often ignored;
  // the same hunter walking is seen at once.
  const motion = clamp01(0.06 + (opts.movementSpeed || 0) * 0.5);
  const cover = 1 - clamp01(opts.concealment || 0);
  const light = clamp01(0.18 + (opts.light != null ? opts.light : 1) * 0.82);
  // Prone in cover at dusk is close to invisible, and that is the point.
  return range * motion * cover * light;
}

function senseHearing(animal, dx, dz, opts) {
  const s = animal.species;
  const dist = Math.hypot(dx, dz);
  if (dist > s.hearingM) return 0;
  /* Sound pressure falls with the square of distance, so a noise that
     carries three hundred metres is inaudible at three hundred and one but
     obvious at fifty. */
  const range = clamp01(1 - (dist / s.hearingM) ** 2);
  const loudness = clamp01(opts.noise || 0);
  // Wind and rain mask; still air carries.
  const mask = 1 - clamp01(((opts.windMs || 0) / 14) * 0.4 + ((opts.precipitation || 0) / 10) * 0.35);
  // Dense cover absorbs sound as well as hiding you.
  const absorb = 1 - clamp01(opts.coverBetween || 0) * 0.4;
  return range * loudness * mask * absorb;
}

function senseSmell(animal, dx, dz, opts) {
  const s = animal.species;
  if (!s.smellM) return 0;
  const dist = Math.hypot(dx, dz);
  if (dist > s.smellM) return 0;
  if (opts.windDirX == null) return 0;

  /* The wind vector points the way the wind is going, so scent reaches the
     animal when the direction from the player to the animal agrees with it.
     Directly downwind is a wall; crosswind is a narrow margin; upwind is
     free. This is the single most important thing in hunting and the model
     should be blunt about it. */
  const toAnimal = dist > 0.001 ? { x: dx / dist, z: dz / dist } : { x: 0, z: 0 };
  const alignment = toAnimal.x * opts.windDirX + toAnimal.z * opts.windDirZ;
  if (alignment <= 0.08) return 0;                    // upwind or across it

  /* A scent cone spreads as it travels, so the margin either side widens
     with distance while the concentration in it drops. */
  const carry = Math.pow(clamp01(alignment), 1.6);
  const strength = clamp01(1 - (dist / s.smellM) ** 1.35);
  // Still air does not carry scent far; a breeze carries it a long way.
  const wind = clamp01(0.15 + (opts.windMs || 0) / 5);
  const masked = 1 - clamp01(opts.scentControl || 0);
  return carry * strength * wind * masked;
}

/* All three, and which one it was. Returned separately so the game can tell
   the player what gave them away, which is the only way to learn. */
function senseAll(animal, dx, dz, opts = {}) {
  const sight = senseSight(animal, dx, dz, opts);
  const hearing = senseHearing(animal, dx, dz, opts);
  const smell = senseSmell(animal, dx, dz, opts);
  // Independent chances, so they compound rather than add.
  const miss = (1 - clamp01(sight)) * (1 - clamp01(hearing)) * (1 - clamp01(smell));
  const total = clamp01((1 - miss) * animal.species.alertness);
  let by = null, best = 0;
  for (const [k, v] of [['sight', sight], ['hearing', hearing], ['smell', smell]]) {
    if (v > best) { best = v; by = k; }
  }
  return { sight, hearing, smell, total, by };
}


/* ------------------------------------------------------------------
   SIGN

   Everything an animal leaves behind. A piece of sign is generated from
   the animal that made it, so reading it tells the truth — including the
   truths you would rather not have, like a gut-shot deer's blood.
   ------------------------------------------------------------------ */
const SIGN = {
  track: 'track',
  dropping: 'dropping',
  blood: 'blood',
  bed: 'bed',
  rub: 'rub',
  scrape: 'scrape',
  wallow: 'wallow',
  feedSign: 'feedSign',
  hair: 'hair',
};

/* Blood tells you where you hit, and what to do next. These are the
   readings a tracker actually uses, and the advice attached to each is the
   advice that goes with it. */
const BLOOD = {
  lung: {
    id: 'lung', name: 'bright pink, frothy, bubbled',
    colour: 0xff5a6e, volume: 1.0, spread: 1.0,
    means: 'Lungs. It will not go far. Give it ten minutes and follow.',
    lethal: true, waitMinutes: 15, trailMetres: 120,
  },
  heart: {
    id: 'heart', name: 'dark red, heavy, sprayed',
    colour: 0xb2202c, volume: 1.2, spread: 1.2,
    means: 'Heart. It is already down or will be within a hundred metres.',
    lethal: true, waitMinutes: 5, trailMetres: 70,
  },
  liver: {
    id: 'liver', name: 'dark, thick, almost purple',
    colour: 0x6e1b2a, volume: 0.7, spread: 0.6,
    means: 'Liver. Fatal, but slowly. Wait an hour or you will push it for miles.',
    lethal: true, waitMinutes: 60, trailMetres: 400,
  },
  gut: {
    id: 'gut', name: 'brown-green, flecked with matter, and it stinks',
    colour: 0x5a5a2a, volume: 0.35, spread: 0.3,
    means: 'Gut. It will die, and not soon. Back out and come back in the morning.',
    lethal: true, waitMinutes: 240, trailMetres: 1200,
  },
  muscle: {
    id: 'muscle', name: 'bright red, running freely',
    colour: 0xd2202a, volume: 0.8, spread: 0.7,
    means: 'Meat. It may recover. Follow while the blood is fresh.',
    lethal: false, waitMinutes: 20, trailMetres: 600,
  },
  bone: {
    id: 'bone', name: 'bright red with white fragments in it',
    colour: 0xe04a4a, volume: 0.5, spread: 0.5,
    means: 'Bone. A leg it can still run on, or a shoulder it cannot.',
    lethal: false, waitMinutes: 30, trailMetres: 800,
  },
  graze: {
    id: 'graze', name: 'a few specks, no more',
    colour: 0xc03030, volume: 0.12, spread: 0.15,
    means: 'A graze. Whatever you hit, it is still out there and healthy.',
    lethal: false, waitMinutes: 0, trailMetres: 150,
  },
};

/* Which blood a hit produces, from the region the ballistics model already
   reports. There is no randomness here: where you hit is what you get. */
function bloodFor(regionId, severity) {
  if (severity < 0.12) return BLOOD.graze;
  switch (regionId) {
    case 'chest': case 'lungs': return BLOOD.lung;
    case 'heart': return BLOOD.heart;
    case 'liver': return BLOOD.liver;
    case 'abdomen': case 'gut': return BLOOD.gut;
    case 'shoulder': case 'leg': case 'foreleg': case 'hindleg': return BLOOD.bone;
    case 'neck': case 'head': return severity > 0.6 ? BLOOD.heart : BLOOD.muscle;
    default: return BLOOD.muscle;
  }
}

/* A gait leaves a different track pattern, and the spacing is what tells
   you which. Stride is in body lengths, so it scales with the animal. */
const GAIT_SIGN = {
  walk: { strideBodyLengths: 0.55, splay: 0.10, depth: 1.0, name: 'walking' },
  trot: { strideBodyLengths: 0.95, splay: 0.14, depth: 1.15, name: 'trotting' },
  canter: { strideBodyLengths: 1.6, splay: 0.2, depth: 1.35, name: 'loping' },
  gallop: { strideBodyLengths: 2.6, splay: 0.3, depth: 1.7, name: 'running flat out' },
  stot: { strideBodyLengths: 2.2, splay: 0.35, depth: 2.1, name: 'bounding' },
};

class Sign {
  constructor(opts = {}) {
    this.kind = opts.kind || SIGN.track;
    this.x = opts.x || 0; this.z = opts.z || 0;
    this.speciesId = opts.speciesId || null;
    this.male = !!opts.male;
    this.ageClass = opts.ageClass || 'adult';
    this.massKg = opts.massKg || 0;
    this.heading = opts.heading || 0;
    this.gait = opts.gait || 'walk';
    this.createdAtDays = opts.createdAtDays || 0;
    this.blood = opts.blood || null;
    this.amount = opts.amount != null ? opts.amount : 1;
    this.animalId = opts.animalId != null ? opts.animalId : -1;
    /* How deeply it is pressed in, from the animal's weight and how soft the
       ground was. A heavy animal on wet ground leaves a track you can read a
       week later; the same animal on dry rock leaves nothing. */
    this.depth = opts.depth != null ? opts.depth : 0.5;
    this.substrate = opts.substrate || 'soil';
  }

  /* How much of it is left. Sign fades with time, and far faster in rain —
     which is the difference between a wet morning being the best time to
     track and being the worst. */
  freshness(nowDays, weather = {}) {
    const ageDays = Math.max(0, nowDays - this.createdAtDays);
    const base = { track: 4, dropping: 20, blood: 1.5, bed: 2, rub: 40, scrape: 25, wallow: 14, feedSign: 10, hair: 30 }[this.kind] || 4;
    // Rain washes blood away in an hour and softens a track in a day.
    const rain = (weather.precipitation || 0) / 8;
    const washRate = this.kind === 'blood' ? 12 : 2.2;
    const life = base / (1 + rain * washRate) * (0.6 + this.depth * 0.8);
    return clamp01(1 - ageDays / Math.max(0.02, life));
  }

  /* What a person can tell from it, given how good they are at this. A
     beginner sees "a deer went through here"; someone who has done it for
     years sees a heavy buck, walking, about two hours ago. */
  read(nowDays, skill = 0.3, weather = {}) {
    const fresh = this.freshness(nowDays, weather);
    if (fresh <= 0.02) return null;
    const s = SPECIES[this.speciesId];
    const ageHours = Math.max(0, nowDays - this.createdAtDays) * 24;
    const out = { kind: this.kind, freshness: fresh, ageHours, certainty: clamp01(fresh * (0.35 + skill * 0.65)) };

    // The clearer the sign and the better the tracker, the more comes out.
    const detail = clamp01(fresh * 0.55 + skill * 0.45 + this.depth * 0.2);
    out.species = detail > 0.25 ? (s ? s.name : 'something') : 'something';
    if (detail > 0.45) out.sizeClass = this.massKg > (s ? s.massKg[1] * 0.75 : 80) ? 'heavy'
      : this.massKg < (s ? s.massKg[0] * 1.25 : 30) ? 'light' : 'average';
    if (detail > 0.6 && s && s.antlers) out.sex = this.male ? 'male' : 'female';
    if (detail > 0.55) out.ageClass = this.ageClass;

    if (this.kind === SIGN.track) {
      out.heading = this.heading;
      if (detail > 0.4) out.gait = (GAIT_SIGN[this.gait] || GAIT_SIGN.walk).name;
      out.strideM = (GAIT_SIGN[this.gait] || GAIT_SIGN.walk).strideBodyLengths
        * (s ? lerpN(s.lengthM[0], s.lengthM[1], 0.5) : 1.5);
    }
    if (this.kind === SIGN.blood && this.blood) {
      out.blood = this.blood.name;
      out.means = detail > 0.35 ? this.blood.means : 'Blood. You hit it somewhere.';
      out.lethal = this.blood.lethal;
    }
    if (this.kind === SIGN.bed) out.bodyLengthM = this.amount;
    if (this.kind === SIGN.rub || this.kind === SIGN.scrape) {
      out.means = 'Rut sign. He is working this area and he will be back.';
    }

    // How long ago, in the words a tracker would use rather than a number.
    out.when = ageHours < 0.5 ? 'minutes ago'
      : ageHours < 2 ? 'within the hour'
      : ageHours < 6 ? 'this morning'
      : ageHours < 14 ? 'today'
      : ageHours < 30 ? 'yesterday'
      : `${Math.round(ageHours / 24)} days ago`;
    return out;
  }
}


/* ------------------------------------------------------------------
   CALLS

   A caller brings an animal to you instead of you going to it. What it
   does depends on what you blow, what season it is, and whether that
   animal has heard it too often.
   ------------------------------------------------------------------ */
const CALL = {
  grunt: {
    id: 'grunt', name: 'buck grunt', for: ['whitetailDeer', 'muleDeer'],
    season: ['autumn'], drawsSex: 'male', rangeM: 200,
    // In the rut a buck comes looking for a fight. Out of it, nothing.
    inSeason: 0.55, outOfSeason: 0.05, spookChance: 0.12,
    note: 'A challenge. In the rut he comes to it; in July he leaves.',
  },
  bleat: {
    id: 'bleat', name: 'doe bleat', for: ['whitetailDeer', 'muleDeer'],
    season: ['autumn', 'spring'], drawsSex: 'male', rangeM: 160,
    inSeason: 0.6, outOfSeason: 0.18, spookChance: 0.06,
    note: 'A doe asking. It works on bucks and it calms does.',
  },
  bugle: {
    id: 'bugle', name: 'elk bugle', for: ['elk'],
    season: ['autumn'], drawsSex: 'male', rangeM: 700,
    inSeason: 0.5, outOfSeason: 0.02, spookChance: 0.2,
    note: 'Carries half a mile. A herd bull answers it and comes to move you off.',
  },
  cowCall: {
    id: 'cowCall', name: 'cow call', for: ['elk'],
    season: ['autumn', 'summer'], drawsSex: 'any', rangeM: 400,
    inSeason: 0.55, outOfSeason: 0.25, spookChance: 0.05,
    note: 'The safe one. It reassures as often as it draws.',
  },
  distressRabbit: {
    id: 'distressRabbit', name: 'rabbit in distress', for: ['coyote', 'redFox', 'bobcat', 'cougar'],
    season: ['spring', 'summer', 'autumn', 'winter'], drawsSex: 'any', rangeM: 500,
    inSeason: 0.45, outOfSeason: 0.45, spookChance: 0.1,
    note: 'Every predator on the island is interested in a rabbit dying.',
  },
  howl: {
    id: 'howl', name: 'wolf howl', for: ['grayWolf'],
    season: ['spring', 'summer', 'autumn', 'winter'], drawsSex: 'any', rangeM: 2000,
    inSeason: 0.3, outOfSeason: 0.3, spookChance: 0.25,
    note: 'They answer to find out who you are. Whether they come is another matter.',
  },
  turkeyYelp: {
    id: 'turkeyYelp', name: 'hen yelp', for: ['wildTurkey'],
    season: ['spring'], drawsSex: 'male', rangeM: 300,
    inSeason: 0.6, outOfSeason: 0.12, spookChance: 0.15,
    note: 'A hen looking for company. In April a gobbler will cross a field for it.',
  },
  duckQuack: {
    id: 'duckQuack', name: 'hen mallard call', for: ['mallardDuck'],
    season: ['autumn', 'winter'], drawsSex: 'any', rangeM: 350,
    inSeason: 0.5, outOfSeason: 0.2, spookChance: 0.1,
    note: 'Overdo it and they flare off. Two or three notes is plenty.',
  },
  gooseHonk: {
    id: 'gooseHonk', name: 'goose call', for: ['canadaGoose'],
    season: ['autumn', 'winter'], drawsSex: 'any', rangeM: 600,
    inSeason: 0.45, outOfSeason: 0.2, spookChance: 0.12,
    note: 'They talk on the way past. Answer them and they circle.',
  },
  predatorSquall: {
    id: 'predatorSquall', name: 'fawn bleat', for: ['coyote', 'grayWolf', 'cougar', 'blackBear'],
    season: ['spring', 'summer'], drawsSex: 'any', rangeM: 600,
    inSeason: 0.5, outOfSeason: 0.15, spookChance: 0.2,
    note: 'A fawn in trouble. What comes to it is not always what you wanted.',
  },
};

/* Whether a call works on this animal, right now. Overuse is the thing
   most callers get wrong: an animal that has heard the same note four
   times in twenty minutes stops believing it. */
function callResponse(call, animal, opts = {}) {
  if (!call.for.includes(animal.speciesId)) return { responds: false, reason: 'not its language' };
  const dist = opts.distanceM != null ? opts.distanceM : 0;
  if (dist > call.rangeM) return { responds: false, reason: 'out of earshot' };

  const inSeason = call.season.includes(opts.season);
  let p = inSeason ? call.inSeason : call.outOfSeason;
  if (call.drawsSex === 'male' && !animal.male) p *= 0.25;
  if (call.drawsSex === 'female' && animal.male) p *= 0.25;

  // It has to be able to hear it over the weather, and distance still tells.
  p *= clamp01(1 - (dist / call.rangeM) ** 1.5);
  p *= 1 - clamp01((opts.windMs || 0) / 18) * 0.4;

  /* Call shyness. Each repeat inside the same short window is worth less
     and is more likely to do the opposite of what you wanted. */
  const heard = opts.heardRecently || 0;
  p *= Math.pow(0.55, heard);
  const spook = clamp01(call.spookChance * (1 + heard * 0.8) + (animal.awareness || 0) * 0.4);

  // An animal that is already suspicious does not come to a call.
  if ((animal.awareness || 0) > 0.5) return { responds: false, spooks: true, chance: 0, reason: 'it is already on edge' };

  const rng = opts.rng || Math.random;
  const roll = rng();
  if (roll < spook) return { responds: false, spooks: true, chance: clamp01(p), reason: 'it did not like the sound of that' };
  return { responds: roll < spook + p, spooks: false, chance: clamp01(p) };
}


/* ------------------------------------------------------------------
   HUNTING PRESSURE

   Shoot in a place and the animals leave it. This is a coarse grid over
   the island that rises where shots are fired and decays over days, and
   it is the reason a finite island does not run out in a week: the
   animals are still there, they are just somewhere else.
   ------------------------------------------------------------------ */
class PressureMap {
  constructor(opts = {}) {
    this.worldSizeM = opts.worldSizeM || 4000;
    this.cells = opts.cells || 32;
    this.cellM = this.worldSizeM / this.cells;
    this.grid = new Float32Array(this.cells * this.cells);
    // Pressure halves in about three days, which is roughly how long a
    // shot-at herd stays out of a drainage.
    this.halfLifeDays = opts.halfLifeDays != null ? opts.halfLifeDays : 3;
  }

  _index(x, z) {
    const c = Math.floor((x / this.worldSizeM + 0.5) * this.cells);
    const r = Math.floor((z / this.worldSizeM + 0.5) * this.cells);
    if (c < 0 || r < 0 || c >= this.cells || r >= this.cells) return -1;
    return r * this.cells + c;
  }

  at(x, z) {
    const i = this._index(x, z);
    return i < 0 ? 0 : this.grid[i];
  }

  /* Add pressure, spread over the radius the disturbance actually carried.
     A rifle shot is heard for over a kilometre; walking through is not. */
  add(x, z, amount, radiusM = 300) {
    const reach = Math.ceil(radiusM / this.cellM);
    const c0 = Math.floor((x / this.worldSizeM + 0.5) * this.cells);
    const r0 = Math.floor((z / this.worldSizeM + 0.5) * this.cells);
    for (let r = r0 - reach; r <= r0 + reach; r++) {
      for (let c = c0 - reach; c <= c0 + reach; c++) {
        if (c < 0 || r < 0 || c >= this.cells || r >= this.cells) continue;
        const d = Math.hypot(c - c0, r - r0) * this.cellM;
        if (d > radiusM) continue;
        const falloff = 1 - (d / radiusM) ** 2;
        const i = r * this.cells + c;
        this.grid[i] = Math.min(3, this.grid[i] + amount * falloff);
      }
    }
  }

  step(days) {
    if (days <= 0) return;
    const decay = Math.pow(0.5, days / this.halfLifeDays);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] *= decay;
  }

  /* Somewhere quiet within reach, for an animal that wants to be elsewhere. */
  quietestNear(x, z, radiusM) {
    const reach = Math.ceil(radiusM / this.cellM);
    const c0 = Math.floor((x / this.worldSizeM + 0.5) * this.cells);
    const r0 = Math.floor((z / this.worldSizeM + 0.5) * this.cells);
    let best = null, bestV = Infinity;
    for (let r = r0 - reach; r <= r0 + reach; r++) {
      for (let c = c0 - reach; c <= c0 + reach; c++) {
        if (c < 0 || r < 0 || c >= this.cells || r >= this.cells) continue;
        const v = this.grid[r * this.cells + c];
        if (v < bestV) {
          bestV = v;
          best = {
            x: ((c + 0.5) / this.cells - 0.5) * this.worldSizeM,
            z: ((r + 0.5) / this.cells - 0.5) * this.worldSizeM,
            pressure: v,
          };
        }
      }
    }
    return best;
  }
}


/* ------------------------------------------------------------------
   LIFE STAGES AND TROPHIES
   ------------------------------------------------------------------ */
const LIFE_STAGE = {
  young: 'young',         // fawn, calf, cub, kit, poult
  juvenile: 'juvenile',   // yearling; weaned but not grown
  adult: 'adult',
  prime: 'prime',         // the trophy years
  old: 'old',             // past it, and it shows
};

/* What to call the young of each class, because "juvenile deer" is not
   what anyone says. */
const YOUNG_NAME = {
  ungulate: { young: 'fawn', juvenile: 'yearling' },
  bear: { young: 'cub', juvenile: 'yearling' },
  canid: { young: 'pup', juvenile: 'yearling' },
  cat: { young: 'kitten', juvenile: 'juvenile' },
  bird: { young: 'poult', juvenile: 'juvenile' },
  rodent: { young: 'kit', juvenile: 'juvenile' },
  default: { young: 'young', juvenile: 'juvenile' },
};

function stageFor(species, ageDays) {
  const m = species.maturityDays;
  if (ageDays < m * 0.45) return LIFE_STAGE.young;
  if (ageDays < m) return LIFE_STAGE.juvenile;
  if (ageDays < m * 2.2) return LIFE_STAGE.adult;
  if (ageDays < m * 5) return LIFE_STAGE.prime;
  return LIFE_STAGE.old;
}

function stageName(species, stage) {
  const table = YOUNG_NAME[species.class] || YOUNG_NAME.default;
  if (stage === LIFE_STAGE.young) return table.young;
  if (stage === LIFE_STAGE.juvenile) return table.juvenile;
  return stage;
}

/* How big an animal is for its age. Growth is fast and then flattens off,
   which is a sigmoid, and old animals lose condition rather than size. */
function growthFraction(species, ageDays) {
  const m = species.maturityDays;
  const t = ageDays / m;
  if (t >= 1) return 1;
  // Born at about a twelfth of adult mass for an ungulate, and most of the
  // growth happens in the first season.
  const born = 0.08;
  return born + (1 - born) * (1 - Math.exp(-3.2 * t)) / (1 - Math.exp(-3.2));
}

/* Trophy scoring, in the shape the scoring systems actually use: beam
   length, points, spread and mass, summed. Kept as an abstract score
   rather than pretending to be a specific club's formula. */
function trophyScore(individual) {
  const s = SPECIES[individual.speciesId];
  if (!s || !s.antlers || !individual.male) return 0;
  const stage = stageFor(s, individual.ageDays);
  const yearsPast = Math.max(0, individual.ageDays / s.maturityDays - 1);
  /* Antlers grow every year until an animal starts going back, which is
     usually somewhere past its prime. That is why the biggest heads are on
     animals a few years short of old rather than on the oldest one there. */
  const peak = 4.5;
  const growth = yearsPast < peak ? yearsPast / peak : Math.max(0.55, 1 - (yearsPast - peak) / 6);
  const base = s.id === 'elk' ? 380 : s.id === 'muleDeer' ? 200 : 170;
  const score = base * growth * (0.62 + individual.condition * 0.5);
  return Math.round(score * 10) / 10;
}

function trophyRating(score, speciesId) {
  const s = SPECIES[speciesId];
  if (!s || !s.antlers) return null;
  const best = s.id === 'elk' ? 400 : s.id === 'muleDeer' ? 210 : 180;
  const f = score / best;
  if (f > 0.92) return { tier: 'exceptional', stars: 5 };
  if (f > 0.78) return { tier: 'very good', stars: 4 };
  if (f > 0.6) return { tier: 'good', stars: 3 };
  if (f > 0.4) return { tier: 'representative', stars: 2 };
  return { tier: 'young', stars: 1 };
}

/* Rare coats. Real populations throw the odd piebald, melanistic or
   albino animal, at roughly the real rates — which are low enough that
   seeing one is an event. */
const COAT = {
  common: { id: 'common', name: 'common', chance: 1, rarity: 0 },
  dark: { id: 'dark', name: 'dark', chance: 0.08, rarity: 1 },
  pale: { id: 'pale', name: 'pale', chance: 0.05, rarity: 1 },
  piebald: { id: 'piebald', name: 'piebald', chance: 0.004, rarity: 3 },
  melanistic: { id: 'melanistic', name: 'melanistic', chance: 0.0015, rarity: 4 },
  albino: { id: 'albino', name: 'albino', chance: 0.0004, rarity: 5 },
};

function rollCoat(rng = Math.random) {
  const r = rng();
  if (r < COAT.albino.chance) return COAT.albino;
  if (r < COAT.melanistic.chance) return COAT.melanistic;
  if (r < COAT.piebald.chance) return COAT.piebald;
  if (r < COAT.pale.chance) return COAT.pale;
  if (r < COAT.dark.chance + COAT.pale.chance) return COAT.dark;
  return COAT.common;
}

/* When each species breeds, which drives the rut, the calls that work and
   when the young appear. */
const RUT = {
  whitetailDeer: { season: 'autumn', peakDay: 318, lengthDays: 40 },
  muleDeer: { season: 'autumn', peakDay: 325, lengthDays: 40 },
  elk: { season: 'autumn', peakDay: 268, lengthDays: 35 },
  wildBoar: { season: 'winter', peakDay: 350, lengthDays: 60 },
  grayWolf: { season: 'winter', peakDay: 45, lengthDays: 30 },
  coyote: { season: 'winter', peakDay: 50, lengthDays: 30 },
  redFox: { season: 'winter', peakDay: 20, lengthDays: 25 },
  blackBear: { season: 'summer', peakDay: 170, lengthDays: 45 },
  grizzlyBear: { season: 'summer', peakDay: 165, lengthDays: 45 },
  wildTurkey: { season: 'spring', peakDay: 110, lengthDays: 40 },
};

/* How hard the rut is running today, 0 to 1. Rut behaviour is the single
   biggest change in how an animal acts all year: bucks abandon their
   caution, bulls answer a bugle, and everything moves in daylight. */
function rutIntensity(speciesId, dayOfYear) {
  const r = RUT[speciesId];
  if (!r) return 0;
  let d = Math.abs(dayOfYear - r.peakDay);
  if (d > 182.5) d = 365 - d;
  const half = r.lengthDays / 2;
  if (d > half) return 0;
  return Math.cos((d / half) * Math.PI / 2) ** 2;
}
