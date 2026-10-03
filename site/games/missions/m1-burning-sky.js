/* ================================================================
   MISSION 1 -- "BURNING SKY"
   ================================================================
   Colombia, 1999. Mission: classified. Objective: investigate.

   The script is m1-script.md next to this file; this is that script
   played on the Colombia map (campaign-maps.js) by the cast
   (campaign-cast.js) on the stage (campaign-stage.js). Each step is a
   generator over the stage, S -- see the top of campaign-stage.js.

     intro      the helicopter in, the team silent, the landing, the title
     rooftop    Lincoln, the handshake, the city, the mortar on the tank
     stairs     down through the command post, floor by floor (play)
     street     four waves, thirty of them (play)
     birddown   a friendly helicopter shot down in the street ahead
     handoff    Payback's Desert Eagle, with an optic
     snipers    six windows (play)
     hydra      the binoculars, the black tanks, and they open fire
     mortarrun  Spite runs for the mortar
     mortar     six tanks (play)
     cheer      the last one burns
     debrief    the office, the photographs, and the question
   ================================================================ */
(function () {
  'use strict';
  var W = window;

  var F = 3.4, ROOF = 13.6;
  var PAD = { x: -2.6, z: -49 };
  var SQUAD = ['payback', 'molotov', 'alec', 'mike'];

  /* The hill's surface (campaign-maps.js buildHill): the slope box's top face runs through y 9.02 at
     z 89 at 18 in 70; the foot strip is half a metre up; the plateau is at 18. */
  function hillY(z) { return z <= 53 ? 0 : z <= 59 ? 0.5 : z >= 125 ? 18.0 : Math.min(18.3, 9.02 + (z - 89) * (18 / 70)); }
  var HILL_PITCH = Math.atan2(18, 70);

  /* ---------------- the world, put in the state a step needs ----------------
     Every step sets the world up for itself, so a checkpoint, a skipped
     cutscene and a test that starts in the middle all find it right. */
  var world = {
    // The roof as the team leaves it: the bird on the pad, Lincoln, the twins in their nest, two guards.
    roof: function (S) {
      var c = S.cast, H = S.heli;
      H.x = PAD.x; H.y = ROOF; H.z = PAD.z; H.yaw = 0; H.pitch = 0; H.roll = 0; H.spin = 0; H.update = null;
      c.lincoln.at([-1.6, ROOF, -45.3], Math.PI).arm(false);
      c.brian.at([-7.4, ROOF, -44.6], 0, 'proneIdle'); c.brian.prone = true; c.brian.arm(true, true);
      c.jesse.at([-4.6, ROOF, -44.6], 0, 'proneIdle'); c.jesse.prone = true; c.jesse.arm(true, true);
      c.guard1.at([-7.6, ROOF, -51.8], 0.6).arm(true);
      c.guard2.at([3.2, ROOF, -45.2], -2.2).arm(true);
      if (!S.flags.tankHit) {
        var T = S.ftank;
        T.x = 2.6; T.y = 0; T.z = -18; T.yaw = -Math.PI / 2; T.turret = 0.3;
      }
    },
    // The soldiers on each floor of the command post.
    floors: function (S) {
      var c = S.cast, fl = S.props.floors;
      var y = function (k) { return fl[k].y + (k === 0 ? 0.12 : 0); };
      c.f3a.at([fl[3].posts[0][0], y(3), fl[3].posts[0][1]], 0.8).arm(true);
      c.f3b.at([fl[3].posts[1][0], y(3), fl[3].posts[1][1]], Math.PI).arm(true);
      c.radio.at([-1.3, y(2), -54.05], Math.PI, 'sitTable').arm(false);
      c.f2a.at([fl[2].posts[1][0], y(2), fl[2].posts[1][1]], Math.PI).arm(true);
      c.medic.at([fl[1].cot.x + 0.2, y(1), fl[1].cot.z + 0.75], Math.PI, 'crouchIdle').arm(false);
      c.medic.crouching = true;
      c.wounded.at([fl[1].cot.x, fl[1].cot.y - 0.02, fl[1].cot.z], -Math.PI / 2, 'deathBack').arm(false);
      c.f1a.at([fl[1].posts[1][0], y(1), fl[1].posts[1][1]], Math.PI * 0.8).arm(true);
      c.f0a.at([-3.1, y(0), -44.6], 0).arm(true);
      c.f0b.at([3.1, y(0), -44.6], 0).arm(true);
    },
    floorsAway: function (S) { ['f3a', 'f3b', 'radio', 'f2a', 'medic', 'wounded', 'f1a', 'f0a', 'f0b'].forEach(function (k) { S.cast[k].hide(); }); },
    roofAway: function (S) { ['lincoln', 'brian', 'jesse', 'guard1', 'guard2'].forEach(function (k) { S.cast[k].hide(); }); },
    // The friendly helicopter, down in the street ahead: wreck, fire, and cover you can hide behind.
    wreck: function (S) {
      var V = S.heli2, cr = S.props.crash;
      V.x = cr.x; V.y = 0.1; V.z = cr.z; V.yaw = 0.35; V.pitch = -0.12; V.roll = 0.42; V.spin = 0; V.update = null;
      if (V.actor.rotor) V.actor.rotor.visible = false;
      if (V.actor.tailRotor) V.actor.tailRotor.visible = false;
      if (!S.flags.wreck) {
        S.flags.wreck = true;
        S.burn([cr.x - 2.5, 1.0, cr.z + 0.8], 1.3);
        S.burn([cr.x + 2.2, 1.6, cr.z - 0.4], 0.8);
        // Bullets stop at it, and nobody walks through it.
        var g = S.game;
        var box = g.box({ at: [cr.x, 1.2, cr.z], size: [9.5, 2.4, 3.0], rotation: [0, -V.yaw * 180 / Math.PI, 0], static: true,
          material: { color: 0x333333 } });
        if (box) box.visible = false;
        S.blockNav(cr.x - 4.4, cr.x + 4.4, cr.z - 1.6, cr.z + 1.6);
      }
    },
    // The Hydra tanks: six, black, HYDRA in white; where they are on the hill and whether they burn.
    tanks: function (S, z) {
      S.hydra.forEach(function (T, i) {
        if (T.dead) return;
        T.x = -40 + i * 16; T.z = z != null ? z + (i % 2) * 4 : T.z;
        /* Facing DOWN the hill, at the city. This was -pi/2, which in this engine points the gun
           up the hill (+z): every tank on the crest faced away from the street and then reversed
           down it, its muzzle flash coming out behind it. */
        T.y = hillY(T.z); T.pitch = T.z < 126 ? -HILL_PITCH : 0;
        T.yaw = Math.PI / 2 - 0.06 * (i - 2.5); T.turret = 0;
      });
    },
  };

  /* ---------------- the cast, the vehicles: built once, at load ---------------- */
  function setup(S) {
    SQUAD.concat(['spite']).forEach(function (k) { S.extra(k); });
    S.extra('lincoln');
    S.extra('brian'); S.extra('jesse');
    S.extra('guard1', 'soldier'); S.extra('guard2', 'soldierB');
    S.extra('f3a', 'soldierC'); S.extra('f3b', 'soldier');
    S.extra('radio', 'soldierB', { name: 'Radio operator' }); S.extra('f2a', 'soldierC');
    S.extra('medic'); S.extra('wounded', 'wounded', { name: 'Wounded soldier' }); S.extra('f1a', 'soldier');
    S.extra('f0a', 'soldierB'); S.extra('f0b', 'soldierC');

    S.heli = S.vehicle('helicopter');
    S.heli2 = S.vehicle('helicopter', { paint: 0x4d5240 });
    S.ftank = S.vehicle('tank');
    S.hydra = [0, 1, 2, 3, 4, 5].map(function () { var T = S.vehicle('tank', { paint: 'hydra', label: 'HYDRA' }); T.y = -100; return T; });
    S.mortar = S.vehicle('mortar');
    // The jump seat Spite rides in, by the door, facing the bench.
    S.binos = null;

    // The lamps on every floor and in the office, and the glow of the biggest fires.
    var P = S.props, g = S.game;
    (P.lamps || []).forEach(function (l) { g.light(l); });
    if (P.office) g.light(P.office.lamp);
    (P.fires || []).slice(0, 6).forEach(function (f) { if (f.glow) f.light = g.light({ at: [f.at[0], f.at[1] + 1.5, f.at[2]], color: 0xff7a2a, intensity: f.glow, radius: 14 }); });

    // Nav blocking for a wreck that arrives mid-mission.
    S.blockNav = function (x0, x1, z0, z1) {
      var nav = S.M.nav; if (!nav) return;
      for (var x = x0; x <= x1; x += nav.c * 0.5) for (var z = z0; z <= z1; z += nav.c * 0.5) {
        var i = Math.floor((x - nav.box.x0) / nav.c), j = Math.floor((z - nav.box.z0) / nav.c);
        if (i >= 0 && j >= 0 && i < nav.w && j < nav.h) nav.g[j * nav.w + i] = 1;
      }
    };
    // Put you somewhere, facing yaw, with the camera looking that way too.
    S.putYou = function (p, yaw, pitch) {
      S.M.spawnAt(S.you, p, yaw);
      if (S.api.look) S.api.look(yaw, pitch || 0);
    };
    world.roof(S);
    world.floors(S);
    S.cast.spite.hide();
    SQUAD.forEach(function (k) { S.cast[k].hide(); });
  }

  /* ================================================================
     1. THE HELICOPTER
     ================================================================ */
  // The flight in: where the helicopter is at time t (seconds), and which way it points.
  var PATH = [
    [0, -170, 52, -250], [14, -96, 42, -160], [24, -44, 32, -100], [31, -14, 20, -60], [35.5, PAD.x, ROOF + 0.6, PAD.z], [38, PAD.x, ROOF, PAD.z],
  ];
  function flightAt(t) {
    for (var i = 0; i < PATH.length - 1; i++) {
      var a = PATH[i], b = PATH[i + 1];
      if (t <= b[0]) {
        var u = (t - a[0]) / (b[0] - a[0]);
        var e = i === PATH.length - 2 ? W.CAMPAIGN_STAGE.smooth(u) : u;
        return [a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e];
      }
    }
    var l = PATH[PATH.length - 1];
    return [l[1], l[2], l[3]];
  }
  function flyHeli(S, t0) {
    var H = S.heli;
    H.spin = 26;
    H.update = function (dt) {
      var t = S.t - t0, p = flightAt(t), q = flightAt(t + 0.5);
      H.x = p[0]; H.y = p[1]; H.z = p[2];
      var dx = q[0] - p[0], dz = q[2] - p[2], sp = Math.hypot(dx, dz) / 0.5;
      // Heading along the path, swinging round to nose-east as it flares onto the pad.
      var head = sp > 0.5 ? -Math.atan2(dz, dx) : H.yaw;
      var flare = Math.max(0, Math.min(1, (t - 29) / 6));
      H.yaw = head * (1 - flare);
      // Nose down at cruise, up in the flare, a little bank in the turn.
      H.pitch = -0.10 * Math.min(1, sp / 30) + 0.16 * Math.sin(Math.PI * flare);
      H.roll = 0.05 * Math.sin(t * 0.6);
      if (t > 38) { H.y = ROOF; H.pitch = 0; H.roll = 0; H.spin = Math.max(6, 26 - (t - 38) * 4); }
    };
  }
  /* Down both sides of the hold, facing each other: Payback, Mike and Molotov (by the open door) on
     one bench; Alec and Spite across from them on the other. [x, side] -- side +1 sits at +Z facing -Z. */
  var SEATS = { payback: [-1.50, 1], mike: [-0.95, 1], molotov: [-0.40, 1], alec: [-1.50, -1], spite: [-0.95, -1] };
  function seatAt(k, up) { var q = SEATS[k]; return [q[0], up, q[1] * 0.80]; }
  function seatTeam(S) {
    var H = S.heli;
    ['payback', 'mike', 'molotov', 'alec', 'spite'].forEach(function (k) {
      S.cast[k].rideOn(H, seatAt(k, 0.88), SEATS[k][1] > 0 ? Math.PI / 2 : -Math.PI / 2, k === 'mike' ? 'sitTable' : 'sit').arm(false);
    });
  }
  /* Out of the helicopter on foot: up off the bench, along the aisle to the door, a hop down onto
     the roof with the knees taking it, and off to `stand`. Nobody appears at the door from nowhere.
     Runs on its own ticker; e._climbing is true until they are on the roof and walking. */
  function climbOut(S, e, stand, face, delay) {
    var H = S.heli, r = e.ride, cab = H.actor && H.actor.cabin || { floorY: 0.88, door: { x: 0.6, z: 1.22 } };
    if (!r) return;
    var fy = cab.floorY, dx = cab.door.x, dz = cab.door.z;
    var path = [[r.l[0], fy, r.l[2] * 0.25], [dx, fy, 0.25], [dx, fy, dz - 0.15]];
    var t0 = S.t + (delay || 0), k = 0, hop = null, ix = S.ctx.stepIx;
    e._climbing = true; e._up = false;
    S.every(function (dt) {
      // A skip, or any other step, ends it where it is.
      if (S.ctx.stepIx !== ix) { e._climbing = false; return true; }
      if (S.t < t0) return false;
      if (!e.ride && !hop) { e._climbing = false; return true; }
      if (k === 0 && !e._up) { e._up = true; e.play('idle', 0.35); t0 = S.t + 0.45; return false; }
      if (k < path.length) {
        if (e.clip !== 'walk') e.play('walk', 0.2);
        var p = path[k], l = r.l, ddx = p[0] - l[0], ddz = p[2] - l[2], d = Math.hypot(ddx, ddz), st = 1.25 * dt;
        l[1] = fy;
        if (d > 1e-3) r.yaw += angTo(r.yaw, Math.atan2(-ddz, ddx)) * Math.min(1, dt * 8);
        if (d <= st) { l[0] = p[0]; l[2] = p[2]; k++; } else { l[0] += ddx / d * st; l[2] += ddz / d * st; }
        return false;
      }
      if (!hop) {
        // The hop: from the sill to the roof just outside the door, over 0.5 s, in an arc.
        var a = S.vLocal(H, [dx, fy, dz]), b = S.vLocal(H, [dx, 0, dz + 0.75]);
        hop = { a: a, b: b, t: 0 };
        var y = r.V.yaw + Math.PI / 2 + r.yaw;
        e.ride = null; e.at(a, y, 'jump');
        return false;
      }
      hop.t += dt / 0.5;
      var u = Math.min(1, hop.t);
      e.pos.x = hop.a[0] + (hop.b[0] - hop.a[0]) * u;
      e.pos.z = hop.a[2] + (hop.b[2] - hop.a[2]) * u;
      e.pos.y = hop.a[1] + (hop.b[1] - hop.a[1]) * u + Math.sin(u * Math.PI) * 0.18;
      if (u >= 1) {
        e.play('crouchIdle', 0.08);
        hop = null; e._climbing = 'landed';
        S.after(0.35, function () { e.walkTo(stand, { face: face }); e._climbing = false; });
        return true;
      }
      return false;
    });
  }
  function angTo(a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  // A seated head in the hold, and a point across the aisle from it (for a portrait).
  function headOf(k) { return seatAt(k, 1.98); }
  function across(k, d) { var q = SEATS[k]; return [q[0], 2.02, q[1] * (0.80 - (d || 1.15))]; }
  /* A close-up on a face from where they actually stand: `ahead` metres in front of them and `side`
     to their right (negative: their left), at eye height -- a three-quarter angle, so whoever they
     are talking to is beside the lens and not a head in the way. Follows them if they move. */
  function faceShot(e, ahead, side, fov) {
    var eye = function () {
      var h = e.head(), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      return [h[0] + fx * ahead - fz * side, h[1] + 0.03, h[2] + fz * ahead + fx * side];
    };
    return { eye: eye, at: function () { return e.head(-0.04); }, fov: fov || 30 };
  }

  var intro = {
    id: 'intro', type: 'scene',
    run: function* (S) {
      S.battle(0);
      var H = S.heli, c = S.cast;
      S.squad('away');
      world.roof(S);
      seatTeam(S);
      flyHeli(S, S.t);
      var rotor = S.rotorSound();
      rotor.level(0.8);
      // A light in the cabin: the faces in the dark of the hold, lit warm from the open door.
      var cab = S.game.light({ at: [0, -50, 0], color: 0xffb070, intensity: 6, radius: 5 });
      S.every(function () { if (S.ctx.stepIx !== 0) { cab.intensity = 0; return true; } var p = S.vLocal(H, [0.4, 2.3, 0.9]); cab.position.set(p[0], p[1], p[2]); return false; });
      S.fade(1, 0); yield S.wait(0.1);
      S.fade(0, 2.5);
      var L = function (l) { return function () { return S.vLocal(H, l); }; };
      // Out over the burning city, the sun going down behind it.
      S.shot({ eye: function () { return [H.x - 16, H.y + 9, H.z - 20]; }, at: function () { return [H.x + 26, H.y - 16, H.z + 34]; }, fov: 50,
        to: { eye: function () { return [H.x + 18, H.y + 3, H.z - 14]; }, at: function () { return [H.x - 6, H.y - 3, H.z + 16]; } }, secs: 5 });
      yield S.wait(4.6);
      // Inside. Nobody speaks. The whole hold first, from the pilots' bulkhead: two rows, facing.
      S.shot({ eye: L([2.15, 2.12, -0.15]), at: L([-1.2, 1.85, 0.0]), fov: 58, to: { eye: L([2.05, 2.05, 0.15]) }, secs: 2.6 });
      yield S.wait(2.4);
      c.payback.feel('focus');
      S.shot({ eye: L(across('payback')), at: L(headOf('payback')), fov: 34 });          // Payback, across the aisle
      yield S.wait(2.8);
      S.shot({ eye: L(across('mike')), at: L(seatAt('mike', 1.92)), fov: 34 });           // Mike at his tablet...
      yield S.wait(1.8);
      c.mike.play('sit', 0.6); c.mike.feel('fear');                                         // ...then nothing; staring
      yield S.wait(1.8);
      // Molotov, over his shoulder: the fires going by through the far door.
      S.shot({ eye: L([-0.30, 2.30, 1.08]), at: L([0.2, 1.6, -3.2]), fov: 46, to: { at: L([0.9, 1.3, -3.6]) }, secs: 3.5 });
      yield S.wait(3.4);
      S.shot({ eye: L(across('alec')), at: L(headOf('alec')), fov: 34 });                // Alec, the watch, the smile
      c.alec.feel('happy');
      yield S.wait(3.0);
      // Spite looks round at each of them, along the bench opposite.
      var sh = seatAt('spite', 2.06);
      S.shot({ eye: L([sh[0], sh[1], sh[2] + 0.12]), at: L(headOf('payback')), fov: 52, to: { at: L(headOf('molotov')) }, secs: 4.2 });
      yield S.wait(4.4);
      // Outside again: the command post, the roof, the pad.
      S.shot({ eye: [12, ROOF + 4, -36], at: function () { return [H.x, H.y + 1, H.z]; }, fov: 40 });
      yield S.wait(5.5);
      S.shot({ eye: [-12.5, ROOF + 1.4, -41.5], at: function () { return [H.x, H.y + 1.6, H.z]; }, fov: 44 });
      S.title(['COLOMBIA, 1999', 'MISSION: CLASSIFIED', 'OBJECTIVE: INVESTIGATE'], 4.5);
      yield S.until(function () { return H.y <= ROOF + 0.01 && H.spin <= 22; });
      yield S.wait(1.2);
      rotor.level(0.35);
      S.rotorHandle = rotor;
    },
    skip: function (S) {
      var H = S.heli;
      H.update = null; H.x = PAD.x; H.y = ROOF; H.z = PAD.z; H.yaw = 0; H.pitch = 0; H.roll = 0; H.spin = 8;
      S.fade(0, 0.01);
      if (S.rotorHandle) S.rotorHandle.level(0.3);
    },
  };

  /* ================================================================
     2. THE ROOFTOP
     ================================================================ */
  var DOOR = [-2.0, ROOF, -47.4];
  var STAND = { alec: [-1.6, ROOF, -46.35], payback: [-3.4, ROOF, -46.9], mike: [0.1, ROOF, -47.0], molotov: [-4.6, ROOF, -47.5], spite: [-2.5, ROOF, -47.2] };
  var rooftop = {
    id: 'rooftop', type: 'scene',
    run: function* (S) {
      S.battle(0.25);
      var c = S.cast, H = S.heli;
      S.squad('away');
      world.roof(S);
      H.update = null; H.x = PAD.x; H.y = ROOF; H.z = PAD.z; H.yaw = 0; H.spin = 8;
      // Off the bird one at a time: up off the bench, to the door, down onto the roof, over to Lincoln.
      seatTeam(S);
      // Up and back, clear of the guard by the pad (this sat 0.6 m behind his helmet).
      S.shot({ eye: [5.2, ROOF + 2.6, -42.6], at: [-1.6, ROOF + 1.1, -47.2], fov: 40 });
      var order = ['alec', 'payback', 'mike', 'molotov', 'spite'];
      order.forEach(function (k, i) {
        climbOut(S, c[k], STAND[k], k === 'alec' ? 0 : -0.2 + i * 0.1, i * 1.05);
        S.after(i * 1.05 + 2.4, function () { c[k].arm(k !== 'alec', false); });
      });
      c.lincoln.walkTo([-1.6, ROOF, -45.45], { face: Math.PI });
      yield S.until(function () { return !c.alec._climbing; });
      yield S.arrive(c.alec, c.lincoln);
      // The handshake.
      S.shot({ eye: [1.2, ROOF + 1.6, -45.9], at: [-1.6, ROOF + 1.45, -45.9], fov: 34 });
      c.lincoln.play('handshake', 0.2); c.alec.play('handshake', 0.2);
      c.lincoln.feel('focus'); c.alec.feel('happy');
      S.line('lincoln', 'Sharp. Took your sweet time.');
      yield S.quiet();
      // Alec, from beside Lincoln: a three-quarter on his face, Lincoln just out of frame.
      S.shot(faceShot(c.alec, 0.85, 0.95, 30));
      S.line('alec', 'I\'m eighty-two, Sergeant. Everything takes its sweet time.', { emotion: 'happy' });
      yield S.quiet();
      S.line('alec', 'Lovely evening for it.', { emotion: 'happy' });
      yield S.quiet();
      S.shot(faceShot(c.lincoln, 0.85, 0.95, 30));
      S.line('lincoln', 'Lovely is one word for it.');
      yield S.quiet();
      c.lincoln.turnTo(0.15);
      yield S.wait(0.5);
      c.lincoln.play('point', 0.3);
      S.line('lincoln', 'We gotta get the job done. Investigate what\'s going on down there.', { emotion: 'focus' });
      yield S.wait(1.2);
      // Over the parapet: the city, on fire to the horizon.
      S.shot({ eye: [-0.6, ROOF + 2.4, -43.4], at: [1.0, 5, -10], fov: 52, to: { eye: [0.6, ROOF + 3.0, -42.6], at: [0, 4, 20] }, secs: 7 });
      yield S.quiet();
      c.lincoln.play('idle', 0.4);
      S.line('mike', 'What... what IS going on down there?', { emotion: 'fear' });
      yield S.quiet();
      S.line('lincoln', 'That\'s what you\'re here to find out.');
      yield S.quiet();
      // The mortar: a whistle, and one of our tanks goes up in the street below.
      S.shot({ eye: [3.5, ROOF + 1.8, -43.2], at: [S.ftank.x, 1.5, S.ftank.z], fov: 36 });
      S.whistle(1.4);
      yield S.wait(1.4);
      S.boom([S.ftank.x, 1.6, S.ftank.z], 2.2, { shake: 2 });
      S.flags.tankHit = true;
      S.ftank.turret = 0.9;
      S.burn([S.ftank.x, 2.0, S.ftank.z], 1.4);
      yield S.wait(0.35);
      // Everybody down.
      ['alec', 'payback', 'mike', 'molotov', 'spite', 'lincoln', 'guard1', 'guard2'].forEach(function (k) { c[k].play('duck', 0.12); c[k].arm(false); });
      S.shot({ eye: [1.6, ROOF + 0.9, -44.4], at: [-2.6, ROOF + 0.7, -46.6], fov: 50 });
      S.shake(0.5);
      S.line('payback', 'Holy shit! That was a TANK!', { emotion: 'surprise' });
      yield S.quiet();
      S.shot({ eye: [-6.0, ROOF + 0.55, -42.1], at: [-6.0, ROOF + 0.4, -44.6], fov: 46 });
      S.line('brian', 'Mortar team. Two klicks east. Can\'t reach \'em from here.', { emotion: 'focus' });
      yield S.quiet();
      S.line('jesse', 'Speak for yourself.');
      yield S.quiet();
      S.line('brian', 'I AM speaking for myself, Jesse.', { emotion: 'anger' });
      yield S.quiet();
      ['alec', 'payback', 'mike', 'molotov', 'spite', 'lincoln', 'guard1', 'guard2'].forEach(function (k) { c[k].play('idle', 0.5); });
      c.guard1.arm(true); c.guard2.arm(true);
      S.shot({ eye: [-0.4, ROOF + 1.7, -44.4], at: [-2.6, ROOF + 1.4, -47.2], fov: 44 });
      c.lincoln.turnTo(Math.PI);
      S.line('lincoln', 'Stairwell\'s behind you. Move.');
      yield S.quiet();
      S.shot(faceShot(c.molotov, 1.5, 0.45, 30));
      S.line('molotov', 'Move.');
      yield S.quiet();
    },
    skip: function (S) {
      S.flags.tankHit = true; S.ftank.turret = 0.9;
      if (!S.flags.tankBurn) { S.flags.tankBurn = true; S.burn([S.ftank.x, 2.0, S.ftank.z], 1.4); }
      ['alec', 'payback', 'mike', 'molotov', 'spite'].forEach(function (k) { S.cast[k].at(STAND[k], 0); });
    },
  };

  /* ================================================================
     3. DOWN THROUGH THE BUILDING (play)
     ================================================================ */
  var FLOOR_TALK = {
    3: [['f3b', 'Ammo\'s on the table. Take what you need.']],
    2: [['radio', '...say again, how many? ...Copy.', { radio: true }], ['radio', 'They just keep coming.']],
    1: [['wounded', 'They didn\'t look like soldiers. Jeans. Sandals.', { emotion: 'pain' }],
      ['wounded', 'And they fought like they had nothing left to lose.', { emotion: 'pain' }],
      ['mike', 'That\'s... that\'s not great.', { emotion: 'fear' }]],
    0: [['alec', 'Right then. Nice and quiet... is what I\'d say if I were a liar.', { emotion: 'happy' }]],
  };
  var INTEL_TALK = {
    3: ['alec', 'The street runs north to the plaza. They\'re dug in all the way along it.'],
    2: ['payback', 'Hostile positions marked in red. That\'s a lot of goddamn red.'],
    1: ['mike', 'Casualty list. Th-these are just from today.'],
    0: ['molotov', 'Supply route. Cut.'],
  };
  var stairs = {
    id: 'stairs', type: 'play', checkpoint: true, objective: 'Go down through the command post',
    run: function* (S, st) {
      S.battle(0.25);
      var c = S.cast, P = S.props, you = S.you;
      if (S.rotorHandle) S.rotorHandle.level(0.25);
      world.roof(S); world.floors(S);
      S.flags.tankHit = true; S.ftank.turret = 0.9;
      if (!S.flags.tankBurn) { S.flags.tankBurn = true; S.burn([S.ftank.x, 2.0, S.ftank.z], 1.4); }
      // You are Spite now; the squad behind you.
      SQUAD.forEach(function (k, i) { if (!c[k].visible) c[k].at(STAND[k], 0); });
      S.putYou([STAND.spite[0], ROOF, STAND.spite[2]], Math.PI * 0.8);
      S.squadFromExtras(SQUAD, 'trail');
      c.spite.hide();
      S.ctx.objective('Go down through the command post', [P.roof.stairDoor.x, P.roof.stairDoor.z]);
      st.talked = st.talked || {}; st.intel = st.intel || {}; st.ammo = {};
      var floorOf = function () {
        if (you.pos.x > 4.6 && you.pos.x < 9 && you.pos.z < -47.4) return -1;      // in the stairwell
        for (var k = 3; k >= 0; k--) if (Math.abs(you.pos.y - P.floors[k].y - (k === 0 ? 0.12 : 0)) < 0.5 && you.pos.z < -41.6) return k;
        return -2;
      };
      while (true) {
        var k = floorOf();
        // The next marker: the next floor's doorway, then the front door.
        if (k >= 0) {
          var fl = P.floors[k];
          if (!st.talked[k]) {
            st.talked[k] = true;
            FLOOR_TALK[k].forEach(function (l) { S.line(l[0], l[1], l[2]); });
          }
          if (k === 0) S.ctx.objective('Out through the front door', [P.hqDoor.x, P.hqDoor.z]);
          else S.ctx.objective('Go down through the command post', [fl.door.x + 1.4, fl.door.z]);
          // The map on the table: optional intel.
          var nearMap = !st.intel[k] && Math.hypot(you.pos.x - fl.map.x, you.pos.z - fl.map.z) < 1.7;
          var nearAmmo = Math.hypot(you.pos.x - fl.crate.x, you.pos.z - fl.crate.z) < 1.5;
          S.ctx.prompt(nearMap ? 'Hold F to take the map' : nearAmmo ? 'Hold F to resupply' : null);
          if ((nearMap || nearAmmo) && S.api.interactHeld && S.api.interactHeld()) {
            st.hold = (st.hold || 0) + S.dt;
            S.ctx.progress(st.hold / 0.8);
            if (st.hold >= 0.8) {
              st.hold = 0; S.ctx.progress(null);
              if (nearMap) {
                st.intel[k] = true; S.ctx.stats.intel++;
                S.toast('Intel ' + S.ctx.stats.intel + ' / 4');
                S.line(INTEL_TALK[k][0], INTEL_TALK[k][1]);
              } else {
                you.reserve = [you.guns[0].mag * 10, you.guns[1].mag * 10];
                S.toast('Resupplied');
              }
            }
          } else { st.hold = 0; S.ctx.progress(null); }
          if (k === 0 && you.pos.z > -42.2) break;
        } else S.ctx.prompt(null);
        yield null;
      }
      S.ctx.prompt(null);
    },
  };

  /* ================================================================
     4. THE STREET (play): four waves, thirty of them
     ================================================================ */
  var WAVES = [
    { say: [['payback', 'Contact front! Come and get some, you bastards!', { emotion: 'anger' }]],
      spawn: [{ at: [-4, 40], count: 2, spread: 2, skill: 0 }, { at: [4, 38], count: 2, spread: 2, skill: 0 }, { at: [0, 46], count: 2, spread: 3, skill: 0 }] },
    { say: [['mike', 'I\'m not killing anybody I don\'t have to!', { emotion: 'fear' }], ['payback', 'Then shoot FASTER, Mike!', { emotion: 'anger' }]],
      spawn: [{ at: [-5, 34], count: 3, spread: 3, skill: 1 }, { at: [5, 42], count: 2, spread: 2, skill: 1 }, { at: [0, 48], count: 2, spread: 3, skill: 0 }] },
    { say: [['alec', 'Steady now. Pick your shots, lad.', { emotion: 'focus' }]],
      spawn: [{ at: [-4, 30], count: 3, spread: 2, skill: 1 }, { at: [4, 36], count: 3, spread: 2, skill: 1 }, { at: [0, 46], count: 2, spread: 3, skill: 1 }] },
    { say: [['spite', 'Last of them! Push up!']],
      spawn: [{ at: [-5, 26], count: 3, spread: 2, skill: 1 }, { at: [5, 30], count: 3, spread: 2, skill: 2 }, { at: [0, 44], count: 3, spread: 4, skill: 1 }] },
  ];
  var street = {
    id: 'street', type: 'play', checkpoint: true, objective: 'Push up the street',
    run: function* (S, st) {
      S.battle(1);
      var you = S.you;
      world.floorsAway(S);
      SQUAD.forEach(function (k) { S.cast[k].hide(); });
      S.cast.spite.hide();
      if (S.rotorHandle) { S.rotorHandle.stop(); S.rotorHandle = null; }
      if (you.pos.z < -42.2 || you.pos.y > 1) S.putYou([0, 0, -40.6], 0);
      S.ctx.hostiles.forEach(function (p) { if (p.alive) S.M.park(p); p.puppet = false; });
      S.squad('fight');
      S.ctx.allies.forEach(function (p, k) { if (!p.alive || p.pos.z < -42 || p.pos.y > 1) S.M.spawnAt(p, [(k < 2 ? -3.2 : 3.2) + (k % 2) * (k < 2 ? -1.2 : 1.2), -41.2], 0); });
      var killed0 = S.ctx.stats.killed, total = 30;
      for (var w = 0; w < WAVES.length; w++) {
        var wv = WAVES[w];
        wv.spawn.forEach(function (g) { S.ctx.spawn(g); });
        wv.say.forEach(function (l) { S.line(l[0], l[1], l[2]); });
        S.ctx.objective('Push up the street -- wave ' + (w + 1) + ' of 4', [0, 20]);
        var tw = S.t;
        while (true) {
          S.ctx.progress((S.ctx.stats.killed - killed0) / total);
          var alive = S.ctx.hostilesAlive();
          if (w < WAVES.length - 1 && ((alive <= 1 && S.t - tw > 6) || S.t - tw > 55)) break;
          if (w === WAVES.length - 1 && (alive === 0 || (alive <= 2 && S.t - tw > 40))) break;
          yield null;
        }
      }
      S.flags.streetCleared = S.ctx.hostilesAlive() === 0;
      S.ctx.progress(null);
    },
  };

  /* ================================================================
     5. BIRD DOWN
     ================================================================ */
  var birddown = {
    id: 'birddown', type: 'scene',
    run: function* (S) {
      S.battle(0.6);
      var V = S.heli2, cr = S.props.crash, c = S.cast;
      S.ctx.hostiles.forEach(function (p) { if (p.alive) S.M.park(p); });     // the last of them fall back
      S.squad('away');
      S.putYou([-1.0, 0, -8], 0);
      SQUAD.forEach(function (k, i) { c[k].at([-4 + i * 2.2, 0.0, -9.5 - (i % 2)], 0); c[k].arm(true); });
      c.spite.at([-1.0, 0, -8], 0).arm(true);
      if (V.actor.rotor) V.actor.rotor.visible = true;
      if (V.actor.tailRotor) V.actor.tailRotor.visible = true;
      // Across the street from the east, low, then hit.
      var t0 = S.t, hitAt = 2.6, downAt = 7.0;
      V.spin = 28;
      var rotor = S.rotorSound(); rotor.level(0.9);
      V.update = function (dt) {
        var t = S.t - t0;
        if (t < hitAt) {
          V.x = 120 - t * 30; V.y = 34; V.z = cr.z + 16; V.yaw = Math.PI; V.pitch = -0.1; V.roll = 0;
        } else if (t < downAt) {
          var u = (t - hitAt) / (downAt - hitAt);
          var sx = 120 - hitAt * 30;
          V.x = sx + (cr.x - sx) * u; V.z = cr.z + 16 - 16 * u;
          V.y = 34 * (1 - u * u);
          V.yaw = Math.PI + u * u * 9;
          V.roll = 0.5 * u; V.pitch = -0.1 - 0.15 * u;
          if (Math.random() < dt * 30 && S.game.particles) S.game.particles.smoke([V.x, V.y + 2.5, V.z], { count: 1, size: 3, life: 4, alpha: 0.7, color: 0x151413, colorEnd: 0x4a4642 });
        } else return;
      };
      // Over Spite's shoulder, looking up at it.
      S.shot({ eye: [-1.9, 1.95, -10.6], at: function () { return [V.x, V.y + 1.5, V.z]; }, fov: 52 });
      yield S.wait(hitAt);
      S.boom([V.x, V.y + 2, V.z], 1.2, { shake: 0.4 });
      S.line('spite', 'Bird down! Bird down!', { emotion: 'fear' });
      yield S.wait(2.0);
      // Wide and low from up the street for the last of the fall, so you see it hit.
      S.shot({ eye: [-1.8, 1.2, cr.z - 21], at: function () { return [(V.x + cr.x) / 2, Math.max(2.5, V.y * 0.55), (V.z + cr.z) / 2]; }, fov: 46 });
      yield S.wait(downAt - hitAt - 2.0);
      V.update = null;
      world.wreck(S);
      S.boom([cr.x, 1.2, cr.z], 2.6, { shake: 2.2 });
      rotor.stop();
      c.spite.play('duck', 0.1); SQUAD.forEach(function (k) { c[k].play('duck', 0.1); });
      yield S.wait(1.4);
      S.shot({ eye: [-6.5, 2.2, -10.5], at: [cr.x, 1.2, cr.z], fov: 44 });
      SQUAD.forEach(function (k) { c[k].play('idle', 0.3); });
      c.spite.play('idle', 0.3);
      S.line('alec', 'Into the wreck! Use it!', { emotion: 'focus' });
      // Everybody runs for the near side of it.
      var cover = COVER(S).squad;
      SQUAD.forEach(function (k, i) { c[k].walkTo(cover[i], { speed: 4.6, clip: 'run', then: 'crouchIdle', face: 0 }); });
      c.spite.walkTo(COVER(S).you, { speed: 4.6, clip: 'run', then: 'crouchIdle', face: 0 });
      yield S.wait(3.2);
    },
    skip: function (S) {
      S.ctx.hostiles.forEach(function (p) { if (p.alive) S.M.park(p); });
      S.heli2.update = null;
      world.wreck(S);
    },
  };

  /* ================================================================
     6. THE HANDOFF: Payback's Desert Eagle, with an optic
     ================================================================ */
  // Behind the wreck, on the near side: clear of the fuselage, which lies tilted towards you.
  var COVER = function (S) { var cr = S.props.crash; return { you: [0.4, 0, cr.z - 4.3], squad: [[-2.8, 0, cr.z - 4.2], [1.8, 0, cr.z - 4.5], [3.8, 0, cr.z - 4.0], [-0.9, 0, cr.z - 4.8]] }; };
  var handoff = {
    id: 'handoff', type: 'scene',
    run: function* (S) {
      S.battle(0.45);
      var c = S.cast, cv = COVER(S);
      world.wreck(S);
      S.squad('away');
      SQUAD.forEach(function (k, i) { c[k].at(cv.squad[i], 0, 'crouchIdle').arm(true); c[k].crouching = true; });
      c.spite.at(cv.you, 0, 'crouchIdle').arm(true);
      // Rounds off the fuselage.
      var pings = 0;
      S.every(function () { if (pings > 14) return true; if (Math.random() < S.dt * 3) { pings++; if (S.game.particles) S.game.particles.sparks([S.props.crash.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 1.5, S.props.crash.z - 1.4], { count: 6, speed: 4 }); if (S.game.audio && S.game.audio.ping) S.game.audio.ping({ volume: 0.05 }); } return false; });
      // Low, between the wreck and the squad, looking back at their faces.
      S.shot({ eye: [-4.4, 1.05, cv.you[2] + 1.9], at: [-2.4, 0.95, cv.you[2] + 0.1], fov: 42 });
      S.line('payback', 'Snipers in the windows. Six of the sons of bitches.', { emotion: 'anger' });
      yield S.quiet();
      // She stands, faces him, and holds it out to him grip first.
      c.payback.at([cv.you[0] - 0.9, 0, cv.you[2] - 0.3], Math.atan2(0.9, 0.3), 'idle').arm(false);
      c.payback.crouching = false;
      c.payback.gunInHand('deagle', 'offer');
      // Spite stands to take it. Side on to the two of them, the pistol held out between.
      c.spite.at(cv.you, Math.atan2(-0.9, -0.3), 'idle').arm(false); c.spite.crouching = false;
      S.shot({ eye: [cv.you[0] + 0.32, 1.4, cv.you[2] - 2.43], at: [cv.you[0] - 0.45, 1.22, cv.you[2] - 0.15], fov: 38 });
      yield S.wait(0.5);
      c.payback.play('handshake', 0.3);
      S.line('payback', 'Here. Optic\'s zeroed. You scratch her, I scratch you.', { emotion: 'focus' });
      yield S.wait(1.1);
      // He reaches for it, closes his hand on the grip, and it is his.
      c.spite.play('handshake', 0.35);
      yield S.wait(0.75);
      c.payback.give('deagle', c.spite, 'grip');
      c.payback.play('idle', 0.4);
      yield S.wait(0.35);
      c.spite.play('idle', 0.55);
      yield S.quiet();
      S.line('jesse', 'No angle on those windows from up here. They\'re yours, Spite.', { radio: true });
      yield S.quiet();
    },
    skip: function (S) { world.wreck(S); S.cast.payback.gunInHand('deagle', false); S.cast.spite.gunInHand('deagle', false); },
  };

  /* ================================================================
     7. THE SNIPERS (play)
     ================================================================ */
  var CALLS = [
    ['payback', 'That\'s one! Keep going!'], ['alec', 'Two down. Lovely shooting.'], ['mike', 'Th-three! Is that three?'],
    ['payback', 'Four! Second floor, left, he\'s moving!'], ['molotov', 'Five.'], ['payback', 'That\'s my girl. Hand her back.'],
  ];
  function giveDeagle(you, on) {
    if (on) {
      if (!you._keepGun) you._keepGun = you.guns[0];
      var D = W.MP_DATA, g;
      try { g = D.build('mauser', ['o-reflex']); } catch (e) { g = Object.assign({}, you.guns[1]); }
      g = Object.assign({}, g, { id: 'deagle', name: 'Desert Eagle', dmg: (g.dmg || 40) * 1.6, mag: 7 });
      you.guns[0] = g; you.ammo[0] = 7; you.reserve[0] = 70; you.held = 0;
    } else if (you._keepGun) {
      you.guns[0] = you._keepGun; you._keepGun = null; you.ammo[0] = you.guns[0].mag; you.held = 0;
    }
  }
  var snipers = {
    id: 'snipers', type: 'play', checkpoint: true, objective: 'Kill the six snipers',
    run: function* (S, st) {
      S.battle(0.8);
      var c = S.cast, cv = COVER(S), M = S.M, you = S.you;
      world.wreck(S);
      SQUAD.forEach(function (k) { c[k].hide(); });
      c.spite.hide();
      S.ctx.hostiles.forEach(function (p) { if (p.alive) M.park(p); p.puppet = false; });
      // Facing the first window, not the fuselage.
      var w0 = S.props.snipers[0];
      S.putYou(cv.you, Math.atan2(w0.x - cv.you[0], w0.z - cv.you[2]), -0.12);
      S.squad('hold', cv.squad.map(function (p) { return [p[0], p[1], p[2], 0]; }));
      S.ctx.allies.forEach(function (p) { p.crouching = true; });
      giveDeagle(you, true);
      // The six, at their windows.
      var list = S.props.snipers.slice(0, 6), men = [];
      var free = S.ctx.hostiles.filter(function (q) { return !q.alive; });
      list.forEach(function (w, i) {
        var p = free[i];
        if (!p) return;
        M.spawnAt(p, [w.x, w.y, w.z], w.face > 0 ? Math.PI / 2 : -Math.PI / 2);
        p.puppet = true; p.pos = { x: w.x, y: w.y, z: w.z };
        p.skill = W.MP_DATA.BOT_SKILL[0];
        p._fireAt = S.t + 3 + i * 1.3;
        S.ctx.stats.spawned++;
        men.push(p);
      });
      var down = 0;
      while (down < men.length) {
        var n = men.filter(function (p) { return !p.alive; }).length;
        if (n > down) { for (var j = down; j < n; j++) S.line(CALLS[j][0], CALLS[j][1]); down = n; }
        S.ctx.objective('Kill the snipers (' + down + ' / ' + men.length + ')', null);
        men.forEach(function (p) {
          if (!p.alive) return;
          // Turn to you, and fire every few seconds when there is a line.
          var dx = you.pos.x - p.pos.x, dz = you.pos.z - p.pos.z, dy = (you.pos.y + 1.3) - (p.pos.y + 1.55);
          p.yaw = Math.atan2(dx, dz); p.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
          p.aiming = true;
          if (S.t > p._fireAt) { p._fireAt = S.t + 2.8 + Math.random() * 2.2; if (you.alive) M.fire(p); }
          // The glint off his scope in the second before he fires: your warning, and where to look.
          if (p._fireAt - S.t < 1.0 && S.game.particles) {
            var dl = Math.hypot(dx, dy, dz) || 1, gp = [p.pos.x + dx / dl * 0.5, p.pos.y + 1.6 + dy / dl * 0.5, p.pos.z + dz / dl * 0.5];
            var fl = 0.6 + 0.4 * Math.sin(S.t * 40);
            S.game.particles.spawn({ position: { x: gp[0], y: gp[1], z: gp[2] }, velocity: { x: 0, y: 0, z: 0 }, life: 0.05,
              size: 0.55 * fl, sizeEnd: 0.2, color: { x: 1, y: 0.97, z: 0.85 }, colorEnd: { x: 1, y: 0.8, z: 0.5 }, alpha: 1, drag: 0, gravity: 0, type: 2 });
          }
        });
        yield null;
      }
      yield S.wait(2.5);
      giveDeagle(you, false);
    },
  };

  /* ================================================================
     8. HYDRA: the binoculars, and they open fire
     ================================================================ */
  var CREST_Z = 140;
  // Diesel off the engine deck, and the dust the tracks throw up while they move.
  function tankFx(S, T, dt, moving) {
    T._fx = (T._fx || 0) + dt;
    if (T._fx > 0.15 && S.game.particles) {
      T._fx = 0;
      var Pp = S.game.particles, sd = Math.random() < 0.5 ? -1 : 1;
      Pp.smoke(S.vLocal(T, [-3.7, 1.65, sd * 0.9]), { count: 1, size: 0.7, life: 0.8, color: 0x2a2826, colorEnd: 0x0c0c0e, alpha: 0.5 });
      if (moving) Pp.smoke(S.vLocal(T, [-3.9, 0.2, sd * 1.5]), { count: 1, size: 1.8, life: 1.2, color: 0x8a7458, colorEnd: 0x5a4c3c, alpha: 0.38 });
    }
    if (T.gun > 0) T.gun = Math.max(0, T.gun - dt * 0.2);
  }
  // Where the muzzle is, with the turret turned: the gun is on the turret's +X, 7.6 m out, 1.98 up.
  function tankMuzzle(S, T) {
    var a = T.yaw + (T.turret || 0), c = Math.cos(a), sn = Math.sin(a);
    return [T.x + c * 7.6, T.y + 1.98 + Math.sin(T.pitch || 0) * 3, T.z - sn * 7.6];
  }
  function tankFlash(S, T) {
    var m = tankMuzzle(S, T);
    if (S.game.particles) { S.game.particles.fire(m, { count: 8, size: 1.4, life: 0.25 }); S.game.particles.smoke(m, { count: 4, size: 3, life: 3 }); }
    if (S.game.audio && S.game.audio.report) S.game.audio.report(1, { volume: 0.5, tail: 1.6, tailHz: 260, crack: 0.3 });
    T.gun = 0.06;
  }
  function tanksRoll(S, speed, stopZ) {
    S.hydra.forEach(function (T, i) {
      T.update = function (dt) {
        if (T.dead) return;
        var moving = T.z > stopZ + (i % 2) * 4;
        if (moving) T.z -= speed * dt;
        T.y = hillY(T.z); T.pitch = T.z < 126 ? -HILL_PITCH : 0;
        tankFx(S, T, dt, moving);
        if (T.firing && S.t > (T._shotAt || 0)) {
          T._shotAt = S.t + 6 + Math.random() * 5;
          // Muzzle flash, then the shell lands somewhere in the street.
          tankFlash(S, T);
          var you = S.you, tx = -6 + Math.random() * 12, tz = Math.max(-20, you.pos.z + (Math.random() - 0.3) * 24);
          S.after(0.9, function () { S.boom([tx, 0.4, tz], 1.4); });
        }
      };
    });
  }
  /* THE ADVANCE. Off the hill, into the street two abreast, through the plaza wall, and down on
     you. From the hill their rounds go wide; inside thirty metres they are laid on you, and a
     shell that lands on you hurts -- so the mortar has to stop them before they get there. Each
     lane keeps its order: a tank waits behind the one ahead of it. */
  function tanksAdvance(S) {
    var you = S.you, t0 = S.t;
    S.hydra.forEach(function (T, i) {
      var lane = i % 2 ? 3.4 : -3.4, rank = Math.floor(i / 2);
      var path = [[lane * 2.2, 72], [lane, 58], [lane, 30 + rank * 10]];
      var k = 0, go = t0 + 1.5 + i * 2.2;
      T._lane = lane; T._rank = rank; T._fireAt = S.t + 6 + i * 1.6; T._hd = T._hd || [0, -1];
      T.update = function (dt) {
        if (T.dead) return;
        var moving = false;
        if (S.t > go && k < path.length) {
          var p = path[k], dx = p[0] - T.x, dz = p[1] - T.z, d = Math.hypot(dx, dz);
          var blocked = T.z < 66 && S.hydra.some(function (O) { return O !== T && !O.dead && O._lane === lane && O._rank < rank && O.z < T.z && T.z - O.z < 10; });
          if (!blocked && d > 1e-3) {
            var st = (T.z > 60 ? 2.4 : 1.5) * dt;
            if (d <= st) { T.x = p[0]; T.z = p[1]; k++; } else { T.x += dx / d * st; T.z += dz / d * st; }
            var hx = dx / d, hz = dz / d;
            T._hd[0] += (hx - T._hd[0]) * Math.min(1, dt * 2); T._hd[1] += (hz - T._hd[1]) * Math.min(1, dt * 2);
            moving = true;
          } else if (d <= 1e-3) k++;
        }
        var hd = T._hd, hl = Math.hypot(hd[0], hd[1]) || 1;
        T.yaw = Math.atan2(-hd[1] / hl, hd[0] / hl);
        T.y = hillY(T.z);
        T.pitch = Math.atan2(hillY(T.z + hd[1] / hl * 3) - hillY(T.z - hd[1] / hl * 3), 6);
        if (!S.flags.plazaDown && T.z < 54.5) breakPlazaWall(S, T);
        // The turret comes round onto you.
        var ax = you.pos.x - T.x, az = you.pos.z - T.z, dist = Math.hypot(ax, az);
        T.turret = (T.turret || 0) + angTo(T.turret || 0, Math.atan2(-az, ax) - T.yaw) * Math.min(1, dt * 1.2);
        tankFx(S, T, dt, moving);
        if (S.t > T._fireAt) {
          var close = dist < 30;
          T._fireAt = S.t + (close ? 3.4 : 5.5) + Math.random() * 2.5;
          tankFlash(S, T);
          var spread = close ? 1.3 : Math.min(22, dist * 0.22);
          var tx = you.pos.x + (Math.random() - 0.5) * 2 * spread, tz = you.pos.z + (Math.random() - 0.5) * 2 * spread;
          S.after(0.45 + dist / 450, function () {
            S.boom([tx, 0.4, tz], 1.4);
            var dd = Math.hypot(you.pos.x - tx, you.pos.z - tz);
            if (dd < 6 && you.alive && S.M.damage) S.M.damage(null, you, Math.round(110 * (1 - dd / 6)));
          });
          if (close && !S.flags.tankClose) { S.flags.tankClose = true; S.line('payback', 'He\'s got us bracketed! KILL HIM!', { emotion: 'fear' }); }
        }
      };
    });
  }
  // The first tank to reach the plaza wall goes through it.
  function breakPlazaWall(S, T) {
    S.flags.plazaDown = true;
    var g = S.game;
    (g.actors || []).filter(function (a) { return a.name === 'plaza-wall'; }).forEach(function (a) {
      var M = S.M, sol = M && M.map && M.map.solids;
      if (sol) { var k = sol.indexOf(a); if (k >= 0) sol.splice(k, 1); }
      a.destroy();
    });
    for (var x = -8; x <= 8; x += 4) S.boom([x, 0.6, 52.3], 0.9, { shake: 0.4 });
    if (g.particles) for (var j = 0; j < 40; j++) g.particles.sparks([T.x + (Math.random() - 0.5) * 6, 0.6, 52.3], { count: 2, speed: 5 });
    S.line('alec', 'They\'re through the wall! Drop them before they\'re on top of us!', { emotion: 'fear' });
  }
  var hydra = {
    id: 'hydra', type: 'play', checkpoint: true, objective: 'Look at the hill',
    run: function* (S, st) {
      S.battle(0.6);
      var c = S.cast, cv = COVER(S), you = S.you;
      world.wreck(S);
      // Across the street from the wreck, where the line to the hill clears its nose -- not behind it.
      if (!S.squadMode || S.squadMode === 'away') { S.putYou([6.2, 0, cv.you[2] - 1.0], 0); S.squad('hold', cv.squad.map(function (p) { return [p[0], p[1], p[2], 0]; })); }
      giveDeagle(you, false);
      S.hydra.forEach(function (T) { T.dead = false; T.firing = false; });
      world.tanks(S, CREST_Z + 6);
      S.line('alec', 'Movement on the hill. Spite, have a look.', { emotion: 'focus' });
      S.ctx.objective('Look at the hill -- hold F for binoculars', [0, 60]);
      S.ctx.prompt('Hold F for binoculars');
      while (!(S.api.interactHeld && S.api.interactHeld())) yield null;
      S.ctx.prompt(null);
      S.ctx.objective(null);
      // Through the glasses: the crest, and black shapes coming over it.
      S.api.lockControls(true);
      S.binoculars(true);
      // Glass cuts through haze: the fog thins while you are looking through them.
      var fog = S.game.renderer.fog, fog0 = fog.density;
      fog.density = fog0 * 0.3;
      /* From where you stand, across the street from the wreck: the line to the crest clears its nose.
         (This was 'the end of the wreck' -- the tail end, so the glass was full of tail boom.) */
      var eye = [6.2, 1.65, COVER(S).you[2] - 1.0];
      S.shot({ eye: eye, at: [0, 18, 128], fov: 9, to: { at: [-6, 17.5, 126] }, secs: 9 });
      tanksRoll(S, 1.6, 118);
      var seen = S.t;
      yield S.wait(2.2);
      S.line('spite', 'Tanks. Black ones. They\'ve got... "Hydra" painted on them.');
      yield S.quiet();
      S.line('mike', 'Hydra? That\'s not a unit. That\'s not ANYBODY\'S unit.', { emotion: 'fear' });
      // Ten seconds after they come over the crest, they fire.
      yield S.until(function () { return S.t - seen >= 10; });
      S.hydra.forEach(function (T, i) { T.firing = true; T._shotAt = S.t + i * 0.35; });
      yield S.wait(0.5);
      S.binoculars(false);
      fog.density = fog0;
      S.releaseCamera();
      S.api.lockControls(false);
      S.line('payback', 'Oh, you have GOT to be shitting me!', { emotion: 'anger' });
      S.line('alec', 'Bloody hell! Get down, get DOWN!', { emotion: 'fear' });
      yield S.wait(2.4);
    },
  };

  /* ================================================================
     9. THE MORTAR RUN
     ================================================================ */
  var mortarrun = {
    id: 'mortarrun', type: 'scene',
    run: function* (S) {
      S.battle(1);
      var c = S.cast, P = S.props, mo = S.mortar, cv = COVER(S);
      world.wreck(S);
      S.squad('away');
      SQUAD.forEach(function (k, i) { c[k].at(cv.squad[i], 0, 'duck').arm(false); });
      if (!S.hydra[0].firing) { world.tanks(S, 120); tanksRoll(S, 0.8, 110); S.hydra.forEach(function (T) { T.firing = true; }); }
      // The mortar, knocked over on the west pavement.
      mo.x = P.mortar.x; mo.y = 0.2; mo.z = P.mortar.z; mo.yaw = 0.4; mo.roll = 1.45; mo.pitch = 0;
      var sp = c.spite;
      sp.at(cv.you, 0, 'crouchIdle').arm(true);
      S.shot({ eye: [3.5, 1.4, cv.you[2] - 4], at: [P.mortar.x, 0.8, P.mortar.z], fov: 46 });
      yield S.wait(0.8);
      sp.walkTo([P.mortar.x + 0.9, 0, P.mortar.z - 0.6], { speed: 5.6, clip: 'sprint', then: 'crouchIdle' });
      S.shot({ eye: function () { return [sp.pos.x + 3.0, 1.5, sp.pos.z - 3.2]; }, at: function () { return [sp.pos.x, 1.0, sp.pos.z]; }, fov: 50 });
      yield S.wait(0.7);
      // Nearly hit -- twice.
      S.whistle(0.6); yield S.wait(0.6);
      S.boom([sp.pos.x + 2.6, 0.3, sp.pos.z + 1.5], 1.6, { shake: 1.4 });
      // Low, up the street ahead of him, as he runs at us: the second lands between.
      S.shot({ eye: [1.0, 0.6, 17.5], at: function () { return [sp.pos.x, 1.0, sp.pos.z]; }, fov: 44 });
      yield S.wait(0.6);
      S.whistle(0.5); yield S.wait(0.5);
      S.boom([sp.pos.x - 2.2, 0.3, sp.pos.z + 2.4], 1.6, { shake: 1.6 });
      yield S.arrive(sp);
      // Grabs it and drags it behind the wall.
      sp.arm(false);
      var cov = P.mortar.cover;
      // From up the street and a little above, clear of where he runs and of the smoke behind him.
      S.shot({ eye: [cov.x + 5.2, 3.2, cov.z - 8.0], at: [P.mortar.x - 1.6, 0.6, P.mortar.z + 1.2], fov: 40 });
      sp.walkTo([cov.x + 1.4, 0, cov.z - 0.8], { speed: 1.6, clip: 'crouchWalk', then: 'crouchIdle' });
      sp.walk.backwards = true;
      var drag = S.t;
      mo.update = function () {
        if (!sp.walk && S.t - drag > 0.5) { mo.update = null; return; }
        var a = sp.ahead(0.75, 0);
        mo.x = a[0]; mo.z = a[2];
      };
      yield S.arrive(sp);
      // Stands it up, and drops a round in.
      sp.turnTo(0);
      var up0 = S.t;
      mo.update = function () {
        var u = Math.min(1, (S.t - up0) / 0.7);
        mo.roll = 1.45 * (1 - u); mo.y = 0.2 * (1 - u); mo.yaw = 0.4 * (1 - u) + (Math.PI / 2 - 0.0) * u;
        if (u >= 1) mo.update = null;
      };
      S.shot({ eye: [cov.x + 2.4, 1.0, cov.z + 1.6], at: [cov.x + 1.2, 0.8, cov.z - 0.2], fov: 40 });
      yield S.wait(0.9);
      sp.play('mortarLoad', 0.2);
      yield S.wait(0.9);
      if (S.game.audio && S.game.audio.report) S.game.audio.report(0.9);
      if (S.game.particles) S.game.particles.smoke(S.vLocal(mo, [0.7, 1.2, 0]), { count: 8, size: 1.5, life: 2 });
      S.line('alec', 'That\'s my boy!', { emotion: 'happy' });
      yield S.quiet();
    },
    skip: function (S) {
      var mo = S.mortar, cov = S.props.mortar.cover;
      mo.update = null; mo.x = S.cast.spite.pos.x; mo.roll = 0; mo.y = 0;
    },
  };

  /* ================================================================
     10. THE MORTAR (play): six tanks
     ================================================================ */
  var mortar = {
    id: 'mortar', type: 'play', checkpoint: true, objective: 'Destroy the Hydra tanks',
    run: function* (S, st) {
      S.battle(1);
      var c = S.cast, P = S.props, mo = S.mortar, cov = P.mortar.cover, cv = COVER(S), you = S.you;
      world.wreck(S);
      var base = [cov.x + 0.6, 0, cov.z - 0.4];
      mo.update = null; mo.x = base[0]; mo.y = 0; mo.z = base[2]; mo.roll = 0; mo.pitch = 0;
      S.putYou([base[0] - 0.8, 0, base[2] - 0.9], 0, -0.1);
      S.squad('away');
      SQUAD.forEach(function (k, i) { c[k].at([cov.x + 0.4 + (i - 1.5) * 1.1, 0, cov.z - 2.0 - (i % 2) * 0.6], 0, i === 1 ? 'binoculars' : 'crouchIdle').arm(i !== 1); });
      c.spite.at([base[0] - 0.7, 0, base[2] - 0.6], 0.3, 'crouchIdle').arm(false);
      if (!S.hydra.some(function (T) { return T.firing; })) world.tanks(S, 118);
      S.flags.tankClose = false;
      tanksAdvance(S);
      S.hydra.forEach(function (T) { T.firing = true; });
      S.api.lockControls(true);
      if (S.api.look) S.api.look(0, -0.05);
      // A marker where the round will land.
      var mark = S.game.cylinder ? S.game.cylinder({ at: [0, -50, 0], radius: 4, height: 0.15, physics: false,
        material: { color: 0xff3020, emissive: 0xff3020, emissiveStrength: 3.0, opacity: 0.55 } }) : null;
      var aimAt = function () {
        var yaw = S.api.yaw, pitch = S.api.pitch;
        // Down into the street as well as out to the hill: the tanks come to you.
        var R = Math.max(12, Math.min(175, 105 - pitch * 140));
        var x = mo.x + Math.sin(yaw) * R, z = mo.z + Math.cos(yaw) * R;
        return { x: x, z: z, y: hillY(z), R: R, yaw: yaw };
      };
      /* The spotter's view: high over the street, two thirds of the way out to where the round will
         land, looking down on it -- the marker, the tanks round it, and the hill they are on. */
      var camE = null, camA = null;
      S.camRig(function () {
        var a = aimAt();
        var ex = mo.x + (a.x - mo.x) * 0.45, ez = mo.z + (a.z - mo.z) * 0.45;
        var want = [ex - Math.sin(a.yaw) * 6, Math.max(26, a.y + 22), ez - Math.cos(a.yaw) * 6], look = [a.x, a.y + 1, a.z];
        if (!camE) { camE = want.slice(); camA = look.slice(); }
        for (var k = 0; k < 3; k++) { camE[k] += (want[k] - camE[k]) * Math.min(1, S.dt * 6); camA[k] += (look[k] - camA[k]) * Math.min(1, S.dt * 9); }
        return { eye: camE.slice(), at: camA.slice(), fov: 48 };
      });
      S.hud('&nbsp;');
      var fired = 0, hits = 0, wasDown = false, readyAt = 0, misses = 0;
      while (S.hydra.some(function (T) { return !T.dead; })) {
        var a = aimAt();
        if (mark) { mark.position.set(a.x, a.y + 0.1, a.z); mark._still = false; }
        var live = S.hydra.filter(function (T) { return !T.dead; });
        S.hud('BEARING ' + ('00' + Math.round(((a.yaw * 180 / Math.PI) % 360 + 360) % 360)).slice(-3) + '&nbsp;&nbsp;&nbsp;RANGE ' + Math.round(a.R) + ' m'
          + '&nbsp;&nbsp;&nbsp;TANKS ' + live.length + '<br><small>MOUSE TO AIM &middot; CLICK TO FIRE</small>');
        S.ctx.objective('Destroy the Hydra tanks (' + (6 - live.length) + ' / 6)', null);
        var down = S.api.fireHeld && S.api.fireHeld();
        if (down && !wasDown && S.t >= readyAt) {
          readyAt = S.t + 2.4; fired++;
          c.spite.play('mortarLoad', 0.15);
          (function (tgt) {
            S.after(0.65, function () {
              if (S.game.audio && S.game.audio.report) S.game.audio.report(0.9);
              if (S.game.particles) S.game.particles.smoke(S.vLocal(mo, [0.7, 1.2, 0]), { count: 8, size: 1.5, life: 2 });
            });
            S.after(1.7, function () { S.whistle(1.0); });
            S.after(2.7, function () {
              S.boom([tgt.x, tgt.y + 0.5, tgt.z], 1.8, { shake: 0.25 });
              var best = null, bd = 1e9;
              S.hydra.forEach(function (T) { if (T.dead) return; var d = Math.hypot(T.x - tgt.x, T.z - tgt.z); if (d < bd) { bd = d; best = T; } });
              if (best && bd < 6.5) {
                best.dead = true; best.firing = false; hits++;
                best.turret += 0.7; best.gun = -0.12;
                S.burn([best.x, best.y + 2.2, best.z], 1.6);
                S.boom([best.x, best.y + 2, best.z], 2.4, { shake: 0.3 });
                var left = S.hydra.filter(function (T) { return !T.dead; }).length;
                if (left > 0) S.line(hits % 2 ? 'brian' : 'alec', hits % 2 ? 'Good hit! Good hit!' : 'Scratch one!', { radio: hits % 2 === 1, emotion: 'happy' });
              } else if (best) {
                misses++;
                // The spotter's correction: left or right of the nearest tank, and how far short or long.
                var fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), rx = -fz, rz = fx;
                var ex = best.x - tgt.x, ez = best.z - tgt.z;
                var side = ex * rx + ez * rz, along = ex * fx + ez * fz;
                var lr = Math.abs(side) > 3 ? (side > 0 ? 'Right' : 'Left') + ' ' + Math.round(Math.abs(side) / 5) * 5 + '. ' : '';
                var ud = Math.abs(along) > 3 ? (along > 0 ? 'Add ' : 'Drop ') + Math.round(Math.abs(along) / 5) * 5 + '.' : '';
                if (misses === 2) S.line('jesse', 'You missed one, genius, it\'s still moving.', { radio: true });
                else S.line('molotov', (lr + ud) || 'Close.');
              }
            });
          })(a);
        }
        wasDown = down;
        yield null;
      }
      if (mark) mark.position.set(0, -50, 0);
      S.hud(null);
      yield S.wait(1.2);
      S.line('alec', 'That\'s the last of them!', { emotion: 'happy' });
      yield S.quiet();
      S.line('all', 'HOOAH!', { emotion: 'happy', volume: 1 });
      yield S.wait(0.8);
    },
  };

  /* ================================================================
     11. THE CHEER, then black
     ================================================================ */
  var cheer = {
    id: 'cheer', type: 'scene',
    run: function* (S) {
      S.battle(0);
      var c = S.cast, cov = S.props.mortar.cover;
      S.squad('away');
      SQUAD.forEach(function (k, i) { c[k].at([cov.x + 0.6 + (i - 1.5) * 1.2, 0, cov.z - 1.8 - (i % 2) * 0.5], Math.PI * 0.15, 'cheer').arm(false); c[k].feel('happy'); });
      c.spite.at([cov.x + 0.4, 0, cov.z - 0.6], Math.PI * 0.9, 'cheer').arm(false);
      c.molotov.play('idle', 0); // Molotov does not cheer.
      S.shot({ eye: [cov.x + 4, 1.7, cov.z - 6], at: [cov.x + 0.5, 1.3, cov.z - 1.4], fov: 44, to: { eye: [cov.x + 3, 3.2, cov.z - 7.5] }, secs: 6 });
      S.line('payback', 'Six for six! HELL yes!', { emotion: 'happy' });
      yield S.quiet();
      S.line('mike', 'Is it... is it over? Are we done?', { emotion: 'happy' });
      yield S.quiet();
      // Molotov does not cheer. He looks back up the street at the hill, still burning.
      c.molotov.turnTo([0, 0, 120]);
      yield S.wait(0.6);
      S.shot(faceShot(c.molotov, 1.4, -0.5, 30));
      yield S.wait(2.4);
      S.shot({ eye: [cov.x + 4, 1.7, cov.z - 6], at: [cov.x + 0.5, 1.3, cov.z - 1.4], fov: 44, to: { eye: [cov.x + 3, 6, cov.z - 9] }, secs: 4 });
      yield S.wait(1.2);
      yield S.fade(1, 2.0);
      yield S.wait(0.6);
    },
    skip: function (S) { S.black(true); },
  };

  /* ================================================================
     12. THE DEBRIEF
     ================================================================ */
  var debrief = {
    id: 'debrief', type: 'scene',
    run: function* (S) {
      S.battle(0);
      var c = S.cast, O = S.props.office, ox = O.at.x, oz = O.at.z;
      S.squad('away');
      S.hydra.forEach(function (T) { T.firing = false; });
      S.black(true);
      // Everyone in the office. Molotov in the corner.
      var seat = { payback: O.chairs[0], alec: O.chairs[1], spite: O.chairs[2], mike: O.chairs[3] };
      Object.keys(seat).forEach(function (k) { var ch = seat[k]; c[k].at([ch.x, 0.1, ch.z + 0.04], 0, 'sitTable').arm(false); c[k].feel(null); });
      c.molotov.at([O.corner.x, 0.1, O.corner.z], -0.75, 'idle').arm(false);
      c.lincoln.at([ox, 0.1, oz + 3.5], Math.PI, 'idle').arm(false);
      S.shot({ eye: [ox + 4.2, 2.3, oz - 3.3], at: [ox - 0.3, 1.0, oz + 0.9], fov: 52, to: { eye: [ox + 3.6, 2.1, oz - 2.8] }, secs: 8 });
      yield S.fade(0, 1.6);
      // The folder.
      var g = S.game, folder = g.box({ at: [ox + 0.1, 0.81, oz + 2.6], size: [0.32, 0.03, 0.24], material: { color: 0x8a6a3a }, physics: false });
      S.line('lincoln', 'Hydra.', { wait: 0.8 });
      yield S.quiet();
      S.shot(faceShot(c.lincoln, 1.25, 0.35, 32));
      c.lincoln.play('gesture', 0.4);
      S.line('lincoln', 'A force we have never seen before. No flag. No country. No records.');
      yield S.quiet();
      // The photographs, fanned across the table.
      var photos = [];
      for (var i = 0; i < 6; i++) photos.push(g.box({ at: [ox - 1.0 + i * 0.4, 0.915, oz - 0.15 + (i % 2) * 0.12], size: [0.2, 0.004, 0.15], rotation: [0, -14 + i * 7, 0], material: { color: i % 2 ? 0xc8c0b0 : 0xb8b0a0 }, physics: false }));
      S.shot({ eye: [ox, 2.2, oz + 0.9], at: [ox, 0.9, oz - 0.15], fov: 40 });
      S.line('lincoln', 'Three weeks ago, these were civilians. Farmers. Shopkeepers. One of them taught primary school.');
      yield S.quiet();
      S.shot({ eye: [ox - 0.3, 1.45, oz + 1.6], at: [ox - 0.2, 1.15, oz - 1.2], fov: 46 });
      c.mike.feel('sad');
      S.line('mike', 'We... I...', { emotion: 'sad', wait: 0.8 });
      yield S.quiet();
      c.payback.feel('sad');
      S.line('payback', 'Jesus Christ.', { emotion: 'sad', volume: 0.6 });
      yield S.quiet();
      S.line('alec', 'Then somebody turned them. Somebody handed a schoolteacher a tank.', { emotion: 'anger' });
      yield S.quiet();
      // The question.
      S.shot(faceShot(c.molotov, 1.4, 0.35, 30));
      S.line('molotov', 'Why were we there?');
      yield S.quiet();
      yield S.wait(1.4);
      S.shot(faceShot(c.lincoln, 1.0, 0.25, 28));
      c.lincoln.play('idle', 0.4); c.lincoln.feel('fear');
      S.line('lincoln', 'We... the... it was a... civilians requested us to come there.', { emotion: 'fear', wait: 1.2 });
      yield S.quiet();
      // Nobody speaks. Every one of them narrows their eyes.
      ['payback', 'alec', 'spite', 'mike', 'molotov'].forEach(function (k) { c[k].feel('anger'); c[k].look(c.lincoln); });
      S.shot({ eye: [ox - 0.9, 1.5, oz + 1.7], at: [ox + 0.1, 1.15, oz - 1.25], fov: 40, to: { eye: [ox + 0.9, 1.5, oz + 1.7] }, secs: 3.6 });
      yield S.wait(3.6);
      S.shot(faceShot(c.lincoln, 1.25, 0.35, 32));
      c.lincoln.feel('anger');
      S.line('lincoln', 'Dismissed.');
      yield S.quiet();
      S.shot(faceShot(c.mike, 1.1, -0.35, 32));
      S.line('mike', 'Sir, with respect, if civilians requested us, then who was it we were --', { emotion: 'fear' });
      yield S.wait(2.6);
      S.ctx.hush();
      c.lincoln.turnTo([O.door.x, 0, O.door.z]);
      c.lincoln.play('point', 0.15);
      S.shot(faceShot(c.lincoln, 1.6, -0.5, 38));
      S.shake(0.08);
      S.line('lincoln', 'DISMISSED!', { emotion: 'anger', volume: 1 });
      yield S.quiet();
      // They file out.
      ['spite', 'payback', 'alec', 'mike'].forEach(function (k, i) {
        var e = c[k];
        S.after(i * 0.7, function () { e.play('idle', 0.3); e.walkTo([O.door.x, 0.1, O.door.z - 0.6], { face: 0 }); });
      });
      S.after(3.2, function () { c.molotov.walkTo([O.door.x, 0.1, O.door.z - 0.6], { face: 0 }); });
      S.shot({ eye: [ox + 3.8, 2.2, oz - 3.0], at: [O.door.x + 1, 1.2, O.door.z - 1.2], fov: 50 });
      yield S.wait(4.5);
      yield S.fade(1, 2.2);
      folder && (folder.visible = false);
      photos.forEach(function (p) { if (p) p.visible = false; });
      yield S.wait(0.6);
    },
    skip: function (S) { S.black(true); },
  };

  /* ================================================================
     THE MISSION
     ================================================================ */
  var MISSION = {
    id: 'burning-sky',
    title: 'Burning Sky',
    place: 'Colombia, 1999 -- mission classified',
    map: 'colombia',
    noBriefing: true,
    friendlyFire: true,
    intelTotal: 4,
    player: { cast: 'spite', name: 'Spite', operator: 'delta',
      loadout: { name: 'Spite', primary: 'm4', primaryAtt: ['o-reflex'], secondary: 'm1911', secondaryAtt: [],
        tactical: 't-flash', lethal: 'x-frag', ability: 'a-overclock', streaks: [], camo: 'none', keychain: null } },
    allies: [
      { name: 'Payback', cast: 'payback', gunModel: 'deagle', loadout: { primary: 'mauser', primaryAtt: [], secondary: 'm1911', secondaryAtt: [] } },
      { name: 'Molotov', cast: 'molotov', loadout: { primary: 'trench', primaryAtt: [], secondary: 'm1911', secondaryAtt: [] } },
      { name: 'Alec', cast: 'alec', loadout: { primary: 'm16', primaryAtt: [], secondary: 'm1911', secondaryAtt: [] } },
      { name: 'Mike', cast: 'mike', loadout: { primary: 'm4', primaryAtt: [], secondary: 'm1911', secondaryAtt: [] } },
    ],
    enemies: 11,
    hostileCast: (W.CAMPAIGN_HYDRA || []).slice(),
    hostileLoadouts: [
      { primary: 'ak47', primaryAtt: [], secondary: 'tokarev', secondaryAtt: [] },
      { primary: 'ak47', primaryAtt: [], secondary: 'tokarev', secondaryAtt: [] },
      { primary: 'g3a', primaryAtt: [], secondary: 'tokarev', secondaryAtt: [] },
      { primary: 'ak47', primaryAtt: [], secondary: 'tokarev', secondaryAtt: [] },
      { primary: 'falke', primaryAtt: [], secondary: 'tokarev', secondaryAtt: [] },
      { primary: 'ak74', primaryAtt: [], secondary: 'tokarev', secondaryAtt: [] },
    ],
    setup: setup,
    steps: [intro, rooftop, stairs, street, birddown, handoff, snipers, hydra, mortarrun, mortar, cheer, debrief],
    /* The end screen. Three stars, one off for dying more than three times and one off for any
       friendly fire. Completion: the objectives are half of it; the intel maps, clearing every
       hostile and watching every cutscene are the rest. */
    passed: function (st, S) {
      var stars = 3, why = [];
      if (st.deaths > 3) { stars--; why.push('Died ' + st.deaths + ' times'); }
      if (st.ff > 0) { stars--; why.push('Friendly fire'); }
      var cleared = st.killed >= st.spawned && st.spawned > 0;
      var pct = 50 + Math.round(20 * st.intel / 4) + (cleared ? 15 : 0) + (st.skipped === 0 ? 15 : 0);
      var secs = Math.round(S.M.time - (st.t0 || 0)), mm = Math.floor(secs / 60), ss = secs % 60;
      return {
        stars: stars, why: why, pct: pct,
        rows: [
          ['Time', mm + ':' + (ss < 10 ? '0' : '') + ss],
          ['Hostiles killed', st.killed + ' / ' + st.spawned],
          ['Intel', st.intel + ' / 4'],
          ['Deaths', st.deaths],
          ['Friendly fire', st.ff],
          ['Cutscenes skipped', st.skipped],
        ],
      };
    },
  };

  W.CAMPAIGN_MISSIONS = W.CAMPAIGN_MISSIONS || [];
  W.CAMPAIGN_MISSIONS.unshift(MISSION);
  W.CAMPAIGN_M1 = { mission: MISSION, world: world, hillY: hillY };
})();
