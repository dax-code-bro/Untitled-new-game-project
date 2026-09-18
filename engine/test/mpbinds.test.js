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
     man rather than off how far he went. */
  const crouch = await page.evaluate(async () => {
    const ev = (type, code, key) => window.dispatchEvent(new KeyboardEvent(type,
      { key, code, bubbles: true }));
    const was = !!window.MP.match.you.crouching;
    ev('keydown', 'KeyN', 'n');
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    const onN = !!window.MP.match.you.crouching;
    ev('keyup', 'KeyN', 'n');
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    const offN = !!window.MP.match.you.crouching;
    ev('keydown', 'KeyC', 'c');
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    const onC = !!window.MP.match.you.crouching;
    ev('keyup', 'KeyC', 'c');
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    return { was, onN, offN, onC };
  });
  note(`crouch: start ${crouch.was}, on N ${crouch.onN}, released ${crouch.offN}, on C ${crouch.onC}`);
  check('crouch answers to the key it was bound to', crouch.was === false && crouch.onN === true);
  check('and lets go when it is released', crouch.offN === false);
  check('and the old crouch key is no longer a crouch key', crouch.onC === false);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
