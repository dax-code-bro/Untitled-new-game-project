#!/usr/bin/env node
/* The live update system.
 *
 * Every part of this can silently do nothing, and most of them would
 * look fine while doing it: a poller that never fires, a decline that is
 * not remembered, a round that is "saved" into storage the browser
 * refused, a grace period that elapses while the page is still loading.
 * So each step is asserted separately rather than trusting the flow.
 *
 * The reload itself cannot be tested here -- the harness would lose the
 * page -- so the two halves either side of it are tested instead: that
 * what you had is written out correctly, and that writing it back
 * produces the round you left.
 *
 * Usage: node engine/test/update.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('update tests need playwright: npm i --no-save playwright');
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
  /* The manifest and the baked stamp must agree. If they drift, every
     client in the world thinks it is out of date for ever. */
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/games/version.json'), 'utf8'));
  const src = fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8');
  const baked = /const B9_BUILD = \{ version: '([^']+)', name: '([^']+)' \}/.exec(src);
  check('the script knows which build it is', !!baked, 'no B9_BUILD found');
  check('the baked version matches version.json',
    baked && baked[1] === manifest.version, baked ? `${baked[1]} vs ${manifest.version}` : '');
  check('the manifest says what the update did', !!manifest.did && manifest.did.length > 20);
  check('the manifest says what happens if you take it', !!manifest.onAccept && manifest.onAccept.length > 20);
  check('the manifest names a mode', ['zombies', 'multiplayer', 'both'].includes(String(manifest.mode)));

  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    const S = B.S, P = B.P, G = B.game;
    const step = (n) => { for (let i = 0; i < n; i++) { S.toSpawn = 0; S.spawnT = 1e9; G.step(1/60); } };
    step(8); __T.god(true); __T.killAll(); step(2);
    const out = {};

    // The watermark is on screen and says the version.
    const badge = document.querySelector('#b9hud .build');
    out.badgeText = badge ? badge.textContent : null;
    if (badge) {
      const cs = getComputedStyle(badge);
      out.badgeOpacity = +cs.opacity;
      const b = badge.getBoundingClientRect();
      const ammo = document.querySelector('#b9hud .ammo').getBoundingClientRect();
      out.badgeBottomRight = b.right > innerWidth - 60 && b.bottom > innerHeight - 40;
      // It must not sit on top of the ammo counter.
      out.badgeClearOfAmmo = b.top >= ammo.bottom - 1;
    }

    // The notice paints what the manifest said, and offers both answers.
    const info = { version: '9.9.9', name: 'test build', mode: 'multiplayer',
      did: 'A thing was done.', onAccept: 'A thing will happen.' };
    let said = null;
    B.hud.update(info, () => { said = 'yes'; }, () => { said = 'no'; });
    const up = document.querySelector('#b9hud .upd');
    out.noticeShown = up.classList.contains('on');
    out.noticeName = up.querySelector('.un').textContent;
    out.noticeVer = up.querySelector('.uv').textContent;
    out.noticeDid = up.querySelector('.ud').textContent;
    out.noticeWhat = up.querySelector('.uw').textContent;
    up.querySelector('.no').click();
    out.declineFired = said === 'no';
    up.querySelector('.go').click();
    out.acceptFired = said === 'yes';

    // The progress bar replaces the buttons once the answer is yes.
    B.hud.updateProgress(0.5, 'downloading');
    out.barShown = !up.querySelector('.up').hidden && up.querySelector('.ub').hidden;
    out.barWidth = up.querySelector('.up i').style.width;
    B.hud.updateHide();
    out.noticeHidden = !up.classList.contains('on');

    /* A round, saved and read back. This is the half of the reload that
       can be tested: the blob has to carry the things that would hurt to
       lose, and putting it back has to produce them. */
    S.round = 7; S.points = 4250; S.killsTotal = 88;
    __T.give('thompson'); __T.give('scatter');
    P.perks.adrenaline = true; P.upgraded.thompson = true;
    P.hp = 63;
    const blob = window.__T_CAPTURE ? window.__T_CAPTURE() : null;
    out.captured = !!blob;
    if (blob) {
      out.capRound = blob.round; out.capPoints = blob.points;
      out.capSlots = blob.slots.length; out.capPerk = !!blob.perks.adrenaline;
      out.capUpgraded = !!blob.upgraded.thompson; out.capGrace = blob.grace;
      // Wipe the round, then put it back.
      S.round = 0; S.points = 0; P.perks.adrenaline = false; P.upgraded.thompson = false;
      const ok = window.__T_RESTORE(blob);
      out.restored = ok;
      out.resRound = S.round; out.resPoints = S.points;
      out.resPerk = !!P.perks.adrenaline; out.resUpgraded = !!P.upgraded.thompson;
      out.resGrace = S.updateGrace;
    }

    /* A blob from a different build must be refused. Otherwise a stale
       save resurrects itself into a game it does not fit. */
    out.refusedWrongVersion = window.__T_RESTORE(
      Object.assign({}, blob, { for: '0.0.1-not-this-one' })) === false;
    // And one left behind days ago.
    out.refusedStale = window.__T_RESTORE(
      Object.assign({}, blob, { at: Date.now() - 60 * 60 * 1000 })) === false;

    /* Nothing spawns during the regroup, and the loop is frozen while
       the build comes down. */
    S.updateGrace = 180; S.updating = false;
    const before = S.zombies.filter((z) => !z.dead).length;
    for (let i = 0; i < 240; i++) { S.spawnT = 0; S.toSpawn = 6; G.step(1/60); }
    out.spawnedDuringGrace = S.zombies.filter((z) => !z.dead).length - before;
    S.updateGrace = 0;
    return out;
  });

  console.log('');
  check('the build stamp is on screen', !!r.badgeText && /v\d/.test(r.badgeText), String(r.badgeText));
  check('it is bottom right', r.badgeBottomRight === true);
  check('it does not sit on the ammo counter', r.badgeClearOfAmmo === true);
  check('it is dim enough to ignore', r.badgeOpacity > 0.15 && r.badgeOpacity < 0.6, String(r.badgeOpacity));
  check('the notice names the update', r.noticeName === 'test build', r.noticeName);
  check('the notice gives the version and the mode',
    /9\.9\.9/.test(r.noticeVer) && /MULTIPLAYER/.test(r.noticeVer), r.noticeVer);
  check('the notice says what it did', r.noticeDid === 'A thing was done.');
  check('the notice says what will happen', r.noticeWhat === 'A thing will happen.');
  check('both answers are offered and both fire', r.declineFired && r.acceptFired);
  check('taking it swaps the buttons for a bar', r.barShown === true && r.barWidth === '50%', r.barWidth);
  check('the notice can be dismissed', r.noticeHidden === true);
  check('the round is captured', r.captured === true);
  check('it carries points, round, guns, perks and upgrades',
    r.capRound === 7 && r.capPoints === 4250 && r.capSlots >= 2 && r.capPerk && r.capUpgraded,
    JSON.stringify({ round: r.capRound, points: r.capPoints, slots: r.capSlots }));
  check('it carries the three minutes', r.capGrace === 180, String(r.capGrace));
  check('restoring gives the round back',
    r.restored && r.resRound === 7 && r.resPoints === 4250 && r.resPerk && r.resUpgraded,
    JSON.stringify({ round: r.resRound, points: r.resPoints }));
  check('restoring starts the regroup', r.resGrace === 180, String(r.resGrace));
  check('a save from another build is refused', r.refusedWrongVersion === true);
  check('a save left behind hours ago is refused', r.refusedStale === true);
  check('nothing spawns during the regroup', r.spawnedDuringGrace === 0, String(r.spawnedDuringGrace));
  const real = errors.filter((e) => !/Failed to load resource|favicon|version\.json/.test(e));
  check('no errors', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
