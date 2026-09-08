#!/usr/bin/env node
/* Browser smoke test for the playable build.
 *
 * Generates the island, enters it, walks around, and checks the things that
 * can only be checked in a real browser: that the page loads without a
 * console error, that the world generates, that the HUD is reading live
 * values out of the simulation, and that the world clock keeps real time
 * even when the renderer cannot.
 *
 * It also takes screenshots — a first-person one from where the player
 * lands, and an aerial one of the whole island — because "does the terrain
 * look like terrain" is not a thing an assertion can answer.
 *
 * Needs Playwright:  npm i --no-save playwright
 * Usage:  node survivor/test/browser.test.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..', '..', 'site');
const SHOTS = process.env.SURVIVOR_SHOT_DIR || '/tmp';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.glb': 'model/gltf-binary',
};

const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(url.parse(req.url).pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

(async () => {
  await new Promise((r) => server.listen(8099, r));

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    // SwiftShader: there is no GPU here, so the frame rate below is a
    // software-rasteriser figure and says nothing about real hardware. What
    // it does prove is that every shader compiles and every draw succeeds.
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

  console.log('\nloading');
  await page.goto('http://localhost:8099/survivor/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#startBtn:not([hidden])', { timeout: 240000 });
  const stats = await page.textContent('#bootStats');
  console.log(`  ${stats.replace(/\n/g, '\n  ')}`);
  check('world generates without error', errors.length === 0, errors[0] || '');

  console.log('\nentering');
  await page.click('#startBtn');
  await page.waitForTimeout(6000);

  const first = await page.evaluate(() => ({
    canvas: !!document.querySelector('canvas'),
    hud: !document.getElementById('hud').hidden,
    vitals: document.getElementById('vitals').innerText,
    env: document.getElementById('env').innerText,
    log: document.getElementById('logBody').innerText,
    exposed: !!window.SURVIVOR,
    pois: window.SURVIVOR ? window.SURVIVOR.world.pois.length : 0,
    animals: window.SURVIVOR ? window.SURVIVOR.world.ecology.animals.length : 0,
    fish: window.SURVIVOR ? window.SURVIVOR.world.fishery.fish.length : 0,
  }));
  check('a canvas is rendering', first.canvas);
  check('the HUD is up', first.hud);
  check('every named place was sited', first.pois >= 15, `${first.pois} places`);
  check('the island is populated', first.animals >= 450 && first.fish >= 120,
    `${first.animals} animals, ${first.fish} fish`);
  check('the HUD reads from the simulation', /water/.test(first.vitals) && /season/.test(first.env));
  console.log(`\n${first.vitals}\n\n${first.env}\n\n${first.log}`);

  console.log('\nwalking');
  const before = await page.evaluate(() => {
    const p = window.SURVIVOR.player;
    return { x: p.x, z: p.z, water: p.body.bodyWaterL };
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(5000);
  await page.keyboard.up('w');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const p = window.SURVIVOR.player;
    return { x: p.x, z: p.z, water: p.body.bodyWaterL, y: p.y,
      ground: window.SURVIVOR.world.map.heightAtWorld(p.x, p.z) };
  });
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  /* Movement is driven by the engine's clamped frame delta, and the software
     rasteriser here runs at about one frame a second — so five seconds of
     held W is only about half a second of simulated walking. On hardware
     this is metres; the assertion only has to prove the input is wired to
     the controller and the controller to the body. */
  check('the player moves', moved > 0.4, `${moved.toFixed(1)} m in ~0.5 s of simulated walking`);
  check('and stands on the terrain, not through it',
    Math.abs(after.y - after.ground) < 3.5,
    `player y ${after.y.toFixed(2)}, ground ${after.ground.toFixed(2)}`);
  check('and walking costs water', after.water < before.water,
    `${before.water.toFixed(3)} -> ${after.water.toFixed(3)} L`);
  await page.screenshot({ path: path.join(SHOTS, 'survivor-firstperson.png') });

  console.log('\nlooking at the island');
  await page.evaluate(() => {
    const { world, game } = window.SURVIVOR;
    world.clock.simSeconds = 13 * 3600;
    /* A fixed aerial vantage. It has to be a manual camera rather than a
       teleported character: the character has a rigid body and gravity, so
       putting it at 760 m simply drops it, and the shot ends up at sea
       level looking at the sky. */
    game.lookAt([0, 900, -2100], [0, 60, 200]);
    window.SURVIVOR.player.x = 0;
    window.SURVIVOR.player.z = 0;
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(SHOTS, 'survivor-island.png') });

  console.log('\ntimekeeping');
  const t0 = await page.evaluate(() => window.SURVIVOR.world.clock.hourOfDay);
  await page.keyboard.press('t');
  await page.keyboard.press('t');
  await page.waitForTimeout(9000);
  const probe = await page.evaluate(() => ({
    hour: window.SURVIVOR.world.clock.hourOfDay,
    fps: window.SURVIVOR.game.stats.fps,
    actors: window.SURVIVOR.game.stats.actors,
    draws: window.SURVIVOR.game.stats.draws,
  }));
  // 9 real seconds at 40x, on a 40-minute day, is 9 * 40 * 36 / 3600 = 3.6
  // game hours. The renderer here manages about one frame a second, so this
  // is really a test that the world does not run slower on a slow machine.
  const elapsed = ((probe.hour - t0) + 24) % 24;
  check('the clock keeps real time regardless of frame rate',
    elapsed > 2.6 && elapsed < 4.6, `${elapsed.toFixed(2)} game hours, expected ~3.6`);
  console.log(`  software renderer: ${probe.fps} fps, ${probe.actors} actors, ${probe.draws} draws`);
  await page.screenshot({ path: path.join(SHOTS, 'survivor-evening.png') });

  check('no console errors at any point', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`screenshots in ${SHOTS}: survivor-firstperson.png, survivor-island.png, survivor-evening.png`);
  if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
