// Every building can be entered, and 198 of them are for sale.
// Interiors are generated from the building (style, size, seed): homes,
// apartments, offices, stores, bars and warehouses, each with furniture,
// lights, walls and floors you can walk on. Each building's rooms live at their
// own spot high above the far corner of the map, so collisions never overlap.
import * as THREE from 'three';
import { CITY, TOWN, LAKE, regionAt } from '../world/layout.js';
import { Human } from '../entities/human.js';
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
  // the original 198 first (their ids are in saves), then homes in the newer outer neighbourhoods
  const MAX = 198 + 48;
  for (const extra of [false, true]) for (const st of order) for (const d of doors) {
    if (props.length >= (extra ? MAX : 198)) break;
    if (!!d.b.extra !== extra || d.b.style !== st || seen.has(d.i)) continue;
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
    props.push({ id: `prop_${String(props.length + 1).padStart(3, '0')}`, door: d, type, name, price: Math.max(price, 18000), region: inCity ? 'Port Calvera' : d.b.extra ? 'Calvera outskirts' : d.b.x < TOWN.x0 + 400 && d.b.x > TOWN.x0 - 200 ? 'Mill Creek' : 'Countryside' });
  }
  const propByBuilding = new Map(props.map((p) => [p.door.i, p]));
  const owned = (p) => P.properties.includes(p.id);
  // buildings another system runs (systems/workplaces.js: the barbershops, the courier depot, every
  // employer's office): their own kind, hours, furniture and people. spec: { kind, name, open(),
  // furnish(ctx), enter(ctx), leave(inside) }
  const special = new Map();
  const enterHooks = [];

  // ---------------- interiors ----------------
  const built = new Map();
  let inside = null, insidePoints = [];
  const IO = (i) => new THREE.Vector3(-1900 + (i % 24) * 70, 1400, -1900 + Math.floor(i / 24) * 70);
  const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  // photo-scanned surfaces for walls and floors, UVs scaled to real size (no stretching)
  const S = game.surf;
  const texMat = (key, tint, rough) => {
    const t = S && S[key];
    if (!t || !t.color) return null;
    return new THREE.MeshStandardMaterial({ map: t.color, normalMap: t.normal || null, roughnessMap: t.rough || null, color: tint, roughness: rough, normalScale: new THREE.Vector2(0.6, 0.6) });
  };
  const scaleUV = (geo, w, h, d, size) => {
    const uv = geo.attributes.uv, n = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      const su = ax > 0.5 ? d : w, sv = ay > 0.5 ? d : h;
      uv.setXY(i, uv.getX(i) * su / size, uv.getY(i) * sv / size);
    }
    uv.needsUpdate = true;
  };
  const boxAt = (g, w, h, d, x, y, z, mat, solid, origin) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (mat.map) scaleUV(geo, w, h, d, mat.userData.texSize || 2.5);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; g.add(m);
    if (solid) collision.addBox(origin.x + x - w / 2, origin.z + z - d / 2, origin.x + x + w / 2, origin.z + z + d / 2, origin.y + y, origin.y + y + h, solid === 'walk' ? { walkable: true } : null);
    return m;
  };

  // what a building is inside (same dice as the interior builder)
  const kindOf = (d) => { if (special.has(d.i)) return special.get(d.i).kind; const r = rng(d.i * 31 + 7), a = r(), c = r(); return { 4: 'home', 2: a < 0.5 ? 'home' : 'apartment', 5: c < 0.35 ? 'bar' : 'store', 3: 'warehouse', 1: 'office', 0: 'office' }[d.b.style] || 'home'; };
  // Is this door open right now? Homes are mostly locked; shops keep hours.
  const lockState = (d, p) => {
    if (p && owned(p)) return 'open';
    if (d.broken > 0) return 'open';
    if (special.has(d.i)) return special.get(d.i).open() ? 'open' : 'locked';
    const h = game.sky.hour, k = kindOf(d), dice = rng(d.i * 131 + 3)();
    if (p && h >= 9 && h < 17) return 'open'; // for sale: open for viewings in the daytime
    if (k === 'store') return h >= 7 && h < 23 ? 'open' : 'locked';
    if (k === 'bar') return h >= 11 || h < 2 ? 'open' : 'locked';
    if (k === 'office') return h >= 8 && h < 18 ? 'open' : 'locked';
    if (k === 'warehouse') return dice < 0.7 ? 'locked' : 'open';
    return dice < 0.7 ? 'locked' : 'open';
  };
  // whoever lives there and whose day has them at home right now (systems/population.js)
  const someoneHome = (d) => {
    if (game.population) return game.population.atHome(d.i).length > 0;
    const h = game.sky.hour, night = h < 7 || h > 19; return rng(d.i * 71 + Math.floor(game.sky.day))() < (night ? 0.8 : 0.4);
  };
  function buildInterior(d) {
    const b = d.b, o = IO(d.i), r = rng(d.i * 31 + 7);
    const kind = kindOf(d); r(); r(); // keep the furniture dice where they were
    const sp = special.get(d.i); // (a workplace sets its own room size)
    const W = sp?.size ? sp.size[0] : Math.max(9, Math.min(b.w - 1, kind === 'warehouse' ? 26 : 18)), D = sp?.size ? sp.size[1] : Math.max(8, Math.min(b.d - 1, kind === 'warehouse' ? 22 : 14)), H = kind === 'warehouse' ? 7 : 3.2;
    const g = new THREE.Group(); g.position.copy(o);
    const wallC = [0xeeebe6, 0xd6dce0, 0xe6e2da, 0xc6d1c4, 0xdcd6d0, 0xf4f3f0][Math.floor(r() * 6)]; // neutral paints (warm beige + amber bulbs read as yellow-brown)
    const floorC = kind === 'warehouse' ? 0x6d6d68 : kind === 'office' ? 0x4a4f55 : [0x7a5434, 0x8c6a46, 0x5c3f28, 0xb8b2a4][Math.floor(r() * 4)];
    const homeFloor = kind === 'home' || kind === 'apartment' ? texMat('woodfloor', [0xffffff, 0xd8c8b4, 0xb89a80, 0xf0e4d4][Math.floor(r() * 4)], 0.45) : null;
    // painted drywall: the paint colour, with only a faint roller texture (the plaster scan's own
    // albedo turned every room into rough grey concrete)
    const wallM = M(wallC, 0.9);
    if (S && S.plaster && S.plaster.normal) { wallM.normalMap = S.plaster.normal; wallM.normalScale = new THREE.Vector2(0.18, 0.18); }
    const floorM = homeFloor || (kind === 'warehouse' || kind === 'store' || kind === 'office' ? texMat('concrete', floorC === 0x4a4f55 ? 0x8a8f95 : 0xb0aca4, 0.8) : null) || M(floorC, kind === 'home' || kind === 'apartment' ? 0.45 : 0.8);
    if (homeFloor) homeFloor.userData.texSize = 2.0;
    wallM.userData.texSize = 3.0; floorM.userData.texSize = 2.5;
    // what the walls are made of: drywall on studs inside; outside walls framed in houses, block in shops, sheet steel in warehouses
    wallM.userData.surf = kind === 'warehouse' ? 'metal' : 'drywall';
    const outerSurf = kind === 'home' || kind === 'apartment' ? 'frame' : kind === 'warehouse' ? 'metal' : 'block';
    floorM.userData.surf = kind === 'home' || kind === 'apartment' ? 'floor' : 'masonry';
    boxAt(g, W + 0.4, 0.2, D + 0.4, 0, -0.2, 0, floorM, 'walk', o);
    boxAt(g, W + 0.4, 0.2, D + 0.4, 0, H, 0, M(0xf2f0ea, 0.9), false, o);
    for (const m of [boxAt(g, W + 0.4, H, 0.2, 0, 0, -D / 2 - 0.1, wallM, true, o), boxAt(g, W + 0.4, H, 0.2, 0, 0, D / 2 + 0.1, wallM, true, o),
      boxAt(g, 0.2, H, D, -W / 2 - 0.1, 0, 0, wallM, true, o), boxAt(g, 0.2, H, D, W / 2 + 0.1, 0, 0, wallM, true, o)]) m.userData.surf = outerSurf;
    // windows (glowing with daylight) and the front door
    // daylight through the glass by day; after dark the panes are black with the room reflected
    const sunUp = Math.max(0, Math.min(1, Math.min(game.sky.hour - 6, 19.5 - game.sky.hour) / 1.2));
    const winM = new THREE.MeshStandardMaterial({ color: 0x223040, emissive: sunUp > 0 ? 0xbfd6ee : 0x0a1020, emissiveIntensity: 0.05 + 0.75 * sunUp, roughness: 0.1 });
    winM.userData.surf = 'glass';
    for (let x = -W / 2 + 2; x < W / 2 - 1.5; x += 3.2) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), winM); w.position.set(x, 1.6, -D / 2 + 0.01); g.add(w); }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), M(0x3a2a1c, 0.6)); door.position.set(0, 1.1, D / 2 - 0.01); door.rotation.y = Math.PI; door.userData.surf = 'door'; g.add(door);
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
    const F = (w, h, dd, x, z, c, y = 0, solid = true, rough = 0.7) => { const m = boxAt(g, w, h, dd, x, y, z, M(c, rough), solid, o); m.userData.surf = 'wood'; return m; };
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const plant = () => QH(pick(['Houseplant_1', 'Houseplant_3', 'Houseplant_5', 'Houseplant_7']));
    if (sp) sp.furnish({ d, g, o, W, D, H, r, put, F, M, boxAt, texMat, QH, K, pick, plant, collision, wallM, floorM });
    else if (kind === 'home' || kind === 'apartment') {
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
      // rooms: the bedroom gets walls and a doorway; houses get a walled bathroom
      const pw = 0.12, door = 1.0;
      boxAt(g, pw, H, D / 2 - 1.6, 0.15, 0, -D / 2 + (D / 2 - 1.6) / 2, wallM, true, o); // living | bedroom
      boxAt(g, pw, H, 0.4, 0.15, 0, -0.4, wallM, true, o);
      boxAt(g, W / 2 - 0.15 - 1.4 - door, H, pw, 0.15 + (W / 2 - 0.15 - 1.4 - door) / 2, 0, -0.2, wallM, true, o); // bedroom front, door near the kitchen
      boxAt(g, 1.4, H, pw, W / 2 - 0.7, 0, -0.2, wallM, true, o);
      if (b.style === 4) {
        // tiled bathroom floor
        const tileM = texMat('tiles', 0xf4f4f2, 0.3);
        if (tileM) { tileM.userData.texSize = 1.5; boxAt(g, 2.35, 0.012, 3.95, -W / 2 + 1.2, 0, D / 2 - 2.0, tileM, false, o); }
        boxAt(g, pw, H, 4 - door - 0.3, -W / 2 + 2.4, 0, D / 2 - 4 + (4 - door - 0.3) / 2, wallM, true, o);
        boxAt(g, 2.4, H, pw, -W / 2 + 1.2, 0, D / 2 - 4, wallM, true, o);
      }
      put(QH('Trashcan_Small1'), 0.4, W / 2 - 0.4, D / 2 - 4.0, 0, 'y');
      put(K('BoomBox'), 0.5, -W / 4 + 0.7, -D / 2 + 4.3, Math.PI, 'max', false, 0.8);
    } else if (kind === 'office') {
      for (let x = -W / 2 + 2.2; x < W / 2 - 1.5; x += 3.2) for (let z = -D / 2 + 2.2; z < D / 2 - 2.5; z += 2.8) {
        const desk = put(QH('Kitchen_2Drawers'), 0.78, x, z, 0, 'y');
        const top = desk ? desk.userData.size.y : 0.78;
        const mon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.04), new THREE.MeshStandardMaterial({ color: 0x080808, emissive: 0x4070b0, emissiveIntensity: 0.5 })); mon.position.set(x, top + 0.2, z - 0.1); g.add(mon);
        put(QH('Light_Desk'), 0.45, x + 0.45, z - 0.1, 0, 'y', false, top);
        put(QH(r() < 0.5 ? 'Chair_3' : 'Chair_4'), 0.95, x, z + 0.75, Math.PI, 'y');
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
    // homes by day: the lights are off and the rooms are lit by the windows (soft, cooler);
    // after dark (and in shops, offices and warehouses, always) the ceiling lights are on
    const hr = game.sky.hour, dayIn = (kind === 'home' || kind === 'apartment') && hr > 7.5 && hr < 18.5;
    const lc = dayIn ? 0xeef2ff : kind === 'office' || kind === 'store' || kind === 'warehouse' ? 0xf4f6ff : 0xffeedd;
    for (const lx of [-W / 4, W / 4]) { const L = new THREE.PointLight(lc, kind === 'warehouse' ? 60 : dayIn ? 9 : 22, Math.max(W, D) * (dayIn ? 1.3 : 1), dayIn ? 1.0 : 1.6); L.position.set(lx, H - 0.3, 0); g.add(L); const fx = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: lc, emissiveIntensity: dayIn ? 0.08 : 2 })); fx.position.set(lx, H - 0.05, 0); g.add(fx); }
    // fire safety: a pull station and a horn/strobe by the door, a smoke detector on the ceiling
    const fireM = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.45 });
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.06), fireM); pull.position.set(o.x + 1.4, o.y + 1.25, o.z + D / 2 - 0.2); g.add(pull);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 })); handle.position.set(0, -0.02, -0.04); pull.add(handle);
    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), fireM); horn.position.set(o.x + 1.4, o.y + H - 0.6, o.z + D / 2 - 0.2); g.add(horn);
    const strobeM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0, transparent: true, opacity: 0.85, roughness: 0.1 });
    const strobe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), strobeM); strobe.position.set(0, -0.05, -0.05); horn.add(strobe);
    const flash = new THREE.PointLight(0xffffff, 0, 14, 2); flash.position.set(o.x + 1.4, o.y + H - 0.8, o.z + D / 2 - 0.8); g.add(flash);
    const det = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 18), new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.5 })); det.position.set(o.x, o.y + H - 0.04, o.z); g.add(det);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: 0x30ff40 })); led.position.set(0.03, -0.02, 0); det.add(led);
    return { g, o, W, D, H, kind, alarm: { strobe, flash, pull, led } };
  }

  const INTERIOR_MODELS = [
    ...['Carpet_1', 'Carpet_2', 'Carpet_Round', 'Table_RoundSmall', 'Table_RoundSmall2', 'Table_RoundLarge', 'Drawer_1', 'Drawer_2', 'Drawer_3', 'Light_Floor1', 'Light_Floor2', 'Light_Stand1', 'Bookshelf', 'Houseplant_1', 'Houseplant_3', 'Houseplant_5', 'Houseplant_7',
      'Bed_King', 'Bed_Single', 'NightStand_1', 'Light_Desk', 'Kitchen_Fridge', 'Kitchen_Oven', 'Kitchen_Sink', 'Kitchen_2Drawers', 'Kitchen_3Drawers', 'Fireplace', 'Bathroom_Toilet', 'Bathroom_Sink', 'Curtains_Double', 'Trashcan_Small1', 'Trashcan_Large',
      'Couch_Medium1', 'Couch_L', 'Shelf_Large', 'Stool', 'Chair_2', 'Chair_3', 'Chair_4', 'Light_Chandelier', 'Light_Ceiling1', 'Light_Ceiling2', 'Light_Ceiling4'].map((n) => Q('house_interior_pack', n)),
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
    const sp = special.get(d.i);
    game.S.indoors = inside; game.weather.indoors = true;
    player.pos.set(it.o.x, it.o.y + 0.05, it.o.z + it.D / 2 - 1.2);
    player.vel.set(0, 0, 0);
    player.heading = Math.PI;
    if (game.rig) { inside.zoom = game.rig.zoom; game.rig.zoom = 0.6; game.rig.yaw = player.heading; }
    const p = propByBuilding.get(d.i);
    insidePoints.push(interact.add({ x: it.o.x, z: it.o.z + it.D / 2 - 0.4, y: it.o.y, r: 1.2, label: () => `${keyHint(game)} go outside`, color: 0x80ff80, use: () => doorWalk(null, 'reach', () => leave(true)) }));
    if (p) insidePoints.push(interact.add({ x: it.o.x - 2, z: it.o.z + it.D / 2 - 2, y: it.o.y, r: 1.4, color: owned(p) ? 0x60ff90 : 0xffd040,
      label: () => owned(p) ? `${keyHint(game)} sleep and save (${p.name})` : `${keyHint(game)} buy ${p.name} — ${money(p.price)}`,
      use: () => {
        if (owned(p)) { P.home = p.id; if (game.sleep) game.sleep(8, p.name); else game.sky.hour = 8; career.save(); hud.toast(`Saved. ${p.name} is your home.`, 2.5); return; }
        if (!career.spend(p.price)) return;
        P.properties.push(p.id); P.home = P.home || p.id; career.save();
        hud.bigMessage('PROPERTY PURCHASED', p.name, 3);
      } }));
    if (p && owned(p)) insidePoints.push(interact.add({ x: it.o.x + 2, z: it.o.z, y: it.o.y, r: 1.3, label: () => `${keyHint(game)} change clothes`, color: 0x9fc4c0, use: () => game.openWardrobe?.() }));
    insidePoints.push(interact.add({ x: it.o.x + 1.4, z: it.o.z + it.D / 2 - 0.7, y: it.o.y, r: 0.9, label: () => `${keyHint(game)} pull the fire alarm`, color: 0xff4040, use: () => game.fireAlarm?.(inside) }));
    hud.toast(`${sp ? sp.name : p ? p.name : ['Home', 'Apartment', 'Office', 'Store', 'Bar', 'Warehouse'][['home', 'apartment', 'office', 'store', 'bar', 'warehouse'].indexOf(it.kind)]}`, 2);
    // someone working the counter in an open shop or bar (one of the residents who works there, if
    // their shift's on); they can be held up like any store clerk (systems/robbery.js)
    const point = (pt) => { const q = interact.add({ y: it.o.y, ...pt }); insidePoints.push(q); return q; };
    if (sp) { try { sp.enter?.({ d, it, point }); } catch (e) { console.error('[estate] ' + (e && e.message), e); } }
    else if ((it.kind === 'store' || it.kind === 'bar') && !(p && owned(p)) && lockState(d, p) === 'open') placeClerk(d, it);
    for (const f of enterHooks) f({ d, it, p, owned: !!(p && owned(p)), point });
  }
  // where a door is, for the little scenes: its middle at the wall and its outside normal
  const doorSpotOf = (d) => ({ x: d.b.x + d.nx * (d.b.w / 2), z: d.b.z + d.nz * (d.b.d / 2), nx: d.nx, nz: d.nz, door: d });
  // a locked door: knock, kick it in, or leave it
  function tryDoor(d, p) {
    if (d.b.ruined) { hud.toast(d.b.ruined === 'build' ? 'Construction site. Hard hats only.' : 'Fire damage. The building is condemned.', 2.5); return; }
    const k = kindOf(d), home = k === 'home' || k === 'apartment';
    if (lockState(d, p) === 'open') {
      if (home && !(p && owned(p)) && !(p && game.sky.hour >= 9 && game.sky.hour < 17) && someoneHome(d)) { enter(d); occupy(d, 'trespass'); return; }
      enter(d); return;
    }
    const opts = [];
    if (home) opts.push(['Knock', () => {
      const answer = () => { if (someoneHome(d)) hud.toast(['"Who is it? ...We don\'t want any. Go away."', '"It\'s late! Go home!"', '"I don\'t know you. I\'m not opening this door."'][(Math.random() * 3) | 0], 3); else hud.toast('Nobody answers.', 2); };
      if (!game.acts) return answer();
      const sp = doorSpotOf(d), pt = new THREE.Vector3(sp.x + sp.nx * 0.06, player.pos.y + 1.3, sp.z + sp.nz * 0.06), kn = () => (game.audio?.knock ? game.audio.knock() : game.audio?.thud?.(0.25));
      const run = game.acts.play([{ walk: { x: sp.x + sp.nx * 0.75, z: sp.z + sp.nz * 0.75 }, face: { x: sp.x, z: sp.z }, max: 3 },
        { t: 1.3, start: () => { kn(); setTimeout(kn, 360); setTimeout(kn, 720); }, ik: (F, k, ctx, P) => game.acts.reachTo(P, F, 'R', pt.clone().addScaledVector(F.right, 0.15), k, 3) },
        { t: 1.4 }], { done: answer });
      if (!run) answer();
    }]);
    opts.push(['Kick it in (break-in)', () => breakIn(d, p, home)]);
    opts.push(['Leave it', () => {}]);
    game.openDialog?.(home ? 'Front door' : 'Door', home ? 'The door is locked.' : 'Locked. Closed for the night.', opts);
  }
  function breakIn(d, p, home) {
    hud.toast('*THUD* ...*THUD* ...*CRACK*', 2);
    // (A2) you kick at the lock: a step back, a kick, again, and the third one bursts it
    const through = () => {
      d.broken = 24; // the door stays broken until someone fixes it (a game day)
      // neighbours hear it
      game.reportCrime?.('breakin', new THREE.Vector3(d.x, 0, d.z));
      enter(d).then?.(() => { if (home && someoneHome(d)) occupy(d, 'breakin'); else if (!home && Math.random() < 0.5) hud.toast('An alarm starts beeping somewhere.', 2.5); });
    };
    if (game.acts && game.S.mode === 'foot' && !game.S.doorWalk) {
      const sp = doorSpotOf(d), kick = (n) => ({ t: 0.6, clip: 'Punch_Cross', speed: 1.5, start: () => { setTimeout(() => { game.audio?.thud?.(n === 3 ? 1.2 : 1); if (game.rig) game.rig.shake = Math.max(game.rig.shake || 0, n === 3 ? 0.5 : 0.25); if (n === 3) swingDoor(d, 'bash', null); }, 220); } });
      const run = game.acts.play([{ walk: { x: sp.x + sp.nx * 0.95, z: sp.z + sp.nz * 0.95 }, face: { x: sp.x, z: sp.z }, max: 3 }, kick(1), { t: 0.25 }, kick(2), { t: 0.25 }, kick(3), { t: 0.35 }], { done: through });
      if (run) return;
    }
    game.audio?.thud?.(1); setTimeout(() => game.audio?.thud?.(1), 600); setTimeout(() => game.audio?.thud?.(1.2), 1200);
    setTimeout(through, 1500);
  }
  // the people who live there
  let occ = null;
  function occupy(d, why) {
    if (!inside || inside.d !== d) return;
    const it = inside.it, armed = Math.random() < (regionAt(d.x, d.z).sub === 'City' ? 0.15 : 0.3);
    const h = new Human(game.lib, game.lib.peopleIds[d.i % game.lib.peopleIds.length]);
    h.root.position.set(it.o.x + (Math.random() - 0.5) * 2, it.o.y + 0.05, it.o.z - it.D / 2 + 2.2);
    h.root.rotation.y = 0; h.play(armed ? 'Pistol_Aim_Neutral' : 'Crouch_Idle_Loop', 0);
    it.g.parent?.add(h.root);
    occ = { h, d, armed, t: 0, called: false, why };
    const who = game.population?.atHome(d.i)[0], name = who ? `${game.population.fullName(who)}: ` : '';
    hud.toast(name + (armed ? '"I\'ve got a gun! Get out of my house!"' : why === 'breakin' ? '"Oh my God! Get out! I\'m calling 911!"' : '"Who are you?! Get out of my house!"'), 3);
  }
  function updateOccupant(dt) {
    if (!occ) return;
    if (!inside || inside.d !== occ.d) { occ.h.root.parent?.remove(occ.h.root); occ.h.freeGpu?.(); if (!occ.called && occ.t > 1) { /* you left in time */ } occ = null; return; }
    occ.t += dt;
    const pp = player.pos, hp = occ.h.root.position;
    occ.h.root.rotation.y = Math.atan2(pp.x - hp.x, pp.z - hp.z);
    occ.h.update(dt);
    if (occ.armed) {
      if ((occ.shotT = (occ.shotT ?? 1.4) - dt) <= 0) {
        occ.shotT = 1.3 + Math.random() * 0.8; occ.h.play('Pistol_Shoot', 0.05, 1.3, true); game.audio?.gunshot?.(0.8);
        if (Math.random() < 0.55) game.hurtPlayer?.(8 + Math.random() * 7, hp.clone(), 2);
      }
    } else if (!occ.called && occ.t > (occ.why === 'breakin' ? 6 : 9)) {
      occ.called = true; hud.toast('They\'re on the phone with the police.', 2.5);
      game.police?.crime(occ.why === 'breakin' ? 'breakin' : 'trespass');
    }
  }
  // ---- the clerk behind the counter inside a shop or bar
  let clerk = null;
  function placeClerk(d, it) {
    const k = d.keeper || (d.keeper = { kind: it.kind === 'bar' ? 'bar' : 'mart', st: { id: 'in' + d.i }, shop: {} });
    if (k.taken && k.robbedDay === game.sky.day) return; // nobody behind the counter today
    k.taken = false;
    const worker = game.population?.town.residents.find((r) => r.alive && r.work === d.i);
    const look = worker ? game.lib.peopleIds[worker.look % game.lib.peopleIds.length] : game.lib.peopleIds[d.i % game.lib.peopleIds.length];
    const h = new Human(game.lib, look);
    const bar = it.kind === 'bar';
    h.root.position.set(it.o.x + (bar ? 0 : it.W / 2 - 2), it.o.y + 0.05, it.o.z + (bar ? -it.D / 2 + 1.3 : it.D / 2 - 3.4));
    h.root.rotation.y = 0; h.play('Idle_Loop', 0);
    it.g.parent?.add(h.root);
    k.h = h; k.st.keeper = worker ? game.population.fullName(worker) : 'the clerk'; k.shop.keeperFace = 0;
    (game.storeKeepers = game.storeKeepers || []).push(k);
    clerk = k;
    if (worker && Math.random() < 0.6) setTimeout(() => clerk === k && hud.toast(`${k.st.keeper}: ${bar ? '"What can I get you?"' : '"Let me know if you need anything."'}`, 2.4), 900);
  }
  function dropClerk() {
    if (!clerk) return;
    const i = game.storeKeepers.indexOf(clerk); if (i >= 0) game.storeKeepers.splice(i, 1);
    if (!clerk.taken) { clerk.h.root.parent?.remove(clerk.h.root); clerk.h.freeGpu?.(); }
    clerk = null;
  }
  function updateClerk(dt) {
    if (!clerk || clerk.taken) return;
    const hp = clerk.h.root.position, want = Math.atan2(player.pos.x - hp.x, player.pos.z - hp.z);
    clerk.h.root.rotation.y += Math.atan2(Math.sin(want - clerk.h.root.rotation.y), Math.cos(want - clerk.h.root.rotation.y)) * Math.min(1, dt * 3);
    clerk.h.update(dt);
  }
  function leave(walk = false) {
    if (!inside) return;
    dropClerk();
    if (special.has(inside.d.i)) { try { special.get(inside.d.i).leave?.(inside); } catch (e) { console.error('[estate] ' + (e && e.message), e); } }
    const { d, it } = inside;
    scene.remove(it.g);
    for (const p of insidePoints) interact.remove(p);
    insidePoints = [];
    if (game.rig && inside.zoom) game.rig.zoom = inside.zoom;
    player.pos.set(d.x + d.nx * 1.2, hm.height(d.x, d.z) + 0.1, d.z + d.nz * 1.2);
    player.pos.y = collision.surface(player.pos.x, player.pos.z, player.pos.y + 2);
    player.heading = Math.atan2(d.nx, d.nz);
    if (game.rig) game.rig.yaw = player.heading;
    inside = null; game.S.indoors = null; game.weather.indoors = false;
    if (walk && !d.b.ruined) { doorWalk(d, 'out', () => swingDoor(d, 'close', null)); return; } // you step out and it swings shut behind you
    if (!d.b.ruined) swingDoor(d, 'close', null); // it swings shut behind you
  }
  for (const d of doors) {
    const p = propByBuilding.get(d.i);
    interact.add({ x: d.x, z: d.z, r: 1.6, marker: !!p && !owned(p) ? undefined : false,
      color: p && owned(p) ? 0x60ff90 : 0xffd040, height: 1.2,
      blip: p ? { color: '#60ff90', size: 4, global: true } : null,
      show: () => !inside && d !== game.deliveryDoor, // (a delivery door: F is the knock and hand-over, systems/jobs.js)
      // no prompt: you open a door by walking into it (see walkIntoDoors); F still knocks / kicks a locked one
      label: () => (p && !owned(p) ? `${p.name} · for sale ${money(p.price)}` : ''),
      use: () => tryDoor(d, p) });
    // only owned homes show on the map
    if (p) interact.points[interact.points.length - 1].blip = null;
  }
  // ---------------- a door you can see swing ----------------
  // The street doors are painted into the facades, so when one is used a real one is put over it:
  // a dark doorway and a leaf on its hinge that swings in (slowly when you walk, banging back on
  // its hinge when you shoulder it), and shut again behind you when you come out.
  const swings = [];
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.6 });
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x050403 });
  // Your hands on the door: line up with it, reach for the handle (the door swings in as you push),
  // step through. On the way out: reach for the handle inside, then step out of the doorway while it
  // swings shut behind you. Runs in place of the usual on-foot controls (main.js: S.doorWalk).
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function doorWalk(d, mode, done) {
    const S = game.S, pp = player.pos;
    const finish = () => { if (S.doorWalk === W) S.doorWalk = null; done?.(); };
    let wx = 0, wz = 0, face = player.heading, st = null, swung = false;
    if (d) { wx = d.b.x + d.nx * (d.b.w / 2); wz = d.b.z + d.nz * (d.b.d / 2); face = Math.atan2(mode === 'out' ? d.nx : -d.nx, mode === 'out' ? d.nz : -d.nz); }
    if (mode === 'in') st = { x: wx + d.nx * 0.62, z: wz + d.nz * 0.62 };
    if (mode === 'out') { pp.set(wx + d.nx * 0.2, pp.y, wz + d.nz * 0.2); player.heading = face; swingDoor(d, 'open', null); }
    const W = { t: 0, phase: 0, mode, update(dt) {
      W.t += dt;
      if (mode === 'in') {
        if (W.phase === 0) { // line up in front of the door
          player.heading += wrapA(face - player.heading) * Math.min(1, dt * 10);
          const dx = st.x - pp.x, dz = st.z - pp.z, L = Math.hypot(dx, dz);
          if (L > 0.08 && W.t < 1.5) { const sp = Math.min(2.2, L * 5); pp.x += (dx / L) * sp * dt; pp.z += (dz / L) * sp * dt; player.h.play('Walk_Loop', 0.15, 0.8); }
          else if (L > 0.08) { pp.x = st.x; pp.z = st.z; } // (never reach for a handle you aren't standing at)
          if (L <= 0.08 || W.t >= 1.5) { W.phase = 1; W.t = 0; player.h.play('Interact', 0.1, 1.3, true); }
          pp.y = collision.surface(pp.x, pp.z, pp.y + 0.5);
        } else if (W.phase === 1) { // the hand on the handle; the door swings in
          player.heading += wrapA(face - player.heading) * Math.min(1, dt * 10);
          if (!swung && W.t > 0.28) { swung = true; swingDoor(d, 'open', null); }
          if (W.t > 0.8) { W.phase = 2; W.t = 0; }
        } else { // step through
          pp.x -= d.nx * 1.5 * dt; pp.z -= d.nz * 1.5 * dt; player.h.play('Walk_Loop', 0.15, 0.9);
          if (W.t > 0.45) { finish(); return; }
        }
      } else if (mode === 'reach') { // inside, the hand on the handle
        if (W.phase === 0) { W.phase = 1; player.h.play('Interact', 0.1, 1.3, true); }
        if (W.t > 0.5) { finish(); return; }
      } else { // out of the doorway
        player.h.play('Walk_Loop', 0.15, 0.9);
        pp.x += d.nx * 1.6 * dt; pp.z += d.nz * 1.6 * dt; pp.y = collision.surface(pp.x, pp.z, pp.y + 0.5);
        if (W.t > 0.6) { finish(); return; }
      }
      player.vel?.set(0, 0, 0);
      player.h.update(dt); player.h.root.position.copy(pp); player.h.root.rotation.y = player.heading;
    } };
    W.cancel = () => { if (mode === 'in') push.busy = false; };
    S.doorWalk = W;
    return W;
  }
  function swingDoor(d, mode, done) { // mode: 'open' | 'bash' | 'close'
    const b = d.b, wx = b.x + d.nx * (b.w / 2), wz = b.z + d.nz * (b.d / 2);
    const g = new THREE.Group();
    g.position.set(wx + d.nx * 0.06, (b.y ?? collision.surface(d.x, d.z, 50)) + 0.02, wz + d.nz * 0.06);
    g.rotation.y = Math.atan2(d.nx, d.nz);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.15), voidMat); hole.position.set(0, 1.075, -0.01); g.add(hole);
    const pivot = new THREE.Group(); pivot.position.set(-0.5, 0, 0); g.add(pivot);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.1, 0.05), leafMat); leaf.position.set(0.49, 1.05, -0.03); leaf.castShadow = true; pivot.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xb08d3a, metalness: 1, roughness: 0.35 })); knob.position.set(0.88, 1.0, 0.03); pivot.add(knob);
    scene.add(g);
    const T = mode === 'bash' ? 0.14 : 0.45;
    swings.push({ g, pivot, t: 0, T, mode, done, life: mode === 'close' ? T + 0.3 : T + 1.2 });
    if (mode !== 'close') game.audio?.click?.(mode === 'bash' ? 1 : 0.5);
  }
  function updateSwings(dt) {
    for (let i = swings.length - 1; i >= 0; i--) {
      const s = swings[i]; s.t += dt;
      const k = Math.min(1, s.t / s.T);
      let a;
      if (s.mode === 'close') a = 1.7 * (1 - k * k);
      else if (s.mode === 'bash') a = k < 1 ? 1.95 * k : 1.95 - Math.sin(Math.min(1, (s.t - s.T) / 0.5) * Math.PI) * 0.3 * Math.exp(-(s.t - s.T) * 3); // bangs back off the stop
      else a = 1.7 * (1 - Math.pow(1 - k, 3));
      s.pivot.rotation.y = a;
      if (k >= 1 && s.done) { const f = s.done; s.done = null; f(); }
      if (s.t > s.life) { scene.remove(s.g); s.g.traverse((o) => o.geometry?.dispose()); swings.splice(i, 1); }
    }
  }

  // ---------------- walking into a door ----------------
  // Walk into a door and you open it and go in; run into it and you shoulder it open. A locked door
  // rattles when you walk into it, and gives way after two or three running hits (a break-in, as if
  // you'd kicked it). Burst into a shop or a bar and whoever's working tells you to calm down.
  const CHILL = ['"Whoa, whoa! Chill out, man!"', '"Hey! Easy on the door!"', '"Jesus — what\'s the rush?"', '"You break it, you buy it, buddy."', '"Calm down! We\'re open!"', '"Damn, you trying to take it off the hinges?"'];
  const HOME_CHILL = ['"Who the hell—?! Chill out!"', '"What is wrong with you?!"', '"You can\'t just barge in here!"'];
  const sturdy = (d) => ({ warehouse: 4, office: 3, store: 3, bar: 3 })[kindOf(d)] || 2;
  const push = { d: null, t: 0, hitT: 0, rattleT: 0 };
  function walkIntoDoors(dt) {
    push.hitT -= dt; push.rattleT -= dt;
    const S = game.S;
    if (inside || S.mode !== 'foot' || S.dead > 0 || S.search || player.h?.ragdoll) { push.d = null; return; }
    const pp = player.pos, v = player.vel;
    let hit = null;
    for (const d of doors) {
      if (Math.abs(d.x - pp.x) > 3 || Math.abs(d.z - pp.z) > 3 || d.b.ruined) continue;
      const wx = d.b.x + d.nx * (d.b.w / 2), wz = d.b.z + d.nz * (d.b.d / 2); // the door, on the wall
      const out = (pp.x - wx) * d.nx + (pp.z - wz) * d.nz, lat = Math.abs((pp.x - wx) * d.nz - (pp.z - wz) * d.nx);
      const into = -(v.x * d.nx + v.z * d.nz);
      if (out > -0.1 && out < 0.75 && lat < 0.8 && into > 0.9) { hit = d; break; }
    }
    if (hit && hit === game.deliveryDoor) hit = null; // (a delivery: you knock, you don't walk in; systems/jobs.js)
    if (!hit) { push.d = null; push.t = 0; return; }
    if (push.d !== hit) { push.d = hit; push.t = 0; }
    push.t += dt;
    const p = propByBuilding.get(hit.i), run = player.speed > 5.4, k = kindOf(hit), home = k === 'home' || k === 'apartment';
    const open = lockState(hit, p) === 'open';
    if (open) {
      if (push.busy) return;
      if (run) { push.busy = true; player.h?.play?.('Punch_Cross', 0.05, 1.6, true); swingDoor(hit, 'bash', () => { push.busy = false; bash(hit, false); }); }
      else if (push.t > 0.18) { push.busy = true; doorWalk(hit, 'in', () => { push.busy = false; tryDoor(hit, p); }); } // hand on the handle, the door swings, you step through
      return;
    }
    // locked
    if (run) {
      if (push.hitT > 0) return;
      push.hitT = 0.7;
      hit.hits = (hit.hits || 0) + 1;
      game.audio?.thud?.(1 + hit.hits * 0.15);
      if (game.rig) game.rig.shake = Math.min(1, 0.35 + hit.hits * 0.15);
      player.vel.x += hit.nx * 2.5; player.vel.z += hit.nz * 2.5; // you bounce off it
      player.h?.play?.('Punch_Cross', 0.05, 1.6, true); // (a shoulder into it)
      if (hit.hits >= sturdy(hit)) { hit.hits = 0; push.busy = true; swingDoor(hit, 'bash', () => { push.busy = false; bash(hit, true); }); }
      else hud.toast(hit.hits === 1 ? '*THUD*' : '*THUD* ...it\'s giving', 1);
      if (home && someoneHome(hit) && hit.hits === 1) setTimeout(() => !inside && hud.toast('"Hey! Who\'s out there?!"', 2.2), 500);
    } else if (push.t > 0.25 && push.rattleT <= 0) {
      push.rattleT = 3;
      game.audio?.click?.(0.4);
      hud.toast(home && someoneHome(hit) && Math.random() < 0.5 ? 'Locked. Someone moves around inside.' : `Locked.  ${keyHint(game)} knock · kick it in`, 2.2);
    }
  }
  // shouldering a door open (broken: it was locked)
  function bash(d, broken) {
    push.d = null;
    game.audio?.thud?.(1.4);
    if (game.rig) game.rig.shake = 0.6;
    const p = propByBuilding.get(d.i), k = kindOf(d), home = k === 'home' || k === 'apartment';
    if (broken) {
      d.broken = 24; // stays broken until it's fixed (a game day)
      game.reportCrime?.('breakin', new THREE.Vector3(d.x, 0, d.z));
      enter(d).then?.(() => { if (home && someoneHome(d)) occupy(d, 'breakin'); else if (!home && Math.random() < 0.5) hud.toast('An alarm starts beeping somewhere.', 2.5); });
      return;
    }
    const ent = enter(d);
    const after = () => {
      if (home && !(p && owned(p))) { if (someoneHome(d)) { occupy(d, 'trespass'); hud.toast(HOME_CHILL[(Math.random() * HOME_CHILL.length) | 0], 3); } }
      else if (!(p && owned(p))) hud.toast(CHILL[(Math.random() * CHILL.length) | 0], 3);
    };
    if (ent?.then) ent.then(after); else after();
  }
  game.walkIntoDoors = walkIntoDoors;

  // owned properties: map blips + daily income from businesses
  const ownedBlips = props.map((p) => interact.add({ x: p.door.x, z: p.door.z, r: 0.1, marker: false, show: () => owned(p) && !inside, label: '', use: () => {}, blip: { color: '#60ff90', size: 5, global: true, icon: '🏠', bg: 'rgba(30,110,50,0.9)' } }));
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
    model: (p) => houseModel(p), key: (p) => p.id,
  });
  // the building as an architect's model: its real footprint and height, wall colour, windows on
  // every floor, the front door where it really is, on a little lawn
  function houseModel(p) {
    const b = p.door.b, g = new THREE.Group();
    const H = Math.max(3.5, b.h || 8), floors = Math.max(1, Math.round(H / 3.2));
    const wall = new THREE.MeshStandardMaterial({ color: b.color ?? 0xd8d0c4, roughness: 0.85 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.15, metalness: 0.3 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, H, b.d), wall); body.position.y = H / 2; g.add(body);
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(b.w + 6, 0.3, b.d + 6), new THREE.MeshStandardMaterial({ color: 0x5d7a3a, roughness: 1 })); lawn.position.y = -0.15; g.add(lawn);
    if (b.style === 4 || p.type === 'House') { // a pitched roof on houses
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, Math.hypot(b.w, b.d) * 0.55, 2.4, 4, 1), new THREE.MeshStandardMaterial({ color: 0x5a3a2c, roughness: 0.8 }));
      roof.rotation.y = Math.PI / 4; roof.scale.set(b.w / Math.hypot(b.w, b.d) * 1.45, 1, b.d / Math.hypot(b.w, b.d) * 1.45); roof.position.y = H + 1.2; g.add(roof);
    } else { const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, 0.4, b.d + 0.4), trim); cap.position.y = H + 0.2; g.add(cap); }
    const win = new THREE.BoxGeometry(1.1, 1.4, 0.12);
    for (let f = 0; f < floors; f++) for (const [ax, len, other] of [['x', b.w, b.d], ['z', b.d, b.w]]) {
      const n = Math.max(1, Math.floor((len - 2) / 3));
      for (let k = 0; k < n; k++) for (const sgn of [-1, 1]) {
        const m = new THREE.Mesh(win, glass), t = -len / 2 + (len / (n + 1)) * (k + 1);
        if (ax === 'x') m.position.set(t, 1.7 + f * 3.2, sgn * (other / 2 + 0.02)); else { m.position.set(sgn * (other / 2 + 0.02), 1.7 + f * 3.2, t); m.rotation.y = Math.PI / 2; }
        g.add(m);
      }
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.6 }));
    door.position.set(p.door.nx * (b.w / 2 + 0.05), 1.15, p.door.nz * (b.d / 2 + 0.05)); if (p.door.nx) door.rotation.y = Math.PI / 2; g.add(door);
    return g;
  }
  const officeDoor = doors.find((d) => d.b.style === 5 && Math.hypot(d.x - (CITY.x0 + 60), d.z - (CITY.z0 + 3 * CITY.pitch)) < 200) || doors[0];
  interact.add({ x: officeDoor.x + officeDoor.nx * 2.5 + 2, z: officeDoor.z + officeDoor.nz * 2.5, label: () => `${keyHint(game)} browse Gulf Coast Realty listings`, color: 0x60ff90, blip: { color: '#9fffb8', size: 5, global: true, icon: '🏡', badge: 'S' }, show: () => !inside, use: () => realtor.show() });

  // spawn at home
  if (P.home) { const p = props.find((x) => x.id === P.home); if (p) game.teleport(p.door.x + p.door.nx * 1.5, p.door.z + p.door.nz * 1.5, Math.atan2(p.door.nx, p.door.nz)); }

  return {
    props, doors, realtor, enter, leave, kindOf, someoneHome, lockState, doorWalk, swingDoor, get inside() { return inside; },
    // where a door is, for the little scenes (systems/acts.js): its middle at the wall and its outside normal
    doorSpot: doorSpotOf,
    claim: (i, spec) => special.set(i, spec), special, onEnter: (f) => enterHooks.push(f), isProperty: (i) => propByBuilding.has(i),
    update(dt = 0) {
      updateOccupant(dt);
      walkIntoDoors(dt);
      updateSwings(dt);
      updateClerk(dt);
      // broken doors get fixed after about a game day
      const now = game.sky.day * 24 + game.sky.hour;
      if (this._t != null) { const gh = now - this._t; if (gh > 0 && gh < 48) for (const d of doors) if (d.broken > 0) d.broken -= gh; }
      this._t = now;
      if (game.sky.day !== lastDay) {
        lastDay = game.sky.day;
        let pay = 0;
        for (const p of props) if (owned(p) && INCOME[p.type]) pay += Math.round(p.price * INCOME[p.type]);
        if (pay > 0) career.earn(pay, 'property income');
      }
    },
  };
}
