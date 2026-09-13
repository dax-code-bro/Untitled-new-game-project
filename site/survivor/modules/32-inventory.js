/* What you are carrying, and what you can make from it.

   Mass and volume are both real limits and they bind at different times:
   you run out of pack long before you run out of back, and then the mass
   starts costing you through the Pandolf term the physiology already
   charges. Nothing here decides what carrying weight does — it only reports
   that the load is going into the same equation that decides whether you
   make it up the hill.

   Recipes are things a person could actually make from what is on this
   island, with the tool and the time each really needs. Cordage takes half
   an hour of sitting still. A bow drill is not a button.

   State:   ctx.state.itemTable — mass and volume for everything, shared
            ctx.state.uiOpen    — true while a full-screen sheet is up
   Emits:   'crafted' { recipe, output } */
SurvivorGame.module({
  id: 'inventory',
  order: 32,

  init(ctx) {
    const { SV } = ctx;

    /* Real masses in kilograms and volumes in litres. A litre of water is a
       kilogram; a .308 round is 25 grams, so two hundred of them is five
       kilos and that is why you do not carry two hundred. */
    const ITEMS = {
      // tools
      axe: { massKg: 1.5, volumeL: 4, stackable: false, use: 'Fells trees. Breaches walls.' },
      hatchet: { massKg: 0.7, volumeL: 1.5, stackable: false, use: 'Limbs and kindling. Slow on a trunk.' },
      saw: { massKg: 1.1, volumeL: 2.5, stackable: false, use: 'Faster than an axe and quieter.' },
      knife: { massKg: 0.2, volumeL: 0.3, stackable: false, use: 'Skinning, butchering, carving.' },
      stoneKnife: { massKg: 0.25, volumeL: 0.3, stackable: false, use: 'Sharp once. Then sharp again if you knap it.' },
      hammer: { massKg: 0.9, volumeL: 1.2, stackable: false, use: 'Framing.' },
      crowbar: { massKg: 2.2, volumeL: 3, stackable: false, use: 'Doors, crates, and the wrong end of an argument.' },
      shovel: { massKg: 2.0, volumeL: 6, stackable: false, use: 'Digging. Worms.' },
      toolbox: { massKg: 6.0, volumeL: 14, stackable: false, use: 'The tools you did not think to bring.' },
      cleaningRod: { massKg: 0.15, volumeL: 0.4, stackable: false, use: 'Drives a stuck case out of a chamber.' },
      gunCleaningKit: { massKg: 0.5, volumeL: 1.2, stackable: false, use: 'Solvent, oil, patches.' },
      weldingSet: { massKg: 14, volumeL: 30, stackable: false, use: 'Joins steel. Needs power.' },
      fishingRod: { massKg: 0.4, volumeL: 3, stackable: false, use: 'Reaches the fish you can see.' },
      bowDrill: { massKg: 0.4, volumeL: 2, stackable: false, use: 'Fire, eventually, if the tinder is dry.' },
      pot: { massKg: 0.8, volumeL: 3, stackable: false, use: 'Boils water. That is most of medicine.' },
      waterBottle: { massKg: 0.15, volumeL: 1.1, stackable: false, use: 'Holds a litre.' },
      filter: { massKg: 0.35, volumeL: 0.8, stackable: false, use: 'Protozoa and bacteria. Not viruses.' },
      still: { massKg: 3, volumeL: 8, stackable: false, use: 'The only way to drink the sea.' },
      lighter: { massKg: 0.02, volumeL: 0.05, stackable: false, use: 'The most valuable thing on the island.' },
      matches: { massKg: 0.03, volumeL: 0.06, stackable: true, use: 'Finite, and ruined by water.' },
      ferroRod: { massKg: 0.05, volumeL: 0.08, stackable: false, use: 'Works wet. Needs good tinder.' },
      torch: { massKg: 0.3, volumeL: 0.5, stackable: false, use: 'Batteries.' },
      // materials
      timber: { massKg: 12, volumeL: 20, stackable: true, use: 'A log. Saws into planks.' },
      firewood: { massKg: 6, volumeL: 9, stackable: true, use: 'Burns for about three hours.' },
      plank: { massKg: 4, volumeL: 7, stackable: true, use: 'Framing, floors, shutters.' },
      kindling: { massKg: 0.4, volumeL: 2, stackable: true, use: 'Between tinder and fuel.' },
      tinder: { massKg: 0.05, volumeL: 0.5, stackable: true, use: 'Dry, or it is just fluff.' },
      cordage: { massKg: 0.08, volumeL: 0.2, stackable: true, use: 'Lashing, snares, a bow drill.' },
      bark: { massKg: 0.3, volumeL: 1.2, stackable: true, use: 'Cordage, tinder, a container.' },
      hide: { massKg: 2.5, volumeL: 6, stackable: true, use: 'Clothing, once it is tanned.' },
      sinew: { massKg: 0.05, volumeL: 0.1, stackable: true, use: 'The strongest cordage there is.' },
      nails: { massKg: 0.5, volumeL: 0.4, stackable: true, use: 'Framing.' },
      charcoal: { massKg: 0.4, volumeL: 1.5, stackable: true, use: 'Filtering. Forging.' },
      sand: { massKg: 1.6, volumeL: 1, stackable: true, use: 'Filtering.' },
      cloth: { massKg: 0.2, volumeL: 1, stackable: true, use: 'Filtering, bandages, tinder.' },
      flint: { massKg: 0.3, volumeL: 0.2, stackable: true, use: 'Knaps into an edge.' },
      wire: { massKg: 0.6, volumeL: 1, stackable: true, use: 'Circuits and snares.' },
      fuel: { massKg: 0.75, volumeL: 1, stackable: true, use: 'Petrol. Do not drink it.' },
      resin: { massKg: 0.2, volumeL: 0.3, stackable: true, use: 'Waterproofing. Burns hot.' },
      // food and water
      water: { massKg: 1, volumeL: 1, stackable: true, use: 'A litre, untreated.' },
      cleanWater: { massKg: 1, volumeL: 1, stackable: true, use: 'A litre, boiled.' },
      cannedFood: { massKg: 0.4, volumeL: 0.45, stackable: true, use: 'Safe unless the tin is swollen.' },
      berries: { massKg: 0.15, volumeL: 0.3, stackable: true, use: 'Sugar, and not much else.' },
      greens: { massKg: 0.2, volumeL: 1.2, stackable: true, use: 'Vitamins. No calories worth counting.' },
      roots: { massKg: 0.3, volumeL: 0.5, stackable: true, use: 'Starch, once cooked.' },
      acorns: { massKg: 0.25, volumeL: 0.4, stackable: true, use: 'Bitter until leached. Then real food.' },
      pineNuts: { massKg: 0.1, volumeL: 0.2, stackable: true, use: 'Fat, which matters more than it sounds.' },
      mushrooms: { massKg: 0.12, volumeL: 0.5, stackable: true, use: 'You are not certain what kind.' },
      shellfish: { massKg: 0.4, volumeL: 0.5, stackable: true, use: 'Free protein at low tide.' },
      seaweed: { massKg: 0.3, volumeL: 1.5, stackable: true, use: 'Salt and iodine.' },
      cattailRoot: { massKg: 0.4, volumeL: 0.8, stackable: true, use: 'Starch. Everywhere in a marsh.' },
      reeds: { massKg: 0.3, volumeL: 2.5, stackable: true, use: 'Thatch, cordage, arrow shafts.' },
      seeds: { massKg: 0.1, volumeL: 0.2, stackable: true, use: 'Plant them or eat them.' },
      fat: { massKg: 0.4, volumeL: 0.45, stackable: true, use: 'What keeps lean meat from killing you.' },
      worms: { massKg: 0.05, volumeL: 0.1, stackable: true, use: 'Bait.' },
      cutbait: { massKg: 0.2, volumeL: 0.2, stackable: true, use: 'Bait, from a fish you already caught.' },
      // medicine
      bandage: { massKg: 0.05, volumeL: 0.15, stackable: true, use: 'Stops a bleed you can reach.' },
      gauze: { massKg: 0.04, volumeL: 0.12, stackable: true, use: 'Packing a wound.' },
      antiseptic: { massKg: 0.12, volumeL: 0.15, stackable: true, use: 'Cleans a wound. Does not cure anything.' },
      iodine: { massKg: 0.08, volumeL: 0.1, stackable: true, use: 'Antiseptic, and water treatment at a pinch.' },
      painkillers: { massKg: 0.03, volumeL: 0.05, stackable: true, use: 'Masks pain. Does not fix it.' },
      antibiotics: { massKg: 0.03, volumeL: 0.05, stackable: true, use: 'Only if it is the right one.' },
      sutures: { massKg: 0.02, volumeL: 0.04, stackable: true, use: 'Closes a wound properly.' },
      tourniquet: { massKg: 0.1, volumeL: 0.2, stackable: true, use: 'A limb bleed. Note the time.' },
      splint: { massKg: 0.4, volumeL: 2, stackable: true, use: 'A break heals almost not at all without one.' },
      chlorine: { massKg: 0.2, volumeL: 0.2, stackable: true, use: 'Bacteria and viruses. Not Cryptosporidium.' },
      // clothing, which the physiology reads as insulation
      clothing: { massKg: 1.2, volumeL: 6, stackable: false, clo: 0.9, use: 'Ordinary clothes.' },
      boots: { massKg: 1.4, volumeL: 5, stackable: false, clo: 0.15, use: 'Dry feet are not optional.' },
      coat: { massKg: 2.2, volumeL: 12, stackable: false, clo: 1.6, use: 'Most of the answer to a cold night.' },
      hideCoat: { massKg: 3.5, volumeL: 16, stackable: false, clo: 2.4, use: 'Heavy, warm, and yours.' },
      sleepingBag: { massKg: 1.8, volumeL: 14, stackable: false, clo: 2.8, use: 'Only works if you are dry.' },
      workGloves: { massKg: 0.15, volumeL: 0.5, stackable: false, use: 'Skinning without opening your hands.' },
      insulatedGloves: { massKg: 0.3, volumeL: 0.8, stackable: false, use: 'Working live. Do not test them.' },
      insulatedBoots: { massKg: 1.6, volumeL: 5, stackable: false, clo: 0.2, use: 'The other half of not being earthed.' },
    };

    // Ammunition, at real cartridge masses.
    for (const [id, c] of Object.entries(SV.CARTRIDGES)) {
      ITEMS[`ammo:${id}`] = {
        massKg: (c.massGr + (c.powderGr || 0) + 60) * 6.479891e-5,
        volumeL: 0.006, stackable: true, use: `${c.name}. ${c.note || ''}`,
      };
    }
    for (const [id, d] of Object.entries(SV.TREATMENT || {})) {
      ITEMS[id] = { massKg: 0.03, volumeL: 0.05, stackable: true, use: d.name };
    }
    for (const [id, s] of Object.entries(SV.SPECIES)) {
      ITEMS[`meat:${id}`] = { massKg: 1, volumeL: 1.1, stackable: true, use: `${s.name} meat.` };
    }
    for (const [id, s] of Object.entries(SV.FISH_SPECIES)) {
      ITEMS[`fillet:${id}`] = { massKg: 0.4, volumeL: 0.4, stackable: true, use: `${s.name} fillet.` };
    }
    ctx.state.itemTable = ITEMS;

    /* ---- recipes ----
       Time is in seconds of work, and it is the honest figure: cordage from
       bark really is half an hour of sitting there twisting it. */
    const RECIPES = [
      { id: 'cordage', out: { item: 'cordage', quantity: 2 }, in: { bark: 2 }, tool: null, skill: 'carpentry', seconds: 1800,
        note: 'Strip, soak, twist. Half an hour you cannot spend hunting.' },
      { id: 'sinewCord', out: { item: 'cordage', quantity: 3 }, in: { sinew: 1 }, tool: 'knife', skill: 'carpentry', seconds: 900,
        note: 'Stronger than plant fibre and there is never enough of it.' },
      { id: 'stoneKnife', out: { item: 'stoneKnife' }, in: { flint: 2, cordage: 1 }, tool: null, skill: 'carpentry', seconds: 1200,
        note: 'Knapped, hafted, and sharper than the steel one for a day.' },
      { id: 'bowDrill', out: { item: 'bowDrill' }, in: { timber: 1, cordage: 2 }, tool: 'knife', skill: 'carpentry', seconds: 2400,
        note: 'The hardest way to make fire, and the one that never runs out.' },
      { id: 'tinder', out: { item: 'tinder', quantity: 3 }, in: { bark: 1 }, tool: null, skill: 'foraging', seconds: 300,
        note: 'Shredded fine. Dry, or none of it matters.' },
      { id: 'kindling', out: { item: 'kindling', quantity: 4 }, in: { firewood: 1 }, tool: 'hatchet', skill: 'carpentry', seconds: 420,
        note: 'Split down small enough to catch.' },
      { id: 'planks', out: { item: 'plank', quantity: 4 }, in: { timber: 1 }, tool: 'saw', skill: 'carpentry', seconds: 1500,
        note: 'By hand. A sawmill does this in a minute.' },
      { id: 'firewood', out: { item: 'firewood', quantity: 2 }, in: { timber: 1 }, tool: 'axe', skill: 'carpentry', seconds: 900,
        note: 'Bucked and split.' },
      { id: 'fishingRod', out: { item: 'fishingRod' }, in: { timber: 1, cordage: 2, nails: 1 }, tool: 'knife', skill: 'fishing', seconds: 1800,
        note: 'A sapling, a line, and a bent nail.' },
      { id: 'filter', out: { item: 'filter' }, in: { charcoal: 2, sand: 1, cloth: 1 }, tool: null, skill: 'medicine', seconds: 1200,
        note: 'Takes out the protozoa. Boiling is still better.' },
      { id: 'charcoal', out: { item: 'charcoal', quantity: 3 }, in: { firewood: 2 }, tool: null, needsFire: true, skill: 'cooking', seconds: 5400,
        note: 'Burn it slow and starve it of air.' },
      { id: 'bandage', out: { item: 'bandage', quantity: 3 }, in: { cloth: 1 }, tool: null, needsFire: true, skill: 'medicine', seconds: 900,
        note: 'Boiled, or you are packing a wound with what is on the cloth.' },
      { id: 'splint', out: { item: 'splint' }, in: { plank: 1, cordage: 2 }, tool: 'knife', skill: 'medicine', seconds: 600,
        note: 'An unsplinted break barely heals at all.' },
      { id: 'hideCoat', out: { item: 'hideCoat' }, in: { hide: 3, sinew: 2 }, tool: 'knife', skill: 'carpentry', seconds: 10800,
        note: 'Three days of scraping and stitching, and then a warm night.' },
      { id: 'still', out: { item: 'still' }, in: { pot: 1, wire: 1, cloth: 1 }, tool: 'hammer', skill: 'carpentry', seconds: 3600,
        note: 'The only thing that turns the sea into water.' },
      { id: 'spear', out: { item: 'spear' }, in: { timber: 1, stoneKnife: 1, cordage: 1 }, tool: 'knife', skill: 'hunting', seconds: 2400,
        note: 'Reach, and something to keep a boar off you.' },
      { id: 'snare', out: { item: 'snare', quantity: 2 }, in: { wire: 1, cordage: 1 }, tool: null, skill: 'hunting', seconds: 600,
        note: 'Catches rabbits while you sleep, which is the whole point.' },
    ];
    ITEMS.spear = { massKg: 1.8, volumeL: 8, stackable: false, use: 'Reach.' };
    ITEMS.snare = { massKg: 0.15, volumeL: 0.3, stackable: true, use: 'Set it and go away.' };

    /* Other modules add items to the same table — garments, crafted
       tools — so anything registered there is folded in here. Without
       this a hide coat shows in the pack as "hideCoat" with no mass and
       no description. */
    Object.assign(ITEMS, ctx.state.itemTable || {});
    ctx.state.itemTable = ITEMS;

    /* ---- the sheet ---- */

    const sheet = document.createElement('div');
    sheet.id = 'inventoryScreen';
    sheet.className = 'screen';
    sheet.hidden = true;
    sheet.innerHTML = '<div class="sheet"></div>';
    document.body.appendChild(sheet);
    const body = sheet.querySelector('.sheet');

    let crafting = null;   // { recipe, remaining }

    function canMake(r) {
      for (const [item, n] of Object.entries(r.in)) {
        if (!ctx.player.inventory.has(item, n)) return false;
      }
      if (r.tool && !ctx.player.inventory.has(r.tool)) return false;
      if (r.needsFire && !ctx.state.nearFire) return false;
      return true;
    }

    /* Anything you carry can go on a hotbar slot. Only the four free
       slots are offered — the first five are the weapons. */
    function hotButtons(item) {
      if (!ctx.state.assignHot) return '';
      let out = '';
      for (let i = 5; i < 9; i++) out += `<button data-hot="${i}|${item}">${i + 1}</button>`;
      return out;
    }

    function render() {
      const inv = ctx.player.inventory;
      const mass = inv.massKg, vol = inv.volumeL;
      const over = inv.overweight;

      const rows = inv.slots.length
        ? inv.slots.map((s, i) => {
          const t = ITEMS[s.item] || {};
          return `<tr>
            <td>${s.item}${s.quantity > 1 ? ` <span class="faint">×${s.quantity}</span>` : ''}</td>
            <td class="faint">${((s.massKg || 0) * (s.quantity || 1)).toFixed(2)} kg</td>
            <td class="faint">${((s.volumeL || 0) * (s.quantity || 1)).toFixed(1)} L</td>
            <td class="muted">${t.use || ''}</td>
            <td>${hotButtons(s.item)}${t.clo ? `<button data-wear="${i}">wear</button>` : ''}${
              s.item.startsWith('meat:') || s.item.startsWith('fillet:') || t.use === 'A litre, boiled.' || s.item === 'cannedFood'
                ? `<button data-eat="${i}">use</button>` : ''}<button data-drop="${i}">drop</button></td>
          </tr>`;
        }).join('')
        : '<tr><td colspan="5" class="muted">Nothing but what you stand up in.</td></tr>';

      const recipes = RECIPES.map((r) => {
        const ok = canMake(r);
        const needs = Object.entries(r.in).map(([k, n]) => `${k}${n > 1 ? `×${n}` : ''}`).join(', ');
        return `<tr class="${ok ? '' : 'faint'}">
          <td>${r.out.item}${r.out.quantity > 1 ? ` ×${r.out.quantity}` : ''}</td>
          <td class="faint">${needs}${r.tool ? ` + ${r.tool}` : ''}${r.needsFire ? ' + fire' : ''}</td>
          <td class="faint">${Math.round(r.seconds / 60)} min</td>
          <td class="muted">${r.note}</td>
          <td>${ok ? `<button data-make="${r.id}">make</button>` : ''}</td>
        </tr>`;
      }).join('');

      /* The paper doll belongs at the top of this screen: what you are
         wearing is the first thing you want to know when you open your
         pack, and the outfit module owns it. */
      const doll = ctx.state.dollHtml ? ctx.state.dollHtml() : '';

      body.innerHTML = `
        ${doll ? `<h1>Worn</h1>${doll}<h1 style="margin-top:22px">Carried</h1>` : '<h1>Carried</h1>'}
        <p class="lede">
          ${mass.toFixed(1)} of ${inv.capacityKg} kg &nbsp;·&nbsp; ${vol.toFixed(1)} of ${inv.capacityL} L
          ${over > 0 ? `<span class="badText">— ${over.toFixed(1)} kg over. Every step costs more.</span>` : ''}
        </p>
        <table>
          <tr><th>item</th><th>mass</th><th>bulk</th><th>what it is for</th><th></th></tr>
          ${rows}
        </table>
        <h1 style="margin-top:22px">Make</h1>
        <p class="lede">${crafting ? `Working: ${crafting.recipe.out.item}, ${Math.ceil(crafting.remaining / 60)} min left.` : 'Time is the real cost of most of these.'}</p>
        <table>
          <tr><th>makes</th><th>from</th><th>time</th><th></th><th></th></tr>
          ${recipes}
        </table>
      `;
    }

    body.addEventListener('click', (e) => {
      let t = e.target;
      if (!(t instanceof HTMLElement)) return;
      // A click on the label inside a doll slot is a click on the slot.
      while (t && t !== body && !t.dataset.slot && !t.dataset.wearg
        && !t.dataset.drop && !t.dataset.wear && !t.dataset.eat && !t.dataset.make
        && !t.dataset.hot) t = t.parentElement;
      if (!t || t === body) return;
      const inv = ctx.player.inventory;

      if (ctx.state.dollClick && ctx.state.dollClick(t)) { render(); return; }
      if (t.dataset.hot != null) {
        const [slot, item] = t.dataset.hot.split('|');
        if (ctx.state.assignHot) ctx.state.assignHot(+slot, item);
        ctx.toast(`${item} on slot ${+slot + 1}.`);
        render(); return;
      }

      if (t.dataset.drop != null) {
        const s = inv.slots[+t.dataset.drop];
        if (s) { inv.remove(s.item, 1); ctx.toast(`Dropped ${s.item}.`); }
        render(); return;
      }
      if (t.dataset.wear != null) {
        const s = inv.slots[+t.dataset.wear];
        const spec = s && ITEMS[s.item];
        if (spec && spec.clo) {
          // Clothing is not cosmetic: clo is the number the two-node thermal
          // model uses, so putting on a coat genuinely changes the arithmetic.
          inv.equipped.clothing = inv.equipped.clothing || [];
          if (!inv.equipped.clothing.includes(s.item)) inv.equipped.clothing.push(s.item);
          const total = inv.equipped.clothing.reduce((a, id) => a + ((ITEMS[id] && ITEMS[id].clo) || 0), 0);
          ctx.player.body.clothingClo = 0.3 + total;
          ctx.toast(`Wearing ${s.item}. Insulation now ${ctx.player.body.clothingClo.toFixed(1)} clo.`);
        }
        render(); return;
      }
      if (t.dataset.eat != null) {
        const s = inv.slots[+t.dataset.eat];
        if (s) consume(s);
        render(); return;
      }
      if (t.dataset.make != null) {
        const r = RECIPES.find((x) => x.id === t.dataset.make);
        if (r && canMake(r) && !crafting) {
          crafting = { recipe: r, remaining: r.seconds };
          ctx.toast(`Started: ${r.out.item}.`);
        }
        render();
      }
    });

    function consume(slot) {
      const inv = ctx.player.inventory;
      if (slot.provision) {
        // The provision model owns what eating this does, including whether
        // it is still carrying anything.
        const p = Object.assign(new SV.Provision({}), slot.provision);
        const out = p.consume();
        ctx.player.body.eat(out.food);
        for (const v of out.exposures) {
          ctx.player.disease.expose(v, { hygiene: out.hygiene, load: 1 });
        }
        ctx.log(`You eat the ${p.name}. ${out.state === 'raw' ? 'Raw.' : out.state === 'spoiled' ? 'It is off.' : ''}`, true);
        if (out.proteinEnergyFraction > 0.78) {
          ctx.player.disease.expose(SV.VECTOR.leanMeatOnly, { hygiene: 0.6, load: 0.4 });
        }
      } else if (slot.item === 'cleanWater') {
        SV.drinkTreated(ctx.player.body, ctx.player.disease, SV.treatWater('boiled', 1));
        ctx.log('You drink a litre of boiled water.');
      } else if (slot.item === 'water') {
        SV.drinkTreated(ctx.player.body, ctx.player.disease, SV.treatWater('none', 1));
        ctx.log('You drink a litre. It was not treated.', true);
      } else if (slot.item === 'cannedFood') {
        ctx.player.body.eat({ kcal: 420, waterL: 0.18, dryMassKg: 0.12 });
        // A swollen tin is the one food on this island that can paralyse you.
        if (Math.random() < 0.06) ctx.player.disease.expose(SV.VECTOR.spoiledCannedFood, { hygiene: 0, load: 1 });
        ctx.log('Cold out of the tin.');
      } else {
        const kcal = { berries: 120, greens: 40, roots: 220, acorns: 380, pineNuts: 640,
          mushrooms: 90, shellfish: 240, seaweed: 110, cattailRoot: 260, seeds: 350, fat: 3600 }[slot.item];
        if (!kcal) { ctx.toast('You cannot eat that.'); return; }
        ctx.player.body.eat({ kcal: kcal * (slot.massKg || 0.2), waterL: (slot.massKg || 0.2) * 0.6, dryMassKg: (slot.massKg || 0.2) * 0.3 });
        ctx.log(`You eat the ${slot.item}.`);
      }
      inv.remove(slot.item, 1);
    }

    function toggle() {
      sheet.hidden = !sheet.hidden;
      ctx.state.uiOpen = !sheet.hidden;
      ctx.state.movementLocked = !sheet.hidden;
      if (!sheet.hidden) render();
    }

    ctx.key('tab', toggle, 'Inventory');
    // Tab moves focus in a browser, so the default has to go; the toggle
    // itself is already bound above and must not run twice.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') e.preventDefault();
      if (e.key === 'Escape' && !sheet.hidden) toggle();
    });

    ctx.onUpdate((dt) => {
      if (!crafting) return;
      // Crafting is work you are doing rather than a progress bar you are
      // watching; it costs calories and it stops if you go somewhere else.
      crafting.remaining -= dt;
      ctx.player.extraWatts = 180;
      if (crafting.remaining > 0) return;

      const r = crafting.recipe;
      const inv = ctx.player.inventory;
      let ok = true;
      for (const [item, n] of Object.entries(r.in)) if (!inv.has(item, n)) ok = false;
      if (ok) {
        for (const [item, n] of Object.entries(r.in)) inv.remove(item, n);
        const spec = ITEMS[r.out.item] || {};
        inv.add({
          item: r.out.item, massKg: spec.massKg || 0.5, volumeL: spec.volumeL || 0.7,
          stackable: spec.stackable !== false, quantity: r.out.quantity || 1,
        });
        ctx.player.practise(r.skill, 0.04);
        ctx.log(`Made ${r.out.item}${r.out.quantity > 1 ? ` ×${r.out.quantity}` : ''}.`, true);
        ctx.emit('crafted', { recipe: r, output: r.out });
      } else {
        ctx.toast('You no longer have what that needed.');
      }
      crafting = null;
      ctx.player.extraWatts = 0;
      if (!sheet.hidden) render();
    });

    /* A survivor washes up with nothing, but a knife and the clothes they
       stand up in is the difference between a game and a cruelty. */
    ctx.player.inventory.add({ item: 'knife', massKg: 0.2, volumeL: 0.3, stackable: false });
    /* What you are dressed in is the outfit module's business — it has
       slots, per-garment clo and a wet penalty that depends on the
       fibre. Setting a single number here as well only overwrote it. */
  },
});
