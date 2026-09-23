#!/usr/bin/env node
/* IS THERE A REFLECTION IN THIS RENDERER AT ALL?
 *
 * Asked for: "the most mesmerizing absolutely best top-tier shaders ...
 * hyper realistic, photo realistic". Of everything on that list the
 * single biggest hole is not the tonemapper and not the textures. It is
 * that NOTHING IN THIS WORLD IS VISIBLE IN ANYTHING ELSE. A chrome
 * sphere in a red room reflects the sky. A shop window on Town's high
 * street reflects the sky. A puddle reflects the sky. Every specular
 * surface in the game is showing the same analytic blue-to-grey ramp,
 * because that is literally what the shader asks for:
 *
 *     vec3 envSpec = mix(skyRadiance(R), skyIrradiance(N), rough*rough)
 *
 * skyRadiance is a gradient function of a direction. It has never heard
 * of the scene. Put a wall in front of a mirror and the mirror does not
 * know.
 *
 * WHY A RIG AND NOT A MAP VIEW. "Point the camera at something shiny in
 * Town and see if it looks reflective" is not a measurement -- it is a
 * squint. So this test builds its own room: a chrome sphere at the
 * centre, four walls in saturated red, green, blue and yellow, a white
 * floor. Those colours exist nowhere in the sky gradient. If a single
 * red pixel appears on the sphere, something in the scene reached the
 * reflection. If none does, nothing did.
 *
 * WHAT IS MEASURED, on the sphere's pixels only:
 *
 *   chroma    mean saturation. Sky is near-grey; a room of saturated
 *             walls is not.
 *   hues      how many of the four wall colours show up at all, by
 *             dominant channel. The headline number: it is 0 today and
 *             any environment probe worth having makes it 4.
 *   variance  spatial standard deviation of luminance across the
 *             sphere. A gradient is smooth; a room has edges in it.
 *
 * A RATCHET, NOT A PASS. The recorded numbers are what the renderer
 * does today and they are bad -- that is the point of recording them.
 * They may improve and may not regress.
 *
 * Usage: node engine/test/reflect.test.js
 */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* Two subjects, because roughness is the whole question. A mirror shows
   the room sharply; a satin surface shows it as coloured blur. A probe
   that only fixes mirrors has fixed almost nothing, since the measured
   roughness of an actual Town frame bottoms out at 0.31 -- there is no
   mirror anywhere in the real game. The satin row is the one that
   matters for the streets. */
const SUBJECTS = [
  { id: 'chrome', rough: 0.04, metal: 1.0 },
  { id: 'satin', rough: 0.30, metal: 1.0 },
];

/* Measured on the build this test was written against, at quality high,
   with the analytic sky as the only environment term.

     chrome (rough 0.04)   chroma 0.469   spread 1.467   walls 0/4
     satin  (rough 0.30)   chroma 0.446   spread 1.708   walls 0/4

   Zero of four, on both, with every one of the four counts reading
   0.00 per cent. A mirrored ball at the centre of a room whose walls
   are pure red, green, magenta and yellow shows not one pixel of any of
   them, while the control confirms the other three walls are in plain
   sight in the same frame at 21.5, 16.1 and 16.1 per cent. The chroma that is there is the sky's own
   blue, and a bright-quartile only 1.4x the dark quartile is the
   signature of a gradient rather than a room.

   SLACK: two consecutive runs agreed to three decimal places, so this
   rig is as deterministic as SwiftShader gets. The tolerances below are
   for a different machine, not for run-to-run noise. `hues` is an
   integer count of walls and may not fall at all. */
const BASE = {
  chrome: { chroma: 0.469, sd: 1.467, hues: 0 },
  satin: { chroma: 0.446, sd: 1.708, hues: 0 },
};

/* The baseline must exist for every subject, checked rather than
   assumed. A sibling test once kept its baselines under a stale set of
   key names; every comparison was against `undefined`, every `<` was
   false, and the ratchets all passed while measuring nothing. */
function baselineFor(id) {
  const b = BASE[id];
  if (!b || typeof b.chroma !== 'number' || typeof b.sd !== 'number'
    || typeof b.hues !== 'number') {
    throw new Error('no baseline recorded for subject ' + id);
  }
  return b;
}

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
  const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
  page.setDefaultTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  const rows = await page.evaluate((subjects) => {
    const out = [];
    for (const s of subjects) {
      const g = LegendEngine.create({ canvas: '#game', quality: 'high', preserveDrawingBuffer: true });
      /* The room. Walls at +-4 m, tall enough to fill the sphere's
         hemisphere, and matte so they contribute colour rather than
         bouncing the sky back. physics:false because nothing here
         moves and a collider would only cost time. */
      const wall = (x, z, sx, sz, color) => g.box({
        size: [sx, 6, sz], position: [x, 3, z], physics: false,
        material: { color, texture: 'smooth', roughness: 0.9, metalness: 0 },
      });
      /* NO BLUE WALL, on purpose. The sky IS blue, so a blue wall is the
         one colour a reflection could show without the scene being in it
         -- and the first run of this test duly reported "1 of 4 walls
         visible" when the four counts were 0.00, 0.00, 47.07, 0.00 and
         every one of those 47 per cent was sky. Magenta stands in: no
         sky gradient produces high red and high blue with green in the
         trough. The green wall is BEHIND the camera, which is the
         classic mirror-ball property and the strictest of the four. */
      wall(0, 4, 8, 0.2, 0xff0000);    // red     behind the ball
      wall(0, -4, 8, 0.2, 0x00ff00);   // green   behind the camera
      wall(4, 0, 0.2, 8, 0xff00ff);    // magenta right
      wall(-4, 0, 0.2, 8, 0xffff00);   // yellow  left
      g.box({
        size: [8, 0.2, 8], position: [0, -0.1, 0], physics: false,
        material: { color: 0xffffff, texture: 'smooth', roughness: 0.9, metalness: 0 },
      });
      /* NO TEXTURE ON THE BALL, deliberately. The shader resolves
         metalness as `uMetalness * mix(1.0, orm.b, 0.85)`, and the
         `smooth` recipe never sets metal, so its ORM blue is 0 --
         a material asking for metalness 1 with that texture on it
         renders at 0.15. With no maps at all uHasMaps is 0 and the
         uniforms pass through untouched, which is what a controlled
         rig needs. */
      const ball = g.sphere({
        radius: 1.1, position: [0, 1.4, 0], physics: false,
        material: { color: 0xffffff, texture: null, roughness: s.rough, metalness: s.metal },
      });

      g.camera.position.set(0, 1.6, -3.0);
      g.camera.target.set(0, 1.4, 0);
      /* Wide enough that the side walls are in shot. At 62 degrees they
         fell outside the frame, so the control could only ever
         demonstrate the red class and said nothing about whether the
         magenta and yellow branches fire at all -- which is exactly the
         gap that lets a classifier bug masquerade as "no reflection". */
      if (g.fieldOfView) g.fieldOfView(90);
      for (let i = 0; i < 24; i++) g.step(1 / 60);

      const gl = g.gl;
      const r = g.renderer || g._renderer || g;
      if (!r.gbuffer || r.hdrA.colors.length < 2) {
        out.push({ id: s.id, err: 'tier has no G-buffer to mask with' });
        continue;
      }
      const W = r.hdrA.width, H = r.hdrA.height;

      /* Half floats come back as halves -- SwiftShader will not hand an
         RGBA16F attachment over as RGBA/FLOAT -- so ask the driver which
         combination it accepts and decode whatever arrives. */
      const half = (h) => {
        const sg = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
        if (e === 0) return sg * m * 5.9604644775390625e-8;
        if (e === 31) return m ? NaN : sg * Infinity;
        return sg * Math.pow(2, e - 15) * (1 + m / 1024);
      };
      const read = (att) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, r.hdrA.handle);
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + att);
        while (gl.getError()) {}
        const fmt = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
        const typ = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
        const out4 = new Float32Array(W * H * 4);
        if (typ === gl.FLOAT) {
          gl.readPixels(0, 0, W, H, fmt, typ, out4);
        } else if (typ === gl.HALF_FLOAT) {
          const rawh = new Uint16Array(W * H * 4);
          gl.readPixels(0, 0, W, H, fmt, typ, rawh);
          for (let i = 0; i < rawh.length; i++) out4[i] = half(rawh[i]);
        } else {
          const rawb = new Uint8Array(W * H * 4);
          gl.readPixels(0, 0, W, H, fmt, typ, rawb);
          for (let i = 0; i < rawb.length; i++) out4[i] = rawb[i] / 255;
        }
        const e = gl.getError();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return e ? null : out4;
      };

      /* WHICH PIXELS ARE THE BALL -- asked of the G-buffer, not guessed.
         The first cut of this test hid the ball and diffed the frame,
         and the mask came back covering three quarters of the screen:
         hiding the ball also removes the shadow it casts, so every
         re-lit floor pixel counted as ball. The frame it then measured
         was mostly WALL, which is how a renderer with no environment
         probe at all appeared to reflect two of the four walls.

         The ball is the only metal in the rig, so attachment 1's
         metalness channel names it exactly, with no shadow in it and no
         silhouette blend. */
      const gbuf = read(1);
      const px = read(0);
      if (!gbuf || !px) { out.push({ id: s.id, err: 'could not read the scene target' }); continue; }
      const raw = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) raw[p] = gbuf[p * 4 + 3] > 0.5 ? 1 : 0;
      // Eroded by one, so an edge texel blended with the wall behind it
      // cannot contribute the very colours this test looks for.
      const mask = new Uint8Array(W * H);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const p = y * W + x;
          mask[p] = (raw[p] && raw[p-1] && raw[p+1] && raw[p-W] && raw[p+W]) ? 1 : 0;
        }
      }

      /* MEASURED BEFORE THE TONEMAPPER, on attachment 0's linear HDR.
         The mirror's job is to carry the room's radiance; the grade and
         the sRGB encode afterwards are a separate argument, already
         ratcheted by tonal.test.js. Reading linear also keeps this test
         from moving when the tonemapper is switched. */
      /* THE CONTROL. A test that reports "no wall appears in the mirror"
         is worthless until it has shown it can see a wall at all. So the
         same classifier is run over the pixels that are NOT the ball --
         the walls themselves, lit and in frame -- and those must light
         it up. If the control goes quiet the test is broken, not the
         renderer, and it says so instead of quietly reporting a triumph
         of zero.

         Green is the exception and the point: the green wall is behind
         the camera, so it CANNOT appear directly, and the control must
         read zero for it. Any green on the ball therefore came from
         behind the viewer, which no sky gradient and no screen-space
         trick can fake -- only something that has actually sampled the
         room. */
      const classify = (idx) => {
        const tally = { r: 0, g: 0, m: 0, y: 0, n: 0 };
        for (let p = 0; p < mask.length; p++) {
          if (!idx[p]) continue;
          const i = p * 4, R = px[i], G = px[i+1], B = px[i+2];
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          if (mx <= 0) continue;
          tally.n++;
          if ((mx - mn) / mx < 0.25) continue;
          if (R > G * 1.5 && R > B * 1.5) tally.r++;
          else if (G > R * 1.5 && G > B * 1.5) tally.g++;
          else if (R > B * 1.5 && G > B * 1.5) tally.y++;
          else if (R > G * 1.5 && B > G * 1.5) tally.m++;
        }
        return tally;
      };
      const notBall = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) notBall[p] = raw[p] ? 0 : 1;
      const ctl = classify(notBall);

      let n = 0, sumChroma = 0, sumL = 0;
      const lums = [];
      const hue = { r: 0, g: 0, m: 0, y: 0 };
      for (let p = 0; p < mask.length; p++) {
        if (!mask[p]) continue;
        const i = p * 4, R = px[i], G = px[i+1], B = px[i+2];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const chroma = mx ? (mx - mn) / mx : 0;
        sumChroma += chroma;
        const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        sumL += L; lums.push(L); n++;
        /* A wall colour counts only when it is unmistakably that wall:
           a clear dominant channel, not a tint. The sky's own blue is
           pale and wide, so a 25% margin keeps it out of hue.b. */
        if (chroma < 0.25) continue;
        /* Four near-disjoint classes, each needing a 1.5x margin, and
           none of which daylight can satisfy. Sky blue -- red low, green
           middling, blue high -- fails all four: not red or green for
           want of a dominant channel, not yellow because blue is not in
           the trough, not magenta because red is not in the peak. The
           margin only ever UNDER-counts a tinted reflection, which is
           the right way for a ratchet to be wrong. */
        if (R > G * 1.5 && R > B * 1.5) hue.r++;
        else if (G > R * 1.5 && G > B * 1.5) hue.g++;
        else if (R > B * 1.5 && G > B * 1.5) hue.y++;
        else if (R > G * 1.5 && B > G * 1.5) hue.m++;
      }
      if (!n) { out.push({ id: s.id, err: 'no ball pixels found' }); continue; }
      const mean = sumL / n;
      /* SPREAD AS A QUARTILE RATIO, not a standard deviation.
         The first cut used sd/mean and read 4.86 on a mirror -- not
         because the reflection was rich but because the sun's specular
         highlight on a mirror is a handful of pixels in the hundreds of
         nits against a sky in the fractions, and one blazing spot
         dominates any second moment. p75/p25 ignores it: it asks how
         far apart the bulk of the reflection is, which is what "there
         is more than one thing in this mirror" actually means. Scale
         free, so a brighter sun does not move it. */
      lums.sort((a, b) => a - b);
      const q = (f) => lums[Math.min(lums.length - 1, Math.floor(f * lums.length))];
      const p25 = q(0.25), p75 = q(0.75);
      const sd = p25 > 1e-6 ? p75 / p25 : 0;
      /* A wall "appears" when it covers at least half a per cent of the
         ball. One stray pixel is noise, not a reflection. */
      const min = n * 0.005;
      const seen = ['r', 'g', 'm', 'y'].filter((k) => hue[k] >= min);
      out.push({
        id: s.id, px: n,
        chroma: +(sumChroma / n).toFixed(3),
        mean: +mean.toFixed(3), sd: +sd.toFixed(3),
        hues: seen.length, seen: seen.join('') || '-',
        counts: ['r', 'g', 'm', 'y'].map((k) => +(100 * hue[k] / n).toFixed(2)),
        ctl: ['r', 'g', 'm', 'y'].map((k) => +(100 * ctl[k] / Math.max(1, ctl.n)).toFixed(2)),
      });
    }
    return out;
  }, SUBJECTS);

  const pad = (s, w) => String(s).padEnd(w);
  console.log('\n  ' + pad('subject', 9) + pad('px', 7) + pad('chroma', 8) + pad('mean', 7)
    + pad('sd', 7) + pad('hues', 6) + pad('seen', 6) + '  r%    g%    m%    y%');
  for (const r of rows) {
    if (r.err) { console.log('  ' + pad(r.id, 9) + r.err); continue; }
    console.log('  ' + pad(r.id, 9) + pad(r.px, 7) + pad(r.chroma.toFixed(3), 8)
      + pad(r.mean.toFixed(3), 7) + pad(r.sd.toFixed(3), 7) + pad(r.hues + '/4', 6)
      + pad(r.seen, 6) + r.counts.map((v) => pad(v.toFixed(2), 6)).join(''));
  }
  console.log('');

  /* The control first: nothing below means anything if it fails. */
  for (const r of rows) {
    if (r.err) continue;
    const [cr, cg, cm, cy] = r.ctl;
    note(`${r.id}: control, the walls seen directly -- r ${cr}%  g ${cg}%  m ${cm}%  y ${cy}%`);
    check(`${r.id}: the classifier can see every wall colour that is in plain sight`,
      cr > 1 && cm > 1 && cy > 1,
      `r ${cr} m ${cm} y ${cy} -- a class that never fires directly cannot be trusted to fire in a reflection`);
    check(`${r.id}: the wall behind the camera is not directly visible`,
      cg < 0.05, `green reads ${cg}% directly, so green on the ball would prove nothing`);
  }

  check('every subject rendered a ball to measure',
    rows.length === SUBJECTS.length && rows.every((r) => !r.err && r.px > 2000),
    JSON.stringify(rows.map((r) => r.err || r.px)));

  for (const r of rows) {
    if (r.err) continue;
    const b = baselineFor(r.id);
    check(`${r.id}: the reflection is no less colourful than it was`,
      r.chroma >= b.chroma - 0.02, `chroma ${r.chroma} vs ${b.chroma}`);
    check(`${r.id}: the reflection has no less detail in it than it did`,
      r.sd >= b.sd - 0.06, `spread ${r.sd} vs ${b.sd}`);
    check(`${r.id}: no wall that used to show up has stopped showing up`,
      r.hues >= b.hues, `hues ${r.hues}/4 vs ${b.hues}/4`);
  }

  const best = Math.max(...rows.filter((r) => !r.err).map((r) => r.hues));
  note(`walls visible in the best reflection: ${best}/4`
    + (best === 0 ? ' -- the scene does not appear in any mirror in this engine' : ''));
  const green = rows.some((r) => !r.err && r.counts[1] > 0.5);
  if (green) note('the wall BEHIND THE CAMERA is in the reflection: the probe sees the whole room');
  if (best === 4) note('all four walls reflect');

  check('no page error', errors.length === 0, errors.join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
