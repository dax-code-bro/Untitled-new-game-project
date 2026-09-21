#!/usr/bin/env node
/* DOES THE ATTACHMENT DO THE THING IT SAYS ON THE CARD?
 *
 * Reported: "the attachment, what it does doesn't apply". It was true of
 * three of them, and the reason nothing caught it is that every check in
 * the project asked whether the part FITS -- whether it appears on the
 * gun, whether the bench lets you buy it, whether the spec changes. All
 * of that passed. The Thermal Optic folded `thermal: true` onto the
 * weapon's spec, correctly, every frame. Nothing anywhere read it.
 *
 * So the question is not "did the spec change" but "does anybody look".
 * This asks the second one, and it asks it of every attachment rather
 * than the three that were reported, because the next one written will
 * have the same hole and nobody will notice for a month.
 *
 * HOW. Each part's fold() is run for real, in the page, against a real
 * weapon, and the keys it actually changes are read off the result --
 * no parsing of the source, so a fold that builds its object any way it
 * likes is still measured correctly. Then every changed key is looked
 * for in the game's source and the engine's, OUTSIDE the table that
 * declares it. A key that appears nowhere else is a promise on a card
 * with nothing behind it.
 *
 * Usage: node engine/test/attacheffect.test.js
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
  const gameSrc = fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8');
  const engSrc = fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8');
  /* The declaration itself does not count as a use, so the table is cut
     out of the haystack. Without this every key scores at least one hit
     and the check can never fail. */
  const a0 = gameSrc.indexOf('const ATTACH = {');
  const a1 = gameSrc.indexOf('\n};', a0) + 3;
  const outside = gameSrc.slice(0, a0) + gameSrc.slice(a1) + engSrc;
  check('the attachment table was found and cut out of the search',
    a0 > 0 && a1 > a0 && a1 - a0 > 2000, `${a0}..${a1}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 240, height: 150 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });

  const rows = await page.evaluate(() => {
    const B = window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 6; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1 / 60); }
    /* One zombie, on purpose. Without a body in the world the thermal
       half of this file measures the colour grade and nothing else --
       and the bodies are the part a colour grade cannot do. */
    __T.spawn();
    for (let i = 0; i < 20; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1 / 60); }
    const A = __T_SYS.ATTACH, out = [];
    /* A gun with every field a fold might touch, so nothing is skipped
       for want of a base value to change. */
    const base = __T_WEAPONS.thompson;
    for (const [id, part] of Object.entries(A.parts)) {
      let res = null, threw = null;
      try { res = part.fold(base); } catch (e) { threw = e.message; }
      const keys = [];
      if (res) for (const k of Object.keys(res)) {
        const before = base[k], after = res[k];
        if (typeof after === 'object' || before !== after) keys.push(k);
      }
      out.push({ id, name: part.name, slot: part.slot, cost: part.cost,
        blurb: part.blurb, keys, threw });
    }
    return out;
  });

  check('every attachment folds without throwing',
    rows.every((r) => !r.threw),
    rows.filter((r) => r.threw).map((r) => `${r.id}: ${r.threw}`).join(' | '));
  check('every attachment changes at least one thing',
    rows.every((r) => r.keys.length > 0),
    rows.filter((r) => !r.keys.length).map((r) => r.id).join(', '));

  /* THE CHECK THIS FILE EXISTS FOR. */
  const dead = [];
  for (const r of rows) {
    /* A PROPERTY ACCESS, NOT THE NAME ANYWHERE. The first version of
       this allowed a bare quoted string to count as a read, and it
       passed against the very build that had the fault: the model
       builder contains mount('thermal', opt) -- the name of the PART,
       for the lens that gets bolted on -- which has nothing to do with
       whether anybody reads the FLAG the part folds. Checked both ways
       against the commit before the fix: the loose form says all three
       optics are fine, the tight one names thermal, nightvision and
       rangefinder. A check that cannot fail on the bug it was written
       for is not a check. */
    const unread = r.keys.filter((k) => {
      const re = new RegExp('\\.' + k + '\\b|\\[\\s*[\'"]' + k + '[\'"]\\s*\\]');
      return !re.test(outside);
    });
    if (unread.length) dead.push({ r, unread });
  }
  note(`${rows.length} attachments, `
    + `${rows.reduce((n, r) => n + r.keys.length, 0)} effects between them`);
  check('every effect an attachment folds is read somewhere',
    dead.length === 0,
    dead.map((d) => `${d.r.id} (${d.r.cost} pts) sets ${d.unread.join(', ')} `
      + `and nothing reads it`).join('; '));

  /* AND THE THREE THAT WERE REPORTED, driven for real, because "the name
     appears somewhere" is a weaker claim than "looking through it changes
     the picture" and the second one is what was asked for. */
  const seen = await page.evaluate(() => {
    const B = window.B;
    const P = B.P, S = B.S, game = B.game;
    const post = game.renderer.post;
    const snap = () => ({ exposure: post.exposure, sat: post.saturation,
      grain: post.grain, mix: post.tintMix, tint: post.tint.slice() });
    const runOptic = (optic) => {
      P.fitted.thompson = optic ? { optic } : {};
      P.slots = ['thompson']; P.slot = 0;
      if (!P.ammo.thompson) P.give('thompson');
      P.ads = 1; P.adsWant = true;
      __T_SYS.applyOptic(game, S, P, P.spec(), { range() {} });
      return snap();
    };
    const hip = (() => { const r = runOptic(null); return r; })();
    const night = runOptic('nightvision');
    const therm = runOptic('thermal');
    /* And the bodies, which is the half a colour grade cannot do. */
    const z = (S.zombies || [])[0] || null;
    const zTint = z && z.actor && z.actor.tint
      ? [z.actor.tint.x, z.actor.tint.y, z.actor.tint.z] : null;
    runOptic(null);
    const zAfter = z && z.actor && z.actor.tint
      ? [z.actor.tint.x, z.actor.tint.y, z.actor.tint.z] : null;
    return { hip, night, therm, zTint, zAfter, hadZombie: !!z };
  });

  note(`no optic: exposure ${seen.hip.exposure.toFixed(2)}, tint mix `
    + `${seen.hip.mix.toFixed(2)}`);
  note(`night vision: exposure ${seen.night.exposure.toFixed(2)}, grain `
    + `${seen.night.grain.toFixed(3)}, tint mix ${seen.night.mix.toFixed(2)} `
    + `toward [${seen.night.tint.map((n) => n.toFixed(2)).join(', ')}]`);
  note(`thermal: contrast up, saturation ${seen.therm.sat.toFixed(2)}, tint mix `
    + `${seen.therm.mix.toFixed(2)} toward [${seen.therm.tint.map((n) => n.toFixed(2)).join(', ')}]`);

  check('with no optic the picture is left alone', seen.hip.mix < 0.001,
    `${seen.hip.mix}`);
  check('night vision gains up and goes green',
    seen.night.exposure > seen.hip.exposure * 1.5 && seen.night.mix > 0.5
      && seen.night.tint[1] > seen.night.tint[0] * 2,
    JSON.stringify(seen.night));
  check('and it is grainy, which is what the gain costs',
    seen.night.grain > seen.hip.grain * 3, `${seen.night.grain}`);
  check('thermal drains the colour and goes cold',
    seen.therm.sat < 0.05 && seen.therm.mix > 0.5
      && seen.therm.tint[2] > seen.therm.tint[0] * 2,
    JSON.stringify(seen.therm));
  if (seen.hadZombie) {
    check('and the bodies are the only warm thing in it',
      seen.zTint && seen.zTint[0] > 2,
      JSON.stringify(seen.zTint));
    check('with the tint taken off again when the optic comes down',
      seen.zAfter && Math.abs(seen.zAfter[0] - 1) < 1e-6,
      JSON.stringify(seen.zAfter));
  } else {
    note('no zombie was alive to tint, so the body half went unmeasured');
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
