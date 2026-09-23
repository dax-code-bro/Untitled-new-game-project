#!/usr/bin/env node
/* MULTIPLAYER'S RELOAD, on every gun in the rack.
 *
 * reload.test.js asks these questions of zombies' sixteen weapons and
 * has for months. Multiplayer's answer to all of them was the same:
 * there was nothing to measure. The reload was a positional dip and an
 * ammunition counter -- the gun tipped, the number went back up, and no
 * magazine ever left a pouch or entered a well on any of seventy-five
 * weapons.
 *
 * Both games drive engine/src/97f-reload.js now, so this is the same
 * four questions asked of the other rack:
 *
 *   1. Does a weapon carry anything at all during its reload?
 *   2. Is the load ON SCREEN while it is being carried? A magazine in
 *      the hand and below the bottom edge of the picture is a gun that
 *      reloads itself.
 *   3. Is the support HAND on the load? A magazine travelling beside a
 *      hand is not a magazine being held.
 *   4. Is anything left hanging in the air when the reload ends?
 *
 * Driven through the REAL viewmodel -- the same select() and place()
 * the frame loop calls -- rather than through a match, because a match
 * would have to be played seventy-five times.
 *
 * Usage: node engine/test/mpreload.test.js
 */
const path = require('path');

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

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  /* SMALL, and the reason is not politeness. Every frame of this is a
     full render in software GL, and at 1000x620 the first version of
     this file ran for forty minutes at 350 per cent of a core and never
     finished -- on a box with four of them, while starving the other
     test running beside it. The picture is never looked at; only the
     projection is, and a projection needs an aspect ratio rather than a
     resolution. 320x200 is 1.60, which is the aspect the game is
     judged at, and it is a twelfth of the pixels. */
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=town&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.evaluate(() => window.MP.input._lock(true));

  const rows = await page.evaluate(() => {
    const G = window.MP, M = G.match, vm = G.viewmodel, D = window.MP_DATA;
    const eye = { x: M.you.pos.x, y: M.you.pos.y + 1.62, z: M.you.pos.z };
    /* POINT THE CAMERA WHERE THE WEAPON IS BEING HELD.
     *
       place() builds the hold from the yaw and pitch it is given, and
       this passed zero for both while leaving the camera wherever the
       match had last put it -- so the gun was placed as if you were
       looking north and photographed from whatever direction the player
       happened to be facing. Six weapons came back "the load is off the
       bottom of the frame" and the frame was not pointing at them.

       reloadOnscreen asks the camera, so the camera has to be the one
       that matters. */
    const YAW = 0, PITCH = 0;
    const aim = () => {
      const fx = Math.sin(YAW) * Math.cos(PITCH), fy = -Math.sin(PITCH),
        fz = Math.cos(YAW) * Math.cos(PITCH);
      G.game.lookAt([eye.x, eye.y, eye.z], [eye.x + fx, eye.y + fy, eye.z + fz]);
      const c = G.game.canvas;
      G.game.camera.update((c.clientWidth || 320) / Math.max(1, c.clientHeight || 200));
    };
    /* World point -> normalised screen; -1..1 in both axes is on screen. */
    const ndc = (a) => {
      const m = G.game.camera.viewProj.e, e = a.matrix.e;
      const x = e[12], y = e[13], z = e[14];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (w <= 1e-5) return null;
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
    };
    const wp = (a) => { const e = a.matrix.e; return [e[12], e[13], e[14]]; };
    /* Each load piece's authored box, taken once and kept. */
    const _bx = {};
    const boxOf = (a) => {
      const k = (a.mesh && a.mesh.id != null) ? a.mesh.id : a.name;
      if (k in _bx) return _bx[k];
      const g = G.game.geometryOf ? G.game.geometryOf(a.mesh) : null;
      const Q = g && g.positions;
      if (!Q || !Q.length) { _bx[k] = null; return null; }
      const lo = [9, 9, 9], hi = [-9, -9, -9];
      for (let i = 0; i < Q.length; i += 3)
        for (let c = 0; c < 3; c++) {
          const val = Q[i + c];
          if (val < lo[c]) lo[c] = val;
          if (val > hi[c]) hi[c] = val;
        }
      _bx[k] = [lo, hi];
      return _bx[k];
    };
    /* COMPOSE THE MATRICES WITHOUT RUNNING THE GAME.
     *
       This called game.step(0) to get the transforms up to date, and
       step() runs the update hooks first -- which is the match's own
       frame, which calls vm.place() with the REAL reload progress, which
       is zero. So every synthetic pose this test set was overwritten by
       the game before it could be measured, and the answer came back
       "nothing is ever carried" for all seventy-five weapons. The test
       was fighting the game for the same viewmodel.

       A matrix is a parent's matrix times a local transform, so the
       parent goes first and the children follow. No hooks, no physics,
       no render -- and it is also about fifty times cheaper, which is
       why the first version of this file ran for forty minutes. */
    const compose = (root, extra) => {
      root.updateMatrix();
      for (const k of root.partNames || []) if (root[k] && root[k] !== root) root[k].updateMatrix();
      for (const a of extra || []) if (a) a.updateMatrix();
    };
    const out = [];
    for (const spec of D.GUNS) {
      const id = spec.id;
      let err = null;
      let frames = 0, shown = 0, onScreen = 0, inHand = 0, worst = 0, lowest = 9;
      let kind = null, leftOver = 0;
      try {
        // Settle the weapon in the hold before the reload starts.
        aim();
        for (let i = 0; i < 3; i++) vm.place(eye, YAW, PITCH, 0, false, 0, 0, id, 0, 1 / 60);
        kind = vm.state.rlKind;
        /* Twenty samples through the reload. Enough to catch a load
           that is off screen or out of the hand -- both of those are
           whole beats long, not single frames -- and three times
           cheaper than sixty. */
        const N = 20;
        for (let i = 1; i <= N; i++) {
          /* TWICE, and compose between. reloadOnscreen asks the camera
             whether the fetch point projects above the bottom edge, and
             it asks through the WEAPON's matrix -- which on the first
             call after a weapon change is still the previous weapon's.
             So the on-screen guard was being run against the wrong gun
             and reported five weapons off frame that were not. The
             second call sees a matrix composed from its own hold. */
          aim();
          vm.place(eye, YAW, PITCH, 0, false, 0, 0, id, i / (N + 1), 1 / 60);
          var armsNow = vm.gun && vm.gun.__arms;
          compose(vm.gun, (vm.state.rlProp ? vm.state.rlProp.parts : [])
            .concat(armsNow ? armsNow.parts : []));
          vm.place(eye, YAW, PITCH, 0, false, 0, 0, id, i / (N + 1), 1 / 60);
          const pr = vm.state.rlProp;
          armsNow = vm.gun && vm.gun.__arms;
          compose(vm.gun, (pr ? pr.parts : []).concat(armsNow ? armsNow.parts : []));
          frames++;
          if (!pr) continue;
          const vis = pr.parts.filter((a) => a.visible !== false);
          if (!vis.length) continue;
          shown++;
          const q = ndc(vis[0]);
          if (q) {
            if (q[1] < lowest) lowest = q[1];
            if (q[0] > -1 && q[0] < 1 && q[1] > -1 && q[1] < 1) onScreen++;
          }
          /* How far the support hand is from the thing it is carrying,
             and this is the measure zombies' reload.test.js spells out
             in a comment I read and then got wrong anyway.

             THE AUTHORED HAND POINT PLUS THE ACTOR'S OFFSET, not the
             actor's origin. An arm mesh is authored in the WEAPON's own
             space, so its actor sits at the weapon's origin and its
             position field is only the offset the reload has applied.
             Measuring the actor origin reports the distance from the
             gun's web to the magazine -- a real number about nothing,
             and it came back as 350 to 800 mm on every weapon in the
             rack while the hand was in fact on the magazine.

             And the NEAREST visible piece of the load, not the first:
             a revolver leaves each round in the chamber it was thumbed
             into, so the first visible part is one already in the gun
             and the hand is correctly nowhere near it.

             AND THE LOAD IS MEASURED THE SAME WAY, which is the half of
             that paragraph both tests got wrong. A prop mesh is authored
             where the load belongs on the gun, so its actor position is
             ALSO only an offset -- comparing a hand at (authored +
             offset) against a load at (offset) is comparing two frames.
             It read 52 mm on every magazine, where the hand was on the
             magazine, and 51 on the stripper clips, where the hand was
             51 mm from the clip: the two being similar was a
             coincidence, and under it the shells and the clips were out
             by 46 to 57 mm for the whole of every reload.

             Point to the load's own BOX -- zero on it or in it, the real
             gap off it -- because a hand gripping a battery cell through
             the middle is 26 mm from its nearest corner and is holding
             it. And 20 mm, not 160: the old bound was wider than a hand,
             so this check could not fail. */
          const ls = armsNow && armsNow.lSkin;
          const dl = armsNow && armsNow.digits && armsNow.digits.left;
          if (ls && dl && dl.at) {
            const lp = ls.position;
            const hx = dl.at[0] + lp.x, hy = dl.at[1] + lp.y, hz = dl.at[2] + lp.z;
            let d = 1e9;
            for (const q2 of vis) {
              const bx = boxOf(q2), o = q2.position;
              let dd;
              if (!bx) dd = Math.hypot(hx - o.x, hy - o.y, hz - o.z);
              else {
                const h3 = [hx - o.x, hy - o.y, hz - o.z];
                let s2 = 0;
                for (let c = 0; c < 3; c++) {
                  const g3 = h3[c] < bx[0][c] ? bx[0][c] - h3[c]
                    : (h3[c] > bx[1][c] ? h3[c] - bx[1][c] : 0);
                  s2 += g3 * g3;
                }
                dd = Math.sqrt(s2);
              }
              if (dd < d) d = dd;
            }
            if (d > worst) worst = d;
            if (d < 0.020) inHand++;
          }
        }
        // And the frame after it ends.
        vm.place(eye, YAW, PITCH, 0, false, 0, 0, id, 0, 1 / 60);
        const pr2 = vm.state.rlProp;
        if (pr2) leftOver = pr2.parts.filter((a) => a.visible !== false).length;
      } catch (e) { err = String(e.message || e).slice(0, 90); }
      out.push({ id, cls: spec.cls, kind, frames, shown, onScreen, inHand,
        worst: Math.round(worst * 1000), lowest: Math.round(lowest * 100) / 100,
        leftOver, err });
    }
    return out;
  });

  const threw = rows.filter((r) => r.err);
  const carried = rows.filter((r) => !r.err && r.shown > 0);
  const nothing = rows.filter((r) => !r.err && r.shown === 0);
  const offScreen = carried.filter((r) => r.onScreen < r.shown);
  const notHeld = carried.filter((r) => r.inHand < r.shown * 0.85);
  const litter = rows.filter((r) => r.leftOver > 0);

  const byKind = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  console.log('\n  guns', rows.length, ' kinds', JSON.stringify(byKind), '\n');
  console.log('   WEAPON       KIND      CARRIED  ONSCREEN  INHAND  WORST  LEFT');
  for (const r of rows.slice(0, 10).concat(offScreen, notHeld, litter, threw)) {
    console.log('   ' + String(r.id).padEnd(13) + String(r.kind).padEnd(10)
      + String(r.shown + '/' + r.frames).padEnd(9)
      + String(r.onScreen).padEnd(10) + String(r.inHand).padEnd(8)
      + String(r.worst + 'mm').padEnd(7) + r.leftOver + (r.err ? '  ' + r.err : ''));
  }
  console.log('');

  check('no weapon threw during its reload', threw.length === 0,
    threw.slice(0, 3).map((r) => r.id + ': ' + r.err).join(' | '));
  check('every reload carries something visible', nothing.length === 0,
    nothing.slice(0, 6).map((r) => r.id + '(' + r.kind + ')').join(', '));
  check('the load is on screen for the whole of every reload', offScreen.length === 0,
    offScreen.slice(0, 6).map((r) => r.id + ' ' + r.onScreen + '/' + r.shown).join(', '));
  check('the support hand is on the load it is carrying', notHeld.length === 0,
    notHeld.slice(0, 6).map((r) => r.id + ' ' + r.worst + 'mm').join(', '));
  check('nothing is left hanging in the air when a reload ends', litter.length === 0,
    litter.slice(0, 6).map((r) => r.id + ' x' + r.leftOver).join(', '));
  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
