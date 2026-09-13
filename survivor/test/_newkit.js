#!/usr/bin/env node
/* Tutorial, HUD stats, damage halo, save, veterancy panel — does the
 * player actually see them?  Usage: node survivor/test/_newkit.js
 */
const fs = require('fs'); const path = require('path'); const http = require('http'); const url = require('url');
const { chromium } = require('playwright');
const SITE = path.join(__dirname, '..', '..', 'site');
const OUT = process.env.SHOT_DIR || '/tmp/claude-0/nshots';
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
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(8117, r));
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  pg.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await pg.goto('http://localhost:8117/survivor/index.html', { waitUntil: 'load' });
  await pg.waitForSelector('#startBtn:not([hidden])', { timeout: 300000 });
  await pg.click('#startBtn');
  await pg.waitForTimeout(3000);

  const boot = await pg.evaluate(() => {
    const S = window.SURVIVOR;
    return {
      modules: Object.keys(S.modules || {}),
      tutorial: !!document.querySelector('#tutorial'),
      state: Object.keys(S.ctx.state || {}),
    };
  });
  console.log('modules:', boot.modules.join(', '));
  console.log('tutorial panel present:', boot.tutorial);
  await pg.screenshot({ path: path.join(OUT, '01-spawn.png') });

  // Hurt the player and look at the halo + stats.
  await pg.evaluate(() => {
    const S = window.SURVIVOR;
    S.player.injury.wound({ type: 'laceration', region: 'thigh', severity: 0.75 });
    S.player.injury.tryFracture('lowerLeg', 5000);
  });
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: path.join(OUT, '02-hurt.png') });
  const hud = await pg.evaluate(() => {
    const d = document.querySelector('#damage');
    return { damageOpacity: d && getComputedStyle(d).opacity, hudText: (document.querySelector('#hud') || {}).innerText };
  });
  console.log('damage overlay opacity:', hud.damageOpacity);
  console.log('hud:', JSON.stringify((hud.hudText || '').slice(0, 400)));

  // Veterancy panel
  await pg.keyboard.press('Shift+V');
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: path.join(OUT, '03-veterancy.png') });
  await pg.keyboard.press('Shift+V');

  // Crafting screen
  await pg.keyboard.press('Shift+C');
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: path.join(OUT, '04-crafting.png') });
  await pg.keyboard.press('Escape');

  // Save
  await pg.keyboard.press('Shift+K');
  await pg.waitForTimeout(600);
  const saved = await pg.evaluate(() => ({
    save: !!localStorage.getItem('survivor.save'),
    vet: localStorage.getItem('survivor.veterancy'),
  }));
  console.log('saved:', JSON.stringify(saved));
  await pg.screenshot({ path: path.join(OUT, '05-after-save.png') });

  await b.close(); server.close();
})();
