#!/usr/bin/env node
/* Structural checks on the Bunker Nine map.
 *
 * These are the things a screenshot cannot settle. "Is there a hole in the
 * roof" is a question about geometry, not about how a particular frame
 * happened to look, and it was asked repeatedly and answered by eye —
 * badly — before it was asked of the physics world instead.
 *
 * Everything here is a raycast against the built map, so it runs headless
 * in a second and it fails loudly the next time somebody moves a slab.
 *
 * Usage: node engine/test/map.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('map tests need playwright: npm i --no-save playwright');
  process.exit(2);
}

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
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });

  const r = await page.evaluate(() => {
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 12; i++) B.game.step(1 / 60);
    const M = __T_MAP.main, ST = __T_MAP.stair;
    const hit = (o, d, len) => B.game.raycast(o, d, len, (bd) => !bd.isTrigger);
    const out = {};

    /* Is there anything over your head, everywhere you can stand?
       A 25 cm grid, straight up from just under the ceiling. The stairwell
       is open on purpose and is excluded by its own coordinates. */
    const inSlot = (x, z) => x > ST.x0 - 0.2 && z < -2.0;
    let up = 0;
    for (let x = M.x0 + 0.2; x <= M.x1 - 0.2; x += 0.25) {
      for (let z = M.z0 + 0.2; z <= M.z1 - 0.2; z += 0.25) {
        if (inSlot(x, z)) continue;
        if (!hit([x, 3.2, z], [0, 1, 0], 4)) up++;
      }
    }
    out.roofHoles = up;

    /* Is the wall-to-roof-to-parapet seam continuous, from outside?
       Probing from inside starts the ray within the roof slab itself, so it
       never crosses a front face on the way out and every sample reads as a
       hole when the thing is solid. From outside the ray has to cross the
       real skin, which is what is being asked about. */
    let seam = 0;
    for (let t = M.x0 + 0.3; t <= M.x1 - 0.3; t += 0.25) {
      for (const [z, d] of [[M.z0 - 1.2, [0, 0, 1]], [M.z1 + 1.2, [0, 0, -1]]]) {
        for (let y = 3.10; y <= 3.70; y += 0.04) if (!hit([t, y, z], d, 2.6)) seam++;
      }
    }
    for (let t = M.z0 + 0.3; t <= M.z1 - 0.3; t += 0.25) {
      for (const [x, d] of [[M.x0 - 1.2, [1, 0, 0]], [M.x1 + 1.2, [-1, 0, 0]]]) {
        if (x > 0 && t < -1.2) continue;
        for (let y = 3.10; y <= 3.70; y += 0.04) if (!hit([x, y, t], d, 2.6)) seam++;
      }
    }
    out.seamHoles = seam;

    /* The floor, on the same grid: you should not be able to fall out of
       the world anywhere inside the walls. */
    let down = 0;
    for (let x = M.x0 + 0.2; x <= M.x1 - 0.2; x += 0.25) {
      for (let z = M.z0 + 0.2; z <= M.z1 - 0.2; z += 0.25) {
        if (!hit([x, 0.6, z], [0, -1, 0], 2)) down++;
      }
    }
    out.floorHoles = down;

    /* Every weapon the game can hand out has a model, a muzzle distance
       and a sight line — a weapon that reports none of those aims at
       nothing and puts its flash in the wrong place. */
    const bad = [];
    for (const id of Object.keys(B.P.view)) {
      const v = B.P.view[id];
      const root = v.kind === 'single' ? v.actor : v.root;
      if (!root) { bad.push(id + ':no-root'); continue; }
      if (!(v.muzzle > 0.05)) bad.push(id + ':muzzle');
      if (!v.parts || !v.parts.length) bad.push(id + ':no-parts');
      const w = __T_WEAPONS ? __T_WEAPONS[id] : null;
      if (w && !(w.sightH > 0)) bad.push(id + ':sightH');
    }
    out.badWeapons = bad;

    /* No group model may have a visible pivot. Every one of them is an
       invisible 1x1x1 box, and showing one puts a metre-wide default-grey
       cube in the middle of whatever it belongs to. It has happened three
       times: the boss's shield, the minigun's barrel cluster, and the
       scattergun before either. */
    const pivots = [];
    for (const a of B.game.actors) {
      if (!a.visible || !a.mesh) continue;
      const sx = a.scale.x, sy = a.scale.y, sz = a.scale.z;
      if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6 && Math.abs(sz - 1) < 1e-6
          && a.mesh.__key === 'box' && !a.name) pivots.push('unnamed unit box');
    }
    out.suspectPivots = pivots.length;
    return out;
  });

  check('the roof has no holes over the floor', r.roofHoles === 0, `${r.roofHoles} openings`);
  check('the wall-to-roof seam is continuous', r.seamHoles === 0, `${r.seamHoles} gaps`);
  check('the floor has no holes', r.floorHoles === 0, `${r.floorHoles} openings`);
  check('every weapon has a model, a muzzle and a sight line',
    r.badWeapons.length === 0, r.badWeapons.join(', '));
  check('no group model is showing its pivot', r.suspectPivots === 0, `${r.suspectPivots} suspect`);
  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('the map builds without errors', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
