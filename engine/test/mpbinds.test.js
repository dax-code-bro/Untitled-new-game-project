#!/usr/bin/env node
/* DOES A REBOUND KEY ACTUALLY DO ANYTHING IN A MATCH?
 *
 * "Every key rebindable, and the rebinding has to actually apply."
 * Zombies applied it. Multiplayer did not: mp-game carried its own
 * hardcoded table with a comment saying the rebinding work could point
 * at it later, and later never came. The settings screen let you move
 * a key, saved it, published it, and a match read W regardless.
 *
 * So this saves a binding the way the settings screen does -- into
 * localStorage before the page loads -- and then asks the only
 * question that matters: does the new key move the man, and does the
 * old one stop moving him?
 *
 * The old one mattering is the half that a weaker test would skip. A
 * rebind that ADDS a key rather than replacing one looks identical
 * from the new key's side and is not a rebind.
 *
 * Usage: node engine/test/mpbinds.test.js
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

/* Forward moved off W onto I, and crouch off C onto N. Written the way
   the settings screen writes it, under the key the settings screen
   uses, before a line of game code runs. */
const SAVED = `
try {
  const s = JSON.parse(localStorage.getItem('b9.settings.v1') || '{}');
  s.keyBinds = Object.assign({}, s.keyBinds, { fwd: 'KeyI', crouch: 'KeyN' });
  localStorage.setItem('b9.settings.v1', JSON.stringify(s));
} catch (e) { /* storage off: the test will simply fail, which is right */ }
`;

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.addInitScript(SAVED);
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html')
    + '?map=helipad&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.waitForTimeout(1200);

  /* EVERY WAIT IS IN FRAMES. SwiftShader runs at about two a second,
     so a 400ms hold is not reliably even one tick of the game. */
  const holdFor = async (code, frames) => page.evaluate(async ({ code, frames }) => {
    const ev = (type) => window.dispatchEvent(new KeyboardEvent(type, {
      key: code.replace('Key', '').toLowerCase(), code, bubbles: true,
    }));
    const p = window.MP.match.you.pos;
    const from = { x: p.x, z: p.z };
    ev('keydown');
    for (let i = 0; i < frames; i++) await new Promise((r) => requestAnimationFrame(r));
    ev('keyup');
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
    const q = window.MP.match.you.pos;
    return +Math.hypot(q.x - from.x, q.z - from.z).toFixed(3);
  }, { code, frames });

  const onNew = await holdFor('KeyI', 10);
  note(`held the rebound forward key (I): moved ${onNew}m`);
  check('a key the player moved forward onto moves him forward', onNew > 0.5,
    `${onNew}m`);

  const onOld = await holdFor('KeyW', 10);
  note(`held the key it was moved OFF (W): moved ${onOld}m`);
  check('and the key it was moved off does nothing', onOld < 0.15, `${onOld}m`);

  /* Crouch is a state rather than a distance, so it is read off the
     man rather than off how far he went.

     AND A TAP IS UNREACHABLE HERE, so the test uses the mechanic that
     is. mp-match makes crouch a TAP toggle and a HOLD past HOLD_T
     (220ms) the drop: hold it and you go prone, and releasing does not
     stand you up again -- only another tap or a jump does. A frame
     under SwiftShader is about half a second, so the shortest press
     this harness can make is four hundred percent of HOLD_T. Every
     press it makes is a hold, every hold is a dive, and asking a man
     who is correctly still flat on his face whether he stood up when
     the key came up was asking the game to be wrong.

     So: hold the bound key and he goes down, jump to get him up --
     which is what the game offers -- and then give the OLD key the
     whole budget and require it to spend all of it doing nothing. */
  const crouch = await page.evaluate(async () => {
    const ev = (type, code, key) => window.dispatchEvent(new KeyboardEvent(type,
      { key, code, bubbles: true }));
    const low = () => {
      const y = window.MP.match.you;
      return !!(y.crouching || y.prone || y.sliding);
    };
    const until = async (want, n) => {
      for (let i = 0; i < n; i++) {
        if (low() === want) return i;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return low() === want ? n : -1;
    };
    const was = low();

    ev('keydown', 'KeyN', 'n');
    const onN = await until(true, 16);
    ev('keyup', 'KeyN', 'n');

    /* Up again: `p.prone && cmd.jump` is the game's own way out of a
       drop, and it is read with `once`, so it needs a fresh press.

       AND IT LANDS IN A CROUCH, not on his feet -- that same line sets
       crouching true. So `low()` stays true after the jump and asking
       it whether he got up says no forever. Prone is the signal from
       here on. Getting fully upright needs a TAP, which this harness
       cannot make. */
    const prone = () => !!window.MP.match.you.prone;
    ev('keydown', 'Space', ' ');
    await new Promise((r) => requestAnimationFrame(r));
    ev('keyup', 'Space', ' ');
    let upAgain = -1;
    for (let i = 0; i < 20; i++) {
      if (!prone()) { upAgain = i; break; }
      await new Promise((r) => requestAnimationFrame(r));
    }

    /* The old key gets the whole budget and has to spend all of it NOT
       dropping him. If C were still bound, a hold this long is a dive
       and prone would come back. */
    ev('keydown', 'KeyC', 'c');
    let onC = -1;
    for (let i = 0; i < 16; i++) {
      if (prone()) { onC = i; break; }
      await new Promise((r) => requestAnimationFrame(r));
    }
    ev('keyup', 'KeyC', 'c');
    return { was, onN, upAgain, onC };
  });
  note(`stance: start low ${crouch.was}, down ${crouch.onN} frames after N, `
    + `off his face ${crouch.upAgain} frames after a jump, old key C ${crouch.onC}`);
  check('crouch answers to the key it was bound to',
    crouch.was === false && crouch.onN >= 0, `${crouch.onN} frames`);
  check('and a jump gets him off his face again',
    crouch.upAgain >= 0, 'still prone after 20 frames');
  check('and the old crouch key no longer drops him', crouch.onC === -1,
    crouch.onC === -1 ? '' : `went prone ${crouch.onC} frames after C`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
