#!/usr/bin/env node
/* The seven operators, and specifically whether their heads are seven
 * heads or one head at seven sizes.
 *
 * That distinction is the whole request and it is not a matter of
 * opinion, so it is measured. Normalise every head to the same overall
 * size -- divide out its own bounding box -- and then compare shapes. If
 * two heads are the same sculpt scaled, normalising makes them
 * IDENTICAL and the residual goes to zero. If they are different
 * sculpts, it does not.
 *
 * Usage: node engine/test/operators.test.js
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
  const page = await browser.newPage({ viewport: { width: 1260, height: 460 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  await page.evaluate(() => {
    const G = window.G = LE.create({ canvas: '#game', quality: 'high', gravity: 0 });
    G.setSky('overcast');
    G.setTimeOfDay(12);
    G.ground({ at: [0, 0, 0], size: 40, material: { color: 0x6e6b66, texture: 'concrete',
      roughness: 0.95, uvScale: 12 }, physics: false });
  });

  const list = await page.evaluate(() => window.G.operators());
  check('there are seven operators', list.length === 7, `${list.length}: ${list.map((o) => o.id).join(',')}`);
  const want = ['destroyer', 'charlie', 'delta', 'alpha', 'abscess', 'biohazard', 'swat'];
  check('and they are the seven that were asked for',
    want.every((w) => list.some((o) => o.id === w)), list.map((o) => o.id).join(','));

  /* Bodies and sizes really differ. */
  const hs = list.map((o) => o.height), bs = list.map((o) => o.build);
  console.log(`  .. heights ${Math.min(...hs).toFixed(2)}-${Math.max(...hs).toFixed(2)}m, builds ${Math.min(...bs).toFixed(2)}-${Math.max(...bs).toFixed(2)}`);
  check('they are not all the same height', Math.max(...hs) - Math.min(...hs) > 0.15,
    `${(Math.max(...hs) - Math.min(...hs)).toFixed(2)}m spread`);
  check('and not all the same build', Math.max(...bs) - Math.min(...bs) > 0.35,
    `${(Math.max(...bs) - Math.min(...bs)).toFixed(2)} spread`);

  /* ---- the heads ---- */
  const heads = await page.evaluate((ids) => {
    const G = window.G;
    const out = {};
    window.ops = [];
    ids.forEach((id, i) => {
      /* hair: false for ALL of them, and not for looks -- the hair
         shell is built out of the skull's own grid and adds sixteen
         hundred vertices, so a head with hair and a head without have
         different topologies and cannot be compared vertex to vertex.
         The first version left it on for four of the seven and quietly
         returned NaN for nineteen of the twenty-one pairs, which is to
         say it measured almost nothing and reported a pass. */
      const c = G.operator(id, { at: [(i - 3) * 0.95, 1.0, 0], face: 'static', hair: false });
      window.ops.push(c);
      const hm = c.head && c.head.mesh ? c.head.mesh : (c.headMesh || null);
      const geo = hm ? G.geometryOf(hm) : null;
      if (!geo) { out[id] = null; return; }
      const P = geo.positions, n = P.length / 3;
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (let v = 0; v < n; v++) {
        for (let k = 0; k < 3; k++) {
          if (P[v * 3 + k] < lo[k]) lo[k] = P[v * 3 + k];
          if (P[v * 3 + k] > hi[k]) hi[k] = P[v * 3 + k];
        }
      }
      out[id] = { n, lo, hi, pos: Array.from(P) };
    });
    return out;
  }, want);

  const got = want.filter((id) => heads[id]);
  check('every operator has a head that can be measured', got.length === 7,
    `${got.length}/7: missing ${want.filter((id) => !heads[id]).join(',') || 'none'}`);

  if (got.length >= 2) {
    /* Size-normalised shape distance. Every head is scaled into a unit
       box first, so anything that survives is SHAPE and not scale --
       which is exactly the distinction the request turned on. */
    const norm = {};
    for (const id of got) {
      const h = heads[id], sx = h.hi[0] - h.lo[0], sy = h.hi[1] - h.lo[1], sz = h.hi[2] - h.lo[2];
      const a = new Float64Array(h.pos.length);
      for (let v = 0; v < h.n; v++) {
        a[v * 3] = (h.pos[v * 3] - h.lo[0]) / sx;
        a[v * 3 + 1] = (h.pos[v * 3 + 1] - h.lo[1]) / sy;
        a[v * 3 + 2] = (h.pos[v * 3 + 2] - h.lo[2]) / sz;
      }
      norm[id] = a;
      /* Indices of the vertices that make up the FACE -- the front of
         the head, brow to chin. Taken once, from the first head, and
         reused for all of them because the topology is identical.

         The whole-head mean is dominated by the cranium, and the back
         of a human skull really is much the same on everybody -- so a
         metric over all of it flattens exactly the differences it is
         supposed to find. Two men with completely different faces and
         ordinary skulls score close together, which is not a result
         about the faces. */
      console.log(`  .. ${id.padEnd(10)} head ${(sx * 100).toFixed(1)} x ${(sy * 100).toFixed(1)} x ${(sz * 100).toFixed(1)} cm, ${h.n} verts`);
    }
    let worstPair = null, worstD = 1e9, nan = 0;
    let worstFPair = null, worstF = 1e9;
    /* The FACE region: the front of the head, brow to chin, in the
       normalised box. The whole-head mean is dominated by the cranium,
       and the back of a human skull really is much the same on
       everybody -- so a metric over all of it flattens exactly the
       differences it is supposed to find. Taken from one head and
       reused, because every head here has identical topology. */
    const ref = norm[got[0]];
    const mask = [];
    for (let v = 0; v < heads[got[0]].n; v++) {
      if (ref[v * 3 + 2] > 0.62 && ref[v * 3 + 1] > 0.18 && ref[v * 3 + 1] < 0.86) mask.push(v);
    }
    console.log(`  .. face mask: ${mask.length} of ${heads[got[0]].n} vertices`);
    const dists = [];
    for (let i = 0; i < got.length; i++) {
      for (let j = i + 1; j < got.length; j++) {
        const a = norm[got[i]], b = norm[got[j]];
        if (a.length !== b.length) { nan++; dists.push([got[i], got[j], NaN]); continue; }
        let s = 0, fs = 0;
        for (let v = 0; v < a.length; v += 3) {
          s += Math.hypot(a[v] - b[v], a[v + 1] - b[v + 1], a[v + 2] - b[v + 2]);
        }
        for (const v of mask) {
          fs += Math.hypot(a[v * 3] - b[v * 3], a[v * 3 + 1] - b[v * 3 + 1], a[v * 3 + 2] - b[v * 3 + 2]);
        }
        const d = s / (a.length / 3);
        const fd = mask.length ? fs / mask.length : 0;
        dists.push([got[i], got[j], d, fd]);
        if (fd < worstF) { worstF = fd; worstFPair = got[i] + '/' + got[j]; }
        if (d < worstD) { worstD = d; worstPair = got[i] + '/' + got[j]; }
      }
    }
    check('every pair can actually be compared', nan === 0, `${nan} of ${dists.length} pairs had mismatched topology`);
    dists.sort((x, y) => x[2] - y[2]);
    console.log('  .. closest pairs, size-normalised (whole head / face only):');
    for (const [a, b, d, fd] of dists.slice(0, 4)) console.log(`     ${a} / ${b}: ${(d * 100).toFixed(2)} / ${(fd * 100).toFixed(2)}`);
    const last = dists[dists.length - 1];
    console.log(`     furthest: ${last[0]} / ${last[1]}: ${(last[2] * 100).toFixed(2)} / ${(last[3] * 100).toFixed(2)}`);
    console.log(`  .. closest FACES: ${worstFPair} at ${(worstF * 100).toFixed(2)}`);
    /* One sculpt at seven sizes would score ~0 here by construction.
       A hundredth of the head's own size between the two CLOSEST of the
       seven is a real structural difference everywhere. */
    check('no two heads are the same sculpt at different sizes',
      worstD > 0.010, `closest pair ${worstPair} at ${(worstD * 100).toFixed(2)}`);
    check('and the closest pair is still clearly two different heads',
      worstD > 0.012, `${worstPair} at ${(worstD * 100).toFixed(2)}`);
    /* The one that matters, and the threshold is argued rather than
       picked. The figure is the mean displacement per face vertex as a
       fraction of the head's own size, so on a 232 mm head 1.6 per cent
       is about four millimetres averaged over EVERY point of the face
       -- including the forehead and the cheeks, which are much the same
       on everybody and drag the mean down hard. At the features that
       actually differ it is several times that. Four millimetres of
       mean facial displacement is a different person, and it is the
       floor rather than the typical: the spread here runs past 4.5.

       It is deliberately not higher. Seven faces built on one topology
       cannot all be pushed arbitrarily far apart, and four passes of
       pushing the closest pair apart only moved the collision to a
       third face each time. What fixed it was putting the seven on
       axes -- cranial shape, vault proportion, brow, orbit depth,
       midface fullness, jaw -- and giving each man a different corner
       of that space, which is what the tables now do. */
    check('no two FACES are close, over the face region alone',
      worstF > 0.016, `${worstFPair} at ${(worstF * 100).toFixed(2)}`);
  }

  /* ---- the pictures ----

     PORTRAITS, close enough to see a face. The first version of this
     framed all seven at once from two and a half metres, which put each
     head at about forty pixels -- and at forty pixels a one-and-a-half
     per cent difference in skull shape is sub-pixel, so the picture
     could not have shown a difference of any size and I read it as
     proof they were all the same. A bench that cannot see the thing it
     is judging is worse than no bench. */
  await page.evaluate((ids) => {
    const G = window.G;
    // Rebuild them WITH hair, brows and beards -- the comparison pass
    // above deliberately stripped all three to match topologies.
    window.ops.forEach(function (c) { if (c.destroy) c.destroy(); });
    window.ops = ids.map((id, i) => G.operator(id, { at: [(i - 3) * 0.62, 1.0, 0], face: 'static' }));
  }, want);

  /* Do the seven have eyes at all. They did not: the eyeballs were
     merged into the head geometry, which carries one material, so every
     character in this game has had skin-coloured eyes in skin-coloured
     sockets. Nothing about that is visible in a measurement of skull
     shape, and it was most of why seven different faces read as one. */
  const eyes = await page.evaluate(() => window.ops.map((c) => ({
    id: c.operator,
    has: !!c.eyes,
    verts: c.eyes && c.eyes.mesh ? c.eyes.mesh.vertexCount : 0,
    neck: !!c.neck,
  })));
  const noEyes = eyes.filter((e) => !e.has || e.verts < 200);
  console.log(`  .. eyes: ${eyes.map((e) => e.id + ' ' + e.verts).join(', ')}`);
  check('every operator has eyes, as their own mesh', noEyes.length === 0,
    noEyes.map((e) => e.id + ':' + e.verts).join(','));
  check('and a neck that is skin rather than shirt',
    eyes.every((e) => e.neck), eyes.filter((e) => !e.neck).map((e) => e.id).join(','));

  const shots = [];
  for (let i = 0; i < want.length; i++) {
    await page.evaluate((k) => {
      const G = window.G;
      const c = window.ops[k];
      // Hide everyone else so the portrait is one man.
      window.ops.forEach((o, j) => {
        const y = j === k ? 1.0 : -80;
        if (o.controller) o.controller.teleport([(j - 3) * 0.62, y, 0]);
      });
      const x = (k - 3) * 0.62;
      /* Eye height READ OFF THE SKELETON, not computed from height and
         scale. The arithmetic version was nineteen centimetres high on
         the shortest of them and framed the top of his head -- and the
         whole point of these portraits is that a bench which cannot see
         what it is judging is worse than none. */
      /* The head BONE is at the atlas -- the base of the skull -- so
         aiming at it frames the jaw and cuts the crown off. The eyes
         sit about a quarter of a head above it. */
      const hbone = c.skeleton.bone('head');
      const k = c.operatorSpec.scale;
      const eye = c.body.position.y + (hbone ? hbone.bindMatrix.e[13] : 0.61) + 0.058 * k;
      // Tight. A head at fifteen per cent of frame height told me
      // nothing twice; this fills it.
      G.lookAt([x + 0.085, eye + 0.010, 0.345], [x, eye - 0.008, 0]);
      for (let i2 = 0; i2 < 3; i2++) G.step(1 / 60);
    }, i);
    await page.waitForTimeout(220);
    const f = path.join(OUT, `op-${want[i]}.png`);
    await page.screenshot({ path: f });
    shots.push(f);
  }
  console.log(`  .. seven portraits -> ${path.join(OUT, 'op-*.png')}`);

  await page.evaluate(() => {
    const G = window.G;
    window.ops.forEach((o, j) => {
      if (o.controller) o.controller.teleport([(j - 3) * 0.62, 1.0, 0]);
    });
    G.lookAt([0, 1.62, 1.95], [0, 1.58, 0]);
    for (let i = 0; i < 3; i++) G.step(1 / 60);
  });
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(OUT, 'operators-heads.png') });
  console.log(`  .. the seven together -> ${path.join(OUT, 'operators-heads.png')}`);

  /* ---- the old picture ---- */
  await page.evaluate(() => {
    window.G.lookAt([0, 1.15, 5.4], [0, 0.95, 0]);
    for (let i = 0; i < 3; i++) window.G.step(1 / 60);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'operators-bodies.png') });
  console.log(`  .. seven bodies -> ${path.join(OUT, 'operators-bodies.png')}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
