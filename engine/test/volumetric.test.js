#!/usr/bin/env node
/* IS THERE ANY LIGHT IN THE AIR IN THIS RENDERER?
 *
 * Fog here is one closed-form exponential evaluated per surface pixel
 * (applyFog, in GLSL.fog). It reads the distance to the surface and
 * nothing else -- in particular it has never read the shadow map. So
 * the air inside a sunbeam and the air in the shadow beside it are
 * painted exactly the same value, and the frame has no god rays in it:
 * not through a doorway, not through a broken roof, not out of a
 * tunnel mouth. Every interior reads as evenly filled rather than
 * shafted.
 *
 * WHY A RIG AND NOT A MAP VIEW. "Point the camera at the bunker's
 * skylight and see whether it looks shafty" is a squint, not a
 * measurement. So this builds the simplest thing that can only be
 * explained by volumetrics: a solid ceiling with one 2 m square hole
 * in it, the sun almost overhead, and the camera nine metres away
 * UNDER THE SOLID PART looking across the beam. If a bright vertical
 * column appears under the hole when the feature is switched on and
 * nowhere else, there is light in the air. If the frame simply gets
 * brighter all over, it is fog, not a shaft.
 *
 * THE CAMERA IS DELIBERATELY OUTSIDE THE BEAM. The first cut of this
 * rig used a ceiling SLOT running the length of the room and put the
 * camera under it, so every ray started in full sun and the contrast
 * measurement read 2.6 when the picture plainly had a shaft in it. A
 * rig that stands in the thing it is trying to measure the edge of
 * cannot see the edge.
 *
 * EVERY MEASUREMENT IS A DIFFERENCE, feature off minus feature on, in
 * the same scene from the same camera three frames apart. Ambient, the
 * sky, the tonemapper and the grade are identical in both and cancel
 * exactly, so nothing here moves when another feature lands.
 *
 * WHAT IS MEASURED
 *
 *   lift      mean sRGB luma the shafts add over the whole frame.
 *   band      the delta averaged into 24 vertical columns, then the
 *             brightest column over the dimmest. THE HEADLINE NUMBER.
 *             Uniform fog scores 1.0 whatever its density. A shaft
 *             cannot.
 *   peak      which column is brightest, as a fraction across the
 *             frame. The hole is dead centre and the sun leans a
 *             little +x, so a real shaft peaks just past 0.5 and a bug
 *             that lights the frame edges does not.
 *   toward /  the same lift with the camera at one spot pointed at the
 *   away      sun and then at its mirror image. Henyey-Greenstein at
 *             g = 0.45 is 18:1 forward to back; anything that is not a
 *             phase function scores 1:1.
 *   thin      the same view with the map's fog density dropped to a
 *             twenty-fifth. The march multiplies the MAP's density, so
 *             clearing the air has to clear the shafts with it.
 *
 * Usage: node engine/test/volumetric.test.js
 *   (NODE_PATH must point at a playwright install.)
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
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  page.setDefaultTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!/performance|deprecat|SwiftShader|Fallback/i.test(t)) errors.push(t);
  });
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  const R = await page.evaluate(() => {
    /* Ultra, because that is the only tier this feature is on at, and
       scaled right down because SwiftShader is a CPU. renderScale 0.5
       on a 320x240 viewport is 160x120, so the march runs at 80x60. */
    const g = LegendEngine.create({
      canvas: '#game', quality: 'ultra', preserveDrawingBuffer: true,
      qualityOverrides: { renderScale: 0.5, shadowRes: 1024, maxGrass: 0, volSteps: 24 },
    });
    const R = g.renderer;

    /* A CEILING WITH ONE 2 m SQUARE HOLE IN IT, at the origin, with the
       room walled on three sides so the shadowed air has something dark
       behind it. Four slabs rather than one with a hole because the
       engine's box primitive does not do holes. */
    const mat = { color: 0x9a968e, texture: 'smooth', roughness: 0.9, metalness: 0 };
    g.box({ size: [10, 0.4, 22], position: [-6, 6, 0], physics: false, material: mat });
    g.box({ size: [10, 0.4, 22], position: [6, 6, 0], physics: false, material: mat });
    g.box({ size: [2, 0.4, 10], position: [0, 6, -6], physics: false, material: mat });
    g.box({ size: [2, 0.4, 10], position: [0, 6, 6], physics: false, material: mat });
    g.box({ size: [22, 0.4, 22], position: [0, -0.2, 0], physics: false, material: mat });
    g.box({ size: [0.4, 6, 22], position: [-10.8, 3, 0], physics: false, material: mat });
    g.box({ size: [0.4, 6, 22], position: [10.8, 3, 0], physics: false, material: mat });
    g.box({ size: [22, 6, 0.4], position: [0, 3, 10.8], physics: false, material: mat });

    /* Sun almost straight down and a little to one side, so the beam is
       a near-vertical column with hard edges. Kept under y 0.99 of unit
       length on purpose: past that _fitCascade switches its up vector
       to the Z axis, and this rig should exercise the ordinary branch. */
    R.sun.direction.set(0.18, 0.97, 0.0).normalize();
    R.sun.intensity = 3.2;
    R.sky.intensity = 0.55;
    R.shadows.distance = 40;
    /* A dusty room. 0.010 is the bunker map's own density, the thickest
       thing this game ships. */
    R.fog.density = 0.010;
    R.post.vignette = 0;
    R.post.grain = 0;

    const gl = g.gl;
    const shot = () => {
      const w = g.canvas.width, h = g.canvas.height;
      const buf = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const lum = new Float32Array(w * h);
      for (let p = 0; p < w * h; p++) {
        lum[p] = 0.2126 * buf[p * 4] + 0.7152 * buf[p * 4 + 1] + 0.0722 * buf[p * 4 + 2];
      }
      return { w, h, lum };
    };
    const run = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
    const aim = (px, py, pz, tx, ty, tz) => {
      g.camera.position.set(px, py, pz);
      g.camera.target.set(tx, ty, tz);
    };

    /* The A/B. quality.volumetric is a plain field and the targets are
       allocated lazily inside present(), so this needs no resize and no
       tier change -- which is the point of gating on the key rather
       than on the tier name. */
    const pair = (setup) => {
      setup();
      R.quality.volumetric = 0;
      run(3);
      const off = shot();
      const offDraws = R.stats.draws;
      R.quality.volumetric = 1;
      run(3);
      const on = shot();
      return { off, on, offDraws, onDraws: R.stats.draws, volB: !!R.volB };
    };

    const stats = (p) => {
      const { w, h } = p.off;
      const d = new Float32Array(w * h);
      let sum = 0;
      for (let i = 0; i < w * h; i++) { d[i] = p.on.lum[i] - p.off.lum[i]; sum += d[i]; }
      const cols = 24;
      const cm = new Float32Array(cols), cn = new Float32Array(cols);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = Math.min(cols - 1, Math.floor(x * cols / w));
          cm[c] += d[y * w + x]; cn[c]++;
        }
      }
      let best = -1e9, lo = 1e9, bi = 0;
      for (let c = 0; c < cols; c++) {
        cm[c] /= Math.max(1, cn[c]);
        if (cm[c] > best) { best = cm[c]; bi = c; }
        lo = Math.min(lo, cm[c]);
      }
      return {
        lift: +(sum / (w * h)).toFixed(3),
        /* Floored at a fifth of a luma step so a dimmest column that is
           genuinely zero reports a big ratio instead of dividing by
           noise. */
        band: +(best / Math.max(0.2, lo)).toFixed(2),
        peak: +((bi + 0.5) / cols).toFixed(3),
        best: +best.toFixed(3), lo: +lo.toFixed(3),
        cols: Array.from(cm).map((v) => +v.toFixed(2)),
      };
    };

    /* 1. ACROSS THE BEAM. Nine metres back under the solid ceiling,
          looking down the room, so the sun is at ninety degrees to the
          view and the column stands in the middle of the frame. */
    const across = pair(() => aim(0, 2.6, -9, 0, 2.6, 4));
    const A = stats(across);

    /* 2. THE PHASE FUNCTION. One spot, once pointed at the sun through
          the hole and once at its mirror image, so the path length and
          the geometry are as close to identical as a rig gets and the
          only thing that changed is the scattering angle. */
    const up = pair(() => aim(0, 1.2, 0, 0.18 * 12, 1.2 + 0.97 * 12, 0));
    const dn = pair(() => aim(0, 1.2, 0, -0.18 * 12, 1.2 - 0.97 * 12, 0));
    const U = stats(up), D = stats(dn);

    /* 3. THE COUPLING TO THE MAP'S FOG. Clear the air and the shafts
          have to go with it, because the density they march is the
          map's own and nothing else. */
    R.fog.density = 0.0004;
    const T = stats(pair(() => aim(0, 2.6, -9, 0, 2.6, 4)));
    R.fog.density = 0.010;

    /* 4. THE TIER GATE. Dropping the key has to free the targets, so a
          tier that did not ask for this pays no memory for it. */
    R.quality.volumetric = 1;
    run(1);
    const allocAtUltra = !!R.volB;
    R.quality.volumetric = 0;
    run(1);
    const freedWhenOff = !R.volB;

    return {
      across: A, up: U, down: D, thin: T,
      offDraws: across.offDraws, onDraws: across.onDraws,
      volBOn: across.volB, allocAtUltra, freedWhenOff,
      size: [across.off.w, across.off.h],
    };
  });

  const pad = (s, w) => String(s).padEnd(w);
  console.log('\n  ' + pad('view', 12) + pad('lift', 9) + pad('band', 9) + pad('peak', 9)
    + pad('bright col', 12) + 'dim col');
  for (const [k, v] of [['across', R.across], ['toward sun', R.up],
    ['away', R.down], ['thin air', R.thin]]) {
    console.log('  ' + pad(k, 12) + pad(v.lift.toFixed(3), 9) + pad(v.band.toFixed(2), 9)
      + pad(v.peak.toFixed(3), 9) + pad(v.best.toFixed(3), 12) + v.lo.toFixed(3));
  }
  console.log('');
  note(`frame ${R.size[0]}x${R.size[1]}, draws ${R.offDraws} -> ${R.onDraws}`);
  note(`columns across the beam: ${R.across.cols.join(' ')}`);

  /* THE CONTROL FIRST. None of the rest means anything if the pass
     never ran or ran on both halves of the A/B. */
  check('the pass allocates its targets when the key goes up',
    R.volBOn && R.allocAtUltra);
  check('and frees them again when it comes down', R.freedWhenOff);
  check('the pass is exactly two extra draws', R.onDraws - R.offDraws === 2,
    `${R.offDraws} -> ${R.onDraws}`);

  check('there is light in the air at all', R.across.lift > 0.5,
    `mean luma lift ${R.across.lift}`);
  /* THE NUMBER THAT SEPARATES A SHAFT FROM FOG. Uniform in-scattering
     scores 1.0 whatever its density; only a shadow-modulated march can
     put one part of the frame several times brighter than another. */
  check('the light in the air is a SHAFT and not a fog bank', R.across.band > 4,
    `brightest column / dimmest column = ${R.across.band}`);
  check('the shaft stands under the hole, not at the frame edge',
    Math.abs(R.across.peak - 0.5) < 0.20, `peak column at ${R.across.peak}`);
  /* Henyey-Greenstein at g = 0.45 is 18:1 forward to back. This is not
     a laboratory -- the two views see different surfaces and the path
     lengths are not identical -- so it asks for a factor of three,
     which no non-directional term can produce and which is well inside
     what the phase function has to deliver. */
  check('scattering is forward-biased, as a phase function must be',
    R.up.lift > R.down.lift * 3, `toward ${R.up.lift} vs away ${R.down.lift}`);
  /* MEASURED ON THE BEAM'S OWN COLUMN, not on the whole frame. The
     medium saturates -- single scattering with an albedo of one cannot
     exceed phase * sunRadiance however thick the air is -- so density
     decides WHERE along the ray the light is picked up rather than how
     much of it there is in total, and a whole-frame mean over a long
     thin room barely moves. What does move, and what a player sees, is
     how bright the beam itself is. */
  check('clearing the map\'s air dims the beam', R.thin.best < R.across.best * 0.7,
    `thin beam ${R.thin.best} vs dusty beam ${R.across.best}`);
  check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
