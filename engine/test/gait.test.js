#!/usr/bin/env node
/* The sprint and the slide, measured and photographed.
 *
 * The complaint that started this was that a sprint was "just speeding
 * up our character's legs", and the honest way to answer it is not to
 * look at a screenshot and agree -- it is to measure the three things
 * that actually separate a sprint from a fast run:
 *
 *   - knee flexion in recovery. A sprinter folds the shin to about 140
 *     degrees so the leg swings through as a short pendulum. A jogger
 *     folds it to 40. This is the single strongest read and the one a
 *     sped-up run can never fake.
 *   - a flight phase. Both feet leave the ground, so the pelvis rises
 *     and falls twice per cycle.
 *   - trunk lean, with the head NOT leaning -- the eyes stay level.
 *
 * And for the slide, the one that makes a bad slide look bad: does the
 * pelvis actually go DOWN, or does the character do the splits at
 * standing height.
 *
 * Usage: node engine/test/gait.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '/tmp';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  await page.evaluate(() => {
    const G = window.G = LE.create({ canvas: '#game', quality: 'high', gravity: 0 });
    G.setSky('day');
    G.setTimeOfDay(11);
    G.ground({ at: [0, 0, 0], size: 30, material: { color: 0x8e8b84, texture: 'concrete',
      roughness: 0.95, uvScale: 10 }, physics: false });
    /* Five of them, one per phase of the cycle, standing in a row --
       which is how an animator flips through a gait and the only way to
       see a cycle in a still picture at all. */
    window.row = [];
    for (let i = 0; i < 5; i++) {
      const c = G.character({ at: [(i - 2) * 1.02, 0.875, 0], name: 'g' + i,
        material: { preset: 'fabric', color: 0xc8cbd2 }, height: 1.75, radius: 0.30 });
      c.controller.autoAnimate = false;
      window.row.push(c);
    }
  });

  /* ---------------- the numbers ---------------- */

  const clips = await page.evaluate(() => {
    const a = window.row[0].animator;
    return Array.from(a.clips.keys());
  });
  check('a sprint clip exists', clips.indexOf('sprint') >= 0, clips.join(','));
  check('a slide clip exists', clips.indexOf('slide') >= 0, clips.join(','));

  /* Sample a clip by driving the animator and reading the SKELETON,
     not the keyframe table -- the table is what I wrote, the skeleton
     is what the renderer will use, and the gap between the two is
     where a wrong axis or a dropped track lives. */
  async function sample(clip, n) {
    return page.evaluate(([c, N]) => {
      const A = window.row[0].animator, S = window.row[0].skeleton;
      const dur = A.clips.get(c).duration;
      A.play(c, 0); A.speed = 1;
      const out = [];
      // Step from zero in equal slices of the clip's own duration.
      A.time = 0;
      for (let i = 0; i < N; i++) {
        A.update(i === 0 ? 0 : dur / N);
        S.update();
        const by = {};
        const axis = {};
        for (const b of S.bones) {
          const m = b.worldMatrix && b.worldMatrix.e;
          by[b.name] = m ? [m[12], m[13], m[14]] : null;
          /* The bone's own UP column. A bone's origin is placed by its
             parent's rotation, so origins cannot answer "which way is
             this bone facing" -- only its own basis can. */
          if (m) {
            const L = Math.hypot(m[4], m[5], m[6]) || 1;
            axis[b.name] = [m[4] / L, m[5] / L, m[6] / L];
          }
        }
        // Knee flexion as a real angle: the angle at the knee joint
        // between the thigh and the shin, in degrees. 180 = straight.
        const ang = (a, b2, cc) => {
          const p = by[a], q = by[b2], r = by[cc];
          if (!p || !q || !r) return null;
          const u = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
          const v = [r[0] - q[0], r[1] - q[1], r[2] - q[2]];
          const du = Math.hypot(u[0], u[1], u[2]), dv = Math.hypot(v[0], v[1], v[2]);
          if (du < 1e-6 || dv < 1e-6) return null;
          const d = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (du * dv);
          return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
        };
        out.push({
          t: i / N,
          hipY: by.hips ? by.hips[1] : null,
          headY: by.head ? by.head[1] : null,
          headZ: by.head ? by.head[2] : null,
          neckZ: by.neck ? by.neck[2] : null,
          neckY: by.neck ? by.neck[1] : null,
          elbowLY: by.lowerArmL ? by.lowerArmL[1] : null,
          elbowLZ: by.lowerArmL ? by.lowerArmL[2] : null,
          shLZ: by.upperArmL ? by.upperArmL[2] : null,
          shLY: by.upperArmL ? by.upperArmL[1] : null,
          footLZ: by.footL ? by.footL[2] : null,
          footRZ: by.footR ? by.footR[2] : null,
          elbowAngL: ang('upperArmL', 'lowerArmL', 'handL'),
          elbowAngR: ang('upperArmR', 'lowerArmR', 'handR'),
          headUp: axis.head || null,
          chestUp: axis.chest || null,
          chestZ: by.chest ? by.chest[2] : null,
          footLY: by.footL ? by.footL[1] : null,
          footRY: by.footR ? by.footR[1] : null,
          kneeL: ang('upperLegL', 'lowerLegL', 'footL'),
          kneeR: ang('upperLegR', 'lowerLegR', 'footR'),
          handLY: by.handL ? by.handL[1] : null,
          handRY: by.handR ? by.handR[1] : null,
          handLZ: by.handL ? by.handL[2] : null,
          handRZ: by.handR ? by.handR[2] : null,
          hipX: by.hips ? by.hips[0] : null,
        });
      }
      return out;
    }, [clip, n]);
  }

  const run = await sample('run', 24);
  const spr = await sample('sprint', 24);
  const wlk = await sample('walk', 24);

  /* ----------------------------------------------------------------
     WHICH ARM GOES WITH WHICH LEG.
     ----------------------------------------------------------------
     A walking human swings the arm OPPOSITE the leg. Swing them
     together and you have a toy soldier, and that is what both the
     walk and the run were doing: a positive upper arm is BACK on this
     rig while a positive upper leg is FORWARD, and both clips had the
     left arm and the left leg at the same sign.

     Measured as a correlation over the whole cycle between how far
     ahead the left FOOT is of the right and how far ahead the left
     HAND is of the right. Contralateral is negative. Reading it off
     the key numbers is what got it wrong in the first place. */
  function swingR(s) {
    const a = [], b = [];
    for (const f of s) {
      if (f.footLZ == null || f.handLZ == null) continue;
      a.push(f.footLZ - f.footRZ); b.push(f.handLZ - f.handRZ);
    }
    if (a.length < 6) return null;
    const m = (v) => v.reduce((x, y) => x + y, 0) / v.length;
    const ma = m(a), mb = m(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
    }
    return da > 1e-9 && db > 1e-9 ? num / Math.sqrt(da * db) : null;
  }
  for (const [nm, s] of [['walk', wlk], ['run', run], ['sprint', spr]]) {
    const r = swingR(s);
    console.log(`  .. ${nm}: foot-lead vs hand-lead correlation ${r == null ? 'n/a' : r.toFixed(2)}`);
    check(`the ${nm} swings each arm with the OPPOSITE leg`, r != null && r < -0.5,
      r == null ? 'could not measure' : `r=${r.toFixed(2)}`);
  }

  /* The pelvis has to rise and fall. A walk at one height is a glide. */
  const wHip = wlk.map((f) => f.hipY).filter((v) => v != null);
  const wRise = Math.max(...wHip) - Math.min(...wHip);
  console.log(`  .. walk: pelvis rises ${(wRise * 100).toFixed(1)} cm, sways`
    + ` ${((Math.max(...wlk.map((f) => f.hipX)) - Math.min(...wlk.map((f) => f.hipX))) * 100).toFixed(1)} cm`);
  check('the walk lifts the body at each mid-stance', wRise > 0.025 && wRise < 0.075,
    `${(wRise * 100).toFixed(1)} cm`);

  /* And the knees have to bend. 180 is a straight leg. */
  const wKnee = Math.min(...wlk.map((f) => f.kneeL).filter((v) => v != null));
  const rKnee = Math.min(...run.map((f) => f.kneeL).filter((v) => v != null));
  console.log(`  .. peak knee flexion: walk ${(180 - wKnee).toFixed(0)}deg,`
    + ` run ${(180 - rKnee).toFixed(0)}deg`);
  check('the walking knee reaches a real swing flexion', 180 - wKnee > 52,
    `${(180 - wKnee).toFixed(0)}deg`);
  check('and the running knee folds further still', 180 - rKnee > 90,
    `${(180 - rKnee).toFixed(0)}deg`);

  const minK = (s) => Math.min(...s.map((k) => Math.min(k.kneeL, k.kneeR)));
  const runFold = minK(run), sprFold = minK(spr);
  console.log(`  .. tightest knee: run ${runFold.toFixed(0)}deg  sprint ${sprFold.toFixed(0)}deg`);
  /* A real sprint folds the shin far tighter than a run does. 180 is a
     straight leg, so SMALLER is more folded. */
  check('the sprint folds the shin far tighter than the run does',
    sprFold < runFold - 25, `run ${runFold.toFixed(0)} sprint ${sprFold.toFixed(0)}`);
  check('the sprint heel comes near the backside', sprFold < 60, `${sprFold.toFixed(0)}deg`);

  // Flight phase: the pelvis must rise and fall TWICE per cycle.
  function peaks(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const a = s[(i - 1 + s.length) % s.length].hipY, b = s[i].hipY, c = s[(i + 1) % s.length].hipY;
      if (b > a && b >= c) n++;
    }
    return n;
  }
  const hipSwing = Math.max(...spr.map((k) => k.hipY)) - Math.min(...spr.map((k) => k.hipY));
  console.log(`  .. pelvis rise and fall ${(hipSwing * 100).toFixed(1)}cm, ${peaks(spr)} peaks/cycle`);
  check('the pelvis rises and falls twice a cycle -- a flight phase',
    peaks(spr) === 2, `${peaks(spr)} peaks`);
  check('and it is a real rise, not a wobble', hipSwing > 0.05, `${(hipSwing * 100).toFixed(1)}cm`);
  /* The run has a flight phase too -- it used to have NO pelvic
     movement at all, which is what made it glide. What separates the
     sprint is how far the body travels vertically, not whether it
     travels at all. */
  const runSwing = Math.max(...run.map((k) => k.hipY)) - Math.min(...run.map((k) => k.hipY));
  console.log(`  .. run pelvis rise ${(runSwing * 100).toFixed(1)}cm, ${peaks(run)} peaks/cycle`);
  check('the run rises twice a cycle as well', peaks(run) === 2, `${peaks(run)} peaks`);
  check('but not as far as the sprint', runSwing < hipSwing - 0.005,
    `run ${(runSwing * 100).toFixed(1)}cm vs sprint ${(hipSwing * 100).toFixed(1)}cm`);

  // The trunk leans; the head does not go with it.
  const mean = (s, f) => s.reduce((a, k) => a + f(k), 0) / s.length;
  const leanSpr = mean(spr, (k) => k.chestZ), leanRun = mean(run, (k) => k.chestZ);
  console.log(`  .. chest forward of the hips: run ${(leanRun * 100).toFixed(1)}cm sprint ${(leanSpr * 100).toFixed(1)}cm`);
  check('the sprint leans the trunk further forward than the run',
    leanSpr > leanRun + 0.015, `run ${leanRun.toFixed(3)} sprint ${leanSpr.toFixed(3)}`);

  /* The head is FURTHER forward than the chest in both clips and always
     will be -- it sits on top of the lean and accumulates it, so the
     first version of this check ("head less forward than chest") was
     asking the skeleton to be impossible and would have failed on a
     perfect sprint. What actually matters is whether the NECK gives the
     lean back: the head-over-neck segment should stand up near vertical
     while the neck-over-hips segment is raked well forward. */
  /* Rake measured off each bone's OWN up-axis, in degrees from vertical.
     The first version compared bone ORIGINS, and a bone's origin is
     placed by its parent -- so it reported the head as raked thirty-five
     degrees forward when the head bone was in fact tilted back, because
     what it was really measuring was the neck. */
  const rakeOf = (s, f) => {
    const v = [mean(s, (k) => f(k)[0]), mean(s, (k) => f(k)[1]), mean(s, (k) => f(k)[2])];
    return Math.atan2(v[2], v[1]) * 180 / Math.PI;
  };
  const trunkRake = rakeOf(spr, (k) => k.chestUp);
  const headRake = rakeOf(spr, (k) => k.headUp);
  const runTrunk = rakeOf(run, (k) => k.chestUp);
  console.log(`  .. rake from vertical: trunk ${trunkRake.toFixed(0)}deg (run ${runTrunk.toFixed(0)}deg), head ${headRake.toFixed(0)}deg`);
  check('the trunk is raked well forward', trunkRake > 20, `${trunkRake.toFixed(0)}deg`);
  check('the head stands back up out of it -- the eyes stay level',
    headRake < trunkRake - 12, `head ${headRake.toFixed(0)} trunk ${trunkRake.toFixed(0)}`);

  /* Arms. The HAND travels less far in a sprint than in a run and that
     is correct -- a tighter elbow is a shorter radius, so measuring hand
     travel punishes the thing that makes a sprint a sprint. The elbow
     angle and the shoulder's swing are the honest measures. */
  const elbowSpr = mean(spr, (k) => k.elbowAngL), elbowRun = mean(run, (k) => k.elbowAngL);
  /* The shoulder's swing as an ANGLE, not the distance the elbow
     covers. A sprinter's tighter elbow is a shorter radius, so measuring
     how far the elbow travels docks the sprint for the exact thing that
     makes it one -- the first version had the run winning by two
     centimetres for that reason. */
  // Angle of the upper arm from straight down, in the sagittal plane.
  const armAng = (s) => s.map((k) => Math.atan2(k.elbowLZ - k.shLZ, k.shLY - k.elbowLY) * 180 / Math.PI);
  const sweep = (s) => { const a = armAng(s); return Math.max(...a) - Math.min(...a); };
  console.log(`  .. elbow angle: run ${elbowRun.toFixed(0)}deg sprint ${elbowSpr.toFixed(0)}deg; shoulder sweep run ${sweep(run).toFixed(0)}deg sprint ${sweep(spr).toFixed(0)}deg`);
  check('the sprint holds a tighter elbow than the run',
    elbowSpr < elbowRun - 10, `run ${elbowRun.toFixed(0)} sprint ${elbowSpr.toFixed(0)}`);
  check('and sweeps the shoulder through a bigger angle',
    sweep(spr) > sweep(run), `${sweep(spr).toFixed(0)} vs ${sweep(run).toFixed(0)}`);

  /* Feet alternate. The first version asked whether both feet were below
     twelve centimetres, which every foot in this rig is at every instant
     -- the bone sits eighty-six centimetres below the pelvis. It passed
     by accident on the run and failed by accident on the sprint, and
     measured nothing either time. The real question is whether the two
     feet are ever in the same place. */
  const gap = spr.map((k) => Math.hypot(k.footLY - k.footRY, k.footLZ - k.footRZ));
  const together = gap.filter((d) => d < 0.10).length;
  console.log(`  .. feet apart: median ${(gap.slice().sort((a, b) => a - b)[Math.floor(gap.length / 2)] * 100).toFixed(0)}cm, together ${together}/${gap.length} samples`);
  check('the feet are apart for nearly all of the cycle',
    together <= 2, `${together}/${gap.length} samples with the feet together`);

  /* ---------------- the slide ---------------- */

  const sld = await sample('slide', 20);
  const standing = sld[0].hipY, lowest = Math.min(...sld.map((k) => k.hipY));
  console.log(`  .. pelvis ${(standing * 100).toFixed(0)}cm -> ${(lowest * 100).toFixed(0)}cm`);
  check('the slide actually drops the pelvis', standing - lowest > 0.40,
    `${((standing - lowest) * 100).toFixed(0)}cm`);
  check('and it is down there within a fifth of a second',
    sld[Math.floor(0.25 * sld.length)].hipY < standing - 0.35);
  const kneeTrail = Math.min(...sld.map((k) => k.kneeR));
  check('the trailing leg folds underneath', kneeTrail < 90, `${kneeTrail.toFixed(0)}deg`);
  const headUp = sld[Math.floor(0.5 * sld.length)].headY - lowest;
  check('the head is still well above the hips -- the torso is not flat',
    headUp > 0.45, `${(headUp * 100).toFixed(0)}cm`);

  /* ---------------- the skin, which is the whole reason any of this
     was visible in the first place ----------------

     Every number above can be perfect while the mesh hanging off the
     skeleton is in ribbons, and for a long time it was: the living
     body's builders never tagged which limb they were emitting, the
     solver's part restriction silently disables itself when nothing is
     tagged, and thigh vertices ended up bound seventy-nine per cent to
     the HAND because in the bind pose the hands hang beside the thighs.
     Five hundred and ninety-eight edges stretched past three times
     their length at a mid-run pose.

     So: skin the mesh by hand, at a pose, and measure. This is the
     check that would have caught it on day one. */
  const skin = await page.evaluate(() => {
    const c = window.row[0], G = window.G;
    const geo = G.geometryOf(c.mesh);
    if (!geo) return { err: 'the body geometry is not registered' };
    const P = geo.positions, I = geo.indices, J = geo.joints, W = geo.weights;
    if (!J || !W) return { err: 'no skin weights' };
    const out = { worst: 0, bad: 0, note: '', holdWorst: 0, holdNote: '', holdPoses: 0 };
    const parts = geo.parts || [];
    out.tagged = parts.length ? new Set(parts).size : 0;
    const A = c.animator, S = c.skeleton;

    /* Skin the mesh at whatever pose the skeleton is in now, and record
       the worst edge. Split out of the clip loop because the clips are
       no longer the only poses this body is ever put into. */
    const sk = new Float64Array(P.length);
    const measure = (label, into) => {
      const M = S.matrices;
      for (let i = 0; i < P.length / 3; i++) {
        let x = 0, y = 0, z = 0;
        for (let k = 0; k < 4; k++) {
          const w = W[i * 4 + k]; if (w < 1e-6) continue;
          const o = J[i * 4 + k] * 16;
          const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
          x += w * (M[o] * px + M[o + 4] * py + M[o + 8] * pz + M[o + 12]);
          y += w * (M[o + 1] * px + M[o + 5] * py + M[o + 9] * pz + M[o + 13]);
          z += w * (M[o + 2] * px + M[o + 6] * py + M[o + 10] * pz + M[o + 14]);
        }
        sk[i * 3] = x; sk[i * 3 + 1] = y; sk[i * 3 + 2] = z;
      }
      for (let t = 0; t < I.length; t += 3) {
        for (let e = 0; e < 3; e++) {
          const a = I[t + e], b2 = I[t + (e + 1) % 3];
          const d0 = Math.hypot(P[a * 3] - P[b2 * 3], P[a * 3 + 1] - P[b2 * 3 + 1],
            P[a * 3 + 2] - P[b2 * 3 + 2]);
          if (d0 < 1e-6) continue;
          const d1 = Math.hypot(sk[a * 3] - sk[b2 * 3], sk[a * 3 + 1] - sk[b2 * 3 + 1],
            sk[a * 3 + 2] - sk[b2 * 3 + 2]);
          const rr = d1 / d0;
          if (rr > into.worst) { into.worst = rr; into.note = label; }
          if (rr > 3) out.bad++;
        }
      }
    };

    for (const clip of ['walk', 'run', 'sprint', 'slide', 'jump']) {
      const dur = A.clips.get(clip).duration;
      for (let ph = 0; ph < 6; ph++) {
        A.play(clip, 0); A.speed = 0; A.time = (ph / 6) * dur; A.update(0); S.update();
        measure(clip + '@' + (ph / 6).toFixed(2), out);
      }
    }

    /* ---------------- AND THE POSES NO CLIP EVER PRODUCES.
     *
       Everything above samples the authored clips, and until recently
       that was every pose this body was put into. It is not any more:
       the arms are now solved onto the weapon with IK from the
       animator's onPosed hook, and the torso blades up to 35 degrees to
       let the support hand reach. Those are shoulder and chest
       deformations nothing in the clip set asks for, so measuring the
       clips alone stopped being a measurement of the skin.

       It matters here specifically. The ribbon failure was a BIND
       problem -- thigh vertices claimed by the hand -- and a bind is
       only ever exposed by a pose that separates the two bones it
       confused. The reach separates them further than any clip does. */
    const holder = { worst: 0, note: '' };
    const iUR = S.index('upperArmR'), iLR = S.index('lowerArmR'), iHR = S.index('handR');
    const iUL = S.index('upperArmL'), iLL = S.index('lowerArmL'), iHL = S.index('handL');
    const iChest = S.index('chest'), iNeck = S.index('neck');
    const V = LE.Vec3, Q = LE.Quat;
    const upY = new V(0, 1, 0), q = new Q();
    const at = (i) => { const o = new V(); S.worldPosition(i, o); return o; };
    if (iUR >= 0 && iUL >= 0 && iChest >= 0) {
      /* The hold envelope, taken from the game's own numbers: the grip
         runs from the hip carry to the eye, the blade from 11 to 35
         degrees with it, and the support hand goes 12 to 24 cm down the
         weapon. Sampled at the corners and the middle. */
      const HOLDS = [
        { label: 'hip', gy: 0.45, gz: 0.30, blade: 0.20, along: 0.24 },
        { label: 'ads', gy: 0.73, gz: 0.22, blade: 0.61, along: 0.22 },
        { label: 'ads-long', gy: 0.73, gz: 0.22, blade: 0.61, along: 0.12 },
        { label: 'sprint-low', gy: 0.30, gz: 0.26, blade: 0.20, along: 0.20 },
        { label: 'high-port', gy: 0.86, gz: 0.14, blade: 0.61, along: 0.18 },
      ];
      for (const h of HOLDS) {
        A.play('idle', 0); A.speed = 0; A.time = 0; A.update(0); S.update();
        q.setAxisAngle(upY, -h.blade);
        S.bones[iChest].localRotation.premul(q).normalize();
        if (iNeck >= 0) {
          q.setAxisAngle(upY, h.blade);
          S.bones[iNeck].localRotation.premul(q).normalize();
        }
        S.update();
        const grip = new V(-0.06, h.gy, h.gz);
        const fore = new V(-0.06, h.gy, h.gz + h.along);
        const chestY = at(iChest).y;
        S.solveIK(iUR, iLR, iHR, grip,
          { x: -0.50, y: chestY + 0.10, z: -0.06 });
        S.solveIK(iUL, iLL, iHL, fore, { x: 0.16, y: chestY - 0.30, z: 0.10 });
        measure('hold/' + h.label, holder);
        out.holdPoses++;
      }
    }
    out.holdWorst = holder.worst;
    out.holdNote = holder.note;
    return out;
  });
  /* THE BODY IS STILL A BODY.
     Splitting the neck off onto its own material rebuilt the body's
     index list, and the rebuild silently produced an array of length
     ONE -- so every character in the game rendered as a floating neck
     and nothing else. Nothing above would have caught it: the weights
     were fine, the skeleton was fine, the poses were fine. Count the
     triangles. */
  const solid = await page.evaluate(() => {
    const c = window.row[0];
    return {
      body: c.mesh ? c.mesh.indexCount : 0,
      verts: c.mesh ? c.mesh.vertexCount : 0,
      neck: c.neck && c.neck.mesh ? c.neck.mesh.indexCount : 0,
    };
  });
  console.log(`  .. body ${solid.verts} verts / ${solid.body} indices, neck ${solid.neck} indices`);
  check('the body still has most of its triangles after the neck is split off',
    solid.body > solid.verts * 3, `${solid.body} indices on ${solid.verts} vertices`);
  check('and the neck came out as a real piece of geometry',
    solid.neck > 60, `${solid.neck} indices`);

  if (skin.err) check('the body can be measured at all', false, skin.err);
  else {
    console.log(`  .. skin: ${skin.tagged} part tags, worst edge stretch ${skin.worst.toFixed(1)}x (${skin.note}), ${skin.bad} edges past 3x`);
    check('the body tags which limb each vertex belongs to', skin.tagged >= 5, `${skin.tagged} distinct tags`);
    check('no edge is stretched past three times its length, in any pose',
      skin.bad === 0, `${skin.bad} edges, worst ${skin.worst.toFixed(1)}x at ${skin.note}`);
    /* 2.5x, and it is at the sprint's most folded knee. Linear blend
       skinning stretches the outside of any joint bent past about a
       hundred and twenty degrees -- that is the technique, not a bug in
       this rig, and the sprint asks for a hundred and forty. The ribbon
       failure was eleven times, on edges nowhere near a joint. */
    check('and nothing is stretched much outside a hard joint fold',
      skin.worst < 2.8, `${skin.worst.toFixed(1)}x at ${skin.note}`);

    console.log(`  .. hold: ${skin.holdPoses} IK poses, worst edge stretch `
      + `${skin.holdWorst.toFixed(1)}x (${skin.holdNote})`);
    check('the reach poses were actually solved', skin.holdPoses >= 5,
      `${skin.holdPoses} poses`);
    /* The same 2.8x the clips get. A shoulder brought up and across to
       a rifle is a gentler fold than the sprint's knee, so if this ever
       goes higher than a running stride it is the bind, not the
       technique. */
    check('and the skin survives being posed onto a weapon',
      skin.holdWorst < 2.8 && skin.holdWorst > 1.0,
      `${skin.holdWorst.toFixed(2)}x at ${skin.holdNote}`);
  }

  /* ---------------- the pictures ---------------- */

  async function strip(clip, file, title) {
    await page.evaluate(([c]) => {
      const G = window.G;
      const dur = window.row[0].animator.clips.get(c).duration;
      window.row.forEach((ch, i) => {
        ch.animator.play(c, 0);
        ch.animator.speed = 0;
        ch.animator.time = (i / 5) * dur * (c === 'slide' ? 0.92 : 1);
        ch.animator.update(0);
        ch.skeleton.update();
        if (ch.rotation && ch.rotation.setFromAxisAngle) {
          ch.rotation.setFromAxisAngle([0, 1, 0], Math.PI * 0.5);
        }
      });
      /* Close, low and square on. The first pass put the camera six and
         a half metres out and the five of them came back as thumbnails
         -- every number in this file said the cycle was right and the
         picture could not have shown it either way. */
      G.lookAt([0, 1.02, 4.15], [0, 0.88, 0]);
      /* The engine does not render on its own here -- guns.test.js
         learned this the same way, with a black picture. Speed 0 means
         the step cannot advance the poses it was just handed. */
      for (let i = 0; i < 3; i++) G.step(1 / 60);
    }, [clip]);
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(OUT, file) });
    console.log(`  .. ${title} -> ${path.join(OUT, file)}`);
  }

  await strip('sprint', 'gait-sprint.png', 'sprint cycle, five phases');
  await strip('run', 'gait-run.png', 'run cycle, for comparison');
  await strip('slide', 'gait-slide.png', 'slide, entry to recovery');

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
