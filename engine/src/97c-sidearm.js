/* ============================================================
   SIDEARMS AND LAUNCHERS
   ============================================================

   The last twenty-seven of the sixty. They are built on the SAME table
   the thirty-three service arms use -- svcSpec, the same barrel, the
   same sights, the same grip, the same magazine with real rounds
   counted into it -- because a pistol is not a different kind of object
   from a rifle. It is a rifle with no stock, no handguard, a short
   barrel, and the magazine in the grip instead of in front of it.

   Expressing it that way rather than hand-building nine more guns is
   worth saying out loud: every fix that has landed on the service arms
   lands here too. The magazine depth derived from the cartridge instead
   of guessed, the wooden furniture that was rendering as black plastic,
   the pan magazine that faced the wrong way -- all of that was found on
   a rifle and all of it is already correct on these.

   The M1911 is NOT in this table. It has a fully dimensioned hand-built
   model in 96-pistol.js, measured off the real Colt Government spec,
   and a second one here would be two M1911s that could disagree. Same
   rule as the MP5 and the MG42.
   ============================================================ */

/* The base a handgun departs from: no stock, no handguard, a slide
   where a rifle has a receiver, and the magazine up inside the grip. */
function sideSpec(over) {
  const base = {
    ammoKind: 'pistol',
    muzzle: 0.216,
    barrel: { rear: 0.020, r0: 0.0078, r1: 0.0066, bore: 0.0045, step: 0.070, gas: false },
    /* The slide. Short, square in section, and it runs most of the
       length of the gun -- which is why a pistol reads as one solid
       block with a handle on it rather than as a tube on a frame. */
    /* THE SLIDE RUNS TO THE MUZZLE, and on every self-loader in this
       table it stopped ten centimetres short of one.
     *
       `front: 0.098` against a muzzle at 0.216 left 118 mm of bare
       barrel poking out of the front of a 216 mm pistol. That is not a
       service pistol, it is a long-slide target gun -- and since every
       entry inherited it, ALL of them were long-slide target guns with
       the same thin rod out front. It is most of why the pistols
       photographed as one object: the single biggest thing in their
       shared outline was a mistake they all shared.

       A slide covers its barrel to within a few millimetres of the
       crown. The revolver, the broomhandle and the Luger genuinely do
       show barrel ahead of the frame and say so in their own
       entries. */
    rec: { rear: -0.052, front: 0.210, up: 0.0140, down: 0.0120, w: 0.0115, e: 4.2 },
    port: { x0: 0.030, x1: 0.062, up: 0.0095, down: 0.0015 },
    trigger: { x: -0.014 },
    charge: null,
    hg: null,
    stock: null,
    /* In the grip, and that is the whole difference. x sits over the
       grip rather than in front of the trigger, and the magazine is as
       long as the grip is deep. */
    grip: { x: -0.036, y: -0.0160, len: 0.092, rake: 0.30 },
    mag: { kind: 'box', x: -0.036, y: -0.0180, len: 0.084, curve: 0.05,
      w: 0.0092, d: 0.0100, r: 0.030, clear: true },
    sight: { y: 0.0180, frontX: 0.092, rearX: -0.040, front: 'blade', rear: 'notch' },
    handle: null, rail: null, bipod: null, rotary: 0,
    mass: 1.1, bound: 0.16,
  };
  const merged = {};
  for (const k of Object.keys(base)) {
    const b = base[k], o = over[k];
    if (o === null) { merged[k] = null; continue; }
    if (b && typeof b === 'object' && o && typeof o === 'object') merged[k] = Object.assign({}, b, o);
    else merged[k] = (o === undefined ? b : o);
  }
  for (const k of Object.keys(over)) if (!(k in merged)) merged[k] = over[k];
  const out = svcSpec(merged);
  out.cls = 'pistol';
  return out;
}

Object.assign(SERVICE_KINDS, {

  /* The 1911 with the edges taken off and one more in the magazine.
     Longer slide, a beavertail, and a rounded-off frame. */
  blaze: sideSpec({
    muzzle: 0.222, rec: { front: 0.216, up: 0.0146, e: 3.6 },
    grip: { len: 0.096, deep: 1.06, wide: 0.90, e: 0.92, checkN: [6, 9] },
    mag: { len: 0.088, r: 0.032 },
    sight: { frontX: 0.204, rear: 'notch' },
    /* The three things that say 1911 across a room, and none of them
       is a dimension: the spur standing over the web of your hand, the
       beavertail it stands on, and a single block of straight-cut
       serrations at the back of a slide that is otherwise smooth. */
    hammer: { kind: 'spur', x: -0.046, y: 0.0092 },
    tang: { x: -0.048, len: 0.026, y: 0.0086 },
    serr: { kind: 'vert', rear: [-0.044, -0.014], pitch: 0.0052, out: 0.0016 },
    mass: 1.15,
  }),

  /* Fifty calibre out of a pistol. Everything about it is oversized:
     a slab slide, a fat bore, a grip you need two hands on, and a
     compensator cut into the top of the barrel. */
  model5: sideSpec({
    ammoKind: 'full',
    muzzle: 0.242,
    barrel: { rear: 0.026, r0: 0.0112, r1: 0.0098, bore: 0.0064, step: 0.090 },
    /* e below 4.4, because at or above it svcDetails stamps six
       rivets a side into the wall -- right for a receiver pressed out
       of sheet, absurd on a milled slide, and it was on this, the
       P226 and the G18. */
    rec: { rear: -0.060, front: 0.196, up: 0.0186, down: 0.0150, w: 0.0150, e: 4.2 },
    port: { x0: 0.040, x1: 0.084, up: 0.0130, down: 0.0020 },
    grip: { x: -0.044, y: -0.0190, len: 0.108, rake: 0.26 },
    mag: { x: -0.044, y: -0.0210, len: 0.100, w: 0.0110, d: 0.0130, r: 0.028 },
    sight: { y: 0.0230, frontX: 0.188, rearX: -0.046 },
    /* A slab-sided triangle with a rib down the whole top of it and
       four ports cut through the barrel to hold the muzzle down. The
       serrations go OVER the top as well as down the flanks, because
       the slide is wide enough that a thumb lands on top of it. */
    rib: { x0: -0.030, x1: 0.190, hw: 0.0078, vent: true },
    comp: { x0: 0.204, x1: 0.234, n: 3, w: 0.0036, hw: 0.0026 },
    serr: { kind: 'slant', rear: [-0.052, -0.012], pitch: 0.0070,
      out: 0.0018, top: true, hw: 0.0020 },
    hammer: { kind: 'spur', x: -0.056, y: 0.0130 },
    grip: { deep: 1.14, wide: 1.10, e: 1.20, checkN: [6, 8], checkH: 0.0012 },
    mass: 1.9, bound: 0.20,
  }),

  /* Breaks open at the top and throws all six on the floor. A revolver
     is a cylinder, a top strap over it, and a barrel hanging off the
     front -- there is no slide at all, so the receiver is cut right
     down and `rotary` builds the chambers. */
  webley: sideSpec({
    ammoKind: 'pistol',
    muzzle: 0.230,
    barrel: { rear: 0.052, r0: 0.0116, r1: 0.0102, bore: 0.0058, step: 0.062 },
    /* The top strap and the frame, not a slide: short, and it stops
       behind the cylinder instead of running the length of the gun. */
    rec: { rear: -0.048, front: 0.014, up: 0.0150, down: 0.0130, w: 0.0128, e: 3.0 },
    port: null,
    /* `cylinder`, not `rotary`. See svcCylinder: they are different
       parts and sharing the field cost this revolver its barrel. Mk VI
       dimensions -- a 40 mm cylinder, 38 mm across, six chambers -- and
       the top strap that ties the breech to the barrel. */
    cylinder: { x0: 0.006, x1: 0.046, r: 0.0190, n: 6, bore: 0.0058 },
    grip: { x: -0.040, y: -0.0170, len: 0.098, rake: 0.46 },
    mag: null,
    sight: { y: 0.0215, frontX: 0.206, rearX: -0.030, front: 'blade', rear: 'notch' },
    /* The top strap, which on a Webley runs unbroken from the standing
       breech over the cylinder and all the way to the foresight -- it
       is the line that makes a break-open revolver look like one. And
       the big flat hammer spur you cock with a thumb. */
    rib: { x0: 0.050, x1: 0.204, hw: 0.0068, onBarrel: true },
    hammer: { kind: 'spur', x: -0.040, y: 0.0116 },
    /* Bird's head butt: deep front to back, narrow across, and the
       vulcanite panels are coarse-chequered rather than fine. */
    grip: { deep: 1.10, wide: 0.86, e: 0.80, checkN: [5, 9], checkH: 0.0013 },
    mass: 1.1, bound: 0.18,
  }),

  /* The broomhandle. Its magazine is a box AHEAD of the trigger, which
     no other pistol in the game has, and the grip really is a broom
     handle -- round in section and almost vertical. */
  mauser: sideSpec({
    ammoKind: 'inter',
    muzzle: 0.254,
    /* `rear` at 0.074 with the receiver ending at 0.070 left four
       millimetres between the barrel and the gun, so the whole barrel
       -- fifty-seven pieces of it -- was a separate object. The same
       shape of fault as the Webley's, and like the Webley's it
       photographed as one gun because the two overlap in silhouette. */
    barrel: { rear: 0.066, r0: 0.0082, r1: 0.0068, bore: 0.0039, step: 0.110 },
    rec: { rear: -0.066, front: 0.070, up: 0.0158, down: 0.0134, w: 0.0122, e: 3.4 },
    port: { x0: 0.006, x1: 0.040, up: 0.0110, down: 0.0015 },
    grip: { x: -0.048, y: -0.0170, len: 0.086, rake: 0.16 },
    // Forward of the trigger, which is the whole silhouette of this gun.
    mag: { x: 0.016, y: -0.0190, len: 0.074, w: 0.0098, d: 0.0120, r: 0.020, curve: 0 },
    sight: { y: 0.0210, frontX: 0.226, rearX: 0.030, rear: 'notch' },
    /* A round bolt with two knurled ears, a ring hammer behind it, and
       a grip that is genuinely circular in section -- which is the
       whole reason anybody ever called it a broomhandle, and which one
       shared grip profile had flattened into the same slab as every
       other pistol in the rack. */
    serr: { kind: 'scallop', rear: [-0.058, -0.030], pitch: 0.0140, r: 0.0042 },
    hammer: { kind: 'ring', x: -0.062, y: 0.0112 },
    grip: { deep: 0.94, wide: 1.06, e: 0.62, check: false },
    // The long sighting rib along the top of the barrel extension.
    rib: { x0: -0.058, x1: 0.062, hw: 0.0052 },
    mass: 1.25, bound: 0.20,
  }),

  /* The toggle flips up on top when it fires. Raked grip, a barrel that
     steps down hard, and the toggle knuckle standing proud of the
     breech -- which is what `charge` draws here. */
  luger: sideSpec({
    /* 222 mm OVER ALL, which is a P08. It was 278 -- a quarter too
       long, and all of it in the barrel: 188 mm of it against the real
       gun's hundred. That is an artillery Luger, a different weapon
       with a different job, and it is why this one photographed as a
       long thin thing rather than as the stubby toggle-topped pistol
       everybody recognises. */
    muzzle: 0.166,
    barrel: { rear: 0.034, r0: 0.0086, r1: 0.0064, bore: 0.0045, step: 0.052 },
    rec: { rear: -0.056, front: 0.034, up: 0.0148, down: 0.0126, w: 0.0116, e: 3.2 },
    port: { x0: 0.000, x1: 0.026, up: 0.0100, down: 0.0015 },
    /* NOT a charging handle. See svcToggle: a P08's breech is two
       links that jack up in the middle, and the knurled discs are on
       the knuckle. `charge` drew one knob on the right flank -- which
       is what every other self-loader in this table has and is the one
       thing a Luger does not. */
    charge: null,
    toggle: { x0: -0.052, x1: 0.030, knuckle: -0.026, rise: 0.0026,
      out: 0.0052, r: 0.0088 },
    /* Sharply raked, and chequered walnut all the way round rather
       than two panels let into a frame. Narrow across -- a P08 grip is
       a thin one, which is half of why the gun points the way it
       does. */
    grip: { x: -0.046, y: -0.0170, len: 0.094, rake: 0.58,
      deep: 1.02, wide: 0.82, e: 0.74, checkN: [6, 10] },
    mag: { x: -0.046, y: -0.0190, len: 0.086, r: 0.030 },
    sight: { y: 0.0200, frontX: 0.142, rearX: -0.044 },
    /* NO SERRATIONS AND NO HAMMER, and both absences are deliberate.
       You cock a Luger by the toggle knuckle, so there is nothing cut
       into the sides to grip, and the striker is inside the breech
       block where you cannot see it. Every other self-loader in this
       table now wears both; leaving this one bare is what makes the
       toggle read as the mechanism rather than as an ornament. The
       frame tail behind the breech is the one thing it does get. */
    tang: { x: -0.054, len: 0.020, y: 0.0092 },
    mass: 0.95, bound: 0.17,
  }),

  /* Fifteen rounds and nothing to say about any of them. A modern
     service pistol: polymer frame, double-stack magazine, an accessory
     rail under the dust cover. */
  p226: sideSpec({
    muzzle: 0.196,
    barrel: { rear: 0.018, r0: 0.0082, r1: 0.0070, bore: 0.0046, step: 0.060 },
    rec: { rear: -0.050, front: 0.190, up: 0.0146, down: 0.0124, w: 0.0126, e: 4.2 },
    port: { x0: 0.026, x1: 0.058, up: 0.0098, down: 0.0015 },
    grip: { x: -0.034, y: -0.0165, len: 0.098, rake: 0.24 },
    // Double stack: wider and deeper than a single-column magazine.
    mag: { x: -0.034, y: -0.0185, len: 0.094, w: 0.0116, d: 0.0112, r: 0.030 },
    // UNDER the dust cover, which is where a pistol's rail is.
    rail: { x0: 0.070, x1: 0.140, under: true },
    sight: { y: 0.0180, frontX: 0.178, rearX: -0.038 },
    /* Serrated at BOTH ends -- front cocking grooves as well as rear,
       which is the modern-duty-pistol tell and which none of the
       war-era guns in this table have -- a hammer bobbed down flush so
       it cannot snag coming out of a holster, and a light hanging off
       the rail, since the rail existed and nothing was ever on it. */
    serr: { kind: 'slant', rear: [-0.042, -0.008], front: [0.148, 0.176],
      pitch: 0.0055, out: 0.0015 },
    hammer: { kind: 'bob', x: -0.044, y: 0.0098 },
    underslung: { x0: 0.072, x1: 0.136, drop: 0.0110 },
    grip: { deep: 0.92, wide: 1.16, e: 1.35, checkH: 0.0007 },
    mass: 0.96, bound: 0.16,
  }),

  /* The same fast bullet as the broomhandle in something you can carry.
     Slim, straight-gripped, and machined flat all over. */
  tokarev: sideSpec({
    // 7.62x25, which is a bottlenecked PISTOL round and not 7.62x39.
    ammoKind: 'pistolBottle',
    muzzle: 0.194,
    barrel: { rear: 0.018, r0: 0.0076, r1: 0.0062, bore: 0.0039, step: 0.062 },
    rec: { rear: -0.048, front: 0.188, up: 0.0136, down: 0.0116, w: 0.0110, e: 4.0 },
    port: { x0: 0.024, x1: 0.054, up: 0.0092, down: 0.0015 },
    grip: { x: -0.034, y: -0.0160, len: 0.092, rake: 0.20,
      // Slim and almost parallel-sided, with the coarse ribbed panels.
      deep: 0.88, wide: 0.86, e: 1.10, checkN: [4, 8], checkH: 0.0014 },
    mag: { x: -0.034, y: -0.0180, len: 0.086, w: 0.0088, d: 0.0104, r: 0.028 },
    sight: { y: 0.0170, frontX: 0.176, rearX: -0.036 },
    /* Six grooves, wide and far apart, cut deep into the whole height
       of the slide -- the TT's are unmistakable next to the fine close
       ones on a modern gun, and they run right up over the top. The
       hammer is a big exposed spur with a hole through it. */
    serr: { kind: 'vert', rear: [-0.040, -0.006], pitch: 0.0090,
      out: 0.0022, hw: 0.0024, top: true },
    hammer: { kind: 'ring', x: -0.042, y: 0.0086 },
    mass: 0.85, bound: 0.15,
  }),

  /* Seventeen rounds in under a second. A machine pistol, and the thing
     that says so is the extended magazine hanging well below the grip
     and the selector on the slide. */
  g18: sideSpec({
    muzzle: 0.188,
    barrel: { rear: 0.016, r0: 0.0080, r1: 0.0068, bore: 0.0046, step: 0.056 },
    rec: { rear: -0.048, front: 0.180, up: 0.0144, down: 0.0122, w: 0.0128, e: 4.2 },
    port: { x0: 0.024, x1: 0.056, up: 0.0096, down: 0.0015 },
    grip: { x: -0.032, y: -0.0165, len: 0.096, rake: 0.22 },
    // Long stick, and it is the silhouette: it reaches past the hand.
    mag: { x: -0.032, y: -0.0185, len: 0.148, w: 0.0116, d: 0.0112, r: 0.034 },
    rail: { x0: 0.062, x1: 0.124, under: true },
    sight: { y: 0.0178, frontX: 0.168, rearX: -0.036 },
    /* NO HAMMER -- it is striker-fired, and the empty space behind the
       slide where every other pistol here has a spur or a ring is as
       much of a tell as a part would be. What it does have is a pair
       of slots cut through the top of the barrel and the slide over
       them, which is the only thing keeping seventeen rounds a second
       anywhere near where you pointed it. */
    comp: { x0: 0.146, x1: 0.172, n: 2, w: 0.0042, hw: 0.0030 },
    serr: { kind: 'vert', rear: [-0.040, -0.010], pitch: 0.0048,
      out: 0.0012, hw: 0.0014 },
    // Squared-off polymer: wide, shallow, hard-cornered, stippled fine.
    grip: { deep: 0.90, wide: 1.20, e: 1.45, checkN: [7, 10], checkH: 0.0006 },
    mass: 0.92, bound: 0.20,
  }),
});

/* ---------------- launchers ----------------

   A launcher is a TUBE, and almost nothing else. There is no
   reciprocating action and usually no magazine, so the receiver is
   short, the barrel is enormous in diameter, and the interesting detail
   is all bolted to the outside: a sight bracket, a shoulder rest, a
   grip and a trigger group, and on the shoulder-fired ones a blast cone
   at the back for the gas to leave through. */
function tubeSpec(over) {
  const base = {
    ammoKind: 'full',
    muzzle: 0.900,
    barrel: { rear: -0.240, r0: 0.0300, r1: 0.0300, bore: 0.0270, step: 0.400, gas: false },
    rec: { rear: -0.120, front: 0.040, up: 0.0180, down: 0.0300, w: 0.0160, e: 3.2 },
    port: null, charge: null, hg: { kind: 'tube', x0: 0.180, x1: 0.320, r: 0.0345 },
    stock: null,
    grip: { x: -0.070, y: -0.0300, len: 0.110, rake: 0.34 },
    trigger: { x: -0.042 },
    mag: null,
    sight: { y: 0.0520, frontX: 0.300, rearX: -0.040, front: 'blade', rear: 'notch' },
    handle: null, rail: null, bipod: null, rotary: 0,
    mass: 6.5, bound: 0.70,
  };
  const merged = {};
  for (const k of Object.keys(base)) {
    const b = base[k], o = over[k];
    if (o === null) { merged[k] = null; continue; }
    if (b && typeof b === 'object' && o && typeof o === 'object') merged[k] = Object.assign({}, b, o);
    else merged[k] = (o === undefined ? b : o);
  }
  for (const k of Object.keys(over)) if (!(k in merged)) merged[k] = over[k];
  const out = svcSpec(merged);
  out.cls = 'launcher';
  return out;
}

Object.assign(SERVICE_KINDS, {

  /* Point it, fire it, throw the tube away. A thin tube with a warhead
     wider than the tube on the front of it -- which is the only
     launcher silhouette anybody recognises instantly. */
  panzer: tubeSpec({
    /* OVERALL LENGTH IS `muzzle` MINUS `barrel.rear`, and rear is
       negative on every launcher because the tube runs back past the
       grip. Setting muzzle to the length I wanted made each of these a
       quarter to a third longer than the real weapon -- the bazooka
       came out 1.55 m against a real 1.37. The numbers below are
       muzzle positions now, chosen so the total is right. */
    muzzle: 0.560,
    barrel: { rear: -0.240, r0: 0.0225, r1: 0.0225, bore: 0.0200, step: 0.300 },
    /* THE WARHEAD, which is a warhead now and not a handguard.
       Carrying it as `hg: { kind: 'tube', r: 0.072 }` was a reasonable
       hack until you remember that a tube handguard gets four rings of
       cooling slots: it rendered as a cage of octagonal plates on a
       pipe. It also sat BEHIND the muzzle, inside the tube's own
       length, when the whole point of a Panzerfaust is that the bulb
       stands out in front on a stick. 0.555 to 0.755 puts the overall
       length at 1.00 m, which is a Panzerfaust 60 exactly. */
    hg: null,
    warhead: { kind: 'faust', x0: 0.555, x1: 0.755, r: 0.0720 },
    rec: { rear: -0.100, front: 0.020, up: 0.0130, down: 0.0230, w: 0.0120 },
    grip: { x: -0.056, y: -0.0250, len: 0.100, rake: 0.30 },
    sight: { y: 0.0420, frontX: 0.230, rearX: 0.040 },
    mass: 6.2, bound: 0.60,
  }),

  /* Flatter than the Panzerfaust and takes four seconds to reload. A
     long steel pipe with a shoulder rest and two grips. */
  bazooka: tubeSpec({
    muzzle: 1.190,
    barrel: { rear: -0.180, r0: 0.0320, r1: 0.0320, bore: 0.0300, step: 0.600 },
    // A smooth collar round the grip section: an M1's tube has no
    // cooling slots in it and never did.
    hg: { kind: 'tube', x0: 0.300, x1: 0.460, r: 0.0370, slots: false },
    rec: { rear: -0.060, front: 0.060, up: 0.0160, down: 0.0300, w: 0.0150 },
    grip: { x: -0.020, y: -0.0320, len: 0.112, rake: 0.32 },
    trigger: { x: 0.006 },
    sight: { y: 0.0560, frontX: 0.440, rearX: 0.120 },
    mass: 6.0, bound: 0.90,
  }),

  /* The sustainer kicks in after ten metres. Stepped tube, a conical
     blast chamber behind the grip, and the grenade standing off the
     muzzle on a thinner stalk. */
  rpg7: tubeSpec({
    muzzle: 0.650,
    barrel: { rear: -0.300, r0: 0.0210, r1: 0.0210, bore: 0.0200, step: 0.450 },
    // The mid-body flare where the tube widens round the chamber --
    // smooth, like the rest of an RPG's tube.
    hg: { kind: 'tube', x0: 0.180, x1: 0.360, r: 0.0420, slots: false },
    // The heat shield is wood on a real one, not grey polymer.
    furniture: 'wood',
    /* And the grenade, which was simply absent: an RPG-7 without the
       PG-7 standing off the muzzle is a length of pipe. Tail boom out
       of the tube, boat tail up to the 85 mm body, long ogive, fuze
       probe on the nose. */
    warhead: { kind: 'pg7', x0: 0.640, x1: 0.960, r: 0.0425 },
    rec: { rear: -0.140, front: 0.030, up: 0.0150, down: 0.0280, w: 0.0140 },
    grip: { x: -0.090, y: -0.0290, len: 0.108, rake: 0.36 },
    trigger: { x: -0.062 },
    sight: { y: 0.0540, frontX: 0.300, rearX: -0.020 },
    mass: 7.0, bound: 0.75,
  }),

  /* Useless against a man and the last word against a helicopter. Fat
     launch tube, a boxy gripstock slung underneath, and the big square
     sight assembly folded up on the side. */
  stinger: tubeSpec({
    muzzle: 0.680,
    barrel: { rear: -0.300, r0: 0.0350, r1: 0.0350, bore: 0.0320, step: 0.380 },
    // A sealed glass-fibre launch tube. No slots in it either.
    hg: { kind: 'tube', x0: 0.200, x1: 0.420, r: 0.0395, slots: false },
    rec: { rear: -0.170, front: 0.010, up: 0.0130, down: 0.0420, w: 0.0230, e: 4.0 },
    grip: { x: -0.110, y: -0.0420, len: 0.116, rake: 0.30 },
    trigger: { x: -0.082 },
    sight: { y: 0.0600, frontX: 0.180, rearX: -0.090, front: 'ears', rear: 'aperture' },
    mass: 10.1, bound: 0.70,
  }),

  /* Break-action, lobs in an arc. A short fat barrel on a wooden
     stock -- the only launcher here that looks like a shotgun, and the
     only one with furniture. */
  m79: tubeSpec({
    muzzle: 0.420,
    barrel: { rear: 0.010, r0: 0.0250, r1: 0.0245, bore: 0.0200, step: 0.180 },
    rec: { rear: -0.120, front: 0.060, up: 0.0230, down: 0.0230, w: 0.0210, e: 3.0 },
    hg: { kind: 'wood', x0: 0.090, x1: 0.220, r: 0.0270, w: 0.0250, drop: 0.0280, upper: 0.0260 },
    stock: { kind: 'wood', butt: -0.330, comb: 0.0260, drop: 0.0330, w: 0.0230 },
    grip: { x: -0.070, y: -0.0200, len: 0.104, rake: 0.40 },
    trigger: { x: -0.042 },
    sight: { y: 0.0420, frontX: 0.380, rearX: -0.010, rear: 'notch' },
    mass: 2.9, bound: 0.42,
  }),

  /* A revolver for grenades. Six chambers in a drum the size of a
     dinner plate, which is the entire gun -- so the drum is a pan
     magazine lying on its side and `rotary` is not involved. */
  gl6: tubeSpec({
    muzzle: 0.480,
    barrel: { rear: 0.120, r0: 0.0250, r1: 0.0240, bore: 0.0200, step: 0.200 },
    rec: { rear: -0.120, front: 0.030, up: 0.0210, down: 0.0210, w: 0.0195, e: 3.2 },
    hg: { kind: 'tube', x0: 0.260, x1: 0.360, r: 0.0230 },
    stock: { kind: 'tube', butt: -0.300, comb: 0.0230, drop: 0.0250, w: 0.0180 },
    grip: { x: -0.074, y: -0.0210, len: 0.104, rake: 0.36 },
    trigger: { x: -0.046 },
    // The cylinder: faces left and right, centred just ahead of the grip.
    mag: { kind: 'drum', x: 0.052, y: 0.0060, r: 0.0720, w: 0.0420, clear: false },
    sight: { y: 0.0480, frontX: 0.420, rearX: -0.020, rear: 'aperture' },
    rail: { x0: -0.030, x1: 0.020 },
    mass: 5.3, bound: 0.50,
  }),
});

/* ---------------- the special class ----------------

   Ten guns that are each the odd one out in some way: five bolt-action
   rifles that are all stock and barrel, four shotguns that hang their
   magazine UNDER the barrel instead of under the receiver, a crossbow,
   and a thing that is not a gun at all.

   Bolt rifles are the easiest shape in the game -- a long barrel, a
   short receiver, a wooden stock and a bolt handle sticking out of the
   side -- and they are the reason `charge` exists as a separate control
   from the receiver. */
function boltSpec(over) {
  const base = {
    ammoKind: 'full',
    muzzle: 0.620,
    barrel: { rear: 0.060, r0: 0.0102, r1: 0.0078, bore: 0.0039, step: 0.240, gas: false },
    rec: { rear: -0.130, front: 0.070, up: 0.0205, down: 0.0195, w: 0.0155, e: 3.2 },
    port: { x0: 0.006, x1: 0.044, up: 0.0130, down: 0.0020 },
    /* The bolt handle, out to the right and turned down. On a rifle
       that is cycled by hand this is the biggest single thing on the
       outside of the gun, which is why it is not scaled down here the
       way a self-loader's charging handle is. */
    charge: { x: -0.010, y: 0.0060, z: 0.0280 },
    hg: { kind: 'wood', x0: 0.090, x1: 0.320, r: 0.0215, w: 0.0210, drop: 0.0250, upper: 0.0230 },
    grip: { x: -0.096, y: -0.0170, len: 0.104, rake: 0.52 },
    trigger: { x: -0.062 },
    // Five rounds in an internal box that barely shows below the stock.
    mag: { kind: 'box', x: -0.030, y: -0.0200, len: 0.052, curve: 0,
      w: 0.0130, d: 0.0150, r: 0.020, clear: false },
    stock: { kind: 'wood', butt: -0.360, comb: 0.0250, drop: 0.0290, w: 0.0210 },
    sight: { y: 0.0330, frontX: 0.560, rearX: 0.040, front: 'ears', rear: 'notch' },
    handle: null, rail: null, bipod: null, rotary: 0,
    mass: 4.0, bound: 0.62,
  };
  const merged = {};
  for (const k of Object.keys(base)) {
    const b = base[k], o = over[k];
    if (o === null) { merged[k] = null; continue; }
    if (b && typeof b === 'object' && o && typeof o === 'object') merged[k] = Object.assign({}, b, o);
    else merged[k] = (o === undefined ? b : o);
  }
  for (const k of Object.keys(over)) if (!(k in merged)) merged[k] = over[k];
  const out = svcSpec(merged);
  out.cls = 'bolt';
  return out;
}

/* A shotgun's magazine is a TUBE under the barrel, running most of the
   way to the muzzle -- not a box under the receiver. There is no way to
   say that with the box/drum/pan magazine kinds, so it is said with the
   handguard instead: `hg` as a tube at barrel level is exactly the
   right shape in exactly the right place, and it means the pump rides
   on it correctly too. */
function gaugeSpec(over) {
  const base = {
    ammoKind: 'full',
    muzzle: 0.560,
    barrel: { rear: 0.040, r0: 0.0140, r1: 0.0130, bore: 0.0092, step: 0.200, gas: false },
    rec: { rear: -0.130, front: 0.080, up: 0.0215, down: 0.0205, w: 0.0175, e: 3.2 },
    port: { x0: 0.010, x1: 0.056, up: 0.0140, down: 0.0025 },
    charge: { x: 0.020, y: 0.0080, z: 0.0225 },
    // The magazine tube AND the pump, as one run under the barrel.
    hg: { kind: 'tube', x0: 0.110, x1: 0.430, r: 0.0180, drop: 0.0230 },
    grip: { x: -0.090, y: -0.0180, len: 0.104, rake: 0.46 },
    trigger: { x: -0.058 },
    mag: null,
    stock: { kind: 'wood', butt: -0.350, comb: 0.0245, drop: 0.0300, w: 0.0215 },
    sight: { y: 0.0300, frontX: 0.520, rearX: 0.030, front: 'blade', rear: 'notch' },
    handle: null, rail: null, bipod: null, rotary: 0,
    mass: 3.4, bound: 0.56,
  };
  const merged = {};
  for (const k of Object.keys(base)) {
    const b = base[k], o = over[k];
    if (o === null) { merged[k] = null; continue; }
    if (b && typeof b === 'object' && o && typeof o === 'object') merged[k] = Object.assign({}, b, o);
    else merged[k] = (o === undefined ? b : o);
  }
  for (const k of Object.keys(over)) if (!(k in merged)) merged[k] = over[k];
  const out = svcSpec(merged);
  out.cls = 'gauge';
  return out;
}

Object.assign(SERVICE_KINDS, {

  /* Chest and up, once, anywhere on any map. A modern sporting bolt
     rifle: heavy free-floated barrel, a scope and no iron sights on it
     at all, and a pistol-gripped synthetic stock. */
  remington: boltSpec({
    muzzle: 0.680,
    barrel: { r0: 0.0120, r1: 0.0108, step: 0.300 },
    hg: { kind: 'poly', x0: 0.090, x1: 0.300, r: 0.0230, w: 0.0225 },
    stock: { kind: 'poly', butt: -0.370, comb: 0.0270, drop: 0.0250, w: 0.0215 },
    grip: { x: -0.092, y: -0.0180, len: 0.108, rake: 0.30 },
    rail: { x0: -0.070, x1: 0.050 },
    sight: { y: 0.0430, frontX: 0.120, rearX: -0.050, front: 'none', rear: 'scope' },
    mass: 4.3, bound: 0.68,
  }),

  /* Slower to cycle than anything else here. Full-length military
     stock running almost to the muzzle, and the turned-down bolt. */
  kar98: boltSpec({
    muzzle: 0.640,
    hg: { x0: 0.080, x1: 0.480, r: 0.0220 },
    stock: { butt: -0.370, comb: 0.0230, drop: 0.0310 },
    charge: { x: -0.012, y: 0.0020, z: 0.0300 },
    // A straight wrist, not a pistol grip. See the Springfield's.
    grip: { rake: 0.68, deep: 0.96, e: 0.82 },
    /* THE ZF41, AND IT IS MOUNTED FORWARD OF THE ACTION.
     *
       This and the Springfield are both full-stocked wooden bolt
       rifles of the same war and measured 0.256 apart -- under the
       line -- which is a fair thing for a shape comparison to say,
       because as shapes they very nearly are the same rifle. Raising
       the Springfield's scope onto tall rings moved it sixteen
       thousandths and no further: whatever else you hang over a
       receiver, the mass that makes these two alike is a metre of
       walnut and a barrel, and both have both.

       So the difference has to be somewhere the other one has nothing
       at all. The Kar98k's own sniper fitting was the ZF41 -- a 1.5x
       tube the length of a finger, clamped to the REAR SIGHT BASE a
       hand's width down the barrel, with the shooter's eye a foot
       behind it. It sits where a Springfield's forend is, not where
       its scope is. Correct, and it is the only optic in the rack
       mounted forward of the breech. */
    optic: { x0: 0.130, x1: 0.240, r: 0.0098, bell: 0.0110, y: 0.0430 },
    sight: { frontX: 0.590, rearX: 0.090, front: 'ears', rear: 'notch' },
    mass: 3.9, bound: 0.66,
  }),

  /* The bolt is stiff and the stock is a plank. Longer than the Kar,
     straight bolt handle, and no pistol grip to speak of. */
  mosin: boltSpec({
    muzzle: 0.700,
    barrel: { step: 0.280 },
    hg: { x0: 0.080, x1: 0.540, r: 0.0215 },
    stock: { butt: -0.380, comb: 0.0215, drop: 0.0330, w: 0.0225 },
    // Straight out, not turned down: the Mosin's handle is a stick.
    charge: { x: -0.006, y: 0.0180, z: 0.0300 },
    grip: { rake: 0.62 },
    /* The cleaning rod under the barrel and the cruciform spike on the
       end of it. A Mosin was ISSUED with the bayonet fixed and zeroed
       with it on, and without it this and the Kar98k measured 0.277
       apart -- two lengths of walnut with a bolt sticking out of the
       side, which is a fair description of both and a useful one of
       neither. */
    tube: { x0: 0.130, x1: 0.660, r: 0.0034, y: -0.0170 },
    bayonet: { kind: 'spike', x0: 0.690, x1: 0.960, y: -0.0130 },
    sight: { frontX: 0.650, rearX: 0.110 },
    mass: 4.1, bound: 0.88,
  }),

  /* Fifty calibre. Goes through the man, the wall, and whatever was
     behind the wall. A heavy barrel with a big muzzle brake, a bipod,
     and a scope standing well above the receiver. */
  killstreak: boltSpec({
    muzzle: 0.820,
    barrel: { r0: 0.0165, r1: 0.0148, bore: 0.0064, step: 0.360 },
    rec: { rear: -0.150, front: 0.100, up: 0.0240, down: 0.0215, w: 0.0190, e: 3.6 },
    hg: { kind: 'poly', x0: 0.120, x1: 0.360, r: 0.0270, w: 0.0260 },
    stock: { kind: 'poly', butt: -0.400, comb: 0.0290, drop: 0.0250, w: 0.0230 },
    grip: { x: -0.100, y: -0.0190, len: 0.110, rake: 0.28 },
    mag: { len: 0.070, w: 0.0150, d: 0.0180, r: 0.024 },
    /* rake, len, spread -- NOT drop. svcBipod reads P.rake and P.len,
       and passing `drop` left both undefined, so every strut endpoint
       came out NaN and the whole model with it. Three guns, 6 nonsense
       coordinates each, and nothing else in the checks noticed because
       a NaN vertex still counts as a vertex. */
    bipod: { x: 0.300, rake: 0.030, len: 0.140, spread: 0.110 },
    rail: { x0: -0.090, x1: 0.070 },
    /* The other half of that pair, and the answer is to make it the
       opposite kind of fifty: a bolt gun, everything solid, with a can
       on the front instead of a brake and a low scope tucked down onto
       the rail rather than a tower over it. Where the Barrett is a
       skeleton you can see through, this is a slab. */
    tube: { x0: 0.640, x1: 0.840, r: 0.0270, open: true },
    barrel: { r0: 0.0165, r1: 0.0148, bore: 0.0064, step: 0.360, brake: null },
    optic: { x0: -0.110, x1: 0.100, r: 0.0195, bell: 0.0270, y: 0.0560 },
    muzzle: 0.680,
    sight: { y: 0.0520, frontX: 0.140, rearX: -0.060, front: 'none', rear: 'none' },
    mass: 12.4, bound: 0.90,
  }),

  /* Semi-automatic, which means you get to be wrong twice. The big one:
     a ten-round box under the receiver, a recoiling barrel assembly and
     an arrowhead brake on the front of it. */
  barrett: boltSpec({
    muzzle: 0.940,
    barrel: { r0: 0.0170, r1: 0.0152, bore: 0.0064, step: 0.420 },
    rec: { rear: -0.170, front: 0.140, up: 0.0260, down: 0.0230, w: 0.0210, e: 3.8 },
    port: { x0: 0.030, x1: 0.086, up: 0.0170, down: 0.0025 },
    charge: { x: 0.040, y: 0.0150, z: 0.0250 },
    hg: { kind: 'poly', x0: 0.160, x1: 0.380, r: 0.0280, w: 0.0270 },
    stock: { kind: 'poly', butt: -0.420, comb: 0.0300, drop: 0.0240, w: 0.0240 },
    grip: { x: -0.110, y: -0.0200, len: 0.112, rake: 0.26 },
    mag: { kind: 'box', x: -0.046, y: -0.0230, len: 0.150, curve: 0,
      w: 0.0150, d: 0.0190, r: 0.050, clear: true },
    bipod: { x: 0.340, rake: 0.034, len: 0.150, spread: 0.120 },
    rail: { x0: -0.110, x1: 0.090 },
    /* A GLASS THE SIZE OF A THERMOS, the cut-outs down the forend, and
       the arrowhead brake. Against the Kill Streak this measured 0.204
       -- two scoped, bipodded, muzzle-braked fifties, which is exactly
       what they both are, so what has to differ is everything ELSE.
       This one is the semi-automatic: a recoiling barrel assembly in a
       skeletonised chassis you can see straight through, with the
       optic mounted so high it clears the whole receiver. */
    optic: { x0: -0.130, x1: 0.130, r: 0.0260, bell: 0.0340, y: 0.0900 },
    /* ON THE FOREND, which hangs BELOW the bore. Written without a
       yOff these five pairs of ribs went on the bore line, where this
       rifle has nothing but air between the barrel above and the
       handguard under it -- nine floating clusters, caught by
       attached.test.js the first time it ran after. A vent is a hole
       in a surface, so it has to be told which surface; the default of
       zero is right for a tube handguard wrapped round the barrel and
       wrong for every forend that sits under one. */
    vents: { kind: 'slot', x0: 0.180, x1: 0.360, n: 5, r: 0.0300, w: 0.0160,
      yOff: -0.0205 },
    barrel: { r0: 0.0170, r1: 0.0152, bore: 0.0064, step: 0.420, brake: 'slots' },
    mass: 13.5, bound: 0.96,
  }),


  /* ---------------- FIVE MORE THAT FIRE ONCE ----------------

     A sniper section, for the same reason as the shotgun one: five
     long rifles filed under Special alongside a shield and a crossbow
     is a list, not a class. These five are picked so that no two of
     the ten share an action AND a stock: two bolt guns with wooden
     furniture already exist, so the new bolt gun gets a chassis, and
     the new self-loaders are as far apart as a Dragunov and a bullpup.
  */

  /* Semi-automatic, and built to be carried a long way: a skeletonised
     butt with a hole through it, a very thin barrel, and the short
     slotted forend that leaves most of the barrel bare. */
  svd: boltSpec({
    ammoKind: 'full',
    muzzle: 0.760,
    barrel: { rear: 0.055, r0: 0.0112, r1: 0.0088, bore: 0.0039, step: 0.320,
      gas: true, gasAt: 0.300, gasR: 0.0072, gasY: 0.0180, brake: 'slots' },
    rec: { rear: -0.155, front: 0.100, up: 0.0230, down: 0.0205, w: 0.0165, e: 4 },
    port: { x0: 0.010, x1: 0.056, up: 0.0150, down: 0.0025 },
    charge: { x: 0.062, y: 0.0150, z: 0.0215 },
    hg: { kind: 'wood', x0: 0.108, x1: 0.255, drop: 0.0250, w: 0.0215, upper: 0.0260 },
    vents: { kind: 'slot', x0: 0.125, x1: 0.240, n: 4, r: 0.0215, w: 0.0120 },
    mag: { kind: 'box', x: -0.030, y: -0.0215, len: 0.110, curve: 0.20,
      w: 0.0130, d: 0.0150, r: 0.010, clear: false },
    grip: { x: -0.082, y: -0.0185, len: 0.104, rake: 0.36 },
    /* The skeleton butt, as on the PKM -- the same country, the same
       decade and very nearly the same part. It is also the fastest way
       to tell this from every other long rifle in the rack, all of
       which have something solid back there. */
    stock: { kind: 'skeleton', butt: -0.395, comb: 0.0250, drop: 0.0290,
      w: 0.0180, hole: 0.048 },
    optic: { x0: -0.140, x1: 0.030, r: 0.0180, bell: 0.0210, y: 0.0560 },
    sight: { y: 0.0360, frontX: 0.620, rearX: 0.120, front: 'ears', rear: 'notch' },
    mass: 4.6, bound: 0.80,
  }),

  /* Ten rounds, a bolt you work without taking your eye off it, and
     wood all the way to the muzzle. The scope sits off to the LEFT,
     because the charger bridge is where it would otherwise go. */
  lee: boltSpec({
    muzzle: 0.620,
    barrel: { rear: 0.050, r0: 0.0122, r1: 0.0098, step: 0.260, gas: false },
    rec: { rear: -0.145, front: 0.092, up: 0.0235, down: 0.0210, w: 0.0172, e: 3.2 },
    /* A bolt handle that turns down INTO a recess at the back of the
       receiver, close to the hand -- which is why this one is quicker
       than the Mauser pattern and why the handle is further back than
       any other bolt gun's here. */
    charge: { x: -0.060, y: -0.0020, z: 0.0290 },
    hg: { kind: 'wood', x0: 0.075, x1: 0.480, r: 0.0225, w: 0.0225, drop: 0.0265,
      upper: 0.0230 },
    // Ten, in two rows, in a box that stands well below the stock.
    mag: { kind: 'box', x: -0.024, y: -0.0210, len: 0.082, curve: 0.06,
      w: 0.0150, d: 0.0165, r: 0.030, clear: false },
    grip: { x: -0.092, y: -0.0175, len: 0.104, rake: 0.58, deep: 1.06, e: 0.86 },
    stock: { kind: 'wood', butt: -0.370, comb: 0.0240, drop: 0.0320, w: 0.0220 },
    optic: { x0: -0.096, x1: 0.040, r: 0.0140, bell: 0.0160, y: 0.0480 },
    sight: { y: 0.0340, frontX: 0.570, rearX: 0.060, front: 'ears', rear: 'aperture' },
    mass: 4.2, bound: 0.68,
  }),

  /* An aluminium chassis with the barrel floating free inside it, a
     thumbhole through the butt, a folding bipod and a glass the size
     of a rolling pin. Nothing wooden anywhere on it. */
  arctic: boltSpec({
    muzzle: 0.740,
    barrel: { rear: 0.045, r0: 0.0145, r1: 0.0132, bore: 0.0046, step: 0.330,
      gas: false, brake: 'cage' },
    rec: { rear: -0.160, front: 0.105, up: 0.0245, down: 0.0220, w: 0.0195, e: 6 },
    charge: { x: -0.030, y: 0.0080, z: 0.0300 },
    /* The chassis: a squared aluminium forend with lightening cuts all
       down it, standing clear of a barrel that touches nothing. */
    hg: { kind: 'poly', x0: 0.095, x1: 0.420, r: 0.0250, w: 0.0250, drop: 0.0250 },
    vents: { kind: 'slot', x0: 0.120, x1: 0.400, n: 7, r: 0.0270, w: 0.0130,
      yOff: -0.0190 },
    mag: { kind: 'box', x: -0.034, y: -0.0225, len: 0.092, curve: 0,
      w: 0.0140, d: 0.0170, r: 0.010, clear: false },
    grip: { x: -0.100, y: -0.0195, len: 0.110, rake: 0.22, wide: 1.10, e: 1.25 },
    // The thumbhole butt: the same hole the PKM has, in a rifle stock.
    stock: { kind: 'skeleton', butt: -0.400, comb: 0.0285, drop: 0.0250,
      w: 0.0210, hole: 0.040 },
    bipod: { x: 0.380, rake: 0.030, len: 0.150, spread: 0.110 },
    optic: { x0: -0.120, x1: 0.105, r: 0.0235, bell: 0.0310, y: 0.0700 },
    rail: { x0: -0.100, x1: 0.080 },
    sight: { y: 0.0520, frontX: 0.140, rearX: -0.060, front: 'none', rear: 'none' },
    mass: 6.8, bound: 0.84,
  }),

  /* The Great War rifle with a telescope screwed to the side of it and
     the bolt handle bent down out of the way of the eyepiece. Five
     rounds, no aperture, and a cleaning rod under the barrel. */
  springfield: boltSpec({
    muzzle: 0.700,
    barrel: { rear: 0.052, r0: 0.0118, r1: 0.0086, step: 0.300, gas: false },
    rec: { rear: -0.140, front: 0.095, up: 0.0230, down: 0.0200, w: 0.0168, e: 3.0 },
    charge: { x: -0.026, y: -0.0060, z: 0.0310 },
    hg: { kind: 'wood', x0: 0.080, x1: 0.510, r: 0.0220, w: 0.0220, drop: 0.0260,
      upper: 0.0225 },
    tube: { x0: 0.140, x1: 0.600, r: 0.0032, y: -0.0165 },
    mag: { kind: 'box', x: -0.028, y: -0.0195, len: 0.042, curve: 0,
      w: 0.0135, d: 0.0155, r: 0.020, clear: false },
    /* The C-stock's PISTOL GRIP -- a real one, dropping away under the
       hand, where a Kar98k has a straight wrist you wrap round. It is
       the last thing separating two rifles that a shape comparison
       kept calling one rifle, and it is a genuine difference: the two
       were built thirty years and one design philosophy apart. */
    grip: { x: -0.096, y: -0.0180, len: 0.114, rake: 0.30, deep: 1.14, e: 1.0 },
    stock: { kind: 'wood', butt: -0.375, comb: 0.0230, drop: 0.0330, w: 0.0215 },
    /* UP ON TALL RINGS, and that is the whole difference between this
       and a Kar98k: two full-stocked wooden bolt rifles of the same
       war measured 0.240 apart -- under the line -- with the scope
       drawn low and tucked down onto a receiver that was already solid
       there. Mass added inside a shape that is already occupied does
       not change the shape. Lifted clear, into the empty air above the
       bore where a sniper's glass actually sits, it does.

       It is also more honest: the bolt on an A4 is bent down BECAUSE
       the scope is in the way, and the model has the bent bolt
       already. */
    optic: { x0: -0.056, x1: 0.136, r: 0.0150, bell: 0.0180, y: 0.0640 },
    sight: { y: 0.0330, frontX: 0.610, rearX: 0.090, front: 'none', rear: 'none' },
    mass: 4.3, bound: 0.72,
  }),

  /* Ours. A self-loading .338 with the whole action behind the
     trigger, so it carries a thirty-inch barrel in the length of a
     carbine -- and with no butt at all, because the receiver goes all
     the way back to the shoulder. */
  longwake: boltSpec({
    ammoKind: 'full',
    muzzle: 0.560,
    barrel: { rear: 0.050, r0: 0.0150, r1: 0.0130, bore: 0.0050, step: 0.240,
      gas: true, gasAt: 0.330, gasR: 0.0080, gasY: -0.0230, brake: 'slots' },
    rec: { rear: -0.280, front: 0.075, up: 0.0280, down: 0.0250, w: 0.0200, e: 6 },
    port: { x0: -0.185, x1: -0.130, up: 0.0170, down: 0.0030 },
    charge: { x: 0.020, y: 0.0200, z: 0.0240 },
    hg: { kind: 'poly', x0: 0.090, x1: 0.300, r: 0.0240, w: 0.0240, drop: 0.0240 },
    vents: { x0: 0.110, x1: 0.290, n: 6, r: 0.0240, r0: 0.0050 },
    mag: { kind: 'box', x: -0.175, y: -0.0250, len: 0.105, curve: 0.08,
      w: 0.0145, d: 0.0175, r: 0.010, clear: false },
    grip: { x: -0.048, y: -0.0210, len: 0.108, rake: 0.24, wide: 1.12, e: 1.3 },
    trigger: { x: -0.014 },
    // Nothing behind the shoulder: the receiver IS the butt.
    stock: { kind: 'none' },
    foregrip: { x: 0.175, len: 0.092, rake: 0.06, under: 0.0240 },
    bipod: { x: 0.290, rake: 0.028, len: 0.140, spread: 0.100 },
    optic: { x0: -0.230, x1: 0.010, r: 0.0230, bell: 0.0300, y: 0.0640 },
    rail: { x0: -0.250, x1: 0.040 },
    sight: { y: 0.0500, frontX: 0.120, rearX: -0.200, front: 'none', rear: 'none' },
    mass: 6.4, bound: 0.66,
  }),

  /* Eight pellets, one pump. The pump itself is the handguard, ribbed,
     sitting on the magazine tube. */
  scatter: gaugeSpec({
    muzzle: 0.560,
    mass: 3.4,
  }),

  /* Two barrels, no stock, and the range of an angry handshake. Side by
     side, cut down to nothing, with a pistol grip where the stock was
     -- so `rotary: 2` puts two bores where one would go. */
  sawnoff: gaugeSpec({
    muzzle: 0.300,
    barrel: { rear: 0.030, r0: 0.0190, r1: 0.0185, bore: 0.0092, step: 0.120 },
    rotary: 2,
    /* Its own cluster geometry. The shared default is tuned for the
       Hydra's six barrels on a spindle; two 12-bores lie side by side
       and touching, on 24 mm centres. */
    rotaryR: 0.0122, rotaryBr: 0.0120,
    rec: { rear: -0.100, front: 0.050, up: 0.0205, down: 0.0195, w: 0.0195 },
    hg: null,
    // Cut off behind the grip: there is no stock, which is the point.
    stock: null,
    grip: { x: -0.062, y: -0.0180, len: 0.100, rake: 0.42 },
    trigger: { x: -0.036 },
    sight: { y: 0.0270, frontX: 0.280, rearX: -0.020, rear: 'none' },
    mass: 2.6, bound: 0.32,
  }),

  /* Self-loading twelve gauge. You can hold the trigger. A box
     magazine rather than a tube, a gas system under the barrel, and a
     synthetic stock. */
  breakwater: gaugeSpec({
    muzzle: 0.600,
    barrel: { r0: 0.0145, r1: 0.0135, step: 0.220, gas: true, gasAt: 0.250,
      gasR: 0.0090, gasY: 0.0230 },
    hg: { kind: 'poly', x0: 0.120, x1: 0.300, r: 0.0230, w: 0.0225, drop: 0.0230 },
    stock: { kind: 'poly', butt: -0.340, comb: 0.0260, drop: 0.0270, w: 0.0210 },
    grip: { x: -0.088, y: -0.0185, len: 0.106, rake: 0.30 },
    mag: { kind: 'box', x: -0.026, y: -0.0220, len: 0.130, curve: 0.12,
      w: 0.0160, d: 0.0200, r: 0.044, clear: true },
    rail: { x0: -0.060, x1: 0.060 },
    mass: 3.8, bound: 0.58,
  }),


  /* ---------------- THE OTHER TEN GAUGES ----------------

     A shotgun section, rather than three shotguns filed under Special
     with a crossbow and a riot shield. Ten more, and the rule they are
     built to is the one the rack as a whole is now measured by: two
     weapons may share a class and a calibre, but not a silhouette. So
     these are ten different ACTIONS -- pump, break, lever, revolver,
     long-recoil, gas, bullpup -- rather than ten barrel lengths, and
     each one owns a part nothing else in the game has. */

  /* Nineteen-seventeen, and the reason the other side complained. A
     pump with a ventilated heat shield over the barrel, a lug on the
     end of it, and a bayonet on the lug. */
  trench: gaugeSpec({
    muzzle: 0.520,
    barrel: { rear: 0.040, r0: 0.0142, r1: 0.0132, step: 0.190,
      shroud: true, shroudX0: 0.150, shroudX1: 0.455, shroudR: 0.0230 },
    hg: { kind: 'tube', x0: 0.105, x1: 0.330, r: 0.0180, drop: 0.0230 },
    bayonet: { kind: 'knife', x0: 0.470, x1: 0.700, y: -0.0190 },
    stock: { kind: 'wood', butt: -0.345, comb: 0.0250, drop: 0.0305, w: 0.0220 },
    sight: { y: 0.0270, frontX: 0.470, rearX: 0.030, front: 'blade', rear: 'none' },
    grip: { x: -0.086, y: -0.0180, len: 0.102, rake: 0.50, deep: 1.04, checkN: [5, 9] },
    mass: 3.9, bound: 0.70,
  }),

  /* Two barrels, side by side, and nothing else. Full length, a single
     wooden splinter forend, and the hammers out in the open where you
     can see whether it is going to go off. */
  coach: gaugeSpec({
    muzzle: 0.690,
    /* `rear` AT THE BREECH FACE, not 20 mm in front of it. svcRotary
       starts its tubes at barrel.rear + 0.030 and its breech disc at
       + 0.020, so a rear of 0.020 on a receiver ending at 0.026 left
       the whole barrel assembly -- both tubes, the forend and the rib,
       650 mm and 130 pieces of it -- hanging fourteen millimetres
       clear of the gun. attached.test.js named it as one cluster,
       which is exactly what a detached barrel looks like from
       outside. */
    barrel: { rear: 0.002, r0: 0.0186, r1: 0.0180, bore: 0.0092, step: 0.320 },
    rotary: 2, rotaryR: 0.0124, rotaryBr: 0.0122,
    rec: { rear: -0.115, front: 0.036, up: 0.0200, down: 0.0190, w: 0.0198, e: 3.0 },
    port: null, charge: null,
    hg: { kind: 'wood', x0: 0.055, x1: 0.185, drop: 0.0235, w: 0.0240, upper: null },
    grip: { x: -0.080, y: -0.0180, len: 0.104, rake: 0.56, deep: 1.08, e: 0.86 },
    trigger: { x: -0.050 },
    // Two of them, standing up behind the breech where a coach gun's are.
    hammer: { kind: 'spur', x: -0.078, y: 0.0136 },
    rib: { x0: 0.040, x1: 0.660, hw: 0.0092, onBarrel: true },
    stock: { kind: 'wood', butt: -0.365, comb: 0.0255, drop: 0.0340, w: 0.0235 },
    sight: { y: 0.0300, frontX: 0.660, rearX: 0.020, front: 'blade', rear: 'none' },
    mass: 3.1, bound: 0.66,
  }),

  /* The same two barrels stacked instead of paired, which is a
     completely different gun to look down: one narrow rib with a
     vented top and a receiver deep enough to hide the lower breech. */
  longshore: gaugeSpec({
    muzzle: 0.720,
    barrel: { rear: 0.024, r0: 0.0152, r1: 0.0146, bore: 0.0092, step: 0.340 },
    rec: { rear: -0.120, front: 0.030, up: 0.0290, down: 0.0230, w: 0.0165, e: 3.4 },
    port: null, charge: null,
    /* The second barrel, ABOVE the first. `rotary: 2` puts them side by
       side, which is the coach gun and is the wrong answer here -- a
       tube alongside says over-and-under and says it in one field. */
    tube: { x0: 0.024, x1: 0.720, r: 0.0146, y: 0.0300 },
    hg: { kind: 'wood', x0: 0.060, x1: 0.210, drop: 0.0230, w: 0.0210, upper: null },
    grip: { x: -0.082, y: -0.0180, len: 0.106, rake: 0.52, deep: 1.02, checkN: [6, 9] },
    trigger: { x: -0.052 },
    rib: { x0: 0.050, x1: 0.700, hw: 0.0070, vent: true, onBarrel: true },
    stock: { kind: 'wood', butt: -0.370, comb: 0.0260, drop: 0.0320, w: 0.0225 },
    sight: { y: 0.0480, frontX: 0.700, rearX: 0.030, front: 'blade', rear: 'none' },
    mass: 3.5, bound: 0.70,
  }),

  /* Thirty-two shells on a drum and a trigger that does not care how
     many of them are left. Everything about it is polymer, everything
     is square, and the drum is bigger than the receiver. */
  grinder: gaugeSpec({
    muzzle: 0.480,
    barrel: { rear: 0.035, r0: 0.0148, r1: 0.0138, step: 0.180, gas: true,
      gasAt: 0.230, gasR: 0.0092, gasY: -0.0235, brake: 'slots' },
    rec: { rear: -0.150, front: 0.095, up: 0.0245, down: 0.0230, w: 0.0195, e: 6 },
    hg: { kind: 'poly', x0: 0.110, x1: 0.270, r: 0.0240, w: 0.0240, drop: 0.0240 },
    mag: null,
    ammoBox: { kind: 'drum', x: -0.020, r: 0.0720, w: 0.0340, drop: 0.002 },
    grip: { x: -0.092, y: -0.0190, len: 0.108, rake: 0.28, wide: 1.18, e: 1.4 },
    trigger: { x: -0.060 },
    foregrip: { x: 0.180, len: 0.096, rake: 0.08, under: 0.0240 },
    stock: { kind: 'poly', butt: -0.330, comb: 0.0250, drop: 0.0230, w: 0.0215 },
    rail: { x0: -0.110, x1: 0.060 },
    sight: { y: 0.0430, frontX: 0.250, rearX: -0.090, front: 'ears', rear: 'aperture' },
    mass: 5.4, bound: 0.62,
  }),

  /* Worked by throwing a hoop forward and catching it. Nothing else in
     the game is, and the hoop is the whole outline. */
  ranger: gaugeSpec({
    muzzle: 0.540,
    barrel: { rear: 0.045, r0: 0.0150, r1: 0.0142, step: 0.210 },
    rec: { rear: -0.128, front: 0.070, up: 0.0260, down: 0.0250, w: 0.0180, e: 3.2 },
    port: { x0: 0.006, x1: 0.046, up: 0.0150, down: 0.0030 },
    charge: null,
    lever: { x0: -0.110, x1: 0.030, drop: 0.082 },
    hammer: { kind: 'spur', x: -0.118, y: 0.0170 },
    // A tube magazine under the barrel, and no pump riding on it.
    tube: { x0: 0.090, x1: 0.480, r: 0.0130, y: -0.0250 },
    hg: { kind: 'wood', x0: 0.080, x1: 0.180, drop: 0.0225, w: 0.0195, upper: null },
    grip: { x: -0.110, y: -0.0190, len: 0.108, rake: 0.62, deep: 1.10, e: 0.84 },
    trigger: { x: -0.062 },
    stock: { kind: 'wood', butt: -0.360, comb: 0.0255, drop: 0.0350, w: 0.0225 },
    sight: { y: 0.0310, frontX: 0.510, rearX: 0.050, front: 'blade', rear: 'notch' },
    mass: 3.6, bound: 0.66,
  }),

  /* Two magazine tubes, a switch between them, and the whole action
     behind the trigger so the thing is fourteen inches shorter than it
     has any right to be. */
  kestrel12: gaugeSpec({
    muzzle: 0.330,
    barrel: { rear: 0.030, r0: 0.0140, r1: 0.0132, step: 0.140 },
    rec: { rear: -0.230, front: 0.050, up: 0.0270, down: 0.0250, w: 0.0210, e: 6 },
    port: { x0: -0.150, x1: -0.105, up: 0.0160, down: 0.0030 },
    charge: { x: 0.010, y: 0.0190, z: 0.0240 },
    /* BOTH of them, and the pair is the gun. Side by side under the
       barrel, each as long as the receiver, which is why the weapon is
       as wide as it is short. */
    tube: [{ x0: -0.170, x1: 0.290, r: 0.0128, y: -0.0250, z: -0.0140 },
      { x0: -0.170, x1: 0.290, r: 0.0128, y: -0.0250, z: 0.0140 }],
    hg: { kind: 'none' },
    foregrip: { x: 0.140, len: 0.090, rake: 0.06, under: 0.0330 },
    grip: { x: -0.036, y: -0.0200, len: 0.108, rake: 0.26, wide: 1.14, e: 1.35 },
    trigger: { x: -0.006 },
    mag: null,
    stock: { kind: 'none' },
    rail: { x0: -0.190, x1: 0.020 },
    sight: { y: 0.0480, frontX: 0.040, rearX: -0.160, front: 'ears', rear: 'aperture' },
    mass: 3.2, bound: 0.44,
  }),

  /* The whole barrel comes back with the bolt when it fires, which is
     why the back of the receiver is squared off into a hump. Once seen,
     never mistaken for anything else. */
  marshback: gaugeSpec({
    muzzle: 0.620,
    barrel: { rear: 0.045, r0: 0.0146, r1: 0.0138, step: 0.240 },
    /* THE HUMP. The receiver does not taper into the wrist of the
       stock, it stops dead in a square shoulder -- and that step is
       the one thing everybody can name about this action. */
    rec: { rear: -0.150, front: 0.088, up: 0.0330, down: 0.0215, w: 0.0180, e: 7 },
    port: { x0: 0.006, x1: 0.052, up: 0.0180, down: 0.0030 },
    charge: { x: 0.030, y: 0.0110, z: 0.0200 },
    tube: { x0: 0.100, x1: 0.500, r: 0.0130, y: -0.0250 },
    hg: { kind: 'wood', x0: 0.095, x1: 0.215, drop: 0.0230, w: 0.0200, upper: null },
    grip: { x: -0.100, y: -0.0185, len: 0.106, rake: 0.58, deep: 1.06, e: 0.88 },
    trigger: { x: -0.056 },
    stock: { kind: 'wood', butt: -0.360, comb: 0.0250, drop: 0.0330, w: 0.0225 },
    rib: { x0: -0.140, x1: 0.086, hw: 0.0066 },
    sight: { y: 0.0300, frontX: 0.600, rearX: 0.040, front: 'blade', rear: 'none' },
    mass: 4.1, bound: 0.70,
  }),

  /* Fourteen inches, no stock, and a ring of steel teeth on the muzzle
     for standing the barrel off a hinge before you fire through it. */
  doorbreaker: gaugeSpec({
    muzzle: 0.300,
    barrel: { rear: 0.030, r0: 0.0146, r1: 0.0138, step: 0.120 },
    rec: { rear: -0.115, front: 0.072, up: 0.0215, down: 0.0205, w: 0.0180, e: 5 },
    breacher: { r: 0.0270, n: 3, len: 0.036 },
    tube: { x0: 0.085, x1: 0.265, r: 0.0128, y: -0.0250 },
    hg: { kind: 'poly', x0: 0.090, x1: 0.200, r: 0.0210, w: 0.0210, drop: 0.0230 },
    grip: { x: -0.070, y: -0.0180, len: 0.106, rake: 0.30, wide: 1.12, e: 1.3 },
    trigger: { x: -0.040 },
    // No stock at all, and a hook off the back of the grip instead.
    stock: { kind: 'none' },
    rail: { x0: -0.095, x1: 0.030 },
    sight: { y: 0.0330, frontX: 0.055, rearX: -0.080, front: 'ears', rear: 'aperture' },
    mass: 2.6, bound: 0.36,
  }),

  /* Twelve rounds on a spring-wound cylinder as wide as your hand, and
     a folding wire stock over the top of it. */
  carousel: gaugeSpec({
    muzzle: 0.420,
    barrel: { rear: 0.120, r0: 0.0148, r1: 0.0138, step: 0.160 },
    rec: { rear: -0.130, front: 0.020, up: 0.0230, down: 0.0215, w: 0.0175, e: 4 },
    port: null,
    /* Not `rotary`. See the Webley: `cylinder` is the part with
       chambers in it and `rotary` is a cluster of barrels, and sharing
       the field between them cost that revolver its barrel. */
    cylinder: { x0: -0.012, x1: 0.104, r: 0.0480, n: 12, bore: 0.0092 },
    charge: { x: -0.060, y: 0.0140, z: 0.0230 },
    hg: { kind: 'none' },
    foregrip: { x: 0.185, len: 0.088, rake: 0.08, under: 0.0140 },
    grip: { x: -0.084, y: -0.0190, len: 0.106, rake: 0.34, wide: 1.06, e: 1.2 },
    trigger: { x: -0.050 },
    mag: null,
    stock: { kind: 'wire', butt: -0.280, comb: 0.0200, drop: 0.0240, w: 0.0180 },
    sight: { y: 0.0300, frontX: 0.400, rearX: -0.100, front: 'blade', rear: 'notch' },
    mass: 4.4, bound: 0.52,
  }),

  /* One barrel, one shell, and a bore you could post a letter down.
     Breaks at the hinge, has an outside hammer you thumb back by hand,
     and weighs as much as a machine gun. */
  anvil: gaugeSpec({
    ammoKind: 'full',
    muzzle: 0.800,
    barrel: { rear: 0.020, r0: 0.0250, r1: 0.0235, bore: 0.0170, step: 0.380 },
    rec: { rear: -0.135, front: 0.024, up: 0.0245, down: 0.0235, w: 0.0230, e: 3.0 },
    port: null, charge: null, mag: null,
    hg: { kind: 'wood', x0: 0.055, x1: 0.195, drop: 0.0265, w: 0.0270, upper: null },
    hammer: { kind: 'spur', x: -0.096, y: 0.0180 },
    grip: { x: -0.092, y: -0.0190, len: 0.110, rake: 0.60, deep: 1.16, wide: 1.08,
      e: 0.82, checkN: [5, 10], checkH: 0.0014 },
    trigger: { x: -0.058 },
    stock: { kind: 'wood', butt: -0.380, comb: 0.0270, drop: 0.0360, w: 0.0250 },
    sight: { y: 0.0380, frontX: 0.770, rearX: 0.010, front: 'ears', rear: 'notch' },
    mass: 6.2, bound: 0.78,
  }),

  /* Silent, arcs like a thrown rock. A rail with a stock on it, a
     prod across the front, a string, and a bolt lying in the groove.
   *
     The limbs used to be drawn by `bipod`, on the reasoning -- which
     was written down right here -- that "two arms swept out and
     forward from a point under the barrel is exactly what a bipod is
     and exactly what a crossbow's limbs are". They are not. A bipod is
     two straight legs with rubber feet, and this came out as a rifle
     with an X across the front and, fatally, no string on it. A bow
     without a string is a stick. `limbs` builds the real thing. */
  crossbow: boltSpec({
    ammoKind: 'full',
    muzzle: 0.560,
    barrel: { rear: -0.020, r0: 0.0090, r1: 0.0080, bore: 0.0050, step: 0.240 },
    rec: { rear: -0.140, front: 0.120, up: 0.0140, down: 0.0130, w: 0.0110, e: 4.4 },
    port: null, charge: null,
    hg: { kind: 'poly', x0: 0.140, x1: 0.320, r: 0.0130, w: 0.0135 },
    stock: { kind: 'poly', butt: -0.330, comb: 0.0180, drop: 0.0240, w: 0.0160 },
    grip: { x: -0.084, y: -0.0170, len: 0.102, rake: 0.32 },
    mag: null,
    bipod: null,
    limbs: { x: 0.390, y: 0.0060, spread: 0.290, sweep: 0.048, latch: 0.116 },
    rail: { x0: -0.080, x1: 0.060 },
    sight: { y: 0.0380, frontX: 0.150, rearX: -0.060, front: 'none', rear: 'scope' },
    mass: 3.1, bound: 0.60,
  }),

  /* It is not a gun. It is a wall you can take with you: a slab of
     laminate with a vision slit across the top, a frame behind it and
     a handle to carry it by. No barrel, no sights, no magazine -- and
     the spec has to say all three, or the builder puts a muzzle on a
     shield. */
  riotshield: svcSpec({
    muzzle: 0.020,
    barrel: { rear: 0.000, r0: 0.0020, r1: 0.0020, bore: 0.0010, step: 0.010, gas: false },
    // The shield face itself: wide, tall, and only centimetres thick.
    rec: { rear: -0.300, front: 0.020, up: 0.2600, down: 0.2600, w: 0.0180, e: 8.0 },
    port: { x0: -0.070, x1: 0.000, up: 0.2050, down: 0.1550 },   // the vision slit
    charge: null, hg: null, stock: null,
    grip: { x: -0.150, y: -0.0200, len: 0.108, rake: 0.10 },
    trigger: null,
    mag: null,
    /* A shield HAS a sight, and it is the only reason the viewport is
       there: the rim of the vision slit is what you line up over. It
       sits at the top of the slit, which is above the bore -- the bore
       here being the notional line through the middle of the slab. */
    sight: { y: 0.2150, frontX: -0.010, rearX: -0.250, front: 'blade', rear: 'notch' },
    handle: { x0: -0.230, x1: -0.090, y: 0.0000, r: 0.0130 },
    rail: null, bipod: null, rotary: 0,
    mass: 7.5, bound: 0.44,
    cls: 'shield',
  }),
});
