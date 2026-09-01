/* The sight picture on every gun, as a number.
 *
 * "Check every gun's ADS picture one at a time" -- and the honest version
 * of that is not thirteen screenshots I squint at, it is: with the weapon
 * fully aimed, where does its own front sight land relative to the middle
 * of the screen? Every model reports its sight height, and aiming is
 * supposed to put that line exactly on the camera axis. If it does, the
 * blade is dead centre; if it does not, the number says by how much and
 * in which direction. */
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
    __T.buildPool(1); __T.god(true); __T.killAll();
    __T.teleport(-2.4, 1.1, 1.4); __T.look(Math.PI * 0.98, 0.02); run(12);
    const P = B.P, out = [];
    const ndc = (wx, wy, wz) => {
      const m = B.game.camera.viewProj.e;
      const w = m[3]*wx + m[7]*wy + m[11]*wz + m[15];
      if (w <= 1e-5) return null;
      return [(m[0]*wx + m[4]*wy + m[8]*wz + m[12]) / w,
              (m[1]*wx + m[5]*wy + m[9]*wz + m[13]) / w];
    };
    for (const id of Object.keys(__T_WEAPONS)) {
      const w = __T_WEAPONS[id];
      /* `tool` as well as `melee`. The claw hammer is a barricade tool --
         no damage, no real refire -- and it is marked `tool: true` and not
         `melee`, so filtering on melee alone let it into a sweep of sight
         pictures and it reported "no sightAt" every run. */
      if (w.melee || w.tool || !P.view[id]) continue;
      __T.release(); P.give(id); run(20);
      /* Until the aim is actually FINISHED, not for a fixed number of
         frames. ADS eases in asymptotically, so a scoped rifle with a
         0.46 s pull was still at 0.93 after seventy frames -- and a gun
         7% of the way from the hip is supposed to have its sights off
         centre. Measuring that as a fault would have had me "fixing" two
         rifles that were correct. */
      __T.hold({ aim: true });
      for (let k = 0; k < 400 && P.ads < 0.999; k++) run(1);
      const v = P.view[id];
      const root = v.kind === 'single' ? v.actor : v.root;
      const sh = root && root.sightAt != null ? root.sightAt : null;
      const mz = root && root.muzzleAt != null ? root.muzzleAt : (v.muzzle || 0.3);
      if (sh == null) { out.push({ id, err: 'no sightAt' }); continue; }
      // The front sight, in the weapon's own space, through its matrix.
      const e = root.matrix.e;
      const lx = mz - 0.02, ly = sh, lz = 0;
      const wx = e[0]*lx + e[4]*ly + e[8]*lz + e[12];
      const wy = e[1]*lx + e[5]*ly + e[9]*lz + e[13];
      const wz = e[2]*lx + e[6]*ly + e[10]*lz + e[14];
      const q = ndc(wx, wy, wz);
      out.push({ id, ads: +P.ads.toFixed(2), scoped: !!w.scoped,
        x: q ? +q[0].toFixed(3) : null, y: q ? +q[1].toFixed(3) : null });
      __T.release(); run(30);
    }
    return out;
  });
  let passed = 0, failed = 0;
  const check = (name, cond, detail) => {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
  };
  console.log('   weapon        ads   blade x    blade y   (0,0) is dead centre');
  for (const q of r) {
    if (q.err) { console.log('   ' + q.id.padEnd(13) + ' ' + q.err); continue; }
    console.log('   ' + q.id.padEnd(13) + String(q.ads).padStart(5)
      + String(q.x).padStart(10) + String(q.y).padStart(11) + (q.scoped ? '   (scoped)' : ''));
  }
  console.log('');
  const noSight = r.filter((q) => q.err);
  check('every weapon reports where its own sight line runs',
    r.length > 8 && noSight.length === 0,
    noSight.map((q) => q.id + ': ' + q.err).join(', '));
  /* Aiming is geometry, not taste. Every model carries a measured sight
     height and the aim is supposed to put that line exactly on the camera
     axis -- so the front blade lands dead centre or the number says by how
     much it misses. Two thousandths of a frame width is a pixel or two. */
  const off = r.filter((q) => !q.err && (Math.abs(q.x) > 0.008 || Math.abs(q.y) > 0.008));
  check('every gun\'s front sight lands dead centre when aimed',
    off.length === 0,
    off.map((q) => q.id + ' (' + q.x + ', ' + q.y + ') at ads ' + q.ads).join(', '));
  /* And it has to GET there. ADS eases in asymptotically, so a rifle with
     a long pull is still short of the sights after a fixed number of
     frames -- and a gun 7% of the way up from the hip is supposed to have
     its sights off centre. Measuring that as a fault nearly had me
     "fixing" two rifles that were correct. */
  const slow = r.filter((q) => !q.err && q.ads < 0.99);
  check('every gun finishes its aim rather than stalling short of it',
    slow.length === 0, slow.map((q) => q.id + ' ads ' + q.ads).join(', '));
  const real = errs.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('nothing threw', real.length === 0, real.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
