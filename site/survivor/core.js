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
      keepInventory: q.get('keep') === '1',
      // A smaller island generates in a fraction of the time, which matters
      // when someone is trying the game rather than playing it.
      resolution: num('res', 513),
      droplets: num('erosion', 75000),
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
      camera: { near: 0.25, far: 5200, fov: 62 },
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

    game.ground({
      material: 'terrain', colorFn: groundColour, colorSeed: world.seed,
      size: map.worldSizeM, segments: 512,
      heightFn: (x, z) => map.heightAtWorld(x, z),
      friction: 0.85, at: [0, 0, 0],
      // One texture tile every twelve metres. Higher and the detail map
      // aliases into a uniform speckle that washes the ground cover white.
      uvScale: 0.08,
    });

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

    game.addGrass({
      area: 110, max: 46000, center: [spawn.x, spawn.y, spawn.z],
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
        const dir = new LE.Vec3().subVectors(cam.target, cam.position).normalize();
        return { origin: cam.position, direction: dir };
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
      onUpdate(fn) { updateHooks.push(fn); },
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

    for (const m of MODULES.slice().sort((a, b) => (a.order || 50) - (b.order || 50))) {
      try {
        if (m.init) m.init(ctx);
      } catch (err) {
        console.error(`module ${m.id} failed to start:`, err);
        log(`(${m.id} failed to start)`);
      }
    }

    bindKeys();
    log(`You wash up on the ${spawn.side} shore.`, true);
    const near = nearestPoi(spawn.x, spawn.z);
    if (near) log(`${near.name} is ${fmt(near.dist / 1000, 1)} km ${bearingWord(spawn.x, spawn.z, near.x, near.z)}.`);
    log('You have no water, no food and no shelter.');

    lastWallMs = performance.now();
    wallDebt = 0;
    running = true;

    game.onUpdate((dt) => {
      if (paused) { lastWallMs = performance.now(); return; }
      stepPlayer(dt);
      stepWorld();
      for (const fn of updateHooks) {
        try { fn(dt, ctx); } catch (err) { console.error('update hook:', err); }
      }
      applySky();
      moveGrass();
      updateHud();
    });
    game.start();
  }

  function stepPlayer(dt) {
    const i = game.input;
    const sprint = i.down('shift');
    const crouch = i.down('c');
    const moving = Math.abs(i.axes.x) > 0.05 || Math.abs(i.axes.y) > 0.05;
    const capacity = player.capacity();

    if (!ctx.state.movementLocked) {
      avatar.controller.move(i.axes.x, -i.axes.y, sprint && capacity > 0.35);
      if (i.justPressed(' ') && capacity > 0.3) avatar.controller.jump();
    }

    const px = avatar.position.x, pz = avatar.position.z;
    const speed = moving && !ctx.state.movementLocked
      ? (crouch ? 1.0 : sprint ? 4.2 : 1.45) * (0.35 + 0.65 * capacity) : 0;

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
      : (sprint ? 0.85 : crouch ? 0.06 : moving ? 0.3 : 0.02);
    player.concealment = ctx.state.concealment != null ? ctx.state.concealment
      : (crouch ? 0.55 : 0.15);
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

    r.sun.direction.set(sun.direction.x, sun.direction.y, sun.direction.z).normalize();
    const elev = Math.sin((sun.altitudeDeg * Math.PI) / 180);
    const day = clamp01(elev * 2 + 0.15);
    const overcast = 1 - 0.72 * w.cloudCover;
    r.sun.intensity = (0.06 + 3.7 * day) * overcast;
    r.sky.intensity = (0.10 + 0.95 * clamp01(elev * 3 + 0.2)) * (0.45 + 0.55 * overcast);
    const warm = 1 - Math.min(1, Math.abs(elev) * 2.2);
    r.sun.color.set(1, 0.94 - 0.32 * warm, 0.86 - 0.52 * warm);

    // Fog carries the weather: haze on a clear day, a wall in a fog bank,
    // and rain that closes the island down to a few hundred metres.
    const vis = w.fog > 0.15 ? 40 + 300 * (1 - w.fog)
      : w.precipitation > 1 ? 900 - 500 * Math.min(1, w.precipitation / 18)
      : 3400;
    r.fog.density = 1.6 / vis;

    game.setWind([Math.sin(w.windDirRad), 0, Math.cos(w.windDirRad)],
      Math.min(1.4, w.windMs / 9));
  }

  // Grass is a fixed-size field; rather than covering sixteen square
  // kilometres, it is picked up and put down around the player.
  function moveGrass() {
    if (!game.grass || typeof game.grass.recenter !== 'function') return;
    game.grass.recenter(
      [player.x, world.map.heightAtWorld(player.x, player.z), player.z],
      { minMoveM: 34 },
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

  /* ---------------- input ---------------- */

  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'p') { paused = !paused; toast(paused ? 'Paused' : 'Running'); return; }
      if (k === 't') {
        timeScaleMul = timeScaleMul === 1 ? 8 : timeScaleMul === 8 ? 40 : 1;
        toast(`Time ×${timeScaleMul}`);
        return;
      }
      if (k === 'h') { const h = el('help'); if (h) h.hidden = !h.hidden; return; }
      for (const b of keyBindings) {
        if (b.binding === k) {
          try { b.handler(ctx, e); } catch (err) { console.error(`key ${k}:`, err); }
        }
      }
    });
  }

  /* ---------------- death ---------------- */

  function onDeath() {
    running = false;
    paused = true;
    const cause = player.body.causeOfDeath || 'unknown causes';
    log(`You died of ${cause}.`, true);
    const over = el('gameover');
    if (over) {
      over.hidden = false;
      el('gameoverCause').textContent = `You died of ${cause} on day ${world.clock.totalDays + 1}.`;
      el('gameoverDetail').textContent = world.mode === 'multiplayer'
        ? 'On a server this would be permanent — you would rejoin as a spectator.'
        : 'Reload to try again.';
    }
    ctx.emit('death', { cause });
  }

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

  function updateHud() {
    if (hudTick++ % 6) return;
    const clock = world.clock;
    const s = player.body.status(clock.hourOfDay);
    const env = clock.environment();
    const w = clock.weather.describe();

    el('vitals').innerHTML = '<h2>body</h2>'
      + meter('water', s.thirst, true)
      + meter('energy', s.energy)
      + meter('rest', s.sleepPressure, true)
      + meter('warmth', 1 - Math.min(1, Math.abs(s.coreTempC - 37) / 4))
      + meter('capacity', player.capacity());

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

    el('vignette').style.boxShadow =
      `inset 0 0 ${180 + 260 * (1 - player.capacity())}px ${30 + 70 * (1 - player.capacity())}px rgba(0,0,0,.7)`;
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
        startBtn.addEventListener('click', () => {
          const boot = el('boot');
          boot.style.opacity = '0';
          setTimeout(() => { boot.style.display = 'none'; }, 700);
          for (const id of ['hud', 'crosshair', 'compass', 'help']) {
            const n = el(id);
            if (n) n.hidden = false;
          }
          const spawn = buildScene(opts);
          start(opts, spawn);
        }, { once: true });
      }
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
