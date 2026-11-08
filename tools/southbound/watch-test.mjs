// A quick browser test of "Let Claude watch me play" (src/core/watch.js) on its own, away from the game:
// a picture of a WebGL frame (taken right after drawing, as the game does), a play report, an error
// report and a note from Claude. Requests to the server are intercepted (nothing is sent anywhere).
//   node tools/southbound/watch-test.mjs
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const src = fs.readFileSync(new URL('../../site/southbound/src/core/watch.js', import.meta.url));
const page = `<!doctype html><html><body style="margin:0"><canvas id="c" width="800" height="450"></canvas><script type="module">
import { installWatch } from '/watch.js';
const toasts = [];
const hud = { toast(m) { toasts.push(m); } };
const settings = { claudeWatch: true };
const W = installWatch({ settings, saveSettings() {}, hud, automated: false, getState: () => ({ region: 'Mill Creek', pos: [1, 2, 3], mode: 'foot', wanted: 0, health: 100, money: 500, fps: 60, preset: 'High' }) });
const c = document.getElementById('c');
const gl = c.getContext('webgl2', { preserveDrawingBuffer: false });
const draw = () => { gl.clearColor(0.8, 0.3, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
const frame = () => { draw(); if (W.wantsShot) W.grab(c); }; // what the game's render() does
const pixel = (url) => new Promise((r) => { const im = new Image(); im.onload = () => { const k = document.createElement('canvas'); k.width = im.width; k.height = im.height; const g = k.getContext('2d'); g.drawImage(im, 0, 0); r([im.width, im.height, ...g.getImageData(im.width >> 1, im.height >> 1, 1, 1).data]); }; im.onerror = () => r(null); im.src = url; });
window.run = async () => {
  const out = {};
  // 1. a picture of the frame
  const p = W.capture(); frame(); const url = await p;
  out.shot = url ? { kb: Math.round(url.length / 1024), pixel: await pixel(url) } : null;
  // 2. a play report (three minutes of play), carrying a picture
  hud.toast('Passenger aboard');
  W.update(11, false); W.update(200, false);
  await new Promise((r) => setTimeout(r, 50)); frame();
  // 3. an error
  console.error('[peds] a person failed', new Error('boom from the test'));
  await new Promise((r) => setTimeout(r, 50)); frame();
  // 4. a note from Claude (the inbox is checked a few seconds in)
  W.update(6, false);
  await new Promise((r) => setTimeout(r, 1500));
  out.note = document.getElementById('claude-note')?.textContent || null;
  out.toasts = toasts;
  return out;
};
window.ready = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/watch.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(src); }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const pg = await browser.newPage();
const posts = [];
await pg.route('**/api/sb-watch**', async (route) => {
  const r = route.request();
  if (r.method() === 'POST') { posts.push(JSON.parse(r.postData())); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
  if (r.url().includes('inbox=1')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ t: Date.now(), text: 'Nice try escaping those cops' }]) });
  return route.fulfill({ status: 404, body: '' });
});
const errors = []; pg.on('pageerror', (e) => errors.push(e.message));
await pg.goto(`http://127.0.0.1:${server.address().port}/`);
await pg.waitForFunction(() => window.ready);
const out = await pg.evaluate(() => window.run());
await pg.waitForTimeout(500);
await browser.close(); server.close();

let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const px = out.shot?.pixel;
ok(px && px[0] === 640 && px[1] === 360, 'the picture is 640x360 (' + (px ? px[0] + 'x' + px[1] : 'none') + ', ' + (out.shot?.kb ?? 0) + ' KB)');
ok(px && Math.abs(px[2] - 204) < 12 && Math.abs(px[3] - 77) < 12 && Math.abs(px[4] - 26) < 12, 'the picture shows the frame that was drawn (centre pixel ' + (px ? px.slice(2, 5).join(',') : '-') + ', expected 204,77,26)');
const play = posts.find((p) => p.kind === 'play'), err = posts.find((p) => p.kind === 'error');
ok(play && play.game === 'southbound' && play.state?.region === 'Mill Creek' && play.samples?.length >= 1, 'a play report carries the state and samples');
ok(play && /^data:image\/jpeg;base64,/.test(play.shot || ''), 'the play report carries a picture');
ok(play && play.events.some((e) => e.kind === 'message' && /Passenger aboard/.test(e.text)), "the game's messages are in the timeline");
ok(err && /boom from the test/.test(err.error?.msg) && /Error/.test(err.error?.stack || '') && err.state?.region, 'an error is sent with its stack and the state');
ok(/Nice try escaping those cops/.test(out.note || ''), "Claude's note shows in the game (" + out.note + ')');
ok(!errors.length, 'no page errors ' + errors.join(' | '));
console.log(fail ? `watch test: ${fail} failed` : 'watch test: all passed');
process.exit(fail ? 1 : 0);
