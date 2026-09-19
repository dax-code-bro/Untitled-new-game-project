#!/usr/bin/env node
/* DO ANY TWO WEAPONS IN THE RACK LOOK THE SAME?
 *
 * The ask was "closely look at all of them side by side and make sure
 * none reuse the exact same look just slightly different". The first
 * attempt at answering it rendered all sixty guns to a contact sheet
 * and diffed the pictures pairwise -- which worked, found the pistols,
 * and cost a GPU, a Chromium, and four minutes per run. It also could
 * only answer questions about what one camera angle happened to see.
 *
 * This asks the geometry instead, and it needs neither.
 *
 * HOW. Every weapon is voxelised into a 24-cubed grid FITTED TO ITS OWN
 * BOUNDING BOX, and the two occupancy histograms are compared. Fitting
 * the grid per weapon is the whole point: it takes size out of the
 * comparison and leaves proportion and where the mass sits, so a gun
 * that is "the same thing eight percent longer" scores as a duplicate
 * rather than as a new weapon. That is exactly the failure being looked
 * for -- nine pistols that differed only in millimetres.
 *
 * The score is total variation distance: 0 is the same shape, 1 is no
 * shared occupancy at all. Across the rack the median pair is 0.96, so
 * anything under a third is two guns that a player will read as one.
 *
 * VALIDATED BY PUTTING THE BUG BACK. Stripping the hammer, tang,
 * serration and grip-section fields back off the nine sidearms -- the
 * state this test was written against -- takes p226/g18 from 0.92 to
 * 0.04 and this fails with both named. The eight worst pairs it
 * reported on the first run were, in order: groza/aug, killstreak/
 * barrett, stg44/ak47, falke/g3a, volkhammer/ak47, m60/pkm, bren/dp28,
 * kar98/mosin -- every one of them a pair a person would also pick out,
 * which is the check that the metric is measuring resemblance and not
 * vertex count.
 *
 * Usage: node engine/test/distinct.test.js
 */
const LE = require('../../site/engine/legend-engine.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? '  -- ' + detail : ''}`); }
}

const N = 24;

/* The rounds are left out. A magazine full of brass is the same brass
   in every gun that takes that cartridge, and including it makes two
   weapons look alike for a reason that has nothing to do with either
   of their shapes. The feed channels go for the same reason. */
function grid(id) {
  const g = LE.makeServiceArm(id);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], all = [];
  for (const k of Object.keys(g)) {
    if (/^(shell|tip|feed)/.test(k)) continue;
    const p = g[k].positions;
    for (let i = 0; i < p.length; i += 3) {
      all.push(p[i], p[i + 1], p[i + 2]);
      for (let a = 0; a < 3; a++) {
        if (p[i + a] < lo[a]) lo[a] = p[i + a];
        if (p[i + a] > hi[a]) hi[a] = p[i + a];
      }
    }
  }
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const v = new Float64Array(N * N * N);
  let tot = 0;
  for (let i = 0; i < all.length; i += 3) {
    const ix = Math.min(N - 1, Math.floor((all[i] - lo[0]) / span * N));
    const iy = Math.min(N - 1, Math.floor((all[i + 1] - lo[1]) / span * N));
    const iz = Math.min(N - 1, Math.floor((all[i + 2] - lo[2]) / span * N));
    v[(ix * N + iy) * N + iz] += 1; tot++;
  }
  for (let j = 0; j < v.length; j++) v[j] /= tot || 1;
  return { v, n: all.length / 3, len: hi[0] - lo[0] };
}

function tvd(a, b) {
  let s = 0;
  for (let i = 0; i < a.v.length; i++) s += Math.abs(a.v[i] - b.v[i]);
  return s * 0.5;
}

const ids = Object.keys(LE.SERVICE_KINDS);
check('the service table is reachable from Node and has the whole rack in it',
  ids.length >= 50, `${ids.length} weapons`);

const G = {};
for (const id of ids) G[id] = grid(id);

/* Every weapon has to be geometry before anything can be said about
   how alike two of them are. An empty channel scores 0 against
   everything, which would read as maximally distinct. */
const empty = ids.filter((id) => G[id].n < 500);
check('every weapon in the table actually builds something',
  empty.length === 0, empty.join(', '));

const pairs = [];
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    pairs.push([tvd(G[ids[i]], G[ids[j]]), ids[i], ids[j]]);
  }
}
pairs.sort((a, b) => a[0] - b[0]);
const median = pairs[pairs.length >> 1][0];

check('the rack as a whole is varied -- the median pair shares little',
  median > 0.85, `median ${median.toFixed(4)}`);

/* THE RATCHET.
 *
 * Two numbers, and they only ever go down. DUPLICATE is the line below
 * which two weapons are the same weapon; nothing may sit under it.
 * ALIKE is looser and counts the family resemblances that are allowed
 * to exist -- an AK-47 and an AK-74 SHOULD look related -- but the
 * count is fixed, so a new gun cannot be dropped in as a recolour of
 * one already here without this saying so by name. */
const DUPLICATE = 0.30;
const ALIKE = 0.40;
const BASELINE_ALIKE = 6;

const dupes = pairs.filter((p) => p[0] < DUPLICATE);
check(`no two weapons are the same shape (under ${DUPLICATE})`,
  dupes.length === 0,
  dupes.map((p) => `${p[1]}/${p[2]} ${p[0].toFixed(3)}`).join(', '));

const alike = pairs.filter((p) => p[0] < ALIKE);
check(`family resemblances stay at or under ${BASELINE_ALIKE} pairs`,
  alike.length <= BASELINE_ALIKE,
  `${alike.length}: ` + alike.map((p) => `${p[1]}/${p[2]} ${p[0].toFixed(3)}`).join(', '));

/* And the ten closest pairs, always, so a run of this is also the
   answer to "which two are most alike right now". */
console.log('\n  closest pairs:');
for (const p of pairs.slice(0, 10)) {
  console.log(`    ${p[0].toFixed(4)}  ${p[1]} / ${p[2]}`);
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
