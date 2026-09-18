#!/usr/bin/env node
/* THE CAVE THE FLAMINGO IS IN.
 *
 * The machine used to sit on the open bed in two metres of water: you
 * went over the side of the pier and you were on top of it in four
 * seconds. Now it is at the back of a flooded tunnel inside a rock, and
 * the whole point of the change is that getting there costs you the air
 * in your lungs.
 *
 * Which means the things worth checking are not "is there geometry" but
 * the four ways this specific idea goes wrong:
 *
 *   IT CANNOT BE ENTERED   the swim code holds a body at bed + 0.55, so
 *                          a mouth below that line is a door you can see
 *                          and cannot use. So: SWIM IT, with the same
 *                          movement path a key drives, and come out in
 *                          the chamber.
 *
 *   IT LEAKS               a cave built as a shell with holes cut in it
 *                          lets you out through a wall one slab short of
 *                          meeting its neighbour. Rays in every
 *                          direction from inside, and they had all
 *                          better stop.
 *
 *   THE POCKETS ARE WET    an air pocket whose roof is under the
 *                          waterline is just more cave, and the whole
 *                          reason a thirty-second tank is enough is that
 *                          those two domes are dry.
 *
 *   THE TUNNEL IS DRY      the opposite failure: if you can put your
 *                          head up anywhere along the way in, the swim
 *                          costs nothing.
 *
 * And one that is nothing to do with the cave and everything to do with
 * where it was put: the escape boat runs straight up +Z from the
 * boathouse for a hundred and fifty metres, in the one shot nobody can
 * skip.
 *
 * Usage: node engine/test/cave.test.js
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
  const page = await browser.newPage({ viewport: { width: 420, height: 280 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setContent('<body><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/engine/legend-engine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/bunker-nine.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'site/games/coastline.js'), 'utf8') });

  const r = await page.evaluate(() => {
    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low', map: 'coastline' });
    const S = B.S, P = B.P, G = B.game, C = window.COASTLINE;
    const T = window.__T, SYS = window.__T_SYS;
    for (let i = 0; i < 12; i++) G.step(1 / 60);
    T.god(true);
    const out = {};
    const K = C.CAVE, TU = K.tunnel, CH = K.chimney, RM = K.room, PK = K.pocket;
    const steps = (n) => { for (let i = 0; i < n; i++) G.step(1 / 60); };
    const pos = () => [P.actor.position.x, P.actor.position.y, P.actor.position.z];
    const put = (x, y, z) => { T.teleport(x, y, z); steps(5); };

    out.papAt = C.PAP.at.slice();
    out.waterY = C.C.water.y;
    out.swimSpeed = SYS.PLAYER.swimSpeed;

    /* --- the machine is inside the chamber, on its floor --------------- */
    const a = C.PAP.at;
    out.inRoom = a[0] > RM.x0 && a[0] < RM.x1 && a[2] > RM.z0 && a[2] < RM.z1
      && a[1] > RM.floorY && a[1] < RM.roofY;
    /* And no longer under the hole in the pier: the hole is where you go
       IN, not where the machine is. */
    const bkx = (C.PAP.breaks.x0 + C.PAP.breaks.x1) / 2;
    const bkz = (C.PAP.breaks.z0 + C.PAP.breaks.z1) / 2;
    out.fromBreak = +Math.hypot(a[0] - bkx, a[2] - bkz).toFixed(1);

    /* --- the ending does not fly through the rock ---------------------
     *
       The boat itself clears it -- it runs straight up +Z from x 17.85
       and the rock ends at 12.5. The CAMERA does not: it sits off the
       boat's quarter at b.x - 5.5 - 5u, which walks from 12.35 to 7.35
       and crosses this footprint for about a fifth of the shot, three
       metres up. The first cut of the rock stood at 2.95 with crags to
       4.4 on top of it, so the last shot of the game would have gone
       through stone.

       Worked out here from the same expression the cutscene uses,
       because this is a shot nobody can skip and nobody replays. */
    out.boatX = C.ESCAPE.boat.at[0];
    out.rockGap = +(C.ESCAPE.boat.at[0] - K.x1).toFixed(2);
    {
      const b = C.ESCAPE.boat.at;
      let worst = 99;
      for (let i = 0; i <= 60; i++) {
        const u = i / 60;
        const bz = b[2] + Math.pow(u, 1.55) * 150;
        const cx = b[0] - 5.5 - u * 5, cy = b[1] + 2.4 + u * 1.6, cz = bz - 9 - u * 12;
        if (cx < K.x0 || cx > K.x1 || cz < K.z0 || cz > K.z1) continue;
        worst = Math.min(worst, cy - K.topY);
      }
      out.camClear = +worst.toFixed(2);
      /* And nothing decorative sticking up through that gap either.
         The crags carry their own reach: a sphere's radius is in its
         geometry and not in its scale, so asking the actor how big it
         is returns 1 and measures nothing. */
      let hi = -99, counted = 0;
      for (const a of G.actors) {
        if (!a || a.__topY == null) continue;
        counted++;
        hi = Math.max(hi, a.__topY);
      }
      out.cragTop = +hi.toFixed(2);
      out.cragCount = counted;
      out.topY = +K.topY.toFixed(2);
    }

    /* --- SWIM IT ------------------------------------------------------- */
    /* Dropped in front of the mouth, facing down the tunnel, driving
       forward on the same path a key drives. Looking slightly down,
       because the swim code takes its vertical rate from the pitch and a
       body looking level floats. */
    /* Level, not pitched down. The tunnel is horizontal, and the swim
       code takes its vertical rate straight off the pitch -- so looking
       down while driving forward flies you into the floor, which is one
       of the two reasons the first run of this never got in. */
    put((TU.x0 + TU.x1) / 2, (TU.floorY + TU.roofY) / 2, K.z0 - 2.2);
    T.look(0, 0.0);
    T.hold({ mx: 0, mz: 1 });
    let got = null, stuckAt = null;
    for (let i = 0; i < 620 && !got; i++) {
      G.step(1 / 60);
      const p = pos();
      stuckAt = [+p[0].toFixed(2), +p[1].toFixed(2), +p[2].toFixed(2)];
      if (p[2] > RM.z0 + 0.6) got = p;
    }
    T.release();
    out.swamIn = !!got;
    out.swamTo = got;
    // Where he ran out of road, which is the only useful thing to know
    // when this fails.
    out.swamEnd = stuckAt;

    /* --- the tunnel is flooded for its whole length -------------------- */
    const wet = [];
    for (let i = 0; i <= 6; i++) {
      const z = K.z0 + 0.6 + (TU.z1 - K.z0 - 1.2) * (i / 6);
      // In the chimney's own span there IS air, and that is the point.
      if (z > CH.z0 && z < CH.z1) continue;
      put((TU.x0 + TU.x1) / 2, TU.roofY - 0.9, z);
      steps(14);                       // long enough for the float to lift him
      wet.push([+z.toFixed(1), !!P.underwater]);
    }
    out.tunnelWet = wet;

    /* --- and the two pockets are dry ----------------------------------- */
    put((CH.x0 + CH.x1) / 2, C.C.water.y - 0.6, (CH.z0 + CH.z1) / 2);
    steps(24);
    out.chimneyDry = !P.underwater;
    out.chimneyEye = +(P.actor.position.y + 0.745).toFixed(2);
    P.breath = 4;
    steps(30);
    out.chimneyRefills = P.breath > 5;

    put((PK.x0 + PK.x1) / 2, C.C.water.y - 0.6, (PK.z0 + PK.z1) / 2);
    steps(24);
    out.domeDry = !P.underwater;
    P.breath = 4;
    steps(30);
    out.domeRefills = P.breath > 5;

    /* --- the chamber itself is NOT dry --------------------------------- */
    put(RM.x0 + 1.2, RM.roofY - 0.9, RM.z0 + 1.2);
    steps(20);
    out.roomWet = !!P.underwater;

    /* --- and the machine answers from in there ------------------------- */
    put(a[0], a[1] + 0.35, a[2] + 0.7);
    steps(10);
    out.atPap = !!P.underwater;
    const it = SYS.nearestInteract(S, P);
    out.papOffer = it ? { kind: it.kind, label: it.label } : null;

    /* --- IT DOES NOT LEAK ---------------------------------------------- */
    /* Rays out of the chamber in every direction. Every one of them has
       to stop inside the rock. The tunnel is the one way out and it does
       not open off this corner, so nothing here should escape. */
    const from = [RM.x0 + 1.4, RM.floorY + 1.2, RM.z1 - 1.4];
    const esc = [];
    for (let i = 0; i < 24; i++) {
      const th = (i / 24) * Math.PI * 2;
      for (const dy of [-0.35, 0, 0.35, 0.9]) {
        const d = [Math.cos(th), dy, Math.sin(th)];
        const l = Math.hypot(d[0], d[1], d[2]);
        const hit = G.raycast(from, [d[0] / l, d[1] / l, d[2] / l], 40,
          (b) => b !== P.actor.body && !b.isTrigger);
        if (!hit) esc.push([+th.toFixed(2), dy]);
      }
    }
    out.leaks = esc.length;
    out.leakDirs = esc.slice(0, 4);
    T.release();
    return out;
  });

  note(JSON.stringify(r).slice(0, 900));
  /* WHERE IT IS. */
  check('the machine is inside the chamber', r.inRoom, `at ${JSON.stringify(r.papAt)}`);
  check('and no longer under the hole in the pier', r.fromBreak > 15,
    `${r.fromBreak} m from the break`);
  /* THE SHOT NOBODY CAN SKIP. */
  check('the escape boat does not run through the rock', r.rockGap > 3,
    `boat at x=${r.boatX}, rock ends at x=${r.boatX - r.rockGap} (${r.rockGap} m)`);
  check('and the ending\'s camera clears it', r.camClear > 0.6,
    `${r.camClear} m over a roof at ${r.topY}`);
  check('and nothing on the rock sticks up into it',
    r.cragCount > 0 && r.cragTop <= r.topY + 0.05,
    `${r.cragCount} crags, highest reaches ${r.cragTop}, roof at ${r.topY}`);
  /* THE WAY IN. */
  check('you can actually swim in through the mouth', r.swamIn,
    `drove forward for ten seconds of game time and stopped at ${JSON.stringify(r.swamEnd)}`);
  /* THE AIR. */
  const dry = (r.tunnelWet || []).filter((q) => !q[1]);
  check('the tunnel is flooded the whole way', dry.length === 0,
    `air at z=${dry.map((q) => q[0]).join(', ')}`);
  check('the chimney has air in it', r.chimneyDry, `eye at ${r.chimneyEye}, water at ${r.waterY}`);
  check('and it gives your breath back', r.chimneyRefills, 'breath did not recover');
  check('the dome has air in it', r.domeDry, 'underwater in the dome');
  check('and it gives your breath back', r.domeRefills, 'breath did not recover');
  check('the chamber itself does not', r.roomWet, 'the chamber has air in it');
  /* THE MACHINE. */
  check('you are under water at the machine', r.atPap, 'not underwater beside it');
  check('and it offers the trade', r.papOffer && r.papOffer.kind === 'pap',
    `${r.papOffer ? r.papOffer.kind + ': ' + r.papOffer.label : 'nothing offered'}`);
  /* THE WALLS. */
  check('the cave does not leak', r.leaks === 0,
    `${r.leaks} of 96 rays left the rock, e.g. ${JSON.stringify(r.leakDirs)}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
