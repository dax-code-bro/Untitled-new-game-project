/* Every reload, every gun, measured on the two things that were wrong.
 *
 *  1. Is the load ON SCREEN while it is being carried? "I'm not holding a
 *     magazine. I'm not holding anything." It was in the hand and below
 *     the bottom edge of the picture.
 *  2. Is the support HAND on the load while it carries it? A magazine
 *     travelling beside a hand is not a magazine being carried.
 *  3. Is anything left hanging in the air when the reload ends?
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..') + '/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 300, height: 190 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/games/bunker-nine.js', 'utf8') });
  const r = await p.evaluate(() => {
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    const run = (n) => { for (let i = 0; i < n; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1/60); } };
    __T.buildPool(2); __T.god(true); __T.killAll();
    __T.teleport(-2.4, 1.1, 1.4); __T.look(Math.PI * 0.98, 0.02); run(20);
    const P = B.P, out = [];
    // World point -> normalised screen; -1..1 in both axes is on screen.
    const ndc = (a) => {
      const m = B.game.camera.viewProj.e, e = a.matrix.e;
      const x = e[12], y = e[13], z = e[14];
      const w = m[3]*x + m[7]*y + m[11]*z + m[15];
      if (w <= 1e-5) return null;
      return [(m[0]*x + m[4]*y + m[8]*z + m[12]) / w, (m[1]*x + m[5]*y + m[9]*z + m[13]) / w];
    };
    const wp = (a) => { const e = a.matrix.e; return [e[12], e[13], e[14]]; };
    const GUNS = Object.keys(__T_WEAPONS).filter((k) => {
      const w = __T_WEAPONS[k];
      return !w.melee && w.reload && w.reloadKind && P.view[k];
    });
    for (const id of GUNS) {
      __T.release(); P.give(id); run(20);
      P.ammoFor(id).mag = 0;
      __T.hold({ fire: true }); run(5); __T.release(); run(2);
      const v = P.view[id];
      let frames = 0, shown = 0, onScreen = 0, inHand = 0, worstHand = 0, lowest = 9;
      let guard = 0;
      while (P.reloading > 0 && guard++ < 900) {
        run(1); frames++;
        const pr = v.prop;
        const vis = pr ? pr.parts.filter((a) => a.visible !== false) : [];
        if (!vis.length) continue;
        shown++;
        const q = ndc(vis[0]);
        if (q) {
          if (q[1] < lowest) lowest = q[1];
          if (q[0] > -1 && q[0] < 1 && q[1] > -1 && q[1] < 1) onScreen++;
        }
        /* How far the support hand is from the thing it is supposed to be
           holding.
           
           NOT the actor's origin. An arm mesh is authored in the weapon's
           own space, so its actor sits at the weapon's origin and its
           position field is only the OFFSET the reload has applied. The
           hand is at (authored hand point + that offset). Measuring the
           actor origin instead reports the distance from the gun's web to
           the magazine, which is a real number about nothing. */
        const ls = v.arms && v.arms.lSkin;
        const dl = v.arms && v.arms.digits && v.arms.digits.left;
        if (ls && dl && dl.at) {
          const lp = ls.position;
          const hx = dl.at[0] + lp.x, hy = dl.at[1] + lp.y, hz = dl.at[2] + lp.z;
          /* The NEAREST visible piece of the load, not the first one in
             the list. The revolver seats four rounds and leaves them in
             the cylinder, so "the first visible part" is an already-loaded
             round sitting in the gun and the hand is correctly nowhere
             near it -- a 205 mm reading about nothing. The question is
             whether the hand is on the round it is carrying. */
          let d = 1e9;
          for (const q2 of vis) {
            const b2 = q2.position;
            const dd = Math.hypot(hx - b2.x, hy - b2.y, hz - b2.z);
            if (dd < d) d = dd;
          }
          if (d < 0.13) inHand++;
          if (d > worstHand) worstHand = d;
        }
      }
      run(50);
      // And nothing left over once it is done.
      const left = v.prop ? v.prop.parts.filter((a) => a.visible !== false).length : 0;
      out.push({ id, kind: __T_WEAPONS[id].reloadKind, frames,
        carried: frames ? Math.round(100 * shown / frames) : 0,
        seen: shown ? Math.round(100 * onScreen / shown) : 0,
        held: shown ? Math.round(100 * inHand / shown) : 0,
        worst: +worstHand.toFixed(3), low: +lowest.toFixed(2), left });
      run(20);
    }
    return out;
  });
  let passed = 0, failed = 0;
  const check = (name, cond, detail) => {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
  };
  console.log('   weapon        kind      carried  on screen  in hand  worst gap  left over');
  for (const q of r) {
    console.log('   ' + q.id.padEnd(13) + (q.kind || '-').padEnd(9)
      + String(q.carried).padStart(6) + '%' + String(q.seen).padStart(9) + '%'
      + String(q.held).padStart(8) + '%' + String((q.worst*1000).toFixed(0)).padStart(9) + 'mm'
      + String(q.left).padStart(9));
  }
  console.log('');
  const offScreen = r.filter((q) => q.seen < 90);
  check('the load is on screen for the whole of every reload',
    r.length > 8 && offScreen.length === 0,
    offScreen.map((q) => q.id + ' ' + q.seen + '% (lowest ' + q.low + ')').join(', '));
  const loose = r.filter((q) => q.held < 85);
  check('the support hand is on the load it is carrying',
    loose.length === 0, loose.map((q) => q.id + ' ' + q.held + '%').join(', '));
  const never = r.filter((q) => q.carried < 20);
  check('every reload carries something visible',
    never.length === 0, never.map((q) => q.id + ' ' + q.carried + '%').join(', '));
  const litter = r.filter((q) => q.left > 0);
  check('nothing is left hanging in the air when a reload ends',
    litter.length === 0, litter.map((q) => q.id + ' ' + q.left + ' parts').join(', '));
  const real = errs.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no weapon threw during its reload', real.length === 0, real.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
