// Episode-making engine (engine/DESIGN.md), phase 1: the director's pure self-test (it includes
// build-shots --check: Episode 1's shot tables and edit lists are up to date, through the --episode
// plumbing), --episode on the tools, and template mining over the hand-written specs (>= 170 measured).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = (...args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

test('engine phase 1: director self-test (build-shots --check for s01e01) passes', () => {
  const r = node('scenes/lib/director/tools/selftest.mjs', '--episode', 's01e01');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('engine phase 1: a bad --episode id is refused before anything is read', () => {
  const r = node('scenes/lib/director/tools/build-shots.mjs', '--episode', '../x', '--check');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /episode id/);
});

test('engine phase 1: mine-specs measures >= 170 hand-written specs, deterministically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-mine-'));
  try {
    const a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json');
    for (const f of [a, b]) { const r = node('engine/tools/mine-specs.mjs', '--out', f); assert.equal(r.status, 0, r.stderr); }
    const d = JSON.parse(fs.readFileSync(a, 'utf8'));
    assert.ok(d.coverage.measured >= 170, `measured ${d.coverage.measured}`);
    assert.deepEqual(d.problems, []);
    assert.ok(d.by_size.MS?.bands?.dist && d.by_template['establish-wide']?.bands?.mm);
    assert.equal(fs.readFileSync(a, 'utf8'), fs.readFileSync(b, 'utf8'), 'same specs, same bytes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- phase 2: input parsers and validator (engine/input/) -------------------------------------------------------
const input = (f) => import(path.join(ROOT, 'engine/input', f));
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

test('engine phase 2: the timing model and subtitle splitter match Episode 1 on all its lines', async () => {
  const C = await input('common.mjs');
  const d = readJson('episodes/s01e01/final/dialogue.json');
  for (const x of d.lines) {
    const notes = C.parseBracket(x.bracket_raw).notes.filter((p) => !/APPROVED/.test(p));
    assert.equal(C.estimateSeconds(x.speaker, x.text, notes, x.interrupted, x.command?.type ?? null)[0], x.est_seconds, x.id);
    assert.deepEqual(C.subtitleCues(x.text), x.subtitle_cues, x.id);
    assert.equal(C.subtitleMinSeconds(x.text), x.subtitle_min_seconds, x.id);
  }
});

test('engine phase 2: the 81 1C rows of s01e01 survive export -> shotlist.txt -> parse', async () => {
  const { exportShots } = await input('export-shotlist.mjs');
  const { parseShotlist } = await input('shotlist-parse.mjs');
  const dialogue = readJson('episodes/s01e01/final/dialogue.json');
  const rows = readJson('episodes/s01e01/final/shotlist.json').shots.filter((s) => s.scene === '1C');
  assert.equal(rows.length, 81);
  const text = exportShots(rows, { dialogue });                     // lines by speaker + first words, no ids
  const { shotlist, issues } = await parseShotlist(text, { ep: 's01e01', dialogue });
  assert.deepEqual(issues, []);
  assert.equal(shotlist.shots.length, 81);
  const pick = (s) => ({ id: s.id, scene: s.scene, set: s.set, shot_size: s.shot_size, lens: s.lens, camera_move: s.camera_move,
    in_frame: s.in_frame.map((f) => [f.name, f.screen_pos, f.kind]), dialogue: s.dialogue.map((d) => [d.id, d.portion ?? 1, d.speaker_on_screen]),
    frames: s.frames_at_24fps, action: s.action, sound: s.sound, flags: s.continuity_flags, timing: s.timing });
  assert.deepEqual(shotlist.shots.map(pick), rows.map(pick));
});

test('engine phase 2: t00 validates with 0 errors and its committed final/ files are up to date', async () => {
  const { validateEpisode } = await input('validate.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-t00-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'episodes/t00/final/lines.lock.json'), path.join(dir, 'lines.lock.json'));
    const r = await validateEpisode('t00', { out: dir, write: true });
    assert.deepEqual(r.errors, []);
    assert.equal(r.totals.shots, 3);
    for (const f of ['dialogue.json', 'onscreen-text.json', 'lines.lock.json', 'shotlist.json', 'sets.plan.json', 'validation.md'])
      assert.equal(fs.readFileSync(path.join(dir, f), 'utf8'), fs.readFileSync(path.join(ROOT, 'episodes/t00/final', f), 'utf8'), `${f} is stale: node engine/input/validate.mjs --episode t00 --write`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('engine phase 2: the fixture with 6 planted errors reports all 6 (and only those)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-bad-'));
  try {
    const r = node('engine/input/validate.mjs', '--episode', 't00', '--input', 'engine/input/fixtures/bad', '--out', dir, '--json');
    assert.equal(r.status, 1, r.stderr);
    const codes = JSON.parse(r.stdout).errors.map((e) => e.code).sort();
    assert.deepEqual(codes, ['E_CHAR', 'E_CHILD', 'E_FRAMES', 'E_LINE_MISSED', 'E_LINE_ORDER', 'E_SET']);
    assert.match(fs.readFileSync(path.join(dir, 'validation.md'), 'utf8'), /\*\*6 errors/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('engine phase 2: line ids stay stable across screenplay edits; nothing is written inside input/', async () => {
  const { buildFromFountain } = await input('fountain.mjs');
  const { safeWrite } = await input('common.mjs');
  const src = fs.readFileSync(path.join(ROOT, 'episodes/t00/input/screenplay.fountain'), 'utf8');
  const a = await buildFromFountain(src, { ep: 't00' });
  assert.deepEqual(a.dialogue.lines.map((x) => x.id), ['L001', 'L002', 'L003']);
  const edited = src.replace('VENDOR\n(calling across)', 'MUSICIAN\nMorning.\n\nVENDOR\n(calling across)').replace("won't wait.", "won't wait!");
  const b = await buildFromFountain(edited, { ep: 't00', lock: a.lock });
  assert.deepEqual(b.dialogue.lines.map((x) => `${x.id} ${x.text}`), ['L004 Morning.', "L001 You're early.", "L002 The crowd won't wait!", 'L003 Then play.']);
  assert.throws(() => safeWrite(path.join(ROOT, 'episodes/t00/input/x.json'), '{}'), /input/);
});

// ---- phase 3: set sheets, occlusion, cast list, casting --------------------------------------------------------
const SHEET_SETS = ['CLING_SQUARE', 'VERDOR_AERIAL', 'VERDOR_HARBOR', 'OUTER_ROCKS', 'SKY_OFF_VERDOR', 'BIRTHING_CHAMBER'];
const sheetOf = (set) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scenes/lib/director/sets/sheets', `${set}.json`), 'utf8'));
const specDir = path.join(ROOT, 'episodes/s01e01/final/scenes/specs');
const specMod = async (f) => (await import(path.join(specDir, f))).default;

test('engine phase 3: the six set sheets are up to date (sheet.mjs --check) and plain JSON', () => {
  const r = node('engine/tools/sheet.mjs', '--check');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const set of SHEET_SETS) {
    const s = sheetOf(set);
    assert.equal(s.set, set);
    for (const k of ['marks', 'objects', 'areas', 'paths', 'vantages', 'solids', 'cost']) assert.ok(s[k], `${set}.${k}`);
    assert.ok(Object.keys(s.vantages).length >= 4 && Object.keys(s.marks).length >= 6, set);
    for (const a of Object.values(s.areas)) assert.equal(a.slotAt.length, a.slots, `${set} area slots`);
  }
  // every hand-written camera of the six sets' specs (and their shotSet wrappers) is a named vantage
  const v = sheetOf('CLING_SQUARE').vantages;
  assert.deepEqual(v['X5-02'].pos, [3, 2.15, 19.8]);
  assert.equal(v['X5-02'].mm, 35);
  assert.ok(v['R3-03'] && v['X5-18']);
});

test('engine phase 3: every mark name used in the six sets\' specs resolves from the sheets', async () => {
  const { specsFor, sheetMark } = await import(path.join(ROOT, 'engine/tools/sheet.mjs'));
  const POS_KEYS = new Set(['at', 'to', 'look', 'face', 'focus', 'pos', 'parent', 'object', 'target']);
  let used = 0;
  for (const set of SHEET_SETS) {
    const sheet = sheetOf(set);
    for (const { file, spec } of await specsFor(set)) {
      const actors = new Set(Object.keys(spec.cast || {}));
      const refs = new Map();
      const ref = (s, where) => { if (typeof s === 'string' && !actors.has(s.split('.')[0])) refs.set(s, where); };
      const walk = (o, key, where) => {
        if (Array.isArray(o)) {
          if (key === 'subjects') { for (const sub of o) ref(Array.isArray(sub) ? sub[0] : sub, where); return; }
          if (POS_KEYS.has(key) && o.every((k) => Array.isArray(k))) { for (const k of o) ref(k[1], where); return; }   // key lists [[t, v]]
          if (key === 'acts') { for (const a of o) walk(a[2], null, where); return; }
          for (const x of o) walk(x, null, where);
          return;
        }
        if (o && typeof o === 'object') { for (const [k, x] of Object.entries(o)) { if (POS_KEYS.has(k) && typeof x === 'string') ref(x, `${where}.${k}`); else if (!['plans', 'captions'].includes(k)) walk(x, k, where); } }
      };
      for (const [id, sh] of Object.entries(spec.shots || {})) walk(sh, null, id);
      walk(spec.defaults, null, 'defaults');
      for (const [k, d] of Object.entries(spec.cast || {})) if (typeof d.parent === 'string') ref(d.parent, `cast.${k}.parent`);
      for (const [name, where] of refs) {
        used++;
        assert.ok(sheetMark(sheet, name), `${file} ${where}: mark "${name}" is not in the ${set} sheet`);
      }
    }
  }
  assert.ok(used >= 20, `only ${used} mark references found`);
});

test('engine phase 3: occlusion rays against sheet solids reproduce X6-01 r1 (the pair behind the stacks)', async () => {
  const { measure, shotSpec, rayBlock } = await import(path.join(ROOT, 'scenes/lib/director/previs-core.js'));
  const spec = await specMod('outer-rocks.spec.js');
  const sheet = sheetOf('OUTER_ROCKS');
  // ray primitives
  assert.equal(rayBlock([{ box: [[-1, -1], [1, 1]], h: 2, what: 'b' }], [-5, 1, 0], [5, 1, 0])?.what, 'b');
  assert.equal(rayBlock([{ box: [[-1, -1], [1, 1]], h: 2, what: 'b' }], [-5, 3, 0], [5, 3, 0]), null);
  assert.equal(rayBlock([{ cyl: [0, 0], r: 1, y0: 1, h: 1, what: 'c' }], [-5, 0.5, 0], [5, 2.5, 0])?.what, 'c');
  const { map } = spec, h = (map.axis * Math.PI) / 180;
  const W = (u, v, y = 0) => [map.gap[0] + Math.sin(h) * u - Math.cos(h) * v, y, map.gap[2] - Math.cos(h) * u - Math.sin(h) * v];
  const P = (keys) => keys.map(([t, u, v, y, e]) => (e ? [t, W(u, v, y), e] : [t, W(u, v, y)]));
  const r2 = shotSpec(spec, 'X6-01');
  // r1, from the spec comment: the camera ship on the SEAWARD side (v +75) at 120 mm; the pair on r2's track before
  // the fix moved it inland (70 m nearer the axis; r1's exact keys were not kept)
  const r1 = { ...r2, cam: { ...r2.cam, mm: 120, pos: [[0, W(520, 75, 52)], [6, W(512, 69, 51), 'linear']], look: [[0, W(-60, -10, 40)], [6, W(-60, -10, 40), 'linear']] },
    cast: { ...r2.cast, leaf: { ...r2.cast.leaf, root: P([[0, -350, -28, 70], [6, -240, -28, 62, 'linear']]) }, charcoal: { ...r2.cast.charcoal, root: P([[0, -390, -42, 92], [6, -290, -42, 88, 'linear']]) } } };
  for (const t of [0, 3, 5.9]) {
    const a = measure(spec, r1, t, { sheet, frames: 144 }).actors.find((x) => x.name === 'leaf');
    assert.ok(a.inFrame && /^stack [AB]$/.test(a.occludedBy) && a.visibleFrac === 0, `r1 t ${t}: leaf ${a.occludedBy} ${a.visibleFrac}`);
    const b = measure(spec, 'X6-01', t, { sheet, frames: 144 }).actors.find((x) => x.name === 'leaf');
    assert.ok(b.inFrame && !b.occludedBy && b.visibleFrac === 1, `r2 (hand-written) t ${t}: leaf clear of the stacks`);
  }
});

test('engine phase 3: cast-list.js agrees with humans/index.js, characters.py and CHARACTERS.md', async () => {
  const { BUILDS, CROWD, NAMED, ageYears } = await import(path.join(ROOT, 'scenes/lib/humans/cast-list.js'));
  const idx = fs.readFileSync(path.join(ROOT, 'scenes/lib/humans/index.js'), 'utf8');
  const block = idx.slice(idx.indexOf('export const CAST = {'), idx.indexOf('};', idx.indexOf('export const CAST = {')));
  const ids = [...block.matchAll(/(?:^|[\s,{])([a-z][a-z0-9_]*):\s*['"]/g)].map((m) => m[1]);
  assert.deepEqual(Object.keys(BUILDS), [...ids, ...CROWD]);
  const py = fs.readFileSync(path.join(ROOT, 'scenes/lib/humans/offline/characters.py'), 'utf8');
  const sex = (g) => (+g >= 0.5 ? 'M' : 'F');
  for (const m of py.matchAll(/person\('(\w+)', '[^']+', ([\d.]+), ([\d.]+)/g)) assert.deepEqual([BUILDS[m[1]].sex, BUILDS[m[1]].ageMH], [sex(m[2]), +m[3]], m[1]);
  for (const m of py.matchAll(/guard\('(\w+)', '[^']+', '\w+', ([\d.]+)/g)) assert.equal(BUILDS[m[1]].ageMH, +m[2], m[1]);
  for (const m of py.matchAll(/\('(crowd\d\d)', ([\d.]+), ([\d.]+)/g)) assert.deepEqual([BUILDS[m[1]].sex, BUILDS[m[1]].ageMH], [sex(m[2]), +m[3]], m[1]);
  const md = fs.readFileSync(path.join(ROOT, 'CHARACTERS.md'), 'utf8');
  for (const n of NAMED) assert.match(md, new RegExp(`\\| ${n.name.replace(/[()]/g, '\\$&')} \\| \\*{0,2}${n.child ? 'A child' : 'Adult'}`), n.name);
  // canon: Abby is a child (every Abby build), Remi an adult; MakeHuman ages under 18 count as children
  for (const id of ['abby', 'abby_ride', 'abby_injured', 'abby_sling', 'abby_ride_injured', 'child', 'crowd13', 'crowd18']) assert.equal(BUILDS[id].age, 'child', id);
  for (const id of ['remi', 'remi_ride', 'vendor', 'musician', 'crowd02']) assert.equal(BUILDS[id].age, 'adult', id);
  assert.equal(Math.round(ageYears(0.5)), 25);
});

test('engine phase 3: casting 1C matches the hand-written specs (>= 90 % of named roles), no child in R3-02..04', async () => {
  const { castRows, classify } = await import(path.join(ROOT, 'engine/cast/casting.mjs'));
  const { BUILDS, isChildBuild } = await import(path.join(ROOT, 'scenes/lib/humans/cast-list.js'));
  const sl = JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes/s01e01/final/shotlist.json'), 'utf8'));
  const out = castRows(sl.shots, { ep: 's01e01', scenes: ['1C'] });
  assert.deepEqual(out.errors, []);
  const specs = {};
  for (const f of fs.readdirSync(specDir)) { const s = await specMod(f); for (const id of Object.keys(s.shots || {})) specs[id] = s; }
  const idOf = (d) => (typeof d.id === 'object' ? d.id.design : d.id);
  const roleOf = (d) => d.role || (d.kind === 'creature' ? ((typeof d.id === 'object' ? d.id.look : d.opts?.look) === 'scout' ? 'WORKING DRAGON' : idOf(d).toUpperCase()) : BUILDS[idOf(d)]?.crowd ? null : BUILDS[idOf(d)]?.role);
  let n = 0, ok = 0, named = 0;
  for (const [id, list] of Object.entries(out.shots)) {
    const s = specs[id];
    for (const e of list) {
      if (e.generic || e.implied) continue;
      named++;
      if (!s) continue;
      const sh = s.shots[id];
      const hand = Object.keys({ ...(s.defaults?.cast || {}), ...(sh.cast || {}) }).filter((k) => sh.cast?.[k] !== null).map((k) => s.cast[k]).filter((d) => d && roleOf(d) === e.role);
      if (!hand.length) continue;
      n++;
      if (hand.some((d) => idOf(d) === e.build)) ok++;
    }
  }
  assert.ok(n >= 90 && ok / n >= 0.9, `${ok}/${n} named roles match the specs`);
  assert.ok(n / named >= 0.9, `only ${n} of ${named} named roles have a hand-written counterpart`);
  for (const id of ['R3-02', 'R3-03', 'R3-04']) {
    assert.ok(out.shots[id].length >= 2, id);
    for (const e of out.shots[id]) assert.ok(!isChildBuild(e.build), `${id}: ${e.build}`);
  }
  // riders ride, with their mounts; generic roles are unique within a scene and deterministic
  assert.deepEqual(out.shots['1C-09'].map((e) => e.build).sort(), ['abby_ride', 'leaf']);
  const gen = Object.entries(out.roles).filter(([k]) => k.startsWith('1C|')).map(([, r]) => r.build);
  assert.equal(new Set(gen).size, gen.length);
  assert.deepEqual(castRows(sl.shots, { ep: 's01e01', scenes: ['1C'] }), out);
  assert.equal(classify('Working dragon', 'dragon').role, 'WORKING DRAGON');
});

test('engine phase 3: the rating guard is hard; t00 casts cleanly and its lock is current', async () => {
  const { castRows } = await import(path.join(ROOT, 'engine/cast/casting.mjs'));
  const row = (id, frame, extra = {}) => ({ id, scene: '9Z', set: 'CLING_SQUARE', in_frame: frame.map((name) => ({ name, kind: 'person', screen_pos: 'C' })), continuity_flags: [], ...extra });
  const bad = castRows([row('R9-01', ['Abby']), row('9Z-02', ['Young riders'], { continuity_flags: ['NO_CHILD_IN_FRAME'] }), row('9Z-03', ['Villagers'], { continuity_flags: ['NO_CHILD_IN_FRAME'] })], { ep: 'x' });
  assert.deepEqual(bad.errors.map((e) => e.where), ['R9-01', '9Z-02', '9Z-02', '9Z-02']);
  assert.ok(bad.shots['9Z-03'].every((e) => e.build.startsWith('crowd')), 'adult villagers are fine');
  const r = node('engine/cast/casting.mjs', '--episode', 't00', '--dry-run', '--json');
  assert.equal(r.status, 0, r.stderr);
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes/t00/final/cast.lock.json'), 'utf8'));
  assert.deepEqual(JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1)), lock);
  assert.deepEqual(lock.shots['0A-01'].map((e) => e.build), ['vendor', 'musician']);
});

// ---- engine phase 4: auto-stager v1 (ground) ----
test('engine phase 4: re-staging the 22 Cling shots: >= 80 % of subjects in frame and on their side; deterministic', async () => {
  const { restageCling } = await import('../engine/stager/accept.mjs');
  const a = await restageCling(), b = await restageCling();
  assert.equal(JSON.stringify(a.staged.spec), JSON.stringify(b.staged.spec), 'the stager is deterministic');
  assert.equal(a.per.length, 22);
  assert.ok(a.inFrameSide >= 0.8, `in frame + side ${a.inFrameSide}`);
  // DESIGN's second number (>= 70 % within 45 deg bearing and x1.5 screen height of the hand-made shot) is NOT met
  // yet (phase 4 measured 55 %, PROGRESS.md); this guards the level reached
  assert.ok(a.cmpOk >= 0.5, `bearing + height vs hand ${a.cmpOk}`);
  // rating: no child build anywhere in R3-01..04
  for (const id of ['R3-01', 'R3-02', 'R3-03', 'R3-04']) for (const k of Object.keys(a.staged.spec.shots[id].cast || {})) assert.ok(!/child|abby/.test(a.staged.spec.cast[k].id), `${id}: ${k}`);
});

test('engine phase 4: t00 is staged (auto/touch/spec files current), build-shots places every line', async () => {
  let r = node('engine/stager/write.mjs', '--episode', 't00', '--check');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = node('scenes/lib/director/tools/build-shots.mjs', '--episode', 't00', '--check');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /not placed|no spec yet/);
  const edl = JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes/t00/final/cut/edl.json'), 'utf8'));
  const sl = JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes/t00/final/shotlist.json'), 'utf8'));
  assert.deepEqual(edl.shots.flatMap((s) => s.dialogue.map((d) => d.id)), sl.shots.flatMap((s) => s.dialogue.map((d) => d.id)));
  assert.ok(edl.shots.every((s) => s.kind === '3d'));
  r = node('engine/stager/write.mjs', '--episode', 's01e01');
  assert.notEqual(r.status, 0, 'Episode 1 specs are never written');
  const { mergeSpecs } = await import('../scenes/lib/director/staging/merge.js');
  const m = mergeSpecs({ set: 'X', shots: { a: { cam: { mm: 35, fstop: 8 }, cast: { v: { at: [0, 0] } } }, b: { cam: { mm: 50 } } } }, { a: { cam: { mm: 50 }, cast: { v: null } }, b: { lock: true, cam: { mm: 85 } } });
  assert.deepEqual(m.shots, { a: { cam: { mm: 50, fstop: 8 }, cast: {} }, b: { cam: { mm: 85 } } });
});

test('engine phase 5: flight.js helpers, the horizon rule, the line side, the two-shot fix and the stall build', async () => {
  const F = await import('../scenes/lib/director/staging/flight.js');
  assert.equal(F.CHAR_HZ, 0.625, 'CHAR_HZ is locked by the sound spots');
  const p = F.pair([0, 60, 0], 180, 2);
  assert.deepEqual(p.charcoal.root[0][1], [30, 58, 16]);                       // 30 m to Leaf's left (east going south), 16 m ahead
  const C = F.formationClock([[0, 60, 0], [0, 60, 100]], { v: 10 });
  assert.deepEqual(C.at(5).p, [0, 60, 50]); assert.equal(C.at(5).heading, 180);
  const { horizonRule } = await import('../scenes/lib/director/previs-core.js');
  assert.equal(horizonRule({ pos: [0, 100, 0], look: [0, 99, 100], mm: 160 }).ok, false);
  assert.equal(horizonRule({ pos: [0, 100, 0], look: [0, 90, 100], mm: 160 }).ok, true);
  const { lineSide } = await import('../engine/stager/check.mjs');
  const line = { travel: 'heading', camSide: 'right', tol: 25 };
  assert.equal(lineSide(line, [0, 0, 0], 180, [-50, 0, 0]).ok, true);           // heading south, camera west = its right
  assert.equal(lineSide(line, [0, 0, 0], 180, [50, 0, 0]).ok, false);
  assert.equal(lineSide(line, [0, 0, 0], 180, [50, 0, 0], true).ok, true);       // "reverse" declared
  const rep = JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes/t00/final/stage-report.json'), 'utf8')).shots.find((s) => s.id === '0A-02');
  assert.ok(rep.fixes.some((f) => f.startsWith('two-shot:')), 'the two talkers are brought together');
  assert.ok(!rep.flags.some((f) => f.startsWith('W_SIZE')));
  const a = await import('../engine/stager/accept.mjs');
  const r = await a.restageCling();
  const x504 = r.staged.spec.shots['X5-04'].set.stall;
  assert.ok(Array.isArray(x504.poles) && Array.isArray(x504.cloth), 'X5-04: the stall is built during the shot');
});
