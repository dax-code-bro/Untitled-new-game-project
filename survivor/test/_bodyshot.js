#!/usr/bin/env node
/* Look at your own hands. Usage: node survivor/test/_bodyshot.js */
const fs = require('fs'); const path = require('path'); const http = require('http'); const url = require('url');
const { chromium } = require('playwright');
const SITE = path.join(__dirname, '..', '..', 'site');
const OUT = process.env.SHOT_DIR || '/tmp/claude-0/bodyshots';
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
const shots = (process.env.ONLY || '').split(',').filter(Boolean);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(8119, r));
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  pg.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await pg.goto('http://localhost:8119/survivor/index.html', { waitUntil: 'load' });
  await pg.waitForSelector('#startBtn:not([hidden])', { timeout: 300000 });
  await pg.click('#startBtn');
  await pg.waitForTimeout(2500);
  // Broad daylight, and hide the HUD so nothing sits on top of the hands.
  await pg.evaluate(() => {
    const S = window.SURVIVOR;
    S.world.clock.simSeconds = 12 * 3600;
    document.querySelector('#hud').hidden = true;
    document.querySelector('#help').hidden = true;
    document.querySelector('#tutorial') && (document.querySelector('#tutorial').hidden = true);
  });

  const shot = async (name, fn, wait = 1400) => {
    if (shots.length && !shots.includes(name)) return;
    if (fn) await pg.evaluate(fn);
    await pg.waitForTimeout(wait);
    await pg.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('  ', name);
  };

  // 1. Empty hands, looking straight ahead.
  await shot('01-idle', () => { window.SURVIVOR.ctx.state.heldTool = null; });
  // 2. Looking down at your own body.
  await shot('02-lookdown', () => {
    const S = window.SURVIVOR;
    const p = S.game.camera.position, t = S.game.camera.target;
    t.set(p.x + 0.05, p.y - 1.05, p.z + 1.0);
    S.game._camMode = 'manual';
  });
  // 3. A rifle in both hands.
  await shot('03-rifle', () => {
    const S = window.SURVIVOR;
    S.game._camMode = 'first';
    S.ctx.emit('equip-weapon', 'remington700_308');
    const mods = S.modules;
    for (const k in mods) { /* the weapons module owns equip; key 1 does it */ }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
  }, 2600);
  // 4. Rifle, camera pitched down a touch so the hands fill the frame.
  await shot('04-rifle-close', () => {
    const S = window.SURVIVOR;
    const cam = S.game.camera, p = cam.position;
    cam.target.set(p.x + 0.35, p.y - 0.55, p.z + 1.0);
    S.game._camMode = 'manual';
  });
  await shot('04b-rifle-left', () => {
    const S = window.SURVIVOR;
    const cam = S.game.camera, p = cam.position;
    cam.target.set(p.x - 0.30, p.y - 0.45, p.z + 1.0);
    S.game._camMode = 'manual';
  });
  // 5. An axe in hand.
  await shot('05-axe', () => {
    const S = window.SURVIVOR;
    S.game._camMode = 'first';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
    S.ctx.state.gunFrame = null;
    S.ctx.state.heldTool = 'axe';
  }, 2200);
  // 6. Cold, empty hands, from close.
  await shot('06-cold', () => {
    const S = window.SURVIVOR;
    S.ctx.state.heldTool = null;
    S.player.body.coreTempC = 34.4;
    const cam = S.game.camera, p = cam.position;
    cam.target.set(p.x, p.y - 0.9, p.z + 1.0);
    S.game._camMode = 'manual';
  }, 2200);

  await shot('07-nosleeves', () => {
    const S = window.SURVIVOR;
    S.ctx.state.bodyDebug = { noSleeves: true };
    S.game._camMode = 'first';
    S.player.body.coreTempC = 37;
    const p = S.game.camera.position, t = S.game.camera.target;
    t.set(p.x + 0.05, p.y - 1.05, p.z + 1.0);
    S.game._camMode = 'manual';
  }, 1800);
  await shot('08-armsonly', () => {
    const S = window.SURVIVOR;
    S.ctx.state.bodyDebug = {};
    for (const leg of S.ctx.state.bodyRig.legs) {
      for (const a of leg.actors.values()) if (a) a.destroy();
      if (leg.trouser.thigh) leg.trouser.thigh.destroy();
      if (leg.trouser.shank) leg.trouser.shank.destroy();
      leg.actors.clear(); leg.trouser.thigh = null; leg.trouser.shank = null;
    }
    S.ctx.state.bodyRig.chest.destroy(); S.ctx.state.bodyRig.chest = null;
  }, 1800);

  const n = await pg.evaluate(() => window.SURVIVOR.game.actors.filter((a) => /^fp:/.test(a.name || '')).length);
  const vis = await pg.evaluate(() => window.SURVIVOR.game.actors.filter((a) => /^fp:/.test(a.name || '') && a.visible).length);
  console.log(`  ${vis}/${n} body actors visible`);
  await b.close(); server.close();
})();
