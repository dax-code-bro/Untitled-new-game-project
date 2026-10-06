// Cinematic realism stack tests (run with npm test). Tiny resolution; the
// stack's own features (velocity / accumulate motion blur, DOF, GTAO, cascades,
// physical sky, volumetric fog, FFT ocean, grade/LUT, grain) must be
// deterministic, finite and must not touch scenes that do not opt in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openSession } from '../render/lib/session.mjs';
import { startServer } from '../render/lib/server.mjs';
import { writeCube, parseCube } from '../runtime/lib/lut.js';
import { cameraShake, fovFromFocalLength, focalLengthFromFov, cocScale, exposureMultiplier } from '../runtime/lib/camera.js';
import { cinematicFor, resolveCinematic } from '../runtime/cinematic/config.js';
import { gradeColor } from '../runtime/cinematic/colorlut.js';
import { LOOKS } from '../runtime/cinematic/passes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures');
const CIN = path.join(FIX, 'cinematic-scene.js');
const SEA = path.join(FIX, 'cinematic-sea-scene.js');
const STILL = path.join(FIX, 'cinematic-static-scene.js');
const RENDER = path.join(ROOT, 'render', 'render.mjs');
let TMP;

before(() => { TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-cin-test-')); });
after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

const tiny = (over = {}) => ({
  name: 'test', width: 320, height: 180, renderWidth: 320, renderHeight: 180, aa: 'fxaa',
  quality: { shadowMapSize: 512, detail: 0.5 }, crf: 18, x264Preset: 'ultrafast', ...over,
});
async function session(t, o) {
  const s = await openSession(o);
  t.after(() => s.close());
  return s;
}
const frame = async (s, f, cap = 'rgba') => (await s.render([f], cap)).frames.get(f);
const stats = (s) => s.worker.page.evaluate(() => window.dk.debugCinematic());
function diff(a, b) {
  let n = 0, maxd = 0, se = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; maxd = Math.max(maxd, d); se += d * d; }
  return { n, maxd, rms: Math.sqrt(se / a.length) };
}
function lumaStats(rgba) {
  let sum = 0, black = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < n; i++) {
    const y = 0.2126 * rgba[4 * i] + 0.7152 * rgba[4 * i + 1] + 0.0722 * rgba[4 * i + 2];
    sum += y; if (y < 1) black++;
  }
  return { mean: sum / n, black: black / n };
}

// ------------------------------------------------------------ pure math ---
test('(e0) physical camera, shake, config and colour pipeline math', () => {
  // 35 mm on Super 35 (24.89 mm wide, 16:9 = 14.0 mm tall): vertical fov ~22.6 deg; round trip
  const fov = fovFromFocalLength(35, 'super35');
  assert.ok(Math.abs(fov - 22.62) < 0.05, `fov ${fov}`);
  assert.ok(Math.abs(focalLengthFromFov(fov, 'super35') - 35) < 1e-9);
  // 50 mm f/2.8 focused at 5 m on S35 at 4K: blur of a point at infinity ~28 px
  const K = cocScale({ focalLength: 50, fstop: 2.8, focus: 5, sensorWidth: 24.89, imageWidth: 3840 });
  assert.ok(K > 26 && K < 30, `coc ${K}`);
  assert.equal(exposureMultiplier({ iso: 1600 }), 2);
  assert.equal(exposureMultiplier({ fstop: 5.6, nd: 0 }), 0.25);
  assert.equal(exposureMultiplier({ fstop: 5.6 }), 1);          // nd 'auto': exposure independent of the f-stop
  // shake: deterministic, smooth, bounded
  const a = cameraShake(12.5, { kind: 'handheld', seed: 4 }), b = cameraShake(12.5, { kind: 'handheld', seed: 4 });
  assert.deepEqual(a, b);
  const c = cameraShake(12.5 + 1 / 240, { kind: 'handheld', seed: 4 });
  assert.ok(Math.abs(a.pitch - c.pitch) < 0.0005, 'shake jumps between sub-frames');
  for (let t = 0; t < 60; t += 0.37) { const s = cameraShake(t, { kind: 'dragonback' }); assert.ok(Math.abs(s.roll) < 0.1 && Math.abs(s.y) < 1); }
  // config: presets, overrides, CLI
  assert.equal(resolveCinematic(undefined), null);
  assert.equal(resolveCinematic(true).motionBlur.mode, 'velocity');
  assert.equal(cinematicFor({ dof: { samples: 12 } }, 'hero').motionBlur.mode, 'accumulate');
  assert.equal(cinematicFor({ dof: { samples: 12 } }, 'hero').dof.samples, 12);
  assert.equal(cinematicFor(true, 'off'), null);
  assert.throws(() => resolveCinematic('nope'), /unknown cinematic preset/);
  // grade: AgX base maps mid grey to a mid tone, saturates highlights to white, is monotonic
  const g = resolveCinematic(true).grade;
  let prev = -1;
  for (let ev = -10; ev <= 6; ev += 0.5) {
    const y = gradeColor([0.18 * 2 ** ev, 0.18 * 2 ** ev, 0.18 * 2 ** ev], g, LOOKS.cinema, null)[1];
    assert.ok(y >= prev - 1e-9, `grade not monotonic at ${ev} EV`); prev = y;
  }
  const mid = gradeColor([0.18, 0.18, 0.18], g, LOOKS.cinema, null)[1];
  assert.ok(mid > 0.35 && mid < 0.6, `mid grey -> ${mid}`);
  // .cube round trip
  const cube = parseCube(writeCube(5, (r, gg, bb) => [r, gg, bb]));
  assert.equal(cube.size, 5); assert.equal(cube.data.length, 5 ** 3 * 4);
  assert.throws(() => parseCube('LUT_3D_SIZE 2\n0 0 0\n'), /expected 8 entries/);
});

// ----------------------------------------------------------- determinism ---
test('(e1) cinematic stack is deterministic: a frame is byte-identical whatever was rendered before and in another browser', { timeout: 600000 }, async (t) => {
  for (const [label, scene, f] of [['sea fixture (ocean, sky, fog, cascades, MB, DOF, grain)', SEA, 30], ['skinned / instanced / vertex-animated fixture', CIN, 37]]) {
    const server = await startServer({ allowRoots: [FIX] });
    t.after(() => server.close());
    const A = await session(t, { scene, resolved: tiny(), server, id: 1 });
    const B = await session(t, { scene, resolved: tiny(), server, id: 2 });
    const first = await frame(A, f);
    await A.render([3, f + 20, 12, f - 1], 'yuv');
    const again = await frame(A, f);
    await B.render([f + 25, 2], 'yuv');
    const other = await frame(B, f);
    const next = await frame(B, f + 1);
    t.diagnostic(`${label}: frame ${f} vs after others ${diff(first, again).n} px differ, vs other browser ${diff(first, other).n}`);
    assert.ok(first.equals(again), `${label}: frame ${f} differs after rendering other frames`);
    assert.ok(first.equals(other), `${label}: frame ${f} differs between two browsers`);
    assert.ok(!first.equals(next), `${label}: frames ${f} and ${f + 1} identical - is time advancing?`);
    const y8a = await frame(A, f, 'yuv'), y8b = await frame(B, f, 'yuv');
    assert.ok(y8a.equals(y8b), `${label}: YUV capture differs between browsers`);
  }
});

// ------------------------------------------------------------- sanity ---
test('(e2) every float buffer of the stack stays finite and pictures are neither black nor blown out', { timeout: 600000 }, async (t) => {
  const cases = [
    ['sea fixture', SEA, 40, undefined],
    ['sea fixture, accumulate x4', SEA, 40, { motionBlur: { mode: 'accumulate', accumulateSamples: 4 } }],
    ['skinned fixture, all lens effects on', CIN, 20, { lensFx: { distortion: 0.08 }, bloom: { halation: 0.3 }, shadows: { cascades: 3 } }],
    ['static fixture, ACES + CDL', STILL, 5, { grade: { toneMapping: 'aces', cdl: { slope: [1.1, 1, 0.9], power: 1.1, saturation: 1.2 } } }],
  ];
  for (const [label, scene, f, cin] of cases) {
    const s = await session(t, { scene, resolved: tiny(), ...(cin ? { cinematic: cin } : {}) });
    const rgba = await frame(s, f);
    const { shaderErrors, ...st } = await stats(s);
    assert.equal(shaderErrors, 0, `${label}: ${shaderErrors} shader programs failed to compile`);
    const l = lumaStats(rgba);
    t.diagnostic(`${label}: mean luma ${l.mean.toFixed(1)}, black ${(100 * l.black).toFixed(2)}%, buffers ${Object.keys(st).join(' ')}`);
    for (const [k, v] of Object.entries(st)) {
      assert.equal(v.nan, 0, `${label}: ${k} has ${v.nan} NaN values`);
      assert.equal(v.inf, 0, `${label}: ${k} has ${v.inf} infinite values`);
    }
    assert.ok(Object.keys(st).length >= 4, `${label}: too few buffers checked`);
    assert.ok(l.mean > 15 && l.mean < 235, `${label}: mean luma ${l.mean}`);
    assert.ok(l.black < 0.01, `${label}: ${(100 * l.black).toFixed(2)}% black pixels`);
    await s.close();
  }
});

// -------------------------------------------------------------- grain ---
test('(e3) sensor grain: new pattern every frame, deterministic, absent when off, stronger at high ISO', { timeout: 300000 }, async (t) => {
  // grain is resolution-aware (at 320 px a 4K grain averages out); size 12 = one 4K-sized grain per pixel here
  const G = { size: 12 };
  const on = await session(t, { scene: STILL, resolved: tiny(), cinematic: { dof: { enabled: false }, grain: G } });
  const a10 = await frame(on, 10), a11 = await frame(on, 11), a10b = await frame(on, 10);
  assert.ok(a10.equals(a10b), 'grain is not reproducible');
  const d = diff(a10, a11);
  t.diagnostic(`grain frame 10 vs 11: ${d.n} values differ, rms ${d.rms.toFixed(2)}, max ${d.maxd}`);
  assert.ok(d.n > a10.length * 0.2, 'grain does not change between frames');
  assert.ok(d.maxd < 40, `grain too strong (max ${d.maxd} codes)`);
  const off = await session(t, { scene: STILL, resolved: tiny(), cinematic: { grain: { amount: 0 }, dof: { enabled: false } }, server: on.server, id: 1 });
  const b10 = await frame(off, 10), b11 = await frame(off, 11);
  assert.ok(b10.equals(b11), 'without grain (and nothing moving) frames 10 and 11 must be identical');
  // ISO 3200 with 2 stops less light (same picture brightness): a noisier sensor
  const dir = fs.mkdtempSync(path.join(TMP, 'iso-'));
  const src = fs.readFileSync(STILL, 'utf8').replace('ctx.lens.focus = 14;', 'ctx.lens.focus = 14; ctx.lens.iso = 3200; ctx.lens.exposureComp = -2;');
  fs.writeFileSync(path.join(dir, 'scene.js'), src);
  const hi = await session(t, { scene: path.join(dir, 'scene.js'), resolved: tiny(), cinematic: { dof: { enabled: false }, grain: G } });
  const hiOff = await session(t, { scene: path.join(dir, 'scene.js'), resolved: tiny(), cinematic: { dof: { enabled: false }, grain: { amount: 0 } }, server: hi.server, id: 1 });
  const dLo = diff(a10, b10), dHi = diff(await frame(hi, 10), await frame(hiOff, 10));
  t.diagnostic(`grain vs clean picture: ISO 800 rms ${dLo.rms.toFixed(2)} codes, ISO 3200 rms ${dHi.rms.toFixed(2)} codes`);
  assert.ok(dLo.rms > 0.3, 'grain invisible at ISO 800');
  assert.ok(dHi.rms > dLo.rms * 1.3, 'ISO 3200 is not noisier than ISO 800');
});

// ---------------------------------------------------------------- LUTs ---
test('(e4) .cube LUTs: identity LUT changes nothing, an inverting LUT inverts, a LUT file next to the scene loads', { timeout: 300000 }, async (t) => {
  const base = { grain: { amount: 0 }, dof: { enabled: false }, bloom: { intensity: 0 }, lensFx: { chromaticAberration: 0, vignette: 0 } };
  const plain = await session(t, { scene: STILL, resolved: tiny(), cinematic: base });
  const p = await frame(plain, 3);
  const id = parseCube(writeCube(17, (r, g, b) => [r, g, b]));
  const ident = await session(t, { scene: STILL, resolved: tiny(), cinematic: { ...base, grade: { lut: { ...id, data: Array.from(id.data) } } }, server: plain.server, id: 1 });
  const q = await frame(ident, 3);
  const d = diff(p, q);
  t.diagnostic(`identity LUT vs none: ${d.n} values differ, max ${d.maxd}`);
  assert.ok(d.maxd <= 2, `identity LUT changed the picture by ${d.maxd} codes`);
  // a file next to the scene (relative path in meta.cinematic.grade.lut), inverting the picture
  const dir = fs.mkdtempSync(path.join(TMP, 'lut-'));
  fs.writeFileSync(path.join(dir, 'invert.cube'), writeCube(17, (r, g, b) => [1 - r, 1 - g, 1 - b], 'invert'));
  const src = fs.readFileSync(STILL, 'utf8').replace("cinematic: true", `cinematic: ${JSON.stringify({ ...base, grade: { lut: './invert.cube' } })}`);
  fs.writeFileSync(path.join(dir, 'scene.js'), src);
  const inv = await session(t, { scene: path.join(dir, 'scene.js'), resolved: tiny() });
  const r = await frame(inv, 3);
  let maxd = 0;
  for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 3; k++) maxd = Math.max(maxd, Math.abs(255 - p[i + k] - r[i + k]));
  t.diagnostic(`inverting LUT: max |255 - plain - inverted| = ${maxd}`);
  assert.ok(maxd <= 3, `inverting LUT off by ${maxd} codes`);
});

// --------------------------------------------------------- motion blur ---
test('(e5) motion blur: a still picture is left alone, moving things are blurred, accumulate mode is deterministic', { timeout: 600000 }, async (t) => {
  const quiet = { grain: { amount: 0 }, dof: { enabled: false } };
  const mb = await session(t, { scene: STILL, resolved: tiny(), cinematic: quiet });
  const nomb = await session(t, { scene: STILL, resolved: tiny(), cinematic: { ...quiet, motionBlur: { mode: 'off' } }, server: mb.server, id: 1 });
  const a = await frame(mb, 8), b = await frame(nomb, 8);
  const ds = diff(a, b);
  t.diagnostic(`static scene, velocity MB on vs off: ${ds.n} values differ (max ${ds.maxd})`);
  assert.ok(ds.maxd <= 1, 'motion blur changed a picture in which nothing moves');
  const m1 = await session(t, { scene: CIN, resolved: tiny(), cinematic: quiet, server: mb.server, id: 2 });
  const m0 = await session(t, { scene: CIN, resolved: tiny(), cinematic: { ...quiet, motionBlur: { mode: 'off' } }, server: mb.server, id: 3 });
  const c1 = await frame(m1, 40), c0 = await frame(m0, 40);
  let big = 0;
  for (let i = 0; i < c1.length; i++) if (Math.abs(c1[i] - c0[i]) > 8) big++;
  t.diagnostic(`moving scene: ${(100 * big / c1.length).toFixed(1)}% of values change by > 8 codes with motion blur`);
  assert.ok(big > c1.length * 0.01, 'moving objects are not blurred');
  // accumulate: two browsers agree
  const h1 = await session(t, { scene: CIN, resolved: tiny(), cinematic: { ...quiet, preset: 'hero', motionBlur: { accumulateSamples: 4 } }, server: mb.server, id: 4 });
  const h2 = await session(t, { scene: CIN, resolved: tiny(), cinematic: { ...quiet, preset: 'hero', motionBlur: { accumulateSamples: 4 } }, server: mb.server, id: 5 });
  await h2.render([5], 'yuv');
  const x1 = await frame(h1, 40), x2 = await frame(h2, 40);
  assert.ok(x1.equals(x2), 'accumulate mode differs between browsers');
  assert.ok(!x1.equals(c1), 'accumulate mode gives the same picture as velocity mode?');
});

test('(e6) chunk-warmup scene with velocity motion blur: identical whatever the chunk start', { timeout: 300000 }, async (t) => {
  const s = await session(t, { scene: path.join(FIX, 'stateful-scene.js'), resolved: tiny(), cinematic: 'on' });
  const a = (await s.render([30], 'yuv', { chunkStart: 24 })).frames.get(30);
  const b = (await s.render([0, 10, 30, 31], 'yuv', { chunkStart: 0 })).frames;
  const c = (await s.render([30], 'yuv', { chunkStart: 30 })).frames.get(30);
  assert.ok(a.equals(b.get(30)), 'frame 30 depends on where the chunk started');
  assert.ok(a.equals(c), 'frame 30 rendered as the first frame of a chunk differs');
  assert.ok(!b.get(30).equals(b.get(10)));
});

test('(e7) scenes without meta.cinematic are untouched; --cinematic off|<preset> on the command line', { timeout: 300000 }, async (t) => {
  const plain = await session(t, { scene: path.join(FIX, 'mini-scene.js'), resolved: tiny() });
  assert.equal(plain.info.cinematic, null, 'a scene without meta.cinematic got the cinematic stack');
  await plain.close();
  const outs = {};
  for (const mode of ['off', 'preview']) {
    const png = path.join(TMP, `still-${mode}.png`);
    const r = spawnSync(process.execPath, [RENDER, '--still', STILL, '--time', '0.5', '--preset', 'draft', '--size', '320x180', '--cinematic', mode, '--png', png], { encoding: 'utf8', cwd: ROOT });
    assert.equal(r.status, 0, r.stderr);
    outs[mode] = fs.readFileSync(png);
  }
  assert.ok(!outs.off.equals(outs.preview), '--cinematic off and preview gave the same picture');
  const bad = spawnSync(process.execPath, [RENDER, '--still', STILL, '--cinematic', 'sparkly', '--png', path.join(TMP, 'x.png')], { encoding: 'utf8', cwd: ROOT });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--cinematic must be/);
});

test('(e8) fast image-based lighting (baked SH + equirect) stays close to three.js PMREM lookups', { timeout: 300000 }, async (t) => {
  const quiet = { grain: { amount: 0 }, motionBlur: { mode: 'off' } };
  const fast = await session(t, { scene: SEA, resolved: tiny(), cinematic: { ...quiet, ibl: 'fast' } });
  const exact = await session(t, { scene: SEA, resolved: tiny(), cinematic: { ...quiet, ibl: 'exact' }, server: fast.server, id: 1 });
  const a = await frame(fast, 20), b = await frame(exact, 20);
  const d = diff(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  t.diagnostic(`fast vs exact IBL: mean |diff| ${(sum / a.length).toFixed(2)} codes, max ${d.maxd}, ${(100 * d.n / a.length).toFixed(1)}% of values differ`);
  assert.ok(!a.equals(b), 'fast IBL path not active?');
  assert.ok(sum / a.length < 3, `fast IBL differs by ${(sum / a.length).toFixed(2)} codes on average`);
});
