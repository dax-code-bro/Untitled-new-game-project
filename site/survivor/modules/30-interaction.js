/* Looking at things, and doing something about them.

   One targeting system that every other module hangs off, so the thing the
   player is looking at is the same thing for all of them. What the prompt
   says is the verb, not the noun — "search the cabinet", not "cabinet" —
   because the question a survival game is always asking is what you are
   going to do about it.

   Emits:   'search' { room, found }        'butcher' { carcass, yield }
            'chop' { tree, power }          'pickup' { item }
            'door-toggle' { actor }         'drink' { source, treated }
            'sleep' { asleep }
   State:   ctx.state.interactTarget — what is under the crosshair right now */
SurvivorGame.module({
  id: 'interaction',
  order: 30,

  init(ctx) {
    const { SV, game } = ctx;

    let target = null;
    let holdTime = 0, holdDone = false;

    /* Modules that own their own objects register a hook here rather than
       having their verbs written into this file. */
    ctx.state.offerHooks = ctx.state.offerHooks || [];

    /* What a thing offers, in the order the player would think of it. Each
       returns { verb, act, hold } — hold in seconds for anything that is
       work rather than a press. */
    function offer(hit) {
      if (!hit || !hit.actor) return null;
      const ud = hit.actor.userData || {};

      /* Other modules get first refusal. A fire, a vehicle and a workbench
         all belong to whoever built them, and none of them should have to
         be known about here. */
      for (const hook of ctx.state.offerHooks) {
        let r = null;
        try { r = hook(hit, ud); } catch (e) { ctx.log(`interaction hook: ${e.message}`); }
        if (r) return r;
      }

      if (ud.kind === 'door') {
        return {
          verb: ud.door && ud.door.locked ? 'force the door' : (ud.door && ud.door.open ? 'close the door' : 'open the door'),
          hold: ud.door && ud.door.locked ? 2.5 : 0,
          act: () => ctx.emit('door-toggle', { actor: hit.actor, door: ud.door }),
        };
      }

      if (ud.kind === 'carcass' && ud.carcass) {
        const c = ud.carcass;
        if (c.stage === 'skeletal') return { verb: 'nothing left but bone', act: null };
        return {
          verb: c.skinned ? `cut meat from the ${speciesName(c)}` : `skin and butcher the ${speciesName(c)}`,
          hold: c.skinned ? 3 : 12,
          act: () => butcher(c),
        };
      }

      if (ud.kind === 'tree' && ud.tree) {
        const axe = bestTool(['axe', 'hatchet', 'saw']);
        if (!axe) return { verb: `a ${ud.tree.spec.name} — you need an axe`, act: null };
        return {
          verb: `fell the ${ud.tree.spec.name}`,
          hold: 1.2,
          repeat: true,
          act: () => {
            ctx.emit('chop', { tree: ud.tree, power: axe === 'saw' ? 1.5 : axe === 'axe' ? 1 : 0.55 });
            ctx.player.practise('carpentry', 0.01);
            // Chopping is work, and the body is charged for it.
            ctx.player.extraWatts = 420;
            setTimeout(() => { ctx.player.extraWatts = 0; }, 1400);
          },
        };
      }

      if (ud.kind === 'deadfall') {
        return {
          verb: `take the deadfall (${Math.round(ud.timberKg || 8)} kg)`,
          hold: 2,
          act: () => {
            ctx.player.inventory.add({ item: 'timber', massKg: Math.min(18, ud.timberKg || 8), volumeL: 20, stackable: true });
            hit.actor.destroy();
            ctx.toast('Timber.');
          },
        };
      }

      if (ud.kind === 'shrub') {
        return {
          verb: 'search the bush',
          hold: 2.5,
          act: () => forage(hit.point),
        };
      }

      if (ud.kind === 'floor' || ud.kind === 'wall') {
        const room = ud.room || (ctx.state.roomHere || null);
        if (room && !roomExhausted(room)) {
          return { verb: `search the ${prettyRoom(room.type)}`, hold: 3.5, act: () => search(room) };
        }
      }

      if (ud.kind === 'item') {
        return { verb: `take the ${ud.item.item}`, act: () => pickup(hit.actor, ud.item) };
      }

      if (ud.kind === 'prop' && ud.prop) {
        const p = ud.prop;
        if (p.kind === 'mapWall') return { verb: 'read the map wall', hold: 2, act: () => ctx.emit('reveal-map', {}) };
        if (p.kind === 'rainBarrel') return { verb: 'drink from the barrel', hold: 2, act: () => drink('rainBarrel', true) };
        if (p.kind === 'woodpile') {
          return {
            verb: 'take firewood', hold: 1.5,
            act: () => {
              ctx.player.inventory.add({ item: 'firewood', massKg: 6, volumeL: 9, stackable: true });
              ctx.toast('Firewood.');
            },
          };
        }
        return { verb: `${p.kind.replace(/([A-Z])/g, ' $1').toLowerCase()}`, act: null };
      }

      return null;
    }

    function speciesName(c) {
      const s = SV.SPECIES[c.speciesId];
      return s ? s.name.toLowerCase() : 'carcass';
    }
    function prettyRoom(t) {
      return String(t).replace(/([A-Z])/g, ' $1').toLowerCase();
    }
    function bestTool(names) {
      for (const n of names) if (ctx.player.inventory.has(n)) return n;
      return null;
    }

    /* ---- searching ---- */

    const searched = new Map();       // room -> attempts

    function roomExhausted(room) {
      const tries = searched.get(room) || 0;
      const hidden = room.contents.filter((c) => c.hidden).length;
      return room.contents.length === 0 || (tries > 6 && hidden === 0);
    }

    function search(room) {
      const tries = (searched.get(room) || 0) + 1;
      searched.set(room, tries);
      ctx.player.practise('foraging', 0.006);

      // Obvious things first; the hidden ones need you to keep looking, and
      // some of them need several passes.
      const open = room.contents.filter((c) => !c.hidden && !c.taken);
      const hidden = room.contents.filter((c) => c.hidden && !c.taken
        && tries >= (c.searchesRequired || 2));

      const pool = open.length ? open : hidden;
      if (!pool.length) {
        const stillHidden = room.contents.some((c) => c.hidden && !c.taken);
        ctx.toast(stillHidden ? 'Something is not where you can see it.' : 'Nothing here.');
        return;
      }
      const found = pool[0];
      found.taken = true;
      const entry = itemEntry(found.item, found);
      ctx.player.inventory.add(entry);
      ctx.log(`${found.hiddenIn ? `${found.hiddenIn} — ` : ''}${entry.item}${entry.quantity > 1 ? ` ×${entry.quantity}` : ''}.`, true);
      ctx.emit('search', { room, found });

      /* Sweeping out a derelict building disturbs whatever the mice left,
         which is exactly how hantavirus gets in. The disease system decides
         whether it does; this only says that it happened. */
      if (Math.random() < 0.12) {
        ctx.player.disease.expose(SV.VECTOR.rodentDroppings, { hygiene: 0, load: 0.7 });
      }
    }

    function itemEntry(name, source) {
      const table = (ctx.state.itemTable && ctx.state.itemTable[name]) || null;
      return {
        item: name,
        massKg: table ? table.massKg : 0.5,
        volumeL: table ? table.volumeL : 0.7,
        stackable: table ? table.stackable !== false : true,
        quantity: (source && source.quantity) || 1,
        condition: (source && source.condition) != null ? source.condition : 1,
      };
    }

    function pickup(actor, item) {
      const res = ctx.player.inventory.add(itemEntry(item.item, item));
      if (!res.ok) { ctx.toast(res.reason); return; }
      try { actor.destroy(); } catch (e) { /* gone */ }
      ctx.emit('pickup', { item });
      ctx.toast(item.item);
    }

    function forage(point) {
      const b = ctx.biomeAt(point.x, point.z);
      const season = ctx.world.clock.season;
      // What a bush gives you depends on where it is and what month it is.
      const table = {
        deepForest: ['berries', 'mushrooms', 'bark'],
        woodland: ['berries', 'acorns', 'bark'],
        pineForest: ['pineNuts', 'bark', 'resin'],
        meadow: ['greens', 'roots'],
        prairie: ['greens', 'roots', 'seeds'],
        scrub: ['berries', 'roots'],
        riverbank: ['reeds', 'greens', 'cordage'],
        freshMarsh: ['reeds', 'cattailRoot'],
        beach: ['seaweed', 'shellfish'],
      };
      const pool = (b && table[b.id]) || ['bark'];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const winter = season === 'winter';
      if (winter && ['berries', 'greens', 'mushrooms', 'seeds'].includes(pick)) {
        ctx.toast('Nothing growing at this time of year.');
        return;
      }
      ctx.player.inventory.add(itemEntry(pick, { quantity: 1 + Math.floor(Math.random() * 3) }));
      ctx.player.practise('foraging', 0.01);
      ctx.toast(pick);
      /* Wild mushrooms are the one forage that can kill you, and the game
         will not tell you which these were. */
      if (pick === 'mushrooms') ctx.log('Mushrooms. You are not certain what kind.', true);
    }

    /* ---- butchering ---- */

    function butcher(carcass) {
      const ind = carcass.individual || { speciesId: carcass.speciesId, massKg: carcass.massKg, condition: 0.7 };
      const gloves = ctx.player.inventory.has('workGloves');
      const knife = bestTool(['knife', 'stoneKnife', 'axe']);
      if (!knife) { ctx.toast('You need a blade.'); return; }

      const y = SV.butcherYield(ind, {
        skill: ctx.player.skills.butchering,
        dayOfYear: ctx.world.clock.dayOfYear,
      });
      const take = Math.min(y.meatKg, carcass.meatRemainingKg);
      const got = carcass.takeMeat(take);
      carcass.skinned = true;

      ctx.player.inventory.add({
        item: `meat:${carcass.speciesId}`, massKg: got.kg, volumeL: got.kg * 1.1,
        stackable: true, quantity: 1,
        // The provision model owns what this is and what it does to you.
        provision: {
          name: `${speciesName(carcass)} meat`, kg: got.kg,
          kcalPerKg: (y.kcal / Math.max(y.meatKg, 0.01)),
          proteinFraction: y.proteinEnergyFraction,
          cut: SV.SPECIES[carcass.speciesId] && SV.SPECIES[carcass.speciesId].class === 'bear' ? 'bear' : 'muscle',
          pathogenVectors: y.exposures,
        },
      });
      if (y.hide) ctx.player.inventory.add({ item: 'hide', massKg: 2.5, volumeL: 6, stackable: true });
      if (y.fatKg > 0.05) {
        ctx.player.inventory.add({ item: 'fat', massKg: y.fatKg, volumeL: y.fatKg * 1.1, stackable: true });
      }
      ctx.player.practise('butchering', 0.03);

      /* Elbow-deep in an animal is where several of the diseases on this
         island get in, and gloves are most of the answer. */
      for (const v of y.exposures) {
        ctx.player.disease.expose(v, { hygiene: gloves ? 0.9 : 0.05, load: 1 });
      }

      ctx.log(`${got.kg.toFixed(1)} kg of meat${got.spoilage > 0.5 ? ', and it smells wrong' : ''}.`, true);
      if (y.proteinEnergyFraction > 0.8) {
        ctx.log('Almost no fat on it. You cannot live on this alone.');
      }
      ctx.emit('butcher', { carcass, yield: y });
    }

    /* ---- water ---- */

    function waterHere() {
      for (const b of ctx.world.fishery.bodies) {
        if (Math.hypot(b.x - ctx.player.x, b.z - ctx.player.z) < b.radiusM + 6) return b;
      }
      return ctx.groundY(ctx.player.x, ctx.player.z) < 1.4
        ? { name: 'the sea', kind: 'salt', radiusM: 0 } : null;
    }

    function drink(sourceName, treated) {
      const b = typeof sourceName === 'object' ? sourceName : waterHere();
      if (!b && !treated) { ctx.toast('No water within reach.'); return; }

      if (b && b.kind === 'salt') {
        // The physiology charges for it correctly: seawater costs more water
        // to excrete than it provides.
        ctx.player.body.drink(0.4, { salinityGL: 35 });
        ctx.log('You drink from the sea. You know better.', true);
        return;
      }

      const method = treated ? 'boiled' : 'none';
      const t = SV.treatWater(method, 0.6, { turbidity: 0.25 });
      SV.drinkTreated(ctx.player.body, ctx.player.disease, t, { source: SV.VECTOR.untreatedWater });
      ctx.log(treated ? 'You drink. It has been boiled.' : `You drink from ${b ? b.name : 'it'}. It has not been treated.`, true);
      ctx.emit('drink', { source: b, treated });
    }

    /* ---- the body's own business ---- */

    ctx.key('q', (c, ev) => {
      if (ev && ev.shiftKey) return;   // shift+Q gets you out of a saddle
      const st = ctx.player.body.status(ctx.world.clock.hourOfDay);
      if (!st.needsToilet) { ctx.toast('No need.'); return; }
      if (ctx.player.body.bladderMl > 150) {
        const ml = ctx.player.body.urinate();
        ctx.log(`You relieve yourself. ${Math.round(ml)} mL.`);
      }
      if (ctx.player.body.bowelKg > 0.12) {
        ctx.player.body.defecate();
        ctx.log('And the rest.');
      }
    }, 'Relieve yourself');

    ctx.key('v', () => {
      const body = ctx.player.body;
      body.asleep = !body.asleep;
      ctx.state.movementLocked = body.asleep;
      ctx.player.sheltered = body.asleep && (ctx.state.indoors || ctx.state.nearFire);
      ctx.log(body.asleep ? 'You lie down and close your eyes.' : 'You get up.', true);
      ctx.emit('sleep', { asleep: body.asleep });
    }, 'Sleep');

    ctx.key('j', () => drink(), 'Drink from what is here');

    /* ---- targeting ---- */

    /* Holding to work is polled rather than tracked from keydown/keyup,
       because there is more than one thing the player might be holding: E on
       a keyboard, a face button on a pad, a finger on a touch button. Each
       of those sets the same flag and the hold reads it. */
    function interactHeld() {
      return !!(ctx.game.input.down('e') || ctx.state.interactHeld);
    }

    ctx.key('e', () => {
      if (!target || !target.act) return;
      if (target.hold) { holdTime = 0; return; }
      target.act();
    }, 'Interact');

    ctx.onUpdate((dt) => {
      if (ctx.state.uiOpen) { ctx.hud.setPrompt(null); target = null; return; }

      const hit = ctx.lookedAt(4.5);
      target = offer(hit);
      ctx.state.interactTarget = target;

      if (!target) {
        // Nothing under the crosshair, but there may still be water at your
        // feet, which is worth saying when you are dying of thirst.
        const w = waterHere();
        /* On a pad, drinking lives on the wheel rather than on a button of its
           own, so the prompt says how to get there instead of naming a
           button that does something else. */
        const padded = ctx.game.input.pad.active;
        ctx.hud.setPrompt(w
          ? (padded
            ? `hold ${ctx.game.input.pad.glyph('lb')} → Drink  ·  ${w.name}`
            : `J  drink from ${w.name}`)
          : null);
        return;
      }

      if (!target.act) { ctx.hud.setPrompt(target.verb); return; }

      if (target.hold && interactHeld()) {
        if (holdDone) {
          // The work is done and the button is still down. Repeating jobs —
          // swinging an axe — start again; one-off jobs wait for a release.
          ctx.hud.setPrompt(`${target.verb}  done`);
          return;
        }
        holdTime += dt;
        const pct = Math.min(1, holdTime / target.hold);
        ctx.hud.setPrompt(`${target.verb}  ${'█'.repeat(Math.round(pct * 14)).padEnd(14, '░')}`);
        if (pct >= 1) {
          target.act();
          holdTime = 0;
          holdDone = !target.repeat;
        }
      } else {
        holdTime = 0;
        holdDone = false;
        ctx.hud.setPrompt(`${ctx.hint('e', 'x')}  ${target.verb}${target.hold ? ' (hold)' : ''}`);
      }
    });
  },
});
