// Public entry point of the human library (scenes/lib/humans).
//
// Characters are built OFFLINE from the CC0 MakeHuman base mesh, targets, proxies and skins by
// scenes/lib/humans/offline/build.py (Blender's Python module: cloth simulation, AO bakes) into
// scenes/lib/humans/cache/<id>.json + <id>.bin (git-ignored; rebuild with the command in
// README.md). Each character is stored posed in its drape pose; at render time only small,
// deterministic idle deltas are added (idle.js).
//
//   import { loadCharacter, applyIdle, placeCharacter, CAST } from '../lib/humans/index.js';
//   const abby = await loadCharacter('abby');               // in setup()
//   placeCharacter(abby, x, groundY, z, yaw);  scene.add(abby.root);
//   applyIdle(abby, t);                                       // in update(t)
//
// Riders (a drop-in for scenes/lib/creatures/rider.js - same calls, real people):
//   import { loadHuman, createRider } from '../lib/humans/index.js';
//   import { createSaddle, mountRider } from '../lib/creatures/index.js';
//   const human = await loadHuman();                          // preloads the riders
//   mountRider(charcoal, createSaddle(charcoal, {}), createRider(human, { outfit: 'remi' }));
//   rider.update(t)                                           // idle breathing / blinks (optional)
import * as THREE from 'three';
import { loadCharacterData, buildCharacter, hashStr } from './loader.js';
import { applyIdle } from './idle.js';

export { loadCharacterData, buildCharacter, CACHE_URL } from './loader.js';
export { applyIdle, blinkAt } from './idle.js';

/** Every built character id, with what it is for (PROVISIONAL looks; see offline/characters.py). */
export const CAST = {
  abby: 'Abby, standing (riding clothes, muted green outer layer)',
  abby_injured: 'Abby, LEFT forearm held in against the body',
  abby_sling: 'Abby, LEFT arm in a linen sling',
  abby_ride: 'Abby seated astride (for Leaf\'s saddle)',
  abby_ride_injured: 'Abby seated, hunched, LEFT arm held in',
  remi: 'Remi, standing (dark riding clothes, muted blue outer layer)',
  remi_ride: 'Remi seated astride (for Charcoal\'s riding rig)',
  alexandria: 'Queen Alexandria (restrained formal gown)',
  fall: 'Queen Fall, standing (fitted command riding clothes)',
  fall_ride: 'Queen Fall seated astride (for Starlight\'s rig)',
  king: 'King of Cling (warm festival clothes, open-handed gesture)',
  attendant: 'Attendant (household clothes, folded cloth)',
  healer: 'Healer (work clothes, apron, coif and veil, bowl)',
  messenger: 'Royal messenger (light running clothes, scroll)',
  keeper1: 'Ground keeper, signalling', keeper2: 'Ground keeper with a rope coil',
  vendor: 'Vendor with an empty crate', parent: 'Parent with a parcel, hand lowered for the child', child: 'Child holding the parent\'s hand',
  musician: 'Musician with a lute', musician2: 'Musician with a recorder',
  guard_captain: 'Guard captain, hand on the sword hilt', guard1: 'Guard with spear', guard2: 'Guard with spear (2)', guard3: 'Guard with spear (3)',
  watchman: 'Watchman pointing up', villager_hurt: 'Injured villager (3C)',
  scout_ride: 'Scout rider (hooded, seated)', sailor1: 'Sailor hauling a rope', sailor2: 'Harbor crew carrying a crate',
};
/** The festival crowd kit (Cling): 18 distinct villagers, varied body, age, clothing and action. */
export const CROWD = Array.from({ length: 18 }, (_, i) => `crowd${String(i + 1).padStart(2, '0')}`);
for (const id of CROWD) CAST[id] = 'Festival villager';

/** Load and build one character (cached data; every call returns a new independent instance). */
export async function loadCharacter(id, opts = {}) {
  const ch = buildCharacter(await loadCharacterData(id), opts);
  ch.update = (t, o = {}) => applyIdle(ch, t, { ...(opts.idle || {}), ...o });
  return ch;
}

/** Load several characters in parallel: { id: character }. */
export async function loadCharacters(ids, opts = {}) {
  const list = await Promise.all(ids.map((id) => loadCharacter(id, opts)));
  return Object.fromEntries(ids.map((id, i) => [id, list[i]]));
}

/** Stand a character on the ground: feet at groundY, facing yaw (0 = +z). */
export function placeCharacter(ch, x, groundY, z, yaw = 0, scale = 1) {
  ch.root.position.set(x, groundY, z);
  ch.root.rotation.set(0, yaw, 0);
  ch.root.scale.setScalar(scale);
  ch.root.updateMatrixWorld(true);
  return ch;
}

/** Put the child's right hand into the parent's left hand (both already placed): moves the child. */
export function joinHands(parent, child) {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  parent.bone('wrist.L').getWorldPosition(a);
  child.bone('wrist.R').getWorldPosition(b);
  child.root.position.x += a.x - b.x;
  child.root.position.z += a.z - b.z;
  child.root.updateMatrixWorld(true);
  return child;
}

/** Runtime dust / dirt (3C after the attack): 0..1 on every garment and the skin. */
export function setDust(ch, amount) {
  for (const m of ch.meshes) {
    const u = m.material.userData;
    if (u.cloth) u.cloth.uDust.value = (u.cloth.dust0 ?? (u.cloth.dust0 = u.cloth.uDust.value)) + amount * 0.9;
    if (u.skin) u.skin.uDirt.value = amount * 0.5;
  }
}

// ------------------------------------------------------- rider adapter ----
const RIDERS = { remi: 'remi_ride', abby: 'abby_ride', fall: 'fall_ride', scout: 'scout_ride', abby_injured: 'abby_ride_injured' };
const STANDING = { remi: 'remi', abby: 'abby', fall: 'fall', scout: 'scout_ride' };

/**
 * Drop-in for creatures/rider.js loadHuman(): preloads the rider builds (opts.ids to choose).
 * The result is only a token for createRider()/person(); it carries the loaded data.
 */
export async function loadHuman(opts = {}) {
  const ids = opts.ids || [...new Set([...Object.values(RIDERS), ...Object.values(STANDING)])];
  const data = {};
  await Promise.all(ids.map(async (id) => { try { data[id] = await loadCharacterData(id); } catch (e) { data[id] = e; } }));
  return { kind: 'dk-humans', data };
}

/**
 * Drop-in for creatures/rider.js createRider(human, opts): opts.outfit 'remi'|'abby'|'fall'|'scout'
 * (or an object with .name), opts.pose 'ride' (default) | 'stand', opts.lean / opts.reach adjust
 * the trunk and the arms a little (radians / 0..1). Returns the same shape as the placeholder
 * ({ root, skeleton, bones, index, parts, restHead, outfit, setPose }) plus update(t) for idle
 * motion, so mountRider() seats it exactly where the placeholder sat (pelvis 0.1 m above the seat).
 */
export function createRider(human, opts = {}) {
  const name = typeof opts.outfit === 'object' && opts.outfit ? (opts.outfit.name || 'remi') : (opts.outfit || 'remi');
  const id = opts.id || (opts.pose === 'stand' ? STANDING[name] : RIDERS[name]) || 'remi_ride';
  const d = human?.data?.[id];
  if (!d || d instanceof Error) throw new Error(`rider "${id}" is not loaded/built (${d?.message || 'missing from loadHuman()'})`);
  const ch = buildCharacter(d, opts);
  const holder = new THREE.Group();
  holder.name = `rider:${name}`;
  holder.add(ch.root);
  // the placeholder rig's root bone head sat at restHead.root; ours sits wherever the build put
  // the pelvis (riders: at the origin) - report it so mountRider() does the same arithmetic
  const rootBone = ch.bone('root');
  const rp = new THREE.Vector3();
  rootBone.getWorldPosition(rp);
  const restHead = { root: [rp.x, rp.y, rp.z] };
  const rider = {
    root: holder, character: ch, skeleton: ch.skeleton, bones: ch.bones, index: ch.index, parts: ch.meshes, restHead, outfit: name,
    lean: (opts.lean ?? 0.12) - 0.12, reach: (opts.reach ?? 0.35) - 0.35,
  };
  rider.setPose = () => rider.update(0);
  rider.update = (t = 0, o = {}) => {
    applyIdle(ch, t, { amount: 0.6, ...o });
    if (rider.lean) for (const [n, w] of [['spine05', 0.3], ['spine04', 0.3], ['spine03', 0.25], ['spine02', 0.15]]) rotLocalX(ch.bone(n), rider.lean * w);
    ch.root.updateMatrixWorld(true);
  };
  rider.update(0);
  return rider;
}
const _q = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0);
function rotLocalX(b, a) { if (b && a) b.quaternion.multiply(_q.setFromAxisAngle(_x, a)); }

// -------------------------------------------------- set-people adapter ----
const HIP = 0.88;
/**
 * Drop-in for sets/people.js person(human, outfit, action, opts) for crowd scenes: picks a
 * crowd-kit villager (by opts.seed, or opts.id) instead of a mannequin. The returned root is a
 * holder lifted by the placeholder's hip height, so placePerson() from sets/people.js keeps
 * working; or use placeCharacter(p.character, ...). Needs loadCrowd() first.
 */
export function person(crowd, outfit, action = 'stand', opts = {}) {
  const ids = Object.keys(crowd.data);
  const id = opts.id || ids[(hashStr(String(opts.seed ?? 0) + (outfit?.name || '')) >>> 0) % ids.length];
  const ch = buildCharacter(crowd.data[id], opts);
  const holder = new THREE.Group();
  holder.name = `person:${id}`;
  ch.root.position.y = -HIP;
  holder.add(ch.root);
  return { root: holder, character: ch, id, update: (t, o) => applyIdle(ch, t, o) };
}

/** Preload the crowd kit (or opts.ids) for person(). */
export async function loadCrowd(opts = {}) {
  const ids = opts.ids || CROWD;
  const data = {};
  await Promise.all(ids.map(async (id) => { data[id] = await loadCharacterData(id); }));
  return { kind: 'dk-crowd', data };
}
