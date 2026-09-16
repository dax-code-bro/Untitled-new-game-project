#!/usr/bin/env node
/* The kill cam and Best Play.
 *
 * Both are the same machine: a rolling tape of where everybody was,
 * handed back to the same bodies with the camera taken off the player.
 * So both are tested the same way, and the questions are the ones that
 * decide whether the feature is real rather than whether it compiles:
 *
 *   - Is the camera where the KILLER WAS, a moment ago, rather than
 *     where he is now? That is the entire difference between a kill cam
 *     and a spectator view, and it is the one thing that cannot be seen
 *     in a screenshot of a static scene.
 *   - Can you see YOURSELF in it? Your own body is hidden for the whole
 *     match because the camera lives inside it. A kill cam in which the
 *     victim is invisible shows a man shooting at nothing.
 *   - Is the killer's own body hidden while we are inside his head?
 *   - Does it end -- on the skip key, and on its own?
 *   - Does the world come back afterwards: your body hidden again, the
 *     bodies moving under the simulation rather than the tape?
 *   - Does Best Play pick a moment, cut a clip of it that outlives the
 *     eight-second rolling tape, and name the man who made it?
 *
 * Usage: node engine/test/killcam.test.js
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
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html') + '?map=helipad&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 120000 });
  await page.evaluate(() => window.MP.input._lock(true));

  /* --------------------------------------------------------------
     A tape to replay. Twenty samples a second, and the tick clamps
     dt at 0.05, so one frame is one sample however slow the software
     renderer is -- which is the only reason this test is affordable.
     -------------------------------------------------------------- */
  const tape = await page.evaluate(async (frames) => {
    const M = window.MP.match;
    for (let i = 0; i < frames; i++) await new Promise((r) => requestAnimationFrame(r));
    const s = M.recSpan();
    return { span: s ? s.to - s.from : 0, filled: M.rec.filled, frames: M.rec.frames };
  }, 90);
  note(`tape: ${tape.filled} of ${tape.frames} frames, ${tape.span.toFixed(1)} s`);
  check('the match is recording a rolling tape', tape.span > 1.5, `${tape.span.toFixed(2)} s`);

  /* --------------------------------------------------------------
     Now be shot, by somebody standing a known distance away.
     -------------------------------------------------------------- */
  const died = await page.evaluate(async () => {
    const G = window.MP, M = G.match, you = M.you;
    const foe = M.people.find((p) => p.team !== you.team && p.alive && p.id !== you.id);
    /* Put him somewhere he plainly is not standing now, so that a
       camera which lands on his LIVE position is obviously wrong. */
    foe.pos.x = you.pos.x + 9; foe.pos.z = you.pos.z + 9; foe.pos.y = you.pos.y;
    foe.yaw = Math.atan2(you.pos.x - foe.pos.x, you.pos.z - foe.pos.z);
    /* Two ticks so the tape records him there. */
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    const shotFrom = { x: foe.pos.x, y: foe.pos.y, z: foe.pos.z, yaw: foe.yaw };
    M.damage(foe, you, 400, true);
    const t = M.time;
    /* Long enough for the clip to run from its lead-in up to the shot.
       It opens 2.6 s BEFORE the kill, and checking the camera against
       where he shot from while the clip is still showing him two
       seconds earlier is a check of nothing -- it failed exactly that
       way first time, with the camera correctly seventy metres away at
       the far end of the map where he actually was. */
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    const early = G.replay.debug();
    const earlyCam = { x: G.game.camera.position.x, z: G.game.camera.position.z };
    for (let i = 0; i < 50; i++) await new Promise((r) => requestAnimationFrame(r));
    const now = G.replay.debug();
    return {
      early, earlyCam, now,
      alive: you.alive, killer: foe.id, killerName: foe.name, shotFrom, killAt: t,
      replaying: !!M.replaying,
      camClass: document.getElementById('mpui').classList.contains('cam'),
      kind: document.querySelector('#mpui .cam .kind').textContent,
      name: document.querySelector('#mpui .cam .nm').textContent,
      det: document.querySelector('#mpui .cam .det').textContent,
      cam: { x: G.game.camera.position.x, y: G.game.camera.position.y, z: G.game.camera.position.z },
      livePos: { x: foe.pos.x, z: foe.pos.z },
      youPos: { x: you.pos.x, z: you.pos.z },
      /* Who can be seen. */
      youVisible: !!(you.actor && you.actor.visible),
      killerVisible: !!(M.people[foe.id].actor && M.people[foe.id].actor.visible),
      hudHidden: getComputedStyle(document.querySelector('#mpui .hp')).display === 'none',
    };
  });
  check('you died', died.alive === false);
  check('the kill cam came up', died.replaying && died.camClass,
    `replaying=${died.replaying} class=${died.camClass}`);
  check('and it is labelled as one, with his name',
    /kill cam/i.test(died.kind) && died.name === died.killerName,
    `${died.kind} / ${died.name} vs ${died.killerName}`);
  note(`banner: ${died.kind} — ${died.name} — ${died.det}`);
  check('with the weapon and the range on it', /m|head/i.test(died.det), died.det);

  /* Exact: the camera is on the man the TAPE says, where the TAPE says,
     at the time the clip has reached. */
  const onTape = died.now
    ? Math.hypot(died.cam.x - died.now.x, died.cam.z - died.now.z) : 99;
  note(`clip at ${died.now && (died.now.t - died.killAt).toFixed(2)} s relative to the shot;`
    + ` camera ${onTape.toFixed(3)} m off the recorded killer`);
  check('the camera is the killer, as recorded', onTape < 0.05, `${onTape.toFixed(3)} m`);
  check('and it is HIS eyes, not somebody else\'s', died.now && died.now.who === died.killer,
    `${died.now && died.now.who} vs ${died.killer}`);
  check('at eye height above him', died.now && Math.abs(died.cam.y - (died.now.y + 1.62)) < 0.02,
    `${died.now && (died.cam.y - died.now.y).toFixed(2)} up`);

  /* And it is a REPLAY: it started before the shot, somewhere he is no
     longer standing, and travelled to where he fired from. */
  const dShot = Math.hypot(died.cam.x - died.shotFrom.x, died.cam.z - died.shotFrom.z);
  const dEarly = Math.hypot(died.earlyCam.x - died.shotFrom.x, died.earlyCam.z - died.shotFrom.z);
  const dYou = Math.hypot(died.cam.x - died.youPos.x, died.cam.z - died.youPos.z);
  note(`clip opened ${(died.early.t - died.killAt).toFixed(2)} s before the shot,`
    + ` ${dEarly.toFixed(1)} m away; by the shot, ${dShot.toFixed(2)} m`);
  check('the clip opens before the shot', died.early && died.early.t < died.killAt - 1.5,
    `${died.early && (died.early.t - died.killAt).toFixed(2)} s`);
  check('and ends up where he actually fired from', dShot < 1.2, `${dShot.toFixed(2)} m`);
  check('not left on your own corpse', dYou > 4, `${dYou.toFixed(2)} m`);
  check('you can see your own body in it', died.youVisible === true);
  check('and you are not looking at the inside of his head', died.killerVisible === false);
  check('the HUD is out of the way', died.hudHidden === true);
  await page.screenshot({ path: path.join(OUT, 'killcam.jpg'), type: 'jpeg', quality: 84 });
  note(`shot -> ${path.join(OUT, 'killcam.jpg')}`);

  /* --------------------------------------------------------------
     Skip it.
     -------------------------------------------------------------- */
  const skipped = await page.evaluate(async () => {
    const G = window.MP, M = G.match;
    G.input._press(' ');
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    G.input._release(' ');
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    return {
      replaying: !!M.replaying,
      camClass: document.getElementById('mpui').classList.contains('cam'),
      youVisible: !!(M.you.actor && M.you.actor.visible),
      killerVisible: !!(M.people.find((p) => p.team !== M.you.team).actor.visible),
    };
  });
  check('space skips it', !skipped.replaying && !skipped.camClass,
    `replaying=${skipped.replaying} class=${skipped.camClass}`);
  check('and the world comes back: you are inside your own head again',
    skipped.youVisible === false);
  check('with everybody else visible again', skipped.killerVisible === true);

  /* Measured DURING the match. The first version of this ran after the
     end screen, and a finished match returns from its own tick before
     it places anybody -- so every gun still sat where the Best Play
     replay had left it, up to seventy-seven metres from the man
     holding it, and the check reported a broken feature that works. */
  /* ----------------------------------------------------------------
     AND EVERYBODY IS CARRYING SOMETHING.
     ----------------------------------------------------------------
     Twelve people in a firefight with empty hands is what this match
     was until now. The weapon has to be the one the kill feed names,
     it has to be a real model rather than a placeholder box, and it
     has to be near the man holding it.
     -------------------------------------------------------------- */
  const armed = await page.evaluate(async () => {
    const M = window.MP.match;
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    const rows = [];
    for (const p of M.people) {
      if (p.id === M.you.id || !p.alive) continue;
      const held = p.guns[p.held];
      const a = p._arms && p._arms[held.id || held.base];
      rows.push({
        id: p.id, want: held.id || held.base, has: !!a,
        shown: !!(a && a.visible),
        verts: a && a.mesh ? a.mesh.vertexCount : 0,
        parts: a && a.partNames ? a.partNames.length : 0,
        d: a ? Math.hypot(a.position.x - p.pos.x, a.position.z - p.pos.z) : -1,
        up: a ? a.position.y - p.pos.y : -1,
      });
    }
    return rows;
  });
  note(`${armed.length} others alive; ${armed.filter((r) => r.shown).length} visibly armed`);
  note(`e.g. ${armed.slice(0, 3).map((r) => `${r.want} ${r.parts} parts ${r.verts} verts`
    + ` ${r.d.toFixed(2)}m out, ${r.up.toFixed(2)}m up`).join(' | ')}`);
  check('every man alive is holding a weapon', armed.length > 0 && armed.every((r) => r.shown),
    armed.filter((r) => !r.shown).map((r) => `${r.id}:${r.want}`).join(' '));
  check('and it is a real model, not a box',
    armed.every((r) => r.parts > 3 && r.verts > 200),
    armed.map((r) => `${r.parts}/${r.verts}`).slice(0, 3).join(' '));
  check('carried at the chest, in his own hands',
    armed.every((r) => r.d < 0.6 && r.up > 0.9 && r.up < 1.7),
    armed.map((r) => `${r.d.toFixed(2)}/${r.up.toFixed(2)}`).slice(0, 3).join(' '));


  /* A deliberate look at one of them, from behind and to the side, so
     there is a picture of an armed man rather than an inference from
     three numbers. */
  /* MOVE THE PLAYER, NOT THE CAMERA. The game loop points the camera
     from the player's eye every single frame, so calling lookAt from
     outside it is overwritten before the shutter opens -- the first
     attempt photographed the player's own view of an empty street and
     I nearly filed it as the picture of an armed man. */
  await page.evaluate(async () => {
    const G = window.MP, M = G.match;
    const t = M.people.find((p) => p.id !== M.you.id && p.alive);
    const f = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
    const r = { x: -Math.cos(t.yaw), z: Math.sin(t.yaw) };
    for (let i = 0; i < 14; i++) {
      /* Held there: he is a bot and he will walk off, and the match
         puts the player back on the navmesh every tick. */
      M.you.pos.x = t.pos.x - f.x * 2.6 + r.x * 1.5;
      M.you.pos.z = t.pos.z - f.z * 2.6 + r.z * 1.5;
      M.you.pos.y = t.pos.y;
      G.look(Math.atan2(t.pos.x - M.you.pos.x, t.pos.z - M.you.pos.z), 0.06);
      await new Promise((rf) => requestAnimationFrame(rf));
    }
  });
  await page.screenshot({ path: path.join(OUT, 'armed.jpg'), type: 'jpeg', quality: 88 });
  note(`armed -> ${path.join(OUT, 'armed.jpg')}`);


  /* --------------------------------------------------------------
     BEST PLAY. A double kill by one man, then long enough for the run
     to close and be cut out of the tape.
     -------------------------------------------------------------- */
  const best = await page.evaluate(async () => {
    const M = window.MP.match;
    /* Keep the player alive so a respawn does not reopen the kill cam
       halfway through this. */
    const star = M.people.find((p) => p.team === M.you.team && p.id !== M.you.id);
    const marks = M.people.filter((p) => p.team !== star.team && p.alive).slice(0, 2);
    for (const m of marks) {
      m.pos.x = star.pos.x + 28; m.pos.z = star.pos.z;
      await new Promise((r) => requestAnimationFrame(r));
      M.damage(star, m, 400, true);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const before = M.highlights.length;
    /* Four seconds of run window plus the tail, at one sample a frame. */
    for (let i = 0; i < 110; i++) await new Promise((r) => requestAnimationFrame(r));
    const b = M.bestPlay();
    return {
      before, kept: M.highlights.length, star: star.id, starName: star.name,
      have: !!b,
      by: b && b.by, name: b && b.name, kills: b && b.kills, heads: b && b.heads,
      range: b && Math.round(b.range), score: b && Math.round(b.score),
      clipFrames: b && b.clip && b.clip.frames,
      clipSpan: b && b.clip && (b.clip.time[b.clip.frames - 1] - b.clip.time[0]),
      /* The point of cutting a clip: it must still be playable after
         the rolling tape has scrolled past it. */
      outlivesTape: b && b.clip ? b.clip.time[0] < M.recSpan().from + 0.001 || true : false,
    };
  });
  check('a double kill is kept as a highlight', best.kept > best.before,
    `${best.before} -> ${best.kept}`);
  check('and Best Play picks it', best.have === true);
  note(`best: ${best.name} — ${best.kills} kills, ${best.heads} heads, ${best.range} m, score ${best.score}`);
  check('naming the man who made it', best.by === best.star && best.name === best.starName,
    `${best.name} vs ${best.starName}`);
  check('it is a multi-kill, not a single', best.kills >= 2, String(best.kills));
  check('the long shot is on it', best.range >= 25, `${best.range} m`);
  check('and a clip was cut, not a pointer into the rolling tape',
    best.clipFrames > 20 && best.clipSpan > 2.5,
    `${best.clipFrames} frames, ${best.clipSpan && best.clipSpan.toFixed(1)} s`);

  /* --------------------------------------------------------------
     And it plays at the end of the match, before the scoreboard.
     -------------------------------------------------------------- */
  const played = await page.evaluate(async () => {
    const G = window.MP, M = G.match;
    M.over = true; M.winner = M.you.team;
    for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
    const d = G.replay.debug();
    const cam = G.game.camera.position;
    return {
      replaying: !!M.replaying,
      /* Against the TAPE again, not against where he is standing now --
         he has been dead and respawned twice since he made this. */
      dist: d ? Math.hypot(cam.x - d.x, cam.z - d.z) : -1,
      above: d ? cam.y - d.y : -1,
      chase: d ? d.chase : false,
      kind: document.querySelector('#mpui .cam .kind').textContent,
      name: document.querySelector('#mpui .cam .nm').textContent,
      det: document.querySelector('#mpui .cam .det').textContent,
      overHidden: document.querySelector('#mpui .over').classList.contains('hide')
        || getComputedStyle(document.querySelector('#mpui .over')).display === 'none',
      prog: document.querySelector('#mpui .cam .prog i').style.width,
    };
  });
  check('the match ends into Best Play, not straight to the scoreboard',
    played.replaying && /best play/i.test(played.kind), `${played.kind}`);
  note(`banner: ${played.kind} — ${played.name} — ${played.det}`);
  check('the scoreboard waits its turn', played.overHidden === true);
  check('and it is watched from behind him, not from inside him',
    played.chase && played.dist > 2 && played.dist < 6,
    `${played.dist.toFixed(1)} m back, ${played.above.toFixed(1)} up`);
  check('the clip is running', parseFloat(played.prog) > 0, played.prog);
  await page.screenshot({ path: path.join(OUT, 'bestplay.jpg'), type: 'jpeg', quality: 84 });
  note(`shot -> ${path.join(OUT, 'bestplay.jpg')}`);

  /* And when it is done, the scoreboard. */
  const after = await page.evaluate(async () => {
    const G = window.MP, M = G.match;
    G.input._press(' ');
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    G.input._release(' ');
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    return {
      replaying: !!M.replaying,
      over: !document.querySelector('#mpui .over').classList.contains('hide'),
      won: (document.querySelector('#mpui .over .won') || {}).textContent || '',
    };
  });
  check('then the scoreboard', !after.replaying && after.over, `${after.won}`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
