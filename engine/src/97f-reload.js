/* ==================================================================
   THE RELOAD, AS A THING YOU CAN WATCH
   ==================================================================

   A reload is two halves. The WEAPON's half -- the magazine that drops
   out, the bolt that runs, the cylinder that swings -- is the action
   module next door. This is the other half: the object the support hand
   goes and fetches, and the hand that carries it.

   It lived inside bunker-nine, which meant multiplayer's reload was a
   positional dip and nothing else: the gun tipped, the ammunition count
   changed, and no magazine ever left a pouch or entered a well. Seventy
   five weapons reloading by telepathy.

   So it is here, in the engine, and both games call it. Nothing in this
   file knows what a player is or which game is asking. It is told:

     - the weapon actor, because the load is parented to it and travels
       in its space (so it inherits sway, recoil and bob for free);
     - where the weapon's own parts are -- magazine well, bore, breech,
       crane, cell rest, clip rest -- measured off the model rather than
       guessed at, which is why the same path works on a pistol and on a
       belt-fed gun;
     - how far through the reload we are;
     - and the camera, so the fetch can be checked against the edge of
       the frame.

   It gives back where the load is and where the hand that holds it
   should be. The caller moves its own arm actors; this does not know
   what an arm is either.

   HANDEDNESS, because it decides every sign below: the weapon's long
   axis is +X, +Z is the gun's RIGHT, and the support side is therefore
   -Z. Down is -Y. */

/* Default cartridges, for a caller with no table of its own. Multiplayer
   has none; zombies passes its own AMMO entries through `o.round`. */
const RELOAD_AMMO = {
  para9: { headR: 0.00497, caseR: 0.00480, neckR: 0.00450, caseLen: 0.0192, overall: 0.0297 },
  mau763: { headR: 0.00490, caseR: 0.00470, neckR: 0.00400, caseLen: 0.0251, overall: 0.0350 },
  mag500: { headR: 0.00740, caseR: 0.00700, neckR: 0.00680, caseLen: 0.0410, overall: 0.0530 },
};

/* When the carried load is visible, per reload kind.

   These are not free numbers. Each one is pinned to the beat the WEAPON's
   own part changes on, because for half a second there were two
   magazines: the carried one was still flying at prog 0.62, which is
   exactly when the gun's own magazine came back. And before prog 0.34
   there was no magazine at all, in the hand or in the gun -- a fifth of a
   second of a man reloading with an empty fist.

     mag      gun's magazine hidden 0.16 -> 0.62
     clip     gun's own clip seats   0.28 -> 0.74
     cell     cell is clear of the housing 0.26 -> 0.62
     break    nothing gun-side; the shells stay in the chambers
     revolver cylinder is out 0.20 -> 0.78

   The carried thing therefore arrives exactly as the gun-side part takes
   over, and leaves nothing empty behind it. */
const RELOAD_WINDOW = {
  mag: [0.14, 0.63],
  clip: [0.10, 0.86],
  cell: [0.16, 0.63],
  belt: [0.34, 0.66],
  break: [0.20, 0.68],
  revolver: [0.22, 0.78],
  /* A tube gun is loaded for almost the whole of its reload, because the
     shells go in one after another and the last one is still going in
     when the animation ends. */
  tube: [0.08, 0.92],
  /* A rocket is one object and it takes the whole reload to fetch,
     line up and push home. */
  rocket: [0.14, 0.88],
  /* A BAZOOKA LOADS FROM THE BACK, so the rocket is in the hand for the
     first two thirds and then disappears INTO the tube rather than
     staying proud of the muzzle. All four launchers shared the muzzle
     path, which put an M1's rocket out in front of a weapon that is
     loaded over the loader's shoulder. */
  breech: [0.12, 0.70],
  /* A STINGER IS A SEALED TUBE. There is no missile to load: the round
     comes packed in its launch tube and what changes hands is the tube
     itself, clipped onto the gripstock. So the carried object is the
     whole tube, it arrives late, and it never leaves the hand -- it
     BECOMES the weapon. */
  sealed: [0.30, 0.86],
};

/* Every kind that puts something in the hand. A weapon whose reloadKind
   is none of these reloads gun-side only, and the support hand stays
   where it is. */
const RELOAD_CARRIES = { mag: 1, clip: 1, cell: 1, belt: 1, break: 1,
  revolver: 1, tube: 1, rocket: 1, breech: 1, sealed: 1 };

/* Where the fingers close on each kind of load: a magazine near its
   base, a clip by its spine, a pair of shells at their heads, a cell by
   its body, a belt by its leading link. */
const RELOAD_HOLD = {
  break: [-0.030, -0.008, -0.010],
  clip: [-0.004, 0.050, -0.008],
  revolver: [-0.010, -0.030, -0.012],
  belt: [-0.010, -0.014, -0.030],
  /* A shell going up the loading gate is held between thumb and
     forefinger at its head, and the thumb is what pushes it home. */
  tube: [-0.022, -0.010, -0.008],
  /* A rocket is carried by its motor tube, well behind the warhead --
     nobody picks one up by the fuse. */
  rocket: [-0.120, -0.012, 0.000],
  /* Going in backwards, so the hand is on the fin end: the warhead is
     the part being pushed away from you. */
  breech: [0.105, -0.010, 0.000],
  /* A launch tube is carried under the middle, two hands' worth of
     weight on one until it is clipped on. */
  sealed: [0.000, -0.062, 0.000],
  mag: [0.000, -0.052, -0.006],
};

/* Where a load is fetched FROM: down and to the support side of where it
   is going. Not down and out of the picture -- see reloadOnscreen. */
function reloadFetch(to, dy, dz) {
  const y = dy == null ? -0.052 : dy;
  const z = dz == null ? -0.140 : dz;
  return [to[0] - 0.028, to[1] + y, to[2] + z];
}

/* AND THE SAME TRADE AGAIN, ONCE THE CAMERA CAN BE ASKED.
 *
 * The rule above is right and the numbers in it are not enough on their
 * own. Measured across the rack, five weapons still fetch from below the
 * frame -- the Thompson's magazine reaches NDC -1.22, the MP5's -1.17,
 * the 1911's -1.16 -- and the player watches a hand dip off the bottom
 * of the screen and come back with a magazine in it.
 *
 * WHY A CONSTANT CANNOT FIX IT. The obvious repair is a floor on the
 * fetch height, and the measurement says no: the Thompson's magazine
 * well sits at local y -0.030 and the 1911's at -0.085, and it is the
 * THOMPSON that goes further off screen. Each viewmodel sits at its own
 * depth and its own offset, so the same local y lands somewhere
 * different on the glass for every weapon.
 *
 * So ask the camera, which knows. Swing the fetch offset up in the y-z
 * plane, keeping its LENGTH -- the same reach, the same distance
 * travelled -- until the point projects above the bottom edge. Nothing
 * moves on a weapon that was already fine, because the loop exits on
 * the first test. */
function reloadOnscreen(cam, root, to, from) {
  if (!cam || !cam.viewProj || !root || !root.matrix) return from;
  const m = cam.viewProj.e, rm = root.matrix.e;
  /* Weapon space -> world -> clip. The load is parented to the weapon,
     so the weapon's own matrix is the whole of the first step. */
  const ndcY = (q) => {
    const x = rm[0] * q[0] + rm[4] * q[1] + rm[8] * q[2] + rm[12];
    const y = rm[1] * q[0] + rm[5] * q[1] + rm[9] * q[2] + rm[13];
    const z = rm[2] * q[0] + rm[6] * q[1] + rm[10] * q[2] + rm[14];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 1e-5) return null;
    return (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  };
  /* A margin inside the edge, because the magazine has a length and it
     is the BOTTOM of it that leaves the screen first. */
  const FLOOR = -0.88;
  const dy = from[1] - to[1], dz = from[2] - to[2];
  const len = Math.hypot(dy, dz);
  if (len < 1e-6) return from;
  const q0 = ndcY(from);
  if (q0 == null || q0 >= FLOOR) return from;
  const a0 = Math.atan2(dy, dz);
  /* Past level, and up: a quarter turn beyond the no-drop direction,
     which puts the fetch directly ABOVE the well rather than behind it.
     Stopping at level could lift a fetch up TO the well and never above
     it, and on the weapons where this matters that is the only thing
     that would have helped. No length is given up -- a hand comes to the
     gun from somewhere, and shortening the journey to nothing would be
     a magazine appearing in the well. */
  const tgt = dz < 0 ? (a0 < 0 ? -Math.PI : Math.PI) : 0;
  const tgtUp = tgt + (a0 < 0 ? -Math.PI / 2 : Math.PI / 2);
  for (let i = 1; i <= 16; i++) {
    const na = a0 + (tgtUp - a0) * (i / 16);
    const cand = [from[0], to[1] + Math.sin(na) * len, to[2] + Math.cos(na) * len];
    const q = ndcY(cand);
    if (q != null && q >= FLOOR) return cand;
  }
  /* And if even straight up over the well does not clear, the gun itself
     is off screen and the load is the least of the problem. */
  return from;
}

/* THE THING BEING CARRIED.
 *
 * Built once per weapon and kept, because a reload happens every few
 * seconds and spawning a magazine each time is a mesh upload each time --
 * on the frame a man with an empty gun reaches for one, which is the
 * worst possible moment for a hitch.
 *
 * Parented to the weapon, so it inherits every bit of sway and recoil the
 * gun has and does not swim about relative to the hand holding it.
 *
 *   cache  an object the caller keeps; one entry per id
 *   id     whatever the caller calls this weapon
 *   root   the weapon actor
 *   kind   mag | clip | cell | belt | break | revolver
 *   o      { ammo, clip, rounds, mag }
 *
 * `o.ammo` is the weapon's ammunition description in the caller's own
 * vocabulary -- { mag, clip, cell, shell, round, magMaterial,
 * hullMaterial } -- and every field of it is optional. */
Engine.prototype.reloadProp = function (cache, id, root, kind, o = {}) {
  if (!cache || !root || !kind) return null;
  const cached = cache[id];
  /* Kept between reloads, but only while it is still the right object.
     The clip guns hand back the WEAPON's own clip actor, and a weapon
     given again is a new viewmodel with a new clip -- a cache that
     returned the old one would drive an actor no longer in the scene,
     and the reload would go invisible. */
  if (cached && (kind !== 'clip' || cached.root === o.clip)) return cached;

  const A = o.ammo || {};
  let made = null;
  if (kind === 'mag') {
    made = this.boxMagazine({ physics: false, mag: Object.assign({
      w: 0.026, d: 0.021, len: 0.105, curve: 0, witness: 0, round: RELOAD_AMMO.para9,
    }, A.mag || {}), bodyMaterial: A.magMaterial });
  } else if (kind === 'clip') {
    /* The weapon already has one. Building a second meant two clips on
       screen a fifth of a second apart, and neither of them held for the
       part of the reload that matters. */
    if (o.clip) { cache[id] = { root: o.clip, parts: [o.clip] }; return cache[id]; }
    made = this.stripperClip({ physics: false, clip: Object.assign({
      count: 10, pitch: 0.0098, round: RELOAD_AMMO.mau763,
    }, A.clip || {}) });
  } else if (kind === 'cell') {
    made = this.powerCell({ physics: false, cell: Object.assign({
      w: 0.052, h: 0.070, d: 0.038,
    }, A.cell || {}) });
  } else if (kind === 'belt') {
    made = this.mgBelt({ physics: false, belt: { links: 12 } });
  } else if (kind === 'break') {
    /* Two shells held between the fingers, which is how you load a
       double: the pair goes in together. They are their own actors so
       they can be left in the chambers rather than vanishing. */
    const shells = [];
    for (let i = 0; i < 2; i++) {
      const sh = this.shotShell({ physics: false,
        shell: Object.assign({ r: 0.00925, len: 0.0700, head: 0.0220 }, A.shell || {}),
        hullMaterial: A.hullMaterial });
      sh.setRotation([0, 0, 0]);
      shells.push(sh);
    }
    // The first is the holder; the second rides beside it.
    shells[0].parent = root;
    shells[1].parent = shells[0];
    shells[1].setPosition([0, 0, 0.0212]);
    const parts0 = [];
    for (const sh of shells) {
      parts0.push(sh);
      for (const n of sh.partNames || []) if (sh[n]) parts0.push(sh[n]);
    }
    for (const q of parts0) q.visible = false;
    cache[id] = { root: shells[0], parts: parts0, shells };
    return cache[id];
  } else if (kind === 'sealed') {
    /* A STINGER HAS NO MISSILE TO LOAD.
     *
     * The round comes from the factory sealed in its launch tube; what
     * a crew changes is the TUBE, clipped onto a gripstock that is the
     * only part they keep. So the carried object is not a rocket, it is
     * a metre of fibreglass pipe with the weapon's own diameter, and it
     * does not disappear into anything -- it becomes the weapon.
     *
     * All four launchers shared the muzzle-loaded rocket path, which
     * had a Stinger crew posting a bare missile into the front of a
     * sealed tube. */
    const T = (A.sealed || {});
    const body = this.cylinder({ physics: false,
      radius: T.r == null ? 0.041 : T.r,
      height: T.len == null ? 0.62 : T.len,
      material: A.sealedMaterial || { color: 0x5d6152, texture: 'metal',
        roughness: 0.78, metalness: 0.25 } });
    body.parent = root;
    // Built standing on +Y; the bore runs +X.
    body.setRotation([0, 0, -90]);
    const partsT = [body];
    for (const q of body.partNames || []) if (body[q]) partsT.push(body[q]);
    for (const q of partsT) q.visible = false;
    cache[id] = { root: body, parts: partsT };
    return cache[id];
  } else if (kind === 'rocket' || kind === 'breech') {
    /* A LAUNCHER DOES NOT TAKE A MAGAZINE, and four of them were going
       to: with no path of their own they fell through to `mag`, which
       posts a box into a magazine well -- and a tube has none, so
       magWell came back as the weapon's own origin and a pistol
       magazine appeared inside the barrel.

       A rocket is one object: a warhead on a motor tube, brought up
       from below and in front and pushed back into the muzzle. Built
       from a cone and a cylinder rather than a table entry because
       there is no ammunition description in the world that describes a
       shaped charge. */
    const R = (A.rocket || {});
    const wr = R.r == null ? 0.036 : R.r;
    const nose = this.cone({ physics: false, radius: wr, height: R.head == null ? 0.10 : R.head,
      material: A.rocketMaterial || { color: 0x4a4f42, texture: 'metal',
        roughness: 0.62, metalness: 0.8 } });
    const tube = this.cylinder({ physics: false, radius: wr * 0.42,
      height: R.len == null ? 0.26 : R.len,
      material: A.rocketMaterial || { color: 0x3a3a38, texture: 'metal',
        roughness: 0.55, metalness: 0.85 } });
    /* The cone is built standing on +Y and the weapon's bore runs +X,
       so it is laid over a quarter turn to point down the barrel. */
    nose.parent = root;
    nose.setRotation([0, 0, -90]);
    tube.parent = nose;
    tube.setPosition([0, -((R.len == null ? 0.26 : 0.26) * 0.5
      + (R.head == null ? 0.10 : R.head) * 0.5), 0]);
    const parts = [nose, tube];
    for (const q of nose.partNames || []) if (nose[q]) parts.push(nose[q]);
    for (const q of tube.partNames || []) if (tube[q]) parts.push(tube[q]);
    for (const q of parts) q.visible = false;
    cache[id] = { root: nose, parts };
    return cache[id];
  } else if (kind === 'tube') {
    /* A PUMP OR LEVER SHOTGUN IS NOT A BREAK GUN, and multiplayer had
       thirteen of them all reloading like one. Shells go into the
       loading gate on the underside of the receiver, one at a time,
       thumbed in against the lifter -- which is why a tube gun takes so
       long to fill and why you can top it up a round at a time.
       Separate actors, like the revolver's rounds, because they go in
       one after another; unlike the revolver's they disappear INTO the
       magazine tube rather than staying on show. */
    const n = Math.max(1, Math.min(o.mag || 5, 8));
    const shells = [];
    for (let i = 0; i < n; i++) {
      const sh = this.shotShell({ physics: false,
        shell: Object.assign({ r: 0.00925, len: 0.0700, head: 0.0220 }, A.shell || {}),
        hullMaterial: A.hullMaterial });
      sh.parent = root;
      sh.setRotation([0, 0, 0]);
      shells.push(sh);
      for (const q of sh.partNames || []) if (sh[q]) shells.push(sh[q]);
    }
    for (const q of shells) q.visible = false;
    cache[id] = { root: shells[0], parts: shells, shells, count: n };
    return cache[id];
  } else if (kind === 'revolver') {
    /* Loose rounds, thumbed in one at a time -- a man with a handful of
       .50 out of his coat pocket, not a competition shooter with a moon
       clip. They are their own actors so they can be left IN the
       chambers rather than vanishing at the end; the cylinder carries
       them from there. */
    const rounds = [];
    for (let i = 0; i < (o.mag || 4); i++) {
      const r = this.cartridge({ physics: false,
        round: Object.assign({}, RELOAD_AMMO.mag500, A.round || {}) });
      r.parent = root;
      rounds.push(r);
      for (const n of r.partNames || []) if (r[n]) rounds.push(r[n]);
    }
    for (const q of rounds) q.visible = false;
    cache[id] = { root: rounds[0], parts: rounds, rounds };
    return cache[id];
  } else return null;

  made.parent = root;
  const parts = [made];
  for (const n of made.partNames || []) if (made[n]) parts.push(made[n]);
  for (const q of parts) q.visible = false;
  cache[id] = { root: made, parts };
  return cache[id];
};

/* How far the support hand has strayed from the weapon, and how far
   through the carry it is, for a reload `u` fractions done.

   Four beats: away from the gun, out of shot, back with the load, and
   home. Smoothed, because a hand that moves linearly between poses reads
   as a lift rather than as an arm.

   The reach is down and to the SUPPORT SIDE, not down and out of the
   picture. It used to drop 150 mm: the weapon is carried 186 mm below
   the camera axis and half the frame at the weapon's distance is 185 mm,
   so a hand 150 mm below the gun was below the bottom edge and
   everything it carried went with it. The room is sideways -- 13 cm of
   frame to the right of the gun and 45 to the left -- so the fetch goes
   to the support side and only dips far enough to read as reaching. */
function reloadReach(u, kind) {
  const ease = (t) => t * t * (3 - 2 * t);
  const seg = (a, b) => Math.max(0, Math.min(1, (u - a) / (b - a)));
  const away = ease(seg(0.05, 0.30));
  const back = ease(seg(0.42, 0.74));
  const settle = ease(seg(0.74, 0.94));
  const reach = away * (1 - back);
  const win = RELOAD_WINDOW[kind] || RELOAD_WINDOW.mag;
  return {
    x: -0.030 * reach,
    y: -0.052 * reach - 0.026 * back * (1 - settle),
    z: -0.135 * reach,
    // The load is in the hand between fetching it and seating it.
    t: (u > win[0] && u < win[1]) ? (u - win[0]) / (win[1] - win[0]) : -1,
  };
}

/* WHERE THE LOAD IS, THIS FRAME.
 *
 * Everything used to travel the same path to the same place: up from
 * below-outboard to the magazine well, whatever it was. A stripper clip
 * does not go into a magazine well, it goes into the guide on TOP of the
 * receiver and the rounds are pressed down out of it. Shotgun shells go
 * into the chamber mouths, nose first, and stay there. Sending all of
 * them to the same point is an invisible reload with a prop attached.
 *
 *   o.prop     from reloadProp
 *   o.kind     which of the six
 *   o.t        0..1 through the CARRY (reloadReach().t)
 *   o.root     the weapon actor, for the on-screen check
 *   o.camera   the camera, same
 *   o.bore     bore height above the weapon's origin
 *   o.magWell  [x, y, z] where a magazine goes in
 *   o.breechAt where a break gun's chambers are
 *   o.crane    where a revolver's swung-out cylinder sits
 *   o.cellRest where a battery cell lives
 *   o.clipRest where a stripper clip seats
 *   o.sightAt  sight height, which locates a belt-fed feed tray
 *   o.mag      chambers, for a revolver
 *   o.fitted   'drummag' | 'extmag' | 'fastmag', if one is on
 *
 * Returns { x, y, z, hold } in the weapon's space: where the load ended
 * up, and where the fingers close on it. */
Engine.prototype.poseReload = function (o) {
  const prop = o.prop, kind = o.kind;
  if (!prop || !kind) return null;
  let u2 = Math.min(1, Math.max(0, o.t));
  // Which actor actually travels. For most weapons it is the whole prop;
  // the revolver moves one cartridge at a time out of four.
  let propRoot = prop.root;
  const bore = o.bore == null ? 0.06 : o.bore;
  let to = o.magWell || [0.02, -0.055, 0];
  let from = reloadFetch(to);
  let rot = [0, 0, 0], rot0 = [0, 0, 0];
  let show = true;
  let carry = u2;

  if (kind === 'break') {
    /* Into the chamber mouths of the broken-open barrels: the pair comes
       up from below the breech, noses forward, and slides in. Once they
       are home the shells stay -- the gun's own barrels carry them. */
    const bx = o.breechAt == null ? 0.030 : o.breechAt;
    to = [bx + 0.004, bore - 0.0002, -0.0122];
    from = reloadFetch(to, -0.055);
    rot0 = [0, -34, -22];
    show = u2 < 0.995;
  } else if (kind === 'rocket') {
    /* Nose first, into the muzzle. It comes from below and in FRONT of
       the weapon rather than from the pouch under the receiver, because
       that is where a second rocket is carried and because a warhead
       arriving from behind would have to pass through the tube to get
       where it is going.

       AND IT ENDS IN FRONT OF THE MUZZLE, NOT BEHIND IT. This seated
       the warhead 30 mm back from muzzleAt -- inside the tube, where
       the one thing worth watching is invisible. A rocket-propelled
       grenade is loaded from the front and STAYS proud of the tube;
       the weapon says exactly how far, because tipAt is the far end of
       the model and exists for this reason: "a Panzerfaust's warhead
       stands 200 mm out in front of the muzzle and an RPG's grenade
       310". Seat it there and it is the same object in the same place
       the loaded weapon draws it. */
    const mz = o.muzzleAt == null ? 0.42 : o.muzzleAt;
    const tip = o.tipAt != null && o.tipAt > mz ? o.tipAt : mz + 0.120;
    to = [tip - 0.060, bore, 0];
    from = [tip + 0.190, bore - 0.185, -0.130];
    rot0 = [0, -26, -30];
    // It stays in the tube once it is home, so nothing to hide.
    show = u2 < 0.99;
  } else if (kind === 'breech') {
    /* AND A BAZOOKA LOADS FROM THE OTHER END.
     *
     * An M1 is loaded over the firer's shoulder: the rocket goes into
     * the BACK of the tube, fins first is wrong -- warhead first, from
     * behind -- and once it is home it is inside the tube and out of
     * sight. Sharing the muzzle path put an M1's rocket standing proud
     * of the front of a weapon nobody can reach the front of while it
     * is on their shoulder.
     *
     * The breech end is behind the weapon's origin, which is roughly
     * under the firer's hand; the rocket comes up and in from the
     * support side and goes forward down the bore. It vanishes at the
     * end of the window rather than staying, because by then it is
     * inside the tube. */
    const back = o.breechAt == null ? -0.150 : Math.min(-0.060, o.breechAt - 0.20);
    to = [back + 0.030, bore, 0];
    from = [back - 0.230, bore - 0.150, -0.150];
    rot0 = [0, 18, -24];
    show = u2 < 0.92;
  } else if (kind === 'sealed') {
    /* THE WHOLE TUBE, clipped on. It comes up from underneath and to
       the support side, levels, and seats along the bore -- and it does
       NOT disappear, because from that moment it is the weapon. The
       seat is the weapon's own axis, so the tube finishes concentric
       with the launcher rather than beside it. */
    to = [0.030, bore, 0];
    from = [-0.120, bore - 0.230, -0.175];
    rot0 = [0, 10, -30];
    show = true;
  } else if (kind === 'tube') {
    /* One shell at a time, up into the gate. The hand makes the same
       short trip as many times as there are shells: down to the belt,
       up under the receiver, thumb, back down. Each one vanishes as it
       goes in, because from there it is inside the magazine tube and
       the only thing you would see is the lifter.

       The gate is under the breech, a little below the bore and on the
       gun's own centre line -- a shotgun loads from directly underneath,
       not from the side the way a magazine does. */
    const bx = o.breechAt == null ? 0.030 : o.breechAt;
    const gate = [bx - 0.018, bore - 0.040, 0];
    const N = Math.max(1, prop.count || 1);
    const each = 1 / N;
    const which = Math.min(N - 1, Math.floor(u2 / each));
    const sub = (u2 - which * each) / each;
    const per = prop.parts.length / N;
    for (let k = 0; k < prop.parts.length; k++) {
      /* Only the one in the fingers is on screen; the rest are in the
         tube already or still on the belt. */
      prop.parts[k].visible = Math.floor(k / per) === which && sub > 0.10 && sub < 0.94;
    }
    to = gate;
    from = reloadFetch(gate, -0.048, -0.120);
    // Nose first, tipped up into the gate and straightening as it goes.
    rot0 = [0, -30, -24];
    propRoot = prop.parts[Math.floor(which * per)];
    carry = sub;
  } else if (kind === 'revolver') {
    /* Four rounds, one chamber at a time. The hand makes the same short
       trip four times: down to the pocket, up to the cylinder face,
       press, back down. Each round stops in the chamber it was put in
       and stays there -- they are the gun's rounds now -- so by the end
       there are four cartridges sitting in the cylinder rather than a
       speedloader that has vanished. */
    const cr = o.crane || [0.09, bore, -0.015];
    const N = Math.max(1, o.mag || 4);
    const seat = (i) => {
      // Round the cylinder face, in the order a thumb would use them.
      const th = (i / N) * Math.PI * 2 + 0.4;
      const pcd = 0.0148;
      return [cr[0] - 0.030, bore + Math.sin(th) * pcd, cr[2] - 0.045 + Math.cos(th) * pcd];
    };
    const each = 1 / N;
    const which = Math.min(N - 1, Math.floor(u2 / each));
    const sub = (u2 - which * each) / each;      // 0..1 within this one
    if (prop.rounds) {
      const per = prop.rounds.length / N;
      for (let i = 0; i < N; i++) {
        const done2 = i < which, now2 = i === which;
        for (let k = 0; k < prop.rounds.length; k++) {
          if (Math.floor(k / per) !== i) continue;
          const q = prop.rounds[k];
          q.visible = done2 || (now2 && sub > 0.12);
          /* Nose forward, down the chamber. A cartridge model runs along
             +X by construction and +X is where the barrel is, so the
             seated rotation is zero -- turned ninety degrees about Z
             they stood on end in the cylinder like little chimneys. */
          if (done2) { q.setPosition(seat(i)); q.setRotation([0, 0, 0]); }
        }
      }
    }
    to = seat(which);
    from = reloadFetch(to);
    // Home is nose-down-the-chamber; it arrives tipped and straightens.
    rot0 = [0, -28, 34];
    propRoot = prop.rounds ? prop.rounds[Math.floor(which * (prop.rounds.length / N))] : prop.root;
    carry = sub;
  } else if (kind === 'clip') {
    /* The whole of it on one path: up out of the pouch, into the stripper
       guide on top of the open action, PRESSED DOWN so the rounds strip
       off into the magazine, then flicked clear. Three legs rather than
       one, because a clip that arrives and stops is a clip nobody
       loaded. The hand is placed from wherever this ends up, so it is on
       the clip for all three -- the press included, which is the leg
       that used to happen by itself. */
    const seat = o.clipRest || [0.012, bore + 0.030, 0];
    const fetch = reloadFetch(seat, -0.075, -0.150);
    const leg = (a2, b2) => Math.max(0, Math.min(1, (u2 - a2) / (b2 - a2)));
    const eIn = leg(0, 0.42), ePress = leg(0.42, 0.76), eOut = leg(0.80, 1);
    const sIn = eIn * eIn * (3 - 2 * eIn);
    const sPr = ePress * ePress * (3 - 2 * ePress);
    const cx = fetch[0] + (seat[0] - fetch[0]) * sIn;
    const cy2 = fetch[1] + (seat[1] - fetch[1]) * sIn - 0.042 * sPr;
    const cz = fetch[2] + (seat[2] - fetch[2]) * sIn;
    // Thrown off to the support side as it leaves.
    to = [cx - 0.010 * eOut, cy2 + 0.055 * eOut, cz - 0.090 * eOut];
    from = to;
    const tilt = 1 - sIn;
    rot = [22 * tilt, -30 * tilt, 16 * tilt + 40 * eOut];
    rot0 = rot;
    show = eOut < 0.92;
  } else if (kind === 'belt') {
    /* Into the feed tray, from the left, laid flat. The belt is carried
       by its leading link and goes in across the gun -- so it arrives
       level with the tray and slightly outboard of it, and the last of
       the travel is sideways rather than up. That is the difference
       between laying a belt in and posting a magazine. */
    const trayY = (o.sightAt == null ? 0.09 : o.sightAt) - 0.030;
    to = [0.096, trayY, -0.020];
    from = [to[0] - 0.020, to[1] - 0.070, to[2] - 0.165];
    rot0 = [0, -34, -30];
    show = u2 < 0.96;
  } else if (kind === 'cell') {
    /* Into the housing the cell actually lives in. This went to the
       magazine well -- which an energy weapon does not have, so it fell
       through to a guess and the cell was posted into the air below the
       accelerator tube. The weapon reports where its cell rests. */
    const cr = o.cellRest || [to[0], to[1] + 0.004, to[2]];
    to = [cr[0], cr[1], cr[2]];
    from = reloadFetch(to, -0.058);
    rot0 = [0, -24, -18];
  } else {
    /* A magazine goes up the well nose-first, tipped a little as the hand
       brings it round, straightening as it seats. And WHAT is fitted
       changes how it is done, because the object in the hand is a
       different weight and shape. A drum is heavy and wide: it comes in
       from further out, low, and is rocked in back-first the way a drum
       has to be. An extended magazine is long enough that it has to be
       brought up steeper or its nose catches the well. A fast magazine
       has a loop on it and is snapped in from a shorter reach. */
    if (o.fitted === 'drummag') {
      from = reloadFetch(to, -0.062, -0.185);
      rot0 = [0, -34, -40];
      rot = [0, 0, -6];
    } else if (o.fitted === 'extmag') {
      from = reloadFetch(to, -0.078, -0.120);
      rot0 = [0, -8, -26];
    } else if (o.fitted === 'fastmag') {
      from = reloadFetch(to, -0.040, -0.105);
      rot0 = [0, -14, -12];
    } else {
      rot0 = [0, -12, -16];
    }
  }
  /* Last: make sure the fetch point is on screen. Every branch above has
     had its say about WHERE the load comes from; this only swings that
     reach up if it would start below the frame, and leaves it alone
     otherwise. It runs after them all so a per-kind path cannot
     reintroduce the fault. */
  from = reloadOnscreen(o.camera, o.root, to, from);
  u2 = Math.min(1, Math.max(0, carry));
  const e = u2 * u2 * (3 - 2 * u2);
  if (kind !== 'revolver' && kind !== 'tube') for (const q of prop.parts) q.visible = show;
  const px = to[0] + (from[0] - to[0]) * (1 - e);
  const py = to[1] + (from[1] - to[1]) * (1 - e);
  const pz = to[2] + (from[2] - to[2]) * (1 - e);
  propRoot.setPosition([px, py, pz]);
  propRoot.setRotation([
    rot[0] + (rot0[0] - rot[0]) * (1 - e),
    rot[1] + (rot0[1] - rot[1]) * (1 - e),
    rot[2] + (rot0[2] - rot[2]) * (1 - e),
  ]);
  /* And the hand goes to it. The hand and the load were on two separate
     paths that happened to run near each other, so the magazine
     travelled BESIDE the hand rather than in it. The hand is placed FROM
     the load's position now, offset by where the fingers close, so the
     two cannot drift apart however either path is changed. */
  return { x: px, y: py, z: pz, hold: RELOAD_HOLD[kind] || RELOAD_HOLD.mag };
};

/* Hide whatever a weapon was carrying. Called when a reload ends, or
   when the weapon is put away mid-reload -- otherwise the magazine is
   left hanging in the air where the gun used to be.

   A free function as well as a method, because the code that puts a
   weapon away is not always somewhere an Engine is in scope -- zombies'
   setViewVisible is a module-level function with no `game` in it, and
   calling a prototype method from there found a global of the same name
   that is not an engine at all. */
function stowReloadProp(prop) {
  if (!prop || !prop.parts) return;
  for (const q of prop.parts) q.visible = false;
}
Engine.prototype.stowReloadProp = function (prop) { stowReloadProp(prop); };
