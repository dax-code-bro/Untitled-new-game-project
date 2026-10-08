// Persistent state: filament bank, cloth, POB locker, print queue, carried kit, stats, settings.
import { makeItem } from './inventory.js';

const KEY = 'sector12_save_v1';

export function starterKit() {
  return [
    makeItem('m1911', { mag: 7 }),
    makeItem('ammo_medium', { count: 42 }),
    makeItem('knife'),
    makeItem('bandage', { count: 3 }),
    makeItem('handwarmer', { count: 2 }),
  ];
}

export function defaultSave() {
  return {
    version: 1,
    bank: 60,          // filament deposited at the POB
    cloth: 0,          // cloth deposited (for gun camo)
    locker: [],        // printed / extracted items waiting at the POB
    queue: [],         // print jobs {id, start, end} (Date.now timestamps)
    carry: starterKit(), // what you spawn with (only kept if you leave the game inside the safe zone)
    settings: { sens: 1, volume: 0.7 },
    stats: { kills: 0, deaths: 0, extracts: 0, deposited: 0 },
  };
}

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) return s;
  } catch (e) { /* unavailable */ }
  return defaultSave();
}

export function store(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* unavailable */ }
}

export function reset() {
  const s = defaultSave();
  store(s);
  return s;
}
