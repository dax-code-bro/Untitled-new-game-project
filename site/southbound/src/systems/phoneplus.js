// More on the phone:
//  - Battery: it runs down (faster with the screen or the light on) and charges in a vehicle or
//    indoors. Dead, it won't open.
//  - Light: no flashlight? L turns on the phone's own (dimmer, and it eats the battery).
//  - Bank: cash on you is what a mugger, an arrest or the hospital takes a cut of. Deposit and
//    withdraw at the ATM outside any Gulf Mart; check the balance anywhere. A little interest a day.
//  - News: the Calvera Courier writes up what happened (some of it you did).
//  - Messages: texts from people you've met, the bank, Runr and the radio station.
//  - Contacts: everyone you've stopped to talk to. Call them: they tell you where they are, if
//    they pick up (asleep, at work, gone...).
//  - Weather: today and what's coming in the next hours.
//  - Camera: take a photo (saved to your downloads), no HUD in the shot.
//  - Cab: a ride to any place in the Places list, paid by the mile; the clock moves on.
import * as THREE from 'three';
import { regionAt } from '../world/layout.js';
import { keyHint, money, nearestRoad } from './world-util.js';

export function installPhonePlus(game) {
  const { career, hud, S, player, scene, sky } = game;
  const P = career.p;
  const sys = game.phoneSys;
  if (!sys?.phone) return { update() {} };
  const phone = sys.phone, cfg = phone.cfg;
  P.phone = P.phone || { bat: 100 };
  P.bank = P.bank || 0; P.news = P.news || []; P.texts = P.texts || []; P.contacts = P.contacts || [];
  const now = () => ({ day: sky.day, hour: sky.hour });
  const clock = (h) => { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`; };
  const region = () => regionAt(player.pos.x, player.pos.z).name;

  // ---------------- news and texts (other systems call these too)
  game.news = (text) => { P.news.unshift({ ...now(), text }); P.news.length = Math.min(P.news.length, 40); };
  game.text = (from, body) => { P.texts.unshift({ ...now(), from, body, unread: true }); P.texts.length = Math.min(P.texts.length, 40); badge(); };
  game.addContact = (r, job) => { if (!P.contacts.some((c) => c.id === r.id)) { P.contacts.push({ id: r.id, name: game.population?.fullName(r) || 'Someone', job: job || r.job || '' }); if (Math.random() < 0.6) setTimeout(() => game.text(game.population?.fullName(r) || 'Someone', ['Good to meet you. Let me know if you need anything.', 'Hey, it\'s me from earlier. Saved your number.', 'Nice talking to you. Drop by sometime.'][r.id % 3]), 8000); } };
  // the police log makes the paper
  const crime0 = game.police.crime.bind(game.police);
  let lastStory = 0;
  game.police.crime = (kind) => {
    crime0(kind);
    const t = performance.now(); if (t - lastStory < 30000) return;
    const story = { robbery: `Armed robbery at a store in ${region()}. Police are looking for the gunman.`, copKill: `Officer killed in ${region()}. A manhunt is under way.`, kill: `A body was found in ${region()} today. Police ask witnesses to come forward.`, carjack: `Driver dragged from a car in ${region()}.`, poaching: `Game wardens report a poached animal in ${region()}.`, shots: `Residents of ${region()} report gunfire.` }[kind];
    if (story) { lastStory = t; game.news(story); }
  };
  const FILLER = ['Fuel up four cents a gallon across Calvera.', 'Mill Creek fish fry this Saturday: all welcome.', 'Port Calvera council votes to fix the harbor road (again).', 'Shrimp season opens early after a mild spring.', 'Bayou Verde ferry back in service after repairs.', 'Redgrass rodeo draws its biggest crowd in years.', 'Pinewood Hollow fire watch asks hikers to put campfires all the way out.', 'Gulf Mart opens a new store on the coast road.', 'Heat advisory for the plains this week: drink water.', 'Calvera River running high after the rain upstate.'];
  if (!P.news.length) for (let i = 0; i < 3; i++) game.news(FILLER[(Math.random() * FILLER.length) | 0]);

  // ---------------- the battery
  const bat = document.createElement('div');
  bat.style.cssText = 'position:fixed;right:16px;top:216px;z-index:20;font:600 11px Inter,system-ui,sans-serif;color:#f2ead8;text-shadow:0 1px 2px #000;pointer-events:none';
  document.body.appendChild(bat);
  let unread = 0;
  function badge() { unread = P.texts.filter((t) => t.unread).length; showBat(); }
  function showBat() {
    const b = Math.round(P.phone.bat), ch = charging();
    bat.textContent = `${ch ? '⚡' : b < 15 ? '🪫' : '🔋'} ${b}%${unread ? ` · ✉ ${unread}` : ''}`;
    bat.style.color = b < 15 && !ch ? '#ff9a6a' : '#f2ead8';
  }
  const charging = () => S.mode === 'car' || !!S.indoors;
  const show0 = phone.show.bind(phone);
  phone.show = (tab, ...rest) => {
    if (P.phone.bat <= 0) { hud.toast('Your phone is dead. Charge it in a car or indoors.', 2.4); return; }
    return show0(tab, ...rest);
  };

  // ---------------- the phone's own light (if you've no flashlight)
  const light = new THREE.SpotLight(0xf4f6ff, 0, 18, 0.6, 0.6, 1.6);
  scene.add(light, light.target);
  let lightOn = false;
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyL' || game.tools?.best('light') || phone.open) return;
    if (!lightOn && P.phone.bat <= 0) { hud.toast('Phone battery is dead', 1.5); return; }
    lightOn = !lightOn; hud.toast(lightOn ? 'Phone light on (L)' : 'Phone light off', 1);
  });

  // ---------------- ATMs outside every Gulf Mart
  const atms = [];
  const atmMat = { body: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5, metalness: 0.6 }), face: new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.4 }), screen: new THREE.MeshStandardMaterial({ color: 0x0c2a44, emissive: 0x2a7fd0, emissiveIntensity: 0.9, roughness: 0.2 }), sign: new THREE.MeshStandardMaterial({ color: 0x1e6fb8, emissive: 0x1e6fb8, emissiveIntensity: 0.5, roughness: 0.5 }) };
  const buildAtm = () => {
    const g = new THREE.Group();
    const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
    add(new THREE.BoxGeometry(0.78, 1.62, 0.62), atmMat.body, 0, 0.81, 0);
    add(new THREE.BoxGeometry(0.62, 0.42, 0.04), atmMat.face, 0, 1.18, 0.31, -0.18);
    add(new THREE.BoxGeometry(0.5, 0.32, 0.02), atmMat.screen, 0, 1.19, 0.335, -0.18);
    add(new THREE.BoxGeometry(0.34, 0.06, 0.24), atmMat.face, 0, 0.9, 0.38);
    add(new THREE.BoxGeometry(0.26, 0.02, 0.03), atmMat.face, 0, 0.75, 0.32);
    add(new THREE.BoxGeometry(0.78, 0.2, 0.64), atmMat.sign, 0, 1.72, 0);
    return g;
  };
  const placeAtms = () => {
    // each Gulf Mart is its own little building (systems/gunstores.js buildShop: 10 x 9 m, the counter
    // 0.9 m behind its middle, the door in the front wall): the ATM stands against the front wall,
    // beside the door, facing the street
    for (const m of (game.shopSpots || []).filter((s) => s.kind === 'mart')) {
      const a = m.face || 0, sn = Math.sin(a), cs = Math.cos(a);
      const cx = m.x + 0.9 * sn, cz = m.z + 0.9 * cs; // the building's middle
      const L = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
      const [x, z] = L(2.8, 4.5 + 0.36);
      const g = buildAtm();
      g.position.set(x, game.collision.surface(x, z, game.hm.height(x, z) + 3), z);
      g.rotation.y = a;
      scene.add(g);
      game.collision.addBox?.(x - 0.45, z - 0.45, x + 0.45, z + 0.45, g.position.y, g.position.y + 1.8, null); // you can't walk through it
      const [ux, uz] = L(2.8, 4.5 + 1.3);
      const at = { x: ux, z: uz, g };
      atms.push(at);
      game.interact.add({ x: at.x, z: at.z, r: 1.6, label: () => `${keyHint(game)} use the ATM`, color: 0x2a7fd0, blip: { color: '#2a7fd0', size: 3, icon: '🏧' }, show: () => S.mode === 'foot' && !S.indoors, use: () => {
        const open = () => { atAtm = true; show0('bank'); };
        if (!game.acts || S.doorWalk) return open();
        // (A2) the card in, a few keys, the screen
        const A = game.acts, card = A.prop('card'), slot = new (game.player.pos.constructor)(at.g.position.x, at.g.position.y + 1.15, at.g.position.z);
        const run = A.play([{ face: slot, t: 0.3 }, { t: 0.7, start: (ctx) => A.hold(ctx, card), ik: (F, k, ctx, P) => { P.reach(P.R, F.chest.clone().addScaledVector(F.fw, 0.3).lerp(slot, Math.min(1, k * 1.4)), F, 'R'); P.attachToHand(card, P.R); } },
          { t: 0.8, start: (ctx) => { card.parent?.remove(card); ctx.held = null; }, ik: (F, k, ctx, P) => { P.reach(P.R, slot.clone().addScaledVector(F.up, -0.12).addScaledVector(F.right, Math.sin(k * 20) * 0.03), F, 'R'); } }], { done: open });
        if (!run) open();
      } }); // the machine works whatever your battery says
    }
  };
  let atAtm = false;
  const nearAtm = () => atms.some((a) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) < 3);

  // ---------------- weather forecast
  const forecast = () => {
    const W = game.weather, n = W?.upcoming, h = (sky.hour + (W?.nextChange || 0)) % 24;
    const word = { clear: 'Clear and sunny', cloudy: 'Partly cloudy', overcast: 'Overcast', rain: 'Rain', storm: 'Thunderstorms' };
    return [{ k: 'now', name: `Now: ${word[W?.kind] || 'Fair'}`, sub: `${region()} · wind ${Math.round(game.hunting?.wind?.kmh || 8)} km/h` },
      ...(n ? [{ k: 'next', name: `From about ${clock(h)}: ${word[n] || n}`, sub: n === 'storm' ? 'Lightning likely. Stay off the water.' : n === 'rain' ? 'Roads will be slick.' : n === 'clear' ? 'Clearing up.' : 'No rain expected.' }] : [])];
  };

  // ---------------- camera
  let photoN = 0;
  const takePhoto = () => {
    phone.close?.();
    setTimeout(() => {
      const hid = [...document.querySelectorAll('#hud, .toast, #toast, #sbneeds, #sbwind, .sbPhoneBtn')].map((e) => [e, e.style.visibility]);
      hid.forEach(([e]) => (e.style.visibility = 'hidden')); bat.style.visibility = 'hidden';
      try {
        window.SB?.renderNow?.();
        const url = (window.SB?.renderer?.domElement || document.querySelector('canvas'))?.toDataURL('image/png');
        if (url) { const a = document.createElement('a'); a.href = url; a.download = `southbound-photo-${++photoN}.png`; a.click(); P.stats.photos = (P.stats.photos || 0) + 1; }
      } catch (e) { /* the browser refused: never mind */ }
      hid.forEach(([e, v]) => (e.style.visibility = v)); bat.style.visibility = '';
      hud.toast('📸 Saved to your downloads', 1.6);
    }, 120);
  };

  // ---------------- cab
  const cab = (pl) => {
    const d = Math.hypot(pl.x - player.pos.x, pl.z - player.pos.z), mi = d / 1609, fare = Math.round(4 + mi * 2.6);
    return { d, mi, fare };
  };
  let ride = null;
  const callCab = (pl) => {
    const f = cab(pl);
    if (S.mode !== 'foot' || S.indoors) { hud.toast('Step outside to be picked up.', 1.8); return; }
    if (game.police?.wanted > 0) { hud.toast('Cab: "Not with the cops after you, friend."', 2); return; }
    if (!career.spend(f.fare)) return;
    phone.close?.();
    ride = { pl, t: 6 + Math.random() * 6, f };
    hud.toast(`Cab on its way to you (${money(f.fare)}). Wait here.`, 2.5);
  };
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;background:#000;opacity:0;transition:opacity .6s';
  document.body.appendChild(veil);

  // ---------------- contacts: call someone
  const call = (c) => {
    const pop = game.population, r = pop?.town?.residents?.find((x) => x.id === c.id) || null;
    if (!r || !r.alive) { hud.toast(`${c.name}: "The number you have dialled is no longer in service."`, 3); return; }
    const st = pop.whereIs ? pop.whereIs(r) : null, act = st?.act || 'home';
    const line = act === 'asleep' ? null : { work: `"I'm at work, can't talk long."`, commute: '"On my way somewhere, what\'s up?"', lunch: '"Grabbing lunch. What do you need?"', 'at the bar': '"I\'m at the bar! Come by."', 'outside the bar': '"Outside the bar, getting some air."', "at a friend's": '"I\'m over at a friend\'s place."', 'evening walk': '"Just out walking. Nice evening."', 'heading home': '"Heading home now."', 'going out': '"Going out for a drink, want to come?"', errand: '"Running errands. Call you back?"', home: '"Just at home. What\'s going on?"' }[act] || '"Hey. What\'s up?"';
    hud.toast(line ? `${c.name}: ${line}` : `${c.name} doesn't pick up.`, 3);
  };

  // ---------------- the new tabs
  cfg.tabs.splice(cfg.tabs.findIndex((t) => t.k === 'apps'), 0, { k: 'texts', label: 'Messages' }, { k: 'contacts', label: 'Contacts' }, { k: 'bank', label: 'Bank' }, { k: 'news', label: 'News' }, { k: 'weather', label: 'Weather' }, { k: 'cab', label: 'Cab' }, { k: 'camera', label: 'Camera' });
  const items0 = cfg.items, row0 = cfg.row, act0 = cfg.act, note0 = cfg.note;
  cfg.note = (t) => ({
    texts: `${P.texts.length} messages${unread ? `, ${unread} new` : ''}.`,
    contacts: P.contacts.length ? 'People you\'ve stopped to talk to. Call one.' : 'Stop and talk to people (F) and they\'ll give you their number.',
    bank: `On you: ${money(S.money)} · In the bank: ${money(P.bank)}. ${nearAtm() || atAtm ? 'At the ATM.' : 'Deposits and withdrawals at any Gulf Mart ATM.'}`,
    news: 'The Calvera Courier',
    weather: `${clock(sky.hour)}, day ${sky.day}`,
    cab: 'Calvera Cabs: $4 + $2.60 a mile. Pick a place.',
    camera: 'Takes a picture of what you see (no HUD). Saved as a PNG.',
  })[t] ?? note0(t);
  cfg.items = (t) => {
    if (t === 'texts') { const list = P.texts.map((x) => x); P.texts.forEach((x) => (x.unread = false)); setTimeout(badge, 0); return list; }
    if (t === 'contacts') return P.contacts;
    if (t === 'bank') return [{ k: 'dep', n: 100 }, { k: 'dep', n: 1000 }, { k: 'depAll' }, { k: 'wd', n: 100 }, { k: 'wd', n: 1000 }];
    if (t === 'news') return P.news;
    if (t === 'weather') return forecast();
    if (t === 'cab') return [...(game.places || [])].sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) - Math.hypot(b.x - player.pos.x, b.z - player.pos.z)).slice(0, 40);
    if (t === 'camera') return [{ k: 'photo' }];
    return items0(t);
  };
  cfg.row = (it, t) => {
    if (t === 'texts') return { name: `${it.unread ? '● ' : ''}${it.from}`, sub: `${it.body} · day ${it.day}, ${clock(it.hour)}`, stats: [], btn: '·', cls: 'dis' };
    if (t === 'contacts') return { name: it.name, sub: it.job || '', stats: [], btn: 'Call' };
    if (t === 'bank') {
      const can = nearAtm() || atAtm;
      if (it.k === 'depAll') return { name: 'Deposit everything', sub: money(S.money), stats: [], btn: can ? 'Deposit' : 'ATM only', cls: can ? '' : 'dis' };
      return { name: `${it.k === 'dep' ? 'Deposit' : 'Withdraw'} ${money(it.n)}`, sub: it.k === 'dep' ? 'Cash into your account' : 'Cash from your account', stats: [], btn: can ? 'OK' : 'ATM only', cls: can ? '' : 'dis' };
    }
    if (t === 'news') return { name: it.text, sub: `Day ${it.day}`, stats: [], btn: '·', cls: 'dis' };
    if (t === 'weather') return { name: it.name, sub: it.sub, stats: [], btn: '·', cls: 'dis' };
    if (t === 'cab') { const f = cab(it); return { name: `${it.icon || ''} ${it.name}`, sub: `${f.mi.toFixed(1)} mi`, stats: [], btn: money(f.fare) }; }
    if (t === 'camera') return { name: 'Take a photo', sub: `${P.stats.photos || 0} taken`, stats: [], btn: '📸' };
    return row0(it, t);
  };
  cfg.act = (it, t) => {
    if (t === 'contacts') return call(it);
    if (t === 'bank') {
      if (!(nearAtm() || atAtm)) { hud.toast('Find an ATM (outside any Gulf Mart).', 1.8); return; }
      const n = it.k === 'depAll' ? S.money : it.n;
      if (it.k !== 'wd') { const m = Math.min(n, S.money); if (m <= 0) return; S.money -= m; P.bank += m; hud.toast(`Deposited ${money(m)}`, 1.4); }
      else { const m = Math.min(n, P.bank); if (m <= 0) { hud.toast('Insufficient funds', 1.4); return; } P.bank -= m; S.money += m; hud.toast(`Withdrew ${money(m)}`, 1.4); }
      career.saveSoon(); return;
    }
    if (t === 'cab') return callCab(it);
    if (t === 'camera') return takePhoto();
    if (['texts', 'news', 'weather'].includes(t)) return;
    return act0(it, t);
  };

  let lastDay = sky.day, placed = false;
  return {
    atms, forecast, call, cab, get ride() { return ride; }, takePhoto,
    update(dt) {
      if (!placed && game.shopSpots) { placed = true; placeAtms(); }
      if (!phone.open) atAtm = false;
      // battery
      const drain = 0.05 + (phone.open && !atAtm ? 0.3 : 0) + (lightOn ? 0.25 : 0);
      P.phone.bat = Math.max(0, Math.min(100, P.phone.bat + (charging() ? 0.6 : -drain) * dt));
      if (P.phone.bat <= 0 && lightOn) { lightOn = false; hud.toast('Phone battery died', 1.6); }
      if (P.phone.bat <= 0 && phone.open && !atAtm) phone.close?.();
      showBat();
      const on = lightOn && S.mode === 'foot' && !game.tools?.best('light');
      light.intensity = on ? 14 : 0;
      if (on) { const f = player.heading; light.position.set(player.pos.x + Math.sin(f) * 0.3, player.pos.y + 1.3, player.pos.z + Math.cos(f) * 0.3); light.target.position.set(player.pos.x + Math.sin(f) * 8, player.pos.y, player.pos.z + Math.cos(f) * 8); }
      // a new day: interest, a paper
      if (sky.day !== lastDay) {
        lastDay = sky.day;
        if (P.bank > 0) { const i = Math.round(P.bank * 0.005); if (i > 0) { P.bank += i; game.text('Gulf Coast Bank', `Interest paid: ${money(i)}. Balance ${money(P.bank)}.`); } }
        game.news(FILLER[(Math.random() * FILLER.length) | 0]);
      }
      // the cab: wait, fade, arrive, the clock has moved on
      if (ride) {
        if (S.mode !== 'foot' || game.police?.wanted > 0) { hud.toast('Cab: "Forget it." (no refund)', 2); ride = null; }
        else if ((ride.t -= dt) <= 0 && !ride.go) {
          ride.go = 1.2; veil.style.opacity = '1'; hud.toast('Your cab is here.', 1.4);
        } else if (ride.go && (ride.go -= dt) <= 0) {
          // dropped at the kerb nearest the place, facing it
          const pl = ride.pl, r = nearestRoad(game.graph, pl.x, pl.z);
          let kerb = { x: pl.x + 3, z: pl.z + 3 };
          if (r && r.dist < 150) { const k = Math.min(r.dist, (r.edge?.width || 8) / 2 + 1.5) / (r.dist || 1); kerb = { x: r.x + (pl.x - r.x) * k, z: r.z + (pl.z - r.z) * k }; } // the pavement on the place's side
          game.teleport(kerb.x, kerb.z, Math.atan2(pl.x - kerb.x, pl.z - kerb.z));
          sky.hour = (sky.hour + 0.1 + ride.f.mi * 0.035) % 24;
          veil.style.opacity = '0'; hud.toast(`Dropped off at ${pl.name}.`, 2);
          ride = null;
        }
      }
      return '';
    },
  };
}
