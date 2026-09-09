#!/usr/bin/env node
/* A guided tour of the game, for looking at rather than asserting on.
 *
 * The browser test proves nothing throws. This proves things look like what
 * they are: it teleports to each thing worth seeing, sets the weather and
 * the hour to show it at its best or its worst, and takes a picture.
 *
 * Usage:  node survivor/test/visual.js [--shots DIR]
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const SHOTS = process.env.SURVIVOR_SHOT_DIR || '/tmp';
const PORT = 8102;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain' };

const server = http.createServer((req, res) => {
  let p = path.join(SITE, decodeURIComponent(url.parse(req.url).pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 840 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

  await page.goto(`http://localhost:${PORT}/survivor/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#startBtn:not([hidden])', { timeout: 300000 });
  await page.click('#startBtn');
  await page.waitForTimeout(8000);

  /* Put the player somewhere, wait for the streaming builders to notice,
     and take the picture. Teleporting means moving the avatar body as well
     as the simulation's idea of where the player is — the camera follows
     the body, not the record. */
  async function go(name, opts) {
    await page.evaluate((o) => {
      const S = window.SURVIVOR;
      const g = S.game, w = S.world;
      let x = o.x, z = o.z;
      if (o.poi) {
        const p = w.pois.find((q) => q.kind === o.poi) || w.pois[0];
        x = p.x + (o.dx || 0); z = p.z + (o.dz || 0);
      }
      if (o.biome) {
        // Walk the map for the nearest cell of the wanted biome.
        const m = w.map, S2 = m.size;
        let best = null, bestD = Infinity;
        for (let r = 4; r < S2 - 4; r += 7) {
          for (let c = 4; c < S2 - 4; c += 7) {
            if (w.classified.at(c, r).id !== o.biome) continue;
            const wx = (c / (S2 - 1) - 0.5) * m.worldSizeM;
            const wz = (r / (S2 - 1) - 0.5) * m.worldSizeM;
            const d = Math.hypot(wx, wz);
            if (d < bestD) { bestD = d; best = [wx, wz]; }
          }
        }
        if (best) { x = best[0]; z = best[1]; }
      }
      const y = w.map.heightAtWorld(x, z);
      S.ctx.avatar.setPosition([x, y + 1.4, z]);
      S.ctx.avatar.setVelocity([0, 0, 0]);
      S.player.x = x; S.player.z = z; S.player.y = y;
      if (o.hour != null) w.clock.simSeconds = o.hour * 3600;
      if (o.yaw != null) g._camYaw = o.yaw;
      if (o.pitch != null) g._camPitch = o.pitch;
      if (o.run) new Function('S', o.run)(S);
    }, opts);
    await page.waitForTimeout(opts.settle || 9000);
    await page.screenshot({ path: path.join(SHOTS, `tour-${name}.png`) });
    const info = await page.evaluate(() => ({
      actors: window.SURVIVOR.game.actors.length,
      draws: window.SURVIVOR.game.stats.draws,
      biome: (window.SURVIVOR.ctx.biomeAt(window.SURVIVOR.player.x, window.SURVIVOR.player.z) || {}).name,
    }));
    console.log(`  ${name.padEnd(18)} ${String(info.actors).padStart(5)} actors, ${String(info.draws).padStart(4)} draws  (${info.biome})`);
  }

  console.log('tour:');
  await go('beach', { biome: 'beach', hour: 8, pitch: -0.05 });
  await go('forest', { biome: 'deepForest', hour: 12, pitch: 0.02 });
  await go('pineforest', { biome: 'pineForest', hour: 10, pitch: 0.05 });
  await go('prairie', { biome: 'prairie', hour: 15, pitch: 0 });
  await go('marsh', { biome: 'freshMarsh', hour: 9, pitch: -0.05 });
  await go('hill', { biome: 'rockyHill', hour: 16, pitch: 0.06 });

  await go('neighbourhood', { poi: 'neighbourhood', dx: -70, dz: -70, hour: 11, yaw: Math.PI * 0.75, pitch: 0.03 });
  await go('city', { poi: 'city', dx: -60, dz: -60, hour: 13, yaw: Math.PI * 0.75, pitch: 0.08 });
  await go('prairie-farm', { poi: 'prairie', dx: -25, dz: -25, hour: 17, yaw: Math.PI * 0.75 });
  await go('headquarters', { poi: 'headquarters', dx: 30, dz: -40, hour: 12, yaw: Math.PI * 0.9 });
  await go('harbour', { poi: 'harbour', dx: -30, dz: -50, hour: 18, yaw: Math.PI * 0.8 });
  await go('sawmill', { poi: 'sawmill', dx: -25, dz: -25, hour: 14, yaw: Math.PI * 0.75 });

  // A rifle in hand, a fire on the ground, and the night it is meant for.
  await go('rifle', {
    biome: 'meadow', hour: 15, pitch: 0,
    run: `S.ctx.emit('debug:equip', {});
          const w = S.SurvivorGame ? null : null;
          window.dispatchEvent(new KeyboardEvent('keydown', {key:'1'}));`,
  });
  await go('fire-night', {
    biome: 'meadow', hour: 22, pitch: -0.15,
    run: `const inv = S.player.inventory;
          inv.add({item:'firewood', massKg:6, volumeL:9, stackable:true, quantity:4});
          inv.add({item:'tinder', massKg:0.05, volumeL:0.5, stackable:true, quantity:6});
          inv.add({item:'lighter', massKg:0.02, volumeL:0.05, stackable:false});
          window.dispatchEvent(new KeyboardEvent('keydown', {key:'f'}));
          setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', {key:'f'})), 800);`,
    settle: 12000,
  });
  await go('moonlit', { biome: 'meadow', hour: 23.5, pitch: 0.02, yaw: Math.PI * 0.2 });
  await go('firelight', { biome: 'meadow', hour: 21.5, pitch: -0.30,
    run: `const inv = S.player.inventory;
          inv.add({item:'firewood', massKg:6, volumeL:9, stackable:true, quantity:4});
          inv.add({item:'tinder', massKg:0.05, volumeL:0.5, stackable:true, quantity:6});
          inv.add({item:'lighter', massKg:0.02, volumeL:0.05, stackable:false});
          window.dispatchEvent(new KeyboardEvent('keydown', {key:'f'}));
          setTimeout(() => { S.ctx.avatar.setPosition([S.player.x + 2.4, S.world.map.heightAtWorld(S.player.x + 2.4, S.player.z) + 1.4, S.player.z]);
            window.SURVIVOR.game._camYaw = Math.PI; }, 900);`,
    settle: 12000 });
  await go('horse', { biome: 'prairie', hour: 14, pitch: 0,
    run: `const S2 = window.SURVIVOR;` , settle: 10000 });
  await go('dawn', { biome: 'meadow', hour: 6.2, pitch: 0.02, yaw: Math.PI * 1.5 });
  await go('storm', {
    biome: 'meadow', hour: 14, pitch: 0,
    run: `S.world.clock.weather.cloudCover = 1;
          S.world.clock.weather.precipitation = 9;
          S.world.clock.weather.windMs = 15;`,
  });

  // The screens, with something in them worth showing.
  await page.evaluate(() => {
    const S = window.SURVIVOR;
    const inv = S.player.inventory;
    for (const [item, n] of [['plank', 8], ['nails', 6], ['bandage', 3], ['antiseptic', 2],
      ['sutures', 2], ['splint', 1], ['antibiotics', 4], ['cleanWater', 2], ['pot', 1],
      ['fishingRod', 1], ['worms', 6], ['axe', 1], ['hammer', 1], ['timber', 4], ['cordage', 4]]) {
      const spec = (S.ctx.state.itemTable || {})[item] || {};
      inv.add({ item, massKg: spec.massKg || 0.5, volumeL: spec.volumeL || 0.5, stackable: spec.stackable !== false, quantity: n });
    }
    // A wound and a broken bone, so the condition screen has work in it.
    S.player.injury.wound({ type: 'laceration', region: 'thigh', severity: 0.5, soil: 0.4 });
    S.player.injury.tryFracture('lowerLeg', 3000);
    S.player.disease.expose(window.Survivor.VECTOR.untreatedWater, { hygiene: 0, load: 3 });
    S.world.step(600);
    S.ctx.emit('reveal-map', {});
  });
  await page.waitForTimeout(2500);

  for (const [key, name] of [['Tab', 'inventory'], ['c', 'condition'], ['m', 'map'], ['n', 'build'], ['x', 'wiring'], ['Escape', 'menu']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(SHOTS, `tour-ui-${name}.png`) });
    await page.keyboard.press(key === 'Tab' ? 'Tab' : key === 'Escape' ? 'Escape' : key);
    await page.waitForTimeout(700);
  }

  console.log(errors.length ? `\n${errors.length} errors:\n  ${errors.slice(0, 8).join('\n  ')}` : '\nno console errors');
  await browser.close();
  server.close();
})();
