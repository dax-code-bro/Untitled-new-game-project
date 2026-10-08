// Sector 12: the island's shape, biomes, height, colors and climate.
// Pure functions (no three.js) so the same code runs on the main thread (physics)
// and in the terrain worker (mesh building). Everything is deterministic: same island every time.
import { makeNoise, fbm, ridged } from './noise.js';

// 700 square miles ~= 1813 km^2 -> a 42.6 km square map. The island sits in the middle of the ocean.
export const WORLD = {
  size: 42600,
  half: 21300,
  islandR: 18500,
  sea: 0,
  lake: 12, // inland water level (south lakes, jungle rivers and swamps)
};

const N1 = makeNoise(1201), N2 = makeNoise(1202), N3 = makeNoise(1203), N4 = makeNoise(1204);
const N5 = makeNoise(1205), N6 = makeNoise(1206), N7 = makeNoise(1207);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
export function smooth(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

const MOUNTAIN = { x: 0, z: -12500 };

// ------------------------------------------------------------------ biomes
// Directional biomes with noisy borders: north = -Z, south = +Z, east = +X, west = -X.
const BW = { n: 0, s: 0, e: 0, w: 0, hub: 0 };
export function biomeWeights(x, z, out = BW) {
  const len = Math.hypot(x, z) || 1;
  const dx = x / len + fbm(N2, x / 7000, z / 7000, 3) * 0.55;
  const dz = z / len + fbm(N2, x / 7000 + 50, z / 7000 + 50, 3) * 0.55;
  let n = Math.max(0, -dz), s = Math.max(0, dz), e = Math.max(0, dx), w = Math.max(0, -dx);
  n *= n * n; s *= s * s; e *= e * e; w *= w * w;
  const sum = n + s + e + w || 1;
  out.n = n / sum; out.s = s / sum; out.e = e / sum; out.w = w / sum;
  out.hub = smooth(2600, 900, len);
  return out;
}

// 0 at the island center, ~1 at the coastline.
export function islandD(x, z) {
  return (Math.hypot(x, z) / WORLD.islandR) * (1 + fbm(N2, x / 5000 + 9, z / 5000 - 9, 4) * 0.12);
}

// ------------------------------------------------------------------ per-biome landforms
function hNorth(x, z) {
  // Frostfang Range: one giant massif with ridged spurs, tallest point = extraction site
  const d = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
  const m = Math.max(0, 1 - d / 10500);
  const massif = Math.pow(m, 1.5) * 1750;
  const ridges = ridged(N3, x / 2600, z / 2600, 5) * 420 * (0.25 + m);
  const spike = Math.pow(Math.max(0, 1 - d / 1800), 2) * 450;
  return 90 + massif + ridges + spike + fbm(N1, x / 400, z / 400, 3) * 15;
}

function hWest(x, z) {
  // Scorch Expanse: very flat, with the occasional field of dunes
  const base = 28 + fbm(N1, x / 3000, z / 3000, 3) * 10 + fbm(N4, x / 300, z / 300, 2) * 1.2;
  const duneMask = smooth(0.15, 0.45, fbm(N5, x / 2200, z / 2200, 3));
  const warp = fbm(N4, x / 900, z / 900, 2) * 4;
  const dune = Math.pow(1 - Math.abs(Math.sin((x * 0.8 + z * 0.6) / 70 + warp)), 3) * 14 * duneMask;
  return base + dune;
}

function hEast(x, z) {
  // Verdant Reach: hilly jungle, rivers and low swampy ground that floods to the lake level
  let h = 45 + fbm(N1, x / 1500, z / 1500, 4) * 55 + ridged(N3, x / 900 + 30, z / 900, 3) * 60;
  const rv = Math.abs(fbm(N4, x / 3500, z / 3500, 3));
  h = lerp(h, WORLD.lake - 5, smooth(0.06, 0.0, rv));
  return h;
}

function hSouth(x, z) {
  // Timberline Wilds: rugged ground (lots of hiding spots), lakes and streams everywhere
  let h = 55 + ridged(N3, x / 800, z / 800, 4) * 95 + fbm(N1, x / 220, z / 220, 3) * 10;
  const basin = smooth(0.18, 0.38, fbm(N5, x / 2000 + 20, z / 2000 - 40, 3));
  h = lerp(h, WORLD.lake - 7, basin);
  const rv = Math.abs(fbm(N4, x / 2600 + 9, z / 2600, 3));
  h = lerp(h, WORLD.lake - 3, smooth(0.045, 0.0, rv) * 0.9);
  return h;
}

function hHub(x, z) {
  return 48 + fbm(N1, x / 900, z / 900, 3) * 8;
}

// Height before flattened building pads.
export function heightRaw(x, z) {
  const d = islandD(x, z);
  if (d > 1.12) return -38;
  const B = biomeWeights(x, z);
  let inland = 0;
  if (B.n > 0.001) inland += B.n * hNorth(x, z);
  if (B.s > 0.001) inland += B.s * hSouth(x, z);
  if (B.e > 0.001) inland += B.e * hEast(x, z);
  if (B.w > 0.001) inland += B.w * hWest(x, z);
  if (B.hub > 0.001) inland = lerp(inland, hHub(x, z), B.hub);
  const ramp = smooth(0.955, 0.80, d); // beaches give way to the biome further inland
  const beach = clamp(1.2 + (0.985 - d) * 60, -2, 6);
  let h = lerp(beach, inland, ramp);
  h = lerp(h, -35, smooth(0.985, 1.06, d)); // shelf into the ocean
  return h;
}

// ------------------------------------------------------------------ points of interest
// pad: flattened area (radius r) at the terrain height of its center.
export const POIS = [
  { id: 'pob', name: 'The Hub — POB', x: 0, z: 0, r: 70, region: 'hub', kind: 'pob' },
  // north — Frostfang Range
  { id: 'summit', name: 'Frostfang Summit (Extraction)', x: 0, z: -12500, r: 28, region: 'n', kind: 'extract' },
  { id: 'whiteout', name: 'Whiteout Station', x: -3500, z: -9000, r: 60, region: 'n', kind: 'outpost' },
  { id: 'glacier', name: 'Glacier Pass Depot', x: 4300, z: -7600, r: 55, region: 'n', kind: 'depot' },
  { id: 'icebreaker', name: 'Icebreaker Cliffs', x: 1500, z: -16700, r: 60, region: 'n', kind: 'outpost' },
  // west — Scorch Expanse
  { id: 'airfield', name: 'Scorch Flats Airfield', x: -11000, z: -1500, r: 110, region: 'w', kind: 'airfield' },
  { id: 'refinery', name: 'Old Salt Refinery', x: -7000, z: 3500, r: 80, region: 'w', kind: 'industrial' },
  { id: 'duneout', name: 'Dune Sea Outpost', x: -14500, z: 2500, r: 50, region: 'w', kind: 'outpost' },
  { id: 'mirage', name: 'Mirage Wells', x: -9000, z: -5800, r: 55, region: 'w', kind: 'village' },
  // east — Verdant Reach (jungle)
  { id: 'ruins', name: 'Verdant Ruins', x: 10000, z: -2500, r: 75, region: 'e', kind: 'ruins' },
  { id: 'howler', name: 'Howler Ridge', x: 14600, z: 2200, r: 60, region: 'e', kind: 'village' },
  { id: 'canopy', name: 'Canopy Village', x: 6500, z: 4200, r: 60, region: 'e', kind: 'village' },
  // south — Timberline Wilds
  { id: 'lodge', name: 'Timberfall Lodge', x: -2500, z: 9500, r: 55, region: 's', kind: 'lodge' },
  { id: 'mirror', name: 'Mirror Lakes Camp', x: 3500, z: 12000, r: 45, region: 's', kind: 'camp' },
  { id: 'hollow', name: "Hunter's Hollow", x: -6500, z: 13300, r: 45, region: 's', kind: 'camp' },
  // coast
  { id: 'shipwreck', name: 'Shipwreck Cove', x: -12300, z: 12400, r: 50, region: 'beach', kind: 'wreck' },
  { id: 'lighthouse', name: 'Lighthouse Point', x: 12600, z: -11900, r: 40, region: 'beach', kind: 'lighthouse' },
];

function findPeak() {
  let best = { x: MOUNTAIN.x, z: MOUNTAIN.z, h: -1e9 };
  for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) {
    const x = MOUNTAIN.x + i * 60, z = MOUNTAIN.z + j * 60;
    const h = heightRaw(x, z);
    if (h > best.h) best = { x, z, h };
  }
  const c = { ...best };
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) {
    const x = c.x + i * 10, z = c.z + j * 10;
    const h = heightRaw(x, z);
    if (h > best.h) best = { x, z, h };
  }
  return best;
}

{
  const peak = findPeak();
  const s = POIS.find((p) => p.id === 'summit');
  s.x = peak.x; s.z = peak.z;
  for (const p of POIS) {
    let h = heightRaw(p.x, p.z);
    if (p.kind === 'wreck' || p.kind === 'lighthouse') h = Math.max(h, 3);
    else h = Math.max(h, WORLD.lake + 2.5);
    p.h = h;
  }
}

export function heightAt(x, z) {
  let h = heightRaw(x, z);
  for (let i = 0; i < POIS.length; i++) {
    const p = POIS[i];
    const dx = x - p.x, dz = z - p.z;
    const r = p.r + 45;
    if (dx * dx + dz * dz > r * r) continue;
    const k = smooth(p.r + 45, p.r, Math.hypot(dx, dz));
    h = lerp(h, p.h, k);
  }
  return h;
}

export function normalAt(x, z, e = 1.5) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

// ------------------------------------------------------------------ regions / climate
export const REGIONS = {
  hub: { name: 'The Hub', color: '#c9b46a' },
  n: { name: 'Frostfang Range', color: '#cfe3ff' },
  w: { name: 'Scorch Expanse', color: '#ffb35a' },
  e: { name: 'Verdant Reach', color: '#59d17a' },
  s: { name: 'Timberline Wilds', color: '#8fd16a' },
  beach: { name: 'Shoreline', color: '#f3e3b0' },
  ocean: { name: 'Open Ocean', color: '#6fb6ff' },
};

export function regionAt(x, z, h = heightAt(x, z)) {
  const d = islandD(x, z);
  if (d > 0.99 && h < 0.5) return 'ocean';
  if (d > 0.88 && h < 5) return 'beach';
  const B = biomeWeights(x, z);
  if (B.hub > 0.55) return 'hub';
  let best = 'n', bv = B.n;
  if (B.s > bv) { best = 's'; bv = B.s; }
  if (B.e > bv) { best = 'e'; bv = B.e; }
  if (B.w > bv) { best = 'w'; }
  return best;
}

// Ambient temperature in degrees C. hour: 0..24
export function temperatureAt(x, z, y, hour) {
  const B = biomeWeights(x, z);
  let t = B.n * -24 + B.s * 15 + B.e * 31 + B.w * 40;
  t = lerp(t, 22, B.hub);
  const d = islandD(x, z);
  if (d > 0.88) t = lerp(t, 26, smooth(0.88, 0.97, d));
  t -= Math.max(0, y - 100) * 0.0065; // altitude lapse rate
  // Frostfang's own cold: the whole massif is frigid, not just its peak
  t -= 16 * Math.max(0, 1 - Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) / 12000);
  const swing = B.w * 14 + (1 - B.w) * 6; // deserts swing hard between day and night
  const day = Math.cos(((hour - 14) / 24) * Math.PI * 2); // warmest at 14:00
  return Math.max(-58, t + swing * day);
}

// Is a terrain point covered by snow? (north + altitude)
export function snowAt(x, z, h) {
  const B = biomeWeights(x, z);
  return B.n > 0.45 && h > 140 + (1 - B.n) * 400;
}

// ------------------------------------------------------------------ colors (linear RGB)
const toLin = (hex) => {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  return c.map((v) => Math.pow(v / 255, 2.2));
};
const C = {
  forestA: toLin(0x3d5a2a), forestB: toLin(0x5a7238), dirt: toLin(0x5e4b33),
  jungleA: toLin(0x2a4f20), jungleB: toLin(0x3e6c27),
  desertA: toLin(0xd2b27a), desertB: toLin(0xe4cb98),
  tundra: toLin(0x7c8070), snow: toLin(0xeef3f8), snowShade: toLin(0xc9d6e6),
  hubA: toLin(0x8b8a58), hubB: toLin(0xa39b68),
  sand: toLin(0xe3d2a2), wetSand: toLin(0xb9a77c), seabed: toLin(0x7f7357), mud: toLin(0x4f4330),
  rock: toLin(0x6f675d), rockSnow: toLin(0x8c8d93), rockDesert: toLin(0xa98a62),
};
const mix3 = (out, a, b, t) => { out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); return out; };
const tmp = [0, 0, 0], acc = [0, 0, 0];

export function colorAt(x, z, h, ny, out = [0, 0, 0]) {
  const B = biomeWeights(x, z);
  const v = fbm(N6, x / 70, z / 70, 2) * 0.5 + 0.5;
  const v2 = fbm(N7, x / 400, z / 400, 2) * 0.5 + 0.5;
  acc[0] = acc[1] = acc[2] = 0;
  const add = (col, w) => { acc[0] += col[0] * w; acc[1] += col[1] * w; acc[2] += col[2] * w; };
  // south forest: green with dirt patches
  mix3(tmp, C.forestA, C.forestB, v); if (v2 < 0.35) mix3(tmp, tmp, C.dirt, (0.35 - v2) * 2);
  add(tmp, B.s);
  add(mix3(tmp, C.jungleA, C.jungleB, v), B.e);
  add(mix3(tmp, C.desertA, C.desertB, v * 0.7 + v2 * 0.3), B.w);
  if (snowAt(x, z, h)) add(mix3(tmp, C.snowShade, C.snow, v), B.n);
  else add(mix3(tmp, C.tundra, C.snowShade, smooth(60, 140, h) * 0.5), B.n);
  out[0] = acc[0]; out[1] = acc[1]; out[2] = acc[2];
  if (B.hub > 0) mix3(out, out, mix3(tmp, C.hubA, C.hubB, v), B.hub);
  // steep ground shows rock
  const rockK = smooth(0.82, 0.62, ny);
  if (rockK > 0) {
    const rc = B.n > 0.5 ? C.rockSnow : B.w > 0.5 ? C.rockDesert : C.rock;
    mix3(out, out, rc, rockK);
  }
  // lake / river beds
  const d = islandD(x, z);
  if (d < 0.82 && h < WORLD.lake + 1) mix3(out, out, C.mud, smooth(WORLD.lake + 1, WORLD.lake - 1, h));
  // beaches and sea floor
  if (d > 0.8) {
    const beachK = smooth(6, 3, h) * smooth(0.8, 0.9, d);
    if (beachK > 0) mix3(out, out, mix3(tmp, C.sand, C.desertB, v * 0.3), beachK);
    if (h < 0.6) mix3(out, out, h < -6 ? C.seabed : C.wetSand, smooth(0.6, -1, h));
  }
  return out;
}
