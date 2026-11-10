// The Gulf Line crew, batch one (F10): the fourteen at the hideout become people you run.
//
//  Crew:    loyalty and moods, four skills each (driving, shooting, stealth, smarts) that grow
//           with work, a roster tab, payday every three days (skip it and they grumble, then
//           drift), gifts, a weekly favour each, birthdays, the gang's respect (Unknown ...
//           Legend), which unlocks the bigger upgrades.
//  Jobs:    send members out: a smuggling run, the chop shop, a card game, collections, a charter.
//           They're gone for hours of game time; skills, loyalty and heat decide how it goes.
//           They come back with money (into the stash), hurt (Marisol patches them up over a
//           day) or arrested (bail them out, or they sit three days and come home sour).
//           Every job raises the gang's heat; heat cools a little each day.
//  Hideout: Rico's morning briefing (a tip a day), talk round the fire at night, a greeting when
//           you get back, the crew noticing you're hurt or have the police on you, errands by
//           day, sleep and a night watch by night, three daily chores (wood, water, the fence),
//           eight upgrades (bunks, armory rack, kitchen, watchtower, radio, floodlights, gate,
//           garage bay) and a cash stash nobody can rob you of on the street.
//  Rivals:  gangs you've run off their turf come back for the hideout at night; while you're away
//           they can hit the stash (the gate stops them). A Turf tab, and truces you can buy.
import * as THREE from 'three';
import { WEAPONS } from '../entities/arsenal.js';
import { RIVALS } from './world-events.js';
import { money, keyHint } from './world-util.js';

const SK = ['drive', 'shoot', 'stealth', 'smarts'];
const BASE_SKILLS = {
  rico: [2, 3, 2, 5], tina: [1, 4, 2, 4], deshawn: [4, 2, 1, 3], marisol: [2, 2, 3, 4], cap: [3, 2, 2, 3], nina: [1, 1, 4, 5], lalo: [3, 2, 3, 4],
  'big-o': [2, 5, 1, 1], sofia: [5, 3, 3, 2], hector: [1, 2, 2, 2], jayden: [2, 2, 4, 3], vera: [5, 2, 2, 3], smoke: [4, 3, 5, 3], mateo: [2, 2, 2, 1],
};
const JOBS = [
  { id: 'smuggle', name: 'Smuggling run up the coast', sk: ['drive', 'stealth'], hours: 6, pay: [600, 1200], heat: 14, risk: 'arrest', prefer: 'smoke' },
  { id: 'chop', name: 'Strip cars at the chop shop', sk: ['smarts', 'drive'], hours: 4, pay: [400, 900], heat: 10, risk: 'arrest', prefer: 'lalo' },
  { id: 'cards', name: 'Card game at the docks', sk: ['smarts', 'stealth'], hours: 3, pay: [-250, 800], heat: 3, risk: 'hurt', prefer: 'nina' },
  { id: 'collect', name: 'Collect what\'s owed', sk: ['shoot', 'smarts'], hours: 2, pay: [300, 520], heat: 8, risk: 'hurt', prefer: 'big-o' },
  { id: 'charter', name: 'Fishing charter for tourists', sk: ['drive', 'smarts'], hours: 5, pay: [250, 450], heat: 0, risk: null, prefer: 'cap' },
];
const RANKS = [[600, 'Legend'], [300, 'Feared'], [150, 'Respected'], [50, 'Known'], [0, 'Unknown']];
const UPGRADES = [
  { id: 'bunks', name: 'Bunkhouse beds', cost: 1200, rep: 0, sub: 'Sleep at the hideout and wake fully rested and healed.' },
  { id: 'kitchen', name: 'Outdoor kitchen', cost: 900, rep: 0, sub: 'A free hot meal from Hector once a day.' },
  { id: 'radio', name: 'Police radio', cost: 600, rep: 0, sub: 'Hear the police radio anywhere near the hideout.' },
  { id: 'lights', name: 'Floodlights', cost: 1500, rep: 50, sub: 'The yard lit up at night. Raids are less likely.' },
  { id: 'gate', name: 'Gate and fence', cost: 2000, rep: 50, sub: 'Raids while you\'re away can\'t get at the stash.' },
  { id: 'rack', name: 'Armory rack', cost: 2500, rep: 50, sub: 'Restock the ammo for every gun you own once a day.' },
  { id: 'tower', name: 'Watchtower', cost: 3000, rep: 150, sub: 'Jayden calls out police and raiders coming up the road.' },
  { id: 'bay', name: 'Garage bay', cost: 4000, rep: 150, sub: 'Wrench fixes your ride in the bay at half price.' },
];
const BRIEFS = [
  'Word is a white buck\'s been seen in Pinewood Hollow at first light.', 'Cops are doubling patrols downtown this week. Stay out of the city if you\'re carrying.',
  'Bass are biting at the lake at dusk. Hector wants fish.', 'Halcones are short-handed since you hit them. Their turf is soft.',
  'The trucking firm in Mill Creek pays double on night runs.', 'Somebody\'s been asking about you at the bar. Keep your head down.',
  'Storm coming in off the Gulf later. Nobody\'s taking the boats out.', 'Gulf Mart\'s got a deal on coffee. Lalo bought forty cups.',
  'A rich guy on Magnolia St left his garage open three nights running.', 'Bounty hunters are working the county roads. Drive careful.',
];
const FIRE_TALK = [
  ['Sofia', 'Who parked the truck in the ditch again?', 'Mateo', 'It was dark! The ditch moved!'],
  ['Hector', 'Who ate the last of the gumbo?', 'Big O', '...'],
  ['Nina', 'I got into the county records today.', 'Rico', 'Anything about me?', ],
  ['Cap', 'Forty years on the water. Saw a gator take a whole canoe once.', 'Jayden', 'With somebody in it?'],
  ['Tina', 'Mateo, put my file down.', 'Mateo', 'I was just looking!'],
  ['Rico', 'Money\'s good this month. Don\'t get used to it.', 'Lalo', 'Too late, jefe.'],
  ['Marisol', 'Two credits. Two credits short of being a nurse.', 'Sofia', 'You\'re better than the real ones.'],
  ['Vera', 'I landed in a soybean field once. Farmer gave me lunch.', 'DeShawn', 'He give you a new propeller too?'],
  ['Smoke', 'Don\'t ask what was in the boxes.', 'Jayden', 'I didn\'t ask.'],
  ['DeShawn', 'It was the alternator.', 'Rico', 'It\'s always the alternator.'],
  ['Jayden', 'Scanner says they lost a cruiser in the bayou.', 'Cap', 'Bayou keeps what it takes.'],
  ['Mateo', 'One day I\'m gonna run this crew.', 'Rico', 'One day I\'m gonna retire. Not today.'],
];
const GIFT = 25;

export function installCrew(game) {
  let api = null;
  return {
    get api() { return api; },
    update(dt, a, free) { if (!api && game.gang?.svc && game.sky) api = hook(game); return api ? api.update(dt, a, free) : ''; },
  };
}

function hook(game) {
  const { career, hud, S, player, scene, sky } = game;
  const G = game.gang, P = career.p, rnd = Math.random;
  const now = () => sky.day * 24 + sky.hour;
  P.crew = P.crew || {};
  P.hideout = P.hideout || { up: {}, stash: 0, brief: -1, meal: -1, ammo: -1, chores: {} };
  P.gangRep = P.gangRep || 0; P.gangHeat = P.gangHeat || 0; P.payDue = P.payDue ?? sky.day + 3; P.truce = P.truce || {};
  const H = P.hideout;
  const C = (id) => {
    if (!P.crew[id]) { const b = BASE_SKILLS[id] || [2, 2, 2, 2]; P.crew[id] = { loyalty: 60, skills: Object.fromEntries(SK.map((k, i) => [k, b[i]])), jobs: 0, away: null, hurt: 0, jail: 0, gift: -1, favour: -1 }; }
    return P.crew[id];
  };
  const first = (M) => M.name.split(' ')[0].replace(/"/g, '');
  const rank = () => RANKS.find(([n]) => P.gangRep >= n)[1];
  const bday = (id) => (Math.abs([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 28);
  const isBday = (id) => sky.day % 28 === bday(id);
  const say = G.say;
  const text = (from, body) => game.text?.(from, body) || hud.toast(`${from}: ${body}`, 3);
  const nearHQ = (r) => Math.hypot(player.pos.x - G.HQ.x, player.pos.z - G.HQ.z) < r;
  const mood = (id) => {
    const c = C(id);
    if (c.jail > now()) return 'locked up';
    if (c.away) return 'out on a job';
    if (c.hurt > now()) return 'hurting';
    if (c.loyalty < 25) return 'angry';
    if (sky.day > P.payDue) return 'grumbling';
    if (P.gangHeat > 60) return 'nervous';
    return c.loyalty > 75 ? 'happy' : 'content';
  };
  const addLoyalty = (id, n) => { const c = C(id); c.loyalty = Math.max(0, Math.min(100, c.loyalty + n)); };
  const allLoyalty = (n) => { for (const m of G.crew) addLoyalty(m.M.id, n); };
  const rep = (n) => { const r0 = rank(); P.gangRep = Math.max(0, P.gangRep + n); if (rank() !== r0) { hud.bigMessage('GULF LINE', `The crew is ${rank()} now`, 3); game.news?.(`Word on the street: the Gulf Line crew is ${rank().toLowerCase()} in Calvera.`); } };
  const available = () => G.crew.filter((m) => { const c = C(m.M.id); return !c.away && c.jail <= now() && c.hurt <= now(); });

  // ---------------- favours: one a week each, from what you carry
  const FAVOURS = [
    { k: 'fish', text: 'bring me two fish for the pot', ok: () => Object.values(P.fish || {}).reduce((a, f) => a + (f?.n || 0), 0) >= 2, take: () => { let n = 2; for (const f of Object.values(P.fish)) { if (!f || !n) continue; const k = Math.min(n, f.n); f.n -= k; f.lb *= f.n / (f.n + k); n -= k; } } },
    { k: 'metal', text: 'find me three pieces of scrap metal', ok: () => (P.supplies?.metal || 0) >= 3, take: () => { P.supplies.metal -= 3; } },
    { k: 'meat', text: 'bring me five pounds of game meat', ok: () => (P.meat || 0) >= 5, take: () => { P.meat -= 5; } },
    { k: 'pelt', text: 'get me a pelt, any kind', ok: () => Object.values(P.pelts || {}).some((n) => n > 0), take: () => { const k = Object.keys(P.pelts).find((x) => P.pelts[x] > 0); P.pelts[k]--; if (P.peltVal?.[k]) P.peltVal[k] = Math.round(P.peltVal[k] * P.pelts[k] / (P.pelts[k] + 1)); } },
    { k: 'cash', text: 'lend me $150 till the weekend', ok: () => S.money >= 150, take: () => { S.money -= 150; } },
  ];
  const favourOf = (id) => FAVOURS[(bday(id) + Math.floor(sky.day / 7)) % FAVOURS.length];

  // ---------------- extra rows in each member's own talk menu
  game.crewItems = (M) => {
    const c = C(M.id), out = [];
    const f = favourOf(M.id), week = Math.floor(sky.day / 7);
    out.push({ name: `${first(M)}: loyalty ${Math.round(c.loyalty)}/100 · ${mood(M.id)}`, sub: SK.map((k) => `${k} ${'●'.repeat(c.skills[k])}${'○'.repeat(5 - c.skills[k])}`).join('  ') + (isBday(M.id) ? ' · birthday today!' : ''), btn: '·', dis: true, run: () => {} });
    out.push({ name: isBday(M.id) ? 'Birthday present' : 'Give a gift', sub: c.gift === sky.day ? 'Already had one today' : 'A bottle of something good', price: GIFT, dis: c.gift === sky.day,
      run: () => { c.gift = sky.day; addLoyalty(M.id, isBday(M.id) ? 16 : 6); say(first(M), isBday(M.id) ? 'You remembered! Come here.' : 'For me? Alright, John.'); } });
    out.push({ name: `Favour: ${f.text}`, sub: c.favour === week ? 'Done this week' : f.ok() ? 'You have it with you' : 'You don\'t have it yet', btn: c.favour === week ? 'Done' : 'Give', dis: c.favour === week || !f.ok(),
      run: () => { f.take(); c.favour = week; addLoyalty(M.id, 15); rep(5); if (f.k === 'cash') H.repay = (H.repay || 0) + 180; say(first(M), 'I owe you one. I mean it.'); } });
    if (M.service === 'mechanic' && H.up.bay) {
      const last = game.lastVehicle?.();
      out.push({ name: 'Fix my ride in the bay', sub: last ? `${last.spec.name} · half price` : 'no car', price: 90, dis: !last || last.pos.distanceTo(player.pos) > 30, run: () => { last.health = last.maxHealth; last.dmg = null; say('DeShawn', 'Good as new. Better, actually.'); } });
    }
    return out;
  };

  // ---------------- new tabs on the crew's menu: Crew, Jobs, Hideout, Turf
  const svc = G.svc, cfg = svc.cfg;
  cfg.tabs.push({ k: 'crew', label: 'Crew' }, { k: 'jobs', label: 'Jobs' }, { k: 'hideout', label: 'Hideout' }, { k: 'turf', label: 'Turf' });
  const items0 = cfg.items, row0 = cfg.row, act0 = cfg.act, note0 = cfg.note;
  const pay = () => 50 * G.crew.length;
  cfg.note = (t) => t === 'crew' ? `The Gulf Line: ${rank()} (respect ${P.gangRep}). Heat ${Math.round(P.gangHeat)}. Payday ${sky.day >= P.payDue ? 'is due' : `in ${P.payDue - sky.day} day(s)`}.`
    : t === 'jobs' ? `Send someone out. They take a cut; yours goes in the stash. Heat ${Math.round(P.gangHeat)} (higher heat, more arrests).`
    : t === 'hideout' ? `Stash: ${money(H.stash)} (safe from muggers, arrests and hospital bills). Respect: ${rank()}.`
    : t === 'turf' ? 'The other gangs in Calvera, and where you stand with them.' : note0(t);
  cfg.items = (t) => {
    if (t === 'crew') return [{ k: 'pay' }, ...G.crew.map((m) => ({ k: 'm', m })), ...G.crew.filter((m) => C(m.M.id).jail > now()).map((m) => ({ k: 'bail', m }))];
    if (t === 'jobs') return JOBS.map((j) => ({ k: 'job', j }));
    if (t === 'hideout') return [{ k: 'dep' }, { k: 'wd' }, ...UPGRADES.map((u) => ({ k: 'up', u }))];
    if (t === 'turf') return RIVALS.map((R) => ({ k: 'turf', R }));
    return items0(t);
  };
  const bestFor = (j) => available().sort((a, b) => score(b.M.id, j) - score(a.M.id, j))[0] || null;
  const score = (id, j) => { const c = C(id); return j.sk.reduce((s, k) => s + c.skills[k], 0) + (id === j.prefer ? 1.5 : 0) + (c.loyalty - 50) / 40; };
  const bail = (id) => 400 + C(id).jobs * 60;
  cfg.row = (it, t) => {
    if (it.k === 'pay') { const due = sky.day >= P.payDue; return { name: 'Pay the crew their cut', sub: due ? `Due now: ${money(pay())} for ${G.crew.length} people` : `Next payday in ${P.payDue - sky.day} day(s)`, stats: [], btn: due ? money(pay()) : 'Not yet', cls: due ? '' : 'dis' }; }
    if (it.k === 'm') { const c = C(it.m.M.id); return { name: `${it.m.M.name} · ${it.m.M.role}`, sub: `${mood(it.m.M.id)}${c.away ? ` (${JOBS.find((j) => j.id === c.away.job)?.name.toLowerCase()})` : ''} · ${c.jobs} jobs`, stats: [['Loyalty', c.loyalty / 100], ...SK.map((k) => [k[0].toUpperCase() + k.slice(1), c.skills[k] / 5])], btn: '·', cls: 'dis' }; }
    if (it.k === 'bail') return { name: `Bail out ${first(it.m.M)}`, sub: `Held at the precinct till day ${Math.ceil(C(it.m.M.id).jail / 24)}`, stats: [], btn: money(bail(it.m.M.id)) };
    if (it.k === 'job') { const b = bestFor(it.j); return { name: it.j.name, sub: `${it.j.hours} h · ${money(it.j.pay[0])}–${money(it.j.pay[1])}${it.j.risk ? ` · risk: ${it.j.risk === 'arrest' ? 'arrest' : 'injury'}` : ''} · ${b ? `best free: ${first(b.M)}` : 'nobody free'}`, stats: [], btn: b ? `Send ${first(b.M)}` : '—', cls: b ? '' : 'dis' }; }
    if (it.k === 'dep') return { name: 'Put cash in the stash', sub: `You have ${money(S.money)}`, stats: [], btn: 'All' };
    if (it.k === 'wd') return { name: 'Take cash from the stash', sub: `In the stash: ${money(H.stash)}`, stats: [], btn: 'All' };
    if (it.k === 'up') { const has = H.up[it.u.id], ok = P.gangRep >= it.u.rep; return { name: it.u.name, sub: `${it.u.sub}${ok ? '' : ` (needs ${RANKS.find(([n]) => n === it.u.rep)?.[1] || it.u.rep} respect)`}`, stats: [], btn: has ? 'Built' : money(it.u.cost), cls: has ? 'own' : ok ? '' : 'dis' }; }
    if (it.k === 'turf') { const n = P.rivals?.[it.R.id] || 0, tr = (P.truce[it.R.id] || 0) > sky.day; return { name: it.R.name, sub: `${it.R.where} · run off ${n} time${n === 1 ? '' : 's'}${tr ? ` · truce till day ${P.truce[it.R.id]}` : n ? ' · they want payback' : ''}`, stats: [], btn: tr ? 'Truce' : `Truce ${money(1500)}`, cls: tr ? 'own' : '' }; }
    return row0(it, t);
  };
  cfg.act = (it, t) => {
    if (it.k === 'pay') { if (sky.day < P.payDue) return; if (!career.spend(pay())) return; P.payDue = sky.day + 3; allLoyalty(8); say('Rico', 'Everybody eats. That\'s how it works.'); career.saveSoon(); return; }
    if (it.k === 'bail') { if (!career.spend(bail(it.m.M.id))) return; C(it.m.M.id).jail = 0; addLoyalty(it.m.M.id, 20); text(first(it.m.M), 'Out. Thanks for not leaving me in there.'); career.saveSoon(); return; }
    if (it.k === 'job') { const b = bestFor(it.j); if (!b) return; send(b, it.j); career.saveSoon(); return; }
    if (it.k === 'dep') { H.stash += S.money; S.money = 0; career.saveSoon(); return; }
    if (it.k === 'wd') { S.money += H.stash; H.stash = 0; career.saveSoon(); return; }
    if (it.k === 'up') { if (H.up[it.u.id] || P.gangRep < it.u.rep || !career.spend(it.u.cost)) return; H.up[it.u.id] = true; build(it.u.id); say('Rico', 'Look at us. Practically legitimate.'); career.saveSoon(); return; }
    if (it.k === 'turf') { if ((P.truce[it.R.id] || 0) > sky.day || !career.spend(1500)) return; P.truce[it.R.id] = sky.day + 7; text(it.R.name, 'A week. Stay off our corner and we stay off yours.'); career.saveSoon(); return; }
    return act0(it, t);
  };

  // ---------------- crew jobs
  function send(m, j) {
    const c = C(m.M.id);
    c.away = { job: j.id, until: now() + j.hours * (0.8 + rnd() * 0.4) };
    m.away = true;
    P.gangHeat = Math.min(100, P.gangHeat + j.heat * 0.5);
    say(first(m.M), ['On it.', 'Back before you miss me.', 'Easy money.'][(rnd() * 3) | 0]);
  }
  function settle(m) {
    const c = C(m.M.id), j = JOBS.find((x) => x.id === c.away.job);
    c.away = null; m.away = false; c.jobs++;
    if (!j) return;
    const sk = j.sk.reduce((s, k) => s + c.skills[k], 0) / 10;
    const chance = Math.max(0.15, Math.min(0.95, 0.45 + sk * 0.45 + (c.loyalty - 50) / 250 - P.gangHeat / 300));
    P.gangHeat = Math.min(100, P.gangHeat + j.heat * 0.5);
    if (rnd() < chance) {
      const cut = Math.round(j.pay[0] + (j.pay[1] - j.pay[0]) * Math.min(1, rnd() * 0.6 + sk * 0.6));
      if (cut >= 0) { H.stash += cut; rep(4); addLoyalty(m.M.id, 3); text(first(m.M), `${j.name}: done. ${money(cut)} in the stash.`); }
      else { H.stash = Math.max(0, H.stash + cut); text(first(m.M), `Lost ${money(-cut)} at cards. Don't tell Rico.`); }
      // practice makes them better at it
      for (const k of j.sk) if (c.skills[k] < 5 && rnd() < 0.25) { c.skills[k]++; text(first(m.M), `Getting good at this (${k} ${c.skills[k]}/5).`); }
    } else if (j.risk === 'arrest') {
      c.jail = now() + 72; addLoyalty(m.M.id, -6); P.gangHeat = Math.min(100, P.gangHeat + 10); m.away = true;
      text('Rico', `They picked up ${first(m.M)} on the ${j.name.toLowerCase()}. Bail's ${money(bail(m.M.id))} (the crew menu), or ${first(m.M)} sits three days.`);
      game.news?.(`Arrest made near the coast road: police seize goods.`);
    } else if (j.risk === 'hurt') {
      c.hurt = now() + 20; addLoyalty(m.M.id, -2);
      text('Marisol', `${first(m.M)} came back hurt. I've got it. Keep them off their feet for a day.`);
    } else text(first(m.M), 'Came back with nothing. Bad day.');
  }

  // ---------------- the hideout upgrades: things you can see, and places to use them
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.85 }), metal = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.5, metalness: 0.6 });
  const box = (w, h, d, m, lx, lz, y = 0, ry = 0) => { const p = G.local(lx, lz), o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(p.x, G.groundY(p.x, p.z) + y + h / 2, p.z); o.rotation.y = G.HQ.face + ry; o.castShadow = o.receiveShadow = true; scene.add(o); return o; };
  const at = (lx, lz) => { const p = G.local(lx, lz); return { x: p.x, z: p.z }; };
  const lights = [];
  function build(id) {
    if (id === 'tower') { for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.2, 6, 0.2, wood, -15 + x, 11 + z); box(2.6, 0.15, 2.6, wood, -15, 11, 6); box(2.6, 1, 0.1, wood, -15, 12.3, 6.1); }
    if (id === 'lights') for (const [x, z] of [[11, -11], [-11, -11], [9, 12]]) { box(0.15, 5, 0.15, metal, x, z); const l = new THREE.PointLight(0xfff0d6, 0, 26, 1.6); const p = at(x, z); l.position.set(p.x, G.groundY(p.x, p.z) + 5, p.z); scene.add(l); lights.push(l); box(0.5, 0.25, 0.3, metal, x, z, 5); }
    if (id === 'gate') for (const s of [-1, 1]) { box(0.3, 2.2, 0.3, wood, s * 3.4, 16); box(0.12, 1.2, 9, wood, s * 8.4, 16, 0.3, Math.PI / 2); }
    if (id === 'rack') { box(1.8, 1.6, 0.4, wood, -7, -5); for (let i = 0; i < 4; i++) box(0.06, 1.1, 0.06, metal, -7.6 + i * 0.4, -4.85, 0.35); }
    if (id === 'kitchen') { box(1.6, 0.9, 0.8, metal, 6, -6); box(1.6, 0.06, 0.8, metal, 6, -6, 0.95); }
    if (id === 'radio') { box(0.9, 0.75, 0.6, wood, 1.6, 1.2); box(0.4, 0.22, 0.25, metal, 1.6, 1.2, 0.75); }
    if (id === 'bay') { box(6, 3.2, 0.2, metal, 11, 5); box(0.2, 3.2, 6, metal, 14, 8); box(6.2, 0.15, 6.2, metal, 11, 8, 3.2); }
    if (id === 'bunks') { box(2, 0.5, 0.9, wood, -10, -7); box(2, 0.5, 0.9, wood, -10, -8.4); }
  }
  for (const u of UPGRADES) if (H.up[u.id]) build(u.id);
  const point = (lx, lz, label, show, use) => { const p = at(lx, lz); game.interact.add({ x: p.x, z: p.z, r: 1.8, color: 0xd0a040, label, show: () => S.mode === 'foot' && !S.indoors && show(), use }); };
  point(6, -6.9, () => `${keyHint(game)} eat at the kitchen${H.meal === sky.day ? ' (had today\'s)' : ''}`, () => H.up.kitchen, () => {
    if (H.meal === sky.day) { say('Hector', 'You already ate. Come back tomorrow.'); return; }
    H.meal = sky.day;
    if (game.acts && !S.doorWalk) game.acts.play(game.acts.eatBeats(game.acts.prop('bowl'), 3.4, 4)); // (A2) a bowl of it, spoon by spoon player.health = Math.min(player.maxHealth || 100, player.health + 30); if (game.needs?.N) game.needs.N.food = Math.min(100, game.needs.N.food + 45); say('Hector', 'Red beans and rice. Sit down and eat it properly.');
  });
  point(-7, -4.2, () => `${keyHint(game)} restock ammo from the rack${H.ammo === sky.day ? ' (done today)' : ''}`, () => H.up.rack, () => {
    if (H.ammo === sky.day) { hud.toast('The rack\'s empty till tomorrow.', 1.6); return; }
    H.ammo = sky.day; const cb = game.combat;
    if (game.acts && !S.doorWalk) { const rk = at(-7, -4.9); game.acts.play([{ face: rk, t: 0.3 }, { clip: 'Interact', speed: 1.4, t: 0.7 }, { clip: 'Interact', speed: 1.4, t: 0.7 }]); } // (A2) boxes down off the rack
    for (const id of cb.owned) { const w = WEAPONS[id]; if (!w || w.melee || !cb.ammo[id]) continue; cb.ammo[id].reserve = Math.max(cb.ammo[id].reserve, (w.clip || 10) * 4); }
    hud.toast('Restocked every gun you own', 1.8);
  });
  // chores: once a day each; the crew notices
  const CHORES = [['wood', -9, 6, 'chop firewood', 'The fire won\'t feed itself.'], ['water', 5, -9, 'haul water from the creek', 'Hector says thanks.'], ['fence', 12, -2, 'mend the fence', 'Big O nods. That\'s a lot, from him.']];
  for (const [k, x, z, what, line] of CHORES) {
    box(1.1, 0.5, 0.7, k === 'water' ? metal : wood, x, z);
    point(x, z + 1, () => `${keyHint(game)} ${what}${H.chores[k] === sky.day ? ' (done today)' : ''}`, () => true, () => {
      if (H.chores[k] === sky.day) return;
      const doneIt = () => { H.chores[k] = sky.day; allLoyalty(2); rep(2); S.money += 20; if (game.needs?.N) game.needs.N.energy = Math.max(0, game.needs.N.energy - 6); hud.toast(`Done: ${what}. ${line} (+$20)`, 2.4); career.saveSoon(); };
      // (A2) the work itself: the axe on the woodpile, a bucket from the creek, the hammer on the fence
      if (game.acts && !S.doorWalk) {
        const spot = at(x, z), A = game.acts;
        const beats = k === 'wood' ? A.workBeats({ x: spot.x, z: spot.z, y: player.pos.y }, 'axe', 4.5, false)
          : k === 'water' ? [{ face: spot, t: 0.3 }, { t: 0.9, pose: 'crouch' }, { t: 2.2, start: (ctx) => A.hold(ctx, A.prop('bucket')), ik: (F, kk, ctx, P) => ctx.held && A.carry(P, F, ctx.held, false, 0.25, 0.5) }, { t: 0.4, pose: 'crouch', start: (ctx) => { ctx.held?.parent?.remove(ctx.held); ctx.held = null; } }]
          : A.workBeats({ x: spot.x, z: spot.z, y: player.pos.y }, 'hammer', 4.0, true);
        if (A.play(beats, { done: (ok) => ok && doneIt() })) return;
      }
      doneIt();
    });
  }

  // ---------------- bunks: a good night's sleep at the hideout
  const sleep0 = game.sleep;
  if (sleep0) game.sleep = (hours, where = '', now) => { const r = sleep0(hours, where, now); if (H.up.bunks && /bunkhouse|Gulf Line/i.test(where)) { player.health = player.maxHealth || 100; if (game.needs?.N) game.needs.N.energy = 100; hud.toast('Slept like a stone in a real bed.', 2.2); } return r; };

  // ---------------- raids
  let raid = null;
  function startRaid(R) {
    const a = rnd() * Math.PI * 2, x = G.HQ.x + Math.cos(a) * 45, z = G.HQ.z + Math.sin(a) * 45;
    const foes = [];
    for (let i = 0; i < 4; i++) { const p = game.peds.spawnAt(x + (rnd() - 0.5) * 8, z + (rnd() - 0.5) * 8, player.pos); if (p) { p.foe = true; p.role = 'foe'; p.hp = 110; foes.push(p); } }
    raid = { R, foes, t: 0 };
    say('Jayden', H.up.tower ? `${R.name}! Coming up from the road, four of them!` : `It's ${R.name}! Get down!`, 3);
    schedule(); // everyone but Rico and Big O takes cover in the bunkhouse
  }
  function endRaid(won) {
    const R = raid.R; raid = null; schedule(); raid = { R };
    if (won) { rep(20); allLoyalty(5); say('Rico', `That's what happens when ${raid.R.name} comes up my hill.`, 3); game.news?.(`Shots on the hill road: ${raid.R.name} raid on a rival hideout fails.`); }
    raid = null;
  }

  // ---------------- the day: payday, birthdays, heat, crew coming back, raids while you're away
  let rivalsSeen = Object.values(P.rivals || {}).reduce((a, b) => a + b, 0);
  let lastDay = sky.day, lastHourT = 0, fireT = 4, greetAway = 0, warnT = 0, briefT = 0;
  const schedule = () => {
    const h = sky.hour, night = h < 5.5 || h > 23;
    for (const m of G.crew) {
      const c = C(m.M.id), id = m.M.id;
      let away = !!(c.away || c.jail > now());
      if (!away && raid) { /* a raid wakes everyone, and nobody hides: the crew stands and fights (systems/defense.js) */ }
      else if (!away) {
        if (night) away = !['rico', 'big-o', 'jayden', 'marisol'].includes(id); // asleep; Big O and Jayden keep watch, Marisol's on call
        else if (h > 10 && h < 16) away = ['smoke', 'sofia', 'lalo'].includes(id) && (bday(id) + sky.day) % 3 !== 0; // out on errands
      }
      m.away = away;
      // hurt crew rest sitting down
      if (!away && c.hurt > now() && m.pose !== 'Sitting_Idle_Loop') { m.pose = 'Sitting_Idle_Loop'; m.h.play('Sitting_Idle_Loop', 0.3); }
    }
  };

  return {
    rank, mood, C, send, settle, startRaid, get raid() { return raid; }, jobs: JOBS, upgrades: UPGRADES, build,
    radioHere: () => !!H.up.radio && nearHQ(120),
    update(dt) {
      const t = now();
      // jobs end, the jailed come home sour
      for (const m of G.crew) {
        const c = C(m.M.id);
        if (c.away && t >= c.away.until) settle(m);
        if (c.jail && c.jail <= t) { c.jail = 0; addLoyalty(m.M.id, -12); text(first(m.M), 'Three days in a cell. Thanks for nothing.'); }
      }
      if ((lastHourT -= dt) <= 0) {
        lastHourT = 1; schedule();
        // running a gang off its turf gets around
        const rs = Object.values(P.rivals || {}).reduce((a, b) => a + b, 0);
        if (rs > rivalsSeen) { rep(15 * (rs - rivalsSeen)); rivalsSeen = rs; }
      }
      if (sky.day !== lastDay) {
        lastDay = sky.day;
        P.gangHeat = Math.max(0, P.gangHeat - 6);
        if (sky.day === P.payDue) text('Rico', `Payday. The crew's cut is ${money(pay())}. Come see me.`);
        if (sky.day > P.payDue + 1) { allLoyalty(-6); text('Rico', 'The crew wants their money, John. People are talking.'); }
        for (const m of G.crew) if (isBday(m.M.id)) text('Rico', `It's ${first(m.M)}'s birthday today. Bring something.`);
        for (const m of G.crew) { const c = C(m.M.id); if (c.loyalty < 15 && !c.away && rnd() < 0.3) { c.away = { job: 'sulk', until: t + 36 }; m.away = true; text('Rico', `${first(m.M)} took off. Said nobody here cares. Talk to them when they're back.`); } }
        if (H.repay) { S.money += H.repay; H.repay = 0; text('Crew', 'Paid you back, with interest. Told you.'); }
        // a gang you've run off its turf hits the hideout while you're gone
        const mad = RIVALS.filter((R) => (P.rivals?.[R.id] || 0) > 0 && (P.truce[R.id] || 0) <= sky.day);
        if (mad.length && !nearHQ(300) && rnd() < 0.18 / (H.up.lights ? 2 : 1)) {
          const R = mad[(rnd() * mad.length) | 0];
          if (H.up.gate) text('Rico', `${R.name} tried the gate last night. It held. Big O sends his regards.`);
          else { const loss = Math.round(H.stash * 0.15); H.stash -= loss; text('Rico', `${R.name} hit us last night. They got ${money(loss)} from the stash. Build a gate.`); }
        }
      }
      // ---- at the hideout
      if (!nearHQ(60) || S.indoors) { greetAway += dt; return ''; }
      if (greetAway > 300 && nearHQ(40)) { const m = available()[(rnd() * available().length) | 0]; if (m) say(first(m.M), ['John\'s back!', 'Look who it is.', 'Hey! You eat today?'][(rnd() * 3) | 0], 2.5); }
      greetAway = 0;
      // Rico's morning briefing, once a day
      if (P.hideout.brief !== sky.day && sky.hour > 6 && sky.hour < 11 && nearHQ(15) && (briefT += dt) > 2) { H.brief = sky.day; briefT = 0; say('Rico', `Morning. ${BRIEFS[(sky.day * 3) % BRIEFS.length]}`, 5); }
      // they notice when you're hurt, or bringing the police home
      if ((warnT -= dt) <= 0) {
        warnT = 25;
        if (player.health < 40) say('Marisol', 'Over here. Let me look at that before you fall down.', 3);
        else if (game.police?.wanted > 0) say('Jayden', H.up.tower ? 'Cop cars on the road! Don\'t lead them up here!' : 'Cops are looking for you. Don\'t bring them here!', 3);
      }
      // talk round the fire at night
      if (sky.night > 0.5 && nearHQ(18) && !raid && (fireT -= dt) <= 0) {
        fireT = 10 + rnd() * 6;
        const d = FIRE_TALK[(rnd() * FIRE_TALK.length) | 0];
        say(d[0], d[1], 3.5); setTimeout(() => say(d[2], d[3], 3.5), 3600);
      }
      for (const l of lights) l.intensity = sky.night > 0.3 ? 30 : 0;
      // raids: a gang you've hit comes for the hideout at night while you're there
      if (raid) {
        raid.t += dt;
        if (raid.foes.every((p) => p.mode === 'dead' || !game.peds.list.includes(p))) endRaid(true);
        else if (raid.t > 240) endRaid(false);
      } else if (sky.night > 0.6 && !game.missionActive?.() && game.police?.wanted === 0) {
        const mad = RIVALS.filter((R) => (P.rivals?.[R.id] || 0) > 0 && (P.truce[R.id] || 0) <= sky.day);
        if (mad.length && rnd() < dt * 0.0007 / (H.up.lights ? 2 : 1)) startRaid(mad[(rnd() * mad.length) | 0]);
      }
      return '';
    },
  };
}
