// The arsenal: every weapon and attachment in Southbound.
//
// Weapons are built from base platforms (a real-world-style action type with
// its own handling) made by fictional Calvera gunmakers. Each catalog entry
// has its own name, stats, price, finish and model proportions. Models are
// assembled in code from receiver, barrel, stock, magazine, sights and grip
// parts. All names are invented for this game.
import * as THREE from 'three';
import { loadOpen, loaded, instance, Q } from '../assets/open.js';
import { dressGun } from './gunparts.js';
// open-source bow models (Quaternius CC0 medieval weapons pack)
const BOW_MODELS = [Q('medieval_weapons_pack', 'Bow_Wooden'), Q('medieval_weapons_pack', 'Bow_Wooden2')];
BOW_MODELS.forEach(loadOpen);

// Open-source firearm models, all real-world designs (no sci-fi):
//  - Quaternius Survival pack (CC0): pistols, revolvers, shotguns
//  - Quaternius Toon Shooter Game Kit (CC0): AK rifle, SMG, two bolt-action
//    sniper rifles, pump shotgun, revolver grenade launcher
// Survival models have the muzzle along +X, Toon Shooter ones along -X (flip).
// Hand points are fractions of the bounding box (x: 0 = butt .. 1 = muzzle,
// y: 0 = bottom .. 1 = top): g grip, f fore-end, w magazine well, b bolt, t rear sight.
const SV = 'survival_pack/', TG = 'toon_guns/', RG = 'real/guns/';
// Realistic scanned/PBR models (CC-BY 4.0, credited in CREDITS.md) keep their own
// textures (real: 1). axis = the model's muzzle direction.
export const GUN_MODELS = {
  glock17: { m: RG + 'Glock17', real: 1, axis: '-z', len: 0.186, g: [0.15, 0.36], w: [0.15, 0], t: [0.1, 1], kind: 'pistol' },
  glock19: { m: RG + 'Glock19', real: 1, axis: '-x', len: 0.174, g: [0.15, 0.36], w: [0.15, 0], t: [0.1, 1], kind: 'pistol' },
  python: { m: RG + 'ColtPython', real: 1, axis: '-z', len: 0.29, g: [0.1, 0.3], w: [0.36, 0.62], t: [0.28, 1], kind: 'pistol', revolver: 1 },
  navy: { m: RG + 'NavyColt1851', real: 1, axis: '-x', len: 0.33, g: [0.08, 0.3], w: [0.36, 0.62], t: [0.3, 1], kind: 'pistol', revolver: 1 },
  m4a1: { m: RG + 'M4A1', real: 1, axis: '+z', len: 0.84, g: [0.36, 0.35], f: [0.7, 0.6], w: [0.47, 0.35], b: [0.42, 0.85], t: [0.42, 1], kind: 'long' },
  m24: { m: RG + 'M24', real: 1, scoped: 1, axis: '+x', len: 1.09, g: [0.33, 0.45], f: [0.6, 0.55], w: [0.42, 0.4], b: [0.45, 0.85], t: [0.45, 1], kind: 'long', action: 'bolt' },
  remington: { m: RG + 'Remington870', real: 1, axis: '+x', len: 0.9, g: [0.05, 0.45], f: [0.52, 0.35], w: [0.4, 0.5], b: [0.35, 0.8], t: [0.35, 1], kind: 'long', action: 'pump' },
  pistol1: { m: SV + 'Pistol_1', len: 0.21, g: [0.16, 0.32], w: [0.15, 0], t: [0.08, 1], kind: 'pistol' },
  pistol2: { m: SV + 'Pistol_2', len: 0.2, g: [0.16, 0.32], w: [0.15, 0], t: [0.08, 1], kind: 'pistol' },
  revolver1: { m: SV + 'Revolver_1', len: 0.31, g: [0.1, 0.3], w: [0.32, 0.6], t: [0.25, 1], kind: 'pistol', revolver: 1 },
  revolver2: { m: SV + 'Revolver_2', len: 0.24, g: [0.13, 0.3], w: [0.4, 0.6], t: [0.3, 1], kind: 'pistol', revolver: 1 },
  revolver3: { m: SV + 'Revolver_3', len: 0.28, g: [0.1, 0.3], w: [0.35, 0.6], t: [0.28, 1], kind: 'pistol', revolver: 1 },
  shotgun1: { m: SV + 'Shotgun_1', len: 1.05, g: [0.25, 0.5], f: [0.63, 0.45], w: [0.42, 0.45], b: [0.4, 0.8], t: [0.42, 1], kind: 'long', action: 'pump' },
  shotgun2: { m: SV + 'Shotgun_2', len: 1.1, g: [0.26, 0.55], f: [0.6, 0.5], w: [0.42, 0.5], b: [0.4, 0.85], t: [0.45, 1], kind: 'long', action: 'pump' },
  sawedoff: { m: SV + 'Shotgun_SawedOff', len: 0.62, g: [0.12, 0.42], f: [0.45, 0.55], w: [0.4, 0.75], b: [0.3, 0.9], t: [0.3, 1], kind: 'long', action: 'pump' },
  shortstock: { m: SV + 'Shotgun_ShortStock', len: 0.85, g: [0.2, 0.45], f: [0.58, 0.55], w: [0.4, 0.5], b: [0.38, 0.85], t: [0.38, 1], kind: 'long', action: 'pump' },
  ak: { m: TG + 'AK', flip: 1, len: 0.88, g: [0.42, 0.45], f: [0.74, 0.72], w: [0.57, 0.4], b: [0.5, 0.85], t: [0.5, 1], kind: 'long' },
  smg: { m: TG + 'SMG', flip: 1, len: 0.62, g: [0.15, 0.42], f: [0.5, 0.45], w: [0.5, 0.35], b: [0.3, 0.9], t: [0.3, 1], kind: 'long' },
  mpistol: { m: TG + 'SMG', flip: 1, len: 0.42, g: [0.15, 0.42], f: [0.5, 0.45], w: [0.5, 0.35], b: [0.3, 0.9], t: [0.3, 1], kind: 'pistol' },
  sniperA: { m: TG + 'Sniper', flip: 1, scoped: 1, len: 1.2, g: [0.24, 0.45], f: [0.56, 0.7], w: [0.4, 0.3], b: [0.36, 0.85], t: [0.36, 1], kind: 'long', action: 'bolt' },
  sniperB: { m: TG + 'Sniper_2', flip: 1, scoped: 1, len: 1.25, g: [0.25, 0.42], f: [0.6, 0.65], w: [0.5, 0.3], b: [0.4, 0.85], t: [0.42, 1], kind: 'long', action: 'bolt' },
  shotgunT: { m: TG + 'Shotgun', flip: 1, len: 1.0, g: [0.33, 0.5], f: [0.7, 0.55], w: [0.5, 0.45], b: [0.48, 0.85], t: [0.48, 1], kind: 'long', action: 'pump' },
  grenadel: { m: TG + 'GrenadeLauncher', flip: 1, len: 0.75, g: [0.12, 0.3], f: [0.68, 0.3], w: [0.55, 0.5], b: [0.4, 0.9], t: [0.4, 1], kind: 'long', action: 'pump' },
};
const PLATFORM_MODELS = {
  service: ['glock17', 'glock19', 'pistol1'], compact: ['glock19', 'pistol2'], magnum: ['python', 'revolver1', 'navy'], machine: ['glock17'], target: ['python', 'navy'],
  carbine: ['m4a1'], battle: ['m4a1'], bullpup: ['m4a1', 'ak'], pdw: ['smg'],
  pump: ['remington', 'shotgun1', 'shortstock'], auto: ['shotgun2'], double: ['sawedoff'],
  bolt: ['m24'], heavy: ['m24'], dmr: ['m24'], lever: ['shotgun2'], semi: ['m24', 'sniperB'],
  grenade: ['grenadel'],
};
export const gunRel = (G) => (G.m.startsWith('real/') ? G.m + '.glb' : Q(...G.m.split('/')));
export function gunModelFor(w) {
  if (w.modelKey && GUN_MODELS[w.modelKey]) return GUN_MODELS[w.modelKey];
  const list = PLATFORM_MODELS[w.platform];
  if (!list) return null;
  let h = 0; for (const c of w.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GUN_MODELS[list[h % list.length]];
}
for (const g of Object.values(GUN_MODELS)) loadOpen(gunRel(g));

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
// how each platform fires, what it's chambered in, how well it penetrates (1-5), and a line about it
const PLAT_INFO = {
  service: ['Semi-auto', '9mm', 1, 'Polymer-frame duty pistol. Reliable, light, holds a lot of rounds.'],
  compact: ['Semi-auto', '9mm', 1, 'Short slide and grip for concealed carry. Snappier to shoot.'],
  magnum: ['Double-action revolver', '.357 Magnum', 2, 'Six rounds that hit hard. Slow to reload, impossible to jam.'],
  machine: ['Full-auto', '9mm', 1, 'Pistol with a full-auto switch. Empties the magazine in a second.'],
  target: ['Semi-auto', '.22 LR / .38', 1, 'Long sight radius and a crisp trigger. Accurate at range.'],
  carbine: ['Semi / full-auto', '5.56 NATO', 3, 'The standard modern rifle. Light recoil, goes through car doors.'],
  battle: ['Semi-auto', '7.62 NATO', 4, 'Full-power rifle cartridge. Heavy, loud, punches through cover.'],
  bullpup: ['Full-auto', '5.56 NATO', 3, 'Rifle-length barrel in a compact body. Great in close quarters.'],
  pdw: ['Full-auto', '9mm / 4.6mm', 2, 'Submachine gun. Fast, controllable, short range.'],
  pump: ['Pump-action', '12 gauge', 1, 'Buckshot at close range ends arguments. Load slugs for reach.'],
  auto: ['Semi-auto', '12 gauge', 1, 'Gas-operated shotgun. Fast follow-up shots.'],
  double: ['Break-action', '12 gauge', 1, 'Two barrels, two shots, a lot of noise.'],
  tube: ['Single shot', '84mm rocket', 5, 'Disposable launcher. Turns vehicles into scrap.'],
  grenade: ['Revolver cylinder', '40mm grenade', 5, 'Six-shot grenade launcher. Lobbed explosive rounds.'],
  recurve: ['Draw', 'Arrow', 1, 'Silent. Hunters use it to keep the meat clean.'],
  compound: ['Draw', 'Arrow', 2, 'Cams and cables let you hold a heavy draw. Fast, flat arrows.'],
  longbow: ['Draw', 'Arrow', 1, 'Traditional bow. Long draw, quiet, satisfying.'],
  bolt: ['Bolt-action', '.308 Winchester', 4, 'Scoped bolt rifle. One shot, one kill, at long range.'],
  heavy: ['Bolt-action', '.338 Lapua', 5, 'Long-range rifle that goes through engine blocks.'],
  dmr: ['Semi-auto', '7.62 NATO', 4, 'Designated marksman rifle. Accurate and quick to follow up.'],
  lever: ['Lever-action', '.30-30', 3, 'Classic ranch rifle. Smooth, fast, and still deadly.'],
  semi: ['Semi-auto', '.308 Winchester', 4, 'Scoped semi-auto hunting rifle.'],
};
for (const w of Object.values(WEAPONS)) {
  const pi = PLAT_INFO[w.platform];
  if (pi) { w.fireMode = pi[0]; w.caliber = pi[1]; w.pen = pi[2]; w.desc = pi[3]; }
  // better guns unlock as the story goes on (missions completed)
  w.unlock = w.price < 1500 ? 0 : w.price < 4000 ? 2 : w.price < 8000 ? 5 : w.price < 14000 ? 10 : 18;
}
if (WEAPONS.fists) { WEAPONS.fists.unlock = 0; }

// Finishes: skins (named looks) and paint; custom colour on top
export const SKINS = [
  ['Factory', null], ['Blued steel', [0.06, 0.07, 0.1, 0.9, 0.3]], ['Stainless', [0.55, 0.56, 0.58, 1, 0.28]], ['Black nitride', [0.03, 0.03, 0.035, 0.7, 0.45]],
  ['Flat dark earth', [0.42, 0.34, 0.24, 0.1, 0.7]], ['OD green', [0.2, 0.24, 0.15, 0.1, 0.7]], ['Tungsten', [0.24, 0.24, 0.25, 0.6, 0.45]], ['Gunmetal', [0.14, 0.15, 0.16, 0.85, 0.35]],
  ['Bronze', [0.45, 0.3, 0.15, 1, 0.32]], ['Gold', [0.83, 0.65, 0.28, 1, 0.22]], ['Chrome', [0.8, 0.8, 0.82, 1, 0.08]], ['Rose gold', [0.75, 0.5, 0.45, 1, 0.25]],
  ['Arctic white', [0.85, 0.86, 0.85, 0.05, 0.6]], ['Crimson', [0.45, 0.04, 0.04, 0.3, 0.45]], ['Cobalt', [0.07, 0.15, 0.45, 0.5, 0.4]], ['Burnt bronze', [0.3, 0.17, 0.08, 0.9, 0.4]],
];
// apply a finish {skin, paint:[r,g,b], metal, rough} to a gun model
export function applyFinish(g, f) {
  if (!g) return;
  g.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.baseMat) o.userData.baseMat = o.material;
    o.material = o.userData.baseMat;
    if (!f || (!f.skin && !f.paint)) return;
    const m = o.material.clone();
    const sk = SKINS.find((x) => x[0] === f.skin)?.[1];
    const col = f.paint || (sk && sk.slice(0, 3));
    if (col) {
      // textured models keep their detail: tint instead of replacing
      if (m.map) m.color.setRGB(Math.min(1.6, col[0] * 2.2), Math.min(1.6, col[1] * 2.2), Math.min(1.6, col[2] * 2.2));
      else m.color.setRGB(col[0], col[1], col[2]);
    }
    if (f.metal !== undefined) m.metalness = f.metal; else if (sk) m.metalness = sk[3];
    if (f.rough !== undefined) m.roughness = f.rough; else if (sk) m.roughness = sk[4];
    o.material = m;
  });
}

// the classic starter pistol keeps its old id for saves/scripts
WEAPONS.pistol = { ...WEAPONS.pistol_01, id: 'pistol', name: 'Standard 9mm', damage: 34, clip: 17, price: 360, unlock: 0, modelKey: 'glock17' }; // ~$450 at city prices

// --- knives and other hand weapons -------------------------------------------
// blade: cuts make people bleed; len (m) matters for hiding it
const MELEE = [
  ['switchblade', 'Switchblade', 38, 1.45, 0.42, 0.21, 45, 'blade', 'Folds into your pocket. Opens with a click.'],
  ['kitchen_knife', 'Kitchen knife', 40, 1.5, 0.48, 0.32, 18, 'blade', 'Eight-inch chef\'s knife. Not made for this.'],
  ['hunting_knife', 'Hunting knife', 46, 1.55, 0.5, 0.3, 85, 'blade', 'Fixed blade for skinning game. Holds an edge.'],
  ['combat_knife', 'Combat knife', 52, 1.6, 0.48, 0.31, 130, 'blade', 'Seven-inch fixed blade with a guard.'],
  ['machete', 'Machete', 60, 1.95, 0.75, 0.6, 45, 'blade', 'Cane knife for clearing brush. Long reach.'],
  ['hatchet', 'Hatchet', 58, 1.7, 0.8, 0.38, 35, 'blade', 'Camp hatchet. Heavy head, short handle.'],
  ['bat', 'Baseball bat', 46, 2.0, 0.85, 0.84, 40, 'blunt', 'Ash wood, 34 inches.'],
  ['crowbar', 'Crowbar', 50, 1.85, 0.85, 0.6, 22, 'blunt', 'Steel pry bar. Opens doors and arguments.'],
  ['tire_iron', 'Tire iron', 44, 1.8, 0.75, 0.5, 15, 'blunt', 'Lug wrench from a trunk.'],
  ['pipe_wrench', 'Pipe wrench', 48, 1.75, 0.85, 0.45, 32, 'blunt', 'Fourteen-inch cast iron wrench.'],
  ['knuckles', 'Brass knuckles', 34, 1.4, 0.4, 0.1, 30, 'blunt', 'Makes a punch hurt a lot more.'],
];
CATEGORIES.push({ k: 'melee', label: 'Knives & melee', ids: [] });
for (const [id, name, damage, range, rate, len, price, kind, desc] of MELEE) {
  WEAPONS[id] = { id, name, cat: 'melee', icon: kind === 'blade' ? '🔪' : '🏏', damage, range, rate, melee: true, len, price, kind, pellets: 1, pen: 1, spread: 0, clip: 0,
    fireMode: kind === 'blade' ? 'Blade' : 'Blunt', caliber: `${Math.round(len * 100)} cm`, desc, unlock: 0, platform: 'melee', model: { melee: id } };
  CATEGORIES.find((c) => c.k === 'melee').ids.push(id);
}
// a melee weapon model: handle at the origin, blade/head along +z
function buildMeleeModel(w) {
  const g = new THREE.Group(), id = w.id;
  const steel = mat([0.62, 0.63, 0.65], 0.25, 1), dark = mat([0.04, 0.04, 0.045], 0.6, 0.2), wood = mat([0.36, 0.22, 0.1], 0.6, 0), rub = mat([0.06, 0.06, 0.06], 0.9, 0);
  const box = (sx, sy, sz, x, y, z, mm) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mm); b.position.set(x, y, z); g.add(b); return b; };
  const cyl = (r1, r2, l, z, mm, seg = 10) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, seg), mm); c.rotation.x = Math.PI / 2; c.position.set(0, 0, z); g.add(c); return c; };
  const blade = (L, W, z0, mm = steel) => { const sh = new THREE.Shape(); sh.moveTo(0, -W / 2); sh.lineTo(L * 0.82, -W / 2); sh.lineTo(L, W * 0.25); sh.lineTo(L * 0.75, W / 2); sh.lineTo(0, W / 2); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1 }); geo.rotateY(-Math.PI / 2); geo.translate(-0.0015, 0, z0);
    const m = new THREE.Mesh(geo, mm); g.add(m); return m; };
  if (['switchblade', 'kitchen_knife', 'hunting_knife', 'combat_knife', 'machete'].includes(id)) {
    const L = { switchblade: 0.09, kitchen_knife: 0.2, hunting_knife: 0.14, combat_knife: 0.17, machete: 0.45 }[id];
    const handle = id === 'kitchen_knife' ? mat([0.08, 0.06, 0.05], 0.5, 0) : id === 'hunting_knife' ? wood : id === 'switchblade' ? mat([0.12, 0.12, 0.13], 0.4, 0.7) : rub;
    box(0.022, 0.03, 0.11, 0, 0, 0, handle);
    if (id === 'combat_knife' || id === 'hunting_knife') box(0.012, 0.055, 0.008, 0, 0, 0.058, dark);
    blade(L, id === 'machete' ? 0.05 : id === 'kitchen_knife' ? 0.045 : 0.03, 0.06);
  } else if (id === 'hatchet') {
    cyl(0.014, 0.016, 0.34, 0.1, wood);
    box(0.012, 0.09, 0.07, 0, 0.03, 0.26, steel);
  } else if (id === 'bat') {
    cyl(0.016, 0.034, 0.84, 0.36, mat([0.72, 0.56, 0.36], 0.5, 0), 14);
    cyl(0.02, 0.02, 0.012, -0.06, wood);
  } else if (id === 'crowbar' || id === 'tire_iron') {
    const m = id === 'crowbar' ? mat([0.6, 0.08, 0.06], 0.45, 0.6) : dark;
    cyl(0.011, 0.011, id === 'crowbar' ? 0.58 : 0.46, 0.22, m, 8);
    box(0.02, 0.05, 0.016, 0, 0.02, id === 'crowbar' ? 0.52 : 0.45, m);
  } else if (id === 'pipe_wrench') {
    cyl(0.013, 0.016, 0.34, 0.12, mat([0.62, 0.12, 0.08], 0.5, 0.5), 8);
    box(0.03, 0.07, 0.05, 0, 0.02, 0.3, dark); box(0.02, 0.02, 0.06, 0, 0.055, 0.33, steel);
  } else if (id === 'knuckles') {
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.004, 6, 12), mat([0.75, 0.6, 0.3], 0.3, 1)); t.position.set(0, 0.02, -0.03 + i * 0.022); t.rotation.y = Math.PI / 2; g.add(t); }
    box(0.01, 0.015, 0.09, 0, 0.0, 0.003, mat([0.75, 0.6, 0.3], 0.3, 1));
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
  g.userData.melee = true;
  return g;
}

// --- attachments: 6 slots x families x tiers -> 200+ parts ----------------------
const ATT = {
  optic: [['Red dot', { spread: 0.9 }], ['Holographic', { spread: 0.88 }], ['Reflex', { spread: 0.9 }], ['2x scope', { zoom: 2 }], ['3x scope', { zoom: 3 }], ['4x scope', { zoom: 4 }], ['6x scope', { zoom: 6 }], ['8x scope', { zoom: 8 }], ['12x scope', { zoom: 12 }], ['Thermal', { zoom: 4, thermal: 1 }], ['Night vision', { zoom: 3, night: 1 }]],
  muzzle: [['Suppressor', { silent: 1, damage: 0.95 }], ['Compensator', { recoil: 0.8 }], ['Flash hider', { flash: 0.3 }], ['Muzzle brake', { recoil: 0.7 }], ['Choke', { spread: 0.7 }], ['Heavy suppressor', { silent: 1, range: 0.9 }]],
  barrel: [['Short barrel', { range: 0.85, rate: 0.95 }], ['Long barrel', { range: 1.2 }], ['Heavy barrel', { spread: 0.8, rate: 1.05 }], ['Fluted barrel', { rate: 0.95 }], ['Match barrel', { spread: 0.7 }]],
  under: [['Vertical grip', { recoil: 0.85 }], ['Angled grip', { recoil: 0.9, rate: 0.97 }], ['Bipod', { spread: 0.75 }], ['Thumb rest', { spread: 0.9 }], ['Flashlight', { light: 1 }], ['Handstop', { recoil: 0.92 }], ['Underbarrel shotgun', { pellets: 1 }]],
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
// Real materials for the open models' flat colours
function realMaterial(name, finish) {
  const n = name.toLowerCase();
  if (n.includes('wood')) return mat(n.includes('dark') ? [0.16, 0.07, 0.03] : [0.3, 0.14, 0.05], 0.5, 0);
  if (n === 'grey2') return mat([0.17, 0.17, 0.18], 0.3, 0.9);
  if (n.includes('white') || n.includes('lightmetal')) return mat([0.2, 0.2, 0.21], 0.32, 0.9);
  if (n.includes('grey') || n === 'metal') return mat([0.09, 0.09, 0.095], 0.3, 0.9);
  if (n.includes('darkmetal')) return mat([0.05, 0.05, 0.055], 0.35, 0.85);
  if (n.includes('red')) return mat([0.5, 0.06, 0.04], 0.5, 0.1);
  return mat([0.025, 0.025, 0.028], 0.6, 0.15); // black polymer
}

// Gun group in "hold space": origin at the shooting hand's wrist, +Z muzzle,
// +Y up. userData.hold says where everything is for the pose system.
function buildOpenGun(w, G) {
  const src = loaded(gunRel(G));
  if (!src) return null;
  const g = new THREE.Group();
  const inner = src.scene.clone(true);
  inner.traverse((o) => { if (o.isMesh) { if (!G.real) o.material = realMaterial(o.material.name || '', w.finish || [0.05, 0.05, 0.05]); o.castShadow = true; } });
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const k = (G.len * (w.model?.s || 1)) / ((G.axis || 'x')[1] === 'z' ? size.z : size.x);
  // barrel +X -> +Z
  const holder = new THREE.Group();
  holder.add(inner);
  // butt at z = 0, muzzle toward +Z (each model's own muzzle axis)
  const axis = G.axis || (G.flip ? '-x' : '+x');
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  if (axis === '+x') { inner.position.set(-box.min.x, -box.min.y, -cz); holder.rotation.y = -Math.PI / 2; }
  else if (axis === '-x') { inner.position.set(-box.max.x, -box.min.y, -cz); holder.rotation.y = Math.PI / 2; }
  else if (axis === '+z') { inner.position.set(-cx, -box.min.y, -box.min.z); holder.rotation.y = 0; }
  else { inner.position.set(-cx, -box.min.y, -box.max.z); holder.rotation.y = Math.PI; }
  holder.scale.setScalar(k);
  const L = ((G.axis || 'x')[1] === 'z' ? size.z : size.x) * k, H = size.y * k;
  // where the bore actually is: the middle of the geometry right at the muzzle end
  if (G.bore === undefined) {
    const ak = axis[1] === 'x' ? 'x' : 'z', end = axis[0] === '+' ? box.max[ak] : box.min[ak], span = ak === 'x' ? size.x : size.z, v = new THREE.Vector3();
    let y0 = Infinity, y1 = -Infinity;
    inner.traverse((o) => { if (!o.isMesh || !o.geometry.attributes.position) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (Math.abs(v[ak] - end) < span * 0.025) { y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } } });
    G.bore = y1 > y0 ? Math.min(0.95, Math.max(0.2, ((y0 + y1) / 2 - box.min.y) / size.y)) : 0.8;
  }
  const at = (fx, fy) => new THREE.Vector3(0, fy * H, fx * L); // butt-relative point in hold space
  const grip = at(...G.g);
  // the wrist sits behind and a little above the middle of the grip
  const wrist = grip.clone().add(new THREE.Vector3(0, 0.035, -0.055));
  holder.position.sub(wrist);
  g.add(holder);
  const rel = (v) => v.clone().sub(wrist);
  const fore = G.f ? rel(at(...G.f)).add(new THREE.Vector3(0.035, -0.045, -0.02)) : rel(at(G.g[0] + 0.1, G.g[1]));
  g.userData.muzzle = rel(at(1, G.bore));
  g.userData.hold = {
    at: (fx, fy) => rel(at(fx, fy)),
    kind: G.kind, action: G.action || 'mag', revolver: !!G.revolver, len: L,
    fore, well: rel(at(...(G.w || G.g))).add(new THREE.Vector3(0.03, -0.06, 0)), bolt: rel(at(...(G.b || [0.4, 0.9]))).add(new THREE.Vector3(-0.04, 0.03, 0)),
    butt: rel(at(0, 0.62)), mid: rel(at(0.45, 0.5)), sight: rel(at(...(G.t || [0.4, 1]))), sightY: 0, sightZ: 0,
    inspectStyle: (w.id.length * 7 + (w.id.charCodeAt(w.id.length - 1) || 0)) % 3,
  };
  g.userData.open = G.m;
  return g;
}

export function buildWeaponModel(w) {
  if (w.melee && w.model?.melee) return buildMeleeModel(w);
  const G = gunModelFor(w);
  if (G) { const og = buildOpenGun(w, G); if (og) { dressGun(og, w, G); return og; } }
  const g = new THREE.Group();
  const m = w.model || {};
  const metal = mat(w.finish || [0.03, 0.03, 0.035], 0.35, 0.8), dark = mat([0.02, 0.02, 0.022], 0.6, 0.3);
  const wood = mat([0.22, 0.1, 0.04], 0.55, 0), poly = m.wood ? wood : mat([0.04, 0.04, 0.045], 0.7, 0.1);
  const box = (sx, sy, sz, x, y, z, mm, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mm); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; };
  const cyl = (r, l, x, y, z, mm, seg = 12) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), mm); c.rotation.x = Math.PI / 2; c.position.set(x, y, z + l / 2); g.add(c); return c; };
  const bowG = m.bow ? loaded(BOW_MODELS[(w.id.length + (m.cams ? 1 : 0)) % 2]) : null;
  if (bowG) {
    const b = instance(bowG, m.bow * 1.05);
    b.rotation.y = Math.PI / 2;
    b.position.y = -m.bow * 0.5;
    g.add(b);
    g.userData.muzzle = new THREE.Vector3(0, 0.02, 0.1);
  } else if (m.bow) {
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
  // procedural fallback (launcher tube, bows, or before a model has loaded)
  const len = (m.len || 0.2) * (m.s || 1);
  const isLong = !m.bow && len > 0.3;
  const shift = new THREE.Vector3(0, 0.035, -0.055);
  g.children.forEach((c) => c.position.sub(shift));
  g.userData.muzzle.sub(shift);
  g.userData.hold = {
    kind: m.bow ? 'bow' : isLong ? 'long' : 'pistol', action: 'mag', revolver: !!m.revolver, len,
    fore: new THREE.Vector3(0.035, -0.08, len * 0.55), well: new THREE.Vector3(0.03, -0.12, len * 0.15), bolt: new THREE.Vector3(-0.04, 0.05, len * 0.1),
    butt: new THREE.Vector3(0, -0.02, -(m.stock || 0.1) * (m.s || 1) - 0.05), mid: new THREE.Vector3(0, 0, len * 0.3), sight: new THREE.Vector3(0, 0.05, 0), sightY: 0, sightZ: 0,
    inspectStyle: w.id.length % 3,
  };
  return g;
}

export const WEAPON_COUNTS = Object.fromEntries(Object.entries(CATS).map(([k, [n]]) => [k, n]));
