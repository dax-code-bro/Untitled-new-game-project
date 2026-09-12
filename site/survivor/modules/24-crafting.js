/* Crafting, and the gathering that feeds it.

   The island had a locked door in it: felling a tree needed an axe,
   building needed planks and nails, and there was no recipe for any of
   the three. A player who did not find a hatchet lying in a house had
   no move at all, and froze. This is the handle on that door.

   Everything starts at things you can pick up with bare hands — sticks,
   stones, flint, plant fibre, bark — and the tree goes:

     fibre -> cordage -> stone knife -> stone axe -> timber -> planks

   Gathering is a verb on the things already in the world rather than a
   new set of objects: a bush gives fibre and sticks, a rock gives stone
   and sometimes flint, a tree gives bark if you have something to cut
   with, and a deadfall gives sticks and bark for free. Nothing is
   instant, because time and warmth are what this game charges in.

   Emits:  'crafted' { id, n }
           'gathered' { item, n }
   State:  ctx.state.craftOpen, ctx.state.toolsPresent()
*/
SurvivorGame.module({
  id: 'crafting',
  order: 24,

  init(ctx) {
    const { LE, SV, game } = ctx;
    const inv = () => ctx.player.inventory;

    /* ---- what is in the pack, counted ---- */

    function counts() {
      const out = {};
      for (const s of inv().slots) out[s.item] = (out[s.item] || 0) + (s.quantity || 1);
      return out;
    }

    /* Which capabilities the player currently has. A lit fire within a
       few metres counts as a tool, because for charcoal and nails it is
       one. */
    function toolsPresent() {
      const t = [];
      for (const s of inv().slots) t.push(s.item);
      if (ctx.state.nearFire) t.push('fire');
      return t;
    }
    ctx.state.toolsPresent = toolsPresent;

    /* Put it in the pack, or on the ground at your feet if the pack is
       full. Ignoring the return of add() meant a full pack silently ate
       everything you made: you spent the materials, spent the hours, and
       got nothing, with no message. */
    function give(item, n = 1, extra = {}) {
      const bulk = SV.bulkOf ? SV.bulkOf(item) : { massKg: 0.3, volumeL: 0.4 };
      let placed = 0;
      for (let i = 0; i < n; i++) {
        const r = inv().add(Object.assign({
          item, quantity: 1, stackable: true, massKg: bulk.massKg, volumeL: bulk.volumeL,
        }, extra));
        if (r && r.ok === false) break;
        placed++;
      }
      if (placed < n) {
        ctx.toast(`Your pack is full — ${n - placed} left on the ground.`);
        ctx.log(`No room for ${n - placed} ${item}. It is at your feet.`, true);
      }
      return placed;
    }

    /* ---- gathering ---- */

    const rng = new LE.Rng(0x6a71);

    function gather(kind, sourceName) {
      const g = SV.GATHER[kind];
      if (!g) return;
      if (g.tool && !SV.toolSatisfied(g.tool, toolsPresent())) {
        ctx.toast(`You need something to cut with.`);
        return;
      }
      if (g.chance != null && rng.next() > g.chance) {
        ctx.log(`You turn over the ${sourceName} and find nothing worth having.`);
        ctx.state.busySeconds = (ctx.state.busySeconds || 0) + g.seconds;
        return;
      }
      const n = rng.int(g.yield[0], g.yield[1]);
      const got = give(kind, n);
      if (!got) { ctx.toast('Your pack is full.'); return; }
      ctx.state.busySeconds = (ctx.state.busySeconds || 0) + g.seconds;
      ctx.log(`${got} ${g.name}${got > 1 && !/ /.test(g.name) ? 's' : ''} from the ${sourceName}.`, true);
      ctx.player.practise('carpentry', 0.002);
      ctx.emit('gathered', { item: kind, n });
    }

    /* Gathering hangs off whatever is already in the world. The offer
       hook runs before the built-in verbs, so a tree still offers to be
       felled — this only adds what you can take without an axe. */
    ctx.state.offerHooks = ctx.state.offerHooks || [];
    ctx.state.offerHooks.push((hit, ud) => {
      if (ctx.state.craftOpen) return null;
      const cutting = SV.toolSatisfied('cutting', toolsPresent());
      if (ud.kind === 'tree' && ud.tree) {
        // With an axe the built-in "fell it" verb is the better offer.
        if (SV.toolSatisfied('axe', toolsPresent())) return null;
        if (!cutting) return null;
        return { verb: `strip bark from the ${ud.tree.spec.name}`, hold: 2.4, act: () => gather('bark', 'trunk') };
      }
      if (ud.kind === 'deadfall') {
        return {
          verb: 'break up the deadfall for sticks', hold: 1.6,
          act: () => { gather('stick', 'deadfall'); if (cutting) gather('bark', 'deadfall'); },
        };
      }
      if (ud.kind === 'shrub' || ud.kind === 'bush' || ud.kind === 'reeds') {
        return {
          verb: 'strip fibre and sticks', hold: 1.8,
          act: () => { gather('plantFibre', 'bush'); gather('stick', 'bush'); },
        };
      }
      if (ud.kind === 'rock' || ud.kind === 'stone' || ud.kind === 'boulder' || ud.kind === 'scree') {
        return {
          verb: 'work the rock for stone and flint', hold: 2.2,
          act: () => { gather('stone', 'rock'); gather('flint', 'rock'); },
        };
      }
      if (ud.kind === 'wreck' || ud.kind === 'container' || ud.kind === 'machine') {
        return {
          verb: 'strip scrap metal', hold: 2.6,
          act: () => gather('scrapMetal', 'wreck'),
        };
      }
      if (ud.kind === 'woodpile' || ud.kind === 'lumber') {
        return {
          verb: 'take sticks and bark', hold: 1.4,
          act: () => { gather('stick', 'woodpile'); if (cutting) gather('bark', 'woodpile'); },
        };
      }
      return null;
    });

    /* Nothing under the crosshair, standing on open ground: you can
       still pick up what is lying about. This is the bare-hands floor
       of the whole tree and it must never be unavailable. */
    ctx.state.offerHooks.push((hit, ud) => {
      if (ud.kind || ctx.state.craftOpen) return null;
      if (hit.distance > 3.4) return null;
      const st = ctx.state.stance;
      if (st === 'prone' || st === 'crouched' || ctx.state.crouchHeld) return null;  // casting about
      const b = ctx.biomeAt(ctx.player.x, ctx.player.z);
      const id = b ? b.id : '';
      const shore = /beach|dune|shore|bank/i.test(id);
      const wooded = /forest|wood|thicket/i.test(id);
      return {
        verb: shore ? 'search the tideline' : wooded ? 'search the forest floor' : 'search the ground',
        hold: 2.0,
        act: () => {
          const got = [];
          if (wooded || rng.next() < 0.5) { gather('stick', 'ground'); got.push('stick'); }
          if (rng.next() < 0.7) { gather('plantFibre', 'ground'); got.push('fibre'); }
          if (shore || rng.next() < 0.5) { gather('stone', 'ground'); got.push('stone'); }
          if (rng.next() < 0.35) gather('flint', 'ground');
          if (shore && rng.next() < 0.4) gather('feather', 'tideline');
          if (!got.length) ctx.log('Nothing but dirt.');
        },
      };
    });

    /* ---- the crafting screen ---- */

    let open = false;
    let selected = null;
    let filter = 'all';

    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.hidden = true;
    screen.innerHTML = '<div class="sheet" style="width:min(900px,94vw)"></div>';
    document.body.appendChild(screen);
    const sheet = screen.querySelector('.sheet');

    function fmtTime(sec) {
      if (sec < 90) return `${Math.round(sec)}s`;
      if (sec < 5400) return `${Math.round(sec / 60)} min`;
      return `${(sec / 3600).toFixed(1)} h`;
    }

    function render() {
      if (!open) return;
      const c = counts();
      const tools = toolsPresent();
      const skill = ctx.player.skills.carpentry;
      const list = SV.craftable(c, tools, skill);
      const cats = ['all', 'survival', 'tools', 'materials', 'clothing'];

      const rows = [];
      rows.push('<h2>Make something</h2>');
      rows.push('<p class="lede">Everything starts with what you can pick up. '
        + 'Look at a bush, a deadfall or a rock and hold the interact button; '
        + 'on open ground, search it.</p>');
      rows.push(`<div>${cats.map((k) => `<button data-cat="${k}"${filter === k ? ' class="on"' : ''}>${k}</button>`).join('')}</div>`);

      rows.push('<div class="cols">');
      rows.push('<div><table>');
      for (const e of list) {
        if (filter !== 'all' && e.recipe.category !== filter) continue;
        const cls = e.ok ? 'goodText' : (e.missing.length + e.missingTools.length <= 1 ? 'warnText' : 'faint');
        rows.push(`<tr data-r="${e.id}" style="cursor:pointer;${selected === e.id ? 'background:rgba(233,228,217,.10)' : ''}">`
          + `<td>${selected === e.id ? '▸ ' : ''}${e.recipe.name}</td>`
          + `<td class="${cls}">${e.ok ? fmtTime(e.seconds) : 'short'}</td></tr>`);
      }
      rows.push('</table></div>');

      rows.push('<div>');
      if (selected && SV.RECIPES[selected]) {
        const r = SV.RECIPES[selected];
        const chk = SV.canCraft(selected, c, tools);
        rows.push(`<h3>${r.name}</h3>`);
        if (r.note) rows.push(`<p class="muted">${r.note}</p>`);
        rows.push('<h3>needs</h3><table>');
        for (const [item, n] of Object.entries(r.consumes)) {
          const have = c[item] || 0;
          rows.push(`<tr><td>${item.replace(/([A-Z])/g, ' $1').toLowerCase()}</td>`
            + `<td class="${have >= n ? 'goodText' : 'badText'}">${have} / ${n}</td></tr>`);
        }
        for (const t of (r.needs || [])) {
          const okT = SV.toolSatisfied(t, tools);
          rows.push(`<tr><td>${t.replace(/([A-Z])/g, ' $1').toLowerCase()}</td>`
            + `<td class="${okT ? 'goodText' : 'badText'}">${okT ? 'in hand' : 'missing'}</td></tr>`);
        }
        rows.push('</table>');
        rows.push(`<p class="muted">About ${fmtTime(SV.craftSeconds(selected, skill))} at your level.</p>`);
        rows.push(`<div><button data-make="${selected}"${chk.ok ? '' : ' disabled'}>`
          + `${chk.ok ? 'make it' : 'you are short'}</button></div>`);
      } else {
        rows.push('<p class="faint">Pick something on the left.</p>');
      }
      rows.push('</div></div>');

      rows.push('<h3>in your pack</h3><p class="muted">'
        + (Object.keys(c).length
          ? Object.entries(c).map(([k, v]) => `${k} ×${v}`).join(' &middot; ')
          : 'nothing at all')
        + '</p>');
      rows.push('<div><button data-close="1">close</button></div>');
      sheet.innerHTML = rows.join('');

      for (const b of sheet.querySelectorAll('[data-cat]')) b.onclick = () => { filter = b.dataset.cat; render(); };
      for (const t of sheet.querySelectorAll('[data-r]')) t.onclick = () => { selected = t.dataset.r; render(); };
      for (const b of sheet.querySelectorAll('[data-make]')) b.onclick = () => make(b.dataset.make);
      for (const b of sheet.querySelectorAll('[data-close]')) b.onclick = () => toggle(false);
    }

    function make(id) {
      const r = SV.RECIPES[id];
      const chk = SV.canCraft(id, counts(), toolsPresent());
      if (!chk.ok) { ctx.toast('You are short of something.'); return; }
      const skill = ctx.player.skills.carpentry;
      const out = SV.craftAttempt(id, skill, () => Math.random());
      // The materials go whatever happens.
      for (const [item, n] of Object.entries(r.consumes)) inv().remove(item, n);
      ctx.state.busySeconds = (ctx.state.busySeconds || 0) + out.seconds;
      ctx.player.practise(r.skill || 'carpentry', 0.02 + (r.difficulty || 0) * 0.04);
      if (!out.ok) {
        ctx.log(`The ${r.name} ${out.reason}. ${out.salvage === 'partial'
          ? 'Some of it is still usable.' : 'That is a morning gone.'}`, true);
        if (out.salvage === 'partial') {
          const first = Object.keys(r.consumes)[0];
          give(first, Math.max(1, Math.floor(r.consumes[first] / 2)));
        }
        render();
        return;
      }
      const made = give(id, out.yield, {
        condition: 1, durability: r.durability || null,
        clo: r.clo || null, slot: r.slot || null,
      });
      if (!made) { ctx.log('There is no room in your pack for it.', true); render(); return; }
      ctx.log(`${made > 1 ? `${made} ` : ''}${r.name} — ${fmtTime(out.seconds)}.`, true);
      ctx.emit('crafted', { id, n: made });
      render();
    }

    function toggle(v) {
      open = v == null ? !open : v;
      screen.hidden = !open;
      ctx.state.craftOpen = open;
      ctx.state.uiOpen = open;
      ctx.state.movementLocked = open;
      if (open) render();
    }

    ctx.key('c', (c2, ev) => {
      // Plain C is the medical sheet; shift+C is the workbench in your head.
      if (!ev || !ev.shiftKey) return;
      toggle();
    }, 'Crafting (shift+C)');
    ctx.key('escape', () => { if (open) toggle(false); });
    ctx.state.openCrafting = () => toggle(true);

    /* Bench work and gathering both cost real time, and the world runs
       while they happen. Without this the island would be a place where
       an eight-hour tanning job took no time at all. */
    ctx.onUpdate((dt) => {
      if (ctx.state.busySeconds > 0) {
        const chunk = Math.min(ctx.state.busySeconds, dt * 120);
        ctx.state.busySeconds -= chunk;
        try { ctx.world.step(chunk); } catch (e) { /* the clock catches up */ }
      }
    });

    ctx.log('Nothing here is given to you. Search the ground, strip fibre from a bush, '
      + 'work a rock for flint — then shift+C to make something out of it.', true);
    void game;
  },
});
