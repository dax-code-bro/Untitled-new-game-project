#!/usr/bin/env node
/* Structural checks on Coastline.
 *
 * Same idea as map.test.js: the questions a screenshot cannot settle,
 * asked of the built world instead of of a frame that happened to look
 * all right. Coastline is an outdoor map three times the size of the
 * bunker, and three of the four things that went wrong while building it
 * were invisible in a render:
 *
 *   - The lake was never on screen. A ground plane ran on underneath it,
 *     0.35 m below the water over a hundred and twenty metres, and the
 *     two z-fought. The ground won nearly everywhere, so the water showed
 *     only as a bright line at its own edges and two passes went into
 *     tuning the colour of a surface nobody could see. There is a check
 *     for that here now, and it is the one worth having.
 *   - The spawn pads were fifteen metres outside the navmesh. A body that
 *     appears off the mesh has no path and stands where it spawned.
 *   - The wall-buys were plates with nothing to stand on in front of them.
 *
 * Usage: node engine/test/coastline.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('coastline tests need playwright: npm i --no-save playwright');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

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
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/coastline.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: 'coastline' });
    const S = B.S, G = B.game, C = window.COASTLINE;
    for (let i = 0; i < 12; i++) G.step(1 / 60);

    const out = {
      mapId: S.mapId,
      windows: S.windows.length,
      boarded: S.windows.every((w) => w.boards.length === 5),
      active: S.activeWindows.length,
      buys: S.buys.length,
      perks: S.perkStations.length,
      crate: !!S.crate,
      navLevels: Object.keys(S.nav || {}),
      spawn: [B.P.actor.position.x, B.P.actor.position.y, B.P.actor.position.z].map((v) => +v.toFixed(2)),
    };

    /* Is there ground under every square of the lawn? A hole in an
       outdoor map is a body falling out of the world, and the ground here
       is a single plane that was moved once already. */
    const down = [0, -1, 0];
    let holes = 0, holeAt = null;
    for (let x = C.C.green.x0 + 2; x <= C.C.green.x1 - 2; x += 6) {
      for (let z = C.C.green.z0 + 2; z <= -2; z += 6) {
        const hit = G.raycast([x, 6, z], down, 12);
        if (!hit) { holes++; if (!holeAt) holeAt = [x, z]; }
      }
    }
    out.lawnHoles = holes; out.lawnHoleAt = holeAt;

    /* Every spawn pad has to be somewhere a body can stand and walk from.
       Checked as "there is ground under it" plus "it is inside the
       rectangle the navmesh was baked over", which is the thing that was
       actually wrong: the flank pads were fifteen metres outside it. */
    const navBox = { x0: C.C.green.x0, x1: C.C.green.x1, z0: C.C.green.z0, z1: C.C.pier.z1 + 4 };
    out.padsOffMesh = [];
    for (const w of C.WINDOWS) {
      const p = w.pad;
      if (p[0] < navBox.x0 || p[0] > navBox.x1 || p[2] < navBox.z0 || p[2] > navBox.z1) {
        out.padsOffMesh.push(w.id);
      }
    }

    /* A wall-buy you cannot stand in front of is a wall-buy nobody buys.
       Two metres out from the plate, along its own facing, there has to
       be something to stand on within a metre and a half of the plate's
       height. */
    out.buysUnreachable = [];
    for (const b of (C.PLAY.buys || [])) {
      const f = b.face || 'S';
      const n = f === 'N' ? [0, 0, 1] : f === 'S' ? [0, 0, -1] : f === 'E' ? [1, 0, 0] : [-1, 0, 0];
      const sx = b.at[0] + n[0] * 1.5, sz = b.at[2] + n[2] * 1.5;
      const hit = G.raycast([sx, b.at[1] + 1.2, sz], down, 6);
      if (!hit || Math.abs((b.at[1] - 1.4) - (b.at[1] + 1.2 - (hit.distance || hit.t || 0))) > 1.6) {
        out.buysUnreachable.push(b.id + (hit ? ' (floor ' + (hit.distance || hit.t || 0).toFixed(1) + 'm down)' : ' (nothing under it)'));
      }
    }

    /* CAN YOU GET THERE ON FOOT?
     *
     * The pier, the seawall cap, the gangway and the covered slip were
     * all built, all visible, and none of them reachable: the cap stands
     * at 1.15 and the walk behind it at 0.12, which is a metre of rise
     * against a controller that steps 0.42. There was a weapon on the end
     * of the pier.
     *
     * Walked along the ROUTE each one is meant to be approached by, not
     * along a straight line to it. The straight line was tried first and
     * it is no good here: the line from the spawn to the end of the pier
     * crosses two hundred metres of open lake, so it reported a
     * two-metre rise where a player would have walked round on the deck,
     * and it would have reported nothing at all if the deck were missing.
     * A route says what the map intends; the test's job is to check that
     * the intention is walkable.
     *
     * The routes are test data and live here, which means they are also a
     * statement of how the map is supposed to be got round -- if one of
     * them stops being true, that is worth failing over. */
    const STEP = 0.42;
    const floorAt = (x, z) => {
      const hit = G.raycast([x, 9, z], down, 20);
      return hit ? 9 - (hit.distance || hit.t || 0) : null;
    };
    const S0 = C.spawn.at;
    const P0 = C.C.pier, L0 = C.C.slip;
    const gx = L0.x + L0.halfX - 0.45;
    const ROUTES = {
      // The three on the lawn: straight there.
      thompson: [[S0[0], S0[2]], [C.C.ranch.x + 5.2, C.C.ranch.z + C.C.ranch.d / 2 + 1.6]],
      scatter: [[S0[0], S0[2]], [C.C.twoStorey.x - 4.6, C.C.twoStorey.z + C.C.twoStorey.d / 2 + 1.6]],
      mp5: [[S0[0], S0[2]], [C.C.carport.x + C.C.carport.w / 2 + 1.4, C.C.carport.z]],
      // Out along the wall, up the steps, and down the pier.
      remington: [[S0[0], S0[2]], [P0.x, -2.4], [P0.x, -0.2], [P0.x, C.C.pavilion.z], [P0.x - 1.2, C.C.pavilion.z]],
      mg42: [[S0[0], S0[2]], [P0.x, -2.4], [P0.x, -0.2], [P0.x, C.C.boathouse.z], [P0.x + 1.6, C.C.boathouse.z]],
      // And along the wall the other way, up, and out the gangway.
      paralyzer: [[S0[0], S0[2]], [gx, -2.4], [gx, -0.2], [gx, L0.z - L0.halfZ + 1.2]],
    };
    out.stepWalls = [];
    for (const b of (C.PLAY.buys || [])) {
      const route = ROUTES[b.id];
      if (!route) { out.stepWalls.push(b.id + ': no route declared'); continue; }
      let prev = null, worst = 0, worstAt = null, gap = null;
      for (let k = 1; k < route.length; k++) {
        const [x0, z0] = route[k - 1], [x1, z1] = route[k];
        const dx = x1 - x0, dz = z1 - z0;
        const n = Math.max(4, Math.ceil(Math.hypot(dx, dz) / 0.4));
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = x0 + dx * t, z = z0 + dz * t;
          const y = floorAt(x, z);
          if (y == null) { if (!gap) gap = [+x.toFixed(1), +z.toFixed(1)]; prev = null; continue; }
          if (prev != null) {
            const rise = y - prev;
            if (rise > worst) { worst = rise; worstAt = [+x.toFixed(1), +z.toFixed(1)]; }
          }
          prev = y;
        }
      }
      if (worst > STEP) out.stepWalls.push(`${b.id}: ${worst.toFixed(2)}m rise at ${JSON.stringify(worstAt)}`);
      // A hole in the route is worse than a step in it: there is no floor.
      else if (gap) out.stepWalls.push(`${b.id}: nothing underfoot at ${JSON.stringify(gap)}`);
    }

    /* COPLANAR FACES.
     *
     * The one that cost the most. Two axis-aligned solids whose faces lie
     * on the same plane, both pointing the same way, over an area big
     * enough to see: the rasteriser has no way to choose between them and
     * fills the pixels with whichever wins the depth comparison, which
     * varies across the surface and with the camera. It is what hid the
     * whole lake behind the ground plane, and it is invisible in a
     * screenshot until it is enormous.
     *
     * Only reported for real area -- a millimetre of shared edge between
     * two boxes is not a fight, it is carpentry. */
    const boxes = G.actors
      .filter((a) => a.mesh && a.scale && a.scale.x > 0.02 && !a.skeleton)
      .map((a) => ({
        n: a.name || '?',
        x0: a.position.x - a.scale.x / 2, x1: a.position.x + a.scale.x / 2,
        y0: a.position.y - a.scale.y / 2, y1: a.position.y + a.scale.y / 2,
        z0: a.position.z - a.scale.z / 2, z1: a.position.z + a.scale.z / 2,
      }));
    const EPS = 0.004, MIN_AREA = 1.5;
    const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const fights = [];
    for (let i = 0; i < boxes.length && fights.length < 12; i++) {
      for (let j = i + 1; j < boxes.length && fights.length < 12; j++) {
        const A = boxes[i], Bx = boxes[j];
        // Top faces on one plane, overlapping in plan.
        if (Math.abs(A.y1 - Bx.y1) < EPS) {
          const area = ov(A.x0, A.x1, Bx.x0, Bx.x1) * ov(A.z0, A.z1, Bx.z0, Bx.z1);
          if (area > MIN_AREA) fights.push(`${A.n} / ${Bx.n} top y=${A.y1.toFixed(2)} ${area.toFixed(1)}m2`);
        }
        // Front/back faces on one plane.
        if (Math.abs(A.z1 - Bx.z1) < EPS) {
          const area = ov(A.x0, A.x1, Bx.x0, Bx.x1) * ov(A.y0, A.y1, Bx.y0, Bx.y1);
          if (area > MIN_AREA) fights.push(`${A.n} / ${Bx.n} face z=${A.z1.toFixed(2)} ${area.toFixed(1)}m2`);
        }
        if (Math.abs(A.x1 - Bx.x1) < EPS) {
          const area = ov(A.z0, A.z1, Bx.z0, Bx.z1) * ov(A.y0, A.y1, Bx.y0, Bx.y1);
          if (area > MIN_AREA) fights.push(`${A.n} / ${Bx.n} face x=${A.x1.toFixed(2)} ${area.toFixed(1)}m2`);
        }
      }
    }
    out.coplanar = fights;

    // And run some real frames, because half of what breaks only breaks
    // once the round loop is turning.
    for (let i = 0; i < 240; i++) G.step(1 / 60);
    out.ranFrames = true;
    out.hp = B.P.hp;
    out.gameOver = S.gameOver;
    return out;
  });

  console.log('');
  check('the map that was asked for is the map that was built', r.mapId === 'coastline', r.mapId);
  check('every way in has its five boards', r.boarded && r.windows === 5, `${r.windows} windows`);
  check('every way in is open from round one', r.active === r.windows, `${r.active} of ${r.windows}`);
  check('there is something to buy', r.buys === 6, `${r.buys} wall-buys`);
  check('there are four perk machines and a box', r.perks === 4 && r.crate, `${r.perks} perks, crate=${r.crate}`);
  check('the navmesh was baked', r.navLevels.length > 0, r.navLevels.join(',') || 'none');
  check('the lawn has no holes in it', r.lawnHoles === 0,
    `${r.lawnHoles} holes, first at ${JSON.stringify(r.lawnHoleAt)}`);
  check('every spawn pad is inside the navmesh', r.padsOffMesh.length === 0, r.padsOffMesh.join(', '));
  check('every wall-buy has a floor to stand on', r.buysUnreachable.length === 0, r.buysUnreachable.join(' | '));
  check('the route to every wall-buy is walkable end to end',
    r.stepWalls.length === 0, r.stepWalls.join(' | '));
  check('no two solids fight over the same plane', r.coplanar.length === 0,
    `${r.coplanar.length}: ${r.coplanar.slice(0, 4).join(' | ')}`);
  check('you start on the map rather than under it', r.spawn[1] > 0.2 && r.spawn[1] < 4, JSON.stringify(r.spawn));
  check('four seconds of play does not kill you or throw', !r.gameOver && r.hp > 0, `hp ${r.hp}`);
  const real = errors.filter((e) => !/Failed to load resource|favicon/.test(e));
  check('the map builds and runs without errors', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
