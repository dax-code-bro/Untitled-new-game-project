/* ============================================================
   SURVIVOR — the playable layer.

   Two libraries do the work: LE (the Legend engine) draws and
   simulates rigid bodies, and SV (Survivor) is the world — terrain,
   physiology, disease, ballistics, ecology, weather. This file is
   the seam between them, and deliberately holds no simulation of
   its own: every number on the HUD is read out of SV, never
   computed here, so what the player sees is what the model says.
   ============================================================ */
(function () {
  'use strict';

  const boot = document.getElementById('boot');
  const bar = document.querySelector('#bar i');
  const bootMsg = document.getElementById('bootMsg');
  const bootStats = document.getElementById('bootStats');
  const startBtn = document.getElementById('startBtn');

  const el = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => Number(n).toFixed(d);

  let world, game, player, avatar;
  let renderedAnimals = new Map();
  let logLines = [];

  /* ---------------- world generation ---------------- */

  function setProgress(p, what) {
    bar.style.width = `${Math.round(p * 100)}%`;
    bootMsg.textContent = what;
  }

  function generate() {
    // Yield to the browser between stages so the progress bar actually
    // moves. Generation is a few seconds of real arithmetic — erosion is
    // 75,000 droplet paths — and a frozen tab with a stuck bar is worse
    // than a slow one that is visibly working.
    const stages = [
      ['raising the island', () => {
        world = new SV.World({ seed: pickSeed(), mode: SV.GAME_MODE.singleplayer });
      }],
      ['carving it with water', () => {
        world.generate({}, (p, what) => setProgress(0.05 + p * 0.85, what));
      }],
      ['opening the map', () => {
        const d = world.describe();
        bootStats.innerHTML = [
          `${d.sizeKm} km island &middot; ${fmt(d.elevation.max)} m at the summit &middot; ${d.rivers} rivers`,
          `${d.animals} animals of ${d.species} species &middot; ${d.fish} fish &middot; ${d.feedingZones} feeding zones`,
          `${d.pois.length} places: ${d.pois.map((p) => p.name).join(' &middot; ')}`,
        ].join('<br>');
      }],
    ];

    let i = 0;
    const next = () => {
      if (i >= stages.length) {
        setProgress(1, 'ready');
        startBtn.hidden = false;
        return;
      }
      const [label, fn] = stages[i++];
      setProgress(0.03 + (i / stages.length) * 0.9, label);
      requestAnimationFrame(() => { fn(); requestAnimationFrame(next); });
    };
    next();
  }

  function pickSeed() {
    const q = new URLSearchParams(location.search).get('seed');
    if (q && /^\d+$/.test(q)) return parseInt(q, 10);
    return SV.ISLAND_DEFAULTS.seed;
  }

  /* ---------------- the scene ---------------- */

  /* The Survivor terrain drives the engine's ground, which since the
     heightfield collider landed means the surface being drawn and the
     surface being stood on are the same surface. */
  function buildScene() {
    const map = world.map;
    const spawn = world.chooseSpawn(new URLSearchParams(location.search).get('spawn'));

    game = LE.create({
      sky: 'dawn', gravity: -9.80665, quality: qualityFromUrl(),
      /* The engine's default far plane is 500 m, which is right for a scene
         you can see all of at once and hopeless for a four-kilometre island:
         everything past the next ridge was being clipped, which is why the
         sea never appeared. Near is pulled back from 0.1 to 0.25 to keep the
         depth buffer's precision usable across the much longer range —
         nothing the player can look at is closer than that anyway. */
      camera: { near: 0.25, far: 5200, fov: 62 },
    });
    game.renderer.post.exposure = 1.05;
    game.renderer.post.bloom = 0.35;
    game.renderer.shadows.distance = 140;

    /* Ground cover, straight off the classification the terrain generator
       already produced. Beach where the drainage meets the sea, meadow on
       the deep soil, forest where it is deep and wet, bare rock where the
       slope is too steep to hold anything — all of it derived rather than
       painted, so the surface the player sees is a readout of the same
       fields the animals are foraging on. */
    const BIOME_COLOUR = {
      /* Albedos, not screen colours. Real ground reflects far less light
         than people expect — dry grass is about 0.20, a conifer canopy 0.08,
         wet sand 0.25 — and under a 3.5-intensity sun anything brighter
         blows out to white. These are roughly the published values. */
      ocean: [0.03, 0.06, 0.09], beach: [0.34, 0.30, 0.22], dune: [0.31, 0.28, 0.20],
      saltMarsh: [0.15, 0.17, 0.10], freshMarsh: [0.12, 0.16, 0.08],
      riverbank: [0.14, 0.18, 0.10], meadow: [0.12, 0.19, 0.06],
      prairie: [0.21, 0.22, 0.09], woodland: [0.07, 0.12, 0.05],
      deepForest: [0.035, 0.075, 0.033], pineForest: [0.04, 0.09, 0.06],
      scrub: [0.15, 0.15, 0.08], rockyHill: [0.15, 0.14, 0.12],
      scree: [0.18, 0.17, 0.15], cliff: [0.12, 0.115, 0.105],
      alpine: [0.22, 0.23, 0.21],
    };
    const S = map.size;
    const groundColour = (x, z, y, slopeDeg) => {
      const c = Math.max(0, Math.min(S - 1, Math.round((x / map.worldSizeM + 0.5) * (S - 1))));
      const r = Math.max(0, Math.min(S - 1, Math.round((z / map.worldSizeM + 0.5) * (S - 1))));
      const b = world.classified.at(c, r);
      const base = (b && BIOME_COLOUR[b.id]) || BIOME_COLOUR.meadow;
      // Steep faces shed their cover and show the rock underneath, whatever
      // the biome says — which is why a forested hillside still has grey
      // scars down its gullies.
      const bare = Math.max(0, Math.min(1, (slopeDeg - 30) / 22));
      const rock = BIOME_COLOUR.cliff;
      // A little variation with height so a large expanse of one biome does
      // not read as a painted sheet.
      const t = 0.94 + 0.12 * (Math.sin(x * 0.017) * Math.cos(z * 0.021) * 0.5 + 0.5);
      return [
        (base[0] * (1 - bare) + rock[0] * bare) * t,
        (base[1] * (1 - bare) + rock[1] * bare) * t,
        (base[2] * (1 - bare) + rock[2] * bare) * t,
      ];
    };

    game.ground({
      material: 'terrain',
      colorFn: groundColour,
      colorSeed: world.seed,
      size: map.worldSizeM,
      // Roughly eight metres a cell over four kilometres. Enough for the
      // shape of the island and every slope the player walks; the fine
      // detail comes from materials and grass rather than from geometry
      // the GPU would have to keep resident across sixteen square
      // kilometres.
      segments: 512,
      heightFn: (x, z) => map.heightAtWorld(x, z),
      friction: 0.85,
      at: [0, 0, 0],
      /* One texture tile every twelve metres or so. At 0.7 the detail map
         repeated nearly three thousand times across the island and aliased
         into a uniform speckle that washed the ground cover out to white —
         the tint was there all along, buried under moire. */
      uvScale: 0.08,
    });

    /* The sea. A slab rather than a simulated surface — the engine's fluid
       solver is a bathtub, not an ocean, and this is the edge of the world
       rather than something to swim in.

       The uv scale is the thing that matters: at the default the ripple
       normal map repeats tens of thousands of times across eight kilometres
       and tears itself into horizontal moire bands. One tile every hundred
       metres or so, with the bump pulled right down, gives a surface that
       reads as water at a distance and does not shimmer. */
    game.box({
      // Far wider than the island and wider than the far plane, so its own
      // edge is clipped away rather than drawn as a dark line across the
      // horizon.
      at: [0, -0.6, 0], size: [map.worldSizeM * 7, 1.2, map.worldSizeM * 7],
      material: {
        preset: 'ice', color: 0x0d2f45, roughness: 0.12, metalness: 0.02, opacity: 1,
        uvScale: 0.010, normalStrength: 0.18,
      },
      static: true, physics: false,
    });

    // Grass, centred where the player is standing, moved as they walk.
    game.addGrass({
      area: 110, max: 46000, center: [spawn.x, spawn.y, spawn.z],
      heightFn: (x, z) => map.heightAtWorld(x, z),
    });

    avatar = game.character({ at: [spawn.x, spawn.y + 1.2, spawn.z], color: 0x4a4f3f });
    game.firstPerson(avatar, { eyeHeight: 1.62 });

    const join = world.join('local', { name: 'you', spawn });
    player = join.player;
    player.x = spawn.x; player.y = spawn.y; player.z = spawn.z;

    log(`You wash up on the ${spawn.side} shore.`, true);
    const nearest = nearestPoi(spawn.x, spawn.z);
    if (nearest) {
      log(`${nearest.name} is ${fmt(nearest.dist / 1000, 1)} km ${bearingWord(spawn.x, spawn.z, nearest.x, nearest.z)}.`);
    }
    log('You have no water, no food and no shelter.');
    return spawn;
  }

  function qualityFromUrl() {
    const q = new URLSearchParams(location.search).get('quality');
    return ['low', 'medium', 'high', 'ultra'].includes(q) ? q : undefined;
  }

  function nearestPoi(x, z) {
    let best = null;
    for (const p of world.pois) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.dist) best = { name: p.name, x: p.x, z: p.z, dist: d, poi: p };
    }
    return best;
  }

  const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function bearingWord(fromX, fromZ, toX, toZ) {
    const a = Math.atan2(toX - fromX, -(toZ - fromZ));
    const i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
    return COMPASS[i];
  }

  /* ---------------- animals ----------------

     The engine carries four sculpted, fur-shelled quadrupeds; Survivor
     knows twenty species. Each is drawn with the closest archetype,
     scaled to its real shoulder height from the species table, so an elk
     and a whitetail are visibly different animals and a coyote is not the
     size of a wolf. Species that have not been sculpted yet borrow a body
     rather than not appearing — the alternative is an island with nothing
     on it but deer.                                                       */
  const ARCHETYPE = {
    ungulate: 'deer', bear: 'bear', felid: 'lion', canid: 'lion',
    lagomorph: 'rabbit', rodent: 'rabbit', marsupial: 'rabbit',
    procyonid: 'rabbit', suid: 'bear', bird: 'rabbit',
  };

  function syncAnimals() {
    // Only what is close enough to see. The rest of the five hundred are
    // still being simulated; they simply have no geometry.
    /* Render radius scales with the animal: an elk is worth drawing at two
       hundred metres and a squirrel is not visible at forty. Cheaper than a
       flat radius and it looks better, because the big animals that give a
       landscape its sense of scale are the ones that stay drawn. */
    const candidates = world.ecology.near(player.x, player.z, 220);
    const visible = candidates.filter((a) => {
      const d = Math.hypot(a.x - player.x, a.z - player.z);
      return d < 40 + a.shoulderHeightM * 150;
    }).slice(0, 60);
    const keep = new Set();

    for (const a of visible) {
      keep.add(a.id);
      if (renderedAnimals.has(a.id)) continue;
      const archetype = ARCHETYPE[a.species.class] || 'deer';
      const spec = LE.ANIMAL_SPECIES[archetype];
      // Match the real animal's shoulder height rather than using a size
      // bucket, so the scale on screen is the scale in the data.
      const scaleMul = spec ? a.shoulderHeightM / spec.shoulder : 1;
      try {
        const beast = new LE.Animal(game, {
          species: archetype,
          sex: a.male ? 'male' : 'female',
          at: [a.x, a.y, a.z],
          scaleMul: Math.max(0.25, Math.min(3.2, scaleMul)),
          groundY: (x, z) => world.map.heightAtWorld(x, z),
          seed: a.id * 977,
        });
        renderedAnimals.set(a.id, { beast, sim: a });
      } catch (err) {
        // A species the engine cannot build should not take the frame down.
        renderedAnimals.set(a.id, { beast: null, sim: a });
      }
    }

    for (const [id, rec] of renderedAnimals) {
      if (keep.has(id)) continue;
      if (rec.beast && rec.beast.actor) rec.beast.actor.destroy();
      renderedAnimals.delete(id);
    }
  }

  function driveAnimals(dt) {
    for (const rec of renderedAnimals.values()) {
      const { beast, sim } = rec;
      if (!beast || !sim.alive) continue;
      // The simulation owns where the animal is and what it is doing; the
      // engine's animal owns how that looks. Position is pushed across
      // every frame rather than the engine's own wander being used, so the
      // deer you are stalking is the deer the ecology thinks it is.
      beast.x = sim.x; beast.z = sim.z;
      beast.yaw = sim.heading;
      beast.speed = sim.speedMs;
      beast.state = sim.behaviour === 'fleeing' || sim.behaviour === 'chasing' ? 'run'
        : sim.behaviour === 'grazing' || sim.behaviour === 'browsing' ? 'graze'
        : sim.behaviour === 'bedded' ? 'idle' : 'walk';
    }
  }

  /* ---------------- the loop ---------------- */

  let lastGrassCentre = null;
  let lastWallMs = 0;
  let wallDebt = 0;
  let timeScaleMul = 1;
  let paused = false;

  function start() {
    boot.style.opacity = '0';
    setTimeout(() => { boot.style.display = 'none'; }, 800);
    for (const id of ['hud', 'crosshair', 'compass', 'help']) el(id).hidden = false;

    game.onUpdate((dt) => {
      if (paused) return;
      const i = game.input;

      /* --- movement, and what it costs ---
         Speed and slope are handed to the physiology, which charges for
         them through the Pandolf equation. Running uphill with a full pack
         is expensive here for the same reason it is expensive in life. */
      const sprint = i.down('shift');
      const crouch = i.down('c');
      const moving = Math.abs(i.axes.x) > 0.05 || Math.abs(i.axes.y) > 0.05;
      const capacity = player.capacity();
      const baseSpeed = crouch ? 1.0 : sprint ? 4.2 : 1.45;
      const speed = moving ? baseSpeed * (0.35 + 0.65 * capacity) : 0;

      avatar.controller.move(i.axes.x, -i.axes.y, sprint && capacity > 0.35);
      if (i.justPressed(' ') && capacity > 0.3) avatar.controller.jump();

      const px = avatar.position.x, pz = avatar.position.z;
      // Grade under the feet, from the terrain the collider is using.
      // Grade along the direction of travel, which is what the metabolic
      // cost actually depends on — walking across a slope is cheap and
      // walking up it is not.
      const ahead = 3;
      const yaw = game._camYaw != null ? game._camYaw : 0;
      const h0 = world.map.heightAtWorld(px, pz);
      const h1 = world.map.heightAtWorld(px + Math.sin(yaw) * ahead, pz + Math.cos(yaw) * ahead);
      player.gradePercent = moving ? ((h1 - h0) / ahead) * 100 : 0;
      player.speedMs = speed;
      player.stance = crouch ? 'crouched' : 'standing';
      player.x = px; player.y = avatar.position.y; player.z = pz;
      // Sprinting through brush is loud, and every animal within earshot
      // is told so by the detection model.
      player.noise = sprint ? 0.85 : crouch ? 0.06 : moving ? 0.3 : 0.02;
      player.concealment = crouch ? 0.55 : 0.15;

      /* The world runs on the wall clock, not on the engine's frame delta.

         The engine clamps dt to 0.1 s so that a stalled frame cannot make
         the physics solver explode, which is right for physics and wrong
         for everything else here: on a slow machine the day/night cycle,
         the weather and the player's own body would all quietly run at a
         fraction of real time, and the game would be easier the worse your
         computer is. Long-timescale simulation gets the real elapsed
         seconds; only the collision solver gets the clamped ones.

         Still capped, at a quarter of a second, so that coming back to a
         backgrounded tab advances the world smoothly rather than in one
         enormous step. */
      const now = performance.now();
      wallDebt += (now - lastWallMs) / 1000;
      lastWallMs = now;
      // Anything past a couple of seconds is a backgrounded tab rather than
      // a slow frame, and replaying it is neither wanted nor affordable.
      if (wallDebt > 2.5) wallDebt = 2.5;

      /* Spend the debt in bounded chunks and carry the remainder to the next
         frame. Simply clamping each frame's delta — which is what the engine
         does for its physics, and rightly — quietly loses time whenever the
         frame rate drops, so the day/night cycle, the weather and the
         player's own body all run slower the worse the machine is. Carrying
         the remainder means the world keeps real time no matter what the
         renderer is managing. */
      let budget = 4;
      while (wallDebt > 1e-4 && budget-- > 0) {
        const slice = Math.min(wallDebt, 0.25);
        wallDebt -= slice;
        world.step(slice * timeScaleMul);
      }
      // If the machine is so far behind that four slices could not clear it,
      // drop the rest rather than spiralling.
      if (budget <= 0) wallDebt = 0;
      if (!player.body.alive) return onDeath();

      syncAnimals();
      driveAnimals(dt);
      applySky();
      moveGrass();
      updateHud();
    });

    lastWallMs = performance.now();
    wallDebt = 0;
    game.start();
    bindKeys();

    // Exposed for the browser test and for anyone poking at it in a console.
    window.SURVIVOR = { world, game, player, log };
  }

  /* Drive the engine's sun from Survivor's solar position rather than from
     a rotating light: real declination and hour angle, so shadows point
     where they should and the light at dawn is the low, long, orange light
     it actually is. */
  function applySky() {
    const clock = world.clock;
    const sun = clock.sun();
    const r = game.renderer;
    r.sun.direction.set(sun.direction.x, sun.direction.y, sun.direction.z).normalize();

    /* The sky preset has to be chosen first: setSky writes the sun colour,
       intensity and fog density from its own table, so anything set before
       it is thrown away. Preset first, then the real sun over the top. */
    if (clock.lightLevel() < 0.2) game.setSky('night');
    else if (sun.altitudeDeg < 8) game.setSky('dawn');
    else if (clock.weather.cloudCover > 0.7) game.setSky('overcast');
    else game.setSky('day');

    const elev = Math.sin((sun.altitudeDeg * Math.PI) / 180);
    const day = Math.max(0, Math.min(1, elev * 2 + 0.15));
    const w = world.clock.weather;
    const overcast = 1 - 0.72 * w.cloudCover;

    r.sun.intensity = (0.06 + 3.7 * day) * overcast;
    r.sky.intensity = (0.10 + 0.95 * Math.max(0, Math.min(1, elev * 3 + 0.2)))
      * (0.45 + 0.55 * overcast);
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
  // kilometres with it, the field is picked up and put down around the
  // player whenever they walk out of it.
  function moveGrass() {
    if (!game.grass || typeof game.grass.recenter !== 'function') return;
    // Move it well before the player reaches the edge of the field, so the
    // re-scatter never happens in view.
    game.grass.recenter(
      [player.x, world.map.heightAtWorld(player.x, player.z), player.z],
      { minMoveM: 34 },
    );
  }

  /* ---------------- interaction ---------------- */

  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'f') drink();
      if (k === 'r') rest();
      if (k === 'e') interact();
      if (k === 't') {
        timeScaleMul = timeScaleMul === 1 ? 8 : timeScaleMul === 8 ? 40 : 1;
        log(`Time ×${timeScaleMul}.`);
      }
      if (k === 'p') { paused = !paused; log(paused ? 'Paused.' : 'Running.'); }
    });
  }

  function nearWater() {
    for (const b of world.fishery.bodies) {
      if (Math.hypot(b.x - player.x, b.z - player.z) < b.radiusM + 12) return b;
    }
    return world.map.heightAtWorld(player.x, player.z) < 1.6 ? { name: 'the sea', kind: 'salt' } : null;
  }

  function drink() {
    const b = nearWater();
    if (!b) return log('No water within reach.');
    if (b.kind === 'salt') {
      // Drinking seawater costs more water than it provides. The
      // physiology handles that; the log just tells you what you did.
      player.body.drink(0.5, { salinityGL: 35 });
      log('You drink from the sea. It is a mistake and you know it.', true);
      return;
    }
    player.body.drink(0.7);
    // Untreated surface water is how most of the disease table gets in.
    const caught = player.disease.expose(SV.VECTOR.untreatedWater, { hygiene: 0 });
    log(`You drink from ${b.name}. It is not clean.`, true);
    if (caught.length) {
      // The player is never told what they caught — only, eventually,
      // what it is doing to them.
      log('Something in it went down with the water.');
    }
  }

  function rest() {
    player.body.asleep = !player.body.asleep;
    player.sheltered = player.body.asleep;
    log(player.body.asleep ? 'You lie down.' : 'You get up.', true);
  }

  function interact() {
    const p = nearestPoi(player.x, player.z);
    if (p && p.dist < 260) {
      log(`${p.name}. ${p.poi.blurb}`, true);
      if (!player.knowledge.poisFound.includes(p.name)) player.knowledge.poisFound.push(p.name);
      return;
    }
    const carcass = world.ecology.carcassesNear(player.x, player.z, 6)[0];
    if (carcass) {
      const take = carcass.takeMeat(2);
      log(`You cut ${fmt(take.kg, 1)} kg from the carcass. ${
        take.spoilage > 0.55 ? 'It smells wrong.' : 'It is still good.'}`, true);
      player.body.eat({ kcal: take.kg * 1200, waterL: take.kg * 0.7, dryMassKg: take.kg * 0.3 });
      if (take.toxinRisk > 0.2) player.disease.expose(SV.VECTOR.undercookedMeat, { hygiene: 0.2 });
      return;
    }
    log('Nothing here.');
  }

  function onDeath() {
    paused = true;
    el('vignette').style.boxShadow = 'inset 0 0 400px 120px rgba(0,0,0,.95)';
    log(`You died of ${player.body.causeOfDeath}.`, true);
    el('prompt').hidden = false;
    el('prompt').textContent = `You died of ${player.body.causeOfDeath} on day ${world.clock.totalDays + 1}. Reload for a new world.`;
  }

  /* ---------------- readouts ---------------- */

  function log(text, hot) {
    logLines.unshift({ text, hot, day: world ? world.clock.totalDays + 1 : 1 });
    if (logLines.length > 9) logLines.pop();
    el('logBody').innerHTML = logLines
      .map((l) => `<div class="${l.hot ? 'hot' : ''}">day ${l.day} &middot; ${l.text}</div>`).join('');
  }

  function meter(label, value, invert) {
    const v = Math.max(0, Math.min(1, value));
    const shown = invert ? 1 - v : v;
    const cls = shown < 0.2 ? 'bad' : shown < 0.45 ? 'warn' : '';
    return `<div class="row"><span class="k">${label}</span><span class="v">${Math.round(shown * 100)}</span></div>
            <div class="meter ${cls}"><i style="width:${shown * 100}%"></i></div>`;
  }

  let hudTick = 0;
  function updateHud() {
    // The HUD is not the simulation and does not need to run at its rate.
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
      + meter('capacity', s.capacity);

    const hh = Math.floor(clock.hourOfDay);
    const mm = Math.floor((clock.hourOfDay - hh) * 60);
    el('env').innerHTML = '<h2>the island</h2>'
      + row('day', `${clock.totalDays + 1}`)
      + row('time', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
      + row('season', clock.season)
      + row('sky', w.sky)
      + row('wind', `${fmt(env.windMs, 1)} m/s ${w.wind === 'calm' ? '' : w.trend}`)
      + row('air', `${fmt(env.airTempC, 1)} °C`)
      + row('glass', w.trend)
      + row('altitude', `${fmt(Math.max(0, world.map.heightAtWorld(player.x, player.z)), 0)} m`);

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
    el('statusBody').innerHTML = bits.length
      ? bits.map((b) => `<div>${b}</div>`).join('')
      : '<div class="k">Nothing wrong with you yet.</div>';

    /* Symptoms, never a diagnosis. The player is shown what they can
       observe and has to work out the rest — which is the whole design of
       the disease system. */
    const sym = player.disease.observedSymptoms();
    el('symptoms').innerHTML = sym.length
      ? `<div class="k" style="margin-top:8px">you notice</div>` + sym.slice(0, 4).map((x) => `<div>${x.text}</div>`).join('')
      : '';

    // Compass off the camera's actual facing.
    const yaw = game._camYaw != null ? game._camYaw : 0;
    const deg = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    const card = COMPASS[Math.round(deg / 45) % 8];
    el('compass').innerHTML = `<b>${card.toUpperCase()}</b> &nbsp; ${fmt(deg, 0)}°`;

    el('vignette').style.boxShadow =
      `inset 0 0 ${180 + 260 * (1 - s.capacity)}px ${30 + 70 * (1 - s.capacity)}px rgba(0,0,0,.7)`;
  }

  function row(k, v) {
    return `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  }

  /* ---------------- go ---------------- */

  startBtn.addEventListener('click', () => { buildScene(); start(); });
  generate();
})();
