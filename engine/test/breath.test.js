#!/usr/bin/env node
/* HOW LONG CAN YOU HOLD IT?
 *
 * Coastline has a machine on the lake bed and a cave to find, and until
 * this there was no clock on any of it -- you could sit on the bottom
 * forever. Water that cannot kill you is scenery.
 *
 * So: thirty seconds, two minutes with ADRENALINE, it comes back faster
 * than it goes, and when it is gone it drowns you. Every one of those
 * is a number a player will notice being wrong, so every one of them is
 * measured here rather than read off the source.
 *
 * The clock is driven by stepping the game, not by waiting: sixty steps
 * of a sixtieth is a second of game time and takes as long as it takes.
 * Under SwiftShader a frame is about half a second of real time, which
 * is why nothing here holds the player under for anywhere near the full
 * thirty -- the tank is drained by setting it low and the RATES are
 * what get measured.
 *
 * Usage: node engine/test/breath.test.js
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
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: 'coastline' });
    const S = B.S, P = B.P, G = B.game, C = window.COASTLINE;
    const T = window.__T;
    for (let i = 0; i < 12; i++) G.step(1 / 60);
    const out = {};

    /* Beside the machine, on the bottom, which is the one place on this
       map a player has a reason to be out of air. */
    const at = S.pap.at;
    const dunk = () => {
      T.teleport(at[0], at[1] + 0.35, at[2] + 0.6);
      for (let i = 0; i < 6; i++) G.step(1 / 60);
    };
    const surface = () => {
      T.teleport(at[0], C.C.water.y + 3.0, at[2] + 0.6);
      for (let i = 0; i < 6; i++) G.step(1 / 60);
    };
    const steps = (n) => { for (let i = 0; i < n; i++) G.step(1 / 60); };

    /* --- the size of the tank ----------------------------------------- */
    P.perks.adrenaline = false;
    surface(); P.breath = 999; steps(4);
    out.plain = P.breathMax;
    P.perks.adrenaline = true; steps(4);
    out.athlete = P.breathMax;
    /* A perk bought while holding your breath does not hand you air you
       never had -- it raises the ceiling, and the tank stays where it is. */
    P.perks.adrenaline = false; steps(4);
    out.backDown = P.breath <= out.plain + 0.001;

    /* --- it drains under water ---------------------------------------- */
    dunk();
    out.under = !!P.underwater;
    P.breath = 20;
    const b0 = P.breath;
    steps(30);                                  // half a second of game time
    out.drain = +((b0 - P.breath) / 0.5).toFixed(2);   // seconds of air per second

    /* --- and comes back faster on the surface -------------------------- */
    P.breath = 10;
    surface();
    out.stillUnder = !!P.underwater;
    const b1 = P.breath;
    steps(30);
    out.refill = +((P.breath - b1) / 0.5).toFixed(2);

    /* --- and when it is gone it drowns you ----------------------------- */
    T.god(false);
    dunk();
    P.breath = 0.001; P.drownT = 0;
    const hp0 = P.hp;
    steps(126);                                 // just over two seconds
    out.hp0 = hp0;
    out.lost = +(hp0 - P.hp).toFixed(1);
    out.bottomed = P.breath;

    /* --- and stops the moment you are out of the water ----------------- */
    surface();
    const hp1 = P.hp;
    steps(60);
    out.lostAfter = +(hp1 - P.hp).toFixed(1);
    out.recovered = P.breath > 0.5;

    /* --- and the bar is on the screen while it matters ----------------- */
    const bar = document.querySelector('#b9hud .breath');
    const fill = document.querySelector('#b9hud .breathfill');
    const lbl = document.querySelector('#b9hud .breathlbl');
    out.hasBar = !!(bar && fill && lbl);
    dunk(); P.breath = 3; steps(2);
    out.shownLow = bar ? bar.style.opacity : null;
    out.redLow = fill ? fill.style.background : null;
    P.breath = 0; P.drownT = 0; steps(2);
    out.saysDrowning = lbl ? lbl.textContent : null;
    surface(); P.breath = P.breathMax; steps(2);
    out.hiddenFull = bar ? bar.style.opacity : null;
    T.god(true);
    return out;
  });

  note(JSON.stringify(r));
  check('the water is deep enough to be under', r.under, 'not underwater beside the machine');
  /* THE TANK. */
  check('thirty seconds of air', r.plain === 30, `${r.plain} s`);
  check('and two minutes with ADRENALINE', r.athlete === 120, `${r.athlete} s`);
  check('losing the perk does not hand you air you never had', r.backDown, 'breath exceeded the new ceiling');
  /* THE RATES. */
  check('it drains a second per second under water',
    Math.abs(r.drain - 1) < 0.15, `${r.drain} s of air per second`);
  check('and comes back four times as fast on the surface',
    Math.abs(r.refill - 4) < 0.5, `${r.refill} s of air per second`);
  check('and the surface is the surface', !r.stillUnder, 'still counted as underwater above it');
  /* THE DROWNING. */
  check('out of air, it kills you', r.lost >= 20 && r.lost <= 30,
    `${r.lost} of ${r.hp0} hp in two seconds`);
  check('and it stops when you get your head out', r.lostAfter === 0, `${r.lostAfter} hp after surfacing`);
  check('and the air comes back', r.recovered, 'still empty a second later');
  /* THE HUD. */
  check('there is a breath bar', r.hasBar, 'no .breath in the hud');
  check('shown when it is low', r.shownLow === '1', `opacity ${r.shownLow}`);
  check('and red', /255,\s*90,\s*74|#ff5a4a/i.test(r.redLow || ''), `${r.redLow}`);
  check('and it says DROWNING when it is gone', r.saysDrowning === 'DROWNING', `"${r.saysDrowning}"`);
  check('and hidden again when the lungs are full', r.hiddenFull === '0', `opacity ${r.hiddenFull}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
