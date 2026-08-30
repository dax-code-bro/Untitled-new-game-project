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

/* One arm: a tapered loft from the sleeve opening to the wrist. */
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
  const spec = [
    [0.044, 0.042],   // sleeve mouth at the frame edge
    [0.040, 0.038],
    [0.036, 0.034],
    [0.032, 0.030],
    [0.029, 0.027],   // wrist
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
    spread: 0.0210, close: 0.86, index: 'wrap', thumb: 'along', drop: 0.023 },
  /* A big tube -- the Arc Breaker's accelerator, the MG42's shroud. The
     hand lies along it and barely closes. */
  tube: { axis: [1, 0, 0], round: [0, 1, 0], girth: 0.108,
    spread: 0.0214, close: 0.74, index: 'wrap', thumb: 'along', drop: 0.028 },
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
  const at = G.drop
    ? new Vec3(rawAt.x - grasp.x * G.drop, rawAt.y - grasp.y * G.drop, rawAt.z - grasp.z * G.drop)
    : rawAt;

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
  const pw0 = (fore ? 0.020 : 0.0165) * girthMul;
  const pw1 = (fore ? 0.0125 : 0.0112) * girthMul;
  const pd0 = fore ? 0.0110 : 0.0088;
  const pd1 = fore ? 0.0060 : 0.0044;
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
  loftRings(g, rings, 12, true, true);

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
  const digit = (root, dir0, bends, lens, r0, pt = point, cl = curl) => {
    const rs = [];
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
    }
    p = new Vec3(p.x + d.x * 0.0045, p.y + d.y * 0.0045, p.z + d.z * 0.0045);
    travelled += 0.0045;
    push(r0 * 0.44);
    loftRings(g, rs, 9, true, true);
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
  const LEN = [0.0420, 0.0262, 0.0190];
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
    if (isIndex) {
      /* The trigger finger reaches forward along the frame and closes
         inward onto the blade, which is a different plane from the one
         the other three close in. */
      const ipt = V(0.90, -0.10, -side * 0.42);
      const icl = V(-0.38, -0.34, -side * 0.86);
      digit(root, ipt, bends, [LEN[0] * scale, LEN[1] * scale, LEN[2] * scale], 0.0095, ipt, icl);
    } else {
      /* 19 mm through the proximal phalanx, which is a finger. It was 14,
         and 14 mm of flesh on 87 mm of bone is a worm. */
      digit(root, new Vec3(point.x, point.y, point.z), bends,
        [LEN[0] * scale, LEN[1] * scale, LEN[2] * scale], 0.0095);
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
    let d = G.thumb === 'along' ? V2(0.90, 0.36, -side * 0.24)
      : G.thumb === 'up' ? V2(0.10, 0.95, -side * 0.30)
        : V2(0.60, 0.64, -side * 0.48);
    const rs = [{ p: new Vec3(p.x, p.y, p.z), w: 0.0114, d: 0.0102, e: 2.4, uv: 0 }];
    const step = (len, r, k) => {
      p = new Vec3(p.x + d.x * len, p.y + d.y * len, p.z + d.z * len);
      rs.push({ p: new Vec3(p.x, p.y, p.z), w: r, d: r * 0.9, e: 2.4, uv: k });
    };
    /* 59 mm of thumb was short even for a hand: a thumb is about 70 mm
       from the base joint to the tip, and this one has to reach a hammer. */
    step(0.019, 0.0108, 0.22);
    step(0.017, 0.0102, 0.44);
    d = G.thumb === 'along' ? V2(0.78, 0.00, -side * 0.62)
      : G.thumb === 'up' ? V2(0.16, 0.86, -side * 0.48)
        : V2(0.86, 0.04, -side * 0.54);
    step(0.016, 0.0097, 0.66);
    step(0.013, 0.0085, 0.86);
    step(0.006, 0.0039, 1.0);
    loftRings(tg, rs, 9, true, true);
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
  const drop = opts.drop != null ? opts.drop : -0.21;

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
  const out = {};
  const pairs = [
    { hand: hands.right, side: 1, grip: hands.rightGrip || 'pistol', sl: sleeve, sk: skin, tg: thumb },
    { hand: hands.left, side: -1, grip: hands.leftGrip || 'fore', sl: lSleeve, sk: lSkin, tg: null },
  ];
  for (const { hand, side, grip, sl, sk, tg } of pairs) {
    if (!hand) continue;
    const h = new Vec3(hand[0], hand[1], hand[2]);
    const shoulder = new Vec3(back, drop, side * 0.105);
    buildViewArm(sl, shoulder, h, side);
    buildViewHand(sk, h, side, { grip, thumbGeo: tg, out: tg ? out : null });
  }
  for (const g of [sleeve, skin, lSleeve, lSkin, thumb]) {
    if (!g) continue;
    g.finalize();
    g.computeWeldGroups();
    smoothNormals(g);
    weldNormals(g.normals, g.weldGroups);
  }
  return { sleeve, skin, lSleeve, lSkin, thumb, thumbPivot: out.thumbPivot,
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
  skin: { color: 0x9d8570, texture: 'skin', roughness: 0.74, metalness: 0, subsurface: 0.16 },
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
  let thumb = null;
  if (parts.thumb) { thumb = mk(parts.thumb, skinMat, 't'); all.push(thumb); }
  /* `support` is the pair that may be moved away from the weapon during a
     reload. Everything else about them is identical to the firing arm. */
  return { sleeve, skin, lSleeve, lSkin, thumb, thumbPivot: parts.thumbPivot,
    support: lSleeve ? [lSleeve, lSkin] : [], parts: all };
};
