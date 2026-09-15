#!/usr/bin/env node
/* A whole match, simulated, with nobody watching.
 *
 * This is the test the match runtime was built to make possible. A
 * ten-minute six-a-side is thirty-six thousand ticks; run it headless
 * and you find out in a few seconds whether a map plays, which is the
 * one thing you cannot learn by looking at it.
 *
 * What it asks:
 *
 *   - Does anybody die? A match with no kills means the bots cannot
 *     find each other, which on a three-lane map means the goals or
 *     the pathing are wrong.
 *   - Does anybody MOVE? Standing bots that shoot each other across a
 *     spawn line would pass a kill count and fail this.
 *   - Does anybody leave the world? Falling out is the worst bug a map
 *     can have and the simulation is the only place it is cheap to
 *     look for.
 *   - Does it end, and end correctly? Both modes, on all four maps.
 *   - Is it one-sided? Six bots against six bots on a symmetric map
 *     should finish somewhere near even; a blowout every time means
 *     one spawn is better than the other.
 *
 * Usage: node engine/test/mpmatch.test.js
 */
const fs = require('fs');
const path = require('path');

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

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  for (const f of ['site/engine/legend-engine.js', 'site/games/mp-data.js',
    'site/games/mp-maps.js', 'site/games/mp-match.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
  }

  const maps = ['helipad', 'resort', 'town', 'demolition'];

  for (const mapId of maps) {
    for (const mode of ['tdm', 'snd']) {
      const r = await page.evaluate(([m, md]) => {
        if (window.G) { try { window.G.dispose(); } catch (e) { /* nothing to lose */ } }
        const G = window.G = LE.create({ canvas: '#game', quality: 'low', gravity: -19.6 });
        const t0 = performance.now();
        /* headless: the rules and the bodies, no actors and no
           rendering. Everything the match decides is decided here. */
        const M = window.M = MP_MATCH.start({
          game: G, mapId: m, mode: md, headless: true, youBot: true, seed: 7,
        });
        const buildMs = performance.now() - t0;

        const start = M.people.map((p) => ({ x: p.pos.x, z: p.pos.z }));
        let walked = new Array(M.people.length).fill(0);
        let last = M.people.map((p) => ({ x: p.pos.x, z: p.pos.z }));
        let minY = 99, maxCross = 0, nan = 0, ticks = 0;
        const t1 = performance.now();
        /* Twelve simulated minutes at 30 Hz, or until it ends. Thirty
           is plenty: nothing here integrates fast enough to care, and
           sixty doubles the wall clock for no extra truth. */
        for (let k = 0; k < 30 * 60 * 12 && !M.over; k++) {
          M.update(1 / 30);
          ticks++;
          if ((k & 3) === 0) {
            for (let i = 0; i < M.people.length; i++) {
              const p = M.people[i];
              if (!isFinite(p.pos.x) || !isFinite(p.pos.y) || !isFinite(p.pos.z)) { nan++; continue; }
              if (p.alive) {
                walked[i] += Math.hypot(p.pos.x - last[i].x, p.pos.z - last[i].z);
                if (p.pos.y < minY) minY = p.pos.y;
                /* How far into the other half anybody got. A bot that
                   never crosses the halfway line is a bot standing in
                   its own spawn. */
                const cross = p.team === 'a' ? p.pos.z : -p.pos.z;
                if (cross > maxCross) maxCross = cross;
              }
              last[i] = { x: p.pos.x, z: p.pos.z };
            }
          }
        }
        const simMs = performance.now() - t1;
        const board = M.scoreboard();
        return {
          buildMs: Math.round(buildMs), simMs: Math.round(simMs), ticks,
          over: M.over, winner: M.winner, score: M.score, round: M.round,
          time: Math.round(M.time),
          kills: board.reduce((n, p) => n + p.kills, 0),
          deaths: board.reduce((n, p) => n + p.deaths, 0),
          damage: board.reduce((n, p) => n + p.damage, 0),
          moved: Math.round(walked.reduce((a, b) => a + b, 0)),
          stood: walked.filter((w) => w < 12).length,
          minY: +minY.toFixed(2), maxCross: Math.round(maxCross), nan,
          nav: { w: M.nav.w, h: M.nav.h,
            blocked: M.nav.g.reduce((n, v) => n + v, 0) },
          events: M.events.filter((e) => e.kind !== 'spawn').length,
          plants: M.events.filter((e) => e.kind === 'plant').length,
          top: board[0],
        };
      }, [mapId, mode]);

      const tag = `${mapId}/${mode}`;
      console.log(`\n  --- ${tag} --- ${r.ticks} ticks in ${r.simMs} ms, `
        + `nav ${r.nav.w}x${r.nav.h} (${r.nav.blocked} blocked)`);
      check(`${tag}: nothing is at a nonsense coordinate`, r.nan === 0, String(r.nan));
      check(`${tag}: people die`, r.kills >= 8, `${r.kills} kills, ${Math.round(r.damage)} damage`);
      check(`${tag}: people move`, r.moved > 600, `${r.moved} m between them`);
      check(`${tag}: nobody stands still all match`, r.stood === 0,
        `${r.stood} of 12 walked under 12 m`);
      check(`${tag}: the fight reaches the other half`, r.maxCross > 8, `${r.maxCross} m past the line`);
      check(`${tag}: nobody falls out of the world`, r.minY > -3, String(r.minY));
      check(`${tag}: it ends`, r.over === true,
        `after ${r.time}s, score ${r.score.a}-${r.score.b}`);
      if (mode === 'tdm') {
        check(`${tag}: and ends on the score limit or the clock`,
          r.score.a >= 75 || r.score.b >= 75 || r.time >= 600,
          `${r.score.a}-${r.score.b} at ${r.time}s`);
        check(`${tag}: it is not a walkover`,
          Math.min(r.score.a, r.score.b) >= 20,
          `${r.score.a}-${r.score.b}`);
      } else {
        check(`${tag}: somebody reaches six rounds`,
          r.score.a >= 6 || r.score.b >= 6, `${r.score.a}-${r.score.b}`);
        check(`${tag}: the bomb gets planted`, r.plants > 0, `${r.plants} plants`);
      }
      check(`${tag}: a whole match simulates in under twelve seconds`, r.simMs < 12000,
        `${r.simMs} ms`);
    }
  }

  /* The same seed must produce the same match, or none of the above
     means anything on the second run. */
  const same = await page.evaluate(() => {
    const run = () => {
      if (window.G) { try { window.G.dispose(); } catch (e) { /* nothing to lose */ } }
      const G = window.G = LE.create({ canvas: '#game', quality: 'low', gravity: -19.6 });
      const M = MP_MATCH.start({ game: G, mapId: 'town', mode: 'tdm', headless: true,
        youBot: true, seed: 99 });
      for (let k = 0; k < 30 * 90 && !M.over; k++) M.update(1 / 30);
      return M.scoreboard().map((p) => `${p.id}:${p.kills}/${p.deaths}`).join(',');
    };
    return { a: run(), b: run() };
  });
  check('the same seed plays the same match', same.a === same.b,
    `${same.a.slice(0, 40)} vs ${same.b.slice(0, 40)}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
