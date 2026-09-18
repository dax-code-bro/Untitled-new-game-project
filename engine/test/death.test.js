#!/usr/bin/env node
/* SEVEN WAYS TO DIE, AND THEY SHOULD NOT LOOK THE SAME.
 *
 * Dying used to be one frame: alive goes false, card up. Seven things
 * can kill you in this game and every one of them ended identically,
 * which throws away the one moment the player is certainly watching.
 *
 * THE ORDERING IS THE PART THAT IS EASY TO GET WRONG. gameOver is both
 * "stop the round" and "put the card up", so setting it at the instant
 * of death does both at once and leaves nowhere for a sequence to
 * happen. The card has to WAIT: down first, shot second, card third.
 *
 * And the shots have to actually differ. A table of seven entries that
 * all produce the same camera is seven names for one animation, so the
 * camera is sampled part-way through each and they are required to be
 * distinguishable -- a fall looking straight up cannot land on the same
 * frame as a mauling turning to face what got you.
 *
 * Usage: node engine/test/death.test.js
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
  const page = await browser.newPage({ viewport: { width: 420, height: 280 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/coastline.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: 'bunker9' });
    const S = B.S, P = B.P, G = B.game, T = window.__T;
    for (let i = 0; i < 16; i++) G.step(1 / 60);
    const out = { runs: [] };
    const KINDS = ['melee', 'drown', 'fall', 'blast', 'projectile'];

    for (const kind of KINDS) {
      /* Put the round back on its feet between causes, so each one is
         measured from the same standing start rather than from wherever
         the last death left the camera. */
      S.dying = null; S.gameOver = false; P.alive = true;
      P.hp = P.maxHp;
      T.god(false);
      T.teleport(0, 1.2, 0);
      T.look(0, 0);
      for (let i = 0; i < 4; i++) G.step(1 / 60);

      const p = P.actor.position;
      // Something to have been killed BY, so a sequence that turns
      // toward its attacker has one to turn toward.
      const from = [p.x + 1.7, p.y + 1.0, p.z + 1.3];
      T.hurtMe(kind, from);
      const atDeath = { dying: !!S.dying, over: !!S.gameOver };

      // A third of the way in: past the start, well before the end.
      const d0 = T.dying();
      const want = d0 ? d0.dur * 0.34 : 0.8;
      let guard = 0;
      while (T.dying() && !T.dying().done && T.dying().t < want && guard++ < 400) G.step(1 / 60);
      const mid = T.dying();

      // And run it out to the end.
      guard = 0;
      while (S.dying && !S.dying.done && guard++ < 600) G.step(1 / 60);
      const end = T.dying();

      out.runs.push({ kind,
        dyingAtDeath: atDeath.dying, overAtDeath: atDeath.over,
        label: end && end.label,
        midEye: mid && mid.eye, midAt: mid && mid.at,
        overAfter: !!S.gameOver, doneAfter: !!(end && end.done) });
    }
    /* The card's own text, from the last run. */
    const t = document.querySelector('#b9hud .title');
    out.cardText = t ? (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null;
    return out;
  });

  note(JSON.stringify(r.runs.map((x) => ({ k: x.kind, l: x.label, at: x.midAt }))));

  /* THE ORDER. */
  const allDying = r.runs.every((x) => x.dyingAtDeath);
  const noneOver = r.runs.every((x) => !x.overAtDeath);
  check('dying starts the moment you are killed', allDying,
    r.runs.filter((x) => !x.dyingAtDeath).map((x) => x.kind).join(', '));
  check('and the card does NOT go up with the last point of health', noneOver,
    r.runs.filter((x) => x.overAtDeath).map((x) => x.kind).join(', ')
    + ' put the card up before the shot ran');
  check('the card comes up when the shot finishes',
    r.runs.every((x) => x.doneAfter && x.overAfter),
    r.runs.filter((x) => !x.overAfter).map((x) => x.kind).join(', '));

  /* AND THE SHOTS DIFFER. */
  const keys = r.runs.map((x) => (x.midAt || []).map((n) => n.toFixed(1)).join(','));
  const uniq = new Set(keys);
  check('the five deaths are five different camera moves',
    uniq.size === r.runs.length, `${uniq.size} distinct of ${r.runs.length}: ${keys.join('  |  ')}`);

  /* A FALL LOOKS UP. Its whole character, and the one that is checkable
     without deciding what "mauled" ought to look like. */
  const fall = r.runs.find((x) => x.kind === 'fall');
  check('a fall ends up looking at the sky',
    fall && fall.midAt && fall.midEye && fall.midAt[1] > fall.midEye[1] + 1.0,
    fall ? `target y ${fall.midAt[1]} against eye y ${fall.midEye[1]}` : 'no fall run');

  /* AND THE CARD SAYS WHAT DID IT. */
  check('the card names the cause', /MAULED|DROWNED|GROUND|DROP|BLAST|SHOT/.test(r.cardText || ''),
    r.cardText);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
