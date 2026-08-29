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
function buildViewHand(g, at, side, opts = {}) {
  const grip = opts.grip || 'pistol';
  // Which way the fingers leave the knuckles: down and forward around a
  // pistol grip, straight along the weapon on a forend.
  const dir = grip === 'fore'
    ? new Vec3(0.86, -0.5, 0).normalize()
    : new Vec3(0.28, -0.94, 0).normalize();
  // The direction the fingers curl toward — across the front of whatever
  // is being held. Perpendicular to `dir` in the weapon's own vertical
  // plane, so a hand on a raked grip closes round that rake.
  const curl = new Vec3(-dir.y, dir.x, 0).normalize();
  const outw = new Vec3(0, 0, side);

  /* Palm. Starts behind the wrist so it swallows the sleeve's end ring. */
  const palm = [];
  const PN = 5;
  for (let i = 0; i <= PN; i++) {
    const t = i / PN;
    const d = -0.022 + t * 0.082;
    palm.push({
      p: new Vec3(
        at.x + dir.x * d + curl.x * t * 0.006,
        at.y + dir.y * d + curl.y * t * 0.006,
        at.z + dir.z * d + side * 0.002,
      ),
      // Widens out of the wrist into the knuckles, then rounds off.
      w: 0.019 + Math.sin(t * PI * 0.85) * 0.010,
      d: 0.014 + Math.sin(t * PI * 0.9) * 0.008,
      e: 2.6, uv: t,
    });
  }
  loftRings(g, palm, 12, true, true);

  /* One bone: a short loft from a point in a direction, returning where it
     ends so the next one can start there. Each is capped, and each starts
     a little way back inside the one before, so the knuckles close. */
  const bone = (p, d, len, r0, r1) => {
    const rings = [];
    for (let i = 0; i <= 2; i++) {
      const t = i / 2, q = -0.0022 + t * (len + 0.0022);
      rings.push({
        p: new Vec3(p.x + d.x * q, p.y + d.y * q, p.z + d.z * q),
        w: lerp(r0, r1, t), d: lerp(r0, r1, t) * 0.94, e: 2.4, uv: t,
      });
    }
    loftRings(g, rings, 8, true, true);
    return new Vec3(p.x + d.x * len, p.y + d.y * len, p.z + d.z * len);
  };
  // Turn a direction by `a` radians in the (dir, curl) plane.
  const turn = (d, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    const along = d.x * dir.x + d.y * dir.y, across = d.x * curl.x + d.y * curl.y;
    const na = along * c - across * s, nc = along * s + across * c;
    return new Vec3(dir.x * na + curl.x * nc, dir.y * na + curl.y * nc, d.z);
  };
  // A knuckle: a small ball at a joint, so the segments do not read as
  // a broken stick where they meet.
  const knuckle = (p, r) => {
    const rings = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      rings.push({
        p: new Vec3(p.x, p.y, p.z + outw.z * (t - 0.5) * 0.001),
        w: r * Math.sin((0.15 + t * 0.7) * PI), d: r * Math.sin((0.15 + t * 0.7) * PI),
        e: 2.2, uv: t,
      });
    }
    void rings;
  };
  void knuckle;

  /* Fingers. Three bones each, with the curl split across the two joints
     the way a closed hand splits it — most at the middle knuckle.

     On a trigger hand the index does not close with the rest: it reaches
     forward off the knuckle, takes one small bend, and lies along the
     trigger. A fist wrapped uniformly round a grip is a hand holding a
     stick; the separated index is what makes it a hand holding a gun. */
  const trigger = opts.trigger !== false && grip !== 'fore';
  const LEN = [0.0300, 0.0210, 0.0155];               // proximal, middle, distal
  for (let f = 0; f < 4; f++) {
    const isIndex = trigger && f === 3;
    const lane = (f - 1.5) * 0.0168;
    // Fingers get shorter away from the index, and the little finger sits
    // lower on the palm.
    const scale = isIndex ? 1.0 : [0.86, 0.97, 1.0, 1.0][f];
    const root = new Vec3(
      at.x + dir.x * (0.050 - (f === 0 ? 0.008 : 0)) + curl.x * 0.008 + outw.x * lane,
      at.y + dir.y * (0.050 - (f === 0 ? 0.008 : 0)) + curl.y * 0.008 + outw.y * lane,
      at.z + dir.z * 0.050 + outw.z * lane,
    );
    // How hard this finger closes. Around a grip it closes almost fully;
    // on a forend it lies over the top and closes less.
    const close = grip === 'fore' ? 0.72 : 1.0;
    const bends = isIndex ? [0.34, 0.30, 0.22] : [0.70 * close, 1.05 * close, 0.72 * close];
    let p = root, d = new Vec3(dir.x, dir.y, dir.z);
    // The index reaches forward before it bends, which is how it gets to
    // the trigger from a hand that is behind the grip.
    if (isIndex) d = turn(d, 0.86);
    for (let k = 0; k < 3; k++) {
      d = turn(d, bends[k]);
      const r0 = (isIndex ? 0.0082 : 0.0084) * (1 - k * 0.10);
      const r1 = (isIndex ? 0.0082 : 0.0084) * (1 - (k + 1) * 0.10);
      p = bone(p, d, LEN[k] * scale, r0, r1);
    }
  }

  /* Thumb: rooted low on the near side of the palm, laid up and across the
     front of the fingers — two bones, one joint, the way a real one folds
     over a grip. */
  {
    let d = turn(new Vec3(dir.x, dir.y, dir.z), 0.55);
    let p = new Vec3(
      at.x + dir.x * 0.012 - outw.x * 0.014,
      at.y + dir.y * 0.012 - outw.y * 0.014,
      at.z + dir.z * 0.012 - outw.z * 0.014,
    );
    p = bone(p, d, 0.0300, 0.0102, 0.0092);
    d = turn(d, grip === 'fore' ? 0.50 : 0.80);
    bone(p, d, 0.0230, 0.0092, 0.0078);
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

  const pairs = [
    { hand: hands.right, side: -1, grip: hands.rightGrip || 'pistol' },
    { hand: hands.left, side: 1, grip: hands.leftGrip || 'fore' },
  ];
  for (const { hand, side, grip } of pairs) {
    if (!hand) continue;
    const h = new Vec3(hand[0], hand[1], hand[2]);
    const shoulder = new Vec3(back, drop, side * 0.105);
    buildViewArm(sleeve, shoulder, h, side);
    buildViewHand(skin, h, side, { grip });
  }
  for (const g of [sleeve, skin]) {
    g.finalize();
    g.computeWeldGroups();
    smoothNormals(g);
    weldNormals(g.normals, g.weldGroups);
  }
  return { sleeve, skin };
}

const VIEW_ARM_MATERIALS = {
  sleeve: { color: 0x3d3a2c, texture: 'fabric', roughness: 0.96, metalness: 0, uvScale: 1.4 },
  skin: { color: 0xb08462, texture: 'skin', roughness: 0.68, metalness: 0, subsurface: 0.4 },
};

/* Spawn arms parented to a weapon actor. They move with it exactly. */
Engine.prototype.viewmodelArms = function (weapon, hands, opts = {}) {
  const key = 'arms:' + (opts.key || JSON.stringify(hands));
  let parts = this._armCache && this._armCache[key];
  if (!parts) {
    parts = makeViewmodelArms(hands, opts);
    (this._armCache || (this._armCache = {}))[key] = parts;
  }
  const mk = (geo, mat) => {
    const a = this._spawn({ material: mat, physics: false },
      this._mesh(key + ':' + (mat === opts.skinMaterial ? 'skin' : 'sleeve') + (mat.color || ''),
        () => geo), null, 1.2);
    a.parent = weapon;
    return a;
  };
  const sleeve = mk(parts.sleeve, opts.sleeveMaterial || VIEW_ARM_MATERIALS.sleeve);
  const skin = mk(parts.skin, opts.skinMaterial || VIEW_ARM_MATERIALS.skin);
  return { sleeve, skin, parts: [sleeve, skin] };
};
