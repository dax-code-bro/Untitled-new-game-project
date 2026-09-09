/* Fire, cooking, water and shelter — the four things that decide whether a
   night is survivable. All four are already modelled in SV.Provision and
   SV.Fire, so this module is the hands: it puts a fire where the player is
   standing, feeds the fire's radiant output into the physiology every
   frame, holds meat over it and lets conduction do the rest.

   The important honesty here is that none of it is instant. Lighting a fire
   with a bow drill in a wind mostly fails. A steak seared black is still
   raw in the middle. Boiling a litre takes a minute of real fuel. The
   player is meant to feel the cost of every one of those.

   Emits: 'fire-lit' { fire }, 'cooked' { provision }.
   Listens: 'fill-water' { source }. */
SurvivorGame.module({
  id: 'survival',
  order: 34,

  init(ctx) {
    const { LE, SV, game } = ctx;
    const fires = [];             // { fire, actors, light, cooking: [] }
    const drying = [];            // { rack, actor, provisions: [] }

    const FLAME_MAT = { preset: 'lava', color: 0xff8a2b, emissive: 0xff6a10, emissiveStrength: 3.2, roughness: 0.6 };
    const EMBER_MAT = { preset: 'lava', color: 0xff4a10, emissive: 0xff3000, emissiveStrength: 2.0 };

    /* ---- building a fire ------------------------------------------- */

    function fireFuelInPack() {
      const inv = ctx.player.inventory;
      let kg = 0;
      for (const s of inv.slots) {
        if (s.item === 'firewood') kg += 6 * (s.quantity || 1);
        else if (s.item === 'kindling') kg += 0.4 * (s.quantity || 1);
        else if (s.item === 'timber') kg += 12 * (s.quantity || 1);
      }
      return kg;
    }

    function bestIgnition() {
      const inv = ctx.player.inventory;
      for (const m of ['lighter', 'matches', 'ferroRod', 'bowDrill']) if (inv.has(m, 1)) return m;
      return null;
    }

    function buildFire(kindId) {
      const inv = ctx.player.inventory;
      if (!inv.has('firewood', 1) && !inv.has('timber', 1)) { ctx.toast('You have nothing to burn.'); return null; }
      if (!inv.has('tinder', 1)) ctx.toast('No tinder. It will be harder to catch.');

      const x = ctx.player.x, z = ctx.player.z;
      const env = ctx.world.clock.environment();
      // A fire under a canopy or inside four walls is sheltered from the rain.
      const sheltered = !!(ctx.state.buildingAt || (ctx.state.canopyAt && ctx.state.canopyAt(x, z) > 0.6));

      let fuel = 0;
      while (inv.has('firewood', 1) && fuel < 12) { inv.remove('firewood', 1); fuel += 6; }
      if (fuel === 0 && inv.has('timber', 1)) { inv.remove('timber', 1); fuel += 12; }

      const fire = new SV.Fire({ kind: kindId, x, y: ctx.groundY(x, z), z, fuelKg: fuel, sheltered });
      ctx.world.fires.push(fire);

      const y = fire.y;
      const actors = [];
      // A ring of stones, because a fire that spreads is a different game.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        actors.push(game.rock({ at: [x + Math.cos(a) * 0.62, y + 0.1, z + Math.sin(a) * 0.62], radius: 0.17,
          seed: i * 13, material: { preset: 'rock', color: 0x6e6a63 }, static: true, key: 'fire:stone' }));
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const log = game.cylinder({ at: [x + Math.cos(a) * 0.2, y + 0.16, z + Math.sin(a) * 0.2], radius: 0.06, height: 0.75,
          material: { preset: 'wood', color: 0x4a3520 }, static: true, key: 'fire:log' });
        log.setRotation([62, (a * 180) / Math.PI, 0]);
        actors.push(log);
      }
      const flame = game.cone({ at: [x, y + 0.42, z], radius: 0.3, height: 0.8, material: FLAME_MAT, static: true, name: 'fire' });
      flame.visible = false;
      flame.userData = { kind: 'fire', fire };
      actors.push(flame);
      const embers = game.cylinder({ at: [x, y + 0.09, z], radius: 0.34, height: 0.06, material: EMBER_MAT, static: true });
      embers.visible = false;
      actors.push(embers);

      const rec = { fire, actors, flame, embers, light: null, cooking: [], boiling: null };
      fires.push(rec);
      ctx.log('A fire laid. It still has to catch.');
      return rec;
    }

    function lightFire(rec) {
      const method = bestIgnition();
      if (!method) { ctx.toast('Nothing to light it with.'); return; }
      const env = ctx.world.clock.environment();
      const inv = ctx.player.inventory;
      const tinderWet = ctx.player.body.wet ? 0.8 : (env.precipitation > 0.5 ? 0.5 : inv.has('tinder', 1) ? 0.05 : 0.4);
      const r = rec.fire.tryLight({
        method,
        skill: ctx.player.skills.survival || 0.2,
        tinderWet,
        windMs: env.windMs,
        precipitation: env.precipitation,
      });
      // Every attempt costs tinder and, with matches, a match.
      if (inv.has('tinder', 1)) inv.remove('tinder', 1);
      if (method === 'matches') inv.remove('matches', 1);
      ctx.player.practise('survival', 0.02);
      if (r.ok) {
        ctx.log('It catches.', true);
        ctx.emit('fire-lit', { fire: rec.fire });
      } else {
        ctx.log(`${r.reason}. (${Math.round((r.chance || 0) * 100)}% with what you have.)`);
      }
    }

    /* ---- cooking ---------------------------------------------------- */

    /* Which safe-core rule a piece of meat falls under. Bear is its own
       category because trichinella is, and fish and birds are their own for
       the same reason. */
    function cutFor(speciesId) {
      if (/bear/i.test(speciesId)) return 'bear';
      if (/boar|pig|peccary/i.test(speciesId)) return 'pork';
      if (/turkey|grouse|duck|goose|quail|pheasant/i.test(speciesId)) return 'bird';
      return 'muscle';
    }

    function provisionFromSlot(slot) {
      if (slot.provision) return Object.assign(new SV.Provision({}), slot.provision);
      const m = /^meat:(.+)$/.exec(slot.item);
      const f = /^fillet:(.+)$/.exec(slot.item);
      if (m) {
        const sp = SV.SPECIES[m[1]] || {};
        return new SV.Provision({
          name: `${sp.name || m[1]} meat`, kg: slot.massKg || 1,
          kcalPerKg: 1300, proteinFraction: 0.78, waterFraction: 0.7,
          cut: cutFor(m[1]),
          pathogenVectors: [SV.VECTOR.undercookedMeat].concat(/bear|boar/i.test(m[1]) ? [SV.VECTOR.bearMeat] : []),
        });
      }
      if (f) {
        return new SV.Provision({
          name: `${(SV.FISH_SPECIES[f[1]] || {}).name || f[1]} fillet`, kg: slot.massKg || 0.4,
          kcalPerKg: 1050, proteinFraction: 0.8, waterFraction: 0.75, cut: 'fish',
          pathogenVectors: [SV.VECTOR.rawFish || SV.VECTOR.undercookedMeat],
        });
      }
      return null;
    }

    function putOnFire(rec) {
      const inv = ctx.player.inventory;
      const slot = inv.slots.find((s) => /^meat:|^fillet:/.test(s.item));
      if (!slot) { ctx.toast('Nothing raw to cook.'); return; }
      const p = provisionFromSlot(slot);
      if (!p) return;
      inv.remove(slot.item, 1);
      rec.cooking.push(p);
      ctx.log(`${p.name} on the fire. It is done when the middle is, not when the outside is.`);
    }

    function takeOffFire(rec) {
      const p = rec.cooking.shift();
      if (!p) { ctx.toast('Nothing on the fire.'); return; }
      const spec = SV.SAFE_CORE[p.cut] || SV.SAFE_CORE.muscle;
      ctx.player.inventory.add({
        item: 'cookedMeat', massKg: p.kg, volumeL: p.kg * 1.05, stackable: false,
        provision: p, label: `${p.name} (${p.state})`,
      });
      ctx.player.practise('cooking', 0.03);
      ctx.log(`${p.name}: core ${p.coreTempC.toFixed(0)} °C, ${p.state}.${
        p.safe ? '' : ` Needs ${spec.tempC} °C for ${spec.holdS} s to be safe.`}`, !p.safe);
    }

    /* ---- water ------------------------------------------------------ */

    function boilWater(rec) {
      const inv = ctx.player.inventory;
      if (!inv.has('pot', 1)) { ctx.toast('You need a pot.'); return; }
      if (!inv.has('water', 1)) { ctx.toast('No water to boil.'); return; }
      if (!rec.fire.lit) { ctx.toast('The fire is out.'); return; }
      rec.boiling = { remaining: 60, litres: 1 };
      ctx.log('A litre on to boil. About a minute at a rolling boil.');
    }

    function treatFromInventory(method) {
      const inv = ctx.player.inventory;
      if (!inv.has('water', 1)) { ctx.toast('No untreated water.'); return; }
      const t = SV.WATER_TREATMENT[method];
      const needs = { filtered: 'filter', chlorine: 'chlorine', distilled: 'still', charcoalSand: 'filter' }[method];
      if (needs && !inv.has(needs, 1)) { ctx.toast(`You need a ${needs}.`); return; }
      inv.remove('water', 1);
      if (method === 'chlorine') inv.remove('chlorine', 1);
      const treated = SV.treatWater(method, 1, { turbidity: 0.2 });
      inv.add({ item: 'cleanWater', massKg: 1, volumeL: 1, stackable: true, treated });
      ctx.log(`${t.name}. ${t.note || ''}`);
    }

    ctx.on('fill-water', (e) => {
      const inv = ctx.player.inventory;
      if (!inv.has('waterBottle', 1) && !inv.has('pot', 1)) { ctx.toast('Nothing to carry it in.'); return; }
      inv.add({ item: 'water', massKg: 1, volumeL: 1, stackable: true, quantity: 1,
        source: (e.source && e.source.source) || 'surface', turbidity: (e.source && e.source.turbidity) || 0.2 });
      ctx.log('A litre. Untreated.');
    });

    /* ---- shelter ---------------------------------------------------- */

    /* A lean-to is not a building; it is a windbreak and a roof, and what it
       buys you is a smaller wind speed and a dry sleeping bag. Both of those
       are inputs the physiology already reads. */
    const shelters = [];
    function buildShelter() {
      const inv = ctx.player.inventory;
      if (!inv.has('timber', 2)) { ctx.toast('Two logs, minimum.'); return; }
      const cordage = inv.has('cordage', 2);
      inv.remove('timber', 2);
      if (cordage) inv.remove('cordage', 2);
      const x = ctx.player.x, z = ctx.player.z, y = ctx.groundY(x, z);
      const yaw = (game._camYaw * 180) / Math.PI;
      const actors = [];
      const ridge = game.cylinder({ at: [x, y + 1.3, z], radius: 0.1, height: 3, material: { preset: 'wood', color: 0x6b4f30 }, static: true });
      ridge.setRotation([90, yaw, 0]);
      actors.push(ridge);
      for (const s of [-1, 1]) {
        const leg = game.cylinder({ at: [x + Math.cos(yaw * Math.PI / 180) * s * 1.5, y + 0.65, z - Math.sin(yaw * Math.PI / 180) * s * 1.5],
          radius: 0.08, height: 1.4, material: { preset: 'wood', color: 0x6b4f30 }, static: true });
        actors.push(leg);
      }
      const roof = game.box({ at: [x, y + 0.95, z - 0.7], size: [3.2, 0.12, 2.0],
        material: { preset: 'fabric', color: 0x4c5a35, roughness: 1 }, static: true, name: 'lean-to' });
      roof.setRotation([-28, yaw, 0]);
      roof.userData = { kind: 'shelter' };
      actors.push(roof);
      // Quality decides how much wind it actually stops.
      const quality = 0.45 + (cordage ? 0.25 : 0) + Math.min(0.25, ctx.player.skills.survival || 0);
      shelters.push({ x, z, radiusM: 2.4, quality, actors });
      ctx.player.practise('survival', 0.05);
      ctx.log(`A lean-to. It stops about ${Math.round(quality * 100)}% of the wind and most of the rain.`, true);
    }

    function shelterAt(x, z) {
      let best = 0;
      for (const s of shelters) if (Math.hypot(s.x - x, s.z - z) < s.radiusM) best = Math.max(best, s.quality);
      if (ctx.state.buildingAt) best = Math.max(best, 0.92);
      return best;
    }

    /* ---- drying rack ------------------------------------------------- */
    function buildRack() {
      const inv = ctx.player.inventory;
      if (!inv.has('timber', 1) || !inv.has('cordage', 2)) { ctx.toast('A log and two lengths of cordage.'); return; }
      inv.remove('timber', 1); inv.remove('cordage', 2);
      const x = ctx.player.x, z = ctx.player.z, y = ctx.groundY(x, z);
      const actors = [];
      for (const s of [-1, 1]) {
        actors.push(game.cylinder({ at: [x + s * 1.1, y + 0.8, z], radius: 0.06, height: 1.6,
          material: { preset: 'wood', color: 0x6b4f30 }, static: true, key: 'rack:leg' }));
      }
      const bar = game.cylinder({ at: [x, y + 1.55, z], radius: 0.04, height: 2.3, material: { preset: 'wood', color: 0x6b4f30 }, static: true, name: 'drying rack' });
      bar.setRotation([0, 0, 90]);
      bar.userData = { kind: 'rack' };
      actors.push(bar);
      const rec = { x, z, actors, provisions: [], bar };
      drying.push(rec);
      ctx.log('A rack. Meat on it dries in a day of sun and keeps for weeks.');
      return rec;
    }

    /* ---- per-frame ---------------------------------------------------- */
    ctx.onUpdate((dt) => {
      const env = ctx.world.clock.environment();
      const px = ctx.player.x, pz = ctx.player.z;
      const scaled = dt * (ctx.world.clock.timeScale || 1);

      let radiantW = 0;
      for (let i = fires.length - 1; i >= 0; i--) {
        const rec = fires[i];
        const f = rec.fire;
        const wasLit = f.lit;
        f.step(scaled, env);

        // Flame and embers appear and disappear with the fire itself.
        if (rec.flame.visible !== f.lit) {
          rec.flame.visible = f.lit;
          rec.embers.visible = f.lit;
          if (f.lit && !rec.light) {
            rec.light = game.light({ at: [f.x, f.y + 0.7, f.z], color: 0xff8a3a, intensity: 2.6, radius: 14 });
          } else if (!f.lit && rec.light) {
            try { rec.light.destroy ? rec.light.destroy() : (rec.light.intensity = 0); } catch (e) { /* engine may pool lights */ }
            rec.light = null;
          }
          if (wasLit && !f.lit) ctx.log('The fire is out.');
        }
        if (f.lit) {
          // Flicker, cheaply: the flame breathes rather than strobing.
          const t = performance.now() * 0.004;
          const s = 0.85 + Math.sin(t) * 0.09 + Math.sin(t * 2.7) * 0.05;
          rec.flame.setScale(s * Math.min(1.6, 0.6 + f.fuelKg / 8));
          if (Math.random() < dt * 3) game.particles.smoke([f.x, f.y + 1.1, f.z]);
          radiantW += f.radiantWattsAt(px, pz, {});

          for (const p of rec.cooking) p.cook(scaled, f.cookingTempC(), {});
          if (rec.boiling) {
            rec.boiling.remaining -= scaled;
            if (rec.boiling.remaining <= 0) {
              const inv = ctx.player.inventory;
              if (inv.has('water', 1)) {
                inv.remove('water', 1);
                inv.add({ item: 'cleanWater', massKg: 1, volumeL: 1, stackable: true,
                  treated: SV.treatWater('boiled', 1, {}) });
                ctx.log('A litre boiled. That is most of medicine.', true);
              }
              f.fuelKg = Math.max(0, f.fuelKg - 0.25);
              rec.boiling = null;
            }
          }
        }

        // A fire far behind the player is still burning; it just is not drawn.
        if (Math.hypot(f.x - px, f.z - pz) > 400 && !f.lit && f.fuelKg <= 0) {
          for (const a of rec.actors) { try { a.destroy(); } catch (e) { /* gone */ } }
          fires.splice(i, 1);
        }
      }

      /* The fire's heat goes into the body as watts, which is the only
         honest way to make sitting by one matter: it competes with the wind
         and the rain on the same ledger. */
      ctx.player.radiantWatts = radiantW;
      ctx.state.shelterQuality = shelterAt(px, pz);

      // Drying racks work off the weather, and rain undoes them.
      for (const r of drying) {
        for (const p of r.provisions) {
          p.dry(scaled, { airTempC: env.airTempC, humidity: Math.max(env.humidity, env.precipitation > 0 ? 0.95 : 0), smoke: false });
          p.step(scaled, env);
        }
      }

      if (radiantW > 30) {
        ctx.state.statusLines = (ctx.state.statusLines || []).concat(
          [`fire: ${Math.round(radiantW)} W of radiant heat on you`]);
      }
    });

    /* ---- verbs and keys ------------------------------------------------ */
    ctx.state.offerHooks = ctx.state.offerHooks || [];
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind === 'fire') {
        const rec = fires.find((r) => r.fire === ud.fire);
        if (!rec) return null;
        if (!rec.fire.lit) return { verb: `light it (${bestIgnition() || 'nothing to light it with'})`, hold: 4, act: () => lightFire(rec) };
        if (rec.cooking.length) return { verb: `take the ${rec.cooking[0].name} off (core ${rec.cooking[0].coreTempC.toFixed(0)} °C)`, hold: 1, act: () => takeOffFire(rec) };
        const inv = ctx.player.inventory;
        if (inv.slots.some((s) => /^meat:|^fillet:/.test(s.item))) return { verb: 'put meat on the fire', hold: 1.5, act: () => putOnFire(rec) };
        if (inv.has('water', 1) && inv.has('pot', 1)) return { verb: 'boil a litre', hold: 2, act: () => boilWater(rec) };
        return { verb: `feed the fire (${rec.fire.fuelKg.toFixed(1)} kg left)`, hold: 2, act: () => {
          if (!inv.has('firewood', 1)) { ctx.toast('No firewood.'); return; }
          inv.remove('firewood', 1); rec.fire.addFuel(6); ctx.log('Fed. Another hour or so.');
        } };
      }
      if (ud.kind === 'rack') {
        const rec = drying.find((r) => r.bar === hit.actor);
        if (!rec) return null;
        const inv = ctx.player.inventory;
        if (rec.provisions.length) {
          const p = rec.provisions[0];
          return { verb: `take the ${p.name} down (${Math.round(p.waterFraction * 100)}% water)`, hold: 1, act: () => {
            rec.provisions.shift();
            inv.add({ item: 'cookedMeat', massKg: p.kg, volumeL: p.kg, stackable: false, provision: p, label: `${p.name} (${p.state})` });
            ctx.log(`${p.name}, ${p.state}.`);
          } };
        }
        const slot = inv.slots.find((s) => /^meat:|^fillet:/.test(s.item));
        if (slot) return { verb: 'hang meat to dry', hold: 3, act: () => {
          const p = provisionFromSlot(slot); if (!p) return;
          inv.remove(slot.item, 1); rec.provisions.push(p);
          ctx.log('Hung. A warm dry day will do it; rain will undo it.');
        } };
        return { verb: 'an empty drying rack', act: null };
      }
      return null;
    });

    ctx.key('f', () => {
      // F is the survival verb: build a fire where you stand, or light the
      // one you are standing at.
      const near = fires.find((r) => Math.hypot(r.fire.x - ctx.player.x, r.fire.z - ctx.player.z) < 2.2);
      if (near) { if (!near.fire.lit) lightFire(near); else ctx.toast('It is already lit.'); return; }
      buildFire('campfire');
    }, 'Build or light a fire');

    ctx.key('g', () => {
      // Shelter, then a rack once you have a shelter.
      if (game.input.down('shift')) buildRack(); else buildShelter();
    }, 'Build a lean-to (shift: drying rack)');

    ctx.key('k', () => {
      // Whichever water treatment the player can actually do right now.
      const inv = ctx.player.inventory;
      if (inv.has('filter', 1)) treatFromInventory('filtered');
      else if (inv.has('chlorine', 1)) treatFromInventory('chlorine');
      else if (inv.has('still', 1)) treatFromInventory('distilled');
      else ctx.toast('Boil it on a fire, or find a filter.');
    }, 'Treat water');
  },
});
