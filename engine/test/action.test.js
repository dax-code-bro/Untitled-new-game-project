#!/usr/bin/env node
/* DOES EACH GUN'S ACTION DO WHAT THAT ACTION ACTUALLY DOES?
 *
 * Every weapon in this game threw a case out of its side on every
 * shot, because the firing path called ejectShell with nothing asking
 * what kind of gun it was. For most of the armoury that is right. For
 * three kinds it is wrong:
 *
 *   A REVOLVER does not eject. The case stays in the chamber, the
 *   cylinder indexes round with it, and all of them come out together
 *   on the ejector rod when you open it. The Model 5 has been spitting
 *   brass out of a port it does not have since it was built.
 *
 *   A BOLT RIFLE ejects when your hand works the bolt, which on these
 *   is most of a second after the shot -- not when the striker falls.
 *
 *   A BREAK GUN ejects both at once when it opens.
 *
 * And nothing moved. `slide` is driven on firing and only the pistols
 * have one; every rifle, SMG and the machine gun carry their breech as
 * `bolt`, which only the reload ever touched. The automatic half of
 * the armoury fired with a dead action.
 *
 * So this counts brass and watches the breech, per weapon, through the
 * real firing path -- not through a unit test of the table, which
 * would only assert that I typed the table out twice.
 *
 * Usage: node engine/test/action.test.js
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
  const page = await browser.newPage({ viewport: { width: 360, height: 240 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  for (const f of ['site/engine/legend-engine.js', 'site/games/bunker-nine.js',
    'site/games/coastline.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
  }

  const r = await page.evaluate(async () => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: 'bunker9' });
    const S = B.S, G = B.game, P = B.P, T = window.__T;
    for (let i = 0; i < 20; i++) G.step(1 / 60);
    T.god(true);

    /* One of each action. The names are what the weapon table calls
       them; if one is renamed this fails loudly rather than quietly
       testing nothing, which is the failure mode of looking a weapon
       up and skipping when it is absent. */
    const WANT = [
      ['m1911', 'selfLoading'],
      ['mp5', 'selfLoading'],
      ['obliterator', 'revolver'],
      ['remington', 'manual'],
      /* `scatter`, not `scattergun` -- the first run of this named the
         builder rather than the weapon id and the existence check
         caught it. That check earning its place on its first outing is
         the argument for having it: without it the break gun would
         have been silently skipped and the suite would have reported
         all green while testing four of the five actions. */
      ['scatter', 'break'],
    ];
    const out = { guns: [], missing: [] };

    for (const [id, expect] of WANT) {
      if (!window.__T_WEAPONS || !window.__T_WEAPONS[id]) { out.missing.push(id); continue; }
      T.give(id);
      for (let i = 0; i < 30; i++) G.step(1 / 60);
      const v = P.view[P.equipped()];
      const gun = v && (v.kind === 'single' ? v.actor : v.root);
      const spec = window.__T_WEAPONS[id];

      /* Brass is counted off S.brass, which is the list the ejector
         pushes into -- so this measures the thing the player sees
         rather than the branch that decides it. */
      const before = S.brass.length;
      /* Where the breech sits before and at the peak of the cycle.
         Sampled a few frames apart because a half-sine peaks in the
         middle of the stroke and is back at rest by the end of it. */
      const boltOf = () => {
        const b = (v && v.bolt) || (gun && gun.slide);
        if (!b) return null;
        const p = b.position || b._position;
        return p ? [p.x, p.y, p.z] : null;
      };
      const rest = boltOf();
      P.cooldown = 0;
      T.hold({ fire: true });
      G.step(1 / 60);
      let moved = 0;
      for (let i = 0; i < 6; i++) {
        G.step(1 / 60);
        const b = boltOf();
        if (b && rest) {
          moved = Math.max(moved, Math.abs(b[0] - rest[0]) + Math.abs(b[1] - rest[1])
            + Math.abs(b[2] - rest[2]));
        }
      }
      T.release();
      const atShot = S.brass.length - before;

      // Then let the whole refire run, which is when a manual action
      // works its bolt and lets go of the case.
      for (let i = 0; i < 120; i++) G.step(1 / 60);
      const afterCycle = S.brass.length - before;

      out.guns.push({ id, expect, atShot, afterCycle,
        moved: +moved.toFixed(4), hasBolt: !!(v && v.bolt), hasSlide: !!(gun && gun.slide) });
    }
    /* AND THE MAGAZINE COLUMN, ON A GUN THAT HAS ONE.
     *
       The first cut of this asked the MP5 for its bands and got
       nothing, then failed with no message at all, because the branch
       was `else failed++`. Two faults in one line: it tested the wrong
       gun, and when it went wrong it would not say so.

       Rounds inside a magazine are built by the SERVICE ARM builder,
       which is what multiplayer's sixty weapons are made from -- the
       zombies rack has its own hand-built models. So the thing to ask
       is a service arm, and it is asked directly rather than through a
       viewmodel, because the rule now lives on the weapon (setRounds)
       and that is the unit worth testing. */
    out.rounds = { err: null };
    try {
      const arm = G.serviceArm('m4', { at: [0, -90, 0], physics: false });
      const bands = arm && arm.roundBands;
      if (!bands || !bands.length) {
        out.rounds.err = 'a service arm has no round bands at all';
      } else if (!arm.setRounds) {
        out.rounds.err = 'the arm has bands but no setRounds';
      } else {
        out.rounds.bands = bands.length;
        const shown = () => bands.filter((b) => b.some((a) => a.visible)).length;
        arm.setRounds(1); out.rounds.full = shown();
        arm.setRounds(0.5); out.rounds.half = shown();
        arm.setRounds(0); out.rounds.empty = shown();
        /* And that the bands are in lips-first order, which is the
           whole correctness question: at a quarter full it must be
           band 0 that is showing and not band 3. */
        arm.setRounds(0.26);
        out.rounds.lowestOn = bands.findIndex((b) => b.some((a) => a.visible));
        out.rounds.highestOn = bands.reduce(
          (acc, b, i) => (b.some((a) => a.visible) ? i : acc), -1);
      }
    } catch (e) { out.rounds.err = e.message; }
    return out;
  });

  note(JSON.stringify(r.guns));
  check('every weapon the test names still exists', r.missing.length === 0,
    'missing: ' + r.missing.join(', '));

  const by = {};
  for (const g of r.guns) by[g.id] = g;

  /* THE ONE THE PLAYER CALLED. A revolver throws nothing when fired. */
  if (by.obliterator) {
    check('a revolver ejects nothing when it is fired',
      by.obliterator.atShot === 0 && by.obliterator.afterCycle === 0,
      `${by.obliterator.atShot} at the shot, ${by.obliterator.afterCycle} by the end of the refire`);
  } else failed++;

  /* A bolt rifle holds its case until the hand works the bolt. Both
     halves asserted: nothing at the shot, and something afterwards --
     a rifle that never ejects at all is just as wrong. */
  if (by.remington) {
    check('a bolt rifle holds its case at the moment of firing',
      by.remington.atShot === 0, `${by.remington.atShot} cases at the shot`);
    check('and lets go of it when the bolt is worked',
      by.remington.afterCycle > 0, 'it never ejected at all');
  } else failed++;

  /* A break gun holds both cases until it is opened, which happens on
     the reload rather than on the shot or the refire. So within the
     window this test watches it should throw nothing at all. */
  if (by.scatter) {
    check('a break gun holds its cases until it is opened',
      by.scatter.atShot === 0 && by.scatter.afterCycle === 0,
      `${by.scatter.atShot} at the shot, ${by.scatter.afterCycle} by the end of the refire`);
  } else failed++;

  // And the self-loaders, which were always right and must stay so.
  for (const id of ['m1911', 'mp5']) {
    if (!by[id]) { failed++; continue; }
    check(`${id}: a self-loader throws brass on the shot`,
      by[id].atShot > 0, `${by[id].atShot} cases`);
  }

  /* AND THE BREECH MOVES. This is the half that was missing entirely
     on everything without a pistol slide. */
  if (by.mp5) {
    check('an SMG\'s bolt actually cycles when it fires',
      by.mp5.hasBolt && by.mp5.moved > 0.004,
      `bolt ${by.mp5.hasBolt ? 'present' : 'MISSING'}, moved ${by.mp5.moved} m`);
  } else failed++;
  if (by.m1911) {
    check('and a pistol\'s slide still does', by.m1911.moved > 0.004,
      `moved ${by.m1911.moved} m`);
  } else failed++;

  /* THE COLUMN OF ROUNDS GOES DOWN. Asserted in both directions and
     at both ends: full when full, none when empty, and fewer in
     between. A check that only looked at "empty" would pass on a
     magazine whose rounds were never drawn at all. */
  note('rounds ' + JSON.stringify(r.rounds));
  /* Never a bare `failed++`. A test that fails without saying why sends
     the next person looking in the wrong place, and this one already
     did exactly that once. */
  check('the magazine column could be measured at all',
    !!r.rounds && !r.rounds.err, r.rounds ? r.rounds.err : 'no result came back');
  if (r.rounds && !r.rounds.err) {
    check('a full magazine shows its whole column',
      r.rounds.full > 0 && r.rounds.full === r.rounds.bands,
      `${r.rounds.full} of ${r.rounds.bands} bands visible`);
    check('and an empty one shows none of it',
      r.rounds.empty === 0, `${r.rounds.empty} bands still visible at zero`);
    check('and a half-full one shows some of it',
      r.rounds.half > 0 && r.rounds.half < r.rounds.bands,
      `${r.rounds.half} of ${r.rounds.bands}`);
    /* The column empties from the BOTTOM, because the follower pushes
       the stack up behind the rounds leaving the top. So a nearly
       empty magazine keeps the band at the feed lips. */
    check('and it empties from the bottom, not the top',
      r.rounds.lowestOn === 0 && r.rounds.highestOn < r.rounds.bands - 1,
      `bands ${r.rounds.lowestOn}..${r.rounds.highestOn} on at a quarter full`);
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
