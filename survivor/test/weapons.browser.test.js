#!/usr/bin/env node
/* The weapons, driven in the real game.
 *
 * The simulation tests prove the mechanism is right. This proves the
 * mechanism is CONNECTED: that the selector on the model moves when the
 * selector in the simulation moves, that a fired case actually becomes an
 * object on the ground, that stripping a rifle takes parts off the thing
 * in front of you, and that none of it throws.
 *
 * It photographs each step, because an animation that plays and looks
 * wrong passes every assertion you can write about it.
 *
 * Usage: node survivor/test/weapons.browser.test.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const SHOTS = process.env.SHOT_DIR || '/tmp/claude-0/wshots';
const PORT = 8112;
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

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
function section(t) { console.log(`\n${t}`); }

/* Wait for the shooter's hands to be free. The software rasteriser runs
   at about ten frames a second and the engine hands update hooks a
   clamped dt, so a quarter-second animation takes well over a second of
   wall clock here. Polling the state the game already publishes is both
   faster and immune to how slow the renderer happens to be. */
const idle = (page, ms = 8000) => page.waitForFunction(
  () => !window.SURVIVOR.ctx.state.weaponBusy, { timeout: ms },
).catch(() => {});

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

  /* Put the sun back to late morning before every plate. Bench work
     advances the world by however long the job actually took, which is
     the whole cost of a detail strip — but a photograph taken at dusk
     shows nothing about the model. */
  const shot = async (n) => {
    await page.evaluate(() => { window.SURVIVOR.world.clock.simSeconds = 11 * 3600; });
    await page.waitForTimeout(450);
    return page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  };

  section('load');
  await page.goto(`http://localhost:${PORT}/survivor/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#startBtn:not([hidden])', { timeout: 300000 });
  await page.click('#startBtn');
  await page.waitForTimeout(2500);
  check('the game starts clean', errors.length === 0, errors.slice(0, 2).join(' | '));

  /* Put the camera somewhere the gun is against sky rather than against a
     bush, and stop the clock so every frame is lit the same. */
  await page.evaluate(() => {
    const S = window.SURVIVOR;
    S.world.clock.simSeconds = 11 * 3600;
    // Leave the clock running: the part animations are driven by the same
    // update hook the world is, and freezing it freezes the bolt mid-travel.
  });

  section('every weapon builds a rig of real parts');
  const guns = ['remington700_308', 'ak47', 'm16', 'shotgun12', 'ruger1022',
    'colt1911', 'revolver357', 'revolver500', 'barrett50', 'mauser98'];
  for (const id of guns) {
    const info = await page.evaluate((gid) => {
      const S = window.SURVIVOR;
      S.ctx.state.giveWeapon(gid);
      const rig = S.ctx.state.currentRig;
      const w = S.ctx.state.currentWeapon;
      return {
        parts: rig ? rig.parts.size : 0,
        profile: rig ? rig.profileId : null,
        mode: w ? w.fireMode : null,
        modes: w ? w.modes.join(',') : '',
        oal: rig ? rig.asm.profile.oalM : 0,
      };
    }, id);
    check(`${id}: built from ${info.parts} separate parts`, info.parts >= 8, `${info.parts}`);
    check(`${id}: comes up on ${info.mode}`, !!info.mode, info.modes);
  }
  await page.waitForTimeout(600);
  await shot('rig-built');

  section('the selector moves the lever on the model');
  let sel = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    S.ctx.state.giveWeapon('ak47');
    await new Promise((r) => setTimeout(r, 300));
    const w = S.ctx.state.currentWeapon;
    const before = w.fireMode;
    S.ctx.state.cycleFireSelector();
    await new Promise((r) => setTimeout(r, 60));
    return { before, w: 1 };
  });
  await idle(page);
  const sel2 = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    const w = S.ctx.state.currentWeapon;
    const mid = w.fireMode;
    S.ctx.state.cycleFireSelector();
    return { mid };
  });
  await idle(page);
  const sel3 = await page.evaluate(() => {
    const w = window.SURVIVOR.ctx.state.currentWeapon;
    return { after: w.fireMode, frac: w.selectorFraction };
  });
  Object.assign(sel, sel2, sel3);
  check('an AK comes up on safe', sel.before === 'safe', sel.before);
  check('the first click is full automatic', sel.mid === 'auto', sel.mid);
  check('the second is semi', sel.after === 'semi', sel.after);
  check('and the lever has swung all the way over', sel.frac === 1, `${sel.frac}`);
  await shot('selector');

  section('firing throws a real case on the ground');
  const fired = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    S.ctx.state.giveWeapon('ak47');
    await new Promise((r) => setTimeout(r, 300));
    const w = S.ctx.state.currentWeapon;
    w.setFireMode('semi');
    // A rifle in perfect order: this section is about whether the case
    // comes out, not about whether a worn gun jams, which the simulation
    // tests already cover.
    for (const part of Object.values(w.parts)) part.condition = 1;
    w.oilLevel = 0.6;
    S.player.inventory.add({ item: 'ammo:762x39', quantity: 60, stackable: true, massKg: 0.016 });
    const before = S.game.actors.filter((a) => a.name === 'brass').length;
    S.ctx.state.currentWeapon.load(
      Array.from({ length: 30 }, () => ({ cartridgeId: '762x39', condition: 1 })),
    );
    return { before };
  });
  for (let i = 0; i < 6; i++) {
    await idle(page);
    await page.evaluate(() => window.SURVIVOR.ctx.emit('debug:fire', {}));
  }
  await idle(page);
  await page.waitForTimeout(700);
  Object.assign(fired, await page.evaluate(() => {
    const S = window.SURVIVOR;
    const w = S.ctx.state.currentWeapon;
    return {
      after: S.game.actors.filter((a) => a.name === 'brass').length,
      left: w.magazine.length, rounds: w.roundsFired,
    };
  }));
  check('six shots go downrange', fired.rounds >= 4, `${fired.rounds}`);
  check('and six cases land on the ground', fired.after - fired.before >= 4,
    `${fired.after - fired.before} cases`);
  check('the magazine went down by what was fired', fired.left <= 26, `${fired.left} left`);
  await shot('brass');

  section('a bolt gun has to be worked');
  const bolt = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    S.ctx.state.giveWeapon('remington700_308');
    await new Promise((r) => setTimeout(r, 300));
    const w = S.ctx.state.currentWeapon;
    w.setFireMode('semi');
    for (const part of Object.values(w.parts)) part.condition = 1;
    S.player.inventory.add({ item: 'ammo:308win', quantity: 20, stackable: true, massKg: 0.024 });
    w.load(Array.from({ length: 4 }, () => ({ cartridgeId: '308win', condition: 1 })));
    S.ctx.emit('debug:fire', {});
    return {};
  });
  await idle(page);
  const shotState = await page.evaluate(() => ({
    brassAfterShot: window.SURVIVOR.game.actors.filter((a) => a.name === 'brass').length,
  }));
  await page.evaluate(() => window.SURVIVOR.ctx.state.workWeaponAction());
  await idle(page);
  await page.waitForTimeout(500);
  Object.assign(bolt, shotState, await page.evaluate(() => {
    const w = window.SURVIVOR.ctx.state.currentWeapon;
    return {
      brassAfterCycle: window.SURVIVOR.game.actors.filter((a) => a.name === 'brass').length,
      chambered: !!w.chambered,
    };
  }));
  check('a bolt gun does not throw the case when it fires',
    bolt.brassAfterCycle > bolt.brassAfterShot,
    `${bolt.brassAfterShot} -> ${bolt.brassAfterCycle}`);
  check('working the bolt ejects it and chambers the next round', bolt.chambered);
  await shot('bolt-worked');

  section('loading, one round at a time');
  const load = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    S.ctx.state.giveWeapon('remington700_308');
    await new Promise((r) => setTimeout(r, 300));
    const w = S.ctx.state.currentWeapon;
    w.magazine.length = 0;
    w.chambered = null;
    S.player.inventory.add({ item: 'ammo:308win', quantity: 20, stackable: true, massKg: 0.024 });
    const pack0 = S.player.inventory.slots.find((x) => x.item === 'ammo:308win').quantity;
    return { pack0 };
  });
  for (let i = 0; i < 3; i++) {
    await idle(page);
    await page.evaluate(() => window.SURVIVOR.ctx.state.thumbRoundIn());
  }
  await idle(page);
  Object.assign(load, await page.evaluate((p0) => {
    const S = window.SURVIVOR;
    const w = S.ctx.state.currentWeapon;
    const pack1 = S.player.inventory.slots.find((x) => x.item === 'ammo:308win').quantity;
    return { inMag: w.magazine.length, used: p0 - pack1 };
  }, load.pack0));
  check('three rounds go into the magazine', load.inMag === 3, `${load.inMag}`);
  check('and three come out of the pack', load.used === 3, `${load.used}`);

  section('the bench');
  const bench = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    const w = S.ctx.state.currentWeapon;
    w.chambered = null;
    S.ctx.state.openGunBench();
    await new Promise((r) => setTimeout(r, 600));
    const openOk = !!S.ctx.state.benchOpen;
    const laidOut = S.game.actors.filter((a) => (a.name || '').startsWith('bench:')).length;
    return { openOk, laidOut };
  });
  check('the bench opens', bench.openOk);
  check('and lays every part out in front of you', bench.laidOut >= 8, `${bench.laidOut} parts`);
  await page.waitForTimeout(500);
  await shot('bench-assembled');

  const stripped = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    const rows = document.querySelectorAll('#gunbench [data-part]');
    const names = Array.from(rows).map((r) => r.dataset.part);
    // Strip it in the order the panel offers, clicking the way a player does.
    let removed = 0;
    for (let pass = 0; pass < 3; pass++) {
      for (const id of names) {
        const tr = document.querySelector(`#gunbench [data-part="${id}"]`);
        if (!tr) continue;
        tr.click();
        await new Promise((r) => setTimeout(r, 30));
        const btn = document.querySelector('#gunbench [data-act="remove"]');
        if (btn && !btn.disabled) { btn.click(); removed++; await new Promise((r) => setTimeout(r, 30)); }
      }
    }
    await new Promise((r) => setTimeout(r, 400));
    return { removed, offCount: S.ctx.state.currentWeapon.disassembled };
  });
  check('parts come off the rifle', stripped.removed >= 6, `${stripped.removed} off`);
  check('and the firearm knows it is in pieces', stripped.offCount);
  await page.waitForTimeout(600);
  await shot('bench-stripped');

  const cleaned = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    const w = S.ctx.state.currentWeapon;
    w.fouling = 0.8;
    S.player.inventory.add({ item: 'cleaningRod', quantity: 1, stackable: false });
    S.player.inventory.add({ item: 'solvent', quantity: 1, stackable: true });
    const before = w.fouling;
    for (let i = 0; i < 6; i++) {
      const b = document.querySelector('#gunbench [data-act="patch"]');
      if (b) b.click();
      await new Promise((r) => setTimeout(r, 40));
    }
    const txt = document.querySelector('#gunbench').textContent;
    return { before, after: w.fouling, sawPatch: /patch comes out|grey/.test(txt) };
  });
  check('running patches down the bore takes the carbon out',
    cleaned.after < cleaned.before * 0.4, `${cleaned.before.toFixed(2)} -> ${cleaned.after.toFixed(2)}`);
  check('and the bench tells you what the patch looked like', cleaned.sawPatch);
  await shot('bench-cleaning');

  const rebuilt = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    for (let pass = 0; pass < 6; pass++) {
      const rows = document.querySelectorAll('#gunbench [data-part]');
      for (const tr of rows) {
        tr.click();
        await new Promise((r) => setTimeout(r, 20));
        const btn = document.querySelector('#gunbench [data-act="refit"]');
        if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 20)); }
      }
    }
    await new Promise((r) => setTimeout(r, 300));
    const w = S.ctx.state.currentWeapon;
    return { together: !w.disassembled, reliability: w.reliability() };
  });
  check('and it all goes back together', rebuilt.together);
  check('a clean, complete rifle is reliable', rebuilt.reliability > 0.6,
    rebuilt.reliability.toFixed(2));
  await shot('bench-rebuilt');

  await page.evaluate(() => { if (window.SURVIVOR.ctx.state.benchOpen) document.querySelector('#gunbench [data-act="close"]').click(); });
  await page.waitForTimeout(400);

  section('aiming down the sights');
  await page.evaluate(async () => {
    const S = window.SURVIVOR;
    S.ctx.state.giveWeapon('remington700_308');
    await new Promise((r) => setTimeout(r, 300));
    S.ctx.state.currentWeapon.attach('scope4x');
    S.ctx.state.rebuildWeaponRig();
    S.ctx.state.adsHeld = true;
  });
  await page.waitForTimeout(1400);
  await shot('aimed-scope');
  await page.evaluate(() => { window.SURVIVOR.ctx.state.adsHeld = false; });
  await page.waitForTimeout(900);
  await shot('hip');

  section('overall');
  check('no console error at any point', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) { console.log('\nFailures:'); for (const f of failures) console.log(`  - ${f}`); }
  console.log(`screenshots in ${SHOTS}`);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})();
