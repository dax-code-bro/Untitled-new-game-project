#!/usr/bin/env node
const fs = require('fs'); const path = require('path'); const http = require('http'); const url = require('url');
const { chromium } = require('playwright');
const SITE = path.join(__dirname, '..', '..', 'site');
const OUT = process.env.SHOT_DIR || '/tmp/claude-0/handshots';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((q, r) => {
  let p = path.join(SITE, decodeURIComponent(url.parse(q.url).pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, b) => {
    if (e) { r.writeHead(404); return r.end('x'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    r.end(b);
  });
});
const VIEWS = (process.env.VIEWS || 'hand,relaxed,three;hand,relaxed,back;hand,relaxed,palm;hand,fist,three;hand,gripStock,three;hand,open,back;arm,relaxed,three;leg,relaxed,three').split(';');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(8121, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport: { width: 900, height: 700 } });
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  pg.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  for (const spec of VIEWS) {
    const [what, pose, view] = spec.split(',');
    await pg.goto(`http://localhost:8121/lab/hands.html?what=${what}&pose=${pose}&view=${view}`, { waitUntil: 'load' });
    await pg.waitForFunction(() => window.__ready, { timeout: 60000 });
    await pg.waitForTimeout(1200);
    const name = `${what}-${pose}-${view}`;
    await pg.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('  ', name, await pg.evaluate(() => document.getElementById('label').textContent));
  }
  await b.close(); server.close();
})();
