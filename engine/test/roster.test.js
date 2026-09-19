#!/usr/bin/env node
/* IS EVERY WEAPON IN THE LIST ACTUALLY THE WEAPON IN THE LIST?
 *
 * "The Thompson is completely wrong." It was -- because the Thompson
 * the game drew was not the Thompson in the repository. There is a
 * 351-line hand-built M1A1 in engine/src/97-thompson.js, and
 * mp-game.js's VM_BESPOKE -- the map from weapon id to hand-built
 * builder -- did not list it. buildGun tries the bespoke map, then
 * serviceArm(id), then a fallback, then serviceArm('m4'), and every
 * one of those steps swallows its exception. So a missing entry does
 * not fail: it quietly hands the player a generic table arm, or a
 * carbine, wearing the right name in the HUD.
 *
 * Five were wrong that way at once -- thompson, mg42, remington,
 * killstreak, riotshield -- and two of them (remington, killstreak)
 * had no service kind either, so a bolt-action sniper rifle and an
 * anti-materiel rifle were both being drawn as an M4.
 *
 * NONE OF IT IS VISIBLE FROM THE CODE. Nothing throws, nothing warns,
 * and the photographs only tell you if you already know what the gun
 * is supposed to look like. What settles it is resolution: for each
 * id in MP_DATA, walk buildGun's own order and record WHICH step
 * answered. Any id that reaches the last step is a gun the game cannot
 * draw.
 *
 * The bespoke map is read out of mp-game.js's source rather than
 * restated here, because a copy of the map in the test would pass
 * while the game was broken -- which is exactly how the portrait rig
 * kept photographing the wrong Thompson.
 *
 * Usage: node engine/test/roster.test.js
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

/* The real map, out of the real file. A regex rather than an import
   because mp-game.js starts a match on load. */
function readBespoke() {
  const src = fs.readFileSync(path.join(ROOT, 'site/games/mp-game.js'), 'utf8');
  const m = src.match(/var VM_BESPOKE = \{([\s\S]*?)\};/);
  if (!m) return null;
  const out = {};
  for (const pair of m[1].matchAll(/([a-z0-9_]+)\s*:\s*'([^']+)'/g)) out[pair[1]] = pair[2];
  return out;
}
function readFallback() {
  const src = fs.readFileSync(path.join(ROOT, 'site/games/mp-game.js'), 'utf8');
  const m = src.match(/var VM_FALLBACK = \{([\s\S]*?)\};/);
  if (!m) return {};
  const out = {};
  for (const pair of m[1].matchAll(/([a-z0-9_]+)\s*:\s*'([^']+)'/g)) out[pair[1]] = pair[2];
  return out;
}

(async () => {
  const bespoke = readBespoke();
  const fallback = readFallback();
  if (!bespoke) {
    console.log('  FAIL could not find VM_BESPOKE in site/games/mp-game.js');
    process.exit(1);
  }
  note(`VM_BESPOKE has ${Object.keys(bespoke).length} entries, VM_FALLBACK ${Object.keys(fallback).length}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  for (const f of ['site/engine/legend-engine.js', 'site/games/mp-data.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), 'utf8') });
  }

  const r = await page.evaluate(({ bespoke, fallback }) => {
    const G = LE.create({ canvas: '#game', quality: 'low', gravity: 0 });
    const kinds = new Set(G.serviceArmKinds());
    const guns = (window.MP_DATA && window.MP_DATA.GUNS) || [];
    const rows = [];
    for (const g of guns) {
      const id = g.id;
      let via = null, fn = bespoke[id];
      /* buildGun's own order, step for step. */
      if (fn && typeof G[fn] === 'function') via = 'bespoke:' + fn;
      else if (kinds.has(id)) via = 'service:' + id;
      else if (fallback[id] && kinds.has(fallback[id])) via = 'fallback:' + fallback[id];
      else via = 'M4';
      /* And it has to actually build, not merely resolve. A builder
         that throws lands on the same silent fallback. */
      let built = false, parts = 0, err = null;
      try {
        const made = via.startsWith('bespoke:')
          ? G[fn]({ at: [0, -90, 0], physics: false })
          : G.serviceArm(via.split(':')[1] || 'm4', { at: [0, -90, 0], physics: false });
        built = !!made;
        parts = made && made.partNames ? made.partNames.length : 0;
      } catch (e) { err = String(e.message || e).split('\n')[0]; }
      rows.push({ id, cls: g.cls, via, built, parts, err });
    }
    /* AND: IS THE MAGAZINE INSIDE THE GRIP?
     *
       On a pistol the magazine lives in the grip. The Luger's came out
       through the FRONT of its grip with a column of brass hanging in
       mid air in front of the trigger guard, because gripStack walks
       its sections down an axis of (-rake, -1) and svcMag walked
       straight down regardless -- and the Luger's grip rakes at 0.58
       over 94 mm, so the two diverged by about fifty millimetres.

       MY FIRST VERSION OF THIS CHECK WAS WORTHLESS and it is worth
       saying why. It compared the magazine's depth to the cartridge's
       length -- and svcSpec sets `mag.d = ammo.len * 0.52`, so the
       comparison was `len * 1.04 >= len`, an identity. It passed on 36
       weapons while every pistol in the game was visibly wrong. A test
       that cannot fail is worse than no test, because it reports the
       thing it was meant to guard as safe.

       So measure the geometry instead. A pistol has no stock and no
       handguard, which means its `wood` channel IS its grip, and the
       magazine has its own channel. Compare their x-ranges. Nothing
       here is derived from anything else here. */
    const strays = [];
    let measured = 0;
    for (const kind of kinds) {
      const K = G.serviceArmSpec(kind);
      if (!K || !K.mag || K.mag.kind !== 'box') continue;
      if (K.stock || K.hg) continue;                 // not a pistol
      const P = G._armParts && G._armParts['svc:' + kind];
      if (!P || !P.mag || !P.wood) continue;
      /* ONLY WHERE THE GRIP IS. An extended magazine -- the G18's --
         legitimately hangs BELOW the grip, and once it leans back with
         the grip's rake its floorplate ends up further back than the
         grip's heel. That is what an extended magazine does and it is
         not the fault this is looking for. So the x-span is taken over
         the part of the magazine that is level with the grip; below
         the grip's bottom the magazine is in open air and free. */
      const spanX = (geo, yMin) => {
        const q = geo.positions; let lo = 1e9, hi = -1e9;
        for (let i = 0; i < q.length; i += 3) {
          if (yMin != null && q[i + 1] < yMin) continue;
          if (q[i] < lo) lo = q[i]; if (q[i] > hi) hi = q[i];
        }
        return [lo, hi];
      };
      const gy = (() => {
        const q = P.wood.positions; let lo = 1e9;
        for (let i = 1; i < q.length; i += 3) if (q[i] < lo) lo = q[i];
        return lo;
      })();
      const m = spanX(P.mag, gy), w = spanX(P.wood, null);
      if (!(m[0] < m[1])) continue;                  // nothing level with it
      measured++;
      const slack = 0.006;                           // the magazine catch
      if (m[0] < w[0] - slack || m[1] > w[1] + slack) {
        strays.push({ kind, mag: [+m[0].toFixed(4), +m[1].toFixed(4)],
          grip: [+w[0].toFixed(4), +w[1].toFixed(4)] });
      }
    }
    return { rows, kinds: kinds.size, guns: guns.length, strays, measured };
  }, { bespoke, fallback });

  note(`${r.guns} weapons in MP_DATA, ${r.kinds} service kinds`);

  const orphan = r.rows.filter((x) => x.via === 'M4');
  const broke = r.rows.filter((x) => !x.built);
  const noParts = r.rows.filter((x) => x.built && x.parts === 0);

  if (orphan.length) note('drawn as an M4: ' + orphan.map((x) => x.id).join(', '));
  if (broke.length) note('threw while building: '
    + broke.map((x) => x.id + ' (' + x.err + ')').join(', '));
  if (noParts.length) note('no partNames: ' + noParts.map((x) => x.id).join(', '));

  check('MP_DATA loaded', r.guns > 40, `${r.guns} weapons`);
  /* THE CLAIM. Not one weapon in the list falls through to the
     last-resort carbine. */
  check('no weapon falls through to the M4 fallback',
    orphan.length === 0, `${orphan.length} of ${r.guns}`);
  check('every weapon builds without throwing',
    broke.length === 0, `${broke.length} threw`);
  /* partNames is what hides, shows, tints and measures a gun; `visible`
     does not inherit down the parent chain, so a model without one
     leaves its stock and magazine floating when the weapon is
     holstered. */
  check('every weapon declares its parts',
    noParts.length === 0, `${noParts.length} have no partNames`);
  /* Every hand-built builder should be reachable from the roster.
     A model nobody can draw is the bug this test exists for. */
  const usedFns = new Set(r.rows.filter((x) => x.via.startsWith('bespoke:'))
    .map((x) => x.via.slice(8)));
  note('bespoke builders in use: ' + [...usedFns].sort().join(', '));

  /* AND THE OTHER REPRESENTATION. mp-match builds the weapon you see
     in somebody else's hands, and it was reaching straight for
     serviceArm -- so every hand-built model was in your hands and not
     in his. Two files, two builders, one weapon: the map has to be
     shared, and this asserts that it is rather than that a copy of it
     happens to match today. */
  const matchSrc = fs.readFileSync(path.join(ROOT, 'site/games/mp-match.js'), 'utf8');
  check('the third-person weapon uses the same bespoke map as the viewmodel',
    /MP_VM_BESPOKE/.test(matchSrc),
    'mp-match.js builds its own model without consulting VM_BESPOKE');
  check('and that map is published rather than copied',
    /W\.MP_VM_BESPOKE = VM_BESPOKE/.test(
      fs.readFileSync(path.join(ROOT, 'site/games/mp-game.js'), 'utf8')),
    'mp-game.js does not export VM_BESPOKE');

  if (r.strays && r.strays.length) {
    note('magazine outside its grip: ' + r.strays.map((x) => x.kind
      + ' mag [' + x.mag + '] grip [' + x.grip + ']').join(', '));
  }
  note(`magazine containment measured on ${r.measured} pistols`);
  /* Asserted separately: a check that skipped every weapon would
     otherwise report success and mean nothing. That has happened
     twice in this repository already. */
  check('the containment check actually measured something',
    r.measured >= 5, `${r.measured} pistols`);
  check('no pistol carries its magazine outside its grip',
    !r.strays || r.strays.length === 0, `${r.strays ? r.strays.length : '?'} pistols`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
