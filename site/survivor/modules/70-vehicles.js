/* Horses and cars. Both are simulated in SV — a horse is an animal with an
   aerobic ceiling and an anaerobic reserve it has to stand still to repay,
   and a car is a torque curve through a gearbox against rolling resistance,
   drag and a friction circle. This module is the reins and the pedals.

   The two feel different on purpose and for real reasons. A horse goes
   anywhere and refuses when it is tired or frightened. A car is faster on
   a road and useless off one, needs a battery, needs fuel that has not
   gone off in the two years it has been standing, and announces you to
   every animal within a kilometre.

   Emits: 'mounted' { horse }, 'dismounted', 'vehicle-entered' { vehicle },
   'vehicle-crash' { report }. */
SurvivorGame.module({
  id: 'vehicles',
  order: 70,

  init(ctx) {
    const { LE, SV, game } = ctx;

    const horses = [];
    const cars = [];
    let riding = null;            // { horse, actor }
    let driving = null;           // { vehicle, actor }
    let autoGearTimer = 0;

    /* Real coat colours, at the albedo a coat actually has — a bay is
       darker than most people picture it, and a grey is the only one that
       reads as light. */
    const HORSE_COLOURS = [
      0x6b4a2e,   // bay
      0x332c26,   // black
      0x8a5730,   // chestnut
      0xc2bdb4,   // grey
      0xa88a5c,   // dun
      0xc9a45e,   // palomino
    ];

    /* ---- geometry --------------------------------------------------- */

    /* A horse, built once and instanced. Proportions off a 15.2-hand riding
       horse: 1.55 m at the withers, 2.4 m nose to tail. */
    function horseGeometry() {
      const g = new LE.Geometry();
      const box = (x1, y1, z1, x2, y2, z2, c) => {
        const corners = [
          [x1, y1, z1], [x2, y1, z1], [x2, y2, z1], [x1, y2, z1],
          [x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2],
        ];
        const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
        const norms = [[0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0]];
        faces.forEach((f, fi) => {
          const n = norms[fi], idx = [];
          f.forEach((ci, k) => {
            const p = corners[ci];
            idx.push(g.vert(p[0], p[1], p[2], n[0], n[1], n[2], k === 1 || k === 2 ? 1 : 0, k > 1 ? 1 : 0));
            g.vertColor(c[0], c[1], c[2]);
          });
          g.quad(idx[0], idx[1], idx[2], idx[3]);
        });
      };
      /* Near-white in the geometry: every horse shares one instanced mesh,
         so the coat has to come from the per-actor tint, and a tint
         multiplies. Baking a brown in here and then tinting it brown again
         gives you fourteen black horses. */
      const hide = [0.96, 0.94, 0.90], dark = [0.40, 0.38, 0.36];
      box(-0.32, 0.86, -0.75, 0.32, 1.55, 0.95, hide);        // barrel
      box(-0.26, 1.15, 0.95, 0.26, 1.62, 1.30, hide);         // shoulder
      box(-0.16, 1.35, 1.30, 0.16, 1.70, 1.72, hide);         // neck
      box(-0.13, 1.42, 1.72, 0.13, 1.72, 2.10, hide);         // head
      box(-0.13, 1.30, 1.95, 0.13, 1.48, 2.22, dark);         // muzzle
      for (const [ex, ez] of [[-0.24, 0.82], [0.24, 0.82], [-0.24, -0.62], [0.24, -0.62]]) {
        box(ex - 0.07, 0.0, ez - 0.07, ex + 0.07, 0.9, ez + 0.07, hide);
        box(ex - 0.08, 0.0, ez - 0.10, ex + 0.08, 0.1, ez + 0.06, dark);   // hoof
      }
      box(-0.05, 1.15, -0.95, 0.05, 1.5, -0.72, dark);        // tail
      return g.finalize();
    }
    let horseGeo = null;

    function carGeometry(spec) {
      const g = new LE.Geometry();
      const box = (x1, y1, z1, x2, y2, z2, c) => {
        const corners = [
          [x1, y1, z1], [x2, y1, z1], [x2, y2, z1], [x1, y2, z1],
          [x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2],
        ];
        const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
        const norms = [[0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0]];
        faces.forEach((f, fi) => {
          const n = norms[fi], idx = [];
          f.forEach((ci, k) => {
            const p = corners[ci];
            idx.push(g.vert(p[0], p[1], p[2], n[0], n[1], n[2], k === 1 || k === 2 ? 1 : 0, k > 1 ? 1 : 0));
            g.vertColor(c[0], c[1], c[2]);
          });
          g.quad(idx[0], idx[1], idx[2], idx[3]);
        });
      };
      const paint = [0.35, 0.36, 0.34], glass = [0.16, 0.22, 0.26], rubber = [0.08, 0.08, 0.09];
      const L = spec.type === 'quad' ? 2.0 : spec.type === 'van' ? 5.4 : 5.0;
      const W = spec.type === 'quad' ? 1.2 : 1.85;
      const wheel = spec.wheelRadiusM;
      box(-W / 2, wheel * 0.6, -L / 2, W / 2, wheel * 0.6 + 0.75, L / 2, paint);         // body
      if (spec.type !== 'quad') {
        box(-W / 2 + 0.12, wheel * 0.6 + 0.75, -L / 2 + 0.9, W / 2 - 0.12, wheel * 0.6 + 1.45, L / 2 - 1.5, glass);
      }
      for (const [wx, wz] of [[-W / 2, L / 2 - 1.0], [W / 2 - 0.22, L / 2 - 1.0], [-W / 2, -L / 2 + 1.0], [W / 2 - 0.22, -L / 2 + 1.0]]) {
        box(wx, 0, wz - wheel, wx + 0.22, wheel * 2, wz + wheel, rubber);
      }
      return g.finalize();
    }
    const carGeos = {};

    /* ---- spawning ---------------------------------------------------- */

    /* Horses live where a horse would: open grass with water in reach. They
       are placed deterministically from the world seed so the same island
       has the same herd twice. */
    function spawnHorses() {
      const rng = new LE.Rng((ctx.world.seed || 1) ^ 0x484f5253);
      const size = ctx.world.map.worldSizeM || 4000;
      const breeds = Object.keys(SV.HORSE_BREED);
      let placed = 0, tries = 0;
      while (placed < 14 && tries++ < 600) {
        const x = (rng.next() - 0.5) * size * 0.8;
        const z = (rng.next() - 0.5) * size * 0.8;
        const y = ctx.groundY(x, z);
        if (y < 3 || ctx.slopeAt(x, z) > 14) continue;
        const b = ctx.biomeAt(x, z);
        if (!b || !/prairie|meadow|scrub|woodland/.test(b.id)) continue;
        const h = new SV.Horse({
          breed: rng.pick(breeds), x, y, z, heading: rng.next() * Math.PI * 2,
          wild: rng.next() > 0.25,
        });
        h.colour = HORSE_COLOURS[rng.int(0, HORSE_COLOURS.length - 1)];
        horses.push({ horse: h, actor: null });
        placed++;
      }
      ctx.log(`${placed} horses on the island.`);
    }

    /* Cars are where cars are: on roads, at the gas station, in driveways.
       Every one of them has been standing for a long time, which is why
       almost none of them start. */
    function spawnCars() {
      const rng = new LE.Rng((ctx.world.seed || 1) ^ 0x43415253);
      const types = Object.keys(SV.VEHICLE_SPEC);
      for (const poi of ctx.world.pois || []) {
        const n = poi.kind === 'city' ? 14 : poi.kind === 'neighbourhood' ? 10
          : poi.kind === 'gasStation' ? 4 : poi.kind === 'headquarters' ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = rng.next() * Math.PI * 2;
          const r = (poi.radiusM || 60) * (0.25 + rng.next() * 0.6);
          const x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r;
          if (ctx.slopeAt(x, z) > 18) continue;
          const type = rng.pick(types);
          const v = new SV.Vehicle({
            type, x, y: ctx.groundY(x, z), z, heading: rng.next() * Math.PI * 2,
            // The world ended two years ago and nobody drained anything.
            fuelL: rng.next() < 0.55 ? rng.range(0, 45) : 0,
            fuelAgeDays: 500 + rng.next() * 400,
            hasBattery: rng.next() < 0.4,
            batteryCharge: rng.next() < 0.3 ? rng.range(0.2, 0.9) : rng.range(0, 0.1),
            engineCondition: rng.range(0.25, 0.9),
            oilLevel: rng.range(0.05, 0.9),
            coolantLevel: rng.range(0.05, 0.9),
            tyres: [0, 1, 2, 3].map(() => (rng.next() < 0.22 ? 0 : rng.range(0.4, 1))),
            bodyIntegrity: rng.range(0.3, 0.95),
          });
          cars.push({ vehicle: v, actor: null });
        }
      }
      ctx.log(`${cars.length} vehicles, most of which will not start.`);
    }

    /* ---- streaming --------------------------------------------------- */
    function stream(list, radius, make) {
      const px = ctx.player.x, pz = ctx.player.z;
      for (const rec of list) {
        const o = rec.horse || rec.vehicle;
        const d = Math.hypot(o.x - px, o.z - pz);
        if (d < radius && !rec.actor) rec.actor = make(rec);
        else if (d > radius * 1.3 && rec.actor && rec !== riding && rec !== driving) {
          try { rec.actor.destroy(); } catch (e) { /* gone */ }
          rec.actor = null;
        }
      }
    }

    function makeHorseActor(rec) {
      if (!horseGeo) horseGeo = horseGeometry();
      const h = rec.horse;
      const a = game.mesh({
        geometry: horseGeo, key: 'vehicle:horse', at: [h.x, h.y, h.z],
        material: { preset: 'painted', color: 0xffffff, vertexColor: true, roughness: 0.82, uvScale: 2 },
        collider: 'box', name: h.name,
      });
      a.setTint(h.colour || 0x4a3527);
      a.userData = { kind: 'horse', horse: h, rec };
      return a;
    }

    function makeCarActor(rec) {
      const v = rec.vehicle;
      if (!carGeos[v.type]) carGeos[v.type] = carGeometry(Object.assign({ type: v.type }, v.spec));
      const a = game.mesh({
        geometry: carGeos[v.type], key: `vehicle:${v.type}`, at: [v.x, v.y, v.z],
        material: { preset: 'painted', color: 0xffffff, vertexColor: true, roughness: 0.45, metalness: 0.35, uvScale: 2 },
        collider: 'box', static: true, name: v.name,
      });
      a.setRotation([0, (v.heading * 180) / Math.PI, 0]);
      a.userData = { kind: 'vehicle', vehicle: v, rec };
      return a;
    }

    /* ---- riding ------------------------------------------------------ */

    function mount(rec) {
      const h = rec.horse;
      const r = h.ask('walk', { skill: ctx.player.skills.hunting || 0.2 });
      if (!r.ok) { ctx.log(`${r.reason}. Spend time with it first — stand near it and it will settle.`, true); return; }
      riding = rec;
      h.rider = ctx.player;
      ctx.state.movementLocked = true;
      ctx.log(`Up. ${h.breed.name}, ${h.massKg} kg, carries ${h.carryCapacityKg.toFixed(0)} kg.`, true);
      ctx.emit('mounted', { horse: h });
    }

    function dismount() {
      if (!riding) return;
      riding.horse.rider = null;
      riding.horse.gait = 'halt';
      riding = null;
      ctx.state.movementLocked = false;
      ctx.emit('dismounted', {});
    }

    /* ---- driving ----------------------------------------------------- */

    function enter(rec) {
      const v = rec.vehicle;
      driving = rec;
      ctx.state.movementLocked = true;
      const d = v.describe();
      ctx.log(`${v.name}. ${d.missing.length ? `Missing: ${d.missing.join(', ')}.` : 'It looks complete.'} `
        + `Fuel ${d.fuelL.toFixed(0)} L, ${Math.round(d.fuelViability * 100)}% still good. ${ctx.hint('y', 'a')} to start.`, true);
      ctx.emit('vehicle-entered', { vehicle: v });
    }

    function exit() {
      if (!driving) return;
      driving.vehicle.stop();
      driving = null;
      ctx.state.movementLocked = false;
    }

    /* ---- per-frame ---------------------------------------------------- */
    let spawned = false;
    ctx.onUpdate((dt) => {
      if (!spawned) {
        spawned = true;
        try { spawnHorses(); spawnCars(); } catch (e) { ctx.log(`vehicles: ${e.message}`); }
      }

      const env = ctx.world.clock.environment();
      const scaled = dt * (ctx.world.clock.timeScale || 1);

      /* What the driver is asking for, whatever they are holding. A keyboard
         gives you three positions on each axis; a pad gives you every
         position in between, and a car that can only be driven flat out or
         not at all is a car nobody enjoys. A controller writes its analogue
         values into ctx.state.driveInput and they are used as they are. */
      const pad = ctx.state.driveInput;
      const controls = pad || {
        throttle: game.input.down('w') ? 1 : 0,
        brake: game.input.down('s') ? 1 : 0,
        steer: (game.input.down('d') ? 1 : 0) - (game.input.down('a') ? 1 : 0),
        forward: game.input.down('w'),
        back: game.input.down('s'),
        fast: game.input.down('shift'),
      };

      ctx.state.riding = !!riding;
      ctx.state.driving = !!driving;

      stream(horses, 260, makeHorseActor);
      stream(cars, 220, makeCarActor);

      /* Riding. The horse is steered with A/D and asked for a gait with
         W and S; it decides whether it will give it. */
      if (riding) {
        const h = riding.horse;
        if (!h.alive) { ctx.log('It is dead.', true); dismount(); return; }
        const want = controls.forward
          ? (controls.fast ? 'gallop' : 'canter')
          : controls.back ? 'walk' : (h.gait === 'halt' ? 'halt' : 'walk');
        if (want !== h.gait) h.ask(want, { skill: ctx.player.skills.hunting || 0.2 });
        const steer = controls.steer;

        const ahead = 3;
        const y0 = ctx.groundY(h.x, h.z);
        const y1 = ctx.groundY(h.x + Math.sin(h.heading) * ahead, h.z + Math.cos(h.heading) * ahead);
        const biome = ctx.biomeAt(h.x, h.z);
        h.step(scaled, {
          riderMassKg: ctx.player.body.massKg + ctx.player.inventory.loadKg(),
          gradePct: ((y1 - y0) / ahead) * 100,
          terrainFactor: biome ? biome.terrainFactor : 1.2,
          airTempC: env.airTempC,
          steer: steer * 0.9,
        });
        h.y = ctx.groundY(h.x, h.z);

        // The player rides where the horse goes, in the saddle.
        ctx.player.x = h.x; ctx.player.z = h.z;
        ctx.player.y = h.y + 1.7;
        ctx.avatar.setPosition([h.x, h.y + 1.75, h.z]);
        if (riding.actor) {
          riding.actor.setPosition([h.x, h.y, h.z]);
          riding.actor.setRotation([0, (h.heading * 180) / Math.PI, 0]);
        }
        // Riding is not free for the rider either: you are working to stay on.
        ctx.player.extraWatts = 60 + SV.GAIT[h.gait].jolt * 120;
        ctx.player.speedMs = h.speedMs;
        ctx.state.noiseOverride = Math.min(1, 0.25 + h.speedMs / 16);

        ctx.state.statusLines = (ctx.state.statusLines || []).concat([
          `${h.breed.name} at a ${h.gait}: ${(h.speedMs * 3.6).toFixed(0)} km/h,`
          + ` ${Math.round((1 - h.fatigue) * 100)}% left, ${h.coreTempC.toFixed(1)} °C`,
        ]);

        // A gallop into a tree unseats you, and a fall at 14 m/s is a fall.
        if (h.speedMs > 8 && Math.abs(ctx.groundY(h.x, h.z) - h.y) > 1.5) {
          const r = h.startle(1);
          if (r.unseated) unseat(r.fallSpeedMs);
        }
        return;
      }

      /* Driving. W and S are the pedals, A and D the wheel, and the gearbox
         shifts itself because a manual box on a keyboard is not a mechanic
         anybody wants. */
      if (driving) {
        const v = driving.vehicle;
        const throttle = controls.throttle;
        const brake = controls.brake;
        const steer = controls.steer;

        // Automatic shifting on engine speed, with a lockout so it does not
        // hunt between two gears.
        autoGearTimer -= dt;
        if (v.running && autoGearTimer <= 0) {
          if (v.rpm > v.spec.redlineRpm * 0.92 && v.gear < v.spec.gears.length - 1) { v.gear++; autoGearTimer = 0.6; }
          else if (v.rpm < v.spec.idleRpm * 1.5 && v.gear > 0) { v.gear--; autoGearTimer = 0.6; }
        }

        const ahead = 6;
        const y0 = ctx.groundY(v.x, v.z);
        const y1 = ctx.groundY(v.x + Math.sin(v.heading) * ahead, v.z + Math.cos(v.heading) * ahead);
        const biome = ctx.biomeAt(v.x, v.z);
        // Tarmac is grip; a wet meadow is not. Roads are the only reason to
        // own a car on an island like this.
        const onRoad = !!(ctx.state.onRoad && ctx.state.onRoad(v.x, v.z));
        const surfaceGrip = onRoad ? 1 : (biome && /beach|marsh/.test(biome.id) ? 0.42 : 0.62)
          * (env.precipitation > 0.5 ? 0.75 : 1);

        const before = v.speedMs;
        v.step(dt, { throttle, brake, steer, gradePct: ((y1 - y0) / ahead) * 100,
          surfaceGrip, loadKg: ctx.player.inventory.loadKg() });
        v.y = ctx.groundY(v.x, v.z);

        // Hitting something: the terrain rising faster than the car can climb.
        const climb = ctx.groundY(v.x, v.z) - y0;
        if (Math.abs(before) > 5 && climb > 1.2) {
          const report = v.collide(Math.abs(before), { belted: true, occupantMassKg: ctx.player.body.massKg });
          ctx.player.injury.fall(Math.abs(before) * 0.4, ctx.player.body.massKg, 'metal',
            ctx.world.clock.dayLengthSeconds, ctx.world.clock.totalDays);
          ctx.log(`Hit something at ${(Math.abs(before) * 3.6).toFixed(0)} km/h. ${report.decelG.toFixed(0)} g.`, true);
          game.audio.impact(Math.min(1, Math.abs(before) / 18));
          ctx.emit('vehicle-crash', { report });
        }

        ctx.player.x = v.x; ctx.player.z = v.z; ctx.player.y = v.y + 1.2;
        ctx.avatar.setPosition([v.x, v.y + 1.3, v.z]);
        ctx.player.speedMs = Math.abs(v.speedMs);
        // An engine is the loudest thing on this island by a long way.
        ctx.state.noiseOverride = v.running ? 1 : 0.1;
        if (driving.actor) {
          driving.actor.setPosition([v.x, v.y, v.z]);
          driving.actor.setRotation([0, (v.heading * 180) / Math.PI, 0]);
        }

        const d = v.describe();
        ctx.state.statusLines = (ctx.state.statusLines || []).concat([
          v.running
            ? `${v.name}: ${d.speedKph.toFixed(0)} km/h, gear ${v.gear + 1}, ${v.rpm | 0} rpm, ${d.fuelL.toFixed(1)} L`
            : `${v.name}: not running${d.missing.length ? ` (${d.missing.join(', ')})` : ''}`
              + ` — ${ctx.hint('y', 'a')} to try it`,
        ]);
        return;
      }

      /* Loose horses graze, wander and settle. This is also where trust is
         earned: stand near a wild one and do nothing and it calms down. */
      for (const rec of horses) {
        const h = rec.horse;
        if (!h.alive || h === (riding && riding.horse)) continue;
        const d = Math.hypot(h.x - ctx.player.x, h.z - ctx.player.z);
        if (d < 300) {
          if (d < 6 && (ctx.player.speedMs || 0) < 0.6) h.handle(scaled, { gentle: true });
          else if (d < 12 && (ctx.player.speedMs || 0) > 3) h.startle(0.25 * dt);
          if (h.gait === 'halt' && Math.random() < dt * 0.1) h.ask('walk', { skill: 1 });
          else if (h.gait !== 'halt' && Math.random() < dt * 0.15) h.gait = 'halt';
          h.step(scaled, { airTempC: env.airTempC, steer: (Math.random() - 0.5) * 0.3 });
          h.graze(scaled * (h.gait === 'halt' ? 1 : 0.2));
          h.y = ctx.groundY(h.x, h.z);
          if (rec.actor) {
            rec.actor.setPosition([h.x, h.y, h.z]);
            rec.actor.setRotation([0, (h.heading * 180) / Math.PI, 0]);
          }
        }
      }
    });

    function unseat(speedMs) {
      const h = riding.horse;
      dismount();
      ctx.player.injury.fall(speedMs, ctx.player.body.massKg, 'earth',
        ctx.world.clock.dayLengthSeconds, ctx.world.clock.totalDays);
      h.trust = Math.max(0, h.trust - 0.25);
      ctx.log('It puts you on the floor.', true);
    }

    /* ---- verbs and keys ------------------------------------------------ */
    ctx.state.offerHooks = ctx.state.offerHooks || [];
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind === 'horse') {
        const h = ud.horse;
        if (!h.alive) return null;
        if (h.wild && h.trust < 0.55) {
          return { verb: `calm the ${h.breed.name} (${Math.round(h.trust * 100)}% settled)`, hold: 3, repeat: true,
            act: () => { h.handle(3, { gentle: true }); ctx.toast(`${Math.round(h.trust * 100)}% settled.`); } };
        }
        return { verb: `mount the ${h.breed.name}`, hold: 1.5, act: () => mount(ud.rec) };
      }
      if (ud.kind === 'vehicle') {
        const d = ud.vehicle.describe();
        return { verb: `get into the ${ud.vehicle.name}${d.missing.length ? ` (${d.missing.join(', ')})` : ''}`,
          hold: 1, act: () => enter(ud.rec) };
      }
      return null;
    });

    ctx.key('y', () => {
      if (!driving) { ctx.toast('Not in a vehicle.'); return; }
      const v = driving.vehicle;
      if (v.running) { v.stop(); ctx.log('Off.'); return; }
      const env = ctx.world.clock.environment();
      const r = v.start({ airTempC: env.airTempC });
      if (r.ok) { ctx.log('It catches.', true); game.audio.tone(90, 0.4); }
      else ctx.log(`${r.reason}.`, true);
    }, 'Start / stop the engine');

    ctx.key('escape', () => { if (riding) dismount(); else if (driving) exit(); });
    ctx.key('q', (c, ev) => {
      // Shift-Q gets you off whatever you are on; plain Q is the toilet,
      // which belongs to the interaction module.
      if (ev && ev.shiftKey) { if (riding) dismount(); else if (driving) exit(); }
    }, 'Shift+Q: get off / out');

    /* A car full of fuel is a fuel dump, and a horse is a pack animal.
       Both are worth more as those than as transport. */
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind === 'vehicle' && ud.vehicle.fuelL > 1) {
        return null;   // the primary verb is entering it; siphoning is on props
      }
      return null;
    });
  },
});
