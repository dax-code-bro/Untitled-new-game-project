// The POB crafting catalog: everything that can be printed, what it costs in filament,
// and how long it takes. Tune numbers here. One game day = 30 real minutes (see world.js).

// ------------------------------------------------------------------ terminal categories
export const CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'weapons', name: 'Weapons' },
  { id: 'ammo', name: 'Ammo' },
  { id: 'attachments', name: 'Attachments' },
  { id: 'armor', name: 'Armor' },
  { id: 'medical', name: 'Medical' },
  { id: 'tools', name: 'Tools' },
  { id: 'gear', name: 'Gear' },
  { id: 'buildings', name: 'Buildings' },
  { id: 'camo', name: 'Camo' },
];

// ------------------------------------------------------------------ ammo
// Light: .22 / 9mm and smaller. Medium: .38 Special up to 5.56 NATO. Heavy: above 5.56 (7.62, .50 ...).
// pen = penetration power, compared against armor level (see armorMultiplier).
export const AMMO = {
  light: { name: 'Light Ammo', short: 'LGT', pen: 2, bleed: 0.25, color: '#c9c3b0' },
  medium: { name: 'Medium Ammo', short: 'MED', pen: 4, bleed: 0.35, color: '#d9b45a' },
  heavy: { name: 'Heavy Ammo', short: 'HVY', pen: 6, bleed: 0.5, color: '#d97a4a' },
  ap_light: { name: 'AP Light Rounds', short: 'AP-L', pen: 5, bleed: 0.2, color: '#9ad0ff', ap: true, base: 'light' },
  ap_medium: { name: 'AP Medium Rounds', short: 'AP-M', pen: 7, bleed: 0.3, color: '#6fb6ff', ap: true, base: 'medium' },
  ap_heavy: { name: 'AP Heavy Rounds', short: 'AP-H', pen: 9, bleed: 0.4, color: '#4a8fff', ap: true, base: 'heavy' },
  exp_round: { name: 'Explosive Rounds', short: 'EXP', pen: 3, bleed: 0.4, color: '#ff5a3a', explosive: true, blast: 2.5, blastDmg: 35 },
  shell: { name: 'Shotgun Shells', short: '12G', pen: 1, bleed: 0.5, color: '#d94a4a', shot: true },
  slug: { name: 'Shotgun Slugs', short: 'SLUG', pen: 5, bleed: 0.6, color: '#b03a3a' },
  exp_slug: { name: 'Explosive Slugs', short: 'X-SLUG', pen: 4, bleed: 0.5, color: '#ff3a1a', explosive: true, blast: 4, blastDmg: 70 },
};

// Which ammo a weapon's ammo class accepts. Explosive rounds fit any gun that isn't a shotgun.
export function ammoOptions(def) {
  switch (def.ammoClass) {
    case 'light': return ['light', 'ap_light', 'exp_round'];
    case 'medium': return ['medium', 'ap_medium', 'exp_round'];
    case 'heavy': return ['heavy', 'ap_heavy', 'exp_round'];
    case 'shotgun': return ['shell', 'slug', 'exp_slug'];
    case 'slug': return ['slug', 'exp_slug'];
    default: return [];
  }
}

// ------------------------------------------------------------------ armor
// L1..L10. Damage multiplier for a hit on armor:
//   pen >  level -> goes through (x0.85)
//   pen == level -> partial (x0.55)
//   pen <  level -> stopped, blunt trauma only
// Calibrated so the BG-850 Cal (pen 10, 170 dmg) one-shots up to L9 but needs 2 shots on L10.
export function armorMultiplier(pen, level) {
  if (!level) return 1;
  if (pen > level) return 0.85;
  if (pen === level) return 0.55;
  return Math.max(0.08, 0.45 - (level - pen) * 0.05);
}
export const armorDurability = (level) => 40 + level * 25;
export const armorSpeed = (vest, helmet) => (1 - 0.022 * Math.max(0, vest - 1)) * (1 - 0.004 * Math.max(0, helmet - 1));

// ------------------------------------------------------------------ weapons
// dmg per bullet (or per pellet), rpm, mag, reload seconds, spread (radians), range (m, falloff start)
// mode: auto | semi | pump | bolt | break | revolver
const W = (o) => ({ cat: 'weapons', stack: 1, ...o });
export const WEAPONS = {
  zip22: W({ name: 'Zip .22', sub: 'Pistol', desc: 'A scrap single-shot .22. Barely a weapon. Better than nothing.',
    caliber: '.22 LR', ammoClass: 'light', dmg: 16, rpm: 60, mode: 'break', mag: 1, reload: 1.6, spread: 0.02, adsSpread: 0.008,
    recoil: 0.01, range: 20, fov: 62, cost: 10, time: 45, shape: 'pistol', mags: [], optics: [] }),
  gg60: W({ name: 'GG 60', sub: 'Machine Pistol', desc: 'Full-auto pistol. 1300 RPM with savage recoil: shreds unarmored players, burns ammo instantly.',
    caliber: '9mm', ammoClass: 'light', dmg: 17, rpm: 1300, mode: 'auto', mag: 22, reload: 1.6, spread: 0.035, adsSpread: 0.014,
    recoil: 0.024, range: 18, fov: 62, cost: 22, time: 90, shape: 'pistol', mags: ['ext1', 'ext2', 'ext3', 'drum'], optics: ['reddot', 'holo'] }),
  victors: W({ name: 'Victors', sub: 'Dual SMGs', desc: 'Two full-auto 9mm SMGs, one per hand. 2000 RPM spray-and-pray. 30 rounds total and they can NOT be reloaded.',
    caliber: '9mm', ammoClass: 'light', dmg: 15, rpm: 2000, mode: 'auto', mag: 30, reload: 0, noReload: true, dual: true, spread: 0.06, adsSpread: 0.05,
    recoil: 0.012, range: 15, fov: 66, cost: 25, time: 100, shape: 'dual', mags: [], optics: [] }),
  m1911: W({ name: '1911', sub: 'Pistol', desc: 'Classic .45 ACP sidearm. Reliable, hits hard for a pistol.',
    caliber: '.45 ACP', ammoClass: 'medium', dmg: 34, rpm: 400, mode: 'semi', mag: 7, reload: 1.5, spread: 0.014, adsSpread: 0.004,
    recoil: 0.025, range: 28, fov: 62, cost: 15, time: 60, shape: 'pistol', mags: ['ext1', 'ext2'], optics: ['reddot'] }),
  sixshooter: W({ name: 'Six Shooter', sub: 'Revolver', desc: 'Six rounds of .357. Reloads one cartridge at a time.',
    caliber: '.357 Magnum', ammoClass: 'medium', dmg: 48, rpm: 220, mode: 'revolver', mag: 6, reload: 0.45, perRound: true,
    spread: 0.012, adsSpread: 0.003, recoil: 0.04, range: 32, fov: 60, cost: 18, time: 70, shape: 'revolver', mags: [], optics: ['reddot'] }),
  guillotine: W({ name: 'The Guillotine', sub: 'Revolver', desc: 'A giant .50 caliber revolver. Five chances to end an argument.',
    caliber: '.50 Magnum', ammoClass: 'heavy', penBonus: 2, dmg: 98, rpm: 120, mode: 'revolver', mag: 5, reload: 0.6, perRound: true,
    spread: 0.016, adsSpread: 0.004, recoil: 0.09, range: 40, fov: 58, cost: 70, time: 210, shape: 'revolver_big', mags: [], optics: ['reddot', 'scope1'] }),
  d744: W({ name: '744', sub: 'Hand Cannon', desc: 'Semi-auto .50 AE hand cannon. Seven big rounds.',
    caliber: '.50 AE', ammoClass: 'heavy', penBonus: 1, dmg: 72, rpm: 200, mode: 'semi', mag: 7, reload: 1.9, spread: 0.016, adsSpread: 0.005,
    recoil: 0.07, range: 35, fov: 60, cost: 45, time: 150, shape: 'pistol_big', mags: ['ext1'], optics: ['reddot', 'holo'] }),
  ka43: W({ name: 'Kalani KA-43', sub: 'Assault Rifle', desc: 'Rugged 7.62 rifle. Heavy hitter with heavy recoil.',
    caliber: '7.62x39', ammoClass: 'heavy', dmg: 35, rpm: 600, mode: 'auto', mag: 30, reload: 2.4, spread: 0.038, adsSpread: 0.0045,
    recoil: 0.021, range: 70, fov: 55, cost: 32, time: 160, shape: 'rifle_wood', mags: ['ext1', 'ext2', 'ext3', 'drum'],
    optics: ['reddot', 'holo', 'scope1', 'scope4', 'scope6'] }),
  xm9: W({ name: 'XM9 Model 6', sub: 'Assault Rifle', desc: 'The standard 5.56 carbine. Controllable, accurate, does everything well.',
    caliber: '5.56 NATO', ammoClass: 'medium', dmg: 28, rpm: 780, mode: 'auto', mag: 30, reload: 2.1, spread: 0.033, adsSpread: 0.0035,
    recoil: 0.013, range: 75, fov: 55, cost: 30, time: 150, shape: 'rifle', mags: ['ext1', 'ext2', 'ext3', 'drum'],
    optics: ['reddot', 'holo', 'scope1', 'scope4', 'scope6'] }),
  patriot09: W({ name: 'Patriot 09', sub: 'Hybrid Rifle', desc: 'Full-auto 5.56 at 600 RPM, with a pump foregrip. Pump it [V] and the second tube feeds 12-gauge: it becomes a shotgun.',
    caliber: '5.56 NATO + 12 Gauge', ammoClass: 'medium', dmg: 30, rpm: 600, mode: 'auto', mag: 30, reload: 2.2, spread: 0.032, adsSpread: 0.0035,
    recoil: 0.014, range: 75, fov: 55, cost: 110, time: 360, shape: 'rifle_pump',
    tube: { ammoClass: 'shotgun', mag: 4, dmg: 15, pellets: 8, rpm: 70, mode: 'pump', spread: 0.07, adsSpread: 0.055, reload: 0.5, range: 14 },
    mags: ['ext1', 'ext2', 'ext3'], optics: ['reddot', 'holo', 'scope1', 'scope4'] }),
  trench: W({ name: 'Trench Shotgun', sub: 'Shotgun', desc: 'Standard pump-action 12 gauge.',
    caliber: '12 Gauge', ammoClass: 'shotgun', dmg: 15, pellets: 8, rpm: 70, mode: 'pump', mag: 6, reload: 0.55, perRound: true,
    spread: 0.075, adsSpread: 0.06, recoil: 0.06, range: 14, fov: 62, cost: 28, time: 110, shape: 'shotgun', mags: [], optics: ['reddot'] }),
  semishot: W({ name: 'Semi-Auto Shotgun', sub: 'Shotgun', desc: 'Semi-automatic 12 gauge. Fast follow-ups.',
    caliber: '12 Gauge', ammoClass: 'shotgun', dmg: 12, pellets: 8, rpm: 260, mode: 'semi', mag: 8, reload: 0.5, perRound: true,
    spread: 0.08, adsSpread: 0.065, recoil: 0.05, range: 12, fov: 62, cost: 42, time: 150, shape: 'shotgun_semi', mags: ['ext1'], optics: ['reddot', 'holo'] }),
  slugthrower: W({ name: 'Slug Thrower', sub: 'Break-Action', desc: 'Long-range shotgun: slugs out to 100 m for 74 damage. Break action, one shot, slugs only.',
    caliber: '12 Gauge Slug', ammoClass: 'slug', dmg: 74, rpm: 60, mode: 'break', mag: 1, reload: 1.8, spread: 0.02, adsSpread: 0.002,
    recoil: 0.07, range: 100, fov: 50, cost: 38, time: 140, shape: 'breaker', mags: [], optics: ['reddot', 'scope1', 'scope4'] }),
  bg850: W({ name: 'BG 850 Cal', sub: 'Sniper Rifle', desc: '.50 caliber anti-materiel sniper. Punches through almost any armor; level 10 armor takes two.',
    caliber: '.50 BMG', ammoClass: 'heavy', penBonus: 4, dmg: 170, rpm: 40, mode: 'bolt', mag: 5, reload: 3.2, spread: 0.06, adsSpread: 0.0003,
    recoil: 0.11, range: 900, fov: 9, cost: 450, time: 900, shape: 'sniper', builtinOptic: 'scope10', mags: ['ext1'], optics: ['scope6', 'scope10'] }),
  throwknives: W({ name: 'Throwing Knives (x3)', sub: 'Throwable', desc: 'Three balanced knives. Silent. Pick them back up.',
    melee: true, throwable: true, dmg: 60, count: 3, cost: 8, time: 40, shape: 'knife' }),
  co2knife: W({ name: 'CO2 Knife', sub: 'Melee', desc: 'A knife with a trigger in the handle. The blade fires straight out to 25 m; past that you must aim up.',
    melee: true, dmg: 45, shootDmg: 80, shootRange: 25, cost: 20, time: 80, shape: 'knife' }),
};

// ------------------------------------------------------------------ everything else
const I = (cat, o) => ({ cat, stack: 1, ...o });
const ITEMS_RAW = {
  // ammo (one print = one pack)
  ammo_light: I('ammo', { name: 'Light Ammo x30', ammo: 'light', amount: 30, cost: 3, time: 15 }),
  ammo_medium: I('ammo', { name: 'Medium Ammo x30', ammo: 'medium', amount: 30, cost: 4, time: 20 }),
  ammo_heavy: I('ammo', { name: 'Heavy Ammo x20', ammo: 'heavy', amount: 20, cost: 6, time: 25 }),
  ammo_shell: I('ammo', { name: 'Shotgun Shells x12', ammo: 'shell', amount: 12, cost: 4, time: 20 }),
  ammo_slug: I('ammo', { name: 'Shotgun Slugs x8', ammo: 'slug', amount: 8, cost: 5, time: 20 }),
  ammo_exp_slug: I('ammo', { name: 'Explosive Slugs x4', ammo: 'exp_slug', amount: 4, cost: 15, time: 60 }),
  ammo_exp_round: I('ammo', { name: 'Explosive Rounds x10', ammo: 'exp_round', amount: 10, cost: 20, time: 60 }),
  ammo_ap_light: I('ammo', { name: 'AP Light Rounds x30', ammo: 'ap_light', amount: 30, cost: 8, time: 30 }),
  ammo_ap_medium: I('ammo', { name: 'AP Medium Rounds x30', ammo: 'ap_medium', amount: 30, cost: 10, time: 35 }),
  ammo_ap_heavy: I('ammo', { name: 'AP Heavy Rounds x20', ammo: 'ap_heavy', amount: 20, cost: 14, time: 40 }),

  // attachments
  ext1: I('attachments', { name: 'Extended Mag I', slot: 'mag', magMul: 1.25, desc: '+25% magazine', cost: 8, time: 40 }),
  ext2: I('attachments', { name: 'Extended Mag II', slot: 'mag', magMul: 1.5, desc: '+50% magazine', cost: 15, time: 60 }),
  ext3: I('attachments', { name: 'Extended Mag III', slot: 'mag', magMul: 1.75, desc: '+75% magazine', cost: 25, time: 90 }),
  drum: I('attachments', { name: 'Drum Magazine', slot: 'mag', magMul: 2.5, reloadMul: 1.35, desc: '+150% magazine, slower reload', cost: 45, time: 150 }),
  reddot: I('attachments', { name: 'Red Dot', slot: 'optic', zoom: 1.15, desc: 'Clean dot sight', cost: 10, time: 40 }),
  holo: I('attachments', { name: 'Holographic Sight', slot: 'optic', zoom: 1.2, desc: 'Wide holo reticle', cost: 12, time: 45 }),
  scope1: I('attachments', { name: '1x Scope', slot: 'optic', zoom: 1.3, desc: 'Low-power optic', cost: 10, time: 45 }),
  scope4: I('attachments', { name: '4x Scope', slot: 'optic', zoom: 4, scoped: true, desc: 'Mid-range magnified optic', cost: 25, time: 80 }),
  scope6: I('attachments', { name: '6x Scope', slot: 'optic', zoom: 6, scoped: true, desc: 'Long-range optic', cost: 40, time: 120 }),
  scope10: I('attachments', { name: '10x Scope', slot: 'optic', zoom: 10, scoped: true, desc: 'Extreme-range optic', cost: 90, time: 240 }),

  // medical
  bandage: I('medical', { name: 'Bandage', med: { stop: 'light', heal: 10, time: 2.5 }, desc: 'Stops light bleeding, +10 HP', cost: 2, time: 10 }),
  gauze: I('medical', { name: 'Gauze', med: { stop: 'light', reduce: true, heal: 15, time: 3.5 }, desc: 'Stops light bleeding and turns heavy bleeding light, +15 HP', cost: 4, time: 15 }),
  tourniquet: I('medical', { name: 'Tourniquet', med: { stop: 'heavy', time: 3 }, desc: 'Stops heavy bleeding (limbs)', cost: 6, time: 20 }),
  medkit: I('medical', { name: 'Medic Kit', med: { stop: 'all', heal: 60, fix: true, time: 6 }, desc: 'Stops all bleeding, fixes fractures, +60 HP', cost: 18, time: 60 }),
  adrenaline: I('medical', { name: 'Adrenaline Shot', med: { adrenaline: 25, heal: 10, time: 1 }, desc: '+25% speed and no pain for 25 s', cost: 12, time: 45 }),
  numbing: I('medical', { name: 'Numbing Gel', med: { numb: 90, time: 2 }, desc: 'Ignore fracture and pain penalties for 90 s', cost: 8, time: 30 }),
  scalpel: I('medical', { name: 'Scalpel', med: { fragment: true, time: 4 }, desc: 'Removes lodged fragments (shotgun/explosive hits)', cost: 6, time: 30 }),
  handwarmer: I('medical', { name: 'Hand Warmers', med: { warm: 300, time: 1 }, desc: '+12 C cold protection for 5 minutes', cost: 3, time: 15 }),
  meat: I('medical', { name: 'Cooked Meat', med: { heal: 15, time: 3 }, desc: 'From hunting. +15 HP', cost: 0, time: 0, noCraft: true }),

  // tools
  knife: I('tools', { name: 'Knife', melee: true, dmg: 42, desc: 'Melee. Harvests animals.', cost: 6, time: 30, shape: 'knife' }),
  hatchet: I('tools', { name: 'Hatchet', melee: true, dmg: 62, desc: 'Heavy melee. Harvests animals faster.', cost: 10, time: 45, shape: 'hatchet' }),
  flaregun: I('tools', { name: 'Flare Gun', shots: 2, desc: '2 shots. Every enemy within 50 m of the flare is outlined red for 10 minutes.', cost: 25, time: 90, shape: 'flaregun' }),

  // gear (clothing slots)
  winter_gear: I('gear', { name: 'Winter Gear', wear: 'clothing', cold: 34, heat: -10, desc: 'Keeps you alive in the Frostfang Range. Hot everywhere else.', cost: 40, time: 180 }),
  sand_gear: I('gear', { name: 'Sand Gear', wear: 'clothing', heat: 26, cold: 2, desc: 'Light gear for the Scorch Expanse.', cost: 30, time: 150 }),
  camo_forest: I('gear', { name: 'Forest Camo Suit', wear: 'suit', heat: 14, camo: 's', desc: 'Worn over armor. Heat resistant, hides you in the forest and jungle. Can\'t be pinned, no kill cam.', cost: 60, time: 240 }),
  camo_desert: I('gear', { name: 'Desert Camo Suit', wear: 'suit', heat: 18, camo: 'w', desc: 'Worn over armor. Very heat resistant, hides you in the desert. Can\'t be pinned, no kill cam.', cost: 60, time: 240 }),
  camo_winter: I('gear', { name: 'Winter Camo Suit', wear: 'suit', heat: 12, cold: 8, camo: 'n', desc: 'Worn over armor. Hides you in snow. Can\'t be pinned, no kill cam.', cost: 60, time: 240 }),

  // buildings / deployables
  treestand: I('buildings', { name: 'Tree Stand', deploy: 'treestand', desc: 'Climbable hunting platform, 5 m up. Place next to a tree.', cost: 35, time: 200 }),
  sandbags: I('buildings', { name: 'Sandbag Wall', deploy: 'sandbags', desc: 'Waist-high bullet-stopping cover.', cost: 12, time: 60 }),
  barricade: I('buildings', { name: 'Wooden Barricade', deploy: 'barricade', desc: 'Full-height wooden wall.', cost: 18, time: 80 }),
  campfire: I('buildings', { name: 'Campfire', deploy: 'campfire', desc: 'Warmth (+25 C within 6 m) for 10 minutes.', cost: 6, time: 30 }),
  turret: I('buildings', { name: 'Sentry Turret', deploy: 'turret', desc: 'Automated turret. Engages hostiles within 45 m. Feeds on medium ammo.', cost: 1000, time: 1800 }),

  // gun camo (needs cloth found in the world)
  camo_gold: I('camo', { name: 'Gold Camo', skin: 0xd4af37, metal: true, cloth: 6, cost: 40, time: 120 }),
  camo_redwood: I('camo', { name: 'Redwood Camo', skin: 0x7a3b22, cloth: 3, cost: 10, time: 50 }),
  camo_forestgun: I('camo', { name: 'Forest Camo', skin: 0x445a2e, cloth: 3, cost: 8, time: 40 }),
  camo_wintergun: I('camo', { name: 'Winter Camo', skin: 0xdfe6ee, cloth: 3, cost: 8, time: 40 }),
  camo_sandgun: I('camo', { name: 'Sand Camo', skin: 0xc9ac78, cloth: 3, cost: 8, time: 40 }),
  camo_blackgold: I('camo', { name: 'Black & Gold Camo', skin: 0x141414, accent: 0xd4af37, cloth: 6, cost: 50, time: 150 }),
  camo_whitegold: I('camo', { name: 'White & Gold Camo', skin: 0xf2f2f2, accent: 0xd4af37, cloth: 6, cost: 50, time: 150 }),
  camo_white: I('camo', { name: 'White Camo', skin: 0xf0f0f0, cloth: 2, cost: 5, time: 30 }),
  camo_black: I('camo', { name: 'Black Camo', skin: 0x111111, cloth: 2, cost: 5, time: 30 }),

  // loot-only materials
  cloth: I('materials', { name: 'Cloth', desc: 'Found in the world or cut from hides. Used for gun camo.', cost: 0, time: 0, noCraft: true }),
};

// armor / helmet / backpack tiers 1-10
const ARMOR_COST = (l) => Math.round(15 * Math.pow(1.55, l - 1));
for (let l = 1; l <= 10; l++) {
  ITEMS_RAW[`vest${l}`] = I('armor', { name: `Armor Vest L${l}`, wear: 'vest', level: l, desc: `Level ${l} body armor${l === 10 ? '. Survives a .50 cal. Heavy: slows you down.' : ''}`, cost: ARMOR_COST(l), time: Math.round(60 * Math.pow(l, 1.25)) });
  ITEMS_RAW[`helmet${l}`] = I('armor', { name: `Helmet L${l}`, wear: 'helmet', level: l, desc: `Level ${l} head protection`, cost: Math.round(ARMOR_COST(l) * 0.6), time: Math.round(45 * Math.pow(l, 1.2)) });
}
export const BACKPACK_SLOTS = [4, 6, 9, 12, 15, 18, 22, 26, 30, 35, 40];
for (let l = 1; l <= 10; l++) {
  ITEMS_RAW[`pack${l}`] = I('armor', { name: `Backpack L${l}`, wear: 'pack', level: l, desc: `${BACKPACK_SLOTS[l]} slots`, cost: Math.round(8 * Math.pow(1.5, l - 1)), time: Math.round(40 * Math.pow(l, 1.15)) });
}

export const ITEMS = { ...WEAPONS, ...ITEMS_RAW };
for (const [id, it] of Object.entries(ITEMS)) it.id = id;

export const craftable = () => Object.values(ITEMS).filter((it) => !it.noCraft);

export function fmtDuration(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Filament rewards for killing operators (players / bots).
export const KILL_REWARD = { head: 10, body: 5, special: 30 }; // special = explosive kill or mid-air kill
