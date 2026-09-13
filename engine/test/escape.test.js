#!/usr/bin/env node
/* Coastline's ending, end to end.
 *
 * The same reason the flamingo got a test: on this map, three features
 * in a row parsed, built, and silently did nothing -- a pier slab with
 * negative length, an auto-fire flag only one code path read, and a
 * Pack-a-Punch sitting below an early `return null` that no render could
 * have shown. An ending is worse than any of those to get wrong, because
 * it is the one thing in the game a player only sees once.
 *
 * So, in order:
 *   - is the can in the house, and is it refused before you have it?
 *   - does taking it slow you down?
 *   - is the boat past the break, where you have to swim to it?
 *   - fuel, crank, cast off -- in that order and no other
 *   - does the camera actually leave the player's head?
 *   - does the beach exist, with the character you picked standing on it?
 *
 * Usage: node engine/test/escape.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('escape tests need playwright: npm i --no-save playwright');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.ESCAPE_SHOTS || null;

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 760, height: 430 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/coastline.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: 'coastline' });
    const S = B.S, P = B.P, G = B.game, C = window.COASTLINE;
    const T = window.__T, SYS = window.__T_SYS;
    const step = (n) => { for (let i = 0; i < n; i++) { S.toSpawn = 0; S.spawnT = 1e9; G.step(1 / 60); } };
    step(12);
    const out = { errors: [] };
    const at = (x, y, z) => { T.teleport(x, y, z); step(2); return SYS.nearestInteract(S, P); };
    const doIt = (it) => { if (it) SYS.doInteract(G, S, P, B.hud, S.sfx || {}, it, 1 / 60); return it && it.kind; };

    out.hasState = !!S.escape;
    out.canAt = S.escapeCan ? S.escapeCan.at.slice() : null;
    out.boatAt = S.escapeBoat ? S.escapeBoat.at.slice() : null;
    out.canParts = S.escapeCan ? S.escapeCan.parts.length : 0;

    /* The boat has to be past the hole in the pier. If it is not, the
       whole design is "walk to the end of the dock", which is not what
       this is for. */
    out.breakZ = [C.PAP.breaks.z0, C.PAP.breaks.z1];
    out.boatPastBreak = out.boatAt[2] > C.PAP.breaks.z1;
    out.boatInWater = out.boatAt[1] < C.C.water.y;

    /* The can is in the gable house, which is behind a 2000 point door.
       Check that the door exists and covers the way in. */
    out.doors = Object.keys(S.doors || {});
    out.canInGableHouse = Math.abs(out.canAt[0] - C.C.gable.x) < C.C.gable.w / 2
      && Math.abs(out.canAt[2] - C.C.gable.z) < C.C.gable.d / 2;

    // --- the boat refuses an empty-handed visitor ------------------------
    const cold = at(S.escapeBoat.at[0] - 1.0, S.escapeBoat.at[1] + 0.4, S.escapeBoat.at[2]);
    out.beforeCan = cold && { kind: cold.kind, label: cold.label, inert: !!cold.inert };

    // --- take the can ----------------------------------------------------
    const offer = at(out.canAt[0] - 0.5, 0.13, out.canAt[2] + 0.7);
    out.canOffer = offer && { kind: offer.kind, label: offer.label };
    doIt(offer);
    out.hasCan = !!S.escape.hasCan;
    out.canGone = S.escapeCan.parts.length === 0;
    // Weight: the walk back is supposed to cost something.
    step(4);
    out.speedWithCan = +P.actor.controller.moveSpeed.toFixed(3);
    S.escape.hasCan = false; step(4);
    out.speedWithout = +P.actor.controller.moveSpeed.toFixed(3);
    S.escape.hasCan = true; step(2);

    // --- fuel it ---------------------------------------------------------
    const f = at(S.escapeBoat.at[0] - 1.0, S.escapeBoat.at[1] + 0.4, S.escapeBoat.at[2]);
    out.fuelOffer = f && { kind: f.kind, label: f.label };
    doIt(f);
    out.pouring = S.escape.fuelling > 0;
    // Nothing else is on offer while it pours.
    const mid = SYS.nearestInteract(S, P);
    out.whilePouring = mid && { kind: mid.kind, inert: !!mid.inert };
    step(Math.ceil(C.ESCAPE.pour * 60) + 10);
    out.fuelled = !!S.escape.fuelled;
    out.canSpent = !S.escape.hasCan;

    // --- crank it --------------------------------------------------------
    const c2 = SYS.nearestInteract(S, P);
    out.crankOffer = c2 && { kind: c2.kind, label: c2.label };
    doIt(c2);
    step(Math.ceil(C.ESCAPE.crank * 60) + 10);
    out.started = !!S.escape.started;

    // --- cast off --------------------------------------------------------
    const go = SYS.nearestInteract(S, P);
    out.castOffer = go && { kind: go.kind, label: go.label };
    const camBefore = [G.camera.position.x, G.camera.position.y, G.camera.position.z];
    doIt(go);
    out.running = !!S.escape.running;
    out.boatParts = S.escape.boatParts ? S.escape.boatParts.length : 0;
    out.playerHidden = P.actor.visible === false;

    // The boat moves, and the camera is no longer in the player's head.
    const z0 = S.escape.boatParts.length ? S.escape.boatParts[0].position.z : null;
    step(180);
    const z1 = S.escape.boatParts.length ? S.escape.boatParts[0].position.z : null;
    out.boatMoved = (z0 != null && z1 != null) ? +(z1 - z0).toFixed(2) : null;
    const camNow = [G.camera.position.x, G.camera.position.y, G.camera.position.z];
    out.camMoved = +Math.hypot(camNow[0] - camBefore[0], camNow[1] - camBefore[1],
      camNow[2] - camBefore[2]).toFixed(2);
    out.camMode = G._camMode;
    out.stage = S.escape.stage;

    // --- all the way to the beach ---------------------------------------
    const D = C.ESCAPE;
    step(Math.ceil((D.run + D.fade + D.sit + 3) * 60));
    out.endStage = S.escape.stage;
    out.done = !!S.escape.done;
    const beach = S.escape.beachAt;
    out.camOnBeach = Math.abs(G.camera.position.x - beach[0]) < 40;
    // Is anything actually built out there?
    let sandy = 0, hero = null;
    for (const a of G.actors) {
      if (!a || !a.position) continue;
      if (Math.abs(a.position.x - beach[0]) > 60) continue;
      sandy++;
      if (/^hero:/.test(a.name || '') && a.visible) hero = a.name;
    }
    out.beachParts = sandy;
    out.heroOnBeach = hero;
    out.heroId = S.heroId;
    out.titleUp = B.hud.els.title.style.display === 'flex';
    out.titleText = (B.hud.els.title.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return out;
  });

  console.log(JSON.stringify(r, null, 1).slice(0, 2400));
  console.log('');

  check('the map has a way out at all', r.hasState);
  check('the can is in the gable house', r.canInGableHouse, JSON.stringify(r.canAt));
  check('that house has a door on it', (r.doors || []).includes('gable'), JSON.stringify(r.doors));
  check('the boat is past the hole in the pier', r.boatPastBreak,
    `boat z ${r.boatAt && r.boatAt[2]} vs break ${JSON.stringify(r.breakZ)}`);
  check('and it is sitting in the water', r.boatInWater, JSON.stringify(r.boatAt));
  check('empty handed, the boat will not deal',
    r.beforeCan && r.beforeCan.kind === 'escapeCold' && r.beforeCan.inert,
    JSON.stringify(r.beforeCan));
  check('the can can be picked up', r.canOffer && r.canOffer.kind === 'takeCan',
    JSON.stringify(r.canOffer));
  check('and it leaves the worktop when you do', r.hasCan && r.canGone);
  check('carrying it slows you down', r.speedWithCan < r.speedWithout - 0.05,
    `${r.speedWithCan} vs ${r.speedWithout}`);
  check('with the can, the boat wants filling', r.fuelOffer && r.fuelOffer.kind === 'fuelBoat',
    JSON.stringify(r.fuelOffer));
  check('and there is nothing to do while it pours',
    r.whilePouring && r.whilePouring.inert, JSON.stringify(r.whilePouring));
  check('four seconds later the tank is full and the can is spent',
    r.fuelled && r.canSpent);
  check('then it wants turning over', r.crankOffer && r.crankOffer.kind === 'crankBoat',
    JSON.stringify(r.crankOffer));
  check('three seconds of that and it runs', r.started);
  check('then you can cast off', r.castOffer && r.castOffer.kind === 'castOff',
    JSON.stringify(r.castOffer));
  check('casting off takes the round out of your hands', r.running && r.playerHidden);
  check('the boat actually moves', r.boatParts > 0 && r.boatMoved > 5,
    `${r.boatParts} parts, moved ${r.boatMoved}m`);
  check('the camera leaves the player', r.camMoved > 3 && r.camMode === 'manual',
    `moved ${r.camMoved}m, mode ${r.camMode}`);
  check('it reaches the beach', r.endStage === 2 && r.camOnBeach, `stage ${r.endStage}`);
  check('there is a beach out there to reach', r.beachParts > 20, `${r.beachParts} parts`);
  check('with the character you picked standing on it',
    r.heroOnBeach === 'hero:' + r.heroId, `${r.heroOnBeach} vs hero:${r.heroId}`);
  check('and it says you got out', r.done && r.titleUp && /GOT OUT/.test(r.titleText),
    r.titleText);
  check('no page errors', errors.length === 0, errors.join(' | '));

  if (OUT) {
    await page.screenshot({ path: OUT + '/escape-beach.jpg', type: 'jpeg', quality: 90 });
    console.log('  ' + OUT + '/escape-beach.jpg');
  }
  await browser.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
