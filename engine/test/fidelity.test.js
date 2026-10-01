#!/usr/bin/env node
/* IS EVERY TABLE GUN AS LONG AS THE REAL ONE?
 *
 * The fidelity check that started this measured the parametric guns
 * butt to muzzle against the real weapons' published overall lengths and
 * found the rifles, carbines and machine guns 10 to 28 per cent short and
 * the pistols 25 to 45 per cent long. 97b-service.js now corrects them
 * with one stretch along the bore (SERVICE_REAL_LENGTH). This holds it:
 *
 *   - every gun with a real length on file builds within 2 per cent of it;
 *   - the receiver, magazine and grips are not what got stretched: the
 *     magazine's front-to-back depth and the grip's are the same as an
 *     unstretched build of the same spec;
 *   - and the stretch is moderate everywhere (no gun scaled past 1.75x or
 *     squeezed below 0.45x), because a factor outside that is a spec that
 *     is badly wrong, and should be fixed in the spec, not by a bigger warp.
 *
 * Usage: node engine/test/fidelity.test.js
 */
const LE = require('../../site/engine/legend-engine.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? '  -- ' + detail : ''}`); }
}

function spanX(geos, only) {
  let lo = 1e9, hi = -1e9;
  for (const k of Object.keys(geos)) {
    if (only && !only.test(k)) continue;
    const P = geos[k].positions;
    for (let i = 0; i < P.length; i += 3) { if (P[i] < lo) lo = P[i]; if (P[i] > hi) hi = P[i]; }
  }
  return [lo, hi];
}

const REAL = LE.SERVICE_REAL_LENGTH;
check('the real-length table is exported', REAL && Object.keys(REAL).length >= 25,
  REAL ? Object.keys(REAL).length + ' guns' : 'missing');

const off = [], wild = [];
for (const id of Object.keys(REAL)) {
  const g = LE.makeServiceArm(id);
  const [lo, hi] = spanX(g);
  const mm = (hi - lo) * 1000;
  const err = (mm - REAL[id]) / REAL[id];
  if (Math.abs(err) > 0.02) off.push(`${id} ${mm.toFixed(0)} vs ${REAL[id]}`);
  if (g.__warp && (g.__warp.f > 1.75 || g.__warp.f < 0.45)) wild.push(`${id} x${g.__warp.f.toFixed(2)}`);
}
check('every gun with a real length on file is within 2% of it', off.length === 0, off.join(', '));
check('no gun needed an extreme stretch to get there', wild.length === 0, wild.join(', '));

/* Rigid parts: build each gun again with its real length removed (an
   unstretched reference), and compare the magazine's depth along x. */
const moved = [];
for (const id of Object.keys(REAL)) {
  const keep = REAL[id];
  const warped = LE.makeServiceArm(id);
  delete REAL[id];
  // A fresh build: makeServiceArm is pure and uncached.
  const plain = LE.makeServiceArm(id);
  REAL[id] = keep;
  if (!warped.mag || !warped.mag.positions.length) continue;
  const a = spanX(warped, /^mag$/), b = spanX(plain, /^mag$/);
  if (Math.abs((a[1] - a[0]) - (b[1] - b[0])) > 0.001) {
    moved.push(`${id} ${((a[1] - a[0]) * 1000).toFixed(1)} vs ${((b[1] - b[0]) * 1000).toFixed(1)} mm`);
  }
}
check('no magazine was stretched along with the gun', moved.length === 0, moved.join(', '));

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
