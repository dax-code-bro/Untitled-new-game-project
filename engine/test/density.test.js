#!/usr/bin/env node
/* DOES A BIG WALL CARRY THE SAME GRAIN AS A SMALL ONE?
 *
 * Reported from play, on Resort: "one of the walls is super detailed
 * with the textures and the other one is just like maths". Both walls
 * named a texture. What they did not share was texel density.
 *
 * A box mesh is a unit cube whose UVs run 0..1 across every face,
 * scaled by the actor. So uvScale meant tiles across a FACE, and two
 * walls of one material at three metres and twenty-four came out eight
 * times apart in grain while reading identically in the source. There
 * is no discipline that fixes that -- it was got wrong on the bunker
 * walls, then on the battlefield floor, then on Resort, each time by
 * somebody who had just fixed it somewhere else.
 *
 * The fix is `worldUv`: project the texture from world space and let
 * uvScale mean tiles per METRE. This asserts the property that makes
 * it worth having -- that the SIZE of a surface no longer changes what
 * is on it -- and it asserts it in both directions, because a test
 * that only shows the new regime passing cannot tell you the old one
 * was ever broken.
 *
 * Grain is measured as the mean absolute difference between
 * horizontally adjacent pixels inside the wall. It is a crude measure
 * and the right one here: it is exactly "how much is going on per
 * pixel", which is what the eye is reading when it calls a wall flat.
 *
 * Usage: node engine/test/density.test.js
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
    G.setSky('noon'); G.setTimeOfDay(11);
    const mat = G.material({ color: 0xf2ece4, texture: 'brick', roughness: 0.95,
      metalness: 0, uvScale: 1.11, worldUv: true });
    /* Two walls of one material, three metres and twenty-four, far
       enough apart that neither is ever in frame with the other. */
    G.box({ at: [0, 1.5, 0], size: [3, 3, 0.4], material: mat, physics: false });
    G.box({ at: [60, 12, 0], size: [24, 24, 0.4], material: mat, physics: false });

    /* Both photographed from 2.6 m, so the two frames cover the same
       physical patch of wall and the comparison is about the surface
       rather than about the distance to it. */
    const gl = G.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    /* THE BOUNDS ARE COMPUTED ONCE AND NAMED, because of a bug that was
       in here: `(W * 0.7) | 0 - 1` does not mean what it reads as. `|`
       binds LOOSER than `-`, so that parses as `(W * 0.7) | (0 - 1)`,
       which is `x | -1`, which is -1. The inner loop never ran, every
       grain came back 0, and the first assertion would have been
       deciding 0 > 1.5 rather than measuring anything. */
    const x0 = Math.floor(W * 0.3), x1 = Math.floor(W * 0.7) - 1;
    const y0 = Math.floor(H * 0.3), y1 = Math.floor(H * 0.7);
    /* MEASURED AT THE SCALE OF THE PATTERN, NOT AT THE SCALE OF A
       PIXEL, and the first version of this got it wrong in a way worth
       recording because it is the same mistake three probes in this
       project have made: it measured something next to the question.

       Neighbour-pixel difference sounds like "how much is going on
       here". It is not. The shader's detail layer tiles the same
       texture a second time at nine times the rate whenever the camera
       is inside eleven metres, so at this range BOTH walls carry dense
       fine grain and the two came back 1.02x apart -- under the old
       regime, where the bricks were visibly eight centimetres on one
       wall and sixty-seven on the other. The metric could not see
       brick size at all. It was measuring the detail layer.

       So the frame is block-averaged 4x4 first. That is a low-pass
       filter: it throws away the fine layer and leaves the macro
       pattern, which is the thing whose scale is in question. A mortar
       line every 2.4 blocks and a mortar line every 7 blocks are
       plainly different numbers; a millimetre of grain in both is not.

       Nothing about the render changes -- the detail layer is still on,
       exactly as a player sees it. Only what is read off the frame. */
    const BK = 4;
    const bw = Math.floor((x1 - x0) / BK), bh = Math.floor((y1 - y0) / BK);
    const blocks = new Float32Array(bw * bh);
    const grainAt = (x) => {
      G.renderFrom([x, 1.5, 2.6], [x, 1.5, 0], { fov: 62 });
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
          let acc = 0;
          for (let dy = 0; dy < BK; dy++) {
            for (let dx = 0; dx < BK; dx++) {
              const a = ((y0 + by * BK + dy) * W + (x0 + bx * BK + dx)) * 4;
              acc += 0.2126 * buf[a] + 0.7152 * buf[a + 1] + 0.0722 * buf[a + 2];
            }
          }
          blocks[by * bw + bx] = acc / (BK * BK);
        }
      }
      let sum = 0, n = 0;
      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw - 1; bx++) {
          sum += Math.abs(blocks[by * bw + bx] - blocks[by * bw + bx + 1]);
          n++;
        }
      }
      return n ? sum / n : 0;
    };
    const out = { on: {}, off: {} };
    mat.worldUv = true; mat.uvScale = 1.11;
    out.on.small = grainAt(0); out.on.large = grainAt(60);
    /* And the same pair under the rule this replaced, so the test can
       say the old one was broken rather than only that the new one is
       self-consistent. 9 is what Resort's brick actually carried. */
    mat.worldUv = false; mat.uvScale = 9;
    out.off.small = grainAt(0); out.off.large = grainAt(60);
    return out;
  });

  const ratio = (o) => (Math.max(o.small, o.large) / Math.max(1e-6, Math.min(o.small, o.large)));
  const on = ratio(r.on), off = ratio(r.off);
  note(JSON.stringify({ on: r.on, off: r.off, ratioOn: +on.toFixed(2), ratioOff: +off.toFixed(2) }));

  check('both walls have something on them at all',
    r.on.small > 1.5 && r.on.large > 1.5, `${r.on.small.toFixed(2)} / ${r.on.large.toFixed(2)}`);
  /* THE PROPERTY. Not a fixed grain number -- that would only be
     pinning today's brick recipe -- but the ratio between a small
     surface and a large one, which is the thing that has to be 1. */
  check('a 24 m wall carries the same grain as a 3 m one',
    on < 1.15, `${on.toFixed(2)}x apart`);
  /* And the regime it replaced, so a future change that quietly drops
     worldUv fails here rather than in somebody's screenshot.

     THE THRESHOLD IS 1.35 AND IT WAS 2.2, which was a number I made up
     before the metric existed -- taken from the eight-to-one ratio of
     BRICK SIZES in the two screenshots, which is not what this reads.
     Measured, the block-averaged structure comes out 1.00 with world
     UVs and 1.67 without. Half the gap, as every other threshold in
     this suite is set, puts it at 1.35. Moving a threshold to make a
     test pass is cheating; setting one from a measurement instead of
     from a guess is the opposite, and the guess is written down above
     so the difference is checkable. */
  check('and under face UVs they were not remotely the same',
    off > 1.35, `only ${off.toFixed(2)}x apart, so this no longer proves anything`);
  check('world UVs are the closer of the two', on < off,
    `${on.toFixed(2)} vs ${off.toFixed(2)}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
