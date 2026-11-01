// Automated playtest for Southbound: serves the game, drives it with scripted
// input in headless Chromium, and saves screenshots + videos.
//
//   node tools/southbound/playtest.mjs <outDir> [preset] [scenario]
//
// scenario: smoke | shots | video
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../site/southbound');
const out = path.resolve(process.argv[2] || 'playtest-out');
const preset = process.argv[3] || 'high';
const scenario = process.argv[4] || 'smoke';
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
fs.mkdirSync(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const video = scenario === 'video';
const phone = preset === 'phone';
const context = await browser.newContext({
  viewport: phone ? { width: 844, height: 390 } : { width: W, height: H },
  deviceScaleFactor: 1,
  hasTouch: phone,
  ...(video ? { recordVideo: { dir: out, size: phone ? { width: 844, height: 390 } : { width: W, height: H } } } : {}),
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.addInitScript((pr) => {
  try {
    localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: pr === 'phone' ? 'phone' : 'pc', preset: pr, dynamicRes: false, showFps: true, timeScale: 0 }));
  } catch (e) { /* ignore */ }
}, preset);

const shot = async (name) => {
  const frozen = await page.evaluate(() => { if (window.SB) { window.SB.freeze(true); return true; } return false; });
  await page.screenshot({ path: path.join(out, `${name}.png`), timeout: 120000 });
  if (frozen) await page.evaluate(() => window.SB.freeze(false));
  console.log('shot', name);
};
const wait = (ms) => page.waitForTimeout(ms);
const sb = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url);
await wait(800);
if (scenario !== 'video') await shot('00-menu');
await page.click('#play');
const t0 = Date.now();
await page.waitForFunction(() => window.SB && window.SB.state, null, { timeout: 300000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await wait(2500);
console.log('state', JSON.stringify(await sb(() => window.SB.state)));

if (scenario === 'smoke') {
  await shot('01-spawn');
} else if (scenario === 'shots') {
  const spots = JSON.parse(fs.readFileSync(path.join(here, 'spots.json'), 'utf8'));
  for (const s of spots) {
    if (s.only && s.only !== preset) continue;
    await sb((s) => {
      window.SB.setHour(s.hour ?? 10);
      if (s.drive) window.SB.enterNearest();
      window.SB.teleport(s.x, s.z, s.yaw ?? 0);
      window.SB.lookAt(s.yaw ?? 0, s.pitch ?? 0.15);
      window.SB.showRegion();
      if (s.map) window.SB.toggleMap();
    }, s);
    await wait(s.wait ?? 2500);
    await shot(s.name);
    if (s.map) await sb(() => window.SB.toggleMap());
    console.log(s.name, JSON.stringify(await sb(() => window.SB.state)));
  }
} else if (scenario === 'video') {
  // Walk to the car, get in, drive through the city and out along the highway.
  const step = async (o, ms) => { await sb((o) => window.SB.setOverride(o), o); await wait(ms); };
  await step({ moveY: 1, moveX: 0 }, 1500);
  await step({ moveY: 0, moveX: 0 }, 300);
  await sb(() => window.SB.enterNearest());
  await wait(800);
  await step({ moveX: 0, moveY: 1, throttle: 1, brake: 0 }, 6000);
  await step({ moveX: 0.6, moveY: 1, throttle: 1 }, 1500);
  await step({ moveX: 0, moveY: 1, throttle: 1 }, 5000);
  await step({ moveX: -0.7, moveY: 0.6, throttle: 0.6, handbrake: true }, 1500);
  await step({ moveX: 0, moveY: 1, throttle: 1, handbrake: false }, 5000);
  await step({ moveX: 0, moveY: -1, throttle: 0, brake: 1 }, 2000);
  console.log('state', JSON.stringify(await sb(() => window.SB.state)));
}

if (scenario === 'capture') {
  // Fixed-step capture: every video frame is exactly 1/FPS of game time,
  // so the result plays smoothly no matter how slow this machine renders.
  const FPS = +(process.env.FPS || 24);
  const script = JSON.parse(fs.readFileSync(process.env.SCRIPT || path.join(here, 'capture.json'), 'utf8'));
  const framesDir = path.join(out, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  await sb(() => window.SB.freeze(true));
  let f = 0;
  for (const seg of script) {
    if (seg.setup) await sb((st) => {
      const S = window.SB;
      if (st.hour !== undefined) S.setHour(st.hour);
      if (st.teleport) S.teleport(...st.teleport);
      if (st.look) S.lookAt(...st.look);
      if (st.enter) S.enterNearest();
      if (st.auto) S.autoDrive(...st.auto);
      if (st.stopAuto) S.stopAuto();
      if (st.exit) S.exitCar();
      if (st.look) S.lookAt(...st.look);
      if (st.region) S.showRegion();
    }, seg.setup);
    await sb((o) => window.SB.setOverride(o), seg.input || {});
    const n = Math.round((seg.seconds || 1) * FPS);
    for (let i = 0; i < n; i++, f++) {
      await sb((dt) => window.SB.step(1, dt), 1 / FPS);
      await page.screenshot({ path: path.join(framesDir, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88, timeout: 120000 });
      if (f % 48 === 0) console.log('frame', f, JSON.stringify(await sb(() => window.SB.state)));
    }
  }
  console.log('captured', f, 'frames');
}

fs.writeFileSync(path.join(out, `log-${preset}-${scenario}.txt`), errors.join('\n') || 'no console errors');
console.log(errors.length ? errors.slice(0, 20).join('\n') : 'no console errors');
await context.close();
await browser.close();
server.close();
