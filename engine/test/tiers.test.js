#!/usr/bin/env node
/* The quality watchdog, and the floor under it.
 *
 * The watchdog exists because the engine picks a tier from the RAM and
 * the CPU core count -- neither of which is the graphics card -- and
 * then never checks whether the machine is keeping up. It was shipped
 * able to step three tiers down, and the tier three below 'high' is
 * 'retro': 0.26 of the display resolution, a nine-colour palette and
 * the frame rate pinned at 24. That is a 1996 machine ON PURPOSE,
 * chosen from a menu by somebody who wants it.
 *
 * A struggling laptop walked into it and the player reported, quite
 * reasonably, that their screen looked broken. This is the test that
 * would have caught it:
 *
 *   - it steps down when frames are slow, and
 *   - it never, ever reaches retro on its own, and
 *   - it never steps back up, and
 *   - in zombies it goes through the game's own preset, so the canvas
 *     filtering and the saved setting agree with the picture.
 *
 * Usage: node engine/test/tiers.test.js
 */
const fs = require('fs');
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
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  /* Driven directly rather than through a game: the watchdog reads the
     dt it is handed, so a synthetic slow frame is a slow frame. */
  const run = await page.evaluate(() => {
    const G = LE.create({ canvas: '#game', quality: 'high', gravity: 0 });
    const seen = [];
    G.autoQuality({ target: 40, settle: 0, onChange: (t, fps, step) => seen.push({ t, fps, step }) });
    const start = G.renderer.qualityName;
    // Two hundred frames at five frames a second.
    for (let i = 0; i < 200; i++) G._watchFrames(0.2);
    const bottom = G.renderer.qualityName;
    // Now give it plenty of frames and check it does NOT climb back.
    for (let i = 0; i < 400; i++) G._watchFrames(1 / 144);
    return { start, bottom, after: G.renderer.qualityName, seen,
      scale: G.renderer.quality.renderScale, cap: G.renderer.quality.fpsCap || 0,
      posterize: G.renderer.quality.posterize || 0 };
  });

  note(`started at "${run.start}", walked to "${run.bottom}" via `
    + run.seen.map((s) => `${s.t}@${s.fps}fps`).join(' -> '));
  check('it notices a machine that cannot keep up', run.seen.length > 0,
    'it never stepped down at all');
  check('and it stops at low, never retro', run.bottom === 'low', run.bottom);
  check('the picture is still rendered at a sane resolution',
    run.scale >= 0.6, `renderScale ${run.scale}`);
  check('with no palette quantising and no frame cap',
    run.posterize === 0 && run.cap === 0, `posterize ${run.posterize}, cap ${run.cap}`);
  check('and it never climbs back up on a quiet moment', run.after === run.bottom,
    `${run.bottom} -> ${run.after}`);

  /* The apply hook: the game gets to own how a tier lands. */
  const applied = await page.evaluate(() => {
    const G = LE.create({ canvas: '#game', quality: 'high', gravity: 0 });
    const asked = [];
    G.autoQuality({ target: 40, settle: 0, apply: (t) => asked.push(t) });
    const before = G.renderer.qualityName;
    for (let i = 0; i < 120; i++) G._watchFrames(0.2);
    return { asked, before, still: G.renderer.qualityName };
  });
  note(`apply hook asked for: ${applied.asked.join(', ') || 'nothing'}`);
  check('the game is asked to apply the tier, not bypassed',
    applied.asked.length > 0 && applied.asked[applied.asked.length - 1] === 'low',
    applied.asked.join(','));
  check('and the renderer is left alone when the game owns it',
    applied.still === applied.before, `${applied.before} -> ${applied.still}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
