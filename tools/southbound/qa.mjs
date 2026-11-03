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
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /open model failed|NaN/.test(m.text()))) consoleErrors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => consoleErrors.push('[pageerror] ' + e.message));
await page.addInitScript(() => { window.SB_SKIP_INTRO = true; });
await page.addInitScript((pr) => { try { localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: 'pc', preset: pr, dynamicRes: false, showFps: false, timeScale: 0 })); localStorage.removeItem('southbound.save.v1'); } catch (e) { /* */ } }, preset);
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForTimeout(500);
await page.click('#play');
await page.waitForFunction(() => window.SB && window.SB.state, null, { timeout: 600000 });
await page.waitForTimeout(30000); // background model loads
const suite = fs.readFileSync(path.join(here, 'qa-suite.js'), 'utf8');
const report = await page.evaluate(`(${suite})(${JSON.stringify({ allDoors: process.argv.includes('--all-doors') })})`);
console.log(`QA: ${report.pass} passed, ${report.fail} failed, ${report.seconds}s`);
for (const n of report.notes) console.log('note:', n);
for (const e of report.errors.slice(0, 80)) console.log(e);
console.log(consoleErrors.length ? `console errors (${consoleErrors.length}):\n` + [...new Set(consoleErrors)].slice(0, 30).join('\n') : 'no console errors');
await browser.close();
server.close();
