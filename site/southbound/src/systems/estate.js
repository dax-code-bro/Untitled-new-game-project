// Every building can be entered, and 198 of them are for sale.
// Interiors are generated from the building (style, size, seed): homes,
// apartments, offices, stores, bars and warehouses, each with furniture,
// lights, walls and floors you can walk on. Each building's rooms live at their
// own spot high above the far corner of the map, so collisions never overlap.
import * as THREE from 'three';
import { CITY, TOWN, LAKE } from '../world/layout.js';
import { ShopUI } from '../ui/shop.js';
import { nearestRoad, money, keyHint } from './world-util.js';
import { loadOpen, loaded, instance, Q, K } from '../assets/open.js';

const STREETS = ['Bayou Ave', 'Magnolia St', 'Pelican Way', 'Cypress Ln', 'Harbor Blvd', 'Gulf St', 'Live Oak Dr', 'Calvera Ave', 'Sabine St', 'Pecan Ct', 'Mockingbird Ln', 'Levee Rd', 'Cotton Row', 'Shrimp Dock Rd', 'Heron Pl', 'Mission St'];
const TYPES = { 4: 'House', 2: 'Apartment', 5: 'Storefront', 3: 'Warehouse', 1: 'Office', 0: 'Penthouse' };
const INCOME = { Storefront: 0.012, Warehouse: 0.01, Office: 0.009 }; // share of price per game day

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function installEstate(game) {
  const { career, interact, hud, scene, collision, hm, player } = game;
  const P = career.p;
  const B = game.city.buildings;

  // ---------------- doors on every building ----------------
  const doors = B.map((b, i) => {
    const r = nearestRoad(game.graph, b.x, b.z);
    let nx = 0, nz = 1;
    if (r) { const dx = r.x - b.x, dz = r.z - b.z; if (Math.abs(dx) / b.w > Math.abs(dz) / b.d) nx = Math.sign(dx); else { nx = 0; nz = Math.sign(dz) || 1; } if (nx) nz = 0; }
    const x = b.x + nx * (b.w / 2 + 0.9), z = b.z + nz * (b.d / 2 + 0.9);
    return { i, b, x, z, nx, nz };
  });

  // ---------------- 198 properties ----------------
  const order = [4, 2, 5, 3, 1, 0];
  const props = [];
  const seen = new Set();
  for (const st of order) for (const d of doors) {
    if (props.length >= 198) break;
    if (d.b.style !== st || seen.has(d.i)) continue;
    seen.add(d.i);
    const r = rng(d.i * 977 + 13);
    const type = TYPES[st] || 'House';
    const inCity = d.b.x > CITY.x0 - 40 && d.b.x < CITY.x0 + CITY.nx * CITY.pitch + 40 && d.b.z > CITY.z0 - 40;
    const downtown = Math.hypot(d.b.x - CITY.downtown[0], d.b.z - CITY.downtown[1]) < 220;
    const area = d.b.w * d.b.d * Math.max(1, Math.min(d.b.h / 3.2, type === 'Penthouse' ? 1 : 4));
    const base = { House: 1400, Apartment: 2100, Storefront: 1700, Warehouse: 650, Office: 2600, Penthouse: 9000 }[type] || 1500;
    const price = Math.round((area * base * (inCity ? 1.2 : 0.75) * (downtown ? 1.6 : 1) * (0.85 + r() * 0.3)) / 1000) * 1000;
    const name = type === 'House' && Math.hypot(d.b.x - LAKE.x, d.b.z - LAKE.z) < LAKE.r * 1.6 ? `Lake Arden ${['Cabin', 'Cottage', 'Lodge'][props.length % 3]}`
      : `${100 + Math.floor(r() * 4800)} ${STREETS[Math.floor(r() * STREETS.length)]}${type === 'Apartment' ? ` · Apt ${1 + Math.floor(r() * 30)}` : ''}`;
    props.push({ id: `prop_${String(props.length + 1).padStart(3, '0')}`, door: d, type, name, price: Math.max(price, 18000), region: inCity ? 'Port Calvera' : d.b.x < TOWN.x0 + 400 && d.b.x > TOWN.x0 - 200 ? 'Mill Creek' : 'Countryside' });
  }
  const propByBuilding = new Map(props.map((p) => [p.door.i, p]));
  const owned = (p) => P.properties.includes(p.id);

  // ---------------- interiors ----------------
  const built = new Map();
  let inside = null, insidePoints = [];
  const IO = (i) => new THREE.Vector3(-1900 + (i % 24) * 70, 1400, -1900 + Math.floor(i / 24) * 70);
  const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const boxAt = (g, w, h, d, x, y, z, mat, solid, origin) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; g.add(m);
    if (solid) collision.addBox(origin.x + x - w / 2, origin.z + z - d / 2, origin.x + x + w / 2, origin.z + z + d / 2, origin.y + y, origin.y + y + h, solid === 'walk' ? { walkable: true } : null);
    return m;
  };

  function buildInterior(d) {
    const b = d.b, o = IO(d.i), r = rng(d.i * 31 + 7);
    const kind = { 4: 'home', 2: r() < 0.5 ? 'home' : 'apartment', 5: r() < 0.35 ? 'bar' : 'store', 3: 'warehouse', 1: 'office', 0: 'office' }[b.style] || 'home';
    const W = Math.max(9, Math.min(b.w - 1, kind === 'warehouse' ? 26 : 18)), D = Math.max(8, Math.min(b.d - 1, kind === 'warehouse' ? 22 : 14)), H = kind === 'warehouse' ? 7 : 3.2;
    const g = new THREE.Group(); g.position.copy(o);
    const wallC = [0xd8d0c0, 0xc9d3d8, 0xe6dccb, 0xb9c4b0, 0xd9c2b0, 0xf0ece4][Math.floor(r() * 6)];
    const floorC = kind === 'warehouse' ? 0x6d6d68 : kind === 'office' ? 0x4a4f55 : [0x7a5434, 0x8c6a46, 0x5c3f28, 0xb8b2a4][Math.floor(r() * 4)];
    const wallM = M(wallC, 0.9), floorM = M(floorC, kind === 'home' || kind === 'apartment' ? 0.45 : 0.8);
    boxAt(g, W + 0.4, 0.2, D + 0.4, 0, -0.2, 0, floorM, 'walk', o);
    boxAt(g, W + 0.4, 0.2, D + 0.4, 0, H, 0, M(0xf2f0ea, 0.9), false, o);
    boxAt(g, W + 0.4, H, 0.2, 0, 0, -D / 2 - 0.1, wallM, true, o);
    boxAt(g, W + 0.4, H, 0.2, 0, 0, D / 2 + 0.1, wallM, true, o);
    boxAt(g, 0.2, H, D, -W / 2 - 0.1, 0, 0, wallM, true, o);
    boxAt(g, 0.2, H, D, W / 2 + 0.1, 0, 0, wallM, true, o);
    // windows (glowing with daylight) and the front door
    const winM = new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0xbfd6ee, emissiveIntensity: 0.8, roughness: 0.1 });
    for (let x = -W / 2 + 2; x < W / 2 - 1.5; x += 3.2) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), winM); w.position.set(x, 1.6, -D / 2 + 0.01); g.add(w); }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), M(0x3a2a1c, 0.6)); door.position.set(0, 1.1, D / 2 - 0.01); door.rotation.y = Math.PI; g.add(door);
    // furniture: open-source models (Quaternius house interior pack + Khronos sample assets)
    const QH = (n) => Q('house_interior_pack', n);
    const put = (rel, size, x, z, rot = 0, axis = 'max', solid = true, y = 0) => {
      const gl = loaded(rel);
      if (!gl) return null;
      const m = instance(gl, size, axis);
      m.position.set(x, y, z); m.rotation.y = rot; g.add(m);
      if (solid) {
        const sz = m.userData.size, sw = Math.abs(Math.sin(rot)) > 0.5;
        const hx = (sw ? sz.z : sz.x) / 2, hz = (sw ? sz.x : sz.z) / 2;
        collision.addBox(o.x + x - hx, o.z + z - hz, o.x + x + hx, o.z + z + hz, o.y + y, o.y + y + sz.y);
      }
      return m;
    };
    const F = (w, h, dd, x, z, c, y = 0, solid = true, rough = 0.7) => boxAt(g, w, h, dd, x, y, z, M(c, rough), solid, o);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const plant = () => QH(pick(['Houseplant_1', 'Houseplant_3', 'Houseplant_5', 'Houseplant_7']));
    if (kind === 'home' || kind === 'apartment') {
      put(QH(pick(['Carpet_1', 'Carpet_2', 'Carpet_Round'])), 3.2, -W / 4, -D / 2 + 2.6, 0, 'max', false);
      put(r() < 0.5 ? K('GlamVelvetSofa') : K('SheenWoodLeatherSofa'), 2.3, -W / 4, -D / 2 + 1.0, 0);
      put(QH('Table_RoundSmall'), 0.9, -W / 4, -D / 2 + 2.5, 0);
      const stand = put(QH('Drawer_1'), 1.5, -W / 4, -D / 2 + 4.3, Math.PI);
      const tv = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.06), new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.2, emissive: 0x2a4f80, emissiveIntensity: 0.5 }));
      tv.position.set(-W / 4, (stand ? stand.userData.size.y : 0.7) + 0.4, -D / 2 + 4.3); g.add(tv);
      put(QH(pick(['Light_Floor1', 'Light_Floor2', 'Light_Stand1'])), 1.7, -W / 2 + 0.6, -D / 2 + 0.6, 0, 'y');
      put(QH('Bookshelf'), 2.0, -W / 2 + 0.35, 0.5, Math.PI / 2, 'y');
      put(plant(), 1.2, -W / 2 + 0.6, D / 2 - 0.8, 0, 'y');
      put(K('DiffuseTransmissionPlant'), 0.6, -W / 4 + 0.3, -D / 2 + 2.5, 0, 'y', false, 0.45);
      put(QH(pick(['Bed_King', 'Bed_Single'])), 2.2, W / 4 + 0.4, -D / 2 + 1.3, 0);
      put(QH('NightStand_1'), 0.6, W / 4 - 0.9, -D / 2 + 0.45, 0, 'y');
      put(QH('Light_Desk'), 0.5, W / 4 - 0.9, -D / 2 + 0.45, 0, 'y', false, 0.62);
      put(QH(pick(['Drawer_2', 'Drawer_3'])), 1.3, W / 2 - 0.35, -D / 2 + 2.6, -Math.PI / 2);
      put(QH('Kitchen_Fridge'), 1.9, W / 2 - 0.45, D / 2 - 0.7, -Math.PI / 2, 'y');
      put(QH('Kitchen_Oven'), 0.95, W / 2 - 0.4, D / 2 - 1.6, -Math.PI / 2, 'y');
      put(QH('Kitchen_Sink'), 0.95, W / 2 - 0.4, D / 2 - 2.4, -Math.PI / 2, 'y');
      put(QH('Kitchen_2Drawers'), 0.95, W / 2 - 0.4, D / 2 - 3.3, -Math.PI / 2, 'y');
      put(QH('Table_RoundLarge'), 1.3, W / 4 - 0.6, D / 4, 0);
      put(K('SheenChair'), 0.95, W / 4 - 0.6, D / 4 - 1.0, 0, 'y');
      put(K('SheenChair'), 0.95, W / 4 - 0.6, D / 4 + 1.0, Math.PI, 'y');
      put(K('ChairDamaskPurplegold'), 1.0, W / 4 - 1.6, D / 4, Math.PI / 2, 'y');
      put(K('Lantern'), 0.45, W / 4 - 0.6, D / 4, 0, 'y', false, 0.75);
      if (b.style === 4) { put(QH('Fireplace'), 1.6, -W / 2 + 0.4, -1.8, Math.PI / 2); put(QH('Bathroom_Toilet'), 0.8, -W / 2 + 0.5, D / 2 - 2.0, Math.PI / 2, 'y'); put(QH('Bathroom_Sink'), 0.9, -W / 2 + 0.4, D / 2 - 3.0, Math.PI / 2, 'y'); }
      for (const cx of [-W / 4, W / 4]) put(QH('Curtains_Double'), 2.2, cx, -D / 2 + 0.12, 0, 'max', false, 0.4);
      put(QH('Trashcan_Small1'), 0.4, W / 2 - 0.4, D / 2 - 4.0, 0, 'y');
      put(K('BoomBox'), 0.5, -W / 4 + 0.7, -D / 2 + 4.3, Math.PI, 'max', false, 0.8);
    } else if (kind === 'office') {
      for (let x = -W / 2 + 2.2; x < W / 2 - 1.5; x += 3.2) for (let z = -D / 2 + 2.2; z < D / 2 - 2.5; z += 2.8) {
        put(QH('Kitchen_2Drawers'), 1.5, x, z, 0, 'max');
        const mon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.04), new THREE.MeshStandardMaterial({ color: 0x080808, emissive: 0x4070b0, emissiveIntensity: 0.5 })); mon.position.set(x, 1.15, z - 0.15); g.add(mon);
        put(K('SheenChair'), 0.95, x, z + 0.8, Math.PI, 'y');
      }
      put(QH('Couch_Medium1'), 2.0, -W / 2 + 1.4, D / 2 - 1.0, Math.PI);
      put(QH('Shelf_Large'), 2.0, W / 2 - 0.35, 0, -Math.PI / 2, 'y');
      put(plant(), 1.3, W / 2 - 0.6, D / 2 - 0.6, 0, 'y'); put(plant(), 1.3, -W / 2 + 0.6, -D / 2 + 0.6, 0, 'y');
      put(K('WaterBottle'), 0.3, -W / 2 + 2.0, D / 2 - 1.0, 0, 'y', false, 0.45);
    } else if (kind === 'store') {
      const prodM = [0xb03030, 0x3070b0, 0xd0a020, 0x30904a, 0xe0e0e0].map((c) => M(c, 0.5));
      for (let x = -W / 2 + 2.2; x < W / 2 - 3; x += 2.6) {
        for (const zc of [-1.6, 0.8]) {
          const sh = put(QH('Shelf_Large'), 1.9, x, zc, Math.PI / 2, 'y');
          const sz = sh ? sh.userData.size : new THREE.Vector3(2, 1.9, 0.5);
          if (!sh) F(0.5, 1.9, 2, x, zc, 0x9a9a9a, 0, true, 0.4);
          // stock on each shelf level, across the shelf's width
          for (let lv = 0; lv < 4; lv++) for (let k = 0; k < 6; k++) {
            const pb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.2), prodM[(k + lv + Math.floor(x)) % 5]);
            pb.position.set(x + (k % 2 ? 0.08 : -0.08), 0.12 + sz.y * (0.06 + lv * 0.24), zc + (k - 2.5) * (sz.x / 6.5));
            g.add(pb);
          }
        }
      }
      for (let k = 0; k < 3; k++) put(K('CommercialRefrigerator'), 2.0, -W / 2 + 1.5 + k * 1.3, -D / 2 + 0.55, 0, 'y');
      put(QH('Kitchen_3Drawers'), 2.2, W / 2 - 2, D / 2 - 2.5, Math.PI, 'max');
      put(K('BoomBox'), 0.5, W / 2 - 2.4, D / 2 - 2.5, Math.PI, 'max', false, 0.95);
      put(QH('Trashcan_Large'), 0.9, W / 2 - 0.6, D / 2 - 0.6, 0, 'y');
    } else if (kind === 'bar') {
      for (let k = 0; k < 3; k++) put(QH('Kitchen_3Drawers'), 2.2, -2.3 + k * 2.3, -D / 2 + 2, Math.PI, 'max');
      F(W - 3, 2.2, 0.3, 0, -D / 2 + 0.3, 0x3a2416);
      for (let x = -3.5; x <= 3.5; x += 1.2) put(QH('Stool'), 0.75, x, -D / 2 + 3.0, 0, 'y');
      for (let x = -W / 2 + 2; x < W / 2 - 1; x += 3.2) { put(QH(pick(['Table_RoundSmall', 'Table_RoundSmall2'])), 1.0, x, 1.6, 0); put(QH('Chair_2'), 0.9, x - 0.8, 1.6, Math.PI / 2, 'y'); put(QH('Chair_2'), 0.9, x + 0.8, 1.6, -Math.PI / 2, 'y'); put(K('Lantern'), 0.4, x, 1.6, 0, 'y', false, 0.78); }
      put(QH('Couch_L'), 2.6, -W / 2 + 1.6, D / 2 - 1.6, Math.PI);
      put(QH('Light_Chandelier'), 1.0, 0, 0, 0, 'y', false, H - 1.05);
    } else {
      for (let x = -W / 2 + 2; x < W / 2 - 2; x += 3.4) put(QH('Shelf_Large'), 2.4, x, -D / 2 + 1, 0, 'y');
      for (let x = -W / 2 + 2; x < W / 2 - 2; x += 3.2) for (let z = -D / 2 + 4; z < D / 2 - 3; z += 4) { const hh = 1 + Math.floor(r() * 3); for (let k = 0; k < hh; k++) F(1.3, 1.1, 1.3, x + (r() - 0.5) * 0.3, z, 0x8a6a40, k * 1.1, k === 0); }
    }
    for (const lx of [-W / 4, W / 4]) put(QH(pick(['Light_Ceiling1', 'Light_Ceiling2', 'Light_Ceiling4'])), 0.6, lx, 0, 0, 'y', false, H - 0.62);
    // lights
    const lc = kind === 'office' || kind === 'store' || kind === 'warehouse' ? 0xf4f6ff : 0xffd9a8;
    for (const lx of [-W / 4, W / 4]) { const L = new THREE.PointLight(lc, kind === 'warehouse' ? 60 : 22, Math.max(W, D), 1.6); L.position.set(lx, H - 0.4, 0); g.add(L); const fx = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: lc, emissiveIntensity: 2 })); fx.position.set(lx, H - 0.05, 0); g.add(fx); }
    return { g, o, W, D, H, kind };
  }

  const INTERIOR_MODELS = [
    ...['Carpet_1', 'Carpet_2', 'Carpet_Round', 'Table_RoundSmall', 'Table_RoundSmall2', 'Table_RoundLarge', 'Drawer_1', 'Drawer_2', 'Drawer_3', 'Light_Floor1', 'Light_Floor2', 'Light_Stand1', 'Bookshelf', 'Houseplant_1', 'Houseplant_3', 'Houseplant_5', 'Houseplant_7',
      'Bed_King', 'Bed_Single', 'NightStand_1', 'Light_Desk', 'Kitchen_Fridge', 'Kitchen_Oven', 'Kitchen_Sink', 'Kitchen_2Drawers', 'Kitchen_3Drawers', 'Fireplace', 'Bathroom_Toilet', 'Bathroom_Sink', 'Curtains_Double', 'Trashcan_Small1', 'Trashcan_Large',
      'Couch_Medium1', 'Couch_L', 'Shelf_Large', 'Stool', 'Chair_2', 'Light_Chandelier', 'Light_Ceiling1', 'Light_Ceiling2', 'Light_Ceiling4'].map((n) => Q('house_interior_pack', n)),
    K('GlamVelvetSofa'), K('SheenChair'), K('ChairDamaskPurplegold'), K('Lantern'), K('BoomBox'), K('WaterBottle'), K('DiffuseTransmissionPlant'),
  ];
  const HEAVY = [K('SheenWoodLeatherSofa'), K('CommercialRefrigerator')];
  // fetch the furniture in the background shortly after the game starts
  setTimeout(() => { Promise.all(INTERIOR_MODELS.map(loadOpen)).then(() => HEAVY.forEach(loadOpen)); }, 4000);
  async function enter(d) {
    if (inside) return;
    const need = [...INTERIOR_MODELS, ...(d.b.style === 5 || d.b.style === 2 || d.b.style === 4 ? HEAVY : [])].filter((rel) => !loaded(rel));
    if (need.length) { hud.toast('Loading interior…', 1.5); await Promise.all(need.map(loadOpen)); }
    let it = built.get(d.i);
    if (!it) { it = buildInterior(d); built.set(d.i, it); }
    scene.add(it.g);
    inside = { d, it };
    game.S.indoors = inside; game.weather.indoors = true;
    player.pos.set(it.o.x, it.o.y + 0.05, it.o.z + it.D / 2 - 1.2);
    player.vel.set(0, 0, 0);
    player.heading = Math.PI;
    if (game.rig) { inside.zoom = game.rig.zoom; game.rig.zoom = 0.6; }
    const p = propByBuilding.get(d.i);
    insidePoints.push(interact.add({ x: it.o.x, z: it.o.z + it.D / 2 - 0.4, y: it.o.y, r: 1.2, label: () => `${keyHint(game)} go outside`, color: 0x80ff80, use: leave }));
    if (p) insidePoints.push(interact.add({ x: it.o.x - 2, z: it.o.z + it.D / 2 - 2, y: it.o.y, r: 1.4, color: owned(p) ? 0x60ff90 : 0xffd040,
      label: () => owned(p) ? `${keyHint(game)} sleep and save (${p.name})` : `${keyHint(game)} buy ${p.name} — ${money(p.price)}`,
      use: () => {
        if (owned(p)) { P.home = p.id; game.sky.hour = 8; career.save(); hud.bigMessage('SAVED', `${p.name} is now your home`, 2.5); return; }
        if (!career.spend(p.price)) return;
        P.properties.push(p.id); P.home = P.home || p.id; career.save();
        hud.bigMessage('PROPERTY PURCHASED', p.name, 3);
      } }));
    hud.toast(`${p ? p.name : ['Home', 'Apartment', 'Office', 'Store', 'Bar', 'Warehouse'][['home', 'apartment', 'office', 'store', 'bar', 'warehouse'].indexOf(it.kind)]}`, 2);
  }
  function leave() {
    if (!inside) return;
    const { d, it } = inside;
    scene.remove(it.g);
    for (const p of insidePoints) interact.remove(p);
    insidePoints = [];
    if (game.rig && inside.zoom) game.rig.zoom = inside.zoom;
    player.pos.set(d.x + d.nx * 1.2, hm.height(d.x, d.z) + 0.1, d.z + d.nz * 1.2);
    player.pos.y = collision.surface(player.pos.x, player.pos.z, player.pos.y + 2);
    player.heading = Math.atan2(d.nx, d.nz);
    inside = null; game.S.indoors = null; game.weather.indoors = false;
  }
  for (const d of doors) {
    const p = propByBuilding.get(d.i);
    interact.add({ x: d.x, z: d.z, r: 1.6, marker: !!p && !owned(p) ? undefined : false,
      color: p && owned(p) ? 0x60ff90 : 0xffd040, height: 1.2,
      blip: p ? { color: '#60ff90', size: 4, global: true } : null,
      show: () => !inside,
      label: () => p ? `${keyHint(game)} enter ${p.name}${owned(p) ? ' (yours)' : ` · for sale ${money(p.price)}`}` : `${keyHint(game)} go inside`,
      use: () => enter(d) });
    // only owned homes show on the map
    if (p) interact.points[interact.points.length - 1].blip = null;
  }
  // owned properties: map blips + daily income from businesses
  const ownedBlips = props.map((p) => interact.add({ x: p.door.x, z: p.door.z, r: 0.1, marker: false, show: () => owned(p) && !inside, label: '', use: () => {}, blip: { color: '#60ff90', size: 5, global: true } }));
  void ownedBlips;
  let lastDay = game.sky.day;

  // real-estate listings
  const realtor = new ShopUI({
    title: 'Gulf Coast Realty', getMoney: () => career.money, pause: game.pause,
    tabs: [...new Set(props.map((p) => p.type))].map((t) => ({ k: t, label: `${t}s (${props.filter((p) => p.type === t).length})` })).concat([{ k: 'mine', label: 'Owned' }]),
    note: () => `${props.length} properties for sale. Businesses pay out every game day. "Mark" sets a GPS marker; buy inside the building.`,
    items: (t) => t === 'mine' ? props.filter(owned) : props.filter((p) => p.type === t),
    row: (p) => ({ name: p.name, sub: `${p.type} · ${p.region}${INCOME[p.type] ? ` · earns ${money(p.price * INCOME[p.type])}/day` : ''}`, stats: [['Size', Math.min(1, p.door.b.w * p.door.b.d / 900), `${Math.round(p.door.b.w * p.door.b.d)} m²`]], btn: owned(p) ? 'Owned' : `Mark · ${money(p.price)}`, cls: owned(p) ? 'own' : '' }),
    act: (p) => { game.setWaypoint?.(p.door.x, p.door.z, p.name); realtor.close(); },
  });
  const officeDoor = doors.find((d) => d.b.style === 5 && Math.hypot(d.x - (CITY.x0 + 60), d.z - (CITY.z0 + 3 * CITY.pitch)) < 200) || doors[0];
  interact.add({ x: officeDoor.x + officeDoor.nx * 2.5 + 2, z: officeDoor.z + officeDoor.nz * 2.5, label: () => `${keyHint(game)} browse Gulf Coast Realty listings`, color: 0x60ff90, blip: { color: '#9fffb8', size: 5, global: true }, show: () => !inside, use: () => realtor.show() });

  // spawn at home
  if (P.home) { const p = props.find((x) => x.id === P.home); if (p) game.teleport(p.door.x + p.door.nx * 1.5, p.door.z + p.door.nz * 1.5, Math.atan2(p.door.nx, p.door.nz)); }

  return {
    props, doors, realtor, enter, leave, get inside() { return inside; },
    update() {
      if (game.sky.day !== lastDay) {
        lastDay = game.sky.day;
        let pay = 0;
        for (const p of props) if (owned(p) && INCOME[p.type]) pay += Math.round(p.price * INCOME[p.type]);
        if (pay > 0) career.earn(pay, 'property income');
      }
    },
  };
}
