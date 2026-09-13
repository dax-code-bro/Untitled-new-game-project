/* The first hour, guided.

   The island does not explain itself, and the consequence was a player
   freezing to death on the shore with no idea that bark existed. This
   fixes that at the root: a short, skippable sequence that hands you
   the four things you cannot survive without and then gets out of the
   way.

     search the ground  ->  cordage  ->  stone knife  ->  stone axe
     ->  pickaxe and spear  ->  fire and a shelter  ->  a house
     ->  a bow  ->  your first deer  ->  you are on your own

   Every step watches the REAL game state. Nothing here gives you
   anything, nothing here fakes a completion, and nothing here blocks
   an action: if you wander off and build a house before it asks you
   to, it notices and moves on. It is a reading of what you have done,
   not a script you are locked into.

   It can be skipped at any time and it never comes back unless asked.

   Emits:  'tutorial-step' { id, index }
           'tutorial-done' { skipped }
   State:  ctx.state.tutorialStep
*/
SurvivorGame.module({
  id: 'tutorial',
  order: 26,

  init(ctx) {
    const { SV } = ctx;
    const inv = () => ctx.player.inventory;
    const have = (item, n = 1) => {
      const s = inv().slots.find((x) => x.item === item);
      return !!s && (s.quantity || 1) >= n;
    };
    const tool = (cap) => SV.toolSatisfied(cap, ctx.state.toolsPresent ? ctx.state.toolsPresent() : []);

    /* The steps. `done` is read off the world; `hint` is one line of
       what to do, in the words the game uses elsewhere. */
    const STEPS = [
      {
        id: 'look',
        title: 'Look around',
        hint: 'Move the mouse to look, WASD to walk. Everything you need is on this island and none of it is given to you.',
        done: () => ctx.player.speedMs > 0.5 || walked > 6,
      },
      {
        id: 'gather',
        title: 'Pick up what is lying about',
        hint: 'Look at the ground and hold ' + ctx.hint('e', 'x') + ' to search it. Shrubs give fibre, rocks give stone and flint, deadfalls give sticks.',
        done: () => have('plantFibre', 3) && have('stick', 1) && have('stone', 1),
        detail: () => {
          const c = (i) => { const s = inv().slots.find((x) => x.item === i); return s ? s.quantity : 0; };
          return `fibre ${c('plantFibre')}/3 · stick ${c('stick')}/1 · stone ${c('stone')}/1`;
        },
      },
      {
        id: 'cordage',
        title: 'Twist cordage',
        hint: 'Press shift+C to open crafting. Three plant fibre makes a metre of cordage, and almost everything needs it.',
        done: () => have('cordage', 1),
      },
      {
        id: 'knife',
        title: 'Knap a stone knife',
        hint: 'Flint, a stick and cordage. You get flint by working a rock. Without a knife you have nothing.',
        done: () => tool('stoneKnife'),
      },
      {
        id: 'axe',
        title: 'Make a stone axe',
        hint: 'Stone, two sticks and two cordage, with the knife in your pack. Ninety minutes, and then you can fell trees.',
        done: () => tool('axe'),
      },
      {
        id: 'fire',
        title: 'Get a fire going',
        hint: 'Press F where you stand. You will need a bow drill or a lighter, and tinder — bark and fibre make a tinder bundle.',
        done: () => !!ctx.state.nearFire || firesBuilt > 0
          || (ctx.state.firesBuilt ? ctx.state.firesBuilt() > 0 : false),
      },
      {
        id: 'shelter',
        title: 'Put a roof over yourself',
        hint: 'Press G for a lean-to. A night in the open in this weather is what kills people here.',
        done: () => sheltersBuilt > 0 || have('barkShelter', 1)
          || (ctx.state.sheltersBuilt ? ctx.state.sheltersBuilt() > 0 : false),
      },
      {
        id: 'pickspear',
        title: 'A pickaxe and a spear',
        hint: 'Both off the same recipe list. The pick opens rock and frozen ground; the spear will keep a bear honest.',
        done: () => tool('pick') && tool('spear'),
      },
      {
        id: 'house',
        title: 'Build something that stands up',
        hint: 'Fell a tree with the axe for timber, rive it into planks, then press N to build. A wall, a floor and a roof will do.',
        done: () => piecesBuilt >= 3,
        detail: () => `${piecesBuilt}/3 pieces standing`,
      },
      {
        id: 'bow',
        title: 'Make a bow and some arrows',
        hint: 'A stave off a tree, three cordage, and four hours of tillering. Then arrows: sticks, flint, feathers.',
        done: () => tool('bow') && have('arrow', 1),
      },
      {
        id: 'deer',
        title: 'Kill your first deer',
        hint: 'Check the wind before you move on one — it can smell you from two hundred metres downwind. Read the tracks.',
        done: () => deerKilled > 0,
      },
    ];

    /* ---- what the world tells us ---- */

    let walked = 0;
    let firesBuilt = 0;
    let sheltersBuilt = 0;
    let piecesBuilt = 0;
    let deerKilled = 0;
    let index = 0;
    let running = false;
    let finished = false;
    let lastX = ctx.player.x, lastZ = ctx.player.z;

    ctx.on('fire-built', () => { firesBuilt++; });
    ctx.on('fire-lit', () => { firesBuilt++; });
    ctx.on('shelter-built', () => { sheltersBuilt++; });
    ctx.on('built', () => { piecesBuilt++; });
    ctx.on('structure-built', () => { piecesBuilt++; });
    ctx.on('animal-down', (d) => {
      if (d && d.animal && d.animal.species && /deer|elk/i.test(d.animal.species.name || '')) deerKilled++;
    });

    /* ---- the panel ---- */

    const panel = ctx.hud.panel('tutorial', {
      className: 'panel',
      style: 'left:16px;top:200px;width:312px;display:none;pointer-events:auto;z-index:22',
    });

    function render() {
      if (!running) { panel.style.display = 'none'; return; }
      const s = STEPS[index];
      if (!s) return;
      panel.style.display = 'block';
      const detail = s.detail ? s.detail() : '';
      panel.innerHTML = `<h2>getting started &middot; ${index + 1}/${STEPS.length}</h2>`
        + `<div class="row"><span>${s.title}</span></div>`
        + `<p style="font-size:11.5px;margin:6px 0 4px">${s.hint}</p>`
        + (detail ? `<p class="faint" style="font-size:11px;margin:0 0 6px">${detail}</p>` : '')
        + '<div style="margin-top:8px;pointer-events:auto">'
        + '<button class="btn" data-skip="1" style="font-size:10px;padding:4px 10px">skip the lot</button>'
        + '<button class="btn" data-next="1" style="font-size:10px;padding:4px 10px">skip this step</button></div>';
      for (const b of panel.querySelectorAll('[data-skip]')) b.onclick = () => finish(true);
      for (const b of panel.querySelectorAll('[data-next]')) b.onclick = () => advance(true);
    }

    function advance(manual) {
      const was = STEPS[index];
      index++;
      if (index >= STEPS.length) { finish(false); return; }
      ctx.emit('tutorial-step', { id: STEPS[index].id, index });
      ctx.state.tutorialStep = STEPS[index].id;
      if (!manual && was) ctx.log(`${was.title} — done.`, true);
      render();
    }

    function finish(skipped) {
      running = false;
      finished = true;
      ctx.state.tutorialStep = null;
      panel.style.display = 'none';
      try { localStorage.setItem('survivor.tutorialDone', '1'); } catch (e) { /* private window */ }
      ctx.emit('tutorial-done', { skipped });
      ctx.log(skipped
        ? 'Right — you are on your own.'
        : 'That is everything anyone can tell you. The rest of the island is yours to work out.', true);
    }

    function begin() {
      if (finished) return;
      running = true;
      index = 0;
      ctx.state.tutorialStep = STEPS[0].id;
      render();
      ctx.log('A short walk-through is running in the panel on the left. '
        + 'It will not stop you doing anything, and you can skip it.', true);
    }

    /* Only on a genuinely new game. Someone who has done it once should
       never see it again unless they ask. */
    let seen = false;
    try { seen = localStorage.getItem('survivor.tutorialDone') === '1'; } catch (e) { seen = false; }
    if (seen) finished = true;
    else setTimeout(begin, 1800);

    ctx.state.startTutorial = () => { finished = false; begin(); };
    ctx.state.skipTutorial = () => finish(true);

    /* ---- watching ---- */

    let tick = 0;
    ctx.onUpdate((dt) => {
      const dx = ctx.player.x - lastX, dz = ctx.player.z - lastZ;
      walked += Math.hypot(dx, dz);
      lastX = ctx.player.x; lastZ = ctx.player.z;
      if (!running) return;
      tick += dt;
      if (tick < 0.5) return;
      tick = 0;
      /* Skip ahead over anything already done. A player who wandered off
         and built a house before being asked to should not be told to go
         and build a house. */
      let guard = 0;
      while (running && guard++ < STEPS.length) {
        const s = STEPS[index];
        let ok = false;
        try { ok = !!s.done(); } catch (e) { ok = false; }
        if (!ok) break;
        advance(false);
      }
      render();
    });
  },
});
