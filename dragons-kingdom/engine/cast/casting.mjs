#!/usr/bin/env node
// Engine phase 3 (engine/DESIGN.md section 3.5): CASTING.
//   node engine/cast/casting.mjs [--episode s01e01] [--scenes 1C,..] [--dry-run] [--json]
// reads final/shotlist.json, casts every person / dragon of every shot to a build, and writes final/cast.lock.json.
// Exit 1 on a rating error (a child-capable build in an R* / rating-pass or NO_CHILD_IN_FRAME shot).
//
// Rules
//   - named roles (scenes/lib/humans/cast-list.js ROLES: ABBY, REMI, ALEXANDRIA, FALL, KING, VENDOR, PARENT, CHILD,
//     MUSICIAN, GUARD#, SAILOR#, WATCHMAN, KEEPER# ...) -> their own build; "Guard 2" -> guard2, no number -> the first;
//   - variants: riding (the mount in frame, an air set, or "saddle / astride / riding / mounted" in the action) ->
//     the role's ride build (abby_ride); continuity flags ABBY_LEFT_ARM_INJURED -> abby_injured / abby_ride_injured,
//     ABBY_SLING_LEFT -> abby_sling; a rider is always cast with its mount (LEAF, CHARCOAL, STARLIGHT, SCOUT) and a
//     mount in an air set brings its rider (implied: true);
//   - dragons: LEAF -> leaf, CHARCOAL -> charcoal ("Charcoal's shadow" too), STARLIGHT, SCOUT, HATCHLING; a generic
//     "working / small / young dragon" -> { id: 'leaf', opts: { look: 'scout' } };
//   - generic people (villager, woman, man, crew, lookout, farmer, instructor, crowd ...) -> crowd## by sex (from the
//     word) and age class (adults unless the word is a child word), chosen by a deterministic hash of
//     (episode, scene, role, n) and unique within the scene; plural words take 3 (or the number written);
//   - the lock: a choice already in cast.lock.json is kept (whole episode, append-only) while it stays legal;
//   - the rating guard is HARD: a child-capable build (cast-list age 'child') in a restricted shot is an error.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dirs, episodeArg } from '../../scenes/lib/director/episode-paths.js';
import { BUILDS, ROLES, ROLE_WORDS, CREATURES, CREATURE_WORDS, buildsOf, isChildBuild } from '../../scenes/lib/humans/cast-list.js';

export const CASTING_VERSION = 1;
/** Sets shot in the air (riders ride); the sheets' kind says the same ('air-*'). */
export const AIR_SETS = ['SKY_OFF_VERDOR', 'OUTER_ROCKS', 'VERDOR_AERIAL', 'VERDOR_AERIAL_2'];
const RIDE_RE = /\b(saddle|astride|riding|rides|mounted|in flight|flies|flying)\b/i;
const CHILD_WORDS = ['young riders', 'young rider', 'young attendant', 'children', 'child', 'kids', 'kid', 'boys', 'boy', 'girls', 'girl', 'youngsters', 'youngster'];
const F_WORDS = /\b(woman|women|mother|wife|girls?|daughter|fishwife|old woman|lady|ladies)\b/;
const M_WORDS = /\b(man|men|father|husband|boys?|son|fisherman|fishermen|old man)\b/;
const GENERIC_WORDS = ['villagers', 'villager', 'townspeople', 'people', 'crowd', 'crew', 'lookout', 'farmer', 'instructor', 'woman', 'women', 'man', 'men',
  'neighbour', 'neighbor', 'partner', 'master', 'servant', 'servants', 'rider', 'riders', 'adults', 'adult', 'onlookers', 'fishermen', 'fisherman'];
const PLURAL = /\b(villagers|townspeople|people|crowd|crew|servants|riders|children|kids|boys|girls|youngsters|adults|onlookers|fishermen|women|men)\b/;
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const hash = (s) => { let h = 0x811c9dc5; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const word = (w, n) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(n);
const longest = (table, n) => {
  let best = null;
  for (const [role, words] of Object.entries(table)) for (const w of words) if (word(w, n) && (!best || w.length > best.w.length)) best = { role, w };
  return best;
};
/** Is a shot restricted by the rating rules (an R* / rating-pass shot or NO_CHILD_IN_FRAME)? (validate.mjs's rule) */
export const restricted = (s) => /^R\d/.test(s.id) || /^R\d/.test(s.part || '') || s.origin === 'rating_pass' || (s.continuity_flags || []).includes('NO_CHILD_IN_FRAME');

/** What a frame entry is: { kind: 'named'|'creature'|'generic'|'none', role, n, sex, child } */
export function classify(name, kindHint) {
  const raw = String(name).toLowerCase();
  const n = raw.replace(/\([^)]*\)/g, ' ').replace(/'s\b/g, ' ').replace(/\s+/g, ' ').trim();
  const count = (() => { const m = raw.match(/\b(one|two|three|four|five|six|\d+)\b/); return m ? NUM[m[1]] || +m[1] : PLURAL.test(n) ? 3 : 1; })();
  const cr = longest(CREATURE_WORDS, n);
  if (cr && (kindHint === 'dragon' || cr.role !== 'WORKING DRAGON' || /dragon/.test(n))) return { kind: 'creature', role: cr.role, n: /dragons\b/.test(n) ? count : 1 };
  const childWord = CHILD_WORDS.find((w) => word(w, n));
  const named = longest(ROLE_WORDS, n);
  // "child" alone is the named CHILD (her own build); "young riders", "children" are generic children
  if (named && !(childWord && childWord !== 'child' && named.w.length < childWord.length)) {
    const num = raw.match(/(\d+)\s*$/) || raw.match(/\((\d+)\)/);
    return { kind: 'named', role: named.role, n: 1, index: num ? +num[1] : null };
  }
  const sex = F_WORDS.test(n) ? 'F' : M_WORDS.test(n) ? 'M' : null;
  if (childWord) return { kind: 'generic', role: n.toUpperCase(), n: count, sex, child: true };
  if (GENERIC_WORDS.some((w) => word(w, n)) || kindHint === 'person') return { kind: 'generic', role: n.toUpperCase(), n: count, sex, child: false };
  return { kind: 'none' };
}

/** The build of a named role in a shot: variant from riding + continuity flags. */
function namedBuild(role, s, riding, index) {
  const R = ROLES[role];
  if (!R) return null;
  const flags = s.continuity_flags || [];
  const injured = flags.includes('ABBY_LEFT_ARM_INJURED') && role === 'ABBY';
  const sling = flags.includes('ABBY_SLING_LEFT') && role === 'ABBY';
  if (index != null && R.all.length > 1) {
    const pick = R.all.find((id) => new RegExp(`${index}$`).test(id));
    if (pick) return pick;
  }
  if (riding && R.builds.ride) return (injured || sling) && R.builds.ride_injured ? R.builds.ride_injured : R.builds.ride;
  if (sling && R.builds.sling) return R.builds.sling;
  if (injured && R.builds.injured) return R.builds.injured;
  return R.builds.stand || R.all[0];
}
const MOUNT_OF = Object.fromEntries(Object.values(ROLES).filter((r) => r.mount).map((r) => [r.role, r.mount]));
const RIDER_OF = { LEAF: 'ABBY', CHARCOAL: 'REMI', STARLIGHT: 'FALL' };

/**
 * Cast shot rows. rows: shotlist.json shots; opts: { ep, lock (a previous cast.lock.json), scenes }.
 * Returns the lock object { episode, version, roles, shots, errors, warnings }.
 */
export function castRows(rows, opts = {}) {
  const ep = opts.ep || 's01e01';
  const old = opts.lock?.roles || {};
  const roles = {}, shots = {}, errors = [], warnings = [];
  const usedInScene = {};                                   // scene -> Map(build -> role key)
  // generic keys first seen in a restricted shot must be adults; a generic child role there is an error anyway
  const pickGeneric = (scene, c, k) => {
    const key = `${scene}|${c.role}#${k}`;
    if (roles[key]) return key;
    const used = (usedInScene[scene] ||= new Map());
    const pool = buildsOf({ crowd: true, age: c.child ? 'child' : 'adult', ...(c.sex ? { sex: c.sex } : {}) });
    const free = (id) => !used.has(id) || used.get(id) === key;
    let build = old[key]?.build;
    if (!build || !pool.includes(build) || !free(build)) {
      const start = hash(`${ep}|${scene}|${c.role}|${k}`) % pool.length;
      build = null;
      for (let i = 0; i < pool.length && !build; i++) { const id = pool[(start + i) % pool.length]; if (free(id)) build = id; }
      if (!build) { build = pool[start]; warnings.push({ code: 'W_CROWD_REUSE', where: key, msg: `every ${c.child ? 'child' : 'adult'}${c.sex ? ' ' + c.sex : ''} crowd build is already used in scene ${scene}; ${build} repeats` }); }
    }
    used.set(build, key);
    roles[key] = { build, kind: 'human', generic: true, sex: BUILDS[build].sex, age: BUILDS[build].age };
    return key;
  };
  for (const s of rows) {
    if (opts.scenes && !opts.scenes.includes(s.scene)) continue;
    const list = [];
    const air = AIR_SETS.includes(s.set);
    const entries = (s.in_frame || []).filter((f) => f.kind !== 'element').map((f) => ({ f, c: classify(f.name, f.kind) }));
    const inFrameRoles = new Set(entries.map((e) => e.c.role));
    const add = (e) => { if (!list.some((x) => x.role === e.role && x.build === e.build && JSON.stringify(x.opts) === JSON.stringify(e.opts))) list.push(e); };
    const castCreature = (role, name, implied) => {
      const C = CREATURES[role];
      add({ name, role, kind: 'creature', build: C.id, ...(C.opts ? { opts: C.opts } : {}), ...(implied ? { implied: true } : {}) });
      roles[role] ||= { build: C.id, kind: 'creature', ...(C.opts ? { opts: C.opts } : {}) };
    };
    const castNamed = (role, name, index, implied) => {
      const mount = MOUNT_OF[role];
      const riding = !!mount && (inFrameRoles.has(mount) || air || RIDE_RE.test(s.action || ''));
      const build = namedBuild(role, s, riding, index);
      add({ name, role, kind: 'human', build, ...(riding && mount ? { mount } : {}), ...(implied ? { implied: true } : {}) });
      const R = (roles[role] ||= { builds: [], kind: 'human' });
      if (!R.builds.includes(build)) R.builds.push(build);
      if (riding && mount && !inFrameRoles.has(mount)) castCreature(mount, mount[0] + mount.slice(1).toLowerCase(), true);
    };
    for (const { f, c } of entries) {
      if (c.kind === 'creature') {
        for (let k = 0; k < c.n; k++) castCreature(c.role, f.name, false);
        const rider = RIDER_OF[c.role];
        if (rider && air && !inFrameRoles.has(rider)) castNamed(rider, rider[0] + rider.slice(1).toLowerCase(), null, true);
      } else if (c.kind === 'named') castNamed(c.role, f.name, c.index, false);
      else if (c.kind === 'generic') for (let k = 1; k <= c.n; k++) { const key = pickGeneric(s.scene, c, k); add({ name: f.name, role: key, kind: 'human', build: roles[key].build, generic: true }); }
      else warnings.push({ code: 'W_UNCAST', where: s.id, msg: `"${f.name}" (${f.kind}) is not a role the engine can cast` });
    }
    if (restricted(s)) {
      for (const e of list) if (e.kind === 'human' && isChildBuild(e.build))
        errors.push({ code: 'E_CHILD_BUILD', where: s.id, msg: `${e.build} (${e.role}, a child-capable build) cast in a ${/^R\d/.test(s.id) || s.origin === 'rating_pass' ? 'rating-pass (R*)' : 'NO_CHILD_IN_FRAME'} shot` });
    }
    shots[s.id] = list;
  }
  // keep locked roles that this run did not touch (append-only)
  for (const [k, v] of Object.entries(old)) if (!(k in roles)) roles[k] = { ...v, unused: true };
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return { episode: ep, version: CASTING_VERSION, source: 'engine/cast/casting.mjs', roles: sorted(roles), shots, errors, warnings };
}

async function main() {
  const { ep, argv } = episodeArg(process.argv.slice(2));
  const D = dirs(ep);
  const i = argv.indexOf('--scenes');
  const scenes = i >= 0 ? argv[i + 1].split(',') : null;
  const sl = JSON.parse(fs.readFileSync(D.shotlist, 'utf8'));
  const file = path.join(D.final, 'cast.lock.json');
  let lock = null;
  try { lock = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  const out = castRows(sl.shots, { ep, lock, scenes });
  if (argv.includes('--json')) process.stdout.write(JSON.stringify(out, null, 1) + '\n');
  else {
    const n = Object.values(out.shots).reduce((a, l) => a + l.length, 0);
    console.log(`${ep}: ${Object.keys(out.shots).length} shots, ${n} cast entries, ${Object.keys(out.roles).length} roles, ${out.errors.length} errors, ${out.warnings.length} warnings`);
    for (const e of [...out.errors, ...out.warnings]) console.log(`  ${e.code} ${e.where}: ${e.msg}`);
  }
  if (!argv.includes('--dry-run') && !out.errors.length) {
    if (ep === 's01e01' && !argv.includes('--force')) console.log('(s01e01: specs are hand-cast; not writing its cast.lock.json without --force)');
    else { fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n'); console.log(`wrote ${path.relative(process.cwd(), file)}`); }
  }
  process.exit(out.errors.length ? 1 : 0);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
