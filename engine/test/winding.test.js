#!/usr/bin/env node
/* IS ANY PART OF ANY GUN INSIDE OUT?
 *
 * Reported from the photographs, and faintly: "with every gun, the
 * stock and some parts are like see-through or you can see the
 * inside". They were, and the cause is structural rather than
 * per-model.
 *
 * A swept solid's surface normal is cross(tangent, travel), where
 * travel is the direction the path advances. Sweep forwards and that
 * points out of the solid; sweep BACKWARDS and it points in, and the
 * triangle winding -- which follows the station index rather than the
 * geometry -- reverses with it. Back-face culling then discards the
 * side facing you and draws the inside of the far wall.
 *
 * A buttstock is built from the receiver rearwards: first station at
 * the receiver, last a quarter-metre behind it. EVERY stock in the
 * game runs backwards, along with anything else authored
 * muzzle-to-breech -- which is why the report said "and some parts"
 * without being able to name them.
 *
 * WHY SIGNED VOLUME. Looking at renders cannot settle this: the fault
 * is subtle from most angles, there are sixty weapons, and a part that
 * happens to be hidden behind another looks fine. The divergence
 * theorem does settle it. Sum (a . (b x c)) / 6 over the triangles of
 * a closed mesh and you get its volume, POSITIVE when the winding
 * faces out and negative when it faces in. It needs no camera and no
 * judgement.
 *
 * Caveat, stated rather than hidden: these channels are unions of
 * several solids and are not strictly closed -- an open tube
 * contributes roughly nothing rather than exactly nothing. So the test
 * asks for a clearly negative total, not for any negative at all, and
 * it prints the numbers so a marginal one can be looked at.
 *
 * Usage: node engine/test/winding.test.js
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

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const G = LE.create({ canvas: '#game', quality: 'low', gravity: 0 });
    const kinds = G.serviceArmKinds();
    const out = { n: 0, bad: [], nan: [], worst: [], built: 0, err: null };
    /* THE CPU GEOMETRY, REACHED THROUGH THE MESH'S KEY. The first run
       of this asked the actor's mesh for `positions` and got
       undefined: a GpuMesh keeps buffers, not arrays, because the
       whole point of uploading is to stop holding the data twice. The
       engine does keep the source geometry, in `_geoByKey`, against
       the same key the mesh carries.

       It measured zero meshes and the "nothing is inside out" check
       passed anyway -- on nothing. That is why the count is asserted
       separately: a test that silently measures an empty set reports
       success and means nothing. */
    const volOf = (mesh) => {
      const geo = mesh && mesh.__key && G._geoByKey ? G._geoByKey.get(mesh.__key) : null;
      const P = geo && geo.positions, I = geo && geo.indices;
      if (!P || !I) return null;
      let v = 0;
      for (let i = 0; i < I.length; i += 3) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
        const ax = P[a], ay = P[a + 1], az = P[a + 2];
        const bx = P[b], by = P[b + 1], bz = P[b + 2];
        const cx = P[c], cy = P[c + 1], cz = P[c + 2];
        v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
      }
      return v / 6;
    };
    for (const kind of kinds) {
      let arm = null;
      try { arm = G.serviceArm(kind, { at: [0, -90, 0], physics: false }); } catch (e) { continue; }
      if (!arm) continue;
      out.built++;
      const parts = [['(root)', arm]];
      for (const nm of arm.partNames || []) if (arm[nm]) parts.push([nm, arm[nm]]);
      for (const [nm, a] of parts) {
        const m = a.mesh;
        if (!m) continue;
        const v = volOf(m);
        if (v == null) continue;
        out.n++;
        /* A litre is a big part on a rifle; the threshold is far below
           anything real and far above the noise of an open tube. */
        if (v < -2e-6) out.bad.push({ kind, part: nm, vol: +v.toFixed(8) });
        /* AND A MESH WHOSE VOLUME IS NOT A NUMBER AT ALL. The first
           run of this reported a null among the most-negative
           volumes, which is what JSON does with NaN -- and a NaN
           volume means NaN vertex positions, which means geometry the
           GPU discards entirely. That is the other half of the report
           that brought me here: "transparent or MISSING". A part that
           is quietly absent looks like a modelling choice until
           something counts it. */
        if (!Number.isFinite(v)) {
          let bad = 0, lo = -1, hi = -1;
          const P2 = (G._geoByKey.get(a.mesh.__key) || {}).positions || [];
          for (let q = 0; q < P2.length; q++) {
            if (!Number.isFinite(P2[q])) {
              bad++;
              const vi = Math.floor(q / 3);
              if (lo < 0) lo = vi;
              hi = vi;
            }
          }
          /* WHERE in the buffer, not just how many. Parts are appended
             in build order -- barrel, receiver, sights, details -- so
             the vertex range says which builder made them without
             having to bisect the file. */
          out.nan.push({ kind, part: nm, badCoords: bad, of: P2.length,
            firstVert: lo, lastVert: hi, totalVerts: P2.length / 3 });
        }
        out.worst.push(v);
      }
      for (const [, a] of parts) { try { a.destroy(); } catch (e) { void e; } }
    }
    out.worst.sort((x, y) => x - y);
    out.worst = out.worst.slice(0, 3).map((v) => +v.toFixed(8));
    return out;
  });

  note(JSON.stringify({ built: r.built, meshes: r.n, inverted: r.bad.length,
    mostNegative: r.worst }));
  if (r.bad.length) note('inside out: ' + r.bad.slice(0, 12)
    .map((b) => b.kind + '.' + b.part + ' ' + b.vol).join(', '));

  check('the whole rack builds', r.built > 20, `${r.built} weapons`);
  check('and every one of them has meshes to measure', r.n > 100, `${r.n} meshes`);
  /* THE CLAIM. Not one part of one gun is wound inside out. */
  check('no part of any weapon is inside out',
    r.bad.length === 0, `${r.bad.length} of ${r.n} meshes have negative volume`);

  if (r.nan && r.nan.length) note('not-a-number: ' + JSON.stringify(r.nan.slice(0, 6)));
  /* Geometry with a NaN coordinate in it is not drawn at all, so this
     is the check for parts that are simply absent. */
  check('no weapon has a part with a non-finite coordinate in it',
    !r.nan || r.nan.length === 0,
    r.nan ? r.nan.slice(0, 4).map((x) => x.kind + '.' + x.part
      + ' (' + x.badCoords + '/' + x.of + ')').join(', ') : '');

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
