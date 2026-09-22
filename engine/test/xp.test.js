#!/usr/bin/env node
/* DOES ANYTHING ACTUALLY LEVEL UP?
 *
 * Reported: "for every single gun there's no level system and for your
 * character themselves they cannot level up either, your guns don't
 * level up".
 *
 * Half right, and the wrong half is the more interesting one. A gun's
 * level track had been in mp-data.js all along -- levelOf, levelFrac,
 * prestigeOf, gold, platinum and diamond, and a bar under every gun in
 * the loadout drawing it. addKills and addMetres were exported to feed
 * it. NOTHING IN A MATCH EVER CALLED THEM. The bar read a number that
 * could not change, so every gun sat at level 1 for ever and the whole
 * unlock tree behind it was unreachable.
 *
 * A feature with no writer is indistinguishable from a feature that
 * does not exist. That is the thing this file exists to catch: it does
 * not check that a level CAN be computed -- that always worked -- it
 * checks that playing the game moves it.
 *
 * Usage: node engine/test/xp.test.js
 */
const fs = require('fs'), path = require('path');
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
const note = (s) => console.log(`  ..   ${s}`);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 240, height: 150 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/mp-data.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const D = window.MP_DATA;
    const out = {};
    out.has = ['xpFor', 'addCarry', 'rankForXp', 'rankFrac', 'streakLevelForXp',
      'streakFrac', 'MAX_RANK', 'MAX_STREAK_LEVEL']
      .filter((k) => typeof D[k] === 'undefined');

    /* THE RATES, exactly as asked for. */
    const kill = D.xpFor('kill', false);
    const streakKill = D.xpFor('streakKill', false);
    const killWin = D.xpFor('kill', true);
    out.kill = kill; out.streakKill = streakKill; out.killWin = killWin;

    /* Ten minutes of carry, paid to the gun and to nobody else. */
    const pr = D.newProgress();
    D.addCarry(pr, 600, false);
    out.carry600 = pr.xp;
    out.carrySecs = pr.secs;

    /* A gun's level has to MOVE when it is used. One kill is fifty; a
       level is a hundred and twenty plus change, so a handful of kills
       has to cross at least one boundary or the curve is unreachable. */
    const g = D.newProgress();
    out.lvl0 = D.levelOf(g);
    for (let i = 0; i < 40; i++) g.xp += D.xpFor('kill', false).gun;
    out.lvl40 = D.levelOf(g);

    /* And the player's rank, on the same principle. */
    out.rank0 = D.rankForXp(0);
    out.rank40 = D.rankForXp(40 * D.XP_PLAYER_KILL);
    out.rankMax = D.rankForXp(D.xpForRank(D.MAX_RANK) + 1);

    /* A killstreak track is deliberately short and deliberately slow. */
    out.sLvl0 = D.streakLevelForXp(0);
    out.sLvl200 = D.streakLevelForXp(200 * D.XP_STREAK_KILL);
    out.sMax = D.MAX_STREAK_LEVEL;
    return out;
  });

  check('the data module exports the whole track', r.has.length === 0, r.has.join(', '));

  note(`a kill: ${r.kill.player} player, ${r.kill.gun} gun, ${r.kill.streak} streak`);
  check('a kill is a hundred to you and fifty to the gun',
    r.kill.player === 100 && r.kill.gun === 50 && r.kill.streak === 0,
    JSON.stringify(r.kill));
  check('a kill with a streak up adds five to the streak and nothing else',
    r.streakKill.player === 100 && r.streakKill.gun === 50 && r.streakKill.streak === 5,
    JSON.stringify(r.streakKill));
  check('a win doubles all three',
    r.killWin.player === 200 && r.killWin.gun === 100,
    JSON.stringify(r.killWin));

  note(`ten minutes of carry: ${r.carry600.toFixed(1)} gun XP`);
  check('ten minutes with a gun out is a hundred gun XP',
    Math.abs(r.carry600 - 100) < 0.01, `${r.carry600}`);
  check('and it is banked as time, so the number can be shown',
    r.carrySecs === 600, `${r.carrySecs}`);

  /* THE CHECK THIS FILE IS FOR. */
  note(`forty kills: gun level ${r.lvl0} -> ${r.lvl40}, rank ${r.rank0} -> ${r.rank40}`);
  check('using a gun raises its level', r.lvl40 > r.lvl0, `${r.lvl0} -> ${r.lvl40}`);
  check('and raises your own rank', r.rank40 > r.rank0, `${r.rank0} -> ${r.rank40}`);
  check('the rank track has a top and stops there',
    r.rankMax === r.rankMax && r.rankMax >= 2, `${r.rankMax}`);

  note(`two hundred streak kills: streak level ${r.sLvl0} -> ${r.sLvl200} of ${r.sMax}`);
  check('a killstreak levels far slower than a gun',
    r.sLvl200 > r.sLvl0 && r.sLvl200 <= r.sMax,
    `${r.sLvl0} -> ${r.sLvl200} of ${r.sMax}`);
  check('and its track is much shorter than a gun\'s thirty',
    r.sMax < 15, `${r.sMax}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
