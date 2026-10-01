#!/usr/bin/env node
/* WHERE THE BREECH RESTS: the open bolt and the hold-open.
 *
 * 97e-action.js says which guns fire from an open bolt (cocked with the
 * bolt BACK, forward on the shot, home on an empty magazine) and which
 * lock back on the last round (slide or bolt caught open, released at the
 * end of the reload). This checks the table against the real guns, the
 * travel function, poseAction with it, and then the zombies game itself:
 *
 *   Thompson   at rest the bolt is back; fired dry it is home; reloaded,
 *              it is back again
 *   M1911      at rest the slide is home; fired dry it is locked back;
 *              reloaded, it is home
 *   MP5        neither: home at rest and home when empty, as the real one
 *
 * Usage: node engine/test/breech.test.js
 */
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..') + '/';
let passed = 0, failed = 0;
const check = (n, c, d) => { if (c) { passed++; console.log('  ok   ' + n); }
  else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } };

(async () => {
  const LE = require(R + 'site/engine/legend-engine.js');
  console.log('the table');
  for (const id of ['thompson', 'mp40', 'sten', 'ppsh', 'grease', 'mg42', 'm60', 'bar', 'bren'])
    check(`${id} fires from an open bolt`, LE.breechOf(id).openBolt);
  for (const id of ['m1911', 'p226', 'm16', 'm4', 'garand', 'aug', 'mauser'])
    check(`${id} holds open on the last round`, LE.breechOf(id).holdOpen);
  for (const id of ['mp5', 'ak47', 'ak74', 'g3a', 'p90', 'stg44', 'remington'])
    check(`${id} does neither (as the real one)`, !LE.breechOf(id).openBolt && !LE.breechOf(id).holdOpen);

  console.log('poseAction');
  const mk = () => { const g = { slide: { p: null, setPosition(v) { this.p = v; } }, slideTravel: 0.02 }; return g; };
  const act = LE.weaponAction({ act: 'selfLoading' });
  let g = mk();
  LE.poseAction(g, act, { fire: 0, fireU: -1, breech: LE.breechOf('m1911'), empty: true });
  check('an empty 1911 shows its slide locked back', Math.abs(g.slide.p[0] + 0.02) < 1e-6, JSON.stringify(g.slide.p));
  g = mk();
  LE.poseAction(g, act, { fire: 0, fireU: -1, breech: LE.breechOf('m1911'), empty: false });
  check('a loaded one, home', Math.abs(g.slide.p[0]) < 1e-6);
  g = mk();
  LE.poseAction(g, act, { fire: 0, fireU: -1, breech: LE.breechOf('thompson'), empty: false });
  check('a cocked open-bolt gun shows the breech back', Math.abs(g.slide.p[0] + 0.02) < 1e-6);
  g = mk();
  LE.poseAction(g, act, { fire: 0, fireU: -1 });
  check('without a breech the old behaviour (home) is unchanged', Math.abs(g.slide.p[0]) < 1e-6);

  console.log('in the zombies game');
  const { chromium } = require('playwright');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 200, height: 120 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  await p.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0"></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/games/bunker-nine.js', 'utf8') });
  const r = await p.evaluate(() => {
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    const S = B.S, P = B.P;
    const run = (n) => { for (let i = 0; i < n; i++) { S.toSpawn = 0; S.spawnT = 1e9; B.game.step(1 / 60); } };
    __T.god(true); __T.killAll(); __T.teleport(-2.4, 1.1, 1.4); __T.look(Math.PI * 0.98, 0); run(30);
    // How far back the breech is, 0 home .. 1 fully back, read off the model.
    const travel = (id) => {
      const v = P.view[id];
      if (v.kind === 'single') {
        const sl = v.actor.slide;
        return sl ? -sl.position.x / (v.actor.slideTravel || 0.02) : null;
      }
      if (!v.bolt || !v.boltThrow) return null;
      const R0 = v.boltRest || [0, 0, 0], T = v.boltThrow, q = v.bolt.position;
      const L = Math.hypot(T[0], T[1], T[2]) || 1;
      return ((q.x - R0[0]) * T[0] + (q.y - R0[1]) * T[1] + (q.z - R0[2]) * T[2]) / (L * L);
    };
    const out = {};
    for (const id of ['thompson', 'm1911', 'mp5']) {
      if (!P.view[id]) continue;
      __T.release(); __T.give(id); run(70);
      const a = P.ammoFor(id);
      a.reserve = 99;
      const rest = travel(id);
      // Fire it dry: one round left, one shot.
      a.mag = 1; run(5);
      __T.hold({ fire: true }); run(1); __T.release(); run(40);
      const empty = travel(id);
      __T.reload();
      let n = 0; while (P.reloading > 0 && n++ < 600) run(1);
      run(30);
      out[id] = { rest: +rest.toFixed(3), empty: +empty.toFixed(3), reloaded: +travel(id).toFixed(3), mag: a.mag };
    }
    return out;
  });
  console.log('   ' + JSON.stringify(r));
  check('Thompson, cocked: the bolt is back', r.thompson && r.thompson.rest > 0.9, JSON.stringify(r.thompson));
  check('Thompson, fired dry: the bolt is home', r.thompson && r.thompson.empty < 0.1, JSON.stringify(r.thompson));
  check('Thompson, reloaded: back again', r.thompson && r.thompson.reloaded > 0.9, JSON.stringify(r.thompson));
  check('M1911, loaded: the slide is home', r.m1911 && r.m1911.rest < 0.05, JSON.stringify(r.m1911));
  check('M1911, fired dry: the slide is locked back', r.m1911 && r.m1911.empty > 0.95, JSON.stringify(r.m1911));
  check('M1911, reloaded: the slide is home', r.m1911 && r.m1911.reloaded < 0.05, JSON.stringify(r.m1911));
  if (r.mp5) check('MP5: home when empty (it has no hold-open)', r.mp5.empty < 0.1, JSON.stringify(r.mp5));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
