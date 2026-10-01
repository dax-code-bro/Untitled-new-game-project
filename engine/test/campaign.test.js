#!/usr/bin/env node
/* THE CAMPAIGN, PLAYED.
 *
 * site/games/campaign.js plays a mission from campaign-missions.js on the
 * multiplayer engine. This drives one through every kind of step it has
 * and checks that each does what it says:
 *
 *   briefing     the card is up, the controls are held, the lines are spoken
 *   cutscene     the camera is the director's, the bars are on, it ends
 *   reach        standing in the place completes it
 *   eliminate    its hostiles appear, and killing them completes it
 *   interact     holding the key at the spot completes it
 *   defend       the timer runs while you are in the area; waves arrive
 *   checkpoint   is saved; dying puts you back at it, on that step
 *   speech       a line has a subtitle, and the ally saying it moves their mouth
 *   complete     the debrief, the card, and the mission marked done
 *
 * Usage: node engine/test/campaign.test.js
 */
const fs = require('fs'), path = require('path');
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
  await page.goto('file://' + path.join(ROOT, 'site/games/campaign.html'));
  await page.evaluate(() => { try { localStorage.removeItem('b9.campaign.v1'); } catch (e) { /* */ } });
  check('the mission list shows every mission', await page.evaluate(() => document.querySelectorAll('#menu .row').length === window.CAMPAIGN_MISSIONS.length));
  check('only the first is unlocked on a new save', await page.evaluate(() => document.querySelectorAll('#menu .row.locked').length === window.CAMPAIGN_MISSIONS.length - 1));

  // The first mission, with the long timers cut down so a test can play it.
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.CAMPAIGN_MISSIONS[0]));
    m.steps.forEach((s) => { if (s.seconds) s.seconds = Math.min(s.seconds, 3); (s.waves || []).forEach((w) => { w.delay = Math.min(w.delay, 1); }); });
    m.steps.forEach((s) => { if (s.shots) s.shots.forEach((sh) => { sh.seconds = 1.2; }); });
    document.getElementById('menu').style.display = 'none';
    window.__m = m;
    window.MP = CAMPAIGN.play(m, { index: 0, resume: false });
  });
  await page.waitForFunction(() => window.CAMPAIGN_LIVE && window.MP_GAME_LIVE && window.MP_GAME_LIVE.match, null, { timeout: 240000 });
  const frames = (n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const st = () => page.evaluate(() => window.CAMPAIGN_LIVE.state());

  // Briefing.
  const brief = await page.evaluate(() => ({ card: getComputedStyle(document.querySelector('#cmp .card')).display, head: document.querySelector('#cmp .card .h').textContent }));
  check('the briefing card is up with the mission title', brief.card === 'flex' && /first light/i.test(brief.head), JSON.stringify(brief));
  await frames(3);
  check('the briefing is being spoken', !!(await st()).speaking || (await st()).queue > 0);
  await page.evaluate(() => window.CAMPAIGN_LIVE.start());
  await frames(2);
  let s = await st();
  check('Begin starts the first step (a cutscene)', s.started && s.step === 0 && s.type === 'cutscene', JSON.stringify(s));
  check('a cutscene has the camera and the bars', await page.evaluate(() => !!window.MP_GAME_LIVE.cinematic && getComputedStyle(document.querySelector('#cmp .bars')).display === 'block'));
  // Let the camera run; skip the lines.
  await frames(6);
  await page.evaluate(() => { window.MP_GAME_LIVE.skipHeld = () => true; });
  await frames(3);
  await page.evaluate(() => { window.MP_GAME_LIVE.skipHeld = () => false; });
  s = await st();
  check('the cutscene ends and hands the camera back', s.step === 1 && s.type === 'reach' && await page.evaluate(() => !window.MP_GAME_LIVE.cinematic), JSON.stringify(s));
  check('the objective is on screen', /high street/i.test(await page.evaluate(() => document.querySelector('#cmp .obj .t').textContent)));
  check('the checkpoint is saved', await page.evaluate(() => { const v = CAMPAIGN.loadSave(); return !!(v.progress && v.progress['first-light'] && v.progress['first-light'].step === 1); }));

  // Reach: stand in the place.
  await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, c = CAMPAIGN.placeOf(M, window.__m.steps[1].at);
    M.spawnAt(M.you, [c.x, c.z], M.you.yaw);
  });
  await frames(3);
  s = await st();
  check('reaching the place completes the step', s.step === 2 && s.type === 'eliminate', JSON.stringify(s));
  check('the hostiles it calls for are in play', s.alive === 5, s.alive);
  // A line of our own, so the check does not depend on how far the step's lines have got.
  await page.evaluate(() => window.CAMPAIGN_LIVE.say([{ who: 'Reyes', text: 'Watch the windows on the left, moving up now.', emotion: 'focus' }]));
  const heard = await page.waitForFunction(() => {
    const sub = document.querySelector('#cmp .sub');
    if (getComputedStyle(sub).display !== 'block' || !/Reyes/.test(sub.textContent)) return false;
    const M = window.MP_GAME_LIVE.match;
    const face = M.people.filter((p) => p.name === 'Reyes').map((p) => p.actor && p.actor.face)[0];
    return { sub: sub.textContent, face: !!(face && face.speaking) };
  }, null, { timeout: 60000, polling: 100 }).then((h) => h.jsonValue()).catch(() => null);
  check('a line is subtitled with who says it', !!heard, JSON.stringify(heard));
  check('the ally saying it is saying it with their face', !!(heard && heard.face));

  // Eliminate: kill them.
  await page.evaluate(() => { const M = window.MP_GAME_LIVE.match; M.people.forEach((p) => { if (p.team !== M.you.team && p.alive) M.damage(M.you, p, 999, true); }); });
  await frames(4);
  s = await st();
  check('killing them all completes the step', s.step === 3 && s.type === 'interact', JSON.stringify(s));

  // Interact: hold the key at the spot.
  await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, c = CAMPAIGN.placeOf(M, window.__m.steps[3].at);
    M.spawnAt(M.you, [c.x, c.z], M.you.yaw);
    window.MP_GAME_LIVE.interactHeld = () => true;
  });
  await page.waitForFunction(() => window.CAMPAIGN_LIVE.state().step >= 4, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { window.MP_GAME_LIVE.interactHeld = () => false; });
  s = await st();
  check('holding the key at the spot completes the step', s.step === 4 && s.type === 'defend', JSON.stringify(s));

  // Defend: stay in the area; waves arrive; then they die.
  await page.waitForFunction(() => window.CAMPAIGN_LIVE.state().alive > 0, null, { timeout: 120000 }).catch(() => {});
  check('a wave arrives while you hold', (await st()).alive > 0);
  // Dying: you go down and come back at the checkpoint, on the same step.
  await page.evaluate(() => { const M = window.MP_GAME_LIVE.match; M.damage(null, M.you, 999, true); });
  await frames(2);
  check('killed: the card says so', /killed/i.test(await page.evaluate(() => document.querySelector('#cmp .card .k').textContent)));
  await page.waitForFunction(() => window.MP_GAME_LIVE.match.you.alive, null, { timeout: 120000 }).catch(() => {});
  s = await st();
  check('back at the checkpoint, on that step', s.step === 4 && await page.evaluate(() => window.MP_GAME_LIVE.match.you.alive), JSON.stringify(s));
  // Now hold it and clear the waves.
  await page.waitForFunction(() => {
    const M = window.MP_GAME_LIVE.match;
    M.people.forEach((p) => { if (p.team !== M.you.team && p.alive) M.damage(M.you, p, 999, true); });
    return window.CAMPAIGN_LIVE.state().step >= 5;
  }, null, { timeout: 240000, polling: 400 }).catch(() => {});
  s = await st();
  check('holding the area through the timer completes it', s.step === 5 && s.type === 'reach', JSON.stringify(s));

  // The last reach, and the mission is done.
  await page.evaluate(() => {
    const M = window.MP_GAME_LIVE.match, c = CAMPAIGN.placeOf(M, window.__m.steps[5].at);
    M.spawnAt(M.you, [c.x, c.z], M.you.yaw);
  });
  await page.waitForFunction(() => window.CAMPAIGN_LIVE.state().done, null, { timeout: 60000 }).catch(() => {});
  check('the mission completes', (await st()).done);
  check('and is saved as done (unlocking the next)', await page.evaluate(() => !!(CAMPAIGN.loadSave().done || {})['first-light']));
  await page.waitForFunction(() => /complete/i.test(document.querySelector('#cmp .card .k').textContent), null, { timeout: 30000 }).catch(() => {});
  check('the debrief card is shown', /complete/i.test(await page.evaluate(() => document.querySelector('#cmp .card .k').textContent)));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(process.env.OUT_DIR || '/tmp', 'campaign-end.png') });
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
