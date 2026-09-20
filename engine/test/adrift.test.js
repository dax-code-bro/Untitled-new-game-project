#!/usr/bin/env node
/* IS ANY PART OF ANY WEAPON FLOATING IN MID AIR? -- IN NODE.
 *
 * attached.test.js asks this already and asks it well; the reachability
 * argument in its header is the one this file uses and is worth reading
 * there. What it needs is a browser, a GL context and, on this machine,
 * between four and ten minutes -- and on the run that prompted this file
 * it hit a ten-minute timeout and reported nothing at all.
 *
 * Every builder involved is pure arithmetic. SERVICE_KINDS and
 * BESPOKE_ARMS are exported for exactly this reason, so the same
 * question can be asked of the same geometry in about a second, and
 * asked of BOTH racks -- the 73 table weapons and the 11 hand-built
 * ones -- rather than whichever the browser happened to register.
 *
 * WHAT IT FOUND, first run, with the browser's five known floaters as
 * the starting point:
 *
 *   hydra       36 pieces   the six muzzle crowns, all drawn on the
 *                           axis, in the hole between the six barrels
 *   riotshield  72 pieces   the rear sight base, a 213 mm plank
 *                           standing in the hollow between the skins
 *   mp5         12 pieces   the sling loop under the wrist, 2.8 mm
 *                           below the receiver, bolted to nothing
 *   mg42        10 pieces   the folding leaf sight and its base, six
 *                           millimetres above the receiver
 *   breakwater  42 pieces   the recoil pad, two millimetres behind the
 *                           end of the stock
 *
 * and then four more that the riot shield's plank had been hiding: the
 * chambered round on the MP7, the UMP, the Grease Gun and the Vector was
 * reaching the rest of the gun THROUGH that plank, which on those four
 * passed through the same air. Removing it left four cartridges hanging
 * in space, which is what they had always been.
 *
 * THE BAR IS ZERO. Not a ratchet: a part that touches nothing is never
 * right, and after the nine above there are none left. Anything this
 * prints is a new one.
 *
 * Usage: node engine/test/adrift.test.js
 */
const LE = require('../../site/engine/legend-engine.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? '  -- ' + detail : ''}`); }
}

/* A millimetre of slack, the same as the browser sweep's, because these
   models are authored to the tenth of a millimetre and two parts that
   meet exactly can round apart. */
const TOL = 0.0012;

/* Union-find over vertex indices, joined by every triangle: one entry
   per connected piece, as its bounding box. */
function components(geo) {
  const I = geo.indices, P = geo.positions;
  if (!I || !P) return [];
  const n = P.length / 3;
  const up = new Int32Array(n);
  for (let i = 0; i < n; i++) up[i] = i;
  const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) up[a] = b; };
  for (let i = 0; i < I.length; i += 3) { join(I[i], I[i + 1]); join(I[i + 1], I[i + 2]); }
  const box = new Map();
  for (let v = 0; v < n; v++) {
    const r = find(v), x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const b = box.get(r);
    if (!b) box.set(r, [x, y, z, x, y, z]);
    else {
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z;
      if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
    }
  }
  return [...box.values()];
}

const near = (a, b) => a[0] - TOL <= b[3] && b[0] - TOL <= a[3]
  && a[1] - TOL <= b[4] && b[1] - TOL <= a[4]
  && a[2] - TOL <= b[5] && b[2] - TOL <= a[5];

function sweep(label, geos) {
  const boxes = [];
  for (const k of Object.keys(geos)) {
    for (const b of components(geos[k])) boxes.push({ k, b });
  }
  const n = boxes.length;
  if (!n) return [];
  const up = new Int32Array(n);
  for (let i = 0; i < n; i++) up[i] = i;
  const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  /* Sweep and prune on x: these models are long and thin, which is the
     case sorting by x was made for, and the naive pass is n-squared
     over three thousand pieces on the big guns. */
  const order = boxes.map((_, i) => i).sort((p, q) => boxes[p].b[0] - boxes[q].b[0]);
  for (let oi = 0; oi < n; oi++) {
    const i = order[oi], bi = boxes[i].b;
    for (let oj = oi + 1; oj < n; oj++) {
      const j = order[oj], bj = boxes[j].b;
      if (bj[0] - TOL > bi[3]) break;
      if (near(bi, bj)) { const a = find(i), c = find(j); if (a !== c) up[a] = c; }
    }
  }
  const size = new Map(), span = new Map(), chan = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i), b = boxes[i].b;
    size.set(r, (size.get(r) || 0) + 1);
    if (!chan.has(r)) chan.set(r, new Set());
    chan.get(r).add(boxes[i].k);
    const s = span.get(r);
    if (!s) span.set(r, b.slice());
    else for (let d = 0; d < 3; d++) {
      if (b[d] < s[d]) s[d] = b[d];
      if (b[d + 3] > s[d + 3]) s[d + 3] = b[d + 3];
    }
  }
  /* The main mass is the cluster with the most pieces in it. */
  let main = null, best = -1;
  for (const [r, c] of size) if (c > best) { best = c; main = r; }
  const out = [];
  for (const [r, c] of size) {
    if (r === main) continue;
    const s = span.get(r);
    out.push(`${label} ${[...chan.get(r)].sort().join('+')} ${c}p/`
      + `${(Math.max(s[3] - s[0], s[4] - s[1], s[5] - s[2]) * 1000).toFixed(0)}mm`
      + ` @${((s[0] + s[3]) / 2).toFixed(3)},${((s[1] + s[4]) / 2).toFixed(3)}`);
  }
  return out;
}

const table = Object.keys(LE.SERVICE_KINDS);
const hand = Object.keys(LE.BESPOKE_ARMS);
check('both racks are reachable from Node',
  table.length >= 70 && hand.length >= 10, `${table.length} table, ${hand.length} hand-built`);

const adrift = [];
let pieces = 0;
for (const id of table) {
  const g = LE.makeServiceArm(id);
  for (const k of Object.keys(g)) pieces += components(g[k]).length;
  adrift.push(...sweep(id, g));
}
for (const id of hand) {
  const g = LE.makeBespokeArm(id);
  for (const k of Object.keys(g)) pieces += components(g[k]).length;
  adrift.push(...sweep(id + ' (hand-built)', g));
}
console.log(`  ..   ${table.length + hand.length} weapons, ${pieces} pieces`);

check('no part of any weapon is floating clear of the rest',
  adrift.length === 0, adrift.join('; '));

/* AND THE SIGHT LINE POINTS THROUGH WHATEVER THE WEAPON AIMS WITH.
 *
 * A second question, in the same file because it has the same shape:
 * two numbers that describe one thing and are written down twice.
 * `sight.y` is where the iron line is and `optic.y` is where the scope
 * tube's axis is, and on all nine weapons with an integral optic they
 * disagreed -- the Barrett by 34 mm, the Springfield by 31. The game
 * puts the camera on the sight line when you aim, so on those nine you
 * aimed at the underside of your own scope.
 *
 * serviceArm reads the optic's axis when there is one now, so this
 * cannot come back through that path. What this catches is the other
 * direction: an optic added to a spec whose height nobody thought
 * about, which is exactly how all nine arrived. A scope that is not
 * roughly over the bore, or is buried in the receiver, is wrong
 * whatever reads it.
 */
const badOptic = [];
for (const id of table) {
  const K = LE.SERVICE_KINDS[id];
  if (!K.optic) continue;
  const clear = K.optic.y - K.rec.up;
  if (clear < 0.002 || clear > 0.060) {
    badOptic.push(`${id} optic ${K.optic.y.toFixed(3)} vs receiver top `
      + `${K.rec.up.toFixed(3)} (${(clear * 1000).toFixed(0)}mm clear)`);
  }
}
check('every integral optic sits above its receiver and not in orbit',
  badOptic.length === 0, badOptic.join('; '));

/* NO WEAPON MAY DECLARE THE SAME THING TWICE.
 *
 * A JavaScript object literal with two `grip:` keys is legal, silent,
 * and keeps the LAST one. Adding grip-section modifiers to five
 * sidearms as a new line rather than as fields on the line already
 * there therefore deleted the Model 5's, the Webley's, the Mauser's,
 * the P226's and the G18's authored grips outright -- position, length
 * and rake all reverted to the generic pistol base, and nothing said a
 * word. The Model 5 then failed guns.test.js on overall length, and my
 * first repair for THAT was aimed at its hammer, because the grip
 * regression was invisible and the length was not.
 *
 * The Kill Streak had two `muzzle` and two `barrel`, and the Barrett
 * two `barrel`. Those happened to resolve to what I intended, which is
 * worse: dead lines that read as authoritative.
 *
 * Source text, not the built table, because by the time it is an
 * object the evidence is gone -- that is the whole problem.
 */
{
  const fs = require('fs');
  const path = require('path');
  const dupes = [];
  for (const f of ['97b-service.js', '97c-sidearm.js']) {
    const lines = fs.readFileSync(
      path.join(__dirname, '..', 'src', f), 'utf8').split('\n');
    let cur = null, keys = null, at = 0;
    lines.forEach((line, i) => {
      const open = /^  ([A-Za-z0-9_]+): (svcSpec|sideSpec|gaugeSpec|boltSpec|tubeSpec)\(\{/.exec(line);
      if (open) { cur = open[1]; keys = new Map(); at = i + 1; return; }
      if (cur == null) return;
      if (/^  \}\),/.test(line)) {
        for (const [k, n] of keys) if (n > 1) dupes.push(`${f}:${at} ${cur} has ${n} \`${k}\``);
        cur = null; return;
      }
      const k = /^    ([A-Za-z0-9_]+): /.exec(line);
      if (k) keys.set(k[1], (keys.get(k[1]) || 0) + 1);
    });
  }
  check('no weapon spec declares the same key twice',
    dupes.length === 0, dupes.join('; '));
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
