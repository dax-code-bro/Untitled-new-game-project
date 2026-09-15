#!/usr/bin/env node
/* The four multiplayer maps, checked as built worlds.
 *
 * The questions a screenshot cannot answer, asked of the geometry:
 *
 *   - Is there a floor under every spawn, and headroom over it? A body
 *     that spawns inside a wall is a body that never moves, and a body
 *     that spawns over a hole is a body that falls out of the map. Both
 *     of those have happened on Coastline already.
 *   - Can you actually stand on a bomb site? A site inside a solid is a
 *     round that cannot be played.
 *   - Do the three lanes separate? A lane is only a lane if something
 *     stands between it and the next one -- if a rifle at chest height
 *     can see from one side of the map to the other, there is one lane
 *     with decoration in it.
 *   - Is there a floor everywhere inside the boundary? Sampled on a
 *     two-metre grid, because falling through the world is the worst
 *     bug a map can have and it is invisible until somebody walks
 *     exactly there.
 *   - Is every spawn on your side further from every enemy spawn than
 *     it is from your own? Spawns that interleave produce a match that
 *     starts with six people behind six people.
 *
 * It also renders each map from three places, because the point of a
 * map is how it looks and no assertion has ever proved that.
 *
 * Usage: node engine/test/mpmaps.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '/tmp';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/mp-data.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/mp-maps.js'), 'utf8') });

  const ids = await page.evaluate(() => window.MP_MAPS.list);
  check('all four maps are registered', ids.join(',') === 'helipad,resort,town,demolition', ids.join(','));
  check('mp-data and mp-maps agree on the four',
    await page.evaluate(() => window.MP_DATA.MAPS.every((m) => window.MP_MAPS.has(m.id))));

  for (const id of ids) {
    console.log(`\n  --- ${id} ---`);
    const r = await page.evaluate((mapId) => {
      /* One engine per map. Tearing a world down and standing another
         one up inside the same engine is exactly the thing the zombies
         map switch reloads the page to avoid. */
      if (window.G) { try { window.G.dispose(); } catch (e) { /* nothing to lose */ } }
      const G = window.G = LE.create({ canvas: '#game', quality: 'low', gravity: -19.6 });
      const t0 = performance.now();
      const M = window.M = window.MP_MAPS.build(G, mapId);
      const ms = performance.now() - t0;
      for (let i = 0; i < 4; i++) G.step(1 / 60);

      const hit = (o, d, len) => G.raycast(o, d, len, (bd) => !bd.isTrigger);
      const floorAt = (x, z, from) => {
        const h = hit([x, from == null ? 6 : from, z], [0, -1, 0], 40);
        return h ? (h.point && h.point.y != null ? h.point.y : null) : null;
      };
      const headroom = (x, y, z) => !hit([x, y + 0.2, z], [0, 1, 0], 1.7);
      const inside = (x, y, z) => !!hit([x, y, z], [0, 1, 0], 0.1);

      const out = { ms: Math.round(ms), solids: M.solids.length, decos: M.decos.length,
        sites: M.sites.length, lanes: M.lanes.length };

      /* Anything at a coordinate that is not a number is a piece of the
         map that is nowhere, and it will be nowhere silently. */
      out.nan = M.solids.concat(M.decos).filter((a) => {
        const p = a.position, s = a.scale;
        return !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)
          || !isFinite(s.x) || !isFinite(s.y) || !isFinite(s.z);
      }).length;

      /* Spawns. */
      out.spawnBad = [];
      ['a', 'b'].forEach((team) => {
        M.spawns[team].forEach((sp, i) => {
          const [x, y, z] = sp.at;
          const f = floorAt(x, z, 8);
          if (f == null) out.spawnBad.push(`${team}${i}:no floor`);
          else if (Math.abs(f - y) > 1.2) out.spawnBad.push(`${team}${i}:floor ${f.toFixed(2)} vs ${y}`);
          if (inside(x, y + 0.9, z)) out.spawnBad.push(`${team}${i}:inside something`);
          if (!headroom(x, (f == null ? y : f) + 0.1, z)) out.spawnBad.push(`${team}${i}:no headroom`);
        });
      });
      out.spawnCount = M.spawns.a.length + M.spawns.b.length;

      /* Spawns must not interleave. */
      const d2 = (p, q) => Math.hypot(p.at[0] - q.at[0], p.at[2] - q.at[2]);
      out.mixed = 0;
      M.spawns.a.forEach((p) => {
        const mine = Math.min(...M.spawns.a.filter((q) => q !== p).map((q) => d2(p, q)));
        const theirs = Math.min(...M.spawns.b.map((q) => d2(p, q)));
        if (theirs < mine) out.mixed++;
      });

      /* Bomb sites: you have to be able to stand on one. */
      out.siteBad = [];
      M.sites.forEach((s) => {
        const [x, , z] = s.at;
        const f = floorAt(x, z, 14);
        if (f == null) out.siteBad.push(`${s.id}:no floor`);
        else if (inside(x, f + 0.9, z)) out.siteBad.push(`${s.id}:inside a solid`);
        else if (!headroom(x, f + 0.1, z)) out.siteBad.push(`${s.id}:no headroom`);
      });

      /* A floor everywhere inside the boundary, on a two-metre grid. */
      const R = mapId === 'demolition' ? 46 : (mapId === 'town' ? 58 : 52);
      let holes = 0, samples = 0;
      for (let x = -R; x <= R; x += 2) {
        for (let z = -R; z <= R; z += 2) {
          samples++;
          if (floorAt(x, z, 30) == null) holes++;
        }
      }
      out.holes = holes; out.samples = samples;

      /* Openness, measured across the WHOLE width rather than between
         lane centres.
       *
         The first version of this cast from one lane centre to the next
         and demanded that two thirds of those be blocked. That is not
         what a lane is. Helipad's middle lane is an open pad and its
         left lane bleeds into it on purpose -- the check was asking a
         map to be three corridors, and three corridors is the map
         nobody wants. What actually matters is that you cannot stand
         anywhere and see the entire width of the map, which is the same
         question asked of the thing that is really wrong. */
      out.crossOpen = 0; out.crossTried = 0;
      /* Sampled between the two spawn screens rather than over the
         whole map. Behind your own screen is your own spawn, and a
         spawn IS meant to be open -- it is where six people appear at
         once and have to get out of each other's way. The question is
         about the ground the fight happens on. */
      const IN = R - 18;
      for (let z = -IN; z <= IN; z += 3) {
        out.crossTried++;
        if (!hit([-R + 2, 1.45, z], [1, 0, 0], 2 * R - 4)) out.crossOpen++;
      }

      /* The longest sightline anywhere down the map, and whether any of
         them runs from one spawn line to the other.
       *
         A map with no long line is all corridors and no rifle has a
         reason to exist on it. A map with a line the whole length of it
         has a spawn you can be shot in. Both are worth knowing, and
         neither is "is x = 0 clear", which was the old check -- x = 0
         on Helipad is where the helicopter is parked, so the map failed
         for having its bomb site in the middle of its middle. */
      out.longest = 0;
      /* Cast from inside the near spawn screen, not from behind it.
         Started at the map edge, every ray's first hit was the screen
         fifteen metres away and every map reported a longest sightline
         of about sixteen metres -- which says nothing about the map and
         everything about where the tape measure was standing. */
      const Z0 = -(R - 26), LEN = 2 * (R - 26);
      for (let x = -R + 6; x <= R - 6; x += 2) {
        const h = hit([x, 1.45, Z0], [0, 0, 1], LEN);
        const d = h ? Math.max(0, h.point.z - Z0) : LEN;
        if (d > out.longest) out.longest = Math.round(d);
      }

      /* And the one that matters most: nobody may be shot where they
         spawn, from where the other side spawns. */
      out.spawnShot = 0;
      M.spawns.a.forEach((p) => {
        M.spawns.b.forEach((q) => {
          const dx = q.at[0] - p.at[0], dz = q.at[2] - p.at[2];
          const len = Math.hypot(dx, dz);
          if (!hit([p.at[0], 1.45, p.at[2]], [dx / len, 0, dz / len], len)) out.spawnShot++;
        });
      });
      out.spawnPairs = M.spawns.a.length * M.spawns.b.length;
      return out;
    }, id);

    check(`${id}: builds`, r.solids > 0, `${r.solids} solids, ${r.decos} decorations, ${r.ms} ms`);
    check(`${id}: nothing is at a nonsense coordinate`, r.nan === 0, String(r.nan));
    check(`${id}: twelve spawns`, r.spawnCount === 12, String(r.spawnCount));
    check(`${id}: every spawn has a floor, headroom and no wall in it`,
      r.spawnBad.length === 0, r.spawnBad.join('; '));
    check(`${id}: the two sides do not interleave`, r.mixed === 0, String(r.mixed));
    check(`${id}: both bomb sites can be stood on`, r.siteBad.length === 0, r.siteBad.join('; '));
    check(`${id}: no holes in the floor`, r.holes === 0, `${r.holes} of ${r.samples} samples`);
    check(`${id}: you cannot see the whole width of it from anywhere`,
      r.crossOpen / r.crossTried < 0.25,
      `${r.crossOpen} of ${r.crossTried} full-width crossings were clear`);
    check(`${id}: there is a long sightline on it`, r.longest >= 28, `${r.longest} m`);
    check(`${id}: and it does not reach the spawns`, r.spawnShot === 0,
      `${r.spawnShot} of ${r.spawnPairs} spawn pairs can see each other`);

    /* Three photographs: one from each spawn looking up the map, and
       one from above the middle. */
    const views = await page.evaluate(() => {
      const G = window.G, M = window.M;
      return { a: M.spawns.a[2].at, b: M.spawns.b[3].at, mid: [M.lanes[1].x, 26, -34] };
    });
    for (const [what, from] of Object.entries(views)) {
      await page.evaluate(([f, w]) => {
        const G = window.G, M = window.M;
        const look = w === 'a' ? [f[0] * 0.3, 1.4, f[2] + 40]
          : w === 'b' ? [f[0] * 0.3, 1.4, f[2] - 40] : [0, 0, 6];
        G.lookAt([f[0], f[1] + (w === 'mid' ? 0 : 1.6), f[2]], look);
        for (let i = 0; i < 3; i++) G.step(1 / 60);
      }, [from, what]);
      await page.waitForTimeout(140);
      await page.screenshot({ path: path.join(OUT, `map-${id}-${what}.jpg`), type: 'jpeg', quality: 80 });
    }
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  shots in ${OUT}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
