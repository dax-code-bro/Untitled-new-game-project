// Dragons Kingdom render pipeline tests (run: npm test).
// Everything runs at tiny resolutions so the whole suite takes a few minutes
// on a CPU-only machine. All outputs go to a temp folder that is removed.
//
// Every browser / server a test opens is registered for cleanup (t.after or
// try/finally) BEFORE anything that can throw, so a failing test can never
// leave a server or browser behind that keeps "npm test" from exiting.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openSession } from '../render/lib/session.mjs';
import { startServer } from '../render/lib/server.mjs';
import { planChunks, splitParts } from '../render/lib/job.mjs';
import { memorySink } from '../render/lib/sinks.mjs';
import { RGBA_TO_YUV_FILTER, probeVideo, encoderArgs, maxCrf } from '../render/lib/ffmpeg.mjs';
import { ffmpegPath } from '../render/lib/tools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures');
const MINI = path.join(FIX, 'mini-scene.js');
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

/** Open a session and register it for cleanup first (the open itself may throw). */
async function session(t, o) {
  const s = await openSession(o);
  t.after(() => s.close());
  return s;
}

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
    const s = await session(t, { scene, resolved: preset, dither: false });
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
  }
});

test('(a2) dither is small (+-1 code) and deterministic', { timeout: 120000 }, async (t) => {
  const off = await session(t, { scene: MINI, resolved: tiny(), dither: false });
  const on = await session(t, { scene: MINI, resolved: tiny(), dither: true, server: off.server, id: 1 });
  const a = (await off.render([20], 'yuv')).frames.get(20);
  const b = (await on.render([20], 'yuv')).frames.get(20);
  const b2 = (await on.render([20], 'yuv')).frames.get(20);
  assert.ok(b.equals(b2), 'dithered frame not reproducible');
  let changed = 0, maxd = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) changed++; maxd = Math.max(maxd, d); }
  assert.ok(maxd <= 1, `dither changed a value by ${maxd}`);
  assert.ok(changed > a.length * 0.1, 'dither seems to be inactive');
});

test('(a3) 10-bit packer: exact yuv420p10le layout, same picture as the 8-bit packer', { timeout: 180000 }, async (t) => {
  const W = 320, H = 180, n = (W * H * 3) / 2;
  for (const [label, preset] of [['native', tiny()], ['upscaled', tiny({ renderWidth: 224, renderHeight: 128 })]]) {
    const s = await session(t, { scene: MINI, resolved: preset, dither: false, bitDepth: 10 });   // 10 bit: half-float all the way
    const y8 = (await s.render([40], 'yuv')).frames.get(40);
    const y10 = (await s.render([40], 'yuv10')).frames.get(40);
    assert.equal(y10.length, n * 2, 'yuv420p10le = 2 bytes per sample');
    let maxd = 0, se = 0, low = 0;
    for (let i = 0; i < n; i++) {
      assert.ok(y10[2 * i + 1] <= 3, `sample ${i}: high byte ${y10[2 * i + 1]} > 3 (not a 10-bit little-endian word)`);
      const v = y10[2 * i] | (y10[2 * i + 1] << 8);
      const [lo, hi] = i < W * H ? [64, 940] : [64, 960];
      assert.ok(v >= lo && v <= hi, `sample ${i} = ${v} outside TV range ${lo}..${hi}`);
      if (v & 3) low++;
      const d = v / 4 - y8[i]; se += d * d; maxd = Math.max(maxd, Math.abs(d));
    }
    t.diagnostic(`${label}: 10-bit/4 vs 8-bit: max ${maxd} code, rms ${Math.sqrt(se / n).toFixed(3)}, ${(100 * low / n).toFixed(0)}% use the 2 extra bits`);
    assert.ok(maxd <= 0.5, `${label}: 10-bit and 8-bit packers disagree by ${maxd} 8-bit codes (plane order / layout?)`);
    assert.ok(low > n * 0.3, `${label}: the low 2 bits are hardly used - not real 10-bit precision`);
  }
});

test('(a4) final-fast upscaler: sharpening adds no halos (output stays inside the edge\'s value range)', { timeout: 120000 }, async (t) => {
  // 2/3 scale like 2560x1440 -> 3840x2160, maximum sharpness, no AA, no dither
  const s = await session(t, { scene: path.join(FIX, 'edge-scene.js'), resolved: tiny({ aa: 'none', renderWidth: 214, renderHeight: 120 }), dither: false, sharpness: 1 });
  const rgba = (await s.render([0], 'rgba')).frames.get(0);
  const lo = Math.round(0.3 * 255), hi = Math.round(0.7 * 255);
  let minG = 255, maxG = 0, minB = 255, maxB = 0, steep = 0;
  for (let i = 0; i < 320 * 180; i++) {
    minG = Math.min(minG, rgba[4 * i + 1]); maxG = Math.max(maxG, rgba[4 * i + 1]);
    minB = Math.min(minB, rgba[4 * i + 2]); maxB = Math.max(maxB, rgba[4 * i + 2]);
  }
  const row = 90 * 320 * 4;
  for (let x = 1; x < 320; x++) steep = Math.max(steep, rgba[row + 4 * x + 2] - rgba[row + 4 * (x - 1) + 2]);
  t.diagnostic(`green ${minG}..${maxG}, blue ${minB}..${maxB} (edge ${lo}..${hi}), steepest blue step ${steep}`);
  for (const [n, v, lim] of [['green min', minG, lo], ['blue min', minB, lo]]) assert.ok(v >= lim - 1, `${n} ${v}: undershoot (dark halo) below ${lim}`);
  for (const [n, v, lim] of [['green max', maxG, hi], ['blue max', maxB, hi]]) assert.ok(v <= lim + 1, `${n} ${v}: overshoot (bright halo) above ${lim}`);
  assert.ok(steep > (hi - lo) * 0.45, 'edge got blurry - is the sharpener running at all?');
});

// ------------------------------------------------------------------ (b) ---
test('(b) determinism: same frame is byte-identical regardless of history and browser', { timeout: 300000 }, async (t) => {
  const server = await startServer({ allowRoots: [path.dirname(KINGDOM)] });
  t.after(() => server.close());     // registered before the browsers: runs after them
  const A = await session(t, { scene: KINGDOM, resolved: tiny(), server, id: 1 });
  const B = await session(t, { scene: KINGDOM, resolved: tiny(), server, id: 2 });
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
});

test('(b2) chunk-warmup scenes: simulation state is identical no matter where the chunk starts', { timeout: 120000 }, async (t) => {
  const s = await session(t, { scene: path.join(FIX, 'stateful-scene.js'), resolved: tiny() });
  const a = (await s.render([30], 'yuv', { chunkStart: 24 })).frames.get(30);
  const b = (await s.render([0, 10, 30, 31], 'yuv', { chunkStart: 0 })).frames;
  const c = (await s.render([30], 'yuv', { chunkStart: 30 })).frames.get(30);
  assert.ok(a.equals(b.get(30)), 'frame 30 depends on where the chunk started');
  assert.ok(a.equals(c));
  assert.ok(!b.get(30).equals(b.get(10)), 'ball did not move');
  // --twos with an odd chunk start renders the even frame BEFORE chunkStart
  // first; with warmupFrames 0 that used to fail with "go back in time"
  const w = await session(t, { scene: path.join(FIX, 'warmup0-scene.js'), resolved: tiny() });
  const odd = (await w.render([8, 10, 12], 'yuv', { chunkStart: 9 })).frames;
  const even = (await w.render([8, 10, 12], 'yuv', { chunkStart: 8 })).frames;
  for (const f of [8, 10, 12]) assert.ok(odd.get(f).equals(even.get(f)), `frame ${f}`);
});

test('(b3) culling: objects animated in update() are culled from THIS frame, not the first one a browser rendered', { timeout: 120000 }, async (t) => {
  // three.js caches culling bounding spheres; the runtime must refresh them
  const scene = path.join(FIX, 'cull-scene.js');
  const A = await session(t, { scene, resolved: tiny(), id: 1 });
  const B = await session(t, { scene, resolved: tiny(), id: 2, server: A.server });
  const fresh = (await A.render([48], 'yuv')).frames.get(48);
  await B.render([0], 'yuv');                                 // flock + banner off-screen here
  const after0 = (await B.render([48], 'yuv')).frames.get(48);
  const bg = (await B.render([0], 'yuv')).frames.get(0);
  let differ = 0;
  for (let i = 0; i < 320 * 180; i++) if (fresh[i] !== after0[i]) differ++;
  assert.equal(differ, 0, `frame 48: ${differ} luma pixels differ depending on what was rendered first`);
  let visible = 0;
  for (let i = 0; i < 320 * 180; i++) if (Math.abs(fresh[i] - bg[i]) > 20) visible++;
  assert.ok(visible > 500, 'flock/banner not visible at frame 48 - fixture broken?');
  // InstancedMesh.count grows in update(): 5 off-screen scouts, then 40 in view
  const cs = path.join(FIX, 'count-scene.js');
  const C = await session(t, { scene: cs, resolved: tiny(), id: 3, server: A.server });
  const D = await session(t, { scene: cs, resolved: tiny(), id: 4, server: A.server });
  const c48 = (await C.render([48], 'yuv')).frames.get(48);
  await D.render([0], 'yuv');
  const d48 = (await D.render([48], 'yuv')).frames.get(48);
  let cdiff = 0, dark = 0;
  for (let i = 0; i < 320 * 180; i++) { if (c48[i] !== d48[i]) cdiff++; if (c48[i] < 60) dark++; }
  assert.equal(cdiff, 0, `instance count: ${cdiff} luma pixels differ depending on what was rendered first`);
  assert.ok(dark > 1000, `swarm not visible at frame 48 (${dark} dark pixels) - fixture broken?`);
});

test('(b4) stateful randomness / wall clock inside update() is reported', { timeout: 120000 }, async (t) => {
  const s = await session(t, { scene: path.join(FIX, 'misuse-scene.js'), resolved: tiny() });
  const { stats } = await s.render([3, 4], 'yuv');
  t.diagnostic(JSON.stringify({ rng: stats.rngInUpdate, clock: stats.clockInUpdate, random: stats.randomInUpdate }));
  assert.equal(stats.rngInUpdate, 4, 'ctx.rng() and a setup-made generator, 2 frames x 2 calls (ctx.makeRng inside update is fine)');
  assert.equal(stats.clockInUpdate, 2, 'Date.now() once per frame');
  assert.equal(stats.randomInUpdate, 2, 'Math.random() once per frame (three.js UUIDs of a helper Object3D must not count)');
  const ok = await session(t, { scene: MINI, resolved: tiny() });
  const clean = (await ok.render([3], 'yuv')).stats;
  assert.deepEqual([clean.rngInUpdate, clean.clockInUpdate, clean.randomInUpdate], [0, 0, 0], 'false alarm on a clean scene');
});

test('(b5) init() waits for asset loads the scene did not await', { timeout: 120000 }, async (t) => {
  const s = await session(t, { scene: path.join(FIX, 'slowload-scene.js'), resolved: tiny() });
  assert.ok(s.info.assetWaitMs >= 500, `init returned after waiting only ${s.info.assetWaitMs} ms`);
  const first = (await s.render([0], 'yuv')).frames.get(0);
  await new Promise((r) => setTimeout(r, 800));
  const later = (await s.render([0], 'yuv')).frames.get(0);
  assert.ok(first.equals(later), 'the first frame was rendered before the assets had arrived');
  let sum = 0;
  for (let i = 0; i < 320 * 180; i++) sum += first[i];
  assert.ok(sum / (320 * 180) > 40, 'picture still black: loads not applied');

  // an un-awaited fetch() whose BODY is big: the headers arrive long before
  // the body (fetch resolves at the headers) - the wait must cover the body
  const dir = path.join(TMP, 'fetch-body');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'big.json'), JSON.stringify({ color: '#22dd55', pad: Array(300000).fill('x'.repeat(100)) }));   // ~31 MB
  const scene = path.join(dir, 'fetch-body-scene.js');
  fs.writeFileSync(scene, `import * as THREE from 'three';
export const meta = { title: 'fetch body fixture', duration: 1 };
let mat;
export async function setup(ctx) {
  mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  q.frustumCulled = false;
  ctx.scene.add(q);
  ctx.camera.position.set(0, 0, 1.2); ctx.camera.lookAt(0, 0, 0);
  fetch(new URL('./big.json', import.meta.url)).then((r) => r.json()).then((d) => mat.color.set(d.color));   // not awaited
}
export function update() {}
`);
  const f = await session(t, { scene, resolved: tiny(), id: 5 });
  const px = (b) => { const o = (90 * 320 + 160) * 4; return [b[o], b[o + 1], b[o + 2]]; };
  const f0 = (await f.render([0], 'rgba')).frames.get(0);
  t.diagnostic(`big fetch body: asset wait ${f.info.assetWaitMs} ms, centre ${px(f0)}`);
  assert.ok(f0[(90 * 320 + 160) * 4 + 1] > f0[(90 * 320 + 160) * 4], `first frame rendered before the fetched body was applied (centre ${px(f0)} is still red)`);
});

test('(b6) shadow cache (ctx.shadows: static set cached, dragon redrawn) is bit-identical to redrawing every frame', { timeout: 300000 }, async (t) => {
  const p = tiny({ quality: { shadowMapSize: 1024, detail: 0.5 } });
  const full = await session(t, { scene: KINGDOM, resolved: p, shadowCache: false, id: 1 });
  const cached = await session(t, { scene: KINGDOM, resolved: p, id: 2, server: full.server });
  const frames = [0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 239];
  const a = (await full.render(frames, 'yuv')).frames;
  const b = (await cached.render(frames.map((_, i) => frames[(i * 4) % frames.length]), 'yuv')).frames;   // other order
  const bad = frames.filter((f) => !a.get(f).equals(b.get(f)));
  assert.deepEqual(bad, [], `frames differing with the shadow cache: ${bad}`);
});

test('(b7) a crashed browser page fails the render instead of hanging it', { timeout: 120000 }, async (t) => {
  // Playwright fires "crash" but never settles a pending page.evaluate()
  const s = await session(t, { scene: MINI, resolved: tiny() });
  const frames = Array.from({ length: 2000 }, (_, i) => i % 96);
  const job = s.render(frames, 'yuv');
  job.catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  const cdp = await s.worker.page.context().newCDPSession(s.worker.page);
  cdp.send('Page.crash').catch(() => {});
  const t0 = Date.now();
  await assert.rejects(Promise.race([job, new Promise((_, rej) => setTimeout(() => rej(new Error('still hanging after 20 s')), 20000))]), /crash/i);
  t.diagnostic(`render rejected ${Date.now() - t0} ms after the crash`);
});

// ------------------------------------------------------------- transport ---
test('frame WebSocket: masked, fragmented binary messages arrive intact and are acknowledged', { timeout: 30000 }, async (t) => {
  const server = await startServer({});
  t.after(() => server.close());
  const sink = memorySink([{ frame: 7, repeat: 1 }]);
  const url = new URL(server.addSink('wstest', sink));
  const payload = crypto.randomBytes(300000);
  const msg = Buffer.concat([Buffer.from([7, 0, 0, 0]), payload]);
  const frame = (opcode, fin, data) => {
    const mask = crypto.randomBytes(4);
    const len = data.length;
    const head = len < 126 ? Buffer.from([0, 0x80 | len]) : len < 65536 ? Buffer.from([0, 0x80 | 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0, 0x80 | 127]), Buffer.from(Array.from({ length: 8 }, (_, i) => Number((BigInt(len) >> BigInt(56 - 8 * i)) & 255n)))]);
    head[0] = (fin ? 0x80 : 0) | opcode;
    const body = Buffer.from(data.map((b, i) => b ^ mask[i & 3]));
    return Buffer.concat([head, mask, body]);
  };
  const sock = net.connect(+url.port, '127.0.0.1');
  t.after(() => sock.destroy());
  await new Promise((r) => sock.once('connect', r));
  sock.write(`GET ${url.pathname} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  let got = Buffer.alloc(0);
  sock.on('data', (d) => { got = Buffer.concat([got, d]); });
  // 3 fragments (binary + 2 continuations), written in small TCP pieces, plus a ping in between
  const wire = Buffer.concat([frame(2, false, msg.subarray(0, 1000)), frame(9, true, Buffer.from('hi')), frame(0, false, msg.subarray(1000, 200000)), frame(0, true, msg.subarray(200000))]);
  for (let i = 0; i < wire.length; i += 7777) sock.write(wire.subarray(i, i + 7777));
  const deadline = Date.now() + 10000;
  while (!got.includes('{"f":7}') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert.match(got.toString('latin1'), /101 Switching Protocols/);
  assert.ok(got.includes('{"f":7}'), 'no ack for frame 7');
  assert.ok(got.includes(Buffer.from([0x8a, 2, 104, 105])), 'no pong');
  assert.ok(sink.frames.get(7).equals(payload), 'payload corrupted');
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
function runCli(args, { killWhen, onSpawn, onData, poll, env = {}, chromeArgs = '' } = {}) {
  return new Promise((resolve) => {
    // TMPDIR inside the test folder: browser profiles of a killed run get cleaned up with it
    const tmpdir = path.join(TMP, 'tmp');
    fs.mkdirSync(tmpdir, { recursive: true });
    const t0 = Date.now();
    const child = spawn(process.execPath, [RENDER, ...args], {
      env: { ...process.env, ...env, TMPDIR: tmpdir, DK_CHROME_ARGS: `${process.env.DK_CHROME_ARGS || ''} ${MARK} ${chromeArgs}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    onSpawn?.(child);
    let out = '';
    child.stdout.on('data', (d) => { out += d; onData?.(out); });
    child.stderr.on('data', (d) => { out += d; onData?.(out); });
    let timer = null;
    if (killWhen) {
      timer = setInterval(() => { if (killWhen()) { clearInterval(timer); child.kill('SIGKILL'); } }, 100);
    }
    const poller = poll ? setInterval(poll, 100) : null;
    child.on('close', (code, signal) => { if (timer) clearInterval(timer); if (poller) clearInterval(poller); resolve({ code, signal, out, ms: Date.now() - t0 }); });
  });
}

test('(c)+(d) killed job resumes, reuses finished chunks, final file is exact and correctly tagged; damaged / foreign jobs are handled', { timeout: 600000 }, async (t) => {
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
  assert.ok(fs.existsSync(path.join(job, 'job.lock')), 'a killed run leaves its (stale) lock behind');
  t.diagnostic(`killed with ${nBefore}/8 chunks finished`);

  // 2nd run: same command resumes (and takes over the stale lock)
  const r2 = await runCli(args);
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.out, new RegExp(`resuming: ${nBefore} chunk\\(s\\) already finished`));
  for (const [f, mtime] of Object.entries(before)) {
    assert.equal(fs.statSync(path.join(chunks, f)).mtimeMs, mtime, `${f} was re-rendered instead of reused`);
  }
  assert.equal(done().length, 8);
  assert.equal(fs.readdirSync(chunks).filter((f) => f.endsWith('.part')).length, 0, 'leftover .part files');
  assert.ok(!fs.existsSync(path.join(job, 'job.lock')), 'lock not released');

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

  // (c2) a chunk damaged on disk (same size, garbage inside, packet count
  // still right) is noticed and re-rendered; the rest is reused
  const victim = path.join(chunks, 'chunk_00003.mp4');
  const buf = fs.readFileSync(victim);
  const mdat = buf.indexOf('mdat');      // payload starts right after the box type: first NAL length field
  for (let i = mdat + 4; i < Math.min(buf.length - 8, mdat + 1500); i++) buf[i] ^= 0x5a;
  fs.writeFileSync(victim, buf);
  const r4 = await runCli(args);
  assert.equal(r4.code, 0, r4.out);
  assert.match(r4.out, /chunk_00003: damaged/);
  assert.match(r4.out, /resuming: 7 chunk\(s\)/);
  assert.equal(probeVideo(path.join(job, 'resume-job.mp4')).frames, 96);

  // (c4) a DIFFERENT job (other clip length) aimed at this folder is refused
  // and nothing is deleted
  const mtimes = Object.fromEntries(done().map((f) => [f, fs.statSync(path.join(chunks, f)).mtimeMs]));
  const other = args.map((a) => (a === '4' ? '3' : a));
  const r5 = await runCli(other);
  assert.equal(r5.code, 1, r5.out);
  assert.match(r5.out, /DIFFERENT render - nothing was deleted/);
  assert.match(r5.out, /totalFrames \(96 -> 72\)/);
  assert.match(r5.out, /--fresh/);
  assert.deepEqual(Object.fromEntries(done().map((f) => [f, fs.statSync(path.join(chunks, f)).mtimeMs])), mtimes, 'chunks were touched');
  assert.ok(fs.existsSync(path.join(job, 'resume-job.mp4')), 'finished video was deleted');
});

test('(c3) a scene stuck in update() is detected by the stall watchdog: retried, then a clear error (no endless wait)', { timeout: 180000 }, async () => {
  const r = await runCli([path.join(FIX, 'hang-scene.js'), '--preset', 'draft', '--size', '320x180', '--seconds', '1',
    '--workers', '1', '--x264-preset', 'ultrafast', '--stall-timeout', '1', '--out', path.join(TMP, 'hang-job')]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no frame finished for/);
  assert.match(r.out, /failed 3 times/);
  // ...but a long chunk-warmup replay (warmupFrames 'all', ~8 s before the
  // first frame of a late chunk) is alive, not stuck: its heartbeat keeps the
  // watchdog (limit here: 2 x 1 s for a first frame) quiet
  const w = await runCli([path.join(FIX, 'longwarmup-scene.js'), '--preset', 'draft', '--size', '320x180', '--start', '120', '--seconds', '0.5',
    '--workers', '1', '--x264-preset', 'ultrafast', '--stall-timeout', '1', '--out', path.join(TMP, 'warmup-job')]);
  assert.equal(w.code, 0, w.out);
  assert.doesNotMatch(w.out, /no frame finished/);
  assert.equal(probeVideo(path.join(TMP, 'warmup-job', 'warmup-job.mp4')).frames, 12);
});

test('(c5) two renders into the same job folder: the second one is refused', { timeout: 180000 }, async () => {
  const job = path.join(TMP, 'lock-job');
  const args = [MINI, '--preset', 'draft', '--size', '320x180', '--seconds', '4', '--workers', '1', '--x264-preset', 'ultrafast', '--out', job];
  const lock = path.join(job, 'job.lock');
  const first = runCli(args);
  const deadline = Date.now() + 60000;
  while (!fs.existsSync(lock) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  assert.ok(fs.existsSync(lock), 'first run never took the lock');
  const second = await runCli(args);
  const r1 = await first;
  assert.equal(second.code, 1, second.out);
  assert.match(second.out, /already being rendered by another process/);
  assert.equal(r1.code, 0, r1.out);
  assert.equal(probeVideo(path.join(job, 'lock-job.mp4')).frames, 96);
});

test('(c6) bad options fail at once, before any rendering', { timeout: 60000 }, async () => {
  const base = [MINI, '--preset', 'draft', '--size', '320x180', '--seconds', '1', '--out', path.join(TMP, 'opt-job')];
  const a = await runCli([...base, '--audio', path.join(TMP, 'no-such-music.wav')]);
  assert.equal(a.code, 1, a.out);
  assert.match(a.out, /--audio .*file not found/);
  assert.ok(a.ms < 15000, `missing --audio noticed only after ${a.ms} ms`);
  assert.doesNotMatch(a.out, /renderer:/, 'browsers were started before checking --audio');
  const c = await runCli([...base, '--crf', '60']);
  assert.equal(c.code, 1, c.out);
  assert.match(c.out, /--crf: "60" is not a valid number from 0 to 51/);
  const c10 = await runCli([...base, '--crf', '55', '--bit-depth', '10']);   // x264 clips 10-bit CRF at 51 too
  assert.equal(c10.code, 1, c10.out);
  assert.match(c10.out, /from 0 to 51/);
  // --still into a folder that does not exist yet (npm run still on a fresh checkout)
  const png = path.join(TMP, 'new-folder', 'sub', 'still.png');
  const st = await runCli(['--still', MINI, '--preset', 'draft', '--size', '320x180', '--time', '1', '--png', png]);
  assert.equal(st.code, 0, st.out);
  assert.ok(fs.statSync(png).size > 1000, 'no PNG written');
});

test('encoder: --crf 0 is really lossless at 8 and 10 bits; 51 is the top of both CRF scales', { timeout: 60000 }, () => {
  assert.equal(maxCrf(8), 51);
  assert.equal(maxCrf(10), 51);
  for (const [bitDepth, input, pix] of [[8, 'yuv', 'yuv420p'], [10, 'yuv10', 'yuv420p10le']]) {
    const raw = spawnSync(ffmpegPath(), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=128x72:rate=24', '-frames:v', '6',
      '-pix_fmt', pix, '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 1 << 26 }).stdout;
    assert.equal(raw.length, 6 * 128 * 72 * 1.5 * (bitDepth === 10 ? 2 : 1));
    const out = path.join(TMP, `lossless${bitDepth}.mp4`);
    const enc = spawnSync(ffmpegPath(), encoderArgs({ width: 128, height: 72, fps: 24, input, bitDepth, crf: 0, preset: 'ultrafast', out }), { input: raw });
    assert.equal(enc.status, 0, enc.stderr?.toString());
    const dec = spawnSync(ffmpegPath(), ['-v', 'error', '-i', out, '-f', 'rawvideo', '-pix_fmt', pix, 'pipe:1'], { maxBuffer: 1 << 26 }).stdout;
    assert.ok(dec.equals(raw), `${bitDepth}-bit --crf 0 is not lossless`);
  }
});

test('(c7) editing a file the scene loads, or switching the renderer, is noticed on resume', { timeout: 180000 }, async () => {
  const dir = path.join(TMP, 'fp-scene');
  fs.mkdirSync(dir, { recursive: true });
  const scene = path.join(dir, 'data-scene.js');
  fs.writeFileSync(scene, `import * as THREE from 'three';
export const meta = { title: 'data fixture', duration: 1 };
export async function setup(ctx) {
  const d = await (await fetch(new URL('./data.json', import.meta.url))).json();   // not an import: only the server sees it
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: d.color }));
  q.frustumCulled = false;
  ctx.scene.add(q);
  ctx.camera.position.set(0, 0, 1.2); ctx.camera.lookAt(0, 0, 0);
}
export function update() {}
`);
  const data = path.join(dir, 'data.json');
  fs.writeFileSync(data, '{"color":"#ff0000"}');
  const args = [scene, '--preset', 'draft', '--size', '320x180', '--seconds', '0.5', '--workers', '1', '--x264-preset', 'ultrafast', '--out', path.join(TMP, 'fp-job')];
  const r1 = await runCli(args);
  assert.equal(r1.code, 0, r1.out);
  fs.writeFileSync(data, '{"color":"#00ff00"}');
  const r2 = await runCli(args);
  assert.equal(r2.code, 1, r2.out);
  assert.match(r2.out, /files edited: .*data\.json/);
  fs.writeFileSync(data, '{"color":"#ff0000"}');
  const r3 = await runCli([...args, '--gpu']);
  assert.equal(r3.code, 1, r3.out);
  assert.match(r3.out, /renderer gpu \(false -> true\)/);
  const r4 = await runCli(args);
  assert.equal(r4.code, 0, r4.out);
  assert.match(r4.out, /nothing to render \(all chunks were reused\)/);
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
  // chunk-warmup scene + --twos + odd start frame (9): used to fail every time
  const w = await runCli([path.join(FIX, 'warmup0-scene.js'), '--preset', 'draft', '--size', '320x180', '--twos', '--start', '0.375',
    '--seconds', '0.5', '--workers', '1', '--x264-preset', 'ultrafast', '--out', path.join(TMP, 'warm-twos-job')]);
  assert.equal(w.code, 0, w.out);
  assert.equal(probeVideo(path.join(TMP, 'warm-twos-job', 'warm-twos-job.mp4')).frames, 12);
});

test('(d3) --bit-depth 10: H.264 High 10, yuv420p10le, BT.709 tags', { timeout: 120000 }, async () => {
  const job = path.join(TMP, 'tenbit-job');
  const r = await runCli([MINI, '--preset', 'draft', '--size', '320x180', '--seconds', '1', '--bit-depth', '10', '--workers', '1',
    '--x264-preset', 'ultrafast', '--out', job]);
  assert.equal(r.code, 0, r.out);
  const v = probeVideo(path.join(job, 'tenbit-job.mp4'));
  assert.equal(v.pix_fmt, 'yuv420p10le');
  assert.equal(v.profile, 'High 10');
  assert.equal(v.frames, 24);
  assert.equal(v.color_space, 'bt709');
  assert.equal(v.color_range, 'tv');
});

// A full-screen colour scene (written into a test folder so it can be edited);
// busy = iterations of deterministic busy work per update() (a slow scene).
function colourScene(file, colour, busy = 0) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `import * as THREE from 'three';
const COLOUR = '${colour}';
export const meta = { title: 'colour fixture', duration: 4 };
let mat, acc = 0;
export async function setup(ctx) {
  mat = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(COLOUR) }, uK: { value: 0 } },
    depthTest: false, depthWrite: false,
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform vec3 uC; uniform float uK; void main(){ gl_FragColor = vec4(uC * 0.5 + uK, 1.0); }',
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.frustumCulled = false;
  ctx.scene.add(m);
}
export function update(t) {
  let x = t;
  for (let i = 0; i < ${busy}; i++) x = (x * 1.000001 + 0.5) % 1000;
  mat.uniforms.uK.value = x * 0;
}
`);
}
/** Colour of the centre pixel of every frame: 'R', 'G', or '?' */
function centreColours(file) {
  const raw = spawnSync(ffmpegPath(), ['-v', 'error', '-i', file, '-vf', 'crop=4:4:158:88,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 26 }).stdout;
  const out = [];
  for (let i = 0; i + 2 < raw.length; i += 3) out.push(raw[i] > raw[i + 1] + 40 ? 'R' : raw[i + 1] > raw[i] + 40 ? 'G' : '?');
  return out.join('');
}

test('(c8) a scene file edited while the job runs: every worker and restart keeps the version the job started with', { timeout: 300000 }, async () => {
  const scene = path.join(TMP, 'edit-scene', 'ver.js');
  colourScene(scene, '#ff0000', 1500000);
  const job = path.join(TMP, 'edit-job');
  const args = [scene, '--preset', 'draft', '--size', '320x180', '--seconds', '3', '--chunk-seconds', '0.5', '--workers', '2',
    '--x264-preset', 'ultrafast', '--out', job];
  let edited = false;
  const r = await runCli(args, {
    onData: (out) => {
      // the moment the job is planned (worker 1 has loaded the scene, worker 2 not yet)
      if (!edited && /job edit-job:/.test(out)) { edited = true; colourScene(scene, '#00ff00', 1500000); }
    },
  });
  assert.equal(r.code, 0, r.out);
  assert.ok(edited, 'scene was not edited during the job');
  const colours = centreColours(path.join(job, 'edit-job.mp4'));
  assert.equal(colours, 'R'.repeat(72), `the video mixes two versions of the scene: ${colours}`);
  assert.match(r.out, /NOTE: .*ver\.js was changed on disk while this job is rendering/);
  // the next run notices the edit, deletes nothing, and says how to continue
  const r2 = await runCli(args);
  assert.equal(r2.code, 1, r2.out);
  assert.match(r2.out, /files edited: .*ver\.js/);
  assert.match(r2.out, /undo the edits to .*ver\.js/);
});

test('(c9) --fresh forgets the files of the job that was in the folder before', { timeout: 300000 }, async () => {
  const e1 = path.join(TMP, 'eps', 'e1', 'shot.js'), e2 = path.join(TMP, 'eps', 'e2', 'shot.js');
  colourScene(e1, '#ff0000');
  colourScene(e2, '#00ff00');
  const job = path.join(TMP, 'shot-job');
  const args = (scene, ...more) => [scene, '--preset', 'draft', '--size', '320x180', '--seconds', '1', '--workers', '1', '--x264-preset', 'ultrafast', '--out', job, ...more];
  assert.equal((await runCli(args(e1))).code, 0);
  const refused = await runCli(args(e2));
  assert.equal(refused.code, 1, refused.out);
  const fresh = await runCli(args(e2, '--fresh'));
  assert.equal(fresh.code, 0, fresh.out);
  fs.appendFileSync(e1, '// edited\n');                 // the OLD job's scene: none of this job's business
  const r = await runCli(args(e2));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /nothing to render \(all chunks were reused\)/);
  fs.rmSync(path.dirname(e1), { recursive: true });
  const r2 = await runCli(args(e2));
  assert.equal(r2.code, 0, r2.out);
  assert.equal(centreColours(path.join(job, 'shot-job.mp4')), 'G'.repeat(24));
});

test('(c10) a frozen browser is killed and restarted; its late events do not kill the new browser', { timeout: 300000 }, async () => {
  const scene = path.join(TMP, 'freeze-scene', 'slow.js');
  colourScene(scene, '#ff0000', 1500000);
  const tag = `--dk-freeze-test=${process.pid}`;
  const job = path.join(TMP, 'freeze-job');
  const chunks = path.join(job, 'chunks');
  let frozen = 0;
  const freeze = () => {     // SIGSTOP the browser's main process (no --type=) once the first chunk is done
    for (const pid of fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
      let cmd = '';
      try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { continue; }
      if (cmd.includes(tag) && !cmd.includes('--type=')) { try { process.kill(+pid, 'SIGSTOP'); frozen = +pid; } catch {} }
    }
  };
  const r = await runCli([scene, '--preset', 'draft', '--size', '320x180', '--seconds', '3', '--chunk-seconds', '0.5', '--workers', '1',
    '--x264-preset', 'ultrafast', '--stall-timeout', '1', '--out', job], {
    chromeArgs: tag,
    env: { DK_CLOSE_TIMEOUT_MS: '2000' },
    poll: () => {
      if (!frozen && fs.existsSync(chunks) && fs.readdirSync(chunks).some((f) => /^chunk_\d+\.mp4$/.test(f))) freeze();
    },
  });
  if (frozen) { try { process.kill(frozen, 'SIGKILL'); } catch {} }
  assert.ok(frozen, 'browser was not frozen');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no frame finished for/);
  assert.match(r.out, /did not close in time/);
  assert.doesNotMatch(r.out, /restart failed/);
  assert.equal(probeVideo(path.join(job, 'freeze-job.mp4')).frames, 72);
});
