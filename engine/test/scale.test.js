#!/usr/bin/env node
/* IS ANY PART THE WRONG SIZE FOR THE GUN IT IS ON?
 *
 * Nothing asked. attached.test.js asks whether a piece is connected to
 * the rest; winding.test.js asks whether it is inside out; sights,
 * grip, roster and the rest ask about particular parts of particular
 * weapons. A part can pass every one of them and be nine times the size
 * it should be, and one was: svcBolt took its radius from the
 * receiver's outside height, which is right for every entry in the
 * table except the one whose `rec` is the face of a riot shield. That
 * weapon was issued a bolt 270 mm across. It never showed as a floating
 * cluster, because a part that big intersects something wherever you
 * put it.
 *
 * HOW TO KNOW WHAT SIZE IS RIGHT, without a table of expectations that
 * would go stale the first time a weapon was added. Ask the family. The
 * service weapons are built by shared code into named channels -- steel,
 * wood, mag, bolt -- so the same channel on fifty weapons is the same
 * builder fifty times. Take the median size of a channel across the
 * rack and flag the weapon that is a multiple of it. No numbers are
 * authored, nothing needs updating when a gun is added, and the thing
 * it detects is precisely the failure mode of shared code: one entry
 * whose inputs mean something different.
 *
 * The threshold is deliberately loose. A rack that runs from a
 * derringer to a machine gun has real variation in it, and this is not
 * a style check -- it is looking for the part that is wrong by an order
 * of magnitude, not the one that is a third larger than its cousins.
 *
 * VALIDATED BY PUTTING THE BUG BACK: restoring svcBolt's radius to
 * R.up * 0.52 takes the riot shield's bolt from 3.6 cm to 27 and this
 * fails by name, with the multiple in the message.
 *
 * Usage: node engine/test/scale.test.js
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
  const page = await browser.newPage({ viewport: { width: 200, height: 140 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const G = LE.create({ canvas: '#game', quality: 'low', gravity: 0 });
    const kinds = G.serviceArmKinds();
    const out = { built: 0, rows: [], err: null };
    for (const kind of kinds) {
      let arm = null;
      try { arm = G.serviceArm(kind, { at: [0, -90, 0], physics: false }); } catch (e) { continue; }
      if (!arm) continue;
      out.built++;
      const parts = [['(root)', arm]];
      for (const nm of arm.partNames || []) if (arm[nm]) parts.push([nm, arm[nm]]);
      for (const [nm, a] of parts) {
        const geo = a.mesh && a.mesh.__key && G._geoByKey ? G._geoByKey.get(a.mesh.__key) : null;
        if (!geo || !geo.positions || !geo.positions.length) continue;
        const P = geo.positions;
        let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
        for (let i = 0; i < P.length; i += 3) {
          for (let k = 0; k < 3; k++) {
            if (P[i + k] < lo[k]) lo[k] = P[i + k];
            if (P[i + k] > hi[k]) hi[k] = P[i + k];
          }
        }
        /* THE CROSS-SECTION, not the length. A channel's LENGTH varies
           honestly across a rack -- an MG 42's barrel really is three
           times a Skorpion's -- but how FAT a part is does not, because
           it is set by the cartridge and the hand. Measuring the
           cross-section is what makes one threshold work for a rack
           this varied. */
        out.rows.push({ kind, part: nm,
          girth: +Math.max(hi[1] - lo[1], hi[2] - lo[2]).toFixed(4),
          len: +(hi[0] - lo[0]).toFixed(4) });
      }
      try { for (const [, a] of parts) a.destroy(); } catch (e) { void e; }
    }
    return out;
  });

  check('the whole rack builds', r.built > 20, `${r.built} weapons`);
  check('and every one of them has parts to measure', r.rows.length > 100,
    `${r.rows.length} parts`);

  /* Group by channel and take the median. The median rather than the
     mean because one part 9x too big drags a mean towards itself and
     then fails to look like an outlier against it -- which is how a
     bad part hides in its own statistics. */
  const byPart = {};
  for (const row of r.rows) (byPart[row.part] || (byPart[row.part] = [])).push(row);
  const MULT = 4;
  const bad = [];
  const lines = [];
  for (const part of Object.keys(byPart).sort()) {
    const rows = byPart[part];
    if (rows.length < 5) continue;          // too few to have a family
    /* NOT THE ROOT. The premise here is that a named channel is the
       same shared builder on every weapon, and `(root)` is the opposite
       of that -- it is where each weapon's own bespoke body lands. The
       first run flagged the crossbow at 594 mm and the riot shield at
       525 against a 109 mm median, and both are correct: a crossbow's
       limbs really are that wide and a shield really is that tall. A
       check that calls those faults would be trained away within a
       week. The channels that ARE shared are tight -- of the thirteen
       below, eleven have their widest member inside 1.7x the median --
       which is what makes one loose threshold work across a rack that
       runs from a derringer to a machine gun. */
    if (part === '(root)') continue;
    const g = rows.map((x) => x.girth).sort((a, b) => a - b);
    const med = g[Math.floor(g.length / 2)];
    if (med <= 0) continue;
    const worst = rows.reduce((a, b) => (b.girth > a.girth ? b : a), rows[0]);
    lines.push(`${part}: median ${(med * 1000).toFixed(0)} mm across `
      + `${rows.length} weapons, widest ${worst.kind} ${(worst.girth * 1000).toFixed(0)} mm `
      + `(x${(worst.girth / med).toFixed(1)})`);
    for (const x of rows) {
      if (x.girth > med * MULT) bad.push({ ...x, med, mult: x.girth / med });
    }
  }
  for (const l of lines) note(l);

  bad.sort((a, b) => b.mult - a.mult);
  check(`no part is more than ${MULT}x the median girth of its own channel`,
    bad.length === 0,
    bad.slice(0, 6).map((x) => `${x.kind}.${x.part} ${(x.girth * 1000).toFixed(0)}mm `
      + `vs ${(x.med * 1000).toFixed(0)}mm median (x${x.mult.toFixed(1)})`).join(', '));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
