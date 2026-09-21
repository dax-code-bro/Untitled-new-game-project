#!/usr/bin/env node
/* WHEN THE WEAPON GOES, DOES THE ARM GO WITH IT?
 *
 * Reported: "if you're using a battering ram and you push the batter ram
 * in front of you, your arms are there but beyond a short point your arm
 * is just invisible and not there."
 *
 * Nothing in the project could see it, for the same reason nothing could
 * see the stationary hand: every arm check measures one pose. The arm is
 * correct in that pose. What is wrong only exists in the second one.
 *
 * WHAT THIS MEASURES, in WORLD space, on the engine's own composed
 * matrices -- because the whole fault is that the arm is in the weapon's
 * frame and the shoulder is not:
 *
 *   - the WRIST, which must travel with the weapon, because the hand is
 *     holding it.
 *   - the SHOULDER end of the sleeve, which must NOT, because a shoulder
 *     is attached to a man. It is allowed to drift a few centimetres --
 *     the body does lean into a thrust -- and not two thirds of a metre.
 *   - the HAND, which must come out the size it was built. The stretch
 *     is applied to the arm the palm hangs off, so the obvious way to
 *     get this wrong is a hand that grows with it.
 *
 * Usage: node engine/test/reach.test.js
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
  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });

  const rows = await page.evaluate(() => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 8; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1 / 60); }
    const P = B.P, G = B.game, V3 = LegendEngine.Vec3, out = [];

    const world = (act, p) => {
      const chain = [];
      for (let a = act; a; a = a.parent) chain.unshift(a);
      for (const a of chain) a.updateMatrix();
      return new V3(p[0], p[1], p[2]).applyMat4(act.matrix);
    };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

    for (const [id, v] of Object.entries(P.view)) {
      const a = v.arms;
      if (!a || !a.rWrist || !a.sleeve) continue;
      const sx = a.shoulderX != null ? a.shoulderX : -0.07;
      /* The sleeve's own far end, in the weapon's space: the shoulder
         station, on the wrist's line. */
      const shoulder = [sx, a.rWrist[1], a.rWrist[2]];
      const rec = a.digits && a.digits.right;
      const d0 = rec && rec.digits && rec.digits[0];
      const tip = d0 && d0.tip ? d0.tip : null;
      const knuck = d0 && d0.joints && d0.joints[0] ? d0.joints[0] : null;

      /* THE WEAPON HAS TO MOVE TOO, and the first version of this forgot
         it. It passed `reach` to giveHands and left the weapon where it
         was, so it measured the stretch on its own and reported the
         shoulder travelling the full 620 mm -- on all twenty weapons, as
         a failure, against code that was doing exactly the right thing.
         The stretch takes the shoulder 620 mm BACK in the weapon's frame
         precisely so that a weapon 620 mm forward leaves it where it
         started in the world. Measuring one half of a cancellation tells
         you nothing about the sum. */
      const root = v.kind === 'single' ? v.actor : v.root;
      const home = root ? [root.position.x, root.position.y, root.position.z] : null;
      /* ALONG THE WEAPON'S OWN AXIS, which is what the stretch can
         absorb and is not the same direction as the camera's forward.
         The version before this moved the root along WORLD +X and got
         877 mm of shoulder travel on the 1911 -- correctly, because that
         pistol's local +X points about (0, -0.70, -0.72) at the hip, so
         moving it along world X is mostly ACROSS its arm. The game
         projects the thrust onto this same axis before handing it over;
         a test that moves the weapon somewhere the game never moves it
         measures a case that cannot happen. */
      const ax = new V3(1, 0, 0).applyQuat(root.rotation);
      const sample = (reach) => {
        if (root && home) {
          root.setPosition([home[0] + ax.x * reach, home[1] + ax.y * reach,
            home[2] + ax.z * reach]);
        }
        G.giveHands(a, { kick: 0, fire: 0, aim: 0, t: 0, reach });
        return {
          wrist: world(a.sleeve, a.rWrist),
          shoulder: world(a.sleeve, shoulder),
          tip: tip ? world(a.palm, tip) : null,
          knuck: knuck ? world(a.palm, knuck) : null,
        };
      };
      if (!root) continue;
      const at0 = sample(0);
      /* The ram's full thrust. Applied to every weapon on the rack, not
         only the ram, because whatever the arm does it must do the same
         way everywhere -- and a weapon that is never thrust is still a
         weapon this code runs on. */
      const at62 = sample(0.62);
      const back0 = sample(0);

      out.push({ id,
        wristMoved: +dist(at0.wrist, at62.wrist).toFixed(5),
        shoulderMoved: +dist(at0.shoulder, at62.shoulder).toFixed(5),
        handSpan0: at0.tip && at0.knuck ? +dist(at0.tip, at0.knuck).toFixed(5) : null,
        handSpan62: at62.tip && at62.knuck ? +dist(at62.tip, at62.knuck).toFixed(5) : null,
        restored: +dist(at0.wrist, back0.wrist).toFixed(6),
      });
    }
    return out;
  });

  note(`${rows.length} weapons measured through a 620 mm thrust`);
  check('every weapon has an arm to measure', rows.length >= 12, `${rows.length}`);

  /* THE HAND STAYS ON THE WEAPON. Nothing about reaching may move it,
     because the weapon has not moved in its own frame. */
  /* The hand goes WITH the weapon, all 620 mm of it, because it is
     holding the thing that moved. */
  const slipped = rows.filter((r) => Math.abs(r.wristMoved - 0.62) > 0.002);
  check('the wrist travels with the weapon it is holding',
    slipped.length === 0,
    slipped.map((r) => `${r.id} ${(r.wristMoved * 1000).toFixed(0)}mm`).join(', '));

  /* AND THE SHOULDER STAYS WITH THE MAN. This is the whole fault: it
     used to move by the full 620 mm, because it was glued to the gun. */
  const carried = rows.filter((r) => r.shoulderMoved < 0.05);
  note(`the weapon and the hand travel 620 mm; the shoulder end travels `
    + `${(rows.reduce((n, r) => Math.max(n, r.shoulderMoved), 0) * 1000).toFixed(1)} mm at most`);
  check('the shoulder end stays behind while the weapon goes forward',
    carried.length === rows.length,
    rows.filter((r) => r.shoulderMoved >= 0.05)
      .map((r) => `${r.id} ${(r.shoulderMoved * 1000).toFixed(0)}mm`).join(', '));

  /* THE HAND DOES NOT GROW. The arm is scaled and the palm hangs off it,
     so this is the exact way the fix could go wrong. */
  const spans = rows.filter((r) => r.handSpan0 != null);
  const grew = spans.filter((r) => Math.abs(r.handSpan62 - r.handSpan0) > 0.0015);
  note(`a finger's knuckle-to-tip span: `
    + `${(spans[0].handSpan0 * 1000).toFixed(1)} mm at rest, `
    + `${(spans[0].handSpan62 * 1000).toFixed(1)} mm at full reach`);
  check('the hand comes out the size it was built, however far the arm reaches',
    grew.length === 0,
    grew.map((r) => `${r.id} ${(r.handSpan0 * 1000).toFixed(1)} -> `
      + `${(r.handSpan62 * 1000).toFixed(1)}mm`).join(', '));

  /* AND IT GOES BACK. A swing ends; nothing may be left stretched. */
  const stuck = rows.filter((r) => r.restored > 1e-4);
  check('and it returns exactly when the thrust ends', stuck.length === 0,
    stuck.map((r) => `${r.id} ${(r.restored * 1000).toFixed(2)}mm`).join(', '));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
