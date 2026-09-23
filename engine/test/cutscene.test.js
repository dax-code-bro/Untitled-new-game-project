#!/usr/bin/env node
/* A WIN CUTSCENE FOR EACH MAP, AND THE MESSAGE AFTER IT
 *
 * "each one has a custom cut scene for winning ... I want the your side
 * won message to appear after the cut scene ends."
 *
 * Four scenes, one per map, each described by name:
 *
 *   helipad      the team load into the helicopter, it takes off, and
 *                the camera STAYS on the pad as it goes
 *   town         a scientist in an underground bunker presses a red
 *                button and the bombers cross overhead
 *   resort       a lockdown: shutters come down over every way out
 *   demolition   a worker presses a detonator and the site comes down
 *
 * WHAT IS CHECKED, AND WHY IT IS CHECKED THIS WAY. A cutscene is a
 * camera path, so the only honest question is where the camera went and
 * what moved while it was there. Both are read out of the live page
 * while the scene runs -- the real end-of-match sequence, started by
 * setting the match over, not by calling the module by hand.
 *
 * THE MESSAGE IS THE POINT. The last check on every map is that the
 * result panel is hidden for the whole scene and visible after it, and
 * it reads the panel's own class rather than a flag, because the flag
 * is the thing that would be wrong.
 *
 * Usage: node engine/test/cutscene.test.js
 */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MAPS = ['helipad', 'town', 'resort', 'demolition'];

/* The beats each map must have, in order. Named rather than counted: a
   scene that has four beats called something else is not this scene. */
const WANT = {
  helipad: ['walk', 'board', 'lift', 'gone'],
  town: ['bunker', 'press', 'overhead', 'drop', 'after'],
  resort: ['alarm', 'shut', 'inside', 'quiet'],
  demolition: ['ready', 'fire', 'collapse', 'dust'],
};

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
  const errors = [];

  for (const map of MAPS) {
    const page = await browser.newPage({ viewport: { width: 360, height: 240 } });
    page.on('pageerror', (e) => errors.push(map + ': ' + e.message.split('\n')[0]));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(map + ': ' + m.text().split('\n')[0].slice(0, 120));
    });
    await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html')
      + '?map=' + map + '&mode=tdm');
    await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });

    const beats = await page.evaluate((m) => window.MP_CUTSCENE.beatsOf(m), map);
    const total = beats.reduce((n, b) => n + b.t, 0);
    console.log(`\n  --- ${map} --- ${beats.map((b) => b.id).join(' > ')}  (${total.toFixed(1)}s)`);
    check(`${map}: the scene has the beats it was described with`,
      beats.map((b) => b.id).join(',') === WANT[map].join(','),
      beats.map((b) => b.id).join(','));
    check(`${map}: and it is long enough to be a scene`, total >= 8 && total <= 20,
      `${total.toFixed(1)}s`);

    /* Start the real end sequence and follow it. */
    await page.evaluate(() => { const M = window.MP.match; M.over = true; M.winner = M.you.team; });

    /* SAMPLED WHILE IT RUNS. Camera positions, what beat they were in,
       and whether the result panel was up -- all from the live page. */
    const trail = await page.evaluate((secs) => new Promise((done) => {
      const out = [], t0 = Date.now();
      const tick = () => {
        const cam = window.MP.game.camera;
        const panel = document.querySelector('#mpui .over');
        const hb = window.MP.game.actors.find((a) => a.name === 'heli-body');
        out.push({
          heliY: hb ? +hb.position.y.toFixed(2) : null,
          t: window.MP_CUT ? +window.MP_CUT.elapsed.toFixed(2) : -1,
          beat: window.MP_CUT ? window.MP_CUT.beat : null,
          eye: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
          at: [+cam.target.x.toFixed(2), +cam.target.y.toFixed(2), +cam.target.z.toFixed(2)],
          panelUp: !panel.classList.contains('hide'),
          active: !!(window.MP_CUT && window.MP_CUT.active),
        });
        /* WAIT FOR THE SCENE, NOT FOR THE CLOCK ON THE WALL.
           The scene runs on a wall clock with its step clamped at 0.20 s,
           which is right for a game -- a stall must not teleport the
           helicopter -- but this renderer is software GL and the rebuilt
           Helipad draws at about two and a half frames a second, so the
           scene advances at roughly half real time. A budget of the
           scene's own length plus eight seconds cut it off in the middle
           of the lift beat, and the failure that produced ("the
           helicopter only climbed to 9 m") was a measurement of the
           frame rate, not of the shot. The budget is now four times the
           scene, which is slack enough for a renderer this slow and
           still finite if the scene genuinely hangs. */
        if (Date.now() - t0 > (secs * 4 + 10) * 1000
          || (out.length > 6 && !out[out.length - 1].active && out.some((r) => r.active))) {
          return done(out);
        }
        setTimeout(tick, 220);
      };
      tick();
    }), total);

    const ran = trail.filter((r) => r.active);
    const flownTo = ran.reduce((m, r) => (r.heliY != null && r.heliY > m ? r.heliY : m), -1) || null;
    const seen = [];
    for (const r of ran) if (r.beat && seen[seen.length - 1] !== r.beat) seen.push(r.beat);
    note(`${ran.length} samples while it ran, beats seen: ${seen.join(' > ') || 'none'}`);

    check(`${map}: the scene actually runs`, ran.length >= 5, `${ran.length} samples`);
    /* IT HAS TO ADVANCE. The first build of this rebuilt the scene from
       scratch every frame -- see the note on winCut in mp-game -- and
       every sample read the same hundredth of a second. */
    const times = ran.map((r) => r.t);
    check(`${map}: and it advances`, times.length > 2 && times[times.length - 1] > times[0] + 2,
      `${times[0]} -> ${times[times.length - 1]}`);
    check(`${map}: it gets past its first beat`, seen.length >= 2, seen.join(','));

    /* THE SHOT IS WHAT IT WAS DESCRIBED AS, and for Helipad that is a
       camera that does NOT move.
     *
       "the camera stays at the helipad as the helicopter disappears
       into the clouds" -- so a generic "did the camera travel" check
       fails the one scene that is following its description most
       exactly, which is what the first run of this did (0.6 m, FAIL).
       A test that punishes the thing being asked for is worse than no
       test. Helipad is held still and the AIM swings; everywhere else
       the camera goes somewhere. */
    let span = 0, aim = 0;
    for (let i = 1; i < ran.length; i++) {
      const a = ran[i - 1].eye, b = ran[i].eye;
      span += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const c = ran[i - 1].at, d = ran[i].at;
      aim += Math.hypot(d[0] - c[0], d[1] - c[1], d[2] - c[2]);
    }
    note(`the camera travelled ${span.toFixed(1)} m, the aim swung ${aim.toFixed(1)} m`);
    if (map === 'helipad') {
      check('helipad: the camera stays on the pad', span < 3, `${span.toFixed(1)} m`);
      check('helipad: and follows it up out of sight', aim > 20, `${aim.toFixed(1)} m`);
    } else {
      check(`${map}: the camera is doing something`, span > 3, `${span.toFixed(1)} m`);
    }

    /* AND THE MESSAGE WAITED. */
    const upDuring = ran.filter((r) => r.panelUp).length;
    check(`${map}: the result is hidden for the whole scene`, upDuring === 0,
      `${upDuring} of ${ran.length} samples had it up`);

    const after = await page.evaluate(() => new Promise((done) => {
      const wait = () => {
        const panel = document.querySelector('#mpui .over');
        if (!panel.classList.contains('hide')) {
          return done({ up: true, text: (panel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) });
        }
        setTimeout(wait, 250);
      };
      setTimeout(() => done({ up: false, text: '' }), 20000);
      wait();
    }));
    check(`${map}: and then it arrives`, after.up && /won|lost|draw/i.test(after.text),
      JSON.stringify(after));

    /* AND THE HELICOPTER LEAVES. Measured on the actor, not inferred
       from the camera: a scene that swings the aim at an empty sky
       would pass everything above. */
    if (map === 'helipad') {
      note(`the helicopter climbed to ${flownTo == null ? 'nowhere' : flownTo + ' m'}`);
      check('helipad: the helicopter actually goes', flownTo != null && flownTo > 25,
        String(flownTo));
    }

    /* THE MAP IS PUT BACK. Helipad's first bomb site IS the helicopter,
       so a scene that flies it away and leaves it there costs the next
       round its objective. */
    const home = await page.evaluate(() => {
      const spawned = window.MP.game.actors.filter((a) => a.name === 'cut' || a.name === 'cut-man');
      const heli = window.MP.game.actors.find((a) => a.name === 'heli-body');
      return { spawned: spawned.length, heliY: heli ? +heli.position.y.toFixed(2) : null };
    });
    check(`${map}: the scene cleans up after itself`, home.spawned === 0,
      `${home.spawned} props left behind`);
    if (map === 'helipad') {
      check('helipad: and the helicopter is back on the pad',
        home.heliY != null && Math.abs(home.heliY - 1.41) < 0.2, String(home.heliY));
    }
    await page.close();
  }

  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon|graphics set/i.test(e));
  check('no page error on any map', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
