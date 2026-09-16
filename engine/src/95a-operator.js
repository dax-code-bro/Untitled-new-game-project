/* ============================================================
   THE OPERATORS
   ============================================================

   Seven people you can play as, and the whole point of the file is
   that they are seven PEOPLE and not one person at seven sizes.

   The complaint that produced it was precise and it was right: the
   zombie heads were "just resizing different parts of the original
   sculpt". That is what an archetype table does -- three sets of radii
   over one set of equations -- and no amount of extra archetypes fixes
   it, because the thing that tells two faces apart is not how big the
   skull is.

   It is which PLANES the skull has. A supraorbital shelf running temple
   to temple with a hard lower edge, versus two soft arcs over the eyes.
   An orbit you could put a thumb into, versus a shallow one. A nose
   whose profile is broken by a dorsal hump, versus a straight one. A
   mandible that carries its width forward to the chin so the lower face
   is a box, versus one that tapers to a wedge. A hollow under the
   cheekbone. A cleft. None of those are scales of each other and none
   of them is reachable by multiplying a radius.

   So 91-face.js has a control for every one of them now -- forty-odd
   numbers where it used to have forty literals -- and an operator is a
   table of overrides. Same code, different person.

   Bodies differ too, which the request was explicit about: "some
   characters will have different bodies and sizes". Height, mass and
   reach all vary, and because they do, where the rifle sits in the
   hands varies with them. GRIP holds that per operator, so the gun is
   fitted to the man rather than the man being resized around the gun.
   ============================================================ */

/* Skin. Sampled across a range rather than "one colour lightened", for
   the same reason as everything else in this file. */
/* Skin. These are TINTS and a tint only multiplies down, over a recipe
   that bakes near-cream -- so the number here is very close to the
   colour that comes out, and the first set was chosen as if it were a
   paint. 0x97673f is not a skin tone, it is orange, and rendered as
   exactly that: a man the colour of a traffic cone. Real skin is far
   less saturated than it looks on a palette. */
const OP_SKIN = {
  fair: 0xf0cdb4, ruddy: 0xdda88c, olive: 0xc49a72,
  tan: 0xa87c56, brown: 0x8d6440, deep: 0x70502f, ash: 0xcabdae,
};

/* ------------------------------------------------------------------
   THE FACES
   ------------------------------------------------------------------
   Each is a departure from the default sculpt in the ways listed, and
   the comment on each says what kind of head it is rather than what the
   numbers do -- the numbers are legible from the control names. */
const OP_FACE = {

  /* DESTROYER. The heavy. A brachycephalic skull -- short front to back
     and wide across -- carrying a genuine supraorbital shelf, small
     deep-set orbits under it, and a mandible that keeps its width all
     the way to the chin. Broad short nose, thick everything. He is the
     only one of the seven with a real brow bar, and it is most of why
     you can tell him at a hundred metres. */
  destroyer: {
    // Short, broad and flat-bridged. A boxer's nose that never broke.
    noseLen: 0.88, noseBridge: 0.82, noseHump: 0, noseWide: 1.34, noseBend: 0,
    boxy: 1.35, backFull: 0.055, backWide: 0.052, parietal: 0.125,
    vaultTaperX: 0.070, vaultTaperZ: 0.045, crownFlat: 0.040,
    occiputLow: 0.014, occiputHigh: 0.012, nape: 0.070,
    brow: 0.062, browShelf: 1.0, browWide: 0.185, browTall: 0.070,
    glabella: 0.006, orbit: 0.105, orbitWide: 0.062, orbitTall: 0.052,
    orbitX: 0.096, orbitY: 0.028, lidFold: 0.020, temple: 0.008,
    cheek: 0.030, cheekX: 0.162, cheekZ: 0.016, malarHollow: 0,
    jaw: 0.055, jawDepth: 0.030, jawSquare: 1.0,
    gonialX: 0.044, gonialY: 0.008, gonialAt: 0.150, gonialLow: -0.200,
    chin: 0.070, chinWide: 0.092, chinY: -0.286, mental: 0.030,
    nasolabial: 0.024, philtrum: 0.011,
  },

  /* CHARLIE. Long and narrow -- dolichocephalic, the opposite skull to
     Destroyer's. High bridged nose with a dorsal hump that breaks the
     profile, hollow under the cheekbones, a jaw that tapers to a
     forward-projecting chin, and almost no brow at all. Where Destroyer
     is planes, Charlie is edges. */
  charlie: {
    // Long, high-bridged, and the hump is the whole profile.
    noseLen: 1.16, noseBridge: 1.26, noseHump: 1.0, noseWide: 0.74, noseBend: 0,
    /* The hollow cheek belonged to two faces at once and it should only
       ever have belonged to one. Measured, Charlie and Abscess came out
       the closest pair of the seven -- 0.89 against a spread that runs
       to 4.3 -- because "lean, long and hollow" was the design of both
       of them, and two people cannot be told apart by a number when
       they were conceived as the same person.

       So the hollow is Abscess's, entirely. Charlie is long and
       angular, but his face is FULL: temples packed out, cheeks with
       flesh on them, a heavy projecting chin. Long is not the same
       thing as starved, and the difference between those two ideas is
       what these two men now are. */
    boxy: 0.75, backFull: 0.062, backWide: 0.010, parietal: 0.070,
    vaultTaperX: 0.108, vaultTaperZ: 0.050, crownFlat: 0.030,
    occiputLow: 0.030, occiputHigh: 0.018, nape: 0.048,
    brow: 0.020, browShelf: 0, browWide: 0.125, browTall: 0.046,
    glabella: 0.020, orbit: 0.070, orbitWide: 0.074, orbitTall: 0.064,
    orbitX: 0.086, orbitY: 0.038, lidFold: 0.010, temple: 0.006,
    cheek: 0.034, cheekX: 0.142, cheekY: -0.014, cheekZ: 0.018,
    malarHollow: 0,
    jaw: 0.150, jawDepth: 0.072, jawSquare: 0.25,
    gonialX: 0.024, gonialY: 0.020, gonialAt: 0.124, gonialLow: -0.222,
    chin: 0.090, chinWide: 0.066, chinY: -0.292, mental: 0.028,
    nasolabial: 0.020, philtrum: 0.018,
  },

  /* DELTA. The one who has been hit in the face. Middling proportions
     -- deliberately, because a cast of seven needs somewhere for the eye
     to rest -- and then a nose deviated off the midline and a cleft
     chin, which between them do more work than any proportion would. */
  delta: {
    // Broken, and set. It leans, which is the one asymmetry on any
    // of these seven faces and does more than any proportion could.
    noseLen: 1.06, noseBridge: 1.08, noseHump: 0.60, noseWide: 0.96, noseBend: 1.0,
    /* "Middling, deliberately, because a cast of seven needs somewhere
       for the eye to rest" was a nice sentence and a bad idea. Middling
       is the CENTROID, and the centroid is by definition near everybody
       -- measured, this face was the closest neighbour of whichever of
       the other six happened to be least extreme that week. A cast has
       somewhere to rest because the men in it are different sizes, not
       because one of them is an average of the rest.

       So he is thickset: a skull that is long front to back rather than
       tall, a low sloping forehead, a heavy occiput, and a square jaw.
       Plus the broken nose and the cleft, which were always his. */
    boxy: 1.15, backFull: 0.070, backWide: 0.030, parietal: 0.078,
    vaultTaperX: 0.126, vaultTaperZ: 0.090, crownFlat: 0.048,
    forehead: 0.008, occiputLow: 0.010, occiputHigh: 0.044, nape: 0.068,
    /* Delta and SWAT both ended up square-jawed and heavy-browed, which
       over the FACE region -- where the occiput that really separates
       their skulls does not count -- left them the closest pair at 1.35.

       Rather than push one pair apart and collide with a third, which
       is what the last four passes did, the seven are placed on axes:
       close-set deep orbits under a narrow brow bar, narrow cheekbones,
       a broken humped nose. SWAT is the opposite on every one of those
       -- wide-set shallow eyes under a broad flat brow, wide cheekbones
       carried low, a short wide nose -- and they share only the square
       jaw, which is one trait out of six rather than four. */
    brow: 0.064, browShelf: 0.55, browWide: 0.144, browTall: 0.072,
    glabella: 0.016, orbit: 0.122, orbitWide: 0.060, orbitTall: 0.050,
    orbitX: 0.084, orbitY: 0.034, lidFold: 0.018, temple: 0.018,
    cheek: 0.030, cheekX: 0.142, cheekY: -0.016, cheekZ: 0.013,
    malarHollow: 0.20,
    /* The square jaw was the last trait he still shared with SWAT, so
       it goes: his mandible is heavy but it TAPERS, to a chin that
       projects and is narrow. SWAT's is a box carried forward to a
       chin that is broad and flat. Same weight of jaw, opposite shape. */
    jaw: 0.108, jawDepth: 0.046, jawSquare: 0.35,
    gonialX: 0.030, gonialY: 0.016, gonialAt: 0.126, gonialLow: -0.210,
    chin: 0.088, chinWide: 0.060, chinY: -0.290, mental: 0.030,
    chinCleft: 1.0,
    nasolabial: 0.026, philtrum: 0.010,
  },

  /* ALPHA. Tall vault, long midface, cheekbones set high and wide, a
     straight narrow nose and a jaw that tapers cleanly. The brow is
     smooth -- no shelf and barely a ridge -- so the orbit rim reads off
     the cheekbone rather than off bone above it. */
  alpha: {
    // Straight, narrow and long. No hump at all -- the dorsum runs
    // in one line from the brow to the tip.
    noseLen: 1.16, noseBridge: 1.10, noseHump: 0, noseWide: 0.92, noseBend: 0,
    /* Measured against the other six, the first version of this face sat
       in the MIDDLE of the cluster -- closest neighbour to Charlie, to
       Delta and to Abscess all three, because "balanced and refined" is
       an average and an average is near everybody. So he gets the one
       skull nobody else has: a tall domed cranium, narrow through the
       sides, with a high rounded occiput and a steep forehead. */
    boxy: 0.20, backFull: 0.010, backWide: 0.016, parietal: 0.030,
    vaultTaperX: 0.055, vaultTaperZ: 0.050, crownFlat: 0.004,
    forehead: 0.044, occiputLow: 0.014, occiputHigh: 0.048, nape: 0.072,
    /* Over the FACE region alone -- which is the metric that matters,
       since the back of a skull is much the same on everybody -- Alpha
       and Abscess came out at 1.08 against a spread that runs to 4.5.
       They are opposite ideas and were not yet opposite geometry. So
       the midface goes all the way: no brow ridge to speak of, eyes set
       wide in shallow orbits, cheekbones carried high and FORWARD with
       no hollow beneath them at all. Abscess gets the reverse of every
       one of those. */
    brow: 0.012, browShelf: 0, browWide: 0.116, browTall: 0.042,
    glabella: 0.020, orbit: 0.062, orbitWide: 0.086, orbitTall: 0.076,
    orbitX: 0.104, orbitY: 0.042, lidFold: 0.030, temple: 0.002,
    cheek: 0.046, cheekX: 0.166, cheekY: 0.014, cheekZ: 0.032,
    malarHollow: 0,
    jaw: 0.145, jawDepth: 0.084, jawSquare: 0.10,
    gonialX: 0.016, gonialY: 0.018, gonialAt: 0.118, gonialLow: -0.226,
    chin: 0.052, chinWide: 0.058, chinY: -0.298, mental: 0.008,
    nasolabial: 0.005, philtrum: 0.030,
  },

  /* ABSCESS. Not a corpse -- a living man who looks ill, which is a
     harder thing to build than a corpse and a different one. The rot
     pass in 91-face.js sinks the eyes and dries the skin; this does
     none of that. It is the SKULL that is wrong: a tall narrow vault,
     orbits cut deeper than anyone else's, temples caved, the malar
     hollow at full strength so the cheekbone and the jaw angle stand
     out with nothing between them, and a mandible that is sharp rather
     than heavy. */
  abscess: {
    // Thin to the point of looking skeletal, and the bridge stands
    // well off a face with nothing else on it.
    noseLen: 1.04, noseBridge: 1.34, noseHump: 0.55, noseWide: 0.58, noseBend: -0.4,
    boxy: 0.42, backFull: 0.058, backWide: 0.004, parietal: 0.024,
    vaultTaperX: 0.168, vaultTaperZ: 0.036, crownFlat: 0.006,
    occiputLow: 0.038, occiputHigh: 0.042, nape: 0.034,
    brow: 0.066, browShelf: 0.80, browWide: 0.132, browTall: 0.038,
    glabella: 0.026, orbit: 0.152, orbitWide: 0.060, orbitTall: 0.080,
    orbitX: 0.079, orbitY: 0.028, lidFold: 0.030, temple: 0.052,
    cheek: 0.040, cheekX: 0.144, cheekY: -0.016, cheekZ: 0.026,
    malarHollow: 2.0,
    jaw: 0.220, jawDepth: 0.086, jawSquare: 0,
    gonialX: 0.042, gonialY: 0.026, gonialAt: 0.130, gonialLow: -0.216,
    chin: 0.062, chinWide: 0.044, chinY: -0.298, mental: 0.046,
    nasolabial: 0.042, philtrum: 0.026,
  },

  /* BIOHAZARD. Round, heavy-set and low. A broad flat vault, full
     cheeks with no hollow at all, wide-set shallow orbits, a small
     round nose and a fleshy jaw with a weak angle. He is the only one
     whose face has more soft tissue than bone showing, and next to
     Abscess -- who is the reverse -- that reads immediately. */
  biohazard: {
    // Small, round and snubbed, sitting in a lot of cheek.
    noseLen: 0.78, noseBridge: 0.70, noseHump: 0, noseWide: 1.10, noseBend: 0,
    /* Round and SOFT, which is a different thing from broad. Measured
       against SWAT -- who is also broad and low -- the two came out the
       closest faces of the seven, because "wide" was doing all the work
       in both of them and wide is a proportion, not a shape. The
       difference is planes: this one has none. A genuinely rounded
       cranium, a jaw with no angle in it, a chin that recedes rather
       than projects. SWAT is the same width made entirely of corners. */
    boxy: 0.28, backFull: 0.030, backWide: 0.052, parietal: 0.140,
    vaultTaperX: 0.058, vaultTaperZ: 0.090, crownFlat: 0.044,
    occiputLow: 0.008, occiputHigh: 0.014, nape: 0.082,
    brow: 0.020, browShelf: 0, browWide: 0.176, browTall: 0.070,
    glabella: 0.004, orbit: 0.054, orbitWide: 0.082, orbitTall: 0.052,
    orbitX: 0.097, orbitY: 0.028, lidFold: 0.006, temple: 0.002,
    cheek: 0.010, cheekX: 0.152, cheekY: -0.030, cheekZ: 0.004,
    malarHollow: 0,
    jaw: 0.048, jawDepth: 0.022, jawSquare: 0,
    gonialX: 0.004, gonialY: 0.004, gonialAt: 0.150, gonialLow: -0.192,
    chin: 0.028, chinWide: 0.072, chinY: -0.266, mental: 0.004,
    nasolabial: 0.030, philtrum: 0.008,
  },

  /* SWAT. Compact and blocky: a short broad vault with a genuinely flat
     occiput, a square mandible carried forward, a wide mouth and a
     moderate shelf. Where Destroyer is big and square, this one is
     SMALL and square, and the difference between those two is the whole
     reason the jaw controls are separate from the skull controls. */
  swat: {
    // Wide at the base, low at the bridge, short overall.
    noseLen: 0.90, noseBridge: 0.80, noseHump: 0, noseWide: 1.40, noseBend: 0,
    boxy: 1.60, backFull: 0.004, backWide: 0.040, parietal: 0.118,
    vaultTaperX: 0.058, vaultTaperZ: 0.038, crownFlat: 0.052,
    occiputLow: 0.004, occiputHigh: 0.002, nape: 0.040,
    /* The brow is DELIBERATELY light. First pass gave him a shelf at
       0.70 and deep orbits, and measured against Destroyer -- with a
       shelf at 1.0 and deeper ones -- the two came out the closest pair
       of the seven once size was normalised away, because "big square"
       and "small square" is a scale difference and nothing else. The
       shelf belongs to Destroyer. This one is wide, low and flat: eyes
       set far apart in shallow orbits, a broad low vault, full cheeks
       carried LOW, and a chin that is wide rather than projecting. */
    brow: 0.040, browShelf: 0.50, browWide: 0.178, browTall: 0.046,
    glabella: 0.010, orbit: 0.080, orbitWide: 0.074, orbitTall: 0.046,
    orbitX: 0.106, orbitY: 0.032, lidFold: 0.014, temple: 0.008,
    cheek: 0.030, cheekX: 0.164, cheekY: -0.044, cheekZ: 0.014,
    malarHollow: 0.10,
    jaw: 0.078, jawDepth: 0.032, jawSquare: 1.0,
    gonialX: 0.048, gonialY: 0.004, gonialAt: 0.152, gonialLow: -0.202,
    chin: 0.056, chinWide: 0.102, chinY: -0.274, mental: 0.042,
    nasolabial: 0.010, philtrum: 0.024,
  },
};

/* ------------------------------------------------------------------
   THE SEVEN
   ------------------------------------------------------------------
   build   thickness of the anatomical loft; 1 is the default figure
   height  metres, and it is the real one -- the camera sits on it
   scale   the skeleton, which changes reach as well as stature
   grip    where this man's hands meet a rifle. See below.
   ------------------------------------------------------------------ */
const OPERATORS = [
  {
    id: 'destroyer', name: 'DESTROYER',
    blurb: 'Breacher. Carries the door with him.',
    eyeColor: 0x4a3626,
    face: 'destroyer', faceType: 'heavy', skin: 'tan', seed: 11,
    build: 1.24, height: 1.92, scale: 1.075, radius: 0.36,
    // Shorn to the wood, heavy brows, a week of stubble.
    hairStyle: 'crop', hairColor: 0x1d1a17, brows: 'heavy', browColor: 0x201c18,
    beard: 'stubble', beardColor: 0x5a4c40,
    grip: { fwd: 0.055, down: -0.010, side: 0.012, cant: -2 },
  },
  {
    id: 'charlie', name: 'CHARLIE',
    blurb: 'Marksman. Was somewhere else before this.',
    eyeColor: 0x6f8a92,
    face: 'charlie', faceType: 'male', skin: 'fair', seed: 23,
    build: 0.86, height: 1.83, scale: 1.020, radius: 0.29,
    // Fair, swept back, thin brows, clean-shaven.
    hairStyle: 'swept', hairColor: 0x9a8258, brows: 'thin', browColor: 0xa08a60,
    beard: null,
    grip: { fwd: 0.022, down: 0.004, side: -0.004, cant: 3 },
  },
  {
    id: 'delta', name: 'DELTA',
    blurb: 'Assault. Third tour, second nose.',
    eyeColor: 0x3a2a1c,
    face: 'delta', faceType: 'male', skin: 'olive', seed: 7,
    build: 1.04, height: 1.79, scale: 1.000, radius: 0.32,
    // Dark and short, angled brows, a full beard.
    hairStyle: 'short', hairColor: 0x2b2118, brows: 'angled', browColor: 0x241c14,
    beard: 'full', beardColor: 0x2b2118,
    grip: { fwd: 0, down: 0, side: 0, cant: 0 },
  },
  {
    id: 'alpha', name: 'ALPHA',
    blurb: 'Team lead. Talks least, moves first.',
    eyeColor: 0x241a12,
    face: 'alpha', faceType: 'male', skin: 'brown', seed: 31,
    build: 0.96, height: 1.87, scale: 1.045, radius: 0.31,
    // Close-cropped, arched brows, a goatee.
    hairStyle: 'crop', hairColor: 0x171512, brows: 'arched', browColor: 0x14120f,
    beard: 'goatee', beardColor: 0x171512,
    grip: { fwd: 0.034, down: -0.002, side: 0.002, cant: 1 },
  },
  {
    id: 'abscess', name: 'ABSCESS',
    blurb: 'Whatever was in the tanks, he was under it.',
    eyeColor: 0x8e9a8c,
    face: 'abscess', faceType: 'male', skin: 'ash', seed: 47,
    build: 0.78, height: 1.81, scale: 1.010, radius: 0.28,
    /* Nothing left on his head and almost nothing over his eyes. The
       near-absent brow is deliberate and it is the loudest thing about
       him -- a face with no brows reads as ill in a way no amount of
       sculpting does, and this is the one place that effect is wanted. */
    hairStyle: null, hairColor: 0x5a5148, brows: 'thin', browColor: 0x6b6258,
    beard: 'stubble', beardColor: 0x8a8076,
    grip: { fwd: 0.016, down: 0.008, side: -0.006, cant: 5 },
  },
  {
    id: 'biohazard', name: 'BIOHAZARD',
    blurb: 'Decon. Sealed, and happier that way.',
    eyeColor: 0x5f7a4e,
    face: 'biohazard', faceType: 'heavy', skin: 'ruddy', seed: 19,
    build: 1.30, height: 1.76, scale: 0.985, radius: 0.37,
    // Ginger and thick on top, bushy brows, heavy chops.
    hairStyle: 'thick', hairColor: 0x7a4a26, brows: 'bushy', browColor: 0x6d4322,
    beard: 'chops', beardColor: 0x7a4a26,
    grip: { fwd: -0.014, down: -0.006, side: 0.014, cant: -3 },
  },
  {
    id: 'swat', name: 'SWAT',
    blurb: 'Entry. Came from a job that had rules.',
    eyeColor: 0x2b1f16,
    face: 'swat', faceType: 'male', skin: 'deep', seed: 53,
    build: 1.10, height: 1.72, scale: 0.955, radius: 0.33,
    // Shorn, straight heavy brows, a moustache and nothing else.
    hairStyle: 'crop', hairColor: 0x120f0d, brows: 'straight', browColor: 0x100e0c,
    beard: 'moustache', beardColor: 0x120f0d,
    grip: { fwd: -0.008, down: 0.002, side: 0.006, cant: -1 },
  },
];

const OPERATOR_BY_ID = {};
for (const o of OPERATORS) OPERATOR_BY_ID[o.id] = o;

/* WHERE THE GUN GOES.
 *
   "They hold their gun correctly and it's fitted to that character
   cause some characters will have different bodies and sizes."

   The viewmodel places a rifle at a fixed offset from the eye, which is
   right for exactly one body. Destroyer is nineteen centimetres taller
   than SWAT and his arms are longer in proportion; hand him SWAT's
   offset and the rifle is held out at arm's length with the stock
   nowhere near a shoulder. Hand SWAT Destroyer's and it is in his
   chest.

   So the offset is derived from the man. `scale` moves the whole rig,
   which takes care of reach; `grip` is the per-person correction on top
   of it -- how high he carries, how far out, and how much he cants the
   weapon -- because two men of the same height do not hold a rifle the
   same way either. */
function operatorGrip(id, base) {
  const op = OPERATOR_BY_ID[id];
  if (!op) return base;
  const g = op.grip, k = op.scale;
  return {
    x: base.x * k + g.side,
    y: base.y * k + g.down,
    z: base.z * k + g.fwd,
    roll: (base.roll || 0) + g.cant * Math.PI / 180,
    scale: k,
  };
}

Engine.prototype.operators = function () {
  return OPERATORS.map((o) => ({ id: o.id, name: o.name, blurb: o.blurb,
    height: o.height, build: o.build }));
};

Engine.prototype.operatorSpec = function (id) { return OPERATOR_BY_ID[id] || null; };

Engine.prototype.operatorGrip = function (id, base) { return operatorGrip(id, base); };

/* Build one, as a character. Everything that differs between the seven
   is passed through here and nothing is hardcoded downstream, so adding
   an eighth is a table entry and not a code change. */
Engine.prototype.operator = function (id, opts = {}) {
  const op = OPERATOR_BY_ID[id];
  if (!op) throw new Error('no such operator: ' + id);
  const c = this.character(Object.assign({}, opts, {
    name: opts.name || ('op-' + id),
    height: op.height, radius: op.radius, scale: op.scale, build: op.build,
    faceType: op.faceType,
    faceShape: OP_FACE[op.face],
    faceKey: op.id,
    /* The caller wins. Object.assign put the operator's own flag AFTER
       the caller's opts, so a bench asking for hair: false to compare
       two heads vertex-to-vertex got hair anyway on whoever has it --
       and two heads with different vertex counts cannot be compared at
       all, so fourteen of twenty-one pairs came back NaN and the check
       passed on the seven that happened to match.

       `hair` is whether the head carries a scalp shell at all, which
       has to be on for anybody with a haircut; hairStyle is the cut. */
    hair: opts.hair !== undefined ? opts.hair : !!op.hairStyle,
    hairStyle: opts.hair === false ? null : op.hairStyle,
    hairColor: op.hairColor,
    beard: opts.hair === false ? null : op.beard,
    beardColor: op.beardColor,
    brows: opts.hair === false ? null : op.brows,
    browColor: op.browColor,
    eyeColor: op.eyeColor,
    seed: op.seed,
    material: opts.material || { preset: 'fabric', color: 0x8b8f94 },
    /* THE SKIN, and it was being dropped on the floor. character()
       reads the head's material from `opts.skin`; this passed
       `headMaterial`, which nothing looks at -- so all seven operators
       rendered in the one default flesh tone. Seven men the same
       colour, four of them bald and none of them with eyebrows, is one
       man seven times, and no amount of differentiating their SKULLS
       was ever going to survive that. */
    /* uvScale 12, and this one is worth spelling out. The head's UVs
       run 0..1 across the whole sculpt, so the default uvScale of 1
       stretches ONE tile of the skin recipe over an entire face --
       pores the size of an eye socket. Close up it read as orange peel,
       or on the darker tones as scorched leather, and it was doing more
       damage to "is this a person" than any amount of sculpting could
       undo. Twelve tiles puts the grain at roughly skin scale. */
    skin: opts.skin || { preset: 'skin', color: OP_SKIN[op.skin] || OP_SKIN.tan,
      roughness: 0.62, metalness: 0, uvScale: 12 },
  }));
  if (c) { c.operator = op.id; c.operatorSpec = op; }
  return c;
};
