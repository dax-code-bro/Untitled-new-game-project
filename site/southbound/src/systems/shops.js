// More places to spend money: three clothing stores (13,500 pieces between
// them) and Gulf Mart corner stores selling food and drink in the city, Mill
// Creek, the bayou and both country settlements. John's outfit is saved and
// worn everywhere.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, TOWN, BAYOU } from '../world/layout.js';
import { nearestRoad, keyHint } from './world-util.js';
import { dressMember, placeAccessories } from './gang.js';
import { buildShop } from './gunstores.js';
import { shopOpen, closedText } from '../world/storefronts.js';
import { ClothingStore } from '../ui/clothes.js';
import { ShopUI } from '../ui/shop.js';
import { DEFAULT_OUTFIT, makeOutfitter, COLORS } from '../entities/clothing.js';

const CLOTHING = [
  { id: 'c-city', name: 'Calvera Outfitters', keeper: 'Dolores Vidrine', blurb: 'Everything, in every colour. City prices.', priceK: 1.3,
    slots: ['top', 'outer', 'bottom', 'shoes', 'hat', 'eye', 'neck', 'gloves'], wall: 0xa9cbc6, style: 'stucco', awning: 0x2f7d74, hours: 'Every day|10am – 9pm', signBg: '#13262a', signFg: '#9fc4c0', signText: '#e9f4f2',
    at: () => [[CITY.x0 + 2.5 * CITY.pitch, CITY.z0 - 40], [CITY.x0 + 6.5 * CITY.pitch, CITY.z0 - 40], [CITY.x0 - 46, CITY.z0 + 1 * CITY.pitch + 48], [CITY.x0 + CITY.nx * CITY.pitch + 46, CITY.z0 + 1.5 * CITY.pitch], [CITY.x0 + CITY.nx * CITY.pitch + 46, CITY.z0 + 4.5 * CITY.pitch], [CITY.x0 + 1.5 * CITY.pitch, CITY.z0 + CITY.nz * CITY.pitch + 46], [CITY.x0 + 5.5 * CITY.pitch, CITY.z0 + CITY.nz * CITY.pitch + 46]],
    look: { id: 'dolores', base: 'mh_f1', skin: 'brown', suit: [0.15, 0.32, 0.33], hair: 'black', h: 0.98, w: 0.95, acc: ['glasses'], lines: ['That shirt has seen things, baby. Let\'s fix you up.', 'Fitting room\'s in the back. Mirror doesn\'t lie.'] } },
  { id: 'c-town', name: 'Mill Creek Dry Goods', keeper: 'Earl Thibodeaux', blurb: 'Workwear, boots and hats. Fair prices.', priceK: 1.0,
    slots: ['top', 'outer', 'bottom', 'shoes', 'hat', 'gloves'], wall: 0x8a6a4a, style: 'brick', hours: 'Mon–Sat 8–6|Sunday closed', signBg: '#2a1c10', signFg: '#d8b46a', signText: '#f2e3c2',
    at: () => [[TOWN.x0 + 2 * TOWN.pitch, TOWN.z0 - 34], [TOWN.x0 - 34, TOWN.z0 + 2 * TOWN.pitch], [TOWN.x0 + TOWN.nx * TOWN.pitch + 34, TOWN.z0 + 2 * TOWN.pitch]],
    look: { id: 'earl', base: 'mh_m4', skin: 'light', suit: [0.42, 0.35, 0.25], hair: 'grey', h: 1.0, w: 1.1, acc: ['cap'], lines: ['Boots are by the door. Try \'em on, they don\'t bite.', 'Mama made half these shirts. The good half.'] } },
  { id: 'c-bayou', name: 'Bayou Bait & Boots', keeper: 'Clotile Guidry', blurb: 'Rubber boots, fishing shirts, hats. Cheap.', priceK: 0.9,
    slots: ['top', 'bottom', 'shoes', 'hat', 'neck', 'gloves'], wall: 0x6f8590, style: 'siding', roof: 0x9aa0a6, hours: 'Every day|6am – 7pm', signBg: '#18200f', signFg: '#b8c88a', signText: '#eef3d8',
    at: () => [[BAYOU.x + 300, BAYOU.z - 160], [BAYOU.x + 200, BAYOU.z - 340], [BAYOU.x + 420, BAYOU.z - 240]],
    look: { id: 'clotile', base: 'mh_f2', skin: 'tan', suit: [0.3, 0.38, 0.3], hair: 'brown', h: 0.96, w: 1.05, acc: ['bandana'], lines: ['White boots are half off. Everybody needs white boots.', 'You smell like gun oil, cher.'] } },
];

const FOOD = [
  { id: 'poboy', name: 'Shrimp po\'boy', price: 9, heal: 45, desc: 'Fried shrimp, dressed, on French bread.' },
  { id: 'boudin', name: 'Boudin link', price: 4, heal: 20, desc: 'Pork and rice sausage, still hot.' },
  { id: 'etouffee', name: 'Crawfish étouffée', price: 12, heal: 55, desc: 'Over rice, in a foam box.' },
  { id: 'gumbo', name: 'Cup of gumbo', price: 7, heal: 35, desc: 'Chicken and sausage, dark roux.' },
  { id: 'catfish', name: 'Fried catfish plate', price: 11, heal: 50, desc: 'With fries and hush puppies.' },
  { id: 'jerky', name: 'Beef jerky', price: 5, heal: 15, desc: 'Keeps forever in the truck.' },
  { id: 'beans', name: 'Can of red beans', price: 2, heal: 18, desc: 'Eat it cold if you have to.' },
  { id: 'pralines', name: 'Pralines', price: 3, heal: 8, desc: 'Pecan candy. Pure sugar.' },
  { id: 'coffee', name: 'Black coffee', price: 2, heal: 5, steady: 180, desc: 'Steadier hands for three minutes (less scope sway).' },
  { id: 'energy', name: 'Energy drink', price: 3, heal: 5, steady: 90, desc: 'Jittery focus. Steadier aim for a minute and a half.' },
  { id: 'tea', name: 'Sweet tea', price: 2, heal: 6, desc: 'A gallon of sugar water. Perfect.' },
  { id: 'water', name: 'Bottled water', price: 1, heal: 5, desc: 'For the heat.' },
  { id: 'firstaid', name: 'First aid kit', price: 45, heal: 70, desc: 'Gauze, tape, antiseptic.' },
];

// rails of hanging clothes on hangers, folded stacks, a mirror. All the
// garments in a store are one merged, vertex-coloured mesh.
const tint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
function garment(hex, pants, x, y, z, ry) {
  const parts = [];
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  const P = (geo, col = hex) => parts.push(tint(geo, col).applyMatrix4(m));
  P(new THREE.TorusGeometry(0.05, 0.006, 4, 10, Math.PI).rotateY(Math.PI / 2).translate(0, 0.02, 0), 0x9aa0a6); // hook
  P(new THREE.BoxGeometry(0.012, 0.012, 0.4).translate(0, -0.03, 0), 0x6a4a2a); // hanger bar
  if (pants) {
    for (const s of [-1, 1]) P(new THREE.BoxGeometry(0.035, 0.78, 0.15).translate(0, -0.44, s * 0.085).rotateX(s * 0.04));
    P(new THREE.BoxGeometry(0.04, 0.12, 0.34).translate(0, -0.1, 0));
  } else {
    P(new THREE.BoxGeometry(0.05, 0.56, 0.38).translate(0, -0.33, 0));
    P(new THREE.BoxGeometry(0.052, 0.06, 0.14).translate(0, -0.06, 0)); // collar
    for (const s of [-1, 1]) P(new THREE.BoxGeometry(0.04, 0.46, 0.09).translate(0, -0.28, 0).rotateX(s * 0.32).translate(0, -0.02, s * 0.22));
  }
  return parts;
}
function decorateClothes(seed) {
  return (g, { W, D, box, M, wood }) => {
    let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const rail = M(0x9aa0a6, 0.3, 0.9);
    const cloth = [];
    for (const [rx, rz, len] of [[-2.6, -0.6, 3.2], [2.6, -0.6, 3.2], [-2.6, 2.0, 3.2], [2.6, 2.0, 3.2]]) {
      box(len, 0.035, 0.035, rx, 1.62, rz, rail, false);
      for (const e of [-1, 1]) { box(0.035, 1.62, 0.035, rx + e * len / 2, 0.81, rz, rail, false); box(0.035, 0.035, 0.5, rx + e * len / 2, 0.02, rz, rail, false); }
      const pants = r() < 0.35;
      for (let i = 0; i < 13; i++) cloth.push(...garment(COLORS[(r() * COLORS.length) | 0][1], pants, rx - len / 2 + 0.18 + i * (len - 0.36) / 12, 1.62, rz, Math.PI / 2 + (r() - 0.5) * 0.25));
    }
    // folded stacks on the back wall shelves
    for (let k = 0; k < 3; k++) box(8.2, 0.05, 0.45, 0, 0.7 + k * 0.7, -D / 2 + 0.3, wood, false);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 12; i++) {
      const c = COLORS[(r() * COLORS.length) | 0][1], n = 2 + ((r() * 4) | 0);
      for (let j = 0; j < n; j++) cloth.push(tint(new THREE.BoxGeometry(0.42, 0.055, 0.32).translate(-3.8 + i * 0.69 + (r() - 0.5) * 0.03, 0.755 + k * 0.7 + j * 0.058, -D / 2 + 0.3), c));
    }
    const mesh = new THREE.Mesh(mergeGeometries(cloth), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.noHit = true;
    g.add(mesh);
    box(0.9, 1.9, 0.04, W / 2 - 0.25, 1.15, -D / 2 + 2.2, new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.02, metalness: 1 }), false).rotation.y = -Math.PI / 2;
  };
}
function decorateMart(g, { W, D, box, M }) {
  const shelf = M(0xd8d8d0, 0.6);
  const goods = [0xc0392b, 0xe67e22, 0xf1c40f, 0x27ae60, 0x2980b9, 0x8e44ad, 0xecf0f1, 0x7f5a3a];
  for (const sx of [-2.6, 0, 2.6]) {
    box(1.8, 1.5, 0.7, sx, 0.75, 0.6, shelf, false);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) box(0.18, 0.22, 0.18, sx - 0.75 + i * 0.3, 0.35 + k * 0.45, 0.6 + (i % 2 ? 0.25 : -0.25), M(goods[(i * 3 + k) % goods.length], 0.5), false);
  }
  // drinks cooler on the side wall
  const cooler = box(0.6, 2.0, 2.6, -W / 2 + 0.5, 1.0, -0.8, M(0x30353a, 0.4, 0.6), false);
  void cooler;
  box(0.05, 1.7, 2.4, -W / 2 + 0.82, 1.0, -0.8, new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x6fa8c8, emissiveIntensity: 0.5, transparent: true, opacity: 0.45 }), false);
  for (let k = 0; k < 4; k++) for (let i = 0; i < 7; i++) box(0.08, 0.2, 0.08, -W / 2 + 0.6, 0.35 + k * 0.42, -1.9 + i * 0.35, M(goods[(i + k) % goods.length], 0.35), false);
  // the counter gets a register
  box(0.4, 0.25, 0.35, 1.4, 1.17, -D / 2 + 2.6, M(0x222222, 0.5, 0.3), false);
}

export function installShops(game) {
  const { scene, graph, lib, interact, hud, career, player, S } = game;
  const P = career.p;

  // ---------------- John's clothes
  P.outfit = P.outfit || { ...DEFAULT_OUTFIT };
  P.wardrobe = P.wardrobe || Object.values(DEFAULT_OUTFIT).filter(Boolean);
  const skinHex = 0xb98264;
  const fit = makeOutfitter(player.h, skinHex);
  game.outfitter = fit; // (systems/grooming.js: dirt and blood on what you wear)
  const wear = (o) => { if (fit.ok) fit.apply(o); game.refreshGear?.(); };
  wear(P.outfit);
  game.wearOutfit = wear;
  game.setHeadwearVisible = (v) => { if (fit.ok) fit.headVisible(v); };
  const ui = new ClothingStore({ lib, career, getMoney: () => career.money, spend: (n) => career.spend(n), pause: game.pause, toast: (t) => hud.toast(t, 2.2), wear, skinHex });
  game.clothingStore = ui;
  game.openWardrobe = () => { ui.slot = 'ward'; ui.show({ id: 'wardrobe', name: 'Wardrobe', keeper: 'John Cortes', blurb: 'Everything you own', priceK: 1, slots: [] }); };
  if (game.hideout) {
    const H = game.hideout;
    interact.add({ x: H.x - 7, z: H.z + 3, r: 1.6, label: () => `${keyHint(game)} change clothes (locker)`, color: 0x9fc4c0, show: () => S.mode === 'foot', use: () => game.openWardrobe() });
  }

  const keepers = [];
  const place = (st, kind) => {
    let shop = null;
    for (const [ax, az] of st.at()) {
      const r = nearestRoad(graph, ax, az) || { x: ax, z: az, tx: 1, tz: 0 };
      shop = buildShop(game, r, st);
      if (shop) break;
    }
    if (!shop) return null;
    const spawnKeeper = () => { const h = dressMember(lib, { ...st.look, name: st.keeper }); h.root.position.copy(shop.keeper); h.root.rotation.y = shop.keeperFace; h.play('Idle_Loop', 0); scene.add(h.root); return h; };
    const k = { h: spawnKeeper(), st, shop, kind };
    k.revive = () => { k.h = spawnKeeper(); }; // a new clerk the next day (systems/robbery.js)
    keepers.push(k);
    (game.storeKeepers = game.storeKeepers || []).push(k);
    return shop;
  };

  CLOTHING.forEach((st, i) => { st.decorate = decorateClothes(31 + i * 17); });
  for (const st of CLOTHING) {
    const shop = place(st, 'clothes');
    if (!shop) continue;
    const kp = keepers[keepers.length - 1]; // nobody to serve you if the clerk is gone (systems/robbery.js)
    interact.add({ x: shop.counter.x, z: shop.counter.z, r: 2.3, marker: false, y: shop.y,
      blip: { color: '#9fc4c0', size: 5, global: true, icon: '👕', badge: 'S' },
      show: () => S.mode === 'foot' && !kp.taken,
      label: () => `${keyHint(game)} talk to ${st.keeper}`,
      use: () => !shopOpen(st.id, game.sky.hour) ? hud.toast(closedText(st.name, st.id), 3) : game.openDialog(st.keeper, st.look.lines[(Math.random() * st.look.lines.length) | 0], [
        ['I\'d like to look at some clothes.', () => ui.show(st)],
        ['I just need the fitting room.', () => { ui.slot = 'ward'; ui.show(st); }],
        ['Just looking. Bye.', () => {}],
      ]) });
  }

  // ---------------- Gulf Mart
  P.food = P.food || {};
  game.buffs = game.buffs || {};
  const eat = (f, here = false) => {
    player.health = Math.min(player.maxHealth || 100, player.health + f.heal);
    game.feed?.(f.id === 'water' || f.id === 'tea' || f.id === 'coffee' || f.id === 'energy' ? 4 : f.id === 'firstaid' ? 0 : f.heal * 0.9);
    if (f.steady) game.buffs.steady = Math.max(game.buffs.steady || 0, f.steady);
    hud.toast(`${f.name}: +${f.heal} health${f.steady ? ' · steadier hands' : ''}`, 2.2);
    // (A2) eaten for real: bite by bite (handed over the counter first when you eat in)
    const A = game.acts;
    if (A && here) A.nextGoods = { mesh: foodModel(f), then: (m) => A.eatBeats(m) };
    else if (A && S.mode === 'foot' && !S.doorWalk) A.play(A.eatBeats(foodModel(f)));
    else player.h.play?.('Interact', 0.2);
  };
  // what's on the counter (for the showroom stand)
  const foodModel = (f) => {
    const g = new THREE.Group(), M = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
    const foam = M(0xf4f2ec, 0.9), paper = M(0xe8dcc0, 0.95);
    switch (f.id) {
      case 'poboy': { add(new THREE.CapsuleGeometry(0.045, 0.2, 6, 12), M(0xc8904a, 0.8), 0, 0.05, 0, 0, 0, Math.PI / 2); for (let k = 0; k < 6; k++) add(new THREE.TorusGeometry(0.014, 0.008, 6, 10, Math.PI * 1.4), M(0xd07040, 0.7), -0.09 + k * 0.036, 0.085, 0.01, 0, 0, 0.3); add(new THREE.BoxGeometry(0.26, 0.004, 0.06), M(0x6aa040, 0.8), 0, 0.075, 0.03); add(new THREE.BoxGeometry(0.34, 0.004, 0.2), paper, 0, 0.002, 0); break; }
      case 'boudin': add(new THREE.TorusGeometry(0.07, 0.022, 10, 24, Math.PI * 1.5), M(0x9a5a3a, 0.5), 0, 0.03, 0, Math.PI / 2, 0, 0); add(new THREE.BoxGeometry(0.22, 0.004, 0.18), paper); break;
      case 'etouffee': case 'catfish': { add(new THREE.BoxGeometry(0.22, 0.05, 0.2), foam, 0, 0.025, 0); const lid = add(new THREE.BoxGeometry(0.22, 0.03, 0.2), foam, 0, 0.1, -0.12, -1.2, 0, 0); void lid; if (f.id === 'catfish') for (let k = 0; k < 3; k++) add(new THREE.CapsuleGeometry(0.02, 0.07, 4, 8), M(0xc89040, 0.8), -0.05 + k * 0.05, 0.06, 0.02, 0, k, Math.PI / 2); else { add(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 18), M(0xb85a24, 0.4), 0, 0.052, 0.01); add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14), M(0xf2efe6, 0.8), 0.02, 0.058, 0.02); } break; }
      case 'gumbo': case 'coffee': case 'tea': { const h = f.id === 'gumbo' ? 0.08 : 0.14; add(new THREE.CylinderGeometry(0.045, 0.035, h, 20), f.id === 'coffee' ? paper : foam, 0, h / 2, 0); add(new THREE.CylinderGeometry(0.047, 0.047, 0.01, 20), M(f.id === 'gumbo' ? 0x5a3418 : 0x202020, 0.4), 0, h, 0); if (f.id === 'tea') add(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6), M(0xc02020, 0.4), 0.015, h + 0.04, 0, 0, 0, 0.15); break; }
      case 'jerky': add(new THREE.BoxGeometry(0.14, 0.2, 0.03), M(0x8a2a1c, 0.5), 0, 0.1, 0); add(new THREE.BoxGeometry(0.1, 0.06, 0.002), M(0xe8c040, 0.6), 0, 0.12, 0.016); break;
      case 'beans': case 'energy': { const h = f.id === 'energy' ? 0.16 : 0.11; add(new THREE.CylinderGeometry(0.035, 0.035, h, 20), M(f.id === 'energy' ? 0x20a040 : 0xb02a20, 0.35, 0.6), 0, h / 2, 0); add(new THREE.CylinderGeometry(0.033, 0.033, 0.004, 20), M(0xc8ccd0, 0.3, 1), 0, h + 0.002, 0); break; }
      case 'pralines': for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(0.03, 0.032, 0.012, 14), M(0xa86a30, 0.6), (k % 3) * 0.065 - 0.065, 0.006 + (k > 2 ? 0.012 : 0), (k > 2 ? 0.03 : 0)); add(new THREE.BoxGeometry(0.24, 0.004, 0.12), paper); break;
      case 'water': add(new THREE.CylinderGeometry(0.032, 0.032, 0.19, 18), new THREE.MeshStandardMaterial({ color: 0xbcd8ec, roughness: 0.05, transparent: true, opacity: 0.55 }), 0, 0.095, 0); add(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), M(0x2a6ac0, 0.4), 0, 0.2, 0); add(new THREE.CylinderGeometry(0.033, 0.033, 0.06, 18), M(0x3a8ad0, 0.5), 0, 0.1, 0); break;
      default: add(new THREE.BoxGeometry(0.22, 0.1, 0.16), M(0xc8302a, 0.45), 0, 0.05, 0); add(new THREE.BoxGeometry(0.06, 0.02, 0.002), M(0xffffff), 0, 0.05, 0.081); add(new THREE.BoxGeometry(0.02, 0.06, 0.002), M(0xffffff), 0, 0.05, 0.081);
    }
    return g;
  };
  const mart = new ShopUI({
    title: 'Gulf Mart', getMoney: () => career.money, pause: game.pause,
    model: (f) => foodModel(f), key: (f) => f.id,
    tabs: [{ k: 'here', label: 'Eat here' }, { k: 'go', label: 'To go (carry up to 5)' }],
    note: (t) => t === 'here' ? `Health ${Math.round(player.health)} / 100` : 'Food you carry is in the phone\'s Inventory tab.',
    items: () => FOOD,
    row: (f, t) => ({ name: f.name, sub: `${f.desc} · +${f.heal} health${t === 'go' && P.food[f.id] ? ` · carrying ${P.food[f.id]}` : ''}`, stats: [], btn: `$${Math.round(f.price * mart.k)}`, cls: t === 'go' && (P.food[f.id] || 0) >= 5 ? 'dis' : '' }),
    act: (f, t) => {
      if (t === 'go' && (P.food[f.id] || 0) >= 5) return;
      if (!career.spend(Math.round(f.price * mart.k))) return;
      if (t === 'here') eat(f, true); else { P.food[f.id] = (P.food[f.id] || 0) + 1; hud.toast(`${f.name} to go`, 1.5); }
    },
  });
  mart.k = 1;
  game.mart = mart;
  game.foodInventory = () => FOOD.filter((f) => P.food[f.id] > 0).map((f) => ({ food: true, name: f.name, sub: `× ${P.food[f.id]} · +${f.heal} health${f.steady ? ', steadier aim' : ''}`, eat: () => { P.food[f.id]--; eat(f); career.saveSoon(); } }));
  const MARTS = [
    { id: 'm-city', priceK: 1.2, look: 'mh_m2', at: () => [[CITY.x0 + 4.5 * CITY.pitch, CITY.z0 - 40], [CITY.x0 - 46, CITY.z0 + 3 * CITY.pitch + 48], [CITY.x0 + CITY.nx * CITY.pitch + 46, CITY.z0 + 2.5 * CITY.pitch], [CITY.x0 + 3.5 * CITY.pitch, CITY.z0 + CITY.nz * CITY.pitch + 46], [CITY.x0 - 46, CITY.z0 + 5 * CITY.pitch + 48]] },
    { id: 'm-town', priceK: 1.0, look: 'mh_f1', at: () => [[TOWN.x0 + TOWN.pitch, TOWN.z0 + TOWN.nz * TOWN.pitch + 34], [TOWN.x0 + 3 * TOWN.pitch, TOWN.z0 - 34]] },
    { id: 'm-bayou', priceK: 0.95, look: 'mh_m1', at: () => [[BAYOU.x + 120, BAYOU.z - 260], [BAYOU.x + 330, BAYOU.z - 420]] },
    ...(game.city.junk || []).filter((j) => j.kind === 'sign').map((j, i) => ({ id: 'm-h' + i, priceK: 1.05, look: i ? 'mh_f2' : 'mh_m3', at: () => Array.from({ length: 12 }, (_, k) => [j.x + Math.cos(k * 2.1) * (30 + k * 6), j.z + Math.sin(k * 2.1) * (30 + k * 6)]) })),
  ];
  const names = ['Pete', 'Lynette', 'Boo', 'Arnold', 'Shanice', 'Ray'];
  MARTS.forEach((m, i) => {
    const st = { ...m, name: 'Gulf Mart', keeper: names[i % names.length], wall: 0xe8e4dc, style: 'block', band: 0xb3241f, hours: 'OPEN|24 HOURS', signBg: '#7a1410', signFg: '#f4c430', signText: '#ffffff', decorate: decorateMart,
      look: { id: 'mart' + i, base: m.look, skin: ['brown', 'tan', 'light', 'dark'][i % 4], suit: [0.55, 0.12, 0.1], hair: ['black', 'brown', 'grey'][i % 3], h: 1, w: 1 + (i % 3) * 0.08, acc: i % 2 ? ['cap'] : [], lines: [] } };
    const shop = place(st, 'mart');
    if (!shop) return;
    const kp = keepers[keepers.length - 1]; // nobody to serve you if the clerk is gone (systems/robbery.js)
    interact.add({ x: shop.counter.x, z: shop.counter.z, r: 2.3, marker: false, y: shop.y,
      blip: { color: '#f4c430', size: 4, global: true, icon: '🥪', badge: 'S' },
      show: () => S.mode === 'foot' && !kp.taken,
      label: () => `${keyHint(game)} buy food & drink`,
      use: () => { mart.k = m.priceK; mart.show('here', `Gulf Mart · ${st.keeper} at the register`); } });
  });

  game.shopSpots = keepers.map((k) => ({ id: k.st.id, name: k.st.name, kind: k.kind, x: k.shop.counter.x, z: k.shop.counter.z, face: k.shop.keeperFace }));
  return {
    keepers,
    update(dt) {
      if (game.buffs.steady > 0) game.buffs.steady -= dt;
      for (const k of keepers) {
        if (k.taken) continue; // came out from behind the counter (systems/robbery.js)
        const d = k.h.root.position.distanceTo(player.pos);
        k.h.root.visible = d < 90 && shopOpen(k.st.id, game.sky.hour);
        if (!k.h.root.visible) continue;
        if (d < 8) { const want = Math.atan2(player.pos.x - k.h.root.position.x, player.pos.z - k.h.root.position.z); k.h.root.rotation.y += Math.atan2(Math.sin(want - k.h.root.rotation.y), Math.cos(want - k.h.root.rotation.y)) * Math.min(1, dt * 3); }
        k.h.update(dt);
        placeAccessories(k.h);
      }
    },
  };
}
void THREE;
