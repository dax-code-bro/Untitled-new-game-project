#!/usr/bin/env node
/* SPRINT AND THE SLIDE, ON A CONTROLLER.
 *
 * L3 is a momentary stick click. It was bound as a HOLD, and nobody
 * holds a stick click down while running -- the thumb is on the stick,
 * steering. So on a pad `cmd.run` was false essentially always: no
 * sprint, no low-ready carry, no sprint animation, and no slide,
 * because a slide is entered from a sprint and from nothing else.
 *
 * Measured before the change, driving the real pad layer:
 *
 *     L3 HELD DOWN      sprinting true,  sliding true
 *     L3 CLICKED        sprinting FALSE, sliding FALSE
 *
 * and a click is what a stick click is. This is the guard on the fix.
 *
 * Usage: node engine/test/padsprint.test.js
 */
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

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
  await page.addInitScript(() => {
    window.__pad = {
      mapping: 'standard', id: 'test pad', index: 0, connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 },
        () => ({ pressed: false, touched: false, value: 0 })),
    };
    navigator.getGamepads = () => [window.__pad];
  });
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=town&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.evaluate(() => window.MP.input._lock(true));
  await page.waitForTimeout(1200);

  const r = await page.evaluate(async () => {
    const G = window.MP, M = G.match, vm = G.viewmodel, pad = window.__pad;
    const you = M.you; you.alive = true;
    const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
    const settle = async (n) => { for (let i = 0; i < n; i++) await frame(); };
    const PAD = window.MP_PAD;
    const clear = async () => {
      pad.axes = [0, 0, 0, 0];
      for (const q of pad.buttons) { q.pressed = false; q.value = 0; }
      you.sliding = false; you.slideEnd = -99;
      await settle(14);
    };
    const click = async (i, n) => {
      pad.buttons[i].pressed = true; pad.buttons[i].value = 1;
      await settle(n || 2);
      pad.buttons[i].pressed = false; pad.buttons[i].value = 0;
      await settle(n || 2);
    };
    const out = { padMap: !!PAD, inspectBtn: PAD && PAD.inspect };

    /* ---- L3 CLICKED, which is what a stick click is ---- */
    await clear();
    pad.axes = [0, -1, 0, 0];               // stick forward, and held there
    await settle(8);
    await click(PAD.sprint);
    await settle(10);
    out.sprintAfterClick = !!you.sprinting;

    /* ---- and then circle, ONCE, is a slide ---- */
    let slid = false;
    pad.buttons[PAD.crouch].pressed = true; pad.buttons[PAD.crouch].value = 1;
    for (let i = 0; i < 6; i++) { await frame(); if (you.sliding) slid = true; }
    pad.buttons[PAD.crouch].pressed = false; pad.buttons[PAD.crouch].value = 0;
    for (let i = 0; i < 20; i++) { await frame(); if (you.sliding) slid = true; }
    out.slideOnCirclePress = slid;
    /* AND IT DOES NOT PUT YOU ON YOUR FACE. Circle is the crouch
       button; holding it while NOT sprinting is the drop. Sliding from
       the press leaves the button down, and 220 ms later the same
       unbroken press reaches the hold path with sprinting already
       false -- so the slide ended prone, and prone cancels sprint, and
       nothing sprinted again for the rest of the life. Found because
       the three "does the toggle stop" checks all reported a sprint
       that never started. */
    out.proneAfterSlide = !!you.prone;

    /* ---- the toggle turns itself off three ways ----
       EACH HALF REPORTED SEPARATELY. The first version of this ANDed
       "it started" with "it stopped" into one boolean, so a run where
       the sprint never started at all was indistinguishable from one
       where it started and would not stop -- and those want opposite
       fixes. A test that cannot name its own offender is a test you
       have to debug before you can use it. */
    const startSprint = async () => {
      await clear();
      pad.axes = [0, -1, 0, 0]; await settle(8);
      await click(PAD.sprint); await settle(8);
      return !!you.sprinting;
    };

    out.startedA = await startSprint();
    pad.axes = [0, 0, 0, 0];                // stick released
    await settle(12);
    out.stoppedOnStickRelease = !you.sprinting;

    out.startedB = await startSprint();
    pad.buttons[PAD.aim].pressed = true; pad.buttons[PAD.aim].value = 1;
    await settle(12);
    out.stoppedOnAim = !you.sprinting;
    pad.buttons[PAD.aim].pressed = false; pad.buttons[PAD.aim].value = 0;

    out.startedC = await startSprint();
    await click(PAD.sprint); await settle(10);
    out.stoppedOnSecondClick = !you.sprinting;

    /* ---- INSPECT: two presses of D-pad right, not one ---- */
    await clear();
    await click(PAD.inspect);
    await settle(14);
    out.oneTapDoesNothing = !(vm.state.ins > 0);
    /* AS FAST AS THIS PAGE CAN. It renders in software GL at about nine
       frames a second, so a frame is 110 ms and the tightest double
       press the test can physically make is three or four frames --
       around 0.4 s. That is a real constraint on the window, not an
       artefact: a window a player cannot hit on a slow machine is a
       window that does not work. */
    const t0 = performance.now();
    await click(PAD.inspect, 1);
    await click(PAD.inspect, 1);
    out.doubleTookMs = Math.round(performance.now() - t0);
    let ins = false;
    for (let i = 0; i < 14; i++) { await frame(); if (vm.state.ins > 0) ins = true; }
    out.doubleTapInspects = ins;
    return out;
  });

  console.log('\n  ' + JSON.stringify(r, null, 1).replace(/\n/g, '\n  ') + '\n');

  check('the pad map is read from the game', r.padMap === true);
  check('a CLICK of L3 starts you sprinting', r.sprintAfterClick === true);
  check('sprint and one press of circle is a slide', r.slideOnCirclePress === true);
  check('and the slide does not also drop you prone', r.proneAfterSlide === false);
  check('the toggle restarts a sprint every time',
    r.startedA && r.startedB && r.startedC,
    [r.startedA, r.startedB, r.startedC].join(','));
  check('letting go of the stick ends the sprint', r.stoppedOnStickRelease === true);
  check('bringing the sights up ends the sprint', r.stoppedOnAim === true);
  check('clicking L3 again ends the sprint', r.stoppedOnSecondClick === true);
  check('one press of D-pad right does not inspect', r.oneTapDoesNothing === true);
  check('two presses of D-pad right does', r.doubleTapInspects === true,
    'the two presses took ' + r.doubleTookMs + ' ms');
  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
