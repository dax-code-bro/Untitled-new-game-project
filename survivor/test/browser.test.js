#!/usr/bin/env node
/* Drives the real game in a real browser.
 *
 * Everything here is a check that cannot be made headless: that the page
 * loads without a console error, that the world generates, that geometry
 * actually appears, that every module started, that the HUD is reading live
 * values out of the simulation, and that the world clock keeps real time
 * even when the renderer cannot.
 *
 * It also takes screenshots, because "does the terrain look like terrain" is
 * not a thing an assertion can answer.
 *
 * There is no GPU here, so this runs on a software rasteriser at a frame a
 * second. That says nothing about real hardware — what it proves is that
 * every shader compiles and every draw succeeds.
 *
 * Needs Playwright:  npm i --no-save playwright
 * Usage:  node survivor/test/browser.test.js [--keep] [--shots DIR]
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const SHOTS = process.env.SURVIVOR_SHOT_DIR || '/tmp';
const PORT = 8099;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.glb': 'model/gltf-binary', '.md': 'text/plain',
};

const server = http.createServer((req, res) => {
  let p = path.join(SITE, decodeURIComponent(url.parse(req.url).pathname));
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
function section(t) { console.log(`\n${t}`); }
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `survivor-${name}.png`) });

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 840 } });

  const errors = [];
  const warnings = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(`CONSOLE: ${t}`);
    else if (m.type() === 'warning') warnings.push(t);
  });

  section('load and generate');
  await page.goto(`http://localhost:${PORT}/survivor/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#startBtn:not([hidden])', { timeout: 300000 });
  const stats = await page.textContent('#bootStats');
  console.log(`  ${stats.replace(/\n/g, '\n  ')}`);
  check('the page loads and the world generates with no error',
    errors.length === 0, errors.slice(0, 3).join(' | '));

  const registered = await page.evaluate(() => window.SurvivorGame.modules.map((m) => m.id));
  console.log(`  modules registered: ${registered.join(', ')}`);
  check('every module script registered', registered.length >= 15, `${registered.length}`);

  section('entering the island');
  await page.click('#startBtn');
  await page.waitForTimeout(9000);

  const first = await page.evaluate(() => {
    const S = window.SURVIVOR;
    return {
      canvas: !!document.querySelector('canvas'),
      hud: !document.getElementById('hud').hidden,
      vitals: document.getElementById('vitals').innerText,
      env: document.getElementById('env').innerText,
      log: document.getElementById('logBody').innerText,
      pois: S.world.pois.length,
      animals: S.world.ecology.animals.length,
      fish: S.world.fishery.fish.length,
      actors: S.game.actors.length,
      stats: S.game.stats,
      keys: (S.ctx && S.ctx.state) ? Object.keys(S.ctx.state) : [],
    };
  });
  check('a canvas is rendering', first.canvas);
  check('the HUD is up and reading the simulation',
    first.hud && /water/.test(first.vitals) && /season/.test(first.env));
  check('every named place is on the map', first.pois >= 15, `${first.pois}`);
  check('the island is populated', first.animals >= 450 && first.fish >= 100,
    `${first.animals} animals, ${first.fish} fish`);
  /* The whole point of the module work: before it there were about twenty
     actors in the scene — terrain, sea, the player. Buildings, trees, props
     and animals should put that into the hundreds. */
  check('modules put geometry in the world', first.actors > 120,
    `${first.actors} actors, ${first.stats.draws} draws`);
  console.log(`\n${first.vitals}\n\n${first.env}\n\n${first.log}`);
  await shot(page, 'firstperson');

  section('no module died on start');
  const moduleErrors = errors.filter((e) => /failed to start|module/i.test(e));
  check('no module failed to start', moduleErrors.length === 0, moduleErrors.join(' | '));
  const logText = await page.textContent('#logBody');
  check('and none reported itself broken', !/failed to start/.test(logText));

  section('walking');
  const before = await page.evaluate(() => {
    const p = window.SURVIVOR.player;
    return { x: p.x, z: p.z, water: p.body.bodyWaterL };
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(6000);
  await page.keyboard.up('w');
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => {
    const p = window.SURVIVOR.player;
    return { x: p.x, z: p.z, y: p.y, water: p.body.bodyWaterL,
      ground: window.SURVIVOR.world.map.heightAtWorld(p.x, p.z) };
  });
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  // The software rasteriser runs at about a frame a second, and movement is
  // driven by the engine's clamped frame delta, so six seconds of held W is
  // under a second of simulated walking. This only has to prove the input is
  // wired to the controller and the controller to the body.
  check('the player moves', moved > 0.3, `${moved.toFixed(1)} m`);
  check('and stands on the terrain rather than through it',
    Math.abs(after.y - after.ground) < 3.5,
    `player y ${after.y.toFixed(2)}, ground ${after.ground.toFixed(2)}`);
  check('and walking costs water', after.water < before.water,
    `${before.water.toFixed(3)} -> ${after.water.toFixed(3)} L`);

  section('every screen opens');
  // Each module binds a key; opening each one and closing it again is the
  // cheapest way to find a UI that throws the moment it is asked to draw.
  const SCREENS = [
    ['Tab', 'inventory'], ['m', 'map'], ['c', 'medical'],
    ['n', 'build'], ['x', 'wiring'], ['Escape', 'menu'],
  ];
  for (const [key, name] of SCREENS) {
    const errsBefore = errors.length;
    await page.keyboard.press(key);
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => {
      const vis = [...document.querySelectorAll('.screen')].filter((s) => !s.hidden);
      return vis.map((s) => s.id);
    });
    await shot(page, `screen-${name}`);
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
    check(`${name} opens without throwing`, errors.length === errsBefore,
      errors.slice(errsBefore).join(' | '));
    if (opened.length) console.log(`       (${name} -> ${opened.join(', ')})`);
  }

  section('interaction and the world reacting');
  const errsBeforeE = errors.length;
  for (const k of ['e', 'f', 'g', 'k', 'r', 'b', '[', ']', 'j', 'q', 'v', 'l', 'i', 'u', 'y', '1', '2']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(400);
  }
  check('interaction keys do not throw', errors.length === errsBeforeE,
    errors.slice(errsBeforeE).join(' | '));

  // Fire a shot however the weapons module wants it fired, then confirm the
  // ecology heard it. A missed shot telling every animal where you are is
  // the real cost of missing.
  const gunshot = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    let heard = null;
    S.ctx.on('gunshot', (d) => { heard = d; });
    // Put a rifle in hand however the module exposes it, then pull.
    if (S.ctx.state.giveWeapon) S.ctx.state.giveWeapon('remington700_308');
    else if (S.ctx.state.equipWeapon) S.ctx.state.equipWeapon('remington700_308');
    S.ctx.emit('debug:fire', {});
    await new Promise((r) => setTimeout(r, 1200));
    return heard;
  });
  if (gunshot) console.log(`       gunshot heard at ${Math.round(gunshot.audibleM || 0)} m`);

  section('looking at the island');
  await page.evaluate(() => {
    const { world, game } = window.SURVIVOR;
    world.clock.simSeconds = 13 * 3600;
    // A fixed aerial vantage: a manual camera, because the character has a
    // rigid body and gravity and putting it at 900 m simply drops it.
    game.lookAt([0, 900, -2100], [0, 60, 200]);
  });
  await page.waitForTimeout(6000);
  await shot(page, 'island');

  // And a low pass over the built-up part of the map, which is where the
  // building geometry either exists or does not.
  const poi = await page.evaluate(() => {
    const { world, game } = window.SURVIVOR;
    const hood = world.pois.find((p) => p.kind === 'neighbourhood')
      || world.pois.find((p) => p.kind === 'city');
    if (!hood) return null;
    game.lookAt([hood.x - 190, world.map.heightAtWorld(hood.x, hood.z) + 95, hood.z - 190],
      [hood.x, world.map.heightAtWorld(hood.x, hood.z) + 4, hood.z]);
    window.SURVIVOR.player.x = hood.x; window.SURVIVOR.player.z = hood.z;
    return { name: hood.name, kind: hood.kind, buildings: hood.buildings.length };
  });
  if (poi) {
    // Give the distance-budgeted builders a moment to notice the player moved.
    await page.waitForTimeout(12000);
    await shot(page, 'settlement');
    const built = await page.evaluate(() => window.SURVIVOR.game.actors.length);
    console.log(`       ${poi.name}: ${poi.buildings} buildings in the data, ${built} actors in the scene`);
    check('standing in a settlement puts buildings in the scene', built > 200, `${built} actors`);
  }

  section('timekeeping');
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
  // 9 real seconds at 40x on a 40-minute day is 3.6 game hours.
  const elapsed = ((probe.hour - t0) + 24) % 24;
  check('the clock keeps real time regardless of frame rate',
    elapsed > 2.4 && elapsed < 4.8, `${elapsed.toFixed(2)} game hours, expected ~3.6`);
  console.log(`  software renderer: ${probe.fps} fps, ${probe.actors} actors, ${probe.draws} draws`);
  await shot(page, 'evening');

  section('a long session');
  // Twenty seconds of wall time at 40x is about eight game hours. This is
  // the leak test: actors, DOM nodes and listeners must not grow without
  // bound, and nothing may start throwing once the world has moved on.
  const beforeLong = await page.evaluate(() => ({
    actors: window.SURVIVOR.game.actors.length,
    nodes: document.querySelectorAll('*').length,
  }));
  const errsBeforeLong = errors.length;
  await page.waitForTimeout(20000);
  const afterLong = await page.evaluate(() => ({
    actors: window.SURVIVOR.game.actors.length,
    nodes: document.querySelectorAll('*').length,
    day: window.SURVIVOR.world.clock.totalDays,
    alive: window.SURVIVOR.player.body.alive,
    cause: window.SURVIVOR.player.body.causeOfDeath,
  }));
  check('nothing throws over a long session', errors.length === errsBeforeLong,
    errors.slice(errsBeforeLong).slice(0, 3).join(' | '));
  check('actors do not grow without bound',
    afterLong.actors < Math.max(beforeLong.actors * 2.5, beforeLong.actors + 400),
    `${beforeLong.actors} -> ${afterLong.actors}`);
  check('DOM nodes do not grow without bound',
    afterLong.nodes < beforeLong.nodes + 600, `${beforeLong.nodes} -> ${afterLong.nodes}`);
  console.log(`       reached day ${afterLong.day + 1}; alive: ${afterLong.alive}${afterLong.cause ? ` (${afterLong.cause})` : ''}`);

  section('overall');
  check('no console error at any point in the session',
    errors.length === 0, errors.slice(0, 5).join(' | '));
  if (warnings.length) console.log(`  (${warnings.length} console warnings, not failures)`);

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`screenshots in ${SHOTS}`);
  if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  if (errors.length) {
    console.log('\nErrors seen:');
    for (const e of [...new Set(errors)].slice(0, 20)) console.log(`  - ${e}`);
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILED:', e.message); process.exit(1); });
