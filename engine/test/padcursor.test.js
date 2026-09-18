#!/usr/bin/env node
/* THE PAD CAN PRESS THINGS NOW.
 *
 * Play Again and Return to Lobby were click handlers and nothing else,
 * so a controller player who finished a match could neither start
 * another nor leave: the only way out was restarting the game. The
 * pointer answers that generally rather than for one screen.
 *
 * The check that matters is the last one. frame() returns immediately
 * once the match is over and the engine's clock is at timeScale zero
 * by then, so anything driven from the update hook is dead exactly
 * when the player needs it. The pointer runs on its own loop; this
 * proves it still moves and still clicks after the match has ended.
 *
 * Usage: node engine/test/padcursor.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT_DIR || path.join(ROOT, '.testshots');
fs.mkdirSync(OUT, { recursive: true });

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}
const note = (s) => console.log(`  ..   ${s}`);

/* A pad that is not there. navigator.getGamepads is the only way in,
   so the whole device is faked at that seam -- which is also the only
   way to test a controller with no controller. */
/* EVERY WAIT IN HERE IS IN FRAMES, NOT MILLISECONDS.
   SwiftShader delivers about two frames a second and the pointer runs
   on requestAnimationFrame, so a 400ms wait is under one poll. The
   first version of this test waited in milliseconds and reported that
   the chord did not work, the stick did not move it and the button was
   not pressed -- on a pointer that had simply not been polled yet. */
const frames = (page, n) => page.evaluate(
  (k) => new Promise((done) => {
    let i = 0;
    const step = () => (++i >= k ? done(i) : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);

const FAKE_PAD = `
window.__pad = { connected: true, mapping: 'standard',
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
navigator.getGamepads = function () { return [window.__pad]; };
window.__press = function (i, on) {
  window.__pad.buttons[i].pressed = !!on;
  window.__pad.buttons[i].value = on ? 1 : 0;
};
window.__stick = function (a, b) { window.__pad.axes[0] = a; window.__pad.axes[1] = b; };
`;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.addInitScript(FAKE_PAD);
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=town&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.waitForTimeout(1500);

  const off = await page.evaluate(() => ({ on: window.MP.pointer.on }));
  check('the pointer is off until it is asked for', off.on === false);

  /* The chord: all four directions of the D-pad at once. */
  const toggled = await page.evaluate(async () => {
    for (const i of [12, 13, 14, 15]) window.__press(i, true);
    for (let f = 0; f < 6; f++) await new Promise((r) => requestAnimationFrame(r));
    const on = window.MP.pointer.on;
    for (const i of [12, 13, 14, 15]) window.__press(i, false);
    for (let f = 0; f < 3; f++) await new Promise((r) => requestAnimationFrame(r));
    return { on, visible: !document.querySelector('#mpui .curs').classList.contains('hide') };
  });
  check('all four directions at once turns it on', toggled.on === true);
  check('and it appears on screen', toggled.visible === true);

  /* One direction alone must NOT toggle it -- the whole reason for a
     chord is that it cannot happen in a firefight. */
  const single = await page.evaluate(async () => {
    const before = window.MP.pointer.on;
    window.__press(12, true);
    for (let f = 0; f < 6; f++) await new Promise((r) => requestAnimationFrame(r));
    window.__press(12, false);
    for (let f = 0; f < 3; f++) await new Promise((r) => requestAnimationFrame(r));
    return { before, after: window.MP.pointer.on };
  });
  check('but one direction on its own does not', single.before === single.after);

  const moved = await page.evaluate(async () => {
    const a = window.MP.pointer.at;
    window.__stick(1, 0);
    for (let f = 0; f < 8; f++) await new Promise((r) => requestAnimationFrame(r));
    window.__stick(0, 0);
    const b = window.MP.pointer.at;
    return { dx: +(b.x - a.x).toFixed(1), from: +a.x.toFixed(0), to: +b.x.toFixed(0) };
  });
  note(`pointer moved ${moved.dx}px right (${moved.from} -> ${moved.to})`);
  check('the stick moves it', moved.dx > 20, `${moved.dx}px`);

  /* AND THE ONE THAT MATTERS: after the match is over, when the frame
     loop has returned early and the clock is stopped. */
  const ended = await page.evaluate(async () => {
    const M = window.MP.match;
    /* OFF FIRST, deliberately. The chord check above left it on, which
       would make the next assertion pass without the end screen having
       done anything at all. */
    window.MP.pointer.set(false);
    const beforeEnd = window.MP.pointer.on;
    M.over = true; M.winner = M.you.team;
    /* Past the slow-motion ramp and the Best Play replay. */
    for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
    const auto = window.MP.pointer.on;
    const btn = document.querySelector('#mpui .over .again');
    if (!btn) return { err: 'no Play Again button on the end screen' };
    /* A BUTTON THAT DOES NOT RELOAD THE PAGE.
       Play Again is wired to W.location.reload(), which is right --
       rebuilding the world is a much better way to get a second match
       than unpicking the first one's corpses and bullet holes. It is
       also fatal to a test standing inside the page: the moment the
       convergence fix above started actually reaching the button, the
       press landed, the page navigated, and the run died with
       "Execution context was destroyed" instead of reporting a pass.

       cloneNode copies the element and none of its listeners, so this
       is the same button in the same place with the game's handler
       left behind. What is under test is whether the pad's pointer can
       be driven onto it and press it, and that is exactly what
       survives. */
    const live = document.querySelector('#mpui .over .again');
    const btn2 = live.cloneNode(true);
    live.parentNode.replaceChild(btn2, live);
    const r = btn2.getBoundingClientRect();
    let clicked = false;
    btn2.addEventListener('click', () => { clicked = true; }, { once: true });
    /* Walk the pointer onto the button, then press A. */
    window.MP.pointer.set(true);
    const target = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    /* THE WALK COULD NOT CONVERGE, and this is the harness's control
       loop rather than anything the game does.

       The pointer moves 980*dt px a poll with dt capped at 0.1, and
       SwiftShader delivers about two frames a second, so every step is
       up to 98px. The gain only began easing inside 40px -- which
       still yields a ~49px step -- and the loop broke only within 6px.
       A 98px step and a 6px window oscillate across the target
       forever, and it stopped 75.2px away, about one button's height,
       which puts it on Return to Lobby instead of Play Again. The same
       failure to the tenth of a pixel on the commit before this one,
       so it was never flakiness and never the game.

       Easing from 160px shrinks the step to 12px at 20px out and 6px
       at 10px out, so it settles. The window is 14px, which is well
       inside a button. */
    for (let i = 0; i < 260; i++) {
      const p = window.MP.pointer.at;
      window.__stick(Math.max(-1, Math.min(1, (target.x - p.x) / 160)),
        Math.max(-1, Math.min(1, (target.y - p.y) / 160)));
      await new Promise((rf) => requestAnimationFrame(rf));
      const q = window.MP.pointer.at;
      if (Math.hypot(q.x - target.x, q.y - target.y) < 14) break;
    }
    window.__stick(0, 0);
    const at = window.MP.pointer.at;
    const near = Math.hypot(at.x - target.x, at.y - target.y);
    window.__press(0, true);
    for (let f = 0; f < 5; f++) await new Promise((rf) => requestAnimationFrame(rf));
    window.__press(0, false);
    return { near: +near.toFixed(1), clicked, beforeEnd, auto,
      timeScale: window.MP.game.timeScale };
  });
  note(`after the match: ${JSON.stringify(ended)}`);
  check('the end screen has a Play Again button', !ended.err, ended.err || '');
  /* THE CHORD IS NOT DISCOVERABLE ON THE SCREEN THAT NEEDS IT.
     Holding all four directions is a good way to summon the pointer
     mid-match, where every button is already busy, and no way at all
     to learn it exists on a finished match you cannot leave. So the
     end screen brings it up itself. */
  check('a finished match raises the pointer without being asked',
    !ended.err && ended.beforeEnd === false && ended.auto === true,
    `before ${ended.beforeEnd}, after ${ended.auto}`);
  check('the pointer still moves once the match is over and the clock stopped',
    !ended.err && ended.near < 16, `${ended.near}px from the button`);
  check('and pressing A presses the button', ended.clicked === true);

  await page.screenshot({ path: path.join(OUT, 'padcursor.jpg'), type: 'jpeg', quality: 86 });
  note(`shot -> ${path.join(OUT, 'padcursor.jpg')}`);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
