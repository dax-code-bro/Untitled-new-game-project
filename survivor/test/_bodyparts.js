#!/usr/bin/env node
/* Progressive elimination: keep one group of body actors at a time. */
const fs = require('fs'); const path = require('path'); const http = require('http'); const url = require('url');
const { chromium } = require('playwright');
const SITE = path.join(__dirname, '..', '..', 'site');
const OUT = process.env.SHOT_DIR || '/tmp/claude-0/partshots';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((q, r) => {
  let p = path.join(SITE, decodeURIComponent(url.parse(q.url).pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end('x'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
});
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(8123, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport: { width: 1100, height: 700 } });
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  await pg.goto('http://localhost:8123/survivor/index.html', { waitUntil: 'load' });
  await pg.waitForSelector('#startBtn:not([hidden])', { timeout: 300000 });
  await pg.click('#startBtn');
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => {
    const S = window.SURVIVOR;
    S.world.clock.simSeconds = 12 * 3600;
    document.querySelector('#hud').hidden = true;
    document.querySelector('#help').hidden = true;
    const t = document.querySelector('#tutorial'); if (t) t.hidden = true;
    document.querySelector('#vignette').style.display = 'none';
    document.querySelector('#damage').style.display = 'none';
  });
  const GROUPS = ['shoulder', 'upperArm', 'forearm', 'sleeveU', 'sleeveF', 'palm', 'fingers',
    'thigh', 'knee', 'shank', 'boot', 'trouser', 'chest'];
  for (const g of GROUPS) {
    await pg.evaluate((keep) => {
      const S = window.SURVIVOR;
      S.__keep = keep;
      if (!S.__patched) {
        S.__patched = true;
        const test = (name) => {
          const k = S.__keep;
          if (k === 'fingers') return /:(index|middle|ring|little|thumb)\d/.test(name);
          if (k === 'sleeveU') return /sleeveU$/.test(name);
          if (k === 'sleeveF') return /sleeveF$/.test(name);
          if (k === 'trouser') return /trouser/.test(name);
          return new RegExp(`:${k}$`).test(name) || name === `fp:${k}`;
        };
        S.game.on && S.game.on('afterUpdate', () => {});
        S.__filter = () => {
          for (const a of S.game.actors) {
            if (!/^fp:/.test(a.name || '')) continue;
            if (!test(a.name)) a.visible = false;
          }
        };
        const step = S.game.step.bind(S.game);
        S.game.step = (dt) => { const r = step(dt); S.__filter(); return r; };
      }
    }, g);
    await pg.evaluate(() => {
      const S = window.SURVIVOR;
      const p = S.game.camera.position;
      S.game.camera.target.set(p.x + 0.05, p.y - 1.3, p.z + 0.75);
      S.game._camMode = 'manual';
    });
    await pg.waitForTimeout(900);
    await pg.screenshot({ path: path.join(OUT, `${g}.png`) });
    console.log('  ', g);
  }
  await b.close(); server.close();
})();
