#!/usr/bin/env node
// Shot director - self-test of the pure parts (no browser): set layout and the render contract
// (whole-second starts, handles that never overlap another shot or its motion-blur shutter), shot
// lookup, keys and easing, the walk profile (smooth start / stop, exact distance), blocking purity,
// dialogue placement (word times, split takes, takes that run over a cut), the registry's
// continuity and the shot tables / edit list being up to date (build-shots --check).
//   node scenes/lib/director/tools/selftest.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { layoutSet, shotAt, keyed, ease, timecode, hash01, vnoise1 } from '../timeline.js';
import { walkProfile, actorState, makePath, envelope } from '../blocking.js';
import { indexTakes, placeLines, takeParts, mouthAt, speakerAt } from '../dialogue.js';
import { SETS, continuityFor, sunDir } from '../registry.js';
import { estimateShot } from '../cost.js';
import { faceReadability } from '../audit.js';
import { wingOutline, paintWingCloud } from '../sets/wing-cloud.js';
import { makeNoise, smooth } from '../../sets/terrain.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const FINAL = path.join(ROOT, 'episodes/s01e01/final');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

t('layoutSet: whole-second starts, handles inside, gaps between shots', () => {
  const L = layoutSet([{ job: 'a', frames: 50, pre: 12, post: 12 }, { job: 'b', frames: 24, pre: 12, post: 12 }, { job: 'c', frames: 7 }], { gapS: 1 });
  for (const s of L) assert.equal(s.start_frame % 24, 0);
  for (let i = 1; i < L.length; i++) assert.ok(L[i].range[0] - L[i - 1].range[1] >= 24, 'a 1 s gap between handle ranges');
  assert.equal(L[0].range[0], 0 * 24 + 0 - 12 + 24 * Math.ceil(12 / 24));
});
t('shotAt: the frame picks its shot, local time from the shot start, handles count as the shot', () => {
  const L = layoutSet([{ job: 'a', frames: 48, pre: 12, post: 12 }, { job: 'b', frames: 24, pre: 12, post: 12 }]);
  const b = L[1];
  const s = shotAt(L, b.start_frame + 5, (b.start_frame + 5) / 24);
  assert.equal(s.shot.job, 'b'); assert.ok(Math.abs(s.local - 5 / 24) < 1e-9);
  const h = shotAt(L, b.start_frame - 3, (b.start_frame - 3) / 24);
  assert.equal(h.shot.job, 'b'); assert.ok(h.local < 0);
});
t('keyed: holds before / after, eases between, steps non-numbers', () => {
  const k = [[1, 0], [3, 10, 'linear']];
  assert.equal(keyed(0, k), 0); assert.equal(keyed(4, k), 10); assert.equal(keyed(2, k), 5);
  assert.deepEqual(keyed(2, [[1, [0, 0]], [3, [2, 4], 'linear']]), [1, 2]);
  assert.equal(keyed(2, [[0, 'a'], [3, 'b']]), 'a');
  assert.ok(ease('smooth', 0.5) === 0.5 && ease('sine', 0) === 0 && ease('sine', 1) === 1);
  assert.equal(timecode(61.5), '00:01:01:12');
  assert.equal(hash01(3, 4), hash01(3, 4)); assert.ok(Math.abs(vnoise1(2.5, 3) - vnoise1(2.5, 3)) === 0);
});
t('walkProfile: covers exactly the path, speed 0 at both ends, monotonic', () => {
  for (const L of [0.5, 3, 12]) {
    const T = walkProfile(0, L, 1.4).T;
    let prev = -1;
    for (let i = 0; i <= 50; i++) { const p = walkProfile((T * i) / 50, L, 1.4); assert.ok(p.s >= prev - 1e-9); prev = p.s; }
    assert.ok(Math.abs(walkProfile(T + 0.01, L, 1.4).s - L) < 1e-9);
    assert.ok(walkProfile(0.001, L, 1.4).v < 0.05);
  }
});
t('blocking: actorState is a pure function of t (same input, same output; order independent)', () => {
  const env = { mark: (n) => ({ door: [4, 0, -2] }[n] || null), ground: () => 0 };
  const spec = { at: [0, 0], face: 90, acts: [[0.5, 'walk', { path: [[2, 0], [4, -2]], speed: 1.3, face: 'door' }], [5, 'crouch', { dur: 0.8 }], [5.2, 'raiseHand', { in: 0.3, hold: 0.5, out: 0.3 }]] };
  const a = actorState(spec, 3.7, env), b0 = actorState(spec, 9, env), b = actorState(spec, 3.7, env);
  assert.deepEqual(a, b); assert.ok(b0.posture.crouch > 0.99);
  const p = makePath([[0, 0], [3, 4]]); assert.equal(p.length, 5);
  assert.ok(envelope(0.1, { in: 0.2 }) < 1 && envelope(1, { in: 0.2, hold: 2 }) === 1);
});
t('dialogue: placement from the real takes; split parts; continues', () => {
  const takes = indexTakes(JSON.parse(fs.readFileSync(path.join(FINAL, 'vo/takes.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(FINAL, 'vo/words.json'), 'utf8')));
  const tk = takes.get('L003');
  assert.ok(tk && tk.segments.length === 5);
  const parts = takeParts(tk);
  assert.equal(parts.length, 5);
  assert.ok(parts[0].words.some((w) => w.w === 'tara') && parts[1].words.some((w) => w.w === 'scrapper'));
  const { placed, warnings } = placeLines(2, [['L003#1', 0.55]], takes);
  assert.equal(warnings.length, 0);
  assert.ok(Math.abs(placed[0].speech_in_s - 0.55) < 1e-6);
  const r = placeLines(2.5, [['L003#4', 1.22, { continues: true }]], takes);
  assert.equal(r.warnings.length, 0); assert.ok(r.placed[0].speech_out_s > 2.5);
  assert.equal(speakerAt(placed, placed[0].words[0].start_s + 0.01), 'NARRATOR');
  assert.ok(mouthAt(placed, 'NARRATOR', placed[0].words[0].start_s + 0.1) > 0);
});
t('registry: every set has a builder file or is a card; continuity resolves with per-shot overrides', () => {
  for (const [id, s] of Object.entries(SETS)) {
    if (!s.builder) continue;
    assert.ok(fs.existsSync(path.join(HERE, '..', 'sets', `${s.builder}.js`)), `${id}: sets/${s.builder}.js`);
  }
  const c = continuityFor('PROLOGUE_VISTAS', 'PROLOGUE', 'P-13');
  assert.deepEqual(c.sun, sunDir(140, 38));
  assert.ok(continuityFor('BIRTHING_CHAMBER', 'TITLE').sun === null);
});
t('cost: estimates scale with frames; measured timings replace the model', () => {
  const a = estimateShot('BIRTHING_CHAMBER', 100, { cast: { a: { kind: 'human' } } });
  const b = estimateShot('BIRTHING_CHAMBER', 200, { cast: { a: { kind: 'human' } } });
  assert.ok(Math.abs(b.draft_minutes - 2 * a.draft_minutes) < 0.02);
  assert.equal(estimateShot('BIRTHING_CHAMBER', 100, {}, { measured: { draft_s_per_frame: 2 } }).draft_s_per_frame, 2);
});
t('shot tables and the edit list are up to date (build-shots --check)', () => {
  const r = spawnSync(process.execPath, [path.join(HERE, 'build-shots.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // the render contract: every 3D shot of the edit has a set scene + an entry with a whole-second start
  const edl = JSON.parse(fs.readFileSync(path.join(FINAL, 'cut/edl.json'), 'utf8'));
  for (const e of edl.shots) {
    if (e.kind === 'black') continue;
    assert.equal(e.kind, '3d', `${e.job} has no spec`);
    assert.ok(fs.existsSync(path.join(ROOT, e.src.scene_file)), `${e.job}: ${e.src.scene_file}`);
    assert.equal(e.src.start_s % 1, 0);
  }
});
t('audit: a frontal, large, sharp speaking face reads; turned, small or defocused ones do not', () => {
  const lens = { focalLength: 50, fstop: 2, focus: 2, sensor: 'super35' };
  const toCam = [0, 0, 1];
  assert.equal(faceReadability([0, 0, 1], toCam, 2, lens).readable, true);                       // frontal, 2 m, focused
  assert.equal(faceReadability([1, 0, 0], toCam, 2, lens).readable, false);                      // profile (90 deg)
  assert.equal(faceReadability([0, 0, 1], toCam, 25, { ...lens, focus: 25 }).readable, false);  // small (25 m away at 50 mm)
  assert.equal(faceReadability([0, 0, 1], toCam, 4, { ...lens, focus: 1 }).readable, false);    // far behind the focus
  const m = faceReadability([0, 0, 1], toCam, 2, lens);
  assert.ok(Math.abs(m.faceFrac - (240 * 50) / 2000 / 14) < 1e-9 && m.blurFrac < 1e-9);
});
t('wing cloud: a closed wing outline; the painter fills a soft, deterministic, non-empty card', () => {
  const poly = wingOutline();
  assert.ok(poly.length > 40 && poly.every((p) => p.every(Number.isFinite)));
  const paint = () => { const N = makeNoise(77); const img = { data: new Uint8ClampedArray(96 * 48 * 4), width: 96, height: 48 }; return paintWingCloud(img, (x, y) => N.fbm(x, y, 6), smooth).data; };
  const a = paint(), b = paint();
  let cover = 0, edge = 0;
  for (let i = 3; i < a.length; i += 4) { if (a[i] > 128) cover++; if (a[i] > 0 && a[i] < 200) edge++; assert.equal(a[i], b[i]); }
  const px = a.length / 4;
  assert.ok(cover > px * 0.15 && cover < px * 0.7, `cover ${cover}/${px}`);
  assert.ok(edge > px * 0.05, 'soft edges');
  assert.equal(a[3], 0, 'the corners are clear sky');
});
console.log(`\n${n} checks passed`);
