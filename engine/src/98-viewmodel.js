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
   moment anything moves, because nothing guarantees the surfaces touch. */
function buildViewHand(g, at, side, opts = {}) {
  const grip = opts.grip || 'pistol';
  // Which way the fingers point: down and forward around a pistol grip,
  // straight along the weapon on a forend.
  const dir = grip === 'fore'
    ? new Vec3(0.86, -0.5, 0).normalize()
    : new Vec3(0.28, -0.94, 0).normalize();
  const outw = new Vec3(0, 0, side);

  /* Palm. Starts behind the wrist so it swallows the sleeve's end ring. */
  const palm = [];
  const PN = 5;
  for (let i = 0; i <= PN; i++) {
    const t = i / PN;
    const d = -0.022 + t * 0.086;
    palm.push({
      p: new Vec3(at.x + dir.x * d, at.y + dir.y * d, at.z + dir.z * d + side * 0.002),
      // Widens out of the wrist into the knuckles, then rounds off.
      w: 0.019 + Math.sin(t * Math.PI * 0.85) * 0.010,
      d: 0.014 + Math.sin(t * Math.PI * 0.9) * 0.008,
      e: 2.6, uv: t,
    });
  }
  loftRings(g, palm, 12, true, true);

  /* Fingers, curling back under the palm and gripping. Each one begins
     0.02 back inside the palm volume, so the join is never visible. */
  for (let f = 0; f < 4; f++) {
    const lane = (f - 1.5) * 0.0165;
    const startD = 0.052;
    const rings = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      // Out along the palm, then hooking back toward the palm's underside.
      const along = startD - 0.020 + t * 0.030;
      const curlBack = t * t * 0.030;
      rings.push({
        p: new Vec3(
          at.x + dir.x * along - dir.y * curlBack * 0.6 + outw.x * lane,
          at.y + dir.y * along + dir.x * curlBack * 0.6 + outw.y * lane,
          at.z + dir.z * along + outw.z * lane,
        ),
        w: 0.0082 - t * 0.0016, d: 0.0082 - t * 0.0016, e: 2.3, uv: t,
      });
    }
    loftRings(g, rings, 8, true, true);
  }

  /* Thumb, laid across the near side and rooted inside the palm. */
  const th = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const along = 0.004 + t * 0.052;
    rings0: {
      th.push({
        p: new Vec3(
          at.x + dir.x * along - outw.x * (0.012 + t * 0.004) - dir.y * t * 0.012,
          at.y + dir.y * along - outw.y * (0.012 + t * 0.004) + dir.x * t * 0.012,
          at.z + dir.z * along - outw.z * (0.012 + t * 0.004),
        ),
        w: 0.0098 - t * 0.0026, d: 0.0098 - t * 0.0026, e: 2.3, uv: t,
      });
    }
  }
  loftRings(g, th, 8, true, true);
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
