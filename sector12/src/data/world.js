// World rules: time, filament caches, animals, weather, AI operators, world loot.

export const TIME = {
  dayLength: 30 * 60, // one in-game day = 30 real minutes
  startHour: 8,
};

// ------------------------------------------------------------------ filament caches
// A cargo helicopter crosses the island on a timer; each pass has a 30% chance to drop a cache.
export const CACHE = {
  heliInterval: 4 * 60, // seconds between passes
  dropChance: 0.3,
  sizes: {
    small: { name: 'Small Filament Cache', min: 30, max: 30, chance: 0.3, color: 0x5fd068 },
    medium: { name: 'Medium Filament Cache', min: 50, max: 70, chance: 0.45, color: 0x4aa3ff },
    large: { name: 'Large Filament Cache', min: 70, max: 200, chance: 0.25, color: 0xb468ff },
  },
  // where drops land. Harder regions get better odds of large caches.
  regions: {
    n: { weight: 0.3, sizeMul: { small: 0.5, medium: 1, large: 2.2 } },
    w: { weight: 0.22, sizeMul: { small: 1, medium: 1.1, large: 1 } },
    e: { weight: 0.24, sizeMul: { small: 1, medium: 1.1, large: 1 } },
    s: { weight: 0.24, sizeMul: { small: 1.6, medium: 1, large: 0.6 } },
  },
  abominable: { name: 'Abominable Cache', amount: 10000, chance: 0.05, color: 0xffb02e }, // per pass, at the extraction summit
};

// ------------------------------------------------------------------ animals
// Spawn chance per spawn roll, by region. The leftover chance spawns nothing:
// low on purpose, this is not meant to become a hunting game.
export const ANIMAL_SPAWN = {
  w: { sandwolf: 30, rabbit: 20, coyote: 5 },
  s: { rabbit: 20, deer: 15, wolf: 10, squirrel: 5, raccoon: 5, coyote: 5, bear: 1, moose: 1 },
  e: { rabbit: 20, squirrel: 5, raccoon: 5, coyote: 5 },
  n: { rabbit: 20, wolf: 10, bear: 1, moose: 1 },
  hub: { rabbit: 20, coyote: 5, squirrel: 5 },
  beach: { rabbit: 20 },
};

// Each region has its own rabbit variant.
export const RABBIT_VARIANTS = {
  w: { name: 'Desert Jackrabbit', color: 0xc8a878 },
  s: { name: 'Cottontail', color: 0x7a6248 },
  e: { name: 'Jungle Hare', color: 0x4a3a2a },
  n: { name: 'Snowshoe Hare', color: 0xf2f2f2 },
  hub: { name: 'Field Rabbit', color: 0x8a7458 },
  beach: { name: 'Dune Rabbit', color: 0xb8ab90 },
};

// size: body length (m). behavior: flee | wander | hunt | defend
export const ANIMALS = {
  rabbit: { name: 'Rabbit', hp: 18, speed: 7.5, size: 0.45, behavior: 'flee', color: 0x7a6248, meat: 1, hide: 0 },
  squirrel: { name: 'Squirrel', hp: 10, speed: 6, size: 0.3, behavior: 'flee', color: 0x8a5a32, meat: 0, hide: 0 },
  raccoon: { name: 'Raccoon', hp: 30, speed: 4.5, size: 0.6, behavior: 'flee', color: 0x5f5a55, meat: 1, hide: 1 },
  deer: { name: 'Deer', hp: 110, speed: 11, size: 1.6, behavior: 'flee', color: 0x9a6a3a, meat: 3, hide: 2, antlers: true },
  coyote: { name: 'Coyote', hp: 60, speed: 9, size: 1.0, behavior: 'hunt', aggro: 18, dmg: 9, color: 0x9a8262, meat: 1, hide: 1 },
  wolf: { name: 'Wolf', hp: 90, speed: 10, size: 1.3, behavior: 'hunt', aggro: 45, dmg: 14, color: 0x5d5f63, pack: [2, 4], meat: 2, hide: 2 },
  sandwolf: { name: 'Sand Wolf', hp: 80, speed: 10.5, size: 1.25, behavior: 'hunt', aggro: 55, dmg: 13, color: 0xc2a06a, pack: [2, 3], meat: 2, hide: 2 },
  bear: { name: 'Bear', hp: 420, speed: 9, size: 2.2, behavior: 'defend', aggro: 22, dmg: 38, color: 0x3f2c1e, meat: 6, hide: 4 },
  moose: { name: 'Moose', hp: 380, speed: 8.5, size: 2.6, behavior: 'defend', aggro: 10, dmg: 30, color: 0x4a3622, meat: 6, hide: 4, antlers: true, bigAntlers: true },
};

// ------------------------------------------------------------------ weather
// Each region rolls its own events. duration in seconds.
export const WEATHER = {
  rain: { name: 'Rain', regions: ['s', 'e', 'hub'], chance: 0.35, duration: [180, 420], fog: 0.45, temp: -4 },
  sandstorm: { name: 'Sandstorm', regions: ['w'], chance: 0.3, duration: [120, 300], fog: 0.02, temp: 5 },
  blizzard: { name: 'Blizzard', regions: ['n'], chance: 0.4, duration: [180, 420], fog: 0.016, temp: -16 },
  tornado: { name: 'Tornado', regions: ['w', 'hub', 's'], chance: 0.08, duration: [90, 180], fog: 0.7, temp: -2 },
};
export const WEATHER_ROLL = 150; // seconds between weather rolls

// ------------------------------------------------------------------ AI operators
// Other "players" on the island. Region decides how well-equipped they are.
export const OPERATOR_TIERS = {
  hub: { vest: [0, 2], helmet: [0, 1], weapons: ['zip22', 'm1911', 'gg60', 'sixshooter', 'trench'], acc: 0.32, filament: [0, 12] },
  s: { vest: [1, 3], helmet: [0, 2], weapons: ['m1911', 'trench', 'xm9', 'sixshooter', 'slugthrower', 'gg60'], acc: 0.36, filament: [2, 18] },
  e: { vest: [2, 5], helmet: [1, 3], weapons: ['xm9', 'ka43', 'semishot', 'victors', 'd744'], acc: 0.4, filament: [5, 25] },
  w: { vest: [2, 5], helmet: [1, 3], weapons: ['ka43', 'xm9', 'slugthrower', 'd744', 'semishot'], acc: 0.42, filament: [5, 25] },
  n: { vest: [6, 9], helmet: [4, 8], weapons: ['ka43', 'patriot09', 'bg850', 'guillotine', 'xm9'], acc: 0.5, filament: [20, 60] },
  beach: { vest: [0, 2], helmet: [0, 1], weapons: ['zip22', 'm1911', 'gg60', 'trench'], acc: 0.3, filament: [0, 10] },
};

export const OPERATOR_NAMES = [
  'Vandal', 'xX_Reaper_Xx', 'Kestrel', 'GhostFace', 'Mav', 'Juniper', 'NoScope420', 'Hollowpoint', 'Sable', 'Dusty',
  'Viper', 'ColdBrew', 'Rook', 'Nomad', 'Bishop', 'Wraith', 'TacoSniper', 'Frostbyte', 'Hex', 'Lumen',
  'Quill', 'Ranger_Rick', 'Static', 'Talon', 'Moth', 'Sundown', 'Crux', 'Vesper', 'BigIron', 'Pyre',
];

// ------------------------------------------------------------------ world loot (supply crates at POIs)
// kind: [item id, chance, min, max]
export const LOOT_TABLES = {
  common: [['ammo_light', 0.35, 1, 2], ['ammo_medium', 0.3, 1, 1], ['ammo_shell', 0.2, 1, 1], ['bandage', 0.45, 1, 2],
    ['cloth', 0.4, 1, 3], ['handwarmer', 0.15, 1, 2], ['filament', 0.35, 2, 8], ['knife', 0.06, 1, 1], ['gauze', 0.15, 1, 1]],
  military: [['ammo_medium', 0.45, 1, 2], ['ammo_heavy', 0.35, 1, 2], ['ammo_ap_medium', 0.12, 1, 1], ['ext1', 0.12, 1, 1], ['reddot', 0.12, 1, 1],
    ['vest2', 0.08, 1, 1], ['helmet2', 0.08, 1, 1], ['tourniquet', 0.2, 1, 1], ['medkit', 0.08, 1, 1], ['filament', 0.4, 5, 15],
    ['xm9', 0.05, 1, 1], ['m1911', 0.08, 1, 1], ['cloth', 0.25, 1, 2]],
  arctic: [['ammo_heavy', 0.45, 1, 2], ['ammo_ap_heavy', 0.2, 1, 1], ['scope4', 0.12, 1, 1], ['vest5', 0.1, 1, 1], ['helmet4', 0.1, 1, 1],
    ['medkit', 0.2, 1, 1], ['adrenaline', 0.15, 1, 1], ['handwarmer', 0.5, 1, 3], ['winter_gear', 0.06, 1, 1], ['filament', 0.6, 15, 45],
    ['ka43', 0.06, 1, 1], ['cloth', 0.3, 1, 3], ['ext2', 0.1, 1, 1]],
};
