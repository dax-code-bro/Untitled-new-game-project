// Screenshot dev-showroom.html views:  node tools/southbound/showroom.mjs out.png "view=cars&hour=12"
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../site/southbound');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });
const jobs = process.argv.slice(2);
for (let i = 0; i < jobs.length; i += 2) {
  await page.goto(`http://127.0.0.1:${server.address().port}/dev-showroom.html?${jobs[i + 1]}`);
  await page.waitForFunction(() => window.__done, null, { timeout: 600000 });
  const data = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  fs.writeFileSync(jobs[i], Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', jobs[i]);
}
await browser.close();
server.close();
