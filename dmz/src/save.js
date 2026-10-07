// Persistent progression (stash, cash, loadout, insurance) in localStorage.
import { WEAPONS, MAX_PLATES } from './data.js';

const KEY = 'exfil_save_v1';
let counter = 0;
export const newUid = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

export function defaultSave() {
  const m4 = { uid: newUid(), id: 'm4r' };
  return {
    version: 1,
    cash: 2500,
    xp: 0,
    backpackTier: 0,
    stash: { items: [], weapons: [m4], plates: 6, revives: 1 },
    loadout: { primary: m4.uid, secondary: null },
    insured: m4.uid,
    settings: { sens: 1.0, volume: 0.7 },
    stats: { raids: 0, extracts: 0, kills: 0, deaths: 0, bestHaul: 0 },
  };
}

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) return s;
  } catch (e) { /* storage unavailable */ }
  return defaultSave();
}

export function store(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
}

export const level = (xp) => 1 + Math.floor(xp / 2500);

// Removes the chosen loadout from the stash. Called when deploying, so quitting mid-raid loses the kit.
export function prepareKit(save) {
  const W = save.stash.weapons;
  const take = (uid) => {
    const i = W.findIndex((w) => w.uid === uid);
    return i >= 0 ? W.splice(i, 1)[0] : null;
  };
  const primary = save.loadout.primary ? take(save.loadout.primary) : null;
  const secondary = save.loadout.secondary ? take(save.loadout.secondary) : null;
  const plates = Math.min(save.stash.plates, MAX_PLATES * 2);
  save.stash.plates -= plates;
  const revives = Math.min(save.stash.revives, 1);
  save.stash.revives -= revives;
  return {
    primary,
    secondary: secondary || { id: 'p9', uid: null },
    platesEquipped: Math.min(MAX_PLATES, plates),
    platesSpare: Math.max(0, plates - MAX_PLATES),
    revives,
    backpackTier: save.backpackTier,
    insured: save.insured,
  };
}

// Merges a finished raid back into the save. Mutates `res` with display info.
export function applyResult(save, kit, res) {
  save.stats.raids++;
  save.stats.kills += res.kills;
  save.xp += res.xp;
  if (res.success) {
    save.stats.extracts++;
    save.cash += res.cash + res.bonus;
    for (const w of res.weapons) if (w.uid) save.stash.weapons.push({ uid: w.uid, id: w.id });
    for (const it of res.items) save.stash.items.push({ uid: newUid(), id: it.id });
    save.stash.plates += res.plates;
    save.stash.revives += res.revives;
    save.stats.bestHaul = Math.max(save.stats.bestHaul, res.haulValue);
  } else {
    save.stats.deaths++;
    const ins = [kit.primary, kit.secondary].find((w) => w && w.uid && w.uid === kit.insured);
    if (ins) {
      save.stash.weapons.push(ins);
      res.insuredReturned = WEAPONS[ins.id].name;
    }
  }
  const has = (uid) => save.stash.weapons.some((w) => w.uid === uid);
  if (save.loadout.primary && !has(save.loadout.primary)) save.loadout.primary = null;
  if (save.loadout.secondary && !has(save.loadout.secondary)) save.loadout.secondary = null;
  if (save.insured && !has(save.insured)) save.insured = null;
  store(save);
}
