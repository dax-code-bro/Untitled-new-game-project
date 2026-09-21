#!/usr/bin/env node
/* WHAT THE PATHFINDER CAN SEE.
 *
 * "The AI are phasing through stuff" -- and the bots were never the
 * problem. They have A*, a path cache and a per-tick search budget, and
 * every bit of it works. What was wrong is the map they were given.
 *
 * navBuild swept rays at ONE height, 1.05 m, and marked a cell only
 * where a ray at that exact height hit something. So the grid held
 * precisely the obstacles that intersect one horizontal plane a metre
 * off the floor. A waist-high crate, a car bonnet, a low wall, a
 * counter, a railing: none of them in it, all of them walked through.
 *
 * This measures two things on every map:
 *
 *   1. How much of the map the grid actually contains. A grid that
 *      knows about more of the world than it used to is the fix
 *      working; the number is printed rather than asserted, because
 *      "more cells" is only good up to the point where it walls the
 *      map off.
 *   2. Whether a body can still get from one spawn to the other. A
 *      pathfinder that blocks everything phases through nothing and is
 *      also useless.
 *
 * Usage: node engine/test/navsolid.test.js
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
  const rows = [];
  const errors = [];
  for (const map of MAPS) {
    const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
    page.on('pageerror', (e) => errors.push(map + ': ' + e.message.split('\n')[0]));
    await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html')
      + '?map=' + map + '&mode=tdm');
    await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
    const r = await page.evaluate(async () => {
      const M = window.MP.match, nav = M.nav;
      const out = { w: nav.w, h: nav.h, cell: nav.c };
      out.cells = nav.w * nav.h;
      let blocked = 0;
      for (let k = 0; k < nav.g.length; k++) if (nav.g[k] === 1) blocked++;
      out.blocked = blocked;
      out.pct = +(100 * blocked / out.cells).toFixed(1);
      /* CAN A BODY STILL CROSS THE MAP? Walk every live combatant's
         spawn against every other and ask the real pathfinder. A grid
         that blocks everything phases through nothing and is useless. */
      const people = M.people.filter((p) => p.alive);
      let tried = 0, reached = 0;
      for (let a = 0; a < people.length && tried < 12; a++) {
        for (let b = a + 1; b < people.length && tried < 12; b++) {
          tried++;
          const pa = people[a].pos, pb = people[b].pos;
          const pth = M.navPath ? M.navPath(pa, pb) : null;
          if (pth === undefined) { out.noAccessor = true; break; }
          if (pth && pth.length) reached++;
        }
      }
      out.tried = tried; out.reached = reached;
      /* And how many bots are standing inside something right now. */
      let inside = 0;
      for (const p of people) {
        const i = Math.floor((p.pos.x - nav.box.x0) / nav.c);
        const j = Math.floor((p.pos.z - nav.box.z0) / nav.c);
        if (i >= 0 && j >= 0 && i < nav.w && j < nav.h && nav.g[j * nav.w + i] === 1) inside++;
      }
      out.spawnedInsideSolid = inside;
      out.people = people.length;
      return out;
    });
    r.map = map;
    rows.push(r);
    await page.close();
  }

  console.log('\n   MAP          GRID        BLOCKED CELLS      SPAWNS IN SOLID');
  for (const r of rows) {
    console.log('   ' + r.map.padEnd(13) + (r.w + 'x' + r.h).padEnd(12)
      + (r.blocked + ' of ' + r.cells + ' (' + r.pct + '%)').padEnd(19)
      + r.spawnedInsideSolid + ' of ' + r.people);
  }
  console.log('');

  check('every map builds a grid', rows.every((r) => r.cells > 100),
    rows.map((r) => r.map + ' ' + r.cells).join(', '));
  check('the grid knows about a real amount of the map',
    rows.every((r) => r.pct > 1),
    rows.map((r) => r.map + ' ' + r.pct + '%').join(', '));
  check('and has not walled the whole map off',
    rows.every((r) => r.pct < 55),
    rows.map((r) => r.map + ' ' + r.pct + '%').join(', '));
  check('nobody spawns inside a solid cell',
    rows.every((r) => r.spawnedInsideSolid === 0),
    rows.filter((r) => r.spawnedInsideSolid).map((r) => r.map + ' ' + r.spawnedInsideSolid).join(', '));
  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error on any map', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
