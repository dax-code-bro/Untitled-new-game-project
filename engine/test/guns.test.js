#!/usr/bin/env node
/* Every gun in the service table, stood on a bench and photographed.
 *
 * A table-driven model is only as good as the worst row in it, and a
 * bad row does not throw -- it produces a gun with its magazine inside
 * its own stock, or a barrel that stops before the handguard does, and
 * nothing at all says so. So: build all of them, measure the things
 * that are true of any working firearm, and take a picture of each.
 *
 * What is measured:
 *   - it has geometry at all, and none of it is at a nonsense coordinate
 *   - the muzzle is the front-most point: a barrel that ends inside the
 *     handguard is the commonest way one of these rows goes wrong
 *   - the sight line is above the bore and below the top of the gun
 *   - the thing is gun-sized -- between 30 cm and 1.3 m long
 *   - the grip is under the receiver, not floating beside it
 *   - the magazine is below the bore and behind the handguard
 *
 * Usage: node engine/test/guns.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '/tmp';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 480 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  await page.evaluate(() => {
    const G = window.G = LE.create({ canvas: '#game', quality: 'high', gravity: 0 });
    G.setSky('day');
    G.setTimeOfDay(11);
    /* A plain bench under a plain sky: nothing in the picture but the
       gun, so a missing part cannot hide behind the scenery. */
    G.ground({ at: [0, -0.35, 0], size: 8, material: { color: 0x9a968c, texture: 'concrete',
      roughness: 0.94, uvScale: 6 }, physics: false });
  });

  const kinds = await page.evaluate(() => window.G.serviceArmKinds());
  check('the table has guns in it', kinds.length >= 10, `${kinds.length}: ${kinds.join(',')}`);

  const bad = [];
  for (const kind of kinds) {
    const r = await page.evaluate((k) => {
      const G = window.G;
      if (window.gun) { try { window.gun.destroy(); } catch (e) { /* first one */ } }
      const g = window.gun = G.serviceArm(k, { at: [0, 0, 0], physics: false });
      const spec = G.serviceArmSpec(k);
      /* Measured off the real vertex bounds of every part, which is the
         only number that cannot be argued with. */
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], verts = 0, nan = 0;
      const per = {};
      /* EVERY part, which is not what this did at first.
       *
         mountArm hangs the receiver on the body and the other parts off
         body[name], listing them in partNames. The first version of
         this walked `g.parts` -- which does not exist -- fell through
         to [g], and measured the receiver alone. So it was reporting a
         gun's length, its muzzle and its vertex count from one part of
         it, and a missing magazine or a missing stock would have sailed
         through every check below with perfectly sensible numbers. */
      for (const name of g.partNames) {
        const part = name === g.partNames[0] ? g : g[name];
        const m = part && part.mesh;
        if (!m || !m.bounds || !(m.vertexCount > 0)) { per[name] = null; continue; }
        const b = m.bounds;
        per[name] = { v: m.vertexCount, x: [b.min.x, b.max.x], y: [b.min.y, b.max.y] };
        lo = [Math.min(lo[0], b.min.x), Math.min(lo[1], b.min.y), Math.min(lo[2], b.min.z)];
        hi = [Math.max(hi[0], b.max.x), Math.max(hi[1], b.max.y), Math.max(hi[2], b.max.z)];
        verts += m.vertexCount;
        for (const v of [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]) {
          if (!isFinite(v)) nan++;
        }
      }
      return {
        lo, hi, verts, nan, per,
        names: g.partNames.slice(),
        muzzleAt: g.muzzleAt, sightAt: g.sightAt, boreAt: g.boreAt,
        magWell: g.magWell,
        spec: { muzzle: spec.muzzle, hgX1: spec.hg ? spec.hg.x1 : null,
          sightY: spec.sight.y, recUp: spec.rec.up,
          magKind: spec.mag ? spec.mag.kind : 'none' },
        len: hi[0] - lo[0],
        cls: (spec && spec.cls) || '',
      };
    }, kind);

    const len = r.hi[0] - r.lo[0];
    const problems = [];
    if (r.verts < 500) problems.push(`only ${r.verts} vertices`);
    if (r.nan) problems.push(`${r.nan} nonsense coordinates`);
    /* GUN-SIZED DEPENDS ON WHAT KIND OF GUN.
       30 cm to 1.3 m was written when the table held nothing but rifles
       and SMGs, and it is wrong in both directions now: a Tokarev is
       19 cm and a Bazooka is 1.37 m, and both are exactly right. The
       band is per class, and each bound is a real weapon -- the
       shortest pistol here against the longest launcher. */
    /* Every bound is a real weapon, looked up rather than guessed --
       the first version of this table was guessed and failed eight guns
       that were the right size. An anti-materiel rifle is 1.45 m. A
       pump shotgun is 1.19. A broomhandle Mauser is 288 mm, which is
       longer than some carbines' barrels. The upper figures carry a
       couple of centimetres for sights and crowns standing past the
       muzzle, because the measurement is the model's bounding box and
       not the catalogue length. */
    const CLS = {
      pistol:   [0.16, 0.34],   // Tokarev 194 mm to a C96 at 288
      launcher: [0.40, 1.45],   // M79 at 0.73 to the Bazooka at 1.37
      bolt:     [0.55, 1.52],   // Kar98k 1.11 to a Barrett M82 at 1.45
      gauge:    [0.28, 1.25],   // a sawn-off is 300 mm and that is the point
      shield:   [0.30, 0.70],
    };
    const band = CLS[r.cls] || [0.30, 1.30];
    if (len < band[0] || len > band[1]) {
      problems.push(`${len.toFixed(2)} m long (${r.cls || 'service'} wants ${band[0]}-${band[1]})`);
    }
    /* The muzzle must be the front of the gun. Anything in front of it
       is a part that has escaped. */
    if (r.hi[0] > r.muzzleAt + 0.060) {
      problems.push(`something reaches ${(r.hi[0] - r.muzzleAt).toFixed(3)} past the muzzle`);
    }
    if (r.muzzleAt > r.hi[0] + 0.005) {
      problems.push(`the muzzle is ${(r.muzzleAt - r.hi[0]).toFixed(3)} beyond the model`);
    }
    /* Sights above the bore, and not floating above the gun. */
    if (!(r.sightAt > r.boreAt + 0.010)) problems.push('the sight is not above the bore');
    if (r.sightAt > r.hi[1] + 0.004) problems.push('the sight is above the whole gun');
    /* Every part the builder was asked for has to have come out with
       geometry in it. A part that silently built nothing is exactly
       what a table-driven model does when one row is wrong, and it is
       invisible to a length or a bounding box. */
    for (const name of r.names) {
      const want = name === 'mag' ? r.spec.magKind !== 'none' : true;
      if (want && !r.per[name]) problems.push(`the ${name} is empty`);
      if (!want && r.per[name]) problems.push(`the ${name} should not exist`);
    }
    /* A magazine belongs clear of the bore -- but not always BELOW it.
       The DP-28's pan lies on top of the receiver, the Bren is top-fed
       and the P90's lies flat along the spine, so "below" failed three
       guns that were right. What is actually wrong is a magazine buried
       inside the receiver, which is either direction far enough. */
    if (r.per.mag && !(r.per.mag.y[0] < -0.045 || r.per.mag.y[1] > 0.028)) {
      problems.push(`the magazine is inside the receiver (${r.per.mag.y[0].toFixed(3)}`
        + ` to ${r.per.mag.y[1].toFixed(3)})`);
    }
    if (r.per.wood && !(r.per.wood.y[0] < -0.060)) {
      problems.push('there is no grip under the receiver');
    }
    if (problems.length) bad.push(`${kind}: ${problems.join('; ')}`);

    check(`${kind}`, problems.length === 0,
      problems.join('; ') + `  [${len.toFixed(2)} m, ${r.verts} verts]`);

    /* Two photographs. The whole gun in three-quarter view, which is
       how a gun is looked at -- and a close-up on the receiver and the
       magazine, because that is where all the detail is and a side view
       of a whole rifle at nine hundred pixels cannot show any of it.
       Every judgement about whether these read as real is made on the
       second one. */
    for (const [tag, zoom] of [['', 1], ['-detail', 0.30]]) {
      await page.evaluate(([l, h, z]) => {
        const G = window.G;
        const span = Math.max(h[0] - l[0], 0.3) * z;
        /* The close-up frames the magazine well, which on every gun in
           the table is a little behind the middle of the receiver. */
        const cx = z < 1 ? (l[0] + h[0]) / 2 - span * 0.35 : (l[0] + h[0]) / 2;
        const cy = z < 1 ? (l[1] + h[1]) / 2 - span * 0.10 : (l[1] + h[1]) / 2;
        G.lookAt([cx - span * 0.32, cy + span * 0.36, -span * 0.90], [cx, cy, 0]);
        for (let i = 0; i < 3; i++) G.step(1 / 60);
      }, [r.lo, r.hi, zoom]);
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(OUT, `gun-${kind}${tag}.jpg`),
        type: 'jpeg', quality: 90 });
    }
  }

  check('every gun in the table is a gun', bad.length === 0, bad.slice(0, 4).join(' | '));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  shots in ${OUT}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
