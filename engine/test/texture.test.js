/* What a procedural texture is allowed to do to a material's colour.
 *
 * Every surface recipe in 40-material.js writes an albedo that MULTIPLIES
 * whatever colour the material asks for. A recipe averaging 0.9 is a
 * texture; a recipe averaging 0.3 is a 70% darkening filter that every
 * material using it has to be authored around, and nobody ever is --
 * they are authored in the colour the thing actually is.
 *
 * This was found the expensive way, three times. Concrete averaged 0.15
 * and a daylit roof deck rendered as a black slab. Then fabric averaged
 * 0.36, so every garment on every zombie came out at a third of its
 * colour while bare skin (0.86) kept nearly all of its -- heads and hands
 * lit, everything below the collar a silhouette, which is what "the
 * zombies look middling" actually was. Then wood averaged 0.21 with the
 * brown baked in on top of materials that were already brown, and a
 * walnut stock came out charcoal.
 *
 * Each of those was diagnosed as a lighting problem and as a modelling
 * problem before anyone weighed the texture. So: weigh the texture. Bake
 * every recipe and assert its mean luminance sits high enough that the
 * material's colour survives it.
 *
 * Two recipes are exempt by intent and named here rather than by a
 * threshold that quietly grandfathers whatever is broken next:
 *   brick -- fired clay is a colour, the material is white, unused in
 *            Bunker Nine anyway.
 *   grass -- the grass system supplies its own per-blade colour and does
 *            not multiply a material hex through this.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..') + '/';

const EXEMPT = new Set(['brick', 'grass']);
/* `smooth` is the deliberate no-op: a flat white albedo, so a material
   asking for it gets exactly the colour it wrote down and nothing else.
   Sixty-eight materials rely on that. It is the one recipe that is
   SUPPOSED to be a blank. */
const BLANK_OK = new Set(['smooth']);
/* Below this a material's hex stops meaning anything: at 0.45 a colour
   loses a stop, which is a tuning decision someone can make deliberately.
   At 0.3 it has lost nearly two and is black in shadow whatever you do. */
const FLOOR = 0.45;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 200, height: 140 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });

  const rows = await p.evaluate(() => {
    const src = window.LegendEngine && LegendEngine.Textures;
    if (!src || !src.kinds) return { err: 'no texture bank reachable' };
    const out = [];
    for (const kind of Object.keys(src.kinds)) {
      const maps = src.generate(kind, 128);
      if (!maps || !maps.albedo) { out.push({ kind, err: 'no bake' }); continue; }
      const a = maps.albedo;
      let r = 0, gg = 0, bb = 0, ao = 0;
      const n = a.length / 4;
      for (let i = 0; i < a.length; i += 4) { r += a[i]; gg += a[i+1]; bb += a[i+2]; }
      const orm = maps.orm;
      for (let i = 0; i < orm.length; i += 4) ao += orm[i];
      r /= n * 255; gg /= n * 255; bb /= n * 255; ao /= n * 255;
      // Rec.709 luminance of the mean albedo: what the texture does to the
      // brightness of whatever colour it is handed.
      out.push({ kind, lum: +(0.2126 * r + 0.7152 * gg + 0.0722 * bb).toFixed(3),
        r: +r.toFixed(3), g: +gg.toFixed(3), b: +bb.toFixed(3), ao: +ao.toFixed(3) });
    }
    return { out };
  });

  let passed = 0, failed = 0;
  const check = (name, cond, detail) => {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
  };

  if (rows.err) {
    console.log('  FAIL ' + rows.err);
    await b.close(); process.exit(1);
  }
  const list = rows.out;
  console.log('   texture       mean albedo   R     G     B     AO');
  for (const t of list) {
    if (t.err) { console.log('   ' + t.kind.padEnd(13) + t.err); continue; }
    console.log('   ' + t.kind.padEnd(13) + String(t.lum).padStart(6)
      + String(t.r).padStart(7) + String(t.g).padStart(6) + String(t.b).padStart(6)
      + String(t.ao).padStart(7) + (EXEMPT.has(t.kind) ? '   (exempt)' : ''));
  }
  console.log('');

  check('every recipe baked', list.length > 8 && list.every((t) => !t.err),
    list.filter((t) => t.err).map((t) => t.kind).join(', '));

  const dark = list.filter((t) => !t.err && !EXEMPT.has(t.kind) && t.lum < FLOOR);
  check('no texture eats the colour it is handed',
    dark.length === 0,
    dark.map((t) => t.kind + ' averages ' + t.lum + ', below ' + FLOOR).join('; '));

  /* And the other end: a recipe averaging near 1 with no variation is not
     a texture either, it is a blank. Every one of these has to actually
     vary or the surface reads as plastic. */
  const flat = list.filter((t) => !t.err && !BLANK_OK.has(t.kind)
    && Math.max(t.r, t.g, t.b) > 0.995);
  check('no texture is a flat white blank', flat.length === 0,
    flat.map((t) => t.kind).join(', '));

  const real = errs.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('nothing threw', real.length === 0, real.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
