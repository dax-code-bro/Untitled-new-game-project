// Loot tables for containers and enemy bodies.
import { CONTAINERS, ITEMS, WEAPONS, AMMO } from './data.js';
import { rand, randi, pick, weighted } from './rng.js';
import { newUid } from './save.js';

const ITEM_IDS = Object.keys(ITEMS).filter((k) => !ITEMS[k].quest);

export function itemOfTier(tier) {
  for (let t = Math.min(4, tier); t >= 0; t--) {
    const ids = ITEM_IDS.filter((k) => ITEMS[k].rarity === t);
    if (ids.length) return pick(ids);
  }
  return 'cigs';
}

function ammoDrop(type) {
  type = type || weighted({ rifle: 0.35, pistol: 0.3, shell: 0.15, sniper: 0.2 });
  const amt = type === 'sniper' || type === 'shell' ? randi(8, 16) : randi(20, 45);
  return { kind: 'ammo', type, amount: amt };
}

export function weaponDrop(threat, id) {
  if (!id) {
    const w = { p9: 2, kv9: 3, b12: 2, m4r: 2.5, kr74: 1.5 + threat * 0.5, hr7: 0.5 + threat * 0.6 };
    id = weighted(w);
  }
  return { kind: 'weapon', id, uid: newUid(), mag: WEAPONS[id].mag };
}

function roll(key, threat) {
  if (key === 'ammo') return ammoDrop();
  if (key === 'plate') return { kind: 'plate' };
  if (key === 'revive') return { kind: 'revive' };
  if (key === 'cash') return { kind: 'cash', amount: Math.round(rand(80, 420) * (1 + threat * 0.6) / 10) * 10 };
  if (key === 'weapon') return weaponDrop(threat);
  if (key.startsWith('item')) {
    let tier = +key.slice(4);
    if (Math.random() < 0.12 * threat) tier++;
    return { kind: 'item', id: itemOfTier(tier) };
  }
  return null;
}

export function rollContainer(kind, threat) {
  const def = CONTAINERS[kind];
  const out = [];
  if (!def.rolls[1]) return out;
  const n = randi(def.rolls[0], def.rolls[1]) + (threat >= 2 && Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const it = roll(weighted(def.table), threat);
    if (it) out.push(it);
  }
  return merge(out);
}

export function rollEnemy(e) {
  const def = e.def;
  const out = [];
  out.push(ammoDrop(WEAPONS[e.weaponId].ammo));
  if (Math.random() < 0.5) out.push(ammoDrop());
  out.push({ kind: 'cash', amount: Math.round(rand(40, 260) * (def.boss ? 8 : def.armor ? 1.6 : 1) / 10) * 10 });
  const plateChance = def.boss ? 1 : def.armor >= 150 ? 0.75 : def.armor ? 0.6 : 0.3;
  if (Math.random() < plateChance) out.push({ kind: 'plate' });
  if (def.boss && Math.random() < 1) out.push({ kind: 'plate' });
  const wChance = def.boss ? 1 : def.armor >= 150 ? 0.35 : 0.12;
  if (Math.random() < wChance) out.push(weaponDrop(2, e.weaponId));
  if (def.boss) { out.push({ kind: 'item', id: 'gold' }); out.push({ kind: 'item', id: itemOfTier(3) }); out.push({ kind: 'revive' }); }
  else if (Math.random() < (def.armor >= 150 ? 0.5 : 0.25)) out.push({ kind: 'item', id: itemOfTier(def.armor >= 150 ? 2 : randi(0, 1)) });
  if (e.hvt) out.push({ kind: 'item', id: 'laptop' });
  return merge(out);
}

// Merge duplicate cash/ammo stacks for a tidier loot list.
function merge(list) {
  const out = [];
  for (const it of list) {
    if (it.kind === 'cash') { const c = out.find((o) => o.kind === 'cash'); if (c) { c.amount += it.amount; continue; } }
    if (it.kind === 'ammo') { const c = out.find((o) => o.kind === 'ammo' && o.type === it.type); if (c) { c.amount = Math.min(c.amount + it.amount, AMMO[it.type].max); continue; } }
    out.push(it);
  }
  return out;
}

export function describe(it) {
  switch (it.kind) {
    case 'cash': return { name: `Cash  $${it.amount.toLocaleString('en-US')}`, rarity: 1, value: it.amount };
    case 'ammo': return { name: `${AMMO[it.type].name} Ammo ×${it.amount}`, rarity: 0, value: 0 };
    case 'plate': return { name: 'Armor Plate', rarity: 2, value: 300 };
    case 'revive': return { name: 'Self-Revive Kit', rarity: 3, value: 1500 };
    case 'weapon': return { name: WEAPONS[it.id].name, rarity: WEAPONS[it.id].rarity, value: WEAPONS[it.id].value, sub: WEAPONS[it.id].cls };
    case 'item': return { name: ITEMS[it.id].name, rarity: ITEMS[it.id].rarity, value: ITEMS[it.id].value, quest: ITEMS[it.id].quest };
  }
  return { name: '?', rarity: 0, value: 0 };
}
