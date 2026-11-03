// Armour, concealment and staying alive.
//
//  - Two armour stores (Port Calvera and Mill Creek): carriers and vests by
//    NIJ level, helmets, bags, holsters and medical supplies.
//  - Armour works by level against penetration: a plate stops what it is
//    rated for (you take a bruising) and fails against anything heavier.
//    Plates wear out; ceramic cracks fastest. Helmets only cover the head.
//  - Getting shot in a leg makes you limp, in an arm makes your aim shake, and
//    deeper hits bleed. Bandages, tourniquets, splints, IFAKs and trauma bags
//    fix it (H uses the right thing, or pick from the phone's Inventory).
//  - Carrying guns in town: a gun the police can see is enough for them to
//    stop you. Sidearms hide under an untucked shirt or a jacket with the
//    right holster; long guns hide in a bag that is big enough. A drawn gun is
//    never hidden. Out in the country nobody minds.
import * as THREE from 'three';
import { CITY, TOWN, regionAt } from '../world/layout.js';
import { nearestRoad, keyHint } from './world-util.js';
import { dressMember, placeAccessories } from './gang.js';
import { buildShop } from './gunstores.js';
import { shopOpen, closedText } from '../world/storefronts.js';
import { ArmorStore } from '../ui/armorstore.js';
import { WEAPONS } from '../entities/arsenal.js';
import { Combat } from '../entities/combat.js';
import { MEDS, gearById, weaponLength, wearGear, buildCarrier } from '../entities/gear.js';
import { parseKey } from '../entities/clothing.js';

const STORES = [
  { id: 'a-city', name: 'Gulf Coast Tactical', keeper: 'Reggie Batiste', blurb: 'Body armour, packs, holsters, medical. Law enforcement discounts.', priceK: 1.15,
    wall: 0x3a3d36, signBg: '#1b1f16', signFg: '#c8b46a', signText: '#f1ead0', style: 'metal', hours: 'Mon–Sat 9–7|LE/Mil discount',
    at: () => [[CITY.x0 - 46, CITY.z0 + 5 * CITY.pitch + 20], [CITY.x0 + 7.5 * CITY.pitch, CITY.z0 - 40], [CITY.x0 + CITY.nx * CITY.pitch + 46, CITY.z0 + 0.5 * CITY.pitch], [CITY.x0 + 6.5 * CITY.pitch, CITY.z0 + CITY.nz * CITY.pitch + 46], [CITY.x0 - 46, CITY.z0 + 0.5 * CITY.pitch]],
    look: { id: 'reggie', base: 'mh_m4', skin: 'dark', suit: [0.3, 0.32, 0.24], hair: 'black', h: 1.03, w: 1.2, acc: ['cap'], lines: ['Plates, packs, patches. What are we protecting today?', 'Level IV will stop a lot. Not everything. Remember that.'] }, gear: { armor: 'pc-ceramic' } },
  { id: 'a-town', name: 'Sabine Army Surplus', keeper: 'Dot Fontenot', blurb: 'Surplus gear and first aid. Cash, no questions.', priceK: 0.95,
    wall: 0x5d5a40, signBg: '#2b2a1a', signFg: '#d8c890', signText: '#f2ecd2', style: 'quonset', hours: 'Thu–Sun 9–5|Cash only',
    at: () => [[TOWN.x0 + 3 * TOWN.pitch, TOWN.z0 + TOWN.nz * TOWN.pitch + 34], [TOWN.x0 - 34, TOWN.z0 + 0.5 * TOWN.pitch], [TOWN.x0 + TOWN.nx * TOWN.pitch + 34, TOWN.z0 + 0.5 * TOWN.pitch], [TOWN.x0 + 0.5 * TOWN.pitch, TOWN.z0 - 34]],
    look: { id: 'dot', base: 'mh_f2', skin: 'light', suit: [0.38, 0.4, 0.28], hair: 'grey', h: 0.95, w: 1.15, acc: ['glasses'], lines: ['My husband brought half this home from Germany. Don\'t ask.', 'Tourniquets are by the register. Buy two.'] }, gear: { armor: 'soft-patrol' } },
];

function decorateArmory(g, { W, D, box, M, wood }) {
  // wall of carriers on mannequin forms, shelves of packs, a med cabinet
  for (let i = 0; i < 5; i++) {
    const c = buildCarrier({ id: 'x', plates: 2, color: [0x2b2b2b, 0x3c4a32, 0x6b5d45, 0x1a1a1a, 0x8a7a5a][i] });
    c.position.set(-3.2 + i * 1.6, 1.85, -D / 2 + 0.35); g.add(c);
    box(0.05, 0.6, 0.05, -3.2 + i * 1.6, 1.4, -D / 2 + 0.35, M(0x777777, 0.4, 0.8), false);
  }
  const packs = [0x2f3a4a, 0x7a3a22, 0x222222, 0x3a4a3a, 0x5a5340];
  for (let i = 0; i < 6; i++) box(0.38, 0.5, 0.22, -W / 2 + 0.45, 0.45 + (i % 3) * 0.75, -2 + Math.floor(i / 3) * 0.9, M(packs[i % packs.length], 0.85), false);
  box(0.4, 1.8, 1.6, W / 2 - 0.35, 0.9, -1.4, M(0xd8d8d0, 0.5), false);
  box(0.02, 0.34, 0.34, W / 2 - 0.56, 1.5, -1.4, M(0xc81e1e, 0.5), false);
  box(0.02, 0.1, 0.3, W / 2 - 0.56, 1.5, -1.4, M(0xffffff, 0.5), false);
  void wood;
}

export function installArmory(game) {
  const { scene, graph, lib, interact, hud, career, player, S, combat, peds, police, collision } = game;
  const P = career.p;
  P.gear = P.gear || { armor: null, helmet: null, bag: null, holster: 'owb' };
  P.gearOwned = P.gearOwned || [];
  P.med = P.med || { bandage: 2 };
  P.plateCond = P.plateCond ?? 1;
  S.wounds = S.wounds || { leg: 0, arm: 0, bleed: 0, numb: 0 };
  const W = S.wounds;

  // ---------------- what John is wearing
  player.gearArmor = true;
  const worn = wearGear(player.h, P.gear);
  const refresh = () => {
    worn.apply(P.gear);
    const a = gearById('armor', P.gear.armor);
    player.armor = a && a.level ? Math.round(P.plateCond * 100) : 0;
  };
  refresh();
  const prevHead = game.setHeadwearVisible;
  game.setHeadwearVisible = (v) => { prevHead?.(v); worn.headVisible(v); };

  // ---------------- getting shot
  // returns the damage that gets through; handles plates, helmet and wounds
  game.armorHit = (amount, from, pen = 2) => {
    if (amount <= 0) return 0;
    const r = Math.random();
    const zone = r < 0.07 ? 'head' : r < 0.6 ? 'torso' : r < 0.8 ? 'leg' : 'arm';
    const a = gearById('armor', P.gear.armor), hm = gearById('helmet', P.gear.helmet);
    if (pen <= 0) return a && a.level ? amount * 0.8 : amount; // fists and blunt hits
    if (zone === 'torso' && a && a.level && P.plateCond > 0) {
      const stops = pen <= Math.floor(a.level) || (a.level % 1 && pen <= a.level + 0.5 && Math.random() < 0.6);
      P.plateCond = Math.max(0, P.plateCond - (stops ? 1 : 1.6) / Math.max(1, a.durability));
      player.armor = Math.round(P.plateCond * 100);
      if (P.plateCond <= 0) hud.toast('Your plates are shot through. Replace them at an armour store.', 3);
      if (stops) { hud.toast('The plate stopped it', 1.2); game.audio?.thud?.(0.3); return amount * 0.12; }
      amount *= 0.85;
    }
    if (zone === 'head') { if (hm && hm.level >= pen) { hud.toast('Your helmet took that one', 1.4); return amount * 0.2; } return amount * 2.2; }
    if (zone === 'leg') { amount *= 0.7; if (Math.random() < 0.6) { W.leg = 1; W.bleed = Math.max(W.bleed, 1); hud.toast('You\'re hit in the leg', 1.6); } }
    if (zone === 'arm') { amount *= 0.6; if (Math.random() < 0.6) { W.arm = 1; W.bleed = Math.max(W.bleed, 1); hud.toast('You\'re hit in the arm', 1.6); } }
    if (zone === 'torso' && amount > 9 && Math.random() < 0.45) W.bleed = Math.min(3, W.bleed + 1);
    return amount;
  };

  // ---------------- medical
  const treat = (m) => {
    if (!P.med[m.id]) return false;
    P.med[m.id]--;
    player.health = Math.min(100, player.health + (m.heal || 0));
    if (m.bleed) W.bleed = Math.max(0, W.bleed - m.bleed);
    for (const f of m.fix || []) W[f] = 0;
    if (m.numb) W.numb = m.numb;
    hud.toast(`Used ${m.name}`, 1.6);
    career.saveSoon();
    return true;
  };
  // pick the right supply for what's wrong
  const quickTreat = () => {
    const need = (ids) => ids.map((id) => MEDS.find((m) => m.id === id)).find((m) => P.med[m.id] > 0);
    let m = null;
    if (W.bleed >= 2) m = need(['tourniquet', 'gauze', 'ifak', 'dressing', 'trauma', 'bandage']);
    else if (W.leg || W.arm) m = need(['splint', 'ifak', 'trauma', 'painkillers']);
    else if (W.bleed) m = need(['bandage', 'dressing', 'gauze', 'ifak']);
    else if (player.health < 100) m = need(['ifak', 'dressing', 'bandage', 'trauma', 'painkillers']);
    if (!m) { hud.toast(W.bleed || W.leg || W.arm || player.health < 100 ? 'No medical supplies for that. Buy some at an armour store.' : 'You\'re fine.', 2); return; }
    treat(m);
  };
  addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !e.repeat && !document.querySelector('.sbshop.show,#armory.show,#clothes.show,#gunstore.show')) quickTreat(); });
  game.medInventory = () => MEDS.filter((m) => P.med[m.id] > 0).map((m) => ({ food: true, name: m.name, sub: `× ${P.med[m.id]} · ${m.desc}`, eat: () => treat(m) }));
  const prevFood = game.foodInventory;
  game.foodInventory = () => [...(game.medInventory?.() || []), ...(prevFood?.() || [])];

  // ---------------- concealment
  const outfitCovers = () => {
    const top = parseKey(P.outfit?.top), out = parseKey(P.outfit?.outer), bot = parseKey(P.outfit?.bottom);
    return { untucked: !!out || (top && top.style.hem < 0.1), jacket: !!out, longPants: !!bot && bot.style.leg < -1 };
  };
  const carried = () => {
    const out = [];
    for (const slot of ['sidearm', 'long', 'shotgun', 'sniper', 'bow', 'heavy']) { const id = combat.slotWeapon(slot); if (id) out.push({ id, slot }); }
    return out;
  };
  // which carried weapons someone could see right now
  const exposure = () => {
    const vis = [], hid = [];
    const cov = outfitCovers(), hol = gearById('holster', P.gear.holster) || { conceal: 'never' }, bag = gearById('bag', P.gear.bag);
    let room = bag ? bag.slots : 0;
    const list = carried().sort((a, b) => weaponLength(WEAPONS[a.id]) - weaponLength(WEAPONS[b.id]));
    for (const c of list) {
      const w = WEAPONS[c.id];
      const drawn = combat.drawn && combat.weapon === c.id;
      let hidden = false;
      if (!drawn) {
        if (c.slot === 'sidearm') hidden = (hol.conceal === 'untucked' && cov.untucked) || (hol.conceal === 'jacket' && cov.jacket) || (hol.conceal === 'long-pants' && cov.longPants);
        else if (bag && room > 0 && weaponLength(w) <= bag.len) { hidden = true; room--; }
      }
      (hidden ? hid : vis).push(c.id);
    }
    if (combat.drawn && !combat.def.melee && !vis.includes(combat.weapon)) vis.push(combat.weapon);
    return { vis, hid };
  };
  let exp = { vis: [], hid: [] };
  game.isConcealed = (id) => exp.hid.includes(id);

  // ---------------- status chips (wounds, concealment)
  const chip = document.createElement('div'); chip.id = 'sbstatus';
  chip.style.cssText = 'position:fixed;left:16px;bottom:96px;z-index:12;display:flex;flex-direction:column;gap:5px;pointer-events:none;font:600 12px Inter,system-ui,sans-serif';
  document.body.appendChild(chip);
  let chipKey = '';
  const drawChips = () => {
    const items = [];
    if (W.bleed) items.push(['#b3241f', `Bleeding${W.bleed > 1 ? ' heavily' : ''} · H to treat`]);
    if (W.leg) items.push(['#9a5a22', 'Leg wound · limping']);
    if (W.arm) items.push(['#9a5a22', 'Arm wound · shaky aim']);
    if (W.numb > 0 && (W.leg || W.arm)) items.push(['#4a5a7a', 'Painkillers']);
    if (exp.vis.length && !S.indoors && S.mode === 'foot') items.push(['#7a1d1d', `Visible: ${exp.vis.map((id) => WEAPONS[id]?.name).filter(Boolean).slice(0, 2).join(', ')}`]);
    else if (exp.hid.length && S.mode === 'foot') items.push(['#2a3a2a', `Concealed: ${exp.hid.length} weapon${exp.hid.length > 1 ? 's' : ''}`]);
    const key = items.map((i) => i[1]).join('|');
    if (key === chipKey) return;
    chipKey = key;
    chip.innerHTML = items.map(([c, t]) => `<span style="background:${c}e6;color:#fff;padding:4px 9px;border-radius:7px;box-shadow:0 2px 8px rgba(0,0,0,.3);width:max-content">${t}</span>`).join('');
  };

  // ---------------- the stores
  const ui = new ArmorStore({ lib, career, getMoney: () => career.money, spend: (n) => career.spend(n), pause: game.pause, toast: (t) => hud.toast(t, 2.2), skinHex: 0xb98264,
    changed: () => { const before = P.gear.armor; refresh(); if (before) { /* bought new: fresh plates */ } } });
  const origAction = ui.action.bind(ui);
  ui.action = (a, it, price) => { const was = P.gear.armor; origAction(a, it, price); if (ui.tab === 'armor' && a === 'buy' && P.gear.armor !== was) { P.plateCond = 1; refresh(); } };
  game.armorStore = ui;
  const keepers = [];
  for (const st of STORES) {
    st.decorate = decorateArmory;
    let shop = null;
    for (const [ax, az] of st.at()) { const r = nearestRoad(graph, ax, az) || { x: ax, z: az, tx: 1, tz: 0 }; shop = buildShop(game, r, st); if (shop) break; }
    if (!shop) continue;
    const h = dressMember(lib, { ...st.look, name: st.keeper });
    h.root.position.copy(shop.keeper); h.root.rotation.y = shop.keeperFace; h.play('Idle_Loop', 0); scene.add(h.root);
    wearGear(h, st.gear);
    keepers.push({ h, st, shop });
    interact.add({ x: shop.counter.x, z: shop.counter.z, r: 2.3, marker: false, y: shop.y,
      blip: { color: '#c8b46a', size: 5, global: true, icon: '🦺', badge: 'S' },
      show: () => S.mode === 'foot', label: () => `${keyHint(game)} talk to ${st.keeper}`,
      use: () => {
        if (!shopOpen(st.id, game.sky.hour)) { hud.toast(closedText(st.name, st.id), 3); return; }
        const a = gearById('armor', P.gear.armor);
        const opts = [['I need some protection.', () => ui.show(st)]];
        if (a && a.level && P.plateCond < 1) { const cost = Math.round(a.price * 0.45 * (1 - P.plateCond) / 5) * 5 + 40; opts.push([`Replace my plates · $${cost}`, () => { if (career.spend(cost)) { P.plateCond = 1; refresh(); hud.toast('New plates fitted', 2); } }]); }
        opts.push(['Just looking. Bye.', () => {}]);
        game.openDialog(st.keeper, st.look.lines[(Math.random() * st.look.lines.length) | 0], opts);
      } });
  }
  game.armorShops = keepers.map((k) => ({ id: k.st.id, name: k.st.name, x: k.shop.counter.x, z: k.shop.counter.z, face: k.shop.keeperFace }));

  // ---------------- police: armour on officers, and noticing guns
  const dressCop = (p) => {
    p.gearDone = true;
    if (p.swat) { wearGear(p.h, { armor: 'pc-ceramic', helmet: 'ballistic' }); p.armor = 3.5; p.helmet = 2; }
    else { wearGear(p.h, { armor: 'soft-patrol' }); p.armor = 2; }
  };
  // ---------------- arrested: they keep what they find
  P.evidence = P.evidence || [];
  game.onArrested = () => {
    const seized = combat.owned.filter((id) => id !== 'fists');
    if (!seized.length) return;
    for (const id of seized) P.evidence.push({ id, ammo: combat.ammo[id] ? { ...combat.ammo[id] } : null });
    combat.owned.splice(0, combat.owned.length, 'fists');
    combat.weapon = 'fists'; combat.holstered = true; combat.dual = false;
    hud.toast(`The police kept your weapons (${seized.length}) as evidence. Collect them at the precinct's evidence room.`, 6);
    career.save();
  };
  const evFee = () => Math.max(150, Math.round(P.evidence.reduce((a, e) => a + (WEAPONS[e.id]?.price || 300), 0) * 0.12 / 10) * 10);
  if (game.PRECINCT) interact.add({ x: game.PRECINCT.x - 3, z: game.PRECINCT.z, r: 2.5, color: 0x80a0ff,
    show: () => P.evidence.length > 0 && !S.indoors && S.mode === 'foot',
    blip: { color: '#80a0ff', size: 5, icon: '🗄️' },
    label: () => `${keyHint(game)} collect your property from evidence · $${evFee().toLocaleString('en-US')} release fee`,
    use: () => {
      if (police.wanted > 0) { hud.toast('"Come back when you\'re not wanted, genius."', 2.5); return; }
      if (!career.spend(evFee())) return;
      for (const e of P.evidence) { combat.give(e.id); if (e.ammo) combat.ammo[e.id] = e.ammo; }
      hud.toast(`Signed for ${P.evidence.length} weapon${P.evidence.length > 1 ? 's' : ''}. Try to keep them out of sight.`, 3.5);
      P.evidence = []; career.save();
    } });

  let seenT = 0, warnCool = 0, gearT = 0, civT = 0, civCool = 0;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();

  return {
    keepers,
    update(dt) {
      // wounds
      if (W.numb > 0) W.numb -= dt;
      const numb = W.numb > 0;
      if (W.bleed) {
        player.health -= [0, 0.35, 0.8, 1.5][W.bleed] * dt;
        if (W.bleed === 1 && (W.bleedT = (W.bleedT || 0) + dt) > 45) { W.bleed = 0; W.bleedT = 0; }
        if (player.health <= 0) player.health = 0;
      } else W.bleedT = 0;
      S.limp = !!W.leg && !numb;
      combat.spreadMul = W.arm && !numb ? 1.9 : 1;
      if (S.dead > 0) { W.leg = W.arm = W.bleed = 0; }
      // concealment
      exp = exposure();
      drawChips();
      // gear on any new officers
      if ((gearT -= dt) <= 0) { gearT = 0.5; for (const p of peds.list) if (p.role === 'cop' && !p.gearDone && p.h) dressCop(p); }
      // a cop who can see your gun stops you
      warnCool -= dt;
      const r = regionAt(player.pos.x, player.pos.z);
      const town = r.sub === 'City' || r.sub === 'Town';
      if (town && S.mode === 'foot' && !S.indoors && exp.vis.length && police.wanted === 0 && warnCool <= 0) {
        let sees = null;
        for (const p of peds.list) {
          if (p.role !== 'cop' || p.mode === 'dead' || p.wound?.down) continue;
          const d = p.pos.distanceTo(player.pos);
          if (d > 26) continue;
          _a.set(p.pos.x, p.pos.y + 1.6, p.pos.z); _b.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
          if (collision.raycast(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z) < 0.98) continue;
          sees = p; break;
        }
        if (!sees) for (const c of police.cars) { if (c.v.pos.distanceTo(player.pos) < 18) { sees = c; break; } }
        seenT = sees ? seenT + dt : Math.max(0, seenT - dt);
        if (seenT > 1.3) {
          seenT = 0; warnCool = 40;
          const what = WEAPONS[exp.vis[0]]?.name || 'a gun';
          hud.toast(`POLICE: "Sir! You can't walk around with ${what.toLowerCase().startsWith('a') ? 'an' : 'a'} ${what} out like that. Hands where I can see them!"`, 4.5);
          police.crime('weapon');
        }
      } else seenT = 0;
      // bystanders who see a gun call it in
      civCool -= dt;
      if (town && S.mode === 'foot' && !S.indoors && exp.vis.length && police.wanted === 0 && civCool <= 0 && (civT -= dt) <= 0) {
        civT = 2;
        const by = peds.list.find((p) => !p.role && p.mode !== 'dead' && !p.wound?.down && p.pos.distanceTo(player.pos) < 11);
        if (by && Math.random() < 0.3) {
          civCool = 45;
          hud.toast(['"Oh my God, he\'s got a gun!"', '"Is that a rifle? I\'m calling 911."', '"Hey! Somebody call the cops!"'][(Math.random() * 3) | 0], 2.5);
          peds.panic(player.pos, 14);
          game.reportCrime?.('weapon', player.pos);
        }
      }
      for (const k of keepers) { const d = k.h.root.position.distanceTo(player.pos); k.h.root.visible = d < 90 && shopOpen(k.st.id, game.sky.hour); if (k.h.root.visible) { k.h.update(dt); placeAccessories(k.h); } }
    },
  };
}
void Combat;
