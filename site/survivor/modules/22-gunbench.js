/* The bench: where a gun comes apart.

   The design asks that you can take a weapon apart, look at every
   individual piece and put it back together — possibly differently. That
   is this file. It is not an inventory screen with a "clean" button on
   it: the gun is laid out in front of you in 3-D, exploded along each
   part's own axis, and you pick pieces off it in the order they actually
   come off. A scope goes before a bolt. A firing pin goes after the bolt
   it lives in. A barrel does not leave the stock while the stock is on.

   Every part you have off can be looked at — condition and fouling in
   words, not numbers — scrubbed with solvent, oiled, or swapped for the
   same part out of another gun. What goes back on has to go back in the
   reverse order, and a spring you dropped in the grass is gone.

   The bore is the exception. It never comes off, and it is cleaned the
   way a bore is cleaned: a rod, a brush for the copper, patches for the
   carbon, and you read the patch coming out rather than a percentage.

   Emits:  'weapon-stripped'  { weapon, part }
           'weapon-rebuilt'   { weapon }
   State:  ctx.state.benchOpen
*/
SurvivorGame.module({
  id: 'gunbench',
  order: 22,

  init(ctx) {
    const { LE, SV, game } = ctx;

    let open = false;
    let firearm = null;
    let strip = null;            // SV.StripState
    let job = null;              // SV.CleaningJob
    let asm = null;
    let actors = [];             // { id, actor, part, home }
    let selected = null;
    let spin = 0;

    const panel = ctx.hud.panel('gunbench', {
      className: 'panel',
      style: 'right:16px;top:16px;width:340px;max-height:calc(100vh - 32px);'
        + 'overflow:auto;display:none;pointer-events:auto;z-index:30',
    });
    const hint = ctx.hud.panel('gunbenchHint', {
      className: 'panel',
      style: 'left:50%;transform:translateX(-50%);bottom:18px;display:none;'
        + 'pointer-events:none;z-index:30;text-align:center',
    });

    /* Where a part sits when the gun is open on the bench. Each one moves
       along its own strip axis, so the exploded view is the strip order
       made visible rather than an arbitrary scatter. */
    /* How far a removed part moves out. The strip vectors are written at
       full separation so the assembly diagram is unambiguous; at that
       scale a fully stripped rifle is nearly two metres across and most
       of it is off the edge of the screen, so the view pulls them in. */
    const EXPLODE = 0.55;
    function homeFor(part, removed) {
      const at = part.at;
      if (!removed || !part.strip) return [at[0], at[1], at[2]];
      return [
        at[0] + part.strip[0] * EXPLODE,
        at[1] + part.strip[1] * EXPLODE,
        at[2] + part.strip[2] * EXPLODE,
      ];
    }

    function build() {
      teardown();
      asm = LE.assembleGun(
        (ctx.state.currentRig && ctx.state.currentRig.profileId) || 'boltRifle',
        { attachments: firearm.attachments },
      );
      strip = new SV.StripState(asm, firearm);
      job = new SV.CleaningJob(firearm);
      for (const part of asm.parts) {
        if (part.virtual || !part.build) continue;
        const geo = part.build();
        if (!geo.positions || !geo.positions.length) continue;
        const mat = Object.assign({}, LE.GUN_MATERIAL[part.mat] || LE.GUN_MATERIAL.blued);
        const a = game.mesh({
          geometry: geo, key: `bench:${asm.profileId}:${part.id}`, material: mat,
          at: [0, -1000, 0], physics: false, name: `bench:${part.id}`,
        });
        if (!a) continue;
        a.noCull = true;
        actors.push({ id: part.id, actor: a, part, home: homeFor(part, false) });
      }
    }

    function teardown() {
      for (const e of actors) { try { e.actor.destroy(); } catch (err) { /* gone */ } }
      actors = [];
    }

    /* ---- the parts list ---- */

    function simPartFor(id) {
      const p = asm.parts.find((x) => x.id === id);
      return p && p.simPart ? firearm.parts[p.simPart] : null;
    }

    function wordsFor(id) {
      const sp = simPartFor(id);
      if (!sp) return { verdict: 'on', symptom: null, fouling: 0 };
      const report = SV.benchReport(firearm);
      const row = report.find((r) => r.name === sp.spec.name);
      return row || { verdict: 'on', symptom: null, fouling: sp.fouling };
    }

    function render() {
      if (!open || !firearm) return;
      const rows = [];
      rows.push(`<h2>${firearm.name}</h2>`);
      const bore = firearm.fouling, cu = firearm.copperFouling || 0;
      rows.push(`<p class="muted">${firearm.roundsFired} rounds fired, `
        + `${firearm.roundsSinceCleaning} since it was last cleaned.</p>`);

      /* The bore, first, because it is the part that decides whether the
         rifle still shoots and the only one you cannot take off. */
      rows.push('<h3>the bore</h3>');
      rows.push(`<p>${bore > 0.6 ? 'Thick with carbon.' : bore > 0.3 ? 'Dirty.'
        : bore > 0.08 ? 'Lightly fouled.' : 'Clean.'}`
        + `${cu > 0.35 ? ' Copper plated into the lands.' : cu > 0.12 ? ' Some copper.' : ''}</p>`);
      rows.push('<div>'
        + '<button data-act="patch">patch</button>'
        + '<button data-act="brush">bronze brush</button>'
        + '<button data-act="snake">bore snake</button>'
        + '</div>');
      if (lastPatch) rows.push(`<p class="warnText">${lastPatch}</p>`);

      rows.push('<h3>parts</h3>');
      rows.push('<table>');
      for (const part of asm.parts) {
        if (part.virtual) continue;
        const off = !strip.present(part.id);
        const lost = strip.lost.has(part.id);
        const w = wordsFor(part.id);
        const sel = selected === part.id;
        const cls = lost ? 'badText' : off ? 'warnText' : 'muted';
        rows.push(`<tr data-part="${part.id}" style="cursor:pointer;${sel ? 'background:rgba(233,228,217,.10)' : ''}">`
          + `<td>${sel ? '▸ ' : ''}${part.name}</td>`
          + `<td class="${cls}">${lost ? 'lost' : off ? 'off' : w.verdict}</td></tr>`);
      }
      rows.push('</table>');

      if (selected) {
        const part = asm.parts.find((x) => x.id === selected);
        const w = wordsFor(selected);
        const off = !strip.present(selected);
        rows.push(`<h3>${part.name}</h3>`);
        if (part.note) rows.push(`<p class="muted">${part.note}</p>`);
        if (w.symptom) rows.push(`<p class="warnText">${w.symptom}</p>`);
        else if (w.verdict !== 'on') rows.push(`<p>${w.verdict}.</p>`);
        if (w.fouling > 0.3) rows.push('<p class="warnText">There is carbon on it.</p>');
        const can = strip.canRemove(selected);
        rows.push('<div>');
        if (!off) {
          rows.push(`<button data-act="remove" ${can.ok ? '' : 'disabled'}>`
            + `${can.ok ? `take it off (${fmt(can.seconds)})` : 'blocked'}</button>`);
        } else if (!strip.lost.has(selected)) {
          rows.push('<button data-act="refit">put it back</button>');
        }
        if (off && simPartFor(selected)) rows.push('<button data-act="scrub">scrub it</button>');
        rows.push('</div>');
        if (!can.ok && !off) rows.push(`<p class="faint">${can.reason}</p>`);
      }

      const next = strip.nextSteps();
      if (next.length && !selected) {
        rows.push(`<p class="faint">Next off: ${next.slice(0, 3).map((n) => n.name).join(', ')}.</p>`);
      }
      if (strip.removed.size) {
        rows.push(`<p class="faint">${strip.removed.size} parts off. `
          + `${fmt(strip.elapsed)} at the bench so far.</p>`);
      }
      rows.push('<div><button data-act="oil">oil it</button>'
        + '<button data-act="close">done</button></div>');
      panel.innerHTML = rows.join('');

      for (const tr of panel.querySelectorAll('[data-part]')) {
        tr.onclick = () => { selected = tr.dataset.part; render(); place(); };
      }
      for (const b of panel.querySelectorAll('[data-act]')) {
        b.onclick = () => act(b.dataset.act);
      }
    }

    function fmt(sec) {
      if (sec < 90) return `${Math.round(sec)}s`;
      if (sec < 5400) return `${Math.round(sec / 60)} min`;
      return `${(sec / 3600).toFixed(1)} h`;
    }

    let lastPatch = null;

    function act(a) {
      if (a === 'close') { close(); return; }
      const solvent = ctx.player.inventory.has('solvent') || ctx.player.inventory.has('gunOil');
      const hasRod = ctx.player.inventory.has('cleaningRod');
      if (a === 'patch' || a === 'brush' || a === 'snake') {
        const kind = a === 'snake' ? 'boreSnake' : a;
        const out = job.pass(kind, { hasRod, solvent });
        if (!out.ok) { ctx.toast(out.reason); return; }
        lastPatch = out.patch;
        ctx.state.busySeconds = (ctx.state.busySeconds || 0) + out.seconds;
        if (out.done) ctx.log('The bore is clean.', true);
        render();
        return;
      }
      if (a === 'oil') {
        const out = firearm.oil(1, { oil: ctx.player.inventory.has('gunOil') });
        ctx.toast(out.ok ? (out.warning || 'Oiled.') : out.reason);
        render();
        return;
      }
      if (!selected) return;
      if (a === 'remove') {
        const out = strip.remove(selected, { onBench: true, rng: Math.random });
        if (!out.ok) { ctx.toast(out.reason); return; }
        ctx.emit('weapon-stripped', { weapon: firearm, part: selected });
        ctx.state.busySeconds = (ctx.state.busySeconds || 0) + out.seconds;
        if (out.lost) ctx.log(out.reason, true);
        firearm.disassembled = strip.open;
      } else if (a === 'refit') {
        const out = strip.refit(selected);
        if (!out.ok) { ctx.toast(out.reason); return; }
        firearm.disassembled = strip.open;
        if (strip.complete()) {
          // Putting it back together is what actually gets the fouling out
          // of the action, because that is when the parts you cleaned go in.
          let f = 0, n = 0;
          for (const p of Object.values(firearm.parts)) { f += p.fouling; n++; }
          firearm.fouling = Math.min(firearm.fouling, n ? f / n : firearm.fouling);
          ctx.emit('weapon-rebuilt', { weapon: firearm });
          ctx.log(`${firearm.name} back together. ${(firearm.reliability() * 100).toFixed(0)}% reliable.`, true);
        }
      } else if (a === 'scrub') {
        const p = asm.parts.find((x) => x.id === selected);
        const out = job.scrub(p.simPart, { solvent });
        if (!out.ok) { ctx.toast(out.reason); return; }
        ctx.state.busySeconds = (ctx.state.busySeconds || 0) + out.seconds;
        if (out.note) ctx.log(out.note, true);
        ctx.toast(`${out.cleaned} scrubbed.`);
      }
      render();
      place();
    }

    /* ---- the gun on the bench ---- */

    const _p = new LE.Vec3(), _q = new LE.Quat();

    function place() {
      if (!open || !asm) return;
      const cam = game.camera;
      // The gun floats in front of the camera, turning slowly, broadside.
      /* Out in front and a little to the left, clear of the parts panel
         on the right, and turned broadside — the gun lies along its own
         +Z, so at zero yaw you are looking straight down the muzzle at
         it and it reads as a stick. */
      const base = new LE.Vec3().copy(cam.position)
        .addScaled(cam.forward, 1.45)
        .addScaled(cam.right, -0.22)
        .addScaled(cam.trueUp, -0.04);
      const turn = Math.PI * 0.5 + spin;
      _q.setEuler(-0.12, turn, 0);
      for (const e of actors) {
        const off = !strip.present(e.id);
        const home = homeFor(e.part, off);
        const lift = selected === e.id ? 0.05 : 0;
        _p.set(home[0], home[1] + lift, home[2]).applyQuat(_q);
        e.actor.setPosition([base.x + _p.x, base.y + _p.y, base.z + _p.z]);
        e.actor.setRotation([-7, (turn * 180) / Math.PI, 0]);
        e.actor.visible = true;
        e.actor.setTint(selected === e.id ? 0xffd9a0 : 0xffffff);
      }
    }

    /* ---- open and close ---- */

    function openBench() {
      firearm = ctx.state.currentWeapon;
      if (!firearm) { ctx.toast('Nothing in your hands.'); return; }
      if (firearm.chambered) { ctx.toast('Clear the chamber first.'); return; }
      open = true;
      ctx.state.benchOpen = true;
      ctx.state.uiOpen = true;
      ctx.state.movementLocked = true;
      selected = null;
      lastPatch = null;
      build();
      panel.style.display = 'block';
      hint.style.display = 'block';
      hint.innerHTML = 'Click a part to pick it up &middot; <b>A</b>/<b>D</b> turn it &middot; '
        + '<b>Esc</b> when you are done';
      render();
      place();
      ctx.log('You lay the rifle out on the bench.', true);
    }

    function close() {
      open = false;
      ctx.state.benchOpen = false;
      ctx.state.uiOpen = false;
      ctx.state.movementLocked = false;
      panel.style.display = 'none';
      hint.style.display = 'none';
      teardown();
      // Whatever came off or went back on changes what the gun looks like.
      if (ctx.state.rebuildWeaponRig) ctx.state.rebuildWeaponRig();
    }

    ctx.key('i', (c, ev) => {
      if (!ev || !ev.shiftKey) return;         // plain I is "look it over"
      if (open) close(); else openBench();
    }, 'Strip it on the bench (shift+I)');

    ctx.key('escape', () => { if (open) close(); });
    ctx.state.openGunBench = openBench;

    ctx.onUpdate((dt) => {
      if (!open) return;
      // Turning it over in your hands is how you look at the other side.
      if (game.input.down('a')) spin -= dt * 1.6;
      if (game.input.down('d')) spin += dt * 1.6;
      spin += dt * 0.06;
      place();
      /* Bench work takes real time, and the world runs while it happens —
         which is the cost of a detail strip in the field. */
      if (ctx.state.busySeconds > 0) {
        const chunk = Math.min(ctx.state.busySeconds, dt * 90);
        ctx.state.busySeconds -= chunk;
        try { ctx.world.step(chunk); } catch (e) { /* the clock will catch up */ }
      }
    }, { whilePaused: false });
  },
});
