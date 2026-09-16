#!/usr/bin/env node
/* Multiplayer, played rather than simulated.
 *
 * mpmatch.test.js proves the rules work with nobody watching. This
 * proves the other half: that a person's keyboard and mouse reach those
 * same rules, that the camera is where the player is, that the HUD says
 * what the match says, and that the thing renders.
 *
 * It drives the REAL input object -- the same one a keyboard feeds --
 * rather than calling the match directly, because a test that bypasses
 * the input layer is a test that would pass with the input layer
 * disconnected, which is exactly the bug worth catching.
 *
 * Usage: node engine/test/mpplay.test.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('needs playwright: npm i --no-save playwright'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.SHOT_DIR || '/tmp';

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
  const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=helipad&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 120000 });
  await page.waitForTimeout(400);

  const up = await page.evaluate(() => {
    const M = window.MP.match;
    return {
      boot: document.getElementById('boot').classList.contains('gone'),
      ui: !!document.getElementById('mpui'),
      people: M.people.length,
      you: M.you.name,
      alive: M.you.alive,
      map: M.mapId, mode: M.mode.id,
      bodies: M.people.filter((p) => !!p.actor).length,
      lock: !document.querySelector('#mpui .lock.hide'),
      gun: document.querySelector('#mpui .gun .nm').textContent,
      hp: document.querySelector('#mpui .hp .n').textContent,
    };
  });
  check('the page builds and hands over', up.boot && up.ui);
  check('twelve people are in the match', up.people === 12, String(up.people));
  check('and every one of them has a body', up.bodies === 12, String(up.bodies));
  check('you are alive on the map you chose',
    up.alive && up.map === 'helipad' && up.mode === 'tdm', `${up.map}/${up.mode}`);
  check('the HUD is showing your gun and your health',
    up.gun.length > 1 && up.hp === '100', `${up.gun} / ${up.hp}`);
  check('it asks for the mouse before it takes it', up.lock === true);
  await page.screenshot({ path: path.join(OUT, 'play-locked.jpg'), type: 'jpeg', quality: 82 });

  /* Take the lock the way a click does, then play. */
  await page.evaluate(() => window.MP.input._lock(true));

  const walked = await page.evaluate(async () => {
    const G = window.MP, M = G.match, p = M.you;
    const from = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    G.input._press('w');
    for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
    G.input._release('w');
    const to = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    const cam = G.game.camera.position;
    return {
      moved: Math.hypot(to.x - from.x, to.z - from.z),
      camNear: Math.hypot(cam.x - to.x, cam.z - to.z),
      camEye: cam.y - to.y,
      y: to.y,
    };
  });
  check('W walks you forward', walked.moved > 3, `${walked.moved.toFixed(1)} m`);
  check('the camera is on your head', walked.camNear < 0.4 && Math.abs(walked.camEye - 1.62) < 0.5,
    `${walked.camNear.toFixed(2)} m away, ${walked.camEye.toFixed(2)} up`);
  check('and you did not sink or fly', Math.abs(walked.y) < 6, String(walked.y.toFixed(2)));

  const looked = await page.evaluate(async () => {
    const G = window.MP;
    const y0 = G.yaw;
    G.input._look(400, 0);
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    const y1 = G.yaw;
    /* And the clamp: you cannot look through your own feet. */
    G.input._look(0, 99999);
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    return { turned: y1 - y0, pitch: G.pitch };
  });
  check('the mouse turns you', Math.abs(looked.turned) > 0.3, String(looked.turned.toFixed(2)));
  check('and the pitch is clamped', looked.pitch <= 1.46, String(looked.pitch.toFixed(2)));

  const shot = await page.evaluate(async () => {
    const G = window.MP, M = G.match, p = M.you;
    const before = p.ammo[p.held];
    G.input.buttons.fire = true;
    for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
    G.input.buttons.fire = false;
    const after = p.ammo[p.held];
    /* And reloading gives it back. */
    G.input._press('r');
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    G.input._release('r');
    const reloading = p.reloadUntil > M.time;
    for (let i = 0; i < 180; i++) await new Promise((r) => requestAnimationFrame(r));
    return { before, after, reloading, full: p.ammo[p.held], mag: p.guns[p.held].mag,
      hudMag: document.querySelector('#mpui .gun .m').textContent };
  });
  check('the trigger empties the magazine', shot.after < shot.before,
    `${shot.before} to ${shot.after}`);
  check('R reloads it', shot.reloading && shot.full > shot.after,
    `${shot.full} of ${shot.mag}`);
  check('and the HUD is reading the same magazine',
    shot.hudMag === String(shot.full), `${shot.hudMag} vs ${shot.full}`);

  const aim = await page.evaluate(async () => {
    const G = window.MP, M = G.match;
    /* Alive, and kept alive. The check runs after a step that holds the
       trigger down in the open for four seconds, so the player is
       routinely dead or dying by the time it looks -- and a dead player
       has no viewmodel to move, which made this fail twice for reasons
       that had nothing to do with aiming. */
    for (let i = 0; i < 60 * 12 && !M.you.alive; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    const realHurt = M.damage;
    M.damage = (from, to, amt, head) => (to === M.you ? 0 : realHurt(from, to, amt, head));
    M.you.hp = 100;
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));

    const hip = document.querySelector('#mpui .cross .up').style.top;
    /* Asked of the viewmodel itself rather than reverse-engineered from
       where the gun ended up in the world: the same offset lands at a
       different world x depending which way you are facing. */
    const sHip = Object.assign({}, G.viewmodel.state);
    G.input.buttons.aim = true;
    for (let i = 0; i < 14; i++) await new Promise((r) => requestAnimationFrame(r));
    const ads = document.querySelector('#mpui .cross .up').style.top;
    const sAds = Object.assign({}, G.viewmodel.state);
    G.input.buttons.aim = false;
    for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
    M.damage = realHurt;
    return {
      hip, ads, alive: M.you.alive, placed: sAds.placed > sHip.placed,
      aimFlag: sHip.aim === 0 && sAds.aim === 1,
      moved: Math.abs(sAds.ox - sHip.ox) > 0.05,
      lifted: sAds.oy > sHip.oy,
      sHip, sAds,
    };
  });

  check('aiming tightens the crosshair', aim.hip !== aim.ads, `${aim.hip} -> ${aim.ads}`);
  check('the viewmodel is being placed every frame', aim.placed);
  check('and the aim flag reaches it', aim.aimFlag,
    `${aim.sHip.aim} -> ${aim.sAds.aim}`);
  check('and brings the gun onto the centre line', aim.moved,
    `x ${aim.sHip.ox.toFixed(3)} -> ${aim.sAds.ox.toFixed(3)}`);
  check('and lifts the sights to the crosshair', aim.lifted,
    `y ${aim.sHip.oy.toFixed(3)} -> ${aim.sAds.oy.toFixed(3)}`);
  await page.screenshot({ path: path.join(OUT, 'play-hipfire.jpg'), type: 'jpeg', quality: 82 });

  await page.evaluate(async () => {
    window.MP.input.buttons.aim = true;
    for (let i = 0; i < 14; i++) await new Promise((r) => requestAnimationFrame(r));
  });
  await page.screenshot({ path: path.join(OUT, 'play-ads.jpg'), type: 'jpeg', quality: 82 });
  await page.evaluate(() => { window.MP.input.buttons.aim = false; });

  /* Let the match run so the feed and the score have something in them. */
  const ran = await page.evaluate(async () => {
    const M = window.MP.match;
    const t0 = M.time;
    for (let i = 0; i < 60 * 25; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (M.score.a + M.score.b > 6) break;
    }
    return { dt: M.time - t0, score: M.score, kills: M.events.filter((e) => e.kind === 'kill').length,
      feed: document.querySelectorAll('#mpui .feed div').length,
      top: document.querySelector('#mpui .top .us').textContent };
  });
  check('the match runs while you play it', ran.kills > 0,
    `${ran.kills} kills in ${ran.dt.toFixed(0)}s`);
  check('the killfeed fills', ran.feed > 0, String(ran.feed));
  check('the score on the HUD is the score in the match',
    ran.top === String(ran.score.a), `${ran.top} vs ${ran.score.a}`);
  await page.screenshot({ path: path.join(OUT, 'play-running.jpg'), type: 'jpeg', quality: 82 });

  const board = await page.evaluate(async () => {
    window.MP.input._press('tab');
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    const rows = document.querySelectorAll('#mpui .board table tr').length;
    return { shown: !document.querySelector('#mpui .board').classList.contains('hide'), rows };
  });
  check('Tab shows a scoreboard with everybody on it', board.shown && board.rows === 13,
    `${board.rows} rows`);
  await page.screenshot({ path: path.join(OUT, 'play-scores.jpg'), type: 'jpeg', quality: 82 });
  await page.evaluate(() => window.MP.input._release('tab'));

  /* Being killed has to produce the death screen and then put you back. */
  const died = await page.evaluate(async () => {
    const M = window.MP.match, p = M.you;
    const killer = M.people.filter((q) => q.team !== p.team)[0];
    M.damage(killer, p, 500, false);
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    const shown = !document.querySelector('#mpui .dead').classList.contains('hide');
    const by = document.querySelector('#mpui .dead .by').textContent;
    const deaths = p.deaths;
    for (let i = 0; i < 60 * 8; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (p.alive) break;
    }
    return { shown, by, deaths, backUp: p.alive, hp: p.hp };
  });
  check('dying shows who did it', died.shown && /killed by/i.test(died.by), died.by);
  check('and you come back with full health', died.backUp && died.hp > 95,
    `${died.backUp} at ${Math.round(died.hp)}`);
  await page.screenshot({ path: path.join(OUT, 'play-dead.jpg'), type: 'jpeg', quality: 82 });

  /* And the picture is actually a picture. */
  const lit = await page.evaluate(() => {
    const c = document.querySelector('#game');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    return !!g;
  });
  check('there is a live GL context', lit);

  /* ================================================================
     WHICH WAY IS RIGHT
     ================================================================
     Three separate bug reports -- "left is right and right is left",
     "my gun doesn't come up, it's invisible", and strafing that went
     the wrong way -- were one sign. The engine is a standard
     right-handed system and this game points the camera along +Z, so
     the player's right hand is at MINUS X; every yaw formula assumed
     plus. Rendered proof at the time: a box at x = +3, four metres
     ahead, drew on the left of the screen.

     None of it is arguable and none of it should ever be argued again,
     so it is measured by projecting a known point through the real
     camera rather than by reasoning about cross products. */
  const hand = await page.evaluate(() => {
    const G = window.MP.game, M = window.MP.match, me = M.you;
    me.pos.x = 0; me.pos.z = 0; me.yaw = 0;
    window.MP.look(0, 0);
    for (let i = 0; i < 3; i++) G.step(1 / 60);
    /* Project a point three metres to the player's RIGHT. With yaw 0
       and forward +Z, that is x = -3. It must land on the right half
       of the screen. */
    const cam = G.camera;
    const vp = cam.viewProjection || cam.viewProj || null;
    const project = (x, y, z) => {
      if (!vp) return null;
      const e = vp.e || vp;
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      return (e[0] * x + e[4] * y + e[8] * z + e[12]) / (w || 1);
    };
    return { rightNdc: project(-3, 1.6, 8), leftNdc: project(3, 1.6, 8), has: !!vp };
  });
  if (!hand.has) check('the camera exposes a view-projection to test with', false);
  else {
    console.log(`  .. ndc x: the player's right lands at ${hand.rightNdc.toFixed(2)}, their left at ${hand.leftNdc.toFixed(2)}`);
    check("a point on the player's right renders on the right of the screen",
      hand.rightNdc > 0.05, `ndc x ${hand.rightNdc.toFixed(3)}`);
    check("and a point on their left renders on the left",
      hand.leftNdc < -0.05, `ndc x ${hand.leftNdc.toFixed(3)}`);
  }

  /* The gun is held on the right hand side and ON SCREEN. */
  const held = await page.evaluate(() => {
    const vm = window.MP.viewmodel, G = window.MP.game, M = window.MP.match;
    /* Alive first. The viewmodel is hidden on death, correctly, and a
       check that runs on a dead player reports the gun invisible and
       means nothing by it. */
    M.you.alive = true; M.you.hp = 100;
    for (let i = 0; i < 3; i++) G.step(1 / 60);
    const g = vm && vm.gun;
    if (!g) return { err: 'no gun model at all' };
    const cam = G.camera, vp = cam.viewProjection || cam.viewProj;
    const e = (vp && (vp.e || vp)) || null;
    if (!e) return { err: 'no view projection' };
    const x = g.position.x, y = g.position.y, z = g.position.z;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    return {
      ndcX: (e[0] * x + e[4] * y + e[8] * z + e[12]) / (w || 1),
      ndcY: (e[1] * x + e[5] * y + e[9] * z + e[13]) / (w || 1),
      depth: w, visible: g.visible !== false, verts: g.mesh ? g.mesh.vertexCount : 0,
    };
  });
  if (held.err) check('the gun is a real model in the hand', false, held.err);
  else {
    console.log(`  .. gun at ndc ${held.ndcX.toFixed(2)},${held.ndcY.toFixed(2)} depth ${held.depth.toFixed(2)}, ${held.verts} verts`);
    check('the gun is a real model, not a handful of boxes', held.verts > 400, `${held.verts} verts`);
    check('it is visible', held.visible);
    check('it is IN FRONT of the camera', held.depth > 0, `depth ${held.depth.toFixed(2)}`);
    check('it is on the right-hand side of the screen', held.ndcX > 0, `ndc x ${held.ndcX.toFixed(3)}`);
    check('and it is actually on screen', Math.abs(held.ndcX) < 1 && Math.abs(held.ndcY) < 1,
      `${held.ndcX.toFixed(2)},${held.ndcY.toFixed(2)}`);
  }

  /* ----------------------------------------------------------------
     WHICH WAY IS EVERYBODY POINTING?
     ----------------------------------------------------------------
     The engine takes a character's facing from controller.facing and
     nothing else -- a capsule has its rotation locked so it cannot
     topple, so the rigid body's quaternion is always identity and
     carries no facing at all. The match was setting actor.rotation,
     which nothing reads, and controller.facing is only advanced by the
     controller's own steering, which a teleported body never runs.

     Every man in the match therefore pointed due north for the whole
     of it, however he was moving or shooting. Nothing in the old tests
     could catch that, because everything else about him was right.
     -------------------------------------------------------------- */
  const facing = await page.evaluate(async () => {
    const M = window.MP.match;
    for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
    const rows = M.people.filter((p) => p.alive && p.actor && p.actor.controller)
      .map((p) => ({ id: p.id, yaw: p.yaw, facing: p.actor.controller.facing }));
    const err = (r) => {
      let d = r.facing - r.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d);
    };
    return { n: rows.length, worst: Math.max(...rows.map(err)),
      spread: Math.max(...rows.map((r) => r.facing)) - Math.min(...rows.map((r) => r.facing)) };
  });
  console.log(`  .. ${facing.n} bodies, worst facing error ${(facing.worst * 57.3).toFixed(1)}deg,`
    + ` ${(facing.spread * 57.3).toFixed(0)}deg apart from each other`);
  check('every body points where its man is looking', facing.worst < 0.02,
    `${(facing.worst * 57.3).toFixed(1)}deg out`);
  check('and they are not all facing the same way', facing.spread > 0.5,
    `${(facing.spread * 57.3).toFixed(0)}deg apart`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n  shots in ${OUT}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
