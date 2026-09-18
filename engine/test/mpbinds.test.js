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

     CROUCHING **OR** PRONE. Holding the crouch key past HOLD_T drops
     you flat, which is the point of the drop mechanic -- and a frame
     under SwiftShader is about half a second, so six of them is three
     seconds and the man is long since on his face. The first version
     of this asked only for `crouching` and reported that a working
     rebind did nothing. What the key has to do is change his stance;
     which of the two low stances he ends in is the hold timer's
     business, not the binding's. */
  const crouch = await page.evaluate(async () => {
    const ev = (type, code, key) => window.dispatchEvent(new KeyboardEvent(type,
      { key, code, bubbles: true }));
    const low = () => {
      const y = window.MP.match.you;
      return !!(y.crouching || y.prone || y.sliding);
    };
    const settle = async (n) => {
      for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
    };
    /* WAIT FOR IT TO HAPPEN, rather than guessing how long it takes.
       A fixed four-frame settle reported `on N false, released true` --
       the stance did change, one sample too late, and the check read
       the lag as a dead binding and then read the leftover crouch as
       the old key still working. Three failures, one cause, and the
       cause was the clock. Polling until it flips says both what
       happened and how long it took. */
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
    const offN = await until(false, 16);
    /* And the old key: it must NEVER take him low, so this one wants
       the whole budget to elapse without it happening. */
    ev('keydown', 'KeyC', 'c');
    const onC = await until(true, 16);
    ev('keyup', 'KeyC', 'c');
    await until(false, 16);
    return { was, onN, offN, onC };
  });
  note(`low stance: start ${crouch.was}, went low ${crouch.onN} frames after N, `
    + `stood up ${crouch.offN} frames after release, old key C ${crouch.onC}`);
  check('crouch answers to the key it was bound to',
    crouch.was === false && crouch.onN >= 0, `${crouch.onN} frames`);
  check('and stands back up when it is released', crouch.offN >= 0, `${crouch.offN} frames`);
  check('and the old crouch key is no longer a crouch key', crouch.onC === -1,
    crouch.onC === -1 ? '' : `went low ${crouch.onC} frames after C`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
