#!/usr/bin/env node
/* DOES THE PICTURE HAVE A TONAL RANGE, OR IS IT ALL ONE GREY?
 *
 * Asked for: "the most mesmerizing absolutely best top-tier shaders ...
 * hyper realistic, photo realistic". Before adding a single effect the
 * first question is what the renderer is actually producing, and the
 * answer was not what it looks like from the feature list.
 *
 * Measured on Town's high street at quality high, a daylit outdoor
 * scene with two-cascade 4096 shadows enabled and SSAO on:
 *
 *     mean luminance 177 of 255
 *     pixels below 32:  0.0 per cent
 *     pixels above 224: 0.1 per cent
 *     pixels in 160-223: 76 per cent
 *
 * Three quarters of every frame inside two adjacent brightness bands,
 * no blacks at all and no highlights at all. That is why the street
 * reads as having no shadows on it: the shadows ARE being drawn, and
 * nothing in the frame is permitted to get dark enough to see them. A
 * photograph of a sunlit street has deep shade under the eaves and
 * specular glare off the glass, and the histogram says this has
 * neither.
 *
 * ATTRIBUTED, by turning each suspect off in turn rather than guessing:
 *
 *     fog off              mean 177 -> 172, and 9.4% of the frame drops
 *                          below 64 -- the fog is washing the distance
 *     exposure x0.55       mean 177 -> 147
 *     ground bounce 0      mean 177 -> 170
 *     SSAO floor 0         mean 177 -> 177   (nothing: not the cause)
 *     contrast 1.35        mean 177 -> 195   WORSE, because the grade
 *                          runs after the sRGB encode, so raising
 *                          contrast about 0.5 pushes everything above
 *                          mid grey further up
 *
 * That last line is the trap this test exists to stop somebody falling
 * into. The fix for a flat picture is NOT more contrast in the grade;
 * it is a tonemapper with a real toe, working in linear light before
 * the encode. Cranking the grade makes the number look better on a
 * mean and makes the picture worse.
 *
 * A RATCHET, NOT A PASS. The numbers below are what the renderer does
 * today. Shadow depth and highlight presence may only go UP, and the
 * mid-band pile-up may only go DOWN. Nothing here says the current
 * numbers are good -- they are bad, which is the point of recording
 * them.
 *
 * Usage: node engine/test/tonal.test.js
 */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* Four views chosen to span what the renderer has to do: a bright
   exterior with a lot of sky, an interior lit only by bounce, a metal
   subject against the sky, and a mixed-roughness rubble field. */
const VIEWS = [
  { id: 'town-street', map: 'town', eye: [0, 3.0, -26], at: [0, 2.2, 10], fov: 62 },
  { id: 'town-inside', map: 'town', eye: [-24, 1.7, 7], at: [-30, 1.6, 9], fov: 70 },
  { id: 'demo-crane', map: 'demolition', eye: [48, 8.0, 22], at: [34, 16.0, 2], fov: 62 },
  { id: 'demo-rubble', map: 'demolition', eye: [-2, 2.2, -24], at: [-8, 2.0, -4], fov: 66 },
];

/* Measured on the build this test was written against, at quality high.
   Shade and highlights may only go up; the mid pile-up may only go down.

   READ THESE FOUR ROWS TOGETHER, because they say something the single
   worst number does not. The renderer is not uniformly flat -- it fails
   at BOTH ENDS, in opposite directions, depending on where you stand:

     town-street  mean 177, 75% of the frame in two mid-bright bands.
                  A sunlit street with no shade and no glare.
     town-inside  mean 71, 62% of the frame below 64. The same renderer,
                  indoors, crushing everything to near-black.
     demo-crane   mean 148, 6.5% shade, 2.7% glare -- red steel against
                  sky is the ONE view that already reads photographic.
     demo-rubble  mean 130, 23% shade, no glare at all.

   Washed out in the open and crushed indoors is the exact signature of
   two missing things rather than one: a tonemapper with a real curve
   (nothing is shaping the top end, so the street piles up under white)
   and real image-based lighting (the ambient is an analytic sky that a
   roof simply blocks, so an interior gets almost nothing). Cranking the
   grade cannot fix both ends at once -- whichever way it is pushed, one
   of these two views gets worse. That is why the fix is a tonemapper
   and a probe, not a contrast slider.

   SLACK: SwiftShader rounds differently run to run and the renderer
   dithers. Repeated runs of these four views move by about 0.3 points,
   so the ratchet allows 0.8 on the two that must not fall and 1.5 on
   the one that must not rise. */
const BASE = {
  'town-street': { dark: 1.3, bright: 0.4, mid: 74.7 },
  'town-inside': { dark: 62.4, bright: 0.0, mid: 1.2 },
  'demo-crane': { dark: 6.5, bright: 2.7, mid: 48.1 },
  'demo-rubble': { dark: 22.7, bright: 0.0, mid: 50.2 },
};

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
  const page = await browser.newPage({ viewport: { width: 420, height: 260 } });
  page.setDefaultTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/mp-maps.js'), 'utf8') });

  const rows = await page.evaluate((views) => {
    const out = [];
    let built = null, g = null;
    for (const v of views) {
      if (built !== v.map) {
        g = LegendEngine.create({ canvas: '#game', quality: 'high', preserveDrawingBuffer: true });
        window.G = g;
        MP_MAPS.build(g, v.map);
        built = v.map;
      }
      g.camera.position.set(v.eye[0], v.eye[1], v.eye[2]);
      g.camera.target.set(v.at[0], v.at[1], v.at[2]);
      if (g.fieldOfView) g.fieldOfView(v.fov);
      /* Enough frames for anything temporal to settle. A one-frame read
         of a renderer with history buffers measures its worst frame. */
      for (let i = 0; i < 24; i++) g.step(1 / 60);

      const c = g.canvas, gl = g.gl;
      const px = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const hist = new Array(8).fill(0);
      let sum = 0;
      const n = c.width * c.height;
      for (let i = 0; i < px.length; i += 4) {
        const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        sum += l;
        hist[Math.min(7, Math.floor(l / 32))]++;
      }
      const pc = hist.map((h) => +(100 * h / n).toFixed(1));
      out.push({
        id: v.id,
        mean: +(sum / n).toFixed(1),
        hist: pc,
        /* Real shade, real glare, and how much of the frame is piled
           into the two mid-bright bands that flatness lives in. */
        dark: +(pc[0] + pc[1]).toFixed(1),
        bright: +(pc[7]).toFixed(1),
        mid: +(pc[5] + pc[6]).toFixed(1),
      });
    }
    return out;
  }, VIEWS);

  console.log('   view          mean   <64    >224   160-223   histogram by 32s');
  for (const r of rows) {
    console.log('   ' + r.id.padEnd(14) + String(r.mean).padEnd(7)
      + String(r.dark).padEnd(7) + String(r.bright).padEnd(7)
      + String(r.mid).padEnd(10) + r.hist.map((v) => String(v).padStart(6)).join(''));
  }

  check('every view was measured', rows.length === VIEWS.length,
    `${rows.length}/${VIEWS.length}`);

  /* THE THREE RATCHETS. Each is allowed a little slack for the
     renderer's own dither and for SwiftShader's rounding, and no more. */
  const worseDark = rows.filter((r) => r.dark < (BASE[r.id] || {}).dark - 0.8);
  check('no view lost shade it used to have', worseDark.length === 0,
    worseDark.map((r) => `${r.id} ${r.dark}% vs ${BASE[r.id].dark}%`).join(', '));

  const worseBright = rows.filter((r) => r.bright < (BASE[r.id] || {}).bright - 0.8);
  check('no view lost highlights it used to have', worseBright.length === 0,
    worseBright.map((r) => `${r.id} ${r.bright}% vs ${BASE[r.id].bright}%`).join(', '));

  const worseMid = rows.filter((r) => r.mid > (BASE[r.id] || {}).mid + 1.5);
  check('no view got flatter', worseMid.length === 0,
    worseMid.map((r) => `${r.id} ${r.mid}% vs ${BASE[r.id].mid}%`).join(', '));

  /* A SECOND RATCHET, ON THE CRUSHED END. town-inside is 62% below 64:
     an interior lit by bounce alone, going to mud. It must not get
     muddier, and unlike the others the number that must not RISE is its
     shade. */
  const inside = rows.find((r) => r.id === 'town-inside');
  if (inside) {
    check('the interior did not crush any further',
      inside.dark <= BASE['town-inside'].dark + 1.5,
      `${inside.dark}% below 64, was ${BASE['town-inside'].dark}%`);
  }

  /* AND WHAT GOOD WOULD LOOK LIKE, stated so the gap is on the record
     rather than implied. A photograph of a sunlit street puts a few per
     cent of its pixels in real shade and a few tenths in specular
     glare. Only demo-crane manages it today; the other three are the
     target the shader work is aiming at, printed every run. */
  const goal = rows.filter((r) => r.dark >= 3 && r.bright >= 0.2 && r.mid <= 55);
  note(`views that read as photographic (>=3% shade, >=0.2% glare, <=55% mid): `
    + `${goal.length}/${rows.length}`
    + (goal.length ? ' -- ' + goal.map((r) => r.id).join(', ') : ''));

  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
