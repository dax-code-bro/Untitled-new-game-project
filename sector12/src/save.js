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
    locker: [],        // stored items (extracted gear, prints you had no room for)
    tray: [],          // finished prints sitting on the print bed, waiting to be picked up
    queue: [],         // print jobs {id, start, end} (Date.now timestamps)
    carry: starterKit(), // what you spawn with (only kept if you leave the game inside the safe zone)
    settings: { sens: 1, volume: 0.7 },
    stats: { kills: 0, deaths: 0, extracts: 0, deposited: 0 },
  };
}

// ---------------------------------------------------------------- save files
// Several independent games ("save files"), each with its own bank, locker, prints and kit.
// Settings (sensitivity, volume, graphics) are shared by all of them.
const INDEX = 'sector12_slots';
const SETTINGS = 'sector12_settings';
const slotKey = (id) => `sector12_save_${id}`;
export const MAX_SLOTS = 8;

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* unavailable */ } };
const drop = (k) => { try { localStorage.removeItem(k); } catch (e) { /* unavailable */ } };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// in-memory fallback when storage is blocked, so switching still works for this visit
let memIndex = null;
const memSaves = {};

function index() {
  let ix = read(INDEX) || memIndex;
  if (!ix || !Array.isArray(ix.slots) || !ix.slots.length) {
    // first run, or upgrading from the single save: that one becomes "Save 1"
    const legacy = read(KEY);
    const id = newId();
    ix = { active: id, slots: [{ id, name: 'Save 1', created: Date.now(), played: Date.now() }] };
    const first = legacy && legacy.version === 1 ? legacy : defaultSave();
    first.slot = id;
    write(slotKey(id), first);
    memSaves[id] = first;
    if (legacy && legacy.settings) write(SETTINGS, legacy.settings);
    drop(KEY);
  }
  memIndex = ix;
  write(INDEX, ix);
  return ix;
}

function sharedSettings() {
  return read(SETTINGS) || { sens: 1, volume: 0.7 };
}

// a summary of every save file, newest-played first, for the title screen
export function listSlots() {
  const ix = index();
  return ix.slots.map((m) => {
    const s = read(slotKey(m.id)) || memSaves[m.id] || {};
    return { ...m, active: m.id === ix.active, bank: s.bank ?? 0, locker: (s.locker || []).length, queue: (s.queue || []).length, extracts: (s.stats && s.stats.extracts) || 0, kills: (s.stats && s.stats.kills) || 0 };
  }).sort((a, b) => b.played - a.played);
}

export function activeName() {
  const ix = index();
  const m = ix.slots.find((x) => x.id === ix.active);
  return m ? m.name : 'Save 1';
}

// load a save file (the active one by default) and make it active
export function load(id = null) {
  const ix = index();
  id = id && ix.slots.some((x) => x.id === id) ? id : ix.active;
  let s = read(slotKey(id)) || memSaves[id];
  if (!s || s.version !== 1) s = defaultSave();
  s.slot = id;
  s.tray = s.tray || [];
  s.settings = { ...sharedSettings(), ...(s.settings || {}), ...sharedSettings() };
  ix.active = id;
  const m = ix.slots.find((x) => x.id === id);
  if (m) m.played = Date.now();
  write(INDEX, ix);
  return s;
}

export function store(s) {
  const ix = index();
  const id = s.slot || ix.active;
  s.slot = id;
  memSaves[id] = s;
  write(slotKey(id), s);
  write(SETTINGS, s.settings);
}

// start a brand-new game in a new save file; returns its save
export function createSlot(name) {
  const ix = index();
  if (ix.slots.length >= MAX_SLOTS) return null;
  const id = newId();
  const clean = String(name || '').trim().slice(0, 24) || `Save ${ix.slots.length + 1}`;
  ix.slots.push({ id, name: clean, created: Date.now(), played: Date.now() });
  const s = defaultSave();
  s.slot = id;
  write(slotKey(id), s);
  memSaves[id] = s;
  write(INDEX, ix);
  return load(id);
}

export function renameSlot(id, name) {
  const ix = index();
  const m = ix.slots.find((x) => x.id === id);
  const clean = String(name || '').trim().slice(0, 24);
  if (m && clean) { m.name = clean; write(INDEX, ix); }
}

// delete a save file; if it was the active one, another becomes active (or a fresh one is made)
export function deleteSlot(id) {
  const ix = index();
  ix.slots = ix.slots.filter((x) => x.id !== id);
  drop(slotKey(id));
  delete memSaves[id];
  if (!ix.slots.length) { write(INDEX, ix); memIndex = null; drop(INDEX); return load(); }
  if (ix.active === id) ix.active = [...ix.slots].sort((a, b) => b.played - a.played)[0].id;
  write(INDEX, ix);
  return load(ix.active);
}

// wipe the active save file back to a fresh start (keeps its name)
export function reset(id = null) {
  const ix = index();
  id = id || ix.active;
  const s = defaultSave();
  s.slot = id;
  store(s);
  return load(id);
}
