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
      /* Do the fingers overlap each other?
       *
       * Every grip carries its own knuckle spacing and the fingers carry
       * their own radius, and the two were separate numbers. When the
       * hands were scaled up to match the arms, four 21.2 mm fingers ended
       * up on a 19.4 mm pitch -- 1.8 mm inside each other, which welds
       * them into one continuous slab. A grip close up was a paddle with
       * grooves in it. Adjacent knuckles must be at least a finger apart. */
      let tight = 0, worstGap = 9;
      const wrap = ds.filter((d2, i2) => i2 < ds.length - (trig ? 1 : 0));
      for (let i2 = 1; i2 < wrap.length; i2++) {
        const a2 = wrap[i2 - 1].knuckle, b2 = wrap[i2].knuckle;
        const gap = Math.hypot(a2[0]-b2[0], a2[1]-b2[1], a2[2]-b2[2]) - (wrap[i2].r * 2);
        if (gap < worstGap) worstGap = gap;
        /* Touching is correct -- adjacent fingers on a grip are pressed
           together, and the knuckle row is CURVED round the object as
           well, which shortens the chord between neighbours by a few
           millimetres more. What is wrong is MERGING: two cylinders far
           enough inside each other that the surfaces weld and the pair
           reads as one slab. A quarter of a finger is the line. */
        if (gap < -wrap[i2].r * 0.5) tight++;
      }
      out.push({ id, bore: +bore.toFixed(3),
        tight, gap: worstGap > 8 ? null : +worstGap.toFixed(4),
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
  const merged = r.filter((q) => q.tight > 0);
  check('the fingers of a hand do not overlap into one slab',
    merged.length === 0,
    merged.map((q) => q.id + ' ' + q.tight + ' pairs, worst ' + Math.round(q.gap * 1000) + 'mm').join(', '));
  const noPlane = r.filter((q) => q.plane === '-');
  check('every weapon has a finger on its trigger',
    noPlane.length === 0, noPlane.map((q) => q.id).join(', '));
  const real = errs.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('nothing threw', real.length === 0, real.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
