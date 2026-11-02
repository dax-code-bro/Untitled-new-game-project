// Boats and aircraft: procedural models (signed-distance shapes meshed with
// surface nets, coloured per part), arcade physics, and their catalogs.
// Both classes look like a Vehicle to the rest of the game (enter/exit,
// camera, HUD speed, collisions).
import * as THREE from 'three';
import { surfaceNets, smax, smin, roundBox, hyp2 } from '../assets/carbuilder.js';
import { clamp, lerp } from '../util.js';

// ---------------------------------------------------------------- shared
function partMesh(parts, bounds, h, colorOf, physical = true) {
  // parts: [{ d: sdf, kind }]; combined with smooth union, coloured by nearest part
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const p of parts) d = p.sub ? smax(d, -p.d(x, y, z), p.k || 0.03) : (p.k ? smin(d, p.d(x, y, z), p.k) : Math.min(d, p.d(x, y, z)));
    return d;
  };
  const g = surfaceNets(sdf, bounds[0], bounds[1], h);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3), rm = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let best = 0, bd = 1e9;
    parts.forEach((p, k) => { if (p.sub) return; const d = Math.abs(p.d(x, y, z)); if (d < bd) { bd = d; best = k; } });
    const [c, r, m] = colorOf(parts[best].kind, x, y, z, nrm.getY(i));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; rm[i * 2] = r; rm[i * 2 + 1] = m;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
  return new THREE.Mesh(g, craftMaterial(physical));
}
let craftMat = {};
function craftMaterial(physical) {
  const key = physical ? 'p' : 's';
  if (craftMat[key]) return craftMat[key];
  const M = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({ vertexColors: true, roughness: 1, metalness: 1, ...(physical ? { clearcoat: 0.7, clearcoatRoughness: 0.08 } : {}) });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aRM; varying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  };
  m.customProgramCacheKey = () => 'sbcraft' + key;
  craftMat[key] = m;
  return m;
}
const capsuleZ = (z0, z1, r0, r1, y = 0) => (x, yy, z) => {
  const t = clamp((z - z0) / (z1 - z0), 0, 1), r = lerp(r0, r1, t);
  return hyp2(x, yy - y) * 0 + Math.sqrt(x * x + (yy - y) ** 2 + (z - lerp(z0, z1, t)) ** 2) - r;
};
const ellipsoid = (cx, cy, cz, rx, ry, rz) => (x, y, z) => {
  const qx = (x - cx) / rx, qy = (y - cy) / ry, qz = (z - cz) / rz;
  const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  const k1 = Math.sqrt((qx / rx) ** 2 + (qy / ry) ** 2 + (qz / rz) ** 2) || 1e-6;
  return k0 * (k0 - 1) / k1;
};

// ================================================================ BOATS
// z forward, y up, waterline at y = 0
const BOAT_TYPES = {
  jetski: { L: 3.2, W: 1.2, draft: 0.25, free: 0.55, dead: 0.3, bow: 2.2, seat: true, top: 28, accel: 9, turn: 1.6 },
  skiff: { L: 4.6, W: 1.8, draft: 0.25, free: 0.6, dead: 0.15, bow: 2.0, cockpit: 0.45, top: 16, accel: 4, turn: 1.0 },
  bass: { L: 6.0, W: 2.3, draft: 0.3, free: 0.62, dead: 0.25, bow: 2.6, cockpit: 0.35, console: [0.2, 0.9], top: 26, accel: 6.5, turn: 1.0 },
  center: { L: 7.5, W: 2.6, draft: 0.45, free: 0.95, dead: 0.4, bow: 2.2, cockpit: 0.55, console: [0.3, 1.1], tTop: true, top: 24, accel: 5.5, turn: 0.85 },
  speed: { L: 8.5, W: 2.5, draft: 0.4, free: 0.85, dead: 0.45, bow: 3.4, cockpit: 0.5, windshield: true, top: 36, accel: 8, turn: 0.8 },
  racer: { L: 11.0, W: 2.6, draft: 0.4, free: 0.95, dead: 0.5, bow: 4.2, cockpit: 0.45, windshield: true, top: 46, accel: 9.5, turn: 0.6 },
  pontoon: { L: 7.0, W: 2.6, pontoon: true, draft: 0.4, free: 0.9, top: 12, accel: 3, turn: 0.7 },
  airboat: { L: 5.2, W: 2.4, draft: 0.12, free: 0.5, dead: 0.02, bow: 1.4, flat: true, fan: true, top: 22, accel: 6, turn: 1.2 },
  cruiser: { L: 11.5, W: 3.6, draft: 0.8, free: 1.4, dead: 0.35, bow: 2.4, cabin: [0.1, -2.5, 1.8], windshield: true, top: 20, accel: 3.5, turn: 0.55 },
  yacht: { L: 18.0, W: 5.0, draft: 1.2, free: 1.9, dead: 0.35, bow: 2.6, cabin: [3.0, -5.5, 2.4], flybridge: true, top: 18, accel: 2.5, turn: 0.4 },
  trawler: { L: 13.0, W: 4.2, draft: 1.2, free: 1.6, dead: 0.25, bow: 2.0, cabin: [2.5, -0.5, 2.6], mast: 6, top: 12, accel: 2.2, turn: 0.45 },
  sail: { L: 9.0, W: 3.0, draft: 0.6, free: 0.9, dead: 0.35, bow: 2.6, cockpit: 0.5, sail: 11, cabin: [1.2, -0.6, 0.6], top: 10, accel: 2.0, turn: 0.6 },
  patrol: { L: 10.0, W: 3.2, draft: 0.6, free: 1.2, dead: 0.45, bow: 2.6, cabin: [1.5, -1.5, 1.7], windshield: true, siren: true, top: 30, accel: 6, turn: 0.75 },
};
export const BOATS = [
  ['wave-runner', 'Heron WaveRunner', 'jetski', 11000, [0.85, 0.85, 0.85], [0.05, 0.3, 0.6]],
  ['wave-runner-x', 'Heron WaveRunner X', 'jetski', 15500, [0.08, 0.08, 0.09], [0.7, 0.8, 0.05]],
  ['skiff', 'Bayline Bayou Skiff', 'skiff', 6000, [0.32, 0.36, 0.28], [0.25, 0.27, 0.22]],
  ['bass-boat', 'Gulfstar Bass Pro', 'bass', 24000, [0.45, 0.04, 0.03], [0.85, 0.85, 0.85]],
  ['center-console', 'Pelican 24 CC', 'center', 48000, [0.86, 0.86, 0.84], [0.1, 0.25, 0.5]],
  ['center-console-x', 'Pelican 26 Offshore', 'center', 61000, [0.8, 0.82, 0.84], [0.02, 0.02, 0.03]],
  ['speedboat', 'Corsair Vela 28', 'speed', 85000, [0.85, 0.85, 0.85], [0.6, 0.05, 0.02]],
  ['speedboat-x', 'Corsair Vela 32', 'speed', 120000, [0.03, 0.04, 0.08], [0.85, 0.85, 0.85]],
  ['racer', 'Corsair Thunder 38', 'racer', 260000, [0.65, 0.12, 0.02], [0.9, 0.9, 0.9]],
  ['pontoon', 'Lake Arden Party Barge', 'pontoon', 32000, [0.75, 0.75, 0.72], [0.2, 0.2, 0.22]],
  ['airboat', 'Bayou Verde Airboat', 'airboat', 29000, [0.25, 0.3, 0.2], [0.2, 0.2, 0.2]],
  ['cruiser', 'Sabine 38 Cruiser', 'cruiser', 340000, [0.88, 0.88, 0.86], [0.05, 0.12, 0.3]],
  ['yacht', 'Gulfline 60 Motor Yacht', 'yacht', 1800000, [0.9, 0.9, 0.9], [0.06, 0.06, 0.08]],
  ['trawler', 'Ironbridge Shrimp Trawler', 'trawler', 210000, [0.85, 0.82, 0.75], [0.5, 0.06, 0.04]],
  ['sailboat', 'Cypress 30 Sloop', 'sail', 95000, [0.9, 0.9, 0.88], [0.05, 0.15, 0.4]],
  ['patrol-boat', 'Calvera PD Marine Unit', 'patrol', 0, [0.9, 0.9, 0.9], [0.05, 0.08, 0.3]],
].map(([id, name, type, price, paint, trim]) => ({ id, name, type, price, paint, trim, restricted: price === 0 }));

// 98 boat upgrades: 14 systems x 7 levels
const BOAT_SYS = [['Outboard power', { accel: 0.06, top: 0.03 }], ['Propeller pitch', { top: 0.03 }], ['Trim tabs', { turn: 0.04 }], ['Hull coating', { top: 0.02, accel: 0.02 }],
  ['Fuel system', { accel: 0.02 }], ['Steering', { turn: 0.05 }], ['Navigation electronics', { nav: 1 }], ['Fish finder', { fish: 1 }], ['Livewell', { fish: 1 }],
  ['Bilge & pumps', { armor: 15 }], ['Hull armor', { armor: 25 }], ['Sound system', {}], ['Lighting', { lights: 1 }], ['Anchor & winch', {}]];
export const BOAT_UPGRADES = [];
for (const [name, fx] of BOAT_SYS) for (let t = 1; t <= 7; t++) BOAT_UPGRADES.push({ id: `boat-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${t}`, group: name, tier: t, name: `${name} L${t}`, fx, price: Math.round(600 * t * (1 + t * 0.3)) });

function buildBoatModel(spec, paint, trim, quality) {
  const s = spec, L = s.L, W = s.W, L2 = L / 2;
  const parts = [];
  const deckY = (z) => s.free + Math.max(0, z / L2) * 0.22;
  if (s.pontoon) {
    for (const sx of [-1, 1]) parts.push({ kind: 'tube', d: capsuleZ(-L2 + 0.4, L2 - 0.5, 0.32, 0.3, -0.05).bind(null) && ((x, y, z) => capsuleZ(-L2 + 0.4, L2 - 0.5, 0.32, 0.28, -0.05)(x - sx * (W / 2 - 0.4), y, z)) });
    parts.push({ kind: 'deck', d: roundBox(0, 0.42, 0, W / 2, 0.06, L2, 0.03) });
    parts.push({ kind: 'rail', d: (x, y, z) => smax(roundBox(0, 0.85, -0.2, W / 2 - 0.05, 0.4, L2 - 0.6, 0.05)(x, y, z), -roundBox(0, 0.95, -0.2, W / 2 - 0.12, 0.6, L2 - 0.7, 0.05)(x, y, z), 0.02) });
    parts.push({ kind: 'console', d: roundBox(0.6, 0.9, 1.0, 0.35, 0.45, 0.35, 0.08) });
    parts.push({ kind: 'seat', d: roundBox(0, 0.68, -1.5, W / 2 - 0.3, 0.2, 0.5, 0.1) });
  } else {
    const hull = (x, y, z) => {
      const u = clamp(z / L2, -1, 1);
      const plan = z > 0 ? 1 - Math.pow(u, s.bow) : 1 - Math.pow(-u, 8);
      const hw = W / 2 * Math.sqrt(Math.max(0, plan)) * (s.flat ? 1 : (0.88 + 0.12 * clamp((y + s.draft) / (s.free + s.draft), 0, 1)));
      const yb = -s.draft + Math.abs(x) * s.dead + Math.max(0, u - 0.55) * (s.free * 0.8);
      let d = smax(Math.abs(x) - hw, yb - y, 0.05);
      d = smax(d, y - deckY(z), 0.04);
      return smax(d, -L2 - z, 0.06);
    };
    parts.push({ kind: 'hull', d: hull });
    if (s.cockpit) parts.push({ sub: true, k: 0.04, d: (x, y, z) => { const u = clamp(z / L2, -1, 1), plan = z > 0 ? 1 - Math.pow(u, s.bow) : 1; return smax(smax(Math.abs(x) - (W / 2 * Math.sqrt(Math.max(0, plan)) - 0.12), (deckY(z) - s.cockpit) - y, 0.03), z - L2 * (s.windshield ? 0.25 : 0.6), 0.05); } });
    if (s.seat) parts.push({ kind: 'seat', d: roundBox(0, s.free + 0.12, -0.2, 0.22, 0.12, 0.7, 0.1) }, { kind: 'console', d: roundBox(0, s.free + 0.2, 0.75, 0.25, 0.18, 0.2, 0.08) });
    if (s.console) parts.push({ kind: 'console', d: roundBox(0, deckY(0) - s.cockpit + s.console[1] / 2, s.console[0], 0.45, s.console[1] / 2, 0.4, 0.08) });
    if (s.tTop) parts.push({ kind: 'rail', d: roundBox(0, deckY(0) - s.cockpit + 2.1, 0.0, 0.85, 0.04, 0.9, 0.03) }, { kind: 'rail', d: (x, y, z) => roundBox(0.7, deckY(0) - s.cockpit + 1.6, 0, 0.03, 0.5, 0.03, 0.015)(Math.abs(x), y, Math.abs(z) < 0.8 ? 0 : z) });
    if (s.windshield) parts.push({ kind: 'glass', d: (x, y, z) => { const zz = L2 * 0.25; return smax(roundBox(0, deckY(zz) + 0.25, zz, W / 2 - 0.3, 0.28, 0.04, 0.02)(x, y, z - (y - deckY(zz)) * 0.6), Math.abs(x) - (W / 2 - 0.35), 0.02); } });
    if (s.cabin) {
      const [z0, z1, hh] = s.cabin;
      parts.push({ kind: 'cabin', d: roundBox(0, deckY(0) + hh / 2, (z0 + z1) / 2, W / 2 - 0.35, hh / 2, (z0 - z1) / 2, 0.25), k: 0.05 });
      parts.push({ kind: 'glass', d: roundBox(0, deckY(0) + hh * 0.68, (z0 + z1) / 2, W / 2 - 0.33, hh * 0.13, (z0 - z1) / 2 - 0.3, 0.05) });
      if (s.flybridge) parts.push({ kind: 'cabin', d: roundBox(0, deckY(0) + hh + 0.6, (z0 + z1) / 2 - 0.5, W / 2 - 0.9, 0.6, (z0 - z1) / 2 - 1.2, 0.2), k: 0.05 }, { kind: 'glass', d: roundBox(0, deckY(0) + hh + 0.8, (z0 + z1) / 2 - 0.5, W / 2 - 0.88, 0.15, (z0 - z1) / 2 - 1.5, 0.05) });
    }
    if (s.mast) parts.push({ kind: 'rail', d: roundBox(0, deckY(0) + s.mast / 2, s.cabin[0] - 1, 0.08, s.mast / 2, 0.08, 0.04) }, { kind: 'rail', d: roundBox(0, deckY(0) + s.mast * 0.7, s.cabin[0] - 1 - 3, 0.05, 0.05, 3, 0.03) });
    if (s.sail) parts.push({ kind: 'rail', d: roundBox(0, deckY(0) + s.sail / 2, 0.8, 0.07, s.sail / 2, 0.07, 0.03) }, { kind: 'rail', d: roundBox(0, deckY(0) + 1.0, -1.2, 0.05, 0.05, 2.0, 0.03) });
    if (s.fan) parts.push({ kind: 'cage', d: (x, y, z) => Math.abs(hyp2(x, y - 1.6) - 1.0) - 0.03 + Math.max(0, Math.abs(z + L2 - 0.6) - 0.08) }, { kind: 'console', d: roundBox(0, 1.6, -L2 + 0.85, 0.3, 0.3, 0.25, 0.1) }, { kind: 'seat', d: roundBox(0, 1.0, -0.5, 0.35, 0.5, 0.35, 0.08) });
    if (s.siren) parts.push({ kind: 'siren', d: roundBox(0, deckY(0) + s.cabin[2] + 0.12, (s.cabin[0] + s.cabin[1]) / 2, 0.45, 0.07, 0.12, 0.04) });
  }
  const top = 3 + (s.mast || 0) + (s.sail || 0) + (s.flybridge ? 2 : 0);
  const h = Math.max(quality && quality.key === 'phone' ? 0.09 : 0.06, L / 140);
  const colorOf = (kind, x, y, z, ny) => {
    if (kind === 'hull') {
      if (y < 0.0) return [[0.12, 0.03, 0.03], 0.6, 0];               // antifouling
      if (y < 0.1) return [trim, 0.3, 0.2];                           // boot stripe
      if (ny > 0.7) return [[0.62, 0.6, 0.55], 0.7, 0];               // non-skid deck
      return [paint, 0.25, 0.1];
    }
    if (kind === 'glass') return [[0.02, 0.025, 0.03], 0.03, 0];
    if (kind === 'deck') return [[0.42, 0.3, 0.18], 0.7, 0];
    if (kind === 'tube' || kind === 'rail' || kind === 'cage') return [[0.7, 0.71, 0.73], 0.25, 1];
    if (kind === 'seat') return [[0.85, 0.82, 0.75], 0.6, 0];
    if (kind === 'siren') return [x < 0 ? [0.6, 0.02, 0.02] : [0.02, 0.05, 0.6], 0.2, 0];
    if (kind === 'cabin') return [y > deckY(0) + 0.5 ? [0.9, 0.9, 0.88] : paint, 0.3, 0];
    return [trim, 0.35, 0.2];
  };
  const mesh = partMesh(parts, [[-W / 2 - 1.2, -s.draft - 0.1, -L2 - 0.2], [W / 2 + 1.2, top, L2 + 0.2]], h, colorOf, quality ? quality.physicalPaint !== false : true);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const root = new THREE.Group();
  root.add(mesh);
  if (s.sail) {
    // mainsail + jib as thin cloth triangles
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8, side: THREE.DoubleSide });
    const tri = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, sailMat); m.castShadow = true; return m; };
    root.add(tri([[0, deckY(0) + 1.1, 0.75], [0, deckY(0) + s.sail - 0.3, 0.75], [0, deckY(0) + 1.1, -3.1]]));
    root.add(tri([[0, deckY(0) + 0.6, L2 - 0.3], [0, deckY(0) + s.sail * 0.8, 0.9], [0, deckY(0) + 0.8, 0.95]]));
  }
  if (s.fan) {
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6 }));
    prop.position.set(0, 1.6, -L2 + 0.5); root.add(prop); root.userData.prop = prop;
  }
  return root;
}

export class Boat {
  constructor(entry, quality) {
    const s = BOAT_TYPES[entry.type];
    this.isBoat = true; this.type = entry.id; this.entry = entry;
    this.group = new THREE.Group(); this.body = new THREE.Group(); this.group.add(this.body);
    this.model = buildBoatModel(s, entry.paint, entry.trim, quality);
    this.body.add(this.model);
    this.spec = { name: entry.name, len: s.L, width: s.W, height: 2.5, wf: s.L * 0.3, wr: -s.L * 0.3, wheelR: 0.4, accel: s.accel, top: s.top, turn: s.turn };
    this.base = { ...this.spec };
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector2();
    this.heading = 0; this.pitch = 0; this.roll = 0; this.speed = 0; this.vy = 0; this.steer = 0;
    this.wheels = []; this.siren = s.siren ? false : null; this.braking = false; this.airborne = false; this.drowned = false;
    this.health = 100; this.maxHealth = 100; this.impact = 0; this.night = 0; this.t = Math.random() * 10; this.radius = s.W / 2 + 0.3;
    this.draft = s.draft;
  }
  upgrade(up = {}) {
    const s = this.spec;
    Object.assign(s, this.base);
    let armor = 0;
    for (const [g, t] of Object.entries(up)) {
      const fam = BOAT_SYS.find((b) => b[0] === g);
      if (!fam) continue;
      const fx = fam[1];
      s.accel *= 1 + (fx.accel || 0) * t; s.top *= 1 + (fx.top || 0) * t; s.turn *= 1 + (fx.turn || 0) * t; armor += (fx.armor || 0) * t;
    }
    this.maxHealth = 100 + armor; this.health = Math.min(this.health, this.maxHealth);
  }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  physics(dt, input, hm) {
    const t = this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let vF = this.vel.x * fx + this.vel.y * fz;
    let vR = this.vel.x * Math.cos(this.heading) - this.vel.y * Math.sin(this.heading);
    const wl = hm.waterLevel(this.pos.x, this.pos.z), ground = hm.height(this.pos.x, this.pos.z);
    const afloat = wl - ground > this.draft * 0.6;
    if (afloat) {
      vF += t.accel * (input.throttle || 0) * Math.max(0, 1 - vF / t.top) * dt;
      if (input.brake > 0) vF -= (vF > 0 ? 6 : 2.5) * input.brake * dt;
      vF = Math.max(vF, -5);
    }
    vF -= vF * (afloat ? 0.18 : 2.5) * dt;
    vR *= Math.exp(-(afloat ? 2.2 : 6) * dt);
    const steer = input.steer || 0;
    this.steer = lerp(this.steer, steer, Math.min(1, dt * 4));
    this.heading += this.steer * t.turn * clamp(Math.abs(vF) / 5, 0.25, 1) * Math.sign(vF || 1) * dt;
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vel.set(nfx * vF + Math.cos(this.heading) * vR, nfz * vF - Math.sin(this.heading) * vR);
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.y * dt;
    // run aground: stop at the shore
    if (hm.waterLevel(nx, nz) - hm.height(nx, nz) < this.draft * 0.4) {
      this.impact = Math.max(this.impact, Math.abs(vF) * 0.4);
      this.vel.multiplyScalar(-0.25);
    } else { this.pos.x = nx; this.pos.z = nz; }
    this.t += dt;
    const waves = Math.sin(this.t * 1.7) * 0.06 + Math.sin(this.t * 2.9 + 1) * 0.03;
    this.pos.y = Math.max(wl, ground) + waves * (1 - clamp(Math.abs(vF) / 15, 0, 0.7));
    // bow lifts as the hull comes onto the plane, leans into turns
    this.pitch = lerp(this.pitch, clamp(vF / t.top, 0, 1) * 0.07 + Math.sin(this.t * 1.3) * 0.02, Math.min(1, dt * 3));
    this.roll = lerp(this.roll, -this.steer * clamp(vF / t.top, 0, 1) * 0.12 + Math.sin(this.t * 1.1) * 0.02, Math.min(1, dt * 3));
    this.speed = vF;
    this.impact = Math.max(0, this.impact - dt * 5);
  }
  sync(dt) {
    this.group.position.copy(this.pos);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.set(-this.pitch, this.heading, this.roll);
    const prop = this.model.userData.prop;
    if (prop) prop.rotation.z += dt * (8 + Math.abs(this.speed) * 3);
  }
  exitPoint(hm) {
    // step off onto the nearest dry ground
    for (let r = 3; r < 80; r += 3) for (let a = 0; a < 16; a++) {
      const x = this.pos.x + Math.cos(a / 16 * Math.PI * 2) * r, z = this.pos.z + Math.sin(a / 16 * Math.PI * 2) * r;
      if (hm.height(x, z) > hm.waterLevel(x, z) + 0.3) return { x, z };
    }
    return null;
  }
  dispose() {}
}

// ================================================================ AIRCRAFT
const AIR_TYPES = {
  prop: { kind: 'plane', L: 8.2, span: 11, r: 0.65, wingY: 1.55, high: true, top: 65, accel: 7, lift: 22, roll: 1.2, pitch: 0.8 },
  duster: { kind: 'plane', L: 8.8, span: 13, r: 0.6, wingY: 0.9, top: 60, accel: 6.5, lift: 20, roll: 1.1, pitch: 0.7 },
  stunt: { kind: 'plane', L: 6.8, span: 7.5, r: 0.55, wingY: 0.8, top: 90, accel: 10, lift: 28, roll: 2.4, pitch: 1.2, biplane: true },
  seaplane: { kind: 'plane', L: 9.5, span: 12.5, r: 0.7, wingY: 1.7, high: true, floats: true, top: 60, accel: 6, lift: 21, roll: 1.0, pitch: 0.7 },
  twin: { kind: 'plane', L: 11, span: 14, r: 0.8, wingY: 0.9, twin: true, top: 85, accel: 8, lift: 30, roll: 0.9, pitch: 0.6 },
  jet: { kind: 'plane', L: 15, span: 13.5, r: 0.95, wingY: 0.8, jet: true, top: 140, accel: 12, lift: 45, roll: 1.0, pitch: 0.6 },
  heli: { kind: 'heli', L: 9.5, r: 1.15, rotor: 5.2, top: 55, accel: 9, roll: 1.6, pitch: 1.0 },
  heliBig: { kind: 'heli', L: 12.5, r: 1.5, rotor: 6.8, top: 60, accel: 8, roll: 1.2, pitch: 0.8 },
};
export const AIRCRAFT = [
  ['skylark', 'Heron Skylark 172', 'prop', 220000, [0.9, 0.9, 0.88], [0.6, 0.05, 0.03]],
  ['crop-duster', 'Redgrass Ag-Wagon', 'duster', 160000, [0.85, 0.65, 0.05], [0.1, 0.1, 0.1]],
  ['stunt', 'Lone Star Barnstormer', 'stunt', 340000, [0.55, 0.03, 0.03], [0.9, 0.9, 0.9]],
  ['seaplane', 'Bayline Otter Float', 'seaplane', 480000, [0.9, 0.85, 0.2], [0.1, 0.2, 0.45]],
  ['twin', 'Gulfstar Twin Commander', 'twin', 900000, [0.88, 0.88, 0.9], [0.05, 0.12, 0.35]],
  ['bizjet', 'Meridian Executive Jet', 'jet', 4200000, [0.92, 0.92, 0.94], [0.12, 0.12, 0.15]],
  ['tour-heli', 'Gulf Coast Tours Heli', 'heli', 900000, [0.85, 0.85, 0.85], [0.05, 0.3, 0.6]],
  ['news-heli', 'Channel 9 News Chopper', 'heli', 1100000, [0.1, 0.25, 0.6], [0.9, 0.9, 0.9]],
  ['police-heli', 'Calvera PD Air Unit', 'heli', 0, [0.05, 0.05, 0.06], [0.9, 0.9, 0.9]],
  ['medevac', 'Mercy Medevac', 'heliBig', 0, [0.9, 0.9, 0.9], [0.6, 0.03, 0.02]],
  ['cargo-heli', 'Ironbridge Sky Crane', 'heliBig', 2600000, [0.35, 0.36, 0.3], [0.85, 0.6, 0.05]],
].map(([id, name, type, price, paint, trim]) => ({ id, name, type, price, paint, trim, restricted: price === 0 }));
// 17 aircraft upgrades
export const AIR_UPGRADES = [
  ['Engine overhaul', 3, { accel: 0.1, top: 0.05 }], ['Propeller / turbine', 2, { top: 0.06 }], ['Avionics', 2, { stable: 0.3 }], ['Control surfaces', 2, { roll: 0.12 }],
  ['Landing gear', 2, { armor: 20 }], ['Armor plating', 3, { armor: 35 }], ['Fuel tanks', 2, { accel: 0.03 }], ['Smoke system', 1, { smoke: 1 }],
].flatMap(([name, tiers, fx]) => Array.from({ length: tiers }, (_, i) => ({ id: `air-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${i + 1}`, group: name, tier: i + 1, name: `${name} ${i + 1}`, fx, price: Math.round(9000 * (i + 1) * (1 + i * 0.4)) })));

function buildAirModel(s, paint, trim, quality) {
  const parts = [];
  const L2 = s.L / 2;
  if (s.kind === 'plane') {
    const r = s.r;
    parts.push({ kind: 'body', d: (x, y, z) => {
      const t = (z + L2) / s.L; // 0 tail .. 1 nose
      const rr = r * (t < 0.55 ? 0.25 + 0.75 * Math.pow(t / 0.55, 0.7) : 1 - Math.pow((t - 0.55) / 0.45, 3) * 0.55);
      return smax(hyp2(x, (y - 1.2) * (y > 1.2 ? 1 : 1.15)) - rr, Math.abs(z) - L2, 0.1);
    } });
    parts.push({ kind: 'glass', d: ellipsoid(0, 1.2 + r * 0.55, L2 * 0.38, r * 0.62, r * 0.42, r * 1.3) });
    const wing = (y, span) => (x, yy, z) => { const chord = 1.5 - Math.abs(x) / span * 0.6; return roundBox(0, y, L2 * 0.2, span / 2, 0.08, chord / 2, 0.05)(x, yy, z - Math.abs(x) * (s.jet ? 0.35 : 0.02)); };
    parts.push({ kind: 'wing', d: wing(s.wingY, s.span), k: 0.08 });
    if (s.biplane) parts.push({ kind: 'wing', d: wing(s.wingY + 1.3, s.span * 0.95) }, { kind: 'strut', d: (x, y, z) => roundBox(s.span * 0.3, s.wingY + 0.65, L2 * 0.2, 0.04, 0.65, 0.04, 0.02)(Math.abs(x), y, z) });
    if (s.high) parts.push({ kind: 'strut', d: (x, y, z) => roundBox(1.3, 1.1, L2 * 0.22, 0.05, 0.05, 0.05, 0.02)(Math.abs(x) * 0.3 + 0.9, y - (Math.abs(x) - 1.0) * 0.18, z) });
    parts.push({ kind: 'wing', d: roundBox(0, 1.3, -L2 + 0.6, s.span * 0.2, 0.05, 0.5, 0.04) }); // tailplane
    parts.push({ kind: 'trim', d: (x, y, z) => roundBox(0, 1.3 + 0.9, -L2 + 0.75, 0.05, 0.9, 0.55, 0.04)(x, y, z + (y - 1.3) * 0.5) }); // fin
    if (s.twin || s.jet) for (const sx of [-1, 1]) parts.push({ kind: 'engine', d: (x, y, z) => capsuleZ(-0.4, 1.4, 0.38, 0.42, s.jet ? 1.55 : s.wingY - 0.05)(x - sx * (s.jet ? 1.35 : 2.6), y, z - (s.jet ? -L2 + 2.0 : L2 * 0.2)) });
    if (s.floats) for (const sx of [-1, 1]) parts.push({ kind: 'float', d: (x, y, z) => capsuleZ(-L2 + 1.5, L2 - 0.6, 0.35, 0.22, 0.35)(x - sx * 1.4, y, z) }, { kind: 'strut', d: roundBox(sx * 1.4, 0.75, 0.6, 0.04, 0.4, 0.04, 0.02) });
    else {
      parts.push({ kind: 'gear', d: (x, y, z) => roundBox(1.1, 0.32, L2 * 0.12, 0.08, 0.32, 0.18, 0.06)(Math.abs(x), y, z) });
      parts.push({ kind: 'gear', d: roundBox(0, 0.3, s.jet ? L2 * 0.7 : L2 * 0.75, 0.07, 0.3, 0.14, 0.05) });
    }
  } else {
    // helicopter: cabin pod, tail boom, skids, rotor mast
    const r = s.r;
    parts.push({ kind: 'body', d: ellipsoid(0, 1.55, 0.6, r, r * 1.0, r * 1.9), k: 0.15 });
    parts.push({ kind: 'glass', d: ellipsoid(0, 1.75, 1.35, r * 0.82, r * 0.72, r * 1.05) });
    parts.push({ kind: 'body', d: capsuleZ(-L2 + 0.3, -0.6, 0.18, 0.42, 1.75), k: 0.25 });
    parts.push({ kind: 'trim', d: (x, y, z) => roundBox(0, 2.4, -L2 + 0.55, 0.05, 0.7, 0.4, 0.04)(x, y, z + (y - 2.2) * 0.4) });
    parts.push({ kind: 'gear', d: (x, y, z) => roundBox(0.95, 0.08, 0.6, 0.05, 0.05, 1.7, 0.04)(Math.abs(x), y, z) }, { kind: 'gear', d: (x, y, z) => roundBox(0.85, 0.45, 0.6, 0.04, 0.4, 0.04, 0.02)(Math.abs(x), y, Math.abs(z - 0.6) < 0.7 ? 0.6 + 0.7 : z) });
    parts.push({ kind: 'engine', d: roundBox(0, 1.55 + r * 0.95, 0.2, 0.35, 0.22, 0.8, 0.15), k: 0.1 });
  }
  const h = Math.max(quality && quality.key === 'phone' ? 0.1 : 0.065, s.L / 150);
  const span = s.span || s.r * 2.5;
  const colorOf = (kind, x, y) => {
    if (kind === 'glass') return [[0.02, 0.03, 0.04], 0.03, 0];
    if (kind === 'trim' || kind === 'float') return [trim, 0.3, 0.1];
    if (kind === 'gear' || kind === 'strut') return [[0.15, 0.15, 0.16], 0.5, 0.6];
    if (kind === 'engine') return [[0.6, 0.6, 0.62], 0.3, 0.8];
    if (kind === 'body' && Math.abs(y - 1.2) < 0.08 && s.kind === 'plane') return [trim, 0.3, 0.1]; // cheat line
    return [paint, 0.28, 0.15];
  };
  const mesh = partMesh(parts, [[-span / 2 - 0.4, -0.1, -L2 - 0.3], [span / 2 + 0.4, 4.2, L2 + 0.4]], h, colorOf, quality ? quality.physicalPaint !== false : true);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const root = new THREE.Group(); root.add(mesh);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.4, transparent: true, opacity: 0.9 });
  if (s.kind === 'plane') {
    const prop = new THREE.Group();
    if (!s.jet) {
      for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.04), bladeMat); b.rotation.z = i * Math.PI / 2; prop.add(b); }
      prop.position.set(0, 1.2, L2 + 0.05);
      if (!s.twin) root.add(prop);
      else for (const sx of [-1, 1]) { const p2 = prop.clone(); p2.position.set(sx * 2.6, s.wingY - 0.05, L2 * 0.2 + 1.5); root.add(p2); (root.userData.props ||= []).push(p2); }
      if (!s.twin) (root.userData.props ||= []).push(prop);
    }
  } else {
    const rotor = new THREE.Group();
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, s.rotor), bladeMat); b.position.z = s.rotor / 2; const arm = new THREE.Group(); arm.add(b); arm.rotation.y = i * Math.PI / 2; rotor.add(arm); }
    rotor.position.set(0, 1.55 + s.r * 1.25, 0.2);
    const tail = new THREE.Group();
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.1, 0.12), bladeMat); b.rotation.x = i * Math.PI / 2; tail.add(b); }
    tail.position.set(0.18, 2.3, -L2 + 0.55);
    root.add(rotor, tail);
    root.userData.rotor = rotor; root.userData.tail = tail;
  }
  return root;
}

export class Aircraft {
  constructor(entry, quality) {
    const s = AIR_TYPES[entry.type];
    this.isAir = true; this.heli = s.kind === 'heli'; this.type = entry.id; this.entry = entry; this.s = s;
    this.group = new THREE.Group(); this.body = new THREE.Group(); this.group.add(this.body);
    this.model = buildAirModel(s, entry.paint, entry.trim, quality);
    this.body.add(this.model);
    this.spec = { name: entry.name, len: s.L, width: s.span || 3, height: 3, wf: 2, wr: -2, wheelR: 0.3, accel: s.accel, top: s.top, roll: s.roll, pitchK: s.pitch };
    this.base = { ...this.spec };
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector2(); this.v3 = new THREE.Vector3();
    this.heading = 0; this.pitch = 0; this.roll = 0; this.speed = 0; this.power = 0; this.alt = 0;
    this.wheels = []; this.siren = null; this.braking = false; this.airborne = false; this.drowned = false;
    this.health = 100; this.maxHealth = 100; this.impact = 0; this.night = 0; this.radius = (s.span || 3) / 2; this.rotorSpin = 0;
    this.floats = !!s.floats;
  }
  upgrade(up = {}) {
    Object.assign(this.spec, this.base);
    let armor = 0;
    for (const u of AIR_UPGRADES) { const t = up[u.group]; if (!t || u.tier !== t) continue; const f = u.fx; this.spec.accel *= 1 + (f.accel || 0) * t; this.spec.top *= 1 + (f.top || 0) * t; this.spec.roll *= 1 + (f.roll || 0) * t; armor += (f.armor || 0) * t; }
    this.maxHealth = 100 + armor;
  }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  groundAt(hm, x, z) { const g = hm.height(x, z), w = hm.waterLevel(x, z); return this.floats && w > g ? w : g; }
  physics(dt, input, hm) {
    const t = this.spec, s = this.s;
    const ground = this.groundAt(hm, this.pos.x, this.pos.z);
    const steer = input.steer || 0;
    if (this.heli) {
      // collective: Space up, Shift down; W/S tilt forward/back; A/D yaw
      const lift = (input.handbrake ? 1 : 0) - (input.nitro ? 1 : 0);
      this.power = lerp(this.power, 1, dt * 0.5);
      this.v3.y = lerp(this.v3.y, lift * 7 * this.power, dt * 1.5);
      const fwd = (input.throttle || 0) - (input.brake || 0);
      this.pitch = lerp(this.pitch, -fwd * 0.22, dt * 2);
      this.roll = lerp(this.roll, -steer * 0.15, dt * 2);
      this.heading += steer * t.roll * 0.8 * dt;
      const sp = lerp(this.speed, fwd * t.top * (this.pos.y - ground > 1.5 ? 1 : 0.1), dt * 0.6);
      this.speed = sp;
    } else {
      // throttle lever, rudder/ailerons on A/D, elevator on Space (up) / Shift (down)
      this.power = clamp(this.power + ((input.throttle || 0) - (input.brake || 0)) * dt * 0.6, 0, 1);
      const air = this.pos.y - ground > 0.6;
      const drag = 0.012 * this.speed * Math.abs(this.speed);
      this.speed += (t.accel * this.power - drag - (air ? Math.sin(this.pitch) * 9.8 : 0)) * dt;
      if (!air && input.brake > 0 && this.power < 0.05) this.speed = Math.max(0, this.speed - 8 * dt);
      this.speed = Math.max(0, this.speed);
      const elev = (input.handbrake ? 1 : 0) - (input.nitro ? 1 : 0);
      const authority = clamp(this.speed / (s.lift * 0.9), 0, 1);
      this.pitch = clamp(this.pitch + elev * t.pitchK * authority * dt - (air ? 0 : this.pitch * dt * 2), -0.9, 0.9);
      if (!air && this.pitch < 0) this.pitch = 0;
      this.roll = lerp(this.roll, air ? -steer * 0.7 : 0, dt * t.roll);
      this.heading += (air ? -this.roll * 0.55 : steer * 0.6 * clamp(this.speed / 10, 0, 1)) * dt;
      const liftK = clamp((this.speed / s.lift) ** 2, 0, 1.6);
      const climb = this.speed * Math.sin(this.pitch) * liftK - (1 - Math.min(liftK, 1)) * 9 * (air ? 1 : 0);
      this.v3.y = lerp(this.v3.y, climb, dt * 2);
    }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const hs = this.speed * Math.cos(this.pitch);
    this.vel.set(fx * hs, fz * hs);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    this.pos.y += this.v3.y * dt;
    const g2 = this.groundAt(hm, this.pos.x, this.pos.z);
    if (this.pos.y <= g2) {
      if (this.v3.y < -7 || (!this.heli && Math.abs(this.roll) > 0.5)) { this.health -= Math.abs(this.v3.y) * 6; this.impact = Math.abs(this.v3.y); }
      this.pos.y = g2; this.v3.y = Math.max(0, this.v3.y);
      if (this.heli) this.speed *= Math.exp(-3 * dt);
      this.airborne = false;
    } else this.airborne = this.pos.y - g2 > 1;
    this.alt = this.pos.y - g2;
    this.pos.x = clamp(this.pos.x, -2000, 2000); this.pos.z = clamp(this.pos.z, -2000, 2000);
    this.impact = Math.max(0, this.impact - dt * 5);
  }
  sync(dt) {
    this.group.position.copy(this.pos);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.set(-this.pitch, this.heading, this.roll);
    const u = this.model.userData;
    this.rotorSpin += dt * (this.heli ? 30 * Math.max(this.power, 0.15) : 10 + this.power * 60);
    if (u.rotor) { u.rotor.rotation.y = this.rotorSpin; u.tail.rotation.x = this.rotorSpin * 1.6; }
    if (u.props) for (const p of u.props) p.rotation.z = this.rotorSpin;
  }
  exitPoint(hm) {
    if (this.alt > 3) { const x = this.pos.x + 4, z = this.pos.z; return { x, z, bail: true }; }
    return { x: this.pos.x + Math.cos(this.heading) * (this.radius + 1.5), z: this.pos.z - Math.sin(this.heading) * (this.radius + 1.5) };
  }
  dispose() {}
}
