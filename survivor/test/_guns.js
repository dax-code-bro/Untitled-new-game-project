#!/usr/bin/env node
/* Photographs guns and gun parts. A firearm is a thing people know the
 * look of: any of it being wrong is obvious in a picture and invisible
 * in a diff, so every part gets looked at.
 *
 * Usage: node survivor/test/_guns.js boltRifle carbine:exploded bolt@boltRifle
 */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const url = require('url');
const SITE = path.join(__dirname, '..', '..', 'site');
const OUT = process.env.SHOT_DIR || '/tmp/claude-0/guns';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  let p = path.join(SITE, decodeURIComponent(url.parse(req.url).pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); return res.end('x'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(8110, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

  for (const arg of process.argv.slice(2)) {
    // "gun", "gun:exploded", "part@gun", "gun:whole:scope4"
    let gun = arg, view = 'whole', part = '', scope = '';
    if (arg.includes('@')) { [part, gun] = arg.split('@'); }
    if (gun.includes(':')) { const bits = gun.split(':'); gun = bits[0]; view = bits[1] || 'whole'; scope = bits[2] || ''; }
    const qs = `gun=${gun}&view=${view}${part ? `&part=${part}` : ''}${scope ? `&scope=${scope}` : ''}`;
    await page.goto(`http://localhost:8110/lab/guns.html?${qs}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1400);
    const name = `${part ? `${gun}-${part}` : `${gun}-${view}`}${scope ? `-scope${scope}` : ''}.png`;
    await page.screenshot({ path: path.join(OUT, name) });
    process.stdout.write(`  ${name}\n`);
  }
  await browser.close();
  server.close();
})();
