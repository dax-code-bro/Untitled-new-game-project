// The arsenal: every weapon and attachment in Southbound.
//
// Weapons are built from base platforms (a real-world-style action type with
// its own handling) made by fictional Calvera gunmakers. Each catalog entry
// has its own name, stats, price, finish and model proportions. Models are
// assembled in code from receiver, barrel, stock, magazine, sights and grip
// parts. All names are invented for this game.
import * as THREE from 'three';

const MAKERS = ['Calvera Arms', 'Gulfline', 'Redgrass Works', 'Brazos Ordnance', 'Port Iron', 'Sabine & Co.', 'Mill Creek Forge', 'Arden Precision', 'Sierra Norte Arms', 'Bayou Tactical', 'Lone Heron', 'Cypress Armory'];
const FINISH = [[0.03, 0.03, 0.035], [0.18, 0.16, 0.12], [0.24, 0.22, 0.17], [0.07, 0.09, 0.06], [0.32, 0.33, 0.35], [0.5, 0.5, 0.52], [0.14, 0.06, 0.03]];

// category: [count, display, base platforms]
// platform stats: dmg, rate (s between shots), clip, range, spread, recoil, pellets, speed (projectile m/s, 0 = hitscan)
const CATS = {
  pistol: [63, 'Pistols', [
    { k: 'service', dmg: 34, rate: 0.28, clip: 15, range: 160, spread: 0.012, recoil: 0.04, price: 450, model: { len: 0.19, barrel: 0.02, stock: 0, mag: 0.1 } },
    { k: 'compact', dmg: 30, rate: 0.24, clip: 10, range: 120, spread: 0.016, recoil: 0.05, price: 380, model: { len: 0.16, barrel: 0.01, stock: 0, mag: 0.08 } },
    { k: 'magnum', dmg: 70, rate: 0.6, clip: 6, range: 190, spread: 0.01, recoil: 0.12, price: 1200, model: { len: 0.24, barrel: 0.08, stock: 0, mag: 0.0, revolver: 1 } },
    { k: 'machine', dmg: 24, rate: 0.07, clip: 20, range: 110, spread: 0.03, recoil: 0.05, price: 1600, model: { len: 0.2, barrel: 0.03, stock: 0, mag: 0.16 } },
    { k: 'target', dmg: 40, rate: 0.35, clip: 10, range: 230, spread: 0.006, recoil: 0.04, price: 1500, model: { len: 0.25, barrel: 0.1, stock: 0, mag: 0.1 } },
  ]],
  rifle: [56, 'Assault rifles', [
    { k: 'carbine', dmg: 30, rate: 0.09, clip: 30, range: 320, spread: 0.014, recoil: 0.05, price: 3200, model: { len: 0.55, barrel: 0.3, stock: 0.25, mag: 0.2 } },
    { k: 'battle', dmg: 44, rate: 0.12, clip: 20, range: 420, spread: 0.012, recoil: 0.08, price: 4800, model: { len: 0.62, barrel: 0.42, stock: 0.28, mag: 0.18 } },
    { k: 'bullpup', dmg: 31, rate: 0.08, clip: 30, range: 330, spread: 0.013, recoil: 0.05, price: 4100, model: { len: 0.6, barrel: 0.18, stock: 0, mag: 0.2, bullpup: 1 } },
    { k: 'pdw', dmg: 25, rate: 0.065, clip: 40, range: 200, spread: 0.02, recoil: 0.04, price: 2800, model: { len: 0.42, barrel: 0.12, stock: 0.18, mag: 0.24 } },
  ]],
  shotgun: [13, 'Shotguns', [
    { k: 'pump', dmg: 16, pellets: 8, rate: 0.85, clip: 6, range: 60, spread: 0.07, recoil: 0.14, price: 2100, model: { len: 0.55, barrel: 0.45, stock: 0.3, mag: 0, tube: 1 } },
    { k: 'auto', dmg: 14, pellets: 8, rate: 0.3, clip: 8, range: 55, spread: 0.08, recoil: 0.12, price: 3600, model: { len: 0.6, barrel: 0.4, stock: 0.3, mag: 0, tube: 1 } },
    { k: 'double', dmg: 20, pellets: 9, rate: 0.25, clip: 2, range: 45, spread: 0.09, recoil: 0.18, price: 1500, model: { len: 0.45, barrel: 0.55, stock: 0.32, mag: 0, wood: 1 } },
  ]],
  launcher: [12, 'Rocket launchers', [
    { k: 'tube', dmg: 400, rate: 1.6, clip: 1, range: 400, spread: 0.004, recoil: 0.2, price: 14000, explosive: 9, speed: 70, model: { len: 1.0, barrel: 0, stock: 0, mag: 0, tube2: 1 } },
    { k: 'grenade', dmg: 220, rate: 0.8, clip: 6, range: 160, spread: 0.01, recoil: 0.15, price: 9000, explosive: 6, speed: 45, model: { len: 0.55, barrel: 0.2, stock: 0.25, mag: 0, drum: 1 } },
  ]],
  bow: [19, 'Bows', [
    { k: 'recurve', dmg: 60, rate: 1.1, clip: 1, range: 120, spread: 0.006, recoil: 0.0, price: 600, silent: true, speed: 65, model: { bow: 1.2 } },
    { k: 'compound', dmg: 85, rate: 1.3, clip: 1, range: 160, spread: 0.004, recoil: 0.0, price: 1400, silent: true, speed: 90, model: { bow: 0.95, cams: 1 } },
    { k: 'longbow', dmg: 75, rate: 1.4, clip: 1, range: 150, spread: 0.005, recoil: 0.0, price: 900, silent: true, speed: 75, model: { bow: 1.6 } },
  ]],
  sniper: [13, 'Sniper rifles', [
    { k: 'bolt', dmg: 140, rate: 1.4, clip: 5, range: 900, spread: 0.001, recoil: 0.2, price: 8500, scope: 8, model: { len: 0.75, barrel: 0.6, stock: 0.32, mag: 0.08 } },
    { k: 'heavy', dmg: 260, rate: 1.9, clip: 5, range: 1200, spread: 0.0015, recoil: 0.3, price: 16000, scope: 12, model: { len: 0.9, barrel: 0.75, stock: 0.32, mag: 0.12, brake: 1 } },
  ]],
  marksman: [45, 'Marksman rifles', [
    { k: 'dmr', dmg: 70, rate: 0.32, clip: 15, range: 600, spread: 0.003, recoil: 0.1, price: 5600, scope: 4, model: { len: 0.62, barrel: 0.48, stock: 0.28, mag: 0.14 } },
    { k: 'lever', dmg: 62, rate: 0.55, clip: 8, range: 420, spread: 0.004, recoil: 0.1, price: 2400, scope: 0, model: { len: 0.5, barrel: 0.5, stock: 0.3, mag: 0, tube: 1, wood: 1 } },
    { k: 'semi', dmg: 58, rate: 0.28, clip: 10, range: 480, spread: 0.004, recoil: 0.08, price: 3900, scope: 3, model: { len: 0.55, barrel: 0.45, stock: 0.3, mag: 0.1, wood: 1 } },
  ]],
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MODEL_NAMES = { pistol: ['P', 'Model ', 'Defender ', 'Ranger ', 'Hawk '], rifle: ['AR-', 'Mk', 'Storm ', 'Raptor ', 'CR-'], shotgun: ['Model ', 'Coachman ', 'Marsh '], launcher: ['RL-', 'Thunder '], bow: ['', 'Heron ', 'Cypress '], sniper: ['SR-', 'Longshot '], marksman: ['DM-', 'Scout ', 'Prairie '] };

export const WEAPONS = { fists: { id: 'fists', name: 'Fists', cat: 'melee', icon: '👊', damage: 26, range: 1.6, rate: 0.55, melee: true, price: 0 } };
export const CATEGORIES = Object.entries(CATS).map(([k, [, label]]) => ({ k, label, ids: [] }));
for (const [cat, [count, , plats]] of Object.entries(CATS)) {
  const r = rng(cat.length * 7919 + count);
  const catEntry = CATEGORIES.find((c) => c.k === cat);
  for (let i = 0; i < count; i++) {
    const p = plats[i % plats.length];
    const tier = Math.floor(i / plats.length);
    const maker = MAKERS[Math.floor(r() * MAKERS.length)];
    const nm = MODEL_NAMES[cat][Math.floor(r() * MODEL_NAMES[cat].length)];
    const num = (cat === 'pistol' ? 9 + Math.floor(r() * 40) : 10 + Math.floor(r() * 90)) + (tier > 2 && r() < 0.5 ? 'X' : '');
    const jit = (a) => 1 + (r() - 0.5) * a;
    const id = `${cat}_${String(i + 1).padStart(2, '0')}`;
    const w = {
      id, cat, platform: p.k, name: `${maker} ${nm}${num}`,
      damage: Math.round(p.dmg * jit(0.2) * (1 + tier * 0.025)), rate: +(p.rate * jit(0.18)).toFixed(3),
      clip: Math.max(1, Math.round(p.clip * (p.clip > 2 ? jit(0.35) : 1))), range: Math.round(p.range * jit(0.2)),
      spread: p.spread * jit(0.4), recoil: p.recoil * jit(0.3), pellets: p.pellets || 1,
      explosive: p.explosive || 0, speed: p.speed || 0, silent: !!p.silent, scope: p.scope || 0,
      price: Math.round(p.price * jit(0.3) * (1 + tier * 0.08) / 50) * 50,
      finish: FINISH[Math.floor(r() * FINISH.length)], model: { ...p.model, s: jit(0.15) },
      icon: { pistol: '🔫', rifle: '🪖', shotgun: '💥', launcher: '🚀', bow: '🏹', sniper: '🎯', marksman: '🎯' }[cat],
    };
    WEAPONS[id] = w;
    catEntry.ids.push(id);
  }
}
// the classic starter pistol keeps its old id for saves/scripts
WEAPONS.pistol = { ...WEAPONS.pistol_01, id: 'pistol', name: 'Calvera Arms Service 9', damage: 34, clip: 12, price: 0 };

// --- attachments: 6 slots x families x tiers -> 200+ parts ----------------------
const ATT = {
  optic: [['Red dot', { spread: 0.9 }], ['Holographic', { spread: 0.88 }], ['Reflex', { spread: 0.9 }], ['2x scope', { zoom: 2 }], ['3x scope', { zoom: 3 }], ['4x scope', { zoom: 4 }], ['6x scope', { zoom: 6 }], ['8x scope', { zoom: 8 }], ['12x scope', { zoom: 12 }], ['Thermal', { zoom: 4, thermal: 1 }], ['Night vision', { zoom: 3, night: 1 }]],
  muzzle: [['Suppressor', { silent: 1, damage: 0.95 }], ['Compensator', { recoil: 0.8 }], ['Flash hider', { flash: 0.3 }], ['Muzzle brake', { recoil: 0.7 }], ['Choke', { spread: 0.7 }], ['Heavy suppressor', { silent: 1, range: 0.9 }]],
  barrel: [['Short barrel', { range: 0.85, rate: 0.95 }], ['Long barrel', { range: 1.2 }], ['Heavy barrel', { spread: 0.8, rate: 1.05 }], ['Fluted barrel', { rate: 0.95 }], ['Match barrel', { spread: 0.7 }]],
  under: [['Vertical grip', { recoil: 0.85 }], ['Angled grip', { recoil: 0.9, rate: 0.97 }], ['Bipod', { spread: 0.75 }], ['Laser', { spread: 0.9 }], ['Flashlight', { light: 1 }], ['Handstop', { recoil: 0.92 }], ['Underbarrel shotgun', { pellets: 1 }]],
  mag: [['Extended mag', { clip: 1.5 }], ['Drum mag', { clip: 2.5, reload: 1.3 }], ['Fast mag', { reload: 0.7 }], ['Hollow-point rounds', { damage: 1.12 }], ['Armor-piercing rounds', { damage: 1.08, range: 1.1 }], ['Tracer rounds', { tracer: 1 }]],
  stock: [['Light stock', { rate: 0.97 }], ['Heavy stock', { recoil: 0.85 }], ['Folding stock', { recoil: 1.1 }], ['Cheek riser', { spread: 0.9 }]],
};
const TIERS = ['', ' Mk II', ' Mk III', ' Elite', ' Custom'];
export const ATTACHMENTS = [];
for (const [slot, list] of Object.entries(ATT)) {
  for (const [name, mods] of list) {
    TIERS.forEach((t, ti) => {
      const scaled = Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, typeof v === 'number' && v !== 1 && k !== 'zoom' ? 1 + (v - 1) * (1 + ti * 0.2) : v]));
      ATTACHMENTS.push({ id: `${slot}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${ti + 1}`, slot, name: name + t, mods: scaled, price: Math.round((250 + ti * 350) * (slot === 'optic' ? 1.6 : 1)) });
    });
  }
}

// --- procedural gun models ------------------------------------------------------
const matCache = new Map();
function mat(rgb, rough, metal) {
  const key = rgb.join() + rough + metal;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(...rgb), roughness: rough, metalness: metal }));
  return matCache.get(key);
}
export function buildWeaponModel(w) {
  const g = new THREE.Group();
  const m = w.model || {};
  const metal = mat(w.finish || [0.03, 0.03, 0.035], 0.35, 0.8), dark = mat([0.02, 0.02, 0.022], 0.6, 0.3);
  const wood = mat([0.22, 0.1, 0.04], 0.55, 0), poly = m.wood ? wood : mat([0.04, 0.04, 0.045], 0.7, 0.1);
  const box = (sx, sy, sz, x, y, z, mm, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mm); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; };
  const cyl = (r, l, x, y, z, mm, seg = 12) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), mm); c.rotation.x = Math.PI / 2; c.position.set(x, y, z + l / 2); g.add(c); return c; };
  if (m.bow) {
    // riser + two curved limbs + string, held vertically
    const L = m.bow * 0.5;
    box(0.03, 0.22, 0.04, 0, 0, 0.02, poly);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.1, 0.02), new THREE.Vector3(0, L * 0.7, 0.09), new THREE.Vector3(0, L, -0.02));
    for (const s of [1, -1]) {
      const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 6), metal);
      limb.scale.y = s; g.add(limb);
      if (m.cams) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 14), dark); c.rotation.z = Math.PI / 2; c.position.set(0, s * L, -0.02); g.add(c); }
    }
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, L * 2, 4), mat([0.8, 0.8, 0.75], 0.6, 0));
    str.position.set(0, 0, -0.03); g.add(str);
    g.userData.muzzle = new THREE.Vector3(0, 0.02, 0.1);
  } else {
    const s = m.s || 1, len = m.len * s, bl = m.barrel * s;
    if (m.tube2) {
      cyl(0.055, len, 0, 0.05, -len * 0.45, mat([0.12, 0.14, 0.09], 0.7, 0.1), 18);
      box(0.03, 0.1, 0.04, 0, -0.03, 0.0, dark, -0.2);
      box(0.04, 0.05, 0.08, 0.05, 0.1, 0.05, dark);
      g.userData.muzzle = new THREE.Vector3(0, 0.05, len * 0.55);
    } else {
      box(0.035, 0.05, len, 0, 0.02, len * 0.25, metal);                     // receiver
      if (bl > 0) cyl(0.009 + (m.tube ? 0.004 : 0), bl, 0, 0.03, len * 0.75, metal); // barrel
      if (m.tube) cyl(0.012, bl * 0.85, 0, 0.005, len * 0.75, metal);           // magazine tube
      if (m.brake) box(0.03, 0.03, 0.06, 0, 0.03, len * 0.75 + bl, metal);
      if (m.revolver) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.045, 10), metal); c.rotation.x = Math.PI / 2; c.position.set(0, 0.015, 0.03); g.add(c); }
      if (len > 0.3) box(0.04, 0.04, len * 0.35, 0, 0.0, len * 0.55, poly);    // handguard
      box(0.028, 0.09, 0.04, 0, -0.04, m.bullpup ? len * 0.35 : 0.0, poly, -0.3); // grip
      if (m.mag > 0) box(0.022, m.mag, 0.04, 0, -0.01 - m.mag / 2, m.bullpup ? -len * 0.15 : len * 0.15, dark, 0.1);
      if (m.drum) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 14), dark); d.rotation.z = Math.PI / 2; d.position.set(0, -0.03, len * 0.2); g.add(d); }
      if (m.stock > 0) box(0.03, 0.07, m.stock * s, 0, -0.005, -m.stock * s * 0.5, poly);
      if (w.scope) { cyl(0.018, 0.18 + w.scope * 0.01, 0, 0.075, len * 0.05, dark, 14); box(0.01, 0.03, 0.02, 0, 0.055, len * 0.15, dark); }
      g.userData.muzzle = new THREE.Vector3(0, 0.03, len * 0.75 + bl + (m.brake ? 0.06 : 0));
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export const WEAPON_COUNTS = Object.fromEntries(Object.entries(CATS).map(([k, [n]]) => [k, n]));
