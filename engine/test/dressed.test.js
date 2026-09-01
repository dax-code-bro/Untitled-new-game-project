/* Is anything wearing the clothes it was given?
 *
 * The cloth is a separate skinned mesh over the same skeleton as the
 * flesh, and nothing has ever checked that it actually COVERS it. It did
 * not: the boots were flat pancakes lying in the ground plane (their
 * cross-section frame was in the same plane they were lofted along, so
 * they had no height at all), and once that was fixed they were still
 * 79 mm too short, and once THAT was fixed the foot's square corners
 * still came through the leather's rounder ones. Three rounds of padding
 * a number and squinting at a screenshot.
 *
 * So measure it. For every flesh vertex that belongs to a bone the
 * garment is supposed to cover, look along its own outward normal for a
 * cloth vertex standing further out. If there is none nearby, that patch
 * of skin is showing.
 *
 * This is an approximation -- vertex-to-vertex, not a ray against the
 * cloth surface -- so the threshold is loose enough that a stray vertex
 * does not fail it and tight enough that a bare toe cap does.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..') + '/';

/* Bones whose flesh is meant to be under something, and how far the
   garment over each is allowed to stand off it.
   
   A boot is ON the foot: cloth more than a couple of centimetres off it
   is not a boot. A skirt is not on the thigh at all -- it flares, and the
   first version of this flagged the female build's dress as six percent
   bare skin for the crime of being a dress. Loose clothing needs a loose
   window or the test measures tailoring rather than coverage.
   
   Hands and head are absent on purpose: a zombie has neither gloves nor
   a hood, and bare skin there is the intent. */
const COVERED = {
  footL: 0.055, footR: 0.055,
  upperLegL: 0.190, upperLegR: 0.190,
  chest: 0.150, spine: 0.170,
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 200, height: 140 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<body style="margin:0"><canvas id="c" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });

  const rows = await p.evaluate((covered) => {
    const g = LE.create({ canvas: '#c', quality: 'low' });
    const out = [];
    const BUILDS = ['male', 'female', 'heavy', 'armored'];
    const OUTFITS = [null, 'sheriff', 'street'];
    for (let i = 0; i < BUILDS.length; i++) {
      for (const outfit of OUTFITS) {
        const sk = LE.makeHumanoidSkeleton(1);
        const flesh = LE.buildZombieBodyGeometry(sk, { build: BUILDS[i], seed: 21 + i * 3, segments: 16 });
        const cloth = LE.buildZombieClothGeometry(sk, { build: BUILDS[i], seed: 21 + i * 3, segments: 16, outfit });
        LE.solveSkinWeights(flesh, sk);
        const P = flesh.positions, N = flesh.normals, J = flesh.joints, W = flesh.weights;
        const Q = cloth.positions;
        const idx = {};
        for (const n of Object.keys(covered)) { const bi = sk.index(n); if (bi >= 0) idx[bi] = covered[n]; }
        let checked = 0, bare = 0;
        let worstY = 0, worstAt = null;
        for (let v = 0; v < P.length / 3; v++) {
          let w = 0, reach = 0;
          for (let k = 0; k < 4; k++) {
            const r2 = idx[J[v * 4 + k]];
            if (r2 != null) { w += W[v * 4 + k]; if (r2 > reach) reach = r2; }
          }
          if (w < 0.7) continue;
          checked++;
          const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
          const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
          /* Is there cloth standing off this patch of skin, in the
             direction the skin faces? Within 45 mm sideways of the
             normal, and between 1 and 60 mm out along it. */
          let covered2 = false;
          for (let q = 0; q < Q.length; q += 3) {
            const dx = Q[q] - px, dy = Q[q + 1] - py, dz = Q[q + 2] - pz;
            const along = dx * nx + dy * ny + dz * nz;
            if (along < 0.001 || along > reach) continue;
            const off2 = dx * dx + dy * dy + dz * dz - along * along;
            if (off2 > (reach * 0.8) * (reach * 0.8)) continue;
            covered2 = true; break;
          }
          if (!covered2) { bare++; if (py < worstY) { worstY = py; worstAt = [+px.toFixed(3), +py.toFixed(3), +pz.toFixed(3)]; } }
        }
        out.push({ build: BUILDS[i], outfit: outfit || '(rag)', checked, bare,
          pct: checked ? +(bare / checked * 100).toFixed(1) : 0, worstAt });
      }
    }
    return out;
  }, COVERED);

  let passed = 0, failed = 0;
  const check = (name, cond, detail) => {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
  };

  console.log('   build      outfit      skin checked   showing   %');
  for (const r of rows) {
    console.log('   ' + r.build.padEnd(11) + r.outfit.padEnd(12)
      + String(r.checked).padStart(9) + String(r.bare).padStart(10)
      + String(r.pct).padStart(7)
      + (r.bare && r.worstAt ? '   lowest at ' + r.worstAt.join(', ') : ''));
  }
  console.log('');

  check('every build was actually measured', rows.length === 12 && rows.every((r) => r.checked > 40),
    rows.filter((r) => r.checked <= 40).map((r) => r.build + '/' + r.outfit).join(', '));
  /* A few percent is a seam or a corner and is what cloth does. A bare
     toe cap was 9% of the foot, and the flat-pancake boots were 100%. */
  const naked = rows.filter((r) => r.pct > 4);
  check('nothing is walking around in skin where it should be dressed',
    naked.length === 0,
    naked.map((r) => r.build + '/' + r.outfit + ': ' + r.pct + '% showing').join('; '));

  const real = errs.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('nothing threw', real.length === 0, real.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
