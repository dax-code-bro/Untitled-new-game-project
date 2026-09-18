#!/usr/bin/env node
/* DOES THE ROUND LEAVE THE BARREL, AND DOES IT STILL GO WHERE YOU AIM?
 *
 * Two questions, and the second one is the reason this file exists.
 * Moving a shot's origin from the eye to the muzzle is four lines;
 * moving it WITHOUT sending the round off on a line parallel to your
 * aim is the whole job. A round that leaves the barrel on a parallel
 * misses everything close, the player blames the gun, and the next
 * person to touch it puts the origin back on the camera. So:
 *
 *   ORIGIN   the shot ray starts at the muzzle, not at the eye.
 *   AIM      and it still lands where the crosshair is.
 *
 * Neither is provable from the suites that already exist -- map,
 * coastline, flamingo and escape all pass with the round leaving the
 * camera, because not one of them asks where a bullet goes.
 *
 * The seam is game.raycast: it is where the round enters the world, so
 * it is wrapped for one frame and the shot's own cast is picked out by
 * its reach.
 *
 * Usage: node engine/test/barrel.test.js
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
  const page = await browser.newPage({ viewport: { width: 420, height: 280 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/coastline.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: 'bunker9' });
    const S = B.S, G = B.game, P = B.P;
    for (let i = 0; i < 20; i++) G.step(1 / 60);

    /* THE SHOT RAY REACHES 60 METRES and nothing else in a frame does,
       which is how it is told apart from the dozens of casts the world
       makes for footing, doors and the dead. */
    const casts = [];
    const real = G.raycast.bind(G);
    G.raycast = function (from, dir, dist, filter) {
      const hit = real(from, dir, dist, filter);
      if (Math.abs(dist - 60) < 0.001) {
        casts.push({ from: [from[0], from[1], from[2]],
          hit: hit && hit.point ? [hit.point.x, hit.point.y, hit.point.z] : null });
      }
      return hit;
    };

    const cam = G.camera;
    const eye = [cam.position.x, cam.position.y, cam.position.z];
    const f = { x: cam.target.x - eye[0], y: cam.target.y - eye[1], z: cam.target.z - eye[2] };
    const fl = Math.hypot(f.x, f.y, f.z) || 1;
    const fwd = [f.x / fl, f.y / fl, f.z / fl];
    /* Where the crosshair is pointing, from the eye -- the answer the
       shot has to agree with. */
    const aim = real(eye, fwd, 60, (b) => b !== P.actor.body && !b.isTrigger
      && !(b.userData && b.userData.bulletPassthrough));
    const aimPt = aim && aim.point ? [aim.point.x, aim.point.y, aim.point.z] : null;

    const muzzle = P.muzzleWorld ? P.muzzleWorld.slice() : null;
    P.cooldown = 0;
    /* THROUGH THE TRIGGER, NOT AROUND IT. Writing S.input.firePressed
       here does nothing: the input block recomputes both fire flags from
       the pointer, the pad and S.testHold at the top of every frame, so
       the flag is overwritten before tryFire ever reads it. testHold is
       the door a harness is meant to come in by, and window.__T.hold
       opens it -- start() returns only { game, S, P, hud }, the hooks
       live on __T. */
    const T = window.__T;
    T.hold({ fire: true });
    G.step(1 / 60);
    T.release();
    G.raycast = real;

    const shot = casts.length ? casts[casts.length - 1] : null;
    const d = (a, b) => (a && b) ? +Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]).toFixed(3) : null;
    return {
      shots: casts.length, muzzle, eye, aimPt,
      shotFrom: shot ? shot.from : null,
      shotHit: shot ? shot.hit : null,
      fromMuzzle: d(shot && shot.from, muzzle),
      fromEye: d(shot && shot.from, eye),
      hitVsAim: d(shot && shot.hit, aimPt),
      eyeToMuzzle: d(eye, muzzle),
    };
  });

  note(JSON.stringify(r));
  check('the weapon fired at all', r.shots > 0, `${r.shots} casts at 60m`);
  check('the muzzle is somewhere other than the eye',
    r.eyeToMuzzle != null && r.eyeToMuzzle > 0.15, `${r.eyeToMuzzle}m apart`);
  /* The round starts AT THE BARREL. Allowing a centimetre, because the
     muzzle moves with the viewmodel between the read and the shot. */
  check('the round starts at the muzzle', r.fromMuzzle != null && r.fromMuzzle < 0.02,
    `${r.fromMuzzle}m from the muzzle, ${r.fromEye}m from the eye`);
  check('and not at the eye', r.fromEye != null && r.fromEye > 0.15, `${r.fromEye}m`);
  /* AND IT STILL GOES WHERE YOU POINT IT. This is the one that catches
     a parallel-offset shot, which is the way this change goes wrong. */
  check('and it lands where the crosshair is', r.hitVsAim != null && r.hitVsAim < 0.25,
    `${r.hitVsAim}m from the crosshair's own hit`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
