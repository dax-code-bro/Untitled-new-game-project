// The human cast as DATA (engine phase 3, engine/DESIGN.md section 3.5): every built character id with its role,
// sex, age class and variants - pure data, no three.js, no files, so Node tools (the engine's casting and validator)
// and the browser can both read it.
//
// Sources (kept in step by test/engine.test.mjs):
//   - the build ids and their one-line descriptions: humans/index.js CAST / CROWD (index.js is NOT changed to import
//     this file: it is part of the render core hash, so editing it would re-key every queued shot);
//   - sex and MakeHuman age (macro 0..1): offline/characters.py (cast() and crowd());
//   - adult or child: CHARACTERS.md (Daxtyn's canon) first, then the build's own age.
//
// Age class: 'child' = CHARACTERS.md says a child (Abby, the child in Cling), OR the build's MakeHuman age is under
// 18 years (macro age < 0.34375: MakeHuman maps 0 -> 1 y, 0.1875 -> 11 y, 0.5 -> 25 y, 1 -> 90 y). SERIES.md section 8
// treats anyone who could be a child as one, so a 'child' build is never cast in a rating-pass (R*) or NO_CHILD_IN_FRAME
// shot. Abby's build is an adult-sized body (0.43), but she is a child in canon: canon wins.
//
//   import { BUILDS, ROLES, CROWD, CREATURES, buildsOf, isChildBuild } from '../lib/humans/cast-list.js';

/** MakeHuman macro age -> years (MakeHuman's own piecewise-linear map). */
export const ageYears = (a) => (a < 0.1875 ? 1 + (a / 0.1875) * 10 : a < 0.5 ? 11 + ((a - 0.1875) / 0.3125) * 14 : 25 + ((a - 0.5) / 0.5) * 65);
/** The age-class line: builds younger than this (MakeHuman macro age) count as children. */
export const CHILD_AGE = 0.34375;

// id: [role, sex 'F'|'M', MakeHuman age, about (humans/index.js CAST), extra]
const B = {
  abby: ['ABBY', 'F', 0.43, 'Abby, standing (riding clothes, muted green outer layer)', { canonChild: true, variant: 'stand' }],
  abby_injured: ['ABBY', 'F', 0.43, 'Abby, LEFT forearm held in against the body', { canonChild: true, variant: 'injured' }],
  abby_sling: ['ABBY', 'F', 0.43, 'Abby, LEFT arm in a linen sling', { canonChild: true, variant: 'sling' }],
  abby_ride: ['ABBY', 'F', 0.43, 'Abby seated astride (for Leaf\'s saddle)', { canonChild: true, variant: 'ride', ride: 'LEAF' }],
  abby_ride_injured: ['ABBY', 'F', 0.43, 'Abby seated, hunched, LEFT arm held in', { canonChild: true, variant: 'ride_injured', ride: 'LEAF' }],
  remi: ['REMI', 'M', 0.52, 'Remi, standing (dark riding clothes, muted blue outer layer)', { variant: 'stand' }],
  remi_ride: ['REMI', 'M', 0.52, 'Remi seated astride (for Charcoal\'s riding rig)', { variant: 'ride', ride: 'CHARCOAL' }],
  alexandria: ['ALEXANDRIA', 'F', 0.62, 'Queen Alexandria (restrained formal gown)', {}],
  fall: ['FALL', 'F', 0.55, 'Queen Fall, standing (fitted command riding clothes)', { variant: 'stand' }],
  fall_ride: ['FALL', 'F', 0.55, 'Queen Fall seated astride (for Starlight\'s rig)', { variant: 'ride', ride: 'STARLIGHT' }],
  king: ['KING', 'M', 0.68, 'King of Cling (warm festival clothes, open-handed gesture)', {}],
  attendant: ['ATTENDANT', 'F', 0.47, 'Attendant (household clothes, folded cloth)', {}],
  healer: ['HEALER', 'F', 0.74, 'Healer (work clothes, apron, coif and veil, bowl)', {}],
  messenger: ['MESSENGER', 'M', 0.45, 'Royal messenger (light running clothes, scroll)', {}],
  keeper1: ['KEEPER', 'M', 0.6, 'Ground keeper, signalling', {}],
  keeper2: ['KEEPER', 'F', 0.52, 'Ground keeper with a rope coil', {}],
  vendor: ['VENDOR', 'M', 0.64, 'Vendor with an empty crate', {}],
  parent: ['PARENT', 'F', 0.5, 'Parent with a parcel, hand lowered for the child', {}],
  child: ['CHILD', 'F', 0.12, 'Child holding the parent\'s hand', { canonChild: true }],
  musician: ['MUSICIAN', 'M', 0.58, 'Musician with a lute', {}],
  musician2: ['MUSICIAN', 'F', 0.48, 'Musician with a recorder', {}],
  guard_captain: ['GUARD CAPTAIN', 'M', 0.66, 'Guard captain, hand on the sword hilt', {}],
  guard1: ['GUARD', 'M', 0.55, 'Guard with spear', {}],
  guard2: ['GUARD', 'M', 0.48, 'Guard with spear (2)', {}],
  guard3: ['GUARD', 'M', 0.52, 'Guard with spear (3)', {}],
  watchman: ['WATCHMAN', 'M', 0.62, 'Watchman pointing up', {}],
  villager_hurt: ['INJURED VILLAGER', 'M', 0.56, 'Injured villager (3C)', {}],
  scout_ride: ['SCOUT RIDER', 'M', 0.5, 'Scout rider (hooded, seated)', { variant: 'ride', ride: 'SCOUT' }],
  sailor1: ['SAILOR', 'M', 0.5, 'Sailor hauling a rope', {}],
  sailor2: ['SAILOR', 'M', 0.6, 'Harbor crew carrying a crate', {}],
};
// the festival crowd kit (characters.py crowd(): id, sex, age); the role is a generic villager
const CROWD_ROWS = [
  ['crowd01', 'F', 0.42], ['crowd02', 'M', 0.5], ['crowd03', 'F', 0.7], ['crowd04', 'M', 0.36], ['crowd05', 'F', 0.55], ['crowd06', 'M', 0.78],
  ['crowd07', 'F', 0.3], ['crowd08', 'M', 0.46], ['crowd09', 'F', 0.62], ['crowd10', 'M', 0.25], ['crowd11', 'F', 0.48], ['crowd12', 'M', 0.58],
  ['crowd13', 'F', 0.2], ['crowd14', 'M', 0.4], ['crowd15', 'F', 0.82], ['crowd16', 'M', 0.33], ['crowd17', 'F', 0.38], ['crowd18', 'M', 0.15],
];

/** Every build: { id, role, name, sex, ageMH, years, age: 'adult'|'child', canonChild, variant, ride, about, crowd }. */
export const BUILDS = {};
for (const [id, [role, sex, ageMH, about, x]] of Object.entries(B)) {
  BUILDS[id] = { id, role, sex, ageMH, years: Math.round(ageYears(ageMH)), age: x.canonChild || ageMH < CHILD_AGE ? 'child' : 'adult', canonChild: !!x.canonChild, variant: x.variant || 'stand', ride: x.ride || null, about, crowd: false };
}
/** The crowd kit ids (humans/index.js CROWD). */
export const CROWD = CROWD_ROWS.map(([id]) => id);
CROWD_ROWS.forEach(([id, sex, ageMH], i) => {
  BUILDS[id] = { id, role: 'VILLAGER', sex, ageMH, years: Math.round(ageYears(ageMH)), age: ageMH < CHILD_AGE ? 'child' : 'adult', canonChild: false, variant: 'stand', ride: null, about: `Festival villager ${i + 1}`, crowd: true };
});

/** Named people (CHARACTERS.md, Daxtyn's canon: adult or child) and the aliases a screenplay / shot list may use. */
export const NAMED = [
  { name: 'Prince Remi IV (Remi)', role: 'REMI', aliases: ['Prince Remi IV', 'Remi'], child: false },
  { name: 'Abby', role: 'ABBY', aliases: ['Abby'], child: true },
  { name: 'Queen Alexandria', role: 'ALEXANDRIA', aliases: ['Queen Alexandria', 'Alexandria'], child: false },
  { name: 'Queen Fall of Tara', role: 'FALL', aliases: ['Queen Fall of Tara', 'Fall', 'Queen Fall'], child: false },
  { name: 'The King of Cling', role: 'KING', aliases: ['The King of Cling', 'King of Cling'], child: false },
  { name: 'The child in Cling (CHILD)', role: 'CHILD', aliases: ['The child in Cling', 'CHILD', 'child in Cling'], child: true },
];

/** Roles with their own builds: variant -> build id; `mount` = the dragon a rider is always cast with. */
export const ROLES = {};
for (const b of Object.values(BUILDS)) {
  if (b.crowd) continue;
  const r = (ROLES[b.role] ||= { role: b.role, builds: {}, all: [], child: false, mount: null });
  r.all.push(b.id);
  if (!(b.variant in r.builds)) r.builds[b.variant] = b.id;
  if (b.age === 'child') r.child = true;
  if (b.ride) r.mount = b.ride;
}
/** Shot-list words for the roles above (lower case; longest first when matching). */
export const ROLE_WORDS = {
  ABBY: ['abby'], REMI: ['prince remi iv', 'prince remi', 'remi'], ALEXANDRIA: ['queen alexandria', 'alexandria'], FALL: ['queen fall of tara', 'queen fall', 'fall'],
  KING: ['the king of cling', 'king of cling', 'king'], ATTENDANT: ['attendant'], HEALER: ['healer'], MESSENGER: ['royal messenger', 'messenger'],
  KEEPER: ['ground keeper', 'keeper'], VENDOR: ['vendor'], PARENT: ['parent'], CHILD: ['the child in cling', 'child'], MUSICIAN: ['musician'],
  'GUARD CAPTAIN': ['guard captain', 'captain'], GUARD: ['guard'], WATCHMAN: ['watchman'], 'INJURED VILLAGER': ['injured villager'],
  'SCOUT RIDER': ['scout rider'], SAILOR: ['sailor'],
};

/** Creatures: role -> { id, opts }. A generic "working dragon" is Leaf's build in the scout look. */
export const CREATURES = {
  LEAF: { id: 'leaf' }, CHARCOAL: { id: 'charcoal' }, STARLIGHT: { id: 'starlight' }, SCOUT: { id: 'scout' }, HATCHLING: { id: 'hatchling' },
  'WORKING DRAGON': { id: 'leaf', opts: { look: 'scout' } },
};
export const CREATURE_WORDS = {
  LEAF: ['leaf'], CHARCOAL: ['charcoal'], STARLIGHT: ['starlight'], SCOUT: ['scout'], HATCHLING: ['hatchling'],
  'WORKING DRAGON': ['working dragon', 'small dragon', 'young dragon', 'dragon'],
};

export const isChildBuild = (id) => BUILDS[id]?.age === 'child';
/** Build ids filtered: { crowd: true, sex: 'F'|'M', age: 'adult'|'child' }. */
export const buildsOf = (f = {}) => Object.values(BUILDS)
  .filter((b) => (f.crowd == null || b.crowd === f.crowd) && (!f.sex || b.sex === f.sex) && (!f.age || b.age === f.age)).map((b) => b.id);
