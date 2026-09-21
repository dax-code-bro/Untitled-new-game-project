#!/usr/bin/env node
/* SPRINT, THEN CIRCLE. DOES ANYTHING HAPPEN?
 *
 * Reported: "sliding does not work ... to slide you sprint and press
 * circle". It did not, and the reason is worth a test rather than a
 * comment, because it was not a broken control -- it was a working
 * control behind a condition the player had no way to see.
 *
 * Zombies gated the slide on the Athlete perk. Before you had bought
 * it, sprinting and pressing circle did nothing and said nothing.
 * Multiplayer never gated it. So the same two inputs did different
 * things in the two games, and a movement control that is silent when
 * it refuses is indistinguishable from one that is broken.
 *
 * DRIVEN THROUGH THE REAL KEYS, not through a hook. A hook that sets
 * P.sliding would pass whether or not the binding, the sprint
 * condition and the cooldown work -- and the binding is half of what
 * was reported. So this holds W and Shift like a player, presses the
 * key the slide is actually bound to, and looks at what the game did.
 *
 * Usage: node engine/test/slide.test.js
 */
const fs = require('fs'), path = require('path');
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
const note = (s) => console.log(`  ..   ${s}`);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" tabindex="0" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });

  const r = await page.evaluate(async () => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    window.B = B;
    B.S.toSpawn = 0; B.S.spawnT = 1e9;
    const P = B.P, S = B.S, game = B.game;
    const key = (type, code, k) => window.dispatchEvent(new KeyboardEvent(type,
      { code, key: k, bubbles: true }));
    /* STAMINA HAS TO BE TOPPED UP BETWEEN ATTEMPTS, and finding that out
       is worth a line. The base tank is one second of sprint. The second
       half of this test ran three seconds after the first, so by the
       time it pressed the key the man was out of breath, sprint was
       false and the slide was correctly refused -- and the reading it
       took was the FIRST slide's leftovers, still decaying past zero.
       A test that reuses a session has to reset what the session
       spends. */
    const run = (n) => {
      for (let i = 0; i < n; i++) {
        S.toSpawn = 0; S.spawnT = 1e9; P.stamina = P.perks.adrenaline ? 3 : 1;
        game.step(1 / 60);
      }
    };

    /* No perk. This is the state the report was made in. */
    P.perks.adrenaline = false;
    key('keydown', 'KeyW', 'w');
    key('keydown', 'ShiftLeft', 'Shift');
    run(30);
    const sprintingNoPerk = !!P.sprinting;
    key('keydown', 'ControlLeft', 'Control');
    run(2);
    key('keyup', 'ControlLeft', 'Control');
    const slidNoPerk = P.sliding;
    const noPerkDur = P.slideMax;
    run(120);                                   // ride it out and clear the cooldown
    P.slideCd = 0; P.sliding = 0;

    /* With the perk, which must still be better rather than merely
       different, or the perk has quietly lost its reason to exist. */
    P.perks.adrenaline = true;
    run(30);
    key('keydown', 'ControlLeft', 'Control');
    run(2);
    key('keyup', 'ControlLeft', 'Control');
    const slidPerk = P.sliding;
    const perkDur = P.slideMax;
    /* AND THE CANCEL, which is the half the perk owns. */
    key('keydown', 'Space', ' ');
    run(2);
    key('keyup', 'Space', ' ');
    const afterCancel = P.sliding;

    /* Standing still must NOT slide: it is a sprint committed to a
       direction, and a slide from a standstill is a teleport. */
    P.sliding = 0; P.slideCd = 0;
    key('keyup', 'KeyW', 'w');
    key('keyup', 'ShiftLeft', 'Shift');
    run(30);
    const sprintingStill = !!P.sprinting;
    key('keydown', 'ControlLeft', 'Control');
    run(2);
    key('keyup', 'ControlLeft', 'Control');
    const slidStanding = P.sliding;

    return { sprintingNoPerk, slidNoPerk, noPerkDur, slidPerk, perkDur,
      afterCancel, sprintingStill, slidStanding };
  });

  note(`without the perk: sprinting ${r.sprintingNoPerk}, slide ran for `
    + `${(r.noPerkDur || 0).toFixed(2)} s`);
  note(`with it: ${(r.perkDur || 0).toFixed(2)} s, and the jump cancelled it to `
    + `${(r.afterCancel || 0).toFixed(2)}`);

  check('holding W and Shift sprints', r.sprintingNoPerk === true);
  check('and pressing the slide key slides, with no perk bought',
    r.slidNoPerk > 0, `P.sliding = ${r.slidNoPerk}`);
  check('the perk makes it a longer slide rather than the only slide',
    r.perkDur > r.noPerkDur + 0.05,
    `${(r.noPerkDur || 0).toFixed(2)} s vs ${(r.perkDur || 0).toFixed(2)} s`);
  check('and lets a jump cancel out of it', r.slidPerk > 0 && r.afterCancel === 0,
    `entered ${r.slidPerk}, after the jump ${r.afterCancel}`);
  check('a standstill is not a sprint', r.sprintingStill === false);
  check('and cannot be slid out of', !(r.slidStanding > 0),
    `P.sliding = ${r.slidStanding}`);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
