/* ============================================================
   SURVIVOR — the core.

   Two libraries do the work: LE (the Legend engine) draws and
   simulates rigid bodies, and SV (Survivor) is the world —
   terrain, physiology, disease, ballistics, ecology, weather.
   This file is the seam between them plus a module registry, and
   it deliberately holds no simulation of its own: every number on
   screen is read out of SV, never computed here, so what the
   player sees is what the model says.

   Everything else — buildings, vegetation, hunting, fishing,
   medicine, construction, vehicles, audio — is a module. See
   modules/CONTRACT.md.
   ============================================================ */
(function (global) {
  'use strict';

  const MODULES = [];
  const G = {
    module(def) { MODULES.push(def); return def; },
    modules: MODULES,
  };
  global.SurvivorGame = G;

  const el = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => Number(n).toFixed(d);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  /* ---------------- state ---------------- */

  let world = null, game = null, player = null, avatar = null;
  let ctx = null;
  let running = false, paused = false;
  let lastWallMs = 0, wallDebt = 0, timeScaleMul = 1;
  let FAR_SEGMENTS = 512;
  let groundColourFn = null;
  let detailPatch = null, detailCentre = null;
  const updateHooks = [];
  const keyBindings = [];
  const listeners = new Map();
  const logLines = [];

  /* ---------------- boot ---------------- */

  function setProgress(p, what) {
    const bar = document.querySelector('#bar i');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    const msg = el('bootMsg');
    if (msg) msg.textContent = what;
  }

  function readOptions() {
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.get(k) && /^-?\d+$/.test(q.get(k)) ? parseInt(q.get(k), 10) : d);
    return {
      seed: num('seed', SV.ISLAND_DEFAULTS.seed),
      mode: ['singleplayer', 'multiplayer', 'creative'].includes(q.get('mode'))
        ? q.get('mode') : 'singleplayer',
      spawn: ['north', 'east', 'south', 'west'].includes(q.get('spawn')) ? q.get('spawn') : null,
      quality: ['low', 'medium', 'high', 'ultra'].includes(q.get('quality')) ? q.get('quality') : undefined,
      /* Singleplayer keeps what you were carrying, because dying to a
         mechanic you are still learning and losing four days of work is a
         punishment for the wrong thing. Multiplayer never does: one life to
         a world, and the body stays where it fell with everything on it.
         ?keep=0 turns it off for anyone who wants it off. */
      keepInventory: q.get('keep') != null ? q.get('keep') === '1'
        : q.get('mode') !== 'multiplayer',
      // A smaller island generates in a fraction of the time, which matters
      // when someone is trying the game rather than playing it.
      // 1025 samples over four kilometres is 3.9 m a cell, and generates in
      // a couple of seconds. It is what the collider and the near-field mesh
      // both read, so it sets how much of the island is real rather than
      // interpolated.
      resolution: num('res', 1025),
      droplets: num('erosion', 130000),
    };
  }

  function generate(opts, done) {
    world = new SV.World({
      seed: opts.seed,
      mode: SV.GAME_MODE[opts.mode],
      keepInventory: opts.keepInventory,
    });
    // requestAnimationFrame between stages so the progress bar actually
    // moves — generation is several seconds of real arithmetic and a frozen
    // tab with a stuck bar is worse than a slow one that is visibly working.
    const stages = [
      ['shaping the island', () => {
        world.generate(
          { island: { resolution: opts.resolution, erosionDroplets: opts.droplets } },
          (p, what) => setProgress(0.04 + p * 0.9, what),
        );
      }],
    ];
    let i = 0;
    const next = () => {
      if (i >= stages.length) { setProgress(1, 'ready'); return done(); }
      const [label, fn] = stages[i++];
      setProgress(0.03, label);
      requestAnimationFrame(() => { fn(); requestAnimationFrame(next); });
    };
    next();
  }

  /* ---------------- scene ---------------- */

  const BIOME_ALBEDO = {
    ocean: [0.03, 0.06, 0.09], beach: [0.34, 0.30, 0.22], dune: [0.31, 0.28, 0.20],
    saltMarsh: [0.15, 0.17, 0.10], freshMarsh: [0.12, 0.16, 0.08],
    riverbank: [0.14, 0.18, 0.10], meadow: [0.12, 0.19, 0.06],
    prairie: [0.21, 0.22, 0.09], woodland: [0.07, 0.12, 0.05],
    deepForest: [0.035, 0.075, 0.033], pineForest: [0.04, 0.09, 0.06],
    scrub: [0.15, 0.15, 0.08], rockyHill: [0.15, 0.14, 0.12],
    scree: [0.18, 0.17, 0.15], cliff: [0.12, 0.115, 0.105],
    alpine: [0.22, 0.23, 0.21],
  };

  function buildScene(opts) {
    const map = world.map;
    const spawn = world.chooseSpawn(opts.spawn);

    game = LE.create({
      sky: 'dawn', gravity: -9.80665, quality: opts.quality,
      // The engine's default far plane is 500 m, which is right for a scene
      // you can see all of at once and hopeless for a four-kilometre island.
      /* The near plane has to clear the player's own body. A shoulder
         sits 0.22 m from the eye and a chest is closer still, so at
         0.25 m you look straight through your own arms — they come
         apart into wedges where the plane cuts them. 0.09 m is inside
         everything a body can put in front of its own eyes. */
      camera: { near: 0.09, far: 5200, fov: 62 },
    });
    game.renderer.post.bloom = 0.32;
    game.renderer.shadows.distance = 160;

    const S = map.size;
    const groundColour = (x, z, y, slopeDeg) => {
      const c = Math.max(0, Math.min(S - 1, Math.round((x / map.worldSizeM + 0.5) * (S - 1))));
      const r = Math.max(0, Math.min(S - 1, Math.round((z / map.worldSizeM + 0.5) * (S - 1))));
      const b = world.classified.at(c, r);
      const base = (b && BIOME_ALBEDO[b.id]) || BIOME_ALBEDO.meadow;
      // Steep faces shed their cover and show the rock underneath, whatever
      // the biome says — which is why a wooded hillside still has grey scars
      // down its gullies.
      const bare = clamp01((slopeDeg - 30) / 22);
      const rock = BIOME_ALBEDO.cliff;
      const t = 0.94 + 0.12 * (Math.sin(x * 0.017) * Math.cos(z * 0.021) * 0.5 + 0.5);
      return [
        (base[0] * (1 - bare) + rock[0] * bare) * t,
        (base[1] * (1 - bare) + rock[1] * bare) * t,
        (base[2] * (1 - bare) + rock[2] * bare) * t,
      ];
    };

    /* The far mesh covers the whole island at 7.8 m a vertex, which is the
       most a million-vertex budget will stretch to over sixteen square
       kilometres. The collider runs at twice that resolution because a
       collider sample costs four bytes and a vertex costs sixty, so the
       player walks the real ground rather than the version of it that was
       cheap to draw. The detail patch below then puts the missing resolution
       back where the player can actually see it. */
    FAR_SEGMENTS = 512;
    game.ground({
      material: 'terrain', colorFn: groundColour, colorSeed: world.seed,
      size: map.worldSizeM, segments: FAR_SEGMENTS, colliderSegments: 1024,
      heightFn: (x, z) => map.heightAtWorld(x, z),
      friction: 0.85, at: [0, 0, 0],
      // One texture tile every twelve metres. Higher and the detail map
      // aliases into a uniform speckle that washes the ground cover white.
      uvScale: 0.08,
    });
    groundColourFn = groundColour;

    game.box({
      // Wider than the far plane, so the slab's own edge is clipped away
      // rather than drawn as a dark line across the horizon.
      at: [0, -0.6, 0], size: [map.worldSizeM * 7, 1.2, map.worldSizeM * 7],
      material: {
        preset: 'ice', color: 0x0d2f45, roughness: 0.12, metalness: 0.02, opacity: 1,
        uvScale: 0.010, normalStrength: 0.18,
      },
      static: true, physics: false, name: 'sea',
    });

    /* A tighter field with the same blade budget: 70 m square at 60,000
       blades is about twelve to the square metre, which reads as ground
       cover rather than as a scatter of sprigs. Beyond the field the
       terrain's own colour carries it, and the field moves with the
       player. */
    game.addGrass({
      area: 58, max: 90000, center: [spawn.x, spawn.y, spawn.z],
      // A blade of grass is three to eight millimetres across and a third
      // of a metre tall. At the default five centimetres each one reads as
      // a leek, and thirty of them read as a field of them.
      width: 0.014, height: 0.34,
      heightFn: (x, z) => map.heightAtWorld(x, z),
    });

    avatar = game.character({ at: [spawn.x, spawn.y + 1.2, spawn.z], color: 0x4a4f3f });
    game.firstPerson(avatar, { eyeHeight: 1.62 });

    const join = world.join('local', { name: 'you', spawn });
    player = join.player;
    player.x = spawn.x; player.y = spawn.y; player.z = spawn.z;
    return spawn;
  }

  /* ---------------- the context handed to modules ---------------- */

  function buildContext() {
    const map = world.map;
    const S = map.size;

    return {
      LE, SV, get game() { return game; }, get world() { return world; },
      get player() { return player; }, get avatar() { return avatar; },
      map,

      groundY: (x, z) => map.heightAtWorld(x, z),
      slopeAt: (x, z) => map.slopeAtWorld(x, z),
      biomeAt(x, z) {
        const c = Math.max(0, Math.min(S - 1, Math.round((x / map.worldSizeM + 0.5) * (S - 1))));
        const r = Math.max(0, Math.min(S - 1, Math.round((z / map.worldSizeM + 0.5) * (S - 1))));
        return world.classified.at(c, r);
      },
      /* Where the player is looking, and what is there. Every module that
         needs "the thing in front of me" uses this rather than its own
         raycast, so the interaction target is the same for all of them. */
      aim() {
        const cam = game.camera;
        return { origin: cam.position, direction: cam.forward, right: cam.right, up: cam.trueUp };
      },
      lookedAt(maxDist) {
        const a = this.aim();
        return game.raycast(a.origin, a.direction, maxDist || 6);
      },

      log, toast,
      hud: {
        panel(id, opts) { return makePanel(id, opts); },
        setPrompt(text) {
          const p = el('prompt');
          if (!p) return;
          if (text) { p.textContent = text; p.hidden = false; } else p.hidden = true;
        },
      },

      key(binding, handler, help) { keyBindings.push({ binding, handler, help }); },
      /* Run a binding as though it had been typed. This is what lets a
         controller, a touch button or a menu item reach the same verb the
         keyboard does, without every module having to know those exist. */
      press(binding, ev) {
        const k = String(binding || '').toLowerCase();
        for (const b of keyBindings) {
          if (b.binding !== k) continue;
          try { b.handler(ctx, ev || { key: k, synthetic: true }); }
          catch (err) { console.error(`press ${k}:`, err); }
        }
      },
      get bindings() { return keyBindings; },
      /* What to print for a verb, in the language of whatever the player is
         holding. Modules write prompts through this rather than hard-coding
         a letter, so plugging a pad in relabels the whole HUD. */
      hint(keyName, padName) {
        const p = game && game.input && game.input.pad;
        if (p && p.active && padName) return p.glyph(padName);
        return String(keyName || '').toUpperCase();
      },
      /* A hook is normally frozen with the rest of the world when the game
         pauses. Input is the exception: a menu that pauses the game must
         still be navigable, and a controller that stops responding the
         moment the menu opens is the most obvious jank there is. */
      onUpdate(fn, opts) { updateHooks.push({ fn, whilePaused: !!(opts && opts.whilePaused) }); },
      on(evt, fn) {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt).push(fn);
      },
      emit(evt, data) {
        const list = listeners.get(evt);
        if (!list) return;
        for (const fn of list) {
          // A module that throws in a handler must not take the frame down
          // with it — the game keeps running and the console gets the trace.
          try { fn(data); } catch (err) { console.error(`[${evt}]`, err); }
        }
      },

      state: {},
      get paused() { return paused; },
      setPaused(v) { paused = !!v; },
    };
  }

  /* ---------------- HUD plumbing ---------------- */

  function makePanel(id, opts = {}) {
    let node = el(id);
    if (!node) {
      node = document.createElement('div');
      node.id = id;
      node.className = `panel ${opts.className || ''}`;
      if (opts.style) node.setAttribute('style', opts.style);
      (el('hud') || document.body).appendChild(node);
    }
    return node;
  }

  function log(text, hot) {
    logLines.unshift({ text, hot, day: world ? world.clock.totalDays + 1 : 1 });
    if (logLines.length > 9) logLines.pop();
    const body = el('logBody');
    if (body) {
      body.innerHTML = logLines
        .map((l) => `<div class="${l.hot ? 'hot' : ''}">day ${l.day} &middot; ${escapeHtml(l.text)}</div>`)
        .join('');
    }
  }

  let toastTimer = null;
  function toast(text) {
    const t = el('toast');
    if (!t) return;
    t.textContent = text;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------------- the loop ---------------- */

  const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  function start(opts, spawn) {
    ctx = buildContext();
    global.SURVIVOR = { get world() { return world; }, get game() { return game; },
      get player() { return player; }, ctx, log, toast, modules: MODULES };

    /* Key handling is installed before any module, because listener order is
       what decides who gets Escape. A module's own Escape handler closes its
       sheet; if core ran after that it would see an empty screen and open
       the menu underneath, so one press would close the inventory and open
       the menu. Registering first means core sees the world as it was when
       the key went down. */
    bindKeys();
    bindMouse();

    /* Pause, time and the key list are core's own verbs, but they are
       registered rather than special-cased so that a controller, a touch
       button or a menu item can reach them through ctx.press like anything
       else. */
    ctx.key('p', () => {
      paused = !paused;
      // Coming back from a pause takes the mouse again.
      if (!paused) mouseWanted = true;
      toast(paused ? 'Paused' : 'Running');
    }, 'Pause');
    ctx.key('t', () => {
      timeScaleMul = timeScaleMul === 1 ? 8 : timeScaleMul === 8 ? 40 : 1;
      toast(`Time ×${timeScaleMul}`);
    }, 'Run time faster');
    ctx.key('h', () => { const h = el('help'); if (h) h.hidden = !h.hidden; }, 'Hide the control list');

    for (const m of MODULES.slice().sort((a, b) => (a.order || 50) - (b.order || 50))) {
      try {
        if (m.init) m.init(ctx);
      } catch (err) {
        console.error(`module ${m.id} failed to start:`, err);
        log(`(${m.id} failed to start)`);
      }
    }

    log(`You wash up on the ${spawn.side} shore.`, true);
    const near = nearestPoi(spawn.x, spawn.z);
    if (near) log(`${near.name} is ${fmt(near.dist / 1000, 1)} km ${bearingWord(spawn.x, spawn.z, near.x, near.z)}.`);
    log('You have no water, no food and no shelter.');

    lastWallMs = performance.now();
    wallDebt = 0;
    running = true;

    game.onUpdate((dt) => {
      if (paused) {
        syncMouseCapture();
        lastWallMs = performance.now();
        // Only the hooks that asked to keep running: input, and nothing else.
        for (const h of updateHooks) {
          if (!h.whilePaused) continue;
          try { h.fn(dt, ctx); } catch (err) { console.error('update hook:', err); }
        }
        return;
      }
      syncMouseCapture();
      stepPlayer(dt);
      stepWorld();
      for (const h of updateHooks) {
        try { h.fn(dt, ctx); } catch (err) { console.error('update hook:', err); }
      }
      applySky();
      updateDetailPatch();
      moveGrass();
      updateHud();
    });
    game.start();
  }

  function stepPlayer(dt) {
    const i = game.input;
    /* Sprint and crouch are read as flags rather than as keys so that a
       controller, which has neither a shift key nor a control key, can set
       the same two things without pretending to be a keyboard. */
    const sprint = i.down('shift') || !!ctx.state.sprintHeld;
    const crouch = i.down('control') || i.down('ctrl') || !!ctx.state.crouchHeld;
    const moving = Math.abs(i.axes.x) > 0.05 || Math.abs(i.axes.y) > 0.05;
    const capacity = player.capacity();

    if (!ctx.state.movementLocked) {
      avatar.controller.move(i.axes.x, -i.axes.y, sprint && capacity > 0.35);
      if ((i.justPressed(' ') || ctx.state.jumpRequested) && capacity > 0.3) avatar.controller.jump();
      ctx.state.jumpRequested = false;
    }

    const px = avatar.position.x, pz = avatar.position.z;
    /* Prone is slower than a crouch and a crouch is slower than a walk: a
       stance you cannot move in is the price you pay for the concealment it
       buys, and the ecology's detection model is already reading that
       stance. */
    const prone = ctx.state.stance === 'prone';
    const paceMs = prone ? 0.45 : crouch ? 1.0 : sprint ? 4.2 : 1.45;
    const speed = moving && !ctx.state.movementLocked
      ? paceMs * (0.35 + 0.65 * capacity) : 0;

    // Grade along the direction of travel, which is what the metabolic cost
    // depends on — walking across a slope is cheap and walking up it is not.
    const yaw = game._camYaw != null ? game._camYaw : 0;
    const ahead = 3;
    const h0 = world.map.heightAtWorld(px, pz);
    const h1 = world.map.heightAtWorld(px + Math.sin(yaw) * ahead, pz + Math.cos(yaw) * ahead);

    player.gradePercent = moving ? ((h1 - h0) / ahead) * 100 : 0;
    player.speedMs = speed;
    player.stance = ctx.state.stance || (crouch ? 'crouched' : 'standing');
    player.x = px; player.y = avatar.position.y; player.z = pz;
    // Sprinting through brush is loud, and every animal within earshot is
    // told so by the detection model.
    player.noise = ctx.state.noiseOverride != null ? ctx.state.noiseOverride
      : (sprint ? 0.85 : prone ? 0.02 : crouch ? 0.06 : moving ? 0.3 : 0.02);
    player.concealment = ctx.state.concealment != null ? ctx.state.concealment
      : (prone ? 0.8 : crouch ? 0.55 : 0.15);
    // Shelter is a fraction of the wind stopped; modules that build one say
    // how good it is, and four walls beat a lean-to.
    player.sheltered = ctx.state.shelterQuality || 0;
    player.radiantWatts = player.radiantWatts || 0;
  }

  function stepWorld() {
    /* The world runs on the wall clock, not on the engine's frame delta.

       The engine clamps dt to 0.1 s so a stalled frame cannot make the
       physics solver explode, which is right for physics and wrong for
       everything else here: on a slow machine the day/night cycle, the
       weather and the player's own body would all quietly run at a fraction
       of real time, and the game would be easier the worse your computer is.
       Long-timescale simulation gets the real elapsed seconds; only the
       collision solver gets the clamped ones. */
    const now = performance.now();
    wallDebt += (now - lastWallMs) / 1000;
    lastWallMs = now;
    if (wallDebt > 2.5) wallDebt = 2.5;   // a backgrounded tab, not a slow frame

    let budget = 4;
    while (wallDebt > 1e-4 && budget-- > 0) {
      const slice = Math.min(wallDebt, 0.25);
      wallDebt -= slice;
      world.step(slice * timeScaleMul);
    }
    if (budget <= 0) wallDebt = 0;

    if (!player.body.alive && running) onDeath();
  }

  function applySky() {
    const clock = world.clock;
    const sun = clock.sun();
    const r = game.renderer;
    const w = clock.weather;

    // The sky preset has to be chosen first: setSky writes the sun colour,
    // intensity and fog density from its own table, so anything set before
    // it is thrown away.
    if (clock.lightLevel() < 0.2) game.setSky('night');
    else if (sun.altitudeDeg < 8) game.setSky('dawn');
    else if (w.cloudCover > 0.7) game.setSky('overcast');
    else game.setSky('day');

    const elev = Math.sin((sun.altitudeDeg * Math.PI) / 180);
    const day = clamp01(elev * 2 + 0.15);
    const overcast = 1 - 0.72 * w.cloudCover;

    /* Night. The moon really is five orders of magnitude dimmer than the
       sun, and a renderer that reproduces that faithfully gives you a black
       screen — because the thing it cannot reproduce is the eye, which
       after twenty minutes in the dark is a hundred times more sensitive
       than it was at noon. So the moon is modelled as a real light with a
       real phase and a real direction, at the level a dark-adapted eye
       would see it at: a full moon is enough to walk by and to shoot by at
       close range, and a new moon is not.

       The phase comes from the world clock, so a week of dark nights is a
       week you plan around. */
    const moonLit = clock.moonIllumination() * (1 - w.cloudCover * 0.85);
    const moonUp = elev < 0.08;
    if (moonUp && moonLit > 0.02) {
      // Opposite the sun, roughly, which is where a full moon actually is.
      r.sun.direction.set(-sun.direction.x, Math.max(0.35, -sun.direction.y), -sun.direction.z).normalize();
      r.sun.intensity = 0.10 + 0.42 * moonLit;
      r.sun.color.set(0.62, 0.72, 1.0);
    } else {
      r.sun.direction.set(sun.direction.x, sun.direction.y, sun.direction.z).normalize();
      r.sun.intensity = (0.06 + 3.7 * day) * overcast;
    }
    // Even on a new moon the sky is not black: there is airglow, starlight
    // and whatever the sea is bouncing back.
    r.sky.intensity = Math.max(0.055 + 0.10 * moonLit,
      (0.10 + 0.95 * clamp01(elev * 3 + 0.2)) * (0.45 + 0.55 * overcast));
    if (!(moonUp && moonLit > 0.02)) {
      const warm = 1 - Math.min(1, Math.abs(elev) * 2.2);
      r.sun.color.set(1, 0.94 - 0.32 * warm, 0.86 - 0.52 * warm);
    }

    /* The lower half of the ambient hemisphere is light bounced off the
       ground you are standing on, so it should be the colour of that ground
       rather than a fixed near-black. This is what stops a wall in shade
       from reading as a silhouette: on a clear day a north face is lit
       almost entirely by sky and by bounce off the field in front of it,
       and the field is not black. The biome colours are already published
       albedos, so they are the right number to use. */
    const hereBiome = ctx && ctx.biomeAt ? ctx.biomeAt(player.x, player.z) : null;
    const groundAlbedo = hereBiome && hereBiome.colour != null ? hereBiome.colour : 0x6e8b45;
    /* Bounce is a fraction of the light falling on the ground, not the
       ground itself acting as a lamp — roughly a third of the hemisphere's
       contribution on a clear day. Any more and a wood tints the whole
       frame green. */
    const bounce = (0.10 + 0.42 * day) * overcast;
    r.sky.ground.set(
      (((groundAlbedo >> 16) & 255) / 255) * bounce,
      (((groundAlbedo >> 8) & 255) / 255) * bounce,
      ((groundAlbedo & 255) / 255) * bounce,
    );

    // Fog carries the weather: haze on a clear day, a wall in a fog bank,
    // and rain that closes the island down to a few hundred metres.
    const vis = w.fog > 0.15 ? 40 + 300 * (1 - w.fog)
      : w.precipitation > 1 ? 900 - 500 * Math.min(1, w.precipitation / 18)
      : 3400;
    r.fog.density = 1.6 / vis;

    game.setWind([Math.sin(w.windDirRad), 0, Math.cos(w.windDirRad)],
      Math.min(1.4, w.windMs / 9));
  }

  /* ---------------- near-field terrain detail ----------------

     The island's heightmap holds a sample every 3.9 m; the far mesh draws
     one vertex every 7.8 m. Everything between those two numbers is real
     terrain the player is standing on and cannot see — which is why a
     hillside up close reads as a few big facets.

     So a patch of the same ground is drawn again at the data's own
     resolution, centred on the player and rebuilt when they walk out of it.
     The hard part is the join: a finer mesh of the same surface does not
     agree with a coarser one between their shared vertices, so a naive patch
     shows a seam of overlapping triangles all the way round. The fix is to
     blend the patch's height toward what the far mesh is actually drawing
     over its outer margin, so the two meet exactly at the boundary and the
     extra detail fades in behind it.                                       */

  const DETAIL_HALF = 300;      // metres from the player to the patch edge
  const DETAIL_SEGMENTS = 150;  // 4 m a vertex, matching the data
  const DETAIL_MOVE = 90;       // rebuild once they have walked this far

  /* The height the far mesh is drawing at this point: planar interpolation
     over the triangle of the coarse grid, matching Shapes.terrain's own
     split across the (c,r)-(c+1,r+1) diagonal. */
  function coarseSurface(x, z) {
    const map = world.map;
    const size = map.worldSizeM, seg = FAR_SEGMENTS;
    const fx = (x / size + 0.5) * seg;
    const fz = (z / size + 0.5) * seg;
    let c = Math.floor(fx), r = Math.floor(fz);
    if (c < 0) c = 0; if (r < 0) r = 0;
    if (c > seg - 1) c = seg - 1;
    if (r > seg - 1) r = seg - 1;
    const u = fx - c, v = fz - r;
    const gx = (i) => (i / seg - 0.5) * size;
    const h00 = map.heightAtWorld(gx(c), gx(r));
    const h10 = map.heightAtWorld(gx(c + 1), gx(r));
    const h01 = map.heightAtWorld(gx(c), gx(r + 1));
    const h11 = map.heightAtWorld(gx(c + 1), gx(r + 1));
    return u <= v
      ? h00 + (h11 - h01) * u + (h01 - h00) * v
      : h00 + (h10 - h00) * u + (h11 - h10) * v;
  }

  function rebuildDetailPatch() {
    const map = world.map;
    const cx = player.x, cz = player.z;
    // Snap the centre to the coarse grid so the patch lands on the same
    // vertices the far mesh uses and the two cannot drift apart.
    const cell = map.worldSizeM / FAR_SEGMENTS;
    const sx = Math.round(cx / cell) * cell;
    const sz = Math.round(cz / cell) * cell;

    const g = new LE.Geometry();
    const n = DETAIL_SEGMENTS;
    const step = (DETAIL_HALF * 2) / n;
    const h = step * 0.5;
    const margin = 0.16;        // fraction of the half-width used for the blend

    const height = (x, z) => {
      const dx = Math.abs(x - sx) / DETAIL_HALF;
      const dz = Math.abs(z - sz) / DETAIL_HALF;
      const edge = Math.max(dx, dz);
      // 1 in the middle, falling to 0 at the boundary.
      const t = Math.max(0, Math.min(1, (1 - edge) / margin));
      const blend = t * t * (3 - 2 * t);
      const fine = map.heightAtWorld(x, z);
      return blend >= 1 ? fine : coarseSurface(x, z) + (fine - coarseSurface(x, z)) * blend;
    };

    for (let r = 0; r <= n; r++) {
      const wz = sz - DETAIL_HALF + r * step;
      for (let c = 0; c <= n; c++) {
        const wx = sx - DETAIL_HALF + c * step;
        const y = height(wx, wz);
        const ddx = height(wx + h, wz) - height(wx - h, wz);
        const ddz = height(wx, wz + h) - height(wx, wz - h);
        const nx = -ddx, ny = 2 * h, nz = -ddz;
        const l = Math.hypot(nx, ny, nz) || 1;
        g.vert(wx, y, wz, nx / l, ny / l, nz / l, wx * 0.08, wz * 0.08);
        if (groundColourFn) {
          const slope = Math.acos(Math.min(1, Math.max(-1, ny / l))) * 180 / Math.PI;
          const col = groundColourFn(wx, wz, y, slope);
          g.vertColor(col[0], col[1], col[2]);
        }
      }
    }
    const row = n + 1;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const a = r * row + c;
        g.quad(a, a + row, a + row + 1, a + 1);
      }
    }
    g.finalize();

    if (detailPatch) detailPatch.destroy();
    detailPatch = game.mesh({
      geometry: g,
      // A fresh key each time: the geometry is different every rebuild, so
      // caching it would hand back the previous patch.
      key: `detail:${sx.toFixed(0)}:${sz.toFixed(0)}`,
      material: { preset: 'terrain', vertexColor: true, color: 0xffffff },
      // Purely visual. The heightfield collider is already finer than this.
      physics: false,
      name: 'terrainDetail',
      boundRadius: DETAIL_HALF * 1.5,
    });
    detailPatch.noCull = true;
    detailCentre = [sx, sz];
  }

  function updateDetailPatch() {
    if (!detailCentre) { rebuildDetailPatch(); return; }
    if (Math.hypot(player.x - detailCentre[0], player.z - detailCentre[1]) < DETAIL_MOVE) return;
    rebuildDetailPatch();
  }

  // Grass is a fixed-size field; rather than covering sixteen square
  // kilometres, it is picked up and put down around the player.
  /* How much grass a biome carries, and what colour it is. A dune has
     marram in tufts over open sand; a meadow is a closed sward; a forest
     floor is mostly needle litter. Using the biome's own cover figure means
     these do not have to be kept in step with anything by hand. */
  const GRASS_BY_BIOME = {
    beach:      { count: 1395,   low: 0x9a8f6a, high: 0xc0b183 },
    dune:       { count: 7750,  low: 0x8a8a58, high: 0xb9b478 },
    saltMarsh:  { count: 52700, low: 0x53603a, high: 0x8a9a54 },
    freshMarsh: { count: 62000, low: 0x3d5a2a, high: 0x74933e },
    riverbank:  { count: 58900, low: 0x3a5a26, high: 0x7ea03c },
    meadow:     { count: 90000, low: 0x2f5d24, high: 0x86a83c },
    prairie:    { count: 80600, low: 0x5a6a2e, high: 0xa8ab54 },
    woodland:   { count: 40300, low: 0x2c4a20, high: 0x5f7c30 },
    deepForest: { count: 18600, low: 0x25401d, high: 0x4c6628 },
    pineForest: { count: 13950,  low: 0x2a4024, high: 0x506030 },
    scrub:      { count: 24800, low: 0x5c5f30, high: 0x969247 },
    rockyHill:  { count: 10850,  low: 0x555a34, high: 0x8a8a4e },
    scree:      { count: 1860,  low: 0x60624a, high: 0x8a8a6c },
    alpine:     { count: 21700, low: 0x4e6440, high: 0x87975c },
    cliff:      { count: 620,   low: 0x555a34, high: 0x8a8a4e },
    ocean:      { count: 0,     low: 0x2f5d24, high: 0x86a83c },
  };

  // Grass is a fixed-size field; rather than covering sixteen square
  // kilometres, it is picked up and put down around the player.
  let grassBiome = null;
  function moveGrass() {
    if (!game.grass || typeof game.grass.recenter !== 'function') return;
    const b = ctx && ctx.biomeAt ? ctx.biomeAt(player.x, player.z) : null;
    const spec = (b && GRASS_BY_BIOME[b.id]) || GRASS_BY_BIOME.meadow;
    // Walking from a meadow into a pine wood should change what is under
    // your feet immediately, not thirty-four metres later.
    const changed = b && b.id !== grassBiome;
    if (changed) {
      grassBiome = b.id;
      game.grass.colorLow = LE.Vec3.from([((spec.low >> 16) & 255) / 255, ((spec.low >> 8) & 255) / 255, (spec.low & 255) / 255]);
      game.grass.colorHigh = LE.Vec3.from([((spec.high >> 16) & 255) / 255, ((spec.high >> 8) & 255) / 255, (spec.high & 255) / 255]);
    }
    game.grass.recenter(
      [player.x, world.map.heightAtWorld(player.x, player.z), player.z],
      { minMoveM: changed ? 0 : 34, count: spec.count },
    );
  }

  function nearestPoi(x, z) {
    let best = null;
    for (const p of world.pois) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.dist) best = { name: p.name, x: p.x, z: p.z, dist: d, poi: p };
    }
    return best;
  }

  function bearingWord(fromX, fromZ, toX, toZ) {
    const a = Math.atan2(toX - fromX, -(toZ - fromZ));
    const i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
    return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][i];
  }

  /* ---------------- the mouse ---------------- */

  /* Pointer lock is the difference between a first-person game and a
     diagram you can drag. It has to be released whenever a screen is up
     — you cannot click a button you cannot see a cursor for — and taken
     back the moment play resumes. Browsers only grant it from a user
     gesture, so a click anywhere in the world re-takes it. */
  function syncMouseCapture() {
    if (!game || !game.captureMouse) return;
    const wantFree = paused || ctx.state.uiOpen || ctx.state.benchOpen
      || document.querySelector('.screen:not([hidden])');
    if (wantFree) {
      if (game.mouseCaptured) game.captureMouse(false);
    } else if (!game.mouseCaptured && mouseWanted) {
      game.captureMouse(true);
    }
  }
  let mouseWanted = true;

  function bindMouse() {
    window.addEventListener('mousedown', () => {
      // Clicking back into the world takes the mouse again.
      if (!game || !game.captureMouse) return;
      if (paused || ctx.state.uiOpen || ctx.state.benchOpen) return;
      if (document.querySelector('.screen:not([hidden])')) return;
      mouseWanted = true;
      if (!game.mouseCaptured) game.captureMouse(true);
    });
    document.addEventListener('pointerlockchange', () => {
      /* Escape releases the lock at the browser level without telling
         anyone. Treat that as "the player wants out" so the game does
         not immediately grab it back and trap them. */
      if (game && !game.mouseCaptured && !paused && !ctx.state.uiOpen) mouseWanted = false;
    });
  }

  /* ---------------- input ---------------- */

  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'p' || k === 't' || k === 'h') { /* handled as bindings below */ }

      /* Escape belongs to whatever is on top. A sheet listens for it itself
         and closes; the menu must not then open underneath, which is what
         made one press do two things. The menu marks its own overlay so it
         can still be closed by the same key that opened it. */
      if (k === 'escape') {
        for (const sc of document.querySelectorAll('.screen')) {
          if (!sc.hidden && !sc.dataset.menu) return;
        }
      }

      for (const b of keyBindings) {
        if (b.binding === k) {
          try { b.handler(ctx, e); } catch (err) { console.error(`key ${k}:`, err); }
        }
      }
    });
  }

  /* ---------------- death ---------------- */

  /* Death. In multiplayer it is the end of that world for you and the body
     stays where it fell; in singleplayer the world carries on and you wake
     up on a shore again with what you learned and, by default, what you
     were carrying. The world has already made the replacement player by the
     time this runs, so the job here is to pick it up and put the camera
     back on it. */
  function onDeath() {
    running = false;
    paused = true;
    const cause = player.body.causeOfDeath || 'unknown causes';
    const day = world.clock.totalDays + 1;
    log(`You died of ${cause}.`, true);
    const over = el('gameover');
    const multiplayer = world.mode === 'multiplayer';
    if (over) {
      over.hidden = false;
      el('gameoverCause').textContent = `You died of ${cause} on day ${day}.`;
      el('gameoverDetail').textContent = multiplayer
        ? 'One life to a world. You would rejoin this server as a spectator.'
        : `The island does not reset. Your camp, your fires and everything you built are still there,`
          + ` and so is your body${world.keepInventory ? '' : ' with everything you were carrying on it'}.`;
      const btn = over.querySelector('.btn');
      if (btn) btn.textContent = multiplayer ? 'Start a new world' : 'Wake up on the shore';
    }
    ctx.emit('death', { cause, day, permanent: multiplayer });
  }

  /* Come back. Everything about the world is untouched; only the body is new. */
  function respawn() {
    const fresh = world.players.get('local');
    if (!fresh) { location.reload(); return; }
    player = fresh;
    const y = world.map.heightAtWorld(player.x, player.z);
    avatar.setPosition([player.x, y + 1.4, player.z]);
    avatar.setVelocity([0, 0, 0]);
    const over = el('gameover');
    if (over) over.hidden = true;
    for (const k of Object.keys(ctx.state)) {
      // Anything a module latched while dying — a locked camera, an open
      // sheet, a held interaction — has to let go.
      if (/^(movementLocked|uiOpen|stance|noiseOverride|concealment)$/.test(k)) delete ctx.state[k];
    }
    paused = false;
    running = true;
    log(`Day ${world.clock.totalDays + 1}. You wake on the shore again.`, true);
    ctx.emit('respawn', { player });
  }
  global.SURVIVOR_RESPAWN = respawn;

  /* ---------------- readouts ---------------- */

  let hudTick = 0;
  function meter(label, value, invert) {
    const v = clamp01(value);
    const shown = invert ? 1 - v : v;
    const cls = shown < 0.2 ? 'bad' : shown < 0.45 ? 'warn' : '';
    return `<div class="row"><span class="k">${label}</span><span class="v">${Math.round(shown * 100)}</span></div>
            <div class="meter ${cls}"><i style="width:${shown * 100}%"></i></div>`;
  }
  function row(k, v) {
    return `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  }

  let lastHealth = null;
  let hurtFlash = 0;

  function updateHud() {
    if (hudTick++ % 6) return;
    const clock = world.clock;
    const s = player.body.status(clock.hourOfDay);
    const env = clock.environment();
    const w = clock.weather.describe();

    /* Health first, because it is the one you look at when something has
       just happened to you. It is not a hit-point pool — this game does
       not have one — it is what the body actually has left: blood volume,
       core temperature, pain and the fractures you are carrying, which
       are the four things that kill you here. */
    const inj = player.injury ? player.injury.summary() : { wounds: [], fractures: [], pain: 0, bleedLps: 0 };
    const bleed = Math.min(1, (inj.bleedLps || 0) / 0.004);
    const cold = Math.min(1, Math.abs(s.coreTempC - 37) / 4);
    const broken = Math.min(1, (inj.fractures ? inj.fractures.length : 0) / 3);
    const health = clamp01(1 - Math.max(
      (s.bloodLoss || 0), bleed * 0.5, cold, broken * 0.6, (inj.pain || 0) * 0.5,
    ) * 0.85 - (1 - player.capacity()) * 0.15);
    lastHealth = lastHealth == null ? health : lastHealth;

    el('vitals').innerHTML = '<h2>body</h2>'
      + meter('health', health)
      + meter('water', s.thirst, true)
      + meter('energy', s.energy)
      + meter('rest', s.sleepPressure, true)
      + meter('warmth', 1 - cold)
      + meter('capacity', player.capacity())
      + (inj.wounds && inj.wounds.length
        ? `<div class="k" style="margin-top:6px">${inj.wounds.length} wound${inj.wounds.length > 1 ? 's' : ''}`
          + `${inj.fractures && inj.fractures.length ? `, ${inj.fractures.length} broken` : ''}</div>`
        : '');

    /* A hit registers on the screen, not just in a panel. The flash is
       brief and its depth is how badly you were hurt: a graze is a
       breath of pink at the edge, a femoral bleed is the screen going
       dark red. Underneath it a steady halo says how injured you are
       right now, so it is information rather than only a jolt. */
    if (health < lastHealth - 0.004) hurtFlash = Math.min(1, hurtFlash + (lastHealth - health) * 9 + 0.25);
    lastHealth = lastHealth + (health - lastHealth) * 0.35;
    hurtFlash = Math.max(0, hurtFlash - 0.09);
    const halo = Math.max(hurtFlash, (1 - health) * 0.55);
    const dmg = el('damage');
    if (dmg) {
      if (halo < 0.012) { dmg.style.opacity = '0'; } else {
        /* A ring, drawn as a radial gradient so the centre of the screen
           stays clear. The ring thickens and reddens with the damage:
           a graze is a thin breath of pink at the corners, a femoral
           bleed closes a dark band right in around your sight. */
        const inner = Math.round(62 - halo * 34);          // 62% clear -> 28%
        const r = Math.round(232 - halo * 108);            // pale pink -> dark blood
        const g = Math.round(96 - halo * 84);
        const bl = Math.round(96 - halo * 80);
        const a = Math.min(0.92, 0.18 + halo * 0.82);
        dmg.style.background =
          `radial-gradient(ellipse 78% 88% at 50% 50%, rgba(${r},${g},${bl},0) ${inner}%,`
          + ` rgba(${r},${g},${bl},${(a * 0.45).toFixed(3)}) ${Math.round(inner + (100 - inner) * 0.55)}%,`
          + ` rgba(${r},${g},${bl},${a.toFixed(3)}) 100%)`;
        dmg.style.opacity = '1';
      }
    }

    const hh = Math.floor(clock.hourOfDay);
    const mm = Math.floor((clock.hourOfDay - hh) * 60);
    el('env').innerHTML = '<h2>the island</h2>'
      + row('day', `${clock.totalDays + 1}`)
      + row('time', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
      + row('season', clock.season)
      + row('sky', w.sky)
      + row('wind', `${fmt(env.windMs, 1)} m/s`)
      + row('glass', w.trend)
      + row('air', `${fmt(env.airTempC, 1)} °C`)
      + row('altitude', `${fmt(Math.max(0, world.map.heightAtWorld(player.x, player.z)), 0)} m`)
      + row('here', (ctx.biomeAt(player.x, player.z) || {}).name || '—');

    const bits = [];
    if (s.needsToilet) bits.push(s.urgentToilet ? 'You badly need to relieve yourself.' : 'You need to relieve yourself.');
    if (s.shivering > 0.25) bits.push('You are shivering.');
    if (s.sweatWastedLh > 0.15) bits.push('Sweat is running off you and cooling nothing.');
    if (s.thirst > 0.5) bits.push('Your mouth is dry and your head aches.');
    if (s.hunger > 0.8) bits.push('You are hollow with hunger.');
    if (s.sleepPressure > 0.8) bits.push('You cannot keep your eyes open.');
    if (s.coreTempC < 35.5) bits.push('You are cold to the core.');
    if (s.coreTempC > 39) bits.push('You are burning up.');
    if (player.injury.painLevel > 0.2) bits.push('You are in pain.');
    if (s.bloodLoss > 0.08) bits.push('You are bleeding.');
    for (const extra of (ctx.state.statusLines || [])) bits.push(extra);
    el('statusBody').innerHTML = bits.length
      ? bits.map((b) => `<div>${escapeHtml(b)}</div>`).join('')
      : '<div class="k">Nothing wrong with you yet.</div>';

    // Symptoms, never a diagnosis. The player is shown what they can observe
    // and has to work out the rest, which is the whole design of the disease
    // system.
    const sym = player.disease.observedSymptoms();
    el('symptoms').innerHTML = sym.length
      ? '<div class="k" style="margin-top:8px">you notice</div>'
        + sym.slice(0, 4).map((x) => `<div>${escapeHtml(x.text)}</div>`).join('')
      : '';

    const yaw = game._camYaw != null ? game._camYaw : 0;
    const deg = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    el('compass').innerHTML = `<b>${COMPASS[Math.round(deg / 45) % 8]}</b> &nbsp; ${fmt(deg, 0)}°`;

    /* The vignette carries two things at once: how far gone the body is,
       and how long the breath has been held. Tunnel vision from oxygen
       debt is the real reason a held breath has a clock on it, and it
       belongs on the same element rather than a second one stacked over
       it. */
    const gone = 1 - player.capacity();
    const breath = Math.max(0, Math.min(1, ctx.state.breathStrain || 0));
    const closeIn = Math.max(gone, Math.pow(breath, 2.2) * 0.85);
    el('vignette').style.boxShadow =
      `inset 0 0 ${180 + 260 * closeIn}px ${30 + 110 * closeIn}px rgba(0,0,0,.7)`;
  }

  /* ---------------- entry ---------------- */

  G.boot = function boot() {
    const opts = readOptions();
    const startBtn = el('startBtn');

    generate(opts, () => {
      const d = world.describe();
      const stats = el('bootStats');
      if (stats) {
        stats.innerHTML = [
          `${d.sizeKm} km island &middot; ${fmt(d.elevation.max)} m at the summit &middot; ${d.rivers} rivers`,
          `${d.animals} animals of ${d.species} species &middot; ${d.fish} fish &middot; ${d.feedingZones} feeding zones`,
          `${d.pois.length} places: ${d.pois.map((p) => p.name).join(' &middot; ')}`,
        ].join('<br>');
      }
      if (startBtn) {
        startBtn.hidden = false;

        /* A controller has to be able to start the game. Nothing else is
           running yet — the engine and every module are built by the click
           below — so this polls the pad directly for one button, and stops
           the moment it has been used. */
        let padWatch = 0;
        const padStart = () => {
          if (startBtn.hidden) return;
          let pressed = false;
          try {
            for (const g of (navigator.getGamepads ? navigator.getGamepads() : [])) {
              if (!g) continue;
              for (const b of g.buttons) if (b && (b.pressed || b.value > 0.6)) { pressed = true; break; }
              if (pressed) break;
            }
          } catch (err) { /* no gamepad support here */ }
          if (pressed) { cancelAnimationFrame(padWatch); startBtn.click(); return; }
          padWatch = requestAnimationFrame(padStart);
        };
        padWatch = requestAnimationFrame(padStart);
        const padHint = el('bootMsg');
        if (padHint && navigator.getGamepads) {
          const seen = () => {
            for (const g of (navigator.getGamepads() || [])) if (g) return true;
            return false;
          };
          if (seen()) padHint.textContent = 'Press any button on your controller, or click below.';
        }

        startBtn.addEventListener('click', () => {
          cancelAnimationFrame(padWatch);
          const boot = el('boot');
          boot.style.opacity = '0';
          setTimeout(() => { boot.style.display = 'none'; }, 700);
          for (const id of ['hud', 'crosshair', 'compass', 'help']) {
            const n = el(id);
            if (n) n.hidden = false;
          }
          // The key list is worth reading once and then in the way; H brings
          // it back whenever it is wanted.
          setTimeout(() => { const h = el('help'); if (h) h.hidden = true; }, 25000);
          const spawn = buildScene(opts);
          start(opts, spawn);
          /* Take the mouse. A first-person game where you have to hold a
             button to turn your head is not playable, and the button in
             question is the trigger. This has to happen inside a real
             click, which is exactly what this is. */
          try { game.captureMouse(true); } catch (e) { /* the click below will retry */ }
        }, { once: true });
      }
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
