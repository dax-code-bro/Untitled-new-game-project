/* Where every thumb and every trigger finger actually ends up, against the
 * one line that settles it: the bore. A thumb above the bore is lying on
 * top of the slide. A trigger finger above the bore is not on a trigger. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..') + '/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 240, height: 150 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/games/bunker-nine.js', 'utf8') });
  const r = await p.evaluate(() => {
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 8; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1/60); }
    const P = B.P, out = [];
    for (const [id, v] of Object.entries(P.view)) {
      const w = __T_WEAPONS[id];
      if (!w || w.melee) continue;
      const root = v.kind === 'single' ? v.actor : v.root;
      const bore = (root && root.boreAt != null) ? root.boreAt : null;
      const a = v.arms;
      if (!a || !a.digits || !a.digits.right || bore == null) continue;
      const dg = a.digits.right;
      // The trigger finger is the last of the four.
      const ds = dg.digits || [];
      const trig = ds.length ? ds[ds.length - 1] : null;
      out.push({ id, bore: +bore.toFixed(3),
        thumbY: dg.thumbTip ? +(dg.thumbTip[1] - bore).toFixed(3) : null,
        trigY: trig ? +(trig.tip[1] - bore).toFixed(3) : null,
        trigX: trig ? +trig.tip[0].toFixed(3) : null,
        knuckX: trig ? +trig.knuckle[0].toFixed(3) : null,
        plane: dg.indexPlane || '-', errs: dg.indexErr || null });
    }
    return out;
  });
  let passed = 0, failed = 0;
  const check = (name, cond, detail) => {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
  };
  console.log('   weapon        thumb v bore  trigger v bore  tip-knuckle  plane  wrap/fwd err');
  for (const q of r) {
    const f = (v) => v == null ? '   -' : (v > 0 ? '+' : '') + (v * 1000).toFixed(0) + 'mm';
    const reach = (q.trigX != null && q.knuckX != null) ? (q.trigX - q.knuckX) : null;
    console.log('   ' + q.id.padEnd(13) + f(q.thumbY).padStart(12) + f(q.trigY).padStart(16)
      + (reach == null ? '   -' : ((reach > 0 ? '+' : '') + (reach * 1000).toFixed(0) + 'mm')).padStart(13)
      + ('  ' + q.plane).padStart(8) + ('  ' + (q.errs ? q.errs.join(' / ') : '-')).padStart(16));
  }
  console.log('');
  /* Above the bore is the top of the slide. A thumb there is a sausage
     lying in the sight line; a trigger finger there is not on a trigger. */
  const badT = r.filter((q) => q.thumbY != null && q.thumbY > 0.004);
  check('no thumb is lying on top of the weapon',
    r.length > 8 && badT.length === 0,
    badT.map((q) => q.id + ' +' + Math.round(q.thumbY * 1000) + 'mm').join(', '));
  const badF = r.filter((q) => q.trigY != null && q.trigY > 0.004);
  check('every trigger finger is below the bore',
    badF.length === 0, badF.map((q) => q.id + ' +' + Math.round(q.trigY * 1000) + 'mm').join(', '));
  /* And REACHING. A trigger finger scored against the nearest surface
     curls into the grip and makes a fist, which touches the gun perfectly
     and points at nothing -- eleven of thirteen finished behind their own
     knuckle before this was measured. */
  const curled = r.filter((q) => q.trigX != null && q.knuckX != null && (q.trigX - q.knuckX) < 0.012);
  check('every trigger finger reaches forward rather than curling into a fist',
    curled.length === 0,
    curled.map((q) => q.id + ' ' + Math.round((q.trigX - q.knuckX) * 1000) + 'mm').join(', '));
  const noPlane = r.filter((q) => q.plane === '-');
  check('every weapon has a finger on its trigger',
    noPlane.length === 0, noPlane.map((q) => q.id).join(', '));
  const real = errs.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('nothing threw', real.length === 0, real.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
