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
      const ev0 = M.events.length;
      await new Promise((rf) => requestAnimationFrame(rf));
      const f = now();
      t.total.push(f - last); last = f;
      t.sim.push(sim); t.hud.push(hud); t.vm.push(vm);
      /* What HAPPENED on the expensive frames. A spike with a spawn in
         it and a spike with nothing in it are two different bugs, and
         the number alone cannot tell them apart. */
      if (sim > 3) {
        t.why = t.why || [];
        t.why.push({ ms: +sim.toFixed(1),
          did: M.events.slice(ev0).map((e) => e.kind).join(',') || 'nothing' });
      }
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
      why: t.why || [], people: M.people.length, actors: G.game.actors.length,
      pathN: M._pathN, pathMs: M._pathMs,
      /* WHAT IS ACTUALLY BEING DRAWN. Everything above is JavaScript,
         and a game at two frames a second on real hardware is not a
         JavaScript problem. Draw calls, triangles, how many of those
         actors cannot be instanced, and which quality tier the thing
         decided to run at without ever asking. */
      tier: G.game.renderer.qualityName,
      shadowRes: G.game.renderer.quality.shadowRes,
      cascades: G.game.renderer.shadowMaps ? G.game.renderer.shadowMaps.length : 0,
      bloom: G.game.renderer.quality.bloomIters,
      draws: G.game.renderer.stats.draws,
      tris: G.game.renderer.stats.tris,
      instances: G.game.renderer.stats.instances,
      individual: G.game._individual ? G.game._individual.length : -1,
      /* WHERE THE TRIANGLES ARE. 780,000 a frame on a map made of
         boxes is not the map. Grouped by what the actor is, because
         "reduce the triangles" is not an action and "the twelve heads
         are 67,000 of them" is. */
      budget: (() => {
        const by = {};
        for (const a of G.game.actors) {
          if (!a.mesh || a.visible === false) continue;
          const v = a.mesh.vertexCount || 0;
          const n = a.name || '';
          let k = 'map';
          if (/^mp-/.test(n)) k = 'bodies';
          else if (/^gear-/.test(n)) k = 'gear';
          else if (a.__isArm || /:/.test(n)) k = 'weapons';
          else if (/head|neck|eyes|hair|beard|brow|balaclava/.test(n)) k = 'heads';
          else if (/teamband/.test(n)) k = 'bands';
          by[k] = (by[k] || 0) + v;
        }
        return by;
      })(),
      /* WHICH parts of a weapon are heavy. "Make the guns cheaper" is
         not an action; "the magazine's individual rounds are 4,000
         vertices apiece" is. */
      parts: (() => {
        const by = {};
        for (const a of G.game.actors) {
          if (!a.mesh || a.visible === false) continue;
          const n = a.name || '';
          const m = /^[^:]+:(.+)$/.exec(n);
          if (!m) continue;
          by[m[1]] = (by[m[1]] || 0) + (a.mesh.vertexCount || 0);
        }
        return Object.entries(by).sort((x, y) => y[1] - x[1]);
      })() };
  }, 90);

  note(`${r.people} people, ${r.actors} actors in the scene`);
  const ms = (s) => `mean ${s.mean.toFixed(2)}  median ${s.p50.toFixed(2)}`
    + `  p95 ${s.p95.toFixed(2)}  worst ${s.max.toFixed(2)} ms`;
  note(`match tick   ${ms(r.sim)}`);
  note(`HUD paint    ${ms(r.hud)}`);
  note(`viewmodel    ${ms(r.vm)}`);
  note(`whole frame  ${ms(r.total)}   (SwiftShader -- the GPU part is not real)`);

  note(`quality tier "${r.tier}": ${r.cascades} shadow cascade(s) at ${r.shadowRes}px,`
    + ` ${r.bloom} bloom iterations`);
  note(`${r.draws} draw calls, ${r.tris} triangles, ${r.instances} instances,`
    + ` ${r.individual} actors that cannot be instanced`);
  const totalV = Object.values(r.budget).reduce((a, b) => a + b, 0);
  note(`${(totalV / 1000).toFixed(0)}k vertices standing in the scene`);
  check('the scene is not carrying a quarter of a million vertices of detail',
    totalV < 300000, `${(totalV / 1000).toFixed(0)}k`);
  if (r.parts && r.parts.length) {
    note('heaviest weapon parts: ' + r.parts.slice(0, 10)
      .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}k`).join(', '));
  }
  note('vertices by kind: ' + Object.entries(r.budget)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}k`).join(', '));
  note(`${r.pathN} path searches so far, ${(r.pathMs / Math.max(1, r.pathN)).toFixed(2)} ms each`);
  check('one path search is not itself a dropped frame',
    r.pathN === 0 || r.pathMs / r.pathN < 5, `${(r.pathMs / Math.max(1, r.pathN)).toFixed(2)} ms`);
  if (r.why.length) {
    note(`${r.why.length} frames over 3 ms: `
      + r.why.slice(0, 8).map((w) => `${w.ms}ms [${w.did}]`).join('  '));
  } else note('no frame spent over 3 ms in the match tick');

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
  /* ABSOLUTE, not a ratio. Measured against a 0.30ms median, a
     perfectly healthy 7ms frame is "twenty-three times the median"
     and fails -- which says nothing about whether anybody could feel
     it. Half of a 16.6ms budget is the honest line. */
  const spike = Math.max(r.sim.max, r.hud.max, r.vm.max);
  note(`worst single frame in JavaScript: ${spike.toFixed(1)} ms`
    + ` (a 60fps budget is 16.6)`);
  check('no single frame eats half the budget in JavaScript', spike < 8,
    `${spike.toFixed(1)} ms`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
