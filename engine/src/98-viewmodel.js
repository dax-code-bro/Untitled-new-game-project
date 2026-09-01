/* ============================================================
   VIEWMODEL ARMS — the hands that hold the gun.

   A first-person weapon floating unsupported is the single most
   obvious tell that a game is a prototype. These are built in the
   weapon's own local space (muzzle +X, up +Y, right +Z) and
   parented to the weapon root, so they inherit every bob, sway and
   recoil kick the gun gets, for free and in perfect sync — no
   second animation system, and nothing to drift out of alignment.

   Two geometries because two materials: sleeve and skin.
   ============================================================ */

/* Where the hands sit on each weapon, in that weapon's local space,
   and where the arms enter frame from. The shoulder anchors are behind
   and below the camera, which is what gives the forearms their
   foreshortened run up to the grip. */
function armPath(shoulder, hand, k) {
  // A slight outward bow, so the forearm reads as a limb with an elbow
  // rather than a rod drawn between two points.
  const mid = new Vec3(
    (shoulder.x + hand.x) * 0.5,
    (shoulder.y + hand.y) * 0.5 - 0.012,
    (shoulder.z + hand.z) * 0.5 + k * 0.030,
  );
  return [shoulder, mid, hand];
}

/* Nine sides round a finger and twelve round a palm is a prism.

   At the range these are drawn -- and they are drawn closer than anything
   else in the game -- the facets are plainly visible, and a hand made of
   flat panels is half of why a correct hand still reads as wrong. Twelve
   and sixteen. Ten fingers, two thumbs and two palms at these counts is
   about four hundred extra triangles a frame, which is nothing.

   One arm: a tapered loft from the sleeve opening to the wrist. */
function buildViewArm(g, shoulder, hand, side) {
  const path = armPath(shoulder, hand, side);
  const rings = [];
  /* Slim, because a viewmodel arm is only 20-25 cm from the eye and at
     that range an anatomically-correct forearm covers a third of the
     screen. Real engines dodge this by drawing the viewmodel at its own
     narrow field of view; with one shared camera the arm has to be
     slimmed instead, and the eye reads it as foreshortening. */
  /* Slimmed, but not to a pipe.

     40 mm at the wrist against an 85 mm hand is a hand stuck on a stick,
     and the mismatch reads worse than an arm that is slightly too big. A
     wrist is about seventy per cent of the width across the knuckles. */
  /* Thicker, and thickest where you can see it.
   *
   * These were right on paper -- 29 mm at the wrist is a 58 mm wrist, which
   * is a wrist -- and still read as pencils on screen, because the sleeve
   * mouth now leaves the frame at the corner and the only part actually
   * visible is the last third before the hand. A forearm is not a cone
   * narrowing to nothing over its whole length: it is thick at the elbow,
   * thick through the belly of the muscle, and only tapers over the last
   * hand's width into the wrist. */
  /* And it has to END thinner than the hand.
   *
   * The wrist was 66 mm across against a palm 56 mm across: the arm was
   * WIDER than the hand on the end of it, which is backwards and is most
   * of why the hands read as small on huge arms. A wrist is about 55 mm
   * and the knuckles are 85 -- the hand is the wide end. Same mass through
   * the forearm, taken in harder over the last hand's width. */
  const spec = [
    [0.052, 0.050],   // sleeve mouth at the frame edge
    [0.050, 0.048],
    [0.046, 0.044],
    [0.037, 0.035],
    [0.0275, 0.0260], // wrist
  ];
  for (let i = 0; i < spec.length; i++) {
    const t = i / (spec.length - 1);
    // Quadratic through the three control points.
    const a = path[0], b = path[1], c = path[2];
    const u = 1 - t;
    const p = new Vec3(
      u * u * a.x + 2 * u * t * b.x + t * t * c.x,
      u * u * a.y + 2 * u * t * b.y + t * t * c.y,
      u * u * a.z + 2 * u * t * b.z + t * t * c.z,
    );
    rings.push({ p, w: spec[i][0], d: spec[i][1], e: 2.1, uv: t });
  }
  loftRings(g, rings, 14, true, true);
}

/* A hand wrapped around something.

   Every piece here starts *inside* the piece it grows from — the palm
   overlaps the wrist, the fingers start buried in the palm, the thumb
   starts buried in both. Built as separate lofts that merely meet at a
   shared point, they read as a bag of parts floating near each other the
   moment anything moves, because nothing guarantees the surfaces touch.

   Fingers are three segments with a joint between each, not one tapered
   tube. That matters more than it sounds: a finger is only bent at its
   knuckles, so a smooth curve reads as a tentacle, and four tentacles
   round a grip is the thing that makes a first-person hand look wrong
   without anyone being able to say why. Three straight bones with sharp
   angles between them reads as a hand even at this size. */
/* What a hand is holding, described rather than chosen from a list of two.
 *
 * There used to be exactly two poses -- 'pistol' and 'fore' -- and every
 * weapon in the game was forced into one of them. A hand on a Thompson's
 * vertical foregrip, a hand under a shotgun's fat wooden forend, a hand on
 * the MG42's spade grip and a hand round the Arc Breaker's accelerator
 * tube are four different shapes, and giving all four the same fingers is
 * why they all read as the same generic claw.
 *
 * So a grip is a description of the thing being held, in the weapon's own
 * space, and the hand is built to fit it:
 *
 *   axis    the direction the held part runs. Fingers are spaced along
 *           this, one above the next, and the palm lies against it.
 *   round   the direction from the HAND toward what it is holding, and
 *           on round the far side. Its sign therefore depends on which
 *           side the hand comes from: a left hand on a vertical grip has
 *           the opposite `round` to a right one. Getting it backwards
 *           builds a hand facing away from the thing it holds, which the
 *           enclosure check catches as skin on three sides instead of
 *           four -- that is what it caught on the MG42's spade grip and
 *           the Arc Breaker's foregrip.
 *   girth   how far there is to go round: half the cross-section's
 *           perimeter. A 1911's front strap is about 55 mm, a shotgun
 *           forend nearer 85, the Arc's tube 100.
 *   spread  the pitch between fingers along the axis.
 *   close   how far they close at the end of the wrap. A thin grip closes
 *           further than a fat tube.
 *   index   what the forefinger does: 'trigger' lays it forward along the
 *           frame, 'wrap' closes it with the rest, 'point' lays it flat.
 *   thumb   'over' the fingers, 'along' the weapon, or 'up' beside it.
 *   drop    how far the anchor is from the middle of what is held, along
 *           `round` -- a hand under a forend sits below it.
 */
/* Every one of these carries its own knuckle spacing, and the finger
   radius now sets a floor under it -- the two used to be independent
   numbers and the fingers ended up welded together. The floor is about
   22.5 mm, which is what four fingers pressed side by side comes to, and
   most of these sat just under it: taking the maximum quietly flattened
   every grip to the same spacing and lost the distinction the table
   exists for. The two FAT ones are lifted clear of the floor, because a
   hand laid over a shotgun forend or the Arc Breaker's tube really does
   splay wider than one closed round a pistol grip. */
const GRIP_KINDS = {
  /* A vertical pistol grip, held by the firing hand. The palm is on the
     backstrap, the fingers cross the front strap and close back in. */
  pistol: { axis: [0.28, -0.94, 0], round: [0, 0, -1], girth: 0.055,
    spread: 0.0194, close: 1.0, index: 'trigger', thumb: 'over', drop: 0 },
  /* Under a horizontal forend: wrist low and behind, knuckles up the near
     side, fingers over the top and down the far side. */
  fore: { axis: [1, 0, 0], round: [0, 1, 0], girth: 0.078,
    spread: 0.0202, close: 0.96, index: 'wrap', thumb: 'along', drop: 0.019 },
  /* A vertical foregrip, gripped like a pistol grip but with nothing to
     put a trigger finger on, so all four fingers wrap. */
  foregrip: { axis: [0.10, -0.99, 0], round: [0, 0, -1], girth: 0.058,
    spread: 0.0196, close: 1.0, index: 'wrap', thumb: 'over', drop: 0 },
  /* A fat wooden shotgun forend: more to go round, so the fingers do not
     close as far and sit further apart. */
  woodFore: { axis: [1, 0, 0], round: [0, 1, 0], girth: 0.092,
    spread: 0.0238, close: 0.86, index: 'wrap', thumb: 'along', drop: 0.023 },
  /* A big tube -- the Arc Breaker's accelerator, the MG42's shroud. The
     hand lies along it and barely closes. */
  tube: { axis: [1, 0, 0], round: [0, 1, 0], girth: 0.108,
    spread: 0.0246, close: 0.74, index: 'wrap', thumb: 'along', drop: 0.028 },
  /* Spade grips: gripped from behind with the thumb up on a butterfly
     trigger, so the thumb goes UP rather than over the fingers. */
  spade: { axis: [0.06, -0.998, 0], round: [-1, 0, 0], girth: 0.056,
    spread: 0.0192, close: 1.0, index: 'wrap', thumb: 'up', drop: 0 },
  /* A slim rifle wrist behind the action -- a stock's small of the grip,
     which is raked further back than a pistol grip and is thinner. */
  wrist: { axis: [0.42, -0.91, 0], round: [0, 0, -1], girth: 0.050,
    spread: 0.0188, close: 1.0, index: 'trigger', thumb: 'over', drop: 0 },
  /* A haft or a shaft held across the body: a knife, a hammer, the
     battering ram's grip. Nothing to point a trigger finger at. */
  haft: { axis: [0.55, -0.83, 0], round: [0, 0, -1], girth: 0.048,
    spread: 0.0190, close: 1.0, index: 'wrap', thumb: 'along', drop: 0 },
};

function buildViewHand(g, rawAt, side, opts = {}) {
  /* Finger radius, in one place and declared before anything reads it.
     19 mm of flesh on 87 mm of bone was a worm; 21 on 96 is a finger, and
     it has to grow with the palm or a bigger hand comes out with the same
     small digits stuck on it. The knuckle spacing is derived from this
     further down, which is why it has to exist this early. */
  const FR = 0.0106;

  /* The grip may be named, or given inline as an object so one weapon can
     tune a shape nothing else shares. */
  const named = typeof opts.grip === 'string' ? GRIP_KINDS[opts.grip] : null;
  const G = Object.assign({}, GRIP_KINDS.pistol,
    named || GRIP_KINDS.pistol, (opts.grip && typeof opts.grip === 'object') ? opts.grip : {});
  // `fore` still means "held from underneath, along its length", which
  // several of the measurements below are phrased in terms of.
  const fore = Math.abs(G.round[1]) > 0.5;

  /* Four axes, and every part of the hand follows from them.

       palm    wrist to knuckles
       point   the way the proximal phalanx leaves the knuckle
       curl    the way the fingers close
       lane    the way the four of them are spaced apart

     The one that is nearly always got wrong is `point`. Fingers do not run
     down a pistol grip alongside the palm — they run ACROSS it, wrap round
     the front strap and close back into the palm, and the four of them are
     stacked one above another down the grip rather than side by side. Build
     them pointing the way the palm runs and you get four parallel prongs:
     a claw, not a hand. Under a forend it is the same relationship turned
     ninety degrees — across the guard, closing upward, spaced along the
     barrel.

     side = which way the back of the hand faces. The firing hand grips from
     the weapon's right, the support hand from its left. */
  const V = (x, y, z) => new Vec3(x, y, z).normalize();
  /* The support hand's four axes, rebuilt.

     They had `palm` and `lane` as the same vector — both along the barrel —
     so the wrist-to-knuckle run and the spacing between the fingers went
     the same way: a ninety-five millimetre sausage lying lengthwise on the
     handguard with the fingers coming off the front of it. What a hand
     under a bar actually does is sit beneath it with the wrist low and
     behind, the knuckles up the near side, and the fingers leaving the
     knuckles UP and ACROSS the top before curling down the far side. The
     thumb stays on the near side and the four fingers are spaced along the
     bar, which is the one part that was right. */
  /* All four fall out of the grip's own two directions.

     `lane` is the held part's axis: the fingers are spaced along it.
     `grasp` points from the hand at what it is holding, which is `round`.
     `palm` runs from the wrist to the knuckles, which is BACK along the
     axis on a vertical grip (the wrist is above the knuckles) and up the
     near side under a forend. `point` is the way a proximal phalanx
     leaves its knuckle -- across the front of the held part, sideways --
     and `curl` is where it goes next, on round the far side. */
  const lane = V(G.axis[0], G.axis[1], G.axis[2]);
  const grasp = V(G.round[0], G.round[1], G.round[2]);
  const palm = fore
    ? V(grasp.x * 0.95 + lane.x * 0.30, grasp.y * 0.95 + lane.y * 0.30, grasp.z * 0.95 + lane.z * 0.30)
    : new Vec3(-lane.x, -lane.y, -lane.z);
  /* Across the front, perpendicular to both -- which side depends on
     which hand it is, because the two wrap opposite ways round. */
  const point = new Vec3().crossVectors(lane, grasp).normalize().scale(-side);
  // And on round: away from the hand, past the far side.
  const curl = new Vec3(-grasp.x, -grasp.y, -grasp.z);

  /* The support hand goes UNDER the forend, not around the middle of it.

     Built centred on the anchor, four fifths of its skin came out above the
     line — it was resting on top of the handguard rather than holding it,
     which from the front is a lump of hand sitting on a gun. Measured, not
     guessed: gripcheck counts which side of the anchor each vertex is on,
     and the support hand was 132/68/15/13 across the four quadrants where
     the firing hand is 37/44/117/120. Drop it by a finger's width and the
     forend lands in the crook where it belongs. */
  let at = G.drop
    ? new Vec3(rawAt.x - grasp.x * G.drop, rawAt.y - grasp.y * G.drop, rawAt.z - grasp.z * G.drop)
    : rawAt;

  /* Seat the hand on the weapon before building anything on it.
   *
   * Where each hand goes was a set of numbers typed per weapon, and typed
   * numbers drift: measured against the models, the support hand was 16 mm
   * off the Thompson, 41 mm off the scattergun, 52 to 81 mm off the Kill
   * Streak and 146 mm off the battering ram -- holding thin air a hand's
   * length from the weapon while the firing hand sat correctly on the grip.
   * That is the "hand positions from the base gun" fault: a number that was
   * right for one weapon left in place on another.
   *
   * With the weapon's own surface to hand there is no need to guess. Slide
   * the anchor along the grasp axis -- the line from the hand toward what
   * it is holding, which is the one direction that cannot rotate the wrist
   * or twist the wrap -- until the palm is against the thing. The authored
   * position still decides WHERE on the weapon the hand sits, along and
   * across; only the standoff is corrected. */
  if (opts.surface) {
    const surf = opts.surface;
    // How far the palm's own flesh holds the knuckles off the surface.
    const want = 0.010;
    /* Judged on the whole knuckle row, not on one point.
     *
     * A single anchor sample can be perfect while the hand is lying at an
     * angle across a forend with one knuckle buried and another 40 mm out
     * -- which is exactly what the scattergun's support hand was doing.
     * Four samples across the row is the cheapest thing that notices. */
    const rowErr = (ox, oy, oz) => {
      let e = 0;
      for (let f = 0; f < 4; f++) {
        /* Spacing comes off the FINGER, not off a number beside it.
     *
     * Every grip carries its own `spread` -- 18.8 to 21.4 mm -- and the
     * fingers were widened to 21.2 mm across when the hands were scaled up
     * to match the arms. On a pistol grip at 19.4 mm pitch that puts four
     * 21.2 mm fingers 1.8 mm INSIDE each other, and four overlapping
     * cylinders weld into one continuous slab: what comes out is not a
     * hand with fingers, it is a paddle with grooves in it, which is what
     * a submachine gun's grip looked like close up.
     *
     * Taking the maximum means a grip may space them WIDER than a finger
     * -- a fat shotgun forend does, and should -- but never narrower than
     * one, so the two numbers cannot drift apart again. */
    const pitch = Math.max(G.spread, FR * 2.12);
    const off = (fore ? f - 1.5 : 1.5 - f) * pitch;
        const bx = at.x + ox + palm.x * 0.044 + lane.x * off;
        const by = at.y + oy + palm.y * 0.044 + lane.y * off;
        const bz = at.z + oz + palm.z * 0.044 + lane.z * off;
        e += Math.abs(surf(bx, by, bz) - want);
      }
      return e / 4;
    };
    /* Along three axes, not one. Sliding only toward the weapon fixes a
       hand held too far out; it does nothing for one sitting 60 mm up the
       barrel from the forend, which is what several of these were. */
    let bx = 0, by = 0, bz = 0, bestErr = rowErr(0, 0, 0);
    let stepList = [0.006, 0.002, 0.0007];
    for (const step of stepList) {
      let improved = true, guard = 0;
      while (improved && guard++ < 40) {
        improved = false;
        for (const ax of [grasp, lane, point]) {
          for (const sgn of [1, -1]) {
            const nx = bx + ax.x * step * sgn, ny = by + ax.y * step * sgn, nz = bz + ax.z * step * sgn;
            /* Bounded, but generously. A hand 15 cm from the battering ram
               -- which is where the support hand on it started -- is beyond
               any correction a tight bound would allow, and refusing to fix
               it leaves an arm stretching off to a hand holding nothing,
               which is what "my arms got cut off" looks like. */
            if (Math.hypot(nx, ny, nz) > 0.18) continue;
            const e = rowErr(nx, ny, nz);
            if (e < bestErr - 1e-7) { bestErr = e; bx = nx; by = ny; bz = nz; improved = true; }
          }
        }
      }
    }
    // Accept anything that got the row within a couple of centimetres; a
    // hand that could not be seated at all keeps its authored position.
    if (bestErr < 0.05) {
      at = new Vec3(at.x + bx, at.y + by, at.z + bz);
      if (opts.out) opts.out.seated = [+bx.toFixed(4), +by.toFixed(4), +bz.toFixed(4)];
    }
  }
  /* Where this hand finished up. Reported because the position a caller
     asked for is not the position the hand ends at -- it is dropped for a
     forend and then seated against the weapon -- and anything wanting to
     put something INTO the hand needs the real one. */
  if (opts.out) opts.out.at = [at.x, at.y, at.z];

  const at3 = (b, d) => new Vec3(at.x + b.x * d, at.y + b.y * d, at.z + b.z * d);

  /* Palm, running from behind the wrist so it swallows the sleeve's last
     ring, out to the knuckles. Slightly cupped toward the grip. */
  const rings = [];
  const PN = 5;
  /* The palm lies flat ON the grip's near face rather than being threaded
     onto its centreline, so it needs pushing out by half its own
     thickness. Centred, half of it was inside the gun and the visible half
     read as a swelling growing out of the grip. */
  const off0 = fore ? 0 : 0.011;
  /* Palm cross-section, from the girth. `w` is how far it reaches round
     the front and back of what is held, `d` is its own thickness -- and
     flesh does not change thickness with what it is gripping, so only the
     first grows. */
  /* Gently. Scaling straight off the girth gave a hand on a shotgun
     forend a palm a hundred millimetres front to back, which swallowed
     its own fingers -- from the side it was a featureless mitten. A palm
     spreads a little over something fat; it does not double. The
     wrapping is the fingers' job. */
  const girthMul = Math.max(0.94, Math.min(1.16, 1 + (G.girth - 0.055) * 2.6));
  /* A fifth bigger. Measured against the arm rather than argued about: the
     forearm ended 66 mm across and the palm was 56, so every hand in the
     game was smaller than the wrist it grew out of. The wrist has come in
     to 55; this takes the palm out to about 68 front-to-back and 31 thick,
     which puts the hand back at the wide end of the arm where it belongs. */
  const pw0 = (fore ? 0.0238 : 0.0198) * girthMul;
  const pw1 = (fore ? 0.0148 : 0.0134) * girthMul;
  const pd0 = fore ? 0.0128 : 0.0104;
  const pd1 = fore ? 0.0070 : 0.0053;
  for (let i = 0; i <= PN; i++) {
    const t = i / PN;
    // Wrist to knuckles: 80 mm along the grip, which is a knuckle span.
    /* Starting 24 mm above the anchor left the top-rear corner of the
       grip panel bare -- the web of the hand sits ON the beavertail, and
       a gap there is the first thing the eye finds. */
    const d = -0.032 + t * 0.088;
    rings.push({
      p: new Vec3(
        at.x + palm.x * d + grasp.x * t * 0.006,
        at.y + palm.y * d + grasp.y * t * 0.006,
        at.z + palm.z * d + grasp.z * t * 0.006 + side * off0,
      ),
      /* A palm, not a sphere and not a wafer.

         It was 56 mm across and 42 mm THROUGH, which was a ball. Cutting
         the depth to 28 mm fixed the ball and made a slice of bread — and
         I never re-rendered to see it. A hand across the knuckles is about
         85 mm and a palm with the fingers folded onto it is 38 to 42 mm
         through, because the folded fingers are part of the thickness. */
      /* loftRings builds the frame from the path direction, and for a hand
         on a grip that puts `w` front-to-back and `d` across the gun. So
         these are: how far the palm stands off the front and back of the
         grip, and how thick it is.

         They were 75 mm and 40 mm. A pistol grip is about 30 mm front to
         back, so the palm was two and a half times deeper than the thing
         it was holding and nearly spherical -- the kidney-bean blob with
         stubs on it that has survived three rounds of me calling the
         hands fixed. A palm folded onto a grip is 50 to 56 mm front to
         back including the grip itself, and 24 to 28 mm of flesh. */
      /* Full at the wrist end as well as the middle. A plain sin() starts
         at zero, so the top of the palm tapered to a stalk and left the
         upper third of the grip bare above the hand -- the gun looked
         held by its bottom corner. The heel of a hand is already most of
         its width where it leaves the wrist. */
      /* The palm spreads over what it is holding, so the girth sets how
         far around the front and back of it the flesh reaches. A hand on
         a 55 mm grip is a fist; the same hand on a 108 mm tube is laid
         open across it. */
      w: pw0 + Math.sin((0.24 + t * 0.76) * PI * 0.88) * pw1,
      d: pd0 + Math.sin((0.24 + t * 0.76) * PI * 0.92) * pd1,
      e: 2.6, uv: t,
    });
  }
  loftRings(g, rings, 16, true, true);

  /* A finger, as ONE surface.

     Built bone by bone it comes out beaded: each segment is a capped
     capsule, so every joint shows two end discs and the finger reads as a
     string of sausages. One loft walked along the bent path instead gives
     continuous skin, with the knuckles a small swelling in the radius at
     each bend rather than a seam. */
  /* Turning happens in the plane a finger closes in, and that plane is an
     argument rather than always (point, curl).

     turn() rebuilds the direction ENTIRELY from the two axes it is given,
     which silently throws away anything pointing out of their plane. The
     trigger finger was aimed forward along the frame and then turned in
     the closing plane, so its forward reach was discarded on the first
     bend and it came out lying across the gun. A finger doing a different
     job closes in a different plane. */
  const turn = (d, a2, pt, cl) => {
    const c = Math.cos(a2), sn = Math.sin(a2);
    const along = d.x * pt.x + d.y * pt.y + d.z * pt.z;
    const across = d.x * cl.x + d.y * cl.y + d.z * cl.z;
    const na = along * c - across * sn, nc = along * sn + across * c;
    return new Vec3(pt.x * na + cl.x * nc, pt.y * na + cl.y * nc, pt.z * na + cl.z * nc).normalize();
  };
  /* Where a finger's tip ends up, without building it.
   *
   * Needed so the curl can be SOLVED rather than guessed: run the chain,
   * look at where the tip lands, adjust, run it again. Same arithmetic as
   * digit() below and deliberately so -- if the two ever disagree the solve
   * is optimising something the mesh does not do. */
  const tipOf = (root, dir0, bends, lens, k, pt, cl, joints) => {
    let d = dir0;
    let p = new Vec3(root.x - d.x * 0.009, root.y - d.y * 0.009, root.z - d.z * 0.009);
    for (let i = 0; i < 3; i++) {
      d = turn(d, bends[i] * k, pt, cl);
      p = new Vec3(p.x + d.x * lens[i], p.y + d.y * lens[i], p.z + d.z * lens[i]);
      if (joints && i < 2) joints.push(new Vec3(p.x, p.y, p.z));
    }
    return new Vec3(p.x + d.x * 0.0045, p.y + d.y * 0.0045, p.z + d.z * 0.0045);
  };

  /* Close the finger until it is on the thing it is holding.
   *
   * Every fingertip in the game sat between 15 and 45 mm off the weapon,
   * worsening from index to little finger, because how far a finger closes
   * was a constant per grip KIND and the actual girth of the actual gun at
   * the actual grip point is not a constant. A hand whose fingertips stop
   * short is a hand not holding anything, and at 25 mm that is an inch of
   * daylight -- which is exactly what it was described as.
   *
   * `surface` gives the distance from a point to the weapon's skin. Scale
   * the whole curl until the tip is one finger-radius plus a hair off it:
   * touching, not buried. Bounded, so a finger that cannot reach stops at
   * a hand's limit instead of tying itself in a knot, and one that would
   * reach immediately still closes enough to look gripped. */
  /* Where a trigger cannot be. Handed the weapon's bore height, anything
     the trigger finger reaches above it is charged for the difference --
     a hand's own geometry then decides where in the guard it lands. */
  const trigLimit = { tipOnly: true, fwd: 0.020,
    ceil: opts.boreY != null ? opts.boreY - 0.010 : null };
  /* `lim` is how a finger is allowed to finish.
   *
   *   ceil  the tip must end below this height -- the bore, for a trigger
   *         finger, because above the bore is the top of the slide.
   *   fwd   the tip must end at least this far FORWARD of its own knuckle.
   *   tipOnly a trigger finger is not wrapped round anything, so scoring
   *         its whole length against the nearest surface is wrong: the
   *         nearest surface is the grip, and the best fit against the grip
   *         is a finger curled into a fist. Measured before this existed:
   *         on eleven of thirteen weapons the trigger fingertip finished
   *         BEHIND its own knuckle, tucked under the palm. A hand making a
   *         fist round a pistol is exactly what "the fingers are messed
   *         up" looks like, and it passed every check I had because a fist
   *         touches the gun beautifully. */
  /* How the curl is DISTRIBUTED between the three joints.
   *
   * solveCurl has one degree of freedom -- a single scalar `k` scaling all
   * three bend angles together -- so a finger can only ever curl
   * uniformly. Round a cylinder that is nearly right; round a slab-sided
   * receiver or a fat forend it is not, and the best a uniform curl can do
   * is put the TIP on the weapon and let both knuckles ride 12 to 23 mm
   * clear. Measured, that was six of the thirteen hands: tips touching,
   * middles out, which reads as a finger arched over the gun rather than
   * lying along it.
   *
   * A real finger closes more at the base round something thick and more
   * at the end round something thin. Rather than search two parameters at
   * once -- which would multiply a load-time solve by an order of
   * magnitude -- run the existing one-parameter solve against three
   * distributions and keep whichever fits the whole finger best. Three
   * times the cost of one solve, and it recovers most of the freedom. */
  let lastReach = null;
  const SPREADS = [
    [1.00, 1.00, 1.00],   // even, what it always did
    [1.34, 1.06, 0.72],   // base-heavy: round something thick
    [0.72, 1.02, 1.36],   // tip-heavy: round something thin
    [1.90, 0.88, 0.42],   // knuckle-down: onto a fat tube
    [0.48, 1.30, 1.22],   // hooked: a fingertip over an edge
  ];
  const solveCurlOne = (root, dir0, bends, lens, r0, pt, cl, lim) => {
    const surf = opts.surface;
    if (!surf) return { k: 1, err: 1e9 };
    const ceil = lim && lim.ceil != null ? lim.ceil : null;
    const fwd = lim && lim.fwd != null ? lim.fwd : null;
    const tipOnly = !!(lim && lim.tipOnly);
    const want = r0 + 0.0012;
    let best = 1, bestErr = 1e9;
    /* The range a hand can actually do.
     *
     * The top was 2.05, and every FIRING hand solved inside it while every
     * SUPPORT hand on a long gun ran out of travel and stopped 7 to 37 mm
     * short. A hand under a forend has further to go than one round a
     * pistol grip -- it comes up the far side and over the top, which is
     * most of a full turn more -- so a ceiling set from what a pistol needs
     * is a ceiling the other hand hits every time. 4.3 radians over three
     * joints is a closed fist, and nothing can be asked for past that. */
    const hi0 = 4.3;
    /* Score the WHOLE finger, not the end of it.
     *
     * This solved the fingertip onto the surface and nothing else, so
     * every finger touched the gun at exactly one point and stood off it
     * everywhere else -- four fingers poking a grip at their tips with
     * daylight along all three bones, which from behind reads as four
     * sausages laid over the gun rather than a hand closed on it. The
     * numeric check agreed with the solve because it measured the same
     * one point, which is why "the fingers touch" and "the fingers are
     * still wrong" were both true for weeks.
     *
     * A finger round a grip lies against it along its length: the middle
     * knuckle and the last joint are on the object too. All three are
     * scored, the tip weighted double because it is the one the eye
     * follows and the one that must not go through the gun. */
    /* A point closer to the weapon's skin than half a finger's radius is
       not touching it, it is INSIDE it. The distance field here is
       unsigned -- it is the range to the nearest vertex -- so a finger
       driven through a trigger guard scores as well as one lying on it,
       and "the hands are clipping through the gun" is what that looks
       like. Anything that far in is charged for it, so the solve backs
       the finger out rather than pushing it further through. */
    const bury = r0 * 0.45;
    const at1 = (x, y, z) => {
      const d = surf(x, y, z);
      return d < bury ? Math.abs(d - want) + (bury - d) * 6 : Math.abs(d - want);
    };
    /* The best MID-FINGER standoff any curl in the search could have
       achieved, whether or not it was the curl that won on total error.
       
       Without this there is no way to tell a solve that failed from a
       finger that has nowhere to go: the little finger on a 1911 curls
       under the magazine floorplate, where there is genuinely no gun
       left to touch, and it will read as 27 mm off however well the
       solver works. A check that cannot tell those apart is a check that
       demands the impossible, and I spent a round of tuning against one
       before noticing it had never passed. */
    let reach = 1e9;
    const err3 = (k) => {
      const js = [];
      const t = tipOf(root, dir0, bends, lens, k, pt, cl, js);
      let e;
      if (tipOnly) {
        e = at1(t.x, t.y, t.z);
      } else {
        /* The tip weighted double, because it is the point the eye
           follows and the one that must not go through the gun. Tried at
           1.5 to give the knuckles more of the say, and every one of the
           26 hands came back with byte-identical numbers -- the optimum
           here is set by the spread choice and the bury penalty, not by
           this ratio. Left as it was. */
        e = at1(t.x, t.y, t.z) * 2;
        for (const j of js) e += at1(j.x, j.y, j.z);
        e /= 4;
        let worst = 0;
        for (const j of js) { const d = surf(j.x, j.y, j.z) - r0; if (d > worst) worst = d; }
        if (worst < reach) reach = worst;
      }
      if (ceil != null && t.y > ceil) e += (t.y - ceil) * 4;
      if (fwd != null && t.x < root.x + fwd) e += (root.x + fwd - t.x) * 5;
      return e;
    };
    for (let i = 0; i <= 44; i++) {
      const k = 0.45 + i * (hi0 - 0.45) / 44;
      const err = err3(k);
      if (err < bestErr) { bestErr = err; best = k; }
    }
    let lo = Math.max(0.45, best - 0.10), hi = Math.min(hi0, best + 0.10);
    for (let i = 0; i < 12; i++) {
      const a = lo + (hi - lo) / 3, b2 = hi - (hi - lo) / 3;
      if (err3(a) < err3(b2)) hi = b2; else lo = a;
    }
    const k = (lo + hi) / 2;
    const t = tipOf(root, dir0, bends, lens, k, pt, cl);
    void bestErr;
    // The reported tip error carries the ceiling too, so choosing between
    // two planes for a trigger finger prefers the one under the bore.
    const over = ((ceil != null && t.y > ceil) ? (t.y - ceil) * 4 : 0)
      + ((fwd != null && t.x < root.x + fwd) ? (root.x + fwd - t.x) * 5 : 0);
    /* Two errors come back. `err` is the tip alone, because choosing
       between two possible paths for a trigger finger is a question about
       where the tip lands; `fit` is the whole-finger score the solve
       actually minimised. */
    return { k, err: Math.abs(surf(t.x, t.y, t.z) - want) + over, fit: bestErr,
      reach: reach < 1e8 ? reach : null };
  };

  /* The wrapper: try each distribution, keep the best whole-finger fit,
     and hand back the reshaped bends along with the scale so the caller
     builds the finger the solve actually chose. A trigger finger is not
     wrapped round anything, so it keeps the even distribution -- there is
     nothing for a redistributed curl to hug. */
  const solveCurl = (root, dir0, bends, lens, r0, pt, cl, lim) => {
    if (lim && lim.tipOnly) {
      const one = solveCurlOne(root, dir0, bends, lens, r0, pt, cl, lim);
      one.bends = bends;
      return one;
    }
    let best = null, reach = 1e9;
    for (const sp of SPREADS) {
      const b = [bends[0] * sp[0], bends[1] * sp[1], bends[2] * sp[2]];
      const sol = solveCurlOne(root, dir0, b, lens, r0, pt, cl, lim);
      if (sol.reach != null && sol.reach < reach) reach = sol.reach;
      if (!best || sol.fit < best.fit) { sol.bends = b; best = sol; }
    }
    /* Then polish. Five hand-picked shapes get close; which one wins is
       a coarse choice, and the right shape for a given grip is rarely
       exactly one of them. Two passes of coordinate descent over the
       three joints -- the third degree of freedom the search never had
       -- costs about a dozen more evaluations against the three hundred
       the scan already spends, and it is a proper local search rather
       than a sixth and seventh guess at what shapes hands make.

       With a floor under the tip. `fit` is the whole finger's error, so
       a candidate can win it by pulling both knuckles in and letting the
       fingertip drift -- and it did: the polish took the MG 42's support
       knuckles from 24 mm to 5 and, on one configuration of the Mauser,
       pushed two tips out to 15 and 14. Whole-finger contact is the goal
       and the tip is the constraint, not the other way round, so a step
       that costs the tip more than 4 mm against the shape it started
       from is refused however good its total looks. */
    if (best && best.bends) {
      const tipFloor = best.err + 0.004;
      for (let pass = 0; pass < 2; pass++) {
        const step = pass === 0 ? 0.22 : 0.09;
        for (let j = 0; j < 3; j++) {
          for (const d of [1 + step, 1 - step]) {
            const b = best.bends.slice();
            b[j] *= d;
            const sol = solveCurlOne(root, dir0, b, lens, r0, pt, cl, lim);
            if (sol.reach != null && sol.reach < reach) reach = sol.reach;
            if (sol.fit < best.fit && sol.err <= tipFloor) { sol.bends = b; best = sol; }
          }
        }
      }
    }
    if (best) best.reach = reach < 1e8 ? reach : null;
    return best;
  };

  const digitTo = (gg, root, dir0, bends, lens, r0, pt = point, cl = curl) => {
    const save = digitG;
    digitG = gg;
    digit(root, dir0, bends, lens, r0, pt, cl);
    digitG = save;
  };
  let digitG = null;
  const digit = (root, dir0, bends, lens, r0, pt = point, cl = curl) => {
    const rs = [];
    // Where the two knuckles past the first one land, so the measurement
    // can ask the same question the solve now answers: is the finger lying
    // ALONG the thing it holds, or poking it with one fingertip.
    const joints = [];
    let d = dir0;
    // Start back inside the palm so the knuckle is buried in it.
    let p = new Vec3(root.x - d.x * 0.009, root.y - d.y * 0.009, root.z - d.z * 0.009);
    const total = lens[0] + lens[1] + lens[2] + 0.009;
    let travelled = 0;
    const push = (r) => rs.push({ p: new Vec3(p.x, p.y, p.z), w: r, d: r * 0.92, e: 2.4, uv: travelled / total });
    push(r0 * 1.08);
    for (let k = 0; k < 3; k++) {
      d = turn(d, bends[k], pt, cl);
      const step = lens[k] / 2;
      for (let j = 1; j <= 2; j++) {
        p = new Vec3(p.x + d.x * step, p.y + d.y * step, p.z + d.z * step);
        travelled += step;
        // Swollen at the joint, tapering toward the tip.
        push(r0 * (j === 2 ? 1.10 : 1.0) * (1 - (travelled / total) * 0.28));
      }
      if (k < 2) joints.push([p.x, p.y, p.z]);
    }
    p = new Vec3(p.x + d.x * 0.0045, p.y + d.y * 0.0045, p.z + d.z * 0.0045);
    travelled += 0.0045;
    push(r0 * 0.44);
    loftRings(digitG || g, rs, 12, true, true);
    /* Where this digit starts, ends, and how thick it is.
     *
     * Reported rather than inferred, because "is the finger touching the
     * gun" cannot be answered from a finished mesh -- once four fingers, a
     * thumb and a palm are welded into one surface there is no way to tell
     * which vertex belonged to which finger, and a measurement that cannot
     * name the finger cannot say which one is wrong. */
    if (opts.out) {
      (opts.out.digits || (opts.out.digits = [])).push({
        knuckle: [root.x, root.y, root.z],
        joints,
        tip: [p.x, p.y, p.z],
        r: r0,
        // The closest any curl in the search could have brought the worst
        // knuckle. null for a digit that is not solved against a surface.
        reach: lastReach != null ? +lastReach.toFixed(4) : null,
      });
    }
  };

  /* Fingers: three bones each, with the closing split across the two
     joints the way a real hand splits it — most at the middle knuckle.

     On the firing hand the index does not close with the rest. It comes
     off its knuckle forward, takes one small bend, and lies along the
     trigger. That one separated finger is most of what makes the hand read
     as a hand holding a gun rather than a fist round a stick. */
  const trigger = opts.trigger !== false && G.index === 'trigger';
  /* Bone lengths, and the reason the hand was a ball.

     These were 30/21/15.5 mm — 66 mm of finger — with 168 degrees of total
     curl packed into it. The radius of that arc is 66/2.94, about 22 mm, so
     the finger traced a circle 45 mm across while being 16 mm thick: the
     flesh was nearly as wide as the curve it was following, and four of
     them round a palm came out as one lump with stubs on it. A real index
     finger is about 87 mm over three bones, and a hand closed on a grip
     turns through roughly a hundred and forty degrees, not a hundred and
     seventy — over 87 mm of bone that is an arc about 70 mm across, which
     is a hand round a 34 mm grip with flesh on it. */
  const LEN = [0.0464, 0.0290, 0.0210];
  const knuckle0 = at3(palm, 0.044);
  for (let f = 0; f < 4; f++) {
    // Which finger, if any, leaves the wrap to lie on a trigger.
    const isIndex = trigger && f === 3;
    // Index nearest the muzzle, little finger furthest from it.
    /* Spaced so they touch. Four 19 mm fingers side by side span 76 mm,
       which is a hand; at the old 17 mm pitch they had daylight between
       them and read as separate prongs. */
    /* On a pistol grip `lane` runs DOWN it, so a positive offset is
       toward the butt — and the index, which is f = 3, was being put at
       the BOTTOM of the grip and then built nearly straight because it is
       the trigger finger. That is the finger sticking out into mid-air
       below the gun in every screenshot of every pistol in this game. The
       index belongs at the top, by the trigger, and the little finger at
       the butt. Under a forend `lane` runs toward the muzzle and the
       original sign is the right one: index forward. */
    const off = (fore ? f - 1.5 : 1.5 - f) * G.spread;
    const scale = isIndex ? 1.0 : [0.84, 0.96, 1.0, 0.99][f];
    const root = new Vec3(
      knuckle0.x + lane.x * off + grasp.x * 0.011 + point.x * 0.006,
      knuckle0.y + lane.y * off + grasp.y * 0.011 + point.y * 0.006,
      knuckle0.z + lane.z * off + grasp.z * 0.011 + point.z * 0.006,
    );
    /* The knuckle row curves round what it is holding.
     *
     * Four knuckles at 19 mm apart span 57 mm, and laid in a STRAIGHT line
     * across a 40 mm forend the two outer ones are past the edge of it --
     * they are not touching because there is nothing there to touch. That
     * is not a hand in the wrong place, which is why moving the hand did
     * not fix it and the seating solver kept putting it back: it is a hand
     * shaped like a plank.
     *
     * Each knuckle is pushed along the grasp axis until it is a knuckle's
     * thickness off the surface, so the row follows the curve of the thing
     * the way a real hand does. Bounded to a centimetre either way, because
     * past that it stops being a hand curving and starts being knuckles at
     * unrelated depths. */
    if (opts.surface) {
      const surf = opts.surface;
      const want = 0.010;
      let bt = 0, be = Math.abs(surf(root.x, root.y, root.z) - want);
      for (let i = -14; i <= 14; i++) {
        const t = i * 0.0008;
        const e2 = Math.abs(surf(root.x + grasp.x * t, root.y + grasp.y * t, root.z + grasp.z * t) - want);
        if (e2 < be - 1e-7) { be = e2; bt = t; }
      }
      root.x += grasp.x * bt; root.y += grasp.y * bt; root.z += grasp.z * bt;
    }
    /* How far each finger closes. Round a grip they close nearly all the
       way — the tips come back under the palm, and a hand whose fingertips
       stop in mid-air is a hand not holding anything. Over a forend they
       close less, because there is more of it to go round. */
    /* Round a forend they close nearly as far as round a grip: the hand is
       under it and the fingers have to come up the far side and over. */
    const close = G.close;
    /* A hundred degrees over three joints, weighted to the middle knuckle,
       which is where a hand actually does most of its closing. Over 87 mm
       of bone that is an arc about 50 mm across — a hand round a grip
       rather than a fist eating itself. */
    /* Where the bend goes, not just how much of it.

       The proximal phalanx is 42 mm and the front of a pistol grip is
       about 32 mm across: that bone spans the front strap and should be
       nearly straight, with the closing happening at the two joints past
       it. Putting 0.80 rad in before the first bone sent it diagonally
       backwards on leaving the knuckle, so the finger wrapped along the
       gun instead of around the grip and the tip finished 62 mm behind
       the knuckle -- twice the depth of the thing it was holding. */
    /* How far round is set by the girth of what is being held.

       87 mm of finger wrapping a 55 mm half-perimeter turns through about
       2.6 radians; wrapping the Arc Breaker's 108 mm tube it barely turns
       at all, because the tube uses up the whole finger before it can
       curl. Scaling the total by the girth is what makes a hand on a fat
       forend read as a different hand from one on a pistol grip instead
       of the same claw at a different angle. */
    const wrap = Math.max(0.52, Math.min(1.22, 0.055 / G.girth)) * close;
    const bends = isIndex ? [0.16, 0.52, 0.46]
      : [0.25 * wrap, 1.30 * wrap, 1.05 * wrap];
    const lens = [LEN[0] * scale, LEN[1] * scale, LEN[2] * scale];
    if (isIndex) {
      /* The trigger finger reaches forward along the frame and closes
         inward onto the blade, which is a different plane from the one
         the other three close in. It is not solved onto the surface: it is
         meant to lie on a trigger, not to wrap, and closing it until it
         touched would curl it round the front of the guard. */
      /* The trigger finger.
       *
       * It was aimed forward along the frame in a plane of its own and left
       * unsolved, on the grounds that it lies on a trigger rather than
       * wrapping. But "not wrapping" is not "ending 30 to 50 mm out in
       * front of the muzzle", which is where it was on every pistol in the
       * game -- a finger pointing at nothing.
       *
       * There are two ways for it to get there and which one works depends
       * on the weapon. Round a submachine gun's grip it closes in the same
       * plane as the other three and lands on the trigger. On a pistol that
       * plane has nothing in it -- the finger starts at the top of the grip
       * and the guard is forward and below -- so it has to reach along the
       * frame first and bend down into the guard.
       *
       * Both are solved and the one that actually reaches wins. Picking
       * either by hand left half the guns with a finger pointing at nothing:
       * the wrap plane alone put the 1911's index 52 mm out in front of the
       * muzzle, and the forward plane alone did the same to the Thompson's. */
      const ipt = V(0.90, -0.10, -side * 0.42);
      const icl = V(-0.38, -0.34, -side * 0.86);
      const d0 = new Vec3(point.x, point.y, point.z);
      /* Below the bore, or it is not on a trigger.
       *
       * The solve picked whichever plane got the fingertip nearest the
       * weapon's SURFACE -- and the top of the slide is a surface. So on
       * the pistols the trigger finger came to rest lying along the top of
       * the slide, touching the gun perfectly and pointing at nothing, and
       * from the front it reads as a sausage laid over the barrel. A
       * trigger is always below the bore and behind the muzzle; anything
       * that ends above the bore line is disqualified however well it
       * touches. */
      const a = solveCurl(root, d0, bends, lens, FR, point, curl, trigLimit);
      const b2 = solveCurl(root, ipt, bends, lens, FR, ipt, icl, trigLimit);
      /* Neither plane reaches on some weapons -- the guard is further
         forward than a finger can get from that knuckle in either -- and
         the honest answer there is a straighter finger pointing at it
         rather than a curled one pointing at nothing. */
      /* Its own mesh when the caller asks for one, for the same reason the
         thumb has one: a finger welded into the hand is a finger that can
         never pull a trigger, and a first-person shooter in which the
         trigger finger does not move is a photograph of a hand. The base
         knuckle comes back with it so the game can turn it about the joint
         it actually bends at. */
      const ig = opts.indexGeo || g;
      const before = ig === g ? null : (opts.out || {});
      /* Which plane won, and by how much, reported -- because "the trigger
         finger is in the wrong place" has three different causes and they
         need opposite repairs: the wrong plane chosen, the right plane
         chosen but out of reach, or the constraint not binding at all. */
      if (opts.out) {
        opts.out.indexPlane = a.err <= b2.err ? 'wrap' : 'fwd';
        opts.out.indexErr = [+a.err.toFixed(4), +b2.err.toFixed(4)];
      }
      if (a.err <= b2.err) {
        digitTo(ig, root, d0, [bends[0] * a.k, bends[1] * a.k, bends[2] * a.k], lens, FR);
      } else {
        digitTo(ig, root, ipt, [bends[0] * b2.k, bends[1] * b2.k, bends[2] * b2.k], lens, FR, ipt, icl);
      }
      if (opts.out) opts.out.indexPivot = [root.x, root.y, root.z];
      void before;
    } else {
      /* 19 mm through the proximal phalanx, which is a finger. It was 14,
         and 14 mm of flesh on 87 mm of bone is a worm. */
      const d0 = new Vec3(point.x, point.y, point.z);
      const sol = solveCurl(root, d0, bends, lens, FR, point, curl);
      const sb = sol.bends || bends;
      lastReach = sol.reach;
      digit(root, d0, [sb[0] * sol.k, sb[1] * sol.k, sb[2] * sol.k], lens, FR);
      lastReach = null;
    }
  }

  /* Thumb: off the near side of the palm, laid along the weapon and folded
     over the fingers. One surface as well, and it is the part that makes
     the hand look like it is gripping rather than resting against. */
  {
    /* Its own mesh when the caller asks for one.

       A thumb that cannot move is a thumb that cannot cock a hammer, and
       the Model 5 is a single action -- the shooter's thumb drags the spur
       back between every shot. One static hand mesh can only ever be a
       hand that is already holding the gun. */
    const tg = opts.thumbGeo || g;
    const V2 = (x, y, z) => new Vec3(x, y, z).normalize();
    const near = new Vec3(0, 0, side);
    let p = new Vec3(
      at.x + palm.x * 0.004 + near.x * 0.014 + grasp.x * 0.006,
      at.y + palm.y * 0.004 + near.y * 0.014 + grasp.y * 0.006,
      at.z + palm.z * 0.004 + near.z * 0.014 + grasp.z * 0.006,
    );
    // The base joint, which is what a moving thumb turns about.
    if (opts.out) opts.out.thumbPivot = [p.x, p.y, p.z];
    /* Where the thumb goes, which is a property of the grip and not of
       whether the hand happens to be underneath something. On a pistol
       grip it folds OVER the fingers; along a forend it lies ALONG the
       weapon; on spade grips it stands UP beside them, where a butterfly
       trigger is. */
    /* A thumb on a pistol rides the FRAME, not the slide.
     *
     * 'over' pointed it up at 0.64 against 0.60 forward, which is a thumb
     * raised over the top of the gun -- and that is exactly where it came
     * out: a sausage lying along the top of the slide, in the sight line,
     * on every pistol in the game. A right thumb on a 1911 lies along the
     * left of the frame just under the slide, pointing at the muzzle,
     * which is mostly forward with a little lift. */
    /* 'stack' is the SUPPORT thumb on a two-handed pistol grip, and it is
       the one case where the thumb must not mirror. Every other thumb
       direction flips with `side`, which is right for two hands doing the
       same job on opposite ends of a rifle -- and wrong here, because both
       thumbs on a pistol lie along the SAME side of the frame, one over
       the other, pointing at the muzzle. Mirrored, the support thumb came
       across the top of the slide and sat in the sight line. */
    let d = G.thumb === 'stack' ? V2(0.94, 0.08, side * 0.30)
      : G.thumb === 'along' ? V2(0.90, 0.36, -side * 0.24)
        : G.thumb === 'up' ? V2(0.10, 0.95, -side * 0.30)
          : V2(0.88, 0.26, -side * 0.42);
    /* Round, and no thicker than the fingers beside it.
     *
     * It was 23 mm by 20 at an exponent of 2.4, which is a squared-off
     * section a fifth wider than a finger -- so beside four now-separate
     * digits it read as a plaster stuck along the frame rather than as a
     * thumb. A thumb is thicker than a finger through the base and about
     * the same by the tip, and it is round. */
    const rs = [{ p: new Vec3(p.x, p.y, p.z), w: 0.0118, d: 0.0112, e: 2.1, uv: 0 }];
    const step = (len, r, k) => {
      p = new Vec3(p.x + d.x * len, p.y + d.y * len, p.z + d.z * len);
      rs.push({ p: new Vec3(p.x, p.y, p.z), w: r, d: r * 0.94, e: 2.1, uv: k });
    };
    /* 59 mm of thumb was short even for a hand: a thumb is about 70 mm
       from the base joint to the tip, and this one has to reach a hammer. */
    step(0.019, 0.0112, 0.22);
    step(0.017, 0.0104, 0.44);
    d = G.thumb === 'stack' ? V2(0.97, -0.04, side * 0.22)
      : G.thumb === 'along' ? V2(0.78, 0.00, -side * 0.62)
        : G.thumb === 'up' ? V2(0.16, 0.86, -side * 0.48)
          : V2(0.94, -0.08, -side * 0.33);
    step(0.016, 0.0098, 0.66);
    step(0.013, 0.0086, 0.86);
    step(0.006, 0.0040, 1.0);
    loftRings(tg, rs, 12, true, true);
    if (opts.out) {
      opts.out.thumbTip = [p.x, p.y, p.z];
      opts.out.thumbR = 0.0114;
    }
  }

}

/* Build both arms for one weapon.
   `hands` gives the two grip points in weapon-local space; `shoulders`
   defaults to a pair of anchors down and back from the camera. */
function makeViewmodelArms(hands, opts = {}) {
  const sleeve = new Geometry();
  const skin = new Geometry();
  /* The anchor has to sit IN FRONT of the eye. The weapon rides about
     0.30 m out, so a shoulder placed further back than that puts the
     forearm through the near plane and it fills the screen with sleeve —
     these are forearms entering frame from the lower corners, not whole
     arms hung off a torso that is not there. */
  const back = opts.back != null ? opts.back : -0.07;
  /* Deeper, so less forearm crosses the picture.
   *
   * Both arms used to run diagonally from the middle of the lower edge
   * right across the frame to the gun -- two tubes over the whole bottom
   * half of the screen, with the weapon somewhere behind them. Dropping
   * the anchor takes the sleeve mouth below the frame sooner, so what is
   * on screen is the last third of the forearm and the hand, which is
   * what a first-person view of your own arms actually contains. */
  const drop = opts.drop != null ? opts.drop : -0.335;
  /* How far apart the two sleeve mouths are.
   *
   * This was 0.105 -- 21 cm between the shoulders, half a real shoulder
   * width -- and the consequence was measurable rather than arguable:
   * projected into the frame, the support sleeve ran from x -0.11 to 0.29
   * with half its vertices on screen. That is not a forearm entering from
   * the lower left, it is a cone standing in the middle of the picture
   * pointing at the gun, and next to the firing sleeve at 0.28..0.95 the
   * pair read as two claws meeting at the bottom of the screen.
   *
   * At 0.27 each mouth is out past the lower corner it belongs to, so what
   * is left on screen is the tapered part near the wrist -- which is what
   * a forearm entering frame actually looks like. */
  const spread = opts.spread != null ? opts.spread : 0.315;

  /* `side` is which way the back of the hand faces, and it decides where
     the thumb goes, which way the fingers are spread and which corner of
     the frame the forearm enters from. The firing hand grips from the
     weapon's right, so its back faces +Z; the support hand comes from the
     left. Having these the wrong way round puts each thumb through the
     weapon and each forearm in from the far corner, which is exactly what
     "the hands are phasing through the gun" looks like. */
  /* The support arm is built into its own pair of meshes.

     Both arms used to share one sleeve and one skin, which is cheaper and
     is fine right up until the support hand has to do something the firing
     hand is not doing — carry a magazine to the well, thumb rounds off a
     clip, feed a shell. One mesh cannot move half of itself, so the reload
     was an invisible force loading the gun. Four meshes: the firing arm,
     which never leaves the grip, and the support arm, which does. */
  const lSleeve = new Geometry();
  const lSkin = new Geometry();
  /* The firing thumb, separately, when the weapon needs it to do something
     -- which on a single action means reaching up to the hammer between
     every shot. */
  const thumb = opts.thumb ? new Geometry() : null;
  /* And the trigger finger, always. It is the one finger on the weapon
     that has a job every time you press the button, and welded into the
     hand it can never do it -- a first-person shooter whose trigger finger
     does not move is a photograph of a hand laid over a gun. One extra
     mesh and one extra draw per weapon. */
  const index = new Geometry();
  const out = {};
  const pairs = [
    { hand: hands.right, side: 1, grip: hands.rightGrip || 'pistol', sl: sleeve, sk: skin, tg: thumb },
    { hand: hands.left, side: -1, grip: hands.leftGrip || 'fore', sl: lSleeve, sk: lSkin, tg: null },
  ];
  for (const { hand, side, grip, sl, sk, tg } of pairs) {
    if (!hand) continue;
    const h = new Vec3(hand[0], hand[1], hand[2]);
    /* MEASURED, and not acted on. Every FIRING hand's anchor sits 2 to
     * 13 mm from its weapon's surface; every SUPPORT hand's sits 14 to
     * 78, and on the Scatter, Killstreak and Remington there is no
     * geometry within 20 mm of the anchor's station at all. The curl
     * solve scales the fingers until their tips reach, so an anchor held
     * 60 mm off the gun gives a palm out in the air with four long
     * fingers stretching to the forend -- and the hands whose skin sits
     * furthest from their own anchor (94 mm on the Thompson against 22
     * on the Sawn-off) are exactly the ones the sweep reports as having
     * skin on only three sides.
     *
     * Closing the anchor onto the surface along the grip's own axis was
     * tried here and reverted. It left the reach untouched (6 mm worst
     * slack either way) and made the quadrant numbers worse -- but that
     * comparison is not worth anything, because both that check and the
     * sweep's measure the spread of skin around `hands[which]`, the
     * AUTHORED anchor, and moving the hand moves it away from the point
     * it is being measured around. Every instrument I have for this is
     * anchor-relative and cannot judge a change that moves the anchor.
     *
     * So the instrument gets fixed before the geometry does. Note also
     * that the three-sides failure may itself be an artefact of the same
     * thing: the Thompson has 34 skin vertices within 55 mm of its
     * anchor where a hand that passes has 425 to 503, so its quadrant
     * split is computed over a sample too small to mean much. */
    const shoulder = new Vec3(back, drop, side * spread);
    buildViewArm(sl, shoulder, h, side);
    /* `out` collects where every digit finished, for both hands. It used to
       be passed only when the caller wanted a separate thumb mesh, so the
       support hand reported nothing at all and could not be checked. */
    const rec = {};
    // `surface` has to reach the hand or the fingers cannot be closed onto
    // anything -- it was being taken by makeViewmodelArms and dropped here.
    buildViewHand(sk, h, side, { grip, thumbGeo: tg, out: rec, boreY: opts.boreY,
      // Only the FIRING hand's index is separated: the support hand's
      // fingers are wrapped round a forend and have nothing to pull.
      indexGeo: side > 0 ? index : null, surface: opts.surface });
    if (tg && rec.thumbPivot) out.thumbPivot = rec.thumbPivot;
    if (side > 0 && rec.indexPivot) out.indexPivot = rec.indexPivot;
    out[side > 0 ? 'right' : 'left'] = rec;
  }
  for (const g of [sleeve, skin, lSleeve, lSkin, thumb, index]) {
    if (!g) continue;
    g.finalize();
    g.computeWeldGroups();
    smoothNormals(g);
    weldNormals(g.normals, g.weldGroups);
  }
  return { sleeve, skin, lSleeve, lSkin, thumb, index,
    thumbPivot: out.thumbPivot, indexPivot: out.indexPivot,
    // Where every finger and thumb ended up, in the weapon's own space.
    digits: { right: out.right || null, left: out.left || null },
    hasLeft: !!hands.left };
}

const VIEW_ARM_MATERIALS = {
  sleeve: { color: 0x3d3a2c, texture: 'fabric', roughness: 0.96, metalness: 0, uvScale: 1.4 },
  /* Hands under warm lamplight, and not a carrot. 0xb08462 with the room
     probe behind it came out orange enough to read as a glove. */
  /* Skin, and it was reading as a traffic cone. The texture carries its
     own warm tint and the subsurface term adds red on top of it, so a base
     this saturated compounds three times over. Desaturated, and the
     scatter pulled back to something that warms the thin edges rather than
     dyeing the whole hand. */
  /* Still a carrot at 0x9d8570. The texture carries its own warm tint and
     the scatter term adds red on top, so the base has to be almost
     neutral for the result to land on skin -- what looks far too grey in
     the hex is what comes out right on screen. */
  skin: { color: 0xbc8f6d, texture: 'skin', roughness: 0.72, metalness: 0, subsurface: 0.12 },
};

/* Spawn arms parented to a weapon actor. They move with it exactly. */
Engine.prototype.viewmodelArms = function (weapon, hands, opts = {}) {
  const key = 'arms:' + (opts.key || JSON.stringify(hands));
  let parts = this._armCache && this._armCache[key];
  if (!parts) {
    parts = makeViewmodelArms(hands, opts);
    (this._armCache || (this._armCache = {}))[key] = parts;
  }
  const mk = (geo, mat, tag) => {
    /* The cache key has to name the actual mesh. It used to be derived from
       whether the material happened to be the caller's skin override, which
       is the same string for the left sleeve and the right, so the second
       spawn got the first one's geometry back. */
    const a = this._spawn({ material: mat, physics: false },
      this._mesh(key + ':' + tag + ':' + (mat.texture || '') + (mat.color || ''), () => geo), null, 1.2);
    a.parent = weapon;
    return a;
  };
  const sleeveMat = opts.sleeveMaterial || VIEW_ARM_MATERIALS.sleeve;
  const skinMat = opts.skinMaterial || VIEW_ARM_MATERIALS.skin;
  const sleeve = mk(parts.sleeve, sleeveMat, 'r');
  const skin = mk(parts.skin, skinMat, 'r');
  const all = [sleeve, skin];
  let lSleeve = null, lSkin = null;
  if (parts.hasLeft) {
    lSleeve = mk(parts.lSleeve, sleeveMat, 'l');
    lSkin = mk(parts.lSkin, skinMat, 'l');
    all.push(lSleeve, lSkin);
  }
  /* A Geometry object is always returned for these; whether anything was
     ever emitted into it is a different question. The index finger is
     built by the trigger solve, and a knife, a hammer, a battering ram
     and a riot shield have no trigger -- so five weapons were each
     spawning an actor around an empty mesh, with bounds at negative two
     billion in every axis because nothing had ever been min'd into them.
     A degenerate bound is not free: it is a draw call and a culling
     candidate for a thing that cannot be seen. */
  const solid = (geo) => geo && geo.indices && geo.indices.length > 0;
  let thumb = null;
  if (solid(parts.thumb)) { thumb = mk(parts.thumb, skinMat, 't'); all.push(thumb); }
  let index = null;
  if (solid(parts.index)) { index = mk(parts.index, skinMat, 'i'); all.push(index); }
  /* `support` is the pair that may be moved away from the weapon during a
     reload. Everything else about them is identical to the firing arm. */
  return { sleeve, skin, lSleeve, lSkin, thumb, thumbPivot: parts.thumbPivot,
    index, indexPivot: parts.indexPivot,
    digits: parts.digits,
    support: lSleeve ? [lSleeve, lSkin] : [], parts: all };
};
