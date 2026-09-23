#!/usr/bin/env node
/* IS THE UNDERSIDE OF ANYTHING STILL A HOLE IN THE PICTURE?
 *
 * "I want brick concrete and all that to crumble realistically ... when I
 * tried the actual game out just a black blob appeared."
 *
 * The blob was not the fracture. The chunk hulls are wound correctly,
 * their normals point outward, their UVs and tangents are finite, and
 * the brick texture has no black texel anywhere in it -- all four were
 * measured before any of this was written, and all four were clean. A
 * debug-albedo probe settled it: at a black pixel the albedo read 83/2/2,
 * the same red as a lit brick two centimetres away, and the shadow map
 * said the point was LIT. Same albedo, same shadow, same roughness, a
 * different normal, and seventeen times darker.
 *
 * So it was the ambient, and specifically the ground half of it.
 * skyIrradiance treated uGroundColor as RADIANCE when it is an ALBEDO:
 * a surface facing down received a flat dark constant no matter how
 * bright the day. Measured on a concrete sphere under the default sun,
 * the top came out at 170 and the bottom at 10.
 *
 * WHY RUBBLE SHOWED IT FIRST. A wall is one big face pointing at you. A
 * shattered wall is nothing but facets pointing every way, so half of
 * every chunk faced somewhere with no light in it and the pile read as
 * one black mass. The same fault is why the underside of a stair, an
 * eave or a handguard went black -- rubble was just the loudest case.
 *
 * WHAT THIS MEASURES. A sphere per material shows every normal at once,
 * so the top and bottom of its silhouette give the sky and ground halves
 * of the irradiance with the albedo, the texture, the roughness and the
 * exposure all held identical. Two numbers per material:
 *
 *   bottom    how dark the underside is allowed to be, in sRGB
 *   top       unchanged, so this cannot be passed by turning everything up
 *
 * Plus the thing that was actually complained about: a wall shattered
 * into twenty chunks, and what fraction of the pile is near-black.
 *
 * THE SPHERES ARE MASKED BY DIFFERENCE, not by colour. An earlier cut
 * looked for "not sky and not ground" and quietly sampled the sky: it
 * reported the brightest point of a brick ball as 205/212/220, which is
 * a cloud. The frame is rendered once empty and once with the spheres in
 * it, and a pixel is on a sphere when the two differ.
 *
 * Usage: node engine/test/underside.test.js
 */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const W = 480, H = 480;

/* The engine's own presets, which is what a map actually builds with.
   Hand-rolling `{ color: 0x8c4b38, texture: 'brick' }` for a test is not
   the same material: the preset carries WHITE and lets the texture hold
   the colour, and multiplying a dark base by a dark texture made the
   first run of this measure something the game never draws. */
const MATS = ['brick', 'concrete', 'stone', 'wood'];

/* An underside on a sunlit map must clear this, in sRGB luminance. Ten
   was the measured value of black concrete before the fix; a real stone
   ball on a sunlit road sits far above it. */
const FLOOR = 24;
/* And the lit top must not have moved more than this, either way. The
   fix is to the ground half of the hemisphere and has no business
   changing what faces the sky. */
const TOP_DRIFT = 12;
/* Near-black fraction of a twenty-piece rubble pile. It was 2.5% with
   the engine's brick preset and 15.1% with a darker one; anything at or
   under this reads as broken masonry rather than as a blob. */
const PILE_DARK_MAX = 1.0;

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}
const note = (s) => console.log(`  ..   ${s}`);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" '
    + 'style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(
    path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  /* ---------- the spheres ---------- */
  const setup = await page.evaluate(({ mats, w, h }) => {
    const g = LegendEngine.create({ canvas: '#game', quality: 'high',
      preserveDrawingBuffer: true });
    window.G = g;
    /* Screen-space AO off for this half. It is a separate term with its
       own floor, measured separately below; leaving it on would mix two
       causes into one number. */
    g.renderer.quality.ssao = 0;
    g.ground({ at: [0, 0, 0], size: 90,
      material: g.material({ color: 0x6b6459, texture: 'smooth' }) });
    // High enough that the whole silhouette clears the horizon.
    g.camera.position.set(0, 7, 9);
    g.camera.target.set(0, 7, 0);
    for (let i = 0; i < 20; i++) g.step(1 / 60);
    window.GRAB = () => {
      const c = document.querySelector('#game');
      const t = document.createElement('canvas'); t.width = w; t.height = h;
      t.getContext('2d').drawImage(c, 0, 0, w, h);
      return Array.from(t.getContext('2d').getImageData(0, 0, w, h).data);
    };
    window.PUT = () => {
      /* Spaced and pulled back so every ball is WHOLE in the frame. The
         first layout ran the outer two off the edges, and a ball that is
         half off the screen has no underside to measure -- the mask found
         the edge of the picture instead. */
      const n = mats.length, span = 2.6;
      mats.forEach((m, i) => g.sphere({
        at: [(i - (n - 1) / 2) * span, 7, 0], radius: 1.1,
        material: g.material(m), static: true }));
      for (let i = 0; i < 8; i++) g.step(1 / 60);
    };
    return { sun: +g.renderer.sun.intensity.toFixed(2),
      bounce: +g.renderer.sky.bounce.toFixed(2) };
  }, { mats: MATS, w: W, h: H });
  note(`sun ${setup.sun}, ground bounce ${setup.bounce}`);

  const empty = await page.evaluate(() => window.GRAB());
  await page.evaluate(() => window.PUT());
  const full = await page.evaluate(() => window.GRAB());

  const at = (d, x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const onBall = (x, y) => {
    const a = at(empty, x, y), b = at(full, x, y);
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 14;
  };

  /* FIND THE BALLS, DO NOT PREDICT THEM. The first cut computed each
     centre from the world layout and the viewport width and missed two
     of the four outright -- and a sphere that is never found is a test
     that never runs. The mask already says where they are: walk the
     columns, and every run of columns that has any lit pixel in it is
     one ball, left to right in the order they were placed. */
  const cols = [];
  for (let x = 0; x < W; x++) {
    let any = false;
    for (let y = 10; y < H - 10 && !any; y++) if (onBall(x, y)) any = true;
    cols.push(any);
  }
  const centres = [];
  for (let x = 0; x < W; x++) {
    if (!cols[x]) continue;
    let e = x; while (e + 1 < W && cols[e + 1]) e++;
    if (e - x > 20) centres.push(Math.round((x + e) / 2));
    x = e;
  }

  const rows = [];
  MATS.forEach((m, i) => {
    const cx = centres[i];
    if (cx == null) { rows.push({ m, found: false }); return; }
    let top = -1, bot = -1;
    for (let y = 10; y < H - 10; y++) if (onBall(cx, y)) { if (top < 0) top = y; bot = y; }
    if (top < 0) { rows.push({ m, found: false }); return; }
    const span = bot - top;
    // A band across the ball rather than one pixel, so texture grain in
    // the recipe cannot decide a pass.
    const band = (f) => {
      const y = Math.round(top + span * f);
      let r = 0, g = 0, b = 0, n = 0;
      for (let dx = -10; dx <= 10; dx++) if (onBall(cx + dx, y)) {
        const c = at(full, cx + dx, y); r += c[0]; g += c[1]; b += c[2]; n++;
      }
      return n ? [r / n, g / n, b / n] : null;
    };
    rows.push({ m, found: true, span,
      top: band(0.08), bottom: band(0.92) });
  });

  check('every sphere was found', rows.every((r) => r.found),
    rows.filter((r) => !r.found).map((r) => r.m).join(', '));
  for (const r of rows) {
    if (!r.found) continue;
    note(`${r.m.padEnd(9)} top ${lum(r.top).toFixed(0).padStart(3)}`
      + `   underside ${lum(r.bottom).toFixed(0).padStart(3)}`
      + `   ratio ${(lum(r.top) / Math.max(lum(r.bottom), 0.01)).toFixed(1)}`);
  }
  const dark = rows.filter((r) => r.found && lum(r.bottom) < FLOOR);
  check(`no underside is a hole (>= ${FLOOR})`, dark.length === 0,
    dark.map((r) => `${r.m} ${lum(r.bottom).toFixed(0)}`).join(', '));

  /* The other half of the claim: the sky side did not move. Rendered
     again with the bounce at zero, which is what the ground half used to
     be, and the tops compared. */
  await page.evaluate(() => {
    for (const a of window.G.actors.slice()) if (a.name === 'sphere' || a.mesh && a.body && a.body.shape && a.boundRadius) { /* left alone */ }
    window.G.renderer.sky.bounce = 0;
    window.G.step(1 / 60); window.G.step(1 / 60);
  });
  const zeroed = await page.evaluate(() => window.GRAB());
  const tops = rows.filter((r) => r.found).map((r, i) => {
    const cx = centres[MATS.indexOf(r.m)];
    let top = -1, bot = -1;
    for (let y = 10; y < H - 10; y++) if (onBall(cx, y)) { if (top < 0) top = y; bot = y; }
    const y = Math.round(top + (bot - top) * 0.08);
    let a = [0, 0, 0], n = 0;
    for (let dx = -10; dx <= 10; dx++) if (onBall(cx + dx, y)) {
      const c = at(zeroed, cx + dx, y); a = [a[0] + c[0], a[1] + c[1], a[2] + c[2]]; n++;
    }
    void i;
    return { m: r.m, was: lum([a[0] / n, a[1] / n, a[2] / n]), now: lum(r.top) };
  });
  for (const t of tops) note(`${t.m.padEnd(9)} sky side ${t.was.toFixed(0)} -> ${t.now.toFixed(0)}`);
  const drifted = tops.filter((t) => Math.abs(t.now - t.was) > TOP_DRIFT);
  check('the sky side is where it was', drifted.length === 0,
    drifted.map((t) => `${t.m} ${t.was.toFixed(0)}->${t.now.toFixed(0)}`).join(', '));

  /* ---------- and the thing that was reported ---------- */
  const pile = await page.evaluate(async () => {
    const g = LegendEngine.create({ canvas: '#game', quality: 'high',
      preserveDrawingBuffer: true });
    window.G2 = g;
    g.ground({ at: [0, 0, 0], size: 60,
      material: g.material({ color: 0x6b6459, texture: 'smooth' }) });
    const wall = g.box({ at: [0, 1.5, 0], size: [3, 3, 0.6],
      material: g.material('brick'), static: true,
      breakable: { pieces: 20, spawnDust: false } });
    g.camera.position.set(4.2, 2.2, 7);
    g.camera.target.set(0, 1.2, 0);
    for (let i = 0; i < 20; i++) g.step(1 / 60);
    /* SEEDED. shatter gives every chunk a random tumble, so the pile
       lands differently each run and the near-black fraction wandered
       between 0.3% and 1.7% with nothing changed. A test that moves on
       its own cannot hold a number. */
    const rnd0 = Math.random;
    let seed = 20250922;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    g.shatter(wall, { point: [0, 1.5, 0], force: 1.2 });
    Math.random = rnd0;
    // Long enough for the pile to be lying on the ground, not in flight.
    for (let i = 0; i < 90; i++) g.step(1 / 60);
    const c = document.querySelector('#game');
    const t = document.createElement('canvas'); t.width = 640; t.height = 420;
    t.getContext('2d').drawImage(c, 0, 0, 640, 420);
    const d = t.getContext('2d').getImageData(0, 0, 640, 420).data;
    let n = 0, dark = 0;
    for (let y = 230; y < 340; y++) for (let x = 200; x < 460; x++) {
      const i = (y * 640 + x) * 4; n++;
      if (d[i] + d[i + 1] + d[i + 2] < 70) dark++;
    }
    return { chunks: g.actors.filter((a) => a.isChunk).length,
      darkPct: +(100 * dark / n).toFixed(2), ssao: g.renderer.quality.ssao };
  });
  note(`pile: ${pile.chunks} chunks, screen-space AO at ${pile.ssao}, `
    + `${pile.darkPct}% of it near-black`);
  check('a shattered wall is masonry, not a blob',
    pile.darkPct <= PILE_DARK_MAX, `${pile.darkPct}% > ${PILE_DARK_MAX}%`);
  check('the wall did break', pile.chunks >= 8, `${pile.chunks} chunks`);

  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
