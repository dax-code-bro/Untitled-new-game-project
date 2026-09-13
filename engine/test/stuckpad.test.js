#!/usr/bin/env node
/* A pad that rests with a button down must not play the game for you.
 *
 * Two reports, months apart, one cause:
 *
 *   "whenever I go up to a barrier I automatically start building it"
 *   "sometimes it just plays the game in the character choosing screen"
 *
 * Both are a button nobody is pressing reading as held. Boarding a window
 * is a HELD key, so a stuck `use` boards it by walking up; and the title
 * screen started on `any button still down`, tested as a level eight
 * times a second, so a pad resting on anything started the round before
 * a character had been chosen.
 *
 * The guard is that a button has to be seen RELEASED before it is
 * believed -- the rule the right trigger has had for a while, now applied
 * to the whole pad. This test fakes a pad that is stuck from the first
 * poll and checks that nothing at all happens.
 *
 * Usage: node engine/test/stuckpad.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('stuckpad tests need playwright: npm i --no-save playwright');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

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
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');

  /* A gamepad with EVERY button held, from the very first poll, and both
     triggers resting at full. This is the worn pad, the knock-off, and
     the one somebody was holding as the page loaded, all at once.
     
     Installed here rather than through addInitScript, because an init
     script runs on NAVIGATION and setContent on about:blank is not one:
     the first version of this test never installed the pad at all, and
     three of its checks passed against a machine with no controller
     plugged in. A test that passes because the thing it is testing is
     absent is worse than no test. It asserts the pad is seen now, first,
     before it asserts anything about what the pad does.
     
     The engine reads navigator.getGamepads at poll time rather than at
     load, so installing it before the game's scripts go in is enough. */
  await page.evaluate(() => {
    const mk = (pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 });
    window.__STUCK = true;
    navigator.getGamepads = () => [{
      id: 'stuck test pad', index: 0, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => mk(!!window.__STUCK)),
      timestamp: performance.now(),
    }];
  });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });

  const r = await page.evaluate(async () => {
    const B = BUNKER.start({ canvas: '#game', test: true, holdTitle: true, quality: 'low' });
    const S = B.S, P = B.P, G = B.game;
    const out = {};
    const step = (n) => { for (let i = 0; i < n; i++) { S.toSpawn = 0; S.spawnT = 1e9; G.step(1 / 60); } };

    // --- the title must hold ---------------------------------------------
    step(60);
    // The pad watcher runs on an interval, so give it real time too.
    await new Promise((res) => setTimeout(res, 700));
    step(30);
    out.startedWithStuckPad = !!S.started;
    out.padConnected = !!G.input.pad.connected;
    // The engine must be refusing every one of them.
    out.buttonsBelieved = Object.values(G.input.pad.buttons).filter(Boolean).length;

    // --- and a real press must still work ---------------------------------
    window.__STUCK = false;          // let go of everything
    step(6);
    out.afterRelease = Object.values(G.input.pad.buttons).filter(Boolean).length;
    window.__STUCK = true;           // and press again, for real this time
    step(6);
    out.afterRealPress = Object.values(G.input.pad.buttons).filter(Boolean).length;
    await new Promise((res) => setTimeout(res, 400));
    step(10);
    out.startedAfterRealPress = !!S.started;

    // --- a stuck `use` must not board a window ---------------------------
    // Put the round in play, strip a window, and stand at it with the pad
    // still jammed. Nothing should go back up.
    window.__STUCK = true;
    const win = S.windows[0];
    for (let i = 0; i < win.boards.length; i++) {
      if (win.boards[i]) { try { win.boards[i].destroy(); } catch (e) { void e; } win.boards[i] = null; }
    }
    out.strippedTo = win.boards.filter(Boolean).length;
    const w = win.def.inside;
    window.__T.teleport(w[0], w[1] + 0.9, w[2]);
    step(240);                        // four seconds: a full window is five
    out.boardsAfterStanding = win.boards.filter(Boolean).length;
    out.autoRepairSettingGone = typeof S.toggles.autoRepair === 'undefined';
    return out;
  });

  console.log(JSON.stringify(r, null, 1));
  console.log('');

  check('the pad is seen at all', r.padConnected);
  check('a pad stuck from the first poll is not believed', r.buttonsBelieved === 0,
    `${r.buttonsBelieved} buttons reading as down`);
  check('and it does not start the game over the character screen',
    r.startedWithStuckPad === false);
  check('letting go clears it', r.afterRelease === 0, `${r.afterRelease}`);
  check('a real press after that IS believed', r.afterRealPress > 0, `${r.afterRealPress}`);
  check('and a real press starts the game', r.startedAfterRealPress === true);
  check('the window is stripped to start with', r.strippedTo === 0, `${r.strippedTo}`);
  check('standing at a window with a jammed pad boards nothing',
    r.boardsAfterStanding === 0, `${r.boardsAfterStanding} boards went back up`);
  check('there is no auto-repair setting left to misfire', r.autoRepairSettingGone);
  check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
