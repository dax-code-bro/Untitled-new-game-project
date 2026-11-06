// The phone (I key or 📱 button): inventory, garage delivery, properties,
// jobs, the mission log, stats and saving, plus Runr: an errand app that
// delivers guns (with their attachments), food and gang supplies by courier,
// tows your car back to the road (even out of the sea, by boat) and gives you
// a ride to the hideout. Everything costs money.
import * as THREE from 'three';
import { Human } from '../entities/human.js';
import { nearestRoad } from './world-util.js';
import { ShopUI } from '../ui/shop.js';
import { VEHICLES } from '../assets/library.js';
import { BOATS, AIRCRAFT } from '../entities/craft.js';
import { WEAPONS } from '../entities/arsenal.js';
import { money } from './world-util.js';

export function installPhone(game) {
  const { career, hud } = game;
  const P = career.p;
  const { lib, scene, collision, player, combat, graph } = game;
  // ---- Runr couriers: a person walks up from down the road with your package
  const couriers = [];
  const courier = (label, onArrive, wait = 20 + Math.random() * 25) => {
    couriers.push({ label, onArrive, wait, h: null, t: 0 });
    hud.toast(`Runr: ${label} is on the way (~${Math.round(wait)} s)`, 3);
  };
  const spawnCourier = (c) => {
    const id = lib.peopleIds[(Math.random() * lib.peopleIds.length) | 0];
    const h = new Human(lib, id);
    const ang = Math.random() * Math.PI * 2;
    let x = player.pos.x + Math.sin(ang) * 40, z = player.pos.z + Math.cos(ang) * 40;
    const r = nearestRoad(graph, x, z); if (r && r.dist < 60) { x = r.x; z = r.z; }
    h.root.position.set(x, collision.surface(x, z, player.pos.y + 30), z);
    // the parcel
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.32), new THREE.MeshStandardMaterial({ color: 0xa57a4a, roughness: 0.9 }));
    box.position.set(0, 1.05, 0.32); box.castShadow = true; h.root.add(box);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.04, 0.33), new THREE.MeshStandardMaterial({ color: 0x2e7d5b, roughness: 0.6 }));
    tape.position.copy(box.position); h.root.add(tape);
    h.play('Walk_Loop', 0);
    scene.add(h.root);
    c.h = h; c.box = box; c.tape = tape;
  };
  const services = () => {
    const last = game.lastVehicle?.();
    return [
      { name: 'Order a gun', sub: () => 'Any civilian firearm, delivered with its attachments · +$150 delivery', price: null, run: () => {
        phone.close();
        const ids = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].melee && id !== 'pistol' && WEAPONS[id].cat !== 'launcher');
        game.gunStore?.show({ id: 'runr', name: 'Runr · Firearms', keeper: 'Courier delivery', blurb: 'Prices plus 35% and a $150 delivery fee. Arrives by courier.', priceK: 1.35,
          cats: [...new Set(ids.map((id) => WEAPONS[id].cat))], ids,
          deliver: (id, price) => {
            if (!career.spend(price + 150)) { hud.toast(`Not enough money ($${price} + $150 delivery)`, 2); return false; }
            game.gunStore.close();
            courier(WEAPONS[id].name, () => { combat.give(id); game.applyFinishTo?.(id); hud.toast(`Delivered: ${WEAPONS[id].name}`, 2.5); });
          } });
      } },
      { name: 'Tow my car here', sub: () => last ? `${last.spec.name}${last.drowned ? ' · in the water (boat tow)' : ''}` : 'no car to tow', price: () => last?.drowned ? 650 : 350, dis: !last, run: () => {
        const cost = last.drowned ? 650 : 350;
        if (!career.spend(cost)) return;
        phone.close();
        const boat = last.drowned;
        hud.toast(boat ? 'Runr: a tow boat is heading out for your car' : 'Runr: a tow truck is on the way', 3);
        couriers.push({ label: 'tow', wait: boat ? 35 : 25, tow: true, onArrive: () => {
          const p = game.nearestRoadPoint?.(player.pos.x, player.pos.z);
          if (!p) return;
          last.pos.set(p.x, collision.surface(p.x, p.z, (p.y || 0) + 4), p.z);
          if (last.vel) last.vel.set(0, 0); last.drowned = false; last.airborne = false; last.vy = 0;
          last.heading = Math.atan2(p.tx || 0, p.tz || 1);
          last.sync?.(0);
          hud.toast(boat ? 'Your car was hauled out of the water and dropped on the road nearby' : 'Your car was dropped off on the road nearby', 3);
        } });
      } },
      { name: 'Order food', sub: () => `Po'boy and sweet tea · Health ${Math.round(player.health)}`, price: () => 30, run: () => {
        if (!career.spend(30)) return; phone.close();
        courier('your food', () => { player.health = Math.min(100, player.health + 50); game.feed?.(45); hud.toast('You eat. +50 health', 2); });
      } },
      { name: 'Order supplies for Tina', sub: () => { const s = P.supplies || {}; return `2 scrap metal, a glass lens, a spring set · have ${s.metal || 0}/${s.glass || 0}/${s.springs || 0}`; }, price: () => 260, run: () => {
        if (!career.spend(260)) return; phone.close();
        courier('supplies', () => { const s = P.supplies || (P.supplies = { metal: 0, glass: 0, springs: 0 }); s.metal += 2; s.glass += 1; s.springs += 1; hud.toast('Supplies delivered. Tina can build with these at the hideout.', 3); });
      } },
      { name: 'Ride to the hideout', sub: () => 'A driver drops you at the Gulf Line yard', price: () => 80, dis: !game.hideout, run: () => {
        if (game.S.mode !== 'foot') { hud.toast('Get out of the vehicle first', 2); return; }
        if (!career.spend(80)) return; phone.close();
        const H = game.hideout;
        game.fade?.(() => { player.pos.set(H.x + 6, collision.surface(H.x + 6, H.z + 6, H.y + 20), H.z + 6); hud.toast('Dropped off at the hideout', 2); });
        if (!game.fade) { player.pos.set(H.x + 6, collision.surface(H.x + 6, H.z + 6, H.y + 20), H.z + 6); hud.toast('Dropped off at the hideout', 2); }
      } },
    ];
  };
  const nameOf = (g) => g.cat === 'boat' ? BOATS.find((b) => b.id === g.type)?.name : g.cat === 'air' ? AIRCRAFT.find((a) => a.id === g.type)?.name : VEHICLES[g.type]?.name;
  const phone = new ShopUI({
    title: '📱 Phone', getMoney: () => career.money, pause: game.pause,
    tabs: [{ k: 'inv', label: 'Inventory' }, { k: 'garage', label: 'Garage' }, { k: 'weapons', label: 'Weapons' }, { k: 'props', label: 'Properties' }, { k: 'jobs', label: 'Jobs (27)' }, { k: 'story', label: 'Story (63)' }, { k: 'places', label: 'Places' }, { k: 'apps', label: 'Runr' }, { k: 'stats', label: 'Stats & save' }],
    note: (t) => ({
      inv: `Pelts: ${Object.values(P.pelts).reduce((a, b) => a + b, 0)} · Fish: ${Object.values(P.fish).filter(Boolean).reduce((a, f) => a + f.n, 0)} · Bait: ${P.baitCount || 0}`,
      garage: 'Owned cars are delivered to the nearest road; boats to the nearest marina; aircraft to the airfield.',
      weapons: `${game.combat.owned.length - 1} of ${Object.keys(WEAPONS).length - 2} weapons owned. Buy more from the three gunsmiths, or have one delivered through Runr.`,
      places: 'Every shop and service in Calvera, nearest first. Tap one to set your GPS. Blue road signs point the way too.',
      apps: `Runr — errands, deliveries and towing. ${couriers.length ? `${couriers.length} on the way.` : 'Nothing on the way.'}`,
      props: `${P.properties.length} of ${game.estate?.props?.length || 198} owned.`,
      jobs: 'Tap a job to set GPS to its job board.',
      story: `${P.missions.done.length} / 63 missions complete.`,
      stats: `Played ${Math.round(P.playSeconds / 60)} min.`,
    })[t],
    items: (t) => {
      if (t === 'inv') return [...(game.foodInventory?.() || []), ...game.tools.list.filter((x) => career.hasTool(x.id))];
      if (t === 'garage') return P.garage;
      if (t === 'weapons') return game.combat.owned.filter((id) => id !== 'fists');
      if (t === 'props') return game.estate.props.filter((p) => P.properties.includes(p.id));
      if (t === 'jobs') return game.jobs.JOBS;
      if (t === 'story') return game.missions.MISSIONS;
      if (t === 'apps') return services();
      if (t === 'places') return [...(game.places || [])].sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) - Math.hypot(b.x - player.pos.x, b.z - player.pos.z));
      return [{ save: true }, ...Object.entries(P.stats).map(([k, v]) => ({ k, v }))];
    },
    row: (it, t) => {
      if (t === 'inv' && it.food) return { name: it.name, sub: it.sub, stats: [], btn: 'Eat' };
      if (t === 'inv') return { name: it.name, sub: `${it.trade} · × ${P.tools[it.id]}`, stats: [], btn: Object.keys(it.fx).some((k) => ['heal', 'armor', 'repair', 'light', 'call'].includes(k)) ? 'Use' : 'Info' };
      if (t === 'garage') return { name: nameOf(it) || it.type, sub: `${it.cat}${Object.keys(it.up).length ? ` · ${Object.keys(it.up).length} upgrades` : ''}`, stats: [], btn: 'Deliver' };
      if (t === 'weapons') { const w = WEAPONS[it]; return { name: w.name, sub: `${w.cat} · ${game.combat.ammo[it]?.clip ?? '-'} / ${game.combat.ammo[it]?.reserve ?? '-'}`, stats: [], btn: game.combat.weapon === it ? 'Equipped' : 'Equip', cls: game.combat.weapon === it ? 'own' : '' }; }
      if (t === 'props') return { name: it.name, sub: `${it.type} · ${it.region}${P.home === it.id ? ' · home' : ''}`, stats: [], btn: 'GPS' };
      if (t === 'jobs') { const j = P.jobs[it.id]; return { name: it.name, sub: `${it.text}${j ? ` · ${game.jobs.rankOf?.(j.level) || ''} (level ${j.level}), ${j.runs} shifts${j.earned ? `, ${money(j.earned)} earned` : ''}${j.lastRating ? `, last ${'★'.repeat(Math.round(j.lastRating))}` : ''}` : ''}`, stats: [], btn: 'GPS', cls: j ? 'own' : '' }; }
      if (t === 'story') { const done = P.missions.done.includes(it.id), next = !done && game.missions.MISSIONS.find((m) => !P.missions.done.includes(m.id)) === it; return { name: `${it.id.slice(1)}. ${it.title}`, sub: `${it.act} · ${it.who} · ${money(it.reward)}`, stats: [], btn: done ? 'Done' : next ? 'Next' : 'Locked', cls: done ? 'own' : next ? '' : 'dis' }; }
      if (t === 'places') { const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z); return { name: `${it.icon || ''} ${it.name}`, sub: `${it.kind} · ${d < 1609 ? Math.round(d * 3.281 / 100) * 100 + ' ft' : (d / 1609).toFixed(1) + ' mi'} away`, stats: [], btn: 'GPS' }; }
      if (t === 'apps') { const pr = it.price?.(); return { name: it.name, sub: it.sub(), stats: [], btn: it.dis ? '—' : pr ? '$' + pr : 'Open', cls: it.dis ? 'dis' : '' }; }
      if (it.save) return { name: 'Save game', sub: P.saved ? `last saved ${new Date(P.saved).toLocaleTimeString()}` : 'not saved yet', stats: [], btn: 'Save' };
      return { name: it.k.replace(/([A-Z])/g, ' $1'), sub: String(typeof it.v === 'number' ? Math.round(it.v).toLocaleString('en-US') : it.v), stats: [], btn: '·', cls: 'dis' };
    },
    act: (it, t) => {
      if (t === 'inv') { if (it.food) it.eat(); else game.useTool(it); return; }
      if (t === 'garage') { const v = it.cat === 'car' ? game.garage.deliver(it) : game.marineAir.deliver(it); if (v) v.uid = it.uid; phone.close(); return; }
      if (t === 'weapons') { game.combat.weapon = it; game.combat.reloading = 0; return; }
      if (t === 'props') { game.setWaypoint(it.door.x, it.door.z, it.name); phone.close(); return; }
      if (t === 'jobs') { const at = it.at === 'marina' ? [game.marineAir.marinas[0].land.x, game.marineAir.marinas[0].land.z] : it.at; game.setWaypoint(at[0], at[1], it.name); phone.close(); return; }
      if (t === 'story') return;
      if (t === 'places') { game.setWaypoint(it.x, it.z, it.name); phone.close(); return; }
      if (t === 'apps') { if (!it.dis) it.run(); return; }
      if (it.save) { career.save(); hud.toast('Game saved', 1.5); }
    },
  });
  const btn = document.createElement('button');
  btn.textContent = '📱 Phone'; btn.className = 'sbPhoneBtn';
  btn.style.cssText = 'position:fixed;right:16px;top:186px;z-index:20;background:rgba(20,14,10,.7);color:#fff;border:1px solid #4a382b;border-radius:10px;padding:6px 10px;font:600 13px Inter,sans-serif;cursor:pointer';
  btn.onclick = () => phone.show('inv');
  document.body.appendChild(btn);
  addEventListener('keydown', (e) => { if (e.code === 'KeyI' && !phone.open) phone.show('inv'); });
  return {
    phone,
    couriers,
    update(dt) {
      for (let i = couriers.length - 1; i >= 0; i--) {
        const c = couriers[i];
        if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0 && !c.tow) spawnCourier(c); continue; }
        if (c.tow) { c.onArrive(); couriers.splice(i, 1); continue; }
        const h = c.h; if (!h) { couriers.splice(i, 1); continue; }
        c.t += dt;
        const dx = player.pos.x - h.root.position.x, dz = player.pos.z - h.root.position.z, d = Math.hypot(dx, dz);
        if (!c.handed) {
          if (d > 1.4 && c.t < 60) {
            const sp = d > 25 ? 3.2 : 1.5;
            h.root.position.x += (dx / d) * sp * dt; h.root.position.z += (dz / d) * sp * dt;
            h.root.position.y = collision.surface(h.root.position.x, h.root.position.z, h.root.position.y + 2);
            h.root.rotation.y = Math.atan2(dx, dz);
            h.play(d > 25 ? 'Jog_Fwd_Loop' : 'Walk_Loop', 0.25);
          } else {
            // the hand-off
            c.handed = 2.2; h.play('Interact', 0.2); h.root.remove(c.box); h.root.remove(c.tape);
            c.onArrive(); hud.toast('Runr courier: "Sign here. Have a good one."', 2);
          }
        } else if ((c.handed -= dt) <= 0) {
          // walks off and disappears
          if (c.away == null) { c.away = h.root.rotation.y + Math.PI + (Math.random() - 0.5); h.root.rotation.y = c.away; h.play('Walk_Loop', 0.3); }
          c.leave = (c.leave || 0) + dt;
          h.root.position.x += Math.sin(c.away) * 1.5 * dt; h.root.position.z += Math.cos(c.away) * 1.5 * dt;
          h.root.position.y = collision.surface(h.root.position.x, h.root.position.z, h.root.position.y + 2);
          if (c.leave > 8) { scene.remove(h.root); couriers.splice(i, 1); continue; }
        }
        h.update(dt);
      }
    },
  };
}
