#!/usr/bin/env node
/* TWO EFFECTS THAT EXISTED AND WERE NOT REACHING ANYBODY.
 *
 * Neither SSAO nor the distance fog was missing. Both were built, both
 * were wired, and both were doing nothing useful where it counted:
 *
 *   SSAO was switched off on every tier a phone can reach. `retro`,
 *   `low` and `normal` all carried ssao: 0, and detectQuality() returns
 *   `normal` at best for mobile. Only an eight-core desktop ever saw a
 *   contact shadow.
 *
 *   The fog faded everything to uFogColor -- one flat value -- while
 *   the sky behind it is a gradient. So a distant silhouette did not
 *   dissolve, it turned into a flat cutout of itself against a sky of a
 *   different colour.
 *
 * HOW THESE ARE MEASURED, AND THE MISTAKE THAT SHAPED IT.
 *
 * The first pass at the fog measurement compared a band it called "sky"
 * against a band it called "far" and reported that the gap between them
 * GREW. Both labels were wrong: the far treeline at z 150 subtends
 * about ten pixels above centre at this field of view, so it sat inside
 * the "sky" band, and the "far" band was lake water. The measurement
 * was treeline-plus-sky against water, which answers nothing about
 * whether a silhouette dissolves.
 *
 * So the metric here is not a gap between two bands. It is the CONTRAST
 * WITHIN one band that straddles the horizon: p90 is the sky in it and
 * p10 is the silhouette in it. That makes the claim falsifiable in the
 * right way -- if the sky moved, the frame is being washed out rather
 * than the silhouette being dissolved, and the sky check catches it.
 *
 * Every threshold below comes from a probe run that asserted nothing.
 * They are set at roughly half the measured effect, so a real
 * regression trips them and rendering noise does not.
 *
 * Usage: node engine/test/graphics.test.js
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
const pct = (a, b) => +(((b - a) / (a || 1)) * 100).toFixed(1);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/coastline.js'), 'utf8') });

  const r = await page.evaluate(() => {
    /* `normal` on purpose: it is the tier this change is about, and the
       tier a phone lands on. */
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'normal', map: 'coastline' });
    const G = B.game, T = window.__T;
    const R = G.renderer, gl = R.gl, cv = G.canvas;
    for (let i = 0; i < 20; i++) G.step(1 / 60);
    const out = { tier: R.qualityName, ssao: R.quality.ssao, samples: R.quality.ssaoSamples,
      skyBlend: R.fog.skyBlend };

    // readPixels counts y from the BOTTOM, which is upside down from
    // every other coordinate here and has caught this codebase before.
    const band = (y0, y1, x0, x1) => {
      const w = x1 - x0, h = y1 - y0;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const l = [];
      for (let i = 0; i < px.length; i += 4) l.push(px[i] * 0.30 + px[i + 1] * 0.59 + px[i + 2] * 0.11);
      l.sort((a, b) => a - b);
      const at = (p) => +l[Math.min(l.length - 1, Math.floor(l.length * p))].toFixed(1);
      return { mean: +(l.reduce((a, b) => a + b, 0) / l.length).toFixed(1),
        p10: at(0.10), p50: at(0.50), p90: at(0.90) };
    };
    const W = cv.width, H = cv.height;
    const whole = () => band(Math.floor(H * 0.2), Math.floor(H * 0.8),
      Math.floor(W * 0.2), Math.floor(W * 0.8));

    /* ---- SSAO: the same frame with the pass off and on --------------- */
    /* Down the green at the houses -- roofs, eaves, door frames and a
       ground plane, which is where contact shadows live. */
    T.teleport(-24, 1.2, -6);
    T.look(Math.PI, -0.05);
    for (let i = 0; i < 8; i++) G.step(1 / 60);
    const keep = R.quality.ssao, keepN = R.quality.ssaoSamples;
    R.quality.ssao = 0; R.quality.ssaoSamples = 0;
    G.step(1 / 60); out.aoOff = whole();
    R.quality.ssao = keep; R.quality.ssaoSamples = keepN;
    G.step(1 / 60); out.aoOn = whole();

    /* ---- FOG: one band across the horizon ---------------------------- */
    T.teleport(0, 1.4, -2);
    T.look(0, 0.0);
    for (let i = 0; i < 8; i++) G.step(1 / 60);
    const mid = Math.floor(H / 2);
    const horizon = () => band(mid + 5, mid + 22, Math.floor(W * 0.3), Math.floor(W * 0.7));
    const kb = R.fog.skyBlend;
    R.fog.skyBlend = 0; G.step(1 / 60); out.fogOff = horizon();
    R.fog.skyBlend = kb; G.step(1 / 60); out.fogOn = horizon();

    /* ---- and a near surface, which must NOT move --------------------- */
    const C = window.COASTLINE.C;
    T.teleport(C.ranch.x, 1.3, C.ranch.z + 8);
    T.look(Math.PI, 0.0);
    for (let i = 0; i < 8; i++) G.step(1 / 60);
    R.fog.skyBlend = 0; G.step(1 / 60); out.nearOff = whole();
    R.fog.skyBlend = kb; G.step(1 / 60); out.nearOn = whole();
    return out;
  });

  note(JSON.stringify(r));

  /* THE PASS RUNS AT ALL on the tier a phone gets. This is the whole
     bug: everything below was already true on `high` and nobody on a
     phone has ever seen any of it. */
  check('SSAO is enabled on the tier a phone lands on',
    r.ssao > 0 && r.samples > 0, `${r.tier}: ssao=${r.ssao}, samples=${r.samples}`);

  /* AND IT IS OCCLUSION, NOT A DIMMER. The bright end must not move --
     a frame that darkens everywhere is a global multiply, and would
     pass a "did it get darker" check while looking nothing like AO. */
  const d90 = Math.abs(pct(r.aoOff.p90, r.aoOn.p90));
  check('it leaves the bright end alone', d90 < 2,
    `p90 moved ${d90}% (${r.aoOff.p90} to ${r.aoOn.p90})`);
  check('and darkens the ambient mid-tones', pct(r.aoOff.p50, r.aoOn.p50) < -5,
    `p50 ${pct(r.aoOff.p50, r.aoOn.p50)}% (${r.aoOff.p50} to ${r.aoOn.p50})`);
  check('so the frame carries more contact shadow overall',
    pct(r.aoOff.mean, r.aoOn.mean) < -2,
    `mean ${pct(r.aoOff.mean, r.aoOn.mean)}% (${r.aoOff.mean} to ${r.aoOn.mean})`);

  /* THE FOG. Within one band across the horizon: p90 is the sky in it,
     p10 is the silhouette in it. */
  const s90 = Math.abs(pct(r.fogOff.p90, r.fogOn.p90));
  check('the sky itself is untouched by the blend', s90 < 2,
    `band p90 moved ${s90}% (${r.fogOff.p90} to ${r.fogOn.p90})`);
  check('and the distant silhouette rises toward it',
    pct(r.fogOff.p10, r.fogOn.p10) > 8,
    `band p10 ${pct(r.fogOff.p10, r.fogOn.p10)}% (${r.fogOff.p10} to ${r.fogOn.p10})`);
  const cOff = r.fogOff.p90 - r.fogOff.p10, cOn = r.fogOn.p90 - r.fogOn.p10;
  check('so the silhouette dissolves instead of standing out',
    pct(cOff, cOn) < -8, `contrast ${pct(cOff, cOn)}% (${cOff.toFixed(1)} to ${cOn.toFixed(1)})`);

  /* AND IT IS NOT A WASH. If a near wall moves, the fog is being
     applied where there is no distance, which would be the obvious way
     to fake the numbers above. */
  const dn = Math.abs(pct(r.nearOff.mean, r.nearOn.mean));
  check('a near surface does not move', dn < 5,
    `near mean moved ${dn}% (${r.nearOff.mean} to ${r.nearOn.mean})`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
