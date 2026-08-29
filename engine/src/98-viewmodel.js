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
  const spec = [
    [0.032, 0.031],   // sleeve mouth at the frame edge
    [0.029, 0.028],
    [0.026, 0.025],
    [0.023, 0.022],
    [0.020, 0.020],   // wrist
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
function buildViewHand(g, rawAt, side, opts = {}) {
  const fore = (opts.grip || 'pistol') === 'fore';

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
  const palm = fore ? V(0.30, 0.95, 0) : V(0.28, -0.94, 0);
  const point = fore ? V(0, 0.45, -side * 0.89) : new Vec3(0, 0, -side);
  const curl = fore ? V(0, -0.89, -side * 0.45) : V(-0.94, -0.28, 0);
  const lane = fore ? V(1, 0, 0) : V(0.28, -0.94, 0);
  // Toward whatever is being held, from the hand's own centre.
  const grasp = fore ? V(0, 1, 0) : V(0.94, 0.28, 0);

  /* The support hand goes UNDER the forend, not around the middle of it.

     Built centred on the anchor, four fifths of its skin came out above the
     line — it was resting on top of the handguard rather than holding it,
     which from the front is a lump of hand sitting on a gun. Measured, not
     guessed: gripcheck counts which side of the anchor each vertex is on,
     and the support hand was 132/68/15/13 across the four quadrants where
     the firing hand is 37/44/117/120. Drop it by a finger's width and the
     forend lands in the crook where it belongs. */
  const at = fore
    ? new Vec3(rawAt.x - grasp.x * 0.019, rawAt.y - grasp.y * 0.019, rawAt.z - grasp.z * 0.019)
    : rawAt;

  const at3 = (b, d) => new Vec3(at.x + b.x * d, at.y + b.y * d, at.z + b.z * d);

  /* Palm, running from behind the wrist so it swallows the sleeve's last
     ring, out to the knuckles. Slightly cupped toward the grip. */
  const rings = [];
  const PN = 5;
  for (let i = 0; i <= PN; i++) {
    const t = i / PN;
    // Wrist to knuckles: 95 mm, which is the length of a hand.
    const d = -0.028 + t * 0.095;
    rings.push({
      p: new Vec3(
        at.x + palm.x * d + grasp.x * t * 0.006,
        at.y + palm.y * d + grasp.y * t * 0.006,
        at.z + palm.z * d + grasp.z * t * 0.006,
      ),
      /* A palm, not a fist-sized sphere. It was 56 mm across and 42 mm
         through — a hand is about that wide and half that thick, and the
         extra depth is most of why this read as a ball. */
      w: 0.019 + Math.sin(t * PI * 0.85) * 0.011,
      d: 0.0085 + Math.sin(t * PI * 0.9) * 0.0055,
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
  const turn = (d, a2) => {
    const c = Math.cos(a2), sn = Math.sin(a2);
    const along = d.x * point.x + d.y * point.y + d.z * point.z;
    const across = d.x * curl.x + d.y * curl.y + d.z * curl.z;
    const na = along * c - across * sn, nc = along * sn + across * c;
    return new Vec3(point.x * na + curl.x * nc, point.y * na + curl.y * nc, point.z * na + curl.z * nc);
  };
  const digit = (root, dir0, bends, lens, r0) => {
    const rs = [];
    let d = dir0;
    // Start back inside the palm so the knuckle is buried in it.
    let p = new Vec3(root.x - d.x * 0.009, root.y - d.y * 0.009, root.z - d.z * 0.009);
    const total = lens[0] + lens[1] + lens[2] + 0.009;
    let travelled = 0;
    const push = (r) => rs.push({ p: new Vec3(p.x, p.y, p.z), w: r, d: r * 0.92, e: 2.4, uv: travelled / total });
    push(r0 * 1.08);
    for (let k = 0; k < 3; k++) {
      d = turn(d, bends[k]);
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
  const trigger = opts.trigger !== false && !fore;
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
  const knuckle0 = at3(palm, 0.052);
  for (let f = 0; f < 4; f++) {
    const isIndex = trigger && f === 3;
    // Index nearest the muzzle, little finger furthest from it.
    const off = (f - 1.5) * (fore ? 0.0186 : 0.0172);
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
    const close = fore ? 0.96 : 1.0;
    /* A hundred degrees over three joints, weighted to the middle knuckle,
       which is where a hand actually does most of its closing. Over 87 mm
       of bone that is an arc about 50 mm across — a hand round a grip
       rather than a fist eating itself. */
    const bends = isIndex ? [0.26, 0.34, 0.28] : [0.80 * close, 1.05 * close, 0.65 * close];
    let d0 = new Vec3(point.x, point.y, point.z);
    if (isIndex) {
      d0 = new Vec3(
        point.x * 0.40 - curl.x * 0.92,
        point.y * 0.40 - curl.y * 0.92,
        point.z * 0.40 - curl.z * 0.92,
      ).normalize();
    }
    digit(root, d0, bends, [LEN[0] * scale, LEN[1] * scale, LEN[2] * scale], 0.0072);
  }

  /* Thumb: off the near side of the palm, laid along the weapon and folded
     over the fingers. One surface as well, and it is the part that makes
     the hand look like it is gripping rather than resting against. */
  {
    const V2 = (x, y, z) => new Vec3(x, y, z).normalize();
    const near = new Vec3(0, 0, side);
    let p = new Vec3(
      at.x + palm.x * 0.004 + near.x * 0.014 + grasp.x * 0.006,
      at.y + palm.y * 0.004 + near.y * 0.014 + grasp.y * 0.006,
      at.z + palm.z * 0.004 + near.z * 0.014 + grasp.z * 0.006,
    );
    let d = fore ? V2(0.90, 0.36, -side * 0.24) : V2(0.60, 0.64, -side * 0.48);
    const rs = [{ p: new Vec3(p.x, p.y, p.z), w: 0.0114, d: 0.0102, e: 2.4, uv: 0 }];
    const step = (len, r, k) => {
      p = new Vec3(p.x + d.x * len, p.y + d.y * len, p.z + d.z * len);
      rs.push({ p: new Vec3(p.x, p.y, p.z), w: r, d: r * 0.9, e: 2.4, uv: k });
    };
    step(0.016, 0.0106, 0.22);
    step(0.014, 0.0100, 0.44);
    d = fore ? V2(0.78, 0.00, -side * 0.62) : V2(0.86, 0.04, -side * 0.54);
    step(0.013, 0.0096, 0.66);
    step(0.011, 0.0084, 0.86);
    step(0.005, 0.0038, 1.0);
    loftRings(g, rs, 9, true, true);
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
  const pairs = [
    { hand: hands.right, side: 1, grip: hands.rightGrip || 'pistol', sl: sleeve, sk: skin },
    { hand: hands.left, side: -1, grip: hands.leftGrip || 'fore', sl: lSleeve, sk: lSkin },
  ];
  for (const { hand, side, grip, sl, sk } of pairs) {
    if (!hand) continue;
    const h = new Vec3(hand[0], hand[1], hand[2]);
    const shoulder = new Vec3(back, drop, side * 0.105);
    buildViewArm(sl, shoulder, h, side);
    buildViewHand(sk, h, side, { grip });
  }
  for (const g of [sleeve, skin, lSleeve, lSkin]) {
    g.finalize();
    g.computeWeldGroups();
    smoothNormals(g);
    weldNormals(g.normals, g.weldGroups);
  }
  return { sleeve, skin, lSleeve, lSkin, hasLeft: !!hands.left };
}

const VIEW_ARM_MATERIALS = {
  sleeve: { color: 0x3d3a2c, texture: 'fabric', roughness: 0.96, metalness: 0, uvScale: 1.4 },
  /* Hands under warm lamplight, and not a carrot. 0xb08462 with the room
     probe behind it came out orange enough to read as a glove. */
  skin: { color: 0x9c7657, texture: 'skin', roughness: 0.72, metalness: 0, subsurface: 0.32 },
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
  /* `support` is the pair that may be moved away from the weapon during a
     reload. Everything else about them is identical to the firing arm. */
  return { sleeve, skin, lSleeve, lSkin, support: lSleeve ? [lSleeve, lSkin] : [], parts: all };
};
