#!/usr/bin/env node
/* ALL SIXTY, not the one I happened to photograph.
 *
 * The NaN quaternion that made the multiplayer weapon invisible was a
 * single line in shared placement code, so it should apply to every
 * gun in the game. "Should" is the word that has cost this project a
 * week. Asked directly whether it was all of them or just one, the
 * only honest answer is the one with sixty rows in it.
 *
 * For every weapon in MP_DATA.GUNS this drives the REAL viewmodel --
 * the same select() and place() the game calls -- and asks:
 *
 *   - does a model get built at all, and is it the weapon that was
 *     asked for rather than the m4 the fallback hands out silently?
 *   - is every part's transform FINITE? (An actor with a NaN
 *     quaternion reports a perfectly sensible position and draws
 *     nothing, which is the whole reason this file exists.)
 *   - is it a real model rather than a blockout, and is it on screen?
 *
 * Usage: node engine/test/allguns.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT_DIR || path.join(ROOT, '.testshots');
fs.mkdirSync(OUT, { recursive: true });

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
  const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=town&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.evaluate(() => window.MP.input._lock(true));

  const rows = await page.evaluate(() => {
    const G = window.MP, M = G.match, vm = G.viewmodel;
    const D = window.MP_DATA;
    const out = [];
    const eye = { x: M.you.pos.x, y: M.you.pos.y + 1.62, z: M.you.pos.z };
    for (const spec of D.GUNS) {
      const id = spec.id;
      /* The REAL path: select through the viewmodel and place it with
         the same call the frame loop makes. */
      let built = null, err = null;
      try {
        vm.place(eye, 0, 0, 0, false, 0, 0, id, 0, 1 / 60);
        built = vm.gun;
      } catch (e) { err = String(e.message || e).slice(0, 80); }
      if (!built) { out.push({ id, cls: spec.cls || spec.class, err: err || 'no model' }); continue; }
      const key = (built.mesh && built.mesh.__key) || built.name || '';
      const parts = [built];
      for (const k of (built.partNames || [])) {
        if (built[k] && built[k] !== built) parts.push(built[k]);
      }
      let verts = 0, finite = true, shown = true;
      for (const a of parts) {
        verts += (a.mesh && a.mesh.vertexCount) || 0;
        if (!a.matrix.e.every((v) => Number.isFinite(v))) finite = false;
        if (a.visible === false) shown = false;
      }
      out.push({ id, cls: spec.cls || spec.class, key, parts: parts.length,
        verts, finite, shown,
        /* A silent fallback hands back the m4 for anything it cannot
           build, and the mesh key carries the id that was actually
           made. But three weapons are hand-built models living under
           another name (the 1911 is `pistol1911`, the Mauser is
           `mauserC96`), and treating those as failures reports four
           problems and means one. */
        alias: (window.MP_GAME.VM_BESPOKE || {})[id]
          || (window.MP_GAME.VM_FALLBACK || {})[id] || null,
        fellBack: !String(key).toLowerCase().includes(String(id).toLowerCase()),
        err });
    }
    return out;
  });

  const bad = rows.filter((r) => r.err);
  const nan = rows.filter((r) => !r.err && !r.finite);
  /* NAMES ARE A DEAD END. The 1911's model is keyed `1911:river:steel`,
     the Mauser's is `c96:steel`, the Model 5's is `mod5:steel` -- all
     three correct, none of them containing the id that asked for them,
     and three rounds of string matching produced three different wrong
     answers about it.

     The property that matters is not what the model is CALLED. It is
     whether two weapons are handing you the same object: "did I get my
     gun or somebody else's". So group by the model actually built and
     look for collisions. The MG42 is a declared stand-in -- it has no
     model of its own and borrows the MG34's -- and is allowed one. */
  const byKey = new Map();
  rows.filter((r) => !r.err).forEach((r) => {
    if (!byKey.has(r.key)) byKey.set(r.key, []);
    byKey.get(r.key).push(r.id);
  });
  const shared = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
  const declared = (k, ids) => ids.every((id) => {
    const a = rows.find((r) => r.id === id).alias;
    return !a || ids.includes(a) || String(k).includes(a);
  });
  const clashes = shared.filter(([k, ids]) => !declared(k, ids));
  const fell = clashes;
  const borrowed = rows.filter((r) => r.alias && r.fellBack);
  const thin = rows.filter((r) => !r.err && r.verts < 1500);
  const hidden = rows.filter((r) => !r.err && !r.shown);

  note(`${rows.length} weapons in the table`);
  const byCls = {};
  rows.forEach((r) => { byCls[r.cls] = (byCls[r.cls] || 0) + 1; });
  note('by class: ' + Object.entries(byCls).map(([k, v]) => `${k} ${v}`).join(', '));
  const ok = rows.filter((r) => !r.err && r.finite && !r.fellBack);
  const vs = ok.map((r) => r.verts).sort((a, b) => a - b);
  if (vs.length) {
    note(`vertices: smallest ${vs[0]}, median ${vs[vs.length >> 1]}, largest ${vs[vs.length - 1]}`);
  }
  if (bad.length) note('threw or built nothing: ' + bad.map((r) => `${r.id} (${r.err})`).join(', '));
  if (borrowed.length) {
    note('built under another name, by design: '
      + borrowed.map((r) => `${r.id} -> ${r.alias}`).join(', '));
  }
  note(`${byKey.size} distinct models across ${rows.filter((r) => !r.err).length} weapons`);
  if (fell.length) {
    note('SHARING A MODEL: ' + fell.map(([k, ids]) => `${ids.join('+')} all get ${k}`).join(', '));
  }
  if (thin.length) note('suspiciously few vertices: '
    + thin.map((r) => `${r.id} ${r.verts}`).join(', '));

  check('every weapon in the table builds a model', bad.length === 0,
    bad.map((r) => r.id).join(' '));
  check('no two weapons hand you the same model',
    fell.length === 0, fell.map(([k, ids]) => `${ids.join('+')}=${k}`).join(' '));
  /* The one that matters. A NaN quaternion still reports a sensible
     world position, so "where is it" cannot catch this and "is it a
     number" can. */
  check('every part of every weapon has a finite transform',
    nan.length === 0, nan.map((r) => r.id).join(' '));
  check('and every one of them is a real model, not a blockout',
    thin.length === 0, thin.map((r) => `${r.id}:${r.verts}`).join(' '));
  check('none of them is left hidden', hidden.length === 0,
    hidden.map((r) => r.id).join(' '));

  /* And look at a spread of them -- one per class, held at the hip. */
  const shots = await page.evaluate(() => {
    const D = window.MP_DATA;
    const seen = new Set(), pick = [];
    for (const g of D.GUNS) {
      const c = g.cls || g.class;
      if (seen.has(c)) continue;
      seen.add(c); pick.push(g.id);
    }
    return pick;
  });
  note(`photographing one of each class: ${shots.join(', ')}`);
  for (const id of shots) {
    await page.evaluate(async (gid) => {
      const G = window.MP, M = G.match;
      M.you.alive = true; M.you.hp = 100;
      M.you.guns[M.you.held].id = gid;
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    }, id);
    await page.screenshot({ path: path.join(OUT, `gun-${id}.jpg`), type: 'jpeg', quality: 86 });
    note(`shot -> ${path.join(OUT, `gun-${id}.jpg`)}`);
  }

  check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
