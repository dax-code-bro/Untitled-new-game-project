// Marinas (16 boats, 98 boat upgrades) and Redgrass Airfield (11 aircraft, 17 upgrades).
import * as THREE from 'three';
import { BOATS, BOAT_UPGRADES, Boat, AIRCRAFT, AIR_UPGRADES, Aircraft } from '../entities/craft.js';
import { LAKE, CITY, BAYOU, AIRFIELD, coastZ } from '../world/layout.js';
import { ShopUI } from '../ui/shop.js';
import { money, keyHint } from './world-util.js';

export function installMarineAir(game) {
  const { career, interact, hud, hm, scene } = game;
  const P = career.p;
  let uidN = Date.now() % 100000 + 50000;

  // ---- find a shoreline: walk from a water point toward land
  const shore = (wx, wz, lx, lz) => {
    let water = null;
    for (let t = 0; t <= 1; t += 0.005) {
      const x = wx + (lx - wx) * t, z = wz + (lz - wz) * t;
      const deep = hm.waterLevel(x, z) - hm.height(x, z);
      if (deep > 1.4) water = { x, z };
      if (deep < -0.4 && water) return { land: { x, z }, water, dir: Math.atan2(wx - lx, wz - lz) };
    }
    return null;
  };
  const marinas = [
    { name: 'Lake Arden Marina', ...shore(LAKE.x, LAKE.z, LAKE.x + LAKE.r * 2, LAKE.z + 120) },
    { name: 'Port Calvera Harbor', ...shore(CITY.x0 + 3 * CITY.pitch, coastZ(CITY.x0 + 3 * CITY.pitch) + 140, CITY.x0 + 3 * CITY.pitch, CITY.z0 + CITY.nz * CITY.pitch - 40) },
    { name: 'Bayou Verde Landing', ...shore(BAYOU.x, BAYOU.z + 300, BAYOU.x + 260, BAYOU.z - 80) },
  ].filter((m) => m.land);

  // wooden pier from the bank into the water at each marina
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.85 });
  for (const m of marinas) {
    const dx = m.water.x - m.land.x, dz = m.water.z - m.land.z, L = Math.hypot(dx, dz) + 6;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, L), wood);
    pier.position.set((m.land.x + m.water.x) / 2, hm.waterLevel(m.water.x, m.water.z) + 0.6, (m.land.z + m.water.z) / 2);
    pier.rotation.y = Math.atan2(dx, dz);
    pier.castShadow = pier.receiveShadow = true;
    pier.userData.hitStatic = true; pier.userData.surf = 'wood';
    scene.add(pier);
    // walkable deck, as a chain of small boxes along the pier
    const top = pier.position.y + 0.15;
    for (let t = 0; t <= L; t += 1.5) {
      const x = m.land.x + (dx / (L - 6)) * (t - 3), z = m.land.z + (dz / (L - 6)) * (t - 3);
      game.collision.addBox(x - 1.4, z - 1.4, x + 1.4, z + 1.4, top - 0.3, top, { walkable: true });
    }
    m.pierEnd = { x: m.water.x + Math.sin(Math.atan2(dx, dz)) * 2, z: m.water.z + Math.cos(Math.atan2(dx, dz)) * 2 };
  }

  // ---- runway markings + hangar
  {
    const y = AIRFIELD.height + 0.06, white = new THREE.MeshBasicMaterial({ color: 0xdedcd2 });
    const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(14, 0.04, 0.6), white, 40);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let x = AIRFIELD.x0 + 40; x < AIRFIELD.x1 - 40 && n < 30; x += 22) { m4.makeTranslation(x, y, AIRFIELD.z); dash.setMatrixAt(n++, m4); }
    for (let k = -5; k <= 5; k++) for (const x of [AIRFIELD.x0 + 14, AIRFIELD.x1 - 14]) if (n < 40 && k !== 0) { m4.compose(new THREE.Vector3(x, y, AIRFIELD.z + k * 2.6), new THREE.Quaternion(), new THREE.Vector3(1.4, 1, 1.6)); dash.setMatrixAt(n++, m4); }
    dash.count = n;
    scene.add(dash);
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(40, 12, 28), new THREE.MeshStandardMaterial({ color: 0x8a8c88, roughness: 0.6, metalness: 0.5 }));
    hangar.position.set(AIRFIELD.x1 - 60, AIRFIELD.height + 6, AIRFIELD.z - 80);
    hangar.castShadow = hangar.receiveShadow = true;
    hangar.userData.hitStatic = true; hangar.userData.surf = 'metal';
    scene.add(hangar);
    game.collision.addBox?.(hangar.position.x, hangar.position.z, 20, 14);
  }
  const airSpawn = { x: AIRFIELD.x1 - 90, z: AIRFIELD.z, h: -Math.PI / 2 };
  const heliPad = { x: AIRFIELD.x1 - 40, z: AIRFIELD.z - 40, h: -Math.PI / 2 };

  const spawnCraft = (entry, cat, at, up) => {
    const v = cat === 'boat' ? new Boat(entry, game.q) : new Aircraft(entry, game.q);
    if (up) v.upgrade(up);
    v.pos.set(at.x, cat === 'boat' ? hm.waterLevel(at.x, at.z) : hm.height(at.x, at.z), at.z);
    v.heading = at.h ?? 0; v.sync(0);
    scene.add(v.group); game.parked.push(v);
    return v;
  };
  const nearestMarina = () => {
    const p = game.player.pos;
    return marinas.reduce((a, m) => (Math.hypot(m.land.x - p.x, m.land.z - p.z) < Math.hypot(a.land.x - p.x, a.land.z - p.z) ? m : a), marinas[0]);
  };
  let activeMarina = marinas[0];
  const boatSpot = (m) => { const a = Math.atan2(m.water.x - m.land.x, m.water.z - m.land.z); return { x: m.pierEnd.x + Math.cos(a) * 4.5, z: m.pierEnd.z - Math.sin(a) * 4.5, h: a }; };
  const lastOwned = (cat) => {
    const v = game.vehicle();
    if (v && v.uid && ((cat === 'boat' && v.isBoat) || (cat === 'air' && v.isAir))) return P.garage.find((g) => g.uid === v.uid);
    return [...P.garage].reverse().find((g) => g.cat === cat);
  };

  const makeShop = (cat, title, catalog, upgrades) => new ShopUI({
    title, getMoney: () => career.money, pause: game.pause,
    tabs: [{ k: 'buy', label: cat === 'boat' ? `Boats (${catalog.length})` : `Aircraft (${catalog.length})` }, { k: 'up', label: `Upgrades (${upgrades.length})` }, { k: 'mine', label: 'My fleet' }],
    note: (t) => t === 'up' ? (lastOwned(cat) ? `Fitting to: ${catalog.find((c) => c.id === lastOwned(cat).type)?.name}` : `Buy a ${cat === 'boat' ? 'boat' : 'plane'} first.`) : t === 'mine' ? 'Bring any of your own out of storage.' : '',
    items: (t) => t === 'buy' ? catalog.filter((c) => !c.restricted) : t === 'up' ? upgrades : P.garage.filter((g) => g.cat === cat),
    row: (it, t) => {
      if (t === 'mine') { const e = catalog.find((c) => c.id === it.type); return { name: e.name, sub: 'owned', stats: [], btn: 'Launch' }; }
      if (t === 'up') { const g = lastOwned(cat), have = g && (g.up[it.group] || 0) >= it.tier; return { name: it.name, sub: it.group, stats: Object.entries(it.fx).map(([k, v]) => [k, null, typeof v === 'number' && v < 1 ? `+${Math.round(v * it.tier * 100)}%` : `+${v}`]), btn: have ? 'Fitted' : money(it.price), cls: have ? 'own' : '' }; }
      return { name: it.name, sub: it.type, stats: [], btn: money(it.price), cls: P.garage.some((g) => g.type === it.id) ? 'own' : '' };
    },
    act: (it, t) => {
      if (t === 'up') {
        const g = lastOwned(cat);
        if (!g || (g.up[it.group] || 0) >= it.tier || !career.spend(it.price)) return;
        g.up[it.group] = it.tier;
        const v = game.parked.find((p) => p.uid === g.uid) || (game.vehicle()?.uid === g.uid ? game.vehicle() : null);
        if (v) v.upgrade(g.up);
        career.saveSoon();
        return;
      }
      if (t === 'buy' && !career.spend(it.price)) return;
      const entry = t === 'buy' ? it : catalog.find((c) => c.id === it.type);
      let g = it;
      if (t === 'buy') { g = { uid: `c${uidN++}`, cat, type: it.id, up: {} }; P.garage.push(g); career.save(); }
      const at = cat === 'boat' ? boatSpot(activeMarina) : (AIRCRAFT.find((a) => a.id === entry.id).type.startsWith('heli') ? heliPad : airSpawn);
      const v = spawnCraft(entry, cat, at, g.up);
      v.uid = g.uid;
      hud.toast(`${entry.name} is ready ${cat === 'boat' ? 'at the end of the pier' : 'on the ' + (v.heli ? 'helipad' : 'runway')}`, 3);
      game.pause(false);
    },
  });
  const boatShop = makeShop('boat', 'Marine Sales & Service', BOATS, BOAT_UPGRADES);
  const airShop = makeShop('air', 'Redgrass Airfield · Aircraft', AIRCRAFT, AIR_UPGRADES);

  for (const m of marinas) {
    interact.add({ x: m.land.x, z: m.land.z, label: () => `${keyHint(game)} visit ${m.name} (boats)`, color: 0x40e0d0, blip: { color: '#40e0d0', size: 5, global: true, icon: '⚓', badge: 'S' },
      use: () => { activeMarina = m; boatShop.show('buy', m.name); } });
  }
  interact.add({ x: AIRFIELD.x1 - 60, z: AIRFIELD.z - 62, label: () => `${keyHint(game)} visit the airfield office (aircraft)`, color: 0xa0a0ff, blip: { color: '#a0a0ff', size: 6, global: true, icon: '✈️', badge: 'S' }, use: () => airShop.show('buy') });

  // a couple of free boats and a plane to try at the start
  if (marinas[0]) spawnCraft(BOATS.find((b) => b.id === 'speedboat'), 'boat', boatSpot(marinas[0]));
  spawnCraft(AIRCRAFT.find((a) => a.id === 'skylark'), 'air', airSpawn);

  return {
    boatShop, airShop, marinas, nearestMarina,
    deliver(g) {
      if (g.cat === 'boat') return spawnCraft(BOATS.find((b) => b.id === g.type), 'boat', boatSpot(nearestMarina()), g.up);
      const e = AIRCRAFT.find((a) => a.id === g.type);
      return spawnCraft(e, 'air', e.type.startsWith('heli') ? heliPad : airSpawn, g.up);
    },
    spawnCraft,
  };
}
