const { leg, curve, settleAnkle, solvePelvis, GROUND, FLOOR, LEG, anklePath } = require('./gait-solve.js');
const GD = require('./gait-defs.js');

/* zf   ankle z at contact           zb   ankle z when the heel comes off
   rollBack how far the ankle comes back FORWARD as it pivots over the toe
   toeOff  how high the ankle rises on the toe   clear  swing arc height
   retract how far past the contact point the swing reaches before settling */
const GAITS = GD.GAITS;
const KEYS = GD.KEYS;
const want = process.argv[2];
for (const name in GAITS) {
  if (want && name !== want) continue;
  const g = GAITS[name], keys = KEYS[name];
  g.hipsPitch = GD.TRUNK[name].pitch;
  settleAnkle(g);
  const L = leg(g, 0, keys), R = leg(g, 0.5, keys);
  const stride = g.stride;
  console.log(`--- ${name}  T=${g.T}s  stance=${g.stance}  stride=${stride.toFixed(2)}m/cycle  natural=${(stride / g.T).toFixed(2)} m/s`);
  console.log(`    reach L ${(L.reach * 100).toFixed(1)}%  R ${(R.reach * 100).toFixed(1)}%   lowest toe ${L.lowToe.toFixed(3)}  heel ${L.lowHeel.toFixed(3)}  (floor ${FLOOR})  ankle clamped by ${Math.max(L.clamped, R.clamped).toFixed(1)} deg`);
  let zmin = 1e9, zmax = -1e9, ymin = 1e9;
  for (let i = 0; i < 200; i++) { const [y, z] = anklePath(g, i / 200); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); ymin = Math.min(ymin, y); }
  console.log(`    ankle path z ${zmin.toFixed(3)}..${zmax.toFixed(3)}   y min ${ymin.toFixed(3)}`);
  let pmin = 1e9, pmax = -1e9;
  for (const [, v] of g.hipsY) { pmin = Math.min(pmin, v); pmax = Math.max(pmax, v); }
  console.log(`    pelvis ${pmin.toFixed(3)}..${pmax.toFixed(3)}  (bob ${((pmax - pmin) * 1000).toFixed(0)} mm)`);
  if (process.env.SRC) {
    const q = (t) => '[' + t.map(([p, v]) => `[${p.toFixed(2)}, ${v}, 0, 0]`).join(', ') + ']';
    console.log('    upperLegL:', q(L.hip));
    console.log('    lowerLegL:', q(L.knee));
    console.log('    footL:    ', q(L.foot));
    console.log('    upperLegR:', q(R.hip));
    console.log('    lowerLegR:', q(R.knee));
    console.log('    footR:    ', q(R.foot));
  }
}
