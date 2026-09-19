#!/usr/bin/env node
/* CAN A PAD ACTUALLY PLAY A MULTIPLAYER MATCH?
 *
 * Four controller test files pass and not one of them asks this.
 * pad.test.js drives a stick and a trigger, and loads bunker-nine.
 * stuckpad.test.js jams a pad, and loads bunker-nine. padcursor.test.js
 * is multiplayer, and tests the MENU pointer. mpbinds.test.js is
 * multiplayer, and tests the KEYBOARD. So the one combination nobody
 * covers is a pad in a firefight in multiplayer -- which is the whole of
 * "full controller support in multiplayer".
 *
 * That gap matters here more than it would elsewhere, because
 * multiplayer does not share the zombies input layer. mp-game.js carries
 * its own: its own deadzone and response curve, its own PAD button map,
 * its own layout sniffing, its own config read out of localStorage.
 * Two implementations, one of them tested. This project has been bitten
 * by that exact shape before -- the Thompson you carried and the
 * Thompson the man across the street carried were different weapons for
 * weeks, because only one of the two paths had a test.
 *
 * WHAT IT ASKS, of a synthetic standard pad, in a running match:
 *
 *   DOES THE LEFT STICK MOVE HIM, and the right stick turn him, and do
 *   they do their own jobs rather than each other's?
 *
 *   DOES EVERY BUTTON REACH THE COMMAND IT IS BOUND TO -- fire, aim,
 *   jump, crouch, reload, swap, sprint, slide, scoreboard? These are
 *   read from mp-game's own PAD table, so a renumbering that forgets a
 *   button is caught rather than passed over.
 *
 *   IS AN EDGE AN EDGE? Jump, reload, swap and slide are one-shots. A
 *   held button that re-fires every frame is a man who reloads forever.
 *
 *   AND A LAYOUT THAT DOES NOT SAY 'standard'. Most real pads report an
 *   empty mapping string over Bluetooth or through an adapter, and the
 *   comment in mp-game says that single string comparison once cost
 *   every one of them everything but fire. Sixteen buttons and four
 *   axes IS the standard layout whatever it calls itself.
 *
 * Usage: node engine/test/mppad.test.js
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
const note = (s) => console.log(`  ..   ${s}`);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 220 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  /* The pad has to exist before the page's input layer looks for one,
     so it is installed on the document rather than after load. */
  await page.addInitScript(() => {
    window.__pad = {
      mapping: 'standard', id: 'test pad', index: 0, connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 },
        () => ({ pressed: false, touched: false, value: 0 })),
    };
    navigator.getGamepads = () => [window.__pad];
  });

  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=helipad&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.waitForTimeout(2500);

  const r = await page.evaluate(async () => {
    const out = { err: null };
    const pad = window.__pad;
    const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
    const settle = async (n) => { for (let i = 0; i < n; i++) await frame(); };
    const clear = () => {
      pad.axes = [0, 0, 0, 0];
      for (const b of pad.buttons) { b.pressed = false; b.value = 0; }
    };
    const hold = (i, v = 1) => { pad.buttons[i].pressed = v > 0.5; pad.buttons[i].value = v; };

    /* mp-game's own numbers, read out of the page rather than copied,
       so a renumbering there fails here instead of quietly diverging. */
    const PAD = window.MP_PAD || { fire: 7, aim: 6, jump: 0, crouch: 1, reload: 2,
      swap: 3, sprint: 10, slide: 11, scores: 8 };
    out.padMapFromGame = !!window.MP_PAD;

    const you = window.MP.match.you;
    if (!you) { out.err = 'no local player'; return out; }
    you.alive = true;

    /* THE STICKS. Measured as movement of the man and change of his
       yaw, not as a flag somewhere: a stick that sets a variable
       nothing reads is the fault this is looking for. */
    clear(); await settle(6);
    const p0 = { x: you.pos.x, z: you.pos.z }, y0 = you.yaw, pitch0 = you.pitch;
    pad.axes = [0, -1, 0, 0];               // left stick full forward
    await settle(30);
    const moved = Math.hypot(you.pos.x - p0.x, you.pos.z - p0.z);
    const yawDrift = Math.abs(you.yaw - y0);
    out.leftStickMoves = +moved.toFixed(3);
    out.leftStickTurns = +yawDrift.toFixed(4);

    clear(); await settle(10);
    const y1 = you.yaw, q1 = { x: you.pos.x, z: you.pos.z };
    pad.axes = [0, 0, 1, 0];                // right stick full right
    await settle(30);
    out.rightStickTurns = +Math.abs(you.yaw - y1).toFixed(3);
    out.rightStickMoves = +Math.hypot(you.pos.x - q1.x, you.pos.z - q1.z).toFixed(3);

    clear(); await settle(10);
    const pi1 = you.pitch;
    pad.axes = [0, 0, 0, 1];                // right stick full down
    await settle(20);
    out.rightStickPitches = +Math.abs(you.pitch - pi1).toFixed(3);

    /* THE BUTTONS, AGAINST THE COMMAND THEY FILL IN.
     *
       The first version of this watched the PLAYER for each button's
       effect -- you.firing for the trigger, a scoreboard flag for the
       scoreboard -- and two of those fields do not exist. `firing` is
       not kept on a player at all, and `scores` is handed straight to
       hud.paint every frame and forgotten. A test looking for state
       that was never stored reports a fault of its own making, which
       is how an afternoon goes missing.
       
       So assert the pad layer's actual contract. Its job is to fill in
       a command; what the match then does with that command is the
       match's business and has its own tests. mp-game publishes the
       command it built each frame for exactly this. */
    const press = async (btn, field, frames = 12, edge = false) => {
      clear(); await settle(6);
      let seen = 0;
      hold(btn);
      for (let i = 0; i < frames; i++) {
        await frame();
        const c = window.MP_LASTCMD;
        if (c && c[field]) seen++;
      }
      clear(); await settle(4);
      return seen;
    };
    out.cmdPublished = !!window.MP_LASTCMD;
    out.fire = await press(PAD.fire, 'fire');
    out.aim = await press(PAD.aim, 'aim');
    out.crouch = await press(PAD.crouch, 'crouch');
    out.sprint = await press(PAD.sprint, 'run');
    out.scores = await press(PAD.scores, 'scores');
    /* The one-shots. A held button that keeps setting its field every
       frame is a man who reloads forever, so these are asked for the
       COUNT rather than for any frame at all. */
    out.jumpFrames = await press(PAD.jump, 'jump', 20);
    out.reloadFrames = await press(PAD.reload, 'reload', 20);
    out.swapFrames = await press(PAD.swap, 'swap', 20);
    out.slideFrames = await press(PAD.slide, 'slide', 20);

    /* AND A PAD THAT DOES NOT CALL ITSELF STANDARD. */
    pad.mapping = '';
    clear(); await settle(6);
    out.blankAim = await press(PAD.aim, 'aim');
    const y2 = you.yaw;
    pad.axes = [0, 0, 1, 0];
    await settle(25);
    out.blankTurns = +Math.abs(you.yaw - y2).toFixed(3);
    clear();
    pad.mapping = 'standard';
    return out;
  });

  if (r.err) { check('the match has a local player to drive', false, r.err); }
  note(`sticks: left moved ${r.leftStickMoves} m (yaw drift ${r.leftStickTurns}), `
    + `right turned ${r.rightStickTurns} rad (moved ${r.rightStickMoves} m), `
    + `pitched ${r.rightStickPitches}`);

  check('the left stick moves him', r.leftStickMoves > 0.5, `${r.leftStickMoves} m`);
  check('and does not turn him', r.leftStickTurns < 0.02, `${r.leftStickTurns} rad`);
  check('the right stick turns him', r.rightStickTurns > 0.2, `${r.rightStickTurns} rad`);
  check('and does not walk him', r.rightStickMoves < 0.25, `${r.rightStickMoves} m`);
  check('the right stick looks up and down', r.rightStickPitches > 0.1, `${r.rightStickPitches}`);

  check('mp-game publishes the command it built', r.cmdPublished === true);
  note(`held 12 frames -> fire ${r.fire}, aim ${r.aim}, crouch ${r.crouch}, `
    + `sprint ${r.sprint}, scoreboard ${r.scores}`);
  check('the right trigger reaches fire', r.fire > 0, `${r.fire} frames`);
  check('the left trigger reaches aim', r.aim > 0, `${r.aim} frames`);
  check('the crouch button reaches crouch', r.crouch > 0, `${r.crouch} frames`);
  check('the stick click reaches sprint', r.sprint > 0, `${r.sprint} frames`);
  check('the scoreboard button reaches scores', r.scores > 0, `${r.scores} frames`);

  note(`one-shots, held 20 frames -> jump ${r.jumpFrames}, reload ${r.reloadFrames}, `
    + `swap ${r.swapFrames}, slide ${r.slideFrames}`);
  for (const [name, n] of [['jump', r.jumpFrames], ['reload', r.reloadFrames],
    ['swap', r.swapFrames], ['slide', r.slideFrames]]) {
    check(`the ${name} button reaches ${name}`, n > 0, `never set`);
    /* Held for twenty frames. Once is an edge; twenty is a button that
       repeats every frame, which on reload is a man who never finishes
       one and on swap is a weapon that will not settle. */
    check(`and ${name} is edge-triggered, not once a frame`, n <= 2, `${n} of 20 frames`);
  }

  note(`with the mapping string blank: aim ${r.blankAim} frames, turned ${r.blankTurns} rad`);
  check('a pad that does not call itself standard still aims',
    r.blankAim > 0, `${r.blankAim} frames`);
  check('and still turns on its right stick', r.blankTurns > 0.2, `${r.blankTurns} rad`);

  check('mp-game publishes its own pad map for this test to read',
    r.padMapFromGame === true, 'fell back to a copy of the numbers');

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
