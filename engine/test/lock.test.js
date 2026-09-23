#!/usr/bin/env node
/* CAN YOU WALK AWAY WHILE THE ANIMATION SAYS YOU ARE STILL DOING IT?
 *
 * Reported, and it is the clearest description of a fault in the whole
 * list: "I saw this huge problem with the power when you had to crank
 * the lever, you were allowed to move around the lever while the
 * animation was broken, still saying you were cranking it, but when
 * your character actually put his hand around the cranking lever like a
 * full in depth thing and not broken like what it was before".
 *
 * Every timed interaction in this game was a TIMER WITH A LABEL. It set
 * a flag, counted down, and did nothing about the body: you could walk
 * away mid-crank and the crank went on cranking, because nothing
 * connected the animation to the man supposedly performing it.
 *
 * WHAT A LOCK HAS TO DO, and what this measures:
 *
 *   - the feet stop being yours, so you are where the job is
 *   - the body turns to FACE the thing, rather than cranking a lever
 *     that is behind you
 *   - letting go cancels it, and cancelling does not finish the job
 *   - a COMMITTED job cannot be walked out of at all: a defusal is not
 *     something you half-do
 *
 * Usage: node engine/test/lock.test.js
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

  const r = await page.evaluate(() => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    const P = B.P, S = B.S, game = B.game;
    const key = (type, code, k) => window.dispatchEvent(new KeyboardEvent(type,
      { code, key: k, bubbles: true }));
    const run = (n) => {
      for (let i = 0; i < n; i++) { S.toSpawn = 0; S.spawnT = 1e9; game.step(1 / 60); }
    };
    const at = () => ({ x: P.actor.position.x, z: P.actor.position.z });
    const moved = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    S.godMode = true;
    run(30);

    const out = {};

    /* ---- WALKING WHILE LOCKED ---- */
    const p0 = at();
    /* A lever three metres in front, so facing it is a real turn. */
    P.yaw = 0;
    P.lock = { t: 3.0, kind: 'crank', commit: true,
      at: [p0.x + 3, 1, p0.z] };
    key('keydown', 'KeyW', 'w');
    run(60);                                   // a full second of walking
    out.lockedMove = +moved(p0, at()).toFixed(4);
    out.stillLocked = !!P.lock;
    /* And he turned to face it: the lever is at +X, so yaw should have
       swung toward atan2(3, 0) = +PI/2. */
    out.facing = +P.yaw.toFixed(3);
    out.wantFacing = +(Math.atan2(3, 0)).toFixed(3);
    key('keyup', 'KeyW', 'w');
    P.lock = null;
    run(10);

    /* ---- WALKING WHEN NOT LOCKED, for contrast: the same input has
            to actually move him, or the test above proves nothing. ---- */
    const p1 = at();
    key('keydown', 'KeyW', 'w');
    run(60);
    out.freeMove = +moved(p1, at()).toFixed(4);
    key('keyup', 'KeyW', 'w');
    run(10);

    /* ---- LETTING GO CANCELS AN UNCOMMITTED JOB ---- */
    let finished = 0, cancelled = 0;
    P.lock = { t: 5.0, kind: 'board', commit: false, at: null,
      done: function () { finished++; }, cancel: function () { cancelled++; } };
    key('keydown', 'KeyW', 'w');
    run(6);
    key('keyup', 'KeyW', 'w');
    out.bailedOut = !P.lock;
    out.bailFinished = finished;
    out.bailCancelled = cancelled;
    run(10);

    /* ---- AND A COMMITTED ONE CANNOT BE ---- */
    finished = 0; cancelled = 0;
    P.lock = { t: 0.35, kind: 'defuse', commit: true, at: null,
      done: function () { finished++; }, cancel: function () { cancelled++; } };
    key('keydown', 'KeyW', 'w');
    run(10);
    out.committedHeld = !!P.lock;
    run(30);                                   // let it run out
    key('keyup', 'KeyW', 'w');
    out.committedFinished = finished;
    out.committedCancelled = cancelled;
    out.committedCleared = !P.lock;
    return out;
  });

  note(`locked, one second of forward: moved ${(r.lockedMove * 100).toFixed(1)} cm`);
  note(`free, the same input: moved ${(r.freeMove * 100).toFixed(1)} cm`);

  check('the same input moves you when you are not locked',
    r.freeMove > 0.5, `${r.freeMove} m`);
  check('and moves you nowhere when you are',
    r.lockedMove < 0.05, `${r.lockedMove} m`);
  check('the job is still running after you tried to walk off it',
    r.stillLocked);

  note(`facing: turned to ${r.facing} rad, the lever is at ${r.wantFacing}`);
  check('the body turns to face the thing it is working on',
    Math.abs(r.facing - r.wantFacing) < 0.2,
    `${r.facing} vs ${r.wantFacing}`);

  check('letting go cancels an uncommitted job', r.bailedOut);
  check('and cancelling does NOT finish it',
    r.bailFinished === 0 && r.bailCancelled === 1,
    `finished ${r.bailFinished}, cancelled ${r.bailCancelled}`);

  check('a committed job cannot be walked out of', r.committedHeld);
  check('and it finishes on its own clock',
    r.committedFinished === 1 && r.committedCancelled === 0 && r.committedCleared,
    `finished ${r.committedFinished}, cancelled ${r.committedCancelled}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
