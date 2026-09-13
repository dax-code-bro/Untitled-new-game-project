/* The character you become, and keeping it.

   Two things that belong together because they are the same record:
   how long this player has actually lived on the island, and getting
   that off the machine and back again.

   Hours lived are hours a character was alive in a world — not hours
   the tab was open, and not wall clock. They survive dying, because
   the thing that hardened is the player, and they are the only number
   in the game that persists between worlds.

   What the hours buy is applied HERE by handing each system the
   multiplier it asked for, so nothing in the simulation has to know
   that veterancy exists.

   Emits:  'veterancy-rank' { title, vitality }
   State:  ctx.state.veterancy, ctx.state.saveGame(), ctx.state.quitToTitle()
*/
SurvivorGame.module({
  id: 'veterancy',
  order: 28,

  init(ctx) {
    const { SV } = ctx;
    const KEY = 'survivor.veterancy';
    const SAVE = 'survivor.save';

    let vet;
    try { vet = SV.Veterancy.load(localStorage.getItem(KEY)); }
    catch (e) { vet = new SV.Veterancy(); }
    ctx.state.veterancy = vet;

    let lastTitle = vet.stats.title;
    let walkedFrom = { x: ctx.player.x, z: ctx.player.z };
    let sinceSave = 0;

    function persist() {
      try { localStorage.setItem(KEY, JSON.stringify(vet.serialize())); }
      catch (e) { /* private window: the run still counts, it just will not keep */ }
    }

    /* Hand every system the multiplier it asked for. Doing it here, once
       a second, keeps the coupling one-directional: the simulation never
       looks up what a veteran is. */
    function apply() {
      const v = vet.stats;
      if (ctx.player.injury) ctx.player.injury.boneToughness = v.boneToughness;
      ctx.state.recoilControl = v.recoilControl;
      ctx.state.steadiness = v.steadiness;
      ctx.state.coldTolerance = v.coldTolerance;
      ctx.state.loadEfficiency = v.loadEfficiency;
      if (ctx.player.body) {
        // Conditioning: more blood to lose and a heart that moves it.
        ctx.player.body.veteranBloodReserve = v.bloodReserve;
      }
      if (v.title !== lastTitle) {
        lastTitle = v.title;
        ctx.log(`You are ${v.title} now. ${v.vitality} vitality.`, true);
        ctx.emit('veterancy-rank', { title: v.title, vitality: v.vitality });
      }
    }
    apply();

    /* ---- saving ---- */

    function snapshot() {
      return {
        at: Date.now(),
        day: ctx.world.clock.totalDays,
        hour: ctx.world.clock.hourOfDay,
        seed: ctx.world.seed != null ? ctx.world.seed : null,
        world: (() => { try { return ctx.world.serialize(); } catch (e) { return null; } })(),
        veterancy: vet.serialize(),
      };
    }

    function saveGame(quiet) {
      const snap = snapshot();
      let ok = true;
      try { localStorage.setItem(SAVE, JSON.stringify(snap)); }
      catch (e) { ok = false; }
      /* The island itself is saved by the menu, which owns the only
         thing that can serialise a world. This record is the player's
         side of it — hours lived, lives lost, what they have become —
         and both have to be written or coming back is only half a
         return. */
      if (ctx.state.saveIsland) { if (!ctx.state.saveIsland()) ok = false; }
      persist();
      if (!quiet) {
        ctx.toast(ok ? 'Saved.' : 'Could not save — no room, or a private window.');
        if (ok) ctx.log(`Saved on day ${snap.day + 1}.`, true);
      }
      return ok;
    }
    ctx.state.saveGame = saveGame;

    /* Quitting belongs to the menu, which knows how to get back to the
       boot screen; this only makes sure the player record goes with it. */
    const menuQuit = ctx.state.quitToTitle;
    ctx.state.quitToTitle = () => {
      const snap = snapshot();
      try { localStorage.setItem(SAVE, JSON.stringify(snap)); } catch (e) { /* private window */ }
      persist();
      if (menuQuit) return menuQuit();
      ctx.log('Saved. Reload the page to come back to it.', true);
      ctx.toast('Saved — you can close the tab.');
      return true;
    };

    ctx.state.hasSave = () => {
      try { return !!localStorage.getItem(SAVE); } catch (e) { return false; }
    };

    /* ---- the panel ---- */

    const panel = ctx.hud.panel('veterancy', {
      className: 'panel',
      style: 'left:16px;bottom:200px;width:250px;display:none;pointer-events:none;z-index:21',
    });

    function render() {
      const v = vet.stats;
      panel.style.display = 'block';
      panel.innerHTML = '<h2>the survivor</h2>'
        + `<div class="row"><span class="k">vitality</span><span class="v">${v.vitality}</span></div>`
        + `<div class="row"><span class="k">${v.title}</span>`
        + `<span class="v">${v.hours < 1 ? `${Math.round(v.hours * 60)} min` : `${v.hours.toFixed(1)} h`}</span></div>`
        + `<div class="row"><span class="k">recoil</span><span class="v">${Math.round((1 - v.recoilControl) * 100)}% tamed</span></div>`
        + `<div class="row"><span class="k">bone</span><span class="v">+${Math.round((v.boneToughness - 1) * 100)}%</span></div>`
        + (vet.livesLost ? `<div class="row"><span class="k">lives lost</span><span class="v">${vet.livesLost}</span></div>` : '');
    }

    /* Shown with the condition sheet rather than always: it is a thing
       you check, not a thing you watch. */
    let showing = false;
    ctx.key('v', (c, ev) => {
      if (!ev || !ev.shiftKey) return;          // plain V is sleep
      showing = !showing;
      if (showing) render(); else panel.style.display = 'none';
    }, 'The survivor you have become (shift+V)');

    ctx.key('k', (c, ev) => {
      // Plain K treats water; shift+K saves.
      if (!ev || !ev.shiftKey) return;
      saveGame(false);
    }, 'Save the island and your record (shift+K)');

    ctx.on('death', () => {
      vet.livesLost++;
      vet.daysSurvivedBest = Math.max(vet.daysSurvivedBest, ctx.world.clock.totalDays + 1);
      persist();
    });
    ctx.on('animal-down', () => { vet.animalsTaken++; });

    /* ---- the clock on it ---- */

    ctx.onUpdate((dt) => {
      if (ctx.paused || !ctx.player.body || !ctx.player.body.alive) return;
      // Simulated seconds actually lived, so time skipped by sleeping
      // counts and time with the tab in the background does not.
      vet.live(dt * (ctx.world.clock.rate || 1));
      const dx = ctx.player.x - walkedFrom.x, dz = ctx.player.z - walkedFrom.z;
      vet.metresWalked += Math.hypot(dx, dz);
      walkedFrom = { x: ctx.player.x, z: ctx.player.z };

      sinceSave += dt;
      if (sinceSave > 60) {
        sinceSave = 0;
        apply();
        persist();
        if (showing) render();
      }
    });

    const v0 = vet.stats;
    if (v0.hours > 0.5) {
      ctx.log(`${v0.hours.toFixed(1)} hours on this island so far — ${v0.title}, ${v0.vitality} vitality.`, true);
    }
  },
});
