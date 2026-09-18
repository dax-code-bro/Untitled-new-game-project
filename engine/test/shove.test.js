#!/usr/bin/env node
/* DOES THE RECOIL MOVE THE MAN?
 *
 * Everything the game already had moved the CAMERA: the muzzle climbs,
 * the view rolls, the gun is shoved along its own bore. All of it is a
 * picture of recoil, and the tell is that you can empty the heaviest
 * rifle on the rack standing on one spot and finish on that spot.
 *
 * HOW THIS IS MEASURED, AND WHY NOT THE OBVIOUS WAY.
 *
 * The obvious way is to fire a burst and see how far he went. Two
 * attempts at that measured something else both times:
 *
 *   Bunker Nine's spawn has a wall about a foot behind the player's
 *   shoulder, so a light gun read 0.054 m and a gun ten times heavier
 *   read 0.092 m. That is not a shove that fails to scale, it is a wall
 *   at nine centimetres.
 *
 *   Lifting him clear of it fixed that and broke the next one: the
 *   ground run inherited the position the air run left him in, twelve
 *   metres up, and returned a result identical to it down to the fourth
 *   decimal -- which is what a test looks like when it is not running
 *   the case it says it is.
 *
 * So nothing here integrates over a distance. The shove is read where
 * it is put -- at the controller's door, and in the body's velocity one
 * frame later -- and the only displacement asked for is "more than two
 * centimetres", over a tenth of a second, which no wall is close
 * enough to take away.
 *
 * Usage: node engine/test/shove.test.js
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
    const G = B.game, P = B.P, T = window.__T;
    const ctl = P.actor.controller;
    for (let i = 0; i < 20; i++) G.step(1 / 60);
    T.god(true);

    const home = (() => { const p = P.actor.position; return [p.x, p.y, p.z]; })();
    const reset = () => {
      T.teleport(home[0], home[1], home[2]);
      ctl.external.setScalar(0);
      ctl._extApplied.setScalar(0);
      for (let i = 0; i < 4; i++) G.step(1 / 60);
    };
    const fwd = () => {
      const c = G.camera;
      const dx = c.target.x - c.position.x, dz = c.target.z - c.position.z;
      const l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    };
    const speed = () => Math.hypot(ctl.body.velocity.x, ctl.body.velocity.z);

    /* Fire exactly one round, with a shove figure put on the weapon so
       the answer does not depend on which gun the player starts with.

       AIMING IS HELD, NOT ASSIGNED. Writing P.ads = 1 and firing reads
       0.66 where 0.62 is correct, and the difference is not an error in
       the brace -- the frame's own update eases P.ads toward the aim
       input before tryFire sees it, so the shot goes off at about 0.89
       of the way down the sights. Holding the aim button until it
       arrives is both the honest path and the one a player takes. */
    const shoot = (shove, aim) => {
      const spec = P.spec();
      const keepK = spec.kick, keepR = spec.recoil;
      spec.kick = 0;
      spec.recoil = Object.assign({}, keepR || {}, { shove, up: 0, side: 0, climb: 0 });
      if (aim) {
        T.hold({ aim: true });
        for (let i = 0; i < 60 && P.ads < 0.999; i++) G.step(1 / 60);
      }
      P.cooldown = 0;
      T.hold(aim ? { aim: true, fire: true } : { fire: true });
      G.step(1 / 60);
      T.release();
      if (aim) for (let i = 0; i < 60 && P.ads > 0.001; i++) G.step(1 / 60);
      spec.kick = keepK; spec.recoil = keepR;
    };

    /* 1. AT THE DOOR. What tryFire actually hands the controller: one
          call, how big, and which way. Nothing downstream can hide a
          mistake here and nothing upstream can fake one. */
    const calls = [];
    const realImp = ctl.impulse.bind(ctl);
    ctl.impulse = function (x, z) { calls.push([x, z]); return realImp(x, z); };
    reset();
    const f = fwd();
    calls.length = 0; shoot(1.0, false);
    const hip = calls.slice();
    calls.length = 0; shoot(1.0, true);
    const ads = calls.slice();
    calls.length = 0; shoot(0, false);
    const nil = calls.slice();
    ctl.impulse = realImp;

    const mag = (c) => (c.length ? +Math.hypot(c[0][0], c[0][1]).toFixed(3) : null);
    const along = (c) => (c.length ? +((c[0][0] * f[0] + c[0][1] * f[1]) / (Math.hypot(c[0][0], c[0][1]) || 1)).toFixed(3) : null);

    /* 2. IN THE BODY. One frame after the shot the man is carrying it,
          and a tenth of a second later he has gone somewhere. */
    reset();
    shoot(1.0, false);
    const v1 = +speed().toFixed(3);
    const a = [P.actor.position.x, P.actor.position.z];
    for (let i = 0; i < 6; i++) G.step(1 / 60);
    const moved = +Math.hypot(P.actor.position.x - a[0], P.actor.position.z - a[1]).toFixed(4);
    for (let i = 0; i < 90; i++) G.step(1 / 60);
    const rest = +speed().toFixed(4);

    /* 3. NO FOOT TO PLANT. The same round, held off the floor. The
          ground kills the shove in about a third of a second; air keeps
          most of it, so ten frames later there should be far more of it
          left. Read as SPEED, not distance, so the measurement never
          travels far enough to meet anything. */
    const after = (air, frames) => {
      reset();
      shoot(1.0, false);
      for (let i = 0; i < frames; i++) {
        if (air) {
          ctl.body.velocity.y = 0;
          ctl.body.position.y = home[1] + 12;
          ctl.grounded = false;
        }
        G.step(1 / 60);
      }
      return +speed().toFixed(3);
    };
    const onFloor = after(false, 12);
    const inAir = after(true, 12);
    reset();

    return {
      hip: { n: hip.length, mag: mag(hip), along: along(hip) },
      ads: { n: ads.length, mag: mag(ads) },
      nil: { n: nil.length },
      v1, moved, rest, onFloor, inAir,
    };
  });

  note(JSON.stringify(r));
  /* WHAT THE GUN HANDS THE MAN. */
  check('a shot shoves the body, once', r.hip.n === 1, `${r.hip.n} impulses`);
  check('backwards, along the bore', r.hip.along != null && r.hip.along < -0.99,
    `${r.hip.along} (-1 is straight back)`);
  check('as hard as the gun says', r.hip.mag != null && Math.abs(r.hip.mag - 1.0) < 0.02,
    `${r.hip.mag} for a shove of 1.0`);
  check('a shouldered stock takes a third of it',
    r.ads.mag != null && Math.abs(r.ads.mag - 0.62) < 0.01, `${r.ads.mag} on the sights`);
  check('and a gun with no shove does not shove', r.nil.n === 0, `${r.nil.n} impulses`);
  /* WHAT THE MAN DOES WITH IT. */
  /* Most of it, not all of it: the shove starts decaying the moment it
     is put on, and the controller's step runs twice inside one G.step
     at this rate, so a frame later about 83 per cent of a 1.0 m/s shove
     is still on the body. The check is that he is carrying it, not that
     nothing has drained -- draining is the feature. */
  check('he is carrying it a frame later', r.v1 > 0.75 && r.v1 <= 1.0, `${r.v1} m/s of 1.0`);
  check('and it has taken him somewhere', r.moved > 0.02, `${r.moved} m in a tenth of a second`);
  check('and then he stops', r.rest < 0.01, `${r.rest} m/s still on him`);
  /* AND THE FLOOR IS WHAT STOPS HIM. */
  check('in the air there is no foot to plant',
    r.inAir > r.onFloor * 4, `${r.inAir} m/s left in air vs ${r.onFloor} on the floor`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
