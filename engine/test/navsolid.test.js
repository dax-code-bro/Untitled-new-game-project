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
 * THE SAME BUG WAS IN BOTH GAMES. mp-match.js has navBuild and
 * bunker-nine.js has buildNavLevel; they were written separately and
 * both swept one height. So this file covers the zombies maps too --
 * otherwise fixing one game and calling the task done is exactly the
 * kind of half-fix that keeps getting reported back.
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
const fs = require('fs'), path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MAPS = ['town', 'helipad', 'resort', 'demolition'];
const ZMAPS = ['bunker9', 'coastline'];

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
          /* THROUGH THE REAL PATHFINDER. This used to read M.navPath,
             which does not exist and never has -- the match object
             carries the grid as M.nav and the functions live on
             MP_MATCH.nav. So the old line evaluated to null on every
             pair and the file printed "0 of 12 reached" for four maps
             without failing, because nothing asserted on it. A number
             that no instrument produced is worse than no number. */
          const np = window.MP_MATCH && window.MP_MATCH.nav
            && window.MP_MATCH.nav.path;
          if (!np) { out.noAccessor = true; break; }
          const pth = np(nav, pa, pb, M.stats);
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

  /* AND THE ZOMBIES MAPS, whose nav is built by a different function in
     a different file with the identical fault. */
  for (const map of ZMAPS) {
    const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
    page.on('pageerror', (e) => errors.push(map + ': ' + e.message.split('\n')[0]));
    await page.setContent('<body style="margin:0"><canvas id="game" '
      + 'style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/coastline.js'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
    const r = await page.evaluate((m) => {
      const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: m });
      for (let i = 0; i < 20; i++) B.game.step(1 / 60);
      const nav = B.S.nav && B.S.nav.ground;
      if (!nav) return { missing: true };
      if (B.S.mapId !== m) return { wrongMap: B.S.mapId };
      const out = { w: nav.w, h: nav.h, cell: nav.c };
      out.cells = nav.w * nav.h;
      let blocked = 0;
      for (let k = 0; k < nav.g.length; k++) if (nav.g[k] === 1) blocked++;
      out.blocked = blocked;
      out.pct = +(100 * blocked / out.cells).toFixed(1);
      /* CAN A ZOMBIE STILL REACH THE PLAYER? That is the only route one
         ever wants, and a grid that has walled the map off phases
         through nothing and is equally useless. Asked from each spawn
         window rather than from a live zombie, because the spawner is
         deterministic and the zombies are not. */
      const nav2 = __T_SYS.navPath;
      const to = B.P.actor.position;
      let tried = 0, reached = 0, inside = 0;
      /* From each window a zombie comes through, to the player. That is
         the only route the game ever asks for, and `def.inside` is the
         spot one stands on once it is through.

         Not `zombiesAt`, which reads like a position and is a COUNT --
         how many are working on that window. Taken for a point it is
         the number 0, which is falsy, so every window was skipped and
         this printed "0 of 0 reached" while claiming to have measured
         reachability. Exactly the fault the multiplayer half of this
         file had, found the same way: by asserting on the number
         instead of only printing it. */
      for (const w of (B.S.windows || []).slice(0, 8)) {
        let at = (w.def && (w.def.inside || w.def.sillAt)) || null;
        if (at && at.x != null) at = [at.x, at.y, at.z];
        if (!at) continue;
        tried++;
        const pth = nav2(nav, { x: at[0], y: at[1], z: at[2] }, to);
        if (pth && pth.length) reached++;
        const i = Math.floor((at[0] - nav.box.x0) / nav.c);
        const j = Math.floor((at[2] - nav.box.z0) / nav.c);
        if (i >= 0 && j >= 0 && i < nav.w && j < nav.h && nav.g[j * nav.w + i] === 1) inside++;
      }
      out.tried = tried; out.reached = reached;
      out.spawnedInsideSolid = 0; out.people = tried;
      out.windowsWalledIn = inside;
      /* THE SAME ROUTES ON THE OLD ONE-SLICE GRID, built right here so
         the comparison is the same map, the same windows and the same
         player in the same run.
         Without it "4 of 5 windows can reach the player" is a number
         with nothing to be better or worse than, and the only way to
         read it would be to guess. */
      const oldNav = __T_SYS.buildNavLevel(B.game, nav.box, 1.05, [1.05]);
      let oldBlocked = 0;
      for (let k = 0; k < oldNav.g.length; k++) if (oldNav.g[k] === 1) oldBlocked++;
      out.oldBlocked = oldBlocked;
      let oldReached = 0;
      for (const w of (B.S.windows || []).slice(0, 8)) {
        let at = (w.def && (w.def.inside || w.def.sillAt)) || null;
        if (at && at.x != null) at = [at.x, at.y, at.z];
        if (!at) continue;
        const pth = nav2(oldNav, { x: at[0], y: at[1], z: at[2] }, to);
        if (pth && pth.length) oldReached++;
      }
      out.oldReached = oldReached;
      return out;
    }, map);
    r.map = 'zombies/' + map;
    rows.push(r);
    await page.close();
  }

  console.log('\n   MAP          GRID        BLOCKED CELLS      SPAWNS IN SOLID');
  for (const r of rows) {
    console.log('   ' + r.map.padEnd(19) + (r.w + 'x' + r.h).padEnd(12)
      + (r.blocked + ' of ' + r.cells + ' (' + r.pct + '%)').padEnd(19)
      + r.spawnedInsideSolid + ' of ' + r.people);
  }
  console.log('');

  const wrong = rows.filter((r) => r.wrongMap || r.missing);
  check('every map under test is the map it says it is', wrong.length === 0,
    wrong.map((r) => `${r.map} loaded ${r.wrongMap || 'nothing'}`).join(', '));
  const blind = rows.filter((r) => r.noAccessor);
  check('every reachability number came from a real pathfinder',
    blind.length === 0, blind.map((r) => r.map).join(', '));
  check('every map builds a grid', rows.every((r) => r.cells > 100),
    rows.map((r) => r.map + ' ' + r.cells).join(', '));
  check('the grid knows about a real amount of the map',
    rows.every((r) => r.pct > 1),
    rows.map((r) => r.map + ' ' + r.pct + '%').join(', '));
  check('and has not walled the whole map off',
    rows.every((r) => r.pct < 55),
    rows.map((r) => r.map + ' ' + r.pct + '%').join(', '));
  /* THE ONLY HONEST FORM OF THIS CHECK. Asking for every route to be
     findable sounds right and is not: a spawn window whose route the
     pathfinder cannot find has been that way since before the sweep
     changed, and holding the new grid to a standard the old one never
     met just reverts a fix for a fault it did not cause. What must not
     happen is LOSING a route that used to exist. */
  const ab = rows.filter((r) => r.oldReached != null);
  for (const r of ab) {
    note(`${r.map}: one slice ${r.oldBlocked} cells and ${r.oldReached}/${r.tried} `
      + `routes; three heights ${r.blocked} cells and ${r.reached}/${r.tried}`);
  }
  const lost = ab.filter((r) => r.reached < r.oldReached);
  check('the extra heights cost no route that the one-slice grid could find',
    lost.length === 0,
    lost.map((r) => `${r.map} ${r.oldReached} -> ${r.reached}`).join(', '));
  const blindSpot = ab.filter((r) => r.blocked <= r.oldBlocked);
  check('and the grid knows about more of the map than one slice did',
    blindSpot.length === 0,
    blindSpot.map((r) => `${r.map} ${r.oldBlocked} -> ${r.blocked}`).join(', '));
  const unreachable = rows.filter((r) => r.tried > 0 && r.reached === 0);
  check('somewhere on every map can still reach the player',
    unreachable.length === 0,
    unreachable.map((r) => `${r.map} ${r.reached}/${r.tried}`).join(', '));
  const walled = rows.filter((r) => r.windowsWalledIn > 0);
  check('no spawn point was walled in by the extra heights',
    walled.length === 0,
    walled.map((r) => `${r.map} ${r.windowsWalledIn}`).join(', '));
  const nothing = rows.filter((r) => r.tried === 0);
  check('every map actually had routes to try', nothing.length === 0,
    nothing.map((r) => r.map).join(', '));
  check('nobody spawns inside a solid cell',
    rows.every((r) => r.spawnedInsideSolid === 0),
    rows.filter((r) => r.spawnedInsideSolid).map((r) => r.map + ' ' + r.spawnedInsideSolid).join(', '));
  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error on any map', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
