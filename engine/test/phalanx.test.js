#!/usr/bin/env node
/* IS A FINGER THREE BONES, OR ONE HOOK ON A HINGE?
 *
 * Reported: the fingers are "wiggly and wobbly, and it doesn't feel like
 * the hand is actually doing anything". A finger was one mesh swinging
 * rigidly about its base knuckle. The comment in the game that drove it
 * admits the consequence in its own words -- "a rigid turn about the base
 * knuckle cannot UNCURL a finger; it swings the whole hook open" -- so
 * every hand motion in the game was a hook waving.
 *
 * WHAT THIS MEASURES. Open the hand and watch three points on one
 * finger: the base knuckle, the middle joint and the tip.
 *
 *   - under ONE hinge every point on the finger moves on the same
 *     circle about the knuckle, so the ratio of tip travel to middle
 *     travel is fixed by their radii and nothing else.
 *   - under THREE joints the outer bones carry their own bends on top
 *     of the ones before them, so the tip outruns that ratio.
 *
 * The test is that ratio. It needs no assumption about how much a hand
 * opens or which direction anything faces, and a rigid hook cannot fake
 * it at any magnitude.
 *
 * AND IT MUST STILL LOOK LIKE ONE FINGER. This is the check that caught
 * the split out, and it was added after a screenshot showed what no
 * measurement had: the fingers had become a string of sausages.
 *
 * The verification that cleared the split compared vertex POSITIONS
 * before and after and found the bounding box identical to the micron.
 * That was measuring the right thing about the wrong property. Normals
 * are smoothed and welded per geometry, so cutting a finger at its
 * joints left the shared ring with one set of normals in the bone behind
 * it and a different set in the bone in front: the surface continuous,
 * the shading broken. A SEAM VERTEX is one that shares a position with
 * another and disagrees about which way the surface faces, and there
 * were 0 of them on a finger built as one loft and 104 on the same
 * finger built as three.
 *
 * So the count is checked here, every run. A surface is positions AND
 * normals and only one of them had been looked at.
 *
 * Usage: node engine/test/phalanx.test.js
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
  const page = await browser.newPage({ viewport: { width: 240, height: 150 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });

  const rows = await page.evaluate(async () => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 8; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1 / 60); }
    const P = B.P, M4 = LegendEngine.Mat4, V3 = LegendEngine.Vec3, out = [];
    const run = (n) => { for (let i = 0; i < n; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1 / 60); } };

    /* IN THE WEAPON'S FRAME, not the world's. The first version of this
       composed all the way out through the weapon root and stepped a
       frame between its two samples -- so it read the gun's own bob and
       sway as finger movement and reported the base knuckle travelling
       48 mm. The chain stops at the weapon: everything below it is the
       hand, and the hand is what is being measured. */
    const inWeapon = (act, stop, p3) => {
      const chain = [];
      for (let x = act; x && x !== stop; x = x.parent) chain.unshift(x);
      const m = new M4(), t = new M4();
      m.identity();
      for (const x of chain) { t.compose(x._position, x._rotation, x.scale); m.mulMatrices(m, t); }
      return new V3(p3[0], p3[1], p3[2]).applyMat4(m);
    };
    const dist = (u, v) => Math.hypot(u.x - v.x, u.y - v.y, u.z - v.z);

    /* THE EQUIPPED WEAPON ONLY, and each one equipped in turn. The pose
       runs on the weapon in your hands and on nothing else, so reading
       every entry in P.view at once gets one real answer and seventeen
       untouched hands reading zero -- which the first version of this
       duly reported as seventeen failures. */
    for (const id of ['thompson', 'mp5', 'sawnoff', 'mauser', 'm1911']) {
      if (!B.P.view[id]) continue;
      P.give(id);
      run(12);
      const v = P.view[id], a2 = v.arms;
      if (!a2 || !a2.lBones) continue;
      const rec = a2.digits && a2.digits.left;
      const ds = rec && rec.digits;
      const bs = a2.lBones[0], d = ds && ds[0];
      if (!bs || !bs[1] || !bs[2] || !d || !d.pivots3 || !d.tip) continue;
      /* IN THE PALM'S FRAME. Opening a hand during a reload also slides
         the whole support arm to the magazine well, and measured in the
         weapon's frame that travel swamps everything: all three points
         moved together, 320 mm on the Thompson, at a ratio of 1.00 --
         which is what a rigid hook would give and is also what a hand
         being carried across the screen gives. Stopping at the palm
         removes the arm's travel and leaves the bends. */
      const stop = a2.lPalm && a2.lPalm !== a2.lSkin ? a2.lPalm : a2.lSkin;

      const look = () => ({
        knuck: inWeapon(bs[0], stop, d.pivots3[0]),
        mid: inWeapon(bs[1], stop, d.pivots3[2]),
        tip: inWeapon(bs[2], stop, d.tip),
        /* THE ANGLE BETWEEN ONE BONE AND THE NEXT, which is the only
           thing a single hinge cannot change. A hook swings; its own
           shape is fixed, so the angle at its middle joint is the same
           before and after however far it swings. Two of them here, one
           per joint past the knuckle. */
        j1: inWeapon(bs[0], stop, d.pivots3[1]),
        j2a: inWeapon(bs[1], stop, d.pivots3[1]),
        j2b: inWeapon(bs[1], stop, d.pivots3[2]),
        t2: inWeapon(bs[2], stop, d.tip),
        k0: inWeapon(bs[0], stop, d.pivots3[0]),
      });
      /* Opened the way the game opens it -- a reload, which is the only
         thing that opens a hand -- rather than by writing the smoothed
         value the game recomputes from scratch every frame. */
      const shut = look();
      const spec = P.spec();
      P.reloadMax = spec.reload || 1.5;
      P.reloading = P.reloadMax * 0.94;
      run(26);
      const open = look();
      P.reloading = 0;
      run(40);
      const back = look();

      /* The angle between consecutive bones, in degrees. */
      const ang = (q) => {
        const ux = q.j1.x - q.k0.x, uy = q.j1.y - q.k0.y, uz = q.j1.z - q.k0.z;
        const vx = q.j2b.x - q.j2a.x, vy = q.j2b.y - q.j2a.y, vz = q.j2b.z - q.j2a.z;
        const lu = Math.hypot(ux, uy, uz) || 1, lv = Math.hypot(vx, vy, vz) || 1;
        const c = (ux * vx + uy * vy + uz * vz) / (lu * lv);
        return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
      };
      out.push({ id,
        midMoved: +dist(shut.mid, open.mid).toFixed(5),
        tipMoved: +dist(shut.tip, open.tip).toFixed(5),
        knuckMoved: +dist(shut.knuck, open.knuck).toFixed(5),
        seams: (() => {
          /* Counted on the finger this row is about, in the pose it was
             built in -- normals do not move with a bend. */
          const byPos = new Map();
          let n = 0;
          for (const act of bs) {
            if (!act) continue;
            const g4 = B.game.geometryOf(act.mesh);
            if (!g4 || !g4.positions || !g4.normals) continue;
            const Pp = g4.positions, Nn = g4.normals;
            for (let i = 0; i < Pp.length; i += 3) {
              const k = Pp[i].toFixed(5) + ',' + Pp[i + 1].toFixed(5) + ','
                + Pp[i + 2].toFixed(5);
              const had = byPos.get(k);
              const nv = [Nn[i], Nn[i + 1], Nn[i + 2]];
              if (!had) { byPos.set(k, [nv]); continue; }
              let fresh = true;
              for (const m of had) {
                if (m[0] * nv[0] + m[1] * nv[1] + m[2] * nv[2] > 0.985) { fresh = false; break; }
              }
              if (fresh) { had.push(nv); n++; }
            }
          }
          return n;
        })(),
        bendShut: +ang(shut).toFixed(2),
        bendOpen: +ang(open).toFixed(2),
        returned: +dist(shut.tip, back.tip).toFixed(6),
      });
    }
    return out;
  });

  note(`${rows.length} weapons with a three-bone finger`);
  check('the fingers are built as chains', rows.length >= 4, `${rows.length}`);

  /* The knuckle is the root of the chain, so opening must not move it. */
  const drifted = rows.filter((r) => r.knuckMoved > 0.0002);
  check('the base knuckle stays put while the finger opens',
    drifted.length === 0,
    drifted.map((r) => `${r.id} ${(r.knuckMoved * 1000).toFixed(2)}mm`).join(', '));

  const moving = rows.filter((r) => r.tipMoved > 0.002);
  check('the finger opens at all', moving.length === rows.length,
    rows.filter((r) => r.tipMoved <= 0.002)
      .map((r) => `${r.id} ${(r.tipMoved * 1000).toFixed(1)}mm`).join(', '));

  /* THE ONE A HINGE CANNOT FAKE. A hook swinging on one pin keeps its
     own shape, so the angle at its middle joint is identical open and
     shut however far it swings. Any change at all is a second joint. */
  for (const r of rows) {
    note(`${r.id}: the middle joint goes ${r.bendShut.toFixed(1)} deg to `
      + `${r.bendOpen.toFixed(1)} deg as the hand opens`);
  }
  const rigid = rows.filter((r) => Math.abs(r.bendOpen - r.bendShut) < 1.0);
  check('the finger changes its own shape, which one hinge cannot',
    rigid.length === 0,
    rigid.map((r) => `${r.id} ${r.bendShut.toFixed(1)} -> ${r.bendOpen.toFixed(1)} deg`).join(', '));

  /* THE SHADING, which is what a bead is made of. */
  const beaded = rows.filter((r) => r.seams > 0);
  note(`seam vertices across a whole finger: `
    + rows.map((r) => `${r.id} ${r.seams}`).join(', '));
  check('the three bones shade as one finger, with no seam at a joint',
    beaded.length === 0,
    beaded.map((r) => `${r.id} ${r.seams}`).join(', '));

  const stuck = rows.filter((r) => r.returned > 1e-4);
  check('and the hand closes again exactly', stuck.length === 0,
    stuck.map((r) => `${r.id} ${(r.returned * 1000).toFixed(2)}mm`).join(', '));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
