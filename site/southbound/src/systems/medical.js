// Armour and medical, batch one (F14):
//  - Wounds left untreated get infected (a fever: tired, shaky, slowly losing health); dressings,
//    gauze, an IFAK or a trauma bag keep a wound clean; antibiotics (hospital pharmacy) cure it
//  - Painkillers: a warning as they wear off; too many in a few hours and you go woozy
//  - A plate that stops a round still knocks the wind out of you; helmets wear out and crack
//    (armory.js), and a round stopped by the helmet rings your head
//  - The weight of a plate carrier: a slower sprint, and it's hot work at midday
//  - Concussion from a hard crash: blurred, swimming vision and an unsteady aim for a while
//  - Bleeding out: the world goes grey and dark as you lose blood
//  - Falls hurt; a long one can break a leg (splint it)
//  - Cottonmouths in the bayou at dusk: a bite that needs antivenom at the hospital
//  - Animal bites can get infected, and want rabies shots
//  - Healing: fed and rested, you slowly heal back up on your own; sleep heals more
//  - The hospital and the Mill Creek clinic: treatment billed by what's wrong, and a pharmacy
//  - A first-aid cabinet at the hideout: two fresh bandages a day
//  - Healed wounds leave scars; the phone's Health tab shows all of it, with your record
import { regionAt } from '../world/layout.js';
import { keyHint } from './world-util.js';
import { gearById } from '../entities/gear.js';

export function installMedical(game) {
  let api = null;
  return { get api() { return api; }, update(dt, a, free) { if (!api && game.armorHit && game.medInventory && game.needs && game.openDialog) api = hook(game); return api ? api.update(dt, a, free) : ''; } };
}

function hook(game) {
  const { career, hud, S, player, sky, interact } = game;
  const P = career.p, W = S.wounds;
  const M = P.medx = P.medx || { inf: 0, woundAt: null, clean: false, abx: 0, abxUntil: 0, pills: [], venom: 0, venomSlow: false, conc: 0, winded: 0, broken: false, rabiesBy: 0, cabinetDay: -1 };
  for (const k of ['shot', 'platesStopped', 'treated', 'infections', 'snakebites', 'hospital', 'scars', 'falls', 'concussions']) P.stats[k] = P.stats[k] || 0;
  const clock = () => sky.day * 24 + sky.hour;
  const N = () => game.needs.N;
  const canvas = document.getElementById('game') || document.querySelector('canvas');

  // ---- getting shot: count it; a stopped round still winds you; a helmet stop rings your head
  const hit0 = game.armorHit;
  game.armorHit = (amount, from, pen = 2) => { const r = hit0(amount, from, pen); if (amount > 0 && pen > 0) { P.stats.shot++; career.saveSoon(); } return r; };
  game.onPlateStop = () => { P.stats.platesStopped++; M.winded = Math.max(M.winded, 18); hud.toast('It knocks the wind out of you.', 1.6); };
  game.onHelmetStop = () => { M.conc = Math.max(M.conc, 25); };

  // ---- what you used (H, or the phone): watch the counts go down, so every way of treating counts
  let lastMed = { ...P.med };
  const usedNow = () => {
    for (const id of Object.keys(lastMed)) {
      if ((P.med[id] || 0) >= (lastMed[id] || 0)) continue;
      P.stats.treated++;
      if (['dressing', 'gauze', 'ifak', 'trauma'].includes(id)) M.clean = true;
      if (id === 'splint' || id === 'ifak' || id === 'trauma') M.broken = false;
      if (id === 'ifak' && M.venom > 0) { M.venomSlow = true; hud.toast('The pressure bandage slows the venom. Get to a hospital.', 2.6); }
      if (id === 'trauma' && M.venom > 0) { M.venomSlow = true; M.venom = Math.max(0.2, M.venom - 0.4); }
      if (id === 'painkillers') {
        const now = clock(); M.pills = M.pills.filter((t) => now - t < 6); M.pills.push(now);
        if (M.pills.length === 3) hud.toast('That\'s a lot of painkillers. You feel woozy.', 2.4);
        if (M.pills.length >= 4) { player.health = Math.max(1, player.health - 12); hud.toast('Too many. Your stomach turns and the room spins.', 2.6); }
      }
    }
    lastMed = { ...P.med };
  };

  // ---- antibiotics: from the pharmacy, taken from the phone (Inventory or Health)
  const takeAbx = () => {
    if (!M.abx) { hud.toast('No antibiotics. The hospital pharmacy sells them.', 2); return; }
    M.abx--; M.abxUntil = clock() + 12; M.inf = Math.max(0, M.inf - 0.5); M.clean = true;
    hud.toast(M.inf > 0 ? 'Antibiotics. Keep taking them.' : 'Antibiotics. The fever\'s breaking.', 2); career.saveSoon();
  };
  const food0 = game.foodInventory;
  game.foodInventory = () => [...(M.abx ? [{ food: true, name: 'Antibiotics', sub: `× ${M.abx} · Clears an infected wound (a course: one every 12 hours)`, eat: takeAbx }] : []), ...(food0?.() || [])];

  // ---- doctors: the hospital and the clinic. A bill by what's wrong; a pharmacy
  const problems = () => {
    const out = [];
    if (W.bleed) out.push(['bleeding', 60 * W.bleed]);
    if (W.leg) out.push([M.broken ? 'broken leg' : 'leg wound', M.broken ? 260 : 140]);
    if (W.arm) out.push(['arm wound', 120]);
    if (M.inf > 0) out.push(['infection', 120]);
    if (M.venom > 0) out.push(['antivenom', 340]);
    if (M.conc > 0) out.push(['concussion check', 80]);
    if (M.rabiesBy) out.push(['rabies shots', 180]);
    if (player.health < 100) out.push(['stitches and fluids', Math.round((100 - player.health) * 1.2)]);
    return out;
  };
  const treatAll = (where) => {
    const pr = problems(), cost = pr.reduce((a, [, c]) => a + c, 0);
    if (!pr.length) { hud.toast('The doctor looks you over. "You\'re fine. Go home."', 2.4); return; }
    if (!career.spend(cost)) { hud.toast(`That comes to $${cost}. You don't have it.`, 2.4); return; }
    const fix = () => {
      W.bleed = 0; W.leg = 0; W.arm = 0; W.numb = 0; player.health = 100;
      if (M.woundAt != null) { P.stats.scars++; M.woundAt = null; }
      M.inf = 0; M.venom = 0; M.venomSlow = false; M.conc = 0; M.broken = false; M.rabiesBy = 0; M.clean = false;
      sky.hour += 2; if (sky.hour >= 24) { sky.hour -= 24; sky.day++; }
      P.stats.hospital++; career.saveSoon();
      hud.toast(`${where}: ${pr.map(([n]) => n).join(', ')}. Billed $${cost}. Two hours later you walk out patched up.`, 3.6);
    };
    // (A2) up on the exam table while they work on you; the two hours go by in the dark
    if (game.acts && S.mode === 'foot' && !S.doorWalk) {
      const run = game.acts.play([{ t: 1.2, pose: 'sit' }, { t: 2.2, pose: 'sit', start: () => game.acts.fade(true, 'TREATMENT', where) }], { done: () => { fix(); setTimeout(() => game.acts.fade(false), 400); } });
      if (run) return;
    }
    fix();
  };
  const pharmacy = [['Antibiotics', 45, () => { M.abx = Math.min(6, M.abx + 1); }], ['Painkillers', 9, () => { P.med.painkillers = Math.min(6, (P.med.painkillers || 0) + 1); lastMed.painkillers = P.med.painkillers; }], ['Bandage roll', 12, () => { P.med.bandage = Math.min(10, (P.med.bandage || 0) + 1); lastMed.bandage = P.med.bandage; }]];
  for (const [id, where] of [['hospital', 'Port Calvera Medical Center'], ['clinic', 'Mill Creek Clinic']]) {
    const c = game.civic?.[id]; if (!c?.counter) continue;
    interact.add({ x: c.counter.x, z: c.counter.z, y: c.counter.y, r: 2.4, marker: false, show: () => S.mode === 'foot', label: () => `${keyHint(game)} see a doctor`,
      use: () => {
        const pr = problems(), cost = pr.reduce((a, [, c2]) => a + c2, 0);
        game.openDialog(where, pr.length ? `"Let's have a look at you." (${pr.map(([n]) => n).join(', ')})` : '"What can we do for you?"', [
          ...(pr.length ? [[`Get treated · $${cost}`, () => treatAll(where)]] : []),
          ...pharmacy.map(([n, price, fn]) => [`Pharmacy: ${n} · $${price}`, () => { if (career.spend(price)) { fn(); hud.toast(`Bought: ${n}`, 1.4); career.saveSoon(); } }]),
          ['Never mind.', () => {}],
        ]);
      } });
  }

  // ---- the first-aid cabinet at the hideout
  if (game.gang?.local) {
    const p = game.gang.local(-4, 9.5);
    interact.add({ x: p.x, z: p.z, r: 1.6, color: 0xd04040, show: () => S.mode === 'foot', label: () => `${keyHint(game)} first-aid cabinet${M.cabinetDay === sky.day ? ' (empty till tomorrow)' : ''}`,
      use: () => {
        if (M.cabinetDay === sky.day) { hud.toast('Empty. Someone restocks it every morning.', 1.8); return; }
        const got = () => { M.cabinetDay = sky.day; P.med.bandage = Math.min(10, (P.med.bandage || 0) + 2); lastMed.bandage = P.med.bandage; hud.toast('Two bandage rolls from the cabinet.', 1.8); career.saveSoon(); };
        const A = game.acts;
        if (A && !S.doorWalk) { // (A2) a hand into the cabinet, the rolls out
          const at = new (player.pos.constructor)(p.x, player.pos.y + 1.35, p.z), roll = A.prop('bandage'), chest = (F) => F.chest.clone().addScaledVector(F.fw, 0.3);
          if (A.play([{ face: at, t: 0.3 }, { t: 0.55, ik: (F, k, ctx, P) => P.reach(P.R, chest(F).lerp(at, k * 0.85), F, 'R') },
            { t: 0.65, start: (ctx) => A.hold(ctx, roll), ik: (F, k, ctx, P) => { P.reach(P.R, at.clone().lerp(chest(F), k), F, 'R'); P.attachToHand(roll, P.R); } },
            { t: 0.01, start: (ctx) => { roll.parent?.remove(roll); ctx.held = null; } }], { done: got })) return;
        }
        got();
      } });
  }

  // ---- animal bites: infected wounds, and rabies shots
  const hunt = game.hunting?.hunt;
  if (hunt?.bite) {
    const bite0 = hunt.bite.bind(hunt);
    hunt.bite = (dmg) => {
      bite0(dmg);
      if (S.mode !== 'foot') return;
      W.bleed = Math.max(W.bleed, 1); if (M.woundAt == null) { M.woundAt = clock(); M.clean = false; }
      if (!M.rabiesBy) { M.rabiesBy = clock() + 72; hud.toast('That bite wants a doctor: rabies shots, within three days.', 3); }
    };
  }

  // ---- the phone: a Health tab
  const ph = game.phoneSys?.phone;
  if (ph) {
    const cfg = ph.cfg;
    cfg.tabs.splice(cfg.tabs.findIndex((t) => t.k === 'apps'), 0, { k: 'health', label: 'Health' });
    const items0 = cfg.items, row0 = cfg.row, act0 = cfg.act, note0 = cfg.note;
    cfg.note = (t) => t === 'health' ? 'H treats what\'s most urgent with what you carry. Doctors: Port Calvera Medical Center and the Mill Creek Clinic.' : note0(t);
    cfg.items = (t) => {
      if (t !== 'health') return items0(t);
      const a = gearById('armor', P.gear.armor), hm = gearById('helmet', P.gear.helmet), st = P.stats;
      const pct = (v) => `${Math.round(v * 100)}%`;
      return [
        { k: 'hp', name: `Health ${Math.round(player.health)}`, sub: [W.bleed ? `bleeding${W.bleed > 1 ? ' heavily' : ''}` : '', W.leg ? (M.broken ? 'broken leg' : 'leg wound') : '', W.arm ? 'arm wound' : ''].filter(Boolean).join(', ') || 'no wounds' },
        { k: 'inf', name: M.inf > 0 ? `Infection ${pct(M.inf)}` : 'No infection', sub: M.woundAt != null && !M.clean ? 'An open wound: dress it before it turns' : M.abxUntil > clock() ? 'On antibiotics' : '' },
        ...(M.venom > 0 ? [{ k: 'ven', name: 'Snake venom', sub: M.venomSlow ? 'Slowed. Antivenom at the hospital.' : 'Spreading. Antivenom at the hospital, now.' }] : []),
        ...(M.conc > 0 ? [{ k: 'conc', name: 'Concussion', sub: 'Blurred vision; it passes' }] : []),
        ...(M.rabiesBy ? [{ k: 'rab', name: 'Bitten', sub: `Rabies shots due within ${Math.max(0, Math.round(M.rabiesBy - clock()))} h` }] : []),
        { k: 'abx', name: `Antibiotics × ${M.abx}`, sub: 'One every 12 hours clears an infection', btn: M.abx ? 'Take' : '' },
        { k: 'arm', name: a ? a.name : 'No body armour', sub: a ? `${a.level ? `plates ${pct(P.plateCond ?? 1)} · ` : ''}${a.weight} kg` : 'Armour stores in Port Calvera and Mill Creek' },
        { k: 'hel', name: hm ? hm.name : 'No helmet', sub: hm ? `condition ${pct(P.helmCond ?? 1)}` : '' },
        { k: 'rec', name: 'Your record', sub: `shot ${st.shot}× · plates stopped ${st.platesStopped} · treated ${st.treated} · scars ${st.scars} · hospital ${st.hospital} · snakebites ${st.snakebites}` },
      ];
    };
    cfg.row = (it, t) => t === 'health' ? { name: it.name, sub: it.sub, stats: [], btn: it.btn || '·', cls: it.btn ? '' : 'dis' } : row0(it, t);
    cfg.act = (it, t) => { if (t !== 'health') return act0(it, t); if (it.k === 'abx') takeAbx(); };
  }

  game.medChips = () => {
    const out = [];
    if (M.inf > 0.15) out.push(['#7a5a1d', `Infected wound${M.inf > 0.6 ? ' · fever' : ''}`]);
    if (M.venom > 0) out.push(['#5a1d5a', 'Snake venom · hospital']);
    if (M.conc > 0) out.push(['#3a4a6a', 'Concussed']);
    if (M.winded > 0) out.push(['#3a4a6a', 'Winded']);
    if (M.pills.length >= 3 && clock() - M.pills[M.pills.length - 1] < 2) out.push(['#4a3a6a', 'Woozy']);
    if (M.broken && W.leg) out.push(['#9a5a22', 'Broken leg · splint it']);
    return out;
  };

  const lastPos = { x: player.pos.x, z: player.pos.z };
  let lastClock = clock(), wasHurt = !!(W.leg || W.arm || W.bleed), airTop = -1e9, wasAir = false, snakeT = 0, numbWas = 0, filterKey = '', crashLatch = false;
  return {
    M, takeAbx, problems, treatAll,
    update(dt) {
      if ((S.frozen && !S.stepping) || S.paused) return '';
      const now = clock(); let gh = now - lastClock; lastClock = now; if (gh < 0 || gh > 48) gh = 0;
      usedNow();
      const hurt = !!(W.leg || W.arm || W.bleed);
      if (S.dead > 0) { M.inf = 0; M.venom = 0; M.conc = 0; M.winded = 0; M.broken = false; M.woundAt = null; }

      // ---- wounds: open from when you were hit; closed ones leave a scar; dirty ones get infected
      if (hurt && M.woundAt == null) { M.woundAt = now; M.clean = false; }
      if (!hurt && wasHurt && M.woundAt != null) { P.stats.scars++; M.woundAt = null; M.clean = false; }
      wasHurt = hurt;
      if (M.woundAt != null && !M.clean && now - M.woundAt > 10 && M.inf === 0 && M.abxUntil < now) { M.inf = 0.1; P.stats.infections++; hud.toast('The wound\'s gone hot and red. It\'s infected.', 2.8); }
      if (M.inf > 0) {
        M.inf = M.abxUntil > now ? Math.max(0, M.inf - gh * 0.08) : Math.min(1, M.inf + gh * 0.04);
        N().energy = Math.max(0, N().energy - gh * 3 * M.inf);
        player.health -= dt * 0.04 * M.inf;
      }
      if (M.rabiesBy && now > M.rabiesBy) { M.rabiesBy = 0; M.inf = Math.max(M.inf, 0.6); hud.toast('You never got those rabies shots. You\'re burning up.', 3); }

      // ---- painkillers wearing off
      if (numbWas > 10 && W.numb <= 10 && W.numb > 0 && (W.leg || W.arm)) hud.toast('The painkillers are wearing off.', 2);
      numbWas = W.numb || 0;
      const woozy = M.pills.length >= 3 && now - M.pills[M.pills.length - 1] < 2;

      // ---- winded, concussed
      if (M.winded > 0) M.winded -= dt;
      if (M.conc > 0) M.conc -= dt;

      // ---- the weight and heat of armour
      const a = gearById('armor', P.gear.armor);
      S.loadK = a && S.mode === 'foot' ? 1 - Math.min(0.15, (a.weight || 0) * 0.014) : 1;
      if (a && a.weight > 3 && S.mode === 'foot' && !S.indoors && sky.hour > 11 && sky.hour < 16 && game.weather?.kind === 'clear') N().energy = Math.max(0, N().energy - gh * a.weight * 0.35);

      S.noSprint = M.winded > 0 || M.conc > 8;
      S.medSpread = (M.winded > 0 ? 1.25 : 1) * (M.conc > 0 ? 1.35 : 1) * (woozy ? 1.3 : 1) * (1 + M.inf * 0.35);

      // ---- falls
      // (a teleport, a respawn or getting out of a car moves you sideways in one frame: not a fall)
      const jump = Math.hypot(player.pos.x - lastPos.x, player.pos.z - lastPos.z) > 15; lastPos.x = player.pos.x; lastPos.z = player.pos.z;
      // (measured by the height you dropped, not the speed: the game's gravity is a little stronger
      // than the real thing. Two storeys stings, four can break a leg)
      if (jump) { wasAir = false; airTop = -1e9; }
      else if (S.mode === 'foot' && !player.swimming && !player.h?.ragdoll && S.dead <= 0) {
        if (!player.grounded) { airTop = Math.max(airTop, player.pos.y); wasAir = true; }
        else if (wasAir) {
          wasAir = false; const h = airTop - player.pos.y; airTop = -1e9;
          if (h > 5) {
            player.health -= (h - 5) * 6; S.dmgFlash = 1; P.stats.falls++;
            if (h > 9 && Math.random() < 0.75) { W.leg = 1; M.broken = true; hud.toast('You land badly. Your leg\'s broken: splint it.', 2.8); } else hud.toast('That hurt.', 1.2);
          }
        }
      } else { wasAir = false; airTop = -1e9; }

      // ---- a hard crash
      const v = S.mode === 'car' ? S.vehicle : null;
      if (v && !v.isBoat && (v.impact || 0) > 13 && !crashLatch) {
        crashLatch = true;
        player.health -= (v.impact - 13) * 2.5; S.dmgFlash = 1;
        if (v.impact > 16 || Math.random() < 0.4) { M.conc = Math.max(M.conc, 40 + (v.impact - 13) * 4); P.stats.concussions++; hud.toast('Your head hits the frame. Everything swims.', 2.4); }
      }
      if (!v || (v.impact || 0) < 3) crashLatch = false;

      // ---- cottonmouths in the bayou, mostly at dusk and after dark
      if (S.mode === 'foot' && !S.indoors && (player.speed || 0) > 0.5 && (snakeT -= dt) <= 0) {
        snakeT = 1;
        const dusk = sky.hour < 7 || sky.hour > 18;
        if (M.venom <= 0 && regionAt(player.pos.x, player.pos.z).name === 'Bayou Verde' && Math.random() < (dusk ? 1 / 700 : 1 / 2600)) {
          M.venom = 1; M.venomSlow = false; W.leg = 1; P.stats.snakebites++;
          hud.toast('Something strikes at your ankle. A cottonmouth! You need antivenom: get to the hospital.', 3.4);
        }
      }
      if (M.venom > 0) player.health -= dt * (M.venomSlow ? 0.035 : 0.12);

      // ---- healing on your own: slowly when fed and rested, more over a long rest or a night's sleep
      if (!W.bleed && M.venom <= 0 && M.inf < 0.3 && S.dead <= 0 && N().food > 30 && N().energy > 20) {
        if (player.health < 75) player.health = Math.min(75, player.health + dt * 0.06);
        if (gh > 1) player.health = Math.min(100, player.health + gh * 5);
      }
      if (player.health < 0) player.health = 0;

      // ---- what you see: blur when concussed, grey and dark when you've lost a lot of blood
      const blur = M.conc > 0 ? Math.min(2.2, M.conc / 15) : 0, lost = player.health < 40 ? (40 - player.health) / 40 : 0;
      const key = `${blur.toFixed(1)}|${lost.toFixed(2)}|${woozy}`;
      if (canvas && key !== filterKey) {
        filterKey = key;
        canvas.style.filter = blur || lost || woozy ? `${blur ? `blur(${blur.toFixed(1)}px) ` : ''}${lost ? `grayscale(${(lost * 0.85).toFixed(2)}) brightness(${(1 - lost * 0.35).toFixed(2)}) ` : ''}${woozy ? 'saturate(1.3) hue-rotate(8deg)' : ''}`.trim() : '';
      }
      return '';
    },
  };
}
