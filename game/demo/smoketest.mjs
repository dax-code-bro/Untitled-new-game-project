// Headless smoke test: serve the demo, load it in Chromium, capture console + screenshot.
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'text/plain' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(8099, r));

// All assets are vendored locally now — no proxy needed (and localhost must NOT be proxied).
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => errors.push(String(e)));

await page.goto('http://localhost:8099/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3500); // let three.js load from CDN + render

// try to enter the campaign slice
await page.click('.mode[data-mode="campaign"]').catch(() => {});
await page.waitForTimeout(600);
await page.click('#story').catch(() => {});
await page.waitForTimeout(1200);

await page.screenshot({ path: 'demo-screenshot.png' });

const ready = logs.find(l => l.includes('[demo] ready'));
console.log('--- CONSOLE ---'); logs.slice(0, 20).forEach(l => console.log(l));
console.log('--- PAGE ERRORS ---'); console.log(errors.length ? errors.join('\n') : '(none)');
console.log('--- RESULT ---');
console.log(ready ? 'DEMO INITIALIZED OK: ' + ready : 'DEMO DID NOT REPORT READY (see errors/console)');

await browser.close();
server.close();
