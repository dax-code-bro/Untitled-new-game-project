// Career profile: everything the player owns and has done, saved on the device.
// One versioned JSON blob in localStorage, autosaved every minute and after
// purchases, job pay-outs and missions.
const KEY = 'southbound.save.v1';

export function newProfile() {
  return {
    v: 1, created: Date.now(), saved: 0, playSeconds: 0,
    money: 150, bank: 0, // you arrive with next to nothing hour: 9.5, day: 1, weather: 'cloudy', pos: null,
    weapons: { owned: null, ammo: null, mods: null },
    garage: [],        // { uid, cat: 'car'|'boat'|'air', type, paint: [r,g,b,metal], up: { upgradeId: tier } }
    properties: [],    // property ids
    home: null,        // property id used as spawn point
    tools: {},         // toolId -> count
    pelts: {},         // animal -> count (sold at the butcher)
    fish: {},          // species -> count
    jobs: {},          // jobId -> { level, xp, runs, best }
    missions: { done: [], active: null },
    stats: { kills: 0, distance: 0, wantedMax: 0, jobsDone: 0, animals: 0, fishCaught: 0, earned: 0 },
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.v !== 1) return null;
    return { ...newProfile(), ...p, stats: { ...newProfile().stats, ...(p.stats || {}) } };
  } catch (e) { return null; }
}

export function saveProfile(p) {
  try { p.saved = Date.now(); localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
}

export function deleteProfile() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

// Wallet + autosave wrapper around the profile.
export class Career {
  constructor(profile, hooks) {
    this.p = profile;
    this.hooks = hooks; // { getMoney(), setMoney(n), toast(msg), snapshot(p) }
    this.timer = 60;
  }
  get money() { return this.hooks.getMoney(); }
  earn(n, why) {
    if (n <= 0) return;
    this.hooks.setMoney(this.money + n);
    this.p.stats.earned += n;
    this.hooks.toast(`+$${n.toLocaleString('en-US')}${why ? ' · ' + why : ''}`, 2);
  }
  spend(n) {
    if (this.money < n) { this.hooks.toast(`You need $${n.toLocaleString('en-US')}`, 1.6); return false; }
    this.hooks.setMoney(this.money - n);
    this.saveSoon();
    return true;
  }
  addTool(id, n = 1) { this.p.tools[id] = (this.p.tools[id] || 0) + n; }
  hasTool(id) { return (this.p.tools[id] || 0) > 0; }
  hasAny(ids) { return ids.some((id) => this.hasTool(id)); }
  useTool(id) { if (!this.hasTool(id)) return false; this.p.tools[id]--; return true; }
  saveSoon() { this.timer = Math.min(this.timer, 1.5); }
  save() { this.hooks.snapshot(this.p); return saveProfile(this.p); }
  update(dt) {
    this.p.playSeconds += dt;
    if ((this.timer -= dt) <= 0) { this.timer = 60; this.save(); }
  }
}
