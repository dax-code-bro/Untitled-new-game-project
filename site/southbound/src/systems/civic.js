// Public services you can actually find: the Central Precinct, the Medical
// Center and Fire Station 1 in Port Calvera, and the Sheriff's office and
// clinic in Mill Creek. Each is a real building with its own look, sign and
// staff, with marked units parked out front. Arrests release you at the
// precinct door; if you die you wake up at the hospital.
import * as THREE from 'three';
import { CITY, TOWN } from '../world/layout.js';
import { nearestRoad } from './world-util.js';
import { buildShop } from './gunstores.js';
import { dressMember, placeAccessories } from './gang.js';

function deskRow(g, { W, D, box, M }, n, color) {
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 1.6 + i * ((W - 3.2) / Math.max(1, n - 1)), z = 0.6;
    box(1.3, 0.75, 0.7, x, 0.375, z, M(color, 0.6), false);
    box(0.5, 0.35, 0.04, x, 0.95, z - 0.2, M(0x111111, 0.3, 0.2), false); // monitor
    box(0.5, 0.45, 0.5, x, 0.23, z + 0.75, M(0x222222, 0.7), false); // chair
  }
  void D;
}
const DECOR = {
  precinct: (g, o) => {
    deskRow(g, o, 3, 0x6b6b70);
    const { W, D, box, M } = o;
    for (let i = 0; i < 4; i++) box(0.5, 0.45, 0.45, -W / 2 + 0.6, 0.22, -1.5 + i * 0.6, M(0x30353a, 0.6), false); // bench
    // wanted posters
    for (let i = 0; i < 4; i++) box(0.4, 0.55, 0.01, W / 2 - 0.16, 1.6, -2.2 + i * 0.6, M(0xe8e0c8, 0.9), false);
    box(W - 1, 0.25, 0.02, 0, 2.7, -D / 2 + 0.17, M(0x1d2a44, 0.6), false);
  },
  hospital: (g, o) => {
    const { W, D, box, M } = o;
    for (let i = 0; i < 6; i++) box(0.5, 0.45, 0.5, -W / 2 + 0.8 + i * 0.6, 0.23, 1.6, M(0x4a7a9a, 0.7), false); // waiting chairs
    box(2.0, 0.6, 0.75, W / 2 - 1.6, 0.6, 0.4, M(0xeeeeee, 0.4, 0.3), false); // gurney
    box(2.0, 0.05, 0.7, W / 2 - 1.6, 0.92, 0.4, M(0xd9e6ef, 0.8), false);
    box(W - 1, 0.3, 0.02, 0, 2.7, -D / 2 + 0.17, M(0xc81e1e, 0.5), false);
  },
  fire: (g, o) => {
    const { W, D, box, M } = o;
    box(0.6, 1.8, 2.6, -W / 2 + 0.45, 0.9, -0.5, M(0x8a1a12, 0.5), false); // turnout gear lockers
    for (let i = 0; i < 4; i++) { box(0.4, 0.9, 0.1, -W / 2 + 0.75, 1.3, -1.6 + i * 0.7, M(0xc9a03a, 0.8), false); box(0.3, 0.3, 0.3, -W / 2 + 0.75, 1.95, -1.6 + i * 0.7, M(0x111111, 0.4, 0.3), false); }
    box(0.08, 3.6, 0.08, W / 2 - 1.0, 1.8, -1.2, M(0xc0c4c8, 0.2, 1), false); // the pole
    void D;
  },
};

const SITES = [
  { id: 'precinct', key: 'PRECINCT', name: 'Calvera PD · Central Precinct', style: 'brick', wall: 0x5d6470, signBg: '#13213a', signFg: '#c9d4e8', signText: '#ffffff',
    staff: { id: 'desk-sgt', base: 'mh_cop', skin: 'tan', suit: [0.2, 0.25, 0.35], hair: 'black', h: 1.02, w: 1.1, acc: ['glasses'] }, units: ['police', 'police'], hours: 'Open|24 hours', city: true },
  { id: 'hospital', key: 'HOSPITAL', name: 'Port Calvera Medical Center', style: 'stucco', wall: 0xe8ecef, awning: 0xb3241f, signBg: '#ffffff', signFg: '#b3241f', signText: '#b3241f',
    staff: { id: 'nurse', base: 'mh_f1', skin: 'brown', suit: [0.35, 0.55, 0.62], hair: 'black', h: 0.97, w: 1.0, acc: [] }, units: ['ambulance'], hours: 'EMERGENCY|24 hours', city: true },
  { id: 'firehouse', name: 'Calvera Fire Dept · Station 1', style: 'brick', wall: 0x8a2a1e, signBg: '#7a1410', signFg: '#f4c430', signText: '#ffffff', decor: 'fire',
    staff: { id: 'ff', base: 'mh_m4', skin: 'light', suit: [0.25, 0.22, 0.18], hair: 'brown', h: 1.02, w: 1.15, acc: [] }, units: ['firetruck'], hours: 'Station 1|Always staffed',
    at: () => [[CITY.x0 + 6.5 * CITY.pitch, CITY.z0 - 42], [CITY.x0 + CITY.nx * CITY.pitch + 46, CITY.z0 + 3.5 * CITY.pitch], [CITY.x0 - 46, CITY.z0 + 4.5 * CITY.pitch]] },
  { id: 'sheriff', name: 'Mill Creek Sheriff\'s Office', style: 'siding', wall: 0x7a6a50, roof: 0x5d6470, signBg: '#2b2418', signFg: '#d8b46a', signText: '#f2e3c2', decor: 'precinct',
    staff: { id: 'deputy', base: 'mh_cop', skin: 'light', suit: [0.45, 0.38, 0.25], hair: 'brown', h: 1.0, w: 1.15, acc: ['cap'] }, units: ['police'], hours: 'Mon–Sun|7 AM – 11 PM',
    at: () => [[TOWN.x0 + 1.5 * TOWN.pitch, TOWN.z0 - 34], [TOWN.x0 - 34, TOWN.z0 + 1.5 * TOWN.pitch], [TOWN.x0 + TOWN.nx * TOWN.pitch + 34, TOWN.z0 + 1.5 * TOWN.pitch]] },
  { id: 'clinic', name: 'Mill Creek Clinic', style: 'stucco', wall: 0xdfe6ea, awning: 0x2a6f9a, signBg: '#ffffff', signFg: '#2a6f9a', signText: '#2a6f9a', decor: 'hospital',
    staff: { id: 'doc', base: 'mh_m3', skin: 'tan', suit: [0.85, 0.87, 0.9], hair: 'grey', h: 1.0, w: 1.0, acc: ['glasses'] }, units: ['ambulance'], hours: 'Every day|8 AM – 8 PM',
    at: () => [[TOWN.x0 + 2.5 * TOWN.pitch, TOWN.z0 + TOWN.nz * TOWN.pitch + 34], [TOWN.x0 + TOWN.nx * TOWN.pitch + 34, TOWN.z0 + 2.5 * TOWN.pitch]] },
];

export function placeCivic(game, points) {
  const { scene, graph, lib } = game;
  const staff = [];
  game.civic = {};
  for (const site of SITES) {
    const near = site.key && points[site.key] ? points[site.key] : null;
    const cands = near ? [[near.x, near.z], [near.x, near.z + 40], [near.x + 40, near.z], [near.x, near.z - 40], [near.x - 40, near.z]] : site.at();
    let shop = null;
    const st = { ...site, decorate: (g, o) => DECOR[site.decor || site.id](g, o) };
    for (const [ax, az] of cands) { const r = nearestRoad(graph, ax, az) || { x: ax, z: az, tx: 1, tz: 0 }; shop = buildShop(game, r, st); if (shop) break; }
    if (!shop) continue;
    // where people come and go: just outside the door
    const out = new THREE.Vector3(0, 0, 9 / 2 + 3).applyMatrix4(shop.g.matrixWorld);
    if (near) { near.x = out.x; near.z = out.z; }
    game.civic[site.id] = { name: site.name, x: out.x, z: out.z, counter: shop.counter, face: shop.keeperFace };
    // marked units parked out front
    site.units.forEach((type, i) => {
      if (!game.Vehicle) return;
      // on the forecourt (or right in front of the door if the road is close)
      const p = new THREE.Vector3(-3.2 + i * 6.4, 0, 9 / 2 + 2.4 + Math.max(1.3, (shop.forecourt || 0) / 2)).applyMatrix4(shop.g.matrixWorld);
      const v = new game.Vehicle(lib, type);
      v.pos.set(p.x, game.collision.surface(p.x, p.z, shop.y + 5), p.z); v.heading = shop.keeperFace + Math.PI / 2; v.sync(0);
      scene.add(v.group); game.parked.push(v); v.civic = site.id;
    });
    const h = dressMember(lib, { ...site.staff, name: site.name });
    h.root.position.copy(shop.keeper); h.root.rotation.y = shop.keeperFace; h.play('Idle_Loop', 0); scene.add(h.root);
    staff.push(h);
  }
  return {
    update(dt) {
      for (const h of staff) {
        const d = h.root.position.distanceTo(game.player.pos);
        h.root.visible = d < 90;
        if (h.root.visible) { h.update(dt); placeAccessories(h); }
      }
    },
  };
}
