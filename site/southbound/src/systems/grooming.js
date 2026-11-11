// Clothes and the barber, batch one (F13):
//  - Your clothes get dirty: walking and running on dirt, sand, grass and through the woods
//    muddies your shoes and trouser legs first, then the rest; rolling in it (going down) is worse,
//    rain on muddy ground worse still. A good rain rinses some of it off
//  - Blood: getting hurt bloodies your shirt, in patches
//  - Washing: Suds laundromats in Port Calvera and Mill Creek ($8, half an hour), the basin at
//    the hideout (free), and anything you change into is clean
//  - People notice: strangers comment on the mud, the blood or the beard; an officer who sees you
//    covered in blood wants to know whose it is
//  - A change of clothes as a disguise: change while the police are looking for you but can't see
//    you and they lose a star (not more than once every five minutes)
//  - Saved outfits: five slots in the phone (Outfits); you can change at the hideout, indoors, or
//    at a clothing store
//  - A jacket in the midday heat wears you out
//  - The barber: beard styles (full, goatee, moustache, stubble, clean), hair styles (short, buzz,
//    slicked back, shaved) and dye (black, brown, grey, blond, red); drawn by entities/clothing.js
//  - Saturday sale at every clothing store (20% off)
import { scanGround } from '../core/substrate.js';
import { CITY, TOWN } from '../world/layout.js';
import { keyHint, nearestRoad } from './world-util.js';

const SOFT = { soil: 1, sand: 0.6, grass: 0.45, litter: 0.7, water: 0.3 };
const COMMENTS = {
  dirt: ['Did you sleep in a ditch, mister?', 'You\'re tracking mud everywhere.', 'Rough night?'],
  blood: ['Is that... blood on your shirt?', 'Mister, you\'re bleeding. Or somebody is.', 'I didn\'t see nothing.'],
  beard: ['Nice beard. Very... wild.', 'You look like my uncle Gus. He lived in the woods.'],
};

export function installGrooming(game) {
  let api = null;
  return { get api() { return api; }, update(dt, a, free) { if (!api && game.outfitter && game.groom && game.openDialog) api = hook(game); return api ? api.update(dt, a, free) : ''; } };
}

function hook(game) {
  const { career, hud, S, player, sky, interact, police, peds } = game;
  const P = career.p, fit = game.outfitter;
  P.grime = P.grime || { dirt: 0, blood: 0 }; P.outfits = P.outfits || [null, null, null, null, null];
  P.stats.washes = P.stats.washes || 0; P.stats.haircuts = P.stats.haircuts || 0;
  const G = P.grime;
  game.groom.apply(); // (the outfitter exists now: draw the beard and hair as they are)
  const clean = (why) => { G.dirt = 0; G.blood = 0; P.stats.washes++; if (why) hud.toast(why, 2); career.saveSoon(); };

  // ---- changing clothes: always clean; a disguise if they're looking but can't see you
  let disguiseAt = -1e9;
  const wear0 = game.wearOutfit;
  game.wearOutfit = (o) => {
    wear0(o);
    G.dirt = 0; G.blood = 0;
    const now = performance.now();
    if (police.wanted > 0 && police.wanted <= 3 && !police.sight && now - disguiseAt > 300000) {
      disguiseAt = now; police.wanted--; police.lastSeen = null;
      hud.toast(police.wanted ? 'A change of clothes: they\'re looking for someone else now (one star less).' : 'A change of clothes: they\'ve lost you.', 3);
    }
  };
  const canChange = () => S.indoors || (game.gang?.HQ && Math.hypot(player.pos.x - game.gang.HQ.x, player.pos.z - game.gang.HQ.z) < 30);

  // ---- laundromats, and the basin at the hideout
  const spots = [];
  for (const [G0, name] of [[CITY, 'Suds Laundromat'], [TOWN, 'Suds Laundromat, Mill Creek']]) {
    const r = nearestRoad(game.graph, G0.x0 + G0.pitch * 1.5, G0.z0 - 18);
    if (!r) continue;
    const x = r.x + r.tz * 7, z = r.z - r.tx * 7;
    spots.push({ x, z });
    interact.add({ x, z, r: 2.2, color: 0x80c8ff, blip: { color: '#80c8ff', size: 4, global: true, icon: '🧺', badge: 'S' }, show: () => S.mode === 'foot' && !S.indoors,
      label: () => `${keyHint(game)} ${name}: wash your clothes ($8, half an hour)${G.dirt + G.blood < 0.05 ? ' · already clean' : ''}`,
      use: () => {
        if (G.dirt + G.blood < 0.05) return; if (!career.spend(8)) return;
        const done = () => { sky.hour += 0.5; if (sky.hour >= 24) { sky.hour -= 24; sky.day++; } clean('Washed and dried. Like new.'); };
        // (A2) a bundle into the machine, the lid shut, the wait
        if (game.acts && !S.doorWalk) { const A = game.acts; if (A.play([{ t: 0.9, clip: 'Interact', speed: 1.3 }, { t: 0.8, clip: 'Interact', speed: 1.6 }, { t: 1.8, pose: 'sit', start: () => A.fade(true, 'LAUNDRY', 'half an hour later') }], { done: () => { done(); setTimeout(() => A.fade(false), 400); } })) return; }
        done();
      } });
  }
  if (game.gang?.local) {
    const p = game.gang.local(-4, 7);
    interact.add({ x: p.x, z: p.z, r: 1.8, color: 0x80c8ff, show: () => S.mode === 'foot', label: () => `${keyHint(game)} wash up at the basin`, use: () => {
      // (A2) bent over the basin, scrubbing at it
      if (game.acts && !S.doorWalk) { const A = game.acts, b = { x: p.x, z: p.z, y: game.player.pos.y }; if (A.play([...A.workBeats(b, 'wrench', 2.6, false).map((x) => ({ ...x, start: (ctx) => { x.start?.(ctx); } }))], { done: () => clean('Scrubbed the worst of it out.') })) return; }
      clean('Scrubbed the worst of it out.');
    } });
  }

  // ---- the barber: styles and dye, added to the barber's chair
  const dlg0 = game.openDialog;
  game.openDialog = (title, text, options) => {
    if (title !== 'Barber') return dlg0(title, text, options);
    const st = P.groom.style;
    // (no dye is shown as 'natural')
    const cur = (k) => st[k] ?? (k === 'dye' ? 'natural' : 'none');
    const pick = (k, list, price, label) => {
      const nx = list[(list.indexOf(cur(k)) + 1) % list.length];
      return [`${label}: ${cur(k)} ▸ ${nx} · $${price}`, () => { if (!career.spend(price)) return; st[k] = k === 'dye' && nx === 'natural' ? null : nx; if (k !== 'dye') P.stats.haircuts++; game.groom.apply(); hud.toast(`${label}: ${nx}`, 1.6); career.saveSoon(); }];
    };
    const extra = [
      pick('beard', ['full', 'goatee', 'moustache', 'stubble', 'clean'], 12, 'Beard'),
      pick('hair', ['short', 'buzz', 'slicked', 'shaved'], 20, 'Hair'),
      pick('dye', ['natural', 'black', 'brown', 'grey', 'blond', 'red'], 30, 'Dye'),
    ];
    const opts = [...options.slice(0, -1), ...extra, options[options.length - 1]];
    return dlg0(title, text, opts);
  };

  // ---- the Saturday sale
  const store = game.clothingStore;
  if (store) {
    const show0 = store.show.bind(store);
    store.show = (st) => {
      // (a discounted copy: the store reads priceK again when it draws and when you buy)
      if (st && st.priceK && st.id !== 'wardrobe' && sky.day % 7 === 6) { hud.toast('Saturday sale: 20% off everything!', 2.4); return show0({ ...st, priceK: st.priceK * 0.8, sale: true }); }
      return show0(st);
    };
  }

  // ---- saved outfits in the phone
  const ph = game.phoneSys?.phone;
  if (ph) {
    const cfg = ph.cfg;
    cfg.tabs.splice(cfg.tabs.findIndex((t) => t.k === 'apps'), 0, { k: 'outfits', label: 'Outfits' });
    const items0 = cfg.items, row0 = cfg.row, act0 = cfg.act, note0 = cfg.note;
    cfg.note = (t) => t === 'outfits' ? `Save what you're wearing, or change into a saved outfit (at the hideout, indoors or in a clothing store). Clothes: ${G.dirt > 0.5 ? 'filthy' : G.dirt > 0.2 ? 'muddy' : 'clean'}${G.blood > 0.15 ? ', bloodstained' : ''}.` : note0(t);
    cfg.items = (t) => t === 'outfits' ? P.outfits.map((o, i) => ({ i, o })) : items0(t);
    cfg.row = (it, t) => t === 'outfits' ? { name: `Outfit ${it.i + 1}`, sub: it.o ? Object.values(it.o).filter(Boolean).length + ' pieces' : 'empty', stats: [], btn: it.o ? 'Wear' : 'Save here' } : row0(it, t);
    cfg.act = (it, t) => {
      if (t !== 'outfits') return act0(it, t);
      if (!it.o) { P.outfits[it.i] = { ...P.outfit }; hud.toast(`Saved as outfit ${it.i + 1}`, 1.4); career.saveSoon(); return; }
      if (!canChange()) { hud.toast('Find somewhere to change: the hideout, indoors, or a clothing store.', 2.4); return; }
      P.outfit = { ...it.o }; game.wearOutfit(P.outfit); hud.toast(`Changed into outfit ${it.i + 1}`, 1.4); career.saveSoon();
    };
  }

  let hp = player.health, groundT = 0, commentT = 20, copT = 0, heatT = 0, heatWarned = false;
  return {
    clean, get grime() { return G; }, canChange,
    update(dt) {
      // ---- mud from the ground you cover, worse in the rain; the rain rinses a little off
      if (S.mode === 'foot' && !S.indoors) {
        const sp = player.speed || Math.hypot(player.vel?.x || 0, player.vel?.z || 0);
        const rain = game.weather?.rain || 0;
        if ((groundT -= dt) <= 0) { groundT = 0.5; const id = scanGround(player.pos.x, player.pos.z).sub?.id; this._soft = SOFT[id] || 0; }
        if (sp > 0.8 && this._soft) G.dirt = Math.min(1, G.dirt + dt * sp * 0.0009 * this._soft * (1 + rain * 2));
        if (player.h?.ragdoll && this._soft) G.dirt = Math.min(1, G.dirt + dt * 0.08);
        if (rain > 0.5 && !this._soft) G.dirt = Math.max(0, G.dirt - dt * 0.0012);
      }
      // ---- blood when you're hurt
      if (player.health < hp - 0.5) G.blood = Math.min(1, G.blood + (hp - player.health) * 0.012);
      hp = player.health;
      fit.setGrime?.(G.dirt, G.blood);
      // ---- people notice
      if ((commentT -= dt) <= 0) {
        commentT = 35 + Math.random() * 25;
        const why = G.blood > 0.3 ? 'blood' : G.dirt > 0.55 ? 'dirt' : (P.groom.beard > 6 && P.groom.style?.beard !== 'clean') ? 'beard' : null;
        const p = why && peds.list.find((q) => q.mode !== 'dead' && !q.role && q.pos.distanceTo(player.pos) < 5);
        if (p) { const L = COMMENTS[why]; hud.toast(`"${L[(Math.random() * L.length) | 0]}"`, 2.6); }
      }
      // ---- an officer sees the blood
      if (G.blood > 0.4 && police.wanted === 0 && (copT -= dt) <= 0) {
        const cop = peds.list.find((q) => q.role === 'cop' && q.mode !== 'dead' && q.pos.distanceTo(player.pos) < 12);
        if (cop) { copT = 120; hud.toast('Officer: "Stop right there. Whose blood is that?"', 3); police.crime('disturbance'); }
      }
      // ---- a jacket in the midday heat
      const outer = !!P.outfit?.outer, hot = sky.hour > 11 && sky.hour < 16 && (game.weather?.kind === 'clear' || game.weather?.kind === 'cloudy') && !S.indoors;
      if (outer && hot && S.mode === 'foot') {
        heatT += dt;
        // (on the game clock, like the rest of tiredness: about 60% faster in the heat)
        const clock = sky.day * 24 + sky.hour, gh = this._clock == null ? 0 : clock - this._clock; this._clock = clock;
        if (game.needs?.N && gh > 0 && gh < 1) game.needs.N.energy = Math.max(0, game.needs.N.energy - gh * 2.5);
        if (heatT > 60 && !heatWarned) { heatWarned = true; hud.toast('It\'s too hot for a jacket. You\'re wilting.', 2.6); }
      } else { heatT = 0; this._clock = null; if (!hot) heatWarned = false; }
      return '';
    },
  };
}
