#!/usr/bin/env node
/* The flamingo Pack-a-Punch, end to end.
 *
 * Written because three features in a row on this map parsed, built, and
 * silently did nothing: a pier slab with negative length that was never
 * created, an auto-fire flag mutated at upgrade time that only one code
 * path ever read, and a break span that swallowed the boathouse. None of
 * those showed up in a syntax check and two of them looked fine in a
 * render. So this asks the game, in order:
 *
 *   - is the machine actually on the bed, under the hole in the pier?
 *   - is the interact refused from the deck and offered from under water?
 *   - does feeding it take the gun out of your hands?
 *   - does the beak move while it works?
 *   - three seconds later, is the gun back, upgraded, wearing the map's
 *     camo and in the slot it came out of?
 *
 * Usage: node engine/test/flamingo.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('flamingo tests need playwright: npm i --no-save playwright');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/coastline.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: 'coastline' });
    const S = B.S, P = B.P, G = B.game, C = window.COASTLINE;
    const T = window.__T;
    for (let i = 0; i < 12; i++) G.step(1 / 60);
    const out = { errors: [] };

    // --- where it is, and what is above it -------------------------------
    out.papAt = S.pap ? S.pap.at.slice() : null;
    out.declared = C.PAP.at.slice();
    out.waterY = C.C.water.y;
    out.deckY = C.C.pier.deckY;
    out.breaks = C.PAP.breaks;
    out.hasModel = !!(S.papFlamingo && S.papFlamingo.beakUpper && S.papFlamingo.beakLower
      && S.papFlamingo.head);
    // The bed under it, so "on the bottom" is a measurement and not a hope.
    const bed = C.waterAt(S.pap.at[0], S.pap.at[2]);
    out.bed = bed ? { surface: bed.surface, bed: bed.bed } : null;

    /* Nothing must be left of the decking directly over the machine. A
       raycast down from above the pier through the middle of the hole
       should fall past deck height to the water. */
    const mid = (C.PAP.breaks.z0 + C.PAP.breaks.z1) / 2;
    const hit = G.raycast
      ? G.raycast([C.C.pier.x, C.C.pier.deckY + 3, mid], [0, -1, 0], 8)
      : null;
    out.holeOpen = !hit || hit.point.y < C.C.pier.deckY - 0.3;
    out.holeHit = hit ? { y: +hit.point.y.toFixed(2), name: hit.actor && hit.actor.name } : null;

    /* --- refused from the surface ---------------------------------------
       Not from the deck: three and a half metres up through the boards is
       out of reach and SHOULD give no prompt at all. The refusal that
       matters is the one you get floating on the water directly over it,
       where the machine is close enough to touch and you are still
       breathing. */
    T.teleport(S.pap.at[0], C.C.water.y, S.pap.at[2] + 0.6);
    for (let i = 0; i < 24; i++) G.step(1 / 60);
    out.floatEyeY = +(P.actor.position.y + 0.745).toFixed(2);
    out.floatUnder = !!P.underwater;
    const afloat = window.__T_SYS.nearestInteract(S, P);
    out.fromSurface = afloat && { kind: afloat.kind, label: afloat.label };
    // And from up on the pier there should be nothing to answer at all.
    out.fromDeck = T.interactAt(C.C.pier.x, C.C.pier.deckY + 0.9, mid);

    // --- offered from under the water ------------------------------------
    // Drop in beside the machine and let the water code decide what we are.
    T.teleport(S.pap.at[0], S.pap.at[1] + 0.35, S.pap.at[2] + 0.6);
    for (let i = 0; i < 40; i++) G.step(1 / 60);
    out.underwater = !!P.underwater;
    out.eyeY = +(P.actor.position.y + 0.745).toFixed(2);
    const under = window.__T_SYS.nearestInteract(S, P);
    out.fromWater = under && { kind: under.kind, label: under.label, cost: under.cost };

    // --- feed it ---------------------------------------------------------
    const held = P.equipped();
    out.held = held;
    out.slotsBefore = P.slots.slice();
    out.slotIndex = P.slots.indexOf(held);
    S.points = 9000;
    const pointsBefore = S.points;
    out.playerAt = [+P.actor.position.x.toFixed(2), +P.actor.position.y.toFixed(2), +P.actor.position.z.toFixed(2)];
    out.distToPap = +Math.hypot(P.actor.position.x - S.pap.at[0], P.actor.position.z - S.pap.at[2]).toFixed(2);
    out.dyToPap = +(P.actor.position.y - S.pap.at[1]).toFixed(2);
    if (under) window.__T_SYS.doInteract(G, S, P, B.hud, window.__T_SFX || S.sfx || {}, under, 1 / 60);
    out.paid = pointsBefore - S.points;
    out.busy = !!S.pap.busy;
    out.pending = S.pap.pending;
    out.slotsDuring = P.slots.slice();
    out.handsEmpty = !P.slots.includes(held);

    // --- the beak moves while it works -----------------------------------
    const fl = S.papFlamingo;
    const beakSamples = [0];
    const headSamples = [0];
    for (let i = 0; i < 230 && S.pap.busy; i++) {
      G.step(1 / 60);
      if (i % 20 === 0) {
        beakSamples.push(+(fl.beakUpper.position.y - fl.beakLower.position.y).toFixed(3));
        headSamples.push(+fl.head.position.y.toFixed(3));
      }
      if (!S.pap.busy && S.pap.holding) break;
    }
    out.beakSpread = beakSamples;
    out.beakMoved = Math.max(...beakSamples) - Math.min(...beakSamples);
    out.headMoved = Math.max(...headSamples) - Math.min(...headSamples);

    // --- it gives it back ------------------------------------------------
    out.holding = S.pap.holding;
    out.upgradedAfterEat = !!P.upgraded[held];
    const take = window.__T_SYS.nearestInteract(S, P);
    out.takeOffer = take && { kind: take.kind, label: take.label };
    if (take && !take.inert) window.__T_SYS.doInteract(G, S, P, B.hud, window.__T_SFX || S.sfx || {}, take, 1 / 60);
    out.slotsAfter = P.slots.slice();
    out.backInSlot = P.slots.indexOf(held) === out.slotIndex;
    out.equippedAfter = P.equipped();
    out.upgraded = !!P.upgraded[held];
    out.name = window.__T_WEAPONS[held] && window.__T_WEAPONS[held].name;

    // --- and it is wearing the map's camo, not the bunker's ---------------
    out.camo = C.CAMO ? { color: C.CAMO.color } : null;
    /* Every part of the gun, not just its frame -- and compared against
       the map's camo rather than merely "not what it was", because the
       bug this guards against is the bunker's molten-rock finish being
       used on a gun that came out of a lake. */
    const vw = P.view[held];
    const vparts = (vw && (vw.parts || [vw.actor])) || [];
    /* By material identity, not by colour: Material parses its colour on
       construction, so `mat.color` is not the hex you handed in and
       comparing against one silently never matches. The material cache
       shares one instance per spec, so asking the engine for the map's
       camo gives back the very object the gun should be wearing. */
    const camoMat = G.material(C.CAMO);
    const bunkerMat = G.material({ color: 0x2a0f06, texture: 'metal', roughness: 0.34,
      metalness: 1, emissive: 0xff5a12, emissiveStrength: 1.5 });
    out.gunParts = vparts.length;
    out.camoParts = vparts.filter((a) => a.material === camoMat).length;
    out.keptBase = vparts.filter((a) => a.__baseMat && a.material !== a.__baseMat).length;
    out.camoOnGun = out.gunParts > 0 && out.camoParts === out.gunParts;
    out.bunkerFinish = vparts.some((a) => a.material === bunkerMat);

    // --- it refuses a second trip ----------------------------------------
    const again = window.__T_SYS.nearestInteract(S, P);
    out.secondTrip = again && { kind: again.kind, label: again.label, inert: !!again.inert };

    return out;
  });

  console.log(JSON.stringify(r, null, 1).slice(0, 2600));
  console.log('');

  check('the machine is on the lake bed where the map put it',
    r.papAt && Math.abs(r.papAt[1] - r.declared[1]) < 0.001, JSON.stringify(r.papAt));
  check('it is under the water, not floating on it',
    r.papAt[1] < r.waterY - 1.0, `y=${r.papAt[1]} water=${r.waterY}`);
  check('it is standing on the bed, not inside it',
    r.bed && r.papAt[1] > r.bed.bed - 0.2 && r.papAt[1] < r.bed.surface,
    JSON.stringify(r.bed));
  check('the deck directly above it is actually gone', r.holeOpen, JSON.stringify(r.holeHit));
  check('the model exists with a beak and a head', r.hasModel);
  check('floating on top of it, it will not deal',
    r.fromSurface && r.fromSurface.kind === 'papCold', JSON.stringify(r.fromSurface));
  check('and it says why', r.fromSurface && /under the water/i.test(r.fromSurface.label || ''),
    r.fromSurface && r.fromSurface.label);
  check('from up on the pier there is nothing to answer', r.fromDeck === null,
    JSON.stringify(r.fromDeck));
  check('swimming down puts the eyes under the surface', r.underwater,
    `eye=${r.eyeY} water=${r.waterY}`);
  check('underwater it offers the trade', r.fromWater && r.fromWater.kind === 'pap',
    JSON.stringify(r.fromWater));
  check('and it costs the upgrade price', r.paid === 5000, `paid ${r.paid}`);
  check('feeding it takes the gun out of your hands', r.handsEmpty,
    JSON.stringify(r.slotsDuring));
  check('it is working on it', r.busy === true || r.pending === r.held);
  check('the beak opens and shuts while it works', r.beakMoved > 0.05,
    `spread ${JSON.stringify(r.beakSpread)}`);
  check('the head leans down into the work', r.headMoved > 0.1, `moved ${r.headMoved}`);
  check('three seconds later it is holding the gun out', r.holding === r.held,
    `${r.holding}`);
  check('the offer changes to taking it back', r.takeOffer && r.takeOffer.kind === 'papTake',
    JSON.stringify(r.takeOffer));
  check('the gun comes back', r.slotsAfter.includes(r.held), JSON.stringify(r.slotsAfter));
  check('into the slot it came out of', r.backInSlot,
    `${JSON.stringify(r.slotsBefore)} -> ${JSON.stringify(r.slotsAfter)}`);
  check('and it is upgraded', r.upgraded);
  check('every part of it wears the beach camo', r.camoOnGun,
    `${r.camoParts}/${r.gunParts} parts, want ${r.camo && r.camo.color}`);
  check('and none of it wears the bunker finish', r.bunkerFinish === false);
  check('it will not do the same gun twice',
    r.secondTrip && r.secondTrip.kind === 'papCold' && r.secondTrip.inert,
    JSON.stringify(r.secondTrip));
  check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
