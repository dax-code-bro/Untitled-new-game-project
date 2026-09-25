/* ==================================================================
   THE MENU STAGE — 3D behind the menus
   ==================================================================
   The operator selector drew a stick man in SVG. Seven distinct
   sculpted heads, seven builds, seven sets of kit, and what the screen
   showed you was a circle on a trapezoid. This puts the actual man
   there.

   IT USES THE GAME'S OWN ENGINE. There is already a WebGL context
   running behind the menu -- bunker-nine builds the world during the
   title card -- and a second context for the menu would be a second
   copy of every shader and a second lot of frame time on a machine
   that has already been measured struggling. So the subject is staged
   four hundred metres under the map, where no level geometry can reach
   it, and the camera is pointed at it while a menu is open. The game's
   own camera is put back exactly as it was on the way out.

   WHAT A MAN DOES WHILE HE WAITS
   He is not a turntable. He walks in, he settles, and from then on he
   shifts his weight, glances at what is behind him and checks the kit
   on his chest, at intervals that do not line up with each other. And
   when you turn him he TURNS -- at the speed a person turns, about a
   hundred and forty degrees a second, so spinning the selector spins a
   man rather than a model on a stick.
   ================================================================== */
(function () {
  var W = window;

  /* Far under the map. The deepest thing any of these maps has is the
     bunker at a few metres; four hundred is unreachable by accident. */
  var FLOOR = -400;
  var FIDGETS = ['idleShift', 'idleGlance', 'idleCheck'];

  function makeStage() {
    var game = null, sub = null, kind = null, id = null;
    var wantYaw = 0, haveYaw = 0, entry = 0, next = 0, clock = 0;
    var keepCam = null, hook = null, lit = false, held = null;

    /* A person turns about 140 degrees a second when they are turning
       on the spot and not in a hurry. Snapping is what makes a
       character selector feel like a spreadsheet. */
    var TURN_RATE = 2.45;
    var _AY = { x: 0, y: 1, z: 0 };

    /* A FLOOR AND A WALL, and nothing else.
     *
       Asked for plainly: no scene behind the character. The camera is
       four hundred metres under the map so there is no level geometry
       down here, but there is still a sky, and a man against a bright
       horizon is a silhouette. A plain dark wall a few metres behind
       him is the whole backdrop -- he reads against it, and there is
       nothing to look at but him. */
    function stageFloor() {
      if (lit || !game || !game.ground) return;
      lit = true;
      try {
        game.ground({ at: [0, FLOOR, 0], size: 26, physics: false,
          material: { color: 0x101218, texture: 'concrete', roughness: 0.96, uvScale: 8 } });
        if (game.box) {
          game.box({ at: [0, FLOOR + 3.4, -4.2], size: [22, 8, 0.4], physics: false,
            material: { color: 0x0a0c11, texture: 'smooth', roughness: 1, metalness: 0 } });
          /* Wrapped round the sides too, so turning the camera even a
             little does not find the horizon. */
          game.box({ at: [-6.4, FLOOR + 3.4, 0], size: [0.4, 8, 12], physics: false,
            material: { color: 0x0a0c11, texture: 'smooth', roughness: 1, metalness: 0 } });
          game.box({ at: [6.4, FLOOR + 3.4, 0], size: [0.4, 8, 12], physics: false,
            material: { color: 0x0a0c11, texture: 'smooth', roughness: 1, metalness: 0 } });
        }
      } catch (e) { /* a stage without a floor still shows the man */ }
    }

    function drop() {
      if (sub && sub.destroy) { try { sub.destroy(); } catch (e) { /* gone */ } }
      sub = null; kind = null; id = null;
    }

    function attach(g) {
      if (!g || game === g) return;
      game = g;
      stageFloor();
      if (!hook && game.onLateUpdate) {
        /* LATE, so the turn is applied after the animator has run and
           before the frame is built. An update hook runs before the
           actors are posed and anything written there is overwritten
           by the pose. */
        hook = function (dt) { tick(dt); };
        game.onLateUpdate(hook);
      }
    }

    /* Each of them arrives differently. Not a different animation --
       there is one walk -- but a different APPROACH: how far back he
       starts, how fast he closes, and what he does when he gets there.
       Seven men who all walk in identically from the same mark is one
       man seven times, which is the note this whole roster exists to
       answer. */
    var ENTRY = {
      destroyer: { back: 3.2, speed: 1.35, settle: 'idleCheck', turn: -0.22 },
      charlie: { back: 2.6, speed: 1.15, settle: 'idleGlance', turn: 0.15 },
      delta: { back: 2.9, speed: 1.22, settle: 'idleShift', turn: 0 },
      alpha: { back: 3.4, speed: 1.05, settle: 'idleGlance', turn: 0.30 },
      abscess: { back: 2.4, speed: 0.92, settle: 'idleShift', turn: -0.34 },
      biohazard: { back: 3.0, speed: 0.86, settle: 'idleCheck', turn: 0.10 },
      swat: { back: 2.7, speed: 1.42, settle: 'idleShift', turn: -0.12 },
    };

    function showOperator(opId) {
      if (!game || !game.operator) return null;
      if (kind === 'op' && id === opId) return sub;
      drop();
      var e = ENTRY[opId] || ENTRY.delta;
      sub = game.operator(opId, {
        at: [0, FLOOR + 0.95, -e.back], name: 'stage-' + opId, face: 'static',
        speed: 4.6, runSpeed: 6.4,
      });
      if (!sub) return null;
      kind = 'op'; id = opId;
      entry = 1; clock = 0; next = 2.0 + Math.random() * 2.5;
      wantYaw = haveYaw = e.turn;
      if (sub.controller) {
        sub.controller.autoAnimate = false;
        sub.controller.facing = haveYaw;
      }
      if (sub.animator) { sub.animator.play('walk', 0.12); sub.animator.speed = e.speed; }
      sub.__entry = e;
      sub.__z = -e.back;
      return sub;
    }

    /* A weapon, turning slowly, for the loadout. Same stage, same
       camera, so hovering a gun and picking an operator cost the same
       nothing. */
    function showGun(gunId) {
      if (!game || !game.serviceArm) return null;
      if (kind === 'gun' && id === gunId) return sub;
      drop();
      try {
        sub = game.serviceArm(gunId, { at: [0, FLOOR + 1.25, 0], physics: false });
      } catch (e) { sub = null; }
      if (!sub) return null;
      kind = 'gun'; id = gunId;
      entry = 0; clock = 0; haveYaw = wantYaw = 0;
      return sub;
    }

    function turn(delta) { wantYaw += delta; }
    function faceTo(yaw) { wantYaw = yaw; }

    function tick(dt) {
      if (!sub || !game) return;
      clock += dt;
      /* EVERY FRAME, not once when the screen opened. The game owns
         this camera and moves it for its own reasons; pointing it at
         the stage a single time means it is pointed somewhere else by
         the next frame. */
      if (held) look(held);

      if (kind === 'gun') {
        /* Turned on the spot, slowly, so you can see the far side of
           it without asking. */
        haveYaw += dt * 0.55;
        if (sub.rotation && sub.rotation.setAxisAngle) {
          sub.rotation.setAxisAngle(_AY, haveYaw);
          sub._still = false;
        }
        return;
      }

      /* ---- walking on ---- */
      if (entry) {
        var e = sub.__entry;
        /* The feet and the floor agree. He covered 1.45 x speed metres a
           second while the walk played at `speed` times its own pace --
           its natural speed is nearer 1.1 m/s, so every operator skated
           in. The clip's rate now comes from how fast he is actually
           going, and he slows over the last stride and a half into his
           mark instead of arriving at full pace and stopping dead. */
        var base = 1.45 * e.speed;
        var v = base * Math.max(0.3, Math.min(1, -sub.__z / 0.65));
        sub.__z += dt * v;
        if (sub.animator) {
          var wc = sub.animator.clips.get('walk');
          sub.animator.speed = wc && wc.stride && window.LE && window.LE.gaitRate
            ? window.LE.gaitRate(wc, v) : e.speed;
        }
        if (sub.__z >= -0.02) {
          sub.__z = 0;
          entry = 0;
          if (sub.animator) { sub.animator.speed = 1; sub.animator.play(e.settle, 0.22); }
          next = clock + 1.4 + Math.random() * 2.0;
        }
      } else if (sub.animator) {
        /* ---- and then not standing still ---- */
        /* `current` is the CLIP, not its name, and a non-looping clip
           reports no `finished` flag -- it simply clamps at its own
           duration. So "is it still busy" is asked of the clock
           against the clip's length, which is the only thing that
           actually knows. */
        var a = sub.animator;
        var now = a.current ? a.current.name : null;
        var fidget = FIDGETS.indexOf(now) >= 0;
        var busy = fidget && a.time < a.current.duration;
        if (busy) { /* let it finish */ }
        else if (fidget) { a.play('idle', 0.3); next = clock + 3.5 + Math.random() * 5.0; }
        else if (clock >= next) {
          a.play(FIDGETS[(Math.random() * FIDGETS.length) | 0], 0.25);
        }
      }

      /* HELD ON THE STAGE, every frame.
       *
         The stage floor is decoration -- physics: false -- so there is
         nothing under him to stand on, and the controller's own
         recovery for a body that has left the world put him forty
         metres above the camera. Measured: camera at -398.7, subject
         at -358.6, which is why the first working version of this
         showed an empty stage and the zombies map behind it.

         Teleported every frame, so nothing the physics believes about
         him matters. */
      if (sub.controller && sub.controller.teleport) {
        sub.controller.teleport([0, FLOOR + (sub.controller.height || 1.78) * 0.5, sub.__z || 0]);
      }

      /* ---- turning, at the speed a man turns ---- */
      var d = wantYaw - haveYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      var step = TURN_RATE * dt;
      haveYaw += Math.max(-step, Math.min(step, d));
      if (sub.controller) sub.controller.facing = haveYaw;

      /* A man who is being turned looks where he is going. */
      if (Math.abs(d) > 0.25 && sub.animator && !entry) {
        var cn = sub.animator.current ? sub.animator.current.name : null;
        if (cn && cn !== 'idle' && FIDGETS.indexOf(cn) >= 0) sub.animator.play('idle', 0.2);
      }
    }

    /* The camera, while a menu is open. Framed on the chest so the
       face and the kit are both readable, and offset left so the man
       sits in the right-hand third of the screen with the list beside
       him. */
    function look(opts) {
      if (!game || !sub) return;
      opts = opts || held || {};
      held = opts;
      /* FRAMED HEAD TO TOE, AND OFF TO ONE SIDE.
       *
         The camera sits square on and the TARGET is pushed sideways,
         which slides the subject across the picture without turning
         him away from the lens -- offsetting the camera instead swings
         him into three-quarter view and shows the back of his arm.

         2.6m at this field of view puts a 1.8m man across about two
         thirds of the frame height, which is head to toe with air
         above and below rather than a man cut off at the waist. */
      var side = opts.side != null ? opts.side : -0.52;
      var y = kind === 'gun' ? FLOOR + 1.25 : FLOOR + 0.98;
      var dist = kind === 'gun' ? (opts.dist || 0.95) : (opts.dist || 2.60);
      if (!keepCam) {
        keepCam = {
          px: game.camera.position.x, py: game.camera.position.y, pz: game.camera.position.z,
          tx: game.camera.target.x, ty: game.camera.target.y, tz: game.camera.target.z,
        };
      }
      game.lookAt([0, y + (kind === 'gun' ? 0.12 : 0.12), dist], [side, y, 0]);
    }

    function release() {
      held = null;
      drop();
      if (keepCam && game) {
        game.lookAt([keepCam.px, keepCam.py, keepCam.pz], [keepCam.tx, keepCam.ty, keepCam.tz]);
      }
      keepCam = null;
    }

    return {
      attach: attach,
      showOperator: showOperator,
      showGun: showGun,
      turn: turn,
      faceTo: faceTo,
      look: look,
      release: release,
      get subject() { return sub; },
      get kind() { return kind; },
      get id() { return id; },
      get facing() { return haveYaw; },
      get target() { return wantYaw; },
      get entering() { return !!entry; },
      _tick: tick,
    };
  }

  W.MENU_STAGE = makeStage();
})();
