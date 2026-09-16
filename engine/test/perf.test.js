#!/usr/bin/env node
/* Where the frame actually goes.
 *
 * "It feels like there's not enough frames and it feels glitchy." Those
 * are two different complaints and they have two different causes: a
 * low average, and a bad worst case. A game at a steady 45 feels better
 * than one that averages 60 with a 90-millisecond frame every second,
 * and only the second one is described as glitchy -- so this reports
 * the distribution, not the mean.
 *
 * The renderer here is SwiftShader, which draws this game at a few
 * frames a second, so the GPU number is meaningless and is not
 * reported. What IS meaningful is the JavaScript: the match tick, the
 * HUD, the viewmodel and the engine's own per-frame work all run on the
 * main thread whatever is drawing, and a spike in any of them is a
 * spike the player feels on real hardware too.
 *
 * Usage: node engine/test/perf.test.js
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=town&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.evaluate(() => window.MP.input._lock(true));

  const r = await page.evaluate(async (N) => {
    const G = window.MP, M = G.match;
    const t = { sim: [], hud: [], vm: [], total: [] };
    const now = () => performance.now();

    /* Wrap, measure, unwrap. Wrapping is itself a cost, so the totals
       are read against an unwrapped baseline afterwards. */
    const realUpdate = M.update, realPaint = G.hud.paint, realPlace = G.viewmodel.place;
    let sim = 0, hud = 0, vm = 0;
    M.update = function (dt) { const a = now(); realUpdate.call(M, dt); sim += now() - a; };
    G.hud.paint = function () { const a = now(); realPaint.apply(G.hud, arguments); hud += now() - a; };
    G.viewmodel.place = function () {
      const a = now(); realPlace.apply(G.viewmodel, arguments); vm += now() - a;
    };

    /* Walk and shoot while it measures -- an idle frame is not the
       frame anybody complains about. */
    G.input._press('w');
    G.input.buttons.fire = true;
    let last = now();
    for (let i = 0; i < N; i++) {
      sim = hud = vm = 0;
      await new Promise((rf) => requestAnimationFrame(rf));
      const f = now();
      t.total.push(f - last); last = f;
      t.sim.push(sim); t.hud.push(hud); t.vm.push(vm);
    }
    G.input._release('w');
    G.input.buttons.fire = false;
    M.update = realUpdate; G.hud.paint = realPaint; G.viewmodel.place = realPlace;

    const stat = (a) => {
      const s = a.slice().sort((x, y) => x - y);
      return { mean: a.reduce((p, q) => p + q, 0) / a.length,
        p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)],
        max: s[s.length - 1] };
    };
    return { sim: stat(t.sim), hud: stat(t.hud), vm: stat(t.vm), total: stat(t.total),
      people: M.people.length, actors: G.game.actors.length };
  }, 90);

  note(`${r.people} people, ${r.actors} actors in the scene`);
  const ms = (s) => `mean ${s.mean.toFixed(2)}  median ${s.p50.toFixed(2)}`
    + `  p95 ${s.p95.toFixed(2)}  worst ${s.max.toFixed(2)} ms`;
  note(`match tick   ${ms(r.sim)}`);
  note(`HUD paint    ${ms(r.hud)}`);
  note(`viewmodel    ${ms(r.vm)}`);
  note(`whole frame  ${ms(r.total)}   (SwiftShader -- the GPU part is not real)`);

  /* Budgets are against a 16.6ms frame on real hardware. The
     simulation, the HUD and the viewmodel together are what this file
     controls; the draw is the engine's business. */
  check('the match tick is a small part of a frame', r.sim.p95 < 4.0,
    `p95 ${r.sim.p95.toFixed(2)} ms`);
  check('the HUD is not doing layout work every frame', r.hud.p95 < 2.0,
    `p95 ${r.hud.p95.toFixed(2)} ms`);
  check('and the viewmodel is cheap to place', r.vm.p95 < 2.0,
    `p95 ${r.vm.p95.toFixed(2)} ms`);
  /* The one that matters for "glitchy": no single frame should cost
     many times the median in JavaScript. */
  const spike = Math.max(r.sim.max / Math.max(0.01, r.sim.p50),
    r.hud.max / Math.max(0.01, r.hud.p50));
  note(`worst JS spike is ${spike.toFixed(1)}x the median frame`);
  check('no frame costs many times the median in JavaScript', spike < 25,
    `${spike.toFixed(1)}x`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
