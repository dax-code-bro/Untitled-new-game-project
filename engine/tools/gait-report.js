/* Measure every gait without emitting it: how much of its own leg each
   one asks for, whether any part of a sole goes through the floor, how
   far the pelvis rides, and how fast the cycle travels over the ground.
   `node engine/tools/gait-report.js [name ...]` */
const S = require('./gait-solve.js');
const G = require('./gait-defs.js');
const want = process.argv.slice(2);
let bad = 0;
for (const name in G.GAITS) {
  if (want.length && !want.includes(name)) continue;
  const g = G.GAITS[name], keys = G.KEYS[name], tr = G.TRUNK[name];
  g.hipsPitch = tr.pitch;
  S.prepare(g);
  const L = S.legTracks(g, 'L', keys), R = S.legTracks(g, 'R', keys);
  let pmin = 1e9, pmax = -1e9;
  for (const [, v] of g.hipsY) { pmin = Math.min(pmin, v); pmax = Math.max(pmax, v); }
  let zl = 1e9, zh = -1e9;
  for (const side of ['L', 'R'])
    for (let i = 0; i < 200; i++) {
      const z = S.anklePath(g, g[side], i / 200)[1];
      zl = Math.min(zl, z); zh = Math.max(zh, z);
    }
  const lowest = Math.min(L.lowToe, L.lowHeel, R.lowToe, R.lowHeel);
  const reach = Math.max(L.reach, R.reach), clamp = Math.max(L.clamped, R.clamped);
  if (reach > 1.005 || lowest < S.FLOOR - 0.002) bad++;
  console.log(`${name.padEnd(13)} ${g.T}s  stride ${g.stride.toFixed(2)}m = ${(g.stride / g.T).toFixed(2)} m/s`);
  console.log(`  reach ${(reach * 100).toFixed(1)}%   sole low ${lowest.toFixed(3)} (floor ${S.FLOOR})`
    + `   ankle clamp ${clamp.toFixed(1)} deg   pelvis ${pmin.toFixed(3)}..${pmax.toFixed(3)} (${((pmax - pmin) * 1000).toFixed(0)} mm)`
    + `   ankle z ${zl.toFixed(2)}..${zh.toFixed(2)}`);
}
if (bad) { console.log(`\n${bad} gait(s) over-reach or penetrate`); process.exit(1); }
