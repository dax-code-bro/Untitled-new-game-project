/* ============================================================
   What you are wearing, and what is in reach.

   Clothing here is not a cosmetic layer over a warmth number. Each
   garment sits in a slot, covers a set of body regions, and carries a
   real clo value — the unit the two-node thermal model already uses,
   where 1 clo is the insulation of a business suit and a naked body in
   still air is 0. The numbers below are the standard per-garment values
   (ISO 9920 / ASHRAE tables): a long-sleeved shirt is 0.25, trousers
   0.28, a heavy jacket 0.55, boots 0.10. They add, and the sum plus the
   0.1 clo of the still air trapped against the skin is what the
   physiology gets.

   You wash up dressed. Nobody starts a shipwreck naked, and the game
   has no interest in pretending otherwise.
   ============================================================ */

SurvivorGame.module({
  id: 'outfit',
  order: 16,
  init(ctx) {
    const SLOT = {
      head:  { name: 'head', order: 0 },
      torso: { name: 'body', order: 1 },
      hands: { name: 'hands', order: 2 },
      legs:  { name: 'legs', order: 3 },
      feet:  { name: 'feet', order: 4 },
      back:  { name: 'back', order: 5 },
    };

    /* skin: which material the body module draws this garment in.
       covers: the injury regions it protects, which is what decides
       whether a bite or a branch actually reaches you. */
    const GARMENT = {
      linenShirt:     { slot: 'torso', clo: 0.25, skin: 'linen', name: 'linen shirt', massKg: 0.3, volumeL: 1.5, covers: ['chest', 'abdomen', 'upperArm', 'forearm'], armour: 0.05 },
      woolSweater:    { slot: 'torso', clo: 0.42, skin: 'wool', name: 'wool sweater', massKg: 0.6, volumeL: 3.5, covers: ['chest', 'abdomen', 'upperArm', 'forearm'], armour: 0.10, wetPenalty: 0.35 },
      canvasJacket:   { slot: 'torso', clo: 0.52, skin: 'canvas', name: 'canvas jacket', massKg: 1.1, volumeL: 6, covers: ['chest', 'abdomen', 'upperArm', 'forearm'], armour: 0.22, windproof: 0.7 },
      hideCoat:       { slot: 'torso', clo: 0.95, skin: 'hide', name: 'hide coat', massKg: 2.6, volumeL: 12, covers: ['chest', 'abdomen', 'upperArm', 'forearm'], armour: 0.35, windproof: 0.85 },
      rainShell:      { slot: 'torso', clo: 0.16, skin: 'rubber', name: 'oilskin', massKg: 0.7, volumeL: 3, covers: ['chest', 'abdomen', 'upperArm', 'forearm'], windproof: 1, waterproof: 1 },

      canvasTrousers: { slot: 'legs', clo: 0.28, skin: 'canvas', name: 'canvas trousers', massKg: 0.6, volumeL: 3, covers: ['thigh', 'lowerLeg'], armour: 0.15 },
      denimJeans:     { slot: 'legs', clo: 0.26, skin: 'denim', name: 'denim jeans', massKg: 0.7, volumeL: 3, covers: ['thigh', 'lowerLeg'], armour: 0.18 },
      woolTrousers:   { slot: 'legs', clo: 0.40, skin: 'wool', name: 'wool trousers', massKg: 0.8, volumeL: 3.5, covers: ['thigh', 'lowerLeg'], armour: 0.12, wetPenalty: 0.35 },
      hideTrousers:   { slot: 'legs', clo: 0.55, skin: 'hide', name: 'hide trousers', massKg: 1.4, volumeL: 5, covers: ['thigh', 'lowerLeg'], armour: 0.30 },

      workBoots:      { slot: 'feet', clo: 0.10, skin: 'boot', name: 'work boots', massKg: 1.4, volumeL: 5, covers: ['foot'], armour: 0.4 },
      hideBoots:      { slot: 'feet', clo: 0.13, skin: 'hide', name: 'hide boots', massKg: 0.9, volumeL: 4, covers: ['foot'], armour: 0.2 },
      rubberBoots:    { slot: 'feet', clo: 0.09, skin: 'rubber', name: 'rubber boots', massKg: 1.6, volumeL: 5.5, covers: ['foot'], armour: 0.3, waterproof: 1 },

      woolCap:        { slot: 'head', clo: 0.08, skin: 'wool', name: 'wool cap', massKg: 0.1, volumeL: 0.5, covers: ['head'] },
      furHat:         { slot: 'head', clo: 0.22, skin: 'fur', name: 'fur hat', massKg: 0.3, volumeL: 2, covers: ['head'] },

      workGloves:     { slot: 'hands', clo: 0.04, skin: 'hide', name: 'work gloves', massKg: 0.15, volumeL: 0.5, covers: ['hand'], armour: 0.25 },
      furMitts:       { slot: 'hands', clo: 0.16, skin: 'fur', name: 'fur mitts', massKg: 0.25, volumeL: 1.2, covers: ['hand'], armour: 0.1 },

      packSmall:      { slot: 'back', clo: 0.02, skin: null, name: 'satchel', massKg: 0.6, volumeL: 0, capacityKg: 6, capacityL: 18 },
      packLarge:      { slot: 'back', clo: 0.04, skin: null, name: 'rucksack', massKg: 1.6, volumeL: 0, capacityKg: 18, capacityL: 55 },
    };

    /* The head is not in the body rig, but heat leaves through it faster
       than through anything else its size — about 7% of resting heat
       loss from 9% of the surface — so a hat is worth more than its clo
       suggests when the rest of you is already covered. */
    const HEAD_BONUS = 0.06;

    /* The inventory table owns the master item list; garments have to be
       in it or they show up in the pack as a bare identifier with no
       mass, no bulk and no description. */
    ctx.state.itemTable = ctx.state.itemTable || {};
    for (const [id, g] of Object.entries(GARMENT)) {
      ctx.state.itemTable[id] = {
        massKg: g.massKg, volumeL: g.volumeL, stackable: false, clo: g.clo,
        garment: true,
        use: `${g.name} — ${g.clo.toFixed(2)} clo`
          + (g.windproof ? `, ${Math.round(g.windproof * 100)}% windproof` : '')
          + (g.capacityKg ? `, carries ${g.capacityKg} kg more` : ''),
      };
    }

    const worn = {};                   // slot -> garment id

    function totalClo() {
      let clo = 0.10;                  // the still air held against skin
      for (const id of Object.values(worn)) {
        const g = GARMENT[id];
        if (g) clo += g.clo;
      }
      if (worn.head) clo += HEAD_BONUS;
      return clo;
    }

    /* How much of that insulation a soaking takes, weighted by what the
       clothing is made of. The physiology applies it; this only decides
       the number, because the physiology is where the heat balance
       lives and there should be one of those. */
    function wetLoss() {
      let clo = 0.10, lost = 0.10 * 0.75;
      for (const id of Object.values(worn)) {
        const g = GARMENT[id];
        if (!g) continue;
        clo += g.clo;
        lost += g.clo * (g.wetPenalty == null ? 0.75 : g.wetPenalty);
      }
      return clo > 0 ? lost / clo : 0.75;
    }

    function windproofing() {
      let w = 0;
      for (const id of Object.values(worn)) {
        const g = GARMENT[id];
        if (g && g.windproof) w = Math.max(w, g.windproof);
      }
      return w;
    }

    /* What the body module draws. Null in a slot means bare skin. */
    function publish() {
      const g = (slot) => (worn[slot] && GARMENT[worn[slot]]) || null;
      ctx.state.outfit = {
        torso: g('torso') ? g('torso').skin : null,
        arms: g('torso') ? g('torso').skin : null,
        legs: g('legs') ? g('legs').skin : null,
        feet: g('feet') ? g('feet').skin : null,
        hands: g('hands') ? g('hands').skin : null,
        head: g('head') ? g('head').skin : null,
      };
      ctx.player.body.clothingClo = totalClo();
      ctx.player.body.clothingWetLoss = wetLoss();
      ctx.player.body.windproofing = windproofing();
      ctx.state.windproofing = ctx.player.body.windproofing;
      /* Armour is not armour — it is the fraction of a scrape, a bite or
         a branch the cloth takes instead of you. A canvas jacket is the
         difference between a graze and a laceration. */
      const armour = {};
      for (const id of Object.values(worn)) {
        const gg = GARMENT[id];
        if (!gg || !gg.covers) continue;
        for (const r of gg.covers) armour[r] = Math.max(armour[r] || 0, gg.armour || 0);
      }
      ctx.state.clothArmour = armour;
      if (ctx.player.injury) ctx.player.injury.clothArmour = armour;

      // A pack is the only reason to carry more than your arms hold.
      const back = g('back');
      const inv = ctx.player.inventory;
      if (inv) {
        inv.capacityKg = (inv.baseCapacityKg || 28) + (back ? back.capacityKg : 0);
        inv.capacityL = (inv.baseCapacityL || 45) + (back ? back.capacityL : 0);
      }
      ctx.emit('outfit-changed', { worn: Object.assign({}, worn), clo: ctx.player.body.clothingClo });
    }

    function wear(id) {
      const g = GARMENT[id];
      if (!g) return false;
      const inv = ctx.player.inventory;
      const old = worn[g.slot];
      if (old === id) return false;
      if (!inv.has(id)) return false;
      inv.remove(id, 1);
      if (old) {
        const og = GARMENT[old];
        inv.add({ item: old, quantity: 1, stackable: false, massKg: og.massKg, volumeL: og.volumeL });
      }
      worn[g.slot] = id;
      publish();
      ctx.toast(`${g.name} on. ${ctx.player.body.clothingClo.toFixed(2)} clo.`);
      return true;
    }

    function takeOff(slot) {
      const id = worn[slot];
      if (!id) return false;
      const g = GARMENT[id];
      const r = ctx.player.inventory.add({ item: id, quantity: 1, stackable: false,
        massKg: g.massKg, volumeL: g.volumeL });
      if (r && r.ok === false) { ctx.toast('No room in your pack for that.'); return false; }
      delete worn[slot];
      publish();
      ctx.toast(`${g.name} off. ${ctx.player.body.clothingClo.toFixed(2)} clo.`);
      return true;
    }

    /* ---- what you wash up in ----
       A shirt, trousers and boots. Cold, wet, and dressed. */
    function startingKit() {
      const inv = ctx.player.inventory;
      inv.baseCapacityKg = inv.baseCapacityKg || inv.capacityKg;
      inv.baseCapacityL = inv.baseCapacityL || inv.capacityL;
      for (const id of ['linenShirt', 'canvasTrousers', 'workBoots']) {
        const g = GARMENT[id];
        inv.add({ item: id, quantity: 1, stackable: false, massKg: g.massKg, volumeL: g.volumeL });
        wear(id);
      }
      /* Everything came out of the sea with you, so it is all soaked.
         The shirt on your back is the reason the first night is the
         dangerous one. */
      publish();
    }

    /* ---- the paper doll ----
       Drawn as a figure with the slots on it, because a list of slots
       tells you what you are wearing and a figure tells you what you
       are not. */
    function dollHtml() {
      const slotBox = (slot, x, y, w, h) => {
        const id = worn[slot];
        const g = id ? GARMENT[id] : null;
        return `<div class="dollSlot${g ? ' on' : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"
          data-slot="${slot}" title="${SLOT[slot].name}">
          <b>${SLOT[slot].name}</b><span>${g ? g.name : '—'}</span></div>`;
      };
      const inv = ctx.player.inventory;
      const spare = inv.slots
        .map((s, i) => ({ s, i, g: GARMENT[s.item] }))
        .filter((x) => x.g);
      const list = spare.length
        ? spare.map((x) => `<tr><td>${x.g.name}</td><td class="faint">${SLOT[x.g.slot].name}</td>`
          + `<td class="faint">${x.g.clo.toFixed(2)} clo</td>`
          + `<td><button data-wearg="${x.s.item}">put on</button></td></tr>`).join('')
        : '<tr><td colspan="4" class="muted">Nothing spare to put on.</td></tr>';

      const clo = totalClo();
      const wp = windproofing();
      return `
        <div class="dollWrap">
          <div class="doll">
            ${dollFigure()}
            ${slotBox('head', 0, 4, 96, 36)}
            ${slotBox('back', 0, 84, 96, 40)}
            ${slotBox('hands', 0, 152, 96, 40)}
            ${slotBox('torso', 204, 60, 96, 40)}
            ${slotBox('legs', 204, 146, 96, 40)}
            ${slotBox('feet', 204, 232, 96, 40)}
          </div>
          <div class="dollSide">
            <h3>Insulation</h3>
            <p class="lede">${clo.toFixed(2)} clo${wp ? ` &middot; ${Math.round(wp * 100)}% windproof` : ''}
              ${ctx.player.body.wet > 0.4
                ? ` <span class="badText">&mdash; soaked; ${Math.round(wetLoss() * ctx.player.body.wet * 100)}% of it is doing nothing</span>`
                : ''}</p>
            <table>
              <tr><th>garment</th><th>slot</th><th>warmth</th><th></th></tr>
              ${list}
            </table>
          </div>
        </div>`;
    }

    /* A plain front-on figure, in one SVG. It exists so the slots have
       something to sit on. */
    function dollFigure() {
      return `<svg viewBox="0 0 88 300" width="88" height="300" class="dollFig" aria-hidden="true">
        <g fill="none" stroke="rgba(233,228,217,.34)" stroke-width="1.4">
          <circle cx="44" cy="20" r="14"/>
          <path d="M44 34 v10 M30 46 h28"/>
          <path d="M30 46 q-14 4 -16 18 l-4 46 q-1 8 6 8 q6 0 7 -8 l3 -34"/>
          <path d="M58 46 q14 4 16 18 l4 46 q1 8 -6 8 q-6 0 -7 -8 l-3 -34"/>
          <path d="M30 46 q-6 30 -4 62 h36 q2 -32 -4 -62"/>
          <path d="M26 108 q-2 40 2 74 l4 44 q1 8 8 8 q7 0 7 -8 l-3 -46"/>
          <path d="M62 108 q2 40 -2 74 l-4 44 q-1 8 -8 8 q-7 0 -7 -8 l3 -46"/>
          <path d="M30 234 q-6 6 -8 14 h22 q2 -8 0 -14"/>
          <path d="M58 234 q6 6 8 14 h-22 q-2 -8 0 -14"/>
        </g>
      </svg>`;
    }

    function onDollClick(t) {
      if (t.dataset.slot != null) { takeOff(t.dataset.slot); return true; }
      if (t.dataset.wearg != null) { wear(t.dataset.wearg); return true; }
      return false;
    }

    ctx.state.dollHtml = dollHtml;
    ctx.state.dollClick = onDollClick;
    ctx.state.GARMENT = GARMENT;
    ctx.state.wearGarment = wear;

    /* ---- the hotbar ----
       Nine slots along the bottom. The first five are the weapons the
       weapons module already owns; the rest are yours to fill from the
       pack, and they are how you get at a knife without opening a
       screen — which is the whole point of a hotbar. */
    const HOTBAR = 9;
    const hot = new Array(HOTBAR).fill(null);
    const WEAPON_SLOT = ['remington700_308', 'ruger1022', 'shotgun12', 'revolver357', 'ak47'];
    const WEAPON_NAME = ['bolt rifle', '.22', 'shotgun', 'revolver', 'AK'];
    let hotSel = -1;

    const bar = ctx.hud.panel('hotbar', {
      style: 'left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:4px;'
        + 'padding:0;border:none;background:none;backdrop-filter:none',
    });

    function drawBar() {
      let html = '';
      for (let i = 0; i < HOTBAR; i++) {
        const label = i < 5 ? WEAPON_NAME[i] : (hot[i] || '');
        const on = i === hotSel;
        html += `<div class="hotSlot${on ? ' on' : ''}${label ? '' : ' empty'}">`
          + `<i>${i + 1}</i><span>${label ? String(label).replace(/^meat:|^fillet:/, '') : ''}</span></div>`;
      }
      bar.innerHTML = html;
    }

    function useHot(i) {
      const item = hot[i];
      if (!item) { ctx.toast(`Slot ${i + 1} is empty. Assign one from the pack.`); return; }
      hotSel = i;
      drawBar();
      ctx.emit('hotbar-use', { slot: i, item });
      /* Tools go into the hand, where the body module can draw them and
         the interaction module can use them. */
      const TOOL = { stoneAxe: 'axe', handAxe: 'axe', axe: 'axe', hatchet: 'axe',
        stonePick: 'pick', spear: 'spear', bow: 'bow', stoneKnife: 'knife', knife: 'knife' };
      if (TOOL[item]) {
        ctx.state.heldTool = ctx.state.heldTool === TOOL[item] ? null : TOOL[item];
        ctx.state.heldItem = ctx.state.heldTool ? item : null;
        ctx.toast(ctx.state.heldTool ? `${item} in hand.` : `${item} away.`);
      } else if (ctx.player.inventory.has(item)) {
        ctx.emit('use-item', { item });
      }
    }

    for (let i = 5; i < HOTBAR; i++) {
      const n = i;
      ctx.key(String(n + 1), () => { if (!ctx.state.uiOpen) useHot(n); }, `Hotbar ${n + 1}`);
    }
    ctx.state.assignHot = (slot, item) => { hot[slot] = item; drawBar(); };
    ctx.state.hotbar = hot;

    startingKit();
    drawBar();
    ctx.onUpdate(() => { if (ctx.state.hotbarDirty) { ctx.state.hotbarDirty = false; drawBar(); } });

    ctx.log('You washed up in a shirt, trousers and boots. All of it is soaked.');
  },
});
