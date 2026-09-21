#!/usr/bin/env node
/* DOES THE HAND ITSELF MOVE, OR ONLY THE FINGERS ON IT?
 *
 * Reported: "it looks like the hand is just a stationary object and
 * finger placement is the only thing that moves". That was true and
 * nothing in the project could see it. grip.test.js and
 * sightblock.test.js both measure the hand AT REST -- where it sits on
 * the weapon and what it is touching -- and a casting welded to a
 * receiver passes both perfectly. Neither of them has any notion of a
 * second pose, so "the hand never moves" was outside every check.
 *
 * WHAT THIS MEASURES. The hand in two poses: at rest, and at the top of
 * a recoil stroke. Then, in the weapon's own frame:
 *
 *   - the WRIST, which must stay on the arm, because it is the joint. A
 *     hand that turns about anything else is a hand coming off a
 *     forearm, and that is the failure mode this change could have
 *     introduced.
 *   - a KNUCKLE, which must move, or the hand is still a prop.
 *   - the DIFFERENCE between what the knuckle travels and what the wrist
 *     travels. That is the real test: under a pure translation every
 *     point on the hand moves by exactly the same amount, so any gap
 *     between two of them is a joint turning and a slide cannot produce
 *     it at any magnitude.
 *   - and the hand at rest must be EXACTLY the hand the contact tests
 *     measure, to the micron, or their numbers stop meaning anything.
 *
 * THE FIRST VERSION OF THAT THIRD CHECK WAS WRONG and is worth keeping
 * written down, because it failed on all fifteen weapons and the code
 * was right. It asked for the FINGERTIP to outrun the knuckle, on the
 * reasoning that a tip is further out along the lever. On a closed hand
 * it is not: the finger has wrapped back round the grip, so the tip is
 * nearer the wrist than its own knuckle is and turns through a smaller
 * radius -- measured, by 1.1 to 2.5 mm. Comparing against the wrist
 * instead needs no assumption about where a curled finger ends up.
 *
 * Measured in world space on the engine's own composed matrices rather
 * than by re-doing the arithmetic the code under test does. The weapon
 * does not move between the two samples, so a world-space DIFFERENCE is
 * the hand's own motion turned into world, and a length is unchanged by
 * that turn.
 *
 * Usage: node engine/test/wrist.test.js
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
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 8; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1 / 60); }
    const P = B.P, G = B.game, out = [];
    const V3 = LegendEngine.Vec3;

    /* World position of a point authored in the weapon's space, through
       whichever actor now carries it. Every ancestor is recomposed first
       because the chain is weapon -> forearm -> palm and a stale parent
       silently reports the pose from two frames ago. */
    const world = (act, p) => {
      const chain = [];
      for (let a = act; a; a = a.parent) chain.unshift(a);
      for (const a of chain) a.updateMatrix();
      return new V3(p[0], p[1], p[2]).applyMat4(act.matrix);
    };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

    for (const [id, v] of Object.entries(P.view)) {
      const w = __T_WEAPONS[id];
      if (!w || w.melee || w.tool) continue;
      const a = v.arms;
      if (!a || !a.palm || a.palm === a.skin || !a.rWrist) continue;
      const rec = a.digits && a.digits.right;
      const d0 = rec && rec.digits && rec.digits[0];
      if (!d0 || !d0.joints || !d0.joints.length || !d0.tip) continue;
      const knuckle = d0.joints[0], tip = d0.tip;

      const sample = (o) => {
        G.giveHands(a, o);
        return {
          wristOnPalm: world(a.palm, a.rWrist),
          wristOnArm: world(a.skin, a.rWrist),
          knuckle: world(a.palm, knuckle),
          tip: world(a.palm, tip),
        };
      };
      /* Rest is the pose every contact test measures. Peak is the top of
         a recoil stroke on the heaviest weapon in the game. */
      const rest = sample({ kick: 0, fire: 0, aim: 0, t: 0 });
      const restRot = [a.palm.rotation.x, a.palm.rotation.y, a.palm.rotation.z,
        a.palm.rotation.w];
      const peak = sample({ kick: 0.06, fire: 1, aim: 0, t: 0 });
      /* BREATH IS AN AMPLITUDE, NOT AN OFFSET, and the first version of
         this measured the offset. It sampled one instant against the
         rest pose and called the distance "breath" -- but the rest pose
         is t = 0, where one of the two breath terms is at cos(0) and
         therefore at full deflection, so the baseline was itself a
         breathing hand. Aiming shrank both the sample and the baseline
         and the distance between them went UP. Swept over a full cycle
         instead: the spread of the fingertip across the sweep is the
         amplitude, and it needs no baseline at all. */
      const swing = (aim) => {
        let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
        for (let i = 0; i < 48; i++) {
          const q = sample({ kick: 0, fire: 0, aim, t: i * 0.55 });
          const v = [q.tip.x, q.tip.y, q.tip.z];
          for (let k = 0; k < 3; k++) {
            if (v[k] < lo[k]) lo[k] = v[k];
            if (v[k] > hi[k]) hi[k] = v[k];
          }
        }
        return Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
      };
      const freeSwing = swing(0), heldSwing = swing(1);
      G.giveHands(a, { kick: 0, fire: 0, aim: 0, t: 0 });

      out.push({ id,
        // how far the wrist strayed from the arm it is on, worst of the two
        seam: +Math.max(dist(rest.wristOnPalm, rest.wristOnArm),
          dist(peak.wristOnPalm, peak.wristOnArm)).toFixed(6),
        knuckle: +dist(rest.knuckle, peak.knuckle).toFixed(6),
        tip: +dist(rest.tip, peak.tip).toFixed(6),
        wristTravel: +dist(rest.wristOnPalm, peak.wristOnPalm).toFixed(6),
        breathTip: +freeSwing.toFixed(6),
        heldTip: +heldSwing.toFixed(6),
        restRot: restRot.map((n) => +n.toFixed(9)),
      });
    }
    return out;
  });

  note(`${rows.length} weapons with a palm on a wrist`);
  check('the palm is its own actor on every weapon', rows.length >= 12, `${rows.length}`);

  /* AT REST, NOTHING. grip and sightblock both measure the hand with no
     give applied, and this file would be worth nothing if it let the
     rest pose drift: their numbers are the only reason to believe the
     hand is on the gun at all. Exact identity, not a tolerance. */
  const moved = rows.filter((r) => r.restRot[0] !== 0 || r.restRot[1] !== 0
    || r.restRot[2] !== 0 || r.restRot[3] !== 1);
  check('the resting hand is untouched, so the contact tests still hold',
    moved.length === 0, moved.map((r) => `${r.id} ${r.restRot.join(',')}`).join(' | '));

  /* THE JOINT IS THE WRIST. */
  const worstSeam = rows.reduce((a, b) => (b.seam > a.seam ? b : a), rows[0]);
  note(`the wrist strays from the forearm by at most `
    + `${(worstSeam.seam * 1000).toFixed(3)} mm (${worstSeam.id})`);
  check('the hand turns about its wrist and nowhere else',
    rows.every((r) => r.seam < 0.0002),
    rows.filter((r) => r.seam >= 0.0002)
      .map((r) => `${r.id} ${(r.seam * 1000).toFixed(2)}mm`).join(', '));

  /* AND IT ACTUALLY MOVES. */
  const still = rows.filter((r) => r.knuckle < 0.003);
  check('the hand itself moves through a recoil stroke, not just its fingers',
    still.length === 0,
    still.map((r) => `${r.id} ${(r.knuckle * 1000).toFixed(1)}mm`).join(', '));

  /* THE ONE THAT A SLIDE CANNOT FAKE. */
  const rigid = rows.filter((r) => Math.abs(r.knuckle - r.wristTravel) < 0.001);
  const lead = rows.map((r) => Math.abs(r.knuckle - r.wristTravel)).sort((x, y) => x - y);
  note(`knuckle and wrist travel differ by `
    + `${(lead[0] * 1000).toFixed(1)} to ${(lead[lead.length - 1] * 1000).toFixed(1)} mm `
    + `-- under a pure slide this would be zero on every weapon`);
  check('two points on the same hand travel different distances',
    rigid.length === 0,
    rigid.map((r) => `${r.id} knuckle ${(r.knuckle * 1000).toFixed(1)} `
      + `wrist ${(r.wristTravel * 1000).toFixed(1)}`).join(', '));

  /* A HAND DOING NOTHING IS STILL NOT STILL -- and on the sights it
     nearly is, which is the other half of the same claim. */
  const dead = rows.filter((r) => r.breathTip < 0.0002);
  check('a hand that is not firing still breathes', dead.length === 0,
    dead.map((r) => `${r.id} ${(r.breathTip * 1000).toFixed(2)}mm`).join(', '));
  const jittery = rows.filter((r) => r.heldTip > r.breathTip * 0.45);
  note(`breath at the fingertip, swept over a full cycle: `
    + `${(rows[0].breathTip * 1000).toFixed(2)} mm free, `
    + `${(rows[0].heldTip * 1000).toFixed(2)} mm on the sights`);
  check('and it steadies down the sights', jittery.length === 0,
    jittery.map((r) => `${r.id} ${(r.heldTip * 1000).toFixed(2)} vs `
      + `${(r.breathTip * 1000).toFixed(2)}`).join(', '));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
