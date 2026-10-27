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
import { faceReadability, cutCheck } from '../audit.js';
import { wingOutline, paintWingCloud } from '../sets/wing-cloud.js';
import { periodicNoise, periodicCells, paintCloudDeck, paintCloudDetail } from '../sets/cloud-deck.js';
import { meadowPattern } from '../sets/meadow.js';
import { cloudDeckMeshes } from '../sets/cloud-deck-mesh.js';
import { fieldsVoronoi, landUse, hedgePlacements, FIELD_USE } from '../sets/farmland.js';
import { solveFraming, suggestFrom } from '../framing.js';
import { heldList, placeInHands } from '../handprops.js';
import * as THREE from 'three';
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
t('cloud deck: periodic noise + cells tile seamlessly; the painted deck is broken cloud, deterministic', () => {
  const N = periodicNoise(5), C = periodicCells(5);
  for (const [u, v] of [[0.13, 0.71], [0.999, 0.02], [0.5, 0.5]]) {
    assert.ok(Math.abs(N.fbm(u, v, 7, 11, 6) - N.fbm(u + 1, v - 1, 7, 11, 6)) < 1e-9, 'fbm tiles');
    const a = C(u, v, 13, 18), b = C(u + 1, v + 2, 13, 18);
    assert.ok(Math.abs(a.f1 - b.f1) < 1e-9 && Math.abs(a.f2 - b.f2) < 1e-9 && a.id === b.id && a.f2 >= a.f1, 'cells tile');
  }
  const paint = () => paintCloudDeck({ data: new Uint8ClampedArray(64 * 64 * 4), width: 64, height: 64 }).data;
  const a = paint(), b = paint();
  let cover = 0, dark = 0;
  for (let i = 0; i < a.length; i += 4) { assert.equal(a[i + 3], b[i + 3]); assert.equal(a[i], b[i]); if (a[i + 3] > 128) cover++; if (a[i + 3] > 128 && a[i] < 200) dark++; }
  const px = a.length / 4;
  assert.ok(cover > px * 0.35 && cover < px * 0.92, `cover ${cover}/${px}`);           // broken, not overcast-flat
  assert.ok(dark > px * 0.05, `dark cores ${dark}/${px}`);
  // the tile's edges continue across the seam (left column next to the right one)
  let seam = 0; for (let y = 0; y < 64; y++) seam += Math.abs(a[(y * 64) * 4 + 3] - a[(y * 64 + 63) * 4 + 3]);
  assert.ok(seam / 64 < 60, `seam alpha step ${seam / 64}`);
  const d = paintCloudDetail({ data: new Uint8ClampedArray(32 * 32 * 4), width: 32, height: 32 }).data;
  for (let i = 0; i < d.length; i += 4) assert.ok(d[i] >= 178 && d[i] <= 255);
});
t('cloud deck card: horizontal facing down at its height, warm toward the sun, faded at the edges, tagged', () => {
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) });
  const D = { when: 'clouds', y: 3500, size: 160000, tile: 14000, detail: 1250, center: [0, 80000], home: [0, 300], yaw: -25, color: [0.95, 0.86, 0.82], edgeFade: 0.3,
    glow: { az: 95, power: 1.5, sun: [1.7, 1.25, 0.85], away: [0.8, 0.85, 0.95] }, paint: { cells: [29, 41], sub: [73, 103] } };
  const { deck, veil } = cloudDeckMeshes(D, { canvas, texSize: 16 });
  deck.updateMatrixWorld(true);
  assert.ok(new THREE.Vector3(0, 0, 1).transformDirection(deck.matrixWorld).y < -0.999, 'faces down');
  const P = deck.geometry.attributes.position, C = deck.geometry.attributes.color, v = new THREE.Vector3();
  assert.equal(C.itemSize, 4);
  let east = null, west = null, centre = null, corner = null;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(deck.matrixWorld);
    assert.ok(Math.abs(v.y - 3500) < 1e-6);
    const lx = P.getX(i), ly = P.getY(i), a = C.getW(i);
    if (Math.abs(lx) < 1 && Math.abs(ly) < 1) centre = a;
    if (Math.abs(lx) > 79999 && Math.abs(ly) > 79999) corner = a;
    if (Math.abs(v.z - 20000) < 2000 && v.x > 30000) east = C.getX(i) / C.getZ(i);
    if (Math.abs(v.z - 20000) < 2000 && v.x < -30000) west = C.getX(i) / C.getZ(i);
  }
  assert.equal(centre, 1); assert.equal(corner, 0);
  assert.ok(east > 1.5 && west < 1.0, `east r/b ${east}, west ${west}`);
  assert.equal(deck.userData.when, 'clouds'); assert.equal(veil, null);
  const plain = cloudDeckMeshes({ y: 520, size: 64000, tile: 20000, detail: 1250, center: [-24000, 8000], yaw: 20, color: [1, 1, 1], veil: [0.8, 0.82, 0.86] }, { canvas, texSize: 16 });
  assert.ok(!plain.deck.geometry.attributes.color && plain.veil && Math.abs(plain.veil.position.y - 970) < 1e-9);
});
t('meadow: a deterministic pasture patchwork - varied, bounded colour, worn soil only on the track and molehills', () => {
  const A = meadowPattern(31), B = meadowPattern(31);
  let lo = 9, hi = 0, soil = 0, n = 0;
  for (let z = 0; z < 80; z += 0.37) for (let x = -190; x < -80; x += 0.53) {
    const c = A.color(x, z), d = B.color(x, z), so = A.soil(x, z); n++;
    assert.deepEqual(c, d);
    for (const v of c) { assert.ok(Number.isFinite(v) && v > 0.3 && v < 1.6, `colour ${v}`); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    assert.ok(so >= 0 && so <= 1); if (so > 0.3) soil++;
  }
  assert.ok(hi - lo > 0.4, `contrast ${lo}..${hi}`);
  assert.ok(soil > n * 0.002 && soil < n * 0.08, `worn ${soil}/${n}`);
  assert.ok(A.soil(-130, A.track(-130)) > 0.2, 'the track is worn at its centre line');
});
t('farmland: deterministic irregular fields of plausible size; hedges only on the boundaries', () => {
  const F = fieldsVoronoi({ cell: 64, rot: 0.22, stretch: 1.7, seed: 3 });
  const ids = new Set(); let near = 0, n = 0;
  for (let z = -400; z < 400; z += 4) for (let x = -400; x < 400; x += 4) {
    const f = F(x, z); n++;
    assert.ok(f.id >= 0 && f.id < 1 && f.edge >= 0 && Number.isFinite(f.edge));
    ids.add(f.id.toFixed(9)); if (f.edge < 1.5) near++;
  }
  // 800 x 800 m in 64 m cells: ~150 fields; ~10 % of the land within 1.5 m of a boundary (edge is a
  // lower bound of the true distance: (d2 - d1) / 2, so a little more reads as near)
  assert.ok(ids.size > 80 && ids.size < 260, `fields ${ids.size}`);
  assert.ok(near / n > 0.04 && near / n < 0.2, `boundary fraction ${near / n}`);
  assert.deepEqual(F(12.3, -45.6), fieldsVoronoi({ cell: 64, rot: 0.22, stretch: 1.7, seed: 3 })(12.3, -45.6));
  const LU = landUse(F, [0.5, 0.7, 0.9]);
  const kinds = new Set(); for (let x = -400; x < 400; x += 16) kinds.add(LU(x, 37).k);
  assert.ok([...kinds].every((k) => FIELD_USE[k]) && kinds.size >= 3);
  const h = hedgePlacements({ x: [-100, 100], z: [-100, 100], F, H: () => 2, seed: 41, treeP: 0.03 });
  const h2 = hedgePlacements({ x: [-100, 100], z: [-100, 100], F, H: () => 2, seed: 41, treeP: 0.03 });
  assert.equal(h.count, h2.count);
  assert.ok(h.count > 200, `bushes ${h.count}`);
  for (const b of h.bushes.flat()) assert.ok(F(b.p[0], b.p[2]).edge <= 0.75 + 1e-9);
});
t('framing: two subjects land on their screen places; a side that cannot hold them gets a better suggestion', () => {
  // the chamber's 1A-22 case: the hatchling's head low in front, Abby's (crouched) beyond it
  const P = { h: [-0.1, 0.56, 0.26], a: [-0.5, 0.95, 1.72] };
  const env = { point: (k) => new THREE.Vector3(...P[k]) };
  const B = [[-3.35, 0.25, -2.85], [3.35, 5.2, 2.85]];
  const good = { subjects: [['h', [0.3, -0.3]], ['a', [-0.15, 0.55]]], from: 22, height: 0.6, dist: 1.2 };
  const r = solveFraming(good, 50, env, 0, 16 / 9, 24.89, B);
  assert.ok(r.worst < 0.12, `held framing ${r.worst}`);
  for (let k = 0; k < 3; k++) assert.ok(r.pos.getComponent(k) >= B[0][k] - 1e-3 && r.pos.getComponent(k) <= B[1][k] + 1e-3, 'inside the room');
  assert.ok(r.pos.distanceTo(new THREE.Vector3(...P.h)) > 0.55, 'clear of the subject');
  assert.deepEqual(solveFraming(good, 50, env, 0, 16 / 9, 24.89, B).pos.toArray(), r.pos.toArray(), 'deterministic');
  // the first authored side (320) put them the wrong way round; the search finds a side that holds it
  const bad = { subjects: [['h', [0.42, -0.05]], ['a', [-0.35, 0.25]]], from: 320, height: 0.62 };
  const w0 = solveFraming(bad, 65, env, 0, 16 / 9, 24.89, B).worst;
  const alt = suggestFrom(bad, 65, env, 0, B);
  assert.ok(w0 > 0.5 && alt.worst < w0 * 0.3, `suggestion ${JSON.stringify(alt)} vs ${w0}`);
});
t('framing search + clear: a fan of starts beats the trapped single start; no subject hidden behind another actor', () => {
  // the chamber's 1A-28 / 1A-27 cases (approximate heads): Abby crouched at the nest's south board, Remi
  // standing beside her, Alexandria seated east, the hatchling between
  const P = { a: [-0.5, 0.98, 1.72], x: [1.2, 1.2, -0.14], h: [0.12, 0.47, 0.14], hh: [-0.08, 0.5, 0.24], 'remi.head': [0.2, 1.68, 1.9], 'remi.chest': [0.2, 1.25, 1.9] };
  const env = { point: (k) => new THREE.Vector3(...P[k]), occluders: () => ['remi.head', 'remi.chest'] };
  const B = [[-3.35, 0.25, -2.85], [3.35, 5.2, 2.85]];
  const tanH = 24.89 / 2 / 28;
  const hidden = (r) => {
    const cam = new THREE.PerspectiveCamera(2 * Math.atan(tanH / (16 / 9)) * 180 / Math.PI, 16 / 9, 0.05, 100);
    cam.position.copy(r.pos); cam.lookAt(r.look); cam.updateMatrixWorld(true);
    const s = new THREE.Vector3(...P.a).project(cam), o = new THREE.Vector3(...P['remi.chest']).project(cam);
    const ds = r.pos.distanceTo(new THREE.Vector3(...P.a)), dO = r.pos.distanceTo(new THREE.Vector3(...P['remi.chest']));
    return dO < ds && Math.hypot(s.x - o.x, (s.y - o.y) / 1.78) < 0.22 / (dO * tanH) + 0.12 / (ds * tanH) - 1e-3;
  };
  const fr28 = { subjects: [['a', [-0.45, -0.05]], ['x', [0.5, 0.05]], ['h', [0.0, -0.4]]], from: 195, height: 2.7 };
  assert.ok(hidden(solveFraming(fr28, 28, env, 0, 16 / 9, 24.89, B)), 'the plain solve reproduces 1A-28 (Abby behind Remi)');
  const c = solveFraming({ ...fr28, search: true, clear: true }, 28, env, 0, 16 / 9, 24.89, B);
  assert.ok(!hidden(c), 'search + clear keeps Abby clear of Remi');
  assert.deepEqual(solveFraming({ ...fr28, search: true, clear: true }, 28, env, 0, 16 / 9, 24.89, B).pos.toArray(), c.pos.toArray(), 'deterministic');
  const fr27 = { subjects: [['a', [-0.6, 0.2]], ['x', [0.55, 0.35]], ['hh', [0.0, -0.32]]], from: 182, height: 1.0 };
  const w0 = solveFraming(fr27, 40, env, 0, 16 / 9, 24.89, B).worst, w1 = solveFraming({ ...fr27, search: true }, 40, env, 0, 16 / 9, 24.89, B).worst;
  assert.ok(w1 < w0 - 0.05, `search ${w1} vs single start ${w0}`);
});
t('previs (Node): a chamber shot previsualised - camera, heads on the screen, a hidden head found', () => {
  // 1A-29's camera behind Remi: Abby crouched beside him is (partly) behind him - the render agreed
  const r = spawnSync(process.execPath, [path.join(HERE, 'previs.mjs'), '--set', 'BIRTHING_CHAMBER', '--only', '1A-29', '--at', '0.5'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1A-29/);
  assert.match(r.stdout, /cam 1\.25, 1\.75, 2\.80/);
  assert.match(r.stdout, /abby .*HIDDEN behind remi/);
});
t('hand props: an object between the posed palms, levelled, offset in the hands\' frame; one-hand and list forms', () => {
  // a mock character facing +x (yaw 90): left hand at z -0.15 (north), right hand at z +0.15 - wrists
  // and knuckles 0.08 m further forward, palms level at 1.0 m
  const root = new THREE.Group(); root.rotation.y = Math.PI / 2; root.updateMatrixWorld(true);
  const bones = {};
  const put = (n, p) => { const o = new THREE.Object3D(); o.position.set(...p); bones[n] = o; o.updateMatrixWorld(true); };
  for (const [sd, z] of [['L', -0.15], ['R', 0.15]]) {
    put(`wrist.${sd}`, [0.3, 1.0, z]);
    for (const f of [2, 3, 4, 5]) put(`finger${f}-1.${sd}`, [0.38, 1.0, z + (f - 3.5) * 0.01]);
  }
  const ch = { root, bone: (n) => bones[n] || null };
  const o = new THREE.Group(); o.visible = false;
  placeInHands(ch, o, { object: 'bowl', offset: [0, -0.03, 0] });
  assert.ok(o.visible);
  assert.ok(o.position.distanceTo(new THREE.Vector3(0.34, 0.97, 0)) < 1e-6, `bowl at ${o.position.toArray()}`);
  const x = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion), y = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
  assert.ok(x.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-6, 'x axis from the left hand to the right');
  assert.ok(y.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-6, 'levelled');
  const cup = new THREE.Group();
  placeInHands(ch, cup, { object: 'cup', hands: 'R' });
  assert.ok(cup.position.distanceTo(new THREE.Vector3(0.34, 1.0, 0.15)) < 1e-6, `cup at ${cup.position.toArray()}`);
  // a parented object gets local coordinates
  const par = new THREE.Group(); par.position.set(1, 0, 0); par.updateMatrixWorld(true); const o2 = new THREE.Group(); par.add(o2);
  placeInHands(ch, o2, {});
  assert.ok(o2.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0.34, 1.0, 0)) < 1e-6);
  assert.deepEqual(heldList({ holds: 'a' }), [{ object: 'a' }]);
  assert.equal(heldList({ holds: [{ object: 'a' }, 'b'] }).length, 2);
  assert.deepEqual(heldList({}), []);
});
t('edit check (cutCheck): a jump cut, a size change that saves it, a crossed eye-line, a reverse along the line', () => {
  // two people 2 m apart on the x axis, B looking at A; frames hold both
  const act = (name, x, sizePx, sx, lookAt = null) => ({ name, inFrame: true, head: [x, 1.6, 0], sizePx, x: sx, x3: x, z3: 0, lookAt });
  const shot = (pos, sa, sb, xa = -0.3, xb = 0.3) => ({ cam: { pos }, actors: [act('a', 0, sa, xa), act('b', 2, sb, xb, 'a')] });
  // the same side, 10 deg apart, 1.2x: a jump cut on the larger subject
  const j = cutCheck(shot([1, 1.6, 4], 60, 50), shot([1.7, 1.6, 4], 72, 60));
  assert.ok(j.flags.some((f) => f.startsWith('JUMP CUT')), j.flags.join('; '));
  // the same cameras but the incoming frame 2x larger: no jump
  assert.ok(!cutCheck(shot([1, 1.6, 4], 60, 50), shot([1.7, 1.6, 4], 120, 100)).flags.length);
  // cameras on both sides of the line a-b (z +4 and z -4), 90 deg apart: the eye-line is crossed
  const c = cutCheck(shot([1, 1.6, 4], 60, 50), shot([1, 1.6, -4], 30, 25, 0.3, -0.3));
  assert.ok(c.flags.some((f) => f.includes('eye-line b - a') || f.includes('eye-line a - b')), c.flags.join('; '));
  assert.ok(cutCheck(shot([1, 1.6, 4], 60, 50), shot([1, 1.6, -4], 30, 25, 0.3, -0.3), 'reverse angle, declared').flags.every((f) => f.endsWith('staging')));
  // a camera on the line itself (behind b, looking at a) flips nothing
  assert.ok(!cutCheck(shot([1, 1.6, 4], 60, 50), shot([5, 1.6, 0.2], 30, 90, 0.0, 0.1)).flags.some((f) => f.includes('eye-line')));
});
console.log(`\n${n} checks passed`);
