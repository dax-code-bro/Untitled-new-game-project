/* Fishing. The fishery already knows where the 200 fish are, what water
   temperature each species tolerates, what it will eat, at what depth and
   at what time of day, and how hard it pulls once it is on. So this module
   is a rod, a line, a float and a fight — nothing about whether a fish
   bites is decided here.

   The fight is the one place the player has continuous control: drag on
   the reel against a fish that can pull harder than the line will take.
   Too much drag and the line parts; too little and it throws the hook.
   That trade is exactly what SV.Fish.fight models, and it runs at the
   frame rate while the player holds the mouse.

   Emits: 'fish-landed' { fish, fillet }, 'fish-lost' { reason }. */
SurvivorGame.module({
  id: 'fishing',
  order: 40,

  init(ctx) {
    const { LE, SV, game } = ctx;
    const BAITS = ['worm', 'cutbait', 'lure', 'fly', 'shellfish', 'bread'];

    let rodOut = false;
    let cast = null;              // { x, z, depthM, bait, soak, float, line }
    let fight = null;             // { fish, drag, tension, time }
    let baitIndex = 0;

    const panel = ctx.hud.panel('fishing', { className: 'panel', style: 'display:none' });
    panel.style.cssText += ';position:absolute;left:50%;bottom:120px;transform:translateX(-50%);'
      + 'min-width:320px;text-align:center;pointer-events:none';

    /* The float, the line and the rod tip. All three are the whole visual
       language of the mechanic: the float goes under when a fish takes, and
       the line goes taut and red when it is about to break. */
    let floatActor = null, lineActor = null, rodActor = null;

    function ensureRodVisual() {
      if (rodActor) return;
      rodActor = game.cylinder({
        at: [0, -50, 0], radius: 0.012, height: 2.1,
        material: { preset: 'wood', color: 0x6b4a2c }, static: true, name: 'rod',
      });
    }

    function waterBodyAt(x, z) {
      for (const b of ctx.world.fishery.bodies) if (b.contains(x, z)) return b;
      return null;
    }

    /* Where the line lands: down the camera to where it meets water. The sea
       is at y = 0, so the intersection is a plain ray-plane test rather than
       a raycast into geometry that does not exist. */
    function castTarget() {
      const a = ctx.aim();
      const o = a.origin, d = a.direction;
      if (d.y >= -0.02) return null;
      const t = (0.0 - o.y) / d.y;
      if (t < 2 || t > 45) return null;
      const x = o.x + d.x * t, z = o.z + d.z * t;
      // Rivers and lakes sit above sea level, so try the terrain surface too.
      const body = waterBodyAt(x, z);
      if (body) return { x, z, distance: t, body };
      // A lake at height: step the ray until it drops under the terrain.
      for (let s = 3; s < 40; s += 0.5) {
        const px = o.x + d.x * s, py = o.y + d.y * s, pz = o.z + d.z * s;
        if (py <= ctx.groundY(px, pz) + 0.05) {
          const b2 = waterBodyAt(px, pz);
          if (b2) return { x: px, z: pz, distance: s, body: b2 };
          return null;
        }
      }
      return null;
    }

    function lineStrengthKg() {
      const inv = ctx.player.inventory;
      // Improvised line off cordage is a fraction of what a real spool takes.
      if (inv.has('fishingRod', 1)) return 5.4;
      if (inv.has('cordage', 1)) return 2.2;
      return 1.4;
    }

    function currentBait() {
      const inv = ctx.player.inventory;
      const have = BAITS.filter((b) => (b === 'worm' && inv.has('worms', 1))
        || (b === 'cutbait' && inv.has('cutbait', 1))
        || (b === 'shellfish' && inv.has('shellfish', 1))
        || (b === 'lure' || b === 'fly'));
      if (!have.length) return null;
      return have[baitIndex % have.length];
    }

    function doCast() {
      const inv = ctx.player.inventory;
      if (!inv.has('fishingRod', 1)) { ctx.toast('You need a rod.'); return; }
      const t = castTarget();
      if (!t) { ctx.toast('Nothing to cast at.'); return; }
      const bait = currentBait();
      if (!bait) { ctx.toast('No bait, no lure.'); return; }

      // A lure fishes at the depth you count it down to; a float fishes
      // where you set it. Either way the player chooses, and the fish care.
      const depthM = ctx.state.fishDepthM || 1.5;
      cast = { x: t.x, z: t.z, depthM, bait, soak: 0, body: t.body, lastTry: 0 };
      rodOut = true;
      ctx.state.movementLocked = true;

      if (!floatActor) {
        floatActor = game.sphere({ at: [t.x, 0.06, t.z], radius: 0.07,
          material: { preset: 'plastic', color: 0xdd3322, emissive: 0x220000 }, static: true, name: 'float' });
      }
      floatActor.visible = true;
      floatActor.setPosition([t.x, waterSurfaceY(t.x, t.z) + 0.05, t.z]);
      ctx.log(`Cast ${t.distance.toFixed(0)} m with ${bait} at ${depthM.toFixed(1)} m.`);
    }

    function waterSurfaceY(x, z) {
      const b = waterBodyAt(x, z);
      if (b && b.surfaceY != null) return b.surfaceY;
      return 0;
    }

    function reelIn() {
      rodOut = false;
      cast = null;
      fight = null;
      ctx.state.movementLocked = false;
      if (floatActor) floatActor.visible = false;
      if (lineActor) lineActor.visible = false;
      panel.style.display = 'none';
    }

    function landIt(fish) {
      ctx.world.fishery.land(fish);
      const knife = ctx.player.inventory.has('knife', 1) || ctx.player.inventory.has('stoneKnife', 1);
      const y = fish.fillet({ skill: ctx.player.skills.fishing || 0.3, bledImmediately: knife });
      if (y.ruined) {
        ctx.log(`${fish.species.name}, ${fish.massKg.toFixed(1)} kg — and the flesh has already turned. It needed bleeding.`, true);
      } else {
        ctx.player.inventory.add({
          item: `fillet:${fish.speciesId}`, massKg: y.kg, volumeL: y.kg,
          stackable: true, quantity: 1,
        });
        ctx.player.inventory.add({ item: 'cutbait', massKg: 0.2, volumeL: 0.2, stackable: true, quantity: 1 });
        ctx.log(`${fish.species.name}, ${fish.massKg.toFixed(1)} kg, ${(fish.lengthM * 100).toFixed(0)} cm. `
          + `${y.kg.toFixed(2)} kg of fillet.${y.toxicRoe ? ' Do not eat the roe.' : ''}`, true);
      }
      ctx.player.practise('fishing', 0.06);
      ctx.emit('fish-landed', { fish, fillet: y });
      reelIn();
    }

    /* ---- per-frame ------------------------------------------------- */
    ctx.onUpdate((dt) => {
      if (!rodOut) return;
      const env = ctx.world.clock.environment();

      // The rod, held out in front and angled up, moving with the camera.
      ensureRodVisual();
      const cam = game.camera.position;
      const yaw = game._camYaw;
      rodActor.visible = true;
      rodActor.setPosition([cam.x + Math.sin(yaw + 0.5) * 0.5, cam.y - 0.25, cam.z + Math.cos(yaw + 0.5) * 0.5]);
      rodActor.setRotation([-52, (yaw * 180) / Math.PI + 28, 0]);

      if (fight) {
        /* The fight. Drag is the mouse: hold to lean on it, let go to give
           line. Everything else is the fish. */
        const holding = game.input.down('mouse0') || game.input.down(' ');
        fight.drag += ((holding ? 0.95 : 0.12) - fight.drag) * Math.min(1, dt * 3.5);
        fight.time += dt;
        const r = fight.fish.fight(dt, {
          lineStrengthKg: lineStrengthKg(),
          drag: fight.drag,
          rodAction: 0.6,
          wireTrace: false,
        });
        fight.tension = r.tension || (r.lost ? 1.2 : 0);

        if (floatActor) {
          // The float dances while the fish is on.
          const f = fight.fish;
          const t = performance.now() * 0.006;
          floatActor.setPosition([cast.x + Math.sin(t * 1.7) * 0.4 * f.massKg,
            waterSurfaceY(cast.x, cast.z) - 0.06 - Math.abs(Math.sin(t)) * 0.1,
            cast.z + Math.cos(t * 1.3) * 0.4 * f.massKg]);
        }

        panel.style.display = 'block';
        const pct = Math.round(Math.min(1.4, fight.tension) * 100);
        panel.innerHTML = `<div style="font-size:13px">on: <b>${fight.fish.species.name}</b>`
          + ` — ${fight.fish.massKg.toFixed(1)} kg</div>`
          + `<div style="margin-top:6px;height:10px;background:#1a1c1e;border:1px solid #3a3f44">`
          + `<div style="height:100%;width:${Math.min(100, pct)}%;background:${pct > 88 ? '#d8442c' : pct > 60 ? '#d8a22c' : '#4c9a4c'}"></div></div>`
          + `<div style="font-size:11px;opacity:.75;margin-top:4px">line ${lineStrengthKg().toFixed(1)} kg`
          + ` · fish ${Math.round(fight.fish.stamina * 100)}% · hold to lean on it</div>`;

        if (r.lost) {
          ctx.log(`Lost it: ${r.reason}.`, true);
          ctx.emit('fish-lost', { reason: r.reason });
          if (r.reason === 'line broke' && ctx.player.inventory.has('cordage', 1)) ctx.player.inventory.remove('cordage', 1);
          reelIn();
        } else if (r.landed) {
          landIt(fight.fish);
        }
        return;
      }

      // Soaking. A cast is tried against the fishery once a second, and the
      // longer it sits the better the chance, which is what `soakSeconds` is.
      cast.soak += dt;
      cast.lastTry += dt;
      panel.style.display = 'block';
      panel.innerHTML = `<div style="font-size:12px;opacity:.8">${cast.bait} at ${cast.depthM.toFixed(1)} m`
        + ` · soaking ${cast.soak.toFixed(0)} s · <b>R</b> reel in · <b>[ ]</b> depth · <b>B</b> bait</div>`;

      if (cast.lastTry >= 1) {
        cast.lastTry = 0;
        const r = ctx.world.fishery.cast(cast.x, cast.z, {
          bait: cast.bait,
          depthM: cast.depthM,
          period: ctx.world.clock.period,
          skill: ctx.player.skills.fishing || 0.3,
          noise: ctx.player.noise || 0.1,
          soakSeconds: cast.soak,
          pressureTrend: (ctx.world.clock.weather && ctx.world.clock.weather.pressureTrend) || 0,
          rangeM: 30,
        });
        if (r.ok) {
          fight = { fish: r.fish, drag: 0.4, tension: 0, time: 0 };
          game.audio.splash(0.5);
          ctx.toast('Fish on.');
          // Bait is gone whether or not you land it.
          const inv = ctx.player.inventory;
          if (cast.bait === 'worm' && inv.has('worms', 1)) inv.remove('worms', 1);
          if (cast.bait === 'cutbait' && inv.has('cutbait', 1)) inv.remove('cutbait', 1);
        } else if (cast.soak > 4 && cast.soak < 5) {
          ctx.log(r.hold ? `Fishing a ${r.hold}.` : r.reason);
        }
      }
    });

    /* ---- keys ------------------------------------------------------- */
    ctx.key('r', () => {
      if (rodOut) reelIn();
      else doCast();
    }, 'Cast / reel in');

    ctx.key('b', () => {
      baitIndex++;
      const b = currentBait();
      ctx.toast(b ? `Bait: ${b}` : 'Nothing to fish with.');
    }, 'Change bait');

    ctx.key('[', () => {
      ctx.state.fishDepthM = Math.max(0.3, (ctx.state.fishDepthM || 1.5) - 0.5);
      ctx.toast(`Fishing at ${ctx.state.fishDepthM.toFixed(1)} m`);
    }, 'Fish shallower');
    ctx.key(']', () => {
      ctx.state.fishDepthM = Math.min(28, (ctx.state.fishDepthM || 1.5) + 0.5);
      ctx.toast(`Fishing at ${ctx.state.fishDepthM.toFixed(1)} m`);
    }, 'Fish deeper');

    /* Digging for worms is the free half of fishing, and it only works in
       ground that holds them. */
    ctx.state.offerHooks = ctx.state.offerHooks || [];
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind !== 'ground' && ud.kind !== 'terrain') return null;
      const biome = ctx.biomeAt(ctx.player.x, ctx.player.z);
      if (!biome || !/marsh|meadow|woodland|deepForest|riparian/.test(biome.id)) return null;
      return { verb: 'dig for worms', hold: 12, act: () => {
        const n = 1 + ((Math.random() * 4) | 0);
        ctx.player.inventory.add({ item: 'worms', massKg: 0.05, volumeL: 0.1, stackable: true, quantity: n });
        ctx.log(`${n} worms.`);
      } };
    });
  },
});
