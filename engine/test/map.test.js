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

    /* The wing roof, before and after the rock.
     *
     * The hole over the wing was built into the map: four slabs laid round
     * a gap, a torn concrete edge and a shaft of daylight, all standing on
     * round one. Straight up from under it there should be concrete until
     * the meteorite lands, and sky afterwards. Both halves are checked,
     * because a roof that never opens is the same bug the other way round. */
    {
      const H = __T_MAP.hole;
      out.wingBefore = !!hit([H.x, 2.6, H.z], [0, 1, 0], 4);
      out.wingLightBefore = B.S.roofHole ? B.S.roofHole.shaft.intensity : -1;
      try {
        const m = B.S.meteor;
        m.state = 'falling'; m.fall = 0.0001;
        for (let i = 0; i < 8; i++) B.game.step(1 / 60);
      } catch (e) { out.wingErr = e.message; }
      out.wingAfter = !!hit([H.x, 2.6, H.z], [0, 1, 0], 4);
      out.wingLightAfter = B.S.roofHole ? B.S.roofHole.shaft.intensity : -1;
      out.wingEdge = B.S.roofHole ? B.S.roofHole.edge.filter((w) => w.visible).length : -1;
    }

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

    /* Does anything flick to black as you turn?

       This was reported over and over — "the walls go black and glitchy if
       you change your look slightly", "the distant slabs turn black" — and
       answered every time by looking at a screenshot, which cannot see it
       because it is a difference between frames. The cause was depth
       precision: near 0.02 against far 500 is a 25000:1 ratio, and by
       thirty metres two surfaces a centimetre apart shared a depth bucket
       and fought over every pixel.

       So it is measured. Sweep the view slowly past each wall, the
       ceiling, the roof and the field beyond it, and watch the brightness
       of a patch at the middle of the screen. Lighting and shading change
       smoothly; a surface losing its depth fight does not. A step of forty
       five per cent between neighbouring samples is far above anything
       geometry produces and far below what a pop looks like. */
    const gl = B.game.renderer.gl, cv = B.game.canvas;
    // readPixels counts y from the bottom, which is upside down from every
    // other coordinate here and has caught this codebase before.
    const patch = () => {
      const w = 40, h = 30;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(Math.floor(cv.width / 2 - w / 2), Math.floor(cv.height / 2 - h / 2),
        w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.30 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
      return sum / (w * h);
    };
    B.S.powered = true;
    for (const L of B.S.lamps) L.light.intensity = L.off ? 0 : L.full;
    const pops = [];
    for (const [name, at2, yaw0, pitch] of [
      ['north wall', [0, 1.1, 3.0], Math.PI, 0.02],
      ['east wall', [0, 1.1, 0.0], Math.PI * 1.5, 0.02],
      ['west wall', [-3, 1.1, 0.0], Math.PI * 0.5, 0.02],
      ['south wall', [0, 1.1, -3.0], 0, 0.02],
      ['ceiling', [0, 1.1, 0.0], Math.PI, 0.85],
      ['roof deck', [0, 3.75, -5.0], Math.PI, -0.05],
      ['battlefield', [0, 3.75, -5.0], Math.PI, -0.16],
    ]) {
      __T.teleport(at2[0], at2[1], at2[2]);
      let prev = null, worst = 0;
      for (let k = -18; k <= 18; k++) {
        __T.look(yaw0 + k * 0.012, pitch);
        B.game.step(1 / 60);
        const cur = patch();
        if (prev != null) {
          const rel = Math.abs(cur - prev) / Math.max(6, Math.max(prev, cur));
          if (rel > worst) worst = rel;
        }
        prev = cur;
      }
      if (worst > 0.45) pops.push(name + ' ' + worst.toFixed(2));
    }
    out.pops = pops;

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
  check('the wing roof is whole before the meteorite falls',
    r.wingBefore === true && r.wingLightBefore === 0,
    `overhead ${r.wingBefore ? 'solid' : 'OPEN'}, daylight ${r.wingLightBefore}`);
  check('the meteorite makes the hole it comes through',
    !r.wingErr && r.wingAfter === false && r.wingLightAfter > 0 && r.wingEdge === 8,
    r.wingErr || `overhead ${r.wingAfter ? 'still solid' : 'open'}, daylight ${r.wingLightAfter}, ${r.wingEdge}/8 torn edges shown`);
  check('the wall-to-roof seam is continuous', r.seamHoles === 0, `${r.seamHoles} gaps`);
  check('the floor has no holes', r.floorHoles === 0, `${r.floorHoles} openings`);
  check('every weapon has a model, a muzzle and a sight line',
    r.badWeapons.length === 0, r.badWeapons.join(', '));
  check('no group model is showing its pivot', r.suspectPivots === 0, `${r.suspectPivots} suspect`);
  check('nothing flicks to black as the view turns', r.pops.length === 0, r.pops.join(', '));

  /* One reload, one of each thing.
   *
   * This has now been the same bug twice. A reload stage held in a boolean
   * that is set at 6% and cleared again at 62% passes its own opening test
   * on the very next frame, so it fires for every frame of the rest of the
   * reload: a hundred and ten shell casings on the floor of a scattergun
   * reload and fifty-five overlapping clacks, and the same shape again in
   * the revolver's cylinder. It is invisible in code review and obvious in
   * play, which is exactly what a test is for.
   *
   * Run a full reload of every weapon with the sound bank and the case
   * ejector counted, and fail anything that does a one-off more than a
   * handful of times. */
  const rl = await page.evaluate(() => {
    const out = [];
    const S = B.S, P = B.P;
    B.game.step(1 / 60);
    /* One weapon per reload kind, not all seventeen. The bug belongs to the
     * kind — it is the shape of the code that drives the animation, and every
     * gun sharing a kind shares that code. Stepping seventeen full reloads
     * through the whole map costs minutes and proves the same thing five
     * times over. */
    const seen = {};
    const pick = [];
    for (const id of Object.keys(B.P.view)) {
      const w = __T_WEAPONS[id];
      if (!w || w.melee || !w.mag) continue;
      const k = w.reloadKind || 'mag';
      if (seen[k]) continue;
      seen[k] = 1;
      pick.push(id);
    }
    for (const id of pick) {
      P.give(id);
      P.slot = P.slots.indexOf(id);
      if (P.slot < 0) continue;
      B.game.step(1 / 60);
      const am = P.ammoFor(id);
      am.mag = 0;
      am.reserve = __T_WEAPONS[id].reserve || 30;
      // Count what the reload throws and what it plays.
      const before = S.brass.length;
      const counts = {};
      const sfx = S.__sfx;
      let wrapped = null;
      if (sfx) {
        wrapped = {};
        for (const k of Object.keys(sfx)) {
          if (typeof sfx[k] !== 'function') continue;
          const orig = sfx[k];
          wrapped[k] = orig;
          sfx[k] = function () { counts[k] = (counts[k] || 0) + 1; };
        }
      }
      __T.reload();
      const spec = P.spec();
      const frames = Math.ceil((spec.reload + 0.4) * 60);
      for (let i = 0; i < frames; i++) { B.game.step(1 / 60); S.toSpawn = 0; S.spawnT = 1e9; }
      if (wrapped) for (const k in wrapped) sfx[k] = wrapped[k];
      const cases = Math.max(0, S.brass.length - before);
      let worst = 0, worstK = '';
      for (const k in counts) if (counts[k] > worst) { worst = counts[k]; worstK = k; }
      out.push({ id, cases, worst, worstK });
    }
    return out;
  });
  const spammy = rl.filter((x) => x.worst > 6).map((x) => `${x.id}:${x.worstK} x${x.worst}`);
  const showers = rl.filter((x) => x.cases > 8).map((x) => `${x.id} ${x.cases} cases`);
  /* Firing a single action should cock it once per shot, not once per
     frame. The same defect has now shipped four times in this game -- the
     break gun, the revolver's cylinder, the Arc's cell and the Mauser's
     clip -- every one of them a flag set inside a window that passes its
     own test again on the very next frame. The thumb-cocking animation is
     the same shape of code, so it is checked rather than trusted. */
  const ck = await page.evaluate(() => {
    const S = window.B.S, P = S.player, sfx = S.__sfx;
    P.give('obliterator');
    P.slot = P.slots.indexOf('obliterator');
    for (let i = 0; i < 40; i++) { window.B.game.step(1 / 60); S.toSpawn = 0; S.spawnT = 1e9; }
    let cocks = 0, shots = 0;
    /* The weapon's own firing sound, read from its spec rather than named
       here: this counted shotMagnum, and when the Model 5 was given a
       sound of its own the test reported zero shots and four cocks for a
       gun that was working perfectly. */
    const shotKey = __T_WEAPONS.obliterator.sfx;
    const rc = sfx.hammerCock, rs = sfx[shotKey];
    sfx.hammerCock = () => { cocks++; };
    sfx[shotKey] = () => { shots++; };
    /* Through the test-hold hook, because the game rebuilds S.input from
       the device every frame and anything written straight into it is gone
       before the fire code reads it. */
    for (let i = 0; i < 300; i++) {
      if ((i % 34) === 0) __T.hold({ fire: true });
      else if ((i % 34) === 6) __T.release();
      window.B.game.step(1 / 60);
      S.toSpawn = 0; S.spawnT = 1e9;
    }
    __T.release();
    sfx.hammerCock = rc; sfx[shotKey] = rs;
    const v = P.view.obliterator;
    return { shots, cocks, hammer: !!v.hammer, thumb: !!(v.arms && v.arms.thumb) };
  });
  check('the single action has a hammer and a thumb that can move',
    ck.hammer && ck.thumb, JSON.stringify(ck));
  check('the hammer is cocked once per shot, not once per frame',
    ck.shots > 0 && ck.cocks === ck.shots,
    `${ck.shots} shots, ${ck.cocks} cocks`);

  check('a reload plays each of its sounds a few times, not once a frame',
    spammy.length === 0, spammy.join(', '));
  check('a reload does not empty a bandolier onto the floor',
    showers.length === 0, showers.join(', '));
  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('the map builds without errors', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
