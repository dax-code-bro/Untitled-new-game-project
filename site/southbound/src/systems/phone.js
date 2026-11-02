// The phone (I key or 📱 button): inventory, garage delivery, properties,
// jobs, the mission log, stats and saving.
import { ShopUI } from '../ui/shop.js';
import { VEHICLES } from '../assets/library.js';
import { BOATS, AIRCRAFT } from '../entities/craft.js';
import { WEAPONS } from '../entities/arsenal.js';
import { money } from './world-util.js';

export function installPhone(game) {
  const { career, hud } = game;
  const P = career.p;
  const nameOf = (g) => g.cat === 'boat' ? BOATS.find((b) => b.id === g.type)?.name : g.cat === 'air' ? AIRCRAFT.find((a) => a.id === g.type)?.name : VEHICLES[g.type]?.name;
  const phone = new ShopUI({
    title: '📱 Phone', getMoney: () => career.money, pause: game.pause,
    tabs: [{ k: 'inv', label: 'Inventory' }, { k: 'garage', label: 'Garage' }, { k: 'weapons', label: 'Weapons' }, { k: 'props', label: 'Properties' }, { k: 'jobs', label: 'Jobs (27)' }, { k: 'story', label: 'Story (63)' }, { k: 'stats', label: 'Stats & save' }],
    note: (t) => ({
      inv: `Pelts: ${Object.values(P.pelts).reduce((a, b) => a + b, 0)} · Fish: ${Object.values(P.fish).filter(Boolean).reduce((a, f) => a + f.n, 0)} · Bait: ${P.baitCount || 0}`,
      garage: 'Owned cars are delivered to the nearest road; boats to the nearest marina; aircraft to the airfield.',
      weapons: `${game.combat.owned.length - 1} of ${Object.keys(WEAPONS).length - 2} weapons owned. Buy more in the Arsenal (B).`,
      props: `${P.properties.length} of 198 owned.`,
      jobs: 'Tap a job to set GPS to its job board.',
      story: `${P.missions.done.length} / 63 missions complete.`,
      stats: `Played ${Math.round(P.playSeconds / 60)} min.`,
    })[t],
    items: (t) => {
      if (t === 'inv') return game.tools.list.filter((x) => career.hasTool(x.id));
      if (t === 'garage') return P.garage;
      if (t === 'weapons') return game.combat.owned.filter((id) => id !== 'fists');
      if (t === 'props') return game.estate.props.filter((p) => P.properties.includes(p.id));
      if (t === 'jobs') return game.jobs.JOBS;
      if (t === 'story') return game.missions.MISSIONS;
      return [{ save: true }, ...Object.entries(P.stats).map(([k, v]) => ({ k, v }))];
    },
    row: (it, t) => {
      if (t === 'inv') return { name: it.name, sub: `${it.trade} · × ${P.tools[it.id]}`, stats: [], btn: Object.keys(it.fx).some((k) => ['heal', 'armor', 'repair', 'light', 'call'].includes(k)) ? 'Use' : 'Info' };
      if (t === 'garage') return { name: nameOf(it) || it.type, sub: `${it.cat}${Object.keys(it.up).length ? ` · ${Object.keys(it.up).length} upgrades` : ''}`, stats: [], btn: 'Deliver' };
      if (t === 'weapons') { const w = WEAPONS[it]; return { name: w.name, sub: `${w.cat} · ${game.combat.ammo[it]?.clip ?? '-'} / ${game.combat.ammo[it]?.reserve ?? '-'}`, stats: [], btn: game.combat.weapon === it ? 'Equipped' : 'Equip', cls: game.combat.weapon === it ? 'own' : '' }; }
      if (t === 'props') return { name: it.name, sub: `${it.type} · ${it.region}${P.home === it.id ? ' · home' : ''}`, stats: [], btn: 'GPS' };
      if (t === 'jobs') { const j = P.jobs[it.id]; return { name: it.name, sub: `${it.text}${j ? ` · level ${j.level}, ${j.runs} shifts` : ''}`, stats: [], btn: 'GPS', cls: j ? 'own' : '' }; }
      if (t === 'story') { const done = P.missions.done.includes(it.id), next = !done && game.missions.MISSIONS.find((m) => !P.missions.done.includes(m.id)) === it; return { name: `${it.id.slice(1)}. ${it.title}`, sub: `${it.act} · ${it.who} · ${money(it.reward)}`, stats: [], btn: done ? 'Done' : next ? 'Next' : 'Locked', cls: done ? 'own' : next ? '' : 'dis' }; }
      if (it.save) return { name: 'Save game', sub: P.saved ? `last saved ${new Date(P.saved).toLocaleTimeString()}` : 'not saved yet', stats: [], btn: 'Save' };
      return { name: it.k.replace(/([A-Z])/g, ' $1'), sub: String(typeof it.v === 'number' ? Math.round(it.v).toLocaleString('en-US') : it.v), stats: [], btn: '·', cls: 'dis' };
    },
    act: (it, t) => {
      if (t === 'inv') { game.useTool(it); return; }
      if (t === 'garage') { const v = it.cat === 'car' ? game.garage.deliver(it) : game.marineAir.deliver(it); if (v) v.uid = it.uid; phone.close(); return; }
      if (t === 'weapons') { game.combat.weapon = it; game.combat.reloading = 0; return; }
      if (t === 'props') { game.setWaypoint(it.door.x, it.door.z, it.name); phone.close(); return; }
      if (t === 'jobs') { const at = it.at === 'marina' ? [game.marineAir.marinas[0].land.x, game.marineAir.marinas[0].land.z] : it.at; game.setWaypoint(at[0], at[1], it.name); phone.close(); return; }
      if (t === 'story') return;
      if (it.save) { career.save(); hud.toast('Game saved', 1.5); }
    },
  });
  const btn = document.createElement('button');
  btn.textContent = '📱 Phone';
  btn.style.cssText = 'position:fixed;right:16px;top:186px;z-index:20;background:rgba(20,14,10,.7);color:#fff;border:1px solid #4a382b;border-radius:10px;padding:6px 10px;font:600 13px Inter,sans-serif;cursor:pointer';
  btn.onclick = () => phone.show('inv');
  document.body.appendChild(btn);
  addEventListener('keydown', (e) => { if (e.code === 'KeyI' && !phone.open) phone.show('inv'); });
  return { phone };
}
