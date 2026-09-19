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
    rec: { rear: -0.052, front: 0.098, up: 0.0140, down: 0.0120, w: 0.0115, e: 4.2 },
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
    muzzle: 0.222, rec: { front: 0.104, up: 0.0146, e: 3.6 },
    grip: { len: 0.096 }, mag: { len: 0.088, r: 0.032 },
    sight: { frontX: 0.098, rear: 'notch' },
    mass: 1.15,
  }),

  /* Fifty calibre out of a pistol. Everything about it is oversized:
     a slab slide, a fat bore, a grip you need two hands on, and a
     compensator cut into the top of the barrel. */
  model5: sideSpec({
    ammoKind: 'full',
    muzzle: 0.242,
    barrel: { rear: 0.026, r0: 0.0112, r1: 0.0098, bore: 0.0064, step: 0.090 },
    rec: { rear: -0.060, front: 0.132, up: 0.0186, down: 0.0150, w: 0.0150, e: 4.4 },
    port: { x0: 0.040, x1: 0.084, up: 0.0130, down: 0.0020 },
    grip: { x: -0.044, y: -0.0190, len: 0.108, rake: 0.26 },
    mag: { x: -0.044, y: -0.0210, len: 0.100, w: 0.0110, d: 0.0130, r: 0.028 },
    sight: { y: 0.0230, frontX: 0.112, rearX: -0.046 },
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
    mass: 1.1, bound: 0.18,
  }),

  /* The broomhandle. Its magazine is a box AHEAD of the trigger, which
     no other pistol in the game has, and the grip really is a broom
     handle -- round in section and almost vertical. */
  mauser: sideSpec({
    ammoKind: 'inter',
    muzzle: 0.254,
    barrel: { rear: 0.074, r0: 0.0082, r1: 0.0068, bore: 0.0039, step: 0.110 },
    rec: { rear: -0.066, front: 0.070, up: 0.0158, down: 0.0134, w: 0.0122, e: 3.4 },
    port: { x0: 0.006, x1: 0.040, up: 0.0110, down: 0.0015 },
    grip: { x: -0.048, y: -0.0170, len: 0.086, rake: 0.16 },
    // Forward of the trigger, which is the whole silhouette of this gun.
    mag: { x: 0.016, y: -0.0190, len: 0.074, w: 0.0098, d: 0.0120, r: 0.020, curve: 0 },
    sight: { y: 0.0210, frontX: 0.226, rearX: 0.030, rear: 'notch' },
    mass: 1.25, bound: 0.20,
  }),

  /* The toggle flips up on top when it fires. Raked grip, a barrel that
     steps down hard, and the toggle knuckle standing proud of the
     breech -- which is what `charge` draws here. */
  luger: sideSpec({
    muzzle: 0.222,
    barrel: { rear: 0.034, r0: 0.0086, r1: 0.0064, bore: 0.0045, step: 0.052 },
    rec: { rear: -0.056, front: 0.034, up: 0.0148, down: 0.0126, w: 0.0116, e: 3.2 },
    port: { x0: 0.000, x1: 0.026, up: 0.0100, down: 0.0015 },
    charge: { x: -0.030, y: 0.0165, z: 0.0130 },
    grip: { x: -0.046, y: -0.0170, len: 0.094, rake: 0.58 },
    mag: { x: -0.046, y: -0.0190, len: 0.086, r: 0.030 },
    sight: { y: 0.0200, frontX: 0.198, rearX: -0.044 },
    mass: 0.95, bound: 0.17,
  }),

  /* Fifteen rounds and nothing to say about any of them. A modern
     service pistol: polymer frame, double-stack magazine, an accessory
     rail under the dust cover. */
  p226: sideSpec({
    muzzle: 0.196,
    barrel: { rear: 0.018, r0: 0.0082, r1: 0.0070, bore: 0.0046, step: 0.060 },
    rec: { rear: -0.050, front: 0.092, up: 0.0146, down: 0.0124, w: 0.0126, e: 4.6 },
    port: { x0: 0.026, x1: 0.058, up: 0.0098, down: 0.0015 },
    grip: { x: -0.034, y: -0.0165, len: 0.098, rake: 0.24 },
    // Double stack: wider and deeper than a single-column magazine.
    mag: { x: -0.034, y: -0.0185, len: 0.094, w: 0.0116, d: 0.0112, r: 0.030 },
    rail: { x0: 0.030, x1: 0.070 },
    sight: { y: 0.0180, frontX: 0.086, rearX: -0.038 },
    mass: 0.96, bound: 0.16,
  }),

  /* The same fast bullet as the broomhandle in something you can carry.
     Slim, straight-gripped, and machined flat all over. */
  tokarev: sideSpec({
    // 7.62x25, which is a bottlenecked PISTOL round and not 7.62x39.
    ammoKind: 'pistolBottle',
    muzzle: 0.194,
    barrel: { rear: 0.018, r0: 0.0076, r1: 0.0062, bore: 0.0039, step: 0.062 },
    rec: { rear: -0.048, front: 0.090, up: 0.0136, down: 0.0116, w: 0.0110, e: 4.0 },
    port: { x0: 0.024, x1: 0.054, up: 0.0092, down: 0.0015 },
    grip: { x: -0.034, y: -0.0160, len: 0.092, rake: 0.20 },
    mag: { x: -0.034, y: -0.0180, len: 0.086, w: 0.0088, d: 0.0104, r: 0.028 },
    sight: { y: 0.0170, frontX: 0.084, rearX: -0.036 },
    mass: 0.85, bound: 0.15,
  }),

  /* Seventeen rounds in under a second. A machine pistol, and the thing
     that says so is the extended magazine hanging well below the grip
     and the selector on the slide. */
  g18: sideSpec({
    muzzle: 0.188,
    barrel: { rear: 0.016, r0: 0.0080, r1: 0.0068, bore: 0.0046, step: 0.056 },
    rec: { rear: -0.048, front: 0.088, up: 0.0144, down: 0.0122, w: 0.0128, e: 4.8 },
    port: { x0: 0.024, x1: 0.056, up: 0.0096, down: 0.0015 },
    grip: { x: -0.032, y: -0.0165, len: 0.096, rake: 0.22 },
    // Long stick, and it is the silhouette: it reaches past the hand.
    mag: { x: -0.032, y: -0.0185, len: 0.148, w: 0.0116, d: 0.0112, r: 0.034 },
    rail: { x0: 0.028, x1: 0.066 },
    sight: { y: 0.0178, frontX: 0.080, rearX: -0.036 },
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
    sight: { frontX: 0.650, rearX: 0.110 },
    mass: 4.1, bound: 0.70,
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
    sight: { y: 0.0520, frontX: 0.140, rearX: -0.060, front: 'none', rear: 'scope' },
    mass: 12.4, bound: 0.84,
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
    sight: { y: 0.0560, frontX: 0.150, rearX: -0.080, front: 'none', rear: 'scope' },
    mass: 13.5, bound: 0.96,
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
