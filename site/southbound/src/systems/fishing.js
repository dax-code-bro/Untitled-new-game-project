// Fishing: stand at the water's edge (or sit in a stopped boat) with a rod and
// bait or a lure. Cast, wait for the bite, then reel: hold F to reel, let go
// when the line tension gets too high. Species depend on the water.
import * as THREE from 'three';
import { LAKE, BAYOU, regionAt } from '../world/layout.js';
import { ShopUI } from '../ui/shop.js';
import { money, keyHint } from './world-util.js';
import { loadOpen, loaded, instance, Q, K } from '../assets/open.js';
const FISH_MODELS = [K('BarramundiFish'), ...['Fish1', 'Fish2', 'Fish3'].map((n) => Q('fish_pack', n))];
const SHARK = Q('fish_pack', 'Shark');

// [name, min lb, max lb, $/lb, rarity]
const FISH = {
  lake: [['Largemouth bass', 1, 9, 6, 1], ['Bluegill', 0.2, 1.2, 4, 1.4], ['Crappie', 0.4, 2.5, 5, 1.1], ['Channel catfish', 2, 20, 3, 0.9], ['Longnose gar', 3, 25, 2, 0.5], ['Striped bass', 4, 30, 5, 0.25]],
  river: [['Channel catfish', 2, 25, 3, 1], ['Blue catfish', 5, 60, 3, 0.35], ['Spotted bass', 1, 5, 6, 0.9], ['Freshwater drum', 1, 10, 2, 0.8], ['Alligator gar', 20, 140, 2, 0.08]],
  bayou: [['Bowfin', 2, 12, 2, 1], ['Spotted gar', 1, 8, 2, 1], ['Flathead catfish', 4, 50, 3, 0.6], ['Redear sunfish', 0.3, 2, 5, 1.1], ['Alligator gar', 20, 160, 2, 0.12]],
  ocean: [['Redfish', 3, 30, 8, 1], ['Speckled trout', 1, 8, 9, 1], ['Flounder', 1, 10, 10, 0.7], ['Sheepshead', 1, 12, 6, 0.8], ['Red snapper', 4, 35, 12, 0.4], ['Tarpon', 30, 200, 4, 0.08], ['Bull shark', 80, 400, 3, 0.04]],
};

// One legendary fish in each kind of water: rare, huge, and they fight
const LEGEND_FISH = {
  lake: { id: 'mossback', name: 'Old Mossback (largemouth bass)', lb: [14, 17], price: 40, fight: 2.6 },
  river: { id: 'ferryman', name: 'The Ferryman (blue catfish)', lb: [95, 120], price: 9, fight: 3.4 },
  bayou: { id: 'gatorjaw', name: 'Gator Jaw (alligator gar)', lb: [180, 230], price: 6, fight: 3.6 },
  ocean: { id: 'silverking', name: 'The Silver King (tarpon)', lb: [240, 280], price: 6, fight: 3.8 },
};
// keepers: anything under the size limit goes back
const keepMin = (f) => f[1] + (f[2] - f[1]) * 0.1;

export function installFishing(game) {
  const { career, interact, hud, scene, hm, player } = game;
  const P = career.p;
  P.fishLog = P.fishLog || {}; P.legendFish = P.legendFish || {};
  // how long until something bites: the hour, the weather, and how good you've got
  const biteMul = (kind) => {
    const h = game.sky?.hour ?? 12, rain = game.weather?.rain || 0, wk = game.weather?.kind;
    let m = (h > 5 && h < 8.5) || (h > 17.5 && h < 20.5) ? 0.6 : h > 11 && h < 15 ? 1.3 : h < 5 || h > 21 ? (kind === 'ocean' ? 1.1 : 0.85) : 1;
    if (rain > 0.2 || wk === 'overcast') m *= 0.75;
    if (wk === 'storm') m *= 1.4;
    return m * Math.max(0.7, 1 - (P.stats.fishCaught || 0) * 0.002);
  };
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
    items: (t) => t === 'sell' ? Object.entries(P.fish).filter(([, f]) => f && f.lb > 0).map(([k, f]) => ({ k, ...f }))
      : [...Object.entries(P.fishLog).map(([k, v]) => ({ k, ...v })), ...Object.values(LEGEND_FISH).filter((L) => !P.fishLog[L.name]).map((L) => ({ k: L.name, legendTip: true }))],
    row: (it, t) => t === 'sell' ? { name: `${it.k} × ${it.n}`, sub: `${it.lb.toFixed(1)} lb total${stale(it) ? ' · not fresh (half price)' : ''}`, stats: [], btn: `Sell ${money(it.lb * it.price * (stale(it) ? 0.5 : 1))}` }
      : it.legendTip ? { name: it.k, sub: 'Not yet caught. Talk at the docks says first or last light, and a serious rod.', stats: [], btn: '?', cls: 'own' }
      : { name: it.k, sub: `caught ${it.n}`, stats: [['Record', null, `${it.best.toFixed(1)} lb`]], btn: 'Logged', cls: 'own' },
    act: (it, t) => { if (t === 'sell') { career.earn(Math.round(it.lb * it.price * (stale(it) ? 0.5 : 1)), it.k); P.fish[it.k] = null; career.saveSoon(); } },
    // your catch on the counter
    model: (it) => {
      const lb = it.lb / Math.max(1, it.n || 1), big = lb > 12;
      const g = (/shark/i.test(it.k) && loaded(SHARK)) || loaded(big ? FISH_MODELS[0] : FISH_MODELS[1 + ((it.k.length) % (FISH_MODELS.length - 1))]) || loaded(FISH_MODELS[0]);
      return g ? instance(g, Math.min(1.6, 0.25 + Math.cbrt(lb || 1) * 0.22)) : null;
    }, key: (it) => it.k,
  });
  // a catch more than two days old fetches half
  function stale(it) { return it.day != null && (game.sky?.day ?? 0) - it.day >= 2; }
  for (const m of game.marineAir?.marinas || []) interact.add({ x: m.land.x - 6, z: m.land.z + 4, label: () => `${keyHint(game)} sell your catch`, color: 0x60c0ff, blip: { color: '#60c0ff', size: 4, icon: '🐟', badge: 'S' }, use: () => market.show('sell') });

  FISH_MODELS.forEach(loadOpen); loadOpen(SHARK);
  let trophy = null, trophyT = 0;
  const showCatch = (f) => {
    if (trophy) scene.remove(trophy);
    const big = f.lb > 8;
    const g = (/shark/i.test(f.name) && loaded(SHARK)) || loaded(big ? FISH_MODELS[0] : FISH_MODELS[1 + Math.floor(Math.random() * (FISH_MODELS.length - 1))]) || loaded(FISH_MODELS[0]);
    if (!g) return;
    trophy = instance(g, Math.min(1.6, 0.25 + Math.cbrt(f.lb) * 0.22));
    trophy.rotation.z = Math.PI / 2;
    scene.add(trophy); trophyT = 3;
  };
  const stop = (msg) => { st = null; line.visible = bobber.visible = rod.visible = false; if (msg) hud.toast(msg, 1.8); };

  return {
    market, legends: LEGEND_FISH, biteMul, get state() { return st; },
    update(dt, a, free) {
      if (trophy) {
        trophyT -= dt;
        trophy.position.set(player.pos.x + Math.sin(player.heading) * 0.6, player.pos.y + 1.25, player.pos.z + Math.cos(player.heading) * 0.6);
        trophy.rotation.y = player.heading + Math.PI / 2;
        if (trophyT <= 0) { scene.remove(trophy); trophy = null; }
      }
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
          const kind = waterKind(spot.x, spot.z);
          st = { phase: 'wait', t: (6 + Math.random() * 14) / (1 + rodTier * 0.05) / (game.tools.best('finder') ? 1.5 : 1) * biteMul(kind), spot, kind, progress: 0, tension: 0, home: { x: spot.x, z: spot.z } };
          rod.visible = line.visible = bobber.visible = true;
          bobber.position.set(spot.x, spot.y + 0.03, spot.z);
          st.castT = onBoat ? 0 : 0.85; // (A2) back over the shoulder, then the cast
          if (!st.castT) game.splashes?.splash(spot.x, spot.z, 0.05); // the plop of the bobber landing
          return '';
        }
        return onBoat ? `Press H to cast a line (${waterKind(spot.x, spot.z)})` : `${keyHint(game)} cast a line (${waterKind(spot.x, spot.z)} fishing)`;
      }
      // rod in hand, line to the bobber
      const hx = player.pos.x + Math.sin(player.heading) * 0.4, hz = player.pos.z + Math.cos(player.heading) * 0.4;
      const base = onBoat ? boat.pos : player.pos;
      rod.position.set(onBoat ? base.x : hx, base.y + 1.0, onBoat ? base.z : hz);
      // the rod bows as the line comes tight; the tip dips on a bite
      const bend = st.phase === 'reel' ? Math.min(1, st.tension) * 0.55 : st.phase === 'bite' ? 0.25 : 0;
      let castA = 0;
      if (st.castT > 0) { // (A2) the cast: back over the shoulder, then forward; the bobber lands at the end
        const k = 1 - st.castT / 0.85; castA = k < 0.4 ? 1.7 * (k / 0.4) : 1.7 * (1 - (k - 0.4) / 0.6);
        st.castT -= dt; bobber.visible = st.castT <= 0.12;
        if (st.castT <= 0) { st.castT = 0; game.splashes?.splash(st.spot.x, st.spot.z, 0.05); }
      }
      rod.rotation.set(-0.9 + bend + castA, player.heading, 0, 'YXZ');
      // (A2) in your hands: the butt in the right hand at your hip, the left hand up the rod; the right
      // hand turns the reel while you reel in
      if (!onBoat && game.S.mode === 'foot' && game.gunPose?.ok) {
        const P = game.gunPose; player.h.root.updateMatrixWorld(true); const F = P.frame(player.heading);
        const reeling = st.phase === 'reel' && (game.input.keys.has('KeyF') || game.input.keys.has('KeyH') || a.sprint), T = performance.now() * 0.012;
        const butt = F.chest.clone().addScaledVector(F.fw, 0.3).addScaledVector(F.up, -0.24).addScaledVector(F.right, 0.08);
        rod.position.copy(butt);
        rod.updateMatrixWorld(true);
        const axis = new THREE.Vector3(0, 1, 0).applyEuler(rod.rotation);
        P.reach(P.R, reeling ? butt.clone().addScaledVector(axis, 0.12).addScaledVector(F.right, 0.07 + Math.cos(T) * 0.04).addScaledVector(F.up, Math.sin(T) * 0.04) : butt, F, 'R');
        P.reach(P.L, butt.clone().addScaledVector(axis, 0.42), F, 'L');
      }
      rod.scale.set(1, 1 - bend * 0.12, 1);
      const tip = new THREE.Vector3(0, 2.2, 0).applyEuler(rod.rotation).multiplyScalar(1 - bend * 0.12).add(rod.position);
      st.t -= dt;
      // a hooked fish runs left and right and comes in as you reel
      if (st.phase === 'reel') {
        const T = performance.now() * 0.001, run = Math.sin(T * 0.9 * (1 + st.fight * 0.2)) * Math.min(2.2, 0.6 + st.fight * 0.5) * (1 - st.progress);
        const hx = st.home.x - tip.x, hz = st.home.z - tip.z, L = Math.hypot(hx, hz) || 1;
        bobber.position.x = tip.x + hx * (1 - st.progress * 0.75) + (-hz / L) * run;
        bobber.position.z = tip.z + hz * (1 - st.progress * 0.75) + (hx / L) * run;
      }
      const bob = st.phase === 'bite' ? Math.sin(performance.now() * 0.03) * 0.06 - 0.05 : st.phase === 'reel' ? Math.sin(performance.now() * 0.02) * 0.04 - 0.04 : Math.sin(performance.now() * 0.003) * 0.015;
      bobber.position.y = st.spot.y + 0.03 + bob;
      // the line sags between the tip and the water, less as it comes tight
      const sag = st.phase === 'reel' ? 0.25 * (1 - Math.min(1, st.tension)) : 0.6;
      const pts = [];
      for (let i = 0; i <= 10; i++) { const k = i / 10; pts.push(new THREE.Vector3().lerpVectors(tip, bobber.position, k).setY(tip.y + (bobber.position.y - tip.y) * k - Math.sin(k * Math.PI) * sag * tip.distanceTo(bobber.position) * 0.12)); }
      line.geometry.setFromPoints(pts);
      if (game.S.mode === 'foot' && Math.hypot(player.vel?.x || 0, player.vel?.z || 0) > 1) { stop('Line reeled in'); return ''; }
      const held = game.input.keys.has('KeyF') || game.input.keys.has('KeyH') || a.sprint;
      const reelKey = st.phase === 'bite' ? (a.enter || a.horn || held) : held;
      // the bobber stirs the surface: a nibble, the bite, the fish fighting the line
      st.ring = (st.ring || 0) - dt;
      if (st.ring <= 0 && st.phase !== 'wait') { st.ring = st.phase === 'bite' ? 0.25 : 0.4; game.splashes?.disturb(bobber.position.x, bobber.position.z, st.phase === 'bite' ? 0.45 : 0.6, 1.2); }
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
          st.phase = 'reel'; st.fish = { name: f[0], lb, price: f[3], min: keepMin(f) }; st.fight = 0.5 + Math.min(lb / 60, 2.5);
          // now and then, the one everybody talks about (better at first and last light, on a good rod)
          const L = LEGEND_FISH[st.kind], h = game.sky?.hour ?? 12;
          if (L && !P.legendFish[L.id] && rodTier >= 4 && Math.random() < 0.015 * ((h > 5 && h < 8.5) || (h > 17.5 && h < 20.5) ? 2.5 : 1)) {
            st.fish = { name: L.name, lb: L.lb[0] + Math.random() * (L.lb[1] - L.lb[0]), price: L.price, legend: L.id, min: 0 }; st.fight = L.fight;
            hud.toast('Something enormous has the bait…', 2.4);
          }
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
        const log = P.fishLog[f.name] || { n: 0, best: 0 }, record = log.n > 0 && f.lb > log.best;
        log.n++; log.best = Math.max(log.best, f.lb); P.fishLog[f.name] = log;
        P.stats.fishCaught++;
        if (f.lb < f.min) {
          game.hud.bigMessage('RELEASED', `${f.name} · ${f.lb.toFixed(1)} lb is under the size limit`, 2.2);
          game.splashes?.splash(bobber.position.x, bobber.position.z, 0.2);
          career.saveSoon(); stop(); return '';
        }
        const cur = P.fish[f.name] || { n: 0, lb: 0, price: f.price };
        cur.n++; cur.lb += f.lb; cur.day = Math.min(cur.day ?? 1e9, game.sky?.day ?? 0); P.fish[f.name] = cur;
        if (f.legend) { P.legendFish[f.legend] = Date.now(); cur.price = f.price * 3; }
        game.hud.bigMessage(f.legend ? 'LEGENDARY CATCH' : record ? 'NEW RECORD!' : 'CAUGHT!', `${f.name} · ${f.lb.toFixed(1)} lb`, f.legend ? 4 : 2.5);
        showCatch(f);
        career.saveSoon();
        stop();
        return '';
      }
      const bar = (v) => '█'.repeat(Math.round(v * 10)).padEnd(10, '░');
      return `Reel (hold F / sprint): ${bar(st.progress)}  Tension: ${bar(Math.min(1, st.tension))}`;
    },
  };
}
