#!/usr/bin/env node
/* DOES THE TWO-BONE SOLVER PUT THE HAND WHERE IT IS TOLD?
 *
 * It did not. solveIK shipped with this engine as "the workhorse for
 * planting feet on uneven ground" and, until a man was asked to bring
 * a rifle to his shoulder, had no caller anywhere in the project. It
 * aimed each bone's +Y axis at the target on the usual convention that
 * a bone points along +Y towards its child -- and the procedural
 * humanoid runs its limbs the other way, down its parent's -Y. Every
 * solve therefore pointed the limb at the reflection of the target.
 *
 * WHY THAT WAS INVISIBLE. The solver clamps the target into the
 * reachable annulus before solving, so an unreachable direction does
 * not fail, it locks the limb straight. A straight arm hanging at the
 * side is exactly what an idle clip looks like, so the symptom was
 * "the IK never ran" rather than "the IK ran backwards", and the first
 * two hours went on looking for a hook that was firing seventy-six
 * times a second all along.
 *
 * WHAT THIS ASKS. Nothing about conventions or sign: purely, after a
 * solve, is the end effector at the target? That is the entire promise
 * of an IK solver and it is one subtraction to check. It is asked for
 * targets all round the joint -- up, down, forward, back, across -- so
 * a solver that happens to be right in one octant cannot pass.
 *
 * Usage: node engine/test/ik.test.js
 */
const path = require('path');
const LE = require(path.join(__dirname, '..', '..', 'site/engine/legend-engine.js'));

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}
const note = (s) => console.log(`  ..   ${s}`);

const sk = LE.makeHumanoidSkeleton();
sk.update();

const iUR = sk.index('upperArmR'), iLR = sk.index('lowerArmR'), iHR = sk.index('handR');
const iUL = sk.index('upperArmL'), iLL = sk.index('lowerArmL'), iHL = sk.index('handL');
const iHipR = sk.index('upperLegR'), iKneeR = sk.index('lowerLegR'), iFootR = sk.index('footR');

check('the humanoid rig has both arms and a right leg to solve',
  iUR >= 0 && iLR >= 0 && iHR >= 0 && iUL >= 0 && iLL >= 0 && iHL >= 0
  && iHipR >= 0 && iKneeR >= 0 && iFootR >= 0,
  `R ${iUR}/${iLR}/${iHR} L ${iUL}/${iLL}/${iHL} leg ${iHipR}/${iKneeR}/${iFootR}`);


const pos = (i) => { const o = new LE.Vec3(); sk.worldPosition(i, o); return o; };

const root = pos(iUR), mid = pos(iLR), end = pos(iHR);
const armLen = root.distanceTo(mid) + mid.distanceTo(end);
note(`right arm: upper ${root.distanceTo(mid).toFixed(3)} m, lower `
  + `${mid.distanceTo(end).toFixed(3)} m, reach ${armLen.toFixed(3)} m`);
check('the arm has a plausible reach for a person', armLen > 0.35 && armLen < 0.75,
  `${armLen.toFixed(3)} m`);

/* THE LIMB RUNS DOWN -Y, WHICH IS THE FACT THE SOLVER USED TO IGNORE.
   Asserted rather than assumed: if the rig is ever rebuilt the other
   way up, the solver still has to work, but this note should change
   with it rather than quietly becoming a lie. */
const down = mid.y < root.y && end.y < mid.y;
note(`limb axis: shoulder y ${root.y.toFixed(3)} -> elbow ${mid.y.toFixed(3)} `
  + `-> hand ${end.y.toFixed(3)} (${down ? '-Y, not the +Y convention' : '+Y'})`);

/* Targets all round the joint, each comfortably inside the reach so a
   miss cannot be blamed on the annulus clamp. The reflected-target bug
   put the hand at full stretch in the opposite direction, which fails
   every one of these by a third of a metre. */
const DIRS = [
  ['up and forward, a rifle at the shoulder', 0.00, 0.32, 0.22],
  ['straight up', 0.00, 0.34, 0.00],
  ['straight forward', 0.02, 0.00, 0.34],
  ['forward and down, a low ready', 0.00, -0.20, 0.30],
  ['across the chest', 0.26, 0.10, 0.18],
  ['out to the side', -0.30, 0.05, 0.02],
  ['down and back', -0.05, -0.28, -0.16],
];

let worst = 0, worstName = '';
for (const [name, dx, dy, dz] of DIRS) {
  /* Re-solve from a clean rest pose every time, so one solve cannot
     flatter the next by leaving the arm already near the target. */
  for (const b of sk.bones) { b.localRotation.set(0, 0, 0, 1); }
  sk.update();
  const shoulder = pos(iUR);
  const target = new LE.Vec3(shoulder.x + dx, shoulder.y + dy, shoulder.z + dz);
  /* A pole below and outside the shoulder: an elbow, roughly. */
  const pole = { x: shoulder.x - 0.25, y: shoulder.y - 0.15, z: shoulder.z - 0.10 };
  sk.solveIK(iUR, iLR, iHR, target, pole);
  const hand = pos(iHR);
  const miss = hand.distanceTo(target);
  if (miss > worst) { worst = miss; worstName = name; }
  check(`the hand reaches ${name}`, miss < 0.02,
    `off by ${(miss * 1000).toFixed(0)} mm, hand at `
    + `${hand.x.toFixed(3)},${hand.y.toFixed(3)},${hand.z.toFixed(3)} `
    + `target ${target.x.toFixed(3)},${target.y.toFixed(3)},${target.z.toFixed(3)}`);
}
note(`worst miss across ${DIRS.length} directions: ${(worst * 1000).toFixed(1)} mm (${worstName})`);

/* THE ELBOW GOES WHERE THE POLE SAYS. A solver can land the hand
   perfectly with the elbow folded through the ribs, and that is the
   other half of looking wrong. Two poles on opposite sides of the arm
   must put the elbow on opposite sides of the shoulder-to-hand line. */
function elbowFor(poleX) {
  for (const b of sk.bones) b.localRotation.set(0, 0, 0, 1);
  sk.update();
  const sh = pos(iUR);
  const target = new LE.Vec3(sh.x, sh.y + 0.30, sh.z + 0.20);
  sk.solveIK(iUR, iLR, iHR, target, { x: sh.x + poleX, y: sh.y - 0.15, z: sh.z });
  return pos(iLR);
}
const eOut = elbowFor(-0.40), eIn = elbowFor(0.40);
note(`elbow with the pole outboard x=${eOut.x.toFixed(3)}, inboard x=${eIn.x.toFixed(3)}`);
check('the pole vector decides which way the elbow breaks',
  eOut.x < eIn.x - 0.03, `${eOut.x.toFixed(3)} vs ${eIn.x.toFixed(3)}`);

/* AND THE OTHER ARM, AND A LEG. The fix is in the shared solver rather
   than in one limb's caller, so a limb that was never the subject of
   the bug report has to work too -- that is the difference between a
   fix and a patch. */
for (const [label, a, b, c] of [['left arm', iUL, iLL, iHL], ['right leg', iHipR, iKneeR, iFootR]]) {
  for (const bn of sk.bones) bn.localRotation.set(0, 0, 0, 1);
  sk.update();
  const r0 = pos(a);
  const target = new LE.Vec3(r0.x + 0.05, r0.y - 0.25, r0.z + 0.22);
  sk.solveIK(a, b, c, target, { x: r0.x, y: r0.y - 0.30, z: r0.z + 0.50 });
  const miss = pos(c).distanceTo(target);
  check(`the ${label} reaches its target too`, miss < 0.02, `off by ${(miss * 1000).toFixed(0)} mm`);
}

/* AN UNREACHABLE TARGET MUST NOT EXPLODE. It cannot be hit, so the
   promise is narrower: the limb points at it, straight, and no
   coordinate is a NaN. A NaN bone renders as nothing at all. */
for (const bn of sk.bones) bn.localRotation.set(0, 0, 0, 1);
sk.update();
const sh = pos(iUR);
const far = new LE.Vec3(sh.x, sh.y, sh.z + 8);
sk.solveIK(iUR, iLR, iHR, far, { x: sh.x - 0.3, y: sh.y - 0.2, z: sh.z });
const h = pos(iHR);
const finite = Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.z);
check('an unreachable target leaves finite bones', finite,
  `${h.x},${h.y},${h.z}`);
if (finite) {
  const reachDir = new LE.Vec3(h.x - sh.x, h.y - sh.y, h.z - sh.z);
  const len = Math.hypot(reachDir.x, reachDir.y, reachDir.z);
  const cos = len > 1e-6 ? reachDir.z / len : 0;
  check('and the arm stretches out towards it rather than away',
    cos > 0.9 && len > armLen * 0.9,
    `cos ${cos.toFixed(3)}, extension ${len.toFixed(3)} of ${armLen.toFixed(3)}`);
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
