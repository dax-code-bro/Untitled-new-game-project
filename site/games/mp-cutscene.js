/* ============================================================
   THE WIN CUTSCENES
   ============================================================
   "each one has a custom cutscene for winning ... I want the your side
   won message to appear after the cutscene ends"

   Four of them, one per map, and the last clause is the important one:
   the result panel is HELD until the scene is over. A cutscene that
   plays behind a scoreboard is a screensaver.

   WHAT THESE ARE MADE OF. Not a new renderer and not a video: the map
   is already standing there, so a scene is a camera path plus a handful
   of things moved along their own paths, driven off a WALL clock. It
   has to be wall time, because by the time a scene runs the match has
   been slowed to a stop and game time is not advancing at all -- the
   same trap the end-of-match slow motion fell into and documents at
   length in mp-game.js.

   WHOSE PARTS THEY ARE. Helipad already has a helicopter and
   Demolition already has a crane, built out of named slabs by the map
   builder. The scene finds them by name and flies THOSE, rather than
   spawning a second helicopter next to the one everybody has spent six
   rounds fighting over.

   A scene may be interrupted -- somebody hits a key -- and everything
   it built has to go when it does. Every actor a scene makes goes in
   `made` and is destroyed on stop, whether the scene finished or not.
   ============================================================ */
(function () {
  var W = window;

  /* ---------------- small helpers ---------------- */

  /* EVERY MOVE GOES THROUGH setPosition, never through position.set.
   *
     An actor with no rigid body composes its matrix once and raises a
     `_still` flag; after that the cached matrix is returned and nothing
     recomposes it until a SETTER clears the flag. Writing the vector
     directly moves the number and leaves the flag up -- so the read-back
     is correct, every assertion about it passes, and on the screen the
     thing has not moved at all. The first cut of the helicopter scene
     flew a helicopter that stayed exactly where it was parked. */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }
  /* Ease in and out. Straight lerps on a camera read as a slide rather
     than as a move somebody made. */
  function ease(t) { return t * t * (3 - 2 * t); }

  function bySub(game, sub) {
    var out = [];
    for (var i = 0; i < game.actors.length; i++) {
      var a = game.actors[i];
      if (a && a.name && a.name.indexOf(sub) >= 0) out.push(a);
    }
    return out;
  }

  /* Remember where a group of actors started, so the scene can move them
     as one rigid thing and put them back afterwards. */
  function group(list) {
    var home = list.map(function (a) {
      return { a: a, x: a.position.x, y: a.position.y, z: a.position.z };
    });
    return {
      list: list,
      move: function (dx, dy, dz) {
        for (var i = 0; i < home.length; i++) {
          var h = home[i];
          h.a.setPosition([h.x + dx, h.y + dy, h.z + dz]);
        }
      },
      /* Turn the whole group about a point on the ground, which is how a
         helicopter noses over as it climbs away. */
      spin: function (cx, cz, ang, dx, dy, dz) {
        var c = Math.cos(ang), s = Math.sin(ang);
        for (var i = 0; i < home.length; i++) {
          var h = home[i], px = h.x - cx, pz = h.z - cz;
          h.a.setPosition([cx + px * c - pz * s + dx, h.y + dy, cz + px * s + pz * c + dz]);
        }
      },
      home: function () {
        for (var i = 0; i < home.length; i++) {
          var h = home[i]; h.a.setPosition([h.x, h.y, h.z]);
        }
      },
    };
  }

  /* ---------------- the framework ---------------- */

  function make(game, M, mapId, opts) {
    var O = opts || {};
    var beats = null, bi = 0, t = 0, running = false, built = false;
    var made = [];            // everything this scene spawned
    var lights = [];          // and every lamp it switched on
    var groups = [];          // everything this scene displaced
    var winner = null;
    var script = SCRIPTS[mapId] || SCRIPTS._default;

    var api = {
      get active() { return running; },
      get name() { return script.name; },
      get length() { return script.beats.reduce(function (n, b) { return n + b.t; }, 0); },
      begin: begin, update: update, stop: stop,
      /* For a test: where the camera is right now, and which beat. */
      get beat() { return running && beats ? beats[bi].id : null; },
      get elapsed() { return t; },
    };

    /* Everything a script is handed. Nothing in a script reaches for the
       engine directly, so one place decides what a scene may touch. */
    var ctx = {
      game: game, match: M, map: mapId,
      /* Spawn something that belongs to this scene alone. */
      box: function (o) { var a = game.box(o); if (a) { a.name = 'cut'; made.push(a); } return a; },
      cyl: function (o) { var a = game.cylinder(o); if (a) { a.name = 'cut'; made.push(a); } return a; },
      find: function (sub) { var g = group(bySub(game, sub)); groups.push(g); return g; },
      look: function (eye, at) { game.lookAt(eye, at); },
      fov: function (v) { if (game.fieldOfView) game.fieldOfView(v); },
      /* A PERSON, and the engine has had one all along.
       *
         The first cut of these scenes built every figure out of two
         boxes -- a torso and a head -- and they read as two boxes. The
         same builder the twelve combatants are made from takes a
         height, a build and a colour and gives back a skinned body with
         a face on it. A crew loading a helicopter has to look like men.

         No controller and no physics: a scene figure is placed by the
         script, frame by frame, and must not walk off or fall over. */
      man: function (at, colour, h) {
        var a = null;
        try {
          a = game.character({ at: at, name: 'cut-man',
            material: { preset: 'fabric', color: colour == null ? 0x3c4436 : colour },
            height: h || 1.78, radius: 0.30 });
        } catch (e) { a = null; }
        /* A CHARACTER ALWAYS GETS A CONTROLLER AND A BODY. There is no
           physics flag on it to turn that off, and a body with gravity
           on it falls -- the bunker under Town is deco with no collision
           at all, sixty metres below the world, so the first scientist
           dropped out of frame inside a second and the shot was an empty
           room with a red button in it.

           Kinematic and weightless: the script says where he is, every
           frame, and nothing else gets a vote. */
        if (a && a.body) {
          a.body.isKinematic = true;
          a.body.gravityScale = 0;
          a.body.velocity.set(0, 0, 0);
        }
        if (a && a.controller) {
          a.controller.moveSpeed = 0;
          if (a.controller.body) {
            a.controller.body.isKinematic = true;
            a.controller.body.gravityScale = 0;
            a.controller.body.velocity.set(0, 0, 0);
          }
        }
        if (!a) {
          // Better a box than nobody.
          a = game.box({ at: at, size: [0.46, 1.1, 0.30], physics: false,
            material: { color: colour == null ? 0x3c4436 : colour, texture: 'canvas' } });
        }
        if (a) { a.name = 'cut-man'; made.push(a); }
        return a;
      },
      /* Dust, smoke and fire, which is most of what an explosion is. */
      puff: function (at, o) {
        try { game.particles.dust(at, o || {}); } catch (e) { /* never worth a frame */ }
      },
      boom: function (at, o) {
        try {
          if (game.particles.explosion) game.particles.explosion(at, o || {});
          else game.particles.dust(at, { count: 30, size: 3 });
        } catch (e) { /* never worth a frame */ }
      },
      /* A lamp. Anything built away from the map -- the bunker under
         Town is sixty metres below the world -- gets no sun and no sky,
         so without one the shot is a grey smear. Removed with the rest
         of the scene. */
      lamp: function (at, o) {
        try {
          var L = game.light(Object.assign({ at: at, color: 0xffd9a8,
            intensity: 26, radius: 14 }, o || {}));
          if (L) lights.push(L);
          return L;
        } catch (e) { return null; }
      },
      thud: function (v) {
        try { game.audio.ping({ frequency: 70 + Math.random() * 40, volume: v == null ? 0.5 : v }); }
        catch (e) { /* never worth a frame */ }
      },
      lerp: lerp, lerp3: lerp3, ease: ease, clamp01: clamp01,
      dt: 0,
      /* MOVE A FIGURE AND LET ITS FEET AGREE.

         The crew used to be slid across the pad by setPosition while the
         controller -- which only ever saw a kinematic body with no
         velocity -- played them the idle clip, and a |sin| hop on top was
         all the walking there was: three men standing to attention and
         gliding. This measures how fast the script actually moved the
         figure, turns it to face the way it is going, and plays the gait
         whose own speed is nearest at the rate that keeps its planted
         foot planted, exactly as the combatants do. */
      stride: function (a, pos) {
        if (!a) return;
        var last = a.__cutPos, dt = ctx.dt;
        a.setPosition(pos);
        a.__cutPos = [pos[0], pos[1], pos[2]];
        var an = a.animator, ctl = a.controller;
        if (!an || !ctl) return;
        ctl.autoAnimate = false;
        var sp = 0;
        if (last && dt > 1e-4) {
          var dx = pos[0] - last[0], dz = pos[2] - last[2];
          sp = Math.hypot(dx, dz) / dt;
          if (sp > 0.05) {
            var want = Math.atan2(dx, dz), d = want - ctl.facing;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            ctl.facing += d * Math.min(1, dt * 10);
          }
        }
        a.__cutSp = a.__cutSp == null ? sp : a.__cutSp + (sp - a.__cutSp) * Math.min(1, dt * 10);
        var v = a.__cutSp;
        var clip = v < 0.3 ? 'idle' : (v > 2.8 && an.clips.get('run')) ? 'run' : 'walk';
        if (a.__cutClip !== clip) { a.__cutClip = clip; an.play(clip, 0.2); }
        var c = an.clips.get(clip);
        an.speed = c && c.stride && v >= 0.3 ? W.LE.gaitRate(c, v) : 1;
      },
      get winner() { return winner; },
    };

    function begin(who) {
      if (running) return;
      winner = who || null;
      beats = script.beats;
      bi = 0; t = 0; running = true; built = false;
      try { if (script.setup) script.setup(ctx); } catch (e) { /* a scene is never worth the match */ }
      built = true;
    }

    /* Wall seconds in, true when the scene is over. */
    function update(wdt) {
      if (!running || !beats) return true;
      t += Math.min(0.1, wdt || 0);
      ctx.dt = Math.min(0.1, wdt || 0);
      var acc = 0;
      for (var i = 0; i < beats.length; i++) {
        var b = beats[i];
        if (t < acc + b.t || i === beats.length - 1) {
          bi = i;
          var u = clamp01(b.t > 0 ? (t - acc) / b.t : 1);
          try { b.at(ctx, u); } catch (e) { /* ditto */ }
          if (i === beats.length - 1 && t >= acc + b.t) { stop(); return true; }
          return false;
        }
        acc += b.t;
      }
      stop();
      return true;
    }

    function stop() {
      if (!running && !built) return;
      running = false;
      for (var i = 0; i < made.length; i++) {
        try { made[i].destroy(); } catch (e) { /* already gone */ }
      }
      made.length = 0;
      /* There is no removeLight: a lamp is a plain object pushed onto
         renderer.lights, so it comes off the same array it went on. */
      for (var k = 0; k < lights.length; k++) {
        try {
          var ix = game.renderer.lights.indexOf(lights[k]);
          if (ix >= 0) game.renderer.lights.splice(ix, 1);
        } catch (e) { /* already gone */ }
      }
      lights.length = 0;
      /* PUT THE MAP BACK. A scene that flies the helicopter away and
         does not bring it back leaves the next round on a pad with no
         helicopter on it -- and the bomb site is the helicopter. */
      for (var j = 0; j < groups.length; j++) {
        try { groups[j].home(); } catch (e) { /* ditto */ }
      }
      groups.length = 0;
      try { if (game.fieldOfView) game.fieldOfView(55); } catch (e) { /* ditto */ }
    }

    return api;
  }

  /* ================================================================
     HELIPAD — the helicopter leaves and you watch it go
     ================================================================
     "a few members of your team loading up into the helicopter before
     the helicopter takes off and the camera stays at the helipad as the
     helicopter disappears into the clouds."

     The camera does not follow it. That is the whole shot: it is fixed
     on the pad, and the thing you were fighting over gets smaller. */
  var HELIPAD = {
    name: 'the helicopter leaves',
    setup: function (c) {
      c.heli = c.find('heli');
      c.rotor = c.find('rotor');
      /* Three of the winning side, walking out to it. Built rather than
         borrowed from the match: the combatants are frozen mid-fall all
         over the map by the time this runs. */
      c.crew = [];
      for (var i = 0; i < 3; i++) {
        var x = -7.5 + i * 1.6, z = 6.0 + (i % 2) * 0.9;
        c.crew.push({ body: c.man([x, 0.05, z], [0x3c4436, 0x4a4436, 0x36402f][i]),
          x0: x, z0: z, lag: i * 0.10 });
      }
      c.rotorAng = 0;
    },
    beats: [
      /* 1. The pad, from the side. They start walking. */
      { id: 'walk', t: 3.4, at: function (c, u) {
        var e = c.ease(u);
        c.look([11.5, 3.4 - e * 0.6, 9.5], [0.5, 1.6, 0.5]);
        c.fov(58);
        c.rotorAng += 0.06 + e * 0.5;
        c.rotor.spin(0, -1, c.rotorAng, 0, 0, 0);
        for (var i = 0; i < c.crew.length; i++) {
          var m = c.crew[i], k = c.clamp01((e - m.lag) / (1 - m.lag));
          var x = c.lerp(m.x0, -1.4 + i * 0.5, k), z = c.lerp(m.z0, 1.4, k);
          c.stride(m.body, [x, 0.05, z]);
        }
      } },
      /* 2. They are aboard and the rotor comes up to speed. */
      { id: 'board', t: 2.0, at: function (c, u) {
        c.look([11.5, 2.8, 9.5], [0.5, 1.8, 0.5]);
        c.rotorAng += 0.55 + u * 0.5;
        c.rotor.spin(0, -1, c.rotorAng, 0, 0, 0);
        for (var i = 0; i < c.crew.length; i++) {
          var m = c.crew[i], k = c.ease(c.clamp01(u * 1.4 - i * 0.16));
          // Into the cabin: they step up and in, and the doorway hides them.
          c.stride(m.body, [-1.4 + i * 0.5, 0.05 + k * 0.55, c.lerp(1.4, -0.9, k)]);
        }
        if (u > 0.9) c.thud(0.30);
      } },
      /* 3. Lift, nose over, and away. The camera does not move. */
      { id: 'lift', t: 6.2, at: function (c, u) {
        var e = c.ease(u);
        c.look([11.5, 2.8, 9.5], [0.5, 1.8 + e * 26, 0.5 - e * 30]);
        c.rotorAng += 1.05;
        var up = e * e * 62, out = e * e * 110, nose = e * 0.28;
        c.heli.spin(0, -1, nose * 0.25, 0, up, -out);
        c.rotor.spin(0, -1, c.rotorAng, 0, up, -out);
        if (u < 0.25) c.puff([0, 0.2, 0], { count: 3, size: 2.2, gravity: -0.1 });
      } },
      /* 4. Gone. A beat of empty sky before the message. */
      { id: 'gone', t: 1.8, at: function (c, u) {
        c.look([11.5, 2.8, 9.5], [0.5, 26 + u * 4, -30]);
        c.fov(c.lerp(58, 46, c.ease(u)));
      } },
    ],
  };

  /* ================================================================
     TOWN — a red button, and then the bombers
     ================================================================
     "a lab scientist in an underground bunker will press a red button,
     causing multiple B2 bombers overhead to drop thousands of bombs
     blowing up all of town."

     Two shots. The bunker is built off the side of the map and thrown
     away afterwards -- there is no bunker under Town and there does not
     need to be one, because the camera is inside it for four seconds. */
  var TOWN = {
    name: 'the bombers',
    setup: function (c) {
      var BX = 0, BY = -60, BZ = 0;            // well under the world
      var concrete = { color: 0x8e8b84, texture: 'concrete', roughness: 0.95 };
      c.bunker = [];
      // A room: floor, ceiling and three walls. The fourth is the camera.
      c.box({ at: [BX, BY, BZ], size: [7, 0.3, 6], material: concrete, physics: false });
      c.box({ at: [BX, BY + 3, BZ], size: [7, 0.3, 6], material: concrete, physics: false });
      c.box({ at: [BX, BY + 1.5, BZ - 3], size: [7, 3, 0.3], material: concrete, physics: false });
      c.box({ at: [BX - 3.5, BY + 1.5, BZ], size: [0.3, 3, 6], material: concrete, physics: false });
      c.box({ at: [BX + 3.5, BY + 1.5, BZ], size: [0.3, 3, 6], material: concrete, physics: false });
      // A console with a red button under a guard, and a lamp over it.
      c.box({ at: [BX, BY + 0.45, BZ - 2.1], size: [2.6, 0.90, 0.7],
        material: { color: 0x3d4a44, texture: 'metal', roughness: 0.5, metalness: 1 }, physics: false });
      // A sloped panel on top of it, which is what the button sits in.
      c.box({ at: [BX, BY + 1.00, BZ - 2.28], size: [2.6, 0.22, 0.34],
        material: { color: 0x2f3a36, texture: 'metal', roughness: 0.45, metalness: 1 }, physics: false });
      c.btn = c.cyl({ at: [BX + 0.55, BY + 1.02, BZ - 1.98], radius: 0.15, height: 0.12,
        material: { color: 0xd8342a, texture: 'smooth', roughness: 0.4,
          emissive: 0xd8342a, emissiveIntensity: 0.6 }, physics: false });
      c.lamp = c.box({ at: [BX, BY + 2.7, BZ - 1.2], size: [0.5, 0.12, 0.5],
        material: { color: 0xffe2a8, texture: 'smooth', emissive: 0xffc46a,
          emissiveIntensity: 2.2, roughness: 1 }, physics: false });
      // The man: a white coat, and an arm that reaches.
      c.coat = c.man([BX + 0.2, BY, BZ - 1.15], 0xdcdcd6, 1.74);
      c.arm = c.box({ at: [BX + 0.45, BY + 1.20, BZ - 1.5], size: [0.13, 0.13, 0.50],
        material: { color: 0xdcdcd6, texture: 'canvas', roughness: 0.95 }, physics: false });
      c.B = [BX, BY, BZ];
      c.lamp([BX, BY + 2.5, BZ - 1.0], { intensity: 30, radius: 12 });
      c.lamp([BX, BY + 2.2, BZ + 1.6], { color: 0x8fb0d8, intensity: 12, radius: 10 });
      /* THE BOMBERS. Four flying wings, high over the town and crossing
         it. Built as a plan shape: a wide shallow delta reads as a B-2
         from below and that is the only angle anybody sees it from. */
      c.planes = [];
      for (var i = 0; i < 4; i++) {
        /* LOW ENOUGH TO BE IN THE SHOT. At eighty metres they were
           above the top of the frame for the whole of the beat that is
           supposed to be about them. */
        var px = -30 + i * 21, pz = -90 - (i % 2) * 22, py = 46 + (i % 3) * 4;
        var g = [];
        g.push(c.box({ at: [px, py, pz], size: [26, 1.1, 5.0],
          material: { color: 0x2d3138, texture: 'metal', roughness: 0.6 }, physics: false }));
        g.push(c.box({ at: [px, py + 0.5, pz + 1.8], size: [7.5, 1.8, 4.0],
          material: { color: 0x2d3138, texture: 'metal', roughness: 0.6 }, physics: false }));
        g.push(c.box({ at: [px - 9, py, pz + 2.6], size: [9, 0.7, 3.0],
          material: { color: 0x2d3138, texture: 'metal', roughness: 0.6 }, physics: false }));
        g.push(c.box({ at: [px + 9, py, pz + 2.6], size: [9, 0.7, 3.0],
          material: { color: 0x2d3138, texture: 'metal', roughness: 0.6 }, physics: false }));
        c.planes.push({ parts: g, x: px, y: py, z: pz });
      }
      c.bombs = [];
      c.dropped = 0;
    },
    beats: [
      /* 1. Underground. He is at the console. */
      { id: 'bunker', t: 2.6, at: function (c, u) {
        var B = c.B, e = c.ease(u);
        /* FROM THE CORNER, ACROSS THE ROOM. The first framing of this
           put the camera three metres from a three-metre console and
           the shot was a grey slab with a brown box behind it -- you
           could not see the man, and the man is the shot. */
        c.fov(c.lerp(58, 50, e));
        c.look([B[0] - 2.5 + e * 0.5, B[1] + 1.75, B[2] + 1.9 - e * 0.5],
          [B[0] + 0.35, B[1] + 1.15, B[2] - 1.9]);
        if (c.coat) c.coat.setPosition([B[0] + 0.2, B[1] + 0.90, B[2] - 1.15]);
        // The arm comes across to the button.
        c.arm.setPosition([B[0] + c.lerp(0.45, 0.58, e), B[1] + c.lerp(1.20, 1.10, e),
          B[2] + c.lerp(-1.5, -1.92, e)]);
      } },
      /* 2. He presses it. */
      { id: 'press', t: 1.4, at: function (c, u) {
        var B = c.B;
        /* PAST HIM, NOT THROUGH HIM. The first framing put the camera
           a quarter of a metre from his ear and the right half of the
           shot was the side of his head. From here he is in profile,
           reaching, and the button is clear of him. */
        c.fov(50);
        c.look([B[0] - 1.75, B[1] + 1.45, B[2] - 0.30], [B[0] + 0.50, B[1] + 1.08, B[2] - 1.96]);
        if (c.coat) c.coat.setPosition([B[0] + 0.2, B[1] + 0.90, B[2] - 1.15]);
        var down = u < 0.35 ? u / 0.35 : 1;
        c.btn.setPosition([B[0] + 0.55, B[1] + 1.02 - down * 0.055, B[2] - 1.98]);
        c.arm.setPosition([B[0] + 0.58, B[1] + 1.10 - down * 0.04, B[2] - 1.92]);
        if (u > 0.35) {
          // The room goes red, and then it is not his problem any more.
          c.lamp.material.emissive = 0xff2a1e;
          if (u > 0.36 && u < 0.40) c.thud(0.55);
        }
      } },
      /* 3. Above the town, and they are already overhead. */
      { id: 'overhead', t: 3.2, at: function (c, u) {
        var e = c.ease(u);
        c.fov(c.lerp(52, 62, e));
        /* Looking UP at them, from the edge of the town. */
        c.look([0, 18, 96 - e * 30], [0, 44 + e * 4, -10 + e * 40]);
        for (var i = 0; i < c.planes.length; i++) {
          var p = c.planes[i], dz = e * 92;
          for (var k = 0; k < p.parts.length; k++) {
            var a = p.parts[k];
            a.setPosition([a.position.x, a.position.y, a.position.z + dz - (a.__dz || 0)]);
            a.__dz = dz;
          }
        }
      } },
      /* 4. Thousands of them. */
      { id: 'drop', t: 4.6, at: function (c, u) {
        var e = u;
        c.fov(66);
        c.look([0, 40 - e * 8, 78 - e * 10], [0, 12, -6]);
        for (var i = 0; i < c.planes.length; i++) {
          var p = c.planes[i], dz = 92 + e * 70;
          for (var k = 0; k < p.parts.length; k++) {
            var a = p.parts[k];
            a.setPosition([a.position.x, a.position.y, a.position.z + dz - (a.__dz || 0)]);
            a.__dz = dz;
          }
        }
        /* A few dozen drawn, and the rest is smoke and noise -- which is
           what "thousands" looks like from above anyway. */
        var want = Math.floor(e * 34);
        while (c.dropped < want) {
          var bx = (Math.random() - 0.5) * 96, bz = (Math.random() - 0.5) * 110;
          c.boom([bx, 1.2, bz], { radius: 7, strength: 0 });
          c.puff([bx, 1.0, bz], { count: 14, size: 3.4, gravity: -0.25, life: 3 });
          if ((c.dropped % 3) === 0) c.thud(0.42);
          c.dropped++;
        }
      } },
      /* 5. Smoke, and nothing standing. */
      { id: 'after', t: 2.2, at: function (c, u) {
        c.fov(c.lerp(66, 58, c.ease(u)));
        c.look([0, 30 - u * 4, 62], [0, 8, -4]);
        if (u < 0.5 && Math.random() < 0.25) {
          var bx = (Math.random() - 0.5) * 80, bz = (Math.random() - 0.5) * 90;
          c.puff([bx, 1.0, bz], { count: 10, size: 4.0, gravity: -0.15, life: 4 });
        }
      } },
    ],
  };

  /* ================================================================
     RESORT — the lockdown
     ================================================================
     "a lockdown happens, locking everyone inside the building to fight
     until no one is left standing."

     Shutters come down over every way out, and then the camera backs off
     and watches the windows flash. */
  var RESORT = {
    name: 'the lockdown',
    setup: function (c) {
      var steel = { color: 0x53585e, texture: 'metal', roughness: 0.6, metalness: 1 };
      c.shut = [];
      /* Across the front of the hotel, at the openings. Each one starts
         up in the lintel and comes down. */
      var at = [[-39, -9], [-31, -9], [-23, -9], [-14, -9], [1, -9], [10, -9], [19, -9]];
      for (var i = 0; i < at.length; i++) {
        var a = c.box({ at: [at[i][0], 5.4, at[i][1]], size: [6.6, 3.2, 0.26],
          material: steel, physics: false });
        c.shut.push({ a: a, x: at[i][0], z: at[i][1], lag: (i % 4) * 0.12 });
      }
      c.flash = [];
      for (var j = 0; j < 6; j++) {
        c.flash.push(c.box({ at: [-34 + j * 11, 2.2, -7.4], size: [1.6, 1.4, 0.10],
          material: { color: 0xffd9a0, texture: 'smooth', emissive: 0xffb347,
            emissiveIntensity: 0, roughness: 1 }, physics: false }));
      }
    },
    beats: [
      /* 1. Along the front, and the first shutter goes. */
      { id: 'alarm', t: 2.4, at: function (c, u) {
        var e = c.ease(u);
        c.fov(60);
        c.look([c.lerp(-52, -30, e), 4.2, 14], [c.lerp(-34, -6, e), 2.6, -8]);
        if (u > 0.4 && u < 0.45) c.thud(0.5);
      } },
      /* 2. Every way out closes. */
      { id: 'shut', t: 3.2, at: function (c, u) {
        c.fov(62);
        c.look([-6, 6.0, 20], [-4, 2.4, -8]);
        for (var i = 0; i < c.shut.length; i++) {
          var s = c.shut[i], k = c.ease(c.clamp01((u - s.lag) / (1 - s.lag)));
          s.a.setPosition([s.x, c.lerp(5.4, 1.7, k), s.z]);
          if (k > 0.97 && !s.rang) { s.rang = true; c.thud(0.34); }
        }
      } },
      /* 3. Back off. It is still going on in there. */
      { id: 'inside', t: 4.0, at: function (c, u) {
        var e = c.ease(u);
        c.fov(c.lerp(62, 48, e));
        c.look([c.lerp(-6, -4, e), c.lerp(6, 9, e), c.lerp(20, 42, e)], [-4, 3.4, -8]);
        for (var j = 0; j < c.flash.length; j++) {
          var f = c.flash[j];
          var on = Math.random() < 0.10 ? 1 : 0;
          f.material.emissiveIntensity = on * (2.5 + Math.random() * 2.5);
        }
        if (Math.random() < 0.09) c.thud(0.18);
      } },
      /* 4. And then it stops. */
      { id: 'quiet', t: 2.2, at: function (c, u) {
        c.fov(48);
        c.look([-4, 9 + u * 1.5, 42 + u * 4], [-4, 3.4, -8]);
        for (var j = 0; j < c.flash.length; j++) {
          c.flash[j].material.emissiveIntensity *= 0.86;
        }
      } },
    ],
  };

  /* ================================================================
     DEMOLITION — the plunger
     ================================================================
     "a construction site worker will press a detonate button blowing up
     the large debris, crushing everyone in the map under it."
     ================================================================ */
  var DEMOLITION = {
    name: 'the detonator',
    setup: function (c) {
      /* The worker, off at the edge behind the line, where you would
         actually stand to fire a shot. */
      var WX = 0, WZ = 40;
      c.worker = c.man([WX, 0.05, WZ], 0xd8a832, 1.76);
      // The hard hat, which is the only thing that says construction.
      c.hat = c.box({ at: [WX, 1.80, WZ], size: [0.30, 0.15, 0.30],
        material: { color: 0xf0c020, texture: 'smooth', roughness: 0.5 }, physics: false });
      c.boxT = c.box({ at: [WX, 0.30, WZ - 0.7], size: [0.44, 0.34, 0.34],
        material: { color: 0x7a4a24, texture: 'wood', roughness: 0.9 }, physics: false });
      c.plunge = c.cyl({ at: [WX, 0.70, WZ - 0.7], radius: 0.05, height: 0.42,
        material: { color: 0x9aa2aa, texture: 'metal', roughness: 0.4, metalness: 1 },
        physics: false });
      c.knob = c.box({ at: [WX, 0.92, WZ - 0.7], size: [0.22, 0.07, 0.10],
        material: { color: 0xd8342a, texture: 'smooth', roughness: 0.5 }, physics: false });
      c.crane = c.find('crane');
      c.fired = 0;
    },
    beats: [
      /* 1. On the worker, hands on the plunger. */
      { id: 'ready', t: 2.6, at: function (c, u) {
        var e = c.ease(u);
        c.fov(c.lerp(58, 44, e));
        c.look([2.4 - e * 0.9, 1.55, 42.6], [0, 1.0, 39.4]);
        if (c.worker) c.worker.setPosition([0, 0.92, 40]);
        if (c.hat) c.hat.setPosition([0, 1.80, 40]);
      } },
      /* 2. Down it goes. */
      { id: 'fire', t: 1.2, at: function (c, u) {
        c.fov(42);
        c.look([1.3, 1.45, 42.2], [0, 0.95, 39.4]);
        if (c.worker) c.worker.setPosition([0, 0.92, 40]);
        if (c.hat) c.hat.setPosition([0, 1.80, 40]);
        var d = c.ease(c.clamp01(u / 0.45)) * 0.30;
        c.plunge.setPosition([0, 0.70 - d, 39.3]);
        c.knob.setPosition([0, 0.92 - d, 39.3]);
        if (u > 0.45 && !c.rang) { c.rang = true; c.thud(0.7); }
      } },
      /* 3. The site comes down. The crane goes over, and the standing
            walls go with it. */
      { id: 'collapse', t: 4.4, at: function (c, u) {
        var e = u * u;
        c.fov(c.lerp(58, 70, c.ease(u)));
        c.look([2, 6 + u * 10, 58 - u * 4], [0, 8 - u * 6, 0]);
        // The crane topples, turning about its own base.
        c.crane.spin(34, 2, e * 1.25, 0, -e * 6, 0);
        var want = Math.floor(u * 26);
        while (c.fired < want) {
          var bx = (Math.random() - 0.5) * 78, bz = (Math.random() - 0.5) * 78;
          c.puff([bx, 1.0, bz], { count: 16, size: 4.2, gravity: -0.2, life: 4 });
          if ((c.fired % 3) === 0) c.thud(0.40);
          c.fired++;
        }
      } },
      /* 4. Dust, settling. */
      { id: 'dust', t: 2.6, at: function (c, u) {
        c.fov(70);
        c.look([2, 16 - u * 2, 54], [0, 2, 0]);
        c.crane.spin(34, 2, 1.25, 0, -6, 0);
        if (Math.random() < 0.3) {
          c.puff([(Math.random() - 0.5) * 70, 0.8, (Math.random() - 0.5) * 70],
            { count: 9, size: 5, gravity: -0.1, life: 5 });
        }
      } },
    ],
  };

  /* A map with no scene of its own still gets a beat of quiet rather
     than cutting straight to the scoreboard. */
  var DEFAULT = {
    name: 'the field',
    setup: function () { /* nothing to build */ },
    beats: [
      { id: 'hold', t: 2.4, at: function (c, u) {
        var e = c.ease(u);
        c.fov(c.lerp(55, 44, e));
        c.look([0, 8 + e * 10, 40 + e * 14], [0, 2, 0]);
      } },
    ],
  };

  var SCRIPTS = {
    helipad: HELIPAD, town: TOWN, resort: RESORT, demolition: DEMOLITION,
    _default: DEFAULT,
  };

  W.MP_CUTSCENE = {
    make: make,
    /* Published so a test can ask what a map's scene is called and how
       long it runs without having to start one. */
    scripts: SCRIPTS,
    lengthOf: function (id) {
      var s = SCRIPTS[id] || SCRIPTS._default;
      return s.beats.reduce(function (n, b) { return n + b.t; }, 0);
    },
    beatsOf: function (id) {
      var s = SCRIPTS[id] || SCRIPTS._default;
      return s.beats.map(function (b) { return { id: b.id, t: b.t }; });
    },
  };
})();
