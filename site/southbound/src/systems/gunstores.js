// The three gunsmiths in Calvera. Walk in, talk to the owner behind the counter,
// say you're interested in buying something. The Port Calvera store carries
// nearly everything (at city prices); Mill Creek and the bayou trading post
// carry less and charge less.
import * as THREE from 'three';
import { WEAPONS, CATEGORIES, buildWeaponModel } from '../entities/arsenal.js';
import { CITY, TOWN, BAYOU } from '../world/layout.js';
import { nearestRoad, keyHint } from './world-util.js';
import { dressMember, placeAccessories } from './gang.js';
import { GunStore } from '../ui/gunstore.js';
import { ATTACHMENTS } from '../entities/arsenal.js';
import { wallMaterial, dressStorefront, shopOpen, SHOP_HOURS as SHOP_H } from '../world/storefronts.js';

const ALL = ['pistol', ...Object.keys(WEAPONS).filter((id) => id !== 'fists' && id !== 'pistol')]; // the Standard 9mm first: it's where everyone starts
const pickIds = (cats, every) => ALL.filter((id, i) => cats.includes(WEAPONS[id].cat) && i % every === 0);

export const STORES = [
  { id: 'city', name: 'Calvera Arms Exchange', keeper: 'Walt Ferreira', blurb: 'The biggest selection in the state. City prices.', priceK: 1.25, style: 'brick', wall: 0x7a3b2a, bars: true, hours: 'Mon–Sat 9–7|Sunday 12–5',
    cats: CATEGORIES.map((c) => c.k), every: 1, at: () => [[CITY.x0 - 46, CITY.z0 + 2 * CITY.pitch + 30], [CITY.x0 - 40, CITY.z0 + 4 * CITY.pitch + 40], [CITY.x0 + 3 * CITY.pitch, CITY.z0 - 40], [CITY.x0 + 5 * CITY.pitch, CITY.z0 - 40], [CITY.x0 + CITY.nx * CITY.pitch + 40, CITY.z0 + 3 * CITY.pitch]],
    look: { id: 'walt', base: 'mh_m3', skin: 'light', suit: [0.25, 0.3, 0.25], hair: 'grey', h: 1.0, w: 1.15, acc: ['glasses'], lines: ['Look all you want. Touch with your eyes.', 'Everything in here is legal. Mostly.'] } },
  { id: 'town', name: 'Mill Creek Guns & Tackle', keeper: 'June Albright', blurb: 'Hunting, home defence and fishing line.', priceK: 1.0, style: 'siding', wall: 0x5d7a5a, roof: 0x8a8f94, signBg: '#f2ead2', signFg: '#2f4a2a', signText: '#2f4a2a', hours: 'Mon–Sat 6–6|Closed Sunday',
    cats: ['pistol', 'shotgun', 'rifle', 'marksman', 'bow', 'melee'], every: 2, at: () => [[TOWN.x0 + TOWN.nx * TOWN.pitch + 34, TOWN.z0 + TOWN.pitch], [TOWN.x0 - 34, TOWN.z0 + TOWN.pitch], [TOWN.x0 + TOWN.pitch, TOWN.z0 - 34]],
    look: { id: 'june', base: 'mh_f2', skin: 'light', suit: [0.6, 0.3, 0.25], hair: 'blond', h: 0.97, w: 1.0, acc: ['cap'], lines: ['Deer season\'s coming. You hunt?', 'Don\'t point that at my window.'] } },
  { id: 'bayou', name: 'Boudreaux Trading Post', keeper: 'Pierre Boudreaux', blurb: 'Rifles, bows and shells for the swamp. Cash only.', priceK: 0.92, style: 'siding', wall: 0x6b5a44, roof: 0x7d5a40, signBg: '#3a2a1a', signFg: '#e8c27a', signText: '#f2e3c2', hours: 'Open 5am|till the fish quit', porchProps: (add, M, W, D) => { for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.7, 0.4, 0.7), M(0x6a7a5a, 0.8, 0.5), -W / 2 + 0.6 + i * 0.8, 0.35 + (i === 2 ? 0.4 : 0), D / 2 + 1.5); },
    cats: ['pistol', 'shotgun', 'marksman', 'sniper', 'bow', 'melee'], every: 3, at: () => [[BAYOU.x + 260, BAYOU.z - 220], [BAYOU.x + 380, BAYOU.z - 300], [BAYOU.x + 150, BAYOU.z - 420]],
    look: { id: 'pierre', base: 'mh_m1', skin: 'tan', suit: [0.45, 0.38, 0.28], hair: 'grey', h: 1.02, w: 1.2, acc: ['cap'], lines: ['Gator got my last customer. Kidding. He paid first.', 'Shells are by the box, cher.'] } },
];

export function installGunStores(game) {
  const { scene, collision, hm, graph, lib, interact, hud, career, combat, S } = game;
  const P = career.p;
  P.weapons.count = P.weapons.count || {};
  for (const st of STORES) st.ids = pickIds(st.cats, st.every);

  const ui = new GunStore({
    combat, career,
    getMoney: () => career.money, spend: (n) => career.spend(n), pause: game.pause, toast: (t) => hud.toast(t, 2.2),
    storyDone: () => P.missions?.done?.length || 0,
    silhouette: (id) => game.silhouetteOf(id),
    applyFinishTo: (id) => game.applyFinishTo?.(id),
    fitAttachment: (id, att) => game.fitAttachment?.(id, att),
  });
  game.gunStore = ui;

  // dialog box
  const dlg = document.createElement('div');
  dlg.className = 'sbdialog';
  document.body.appendChild(dlg);
  const openDialog = (who, line, options) => {
    dlg.innerHTML = `<div class="who">${who}</div><div class="line">${line}</div><div class="opts">${options.map((o, i) => `<button data-i="${i}"><kbd>${i + 1}</kbd>${o[0]}</button>`).join('')}</div>`;
    dlg.classList.add('show'); game.pause(true);
    const pick = (i) => { dlg.classList.remove('show'); removeEventListener('keydown', key, true); game.pause(false); options[i][1](); };
    const key = (e) => { const n = +e.key; if (n >= 1 && n <= options.length) { e.preventDefault(); pick(n - 1); } if (e.code === 'Escape') { e.preventDefault(); pick(options.length - 1); } };
    addEventListener('keydown', key, true);
    dlg.querySelectorAll('button').forEach((b) => { b.onclick = () => pick(+b.dataset.i); });
  };
  game.openDialog = openDialog;

  const keepers = [];
  for (const st of STORES) {
    let shop = null;
    for (const [ax, az] of st.at()) { // first candidate spot with room for it
      const r = nearestRoad(graph, ax, az) || { x: ax, z: az, tx: 1, tz: 0 };
      shop = buildShop(game, r, st);
      if (shop) break;
    }
    if (!shop) continue;
    // the owner behind the counter
    const h = dressMember(lib, { ...st.look, name: st.keeper, role: 'Gunsmith' });
    h.root.position.copy(shop.keeper);
    h.root.rotation.y = shop.keeperFace;
    h.play('Idle_Loop', 0);
    scene.add(h.root);
    keepers.push({ h, st, shop });
    interact.add({ x: shop.counter.x, z: shop.counter.z, r: 2.3, marker: false, y: shop.y,
      blip: { color: '#d8b46a', size: 5, global: true, icon: '🔫', badge: 'S' },
      show: () => S.mode === 'foot',
      label: () => `${keyHint(game)} talk to ${st.keeper}`,
      use: () => !shopOpen(st.id, game.sky.hour) ? hud.toast(`${st.name} is closed. Open ${(SHOP_H[st.id] || [9, 19]).map((h) => (h > 12 ? h - 12 + ' PM' : h + ' AM')).join(' – ')}.`, 3) : openDialog(st.keeper, st.look.lines[(Math.random() * st.look.lines.length) | 0], [
        ['I\'m interested in buying something.', () => ui.show(st)],
        ['Got any ammo deals?', () => { const w = combat.def; if (w.melee) { hud.toast('Draw a gun first and I\'ll find the right box.', 3); return; } if (career.spend(60)) { const a = combat.ammo[combat.weapon]; if (a) a.reserve += w.clip * 4; hud.toast(`Bulk ammo for your ${w.name}`, 2.5); } }],
        ['Just looking. Bye.', () => {}],
      ]) });
  }
  game.gunStoreDefs = STORES;
  game.gunShops = keepers.map((k) => ({ id: k.st.id, name: k.st.name, x: k.shop.counter.x, z: k.shop.counter.z, face: k.shop.keeperFace }));
  // one lamp for every shop interior: it lights whichever shop you're in or next to.
  // (A light per building would make every shader in the game loop over all of them.)
  const shopLamp = new THREE.PointLight(0xfff0d8, 0, 13, 2);
  scene.add(shopLamp);
  return {
    update(dt) {
      let best = null, bd = 30 * 30;
      for (const p of game.shopLamps || []) { const d = (p.x - game.player.pos.x) ** 2 + (p.z - game.player.pos.z) ** 2; if (d < bd) { bd = d; best = p; } }
      if (best) { shopLamp.position.copy(best); shopLamp.intensity = 10; } else shopLamp.intensity = 0;
      // shop doors swing open as you walk up
      for (const d of game.shopDoors || []) {
        const open = shopOpen(d.id, game.sky.hour);
        if (d.sign) d.sign.visible = open;
        const near = open && Math.hypot(game.player.pos.x - d.x, game.player.pos.z - d.z) < 3.4 && S.mode === 'foot';
        const want = near ? 1.25 : 0;
        if (Math.abs(d.a - want) < 0.001) continue;
        d.a += Math.sign(want - d.a) * Math.min(Math.abs(want - d.a), dt * 2.8);
        for (const l of d.leaves) l.pivot.rotation.y = l.s * d.a;
      }
      for (const k of keepers) {
        const d = k.h.root.position.distanceTo(game.player.pos);
        k.h.root.visible = d < 90 && shopOpen(k.st.id, game.sky.hour);
        if (!k.h.root.visible) continue;
        // watch the customer
        if (d < 8) k.h.root.rotation.y += Math.atan2(Math.sin(Math.atan2(game.player.pos.x - k.h.root.position.x, game.player.pos.z - k.h.root.position.z) - k.h.root.rotation.y), Math.cos(Math.atan2(game.player.pos.x - k.h.root.position.x, game.player.pos.z - k.h.root.position.z) - k.h.root.rotation.y)) * Math.min(1, dt * 3);
        k.h.update(dt);
        placeAccessories(k.h);
      }
    },
  };
}

// A small single-storey gun shop beside the road: door, windows, counter,
// guns on the back wall, a sign, a light. Walls are solid.
export function buildShop(game, r, st) {
  const { collision, hm, scene } = game;
  const W = 10, D = 9, H = 4.2, t = 0.3;
  const ax = Math.abs(r.tx) > Math.abs(r.tz) ? [0, 1] : [1, 0];
  for (const sgn of [1, -1]) {
    const nx = ax[0] * sgn, nz = ax[1] * sgn;
    const off = (r.w || 8) + 6 + D / 2;
    const cx = r.x + nx * off, cz = r.z + nz * off;
    const hw = (nx ? D : W) / 2, hd = (nx ? W : D) / 2;
    let blocked = false;
    collision.query(cx, cz, Math.max(hw, hd) + 2, (it) => { if (it.t === 0 && cx + hw > it.minX && cx - hw < it.maxX && cz + hd > it.minZ && cz - hd < it.maxZ) blocked = true; });
    const ys = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => hm.height(cx + a * hw, cz + b * hd));
    // no road may run through the lot (only the one it faces, out front)
    const nr = nearestRoad(game.graph, cx, cz);
    if (nr && nr.dist < Math.hypot(hw, hd) + (nr.edge.width || 8) / 2 + 0.5) blocked = true;
    if (blocked || Math.max(...ys) - Math.min(...ys) > 2 || Math.min(...ys) < hm.waterLevel(cx, cz) + 0.4) continue;
    (game.shopSites || (game.shopSites = [])).push([Math.round(cx), Math.round(cz)]); // where every shop ended up (QA)
    const y = Math.max(...ys) + 0.06;
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    g.rotation.y = Math.atan2(-nx, -nz); // front (+z local) faces the road
    const M = (c, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const wall = st.style ? wallMaterial(st) : M(st.wall || 0x8c7f6e), trim = M(0x2b2420), wood = M(0x5a3a22, 0.6), floor = M(0x6d6458, 0.8), glass = new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35 });
    wall.userData.surf = { brick: 'brick', 'civic-brick': 'brick', siding: 'frame', stucco: 'stucco', metal: 'metal', quonset: 'metal', block: 'block', civic: 'masonry' }[st.style] || 'block';
    wood.userData.surf = 'wood';
    const box = (w, h, d, x, yy, z, m, hit = true) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, yy, z); b.castShadow = b.receiveShadow = true; if (hit) b.userData.hitStatic = true; g.add(b); return b; };
    box(W, 1, D + 2.4, 0, -0.5, 1.2, floor);
    const parts = { back: [], sides: [], roof: [], awning: [], front: [] };
    parts.back.push(box(W + 2 * t, H, t, 0, H / 2, -D / 2, wall)); // back
    parts.sides.push(box(t, H, D, -W / 2, H / 2, 0, wall), box(t, H, D, W / 2, H / 2, 0, wall)); // sides
    // front: door gap in the middle, shop windows either side
    const side = (W - 1.8) / 2;
    const frontParts = [];
    for (const s of [-1, 1]) {
      frontParts.push(box(side, 0.9, t, s * (0.9 + side / 2), 0.45, D / 2, wall));
      frontParts.push(box(side, 1.0, t, s * (0.9 + side / 2), H - 0.5, D / 2, wall));
      frontParts.push(box(side - 0.1, H - 1.9, 0.05, s * (0.9 + side / 2), 0.9 + (H - 1.9) / 2, D / 2, glass, false));
    }
    frontParts.push(box(1.8, H - 2.5, t, 0, 2.5 + (H - 2.5) / 2, D / 2, wall)); // over the door
    parts.front.push(...frontParts);
    parts.roof.push(box(W + 2 * t + 0.4, 0.25, D + 0.6, 0, H + 0.12, 0, trim)); // roof
    parts.awning.push(box(W + 0.6, 0.12, 1.4, 0, 2.75, D / 2 + 0.7, trim)); // awning
    // the street face: style, door, OPEN sign
    const front = dressStorefront(g, st, { W, D, H, t, box, M, hide: (k) => { for (const m of parts[k] || []) m.visible = false; } });
    if (st.style === 'quonset') { const ceil = box(W, 0.1, D, 0, H + 0.05, 0, M(0x4a4a3e, 0.8), false); void ceil; }
    // counter and the wall of guns
    box(5.2, 1.0, 0.7, 0, 0.5, -D / 2 + 2.6, wood);
    box(5.2, 0.05, 0.75, 0, 1.02, -D / 2 + 2.6, glass, false);
    if (st.decorate) st.decorate(g, { W, D, H, box, M, wood, glass });
    else {
    const rackIds = st.ids.filter((id, i) => i % Math.max(1, Math.floor(st.ids.length / 9)) === 0).slice(0, 9);
    rackIds.forEach((id, i) => {
      const m = buildWeaponModel(WEAPONS[id]);
      const col = i % 3, row = Math.floor(i / 3);
      m.position.set(-2.4 + col * 2.4, 1.3 + row * 0.75, -D / 2 + 0.22);
      m.rotation.set(0, Math.PI / 2, 0);
      const s = (m.userData.hold?.len || 0.6) > 0.5 ? 1 : 1.6;
      m.scale.setScalar(s);
      m.traverse((o) => { if (o.isMesh) o.userData.noHit = true; });
      g.add(m);
    });
        box(8.2, 0.08, 0.3, 0, 1.12, -D / 2 + 0.25, wood, false); box(8.2, 0.08, 0.3, 0, 1.87, -D / 2 + 0.25, wood, false); box(8.2, 0.08, 0.3, 0, 2.62, -D / 2 + 0.25, wood, false);
    }
    // sign
    const c = document.createElement('canvas'); c.width = 768; c.height = 128;
    const x2 = c.getContext('2d'); x2.fillStyle = st.signBg || '#16120e'; x2.fillRect(0, 0, 768, 128); x2.strokeStyle = st.signFg || '#c9a96a'; x2.lineWidth = 6; x2.strokeRect(8, 8, 752, 112);
    x2.fillStyle = st.signText || '#e8d3a8'; let fs = 58; do { x2.font = `bold ${fs}px Oswald, Impact, sans-serif`; fs -= 2; } while (x2.measureText(st.name.toUpperCase()).width > 700 && fs > 20); x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(st.name.toUpperCase(), 384, 66);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.17), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
    sign.position.set(0, st.style === 'block' ? H - 0.15 : H - 0.5, D / 2 + (st.style === 'block' ? 0.37 : 0.26)); g.add(sign); // corner stores: on the fascia band
    if (st.style === 'civic') { sign.scale.set(0.6, 0.6, 1); sign.position.set(0, H + 0.92, D / 2 + 2.43); } // civic: on the pediment, above the columns
    // a ceiling light panel; the actual light is one shared lamp that follows you between shops
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff6e8 })); panel.position.set(0, H - 0.08, -0.5); panel.userData.noHit = true; g.add(panel);
    scene.add(g);
    g.updateMatrixWorld(true);
    const wb = (lx0, lz0, lx1, lz1, y0 = y - 1, y1 = y + H) => {
      const p0 = new THREE.Vector3(lx0, 0, lz0).applyMatrix4(g.matrixWorld), p1 = new THREE.Vector3(lx1, 0, lz1).applyMatrix4(g.matrixWorld);
      collision.addBox(Math.min(p0.x, p1.x), Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), Math.max(p0.z, p1.z), y0, y1, { shop: st.id });
    };
    wb(-W / 2 - t, -D / 2 - t / 2, W / 2 + t, -D / 2 + t / 2);
    wb(-W / 2 - t / 2, -D / 2, -W / 2 + t / 2, D / 2); wb(W / 2 - t / 2, -D / 2, W / 2 + t / 2, D / 2);
    wb(-W / 2, D / 2 - t / 2, -0.9, D / 2 + t / 2); wb(0.9, D / 2 - t / 2, W / 2, D / 2 + t / 2);
    wb(-2.6, -D / 2 + 2.25, 2.6, -D / 2 + 2.95, y - 1, y + 1.0); // counter
    { const p0 = new THREE.Vector3(-W / 2, 0, -D / 2).applyMatrix4(g.matrixWorld), p1 = new THREE.Vector3(W / 2, 0, D / 2 + 2.4).applyMatrix4(g.matrixWorld);
      collision.addBox(Math.min(p0.x, p1.x), Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), Math.max(p0.z, p1.z), y - 2, y - 0.06, { walkable: true }); }
    const L = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld);
    const keeper = L(0, -D / 2 + 1.7); keeper.y = y;
    const counter = L(0, -D / 2 + 3.6);
    const doorAt = L(0, D / 2 + 0.5);
    const lampAt = L(0, -0.5); lampAt.y = y + H - 0.5;
    (game.shopLamps = game.shopLamps || []).push(lampAt);
    (game.shopDoors = game.shopDoors || []).push({ leaves: front.leaves, sign: front.sign, id: st.id, x: doorAt.x, z: doorAt.z, a: 0 });
    return { g, y, keeper, keeperFace: g.rotation.y, counter: { x: counter.x, z: counter.z } };
  }
  return null;
}
void ATTACHMENTS;
