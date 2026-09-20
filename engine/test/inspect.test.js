#!/usr/bin/env node
/* The inspect curve, measured. No browser: it is arithmetic.
 *
 * An inspect that does not come back exactly where it started leaves the
 * weapon permanently askew, and because it is cancellable it can be cut
 * at any fraction -- so "comes back at u = 1" is not enough on its own;
 * the ends have to be FLAT, or a cancel at 0.97 snaps the gun.
 *
 * Usage: node engine/test/inspect.test.js
 */
const LE = require('../../site/engine/legend-engine.js');

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
};

const P = LE.inspectPose;
const KEYS = ['in', 'up', 'side', 'yaw', 'pitch', 'roll', 'bolt', 'tap'];
const N = 2000;
const samp = [];
for (let i = 0; i <= N; i++) samp.push(P(i / N));

check('there is a curve at all', typeof P === 'function' && LE.INSPECT_TIME > 0.5,
  String(LE.INSPECT_TIME));

/* 1. Both ends are the carry, exactly. */
let endsBad = [];
for (const k of KEYS) {
  if (Math.abs(samp[0][k]) > 1e-9) endsBad.push('start ' + k + '=' + samp[0][k]);
  if (Math.abs(samp[N][k]) > 1e-9) endsBad.push('end ' + k + '=' + samp[N][k]);
}
check('the weapon starts and ends in the carry', endsBad.length === 0, endsBad.join(', '));

/* 2. And the ends are FLAT -- the derivative at u=0 and u=1 is zero, not
      merely small -- because the weapon is handed straight from the carry
      into this and back, and a curve that leaves at speed is a jolt on
      the frame the inspect starts.

      MEASURED AT THE ENDPOINTS, not over a window. The first version of
      this took the fastest rate anywhere in the first and last five per
      cent and compared it to the peak, and failed six channels: five per
      cent of the whole curve is a quarter of the way into a 370 ms ease,
      where a smoothstep is already near its fastest. That is what an
      ease IS. The question worth asking is whether the curve LEAVES the
      carry at zero speed, which is the first interval and no wider. */
const rate = (a, b, k) => Math.abs(b[k] - a[k]) * N;
const peak = {};
for (const k of KEYS) peak[k] = 0;
for (let i = 1; i <= N; i++) {
  for (const k of KEYS) {
    const r = rate(samp[i - 1], samp[i], k);
    if (r > peak[k]) peak[k] = r;
  }
}
const steep = KEYS.filter((k) => peak[k] > 1e-9
  && (rate(samp[0], samp[1], k) > peak[k] * 0.05
    || rate(samp[N - 1], samp[N], k) > peak[k] * 0.05));
check('the curve leaves and returns to the carry at zero speed', steep.length === 0,
  steep.map((k) => k + ' in ' + rate(samp[0], samp[1], k).toFixed(3)
    + ' out ' + rate(samp[N - 1], samp[N], k).toFixed(3)
    + ' of ' + peak[k].toFixed(2)).join(', '));

/* 3. Nothing moves faster than a hand can move it. In units PER SECOND,
      which is the only frame this question means anything in -- the
      first version of this compared a per-SAMPLE step against a fixed
      number, so it was really asking how many samples I had taken, and
      it failed the bolt for travelling 32 mm in 160 ms. */
const perSec = (k) => peak[k] / LE.INSPECT_TIME;
const FAST = { in: 0.9, up: 0.9, side: 0.9, yaw: 6, pitch: 6, roll: 14, bolt: 14, tap: 30 };
const fast = KEYS.filter((k) => perSec(k) > FAST[k]);
check('nothing moves faster than a hand could move it', fast.length === 0,
  fast.map((k) => k + ' ' + perSec(k).toFixed(2) + '/s').join(', '));

/* And no actual discontinuity, which at this sample rate would stand out
   from its neighbours by orders of magnitude rather than by a little. */
let jumps = [];
for (let i = 2; i < N; i++) {
  for (const k of KEYS) {
    if (peak[k] < 1e-9) continue;
    const r = rate(samp[i - 1], samp[i], k);
    const nb = Math.max(rate(samp[i - 2], samp[i - 1], k), rate(samp[i], samp[i + 1], k));
    if (r > nb * 3 + 1e-6) jumps.push(k + ' at ' + (i / N).toFixed(3));
  }
}
check('no step anybody could see', jumps.length === 0, jumps.slice(0, 4).join(', '));

/* 4. Every channel actually does something, and none of them does
      something absurd. A curve with a dead channel is a beat that was
      written and never wired. */
const span = {}, dead = [], wild = [];
const LIMIT = { in: 0.12, up: 0.10, side: 0.12, yaw: 0.6, pitch: 0.7, roll: 1.8, bolt: 1, tap: 1 };
for (const k of KEYS) {
  let lo = 9, hi = -9;
  for (const s of samp) { if (s[k] < lo) lo = s[k]; if (s[k] > hi) hi = s[k]; }
  span[k] = hi - lo;
  if (span[k] < 0.01) dead.push(k);
  if (Math.max(Math.abs(lo), Math.abs(hi)) > LIMIT[k] + 1e-9) wild.push(k + ' ' + hi.toFixed(3));
}
check('every channel moves', dead.length === 0, dead.join(', '));
check('nothing moves absurdly far', wild.length === 0, wild.join(', '));

/* 5. The action opens once and shuts, and is shut before the second
      roll starts -- you do not look at a magazine with the bolt back. */
let boltOpenAfter = 0;
for (let i = 0; i <= N; i++) if (i / N > 0.58 && samp[i].bolt > 0.02) boltOpenAfter++;
check('the action is closed before the magazine is looked at', boltOpenAfter === 0,
  boltOpenAfter + ' samples');

/* 6. Out of range in is clamped, not extrapolated. */
const under = P(-3), over = P(4);
check('out of range is the carry, not an extrapolation',
  KEYS.every((k) => Math.abs(under[k]) < 1e-9 && Math.abs(over[k]) < 1e-9));

/* 7. A CANCEL FADES, and it fades from wherever the weapon was. This is
      the one the first version of this file got wrong in both games:
      firing out of an inspect set the clock to zero, and the weapon
      teleported back to the carry between two frames -- a 1.18 radian
      snap in a sixteenth of a second on the worst channel, which is the
      exact class of fault this animation pass exists to remove.

      Measured at the worst moment to be interrupted (the peak of the
      roll) and at the frame rate the fade actually runs at. */
let worstU = 0, worstRoll = 0;
for (let i = 0; i <= N; i++) if (Math.abs(samp[i].roll) > worstRoll) {
  worstRoll = Math.abs(samp[i].roll); worstU = i / N;
}
const FR = 1 / 60;
const steps = Math.ceil(LE.INSPECT_CANCEL / FR);
let fadeJump = 0, fadeWorst = '';
let prev = P(worstU, 1);
for (let i = 1; i <= steps; i++) {
  const w = Math.max(0, 1 - (i * FR) / LE.INSPECT_CANCEL);
  // The clock keeps running under the fade, which is what the games do.
  const now = P(Math.min(1, worstU + (i * FR) / LE.INSPECT_TIME), w);
  for (const k of KEYS) {
    const d = Math.abs(now[k] - prev[k]) / FR;      // per second
    if (d > fadeJump) { fadeJump = d; fadeWorst = k; }
  }
  prev = now;
}
const cut = P(worstU, 1);
let cutJump = 0;
for (const k of KEYS) cutJump = Math.max(cutJump, Math.abs(cut[k]) / FR);
check('a cancel fades rather than cutting',
  fadeJump < cutJump * 0.45 && LE.INSPECT_CANCEL > 0.05,
  'fade ' + fadeJump.toFixed(2) + '/s on ' + fadeWorst
    + ' vs a cut at ' + cutJump.toFixed(2) + '/s');
check('and the fade lands exactly on the carry',
  KEYS.every((k) => Math.abs(P(worstU, 0)[k]) < 1e-12));

console.log('\n  channel spans: ' + KEYS.map((k) => k + ' ' + span[k].toFixed(3)).join('  '));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
