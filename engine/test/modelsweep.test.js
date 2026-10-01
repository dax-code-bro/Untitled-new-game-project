#!/usr/bin/env node
/* THE MODEL SWEEP: every placed object on all six maps, for the four
 * faults you can see from across a room.
 *
 * sweep.test.js asks whether each MESH is sane (finite, wound, scaled);
 * adrift/attached ask whether each WEAPON holds together. Nothing asked
 * whether the things the maps PUT in the world sit in it properly. This
 * boots every map the way a player gets it and measures each visible,
 * static object by its world-space box (its mesh bounds through its
 * matrix -- an oriented box, not a loose axis-aligned one):
 *
 *   floating      touches nothing at all -- not the ground, not a wall, not
 *                 another object -- and is not a thing that floats (sky,
 *                 birds, a light's glow, water). A chair 4 cm above the
 *                 floor touches nothing; a lamp on a flex touches its flex.
 *   crooked       stood up with a tilt between 0.3 and 4 degrees. More
 *                 than that is a choice (rubble, a leaning plank, a fallen
 *                 sign); less than 0.3 is rounding. In between is a box
 *                 that was meant to be square and is not.
 *   transparent   a see-through material on something that is not glass,
 *                 water, a light, smoke or a window. A see-through wall is
 *                 a hole in the map.
 *   clipping      a piece of furniture or a vehicle pushed more than 6 cm
 *                 into a wall or into another piece of furniture -- the
 *                 sofa through the plaster, the car in the kerb. (Walls
 *                 meeting walls, floors under walls and trim on walls
 *                 overlap by construction and are invisible; they are not
 *                 counted.)
 *
 * Each map's findings are listed by name. The counts are held at the
 * baseline below: a new fault fails the test, and a fixed one should
 * lower the number.
 *
 * Usage: node engine/test/modelsweep.test.js [mapId ...]
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const R = path.join(__dirname, '..', '..') + '/';

const BASELINE = {
  bunker9: { floating: 0, crooked: 0, transparent: 0, clipping: 0 },
  coastline: { floating: 0, crooked: 0, transparent: 0, clipping: 0 },
  helipad: { floating: 0, crooked: 0, transparent: 0, clipping: 0 },
  resort: { floating: 0, crooked: 0, transparent: 0, clipping: 0 },
  town: { floating: 0, crooked: 0, transparent: 0, clipping: 0 },
  demolition: { floating: 0, crooked: 0, transparent: 0, clipping: 0 },
};

let passed = 0, failed = 0;
const check = (n, c, d) => { if (c) { passed++; console.log('  ok   ' + n); }
  else { failed++; console.log('  FAIL ' + n + (d ? '\n       ' + d : '')); } };

/* Runs in the page: measure every static object of the current map. */
function audit() {
  const G = window.__G;
  const FLOATERS = /sky|cloud|bird|gull|glow|halo|beam|flare|smoke|steam|fog|mist|water|sea|lake|pool|wave|foam|ripple|spark|ember|dust|particle|star|moon|sun|light-cone|godray|shaft|leaf|leaves|canopy|crown|foliage|hedge|bush|tree|ivy|vine|insect|moth|fly|bat|chopper|heli-rotor|rotor|blade|drone|plane|balloon|kite|banner|flag|bunting|garland|string|wire|cable|rope|chain|line|tag|text|letter|sign-glyph|glyph|decal|stain|crack|mark|puddle|shadow|marker|arrow|beacon|hologram|holo|screen|ui|hud|fx/;
  const SEE_THROUGH_OK = /glass|window|pane|glazing|water|sea|lake|pool|wave|foam|light|lamp|glow|halo|beam|flare|smoke|steam|fog|mist|haze|cloud|sky|screen|visor|lens|bottle|jar|ghost|hologram|holo|shield|bubble|ice|crystal|godray|shaft|cone|ripple|splash|decal|shadow|vapour|vapor|fx|spray|jet|tint|film|net|mesh|fence|grate|curtain|veil|plastic|acrylic|perspex|vinyl|tarp/;
  const FURNITURE = /^(?:sofa|couch|chair|stool|table|desk|bench|bed|cabinet|cupboard|shelf|shelves|bookcase|wardrobe|dresser|fridge|freezer|oven|stove|washer|counter|bar-top|crate|barrel|drum|locker|safe|car|truck|van|bus|jeep|sedan|pickup|boat|machine|vending|kiosk|generator|piano|tv|television|sink|toilet|bath|tub|lounger|sunbed|umbrella|planter|pot|bin|dumpster|skip|pallet|sandbag|tyre|tire|cart|trolley|forklift|bike|motorbike|helicopter)s?$/;
  const WALLISH = /^(?:wall|partition|facade|parapet|pillar|column)s?$/;
  const name = (a) => (/^actor\d+$/.test(a.name || '') ? '' : (a.name || '')).toLowerCase();
  /* Matched as WHOLE WORDS of the name, not substrings: 'lake-bed' is not a
     bed and 'boathouse-deck' is not a boat. */
  const words = (n) => n.split(/[^a-z]+/).filter(Boolean);
  const hasWord = (n, re) => words(n).some((w) => re.test(w));
  const list = [];
  for (const a of G.actors) {
    if (!a.visible || a.dead || !a.mesh || a.skeleton || a.face || a.controller || a.grass) continue;
    let anc = false;
    for (let p = a.parent; p; p = p.parent) if (p.controller || p.skeleton) { anc = true; break; }
    if (anc) continue;
    const bd = a.mesh.bounds;
    if (!bd || !isFinite(bd.min.x)) continue;
    a.updateMatrix && a.updateMatrix();
    const e = a.matrix.e;
    const c = [(bd.min.x + bd.max.x) / 2, (bd.min.y + bd.max.y) / 2, (bd.min.z + bd.max.z) / 2];
    const h = [(bd.max.x - bd.min.x) / 2, (bd.max.y - bd.min.y) / 2, (bd.max.z - bd.min.z) / 2];
    // Oriented box: centre, three axes (unit), three half sizes.
    const ax = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]];
    const hs = [], au = [];
    for (let k = 0; k < 3; k++) {
      const L = Math.hypot(ax[k][0], ax[k][1], ax[k][2]) || 1;
      au.push([ax[k][0] / L, ax[k][1] / L, ax[k][2] / L]);
      hs.push(Math.abs(h[k] * L));
    }
    const C = [e[0] * c[0] + e[4] * c[1] + e[8] * c[2] + e[12], e[1] * c[0] + e[5] * c[1] + e[9] * c[2] + e[13],
               e[2] * c[0] + e[6] * c[1] + e[10] * c[2] + e[14]];
    const lo = [0, 0, 0], hi = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const r = hs[0] * Math.abs(au[0][k]) + hs[1] * Math.abs(au[1][k]) + hs[2] * Math.abs(au[2][k]);
      lo[k] = C[k] - r; hi[k] = C[k] + r;
    }
    const m = a.material || {};
    list.push({ a, nm: name(a), C, au, hs, lo, hi, key: a.mesh.__key || '',
                op: m.opacity != null ? m.opacity : 1, tr: !!m.transparent });
  }
  // A spatial hash on x/z, 4 m cells, for the neighbour queries.
  const cell = 4, grid = new Map();
  const kx = (x) => Math.floor(x / cell);
  list.forEach((o, i) => {
    for (let x = kx(o.lo[0]); x <= kx(o.hi[0]); x++) for (let z = kx(o.lo[2]); z <= kx(o.hi[2]); z++) {
      const k = x + ',' + z;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  });
  const near = (o, pad) => {
    const out = new Set();
    for (let x = kx(o.lo[0] - pad); x <= kx(o.hi[0] + pad); x++) for (let z = kx(o.lo[2] - pad); z <= kx(o.hi[2] + pad); z++) {
      const g = grid.get(x + ',' + z);
      if (g) for (const i of g) out.add(i);
    }
    return out;
  };
  // Oriented-box separation (SAT): the smallest overlap along the 15 axes, negative if apart.
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const overlap = (A, B) => {
    const d = [B.C[0] - A.C[0], B.C[1] - A.C[1], B.C[2] - A.C[2]];
    const axes = [...A.au, ...B.au];
    for (const u of A.au) for (const v of B.au) {
      const w = cross(u, v), L = Math.hypot(w[0], w[1], w[2]);
      if (L > 1e-4) axes.push([w[0] / L, w[1] / L, w[2] / L]);
    }
    let best = 1e9;
    for (const n of axes) {
      const ra = A.hs[0] * Math.abs(dot(A.au[0], n)) + A.hs[1] * Math.abs(dot(A.au[1], n)) + A.hs[2] * Math.abs(dot(A.au[2], n));
      const rb = B.hs[0] * Math.abs(dot(B.au[0], n)) + B.hs[1] * Math.abs(dot(B.au[1], n)) + B.hs[2] * Math.abs(dot(B.au[2], n));
      const o = ra + rb - Math.abs(dot(d, n));
      if (o < best) best = o;
    }
    return best;
  };
  const r = { floating: [], crooked: [], transparent: [], clipping: [], objects: list.length };
  const at = (o) => o.C.map((v) => +v.toFixed(2));
  // What it is, for an unnamed box: its size and its material.
  const what = (o) => ({ size: o.hs.map((v) => +(v * 2).toFixed(2)), tex: (o.a.material && o.a.material.texture) || '',
                         parent: o.a.parent ? name(o.a.parent) || 'unnamed' : '', line: o.a.__src || '' });
  list.forEach((o, i) => {
    if (o.C[1] < -20) return;   // parked out of the world until it is needed
    const big = o.hs[0] > 40 || o.hs[2] > 40;
    // FLOATING: touches nothing within 1.5 cm, and is not on or under the ground plane.
    if (!big && !FLOATERS.test(o.nm) && o.lo[1] > 0.02) {
      let touches = false;
      for (const j of near(o, 0.05)) {
        if (j === i) continue;
        const p = list[j];
        if (p.lo[0] > o.hi[0] + 0.05 || p.hi[0] < o.lo[0] - 0.05 || p.lo[1] > o.hi[1] + 0.05 || p.hi[1] < o.lo[1] - 0.05 ||
            p.lo[2] > o.hi[2] + 0.05 || p.hi[2] < o.lo[2] - 0.05) continue;
        if (overlap(o, p) > -0.015) { touches = true; break; }
      }
      if (!touches) {
        // The physics ground counts too: a ray down from the bottom.
        const hit = G.raycast([o.C[0], o.lo[1] + 0.01, o.C[2]], [0, -1, 0], 0.05);
        if (!hit) r.floating.push(Object.assign({ name: o.nm || o.key || '(unnamed)', at: at(o), gap: o.lo[1].toFixed(3) }, what(o)));
      }
    }
    // CROOKED: the up axis tilted a little.
    const up = o.au[1];
    const tilt = Math.acos(Math.min(1, Math.abs(up[1]))) * 180 / Math.PI;
    const anyUp = Math.max(Math.abs(o.au[0][1]), Math.abs(o.au[1][1]), Math.abs(o.au[2][1]));
    const tiltAny = Math.acos(Math.min(1, anyUp)) * 180 / Math.PI;
    if (tiltAny > 0.3 && tiltAny < 4 && !/rubble|debris|plank|board|lean|fallen|tilt|wreck|broken|slope|ramp|roof|stair|step|pile|heap|rock|stone|boulder|log|branch|root|grave|tomb|sag|drift|dune|wave|cloth|sheet|tarp|paper|book|bottle|can|cup|shell|casing|brass|hung|loose|torn|stake|barb|spout/.test(o.nm))
      r.crooked.push(Object.assign({ name: o.nm || o.key || '(unnamed)', at: at(o), tilt: +tiltAny.toFixed(2) }, what(o)));
    void tilt;
    // TRANSPARENT where it should not be.
    if ((o.tr || o.op < 0.999) && !SEE_THROUGH_OK.test(o.nm) && !SEE_THROUGH_OK.test(o.key))
      r.transparent.push(Object.assign({ name: o.nm || o.key || '(unnamed)', at: at(o), opacity: +o.op.toFixed(2) }, what(o)));
    // CLIPPING: furniture into walls or other furniture.
    const notFurniture = (n) => /\b(lake|river|sea|flower|garden|sea|road|truck)[-_ ]bed/.test(n);
    if (hasWord(o.nm, FURNITURE) && !notFurniture(o.nm) && o.C[1] > -20) {
      for (const j of near(o, 0)) {
        if (j <= i && hasWord(list[j].nm, FURNITURE)) continue;   // each furniture pair once
        if (j === i) continue;
        const p = list[j];
        const wall = hasWord(p.nm, WALLISH), furn = hasWord(p.nm, FURNITURE) && !notFurniture(p.nm);
        if (!wall && !furn) continue;
        // Parts of the same object (a car's wheel and its body) share a name stem: not a clip.
        const stem = (s) => s.split(/[-_:\s]/)[0];
        if (furn && stem(p.nm) === stem(o.nm)) continue;
        // An L of two parts of one piece (a 'long bench top' meeting its 'return bench top'): same last word, same height.
        const last = (s) => words(s).slice(-2).join(' ');
        if (furn && last(p.nm) === last(o.nm) && Math.abs(p.hi[1] - o.hi[1]) < 0.01) continue;
        if (o.a.parent && (o.a.parent === p.a || o.a.parent === p.a.parent)) continue;
        const d = overlap(o, p);
        if (d > 0.06) r.clipping.push({ name: o.nm, into: p.nm, at: at(o), depth: +d.toFixed(3), line: o.a.__src || '', intoLine: p.a.__src || '' });
      }
    }
  });
  return r;
}

const MAPS = {
  bunker9: { scripts: ['site/games/bunker-nine.js'],
    start: "window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' }); window.__G = B.game;" },
  coastline: { scripts: ['site/games/bunker-nine.js', 'site/games/coastline.js'],
    start: "window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: 'coastline' }); window.__G = B.game;" },
};
for (const id of ['helipad', 'resort', 'town', 'demolition']) {
  MAPS[id] = { scripts: ['site/games/mp-data.js', 'site/games/mp-maps.js'],
    start: `window.__G = LE.create({ canvas: '#game', quality: 'low', gravity: -19.6 }); window.__M = MP_MAPS.build(window.__G, '${id}');` };
}

(async () => {
  const want = process.argv.slice(2).filter((a) => MAPS[a]);
  const ids = want.length ? want : Object.keys(MAPS);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const all = {};
  for (const id of ids) {
    const m = MAPS[id];
    const p = await b.newPage({ viewport: { width: 200, height: 120 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
    await p.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0"></canvas></body>');
    await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });
    // Where each object was made: the first stack frame in a game script, so a finding names its source line.
    await p.evaluate(() => {
      const E = window.LE.Engine.prototype, orig = E._spawn;
      E._spawn = function (...args) {
        const a = orig.apply(this, args);
        try {
          const st = new Error().stack.split('\n').slice(2);
          const f = st.find((l) => /games\//.test(l)) || '';
          const mm = f.match(/games\/([\w.-]+):(\d+):\d+\)?$/);
          a.__src = mm ? mm[1].replace('.js', '') + ':' + mm[2] : '';
        } catch (e) { /* */ }
        return a;
      };
    });
    // By path, so their stack frames carry the file name (the engine's do not).
    for (const s of m.scripts) await p.addScriptTag({ path: R + s });
    await p.evaluate(m.start);
    await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__G.step(1 / 60); });
    const r = await p.evaluate(audit);
    all[id] = r;
    await p.close();
    console.log(`\n${id}: ${r.objects} objects`);
    for (const k of ['floating', 'crooked', 'transparent', 'clipping']) {
      const L = r[k];
      console.log(`  ${k}: ${L.length}`);
      for (const f of L.slice(0, 40)) console.log('     ' + JSON.stringify(f));
      if (L.length > 40) console.log(`     ... and ${L.length - 40} more`);
      const base = BASELINE[id][k];
      check(`${id}: ${k} at or under ${base}`, L.length <= base, `${L.length} found`);
    }
    if (errs.length) check(`${id}: no page errors`, false, errs.slice(0, 3).join(' | '));
  }
  if (process.env.SWEEP_JSON) fs.writeFileSync(process.env.SWEEP_JSON, JSON.stringify(all, null, 1));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
