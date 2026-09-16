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
  await page.waitForTimeout(400);

  /* AND ACTUALLY START THE ROUND. Until you have chosen a character and
     pressed something, the whole update returns at `if (S.gameOver ||
     !S.started) return` -- deliberately, so the world is not live behind
     the character screen. Any keydown starts it.

     This test pressed only Escape, which the pause handler swallows with
     stopPropagation, so the round never began -- and every input check
     after that was driving a game that was still on its title card. It
     took four passes to find, because "the game is running" was checked
     as `game.paused === false`, which was perfectly true of a game that
     had not started. */
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  const begun = await page.evaluate(() => !!BUNKER_SHELL.handle().S.started);
  check('the round actually begins', begun);

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
  const back = await page.evaluate(async () => {
    const g = BUNKER_SHELL.handle().game;
    const a = g.time;
    const snap = {
      paused: !!g.paused, running: !!g.running,
      cap: g.renderer && g.renderer.quality ? g.renderer.quality.fpsCap : null,
      phase: BUNKER_SHELL.phase ? BUNKER_SHELL.phase() : '?',
      scale: g.timeScale,
    };
    /* Three seconds, not one. SwiftShader renders this scene at about
       two and a third frames a second -- measured, from the loop check
       above: 0.233s of game time per 0.8s of wall clock with dt clamped
       at 0.1. A nine-hundred-millisecond window can therefore contain
       ZERO frames and report that a perfectly healthy game has stopped,
       which is what it did. */
    await new Promise((r) => setTimeout(r, 3000));
    return Object.assign(snap, { a, b: g.time, running2: !!g.running, paused2: !!g.paused });
  });
  console.log(`  .. after resume: paused=${back.paused}/${back.paused2} running=${back.running}/${back.running2} cap=${back.cap} phase=${back.phase} scale=${back.scale} -> ${(back.b - back.a).toFixed(3)}s`);
  check('and time runs again', back.b - back.a > 0.05, `advanced ${(back.b - back.a).toFixed(3)}s`);

  /* ---- the swap animation ---- */
  const swap = await page.evaluate(() => {
    const h = BUNKER_SHELL.handle();
    const P = h.P, g = h.game;
    /* YOU START WITH ONE GUN. slots is ['m1911'] at spawn, and
       beginSwap returns immediately when the slot asked for does not
       exist -- correctly. The first three runs of this reported the
       swap animation broken when what it had actually proved is that a
       man holding one pistol cannot swap to a second one. */
    if (P.slots.length < 2) { P.slots.push('thompson'); P.slot = 0; }
    const slot0 = P.slot;
    /* STEPPED BY HAND, and both halves of that matter.

       Through the engine's own input, because a synthetic KeyboardEvent
       on window reaches the shell's listeners and nothing the GAME
       reads -- the first version pressed a key the game could not hear
       and then reported swapping broken.

       And stepped rather than waited, because this renderer manages
       about two frames a second: a wall-clock wait long enough to
       contain the swap is long enough to be flaky, and a short one
       contains no frames at all. */
    const i = g.input;
    const CTL = h.S && h.S.controls;
    const diag = {
      slots: P.slots.slice(), knifeOut: !!P.knifeOut, alive: P.alive !== false,
      down: !!P.down, gamePaused: !!g.paused,
      bound: h.S.binds && h.S.binds.keys ? h.S.binds.keys.swap : '(none)',
    };
    i.keys.add('q'); i.pressed.add('q');
    diag.justPressed = i.justPressed('q');
    diag.ctlHit = CTL ? CTL.hit('swap') : null;
    g.step(1 / 60);
    const mid2 = { t: P.swapT, slot: P.slot };
    diag.afterStepT = P.swapT;
    i.keys.delete('q'); i.pressed.delete('q');
    for (let n = 0; n < 200 && P.swapT > 0; n++) g.step(1 / 60);
    return { slot0, midT: mid2.t, midSlot: mid2.slot, endSlot: P.slot, endT: P.swapT, diag };
  });
  console.log(`  .. swap: slot ${swap.slot0} -> ${swap.endSlot}, timer mid ${(+swap.midT).toFixed(2)} end ${(+swap.endT).toFixed(2)}`);
  console.log(`  .. swap diag: ${JSON.stringify(swap.diag)}`);
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
