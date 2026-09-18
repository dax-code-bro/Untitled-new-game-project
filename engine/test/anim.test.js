#!/usr/bin/env node
/* EVERY CLIP, EVERY FRAME, MEASURED.
 *
 * "Some of them the legs go off the character, or they phase through
 * different parts, or some parts don't move." Those are three
 * different faults and all three are measurable, which means none of
 * them should ever have to be found by watching.
 *
 * For every clip in the humanoid set, sampled across its whole
 * length, this asks:
 *
 *   IS ANYTHING A NaN?  One bad key poisons a bone and everything
 *   hanging off it, and a NaN bone renders as nothing at all -- the
 *   limb simply is not there, which reads as a missing arm rather than
 *   as a broken animation.
 *
 *   IS A LIMB INSIDE THE TORSO?  The forearms and hands are the ones
 *   that do it: the trunk is a capsule about 0.17 across and an elbow
 *   that tracks to 0.08 from its axis is an elbow through the ribs.
 *
 *   IS A FOOT THROUGH THE FLOOR, OR IS THE MAN FLOATING?  The lower of
 *   the two feet is what he is standing on, so across a locomotion
 *   cycle it should stay near the sole and never go far below it. A
 *   walk whose lowest foot is ten centimetres under the ground is the
 *   glide everybody notices and nobody can name.
 *
 *   DOES ANYTHING MOVE AT ALL?  A clip that names a bone and never
 *   changes it is a bone somebody meant to animate.
 *
 * The thresholds are deliberately loose. This is not a style check --
 * it is looking for the faults that make a body read as broken, and a
 * tight threshold on a stylised gait would fail on taste and teach
 * everyone to ignore it.
 *
 * Usage: node engine/test/anim.test.js
 */
const path = require('path');

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
function note(s) { console.log(`..   ${s}`); }

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 320 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html')
    + '?map=helipad&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.waitForTimeout(900);

  const report = await page.evaluate(() => {
    const M = window.MP.match, g = window.MP.game;
    g.stop();
    const man = M.people.find((p) => p.actor && p.actor.animator && p.actor.skeleton);
    if (!man) return { err: 'no rigged body' };
    const A = man.actor.animator, S = man.actor.skeleton;
    const names = [];
    A.clips.forEach((c, n) => names.push(n));

    const idx = {};
    S.bones.forEach((b, i) => { idx[b.name] = i; });
    const pos = (n) => {
      const i = idx[n];
      if (i == null) return null;
      const e = S.bones[i].worldMatrix.e;
      return [e[12], e[13], e[14]];
    };
    /* Distance from a point to the segment a..b. */
    function segDist(p, a, b) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const wx = p[0] - a[0], wy = p[1] - a[1], wz = p[2] - a[2];
      const uu = ux * ux + uy * uy + uz * uz;
      let t = uu > 1e-9 ? (wx * ux + wy * uy + wz * uz) / uu : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = wx - ux * t, dy = wy - uy * t, dz = wz - uz * t;
      return Math.hypot(dx, dy, dz);
    }

    const SAMPLES = 24;
    /* The sole, in the same space the bones are reported in: the hips
       sit at the actor origin and a 1.75 m adult's sole is 0.875 below
       it, scaled by whatever this body's stature is. */
    const hip0 = pos('hips');
    const out = [];
    for (const name of names) {
      const clip = A.clips.get(name);
      A.play(name, 0);
      A.speed = 1;
      let nan = 0, inTorso = 0, worstIn = 9, underFloor = 0, worstUnder = 0;
      let float = 9, moved = {};
      const first = {};
      for (let k = 0; k < SAMPLES; k++) {
        A.time = (k / SAMPLES) * clip.duration;
        A.update(0);
        S.update();
        const all = {};
        for (const b of S.bones) {
          const p = pos(b.name);
          all[b.name] = p;
          if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) {
            nan++;
            continue;
          }
          if (!first[b.name]) first[b.name] = p;
          else {
            const d = Math.hypot(p[0] - first[b.name][0], p[1] - first[b.name][1],
              p[2] - first[b.name][2]);
            if (d > (moved[b.name] || 0)) moved[b.name] = d;
          }
        }
        const hips = all.hips, neck = all.neck;
        if (hips && neck) {
          for (const limb of ['lowerArmL', 'lowerArmR', 'handL', 'handR']) {
            const p = all[limb];
            if (!p) continue;
            const d = segDist(p, hips, neck);
            if (d < worstIn) worstIn = d;
            if (d < 0.085) inTorso++;
          }
        }
        const fl = all.footL, fr = all.footR;
        if (fl && fr) {
          const low = Math.min(fl[1], fr[1]);
          /* The sole is 0.875 below the hips on the reference body; the
             foot BONE is at the ankle, 0.09 above that. */
          const sole = (hip0 ? hip0[1] : 0) - 0.875 + 0.09;
          if (low < sole - 0.06) { underFloor++; worstUnder = Math.max(worstUnder, sole - low); }
          if (low - sole < float) float = low - sole;
        }
      }
      const still = Object.keys(clip.tracks || {}).filter((b) => (moved[b] || 0) < 0.0015);
      out.push({ name, dur: +clip.duration.toFixed(2), nan, inTorso,
        worstIn: +worstIn.toFixed(3), underFloor, worstUnder: +worstUnder.toFixed(3),
        float: +float.toFixed(3), still,
        tracks: Object.keys(clip.tracks || {}).length });
    }
    return { clips: out };
  });

  if (report.err) {
    check('a rigged body to measure', false, report.err);
    console.log(`\n  ${passed} passed, ${failed} failed`);
    await browser.close();
    process.exit(1);
  }

  const C = report.clips;
  note(`${C.length} clips sampled at 24 frames each`);

  check('no clip produces a NaN bone',
    C.every((c) => c.nan === 0),
    C.filter((c) => c.nan).map((c) => `${c.name}:${c.nan}`).join(', '));

  check('no forearm or hand tracks through the torso',
    C.every((c) => c.inTorso === 0),
    C.filter((c) => c.inTorso).map((c) => `${c.name} ${c.inTorso} frames, closest ${c.worstIn}m`)
      .join(' | '));

  /* Prone and the crawl are MEANT to be at floor level; everything else
     is not. */
  const GROUNDED = ['proneIdle', 'crawl', 'drop', 'standUp', 'slide',
    'deathBack', 'deathFace'];
  const upright = C.filter((c) => GROUNDED.indexOf(c.name) < 0);
  check('no foot goes through the floor',
    upright.every((c) => c.underFloor === 0),
    upright.filter((c) => c.underFloor)
      .map((c) => `${c.name} ${c.underFloor} frames, ${c.worstUnder}m under`).join(' | '));

  check('and nobody floats above it',
    upright.every((c) => c.float < 0.10),
    upright.filter((c) => c.float >= 0.10)
      .map((c) => `${c.name} ${c.float}m up`).join(' | '));

  check('every bone a clip names actually moves',
    C.every((c) => c.still.length === 0),
    C.filter((c) => c.still.length)
      .map((c) => `${c.name}: ${c.still.join(',')}`).join(' | '));

  /* The three stances all have to exist, or the rules choose a clip
     that is not there and the body keeps whatever it was doing. */
  const WANT = ['idle', 'walk', 'run', 'sprint', 'slide', 'jump',
    'crouchIdle', 'crouchWalk', 'crouchRun', 'drop', 'proneIdle', 'crawl', 'standUp',
    'deathBack', 'deathFace'];
  const have = C.map((c) => c.name);
  check('every clip the rules can ask for exists',
    WANT.every((n) => have.indexOf(n) >= 0),
    WANT.filter((n) => have.indexOf(n) < 0).join(', '));

  C.forEach((c) => note(`${c.name.padEnd(12)} ${String(c.dur).padStart(5)}s  `
    + `${String(c.tracks).padStart(2)} tracks  closest-to-spine ${c.worstIn}m  `
    + `foot ${c.float >= 0 ? '+' : ''}${c.float}m`));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
