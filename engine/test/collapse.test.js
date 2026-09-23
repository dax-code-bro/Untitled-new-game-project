#!/usr/bin/env node
/* DEMOLITION: THE CRANE, THE DOORS AND THE THINGS THAT FALL
 *
 * Asked for: "you can actually go on top of the giant crane although
 * you'll have to be very careful as every once in a while, parts of
 * the construction area will collapse."
 *
 * Two claims in one sentence and both are measured here.
 *
 * THE CRANE. Not "there is a red thing at x 34" -- can a man get to
 * the top of it. Measured as a climb: stand on the base and walk up,
 * checking there is floor under every step of the way, and then check
 * the jib is something you can stand on at the far end rather than a
 * decoration you fall through.
 *
 * THE COLLAPSES. Six pieces, and for each of them the four things
 * that make it a mechanic rather than a random death:
 *
 *   the warning comes first, and it lasts as long as it says
 *   the geometry actually moves, by the distance it said it would
 *   it kills what is underneath and nothing that is not
 *   the round puts it back
 *
 * The third one is the one worth writing a test for. The first draft
 * of updateCollapse killed on a plan-view circle with no height test
 * at all, so the scaffold coming down in the middle of the map killed
 * the two men standing on the crane deck twenty-three metres up.
 *
 * Usage: node engine/test/collapse.test.js
 */
const path = require('path');
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
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html')
    + '?map=demolition&mode=snd');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });

  /* ---------------- THE CRANE ---------------- */
  const crane = await page.evaluate(() => {
    const M = window.MP.match, G = M.game;
    /* Straight down from a point, and how high the first solid thing
       under it is. -1 if there is nothing at all. */
    const floorAt = (x, y, z) => {
      const h = G.raycast([x, y, z], [0, -1, 0], y + 2, (b) => b && !b.isTrigger);
      return h ? +(y - h.distance).toFixed(2) : -1;
    };
    /* WALK UP IT. From the base, a step at a time, taking whatever
       floor is within a stride's reach of the height we are at. A
       climb only counts if every step has something under it. */
    const KX = 34, KZ = 2;
    let y = 0.55, stuck = 0, best = 0.55;
    const trail = [];
    for (let i = 0; i < 400 && stuck < 40; i++) {
      /* Look for a surface between here and 0.55 m up, anywhere inside
         the tower -- which is what a man does going round a switchback. */
      let up = -1, ux = 0, uz = 0;
      /* Whole numbers, for the reason set out on climb() below. */
      for (let a = -8; a <= 8; a++) {
        for (let b2 = -8; b2 <= 8; b2++) {
          const ax = a * 0.35, az = b2 * 0.35;
          const f = floorAt(KX + ax, y + 0.60, KZ + az);
          if (f > y + 0.02 && f <= y + 0.55 && f > up) { up = f; ux = ax; uz = az; }
        }
      }
      if (up < 0) { stuck++; y += 0.0; break; }
      y = up; best = up; trail.push([+ux.toFixed(1), +uz.toFixed(1), up]);
    }
    /* OFF THE JIB LINE. The jib runs straight over the middle of the
       tower at 24.1 m, so a probe dropped down the tower's axis hits
       the catwalk and never sees the deck a metre under it. Two and a
       half metres to the side is on the deck and clear of the jib. */
    const deck = floorAt(KX, 26, KZ + 2.6);
    /* The jib, at three points along it, from above. */
    const jib = [-24, -12, 4].map((d) => floorAt(KX + d, 27, KZ));
    /* AND THE SCAFFOLD, the same way. There is no ladder mechanic in
       the game, so its ladder is a stair pretending to be one and the
       only question worth asking is whether a man can get up it. */
    /* COUNT IN WHOLE NUMBERS. `for (ax = -span; ax <= span; ax += 0.3)`
       never reaches +span: a dozen additions of 0.3 land on
       1.8000000000000007, the comparison fails, and the grid quietly
       stops one step short of its own edge. The ladder is at the edge,
       so the climb read "you cannot get up the scaffold at all" when
       what it had measured was the last column of a grid that was
       never sampled. */
    const climb = (cx, cz, span, top) => {
      const N = Math.round(span / 0.3);
      let y2 = 0.1, top2 = 0.1;
      for (let i = 0; i < 300; i++) {
        let up = -1;
        for (let a = -N; a <= N; a++) {
          for (let b2 = -N; b2 <= N; b2++) {
            const f = floorAt(cx + a * 0.3, y2 + 0.55, cz + b2 * 0.3);
            if (f > y2 + 0.02 && f <= y2 + 0.40 && f > up) up = f;
          }
        }
        if (up < 0) break;
        y2 = up; top2 = up;
        if (top2 > top) break;
      }
      return +top2.toFixed(2);
    };
    const scaff = [climb(-8, 14, 2.4, 6.2), climb(9, -15, 2.4, 8.1)];
    return { climbedTo: +best.toFixed(2), steps: trail.length, deck, jib, scaff,
      collapses: (M.map.collapses || []).length };
  });
  note(`climbed the tower to ${crane.climbedTo} m in ${crane.steps} steps`);
  check('the crane can be climbed to the top', crane.climbedTo > 22.5,
    `${crane.climbedTo} m`);
  check('there is a deck up there to stand on', crane.deck > 22.5 && crane.deck < 24,
    String(crane.deck));
  note(`the jib reads ${crane.jib.join(', ')} m at 24, 12 and 4 m out`);
  check('and the jib is walkable the whole way out',
    crane.jib.every((v) => v > 23.5 && v < 25), crane.jib.join(', '));

  note(`the two scaffolds climb to ${crane.scaff.join(' and ')} m (decks at 5.85 and 7.80)`);
  check('both scaffolds can be climbed to their top deck',
    crane.scaff[0] > 5.7 && crane.scaff[1] > 7.6, crane.scaff.join(', '));

  /* ---------------- THE COLLAPSES ---------------- */
  check('the map declares things that can fall', crane.collapses >= 4,
    String(crane.collapses));

  const drop = await page.evaluate(async () => {
    const M = window.MP.match;
    const list = M.map.collapses;
    const out = { each: [], warned: 0 };
    /* One man under the first piece and one man on the crane deck,
       both pinned every tick so neither of them walks or falls out of
       the measurement. */
    const under = M.people[0], far = M.people[1];
    /* The match keeps its own tape of everything that happened, so
       the events are read off that rather than through a listener the
       match does not offer. */
    let mark = M.events.length;
    const since = () => M.events.slice(mark);

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const part = c.parts.find((a) => a && a.position);
      const y0 = part ? part.position.y : null;
      const heap = (c.debris || []).find((a) => a && a.position);
      const h0 = heap ? heap.position.y : null;
      /* Put the clock on this one and nothing else. */
      M._collapse = { phase: 'wait', left: 0, cur: -1, t: 0, count: 0 };
      for (let k = 0; k < list.length; k++) list[k].fallen = (k !== i);

      under.alive = true; under.deaths = 0;
      far.alive = true; far.deaths = 0;
      /* FIVE THOUSAND HIT POINTS EACH, TOPPED UP EVERY TICK.
       *
         The first version of this gave them a hundred and measured
         "did he die", and on three of the six pieces he did -- to a
         bot who had walked up and shot him while the scaffold was
         still groaning. The test passed and measured nothing: a man
         pinned in the middle of a live firefight for four seconds
         dies of the firefight.
       *
         Nobody can chew through five thousand in a thirtieth of a
         second, and the collapse deals ten thousand, so the only
         thing in the match that can kill either of these two is the
         thing being measured. */
      const pin = () => {
        if (under.alive) {
          under.hp = 5000;
          under.pos.x = c.at[0]; under.pos.z = c.at[2];
          under.pos.y = Math.max(0.1, c.at[1] - c.drop + 0.2);
        }
        /* Forty metres away on the ground: outside every footprint on
           the map, so nothing should ever touch him. */
        if (far.alive) { far.hp = 5000; far.pos.x = -46; far.pos.y = 0.1; far.pos.z = 46; }
      };
      pin();
      let warnAt = -1, fellAt = -1, t = 0, killed = [];
      mark = M.events.length;
      for (let s = 0; s < 900; s++) {
        pin();
        M.update(1 / 30);
        t += 1 / 30;
        const ev = since();
        if (warnAt < 0 && ev.some((e) => e.kind === 'creak')) warnAt = t;
        const land = ev.find((e) => e.kind === 'collapse');
        if (land) { fellAt = t; killed = land.killed || []; break; }
      }
      const y1 = part ? part.position.y : null;
      const h1 = heap ? heap.position.y : null;
      out.each.push({
        name: c.name,
        warn: c.warn,
        gap: +(fellAt - warnAt).toFixed(2),
        moved: (y0 != null && y1 != null) ? +(y0 - y1).toFixed(2) : null,
        want: +c.drop.toFixed(2),
        /* THE EVENT'S OWN LIST, not "is he dead". Whether he is dead
           is a fact about the whole match; who this slab landed on is
           a fact about this slab. */
        killedUnder: killed.indexOf(under.id) >= 0,
        killedFar: killed.indexOf(far.id) >= 0,
        respawn: +(under.respawnAt - M.time).toFixed(2),
        /* The heap it left. It is built eight metres under the world
           and only exists above ground once the thing has landed. */
        heapWas: h0 == null ? null : +h0.toFixed(2),
        heapNow: h1 == null ? null : +h1.toFixed(2),
      });
    }
    /* AND THE ROUND PUTS IT BACK. Everything is down now; reset and
       ask where the geometry is. */
    const before = list.map((c) => {
      const a = c.parts.find((q) => q && q.position);
      return a ? +a.position.y.toFixed(2) : null;
    });
    M.resetCollapses();
    const after = list.map((c) => {
      const a = c.parts.find((q) => q && q.position);
      return a ? +a.position.y.toFixed(2) : null;
    });
    out.reset = { before, after, home: list.map((c) => (c.home
      ? +c.home.find((h) => h)[1].toFixed(2) : null)),
    left: +M._collapse.left.toFixed(1), phase: M._collapse.phase };
    out.stillDown = list.filter((c) => c.fallen).length;
    /* And the rubble goes back under with it. */
    out.rubbleAfter = list.map((c) => {
      const a = (c.debris || []).find((q) => q && q.position);
      return a ? +a.position.y.toFixed(2) : null;
    });
    return out;
  });

  for (const e of drop.each) {
    note(`${e.name}: warned ${e.gap}s before it landed, dropped ${e.moved} of ${e.want} m`);
  }
  check('every one of them gives you a warning first',
    drop.each.every((e) => e.gap > 0.9),
    drop.each.filter((e) => !(e.gap > 0.9)).map((e) => `${e.name} ${e.gap}`).join(', '));
  check('and the warning is as long as the piece said it would be',
    drop.each.every((e) => Math.abs(e.gap - (e.warn + 1.15)) < 0.35),
    drop.each.map((e) => `${e.name} ${e.gap} vs ${(e.warn + 1.15).toFixed(2)}`).join(' | '));
  /* THE GEOMETRY ACTUALLY MOVES. The whole mechanic was a set of
     events with nothing behind them for as long as it took to notice
     that position.set on a cached matrix changes the number and not
     the picture. */
  check('the thing that fell actually moved',
    drop.each.every((e) => e.moved != null && Math.abs(e.moved - e.want) < 0.05),
    drop.each.map((e) => `${e.name} ${e.moved}/${e.want}`).join(' | '));
  check('it kills whoever was under it', drop.each.every((e) => e.killedUnder),
    drop.each.filter((e) => !e.killedUnder).map((e) => e.name).join(', '));
  check('and nobody who was not', drop.each.every((e) => !e.killedFar),
    drop.each.filter((e) => e.killedFar).map((e) => e.name).join(', '));
  check('a man it kills waits the four seconds like any other death',
    drop.each.every((e) => e.respawn >= 3.9),
    drop.each.map((e) => e.respawn).join(', '));

  note('rubble: ' + drop.each.map((e) => `${e.heapWas} -> ${e.heapNow}`).join(', '));
  check('each one leaves a heap where it landed',
    drop.each.every((e) => e.heapWas != null && e.heapWas < -4 && e.heapNow > -0.6),
    drop.each.map((e) => `${e.name} ${e.heapWas}->${e.heapNow}`).join(' | '));

  note(`after the reset: ${drop.reset.after.join(', ')} (home ${drop.reset.home.join(', ')})`);
  /* AND THE CLOCK GOES BACK WITH THE GEOMETRY. It did not: the reset
     put every piece back and left the countdown at whatever it had
     reached, which on a round that ended seconds before one was due is
     zero -- so round two opened with a slab coming down on its first
     tick, while both sides were still in spawn. */
  note(`the clock after a reset reads ${drop.reset.left} s`);
  check('and the round starts quiet, not mid-collapse',
    drop.reset.left >= 15 && drop.reset.phase === 'wait',
    `${drop.reset.left} s, phase ${drop.reset.phase}`);
  check('the round puts every one of them back',
    drop.reset.after.every((v, i) => v != null
      && Math.abs(v - drop.reset.home[i]) < 0.02),
    drop.reset.after.join(', '));
  check('and none of them is still marked as down', drop.stillDown === 0,
    String(drop.stillDown));
  check('and the rubble goes back under the world with it',
    drop.rubbleAfter.every((v) => v == null || v < -4),
    drop.rubbleAfter.join(', '));

  /* ---------------- DOORS ON THREE FLOORS ----------------
   *
   * The standing wing is three storeys of rooms off a corridor and
   * every opening has a leaf hung in it, which is the first time any
   * map has had a door that is not on the ground.
   *
   * Doors open because somebody is near them -- no key, no prompt --
   * and "near" was a plan-view circle. That is fine while every door
   * in the game is at y = 0 and wrong the moment one is not: a man
   * standing in the ground-floor corridor was opening the two doors
   * directly above his head, on floors he could not see. */
  const doors = await page.evaluate(() => {
    const M = window.MP.match;
    const all = M.map.doors || [];
    const wing = all.filter((d) => d.name === 'wing-door');
    const floors = {};
    wing.forEach((d) => { floors[d.at[1].toFixed(1)] = (floors[d.at[1].toFixed(1)] || 0) + 1; });
    /* Pick a door on the top floor and a spot directly under it. */
    const top = wing.slice().sort((a, b) => b.at[1] - a.at[1])[0];
    if (!top) return { wing: wing.length, floors };
    const p0 = M.people.find((q) => q.alive) || M.people[0];
    const step = () => { for (let i = 0; i < 40; i++) M.update(1 / 30); };
    const park = (y) => { p0.alive = true; p0.hp = 5000; p0.busy = null;
      p0.pos.x = top.at[0] + 0.9; p0.pos.y = y; p0.pos.z = top.at[2]; };

    top.setOpen(0);
    park(0.1); for (let i = 0; i < 40; i++) { park(0.1); M.update(1 / 30); }
    const fromBelow = +top.open.toFixed(2);
    park(top.at[1] + 0.1); for (let i = 0; i < 40; i++) { park(top.at[1] + 0.1); M.update(1 / 30); }
    const fromBeside = +top.open.toFixed(2);
    /* And it shuts again behind you. */
    p0.pos.x = 0; p0.pos.y = 0.1; p0.pos.z = 0;
    for (let i = 0; i < 60; i++) M.update(1 / 30);
    const afterLeaving = +top.open.toFixed(2);
    void step;
    return { wing: wing.length, floors, topY: +top.at[1].toFixed(2),
      fromBelow, fromBeside, afterLeaving };
  });
  note(`${doors.wing} doors in the wing, by floor: `
    + Object.keys(doors.floors).map((k) => `${k} m x${doors.floors[k]}`).join(', '));
  check('the wing has a door on every floor',
    Object.keys(doors.floors).length === 3 && doors.wing >= 21,
    `${doors.wing} over ${Object.keys(doors.floors).length} floors`);
  check('a man on the ground does not open the door three storeys up',
    doors.fromBelow === 0, String(doors.fromBelow));
  check('and a man beside it does', doors.fromBeside > 0.9, String(doors.fromBeside));
  check('and it swings shut behind him', doors.afterLeaving === 0,
    String(doors.afterLeaving));

  const real = errors.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('no page error', real.length === 0, real.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
