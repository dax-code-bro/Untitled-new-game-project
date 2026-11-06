// Food and the Gulf Marts, batch one:
//  - Fresh food goes off: a po'boy, étouffée, gumbo, catfish or boudin you've carried for more than a
//    day is "going off", and eating it can make you sick (you lose health and feel it for a while)
//  - Coffee and energy drinks wake you up a bit (they help with tiredness, not just your aim)
//  - A loyalty card: every tenth Gulf Mart purchase is on the house
//  - Today's special: one thing on the menu each day at 40% off
import { money } from './world-util.js';

const PERISH = new Set(['poboy', 'etouffee', 'gumbo', 'catfish', 'boudin']);
const WAKE = { coffee: 12, energy: 18 };

// (the Gulf Mart menu is built after the systems, so this hooks in on the first frame it exists)
export function installFoodPlus(game) {
  let api = null;
  return {
    get special() { return api?.special; }, get sick() { return api?.sick || 0; },
    update(dt) { if (!api && game.mart) api = hook(game); return api ? api.update(dt) : ''; },
  };
}

function hook(game) {
  const { career, hud, sky, player } = game;
  const M = game.mart;
  const P = career.p, cfg = M.cfg;
  P.foodDay = P.foodDay || {}; P.martStamps = P.martStamps || 0;
  const special = () => { const list = cfg.items('here'); return list[(sky.day * 7 + 3) % list.length]; };
  const old = (id) => PERISH.has(id) && P.food[id] > 0 && P.foodDay[id] != null && sky.day - P.foodDay[id] >= 1;

  // the menu: today's special, the loyalty card
  const row0 = cfg.row, act0 = cfg.act, note0 = cfg.note;
  cfg.note = (t) => `${note0(t)} · Loyalty card: ${P.martStamps}/10 · Today's special: ${special().name}, 40% off.`;
  cfg.row = (f, t) => {
    const r = row0(f, t);
    if (f === special()) { r.name = `★ ${f.name} (today's special)`; r.btn = `$${Math.round(f.price * M.k * 0.6)}`; }
    if (t === 'go' && old(f.id)) r.sub += ' · the one you have is going off';
    return r;
  };
  cfg.act = (f, t) => {
    const k0 = M.k, m0 = career.money;
    if (f === special()) M.k = k0 * 0.6;
    const hadFood = P.food[f.id] || 0;
    try { act0(f, t); } finally { M.k = k0; }
    const paid = m0 - career.money;
    if (paid <= 0) return;
    if (t === 'go' && !hadFood && P.food[f.id] > 0) P.foodDay[f.id] = sky.day; // the oldest one you carry
    P.martStamps++;
    if (P.martStamps >= 10) { P.martStamps = 0; career.earn(paid, 'loyalty card'); hud.toast(`Loyalty card full: that one's on the house (${money(paid)} back)`, 2.6); }
    if (WAKE[f.id] && t === 'here') wake(f.id);
  };

  // eating what you carry: coffee wakes you, old food might not agree with you
  const wake = (id) => { const N = game.needs?.N; if (N) N.energy = Math.min(100, N.energy + WAKE[id]); };
  const inv0 = game.foodInventory;
  game.foodInventory = () => inv0().map((it) => {
    const id = Object.keys(P.food).find((k) => it.name && P.food[k] > 0 && game.mart.cfg.items('here').find((f) => f.id === k)?.name === it.name);
    if (!id) return it;
    const eat0 = it.eat, spoiled = old(id);
    return { ...it, sub: it.sub + (spoiled ? ' · going off' : ''), eat: () => {
      eat0();
      if (WAKE[id]) wake(id);
      if (!P.food[id]) delete P.foodDay[id];
      if (spoiled && Math.random() < 0.45) {
        player.health = Math.max(5, player.health - 22);
        const N = game.needs?.N; if (N) { N.food = Math.max(0, N.food - 15); N.energy = Math.max(0, N.energy - 10); }
        sick = 90; hud.toast('That tasted off. Your stomach turns.', 3);
      }
    } };
  });

  let sick = 0, sickT = 0;
  return {
    special, get sick() { return sick; },
    update(dt) {
      // food poisoning: queasy for a minute and a half, no healing, the odd groan
      if (sick > 0) {
        sick -= dt;
        if ((sickT -= dt) <= 0) { sickT = 20; hud.toast('You feel sick…', 1.4); }
      }
      return '';
    },
  };
}
