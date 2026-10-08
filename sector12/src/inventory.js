// Item instances and the player's carried inventory.
import { ITEMS, AMMO, ammoOptions, armorDurability, BACKPACK_SLOTS } from './data/catalog.js';

let n = 0;
export const newUid = () => Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 5);

export function isGun(def) { return def.cat === 'weapons' && !def.melee; }

// A fresh instance of a catalog item (printed or looted).
export function makeItem(id, extra = {}) {
  const d = ITEMS[id];
  if (!d) throw new Error(`unknown item ${id}`);
  const it = { uid: newUid(), id };
  if (isGun(d)) {
    it.ammo = ammoOptions(d)[0];
    it.att = { mag: null, optic: null };
    it.camo = null;
    it.mag = d.noReload ? d.mag : 0;
    if (d.tube) { it.tube = 0; it.tubeAmmo = 'shell'; it.alt = false; }
  }
  if (d.throwable) it.count = d.count;
  if (d.shots) it.shots = d.shots;
  if (id === 'co2knife') it.loaded = true;
  if (d.cat === 'ammo') it.count = d.amount;
  if (d.wear === 'vest' || d.wear === 'helmet') { it.dur = armorDurability(d.level); it.level = d.level; }
  if (d.cat === 'medical' || id === 'cloth') it.count = 1;
  return Object.assign(it, extra);
}

export function magSize(inst) {
  const d = ITEMS[inst.id];
  const m = inst.att && inst.att.mag ? ITEMS[inst.att.mag].magMul : 1;
  return Math.max(1, Math.round(d.mag * m));
}

export function describeItem(inst) {
  if (inst.id === 'filament') return `Filament ×${inst.count}`;
  const d = ITEMS[inst.id];
  let name = d.name;
  if (inst.count > 1 && d.cat !== 'ammo') name += ` ×${inst.count}`;
  if (d.wear === 'vest' || d.wear === 'helmet') name += ` (${Math.round((inst.dur / armorDurability(d.level)) * 100)}%)`;
  if (inst.camo) name += ` · ${ITEMS[inst.camo].name.replace(' Camo', '')}`;
  return name;
}

export class Inventory {
  constructor() {
    this.weapons = [null, null];
    this.melee = null;
    this.throwing = null;
    this.flare = null;
    this.vest = null;
    this.helmet = null;
    this.pack = null;
    this.clothing = null;
    this.suit = null;
    this.ammo = Object.fromEntries(Object.keys(AMMO).map((k) => [k, 0]));
    this.meds = { bandage: 0, gauze: 0, tourniquet: 0, medkit: 0, adrenaline: 0, numbing: 0, scalpel: 0, handwarmer: 0, meat: 0 };
    this.filament = 0;
    this.cloth = 0;
    this.bag = [];
  }

  get capacity() { return BACKPACK_SLOTS[this.pack ? ITEMS[this.pack.id].level : 0]; }
  get bagFull() { return this.bag.length >= this.capacity; }

  // Puts an item where it belongs. Returns false if there's no room.
  add(it) {
    if (it.id === 'filament') { this.filament += it.count || 0; return true; }
    const d = ITEMS[it.id];
    if (d.cat === 'ammo') { this.ammo[d.ammo] += it.count ?? d.amount; return true; }
    if (d.cat === 'medical') { this.meds[it.id] = (this.meds[it.id] || 0) + (it.count || 1); return true; }
    if (it.id === 'cloth') { this.cloth += it.count || 1; return true; }
    if (isGun(d)) {
      const i = this.weapons.indexOf(null);
      if (i >= 0) { this.weapons[i] = it; return true; }
    }
    if (d.melee && !d.throwable && !this.melee) { this.melee = it; return true; }
    if (d.throwable) {
      if (this.throwing) { this.throwing.count += it.count; return true; }
      this.throwing = it; return true;
    }
    if (it.id === 'flaregun' && !this.flare) { this.flare = it; return true; }
    if (d.wear && !this[d.wear === 'pack' ? 'pack' : d.wear]) { this.equip(it); return true; }
    if (this.bagFull) return false;
    this.bag.push(it);
    return true;
  }

  // wear a vest/helmet/pack/clothing/suit; the previous one goes to the bag (or is returned)
  equip(it) {
    const d = ITEMS[it.id];
    const slot = d.wear;
    const old = this[slot];
    this[slot] = it;
    const i = this.bag.indexOf(it);
    if (i >= 0) this.bag.splice(i, 1);
    if (old) { if (!this.bagFull) this.bag.push(old); else return old; }
    return null;
  }

  // Everything carried as a flat list of instances (for extraction / death drops).
  allItems() {
    const out = [];
    for (const w of this.weapons) if (w) out.push(w);
    for (const k of ['melee', 'throwing', 'flare', 'vest', 'helmet', 'pack', 'clothing', 'suit']) if (this[k]) out.push(this[k]);
    out.push(...this.bag);
    for (const [k, v] of Object.entries(this.ammo)) {
      if (v <= 0) continue;
      const pack = Object.values(ITEMS).find((d) => d.cat === 'ammo' && d.ammo === k);
      out.push({ uid: newUid(), id: pack.id, count: v });
    }
    for (const [k, v] of Object.entries(this.meds)) if (v > 0) out.push({ uid: newUid(), id: k, count: v });
    if (this.cloth > 0) out.push({ uid: newUid(), id: 'cloth', count: this.cloth });
    if (this.filament > 0) out.push({ uid: newUid(), id: 'filament', count: this.filament });
    return out;
  }

  value() { return this.allItems().length; }
}
