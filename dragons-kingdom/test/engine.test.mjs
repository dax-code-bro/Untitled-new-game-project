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
