// What anything in the world is made of, from one scanner.
//
// Nothing in the game needs its own "is this wood? is this metal?" code any more: ask the scanner
// about a ray hit, an object, a material or a spot on the ground and it reads the substrate from
// whatever evidence there is, strongest first:
//   1. a tag someone put on the object or its material (userData.substrate, or the older surf tags)
//   2. the names of the object, its material and its textures ("Oak_Planks", "rusty_steel", "tyre")
//   3. the physics of the surface itself: metalness, transmission, sheen, clearcoat, how rough it
//      is and what colour it is (glossy dark-grey dielectric is plastic, rough brown is wood, ...)
//   4. for the ground, the terrain's own layers (grass, dry dirt, sand, forest litter, paved, water)
// and returns one record that every system reads the same way: bullet penetration and holes,
// impact debris, footstep sound, grip underfoot (dry and wet), and how the surface wears
// (core/abrasion.js). Food, wood and metal are just rows in one table.
import * as THREE from 'three';

// wear: how the surface wears (the abrasion shader's family code)
//   0 generic, 1 painted metal, 2 bare metal, 3 wood, 4 painted wood, 5 plastic, 6 stone,
//   7 glass, 8 fabric, 9 leather, 10 rubber, 11 organic, 12 ceramic, 13 plaster
// density kg/m3; hardness ~Mohs; grip: friction underfoot dry / wet; step: footstep sound
// (base pitch Hz, how long it rings in s, how much it rings 0-1, how much it crunches 0-1, how soft
// 0-1); debris colour (sRGB hex) and kind; pen: the combat table's entry; under: the colour wear
// reveals underneath (sRGB), null when it shows the substrate's own colour lighter.
export const SUBSTRATES = {
  steel: { name: 'Steel', wear: 2, density: 7850, hardness: 4.5, grip: [0.5, 0.3], step: [2400, 0.22, 0.75, 0, 0.1], debris: [0xffd080, 'sparks'], pen: 'steel' },
  'sheet-metal': { name: 'Painted sheet metal', wear: 1, density: 7850, hardness: 4, grip: [0.55, 0.35], step: [1700, 0.16, 0.6, 0, 0.15], debris: [0xffd080, 'sparks'], pen: 'metal' },
  aluminium: { name: 'Aluminium', wear: 2, density: 2700, hardness: 2.8, grip: [0.5, 0.32], step: [2100, 0.12, 0.5, 0, 0.15], debris: [0xffe0a0, 'sparks'], pen: 'metal' },
  'cast-iron': { name: 'Cast iron', wear: 2, density: 7200, hardness: 4.5, grip: [0.55, 0.38], step: [900, 0.3, 0.8, 0, 0.05], debris: [0xffc070, 'sparks'], pen: 'steel' },
  wood: { name: 'Wood', wear: 3, density: 600, hardness: 2.5, grip: [0.6, 0.45], step: [260, 0.07, 0.15, 0.1, 0.35], debris: [0x9a7448, 'splinters'], pen: 'wood' },
  'painted-wood': { name: 'Painted wood', wear: 4, density: 600, hardness: 2.5, grip: [0.58, 0.42], step: [280, 0.07, 0.15, 0.1, 0.35], debris: [0xb08a5a, 'splinters'], pen: 'door' },
  bark: { name: 'Bark', wear: 3, density: 750, hardness: 2, grip: [0.7, 0.5], step: [200, 0.05, 0.05, 0.3, 0.5], debris: [0x5a4632, 'splinters'], pen: 'tree' },
  glass: { name: 'Glass', wear: 7, density: 2500, hardness: 5.5, grip: [0.5, 0.2], step: [3200, 0.1, 0.6, 0.2, 0.05], debris: [0xdfe9ee, 'shards'], pen: 'glass' },
  plastic: { name: 'Plastic', wear: 5, density: 950, hardness: 2, grip: [0.6, 0.4], step: [700, 0.05, 0.2, 0, 0.3], debris: null, pen: 'plastic' },
  rubber: { name: 'Rubber', wear: 10, density: 1200, hardness: 1, grip: [0.9, 0.7], step: [160, 0.04, 0, 0, 0.8], debris: [0x202020, 'dust'], pen: 'plastic' },
  concrete: { name: 'Concrete', wear: 6, density: 2400, hardness: 6, grip: [0.75, 0.6], step: [520, 0.03, 0, 0.15, 0.15], debris: [0xb8b4aa, 'dust'], pen: 'masonry' },
  asphalt: { name: 'Asphalt', wear: 6, density: 2300, hardness: 4, grip: [0.8, 0.6], step: [420, 0.03, 0, 0.25, 0.2], debris: [0x55524e, 'dust'], pen: 'masonry' },
  brick: { name: 'Brick', wear: 6, density: 1900, hardness: 5.5, grip: [0.75, 0.6], step: [480, 0.03, 0, 0.2, 0.15], debris: [0xa0583c, 'dust'], pen: 'brick' },
  stone: { name: 'Stone', wear: 6, density: 2600, hardness: 6.5, grip: [0.7, 0.45], step: [600, 0.04, 0.05, 0.25, 0.1], debris: [0x9c968c, 'dust'], pen: 'stone' },
  ceramic: { name: 'Ceramic tile', wear: 12, density: 2300, hardness: 7, grip: [0.6, 0.25], step: [1100, 0.05, 0.2, 0, 0.1], debris: [0xeeeeea, 'shards'], pen: 'masonry' },
  plaster: { name: 'Plaster / drywall', wear: 13, density: 800, hardness: 2, grip: [0.6, 0.5], step: [380, 0.03, 0, 0.1, 0.3], debris: [0xe8e4dc, 'dust'], pen: 'drywall' },
  stucco: { name: 'Stucco', wear: 13, density: 1800, hardness: 3, grip: [0.7, 0.55], step: [460, 0.03, 0, 0.2, 0.2], debris: [0xd8ccb4, 'dust'], pen: 'stucco' },
  fabric: { name: 'Fabric', wear: 8, density: 300, hardness: 0.5, grip: [0.7, 0.6], step: [180, 0.02, 0, 0, 0.95], debris: null, pen: 'fabric' },
  leather: { name: 'Leather', wear: 9, density: 860, hardness: 1, grip: [0.65, 0.5], step: [220, 0.03, 0, 0, 0.8], debris: null, pen: 'fabric' },
  food: { name: 'Food', wear: 11, density: 950, hardness: 0.3, grip: [0.4, 0.3], step: [150, 0.02, 0, 0, 1], debris: null, pen: 'fabric' },
  flesh: { name: 'Flesh', wear: 11, density: 1060, hardness: 0.2, grip: [0.6, 0.5], step: [150, 0.02, 0, 0, 1], debris: [0x6a0606, 'splat'], pen: 'fabric' },
  foliage: { name: 'Foliage', wear: 11, density: 400, hardness: 0.2, grip: [0.6, 0.45], step: [900, 0.02, 0, 0.6, 0.7], debris: [0x4a5a2a, 'leaves'], pen: 'fabric' },
  // the ground
  grass: { name: 'Grass on soil', wear: 11, density: 1400, hardness: 0.5, grip: [0.65, 0.45], step: [700, 0.02, 0, 0.45, 0.75], debris: [0x5a4a32, 'dirt'], pen: 'soil' },
  soil: { name: 'Dry dirt', wear: 11, density: 1500, hardness: 1, grip: [0.7, 0.35], step: [500, 0.02, 0, 0.55, 0.55], debris: [0x7a6448, 'dirt'], pen: 'soil' },
  sand: { name: 'Sand', wear: 11, density: 1600, hardness: 7, grip: [0.55, 0.62], step: [900, 0.02, 0, 0.8, 0.8], debris: [0xc8b48c, 'dirt'], pen: 'soil' },
  litter: { name: 'Forest litter', wear: 11, density: 600, hardness: 0.3, grip: [0.6, 0.42], step: [1000, 0.02, 0, 0.75, 0.65], debris: [0x4a3a26, 'leaves'], pen: 'soil' },
  water: { name: 'Shallow water', wear: 11, density: 1000, hardness: 0, grip: [0.5, 0.5], step: [600, 0.06, 0, 0.3, 0.9], debris: [0xdfe9ee, 'splash'], pen: 'water' },
  painted: { name: 'Painted surface', wear: 0, density: 1000, hardness: 2, grip: [0.6, 0.42], step: [500, 0.04, 0.1, 0, 0.3], debris: null, pen: 'masonry' },
};
for (const [id, s] of Object.entries(SUBSTRATES)) s.id = id;

// the older surface tags (combat, buildings, roads, trees) read as substrates
const LEGACY = {
  metal: 'sheet-metal', steel: 'steel', wood: 'wood', door: 'painted-wood', frame: 'wood', floor: 'wood', drywall: 'plaster',
  stucco: 'stucco', brick: 'brick', block: 'concrete', masonry: 'concrete', concrete: 'concrete', stone: 'stone', tree: 'bark',
  glass: 'glass', asphalt: 'asphalt',
};

export const fromSurf = (tag) => LEGACY[tag] || (SUBSTRATES[tag] ? tag : null);

// names in object, material and texture names (first match wins, so the specific ones go first)
const WORDS = [
  [/glass|window|windshield|windscreen|lens|mirror|bottle|headlamp/i, 'glass'],
  [/rubber|tyre|tire|tread|gasket/i, 'rubber'],
  [/leather|suede|holster/i, 'leather'],
  [/fabric|cloth|cotton|denim|wool|canvas|carpet|rug|uphol|curtain|textile|jacket|shirt|jeans|towel|sack/i, 'fabric'],
  [/bark|trunk|branch/i, 'bark'],
  [/plywood|painted.?wood|door/i, 'painted-wood'],
  [/wood|plank|timber|oak|pine|walnut|maple|birch|lumber|crate|pallet|stock|grip.?wood/i, 'wood'],
  [/alumin/i, 'aluminium'],
  [/cast.?iron|manhole|hydrant/i, 'cast-iron'],
  [/sheet|painted.?metal|car.?body|panel|locker|dumpster|mailbox|bin\b/i, 'sheet-metal'],
  [/rust|iron|steel|chrome|metal|brass|copper|\btin\b|zinc|barrel|slide|receiver|bolt|muzzle|trigger|magazine|scope|rail/i, 'steel'],
  [/brick/i, 'brick'],
  [/asphalt|tarmac|road/i, 'asphalt'],
  [/concrete|cement|sidewalk|pavement|curb|kerb/i, 'concrete'],
  [/marble|granite|stone|rock|cobble|gravel|slate|boulder|pebble/i, 'stone'],
  [/tile|ceramic|porcelain|china|toilet|sink/i, 'ceramic'],
  [/stucco/i, 'stucco'],
  [/plaster|drywall|gypsum|paper|cardboard|\bcard\b/i, 'plaster'],
  [/plastic|vinyl|pvc|acrylic|polymer|nylon|cone/i, 'plastic'],
  [/food|bread|fruit|apple|meat|burger|pizza|banana|orange|vegetable|cheese|cake|donut|sandwich|steak|fish/i, 'food'],
  [/skin|flesh|body|face|hair|head/i, 'flesh'],
  [/leaf|leaves|grass|plant|foliage|flower|bush|hedge|fern/i, 'foliage'],
];

const _c = new THREE.Color(), _hsl = {};
const nameOf = (t) => t ? [t.name, t.userData?.name, t.image?.currentSrc, t.image?.src, t.source?.data?.src].filter((s) => typeof s === 'string' && !s.startsWith('data:')).join(' ') : '';
function byName(...parts) {
  const s = parts.filter(Boolean).join(' ');
  if (!s.trim()) return null;
  for (const [re, id] of WORDS) if (re.test(s)) return id;
  return null;
}

// read a material's surface physics
function byProperties(m) {
  if (!m) return ['painted', 0.2];
  if ((m.transmission || 0) > 0.2 || (m.transparent && m.opacity < 0.75 && (m.roughness ?? 1) < 0.35)) return ['glass', 0.8];
  if ((m.sheen || 0) > 0.2) return ['fabric', 0.7];
  const metal = m.metalness ?? 0, rough = m.roughness ?? 1;
  if (metal >= 0.6) return [rough > 0.6 ? 'cast-iron' : 'steel', 0.75];
  if ((m.clearcoat || 0) > 0.3) return ['sheet-metal', 0.6]; // car paint
  if (!m.color) return ['painted', 0.2];
  _c.copy(m.color).convertLinearToSRGB().getHSL(_hsl);
  const hue = _hsl.h * 360, sat = _hsl.s, lum = _hsl.l;
  if (m.vertexColors && !m.map) return [rough <= 0.45 ? 'plastic' : 'painted', 0.3]; // painted parts: the colour is per vertex
  if (lum < 0.13 && sat < 0.25 && rough >= 0.6) return ['rubber', 0.45];
  if (rough <= 0.35) return ['plastic', 0.45]; // a glossy dielectric
  if (hue >= 15 && hue <= 50 && sat > 0.22 && lum < 0.6 && rough >= 0.55) return ['wood', 0.4];
  if (sat < 0.12 && rough >= 0.75) return ['concrete', 0.4];
  return ['painted', 0.3];
}

const matCache = new WeakMap();
// the substrate of one material (cached: materials don't change what they are)
export function scanMaterial(m) {
  if (!m) return { sub: SUBSTRATES.painted, how: 'default', confidence: 0.1 };
  let r = matCache.get(m);
  if (r) return r;
  const tag = m.userData?.substrate || LEGACY[m.userData?.surf];
  if (tag && SUBSTRATES[tag]) r = { sub: SUBSTRATES[tag], how: 'tag', confidence: 1 };
  else {
    const n = byName(m.name, nameOf(m.map), nameOf(m.normalMap), nameOf(m.roughnessMap));
    if (n) r = { sub: SUBSTRATES[n], how: 'name', confidence: 0.85 };
    else { const [id, c] = byProperties(m); r = { sub: SUBSTRATES[id], how: 'surface', confidence: c }; }
  }
  matCache.set(m, r);
  return r;
}

// the substrate of an object (tags on it or a parent win, then its name, then its material)
export function scanObject(o, materialIndex = 0) {
  for (let p = o, k = 0; p && k < 4; p = p.parent, k++) {
    const t = p.userData?.substrate || LEGACY[p.userData?.surf];
    if (t && SUBSTRATES[t]) return { sub: SUBSTRATES[t], how: 'tag', confidence: 1 };
  }
  const m = Array.isArray(o.material) ? o.material[materialIndex] || o.material[0] : o.material;
  const mr = m ? scanMaterial(m) : null;
  if (mr && mr.how !== 'surface' && mr.how !== 'default') return mr;
  const n = byName(o.name, o.parent?.name);
  if (n) return { sub: SUBSTRATES[n], how: 'name', confidence: 0.8 };
  return mr || { sub: SUBSTRATES.painted, how: 'default', confidence: 0.1 };
}

// the ground at (x, z): the terrain's own layers, and the paved city and town
let world = null;
export function setWorld(w) { world = w; } // { hm, grids: [CITY, TOWN], paved(x, z) -> height or null }
export function scanGround(x, z) {
  if (!world) return { sub: SUBSTRATES.grass, how: 'default', confidence: 0.1 };
  const { hm, grids } = world;
  if (hm.waterLevel(x, z) > hm.height(x, z) + 0.05) return { sub: SUBSTRATES.water, how: 'terrain', confidence: 1 };
  // the paved grid: streets run down the middle of the gaps between blocks, sidewalks round them
  // (parks and the town's back lawns aren't paved, so they fall through to the terrain)
  const pv = world.paved ? world.paved(x, z) : null;
  if (pv !== null) {
    for (const G of grids) {
      const lx = x - G.x0, lz = z - G.z0, hs = G.street / 2;
      if (lx < -hs || lz < -hs || lx > G.nx * G.pitch + hs || lz > G.nz * G.pitch + hs) continue;
      const u = ((lx % G.pitch) + G.pitch) % G.pitch, v = ((lz % G.pitch) + G.pitch) % G.pitch;
      const street = u < hs || u > G.pitch - hs || v < hs || v > G.pitch - hs;
      return { sub: street ? SUBSTRATES.asphalt : SUBSTRATES.concrete, how: 'terrain', confidence: 0.9 };
    }
  }
  const sand = hm.splatAt(x, z, 0), forest = hm.splatAt(x, z, 1), dry = hm.splatAt(x, z, 2), paved = hm.splatAt(x, z, 3);
  const grass = 1 - sand - forest - dry;
  const best = [[paved * 1.2, 'asphalt'], [sand, 'sand'], [forest, 'litter'], [dry, 'soil'], [grass, 'grass']].sort((a, b) => b[0] - a[0])[0];
  return { sub: SUBSTRATES[best[1]], how: 'terrain', confidence: Math.min(1, 0.4 + best[0]) };
}

// anything: a raycast hit ({object, face, point, instanceId}), an object, a material, or {x, z}
export function scan(t) {
  if (!t) return { sub: SUBSTRATES.painted, how: 'default', confidence: 0 };
  if (t.object) return scanObject(t.object, t.face?.materialIndex || 0);
  if (t.isObject3D) return scanObject(t);
  if (t.isMaterial) return scanMaterial(t);
  if (typeof t.x === 'number' && typeof t.z === 'number') return scanGround(t.x, t.z);
  return { sub: SUBSTRATES.painted, how: 'default', confidence: 0 };
}

// grip underfoot: dry friction to wet friction as the world gets wet
export const gripOf = (sub, wet = 0) => sub.grip[0] + (sub.grip[1] - sub.grip[0]) * Math.min(1, Math.max(0, wet));

// one line for the inspector
export function describe(r, wet = 0) {
  const s = r.sub;
  return `${s.name} · ${s.density} kg/m³ · hardness ${s.hardness} · grip ${gripOf(s, wet).toFixed(2)}${wet > 0.05 ? ' (wet)' : ''} · read from ${r.how} (${Math.round(r.confidence * 100)}%)`;
}
