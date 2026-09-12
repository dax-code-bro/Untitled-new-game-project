#!/usr/bin/env node
/* The immersion pass, driven in the real game.
 *
 * Everything here was already simulated and invisible. The point of the
 * test is that it is now perceptible: that sign on the ground becomes
 * objects you can look at, that reading one returns what a tracker would
 * say, that a shot animal flinches the way the hit says it should and
 * goes down rather than blinking out, and that the wind can be read.
 *
 * It photographs each, because a thing that renders in the wrong place
 * passes every assertion you can write about it.
 *
 * Usage: node survivor/test/immersion.browser.test.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, '..', '..', 'site');
const SHOTS = process.env.SHOT_DIR || '/tmp/claude-0/ishots';
const PORT = 8114;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = path.join(SITE, decodeURIComponent(url.parse(req.url).pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); return res.end('x'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
});

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
function section(t) { console.log(`\n${t}`); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

  const shot = async (n) => {
    await page.evaluate(() => { window.SURVIVOR.world.clock.simSeconds = 10.5 * 3600; });
    await page.waitForTimeout(500);
    return page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  };

  section('load');
  await page.goto(`http://localhost:${PORT}/survivor/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#startBtn:not([hidden])', { timeout: 300000 });
  await page.click('#startBtn');
  await page.waitForTimeout(2500);
  check('the game starts clean', errors.length === 0, errors.slice(0, 2).join(' | '));
  const mods = await page.evaluate(() => window.SurvivorGame.modules.map((m) => m.id));
  check('the tracking module is loaded', mods.includes('tracking'), mods.join(','));
  check('the wind module is loaded', mods.includes('wind'));

  section('sign on the ground');
  /* Lay a spread of sign around the player from the simulation's own API,
     the way an animal walking past would, then let the renderer catch up. */
  const laid = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    const eco = S.world.ecology;
    const px = S.player.x, pz = S.player.z;
    const kinds = ['track', 'track', 'track', 'dropping', 'bed', 'rub', 'hair', 'scrape'];
    kinds.forEach((kind, i) => {
      const a = (i / kinds.length) * Math.PI * 2;
      eco.addSign({
        kind, x: px + Math.sin(a) * 4.5, z: pz + Math.cos(a) * 4.5,
        speciesId: 'whitetailDeer', male: true, massKg: 90, heading: a,
        gait: 'trot', depth: 0.85, ageClass: 'adult', amount: 1.4,
      });
    });
    eco.addSign({
      kind: 'blood', x: px + 2, z: pz + 2, speciesId: 'whitetailDeer',
      massKg: 90, depth: 0.9, amount: 1, blood: S.ctx.SV.BLOOD.lung,
    });
    return { simulated: eco.signs.length };
  });
  /* The sign renderer sweeps on accumulated simulation time, and the
     engine hands update hooks a clamped dt — so three quarters of a
     second of sweep is several seconds of wall clock on a software
     rasteriser running at ten frames. Wait for the actors, not a clock. */
  await page.waitForFunction(
    () => window.SURVIVOR.game.actors.filter((x) => x.name === 'sign').length >= 9,
    { timeout: 30000 },
  ).catch(() => {});
  laid.drawn = await page.evaluate(
    () => window.SURVIVOR.game.actors.filter((x) => x.name === 'sign').length,
  );
  check('the simulation is holding sign', laid.simulated >= 9, `${laid.simulated}`);
  check('and it is drawn in the world', laid.drawn >= 9, `${laid.drawn} actors`);

  // Stand the camera over the sign and look down at it.
  await page.evaluate(() => {
    const S = window.SURVIVOR;
    S.game.lookAt([S.player.x + 3.5, S.ctx.groundY(S.player.x, S.player.z) + 2.6, S.player.z + 3.5],
      [S.player.x, S.ctx.groundY(S.player.x, S.player.z), S.player.z]);
  });
  await shot('sign-on-ground');

  section('reading it');
  const read = await page.evaluate(() => {
    const S = window.SURVIVOR;
    const eco = S.world.ecology;
    const lines = [];
    S.ctx.on('sign-read', (d) => lines.push(d.read));
    const near = eco.signsNear(S.player.x, S.player.z, 12, {
      skill: 0.9, weather: S.world.clock.environment(),
    });
    const track = near.find((n) => n.sign.kind === 'track');
    const blood = near.find((n) => n.sign.kind === 'blood');
    return {
      count: near.length,
      track: track ? track.read : null,
      blood: blood ? blood.read : null,
    };
  });
  check('sign near you can be found', read.count >= 8, `${read.count}`);
  check('a track names the species', read.track && /deer/i.test(read.track.species || ''),
    read.track ? read.track.species : 'none');
  check('and says which way and how fast', !!(read.track && read.track.gait && read.track.heading != null),
    read.track ? `${read.track.gait}` : 'none');
  check('and how long ago, in words', !!(read.track && /ago|hour|minute|yesterday|day/i.test(read.track.when || '')),
    read.track ? read.track.when : 'none');
  check('lung blood is described as frothy and pink',
    !!(read.blood && /frothy|pink/i.test(read.blood.blood || '')), read.blood ? read.blood.blood : 'none');
  check('and it says to wait and follow',
    !!(read.blood && /ten minutes|not go far/i.test(read.blood.means || '')),
    read.blood ? read.blood.means : 'none');

  // A beginner should get less out of the same track than an expert.
  const skillGap = await page.evaluate(() => {
    const S = window.SURVIVOR;
    const eco = S.world.ecology;
    const sg = eco.signs.find((x) => x.kind === 'track');
    const novice = sg.read(eco.nowDays, 0.02, {});
    const expert = sg.read(eco.nowDays, 0.98, {});
    return {
      noviceCertainty: novice.certainty, expertCertainty: expert.certainty,
      noviceSex: novice.sex || null, expertSex: expert.sex || null,
    };
  });
  check('a beginner is less certain than an expert',
    skillGap.expertCertainty > skillGap.noviceCertainty + 0.2,
    `${skillGap.noviceCertainty.toFixed(2)} vs ${skillGap.expertCertainty.toFixed(2)}`);
  check('and cannot tell a buck from a doe by the track',
    !skillGap.noviceSex && !!skillGap.expertSex,
    `${skillGap.noviceSex} vs ${skillGap.expertSex}`);

  const readInGame = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    const before = S.player.skills.tracking;
    const actor = S.game.actors.find((a) => a.name === 'sign' && a.userData
      && a.userData.sign && a.userData.sign.kind === 'track');
    if (!actor) return { ok: false };
    // Go through the interaction hook the way the crosshair would.
    let offered = null;
    for (const hook of S.ctx.state.offerHooks) {
      const r = hook({ actor, distance: 1.4 }, actor.userData);
      if (r) { offered = r; break; }
    }
    if (offered && offered.act) offered.act();
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true, verb: offered ? offered.verb : null, before, after: S.player.skills.tracking };
  });
  check('looking at a track offers to read it',
    readInGame.ok && /read the track/i.test(readInGame.verb || ''), readInGame.verb);
  check('and reading sign is what makes you better at it',
    readInGame.after > readInGame.before,
    `${readInGame.before.toFixed(3)} -> ${(readInGame.after || 0).toFixed(3)}`);

  section('the wind');
  const wind = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    const before = S.ctx.state.windKnownAt;
    S.ctx.state.checkWind();
    await new Promise((r) => setTimeout(r, 600));
    const strip = document.getElementById('windStrip');
    return {
      before, after: S.ctx.state.windKnownAt,
      strip: strip ? strip.textContent : '',
      shown: strip ? strip.style.display : 'none',
    };
  });
  check('checking the wind records when you checked', wind.after > (wind.before || -1e9));
  await page.evaluate(() => { window.SURVIVOR.ctx.state.giveWeapon('remington700_308'); });
  await page.waitForTimeout(900);
  const windStrip = await page.evaluate(async () => {
    window.SURVIVOR.ctx.state.checkWind();
    await new Promise((r) => setTimeout(r, 900));
    const s = document.getElementById('windStrip');
    return { text: s.textContent, shown: s.style.display };
  });
  check('and with a gun in hand the reading is on the HUD',
    windStrip.shown === 'block' && /WIND/.test(windStrip.text), `${windStrip.shown} "${windStrip.text}"`);
  check('with a direction and a speed', /[↑↗→↘↓↙←↖]\s[\d.]+ m\/s/.test(windStrip.text), windStrip.text);
  await shot('wind');

  section('an animal that is hit');
  /* Use whichever animal the renderer has actually put in the world.
     Teleporting one into range fights the spawner, which picks what to
     render from its own view of who is near — and the thing under test
     is the flinch and the collapse, not the spawner. */
  await page.waitForFunction(() => {
    for (const [, rec] of window.SURVIVOR.ctx.state.animalActors) if (rec.beast) return true;
    return false;
  }, null, { timeout: 60000 }).catch(() => {});

  const hit = await page.evaluate(() => {
    const S = window.SURVIVOR;
    for (const [id, rec] of S.ctx.state.animalActors) {
      if (!rec.beast) continue;
      window.__beastId = id;
      const kind = rec.beast.react('heart', S.player.x, S.player.z);
      return {
        ok: true, kind, reacting: rec.beast.hitReaction > 0,
        species: rec.sim && rec.sim.species ? rec.sim.species.name : '?',
      };
    }
    return { ok: false, reason: 'nothing rendered' };
  });
  check('an animal is rendered near the player', hit.ok, hit.reason || '');
  if (hit.ok) {
    console.log(`       ${hit.species}`);
    check('a heart shot produces the mule kick', hit.kind === 'heart', hit.kind);
    check('and the flinch is playing', hit.reacting);
  }
  await page.evaluate(() => {
    const S = window.SURVIVOR;
    const rec = S.ctx.state.animalActors.get(window.__beastId);
    if (rec && rec.beast) {
      const b = rec.beast;
      S.game.lookAt([b.x + 4.5, S.ctx.groundY(b.x, b.z) + 1.7, b.z + 4.5],
        [b.x, S.ctx.groundY(b.x, b.z) + 0.6, b.z]);
    }
  });
  await shot('hit-reaction');

  const started = await page.evaluate(() => {
    const rec = window.SURVIVOR.ctx.state.animalActors.get(window.__beastId);
    if (!rec || !rec.beast) return false;
    rec.beast.die({ seconds: 1.4 });
    return rec.beast.dying > 0;
  });
  /* The animator times the collapse off the frame clock, and the software
     rasteriser runs at ten frames — so wait on the state, not a stopwatch. */
  await page.waitForFunction(() => {
    const rec = window.SURVIVOR.ctx.state.animalActors.get(window.__beastId);
    return !rec || !rec.beast || rec.beast.downed;
  }, null, { timeout: 90000 }).catch(() => {});
  const down = await page.evaluate(() => {
    const rec = window.SURVIVOR.ctx.state.animalActors.get(window.__beastId);
    // Gone entirely is a pass: the collapse ran and the carcass took over.
    if (!rec || !rec.beast) return { downed: true, dying: -1 };
    return { downed: rec.beast.downed, dying: rec.beast.dying };
  });
  check('an animal goes down rather than blinking out', started);
  check('and the collapse finishes', down.downed, `dying=${(down.dying || 0).toFixed(2)}`);
  await shot('animal-down');

  section('holding a breath');
  const breath = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    const w = S.ctx.state.currentWeapon;
    if (!w) return { ok: false };
    const loose = w.accuracyMoa({ prone: true, skill: 0.5, holdSeconds: 0 });
    const held = w.accuracyMoa({ prone: true, skill: 0.5, holdSeconds: 2.5 });
    const spent = w.accuracyMoa({ prone: true, skill: 0.5, holdSeconds: 13 });
    return { ok: true, loose, held, spent };
  });
  /* A held breath is worth about a quarter of the group, not the whole
     of it: it takes out the shooter's wobble and does nothing at all
     about a worn barrel or a fouled bore, which is correct. */
  check('a held breath steadies the rifle', breath.held < breath.loose * 0.85,
    `${breath.loose.toFixed(2)} -> ${breath.held.toFixed(2)} MOA`);
  check('but it cannot fix the rifle itself', breath.held > breath.loose * 0.4,
    `${breath.held.toFixed(2)} MOA`);
  check('and holding it too long is worse than not holding it',
    breath.spent > breath.loose, `${breath.spent.toFixed(2)} vs ${breath.loose.toFixed(2)} MOA`);

  section('overall');
  check('no console error at any point', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) { console.log('\nFailures:'); for (const f of failures) console.log(`  - ${f}`); }
  console.log(`screenshots in ${SHOTS}`);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})();
