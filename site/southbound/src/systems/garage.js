// Dealerships, custom shops and the player's garage.
//  - Gulfstar Autos (city) and Mill Creek Motors (town): buy any of the 93 cars
//  - Calvera Customs (city + town): drive in to fit any of the 63 parts or paint
//  - Owned cars are saved and can be delivered from the phone menu
import { LAND, CLASS_LIST, UPGRADES, PAINTS, applyUpgrades } from '../assets/catalog.js';
import { VEHICLES } from '../assets/library.js';
import * as THREE from 'three';
import { CITY, TOWN } from '../world/layout.js';
import { ShopUI } from '../ui/shop.js';
import { nearestRoad, spawnParked, money, keyHint } from './world-util.js';
import { Vehicle } from '../entities/vehicle.js';

export function installGarage(game) {
  const { career, interact, hud } = game;
  const P = career.p;
  game.applyUpgrades = applyUpgrades;
  let uidN = Date.now() % 100000;

  const ownedOf = (v) => P.garage.find((g) => g.uid === v.uid);
  const addToGarage = (type, up = {}) => { const g = { uid: `v${uidN++}`, cat: 'car', type, up }; P.garage.push(g); career.saveSoon(); return g; };

  // a car for the showroom stand (ui/shop.js): its own model, with any parts and paint on it
  const carPreview = (type, up) => {
    const v = new Vehicle(game.lib, type);
    if (up) applyUpgrades(v, up);
    v.night = 0; v.sync(0);
    v.group.userData.dispose = () => v.dispose();
    return v.group;
  };
  game.carPreview = carPreview;

  // ---------------- dealership ----------------
  let lot = null;
  // your own cars: lost one (left it somewhere, sunk it, got it towed, blew it up)? the dealer
  // brings it round to the lot, with its parts and paint, at no charge
  const mine = () => P.garage.filter((g) => (g.cat || 'car') === 'car' && LAND.some((m) => m.id === g.type));
  const whereIs = (g) => game.parked.find((v) => v.uid === g.uid) || (game.S.vehicle?.uid === g.uid ? game.S.vehicle : null);
  const fetchCar = (g) => {
    const v0 = whereIs(g);
    if (v0 && v0 === game.S.vehicle) { hud.toast('You\'re sitting in it', 1.6); return null; }
    if (v0) { const i = game.parked.indexOf(v0); if (i >= 0) game.parked.splice(i, 1); game.scene.remove(v0.group); v0.dispose?.(); if (game.S.lastVehicle === v0) game.S.lastVehicle = null; }
    const v = spawnParked(game, g.type, lot.x, lot.z, lot.h, g.up);
    v.uid = g.uid;
    game.S.lastVehicle = v;
    return v;
  };
  game.fetchOwnedCar = fetchCar;
  const dealer = new ShopUI({
    title: 'Gulfstar Autos', tabs: [{ k: 'mine', label: 'Your cars' }, ...CLASS_LIST.filter((c) => c !== 'Emergency').map((c) => ({ k: c, label: c }))],
    getMoney: () => career.money, pause: game.pause,
    note: (t) => t === 'mine' ? (mine().length ? 'Lost a car? We\'ll bring it round to the lot outside, parts and paint and all. No charge.' : 'You don\'t own a car yet. Pick one from the other tabs.') : `${LAND.length} models in the catalog. Bought cars are delivered to the lot outside and saved to your garage.`,
    items: (cls) => cls === 'mine' ? mine() : LAND.filter((m) => m.cls === cls && !m.restricted),
    row: (m, t) => {
      if (t === 'mine' || m.uid) {
        const spec = LAND.find((x) => x.id === m.type) || { name: m.type, cls: '' };
        const v = whereIs(m), d = v ? Math.round(v.pos.distanceTo(game.player.pos)) : null;
        return { name: spec.name, sub: v ? (d < 40 ? 'parked right here' : `parked ${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m'} away`) : 'not on the road: lost or towed', stats: [], btn: 'Bring it round', cls: '',
          desc: `Your ${spec.name}${Object.keys(m.up || {}).length ? ', with its parts and paint' : ''}. The lot staff fetch it and leave it outside.` };
      }
      const h = VEHICLES[m.id];
      const owned = P.garage.some((g) => g.type === m.id);
      return {
        name: m.name, sub: `${m.cls}${owned ? ' · owned' : ''}`,
        stats: [['Speed', h.top / 90, `${Math.round(h.top * 2.237)} mph`], ['Accel', h.accel / 16], ['Grip', h.grip / 11]],
        btn: money(m.price), cls: owned ? 'own' : '',
        desc: m.desc || `${m.name}: a ${m.cls.toLowerCase()} car. Top speed ${Math.round(h.top * 2.237)} mph.`,
      };
    },
    model: (m) => (m.uid ? carPreview(m.type, m.up) : carPreview(m.id)), key: (m) => m.uid || m.id,
    act: (m) => {
      if (m.uid) { const v = fetchCar(m); if (v) { hud.toast(`Your ${v.spec?.name || 'car'} is waiting outside`, 3); career.saveSoon(); } return; }
      if (!career.spend(m.price)) return;
      const g = addToGarage(m.id);
      const v = spawnParked(game, m.id, lot.x, lot.z, lot.h);
      v.uid = g.uid;
      hud.toast(`${m.name} is waiting outside`, 3);
      career.save();
    },
  });

  // ---------------- custom shop ----------------
  let shopCar = null;
  const groups = [...new Set(UPGRADES.map((u) => u.group))];
  const customs = new ShopUI({
    title: 'Calvera Customs',
    tabs: [{ k: 'perf', label: 'Performance' }, { k: 'look', label: 'Looks' }, { k: 'paint', label: 'Paint' }, { k: 'repair', label: 'Repair' }],
    getMoney: () => career.money, pause: game.pause,
    note: (t) => shopCar ? `${shopCar.spec.name} — ${t === 'perf' ? '48 performance parts' : t === 'look' ? '15 visual parts' : t === 'paint' ? `${PAINTS.length} colours` : 'fix body damage'}. Fitting a part registers the car to you.` : '',
    items: (t) => t === 'paint' ? PAINTS : t === 'repair' ? [{ repair: true }, { wash: true }] : UPGRADES.filter((u) => u.kind === t),
    row: (it, t) => {
      const g = shopCar && ownedOf(shopCar);
      const up = g ? g.up : {};
      if (t === 'paint') return { name: it[0], sub: it[2] > 0.5 ? 'metallic' : 'solid', stats: [], btn: money(500), cls: '' };
      if (t === 'repair' && it.wash) return { name: 'Car wash', sub: shopCar ? `${Math.round((shopCar.dirt || 0) * 100)}% dirty` : 'drive a car in first', stats: [], btn: money(15), cls: shopCar ? '' : 'dis' };
      if (t === 'repair') return shopCar ? { name: 'Full repair', sub: `Body ${Math.round(shopCar.health)}/${shopCar.maxHealth}`, stats: [], btn: money(250) } : { name: 'Full repair', sub: 'drive a car into the shop first', stats: [], btn: '—', cls: 'dis' };
      const fitted = it.kind === 'perf' ? (up[it.group] || 0) >= it.tier : matchesLook(up, it);
      const stats = it.kind === 'perf' ? Object.entries(it.fx).map(([k, v]) => [k, null, `${k === 'armor' ? '+' + v * it.tier : k === 'ride' ? `${Math.round(v * it.tier * 100)} cm` : '+' + Math.round(v * it.tier * 100) + '%'}`]) : [];
      return { name: it.name, sub: it.group, stats, btn: fitted ? 'Fitted' : money(it.price), cls: fitted ? 'own' : '' };
    },
    // your car on the stand, wearing the paint or part you're looking at
    model: (it, t) => {
      if (!shopCar) return null;
      const up = { ...(ownedOf(shopCar)?.up || {}) };
      if (t === 'paint') up.paint = [...it[1], it[2]];
      else if (t === 'look') Object.assign(up, it.fx);
      else if (t === 'perf') up[it.group] = Math.max(up[it.group] || 0, it.tier);
      return carPreview(shopCar.type, up);
    },
    key: (it) => (Array.isArray(it) ? it[0] : it.name || 'repair') + '|' + (shopCar?.uid || shopCar?.type || ''),
    act: (it, t) => {
      if (!shopCar) return;
      let g = ownedOf(shopCar);
      if (it.wash) { if (career.spend(15)) { shopCar.dirt = 0; hud.toast('Washed and dried', 1.6); } return; }
      const price = t === 'paint' ? 500 : t === 'repair' ? 250 : it.price;
      if (t === 'perf' && g && (g.up[it.group] || 0) >= it.tier) return;
      if (!career.spend(price)) return;
      if (t === 'repair') { shopCar.health = shopCar.maxHealth; shopCar.wrecked = false; shopCar.dmg = null; shopCar.flats = false; return; } // (new tyres too, if a stinger got them)
      if (!g) { g = addToGarage(shopCar.type); shopCar.uid = g.uid; hud.toast('Car registered to you', 2); }
      if (t === 'paint') g.up.paint = [...it[1], it[2]];
      else if (it.kind === 'perf') g.up[it.group] = it.tier;
      else Object.assign(g.up, it.fx);
      applyUpgrades(shopCar, g.up);
      career.saveSoon();
    },
  });
  const matchesLook = (up, it) => Object.entries(it.fx).every(([k, v]) => up[k] === v);
  void groups;

  // ---------------- locations ----------------
  const place = (x, z) => nearestRoad(game.graph, x, z) || { x, z, tx: 1, tz: 0 };
  const cityDealer = { x: CITY.x0 - 34, z: CITY.z0 + 4 * CITY.pitch - 8 };
  lot = (() => { const r = place(cityDealer.x + 8, cityDealer.z); return { x: r.x, z: r.z, h: Math.atan2(r.tx, r.tz) }; })();
  interact.add({ x: cityDealer.x, z: cityDealer.z, label: () => `${keyHint(game)} browse Gulfstar Autos (93 cars)`, color: 0x40c0ff, blip: { color: '#40c0ff', size: 5, global: true, icon: '🚗', badge: 'S' }, use: () => dealer.show(null, 'Gulfstar Autos') });
  const townDealer = { x: TOWN.x0 - 22, z: TOWN.z0 + TOWN.pitch };
  interact.add({ x: townDealer.x, z: townDealer.z, label: () => `${keyHint(game)} browse Mill Creek Motors`, color: 0x40c0ff, blip: { color: '#40c0ff', size: 5, global: true, icon: '🚗', badge: 'S' },
    use: () => { const r = place(townDealer.x + 6, townDealer.z); lot = { x: r.x, z: r.z, h: Math.atan2(r.tx, r.tz) }; dealer.show(null, 'Mill Creek Motors'); } });
  for (const [x, z, name] of [[CITY.x0 + 2 * CITY.pitch, CITY.z0 + CITY.nz * CITY.pitch - 8, 'Calvera Customs'], [TOWN.x0 + 2 * TOWN.pitch, TOWN.z0 - 6, 'Calvera Customs · Mill Creek']]) {
    const r = place(x, z);
    // a real workshop beside the road: you drive in through the open bay
    const bay = buildWorkshop(game, r, name);
    const at = bay || r;
    interact.add({ x: at.x, z: at.z, r: bay ? 3.6 : 4.5, drive: true, marker: false, label: name, color: 0xff60c0, blip: { color: '#ff60c0', size: 5, global: true, icon: '🔧', badge: 'S' },
      use: () => { shopCar = game.vehicle(); if (shopCar) customs.show('perf', name); } });
  }

  // re-apply saved upgrades to any owned car the player gets into
  return {
    dealer, customs,
    deliver(g) {
      const pp = game.player.pos;
      const r = nearestRoad(game.graph, pp.x, pp.z) || { x: pp.x + 4, z: pp.z, tx: 1, tz: 0 };
      const v = spawnParked(game, g.type, r.x + r.tz * 3, r.z - r.tx * 3, Math.atan2(r.tx, r.tz), g.up);
      v.uid = g.uid;
      hud.toast(`${VEHICLES[g.type]?.name || g.type} delivered nearby`, 2.5);
      return v;
    },
    update() {},
  };
}

// Open-fronted workshop (axis-aligned so its walls are solid), facing the road
function buildWorkshop(game, r, name) {
  const { collision, hm, scene } = game;
  const W = 10, D = 13, H = 4.6, t = 0.3;
  // face the road along the nearest axis, on whichever side is clear
  const ax = Math.abs(r.tx) > Math.abs(r.tz) ? [0, 1] : [1, 0];
  for (const sgn of [1, -1]) {
    const nx = ax[0] * sgn, nz = ax[1] * sgn;
    const off = 8 + D / 2;
    const cx = r.x + nx * off, cz = r.z + nz * off;
    const hw = (nx ? D : W) / 2, hd = (nx ? W : D) / 2;
    let blocked = false;
    collision.query(cx, cz, Math.max(hw, hd) + 2, (it) => { if (it.t === 0 && cx + hw > it.minX && cx - hw < it.maxX && cz + hd > it.minZ && cz - hd < it.maxZ) blocked = true; });
    const ys = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => hm.height(cx + a * hw, cz + b * hd));
    if (blocked || Math.max(...ys) - Math.min(...ys) > 1.5 || Math.min(...ys) < hm.waterLevel(cx, cz) + 0.5) continue;
    const y = Math.max(...ys) + 0.05;
    game.veg?.clearRect?.(cx - hw - 3, cz - hd - 3, cx + hw + 3, cz + hd + 3);
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    g.rotation.y = Math.atan2(-nx, -nz); // open side (+z local) faces the road
    // (G14) real surfaces, not flat paint: painted concrete-block walls, a concrete floor (the photo-scanned
    // library the buildings use, tiled at their real size by the box's UVs below)
    const S = game.surf, tex = (k, m) => S?.[k]?.[m] || null;
    const mWall = new THREE.MeshStandardMaterial({ color: 0xe6dfd2, map: tex('concrete', 'color'), normalMap: tex('concrete', 'normal'), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.88 });
    const mRoof = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6, metalness: 0.4 });
    const mFloor = new THREE.MeshStandardMaterial({ color: 0x9a968e, map: tex('concrete', 'color'), normalMap: tex('concrete', 'normal'), roughness: 0.8 });
    const TILE = 2.5;
    const tileUV = (geo, w, h, d) => { // BoxGeometry faces: +x,-x (d x h), +y,-y (w x d), +z,-z (w x h)
      const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let i = 0; i < uv.count; i++) { const [a, b] = dims[Math.floor(i / 4)] || [1, 1]; uv.setXY(i, uv.getX(i) * a / TILE, uv.getY(i) * b / TILE); }
      return geo;
    };
    const mTrim = new THREE.MeshStandardMaterial({ color: 0xc23a6e, roughness: 0.5 });
    const box = (w, h, d, x, yy, z, m) => { const b = new THREE.Mesh(m.map ? tileUV(new THREE.BoxGeometry(w, h, d), w, h, d) : new THREE.BoxGeometry(w, h, d), m); b.position.set(x, yy, z); b.castShadow = b.receiveShadow = true; b.userData.hitStatic = true; g.add(b); return b; };
    box(W, 1, D + 3, 0, -0.55, 1.5, mFloor); // floor + apron toward the road
    box(W + t * 2, H, t, 0, H / 2, -D / 2, mWall); // back
    box(t, H, D, -W / 2, H / 2, 0, mWall); box(t, H, D, W / 2, H / 2, 0, mWall); // sides
    box(W + t * 2 + 0.6, 0.25, D + 0.8, 0, H + 0.12, 0.2, mRoof); // roof
    box(W + t * 2, 0.9, 0.4, 0, H - 0.45, D / 2, mTrim); // header over the open bay
    // roll-up door, rolled up
    box(W - 0.4, 0.5, 0.5, 0, H - 1.0, D / 2 - 0.3, mRoof);
    // sign
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const x2 = c.getContext('2d'); x2.fillStyle = '#1a1a1d'; x2.fillRect(0, 0, 512, 96); x2.fillStyle = '#ff70b0'; x2.font = 'bold 54px Oswald, Impact, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(name.split(' · ')[0].toUpperCase(), 256, 50);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), emissive: 0xffffff, emissiveIntensity: 0.25, emissiveMap: null }));
    sign.material.map.colorSpace = THREE.SRGBColorSpace;
    sign.position.set(0, H - 0.45, D / 2 + 0.21); g.add(sign);
    // workshop light
    const lamp = new THREE.PointLight(0xfff0d8, 8, 14, 2); lamp.position.set(0, H - 0.6, 0); g.add(lamp);
    scene.add(g);
    g.updateMatrixWorld(true);
    // solid walls (world-axis boxes)
    const wb = (lx0, lz0, lx1, lz1) => {
      const p0 = new THREE.Vector3(lx0, 0, lz0).applyMatrix4(g.matrixWorld), p1 = new THREE.Vector3(lx1, 0, lz1).applyMatrix4(g.matrixWorld);
      collision.addBox(Math.min(p0.x, p1.x), Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), Math.max(p0.z, p1.z), y - 1, y + H, { workshop: true });
    };
    // level floor you drive onto
    { const p0 = new THREE.Vector3(-W / 2, 0, -D / 2).applyMatrix4(g.matrixWorld), p1 = new THREE.Vector3(W / 2, 0, D / 2 + 3).applyMatrix4(g.matrixWorld);
      collision.addBox(Math.min(p0.x, p1.x), Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), Math.max(p0.z, p1.z), y - 2, y - 0.05, { walkable: true }); }
    wb(-W / 2 - t, -D / 2 - t / 2, W / 2 + t, -D / 2 + t / 2);
    wb(-W / 2 - t / 2, -D / 2, -W / 2 + t / 2, D / 2);
    wb(W / 2 - t / 2, -D / 2, W / 2 + t / 2, D / 2);
    const inside = new THREE.Vector3(0, 0, -1).applyMatrix4(g.matrixWorld);
    return { x: inside.x, z: inside.z };
  }
  return null;
}
