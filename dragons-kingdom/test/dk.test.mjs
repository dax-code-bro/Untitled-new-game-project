// Dragons Kingdom render pipeline tests (run: npm test).
// Everything runs at tiny resolutions so the whole suite takes a few minutes
// on a CPU-only machine. All outputs go to a temp folder that is removed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openSession } from '../render/lib/session.mjs';
import { startServer } from '../render/lib/server.mjs';
import { planChunks, splitParts } from '../render/lib/job.mjs';
import { RGBA_TO_YUV_FILTER, probeVideo } from '../render/lib/ffmpeg.mjs';
import { ffmpegPath } from '../render/lib/tools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MINI = path.join(ROOT, 'test', 'fixtures', 'mini-scene.js');
const KINGDOM = path.join(ROOT, 'scenes', 'test-kingdom.js');
const RENDER = path.join(ROOT, 'render', 'render.mjs');
let TMP;
const MARK = `--dk-test-run=${process.pid}`;   // tags our Chromium processes so leftovers can be found

before(() => { TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-test-')); });
after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  spawnSync('pkill', ['-f', MARK]);
});

const tiny = (over = {}) => ({
  name: 'test', width: 320, height: 180, renderWidth: 320, renderHeight: 180, aa: 'fxaa',
  quality: { shadowMapSize: 512, detail: 0.5 }, crf: 18, x264Preset: 'ultrafast', ...over,
});

function psnrPlanes(a, b, W, H) {
  const planes = { Y: [0, W * H], U: [W * H, (W * H) / 4], V: [(W * H * 5) / 4, (W * H) / 4] };
  const out = {};
  for (const [k, [off, n]] of Object.entries(planes)) {
    let se = 0, maxd = 0;
    for (let i = 0; i < n; i++) { const d = a[off + i] - b[off + i]; se += d * d; maxd = Math.max(maxd, Math.abs(d)); }
    out[k] = { psnr: se === 0 ? Infinity : 10 * Math.log10((255 * 255) / (se / n)), maxd };
  }
  return out;
}

function ffmpegRgbaToYuv(rgba, W, H) {
  const r = spawnSync(ffmpegPath(), ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', 'pipe:0',
    '-vf', RGBA_TO_YUV_FILTER, '-f', 'rawvideo', 'pipe:1'], { input: rgba, maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr?.toString());
  return r.stdout;
}

// ------------------------------------------------------------------ (a) ---
test('(a) GPU YUV420 packer matches ffmpeg rgba->yuv420p (PSNR >= 45 dB per plane, dither off)', { timeout: 300000 }, async (t) => {
  const configs = [
    ['test-kingdom native 320x180', KINGDOM, tiny()],
    ['mini-scene upscaled 224x128 -> 320x180 (final-fast path)', MINI, tiny({ renderWidth: 224, renderHeight: 128 })],
  ];
  for (const [label, scene, preset] of configs) {
    const s = await openSession({ scene, resolved: preset, dither: false });
    try {
      for (const frame of [30, 150]) {
        const yuv = (await s.render([frame], 'yuv')).frames.get(frame);
        const rgba = (await s.render([frame], 'rgba')).frames.get(frame);
        assert.equal(yuv.length, (320 * 180 * 3) / 2);
        assert.equal(rgba.length, 320 * 180 * 4);
        const ref = ffmpegRgbaToYuv(rgba, 320, 180);
        const p = psnrPlanes(yuv, ref, 320, 180);
        t.diagnostic(`${label} frame ${frame}: ` + Object.entries(p).map(([k, v]) => `${k} ${v.psnr.toFixed(1)} dB (max diff ${v.maxd})`).join(', '));
        for (const [k, v] of Object.entries(p)) assert.ok(v.psnr >= 45, `${label} frame ${frame} plane ${k}: PSNR ${v.psnr.toFixed(2)} < 45`);
      }
    } finally { await s.close(); }
  }
});

test('(a2) dither is small (+-1 code) and deterministic', { timeout: 120000 }, async () => {
  const off = await openSession({ scene: MINI, resolved: tiny(), dither: false });
  const on = await openSession({ scene: MINI, resolved: tiny(), dither: true, server: off.server, id: 1 });
  try {
    const a = (await off.render([20], 'yuv')).frames.get(20);
    const b = (await on.render([20], 'yuv')).frames.get(20);
    const b2 = (await on.render([20], 'yuv')).frames.get(20);
    assert.ok(b.equals(b2), 'dithered frame not reproducible');
    let changed = 0, maxd = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) changed++; maxd = Math.max(maxd, d); }
    assert.ok(maxd <= 1, `dither changed a value by ${maxd}`);
    assert.ok(changed > a.length * 0.1, 'dither seems to be inactive');
  } finally { await on.close(); await off.close(); }
});

// ------------------------------------------------------------------ (b) ---
test('(b) determinism: same frame is byte-identical regardless of history and browser', { timeout: 300000 }, async () => {
  const server = await startServer({ allowRoots: [path.dirname(KINGDOM)] });
  const A = await openSession({ scene: KINGDOM, resolved: tiny(), server, id: 1 });
  const B = await openSession({ scene: KINGDOM, resolved: tiny(), server, id: 2 });
  try {
    const first = (await A.render([37], 'yuv')).frames.get(37);
    await A.render([5, 200, 12, 36, 38], 'yuv');               // unrelated frames in between
    const again = (await A.render([37], 'yuv')).frames.get(37);
    await B.render([90, 3], 'yuv');                             // a different browser with a different history
    const other = (await B.render([37], 'yuv')).frames.get(37);
    const neighbour = (await B.render([38], 'yuv')).frames.get(38);
    assert.ok(first.equals(again), 'frame 37 differs after rendering other frames in the same browser');
    assert.ok(first.equals(other), 'frame 37 differs between two browsers');
    assert.ok(!first.equals(neighbour), 'frames 37 and 38 are identical - is time advancing?');
    const rgba1 = (await A.render([37], 'rgba')).frames.get(37);
    const rgba2 = (await B.render([37], 'rgba')).frames.get(37);
    assert.ok(rgba1.equals(rgba2), 'RGBA capture differs between browsers');
  } finally { await A.close(); await B.close(); await server.close(); }
});

test('(b2) chunk-warmup scenes: simulation state is identical no matter where the chunk starts', { timeout: 120000 }, async () => {
  const STATEFUL = path.join(ROOT, 'test', 'fixtures', 'stateful-scene.js');
  const s = await openSession({ scene: STATEFUL, resolved: tiny() });
  try {
    const a = (await s.render([30], 'yuv', { chunkStart: 24 })).frames.get(30);
    const b = (await s.render([0, 10, 30, 31], 'yuv', { chunkStart: 0 })).frames;
    const c = (await s.render([30], 'yuv', { chunkStart: 30 })).frames.get(30);
    assert.ok(a.equals(b.get(30)), 'frame 30 depends on where the chunk started');
    assert.ok(a.equals(c));
    assert.ok(!b.get(30).equals(b.get(10)), 'ball did not move');
  } finally { await s.close(); }
});

// ---------------------------------------------------------------- plans ---
test('chunk planning: twos holds every even frame for 2 output frames, parts split on chunk boundaries', () => {
  const c = planChunks({ startFrame: 0, totalFrames: 50, chunkFrames: 24, twos: true });
  assert.deepEqual(c.map((x) => x.count), [24, 24, 2]);
  assert.deepEqual(c[0].order.slice(0, 2), [{ frame: 0, repeat: 2 }, { frame: 2, repeat: 2 }]);
  assert.equal(c.reduce((a, x) => a + x.order.reduce((s, o) => s + o.repeat, 0), 0), 50);
  const odd = planChunks({ startFrame: 3, totalFrames: 4, chunkFrames: 24, twos: true });
  assert.deepEqual(odd[0].order, [{ frame: 2, repeat: 1 }, { frame: 4, repeat: 2 }, { frame: 6, repeat: 1 }]);
  const parts = splitParts(planChunks({ startFrame: 0, totalFrames: 240, chunkFrames: 24, twos: false }), 4);
  assert.equal(parts.length, 4);
  assert.equal(parts.flat().length, 10);
  for (const p of parts) assert.ok(p.length >= 2 && p.length <= 3, `unbalanced parts ${parts.map((x) => x.length)}`);
  assert.deepEqual(parts.flat().map((c) => c.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

// ------------------------------------------------------------- (c) + (d) ---
function runCli(args, { killWhen } = {}) {
  return new Promise((resolve) => {
    // TMPDIR inside the test folder: browser profiles of a killed run get cleaned up with it
    const tmpdir = path.join(TMP, 'tmp');
    fs.mkdirSync(tmpdir, { recursive: true });
    const child = spawn(process.execPath, [RENDER, ...args], {
      env: { ...process.env, TMPDIR: tmpdir, DK_CHROME_ARGS: `${process.env.DK_CHROME_ARGS || ''} ${MARK}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    let timer = null;
    if (killWhen) {
      timer = setInterval(() => { if (killWhen()) { clearInterval(timer); child.kill('SIGKILL'); } }, 100);
    }
    child.on('close', (code, signal) => { if (timer) clearInterval(timer); resolve({ code, signal, out }); });
  });
}

test('(c)+(d) killed job resumes, reuses finished chunks, final file is exact and correctly tagged', { timeout: 600000 }, async (t) => {
  const job = path.join(TMP, 'resume-job');
  const chunks = path.join(job, 'chunks');
  const args = [MINI, '--preset', 'draft', '--size', '320x180', '--seconds', '4', '--chunk-seconds', '0.5',
    '--workers', '2', '--x264-preset', 'ultrafast', '--out', job, '--parts', '2'];
  const done = () => (fs.existsSync(chunks) ? fs.readdirSync(chunks).filter((f) => /^chunk_\d+\.mp4$/.test(f)) : []);

  // 1st run: hard-kill (like a crash / power loss) once 3 chunks are finished
  const r1 = await runCli(args, { killWhen: () => done().length >= 3 });
  assert.equal(r1.signal, 'SIGKILL', `first run was supposed to be killed:\n${r1.out}`);
  await new Promise((r) => setTimeout(r, 1500));
  spawnSync('pkill', ['-f', MARK]);                      // browsers of the killed run, if any survived
  const before = Object.fromEntries(done().map((f) => [f, fs.statSync(path.join(chunks, f)).mtimeMs]));
  const nBefore = Object.keys(before).length;
  assert.ok(nBefore >= 3 && nBefore < 8, `expected a partial job, found ${nBefore} finished chunks`);
  assert.ok(!fs.existsSync(path.join(job, 'resume-job.mp4')), 'final file must not exist after a killed run');
  t.diagnostic(`killed with ${nBefore}/8 chunks finished`);

  // 2nd run: same command resumes
  const r2 = await runCli(args);
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.out, new RegExp(`resuming: ${nBefore} chunk\\(s\\) already finished`));
  for (const [f, mtime] of Object.entries(before)) {
    assert.equal(fs.statSync(path.join(chunks, f)).mtimeMs, mtime, `${f} was re-rendered instead of reused`);
  }
  assert.equal(done().length, 8);
  assert.equal(fs.readdirSync(chunks).filter((f) => f.endsWith('.part')).length, 0, 'leftover .part files');

  // (d) ffprobe the final file
  const v = probeVideo(path.join(job, 'resume-job.mp4'));
  assert.ok(v, 'final file unreadable');
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.width, 320);
  assert.equal(v.height, 180);
  assert.equal(v.r_frame_rate, '24/1');
  assert.equal(v.frames, 96);
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(v.color_space, 'bt709');
  assert.equal(v.color_transfer, 'bt709');
  assert.equal(v.color_primaries, 'bt709');
  assert.equal(v.color_range, 'tv');
  assert.equal(Number(v.format.duration).toFixed(3), '4.000');
  // parts: 2 files, frame counts add up
  const p1 = probeVideo(path.join(job, 'resume-job_part1of2.mp4'));
  const p2 = probeVideo(path.join(job, 'resume-job_part2of2.mp4'));
  assert.equal(p1.frames + p2.frames, 96);
  // third run: everything reused, nothing rendered
  const r3 = await runCli(args);
  assert.equal(r3.code, 0, r3.out);
  assert.match(r3.out, /nothing to render \(all chunks were reused\)/);
});

test('(d2) --twos job: exact frame count, 24 fps output, every odd frame repeats the even one', { timeout: 300000 }, async () => {
  const job = path.join(TMP, 'twos-job');
  const r = await runCli([MINI, '--preset', 'draft', '--size', '320x180', '--seconds', '1.5', '--twos', '--workers', '1',
    '--x264-preset', 'ultrafast', '--crf', '10', '--out', job]);
  assert.equal(r.code, 0, r.out);
  const file = path.join(job, 'twos-job.mp4');
  const v = probeVideo(file);
  assert.equal(v.frames, 36);
  assert.equal(v.r_frame_rate, '24/1');
  // decode: a held frame is (up to compression noise) the same picture as the
  // one before it, while the next new picture differs a lot
  const raw = spawnSync(ffmpegPath(), ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'yuv420p', 'pipe:1'], { maxBuffer: 1 << 28 }).stdout;
  const fsz = (320 * 180 * 3) / 2;
  assert.equal(raw.length, 36 * fsz);
  const frame = (i) => raw.subarray(i * fsz, i * fsz + 320 * 180);   // luma plane
  const mse = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s / a.length; };
  for (let i = 0; i + 2 < 36; i += 2) {
    const hold = mse(frame(i), frame(i + 1)), change = mse(frame(i + 1), frame(i + 2));
    assert.ok(hold < 1.0 && change > 4 * hold, `frame ${i + 1}: hold mse ${hold.toFixed(2)}, next-picture mse ${change.toFixed(2)}`);
  }
});
