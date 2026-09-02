/* The controller must move the player and nothing else.
 *
 * Twice now a pad has ended up aiming the camera by a route nobody wrote:
 * first through an unchecked button layout, and then through the system
 * cursor. The second one is invisible from inside the page -- a driver
 * that walks the pointer with the left stick produces mousemove events
 * that are indistinguishable from a hand on a mouse -- so the only thing
 * that can catch a regression is a test that fakes exactly that.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const R = __dirname + '/../../';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '   ' + extra : '')); }
};

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const p = await b.newPage({ viewport: { width: 320, height: 220 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/games/bunker-nine.js', 'utf8') });

  const res = await p.evaluate(() => {
    const out = {};
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    const cv = document.getElementById('game');

    /* A pad the browser vouches for, whose sticks we can drive. */
    const padState = { mapping: 'standard', id: 'test pad', index: 0, connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    navigator.getGamepads = () => [padState];

    // The cursor is hidden, which is the only state the look handler runs in.
    Object.defineProperty(document, 'pointerLockElement', { get: () => cv, configurable: true });

    const step = (n) => { for (let i = 0; i < n; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1 / 60); } };
    step(12); __T.god(true); __T.killAll(); step(6);

    /* A driver walking the pointer with the LEFT stick: the stick is
       pushed forward and mousemove arrives saying the mouse went with it. */
    const nudge = (dy) => {
      const before = B.game._camPitch;
      window.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: dy, bubbles: true }));
      return B.game._camPitch - before;
    };

    padState.axes = [0, -1, 0, 0];          // left stick full forward
    step(2);
    out.stickReadsAsMove = Math.abs(B.game.input.axes.y) > 0.5;
    out.emulatedWhileWalking = nudge(60);

    padState.axes = [0, 1, 0, 0];           // and full back
    step(2);
    out.emulatedWhileReversing = nudge(-60);

    /* Right stick deflected: the same emulation risk, same answer. */
    padState.axes = [0, 0, 0.9, 0];
    step(2);
    out.emulatedOnRightStick = nudge(60);

    /* Hands off the pad. A real mouse must still aim -- after the tail
       the suppression allows for the driver's own smoothing. */
    padState.axes = [0, 0, 0, 0];
    step(2);
    const t0 = performance.now();
    while (performance.now() - t0 < 320) { /* let the tail expire */ }
    out.realMouse = nudge(60);

    /* And the pad's own right stick still aims, which is the whole point
       of leaving the Gamepad API reading in place. */
    padState.axes = [0, 0, 0, 0.9];
    const p0 = B.game._camPitch;
    step(10);
    out.padAims = Math.abs(B.game._camPitch - p0);

    /* A pad whose layout the browser does NOT vouch for must not aim at
       all: axes 2 and 3 are the left stick on a good number of them. */
    padState.mapping = '';
    padState.axes = [0, 0, 0, 0.9];
    step(2);
    const q0 = B.game._camPitch;
    step(10);
    out.unknownPadAims = Math.abs(B.game._camPitch - q0);
    return out;
  });

  console.log('controller must not aim through the system cursor');
  ok('left stick still walks the player', res.stickReadsAsMove);
  ok('an emulated pointer cannot pitch the view while walking forward',
    Math.abs(res.emulatedWhileWalking) < 1e-6, 'moved ' + res.emulatedWhileWalking);
  ok('nor while reversing',
    Math.abs(res.emulatedWhileReversing) < 1e-6, 'moved ' + res.emulatedWhileReversing);
  ok('nor on the right stick',
    Math.abs(res.emulatedOnRightStick) < 1e-6, 'moved ' + res.emulatedOnRightStick);
  ok('a real mouse still aims with the pad idle',
    Math.abs(res.realMouse) > 0.01, 'moved ' + res.realMouse);
  ok('the pad aims on its own right stick',
    res.padAims > 0.005, 'moved ' + res.padAims);
  ok('an unrecognised layout does not aim on a stick',
    res.unknownPadAims < 1e-6, 'moved ' + res.unknownPadAims);
  ok('nothing threw', errs.length === 0, errs.join(' | '));

  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
