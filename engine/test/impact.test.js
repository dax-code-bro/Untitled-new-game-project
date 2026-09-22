#!/usr/bin/env node
/* DOES A BULLET KNOW WHAT IT HIT?
 *
 * Reported: "whenever you shoot at mud there should be like wet
 * sprinkles of mud drifting out and dust should come off if you shoot
 * concrete -- very realistic is what I'm meaning here".
 *
 * It did not know. impactOf reads the WEAPON -- a fifty calibre throws
 * more than a pistol, which is right -- and nothing anywhere read the
 * surface, so a round into a flowerbed and a round into a concrete
 * pillar were the same grey puff at different sizes.
 *
 * WHAT A SURFACE HAS TO DECIDE, and what this checks:
 *
 *   colour   mud is dark brown, concrete is pale grey, and each fades
 *            toward a darker shade of ITSELF rather than toward one
 *            shared default -- which is most of why they all looked
 *            alike whatever the start colour was set to.
 *   fall     the difference between dust and sprinkles is almost
 *            entirely this. Dust hangs; mud drops.
 *   spark    there is nothing in a puddle to strike and a great deal
 *            in a steel container.
 *
 * AND THE ENGINE HAS TO HONOUR IT. dust() had gravity hardcoded at
 * -0.7, so every caller got a light haze whatever it asked for. A table
 * of materials feeding an emitter that ignores it is a table nobody
 * reads, which is the same fault as the gun levels.
 *
 * Usage: node engine/test/impact.test.js
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
  const page = await browser.newPage({ viewport: { width: 240, height: 150 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/mp-decals.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const DEC = window.MP_DECALS;
    const out = { surf: {}, named: {} };
    for (const k of ['concrete', 'mud', 'metal', 'water', 'wood']) {
      const s = DEC.SURFACE[k];
      out.surf[k] = s ? { tint: s.tint, tintEnd: s.tintEnd, fall: s.fall,
        spark: s.spark, dust: s.dust } : null;
    }
    /* The matching, on the names the map builders actually use. */
    for (const nm of ['concrete-pillar', 'mud-bank', 'steel-container',
      'plank-run', 'pool-edge', 'brick-back', 'nothing-in-particular']) {
      out.named[nm] = DEC.surfaceOf({ name: nm });
    }
    out.plainTint = DEC.surfaceOf({ name: 'nothing-in-particular' }).tint;

    /* AND THE EMITTER. A fake particle system, so what the surface
       asked for can be read back instead of inferred from pixels. */
    const seen = [];
    const g = LegendEngine.create({ canvas: '#game', quality: 'low' });
    const realSpawn = g.particles.spawn.bind(g.particles);
    g.particles.spawn = function (o) { seen.push({ g: o.gravity, c: o.color, l: o.life }); return realSpawn(o); };
    g.particles.dust([0, 1, 0], { count: 6, color: 0x4a3524, gravity: 2.4, life: 0.45 });
    out.wetG = seen.length ? seen[0].g : null;
    seen.length = 0;
    g.particles.dust([0, 1, 0], { count: 6, color: 0x9d9a92, gravity: 0.35 });
    out.dryG = seen.length ? seen[0].g : null;
    seen.length = 0;
    g.particles.dust([0, 1, 0], { count: 6 });
    out.defaultG = seen.length ? seen[0].g : null;
    return out;
  });

  check('the surface table is exported', Object.values(r.surf).every((s) => s),
    Object.keys(r.surf).filter((k) => !r.surf[k]).join(', '));

  const mud = r.surf.mud, con = r.surf.concrete;
  note(`mud: tint ${mud.tint.toString(16)}, falls at ${mud.fall}, spark ${mud.spark}`);
  note(`concrete: tint ${con.tint.toString(16)}, falls at ${con.fall}, spark ${con.spark}`);

  /* MUD IS DARK, CONCRETE IS PALE -- measured as luminance rather than
     asserted as a hex value, so re-tuning the colours does not break
     the claim being made about them. */
  const lum = (c) => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255)
    + 0.0722 * (c & 255));
  check('mud throws something dark and concrete something pale',
    lum(mud.tint) < 80 && lum(con.tint) > 130,
    `mud ${lum(mud.tint).toFixed(0)}, concrete ${lum(con.tint).toFixed(0)}`);
  check('and each fades toward itself, not toward one shared grey',
    lum(mud.tintEnd) < lum(con.tintEnd),
    `${lum(mud.tintEnd).toFixed(0)} vs ${lum(con.tintEnd).toFixed(0)}`);

  check('mud drops and concrete hangs', mud.fall > con.fall * 4,
    `${mud.fall} vs ${con.fall}`);
  check('nothing sparks off mud or water',
    r.surf.mud.spark === 0 && r.surf.water.spark === 0,
    `${r.surf.mud.spark}, ${r.surf.water.spark}`);
  check('and a great deal sparks off metal', r.surf.metal.spark > 2,
    `${r.surf.metal.spark}`);

  /* THE NAMES THE MAPS ACTUALLY USE. */
  const nm = r.named;
  check('a concrete pillar reads as concrete', nm['concrete-pillar'].tint === con.tint);
  check('a mud bank reads as mud', nm['mud-bank'].tint === mud.tint);
  check('a steel container reads as metal', nm['steel-container'].tint === r.surf.metal.tint);
  check('a plank reads as wood', nm['plank-run'].tint === r.surf.wood.tint);
  check('a pool edge reads as water', nm['pool-edge'].tint === r.surf.water.tint);
  check('and anything unrecognised falls back to the old grey',
    nm['nothing-in-particular'].tint === r.plainTint);

  /* THE EMITTER HONOURS IT. */
  note(`dust gravity: ${r.defaultG} by default, ${r.dryG} for concrete, ${r.wetG} for mud`);
  check('the emitter takes the gravity it is given',
    r.wetG === -2.4 && r.dryG === -0.35,
    `${r.wetG}, ${r.dryG}`);
  check('and still defaults to what it always did',
    r.defaultG === -0.7, `${r.defaultG}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
