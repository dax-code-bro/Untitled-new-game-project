// Vehicle catalog: 93 land vehicles, plus the tuning parts that fit them.
// Every model derives its body from one of the base body specs in
// carbuilder.js with its own proportions, wheels, lights and handling, so
// each one is a distinct shape on the road. All makes and models are invented.
import { deriveSpec, registerSpec } from './carbuilder.js';
import { VEHICLES } from './library.js';

const MAKES = ['Vantor', 'Meridian', 'Brazos', 'Calvera Motors', 'Gulfstar', 'Rivet', 'Sabine', 'Corsair', 'Lone Star Works', 'Heron', 'Delta Auto', 'Pelican', 'Ironbridge', 'Mesa', 'Bayline'];

// [class label, base body, count, ranges for L/W/height scale, handling, price, extra spec tweaks]
const CLASSES = [
  ['Compact', 'hatchback-sports', 8, { L: [3.7, 4.2], W: [1.7, 1.8], hk: [0.97, 1.05] }, { accel: 8.5, top: 46, grip: 7.6 }, 16000, { spokes: [5, 6, 10], fender: 0.1 }],
  ['Sedan', 'sedan', 12, { L: [4.5, 5.0], W: [1.78, 1.9], hk: [0.96, 1.04] }, { accel: 9, top: 50, grip: 7.5 }, 26000, { spokes: [6, 10, 0] }],
  ['Wagon', 'sedan', 5, { L: [4.7, 5.0], W: [1.8, 1.88], hk: [1.0, 1.05] }, { accel: 8.5, top: 48, grip: 7.3 }, 30000, { wagon: true, spokes: [6, 10] }],
  ['Coupe', 'sedan-sports', 7, { L: [4.4, 4.7], W: [1.82, 1.92], hk: [1.03, 1.1] }, { accel: 11, top: 60, grip: 8.4 }, 42000, { spokes: [5, 10], fender: 0.14 }],
  ['Muscle', 'sedan', 7, { L: [4.8, 5.2], W: [1.9, 2.0], hk: [0.9, 0.95] }, { accel: 12.5, top: 64, grip: 7.2 }, 48000, { muscle: true, spokes: [5, 6], fender: 0.16 }],
  ['Sports', 'sedan-sports', 8, { L: [4.3, 4.6], W: [1.88, 1.96], hk: [0.96, 1.0] }, { accel: 13, top: 72, grip: 9 }, 95000, { spokes: [5, 10], fender: 0.17 }],
  ['Super', 'sedan-sports', 6, { L: [4.4, 4.7], W: [1.95, 2.05], hk: [0.86, 0.92] }, { accel: 16, top: 88, grip: 10.5 }, 320000, { spokes: [5, 10], fender: 0.2 }],
  ['SUV', 'suv', 10, { L: [4.4, 5.2], W: [1.85, 2.05], hk: [0.95, 1.06] }, { accel: 8.5, top: 48, grip: 6.8 }, 38000, { spokes: [6, 10, 5] }],
  ['Pickup', 'truck', 8, { L: [5.2, 5.9], W: [1.95, 2.08], hk: [0.96, 1.05] }, { accel: 8.5, top: 47, grip: 6.4 }, 34000, { spokes: [6, 0], crew: true }],
  ['Van', 'van', 5, { L: [4.8, 5.4], W: [1.9, 2.0], hk: [0.95, 1.08] }, { accel: 7, top: 40, grip: 6 }, 29000, { spokes: [6, 0] }],
  ['Truck', 'delivery', 4, { L: [5.6, 7.0], W: [2.0, 2.2], hk: [0.95, 1.1] }, { accel: 6.2, top: 35, grip: 5.4 }, 52000, { spokes: [0] }],
  ['Bus', 'delivery', 2, { L: [10, 12], W: [2.5, 2.55], hk: [1.15, 1.2] }, { accel: 4.5, top: 30, grip: 4.6 }, 140000, { bus: true, spokes: [0] }],
  ['Emergency', null, 4, null, null, 0, null],
  ['Service', null, 4, null, null, 0, null],
  ['Off-road', 'suv', 3, { L: [3.6, 4.3], W: [1.75, 1.9], hk: [0.95, 1.05] }, { accel: 10, top: 46, grip: 8.2 }, 24000, { offroad: true, spokes: [6, 0] }],
];
// emergency/service vehicles reuse the dedicated body specs
const FIXED = {
  Emergency: [['police', 'Calvera PD Cruiser', 0], ['police-suv', 'Calvera PD Interceptor SUV', 0], ['ambulance', 'Mercy Ambulance', 0], ['firetruck', 'CFD Engine 9', 0]],
  Service: [['taxi', 'Calvera Cab', 18000], ['garbage-truck', 'City Sanitation', 90000], ['tow-truck', 'Gulfline Wrecker', 60000], ['delivery', 'Gulf Parcel Van', 45000]],
};
const NAMES = ['Arrow', 'Bandera', 'Corona', 'Durango', 'Esteban', 'Falcon', 'Galveston', 'Harbor', 'Ibis', 'Jubilee', 'Kestrel', 'Laredo', 'Mirage', 'Nomad', 'Osprey', 'Pecos', 'Quail', 'Ranger', 'Saber', 'Tejas', 'Ute', 'Vaquero', 'Wren', 'Xavier', 'Yucca', 'Zephyr', 'Atlas', 'Bravo', 'Cimarron', 'Dorado', 'Encino', 'Frontera'];

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;

export const LAND = []; // { id, cls, name, price, base }
export const CLASS_LIST = CLASSES.map((c) => c[0]);
{
  const r = rng(93);
  let n = 0;
  // extra base bodies: police SUV and tow truck
  registerSpec('police-suv', { ...deriveSpec('suv', { L: 5.05, W: 2.0 }), bar: 'siren', livery: 1, spokes: 0 });
  registerSpec('tow-truck', { ...deriveSpec('truck', { L: 5.9, W: 2.05 }), tow: true, spokes: 0 });
  VEHICLES['police-suv'] = { name: 'Calvera PD Interceptor SUV', len: 5.05, accel: 12, top: 60, grip: 7.8, weight: 0 };
  VEHICLES['tow-truck'] = { name: 'Gulfline Wrecker', len: 5.9, accel: 7.5, top: 42, grip: 6, weight: 0 };
  for (const [cls, base, count, dims, hand, price, tw] of CLASSES) {
    if (!base) {
      for (const [id, name, pr] of FIXED[cls]) { LAND.push({ id, cls, name, price: pr || 25000, base: id, restricted: pr === 0 }); n++; }
      continue;
    }
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const L = lerp(dims.L[0], dims.L[1], (t + r() * 0.3) % 1), W = lerp(dims.W[0], dims.W[1], r()), hk = lerp(dims.hk[0], dims.hk[1], r());
      const o = { L, W, hk, spokes: tw.spokes[i % tw.spokes.length], fender: tw.fender, rake: (r() - 0.5) * 0.25, fast: (r() - 0.5) * 0.3, Rw: undefined };
      if (tw.wagon) o.wagon = true;
      if (tw.muscle) o.muscle = true;
      if (tw.bus) o.bus = true;
      if (tw.offroad) o.offroad = true;
      if (tw.crew && i % 2 === 0) o.crew = true;
      const id = `${cls.toLowerCase().replace(/[^a-z]/g, '')}_${String(i + 1).padStart(2, '0')}`;
      registerSpec(id, deriveSpec(base, o));
      const make = MAKES[Math.floor(r() * MAKES.length)], model = NAMES[(n * 7 + i * 3) % NAMES.length];
      const name = `${make} ${model}${cls === 'Super' ? ' ' + ['R', 'GT', 'RS', 'Evo', 'S', 'X'][i % 6] : ''}`;
      const k = 1 + (r() - 0.5) * 0.2;
      VEHICLES[id] = { name, len: L, accel: +(hand.accel * k).toFixed(2), top: Math.round(hand.top * k), grip: +(hand.grip * (1 + (r() - 0.5) * 0.12)).toFixed(2), weight: 0 };
      LAND.push({ id, cls, name, price: Math.round(price * k * (1 + t * 0.4) / 500) * 500, base });
      n++;
    }
  }
}

// --- tuning: 63 parts per car (48 performance + 15 looks) -------------------
// effect keys: accel, top, grip, brake, armor (extra health), ride (lowering, m), nitro
const PERF = [
  ['Engine', 5, { accel: 0.07, top: 0.03 }, 2500],
  ['Turbo', 3, { accel: 0.08 }, 6000],
  ['Transmission', 4, { accel: 0.04, top: 0.02 }, 2000],
  ['Brakes', 4, { brake: 0.12 }, 1200],
  ['Suspension', 4, { grip: 0.04, ride: -0.02 }, 1500],
  ['Tires', 4, { grip: 0.06 }, 900],
  ['Armor', 5, { armor: 30 }, 3000],
  ['Nitrous', 3, { nitro: 1 }, 5000],
  ['Weight reduction', 3, { accel: 0.04, grip: 0.02 }, 3500],
  ['ECU tune', 3, { accel: 0.03, top: 0.03 }, 1800],
  ['Exhaust', 4, { accel: 0.02 }, 800],
  ['Intake', 3, { accel: 0.02, top: 0.01 }, 700],
  ['Differential', 3, { grip: 0.03 }, 1600],
];
const LOOKS = [
  ['Rims: 5-spoke', { spokes: 5 }, 1200], ['Rims: 6-spoke', { spokes: 6 }, 1100], ['Rims: 10-spoke', { spokes: 10 }, 1400], ['Rims: steel', { spokes: 0 }, 300], ['Rims: mesh', { spokes: 14 }, 2200],
  ['Window tint: light', { tint: 0.4 }, 400], ['Window tint: dark', { tint: 0.75 }, 600], ['Window tint: limo', { tint: 1 }, 900],
  ['Spoiler: lip', { spoiler: 1 }, 700], ['Spoiler: wing', { spoiler: 2 }, 1600], ['Spoiler: GT wing', { spoiler: 3 }, 2800],
  ['Lights: xenon', { lights: 1.6 }, 800], ['Lights: LED', { lights: 2.2 }, 1200],
  ['Plates: Calvera classic', { plate: 1 }, 150], ['Plates: vanity', { plate: 2 }, 900],
];
export const UPGRADES = [];
for (const [name, tiers, fx, price] of PERF) {
  for (let t = 1; t <= tiers; t++) UPGRADES.push({ id: `${name.toLowerCase().replace(/[^a-z]/g, '')}_${t}`, group: name, name: `${name} ${['', 'Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5'][t]}`, tier: t, fx, price: Math.round(price * t * (1 + t * 0.25)), kind: 'perf' });
}
for (const [name, fx, price] of LOOKS) UPGRADES.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), group: name.split(':')[0], name, tier: 1, fx, price, kind: 'look' });

// Paint shop colours (sold separately, not counted as parts)
export const PAINTS = [
  ['Arctic White', [0.82, 0.82, 0.8], 0], ['Pearl White', [0.8, 0.78, 0.72], 0.6], ['Gloss Black', [0.012, 0.012, 0.014], 0.2], ['Midnight Blue', [0.01, 0.025, 0.09], 0.7],
  ['Gulf Blue', [0.05, 0.2, 0.45], 0.5], ['Racing Red', [0.45, 0.01, 0.01], 0.2], ['Candy Red', [0.32, 0.005, 0.01], 0.9], ['Sunset Orange', [0.6, 0.18, 0.02], 0.5],
  ['Taxi Yellow', [0.62, 0.42, 0.02], 0], ['Lime', [0.25, 0.5, 0.03], 0.4], ['Bayou Green', [0.03, 0.12, 0.05], 0.6], ['Gunmetal', [0.1, 0.105, 0.11], 0.9],
  ['Silver', [0.45, 0.46, 0.48], 1], ['Champagne', [0.42, 0.34, 0.22], 0.9], ['Desert Tan', [0.36, 0.28, 0.17], 0.2], ['Purple Haze', [0.12, 0.03, 0.2], 0.8],
  ['Hot Pink', [0.6, 0.06, 0.2], 0.4], ['Chrome', [0.75, 0.75, 0.77], 1], ['Matte Black', [0.02, 0.02, 0.02], 0], ['Matte Army', [0.08, 0.1, 0.06], 0],
];

// Apply owned upgrades to a spawned Vehicle (handling + looks)
export function applyUpgrades(v, up = {}) {
  const base = v.baseSpec || (v.baseSpec = { ...v.spec });
  const s = v.spec;
  s.accel = base.accel; s.top = base.top; s.grip = base.grip; s.brakeK = 1;
  let armor = 0, ride = 0;
  for (const [group, tier] of Object.entries(up)) {
    const fam = PERF.find((p) => p[0] === group);
    if (!fam) continue;
    const fx = fam[2];
    s.accel *= 1 + (fx.accel || 0) * tier; s.top *= 1 + (fx.top || 0) * tier; s.grip *= 1 + (fx.grip || 0) * tier;
    s.brakeK *= 1 + (fx.brake || 0) * tier; armor += (fx.armor || 0) * tier; ride += (fx.ride || 0) * tier;
    if (fx.nitro) v.nitro = tier;
  }
  v.maxHealth = 100 + armor;
  v.health = Math.min(v.health, v.maxHealth);
  v.body.position.y = ride;
  const u = v.bodyMat?.userData.u;
  if (u) {
    if (up.tint !== undefined) u.uTint.value = up.tint;
    if (up.lights !== undefined) u.uLightK.value = up.lights;
    if (up.paint) { u.uPaint.value.setRGB(up.paint[0], up.paint[1], up.paint[2]); u.uMetal.value = up.paint[3]; }
  }
  if (up.spokes !== undefined && v.setRims) v.setRims(up.spokes);
  if (v.setSpoiler) v.setSpoiler(up.spoiler || 0);
}
