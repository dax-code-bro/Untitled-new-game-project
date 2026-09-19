#!/usr/bin/env node
/* IS ANY PART OF ANY WEAPON FLOATING IN MID AIR?
 *
 * Three separate faults this session were the same fault: a piece of a
 * weapon drawn where nothing else is.
 *
 *   - Every pistol in the table carried a 20 mm sling swivel hanging
 *     two centimetres under its barrel, fixed to nothing, because the
 *     swivel was drawn unconditionally and a pistol has no handguard
 *     and no stock to bolt one to.
 *   - The Bren's and the MG 34's carry handles hovered three
 *     centimetres over the barrel on two stubs that reached nothing,
 *     because their legs were hard-wired to the RECEIVER's top height
 *     and their handles are over the BARREL.
 *   - The Webley came apart into a floating barrel cluster and a
 *     floating grip when `rotary` -- which it was sharing with the
 *     minigun -- stopped drawing the solid barrel underneath.
 *
 * Every one was found by looking at a picture, which means every one
 * of them shipped on the weapons nobody happened to photograph.
 *
 * WHAT THE TEST ACTUALLY ASKS. Not "is the mesh connected": these
 * channels are unions of dozens of separate solids that interpenetrate
 * without sharing a single vertex, so a receiver and the barrel
 * through it are two components and always will be. The question is
 * geometric -- is every piece REACHABLE from the weapon's main mass by
 * hops between pieces that touch?
 *
 * "Does this piece touch any other piece" is not the same question and
 * I wrote that one first. It passed with the sling-swivel bug
 * deliberately put back, because `band` builds a ring as four separate
 * primitives -- inner wall, outer wall, two end caps -- which touch
 * EACH OTHER perfectly well while the whole ring floats four
 * millimetres under the barrel attached to nothing. A floating
 * sub-assembly is the normal case, not the exception: the Bren's carry
 * handle was a dozen pieces and the Webley's barrel cluster was
 * several. Reachability from the main mass is the claim that catches
 * them.
 *
 * Bounding boxes, which are coarse: two long thin parts can have
 * overlapping boxes and still not touch, so this will not catch every
 * floating part. It is a NECESSARY condition, not a sufficient one --
 * anything it flags is definitely adrift, and it costs nothing to run
 * over the whole rack.
 *
 * Sweep and prune on x, because the naive pairwise pass is n-squared
 * over three thousand pieces on the big guns and these models are long
 * and thin, which is the case that sorting by x was made for.
 *
 * Usage: node engine/test/attached.test.js
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
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const G = LE.create({ canvas: '#game', quality: 'low', gravity: 0 });
    const BESPOKE = ['mp5', 'pistol1911', 'model5', 'mauserC96', 'breakwater',
      'scattergun', 'sawnOff', 'thompson', 'mg42', 'remington700', 'killStreak',
      'riotShield', 'paralyzer', 'arcBreaker'];
    const out = { weapons: 0, pieces: 0, clusters: 0, adrift: [], err: null };

    /* Union-find over vertex indices, joined by every triangle. */
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
        const root = find(v), x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        let b = box.get(root);
        if (!b) { b = [x, y, z, x, y, z]; box.set(root, b); }
        else {
          if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z;
          if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
        }
      }
      return [...box.values()];
    }

    const TOL = 0.0012;                      // a millimetre of slack
    const near = (a, b) => a[0] - TOL <= b[3] && b[0] - TOL <= a[3]
      && a[1] - TOL <= b[4] && b[1] - TOL <= a[4]
      && a[2] - TOL <= b[5] && b[2] - TOL <= a[5];

    function sweep(label, parts) {
      const boxes = [];
      for (const k of Object.keys(parts)) {
        const geo = parts[k];
        if (!geo || !geo.positions) continue;
        for (const b of components(geo)) boxes.push({ k, b });
      }
      const n = boxes.length;
      if (!n) return;
      out.weapons++;
      out.pieces += n;

      /* Union the pieces that touch, by sweep and prune on x. */
      const up = new Int32Array(n);
      for (let i = 0; i < n; i++) up[i] = i;
      const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
      const order = boxes.map((_, i) => i).sort((p, q) => boxes[p].b[0] - boxes[q].b[0]);
      for (let oi = 0; oi < n; oi++) {
        const i = order[oi], bi = boxes[i].b;
        for (let oj = oi + 1; oj < n; oj++) {
          const j = order[oj], bj = boxes[j].b;
          if (bj[0] - TOL > bi[3]) break;            // sorted: nothing further can reach
          if (near(bi, bj)) { const a = find(i), c = find(j); if (a !== c) up[a] = c; }
        }
      }

      /* The main mass is the cluster with the most pieces in it. */
      const size = new Map(), span = new Map();
      for (let i = 0; i < n; i++) {
        const r = find(i), b = boxes[i].b;
        size.set(r, (size.get(r) || 0) + 1);
        const s = span.get(r);
        if (!s) span.set(r, b.slice());
        else {
          for (let d = 0; d < 3; d++) { if (b[d] < s[d]) s[d] = b[d]; if (b[d + 3] > s[d + 3]) s[d + 3] = b[d + 3]; }
        }
      }
      let main = null, best = -1;
      for (const [r, c] of size) if (c > best) { best = c; main = r; }
      out.clusters += size.size;
      for (const [r, c] of size) {
        if (r === main) continue;
        const s = span.get(r);
        const chans = [];
        for (let i = 0; i < n; i++) {
          if (find(i) === r && chans.indexOf(boxes[i].k) < 0) chans.push(boxes[i].k);
        }
        out.adrift.push({ weapon: label, pieces: c, chan: chans.sort().join('+'),
          at: [+((s[0] + s[3]) / 2).toFixed(4), +((s[1] + s[4]) / 2).toFixed(4),
            +((s[2] + s[5]) / 2).toFixed(4)],
          size: +Math.max(s[3] - s[0], s[4] - s[1], s[5] - s[2]).toFixed(4) });
      }
    }

    try {
      for (const kind of G.serviceArmKinds()) {
        G.serviceArm(kind, { at: [0, -90, 0], physics: false });
        const P = G._armParts && G._armParts['svc:' + kind];
        if (P) sweep(kind, P);
      }
      for (const fn of BESPOKE) {
        if (typeof G[fn] !== 'function') continue;
        G[fn]({ at: [0, -90, 0], physics: false });
      }
      for (const key of Object.keys(G._armParts || {})) {
        if (key.indexOf('svc:') === 0) continue;
        sweep(key, G._armParts[key]);
      }
    } catch (e) { out.err = String(e.message || e).split('\n')[0]; }
    return out;
  });

  if (r.err) note('threw: ' + r.err);
  note(`${r.weapons} weapons, ${r.pieces} pieces in ${r.clusters} touching clusters`);
  if (r.adrift.length) {
    /* Grouped by shape rather than listed one by one: 131 lines of
       "this bit is loose" is unreadable, and these faults come from
       SHARED builders, so the same cluster appears on every weapon
       that uses one. The signature -- how many pieces, how big, and
       roughly where -- is what tells you which builder to go and
       look at. */
    const bucket = new Map();
    for (const a of r.adrift) {
      const key = a.chan + ' ' + a.pieces + 'p/' + (a.size * 1000).toFixed(0) + 'mm @x'
        + (Math.round(a.at[0] * 100) / 100).toFixed(2)
        + ' y' + (Math.round(a.at[1] * 200) / 200).toFixed(3)
        + ' z' + (Math.round(a.at[2] * 200) / 200).toFixed(3);
      const g = bucket.get(key) || { n: 0, who: [] };
      g.n++; if (g.who.length < 4) g.who.push(a.weapon);
      bucket.set(key, g);
    }
    const rows = [...bucket.entries()].sort((x, y) => y[1].n - x[1].n);
    for (const [key, g] of rows.slice(0, 16)) {
      note(`  x${g.n}  ${key}  (${g.who.join(', ')}${g.n > 4 ? ', …' : ''})`);
    }
    note(`${rows.length} distinct shapes of floating part`);
  }

  check('the whole rack builds and is measurable', r.weapons > 40 && !r.err,
    `${r.weapons} weapons, err=${r.err}`);
  /* Asserted separately: a sweep that found no pieces would otherwise
     report success on nothing. */
  check('and there are pieces in it', r.pieces > 2000, `${r.pieces} pieces`);
  /* THE CLAIM, AND A RATCHET RATHER THAN A CLEAN BILL.
   *
     The first honest run of this found 131 floating clusters across
     the rack, in 52 distinct shapes. They are real -- a flagged
     cluster's box is more than a millimetre from every other box on
     the weapon, so it is genuinely adrift -- but they are not one
     bug, they are a decade of small ones, and fixing all of them
     before the test can be committed would mean the test sits
     uncommitted while more accumulate.

     So it asserts that the count does not GROW. The number below is
     the measured state on the day it went in, and it comes down as
     the shared builders get fixed; it must never go up. When a fix
     lands, the test says so and the baseline is lowered in the same
     commit.

     The three shared causes behind most of it, from the grouped
     output, are worth naming here so the next pass does not have to
     re-derive them:
       - the selector boss and its detents, 5 mm clear of the receiver
         wall on about forty-five weapons
       - a 24-piece, 12 mm assembly at the breech on twenty-five
         weapons
       - the exposed belt on all four belt-fed guns

     What this must NOT become is a number somebody raises to make the
     build green. Raising it is the failure. */
  /* 130 when the test went in; 72 after the selector detents, the
     belt and the FG 42's magazine. Lower it in the same commit as
     every fix. */
  const BASELINE = 72;
  check('no NEW part of any weapon is floating clear of the rest',
    r.adrift.length <= BASELINE,
    `${r.adrift.length} adrift clusters, baseline ${BASELINE}`);
  if (r.adrift.length < BASELINE) {
    note(`BASELINE CAN COME DOWN: ${r.adrift.length} < ${BASELINE}. Lower it in this commit.`);
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
