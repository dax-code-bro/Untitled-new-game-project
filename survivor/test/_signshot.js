#!/usr/bin/env node
/* One frame of sign on the ground, for looking at.
 * Usage: node survivor/test/_signshot.js
 */
const fs = require('fs'); const path = require('path'); const http = require('http'); const url = require('url');
const { chromium } = require('playwright');
const SITE = path.join(__dirname, '..', '..', 'site');
const OUT = process.env.SHOT_DIR || '/tmp/claude-0/ishots';
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
  await new Promise((r) => server.listen(8115, r));
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  pg.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await pg.goto('http://localhost:8115/survivor/index.html', { waitUntil: 'load' });
  await pg.waitForSelector('#startBtn:not([hidden])', { timeout: 300000 });
  await pg.click('#startBtn');
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => {
    const S = window.SURVIVOR;
    S.world.clock.simSeconds = 10.5 * 3600;
    const eco = S.world.ecology;
    const px = S.player.x, pz = S.player.z;
    // A trail walking past, the way an animal actually lays one.
    for (let i = 0; i < 10; i++) {
      eco.addSign({
        kind: 'track', x: px - 3 + i * 0.85, z: pz + 2.2 + Math.sin(i * 0.6) * 0.5,
        speciesId: 'whitetailDeer', male: true, massKg: 95,
        heading: Math.PI * 0.5, gait: i > 5 ? 'trot' : 'walk', depth: 0.9,
      });
    }
    eco.addSign({ kind: 'dropping', x: px + 1.2, z: pz + 3.4, speciesId: 'whitetailDeer', massKg: 95, depth: 0.8 });
    eco.addSign({ kind: 'bed', x: px - 2.6, z: pz + 4.2, speciesId: 'whitetailDeer', massKg: 95, amount: 1.5, heading: 1 });
    eco.addSign({ kind: 'blood', x: px + 3.0, z: pz + 2.0, speciesId: 'whitetailDeer', massKg: 95, amount: 1, blood: S.ctx.SV.BLOOD.lung, depth: 0.9 });
    eco.addSign({ kind: 'rub', x: px + 4.2, z: pz + 4.4, speciesId: 'whitetailDeer', massKg: 160, depth: 0.9, heading: 0.4 });
  });
  await pg.waitForFunction(
    () => window.SURVIVOR.game.actors.filter((x) => x.name === 'sign').length >= 12,
    { timeout: 60000 },
  ).catch(() => {});
  const n = await pg.evaluate(() => {
    const S = window.SURVIVOR;
    S.world.clock.simSeconds = 10.5 * 3600;
    const g = S.ctx.groundY(S.player.x, S.player.z);
    // Crouched over the trail, which is how you look at one.
    // Crouched right over the trail, which is where you read one from.
    S.game.lookAt([S.player.x + 0.4, g + 0.95, S.player.z + 0.9],
      [S.player.x + 0.9, g, S.player.z + 2.6]);
    return S.game.actors.filter((x) => x.name === 'sign').length;
  });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: path.join(OUT, 'sign-close.png') });
  console.log(`  ${n} sign actors`);
  const dbg = await pg.evaluate(() => {
    const S = window.SURVIVOR;
    const cam = S.game.camera.position;
    const near = S.game.actors.filter((x) => x.name === 'sign')
      .sort((a, b) => Math.hypot(a.position.x - cam.x, a.position.z - cam.z)
        - Math.hypot(b.position.x - cam.x, b.position.z - cam.z));
    const list = near.slice(0, 6).map((a) => ({
      p: [+a.position.x.toFixed(2), +a.position.y.toFixed(2), +a.position.z.toFixed(2)],
      s: +a.scale.x.toFixed(3), vis: a.visible !== false,
      d: +Math.hypot(a.position.x - cam.x, a.position.z - cam.z).toFixed(2),
      k: a.userData && a.userData.sign ? a.userData.sign.kind : '?',
    }));
    const mine = S.world.ecology.signs.filter((g) =>
      Math.hypot(g.x - S.player.x, g.z - S.player.z) < 8).length;
    return { cam: [+cam.x.toFixed(2), +cam.y.toFixed(2), +cam.z.toFixed(2)],
      ground: +S.ctx.groundY(S.player.x, S.player.z).toFixed(2), mine, list };
  });
  console.log('  cam', JSON.stringify(dbg.cam), 'ground', dbg.ground, 'sim sign within 8m:', dbg.mine);
  for (const e of dbg.list) console.log('   ', e.k, JSON.stringify(e.p), 'scale', e.s, 'dist', e.d, 'vis', e.vis);
  await b.close(); server.close();
})();
