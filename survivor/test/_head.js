#!/usr/bin/env node
/* Head close-ups. A face is where a model is judged and where the coat
 * atlas is most crowded — ears, muzzle band, nose, eyes all inside a few
 * hundredths of v — and forty pixels of it in a broadside plate tells you
 * nothing. This renders one skull at a time, lit from the same side the
 * broadside camera stands on.
 *
 * Usage: node survivor/test/_head.js <species> [species...]
 */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const url = require('url');
const SITE = path.join(__dirname, '..', '..', 'site');
const OUT = process.env.SHOT_DIR || '/tmp/claude-0/head';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
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
  await new Promise((r) => server.listen(8109, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 640 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));

  // "species" or "species:sex:stage".
  for (const arg of process.argv.slice(2)) {
    const [sp, sex = 'male', stage = 'prime'] = arg.split(':');
    await page.goto(`http://localhost:8109/lab/animals.html?species=${sp}&sex=${sex}&stage=${stage}&view=head`,
      { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `${sp}-head.png`) });
    process.stdout.write(`  ${sp}\n`);
  }
  await browser.close();
  server.close();
})();
