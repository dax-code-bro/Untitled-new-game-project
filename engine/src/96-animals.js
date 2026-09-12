/* ============================================================
   ANIMALS — sculpted, skinned, furred creatures with real brains.

   v2: every animal is ONE connected mesh — a body sculpted with
   lofted rings around a real quadruped skeleton (the same pipeline
   the human character uses), auto-skinned by bone distance, and
   posed by driving bone rotations from the gait system. No more
   floating parts: neck flows out of the chest, legs grow out of
   the shoulders and hips, and everything bends at real joints.

   Fur comes from the procedural 'fur' texture: dense strands
   running along the body, clumping, hide-tone patches and pale
   guard hairs, with the strand field driving the normal map so
   raking light shimmers across the coat.

   The brain (graze -> wander -> alert -> flee, herds, fawns that
   shadow their mothers, blinking, ear and tail flicks) carries
   over from v1 unchanged.

   Convention: yaw 0 faces +Z; forward is (sin yaw, 0, cos yaw).
   ============================================================ */

/* Proportions are taken from the real animals. Whitetail reference
   (a mature buck): shoulder height ~0.95m, torso ~1.15m, chest girth depth
   ~0.47m but only ~0.32m WIDE — deer are slab-sided, not barrels — a long
   ~0.55m neck carried high, a ~0.29m wedge head, and thin legs whose cannon
   bones are barely 5cm across. bodyW/bodyD are half-width/half-depth. */
/* Dimensions are the published biometrics of the real animals, the same way
   the AAA hunting games author theirs.
   Whitetail (Odocoileus virginianus), mature buck at k=1.0:
     shoulder 0.98m (recorded range 0.90-1.05, trophies to ~1.07)
     nose-to-tail-base ~1.9m, tail 0.30m  (total length range 1.52-2.13m)
     chest ~0.45m deep but only ~0.28m wide; cannon bone ~3.4cm across
     neck 0.50m; head 0.30m; ears ~0.16m; flat-out gallop ~13 m/s
   Eastern cottontail at k=1.0: 0.43m long, ~0.17m at the shoulder,
     ~6cm ears, ~7.5 m/s in the zigzag sprint. */
/* Every species, at its own measurements.

   `shoulder` is withers height in metres and everything else is in metres
   too, taken from published field measurements rather than scaled off one
   another: a coyote is not a small wolf and a black bear is not a small
   grizzly, and the differences — the grizzly's shoulder hump and dished
   face, the fox's tail being a third of its length, the boar's mass sitting
   forward over its shoulders — are exactly what makes each one recognisable
   at two hundred metres.

   `bodyLen` is the trunk, rump to point of shoulder, not nose to tail.
   `bodyW` and `bodyD` are half-width and half-depth at the chest. */
const ANIMAL_SPECIES = {
  /* --- deer --- */
  whitetailDeer: {
    shoulder: 0.98, bodyLen: 1.08, bodyW: 0.14, bodyD: 0.225,
    neckLen: 0.38, headLen: 0.3, earScale: 1.0, tailLen: 0.3, legW: 0.017,
    furLen: 0.038, shells: 14, antlers: true, antlerMax: 5,
    coat: { male: 0xa08454, female: 0xab9060, young: 0xb59a68 },
    texture: { male: 'furDeer', female: 'furDeer', young: 'furFawn' },
    walkSpeed: 1.2, runSpeed: 13.4, gait: 'quad',
    alertR: 6.5, safeR: 16, grazes: true,
  },
  muleDeer: {
    // The ears are the whole point of the name: nearly twice a whitetail's.
    shoulder: 1.02, bodyLen: 1.14, bodyW: 0.15, bodyD: 0.235,
    neckLen: 0.4, headLen: 0.31, earScale: 1.75, tailLen: 0.2, legW: 0.018,
    furLen: 0.04, shells: 14, antlers: true, antlerMax: 4,
    coat: { male: 0x9a8a70, female: 0xa39279, young: 0xb0a184 },
    texture: { male: 'furDeer', female: 'furDeer', young: 'furFawn' },
    walkSpeed: 1.2, runSpeed: 12.5, gait: 'quad',
    alertR: 8, safeR: 20, grazes: true,
  },
  elk: {
    // Half a tonne, with a neck and mane that read as elk from a mile off.
    shoulder: 1.38, bodyLen: 1.7, bodyW: 0.25, bodyD: 0.38,
    neckLen: 0.58, headLen: 0.46, earScale: 1.15, tailLen: 0.12, legW: 0.03,
    furLen: 0.05, shells: 14, antlers: true, antlerMax: 6, mane: 0.5,
    coat: { male: 0x8a6f48, female: 0x967d56, young: 0xa88e63 },
    texture: { male: 'furDeer', female: 'furDeer', young: 'furFawn' },
    walkSpeed: 1.4, runSpeed: 12.0, gait: 'quad',
    alertR: 9, safeR: 24, grazes: true,
  },

  /* --- bears --- */
  grizzlyBear: {
    // The shoulder hump is muscle for digging and it is the field mark.
    shoulder: 1.02, bodyLen: 1.35, bodyW: 0.29, bodyD: 0.33,
    neckLen: 0.24, headLen: 0.4, earScale: 0.45, tailLen: 0.07, legW: 0.052,
    furLen: 0.06, shells: 16, bushyTail: 1.2, hump: 0.16, dishedFace: true,
    coat: { male: 0x7d6144, female: 0x8a6e50, young: 0x93785c },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.3, runSpeed: 15.6, gait: 'quad',
    alertR: 8, safeR: 20, grazes: true,
  },
  blackBear: {
    // Smaller, no hump, and a straight profile instead of a dished one.
    shoulder: 0.88, bodyLen: 1.12, bodyW: 0.23, bodyD: 0.27,
    neckLen: 0.22, headLen: 0.34, earScale: 0.72, tailLen: 0.08, legW: 0.042,
    furLen: 0.055, shells: 15, bushyTail: 1.2, hump: 0,
    coat: { male: 0x3a332c, female: 0x433b33, young: 0x4a423a },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.2, runSpeed: 13.9, gait: 'quad',
    alertR: 7, safeR: 18, grazes: true,
  },

  /* --- dogs --- */
  grayWolf: {
    // Long legs, deep narrow chest, and a chest that is deeper than it is
    // wide — the build of an animal that trots twenty miles in a night.
    shoulder: 0.78, bodyLen: 0.82, bodyW: 0.115, bodyD: 0.21,
    neckLen: 0.26, headLen: 0.27, earScale: 0.62, tailLen: 0.42, legW: 0.022,
    furLen: 0.05, shells: 14, bushyTail: 1.75,
    coat: { male: 0x6b6359, female: 0x776e63, young: 0x5a544c },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.5, runSpeed: 16.5, gait: 'quad',
    alertR: 9, safeR: 22, grazes: false,
  },
  coyote: {
    shoulder: 0.58, bodyLen: 0.62, bodyW: 0.08, bodyD: 0.14,
    neckLen: 0.2, headLen: 0.22, earScale: 0.85, tailLen: 0.36, legW: 0.015,
    furLen: 0.04, shells: 12, bushyTail: 1.5,
    coat: { male: 0x907a58, female: 0x9a8564, young: 0x86745a },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.4, runSpeed: 18, gait: 'quad',
    alertR: 9, safeR: 20, grazes: false,
  },
  redFox: {
    // A third of it is tail, and the tail is most of the silhouette.
    shoulder: 0.4, bodyLen: 0.46, bodyW: 0.055, bodyD: 0.095,
    neckLen: 0.14, headLen: 0.17, earScale: 1.15, tailLen: 0.4, legW: 0.009,
    furLen: 0.045, shells: 13, bushyTail: 2.4,
    coat: { male: 0x9c5527, female: 0xa25f31, young: 0x7d6f56 },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.2, runSpeed: 13, gait: 'quad',
    alertR: 8, safeR: 16, grazes: false,
  },

  /* --- cats --- */
  cougar: {
    // The tail is nearly as long as the body and it is how you tell one
    // from a large dog at distance.
    shoulder: 0.72, bodyLen: 0.9, bodyW: 0.115, bodyD: 0.18,
    neckLen: 0.2, headLen: 0.24, earScale: 0.5, tailLen: 0.78, legW: 0.024,
    furLen: 0.022, shells: 9, bushyTail: 1.2,
    coat: { male: 0xa98e64, female: 0xb0976e, young: 0xa89372 },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.3, runSpeed: 22, gait: 'quad',
    alertR: 10, safeR: 22, grazes: false,
  },
  bobcat: {
    // The bobbed tail is the name and the field mark.
    shoulder: 0.5, bodyLen: 0.6, bodyW: 0.08, bodyD: 0.125,
    neckLen: 0.13, headLen: 0.18, earScale: 0.95, tailLen: 0.15, legW: 0.015,
    furLen: 0.035, shells: 11, bushyTail: 1.3,
    coat: { male: 0xa88a62, female: 0xb0946c, young: 0xa08a6c },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.1, runSpeed: 15, gait: 'quad',
    alertR: 9, safeR: 18, grazes: false,
  },

  /* --- pigs --- */
  wildBoar: {
    // All the mass is forward: a wedge with the point at the snout, a
    // shoulder shield of gristle, and hindquarters that look borrowed.
    shoulder: 0.82, bodyLen: 0.98, bodyW: 0.2, bodyD: 0.3,
    neckLen: 0.1, headLen: 0.4, earScale: 0.6, tailLen: 0.22, legW: 0.026,
    furLen: 0.04, shells: 11, bushyTail: 0.45, frontHeavy: 0.22, tusks: true,
    coat: { male: 0x4a3f33, female: 0x55493c, young: 0x8a6a48 },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.1, runSpeed: 11, gait: 'quad',
    alertR: 7, safeR: 16, grazes: true,
  },

  /* --- small mammals --- */
  cottontailRabbit: {
    shoulder: 0.2, bodyLen: 0.3, bodyW: 0.07, bodyD: 0.095,
    neckLen: 0.05, headLen: 0.1, earScale: 1.5, tailLen: 0.05, legW: 0.011,
    furLen: 0.022, shells: 10, bushyTail: 1.6,
    coat: { male: 0x9c8768, female: 0xa8946f, young: 0xb4a17e },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 0.6, runSpeed: 12, gait: 'hop',
    alertR: 4.5, safeR: 10, grazes: true,
  },
  graySquirrel: {
    shoulder: 0.11, bodyLen: 0.14, bodyW: 0.035, bodyD: 0.045,
    neckLen: 0.03, headLen: 0.06, earScale: 0.8, tailLen: 0.22, legW: 0.006,
    furLen: 0.014, shells: 9, bushyTail: 3.0,
    coat: { male: 0x8a8a86, female: 0x94948f, young: 0x7e7e7a },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 0.5, runSpeed: 8, gait: 'hop',
    alertR: 4, safeR: 9, grazes: true,
  },
  raccoon: {
    shoulder: 0.3, bodyLen: 0.45, bodyW: 0.09, bodyD: 0.13,
    neckLen: 0.08, headLen: 0.14, earScale: 0.8, tailLen: 0.26, legW: 0.013,
    furLen: 0.04, shells: 12, bushyTail: 1.8, mask: true,
    coat: { male: 0x6e6860, female: 0x777168, young: 0x6a655e },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 0.7, runSpeed: 6.7, gait: 'quad',
    alertR: 5, safeR: 12, grazes: true,
  },
  opossum: {
    shoulder: 0.2, bodyLen: 0.4, bodyW: 0.07, bodyD: 0.1,
    neckLen: 0.05, headLen: 0.13, earScale: 0.75, tailLen: 0.32, legW: 0.009,
    furLen: 0.035, shells: 10, bushyTail: 0.4,
    coat: { male: 0x9a958c, female: 0xa29d94, young: 0x8e8980 },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 0.5, runSpeed: 3.3, gait: 'quad',
    alertR: 4, safeR: 9, grazes: true,
  },

  /* --- stock --- */
  cattle: {
    shoulder: 1.38, bodyLen: 1.72, bodyW: 0.3, bodyD: 0.42,
    neckLen: 0.42, headLen: 0.5, earScale: 0.6, tailLen: 0.75, legW: 0.046,
    furLen: 0.02, shells: 8, bushyTail: 0.5, horns: true, hairTail: true,
    coat: { male: 0x6b4a33, female: 0x7d5b3f, young: 0x8a6a4a },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.0, runSpeed: 11, gait: 'quad',
    alertR: 6, safeR: 14, grazes: true,
  },
  horse: {
    shoulder: 1.55, bodyLen: 1.8, bodyW: 0.27, bodyD: 0.42,
    neckLen: 0.72, headLen: 0.6, earScale: 0.42, tailLen: 0.85, legW: 0.044,
    furLen: 0.012, shells: 7, bushyTail: 0.5, mane: 0.9, hairTail: true,
    coat: { male: 0x6f5238, female: 0x7c6144, young: 0x8a7052 },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 1.6, runSpeed: 16, gait: 'quad',
    alertR: 8, safeR: 18, grazes: true,
  },

  /* --- birds ---
     Built on the same loft, with the body carried horizontally on two
     legs and the neck rising off the front of it. The proportions are the
     bird's own; what makes it read as a bird rather than a short mammal is
     the upright neck, the tail fan and the absence of a muzzle. */
  wildTurkey: {
    shoulder: 0.55, bodyLen: 0.45, bodyW: 0.12, bodyD: 0.18,
    neckLen: 0.3, headLen: 0.11, earScale: 0.05, tailLen: 0.38, legW: 0.013,
    furLen: 0.016, shells: 7, bushyTail: 1.0, bird: true, fanTail: 1.25, wattle: true,
    coat: { male: 0x6b5334, female: 0x6f5f45, young: 0x8a7a5e },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 0.8, runSpeed: 7.5, gait: 'biped',
    alertR: 8, safeR: 18, grazes: true,
  },
  mallardDuck: {
    shoulder: 0.22, bodyLen: 0.3, bodyW: 0.075, bodyD: 0.1,
    neckLen: 0.13, headLen: 0.09, earScale: 0.05, tailLen: 0.1, legW: 0.008,
    furLen: 0.01, shells: 6, bushyTail: 1.0, bird: true, bill: 1.6,
    coat: { male: 0x5a7a5c, female: 0x9a8460, young: 0xa89a74 },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 0.5, runSpeed: 4, gait: 'biped',
    alertR: 7, safeR: 16, grazes: true,
  },
  canadaGoose: {
    shoulder: 0.42, bodyLen: 0.5, bodyW: 0.11, bodyD: 0.15,
    neckLen: 0.34, headLen: 0.11, earScale: 0.05, tailLen: 0.13, legW: 0.011,
    furLen: 0.012, shells: 6, bushyTail: 1.0, bird: true, bill: 1.3,
    coat: { male: 0x877c66, female: 0x8d8370, young: 0x9e9581 },
    texture: { male: 'furCoat', female: 'furCoat', young: 'furCoat' },
    walkSpeed: 0.6, runSpeed: 5, gait: 'biped',
    alertR: 9, safeR: 20, grazes: true,
  },
};

/* Aliases, so the four original archetype names still resolve. */
ANIMAL_SPECIES.deer = ANIMAL_SPECIES.whitetailDeer;
ANIMAL_SPECIES.bear = ANIMAL_SPECIES.grizzlyBear;
ANIMAL_SPECIES.lion = ANIMAL_SPECIES.cougar;
ANIMAL_SPECIES.rabbit = ANIMAL_SPECIES.cottontailRabbit;

/* ---------------- sex and age as shape, not scale ----------------

   A female is not a small male and a fawn is not a small deer. The
   differences are in the proportions, and they are the difference between
   an animal you believe and a toy:

   A rutting buck's neck swells by a third and his chest deepens; a doe
   keeps a slender neck all year. A boar is half again the weight of a sow
   and carries it all in the forequarters. In bears the male is the larger
   by half.

   A young animal is born with its legs nearly the length it will need —
   a fawn has to outrun things on day one — while its body, neck and muzzle
   are still short and its head and ears are outsized. That combination is
   what makes a fawn look like a fawn rather than a small deer, and getting
   it wrong is what makes game animals look like toys. */
const SEX_FORM = {
  male: {
    ungulate: { scale: 1.06, neckW: 1.3, bodyD: 1.06, neckLen: 1.03 },
    bear: { scale: 1.18, neckW: 1.22, bodyD: 1.1, bodyW: 1.1 },
    canid: { scale: 1.08, neckW: 1.12, bodyD: 1.03 },
    cat: { scale: 1.12, neckW: 1.18, bodyD: 1.05 },
    pig: { scale: 1.14, neckW: 1.25, bodyD: 1.12, bodyW: 1.12 },
    bird: { scale: 1.22, neckW: 1.1 },
    default: { scale: 1.05, neckW: 1.1 },
  },
  female: {
    ungulate: { scale: 0.93, neckW: 0.86, bodyD: 0.97 },
    bear: { scale: 0.84, neckW: 0.9, bodyD: 0.96 },
    canid: { scale: 0.93, neckW: 0.92 },
    cat: { scale: 0.9, neckW: 0.88 },
    pig: { scale: 0.88, neckW: 0.86, bodyD: 0.94 },
    bird: { scale: 0.86, neckW: 0.95 },
    default: { scale: 0.94, neckW: 0.92 },
  },
};

/* Multipliers on the adult form, by life stage. `legFrac` is how much of
   the adult leg length the animal already has — the number that makes a
   young animal read as leggy rather than merely small. */
const STAGE_FORM = {
  young: {
    scale: 0.42, legFrac: 0.74, headScale: 1.42, muzzle: 0.6,
    neckLen: 0.68, earScale: 1.3, bodyLen: 0.82, furLen: 1.25, antlers: 0,
  },
  juvenile: {
    scale: 0.72, legFrac: 0.93, headScale: 1.14, muzzle: 0.85,
    neckLen: 0.88, earScale: 1.1, bodyLen: 0.93, furLen: 1.1, antlers: 0.3,
  },
  adult: { scale: 1, legFrac: 1, headScale: 1, muzzle: 1, neckLen: 1, earScale: 1, bodyLen: 1, furLen: 1, antlers: 0.75 },
  prime: { scale: 1.07, legFrac: 1, headScale: 1.04, muzzle: 1.05, neckLen: 1.04, earScale: 1, bodyLen: 1.05, furLen: 1, antlers: 1 },
  old: { scale: 1.03, legFrac: 1, headScale: 1.05, muzzle: 1.08, neckLen: 1, earScale: 1, bodyLen: 1.02, furLen: 0.92, antlers: 0.8 },
};

/* Which dimorphism table a species uses. */
const FORM_CLASS = {
  whitetailDeer: 'ungulate', muleDeer: 'ungulate', elk: 'ungulate',
  cattle: 'ungulate', horse: 'ungulate',
  grizzlyBear: 'bear', blackBear: 'bear',
  grayWolf: 'canid', coyote: 'canid', redFox: 'canid',
  cougar: 'cat', bobcat: 'cat',
  wildBoar: 'pig',
  wildTurkey: 'bird', mallardDuck: 'bird', canadaGoose: 'bird',
  cottontailRabbit: 'default', graySquirrel: 'default',
  raccoon: 'default', opossum: 'default',
};

/* How strongly a class of animal angulates its limbs. A standing
   quadruped's legs are not four vertical posts: the forelimb drops from
   the elbow to a carpus set slightly forward and then back to a fetlock
   under the elbow, and the hindlimb makes a pronounced Z — stifle
   forward, hock well back, cannon vertical. That zig-zag is most of what
   makes a silhouette read as an animal rather than a table, and it is
   what stores and returns the energy of a stride.

   Bears are plantigrade and stand comparatively straight and heavy;
   canids and cats are the most angulated things on four legs; the
   cursorial ungulates sit in between. */
const LIMB_ANGLE = {
  ungulate: 1, canid: 1.3, cat: 1.35, bear: 0.42, pig: 0.75,
  bird: 0.5, default: 0.95,
};

/* Build the effective proportions for one individual: its species, its
   sex and its age, combined. Everything downstream — the skeleton, the
   loft, the fur, the antlers — reads this rather than the species table,
   so an animal is shaped by who it is. */
function resolveForm(speciesId, opts = {}) {
  const base = ANIMAL_SPECIES[speciesId] || ANIMAL_SPECIES.whitetailDeer;
  const cls = FORM_CLASS[speciesId] || 'default';
  const stage = STAGE_FORM[opts.stage] || STAGE_FORM.adult;
  const sexTable = SEX_FORM[opts.sex === 'female' ? 'female' : 'male'];
  const sex = (sexTable && (sexTable[cls] || sexTable.default)) || {};

  const f = Object.assign({}, base);
  const m = (v, ...muls) => muls.reduce((acc, x) => acc * (x == null ? 1 : x), v);

  /* Legs keep their own fraction so a young animal stands nearly as tall
     as it will as an adult while the rest of it is still small. */
  const bodyScale = stage.scale * (sex.scale || 1);
  f.shoulder = base.shoulder * stage.legFrac * (sex.scale || 1)
    * (0.45 + 0.55 * stage.scale / Math.max(0.01, stage.legFrac));
  f.bodyLen = m(base.bodyLen, bodyScale, stage.bodyLen);
  f.bodyW = m(base.bodyW, bodyScale, sex.bodyW);
  f.bodyD = m(base.bodyD, bodyScale, sex.bodyD);
  f.neckLen = m(base.neckLen, bodyScale, stage.neckLen, sex.neckLen);
  f.neckW = m(1, sex.neckW);
  f.headLen = m(base.headLen, bodyScale, stage.headScale);
  f.muzzle = stage.muzzle;
  f.earScale = m(base.earScale, stage.earScale);
  f.tailLen = m(base.tailLen, bodyScale);
  f.legW = m(base.legW, bodyScale, sex.scale);
  f.furLen = m(base.furLen, bodyScale, stage.furLen);
  f.antlerFrac = base.antlers && opts.sex === 'male' ? stage.antlers : 0;
  f.limbAngle = base.limbAngle != null ? base.limbAngle : (LIMB_ANGLE[cls] || LIMB_ANGLE.default);
  f.formClass = cls;
  f.stage = opts.stage || 'adult';
  f.sexKey = opts.stage === 'young' ? 'young' : (opts.sex === 'female' ? 'female' : 'male');
  return f;
}

/* Yearling / mature / trophy — the same three tiers the hunting games use. */
const ANIMAL_SIZES = { small: 0.85, medium: 1.0, large: 1.12 };
const ANTLER_POINTS = { small: 2, medium: 4, large: 6 };

/* ---------------- skeleton ---------------- */

function makeQuadSkeleton(sp, k) {
  const W = sp.bodyW * k, D = sp.bodyD * k, BL = sp.bodyLen * k, NL = sp.neckLen * k, HL = sp.headLen * k;
  // The shoulder measurement is to the TOP of the withers; the spine line
  // sits half a chest below it, and the legs own everything under the belly.
  const spineY = sp.shoulder * k - D * 0.45;
  // A bird's legs leave the body further under it and further down, so the
  // drop to the ground is measured from there and not from the flank.
  const legTop = spineY - D * (sp.bird ? 0.42 : 0.35);
  const upper = legTop * 0.52, lower = legTop * 0.46;
  const B = [];
  const bone = (name, parent, pos) => { B.push([name, parent, pos]); return B.length - 1; };

  const hips = bone('hips', -1, [0, spineY, -BL * 0.34]);
  const spine = bone('spine', hips, [0, 0.01 * k, BL * 0.3]);
  const chest = bone('chest', spine, [0, 0.01 * k, BL * 0.3]);
  // A deer's neck leaves the chest at ~55 degrees and is over half a metre
  // long — most of what makes the silhouette read "deer" lives here.
  const neck1 = bone('neck1', chest, sp.bird ? [0, D * 0.8, BL * 0.02] : [0, D * 0.5, BL * 0.1]);
  const neck2 = bone('neck2', neck1, sp.bird ? [0, NL * 0.56, NL * 0.1] : [0, NL * 0.36, NL * 0.32]);
  const head = bone('head', neck2, sp.bird ? [0, NL * 0.46, NL * 0.16] : [0, NL * 0.34, NL * 0.32]);
  // A beak leaves the skull level and forward; a muzzle drops off it.
  bone('muzzle', head, sp.bird ? [0, -HL * 0.02, HL * 0.95] : [0, -HL * 0.08, HL * 0.65]);
  bone('earL', head, [HL * 0.3, HL * 0.42, -HL * 0.14]);
  bone('earR', head, [-HL * 0.3, HL * 0.42, -HL * 0.14]);
  /* The tail is set high on the croup and at the BACK of it: rooted at
     hips.z - BL*0.2 the whole thing lived inside the rump, which is why
     every canid in the game had a 12cm stub instead of the brush that is
     half the animal's outline. It leaves the body going back and down. */
  const tail1 = bone('tail1', hips, [0, D * 0.5, -BL * 0.3]);
  // A bird's tail streams BACK off the body; a mammal's hangs down.
  bone('tail2', tail1, sp.bird
    ? [0, sp.tailLen * k * 0.18, -sp.tailLen * k * 0.96]
    : [0, -sp.tailLen * k * 0.62, -sp.tailLen * k * 0.78]);
  /* The zig-zag. Only the z offsets change — the vertical drops still sum
     to the same leg length, so angulating a species does not quietly make
     it taller or shorter than its measured shoulder height. */
  const ang = sp.limbAngle != null ? sp.limbAngle : 1;
  const A = legTop * ang;
  for (const side of [1, -1]) {
    const s = side > 0 ? 'L' : 'R';
    /* The off-side pair is set slightly out of step. A real standing
       animal never squares all four feet into one plane, and when it did
       here the far legs hid exactly behind the near ones and every animal
       in the game read, broadside, as a two-legged thing. */
    const stag = side > 0 ? 0 : legTop * 0.15;
    if (sp.bird) {
      /* A bird keeps the same bone names so the skinning, the animator
         and the sign system need know nothing about it — but the FRONT
         pair is a folded wing, not a leg, and the rear pair carries the
         whole animal from under its centre of mass rather than from the
         back of it. The ankle is the joint that bends backwards; what
         looks like a knee is buried in the body feathers. */
      const fu = bone('fUp' + s, chest, [side * W * 1.06, D * 0.22, -BL * 0.06]);
      const fl = bone('fLo' + s, fu, [side * W * 0.16, -D * 0.16, -BL * 0.3]);
      bone('fFt' + s, fl, [0, -D * 0.06, -BL * 0.26]);
      const ru = bone('rUp' + s, hips, [side * W * 0.34, -D * 0.42, BL * 0.14 + stag * 1.4]);
      const rl = bone('rLo' + s, ru, [0, -upper, -A * 0.3]);
      bone('rFt' + s, rl, [0, -lower, A * 0.3]);
      continue;
    }
    const fu = bone('fUp' + s, chest, [side * W * 0.6, -D * 0.35, BL * 0.05 - stag]);
    // Forearm down and slightly forward to the carpus, then the cannon
    // back so the foot plants under the elbow, not out in front of it.
    const fl = bone('fLo' + s, fu, [0, -upper, A * 0.075]);
    bone('fFt' + s, fl, [0, -lower, -A * 0.055]);
    const ru = bone('rUp' + s, hips, [side * W * 0.62, -D * 0.3, -BL * 0.03 + stag]);
    // Hock set well behind the hip, cannon swinging forward under it.
    const rl = bone('rLo' + s, ru, [0, -upper, -A * 0.2]);
    bone('rFt' + s, rl, [0, -lower, A * 0.155]);
  }
  return new Skeleton(B.map(([n, p, pos]) => new Bone(n, p, pos, null)));
}

/* ---------------- sculpt ---------------- */

/* The body is ONE continuous lofted surface from the rump, along the spine,
   up the neck and out to the nose — no seams anywhere on the animal's
   centreline. Each station along that path is a superellipse cross-section
   with a muscle-shaping function on top: haunch and shoulder bulges, the
   brisket keel, a subtle spine ridge. Legs, ears and tail are lofted tubes
   whose roots are buried inside the body.

   UV layout (the coat texture depends on it): u wraps each ring with u=0 at
   the spine; v runs rump 0.02 -> nose 0.78; legs use 0.80-0.955 with hooves
   at 0.955-0.97; ears sit at 0.985. */

/* How far a coat stands off the skin, as a multiple of the species' guard
   hair length. Deliberately over 1: biologically accurate 3-4cm guard hair
   is invisible as volume at normal camera distance, it only reads in
   extreme macro, so games exaggerate shell length. The per-vertex mask
   below keeps that exaggeration off the thin parts. */
const FUR_SHELL_SCALE = 0.85;

function bodyLoft(g, stations, segs) {
  const right = new Vec3(1, 0, 0);
  const tan = new Vec3(), up = new Vec3();
  const rows = [];
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const prev = stations[Math.max(0, i - 1)], next = stations[Math.min(stations.length - 1, i + 1)];
    tan.subVectors(next.p, prev.p);
    if (tan.lengthSq() < 1e-10) tan.set(0, 0, 1);
    tan.normalize();
    up.crossVectors(tan, right).normalize();
    const e = st.e || 2.2;
    const row = [];
    if (g.thick) g.trackThickness(Math.min(st.w, st.d));
    for (let sIdx = 0; sIdx <= segs; sIdx++) {
      const a = (sIdx / segs) * TAU;              // 0 = spine, PI = belly
      const sa = Math.sin(a), ca = Math.cos(a);
      const rx = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e) * st.w;
      const ry = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e) * st.d;
      const m = st.shape ? st.shape(a) : 1;
      const x = st.p.x + right.x * rx * m + up.x * ry * m;
      const y = st.p.y + right.y * rx * m + up.y * ry * m;
      const z = st.p.z + right.z * rx * m + up.z * ry * m;
      const idx = g.positions.length / 3;
      g.vert(x, y, z, right.x * sa + up.x * ca, right.y * sa + up.y * ca, right.z * sa + up.z * ca, sIdx / segs, st.uv);
      row.push(idx);
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let sIdx = 0; sIdx < segs; sIdx++) {
      g.quad(rows[i][sIdx], rows[i][sIdx + 1], rows[i + 1][sIdx + 1], rows[i + 1][sIdx]);
    }
  }
  // Cap both ends with fans to the station centres.
  const capFan = (row, st, flip) => {
    const ci = g.positions.length / 3;
    if (g.thick) g.trackThickness(Math.min(st.w, st.d));
    g.vert(st.p.x, st.p.y, st.p.z, 0, flip ? -0.5 : 0.5, flip ? -0.8 : 0.8, 0.5, st.uv);
    for (let sIdx = 0; sIdx < segs; sIdx++) {
      if (flip) g.tri(ci, row[sIdx + 1], row[sIdx]);
      else g.tri(ci, row[sIdx], row[sIdx + 1]);
    }
  };
  capFan(rows[0], stations[0], true);
  capFan(rows[rows.length - 1], stations[stations.length - 1], false);
}

/* Wrap-aware gaussian bump on a ring angle, for muscle shaping. */
function angBump(a, centre, width, amp) {
  let d = Math.abs(a - centre);
  if (d > PI) d = TAU - d;
  return amp * Math.exp(-(d * d) / (width * width));
}

function makeQuadGeometry(skeleton, sp, k, opts = {}) {
  const g = new Geometry();
  /* The coat texture is an atlas — v names a band (body, leg, hoof, ear),
     so the uv must arrive at the sampler exactly as written here. */
  g.uvScale = 1;
  g.trackThickness(1);
  const W = sp.bodyW * k, D = sp.bodyD * k, BL = sp.bodyLen * k, NL = sp.neckLen * k, HL = sp.headLen * k;
  // How thick this individual's neck is: a rutting buck's swells by a third.
  const NW = sp.neckW != null ? sp.neckW : 1;
  const P = (name) => { const v = new Vec3(); skeleton.bones[skeleton.index(name)].bindMatrix.getTranslation(v); return v; };

  const hips = P('hips'), chest = P('chest'), neck1 = P('neck1');
  const headP = P('head'), muzzle = P('muzzle'), tail1 = P('tail1'), tail2 = P('tail2');
  const spineY = hips.y;

  /* Anatomy as angular shaping functions, not just ellipses: each is a set
     of wrap-aware gaussian bumps over the ring angle (0 = spine). */
  const haunch = (a) => 1 + angBump(a, PI * 0.62, 0.55, 0.16) + angBump(a, TAU - PI * 0.62, 0.55, 0.16) + angBump(a, 0, 0.35, -0.05);
  const croup = (a) => 1 + angBump(a, PI * 0.55, 0.6, 0.1) + angBump(a, TAU - PI * 0.55, 0.6, 0.1);
  const waist = (a) => 1 + angBump(a, 0, 0.4, -0.06) + angBump(a, PI, 0.7, -0.03);
  const brisket = (a) => 1 + angBump(a, PI, 0.5, 0.14) + angBump(a, 0, 0.35, -0.04);
  const shoulderS = (a) => 1 + angBump(a, PI * 0.42, 0.42, 0.11) + angBump(a, TAU - PI * 0.42, 0.42, 0.11);
  const withers = (a) => 1 + angBump(a, 0, 0.3, 0.09);
  const throat = (a) => 1 + angBump(a, PI, 0.6, 0.07);
  const jaw = (a) => 1 + angBump(a, PI * 0.72, 0.5, 0.13) + angBump(a, TAU - PI * 0.72, 0.5, 0.13);
  const brow = (a) => 1 + angBump(a, PI * 0.3, 0.35, 0.07) + angBump(a, TAU - PI * 0.3, 0.35, 0.07);

  const np = (t) => new Vec3().copy(neck1).lerp(headP, t);
  const hp = (t) => new Vec3().copy(headP).lerp(muzzle, t);
  const st = (p, w, d, uv, shape, e) => ({ p, w, d, uv, shape, e });

  /* A bird's centreline is a different animal: a deep plump body carried
     level, a steeply rising neck with no throat swell and no jaw, and a
     beak that leaves the skull pointing forward instead of a muzzle that
     drops off it. Same loft, same UV atlas, same bones — a different set
     of stations. */
  if (sp.bird) {
    const breast = (a) => 1 + angBump(a, PI, 0.75, 0.2) + angBump(a, 0, 0.4, -0.04);
    const back = (a) => 1 + angBump(a, 0, 0.55, 0.08);
    bodyLoft(g, [
      st(new Vec3(0, spineY + D * 0.18, hips.z - BL * 0.4), W * 0.16, D * 0.2, 0.02, null, 2.0),
      st(new Vec3(0, spineY + D * 0.1, hips.z - BL * 0.3), W * 0.6, D * 0.66, 0.05, back, 2.2),
      st(new Vec3(0, spineY + D * 0.02, hips.z - BL * 0.14), W * 0.92, D * 0.95, 0.1, back, 2.35),
      st(new Vec3(0, spineY - D * 0.02, hips.z + BL * 0.04), W * 1.0, D * 1.05, 0.15, breast, 2.4),
      st(new Vec3(0, spineY - D * 0.04, hips.z + BL * 0.22), W * 0.98, D * 1.08, 0.21, breast, 2.4),
      st(new Vec3(0, spineY - D * 0.02, chest.z), W * 0.88, D * 1.0, 0.27, breast, 2.35),
      st(new Vec3(0, spineY + D * 0.12, chest.z + BL * 0.06), W * 0.66, D * 0.78, 0.34, null, 2.2),
      st(new Vec3(0, spineY + D * 0.34, chest.z + BL * 0.05), W * 0.46, D * 0.52, 0.4, null, 2.05),
      st(np(0.18), W * 0.34 * NW, D * 0.32 * NW, 0.46, null, 2.0),
      st(np(0.42), W * 0.3 * NW, D * 0.29 * NW, 0.51, null, 2.0),
      st(np(0.66), W * 0.29 * NW, D * 0.28 * NW, 0.56, null, 2.0),
      st(np(0.88), W * 0.3, D * 0.3, 0.61, null, 2.0),
      st(hp(-0.1), HL * 0.42, HL * 0.44, 0.65, null, 2.0),
      st(hp(0.16), HL * 0.44, HL * 0.46, 0.68, brow, 2.0),
      st(hp(0.44), HL * 0.34, HL * 0.36, 0.71, null, 2.0),
      // The beak: a hard, unfeathered wedge, narrowing to a point.
      st(hp(0.62), HL * 0.2, HL * 0.22 * (sp.bill || 1), 0.745, null, 2.1),
      st(hp(0.85), HL * 0.15, HL * 0.17 * (sp.bill || 1), 0.766, null, 2.1),
      st(hp(1.04), HL * 0.05, HL * 0.06 * (sp.bill || 1), 0.778, null, 1.9),
    ], 30);
    makeBirdParts(g, skeleton, sp, k, { W, D, BL, HL, spineY, hips, chest, tail1, tail2, st });
    smoothNormals(g);
    return finishAnimalGeometry(g, skeleton, sp, k);
  }

  /* The whole centreline — rump to nose — as one dense loft. */
  bodyLoft(g, [
    st(new Vec3(0, spineY - D * 0.1, hips.z - BL * 0.36), W * 0.18, D * 0.22, 0.02, null, 2.0),
    st(new Vec3(0, spineY - D * 0.02, hips.z - BL * 0.26), W * 0.6, D * 0.68, 0.05, croup, 2.1),
    st(new Vec3(0, spineY + D * 0.02, hips.z - BL * 0.1), W * 0.9, D * 0.9, 0.09, haunch, 2.2),
    st(new Vec3(0, spineY + D * 0.01, hips.z + BL * 0.04), W * 0.97, D * 0.94, 0.13, haunch, 2.2),
    st(new Vec3(0, spineY - D * 0.02, hips.z + BL * 0.16), W * 0.9, D * 0.85, 0.18, waist, 2.2),
    st(new Vec3(0, spineY - D * 0.04, hips.z + BL * 0.28), W * 0.85, D * 0.82, 0.22, waist, 2.25),
    st(new Vec3(0, spineY - D * 0.05, chest.z - BL * 0.12), W * 0.92, D * 0.96, 0.27, brisket, 2.3),
    st(new Vec3(0, spineY - D * 0.04, chest.z), W * 0.95, D * 1.05, 0.31, brisket, 2.3),
    st(new Vec3(0, spineY + D * 0.02, chest.z + BL * 0.09), W * 0.85, D * 0.97, 0.36, shoulderS, 2.2),
    st(new Vec3(0, spineY + D * 0.1, chest.z + BL * 0.16), W * 0.68, D * 0.8, 0.4, withers, 2.1),
    st(new Vec3(0, spineY + D * 0.16, chest.z + BL * 0.21), W * 0.52, D * 0.62, 0.43, withers, 2.0),
    st(np(0.12), W * 0.84 * NW, D * 0.72 * NW, 0.48, throat, 2.0),
    st(np(0.32), W * 0.74 * NW, D * 0.62 * NW, 0.52, throat, 2.0),
    st(np(0.52), W * 0.66 * NW, D * 0.55 * NW, 0.56, null, 2.0),
    st(np(0.7), W * 0.58 * NW, D * 0.48 * NW, 0.6, null, 2.0),
    st(np(0.86), W * 0.5, D * 0.43, 0.63, null, 2.0),
    st(hp(-0.18), HL * 0.3, HL * 0.36, 0.655, jaw, 2.0),
    st(hp(0.04), HL * 0.34, HL * 0.4, 0.675, (a) => jaw(a) * brow(a), 2.0),
    st(hp(0.26), HL * 0.29, HL * 0.34, 0.695, brow, 2.0),
    st(hp(0.46), HL * 0.22, HL * 0.26, 0.715, null, 2.0),
    st(hp(0.66), HL * 0.16, HL * 0.19, 0.735, null, 1.95),
    st(hp(0.84), HL * 0.12, HL * 0.135, 0.755, null, 1.9),
    st(hp(0.98), HL * 0.09, HL * 0.1, 0.772, null, 1.85),
    st(hp(1.06), HL * 0.04, HL * 0.045, 0.778, null, 1.8),
  ], 36);

  /* Legs: 8 stations, joint bulges at knee and fetlock, root buried well
     inside the body with no cap to poke through. */
  const LW = sp.legW * k;
  const lu = (t) => 0.8 + t * 0.17;
  for (const sSide of ['L', 'R']) {
    for (const f of ['f', 'r']) {
      const up2 = P(f + 'Up' + sSide), lo = P(f + 'Lo' + sSide), ft = P(f + 'Ft' + sSide);
      const hoof = new Vec3(ft.x, 0.004, ft.z + 0.02 * k);
      const thighW = f === 'r' ? D * 0.3 : D * 0.23;
      loftRings(g, [
        { p: new Vec3(up2.x * 0.7, up2.y + D * 0.2, up2.z), w: thighW, d: thighW * 1.45, e: 2.1, uv: lu(0) },
        { p: up2.clone().lerp(lo, 0.3), w: LW * 2.0, d: LW * 2.6, e: 2.05, uv: lu(0.2) },
        { p: up2.clone().lerp(lo, 0.62), w: LW * 1.3, d: LW * 1.6, e: 2.0, uv: lu(0.38) },
        { p: lo, w: LW * 1.12, d: LW * 1.3, e: 2.0, uv: lu(0.52) },        // knee/hock
        { p: lo.clone().lerp(ft, 0.3), w: LW * 0.88, d: LW * 0.98, e: 2.0, uv: lu(0.66) },
        { p: lo.clone().lerp(ft, 0.68), w: LW * 0.8, d: LW * 0.88, e: 2.0, uv: lu(0.8) },
        { p: ft, w: LW * 1.0, d: LW * 1.1, e: 2.0, uv: lu(0.9) },          // fetlock
        { p: hoof, w: LW * 1.12, d: LW * 1.22, e: 1.6, uv: lu(1) },
      ], 22, false, true);
    }
  }

  /* Ears: rooted INSIDE the skull (start ring buried, no cap) so they grow
     out of the head instead of hovering on it. */
  const earL = P('earL'), earR = P('earR');
  const earLen = HL * 0.55 * sp.earScale;
  for (const [e2, sgn] of [[earL, 1], [earR, -1]]) {
    const root = new Vec3(e2.x - sgn * HL * 0.14, e2.y - HL * 0.16, e2.z + HL * 0.05);
    const tip = new Vec3(e2.x + sgn * earLen * 0.38, e2.y + earLen * 0.95, e2.z - earLen * 0.16);
    loftRings(g, [
      { p: root, w: HL * 0.13, d: HL * 0.1, e: 2.0, uv: 0.98 },
      { p: e2, w: HL * 0.17, d: HL * 0.08, e: 1.8, uv: 0.98 },
      { p: new Vec3().copy(e2).lerp(tip, 0.55), w: HL * 0.2, d: HL * 0.06, e: 1.8, uv: 0.98 },
      { p: tip, w: HL * 0.045, d: HL * 0.028, e: 1.8, uv: 0.98 },
    ], 10, false, true);
  }

  /* Tail: rooted inside the rump, thickening into a brush on the species
     that carry one. `bushyTail` is a multiplier on the mid-tail diameter:
     a red fox's brush is nearly as thick as its body, a deer's tail is a
     flat flag, a boar's is a string. */
  const bushy = sp.bushyTail || 1;
  const tailMid = new Vec3().copy(tail1).lerp(tail2, 0.45);
  const tailEnd = new Vec3().copy(tail1).lerp(tail2, 0.8);
  loftRings(g, [
    { p: new Vec3(tail1.x, tail1.y + D * 0.06, tail1.z + D * 0.3), w: D * 0.18, d: D * 0.2, e: 2.0, uv: 0.815 },
    { p: tail1, w: D * 0.15 * (0.6 + bushy * 0.4), d: D * 0.17 * (0.6 + bushy * 0.4), e: 2.0, uv: 0.825 },
    { p: tailMid, w: D * 0.12 * bushy, d: D * 0.14 * bushy, e: 2.0, uv: 0.84 },
    { p: tailEnd, w: D * 0.1 * bushy, d: D * 0.12 * bushy, e: 2.0, uv: 0.85 },
    { p: tail2, w: D * 0.04 * bushy, d: D * 0.05 * bushy, e: 2.0, uv: 0.86 },
  ], 12, false, true);

  /* A mane: the long hair along the crest of the neck. On a horse it is
     half the silhouette from the side, and its absence is why one read as
     a red deer with a long face. Built as a thin vertical fin standing on
     the neck's topline, from the withers to the poll. */
  if (sp.mane) {
    const crest = [];
    const MN = 7;
    for (let i = 0; i <= MN; i++) {
      const t = i / MN;
      const p = new Vec3().copy(neck1).lerp(headP, t);
      // The neck tapers toward the poll, and the hair itself is longest
      // through the middle of the crest.
      const fall = Math.sin(PI * (0.18 + t * 0.7)) * sp.mane;
      // The neck loft is centred on this line, so the crest has to clear
      // the neck's own half-depth or the whole fin ends up inside it.
      const neckHalf = D * (0.72 - t * 0.3);
      const hair = D * (0.22 + fall * 0.55);
      crest.push({
        p: new Vec3(0, p.y + neckHalf * 0.72 + hair * 0.7, p.z - D * 0.04),
        w: W * 0.08, d: hair, e: 2.6,
        uv: 0.5, right: new Vec3(1, 0, 0), fwd: new Vec3(0, 1, 0),
      });
    }
    loftRings(g, crest, 8, true, true);
  }

  /* A horse's tail, and a cow's, is a fall of long hair off a short dock,
     not a tapering tube of skin. */
  if (sp.hairTail) {
    /* The dock is buried in the croup, so the fall has to start from
       BEHIND the rump — measured off the tail bones, which already leave
       the body — or the whole tail hangs inside the haunch. */
    const dock = new Vec3().copy(tail1).lerp(tail2, 0.3);
    const tip = new Vec3(0, dock.y - sp.tailLen * k * 0.8, dock.z - sp.tailLen * k * 0.12);
    loftRings(g, [
      { p: new Vec3().copy(tail1).lerp(tail2, 0.05), w: D * 0.12, d: D * 0.14, e: 2.0, uv: 0.822 },
      { p: dock, w: D * 0.17, d: D * 0.19, e: 2.2, uv: 0.832 },
      { p: new Vec3().copy(dock).lerp(tip, 0.45), w: D * 0.18, d: D * 0.2, e: 2.2, uv: 0.842 },
      { p: new Vec3().copy(dock).lerp(tip, 0.8), w: D * 0.15, d: D * 0.16, e: 2.2, uv: 0.852 },
      { p: tip, w: D * 0.07, d: D * 0.08, e: 2.2, uv: 0.858 },
    ], 12, false, true);
  }

  smoothNormals(g);
  return finishAnimalGeometry(g, skeleton, sp, k);
}

/* Wings, legs and tail fan for a bird.

   Everything a bird has that a mammal does not comes down to three
   shapes: a folded wing lying along the flank with its primaries
   crossing over the rump, two legs that leave the body under its centre
   of mass with the ankle bending backwards, and a tail that is a flat
   spread fan rather than a tube. The bones are the mammal ones — the
   front pair is the wing, the rear pair the legs — so nothing downstream
   has to know a turkey from a deer. */
function makeBirdParts(g, skeleton, sp, k, X) {
  const { W, D, BL, HL, spineY, hips, tail1, tail2 } = X;
  const P = (name) => { const v = new Vec3(); skeleton.bones[skeleton.index(name)].bindMatrix.getTranslation(v); return v; };
  const LW = sp.legW * k;
  const lu = (t) => 0.8 + t * 0.17;

  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? 1 : -1;

    /* The wing: a flat blade, thick at the shoulder, tapering through the
       elbow to the primaries. Folded, it lies along the flank and its tip
       reaches past the rump — which is the line that reads "bird" on a
       standing silhouette more than anything else does. */
    const wu = P('fUp' + side), wl = P('fLo' + side), wf = P('fFt' + side);
    loftRings(g, [
      { p: new Vec3(wu.x - sgn * W * 0.3, wu.y - D * 0.1, wu.z + BL * 0.04), w: D * 0.16, d: D * 0.3, e: 2.2, uv: 0.2 },
      { p: wu, w: D * 0.11, d: D * 0.34, e: 2.4, uv: 0.22 },
      { p: new Vec3().copy(wu).lerp(wl, 0.55), w: D * 0.08, d: D * 0.32, e: 2.6, uv: 0.24 },
      { p: wl, w: D * 0.06, d: D * 0.26, e: 2.8, uv: 0.26 },
      { p: new Vec3().copy(wl).lerp(wf, 0.6), w: D * 0.04, d: D * 0.19, e: 3.0, uv: 0.28 },
      { p: wf, w: D * 0.015, d: D * 0.09, e: 3.0, uv: 0.3 },
    ], 12, false, true);

    /* The leg. Bare scaly tarsus below the feathered thigh, and a foot
       that is a flat three-toed plate, not a hoof. */
    const up = P('rUp' + side), lo = P('rLo' + side), ft = P('rFt' + side);
    const toe = new Vec3(ft.x, 0.006 * k, ft.z + LW * 5.5);
    loftRings(g, [
      { p: new Vec3(up.x * 0.6, up.y + D * 0.3, up.z), w: D * 0.22, d: D * 0.3, e: 2.1, uv: lu(0) },
      { p: new Vec3().copy(up).lerp(lo, 0.35), w: LW * 2.4, d: LW * 2.8, e: 2.05, uv: lu(0.22) },
      { p: new Vec3().copy(up).lerp(lo, 0.75), w: LW * 1.5, d: LW * 1.8, e: 2.0, uv: lu(0.44) },
      { p: lo, w: LW * 1.2, d: LW * 1.4, e: 2.0, uv: lu(0.56) },           // ankle
      { p: new Vec3().copy(lo).lerp(ft, 0.5), w: LW * 0.85, d: LW * 0.95, e: 2.0, uv: lu(0.74) },
      { p: ft, w: LW * 0.9, d: LW * 1.0, e: 2.0, uv: lu(0.9) },
      { p: toe, w: LW * 1.6, d: LW * 0.4, e: 3.0, uv: lu(1) },             // splayed toes
    ], 14, false, true);
  }

  /* The tail fan. A tube would be a rat's tail; a bird's rectrices are a
     single flat spread, wider at the tip than at the root. */
  const fan = sp.fanTail || 1.0;
  /* The ring frame has to be given explicitly. Derived from the path, a
     tail running almost straight backwards picks UP as its width axis and
     the fan comes out as a vertical sail; the rectrices spread sideways
     and the fan is thin top-to-bottom. */
  const fanR = new Vec3(1, 0, 0), fanF = new Vec3(0, 1, 0);
  const fanRing = (p, w, d, uv) => ({ p, w, d, e: 3.0, uv, right: fanR, fwd: fanF });
  loftRings(g, [
    fanRing(new Vec3(0, tail1.y - D * 0.06, tail1.z + D * 0.24), W * 0.5, D * 0.4, 0.815),
    fanRing(tail1, W * 0.6, D * 0.3, 0.825),
    fanRing(new Vec3().copy(tail1).lerp(tail2, 0.4), W * 0.85 * fan, D * 0.15, 0.84),
    fanRing(new Vec3().copy(tail1).lerp(tail2, 0.78), W * 1.05 * fan, D * 0.09, 0.852),
    fanRing(tail2, W * 1.1 * fan, D * 0.06, 0.86),
  ], 14, false, true);

  /* A turkey's caruncled head and the wattle under its chin: bare red
     skin, and the one thing that says "turkey" at any distance. */
  if (sp.wattle) {
    const head = P('head'), muzzle = P('muzzle');
    const chin = new Vec3().copy(head).lerp(muzzle, 0.25);
    loftRings(g, [
      { p: new Vec3(chin.x, chin.y - HL * 0.1, chin.z), w: HL * 0.16, d: HL * 0.14, e: 2.0, uv: 0.69 },
      { p: new Vec3(chin.x, chin.y - HL * 0.55, chin.z - HL * 0.08), w: HL * 0.19, d: HL * 0.12, e: 2.0, uv: 0.7 },
      { p: new Vec3(chin.x, chin.y - HL * 1.0, chin.z - HL * 0.12), w: HL * 0.1, d: HL * 0.07, e: 2.0, uv: 0.71 },
    ], 10, false, true);
    // The snood, hanging over the beak.
    loftRings(g, [
      { p: new Vec3(0, head.y + HL * 0.22, head.z + HL * 0.5), w: HL * 0.07, d: HL * 0.07, e: 2.0, uv: 0.7 },
      { p: new Vec3(0, head.y - HL * 0.3, head.z + HL * 0.72), w: HL * 0.04, d: HL * 0.04, e: 2.0, uv: 0.71 },
    ], 8, false, true);
  }

  // Suppress the unused-bindings lint on the destructured frame.
  void spineY; void hips;
}

/* Skinning and the coat-depth mask, shared by every body plan. */
function finishAnimalGeometry(g, skeleton, sp, k) {
  const geo = g.finalize();

  /* Auto-skin: score every bone segment by inverse-quartic distance and
     keep the strongest four — the same scheme the human uses. */
  const SEGS = [
    ['hips', 'spine'], ['spine', 'chest'], ['chest', 'neck1'], ['neck1', 'neck2'],
    ['neck2', 'head'], ['head', 'muzzle'], ['hips', 'tail1'], ['tail1', 'tail2'],
    ['head', 'earL'], ['head', 'earR'],
  ];
  for (const s of ['L', 'R']) for (const f of ['f', 'r']) {
    SEGS.push([f + 'Up' + s, f + 'Lo' + s], [f + 'Lo' + s, f + 'Ft' + s]);
  }
  const segments = [];
  const pa = new Vec3(), pb = new Vec3();
  for (const [a, b] of SEGS) {
    const ai = skeleton.index(a), bi = skeleton.index(b);
    if (ai < 0 || bi < 0) continue;
    skeleton.bones[ai].bindMatrix.getTranslation(pa);
    skeleton.bones[bi].bindMatrix.getTranslation(pb);
    segments.push({ a: pa.clone(), b: pb.clone(), boneA: ai, boneB: bi });
  }
  const n = geo.positions.length / 3;
  const joints = new Float32Array(n * 4);
  const weights = new Float32Array(n * 4);
  /* Coat depth per vertex, carried in the colour attribute's red channel.
     Fur shells inflate the mesh along its normals, so a single coat depth
     across a whole animal is wrong in both directions: on the ribcage
     (23cm thick on a whitetail) a 7cm coat is nothing, but on a cannon
     bone 1.4cm across, or an ear plate 2.4cm thick, that same 7cm turns
     the surface inside out — the two sides of the plate pass through each
     other and you get a ball of black noise where the ear should be. Real
     coats behave the same way for the same reason: hair length tracks the
     limb it grows on, which is why a deer's belly is plush and the hair on
     its lower leg is a few millimetres of bristle.

     The distance from a vertex to the nearest bone segment IS the local
     radius of the part it belongs to, and we are already computing it for
     the skinning weights, so the mask comes free. A coat may be up to
     ~45% of the local radius: any deeper and the shells start to cross. */
  const furLen = Math.max(1e-4, (sp.furLen || 0.02) * k * FUR_SHELL_SCALE);
  const mask = new Float32Array(n * 3);
  const p = new Vec3(), closest = new Vec3();
  for (let i = 0; i < n; i++) {
    // Every vertex knows the half-thickness of the cross-section it was
    // lofted from. A coat may stand off about 0.6 of that before opposite
    // shells meet in the middle and the part turns itself inside out.
    // No floor: on something genuinely hair-thin — the naked tip of an
    // opossum's tail — the right amount of standing coat is none, and a
    // floor there puts back exactly the crossed-shell mess this fixes.
    const depth = Math.min(1, ((geo.thick ? geo.thick[i] : 1) * 0.6) / furLen);
    mask[i * 3] = depth; mask[i * 3 + 1] = depth; mask[i * 3 + 2] = depth;
    p.set(geo.positions[i * 3], geo.positions[i * 3 + 1], geo.positions[i * 3 + 2]);
    const merged = new Map();
    for (const seg of segments) {
      closestPointOnSegment(p, seg.a, seg.b, closest);
      const d2 = Math.max(closest.distanceToSq(p), 1e-5);
      const t = clamp(seg.a.distanceTo(closest) / Math.max(seg.a.distanceTo(seg.b), 1e-5), 0, 1);
      const w = 1 / (d2 * d2);
      merged.set(seg.boneA, (merged.get(seg.boneA) || 0) + w * (1 - t));
      merged.set(seg.boneB, (merged.get(seg.boneB) || 0) + w * t);
    }
    const top = Array.from(merged.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0; for (const [, w] of top) sum += w;
    if (sum < 1e-9) { joints[i * 4] = 0; weights[i * 4] = 1; continue; }
    for (let q = 0; q < 4; q++) {
      joints[i * 4 + q] = top[q] ? top[q][0] : 0;
      weights[i * 4 + q] = top[q] ? top[q][1] / sum : 0;
    }
  }
  geo.joints = joints;
  geo.weights = weights;
  geo.colors = mask;
  return geo;
}

/* ---------------- antlers (bone-parented attachment) ---------------- */

function antlerMesh(engine, points, side) {
  return engine._mesh(`antler:${points}:${side}`, () => {
    const g = new Geometry();
    const sx = side;
    /* A whitetail main beam leaves the skull going up and back, sweeps OUT
       and then FORWARD, so seen from the side the rack arcs over the nose
       rather than standing up like a crown. Tines rise off the top of that
       beam, tallest in the middle. The numbers are in metres for a mature
       buck: about a 45 cm beam and a 40 cm inside spread.

       Everything is scaled by the caller, so this is the shape and not the
       size. */
    const beam = [
      new Vec3(-0.008 * sx, -0.045, 0.0),     // pedicle, below the skin
      new Vec3(0.012 * sx, 0.015, 0.01),      // burr
      new Vec3(0.075 * sx, 0.085, 0.045),     // out and up off the head
      new Vec3(0.125 * sx, 0.135, 0.145),     // widest point
      new Vec3(0.135 * sx, 0.16, 0.255),      // turning forward
      new Vec3(0.105 * sx, 0.165, 0.35),      // over the nose
      new Vec3(0.062 * sx, 0.15, 0.405),      // tip, curling back in
    ];
    for (let i = 0; i < beam.length - 1; i++) {
      // A beam is thickest at the burr and tapers to the tip.
      const t = i / (beam.length - 2);
      const r0 = 0.019 * (1 - t * 0.62);
      const r1 = 0.019 * (1 - (t + 0.2) * 0.62);
      appendLimb(g, beam[i], beam[i + 1], r0, Math.max(0.005, r1), 7);
    }
    // The burr: the knobbly ring where antler meets skin.
    appendLimb(g, new Vec3(0, -0.01, 0), new Vec3(0.008 * sx, 0.016, 0.004), 0.026, 0.021, 8);
    // The brow tine, low and forward off the base.
    appendLimb(g, new Vec3(0.028 * sx, 0.03, 0.028), new Vec3(0.032 * sx, 0.115, 0.075), 0.0085, 0.003, 6);

    /* Standing tines off the top of the beam. A rack's tines are tallest in
       the middle and shorten toward the tip, which is what gives a good
       head its shape. */
    // The brow tine and the beam tip are two of the points already.
    const tines = Math.max(1, points - 2);
    for (let t = 0; t < tines; t++) {
      const f = 0.34 + (t / Math.max(1, tines)) * 0.52;
      const seg = f * (beam.length - 2);
      const i0 = Math.min(beam.length - 2, Math.floor(seg));
      const base = new Vec3().copy(beam[i0]).lerp(beam[i0 + 1], seg - i0);
      const h = 0.17 * Math.sin(PI * (0.3 + 0.55 * (t / Math.max(1, tines - 1))));
      const tip = new Vec3(base.x - 0.012 * sx, base.y + h + 0.05, base.z + 0.02);
      appendLimb(g, base, tip, 0.0075, 0.0026, 6);
    }
    smoothNormals(g);
    return g.finalize();
  });
}

/* A bovine horn: a keratin sheath over a bony core, leaving the poll
   sideways and sweeping up and forward. Horns are not antlers — they are
   permanent, unbranched, and both sexes carry them. Unit scale; the
   caller sizes it by head length. */
function hornMesh(engine, side) {
  return engine._mesh(`horn:${side}`, () => {
    const g = new Geometry();
    const sx = side;
    const path = [
      new Vec3(0, -0.04, 0),
      new Vec3(0.15 * sx, 0.04, 0.01),
      new Vec3(0.3 * sx, 0.1, 0.04),
      new Vec3(0.4 * sx, 0.22, 0.11),
      new Vec3(0.4 * sx, 0.34, 0.2),
    ];
    for (let i = 0; i < path.length - 1; i++) {
      const t = i / (path.length - 2);
      appendLimb(g, path[i], path[i + 1],
        0.062 * (1 - t * 0.72), Math.max(0.008, 0.062 * (1 - (t + 0.25) * 0.72)), 9);
    }
    smoothNormals(g);
    return g.finalize();
  });
}

/* ---------------- the animal ---------------- */

let _animalId = 0;

class Animal {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.id = _animalId++;
    const S = ANIMAL_SPECIES[opts.species] ? opts.species : 'deer';
    this.species = S;
    this.base = ANIMAL_SPECIES[S];
    /* `sex` used to double as a life stage, with 'fawn' meaning a small
       deer. Stage is its own axis now, because a young animal differs from
       an adult in proportion rather than only in size. */
    this.sex = opts.sex === 'fawn' ? 'female' : (opts.sex || (Math.random() < 0.5 ? 'male' : 'female'));
    this.stage = opts.stage || (opts.sex === 'fawn' ? 'young' : 'adult');
    this.isBaby = this.stage === 'young';
    this.sizeName = ANIMAL_SIZES[opts.size] ? opts.size : 'medium';
    // The form is this individual: its species, its sex and its age.
    this.spec = resolveForm(S, { sex: this.sex, stage: this.stage });
    this.k = (opts.scaleMul || 1) * ANIMAL_SIZES[this.sizeName];
    this.mother = opts.mother || null;
    this.mule = !!opts.mule;
    this.rng = new Rng(opts.seed || (7000 + this.id * 131));

    const at = Vec3.from(opts.at || [0, 0, 0]);
    this.x = at.x; this.z = at.z;
    this.groundY = typeof opts.groundY === 'function' ? opts.groundY : null;
    this.baseY = typeof opts.groundY === 'number' ? opts.groundY : at.y;
    this.yaw = this.rng.range(0, TAU);
    this.speed = 0;
    this.state = 'graze';
    this.stateT = this.rng.range(0, 2);
    this.phase = this.rng.range(0, 1);
    this.headDown = this.spec.grazes ? 1 : 0;
    this.blinkT = this.rng.range(1, 4); this.blink = 0;
    this.earT = this.rng.range(1, 5); this.earFlick = 0;
    this.tailT = this.rng.range(2, 6); this.tailFlick = 0;
    this.herd = opts.herd || null;
    this.dead = false;
    /* Being hit, and dying of it.

       An animal that is shot does not blink out and it does not simply
       run: it flinches — a mule kick, a hunch, a stumble — and then it
       either goes down or it leaves. What it does in the first second is
       most of what a hunter reads to decide where the bullet went, so it
       is animated rather than skipped.

       `hitReaction` counts down through the flinch. `dying` is the
       collapse: the legs fold, the body goes over, the head comes down
       last. Nothing here decides whether the animal lives — the ecology
       does that — this only shows it. */
    this.hitReaction = 0;
    this.hitKind = null;
    this.hitFrom = 0;
    this.dying = 0;
    this.deathT = 0;
    this.deathRoll = 0;
    this.downed = false;

    this._build();
  }

  _groundAt(x, z) { return this.groundY ? this.groundY(x, z) : this.baseY; }

  _build() {
    const e = this.engine, sp = this.spec, k = this.k;
    // One skeleton per animal (it holds this animal's pose), but the sculpted
    // skinned mesh is cached per species+size, so a herd shares geometry.
    this.skeleton = makeQuadSkeleton(sp, k);
    /* Cached per species, sex, stage and size: a herd of does shares one
       upload, and so does a herd of fawns, but a doe and a fawn are two
       different meshes because they are two different shapes. */
    const meshKey = `quad:${this.species}:${this.sex}:${this.stage}:${k.toFixed(2)}`;
    this.mesh = e._mesh(meshKey, () => makeQuadGeometry(this.skeleton, sp, k));

    const palette = this.base.coat || {};
    const coat = palette[sp.sexKey] || palette.female || palette.male || 0x8a7a5c;
    const texTable = this.base.texture || {};
    const tex = texTable[sp.sexKey] || texTable.female || 'fur';
    this.actor = new Actor(e, {
      name: `animal${this.id}`,
      mesh: this.mesh,
      material: e.material({ texture: tex, color: this.mule ? 0x7d7261 : coat, roughness: 0.95, uvScale: 1, doubleSided: true, textureSize: 512 }),
      skeleton: this.skeleton,
      animator: { update: (dt) => this._drive(dt), add() {}, play() {} },
      at: [this.x, this.baseY, this.z],
      boundRadius: 2.2 * k,
    });
    // Shell fur: extra inflated, strand-clipped passes give the coat real
    // depth — hair tips physically break the silhouette. The comb vector
    // lays the coat backward and down the way real hair lies. Low-power
    // devices get fewer layers.
    const qn = e.renderer.qualityName;
    // Feathers are flat overlapping plates, not standing hair: shell fur on
    // a bird gives it a coat of fuzz it does not have.
    const wantShells = sp.bird ? 0 : (this.base.shells || 8);
    this.actor.furShells = qn === 'low' ? Math.round(wantShells * 0.5) : wantShells;
    // Longer than real fur, deliberately — biologically accurate 3-4cm
    // guard hair is invisible as "sticking up" volume at normal camera
    // distance, it only reads in extreme macro. Games exaggerate shell
    // length for exactly this reason.
    this.actor.furLength = (sp.furLen || 0.02) * k * FUR_SHELL_SCALE;
    // The mesh carries a per-vertex coat-depth mask (see makeQuadGeometry),
    // so ears, lower legs and tail tips get a coat their thickness can hold.
    this.actor.furMask = true;
    // A weak comb: mostly outward-along-the-normal (hair actually stands
    // up off the silhouette) with only a slight backward lean, not the
    // near-50/50 mix that was combing it flat against the body everywhere.
    this.actor.furComb = [0, -0.1, -0.22];
    e.actors.push(this.actor);
    this.parts = [this.actor];

    // Eyes and antlers ride the head bone. A real eye is two distinct
    // parts, not one flat ball: a glossy iris (deer/rabbit eyes read as a
    // rich near-black brown, not pure black) and a smaller true-black
    // pupil riding just proud of it so it doesn't z-fight. Both are
    // deliberately very low roughness — the wet-shine catchlight that
    // sells "alive" comes from real specular reflection off that low
    // roughness under the actual scene lighting, not a painted highlight.
    const headIdx = this.skeleton.index('head');
    const HL = sp.headLen * k;
    /* An eye is a ball SET INTO the skull, showing maybe a third of
       itself through the lids. Sitting the whole sphere out on the
       surface — which is what the previous offsets did — is the single
       loudest "toy" cue a model can have, and adding a second sphere for
       the pupil on top of it made two googly bubbles per side.

       So: the eyeball is sunk until only its front cap clears the head
       loft's half-width, and the pupil is a thin lens riding just proud
       of the iris, shaped the way the animal's actually is. Roughness is
       low but not mirror-flat: a real cornea gives one hard catchlight,
       not a full reflection of the sky. */
    const irisM = e.material({ color: 0x1d0f06, roughness: 0.26, metalness: 0 });
    const pupilM = e.material({ color: 0x050403, roughness: 0.12, metalness: 0 });
    const sphereMesh = e._mesh('sphere', () => Shapes.sphere(0.5, 20, 28));
    // Head half-width at the eye station, from the same numbers the loft
    // uses, so the eye is seated in the skull it is actually in.
    const skullHalfW = HL * 0.34;
    const eyeR = HL * 0.048;
    const eyeX = skullHalfW - eyeR * 0.45;
    const eyeY = HL * 0.105, eyeZ = HL * 0.2;
    /* Prey animals have a horizontal slot pupil that stays level with the
       horizon while they graze; predators and birds have a round one. */
    const slot = sp.formClass === 'ungulate' || sp.formClass === 'pig';
    this.eyes = [];
    this.pupils = [];
    for (const s of [1, -1]) {
      const eye = new Actor(e, {
        mesh: sphereMesh, material: irisM,
        parent: this.actor, parentBone: headIdx,
        offset: [s * eyeX, eyeY, eyeZ],
      });
      eye.scale.setScalar(eyeR * 2);
      eye.restScale = eye.scale.clone();
      e.actors.push(eye); this.parts.push(eye); this.eyes.push(eye);

      const pupil = new Actor(e, {
        mesh: sphereMesh, material: pupilM,
        parent: this.actor, parentBone: headIdx,
        offset: [s * (eyeX + eyeR * 0.78), eyeY, eyeZ],
      });
      if (slot) pupil.scale.set(eyeR * 0.7, eyeR * 0.5, eyeR * 1.5);
      else pupil.scale.set(eyeR * 0.7, eyeR * 0.95, eyeR * 0.95);
      pupil.restScale = pupil.scale.clone();
      e.actors.push(pupil); this.parts.push(pupil); this.pupils.push(pupil);
    }
    this.horns = [];
    if (sp.horns) {
      const hornM = e.material({ color: 0x8d8372, roughness: 0.42, textureSize: 64 });
      for (const s of [1, -1]) {
        const h = new Actor(e, {
          mesh: hornMesh(e, s), material: hornM,
          parent: this.actor, parentBone: headIdx,
          offset: [s * HL * 0.24, HL * 0.3, -HL * 0.04],
        });
        h.scale.setScalar(HL);
        e.actors.push(h); this.parts.push(h); this.horns.push(h);
      }
    }
    this.antlers = [];
    /* Antlers grow with age, so a yearling carries spikes and a prime buck
       carries a rack. `antlerFrac` is the fraction of a full head this
       animal has grown, and it is zero on every female and every fawn. */
    if (sp.antlerFrac > 0.05) {
      // Antler is polished bone with the beam's grain still in it: warm
        // pale brown, not the white plastic it was, and not bark either.
        const boneM = e.material({ texture: 'foliageDetail', color: 0xa8946c, roughness: 0.5, uvScale: 3, textureSize: 128 });
      for (const s of [1, -1]) {
        /* Points come from how much antler this animal has grown, so a
           yearling is a spike, an adult a decent head and a prime bull a
           rack worth carrying out. */
        /* Points per SIDE, the way a rack is actually counted. A prime
           whitetail is a 4-or-5-point side (brow tine, two or three
           standing tines, beam tip) — a 6x6 bull elk is the big one. The
           old formula ran to seven tines a side, which is a world-record
           non-typical on every yearling in the woods. */
        const maxPts = sp.antlerMax || 5;
        const points = Math.max(1, Math.round(1 + sp.antlerFrac * (maxPts - 1)));
        const a = new Actor(e, {
          mesh: antlerMesh(e, points, s), material: boneM,
          parent: this.actor, parentBone: headIdx,
          offset: [s * HL * 0.2, HL * 0.34, -HL * 0.12],
        });
        // Antler size follows the animal and its age, not just its body.
        a.scale.setScalar(k * (0.5 + sp.antlerFrac * 0.8) * (this.base.shoulder / 0.98));
        e.actors.push(a); this.parts.push(a); this.antlers.push(a);
      }
    }
  }

  /* ---------------- the brain (unchanged from v1) ---------------- */

  _threatInfo() {
    const e = this.engine;
    const t = e.animalThreat || (e.camera && e.camera.position);
    if (!t) return null;
    const dx = this.x - t.x, dz = this.z - t.z;
    return { dx, dz, d: Math.sqrt(dx * dx + dz * dz) };
  }

  /* Struck. `where` is the hit region the terminal model reported, and
     it decides the flinch, because the flinch is the tell:

       lungs   — a hard hunch and a run, tail clamped down
       heart   — the mule kick: both back legs out behind it
       gut     — humped up, walking, low and slow
       muscle  — a stumble and then it runs on three
       graze   — a jump and a stop, and it may not even leave

     These are the reactions people learn to read, and reading them is
     how you decide whether to follow now or wait an hour. */
  react(where, fromX, fromZ) {
    const kind = /lung/i.test(where || '') ? 'lung'
      : /heart/i.test(where || '') ? 'heart'
        : /gut|liver|abdom/i.test(where || '') ? 'gut'
          : /leg|muscle|shoulder|ham/i.test(where || '') ? 'muscle'
            : 'graze';
    this.hitKind = kind;
    this.hitReaction = kind === 'heart' ? 0.85 : kind === 'lung' ? 0.6
      : kind === 'gut' ? 1.1 : kind === 'muscle' ? 0.7 : 0.35;
    this.hitFrom = Math.atan2(this.x - (fromX || 0), this.z - (fromZ || 0));
    if (kind !== 'graze') { this.state = 'flee'; this.stateT = this.rng.range(4, 9); this.yaw = this.hitFrom; }
    else { this.state = 'alert'; this.stateT = 2.2; }
    return kind;
  }

  /* Going down. The legs fold first, then the body rolls onto the side
     it was hit from, then the head. A deer that is shot through both
     lungs is dead before it stops moving and it still runs eighty
     metres, so this is the END of that — the ecology decides when. */
  die(opts = {}) {
    if (this.dying > 0 || this.downed) return;
    this.dying = 0.001;
    this.deathT = opts.seconds || 1.6;
    this.deathRoll = (opts.rollTo != null ? opts.rollTo : (this.rng.next() < 0.5 ? -1 : 1));
    this.state = 'dying';
    this.speed = 0;
  }

  spook(from) {
    if (from) { const p = Vec3.from(from); this.yaw = Math.atan2(this.x - p.x, this.z - p.z); }
    this.state = 'flee';
    this.stateT = this.rng.range(2.2, 3.6);
  }

  update(dt) {
    if (this.dead) return;
    const sp = this.spec, k = this.k;
    this.stateT -= dt;
    const th = this._threatInfo();

    if (this.mother && !this.mother.dead) {
      const m = this.mother;
      if (m.state === 'flee' && this.state !== 'flee') { this.state = 'flee'; this.stateT = 2.5; }
      if (this.state !== 'flee') {
        const dx = m.x - this.x, dz = m.z - this.z;
        if (dx * dx + dz * dz > 2.2) { this.state = 'follow'; this.yaw = Math.atan2(dx, dz); }
        else if (this.state === 'follow') { this.state = 'graze'; this.stateT = this.rng.range(1, 3); }
      }
    }

    // A dying animal has no opinions left; the animator finishes it.
    if (this.dying > 0 || this.downed) { this.speed = 0; return; }

    switch (this.state) {
      case 'graze':
        this.speed = lerp(this.speed, 0, dt * 6);
        this.headDown = lerp(this.headDown, 1, dt * 2.5);
        if (th && th.d < sp.alertR) { this.state = 'alert'; this.stateT = this.rng.range(0.5, 1.2); }
        else if (this.stateT <= 0) { this.state = 'wander'; this.stateT = this.rng.range(1.5, 3.5); this.yaw += this.rng.range(-1.2, 1.2); }
        break;
      case 'wander': {
        this.speed = lerp(this.speed, sp.walkSpeed * k, dt * 3);
        this.headDown = lerp(this.headDown, 0.25, dt * 2);
        if (this.herd) {
          const hx = this.herd.cx - this.x, hz = this.herd.cz - this.z;
          if (hx * hx + hz * hz > 36) this.yaw = lerp(this.yaw, Math.atan2(hx, hz), dt * 0.8);
        }
        if (th && th.d < sp.alertR) { this.state = 'alert'; this.stateT = this.rng.range(0.4, 1); }
        else if (this.stateT <= 0) { this.state = 'graze'; this.stateT = this.rng.range(2, 5); }
        break;
      }
      case 'alert':
        this.speed = lerp(this.speed, 0, dt * 10);
        this.headDown = lerp(this.headDown, 0, dt * 8);
        if (th && th.d < sp.alertR * 0.55) this.spook({ x: this.x - th.dx, y: 0, z: this.z - th.dz });
        else if (this.stateT <= 0) {
          if (th && th.d < sp.alertR) { this.stateT = this.rng.range(1, 2.5); }
          else { this.state = 'graze'; this.stateT = this.rng.range(1, 2.5); }
        }
        break;
      case 'follow':
        this.speed = lerp(this.speed, sp.walkSpeed * 1.7 * k, dt * 4);
        this.headDown = lerp(this.headDown, 0.1, dt * 3);
        break;
      case 'flee': {
        this.speed = lerp(this.speed, sp.runSpeed * k, dt * 4);
        this.headDown = lerp(this.headDown, 0, dt * 10);
        if (th) {
          const away = Math.atan2(th.dx, th.dz);
          this.yaw = lerp(this.yaw, away + Math.sin(this.engine.time * 2.1 + this.id) * 0.35, dt * 3);
        }
        if (this.stateT <= 0 && (!th || th.d > sp.safeR)) { this.state = 'alert'; this.stateT = this.rng.range(0.8, 1.6); }
        break;
      }
    }

    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;

    const stride = (sp.gait === 'hop' ? 0.7 : 1.4) * k;
    if (this.speed > 0.03) this.phase = (this.phase + (this.speed / stride) * dt) % 1;

    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.12; this.blinkT = this.rng.range(1.5, 5); }
    this.blink = Math.max(0, this.blink - dt);
    this.earT -= dt;
    if (this.earT <= 0) { this.earFlick = 0.3; this.earT = this.rng.range(2, 6); }
    this.earFlick = Math.max(0, this.earFlick - dt);
    this.tailT -= dt;
    if (this.tailT <= 0) { this.tailFlick = 0.5; this.tailT = this.rng.range(2, 7); }
    this.tailFlick = Math.max(0, this.tailFlick - dt);
  }

  /* ---------------- bone driver (runs as the actor's animator) ---------------- */

  _drive(dt = 0) {
    const sp = this.spec, k = this.k, sk = this.skeleton;
    const running = this.speed > sp.walkSpeed * k * 2.2;
    const ph = this.phase * TAU;
    const bone = (name) => sk.bones[sk.index(name)];

    /* The flinch and the collapse are timed HERE rather than in the
       brain, because the brain is optional: a game that owns its own
       ecology drives position and intent itself and never calls
       update() at all. The animator is the one thing that always runs,
       so an animal that is dying finishes dying whoever is driving it. */
    if (dt > 0) {
      if (this.hitReaction > 0) this.hitReaction = Math.max(0, this.hitReaction - dt);
      if (this.dying > 0 && !this.downed) {
        this.dying += dt;
        if (this.dying >= this.deathT) { this.dying = this.deathT; this.downed = true; }
      }
    }

    /* Going down.

       Not a ragdoll — a ragdoll of a shot deer looks like a dropped bag,
       because a dead animal's legs are still stiff and its neck is still
       long. It folds: the legs go first and it drops on its brisket, then
       the body rolls onto its side, then the head comes over last and
       lies out flat. The whole thing takes about a second and a half. */
    if (this.dying > 0) {
      const t = Math.min(1, this.dying / Math.max(0.01, this.deathT));
      const fold = Math.min(1, t / 0.35);                    // legs
      const roll = Math.max(0, Math.min(1, (t - 0.25) / 0.5)); // body over
      const neck = Math.max(0, Math.min(1, (t - 0.55) / 0.45)); // head last
      const ease = (u) => u * u * (3 - 2 * u);
      const shoulder = sp.shoulder * k;
      const drop = ease(fold) * shoulder * 0.42 + ease(roll) * shoulder * 0.24;
      this.actor.setPosition([this.x, this._groundAt(this.x, this.z) - drop + shoulder * 0.5 * ease(roll) * 0.0, this.z]);
      this.actor.setRotation(new Quat().setEuler(
        ease(fold) * 0.22,
        this.yaw,
        ease(roll) * this.deathRoll * (Math.PI * 0.46),
      ));
      for (const s2 of ['L', 'R']) {
        bone(`fUp${s2}`).localRotation.setEuler(ease(fold) * 1.15, 0, 0);
        bone(`fLo${s2}`).localRotation.setEuler(ease(fold) * -1.5, 0, 0);
        bone(`rUp${s2}`).localRotation.setEuler(ease(fold) * -0.95, 0, 0);
        bone(`rLo${s2}`).localRotation.setEuler(ease(fold) * 1.35, 0, 0);
      }
      bone('spine').localRotation.setEuler(ease(fold) * 0.18, 0, 0);
      bone('chest').localRotation.setEuler(ease(fold) * 0.12, 0, 0);
      bone('neck1').localRotation.setEuler(0.35 + ease(neck) * 0.9, 0, 0);
      bone('neck2').localRotation.setEuler(0.2 + ease(neck) * 0.7, 0, 0);
      bone('head').localRotation.setEuler(ease(neck) * -0.5, 0, ease(neck) * this.deathRoll * 0.5);
      // Ears and tail go slack, which is most of what says "dead".
      bone('earL').localRotation.setEuler(ease(fold) * 0.5, 0, 0.25);
      bone('earR').localRotation.setEuler(ease(fold) * 0.5, 0, -0.25);
      bone('tail1').localRotation.setEuler(ease(fold) * 0.4, 0, 0);
      sk.update();
      return;
    }

    /* The flinch. What an animal does in the first second after it is
       hit is the tell a hunter reads to place the shot, so each one is
       its own shape rather than a generic stagger. */
    let flinchPitch = 0, flinchRoll = 0, hunch = 0, kick = 0, limp = 0;
    if (this.hitReaction > 0) {
      const u = 1 - this.hitReaction / (this.hitKind === 'gut' ? 1.1 : 0.85);
      const pulse = Math.sin(Math.min(1, u) * PI);
      if (this.hitKind === 'heart') { kick = pulse; flinchPitch = -pulse * 0.30; }
      else if (this.hitKind === 'lung') { hunch = pulse * 0.9; flinchPitch = pulse * 0.16; }
      else if (this.hitKind === 'gut') { hunch = 1.0; flinchPitch = 0.10; }
      else if (this.hitKind === 'muscle') { limp = pulse; flinchRoll = pulse * 0.22; }
      else { flinchPitch = -pulse * 0.14; }
    } else if (this.hitKind === 'gut') {
      // A gut-shot animal stays humped up and walks. It does not recover.
      hunch = 0.75;
    }

    const hop = sp.gait === 'hop'
      ? (this.speed > 0.1 ? Math.abs(Math.sin(ph)) * 0.14 * k * (1 + this.speed * 0.5) : 0)
      : (running ? Math.abs(Math.sin(ph)) * 0.28 * k : 0);
    this.actor.setPosition([this.x, this._groundAt(this.x, this.z) + hop, this.z]);
    this.actor.setRotation(new Quat().setEuler(flinchPitch, this.yaw, flinchRoll));

    // Torso: a touch of pitch with the bound, plus the hump of a hit.
    bone('spine').localRotation.setEuler((running ? Math.sin(ph) * 0.08 : 0) - hunch * 0.26, 0, 0);
    bone('chest').localRotation.setEuler((running ? Math.sin(ph) * 0.06 : 0) - hunch * 0.14, 0, 0);

    // Neck chain: bind pose is the natural half-raised carry; positive pitch
    // lowers the nose into the grass, negative lifts to full alarm.
    const down = this.headDown;
    const nod = this.speed > 0.05 && !running ? Math.sin(ph * 2) * 0.05 : 0;
    bone('neck1').localRotation.setEuler(lerp(-0.12, 0.95, down) + nod, 0, 0);
    bone('neck2').localRotation.setEuler(lerp(-0.15, 0.55, down), 0, 0);
    bone('head').localRotation.setEuler(lerp(0.1, -0.5, down), 0, 0);

    // Legs: walk is a lateral sequence, running is bounding pairs. The lower
    // leg folds as the upper swings back, which is what makes a stride read
    // as a stride instead of a pendulum.
    const biped = sp.gait === 'biped';
    const phases = sp.gait === 'hop'
      ? [0.05, 0, 0.5, 0.55]
      : (biped ? [0, 0, 0, 0.5]
        : (running ? [0, 0.12, 0.55, 0.65] : [0, 0.5, 0.75, 0.25]));
    const amp = this.speed < 0.05 ? 0 : (running ? 0.8 : 0.45);
    const legNames = [['fUpL', 'fLoL'], ['fUpR', 'fLoR'], ['rUpL', 'rLoL'], ['rUpR', 'rLoR']];
    for (let i = 0; i < 4; i++) {
      // On a bird the front pair is a folded wing, which does not stride —
      // it shuffles a little as the body rocks and otherwise stays put.
      const wing = biped && i < 2;
      const a2 = wing ? amp * 0.08 : amp;
      const swing = Math.sin((this.phase + phases[i]) * TAU) * a2;
      const fold = Math.max(0, Math.sin((this.phase + phases[i]) * TAU + 1.9)) * a2 * (running ? 1.2 : 0.8);
      /* A heart shot throws both back legs out behind — the mule kick,
         and the single most reliable tell there is. A leg hit drops one
         of them for a stride or two. */
      const rear = i >= 2;
      const kicked = rear ? -kick * 1.25 : kick * 0.25;
      const dropped = (!rear && i === 0) ? limp * 0.9 : 0;
      bone(legNames[i][0]).localRotation.setEuler(swing + kicked + dropped, 0, 0);
      bone(legNames[i][1]).localRotation.setEuler(
        (wing ? 0 : (i < 2 ? fold * 0.7 : -fold * 0.7)) + (rear ? kick * 0.5 : 0) - dropped * 1.4, 0, 0);
    }

    // Ears and tail.
    const flick = this.earFlick > 0 ? Math.sin(this.earFlick * 24) * 0.6 : 0;
    bone('earL').localRotation.setEuler(0, 0, 0.25 + flick);
    bone('earR').localRotation.setEuler(0, 0, -0.25 - flick * 0.4);
    /* A whitetail runs with its tail up unless it is hit, and a clamped
       tail on a running deer means you connected. That single detail is
       worth more to a hunter than any hit marker. */
    const clamped = this.hitKind && this.hitKind !== 'graze' ? 1 : 0;
    const flag = clamped ? -0.35
      : (this.state === 'flee' ? 1 : (this.tailFlick > 0 ? Math.abs(Math.sin(this.tailFlick * 14)) * 0.5 : 0));
    bone('tail1').localRotation.setEuler(-flag * 1.9, this.tailFlick > 0 ? Math.sin(this.tailFlick * 18) * 0.3 : 0, 0);

    sk.update();

    /* Blink: the lids are a vertical squash of the eye and pupil together,
       applied to whatever rest size _build seated in the skull. Deriving
       the rest size here instead — with its own, much larger numbers —
       is how every animal in the game ended up wearing two googly
       bubbles on the outside of its head. */
    const lid = this.blink > 0 ? 0.15 : 1;
    for (const eye of this.eyes) eye.scale.set(eye.restScale.x, eye.restScale.y * lid, eye.restScale.z);
    for (const pupil of this.pupils) pupil.scale.set(pupil.restScale.x, pupil.restScale.y * lid, pupil.restScale.z);
  }

  destroy() {
    this.dead = true;
    for (const p of this.parts) p.destroy();
  }
}

/* ---------------- engine surface ---------------- */

Engine.prototype.animal = function (opts = {}) {
  if (!this.animals) {
    this.animals = [];
    this.onUpdate((dt) => {
      let cx = 0, cz = 0, n = 0;
      for (const a of this.animals) if (!a.dead && a.herd) { cx += a.x; cz += a.z; n++; }
      for (const a of this.animals) {
        if (a.dead) continue;
        if (a.herd && n) { a.herd.cx = cx / n; a.herd.cz = cz / n; }
        a.update(dt);
      }
    });
  }
  const a = new Animal(this, opts);
  this.animals.push(a);
  return a;
};

Engine.prototype.herdOf = function (opts = {}) {
  const n = opts.count || 6;
  const at = Vec3.from(opts.at || [0, 0, 0]);
  const spread = opts.spread || 4;
  const herd = { cx: at.x, cz: at.z };
  const rng = new Rng(opts.seed || 99);
  const out = [];
  const sizes = ['small', 'medium', 'large'];
  for (let i = 0; i < n; i++) {
    const sex = i === 0 ? 'male' : (rng.next() < 0.55 ? 'female' : 'male');
    const a = this.animal(Object.assign({}, opts, {
      sex, size: sizes[(rng.next() * 3) | 0], herd,
      at: [at.x + rng.range(-spread, spread), at.y, at.z + rng.range(-spread, spread)],
      seed: (opts.seed || 99) * 31 + i,
    }));
    out.push(a);
    if (sex === 'female' && rng.next() < 0.6) {
      out.push(this.animal(Object.assign({}, opts, {
        sex: 'fawn', size: 'small', herd, mother: a,
        at: [a.x + rng.range(-1, 1), at.y, a.z + rng.range(-1, 1)],
        seed: (opts.seed || 99) * 57 + i,
      })));
    }
  }
  return out;
};

Engine.prototype.testPlate = function (opts = {}) {
  const miles = clamp(opts.miles || 1, 0.02, 10);
  const side = Math.sqrt(miles) * 1609.34;
  const g = this.ground(Object.assign({ size: side }, opts));
  g.userData = { testPlate: true, miles, side };
  return g;
};
