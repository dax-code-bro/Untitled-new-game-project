// All tunable game content lives here: weapons, items, enemies, shop, raid timing.

export const RARITY = [
  { name: 'Common', color: '#b9c0c7' },
  { name: 'Uncommon', color: '#5fd068' },
  { name: 'Rare', color: '#4aa3ff' },
  { name: 'Epic', color: '#b468ff' },
  { name: 'Legendary', color: '#ffb02e' },
];

export const AMMO = {
  pistol: { name: '9mm', max: 240, start: 96 },
  rifle: { name: '5.56', max: 300, start: 150 },
  sniper: { name: '.300 Mag', max: 60, start: 32 },
  shell: { name: '12 Gauge', max: 56, start: 28 },
};

// dmg is per bullet/pellet. range = distance before damage falloff starts.
export const WEAPONS = {
  p9: {
    name: 'P-9 Pistol', cls: 'Pistol', ammo: 'pistol', rarity: 0,
    dmg: 26, headMul: 1.6, rpm: 420, auto: false, mag: 15, reload: 1.4,
    spread: 0.014, adsSpread: 0.004, recoil: 0.02, range: 30, fov: 62,
    price: 600, value: 200, len: 0.2, pistol: true,
  },
  kv9: {
    name: 'KV-9 SMG', cls: 'SMG', ammo: 'pistol', rarity: 1,
    dmg: 21, headMul: 1.4, rpm: 880, auto: true, mag: 32, reload: 1.9,
    spread: 0.028, adsSpread: 0.008, recoil: 0.011, range: 28, fov: 60,
    price: 2500, value: 900, len: 0.42,
  },
  m4r: {
    name: 'M4-R Rifle', cls: 'Assault Rifle', ammo: 'rifle', rarity: 1,
    dmg: 28, headMul: 1.5, rpm: 720, auto: true, mag: 30, reload: 2.2,
    spread: 0.034, adsSpread: 0.0035, recoil: 0.014, range: 70, fov: 55,
    price: 4500, value: 1500, len: 0.62,
  },
  kr74: {
    name: 'KR-74 Rifle', cls: 'Assault Rifle', ammo: 'rifle', rarity: 2,
    dmg: 34, headMul: 1.5, rpm: 600, auto: true, mag: 30, reload: 2.4,
    spread: 0.038, adsSpread: 0.0045, recoil: 0.021, range: 65, fov: 55,
    price: 5500, value: 1800, len: 0.66, wood: true,
  },
  b12: {
    name: 'Breacher-12', cls: 'Shotgun', ammo: 'shell', rarity: 2,
    dmg: 17, pellets: 8, headMul: 1.25, rpm: 75, auto: false, mag: 6, reload: 3.0,
    spread: 0.075, adsSpread: 0.055, recoil: 0.06, range: 12, fov: 62,
    price: 3500, value: 1100, len: 0.62, shotgun: true,
  },
  hr7: {
    name: 'HR-7 Marksman', cls: 'Marksman Rifle', ammo: 'sniper', rarity: 3,
    dmg: 85, headMul: 2.2, rpm: 110, auto: false, mag: 8, reload: 2.7,
    spread: 0.05, adsSpread: 0.0004, recoil: 0.065, range: 200, fov: 20,
    price: 7500, value: 2600, len: 0.85, scope: true,
  },
};

export const ITEMS = {
  cigs: { name: 'Cigarette Carton', value: 120, rarity: 0 },
  meds: { name: 'Medical Supplies', value: 260, rarity: 0 },
  battery: { name: 'Car Battery', value: 300, rarity: 0 },
  radio: { name: 'Field Radio', value: 420, rarity: 1 },
  hdd: { name: 'Hard Drive', value: 480, rarity: 1 },
  coin: { name: 'Rare Coin', value: 650, rarity: 1 },
  watch: { name: 'Gold Watch', value: 900, rarity: 2 },
  gpu: { name: 'Graphics Card', value: 1200, rarity: 2 },
  drone: { name: 'Drone Parts', value: 1100, rarity: 2 },
  jewel: { name: 'Jewelry Box', value: 1700, rarity: 3 },
  laptop: { name: 'Encrypted Laptop', value: 2300, rarity: 3 },
  gold: { name: 'Gold Bar', value: 3800, rarity: 4 },
  intel: { name: 'Intel Drive', value: 0, rarity: 4, quest: true },
};

// table weights: ammo, plate, cash, revive, weapon, item0..item4 (item rarity tier)
export const CONTAINERS = {
  crate: { name: 'Supply Crate', size: [1.0, 0.7, 0.7], color: 0x56663a, rolls: [2, 4], collide: true,
    table: { ammo: 5, plate: 3, item0: 2, cash: 1, revive: 0.2 } },
  duffel: { name: 'Duffel Bag', size: [0.9, 0.38, 0.45], color: 0x2c3846, rolls: [1, 3], collide: false,
    table: { cash: 4, item0: 3, item1: 2, ammo: 1 } },
  toolbox: { name: 'Toolbox', size: [0.7, 0.35, 0.35], color: 0xa8382c, rolls: [1, 3], collide: false,
    table: { item0: 4, item1: 2.5, item2: 0.8, cash: 1 } },
  weapon: { name: 'Weapon Case', size: [1.3, 0.3, 0.5], color: 0x1c1e21, rolls: [1, 2], collide: true,
    table: { weapon: 4, ammo: 2, plate: 1 } },
  safe: { name: 'Safe', size: [0.8, 1.0, 0.8], color: 0x3a3e44, rolls: [2, 4], collide: true,
    table: { cash: 3, item2: 2, item3: 1.2, item4: 0.3 } },
  intel: { name: 'Intel Case', size: [0.9, 0.35, 0.6], color: 0xc9a227, rolls: [0, 0], collide: true, table: {} },
  drop: { name: 'Dropped Items', size: [0.8, 0.35, 0.45], color: 0x6b4f2a, rolls: [0, 0], collide: false, table: {} },
};

export const ENEMIES = {
  grunt: { name: 'Militia', hp: 100, armor: 0, acc: 0.36, dmg: 8, range: 55, speed: 3.4, rpm: 560,
    burst: [2, 5], react: [0.55, 1.0], color: 0x7a6a4f, xp: 100, weapons: ['m4r', 'kv9', 'kr74'], pref: 22 },
  heavy: { name: 'Armored Guard', hp: 100, armor: 100, acc: 0.4, dmg: 10, range: 50, speed: 3.0, rpm: 620,
    burst: [3, 6], react: [0.5, 0.9], color: 0x46533d, xp: 175, weapons: ['m4r', 'kr74', 'b12'], pref: 16 },
  elite: { name: 'Elite Operator', hp: 120, armor: 150, acc: 0.48, dmg: 12, range: 75, speed: 3.6, rpm: 700,
    burst: [3, 6], react: [0.4, 0.75], color: 0x25292e, xp: 300, weapons: ['m4r', 'kr74', 'hr7'], pref: 26 },
  boss: { name: 'The Warden', hp: 450, armor: 300, acc: 0.55, dmg: 15, range: 80, speed: 2.8, rpm: 650,
    burst: [4, 8], react: [0.35, 0.6], color: 0x1a1a1a, xp: 1200, weapons: ['kr74'], pref: 18, boss: true },
};

export const BACKPACKS = [
  { name: 'Small Backpack', slots: 6, price: 0 },
  { name: 'Medium Backpack', slots: 10, price: 6000 },
  { name: 'Large Backpack', slots: 14, price: 15000 },
];

export const PRICES = { plate: 300, revive: 1500 };

export const RAID = {
  duration: 20 * 60,     // hard end of the raid
  radStart: 8 * 60,      // radiation circle starts closing
  radEnd: 19 * 60,       // circle fully closed
  radDps: 7,
  exfilCall: 30,         // seconds between calling exfil and heli landing
  heliWait: 25,          // seconds heli waits on the ground
  board: 2.5,            // seconds to board
  maxSparePlates: 5,
};

export const MAX_PLATES = 3; // equipped
