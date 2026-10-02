#!/usr/bin/env node
/* MISSION 1, "BURNING SKY", PLAYED.
 *
 * site/games/missions/m1-burning-sky.js on the campaign stage
 * (campaign-stage.js). The game loop is stopped and stepped by hand on a
 * virtual clock, without drawing, so the scripted scenes run on game time:
 *
 *   intro        a scene: bars, the camera, the team seated in a moving helicopter
 *   skip         holding Skip ends a scene where it would have ended, and counts
 *   rooftop      the helicopter is on the pad afterwards
 *   stairs       play: you on the roof, the squad following, the roof's own walk
 *                grid stopping you at the parapet
 *   friendly     shooting a soldier who is standing still is instant; a squadmate
 *                gets one warning, the second is the black screen and the checkpoint
 *   street       hostiles arrive dressed as Hydra, and the battle is heard
 *   handoff      Payback holds out her Desert Eagle, and puts it away with the scene
 *   snipers      six of them at their windows
 *   passed       the Mission Passed screen: stars, completion, three buttons, the battle quiet
 *
 * Usage: node engine/test/burningsky.test.js
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.addInitScript(() => {
    const pn = performance.now.bind(performance);
    window.__vt = null;
    performance.now = () => (window.__vt == null ? pn() : window.__vt);
    window.__pn = pn;
    try { localStorage.removeItem('b9.campaign.v1'); } catch (e) { /* */ }
  });
  await page.goto('file://' + path.join(ROOT, 'site/games/campaign.html'));
  check('Burning Sky is the first mission', await page.evaluate(() => window.CAMPAIGN_MISSIONS[0].id === 'burning-sky'));
  await page.evaluate(() => {
    document.getElementById('menu').style.display = 'none';
    window.MP = CAMPAIGN.play(window.CAMPAIGN_MISSIONS[0], { index: 0, resume: false });
  });
  await page.waitForFunction(() => window.CAMPAIGN_LIVE && window.MP_GAME_LIVE && window.MP_GAME_LIVE.match, null, { timeout: 600000 });
  await page.evaluate(() => {
    const G = window.MP_GAME_LIVE.game;
    G.stop(); G._watch = null; G.skipRender = true;
    window.__vt = window.__pn();
    window.__step = (secs) => { const n = Math.round(secs * 30); for (let i = 0; i < n; i++) { window.__vt += 1000 / 30; G.step(1 / 30); } };
  });
  const run = (secs) => page.evaluate((s) => window.__step(s), secs);
  const st = () => page.evaluate(() => window.CAMPAIGN_LIVE.state());
  const skip = async () => {
    await page.evaluate(() => { window.MP_GAME_LIVE.skipHeld = () => true; });
    await run(0.2);
    await page.evaluate(() => { window.MP_GAME_LIVE.skipHeld = () => false; });
    await run(0.1);
  };

  // ---- the helicopter ----
  await run(1.2);
  let s = await st();
  check('it opens on the intro scene, with no briefing card', s.started && s.id === 'intro' && s.type === 'scene', JSON.stringify(s));
  const intro = await page.evaluate(() => {
    const S = window.CAMPAIGN_LIVE.stage, api = window.MP_GAME_LIVE;
    return { bars: getComputedStyle(document.querySelector('#cmp .bars')).display, cine: !!api.cinematic,
      seated: ['payback', 'molotov', 'alec', 'mike', 'spite'].every((k) => S.cast[k].visible && !!S.cast[k].ride),
      heliY: S.heli.y, squadAway: S.ctx.allies.every((p) => p.scripted) };
  });
  check('a scene has the bars and the camera', intro.bars === 'block' && intro.cine, JSON.stringify(intro));
  check('the team is seated in the helicopter, in the air', intro.seated && intro.heliY > 20, JSON.stringify(intro));
  check('the squad in the match is put away for it', intro.squadAway);
  await run(6);
  const ride = await page.evaluate(() => {
    const S = window.CAMPAIGN_LIVE.stage, e = S.cast.payback, p = S.vLocal(S.heli, e.ride.l);
    return Math.hypot(e.pos.x - p[0], e.pos.y - p[1], e.pos.z - p[2]);
  });
  check('a rider stays in their seat as it flies (within 5 cm)', ride < 0.05, ride.toFixed(3));
  const facing = await page.evaluate(() => {
    const S = window.CAMPAIGN_LIVE.stage, H = S.heli, c = S.cast;
    // Each rider's heading, measured in the helicopter's own frame (0 = facing +Z of the cabin).
    const local = (e) => { let a = e.yaw - H.yaw; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    return { sides: ['payback', 'mike', 'molotov', 'alec', 'spite'].map((k) => Math.sign(c[k].ride.l[2])),
      pay: local(c.payback), alec: local(c.alec), heliYaw: H.yaw };
  });
  check('the team sits down both sides of the hold', facing.sides.join(',') === '1,1,1,-1,-1', JSON.stringify(facing));
  check('and the two benches face each other across it', Math.abs(Math.abs(facing.pay) - Math.PI) < 0.05 && Math.abs(facing.alec) < 0.05, JSON.stringify(facing));

  await skip();
  s = await st();
  check('holding Skip ends the scene and moves on', s.id === 'rooftop', JSON.stringify(s));
  check('a skipped scene is counted', s.stats.skipped === 1);
  check('the helicopter is on the pad after a skipped landing', await page.evaluate(() => Math.abs(window.CAMPAIGN_LIVE.stage.heli.y - 13.6) < 0.01));
  await run(3);
  check('Lincoln walks to meet them', await page.evaluate(() => window.CAMPAIGN_LIVE.stage.cast.lincoln.visible));
  await skip();

  // ---- down through the building ----
  s = await st();
  check('the stairs are a play step', s.id === 'stairs' && s.type === 'play', JSON.stringify(s));
  const roof = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, S = window.CAMPAIGN_LIVE.stage;
    return { y: M.you.pos.y, trail: S.squadMode === 'trail', puppets: S.ctx.allies.every((p) => p.puppet && p.alive),
      cast: S.ctx.allies.map((p) => p.cast).join(','), locked: document.getElementById('mpui') && document.getElementById('mpui').classList.contains('cine') };
  });
  check('you are on the roof', Math.abs(roof.y - 13.6) < 0.3, JSON.stringify(roof));
  check('the squad follows behind, dressed as themselves', roof.trail && roof.puppets && roof.cast === 'payback,molotov,alec,mike', JSON.stringify(roof));
  await run(1.5);
  const apart = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, S = window.CAMPAIGN_LIVE.stage;
    return S.ctx.allies.map((p) => +Math.hypot(p.pos.x - M.you.pos.x, p.pos.z - M.you.pos.z).toFixed(2));
  });
  check('and none of them stands inside you before you have moved', apart.every((d) => d > 0.5), JSON.stringify(apart));
  // The roof's own walk grid: walking east into the parapet stops you there.
  const edge = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match;
    M.spawnAt(M.you, [6.5, 13.6, -44.5], Math.PI / 2);
    for (let i = 0; i < 90; i++) M.control({ yaw: Math.PI / 2, pitch: 0, forward: 1, right: 0, run: false }, 1 / 30);
    return { x: M.you.pos.x, y: M.you.pos.y };
  });
  check('the parapet stops you at the roof edge', edge.x < 8.9 && Math.abs(edge.y - 13.6) < 0.3, JSON.stringify(edge));
  const stair = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match;
    return { roofGrid: M.navLevels && M.navLevels.length === 4, step: M.groundAt(5.85, -52, 12) };
  });
  check('each storey has its own walk grid, and the stairs are ground', stair.roofGrid && stair.step > 6.8 && stair.step < 13.6, JSON.stringify(stair));
  // Walk it, the way a player does (M.control and the storey grids), roof to front door.
  const walk = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, you = M.you;
    M.spawnAt(you, [-1.0, 13.6, -50.5], Math.PI);
    const R = [[3.6, -54.9], [5.2, -55.0], [7.9, -54.9], [7.9, -53.8], [7.9, -49.3], [7.0, -48.4], [4.2, -48.4], [5.85, -48.6],
      [5.85, -49.3], [5.85, -53.9], [5.6, -54.8], [7.9, -54.8], [7.9, -53.8], [7.9, -49.3], [7.0, -48.4], [5.85, -48.6],
      [5.85, -49.3], [5.85, -53.9], [5.0, -54.9], [4.0, -54.9], [-0.2, -48.0], [-0.2, -45.0], [0, -41.0]];
    const ys = [];
    for (let i = 0; i < R.length; i++) {
      let t = 0;
      while (Math.hypot(R[i][0] - you.pos.x, R[i][1] - you.pos.z) > 0.3) {
        const yaw = Math.atan2(R[i][0] - you.pos.x, R[i][1] - you.pos.z);
        M.control({ yaw: yaw, pitch: 0, forward: 1, right: 0, run: false }, 1 / 30);
        if ((t += 1 / 30) > 8) return { stuck: i, at: [you.pos.x, you.pos.y, you.pos.z], ys };
      }
      ys.push(Math.round(you.pos.y * 10) / 10);
    }
    return { done: true, at: [you.pos.x, you.pos.y, you.pos.z], ys };
  });
  check('you can walk down every flight from the roof to the front door', walk.done && walk.at[1] < 0.5, JSON.stringify(walk));
  await page.evaluate(() => { const M = window.MP_GAME_LIVE.match; M.spawnAt(M.you, [-2.5, 13.6, -47.2], Math.PI); });

  // ---- friendly fire ----
  const ff1 = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, S = window.CAMPAIGN_LIVE.stage, L = S.cast.lincoln, you = M.you;
    const from = { x: you.pos.x, y: you.pos.y + 1.6, z: you.pos.z };
    const dx = L.pos.x - from.x, dy = L.pos.y + 1.3 - from.y, dz = L.pos.z - from.z, d = Math.hypot(dx, dy, dz);
    S.shotRay(from, { x: dx / d, y: dy / d, z: dz / d }, 100);
    return { shown: getComputedStyle(S.$('.ff')).display, text: S.$('.ff').textContent };
  });
  check('shooting the sergeant cuts to black: friendly fire will not be tolerated', ff1.shown === 'flex' && /friendly fire will not be tolerated/i.test(ff1.text), JSON.stringify(ff1));
  await run(4);
  s = await st();
  check('and puts you back at the last checkpoint', s.id === 'stairs' && s.stats.ff === 1
    && await page.evaluate(() => getComputedStyle(window.CAMPAIGN_LIVE.stage.$('.ff')).display === 'none'), JSON.stringify(s));
  const ff2 = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, S = window.CAMPAIGN_LIVE.stage, a = S.ctx.allies[0];
    const hp = a.hp;
    M.damage(M.you, a, 10, false);
    return { hp: a.hp === hp, ff: window.CAMPAIGN_LIVE.stats.ff, shown: getComputedStyle(S.$('.ff')).display };
  });
  check('a squadmate who steps into your fire takes no damage and gets one warning', ff2.hp && ff2.ff === 1 && ff2.shown === 'none', JSON.stringify(ff2));
  await run(1);
  const ff3 = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, S = window.CAMPAIGN_LIVE.stage;
    M.damage(M.you, S.ctx.allies[0], 10, false);
    return { ff: window.CAMPAIGN_LIVE.stats.ff, shown: getComputedStyle(S.$('.ff')).display };
  });
  check('the second inside ten seconds is friendly fire', ff3.ff === 2 && ff3.shown === 'flex', JSON.stringify(ff3));
  await run(4);

  // ---- the street ----
  await page.evaluate(() => window.CAMPAIGN_LIVE.begin(3));
  await run(1);
  const street = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, h = M.people.filter((p) => p.team !== M.you.team && p.alive);
    return { n: h.length, hydra: h.every((p) => /^hydra\d$/.test(p.cast || '')), squad: window.CAMPAIGN_LIVE.stage.squadMode };
  });
  check('wave one comes up the street, dressed as Hydra', street.n === 6 && street.hydra, JSON.stringify(street));
  check('the squad fights as bots in the street', street.squad === 'fight');
  check('the battle is heard: music and the city fighting', await page.evaluate(() => { const B = window.CAMPAIGN_LIVE.stage._battle; return !!B && B.level === 1 && !B.off; }));

  // ---- the handoff: she holds the Desert Eagle out, and it goes with the scene ----
  await page.evaluate(() => window.CAMPAIGN_LIVE.begin(5));
  let held = false;
  for (let k = 0; k < 40 && !held; k++) {
    await run(0.5);
    held = await page.evaluate(() => { const h = window.CAMPAIGN_LIVE.stage.cast.payback._held; return !!(h && h.deagle && h.deagle[0].visible); });
  }
  check('Payback holds out her Desert Eagle in the handoff', held);
  await skip();
  await run(0.5);
  check('and it is gone from her hand when the scene ends', await page.evaluate(() => { const h = window.CAMPAIGN_LIVE.stage.cast.payback._held; return !h || !h.deagle || h.deagle.every((p) => !p.visible); }));

  // ---- the snipers ----
  await page.evaluate(() => window.CAMPAIGN_LIVE.begin(6));
  await run(1);
  const snip = await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, h = M.people.filter((p) => p.team !== M.you.team && p.alive);
    return { n: h.length, high: h.every((p) => p.puppet && p.pos.y > 3), gun: M.you.guns[0].id };
  });
  check('six snipers at their windows', snip.n === 6 && snip.high, JSON.stringify(snip));
  check('you are holding Payback\'s Desert Eagle', snip.gun === 'deagle', snip.gun);

  // ---- the end ----
  await page.evaluate(() => window.CAMPAIGN_LIVE.begin(11));
  await run(1);
  check('the debrief is in the office', await page.evaluate(() => { const S = window.CAMPAIGN_LIVE.stage; return S.cast.lincoln.pos.x < -295 && S.cast.molotov.visible; }));
  await skip();
  await run(1);
  s = await st();
  check('the mission completes', s.done, JSON.stringify(s));
  await page.waitForTimeout(3500);
  const pass = await page.evaluate(() => {
    const el = window.CAMPAIGN_LIVE.stage.$('.pass'), r = window.CAMPAIGN_LIVE.result;
    return { shown: getComputedStyle(el).display, head: el.querySelector('.h').textContent, buttons: Array.from(el.querySelectorAll('button')).map((b) => b.textContent),
      stars: r && r.stars, pct: r && r.pct, why: r && r.why };
  });
  check('the battle falls quiet for Mission Passed', await page.evaluate(() => !window.CAMPAIGN_LIVE.stage._battle));
  check('MISSION PASSED is on the screen', pass.shown === 'flex' && /mission passed/i.test(pass.head), JSON.stringify(pass));
  check('with restart, next mission and main menu', pass.buttons.join('|') === 'Restart mission|Next mission|Main menu', pass.buttons.join('|'));
  check('friendly fire costs a star', pass.stars === 2 && pass.why.indexOf('Friendly fire') >= 0, JSON.stringify(pass));
  check('skipping cutscenes and missing the intel costs completion', pass.pct < 80, String(pass.pct));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
