#!/usr/bin/env node
/* The pause menu, the swap animation, and rebindable keys.
 *
 * "Make the pause menu work" and "every key rebindable, and the
 * rebinding has to actually apply" are both on the list, and neither is
 * answerable by reading the code -- the pause path looked complete the
 * last three times I read it. So this drives the real thing: boot the
 * game, press the real key, and check the game actually STOPPED.
 *
 * Usage: node engine/test/pause.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '/tmp';

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
  const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  for (const f of ['site/engine/legend-engine.js', 'site/games/bunker-nine.js',
    'site/games/coastline.js', 'site/games/mp-data.js', 'site/games/bunker-nine-shell.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
  }
  /* The REAL boot -- SHELL.boot builds the bunker itself, so what this
     drives afterwards is the game a player would be in, under the shell
     that owns the pause key. Anything that bypassed the shell would be
     testing a pause menu that is not the one shipping. */
  await page.evaluate(() => { window.__boot = BUNKER_SHELL.boot({ canvas: '#game' }); });
  const started = await page.waitForFunction(
    () => { const h = BUNKER_SHELL.handle(); return !!(h && h.game); },
    null, { timeout: 240000 }).then(() => true).catch(() => false);
  check('the game starts', started);
  if (!started) {
    console.log(`\n${passed} passed, ${failed + 1} failed`);
    await browser.close();
    process.exit(1);
  }
  /* Wait for the boot to FINISH -- it is a promise chain and the game
     exists several steps before the menu goes up, so calling into the
     shell as soon as `handle.game` appears gets the menu drawn back
     over you a moment later. */
  await page.waitForFunction(() => {
    const m = document.querySelector('#b9shell .menu');
    return m && m.classList.contains('on');
  }, null, { timeout: 240000 });

  /* Into the game by the route the PLAY button takes. Anything else is
     testing a path no player uses, which is how the Escape handler came
     to be installed on exactly one of them. */
  await page.evaluate(() => { BUNKER_SHELL.intoGame(); });
  await page.waitForTimeout(500);

  /* Is the loop even turning? Under SwiftShader at a capped frame rate a
     real second of wall clock can be a handful of frames, so every
     "time passed" check below is measured against THIS rather than
     against an assumed sixty. */
  const rate = await page.evaluate(async () => {
    const g = BUNKER_SHELL.handle().game;
    const a = g.time;
    await new Promise((r) => setTimeout(r, 800));
    return { a, b: g.time, running: !!g.running, paused: !!g.paused };
  });
  console.log(`  .. loop: ${(rate.b - rate.a).toFixed(3)}s of game time in 0.8s wall, running=${rate.running}`);
  check('the game loop is turning', rate.running && rate.b - rate.a > 0.05,
    `advanced ${(rate.b - rate.a).toFixed(3)}s, running=${rate.running}`);

  /* ---- pause ---- */
  const before = await page.evaluate(() => ({
    paused: !!BUNKER_SHELL.handle().game.paused,
    shown: !document.querySelector('#b9shell').classList.contains('gone'),
    t: BUNKER_SHELL.handle().game.time || 0,
  }));
  check('the game is running before Escape', !before.paused && !before.shown);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  const mid = await page.evaluate(() => ({
    paused: !!BUNKER_SHELL.handle().game.paused,
    panel: document.querySelector('#b9shell .pause').classList.contains('on'),
    shown: !document.querySelector('#b9shell').classList.contains('gone'),
    acts: document.querySelectorAll('#b9shell .pauseacts .item').length,
    body: (document.querySelector('#b9shell .pbody') || {}).textContent || '',
  }));
  check('Escape shows the pause panel', mid.panel && mid.shown);
  check('and the game actually stops', mid.paused);
  check('the panel offers resume, settings and quit', mid.acts >= 3, `${mid.acts} rows`);
  check('and it shows the run so far', /Round|Points|Weapons|Kills/i.test(mid.body),
    mid.body.slice(0, 60));

  /* A paused game must not advance. This is the check that matters and
     the one that cannot be made by reading the code. */
  const t0 = await page.evaluate(() => BUNKER_SHELL.handle().game.time || 0);
  await page.waitForTimeout(700);
  const t1 = await page.evaluate(() => BUNKER_SHELL.handle().game.time || 0);
  check('and no time passes while it is paused', Math.abs(t1 - t0) < 0.02,
    `advanced ${(t1 - t0).toFixed(3)}s`);

  await page.screenshot({ path: path.join(OUT, 'pause-menu.png') });

  /* ---- resume ---- */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => ({
    paused: !!BUNKER_SHELL.handle().game.paused,
    shown: !document.querySelector('#b9shell').classList.contains('gone'),
  }));
  check('Escape again resumes', !after.paused && !after.shown);
  const t2 = await page.evaluate(() => BUNKER_SHELL.handle().game.time || 0);
  await page.waitForTimeout(600);
  const t3 = await page.evaluate(() => BUNKER_SHELL.handle().game.time || 0);
  check('and time runs again', t3 - t2 > 0.2, `advanced ${(t3 - t2).toFixed(3)}s`);

  /* ---- the swap animation ---- */
  const swap = await page.evaluate(async () => {
    const h = BUNKER_SHELL.handle();
    const P = h.P, g = h.game;
    const slot0 = P.slot;
    /* Through the engine's own input, which is what the game reads --
       a synthetic KeyboardEvent on window reaches the shell's listeners
       and nothing else, so the first version of this pressed a key the
       game could not hear and then reported that swapping was broken. */
    const i = g.input;
    i.keys.add('q'); i.pressed.add('q');
    await new Promise((r) => setTimeout(r, 140));
    i.keys.delete('q');
    const mid2 = { t: P.swapT, slot: P.slot };
    await new Promise((r) => setTimeout(r, 1400));
    return { slot0, midT: mid2.t, midSlot: mid2.slot, endSlot: P.slot, endT: P.swapT };
  });
  console.log(`  .. swap: slot ${swap.slot0} -> ${swap.endSlot}, timer mid ${(+swap.midT).toFixed(2)} end ${(+swap.endT).toFixed(2)}`);
  check('asking to swap starts a timed animation rather than teleporting the gun',
    swap.midT > 0, `timer ${swap.midT}`);
  check('the swap is still mid-flight a frame later, not already finished',
    swap.midSlot === swap.slot0, `slot changed to ${swap.midSlot} immediately`);
  check('and it lands on the other weapon', swap.endSlot !== swap.slot0 && swap.endT === 0,
    `${swap.slot0} -> ${swap.endSlot}, timer ${swap.endT}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
