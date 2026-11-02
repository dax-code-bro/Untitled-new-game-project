// Fishing: stand at the water's edge (or sit in a stopped boat) with a rod and
// bait or a lure. Cast, wait for the bite, then reel: hold F to reel, let go
// when the line tension gets too high. Species depend on the water.
import * as THREE from 'three';
import { LAKE, BAYOU, regionAt } from '../world/layout.js';
import { ShopUI } from '../ui/shop.js';
import { money, keyHint } from './world-util.js';

// [name, min lb, max lb, $/lb, rarity]
const FISH = {
  lake: [['Largemouth bass', 1, 9, 6, 1], ['Bluegill', 0.2, 1.2, 4, 1.4], ['Crappie', 0.4, 2.5, 5, 1.1], ['Channel catfish', 2, 20, 3, 0.9], ['Longnose gar', 3, 25, 2, 0.5], ['Striped bass', 4, 30, 5, 0.25]],
  river: [['Channel catfish', 2, 25, 3, 1], ['Blue catfish', 5, 60, 3, 0.35], ['Spotted bass', 1, 5, 6, 0.9], ['Freshwater drum', 1, 10, 2, 0.8], ['Alligator gar', 20, 140, 2, 0.08]],
  bayou: [['Bowfin', 2, 12, 2, 1], ['Spotted gar', 1, 8, 2, 1], ['Flathead catfish', 4, 50, 3, 0.6], ['Redear sunfish', 0.3, 2, 5, 1.1], ['Alligator gar', 20, 160, 2, 0.12]],
  ocean: [['Redfish', 3, 30, 8, 1], ['Speckled trout', 1, 8, 9, 1], ['Flounder', 1, 10, 10, 0.7], ['Sheepshead', 1, 12, 6, 0.8], ['Red snapper', 4, 35, 12, 0.4], ['Tarpon', 30, 200, 4, 0.08], ['Bull shark', 80, 400, 3, 0.04]],
};

export function installFishing(game) {
  const { career, interact, hud, scene, hm, player } = game;
  const P = career.p;
  P.fishLog = P.fishLog || {};
  let st = null; // { phase: cast|wait|bite|reel, t, spot, fish, progress, tension }

  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.6 }));
  const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff3020, roughness: 0.4 }));
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 2.2, 6).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.4, metalness: 0.4 }));
  line.visible = bobber.visible = rod.visible = false; line.frustumCulled = false;
  scene.add(line, bobber, rod);

  const waterKind = (x, z) => {
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.3) return 'lake';
    if (Math.hypot(x - BAYOU.x, z - BAYOU.z) < BAYOU.r) return 'bayou';
    if (regionAt(x, z).name === 'Gulf Shore' || hm.waterLevel(x, z) < 0.5) return 'ocean';
    return 'river';
  };
  // a fishable water point in front of the player
  const waterAhead = () => {
    const f = Math.sin(player.heading), c = Math.cos(player.heading);
    for (let d = 2; d <= 12; d += 1) {
      const x = player.pos.x + f * d, z = player.pos.z + c * d;
      if (hm.waterLevel(x, z) - hm.height(x, z) > 0.8) return { x, z, y: hm.waterLevel(x, z), d };
    }
    return null;
  };
  const market = new ShopUI({
    title: 'Fish Market', getMoney: () => career.money, pause: game.pause,
    tabs: [{ k: 'sell', label: 'Sell catch' }, { k: 'log', label: 'Fishing log' }],
    note: (t) => t === 'sell' ? 'Prices are per pound.' : `Species caught: ${Object.keys(P.fishLog).length} / ${new Set(Object.values(FISH).flat().map((f) => f[0])).size}`,
    items: (t) => t === 'sell' ? Object.entries(P.fish).filter(([, f]) => f && f.lb > 0).map(([k, f]) => ({ k, ...f })) : Object.entries(P.fishLog).map(([k, v]) => ({ k, ...v })),
    row: (it, t) => t === 'sell' ? { name: `${it.k} × ${it.n}`, sub: `${it.lb.toFixed(1)} lb total`, stats: [], btn: `Sell ${money(it.lb * it.price)}` } : { name: it.k, sub: `caught ${it.n}`, stats: [['Record', null, `${it.best.toFixed(1)} lb`]], btn: 'Logged', cls: 'own' },
    act: (it, t) => { if (t === 'sell') { career.earn(Math.round(it.lb * it.price), it.k); P.fish[it.k] = null; career.saveSoon(); } },
  });
  for (const m of game.marineAir?.marinas || []) interact.add({ x: m.land.x - 6, z: m.land.z + 4, label: () => `${keyHint(game)} sell your catch`, color: 0x60c0ff, blip: { color: '#60c0ff', size: 4 }, use: () => market.show('sell') });

  const stop = (msg) => { st = null; line.visible = bobber.visible = rod.visible = false; if (msg) hud.toast(msg, 1.8); };

  return {
    market,
    update(dt, a, free) {
      const boat = game.vehicle();
      const onBoat = boat && boat.isBoat && Math.abs(boat.speed) < 0.6;
      if (!st && game.S.mode !== 'foot' && !onBoat) return '';
      const rodTier = game.tools.best('rod');
      if (!st) {
        const spot = onBoat ? { x: boat.pos.x + Math.sin(boat.heading + 1.4) * 6, z: boat.pos.z + Math.cos(boat.heading + 1.4) * 6, y: hm.waterLevel(boat.pos.x, boat.pos.z) } : waterAhead();
        if (!spot) return '';
        if (!rodTier) return onBoat ? '' : 'Buy a fishing rod at a bait & tackle shop to fish here';
        const hasBait = (P.baitCount || 0) > 0 || game.tools.best('lure');
        if (!hasBait) return 'You need bait or a lure (bait & tackle shop)';
        const press = onBoat ? a.horn : a.enter && free;
        if (press) {
          if (!game.tools.best('lure')) P.baitCount--;
          st = { phase: 'wait', t: (6 + Math.random() * 14) / (1 + rodTier * 0.05) / (game.tools.best('finder') ? 1.5 : 1), spot, kind: waterKind(spot.x, spot.z), progress: 0, tension: 0 };
          rod.visible = line.visible = bobber.visible = true;
          bobber.position.set(spot.x, spot.y + 0.03, spot.z);
          return '';
        }
        return onBoat ? `Press H to cast a line (${waterKind(spot.x, spot.z)})` : `${keyHint(game)} cast a line (${waterKind(spot.x, spot.z)} fishing)`;
      }
      // rod in hand, line to the bobber
      const hx = player.pos.x + Math.sin(player.heading) * 0.4, hz = player.pos.z + Math.cos(player.heading) * 0.4;
      const base = onBoat ? boat.pos : player.pos;
      rod.position.set(onBoat ? base.x : hx, base.y + 1.0, onBoat ? base.z : hz);
      rod.rotation.set(-0.9, player.heading, 0, 'YXZ');
      const tip = new THREE.Vector3(0, 2.2, 0).applyEuler(rod.rotation).add(rod.position);
      st.t -= dt;
      const bob = st.phase === 'bite' ? Math.sin(performance.now() * 0.03) * 0.06 - 0.05 : Math.sin(performance.now() * 0.003) * 0.015;
      bobber.position.y = st.spot.y + 0.03 + bob;
      line.geometry.setFromPoints([tip, bobber.position]);
      if (game.S.mode === 'foot' && Math.hypot(player.vel?.x || 0, player.vel?.z || 0) > 1) { stop('Line reeled in'); return ''; }
      const held = game.input.keys.has('KeyF') || game.input.keys.has('KeyH') || a.sprint;
      const reelKey = st.phase === 'bite' ? (a.enter || a.horn || held) : held;
      if (st.phase === 'wait') {
        if (st.t <= 0) { st.phase = 'bite'; st.t = 1.6; }
        return 'Waiting for a bite…';
      }
      if (st.phase === 'bite') {
        if (reelKey) {
          const pool = FISH[st.kind];
          const total = pool.reduce((s, f) => s + f[4] * (1 + rodTier * 0.02), 0);
          let r = Math.random() * total, f = pool[0];
          for (const x of pool) if ((r -= x[4]) <= 0) { f = x; break; }
          const lb = f[1] + (f[2] - f[1]) * Math.pow(Math.random(), 2.2 - Math.min(rodTier, 15) * 0.05);
          st.phase = 'reel'; st.fish = { name: f[0], lb, price: f[3] }; st.fight = 0.5 + Math.min(lb / 60, 2.5);
          return '';
        }
        if (st.t <= 0) { stop('It got away'); return ''; }
        return 'FISH ON! Press F / tap now!';
      }
      // reel: holding raises progress and tension; tension decays when you let go
      const strong = st.fight / (1 + rodTier * 0.12);
      if (reelKey) { st.progress += dt * 0.22 / strong; st.tension += dt * (0.35 + Math.random() * 0.5) * strong; }
      else { st.tension = Math.max(0, st.tension - dt * 0.6); st.progress = Math.max(0, st.progress - dt * 0.03 * strong); }
      if (st.tension >= 1) { stop('The line snapped!'); return ''; }
      if (st.progress >= 1) {
        const f = st.fish;
        const cur = P.fish[f.name] || { n: 0, lb: 0, price: f.price };
        cur.n++; cur.lb += f.lb; P.fish[f.name] = cur;
        const log = P.fishLog[f.name] || { n: 0, best: 0 }; log.n++; log.best = Math.max(log.best, f.lb); P.fishLog[f.name] = log;
        P.stats.fishCaught++;
        game.hud.bigMessage('CAUGHT!', `${f.name} · ${f.lb.toFixed(1)} lb`, 2.5);
        career.saveSoon();
        stop();
        return '';
      }
      const bar = (v) => '█'.repeat(Math.round(v * 10)).padEnd(10, '░');
      return `Reel (hold F / sprint): ${bar(st.progress)}  Tension: ${bar(Math.min(1, st.tension))}`;
    },
  };
}
