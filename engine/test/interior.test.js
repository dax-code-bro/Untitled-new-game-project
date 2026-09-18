#!/usr/bin/env node
/* DOES A ROOM WITH A ROOF ON IT LOOK LIKE A ROOM?
 *
 * Until the sky-occlusion term, no. The ambient in this shader is a
 * hemisphere lookup on the surface normal with nothing between it and
 * the sky, so a floor under a roof received exactly the irradiance of
 * the same floor out in the yard. Every interior in the game -- the
 * hotel lobby, the bunker, the cottage -- rendered as flat fill, and
 * that got blamed on the textures three separate times.
 *
 * Real sky visibility means tracing the hemisphere. This engine is not
 * going to do that at sixty frames on a phone. What it already has is a
 * buffer that knows what is above a point, the sun shadow map, and for
 * the occluders that matter here -- roofs -- "the sun is blocked" and
 * "the sky is blocked" are the same object.
 *
 * So: a floor, and a roof over half of it. Both halves are one slab of
 * one material under one light, so nothing but the roof can be the
 * difference between them.
 *
 * The test is written in both directions on purpose. Turning the term
 * off has to bring the two halves back together, because otherwise all
 * this proves is that two points on a floor are different, which they
 * might be for a dozen reasons this test cannot see.
 *
 * Usage: node engine/test/interior.test.js
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const G = LE.create({ canvas: '#game', quality: 'normal', gravity: 0 });
    G.setSky('noon'); G.setTimeOfDay(12);
    const floor = G.material({ color: 0xe6e2da, texture: 'concrete', roughness: 0.93,
      metalness: 0, uvScale: 0.5, worldUv: true });
    const roofM = G.material({ color: 0x9aa2a8, texture: 'metal', roughness: 0.6,
      metalness: 1, uvScale: 0.67, worldUv: true });
    /* ONE slab of floor under both halves. Two slabs would let a
       difference in the mesh, the batch or the material stand in for
       the roof and the test would still pass. */
    G.box({ at: [0, -0.25, 0], size: [80, 0.5, 40], material: floor, physics: false });
    // A roof over the +X half only, high enough to be a roof.
    G.box({ at: [20, 4.2, 0], size: [36, 0.4, 36], material: roofM, physics: false });
    // Walls, so the covered half is a room rather than a canopy.
    G.box({ at: [38.2, 2.1, 0], size: [0.4, 4.2, 36], material: floor, physics: false });
    G.box({ at: [20, 2.1, 18.2], size: [36, 4.2, 0.4], material: floor, physics: false });
    G.box({ at: [20, 2.1, -18.2], size: [36, 4.2, 0.4], material: floor, physics: false });

    const gl = G.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    /* Looking down at one patch of floor from three metres, which is
       the angle a player sees a floor from. */
    const lumaAt = (x) => {
      G.renderFrom([x, 2.2, 7], [x, 0, 0], { fov: 60 });
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let sum = 0, n = 0;
      for (let y = (H * 0.15) | 0; y < (H * 0.45) | 0; y++) {
        for (let x2 = (W * 0.3) | 0; x2 < (W * 0.7) | 0; x2++) {
          const a = (y * W + x2) * 4;
          sum += 0.2126 * buf[a] + 0.7152 * buf[a + 1] + 0.0722 * buf[a + 2];
          n++;
        }
      }
      return n ? sum / n : 0;
    };
    const R = G.renderer;
    const out = { occlusion: R.sky.occlusion };
    out.onCovered = lumaAt(20); out.onOpen = lumaAt(-20);
    R.sky.occlusion = 0;
    out.offCovered = lumaAt(20); out.offOpen = lumaAt(-20);
    R.sky.occlusion = out.occlusion;
    return out;
  });

  const onRatio = r.onCovered / Math.max(1e-6, r.onOpen);
  const offRatio = r.offCovered / Math.max(1e-6, r.offOpen);
  note(JSON.stringify({ ...r, onRatio: +onRatio.toFixed(3), offRatio: +offRatio.toFixed(3) }));

  check('the term is on by default', r.occlusion > 0.1, `occlusion ${r.occlusion}`);
  check('there is a frame to measure at all', r.onOpen > 8 && r.offOpen > 8,
    `open reads ${r.onOpen.toFixed(1)} / ${r.offOpen.toFixed(1)}`);
  /* THE CLAIM. A floor under a roof is darker than the same floor in
     the open. Set at three quarters: the sun is already blocked in both
     runs, so what moves here is only the ambient. */
  check('a floor under a roof is darker than the same floor outside',
    onRatio < 0.78, `covered reads ${(onRatio * 100).toFixed(0)}% of open`);
  /* And the counter-claim, without which the one above proves nothing:
     turn the term off and the two halves come back together. */
  check('and with the term off they were nearly the same',
    offRatio > 0.88, `covered was ${(offRatio * 100).toFixed(0)}% of open, so the roof already did something`);
  check('so the roof is what made the difference', onRatio < offRatio - 0.08,
    `${onRatio.toFixed(3)} vs ${offRatio.toFixed(3)}`);
  /* The sunlit yard must not pay for the interior. */
  check('the open half is left alone',
    Math.abs(r.onOpen - r.offOpen) / Math.max(1e-6, r.offOpen) < 0.06,
    `${r.offOpen.toFixed(1)} -> ${r.onOpen.toFixed(1)}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
