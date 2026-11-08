// Full QA run: loads the game headless and runs qa-suite.js inside the page.
//   node tools/southbound/qa.mjs [preset] [--all-doors]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../site/southbound');
const preset = process.argv[2] || 'low';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const consoleErrors = [];
page.on('console', (m) => { if (process.env.QA_LIVE && /^QA[<>] /.test(m.text())) console.log(m.text());
  if (m.type() === 'error' || (m.type() === 'warning' && /open model failed|NaN/.test(m.text()))) consoleErrors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => consoleErrors.push('[pageerror] ' + e.message));
// QA_TRACE=1: print each test as it starts (and any that take over 8 s), with the time
page.on('console', (m) => { if (process.env.QA_TRACE && /^QA[<>]/.test(m.text())) console.log(new Date().toISOString().slice(11, 19), m.text()); });
await page.addInitScript(() => { window.SB_SKIP_INTRO = true; });
if (process.env.QA_INIT) await page.addInitScript(process.env.QA_INIT); // QA_INIT: a line of script to run first (test flags such as window.SB_NO_KIT = 1)
await page.addInitScript((pr) => { try { localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: 'pc', preset: pr, dynamicRes: false, showFps: false, timeScale: 0 })); localStorage.removeItem('southbound.save.v1'); } catch (e) { /* */ } }, preset);
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForTimeout(500);
await page.click('#play');
await page.waitForFunction(() => window.SB && window.SB.state, null, { timeout: 600000 });
await page.waitForTimeout(30000); // background model loads
const suite = fs.readFileSync(process.env.QA_SUITE || path.join(here, 'qa-suite.js'), 'utf8'); // QA_SUITE: run a different suite file
// QA_TRACE=1 also prints what the scene holds every 20 s (to find what piles up over a run)
if (process.env.QA_TRACE) setInterval(() => page.evaluate(() => { const R = window.SB.renderer, G = window.SB.game; let n = 0; G.scene.traverse(() => n++); return { calls: R.info.render.calls, tris: R.info.render.triangles, progs: R.info.programs.length, geos: R.info.memory.geometries, tex: R.info.memory.textures, objs: n, kids: G.scene.children.length, traffic: G.traffic.cars.length, parked: G.parked.length, warm: G.carsWarming?.() }; }).then((s) => console.log(new Date().toISOString().slice(11, 19), 'stats', JSON.stringify(s))).catch(() => {}), 20000).unref();
const report = await page.evaluate(`(${suite})(${JSON.stringify({ allDoors: process.argv.includes('--all-doors') })})`);
console.log(`QA: ${report.pass} passed, ${report.fail} failed, ${report.seconds}s`);
for (const n of report.notes) console.log('note:', n);
for (const e of report.errors.slice(0, 80)) console.log(e);
console.log(consoleErrors.length ? `console errors (${consoleErrors.length}):\n` + [...new Set(consoleErrors)].slice(0, 30).join('\n') : 'no console errors');
await browser.close();
server.close();
