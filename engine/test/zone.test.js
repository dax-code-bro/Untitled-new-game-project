#!/usr/bin/env node
/* THE PILLARS ARE GONE. WHAT STOPS YOU NOW?
 *
 * Reported: "every single map just has this weird little barrier thing
 * and these weird randomly placed objects", with the fix named in the
 * same breath -- a blinking red skull, a countdown from ten, and you
 * die if you do not come back.
 *
 * Every map built three or four solid nine-metre slabs round its edge.
 * They are scenery now, so the horizon still reads as enclosed and
 * nothing physically stops you leaving. That only works if the clock
 * actually runs and actually kills, so that is what this measures --
 * on all four maps, because a zone that is missing from one map is a
 * map you can walk out of for ever.
 *
 * AND ON BOTS TOO. A boundary only the player obeys is a boundary that
 * makes the bots look like they are cheating.
 *
 * Usage: node engine/test/zone.test.js
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MAPS = ['town', 'helipad', 'resort', 'demolition'];

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
  const rows = [], errors = [];
  for (const map of MAPS) {
    const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
    page.on('pageerror', (e) => errors.push(map + ': ' + e.message.split('\n')[0]));
    await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html')
      + '?map=' + map + '&mode=tdm');
    await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
    const r = await page.evaluate(async () => {
      const M = window.MP.match;
      const out = { zone: !!(M.map && M.map.zone), grace: M.ZONE_GRACE };
      if (!out.zone) return out;
      const z = M.map.zone;
      out.box = [z.x0, z.x1, z.z0, z.z1];

      /* NOTHING SOLID WHERE THE WALLS USED TO BE. Fired straight out
         through the old wall line at head height: if a ray still hits
         something named 'edge' or 'hoarding', a pillar survived. */
      const hits = [];
      const probe = (ox, oz, dx, dz) => {
        const h = M.game.raycast([ox, 1.2, oz], [dx, 0, dz], 30,
          (b) => b && !b.isTrigger);
        if (h && h.actor && /edge|hoarding/.test(h.actor.name || '')) hits.push(h.actor.name);
      };
      for (let t = -0.8; t <= 0.8; t += 0.4) {
        probe(z.x1 * t, z.z1 - 6, 0, 1);
        probe(z.x1 * t, z.z0 + 6, 0, -1);
        probe(z.x1 - 6, z.z1 * t, 1, 0);
        probe(z.x0 + 6, z.z1 * t, -1, 0);
      }
      out.walls = hits.length;

      /* THE CLOCK, ISOLATED FROM THE MAP.
       *
       * The first two versions of this held a live combatant outside the
       * line and waited for the zone to kill him. It kept killing him
       * early -- 6.5 s, then 3.5 s -- and the reason was never the zone:
       * outside the line there is a drop, and the out-of-the-world check
       * got him first. Pinning his position did not help, because the
       * body under him keeps falling whatever the record says.
       *
       * Measuring a fall and calling it a countdown is worse than not
       * measuring. So the three claims are checked separately and none
       * of them needs the body to survive anything:
       *
       *   the geometry  outsideBy is a pure function of a point
       *   the clock     zoneLeft falls while outside, over a few frames
       *   the kill      a body with a hair left on the clock dies on the
       *                 next tick, and dies OF THE ZONE
       */
      out.insideProbe = M.outsideBy({ x: 0, y: 1, z: 0 });
      out.outProbe = M.outsideBy({ x: z.x1 + 14, y: 1, z: 0 });
      out.cornerProbe = M.outsideBy({ x: z.x1 + 3, y: 1, z: z.z1 + 9 });

      const p = M.people.find((q) => q.alive) || M.people[0];
      p.alive = true; p.hp = 1000;
      p.pos.x = z.x1 + 14; p.pos.z = 0;
      const t1 = p.zoneLeft;
      M.update(1 / 30);
      const t2 = p.zoneLeft;
      p.pos.x = z.x1 + 14; p.pos.z = 0;
      M.update(1 / 30);
      out.started = t2 > 0 && t2 <= M.ZONE_GRACE + 1e-6;
      out.counting = p.alive ? (p.zoneLeft < t2) : true;
      out.startedAt = t2;
      void t1;

      /* One hair left, one tick, dead -- and dead with the four second
         floor under the respawn, which is how we know it was the zone
         and not the drop. */
      p.alive = true; p.hp = 1000;
      p.pos.x = z.x1 + 14; p.pos.z = 0;
      p.zoneLeft = 0.01;
      const dBefore = p.deaths;
      M.update(1 / 30);
      out.killed = !p.alive;
      out.counted = p.deaths > dBefore;
      out.respawnIn = +(p.respawnAt - M.time).toFixed(2);

      /* And stepping back in clears it, so touching the edge costs
         nothing. */
      p.alive = true; p.hp = 1000; p.zoneLeft = 5;
      p.pos.x = 0; p.pos.z = 0;
      M.update(1 / 30);
      out.clearedInside = p.zoneLeft;
      return out;
    });
    r.map = map;
    rows.push(r);
    await page.close();
  }

  check('every map declares a combat zone', rows.every((r) => r.zone),
    rows.filter((r) => !r.zone).map((r) => r.map).join(', '));

  const walled = rows.filter((r) => r.walls > 0);
  note('boundary slabs still solid: ' + (walled.length
    ? walled.map((r) => `${r.map} ${r.walls}`).join(', ') : 'none on any map'));
  check('the pillars are gone', walled.length === 0,
    walled.map((r) => `${r.map} ${r.walls}`).join(', '));

  for (const r of rows) {
    note(`${r.map}: inside reads ${r.insideProbe}, 14 m out reads `
      + `${r.outProbe.toFixed(0)}, a corner reads ${r.cornerProbe.toFixed(0)}`);
  }
  check("inside the zone measures as inside", rows.every((r) => r.insideProbe === 0),
    rows.map((r) => `${r.map} ${r.insideProbe}`).join(", "));
  check("outside measures as the distance you are out",
    rows.every((r) => Math.abs(r.outProbe - 14) < 0.01),
    rows.map((r) => `${r.map} ${r.outProbe}`).join(", "));
  check("and a corner is as far out as it looks, not the sum of two sides",
    rows.every((r) => Math.abs(r.cornerProbe - 9) < 0.01),
    rows.map((r) => `${r.map} ${r.cornerProbe}`).join(", "));

  check("the clock starts at ten the moment you step out",
    rows.every((r) => r.started && Math.abs(r.startedAt - r.grace) < 0.2),
    rows.map((r) => `${r.map} ${r.startedAt}`).join(", "));
  check("and it counts down", rows.every((r) => r.counting),
    rows.filter((r) => !r.counting).map((r) => r.map).join(", "));
  check("at zero it kills you", rows.every((r) => r.killed),
    rows.filter((r) => !r.killed).map((r) => r.map).join(", "));
  check("and the death counts against you", rows.every((r) => r.counted),
    rows.filter((r) => !r.counted).map((r) => r.map).join(", "));
  check("you cannot respawn for four seconds",
    rows.every((r) => r.respawnIn >= 3.9),
    rows.map((r) => `${r.map} ${r.respawnIn}`).join(", "));
  check("stepping back inside clears the clock",
    rows.every((r) => r.clearedInside === 0),
    rows.map((r) => `${r.map} ${r.clearedInside}`).join(", "));

  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error on any map', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
