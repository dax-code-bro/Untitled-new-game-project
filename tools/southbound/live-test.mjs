// End-to-end test of the live feed, all local: api/sb-live.js on a local server, the game's watcher
// (src/core/watch.js) in a page drawing WebGL frames, and Claude's watcher (live.mjs) following it.
// Checks: updates arrive, pictures are saved, a note from Claude shows in the game, a message typed with
// Y reaches the watcher, and a body under the ground is caught.   node tools/southbound/live-test.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(new URL(import.meta.url).pathname);
const handler = require(path.join(here, '../../api/sb-live.js'));
const watchSrc = fs.readFileSync(path.join(here, '../../site/southbound/src/core/watch.js'));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sblive-'));

const page = `<!doctype html><html><body style="margin:0;background:#000"><canvas id="c" width="640" height="360"></canvas><script type="module">
import { installWatch } from '/watch.js';
const hud = { toast() {} };
let sink = false;
const W = installWatch({ settings: { claudeWatch: true }, saveSettings() {}, hud, automated: false, pause() {}, isFrozen: () => false,
  getState: () => ({ region: 'Mill Creek', pos: [10, sink ? 2 : 6.1, 20], y: sink ? 2 : 6.1, ground: 6.1, mode: 'foot', vehicle: null, speed: 0, wanted: 0, health: 100, money: 500, fps: 60, hour: 12, preset: 'High' }) });
const gl = document.getElementById('c').getContext('webgl2');
let last = performance.now();
const loop = (t) => { gl.clearColor(0.2, 0.5, 0.8, 1); gl.clear(gl.COLOR_BUFFER_BIT); if (W.wantsShot) W.grab(gl.canvas); W.update(Math.min(0.1, (t - last) / 1000), false); last = t; requestAnimationFrame(loop); };
requestAnimationFrame(loop);
window.W = W; window.sinkNow = () => { sink = true; };
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/watch.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(watchSrc); }
  if (u.pathname === '/api/sb-live') {
    let raw = ''; for await (const c of req) raw += c;
    const r2 = { statusCode: 200, setHeader: (k, v) => res.setHeader(k, v), end: (b) => { res.statusCode = r2.statusCode; res.end(b); } };
    return handler({ method: req.method, url: req.url, query: Object.fromEntries(u.searchParams), body: raw ? JSON.parse(raw) : null, headers: req.headers }, r2);
  }
  if (u.pathname === '/api/sb-watch') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[]'); }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page);
});
await new Promise((r) => server.listen(0, r));
const local = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const pg = await browser.newPage();
// the page posts to the public site (it isn't on vercel.app): send that to the local server instead
await pg.route('**/api/sb-*', async (route) => { const u = new URL(route.request().url()); const r = await route.fetch({ url: local + u.pathname + u.search }); await route.fulfill({ response: r }); });
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(local + '/');
await pg.waitForFunction(() => window.W);
const id = await pg.evaluate(() => window.W.liveId);
const env = { ...process.env, SBLIVE_URL: local + '/api/sb-live', SBLIVE_OUT: out };
const watcher = spawn('node', [path.join(here, 'live.mjs'), 'auto'], { env }); // (the lobby finds the feed by itself)
let wout = ''; watcher.stdout.on('data', (d) => { wout += d; }); watcher.stderr.on('data', (d) => { wout += d; });
await pg.waitForTimeout(7000);
await new Promise((r) => spawn('node', [path.join(here, 'live.mjs'), 'say', id, 'Nice try escaping those cops'], { env }).on('exit', r)); // (async: the local server lives in this process)
await pg.waitForTimeout(3000);
const note = await pg.evaluate(() => document.getElementById('claude-note')?.textContent || null);
// the owner types a message: Y, the text, Enter
await pg.keyboard.press('KeyY'); await pg.waitForTimeout(200);
await pg.keyboard.type('the car went through the bridge'); await pg.keyboard.press('Enter');
await pg.waitForTimeout(3500);
await pg.evaluate(() => window.sinkNow());
await pg.waitForTimeout(5500);
watcher.kill();
await browser.close(); server.close();

let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const lines = fs.existsSync(path.join(out, 'live.jsonl')) ? fs.readFileSync(path.join(out, 'live.jsonl'), 'utf8').trim().split('\n') : [];
ok(lines.length >= 5, `updates reach the watcher (${lines.length} in ~19 s)`);
const jpg = path.join(out, 'latest.jpg');
const head = fs.existsSync(jpg) ? fs.readFileSync(jpg).subarray(0, 2).toString('hex') : '';
ok(head === 'ffd8', 'pictures are saved (' + (head ? fs.statSync(jpg).size + ' bytes' : 'none') + ')');
ok(/Nice try escaping those cops/.test(note || ''), "Claude's note shows in the game (" + note + ')');
ok(/OWNER: the car went through the bridge/.test(wout), 'a message typed with Y reaches the watcher');
ok(/BELOW GROUND/.test(wout), 'a body under the ground is caught');
ok(/PLAYING: the owner started/.test(wout), 'the lobby notices the owner started playing');
ok(!errs.length, 'no page errors ' + errs.join(' | '));
console.log('--- watcher output ---\n' + wout.trim());
console.log(fail ? `live test: ${fail} failed` : 'live test: all passed');
process.exit(fail ? 1 : 0);
